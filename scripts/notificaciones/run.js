'use strict';
/* ================================================================
   scripts/notificaciones/run.js
   ================================================================
   Reemplaza al enfoque de Cloud Function que se intentó primero (ese
   código ya no existe en el repo) — misma lógica, distinto lugar donde
   corre. Se ejecuta desde GitHub Actions (.github/workflows/notificaciones.yml)
   en vez de Cloud Scheduler, porque desplegar una Cloud Function
   programada requiere el plan Blaze de Firebase pase lo que pase, y
   GitHub Actions no necesita ninguna tarjeta ni plan de pago para esto.

   checks.js (al lado de este archivo, en esta misma carpeta) es el
   registro extensible de chequeos de vencimiento. La única diferencia
   real entre correr esto acá vs. en una Cloud Function es CÓMO se
   autentica contra Firestore:
     - Cloud Function (enfoque abandonado): admin.initializeApp() sin
       argumentos, usa credenciales automáticas del propio proyecto.
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

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

      console.log(`uid=${uid}: ${items.length} item(s), mandando uno por uno...`);
      const tokensInvalidos = new Set();

      // Un push POR ITEM (no uno solo con todo junto), sin `tag` — así el
      // navegador los apila como notificaciones separadas en vez de
      // reemplazarse entre sí. Pausa aleatoria entre cada uno para que no
      // lleguen los tres en el mismo instante exacto.
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const title = item.tipo === 'red' ? '⚠️ Mis Finanzas' : 'Mis Finanzas';

        const message = {
          tokens,
          notification: { title, body: item.texto },
          webpush: {
            notification: {
              icon: 'https://drlight09.github.io/mis-finanzas/icons/icon-192.png',
            },
            fcmOptions: { link: '/mis-finanzas/' },
          },
        };

        const resp = await admin.messaging().sendEachForMulticast(message);
        console.log(`  [${i + 1}/${items.length}] "${item.texto}" — ${resp.successCount}/${tokens.length} tokens ok`);

        resp.responses.forEach((r, j) => {
          const code = r.error && r.error.code;
          if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) {
            tokensInvalidos.add(tokens[j]);
          }
        });

        if (i < items.length - 1) {
          const pausaMs = 5000 + Math.floor(Math.random() * 25000); // 5-30s
          await esperar(pausaMs);
        }
      }

      // Limpieza de tokens muertos, igual que en la versión Cloud Function.
      if (tokensInvalidos.size) {
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
