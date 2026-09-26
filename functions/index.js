/* ================================================================
   functions/index.js
   ================================================================
   Cloud Function programada (Cloud Scheduler vía firebase-functions
   v2) que corre todos los días al mediodía hora Colombia, revisa el
   estado guardado en Firestore de cada usuario con los chequeos de
   checks.js, y manda un push por FCM si hay algo que avisar.

   Corre en el plan gratuito (Spark) de Firebase: llamar a la API de
   envío de FCM desde una Cloud Function es una llamada a una API de
   Google, permitida sin importar el plan de facturación.

   Estructura de Firestore que asume (ver firebase-sync.js):
     usuarios/{uid}/data/finanzas       → { payload: '<JSON de S>', updatedAt }
     usuarios/{uid}/data/notificaciones → { fcmTokens: [token, ...] }
                                           (este segundo documento lo crea
                                           js/core/notificaciones-push.js
                                           la primera vez que el usuario
                                           activa notificaciones)

   Recorre TODOS los documentos de la colección `usuarios` (no asume un
   único uid fijo) — hoy solo hay un usuario real, pero así queda listo
   si algún día hay más de uno sin tener que tocar este archivo.
   ================================================================ */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { ejecutarChecks } = require('./checks');

admin.initializeApp();
const db = admin.firestore();

// Colombia no tiene horario de verano (offset fijo UTC-5), pero se usa
// Intl.DateTimeFormat en vez de hardcodear el offset — si Cloud Functions
// corre en otra zona horaria por defecto no importa, esto siempre da la
// fecha correcta en America/Bogota.
function hoyBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date()); // formato 'en-CA' da YYYY-MM-DD directo
}

exports.chequeoDiarioNotificaciones = onSchedule(
  {
    schedule: '0 12 * * *',
    timeZone: 'America/Bogota',
    region: 'us-central1',
  },
  async () => {
    const hoyStr = hoyBogota();
    const usuariosSnap = await db.collection('usuarios').get();

    for (const usuarioDoc of usuariosSnap.docs) {
      const uid = usuarioDoc.id;
      try {
        const [finanzasSnap, notifSnap] = await Promise.all([
          db.collection('usuarios').doc(uid).collection('data').doc('finanzas').get(),
          db.collection('usuarios').doc(uid).collection('data').doc('notificaciones').get(),
        ]);

        if (!finanzasSnap.exists) continue;
        const tokens = notifSnap.exists ? notifSnap.data().fcmTokens || [] : [];
        if (!tokens.length) continue;

        const S = JSON.parse(finanzasSnap.data().payload);
        const items = ejecutarChecks(S, hoyStr);
        if (!items.length) continue;

        const hayRojo = items.some((i) => i.tipo === 'red');
        const title = hayRojo ? '⚠️ Mis Finanzas' : 'Mis Finanzas';
        const body = items.length === 1 ? items[0].texto : `${items.length} cosas necesitan tu atención`;

        const message = {
          tokens,
          notification: { title, body },
          webpush: {
            notification: {
              body: items.map((i) => i.texto).join('\n'),
              // Ajustar si tu ícono vive en otra ruta dentro del manifest.
              icon: '/mis-finanzas/icons/icon-192.png',
            },
            fcmOptions: { link: '/mis-finanzas/' },
          },
        };

        const resp = await admin.messaging().sendEachForMulticast(message);

        // Limpieza de tokens muertos (desinstaló la app, borró datos del
        // navegador, etc.) — sin esto la lista de tokens solo crece.
        const tokensInvalidos = [];
        resp.responses.forEach((r, i) => {
          const code = r.error && r.error.code;
          if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) {
            tokensInvalidos.push(tokens[i]);
          }
        });
        if (tokensInvalidos.length) {
          await db
            .collection('usuarios')
            .doc(uid)
            .collection('data')
            .doc('notificaciones')
            .update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensInvalidos) });
        }

        logger.info(`Notificación enviada a uid=${uid}: ${items.length} item(s), ${resp.successCount}/${tokens.length} tokens ok`);
      } catch (e) {
        logger.error(`Error procesando notificaciones para uid=${uid}:`, e);
      }
    }
  }
);
