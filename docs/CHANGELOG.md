# CHANGELOG — mis-finanzas

Historial de bugs corregidos, código eliminado por diseño y decisiones de limpieza, por módulo. La documentación de cada módulo (`mesada.md`, `spotify.md`, etc.) se enfoca en cómo funciona *hoy*; el detalle de qué estaba mal antes y cómo se arregló vive acá, para no inflar los documentos principales.

---

## Infraestructura / seguridad

*(Hallazgos de `auditoria-tecnica.md` ya resueltos, movidos acá según su propia convención. Ver ese archivo para lo que sigue pendiente.)*

### 🔧 Nuevo — Sistema centralizado de eventos (`js/core/events.js`)

*(2026-07-16)*

Primer paso del punto 1 de la auditoría técnica (migrar `onclick` inline → `addEventListener`, único camino para poder quitar `'unsafe-inline'` de la CSP). En vez de migrar módulo por módulo con un listener delegado distinto cada vez, se creó un despachador único (`Events`), compartido por toda la app, del que cada módulo solo se registra:

- Cada elemento clickeable pasa a usar `data-action="modulo:accion"` en vez de `onclick="funcion(...)"`.
- Cada módulo registra sus handlers una vez al cargar: `Events.on('spotify:marcarPago', marcarPagoSpotify)`, o para varias acciones de una vez, `Events.registerAll('spotify', {marcarPago: ..., editar: ...})`.
- Los argumentos viajan en `data-args` como JSON (escapado con `escHtml()`, mismo mecanismo que ya usa el resto de la app para atributos dinámicos) en vez de texto separado por comas, para que un argumento con comas no rompa el parseo.

`events.js` no conoce a ningún módulo en particular ni acumula lógica de negocio — solo escucha clicks y despacha al handler que cada módulo registró. Si en algún momento este archivo empieza a tener un `if`/`switch` con casos por módulo, es señal de que algo se coló ahí que no le pertenece.

### 🔧 Nuevo — Extracción de Spotify a `js/modules/`

*(2026-07-16, ajustado 2026-07-17 — ver el fix de orden de carga más abajo)*

Primer módulo movido fuera de `index.html`, como punto de partida del punto 3 de la auditoría (arquitectura monolítica). Se movió tal cual, sin reescribir su lógica de negocio, cargado con `<script src>` clásicos — mismo scope global que ya tenía, todavía no ES modules (eso implicaría mover también `S`/`save()`/helpers a su propio archivo, cambio de mayor riesgo, pendiente aparte). Terminó en **dos archivos** (`spotify.js` + `spotify-personas.js`, no uno solo) por una razón real de orden de carga, no estética — detalle en la entrada de abajo. `index.html` pasó de 24.635 a 23.757 líneas.

### ✅ Corregido — Nombre de integrante de Spotify sin escapar en 3 puntos

*(2026-07-16)*

Al extraer el módulo aparecieron 3 interpolaciones del nombre de un integrante (campo de texto libre) sin pasar por `escHtml()`. El barrido anterior de `.innerHTML` (por nombre de campo conocido, ver `auditoria-tecnica.md`) no las había detectado porque el valor pasa por la función `spNombreDe(x)`, no por el campo `nombre` directo:

1. El nombre dentro de `.row-name`, en la fila de cada integrante.
2. El mismo nombre dentro del atributo `title="Cobrar a ..."` del badge de estado — más grave que el anterior: una comilla doble en el nombre rompía el atributo HTML.
3. Varias llamadas a `toast()` (en `addSpotify`, `deleteSpotify`, `guardarEditarSpotify`, `confirmarSpDestino`) que interpolaban el nombre sin escapar. `toast()` renderiza su mensaje con `innerHTML`, así que un nombre con HTML/JS embebido se hubiera ejecutado apenas se mostrara ese toast.

Fix: las 3 se envolvieron en `escHtml()`. `toast()` en sí no se tocó — es infraestructura compartida por toda la app y al menos 3 llamadas de otros módulos le pasan HTML intencional para íconos, así que cambiar su comportamiento interno de paso hubiera roto esas pantallas. Queda anotado en `auditoria-tecnica.md` como hallazgo pendiente para cuando se toque el núcleo compartido (`toast()` debería separar el ícono, que sí es HTML de confianza, del mensaje, que no).

### ✅ Corregido — `spotify.js` rompía en consola: orden de carga incorrecto

*(2026-07-17, encontrado probando en el navegador después de la migración de arriba)*

Al extraer Spotify a un archivo aparte, se juntó en un solo `spotify.js` tanto sus funciones base como su integración con Personas (antes eran dos bloques separados por miles de líneas dentro de `index.html`). Cargar ese archivo único en un solo punto del documento resultó imposible sin romper algo, porque cada mitad depende de cosas definidas en momentos distintos:

- La integración con Personas (`openSheet = function(){...}`, etc.) se ejecuta *inmediatamente* al cargar el script — no espera a que se llame ninguna función — y necesita que `openSheet()` y el sistema de Personas ya existan. Poner el `<script>` temprano rompía esto: `Uncaught ReferenceError: openSheet is not defined`.
- Al mismo tiempo, un wiring de un botón de Encargos (`initEncargosListeners`, un IIFE que corre inmediatamente, no diferido) referencia `guardarEditarSpotify` — una función *base* de Spotify — más arriba en el documento. Poner el `<script>` tarde (para resolver el punto anterior) rompía esto en cambio.

Como consecuencia del primer error, el script se detenía ahí mismo y nunca llegaba a ejecutar el registro de acciones al final del archivo — de ahí los "No hay handler registrado" para *todos* los botones de Spotify, no relacionados entre sí a simple vista pero con la misma causa raíz.

**Fix:** separar en dos archivos, cada uno cargado en el punto exacto donde vivía su bloque original — `spotify.js` (funciones base) temprano, `spotify-personas.js` (integración) mucho más tarde, ya con `openSheet()` y Personas definidos. Cada archivo documenta en su propio encabezado por qué debe cargarse donde carga.

De paso, al simular la carga real (con jsdom) apareció un segundo bug, más sutil, en el propio sistema de eventos: `Events.on('spotify:editar', editarSpotify)` capturaba la función *en el momento del registro*, pero `spotify-personas.js` reemplaza `editarSpotify` después (para precargar la persona vinculada al editar). El botón "Editar" hubiera seguido andando, solo que sin esa precarga — mismo tipo de bug que el de arriba, pasando desapercibido en vez de tirar error. Se corrigió registrando ese caso puntual con una función flecha (`(...args) => editarSpotify(...args)`), que resuelve `editarSpotify` en cada click en vez de una sola vez al cargar — mismo comportamiento que tenía el `onclick="editarSpotify(...)"` original. Los demás `data-action` de Spotify no tenían este problema porque ninguna otra función que registran se vuelve a redefinir después.

**Cómo se verificó esta vez (no solo "se ve bien"):** se simuló la carga completa de `index.html` con un DOM real (`jsdom`, en un entorno de prueba aparte) y se disparó un click de verdad a través del despachador de `Events` para confirmar que el handler que corre es el correcto — no solo que existe.

### 🔧 Nuevo — Extracción de Mesada a `js/modules/mesada.js`

*(2026-07-17)*

Segundo módulo movido fuera de `index.html`, mismo patrón que Spotify: `<script src>` clásico, sin reescribir lógica de negocio, registrando sus acciones con `Events.registerAll('mesada', {...})` en vez de `onclick` inline (5 casos generados dinámicamente en `abrirDetalleMesada()` y la grilla de meses).

A diferencia de Spotify, acá no hizo falta partir el módulo en dos archivos: la única dependencia real de Mesada es `crearSplitWidget` (el motor de "split de fuentes", compartido con Encargos y "Yo debo", que se queda en `index.html`) — cargar `mesada.js` en el punto exacto donde vivía la segunda mitad del código original (justo después de ese motor) alcanza. `index.html` bajó de 23.757 a 23.195 líneas.

De paso se resolvió algo que afectaba a *todos* los módulos, no solo a Mesada: `events.js` cargaba junto con `spotify.js`, bastante entrado el documento — cualquier módulo que necesitara `Events` definido más temprano (como Mesada, que vive antes de ese punto en el archivo) iba a chocar con esto tarde o temprano. Se movió a cargar una sola vez, como el primer `<script>` del documento entero — no depende de nada, así que no hay downside.

### ✅ Corregido — Nombre de cuenta/cajita sin escapar en el detalle de Mesada (mismo patrón que Spotify)

*(2026-07-17)*

Mismo hallazgo que ya había aparecido al migrar Spotify: `fuenteLabel()` devuelve el nombre de una cajita o cuenta personalizada (texto libre del usuario) sin pasar por `escHtml()`. El barrido general de `.innerHTML` no lo había agarrado porque el nombre llega envuelto en esa función, no como el campo `nombre` directo. Encontrados 3 casos en `abrirDetalleMesada()`: el badge de cada parte de un pago dividido, el badge del destino simple, y el destino de cada abono en el historial de pendiente.

Fix: se envolvieron los 3 en `escHtml()`, en el punto de uso dentro de `mesada.js` — no dentro de la propia `fuenteLabel()`, que es núcleo compartido por todos los módulos (Encargos, Prestado, TC, Cajitas...) y tiene una rama que devuelve HTML de confianza a propósito (el ícono de "ganancia"), así que escaparla de raíz ahí rompería ese caso en otros módulos. Mesada nunca pasa `'ganancia'` ni tarjetas de crédito como destino (regla de negocio ya existente, ver `mesada.md §3`), así que el fix puntual es seguro. Mismo criterio que ya se documentó arriba para `toast()`: queda para cuando se toque el núcleo compartido.

### ✅ Corregido — 2 controles estáticos de Mesada seguían con `onclick`/`onchange` inline

*(2026-07-17)*

El wrapper `mpDebeWrap` y el checkbox `mpQuedaDebiendo` del sheet de registrar pago no viven en las plantillas de `mesada.js` (son HTML fijo en `index.html`), así que quedaron fuera del barrido de migración a `Events`. Tres atributos inline (`onclick` del wrapper, `onclick` de stop-propagation del checkbox, `onchange` a `actualizarMpPreview`) se reemplazaron por `addEventListener` normal, junto al resto del wiring de controles estáticos del sheet que ya existía — no pasan por `Events.attr`/`data-action` porque no son elementos generados dinámicamente en un template string, no hace falta delegación para ellos.

---

## Mesada

### ✅ Corregido — La cuota heredada se "congelaba" con cualquier `save()` de la app

Los inputs de cuota siempre muestran el valor que calcula `_getCuotaAnio` — que puede ser un fallback heredado de un año anterior, no necesariamente una cuota explícita de este año. El problema: `save()` (que corre en *cualquier* acción de la app — agregar un gasto, marcar un pago de Nu, editar Spotify, lo que sea) leía ese input y lo grababa como valor explícito sin verificar si realmente era distinto del heredado.

Escenario concreto: cuota de papá = 80.000 registrada solo para 2025. Al abrir la app en 2026, el input ya viene precargado con 80.000 (el fallback). Con solo registrar un gasto de mercado — sin tocar Mesada para nada — ese `save()` grababa 80.000 como cuota explícita de 2026. Meses después, si subías la cuota de 2025 a 90.000 esperando que 2026 la heredara automáticamente, ya no lo hacía — había quedado congelada desde ese primer `save()` accidental.

Fix: en `save()`, solo persistir si el valor en pantalla difiere del heredado — o sea, solo cuando el usuario realmente lo cambió.

### ✅ Corregido — `cambiarAnio()` podía corromper la cuota de otro año

`cambiarAnio(d)` cambiaba `S.mesadaAnio` **antes** de llamar `save()`. Dentro de `save()`, `_anioActivo` leía el año ya nuevo, pero los inputs del DOM todavía mostraban la cuota del año viejo — porque `renderMesada()` (quien los sincroniza) recién se llamaba después. Resultado: al navegar de año, el valor viejo en pantalla se escribía encima de la cuota ya guardada del año nuevo, pisándola en silencio.

Fix: invertir el orden, para que `save()` persista los inputs *mientras todavía representan el año que se está dejando*.

### ✅ Corregido — Las tarjetas de crédito aparecían como destino válido de mesada

Los tres selectores de destino de mesada (registrar pago en modo simple y dividido, resolver pendiente) usaban el mismo listado de cuentas que el módulo de gastos, donde sí tiene sentido pagar con TC porque genera deuda. Pero mesada es plata que **entra**, y no existe forma de "meter" dinero en una tarjeta de crédito. Se corrigió agregando un parámetro para excluir tarjetas de crédito del listado en los tres puntos de destino de mesada.

### ✅ Corregido — El mes en curso de mamá se marcaba "vencido" ~29 días antes de tiempo

El cálculo de "mes vencido" comparaba mal el plazo de mamá dentro del mismo mes, marcándola como "sin pagar" en rojo desde el día 2, aunque en realidad todavía estaba en plazo casi todo el mes (su plazo real vence el día 1 del mes *siguiente*).

Fix: dentro del mes en curso, solo papá puede quedar "pasado" (después del día 30). El vencimiento real de mamá ya queda cubierto automáticamente apenas se entra al mes siguiente sin pago registrado.

### ✅ Corregido — Mesada no dejaba rastro en las cuentas destino (sin movimiento espejo)

Mesada solo actualizaba el saldo de la cuenta destino, pero nunca generaba el movimiento visible con candado ("Automático") que sí generan Prestado, Encargos y Spotify. Resultado: si mirabas el historial de una cuenta, no había forma de ver que esa plata había venido de mesada — el saldo subía "de la nada".

Fix: se agregaron las funciones de movimiento espejo (`_registrarMovSecundarioMesada` / `_borrarMovSecundarioMesada`) y se conectaron en los tres puntos donde mesada mete plata en una cuenta y en los dos puntos donde se revierte.

### 🗑️ Eliminado por diseño — Toggle "Es saldo inicial"

Mesada tuvo en algún momento un toggle "Es saldo inicial", copiado del mismo patrón que usan Nequi, cajitas y cuentas personalizadas para configurar un saldo inicial de cuenta. Ahí tiene sentido porque es la foto de un momento — pero mesada es un registro de eventos mensuales, no un saldo acumulado, y cada pago ya está aislado por año dentro de su propia clave. No había ningún caso real donde tuviera sentido excluir un mes de las estadísticas de ese año — el aislamiento entre años ya lo resolvía la clave, no el flag.

Se descubrió además que el toggle nunca llegó a estar cableado en el sheet de registro (no existía ningún checkbox que lo activara) — todo el código que lo leía corría siempre por la rama `false`. Se quitó todo por completo (checkbox, función, rama de guardado, badge, exclusiones en estadísticas, CSS). También se corrió una migración una única vez (ya retirada del código) que convirtió los meses existentes marcados así a registros normales.

---

## Spotify

### 2026-07-16

- Renombrado el indicador "Flujo mensual proyectado" (mostrado antes del primer pago real) a "Margen proyectado", y aclarado el texto de apoyo para que no dé a entender una cadencia mensual real. El cálculo en sí (`ingresoEstimado − costo + cuotaAdmin`, con `ingresoEstimado` = suma de las cuotas configuradas de cada integrante) ya era correcto y estaba etiquetado como estimación, pero el nombre "mensual" asumía que el ciclo real de pago del administrador ocurre cada mes calendario — algo que el propio módulo reconoce que no siempre es así (`spotify.md §2`: un ciclo real "normalmente dura un poco más de 30 días" y depende de la facturación real, no de un calendario fijo). Por eso, apenas existe un pago real, el indicador ya cambiaba a "Promedio real por ciclo pagado" — sin la palabra "mensual" — precisamente para reflejar la cadencia real en vez de asumir una mensual. El indicador previo al primer pago quedó con nombre y texto consistentes con ese mismo criterio.
- Corregido: al cobrar varios períodos adelantados de una sola vez (ej. alguien paga $15.000 para cubrir 3 períodos de $5.000), `confirmarSpDestino()` sumaba la plata una sola vez a la cuenta destino pero generaba un registro por período en `spotifyHistorial` — como el historial de movimientos de cada cuenta se arma leyendo directamente ese arreglo, el resultado eran 3 movimientos de $5.000 donde solo había entrado una plata de $15.000. Ahora se genera un único registro con el monto total; el detalle de cuántos períodos cubrió y a cómo cada uno queda en la nota del registro (campo nuevo `periodos` + `nota` descriptiva) en vez de en registros separados. No requirió cambios en `deleteSpHistorial` ni en ningún cálculo de estadísticas, que ya sumaban `monto` sobre todo el historial.
- Corregido: la tarjeta de cada registro en el historial de Spotify (`renderSpHistorial`) no reservaba espacio propio para el monto — con notas más largas (como las de "N períodos × cuota" del fix anterior), el texto de la izquierda empujaba al monto y lo partía en dos líneas ("+\n25.500"). Se le dio `flex:1;min-width:0` al bloque de texto (para que la nota haga wrap dentro de su propio espacio) y `flex-shrink:0` + `white-space:nowrap` al monto, para que este último nunca se corte.

### 2026-07-05

- Corregido: el indicador de "Ganancia" calculado desde el saldo de la cajita, que producía resultados negativos incorrectos cuando los cobros se repartían entre varias cuentas. La cajita ahora muestra únicamente cobertura de liquidez ("Te sobra" / "Faltan" / "Sin saldo").
- Aclarado en los textos de "Balance del ciclo" y "Ganancia acumulada" que la cifra ya está neta de la cuota propia del administrador.
- Reemplazado "Flujo mensual estimado" (valor teórico fijo) por "Promedio real por ciclo pagado" en cuanto existe al menos un ciclo pagado, calculado a partir del historial real. Sin pagos reales, se mantiene una proyección teórica renombrada a "Flujo mensual proyectado".
- Los campos de cantidad de períodos y destino del formulario de registrar cobro pasaron a ser selectores estándar. El primero queda preseleccionado en 1; el segundo ya no tiene valor por defecto y exige una elección explícita.
- Corregido: el gasto "Spotify Premium" y los ingresos "Cobro Spotify (persona)" podían eliminarse directamente desde la lista de movimientos de la cuenta o desde Gastos, dejando huérfano el registro correspondiente. Ahora quedan marcados como movimientos automáticos y protegidos contra borrado directo.
- Actualizada la interfaz para usar "período"/"períodos" en vez de "mes"/"meses" en las etiquetas relacionadas con el cobro a integrantes, eliminando la discrepancia entre lo que mostraba la pantalla y el funcionamiento real de 30 días.
- Corregido: al pagar Spotify se reseteaba el estado "Pagó" de todos los integrantes sin excepción, sin importar si habían prepagado períodos futuros — haciendo que aparecieran como "Pendiente" antes de tiempo. Ahora solo se resetea a quienes ya no tienen su próxima fecha de cobro en el futuro.
- Corregido el mismo problema en "Pendiente por cobrar", que tampoco reconocía a integrantes con períodos prepagados si su cobro había quedado registrado en un ciclo anterior al actual.
- Corregido: eliminar un integrante no pedía ninguna confirmación. Ahora exige confirmación explícita; su historial de cobros se conserva intencionalmente.
- Agregada validación de nombres duplicados al agregar un integrante, y de personas repetidas al usar el selector del sistema unificado de personas.
- Actualizado el control interactivo de estado: mientras un integrante está en "Pendiente", el botón ahora dice "Cobrar" para diferenciarlo de "Pagar Spotify".
- Corregido: `totalSlots` asumía arbitrariamente 5 integrantes cuando la lista estaba vacía. Ahora usa siempre la cantidad real de integrantes.
- Corregido: editar el nombre o la cuota de un integrante recalculaba su próxima fecha de cobro igual que si hubiera cambiado la fecha de ingreso, aunque no se hubiera tocado. Ahora solo se recalcula si la fecha de ingreso cambia de verdad.
- Corregido: al corregir la fecha de ingreso de alguien que ya tenía períodos pagados por adelantado, la próxima fecha de cobro se recalculaba desde cero, perdiendo ese avance. Ahora se desplaza la misma cantidad de días que cambió la fecha de ingreso.
- Agregada una cuota del administrador guardada en cada pago (`_cuotaAdmin`), para que la ganancia de un ciclo ya cerrado no se recalcule con la cantidad de integrantes de hoy.
- Mejorado el selector de personas compartido: cuando no encuentra coincidencias, ahora ofrece un botón de un toque para crear directamente a la persona buscada.
- Agregado un aviso cuando se abre el selector de personas en "Editar" pero se cierra sin confirmar ninguna selección nueva, para no guardar en silencio el nombre anterior.
- El título del selector de personas ahora se adapta según el módulo que lo abre ("¿Quién es?" en Spotify), en vez de mostrar siempre el título pensado para Encargos.
- Corregido un breve parpadeo del campo de texto original antes de ser reemplazado por el selector de personas.
- Corregido: el nombre de un integrante vinculado a una persona podía verse distinto según la pantalla. Se centralizó la resolución del nombre en `spNombreDe`, aplicado en todos esos puntos.
- Corregido: al eliminar un pago a Spotify desde el historial, el dinero y el gasto vinculado se revertían, pero el estado "Pagó"/"Pendiente" de cada integrante quedaba roto (todos en "Pendiente", sin forma de deshacerlo). Ahora se guarda una foto del estado de cada integrante justo antes de pagar, y se restaura al eliminar ese pago.
- Corregido en la raíz el desajuste entre el nombre guardado y la persona realmente vinculada: al guardar cualquier edición, si el integrante sigue vinculado a una persona, su nombre se resincroniza siempre desde ese vínculo.
- Rediseñado el cambio de persona vinculada en "Editar": una vez que un integrante tiene una persona vinculada, ese vínculo queda fijo y ya no se puede reemplazar desde ahí — para asignar el cupo a otra persona hay que eliminar el integrante y agregar uno nuevo.
- Corregido: el selector de destino al registrar un cobro incluía tarjetas de crédito como destino válido. Ahora las excluye, igual que Encargos, "Yo debo", Mis deudas y Alcancía.
- Corregido: el badge de "X períodos adelantados" seguía mostrándose aunque esos períodos ya hubieran vencido. Ahora depende de la misma vigencia que el estado "Pagó".
- Corregido: renombrar una persona desde la pantalla "Personas" no sincronizaba el campo crudo de los integrantes de Spotify vinculados a ella (sí lo hacía para Deudores, Encargos y Mis deudas).
- Agregada la misma validación de personas duplicadas al vincular por primera vez una persona desde "Editar" (antes solo existía al agregar un integrante nuevo).

---

## Alcancía

### ✅ Corregido — Movimientos de Alcancía con `tipo` incorrecto, contados como gasto en vez de ingreso/traspaso

El campo `tipo` de un movimiento determina si cuenta como ingreso real y si se pinta en positivo o negativo — no es solo presentación. Tres movimientos generados por el módulo tenían un `tipo` que no correspondía a lo que representaban:

| Movimiento | `tipo` antes | `tipo` después |
|---|---|---|
| "Alcancía destapada — saldo registrado" | `ingreso` | `transferencia` |
| "Dinero extra encontrado en alcancía" | `ingreso` | `entrada` |
| `_sumarASaldo()` → cuenta personalizada (caso positivo) | `entrada` | `ingreso` |

El valor `'ingreso'` no es uno de los tipos reconocidos por `getMovimientosCuenta()` (solo `'entrada'`/`'salida'` cuentan como real, `'apertura'`/`'transferencia'` son neutros) — cualquier otro valor caía por descarte en la rama de "salida" y se mostraba en negativo aunque la plata estuviera entrando. Esto además inflaba el ingreso del mes en el caso de "saldo registrado" (que es neutral, no ingreso nuevo).

Fix: se corrigió el `tipo` de los tres movimientos según lo que representan realmente. Ver el detalle completo de qué `tipo` le corresponde a cada movimiento de Alcancía en [`guia-estilo-sheets.md`](./guia-estilo-sheets.md#lógica-de-movimientos-al-destapar).

---

## Salud financiera

### ✅ Corregido — `calcHealthScore()` no excluía los extras de préstamo gastados de inmediato

El mismo filtro de "gasto real del mes" usado en Análisis financiero (ver arriba) le faltaba una condición a `calcHealthScore()`: no excluía `_esExtraPrestamo`, así que cada extra de préstamo gastado inflaba `gastosMes` — afectando el cálculo de fondo de emergencia (meses de liquidez cubiertos) y el ratio gastos/ingresos, y bajando el puntaje de salud financiera sin razón real cuando había extras de préstamo ese mes.

Fix: se agregó la misma exclusión (`!g._esExtraPrestamo`) al filtro de `gvMes` en `calcHealthScore()`, dejando el criterio consistente con `renderAnalisis()`. *(Este filtro puntual quedó luego absorbido por la centralización en `_esGastoVarNoReal()`, ver `CHANGELOG.md#análisis-financiero`.)*

---

## Tarjetas de crédito

### ✅ Corregido — Widget de cobertura mostraba "vincula una cajita" con una cajita ya vinculada, y la deuda propia podía llegar a $0 escondiendo gastos reales

*(2026-07-12)*

Una tarjeta con cajita vinculada seguía mostrando el mensaje genérico de "vincula una cajita a tus tarjetas", y la "deuda propia" calculada daba $0 aunque existiera una compra propia real de $59.435. Eran dos problemas separados que se retroalimentaban:

1. **Problema semántico:** los widgets de cobertura (Inicio y detalle de tarjeta) usaban la deuda "propia" de la tarjeta (total menos lo que viene de encargos/préstamos/plata comprometida ajena) para responder "¿me alcanza la plata en la cajita para pagarle al banco?". Pero el banco cobra el 100% del corte sin importar de quién es moralmente la plata — la pregunta correcta necesitaba la deuda **total**, no la propia.
2. **Bug técnico:** `calcDeudaAjenaDeTarjeta(tc)` sumaba todo lo que alguna vez se cargó como ajeno a la tarjeta (bruto histórico) pero nunca restaba los pagos hechos, mientras que `tc.deuda` sí es un saldo neto. Si se pagaba la tarjeta con la misma plata que devolvía un encargo/préstamo, el "ajena" bruto podía terminar superando la deuda actual, y `Math.max(0, deuda − ajena)` se iba a 0 — escondiendo gastos propios reales.

Fix: los widgets de cobertura pasaron a usar `tc.deuda` (total) en vez de la deuda propia. `calcDeudaAjenaDeTarjeta` pasó de bruto histórico a saldo neto (bruto − pagos, con piso en 0), bajo la regla de negocio "un pago cancela primero lo ajeno, lo que sobra cancela lo propio". `calcDeudaTcPropia()` (usada en salud financiera) tenía su propio cálculo bruto duplicado con el mismo bug a nivel agregado — se unificó para que sume la función ya corregida por tarjeta, en vez de tener dos fuentes de verdad. Ver `tarjetas-credito.md` para el detalle de qué función mide qué.

### ✅ Corregido — Eliminar un pago de TC desde el feed de actividad no restauraba la deuda

`eliminarMovimiento` (usado desde el feed de actividad general) devolvía la plata a la cuenta correcta al borrar un pago de tarjeta de crédito, pero nunca restauraba la deuda de la tarjeta — quedaba más baja de lo que debía después de "deshacer" el pago.

---

## Análisis financiero

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

---

## Patrimonio y cálculos globales

*(`calcPatrimonioTotal()`, `snapshotPatrimonio()`, hero de Inicio, salud financiera — funciones compartidas por varias pantallas, no exclusivas de un solo módulo)*

### ✅ Corregido — Plata de Encargos en Nequi/Efectivo/cuentas personalizadas se contaba como patrimonio propio

`calcPatrimonioTotal()` solo restaba la plata de un encargo cuando estaba guardada en una **cajita de Nu** (vía `_saldoEncargosEnCajita()`). Si el encargo se guardaba en Nequi, Efectivo o una cuenta personalizada, no existía ningún descuento equivalente — esa plata ajena se contaba como si fuera tuya.

Fix: se generalizó `_saldoEncargosEnCajita(cajitaId)` en `_saldoEncargosEnCuenta(cuentaKey)`, que acepta cualquier clave de cuenta (`'nequi'`, `'efectivo'`, `'custom:ID'`, `'cajita:ID'`). Se aplicó la resta en tres lugares que hacían el mismo cálculo de forma independiente: `calcPatrimonioTotal()`, el hero de Inicio (`refresh()` — el número más visible de la app tenía el mismo bug por separado), y `liquidoReal` en Salud financiera.

**Pendiente, fuera de esta corrección:** `getSaldoFuente('nequi'/'efectivo')` (usada para validar si hay saldo suficiente al registrar un gasto) todavía no resta la plata de encargos. En teoría permitiría "gastar" sin aviso plata que en realidad es de un encargo. Revisar si vale la pena aplicar el mismo criterio ahí.

### ✅ Corregido — El mismo bug de Encargos se repetía en el detalle de Cuentas y en la alerta de "gastos altos"

*(2026-07-18)*

La generalización de `_saldoEncargosEnCuenta()` (entrada anterior) se aplicó en `calcPatrimonioTotal()`, el hero de Inicio y `liquidoReal`, pero quedaron **2 puntos más** leyendo `S.nequiSaldo`/`S.efectivoSaldo` en crudo, sin restar encargos:

1. `renderDetalleCuenta()` — el detalle que se ve al entrar a Nequi o Efectivo (`det-nequi-saldo`, `det-ef-saldo`) mostraba el saldo bruto. El selector de cuentas y el patrimonio sí descontaban el encargo; el detalle de esa misma cuenta no, así que un usuario podía ver dos números distintos para lo mismo según dónde mirara.
2. `_checkGastoAlto()` — la alerta de "Gastos altos" del hero sumaba `nu + nequi + ef` (disponible) usando los saldos crudos de Nequi/Efectivo, así que contaba plata de encargos como propia al decidir si dispara la alerta.

Fix: ambos puntos ahora restan `_saldoEncargosEnCuenta('nequi'/'efectivo')` igual que el resto de la app.

### ✅ Corregido — La alcancía se filtraba en el Historial de Patrimonio (Análisis financiero)

La alcancía es una función de "ahorro oculto": el saldo no se muestra en ningún lado hasta que se decide destaparla. El hero de Inicio ya respetaba esto (calcula el patrimonio visible restando explícitamente la alcancía), pero `calcPatrimonioTotal()` — la función que alimenta `snapshotPatrimonio()`, que a su vez llena `S.patrimonioHistorial` (la data de la gráfica de Análisis Financiero) — sí la incluía.

Por qué era grave y no solo inconsistente: al registrar un depósito tipo `yo-directo` (efectivo que no tenías registrado), el movimiento en efectivo es neto cero, pero el saldo de la alcancía sí sube. El patrimonio total pegaba un salto ese día que no se explicaba por ningún ingreso visible — cualquiera que mirara la curva de tendencia podía ver, con precisión de peso, cuándo y cuánto se metió a la alcancía.

Fix: se guardan dos valores por punto del historial (`valor` = patrimonio real con alcancía, `valorVisible` = sin alcancía), calculados en `snapshotPatrimonio()`. La gráfica de Análisis Financiero pasó a consumir `valorVisible` en la curva, el número de encabezado y el tooltip (los dos últimos se habían quedado usando el valor real en una primera pasada del fix, y se corrigieron aparte). Health score y Proyección financiera siguen usando `calcPatrimonioTotal()` con la alcancía incluida a propósito — ahí sí es plata real que debe contar, y no es una gráfica día a día que exponga montos puntuales.

**Limitación conocida:** los puntos del historial guardados antes de este cambio no tienen `valorVisible` (caen a `valor` como fallback) — no hay forma de reconstruir retroactivamente cuánto había en la alcancía en fechas pasadas, así que esos puntos viejos pueden seguir mostrando el salto original. De ahí en adelante, la curva queda limpia.

---

## Infraestructura / seguridad

*(Hallazgos de `auditoria-tecnica.md` ya resueltos — ver ese archivo para lo que sigue pendiente.)*

### 2026-07-16

### ✅ Corregido — Sin Content Security Policy

No existía ninguna CSP; el navegador podía ejecutar cualquier script inyectado sin restricción. Se agregó vía `<meta http-equiv="Content-Security-Policy">` (GitHub Pages no permite cabeceras HTTP propias, así que es la única forma viable con el hosting actual). Restringe scripts/conexiones/estilos a los dominios que la app realmente usa (Firebase, Google Fonts, Font Awesome vía cdnjs, `apis.google.com` para el popup de login).

**Limitación conocida y aceptada:** `script-src` mantiene `'unsafe-inline'` porque la app todavía depende de ~250 atributos `onclick="..."` inline — quitarlo rompería toda la interfaz. Migrar esos `onclick` a `addEventListener` (ver más abajo, hecho solo parcialmente) es lo único que permitiría endurecer esto de verdad. Tampoco es posible configurar COOP/HSTS/X-Frame-Options reales (cabeceras HTTP), ni `frame-ancestors` (no soportado en `<meta>`) — mismo límite de hosting.

### ✅ Corregido — `escHtml()` no escapaba comillas dobles (bug de fondo, no cosmético)

La línea `.replace(/"/g,'"')` reemplazaba comillas dobles por sí mismas — un no-op. Cualquier valor con `"` podía romper un atributo `value="${escHtml(x)}"` e inyectar HTML. Corregido a `.replace(/"/g,'&quot;')`. Este bug llevaba presente desde que existe la función; no se sabe si llegó a explotarse, pero afecta a **todos** los usos de `escHtml()` en atributos HTML de doble comilla, no solo a los tocados en esta ronda.

### ✅ Corregido — Texto libre de usuario sin escapar en `.innerHTML` (barrido, no exhaustivo)

Se revisaron sistemáticamente las interpolaciones `${...}` de campos de texto libre (`nombre`, `nota`, `notas`, `desc`, `descripcion`, `concepto`, `titulo`, `title`, `razon`) usadas dentro de `.innerHTML`/`toast()` sin pasar por `escHtml()`: ~110 casos en total, entre ellos nombres de personas (deudores, encargos, Spotify, Mesada), notas de gastos/mesada, nombres de tarjetas y cajitas, y categorías personalizadas. Se envolvieron todos con `escHtml()`.

**Alcance real de este barrido:** cubre los campos con esos nombres específicos. No es una garantía de que los 246 usos de `.innerHTML` que señala `auditoria-tecnica.md` estén cubiertos al 100% — un campo de texto libre con un nombre distinto a los buscados podría seguir sin escapar. Queda como trabajo pendiente una segunda pasada más exhaustiva si se agregan campos de texto libre nuevos en el futuro.

### ✅ Corregido — `escHtml()` no alcanza dentro de `onclick="...('${x}')"` (bug distinto y más serio que el anterior)

Envolver un valor con `escHtml()` protege contra romper el atributo HTML, pero **no** protege contra romper el string de JS anidado dentro de un `onclick`: el navegador decodifica las entidades HTML del atributo *antes* de compilarlo como JS, así que un `'` escapado a `&#39;` vuelve a ser `'` justo a tiempo para cortar el string. `escHtml()` no es composable con ese contexto sin escapado adicional de JS.

Se encontró un caso real explotable: las categorías personalizadas (`renderCatChips`, texto libre del usuario) se pasaban directo como argumento de `eliminarCat('${tipo}','${c}')`. Fix de raíz, no de escapado: se reemplazó el `onclick` con el nombre embebido por un botón con `data-cat-nombre`/`data-cat-tipo` (solo necesita escapado HTML normal, que `escHtml()` sí resuelve) + un listener delegado en `document` (mismo patrón que ya usa la app para los tooltips de gráficos). Se hizo un barrido de las variables interpoladas en los ~250 `onclick` de todo el archivo para confirmar que este era el único caso de texto libre embebido como argumento — el resto son ids, índices o valores de listas fijas (colores), no explotables.

### ✅ Corregido — `setDoc` sin manejo de errores en los dos puntos más riesgosos

De los 4 `setDoc` reales del archivo, dos ya tenían manejo aceptable (autoguardado normal muestra estado de error visible; el de `beforeunload` no puede mostrar UI de todas formas). Los otros dos sí perdían datos en silencio:
- **`_fbSignOut`:** si el guardado final fallaba, cerraba sesión igual sin avisar — riesgo real de perder el último cambio financiero sin que el usuario se enterara. Ahora aborta el cierre de sesión, avisa con un toast y deja reintentar.
- **`borrarTodo()`:** si el borrado en la nube fallaba, solo quedaba en consola. Ahora avisa antes de recargar.

### ✅ Corregido — Mensaje de error de login confuso

`Firebase: Error (auth/internal-error).` se mostraba tal cual en el toast. Se agregó un mapeo de códigos de error comunes (`popup-blocked`, `network-request-failed`, `internal-error`, etc.) a mensajes en español entendibles; el detalle técnico (`e.code`, `e.message`) queda en consola para debugging. De paso se encontró que el `auth/internal-error` real era causado por la CSP bloqueando `apis.google.com` (necesario para el popup de Google) — se agregó ese dominio a `script-src`.

### ✅ Corregido — Accesibilidad: zoom bloqueado, contraste insuficiente, SEO

- `user-scalable=no` bloqueaba el zoom — quitado del viewport.
- `--text3` fallaba contraste WCAG AA en todos los fondos (hasta 2.63:1, muy por debajo del mínimo). `--text2` fallaba en los fondos de tarjetas (`--bg3`/`--bg4`). Se subieron ambas variables (`--text2: #888880→#a8a89e`, `--text3: #6a6a60→#8e8e84`) manteniendo el mismo tono y la misma jerarquía relativa entre ellas — ahora pasan AA en `--bg`/`--bg2`/`--bg3` (el fondo de tarjetas más usado) y quedan muy por encima del mínimo de "texto grande" en `--bg4`. De paso se centralizaron 4 tooltips de gráficos que tenían los colores viejos pegados literal en vez de usar la variable.
- Agregado `<meta name="description">` (faltaba, hallazgo de SEO).

### ✅ Corregido — Rendimiento: LCP 7.4s → 5.2s, JS 34% más liviano

- Font Awesome y Google Fonts pasaron de bloquear el render inicial a cargar en paralelo sin bloquear (patrón `media="print" onload="this.media='all'"` + `<noscript>` de respaldo). Trade-off aceptado: flash breve sin íconos/tipografía custom mientras carga.
- Se agregó `preconnect` a los dominios de la cadena de red de Firebase (`www.gstatic.com`, `firestore.googleapis.com`) y `modulepreload` a los 3 módulos del SDK — adelanta el handshake de red en paralelo en vez de descubrirlo en cadena. *(Primero se agregaron 4 preconnects; Lighthouse avisó que eran demasiados y competían entre sí — se recortó a los 2 más críticos, más el de `fonts.googleapis.com` ya existente.)*
- Medido con Lighthouse antes/después: LCP 7.4s → 5.2s.
- Minificación con `terser` (config por defecto, sin `toplevel`) disponible como paso de build antes de publicar — se decidió **no** versionar un segundo archivo minificado permanente; se genera bajo demanda desde el archivo fuente único al momento de publicar. Verificado contra 184 nombres de función distintos llamados desde atributos de evento inline (`onclick`, `onchange`, etc.) en todo el archivo: 0 roturas. Ahorro: JS 34% más chico, archivo completo ~26% más chico.
- **Pendiente, no resuelto:** el cuello de botella principal del LCP (que la UI real dependa de que termine toda la cadena de Auth/Firestore antes de mostrarse) no se tocó — requiere reestructurar el arranque de la app (`onAuthStateChanged` → PIN → carga de datos → `_launchApp()`), que se decidió no hacer sin pruebas en vivo paso a paso. TBT medido en 8,980 ms, todavía alto — misma causa raíz (JS monolítico sin dividir por pantalla).

### ✅ Confirmado sin cambios — Service Worker

`sw.js` registra correctamente en producción (confirmado en consola en múltiples pruebas reales). No era un bug, solo faltaba verificarlo.

---

## Préstamos

### ✅ Corregido — `addDeudor()` nunca creaba/vinculaba la persona en la práctica (mismo bug de listener congelado que Encargos)

*(2026-07-18)*

Mismo problema y misma causa que el de `crearEncargo()` (ver entrada en la sección Encargos): `btn-crear-deudor` se enganchaba con `addEventListener('click', addDeudor)`, capturando la versión original de la función. Dos overrides posteriores quedaban como código muerto — uno de validación, y el que realmente crea o vincula el registro correspondiente en `S.personas` y le asigna `personaId` al deudor nuevo. Como consecuencia, un deudor podía quedar guardado sin `personaId` aunque el usuario nunca lo notara (no hay feedback visual distinto entre ambos casos).

**Fix:** mismo criterio que en Encargos — el listener pasó a `() => addDeudor()` para leer la variable actual en cada clic. Acá no hizo falta agregar una validación explícita de "persona obligatoria" (a diferencia de Encargos): el override ya crea o vincula la persona automáticamente por nombre en todos los casos, así que alcanza con que el override efectivamente corra.

### ✅ Corregido — Botón "Dividir ÷" nunca cambiaba de color (Me deben / Yo debo)

`togglePrestSplit()` y `toggleAbonoSplit()` (los toggles de dividir el origen y el destino del dinero en un movimiento de préstamo) cambiaban el texto del botón (`"Dividir ÷"` ↔ `"Una sola fuente/cuenta"`) pero nunca el color — a diferencia del resto de la app, donde el botón se pone ámbar en modo dividir. El botón `.btn-split`/`.btn-split.active` ya tenía los estilos CSS para ambos estados; solo faltaba aplicarlos en JS. Se agregó el cambio de color inline en ambas funciones y en sus resets (incluyendo el caso de precargar modo dividido al editar un movimiento con múltiples fuentes ya guardado, que arrancaba con el texto de "dividido" pero el color de "no dividido").

---

## Encargos

### ✅ Corregido — `crearEncargo()` nunca guardaba `personaId` en la práctica (listener con referencia congelada)

*(2026-07-18)*

Mismo tipo de bug que ya había aparecido al migrar Spotify (ver `Events.on('spotify:editar', ...)` en Infraestructura/seguridad más arriba): `btn-crear-encargo` se enganchaba con `addEventListener('click', crearEncargo)`, que captura el *valor* de la función en ese momento, no una referencia viva a la variable. Más abajo en el documento, `crearEncargo` se reasignaba (hook que adjunta `personaId` si se eligió persona en el selector) — pero como el listener ya había capturado la versión original, ese override nunca corría al hacer clic en el botón real. Era código muerto.

Encargos se guardaban entonces con el nombre correcto (el selector de persona sí sincronizaba visualmente el campo `enc_nombre`) pero **sin `personaId`**, salvo que ya lo tuviera de una migración anterior — lo que hacía fallar silenciosamente cualquier lógica que dependiera de ese vínculo (ej. `_tieneEncargoVinculado`).

**Fix:** el listener pasó a registrarse como `() => crearEncargo()` en vez de `crearEncargo` directo, para que cada clic lea el valor *actual* de la variable global. De paso se aprovechó para volver `personaId` explícitamente obligatorio: el hook ahora bloquea la creación con un toast de error si no hay persona seleccionada, en vez de depender implícitamente de que el campo oculto `enc_nombre` quedara vacío (ya no existe vía de "nombre libre" sin persona, ver `encargos.md §3`).

### ✅ Corregido — Botón "Dividir ÷" quedaba con color incorrecto tras resetear (abono a cuenta)

Tres puntos distintos reseteaban el toggle de dividir del abono a un encargo (al abrir el sheet, al desmarcar "¿viene de un encargo?", al cambiar de encargo seleccionado) — los tres reseteaban el texto a `"Dividir ÷"` pero no el color, así que si el usuario había estado en modo dividir (ámbar), el botón quedaba con el texto correcto pero el color viejo. Se unificaron los tres bajo un solo helper (`_resetEncCuentaSplitToggleStyle`) para que no puedan volver a desincronizarse en el futuro.

### ✅ Corregido — Eliminar un encargo completo dejaba plata huérfana y la deuda de la tarjeta desactualizada

Borrar un movimiento individual de un encargo (ej. una compra pagada con tarjeta de crédito) siempre revertía bien sus efectos: le restaba el dinero a la cuenta destino, le bajaba la deuda a la tarjeta y refrescaba la pantalla para que el número quedara correcto al instante. Pero borrar el **encargo completo** solo sabía revertir un caso ("traspaso de sobrante"): una compra pagada con TC dentro de un encargo eliminado dejaba la plata metida en la cuenta destino sin ningún movimiento que explicara de dónde salió, y la deuda de la tarjeta seguía mostrando el valor viejo hasta que *cualquier otra acción* sin relación disparara un refresco general — momento en el que el número cambiaba solo, sin que el usuario entendiera por qué. Lo mismo pasaba con un pago de deuda de Préstamos hecho con plata de un encargo: al borrar el encargo, la deuda de esa persona seguía marcada como pagada aunque el registro del lado del encargo ya no existiera.

**Fix de diseño, no solo de reversión:** un encargo ya administrado y usado (con compras, pagos o traspasos adentro) no debería poder "deshacerse" completo sin más — esos movimientos ya son historia real. Se cambiaron las reglas del juego en vez de parchar la reversión:
- Ahora solo se puede eliminar un encargo si su saldo está en $0 — si todavía tiene plata pendiente (a favor o en contra), se avisa y no se deja continuar.
- Al eliminarlo ya no se revierte ni se borra nada vinculado (movimientos, cargos a tarjeta, pagos de deudas) — todo lo que pasó mientras el encargo existió queda intacto, exactamente como ocurrió. Eliminar el encargo pasó a significar únicamente "dejar de llevarle el registro a esta persona", no "deshacer los favores o pagos que ya pasaron".

