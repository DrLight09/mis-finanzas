# Módulo Wrapped

Documentación de la sección **Wrapped** ("Tu resumen") de `mis-finanzas`, accesible desde Configuración → Herramientas → Tu resumen. Pensada para volver a leerla en unos meses y entender el módulo sin releer el código. Los detalles de implementación aparecen al final, como referencia rápida.

**Cambio de ubicación (2026-09-12, séptima pasada):** antes vivía en el menú "Más" (`#mas-wrapped`). Se movió a Configuración → Herramientas — mismo lugar y mismo patrón (`data-action="config:irA"`) que ya usa Actividad reciente — junto con el fix del botón Cerrar (ver §7 y `CHANGELOG.md#wrapped`). El resto de este documento ya refleja la ubicación nueva.

Módulo nuevo (2026-09-07). El historial de bugs corregidos (overlay invisible, botón Cerrar rompiendo la navegación) y de ajustes menores del rediseño a formato slide/story (2026-09-12, ver §7) vive en [`CHANGELOG.md`](./CHANGELOG.md#wrapped), no acá.

---

## 1. Objetivo

Da una experiencia de **revelación anual** tipo "Spotify Wrapped": un dato curioso a la vez (tu categoría del año, tu mejor y peor mes, cuánto ahorraste, tu gasto más grande), con una gráfica de patrimonio que se dibuja animada frente a vos cada vez que abrís la pantalla. **No es un dashboard de control** — para chequear "¿voy bien o mal?" en cualquier momento ya existe Análisis financiero. Wrapped a propósito nunca muestra ingresos, gastos totales ni tasa de ahorro en crudo: si lo hiciera, sería un dashboard duplicado, no una sorpresa.

**A propósito es solo anual, no mensual** (decisión tomada tras la primera versión, que sí tenía una vista de mes — ver §7): la especialidad de un "wrapped" depende de que no se vea seguido. Una versión mensual, aunque no mostrara cifras crudas, terminaba compitiendo con "Top categorías" de Análisis financiero, que ya cubre ese chequeo periódico — y aparecer cada mes le quita a Wrapped la sensación de sorpresa que es todo el punto de tenerlo.

---

## 2. Conceptos importantes

El módulo no inventa vocabulario propio — reutiliza los mismos conceptos ya establecidos en Análisis financiero ("gasto real", "ingreso real", ver `analisis-financiero.md` §9bis) y en Alcancía ("ciclo", "racha", ver `alcancia.md`).

---

## 3. Reglas que nunca deben romperse

- **No es una fuente de datos, es una capa de lectura.** El módulo no guarda absolutamente ningún número nuevo en `S`. Todo se recalcula en cada apertura de la pantalla, directamente desde estructuras que ya existen (`S.gastosVar`, `S.movimientos`, `S.alcancia`, `S.patrimonioHistorial`). Si esto cambiara alguna vez a snapshots persistidos, se rompería la premisa de "una sola fuente de verdad por cifra" que ya sostiene el resto de la app.
- **Nunca se muestran ingresos totales, gastos totales o tasa de ahorro en crudo.** Esa es la responsabilidad de Análisis financiero. Esta regla es más angosta de lo que parece a primera lectura — vale la pena ser explícito para que no se malinterprete en una futura revisión: lo prohibido es el **agregado del año/mes completo** (`totalIngresos`, `totalGastos`, `balance` como suma de todo, `tasaAhorro`). Esos tres números se calculan sí, dentro de `_wrappedCalcularPeriodo` — pero únicamente como insumo interno para rankear meses o elegir el tono del copy (§7), **nunca se pintan en ningún slide**, y los tests (`_wrappedBuildSlides`) no los interpolan en ningún HTML.
  Lo que **sí** se muestra como cifra, a propósito, es el monto de cada "dato curioso" individual: cuánto fue tu categoría del año, el balance de tu mejor/peor mes puntual, cuánto costó tu gasto más grande, cuánto guardaste en la Alcancía. Ninguno de esos es "ingresos/gastos totales" ni "tasa de ahorro" — son highlights puntuales, exactamente lo que hace un wrapped de verdad (Spotify Wrapped muestra "escuchaste 400 horas" y "tu canción más repetida sonó 80 veces" — cifras concretas, no un dashboard de streaming). Quitarle el número a esos slides no los volvería "menos dashboard", los volvería inútiles: sin una cifra que revelar no hay nada que animar ni nada que contar. La proporción de una categoría sobre el gasto total y el balance promedio del año sí son ejemplos del otro caso (agregados usados solo para elegir el tono, nunca mostrados — ver §7, "sistema de copy contextual").
- **Nunca se duplica un cálculo que ya existe centralizado en otro lado.** El criterio de "gasto/ingreso real" es exactamente `_esGastoVarNoReal()` / `_esEntradaEspejoNoIngreso()` (Análisis financiero) — nunca un filtro propio. La racha y el mejor ciclo de Alcancía son exactamente `window._alcRachaAhorro()` / `window._alcMejorCiclo()` (expuestas por `alcancia.js` para este uso) — nunca una copia local del mismo cálculo. Esto también aplica al sistema de copy contextual (§7): las funciones `_wrappedCopy*` solo **leen** valores ya calculados por `_wrappedCalcularPeriodo` / `_wrappedMejorPeorMesAnio` / `_wrappedPatrimonioAnio` para elegir qué frase mostrar — ninguna vuelve a calcular un gasto, un ingreso o un balance por su cuenta.
- **El "ingreso" interno de `_wrappedCalcularPeriodo` (usado solo para rankear meses, ver §3 arriba) incluye mesada + ingresos fijos, no solo entradas manuales** (fix 2026-09-13, ver CHANGELOG y el comentario de `_wrappedMesadaMes`/`_wrappedIngresosFijosMes` en el código) — antes de este fix, un mes con mesada activa pero pocas entradas manuales podía mostrarse como "Tu mejor/peor mes" con un balance más negativo del real, en contradicción directa con lo que el usuario ve en Análisis financiero para ese mismo mes. La regla de fondo (nunca duplicar un cálculo centralizado) sigue respetada: como `getMesadaData()`/`_getCuotaAnio()`/`getIngresosFijosMes()` viven en módulos lazy que pueden no estar cargados, se optó por leer `S.mesadas`/`S.ingresosFijos` directo con la misma convención exacta que usa `analisis.js` (clave `"año-mesIdx"` 0-indexada para mesada, `!desde || desde<=mesK` para ingresos fijos) — no una reinterpretación propia de la regla.
- **Solo cubre dinero inequívocamente propio, más — desde 2026-09-13 — los dominios "de terceros" (Mesada, Spotify, Encargos, Préstamos, Plata Comprometida).** Ver §7ter para el razonamiento y las reglas específicas de esos cinco dominios (qué campo de `S` lee cada uno, por qué ninguno duplica un cálculo centralizado, y la simplificación reconocida de Mesada/Spotify). La regla de fondo no cambió: cada número mostrado se recalcula en vivo desde la estructura real del módulo dueño, nunca desde una copia local.
- **Todo texto derivado de un dato del usuario (descripción de un gasto, nombre de categoría) pasa por `escHtml()` antes de interpolarse en cualquier frase** — incluidas las frases del sistema de copy contextual (§7), no solo el HTML de los slides "simples". Un nombre de categoría o una descripción de gasto son datos que el usuario mismo escribió alguna vez; tratarlos como texto plano sin escapar sería el mismo error de XSS que ya se evita en el resto de la app.
- **Si un helper del que depende no está disponible** (por ejemplo, Alcancía todavía no cargó como grupo lazy), el módulo degrada mostrando menos información — nunca rompe la pantalla ni lanza un error visible.

---

## 4. Modelo de datos

Ninguno. El módulo no tiene campos propios en `S` ni estado local — es puramente de lectura, sin nada que recordar entre una apertura y otra.

---

## 5. Flujo

### Abrir la pantalla

```
Configuración → Herramientas → Tu resumen (data-action="config:irA", data-args=["wrapped"])
  ↓
config:irA llama showScreen('wrapped') (mismo handler genérico que usan
Personas y Actividad reciente, configuracion.js)
  ↓
Loader.ensure('wrapped') descarga js/modules/wrapped.js (primera vez)
  ↓
showScreen('wrapped') → renderWrapped()
  ↓
Se calculan en vivo desde S: serie mensual de patrimonio, top categoría,
mejor/peor mes, gasto más grande, ahorro en Alcancía, racha de Alcancía
  ↓
Se arma la lista de slides (uno por cada dato que realmente exista —
nunca un slide vacío) y se pinta el overlay de pantalla completa: barra
de progreso tipo stories + slide 0 activo
  ↓
Al entrar a cada slide: si tiene gráfico, se dispara su animación de
"dibujado"; si tiene un número grande, arranca su conteo ascendente; si
es el slide de cierre, lanza el confeti
```

### Navegar entre slides

```
Tap/click en el tercio izquierdo de la pantalla → slide anterior
Tap/click en el tercio derecho (o el resto) → slide siguiente
Swipe horizontal (móvil) → mismo efecto que el tap, según la dirección
Flecha ← / → del teclado → mismo efecto (solo si la pantalla está
  realmente visible y el foco no está en un campo de texto)
  ↓
En cada cambio: se actualiza la barra de progreso (segmentos ya vistos
quedan llenos), se reinicia el conteo del número grande del nuevo slide,
y si el nuevo slide tiene el gráfico de patrimonio, se dispara su
animación de dibujado
```

### Cerrar la historia

```
Botón ✕ del topbar, o botón "Cerrar" del slide final
  ↓
Se remueve el listener de teclado (evita que quede "colgado" escuchando
flechas en el resto de la app)
  ↓
showScreen('config') — vuelve a Configuración, de donde se entró
```

---

## 6. Casos especiales

- **Sin ninguna categoría, gasto grande, alcancía, racha ni gráfico que contar en el año:** en vez de un carrusel vacío, se arma una sola "historia" con un mensaje neutro ("Todavía no hay suficiente historial este año para contarte algo. Volvé más adelante.") y sin barra de progreso multi-segmento con nada que recorrer — solo el botón de cerrar del topbar.
- **Menos de 2 meses con dato de patrimonio en el año:** no se arma el slide del gráfico — no hay nada que comparar todavía (mismo criterio que la tarjeta de progreso de Alcancía). La serie se recorta desde el primer mes con dato real, nunca desde enero si la app empezó a usarse después.
- **Un mes sin ningún movimiento real** (antes de empezar a usar la app, o un mes futuro dentro del año en curso): no compite como "mejor" ni "peor" mes — solo se consideran meses con al menos un ingreso o gasto real registrado.
- **Alcancía no cargó todavía como módulo:** el slide de racha simplemente no se arma; el resto de la historia funciona igual, porque esos datos ya están en `S` sin importar si `alcancia.js` cargó — es una función de `alcancia.js` (no el dato) lo único que puede faltar.
- **Un ciclo de Alcancía que empezó en un mes y se destapó en otro:** el ciclo completo se cuenta en el período donde se **destapó** (`fechaFin`), nunca se reparte proporcionalmente entre los dos meses — mismo criterio simple que ya usa Alcancía para medir "duración" de un ciclo como un solo bloque.
- **Navegador sin soporte de `SVGGeometryElement.getTotalLength()`** (no debería pasar en un webview moderno): la línea del gráfico se muestra completa de una, sin animar, en vez de romper la pantalla.
- **`prefers-reduced-motion` activado:** los números grandes aparecen directamente en su valor final (sin conteo ascendente) y el confeti del slide de cierre no se dispara. El dibujado de la línea del gráfico no está atado a esta preferencia todavía (queda igual que antes del rediseño a slides) — posible mejora futura, ver §7.
- **Reabrir la pantalla varias veces en la misma sesión:** cada apertura reemplaza por completo el estado de navegación anterior (slides, posición actual, listener de teclado) — no queda ningún listener duplicado escuchando flechas de teclado de una apertura previa.
- **Salir de la pantalla sin tocar el botón Cerrar** (por ejemplo, navegando directo a otra sección desde fuera de Wrapped, si el shell de la app lo permitiera): el listener de teclado queda con un guard de visibilidad real (chequea `display:none` en toda la cadena de ancestros, no `offsetParent` — que siempre es `null` en un elemento `position:fixed` como este overlay) y deja de reaccionar a flechas apenas la pantalla deja de estar visible, aunque técnicamente el DOM del overlay siga existiendo hasta la próxima apertura.
- **Un gasto sin `monto` numérico válido** (registro corrupto o de una versión muy vieja de la app): el slide correspondiente igual se arma, mostrando `$0` en vez de romper el conteo animado con `NaN` — ver `_wrappedSlideBignum`, coerción defensiva con `Number.isFinite`.
- **Una fecha que no sea string** (número, `Date`, `null` con forma rara — dato corrupto): `_wrappedEnRango` la descarta con un guard de tipo explícito en vez de arriesgarse a que `.slice()` rompa el cálculo de todo el período por un solo registro.
- **Mejor o peor mes empatado entre dos o más meses:** en vez de elegir uno arbitrariamente sin decirlo, el copy lo nombra explícitamente ("empatado con otro mes — los dos fueron tu mejor resultado del año"). `_wrappedMejorPeorMesAnio` detecta el empate comparando el balance extremo contra todos los meses candidatos, no solo asumiendo que el `reduce()` encontró un único ganador.
- **La categoría que más plata consumió no es la misma que más veces se repitió** (ej. una compra grande vs. muchas compras chicas): el copy de esa categoría menciona el contraste en vez de mostrar solo una dimensión — ver `_wrappedTopCategoriaDe` en §7.
- **Menos de 6 meses transcurridos del año:** no se arma el slide de "cambio de hábitos" entre la primera y la segunda mitad del año — no hay dos mitades reales que comparar todavía.
- **Ninguna categoría fue realmente dominante en alguna de las dos mitades del año** (gasto muy repartido entre varias categorías parejas): tampoco se arma ese slide, aunque técnicamente la categoría líder de cada mitad haya sido distinta — mostrarlo igual sería forzar una "historia" donde en realidad no hubo un cambio real, solo ruido estadístico.

### Verificado (2026-09-12) contra el código real de Alcancía

- **Posible doble conteo de Alcancía — confirmado y corregido.** `S.alcancia.movimientos[]` **no se limpia al destapar** — solo se limpia cuando el usuario elige explícitamente "Iniciar nueva alcancía" (`alcanciaIniciarNueva()`, `alcancia.js`). Mientras tanto, la alcancía queda en estado "fantasma" (`a._destapada === true`, ver `alcancia.md` §2/§6) con los depósitos del ciclo ya cerrado todavía presentes en `movimientos[]` — y ese mismo ciclo ya quedó copiado en `historial[]` al destapar. `_wrappedCalcularPeriodo` ahora solo suma `a.movimientos` cuando `!a._destapada` (ciclo genuinamente activo); mientras está en estado fantasma, esa plata ya se cuenta una sola vez, vía `historial`.
- **La racha de Alcancía queda verificada, no solo asumida.** `_alcRachaAhorro(hist)` (real, en `alcancia.js`) efectivamente significa "ciclos consecutivos, contando desde el más reciente hacia atrás, que ahorraron más que el inmediatamente anterior" — exactamente lo que este módulo ya asumía al mostrar "racha ≥ 2 = alcancías seguidas, cada una ahorrando más que la anterior".

---

## 7. Decisiones de diseño

- **¿Por qué no es un módulo de datos, solo de presentación?** Porque no hay ningún dato nuevo que capturar — todo lo que necesita ya lo registra otra pantalla. Convertirlo en una capa de lectura pura evita el riesgo de que dos números (el "real" en Análisis y el "cacheado" en Wrapped) se desincronicen con el tiempo.
- **¿Por qué se incluyen Mesada, Spotify, Encargos, Préstamos y Plata Comprometida (2026-09-13), después de haberlos excluido a propósito en la versión anterior?** Decisión de producto explícita, no una reconsideración técnica — ver §7ter para el detalle completo de qué se agregó y cómo. La razón original (mezclar plata ajena distorsiona "tu" desempeño financiero) sigue siendo válida como argumento, pero se decidió que el valor de contar la historia completa del año ("cuidaste la plata de alguien", "le prestaste a Juan", "no fallaste ni un mes de mesada") pesa más que el riesgo de esa distorsión — sobre todo porque cada uno de estos dominios se muestra en su propio slide, con su propia etiqueta clara ("Plata que te encargaron cuidar", no "Ingresos"), nunca mezclado o sumado con las cifras de plata propia del resto de la historia.
- **¿Por qué el año usa siempre el año calendario en curso (y no un selector de año)?** Para la primera versión, mantenerlo simple. Si con el tiempo se necesita revisar años anteriores, es una extensión natural (agregar navegación ± como ya tiene Mesada) sin cambiar la arquitectura de cálculo.
- **¿Por qué se sacaron los ingresos/gastos/tasa de ahorro que la primera versión sí mostraba?** La primera versión terminó siendo, sin querer, un mini-Análisis financiero — mismos números, distinta pantalla. Eso no aporta nada nuevo y compite por atención con la pantalla que ya hace ese trabajo bien. La versión actual solo muestra lo que funciona como "dato curioso" (categoría, mejor/peor mes, gasto más grande, Alcancía, la curva de patrimonio) — cosas que uno no está chequeando todos los días, y que tienen más sentido como sorpresa puntual que como número de control.
- **¿Por qué se sacó la vista mensual y se dejó solo la anual?** La primera versión tenía dos pestañas, mes y año. Aun después de sacarle los números crudos, la vista mensual seguía compitiendo con "Top categorías" de Análisis financiero — un mes es una ventana demasiado corta para sentirse como una revelación de verdad, y verla todos los meses le quitaba a Wrapped la sensación de sorpresa que es la razón de que exista. Se dejó solo la vista anual, que sí tiene suficiente distancia temporal para sentirse como un evento, no como un chequeo de rutina.
- **¿Por qué se pasó de una sola pantalla con tarjetas apiladas a un formato de slides tipo "historias" (2026-09-12)?** Era el punto abierto que había quedado documentado en esta misma sección: la versión de scroll mostraba todos los datos curiosos juntos, uno debajo del otro — técnicamente ya no eran cifras de dashboard, pero se leían todas de un vistazo, sin la sensación de revelación escalonada que sí logra Spotify Wrapped mostrando una cosa a la vez. El formato de historias (una pantalla completa por dato, avanzando con tap/swipe/flechas, con barra de progreso arriba) fuerza esa cadencia de "una revelación, después la siguiente" sin agregar ningún dato nuevo ni tocar ninguna de las reglas de §3 — es un cambio de presentación puro sobre exactamente los mismos cálculos.
- **¿Por qué tap/swipe/flechas y no también scroll con la rueda del mouse?** Se evaluó (algunos wrapped de referencia lo incluyen), pero un listener de `wheel` sobre una pantalla completa es fácil de disparar sin querer (scroll normal de la página, trackpads sensibles) y hubiera necesitado su propio debounce. Como esta es una app pensada mobile-first, tap y swipe cubren el caso real de uso; las flechas de teclado quedan como alternativa para cuando se abre desde un navegador de escritorio.
- **¿Por qué el conteo ascendente de los números grandes y no que aparezcan ya escritos?** Es el mismo truco que usa Spotify Wrapped para que una cifra se sienta "revelada" en vez de simplemente mostrada — ver el número subir hasta su valor final da una sensación de expectativa que un texto estático no da. Se implementó con un `requestAnimationFrame` simple con *easing* (sin librerías), y se apaga por completo con `prefers-reduced-motion`.
- **¿Por qué confeti de CSS en vez de un canvas de partículas?** Un motor de partículas en `<canvas>` (como el de la referencia de diseño que inspiró este rediseño) es más vistoso pero agrega bastante código para un único momento (el cierre de la historia). Un puñado de elementos con una animación CSS de caída logra el mismo efecto de celebración con una fracción del código, sin dependencias, y se apaga igual de fácil con `prefers-reduced-motion`.
- **¿Por qué no se incluyó el clasificador de "personalidad financiera" ni la exportación de tarjeta para compartir (imagen descargable) que sí tenía la referencia de diseño explorada para este rediseño?** Se descartaron los dos a propósito: un puntaje o "personalidad" calculado sobre el año es una interpretación nueva que no existe hoy en ningún otro lado de la app y que no se documentó como parte de este módulo — agregarla sería una decisión de producto aparte, no una consecuencia natural de cambiar el formato de presentación. La tarjeta para compartir como imagen es una superficie nueva (requiere `<canvas>`, generación de imagen, UI de descarga) que no estaba en el alcance pedido de "mismo formato de interacción, mismo diseño ya establecido". Si se quieren en el futuro, son extensiones aisladas sobre este mismo motor de slides, no requieren rehacer nada de lo ya construido.
- **¿Por qué sí se agregó un sistema de copy contextual, después de haber descartado un "banco de frases" en la primera pasada de este rediseño?** Se revisó esa decisión tras una segunda revisión que señaló, con razón, que sin ninguna variación la historia de un año "parejo" se lee idéntica a la de un año con un quiebre fuerte — el problema real no era "que se repita entre años" (eso sigue sin ser un problema real, todavía no hay más de un año de historia), sino que **ninguna frase reflejaba lo que realmente había pasado**. La solución no fue el banco de frases grande con selección al azar que se había descartado, sino algo más chico: 2-4 variantes fijas por dato, elegidas de forma **determinista** según una señal derivada de los mismos cálculos que ya existían (qué tan grande fue el cambio de patrimonio en %, qué tan dominante fue la categoría, cuánto se alejó el mejor/peor mes del promedio del propio usuario — nunca umbrales fijos en pesos, que no tendrían sentido entre usuarios con ingresos distintos). Ver `_wrappedCopyPatrimonio`, `_wrappedCopyCategoria`, `_wrappedCopyMejorMes`/`_wrappedCopyPeorMes`, `_wrappedCopyAlcancia`, `_wrappedCopyRacha` y `_wrappedCopyCierre` en §8. Ninguna de estas funciones calcula nada nuevo — todas leen valores que `_wrappedCalcularPeriodo` / `_wrappedMejorPeorMesAnio` / `_wrappedPatrimonioAnio` ya calculaban antes, cumpliendo la regla de §3 de no duplicar fuentes de verdad.
- **¿Por qué se agregó un "banco de frases" dentro de cada rama existente (2026-09-14), si §7 ya había descartado explícitamente un banco de frases grande con selección al azar?** No contradice esa decisión — la completa. Lo que se descartó entonces fue reemplazar la selección **por señal real** (qué tan grande fue el cambio de patrimonio, qué tan dominante fue la categoría) por un sorteo — esa selección sigue exactamente igual, cada rama (leve/fuerte/extremo, etc.) se sigue eligiendo solo por el dato real, nunca al azar. El problema que quedaba sin resolver era otro: **dentro de una misma rama**, la frase era una única oración fija — un año con +60% de patrimonio siempre mostraba la palabra por palabra idéntica, año tras año. Ahora cada rama tiene 2-4 formas de decir lo mismo (`_wrappedBankPick`, ver §8) y se elige una de forma determinista a partir de una semilla armada con los mismos totales internos que ya usa el resto del sistema de copy (nunca un `Math.random()` suelto, que sí rompería la regla de "sin estado nuevo" de §3 si alguna vez hiciera falta reproducir el mismo resumen — por ejemplo, al generar una tarjeta para compartir). Mismos datos → misma frase (abrir Wrapped dos veces con el mismo año no se siente "random" ni con bugs); otro año o otro usuario → frase distinta.
- **¿Por qué el cierre de la historia se arma con "señales con prioridad" en vez de resumir todo lo que pasó?** Porque un cierre que intenta mencionar todo se vuelve una lista, no una frase memorable — que es justamente lo que se le pedía a este slide. `_wrappedCopyCierre` evalúa, en orden, si hubo un crecimiento de patrimonio muy fuerte, una racha larga de Alcancía, una caída de patrimonio fuerte, un ahorro en Alcancía mayor al gasto más grande del año, o una categoría muy dominante — y se queda con la primera señal que aplica, porque es la más "noticiable" de las que realmente pasaron. Si no aplica ninguna, cae a la frase genérica original.
- **¿Por qué un año financieramente difícil (patrimonio a la baja, o incluso el mejor mes con balance negativo) nunca se cuenta con un tono de reproche?** Aunque Wrapped es un espacio de uso 100% personal, el criterio se mantiene igual que en cualquier otro contexto de la app que toca dinero de verdad: los textos para un año/mes flojo están redactados en tono neutro o de sostén ("no fue el año de acumular, fue el año de sostener — y eso también cuenta", "el menos difícil de todos — que también cuenta"), nunca como una evaluación de si "gastaste bien o mal". Un resumen anual no es el lugar para generar culpa por un número que ya pasó.
- **¿Por qué el slide de Alcancía a veces menciona el gasto más grande del año ("eso es más de lo que gastaste en...")?** Es una conexión narrativa entre dos slides que antes vivían aislados el uno del otro (dos cifras sueltas, sin relación entre sí) — comparar el ahorro de Alcancía contra la escala real del propio gasto más grande del usuario lo hace instantáneamente entendible sin necesitar ningún número de referencia externo (como un ingreso mensual) que Wrapped tiene prohibido mostrar. Mismo criterio se usa en el cierre cuando esa comparación es la señal más "noticiable" del año.
- **¿Por qué el `<path>` del gráfico pasó de tener un `id` fijo (`wrappedLinePath`) a una clase (`wrapped-line-path`)?** Con un solo slide de gráfico por historia no había ambigüedad práctica, pero un `id` duplicado en el DOM es frágil por definición — cualquier extensión futura que llegara a necesitar más de un gráfico en la misma pantalla (por ejemplo, si algún día se agrega navegación por años) rompería silenciosamente `getElementById`. La clase, buscada dentro del slide activo (`slideEl.querySelector('.wrapped-line-path')`) en vez de en todo el documento, es la misma robustez a costo cero hoy.
- **¿Por qué la gráfica de patrimonio se anima "dibujándose" en vez de aparecer completa?** Es la pieza central de la revelación: ver la curva subir o bajar mes a mes, en vivo, comunica la historia del año de una forma que un número estático no logra — mismo efecto que persigue Spotify Wrapped al revelar cifras una por una. Técnicamente se logra con la técnica estándar de `stroke-dasharray`/`stroke-dashoffset` sobre un `<path>` SVG (sin librerías), animada en JS al entrar al slide que la contiene — no se intentó con CSS puro porque la longitud del trazo depende de los datos de cada usuario y no se puede fijar de antemano en una hoja de estilos.
- **¿Por qué la animación se dispara cada vez que se abre la pantalla, y no solo "la primera vez de verdad"?** Habría requerido guardar un flag persistido de "ya viste el wrapped de este año", agregando un dato nuevo a `S` y una decisión de cuándo resetearlo. Se prefirió que la revelación se pueda "re-vivir" cada vez que se entra a la pantalla — mismo comportamiento que tiene Spotify Wrapped al reabrirlo desde el perfil, no solo la primera vez que salió. El slide de cierre además ofrece un botón explícito "Ver de nuevo" para relanzar la historia sin tener que salir y volver a entrar. Si en el futuro se quiere una versión "solo una vez", es una extensión aislada (un campo tipo `_wrappedVistoEn` en algún lado), no un cambio de arquitectura.
- **¿Por qué el botón Cerrar navega a `showScreen('config')` en vez de simplemente ocultar el overlay?** Wrapped se entra siempre desde Configuración → Herramientas (nunca hay otra forma de llegar), así que volver ahí es el único destino que tiene sentido — evita dejar al usuario "flotando" en una pantalla sin contenido si el overlay se ocultara sin más.
  **Historial del bug (2026-09-12, séptima pasada):** esto originalmente llamaba `showScreen('mas')`, asumiendo sin verificar que el id de pantalla del menú "Más" era exactamente `'mas'` (por coherencia con `data-screen="wrapped"` en sus ítems, sin haber tenido acceso a `sheet-stack.js`/`index.html` para confirmarlo). Ese id nunca existió — el menú "Más" es el overlay `#mas-menu`, no una `.screen` — así que `showScreen('mas')` reventaba con `TypeError` justo después de sacarle `active` a todas las pantallas, dejando la app entera en negro al cerrar Wrapped (ver `CHANGELOG.md#wrapped`). El fix no fue solo cambiar el string: se movió el punto de entrada real de Wrapped del menú "Más" a Configuración → Herramientas (mismo patrón que ya usaba Actividad reciente), así que `showScreen('config')` ya no es una suposición — es exactamente la pantalla de la que se entra ahora, y queda fácil de verificar a simple vista en `index.html`.
- **¿Por qué "racha" de Alcancía se lee de `window._alcRachaAhorro` en vez de recalcularse acá?** Para no tener dos fuentes de la misma cifra. El costo es una dependencia cruzada entre dos módulos lazy independientes, mitigada con un guard `typeof` — si Alcancía no cargó, esa cifra puntual no se muestra, en vez de duplicar su lógica solo para evitar el guard. (`window._alcMejorCiclo` también quedó expuesta por `alcancia.js` para el mismo propósito, pero Wrapped no la usa hoy — su propio "mejor mes" sale de `_wrappedMejorPeorMesAnio`, un concepto distinto al "mejor ciclo" de Alcancía). **Verificado 2026-09-12** contra `alcancia.js`: la función real efectivamente cuenta "ciclos consecutivos desde el más reciente que ahorraron más que el inmediatamente anterior" — coincide con lo que este módulo ya asumía.
- **¿Por qué el módulo no persiste snapshots anuales ya cerrados?** Se evaluó guardar un "wrapped" congelado al cerrar el año (como si fuera un log), pero se descartó: agrega un modelo de datos nuevo, una migración, y un caso más de "¿qué pasa si el criterio de gasto real cambia después?" (un snapshot viejo quedaría con el criterio de aquel momento, generando inconsistencias con el resto de la app). Calcular siempre en vivo evita todo eso a costa de no poder navegar años pasados todavía — ver punto anterior sobre el selector de año.
- **¿Qué tan lejos se llevó el "motor de historias" en esta pasada (2026-09-12), y qué se dejó afuera a propósito?** Una revisión externa señaló, con razón, que el módulo respondía "¿qué estadísticas tengo disponibles?" en vez de "¿qué fue lo más interesante que pasó este año?" — la lista fija de slides (categoría, mejor mes, peor mes, gasto más grande...) se sentía predecible, casi Análisis financiero convertido en pantalla completa. Se agregaron las comparaciones que se pueden calcular **con seguridad** a partir de un solo año de historia, sin inventar un umbral estadístico:
  - **Empates** en mejor/peor mes, nombrados en vez de resueltos en silencio (`empateMejor`/`empatePeor`).
  - **Dos dimensiones de categoría** (monto vs. frecuencia — una compra grande y veinte compras chicas ya no "ganan" la categoría de la misma forma sin que se note, ver `_wrappedTopCategoriaDe`).
  - **Contexto del gasto más grande** (en qué mes fue, qué tan grande fue *en relación al propio gasto típico del usuario*, ver `_wrappedCopyGasto`).
  - **Cambio de hábitos entre la primera y la segunda mitad del año** (`_wrappedCambioDeHabitos`) — la única comparación tipo "empezaste haciendo X, terminaste haciendo Y" que se agregó.

  Deliberadamente **no** se implementó nada de lo siguiente, todo pedido por la misma revisión:
  - **Detección de "el día que rompió tu patrón"** (anomalías a nivel de gasto diario). Requiere un modelo estadístico real (umbrales, desviación respecto a un promedio con suficientes datos) para no señalar como "raro" un gasto que en realidad es normal para este usuario — con un año de historia, el riesgo de una falsa alarma es alto, y una falsa alarma en un resumen anual (¿"tu gasto más raro" resulta ser una emergencia médica?) es peor que no tener esa historia. Si se hace, merece su propia pasada con datos reales para calibrar, no algo improvisado en esta.
  - **"Categoría que más creció" o "categoría más inesperada"** — ambas necesitan un punto de comparación de **otro año** para significar algo ("creció respecto a qué"). Con un solo año de historial real, cualquier respuesta sería inventada. Extensión natural una vez exista un segundo año.
  - **"Tu mejor mes coincidió con..."** (relacionar el mes con algo externo) — no hay ningún dato de contexto de vida (calendario, eventos) en `S` para relacionar; inventar la relación sin ese dato sería una historia falsa, no una encontrada.
  - **Clasificador de "personalidad financiera"** ("este año tu dinero tuvo una obsesión...") — sigue fuera de alcance, misma razón que ya estaba documentada más arriba en esta sección: es una interpretación de producto nueva, no una consecuencia de mejorar el copy existente.
  
  El criterio general para decidir qué entraba y qué no: una comparación entra si se puede calcular de forma determinista, con los datos que ya existen, sin necesitar más historial del que hay, y sin riesgo de "inventar" una historia que en realidad no está en los datos. Todo lo que no cumplía ese criterio quedó afuera con su razón documentada acá, no simplemente descartado en silencio.
- **¿Por qué el slide de intro cambió (2026-09-12)?** Mostraba el año dos veces (una como subtítulo chico, otra como número grande) y cerraba con "nada que ya no supieras" — una frase que mata la expectativa que el resto de la pantalla se esfuerza en construir. Se simplificó a un solo texto por elemento, sin duplicar el año, con un tono que invita a mirar en vez de restarle interés a lo que sigue.
- **¿Por qué `_wrappedMejorPeorMesAnio` y `_wrappedSerieMensualAnio` unificaron su fuente de "hoy" (2026-09-12)?** Antes ambas llamaban a `new Date()` directamente en vez de pasar por `_wrappedHoy()` (que sí respeta el global `hoy()` de la app cuando existe) — en producción nunca generaba una diferencia real porque `_wrappedHoy()` también cae a `new Date()` como último recurso, pero sí era una inconsistencia interna innecesaria, y en tests hacía que mockear `hoy()` no alcanzara para controlar de verdad qué mes se toma como "el actual" en esas dos funciones (confirmado con un test que mockea `hoy()` a marzo y verifica que un balance de agosto artificialmente alto no se "vea"). Se centralizó en `_wrappedAnioYMesActual()`.
- **¿Por qué la serie mensual de patrimonio puede mostrar "Enero" con un valor que en realidad viene de diciembre del año anterior?** Es intencional, no un bug: cuando enero no tuvo ningún snapshot propio, el forward-fill hereda el último valor conocido de antes de que empezara el año — la alternativa (dejar un hueco al principio del gráfico) se ve peor y no aporta nada, ya que el patrimonio "no dejó de existir" solo porque no hubo un guardado ese mes puntual. Vale la pena tenerlo presente al leer la curva: el primer punto representa "lo último que se sabía a esa altura", no necesariamente "una medición hecha en ese mes exacto" — mismo principio de continuidad que ya usa `snapshotPatrimonio()` en el resto de la app (analisis-financiero.md §5).

## 7bis. Por qué el overlay vive en `document.body` y no en `#screen-wrapped`

Hasta el 2026-09-12 (sexta pasada) `renderWrapped()` insertaba `#wrapped-overlay` dentro de `#wrapped-body`, adentro de `#screen-wrapped`. En navegador real esto dejaba la pantalla casi vacía: solo se veían la barra de progreso y la X.

La causa vive en `styles.css`, no en `wrapped.js`: `.screen.active` tiene una animación (`animation:...both`) que anima `transform:translateY(...)` y, por `fill-mode:both`, deja ese `transform:translateY(0)` aplicado para siempre una vez termina. Cualquier `transform` en un ancestro —así sea `translateY(0)`, visualmente idéntico a no tener transform— convierte a ese ancestro en el *containing block* de sus descendientes `position:fixed`. `#wrapped-overlay{position:fixed;inset:0}` dejó de anclarse al viewport y pasó a anclarse a `#screen-wrapped.active`, que vive dentro de `.scroll-area` (un bloque normal, sin alto propio) y no se estira para acomodar a un hijo `position:fixed` — así que terminaba con un alto casi nulo. Los únicos hijos que igual se veían eran los `flex-shrink:0` (`#wrapped-progress`, `#wrapped-topbar`), que se niegan a encogerse por debajo de su tamaño de contenido.

La solución no fue tocar `styles.css` (esa animación puede ser intencional en otras pantallas, y hay una regla duplicada de dos sesiones distintas — `screenIn`/`dashboardIn` — que merece su propia limpieza aparte, no forzada por este bug). En vez de eso, `#wrapped-overlay` se crea con JS y se cuelga directo de `document.body`, saliendo por completo del árbol de `.screen` — mismo patrón que ya usa `#toast-container` para lo mismo. `#wrapped-body` quedó vestigial.

**Riesgo abierto:** cualquier otro módulo que en el futuro inyecte un overlay `position:fixed` dentro de un `.screen` va a pisar el mismo problema. No se auditaron los demás módulos lazy para confirmar si alguno ya lo tiene.

---

## 7ter. Dominios "de terceros" agregados

Agrega cinco slides nuevos, cada uno condicionado a que su módulo dueño tenga datos ese año — igual que ya funciona `s.alcanciaPeriodo > 0` para Alcancía. Ninguno guarda nada nuevo en `S`, ninguno duplica un cálculo centralizado si existe uno (ver regla de §3), y todos resuelven nombres de persona vía `getPersonaNombre` (personas.md §2) con fallback al nombre crudo del propio registro.

| Dominio | Lee de | Qué muestra | Función |
|---|---|---|---|
| Encargos | `S.encargos[].movimientos` (`tipo:'entrada'`) | Total que te encargaron cuidar en el período, sobre todos los encargos, cuántas personas distintas y cuál fue el mayor | `_wrappedCalcularEncargos` |
| Prestado — Me deben | `S.deudores[].movimientos` (`tipo:'prestamo'`/`'abono'`/`'pago-completo'`) | Cuánto prestaste y cuánto te devolvieron en el período; quién recibió más de vos ese período (no la deuda total pendiente, que puede venir de antes) | `_wrappedCalcularPrestado` |
| Prestado — Yo debo | `S.misDeudas[].movimientos` (`tipo:'recibido'`/`'pago'`) | Cuánto te prestaron y cuánto pagaste en el período | `_wrappedCalcularMisDeudas` |
| Mesada | `S.mesadas.{papa,mama}.pagos` | Total recibido de papá + mamá en el período | `_wrappedCalcularMesada` |
| Spotify | `S.spotifyHistorial` (`tipo:'cobro'`/`'pago'`) | Cobrado menos pagado en el período | `_wrappedCalcularSpotify` |
| Plata Comprometida | `S.plataCometida[]` (`recibido:true`, filtrado por `fechaRecibido`) | Total que estabas esperando y llegó en el período | `_wrappedCalcularComprometida` |
| Tarjetas de crédito — Intereses | `S.tarjetasCredito[].compras[]` (`_esCargoEspecial:true`, `_motivoCargo:'interes'`) | Total de intereses cobrados por el banco en el período, y qué tarjeta se llevó la mayor parte | `_wrappedCalcularInteresesTC` |
| Tarjetas de crédito — Comisiones | Igual que arriba, `_motivoCargo:'comision'` | Total de comisiones cobradas por el banco en el período (candidato aparte de Intereses — ver nota abajo) | `_wrappedCalcularComisionesTC` |

**Por qué Tarjetas de crédito son dos slides candidatos y no uno solo:** `tarjetas_credito.js` distingue tres motivos de cargo especial (`TC_MOTIVOS_CARGO`: interés, comisión, "otro"). El texto del slide de intereses ("plata que el banco se llevó por esperar a que pagaras") describe algo específico de deuda que no es cierto para una comisión — sumarlos bajo una sola cifra sería honesto en el número pero deshonesto en el copy, así que cada uno tiene su propia función de cálculo y su propio texto (`_wrappedCopyInteresesTC` / `_wrappedCopyComisionesTC`), y compiten por separado en el pool de insights (§7novies) con intensidad distinta (3 vs 2 — una comisión suele ser más chica y más "esperable" que pagar intereses). El tercer motivo, `'otro'`, se dejó afuera a propósito: es un cajón de sastre genérico en el propio módulo dueño ("Otro cargo del banco") — sin saber qué fue realmente, cualquier frase que Wrapped le pusiera encima sería inventada, y eso rompe la regla de §3 de no forzar un insight sin una señal real. Igual que el resto de §7ter, deliberadamente NO se toca `tc.deuda` (saldo actual, puede venir de años anteriores) ni las compras normales (ya cuentan, con otro lente, en gastos/categorías — sumarlas de nuevo sería contar la misma plata dos veces).

**Por qué el nombre del campo es `S.plataCometida` y no `S.plataComprometida`:** es el nombre real que ya usa `plata_comprometida.js` (ver `plata-comprometida.md §4`) — un typo histórico del propio módulo dueño, no un error de este archivo. Wrapped lee el campo tal cual existe, nunca "corrige" el nombre de un dato que no le pertenece.

**Por qué Mesada y Spotify tienen una simplificación reconocida (y no una cifra 100% exacta):**
- **Mesada** suma el campo `monto` (total recibido a la fecha, ver mesada.md §4) de cada `pago` filtrando por su `fecha` — que es la fecha del **último** abono si hubo pago parcial, no necesariamente la del mes que ese registro representa. Un mes de diciembre saldado ya en enero del año siguiente movería ese monto al año del abono. Aceptado a propósito: es la misma clase de aproximación que ya reconocía `_wrappedCalcularPeriodo` para el resto de la app (§3), y el caso real (deuda de mesada cruzando el límite del año) es infrecuente.
- **Spotify** muestra "cobrado − pagado" del período, no la "Ganancia acumulada" oficial del módulo (spotify.md §7), que además suma `cuotaAdmin × ciclos pagados` — un ajuste calculado **inline** dentro de `spotify.js`, sin una función central reexportada para este archivo. Duplicar esa fórmula acá violaría la regla de §3 de no recalcular algo que ya vive centralizado en otro módulo; como no hay nada centralizado que llamar, se optó por una cifra más simple y explícitamente rotulada como tal en el comentario de `_wrappedCalcularSpotify`, en vez de reconstruir la lógica completa de `cuotaAdmin` fuera de su dueño.

**Por qué Encargos y Prestado sí pueden mostrar un número exacto sin esta salvedad:** ambos sólo suman movimientos ya filtrados por `tipo` y `fecha` — no hay una fórmula derivada (como `cuotaAdmin`) que vivir fuera de su función. `encargoSaldo`/`getDeudorSaldo` (los cálculos SÍ centralizados de esos módulos) no se usan acá a propósito porque responden una pregunta distinta ("cuánto queda hoy", no "cuánto entró este año") — no es una duplicación evitada, es una pregunta distinta desde el origen.

**Por qué el deudor/encargo "destacado" de cada slide se elige por actividad del período, no por saldo total:** una persona puede deberte mucho de un préstamo de 2024 y no haber recibido nada nuevo este año — mostrarla como "protagonista" del año sería contar una historia que no pasó en el período que Wrapped está resumiendo.

## 7cuater. Personalidad financiera, Gasto más random, Tus protagonistas

Reabre la decisión de §7 sobre **personalidad financiera** — decisión de producto explícita del usuario, no una reconsideración técnica (el argumento original, "es una interpretación de producto nueva", seguía siendo válido; se decidió que valía la pena de todos modos). **Share cards** y **vista mensual** siguen sin implementarse — quedan en el backlog de una próxima tanda, no se tocaron acá.

| Slide | Lee de | Qué hace | Función |
|---|---|---|---|
| Personalidad financiera | Señales ya calculadas por otras funciones de este archivo (nunca un cálculo nuevo) | Clasificación **lúdica** (nunca un puntaje financiero serio), un tipo entre 6, elegido por reglas deterministas en orden de más específico a más genérico; devuelve `null` si ninguna aplica con claridad — nunca fuerza una | `_wrappedPersonalidad` |
| Gasto más random | `S.gastosVar` filtrado por `_esGastoVarNoReal()` (mismo filtro que el resto del archivo) | El gasto con descripción única en el período (`frecuencia===1`) que más se aleja del propio promedio del usuario (z-score, nunca un umbral fijo en pesos) — nunca el mismo gasto que ya ganó "Tu gasto más grande" | `_wrappedGastoMasRandom` |
| Tus protagonistas | `S.encargos`, `S.deudores`, `S.misDeudas`, `S.spotifyHistorial` | Con quién tuviste más **movimientos** (interacción, no plata) sumando los 4 módulos que involucran personas — solo se muestra con 3+ movimientos, para no destacar a alguien con una sola transacción suelta | `_wrappedProtagonistas` |

**Por qué la Personalidad no es un promedio ponderado ni un puntaje:** el propio pedido original (§10) es explícito en que debe sentirse "claramente lúdica", no una evaluación financiera profesional. Un sistema de puntaje ponderado se sentiría más serio y "oficial" de lo que se pidió — por eso son reglas de prioridad simple (si aplica la primera, se detiene ahí), no un score acumulado entre las 6.

**Descubrimiento de datos reales que afecta a TODO este archivo, no solo a esta tanda:** el modelo documentado en `cuentas.md §4` dice que las cajitas viven en `S.nu.cajitas[]`. Verificado contra el código fuente real de `cuentas.js` (2026-09-13, no solo un JSON de ejemplo): las más de 30 referencias a cajitas en ese archivo usan `S.cajitas` directo, ninguna usa `S.nu`. **`cuentas.md §4` está desactualizado, no es un caso de "formato viejo en backups antiguos"** — el contenedor `S.nu` nunca existió en el código real. `_wrappedListaCajitas(S)` prueba `S.cajitas` primero y cae a `S.nu.cajitas` solo como fallback inofensivo por si el doc alguna vez tuvo razón para alguna versión no vista. Vale la pena que alguien corrija `cuentas.md §4` directamente — no es tarea de este archivo arreglar la documentación de otro módulo, pero quedó registrado acá porque fue este análisis el que lo encontró.

**Por qué "Tus protagonistas" cuenta movimientos y no plata:** ya existen slides que cuentan plata por persona ("le prestaste más a...", "la mayor parte te la encargó..." — ver §7ter). Contar otra vez por plata sería el mismo dato con otro nombre; contar por **cantidad de interacciones** responde una pregunta genuinamente distinta ("con quién tuviste más idas y vueltas", no "con quién moviste más dinero").

## 7quinquies. Meta de ahorro de cajita

Reutiliza `calcMetaProgreso(c)` — **ya centralizada en `cuentas.js`** (calcula `pct`, `esperadoHoy`, `diferencia`, `falta`) — en vez de recalcular el progreso de una meta por su cuenta, que hubiera violado la regla de §3. Como esa función depende de toda la cadena de cálculo de Cuentas (`calcC`, `_saldoEncargosEnCajita`, tramos de tasa), se llama envuelta en `try/catch`: si esa cadena no cargó o cambia de forma en el futuro, el slide de meta simplemente no aparece, no rompe el resto de la historia.

Elige la cajita con **mayor `pct`** entre las que tienen `meta` configurada — no la de mayor objetivo en pesos. La pregunta que responde este slide es "¿de cuál meta estuviste más cerca este año?", no "¿cuál era tu meta más ambiciosa?" — esa segunda pregunta se podría agregar como otro slide distinto más adelante si hace falta, no reemplaza a esta.

| Función | Qué hace |
|---|---|
| `_wrappedMetaCajita(S)` | Busca la cajita con meta y mayor `pct` de avance, vía `calcMetaProgreso` |
| `_wrappedCopyMeta(m)` | Copy según `pct`/`diferencia` (cumplida, adelantada, atrasada, en ritmo) |

**Nota técnica:** este slide es el primero que muestra un valor que NO es plata en el "bignum" grande (un porcentaje). Se agregó `opts.sufijo` a `_wrappedSlideBignum`/`_wrappedAnimarNumeros` — con sufijo, el contador anima un número plano con ese sufijo (`"62%"`) en vez de pasarlo por `fmt2` (que siempre antepone `$`). Es la única excepción al formato moneda de todo el archivo, y está aislada a este caso.

## 7sexies. Fases del año

Extiende la idea de "primera mitad vs. segunda mitad" que ya usaba `_wrappedCambioDeHabitos` (categoría de gasto dominante) a otras dos señales: **ahorro en Alcancía** y **plata prestada a otros** (`S.deudores`, movimientos `tipo:'prestamo'`). Se extrajo el corte de fechas a `_wrappedCorteMitadAnio(anioK, mesMax)` para que ambas funciones usen exactamente el mismo corte — nunca dos definiciones distintas de "mitad del año" conviviendo en el mismo archivo.

| Función | Qué hace |
|---|---|
| `_wrappedCorteMitadAnio(anioK, mesMax)` | Devuelve `{enPrimera, enSegunda}`, el mismo corte que ya usaba `_wrappedCambioDeHabitos` |
| `_wrappedCambioFuerte(primera, segunda)` | Decide si hay una concentración marcada (≥70/30) entre dos mitades — umbral relativo, nunca un monto fijo en pesos |
| `_wrappedFasesAnio(S, anioK, mesMax)` | Aplica `_wrappedCambioFuerte` a ahorro y, si no hay señal ahí, a préstamo; requiere 6+ meses transcurridos, igual que `_wrappedCambioDeHabitos` |
| `_wrappedCopyFases(f)` | Copy según tipo (ahorro/préstamo) y dirección (creció/cayó) |

**Falso positivo real que esto encontró y corrigió (no hipotético):** probando contra un backup real de una cuenta creada el 2026-09-07, con un solo depósito de Alcancía en septiembre, `_wrappedCambioFuerte` marcaba "ahorro creció en la segunda mitad" — técnicamente cierto en las cifras (0 en la primera mitad, $20.000 en la segunda), pero engañoso: no es que el usuario cambió de comportamiento, es que la cuenta no existía antes de septiembre. Por eso `_wrappedCambioFuerte` exige que **ambas** mitades tengan actividad (`primera > 0 && segunda > 0`) antes de evaluar la concentración — sin esa guarda, cualquier cuenta nueva mostraría una "fase de crecimiento" falsa en su primer año. Se prueba explícitamente en `test_fases.js` contra ese backup real (debe dar `null`) y contra el JSON poblado (donde sí hay préstamos reales en ambas mitades y el resultado — concentración de préstamos en el segundo semestre — es una señal real).

**Por qué ahorro tiene prioridad sobre préstamo cuando ambos califican:** ahorro es una señal 100% sobre el propio usuario; préstamo depende también de que otras personas pidieran plata, así que es un poco menos "sobre ti" como narrativa de cierre de año.

## 7septies. "Si tu año fuera una película" + comparación exacta con el promedio

Dos retoques pequeños, sin cálculos nuevos:

- **`_wrappedSiTuAnioFuera(ctx)`** — decorativo puro: le pone una frase de "género de película" a señales que este archivo YA calculó para otros slides (`fasesAnio`, `cambioHabitos`, `racha`, `patrimonio`), en el mismo orden de prioridad "más específico primero" que `_wrappedPersonalidad`. A diferencia de casi todo lo demás en este archivo, **siempre devuelve algo** — hasta su fallback ("de las que no tienen gran clímax, pero tampoco fueron aburridas") es una frase honesta, no inventada, así que no necesita un guard de "no forzar" como el resto. Por esa misma razón se agrega DESPUÉS de la guarda `huboAlgo` en `_wrappedBuildSlides` — si se agregara antes, un año sin ningún dato real igual pasaría la guarda (`slides.length > 1`) por esta frase decorativa, rompiendo el estado vacío de "Todavía no hay mucho que contar".
- **`_wrappedCopyGasto` ahora muestra el múltiplo exacto** ("7 veces más grande que tu gasto promedio") en vez de solo la categoría cualitativa ("muchísimo más grande") — pedido explícito del brief original (§24/§34: "Tu mayor gasto fue X veces más grande que tu gasto promedio"). Sigue sin usar el mismo umbral que otras partes usan para *decidir si mostrar algo*; acá el umbral (`>=2x`, `>=5x`) solo decide si vale la pena calificar la intensidad — el número exacto solo aparece cuando ya se decidió mostrarlo, nunca se inventa un múltiplo para un gasto que no destaca.

## 7octies. Vista mensual — "Este año, mes a mes"

Reabre la decisión descartada en la versión original de este documento ("vista mensual... competiría con Top categorías de Análisis, le quitaría a Wrapped la sensación de sorpresa") — decisión de producto explícita del usuario, no una reconsideración técnica.

Para evitar justo el riesgo que motivó el descarte original, esto **no es un slide por mes** (serían hasta 12 pantallas casi idénticas en forma) — es **una sola pantalla** con una lista compacta de una frase por mes, tal cual pedía el brief original ("no mostrar doce tablas... mostrar solamente pequeñas historias"). Reutiliza `_wrappedCalcularPeriodo` mes a mes — el mismo patrón de loop que ya usa `_wrappedMejorPeorMesAnio` — nunca reimplementa el cálculo de balance o categoría por su cuenta.

| Función | Qué hace |
|---|---|
| `_wrappedHistoriasMensuales(S, anioK, mesMax)` | Un balance + una frase por cada mes con actividad real, contando solo desde `_wrappedInicioRachaReal` (§7terdecies) — se omiten los meses sin ingreso/gasto (no forzar una frase sobre un mes vacío); no se muestra con menos de 3 meses con datos |
| `_wrappedLineaMes(mes, avgBalance)` | Elige la frase: mejor mes / mes ajustado / categoría dominante / tranquilo, en ese orden |

**Bug real que esto encontró, no hipotético:** probando contra el JSON poblado, "Dominado por Sin categoría" salió en **6 de 12 meses** — porque los pagos de gasto fijo (`S.pagosGastosFijos`, sin campo `cat`) caen en el bucket "Sin categoría" de `_wrappedTopCategoriaDe`, y casi siempre son el gasto más grande del mes. Eso ya pasaba antes en el slide "Tu categoría del año" (mismo `_wrappedTopCategoriaDe`), pero ahí era un caso aislado; acá, mostrando 12 meses seguidos, se volvía visiblemente roto — una frase repetida sin decir nada real. `_wrappedLineaMes` ahora excluye explícitamente `cat === 'Sin categoría'` como motivo para "Dominado por..." y cae al genérico "mes tranquilo" en esos casos. No se tocó `_wrappedTopCategoriaDe` en sí — sigue siendo correcto para "Tu categoría del año", donde "Sin categoría" ganando de verdad ese año sí sería un dato real que vale la pena mostrar tal cual.

**Rediseño de layout (2026-09-14):** la primera versión pintaba una lista de una columna, con `overflow-y:auto` propio del slide (scroll DENTRO de una historia tipo "reveal", algo que ningún otro slide de este archivo hace) — se veía mal y rompía la sensación de "una revelación, no un documento para scrollear". Ahora es una cuadrícula de 2 columnas (nombre corto de mes + punto de color según el balance + la misma frase de `_wrappedLineaMes` de siempre) que entra sin scroll en la mayoría de pantallas. Nota honesta: con muchos meses activos y frases largas en un teléfono muy chico (ej. iPhone SE), la cuadrícula todavía podría desbordar el alto del slide — no se resolvió con un límite artificial de meses ni acortando las frases porque ninguna de las dos alternativas se probó todavía contra un caso real; queda como posible ajuste futuro si se confirma el problema en la práctica.

## 7novies. Motor de scoring de insights

Reabre §6/§32 del brief original: *"no mostrar 50 insights aleatorios... crear un sistema de scoring... así el Wrapped se siente curado."* Antes de esto, cada dominio de terceros (§7ter) y cada "descubrimiento" (§7cuater/§7sexies: gasto random, protagonistas, meta, cambio de hábitos, fases) se mostraba **incondicionalmente** si existía — un usuario con los 6 módulos de terceros activos más los 5 descubrimientos podía terminar con 11 slides extra en una sola historia, exactamente el "aluvión sin curar" que el brief pedía evitar.

**Qué SÍ entra al pool de scoring:** solo los datos que pueden acumularse sin límite según cuántos módulos tenga activos el usuario — los 6 dominios de terceros + los 5 descubrimientos, 11 candidatos posibles en total.

**Qué NO entra (el "esqueleto" narrativo, sigue incondicional):** intro, patrimonio, categoría del año, vista mensual, mejor/peor mes, gasto más grande, alcancía, racha, personalidad, "si tu año fuera", cierre. Son como máximo 1 de cada uno — nunca se acumulan — y recortarlos por puntaje debilitaría la promesa central de Wrapped en vez de curarla.

**El puntaje** (`_wrappedScoreInsight`) es la SUMA de banderas que cada candidato YA sabe sobre sí mismo — nunca un cálculo nuevo:

| Señal | Puntos | De dónde sale |
|---|---|---|
| `esRecord` | +3 | Es un extremo real (récord, o ya pasó su propio filtro estadístico — ej. `_wrappedGastoMasRandom` exige z-score, así que cualquier resultado suyo ya es un record local) |
| `esCambioComportamiento` | +3 | Es una fase/cambio de hábito (§7sexies), no una cifra estática |
| `involucraMeta` | +2 | Tiene una meta de por medio |
| `involucraPersona` | +1 | Nombra a alguien |
| `intensidad` | 0 a 4 (capado) | Reutiliza un valor relativo que la propia función ya calculó (el `z` de `_wrappedGastoMasRandom`, el `pct` de una meta, cantidad de personas) — nunca un monto fijo en pesos |

Se ordenan de mayor a menor puntaje (`Array.sort`, estable — los empates conservan el orden en que se agregaron) y solo entran los primeros `WRAPPED_MAX_INSIGHTS_POOL` (8) a la historia final.

**Probado con un escenario sintético de los 11 candidatos disparando a la vez** (`test_scoring.js`): confirmó que se recortan exactamente los 8 con mayor puntaje y se descartan los 3 más "rutinarios" (mesada, "yo debo" genérico, un protagonista al límite del umbral de 3 movimientos) — mientras que una meta cumplida al 100%, un gasto realmente atípico, y los cambios de comportamiento quedan siempre arriba. La cantidad total de slides de la historia queda consistente entre un usuario con 2 módulos activos y uno con los 11, en vez de crecer sin límite.

## 7decies. Año en curso vs. año recién cerrado: opción 2, ventana de enero

**Resuelto.** Hasta el 2026-09-14 `_wrappedBuildSlides` calculaba `anioK` siempre como el año calendario de hoy (`_wrappedHoy().slice(0,4)`), nunca el año anterior. Eso significaba que el 1 de enero, apenas empezaba un año nuevo, Wrapped no mostraba el resumen del año que se acababa de cerrar — empezaba a mostrar el año nuevo, con apenas un puñado de movimientos.

En un wrapped "de verdad" (Spotify Wrapped, por ejemplo) el resumen es siempre de un período ya cerrado, no de uno a medias — se revela cuando ya no puede cambiar. Se habían evaluado tres opciones para este momento del arranque de año:

1. Mostrar siempre el año recién cerrado completo (nunca uno a medias).
2. Mostrar el año recién cerrado solo al principio del año nuevo (ene-feb, por ejemplo) y después volver al año en curso en vivo.
3. Dejarlo como estaba: siempre el año en curso, en vivo, sin importar el mes.

El 2026-09-14 se había elegido la opción 3 "por ahora" (Wrapped era una función nueva de esa misma semana, sin uso real en un cambio de año todavía, sin urgencia). **Decisión final (2026-09-15): opción 2.** `js/core/wrapped-gate.js` (núcleo eager, nuevo) decide una ventana de disponibilidad de 1 al 31 de enero (`WRAPPED_VENTANA_DIAS`); dentro de esa ventana, `anioK` es siempre el año recién cerrado (`anioActual - 1`); fuera de ella, la pantalla directamente no está disponible — no hay una tercera modalidad de "año en curso en vivo" que mostrar el resto del año. Investigación previa: Spotify Wrapped adelanta su cierre de datos a mediados de noviembre porque necesita semanas de producción para un año que todavía no terminó — acá esa razón no aplica (diciembre ya está completo el 1 de enero), así que no hace falta adelantar nada; se puede mostrar el año cerrado completo (12 meses reales) desde el primer día del año nuevo.

`_wrappedBuildSlides` pasó de `const anioK = _wrappedHoy().slice(0,4)` a `const anioK = window._wrappedAnioObjetivo()` (con fallback al año en curso solo si el gate no cargó). No hizo falta tocar nada más del cálculo: `mesMax` (vía `_wrappedAnioYMesActual`) ya distinguía correctamente `anioK === anioActual` (mes en curso) de un año distinto (12 meses completos) desde antes — con el nuevo `anioK` siempre apuntando al año pasado, esa segunda rama simplemente pasa a usarse siempre, sin cambios de código en `mesMax` en sí.

Detalle completo de la ventana, el gate y la UI que la acompaña (fila destacada en "Más", banner de aviso) en `js/core/wrapped-gate.js` y `CHANGELOG.md#wrapped-módulo-nuevo`.

## 7undecies. Mood por slide, fecha exacta, personalidad con evidencia, cierre poético

Cuatro mejoras pedidas después de comparar contra el mockup de referencia (`my-money-wrapped.html`, no versionado en el repo) — las cuatro respetan §3 al pie de la letra, a diferencia de los dos slides del mockup que sí lo rompen (ver nota abajo).

- **Acento distinto por slide.** `--wrapped-mood` es una variable CSS en `#wrapped-overlay` que `_wrappedGoTo` actualiza en cada navegación, tomando un `data-mood` que cada slide ya trae (`_wrappedBuildSlides`). Reutiliza los mismos colores semánticos que ya existen en toda la app (`--accent`/`--purple`/`--blue`/`--amber`/`--red` de `styles.css`) — nunca una paleta nueva. Los slides armados con `_wrappedSlideBignum` (mejor/peor mes, gasto, alcancía, categoría, patrimonio, racha, y todos los insights de terceros) no necesitan un mood explícito: un post-proceso al final de `_wrappedBuildSlides` lo detecta del mismo `color:var(--X)` que ya pintaba el número grande, así el fondo siempre combina con la cifra sin definir el color dos veces.
- **Fecha exacta en el intro.** `_wrappedRangoFechasAnio(S, anioK)` busca el mínimo/máximo de fecha entre los mismos ítems que `_wrappedCalcularPeriodo` ya considera "reales" (vía `_wrappedItemsRealesPeriodo` + ingresos filtrados con `_esEntradaEspejoNoIngreso`) — no es un cálculo financiero nuevo, es un min/max de fechas ya presentes. Si el año no tiene ni un dato válido, el intro degrada a la línea genérica de siempre (mismo criterio de "degradar, nunca romper" de §3).
- **Personalidad con evidencia + rasgo secundario.** `_wrappedPersonalidad` evalúa ahora TODOS los candidatos (antes cortaba en el primero) con las mismas condiciones y bancos de frases de siempre — el orden de prioridad no cambió. El primer match sigue siendo el rasgo principal; si un SEGUNDO candidato también aplica con una señal real, se muestra como "rasgo secundario" — nunca un segundo puesto inventado para rellenar el slide (misma regla de "no forzar" que ya aplicaba). Cada candidato ahora trae además una `evidencia` corta y puramente factual (chip aparte del texto narrativo).
- **Cierre más poético.** `_wrappedCopyCierrePoema` agrega un segundo párrafo, más largo, debajo del titular de siempre (`_wrappedCopyCierre`) — mismo sistema de señales con prioridad (patrimonio fuerte → racha → patrimonio cayó → fases del año → personalidad → genérico), para que ambos párrafos cuenten la misma historia en vez de contradecirse. Nunca menciona ingresos/gastos/tasa de ahorro.

**Lo que NO se portó del mockup, a propósito:** el mockup trae un slide de "Ingresos vs Gastos" (con card de totales + % de ahorro explícito) y otro de "Dinero movido" (suma total de ingresos + gastos) — ambos muestran agregados completos del período en crudo, exactamente lo que §3 prohíbe. No se portaron.

**Inconsistencia encontrada en el propio archivo, sin resolver todavía:** `_wrappedPeriodoEnNumeros` (slide "Tu año en números") ya muestra Ingresos/Gastos/Ahorro neto en crudo desde antes de este pase, con un comentario que cita esta misma sección de más arriba (entonces §7decies) como el lugar donde se documentó la decisión de relajar la regla para ese slide puntual — pero §7decies (ver arriba) habla de otra cosa por completo (año en curso vs. año recién cerrado). No se tocó ese slide en este pase porque cambiar qué se muestra ahí es una decisión de producto, no un bug de código — pero la cita rota sí quedó señalada acá para que quien retome esto sepa que falta una decisión real y su rastro en el doc, no solo un ajuste de redacción.

---

## 7duodecies. Panel de debug visual

Hasta ahora `?debug=1`/`#debug` solo imprimía advertencias en la consola (`_wrappedLogDebug`) — útil para confirmar que la FORMA de los datos es correcta, pero no explicaba nada sobre el motor de selección: por qué el pool de insights (§7novies) eligió esos candidatos y no otros, o qué arquetipos de personalidad (§7undecies) aplicaron además del elegido. Se agregó un panel HTML (🛠 abajo a la derecha del overlay, solo cuando el modo debug está activo) inspirado en el panel equivalente del mockup de referencia (`my-money-wrapped.html`) — pero **sin portar su tabla de "Resumen" con ingresos/gastos/tasa de ahorro en crudo**: ese es exactamente el tipo de agregado que §3 prohíbe mostrar en cualquier parte de Wrapped, y no hay necesidad real de cruzar esa línea solo para depurar qué se eligió — el puntaje y las banderas de cada candidato ya alcanzan para explicarlo.

Se arma leyendo `slides._wrappedDebugInfo`, un snapshot que `_wrappedBuildSlides` deja colgado del array de slides que ya devuelve (una propiedad extra, no un campo nuevo en `S` — sigue sin haber ningún estado persistido, §3) con:
- los candidatos del pool de insights, su puntaje y si entraron o no a la historia final;
- los arquetipos de personalidad que aplicaron este año (no solo el principal/secundario que ya se muestra en el slide — para eso `_wrappedPersonalidad` ahora también devuelve `_candidatos`, la lista completa, con prefijo `_` porque ningún llamador productivo debe depender de ese campo);
- la cantidad total de slides armadas.

El panel nunca se inyecta al DOM si `_wrappedDebugOn()` es falso — mismo criterio que ya regía la consola. Lo que a propósito **no** se portó del mockup, además del resumen con agregados en crudo: no hay exportación/descarga de este panel — es una herramienta de inspección en pantalla, igual que la consola que reemplaza en parte.

---

## 7terdecies. "Racha real" de meses con seguimiento — mejor/peor mes y repaso mensual

Caso real reportado por el usuario: empezó a usar la app en septiembre, pero cargó un registro suelto de la mesada de enero de ese mismo año porque se acordaba de la fecha exacta ("me la dieron el 30"). No tiene ningún otro movimiento registrado ese mes — ni gastos, ni otros ingresos, porque simplemente no llevaba registro todavía.

Sin corregir nada, ese enero pasaba el único filtro que usaban `_wrappedMejorPeorMesAnio` y `_wrappedHistoriasMensuales` (`totalIngresos > 0 || totalGastos > 0`) exactamente igual que un mes con seguimiento real. Con ingreso y **cero gastos** (porque no se registró nada más, no porque no se haya gastado nada ese mes), el balance de enero quedaba artificialmente alto — le ganaba a los meses reales de septiembre-diciembre (que sí restan gastos de verdad) y salía como "tu mejor mes del año", con una frase de "mes tranquilo" que en realidad describía un vacío de datos, no un mes real.

**Por qué no es un caso aislado de este usuario:** cualquiera que empiece a usar la app a mitad de año y cargue de memoria un solo dato suelto de meses atrás (una mesada, un pago que recuerda bien) se topa con el mismo problema — no depende de qué tan rara sea la situación, depende de que la app no tenga ninguna forma de distinguir "esto lo registré en vivo, mes a mes" de "esto lo cargué de memoria, un dato suelto". Y no la tiene: a diferencia de, por ejemplo, `creadoEn` por persona (`core-state.js`), no existe ningún campo de "cuándo empezaste a usar la app de verdad" a nivel de cuenta. No hay como preguntarle directamente a los datos.

**Lo que sí se puede inferir:** el principio real del historial es la *racha* de meses activos que termina en el mes más reciente (`mesMax`). Nueva función `_wrappedInicioRachaReal(S, anioK, mesMax)` camina hacia atrás desde ahí y corta apenas encuentra **dos** meses seguidos sin ningún ingreso/gasto — dos, no uno, a propósito: un solo mes flojo (poco movimiento, un viaje) es normal en un historial real y no debería borrar meses reales anteriores a él; un hueco de dos meses o más antes de un registro aislado sí es la señal de "ahí no había seguimiento todavía". Mismo criterio que ya usa el resto del archivo para evitar falsos positivos con umbrales relativos al propio usuario en vez de un número mágico (`catShare >= 0.15` en `_wrappedCambioDeHabitos` §3, el 70/30 de `_wrappedCambioFuerte` §7sexies) — acá el umbral relativo es "dos meses de hueco", no una fecha ni un monto fijo.

Verificado con dos casos simulados antes de tocar el archivo real: el caso reportado (enero suelto, hueco de 7 meses, racha real sep-dic) recorta correctamente desde septiembre; un caso de control con un solo mes flojo real entre meses activos (para confirmar que la protección de "dos meses" no borra historial real) no recorta nada.

**Qué NO cambia:** los totales anuales (`_wrappedCalcularPeriodo` sobre el año completo, el resumen de ingresos/gastos del año, etc.) siguen contando el ingreso de enero — esa plata sí entró, es real, y sacarla del total anual sería borrar un dato verdadero. Lo que se corrige es únicamente su participación en comparaciones **por mes**, que es justo donde un mes con "ingreso sin ningún gasto registrado" se ve artificialmente perfecto frente a meses con seguimiento real. Por la misma razón, `_wrappedFasesAnio` (Alcancía/Prestado, §7sexies) y `_wrappedCambioDeHabitos` (categoría líder, §3) no necesitaron el mismo cambio: la primera ya exigía actividad real en ambas mitades desde antes (documentado ahí mismo con un caso casi idéntico), y la segunda opera sobre gastos — enero no tiene ninguno, así que ya devolvía `null` de forma natural.

---

## 8. Referencia de implementación

### Pantalla (`#screen-wrapped`)

`<div id="wrapped-body">` dentro de `#screen-wrapped` quedó vestigial (ver §7bis) — `renderWrapped()` ya no le escribe nada. El overlay real (`#wrapped-overlay`) se crea con JS y se monta directo en `document.body`, mismo patrón que `#toast-container`, no dentro de `#screen-wrapped`.

### Funciones

**Cálculo:**

| Función | Qué hace |
|---|---|
| `_wrappedAnioYMesActual()` | Único punto que decide "año actual" y "mes actual" para todo el módulo, derivado de `_wrappedHoy()` — evita tener dos fuentes de "hoy" distintas dentro del mismo archivo |
| `_wrappedCalcularPeriodo(S, tipo, mesK, anioK)` | Cálculo puro central: top categoría (dos dimensiones, ver abajo), gasto más grande (con fecha y categoría), gasto promedio del período, total de Alcancía y el ingreso del período (entradas manuales + mesada + ingresos fijos, mismo criterio que `analisis.js` §2 — fix 2026-09-13) de un mes o un año (el balance también se calcula, pero solo como insumo interno para rankear meses — nunca se pinta) |
| `_wrappedMesadaMes(S, anio, mesIdx)` / `_wrappedIngresosFijosMes(S, mesK)` / `_wrappedCuotaAnioFallback(cuotas, anio)` | Ingreso de mesada/ingresos fijos de UN mes calendario, para el balance interno de `_wrappedCalcularPeriodo` — deliberadamente distinta de `_wrappedCalcularMesada` (§7ter), que responde "cuánto mesada te tocó este año" por fecha real de pago, no por a qué mes representa cada registro |
| `_wrappedListaCajitas(S)` | `S.cajitas` (real) con fallback a `S.nu.cajitas` (documentado) — ver §7cuater |
| `_wrappedPersonalidad(S, anioK)` | Ver §7cuater |
| `_wrappedGastoMasRandom(S, tipo, mesK, anioK, gastoMasGrande)` | Ver §7cuater |
| `_wrappedProtagonistas(S, tipo, mesK, anioK)` | Ver §7cuater |
| `_wrappedMetaCajita(S)` / `_wrappedCopyMeta(m)` | Ver §7quinquies |
| `_wrappedCorteMitadAnio`, `_wrappedCambioFuerte`, `_wrappedFasesAnio`, `_wrappedCopyFases` | Ver §7sexies |
| `_wrappedSiTuAnioFuera(ctx)` | Ver §7septies — único slide de esta lista sin guard de "no forzar", su fallback ya es honesto |
| `_wrappedHistoriasMensuales(S, anioK, mesMax)` / `_wrappedLineaMes(mes, avgBalance)` | Ver §7octies |
| `_wrappedScoreInsight(c)` / `WRAPPED_MAX_INSIGHTS_POOL` | Ver §7novies |
| `_wrappedTopCategoriaDe(items, totalGastos)` | Agrupa una lista de gastos por categoría y devuelve la líder por monto y, si es distinta, la líder por frecuencia — compartida entre el período completo y la comparación de mitades de año |
| `_wrappedInicioRachaReal(S, anioK, mesMax)` | Ver §7terdecies — mes desde el que empieza la racha real de seguimiento, caminando hacia atrás desde `mesMax` hasta el primer hueco de 2+ meses sin ingreso/gasto |
| `_wrappedMejorPeorMesAnio(S, anioK)` | Recorre los meses transcurridos del año (desde `_wrappedInicioRachaReal`, no desde enero — ver §7terdecies) y devuelve el de mejor y peor balance, con el balance promedio del año y si hubo empate en alguno de los dos extremos |
| `_wrappedCambioDeHabitos(S, anioK, mesMax)` | Compara la categoría líder de la primera mitad del año contra la segunda; `null` si hay menos de 6 meses transcurridos o si ninguna categoría fue realmente dominante en alguna mitad |
| `_wrappedPatrimonioAnio(S, anioK)` | Número final de crecimiento de patrimonio en el año (diff/%), mismo criterio que Análisis financiero §5 |
| `_wrappedSerieMensualAnio(S, anioK)` | Un punto de patrimonio por mes (forward-fill), recortado al primer mes con dato real — insumo del gráfico animado |
| `_wrappedGraficoAnimadoSvg(serie)` | Arma el SVG del gráfico de línea (puntos + path), sin animar todavía |
| `_wrappedEnRango(fecha, tipo, mesK, anioK)` | Compara una fecha `"YYYY-MM-DD"` contra el mes o año pedido, por slice de string — descarta cualquier valor que no sea string antes de tocarlo |
| `_wrappedFmtSigned(fmt, n)` | Formatea un monto con signo explícito (`+$X` / `−$X`) — usado en el slide de patrimonio |
| `_wrappedValidarDatos(S)` | Advertencias (nunca correcciones) sobre la forma de `S` — arrays esperados, montos numéricos, fechas `YYYY-MM-DD` — solo se imprimen en consola con `?debug=1`/`#debug` en la URL, nunca al usuario |
| `_wrappedDebugOn()` | Único punto que decide si la URL trae `?debug=1`/`#debug` (2026-09-15) — antes vivía duplicado dentro de `_wrappedLogDebug`; ahora también lo usa el panel visual, ver abajo |
| `_wrappedDebugPanelHtml(S, debugInfo)` | Arma el HTML del panel de debug visual (2026-09-15) — ver §7duodecies |
| `_wrappedNombrePersona(personaId, nombreCrudo)` | Nombre de una persona para los dominios de terceros: `getPersonaNombre` si hay `personaId`, si no el nombre crudo del propio registro — siempre escapado |
| `_wrappedCalcularEncargos(S, tipo, mesK, anioK)` | Ver §7ter |
| `_wrappedCalcularInteresesTC(S, tipo, mesK, anioK)` / `_wrappedCalcularComisionesTC(S, tipo, mesK, anioK)` | Ver §7ter — Tarjetas de crédito (dos candidatos aparte, mismo origen de datos) |
| `_wrappedCalcularPrestado(S, tipo, mesK, anioK)` | Ver §7ter — "Me deben" |
| `_wrappedCalcularMisDeudas(S, tipo, mesK, anioK)` | Ver §7ter — "Yo debo" |
| `_wrappedCalcularMesada(S, tipo, mesK, anioK)` | Ver §7ter |
| `_wrappedCalcularSpotify(S, tipo, mesK, anioK)` | Ver §7ter |
| `_wrappedCalcularComprometida(S, tipo, mesK, anioK)` | Ver §7ter |
| `_wrappedRangoFechasAnio(S, anioK)` / `_wrappedFmtFechaLarga(fecha)` | Ver §7undecies — rango exacto de fechas con datos, solo para el slide de intro |

**Sistema de copy contextual (elige el tono del texto según los mismos datos ya calculados arriba, nunca calcula nada nuevo — ver §7):**

| Función | Qué hace |
|---|---|
| `_wrappedIniciarBanco(seedBase)` / `_wrappedBankPick(key, opciones, disambiguador)` / `_wrappedHashStr` / `_wrappedSeededRandom` | Banco de frases (2026-09-14, ver §7): elige una variante determinista dentro de la rama ya seleccionada por señal real. `_wrappedIniciarBanco` se llama una vez al principio de `_wrappedBuildSlides` con una semilla armada de `s.totalIngresos`/`s.totalGastos`/el patrimonio del año; `_wrappedBankPick` evita repetir la misma frase exacta dos veces en la misma apertura (`_wrappedFrasesUsadas`) |
| `_wrappedCopyPatrimonio(patrimonio)` | Elige entre 5 ramas según el signo y la magnitud (%) del cambio de patrimonio del año; dentro de cada rama, banco de 2-4 variantes |
| `_wrappedCopyCategoria(topCategoria)` | Elige entre 3 variantes según qué tan dominante fue la categoría (`catShare`, uso interno); agrega una cláusula si la categoría más frecuente fue otra distinta |
| `_wrappedCopyMejorMes(mejor, promedio, empate)` | Elige entre 4 variantes (incluye el caso de empate) según cuánto se alejó el mejor mes del balance promedio del propio usuario |
| `_wrappedCopyPeorMes(peor, promedio, empate)` | Igual que la anterior, para el mes más difícil — incluye "ni en tu peor mes te fue mal" y el caso de empate |
| `_wrappedCopyGasto(gastoMasGrande, avgGasto)` | Contextualiza el gasto más grande: en qué mes fue y qué tan grande fue en relación al gasto típico del propio usuario |
| `_wrappedCopyAlcancia(alcanciaPeriodo, gastoMasGrande)` | Compara el ahorro de Alcancía contra el gasto más grande del año si el ahorro fue mayor (conexión narrativa entre dos slides) |
| `_wrappedCopyRacha(racha)` | Ajusta la intensidad del texto según qué tan larga fue la racha |
| `_wrappedCopyCierre(ctx)` | Arma la línea del slide de cierre evaluando señales con prioridad (crecimiento fuerte → racha larga → caída fuerte → ahorro mayor al gasto más grande → categoría dominante → genérica) |
| `_wrappedCopyCierrePoema(ctx)` | Ver §7undecies — segundo párrafo, más largo, del slide de cierre |
| `_wrappedCopyEncargos`, `_wrappedCopyPrestado`, `_wrappedCopyMisDeudas`, `_wrappedCopyMesada`, `_wrappedCopySpotify`, `_wrappedCopyComprometida` | Copy de los dominios de terceros (§7ter) — mismo criterio: solo eligen el tono, nunca recalculan nada |

**Presentación y motor de slides (nuevo en el rediseño a formato historia):**

| Función | Qué hace |
|---|---|
| `window.renderWrapped()` | Punto de entrada; arma la lista de slides, pinta el overlay de pantalla completa y arranca en el slide 0 |
| `_wrappedBuildSlides(S, fmt)` | Arma el array de slides a mostrar (uno por dato curioso que exista) — reemplaza a la antigua `_wrappedRenderAnio` |
| `_wrappedSlideBignum(eyebrow, headline, value, color, opts)` | Arma el HTML de un slide de "un dato + un número grande" (categoría, mejor/peor mes, gasto más grande, Alcancía) |
| `_wrappedSetupNav(overlay, fmt)` | Engancha toda la interacción de un overlay recién insertado: click delegado (tap por zona), swipe táctil, flechas de teclado y el botón cerrar |
| `_wrappedGoTo(i)` | Cambia el slide activo, actualiza la barra de progreso y dispara las animaciones del slide entrante (número, línea del gráfico, confeti) |
| `_wrappedCerrar()` | Limpia el listener de teclado, saca `#wrapped-overlay` del DOM y vuelve a `showScreen('config')` |
| `_wrappedVisible(el)` | Chequea si un elemento sigue realmente visible caminando `display:none` en sus ancestros — necesario porque `offsetParent` no sirve en un elemento `position:fixed` como el overlay |
| `_wrappedLimpiarNav()` | Remueve el listener de teclado de una apertura anterior antes de crear el nuevo — evita acumular listeners "colgados" entre reaperturas |
| `_wrappedAnimarNumeros(container, fmt)` | Dispara el conteo ascendente (`0` → valor final) de los números grandes del slide activo |
| `_wrappedAnimarLinea(slideEl)` | Dispara la animación de "dibujado" del `<path class="wrapped-line-path">` del slide recibido (stroke-dasharray/-dashoffset) — busca por clase dentro del slide, no por id global (ver §7) |
| `_wrappedLanzarConfeti(slideEl)` | Genera las piezas de confeti CSS dentro del slide de cierre |
| `_wrappedInyectarEstilos()` | Inserta en `<head>` (una sola vez) el `<style>` con las clases del overlay/slides — usa únicamente variables CSS ya definidas por la app |

### Grupo lazy

`wrapped: ['js/modules/wrapped.js']` en `js/core/lazy-loader.js` — duodécimo grupo. Se integra en `showScreen()` (`js/core/sheet-stack.js`) con una rama `if(name==='wrapped')`, mismo patrón que `analisis` (a diferencia de Alcancía, que se integra parchando `openSheet` desde su propio archivo). Sin `Events.registerAll`: toda la interacción (tap por zona, swipe, flechas) se maneja directamente dentro de `wrapped.js` en `_wrappedSetupNav`, porque es específica de un carrusel de historias — no encaja en el dispatcher central de `data-action`.

**Ventana de disponibilidad (2026-09-15, ver §7decies):** desde `ensureAll()` (precarga en segundo plano) este grupo se excluye salvo que `js/core/wrapped-gate.js` confirme que la ventana de enero está abierta (`window._wrappedDisponible()`) — el resto del año, `wrapped.js` nunca se descarga, porque no hay ningún camino en la UI para llegar a esa pantalla (`#cfg-wrapped-row` está oculta).

### Dependencias externas (todas opcionales, con guard `typeof`)

| Función/dato | De dónde viene |
|---|---|
| `_esGastoVarNoReal`, `_esEntradaEspejoNoIngreso` | Núcleo eager (usadas también por Inicio, Análisis, Salud financiera) |
| `window._alcRachaAhorro` | `alcancia.js`, grupo lazy aparte |
| `getPersonaNombre` | `personas.js`, núcleo eager — resolución de nombres para los dominios de terceros (§7ter); con guard `typeof`, cae al nombre crudo si no está |
| `showScreen` | Núcleo eager (`sheet-stack.js`) — usada para entrar (desde `config:irA`) y para volver a Configuración al cerrar la historia |
| `fmt`, `escHtml`, `hoy` | Núcleo eager |
