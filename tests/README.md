# Tests unitarios — funciones de cálculo puras

Cubre, corridas contra el código real de la app (sin copiarlo ni
modificarlo, usando `vm` para simular cómo el navegador carga
`<script defer>` clásicos — ver `tests/support/load-app.js`):

- `calcPatrimonioTotal()` — `js/core/core-state.js`
- `calcHealthScore()` — `js/modules/inicio.js`
- `calcC()`/`calcCDT()` (interés compuesto real de Nu, por tramos de
  tasa, redondeo de CDT) — `js/modules/cuentas.js`
- `totalPrestadoPendiente()`/`getDeudorSaldoPatrimonio()`/
  `totalMisDeudasPendiente()` — `js/modules/prestado.js`

**35 tests, los 35 pasan** contra tus archivos reales (confirmado acá
antes de entregarte esto, no es teoría).

## Cómo correrlos

Copiá la carpeta `tests/` completa (este archivo incluido — vive ahí
adentro a propósito, no en la raíz del repo, para no pisar ni competir
con el README real del proyecto) y `package.json` a la raíz del repo,
junto a `js/`. Después:

```bash
npm test
```

Sin instalar nada — usa el test runner nativo de Node (`node --test`,
Node 18+), cero dependencias, en línea con la arquitectura sin build tool
de la app.

Si tu estructura de carpetas no es `js/core/` y `js/modules/` desde la
raíz del repo, ajustá con variables de entorno en vez de tocar los tests:

```bash
MIS_FINANZAS_CORE_DIR=./ruta/a/core MIS_FINANZAS_MODULES_DIR=./ruta/a/modules npm test
```

## Dos modos de carga (importante si agregás más tests)

`loadApp(files, { permissive })` tiene dos modos, ver comentarios en
`tests/support/load-app.js`:

- **`permissive: false` (default)** — usado por `calcPatrimonioTotal.test.js`
  y `calcHealthScore.test.js`. Cualquier función no cargada da
  `ReferenceError`/`undefined` de verdad — así se prueban los *guards*
  (`typeof calcC==='function'`) que protegen `calcPatrimonioTotal()` de
  que Cuentas/Préstamos sean lazy.
- **`permissive: true`** — usado por `calcC-calcCDT.test.js` y
  `totalPrestadoPendiente.test.js`, que cargan `cuentas.js`/`prestado.js`
  reales. Esos archivos referencian funciones de UI de otros core (
  `openSheet`/`toast`/`dialogo`, viven en `sheet-stack.js`/`events.js`,
  no incluidos acá) a nivel de módulo — permissive las deja caer a
  no-op. **Ojo:** en este modo, `typeof cualquierCosa==='function'`
  siempre da `true` (el fallback fabrica una función para todo), así
  que si escribís un test que mezcla `permissive:true` con un guard que
  depende de que algo NO exista, vas a contaminar el resultado con
  `NaN`/`undefined` en silencio — cargá el módulo real en vez de confiar
  en el guard cuando estés en este modo.

## GitHub Action (corre solo en cada push)

`.github/workflows/test.yml` corre `npm test` automáticamente en cada
`push` y cada pull request — no es un cronjob, es un gatillo por evento.
No toca el deploy de GitHub Pages (eso lo sigue manejando la
configuración de Pages por separado). Gratis para un repo de un solo
usuario, muy por debajo del límite de minutos gratuitos de GitHub.

No hace falta configurar nada — al copiar esta carpeta a la raíz del
repo (junto con `tests/` y `package.json`) y hacer push, ya queda activo.
Vas a ver el resultado (✅/❌) en la pestaña "Actions" del repo en GitHub,
y como check en cada commit/PR.

## Qué NO cubre (todavía)

- **Amortización** — **confirmado que no existe en este proyecto.**
  Revisé `core-state.js`, `calc-helpers.js`, `inicio.js`, `cuentas.js` y
  `prestado.js`: ninguno tiene lógica de amortización francesa, cuota
  fija ni tasa mensual. `prestamo_jfk_tracker.html` es un proyecto
  aparte — no aplica acá. Si esta línea sigue en `auditoria-tecnica.md`
  bajo "Sin tests", probablemente valga la pena borrarla o aclarar que
  no aplica a `mis-finanzas`.

