'use strict';
/* ================================================================
   scripts/notificaciones/run.js
   ================================================================
   Reemplaza a la Cloud Function (functions/index.js) — misma lógica,
   distinto lugar donde corre. Se ejecuta desde GitHub Actions
   (.github/workflows/notificaciones.yml) en vez de Cloud Scheduler,
   porque desplegar una Cloud Function programada requiere el plan
   Blaze de Firebase pase lo que pase, y GitHub Actions no necesita
   ninguna tarjeta ni plan de pago para esto.

   checks.js NO cambió — es una copia exacta del que vive en
   functions/checks.js. La única diferencia real entre las dos
   versiones es CÓMO se autentica contra Firestore:
     - Cloud Function: admin.initializeApp() sin argumentos, usa
       credenciales automáticas del propio proyecto de Firebase.
     - Este script: corre fuera de Firebase, así que necesita una
       cuenta de servicio explícita (ver README.md de esta carpeta
       para cómo generarla y guardarla como secret de GitHub).

   Estructura de Firestore que asume (igual que antes):
     usuarios/{uid}/data/finanzas       → { payload: '<JSON de S>', updatedAt }
     usuarios/{uid}/data/notificaciones → { fcmTokens: [token, ...] }
   ================================================================ */

const admin = require('firebase-admin');
const { ejecutarChecks } = require('./checks');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Colombia no tiene horario de verano (offset fijo UTC-5), pero se usa
// Intl.DateTimeFormat en vez de hardcodear el offset por las dudas.
function hoyBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date()); // formato 'en-CA' da YYYY-MM-DD directo
}

async function main() {
  const hoyStr = hoyBogota();
  console.log(`Chequeo de notificaciones — hoy=${hoyStr}`);
  // listDocuments() (no .get()) porque usuarios/{uid} nunca se crea como
  // documento con campos propios — solo existe como "padre" de la
  // subcolección usuarios/{uid}/data/. Con .get() esos uids no cuentan
  // como documentos reales y la colección aparece vacía aunque la
  // consola de Firebase sí los liste (ver README de esta carpeta).
  const usuariosRefs = await db.collection('usuarios').listDocuments();
  console.log(`usuarios encontrados: ${usuariosRefs.length}`);

  for (const usuarioRef of usuariosRefs) {
    const uid = usuarioRef.id;
    try {
      const [finanzasSnap, notifSnap] = await Promise.all([
        db.collection('usuarios').doc(uid).collection('data').doc('finanzas').get(),
        db.collection('usuarios').doc(uid).collection('data').doc('notificaciones').get(),
      ]);

      if (!finanzasSnap.exists) {
        console.log(`uid=${uid}: no tiene documento data/finanzas, se salta`);
        continue;
      }
      const tokens = notifSnap.exists ? notifSnap.data().fcmTokens || [] : [];
      if (!tokens.length) {
        console.log(`uid=${uid}: sin tokens registrados, se salta`);
        continue;
      }

      const S = JSON.parse(finanzasSnap.data().payload);
      const items = ejecutarChecks(S, hoyStr);
      if (!items.length) {
        console.log(`uid=${uid}: nada que avisar hoy`);
        continue;
      }

      const hayRojo = items.some((i) => i.tipo === 'red');
      const title = hayRojo ? '⚠️ Mis Finanzas' : 'Mis Finanzas';
      const body = items.length === 1 ? items[0].texto : `${items.length} cosas necesitan tu atención`;

      const message = {
        tokens,
        notification: { title, body },
        webpush: {
          notification: {
            body: items.map((i) => i.texto).join('\n'),
            icon: '/mis-finanzas/icons/icon-192.png', // ajustar si tu ícono vive en otra ruta
          },
          fcmOptions: { link: '/mis-finanzas/' },
        },
      };

      const resp = await admin.messaging().sendEachForMulticast(message);
      console.log(`uid=${uid}: ${items.length} item(s), ${resp.successCount}/${tokens.length} tokens ok`);

      // Limpieza de tokens muertos, igual que en la versión Cloud Function.
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
    } catch (e) {
      console.error(`Error procesando uid=${uid}:`, e);
    }
  }
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exitCode = 1; // marca el job como fallido sin forzar el exit
});
