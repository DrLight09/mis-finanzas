# Historial: Encargos

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Encargos

### 🐛 Corregido (2026-11-26) — Eliminar una «Compra con TC» de un encargo descontaba DOS veces la plata de la cuenta destino (`encargos.js`, `deleteMovimientoEncargo`)

**Causa raíz:** `confirmarCompraConTC` mete la plata del encargo en la cuenta destino UNA vez (`sumarFuente`), pero deja dos rastros de esa misma plata: el campo `_destino`/`_destinoMonto` del movimiento del encargo y una fila espejo en `S.movimientos` (`_esTcEncargo`, con la misma `fuente` y `monto`). Al eliminar, el bloque «Revertir compra TC» la revertía por `_destino` y luego el filtro de `S.movimientos` (que debía revertir solo el diferencial, «pasos 2 y 5») volvía a descontar la fila espejo del destino. Resultado: la cuenta destino quedaba con `monto` MENOS de lo que tenía antes de la compra (en la prueba, 430.000 en vez de 500.000 tras una compra de 70.000) y el libro con un neto distinto de cero en ese movimiento.
- **Arreglo:** el primer bloque marca `destinoRevertido` y el filtro salta la fila `_esTcEncargo` solo en ese caso; para registros viejos sin `_destino`, la fila espejo sigue siendo la que revierte.
- **Prueba:** nuevo escenario «Compra pagada con tarjeta» en `tests/ida-y-vuelta-encargos.test.js` (replica lo que escribe `confirmarCompraConTC`, sin diferencial): saldos, deuda de la tarjeta, historial de la tarjeta, libro neto en 0 y espejo coherente tras eliminar. Falla sin el arreglo.
- **No cubierto:** la compra con TC CON diferencial (`diffAplicar`) y el abono a deudor desde un encargo (no mueve cuentas ni libro: solo registros).

### 🐛 Corregido (2026-10-24) — Tarjetas de crédito como origen o destino en «Me lo regalaron», «Mover entre cuentas» y «Compra con TC» (`encargos.js`, `fuentes-filtro.js`)

*(Mejora 3.)* **Causa raíz:** los selectores de destino de esos sheets se armaban con `getFuentes()` (que incluye las TC), pensada para «de dónde SALE la plata». Pero ahí la plata ENTRA a una cuenta tuya, y una TC no recibe plata (solo se paga o se compra; ver `tarjetas-credito.md`). Al confirmar, `sumarFuente('tc:…')` actuaba sobre la tarjeta y, en «Compra con TC», además se subía su deuda. Ninguna validación al guardar lo impedía.
- **`fuentes-filtro.js`:** `esTC`, `puedeRecibir` y `receptoras` (todas las cuentas menos las TC, **sin filtro de saldo**: una cuenta vacía puede recibir) y `hayUtilizable`. Es la misma pieza que ya decide las cuentas de salida; el filtro por saldo de `PRESET.*` no se usa aquí a propósito.
- **«Me lo regalaron»:** el destino ofrece `receptoras(getFuentes())` y `confirmarTraspasoEncargo()` rechaza una TC.
- **«Mover entre cuentas»:** origen y destino sin TC (también en las filas del modo dividido) y `confirmarMoverEncCuentas()` (y su rama dividida) rechaza una TC como origen o destino.
- **Mismo defecto, encontrado al revisar los demás sheets:** el destino de «Compra con TC» tenía el problema idéntico y se corrigió igual (selector + validación). Su cuenta de origen sin distribución por cuenta pasó de `getFuentes()` a `getFuentesSinTC()` (la plata de un encargo no está en una TC).
- **Revisados y sin cambios:** los demás usos de `getFuentes()` son de salida (Pagar gasto fijo, Préstamos, Pagar Spotify), donde una TC con cupo sí es válida; los destinos de entrada restantes ya usaban `getFuentesSinTC()`. Las operaciones legítimas con tarjeta (pagar una TC, comprar con ella) no pasan por estos filtros.
- **Tuteo:** el texto de «Mover entre cuentas» decía «Movés plata del encargo…»; ahora «Mueves plata del encargo…».
- **Pruebas:** `tests/nucleo.test.js` → `requisitos-y-filtros-de-sheets` (con el `encargos.js` real: los selectores no ofrecen TC —incluido un dato raro con plata «guardada» en una TC—, la confirmación rechaza una TC como destino/origen sin tocar nada, y entre cuentas normales sigue funcionando). **Fallan sin el arreglo.**

### ✅ Corregido (2026-10-08) — Se podía borrar a mano la salida "Usado para mesada" de un encargo

`deleteMovEncargo` trataba esa salida como cualquier otra: devolvía la plata al encargo, pero el pago de mesada seguía contándola y su cuenta destino (más el espejo) quedaba inflada. Ahora la reconoce con `mesadaOrigenDeMovEncargo(movId)` (`calc-helpers.js`, carga de entrada porque Encargos y Mesada son grupos lazy distintos) y avisa que se borra desde Mesada. Detecta por lo guardado en `S.mesadas`, no por una marca en el movimiento, así que cubre también las salidas anteriores a este cambio. Ver `#mesada`.


### ✅ Corregido (2026-09-30) — "Yo puse la plata" contaba el margen dos veces cuando se usaba junto con el diferencial

**Síntoma:** encargo cobrado por $91.000 (54.000 Efectivo + 37.000 Nequi) que costó $89.405 pagados desde Nu. Con "Yo puse la plata" y el diferencial activos a la vez, de Nu salían $91.000 y además el margen de $1.595 entraba como ingreso aparte: el total quedaba $1.595 por encima de la realidad.

**Causa raíz:** `_validarMovEncMia`, `_movEncMiaPreview` y `_procesarMovEncMia` leían siempre el monto completo del campo (`movenc_monto`), sin saber que el diferencial ya trataba la diferencia como ganancia propia.

**Fix:** nueva `_miaMontoEfectivo()`: si el bloque del diferencial está abierto y `0 < real < monto`, "Yo puse la plata" usa el real. Sin diferencial, o con un real inválido, nada cambia. Se agregaron listeners de `movenc_monto` y `movenc_dif_real` para refrescar el preview. Además se guarda `_miaMonto` en el movimiento y la fila del historial muestra montos por cuenta ("Salió de Nu $89.405 · Entró a Efectivo $54.000 + Nequi $35.405"); antes solo decía los nombres.

**Sin probar en la app:** solo `node --check` y revisión del código. Tras registrar un caso real, confirmar que Nu baje exactamente el real y que el neto entre cuentas sea el margen.

### 🔧 Cambio (2026-09-30) — Una sola fila para la salida dividida (÷) de "Registrar salida"

**Pedido:** cuando el dinero del encargo estaba en dos cuentas, una sola salida generaba dos filas en el historial del encargo (una por cuenta).

**Qué cambió:** los datos **no** cambian (siguen siendo un registro por cuenta: el saldo del encargo se calcula por cuenta). Cambia la vista y el borrado: las porciones con el mismo `_splitGrupo` se pintan como un movimiento (monto total, cuentas con sus montos, saldo antes/después del grupo) y eliminarlo quita todas (`_encSplitKey`, `_encGrupoSplit`, `_encSplitCarrier`; `deleteMovEncargo` se redirige a la porción que lleva los efectos). Las salidas nuevas llevan `_splitGrupo`; las viejas se agrupan solo si el conjunto está completo y no son "Reubicación", abono de deudor ni compra con TC.

**Decisión de diseño que cambia:** antes las porciones eran independientes también al borrar. "Mover entre cuentas" (Reubicación) **no** cambió: sus salidas y su entrada siguen siendo filas independientes.

**Pendiente / no verificado:** la hoja de detalle muestra el total y el bloque de precio, pero no "Yo puse la plata" ni las cuentas del split (no emite `data-mov-otras`). Sin probar en la app; se probó la lógica de agrupado con datos de ejemplo.

### ✅ Corregido (2026-09-30) — El margen y los intercambios del diferencial se podían borrar sueltos desde el feed

**Síntoma:** la fila "Margen de encargo — …" en el detalle de Nequi tenía su botón de eliminar activo. Borrarla dejaba el encargo diciendo que se guardó un margen que ya no estaba en la cuenta.

**Causa raíz:** `diffAplicar()` escribía el margen, el ingreso sin cuenta y los intercambios de beneficiarios sin `_secundario` (los de "Yo puse la plata" sí lo llevaban), así que `eliminarMovimiento()` no los protegía. Comprobado en la consola con `S.movimientos`: los movimientos de margen salían con `_secundario: undefined`.

**Fix:** nueva opción `cfg.origenSeccion` en las instancias del diferencial; si se define, `diffAplicar()` marca esos movimientos con `_secundario: true` y `_origenSeccion`. Es **opt-in**: solo `movenc` y `ctc` la activan (`'Encargos'`), porque `deleteMovEncargo` ya los revierte por `_encMovId`. `prtc` (Préstamo con TC) no la activa; `usarParte` no pasa por `diffAplicar`.

**Alcance:** solo movimientos nuevos. Los ya guardados no llevan la marca; se pueden marcar a mano desde la consola, solo los que tienen dueño (`_encMovId` existente en algún encargo). Los huérfanos se dejan sin marcar. Sin probar en la app: confirmar que, al borrar el margen de un movimiento nuevo, salga el aviso "Movimiento vinculado…".

### 🔧 Cambio (2026-09-29) — "Dividir ÷" en "Yo puse la plata" y en el sobrante del margen (`movenc`, `ctc`, `usarParte`)

**Pedido:** al pagar servicios con plata propia de un encargo que estaba repartido en dos cuentas (Efectivo + Nequi), "Yo puse la plata" solo dejaba elegir **una** cuenta de salida y **una** de recuperación. Y si lo real había costado menos de lo dicho (ej. 98.000 en vez de 100.000), el sobrante solo podía entrar a **una** cuenta.

**Qué cambió:**
- **"Yo puse la plata":** cada lado ("De mi cuenta (sale)" y "Y recupero en (entra)") tiene su propio botón "Dividir ÷", con el motor común de split (`crearSplitWidget('miaSale')` / `('miaEntra')`; mínimo 2 filas, sin repetir cuenta). `_validarMovEncMia()` exige que cada lado sume el monto total (el de recupero puede quedar sin filas = "sin especificar") y que cada cuenta de salida tenga saldo. `_procesarMovEncMia()` genera un movimiento espejo por cuenta, todos con el mismo `_encMovId`, así que `deleteMovEncargo()` los revierte juntos sin cambios. Con más de una cuenta en algún lado el movimiento guarda además `_miaCuentas`; `_miaCuentaSale`/`_miaCuentaEntra` conservan la primera de cada lado.
- **Sobrante del margen:** "¿A cuál cuenta entra el sobrante?" (Registrar salida), "¿En qué cuenta te cayó ese margen?" (Ya la usé) y "¿A cuál cuenta entra el diferencial?" (Compra con TC) tienen "Dividir ÷". Es una opción del motor `js/core/diferencial.js`: `cfg.getMiCuentaSplit()` (devuelve `[{fuente,monto}]` si el split está activo, `null` si no), `cfg.onReset()` (que `diffReset()` llama para limpiar el split al reabrir el sheet) y la nueva `diffValidarMiCuenta(instId)`. `diffAplicar()` acredita una entrada por cuenta y guarda `diferencial.miCuentas` si fueron 2 o más. "Ya la usé" no pasa por `diffAplicar()`, así que `_confirmarUsarParte()` aplica la misma regla a mano (y `_usarParteMargenPendiente` pasó de objeto a array).
- **`js/core/split.js`:** nueva `splitReset(instId)` (devuelve un widget al modo simple, sin filas y con el botón "Dividir ÷" original). Sin otros cambios; `crearSplitWidget`/`splitToggle`/`splitGetData` intactos.
- **Historial:** el margen repartido se muestra como "Yo → Nequi $1.500 + Efectivo $500" (`diffRenderHistorial`) y "Yo (Nequi $1.500 + Efectivo $500)" en la parte usada; los movimientos de "Yo puse" con varias cuentas muestran todas.
- **`index.html`:** markup de los 5 widgets nuevos (2 de "Yo puse", 3 de sobrante), reusando las clases `btn-split` / `btn-add-cuenta`. Acciones nuevas registradas en `encargos.js`: `miaSaleSplitToggle`, `miaSaleAgregarRow`, `miaEntraSplitToggle`, `miaEntraAgregarRow`, `difMiSplitToggle`, `difMiAgregarRow`, `ctcMiSplitToggle`, `ctcMiAgregarRow`, `usarParteMiSplitToggle`, `usarParteMiAgregarRow`.

**Regla de validación del sobrante:** con el split activo, lo repartido debe sumar **exactamente** el sobrante y toda fila con monto necesita cuenta — se bloquea antes de tocar ningún saldo. Con el split apagado nada cambió.

**Verificación:** `node --check` OK en `encargos.js`, `diferencial.js` y `split.js`, y pruebas con jsdom y datos sintéticos: "Yo puse" (sale 40.000 Efectivo + 60.000 Nequi, recupera 70.000 Nequi + 30.000 Efectivo → saldos correctos, 4 espejos, rechazo cuando un lado suma 90.000), sobrante de 2.000 en 2 cuentas en las tres instancias (`movenc`, `usarParte`, `ctc`), rechazo de reparto que no cuadra, y `diffReset()` limpiando el split. **Sin verificar en navegador real.**

---

### ✅ Corregido (2026-09-29) — El resumen "Dijiste / Real / Margen" no se actualizaba al cambiar el monto

**Síntoma:** en "Registrar salida de plata" (y en "Compra con TC"), si se escribía el monto, luego "¿Cuánto era en realidad?" y después se corregía el monto, el resumen seguía mostrando el valor viejo (ej. "Dijiste: $200.000 Real: $198.000 Margen: +$2.000" con el monto ya en $198.000).

**Causa raíz:** `diffResumen()` solo se recalculaba desde el input del valor real y desde las partes; el input de monto (`movenc_monto`, `ctc_monto`) solo disparaba el preview del split / de la compra, y `getDijo()` se lee únicamente al calcular.

**Fix:** dos listeners nuevos en el wiring de `encargos.js`: `movenc_monto` → `_difResumen` y `ctc_monto` → `_ctcDifResumen`. "Ya la usé" no necesitaba fix: su "dijo" es el monto fijo de la parte.

---

### ✅ Corregido (2026-09-29) — Eliminar una salida con margen no devolvía el margen a tus cuentas

**Síntoma:** al borrar de un encargo una salida que tenía margen a favor tuyo (`diferencial` con sobrante acreditado), el movimiento del encargo se eliminaba pero la entrada de margen en tu cuenta (`_esDiferencialEncargo`) y su suma al saldo quedaban. Solo la compra con TC limpiaba esas entradas (por su propio bloque en `deleteMovEncargo()`).

**Fix:** `deleteMovEncargo()` ahora revierte, para movimientos con `diferencial` que no son `_esTcEncargo`, todas las entradas `_esDiferencialEncargo` vinculadas por `_encMovId` (`descontarFuente` + borrado), sean una o varias cuentas. Los intercambios "lo pagué yo" siguen manejándose en su bloque de siempre.

---

### ✅ Corregido (2026-09-29) — "Yo puse la plata" en una salida dividida solo recuperaba la primera porción

**Síntoma:** al registrar una salida dividida entre varias cuentas *del encargo* con "Yo puse la plata" activo, solo se descontaba de tu cuenta y se recuperaba el monto de la primera porción, no el total del gasto.

**Causa raíz:** `confirmarMovEncargo()` en modo split crea un movimiento por porción y llama a `_procesarMovEncMia(mov)` solo con el primero, y esa función usaba `movimiento.monto` (la porción) en vez del monto completo.

**Fix:** `_procesarMovEncMia()` lee el monto total del campo `movenc_monto` (con `movimiento.monto` de respaldo).

---

### ⚠️ Pendiente / limitación conocida (2026-09-29) — El margen de "Ya la usé" no se puede revertir

No existe ninguna acción para deshacer una parte marcada como usada, así que las entradas de margen que crea `_confirmarUsarParte()` (una por cuenta si se repartió con "Dividir ÷") no se revierten en ningún camino. Es previo al split y no se tocó; si se agrega un "deshacer usada" en el futuro, tiene que borrar esas entradas (marcadas `_esExtraIngreso`, sin `_encMovId`, así que habría que vincularlas primero) y restar cada una de su cuenta.

---

### ✅ Corregido (2026-09-28) — El margen de "Ya la usé" no contaba como ingreso

**Síntoma:** al usar una parte de un encargo por menos de lo que se había dicho (ej. dijiste 100.000, el servicio costó 90.000), los 10.000 que te quedas subían en tu cuenta pero no aparecían como ingreso en Análisis, Inicio ni Salud financiera.

**Causa raíz:** `_esEntradaEspejoNoIngreso()` excluía toda entrada cuyo `desc` empezara con `"Margen"`. Esa exclusión entró en el fix del 2026-08 (movimientos espejo / capital de Encargos) sin una razón propia para el margen: el margen no es capital devuelto, es plata que nunca estuvo en tus cuentas.

**Fix:** el ingreso de margen de `usarParte()` lleva ahora `_esExtraIngreso: true` (misma bandera que el extra de Prestado y "Me lo regalaron"). Solo cuenta la parte que te quedas (`yoMeQuedo`); lo asignado a beneficiarios nunca entra a tu cuenta ni a este movimiento.

**Resto de rutas:** el margen de la salida normal de encargo (`movenc`), de la compra con TC (`ctc`) y del "ingreso fantasma" de Préstamo con TC (`prtc`, `_prestadoDirectamente`) lo escribe `diffAplicar()` (`js/core/diferencial.js`) con la marca `_esDiferencialEncargo`. `_esEntradaEspejoNoIngreso()` ahora devuelve `false` para esa marca, así que las tres cuentan como ingreso sin tocar `diferencial.js`. En `prtc` esto restaura la intención original: el comentario de `diffAplicar()` y el filtro de Salud en `inicio.js` (`||m._prestadoDirectamente`) ya esperaban que ese ingreso contara, pero el prefijo `"Margen"` del `desc` lo descartaba. Como la marca ya existía en los movimientos guardados, el cambio también aplica a márgenes viejos del mes actual y el anterior (lo único que Análisis suma).

---

### ✅ Corregido (2026-09-28) — "Me lo regalaron" (traspaso de encargo a cuenta propia) no contaba como ingreso

**Síntoma:** al quedarte con parte de un encargo porque la persona te lo regaló (`confirmarTraspasoEncargo()`), la plata subía en tu cuenta pero Análisis, Inicio y Salud financiera no la veían como ingreso del mes.

**Causa raíz:** el movimiento `entrada` del traspaso lleva `_encMovId` (necesario para poder revertirlo desde `deleteMovEncargo()`), y `_esEntradaEspejoNoIngreso()` descarta todo lo que tenga `_encMovId`. La regla es correcta para depósitos, reubicaciones y "yo puse la plata" (movimientos espejo), pero aquí la plata sí es un regalo nuevo.

**Fix:** las dos escrituras del traspaso (`S.movimientos` para cuentas estándar, `c.movimientos` para cuentas personalizadas) llevan ahora `_esExtraIngreso: true`. Se conserva `_encMovId`, así que la reversión no cambia. Misma bandera que el extra/propina de Prestado (ver `changelog/prestado.md`).

**Sin tocar a propósito:** ~~el margen/diferencial de "Ya la usé" (`Margen encargo …`) sigue excluido de ingresos~~ — **obsoleto**: ese mismo día se corrigió (ver "El margen de 'Ya la usé' no contaba como ingreso", arriba); en `analisis.js` nunca hubo una exclusión propia, solo el comentario viejo de la línea ~78, ya actualizado (2026-09-29). Los traspasos hechos antes de este cambio no tienen la bandera y siguen sin contar. Análisis solo suma `S.movimientos`, así que un traspaso a cuenta personalizada se refleja en Salud/Inicio pero no en Análisis (limitación previa).

---

### ✅ Corregido — Migrado a `html\`\`` completo (~52 sitios de `.innerHTML`); dos hallazgos reales de paso

*(2026-08-28, primero de los tres módulos que quedaban)*

Convertidos todos los puntos de renderizado de `encargos.js`: `renderEncargosEnCuenta()` (rama Nu y rama genérica), `renderEncargosList()`, `abrirEncargoDetalle()` (desglose por cuenta e historial de movimientos completo), `renderEncargoParts()`, los previews de "yo puse la plata"/"ya la usé", y los ~15 selects de cuenta/TC/encargo-destino repartidos en traspaso, "mover entre cuentas del mismo encargo", transferencia entre encargos y compra con TC. Los fragmentos armados con `.map()` se interpolan directo (sin `.join()` explícito) en el nivel exterior, mismo patrón ya usado en Mesada/Gastos/Personas; `Events.attr(...)` y las funciones núcleo que ya devuelven HTML de confianza (`_difRenderHistorial()`, `_encAttrs()`) se envuelven en `raw()`. Los `toast()`/`dialogo()` y los campos `desc:`/`nota:` que se guardan como dato (no se pintan al momento) se dejaron con `escHtml()` a mano, mismo criterio de siempre.

**Sombra de variable `let html = ''`** tapando la función global `html\`\`` en dos funciones (`abrirEncargoDetalle()` → historial, y `renderEncargoParts()`) — mismo bug ya encontrado en Mesada/Gastos/Plata Comprometida. Renombrada a `contenido` en ambas.

**Hallazgo real de escapado:** en el selector de "mover entre cuentas del mismo encargo" (`origenOptsHtml`, función `_actualizarSelectsMoverEnc` o equivalente), `f.val` y `f.label` se interpolaban **sin ningún escapado**, ni siquiera `escHtml()` manual — a diferencia de los otros ~14 selects del archivo, que sí lo tenían. Cerrado de raíz al migrar a `html\`\``.

**Doble-escapado en `desc:`/`nota:` horneados — resuelto (2026-08-28, sesión posterior):** varios `desc:`/`nota:` de movimientos (ej. "Yo puse la plata: ...", "Parte usada: ...", "Margen encargo ... — ...", el ingreso de margen, la deuda automática por faltante, la compra/cargo con TC de encargo) se armaban con `escHtml()` ya aplicado en el momento de *guardar* el dato, no de pintarlo. Como el historial interpola `m.desc`/`m.nota` sin re-escaparlo a mano (lo hace `html\`\`` automáticamente), un nombre de cuenta/encargo con `&` o comillas quedaba visualmente doble-escapado (`&amp;amp;` en vez de `&amp;`). El mismo patrón vivía también en `prestado.js` (13 sitios) por el cruce de préstamos, así que se corrigieron ambos archivos juntos.

Fix: se quitó el `escHtml()` horneado en los 8 sitios de `encargos.js` (`_procesarIntercambioEncargo()` — salida/entrada de "Yo puse la plata"; `usarParte()` — dos sitios de "Parte usada" y el ingreso de margen; la deuda automática por faltante en préstamo; la compra/cargo con TC de encargo — dos sitios), dejando esos campos crudos: la capa de render (`html\`\``) ya los escapa una sola vez. Los `desc:`/`nota:` que arman `S.tcMovimientos`/`d.movimientos`/`S.movimientos` en `prestado.js` (13 sitios: `confirmarMovimiento()`, `confirmarMovMiDeuda()`, `confirmarPrestamoTC()`, el "extra" repartido a gasto/ingreso) se corrigieron igual. `cuentas.js` no necesitó cambios: ya asumía texto crudo en su capa de render.

Validado con `node --check` en los tres archivos y una simulación con `escHtml`/`html\`\`` reales confirmando que el output pasó de doble-escapado (`&amp;amp;`) a escapado simple (`&amp;`), preservando la neutralización de `<script>`. **Sin simulación jsdom ni prueba en navegador real** en esta sesión.

### ✅ Corregido — 4 selects de cuenta en `encargos.js` interpolaban `f.label`/`f.val`/`f.cuenta` sin escapar

*(2026-08-15, encontrado al investigar un warning de consola reportado por el usuario: "A `<select>` tag was parsed within another `<select>` tag and was ignored", disparado desde `encargos.js:2407` al abrir "Nuevo encargo")*

`buildFuentesOptsHtml()` (`core-state.js`) ya se había corregido para escapar `f.label`/`val` (ver hallazgo de esa fecha, más arriba), pero `encargos.js` tiene **4 lugares separados** que arman el mismo tipo de `<option>` HTML a mano — para los selects `movenc_cuenta` (entrada/salida de un movimiento) y `enc_cuenta_ini` (saldo inicial al crear un encargo) — sin pasar por esa función ni por `escHtml()` en ningún momento. Nombres de cuenta personalizada son texto libre del usuario; con `<`, `>`, `&` sin escapar dentro del `innerHTML` de un `<select>`, el parser del navegador puede comportarse de forma impredecible — consistente con el warning reportado (se sospecha que la cuenta de prueba `Ahorro <test> & "comillas"`, creada para probar el fix anterior, disparó esto, aunque no se pudo confirmar el mecanismo exacto sin poder reproducirlo en un navegador real).

Fix: los 4 lugares (`encargos.js` líneas ~1171, ~1184, ~1187, ~2402/2410) ahora envuelven `f.val`/`f.label`/`f.cuenta` en `escHtml()`, mismo criterio que `buildFuentesOptsHtml()`. Verificado con `node --check` y `diff` línea por línea contra el original para confirmar que no se perdió ningún otro cambio en el camino (se pisaron accidentalmente 2 líneas ajenas al hacer el fix por partes — corregido antes de guardar la versión final). **Falta prueba visual en navegador real**, en particular volver a abrir "Nuevo encargo" con la cuenta `Ahorro <test> & "comillas"` de prueba y confirmar que el warning de consola ya no aparece.

### ✅ Corregido — El avatar de un encargo recién creado no mostraba el color de la persona (dos causas distintas)

*(2026-08-15, reportado por el usuario: "cuando creo un nuevo encargo la persona se crea así como antes... como si no tuviera id"; después confirmó que el primer fix no alcanzaba)*

**Causa 1 (fix inicial, insuficiente por sí solo):** `renderEncargosList()` tenía el color del avatar **hardcodeado** en azul (`rgba(96,176,240,.15)` = exactamente `#60b0f0`), sin leer `enc.personaId`. La vista de detalle sí resolvía la persona real y aplicaba su color — por eso el color correcto solo se veía al entrar al encargo. Fix: se busca la persona con `(S.personas || []).find(x => x.id === enc.personaId)` (mismo patrón que ya usa este archivo en la línea ~67) y se arma el color del avatar desde `persona.color`, con `#60b0f0` como fallback si no hay persona o color.

**Causa 2 (la real, encontrada al revisar por qué el fix de arriba no se notaba):** el sheet "Nuevo encargo" no tiene campo de persona en `index.html` — la selección de persona la inyecta `_inyectarPersonaSheets()` (definida en `personas.js`) y se maneja aparte, en un hook sobre `crearEncargo` (línea ~2937): captura `pId` antes de crear el encargo, pero recién **después** de que `_origCrearEncargo()` ya corrió (y ya había refrescado la lista, en un momento en que el encargo todavía no tenía `personaId`) le asigna `last.personaId = pId` — y ahí se cortaba, sin volver a pintar la lista. Ni el fallback de la Causa 1 ni el wrapper que ya existía más abajo (línea ~2960, que sí aplica `getPersona(enc.personaId).color` correctamente pero solo si `personaId` ya está seteado) llegaban a correr con el dato completo a tiempo. El color correcto recién aparecía la próxima vez que algo más disparara un `renderEncargosList()` (ej. salir y volver a la pantalla) — nunca de entrada, que es justo lo que el usuario reportó.

Fix: se agregó `renderEncargosList()` justo después de `last.personaId = pId; ...; save();` en ese hook, para que la lista se repinte con el dato completo apenas se vincula la persona.

Verificado con `node --check` en ambos cambios. **Falta prueba visual en navegador real** de la secuencia completa: crear un encargo nuevo, elegir una persona con color propio, y confirmar que el avatar en la lista se ve bien de entrada, sin tener que salir y volver a la pantalla.

**Nota aparte, sin investigar:** al reportar esto, el usuario vio en consola un warning de `<select>` anidado (`<select id="enc_cuenta_ini">`) al abrir el sheet de agregar persona, disparado desde `_inyectarPersonaSheets()` en `personas.js` — no se pudo investigar en esta sesión por no tener ese archivo. Hipótesis sin confirmar: esa función se llama cada vez que se abre el sheet "Nuevo encargo" (y lo mismo en `prestado.js`/`spotify.js`), y no hay ningún guard visible en los archivos disponibles que evite reinyectar el HTML si el sheet ya existe en el DOM.

### ✅ Corregido — "Prestar lo que falta" registraba el préstamo aunque la cuenta propia elegida no tuviera esa plata

*(2026-08-13)*

Al agregar la opción "Prestar lo que falta" (salida de un encargo por más de lo disponible: se retira lo que hay y el resto queda como préstamo aparte en "Me deben"), el paso 2 llamaba `descontarFuente(fuentePrestamo, faltante)` directamente, sin validar antes si esa cuenta realmente tenía el monto. `descontarFuente()` no hace esa validación por sí sola — solo resta —, así que el préstamo se registraba igual aunque la cuenta quedara en negativo. Escenario concreto: encargo con $80.000 disponibles, salida pedida de $100.000 (faltan $20.000), se elige Nequi para prestar esos $20.000 aunque Nequi solo tuviera $5.000 reales — el préstamo se guardaba de todas formas.

Fix: se agregó la misma validación que ya usa "Yo puse la plata" (`_validarMovEncMia`) — `getSaldoFuente(fuentePrestamo)` contra el monto a prestar, antes de escribir cualquier dato. Si no alcanza, se avisa con el saldo real disponible y no se registra nada, ni la salida del encargo ni el préstamo (todo o nada, ver `encargos.md` §3). Se agregó además un hint en vivo bajo el selector de cuenta (`_movEncFaltanteCuentaHint`) que avisa antes de intentar confirmar.

### ✅ Corregido — Migrado a `escHtml()` a mano ~18 sitios de `.innerHTML`/`fuenteLabel()`/`iniciales()` sin escapar

*(2026-07-18, durante la migración a `data-action`, antes de que existiera `html\`\`` — creado recién el 2026-08-17)*

Al migrar Encargos como tercer módulo completo (junto con `encargos-personas.js`, separado en dos archivos por la misma dependencia de orden de carga que Spotify) se repitió, por tercera vez, el mismo hallazgo recurrente de otros módulos: texto libre interpolado sin `escHtml()` cuando llega envuelto en una función auxiliar (`fuenteLabel()`, `iniciales()`) en vez de aparecer como nombre de campo directo. Encargos tuvo el conteo más alto de todos los módulos migrados hasta ese momento: **~18 sitios**, repartidos en el desglose por cuenta, el historial de movimientos, los previews de "yo puse la plata"/"ya la usé", el traspaso, "mover cuentas" y la compra con TC — más un sitio de `iniciales()` sin escapar en `renderEncargosList()`. Todos corregidos envolviendo en `escHtml()` en el punto de interpolación. `node --check` sin errores. **Sin verificar en navegador real.** Encargos sigue sin migrar a `html\`\`` (ver `auditoria-tecnica.md`, punto 2) — queda como uno de los tres módulos pendientes de esa migración.

---

## Encargos

### ✅ Corregido — "Registrar salida" dejaba sacar plata ya comprometida en una parte

Las partes comprometidas (`enc.partes`, "¿Para qué es esta plata?") ya calculaban y mostraban un "Libre" en la sección de partes, pero ese número era solo informativo: el sheet de "Registrar salida" (`abrirMovEncargo`/`confirmarMovEncargo`) seguía validando contra `encargoSaldo(enc)` (el saldo total), sin descontar lo comprometido. Resultado: si tenías, por ejemplo, $200.000 comprometidos para el arriendo, igual podías sacar esos $200.000 por "Registrar salida" como si estuvieran libres — la parte comprometida se quedaba sin respaldo real.

Fix inicial: nuevos helpers `encargoComprometido(enc)` (suma de partes sin usar) y `encargoLibre(enc)` (saldo menos eso, nunca negativo). `abrirMovEncargo` bloquea o limita la salida al disponible real, mostrando en el sheet cuánto hay comprometido cuando aplica; `confirmarMovEncargo` valida contra `encargoLibre()` en vez de `encargoSaldo()` tanto en modo simple como en split.

Extensión — mismo criterio en **todos** los lugares donde se muestra o se saca plata de un encargo, no solo en "Registrar salida":
- **Lista de encargos** y **hero del detalle**: ahora muestran `encargoLibre()` como el número principal (antes mostraban el saldo total, que incluía plata ya comprometida). Cuando hay algo comprometido, aparece un subtexto tipo "de $500.000, $200.000 comprometido".
- **Traspaso de sobrante** (`abrirTraspasoEncargo`/`confirmarTraspasoEncargo`): valida contra `encargoLibre()` — un "sobrante" por definición no puede incluir plata que ya tiene destino asignado.
- **Compra con TC del encargo** (`abrirCompraConTC`/`confirmarCompraConTC`): mismo cambio — no se puede pagar una compra con plata ya comprometida para otra cosa.
- **Mover entre cuentas** se dejó **sin cambios** a propósito: no saca plata del encargo, solo la reubica físicamente entre cuentas propias, así que lo comprometido no debería bloquearlo.
- **`usarParte`/`_confirmarUsarParte`** (marcar una parte como "ya la usé") también se dejó sin cambios: es la vía diseñada para gastar justamente esa plata comprometida, así que sigue validando contra el saldo físico real en la cuenta elegida, no contra `encargoLibre()` — no tendría sentido bloquear la única forma de liberar el compromiso.

Pendiente fuera de este archivo: el cruce con Préstamos ("pagar una deuda con plata de un encargo") vive en el módulo de deudores, no en `encargos.js`, y no se tocó — si ese flujo también debe respetar lo comprometido, hay que revisarlo por separado ahí.

### ✅ Corregido — El cruce con Préstamos ("pagar una deuda con plata de un encargo") también dejaba usar plata comprometida

Mismo problema que el de arriba, pero en `prestado.js`: el toggle "¿Viene de un encargo?" en el sheet de abono de una deuda validaba y mostraba el saldo total del encargo (`encargoSaldo`), sin descontar las partes comprometidas. Un encargo con plata ya apartada para otra cosa igual aparecía como "disponible" completo en el selector, dejaba pagar la deuda con esa plata, y hasta se ofrecía como opción cuando su único saldo era 100% comprometido.

Fix: mismo criterio que en `encargos.js` — todo lo que antes usaba `encargoSaldo(enc)` para decidir "cuánto hay disponible" ahora usa `encargoLibre(enc)` (definida en `encargos.js`, ya disponible globalmente): el filtro de qué encargos ofrecer como origen del abono, los montos que se muestran junto a cada encargo en el selector, la validación del monto (abono solo, y abono + extra), y el preview cuando no se elige una cuenta específica del encargo. Las validaciones por cuenta física (`_getEncargoSaldoEnCuenta`/`_getEncargoSaldoSinCuenta`) se dejaron igual, por la misma razón que en Encargos: lo comprometido no está ligado a una cuenta específica, así que no tiene sentido restringir ahí.

### 🔧 Ajustado (2026-09-01) — `opsPosteriores` de la protección por antigüedad ahora cuenta contra el encargo completo, no solo contra `mov.cuenta`

Detectado al revisar a fondo la protección por antigüedad de movimientos (ver `changelog/mesada.md`, "Protección por antigüedad se activaba en pagos 'Sin especificar'..."): `deleteMovEncargo()` calculaba `opsPosteriores` filtrando solo movimientos del encargo con `m.cuenta === mov.cuenta`. Esto seguía el criterio literal del doc (§4: "cuántos movimientos más ha tenido esa misma cuenta destino"), pero subestimaba la mezcla real en un encargo con plata repartida en varias cuentas (o movimientos sin cuenta asignada): un movimiento viejo podía tener muy pocas "operaciones posteriores en su misma cuenta" contadas, aunque el encargo en conjunto ya tuviera muchas más operaciones nuevas encima — dejándolo pasar como "reciente" por el criterio de operaciones cuando, en espíritu, ya estaba bastante mezclado con el resto del encargo.

Ajustado a propósito (decisión de diseño, no bug): ahora cuenta cualquier movimiento posterior del mismo encargo, sin filtrar por `mov.cuenta` — más conservador, protege más. El criterio de fecha (90 días/1 año) no cambió. Actualizado también `proteccion-antiguedad-movimientos.md` §4 con la excepción explícita para Encargos.

No afecta el texto del diálogo de aviso (`deleteMovEncargo`) — ya estaba redactado de forma genérica ("mezclado con operaciones más recientes de este encargo"), sin asumir una cuenta específica.

Validado con `node --check`.

### 🔧 Ajustado (2026-09-02) — Copy del sheet "Pagarle a otro encargo" generalizado (título, descripción, labels, placeholder, desc por defecto)

El sheet de transferencia entre encargos (`transferencia-encargo` / `confirmarTransferenciaEncargo`) daba por sentado que el movimiento siempre era el pago de una deuda ("Pagarle a otro encargo", "¿A cuál encargo le pagaste?", "¿Cuánto le pagaste?"), cuando en realidad puede ser eso, un regalo, o la devolución de un favor. Primera corrección de redacción también asumía por error que la deuda/regalo/favor era entre Sebas y las personas involucradas ("porque le debías... porque se lo regalaste... te hizo un favor"), cuando en realidad Sebas es solo el intermediario que mueve plata ajena entre los dos encargos — la relación (deuda/regalo/favor) es entre los dueños de esos encargos, no con él.

Cambios de texto en `index.html` (sin tocar lógica): título → "Pasarle plata a otro encargo"; descripción reescrita en tercera persona ("puede ser porque uno le debía al otro, porque quiso regalarle esta plata, o porque le hizo un favor y esto es la devuelta — vos solo sos el intermediario"); label del select destino → "¿A cuál encargo se la diste?"; label del monto → "¿Cuánto le diste?"; placeholder de descripción → "Ej: le debía, fue un regalo, fue por un favor...". En `encargos.js`, el valor por defecto de la descripción (`transfenc_desc`) pasó de "Pago a nombre de X" a "Plata para X", igual de neutral respecto al motivo.

No se tocó la lógica de `confirmarTransferenciaEncargo()` ni los campos guardados (`desc`, `nota: 'Transferencia a otro encargo'`/`'Transferencia de otro encargo'`), que ya eran genéricos. Validado con `node --check`. **Sin verificar en navegador real.**
