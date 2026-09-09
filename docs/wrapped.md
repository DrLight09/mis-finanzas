# Módulo Wrapped

Documentación de la sección **Wrapped** ("Tu resumen") de `mis-finanzas`, accesible desde Más → Tu resumen. Pensada para volver a leerla en unos meses y entender el módulo sin releer el código. Los detalles de implementación aparecen al final, como referencia rápida.

No hay bugs corregidos todavía — módulo nuevo (2026-09-07).

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
- **Nunca se muestran ingresos, gastos totales o tasa de ahorro en crudo.** Esa es la responsabilidad de Análisis financiero. Wrapped solo muestra "datos curiosos" derivados (top categoría, mejor/peor mes, gasto más grande, total en Alcancía, la curva de patrimonio) — nunca una fila de dashboard. Si algún cálculo interno necesita el balance de un mes (ej. para rankear "mejor mes"), ese número se usa solo para ordenar, nunca se pinta directamente en pantalla.
- **Nunca se duplica un cálculo que ya existe centralizado en otro lado.** El criterio de "gasto/ingreso real" es exactamente `_esGastoVarNoReal()` / `_esEntradaEspejoNoIngreso()` (Análisis financiero) — nunca un filtro propio. La racha y el mejor ciclo de Alcancía son exactamente `window._alcRachaAhorro()` / `window._alcMejorCiclo()` (expuestas por `alcancia.js` para este uso) — nunca una copia local del mismo cálculo.
- **Solo cubre dinero inequívocamente propio.** A propósito no incluye Mesada, Spotify, Encargos ni Plata Comprometida — ver §7 para el razonamiento completo. Si en algún momento se quisiera agregar alguno de estos, es una decisión de diseño nueva a discutir, no una extensión automática.
- **Si un helper del que depende no está disponible** (por ejemplo, Alcancía todavía no cargó como grupo lazy), el módulo degrada mostrando menos información — nunca rompe la pantalla ni lanza un error visible.

---

## 4. Modelo de datos

Ninguno. El módulo no tiene campos propios en `S` ni estado local — es puramente de lectura, sin nada que recordar entre una apertura y otra.

---

## 5. Flujo

### Abrir la pantalla

```
Más → Tu resumen
  ↓
Loader.ensure('wrapped') descarga js/modules/wrapped.js (primera vez)
  ↓
showScreen('wrapped') → renderWrapped()
  ↓
Se calculan en vivo desde S: serie mensual de patrimonio, top categoría,
mejor/peor mes, gasto más grande, ahorro en Alcancía
  ↓
Se pinta el HTML (gráfico + tarjetas de revelación, cada una con su delay)
  ↓
Un frame después, se dispara la animación del gráfico (dibujado de la línea)
```

---

## 6. Casos especiales

- **Sin ninguna categoría, gasto grande, alcancía, racha ni gráfico que contar en el año:** en vez de una pantalla vacía, muestra un mensaje neutro ("Todavía no hay suficiente historial este año para contarte algo. Volvé más adelante.").
- **Menos de 2 meses con dato de patrimonio en el año:** no se dibuja ningún gráfico — no hay nada que comparar todavía (mismo criterio que la tarjeta de progreso de Alcancía). Se recorta desde el primer mes con dato real, nunca desde enero si la app empezó a usarse después.
- **Un mes sin ningún movimiento real** (antes de empezar a usar la app, o un mes futuro dentro del año en curso): no compite como "mejor" ni "peor" mes — solo se consideran meses con al menos un ingreso o gasto real registrado.
- **Alcancía no cargó todavía como módulo:** la racha simplemente no aparece; el resto de la pantalla funciona igual, porque esos datos ya están en `S` sin importar si `alcancia.js` cargó — es una función de `alcancia.js` (no el dato) lo único que puede faltar.
- **Un ciclo de Alcancía que empezó en un mes y se destapó en otro:** el ciclo completo se cuenta en el período donde se **destapó** (`fechaFin`), nunca se reparte proporcionalmente entre los dos meses — mismo criterio simple que ya usa Alcancía para medir "duración" de un ciclo como un solo bloque.
- **Navegador sin soporte de `SVGGeometryElement.getTotalLength()`** (no debería pasar en un webview moderno): la línea del gráfico se muestra completa de una, sin animar, en vez de romper la pantalla.

---

## 7. Decisiones de diseño

- **¿Por qué no es un módulo de datos, solo de presentación?** Porque no hay ningún dato nuevo que capturar — todo lo que necesita ya lo registra otra pantalla. Convertirlo en una capa de lectura pura evita el riesgo de que dos números (el "real" en Análisis y el "cacheado" en Wrapped) se desincronicen con el tiempo.
- **¿Por qué se excluyen Mesada, Spotify, Encargos y Plata Comprometida?** Los tres primeros son plata que en algún momento pertenece o perteneció a otra persona (papás, integrantes de Spotify, quien encargó el dinero) — mezclarlos en un resumen de "tu" desempeño financiero exageraría o distorsionaría el número (ej. cobrar Spotify no es "ganar plata", es plata que ya era de otro pasando por tus manos). Plata Comprometida ni siquiera es un movimiento de dinero real todavía, es una reserva a futuro. Esto es coherente con cómo `calcPatrimonioTotal()` ya trata a estas categorías: las resta o las ignora por ser ajenas, en vez de sumarlas como si fueran patrimonio propio.
- **¿Por qué el año usa siempre el año calendario en curso (y no un selector de año)?** Para la primera versión, mantenerlo simple. Si con el tiempo se necesita revisar años anteriores, es una extensión natural (agregar navegación ± como ya tiene Mesada) sin cambiar la arquitectura de cálculo.
- **¿Por qué se sacaron los ingresos/gastos/tasa de ahorro que la primera versión sí mostraba?** La primera versión terminó siendo, sin querer, un mini-Análisis financiero — mismos números, distinta pantalla. Eso no aporta nada nuevo y compite por atención con la pantalla que ya hace ese trabajo bien. La versión actual solo muestra lo que funciona como "dato curioso" (categoría, mejor/peor mes, gasto más grande, Alcancía, la curva de patrimonio) — cosas que uno no está chequeando todos los días, y que tienen más sentido como sorpresa puntual que como número de control.
- **¿Por qué se sacó la vista mensual y se dejó solo la anual?** La primera versión tenía dos pestañas, mes y año. Aun después de sacarle los números crudos, la vista mensual seguía compitiendo con "Top categorías" de Análisis financiero — un mes es una ventana demasiado corta para sentirse como una revelación de verdad, y verla todos los meses le quitaba a Wrapped la sensación de sorpresa que es la razón de que exista. Se dejó solo la vista anual, que sí tiene suficiente distancia temporal para sentirse como un evento, no como un chequeo de rutina.
- **¿Por qué la gráfica de patrimonio se anima "dibujándose" en vez de aparecer completa?** Es la pieza central de la revelación: ver la curva subir o bajar mes a mes, en vivo, comunica la historia del año de una forma que un número estático no logra — mismo efecto que persigue Spotify Wrapped al revelar cifras una por una. Técnicamente se logra con la técnica estándar de `stroke-dasharray`/`stroke-dashoffset` sobre un `<path>` SVG (sin librerías), animada en JS después de insertar el HTML — no se intentó con CSS puro porque la longitud del trazo depende de los datos de cada usuario y no se puede fijar de antemano en una hoja de estilos.
- **¿Por qué la animación se dispara cada vez que se abre la pantalla, y no solo "la primera vez de verdad"?** Habría requerido guardar un flag persistido de "ya viste el wrapped de este año", agregando un dato nuevo a `S` y una decisión de cuándo resetearlo. Se prefirió que la revelación se pueda "re-vivir" cada vez que se entra a la pantalla — mismo comportamiento que tiene Spotify Wrapped al reabrirlo desde el perfil, no solo la primera vez que salió. Si en el futuro se quiere una versión "solo una vez", es una extensión aislada (un campo tipo `_wrappedVistoEn` en algún lado), no un cambio de arquitectura.
- **¿Por qué "racha" de Alcancía se lee de `window._alcRachaAhorro` en vez de recalcularse acá?** Para no tener dos fuentes de la misma cifra. El costo es una dependencia cruzada entre dos módulos lazy independientes, mitigada con un guard `typeof` — si Alcancía no cargó, esa cifra puntual no se muestra, en vez de duplicar su lógica solo para evitar el guard. (`window._alcMejorCiclo` también quedó expuesta por `alcancia.js` para el mismo propósito, pero Wrapped no la usa hoy — su propio "mejor mes" sale de `_wrappedMejorPeorMesAnio`, un concepto distinto al "mejor ciclo" de Alcancía).
- **¿Por qué el módulo no persiste snapshots anuales ya cerrados?** Se evaluó guardar un "wrapped" congelado al cerrar el año (como si fuera un log), pero se descartó: agrega un modelo de datos nuevo, una migración, y un caso más de "¿qué pasa si el criterio de gasto real cambia después?" (un snapshot viejo quedaría con el criterio de aquel momento, generando inconsistencias con el resto de la app). Calcular siempre en vivo evita todo eso a costa de no poder navegar años pasados todavía — ver punto anterior sobre el selector de año.

---

## 8. Referencia de implementación

### Pantalla (`#screen-wrapped`)

Contenedor estático mínimo: un solo `<div id="wrapped-body">`, sin pestañas ni controles — `renderWrapped()` lo llena por completo con HTML armado en JS, mismo patrón que usa Alcancía para sus listas.

### Funciones

| Función | Qué hace |
|---|---|
| `window.renderWrapped()` | Punto de entrada; pinta `#wrapped-body` y dispara la animación de la línea un frame después |
| `_wrappedCalcularPeriodo(S, tipo, mesK, anioK)` | Cálculo puro central: top categoría, gasto más grande y total de Alcancía de un mes o un año (el balance/ingreso/gasto también se calculan, pero solo como insumo interno para rankear meses — nunca se pintan) |
| `_wrappedMejorPeorMesAnio(S, anioK)` | Recorre los meses transcurridos del año y devuelve el de mejor y peor balance |
| `_wrappedPatrimonioAnio(S, anioK)` | Número final de crecimiento de patrimonio en el año (diff/%), mismo criterio que Análisis financiero §5 |
| `_wrappedSerieMensualAnio(S, anioK)` | Un punto de patrimonio por mes (forward-fill), recortado al primer mes con dato real — insumo del gráfico animado |
| `_wrappedGraficoAnimadoSvg(serie)` | Arma el SVG del gráfico de línea (puntos + path), sin animar todavía |
| `_wrappedAnimarLinea()` | Dispara la animación de "dibujado" del `<path>` ya insertado en el DOM (stroke-dasharray/-dashoffset) |
| `_wrappedTarjeta(...)` | Arma el HTML de una tarjeta de revelación individual, con su propio delay de aparición |
| `_wrappedRenderAnio(S, fmt)` | Arma el HTML completo de la vista, encadenando el gráfico y las tarjetas de revelación |
| `_wrappedEnRango(fecha, tipo, mesK, anioK)` | Compara una fecha `"YYYY-MM-DD"` contra el mes o año pedido, por slice de string |

### Grupo lazy

`wrapped: ['js/modules/wrapped.js']` en `js/core/lazy-loader.js` — duodécimo grupo. Se integra en `showScreen()` (`js/core/sheet-stack.js`) con una rama `if(name==='wrapped')`, mismo patrón que `analisis` (a diferencia de Alcancía, que se integra parchando `openSheet` desde su propio archivo). Sin `Events.registerAll`: la pantalla no tiene ninguna interacción del usuario, es de solo lectura.

### Dependencias externas (todas opcionales, con guard `typeof`)

| Función/dato | De dónde viene |
|---|---|
| `_esGastoVarNoReal`, `_esEntradaEspejoNoIngreso` | Núcleo eager (usadas también por Inicio, Análisis, Salud financiera) |
| `window._alcRachaAhorro` | `alcancia.js`, grupo lazy aparte |
| `fmt`, `escHtml`, `hoy` | Núcleo eager |
