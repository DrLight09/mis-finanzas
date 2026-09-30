# Notificaciones push vía GitHub Actions (reemplaza a la Cloud Function)

No usa Cloud Functions ni requiere el plan Blaze — corre como un job
programado de GitHub Actions, igual que ya corren tus tests.

## Qué va dónde

| Archivo acá | Va en tu repo en |
|---|---|
| `scripts-notificaciones/checks.js` | `scripts/notificaciones/checks.js` |
| `scripts-notificaciones/run.js` | `scripts/notificaciones/run.js` |
| `scripts-notificaciones/package.json` | `scripts/notificaciones/package.json` |
| `github-workflows/notificaciones.yml` | `.github/workflows/notificaciones.yml` |

(Si ya tenías una carpeta `functions/` de cuando intentamos con Cloud
Functions, puedes borrarla — no hace falta desplegarla a ningún lado.)

## Pasos

1. **Generar la cuenta de servicio** (gratis, sin tarjeta): Firebase
   console → ícono de engranaje → Configuración del proyecto →
   pestaña "Cuentas de servicio" → botón "Generar nueva clave
   privada". Descarga un archivo `.json` — **guárdalo, no lo subas al
   repo**.
2. **Crear el secret en GitHub**: en tu repo → Settings → Secrets and
   variables → Actions → "New repository secret" → nombre:
   `FIREBASE_SERVICE_ACCOUNT_KEY` → en el valor, pega el contenido
   completo del archivo `.json` del paso 1 (ábrelo con el Bloc de
   notas, copia todo, pégalo tal cual).
3. **Copiar los 4 archivos** de la tabla de arriba a esas rutas en tu
   repo.
4. **Hacer commit y push.** Con eso el workflow ya queda activo.
5. **Probar sin esperar al mediodía**: pestaña "Actions" de tu repo en
   GitHub → en la lista de la izquierda, "Notificaciones diarias" →
   botón "Run workflow" → Run workflow. Se ejecuta al toque.
6. Revisa el resultado ahí mismo (clic en la corrida → clic en el paso
   "Correr el chequeo de notificaciones") — vas a ver los mismos logs
   que hubieras visto en Firebase (`uid=...: N item(s), M/T tokens
   ok`, o `nada que avisar hoy` si no hay nada vencido en ese momento).

## Para ver la notificación de verdad

Igual que antes: edita manualmente en Firestore una fecha que dispare
alguno de los 3 chequeos (ej. un CDT que venza mañana), corré el
workflow a mano (paso 5), y con el celular con la app cerrada del todo
deberías recibir el push del sistema.

## Notas

- El secret `FIREBASE_SERVICE_ACCOUNT_KEY` nunca aparece en los logs
  de GitHub Actions (los secrets se enmascaran automáticamente), y
  solo vos (con permisos de administrador del repo) puedes verlo/
  editarlo — ni siquiera se puede volver a leer una vez guardado,
  solo reemplazar.
- Si `checks.js` cambia en el futuro (agregás un chequeo nuevo), se
  edita en `scripts/notificaciones/checks.js` — es el mismo patrón de
  registro extensible (`CHECKS`) que ya tenías.
- El cron de GitHub Actions es "mejor esfuerzo": en momentos de mucha
  carga en GitHub puede atrasarse algunos minutos respecto al horario
  exacto. Para un aviso diario esto no importa.
