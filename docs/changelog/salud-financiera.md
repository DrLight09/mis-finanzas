# Historial: Salud financiera

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Salud financiera

### ✅ Corregido — `calcHealthScore()` no excluía los extras de préstamo gastados de inmediato

El mismo filtro de "gasto real del mes" usado en Análisis financiero (ver arriba) le faltaba una condición a `calcHealthScore()`: no excluía `_esExtraPrestamo`, así que cada extra de préstamo gastado inflaba `gastosMes` — afectando el cálculo de fondo de emergencia (meses de liquidez cubiertos) y el ratio gastos/ingresos, y bajando el puntaje de salud financiera sin razón real cuando había extras de préstamo ese mes.

Fix: se agregó la misma exclusión (`!g._esExtraPrestamo`) al filtro de `gvMes` en `calcHealthScore()`, dejando el criterio consistente con `renderAnalisis()`. *(Este filtro puntual quedó luego absorbido por la centralización en `_esGastoVarNoReal()`, ver `changelog/analisis-financiero.md`.)*

### ✅ Corregido — `#health-score-card` dejaba espacio vacío de sobra cuando el contenido era corto

*(2026-08-23)*

El `min-height:148px` inline del contenedor (agregado a propósito para evitar el CLS del salto skeleton→contenido, ver comentario en `index.html`) es un valor fijo pensado para el caso de 4 tips simultáneos. El problema: `renderHealthScore()` solo sobreescribía el `innerHTML` de adentro, nunca el `style` del contenedor — así que ese min-height se quedaba aplicado para siempre, incluso cuando el contenido real terminaba siendo mucho más corto (p. ej. la rama "sin datos", que es una sola línea de texto), dejando espacio vacío debajo.

Fix: `renderHealthScore()` ahora limpia el min-height (`el.style.minHeight = ''`) apenas corre, en las dos ramas (con y sin datos). El valor de 148px sigue protegiendo el CLS solo durante la carga (mientras se ve el skeleton); una vez que hay contenido real, el alto lo vuelve a definir el contenido mismo.

### ✅ Corregido — El anillo de progreso no se veía completamente lleno con puntaje 100

*(2026-08-23)*

Con `score=100`, `stroke-dasharray` quedaba como `"circ circ"` (dash = gap = circunferencia completa). Combinado con `stroke-linecap="round"`, los extremos redondeados del trazo (inicio y cierre del círculo) no terminaban de fundirse en un círculo continuo — quedaba una costura/muesca visible aunque el puntaje fuera perfecto.

Fix: cuando `score >= 100` se dibuja el círculo sin `stroke-dasharray` (círculo completo, sin patrón de guiones) y con `stroke-linecap="butt"` en vez de `"round"` (no hace falta cap redondeado si no hay gap). Para cualquier otro puntaje se mantiene el cálculo dinámico existente (`dash = score/100 * circunferencia`), que ya variaba correctamente según el puntaje.

### ✨ Mejorado — Mensaje de respaldo "Vas bien, sigue así." no sugería cómo mejorar

*(2026-08-23)*

Cuando `calcHealthScore()` no dispara ningún tip específico (score en el rango 60-79, "Regular"), el mensaje de respaldo era puramente de ánimo, sin ninguna sugerencia — inconsistente con la etiqueta "Regular" (no "Excelente") que se muestra al lado. Se cambió el texto de respaldo para ese rango a uno accionable: *"Vas bien — diversifica tus ahorros o reduce gastos variables para subir tu puntaje."* El rango "Necesita atención" (sin `tieneAlgo`) también se ajustó en la misma línea. No cambió ninguna lógica de cálculo, solo el texto de los dos tips de respaldo.

*(Nota: se revisó si el cálculo del puntaje penalizaba tener poca plata en términos absolutos — no es el caso. Los 7 factores de `calcHealthScore()` ya son 100% proporcionales (razones como `liquidoReal/gastosMes`, `deudaTC/ingresosMes`, `prest/liquidoReal`, `gastosMes/ingresosMes`) o basados en conteos (cantidad de CDTs, cantidad de gastos fijos configurados), nunca en montos absolutos — el puntaje ya es invariante a la escala del dinero.)*

---
