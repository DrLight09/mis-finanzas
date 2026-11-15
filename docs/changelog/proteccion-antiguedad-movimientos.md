# Historial: Protección por antigüedad de movimientos

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Protección por antigüedad de movimientos

### 🔧 Cambio (2026-09-22) — De propuesta a estado implementado

`proteccion-antiguedad-movimientos.md` seguía redactado en tono de propuesta ("Propuesta nueva", "Recomendación de implementación") aunque `nivelAntiguedadMovimiento(fecha, opsPosteriores, modulo)` ya está implementado y en uso en los ocho módulos que la tabla de cobertura (§5) lista como protegidos (confirmado con grep en `alcancia.js`, `encargos.js`, `gastos.js`, `mesada.js`, `plata_comprometida.js`, `prestado.js`, `spotify.js`, `tarjetas_credito.js`). Se reescribió la introducción y §6 en tiempo presente, describiendo la estructura de configuración real en vez de proponerla.

### 🔧 Cambio (2026-09-22) — Corrección de una nota de código muerto que ya no aplica

`prestado.md` §6.1 describía `addDeudor()`, `selColor` e `initColorPicker` como código muerto que seguía en el archivo sin ejecutarse nunca. Ninguna de las tres existe ya en `prestado.js` (cero coincidencias) — no es que no corran, es que ya no están. Se corrigió la nota: el sheet `sheet-nueva-persona` sigue interceptado por el override de `openSheet`, pero ya no hay ninguna función propia que describir como muerta.

### ✨ Agregado (2026-09-20) — El cupo de una TC es obligatorio; "Pagar TC" solo ofrece cuentas con saldo (> $0, efectivo ≥ $1.000)

- **Cupo obligatorio:** `guardarTC()` rechaza crear o editar una tarjeta sin cupo (o con cupo ≤ 0) y enfoca el campo; el label del formulario lleva el asterisco rojo. Motivo: los selectores de "de dónde sale la plata" (Gastos, Pagar gasto fijo, Pagar Spotify, Préstamo con TC) solo ofrecen una TC si tiene cupo disponible (`FuentesFiltro.tcConCupo`), y sin cupo configurado no hay forma de saber cuánto se le puede cargar. Hasta hoy una TC sin cupo se trataba como "sin límite" (`getSaldoFuente` devuelve 999999999 — **no se tocó**, es núcleo, y otros módulos que no usan `FuentesFiltro` siguen leyéndolo así).
- **Tarjetas sin cupo (hoy no existe ninguna):** si alguna apareciera, dejaría de mostrarse en esos selectores (cupo disponible = 0) hasta que se edite y se le ponga cupo; el formulario de edición lo exige aunque solo se quiera, por ejemplo, cambiar el estado.
- **"Pagar TC" (`ptc_fuente`):** solo ofrece cuentas con saldo > $0 — se puede abonar cualquier monto —, salvo **efectivo, que exige ≥ $1.000** (`FuentesFiltro.PRESET.PAGO_TC`). Sin cuentas utilizables muestra "No tenés cuentas con saldo disponible".


### ✅ Corregido — `calcDeudaAjenaDeTarjeta` no contaba las compras marcadas `_esFavor`

*(2026-08-07)*

`calcDeudaAjenaDeTarjeta(tc)` solo sumaba compras con `c._desdeCP`, ignorando `c._esFavor` — pese a que la capa visual (`tarjetas_credito.js`, listado de compras) siempre trató ambos flags como equivalentes (`const esFavor = c._esFavor || c._desdeCP`), pintando el mismo badge azul "favor" y la misma etiqueta "Favor cubierto" para cualquiera de los dos. Resultado: una compra marcada `_esFavor` (sin `_desdeCP`) se le mostraba al usuario como plata ajena, pero `calcDeudaTcPropiaDeTarjeta` la contaba como 100% propia — inflando la deuda propia real y, con ella, el health score.

Fix: `calcDeudaAjenaDeTarjeta` ahora suma compras con `c._desdeCP || c._esFavor`, igualando el cálculo a lo que la UI ya venía mostrando. No se tocó el orden de cancelación de pagos (saldo inicial → ajena → propia) ni ninguna otra función — `calcDeudaTcPropiaDeTarjeta` y `calcDeudaTcPropia` heredan el fix automáticamente por depender de esta función.

### 🗑️ Eliminado por diseño — Seguimiento de cuotas en compras

*(2026-08-07)*

El módulo permitía marcar una compra como "en cuotas" (`esCuotas`, `numCuotas`, `valorCuota`) y llevar un contador manual `cuotasPagadas` con botones +1/-1, mostrado como badge en el detalle de la compra ("Cuota 3/12 · $45.000"). Era puramente informativo desde el diseño original: nunca difería el cobro (la compra completa siempre entraba a `tc.deuda` desde el día del registro, vía `tcRecalcular`) ni se conectaba a Análisis financiero, Salud financiera ni Proyección — ningún otro módulo leía esos campos.

Se decidió quitarlo por completo: el usuario ya tiene la app del banco para ver en qué cuota va una compra real, y el propósito de esta app es responder "¿voy bien o no?" con la plata — un contador que no mueve deuda ni plata no aporta a esa pregunta, solo agrega fricción en el formulario de registrar compra.

Fix: se quitó el toggle "¿Es una compra en cuotas?" y sus campos asociados del sheet de registrar compra (`index.html`), y en `tarjetas_credito.js` se eliminaron `tcCalcularValorCuota`/`tcValorUltimaCuota`, `tcIncrementarCuotaPagada` (y su registro en `Events`), el badge y los botones +1/-1 del listado de compras, y la escritura de `esCuotas`/`numCuotas`/`valorCuota`/`cuotasPagadas` en `tcCrearCompra` y en la normalización (`tcNormalizarTarjetas`). Compras ya guardadas con esos campos no se migran ni se tocan — simplemente dejan de leerse, sin afectar `tc.deuda` (que nunca dependió de ellos).

### ✅ Corregido — Widget de cobertura mostraba "vincula una cajita" con una cajita ya vinculada, y la deuda propia podía llegar a $0 escondiendo gastos reales

*(2026-07-12)*

Una tarjeta con cajita vinculada seguía mostrando el mensaje genérico de "vincula una cajita a tus tarjetas", y la "deuda propia" calculada daba $0 aunque existiera una compra propia real de $59.435. Eran dos problemas separados que se retroalimentaban:

1. **Problema semántico:** los widgets de cobertura (Inicio y detalle de tarjeta) usaban la deuda "propia" de la tarjeta (total menos lo que viene de encargos/préstamos/plata comprometida ajena) para responder "¿me alcanza la plata en la cajita para pagarle al banco?". Pero el banco cobra el 100% del corte sin importar de quién es moralmente la plata — la pregunta correcta necesitaba la deuda **total**, no la propia.
2. **Bug técnico:** `calcDeudaAjenaDeTarjeta(tc)` sumaba todo lo que alguna vez se cargó como ajeno a la tarjeta (bruto histórico) pero nunca restaba los pagos hechos, mientras que `tc.deuda` sí es un saldo neto. Si se pagaba la tarjeta con la misma plata que devolvía un encargo/préstamo, el "ajena" bruto podía terminar superando la deuda actual, y `Math.max(0, deuda − ajena)` se iba a 0 — escondiendo gastos propios reales.

Fix: los widgets de cobertura pasaron a usar `tc.deuda` (total) en vez de la deuda propia. `calcDeudaAjenaDeTarjeta` pasó de bruto histórico a saldo neto (bruto − pagos, con piso en 0), bajo la regla de negocio "un pago cancela primero lo ajeno, lo que sobra cancela lo propio". `calcDeudaTcPropia()` (usada en salud financiera) tenía su propio cálculo bruto duplicado con el mismo bug a nivel agregado — se unificó para que sume la función ya corregida por tarjeta, en vez de tener dos fuentes de verdad. Ver `tarjetas-credito.md` para el detalle de qué función mide qué.

### ✅ Corregido — Eliminar un pago de TC desde el feed de actividad no restauraba la deuda

`eliminarMovimiento` (usado desde el feed de actividad general) devolvía la plata a la cuenta correcta al borrar un pago de tarjeta de crédito, pero nunca restauraba la deuda de la tarjeta — quedaba más baja de lo que debía después de "deshacer" el pago.

### ✅ Corregido — 5 sitios de `.innerHTML`/`toast()` sin escapar

*(2026-07-20, durante la migración a `data-action`, antes de `html\`\``)*

Al migrar Tarjetas de Crédito a `js/modules/tarjetas_credito.js` se repitió, cuarta vez seguida, el mismo hallazgo de otros módulos: `tc.nombre` y `fuenteLabel()` interpolados directo en `toast()` (cupo insuficiente, saldo insuficiente), `fuenteLabel()` sin escapar en el badge de origen de un pago, una variable `descPago` (arma texto con `tc.nombre` + nota libre) insertada sin escapar, y el `<option>` del selector de cuenta de pago con `f.label` sin escapar. Los 5 corregidos con `escHtml()`. El `<script>` original no se pudo extraer como bloque contiguo (compartía tag con `navTo()` y con "Feed de actividad financiera", sin relación con TC) — solo se extrajo lo que era realmente de TC.

**Hallazgo nuevo, sin resolver en esa sesión:** el mismo patrón (`f.label` sin escapar) existía también en `buildFuentesOptsHtml()` — núcleo compartido por toda la app, no solo TC. No se tocó por ser núcleo compartido fuera de alcance; corregido después, el 2026-08-14 (ver `changelog/infraestructura-seguridad.md`).

### ✅ Corregido — Migrado a `html\`\``: 6 sitios, más un hallazgo real (`tc.banco` nunca había pasado por `escHtml()`)

*(sesión posterior — junto con Plata Comprometida, dos primeros de los cinco módulos que quedaban)*

Convertidos `_tcPoblarSelectCajita()`, `renderTCScreen()` (lista de tarjetas), `renderTCDashboard()` (resumen en Inicio, incluido el widget de cobertura por cajita), `abrirPagarTC()` (opciones rápidas + selector de cuenta) y `abrirDetalleTCSheet()` (la función más grande del módulo: saldo inicial, compras, pagos, movimientos de encargo/préstamo, con los atributos `data-mov-*` que arma `_tcAttrs()` reconstruidos vía `html\`\`` e interpolados con `raw()`). Los dos `toast()` con `escHtml()` manual (cupo/saldo insuficiente) se dejaron igual, mismo criterio de siempre.

**Hallazgo real, no reportado antes:** `tc.banco` (nombre del banco, texto libre del input) nunca había pasado por `escHtml()` en el subtítulo de `renderTCScreen()` — quedaba sin escapar pese a que la cabecera del archivo documenta una "pasada de fixes de `.innerHTML`" previa. Corregido de paso.

**Sombra de variable**, misma recurrencia que Mesada/Gastos: `let html='';` en `abrirDetalleTCSheet()` tapaba la función global `html\`\``. Renombrada a `contenido`.

Validado con `node --check` y una simulación jsdom (con la implementación real de `js/core/html-tag.js`) inyectando un payload malicioso (`<img src=x onerror=alert(1)>"'&<script>alert(2)</script>`) en nombre de tarjeta/deudor/persona, banco y notas. Verificado sobre el DOM ya parseado (cero `<script>`/`img[onerror]` ejecutables creados, texto libre visible como texto plano) — no solo comparación de substrings contra el HTML serializado, que da un falso positivo dentro de valores de atributo (`data-mov-saldo-label`, etc.): ahí el navegador no vuelve a escapar `<`/`>` al serializar `.innerHTML` de vuelta a texto, aunque el valor ya haya sido parseado de forma segura la primera vez. **Sin verificar en navegador real.**

### ✨ Agregado (2026-09-04) — "Cargo especial" a la tarjeta (interés, comisión, corrección del banco), sin validar cupo a propósito

*(a pedido del usuario, tras reportar que un interés cobrado con el cupo al tope no tenía dónde registrarse)*

Nuevo botón "+ Cargo especial" dentro del detalle de cada tarjeta (`abrirDetalleTCSheet`), que abre un sheet propio (`sheet-cargo-especial-tc`) con descripción, monto, motivo (Interés / Comisión / Otro), fecha y nota. A diferencia de una compra, este flujo (`abrirCargoEspecialTC`/`confirmarCargoEspecialTC`) **no valida cupo disponible** — es el criterio central que lo distingue de "+ Compra": un interés o comisión lo impone el banco, no es una decisión de gasto del usuario, así que por definición puede superar el cupo configurado. Si el monto supera el disponible, el diálogo de confirmación lo advierte explícitamente antes de guardar (no es un error silencioso).

Implementación: reutiliza la capa de datos de compras (`tcCrearCompra`/`tcRecalcular`/`tcEliminarCompraInterna`) con dos campos nuevos, `_esCargoEspecial:true` y `_motivoCargo`, en vez de un array aparte — se elimina y aparece en el historial exactamente igual que cualquier compra, solo con un badge ámbar distinto ("Cargo especial · Interés") en vez del badge de categoría. Genera gasto espejo en `S.gastosVar` (sí cuenta como gasto real del mes, igual que una compra). Ver `tarjetas-credito.md` §2/§3/§5/§7 para el detalle completo.

Validado con `node --check`. **Sin verificar en navegador real.**

---
