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

### 🔧 Cambio — Wiring propio movido de `index.html` a `mesada.js` (arquitectura)

*(2026-07-26)*

Los 12 `addEventListener` de los controles de esta pantalla (`btn-anio-prev/next`, `btn-confirmar-mesada`, `btn-confirmar-mesada-pend`, `mpDestino/mpMonto`, `mpDebeWrap/mpQuedaDebiendo`, `mppDestino/mppMonto`, `mpSplitToggle`, `btn-add-split-row`) vivían en `_initEventListeners()` (`index.html`), mezclados con los de otros ~15 dominios. No eran `onclick` inline (sin problema de CSP) — se movieron por organización, cada listener a su módulo dueño. Sin cambios de comportamiento; verificado con jsdom disparando cada evento contra el archivo real. Ver `auditoria-tecnica.md`, punto 3.

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

### 🔧 Cambio — Wiring propio movido de `index.html` a `spotify.js` (arquitectura)

*(2026-07-26)*

Los 8 `addEventListener` de los controles de esta pantalla (`btn-add-spotify-persona`, `btn-pagar-spotify`, `btn-guardar-spotify`, `btn-confirmar-sp-destino`, `spMesesSelect`, `btn-confirmar-pagar-spotify`, `spPagarFuente/spPagarMonto`) vivían en `_initEventListeners()` (`index.html`), mezclados con los de otros ~15 dominios. No eran `onclick` inline (sin problema de CSP) — se movieron por organización, cada listener a su módulo dueño. Sin cambios de comportamiento; verificado con jsdom disparando cada evento contra el archivo real (incluida la validación de "Ingresa el nombre"/"Ingresa el monto a pagar" al confirmar con campos vacíos). Ver `auditoria-tecnica.md`, punto 3.

**Corrección retroactiva (2026-07-26, sesión siguiente):** el wiring de `btn-guardar-spotify` capturaba la referencia original de `addSpotify`, sin la validación inline que `index.html` le agrega por encima más abajo en el documento (`_injectErrorSpans()`) — mismo bug que apareció con `addGastoVar`/`addGastoFijo` al mover Gastos, ver `CHANGELOG.md#gastos`. Se corrigió pasando una flecha `() => addSpotify()` en vez de la referencia directa.

---

## Gastos

### 🔧 Cambio — Wiring propio movido de `index.html` a `gastos.js`, dedupe de las cards del menú, y corrección de un bug real (arquitectura)

*(2026-07-26)*

Los 7 `addEventListener` de los controles de esta pantalla (`.btn-open-gasto-var/fijo`, `btn-guardar-gasto-var/fijo`, `btn-confirmar-pagar-gf`, `pgf-fuente`, `gv_fuente`) vivían en `_initEventListeners()` (`index.html`), mezclados con los de otros dominios. No eran `onclick` inline (sin problema de CSP) — se movieron por organización, cada listener a su módulo dueño. De paso, las cards del menú "+" (`menu-gasto-var`/`menu-gasto-fijo`, que se quedan en `index.html` por ser parte del FAB compartido) dejaron de reimplementar a mano `poblarCatSelect+openSheet` y ahora delegan a `abrirNuevoGastoVar()`/`abrirNuevoGastoFijo()`, que ya existían para el botón del estado vacío.

**Bug real encontrado al hacer este movimiento (no relacionado con la mudanza en sí, pero destapado por ella):** `addGastoVar` y `addGastoFijo` se sobrescriben más abajo en `index.html` (`_injectErrorSpans()`) para agregarles validación inline (mensajes de error junto a cada campo, foco automático). Esa sobrescritura corría antes de que el wiring original se enganchara, así que el botón siempre usó la versión validada — hasta que el wiring se movió a `gastos.js`, que carga (y engancha los listeners) *antes* de esa sobrescritura, capturando por error la versión sin validar. Fix: en vez de pasar la función directa a `addEventListener`, se pasa una flecha `() => addGastoVar()` que resuelve el global en vivo en cada click, no al cargar el módulo. **El mismo bug se coló en `spotify.js` en la sesión anterior** (`addSpotify` tiene el mismo tipo de override) y se corrigió acá también, retroactivamente. Verificado con un test de jsdom que reproduce el orden real de carga (módulo → sobrescritura → click) para los tres casos.

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

### ✅ Corregido — Registrar una compra desde "+ Compra" no validaba el cupo disponible

*(2026-07-19)*

`confirmarCompraTC()` (botón "+ Compra" en la pantalla de la tarjeta) creaba la compra sin chequear `tcCupoDisponible(tc)` contra el monto — bastaba con registrar la compra desde esta pantalla en vez de desde "Agregar gasto" para saltarse el control de cupo. El flujo genérico de gasto variable con fuente `tc:` (`addGastoVar`) sí lo validaba, pese a que ambos terminan en el mismo `tcCrearCompra()`: dos caminos al mismo resultado con reglas distintas.

Fix: se agregó la misma validación que ya usaba `addGastoVar` — mismo criterio (solo bloquea si la tarjeta tiene cupo configurado) y mismo mensaje de error, reutilizando `tcCupoDisponible(tc)` en vez de reimplementar el cálculo.

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

### 🔧 Cambio — Migración a `js/modules/analisis.js` (arquitectura, seguridad)

*(2026-07-27, confirmado contra código fuente el 2026-07-28)*

Migrado sobre la infraestructura ya construida (`js/core/events.js`, patrón `data-action`/`Events.registerAll`) — ver `auditoria-tecnica.md` puntos 1 y 3. Cubre Ingresos Fijos y Presupuestos, antes repartidos en tres bloques sueltos de `index.html` (uno de ellos un IIFE numerado por secciones compartido con Configuración e Inicio).

- **`onclick` → `data-action`:** 4 acciones (`abrirSheetIngresoFijo`/`abrirPresupuestos` estáticas en `index.html`, `editarIngresoFijo`/`eliminarIngresoFijo` dinámicas dentro del módulo).
- **`.innerHTML` sin escapar, corregido:** `cat` (nombre de categoría, texto libre — el usuario las agrega desde Configuración) se interpolaba sin `escHtml()` en 5 sitios: la card de "Top categorías del mes", el `<label>` y el atributo `data-cat` del formulario de Presupuestos, la barra de progreso de Presupuestos, y el `toast()` de aviso al 80% del presupuesto. A diferencia de los hallazgos anteriores (que reincidían sobre `fuenteLabel()`/`nombre`/`nota`), acá el campo sin escapar nunca había aparecido en este tipo de hallazgo — confirma que hay que revisar cada campo de texto libre nuevo que se agregue al modelo de datos, no solo los ya conocidos. Corregido envolviendo las 5 interpolaciones en `escHtml()`.
- **Sin código muerto** encontrado en el archivo.

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

### 🔧 Cambio — Nueva clase `.btn-red`, mismo patrón que `.btn-primary`

*(2026-07-19)*

Al menos dos botones ("Restar del saldo" en Cuentas, "Registrar compra" en Tarjetas de crédito) usaban `class="btn btn-primary"` con un `style=""` inline casi idéntico para forzar fondo/sombra roja en vez de la lima que trae `.btn-primary` por defecto — mismo problema de fondo que ya llevó a centralizar los colores de tooltips de gráficos (ver más arriba: "Accesibilidad"). Se agregó `.btn-red` junto a `.btn-primary` en la hoja de estilos y se migraron ambos botones a usarla, sin estilos inline. Cualquier botón rojo nuevo debería usar esta clase en vez de repetir el override.

### ✅ Corregido — Comentario de la CSP con la cifra de `onclick` desactualizada

*(2026-07-27)*

El comentario junto a la CSP en `index.html` seguía citando la cifra original de ~247 `onclick` inline como justificación de `'unsafe-inline'`, sin actualizarse en ninguna de las migraciones de módulo hechas desde entonces. Con Análisis y Personas confirmados, el conteo real de `onclick` bajó a 24 — todos del gate de PIN/biometría/login, ninguno de un módulo de negocio. Corregido para reflejar la cifra real y aclarar de qué son los que quedan.

---

## Préstamos

### 🔧 Cambio — Blindaje del listener de `addDeudor()` (mismo diagnóstico retractado que `crearEncargo()`, ver sección Encargos)

*(2026-07-18, corregido el mismo día)*

Se había diagnosticado el mismo bug de "listener congelado" que en `crearEncargo()`: `btn-crear-deudor` enganchado con `addEventListener('click', addDeudor)`, supuestamente capturando la versión original antes de que dos overrides posteriores (validación + vínculo con `S.personas`) se aplicaran.

**Retractado por el mismo motivo:** ese `addEventListener` se registra dentro de `_initEventListeners()`, llamada de forma asíncrona (vía `_finishFirstLoad`, después de que responde Firestore) — mucho después de que los overrides de nivel superior ya corrieron de forma síncrona al parsear el script. La variable `addDeudor` ya apuntaba a la versión final en el momento en que el listener la lee. El vínculo con `S.personas` y la asignación de `personaId` ya venían funcionando correctamente en cada clic, aun antes de este cambio.

**Qué se mantiene:** el listener quedó como `() => addDeudor()` en vez de `addDeudor` directo — blindaje contra un reordenamiento futuro del código, no corrección de algo que estuviera fallando. No se agregó validación adicional de "persona obligatoria" acá (a diferencia de Encargos): el override ya crea o vincula la persona por nombre en todos los casos, y eso seguía corriendo con normalidad.

**Si hay deudores reales sin `personaId`:** misma conclusión que en Encargos — no es esta la causa; buscar en registros anteriores a esta integración o en datos que entraron por otra vía.

### ✅ Corregido — Botón "Dividir ÷" nunca cambiaba de color (Me deben / Yo debo)

`togglePrestSplit()` y `toggleAbonoSplit()` (los toggles de dividir el origen y el destino del dinero en un movimiento de préstamo) cambiaban el texto del botón (`"Dividir ÷"` ↔ `"Una sola fuente/cuenta"`) pero nunca el color — a diferencia del resto de la app, donde el botón se pone ámbar en modo dividir. El botón `.btn-split`/`.btn-split.active` ya tenía los estilos CSS para ambos estados; solo faltaba aplicarlos en JS. Se agregó el cambio de color inline en ambas funciones y en sus resets (incluyendo el caso de precargar modo dividido al editar un movimiento con múltiples fuentes ya guardado, que arrancaba con el texto de "dividido" pero el color de "no dividido").

### ✅ Corregido — `_calcPrestadoMeta()` no descontaba abonos con destino dividido

*(2026-07-19)*

Esta función calcula cuánto dinero de una cajita sigue "prestado" (para mostrar el aviso en la tarjeta de la cajita en la meta). Restaba los abonos/pagos-completos que regresaron a esa cajita, pero solo revisaba `m.destino` (destino simple) — cuando un abono se registra en modo dividido, el destino vive en el array `m.destinos`, no en `m.destino`. Otras partes del código ya revisaban ambos casos; esta función no. Efecto: si un préstamo se pagaba con un abono repartido entre varias cuentas (una de ellas la cajita de origen), esa plata seguía contando como "prestada" aunque ya había regresado, mostrando un monto inflado en la tarjeta de la cajita. Fix: la función ahora revisa `m.destino` y recorre `m.destinos` igual que el resto del código.

### ✅ Corregido — Etiqueta "Abono" incorrecta para pagos completos en el perfil de persona

*(2026-07-19)*

En la sección "Préstamos" del perfil de persona, el "Último movimiento" solo distinguía entre `'prestamo'` y todo lo demás mostrado como `'Abono'`. Si el último movimiento era un `'pago-completo'`, se mostraba igual como "Abono" en vez de "Pago completo" — no afectaba ningún cálculo, solo el texto. Corregido para distinguir los tres tipos.

### ✅ Corregido — Al eliminar un abono/pago-completo desde "Prestado" quedaba huérfano el movimiento secundario en la cuenta destino

*(2026-07-19)*

Al registrar un abono o pago completo hacia una cajita/cuenta propia (rama normal, sin encargo — tanto destino simple como dividido), se creaba un movimiento visible en la cuenta destino (`S.movimientos`/`cObj.movimientos`/`cObj.historial`, marcado `_secundario:true`) con un `id` nuevo que nunca quedaba referenciado de vuelta desde el movimiento del deudor. La rama "vía encargo" sí guardaba esa referencia (`_abonoDestinoMovId`); esta no. Efecto: al eliminar el movimiento desde "Prestado", `eliminarMovDeudor()` revertía el saldo con `descontarFuente()` pero no tenía forma de encontrar y borrar la entrada secundaria — quedaba para siempre en el historial de la cuenta destino, con el monto ya sumado dos veces (el saldo real bajaba, pero el historial seguía mostrando la plata como si hubiera entrado).

**Fix:** se generan y guardan los ids en el momento de crear el movimiento (`_abonoDestinoMovId` para destino simple, `_movId` por fila para destino dividido) y `eliminarMovDeudor()` los usa para encontrar y borrar la entrada secundaria correspondiente antes de descontar el saldo — mismo patrón que ya usaba la rama "vía encargo".

### ✅ Corregido — Duplicado sin candado del mismo abono en el historial de cuentas (bug preexistente, expuesto por el fix anterior)

*(2026-07-19)*

`getMovimientosCuenta()` (vista agregada "nu"/cajitas y efectivo/nequi) y `_getMovimientosCuentaCustom()` (cuentas personalizadas) tenían cada una una sección "Préstamos dados desde esta fuente" que, además de reconstruir los préstamos *entregados* (necesario, porque esos no dejan otro rastro en la cuenta), también reconstruía una **segunda copia** de cada abono/pago-completo *recibido*, leyendo directo del registro del deudor — duplicando la entrada que ya vivía, correctamente marcada `_secundario:true` y con candado, en `S.movimientos`/`cObj.movimientos`/`cObj.historial`. Esa copia duplicada no tenía la marca `_secundario`, y su id (el del movimiento del deudor) no es uno de los que `eliminarMovimiento()` busca al chequear si algo es un movimiento vinculado — así que aparecía sin candado, con botón de eliminar activo, por una ruta que no revertía nada correctamente si se llegaba a usar.

Este duplicado ya existía antes de esta ronda de fixes; se volvió más visible al arreglar el punto anterior (una vez que el registro correcto se limpia bien al eliminar desde "Prestado", el duplicado roto que se queda atrás llama más la atención). Fix: se quitó la reconstrucción de abono/pago-completo en ambas funciones — se mantiene únicamente la de préstamos entregados, que sí es la única representación de esa plata saliendo de la cuenta.

### 🔧 Cambio — Migración a `js/modules/prestado.js` (arquitectura, seguridad)

*(2026-07-20, detalle confirmado contra código fuente el 2026-07-30)*

Migrado sobre la infraestructura ya construida (`js/core/events.js`, patrón `data-action`/`Events.registerAll`) — ver `auditoria-tecnica.md` puntos 1 y 3. Cubre "Me deben" (`S.deudores`), "Yo debo" (`S.misDeudas`) y "Préstamo con TC" en un solo archivo.

- **`onclick` → `data-action`:** 24 en total (6 estáticos en `index.html`, 18 generados dinámicamente en los renders de listas/historial) migrados a `data-action` + `Events.registerAll('prestado', ...)`. Los `onclick="event.stopPropagation()"` sueltos en filas anidadas (para no burbujear el click) se resolvieron con `data-stop-click="true"` + un único `addEventListener` centralizado en vez de pasar por el registry — no son "acciones" de negocio con nombre.
- **`.innerHTML`/`toast()`:** el módulo ya era cuidadoso en general (49 usos de `escHtml()`) — pero **dos `toast()` de "recién creado" se quedaron sin envolver**: `` `${nombre} agregado/a` `` en `addDeudor()` y `` `Deuda con ${nombre} agregada` `` en `crearMiDeuda()`, ambos con el nombre tal cual lo escribió el usuario en el sheet de alta. Los toasts de eliminar, de error, y el de advertencia de saldo (revierte con `escHtml(d.nombre)`) sí escapaban bien el mismo campo — el patrón se rompió justo en las dos confirmaciones de creación. Corregido envolviendo ambos en `escHtml()`.
- **Pendiente, no corregido esta sesión:** 9 `onchange`/`oninput` inline sin migrar, todos en las filas dinámicas de "dividir entre cuentas" (2 en split de Préstamo, 2 en split de Abono, 5 en la sección "Extra" del abono) — pasan índice de array y `this.value` directo a funciones globales. Migrarlos requiere reestructurar el render de filas para enganchar `addEventListener` después de insertar cada una (como ya se hace con `data-stop-click`), no es un cambio de una línea — queda anotado en `auditoria-tecnica.md` punto 1.
- **Sin código muerto** encontrado en el archivo.

### 🔧 Cambio — Extracción de `js/modules/deudores-personas.js` (arquitectura)

*(2026-08-01)*

Selector de persona compartido entre "Agregar persona" (Me deben) y "Nueva deuda" (Yo debo) — hasta esta sesión seguía inline en `index.html`, en un `<script>` sin migrar justo después de cargar `prestado-personas.js`, pese a que el resto de Préstamos (CRUD de `S.deudores`/`S.misDeudas` en `prestado.js`, integración "Yo debo" en `prestado-personas.js`) ya estaba migrado. Ver `auditoria-tecnica.md`, nota del 2026-08-01, para el detalle de cómo se detectó.

- **Funciones movidas tal cual, sin reescritura:** `_onSelPersonaMeDeben`, `_nuevaDeudaPersonaId`, `_initNuevaDeudaPersonaSelector`, `_onSelPersonaNuevaDeuda`, y los hooks que envuelven `openSheet` (casos `'nueva-persona'`/`'nueva-deuda'`) y `crearMiDeuda` (exige persona seleccionada, usa su `personaId` real).
- **Orden de carga:** el nuevo archivo debe cargar después de `prestado-personas.js` — envuelve `openSheet` y `crearMiDeuda`, y este último ya viene envuelto una vez por `prestado-personas.js`.
- **Se dejó a propósito en `index.html`:** el fallback `appDataLoaded` → `_inyectarPersonaSheets()`, por no ser específico de Deudores (bootstrap del sistema de Personas completo).
- `index.html`: 9.252 → 9.123 líneas (-129).
- **Comentario de cabecera de `prestado.js` actualizado** para mencionar el nuevo archivo (antes solo listaba `prestado-personas.js`) — sin este ajuste hubiera quedado desactualizado apenas se creó el tercer archivo, el mismo tipo de hallazgo que esta auditoría ya señaló varias veces en otros módulos.
- **Sin cambios de comportamiento** — es una extracción de código, no un fix funcional.

---

## Encargos

### 🔧 Cambio — `personaId` obligatorio explícito en `crearEncargo()` (el diagnóstico inicial de "listener congelado" resultó incorrecto)

*(2026-07-18, corregido el mismo día tras revisar el orden real de ejecución)*

**Diagnóstico inicial (retractado):** se pensó que `btn-crear-encargo` (enganchado con `addEventListener('click', crearEncargo)`, línea ~14803) capturaba la versión *original* de `crearEncargo` antes de que el hook que asigna `personaId` (línea ~21597) la reasignara — mismo patrón que un bug real encontrado antes al migrar Spotify (`Events.on('spotify:editar', ...)`).

**Por qué no era así acá:** ese registro de listener no ocurre al parsear el script (momento en el que sí correría antes de la reasignación), sino mucho después, dentro de `_initEventListeners()` → `_initAppUI()` → `_finishFirstLoad()`, llamada de forma asíncrona recién cuando responde el `onSnapshot` de Firestore. Los overrides de nivel superior (`crearEncargo = function(){...}`, `addDeudor = function(){...}`) ya corrieron de forma síncrona mucho antes, durante el parseo inicial del `<script>` — JS no puede intercalar un callback async en medio de la ejecución síncrona de nivel superior. Para cuando `addEventListener` finalmente lee la variable, ya apunta a la versión final con el override aplicado. El bug nunca se disparó en producción, pese a que el patrón de código coincidía exactamente con uno que sí es real en otras partes de la app.

**Qué se mantiene de este cambio (válido igual, aunque el diagnóstico de bug fuera incorrecto):**
- El listener se dejó como `() => crearEncargo()` en vez de `crearEncargo` directo — no corrige nada activo, pero deja de depender de este orden de carga tan específico para seguir siendo correcto si algo cambia a futuro (blindaje, no fix).
- `personaId` pasó a ser explícitamente obligatorio: el hook bloquea la creación con un toast de error si no hay persona seleccionada, en vez de depender implícitamente de que el campo oculto `enc_nombre` quedara vacío (ya no existe vía de "nombre libre" sin persona, ver `encargos.md §3`). Esta parte del cambio sí es funcional y se mantiene — es independiente del diagnóstico erróneo de arriba.

**Si hay encargos reales sin `personaId`:** no vienen de esta causa. Lo más probable es que sean registros creados antes de que existiera esta integración con `S.personas`, o entradas que llegaron por otra vía (import/restore) sin pasar por `crearEncargo()`.

### ✅ Corregido — Botón "Dividir ÷" quedaba con color incorrecto tras resetear (abono a cuenta)

Tres puntos distintos reseteaban el toggle de dividir del abono a un encargo (al abrir el sheet, al desmarcar "¿viene de un encargo?", al cambiar de encargo seleccionado) — los tres reseteaban el texto a `"Dividir ÷"` pero no el color, así que si el usuario había estado en modo dividir (ámbar), el botón quedaba con el texto correcto pero el color viejo. Se unificaron los tres bajo un solo helper (`_resetEncCuentaSplitToggleStyle`) para que no puedan volver a desincronizarse en el futuro.

### ✅ Corregido — Eliminar un encargo completo dejaba plata huérfana y la deuda de la tarjeta desactualizada

Borrar un movimiento individual de un encargo (ej. una compra pagada con tarjeta de crédito) siempre revertía bien sus efectos: le restaba el dinero a la cuenta destino, le bajaba la deuda a la tarjeta y refrescaba la pantalla para que el número quedara correcto al instante. Pero borrar el **encargo completo** solo sabía revertir un caso ("traspaso de sobrante"): una compra pagada con TC dentro de un encargo eliminado dejaba la plata metida en la cuenta destino sin ningún movimiento que explicara de dónde salió, y la deuda de la tarjeta seguía mostrando el valor viejo hasta que *cualquier otra acción* sin relación disparara un refresco general — momento en el que el número cambiaba solo, sin que el usuario entendiera por qué. Lo mismo pasaba con un pago de deuda de Préstamos hecho con plata de un encargo: al borrar el encargo, la deuda de esa persona seguía marcada como pagada aunque el registro del lado del encargo ya no existiera.

**Fix de diseño, no solo de reversión:** un encargo ya administrado y usado (con compras, pagos o traspasos adentro) no debería poder "deshacerse" completo sin más — esos movimientos ya son historia real. Se cambiaron las reglas del juego en vez de parchar la reversión:
- Ahora solo se puede eliminar un encargo si su saldo está en $0 — si todavía tiene plata pendiente (a favor o en contra), se avisa y no se deja continuar.
- Al eliminarlo ya no se revierte ni se borra nada vinculado (movimientos, cargos a tarjeta, pagos de deudas) — todo lo que pasó mientras el encargo existió queda intacto, exactamente como ocurrió. Eliminar el encargo pasó a significar únicamente "dejar de llevarle el registro a esta persona", no "deshacer los favores o pagos que ya pasaron".

### 🔧 Cambio — Migración a `js/modules/encargos.js` + `encargos-personas.js` (arquitectura, seguridad)

*(2026-07-18)*

Tercer módulo migrado sobre la infraestructura ya construida para Spotify y Mesada (`js/core/events.js`, patrón `data-action`/`Events.registerAll`) — ver `auditoria-tecnica.md` puntos 1 y 3.

- **`onclick` → `data-action`:** los ~20 `onclick` inline del módulo (pantalla, los 8 sheets, y los generados dinámicamente en `renderEncargosList`, `renderEncargosEnCuenta`, `abrirEncargoDetalle`, `renderEncargoParts`) pasaron a `data-action` + `Events.on()`/`Events.registerAll('encargos', ...)`. 0 restantes en el módulo.
- **Split en dos archivos, mismo motivo que Spotify:** `encargos.js` (núcleo: pantalla, sheets, movimientos, partes, traspaso, mover-cuentas, compra con TC) carga temprano, junto a `mesada.js`/`spotify.js`. `encargos-personas.js` (selector de persona en "Nuevo encargo", hook de `personaId` obligatorio, botones de perfil en lista/detalle) carga más abajo, junto a `spotify-personas.js` — depende de `getPersona`/`abrirSelPersona`/`_inyectarPersonaSheets`, definidos más adelante en el archivo. El motor de diferencial (`diffRegistrarInstancia` y compañía) y el de split (`crearSplitWidget` y compañía) se quedaron en `index.html`: los usan también Préstamos, no son exclusivos de Encargos — solo las instancias que Encargos registra en esos motores se movieron. `_normEncargos()` tampoco se movió: vive anidada en una factory compartida con `_normDeudores`/`_normSpotify`/etc., sacarla sola exigía reestructurar esa factory entera.
- **`.innerHTML`/`toast()` sin escapar — mismo patrón que Spotify (`spNombreDe`) y Mesada (`fuenteLabel`):** ~18 casos donde texto libre pasaba por una función auxiliar antes de llegar a `.innerHTML`/`toast()`, sin que el barrido original por nombre de campo los detectara. Acá las funciones eran `fuenteLabel()` (nombre de cajita/cuenta personalizada/tarjeta) e `iniciales()`: desglose por cuenta del detalle, historial de movimientos, preview de "yo puse la plata", preview y badges de "ya la usé", y los preview/toast de traspaso, mover entre cuentas y compra con TC. Se corrigieron envolviendo con `escHtml()` en el sitio de uso, mismo criterio que las rondas anteriores — no se tocó `fuenteLabel()` ni `iniciales()` en sí (siguen sin escapar internamente; queda para la segunda pasada exhaustiva de `.innerHTML` que menciona `auditoria-tecnica.md` punto 2).
- **Efecto colateral necesario:** `renderEncargosList` buscaba la tarjeta de cada encargo vía `lista.querySelector('[onclick*="..."]')` (usado por el hook de perfil en `encargos-personas.js`) — al quitar el `onclick`, ese selector se rompía. Se agregó `data-encargo-id` a la tarjeta y se actualizó el selector para usarlo.

---

## Configuración

### 🔧 Cambio — Migración a `js/modules/configuracion.js` (arquitectura, seguridad)

*(2026-07-25)*

Décimo módulo migrado sobre la infraestructura ya construida (`js/core/events.js`, patrón `data-action`/`Events.registerAll`) — ver `auditoria-tecnica.md` puntos 1, 2 y 3.

- **`onclick` → `data-action`:** los 6 `onclick` inline de la pantalla — todos estáticos, ninguno generado dinámicamente en plantillas — pasaron a `data-action` + `Events.registerAll('config', ...)`: el botón "Salir" de la cuenta de Firebase, los dos botones "+ Agregar" de categorías (variable/fijo), "Eliminar cuenta y todos los datos", y los dos accesos directos de "Herramientas" (Personas, Actividad reciente). 0 restantes en el módulo.
- **Mejora de paso, no forzada por el barrido de `onclick`:** los botones de eliminar categoría (`.cat-chip-del`, uno por categoría, generados dinámicamente en `renderCatsConfig`) no tenían `onclick` — ya usaban un `addEventListener` delegado por clase con `dataset.catTipo`/`dataset.catNombre` — así que no sumaban al conteo de `onclick`, pero tampoco pasaban por `Events`. Se migraron igual a `Events.attr('config:eliminarCat', tipo, cat)` para que la pantalla completa quede bajo un único mecanismo de despacho.
- **`.innerHTML`/`toast()`:** se revisó el módulo completo contra el mismo patrón encontrado en los ocho módulos anteriores (texto libre envuelto en una función auxiliar sin escapar) — no apareció ningún caso. Los chips de categoría y los `toast()` de agregar/eliminar ya interpolaban el nombre de la categoría con `escHtml()` en todos los sitios. Segunda vez (de diez módulos) que este hallazgo no se repite — la primera fue Alcancía.
- **Extracción de tres bloques `<script>` distintos, no de uno:** a diferencia de la mayoría de los módulos anteriores (que vivían en un único `<script>` compartido con código no relacionado), Configuración estaba repartida en tres: categorías personalizadas + backup JSON (dentro del bloque núcleo grande, junto a `S`/`save`/`escHtml`), `toggleModulo`/`borrarTodo` (otro bloque más abajo), y `exportarCSV` (compartiendo una IIFE numerada por secciones con "Búsqueda global" y Presupuestos — la misma IIFE de la que ya se habían extraído las secciones de salud financiera/proyección al migrar Inicio). Se extrajo función por función, no por límites de `<script>`, mismo método usado con TC/Cuentas/Inicio.
- **Se quedó en `index.html`, a propósito:** `applyModulos()` (además de reflejar los toggles de esta pantalla, oculta/muestra la pestaña de Spotify en el nav, la pantalla de Mesada, los banners de saldo inicial en Cuentas, y dispara `renderAttencion()` en Inicio — núcleo compartido entre varias pantallas, mismo criterio que `navTo()`/`refresh()` en TC/Inicio); todo el auth de Firebase (`_fbSignOut`, `_abrirEliminarCuenta`, `_fbDeleteAccount` — gestiona la sesión de toda la app, no solo esta pantalla); el gate completo de PIN/biometría (se muestra al abrir Mis Finanzas, no solo desde Configuración); y `getCatsVar()`/`getCatsFijo()`/`CATS_VAR_DEFAULT`/`CATS_FIJO_DEFAULT`, que comparte el módulo de Gastos.
- **Verificado, no modificado:** `leerArchivoImport()` tiene un override posterior en `index.html` ("MEJORA 5: Validación") que la reemplaza por una versión con validación de estructura del JSON antes de importar — mismo patrón que ya usa `addGastoVar` con Gastos. Sigue funcionando igual porque `configuracion.js` se carga antes que ese bloque de overrides.
- `index.html` bajó de 10.934 a 10.758 líneas (-176).

---

## Actividad reciente

### 🔧 Cambio — Migración a `js/modules/actividad_reciente.js` (arquitectura)

*(2026-07-26)*

Undécimo módulo migrado, sobre la infraestructura ya construida — ver `auditoria-tecnica.md` puntos 1 y 3. Se extrajo el "Feed de actividad financiera" (`screen-historial`), que compartía `<script>` con `navTo()` y con Tarjetas de Crédito desde el momento en que se migró TC (2026-07-20), sin relación real con ninguno de los dos — quedó anotado como pendiente en esa fecha y se cerró ahora.

- **`onclick`: nada que migrar.** Es una pantalla de solo lectura (mismo caso que Inicio) — ni el módulo ni el HTML estático de `screen-historial` tenían ningún `onclick` inline. No aporta al conteo de `onclick` restantes de la auditoría.
- **Hallazgo aparte, no de `onclick`:** el módulo registraba su propio `document.addEventListener('click', ...)` para refrescar el feed al entrar a la pantalla — un segundo listener delegado, justo lo que `events.js` dice evitar en su propio comentario de cabecera ("un solo despachador, cero duplicación"). No se convirtió a `Events.on()` porque no es una acción puntual con handler y argumentos, sino un observador de navegación sobre varios selectores a la vez — un caso que el patrón `data-action`/`Events` no cubre. Se dejó como listener aparte, pero se limpió: escuchaba tres selectores (`[data-screen="historial"]`, `#mas-historial`, `#cfg-historial-row`) y los dos primeros no existen en el HTML actual (ningún ítem del nav inferior usa ese `data-screen`, y el menú "Más" no tiene entrada "Actividad reciente") — nunca se disparaban. Se sacaron del selector, dejando solo `#cfg-historial-row`, que es el único acceso real.
- **`.innerHTML`: sin hallazgos.** Tercera vez (de once módulos, junto con Alcancía y Configuración) que no aparece texto libre sin escapar. Las siete fuentes que arma el módulo (`_normMovimientos`, `_normGastos`, `_normDeudores`, `_normSpotify`, `_normEncargos`, `_normTC`, `_normCP`) construyen `titulo`/`subtitulo` con texto libre sin escapar en el objeto intermedio, pero confluyen en un único punto de render (`renderFeedActividad()`) que sí pasa ambos por `esc()` antes de tocar el DOM — a diferencia de los módulos con hallazgos reales, acá no hay más de un sitio de salida que pueda quedar sin cubrir.
- **Sin dependencia real de orden de carga hacia abajo** (mismo caso que Mesada/Gastos/Alcancía/Configuración) — pero sí un punto sensible hacia arriba: el módulo envuelve `window.refresh()` al cargar (no dentro de una función, sino al parsear el archivo), así que necesita que `refresh()` ya exista en ese momento. El `<script src>` se dejó en la misma posición exacta del documento donde vivía el IIFE original para no romper esa garantía.
- **Se quedó en `index.html`, a propósito:** `navTo()` — navegación compartida por las 13 pantallas, no exclusiva de este módulo (mismo criterio que en TC).
- `index.html` bajó de 10.934 a 10.542 líneas (-392).

### 🔎 Nota — Discrepancia encontrada con la migración de Configuración

*(2026-07-26)*

Al trabajar sobre `index.html` para extraer Actividad Reciente se notó que el archivo recibido esta sesión **no tiene `js/modules/configuracion.js` cargado**, y que los `onclick` que la entrada del 2026-07-25 (arriba) documenta como migrados —incluido el acceso "Actividad reciente" de Configuración, relevante para este mismo módulo— siguen inline sin tocar. No se investigó ni se corrigió acá, por no ser el alcance de esta sesión; queda anotado en `auditoria-tecnica.md` para la próxima vez que se toque esa pantalla.

### 🔎 Nota — Discrepancia resuelta: la migración de Configuración sí estaba completa

*(2026-07-31)*

Al recibir `configuracion.js` y reconfirmarlo contra código fuente, se confirmó que el `index.html` de esta sesión sí tiene el módulo cargado y sus 7 `data-action="config:..."` (6 estáticos + 1 dinámico — el chip de eliminar categoría, que no se había contado como dinámico hasta ahora) exactamente donde se esperaba. La discrepancia del 2026-07-26 quedó como un artefacto puntual de esa sesión (probablemente un `index.html` de una rama o momento distinto) — la migración del 2026-07-25 sí estaba completa tal como se había registrado. No hay forma de confirmar qué causó el archivo de esa sesión sin tenerlo a mano, así que no se investiga más.

---

## Personas

### 🔧 Cambio — Migración a `js/modules/personas.js` (arquitectura, seguridad)

*(2026-07-27, confirmado contra código fuente el 2026-07-28)*

Migrado sobre la infraestructura ya construida (`js/core/events.js`, patrón `data-action`/`Events.registerAll`) — ver `auditoria-tecnica.md` puntos 1 y 3. Es el sistema base de personas (`S.personas`) del que dependen las integraciones de Spotify, Encargos y Préstamos.

- **`onclick` → `data-action`:** 10 acciones registradas (`abrirPerfil`, `abrirCrearGlobal`, `confirmarCrear`, `volverASel`, `editarDesdePerfil`, `guardarEdicion`, `selElegir`, `selCrearDirecto`, `irASpotify`, `seleccionarColor`) + 1 `data-action="personas:abrirCrearGlobal"` estático en `index.html` (acceso directo desde el menú "Más").
- **`.innerHTML`: sin hallazgos.** Tercera vez (de trece módulos, junto con Alcancía y Configuración) que no aparece texto libre sin escapar — los ~15 sitios donde interpola `nombre`, `nota`, iniciales o el término de búsqueda ya pasan por `escHtml()`.
- **Hallazgos nuevos, no contados en ninguna cifra de la auditoría hasta esta sesión:** un `onclick="_irAEncargo('${e.id}')"` inline en el botón "Ver →" de cada encargo del perfil de persona (generado dinámicamente, así que nunca apareció en el grep de `index.html`); un `oninput="_selPersonaFiltrar()"` inline en el buscador del sheet de selección de persona (primer caso de `oninput` encontrado en todo el código); y 3 pares `onmouseenter`/`onmouseleave` inline (fila de persona, de deudor, y de "le debo"), que confirman con casos concretos un hallazgo que la auditoría solo mencionaba en abstracto.
- **Sin código muerto** encontrado en el archivo.

### ✅ Corregido — Último `onclick` de negocio pendiente: `_irAEncargo` migrado a `data-action`

*(2026-07-29, con `js/modules/encargos-personas.js`)*

El `onclick="_irAEncargo('${e.id}')"` encontrado el 2026-07-28 (arriba) quedaba sin migrar porque `_irAEncargo()` vive en `encargos-personas.js`, cargado después de `personas.js` — migrarlo requería registrar el evento desde ese archivo, no desde `personas.js`. Con `encargos-personas.js` en mano:

- `personas.js`: el botón pasó a usar `${Events.attr('encargos-personas:irAEncargo', e.id)}`.
- `encargos-personas.js`: se agregó `Events.on('encargos-personas:irAEncargo', _irAEncargo);` junto a la función, siguiendo el mismo patrón que el resto del archivo. El orden de carga no es un problema: `Events.attr()` solo arma el atributo en el momento de renderizar el perfil (después de que todos los `<script>` ya cargaron).

Con esto, el conteo de `onclick` de negocio pendiente de toda la app quedó en 0 — verificado contra los tres archivos involucrados (`personas.js`, `encargos-personas.js`, `index.html`), no una resta.

**Hallazgo de estilo aparte, no de seguridad:** `encargos-personas.js` engancha sus dos botones de "Ver perfil" (avatar de la card de encargo, chip del detalle) con `.onclick = () => ...`/`addEventListener('click', ...)` en vez de `data-action`/`Events`. No es un problema de CSP (son asignaciones desde JS, no atributos inline en el HTML), pero es inconsistente con el mecanismo único de despacho del resto de la app. No se tocó, por bajo impacto.

**Corrección de comentario:** el comentario de cabecera de `encargos-personas.js` decía que la integración de "Deudores" con Personas todavía no se había migrado — desactualizado. Deudores sí está migrado, en `js/modules/prestado.js` (ver esa sección más arriba). Corregido.

---

## Núcleo compartido — búsqueda global

### 🔧 Cambio — Extracción de `js/core/busqueda-global.js` (arquitectura)

*(2026-07-26)*

El bloque "2. BÚSQUEDA GLOBAL" (304 líneas) vivía inline en `index.html`, dentro del mismo IIFE compartido que "Ocultar/mostrar saldos" y, ya solo como comentarios de migración, las secciones de salud financiera/proyección/presupuestos/CSV que se habían extraído en sesiones anteriores (Inicio, Análisis, Configuración). Se extrajo a `js/core/busqueda-global.js` — en `js/core/`, no en `js/modules/`, mismo criterio que `movimientos.js`: busca sobre datos de casi todos los módulos de dominio (`S.gastosVar`, `S.deudores`, `S.cajitas`, `S.cuentasPersonalizadas`, `S.encargos`, `S.personas`, `S.misDeudas`, `S.spotifyPersonas`, `S.movimientos`, etc.), así que no encaja en ningún módulo de dominio individual.

- **Sin dependencia real de orden de carga:** igual que `movimientos.js`, la navegación a un módulo específico (`abrirDeudor`, `abrirEncargoDetalle`, `abrirCuenta`, `abrirMiDeuda`, `abrirDetalleCajita`, `abrirPerfilPersona`, `spNombreDe`, `spPersonaPagadaVigente`) ya se resolvía en tiempo de click vía `typeof X === 'function'`, no al parsear el script. No hizo falta partir el archivo en dos ni reordenar ningún `<script src>` existente.
- Se cargó como `<script src="js/core/busqueda-global.js"></script>` en el mismo punto exacto donde antes vivía el IIFE.
- `index.html`: 8.617 → 8.320 líneas (-297).
- **Sin cambios de lógica** — extracción quirúrgica, código movido tal cual. Se detectó (no se corrigió, ver `auditoria-tecnica.md` punto 2) que el mensaje de "Sin resultados para..." interpola el término buscado sin `escHtml()` — preexistente, no introducido por este movimiento.

---

## Núcleo compartido — detalle y eliminación de movimientos

### ✅ Corregido — `eliminarMovimiento()` no revertía ni borraba movimientos tipo `ingreso`/`apertura`/`entrada` (no-op silencioso)

*(2026-07-26)*

La cadena `if/else if` de `eliminarMovimiento()` tenía **dos ramas idénticas** para `movTipoEl === 'ingreso' || 'apertura' || 'entrada'`: la primera, vacía (solo un comentario, sin código), y más abajo una segunda con la lógica real (buscar el movimiento, revertir el saldo con `descontarFuente()`, registrar el ajuste en `_ajustesBaseLog` si era `'apertura'`, y borrarlo de `S.movimientos`/la cuenta custom). Por ser un `else if`, la primera rama capturaba la condición y la segunda quedaba **inalcanzable**.

Efecto real: al borrar desde el feed general un movimiento de entrada manual o de apertura de cuenta, la función no hacía nada — ni revertía el saldo ni quitaba el registro — pero igual mostraba el toast "Movimiento eliminado y saldos revertidos" y llamaba a `save(); refresh();`. El movimiento reaparecía intacto tras el refresh, dando la falsa impresión de que el borrado había funcionado.

**Fix:** se eliminó la rama vacía; la lógica real (ya escrita, solo inalcanzable) queda como único punto de entrada para ese tipo de movimiento.

### ✅ Corregido — `eliminarMovimiento()` no buscaba en `S.deudores` al chequear movimientos vinculados

*(2026-07-26)*

El chequeo de "¿es un movimiento secundario generado por otra sección?" (`movObj`) recorría `S.movimientos`, `S.encargos`, `S.cajitas`, `S.cuentasPersonalizadas`, `S.gastosVar` y `S.spotifyHistorial`, pero no `S.deudores` — el propio bug de duplicados de Préstamos (ver sección "Préstamos" arriba, *"Duplicado sin candado del mismo abono..."*) ya había señalado este hueco al describir por qué la copia duplicada del abono no quedaba bloqueada. Aunque ese bug puntual ya se cerró (se dejó de reconstruir la copia duplicada en `getMovimientosCuenta()`), el hueco en sí — que `eliminarMovimiento()` no revisara `S.deudores` — seguía sin cerrarse y podía volver a morder si algún flujo futuro genera un movimiento `_secundario` cuyo `id` coincida con uno de `S.deudores`.

**Fix:** se agregó `S.deudores` a la búsqueda de `movObj`, con el mismo patrón usado para encargos/cajitas/cuentas personalizadas.

**Nota de arquitectura (sin resolver):** `abrirDetalleMov()` (~346 líneas) y `eliminarMovimiento()` (~165 líneas) siguen viviendo en `index.html` pese a que ya se migraron trece módulos — son las dos únicas funciones "núcleo" usadas por *todas* las pantallas para mostrar/borrar un movimiento del feed general, así que no encajan en ningún módulo de dominio individual. Extraerlas requeriría un archivo tipo `js/core/movimientos.js` (o similar), separado de los módulos de dominio — no se hizo en esta sesión por no ser el alcance, pero queda anotado en `auditoria-tecnica.md` junto al resto de la arquitectura monolítica.

### 🔧 Cambio — Extracción de `js/core/movimientos.js` (arquitectura)

*(2026-07-26)*

`abrirDetalleMov()` (~346 líneas) y `eliminarMovimiento()` (~165 líneas) quedaron pendientes de extraer desde que se migró Cuentas (2026-07-22), donde ya se habían registrado bajo el namespace `core:` en vez de `cuentas:` por ser núcleo compartido por las 13 pantallas, no de un dominio en particular. Se extrajeron esta sesión a `js/core/movimientos.js` — junto a `events.js`, no en `js/modules/`, mismo criterio de ubicación.

- **Sin dependencia real de orden de carga:** a diferencia de Spotify/Encargos (que sí necesitaron partirse en dos archivos), acá ninguna de las dos funciones se llama en el momento en que el script se parsea — ambas se disparan vía `data-action="core:..."` en tiempo de click, mucho después de que todos los `<script>` ya cargaron. Por eso no hizo falta tocar el orden de `<script src>` existente: el archivo se cargó en el mismo punto donde antes vivía el registro `Events.on`.
- **El registro `Events.on('core:abrirDetalleMov', ...)` / `Events.on('core:eliminarMovimiento', ...)` se movió adentro del propio módulo** (mismo patrón que usa cada módulo de dominio para registrarse a sí mismo), en vez de quedarse en `index.html` como wiring aparte.
- **Comentario de cabecera nuevo en el archivo** explicando por qué vive en `js/core/` y no en `js/modules/`, y listando las dependencias del núcleo (`S`, `save`, `refresh`, `escHtml`, `fmt`, `fuenteLabel`, `getSaldoFuente`, `getMovimientosCuenta`, etc.) y de otros módulos ya migrados (`tcEliminarCompraInterna`/`tcEliminarPagoInterna` de TC, `abrirCustomCuenta`/`renderDetalleCuenta` de Cuentas, `getEncargo` de Encargos) de las que depende.
- `index.html`: 9.123 → 8.617 líneas (-506).
- **Sin código muerto ni hallazgos de `.innerHTML` nuevos** en el archivo extraído — ya usaba `escHtml()` en todos los puntos de texto libre desde antes.

---

## Cuentas

### 🔧 Cambio — Wiring propio movido de `index.html` a `cuentas.js` (arquitectura)

*(2026-07-26)*

Los 31 `addEventListener` (más un `.onclick`) de los controles de esta pantalla — cuenta personalizada, CDT, meta de ahorro en cajita, agregar/restar dinero, editar apertura, transferir, selector de cuentas, Nequi/Efectivo, Nu (entró/salió plata), agregar cajita, menú combinado de agregar dinero y tasa EA de Nu — vivían en `_initEventListeners()` (`index.html`), mezclados con los de Encargos/TC/Préstamos (el único grupo que aún queda por redistribuir; ver abajo los casos que se quedan en `index.html` a propósito, no por faltar turno). No eran `onclick` inline (sin problema de CSP) — se movieron por organización, cada listener a su módulo dueño, mismo patrón ya aplicado a Mesada, Spotify y Gastos. Todas las funciones destino ya vivían en `cuentas.js` desde su migración del 2026-07-22; esta sesión solo movió el wiring.

**Dos casos que a primera vista parecían de Cuentas se dejaron en `index.html` a propósito:**
- `mov_fuente` (sheet "Registrar movimiento") es de **Préstamos**, pese al nombre parecido a otros selectores de fuente ya migrados.
- El selector de color de avatar (`[data-pick-color]`) es de **Personas** (sheet "Nueva persona"), no de Cuentas. Se encontró de paso que `selColor()`, la función que ese listener invoca, **no está definida en ningún archivo revisado** — posible referencia rota preexistente, no introducida por este cambio; no se investigó por no ser el alcance de esta sesión.

Las cards del FAB "+" que abren flujos de Cuentas (`menu-agregar-dinero`, `menu-transferir`) se quedaron en `index.html` por la misma razón ya documentada para Gastos: son parte del mismo menú compartido.

**Verificado:** sintaxis de los 19 bloques `<script>` inline de `index.html` (concatenados) y de `cuentas.js`, con `node --check`, sin errores. Se confirmó que ninguna de las 31 variables movidas a nivel superior de `cuentas.js` colisionara con una declaración `const`/`let` ya existente en otro punto del documento — todas vivían antes exclusivamente dentro del scope de función de `_initEventListeners()`.

`_initEventListeners()` en `index.html`: ~200 → 141 líneas. Con esto van 58 de ~80 listeners originales redistribuidos; queda por redistribuir Encargos/TC/Préstamos. Esa sesión no dejará la función vacía: seguirán ahí, a propósito, el wiring núcleo genérico (nav, dialog, close-sheet delegado, `data-save-refresh`), las cards del FAB "+" de Gastos/Cuentas, el tab-bar de Gastos y el color picker de avatares de Personas (con el bug de `selColor()` no definida). Ver `auditoria-tecnica.md`, punto 3.

---

## Personas

### ⚠️ Corrección — El listener de `selColor()` no estaba roto: se había borrado por error

*(2026-07-27, misma fecha, sesión posterior)*

La nota anterior de esta misma fecha decía que `selColor()` "no está definida en ningún archivo de la app" y eliminaba el listener de `[data-pick-color]` en `index.html` dándolo por código muerto. Era una conclusión apurada: no se había revisado `prestado.js` todavía en ese momento (recién se subió después). `selColor()` sí existe — en `prestado.js`, junto a `npColorSel`/`initColorPicker()`/`.avatar-color-opt` — y `addDeudor()` la usa para guardar el color del nuevo deudor. El sheet "Nueva persona" es en realidad el alta de **Deudores** (Préstamos), no del sistema genérico de Personas; el nombre del sheet confunde.

- Se restauró el listener y se movió a `prestado.js` (junto a `selColor`), en vez de dejarlo borrado o devuelto a `index.html`.
- En el momento de esta nota se pensó que `btn-crear-deudor` sin wiring era "un hueco real" pendiente de `deudores-personas.js` — ver la nota siguiente, que lo cierra con el archivo en mano.

---

### 🔎 Nota — `deudores-personas.js` revela que todo el sheet es código muerto (no solo `btn-crear-deudor`)

*(2026-07-27, misma fecha, tercera sesión)*

Con `deudores-personas.js` disponible se cierra el hallazgo anterior, pero con un resultado distinto al esperado: no era solo que `btn-crear-deudor` le faltara wiring — **el sheet `#sheet-nueva-persona` completo nunca se muestra**. `deudores-personas.js` sobrescribe `openSheet()` e intercepta `id === 'nueva-persona'` con un `return` antes de invocar el original, redirigiendo en su lugar a `abrirSelPersona(_onSelPersonaMeDeben)` — el selector genérico de Personas (elegir persona existente o crear una nueva desde ahí). El botón que abre este flujo (`btn-nueva-persona`, `data-action="prestado:abrirSheetNuevaPersona"`) sigue disparando `openSheet('nueva-persona')`, pero el wrapper de `deudores-personas.js` la intercepta antes de que el sheet real se pinte.

- **En consecuencia, son código muerto en la práctica** (nunca se ejecutan con la app armada tal como está hoy): el sheet `#sheet-nueva-persona` en sí, su color picker (`.avatar-color-opt`/`[data-pick-color]`), `selColor()`, `npColorSel`, `initColorPicker()` y `addDeudor()` — nada de esto tiene ya una vía de ejecución real, con o sin el wiring del listener restaurado en la nota anterior.
- **No se borró nada.** Se dejó el wiring restaurado y las funciones tal cual, con un comentario nuevo en `prestado.js` explicando por qué es código muerto y por qué no se toca — mismo criterio ya aplicado en el proyecto con `toggleCDT()`/`toggleCajita()` (Cuentas) y el bloque deshabilitado con `if(false)` de Alcancía: se documenta, no se elimina de paso.
- **Se descarta la lectura anterior** ("`btn-crear-deudor` es un hueco real que falta wiring"): no es que falte un wiring puntual, es que toda la ruta quedó reemplazada por la integración con Personas y nadie retiró el código viejo. Distinto tipo de hallazgo al que se había anotado.

---

## Núcleo compartido — cierre de `_initEventListeners()`

### 🔧 Cambio — Redistribución final: Encargos y Préstamos (arquitectura)

*(2026-07-27)*

Último grupo pendiente de `_initEventListeners()` (`index.html`): los controles con `oninput`/`onchange` de los sheets "Nuevo movimiento"/"Compra con TC" (Encargos), "Registrar movimiento" (Préstamos) y los 4 previews del motor Diferencial.

**Hallazgo antes de mover nada:** el grupo nunca fue "Encargos/TC/Préstamos" como decían las notas anteriores de este documento y de `auditoria-tecnica.md`. Se revisó `tarjetas_credito.js` completo y no referencia ni un solo `ctc_*`, `movenc_*` ni `mov_*` — los campos `ctc_monto`/`ctc_cuenta_enc`/`ctc_tarjeta`/`ctc_destino` son del sheet "Compra con TC" de **Encargos** (gastar plata de un encargo cargándola a una tarjeta), un flujo de Encargos, no de Tarjetas de Crédito. El grupo real era **Encargos + Préstamos**; Tarjetas de Crédito no tenía nada que redistribuir acá y no se tocó.

**Movido a `js/modules/encargos.js`** (nuevo bloque antes de `Events.registerAll('encargos', ...)`):
- `movenc_monto` (input) → `_movEncSplitPreview`
- `movenc_mia_cuenta_sale`/`movenc_mia_cuenta_entra` (change) → `_movEncMiaPreview`
- `ctc_monto` (input), `ctc_cuenta_enc`/`ctc_tarjeta`/`ctc_destino` (change) → `_ctcActualizarPreview`
- Previews de Diferencial: `movenc_dif_real` → `_difResumen`, `ctc_dif_real` → `_ctcDifResumen`, `usar_parte_dif_real` → `_usarParteDifResumen`

**Movido a `js/modules/prestado.js`** (extendiendo el bloque de listener directo ya existente, más un bloque nuevo justo después):
- `mov_desde_encargo`, `mov_enc_sel`, `mov_enc_cuenta`, `mov_tiene_extra` (change), `mov_extra_monto` (input)
- `prtc_dif_real` (input) → `_prtcDifResumen`
- `mov_fuente` (change) → `mostrarAlertaFuente('mov')`
- `_onMovMontoInput` se fusionó dentro del listener de `mov_monto` que `prestado.js` ya tenía (`_updatePrestSplitResumen`), en vez de registrar un segundo `addEventListener` separado sobre el mismo campo.

**Verificado:** `node --check` sin errores en `encargos.js`, `prestado.js`, `tarjetas_credito.js` (sin cambios) y en los bloques `<script>` inline de `index.html` concatenados. Todas las funciones movidas son declaraciones `function` (hoisted) dentro del mismo archivo destino donde ya vivían — sin dependencia de orden de carga entre módulos, mismo criterio que Cuentas.

`_initEventListeners()` en `index.html`: 141 → **~118 líneas**. Con esto se cierra del todo la redistribución activa. Lo que queda en la función, a propósito y sin plan de moverse: wiring núcleo genérico compartido por las 13 pantallas (nav, dialog, close-sheet delegado, `data-save-refresh`), las cards del FAB "+" de Gastos/Cuentas (comparten menú) y el tab-bar de Gastos (wiring genérico pero enganchado a `switchGastoTab()`, de `gastos.js`). El color picker de avatares de Personas ya no vive acá — ver corrección arriba. Ver `auditoria-tecnica.md`, punto 3, para el detalle completo.

---

## Préstamos, Personas, Configuración

### 🔧 Cambio — Migración de los últimos `onchange`/`oninput`/hover inline

*(2026-08-02)*

Cierre del punto 1 de `auditoria-tecnica.md` en lo que quedaba fuera del conteo de `onclick`: 9 `onchange`/`oninput` en Préstamos, 1 `oninput` en Personas, y los 4 pares `onmouseenter`/`onmouseleave` con ubicación exacta confirmada (3 en Personas, 1 en Configuración), más 2 más encontrados de paso en `index.html` (Cuentas).

**`prestado.js` — 9 `onchange`/`oninput` de filas dinámicas migrados** en los tres puntos donde vivían:
- Split de origen del préstamo (`_renderPrestSplit`): `onchange`/`oninput` → clase `._prest-split-fuente`/`._prest-split-monto` con `data-i`, wireadas con `addEventListener` justo después del `innerHTML =`.
- Split de destino del abono (`abonoRenderSplit`): mismo patrón, reutilizando las funciones globales ya existentes `abonoSplitFuente`/`abonoSplitMonto`.
- Sección "Extra" del abono (`extRenderPartes`): los 5 campos (`extSetCuenta`, `extSetDesc`, `extSetQuien`, `extSetTipo`, `extSetMonto`) migrados igual, junto al wiring de `data-stop-click` que el archivo ya tenía — un solo bloque de `querySelectorAll(...).forEach(...)` al final de la función, sin infraestructura nueva.

**`personas.js` — el `oninput` del buscador y los 3 pares de hover migrados:**
- `#sel-persona-buscar` (sheet de selección de persona): `addEventListener('input', _selPersonaFiltrar)` wireado una sola vez dentro de `_inyectarPersonaSheets()`, que ya tiene guard contra doble inyección.
- Las 3 filas con hover (persona con perfil, deudor sin perfil, "le debo" sin perfil, en `_renderListaPersonas`): el color varía por fila, así que no se pudo resolver con un `:hover` de CSS puro — se agregó `data-hover-color="${color}"` + `addEventListener('mouseenter'/'mouseleave', ...)` sobre `._persona-row-hover` tras cada render, mismo patrón que el archivo ya usaba en `_selPersonaFiltrar()` para el hover de la lista de selección de persona.

**`configuracion.js` — el par restante sí se resolvió con CSS puro:** a diferencia de Personas, los colores del botón de eliminar categoría son fijos (`var(--red)`/`var(--text3)`), así que se quitó el `onmouseenter`/`onmouseleave` inline y se agregó `.cat-chip-del:hover{color:var(--red);}` al `<style>` de `index.html`.

**De paso, en `index.html`:** se resolvieron también los 2 pares `onmouseenter`/`onmouseleave` de las tarjetas "Meta"/"CDTs" del detalle de cajita (Cuentas) — colores fijos, mismo tratamiento con `:hover` en CSS (`#cajita-det-meta-card:hover`, `#cajita-det-cdt-card:hover`).

**Verificado:** `node --check` sin errores en `personas.js`, `prestado.js` y `configuracion.js`. No se tocó ningún `Events.attr`/`data-action` existente ni ninguna función de negocio.

**Sin cerrar todavía:** ~9 pares `onmouseenter`/`onmouseleave` sin ubicación exacta confirmada (de los ~13 estimados originalmente) y los 24 `onclick` del gate de PIN/biometría/login — ver `auditoria-tecnica.md`, punto 1, para el detalle.

---

## Tarjetas de Crédito

### 🐛 Bug — `ReferenceError: abrirDetalleMov is not defined` al cargar la app

*(2026-08-03)*

Reportado desde la consola del navegador. `tarjetas_credito.js` registra `verMov: abrirDetalleMov` (referencia directa) dentro de `Events.registerAll('tarjetas', {...})`, que se ejecuta en el momento en que el script carga — pero `abrirDetalleMov()` vive en `js/core/movimientos.js`, que en `index.html` carga **después** de `tarjetas_credito.js` (línea 6257 vs 6258). El comentario junto al `<script src="js/modules/tarjetas_credito.js">` decía explícitamente "no tiene una dependencia real de orden de carga" — cierto cuando se escribió, pero quedó desactualizado el 2026-07-26, cuando `abrirDetalleMov`/`eliminarMovimiento` se extrajeron de `index.html` a `js/core/movimientos.js` (ver nota de Cuentas de esa fecha) sin revisar qué otros módulos ya cargados antes las referenciaban directo.

- **Corregido envolviendo la referencia en una función anónima** (`verMov: (...args) => abrirDetalleMov(...args)`), exactamente el mismo patrón que `prestado.js` ya usa para el mismo problema con la misma función (`abrirDetalleMov: (el, evt) => abrirDetalleMov(el, evt)`, ver el comentario de cabecera de su bloque `Events.registerAll`) — la búsqueda del nombre global se resuelve recién al hacer click, no al cargar el script.
- **No se reordenaron los `<script>`** (mover `movimientos.js` antes de `tarjetas_credito.js` también lo hubiera resuelto) para no arriesgar otra dependencia oculta en sentido contrario — mismo criterio conservador que el proyecto ya viene aplicando con el arranque de Auth/Firestore (`auditoria-tecnica.md`, punto 4).
- **Comentario desactualizado en `index.html` corregido** para dejar registrado que sí existe esta dependencia de orden de carga y por qué el wrapper la resuelve.
- **No se investigó si hay más referencias directas del mismo tipo** a `abrirDetalleMov`/`eliminarMovimiento` en otros módulos que cargan antes de `movimientos.js` — se revisaron `personas.js`, `prestado.js` y `configuracion.js` (los tres disponibles esta sesión) sin encontrar otro caso; `spotify.js`, `mesada.js`, `encargos.js`, `gastos.js`, `cuentas.js`, `plata_comprometida.js`, `alcancia.js` y `analisis.js` no se revisaron.

---

## Infraestructura / seguridad

### ✅ Corregido — Migración final del gate de PIN/biometría/login a `data-action`/`Events`

*(sesión posterior a 2026-08-03)*

Cierre definitivo del punto 1 de `auditoria-tecnica.md` (migrar `onclick` inline → `Events`). El documento venía arrastrando dos estimaciones que nunca se habían verificado línea por línea contra el archivo real:

- **Los ~9 pares `onmouseenter`/`onmouseleave` "sin ubicar" no existían.** `grep -n "onmouseenter" index.html` no devuelve ningún atributo inline — solo dos comentarios en el `<style>` que documentan que esos hovers ya se habían resuelto con CSS en la sesión del 2026-08-02. El estimado quedó desactualizado desde ese momento.
- **Los "24 `onclick`" del gate de PIN/biometría/login eran 21.** Filtrando un comentario de texto (línea 13) y un template string que construye el atributo en vez de contenerlo literal (línea 5550), quedaban 21 ocurrencias reales.

**Los 21 se migraron a `data-action`/`Events`, bajo dos namespaces nuevos:**
- **`pin:`** — teclado numérico del PIN (`pin:key`, con el dígito como `data-args`), botón borrar (`pin:del`), botón huella/Face ID (`pin:bioTrigger`), "¿Olvidaste el PIN?" (`pin:olvide`), y los dos botones dinámicos de PIN/biometría en Configuración, generados por `_renderBtn()`/`_renderBioBtn()` (`pin:setNew`, `pin:disable`, `pin:bioSetup`, `pin:bioDisable`). Todas estas funciones ya vivían como `window._x = function(){...}` dentro del mismo `<script type="module">` (el bloque "PIN + BIOMETRÍA").
- **`authgate:`** — botón "Entrar con Google" (`authgate:signIn`), cancelar/confirmar eliminar cuenta (`authgate:cerrarEliminarCuenta`, `authgate:eliminarCuenta`). Namespace separado de `pin:` porque estas funciones (`_fbSignIn`, `_cerrarEliminarCuenta`, `_fbDeleteAccount`) viven en otro `<script type="module">` distinto (el de autenticación de Firebase) — mismo criterio ya usado con `config:signOut`: el namespace lo decide el botón que llama, no dónde vive la función.

`Events.registerAll('pin', {...})` y `Events.registerAll('authgate', {...})` se agregaron inline, cada uno al final del bloque `<script type="module">` correspondiente, después de la última asignación `window._x = function(){...}` que necesitaban — no hizo falta mover ninguna función a un archivo `.js` nuevo, mismo patrón ya usado para el namespace `core:`.

**Verificado:** `node --check` sobre ambos bloques `<script>`, extraídos por rango de líneas exacto (no con un regex ingenuo sobre `<script>...</script>`, que da falsos positivos cuando un comentario HTML menciona la palabra "`<script`" como texto). Sin errores. Se confirmó además que las 11 funciones referenciadas (`_pinKey`, `_pinDel`, `_pinBioTrigger`, `_pinOlvide`, `_pinSetNew`, `_pinDisable`, `_bioSetup`, `_bioDisable`, `_fbSignIn`, `_cerrarEliminarCuenta`, `_fbDeleteAccount`) siguen existiendo con el mismo nombre.

**Conteo real de `onclick`/`onchange`/`oninput`/hover inline en todo `index.html`, tras esta sesión: 0.**

**Hallazgo nuevo que queda abierto (no se tocó):** con el `onclick` en cero, se revisó si esto ya permitía sacar `'unsafe-inline'` de `script-src` en la CSP, como asumía el comentario del propio archivo — no es así. `'unsafe-inline'` en `script-src` también habilita cualquier bloque `<script>` inline sin `nonce`/`hash`, y `index.html` sigue teniendo docenas de ellos (ahí vive casi toda la lógica de negocio hoy). Quitar la directiva tal como está el archivo rompería la app entera. Se corrigió el comentario de la CSP en `index.html` para que ya no afirme lo contrario; la directiva en sí no se tocó. Detalle y opciones (nonce por request, hashes por bloque, o terminar de externalizar todo) en `auditoria-tecnica.md`, punto 1 (reescrito).

### ✅ Corregido — 22 `aria-label` faltantes en botones ícono-solo

*(misma sesión)*

Barrido programático sobre todos los `<button>` de `index.html` para encontrar botones que solo tienen un ícono SVG (sin texto visible) y no tenían `aria-label`. Aparecieron 22, repartidos en Cuentas (10: volver ×4, editar/eliminar cuenta personalizada, volver a Nu, eliminar cajita, volver a Meta de ahorro, volver a CDTs), Préstamos (6: volver deudores, editar/eliminar deudor, volver mis deudas, editar/eliminar mi deuda), Mesada (2: año anterior/siguiente), Encargos (3: volver, editar, eliminar) y el gate de PIN (1: borrar dígito). Se les agregó `aria-label` a los 22, reusando el texto del `title` ya existente donde lo había (ej. `title="Editar cuenta"` → se le sumó `aria-label="Editar cuenta"`) para no inventar redacciones distintas a las que el usuario ya ve en el tooltip. Verificado con un segundo barrido tras el cambio: 0 botones ícono-solo sin `aria-label` en todo el archivo (30 `aria-label` en total, contando los 8 que ya existían).

### 🔧 Nuevo — Bloques `<script>` inline: de 18 a 3 (punto 2 de la auditoría, CSP)

*(sesión posterior)*

Primer avance real del punto 2 (sacar `'unsafe-inline'` de `script-src`). Se descartó nonce de entrada — GitHub Pages sirve archivos estáticos, sin servidor que genere un valor aleatorio por request y lo mande en una cabecera HTTP real, así que un nonce fijo en el HTML no protegería nada. También se descartó hash (`'sha256-...'`) como estrategia general: es viable para contenido que no cambia, pero cualquier edición futura a un bloque invalida su hash y el navegador lo bloquea en silencio — inaceptable para el núcleo (`S`, `save()`, `refresh()`), que se sigue tocando activamente sesión a sesión. La única opción sin ese riesgo es seguir el mismo patrón que ya se usa para los módulos: externalizar a `.js` con `<script src>`, cubierto automáticamente por `'self'`.

Se inventariaron los 18 bloques `<script>` inline que quedaban (sin `src`) y se separaron en tres grupos:

**A) 6 bloques sin código real, solo comentarios de migraciones anteriores** (`"Módulo X migrado a js/modules/x.js, ver..."`) — convertidos directo a comentarios HTML (`<!-- -->`), sin extraer nada porque no había nada que extraer. Cero riesgo funcional: no ejecutaban código.

**B) 9 bloques autocontenidos, sin dependencia de orden de carga con el núcleo** — externalizados a `js/core/`, cada uno cargado en la misma posición exacta donde vivía el bloque original (preserva el orden de carga con respecto a todo lo demás):

| Archivo nuevo | Contenido | Líneas |
|---|---|---|
| `js/core/firebase-init.js` | Init de Firebase (config, auth, `onAuthStateChanged`) — `type="module"` | 74 |
| `js/core/firebase-sync.js` | Sync con Firestore: `setSyncStatus`, `_fbSaveToCloud`, `_fbLoadData`, `onSnapshot` — `type="module"` | 464 |
| `js/core/pin-bio.js` | Sistema de PIN + biometría (WebAuthn) — `type="module"` | 352 |
| `js/core/mejoras.js` | Ocultar saldos, hook de `refresh()` para salud/proyección/presupuestos, validación de montos, animación de carga inicial | 135 |
| `js/core/mejoras-adicionales.js` | Registro de Service Worker, autofocus de formularios, aria-labels de pantallas | 87 |
| `js/core/nav.js` | `navTo()` — navegación global entre las 13 pantallas | 32 |
| `js/core/bootstrap.js` | `iniciales()`, fecha del header, autosave cada 60s | 20 |
| `js/core/personas-init.js` | Inicialización de `_inyectarPersonaSheets()` al cargar datos | 19 |
| `js/core/import-validado.js` | `_validarEstructuraJSON()` + override de `leerArchivoImport` — debe cargar después de `configuracion.js` | 82 |

**C) 3 bloques deliberadamente NO tocados** — el núcleo compartido por toda la app: definición de `S`, `save()` (955 líneas), el sheet-stack (`openSheet`/`closeSheet`, 516 líneas) y `refresh()` + menú "Más" (389 líneas). Alto acoplamiento, cambian con frecuencia, y moverlos de verdad implica la reestructuración de los puntos 3/4 de la auditoría (Auth/Firestore → PIN → datos, y modularización por dominio), no un cambio quirúrgico aislado. Quedan como los únicos 3 bloques que siguen requiriendo `'unsafe-inline'`.

**Verificación:** cada archivo nuevo pasó `node --check` (o `--input-type=module --check` para los tres `type="module"`) sin errores. Los 3 bloques que quedaron inline en `index.html` también se re-verificaron con `node --check` extrayéndolos por rango de línea exacto, no con un regex sobre `<script>...</script>` — ese regex da falsos positivos apenas un comentario menciona la palabra "`<script`" como texto (pasó en esta misma sesión al intentarlo). Conteo final de `<script>` en `index.html`, verificado con un parser HTML real (no regex): 35 tags — 32 con `src`, 3 inline. `index.html` bajó de 8.219 a 6.963 líneas (-1.256).

Comentario de la CSP actualizado para reflejar el conteo real (3 bloques, no "decenas") y documentar por qué nonce no es viable en este hosting. La directiva `script-src` en sí **no se tocó** — sigue con `'unsafe-inline'`, porque los 3 bloques del núcleo todavía lo necesitan.

**Corrección posterior, en el mismo día:** 2 de estos 9 archivos (`firebase-init.js`, `firebase-sync.js`) se revirtieron a inline por un bug real en producción — ver la entrada siguiente.

### 🐛 Corregido — "No hay handler registrado para authgate:signIn" al externalizar firebase-init/firebase-sync

*(sesión posterior, reportado por el usuario en producción)*

Al probar el login después de la extracción de arriba, el botón "Entrar con Google" no hacía nada — la consola mostraba `[Events] No hay handler registrado para la acción "authgate:signIn"`.

**Causa raíz:** `js/core/firebase-init.js` es el que hace visible la pantalla de login (`fb-login-screen.style.display='flex'`) apenas termina de ejecutarse. `js/core/firebase-sync.js` es el siguiente `<script type="module">` en el documento, y ahí vivía `Events.registerAll('authgate', {signIn: ...})`. Antes de la extracción, los dos eran bloques `<script type="module">` **inline** — ya venían completos en el HTML descargado, sin necesitar ninguna petición de red aparte para poder ejecutarse. Al externalizarlos, cada uno pasó a depender de su propio fetch antes de poder correr. Los scripts `type="module"` se ejecutan en orden estricto del documento, así que si `firebase-sync.js` todavía no terminó de descargarse cuando `firebase-init.js` ya mostró el botón — algo totalmente plausible con red lenta o primera carga sin caché — quedaba una ventana real en la que el botón ya es clickeable pero su handler todavía no se registró. El propio código ya tenía esta misma preocupación resuelta para el gate de PIN (`window._pinGateTimeout`, un `setTimeout` de 5s de seguridad si el módulo PIN tarda en cargar), pero el registro de `authgate` no tenía ningún mecanismo equivalente — nunca lo había necesitado, porque siempre estuvo inline.

**Fix:** se revirtieron específicamente `firebase-init.js` y `firebase-sync.js` a bloques `<script type="module">` inline (tal como estaban antes de esta sesión) — son los dos únicos, de los 9 extraídos, que están en el camino crítico *antes* de que exista cualquier pantalla de carga que proteja al usuario de esta carrera. Los otros 7 (`pin-bio.js`, `mejoras.js`, `mejoras-adicionales.js`, `nav.js`, `bootstrap.js`, `personas-init.js`, `import-validado.js`) quedaron externalizados: no gatean nada visible antes de tiempo, y en el caso puntual de `pin-bio.js` ya existe el fallback de 5s mencionado arriba por si tarda en cargar. Bloques `<script>` inline resultantes: **5** (no 3 como se documentó primero) — los 3 del núcleo (`S`/`save()`, sheet-stack, `refresh()`) más estos 2. Verificado con `node --input-type=module --check` sobre ambos bloques reinsertados, sin errores.

### 🐛 Corregido de verdad — el diagnóstico de arriba (carrera de red) estaba equivocado; el bug real es `window.Events` vs `Events`

*(sesión posterior, tras seguir recibiendo el mismo error incluso en modo incógnito)*

El diagnóstico de la entrada anterior (carrera entre el botón de login visible y `firebase-sync.js` todavía descargándose) era plausible pero **incorrecto** — quedó descartado al confirmar que el bug aparecía igual en modo incógnito (sin caché ni Service Worker de por medio) y, sobre todo, al comparar el bloque reinsertado contra el `index.html` **original** que subió el usuario: es idéntico byte a byte. El bug ya estaba ahí antes de esta sesión — nunca se había probado el login de punta a punta después de agregarse el namespace `authgate`.

**Causa raíz real:** `events.js` declara `const Events = (function(){...})();` a nivel superior de un `<script>` clásico. Un `const`/`let` de nivel superior en un script clásico crea una variable global **léxica** — accesible como `Events` a secas desde cualquier otro script de la página, incluidos los `type="module"` — pero **nunca** se cuelga como propiedad de `window`. El código de `authgate` (y, se encontró de paso, el de `pin`) chequeaba `window.Events` en vez del identificador léxico:

```js
if(window.Events && typeof Events.registerAll === 'function') {   // ❌ window.Events siempre undefined
```

Como `window.Events` es `undefined` para siempre (no es un problema de timing — el resto de los ~20 módulos ya usan `Events.registerAll(...)` a secas, sin `window.`, y les funciona perfecto), el `&&` corta ahí, el bloque nunca entra, nunca se registra nada, y no hay ningún error visible hasta el click — exactamente el síntoma reportado, y determinista (siempre falla, no depende de la velocidad de red).

**Alcance real, más amplio de lo reportado:** el mismo guard roto estaba clonado en el registro del namespace `pin` (`Events.registerAll('pin', {...})`, dentro de `js/core/pin-bio.js`) — significa que, además del botón de login, **el teclado numérico de PIN y el flujo de biometría tampoco estaban registrando ningún handler**, silenciosamente, desde que se agregó ese guard.

**Fix:** se reemplazó `window.Events` por `typeof Events !== 'undefined'` en los dos puntos (`index.html`, bloque de auth de Firebase; `js/core/pin-bio.js`). No se tocó `events.js` — su forma de exponer `Events` es correcta y es lo que ya usa el resto de los módulos; el error estaba solo en estos dos guards puntuales que asumían mal cómo acceder a él.

**Nota honesta:** no se pudo verificar el fix con un navegador real en este entorno (sin acceso de red para instalar Chromium vía Playwright) — la corrección se apoya en el comportamiento documentado del spec de ECMAScript (los `let`/`const` de script clásico viven en el registro declarativo del entorno global, compartido por todos los scripts del mismo documento incluidos los módulos, pero no en el registro de objeto que respalda a `window`), no en una prueba end-to-end propia. Pendiente de confirmación del usuario tras desplegar.

**Lección:** cuando un síntoma se parece a una carrera de timing, vale la pena confirmar con modo incógnito (descarta caché/SW) *antes* de aceptar esa hipótesis como definitiva — y comparar contra el archivo original sin tocar es la forma más rápida de saber si algo es nuevo o preexistente.

**Confirmado por el usuario tras desplegar:** login funcionando — la traza de la consola mostró `dispatch @ events.js:124 → window._fbSignIn @ mis-finanzas/:6995 → signInWithPopup`, o sea el despacho llegó correctamente al handler. Apareció de paso un warning aparte y no relacionado (`Cross-Origin-Opener-Policy policy would block the window.closed call`) — ruido conocido del SDK de Firebase Auth al usar `signInWithPopup` en navegadores con COOP estricta por defecto; Firebase cae a `postMessage` como alternativa y el login se completa igual. No es un bug de la app, no requiere ninguna acción.

### 🔧 Nuevo — `js/core/money-input.js` extraído (primera pieza del bloque sheet-stack/nav)

*(sesión posterior, arranque del mapeo de los 3 bloques núcleo)*

Antes de tocar los 3 bloques núcleo (`S`/`save()`, sheet-stack/nav, `refresh()`) se hizo un mapeo de dependencias del bloque de sheet-stack/nav (515 líneas) — resultó ser mucho más que "sheet-stack": también tiene `showScreen`, `applyModulos`, el auto-formateo de inputs de plata, wiring legacy de eventos, y overrides de `addGastoVar`/`addGastoFijo`/`addSpotify`. Se decidió sacar primero la pieza de menor riesgo — el auto-formateo estilo calculadora de `.money-input` (listeners de `focusin`/`keydown`/`paste`, autocontenido salvo por `_moneyDigits`/`_moneyRender`, definidos antes en el bloque `S`/`save`) — a `js/core/money-input.js`.

### 🐛 Corregido en el momento — extraer del *medio* de un bloque `<script>` sin cerrarlo primero rompe todo el bloque

Al hacer esta extracción apareció un bug propio, encontrado antes de entregar nada: a diferencia de las extracciones anteriores (que siempre reemplazaban un bloque `<script>...</script>` **completo**, de su propia apertura a su propio cierre), esta vez se sacó una porción del **medio** de un bloque más grande que seguía abierto — y el `<script src="js/core/money-input.js"></script>` nuevo se insertó ahí sin cerrar antes el `<script>` original.

HTML trata todo el contenido de un `<script>` como texto plano hasta encontrar el primer `</script>` literal, sin que importe qué tags aparezcan en el medio — no hay tags "anidados" en ese contexto. Insertar un `<script src="...">...</script>` adentro de otro `<script>` todavía abierto hace que el navegador tome el `</script>` de ese tag nuevo como el cierre del bloque **original**, cortándolo ahí — todo el JS que sigue (`showScreen`, `applyModulos`, etc.) queda fuera de cualquier `<script>`, tratado como texto plano, sin ejecutarse.

**Por qué la validación de rutina no lo agarró:** el método de validación usado en toda la sesión (buscar la primera línea que contiene la subcadena `</script>` a partir de la apertura, con un scan línea por línea) tiene el mismo punto ciego que ya se había identificado para comentarios que *mencionan* la palabra `<script>` — pero acá jugó en contra en serio: el scan encontró el `</script>` del tag nuevo y ahí cortó el rango a validar, así que el `node --check` de esa sesión dio "OK" sobre un fragmento que no correspondía a lo que el navegador realmente iba a ejecutar. Fix: se armó un validador nuevo, más fiel al comportamiento real del tokenizer HTML — saca los comentarios `<!-- -->` primero (para no confundir menciones de texto con tags reales) y después busca, para cada `<script>` de apertura, el primer `</script` literal como cierre real, sin excepciones. Con ese validador se detectó el problema de inmediato.

**Fix aplicado:** se cerró el `<script>` original justo antes del tag nuevo (`</script>`), se dejó `<script src="js/core/money-input.js"></script>`, y se reabrió un `<script>` nuevo para el resto del contenido que seguía — el bloque de sheet-stack/nav quedó partido en dos elementos `<script>` (A y B) alrededor del archivo externo, en vez de uno solo. Verificado con el validador nuevo: 4 bloques inline reales en todo `index.html` (antes 3, +1 por la partición en A/B), todos con sintaxis válida — y 33 `<script src>` reales, incluyendo `money-input.js`.

**Lección para lo que sigue (los 3 bloques núcleo):** cualquier extracción de una porción intermedia de esos bloques grandes necesita el mismo tratamiento — cerrar/reabrir alrededor del fragmento sacado, nunca insertar un tag nuevo a mitad de uno que sigue abierto — y de acá en adelante, validar con el script consciente de comentarios y de este patrón, no con el scan ingenuo línea por línea que se venía usando.

*(sesión posterior)*

Con el bug real (`window.Events`) ya resuelto, se retomó la idea original de externalizar `firebase-init.js`/`firebase-sync.js` — pero esta vez con el guard que le faltaba, para que la carrera de timing teórica (aunque no era la causa del bug reportado) no se vuelva un problema real ahora que el registro sí llega a ejecutarse.

**Mecanismo agregado:**
- El botón `.fb-google-btn` (`data-action="authgate:signIn"`) arranca con `disabled` en el HTML.
- `firebase-init.js`, justo antes de mostrar la pantalla de login, arma un `setTimeout` de seguridad de 8s (`window._authgateReadyTimeout`) — si nadie confirma el registro en ese tiempo, habilita el botón igual con un `console.warn`, mismo patrón ya usado para `window._pinGateTimeout` en el gate de PIN.
- `firebase-sync.js`, apenas confirma `Events.registerAll('authgate', ...)`, marca `window._authgateReady = true`, cancela el timeout y habilita todos los `[data-action^="authgate:"]` (no solo el botón de login — también cubre, por las dudas, los de confirmar/cancelar eliminar cuenta, aunque esos no tienen el mismo riesgo por no ser visibles al cargar la página).
- Se agregó `.fb-google-btn:disabled{opacity:.55;cursor:wait;box-shadow:none;}` para que el estado se vea, no solo se comporte, distinto.

Se re-externalizaron los dos archivos con este guard ya adentro. Bloques `<script>` inline resultantes: **3** (el núcleo: `S`/`save()`, sheet-stack, `refresh()`). Verificado con `node --input-type=module --check` en ambos archivos nuevos, sin errores, y reconteo final con el mismo parser HTML de sesiones anteriores: 35 tags, 32 con `src`, 3 inline.

### 🔧 Nuevo — Mapeo completo de los 3 bloques núcleo + primera extracción del bloque de IIFEs

*(sesión posterior)*

Antes de seguir extrayendo se completó el mapeo de dependencias de los 3 bloques núcleo (detalle completo en `auditoria-tecnica.md` #1). Hallazgo importante: la definición base de `refresh()` en realidad vive al final del bloque `S`/`save()`, no en el bloque que se venía llamando "refresh() + menú Más" — ese bloque resultó ser una serie de IIFEs independientes entre sí, con un wrap de `window.refresh` (segundo eslabón de la cadena, el tercero ya vive en `mejoras.js`). Al ser el más autocontenido de los tres, se decidió dividirlo primero.

**Dividido en 4 archivos:**

| Archivo nuevo | Contenido | Depende de |
|---|---|---|
| `js/core/mas-menu.js` | Abrir/cerrar el menú "Más", wrap de `applyModulos` para mostrar/ocultar Spotify/Mesada según el estado de esos módulos | `applyModulos` (bloque sheet-stack/nav, carga antes) |
| `js/core/sheet-viewport.js` | Scroll-into-view al enfocar un input dentro de un sheet + reposicionamiento cuando el teclado abre en Android | Autocontenido |
| `js/core/gastos-fijos-progress.js` | Barra de progreso de gastos fijos pagados — segundo eslabón de la cadena de wraps de `window.refresh` | `S`, `window.refresh` (bloque S/save, carga antes) |
| `js/core/sheet-swipe.js` | Swipe-to-close de sheets y menú "Más", expone `window._makeSheetSwipeable` para otros módulos | `closeSheet` (bloque sheet-stack/nav, carga antes) |

Se verificó primero (grep) que ninguna de las funciones que este bloque expone en `window` (`closeMas`, `applyModulos`, `refresh`, `_makeSheetSwipeable`) se vuelve a reasignar en ningún otro lugar del archivo — sin sorpresas de monkey-patch como las que sí tiene el bloque sheet-stack/nav con `deudores-personas.js`.

**Aplicada la lección de la extracción anterior:** cada corte cerró (`</script>`) el bloque original antes de insertar el `<script src>` nuevo, y volvió a abrir (`<script>`) para lo que seguía — nunca se insertó un tag nuevo dentro de uno todavía abierto. Quedaron varios `<script></script>` vacíos entre los 4 archivos (los tramos que antes eran solo comentarios separadores); se limpiaron aparte, sin código que perder.

**Verificación:** validador consciente de comentarios HTML sobre todo `index.html` — 3 bloques inline reales, todos con sintaxis válida (los 3 restantes son íntegramente `S`/`save()` y las dos mitades de sheet-stack/nav alrededor de `money-input.js`). `node --check` sin errores en los 4 archivos nuevos y en los 10 preexistentes de `js/core/`.

### 🔧 Nuevo — `js/core/core-state.js`: el bloque `S`/`save()` completo, extraído entero (de 3 bloques núcleo a 2)

*(sesión posterior)*

Con el bloque de IIFEs ya resuelto, se encaró `S`/`save()` — el de mayor riesgo de los tres por ser la base que asume todo el resto de la app. A diferencia del bloque sheet-stack/nav (que necesitó partirse en pedazos por el monkey-patch de `deudores-personas.js`), acá no hizo falta: nada antes de la línea 4721 del archivo original podía depender de nada de este bloque (ya que ni siquiera existía todavía en ese punto), así que se extrajo **completo**, de punta a punta, a `js/core/core-state.js` — mismo patrón de bajo riesgo que los primeros 9 archivos de la sesión, sin necesidad de cerrar/reabrir nada.

El archivo incluye la definición **base** de `refresh()` (el primer eslabón de la cadena de tres wraps — el segundo vive en `gastos-fijos-progress.js`, el tercero en `mejoras.js`), todos los helpers universales (`fmt`, `uid`, `escHtml`, `toast`, `dialogo`, `parseMoney`, etc.), el motor de mover plata, y `calcPatrimonioTotal`/`snapshotPatrimonio`. Se cargó explícitamente como script clásico (sin `type="module"`), en la misma posición donde vivía el bloque original — justo antes de `mesada.js`/`spotify.js`/`gastos.js`/`prestado.js`, que dependen de que estas variables ya existan como globales.

**Verificación:** `node --check` sin errores en el archivo nuevo. Validador consciente de comentarios sobre todo `index.html`: **2 bloques inline reales** (antes 3) — quedan únicamente las dos mitades del bloque sheet-stack/nav (A y B, alrededor de `money-input.js`). Se confirmó a mano que `window.S = S` y `function refresh(){` siguen presentes e intactos en el archivo extraído.

**Pendiente para cerrar el punto 2/4 del todo:** el bloque sheet-stack/nav — `openSheet`/`closeSheet`/`showScreen`/`applyModulos`, el wiring legacy de `_initEventListeners()`, y los overrides de `addGastoVar`/`addGastoFijo`/`addSpotify` — es el único que queda, y el que más cuidado necesita por el monkey-patch de `openSheet` en `deudores-personas.js` (hay que preservar el orden de carga relativo, no se puede simplemente cargar primero como se hizo con `S`/`save()`).

### 🔧 Nuevo — `js/core/sheet-stack.js`: cierre del bloque sheet-stack/nav (de 2 bloques núcleo a 0, `'unsafe-inline'` fuera de `script-src`)

*(sesión posterior)*

Último bloque núcleo que quedaba. A diferencia de `S`/`save()` (que se pudo extraer completo, de una sola vez, porque nada antes de su posición dependía de su contenido), acá aplicó la misma restricción que ya tenía identificada el mapeo previo: el bloque vivía repartido en **dos** `<script>` inline separados por `js/core/money-input.js` (mitades A/B), y `openSheet` se monkey-patchea después en `deudores-personas.js` — el orden de carga relativo con `gastos.js`/`spotify.js`/`deudores-personas.js` no se podía romper.

Se unificaron ambas mitades en un solo archivo (`js/core/sheet-stack.js`), porque el mapeo de sesiones anteriores ya había confirmado que es un solo sistema lógico, no dos bloques independientes: `openSheet`/`closeSheet`/`showScreen`/`applyModulos` (sheet-stack + nav + fan-out defensivo a ~10 funciones de render de otros módulos), `_initEventListeners()` (wiring núcleo genérico que sobrevivió a la redistribución por dominios — nav, dialog, close-sheet delegado, `data-save-refresh`, FAB de Gastos/Cuentas, tab-bar de Gastos) y los 3 overrides de validación (`addGastoVar`/`addGastoFijo`/`addSpotify`).

- **Contenido, sin reescribir ni reordenar nada dentro:** se concatenaron las dos mitades tal cual estaban, con un header nuevo documentando la restricción de orden de carga (para que quede explícita en el archivo, no solo en la auditoría).
- **`<script src="js/core/sheet-stack.js">` se dejó en la misma posición relativa** que ocupaban los dos bloques inline que reemplaza: después de `core-state.js`/`mesada.js`/`spotify.js`/`gastos.js`/`prestado.js` (los overrides de `addGastoVar`/`addGastoFijo` leen esos globales al parsear, a nivel superior — deben existir ya) y antes de `encargos.js`/`deudores-personas.js`. `money-input.js` (la primera de las 4 piezas del mapeo original, ya extraída en una sesión anterior) quedó cargando justo después, sin cambios de comportamiento porque no depende de ni es dependencia de este archivo.
- **`addSpotify` no tiene la misma restricción que `addGastoVar`/`addGastoFijo`:** su override vive *dentro* de `_injectErrorSpans()`, no a nivel superior del script — se resuelve recién cuando esa función se invoca (asíncrono, después de `_finishFirstLoad()`), no al parsear. Documentado en el header del archivo nuevo para que no se pierda la distinción en una futura sesión.
- **Consecuencia directa, ya sin trabajo aparte:** con esto, `index.html` queda con **0 bloques `<script>` inline** (bajó de 18 originalmente) — se pudo sacar `'unsafe-inline'` de `script-src` en la CSP. `style-src` conserva `'unsafe-inline'` por el CSS inline (44.7 KB) todavía sin extraer — item aparte, sin relación con este punto, ver tabla de advertencias en `auditoria-tecnica.md`.
- **Verificado:** `node --check` sin errores en `js/core/sheet-stack.js`. Validador consciente de comentarios HTML sobre todo `index.html`: 0 bloques inline reales, 39 `<script>` (todos con `src`) balanceados con 39 `</script>`. No se pudo correr un test end-to-end contra `gastos.js`/`spotify.js`/`deudores-personas.js` en este entorno (no están disponibles fuera del propio `index.html` en esta sesión) — la verificación de orden de carga se hizo por inspección de línea, comparando la posición del nuevo `<script src>` contra la de los `<script src>` de esos tres módulos en el `index.html` resultante.
