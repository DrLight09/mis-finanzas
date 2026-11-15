# Historial: Inicio

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Inicio

### ✅ Corregido (2026-09-20) — CLS de ~0,14–0,19 en Inicio: "Necesita atención" crecía ~150 px al cargar Préstamos/Spotify (lazy)

**Diagnóstico**, con un `PerformanceObserver('layout-shift')` en la consola del navegador real: un corrimiento de 0,194 con `s-attn-section` 243→229, los dos `grid3` 371→510 y 465→604 (≈ +139 px), y `grid2`/`health-score-card` empujados por debajo del viewport (rect actual `0,0`). Es el mismo culpable (`div.grid3`, 0,144) que Lighthouse venía marcando desde el 2026-08-15 como "candidato a rediseño", y que la nota del 2026-08-19 daba por varianza sin culpable fijo.

Hipótesis descartadas antes de dar con la causa: (1) columnas `1fr` que se reacomodan de forma horizontal con montos grandes — no, `.stat{min-width:0}` y `clamp()` en `.stat-value` ya lo impiden (entrada del 2026-08-23); (2) reservar un `min-height` para la sección — descartado por el usuario: deja un hueco vacío feo, que además cambia según haya 2 o 3 avisos.

**Causa:** `renderAttencion()` (`inicio.js`) arma una tarjeta por aviso y llama con guard `typeof` a `getDeudorSaldo` (`prestado.js`, lazy) y a `spPersonaPagadaVigente`/`spNombreDe` (`spotify.js`, lazy). En el primer render esos avisos no existían porque los módulos todavía no habían cargado; al terminar `Loader.ensureAll()` aparecían 3–4 tarjetas de ~50 px y empujaban todo Inicio hacia abajo. Mesada y Tarjetas ya no tenían el problema desde el 2026-08-04 (sus funciones puras viven en `calc-helpers.js`).

**Fix, mismo patrón del 2026-08-04:** las 3 funciones son cálculo puro sobre `S`/`p`, así que se movieron (copia literal, verificada idéntica) a `js/core/calc-helpers.js`, que carga de entrada. `prestado.js` y `spotify.js` ya no las definen (queda un comentario que apunta al nuevo lugar) y siguen siendo globales: el resto de esos archivos las usa igual. `spNombreDe` usa `getPersona` (`personas.js`) con guard `typeof`, así que no depende del orden de carga. El guard `typeof getDeudorSaldo` de `inicio.js` se deja como red de seguridad. La primera pintada ya trae las mismas tarjetas que la final: sin hueco y sin cambio de diseño.

**Verificación:** `node --check` en los 3 archivos. Simulación con el `inicio.js` real en `vm`, con `prestado.js`/`spotify.js` SIN cargar: antes 0 tarjetas y sección oculta; después 3 tarjetas (deudores con saldo + cobro de Spotify vencido; el deudor con saldo 0 queda fuera). **Confirmado en navegador real (usuario):** el snippet de layout-shift ya no muestra el corrimiento de ~140 px (solo entradas 0.000) y `div.grid3` no aparece como culpable en las 3 corridas siguientes de Lighthouse.

**Sigue abierto, sin diagnosticar:**
- `div.grid2` 0,012 en las 3 corridas (irrelevante).
- `div#health-score-card` 0,236 en 1 de 3 corridas (la de 50 puntos). `renderHealthScore()` quita el `min-height:148px` apenas corre; un cambio de 1–2 tips (~20 px) no alcanza para explicar 0,236, así que falta ver qué se mueve. Pendiente capturar con CPU 4× / Slow 4G (ver `auditoria-tecnica.md`).

**Se mantiene por diseño:** el auto-abrir de la lista cuando los avisos cambian de verdad desde la última vez (`hayNuevos`, solo tras `_appFullyLoaded`). `plata_comprometida.js` (lazy) envuelve `renderAttencion()` y puede aportar tarjetas propias; no se verificó si hoy suma alguna tarde.

### ✅ Corregido — 1 sitio de `spNombreDe(p)` sin escapar en "Necesita atención"

*(2026-07-22, durante la migración a `data-action`, sexto módulo migrado)*

`screen-inicio` no tiene ningún `onclick` inline (pantalla de solo lectura, sin formularios propios) — a diferencia de los cinco módulos anteriores, la migración de eventos no tuvo nada que hacer acá. Sí apareció, sexta vez seguida, el mismo hallazgo de escapado: `spNombreDe(p)` (nombre de persona en Spotify, texto libre) interpolado directo en el texto de un ítem de "Necesita atención" dentro de `renderAttencion()`, sin pasar por `escHtml()`. Corregido. El resto de `renderAttencion()`, `renderHealthScore()` y `renderProyeccion()` se revisaron a mano y no tenían más casos: solo números calculados, strings fijos, o valores que ya pasan por `escHtml()`/`fmt()` en otros puntos.

### ✅ Corregido — Migrado a `html\`\`` (segundo intento — el primero nunca se había hecho de verdad)

*(2026-08-25)*

Al arrancar la ronda de migraciones pendientes se descubrió que `inicio.js` **nunca se había migrado**, pese a haber quedado listado junto a `analisis.js` como parte del piloto original (2026-07-28) — el archivo real tenía 0 usos de `html\`\`` y seguía con sus 8 `escHtml()` manuales intactos. El documento se había adelantado al código.

Los 8 `escHtml()` vivían todos en `renderAttencion()`. Los seis campos de texto libre reales (`d.nombre`, `tc.nombre`, `spNombreDe(p)`, `c.nombre`, `enc.nombre`, `p.desc`) ahora se arman como fragmentos `html\`\`` en cada `items.push(...)`, guardados en `it.texto`; el render final (`list.innerHTML=html\`${items.map(...)}\``) los interpola sin volver a escaparlos, aprovechando la misma propiedad de anidamiento sin doble escape ya validada con el piloto de `analisis.js`. Efecto colateral correcto y esperado: `it.texto` pasó de ser un `string` a un objeto con `.toString()` — no rompe el fingerprint de "items nuevos" (`items.map(i=>i.texto).sort().join('|')`), porque tanto `Array.prototype.sort()` sin comparador como `Array.prototype.join()` coaccionan cada elemento a string internamente.

Validado con `node --check` y una simulación jsdom con payloads maliciosos en los 6 campos (`<img onerror>`, `<script>`, `</div><script>`, comillas dobles): todos quedan como texto visible escapado, sin ejecutar nada y sin romper la estructura de las cards. **Sin verificar en navegador real.**

### ✅ Corregido (2026-08-30) — Anillo de `#health-score-card` no arrancaba arriba (el truco de `stroke-dashoffset` asumía mal el sentido de trazado del `<circle>`)

`renderHealthScore()` usaba `stroke-dashoffset="${circ/4}"` para intentar que el relleno del anillo empezara a las 12 en vez de a las 3 (punto de inicio por defecto de un `<circle>` SVG). En la práctica no arrancaba arriba — el cálculo asumía un sentido de trazado que no correspondía al real, así que el offset movía el inicio a otro punto del círculo, no a las 12. Reemplazado por la técnica estándar para anillos de progreso en SVG: `transform="rotate(-90 38 38)"` en el círculo de progreso (el de fondo no lo necesita, al ser un círculo completo no tiene "inicio" visible). Al ser una rotación real del elemento, no depende de en qué dirección interprete el navegador el trazado del `<circle>` — funciona sin importar esa ambigüedad. El cálculo de `dash`/`dasharray` (porcentaje del score sobre la circunferencia) no cambió, seguía siendo correcto. Validado con `node --check`.

### ✨ Mejorado (2026-08-30) — Empty-state de `#proyeccion-card` ("Sin datos suficientes")

El estado sin datos era una sola línea de texto gris pegada arriba a la izquierda de una card con `min-height:126px`, dejando el resto vacío sin ningún criterio visual. Reemplazado por un empty-state compacto centrado (ícono redondo + título + subtítulo), mismo patrón visual que ya usan los estados vacíos de Encargos/Tarjetas de crédito/Spotify (`empty-state-icon`/`empty-state-title`/`empty-state-sub`), pero armado a mano a escala reducida (ícono de 34px en vez de 52px) para caber en una card pequeña sin agrandarla. No se tocó la condición que decide cuándo se muestra (`!patrimonio`).

### ✨ Agregado (2026-09-17) — "Neto de TC" junto a Disponible

Disparador: el usuario prestó plata confiando en el "Disponible" bruto (`#s-disp` = Nu + Nequi + Efectivo), sin ver que parte de eso ya tenía como destino pagar la tarjeta de crédito. Se evaluó y descartó agregar fecha de corte/pago a Tarjetas de crédito para resolverlo (contradice la decisión de diseño explícita de ese módulo, `tarjetas-credito.md` §7: "no simula un banco real") y también usar Plata Comprometida (ese módulo es para ingresos futuros con destino ya planeado, no para deuda propia saliente — caso de uso distinto, ver `plata-comprometida.md` §1).

Se agregó `#s-disp-neto-tc`, una segunda línea chica debajo de `#s-disp` (no la reemplaza) con `_renderDispNetoTC()` en `inicio.js`, hookeada al mismo monkey-patch de `refresh()` que ya usaba `_checkGastoAlto()`. Solo se muestra si hay algo que restar; vacía en caso contrario, sin "$0" de relleno.

**Hallazgo real durante la implementación:** el primer intento usó `calcDeudaTcPropia()` (la función que ya usa Salud financiera), pero esa función también descuenta el saldo inicial pendiente de la deuda — `calcSaldoInicialPendiente()` en `core-state.js` lo trata a propósito como "neutral, sin clasificar" (ni propio ni ajeno). Con una tarjeta cuya deuda es 100% saldo inicial + un cargo ajeno confirmado, `calcDeudaTcPropia()` daba 0 y el bloque se quedaba vacío aunque sí había plata sin clasificar que muy probablemente había que pagar. Se cambió el cálculo a `tc.deuda − calcDeudaAjenaDeTarjeta(tc)` sumado por tarjeta — mismo criterio que ya usa el widget de "cobertura" de Tarjetas de crédito (deuda total, no la propia, porque "el banco cobra el 100% sin importar esta distinción" — `tarjetas-credito.md` §2): se resta todo lo que NO esté confirmado como ajeno, tratando el saldo inicial sin clasificar como si fuera propio hasta que algo diga lo contrario.

Se agregó también un reintento corto (`setTimeout` cada 500ms, hasta 10s) por una sospecha inicial de que `calcDeudaAjenaDeTarjeta`/`calcDeudaTcPropia` cargaban lazy vía `tarjetas_credito.js` — descartado al revisar `core-state.js`/`calc-helpers.js`: ambas viven en `core-state.js`, que carga eager antes que `inicio.js`. El reintento se dejó como red de seguridad barata (por si ese archivo se vuelve lazy en el futuro), sin efecto práctico hoy.

Validado con `node --check`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-20) — "Neto de TC" podía mostrar un valor MAYOR que "Disponible", y restaba solo la deuda propia en vez de la total

**Bug de cálculo:** `_renderDispNetoTC()` recalculaba "disponible" a mano (`nuTotal()+nequiSaldo+efectivoSaldo`) en vez de reusar la fórmula real de `refresh()` (`cajitasLibres+nequi+ef+customTotal`) — le faltaba sumar `cuentasPersonalizadas`. Si alguna cuenta personalizada tenía saldo negativo, el `disp` local quedaba más alto que el `#s-disp` real, y el "Neto" resultante podía superar al "Disponible" bruto — matemáticamente imposible si la resta fuera correcta (`Math.max(0,...)` garantizaba una deuda no-negativa). Corregido: se cambió a `_nuTotalSafe()` (mismo fallback seguro que ya usa `refresh()`) y se agregó `customTotal` a la suma.

**Decisión de criterio (cambio de diseño, no solo bug):** el cálculo original restaba `tc.deuda − calcDeudaAjenaDeTarjeta(tc)` (solo la parte "propia"), asumiendo que lo ajeno seguía pendiente de cobro. Pero `calcDeudaAjenaDeTarjeta()` solo baja con un pago real a la tarjeta — si el tercero ya devolvió esa plata por otro medio (efectivo/Nequi/Nu), la app no tiene forma de saberlo, y seguía tratando esa parte de la deuda como "no tuya" aunque el dinero recibido ya estuviera contado como disponible libre. Se cambió a restar `tc.deuda` completa, sin descontar lo ajeno — mismo criterio que ya usa el widget de "cobertura" de Tarjetas de crédito (`tarjetas-credito.md` §2: el banco cobra el 100% sin importar esta distinción). Efecto: "Neto de TC" ahora asume el peor caso (toda la deuda es tuya de pagar) en vez de un supuesto que la app no puede verificar.

Se eliminó también el sistema de reintento (`_dispNetoTcIntentos`/`_renderDispNetoTCConReintento`), que dependía de que `calcDeudaAjenaDeTarjeta` existiera — ya no se usa esa función acá, y `_nuTotalSafe()` no necesita reintento.

Validado con `node --check`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-20, mismo día) — "Neto de TC" volvió a poder mostrar un valor MAYOR que "Disponible" — esta vez por un saldo a favor en una tarjeta

Al cambiar la resta de "solo deuda propia" a "deuda total" (ver fix de arriba), se perdió el `Math.max(0, ...)` que tenía el cálculo original. Si una tarjeta tiene `tc.deuda` negativo (saldo a favor — se pagó de más), `(S.tarjetasCredito||[]).reduce((a,tc)=>a+(tc.deuda||0), 0)` podía dar un total de deuda negativo, y `neto = disp - deudaTCTotal` con `deudaTCTotal` negativo es `disp + algo` — Neto apareciendo por encima de Disponible otra vez, esta vez sin relación con `cuentasPersonalizadas`.

Corregido aplicando el piso en 0 **por tarjeta antes de sumar** (`a+Math.max(0,tc.deuda||0)`), no sobre el total: un saldo a favor en una tarjeta no debe restarle deuda a las demás tarjetas, ni inflar el "peor caso" de Neto por encima de Disponible — esa plata a favor no está disponible en la mano hasta que se pida reembolso o se aplique a compras futuras.

Validado con `node --check`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-20, mismo día) — Rediseño: "Neto de TC" deja de recalcular "disponible" y lee el valor real de `refresh()`

Las dos correcciones anteriores de este mismo día (`cuentasPersonalizadas` faltante, y el saldo a favor sin piso en 0) arreglaban síntomas puntuales del mismo problema de fondo: `_renderDispNetoTC()` recalculaba "disponible" de forma independiente a `refresh()`, así que cualquier diferencia entre ambos cálculos — por pequeña que fuera — podía volver a producir un "Neto" mayor que "Disponible", sin garantía de que no apareciera un tercer caso.

Se eliminó la causa raíz en vez de seguir parchando síntomas: `core-state.js` ahora expone `window._dispActualHoy = disp` justo después de calcular `disp` dentro de `refresh()` (una sola línea añadida, no cambia nada existente de esa función). `_renderDispNetoTC()` en `inicio.js` ya no recalcula `nu+nequi+ef+customTotal` — lee directamente `window._dispActualHoy`, el mismo número que se acaba de pintar en `#s-disp`. Por construcción, "Neto de TC" no puede volver a desalinearse de "Disponible": es literalmente ese mismo número menos la deuda de TC. El orden ya estaba garantizado (el monkey-patch de `refresh()` en `inicio.js` llama primero a `_origRefreshInicio()`, que setea la variable, y recién después a `_renderDispNetoTC()`).

Validado con `node --check` en ambos archivos (`core-state.js`, `inicio.js`). **Sin verificar en navegador real.**

`#s-disp-neto-tc` vivía dentro de la misma celda `.stat` que "Disponible", dentro del `grid3` compartido con "Nu libre" y "Efectivo". La línea extra hacía crecer esa celda, y como las tres celdas de una fila de grid comparten altura, "Nu libre"/"Efectivo" se estiraban con espacio muerto de sobra aunque no tuvieran nada que mostrar ahí. Se sacó `#s-disp-neto-tc` de adentro de la celda `.stat` y se dejó como una línea propia, de ancho completo, justo debajo del `grid3` (antes del siguiente `grid3` de Nequi/Prestado/CDTs) — sigue leyéndose pegado a "Disponible" por posición y porque el texto ya dice "Neto de TC: $X", pero ya no participa en el alto de esa fila. Cambio solo de `index.html`; `_renderDispNetoTC()` no cambió (sigue usando `getElementById`, indiferente a dónde vive el elemento en el DOM).

---
