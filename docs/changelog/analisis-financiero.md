# Historial: Análisis financiero

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Análisis financiero

### 🐛 Corregido (2026-10-24) — El encabezado de la gráfica de patrimonio mostraba `+` y verde con un cambio de $0 (`analisis.js`)

*(Mejora 14.)* Con la ventana sin variación (p. ej. todo en $0) la diferencia salía como `+$0`, `+0.0%` en verde y el trazo y el degradado también en verde (`diffTotal >= 0`). Ahora, con `|diffTotal| < 0.005`, el encabezado muestra `$0` y `0.0%` sin signo, en el color neutro de la app (`an-t-muted`), y la línea y el degradado se pintan en el gris neutro (`--text3`). El resto de la gráfica no cambia. Probado con la gráfica real en `tests/nucleo.test.js` → `historial-patrimonio`.

### 🐛 Corregido (2026-10-24) — «+ Agregar» de Ingresos fijos no abría el sheet (`analisis.js`)

*(Mejora 7.)* **Causa raíz:** `Events` despacha cada acción como `handler(...args, elemento, evento)`. El botón «+ Agregar» va con `data-args="[]"`, así que `abrirSheetIngresoFijo(id)` recibía **el propio botón como `id`**: `_ifEditId` quedaba con un elemento del DOM, el `find` sobre `S.ingresosFijos` no encontraba ningún ingreso y la función salía por `if(!ing)return;` **sin abrir nada y sin error** (por eso la consola estaba limpia). Editar un ingreso sí funcionaba porque ahí `data-args` lleva el id.
- **Arreglo:** la acción se registra como `() => abrirSheetIngresoFijo()` (mismo patrón que `config:signOut`), con un comentario que dice por qué. El mecanismo `data-action` no cambia.
- **Auditoría de botones sin argumentos** (87 acciones del HTML, lectura estática): solo hay otros dos handlers cuyo primer parámetro no es el elemento. `cuentas:abrirTransferir(origenSugerido)` recibe el botón, pero lo compara con los valores de cuenta, no coincide con ninguno y se ignora (inofensivo; no se tocó). `prestado:confirmarMovimientoGuard(el)` espera el elemento a propósito.
- **Prueba:** `tests/nucleo.test.js` → `analisis-ingreso-fijo` (usa el `events.js` real y simula el clic como el navegador: abrir en modo nuevo y editar por id). **Falla con el código anterior** y pasa con el arreglo.

### 🔧 Cambio (2026-09-21) — Ubicación del módulo y ajuste menor

`analisis-financiero.md` no decía en qué archivo vive el código (`js/modules/analisis.js`) ni que `calcPatrimonioTotal()`/`snapshotPatrimonio()` se quedaron a propósito en `index.html` (los llama `save()` en cada guardado). Se agregó al final de §10. Se agregaron los ids `an-mesada-section`/`an-mesada-total` en §8. Se suavizó una mención a `MIN_DIAS_PARA_TENDENCIA` que no pude verificar contra código (esa función vive en `inicio.js`, no incluido).

### 🐛 Corregido (2026-08-19) — Toast de "80% del presupuesto" reaparecía en cada refresh, no una sola vez

*(reportado por el usuario: con un solo presupuesto cargado al 90%, el aviso volvía a aparecer cada vez que cambiaba de pantalla — Inicio, Configuración, Análisis — y al volver a entrar después de salir; con varios presupuestos al mismo tiempo el problema iba a multiplicarse un toast por categoría en cada refresh)*

`renderPresupuestos()` está enganchada al ciclo de `refresh()` (vía el hook `_renderMejoras()` en `index.html`, que conecta Inicio + Análisis), así que corre en cada refresh de la app, no solo al entrar a la pantalla de Análisis. El guard que evita repetir el toast (`window._presupWarned`) tenía una línea al inicio de la función que lo reseteaba a `false` en **cada** llamada — con el comentario `// Bug fix: resetear para que el aviso funcione en cada render`, agregada pensando que sin eso el aviso no disparaba nunca. El efecto real era el opuesto al buscado: en vez de avisar una sola vez por categoría, el aviso se repetía en cada refresh mientras la categoría siguiera entre 80% y 100% — cambiar de pantalla, guardar cualquier movimiento, etc. Con varias categorías al 80%+ simultáneamente, cada refresh dispara un toast por cada una.

Fix: se reemplazó el flag global booleano por un `Set` (`window._presupWarnedKeys`) que registra qué combinaciones `categoría+mes` ya avisaron, sin resetearse en cada render. Cada categoría avisa una sola vez por mes (la clave incluye el mes, así que el aviso vuelve a estar disponible naturalmente al entrar un mes nuevo). Un F5 completo de la página sigue reseteando el registro por ser solo estado en memoria — eso es esperable, no es el bug reportado (que era la repetición *dentro* de la misma sesión de pestaña). `node --check` sin errores.

### ✅ Corregido — Filtro de "gasto real del mes" duplicado en 9 lugares, dos de ellos con exclusiones faltantes

Los dos bugs anteriores (extras de préstamo en Análisis financiero y en Salud financiera) tenían la misma causa raíz: el criterio de qué gasto de `S.gastosVar` cuenta como "gasto real" (excluye `esPagoGastoFijo`, `_esPagoTC`, `_esAlcancia` y `_esExtraPrestamo`) estaba copiado a mano en 9 lugares distintos del código, sin ninguna fuente única — cada corrección tenía que aplicarse manualmente en cada copia, y ya había pasado dos veces que una quedara desactualizada.

Al revisar los 9 lugares aparecieron dos casos adicionales con el mismo problema, sin haber sido reportados todavía:
- **Resumen de cierre de mes** (toast "Total gastado" al cambiar de mes en Inicio): no excluía `_esPagoTC` ni `_esExtraPrestamo` — un pago de tarjeta o un extra de préstamo gastado ese mes inflaban el "Total gastado" del resumen.
- **Presupuestos por categoría** (Análisis financiero): tampoco excluía `_esPagoTC` ni `_esExtraPrestamo` — un pago de TC o un extra de préstamo categorizado como "Varios" podían hacer que una categoría pareciera superar su presupuesto sin que fuera gasto real.

Fix: se creó el helper `_esGastoVarNoReal(g)` (análogo a `_esEntradaEspejoNoIngreso` para ingresos) que centraliza las cuatro exclusiones en un solo lugar. Se reemplazaron los 9 filtros duplicados por una llamada a este helper: dashboard de Inicio, los cuatro puntos de `renderAnalisis()`, el total de la pantalla de Gastos, el resumen de cierre de mes, `calcHealthScore()` y los presupuestos por categoría. La lista de movimientos del feed general (`_normGastos`) se dejó intacta a propósito — ahí sí deben verse todas las transacciones reales, incluidas las que no cuentan para los totales agregados.

### ✅ Corregido — Reposiciones viejas sin `_esReposicionCP` se contaban como ingreso solo en Análisis financiero

`_esEntradaEspejoNoIngreso(m)` (el helper que excluye movimientos espejo del cálculo de ingresos, ver el fix de doble conteo más abajo) no cubría movimientos antiguos con descripción `"Reposición: ..."` o `"Para pagar TC (...)"` creados antes de que existiera la bandera `_esReposicionCP`. `calcHealthScore()` sí tenía ese filtro de respaldo (un regex sobre la descripción) aplicado aparte, pero `renderAnalisis()` no — esos movimientos viejos inflaban `ingresosEstimados` (mes actual y mes anterior) únicamente en Análisis financiero, no en Salud financiera, haciendo que dos pantallas que deberían coincidir conceptualmente divergieran para datos históricos.

Fix: se movió el regex de respaldo dentro de `_esEntradaEspejoNoIngreso()`, para que quede en el único lugar que decide qué es o no ingreso real. Se quitó la duplicación del mismo regex en `calcHealthScore()`, que ahora depende exclusivamente del helper centralizado.

### ✅ Corregido — Extras de préstamo gastados de inmediato inflaban el gasto del mes

Cuando alguien paga una deuda con un extra/propina y se elige "gastar" esa plata (en vez de "guardar" o dejarla "pendiente"), el sistema registra el gasto en `S.gastosVar` marcado `_esExtraPrestamo:true`, pero nunca registra el ingreso correspondiente — a diferencia de la opción "guardar", que sí genera un movimiento de entrada real que cuenta como ingreso. Como el balance del mes se calcula como `ingresosEstimados − gastosTotalMes`, esa plata aparecía como gasto sin su contraparte de ingreso, aunque en la práctica entró y salió en el mismo momento (efecto neto cero) — inflando artificialmente el gasto total, el ranking de meses, el gráfico de 12 meses y la comparación con el mes anterior, y haciendo ver el balance y la tasa de ahorro más negativos de lo real.

Fix: se excluyó `_esExtraPrestamo` de los cuatro filtros de `gastosVar` en `renderAnalisis()` (gasto del mes actual, gráfico de 12 meses, ranking de meses, comparación con el mes anterior) — mismo criterio ya usado con `_esPagoTC` y `_esAlcancia`: plata cuyo movimiento ya está neutralizado queda invisible para el análisis, tanto del lado del ingreso como del gasto.

### ✅ Corregido — Doble conteo / mal conteo en "Ingresos estimados"

`renderAnalisis()` sumaba como ingreso nuevo **todo** movimiento `tipo:'entrada'` del mes en Efectivo/Nequi, sin excluir los movimientos "espejo" que otros módulos generan automáticamente:
- **Mesada** recibida en Efectivo/Nequi se contaba dos veces (una vía `getMesadaData()`, otra vía el movimiento espejo).
- Un **abono de deuda** ("Me deben") se contaba como ingreso nuevo, cuando es solo plata que ya era tuya volviendo.
- Que te **prestaran plata** ("Yo debo" → "Me prestó") se contaba como ingreso, cuando es una deuda tuya, no ingreso.
- Traspasos de **capital de Encargos** a tu cuenta propia tampoco se excluían (sí se excluían ya en el cálculo de salud financiera, pero no acá).

Fix: se creó el helper `_esEntradaEspejoNoIngreso(m)` que centraliza todas las exclusiones (`_esReposicionCP`, `_esIntercambioEncargo`/`_intercambioEntrada`, `_encMovId`, desc `"Margen..."`, `_origenSeccion==='Mesada'`, `_origenSeccion` que empiece con `"Prestado"`). Se aplicó en los dos loops de `renderAnalisis()` (mes actual y mes anterior) y en el cálculo de `ingresosMes` de Salud financiera (que antes tampoco filtraba estos casos en cuentas personalizadas).

### 🗑️ Eliminado — Filtro muerto de "plata comprometida" en el gráfico de 12 meses y el ranking

El gráfico de "Gastos por mes" y el "Ranking de meses" intentaban excluir gastos con `g.fuente!=='plata-comprometida'`, pero ese valor **nunca** se escribe en `S.gastosVar.fuente` — los gastos "favor" pagados con plata comprometida viven en `tc.compras` (con `_esFavor`/`_desdeCP`) o son solo una reposición de cajita (`_esReposicionCP` en `S.movimientos`), nunca tocan `S.gastosVar`. Era código muerto que no hacía nada. Se quitó la comparación rota de ambos lugares.

### 🔧 Cambio — Reordenamiento de la pantalla

"Resumen del mes" pasó a ser el primer bloque de la pantalla y "Ingresos fijos" se movió justo después (antes iba primero). Cambio puramente de HTML/orden visual, sin tocar ids ni lógica.

### ✅ Corregido — 5 sitios de `cat` (nombre de categoría) sin escapar

*(2026-07-28, confirmando el módulo contra su código fuente por primera vez)*

A diferencia de todos los hallazgos anteriores de este mismo patrón (que reincidían sobre `fuenteLabel()`/`.nombre`/`.nota`), acá el campo sin escapar era uno nuevo: `cat` (nombre de categoría, texto libre creable desde Configuración) sin `escHtml()` en 5 sitios — "Top categorías" del mes, label + atributo `data-cat` de Presupuestos, la barra de progreso de Presupuestos, y el `toast()` de aviso al 80%. Confirma que no basta con revisar los nombres de campo ya conocidos: cualquier texto libre nuevo agregado al modelo de datos puede repetir el patrón. Corregido con `escHtml()` en los 5 sitios.

### ✅ Corregido — Migrado a `html\`\`` (piloto + resto del archivo)

*(2026-08-17 el piloto de Presupuestos, 2026-08-25 el resto)*

`analisis.js` fue el piloto original de `html\`\`` (ver `changelog/infraestructura-seguridad.md` para la creación de `js/core/html-tag.js` y la migración inicial de `abrirPresupuestos()`/`renderPresupuestos()`, con el hallazgo de `val` sin `escHtml()`). El resto del archivo quedó sin tocar en ese momento y una sesión posterior lo dio por migrado completo por error — al retomar la migración del resto de módulos (2026-08-25) se confirmó que solo Presupuestos estaba hecho; **Ingresos Fijos** (7 `escHtml()`, `ing.nombre`/`ing.desde`) y "Top categorías" dentro de `renderAnalisis()` (`cat`, 1 sitio) seguían con `escHtml()` a mano.

Ambos migrados a `html\`\`` esa sesión. En "Top categorías" el array de fragmentos se dejó auto-concatenar por el `html\`\`` externo, sin `.join('')` explícito (mismo patrón que Presupuestos); en Ingresos Fijos se mantuvo `.join('<div class="divider"></div>')` explícito porque ahí sí hace falta un separador real entre ítems — cada fragmento interno ya es un `html\`\`` seguro, y `.join()` lo coacciona a string vía su propio `toString()` sin volver a escapar nada. `Events.attr(...)` en los dos botones de Ingresos Fijos se envolvió en `raw()` (el segundo argumento es `ing.id`, un `uid()` interno, nunca texto de usuario en este modelo de datos). `analisis.js` quedó con 0 sitios de `escHtml()` fuera de comentarios y del `toast()` de Presupuestos (que se deja a mano a propósito, `toast()` no pasa por `html\`\``). `node --check` sin errores en ambos archivos.

---
