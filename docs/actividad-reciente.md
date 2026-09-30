# Actividad reciente

## 1. Objetivo

Un feed cronológico de solo lectura con lo último que pasó con la plata, mezclando en una sola lista eventos que viven en lugares distintos (cuentas, gastos, préstamos, Spotify, encargos, tarjetas, plata comprometida). Responde "¿qué fue lo último que registré?" sin tener que abrir cada módulo.

Es una pantalla de **utilidad**, como Inicio: muestra, no edita. No tiene botones de borrar ni de abrir detalle.

---

## 2. Conceptos importantes

| Término | Qué significa |
|---|---|
| **Ítem del feed** | Una fila ya normalizada: `{ id, fecha, ts, tipo, signo, monto, titulo, subtitulo, fuente }`. Es el formato común al que cada módulo se traduce. |
| **Fuente** | De qué parte de `S` salió el ítem (`movimientos`, `gastosVar`, `deudores`, …). Solo informativa. |
| **Tipo** | Decide el ícono y su color (`ingreso`, `gasto`, `prestamo`, `abono`, `spotify`, `encargo`, `tc`, `comprometida`, `corte`). No es lo mismo que la fuente. |
| **Signo** | `+` o `-`: si la plata entró o salió **desde el punto de vista del usuario**. Decide el color del monto (verde `+`, rojo `-`; Spotify siempre verde Spotify). |
| **Límite de 50** | El feed muestra como máximo los 50 ítems más recientes; el resto se ignora. |

---

## 3. Reglas que nunca deben romperse

- **Solo lectura y sin estado propio.** Todo el feed se deriva de `S` en cada render. No guarda nada en `S`, en `localStorage` ni en Firestore. Es la aplicación directa de "los movimientos son la fuente de verdad".
- **Cada hecho aparece una sola vez.** El feed junta ocho fuentes que se solapan (un encargo que mueve plata crea también un movimiento en una cuenta; un abono a un deudor crea uno en el encargo o en la cuenta). Por eso cada normalizador **excluye explícitamente** lo que otra fuente ya cubre (ver tabla del §4). Si un módulo nuevo crea un movimiento espejo, hay que decidir acá cuál de los dos se muestra y filtrar el otro.
- **Lo que no es ingreso ni gasto no se muestra como tal.** Las transferencias entre cuentas, las aperturas y los movimientos internos de reubicación no aparecen.
- **La plata de la Alcancía oculta no se ve.** Los gastos `_esAlcancia` y los ingresos neto-cero `_esAlcanciaIngreso` se excluyen: en el feed se **excluye**, no se muestra con `••••` como en Cuentas.
- **Perdonar una deuda se ve una sola vez, como gasto** ("Perdoné deuda — X", −). No como abono: no entró plata.
- **Ningún texto libre entra al HTML sin escapar.** `titulo` y `subtitulo` vienen del usuario (descripciones, notas, nombres). El render usa `html\`\``, que escapa por defecto. Solo se envuelve en `raw()` lo que es fijo del código: los íconos SVG del diccionario `ICONOS` y el color del monto.
- **No se reimplementan cálculos de dinero.** El feed muestra montos tal cual están en `S`; no calcula saldos ni netea nada.

---

## 4. Modelo de datos

Este módulo **no define ni escribe datos**. Lee estas partes de `S`:

| Fuente en `S` | Qué produce | Qué se excluye |
|---|---|---|
| `S.movimientos[]` (Nequi, Efectivo, cajitas Nu, cuentas personalizadas vía `fuente`) | `ingreso` (`+`) si `tipo === 'entrada'`, si no `gasto` (`-`). Subtítulo: nombre de la cuenta. | `apertura`, `transferencia`, `_encMovId`, `_esAlcancia`, `_esAlcanciaIngreso`, descripciones que empiezan por "margen de encargo" / "margen encargo", y los espejos que un abono de "Me deben" señala con `_abonoDestinoMovId` o `destinos[]._movId` (ese abono sale en `S.deudores`) |
| `S.cajitas[].historial[]` con `_secundario` (espejos que Mesada y Préstamos dejan en una cajita Nu) | `ingreso` (`+`) si `tipo === 'entrada'`, si no `gasto` (`-`). Subtítulo: nombre de la cajita. | Los espejos de abonos de "Me deben", `_encMovId`, `_esAlcancia`, `_esAlcanciaIngreso`, márgenes de encargo, y todo lo que no sea `_secundario` (los movimientos manuales de una cajita van a `S.movimientos` con `fuente: 'cajita:ID'` y salen por la primera fila) |
| `S.cuentasPersonalizadas[].movimientos[]` | `ingreso` / `gasto` según `tipo === 'ingreso'`. Título: la nota. Subtítulo: nombre de la cuenta. | Los mismos espejos de abonos de "Me deben" |
| `S.gastosVar[]` | `gasto` (`-`). Subtítulo: categoría. Si `esPagoGastoFijo`, muestra la insignia "Gasto fijo". | `_esAlcancia` y `_esPagoTC` (el pago de tarjeta ya sale como "Abono a deuda"). Sí se muestran `_esExtraPrestamo` y los gastos de compra con TC (`_esCompraTC`) |
| `S.deudores[].movimientos[]` | `prestamo` (`-`, "Préstamo a X") o `abono` (`+`, "Abono de X"). | `_perdon` |
| `S.spotifyHistorial[]` | `spotify` (`+`, "Cobro Spotify · nombre"). | Todo lo que no sea `tipo === 'cobro'` |
| `S.encargos[].movimientos[]` | `encargo`: `+` "Entrada encargo" / `-` "Salida encargo". | `_esAbonoDeudor` (ya sale en Deudores), nota "movimiento interno entre cuentas", nota "traspaso a cuenta propia" |
| `S.tarjetasCredito[].pagos[]` | `tc` (`-`, "Abono a deuda · tarjeta"). | `eliminado: true` (el borrado de un pago es suave) |
| `S.tcMovimientos[]` con `tipo === 'corte_aviso'` | `corte` (`-`, "Corte llegó · tarjeta", subtítulo con el monto a deber). | Cualquier otro tipo de `tcMovimientos`, y los `eliminado: true` |
| `S.plataCometida[]` | `comprometida` (`+`): "Llegó: …" si `recibido`, "Esperando: …" si no. | Registros sin `monto` |

`S.plataCometida` es el nombre real del campo en `S` (con esa grafía).

Campos que el feed asume opcionales: `fecha` (si falta, `0000-00-00` → agrupa bajo "Sin fecha"), `ts` (desempate; `0` si falta), `desc`/`nota`/`nombre`, `monto` (`0` si falta).

---

## 5. Flujo

**Render del feed**
```
renderFeedActividad()
  → normalizar con los 8 normalizadores (tabla de arriba) → una lista única de ítems
  → ordenar: fecha descendente, `ts` descendente como desempate
  → actualizar los textos del contador ("N movimientos" / "últimos 50")
  → cortar a los primeros 50
  → agrupar por fecha (Hoy / Ayer / "12 sep" / Sin fecha)
  → pintar los grupos en #feed-historial
  → si no hay ítems: "Aún no hay actividad registrada."
```

**Cuándo se vuelve a pintar**
```
Entrar desde Configuración (clic en #cfg-historial-row) → +80 ms → render
Cualquier refresh() de la app → si la pantalla activa es la del feed → render
Arranque: DOMContentLoaded (+600 ms) y appDataLoaded (+300 ms) → render
Carga lazy del módulo → render inmediato al final del archivo
```

---

## 6. Casos especiales

- **Módulo lazy.** El archivo se descarga la primera vez que se toca la fila en Configuración. Como para entonces ya pasaron `DOMContentLoaded` y `appDataLoaded`, y el listener de clic se registra recién después de que ese mismo clic ya ocurrió, ninguno de esos triggers se dispara: por eso hay una llamada directa a `renderFeedActividad()` al final del archivo. Sin ella la pantalla se queda en "Cargando actividad…" la primera vez.
- **Empates de fecha.** Dos ítems del mismo día se ordenan por `ts`; si no tienen `ts`, quedan en el orden en que los devolvió cada fuente.
- **Sin fecha.** Los ítems sin fecha caen al final (`0000-00-00` ordena de último en orden descendente) y con 50 ítems más recientes probablemente ni se vean.
- **Contadores.** Con más de 50 ítems el texto dice "últimos 50"; con menos, "N movimiento(s)". Se escribe en la propia pantalla, en la fila de Configuración (`#cfg-historial-sub`) y, si existiera, en `#mas-historial-sub`.
- **Fuentes ausentes.** Cada normalizador usa `|| []`, así que un `S` viejo sin alguna clave no rompe el feed.
- **Ids no estables en Spotify.** Un cobro sin `id` recibe uno con `Math.random()`. No importa hoy porque el feed no usa el id para nada (no hay borrado ni detalle).
- **Compras con tarjeta.** Una compra con TC sale una vez, como gasto (`gastosVar`, marcado `_esCompraTC`). El pago posterior de la tarjeta sale una vez, como "Abono a deuda" (`tarjetasCredito[].pagos`); su gasto espejo `_esPagoTC` se excluye. Son dos filas con `-` por el mismo gasto de fondo, a propósito: una es lo que compraste y la otra es la deuda que pagaste.
- **Borrado suave.** Un pago de tarjeta o un aviso de corte eliminado sigue en `S` con `eliminado: true`; el feed lo ignora. Las demás fuentes borran de verdad, así que no necesitan ese filtro.
- **Mesada a una cajita o sin destino.** El espejo de una mesada cobrada en Nequi, Efectivo o una cuenta personalizada llega al feed; si el destino es una cajita Nu, el espejo se guarda en `cajita.historial` (que el feed no lee), y con destino vacío no hay espejo. Esa mesada no aparece en el feed. Lo mismo vale para cualquier otro módulo que deposite en una cajita. Es un hueco de cobertura, no un duplicado; no se verificó cómo registra `cuentas.js` los movimientos manuales de cajitas.
- **Ingresos reales que el feed oculta.** "Dinero extra encontrado en alcancía" (`_esAlcancia`, lo escribe el destape) y "Margen encargo …" (`_esExtraIngreso`, se descarta por descripción) no aparecen en el feed, aunque `_esEntradaEspejoNoIngreso()` los cuenta como ingreso en Análisis. Es una decisión heredada del feed, no un efecto del fix de duplicados; no se cambió.
- **Transferencias.** Nunca aparecen (ni entre cuentas ni los depósitos a Alcancía con cuenta de origen). Es un hueco conocido, no un error.
- **Abonos de deudores hechos con plata de un encargo o cuenta.** Se ven una sola vez, como "Abono de X", por la exclusión de `_esAbonoDeudor` en encargos.

**Duplicados revisados** (contra `core-state.js`, `prestado.js`, `spotify.js` y `tarjetas_credito.js`):

| Caso | Resultado |
|---|---|
| Pago de tarjeta | Duplicaba: `confirmarPagarTC()` crea el pago en `tc.pagos` **y** un gasto `_esPagoTC` en `gastosVar`. Se excluye el gasto. |
| Pago de tarjeta eliminado | Se seguía mostrando: `tcEliminarPagoInterna()` solo marca `eliminado: true` (y borra el gasto espejo). El feed ahora lo ignora. |
| Abono de "Me deben" | Duplicaba: el abono crea un espejo `_secundario` (`_origenSeccion: 'Prestado · Me deben'`) en `S.movimientos` o en una cuenta personalizada, y el movimiento del deudor lo señala por id. Se oculta el espejo referenciado. |
| Préstamo entregado ("Me deben") | No duplica: no deja movimiento en `S.movimientos`; sale una sola vez desde `S.deudores`. |
| Préstamos "Yo debo" | No duplica: el feed no lee `S.misDeudas`, así que solo sale el espejo de la cuenta. |
| Cobro de Spotify | No duplica: `spotify.js` no escribe en `S.movimientos`; el cobro vive solo en `S.spotifyHistorial`. El pago del ciclo sale una vez, como gasto "Spotify Premium". |
| Cajitas Nu (`cajita.historial`) | No duplica, y se agregó como fuente: antes las mesadas y los préstamos que entraban a una cajita no aparecían. Se aplican las mismas exclusiones que a `S.movimientos`. |
| Mesada | No duplica: `mesada.js` solo escribe el espejo (`_registrarMovSecundarioMesada`) y el feed no lee `S.mesadas`, así que sale una vez, como "Ingreso". |
| Encargos | No duplica (`encargos.js` deja sus espejos en `S.movimientos` con `_encMovId`, que se filtra; no escribe en `cajita.historial`). Márgenes y `_esAbonoDeudor` también filtrados. |
| Alcancía | No duplica: sus espejos van a `S.movimientos` con `_esAlcancia` (filtrados) y su `historial` es el de `S.alcancia`, no el de una cajita. |

**Criterio para el fix:** se descarta por caso, no con un filtro general. Ni `_secundario` ni `_esEntradaEspejoNoIngreso()` sirven como filtro del feed: la primera también marca filas que no tienen otra fuente (el gasto "Spotify Premium", el perdón, los espejos de "Yo debo") y la segunda responde "¿es ingreso nuevo?", no "¿ya lo cubre otra fuente?". Por eso el espejo de "Me deben" se oculta solo cuando un abono lo referencia por id: un espejo sin referencia (por ejemplo la propina) sigue visible. Si un módulo nuevo crea un espejo, hay que revisar acá qué fuente lo cubre.

---

## 7. Decisiones de diseño

- **Feed derivado, sin historial persistente.** Antes existía `logCambio()` para ir escribiendo eventos en un historial aparte. Se reemplazó por leer `S` directamente: un historial paralelo se desincroniza de los movimientos reales (borrados, ediciones, importaciones). `logCambio()` quedó como función vacía para no romper llamadas viejas.
- **Solo lectura, sin `Events`.** No hay acciones de usuario que despachar. Lo único que registra es un observador de clic sobre `#cfg-historial-row`, que no es una acción con argumentos sino "el usuario llegó acá", un caso para el que `Events` no está pensado.
- **Límite fijo de 50, sin paginar.** Es un vistazo rápido, no un libro contable; el detalle completo vive en cada módulo y en el historial de cada cuenta.
- **Excluir la Alcancía oculta, no enmascararla.** Cuentas muestra esas filas con `••••`; el feed las omite, porque ya omitía los gastos de alcancía y mezclar dos criterios en la misma lista sería más confuso. Cambiarlo implica tocar los dos filtros a la vez.
- **Perdón como gasto y no como abono.** Perdonar una deuda no trae plata; el efecto real (un gasto en `S.gastosVar`) ya está en el feed.
- **Un normalizador por fuente, no un `if` gigante.** Cada uno conoce las particularidades de su módulo (qué se excluye por duplicado) y devuelve el mismo formato de ítem; sumar una fuente nueva es agregar una función y meterla en la lista de `renderFeedActividad()`.
- **Un solo punto de salida a HTML.** Todo el texto libre pasa por `html\`\`` en `renderFeedActividad()`; los normalizadores no escapan nada a propósito.
- **Sin acceso desde el nav.** Solo se llega desde Configuración; no hay entrada en el nav inferior ni en el menú "Más".

---

## 8. Referencia de implementación

**Funciones de `js/modules/actividad_reciente.js`** (todo dentro de un IIFE)

| Función / símbolo | Qué hace |
|---|---|
| `renderFeedActividad()` | Arma, ordena, corta y pinta el feed; actualiza los contadores. Expuesta en `window`. |
| `_espejosDeudores(S)` | Ids de espejos que un abono de "Me deben" referencia; lo comparten `_normMovimientos` y `_normCajitas`. |
| `_normMovimientos(S)` | `S.movimientos` + movimientos de cuentas personalizadas. |
| `_normCajitas(S)` | Espejos `_secundario` en `cajita.historial`. |
| `_normGastos(S)` | `S.gastosVar`. |
| `_normDeudores(S)` | Movimientos de deudores (sin perdones). |
| `_normSpotify(S)` | Cobros de `S.spotifyHistorial`. |
| `_normEncargos(S)` | Movimientos de encargos (sin duplicados). |
| `_normTC(S)` | Pagos de TC y avisos de corte. |
| `_normCP(S)` | Plata comprometida recibida o pendiente. |
| `_labelFecha(f)` | "Hoy", "Ayer", "12 sep" o "Sin fecha". |
| `ICONOS` | Diccionario de SVG + fondo por `tipo`. |
| `MAX_ITEMS` | 50. |
| `window.logCambio` | No-op, se conserva por compatibilidad. |
| Wrap de `window.refresh` | Repinta el feed si la pantalla activa es `screen-historial`. |

**Ids del DOM:** `screen-historial`, `feed-historial` (contenedor), `feed-historial-count` (texto "últimos 50"), `cfg-historial-row` / `cfg-historial-sub` (fila y subtítulo en Configuración), `mas-historial-sub`.

**Carga:** lazy, grupo `historial` de `Loader.GROUPS` (`js/core/lazy-loader.js`). Al final de `index.html` solo queda el comentario que lo indica.

**Dependencias (se leen en tiempo de ejecución, con fallback si no existen):** `window.S`, `fmt`, `fuenteLabel`, `hoy`, y `html` / `raw` de `html-tag.js`. El wrap de `refresh()` se ejecuta al parsear el archivo, así que necesita que `window.refresh` ya exista al cargar.

**Sin uso / desactualizado (anotado, no eliminado)**
- `#mas-historial-sub` no existe en el HTML; el código escribe en él con guard `if`, así que no falla, pero no hace nada.
- `window.logCambio`: sin llamadores en los archivos revisados.
- Si algún día se agrega un acceso directo desde el nav o el menú "Más", hay que sumar su selector al listener de clic.

**Sin verificar:** en navegador real, ni con `html\`\`` / `raw()` reales simulando payloads maliciosos (la migración se hizo sin `html-tag.js` a la vista; ver `CHANGELOG.md#actividad-reciente`).
