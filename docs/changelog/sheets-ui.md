# Historial: Sheets / UI

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Sheets / UI

### 🐛 Corregido (2026-10-24) — «Dividir ÷» dejaba activarlo con una sola cuenta y agregar más filas que cuentas (`split.js`)

*(Mejora 3.)* **Causa raíz:** el motor genérico ya impedía repetir una cuenta entre filas (`splitActualizarOpciones`), pero no sabía cuántas cuentas ofrece cada sheet: `splitToggle` activaba el modo con cualquier número de cuentas y «+ Agregar cuenta» creaba filas sin límite (con todas las cuentas usadas, una fila nueva quedaba con un select sin opciones). El motor tampoco conoce los filtros de cada módulo; cada uno decide qué cuentas valen en su sheet a través de `getFuentesFn`.
- **Arreglo:** `splitCuentasValidas(instId)` cuenta las `<option>` con valor que devuelve `getFuentesFn('')` (exactamente lo que el sheet ofrece). `splitToggle` no activa ÷ con menos de dos y avisa («Necesitas al menos dos cuentas para dividir»); `splitAgregarRow` no crea más filas que cuentas y avisa («Ya usaste todas las cuentas disponibles»). Vale para todos los sheets que usan el motor (Gastos, Mesada, Spotify, Préstamos y Encargos).
- **Prueba:** `tests/nucleo.test.js` → `requisitos-y-filtros-de-sheets` (una cuenta, dos cuentas exactas, tres cuentas con tope). **Fallan sin el arreglo.**
- **Del simulador de DOM de las pruebas (`tests/support/fake-dom.js`):** al asignar `innerHTML` ahora arma `options` con el `value` de cada `<option>`, como el navegador; el motor depende de eso y la prueba de Mesada lo necesitaba.

### 🐛 Corregido (2026-10-24) — El selector «Aplica desde» de Ingresos fijos no tenía estilo (`styles.css`)

**Causa raíz:** las reglas base de los campos listaban `input[type=text]`, `number` y `date`, pero no `month`; el `<input type="month" id="if_d">` se veía con el estilo crudo del navegador. **Arreglo:** `input[type=month]` entra en las tres reglas base (campo, `appearance` y alineación del valor), con las mismas clases que ya usan los demás campos; sin estilos inline ni reglas por id.

### 🔧 Cambio (2026-10-18) — App limpia: esquema 9 sin migraciones y fuera la compatibilidad con datos viejos (`core-state.js`, `periodo.js`, `diferencial.js`, `encargos.js`, `scripts/`, `sw.js`)
**Por qué:** no hay usuarios ni backups que conservar, y mantener código que entiende formas antiguas de los datos es complejidad sin dueño. Decisión: la app nace limpia en el esquema 9.
**Qué se hizo:** (1) `SCHEMA_BASE = 9` y `MIGRACIONES = []`: las migraciones v8 (tasa única de Nu) y v9 (Spotify en `S.spotify`) se plegaron en el modelo actual; el mecanismo queda para el próximo cambio de forma. Un backup de un esquema anterior se rechaza al importar y unos datos así se marcan (`_esquemaAnterior`) y empiezan de cero, como ya pasaba con los menores de 7. (2) `Periodo.pagosFijos` solo lee el mapa `{"<id>_YYYY-MM": {fecha, fuente, monto}}` que escribe la app: se quitan el formato en array, el valor `true` y el respaldo al monto actual del gasto fijo (un pago sin monto cuenta 0). (3) Se quitan dos alias que nadie leía: `window._difBenefs` (Encargos) y `_difRenderHistorial` (Diferencial; Encargos llama directo a `diffRenderHistorial`).
**Pruebas:** `nucleo.test.js` pierde los bloques de las migraciones v8 y v9 y gana "estado de Spotify" (por defecto completo y guardia de las cuatro llaves sueltas), "un backup de un esquema anterior se rechaza" y "un backup de esta versión no cambia al pasar por `aplicarMigraciones`"; los fixtures de `calcHealthScore` pasan a `{ monto }` en `pagosGastosFijos`. **385/385** en `node --test tests/*.test.js` (cuentas, nucleo, libro, mesada, prestamos, sync), prueba de humo sin fallos (0 acciones sin registrar).
**CI (diagnóstico de la corrida con 12 fallos):** (a) los fallos de `historial-cuenta`, `eliminar-movimiento` y de la guardia de las llaves de Spotify eran de una copia **parcial** de la entrega (un `cuentas.test.js` anterior al cambio de `'egreso'` y de `S.spotify`, y seis archivos `.js` que aún usaban `S.spotifyHistorial`); con todos los archivos copiados pasan. (b) `smoke-browser.js` fallaba porque `node --test` ejecuta todo `.js` de la carpeta de tests y esa prueba necesita `jsdom`: se movió a `scripts/`. `scripts/` ahora encuentra solo la carpeta `tests/` o `test/`. `package.json`: se añade `npm run smoke`, `engines.node` pasa a `>=20` (jsdom 27) y jsdom se queda en `^27.4.0` (la 28 quitó `ResourceLoader`); `package-lock.json` regenerado (solo cambia `engines`). `sw.js` pasa a v37.
**Quedan, a propósito, como lista de candidatos (no se tocaron).**

### 🔧 Cambio (2026-10-18) — Todo el estado de Spotify en una sola llave `S.spotify` (esquema 9) (`core-state.js` y 10 archivos más, `sw.js`)
**Por qué:** el JSON guardaba Spotify en cuatro llaves sueltas con prefijo (`spotifyPersonas`, `spotifyCosto`, `spotifyCajitaId`, `spotifyHistorial`): un espacio de nombres escrito a mano, distinto de `alcancia` y `mesadas`, que ya son una llave por sección. Se mantienen **dos listas** dentro (integrantes e historial): un estado que cambia y hechos que solo se añaden son cosas distintas, y el historial de Spotify guarda a quién y qué periodos, cosa que un movimiento de cuenta no tiene (lo que sí toca una cuenta ya se refleja con espejo y libro).
**Cómo:** `S.spotify = { personas, costo, cajitaId, historial }`. Migración **v9** (`spotify-un-solo-objeto`): arma el objeto desde las cuatro llaves, las borra, normaliza valores inválidos y deja que las llaves viejas manden sobre un `spotify` vacío que ponga el estado por defecto (caso `Object.assign` de la nube sobre `S`). Nuevo `_ensureSpotify()` en `load()` (como `_ensureMesadas`): `S.spotify` siempre existe y trae sus cuatro campos. 103 referencias cambiadas en `spotify.js` (73), `wrapped.js` (15, con lectura tolerante `(S.spotify||{})` porque recibe el estado por parámetro), `busqueda-global.js`, `personas.js`, `movimientos.js`, `inicio.js`, `gastos.js`, `actividad_reciente.js`, `cuentas.js`, `sheet-stack.js` (el campo de costo conserva su id `spotifyCosto`, solo cambia dónde guarda) y `core-state.js`. `_validarEstructuraJSON` rechaza un backup donde `spotify` no sea un objeto.
**Pruebas:** `nucleo.test.js` → `v9` (migración con datos, vacía, llaves viejas sobre `spotify` vacío, valores inválidos, ya migrado, `_ensureSpotify`) y una **guardia** que impide volver a usar `S.spotifyPersonas/Costo/CajitaId/Historial` fuera de la migración; los tests de `schemaVersion` pasan a 9. La prueba de humo ahora pinta la pantalla de Spotify con datos y toca sus botones. **338/338** en `npm test` (cuentas 182, nucleo 85, libro 24, mesada 47), prueba de humo sin fallos, y `equivalencia.js` con un backup en esquema 8 (llaves viejas) migra y sale equivalente. **Sin verificar:** con un backup real y en el navegador. **Pendiente de documentar:** `docs/spotify.md` (§3 y el modelo de datos nombran `S.spotifyHistorial`; no lo tenía). Mesada (`mesadas` + `mesadaAnio`) se dejó como está a propósito. `sw.js` pasa a v36.

### 🔧 Cambio (2026-10-18) — Movimientos: se cierra E6 con la parte que vale la pena (sin tipo `'egreso'`) (`cuentas.js`, `movimientos.js`, `core-state.js`)
**Análisis (qué se hizo y qué no, para no repetirlo):** E6 era "unificar los nombres de campo". Tras la lista única de historial (`S.movimientos`) casi todo ya estaba unificado: dentro de esa lista `desc` es el título y `nota` el detalle opcional (9 sitios llevan los dos a propósito), y el resto de listas (Deudas, Encargos, Spotify con `spotifyHistorial`, tarjetas, mesadas) guardan información que un movimiento de cuenta no tiene y se quedan con su propia forma. Renombrar `nota`/`desc` en las demás habría tocado 124 usos en 17 archivos, la migración y los backups sin cambiar ningún comportamiento: **no se hace**. Lo único que seguía siendo una diferencia artificial era el tipo `'egreso'`, que `getMovimientosCuenta()` fabricaba solo para las cuentas personalizadas y cuya rama de borrado en `movimientos.js` era idéntica a la de `'salida_manual'`.
**Cómo:** todas las cuentas muestran la salida manual como `'salida_manual'`, con etiqueta "Retiro" (antes "Salida" en Nequi/Efectivo y "Retiro" en las personalizadas) y textos por defecto "Ingreso"/"Retiro" en todas (antes "Entrada de efectivo"/"Salida manual" en las demás). Se quitan las ramas y casos de `'egreso'` de `movimientos.js` (`_movExiste`, el aviso de antigüedad y el borrado), de `cuentas.js` (`getMovimientosCuenta`, `renderMovsCuenta`) y de `core-state.js`; se actualizan `cuentas.test.js` (la salida de una personalizada es `salida_manual` y su borrado devuelve el saldo) y `nucleo.test.js`.
**Verificado:** 331/331 en `npm test` (cuentas, nucleo, libro, mesada), la prueba de humo sin fallos, y `scripts/equivalencia.js` antes/después con un backup sintético: equivalente. **Sin verificar con un backup real** (no lo tengo): correr `equivalencia.js` y `conciliacion.js` con el tuyo; el cambio solo toca cómo se muestra y se borra una salida, no cómo se suma ingreso ni gasto. `sw.js` pasa a v35.

### 🔧 Cambio (2026-10-18) — Frontera limpia entre `cuentas.js` y `nu.js`: Nu se apoya en Cuentas, nunca al revés (`core-state.js`, `cuentas.js`, `nu.js`, `sw.js`)
**Por qué:** el corte del 2026-10-17 fue mecánico por líneas y dejó un ciclo: `nu.js` usaba 16 cosas genéricas de `cuentas.js` (legítimo: Nu es una cuenta) pero `cuentas.js` seguía llamando a 4 cosas de Nu (`_cdtEditId`, `renderCajitas`, `materializarIntereses`, `_cajitaActualId`). Se evaluó volver a un solo archivo y se descartó: Nu es un subdominio propio y Cuentas la capa genérica sobre la que se apoya.
**Cómo:** (1) El preview en vivo del CDT, el filtro de los campos `[data-tasa-ea]`, la rama de Nu de `renderDetalleCuenta` (ahora `renderDetalleNu()`) y la parte de Nu de `actualizarBotonesTransferir` (ahora `_nuActualizarBotonesTransferir()`) pasan a `nu.js`. (2) Se quita la llamada a `materializarIntereses` de `confirmarAgregarDinero`: era redundante, `sumarFuente` ya materializa los intereses de una cajita al sumar. (3) Nuevo registro `CuentaPantallas` en `core-state.js` (junto a `CUENTAS_FIJAS`): una cuenta con pantalla propia se registra al cargar su archivo con `{ paneles, panel, reiniciar, render, actualizarBotones }` y `cuentas.js` le pregunta lo que necesita (`abrirCuenta`, `volverSelector`, `renderDetalleCuenta`, `_showCuentasPanel`, `actualizarBotonesTransferir`); vive en el núcleo para que el orden de carga no importe. El descriptor de Nu lleva `pantallaPropia: true`: sin `nu.js`, tocar Nu en el selector no hace nada. `cuentas.js` ya no nombra nada de `nu.js`.
**Pruebas:** `cuentas.test.js` → `cuentas-nu-archivos`: `cuentas.js` no usa nada de `nu.js` y lo que Nu toma de `cuentas.js` es una lista exacta (16 nombres); `libro.test.js` ahora carga `nu.js` (lo detectó esa guardia). Nuevo `tests/smoke-browser.js` (jsdom con la página real: toca cada `data-action` y recorre selector → Nu → cajita → volver → Nequi; comprobado por mutación). La prueba de humo también compara todas las acciones `data-action` del proyecto con las registradas en tiempo de ejecución (207 usadas, 0 sin registrar, 0 duplicadas) y encontró 4 registros muertos que nadie nombraba (`encargos:abrirTraspaso`, `encargos:abrirTransferencia`, `encargos:abrirCompraTC`, `prestado:toggleExtraSection`, restos de antes de `salidaMenuIr` y de un listener directo); se quitaron de `encargos.js` y `prestado.js` (las funciones siguen, porque otras las llaman). Con la carpeta `js/` completa: 331/331 en `npm test` (cuentas, nucleo, libro, mesada). **Sin verificar en navegador:** abrir Nu → cajita → volver → Nequi, botones Mover, preview del CDT. Documentación: `nu.md` §7, `cuentas.md` (§4, §7 y funciones clave, que además describían listas ya retiradas por el libro). `sw.js` pasa a v34.

### 🔧 Cambio (2026-10-17) — `cuentas.js` se parte en `nu.js` + `cuentas.js` (estructura, sin cambio de comportamiento)
**Por qué:** `cuentas.js` llegó a ~3.000 líneas con Nu (cajitas, CDTs, metas, chequeo, tasa) ocupando casi la mitad; el cálculo ya estaba en el núcleo (`nu-calc.js`) y lo que quedaba era un subsistema completo con sus propios botones. El proyecto es "un archivo por dominio".
**Cómo:** se movieron líneas sin reescribirlas (168 declaraciones de nivel superior: ninguna perdida ni repetida, comprobado por script) a `js/modules/nu.js`; el cableado de Nu (botones, `Events.registerAll`) se fue con Nu. Mismo grupo lazy (`cuentas: ['js/modules/nu.js','js/modules/cuentas.js']` en `lazy-loader.js`): ninguno usa al otro al cargar, solo cuando una función corre, así que el orden no importa y cada archivo carga solo. Los 19 botones de Nu pasan de `data-action="cuentas:…"` a `"nu:…"` (`index.html` y el HTML que arma `nu.js`). Se quitó además el registro muerto `cuentas:openSheet` y el objeto `S.cuentas` obsoleto de `cuentas.md`.
**Pruebas:** `cuentas.test.js` → `cuentas-nu-archivos` (cada archivo carga solo; ninguna función en los dos; todo botón registrado; ningún test carga `cuentas.js` sin `nu.js`). Los tests que cargaban `cuentas.js` ahora cargan también `nu.js`. Documentación: `nu.md` (nuevo) y `cuentas.md` recortado.

### 🔧 Cambio (2026-10-17) — Vocabulario único y toast de plata que sale (`index.html`, `cuentas.js`, `nu.js`, `gastos.js`)
Todo el flujo de meter plata a una cuenta dice "Agregar" (la tarjeta "Sumar dinero" del menú `+` → "Agregar dinero", "Sumar al saldo" → "Agregar al saldo", avisos "agregado", historial "Agregaste dinero en …") y el de sacar dice "Retirar". El toast `salida` (rojo, flecha) se usa para toda plata que sale de tus cuentas: retirar dinero, gasto registrado y pago de gasto fijo (`gastos.js`, 3 líneas). Transferir entre cuentas propias se queda en `ok` (éxito neutro). Convenciones en `guia-estilo-sheets.md` §2 bis. **Pruebas:** `cuentas-textos`.

### 🐛 Corregido (2026-10-17) — "Cajitas recalculadas: $0 — compara con la app de Nu" al cambiar la tasa (`firebase-sync.js`)
**Causa raíz:** el aviso se disparaba en cada `blur` del campo de tasa y solo mostraba `calcC().val` sumado de las cajitas: no recalculaba nada. Era un resto de cuando la tasa se aplicaba hacia atrás; con los intereses sellados en cada movimiento (`materializarIntereses`) eso ya no es posible (por eso se quitó "Vigente desde") y el Chequeo rápido cubre contrastar con Nu. Con ninguna cajita decía "$0".
**Ahora:** el aviso desaparece. Cambiar la tasa la registra en `S.historialTasasNu` desde hoy y refresca; nada más. Se quitó también el código del campo `nuTasaVigenciaFecha` (no existe en la página). **Pruebas:** `cuentas-textos`.

### ✨ Agregado (2026-10-17) — El campo de tasa solo acepta números con coma o punto (`nu-calc.js`, `firebase-sync.js`, `cuentas.js`, `index.html`)
**Antes:** permitía escribir letras y `parsePct` aceptaba "9abc" como 9. **Ahora:** `nuTasaSanear` limpia lo que se escribe (letras, signos, segundo separador; 3 enteros y 4 decimales); `nuTasaDesdeTexto` valida estricto (número completo, > 0 y ≤ 100; "9abc" y "9," no valen); un valor inválido no cambia la tasa y al salir del campo se restaura. Lo usan la tasa de las cajitas, la sugerida tras un chequeo (`confirmarCambioTasaNu`, que antes también aceptaba letras) y el saneo de la tasa de un CDT (`data-tasa-ea`). `nuTasaATexto` reemplaza cuatro `String(x).replace('.',',')` repetidos. **Pruebas:** `nu-tasa-global` → "el campo de tasa solo acepta números…", `cuentas-textos`.

### 🔧 Cambio (2026-10-17) — Misma nomenclatura en todas las cuentas: "Agregar dinero" / "Retirar dinero" (`index.html`, `cuentas.js`)
Nu ("Entró plata" / "Salió plata"), el detalle de cajita ("Agregar" / "Retirar" / "Mover") y el sheet de retiro ("Restar…") pasan a los mismos textos que Nequi, Efectivo y cuentas personalizadas: botones, títulos de sheet (`Agregar a X` / `Retirar de X`), botón "Retirar del saldo" y movimientos del historial (`Sumaste dinero en X` / `Retiraste dinero de X`). Encargos no cambia (no es una cuenta propia). **Pruebas:** `cuentas-textos`.

### ✨ Agregado (2026-10-17) — Toast de salida (rojo) y toast rediseñado (`core-state.js`, `index.html`, `cuentas.js`)
**Antes:** retirar dinero avisaba con el azul de `info`. **Ahora:** nuevo tipo `salida` (rojo con flecha) para retirar dinero de una cuenta o de Nu; `err` (rojo con X) queda para errores. Todos los toast llevan un círculo de color con su ícono, texto con mejor ajuste y `role` accesible (`alert` en errores, `status` en el resto). Gastos y transferencias mantienen su tipo. **Pruebas:** `nucleo.test.js` → `toast`; `cuentas-textos`.

### 🐛 Corregido (2026-10-17) — Chequeo rápido: en una cajita con encargos mostraba solo lo propio (`cuentas.js`, `nu-calc.js`)
**Causa raíz:** el sheet mostraba `calcC().val`, que excluye el dinero de encargos (la cajita física lo tiene y Nu muestra la suma). El usuario tenía que sumarlo a mano, y al guardar `_interpretarLecturaChequeoNu` adivinaba si lo anotado era el total o lo propio según cuál referencia quedaba más cerca.
**Ahora:** `nuValorEsperadoCajita(c)` devuelve `{propio, encargos, total}`; el sheet muestra el total que Nu debería marcar (con una nota de cuánto son encargos) y se anota siempre el total. Saldo propio = lectura − encargos, referencia = total esperado, y `S.chequeosNu.saldoReal` guarda el total. Sin sumar ni omitir nada: `calcC` ya compone intereses sobre la base total y devuelve `val` solo con lo propio. Si lo anotado es menor que el dinero de encargos de esa cajita se avisa y no se guarda. Sin encargos nada cambia. **Pruebas:** `nu-acciones` → "Chequeo rápido con encargos".

### 🐛 Corregido (2026-10-16) — El ícono y el color elegidos en "Nueva cuenta" no se marcaban y la consola lanzaba `marcarColorSeleccionado is not defined` (`index.html`, `cuentas.js`)
**Causa raíz:** `selColorNC()` llama a `marcarColorSeleccionado()` (`js/core/color-picker.js`), pero ese archivo no tenía `<script>` en `index.html` ni grupo lazy (el mapa de código ya lo marcaba como "sin `<script>`"). Al tocar un color el `ReferenceError` cortaba la función; `selIconoNC()` llama a `selColorNC()` ANTES de repintar el grid de íconos, así que el ícono tampoco se marcaba (y "Otra" seguía activa) aunque `_ncIconoSel` y `_ncColorSel` sí se guardaban: por eso la cuenta salía con el ícono correcto.
**Ahora:** `index.html` carga `color-picker.js` (núcleo eager, lo usan Cuentas, Tarjetas y Prestado). Además `editarCuentaCustom()` dejaba marcado en el grid el ícono de la última vez que se abrió el sheet (alternaba una clase `selected` sin estilo) y usaba el id inexistente `'banco'` por defecto: ahora vuelve a dibujar el grid con `renderIconGrid()` y el defecto es `'otro'`.
**Pruebas:** `tests/cuentas.test.js` → `cuenta-iconos-colores`; `tests/nucleo.test.js` → `archivos-cargados` (guardia: todo archivo de `js/core` y `js/modules` debe llegar al navegador por un `<script>`, un grupo lazy o un `import`; con el código anterior habría señalado `color-picker.js`). Los dos bloques de color en `abrirNuevaCuenta`/`editarCuentaCustom` que repetían a mano lo mismo ahora usan `marcarColorSeleccionado`. **Sin verificar en navegador real.** Los errores `content.js` / "message port closed" no son de la app (ver abajo).

### 🔧 Cambio (2026-10-16) — Una sola tasa EA para todas las cajitas de Nu: `S.nuRate` (`core-state.js`, `nu-calc.js`, `cuentas.js`, `firebase-sync.js`, migración v8)
**Causa raíz:** la tasa vivía en tres sitios. `S.nuRate` (9,25 por defecto, nadie lo elegía y NO se leía si existía la otra), `S.nuTasaGlobal` (la que se escribía en el campo) y `tasa` en cada cajita, que `save()` reescribía con `getNuTasaGlobal()` en cada guardado (la copia nunca aportaba nada; con `nuRate = 9,3` y sin `nuTasaGlobal`, las cajitas quedaban en 9,25). Además `getNuTasaGlobal()` inventaba 9,25 cuando el usuario no había puesto nada, así que no se podía saber si la tasa estaba configurada.
**Ahora:** solo existe `S.nuRate` (`null` = sin configurar). Se eliminan `S.nuTasaGlobal` y `cajita.tasa`; los CDT conservan `cdt.tasa` (el CDT nuevo se precarga con la tasa global). `getNuTasaGlobal()` devuelve 0 sin tasa (sin tasa no hay intereses, en vez de inventarla); nuevas `nuTasaConfigurada()` y `nuTasaDesdeTexto()` (`nu-calc.js`). El campo "Tasa EA %" ya no puede quedar vacío ni en 0: un valor inválido se ignora y al salir del campo se restaura.
**Migración v8 (`MIGRACIONES`, `SCHEMA_VERSION_ACTUAL` pasa a 8):** si había `nuTasaGlobal` → `nuRate = nuTasaGlobal`; con cajitas y sin ella → la que se venía usando (`nuRate` o 9,25); sin cajitas → `null`. Borra `nuTasaGlobal` y `cajita.tasa`. Corre al cargar de Firestore y al importar un backup (`aplicarMigraciones`), por eso el import/export no necesita código aparte. `historialTasasNu` no cambia.
**Import/export:** `_validarEstructuraJSON` (`configuracion.js`) rechazaba `nuRate: null` ("debe ser un número"): un backup exportado sin tasa configurada no se habría podido importar. Ahora acepta número o `null`. `encargos.js` conservaba un respaldo muerto `S.nuTasaGlobal || 9.25` (nunca se usaba porque `getNuTasaGlobal` siempre existe): ahora llama directo a `getNuTasaGlobal()`.
**Pruebas:** `tests/cuentas.test.js` → `nu-tasa-global`; `tests/nucleo.test.js` → `migraciones` (v8, sus casos) y `backup-import`. Las pruebas existentes que sembraban `nuTasaGlobal` pasaron a `nuRate`.

### ✨ Agregado (2026-10-16) — Acciones de Nu que dependen de las cajitas y de la tasa (`cuentas.js`, `index.html`)
**Antes:** "Entró plata", "Salió plata" y "Chequeo rápido" se podían abrir sin cajitas, y se podían crear cajitas sin tasa.
**Ahora:** sin tasa no se crea cajita (el botón queda deshabilitado, hay un aviso y `addCajita()` lo vuelve a comprobar y enfoca el campo). Sin cajitas, los tres botones salen deshabilitados; "Salió plata" además exige alguna cajita con saldo. Cada acción vuelve a comprobarlo (`abrirNuMovimiento`, `abrirChequeoNu`, `guardarChequeoNu`), una sola fuente del motivo (`_motivoNu*`) alimenta el título del botón, el aviso en pantalla y el mensaje. Los botones se reevalúan en cada `renderCajitas()` (lo que corre tras cada `refresh()`). Momento elegido para pedir la tasa: **al crear la primera cajita** (el campo está en la misma pantalla); como la tasa no puede quedar vacía, una cajita nunca existe sin tasa. `_setBtnTransferir` pasa a usar el nuevo `_setBtnEstado`.
**Pruebas:** `tests/cuentas.test.js` → `nu-acciones` (botones de Nu y lógica de cada acción).

### 🐛 Corregido (2026-10-16) — Un depósito en una cajita vacía ganaba intereses desde el día en que se creó la cajita (`cuentas.js`)
**Causa raíz:** el reloj de los intereses es `c.fecha`, y `materializarIntereses()` solo lo avanzaba cuando había intereses que sellar. Con la cajita en $0, `calcC()` devolvía 0 días y `c.fecha` seguía en la fecha de creación; el primer depósito (días después) se componía retroactivamente desde ahí. Escenario: cajita creada hace 5 días, depósito de $100.000 hoy → mostraba intereses de 5 días al instante.
**Ahora:** si no hay plata adentro (ni propia ni de encargos), `materializarIntereses()` pone `c.fecha = hoy()`: el reloj arranca con el depósito. No cambia nada con saldo > 0.
**Pruebas:** `nu-acciones` → "el reloj de los intereses arranca con el primer depósito".

### ✨ Agregado (2026-10-16) — "Chequeo rápido" solo con cajitas que ya generaron intereses un día completo, evaluado por cajita (`nu-calc.js`, `cuentas.js`)
**Referencia temporal:** no la fecha de creación sino la de `calcC()` (`c.fecha`, último sellado de intereses o primer depósito) con plata adentro: `cajitaGeneraIntereses(c)` = tasa configurada y `calcC(c).dias >= 1`. `cajitaChequeable(c)` suma una excepción: una cajita ya chequeada HOY (sale de `S.chequeosNu`, sin estado nuevo) sigue disponible hoy, porque el chequeo reinicia su reloj y, sin esto, no se podía corregir una lectura mal anotada (lo cubría una prueba existente). `cajitasChequeables()` es la lista. El botón se deshabilita mientras ninguna cumpla (con aviso del motivo); el sheet lista solo las que cumplen y avisa cuántas faltan; `guardarChequeoNu` ignora cualquier cajita que no cumpla. Una cajita nueva no afecta a las demás. **Consecuencia a conocer:** tras "Entró/Salió plata" una cajita sale del chequeo hasta el día siguiente (su reloj se reinicia hoy).
**Pruebas:** `nu-acciones` → "qué cajitas entran al Chequeo rápido (una por una)". Las pruebas existentes de `chequeo-nu` ahora siembran la tasa y cajitas con 3 días de intereses.

### 🐛 Corregido (2026-10-16) — "Retirar dinero" se podía abrir con saldo 0 (`cuentas.js`)
**Ahora:** en Efectivo, Nequi, cuentas personalizadas (y en el detalle de cajita) el botón sale deshabilitado con saldo menor a $0,01 y `abrirRestarDinero()` lo vuelve a comprobar con el mensaje "No hay saldo para retirar en esta cuenta". `confirmarRestarDinero()` ya rechazaba montos mayores al saldo ("Saldo insuficiente en …"): se dejó igual y ahora tiene prueba de regresión junto con el retiro válido. Se reevalúa al pintar el detalle (también tras cada `refresh()`).
**Pruebas:** `tests/cuentas.test.js` → `retirar-sin-saldo` (3 tipos de cuenta); el bloque `restar-dinero` ahora carga `fuentes-filtro.js`, que `abrirRestarDinero` usa.

### 🔍 Investigación (2026-10-16) — Errores de consola ajenos a la app
`content.js:18 ... reading 'useCache'`, `Unchecked runtime.lastError: The message port closed...` y `A listener indicated an asynchronous response ... globals-front.js`: la app no tiene ningún `content.js` ni `globals-front.js` (no están en el repo ni en el HTML) y no usa `chrome.runtime`; son scripts de contenido de una extensión del navegador. No se tocó nada. Para confirmarlo: abre la app en una ventana de incógnito sin extensiones, o desactiva las extensiones una a una. El único error propio era `marcarColorSeleccionado` (arriba).

### 🔧 Cambio (2026-10-07) — Textos de la interfaz unificados en tuteo (se mezclaba con voseo)

Verificado: `spotify.js`, `alcancia.js` e `index.html` mezclaban voseo ("Ingresá", "Elegí", "Seleccioná", "Registrá", "Marcá", "sabés", "No tenés") con tuteo ("Selecciona", "Ingresa", "Revisa"). El resto de la app (`core-state.js`, `movimientos.js`, `inicio.js`) ya estaba en tuteo, así que se unificó hacia ahí en 21 líneas: `spotify.js` (3), `alcancia.js` (13) e `index.html` (5 en Spotify, Mesada, Plata comprometida y eliminar cuenta). Solo cambian los textos mostrados; ningún id, clave ni lógica. **Pendiente:** `cuentas.js` no se revisó (no estaba disponible en esa sesión); conviene un `grep` por las mismas formas.

### 🔧 Refactor (2026-10-07) — Las reglas de los campos del CDT viven en una sola función pura, `validarCamposCDT` (`cuentas.js`)

**Antes:** al arreglar la edición del CDT, `guardarCDT()` quedó con una copia de las reglas de `confirmarCrearCDT()` (tasa, retención, apertura y vencimiento). Dos copias de la misma regla se desalinean con el tiempo: ya se habían separado (el vencimiento vacío avisaba con dos textos distintos y la tasa se validaba solo al editar).

**Ahora:** `validarCamposCDT(campos, ahora?)` es pura (no lee el DOM ni muestra avisos) y la usan crear y editar. Cada una pasa sus valores por defecto: al crear, tasa 9,25 y RTE 4; al editar, los valores actuales del CDT. `confirmarCrearCDT()` conserva el monto mínimo de $50.000 y el chequeo contra el saldo de la cajita, que solo aplican al crear. `guardarCDT()` no cambia su comportamiento.

**Cambios visibles (a propósito):**
- Al crear, una tasa escrita como `0` o como texto que no se pueda leer ahora se rechaza con "La tasa (EA) debe ser un número mayor que 0"; antes se convertía en 9,25 sin avisar. La tasa vacía sigue valiendo 9,25.
- Un vencimiento vacío avisa siempre con "Debes definir la fecha de vencimiento" (al editar decía "Fecha de vencimiento requerida").
- Al crear, si hay varios errores a la vez, el aviso del monto mínimo sale después de los de tasa, retención y fechas (antes salía en medio).

**Tests:** nuevo `tests/cdt-campos.test.js` (11 tests). Prueba la función pura (campos válidos, tasa y RTE por defecto y rechazadas, RTE 0, apertura futura, vencimiento) y la edición real: con la cajita en $0 y con saldo solo sale "CDT actualizado", sin crear otro CDT ni mover plata; los errores no tocan el CDT y dejan el sheet abierto; cancelar una edición y abrir "crear" devuelve el sheet a modo crear sin pisar el CDT anterior. Con ese archivo y `nu-cdt`, `chequeo-nu`, `restar-dinero`, `transferir`, `calcPatrimonioTotal`, `calcHealthScore`, `deudas` y `totalPrestadoPendiente` pasan 97 de 97 en una copia con un stub de DOM mío; falta correr la suite completa en tu repo.

### 🗑️ Eliminado (2026-10-05) — CSS de cajitas sin uso (`styles.css`)

**Qué se borró:** 29 reglas (y los 5 comentarios de sección que quedaban vacíos) de dos diseños anteriores de cajita: el acordeón (`.cajita`, `.cajita-header`, `-header-left`, `-header-right`, `-chevron`, `-body`, `.cajita.expanded …`, `-collapsed`, `-expanded`, `-toggle-btn`), la tarjeta editable (`.cajita-top`, `-name`, `-grow`, `-fields`) y el CDT en línea (`.cajita-cdt-box`, `-locked`, `-val`, `-meta`).

**Cómo se comprobó:** ninguna de esas clases aparece como clase en `index.html` ni en los módulos JS revisados (incluidos `prestado`, `mesada`, `encargos`, `alcancia`, `spotify`, `gastos`); los únicos usos eran las funciones ya eliminadas de `cuentas.js`. Las llaves del archivo quedan balanceadas (445/445).

**Se conserva** porque sí tiene referencia: `.cajita-val` (selector de ocultar saldos), `.cajita-limit-msg`, `.cajita-meta-*` y `.cajita-row-hover` (usados por `cuentas.js`). Antes de desplegar, busca `class="cajita` y `cajita-header` en los módulos que no revisé.

### 🔧 Refactor (2026-10-05) — Prestado, Encargos y Alcancía reutilizan lo compartido en vez de repetirlo (`prestado.js`, `encargos.js`, `alcancia.js`)

- **`prestado.js`:** `_getPrestSplitFuentesOptions`, `_getMdSplitFuentesOptions` y el select de "Yo debo" (`md_cuenta`) armaban las `<option>` a mano con `FuentesFiltro.filtrar()`; ahora usan `FuentesFiltro.optsHtml()` (plata que sale) o `buildFuentesOptsHtml({incluirTC:false})` (plata que entra, sin filtrar por saldo). La opción "Ganancia" del split de préstamo se sigue agregando aparte.
- **`encargos.js`:** el mapa `{nequi:'#ff4da6', efectivo:'var(--amber)'}` de "Encargos en esta cuenta" salió de `CUENTAS_FIJAS` (`getCuentaFija()`).
- **`alcancia.js`:** el historial de la alcancía tenía una copia de `_alcNombreFuente()` en línea (nequi / efectivo / cajita / custom); ahora la llama. Único cambio visible: si la cajita de origen ya no existe, el nombre sale como lo resuelve `fuenteLabel()` ("Cajita Nu") en vez de "Cajita".

**Docs:** `prestado.md` (§2.1 y §5b), `encargos.md` (§7 y tabla de funciones) y `alcancia.md` (§7 y tabla de funciones) explican estos cambios y por qué sus validaciones de saldo siguen siendo propias. `sw.js` pasa a `mis-finanzas-v18` con esta tanda.

**Verificación:** prueba con DOM (jsdom) comparando, con los archivos viejos y nuevos y las funciones reales de `core-state.js` y `fuentes-filtro.js`, las opciones (valor, texto, seleccionada) de los tres selectores de Prestado: 2 tipos × 3 escenarios de saldo × 4 selecciones, todas iguales. `node --check` limpio en los tres archivos. Encargos y Alcancía sin prueba automática.

**Revisado y NO cambiado, con motivo:**
- Los avisos de saldo de Prestado (`_planMovMiDeuda`, cupo de TC), Encargos (`_validarMovEncMia`, "para prestar") y Alcancía no usan `validarSalidaFuente()`: comparan con una tolerancia de $0,50 (`Deudas.TOL_FINO`) en lugar de estricto y cada uno redacta su mensaje con el contexto del flujo ("No tenés $X en Y", "En Y solo hay $Z"). Unificarlos cambiaría textos y tolerancias; si se quiere, `validarSalidaFuente` necesitaría una opción `tolerancia`.
- Los avisos que muestran un nombre de cuenta ya escapan con `escHtml()` (`toast()` pinta HTML) y los `dialogo()` pasan el texto por `textContent`, así que no necesitan escape. No se encontraron huecos del tipo corregido en Spotify.
- `_alcNombreFuente()` conserva sus fallbacks defensivos con `typeof`.

### 🔧 Cambio (2026-10-05) — El detalle de cajita usa el mismo estilo compartido y el color de Nu viene del descriptor (`cuentas.js`, `index.html`)

**Antes:** `#cuentas-detalle-cajita` repetía `rgba(192,96,240,…)` y `var(--nu-light)` en estilos inline (5 y 5 veces) para el hero, el título y el campo de nombre, y escribía a mano los colores de Retirar y Mover.

**Ahora:** `_renderDetalleCajita()` (por donde pasan todas las rutas al detalle) pone `--cuenta` y `--cuenta-rgb` sobre el panel desde el descriptor de Nu; el hero es `.cuenta-hero` (con `.cuenta-hero-label` y `.cuenta-hero-saldo`), el título y el campo de nombre usan las variables, y Retirar y Mover usan `.cuenta-action-btn--rojo` y `--azul` (mismo aspecto). "Agregar" conserva su verde de acento. Cambio visual mínimo: el rótulo "Disponible" queda con la misma opacidad que en las demás cuentas. Ids sin cambios. No se tocaron los sub-paneles de meta y de CDTs ni las tarjetas de cajita de la lista de Nu. Sin pruebas automáticas; `node --check` limpio.

### 🐛 Corrección (2026-10-05) — "Nueva cuenta" podía quedar en modo edición si se cerraba el sheet tocando el fondo (`cuentas.js`)

**Síntoma posible:** abrir "Editar cuenta" de una cuenta personalizada, cerrar el sheet tocando fuera (en vez de "Cancelar") y abrir "Nueva cuenta": el sheet seguía con título "Editar cuenta", botón "Guardar cambios" y sin campo de saldo, y guardar renombraba la cuenta anterior en lugar de crear una. Solo "Cancelar" reiniciaba el sheet (`resetSheetNuevaCuenta`); `sheet-stack.js` también cierra los sheets al tocar el fondo.

**Ahora:** `abrirNuevaCuenta()` llama a `_resetSheetNuevaCuenta()` al abrir, igual que `abrirCrearCDT()` con el CDT. Se razonó sobre el código; no hay prueba automática de este caso.

### 🐛 Corrección (2026-10-05) — Editar un CDT mostraba "Saldo insuficiente" y, con saldo en la cajita, podía crear un CDT duplicado (`cuentas.js`, `index.html`)

**Síntoma:** al editar un CDT y guardar aparecían juntos "Saldo insuficiente. Solo tienes $0 en la cajita." y "CDT actualizado"; el CDT quedaba bien.

**Causa:** el modo edición reutiliza el sheet de crear y le ponía un segundo handler al botón (`btn.onclick = () => guardarCDT(...)`), pero el listener de `confirmarCrearCDT` (`addEventListener` al cargar) seguía activo. Al guardar corrían los dos. `confirmarCrearCDT()` toma el capital que muestra el formulario como "monto a invertir" y lo compara con el saldo libre de la cajita: con la cajita en $0 fallaba (el aviso que viste, y `guardarCDT()` seguía y guardaba); con saldo suficiente habría creado un CDT nuevo del mismo monto descontándolo de la cajita. Otro riesgo del mismo origen: si se cancelaba una edición, el botón quedaba en "Guardar cambios" y el siguiente "Crear CDT" volvía a ejecutar `guardarCDT()` sobre el CDT viejo.

**Ahora:**
- Un solo listener en el botón (`confirmarSheetCDT`) que decide por `_cdtEditId`: `guardarCDT()` si hay un CDT en edición, `confirmarCrearCDT()` si no. Se eliminó el `btn.onclick`/`_origOnclick`.
- `_cdtModoSheet(editando)` ajusta el sheet cada vez que se abre: al editar el título es "Editar CDT", el capital queda de solo lectura ("no se puede cambiar"), se ocultan "Disponible en cajita" e "Invertir todo" y el botón dice "Guardar cambios". `abrirCrearCDT()` lo devuelve a modo crear, así que cancelar una edición ya no deja estado pegado.
- `guardarCDT()` solo toca tasa, fechas y retención (capital y saldo de la cajita intactos) y valida como al crear: tasa > 0, RTE numérica entre 0 y 100 (0 es válido), apertura no futura, vencimiento obligatorio y posterior a la apertura. Antes aceptaba un vencimiento anterior a la apertura, ignoraba una RTE inválida y fallaba en silencio si la cajita o el CDT ya no existían (ahora avisa). El campo RTE vacío conserva la retención actual.
- Preview del sheet: la RTE 0 ya no se leía como 4, no muestra "Mínimo $50.000" al editar un CDT existente, y "Invertir todo" ahora actualiza la vista previa (el evento no burbujeaba hasta el listener).
- `index.html`: ids `cdtSheetTitle`, `cdtDisponibleBox` y `cdtMontoLabel` en el sheet.

**Verificación:** prueba con un DOM real (jsdom) y el HTML del sheet: editar con la cajita en $0 y con $5.000.000 deja solo "CDT actualizado", sin crear otro CDT ni mover saldo; cancelar la edición y abrir "crear" devuelve el sheet a modo crear y crea un CDT nuevo sin tocar el viejo; seis errores de validación (vencimiento anterior, vacío, RTE no numérica, RTE > 100, tasa 0, apertura futura) se rechazan sin modificar el CDT y el sheet sigue en edición; RTE 0 se acepta. `node --check` limpio. No se probó en el navegador real con tus datos.

### 🗑️ Eliminado (2026-10-05) — Migración de cuentas `migrarCuentasLegacy()` (`core-state.js`, `configuracion.js`)

**Qué era:** al arrancar, al importar un backup y en cada lectura, convertía los campos viejos `S.nequiSaldo`, `S.efectivoSaldo` y `S.cuentasPersonalizadas` al modelo único `S.cuentas` (con reglas para que un cliente viejo no pisara saldos con ceros).

**Por qué se quita:** el único documento existente ya está migrado y las cuentas que se creen desde ahora nacen en el modelo actual; no queda nada que convertir.

**Qué cambió:**
- `core-state.js`: se borra la función (≈ 20 líneas y su comentario). `_cuentasArr()` conserva solo la garantía que sí hace falta: si `S.cuentas` no existe o le falta Nequi o Efectivo (documento nuevo, nube vacía, backup sin `cuentas`), los crea en 0. `load()` llama a `_cuentasArr()` para que ese estado se guarde.
- `configuracion.js`: `leerArchivoImport()` ya no llama a la migración. `_validarEstructuraJSON()` deja de reconocer los campos viejos y, si un backup los trae sin `cuentas`, lo rechaza con "Este backup usa el formato anterior de cuentas y ya no se puede importar." (antes se convertía; ahora importarlo habría dejado Nequi, Efectivo y las personalizadas en cero sin avisar).
- Dejan de tener sentido y se pueden borrar del repo: `probar-migracion.js` (raíz) y cualquier test de la migración en `tests/`.
- **Tests:** doce tests fallaron en CI porque cargaban los saldos con los campos viejos (`nequiSaldo`, `efectivoSaldo`, `cuentasPersonalizadas`) y dependían de que la migración los convirtiera: 7 en `calcPatrimonioTotal.test.js`, 2 en `calcHealthScore.test.js`, 1 en `deudas.test.js` y 2 en `totalPrestadoPendiente.test.js`. Se actualizaron para armar `S.cuentas` directamente (helper `cuentas({ nequi, efectivo, custom })`); las comprobaciones no cambian. Con los archivos nuevos pasan los 32 tests de esos cuatro archivos; los otros 154 de la suite ya pasaban en CI.

**Verificación:** prueba con `S` vacío (crea las dos cuentas fijas en 0), con `S.cuentas` parcial (conserva saldo de Nequi y la personalizada, agrega Efectivo; idempotente) y con la validación de backups (formato viejo rechazado, formato nuevo aceptado, `cuentas` que no es array y objeto sin campos conocidos siguen dando error). `node --check` limpio. No se probó la importación de un archivo real en el navegador.

### 🔧 Refactor (2026-10-05) — Gastos y Spotify arman el selector de cuentas de salida con `FuentesFiltro.optsHtml()` (`gastos.js`, `spotify.js`, `sw.js`)

**Antes:** `abrirPagarGastoFijo()` (Gastos), `openSheet_pagarSpotify()` y `_spPagarSplitFuentesOpts()` (Spotify) filtraban con `FuentesFiltro.filtrar()` y luego escribían las `<option>` a mano, reimplementando lo que `FuentesFiltro.optsHtml()` ya hace para el split de gasto variable.

**Ahora:** los tres llaman a `optsHtml()` con su preset (`SALIDA` / `SPOTIFY`). Salida idéntica, comprobada con el `fuentes-filtro.js` real en tres escenarios de saldo (cuenta con saldo, saldos mínimos, ninguna cuenta; con y sin cajita preseleccionada; nombre con `<b>`). **Única diferencia visible:** en las filas del split de pago de Spotify la opción vacía "Selecciona una cuenta..." deja de estar bloqueada (`disabled`), igual que en el split de Gastos. Los selects donde la plata ENTRA no se tocaron: `optsHtml()` filtra por saldo y una cuenta vacía es un destino válido. `sw.js` pasa a `mis-finanzas-v17` para que los dispositivos descarguen los archivos nuevos.

### 🔧 Corrección (2026-10-05) — Spotify mostraba el nombre de la cuenta sin escapar en 3 avisos de "saldo/cupo insuficiente"; ahora Gastos y Spotify validan con una sola función (`core-state.js`, `gastos.js`, `spotify.js`)

**Hallazgo real:** en `confirmarPagarSpotify` (Pagar Spotify) tres `toast()` armaban "Saldo/Cupo insuficiente en …" con `fuenteLabel()` sin pasar por `escHtml()`, y `toast()` inserta el mensaje con `innerHTML`. El nombre de una cuenta personalizada o de una cajita es texto libre, así que era el mismo patrón ya corregido en Cuentas, Gastos, Mesada y Encargos. Gastos sí escapaba.

**Causa de fondo:** la comprobación "¿alcanza el saldo/cupo?" estaba escrita a mano en cada módulo, con redacción distinta (`— disponible:`, `. Disponible:`, `(…)`) y cada uno decidía por su cuenta si escapaba.

**Ahora:** `validarSalidaFuente(fuente, monto)` en `core-state.js` devuelve `{ok, mensaje}` con el mensaje ya escapado. Reglas: cuenta o cajita falla si saldo < monto; TC falla solo si tiene cupo configurado y no alcanza; fuente vacía, TC sin cupo o TC inexistente no bloquean. `gastos.js` (`addGastoVar`, modo simple y dividido) y `spotify.js` (`confirmarPagarSpotify`: dividido, TC y cuenta) la usan; el mensaje queda "Saldo insuficiente en X. Disponible: $N" / "Cupo insuficiente en X. Disponible: $N" en ambos. **Cambio visible:** en Gastos el texto pasa de "— disponible:" a ". Disponible:". Además `pgfActualizarSaldo()` y `confirmarPagarGastoFijo()` usan `getSaldoFuente()` en vez del alias `getSaldoActual()` (misma función).

**No se tocó:** las validaciones de Cuentas (`validarTransferencia`, restar dinero, salida de Nu) ni los mensajes en línea de gastos fijos ("Necesario: …"), por tener tests y otra redacción.

**Verificación:** prueba con 9 casos de la función nueva (igual al saldo pasa, uno más falla, efectivo en 0, TC con y sin cupo, TC inexistente, fuente vacía, nombre con `<b>` escapado); `node --check` limpio en los tres archivos. Los tests existentes de Gastos y Spotify no se corrieron: si alguno compara el texto del aviso, hay que actualizarlo.

### 🔧 Cambio (2026-10-05) — El detalle de Nu usa el mismo estilo compartido que las demás cuentas, y se borró el código sin uso de cajitas (`cuentas.js`, `index.html`)

**Antes:** el hero y los tres botones del detalle de Nu repetían `rgba(192,96,240,…)` y `var(--nu-light)` en estilos inline (unas 10 veces), mientras Nequi, Efectivo y las personalizadas ya usaban `.cuenta-hero` y `.cuenta-action-btn--*` con `--cuenta`/`--cuenta-rgb`.

**Ahora:** `renderDetalleCuenta('nu')` pone `--cuenta`, `--cuenta-rgb`, el título y el rótulo "Total Nu" desde el descriptor de Nu; el hero es `.cuenta-hero` (con `.cuenta-hero-label` y `.cuenta-hero-saldo`), los botones son `--cuenta` (Entró plata), `--rojo` (Salió plata) y `--azul` (Mover a otra cuenta), y el bloque de tasa/chequeo usa las variables. El historial de Nu recibe el color del descriptor. Cambiar el color de Nu en `CUENTAS_FIJAS` cambia selector y detalle a la vez. Ids sin cambios (`nuTotalDisp`, `btn-nu-entro`, `btn-nu-salio`, `btn-transferir-nu-det`), así que el ocultar saldos y los listeners siguen igual. El detalle de cajita (`#cuentas-detalle-cajita`) y las tarjetas de cajita conservan su morado propio; no se tocaron.

**Código sin uso eliminado:** `toggleCDT()`, `toggleCajita()` y `_expandCajitaCDTs()` (≈85 líneas): sin ningún llamador en los archivos revisados y trabajaban sobre ids (`cajita-wrap-*`, `cajita-cdt-*-*`) que el render actual no genera.

### 🔧 Cambio (2026-10-05) — El título del detalle de Nu lleva el mismo ícono que las demás cuentas (`cuentas.js`, `index.html`)

**Antes:** el detalle de Nequi, Efectivo y las personalizadas mostraba ícono + nombre en el header (lo pintaba `_renderDetalleSimple`), pero el de Nu era un `<div>` escrito a mano en `index.html` con el texto "Nu" y nada más.

**Ahora:** el bloque ícono + nombre salió de `_renderDetalleSimple` a un helper, `_tituloCuentaHtml(d)`, y lo usan los dos detalles. El título de Nu tiene id `det-nu-nombre` y `renderDetalleCuenta('nu')` lo pinta con el descriptor de Nu (`CUENTAS_FIJAS_SELECTOR`), la misma fuente del selector. Se agregó `flex:1;min-width:0` al título de Nu, igual que el de las otras cuentas. No cambia ningún dato ni saldo. El header de una cajita (`#cajita-det-nombre`) no se tocó a propósito: una cajita no es una cuenta.

### 🔧 Refactor (2026-10-05) — Nombre, color y badge de Nequi/Nu/Efectivo en un solo lugar: `CUENTAS_FIJAS` (`core-state.js`, `cuentas.js`)

**Antes:** esos tres datos estaban repetidos en `fuenteLabel()`, `fuenteBadgeClass()`, `getFuentes()`, `getFuentesSinTC()` (`core-state.js`) y en `CUENTAS_FIJAS_SELECTOR` (`cuentas.js`). Además `getFuentes()` y `getFuentesSinTC()` eran dos copias casi idénticas que solo diferían en las tarjetas de crédito.

**Ahora:** `CUENTAS_FIJAS` + `getCuentaFija(fuente)` en `core-state.js` (carga de entrada) guardan `{fuente, nombre, color, rgb, badge}`. Las cuatro funciones del núcleo la leen; `getFuentes()` y `getFuentesSinTC()` son envoltorios de `_listaFuentes(incluirTC)`; y `CUENTAS_FIJAS_SELECTOR` se arma como `CUENTAS_FIJAS` + `_SELECTOR_FIJAS_EXTRA` (estilo del selector, ícono y saldo, que son lo único que solo `cuentas.js` puede aportar porque es lazy y `nuTotal()` es suyo). Comportamiento idéntico: mismas etiquetas, mismas clases de badge, misma lista y orden de cuentas, mismos descriptores del selector.

**Verificación:** script contra los archivos anteriores y los nuevos (con las funciones extraídas y datos de prueba: cajita normal y de CDT, TC activa y cerrada, cuenta personalizada, y trece valores de `fuente` incluyendo ids inexistentes, `''`, `alcancia`, `ganancia` y desconocidos). `getFuentes()`, `getFuentesSinTC()`, `fuenteLabel()` y `fuenteBadgeClass()` devuelven exactamente lo mismo, y los tres descriptores de `CUENTAS_FIJAS_SELECTOR` quedan iguales (salvo el campo nuevo `badge`). `node --check` limpio en `core-state.js` y `cuentas.js`. No se probó en navegador.

### 🔧 Corrección (2026-10-05) — Revisión de `cuentas.js`: salidas que superaban el saldo, chequeo de Nu con campos sin anotar y RTE 0 de un CDT (`cuentas.js`)

Revisión de las funciones de `cuentas.js` que mueven plata y no se habían leído (chequeo de Nu, CDT, agregar/restar, movimientos de Nu, apertura). Cuatro defectos reales, cada uno reproducido con un test contra el código anterior antes de arreglarlo:

1. **Restar dinero (`confirmarRestarDinero`) y "Salió plata de Nu" (`confirmarNuMovimiento`) permitían sacar más de lo que había.** `descontarFuente()` recorta el saldo en 0, pero `registrarSalida()` guardaba el movimiento con el monto COMPLETO: restar 20.000 de una cuenta con 5.000 la dejaba en 0 con un movimiento de −20.000, el historial no cuadraba con el saldo y, al borrar ese movimiento, `sumarFuente(monto)` devolvía 20.000 (15.000 inventados). La pantalla solo pintaba el resultado en rojo, sin bloquear. Ahora se rechaza con "Saldo insuficiente en X (saldo)", comparando en centavos (misma regla y mismo mensaje que `gastos.js`, `spotify.js` y Transferir). En Nu la comprobación va antes de materializar intereses para no dejar la cajita modificada a medias.
2. **Chequeo rápido de Nu (`guardarChequeoNu`): un campo tocado y dejado en `0,00` se guardaba como "esta cajita tiene $0".** `money-input.js` rellena `0,00` al enfocar y nada lo limpia al salir. Ponía la cajita en 0 (con aviso solo si se alejaba más de max($1.000; 2 %), o sea, en silencio para cajitas chicas) y ensuciaba `S.chequeosNu`. Ahora 0 significa "no anoté"; si de verdad quedó vacía, se registra el retiro como movimiento (lo que ya decía el aviso).
3. **`confirmarCrearCDT` convertía un RTE de 0 en 4** (`parsePct(...)||4`), mientras que `guardarCDT` (editar) sí aceptaba 0. Ahora: vacío = 4, 0 se respeta, texto no numérico o > 100 se rechaza.
4. **Agregar/restar dinero con monto 0 no avisaba nada** (`return` silencioso). Ahora muestra "Ingresa un monto válido".

**Verificación:** `tests/restar-dinero.test.js` (8), `tests/chequeo-nu.test.js` (10) y `tests/nu-cdt.test.js` (12). Contra el código anterior fallan exactamente los casos que reproducen cada defecto y pasan los de control; con los arreglos pasan los 30. **Sin verificar en navegador real.**

**Observaciones sin cambio:** (a) prestar desde una cuenta en `prestado.js` (`_planPrestamo`) no compara el monto con el saldo de origen: medido en la capa de datos, prestar 150.000 desde una cuenta con 100.000 deja la cuenta en 0, la deuda en 150.000 y sube el patrimonio 50.000. No se confirmó si la pantalla lo impide (`FuentesFiltro`, que filtra las cuentas del selector, no estaba entre los archivos revisados); (b) el tuteo y el voseo conviven en los textos (`cuentas.js`, `spotify.js`, `alcancia.js`): puede ser intencional y no se tocó.


### 📝 Documentación (2026-10-04) — Las formas de guardar un movimiento de cuenta, escritas en un solo lugar (`cuentas.md`, `proyeccion-financiera.md`)

Era conocimiento repartido en comentarios de `cuenta-efectos.js`, `cuentas.js` y `movimientos.js`. Ahora `cuentas.md` (§4, "Cómo se guarda un movimiento de una cuenta") separa movimiento **manual** (siempre `S.movimientos`) de **espejo** (una forma por tipo de cuenta: Nequi/Efectivo en `S.movimientos` con `entrada`/`salida`; personalizada en `c.movimientos` con `ingreso`/`egreso`; cajita en `cajita.historial`), explica los gemelos viejos de las personalizadas, lista lo que no pasa por `registrarMovEspejo()` a propósito (Me deben, Mesada, Alcancía, Encargos) y deja escrito el acoplamiento entre el `tipo` mostrado y el borrado de `movimientos.js`. §3 suma dos reglas: los espejos nuevos nacen con `_esEspejo`, y no unificar `egreso`/`salida_manual` sin tocar el borrado. `proyeccion-financiera.md` citaba `S.nequiSaldo`, `S.efectivoSaldo` y `S.cuentasPersonalizadas` (reemplazados por `S.cuentas` el 2026-10-01); corregido. Sin cambios de código.


### 🔧 Refactor (2026-10-04) — El historial de una cuenta lo arma UNA sola función (`cuentas.js`)

**Antes:** `getMovimientosCuenta()` (Nequi, Efectivo, cajitas) y `_getMovimientosCuentaCustom()` (personalizadas) eran dos funciones casi gemelas (184 y 148 líneas); cuatro bloques (gastos, préstamos dados, transferencias, Spotify) estaban duplicados casi palabra por palabra y ya se habían desviado: la personalizada no mostraba `cat`/`nota` de un gasto, ni la etiqueta "Encargos", ni las otras cuentas de un préstamo dividido, y un movimiento de Mesada en una personalizada salía como "Movimiento manual". Cada arreglo había que hacerlo dos veces (Spotify, Alcancía y transferencias se corrigieron en las dos, una por una).

**Ahora:** `getMovimientosCuenta(tipo)` es la única función, con un bloque por fuente y un predicado `coincide(fuente)` (`'nu'` = cualquier cajita; el resto, la fuente exacta). `_getMovimientosCuentaCustom` desaparece. Se quitaron además las ramas de Alcancía que quedaban dentro de un bloque que ya hacía `return` antes (código muerto en las dos funciones).

**Diferencias que se conservan a propósito** (opciones explícitas, comentadas en el código): (1) el tipo de una salida manual: `'egreso'` en personalizadas y `'salida_manual'` en las demás — `movimientos.js` elige la rama de borrado y de reversión de saldo por ese tipo, así que unificarlo habría roto el borrado; (2) la lista propia: `c.movimientos` entera y leída primero (personalizadas) vs `cajita.historial` solo `_secundario` y después (cajitas); (3) el texto cuando no hay descripción; (4) el salto del gemelo viejo de S.movimientos.

**Cambios visibles (solo cuentas personalizadas, todos aditivos):** un gasto ahora trae categoría y nota, y se etiqueta "Encargos" si su nota lo menciona; un préstamo dividido entre cuentas muestra las otras cuentas; un movimiento secundario (Mesada, etc.) usa su sección de origen en vez de "Movimiento manual". Nequi, Efectivo y cajitas: resultado idéntico campo por campo.

**Verificación:** `tests/historial-cuenta.test.js` (28 tests). Prueba dorada: compara la función nueva con las dos anteriores, congeladas en `tests/support/historial-legacy.js`, sobre los mismos datos (fixture con ~90 registros: manuales, aperturas, intercambios de Encargos, espejos, Alcancía, gastos, préstamos simples y divididos, Spotify con abonos y sin id, transferencias, gemelos viejos, filas sin id) para 6 cuentas: mismas filas, mismo orden, y solo difieren los cambios deliberados, cada uno con su valor esperado. 12 mutaciones (perder el salto del gemelo, unificar el tipo de salida, mostrar el ingreso de Alcancía, contar pagos de Spotify, no restar abonos, perder transferencias entrantes o préstamos divididos, listar espejos no secundarios, perder `c.movimientos`, que Nu deje de juntar las cajitas, invertir el desempate) hacen fallar entre 2 y 11 tests. **Sin verificar en navegador real.** `historial-legacy.js` y la comparación son transitorios: se pueden borrar cuando la función lleve un tiempo en producción sin incidencias.


### 🔧 Corrección (2026-10-04) — Una sola definición de "ingreso real" para Inicio, Análisis y Wrapped (`core-state.js`, `inicio.js`, `analisis.js`, `wrapped.js`, `cuenta-efectos.js`)

**Antes:** la pregunta "¿esto cuenta como ingreso del mes?" se respondía en tres sitios, con tres reglas:
- **Inicio** exigía además que la entrada tuviera cuenta (Nequi, Efectivo, cajita, personalizada) o `_prestadoDirectamente`, y sumaba aparte los `ingreso` de `c.movimientos` de las cuentas personalizadas.
- **Análisis y Wrapped** solo miraban `S.movimientos` con el filtro `_esEntradaEspejoNoIngreso`: no veían `c.movimientos` ni exigían cuenta.

Dos divergencias reales: una entrada sin cuenta ni bandera contaba en Análisis/Wrapped y no en Inicio (así falló el perdón de "Yo debo"), y un ingreso que solo vive en `c.movimientos` (p. ej. el extra de un préstamo que cae en una cuenta personalizada, porque `registrarMovEspejo` escribe ahí) contaba en Inicio y no en Análisis/Wrapped. Con un mismo conjunto de datos de prueba, Inicio daba 126.600 y Wrapped 122.311 para el mismo mes.

**Regla única** (decisión del 2026-10-04): ingreso real = plata nueva que sube el patrimonio, tenga o no cuenta. Se implementa una vez, en `core-state.js`:
- `entradasIngresoReal(estado?)` devuelve la lista de movimientos que cuentan: `S.movimientos` tipo `entrada` que no sean espejo + `c.movimientos` tipo `ingreso` que no sean espejo; los datos viejos escritos en las dos listas con el mismo id (`confirmarMovCustom()`, retirada) se cuentan una vez. Recibe el estado porque Wrapped trabaja sobre el `S` que le pasan.
- `ingresosRealesDelMes(mes, estado?)` suma esa lista por mes. La mesada y los ingresos fijos los sigue sumando cada pantalla aparte.
Inicio (`calcHealthScore`), Análisis (balance del mes y del mes anterior) y Wrapped (periodo, año y "mayor ingreso") la usan. Se borraron las tres copias de la lógica.

**Espejos marcados por defecto:** `registrarMovEspejo()` ahora marca todo espejo nuevo con `_esEspejo: true`, y `_esEntradaEspejoNoIngreso()` lo respeta (después de `_esExtraIngreso`, `_esPerdonRecibido` y `_esDiferencialEncargo`, que tienen prioridad: un espejo que sea plata nueva se marca con esas banderas vía `extra`). Así un módulo nuevo es seguro por defecto y ya no depende del texto de `desc` ni de que su `_origenSeccion` empiece por "Prestado". Los datos anteriores no tienen la bandera y siguen cayendo en los fallbacks por texto/prefijo, que **no** se borraron.

**Qué puede cambiar en pantalla:** Inicio puede subir si hay entradas reales sin cuenta ni bandera (el diagnóstico `diagnostico-ingresos.js` sobre los datos reales dio 0 de esas). Análisis y Wrapped pueden subir si hay ingresos que solo viven en `c.movimientos` (a comprobar con `diagnostico-ingresos-cuentas.js`). Si ambos dan vacío, ninguna cifra cambia.

**Verificación:** `tests/ingreso-real.test.js`, 17 tests con `load-app.js`: qué cuenta y qué no (sueldo, regalo, sin cuenta, perdón, extra, diferencial; espejos de Mesada/Prestado, reposiciones, márgenes viejos, intercambios, alcancía destapada), cuentas personalizadas (solo en cuenta, espejos, gemelos viejos una sola vez), espejos nuevos nacen marcados, y Inicio / `ingresosRealesDelMes` / Wrapped dan la misma cifra con los mismos datos. Los 17 fallan contra el código anterior y pasan con el nuevo; 6 mutaciones (no filtrar espejos de cuenta, quitar el dedupe del gemelo, quitar `_esEspejo` en el filtro o en `registrarMovEspejo`, Wrapped o Inicio con su regla vieja) hacen fallar entre 1 y 4 tests. **Sin verificar en navegador real.**


### 🔧 Corrección (2026-10-04) — Transferir: una sola función valida toda la transferencia, y un monto negativo ya no pasa (`cuentas.js`)

**Antes:** `_trValidarMonto()` solo validaba la regla del monto (centavos y mínimo con Efectivo). El resto (cuentas faltantes, origen = destino, monto vacío, saldo) estaba escrito dos veces: en `actualizarTransfPreview()` y en `confirmarTransferir()`. Además `confirmarTransferir()` solo comprobaba `!monto`, así que un monto **negativo** pasaba todas las validaciones (`_trValidarMonto` lo ignoraba, y el saldo es mayor que un negativo) y llegaba a `descontarFuente(origen, -X)`, que **suma** al origen y resta del destino. Revisado `money-input.js`: el campo bloquea todo salvo dígitos (teclado) y el pegado solo acepta números > 0, así que **desde la pantalla no se podía llegar a un monto negativo**. Era un hueco latente (cualquier otro camino que llame a la función, o un cambio futuro en el input), no un bug activo; ahora la validación no depende del input.

**Ahora:** `validarTransferencia({origen, destino, monto, saldoOrigen, etiquetaOrigen})` devuelve `{ok:true}` o `{ok:false, codigo, mensaje}` (`falta_cuenta`, `mismo`, `sin_monto`, `monto`, `saldo`). Rechaza monto no numérico, NaN, Infinity, 0 y negativos. La vista previa y la confirmación la usan, así que dicen lo mismo. `_trValidarMonto` desaparece (solo la usaban esos dos sitios). Las reglas de negocio no cambian.

**Cambios de comportamiento (deliberados):** (1) monto negativo o no finito → "Ingresa un monto válido" y no se escribe nada; (2) con origen y destino vacíos la vista previa ya no dice "deben ser diferentes", queda en blanco; (3) el aviso de saldo insuficiente ahora lo da la misma función en la confirmación (mismo texto, mismo escape del nombre de cuenta).

**Verificación:** `tests/transferir.test.js`, 24 tests con `node --test`, que cargan `core-state.js`, `calc-helpers.js`, `cuenta-efectos.js` y `cuentas.js` reales con `tests/support/load-app.js` (modo `permissive`; `getSaldoActual`, que vive en `index.html`, se enlaza a `getSaldoFuente`) y usan los saldos reales de `S.cuentas`: centavos (cajita↔cajita sí; con Nequi, Efectivo o personalizada no), mínimo $50 con Efectivo en las dos direcciones, saldo comparado en centavos, orden de los avisos, y que cada rechazo no llama `descontarFuente`/`sumarFuente`, no guarda y no cierra el sheet. Probado también por mutación: quitar la regla de centavos, el mínimo, el saldo o la comprobación origen = destino hace fallar entre 2 y 4 tests; el rechazo de montos ≤ 0 tiene dos guardas redundantes a propósito y los tests fallan solo si se quitan las dos. **Sin verificar en navegador real.**


### 🔧 Corrección (2026-10-02) — El botón "ocultar saldos" vuelve a ocultar el selector y el detalle de cuentas (`mejoras-adicionales.js`)

**Causa:** el módulo apuntaba a elementos que desaparecieron al unificar las cuentas (etapas 1 y 2). `MONEY_SELECTORS` listaba `#sel-nequi-saldo`, `#sel-nu-saldo`, `#sel-ef-saldo`, `#det-nequi-saldo`, `#det-ef-saldo` y `#det-custom-saldo`, y `SALDO_DINAMICO_IDS` observaba `#custom-cuentas-list`. Ningún selector coincidía con el HTML nuevo, así que el botón cambiaba de ícono pero no ocultaba nada de esas pantallas.

**Ahora:**
- `SALDO_DINAMICO_IDS`: `custom-cuentas-list` → `selector-cuentas-lista`. Es el mecanismo correcto para el selector: `renderSelectorCuentas()` reescribe todo el contenedor con `innerHTML` en cada `refresh()`, y esa lista envuelve cada monto `$…` en un `<span class="saldo-inline">` y lo vuelve a envolver con un `MutationObserver` tras cada repintado. Cubre Nequi, Nu, Efectivo y las personalizadas con un solo contenedor (antes Nequi, Nu y Efectivo eran elementos fijos con clase puesta una vez; ese enfoque no sirve con elementos que se recrean).
- `MONEY_SELECTORS`: se quitan los seis ids muertos y se agrega `#det-cuenta-saldo` (saldo del detalle unificado; es un elemento fijo, solo cambia su texto).
- Los nombres de las cuentas siguen visibles: solo se oculta el monto.

**Verificado en jsdom** con el `mejoras-adicionales.js` real y el `index.html` real (13 comprobaciones): arrancar con saldos ocultos restaura el estado, el botón alterna selector y detalle, y los saldos siguen ocultos (o visibles) tras volver a repintar el selector. `hookGlobal` se estubeó (viene de `js/core/hook-global.js`). Sin probar en navegador real.

**Observación (sin cambiar):** los montos de la lista de movimientos del detalle de una cuenta (`#det-cuenta-movs`, antes `#det-nequi-movs`, etc.) no figuraban en `SALDO_DINAMICO_IDS` ni usan `.row-amount`, así que el botón nunca los ocultó.

### 🔧 Corrección (2026-10-02) — Búsqueda global muestra el nombre de la cuenta (no su id) y las flechas del selector quedan iguales

- **`busqueda-global.js`:** en los resultados de "Movimiento" el meta mostraba `m.fuente` crudo (`cajita:mpkdex5cksh`, `custom:mtrq491i8sj`, `nequi`). Ahora pasa por `fuenteLabel()` vía un helper `_fuenteTexto()`: `nequi` → "Nequi", `cajita:ID` → "Nombre (Nu)", `custom:ID` → nombre de la cuenta, `tc:ID` → nombre de la tarjeta. Dos casos que `fuenteLabel()` no resuelve a texto se cubren en el helper: `ganancia` (devuelve un SVG, que `escHtml` mostraría como texto) y una cuenta personalizada ya borrada (devuelve el id crudo; ahora muestra "Cuenta eliminada").
- **`styles.css`:** la flecha de las tarjetas (Nequi, Nu) usaba el color de la cuenta al 40 % de opacidad; la de las pastillas (Efectivo y personalizadas) usa el color completo. Ahora la tarjeta usa también `var(--cuenta)` completo, como la pastilla (se mantiene su posición abajo a la derecha).

### 🔧 Corrección (2026-10-02) — "Gastos altos" cuenta las cuentas personalizadas y `encargos.js` protege `cuentaActual`

- **`inicio.js` (chequeo de "Gastos altos"):** el disponible contra el que se compara el 80 % era `nu + nequi + ef`; ahora suma también las cuentas personalizadas (`cuentasCustom()`), igual que el "Disponible" del hero (`refresh()`) y `liquidoReal` del mismo archivo. Efecto visible: quien tenga saldo en cuentas personalizadas deja de ver el aviso cuando solo lo disparaba haber dejado esa plata fuera de la cuenta. Sin saldo en personalizadas el resultado es idéntico al anterior. Es una decisión de criterio (no un error de sintaxis): si se prefiere el cálculo anterior, es borrar la línea `custom` y su suma.
- **`encargos.js` (`eliminarMovimientoEncargo`):** `cuentaActual` se leía sin `typeof`. Vive en `cuentas.js` (lazy), así que si ese módulo no estaba cargado, borrar un movimiento de un encargo tiraba `ReferenceError` justo antes de reabrir el detalle del encargo. Ahora usa el mismo guard que `refresh()`, `sheet-stack.js` y `movimientos.js`. Con el estado único de la etapa 3 también repinta la cuenta abierta cuando es personalizada.

### 🔧 Cambio (2026-10-01) — Modelo único de cuentas: `S.cuentas` reemplaza a `S.nequiSaldo`, `S.efectivoSaldo` y `S.cuentasPersonalizadas` (etapa 3 de 3)

**Causa:** Nequi y Efectivo eran dos números sueltos, las personalizadas una lista aparte, y `save()` volvía a leer los dos números de inputs ocultos del DOM (`#nequiSaldo`, `#efectivoSaldo`) — cada módulo que movía plata tenía que acordarse de espejar el input antes de guardar (ver el bloque "Sincronizar DOM antes de save()" de `alcancia.js`). Además cada módulo repetía su propio `(S.cuentasPersonalizadas||[]).find(x=>x.id===id)` (una treintena de veces) y había dos variables de estado para la cuenta abierta.

**Ahora:**
- **Datos:** `S.cuentas = [{id:'nequi',tipo:'nequi',saldo}, {id:'efectivo',tipo:'efectivo',saldo}, ...personalizadas {id,tipo:'custom',nombre,icono,color,saldo,movimientos}]`. Las personalizadas conservan su forma de siempre (más `tipo:'custom'`); Nu sigue en `S.cajitas`. El identificador de fuente no cambia (`'nequi' | 'efectivo' | 'custom:ID'`). `S` ya no trae los tres campos viejos por defecto.
- **`core-state.js`:** helpers `getCuenta(id)`, `getCuentaCustom(id)`, `cuentasCustom()`, `getCuentaDeFuente(fuente)` y `migrarCuentasLegacy()`. `sumarFuente()`, `descontarFuente()` y `getSaldoFuente()` tratan Nequi, Efectivo y personalizadas por el mismo camino (misma semántica: piso en 0, `exacto` sin piso). `save()` ya no relee saldos del DOM; `load()` migra. Los inputs `#nequiSaldo` / `#efectivoSaldo` se eliminan de `index.html`.
- **Migración (`migrarCuentasLegacy`):** idempotente; corre en `load()` (que ya se llama tras cada hidratación desde Firestore y en cada snapshot), en `importarJSON()` y en cada lectura. Si `S` trae alguno de los campos viejos, son la verdad: se arma `S.cuentas` desde ellos y se borran. Eso cubre documentos de la nube anteriores al cambio, backups JSON viejos y dispositivos con la versión anterior. Excepción deliberada: un valor viejo en 0 (o una lista vieja vacía) no pisa una cuenta que ya tiene saldo — un cliente viejo que abre un documento ya migrado no ve ningún saldo y, si guarda, devuelve ceros.
- **Estado único de cuenta abierta:** `cuentaActual` ahora guarda la fuente completa (`'custom:ID'` para las personalizadas) y se elimina `_customCuentaActualId` (y `_fuenteAbierta()`). `refresh()`, `sheet-stack.js`, `movimientos.js` y `cuentas.js` dejan de tener dos ramas.
- **Resto de módulos** (`cuentas`, `movimientos`, `alcancia`, `inicio`, `busqueda-global`, `actividad_reciente`, `encargos`, `mesada`, `plata_comprometida`, `prestado`, `wrapped`, `configuracion`): los `find` repetidos pasan a `getCuentaCustom(id)`, los recorridos a `cuentasCustom()` y las lecturas de Nequi/Efectivo a `getSaldoFuente()`. `crearCuentaCustom()` agrega a `S.cuentas` con `tipo:'custom'` y `eliminarCuentaCustom()` filtra `S.cuentas`. En `actividad_reciente.js` la etiqueta interna `fuente:'cuentasPersonalizadas'` pasa a `'cuenta_custom'` (nadie la leía). `importarJSON()` valida `cuentas` y convierte backups viejos con `migrarCuentasLegacy()` antes de repintar.
- **`probar-migracion.js`** (nuevo, raíz del proyecto): prueba en seco con una copia de tus datos (`node probar-migracion.js backup.json js/core/core-state.js`). Usa el `migrarCuentasLegacy()` real, compara saldos antes/después, comprueba que no cambie nada más, que sea idempotente y que sobreviva un viaje por JSON.

**Cambio de formato en la nube:** el documento de Firestore pasa a traer `cuentas` y deja de traer los tres campos viejos. Una versión anterior de la app (PWA en caché de otro dispositivo, o revertir el código) no sabe leer `cuentas`: vería todos los saldos en 0. Por eso, después de desplegar: recargar con caché limpia en cada dispositivo y no abrir una versión vieja. Antes de desplegar: exportar un backup JSON desde Configuración.

**Hallazgos de esta etapa:** `inicio.js` calculaba `disp = nu + nequi + ef` (sin personalizadas) en la comprobación de "Gastos altos", y `encargos.js` referenciaba `cuentaActual` sin `typeof`. Ambos se corrigen en la entrada siguiente.

**Verificado** con el código real: migración (21 casos: documento viejo, ida y vuelta por JSON, backup viejo importado, cliente viejo en ceros, valores no cero, S vacío), `core-state.js` completo cargado sobre el `index.html` real (`load()`, movimientos de saldo, `calcPatrimonioTotal()`, `refresh()`, `save()` y payload sin campos viejos), `alcancia._sumarASaldo`, validación de backups y las pruebas del selector y del detalle de las etapas 1 y 2 (49 comprobaciones). Sin probar en navegador real ni contra Firestore.

### 🔧 Corrección (2026-10-01) — `movimientos.js`: `_rerenderCuentaActiva()` ya no llama a `abrirCustomCuenta()` (resto de la etapa 2)

`_rerenderCuentaActiva()` (se usa al borrar un movimiento) tenía una rama para cuentas personalizadas que llamaba a `abrirCustomCuenta()`, eliminada al unificar el detalle de cuentas simples. La rama además estaba muerta desde antes: comparaba `cuentaActual === 'custom'`, pero una cuenta personalizada abierta deja `cuentaActual` en `''` (su identificador es `_customCuentaActualId`), así que la función salía en la primera línea y quien refrescaba el detalle era `refresh()`. Ahora vuelve a pintar la cuenta abierta con `renderDetalleCuenta()` (fuente `'custom:ID'` para las personalizadas) y usa `typeof` para las dos variables, que viven en `cuentas.js` (grupo lazy). Verificado en jsdom; sin probar en navegador real.

### 🔧 Cambio (2026-10-01) — Detalle de cuenta unificado: Nequi, Efectivo y las personalizadas comparten una sola pantalla (etapa 2 de 3)

**Causa:** el detalle de una cuenta simple estaba escrito tres veces: `cuentas-detalle-nequi`, `cuentas-detalle-efectivo` y `cuentas-detalle-custom` en `index.html` (HTML casi idéntico), con ids por cuenta (`det-nequi-saldo`, `det-ef-movs`, `btn-agregar-efectivo-det`, …), tres ramas en `abrirCuenta`/`renderDetalleCuenta`/`volverSelector`, una función aparte para las personalizadas (`abrirCustomCuenta` + `renderMovsCustom`) y una rama duplicada de esa misma lógica dentro de `refresh()`.

**Ahora:**
- `index.html`: un solo `#cuentas-detalle-simple` (header con editar/eliminar solo para personalizadas, hero, banner de saldo inicial, encargos, filtros y movimientos). Salen 130 líneas de HTML. Nu conserva su pantalla propia (`cuentas-detalle-nu`: cajitas, CDTs, chequeo de tasa).
- `cuentas.js`: `abrirCuenta(fuente)` acepta `'nequi' | 'nu' | 'efectivo' | 'custom:ID'`; `renderDetalleCuenta(fuente)` delega en `_renderDetalleSimple()`, que lee el descriptor de la cuenta (los mismos de la etapa 1, ahora con `etiquetaDetalle`, `cuentaKey`, `esCustom` e `iconoHtml(size)`; helper `_descriptorCuenta(fuente)`). Se eliminan `abrirCustomCuenta()` y `renderMovsCustom()`. Los botones del detalle son un único listener delegado sobre `#cuentas-detalle-simple` que actúa sobre `_fuenteAbierta()`. `actualizarBotonesTransferir()` maneja un solo botón. `renderMovsCuenta()` recibe un 5º parámetro opcional con el id del contenedor de filtros.
- `core-state.js`: `refresh()` ya no tiene una rama aparte para la cuenta personalizada abierta; llama a `renderDetalleCuenta(fuente)` en los dos casos.
- `sheet-stack.js`: el hook de `showScreen('cuentas')` llama a `renderSelectorCuentas()` (cierra el cambio pendiente de la etapa 1) y re-renderiza la cuenta abierta con `renderDetalleCuenta()`; el banner de saldo inicial pasa a ser uno solo (`banner-apertura-cuenta`).
- `styles.css`: `.cuenta-hero*` y los modificadores `.cuenta-action-btn--cuenta|rojo|azul`, con el color por las mismas variables del selector.

**Bugs que se corrigen de paso:**
- El hook de `showScreen('cuentas')` llamaba a `renderDetalleCustomCuenta()`, una función que nunca existió: el detalle de una cuenta personalizada abierta no se re-renderizaba al volver a la pantalla.
- `refresh()` solo actualizaba saldo, movimientos y encargos de la cuenta personalizada abierta; ahora repinta todo (banner, botón de transferir deshabilitado según saldo).
- Las cuentas personalizadas nunca mostraron el banner "Registrar saldo inicial": el código escribía en `banner-apertura-custom`, pero ese div no existía en `index.html`. Ahora lo tienen, y respetan el toggle "Saldo inicial" de Configuración.
- Los filtros de movimientos de una pantalla compartida: los listeners de `renderMovsFiltros()` cerraban sobre `cuentaKey`, lo que con un contenedor compartido habría filtrado siempre la primera cuenta abierta. Ahora leen `wrap._movsKey`, que se actualiza en cada render.

**Se mantiene a propósito (contratos que pueden leer módulos que no se revisaron):** `cuentaActual` y `_customCuentaActualId` siguen siendo dos variables, y `cuentaKey` sigue valiendo `'nequi' | 'efectivo' | 'custom' | 'nu'` (es lo que `abrirDetalleMov()` lee de `data-cuenta-key`). Se unifican en la etapa 3.

**Los inputs ocultos `nequiSaldo` / `efectivoSaldo`** vivían dentro de las pantallas eliminadas y `core-state.js` los escribe sin guard (`getElementById('nequiSaldo').value=…`); borrarlos habría roto cada movimiento. Se movieron fuera de las pantallas, con un comentario; se eliminan en la etapa 3.

**Cambios visuales mínimos:** el header de Nequi y Efectivo ahora lleva el ícono de la cuenta (como las personalizadas); el rótulo del saldo usa el mismo 70 % de opacidad en las tres.

**Verificado en jsdom** con el `index.html` real y el código real: navegación y estado de las cuatro cuentas, color, rótulos, botones (agregar/retirar/transferir/editar/eliminar con la fuente correcta), cuenta borrada, re-render por `refresh()` y filtros con contenedor compartido. Sin probar en navegador real.

### 🔧 Cambio (2026-10-01) — Selector de cuentas dirigido por datos: una sola función pinta Nequi, Nu, Efectivo y las personalizadas

**Causa:** el mismo dato (la pastilla/tarjeta de una cuenta en el selector) se escribía en cuatro lugares: tres bloques de HTML a mano en `index.html` (con su `sel-*-saldo`) escritos desde `refresh()`, más `renderCustomCuentasList()` para las personalizadas. Cambiar el formato en uno y olvidar el otro ya había dejado las personalizadas con decimales el 2026-09-30.

**Ahora:**
- `cuentas.js`: `renderSelectorCuentas()` reemplaza a `renderCustomCuentasList()`. Recorre `CUENTAS_FIJAS_SELECTOR` (descriptores de Nequi, Nu y Efectivo: `fuente`, `nombre`, `color`, `rgb`, `estilo` `'tarjeta'|'pastilla'`, `saldo()`) más `S.cuentasPersonalizadas`, y pinta cada una con `_cuentaSelectorHtml()`. Los logos de Nequi y Nu salen de `ICONOS_CUENTA` (antes estaban duplicados en `index.html`). El clic es un solo listener delegado sobre `#selector-cuentas-lista` (`data-fuente`; `custom:ID` abre `abrirCustomCuenta`, el resto `abrirCuenta`), reemplazando el `querySelectorAll('[data-cuenta]')`.
- `core-state.js`: nueva `fmtSaldoSelector(n)` (hoy = `fmtNoCents`), único punto de formato del selector. Se quitaron de `refresh()` las tres escrituras a `sel-nequi-saldo` / `sel-nu-saldo` / `sel-ef-saldo`; `refresh()` ahora llama a `renderSelectorCuentas()` con el mismo gate de "pantalla Cuentas activa".
- `index.html`: los bloques a mano de Nequi, Nu, Efectivo y `#custom-cuentas-list` (83 líneas) pasan a un único `<div id="selector-cuentas-lista">`.
- `styles.css`: clases `.cuentas-selector-grid`, `.cuenta-card*` y `.cuenta-pill*` con el color por variables (`--cuenta`, `--cuenta-rgb`). El wrap del saldo largo de la tarjeta (`min-width:0`, `overflow-wrap:anywhere`, `padding-right`) se mantiene.

**Cambios visuales mínimos:** el borde de la pastilla de Efectivo pasa de `.3` a `.35` (igual al de las personalizadas) y el fondo del ícono de Nequi/Nu usa el color del catálogo (`#ff4da6`/`#c060f0` al .18) en vez de `rgba(229,0,116,.2)`/`rgba(192,96,240,.2)`.

**Requiere un cambio fuera de estos archivos:** el hook de `showScreen()` en `sheet-stack.js` (rama `name==='cuentas'`) debe llamar a `renderSelectorCuentas()` en vez de `renderCustomCuentasList()` (la función vieja ya no existe). Verificado en jsdom con el código real (render, formato, escape del nombre, orden, clics y un único listener tras re-render); sin probar en navegador real.

**Siguientes etapas previstas:** (2) pantalla de detalle genérica en lugar de las cuatro escritas a mano (`abrirCuenta`/`renderDetalleCuenta` sin `if/else` por cuenta); (3) colección única `S.cuentas` con migración de `S.nequiSaldo`/`S.efectivoSaldo`.

### 🔧 Cambio (2026-09-30) — Selector de cuentas: los saldos de Nequi, Nu y Efectivo se muestran sin decimales

**Antes:** `refresh()` (`core-state.js`) pintaba `sel-nequi-saldo`, `sel-nu-saldo` y `sel-ef-saldo` con `fmt()`, que muestra centavos; un saldo con decimales (ej. Nu con intereses) hacía el número largo dentro de la tarjeta.

**Ahora:** esas tres líneas usan `fmtNoCents()` (solo entero con puntos de mil; trunca, igual que `s-cdt`, `s-gf`, etc.). El detalle de cada cuenta (`nuTotalDisp`, `det-nequi-saldo`, `det-ef-saldo`) y Inicio no se tocaron y siguen con `fmt()`. El wrap de `styles.css` de la entrada anterior queda como red de seguridad. Sin probar en navegador.

**Ampliación (mismo día):** las cuentas personalizadas también — `renderCustomCuentasList()` (`cuentas.js`) usa `fmtNoCents(c.saldo||0)` en la pastilla del selector. El detalle de la cuenta custom (`det-custom-saldo`) sigue con `fmt()`.

### 🔧 Cambio (2026-09-30) — Selector de cuentas: el saldo largo de Nequi/Nu ya baja de línea en vez de salirse

**Causa:** el saldo (`sel-nequi-saldo`, `sel-nu-saldo`) es un solo "palabra" sin espacios, así que no tenía dónde partirse; además la tarjeta es un grid item (`1fr` = `minmax(auto,1fr)`) y crecía con el número, y su `overflow:hidden` recortaba lo que sobraba.

**Fix, solo en `styles.css`:** `min-width:0` en `#cuentas-selector [data-cuenta]` y `overflow-wrap:anywhere` + `line-height:1.25` + `padding-right:16px` (para no pisar la flecha) en los dos saldos. Mismo criterio que `.stat-value`. Sin cambios en JS ni HTML. No se tocó la pastilla de Efectivo (`sel-ef-saldo`), que es flex y tiene el número chico. Sin probar en navegador.

### 🔧 Cambio (2026-10-01) — Detalle de un movimiento con diferencial: se quitó "¿Qué pasó con el precio?" y la explicación en frases

**Antes:** el recuadro decía "¿Qué pasó con el precio? Le dijiste que costó $108.000, pero en realidad costó $107.910. La diferencia de $90 es tu margen." — título confuso y texto largo para algo que solo usa el dueño de la app.

**Ahora:** una línea con "Ganancia por valor diferente" y el monto a la derecha ("Pérdida" en rojo si el margen es negativo), y debajo "Cobrado $108.000 · Real $107.910". Es el bloque `rm.diferencial` de `abrirDetalleMov()` (`movimientos.js`), así que aplica igual a los movimientos de Encargos, Préstamo con TC y Nuevo préstamo. Las líneas de abajo ("Guardaste … en", "Del margen le diste", "Pagaste de tu bolsillo por") quedaron igual. Sin probar en navegador.

### 🔧 Cambio (2026-10-01) — `mov-dif-resumen` ("El valor real era diferente", Nuevo préstamo): ya no se ve ni ocupa espacio vacío

**Causa:** la regla genérica `[style*="min-height"]:empty` solo anula el `min-height`; este div además lleva fondo y `padding` inline, así que vacío se veía como una barra oscura de ~18px dentro del bloque.

**Fix, solo en `styles.css`, scoped por ID:** `#mov-dif-resumen:empty{display:none;}`. `diffReset()` y `diffResumen()` (sin monto real) lo dejan con `textContent=''`, así que aparece solo cuando hay resumen o el aviso "El valor real debe ser menor…". Sin cambios en JS ni HTML. No se tocó `prtc-dif-resumen` (Préstamo con TC), que tiene el mismo markup y sigue mostrando la barra vacía. Sin probar en navegador.

### 🔧 Cambio (2026-09-28) — Hints vacíos de Encargos ya no ocupan espacio (`traspaso_origen_hint`, `traspaso_saldo_hint`, `movenc_cuenta_hint`)

Mismo pedido que el del 2026-09-25 en "Registrar gasto", ahora para tres hints de Encargos: `traspaso_origen_hint` y `traspaso_saldo_hint` (sheet "Me lo regalaron") y `movenc_cuenta_hint` (sheet "Registrar salida de plata" / "Registrar entrada de plata" — es el mismo sheet y el mismo div, `abrirMovEncargo` solo cambia el tipo).

**Causa:** `.field-hint` reserva `min-height:14px` + `margin-top:4px` desde la clase, y la regla genérica `[style*="min-height"]:empty` solo aplica a `min-height` *inline*, así que estos tres divs dejaban un hueco vacío aunque no tuvieran texto.

**Fix, solo en `styles.css`, scoped por ID:** `:empty` colapsa `min-height` y `margin-top` a 0, con `transition` de 180ms al aparecer el texto. No hizo falta la variante `visibility` de `gv_fuente_hint`: estos hints se vacían con `textContent=''` (o quedan `display:none` cuando el select ya pinta el saldo en cada opción), así que `:empty` sí aplica. Sin cambios en JS ni HTML.

**Efecto colateral aceptado:** al elegir una cuenta cuyo hint sí aparece (select sin saldo en la opción), el contenido de abajo se desplaza ~18px, de forma progresiva.

---

### 🔧 Cambio (2026-09-25) — `gv_fuente_hint`/`gv_fuente_saldo` (Registrar gasto): ya no ocupan espacio vacíos

El trade-off aceptado el 2026-09-24 en `mostrarAlertaFuente()` (hueco fijo de ~18px en vez de salto de layout) dejó de gustar puntualmente en el sheet "Registrar gasto" (`gasto-var`). Se revirtió el trade-off ahí, sin tocar `mostrarAlertaFuente()` ni los sheets de Préstamos que la comparten (`mov_fuente_hint`/`mov_destino_hint`, que siguen reservando el espacio).

**Fix, solo en `styles.css`, scoped por ID:**
- `#gv_fuente_hint[style*="visibility: hidden"]` colapsa a `max-height:0;margin-top:0` (con `overflow:hidden` y `max-height:20px` como estado base) — como el toggle es `visibility` (no `textContent`), la regla general `[style*="min-height"]:empty` no aplicaba acá (el div siempre tiene texto, solo invisible).
- `#gv_fuente_saldo:empty` pierde el `margin-top` (ese div sí se vacía con `textContent=''`, así que la regla `:empty` ya colapsaba el `min-height`, pero quedaba el margen).
- Ambos con `transition` (`max-height`/`min-height`/`margin-top`, 180ms) para que el salto sea progresivo en vez de instantáneo — mismo criterio que el `transition` de `.sheet` para el reacomodo de teclado (entrada anterior, 2026-09-24). `max-height` en vez de `height` porque `height:auto` no anima.

**Efecto colateral aceptado a propósito:** sigue habiendo un desplazamiento al elegir cuenta en "Registrar gasto" — es el mismo salto que el fix del 2026-09-24 evitaba, revertido acá a pedido explícito, aunque ahora suavizado con transición en vez de instantáneo. Si en el futuro se quiere lo mismo en Préstamos, extender el mismo selector a `#mov_fuente_hint`/`#mov_destino_hint`.

Comentario agregado en `sheet-stack.js` (junto a `mostrarAlertaFuente()`) documentando la excepción para que no se lea como inconsistencia.

---

### ✅ Corregido (2026-09-25) — Al abrir un sheet con teclado, el contenido pegaba un salto y después se reajustaba solo

**Síntoma:** al enfocar un campo (típicamente el autofocus de `mejoras-adicionales.js`, 250ms después de abrir el sheet), el sheet sube junto con el teclado, pega un salto, y un instante después se corre un poco más — como si se centrara el input en dos pasos en vez de uno.

**Causa raíz:** el reacomodo por teclado (`marginBottom`/`maxHeight`, según cuánto tapa el teclado) y el centrado del campo enfocado (`ensureFocusedVisible`, que hace scroll interno del sheet si el campo quedó tapado) corrían de forma independiente, sin esperarse entre sí:

1. El `marginBottom`/`maxHeight` se aplicaba **instantáneo**, sin transición — un salto seco en vez de un movimiento suave.
2. El centrado del campo tenía su propio temporizador de 350ms desde el `focus`, sin mirar si el reacomodo por teclado ya había terminado de aplicarse. Si el teclado tardaba en animar más que esos 350ms (dispositivo lento, o varios eventos de resize seguidos mientras el SO anima la apertura), el centrado se calculaba **antes** de que el sheet tuviera su margen final — con una geometría vieja, daba un delta incorrecto (de más). Cuando el margen del teclado se aplicaba después, todo lo ya corregido se corría de nuevo — dos movimientos en cadena, uno de ellos mal calculado.

**Fix (dos cambios, ambos quirúrgicos):**

- `styles.css`: se agregó `transition:margin-bottom .22s ease,max-height .22s ease` a `.sheet`, para que el reacomodo por teclado sea un deslizamiento suave en vez de un salto instantáneo (mismos 220ms que ya usa el swipe-to-close, por consistencia).
- `sheet-behavior.js`: el centrado del campo enfocado ahora **espera** a que el margen del teclado ya esté aplicado antes de medir:
  - Cuando lo dispara el propio reacomodo por teclado (`applyKbLayout`), espera a que termine la transición del `margin-bottom`/`max-height` de ese sheet (`transitionend`, con un respaldo de 260ms por si el navegador no la dispara) antes de centrar.
  - Cuando lo dispara el `focus` (temporizador de 350ms), reintenta cada 60ms (hasta 10 veces) si el margen del sheet todavía no coincide con la altura actual del teclado, en vez de medir con una geometría que sabe que está vieja.

Con esto, los dos caminos siempre terminan midiendo sobre el mismo layout ya asentado — cuando ambos disparan, el segundo no hace nada (el campo ya quedó bien) en vez de corregir una medición equivocada.

Validado con una simulación en jsdom que reproduce la carrera con eventos de resize escalonados (imitando cómo el SO anima la apertura del teclado) en dos escenarios — teclado rápido (se asienta antes de los 350ms) y teclado lento (sigue en eventos más allá de los 350ms). En el escenario lento, contra el código de antes de este fix, se reprodujo exactamente el defecto: un scroll de 186px con geometría vieja **antes** de que se aplicara el margen del teclado, seguido del salto del margen — dos movimientos en cadena. Con el fix, el margen se aplica primero y el ajuste del campo llega después, ya correcto (36px), en un solo paso perceptible. **Pendiente:** confirmación visual en celular real — jsdom no ejecuta transiciones CSS de verdad, así que la suavidad del `transition` no se pudo validar automáticamente, solo su coordinación con el JS.

---

### ✅ Corregido (2026-09-24) — `sheet-behavior.js`: los sheets se movían bajo el dedo al tocar botones rápido

**Síntoma (celular):** el usuario ve un botón, va a tocarlo, y justo antes el contenido del sheet se corre solo — el toque cae sobre otra cosa. Pasaba sobre todo al tocar un control y enseguida otro.

**Causa raíz** (tres ajustes automáticos que movían la pantalla sin importar si había un toque en curso):

1. **Scroll al enfocar.** El handler de `focusin` hacía `scrollIntoView({block:'center', behavior:'smooth'})` 350 ms después de enfocar *cualquier* `input`/`textarea`/`select` dentro de un sheet — incluidos checkbox (toggles como "quedó debiendo"), selects y campos que ya estaban a la vista. Ese scroll suave arrancaba justo cuando el dedo iba hacia el siguiente botón. Además `scrollIntoView` puede desplazar también contenedores ancestros, no solo el sheet.
2. **Reposicionado por teclado.** Al abrir o cerrar el teclado, el sheet cambiaba de margen y de `maxHeight` con un debounce de 120 ms, sin mirar si el usuario estaba tocando algo en ese instante (típico: tocar un botón cierra el teclado → el sheet se reacomoda entre el `touchstart` y el `click`). Además tenía dos defectos propios: solo se limpiaba el estilo en los overlays que existían al cargar la página (uno inyectado después podía quedar con el margen pegado), y un cambio chico que cruzaba el umbral de 100 px (ej. 105 → 85) se descartaba por el filtro de "cambio < 20 px", dejando el margen viejo.
3. **Swipe para cerrar demasiado sensible.** Con solo 8 px de movimiento hacia abajo, un toque con el dedo algo corrido ya arrastraba el sheet entero. Arrastres casi horizontales o que empezaban sobre un campo de texto también contaban. Y la velocidad de "flick" se calculaba entre la última posición registrada y la posición al soltar, que casi siempre son la misma — así que cerrar con un gesto rápido en la práctica nunca funcionaba (solo el arrastre largo de 90 px). Tampoco se manejaba `touchcancel`: si el sistema interrumpía el gesto, el sheet podía quedar desplazado y con el scroll bloqueado.

**Fix:**

- Se agregó una noción compartida de "pantalla quieta" (sin dedos apoyados y sin toques en los últimos 300 ms). El reposicionado por teclado y el scroll al campo enfocado esperan a que la pantalla esté quieta antes de aplicarse, así el toque en curso siempre se completa sobre el layout que el usuario vio.
- Scroll al enfocar: solo para campos que realmente abren el teclado de texto (no checkbox/radio/select/fecha/etc.), solo si el campo quedó tapado (por el teclado o el borde del sheet), moviendo el scroll del propio `.sheet` lo mínimo necesario y sin animación. Si el campo ya se ve, no se mueve nada; si perdió el foco antes de aplicarse, se cancela.
- Teclado: el estado se compara contra el último aplicado (0 o la altura real), se aplica a todos los sheets (no solo los vigilados al cargar), y un overlay que se abre con el teclado ya visible arranca con el margen correcto; al cerrarse queda limpio. `_makeSheetSwipeable` también registra el overlay para esta vigilancia.
- Swipe: umbral de arrastre 14 px (el sheet arranca desde 0, sin "salto"), ignora gestos más horizontales que verticales y toques que empiezan sobre `input`/`textarea`/`select`, velocidad de flick calculada entre los dos últimos movimientos (cierra con ≥ 40 px y > 0,5 px/ms; se anula si el dedo se frena antes de soltar), `touchcancel` deja el sheet limpio sin cerrarlo, y `overscroll-behavior-y: contain` en el sheet para que el rebote no se encadene con la pantalla de atrás.

No cambia: el umbral de cierre por distancia (90 px) ni la regla de deshabilitar el swipe con el teclado abierto.

Validado con `node --check` y pruebas jsdom con toques simulados y `visualViewport` simulado (27 casos: checkbox/select/fecha sin scroll, campo visible sin scroll, scroll mínimo cuando está tapado, espera con el dedo apoyado, teclado que se cierra con el dedo apoyado, umbral 105→85, overlays abiertos/inyectados con el teclado visible, y los gestos de swipe descritos arriba). **Pendiente:** confirmación en celular real (jsdom no calcula layout, solo valida la lógica).

### ✅ Corregido (2026-09-24) — `mostrarAlertaFuente()`: elegir cuenta en "Registrar movimiento" empujaba los botones de golpe

Revisando `styles.css` se confirmó que el patrón "reservar el espacio para que el hint no salte el layout" (`.field-hint{min-height:14px}` + `[style*="min-height"]:empty{min-height:0}`, documentado en `reglas-visuales.md#hints-vacíos`) ya está bien aplicado en los hints de Encargos (`ctc_destino_hint`, `moverenc_destino_hint`). Pero `mostrarAlertaFuente(prefix)` — usada por `mov_fuente_hint`/`mov_destino_hint` en "Registrar movimiento" (Préstamos) y por `gv_fuente_hint` en "Nuevo gasto" — es anterior a ese patrón y todavía alternaba `display:'none'`/`'block'`. `display:none` saca el elemento del layout por completo sin importar el `min-height` de `.field-hint`, así que elegir una cuenta hacía aparecer el hint de golpe y empujaba ~18px todo lo de abajo — justo el tipo de salto que hace que, si se toca rápido, el dedo caiga sobre otro botón.

Fix: `mostrarAlertaFuente()` pasó a alternar `visibility` en vez de `display` (mismo criterio de "reservar el espacio" que ya usan los hints de Encargos, aplicado con la herramienta que tenía disponible este toggle en particular). Los tres divs (`gv_fuente_hint`, `mov_fuente_hint`, `mov_destino_hint`) perdieron el `display:none;` inicial en su `style` inline — sin eso, `visibility:hidden` no alcanza para que el hueco quede reservado desde que se abre el sheet.

**Efecto colateral esperado, no un bug:** ahora esos tres sheets muestran un hueco en blanco de ~18px mientras no se eligió cuenta, en vez de no ocupar nada. Es el mismo trade-off que ya se aceptó a propósito en los hints de Encargos — mejor un hueco fijo que un salto de layout. Si visualmente no gusta, se puede revertir con solo cambiar `visibility` de vuelta a `display` en `mostrarAlertaFuente()` y restaurar el `display:none;` en los tres divs.

### ✅ Corregido (2026-09-24) — El aviso de "se carga a la TC" quedaba invisible tras el fix anterior

Al revisar `tarjetas_credito.js` (pendiente en la entrada anterior) apareció el caso que ahí se dejó como "no revisado": el archivo parchea `window.mostrarAlertaFuente` — cuando la fuente elegida es una tarjeta de crédito (`val.startsWith('tc:')`, ej. "Préstamo con TC" en Registrar movimiento), toma el control para mostrar un aviso rojo distinto ("El gasto se cargará a la TC — no sale plata de tus cuentas") en vez de delegar en la función original. Ese branch hacía `hint.style.display=''`, nunca tocaba `visibility` — así que con el cambio de la entrada anterior (que dejó esos hints ocultos vía `visibility:hidden` en vez de `display:none`), elegir una tarjeta de crédito como fuente dejaba el aviso con el texto y el color ya puestos, pero invisible: `display=''` no alcanza para revertir un `visibility:hidden` que había quedado de antes.

Fix: la línea pasó a `hint.style.visibility='visible'`, igual que el resto de `mostrarAlertaFuente()`. Sin cambios en `sheet-stack.js` ni en `index.html` — el problema estaba solo en este patch.

Validado con una prueba de integración en jsdom que carga `mostrarAlertaFuente()` real de `sheet-stack.js` + el patch real de `tarjetas_credito.js` y alterna la fuente entre vacía / cuenta normal / tarjeta de crédito (4 casos); confirmado además que fallaba exactamente así contra el archivo sin este fix.

---

### 🔧 Cambio (2026-09-23) — `split.js`: con 2 filas (el mínimo) ya no queda un hueco donde iba el botón de borrar

Al activar "Dividir" en cualquier pantalla que use el motor de split (Mesada, Encargos, Préstamos, Gastos, etc.), las 2 filas mínimas ocultaban el botón "×" con `visibility:hidden` — que esconde el botón pero **sigue ocupando su espacio** (28px + el gap de la grilla), dejando un hueco vacío a la derecha del campo de monto.

Fix: `splitActualizarBotones()` ahora usa `display:none` en vez de `visibility:hidden` cuando hay 2 filas, y además cambia el `grid-template-columns` de cada fila de `1fr auto auto` a `1fr auto` (una columna vacía en un grid igual reserva su gap, así que solo ocultar el botón no alcanzaba). Con 3 o más filas todo vuelve al layout de 3 columnas con el botón visible. La regla de negocio (mínimo 2 filas, no se puede bajar de eso) no cambia — solo cómo se ve. Como vive en el motor común, aplica a todos los módulos sin tocarlos.

---

### ✅ Corregido (2026-08-24) — Decimales y NBSP raro en la card "Proyección financiera" (header + tarjetas 3m/6m/12m + tooltips)

`renderProyeccion()` en `inicio.js` usaba `window.fmt` (formateador global, definido en otro archivo, que sí muestra decimales) tanto para pintar el header/tarjetas como para los tooltips (`fmt2`, al tocar el header o una tarjeta). Una proyección a 3/6/12 meses es una estimación, no un saldo exacto, así que los centavos no aportaban info y solo generaban ruido. Se reemplazó `fmt`/`fmt2` en esta función por un formateador local (`Math.round(x)` + `maximumFractionDigits:0`), aislado a `renderProyeccion()` — no se tocó `window.fmt` global por si otras pantallas sí necesitan decimales.

De paso se detectó que `toLocaleString('es-CO',{style:'currency',...})` inserta un espacio de no separación (NBSP, U+00A0) entre el símbolo `$` y el número — ese carácter es el que se veía "raro" y, según el contexto donde se sirve el HTML, puede terminar serializado como la entidad literal `&nbsp;` en vez de renderizarse como espacio. Se agregó `.replace(/\u00a0/g,'')` a los dos formateadores locales (`fmt` y `fmt2`) para quitarlo del todo (`$116.164` en vez de `$ 116.164`).

---

### ✨ Agregado (2026-08-23) — Persistencia del botón "ocultar saldos" y del estado de "Necesita atención"

**Ocultar saldos:** el toggle `btn-toggle-saldos` (`mejoras.js`) no guardaba nada — cada recarga volvía a mostrar los saldos aunque los hubieras ocultado antes. Se agregó `localStorage` (`mf-saldos-ocultos`): `toggleSaldos()` guarda el estado en cada click, y se separó la parte visual (ícono del botón + aplicar `.saldo-hidden`) en `_aplicarEstadoSaldos()`, que ahora también se llama una vez al cargar el script para restaurar el estado guardado sin depender de que el usuario haga click. Los montos que se pintan dinámicamente (proyección, análisis, tarjetas, etc., sección 1b) ya nacen ocultos correctamente porque `_saldosOcultos` se lee de `localStorage` antes de que se armen los observers de esa sección.

**"Necesita atención":** el estado abierto/cerrado (`renderAttencion()` en `inicio.js`) ya se guardaba con detección de items nuevos (`fingerprint`), pero en `sessionStorage` — sobrevivía a un F5 pero se perdía al cerrar el navegador/pestaña. Al no haber `lastFingerprint` en una sesión nueva, `hayNuevos` daba siempre `true` y la sección se abría sola aunque no hubiera nada nuevo en realidad. Cambiado `sessionStorage` → `localStorage` en las 4 referencias (`attn-open` ×2, `attn-fingerprint` ×2) para que la comparación sobreviva a cerrar el navegador del todo.

---

### ✅ Corregido (2026-08-23) — Cuadros de estadísticas (`.stat` en `grid3`/`grid2`) se desbordaban con valores grandes

Los cuadros de la sección de patrimonio en Inicio (Disponible, Nu libre, Efectivo, Nequi, Prestado, CDTs, etc.) y cualquier otro `.stat` dentro de un `grid3`/`grid2` en toda la app podían salirse de su contenedor cuando el número era muy grande. Causa: por defecto un hijo de CSS Grid tiene `min-width:auto`, así que nunca se encoge por debajo del ancho de su contenido — si el número era más ancho que la celda, empujaba el layout en vez de ajustarse.

Fix en `css/styles.css`: `min-width:0` en `.stat` (permite que el grid item se encoja) + `font-size:clamp(11px,3.4vw,16px)` en `.stat-value` (la letra se achica sola con valores grandes, en vez de mantener 16px fijo) + `overflow-wrap`/`word-break` como red de seguridad para el caso extremo en que ni achicando la letra entra.

Mismo problema y mismo criterio en las 3 tarjetas de "Proyección financiera" (3/6/12 meses, `renderProyeccion()` en `inicio.js`), que se generan por JS con estilos inline en vez de la clase `.stat`: se agregó `min-width:0` a cada tarjeta y `font-size:clamp(10px,3vw,13px)` + `overflow-wrap`/`word-break` al valor.

---

### ♿ Corregido (2026-08-22) — Accesibilidad: 29 `<label>` sin asociar a un campo (linter "No label associated with a form field")

Auditoría de las 35 instancias de `<label>` sin atributo `for` en `index.html`. 6 no necesitaban cambio (el `<input>` ya está anidado dentro del propio `<label>` — patrón válido usado en los toggles de Configuración y en el checkbox "préstamo aparte"). Las 29 restantes caían en dos categorías reales, verificadas una por una contra el HTML:

**Categoría 1 — el label sí describe un campo real, solo le faltaba `for` (20 casos):** se agregó `for="<id>"` apuntando al `<select>`/`<input>` correspondiente. La mayoría son el patrón "field-header" (pregunta + botón "Dividir ÷" + select en modo simple / filas en modo dividido, p. ej. `movenc_cuenta`, `mov_fuente`, `mov_destino`, `spDestinoSelect`, `spPagarFuente`, `mpDestino`, `usar_parte_fuente`, `nd_destino`, `md_cuenta`, `nuMovDesc`, `nuMovMonto`, más varios campos de diferencial `movenc_dif_real`/`movenc_dif_mi_cuenta`/`ctc_dif_real`/`ctc_dif_margen_cuenta`/`usar_parte_dif_real`/`usar_parte_dif_mi_cuenta`/`prtc_dif_real`/`movenc_faltante_cuenta`/`gv_fuente`). Se usó `for` apuntando siempre al select del modo simple porque ese ya era el patrón existente en el propio archivo (`mov_enc_cuenta`, línea ~3939, ya tenía `for` correcto desde antes) — no se inventó una convención nueva.

**Categoría 2 — el label describía un widget custom sin `<input>`/`<select>` nativo (9 casos):** cambiados de `<label class="il">` a `<div class="il">` (mismo `class`, mismo estilo visual — `.il` se define en `css/styles.css` como selector de clase, no `label.il`, así que no depende del tag). Casos: selector de ícono (`Ícono`, grid de divs con `data-action`), selector de color (`Color` ×3, círculos de color clicables), "Color del avatar" ×2 (mismo patrón en Personas), texto de solo lectura "Saldo actual" ×2 (seguido de un `<div>` no editable, no un input), "¿A qué cajita?" (lista dinámica de checkboxes de cajitas sin un único campo que etiquetar) y "¿Qué hiciste con ese extra?" (sistema de partes libres, sin campo único).

No se tocó ningún `id`, `data-action` ni lógica JS — el cambio es puramente de tag/atributo en el HTML, verificado que no rompe el balance de etiquetas (`<div>`/`</div>` +9/+9, `<label>`/`</label>` −9/−9) ni deja ningún `for` apuntando a un `id` inexistente (170 `for=` verificados contra los `id` del documento).

**Seguimiento (2026-08-22, mismo día) — 24 casos más, en los módulos `.js` (sheets inyectados dinámicamente):**

El fix de arriba dejó `index.html` en 0, pero el linter siguió reportando 18 (de 24 reales encontrados — algunos posiblemente no cuentan doble o no se renderizan siempre). La causa: varios sheets no viven como HTML estático en `index.html` sino que se arman como string e inyectan por `.innerHTML`/`appendChild` desde el propio módulo `.js` (mismo patrón "hybrid" ya documentado para Alcancía) — el linter escanea el DOM ya renderizado, así que ve ese HTML aunque no esté en el archivo fuente que se audite. Auditados los 13 módulos con `.js` propio; 8 tenían el problema:

- **`alcancia.js` (10):** 9 con `for` agregado (`alc_dep_tipo`, `alc_dep_deudor`, `alc_dep_deudor_grupo`, `alc_dep_fuente`, `alc_dep_monto`, `alc_dep_fecha`, `alc_dep_desc`, `alc_real_monto`, `alc_destino`) + 1 a `div` ("¿Cuánto puso cada uno?", que no tiene un campo único — son 2 inputs fijos, Vos/Tu mamá).
- **`analisis.js` (1):** el label de cada presupuesto por categoría (`${cat}`) no tenía forma de enlazarse porque el input tampoco tenía `id` (solo `data-cat`, y el nombre de categoría no es un valor seguro para usar como `id` HTML). Se agregó `id="presup-input-${i}"` al input (usando el índice del loop, no el texto de la categoría) y `for` a juego en el label.
- **`cuentas.js` (1):** mismo problema en "chequeo Nu" (input por cajita, solo tenía `data-chq-cajita`). Se agregó `id="chq-${c.id}"` (reutilizando el id de la cajita, que ya se usaba como valor de atributo en el mismo elemento) y `for` a juego.
- **`plata_comprometida.js` (6):** 5 a `div` ("¿A dónde va esta plata?", "Tipo de destino" —el `<select>` real ahí es oculto, solo para compatibilidad interna—, "¿De dónde salió o va a salir esta plata?", "¿Ya adelantaste esta plata?", "¿Ya lo pagaste?" — todos son botones/tarjetas custom, no select/input directo) + 1 con `for="cp-recibir-sobrante-cuenta"` (ese sí tiene un select real).
- **`encargos.js` (1) y `prestado.js` (1):** "¿De quién es la plata?" / "¿A quién le debes?" → `div`, ambos son el mismo widget custom de selector de persona (botón + avatar), el campo real detrás es `type="hidden"`.
- **`spotify.js` (2):** "¿Quién es?" (crear y editar) → `div`, mismo patrón de selector de persona.
- **`personas.js` (2):** "Color del avatar" (crear y editar persona) → `div`. Estos son los que el usuario vio reaparecer después del primer fix — son sheets inyectados por `personas.js` (`sheet-crear-persona-global`/`sheet-editar-persona-global`), no el HTML estático de `index.html` que se corrigió antes (que resultó no ser el que realmente se usa/renderiza para este flujo).

`actividad_reciente.js`, `gastos.js`, `inicio.js`, `mesada.js`, `tarjetas_credito.js` y `configuracion.js` no tenían ningún caso. Verificado archivo por archivo que no queda ningún `<label>` sin `for` (excepto los que ya tienen el input anidado adentro, que no aplica acá) y que cada `for` nuevo apunta a un `id` que existe en el mismo archivo.

Auditoría completa de los ~45 bottom sheets de `index.html` contra la regla de orden de `guia-estilo-sheets.md` §1 (Fecha va justo antes de Nota, no pegada al Monto). Se encontraron dos tipos de problema, ambos solo en el HTML — **el JS de guardado de cada módulo todavía no lee los campos nuevos, queda pendiente**:

**Huecos de simetría (campo faltante en un sheet cuyo par sí lo tenía):**
- `sheet-restar-dinero` no tenía Nota (su par `sheet-agregar-dinero` sí) → se agregó `#rdNota`.
- `sheet-sp-destino` no tenía Nota (sus pares `sheet-sp-hist-pend`/`sheet-pagar-spotify` sí) → se agregó `#spNota`.
- `sheet-transferir` no tenía Fecha, único sheet de movimiento sin ella → se agregó `#tr_fecha`.

**Fecha reordenada** (antes aparecía pegada al Monto, ahora va justo antes de Nota, después de los campos de cuenta/contexto): `sheet-gasto-var`, `sheet-compra-tc`, `sheet-nueva-deuda`, `sheet-mov-mi-deuda`, `sheet-prestamo-tc`, `sheet-registrar-movimiento`, `sheet-sp-hist-pend`, `sheet-mesada-pago`, `sheet-mesada-pend`. Solo cambió la posición del `<div class="ig">` en el DOM — los `id` de los inputs no cambiaron, así que cualquier JS que use `getElementById`/`querySelector` sigue funcionando igual.

**Seguimiento (2026-08-22, mismo día) — conectado en `cuentas.js`/`spotify.js`:**

Al conectar `#rdNota` se encontró que el problema era más viejo y más grande: **`#adNota` (agregar-dinero), `#adMenuNota` (agregar-dinero-menu) y `#nuMovNota` (nu-movimiento) ya existían en el HTML desde antes y tampoco se leían nunca** — el usuario podía escribir una nota, confirmar, y esa nota se perdía en silencio sin ningún error. Se corrigieron los 6 sheets juntos porque todos comparten la misma raíz:

- `registrarEntradaConApertura(fuente,monto,fecha,desc,esApertura,nota)` y `registrarSalida(fuente,monto,fecha,desc,nota)` (`cuentas.js`) ahora aceptan un 6º/5º parámetro opcional `nota` y lo guardan como `mov.nota` cuando viene no vacío. No se rompe ningún caller viejo — el parámetro es opcional y los que no lo pasan simplemente no agregan el campo, igual que antes.
- `confirmarAgregarDinero`, `confirmarAgregarDineroMenu`, `confirmarNuMovimiento` (ambos sentidos) y `confirmarRestarDinero` ahora leen su input de Nota (`#adNota`/`#adMenuNota`/`#nuMovNota`/`#rdNota`) y lo pasan. Los `abrir*` correspondientes limpian ese campo al abrir el sheet (antes quedaba con el valor de la vez anterior, invisible porque nunca se leía igual).
- `confirmarTransferir` (`cuentas.js`) ahora lee `#tr_fecha` y lo usa al guardar en `S.transferencias`, en vez del `fecha: hoy()` fijo que tenía. `abrirTransferir` inicializa `#tr_fecha` a hoy como valor por defecto editable.
- `confirmarSpDestino` (`spotify.js`) lee `#spNota` y la combina con la nota automática de períodos (`"X períodos × $Y (pago adelantado)"`) uniendo ambas con `' · '` — mismo patrón que ya usaba el propio archivo para la nota de "Pago atrasado del ciclo anterior". `abrirSpDestino` limpia `#spNota` al abrir.
- No hizo falta tocar `movimientos.js`: el sheet de detalle de movimiento ya prioriza `nota` sobre `desc` cuando existe (`abrirDetalleMov`), así que las notas nuevas se muestran automáticamente sin cambios ahí.

De paso, `guia-estilo-sheets.md` §3 quedó actualizada con 4 sheets que existían en el código pero no en el inventario (`sheet-transferencia-encargo` completo, campos nuevos en `sheet-traspaso-encargo`/`sheet-mesada-pago`/`sheet-mesada-pend`/`sheet-registrar-movimiento`/`sheet-nueva-tc`), y con una aclaración de que el campo #3 de la regla de orden ("Descripción") casi nunca se llama literalmente así — suele ser una pregunta específica ("¿De dónde viene esta plata?", etc.) y eso es el patrón correcto, no una desviación.

---
