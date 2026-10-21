# Tests unitarios — funciones de cálculo puras

Cubre, corridas contra el código real de la app (sin copiarlo ni
modificarlo, usando `vm` para simular cómo el navegador carga
`<script defer>` clásicos — ver `tests/support/load-app.js`):

- `calcPatrimonioTotal()` — `js/core/core-state.js`
- `calcHealthScore()` — `js/modules/inicio.js`
- `calcC()`/`calcCDT()` (interés compuesto real de Nu, por tramos de
  tasa, redondeo de CDT) — `js/core/nu-calc.js`
- `Periodo` (ingresos, gastos y balance de un mes: la única definición para
  Inicio, Análisis, cierre de mes, CSV y Wrapped) — `js/core/periodo.js`
- `aplicarMigraciones()` / `S.schemaVersion` — `js/core/core-state.js`
- `Deudas` (capa de acceso a Me deben / Yo debo), `totalPrestadoPendiente()`/
  `totalMisDeudasPendiente()` — `js/core/calc-helpers.js`
- Tasa única de Nu (`S.nuRate`, CDT con tasa propia), acciones de Nu que dependen de la tasa y de las cajitas, Chequeo rápido por
  cajita (un día completo de intereses), reloj de intereses al primer depósito, retiros sin saldo e iconos/colores de "Nueva cuenta"
  — `js/core/nu-calc.js`, `js/modules/cuentas.js`, `js/core/color-picker.js` (`tests/cuentas.test.js`)
- Estructura Cuentas/Nu (`cuentas-nu-archivos`: cada archivo carga solo, botones registrados, ningún test carga `cuentas.js` sin `nu.js`)
- Textos y toast de las cuentas (`cuentas-textos`), campo de tasa numérico, Chequeo rápido con encargos (total de Nu) y `toast()` por tipo (`nucleo.test.js` → `toast`)
- Esquema 9 sin migraciones (mecanismo vacío), estado de Spotify (`S.spotify`), validación de backups al importar (rechaza los de esquemas anteriores) y la guardia `archivos-cargados` (todo archivo de `js/core` y `js/modules`
  llega al navegador por un `<script>`, un grupo lazy o un `import`) — `tests/nucleo.test.js`
- Me deben (registrar con `_aplicarMovimiento`, revertir con `_revertirMovDeudor`) y Yo debo (pago dividido, perdón, pago de más, pago con tarjeta) y
  `registrarMovEspejo()`/`borrarMovEspejo()` — `js/modules/prestado.js`,
  `js/core/cuenta-efectos.js`

Corren contra tus archivos reales, sin copiarlos.

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

## Orden de carga del núcleo (2026-10-08)

Todo test que cargue `core-state.js` debe cargar también `periodo.js` y
`nu-calc.js`, en el mismo orden que `index.html`:
`core-state.js` → `periodo.js` → `nu-calc.js` → `calc-helpers.js` → `cuenta-efectos.js` → módulos.
`calcPatrimonioTotal()` llama a `calcC`/`calcCDT` (nu-calc.js) sin guards,
`_getCuotaAnio()` (calc-helpers.js) delega en `Periodo.cuotaMesada`, y Inicio,
Análisis y Wrapped leen el mes de `Periodo`. Sin ellos: `ReferenceError` en modo
estricto, o resultados en silencio en modo `permissive`.
`Periodo` también se expone como `window.Periodo` (un `const` de nivel superior
no es propiedad del contexto), así que los tests lo leen como `ctx.Periodo`.

## Cargar `calc-helpers.js` cuando el archivo bajo test lo use (2026-09-20)

`Deudas` y sus envoltorios `getDeudorSaldo()`/`getMiDeudaSaldo()`/`totalPrestadoPendiente()`/`totalMisDeudasPendiente()` (Préstamos) y `spNombreDe()/`spPersonaPagadaVigente()`
(Spotify) viven ahora en `js/core/calc-helpers.js`, no en `prestado.js`/
`spotify.js`, igual que las funciones puras de Mesada y Tarjetas. Si un test
carga `prestado.js` o `spotify.js` y ejercita algo que las llama (por ejemplo
`totalPrestadoPendiente()`), tiene que cargar también `calc-helpers.js`, en el
mismo orden que `index.html`: `core-state.js` → `cuenta-efectos.js` → `calc-helpers.js` → módulo. `prestado.js` y `mesada.js` además necesitan `cuenta-efectos.js` (movimiento espejo en cuentas) para registrar o revertir movimientos.

Ojo en modo `permissive`: no falla con un error, **da resultados en silencio**
(la función faltante cae a un no-op que devuelve `undefined`, y
`totalPrestadoPendiente()` da 0). Así fue como falló en CI
`totalPrestadoPendiente.test.js` — ver `CHANGELOG.md#infraestructura--seguridad`.

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


## Cuentas y Nu son dos archivos (2026-10-17; frontera limpia 2026-10-18)

`js/modules/cuentas.js` (capa genérica de cuentas) y `js/modules/nu.js` (todo lo de Nu) forman el grupo lazy `cuentas`. **La dependencia va en un solo sentido: Nu usa a Cuentas, Cuentas no nombra nada de Nu.** Nu se le presenta a `cuentas.js` registrándose en `CuentaPantallas` (`core-state.js`) al cargar. **Todo test que cargue `cuentas.js` tiene que cargar también `nu.js`**: `modulo('nu.js'), modulo('cuentas.js')` (el orden no importa), porque sin `nu.js` Cuentas no tiene pantalla de Nu. En modo `permissive` su falta no da error: da resultados distintos en silencio. La guardia `cuentas-nu-archivos` de `cuentas.test.js` comprueba la carga, que `cuentas.js` no use nada de `nu.js` y la lista exacta de lo que Nu toma de Cuentas.

## Prueba de humo con la página real (2026-10-18)

`scripts/smoke-browser.js` NO vive en la carpeta de tests a propósito: `node --test` ejecuta todo `.js` que encuentra ahí, y esto necesita una dependencia de desarrollo (jsdom, ya en `devDependencies` de `package.json`; **hay que quedarse en la 27**: la 28 en adelante quitó `ResourceLoader`, y el `^27.4.0` del `package.json` lo respeta), así que el CI lo contaba como un test roto. Carga `index.html` y todos sus `<script>` en jsdom, carga todos los grupos lazy y hace tres cosas:

1. **Toca cada botón `data-action` del DOM** e informa los que no tienen handler registrado y los que lanzan una excepción.
2. **Escenarios con datos:** Cuentas/Nu (una cajita con un CDT) y Spotify (un integrante y un cobro en `S.spotify`; pinta la pantalla y toca sus botones). Cuentas/Nu: navega selector → Nu → cajita → volver → Nequi, comprueba qué panel queda visible y que `_cajitaActualId` se reinicie, y toca todos los botones que cada pantalla genera.

3. **Mapa de acciones de TODO el proyecto:** compara cada acción `ns:nombre` que nombran `index.html` y los `.js` (en `data-action`, en `Events.attr` o guardada en una variable) con las que `Events.registerAll`/`Events.on` registraron de verdad al cargar la página. Informa las usadas sin registrar, las registradas que nadie nombra (código muerto) y las registradas dos veces. Sale con código 1 si hay una usada sin registrar, una duplicada o un fallo de la fase 2.

```bash
npm install            # una vez: instala jsdom
npm run smoke          # o: node scripts/smoke-browser.js [--verbose]
```

Resultado esperado hoy: fase 2 con **0 fallos** y fase 3 con **0 usadas sin registrar, 0 sin usar y 0 duplicadas** (207 acciones usadas, 196 registradas en tiempo de ejecución, 11 más de `authgate`/`pin` que viven en módulos ES y no se pueden verificar aquí). Las líneas de la fase 1 que siempre aparecen son de entorno, no de la app: `authgate:*` y `pin:*` los registran módulos ES (`firebase-init.js`, `pin-bio.js`) que jsdom no ejecuta, y `config:signOut` / `config:abrirEliminarCuenta` dependen de ellos. Comprobado por mutación: sin registrar Nu o con un botón apuntando a una acción inexistente, la prueba falla. **No sustituye abrir la app en un navegador real** (no hay layout, CSS ni Firebase), pero habría atrapado un botón sin registrar tras cambiar de `cuentas:` a `nu:`.

## Qué ejecuta `npm test` (2026-10-18)

`package.json` tiene `"test": "node --test"` y así debe quedarse. Node decide qué ejecutar por el **nombre de la carpeta**: dentro de una carpeta llamada exactamente `test` (singular) trata como prueba **todo `.js`** (incluidos los de `support/`, que pasan vacíos, y cualquier script que se deje ahí); en cualquier otra carpeta (por ejemplo `tests`, plural) solo corren los archivos `*.test.js`. Por eso lo que no es una prueba (como `smoke-browser.js`, que necesita jsdom) vive en `scripts/`, fuera de la carpeta de tests. No usar globs como `tests/*.test.js` en el script de npm: en Windows `npm` ejecuta con `cmd`, que no los expande. Los scripts de `scripts/` (`equivalencia.js`, `conciliacion.js`, `smoke-browser.js`) encuentran solos la carpeta `tests/` o `test/` para cargar `support/load-app.js`.
