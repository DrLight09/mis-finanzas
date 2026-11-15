# Historial: Libro de movimientos

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Libro de movimientos

Documentación: [`libro-de-movimientos.md`](./libro-de-movimientos.md).

### 🧪 `sync.test.js`: pruebas del listener sin esperas fijas (2026-10-25)

En el equipo del usuario (suite entera 73 s, bloque `firebase-sync` 14 s) falló «listener — carga inicial con payload comprimido aplica los datos…» con `Cannot read properties of undefined (reading 'saldo')`: el test dormía **50 ms fijos** esperando la descompresión asíncrona del payload y en una máquina lenta no alcanzaba. No era un error de la app. Cuatro pruebas del listener esperaban con `esperar(50|100)`; ahora esperan **a la condición** (`hasta(() => app._dataLoaded)`, 5 s de tope) y, en las que comprueban que algo NO ocurre (payload ilegible no habilita el guardado; el snapshot lento no pisa al rápido), esperan a que **terminen todas las descompresiones** que arrancó el listener (`espiar(app)` envuelve `decodificarPayload`). Comprobado: pasa bajo carga de CPU artificial y, por mutación, sigue fallando si se rompe la cola ordenada de snapshots (`firebase-sync.js` línea de `_colaSnapshots`). No hay otras esperas fijas en el resto de pruebas.
- **Cuenta de pruebas:** con la carpeta `tests/` (plural) `npm test` ejecuta **447** (solo los `*.test.js`); con `test/` eran 450 porque Node contaba como prueba los 3 `.js` de `support/`.

### 🧹 Paso 5 cerrado: verificadores retirados (2026-10-24)

El usuario pasó los 15 verificadores contra los archivos originales reales (`verificar.js todos --antes=antes`): inicio, wrapped, cuentas, analisis, spotify, prestado, nu, movimientos, alcancia, tarjetas, encargos, personas, plata_comprometida, `index.html` (2.697 etiquetas) y los sueltos — **0 con diferencias**; `npm test` 450/450 y `npm run smoke` sin fallos. Con eso se descartan `scripts/paso5/` y la carpeta `antes/`, que eran locales e ignoradas por git (nunca estuvieron en el repo). Se actualizan `docs/guia-estilo-sheets.md` §0 (reglas permanentes y trampas aprendidas), `docs/auditoria-tecnica.md` (CSP: decisión A), `docs/mis-finanzas.md` y `test/README.md`.

### 🔍 Verificación con `jsdom` y correcciones (2026-10-24, cierre del Paso 5)

Con `jsdom` disponible por primera vez se pasó el comparador de cascada (`scripts/paso5/etiquetas.js`) sobre las 8 conversiones (`movimientos`, `nu`, `alcancia`, `tarjetas_credito`, `encargos`, `personas`, `plata_comprometida`, `index.html`) y los verificadores por módulo del usuario (`scripts/paso5/verificar.js todos`): **0 diferencias** tras corregir tres errores que las verificaciones sin `jsdom` no veían:
- **CSS inválido en `.cp-dev-tag`:** el `style` venía de una cadena JS con comillas escapadas (`font-family:\'DM Mono\'`) y se copió así a `styles.css`. Eso rompe el parseo y **22 clases de Plata comprometida (`cp-dev-tag` … `cp-aviso-amber`) no se aplicaban**. Arreglado en la hoja y en `convertir.py` (des-escapa `\'`/`\"`); prueba nueva que exige CSS válido (llaves balanceadas, sin comillas escapadas) y otra que lee `styles.css` con un parser real (`jsdom`) y compara el número de reglas.
- **Alcancía, margen de la fila "Duración":** el original era `<div class="row"${rachaMsg ? ' style="margin-bottom:8px;"' : ''}>` (solo con racha) y el conversor, al ver un `style` dentro de una expresión condicional, lo dejó **fijo**. Ahora `class="row${rachaMsg ? ' alc-fila-mb8' : ''}"`. Revisado: es el único atributo `style` condicional de las siete conversiones. Prueba nueva.
- **`index.html`, `#gv_fuente_hint`:** `styles.css` colapsa el hint con `#gv_fuente_hint[style*="visibility:hidden"]`, un selector de atributo que necesita el `style` inline. `visibility:hidden;` se queda en línea (`PROTEGER` de `convertir_html.py`) y una prueba lo exige. Con esto son **110** los `style=""` que quedan en `index.html`.
- **Ajustes del usuario adoptados** (`scripts_1.zip`): `etiquetas.js` junta en una sola línea las etiquetas que ocupan varias (y ahora también des-escapa `\'` y rellena cada elemento con un texto para que `[style*="min-height"]:empty` no dispare en el vacío), `movimientos.js` prueba `badge-xs` junto a `badge`, `verificar.js` conoce `nu/movimientos/alcancia/tarjetas/encargos/personas`, y los verificadores por módulo (`alcancia.js`, `nu.js`, `personas.js`, `tarjetas.js`, `encargos.js`).
- **Carpeta de pruebas:** el usuario la tiene como **`test/`**, no `tests/` (entregué `tests/estilos.test.js` por error). Desde ahora los archivos de prueba se entregan en `test/`. Los verificadores `analisis/cuentas/prestado/spotify/wrapped.js` resuelven la carpeta (`tests` o `test`) como ya hacía `conciliacion.js`.
- **Falso positivo conocido:** el comparador avisa `.cajita-row-hover:hover` (border-color) en `nu.js`; viene de la palabra `border-color` dentro de `transition:` del estilo original, no de una propiedad real.
- **`smoke-browser.js` (jsdom):** 0 errores de carga, 0 fallos en las fases 2 y 3; los 7 "sin handler" (`authgate:*`, `pin:*`) y los 4 "lanzan al tocar" (`config:signOut`, `config:abrirEliminarCuenta`) son de módulos ES de Firebase que ese entorno no carga (ya era así).
- **Decisión CSP: opción A** (se mantiene `'unsafe-inline'` en `style-src`). Razón: ver `auditoria-tecnica.md` («Seguridad — pendiente»). **El Paso 5 queda CERRADO.**
- `sw.js` v56. Pruebas: 450/450.

### 🎨 Estilos inline → clases (2026-10-23, Paso 5, tanda 18) — `index.html`

**`index.html`: 783 `style=""` → 109.** 371 clases `ix-*` (nombradas por contenido: `ix-mb10`, `ix-c-red`, `ix-fs12-c-text2`… para estilos de una o dos propiedades; por el `id` del elemento para los demás) al final de `styles.css`. Lo que queda inline es a propósito:
- **98 `display:none;`** de elementos que el JS muestra con `style.display = ''` (si pasaran a clase, vaciar el inline no los revelaría). Los estilos mixtos (`display:none;margin-top:8px;…`) conservan solo `display:none;` inline y el resto va a clase.
- **PRIMER PINTADO (11):** `#fb-loading-screen`, `#fb-login-screen`, `#pin-screen` y `#toast-container` (y todo lo que contienen) conservan su `style=""`: `styles.css` se carga **async** y esas pantallas son lo único que se ve antes de que llegue (ver el comentario del `<head>`). Una prueba nueva lo exige.
- **2 protegidos porque el JS vacía su estilo inicial con `''`:** `#health-score-card` (`min-height:148px`, `inicio.js` `style.minHeight=''`) y `#encargoAvatar` (fondo/color/borde azules, `encargos.js` los limpia con `''`). Con una clase, vaciar el inline los dejaría igual.
- **Trampa de `min-height`:** `styles.css` tenía `[style*="min-height"]:empty{min-height:0 !important}` (colapsa los ~40 hints vacíos); depende de que el inline exista. Cada clase `ix-*` con `min-height` recibe su propia regla `.clase:empty{min-height:0 !important}` (29 clases). La regla genérica se queda para lo que aún se crea con inline desde JS.
- **Selectores compuestos** (`input.ix-x`, `select.ix-x`, `.il.ix-x`, `.btn.ix-x`, `#id.ix-x` cuando el id tiene reglas propias) para igualar la especificidad del inline frente a `input[type=…]` (0,1,1), `.field-header .il`, `.btn-primary:active`, `#fb-loading-screen`, `#gv_fuente_saldo:empty`, etc.
- **Verificación (esta vez más fuerte que en los `.js`, sin `jsdom`):** `scripts/paso5/equivalencia_html.py` — (1) sin `style`/`class` el HTML nuevo es idéntico al original; (2) **etiqueta por etiqueta (2.697)** la unión de lo que queda inline más las declaraciones de sus clases es exactamente el `style` original; (3) cada clase tiene una sola regla con exactamente sus declaraciones. `scripts/paso5/cascada_html.py` simula la cascada con los ancestros reales del DOM (2.416 propiedades) y exige que gane siempre una regla `ix-*`; con las reglas compuestas quitadas encuentra 82 pérdidas, con ellas 0. `scripts/paso5/conflictos_html.py` lista los conflictos reales (con ancestros) del HTML original.
- **Hallazgo para la decisión de la CSP:** `index.html` tiene **5 bloques `<style>`** en línea (CSS crítico del primer pintado) y `wrapped.js` inyecta otro; quitar `'unsafe-inline'` de `style-src` exigiría además un hash `sha256-…` por bloque (y actualizarlo en cada cambio) o moverlos a archivos, más reubicar los 11 `style=""` del primer pintado.
- `tests/estilos.test.js`: `index.html` en `CONVERTIDOS` y dos pruebas nuevas (cada clase `ix-*` con `min-height` tiene su `:empty`; el primer pintado conserva el inline). `sw.js` v55 (el `index.html` va en el caché de la app).

### 🎨 Estilos inline → clases (2026-10-23, Paso 5, tanda 17) — `plata_comprometida.js`

**`plata_comprometida.js`: 186 `style=""` → 13.** 11 son `display:none` de elementos que el JS conmuta (selects ocultos, bloques de origen/destino de cada destino, el recordatorio y el bloque "ingreso libre", que conserva `display:none` inline y lleva el resto en `cp-sobrante`), 1 es el estilo inicial de `#cp-balance-preview` y 1 el `width:${pct}%` de la barra de comprometido. 168 clases `cp-*` al final de `styles.css`.
- **Tipo de destino → clases:** `_CP_TIPO_LABELS` ya no guarda `bg/border/color` (nueve usos en línea) sino una clave `k`; el HTML usa `cp-tbg-${ti.k}` (fondo + borde) y `cp-tc-${ti.k}` (color) para los cuatro tipos (reposición, gasto, abono a deuda, otro). Se separaron fondo y color porque algunos elementos usan solo uno y añadir `color` a una caja habría cambiado la herencia de su contenido. Prueba nueva en `tests/estilos.test.js` que exige las 8 clases y la clave `k` de cada tipo.
- **Botones "aún no / ya" (marcar pagado):** dos botones con `style` de 7 propiedades según `estado` y `esReposicion` → `cp-tgl` + `cp-tgl-inact|off-act|on-rep|on-ing`; desaparecen `colorOn`, `bgOn`, `borderOn`.
- **Fechas de pago:** `colorFecha` es ahora `cp-c-text3|red|amber`; el chip de aviso de la cabecera usa `cp-c-${tipoG}` (`red`/`amber`).
- **Conservado a propósito (trampa):** `#cp-balance-preview` mantiene su `style` inicial. El JS lo reemplaza con `style.cssText = '…'` y, cuando no hay monto, lo vacía con `cssText = ''`; con una clase ese vaciado dejaría el `min-height` y el `padding` del estado inicial y el elemento no se colapsaría.
- **Los botones de selección** (tarjetas de tipo `cpd-tipo-card`, "Sí/No" de ya saqué / ya pagué) asignan siempre valores explícitos desde el JS (`btn.style.background = …`), así que la clase solo fija el estado inicial; no hay reseteos con `''`.
- **Convertidor:** `select`/`textarea` ahora también reciben selector compuesto (`select.cp-sel13`), igual que `input`: compiten con `input[type=text]…select{}` (0,1,1).
- **Especificidad:** los `.il`, botones `btn-primary` y `<b>` marcan solo selectores de 0,2,0 que empatan y ganan por orden, o de otros contenedores.
- **Verificación (sin `jsdom`):** archivo sin `style`/`class` == original salvo `_CP_TIPO_LABELS`, `colorFecha` y las tres constantes de los botones; declaraciones de cada clase == su `style`; ninguna etiqueta con dos `class`.
- `tests/estilos.test.js`: `plata_comprometida.js` en `CONVERTIDOS`.
- **Con esto todos los `.js` de módulos y núcleo con estilos en línea están convertidos** salvo los valores calculados. Quedan `index.html` (784) y el helper de estilos dinámicos.

### 🎨 Estilos inline → clases (2026-10-23, Paso 5, tanda 16) — `personas.js`

**`personas.js`: 180 `style=""` → 7, todos calculados** (candidatos al helper de estilos dinámicos del final del Paso 5): el color elegido por el usuario para el avatar de cada persona (`color`, `background`, `border-color` con `${color}`, 4 sitios; el resto del avatar —tamaño, margen— pasa a `.avatar.pe-av-40|36`), el `width:${pct}%` de las dos barras de progreso (a favor y en contra) y el `background:${c}` de cada muestra de la paleta de colores. 75 clases `pe-*` + 12 de apoyo al final de `styles.css`.
- **Colores por estado → clases:** `color2` (pendiente/le debes/saldado) y `colorDeuda` ya guardan `pe-c-amber|red|accent`; la barra de progreso es `pe-fill` + `pe-bg-accent|amber|red`; la muestra de color seleccionada es `pe-swatch-sel` y la no seleccionada `pe-swatch-no` (borde y sombra con la misma forma abreviada que traía el `style`).
- **Hover de las filas** (`_persona-row-hover`, `_sel-persona-row`): ya era por JS (CSSOM, `row.style.borderColor` / `background`), así que no cambia; al salir se restaura `background=''` y la clase no define fondo, igual que antes.
- **Especificidad:** el análisis solo marca `.btn-primary + .btn-ghost` (0,2,0, empata y gana por orden, como el inline) y selectores de otros contenedores. `<p>` de la introducción del selector vs `.header p`: el `<p>` no está en un `.header`.
- **Verificación (sin `jsdom`):** archivo sin `style`/`class` == original salvo `color2` y `colorDeuda`; declaraciones de cada clase == su `style`; ninguna etiqueta con dos `class`.
- `tests/estilos.test.js`: `personas.js` en `CONVERTIDOS` (permitidos: `width:${…}`, `color|background:${…}`).

### 🎨 Estilos inline → clases (2026-10-23, Paso 5, tanda 15) — `encargos.js`

**`encargos.js`: 133 `style=""` → 2.** Quedan `display:none;` del avatar del selector de persona (`enc-persona-avatar`, que el JS conmuta con `style.display`; la clase `enc-persona-av` lleva el resto) y `cursor:pointer;` en `_encAttrs` (fragmento de atributos `data-mov-*` que se inserta en etiquetas ajenas y no puede llevar `class`). 88 clases `enc-*` al final de `styles.css`.
- **Colores dinámicos → clases:** `colorEnc`, `color` y `colorOrigen` (×2) ya no guardan `var(--x)` sino `enc-c-red|amber|blue`; el borde de cada movimiento del encargo (cuatro estados: entrada, abono de préstamo, compra con TC, salida) usa `enc-item` + `enc-item-b-ent|abono|tc|sal`.
- **Convertidor:** `convertir.py` ahora normaliza los saltos de línea dentro de un `style` (el selector de persona traía un `style` en cuatro líneas) y config en `scripts/paso5/config-encargos.py` (mapa `encargos.map.json`).
- **Especificidad:** el análisis contra `styles.css` marca `.nav-item svg`, `.action-card svg`, `.movs-search-wrap svg`, `.busqueda-sin-resultados-txt b` y los de `#dialog-actions`/`.fb-*`/`.ms-saldado`; ninguno es ancestro de las etiquetas de Encargos (la barra de navegación y las tarjetas de acción no contienen su HTML). **A confirmar con el comparador cuando haya `jsdom`:** los `<svg>` de las etiquetas azul/ámbar de encargo (`enc-ico-11/15/12`), por si algún día se renderizan dentro de una `.action-card`.
- **Verificación (sin `jsdom`):** archivo sin `style`/`class` == original salvo los 4 mapas de color; declaraciones de cada clase == su `style`; ninguna etiqueta con dos `class`.
- `tests/estilos.test.js`: `encargos.js` en `CONVERTIDOS`.

### 🎨 Estilos inline → clases (2026-10-23, Paso 5, tanda 14) — `tarjetas_credito.js`

**`tarjetas_credito.js`: 115 `style=""` → 4.** Quedan 3 `width:${pct}%` (barras de cupo y de cobertura, valor calculado) y 1 `style="cursor:pointer;"` dentro de `_tcAttrs`, que devuelve un fragmento de atributos `data-mov-*` que se inserta en etiquetas de otros sitios y no puede llevar `class`. 72 clases `tc-*` al final de `styles.css`.
- **Colores por estado → clases:** el color de la barra/porcentaje de cupo (`tc-c-red|amber|text3`, `tc-bg-red|amber|accent`, `tc-pill-red|amber|neutro`), el borde y la insignia de cada movimiento (`tc-item-b-amber|azul|rojo|morado`, `tc-badge-amber|azul|rojo|morado`) y el color de la cobertura de la cajita (`colorEstado`) ya no son valores `var(--x)`/`rgba()` sino nombres de clase. Desaparecen `badgeBg/badgeColor`, `colorBorde/colorMonto/colorBadgeBg/colorBadgeTxt` y las tres constantes `color/bg/borderC` del bloque "no alcanza" (era siempre ámbar: es la clase `tc-falta-*`).
- **Botón "Pagar":** su `style` tenía 5 propiedades que cambiaban según `deuda<=0`; ahora `tc-btn-pagar` + `tc-btn-pagar-on|off` (mantiene `cursor:not-allowed`).
- **Insignias de 9px:** reutilizan `badge-xs` (ya existía como `.badge.badge-xs`); no se duplicó la regla (el convertidor admite nombres con `=` delante para clases que ya existen).
- **Especificidad:** el análisis contra `styles.css` solo encuentra selectores de otros contenedores (`#dialog-actions button`, `#del-account-actions button`, `.fb-*`, `.ms-saldado i`, `.cuenta-action-btn svg`), que no contienen los elementos de Tarjetas.
- **Verificación (sin `jsdom`, la red del entorno sigue desactivada):** archivo sin `style`/`class` == original salvo los 7 mapas de color; declaraciones de cada clase == su `style`; ninguna etiqueta con dos `class`.
- **Nuevo verificador genérico `scripts/paso5/etiquetas.js <antes> <nuevo>`:** empareja las etiquetas de ambos archivos en orden y pasa cada par por el comparador de cascada (salta las que llevan `${…}` en `style`/`class`). **Escrito pero no ejecutado** (falta `jsdom`): correrlo sobre las 4 conversiones anteriores en cuanto haya `npm install`.
- `tests/estilos.test.js`: `tarjetas_credito.js` en `CONVERTIDOS`.

### 🎨 Estilos inline → clases (2026-10-23, Paso 5, tanda 13) — `alcancia.js`

**`alcancia.js`: 104 `style=""` → 4** (los 4 son `display:none` de elementos que el JS muestra/oculta: bloque de origen dividido, selector de préstamo del cobro de deuda, desglose de cada alcancía del historial). 61 clases `alc-*` al final de `styles.css`.
- **Elementos que el JS conmuta:** el selector de préstamo (`alc_dep_deudor_grupo_wrap`) y el desglose (`alc-hist-desglose-N`) conservan `style="display:none;"` y ganan una clase solo para el margen (`alc-mt8`, `alc-mt4`): `_alcDeudorSaldoHintActualizar` lee `style.display !== 'none'`, así que ese inline tiene que seguir ahí.
- **Colores por tipo/diferencia → clases:** `tipoColor`, `difColor` y `difMsgColor` ya no guardan `var(--x)` sino nombres de clase (`alc-c-accent|amber|red|text3`); el mensaje de diferencia usa `alc-dif-0|pos|neg` (color + fondo juntos). Los `hint.style.color = 'var(--x)'` (CSSOM) y el `fill` del SVG no se tocan: la CSP los permite.
- **Hallazgo cerrado:** el "grupo de deudor" (`alc_dep_deudor_grupo`, `_gruposAbiertos`) **no es código muerto**: Préstamos usa `d.grupos` y `m.grupoId` (`prestado.js` ~267-306, "Préstamo aparte"). Se conserva.
- **Especificidad:** compuestos `.btn.alc-…`, `.card.alc-…`, `.row.alc-…`, `.il.alc-…` donde la etiqueta ya tenía esa clase. Análisis por script contra `styles.css`: los únicos selectores más fuertes son de otros contenedores o igualan 0,2,0 (`.btn-primary + .btn-ghost`, `.btn-primary:active`) y ganan por orden, igual que antes ganaba el inline.
- **Verificación (sin `jsdom`):** archivo sin `style`/`class` == original salvo las 4 líneas de mapas de color; declaraciones de cada clase == su `style`; ninguna etiqueta con dos `class`. Pendiente con `jsdom`: comparador de cascada (mapa en `scripts/paso5/alcancia.map.json`).
- `tests/estilos.test.js`: `alcancia.js` en `CONVERTIDOS`; opción nueva `sinCss` (ganchos de JS que ya existían sin regla: `alc-hist-chevron`, `alc-dep-monto`) y una prueba de las clases armadas.

### 🎨 Estilos inline → clases (2026-10-23, Paso 5, tanda 12) — `nu.js`

**`nu.js`: 92 `style=""` → 2** (el `width:${pct}%` de las dos barras de progreso de la meta, valor calculado que irá al helper de estilos dinámicos del final del Paso 5). 69 clases `nu-*` al final de `styles.css`: aviso de chequeo, saldo mínimo, aportes de la meta, fila de cada cajita y sus insignias (CDT/meta), meta vacía, tarjeta de meta, tarjeta de CDT (cabecera, cuadrícula de datos, botones Cobrar/Reinvertir), selector de cajita del "Mover".
- **Estados dinámicos → clases:** `estadoColors` (dos copias) desaparece; el color de la barra es `nu-fill-ok|warn|late`, el de la insignia `nu-estado-ok|warn|late`, y los márgenes que dependían de una condición, `nu-mb12|nu-mb0` y `nu-mt4|nu-mt0`. Se añadió prueba en `tests/estilos.test.js` que exige que existan los tres estados.
- **Detalle conservado a propósito:** la insignia de estado traía `border:1px solid;border-color:var(--x)40`; `var(--x)40` no es un color válido, así que el navegador ignoraba ese `border-color` y el borde era `currentColor`. La clase `nu-estado-*` usa `border:1px solid` (mismo resultado).
- **Especificidad:** los `<input>` de aportes llevan `input.nu-…` (`input[type=text]` y `.prest-split-row input` valen 0,1,1) y los botones `.btn.nu-…`; el resto, una sola clase al final de la hoja. Análisis de conflictos con `styles.css` hecho por script: los únicos selectores con más especificidad son de otros contenedores (`#dialog-actions`, `.ms-saldado`, `.busqueda-sin-resultados-txt`, `.fb-*`) y no alcanzan estos elementos.
- **Verificación (otra vez sin `jsdom`):** el archivo nuevo, sin `style`/`class`, es idéntico al original salvo `estadoColors`; cada clase tiene exactamente las declaraciones de su `style`; no hay etiquetas con dos `class`. **Pendiente con `jsdom`:** pasar por pares con `scripts/paso5/` (verificador `nu.js` aún por escribir: copiar `movimientos.js` y usar `nu.map.json`).
- `tests/estilos.test.js`: `nu.js` añadido a `CONVERTIDOS` (permitido solo `width:${…}`; `armadas: nu-estado-, nu-fill-`).

### 🎨 Estilos inline → clases (2026-10-23, Paso 5, tanda 11) — `movimientos.js` (detalle de un movimiento)

**`js/core/movimientos.js`: 97 `style=""` → 0.** Clases `mdet-*` al final de `styles.css` (59): cabecera con monto, caja de saldo antes/después, paneles de contexto (sobrante del diferencial, ganancia por valor diferente, destino del extra, ganancia incluida, compra con TC) y filas de "salió de / entró a". El color del monto era una variable `colorMonto` (`var(--accent)`/`var(--red)`); ahora es `claseMonto` (`mdet-c-accent`/`mdet-c-red`) y los dos valores calculados del panel de otras cuentas y de la pérdida/ganancia usan las mismas clases de color. Sin cambios de comportamiento.
- **Verificación (sin jsdom en este entorno, no hubo comparador de cascada):** (1) por construcción el archivo nuevo, sin `style`/`class`, es idéntico al original salvo la constante de color; (2) cada clase tiene exactamente las declaraciones del `style` que reemplaza (comprobado una por una); (3) no hay selectores de descendiente en `styles.css` que alcancen esos elementos. **Pendiente de la próxima sesión con `jsdom`:** pasar `scripts/paso5/verificar.js` (el verificador de esta tanda es `scripts/paso5/movimientos.js`, pares estilo→clase).
- `tests/estilos.test.js`: `movimientos.js` añadido a `CONVERTIDOS`.

### 🧹 Limpieza: `_esAlcancia` en `S.gastosVar` (2026-10-23)

Nada escribía `_esAlcancia` en `S.gastosVar` desde que el depósito desde cuenta pasó a ser una transferencia (2026-09-27). Se quitaron las lecturas muertas en `cuentas.js` (`getMovimientosCuenta`) y `actividad_reciente.js` (`_normGastos`), los fixtures g06/g11 de `tests/cuentas.test.js` y la bandera en la prueba de `_esGastoVarNoReal`. **Se conserva** `_esAlcancia` en `S.movimientos` (destape y sobrante) y en `S.transferencias` (depósito), que sí se escriben.

### 📝 Decisión: lista única de archivos para las pruebas (2026-10-23) — descartada
La guardia `ningún test carga cuentas.js sin cargar también nu.js` ya cubre el fallo silencioso que motivaba el helper `tests/support/modulos.js`; agregarlo cambiaba ~14 líneas por repetición, no por seguridad. Se deja como está.

### 🎨 Estilos inline → clases (2026-10-23, Paso 5, tanda 10) — `prestado.js`

**`prestado.js`: 84 → 1** (el color/fondo del avatar de cada persona, que elige el usuario). Clases `pr-*` al final de `styles.css`: lista de personas con deuda, tarjeta de cada una, grupos de préstamos (acordeón), historial de movimientos de "Me deben" y de "Yo debo" (chips de destino, nota, monto, botón de borrar), los recuadros de impacto del préstamo y las partes de un pago de más. Los colores calculados pasan a clases (`c-amber|green|red` en saldos y montos, `clase:` en cada tipo de `_extTipos`).
- **Corrección de comportamiento (la única de todo el Paso 5):** el botón de quitar una parte del extra (`extRenderPartes`) llevaba **dos atributos `style`** (`...flex-shrink:0;" style="visibility:hidden;"`); el navegador solo usa el primero, así que con una sola parte el botón **nunca se ocultaba** (intención evidente: ocultarlo). Ahora es la clase `pr-oculto` y sí se oculta; el verificador lo comprueba aparte. Búsqueda en todo el proyecto: no hay otra etiqueta con `style` ni con `class` duplicados.
- **Preservado a propósito (quirk previo):** el avatar declaraba `border-color:<color>33` y luego `border:1px solid`, que lo reinicia a `currentColor`; el borde efectivo siempre fue el color pleno. Se dejó igual (clase con `border:1px solid` + `color` inline). Si se quería el borde translúcido es un cambio de diseño aparte.
- **Error propio atrapado por el verificador:** al convertir dejé dos atributos `class` en el `<select>` del tipo de extra (el navegador ignora el segundo); se fusionaron, y se buscó la misma trampa en todo el proyecto (0 más).
- **Verificado ejecutando** `_renderListaDeudas` (favor y contra), `abrirDeudor`, `abrirMiDeuda` (con y sin grupos, con deudores sin movimientos y sin deudas) y `extRenderPartes` (cuatro partes, una de cada tipo) del archivo de `js.zip` y del nuevo (`scripts/paso5/prestado.js`; historial con préstamos por varias cuentas, con TC, con ganancia, vía encargo, abonos con destinos y partes extra, vía alcancía, perdonado y pago completo): **25 comparaciones, 0 diferencias**; resúmenes pequeños por fragmentos. Mutación de 9 reglas: las 9 hacen fallar. Para los campos del extra se subió la especificidad (`.pr-ext-card input…`, `.select-wrap select.pr-sel-sm`) porque las reglas globales `input:focus/select:focus` ganaban a una clase simple de la misma especificidad.
- `tests/estilos.test.js` suma el archivo y una prueba de los colores de `_extTipos`. Pruebas: `npm test` 422/422; smoke sin fallos. `sw.js` v47.

### 🎨 Estilos inline → clases (2026-10-22, Paso 5, tanda 9) — `spotify.js` + verificadores reunidos en `scripts/paso5/`

**`spotify.js`: 79 → 3** (los `display:none` de los avatares y del aviso del selector de persona, que el JS conmuta y deben seguir inline porque `style.display=''` los devolvería a la regla de la clase). Clases `sp-*` al final de `styles.css` (la lista de integrantes y sus botones, el historial de pagos y cobros con sus abonos pendientes, el panel de estadísticas, los selectores de persona). Los colores de `cV()` (valor positivo/negativo/neutro) pasan de `var(--x)` a clases (`c-green`/`c-red`/`sp-t-neu`). Los `style.cssText`/`style.color` del JS (aviso de costo, vista previa de cobros) son CSSOM y no cambian.
- **Verificado ejecutando** `renderSpotify`, `renderSpHistorial`, `renderSpStats` y los dos selectores de persona del archivo de `js.zip` y del nuevo, en 8 escenarios (cuatro personas con vencida/hoy/futura/sin fecha, historial con abono pendiente, extra, cobro dividido y nota; sin pagos a Spotify, pago mayor que lo cobrado, tu parte del plan, ganancia exactamente cero, sin costo, sin historial, sin personas): **27 comparaciones, 0 diferencias**. Mutación de 10 reglas: las 10 hacen fallar (dos de ellas obligaron a añadir los escenarios de "tu parte del plan" y "cero" para que esas ramas se ejercitaran).
- **Verificadores reunidos:** los 6 archivos `equivalencia-*.js` pasan a **`scripts/paso5/`** (`comparador.js` + un archivo por módulo + `verificar.js`, un único comando: `node scripts/paso5/verificar.js todos --antes=<carpeta con el repo anterior>`). Son herramientas **temporales**: necesitan la versión "antes" del archivo y no sirven como pruebas del producto; la carpeta se borra cuando el Paso 5 termine (la guardia permanente es `tests/estilos.test.js`). `scripts/equivalencia.js` (cifras por mes sobre un backup real) es otra herramienta y no se toca.
- `tests/estilos.test.js` suma el archivo y una prueba de `cV()`. Pruebas: `npm test` 419/419; smoke sin fallos. `sw.js` v46.

### 🎨 Estilos inline → clases (2026-10-22, Paso 5, tanda 8) — `analisis.js`

`analisis.js` pasa de 73 `style=""` a 5, todos valores calculados que no pueden ser clase: el ancho en % de las barras (categorías, ranking de meses, presupuestos), la altura de las barras del gráfico de 12 meses y el `display:none` del tooltip del patrimonio (JS lo conmuta). Clases `an-*` al final de `styles.css`; `hero.style.cssText` y los `tt.style.*` son CSSOM y no cambian.
- **Colores calculados → clases:** el tono de la categoría/presupuesto (`an-t-red|amber|accent|blue|purple|text2` para el texto y `an-bg-…` para la barra, armados con la variable `tono`), el balance del encabezado (`claseTono`: `an-t-muted`/`c-green`/`c-red`), la flecha y el color de la comparación con el mes anterior (`diffColor()` → `diffClase()`) y los de la gráfica de patrimonio (`diffClasePat`). **Se mantiene `diffColor` como valor `var(--x)` donde se usa como atributo** (trazo SVG y `data-diffcolor`, que lee el JS del tooltip).
- **Estados de la barra del gráfico y del ranking** pasan a clases modificadoras (`an-bar-act/inact`, `an-bar-lbl-act`, `an-rank-fila-sep`, `an-rank-nombre-act`, `an-cat-fila-ult`).
- **Verificado ejecutando** `renderAnalisis`, `renderIngresosFijos`, `renderPresupuestos` y `abrirPresupuestos` del archivo de `js.zip` y del nuevo (`scripts/equivalencia-analisis.js`: DOM falso con `createElement`, 5 escenarios —mes normal, sin ingresos, balance negativo con patrimonio bajando, sin mes anterior ni historial, sin presupuestos— más el editor, el `onclick` real de las barras y el tooltip del patrimonio): **48 comparaciones, 0 diferencias**. Mutación (5 reglas: ámbar, rojo de barra, tooltip, separador del ranking, barra activa): todas fallan.
- **Lo que la verificación obligó a cuidar:** el comparador trata las longhands de forma estricta (`margin-bottom:0px` vs `0`, `margin:0` vs `margin-bottom:0`); las clases quedaron escritas igual que el inline original.
- `tests/estilos.test.js` suma el archivo (con `armadas` para los prefijos que el código completa con una variable) y una prueba de que los 6 tonos existen. Pruebas: `npm test` 416/416; smoke sin fallos. `sw.js` v45. Documento del módulo (`analisis-financiero.md`) revisado: no describe estilos, sin cambios.

### 📚 Auditoría de documentación (2026-10-22)

Se recorrieron los 26 `.md` de `docs/`, `libro-de-movimientos.md` y `tests/README.md` contra el código real (¿existe cada función, archivo, id y prueba que citan?) y se corrigió lo que describía un estado anterior:
- **`plan-clasificacion-movimientos.md` no existe** (9 documentos lo enlazaban: actividad-reciente, alcancia, cuentas, encargos, gastos, mesada, plata-comprometida, spotify, tarjetas-credito): ahora apuntan a `libro-de-movimientos.md` (regla 7) y al CHANGELOG.
- **`analisis-financiero.md` §9bis:** describía reglas de respaldo "congeladas" (`_reglaHistorica…`) y la migración v3; `claseEfectivaMovimiento()` solo lee `clase` desde el 2026-10-13 (no hay respaldo; `save()` avisa de movimientos sin clase). Reescrito el aviso y las dos viñetas de los helpers.
- **`configuracion.md`:** hablaba de la migración v3 de `clase`; hoy `MIGRACIONES` está vacío (esquema 9, sin migrar datos anteriores; los backups de esquemas menores se rechazan).
- **`actividad-reciente.md`:** el feed ya no lee `S.cajitas[].historial` ni `S.cuentasPersonalizadas[].movimientos` (no existen; todo está en `S.movimientos`, regla 9 del libro), `_normCajitas` ya no existe, y Spotify es `S.spotify.historial`. Corregidas las filas de fuentes, "Mesada a una cajita" (sí aparece), los duplicados revisados y la tabla de funciones.
- **Spotify en el esquema 9:** `S.spotifyPersonas`/`S.spotifyHistorial` → `S.spotify.personas`/`S.spotify.historial` en `personas.md` y `wrapped.md`; `spotify.md` citaba `_registrarMovSecundarioMesada` (hoy `_mesadaEntrar`).
- **`arquitectura-archivos.md` §4:** decía que `calcC`/`calcCDT` viven en `cuentas.js` (lazy) y que `snapshotPatrimonio` espera a `getDeudorSaldoPatrimonio` (no existe). Hoy están en `nu-calc.js` y `calc-helpers.js` (de entrada) y el guard es `calcC`, `calcCDT` y `Deudas`. Lo mismo en `proyeccion-financiera.md` (ya no hay `_calcCSafe`/`_calcCDTSafe`; `crearMiDeuda()` no existe → `_aplicarMovMiDeuda`).
- **`guia-estilo-sheets.md`:** la tabla de "tipos de depósito" de Alcancía era del diseño anterior al de orígenes (y decía que `yo-cuenta` va a `S.gastosVar`); reemplazada por el diseño actual con un puntero a `alcancia.md`. Quitada la convención `ingreso`/`egreso` de `c.movimientos` (no existe) y `totalMamá`. Nueva §0 "Estilos: clases, no `style=""`" y los ejemplos de `*` y `(opcional)` pasan a `c-red` y `lbl-opc` (clase nueva en `styles.css`).
- **Otros:** `proteccion-antiguedad-movimientos.md` (un solo `_deudaTieneCuentaAfectada`), `alcancia.md` (ids `alc_dep_origen`/`alc_split_rows`, eventos `toggleDividir`/`agregarOrigen`; `alc_dep_tipo` no existe), `gastos.md` (`getSaldoActual` ya no existe), `tarjetas-credito.md` (enlace a `prestado.md`), `cuentas.md`/`mesada.md`/`libro-de-movimientos.md`/`tests/README.md` (las pruebas viven consolidadas en `cuentas`, `libro`, `mesada`, `nucleo`, `prestamos` `.test.js`, no en los archivos sueltos que citaban), `wrapped.md` (scripts de época fuera del repo).
- **Nombres de campos de `S`:** plata comprometida es `S.plataComprometida` (los docs de `plata-comprometida`, `actividad-reciente` y `wrapped` seguían diciendo `plataCometida` y hasta explicaban el typo como vigente; se renombró en la migración v2, ya retirada); `proyeccion-financiera.md` citaba `S.mesadasV2` (es `S.mesadas`); `alcancia.md` listaba `S.alcanciaMigrada`, que no existe en el código (quitada).
- **Sumado:** `mis-finanzas.md` (filas de `scripts/` y `tests/`; `configuracion.md` y `actividad-reciente.md` sí existen), `auditoria-tecnica.md` (sección de seguridad pendiente: la CSP aún permite estilos inline) y `tests/README.md` (herramientas `equivalencia-*`).
- **Verificación:** script de auditoría que extrae de cada documento los identificadores y archivos entre comillas inversas y comprueba que existan en el código; lo que queda sin encontrar es histórico a propósito ("antes existía X", `modulo.md`, etc.).
- **Hallazgo de código (no tocado):** `alcancia.js` conserva la lógica de "grupo de deudor" (`alc_dep_deudor_grupo`, `_gruposAbiertos`) y los estilos de `index.html`/JS siguen pendientes; se resuelve al convertir `alcancia.js` (Paso 5).

### 🎨 Estilos inline → clases (2026-10-21, Paso 5, tanda 7) — `cuentas.js`

`cuentas.js` pasa de 47 `style=""` a 7, todos valores calculados: el tamaño y los colores del ícono de cada cuenta (`renderIconoCustom`, `_iconoEfectivo`: `width/height/border-radius/background/color` salen del tamaño pedido y del color que eligió el usuario), el fondo y el color de cada opción de la cuadrícula de íconos, y las variables `--cuenta`/`--cuenta-rgb` de cada tarjeta del selector. Lo estático de esos mismos elementos pasó a clases (`cuenta-ico-box`, `cuenta-ico-op*`).
- **Convertido:** fila de cuenta con ícono, historial de movimientos (fila, nombre, chip "Automático", fecha, monto, botón borrar y candado, etiquetas, nota, destino de transferencia; vacío y "sin resultados"), botón de limpiar fechas, banner de saldo inicial (con y sin apertura), etiquetas del formulario "Agregar dinero", vistas previas de "Corregir saldo inicial" y de Transferir. Se reutilizaron `gasto-item-info`, `gasto-nombre-fila`, `badge-xs`, `ico-inline`, `c-red/c-green/c-blue`. Clases nuevas `cuenta-*` al final de `styles.css`.
- **Cambio de estructura mínimo:** `colorMonto` (un `var(--x)`) pasó a `claseMonto` (`c-blue`/`c-green`/`c-red`); la fila con detalle suma `gasto-item-click` en vez de `style="cursor:pointer"` dentro de un atributo armado en una cadena.
- **Verificado ejecutando las funciones reales** del `cuentas.js` de `js.zip` y el nuevo (herramienta nueva `scripts/equivalencia-cuentas.js`, DOM falso + `html-tag.js`): íconos y selector de las 4 cuentas (Nequi, Efectivo, 2 personalizadas, una con iniciales), título del detalle, cuadrícula con 4 opciones seleccionadas, historial con 9 filas de todo tipo (apertura, ingreso con nota, gasto con categoría, retiro, transferencia, préstamo automático, depósito oculto de Alcancía, cajita, sin id), filtros con y sin fechas, sin resultados, vacío, banner con y sin apertura, etiqueta de apertura marcada/no marcada, Transferir normal y con saldo insuficiente: **29 comparaciones, 0 diferencias**. Mutación (tamaño del monto y color del aviso): falla.
- **Lo que la verificación atrapó:** la opción seleccionada de la cuadrícula tenía `border-color` suelto sobre un `border` abreviado; se dejó la forma abreviada (`border:2px solid var(--accent)`), idéntica a la original.
- `tests/estilos.test.js` suma el archivo con los 4 valores calculados permitidos. Pruebas: `npm test` 413/413; smoke sin fallos. `sw.js` v44.

### 🎨 Estilos inline → clases (2026-10-21, Paso 5, tanda 6) — archivos sueltos

Cinco archivos de 1 a 6 `style=""` quedan sin ninguno: `mesada.js` (badge 9px → `badge-xs`, que ya existía), `wrapped-gate.js` (flecha del botón → `wrapped-gate-flecha`), `core-state.js` (ícono de ganancia → `ico-inline`), `pin-bio.js` (6: fila de botones `pin-fila-btns`, `btn-flex1`, `btn-block`, `btn-peligro`) y `gastos-fijos-progress.js` (el `width:0%` inicial pasó a la regla de `.fijos-progress-fill`; JS sigue poniendo el ancho real al calcular). Clases al final de `css/styles.css`.
- **Quedan `style=""` a propósito en dos archivos más pequeños:** `diferencial.js` (3 `display:none` que JS conmuta) y `actividad_reciente.js` (2 valores calculados: fondo del ícono y color del monto de cada movimiento). Ya estaban o quedan registrados en `tests/estilos.test.js` como permitidos.
- **Verificado por pares** con `scripts/equivalencia-sueltos.js` (8 fragmentos antes/después con el CSS nuevo y `equivalencia-estilos.js`): 0 diferencias; por mutación (color de `btn-peligro`) falla. Los botones de `pin-bio` tenían tres fuentes de estilo que competían (`.btn-sm{width:auto}`, `.btn-ghost`, inline): las clases nuevas son de 2-3 clases para ganar igual que ganaba el inline.
- La guardia `tests/estilos.test.js` ahora acepta una clase igual al prefijo (`badge-xs`, `ico-inline`) y suma los 7 archivos. Pruebas: `npm test` 411/411; smoke sin fallos. `sw.js` v43.

### 🎨 Estilos inline → clases (2026-10-21, Paso 5, tanda 5) — `wrapped.js`

`wrapped.js` pasa de 16 `style=""` a 1: el gráfico de línea y el mensual (`wrapped-svg-block`, zonas táctiles `wrapped-hit`), el número grande de cada slide, el detalle de un mes, los puntos de color de la vista mensual (`wrapped-mes-dot-ok/mal/cero`), el separador de la nota de préstamos (`wrapped-sub-sep`) y el ícono de la estrella (`wrapped-icono-sep`). Las clases nuevas van **dentro del `<style>` que inyecta el propio archivo** (`_wrappedInyectarEstilos`, donde ya vivía todo el CSS de Wrapped); los colores usan las utilidades `c-green/red/amber/purple/blue` de `styles.css` y `wrapped-c-text`. El que queda es el `animation-delay` de cada punto de la línea (`i*0.09s`: un valor distinto por punto, no puede ser clase).
- **Causa raíz que casi se cuela (otro lector del estilo inline):** el color de fondo de cada slide (`mood`) se deducía con una regex sobre el HTML del slide (`color:\s*var\(--X\)`, en `_wrappedBuildSlides`). Al quitar el `style="color:…"` esa regex ya no encontraba nada y **todos los slides sin mood explícito habrían caído a `accent`** (verde) sin dar error. Ahora lee la clase (`c-purple`…`c-green`, `c-green` → `accent`) y `_wrappedColorClase(color)` traduce el `var(--X)` que reciben los 14 llamadores de `_wrappedSlideBignum` (avisa por consola si llega uno sin clase). Regla para el resto del Paso 5: **antes de convertir un archivo, buscar quién lee su HTML o su `.style`** (regex sobre `color:`, `getAttribute('style')`, selectores `[style*=…]`).
- **Código muerto quitado:** la clase `wrapped-dot-final` (y `esFinal`) del último punto de la línea: sin regla CSS ni lector.
- **Verificado ejecutando `_wrappedBuildSlides` completo** con el código de `js.zip` y el nuevo (herramienta nueva `scripts/equivalencia-wrapped.js`: expone `_wrappedBuildSlides` en una copia de prueba, suma el CSS inyectado a `styles.css` y compara mood + estilo efectivo de cada elemento) sobre 5 escenarios (base, racha de alcancía, préstamo devuelto rápido y otro sin devolver, mes con balance exacto 0, gasto raro que no es el mayor): **86 slides, 0 diferencias**, las 13 clases nuevas ejercitadas. Mutación: con el regex roto salen 17 fallos de mood; con un color de punto cambiado, 5 fallos de estilo.
- `tests/estilos.test.js` suma el archivo (con `cssEn` para leer el CSS inyectado) y una prueba del mapa de colores/mood. Pruebas: `npm test` 399/399; smoke sin fallos. `sw.js` v42.

### 🎨 Estilos inline → clases (2026-10-21, Paso 5, tanda 4) — `inicio.js`

`inicio.js` pasa de 43 `style=""` a 1: tarjeta "Necesita atención" (badge e ítems), Salud financiera (anillo, puntaje, consejos) y Proyección (estado vacío, tendencia, tarjetas 3m/6m/12m, chips de confianza y los dos tooltips que arma `showTT`). Clases `inicio-*` al final de `css/styles.css`. El que queda es `display:none` del tooltip `#_proy-tt`, que JS conmuta con `style.display`.
- **Colores calculados → clases modificadoras:** `inicio-attn-badge-red/amber`, `inicio-attn-texto-red/amber`, `inicio-salud-ok/warn/mal`, `inicio-tip-ok/warn`, `inicio-proy-pos/neg`, `inicio-tt-pos/neg`. Se quitaron la variable `col` de `renderProyeccion` (ya no se usa), `color` de los consejos y `col2` del tooltip.
- **Verificado renderizando antes y después** con la herramienta nueva `scripts/equivalencia-inicio.js` (JSDOM real: ejecuta el `inicio.js` de `js.zip` y el nuevo con los mismos datos y compara el estilo efectivo de cada elemento con `equivalencia-estilos.js`): atención ámbar y roja con la sección abierta y cerrada, salud con puntaje 100/80/60/30 y sin datos, proyección sin patrimonio / historial insuficiente / preliminar / normal / estable / tendencia negativa, y el tooltip que sale al tocar la cabecera y las tarjetas 3m y 12m: **27 comparaciones, 0 diferencias, 0 avisos**. Se comprobó por mutación (cambiar el color de `.inicio-proy-neg` y el tamaño de `.inicio-tt-delta`) que el verificador falla.
- `tests/estilos.test.js` suma el archivo. Pruebas: `npm test` 396/396; smoke sin fallos (207/0/0). `sw.js` v41.

### 🎨 Estilos inline → clases (2026-10-20, Paso 5, tanda 3) — `gastos.js`

`gastos.js` pasa de 29 `style=""` a 0: lista de gastos variables (fila, chip "Automático", candado, nota, cabecera por día con su variante de primer día), lista de gastos fijos (Pagado, botón Pagar, fila de meta) y la flecha de deuda del sheet de pago de un fijo. Clases `gasto-*`, `badge-xs` y `row-name-13` al final de `css/styles.css`.
- **Verificado renderizando antes y después** (`renderGastosVar` y `renderGastosFijos` con el código de `js.zip` y el nuevo, mismos datos: gasto normal con nota, dividido en dos cuentas, compra con TC, pago de TC, pago de gasto fijo con y sin TC, movimiento automático/secundario, "Restar dinero", fijos pagados, pendientes y Spotify virtual): 150 + 43 elementos equivalentes, sin avisos. La flecha de `pgfActualizarSaldo` se comprobó aparte.
- Lo calculado (opacidad del gasto fijo/pago de TC, color del monto, margen del primer día) pasó a clases modificadoras: `gasto-item-atenuado`, `c-red`/`c-green`/`gasto-monto-fijo`, `gasto-dia-primero`. El badge de 9px se repetía 9 veces y ahora es `badge-xs`.
- `tests/estilos.test.js` suma el archivo. Pruebas: `npm test` 394/394; smoke sin fallos.

### 🎨 Estilos inline → clases (2026-10-20, Paso 5, tanda 2) — `busqueda-global.js` y `configuracion.js`

`busqueda-global.js` pasa de 16 `style=""` a 2 y `configuracion.js` de 4 a 0. Las clases nuevas (`busqueda-*`, `cat-chips`, `cat-chip`, `cat-chip-del`) van al final de `css/styles.css`. Los 2 que quedan en búsqueda son valores que salen del resultado (el color del tipo y el fondo del ícono según el color).
- **Verificado en un DOM real:** se ejecutó el código anterior y el nuevo en jsdom con los mismos datos (gastos, fijos, deudores, cajitas, encargos, personas, Spotify, movimientos, alcancía; con y sin resultados; con menos de 2 caracteres) y se comparó con `scripts/equivalencia-estilos.js`: 372 elementos equivalentes. Chips de categorías: 14 elementos equivalentes.
- **Cambio de comportamiento deliberado:** la regla `.cat-chip-del:hover{color:var(--red)}` ya existía pero nunca se aplicaba (el `color` inline del botón le ganaba). Ahora la `x` de una categoría se pone roja al pasar el ratón, que era lo previsto.
- Los resultados sin destino (`navTipo` vacío) usan `.busqueda-item.busqueda-item-sin-nav{cursor:default}` en vez de un `cursor` inline.
- `tests/estilos.test.js` suma estos dos archivos y ahora solo cuenta clases dentro de atributos `class`/`className` (los ids `busqueda-*` no cuentan); acepta como permitido un texto exacto o una expresión regular.
- Pruebas: `npm test` 392/392; smoke sin fallos.

### 🎨 Estilos inline → clases (2026-10-20, Paso 5, tanda 1) — `diferencial.js` y `split.js`

38 `style=""` de `diferencial.js` (quedan 3 `display:none` que JS conmuta) y 3 + un `style.cssText` de `split.js` pasan a clases `diferencial-*` / `split-*` al final de `css/styles.css`. Es la primera tanda del Paso 5.
- **Equivalencia comprobada, no supuesta:** `scripts/equivalencia-estilos.js` (nuevo) compara, elemento por elemento, el estilo efectivo antes y después con la cascada real (especificidad, orden, `!important`, shorthands, reglas de estado y `@media`). Cubre la fila de beneficiario con y sin intercambio, la plantilla completa, el historial, los 5 estados del resumen y la fila de split: todo equivalente. Por mutación se comprobó que detecta diferencias.
- **Lo que casi se pierde:** el resumen vacío se colapsaba por `[style*="min-height"]:empty` sobre el `style=""`; al pasar a clase se añadió `.diferencial-resumen:empty{min-height:0}`.
- **Especificidad:** las reglas base de `input[type=text]`, `select`, `.il`, `.ig` ganan a una clase suelta, así que las nuevas son `input.diferencial-input`, `select.diferencial-select`, `.il.diferencial-lbl-*`, `.ig.diferencial-ig` y el bloque va al final.
- Nuevo `tests/estilos.test.js`: ningún `style=""` estático nuevo en los archivos convertidos y toda clase que usan existe en el CSS (+ la regla `:empty`).
- Pruebas: `npm test` 388/388; smoke sin fallos.

### 🧹 Limpieza (2026-10-20) — fuera el código que existía solo para datos anteriores

La app no tiene datos antiguos que proteger (decisión de Sebas, 2026-10-18), así que se borró en vez de mantenerse. Para cada candidato se buscó antes quién escribe el dato; si nadie, el código de lectura era muerto.
- **`_migrarGruposDeudor`** (`prestado.js`, con 5 llamadas en `prestado.js` y `alcancia.js`) y su prueba. Los 7 sitios que crean movimientos de deuda ya escriben `grupoId`; `_getOrCrearHistorico` crea `d.grupos` cuando hace falta y `_gruposAbiertos`/`_autoCerrarGruposEnCero` toleran su ausencia.
- **Spotify / Cuentas:** el id `sp_legacy_<índice>` para cobros sin id (`cuentas.js`; todo cobro nace con `id`), el respaldo por nombre en `spCobradoDePersona` (todo cobro lleva `spId`) y el respaldo de `_cuotaAdmin` (todo pago la guarda). El fixture de `cuentas.test.js` pasó el cobro "Sin id" a un cobro con id (`sp9`) y la prueba del id estable se quitó.
- **Wrapped:** el fallback `S.nu.cajitas` (`_wrappedListaCajitas` lee solo `S.cajitas`) y los comentarios que decían que `pagosGastosFijos` podía ser un array (`Periodo` ya solo lee el mapa).
- **Alcancía:** el tipo de depósito `'split'` (lectura en el desglose, aviso de antigüedad, texto del diálogo y reversión; nada lo escribe desde que existe `'multi'`) y el filtro de `S.gastosVar` en `_alcQuitarMirrorCuenta` (el espejo de un depósito con cuenta vive solo en `S.transferencias`).
- **Búsqueda global:** la rama `_esAlcancia` de los gastos variables (el destape guarda `_esAlcanciaAjuste`, nunca `_esAlcancia`, en `S.gastosVar`).
- **`getSaldoActual`:** el alias de `getSaldoFuente` (27 usos renombrados; los tests dejan de enlazarlo a mano).
- Comentarios: `split (legacy)` en el modelo de origen de `core-state.js`; "legacy" en `movimientos.js` (`'ingreso'` no es legado: es como la vista de Cuentas rotula una entrada).

Documentación ajustada: `alcancia.md` (sin `split` ni migración de grupos), `prestado.md`, `spotify.md`, `wrapped.md`. **Sin hacer, anotado como candidato:** `_esAlcancia` en `S.gastosVar` también se lee en `cuentas.js` (~514), `actividad_reciente.js` (~237) y `_esGastoVarNoReal`, y los fixtures g06/g11 de `cuentas.test.js` lo usan; nada lo escribe ya. `configuracion.js` conserva su rechazo del formato viejo de cuentas (una línea útil).

Verificación: `npm test` 383/383, `scripts/smoke-browser.js` sin fallos (207 usadas, 0 sin registrar, 0 duplicadas).

### 🐛 Corregido (2026-10-13) — Plata comprometida: al eliminar un ingreso no se devolvía todo, y las llamadas de saldo no llevaban `origen` (`plata_comprometida.js`)

La guardia `puerta-unica` encontró 15 llamadas a `sumarFuente`/`descontarFuente` sin `origen`; al revisarlas aparecieron cuatro fallos de fondo en la reversión, todos contra la regla "eliminar el movimiento principal lo deshace todo, como si nunca hubiera pasado":
- **El sobrante ("Ingreso libre") nunca se devolvía.** `_cpEliminar` borraba la fila de `S.movimientos` pero dejaba la plata en la cuenta (el saldo quedaba más alto que su historial). Ahora el ingreso guarda `item.sobrante = { cuenta, monto }` al recibirse y eliminarlo lo descuenta.
- **Un adelanto o un pago ya hechos tampoco se devolvían** si el ingreso ya estaba recibido: solo se revertía lo que se movió al recibir. Con un adelanto de $30.000 repuesto y luego eliminado, la cuenta quedaba $30.000 abajo. Ahora se devuelven también (y su fila de `S.movimientos`).
- **Quedaba una fila huérfana** (`Reposición gasto: …`) porque el filtro buscaba el texto del ingreso, que esa fila no incluye. Las filas que se crean al recibir llevan ahora `_cpItemId` y se borran por ese id.
- **Seguía escribiendo la lista vieja `cuenta.movimientos`** cuando el sobrante entraba a una cuenta personalizada. Se quitó.

Todas las llamadas llevan `origen` (`_ogCp(ref, rev)`, módulo `plata-comprometida`, `ref` = id del destino, o del ingreso para el sobrante) y las reversiones pasan el mismo `ref` con `rev: true`. La opción `{ exacto: true }` (ya sin efecto desde que el saldo no se recorta) se retiró. Pruebas nuevas en `tests/libro.test.js` (bloque `plata-comprometida`, 6 casos); fallan todas con el código anterior.

**Decisión de comportamiento:** eliminar un ingreso recibido ahora también devuelve los adelantos y pagos que ya se habían hecho. Antes los dejaba (el aviso solo prometía revertir lo generado al recibir); ahora el aviso y el código coinciden con la regla de arriba.

### 🐛 Corregido (2026-10-13) — Eliminar un movimiento desde una cuenta pedía dos clics y revertía dos veces (`movimientos.js`)

Causa raíz: `eliminarMovimiento()` tenía **todo el bloque "confirmación + reversión" duplicado dentro de la misma función** (un copiar y pegar accidental). Corría así: protección por antigüedad → confirmación 1 → reversión 1 → confirmación 2 → reversión 2. Por eso el primer clic en "Eliminar" parecía no hacer nada (era el segundo diálogo, idéntico) y el segundo clic revertía otra vez.

El efecto dependía del tipo de movimiento: en gastos y transferencias la segunda reversión no encontraba el registro y no hacía nada (por eso "se revierte bien"), pero en **saldo inicial, ingresos manuales y retiros de cuentas personalizadas** la segunda vuelta usaba el monto que mostraba la fila (sin comprobar que el registro siguiera existiendo) y devolvía la plata dos veces: un saldo inicial de $10 pasaba a −$10 y un retiro de $2.000 sobre $10.000 terminaba en $12.000.

Arreglo: se quitó la copia (queda una sola confirmación y una sola cadena de reversión, −112 líneas) y se añadieron tres protecciones para que no se pueda duplicar plata aunque el clic se dispare dos veces o la fila quede pintada:
- `eliminarMovimiento` es ahora un envoltorio con un candado por movimiento (`_movEliminando`): un segundo disparo del mismo clic no abre otro diálogo ni revierte.
- `_movExiste(tipo, id)`: antes de preguntar y otra vez después de confirmar se comprueba que el registro siga existiendo; si no, avisa "Este movimiento ya se eliminó" y no mueve nada.
- La reversión sale del **registro**, nunca del monto de la pantalla; se retiró la rama "dato huérfano" que devolvía el monto de la fila aunque el registro ya no estuviera.

Pruebas (`tests/cuentas.test.js`, bloque `eliminar-movimiento`, 9 casos): saldo inicial, retiro, retiro de cuenta personalizada, ingreso, transferencia, gasto, doble disparo, movimiento ya eliminado y gasto dividido. Con el archivo anterior fallan las 9 con los mismos números que se vieron en pantalla (−10, 12.000, dos diálogos).

### 🐛 Corregido (2026-10-13) — Un gasto dividido entre dos cuentas no aparecía en ninguna y, borrado desde la cuenta, no devolvía la plata (`cuentas.js`, `movimientos.js`)

- **No aparecía:** `getMovimientosCuenta` solo buscaba gastos con `g.fuente`, y un gasto dividido guarda `fuente: ''` más una lista `splits`, así que no coincidía con ninguna cuenta aunque el saldo sí bajaba (los préstamos divididos sí lo contemplaban). Ahora cada cuenta muestra **su parte** del gasto, con las otras cuentas en el detalle.
- **No devolvía la plata:** la rama de gastos de `eliminarMovimiento` solo devolvía `g.fuente`; con un gasto dividido borraba el registro y la plata no volvía a ninguna cuenta. Ahora devuelve cada parte a su cuenta, igual que `deleteGastoVar` en `gastos.js`.

### 🔧 Cambio (2026-10-13) — `dialogo()` cancela el diálogo anterior en vez de dejarlo colgado (`core-state.js`)

`dialogo()` guarda un único resolvedor (`window._dialogResolve`): abrir un segundo diálogo mientras había uno abierto perdía el primero, y la función que lo esperaba (`await dialogo(...)`) quedaba colgada para siempre. Ahora el anterior se resuelve en `false` (cancelado). Prueba en `tests/nucleo.test.js` (bloque `dialogo`).

### ✨ Agregado (2026-10-13) — Guardia contra bloques de código duplicados (`tests/nucleo.test.js`, bloque `sin-bloques-duplicados`)

Falla si algún archivo de `js/` repite 10 líneas significativas seguidas. Habría detectado el bug de `eliminarMovimiento` (líneas 534 y 673 del archivo original). Hoy no hay ningún duplicado en todo el proyecto. Variable `MIS_FINANZAS_JS_DIR` para apuntarlo a otra carpeta.

### 🔍 Auditoría (2026-10-13) — "Eliminar el movimiento principal lo deshace todo": revisión por módulo

Se revisó, módulo por módulo, que borrar un registro devuelva lo mismo que su creación movió (cuentas, espejos, márgenes, estado de pago), con el mismo `ref` en el libro:
- **Cubierto por pruebas de ida y vuelta** (estado final igual al inicial salvo el libro, y el libro suma cero por cuenta): Mesada, Me deben, Yo debo, Plata comprometida (esta tras el arreglo de arriba), Préstamo con TC y **Gastos** (cuenta, y tarjeta; bloque `gastos-ida-y-vuelta` de `tests/cuentas.test.js`).
- **Revisado por lectura, sin hallazgos:** Spotify (`_borrarSpHistorial`: cobro con extra, abonos del pendiente, pago con tarjeta), Tarjetas (`eliminarCompraTC`, `eliminarPagoTC`) y Alcancía (`_alcanciaEjecutarEliminarDeposito`, todos los tipos de depósito). No se añadieron pruebas porque su registro depende de formularios muy grandes; quedan para la verificación en el navegador.

### 🔧 Cambio (2026-10-13) — `clase` pasa a ser la única fuente de verdad: se retiran las reglas históricas (`core-state.js`)

Desde el esquema 7 la app nace limpia y todo escritor pone `clase` al crear el movimiento (lo exige `tests/nucleo.test.js`, bloque `clase-cobertura`, y se auditó que ningún `push` por variable se la salte). La cascada de respaldo ya no servía a nadie y era frágil: clasificaba por etiquetas y por **texto** (`/^(Reposición[: ]|Para pagar TC \(/`, `desc` que empezara por "Margen", prefijos de `_origenSeccion`…).

Se eliminan `deducirClaseMovimiento`, `estamparClasesMovimientos`, `_reglaHistoricaEntradaEspejo` y `_reglaHistoricaGastoVarNoReal` (−84 líneas del núcleo). Los lectores quedan así:
- `claseEfectivaMovimiento(m)`: la `clase` guardada o `null`.
- `_esEntradaEspejoNoIngreso(m)`: solo cuenta como ingreso la entrada con `clase: 'ingreso'`; una sin clase no cuenta.
- `_esGastoVarNoReal(g)`: queda fuera del gasto real el que tenga `clase` distinta de `'gasto'`; uno sin clase cuenta como gasto (es lo que es por estar en esa lista).
- `movimientosSinClase()` + aviso en `save()` (una vez por sesión en consola; detalle en `window._movimientosSinClase`), igual que `Libro.verificar()` con los saldos. Sustituye al normalizador que estampaba por deducción.

Las pruebas que armaban datos a mano sin `clase` (`periodo`, `ingreso-real`, `clase-movimientos`) ahora la llevan; se retiraron las tres que probaban las funciones eliminadas y se añadió la de `movimientosSinClase`. Todas las pruebas que pasan por los módulos reales siguieron en verde sin tocarlas, que es la comprobación de que los escritores ponen `clase`.

### 🔧 Cambio (2026-10-13) — Retirado el último borrado de la lista vieja `cuenta.movimientos` (`movimientos.js`)

`eliminarMovimiento()`, en la rama de "retiro manual de una cuenta personalizada", todavía filtraba `cc.movimientos` para limpiar datos de una función ya retirada. Desde el esquema 7 esa lista no existe, así que el filtro era un no-op; se quitó junto con su comentario. Con esto, un barrido de todo `js/` ya no encuentra ninguna lectura ni escritura de `cuenta.movimientos` ni `cajita.historial` (las `.movimientos` que quedan son las de Encargos y Deudas, que son su historia propia). Las escrituras directas a `tc.deuda` se revisaron y se dejan: cada una tiene su registro (`tcMovimientos`, compras) y `tcRecalcular` reconstruye el mismo valor (lo cubren las pruebas de "Me deben" y "Yo debo" con tarjeta).

### 🔧 Cambio (2026-10-13) — Pruebas: un archivo por sección y arreglo de las que seguían el modelo anterior (`tests/`)

Las pruebas sueltas (27, con `yodebo`, `transferir`, `totalPrestadoPendiente` y `spotify-cajita`) pasan a 6 archivos, uno por sección de la app, con un bloque `describe` por cada archivo anterior (sin perder ninguna prueba: 239 antes y después): `nucleo.test.js` (patrimonio, salud financiera, Periodo, migraciones, ingreso real, clase), `libro.test.js` (libro, módulos, puerta única), `cuentas.test.js` (historial, Nu, CDT, chequeo, Restar dinero), `prestamos.test.js` (Me deben, deudas, margen), `mesada.test.js` (reglas y pantalla) y `sync.test.js` (Firestore).

Para limpiar el repo, desde su raíz (conserva solo los 6 archivos nuevos): `cd tests && ls *.test.js | grep -vE '^(nucleo|libro|cuentas|prestamos|mesada|sync)\.test\.js$' | xargs git rm && git rm libro-migracion.js historial-unificado.js`. `libro.test.js` no se borra: el archivo nuevo del mismo nombre lo reemplaza.

Tres grupos fallaban en el CI por seguir el modelo anterior, no por un error de la app:
- `ingreso-real` (4 pruebas): daban por bueno `cuenta.movimientos` y los "gemelos" con el mismo id. Ahora comprueban que el historial de una cuenta personalizada vive en `S.movimientos` con `fuente`, y que lo que quede en `cuenta.movimientos` no se lee.
- `mesada-reglas` (7 pruebas de "ida y vuelta"): comparaban todo `S` antes y después de registrar y borrar, pero el libro no borra (deja entrada + reversión). Ahora comparan `S` sin el libro y exigen que lo que el libro sumó neto a cero por cuenta.
- `firebase-sync`: fallaba porque `js/core/payload-codec.js` no estaba en el repo.

Las dos pruebas que seguían en rojo eran fallas reales y quedan arregladas: `puerta-unica` (15 llamadas sin `origen` en `plata_comprometida.js`, ver arriba) y `yodebo` (`registrarMovEspejo / borrarMovEspejo` leía las listas `cuenta.movimientos` y `cajita.historial`, que ya no existen). `yodebo` y `totalPrestadoPendiente` se unieron a `prestamos.test.js`, `transferir` y `spotify-cajita` a `cuentas.test.js` y las de plata comprometida a `libro.test.js`: 307 pruebas en 6 archivos.

### 📝 Documentación (2026-10-13) — Modelo de una sola lista en los `.md` de módulo

`cuentas.md` ya no describe `c.movimientos`, `cajita.historial`, los gemelos ni la lectura "de ambas convenciones": todo está en `S.movimientos` con `fuente`. `propuesta-movimientos-en-un-solo-lugar.md`, `plan-clasificacion-movimientos.md` y `plan-reestructuracion.md` llevan un aviso de estado arriba (Parte A hecha, B pendiente; migraciones retiradas; tope de 1 MiB resuelto con compresión). `actividad-reciente.md` se reescribió contra `actividad_reciente.js` (el feed ya lee solo `S.movimientos`). `plata-comprometida.md` documenta el libro (`_ogCp`), `item.sobrante`, `_cpItemId` y que eliminar un ingreso recibido lo devuelve todo.

### 🐛 Corregido (2026-10-13) — El margen de "Préstamo con TC" se quedaba como ingreso al borrar el préstamo (`prestado.js`)

Regla: borrar un movimiento principal revierte todo lo que generó (margen incluido), como si no hubiera pasado. El préstamo normal con "El valor era diferente" ya la cumplía, pero `confirmarPrestamoTC` llamaba `diffAplicar('prtc', …)` sin `linkId`: el ingreso del margen nacía sin `_encMovId` y `_revertirMovDeudorImpl` (que lo busca por ese campo) no lo encontraba. Borrar el préstamo dejaba el margen contando como ingreso del mes para siempre.

Ahora se pasa `movId` como `linkId`. Pruebas en `tests/prestamo-margen.test.js`: el margen se va con el préstamo, y una prueba estática exige `linkId` en toda llamada a `diffAplicar` (falla con el código anterior).

### 🐛 Corregido (2026-10-13) — Eliminar el saldo inicial de un encargo descontaba plata propia de la cuenta (`encargos.js`)

Causa raíz: el saldo inicial de un encargo (`enc.saldoInicial` / `enc.cuentaInicial`) es plata **ajena** que ya estaba guardada en esa cuenta; nunca formó parte de `c.saldo`, que guarda solo la porción propia (ver `calcC` en `nu-calc.js` y `_saldoEncargosEnCuenta`). Por eso `crearEncargo` no suma nada a la cuenta, y es correcto. El borrado añadido el 2026-08-30 llamaba `descontarFuente(enc.cuentaInicial, enc.saldoInicial)`: al quitar una anotación, restaba esa plata de la cuenta propia. Antes quedaba oculto porque el saldo se recortaba en 0 y el historial no lo contaba; con "el saldo nunca se recorta" la cuenta quedaba por debajo de lo real.

Escenario que lo dispara: crear un encargo con saldo inicial en Nequi y luego eliminar ese saldo inicial desde el historial del encargo; Nequi bajaba por ese monto (reproducido en un test: 1.000 → 700).

Ahora eliminarlo solo quita la anotación del encargo (el diálogo lo dice) y no mueve ninguna cuenta ni deja entrada en el libro. Prueba nueva en `tests/libro-modulos.test.js`, que falla sin el cambio.

### ✨ Agregado (2026-10-13) — Guardia estática de la puerta única de saldos (`tests/puerta-unica.test.js`)

Dos reglas del libro pasan de convención a prueba de CI: nadie escribe `.saldo` fuera de `sumarFuente`/`descontarFuente`/`ajustarSaldoCuenta`, y toda llamada a `sumarFuente`/`descontarFuente` lleva `origen` (las 5 de las reversiones de Préstamos que corren dentro de `_enReversion` están listadas por texto exacto). Detecta el caso de `diffAplicar` de arriba. Sin esto, `Libro.verificar` solo avisa una vez por sesión y una llamada sin origen ni siquiera descuadra.

### 🔧 Cambio (2026-10-13) — El estado viaja comprimido a Firestore y hay tope de tamaño (`firebase-sync.js`, `payload-codec.js`)

Todo el estado se guarda como un único campo `payload` de un único documento, que Firestore limita a 1 MiB. Cada movimiento de cuenta ocupa ≈ 150 B en el libro más ≈ 210 B de espejo en `S.movimientos`: con 5 movimientos al día solo esas dos listas suman ≈ 650 KB por año, y con el resto del estado el documento se llenaba en poco más de un año. Si se pasaba, `setDoc` fallaba y la app decía "Error al guardar — revisa conexión", mientras la nube se quedaba en el último guardado bueno.

Ahora:
- **Compresión.** `js/core/payload-codec.js` (módulo ES, solo vía `import`, como `wait-for-module.js`) guarda el JSON como gzip + base64 con prefijo `gz1:`. Con datos sintéticos de 2 años a 5 movimientos al día: 1.374 KB → 218 KB (6,3×), unos 9 años hasta el límite en lugar de poco más de 1. Un payload sin prefijo se sigue leyendo como JSON plano; sin `CompressionStream` se guarda en plano; un `gz1:` ilegible se trata como `parse-error` (nunca se guarda encima).
- **Lectura.** `_applyCloudData` y el cuerpo del listener no cambiaron: el listener recibe un snapshot ya descomprimido (`_decodificarSnap`), y los snapshots y el error del listener se procesan en una cola para respetar el orden de llegada aunque descomprimir sea asíncrono.
- **Escritura.** `_ejecutarGuardado` comprime antes de `setDoc`. Como comprimir es asíncrono, cada guardado toma un número al empezar y uno que quedó viejo no escribe (evita que un guardado lento pise a uno más nuevo). La comparación "¿cambió algo?" sigue usando el JSON plano.
- **Tope.** Se mide el tamaño ya comprimido: aviso a los 800 KB (una vez por sesión), y a 1.000.000 de bytes no escribe y lo dice (`window._payloadBytes` deja el valor).
- El cierre de sesión también guarda comprimido. `sw.js` pasa a `v30`.

Pruebas: `tests/firebase-sync.test.js` carga el `firebase-sync.js` real con un Firestore simulado (ida y vuelta, plano, ilegible, orden, guardados concurrentes, tope). Sin Firestore real no se probó la entrega en la nube ni el listener en un navegador.

### 🐛 Corregido (2026-10-13) — `diffAplicar` movía saldo sin `origen`, y esas entradas quedaban como `sin-origen` (`diferencial.js`)

Causa raíz: las tres llamadas de saldo de `diffAplicar` (el sobrante que entra a "mi cuenta" y las dos patas de un intercambio "lo pagué yo") no pasaban `origen`, y quien las invoca (`prestado.js`, y Encargos) no las envuelve en `Libro.conOrigen`. Al venir de un módulo que no las cubría, la regla 3 de `libro-de-movimientos.md` se rompía sin que ninguna prueba lo notara: el saldo seguía cuadrando con el libro, pero la entrada nacía como `{ modulo: 'sin-origen' }` y sin `ref`, así que no se podía enlazar con la reversión.

Escenario que lo dispara: un préstamo o un encargo con "El valor era diferente" donde el usuario se queda con un sobrante en una cuenta, o paga una parte de su bolsillo.

Ahora `diffAplicar` arma `{ origen: { modulo: 'diferencial', ref: linkId } }` (sin `ref` cuando el llamador no pasa `linkId`, como en Préstamo con TC) y lo pasa a las tres llamadas.

### 🔧 Cambio (2026-10-12) — App limpia: esquema 7, sin migraciones; el libro vive en el núcleo (`core-state.js`, `configuracion.js`, `index.html`, `sw.js`)

La app empieza de cero con el modelo ya estructurado, sin cargar con código que transforma datos de formas anteriores. Se retiraron las migraciones v3–v6 (clase explícita, corrección del regalo de la abuela, siembra del libro, historial unificado) y `unificarHistorialCuentas`; `MIGRACIONES` queda vacía y `SCHEMA_VERSION_ACTUAL` = `SCHEMA_BASE` = 7. El mecanismo (`aplicarMigraciones`) se conserva para cambios futuros.

Datos de un esquema anterior (< 7) no se tocan: `aplicarMigraciones` los marca (`S._esquemaAnterior`), `load()` avisa que esta versión empieza de cero (Configuración → Borrar todo) y el import de un backup de esa versión se rechaza con ese mismo motivo (`_validarEstructuraJSON`). Datos de una versión más nueva siguen sin tocarse.

El libro (`Libro`) pasó de `libro.js` al propio `core-state.js`: `sumarFuente`/`descontarFuente` lo necesitan en cualquier pantalla y los tests que cargaban solo `core-state.js` (modo permisivo) recibían un `Libro` vacío ("`Libro.registrar is not a function`", 82 tests). Ya no hay archivo aparte ni guardas `typeof Libro`.

### ✨ Agregado (2026-10-11) — Libro de movimientos (`S.libro`) y puerta única de saldos (`core-state.js`, `cuentas.js`, `alcancia.js`, todos los módulos que mueven plata)

Verificado con un backup real: el saldo de una cuenta era un número guardado aparte (`c.saldo += monto`) y el historial un registro paralelo; nada garantizaba que sumaran igual. Quedaron diferencias que ningún registro explicaba (intereses de Nu, el capital de un CDT de $2.000.000, el saldo previo de Spotify, ≈ $10.000 salidos de Sobra).

`S.libro` guarda una entrada por cada cambio de saldo (monto con signo, `tipo`, `origen: { modulo, ref }`) y la regla es **saldo == suma del libro**. `sumarFuente`, `descontarFuente` y la nueva `ajustarSaldoCuenta` son la única forma de cambiar un saldo; `save()` verifica la regla y avisa una vez por sesión si no se cumple. Cada módulo (Préstamos, Encargos, Spotify, Gastos, Mesada, Tarjetas, Cuentas, Alcancía, `movimientos.js`) pasa su `origen`; las reversiones quedan como `tipo: 'reversion'` con el mismo `ref`. Cuando el id del registro nacía después de mover el saldo, se reordenó (crear el registro y luego aplicar el saldo; en Tarjetas, crear el pago y luego descontar).

### 🔧 Cambio (2026-10-12) — El historial de TODAS las cuentas vive en una sola lista, `S.movimientos` (`cuenta-efectos.js`, `cuentas.js`, `movimientos.js`, `actividad_reciente.js`, `busqueda-global.js`, `core-state.js`)

Verificado: el historial de una cuenta se guardaba en tres formas — `S.movimientos` (Nequi/Efectivo), `cuenta.movimientos` (personalizadas: `ingreso`/`egreso` + `nota`) y `cajita.historial` — y se juntaba en cada lectura con reglas de deduplicación a mano (`entradasIngresoReal` combinaba tres fuentes; `getMovimientosCuenta` listaba cuatro diferencias a propósito). Cualquier lector que olvidara una lista daba un número mal sin avisar.

Ahora todo está en `S.movimientos` con `fuente` (`'nequi'`, `'efectivo'`, `'custom:ID'`, `'cajita:ID'`), tipo `entrada`/`salida` y texto en `desc`. `registrarMovEspejo`/`borrarMovEspejo` escriben y borran solo ahí. Se simplificaron `getMovimientosCuenta`, `entradasIngresoReal`, el borrado de `movimientos.js`, Actividad reciente (una apertura de cuenta personalizada ya no sale como "Retiro") y Búsqueda.

### ✨ Agregado (2026-10-11) — Historial de cuenta: las entradas del libro sin fila propia (intereses, ajustes, CDT) salen como filas con candado (`core-state.js`, `cuentas.js`)

Verificado: el saldo de una cuenta incluía plata que ninguna fila del historial explicaba (intereses de Nu materializados, el chequeo rápido, el capital de un CDT). `Libro.entradasVisibles()` las devuelve y `getMovimientosCuenta` las añade como filas automáticas (`_secundario`, sin botón de eliminar). El "Antes/Después" del detalle de un movimiento sale más exacto.

### 🐛 Corrección (2026-10-11) — `descontarFuente` recortaba el saldo en 0 y la diferencia se perdía sin avisar (`core-state.js`)

Verificado: restar más de lo que había dejaba la cuenta en 0 y descartaba el resto (en un backup real, $108,23 de una cajita; la opción `exacto` solo existía para saltarse el recorte en reversiones). Ahora el saldo refleja exactamente lo restado, aunque quede negativo, y se ve. La opción `exacto` se retiró.

### 🐛 Corrección (2026-10-11) — El chequeo rápido de Nu pisaba el saldo sin dejar rastro (`cuentas.js`)

Verificado: `guardarChequeoNu` asignaba `c.saldo` con la lectura real de Nu sin ningún movimiento asociado. La diferencia queda ahora como entrada `ajuste` del libro (y deshacer el chequeo deja otra), y los intereses materializados quedan como `rendimiento`, una entrada por cajita y mes.

### 🗑️ Eliminado (2026-10-12) — Listas propias de las cuentas, `libro.js`, las migraciones v3–v6 y las herramientas de transición

`cuenta.movimientos` y `cajita.historial` (y la rama que las leía), `libro.js`, `Libro.sembrar`/`patas`/`auditar`, `scripts/auditoria-libro.js`, y las pruebas `historial-cuenta.test.js` (dorada, contra la implementación anterior congelada) y `tests/support/historial-legacy.js`, que servían solo para validar la transición.

---
