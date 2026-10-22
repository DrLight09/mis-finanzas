# Arquitectura de archivos — mis-finanzas

Reglas y advertencias **escritas a mano** sobre cómo se reparte el código entre archivos. Complementa a [`mapa-codigo.md`](./mapa-codigo.md), que es **generado** y responde "¿en qué archivo vive esta función?".

Aquí no va comportamiento de negocio (eso es de cada `modulo.md`) ni bugs corregidos (eso es de `CHANGELOG.md`).

---

## 1. Cómo usar el mapa

- **Buscar una función:** `mapa-codigo.md` §4 (índice inverso, nombre → archivo).
- **Regenerarlo:** `node scripts/generar-mapa.js` desde la raíz del repo. Hay que correrlo cada vez que se agrega, mueve o borra una función o un archivo de `js/`.
- **Verificar en CI:** `node scripts/generar-mapa.js --check` sale con código 1 si el mapa está desactualizado.
- **El mapa dice qué archivo mirar, no qué hace la función.** Si el mapa y el código discrepan, manda el código.

---

## 2. Cómo carga cada archivo

Fuente de verdad: `index.html` (los `<script src>`) y `Loader.GROUPS` en `js/core/lazy-loader.js`. `mapa-codigo.md` §1 lo resume.

- **De entrada:** un `<script defer>` (o `async`/módulo ES) en `index.html`. Ya está disponible cuando corre cualquier pantalla.
- **Lazy:** listado en `Loader.GROUPS`. Se descarga la primera vez que se entra a esa pantalla, o en segundo plano por `Loader.ensureAll()` tras `appDataLoaded`. `ensureAll()` **no** precarga:
  - `wrapped` fuera de su ventana de enero.
  - `mesada` ni `spotify` si su toggle de Configuración → "Módulos activos" está apagado (`S.modulos.<x> === false`).
  - `ensureAll()` **sí** debe seguir precargando `cuentas` y `prestamos` — ver §4.

---

## 3. Una función "de un módulo" puede vivir en el núcleo

Es la trampa más frecuente al buscar una función.

- **`js/core/calc-helpers.js`** — funciones puras (solo `S`/`MC`, sin DOM) de Mesada, Tarjetas de crédito, Préstamos y Spotify que Inicio necesita en el primer render sin cargar esos módulos completos. `mesada.js`, `tarjetas_credito.js`, `prestado.js` y `spotify.js` **ya no las definen**; las usan como globales.
  - Si se mueve una función acá: todo test que cargue el archivo de origen y la use tiene que cargar también `calc-helpers.js`. En modo `permissive` la omisión no falla: da resultados en silencio.
- **`js/core/core-state.js`** — el estado `S`, `save()`, el cálculo y el snapshot de patrimonio (`calcPatrimonioTotal`, `snapshotPatrimonio`), la deuda de TC propia (`calcDeudaTcPropia` y sus auxiliares), `getIngresosFijosMes`, los helpers que deciden qué es ingreso/gasto real (`_esEntradaEspejoNoIngreso`, `_esGastoVarNoReal`) y los saldos de fuentes (`getSaldoFuente`).
- Al revés también pasa: `calcHealthScore` vive en `inicio.js`, no en un archivo de "salud financiera".

---

## 4. Módulos lazy que alimentan cálculos globales

El núcleo y Inicio llaman a lo que viva en un módulo lazy **siempre con guard `typeof`** y un valor de respaldo, para no romper si el archivo todavía no cargó. **Hoy no queda ninguno que alimente el patrimonio:** `calcC`, `calcCDT`, `calcRendimientoCDTsMes` y `nuTotal` viven en `js/core/nu-calc.js`, y `Deudas`, `totalPrestadoPendiente` y `totalMisDeudasPendiente` en `js/core/calc-helpers.js` (los dos de entrada); antes estaban en `cuentas.js` y `prestado.js`, de ahí esta sección. La regla sigue valiendo para cualquier cálculo nuevo.

- `snapshotPatrimonio()` **no graba** el punto del historial hasta que `calcC`, `calcCDT` y `Deudas` existan (`_patrimonioDependenciasListas`): sin ese guard, un snapshot tomado antes de que carguen grabaría un patrimonio artificialmente bajo de forma permanente.
- **Regla práctica:** un archivo de entrada que llame a una función de un módulo lazy la llama con guard `typeof`. Si es un cálculo que Inicio necesita en el primer render, la solución es moverlo a `calc-helpers.js`, no forzar la carga del módulo.
