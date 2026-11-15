# Historial: Wrapped

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Wrapped (módulo nuevo)

### 🐛 Corregido (2026-09-16) — Un registro suelto de meses atrás podía ganar "mejor mes del año"

Reportado con un caso real: cuenta que empezó a usarse en septiembre, con un solo registro cargado de memoria de meses antes (mesada de enero, sin ningún otro movimiento ese mes). Ese enero pasaba como mes "real" en `_wrappedMejorPeorMesAnio`/`_wrappedHistoriasMensuales` (único filtro: `totalIngresos > 0 || totalGastos > 0`) — con ingreso y cero gastos registrados, salía con el mejor balance del año por default, y con una frase de "mes tranquilo" que en realidad describía un vacío de datos.

Nueva función `_wrappedInicioRachaReal(S, anioK, mesMax)`: encuentra el principio de la racha real de meses activos caminando hacia atrás desde el mes más reciente, cortando en el primer hueco de 2+ meses sin ningún ingreso/gasto (2, no 1, para no borrar un mes real flojo que caiga en medio de un historial real). `_wrappedMejorPeorMesAnio` y `_wrappedHistoriasMensuales` ahora arrancan su loop ahí en vez de en enero. No toca ningún total anual — el ingreso de enero sigue contando en los agregados del año completo, solo se saca de las comparaciones por mes. Verificado con dos casos simulados (el reportado + un control de "un solo mes flojo real" para confirmar que no se pierde historial legítimo) antes de tocar el archivo real. `_wrappedFasesAnio` y `_wrappedCambioDeHabitos` se revisaron y ya estaban a salvo de este mismo problema por otros motivos (ver `wrapped.md` §7terdecies para el detalle completo).

### ✨ Agregado (2026-09-15) — Ventana de disponibilidad (solo enero, año recién cerrado) + destacado en "Más" + banner de aviso

Resuelve la decisión que había quedado abierta en `wrapped.md` §7decies ("año en curso vs. año recién cerrado"): hasta ahora Wrapped estaba disponible los 12 meses del año mostrando el año EN CURSO en vivo (opción 3, "por ahora"). Pasa a la opción 2 que ya estaba documentada ahí mismo: revelación de verdad, del año recién cerrado, solo durante una ventana corta en enero — el resto del año, la pantalla no existe.

**Nuevo:** `js/core/wrapped-gate.js` — núcleo eager y chico, aparte de `wrapped.js` a propósito (así no hace falta bajar ~4000 líneas del módulo real solo para saber si mostrarlo). Un solo punto de verdad (`_wrappedVentana()`) decide, a partir de `hoy()`:
- si la ventana está abierta (1-31 de enero, `WRAPPED_VENTANA_DIAS`, un solo número para ajustar);
- el año objetivo (siempre `anioActual - 1`, nunca el año en curso en vivo);
- días restantes y fecha de cierre, para los textos de urgencia.

Expone `window._wrappedDisponible()`/`window._wrappedAnioObjetivo()`, consumidos por `lazy-loader.js` y `wrapped.js` (ver abajo). `?wrappedForzar=1` en la URL fuerza la ventana abierta para poder probar/hacer una demo sin esperar a enero — mismo espíritu que `?debug=1` en `wrapped.js`, decisión aparte (acá se decide si el módulo existe, allá qué tan detallado se ve).

**No gastar recursos fuera de la ventana:**
- `js/core/lazy-loader.js`: `ensureAll()` (precarga en segundo plano de todos los grupos lazy) ya no incluye `'wrapped'` salvo que `_wrappedDisponible()` confirme que la ventana está abierta. Guard `typeof` con fallback a "no disponible" si el gate no cargó (fallar cerrado).
- `index.html`: `#cfg-wrapped-row` (fila "Más → Tu resumen") arranca con `display:none` en el propio HTML — fail-closed — y `wrapped-gate.js` la muestra/oculta según la ventana. Sin esa fila visible, no hay ningún camino para que el usuario dispare `Loader.ensure('wrapped')` fuera de enero.
- `wrapped.js`: `window.renderWrapped()` agrega un cinturón de seguridad (no la gate real) que redirige a Configuración con un toast si se llega hasta ahí fuera de la ventana — cubre deep links viejos o `showScreen('wrapped')` a mano desde la consola, no el flujo normal.

**Ya no es "un módulo más del montón":** ver la corrección de ubicación más abajo — terminó siendo una tarjeta propia (`#wrapped-promo`) arriba de todo en Configuración, no una fila destacada dentro de la lista.

**Aviso proactivo:** `wrapped-gate.js` arma un banner flotante (`#wrapped-banner`, JS puro, mismo patrón que `#toast-container`/`#wrapped-overlay` — no vive en el HTML hasta que hace falta) con el título, los días restantes y un botón "Ver mi resumen →" que llama a `showScreen('wrapped')`. Se dispara una sola vez por año objetivo (flag en `localStorage`, `mf_wrapped_banner_visto_<año>` — UI, no un dato financiero nuevo en `S`), 1.5s después de `appDataLoaded` para no competir con el toast de bienvenida. Si el usuario ya abrió Wrapped por su cuenta desde el menú (`renderWrapped()` marca `mf_wrapped_visto_<año>`), el banner tampoco insiste.

**Corrección sobre la marcha (2026-09-16), ubicación y identidad visual.** Hicieron falta tres intentos:

1. Fila destacada dentro de la lista de "Herramientas" (`.cfg-toggle-destacado`: fondo tintado, badge, glow). Se veía como un parche.
2. Ajustar el espaciado de esa fila (`padding` + margen horizontal negativo, porque `.cfg-toggle` en `styles.css` es `padding:15px 0`, sin padding horizontal). Tapaba el síntoma: una fila de lista pintada de colores no se lee como algo especial por bien espaciada que esté.
3. Tarjeta propia `#wrapped-promo` **arriba del todo en Configuración, incluso sobre "Cuenta"** — lo primero que se ve al entrar, durante el único mes del año en que existe.

La primera versión de esa tarjeta se montó sobre `.hero`, pero quedaba idéntica al hero del patrimonio (mismo verde, misma forma). La versión final toma la identidad del **propio Wrapped**: fondo oscuro (`--bg2`) con blobs de color desenfocados (`.wp-blob`, versión en miniatura de `.wrapped-bg-blob` de `wrapped.js` — blur 34px acá vs. 64px allá) y la tira de segmentos de progreso (`.wp-segs`, el motivo de "stories" de `#wrapped-progress`). Los colores no son paleta nueva: son las mismas variables que Wrapped rota como `--wrapped-mood` (`--accent`/`--amber`/`--blue`/`--purple`, ver `wrapped.js:3567`). El año va en `--nu-light`→`--purple` degradado sobre el texto; el botón en `--text` sobre oscuro, no verde, para no volver a chocar con el hero.

El banner recibió el mismo tratamiento, así banner y tarjeta se leen como la misma pieza: blobs, la misma tira de segmentos en lugar del ícono decorativo (una estrellita se veía infantil, y sin nada el bloque quedaba vacío — los segmentos dicen "esto es un carrusel de historias" sin decorar), botón en `--text` y un botón "Después" que cierra **sin** marcar visto (la X sí lo marca para todo el año).

Eliminado en el proceso: `.cfg-toggle-destacado`, `.cfg-badge-nuevo`, el keyframe `wrappedGlow`, la fila `#cfg-wrapped-row` con sus ids, y el `<i class="fa-solid fa-star">` del banner. `_wrappedGateAplicarFila()` apunta ahora a `#wrapped-promo` y rellena `#wrapped-promo-anio`/`#wrapped-promo-dias`. Se mantienen el `display:none` en el HTML (fail-closed) y el handler genérico `config:irA`.

**Dos bugs reales encontrados al renderizar con Chromium** (no con `wkhtmltoimage`, que no soporta `filter:blur()` y daba blobs cuadrados — conviene usar Chromium para verificar esto a futuro):
- `#wrapped-banner > *:not(.wp-blob){position:relative}` le pisaba el `position:absolute` a `#wrapped-banner-close`, mandando la X al flujo normal (arriba a la izquierda, encima de los segmentos). Corregido excluyéndolo del `:not()` y dándole `z-index:2`; además `.wp-segs` dentro del banner lleva `margin-right:26px` para no correr por debajo de la X.
- `.wp-anio` era un bloque de ancho completo, y con `background-clip:text` el degradado se reparte sobre la **caja**, no sobre las letras: el tramo morado caía en el espacio vacío a la derecha del año y solo se veía verde→naranja. Corregido con `display:inline-block`.

**Nota aparte, emojis:** el título del banner y el toast del cinturón de seguridad en `renderWrapped()` habían quedado con emojis Unicode (`🎉`/`🎁`) — mismo problema ya barrido en `index.html`/`encargos.js` el 2026-08-19 (ver esa entrada más abajo). Corregidos antes de llegar a producción: el toast quedó en texto plano (los `toast()` de esta app nunca llevan íconos) y el título del banner pasó primero a `fa-star` y finalmente a la tira de segmentos descrita arriba, sin ícono.

**Resuelto de paso, el mismo punto de `_wrappedBuildSlides`:** `anioK` ya no sale de `_wrappedHoy().slice(0,4)` (siempre el año en curso) sino de `window._wrappedAnioObjetivo()`. No hizo falta tocar nada más del cálculo — `mesMax` (`_wrappedAnioYMesActual`) ya distinguía correctamente `anioK === anioActual` vs. un año pasado desde antes; con el nuevo `anioK` siempre siendo el año pasado, esa rama simplemente pasa a usarse siempre (12 meses completos), sin cambios de código.

Validado con `node --check` en los tres archivos tocados/nuevos (`wrapped-gate.js`, `lazy-loader.js`, `wrapped.js`). **No probado en navegador real** — no se pudo confirmar en vivo el ciclo `appDataLoaded` → banner → click → `showScreen('wrapped')`, ni el aspecto visual del destacado/banner, porque reproducirlo fielmente requeriría el resto de `core-state.js`/`bootstrap.js`/`sheet-stack.js`, que no forman parte de esta sesión. Pendiente confirmar en un dispositivo real cuando llegue enero (o con `?wrappedForzar=1` antes).

Fuera de alcance a propósito, quedó afuera de esta sesión: exportar/descargar el resumen como imagen o texto (el usuario lo mencionó como idea suelta, "no sé pero...") — agregarlo bien (captura del carrusel a imagen, o un resumen textual compartible) es una pieza de diseño e implementación aparte, no una extensión de una línea sobre lo de acá. Queda anotado como pendiente, no como decisión tomada.

### 🔧 Cambio (2026-09-08) — Se saca la vista mensual, Wrapped pasa a ser solo anual

Después del rediseño a "experiencia de revelación" (ver el cambio inmediatamente debajo), la vista mensual seguía sin encontrar su lugar: aun sin ingresos/gastos crudos, mostrar top-categoría-del-mes competía de lleno con "Top categorías" de Análisis financiero, y verla cada mes le quitaba a Wrapped la sensación de sorpresa que es la razón de que exista — un wrapped que aparece todos los meses deja de sentirse como un wrapped.

Se sacó por completo: las pestañas "Este mes"/"Este año", `_wrappedRenderMes()`, `wrappedVerMes()`/`wrappedVerAnio()`, la variable de estado `_wrappedTab`, y el `Events.registerAll('wrapped', ...)` (ya no hace falta, la pantalla no tiene ninguna interacción — es de solo lectura). `screen-wrapped` en `index.html` quedó reducido a un único `<div id="wrapped-body">`. Se agregó un mensaje neutro de fallback para cuando no hay absolutamente nada que mostrar (usuario nuevo, día 1).

Ver `wrapped.md` §7 para el razonamiento completo (por qué anual sí y mensual no, y por qué la alternativa de recortar Análisis financiero en su lugar no tenía sentido — Análisis existe justamente para ser la vista completa y chequeable).

Validado con `node --check` y jsdom: confirmado que `window.wrappedVerMes`/`wrappedVerAnio` ya no existen, que `renderWrapped()` funciona sin ningún elemento de pestaña en el DOM, y que `Events.registerAll` nunca se invoca (se hizo explotar el mock a propósito en el test para confirmarlo).

### 🔧 Cambio (2026-09-08) — Rediseño: de dashboard checkeable a experiencia de revelación animada

La primera versión de Wrapped terminó siendo, sin querer, un mini-Análisis financiero: filas planas de "Ingresos reales / Gastos reales / Tasa de ahorro" para mes y año. El punto de Wrapped es justo lo contrario — una sorpresa tipo Spotify Wrapped que se "vive" al abrirla, no un número que se chequea a diario (para eso ya existe Análisis financiero). Se rediseñaron ambas vistas:

- **Se eliminaron** todas las filas de ingresos/gastos/tasa de ahorro en crudo, en ambas vistas (mes y año). Esos números se siguen calculando internamente (hace falta el balance para rankear "mejor/peor mes"), pero nunca se pintan directamente.
- **Se agregó** un gráfico de línea animado (SVG, sin librerías) para la vista "Este año": un punto de patrimonio por mes desde el primer mes con dato real hasta el mes actual, coloreado según si terminó arriba (verde) o abajo (rojo) de donde empezó. La línea se "dibuja" con la técnica estándar de `stroke-dasharray`/`stroke-dashoffset`, animada en JS después de insertar el HTML en el DOM (necesita medir el `<path>` ya renderizado con `getTotalLength()`). Los puntos aparecen en cascada con un `animation-delay` escalonado por punto.
- **Se agregaron** dos "datos curiosos" nuevos que no existían: gasto más grande del período (mes y año), y se reformularon los existentes (top categoría, mejor/peor mes, total en Alcancía, racha) como tarjetas de "revelación" que aparecen en cascada con fade-up escalonado (`.wrapped-reveal`, keyframe nuevo en `index.html`), en vez de una lista estática de una sola vez.
- **Se agregaron** los keyframes `wrappedDotIn` / `wrappedFadeUp` y las clases `.wrapped-dot` / `.wrapped-reveal` al bloque de estilos de `index.html`, junto a los demás keyframes de la app (mismo patrón que `toastIn`/`pinShake`).
- La animación se dispara **cada vez que se abre la pantalla** (no solo la primera vez históricamente) — a propósito, para no tener que persistir un flag de "ya lo viste" en `S`. Ver `wrapped.md` §7 para el razonamiento completo.

De paso, se hizo `_wrappedCalcularPeriodo()` defensivo ante `S.pagosGastosFijos` llegando como objeto/mapa en vez de array (se encontró así en datos reales de producción, no solo hipotético — `Array.isArray()` + `Object.values()` como fallback).

Validado con `node --check` y una simulación jsdom contra un `melo.json` de prueba real: la serie mensual recorta correctamente hasta el primer mes con dato (mayo, no enero, porque no había datos anteriores), el gráfico no se genera con menos de 2 puntos, y ambas vistas confirmadas *sin* ningún rastro de "Ingresos reales"/"Tasa de ahorro" en el HTML resultante. **La animación en sí (la parte visual) no se pudo probar en un navegador real** — jsdom no implementa `getTotalLength()` de SVG, así que el código tiene un guard explícito para degradar sin romper en ese caso, pero el efecto visual de "dibujado" solo se puede confirmar abriendo la app de verdad.

### ✨ Agregado (2026-09-07) — Módulo nuevo: resumen "Wrapped" de mes/año

Nueva pantalla accesible desde Más → "Tu resumen", duodécimo grupo lazy (`js/core/lazy-loader.js`). Documentación completa en `wrapped.md` (nuevo). Resumen ejecutivo de lo tocado, para quien solo busque el detalle técnico del wiring:

- **`js/modules/wrapped.js` (nuevo):** todo el módulo — cálculo puro de gasto/ingreso real del mes o año (reutilizando `_esGastoVarNoReal`/`_esEntradaEspejoNoIngreso`), mejor/peor mes del año, crecimiento de patrimonio anual (mismo criterio de `valorVisible`/`montoBase` que Análisis financiero §5), y render de las dos vistas (mes/año).
- **`js/core/lazy-loader.js`:** agregado el grupo `wrapped: ['js/modules/wrapped.js']`.
- **`js/core/sheet-stack.js`:** agregada la rama `if(name==='wrapped'){ renderWrapped(); }` en `showScreen()`, mismo patrón que `analisis` (a diferencia de Alcancía, que se integra parcheando `openSheet` desde su propio archivo — Wrapped no necesitaba ese patrón porque no tiene sheets propias).
- **`index.html`:** agregado el contenedor `#screen-wrapped` (entre Análisis y Personas) y el ítem `#mas-wrapped` en el menú Más (justo después de Análisis financiero).
- **`alcancia.js`:** expuestas `window._alcRachaAhorro` y `window._alcMejorCiclo` (antes solo locales al IIFE) para que Wrapped reutilice el cálculo de racha sin duplicarlo — sin cambiar su comportamiento interno en Alcancía.

A propósito no cubre Mesada, Spotify, Encargos ni Plata Comprometida — ver `wrapped.md` §7 para el razonamiento. No persiste ningún dato nuevo: todo se calcula en vivo en cada apertura, mismo principio de "una sola fuente de verdad" que ya sostiene el resto de la app.

Validado con `node --check` en los cuatro archivos JS tocados y una simulación jsdom de los cuatro cálculos puros (gasto/ingreso real de mes y de año, top categoría, alcancía del período, mejor/peor mes, crecimiento de patrimonio con descuento de `montoBase`, formateo de mes, y render de ambas vistas con y sin datos). **No probado en navegador real** — en particular, no se pudo confirmar en vivo el flujo completo `Loader.ensure('wrapped')` → `showScreen('wrapped')` → `renderWrapped()`, porque reproducirlo fielmente requeriría el resto de `core-state.js`/`bootstrap.js` que no forman parte de esta sesión.

### ✨ Agregado (2026-09-07) — "Wrapped" de progreso de ahorro entre ciclos

Hasta ahora, la comparación "vs. alcancía anterior" solo existía en el instante de destapar (la sheet de resultado) — una vez cerrada, esa información no se podía volver a ver sin recalcularla a mano desde el historial. Se agregó una tarjeta persistente ("Tu progreso ahorrando") en la pantalla principal de Alcancía, justo encima del historial de ciclos, visible en cualquier momento (haya o no una alcancía activa en curso) — no solo justo después de destapar.

Muestra un mini gráfico de barras (SVG inline, sin librerías) de los últimos hasta 6 ciclos por `saldoRegistrado`, la racha actual (cuántas alcancías seguidas, contando desde la más reciente, ahorraron más que la anterior) y el mejor ciclo histórico. Todo se recalcula en vivo desde `S.alcancia.historial` en cada `renderAlcancia()` — no se persiste ningún número nuevo aparte, mismo principio que el resto de la app (los registros ya guardados son la única fuente de verdad). La tarjeta no se muestra con menos de 2 ciclos destapados (no hay nada que comparar todavía).

Se centralizaron los cálculos en `_alcRachaAhorro()` y `_alcMejorCiclo()`, usados tanto por la tarjeta persistente como por el mensaje de racha agregado a la sheet de resultado del destape (que antes solo mostraba diferencia de monto y de días) — mismo criterio de "una sola fuente de verdad por cifra" que ya usa el resto del proyecto (ver `_esGastoVarNoReal`/`_esEntradaEspejoNoIngreso` en Análisis financiero).

Cambios en `alcancia.js` (`_alcRachaAhorro`, `_alcMejorCiclo`, `_alcWrappedBarrasSvg`, `_alcWrappedProgresoHtml`, conectadas en `renderAlcancia()` y en `alcanciaConfirmarDestapar()`) e `index.html` (contenedor `#alcancia-wrapped-progreso`). Documentado en `alcancia.md` §7/§8.

Validado con `node --check` y una simulación jsdom de las cuatro funciones nuevas (racha ascendente, racha cortada, menos de 2 ciclos, mejor ciclo, límite de 6 barras). **No probado en navegador real.**

### ✨ Agregado (2026-09-07) — El selector de cuenta de origen al depositar solo muestra cuentas con saldo utilizable

El selector "¿De qué cuenta sale?" (depósito simple) y "Lo tenía yo (efectivo)" (parte propia de un split) listaban todas las cuentas sin tarjetas de crédito, sin importar si tenían saldo suficiente — invitando a elegir una cuenta vacía y enterarse recién al ver el hint de saldo debajo. Se agregó `_alcFiltrarFuentesPorSaldo()`, que tras poblar el select con `buildFuentesOptsHtml()` (sin tocar esa función compartida con Mesada/Encargos/Préstamos) quita las opciones de cuentas con saldo ≤ $50 — umbral fijo para no listar cuentas técnicamente "con algo" pero inutilizables por redondeos. Si no queda ninguna cuenta con saldo, el placeholder cambia a "No tenés cuentas con saldo disponible" en vez de dejar una lista vacía sin explicación.

No se tocó el selector de destino del destape (`alc_destino`): ahí la plata entra a la cuenta, no sale, así que filtrar por saldo no aplica.

Validado con `node --check` y una simulación jsdom (cuentas con saldo variado, caso de "ninguna cuenta con saldo").

### 🔧 Cambio (2026-09-24) — Al destapar la alcancía, el historial de patrimonio deja de ocultarla hacia atrás (`alcanciaConfirmarDestapar()`)

*(pedido del usuario al ver que el 22 de septiembre la gráfica de Historial de patrimonio bajaba $5.190,84: era un depósito de $6.000 a la alcancía, restado de `valorVisible` mientras estaba oculta)*

Cada punto de `S.patrimonioHistorial` guarda `valor` (patrimonio real, con alcancía) y `valorVisible` (sin ella). Mientras la alcancía está tapada, la gráfica de Análisis, la Tendencia mensual y la Proyección leen `valorVisible`, así que cada depósito se ve como una caída y, al destapar, la plata aparece de golpe en una sola subida. Como al destapar esa plata deja de ser secreta, ahora `alcanciaConfirmarDestapar()` iguala `valorVisible = valor` en todos los puntos que lo tienen, justo después de resetear `saldoRegistrado`. Los depósitos pasan a verse en el día en que ocurrieron y no queda un salto el día del destape.

Aplica a todos los puntos porque todo lo oculto pertenece a la alcancía que se está destapando o a ciclos ya destapados. `valor`, `montoBase` y `fecha` no se tocan; los puntos sin `valorVisible` ya usaban `valor` como fallback. No hay cambio en el hero de Inicio, Salud financiera ni `calcPatrimonioTotal()`: al destapar, la plata ya está en la cuenta destino y `saldoRegistrado` queda en 0, así que sus valores actuales ya reflejaban el destape.

Verificado con `node --check` y una prueba jsdom sobre el backup del 2026-09-23: los 17 puntos tenían `valorVisible ≠ valor` antes y 0 después, con `valor`/`montoBase`/`fecha` intactos; sin el cambio, los 17 seguían distintos. Confirmación en navegador real pendiente.

### ✅ Agregado (2026-09-01) — Protección por antigüedad en `alcanciaEliminarDeposito` (no tenía ninguna)

Detectado al hacer una revisión general de la protección por antigüedad en todos los módulos (ver `changelog/mesada.md` y `changelog/encargos.md` para el origen). `alcanciaEliminarDeposito()` no tenía ningún chequeo de fecha ni de operaciones posteriores — cualquier depósito, sin importar la antigüedad, se borraba tras un simple "¿Seguro?". Y a diferencia de un ingreso neto-cero suelto, acá sí había algo real que proteger: un depósito `'yo-cuenta'` o la parte propia de un `'split'` con `_splitFuente` reingresan plata a una cuenta real vía `sumarFuente()`.

Fix: nueva protección que **siempre** aplica (no hay un "Sin especificar" análogo al de Mesada/Préstamos, porque `a.saldoRegistrado` es un total corrido que se ajusta incrementalmente en cada borrado — igual que `enc.movimientos` en Encargos o `tc.deuda` en Tarjetas — así que siempre hay algo que se mezcla con lo posterior). "Operaciones posteriores" cuenta contra la alcancía completa (mismo criterio adoptado para Encargos). El mensaje de "movimiento antiguo" se adapta según qué se vaya a revertir: la cuenta real (si `yo-cuenta`/`split` con fuente), la deuda de la persona (si `cobro-deuda`), o el registro de la alcancía misma en cualquier otro caso.

Usa la clave de módulo nueva `'alcancia'` en `nivelAntiguedadMovimiento()` — ver `changelog/infraestructura-seguridad.md` (2026-09-01) para el cierre de la config correspondiente en `core-state.js`.

Refactor menor: se extrajo la reversión real a `_alcanciaEjecutarEliminarDeposito(a, idx, entry)` para poder llamarla desde los dos caminos de confirmación (el aviso específico de antigüedad y el diálogo genérico) sin duplicar el código de reversión.

Validado con `node --check`.

### ✨ Agregado — Nuevo tipo de depósito "Me pagaron una deuda que me tenían" (`cobro-deuda`)

Hasta ahora, si alguien te pagaba un préstamo (Prestado · Me deben) y esa plata se guardaba directo en la alcancía sin pasar por ninguna cuenta real primero, no había forma de registrarlo: el selector "¿A dónde entra el pago?" del sheet de Préstamos solo lista cuentas reales (Nequi, Efectivo, cajitas, cuentas personalizadas) — la alcancía nunca apareció ahí a propósito, porque no es una cuenta con `fuente`/`destino` (ver alcancia.md §7, "Decisiones de diseño").

Se agregó un tipo de depósito nuevo dentro de Alcancía → Depositar: elegís la persona (solo aparecen deudores con saldo pendiente) y, si tiene más de un préstamo abierto, a cuál corresponde. En un solo paso: registra el `'abono'` en `d.movimientos[]` del deudor (descontando la deuda) y el depósito en `S.alcancia`, enlazados bidireccionalmente (`_alcanciaMovId` en el abono ↔ `_prestamoMovId`/`_prestamoDeudorId` en el depósito) para poder borrarse desde cualquiera de los dos lados sin dejar huérfanos.

No cuenta como ingreso nuevo (a diferencia de `mandado`/`regalo`/`yo-directo`, que sí usan el truco de ingreso neto-cero): es plata que ya era tuya, solo cambia de "por cobrar" a "guardada" — el préstamo original tampoco se contó como gasto al salir, así que por simetría su regreso tampoco se cuenta como ingreso al volver.

Cambios: `alcancia.js` (nuevo tipo en el selector, selector de persona/grupo, validación de saldo, rama en `alcanciaConfirmarDeposito()`/`alcanciaEliminarDeposito()`, helper `window._alcanciaQuitarPorCobroDeuda()`), `prestado.js` (badge "→ Alcancía" en el historial del deudor, rama en `eliminarMovDeudor()` con guard de carga diferida `_prEnsureAlcancia()` ya que Alcancía es un grupo lazy). Documentado en alcancia.md §3/§4/§5/§7 y prestado.md §2.2/§2.3/§4.1.

**No probado en navegador real** (sin jsdom disponible en este entorno, igual que otros cambios recientes) — validar el flujo completo (registrar, ver el badge, borrar desde cada lado) a mano antes de confiar en él con datos reales.

### ✅ Corregido — `cobro-deuda` creaba un grupo "a favor" en vez de cancelar la deuda existente

Al probar el tipo `cobro-deuda` (ver entrada anterior) en una persona cuyo detalle nunca se había abierto desde que existen los grupos de préstamo (§2.4 de prestado.md), el abono creó un grupo nuevo en blanco ("Préstamo `<fecha>`") con saldo "a favor" en vez de cancelar la deuda real, que quedó huérfana sin grupo. Causa: `alcanciaConfirmarDeposito()` llamaba a `_autoGrupoIdMov(d, fecha)` directo, sin pasar antes por `_migrarGruposDeudor(d)` — el único otro lugar que dispara esa migración es `abrirDeudor()` (Prestado), así que un deudor nunca abierto no tiene `d.grupos`, `_gruposAbiertos()` ve "0 abiertos" y crea uno nuevo ciego a la deuda existente.

Fix: se agregó `_migrarGruposDeudor(d)` antes de cada punto donde se lee o resuelve el grupo del deudor (`_alcDeudorSelActualizar`, la validación de saldo y la creación del abono) — idempotente, no hace nada si ya migró.

**Si ya generaste un grupo corrupto con esta versión con bug:** borrá el depósito (desde Alcancía o desde el historial de la persona en Prestado — revierte ambos lados) y volvé a registrarlo con esta versión corregida; ahora sí va a encontrar y cancelar la deuda existente en vez de crear un grupo aparte.

### ✅ Corregido — `cobro-deuda` desaparecía del desglose de origen de la alcancía

`_alcDesgloseHtml()` (el desglose "de dónde salió esta plata" que se ve en la tarjeta de Alcancía) solo reconocía los tipos `yo-directo`/`yo-cuenta`/`mandado`/`regalo`/`split`. Un depósito `cobro-deuda` no caía en ninguno — no se sumaba mal a "Ahorrado con mi propio dinero" (eso no pasaba), pero sí desaparecía por completo del desglose, aunque su monto sí estuviera en el total (`saldoRegistrado`). Se agregó una categoría propia, "Cobrado de deudas que me tenían".

### ↩️ Revertido — "Cobrado de deudas que me tenían" ya no es una fila separada en el desglose

La entrada anterior le dio a `cobro-deuda` su propia fila en el desglose de origen de Alcancía. A pedido: es plata del usuario, así que debe sumar junto con `yo-directo`/`yo-cuenta` bajo "Ahorrado con mi propio dinero" en vez de mostrarse aparte. Revertido en `_alcDesgloseHtml()`.

### ✅ Corregido (2026-08-28) — `alcanciaConfirmarDestapar()` duplicaba el saldo en patrimonio/tendencia/proyección al destapar

*(reportado por el usuario: después de destapar la alcancía, "Tendencia mensual" y las tarjetas 3m/6m/12m de "Proyección financiera" casi se duplicaron de un momento a otro)*

Diagnóstico: `calcPatrimonioTotal()` (`core-state.js`) suma siempre `S.alcancia.saldoRegistrado` al patrimonio, tapada o destapada — a propósito (ver `changelog/patrimonio-y-calculos-globales.md`, "Health score y Proyección financiera siguen usando `calcPatrimonioTotal()` con la alcancía incluida a propósito"). `alcanciaConfirmarDestapar()` transfiere ese mismo `saldoRegistrado` a la cuenta destino elegida vía `_sumarASaldo()`, pero nunca reseteaba `a.saldoRegistrado` a 0 — ese reset solo ocurría en `alcanciaIniciarNueva()`, una acción aparte que el usuario dispara manualmente después ("Iniciar nueva alcancía"). Mientras la alcancía queda en el estado intermedio `_destapada` sin reiniciar, el monto quedaba contado dos veces: una en la cuenta destino (correcta) y otra en el término `alcancia` de `calcPatrimonioTotal()` (fantasma). Efecto secundario del mismo bug, no reportado pero detectado de paso: el badge `#hero-alcancia-badge` ("hay plata escondida en Alcancía") se hubiera quedado visible para siempre después de destapar, en vez de desaparecer.

Fix: se agregó `a.saldoRegistrado = 0` y `_setSaldoOfuscado(0)` dentro de `alcanciaConfirmarDestapar()`, justo después de aplicar los tres movimientos de transferencia/ajuste y antes de armar el registro de `a.historial` — que ya guarda el valor por separado en `saldoRegistrado: saldoReg` (variable local capturada al inicio de la función), así que el reset no afecta el historial ni el resumen que se le muestra al usuario tras destapar.

### ✅ Corregido (2026-08-30) — "Saldo inicial" de un encargo no se podía eliminar ni corregir

Reportado por el usuario al preguntar si ese ítem debía tener candado (no debía — no es un movimiento espejo de otro módulo). Al investigar, se encontró que directamente **no tenía ninguna forma de borrarse o editarse**: `enc.saldoInicial`/`enc.cuentaInicial` se definen una sola vez al crear el encargo (línea ~699) y no hay ningún flujo de edición posterior. El ítem que lo representa en el historial (`id` fijo `'__saldo_ini__'`, igual en todo encargo, sintetizado solo para mostrarlo) no tenía botón de eliminar porque `deleteMovEncargo()` busca el `movId` dentro de `enc.movimientos` — un array donde ese ítem nunca vivió, así que aunque hubiera tenido botón, no habría encontrado nada que revertir.

Fix: se agregó un botón de eliminar al ítem (mismo estilo que los demás movimientos del encargo) y un caso especial al inicio de `deleteMovEncargo()` para `movId === '__saldo_ini__'`: descuenta `enc.saldoInicial` de `enc.cuentaInicial` (si tenía una cuenta asignada, vía `descontarFuente()`) y resetea ambos campos a su valor vacío. No resuelve la edición (sigue sin poder cambiarse el monto directamente), pero ahora si se cargó mal, se puede borrar y volver a crear el encargo con el valor correcto.

De paso se confirmó que "Proyección financiera" (`renderProyeccion()` en `inicio.js`) no tiene ningún concepto de gastos fijos programados a futuro (ej. un pago puntual como un impuesto de alcaldía): es un modelo puramente retrospectivo que extrapola el promedio de `patrimonioHistorial`. No es un bug — un gasto fijo pendiente que todavía no se pagó no puede reflejarse en la proyección porque no hay ningún día real en el historial que lo muestre; el efecto solo aparecerá naturalmente en la tendencia después de pagarlo.

Validado con `node --check`. **Sin verificar en navegador real** (mismo entorno sin jsdom que los cambios recientes).

---

## Wrapped

### 🔧 Cambio (2026-09-21) — Reordenamiento y limpieza de fechas en wrapped.md

Las secciones de "Decisiones de diseño" numeradas con ordinales latinos (§7bis a §7terdecies) no estaban en orden: §7bis (por qué el overlay vive en `document.body`) aparecía después de §7decies. Se reordenaron numéricamente. Se quitaron las fechas sueltas de los títulos de esas secciones (el contenido y el razonamiento de cada una se mantienen intactos; las fechas no aportaban a entender el diseño actual). Verificado contra `wrapped.js`: las ~50 funciones citadas en la Referencia de implementación existen todas (o, en el caso de `_wrappedRenderAnio`, se confirma que ya no existe — la tabla lo documenta correctamente como reemplazada).
