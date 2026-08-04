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

### 🔧 Nuevo — Protección por antigüedad al eliminar un pago de mesada

*(2026-08-01)*

Aplicada en los dos puntos donde se puede borrar un pago de mesada: `eliminarMesadaPago()` (vista propia del módulo) y la rama `'mesada'` de `eliminarMovimiento()` en `movimientos.js` (vista de cuenta genérica) — ambos usan el mismo helper centralizado (ver "Núcleo compartido — detalle y eliminación de movimientos") para no repetir el cálculo ni arriesgar que uno de los dos caminos quede sin protección. Operaciones posteriores = cantidad de otros pagos de mesada (papá + mamá) con fecha posterior que tocaron alguna de las mismas cuentas (`_mesadaOpsPosteriores`, nuevo helper en `mesada.js`). Nivel "reciente" no cambia nada — sigue sin diálogo previo, como siempre.

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

### 2026-08-01

- Corregido: al pagar Spotify eligiendo una tarjeta de crédito como fuente, `confirmarPagarSpotify()` la trataba igual que una cuenta/cajita normal — llamaba `getSaldoActual(fuente)`/`descontarFuente(fuente,monto)`, funciones pensadas para saldo en efectivo, que no tocan `tc.deuda`. Resultado: la deuda de la tarjeta nunca subía, y el preview de `#spPagarPreview` quedaba pegado mostrando siempre el mismo cálculo de "saldo − monto" (porque las cifras de las que dependía tampoco cambiaban nunca). Pagar con tarjeta de crédito es un **cargo** (sube la deuda), no un retiro de saldo — mismo criterio ya aplicado en Encargos/Préstamos.

  Fix: `actualizarSpPagarPreview()` y `confirmarPagarSpotify()` ahora detectan `fuente.startsWith('tc:')` y usan el camino de tarjetas (`getTCById`, `tcCupoDisponible`, `tcRecalcular` de `tarjetas_credito.js`): el preview muestra "Deuda: X → Y" en vez de restar saldo, se valida cupo disponible en vez de saldo, y se registra un `S.tcMovimientos` con `tipo:'cargo_spotify'` (nuevo tipo agregado al filtro de `tcRecalcular` y a la inferencia de saldo inicial en `tcNormalizarTarjetas`, junto a `cargo_encargo`/`cargo_prestamo`) en vez de `descontarFuente()`. El pago guarda `_tcMovId` para poder revertir el cargo específico si se elimina el pago desde el historial (`deleteSpHistorial`), en vez de intentar `sumarFuente()` sobre una tarjeta.
- Agregado: campo de fecha editable al registrar un cobro (`spFecha`) y al registrar el pago a Spotify (`spPagarFecha`) — antes ambos quedaban fijos a `hoy()` sin posibilidad de anotarlos días después de haber ocurrido de verdad.
- Corregido: a qué ciclo pertenecía un cobro o un pago se decidía por **orden de entrada en el sistema** (posición en `spotifyHistorial`), no por la fecha real de cada evento. Esto rompía en dos direcciones:
  - **Cobro atrasado registrado después de pagar Spotify:** si alguien pagaba su período días después de que el administrador ya le hubiera pagado a Spotify (algo frecuente cuando el administrador adelanta el pago confiando en que le van a pagar), ese cobro se contaba como parte del ciclo nuevo en vez del ciclo que en realidad estaba saldando — inflando "Recaudado" del ciclo nuevo y dejando la "Ganancia" del ciclo ya cerrado más baja de lo real.
  - **Pago a Spotify anotado tarde:** si el pago real ocurría un día, pero se registraba en el sistema varios días después (después de ya haber anotado cobros que en la fecha real ya eran del ciclo nuevo), esos cobros quedaban atrapados en el ciclo que se estaba cerrando solo por haberse escrito primero en el historial.
  
  Fix: se agregó `_pendienteAlCerrar` (foto, guardada en el `pago`, de cuánto le quedaba debiendo cada persona al ciclo que se cierra) y `_pagoIdCierre` (en un `cobro`, referencia al `pago` cuya deuda saldó). Al registrar un cobro, si la persona tenía deuda congelada del ciclo anterior, el pago se reparte: primero salda esa deuda (atribuida al ciclo viejo vía `_pagoIdCierre`), y solo lo que sobra cuenta para el ciclo actual — puede generar dos registros en `spotifyHistorial` por un solo "Confirmar cobro". Al registrar el pago a Spotify con una fecha elegida, el historial se reordena: los cobros ya anotados con fecha posterior a la del pago se reubican después de él (pasan al ciclo nuevo), y solo con lo que de verdad quedó en el ciclo que se cierra se calcula `_pendienteAlCerrar`. Para el caso límite de un cobro con la misma fecha que el pago, el desempate es por deuda (¿ya estaba cubierta la cuota de ese ciclo con lo registrado antes ese mismo día?), no por hora exacta. `spCicloCobrosActual()` y la reconstrucción de `ciclosCompletos` en `renderSpStats()` se ajustaron para excluir/reatribuir los cobros de cierre correctamente, y `deleteSpHistorial()` devuelve la deuda congelada si se elimina un cobro de cierre. Ver `spotify.md §3, §5, §6, §10`.
- Corregido: `_pendienteAlCerrar` (y "Pendiente por cobrar" en pantalla) solo detectaban **un** período de deuda por persona, porque comparaban el dinero total que esa persona pagó dentro de todo el ciclo abierto contra una sola cuota (`monto − cobrado`). Eso fallaba cuando el ciclo del administrador duraba más que el período de 30 días de la persona: alguien pagaba un período (cubriendo esa cuota) y, sin que el ciclo se cerrara todavía, se le vencía un **segundo** período sin pagarlo — el sistema veía "ya cobré una cuota completa" y daba deuda $0, cuando en la realidad debía el período nuevo. Caso real detectado: al cerrar un ciclo con `confirmarPagarSpotify`, tres integrantes que sí tenían un período vencido sin pagar quedaron fuera de `_pendienteAlCerrar` por este motivo — al registrarles después el cobro atrasado, el sistema no encontraba deuda congelada que saldar y lo contaba de una como ingreso del ciclo nuevo, inflándolo.

  Fix: nueva función `spPeriodosVencidos(persona, fechaCorte)` que cuenta cuántos períodos de 30 días ya vencieron según `proximoPago` (que ya refleja todo lo pagado, porque cada cobro lo avanza al confirmarse) y multiplica por la cuota — detecta 1, 2 o más períodos atrasados dentro del mismo ciclo, en vez de asumir que nunca puede deber más de una cuota. Reemplaza el cálculo anterior tanto en "Pendiente por cobrar" (`renderSpotify`) como en `_pendienteAlCerrar` (`confirmarPagarSpotify`). Ver `spotify.md §8, §10`.
- Agregado: protección por antigüedad al eliminar un `pago` desde el historial de Spotify (`deleteSpHistorial`). Un pago con más de 90 días, o con 2 o más pagos reales registrados después de él, ahora muestra un aviso explícito (qué cuenta o tarjeta se afecta y de cuánto sube su saldo / baja su deuda si se confirma) antes de dejar borrarlo. Con más de 1 año, o 5 o más pagos posteriores, queda bloqueado sin opción de continuar. Los `cobro` individuales no cambian — su alcance sigue siendo pequeño y contenido. Ver `proteccion-antiguedad-movimientos.md` y la entrada correspondiente en "Núcleo compartido — detalle y eliminación de movimientos" (helper centralizado, reutilizable por los demás módulos cuando se implementen).

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

### 🔧 Nuevo — Protección por antigüedad al eliminar un gasto variable genérico

*(2026-08-01)*

Aplicada en la rama `'gasto'` de `eliminarMovimiento()` (`movimientos.js`) para el caso genérico (un gasto variable normal con `fuente`, sin `_esCompraTC`/`_esPagoTC`) — este es el único punto de entrada para este tipo, no tiene un módulo propio con su propio borrado como sí tienen Mesada o Préstamos. Operaciones posteriores = movimientos manuales/transferencias posteriores sobre la misma cuenta (`_cuentaOpsPosteriores`, nuevo helper en `movimientos.js`, ver sección "Cuentas"). El caso de compra/pago de TC (que sí vive dentro de esta misma rama `'gasto'`) ya tenía su protección desde antes — ver la entrada correspondiente en "Tarjetas de crédito".

### ✅ Corregido — Pagar un gasto fijo con tarjeta de crédito no subía la deuda

*(2026-08-01)*

Mismo bug que el corregido ese mismo día en Spotify (ver `CHANGELOG.md#spotify`), encontrado al revisar el resto de los flujos de pago tras ese fix. El selector de fuente del sheet "Pagar gasto fijo" (`pgf-fuente`) se puebla con `getFuentes()`, que sí incluye tarjetas de crédito — pero a diferencia de `addGastoVar()` (gasto variable), que ya cargaba correctamente la compra a la TC vía `tcCrearCompra`, ni `pgfActualizarSaldo()` ni `confirmarPagarGastoFijo()` distinguían `fuente.startsWith('tc:')`: llamaban `getSaldoActual`/`descontarFuente` igual que para una cuenta en efectivo. Resultado: pagar un gasto fijo con tarjeta no aumentaba `tc.deuda`, y el preview de saldo mostraba una cifra sin sentido (cupo tratado como saldo restable).

Fix: se replicó exactamente el patrón ya usado en `addGastoVar()` — si la fuente es una TC, se valida cupo disponible (no saldo), se registra la compra con `tcCrearCompra(tc, {...})`, y el gasto variable generado se marca con `_esCompraTC`/`_tcId`/`_tcCompraId`. Con esas mismas flags, `deleteGastoVar()` ya sabía revertir el cargo correctamente (`tcEliminarCompraInterna`) sin necesitar ningún cambio ahí — el bug era solo de creación, no de reversión. `pgfActualizarSaldo()` ahora muestra "Deuda: X → Y" en vez de "Saldo disponible" cuando la fuente elegida es una tarjeta.

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

### 🔧 Nuevo — Protección por antigüedad al eliminar una compra o un pago de TC

*(2026-08-01)*

Aplicada en los dos puntos de borrado: `eliminarCompraTC()`/`eliminarPagoTC()` (vista propia de la tarjeta) y la rama `'gasto'`→`_esCompraTC`/`_esPagoTC` de `eliminarMovimiento()` en `movimientos.js` (vista de cuenta genérica), mismo helper centralizado. Operaciones posteriores = cantidad de compras + pagos posteriores (no eliminados) de la misma tarjeta (`_tcOpsPosteriores`, nuevo helper en `tarjetas_credito.js`) — se cuenta contra la tarjeta como conjunto, no por separado compra/pago, porque ambos afectan la misma deuda. Nivel "viejo": eliminar una compra vieja avisa que la deuda "baja"; eliminar un pago viejo avisa que la deuda "sube" (se pierde el descuento que había hecho ese pago).

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

### ✅ Corregido — Las dos entradas anteriores estaban mal: restar encargos de Nequi/Efectivo/personalizadas dejaba saldos negativos falsos

*(2026-08-01)*

Reportado como: se registraron dos entradas de un encargo (\$400.000 y \$650.000) con `cuenta:'nequi'`, y el saldo disponible de Nequi pasó a negativo aunque el saldo real de Nequi era mínimo.

Causa raíz: las dos correcciones anteriores (`_saldoEncargosEnCajita` → `_saldoEncargosEnCuenta`, y su aplicación en `renderDetalleCuenta()`/`_checkGastoAlto()`) partían de un supuesto que es cierto para las **cajitas de Nu** pero falso para Nequi, Efectivo y cuentas personalizadas: que la plata de un encargo marcada con una `cuenta` ya está sumada al saldo real de esa cuenta. En cajitas eso es verdad — `calcC()` suma el saldo de encargos a la base antes de calcular el interés, así que restarlo después para mostrar solo el saldo propio es correcto. Pero registrar una entrada o salida simple de un encargo **nunca** llama `sumarFuente()` ni genera un movimiento espejo (a diferencia de un traspaso, una compra con TC o "yo puse la plata") — el campo `cuenta` ahí es solo metadata de ubicación física, nunca mueve saldo real. Restarla de todos modos significaba restar plata que nunca se había sumado, y el resultado se iba a negativo apenas el encargo superaba el saldo real de la cuenta.

Fix: se revirtió la resta de `_saldoEncargosEnCuenta('nequi'/'efectivo'/'custom:ID')` en los 5 puntos donde se había aplicado — `calcPatrimonioTotal()`, `refresh()` (hero de Inicio), `renderDetalleCuenta()` (saldo disponible de Nequi/Efectivo), `liquidoReal` en `calcHealthScore()`, y `_checkGastoAlto()`. La resta en **cajitas de Nu** (`_saldoEncargosEnCajita()`, dentro de `calcC()`) no se tocó — ahí sigue siendo correcta. Regla agregada en `encargos.md#3` para que no se repita el mismo error al revés.

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

### 🔧 Nuevo — Protección por antigüedad al eliminar un movimiento de préstamo

*(2026-08-01)*

Aplicada en ambos lados del módulo. **"Me deben"**: `eliminarMovDeudor()` (que ya mostraba un diálogo detallado con el antes/después de la deuda de la persona) y la rama `'prestamo'`/`'abono'` de `eliminarMovimiento()` en `movimientos.js` (vista de cuenta genérica) — mismo helper centralizado. Como el diálogo de `eliminarMovDeudor()` ya era bastante completo, en nivel "viejo" se le agregó una frase de advertencia en vez de reemplazarlo por uno nuevo; nivel "bloqueado" sí impide el borrado por completo, sin mostrar ese diálogo. **"Mis deudas"**: `eliminarMovMiDeuda()`, que no tenía ningún diálogo de confirmación — se mantiene así para nivel "reciente", y se agregó el aviso/bloqueo específico solo para "viejo"/"bloqueado". Operaciones posteriores en ambos lados = cantidad de movimientos posteriores de la misma persona/deuda que tocaron alguna de las mismas cuentas (`_deudorOpsPosteriores` y `_miDeudaOpsPosteriores`, nuevos helpers en `prestado.js`).

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

### ✅ Corregido — El hook de perfil de persona en el detalle de un encargo nunca corría (mismo patrón que el bug real de `spotify:editar`, esta vez sí confirmado)

*(2026-08-02)*

El avatar del detalle de un encargo nunca se pintaba con el color de la persona vinculada, ni aparecía el botón "Ver perfil completo" bajo el saldo — pese a que `encargos-personas.js` sí envuelve `abrirEncargoDetalle` para hacer exactamente eso. La entrada de arriba (`personaId` obligatorio) había investigado y descartado este mismo patrón de bug para `crearEncargo`; acá sí era real, por una razón distinta.

**Causa:** `Events.registerAll('encargos', { ..., abrirDetalle: abrirEncargoDetalle, ... })` corre de forma síncrona al cargar `encargos.js` y copia ahí **el valor** que tenía `abrirEncargoDetalle` en ese momento (la versión con el hook de `renderEncargoParts`, ya envuelta una vez dentro del propio `encargos.js`). Más tarde, `encargos-personas.js` reasigna la variable global `abrirEncargoDetalle = function(id) {...}` para agregar el color de persona y el chip de perfil — pero eso solo cambia a qué apunta la variable, no lo que `Events` ya había copiado dentro de su registro interno. La card de la lista dispara la acción vía `data-action="encargos:abrirDetalle"`, así que cada click seguía llamando a la versión vieja, sin el hook de personas, sin ningún error en consola. Mismo tipo de bug encontrado antes al migrar Spotify (`Events.on('spotify:editar', editarSpotify)`, ver arriba en Infraestructura/seguridad) — ahí se corrigió puntualmente con una arrow function; acá nadie lo había replicado para Encargos.

**Fix:** las ~24 entradas de `Events.registerAll('encargos', {...})` pasaron de referencia directa (`accion: funcion`) a resolución perezosa por nombre (`accion: (...args) => funcion(...args)`) — no solo `abrirDetalle`, que era la única rota hoy, sino el bloque completo. Con esto, si cualquier módulo futuro (un `encargos-recordatorios.js`, por ejemplo) envuelve cualquiera de estas funciones con el mismo patrón `const _orig = fn; fn = function(){...}` que ya usan todos los `*-personas.js`, `Events` la va a resolver correcta en cada click sin que haga falta acordarse de re-registrar nada — el bug queda cerrado de raíz para todo el módulo, no solo para el caso puntual encontrado hoy.

**Nota para revisar aparte:** `spotify-personas.js` y `prestado-personas.js` siguen el mismo patrón de wrapping (mencionado en el propio encabezado de `encargos-personas.js`) — si en algún momento envuelven una función que su módulo base registró por referencia directa en `Events.registerAll`, tienen el mismo riesgo. Vale la pena aplicarles el mismo blindaje la próxima vez que se toquen.

### 🔧 Nuevo — Protección por antigüedad al eliminar un movimiento de encargo

*(2026-08-01)*

Aplicada en `deleteMovEncargo()`, el único punto de borrado de movimientos de un encargo (a diferencia de Mesada/Préstamos/Tarjetas, acá no hay un segundo camino vía `movimientos.js`). Operaciones posteriores = cantidad de movimientos posteriores del mismo encargo con la misma `cuenta` (`campo interno de cada movimiento de encargo`). A diferencia de los demás módulos, el aviso de nivel "viejo" **no afirma si el saldo sube o baja** — el motor de diferencial/intercambios de Encargos (entrada, salida, "lo cubrí yo", "lo adelanté yo") hace que la dirección real dependa del tipo de movimiento, y prefiero un aviso genérico correcto a uno específico que podría estar mal. Nivel "bloqueado" sigue impidiendo el borrado igual que en los demás módulos.

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

### 🔧 Nuevo — Helper centralizado de protección por antigüedad de movimientos

*(2026-08-01)*

Nace de una pregunta puntual sobre Spotify (ver `proteccion-antiguedad-movimientos.md`), pero el riesgo es general a toda la app: al eliminar un movimiento, el sistema revierte el monto sobre el saldo *actual* de la cuenta afectada, no recalcula el historial completo desde cero. Si el movimiento es viejo, esa plata ya se mezcló lógicamente con todo lo que pasó después — revertirla hoy introduce un descuadre nuevo, tanto más difícil de corregir a mano cuanto más vieja la operación.

Se agregó en `core-state.js`, para que cada módulo lo reutilice desde su(s) punto(s) de borrado en vez de reimplementar el cálculo:

- `S.config.proteccionAntiguedad` — umbrales centralizados: `diasAviso`/`diasBloqueo` globales (90 días / 1 año), y un bloque por módulo con sus propios `opsAviso`/`opsBloqueo` (cantidad de operaciones posteriores sobre la misma cuenta/ciclo). Por ahora solo `spotify: {opsAviso:2, opsBloqueo:5}` está definido — los demás módulos (Encargos, Préstamos, Tarjetas) se agregan cuando se implementen ahí. `load()` inicializa este bloque si falta en datos guardados antes de este cambio, mismo patrón que el resto de campos de `S`.
- `nivelAntiguedadMovimiento(fecha, opsPosteriores, modulo)` — devuelve `'reciente'`/`'viejo'`/`'bloqueado'` según **cualquiera** de los dos criterios (tiempo transcurrido u operaciones posteriores).
- `confirmarBorrarMovimientoViejo(nombreCuenta, montoRevertido, direccion, campo='saldo')` — diálogo de aviso para nivel `'viejo'`: qué cuenta se afecta y de cuánto sube o baja (`campo` permite decir "deuda" en vez de "saldo" para el caso de una tarjeta de crédito). Devuelve `true`/`false` según la elección del usuario.
- `avisarMovimientoBloqueado()` — diálogo informativo de un solo botón para nivel `'bloqueado'`, sin opción de continuar.

Aplicado en los siete puntos con reglas propias: Spotify (`deleteSpHistorial`), Mesada (`eliminarMesadaPago` + rama `'mesada'` de `eliminarMovimiento()`), Préstamos — me deben y mis deudas (`eliminarMovDeudor`/`eliminarMovMiDeuda` + rama `'prestamo'`/`'abono'`), Tarjetas de Crédito (`eliminarCompraTC`/`eliminarPagoTC` + rama `'gasto'`→TC), Encargos (`deleteMovEncargo`), Gastos genéricos y Cuentas (movimientos manuales y transferencias) — estos dos últimos solo viven dentro de `eliminarMovimiento()`, no tienen módulo propio con su propio borrado. Con esto, `eliminarMovimiento()` queda con los ocho tipos que maneja (`transferencia`, `salida_manual`, `ingreso`/`apertura`/`entrada`, `gasto`, `prestamo`, `abono`, `mesada`) cubiertos. Fuera de alcance por ahora: Alcancía, CDT y Plata Comprometida, que llevan su propio historial en módulos no revisados todavía. Umbrales de operaciones posteriores: mismo valor que Spotify (`opsAviso:2, opsBloqueo:5`) para todos por ahora — no hay un criterio distinto documentado todavía, ajustar por módulo si hace falta más adelante. Detalle de cada aplicación en su propia sección más abajo.

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

### 🔧 Nuevo — Protección por antigüedad al eliminar movimientos manuales y transferencias

*(2026-08-01)*

Aplicada en `eliminarMovimiento()` (`movimientos.js`) para los tres tipos que representan movimientos directos de cuenta y que no tienen otro punto de entrada: `'transferencia'` (`S.transferencias`), `'salida_manual'` y `'ingreso'`/`'apertura'`/`'entrada'` (`S.movimientos`). Nuevo helper `_cuentaOpsPosteriores(cuenta, fecha, excludeId)`: cuenta movimientos manuales + transferencias posteriores sobre la misma cuenta — no incluye movimientos de módulos con su propio historial (Mesada, Spotify, Préstamos, etc.) ni de Alcancía/CDT/Plata Comprometida, que llevan su propio registro y quedan fuera del alcance de esta sesión.

Caso particular: una transferencia mueve dos cuentas en direcciones opuestas (origen recupera, destino pierde), así que no encaja en el helper genérico `confirmarBorrarMovimientoViejo()` (pensado para una sola cuenta/dirección) — el aviso de nivel "viejo" para transferencias arma su propio diálogo mencionando el efecto en ambas cuentas.

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

### 🐛 Corregido — El lado de `encargos.js` de la entrada anterior nunca había llegado al archivo

*(sesión posterior, encontrado al re-auditar con el código fuente real en mano)*

La entrada de arriba ("Redistribución final: Encargos y Préstamos", 2026-07-27) documentaba **seis listeners como movidos a `encargos.js`** (`movenc_monto`, `movenc_mia_cuenta_sale`/`_entra`, `ctc_monto`, `ctc_cuenta_enc`/`ctc_tarjeta`/`ctc_destino`, y los tres "valor real" del motor Diferencial — `movenc_dif_real`, `ctc_dif_real`, `usar_parte_dif_real`). El lado de `prestado.js` sí estaba — se verificó línea por línea, bloque `WIRING MIGRADO DESDE index.html` presente y correcto. **El de `encargos.js` no existía en el archivo real**, pese a estar documentado como hecho — ni el bloque, ni el comentario de cabecera que sí tiene su equivalente en `prestado.js`. No se investigó por qué (¿nunca se aplicó el cambio, se perdió en un merge, se revirtió por error? no hay forma de saberlo sin más contexto), se documenta el hallazgo y se corrige.

**Escenario concreto que dispara el bug (confirmado con jsdom contra el archivo original, sin el fix):** en el sheet "Retirar plata" de un encargo, cambiar la cuenta de "sale"/"entra" de la sección "mía" no actualizaba el texto del preview (`↔ Sale X de... · Recupero X en...`) — se quedaba con lo calculado al abrir el sheet. Mismo problema en "Compra con TC" (monto/cuenta/tarjeta/destino no refrescaban el resumen en vivo) y en los tres "valor real" del motor Diferencial (`movenc_dif_real`/`ctc_dif_real`/`usar_parte_dif_real`, sin actualizar su resumen al escribir).

**Fix:** se agregó a `encargos.js` el mismo bloque `forEach` que ya usa `prestado.js`, justo antes de `Events.registerAll('encargos', ...)`, cableando los seis campos documentados arriba a las funciones que ya existían (`_movEncSplitPreview`, `_movEncMiaPreview`, `_ctcActualizarPreview`, `_difResumen`, `_ctcDifResumen`, `_usarParteDifResumen`) — ninguna función nueva, solo el `addEventListener` que faltaba.

**Verificado con jsdom:** reproducido el bug contra el archivo original (el preview de "mía" se queda vacío tras el `change`), y confirmado que con el fix sí se actualiza. `node --check` sin errores.

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

### 🐛 Bug real en producción — sacar `'unsafe-inline'` de `script-src` fue prematuro, revertido

*(sesión posterior, tras probar en navegador real)*

Con `gastos.js`, `spotify.js` y `deudores-personas.js` ya disponibles, se corrió la simulación end-to-end pendiente de la entrada anterior (jsdom + `vm`, orden real de carga) — sin errores, confirmando que la extracción de `sheet-stack.js` en sí estaba bien. Pero al mismo tiempo el usuario reportó en consola del navegador real: `Executing inline event handler violates ... script-src ...`, en la línea del `<link>` de Font Awesome — algo que ningún `node --check` ni simulación con jsdom puede detectar, porque jsdom no aplica CSP.

**Causa raíz — dos categorías de handler inline que la auditoría nunca cubrió, ninguna relacionada con `sheet-stack.js`:**

1. **`onload="this.media='all'"` en los 2 `<link>` de carga async de CSS** (Font Awesome, Google Fonts) — técnica estándar para no bloquear el render, pero es un atributo de evento inline igual que un `onclick`, y la CSP lo trata igual. El barrido de "0 `onclick`/`onchange`/`oninput`/hover inline" nunca lo cubrió porque no es ninguno de esos cuatro — punto ciego real en la cobertura de la auditoría, no un caso nuevo introducido por `sheet-stack.js`.
2. **`onmouseenter`/`onmouseleave` generados en tiempo de ejecución** dentro de template strings de varios módulos (botones "eliminar" con efecto hover, insertados vía `innerHTML`) — a diferencia del punto 1, esto **sí estaba documentado como pendiente**: el propio comentario de cabecera de `gastos.js` decía literalmente *"se dejaron igual que en los cinco módulos anteriores — hallazgo aparte, sin tocar, pendiente de una clase :hover compartida"*. La sesión que sacó `'unsafe-inline'` pasó por alto que esto también cae bajo `script-src` (no es un `<script>` inline, pero un handler inline sí lo es) y que "0 bloques `<script>` inline" no es lo mismo que "0 atributos on\* inline en todo el documento, incluidos los generados dinámicamente".

**Arreglado:**

- **`js/core/async-css.js` (nuevo):** reemplaza el `onload` inline de los 2 `<link>` — ahora llevan `data-async-css` en vez de `onload=`, y este script (cargado justo después, sin `defer`/`async`) les engancha un `addEventListener('load', ...)` que cambia `media` a `'all'`, con un fallback por si el CSS ya terminó de cargar (ej. desde caché) antes de que el script llegara a ejecutarse. Mismo comportamiento que antes, sin handler inline. **No depende de nada más — se queda arreglado independientemente de lo que pase con el punto 2.**
- **`gastos.js` — los 2 pares de `onmouseenter`/`onmouseleave` de esta sesión:** migrados a una clase CSS nueva y compartida, `.btn-delete-hover` (agregada a `index.html`, cerca de `.btn-icon`), que reemplaza el `style`+`onmouseenter`+`onmouseleave` inline por una sola clase con `:hover` en CSS puro. Comentario de cabecera de `gastos.js` actualizado para reflejar que ya no está pendiente en este módulo.
- **`'unsafe-inline'` se revirtió en `script-src`** (sigue afuera de `style-src` la discusión, sin cambios ahí) — el motivo real: **no tengo en esta sesión los archivos de los demás módulos** que el propio comentario de `gastos.js` señala con el mismo patrón (dice "cinco módulos anteriores", así que hay al menos 5 más sin revisar — candidatos probables: `cuentas.js`, `prestado.js`, `encargos.js`, `tarjetas_credito.js`, `mesada.js`, sin confirmar todavía cuáles exactamente). Sacar `'unsafe-inline'` de nuevo requiere primero confirmar, módulo por módulo, que ninguno genera **ningún** atributo `on*` inline al renderizar — no alcanza con revisar `onclick` solo, hay que barrer todos.

**Lección para la próxima vez que se toque este punto:** `node --check` y las simulaciones con jsdom/`vm` verifican sintaxis y orden de carga, pero **no aplican CSP** — no van a agarrar un handler inline bloqueado. La única forma de confirmar que sacar `'unsafe-inline'` es seguro es probar en un navegador real con la CSP activa y mirar la consola, cosa que este entorno de trabajo no tiene disponible. Cualquier cambio a la CSP de ahora en más debería quedar marcado explícitamente como "sin confirmar en navegador" hasta que el usuario lo pruebe y lo reporte.

**Pendiente para volver a cerrar este punto:** revisar los módulos con el mismo patrón de `onmouseenter`/`onmouseleave` (mínimo 5, según el comentario de `gastos.js`) y confirmar que no quede ningún atributo `on*` inline generado dinámicamente en ningún módulo, antes de sacar `'unsafe-inline'` de `script-src` otra vez.

### 🐛 Bug real en producción — fuga de event listeners en `renderAttencion()` (Inicio), sin relación con `sheet-stack.js`

*(sesión posterior, tras probar en navegador real)*

El usuario reportó que el badge "Necesita atención" (el `<span>` con el número y la flecha `fa-chevron-up`/`fa-chevron-down`) dejó de responder al click — se ve bien, pero tocarlo no hace nada. Investigado con `js/modules/inicio.js` (no disponible en la sesión anterior, recién subido acá).

**Causa — nada que ver con `sheet-stack.js`, `async-css.js` ni la CSP:** `renderAttencion()` corre en cada `refresh()`, y `titleEl` (el `.sec-title` de la sección) es el **mismo nodo del DOM** entre renders — solo se le pisa el `innerHTML`, nunca se recrea. El código hacía `titleEl.addEventListener('click', () => {...})` en cada render, **sin sacar el listener anterior**: se acumulaba uno nuevo por cada `refresh()` de toda la sesión del usuario. Con un número par de listeners acumulados, un solo click dispara todos a la vez y se cancelan entre sí (abre→cierra→abre→cierra), sin efecto visible — coincide exacto con el síntoma reportado, y explica por qué "antes sí funcionaba": con pocos `refresh()` corridos todavía (número impar de listeners), el toggle se veía bien; después de navegar un rato y acumular más, se cruzó a un número par y dejó de moverse.

- **Arreglado en `js/modules/inicio.js`:** el handler ahora se guarda en `titleEl._attnClickHandler` y se saca con `removeEventListener` antes de agregar uno nuevo en cada render — un solo listener activo en todo momento, sin importar cuántas veces haya corrido `renderAttencion()` antes.
- **Por qué no alcanzaba con el patrón "hook una sola vez"** que ya usa el resto de la app (ej. `sheet._personaHook` en `deudores-personas.js`, `sheet._personaHook` en el selector de "Nueva deuda"): acá el handler cierra sobre `items`, una variable local de `renderAttencion()` que cambia en cada render — si el listener se enganchara una sola vez y nunca más, el badge mostraría para siempre el `items.length` del primer render, no el actual. Por eso hace falta sacar y volver a poner el listener en cada render, no solo engancharlo una vez.
- **Verificado con jsdom:** se simularon 5 llamadas seguidas a `renderAttencion()` (equivalente a 5 `refresh()` del usuario navegando) seguidas de 4 clicks — cada click alternó `list.style.display` una sola vez (`none`→`''`→`none`→`''`), confirmando que ya no queda más de un listener activo.
- **Nota honesta:** este bug es preexistente a esta sesión — no lo introdujo la extracción de `sheet-stack.js` (que no toca `inicio.js` para nada) ni ningún cambio de la CSP. Se encontró porque el usuario probó la app en navegador real después de esos cambios y notó el síntoma; el bug en sí probablemente llevaba un tiempo ahí, dependiendo de cuántos `refresh()` se acumularan en cada sesión de uso.

### 🔧 Barrido de handlers `on*` inline en `cuentas.js`, `encargos.js`, `mesada.js`, `prestado.js`, `tarjetas_credito.js`

*(sesión posterior)*

Continuación directa del punto reabierto de infraestructura/seguridad: revisar los módulos con el mismo patrón de handler inline que `gastos.js` (y cualquier otro atributo `on*`, no solo hover) antes de volver a sacar `'unsafe-inline'` de `script-src`.

**Resultado del barrido — 3 de 5 módulos tenían casos reales, más variados de lo esperado:**

| Archivo | Casos encontrados |
|---|---|
| `cuentas.js` | 6: 2 `oninput` funcionales (`_renderMetaAportes`), 1 par hover (fila de cajita), 1 `oninput` + 2 `onchange` funcionales (`renderMovsFiltros`) |
| `encargos.js` | 2: 1 `onclick` en fila de movimiento, 1 par hover (botón eliminar movimiento) |
| `tarjetas_credito.js` | 2 pares hover (eliminar compra, eliminar pago) |
| `mesada.js` | 0 — limpio |
| `prestado.js` | 0 — limpio |

**Los pares hover** (`cuentas.js`, `encargos.js`, `tarjetas_credito.js`) se migraron a la clase compartida `.btn-delete-hover` ya creada para `gastos.js` — mismo criterio, sin cambios de comportamiento salvo un detalle cosmético menor y deliberado: se estandarizó la opacidad base en `.6` para los tres módulos (`encargos.js` tenía `.55`), ya que el objetivo explícito de esta clase es ser compartida y consistente en toda la app, no una copia exacta por módulo.

**El hover de la fila de cajita en `cuentas.js`** (cambio de color de borde, no de opacidad) es un caso distinto — se creó una clase nueva, `.cajita-row-hover`, porque no es el mismo patrón visual que los botones "eliminar".

**El `onclick="abrirDetalleMov(this)"` de `encargos.js`** (fila de movimiento) se migró a `data-action="core:abrirDetalleMov"` — el mismo patrón que `cuentas.js` y `prestado.js` ya usaban para exactamente el mismo caso (quedó como el único módulo de los cuatro con filas de movimiento que todavía tenía la versión vieja).

**Los 3 casos funcionales de `cuentas.js`** (no cosméticos, con lógica real) fueron los más delicados:
- `_renderMetaAportes()`: los 2 `oninput` escribían directo en `_metaAportesTemp[i].desc`/`.monto` usando el índice `i` del loop de render. Se migraron a un único listener delegado en el contenedor (`#meta_aportes_list`), enganchado una sola vez (guard `_metaAportesHooked`, mismo patrón que `sheet._personaHook` en `deudores-personas.js`) — el índice se lee de un `data-idx` en el momento del evento, no de una variable cerrada, así que no repite el problema de "valor viejo" del bug de `renderAttencion()` de la entrada anterior.
- `renderMovsFiltros()`: el `oninput` del buscador y los 2 `onchange` de fecha se migraron al mismo patrón — un listener delegado por `wrap` (uno por `cuentaKey`, ya que `filtrosElId` incluye el `cuentaKey`), guardado con `_movsFiltrosHooked`. Acá sí es seguro cerrar sobre `cuentaKey` en el closure (a diferencia de `items` en `renderAttencion()`) porque un `wrap` dado siempre tiene el mismo `cuentaKey` — nunca cambia entre renders para ese elemento en particular.
- **Verificado con jsdom, no solo `node --check`:** se simularon 3-4 renders seguidos de cada función (equivalente a varios `refresh()` del usuario) seguidos de ediciones reales en los inputs — confirmando que `_metaAportesTemp`/los filtros se actualizan correctamente y que `_updateMetaCuotaPreview()`/`_movsRefresh()` se llaman **una sola vez** por evento, no una vez por cada render acumulado (que es exactamente el bug que tenía `renderAttencion()` antes del fix de la entrada anterior).

**Archivos ya en la app, no subidos esta vez, también revisados por completitud** (los tenía de sesiones anteriores): `spotify.js`, `deudores-personas.js`, `inicio.js`, `js/core/sheet-stack.js`, `js/core/async-css.js` — los 5 salen limpios (las únicas coincidencias de `on\w+=` son texto dentro de comentarios, documentando el patrón viejo).

**`'unsafe-inline'` se queda en `script-src` por ahora, a propósito:** con este barrido ya son 11 archivos confirmados (6 revisados y corregidos esta sesión + 5 que ya salían limpios), pero la app tiene más módulos que todavía no se revisaron y que no están disponibles en esta sesión: `js/core/movimientos.js` (el que centraliza `abrirDetalleMov`/`eliminarMovimiento`, compartido por los 4 módulos con filas de movimiento), `js/modules/spotify-personas.js`, `encargos-personas.js`, `prestado-personas.js`, `configuracion.js`, `personas.js`, `analisis.js`, `actividad_reciente.js`, `alcancia.js` (si existe con ese nombre), y los 4 archivos en que se dividió el bloque "refresh()+menú Más" (`mas-menu.js`, `sheet-viewport.js`, `gastos-fijos-progress.js`, `sheet-swipe.js`). Hasta confirmar esos también, sacar `'unsafe-inline'` sigue siendo prematuro.

### 🔧 Barrido de los 13 módulos restantes — todos limpios (Actividad Reciente, Alcancía, Análisis, Movimientos, Personas, Spotify-Personas, Configuración, Encargos-Personas, Préstamo-Personas, y los 4 de "refresh()+menú Más")

*(sesión posterior)*

Segunda tanda de la lista de pendientes de la entrada anterior. Sintaxis OK en los 13. Barrido de `on\w+=`: solo 4 coincidencias en total, las 4 dentro de comentarios (nada de código activo).

Una de esas 4 merecía chequeo aparte: el comentario de `actividad_reciente.js` afirmaba que `#cfg-historial-row` en `index.html` todavía tenía un `onclick="showScreen('historial')"` inline, estático, sin relación con ningún módulo JS. Se verificó directo en el `index.html` actual: **falso positivo, comentario desactualizado** — esa fila ya usa `data-action="config:irA" data-args="[...]"`, correctamente migrada en algún momento sin que ese comentario en particular se actualizara.

Con esto, los 13 módulos de pantalla que faltaban de la lista de la entrada anterior quedan confirmados limpios.

### ✅ Cierre — barrido de infraestructura (`events.js`, `diferencial.js`, `split.js`, `core-state.js`, `money-input.js`) y remoción definitiva de `'unsafe-inline'` en `script-src`

*(sesión posterior)*

Última tanda: los 5 archivos "motor" que quedaban sin revisar directamente. Sintaxis OK en los 5.

**Hallazgo real, el más importante de toda esta serie de sesiones:** `emptyState()` en `core-state.js` — un helper compartido usado por varios módulos para renderizar el estado "vacío" de una lista — todavía aceptaba dos formas para su parámetro `btnFn`: el objeto `{action, args}` del despachador de Events (forma nueva), o un string con `onclick="..."` crudo insertado tal cual en el HTML (forma vieja, mantenida "por compatibilidad hacia atrás").

Se revisaron todas las llamadas a `emptyState()` en los 29 archivos disponibles: exactamente 3 (2 en `gastos.js`, 1 en `spotify.js`), las 3 ya usaban la forma nueva. El comentario que decía "todavía usada por Gastos y Tarjetas de crédito" estaba desactualizado — `tarjetas_credito.js` ni siquiera llama a `emptyState()`.

La rama `onclick="${btnFn}"` era código muerto, sin ningún caller activándola, pero seguía disponible para que un módulo futuro la disparara por error. Se sacó la rama entera: ahora `emptyState()` solo acepta `{action, args}` — si alguien pasa un string, el botón simplemente no se renderiza, sin generar ningún inline.

- Verificado con los 3 casos reales (mismo HTML de salida que antes) más un caso adversarial confirmando que ya no genera `onclick`.
- `events.js`, `diferencial.js`, `split.js`, `money-input.js`: limpios.

**Con esto se completa el barrido de los 29 archivos de la app. `'unsafe-inline'` se sacó de `script-src` de nuevo**, esta vez confirmado contra el código real de los 29 archivos, no solo contra `node --check`/jsdom (que no aplican CSP).

### 🔧 Cambio — CSS inline (44.7 KB) extraído a `styles.css`

Se sacaron los dos bloques `<style>` grandes de `index.html` a un archivo `styles.css` nuevo: el CSS principal de layout/componentes (~46 KB) y el bloque "MEJORAS UX" (fade-in del dashboard, health ring, presupuestos, búsqueda — ~1.8 KB) que vivía suelto más abajo del documento, junto al bloque de scripts "MEJORAS ADICIONALES". Se carga con `<link rel="stylesheet" href="styles.css">` normal — bloqueante a propósito, sin `defer`/`async`: es el CSS que define el layout base de toda la app, no hay nada coherente que mostrar sin él, así que dejarlo no-bloqueante causaría FOUC (flash de contenido sin estilo). El beneficio no es que deje de bloquear, es que ahora es cacheable aparte del HTML entre despliegues que solo tocan JS/markup, y se descarga en paralelo con el resto del `<head>` en vez de venir inline dentro del documento.

Quedó **un tercer `<style>` chico inline, a propósito**: el override de `font-display:swap` para Font Awesome (~7 líneas, ya documentado arriba en esta misma sección). Depende de aparecer físicamente después del `<link>` de cdnjs para ganarle en cascada CSS — moverlo a `styles.css` habría exigido resolver ese orden contra un `<link>` externo, cambio innecesario para algo tan chico. Por esto, **`style-src 'unsafe-inline'` sigue en la CSP** — este cambio no lo cierra, solo baja el CSS inline de 44.7 KB a ~200 bytes.

`index.html` bajó de 5.249 a 4.663 líneas (-586). Verificado: llaves `{`/`}` de `styles.css` balanceadas (450 pares), `<head>`/`</head>`/`<body>`/`</body>` balanceados en `index.html` (las coincidencias extra que da un `grep` simple son menciones de esos tags dentro de comentarios de texto, no tags reales). **Falta la prueba visual en navegador real** — confirmar que no hay FOUC ni clases sin estilo — antes de dar esto por cerrado.

**Nota de despliegue:** de acá en adelante GitHub Pages sirve dos archivos en vez de uno — `index.html` y `styles.css` tienen que subirse juntos, o la app queda sin estilos.

---

## Arranque

### 🔧 Cambio — Paso 1 de la reestructuración: `firebase-init.js` pasa a `async`

Mapeo completo de la cadena de arranque (`core-state.js`, `firebase-init.js`, `firebase-sync.js`, `pin-bio.js`, `sheet-stack.js`, `bootstrap.js`) hecho con los archivos reales en mano, no asumido. Hallazgo: `firebase-init.js` cargaba como `<script type="module">` sin `async`, lo que el navegador trata igual que `defer` — **no lo ejecuta hasta terminar de parsear todo `<body>`**, sin importar que el `<script>` esté arriba de todo en el `<head>`. Mientras tanto, los ~30 `<script>` clásicos de la app (`core-state.js` y cada módulo de pantalla) sí bloquean el parser en su posición exacta y se ejecutan de inmediato al encontrarlos.

Efecto real: la app entera se parseaba y ejecutaba (el JS que Lighthouse mide como TBT de ~9s) **antes** de que Firebase siquiera arrancara a resolver el estado de auth — en serie, no en paralelo, aunque nada obliga a que sea así (`firebase-init.js` no depende de que el resto del JS clásico ya haya corrido).

**Fix:** se agregó `async` al `<script>` de `firebase-init.js`. Con eso, el navegador lo ejecuta apenas está listo (sus propios `import` del SDK de Firebase resueltos), sin esperar a que termine de parsearse el documento — dejando que la resolución de auth de Firebase (I/O de red/IndexedDB) corra en paralelo con el JS clásico en vez de esperar en serie a que termine.

**Red de seguridad agregada:** el callback de `onAuthStateChanged` sí toca el DOM (`#fb-loading-screen`, `#fb-login-screen`, `#fb-user-name`, etc.), así que se envolvió con un guard de `document.readyState`:

```js
onAuthStateChanged(auth, (user) => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => _onAuthState(user), { once: true });
  } else {
    _onAuthState(user);
  }
});
```

En la práctica no debería activarse nunca — Firebase tarda más en resolver el estado de auth (depende de IndexedDB/red) que lo que tarda el parser en llegar a esas dos divs, que son de las primeras cosas del `<body>` — pero sin este guard sería exactamente el mismo tipo de carrera que ya causó el bug real de `window.Events` vs `typeof Events` (ver `#infraestructura--seguridad` más arriba). Mismo criterio defensivo que ya usan `window._pendingPinGate` (5s) y `window._authgateReadyTimeout` (8s) en el resto de la cadena.

**Verificado:** `node --input-type=module --check` sin errores en `firebase-init.js`. La lógica del guard (no llamar sincrónicamente si el documento sigue en `loading`, llamar exactamente una vez tras `DOMContentLoaded`, llamar de inmediato si el documento ya está listo) se validó por separado con jsdom, ya que el archivo real importa el SDK de Firebase desde `gstatic.com` y no se puede ejecutar completo sin red ni sin un proyecto de Firebase real — **falta la prueba en un navegador real, con login/PIN/carga de datos de verdad, antes de dar este paso por cerrado del todo.**

### 🔧 Cambio — Paso 2: `firebase-sync.js` y `pin-bio.js` pasan a `async`

*(sesión posterior, probado en navegador real por el usuario tras el paso 1 — confirmado sin problemas de login/PIN/carga de datos)*

Mismo criterio que el paso 1, pero acá el mapeo encontró **dos riesgos que `firebase-init.js` no tenía**, porque estos dos archivos sí ejecutan código a nivel superior del módulo (no solo definiciones de función) que toca el DOM o depende de que otro `<script>` clásico ya haya cargado — algo que antes era seguro porque, sin `async`, el navegador garantiza que un módulo no ejecuta hasta terminar de parsear *todo* el documento (con lo cual todo el JS clásico, y en particular `js/core/events.js`, ya corrió). Al sacarle esa garantía con `async`, esos dos puntos dejan de ser seguros:

1. **`firebase-sync.js` — wiring del overlay "Eliminar cuenta" sin null-check.** El archivo original tenía `document.getElementById('del-account-overlay').addEventListener(...)` (y dos más análogos) corriendo directo a nivel superior, sin verificar que el elemento exista. **Confirmado con jsdom que revienta con `TypeError: Cannot read properties of null` si el DOM todavía no tiene esos elementos** — y como es una excepción sin capturar a nivel superior del módulo, corta la ejecución de *todo el resto del archivo*, incluyendo el registro de `Events('authgate', ...)` del final. Fix: se extrajo a `_wireDeleteAccountOverlay()`, con null-checks, envuelta en el mismo guard de `document.readyState`/`DOMContentLoaded` que ya usa `firebase-init.js`.

2. **`pin-bio.js` y `firebase-sync.js` — registro de `Events` sin reintento.** Ambos ya tenían un guard `if(typeof Events !== 'undefined' && ...)` antes de `Events.registerAll(...)` — pero sin `async`, ese guard nunca fallaba en la práctica (el navegador ya garantizaba que `events.js`, clásico, había corrido). Con `async`, si el guard llega a fallar, **antes no había ningún reintento — el namespace `'pin'`/`'authgate'` quedaba sin registrar para siempre**, silenciosamente (el botón de login se terminaba habilitando solo por el timeout de 8s de `firebase-init.js`, pero sin listener real detrás: clickearlo no hacía nada). Fix: se envolvió cada registro en una función que se reintenta cada 200ms hasta que `Events` esté disponible — mismo patrón que ya usaba este mismo `pin-bio.js` para su hook de `refresh()`, solo replicado a los otros dos puntos que no lo tenían.

También se envolvió el chequeo de `window._pendingPinGate` (que toca `#pin-screen`/`#fb-loading-screen` vía `_pinGate()`→`_showPin()`) con el mismo guard de `readyState`.

**Verificado:**
- `node --check` sin errores en ambos archivos.
- jsdom, tres escenarios: (a) `firebase-sync.js` ejecutando con el DOM del overlay todavía sin existir — no revienta, y una vez agregado el DOM y disparado `DOMContentLoaded`, el wiring queda conectado de verdad (probado con un evento `input` real habilitando el botón); (b) `pin-bio.js` con `_pendingPinGate=true` y `#pin-screen` todavía sin existir — no revienta, se consume el flag y se abre el sheet recién tras `DOMContentLoaded`; (c) ambos módulos cargando sin que `Events` exista todavía — los dos namespaces (`pin`, `authgate`) terminan registrándose solos vía el reintento apenas `Events` aparece.
- Reproducido el bug contra el `firebase-sync.js` **original** en el mismo escenario: efectivamente revienta con `TypeError: Cannot read properties of null (reading 'addEventListener')` — confirma que el riesgo era real, no hipotético.

**Sigue pendiente, mismo alcance que antes:** prueba en navegador real (login, PIN, biometría si aplica, "Eliminar cuenta") — la simulación con jsdom valida la lógica de los guards, no reemplaza probarlo con Firebase de verdad.

**Qué NO resuelven los pasos 1 y 2 juntos** (para no perder de vista el resto): el TBT de ~9s en sí no baja — el JS clásico de la app sigue pesando lo mismo y sigue bloqueando el parser en su posición. Lo que se gana, acumulado entre ambos pasos, es que **toda** la cadena de Firebase (auth + Firestore + PIN) corre en paralelo con el JS clásico en vez de esperar en serie a que termine. Próximos pasos según la hoja de ruta (`auditoria-tecnica.md` #4): pasar el JS clásico pesado a `defer`, y por último dividir el JS por pantalla (la solución de fondo).

### 🔧 Cambio — Paso 3: `defer` en los ~36 `<script>` clásicos, motivado por un Lighthouse real en producción

*(sesión posterior, con el reporte de Lighthouse de producción — Performance 43 — en mano)*

El usuario compartió el reporte completo de Lighthouse contra `drlight09.github.io/mis-finanzas/`. Dos hallazgos ahí, que no se sabían hasta tener el dato real:

1. **"Element render delay" del LCP: 11,710 ms** (de un LCP total mayor) — el elemento que cuenta como LCP existía pero tardaba casi 12 segundos en poder renderizarse.
2. **El árbol de dependencias de red muestra que cada `<script>` clásico no empezaba a *descargarse* hasta que el anterior terminaba de *ejecutar*** — no solo la ejecución estaba serializada (como ya se sabía desde el paso 1), la propia descarga también. Ejemplo concreto del reporte: `js/modules/inicio.js`, el último del bloque de ~36, **no arrancaba su fetch hasta los 9,460 ms** de la carga de página. Esto es consecuencia directa de que sean `<script src>` clásicos sin `defer`/`async`: el parser no puede *descubrir* el siguiente `<script>` hasta que termina de ejecutar (bloqueante) el que tiene enfrente.

**Por qué este paso es de menor riesgo que los pasos 1 y 2, aunque toque más archivos:** a diferencia de `async` (que rompe el orden relativo de ejecución entre scripts), `defer` **preserva exactamente el orden del documento** — mismo orden que tienen hoy siendo bloqueantes. Y como los ~36 `<script>` de este bloque están *todos* físicamente después de todo el HTML/markup real de la app (verificado: el primero, `events.js`, ya está después del cierre del body visual; no hay ningún elemento del DOM que dependa de que alguno de estos scripts corra a mitad de parseo), pasarlos a `defer` no cambia cuándo ejecutan respecto al DOM que necesitan — sigue siendo "con todo el HTML ya parseado", igual que hoy. Lo único que cambia es que las **descargas** de los 36 archivos arrancan todas en paralelo apenas el parser las descubre, en vez de una por una.

Se verificaron las dos restricciones de orden documentadas explícitamente en el código (`sheet-stack.js`: debe cargar después de `gastos.js`/`spotify.js` y antes de `deudores-personas.js`) — como no se reordenó ningún `<script>`, solo se agregó el atributo `defer`, ambas restricciones siguen cumplidas exactamente igual que antes.

**Qué NO se tocó:** `js/core/async-css.js` (sigue bloqueante, es minúsculo — 1.4 KiB, 0 ms de bloqueo real según el propio Lighthouse) y los tres módulos de Firebase (`firebase-init.js`/`firebase-sync.js`/`pin-bio.js`), que ya están en `async` desde los pasos 1 y 2, con sus propios guards — no tiene sentido mezclarlos con `defer` en el mismo bloque.

**Verificado:** conteo de tags antes/después (37 `<script src>` + 3 `<script type="module">`, sin duplicados ni tags perdidos — un primer conteo dio una falsa alarma por menciones de la palabra `<script>` dentro de comentarios, no por tags reales). No se tocó ningún archivo `.js`, solo `index.html`.

**Confirmado con Lighthouse real, sesión posterior** (recomendación: medir siempre en incógnito o perfil sin extensiones — una primera corrida contaminada por un gestor de contraseñas y un ad-blocker dio un score de 32, inservible para comparar; la corrida limpia fue la que importa):

| Métrica | Antes (paso 2, sin `defer`) | Después (paso 3, con `defer`) |
|---|---|---|
| Element render delay (LCP) | 11,710 ms | **3,300 ms (-72%)** |
| Minimize main-thread work | 26.6 s | **9.0 s (-66%)** |
| Reduce JS execution time | 3.7 s | **2.4 s (-35%)** |
| Long task más largo | 538 ms | **246 ms (-54%)** |
| Performance score | 43 | **48** |

Confirma la hipótesis: el cuello de botella real no era solo el orden de ejecución, era que el navegador no empezaba a *descargar* cada script hasta que el anterior terminaba de ejecutar. Con las 36 descargas en paralelo, el contenido real queda disponible bastante antes. ("Maximum critical path latency" osciló entre 9s y 36s entre corridas — ruido de cuánto duró abierta la conexión de long-polling de Firestore durante la medición, no una regresión real; ese insight está marcado "Unscored", no afecta el puntaje.)

El TBT en sí (26.6s de "main-thread work" total, con "Other" en 18.4s dominando — probablemente los canales `Listen`/`Write` de larga duración de Firestore, que Lighthouse cuenta en el critical path aunque no bloqueen nada, al ser conexiones de long-polling) no debería bajar con este cambio — sigue siendo trabajo de ejecución, no de orden.

### 🔧 Cambio — Paso 4: pintar con el caché local de inmediato en vez de esperar hasta 8s al servidor

Cambio quirúrgico en `_fbLoadData()` (`firebase-sync.js`), sin tocar `firebase-init.js` ni `pin-bio.js` — no afecta el auth ni el PIN gate, solo qué pasa después de que ambos ya resolvieron.

**Lo que había:** `onSnapshot` puede entregar la primera respuesta desde el caché local (`fromCache=true`, vía `persistentLocalCache()`) antes de confirmar con el servidor. El código anterior, a propósito, ignoraba esa primera entrega de caché "para no mostrar datos obsoletos" y esperaba hasta 8s la confirmación del servidor antes de pintar nada — con un fallback a caché si el servidor no respondía a tiempo. En la práctica esos hasta-8s eran, la mayoría de las veces, puro spinner sin beneficio real: el caché de `persistentLocalCache()` es el mismo dispositivo releyendo su propio último `setDoc()`, casi nunca "obsoleto" de verdad.

**Fix:** se pinta con lo que llegue primero (caché o servidor) y, si el servidor confirma después con datos distintos, se reconcilia por el mismo camino que ya usábamos para actualizaciones en tiempo real de otro dispositivo — sin re-inicializar listeners. Se introdujo `_firstPaintDone` (separado de `_firstLoad`) precisamente para eso: puede llegar una entrega de caché y luego una de servidor, pero `_finishFirstLoad()` (que llama a `_initEventListeners()`) solo debe correr una vez.

Se eliminó también `window._fbCacheFallbackTimer` (el timer de 8s) — ya no hace falta esperar nada, así que no hay nada que hacer fallback. Quedaron dos líneas de limpieza inofensivas en `_fbSignOut`/`_fbDeleteAccount` que lo referenciaban (el `if` nunca entra ahora), anotadas en vez de borradas para no tocar código de cierre de sesión sin necesidad real.

**Validado:** `node --check` sobre el archivo completo, más una simulación aislada en Node de la máquina de estados (4 escenarios: caché→servidor, solo servidor sin caché previo, error de conexión antes de cualquier snapshot, doble entrega de caché) — los 4 pasan. **Falta la prueba en navegador real** (con conexión real a Firestore, no se puede simular con Node solo) antes de dar esto por cerrado — mismo criterio que el resto de la reestructuración de arranque.

**Lo que NO cambia:** el auth (`firebase-init.js`), el PIN gate (`pin-bio.js`), y el caso de un dispositivo sin caché local (nunca abrió la app antes) — ese sigue esperando al servidor igual que siempre, porque simplemente no hay caché que pintar primero.

### 🔎 Diagnóstico — Lighthouse real (sitio ya desplegado): el cuello de botella real no es el JS

El usuario reportó que el performance score no mejoraba (dio 40) pese a todo el trabajo de arranque/lazy-loading de esta sesión y las anteriores, y pidió un reporte Lighthouse completo del sitio real (`drlight09.github.io/mis-finanzas/`) para diagnosticar.

**El hallazgo, con números del reporte:**
- **Latencia máxima de la ruta crítica: 6.464 ms.** Dominada por los canales `Listen`/`Write` de Firestore (`experimentalForceLongPolling: true` en `firebase-init.js`) — entre 4.141 ms y 6.464 ms cada uno — y por `auth/iframe.js` (5.678 ms) y `getProjectConfig` (6.095 ms).
- **Element render delay: 3.600 ms**, con el elemento LCP siendo el badge "NU Mastercard Gold: cupo casi agotado" del dashboard — confirma que el LCP depende de que los datos reales (Firestore) y el módulo de Tarjetas de Crédito ya estén listos, no de JS suelto.
- En "Avoid long main-thread tasks": `inicio.js` no empieza a ejecutar hasta el ms **8.467**; `bootstrap.js` hasta el **7.479**. El JS está listo hace rato — lo que no está listo es la red.

**Conclusión:** todo el trabajo de `defer`/lazy-loading/extracción de CSS de esta sesión y las anteriores optimiza la parte del tiempo de carga dominada por *ejecución y orden de JS* — que ya bajó de forma medible (Element render delay 11.710→3.300 ms en el paso 3 del arranque). Pero en este reporte, el tiempo dominante es *establecer la conexión de Firestore/Auth* (6.4s), un orden de magnitud más grande que cualquier ganancia posible tocando JS. Es la razón por la que el score no se mueve pese al trabajo hecho: se estuvo optimizando la porción más chica del problema.

**Sospechoso principal:** `experimentalForceLongPolling: true` en `firebase-init.js` (agregado en su momento para evitar `ERR_QUIC_PROTOCOL_ERROR`) fuerza a Firestore a negociar el canal en tiempo real por long-polling — varios round-trips HTTP — en vez de dejar que el SDK use WebChannel normal cuando puede. Alternativa recomendada por Firebase para este caso: `experimentalAutoDetectLongPolling: true`, que detecta automáticamente si hace falta caer a long-polling en vez de forzarlo siempre.

**🔧 Cambiado (sesión posterior):** se reemplazó `experimentalForceLongPolling: true` por `experimentalAutoDetectLongPolling: true` en `firebase-init.js` — cambio de una sola línea, sin tocar el resto del archivo. Sigue sin poder validarse la negociación real de protocolo sin un navegador real conectado a Firestore (no se puede simular con Node/jsdom), así que **falta la prueba en producción/navegador real** antes de dar esto por cerrado — y existe el riesgo de que reaparezca el `ERR_QUIC_PROTOCOL_ERROR` original que motivó forzar long-polling, en cuyo caso el revert es igual de simple (una línea).

**🔧 Cambiado (misma sesión) — log persistente de errores de sync:** el handler de error de `onSnapshot` en `firebase-sync.js` ya hacía `console.error` + `setSyncStatus('error', ...)`, pero eso se pierde en cuanto se cierra la pestaña/consola. Se agregó, dentro de ese mismo handler, un registro en `localStorage` (clave `mf_syncErrors`, prefijo `mf_` a propósito para que quede cubierta por `_limpiarStorageLocal()` si el usuario borra la cuenta) con los últimos 20 errores (timestamp, `error.code`, `error.message`). Se agregó `window._verSyncErrors()` como helper de consola para leerlo con formato legible. Objetivo: poder confirmar más adelante, sin haber estado mirando la consola en el momento exacto, si el problema de conexión (relacionado con el cambio de `experimentalAutoDetectLongPolling` de arriba) reapareció. Validado con `node --check` sobre el archivo completo.

### 🔧 Cambio — preconnects: 2 rotos, 1 nuevo (con el mismo Lighthouse real)

El mismo reporte, en "Preconnected origins", marcó dos de los 4 `<link rel="preconnect">` existentes como desperdiciados:
- `https://fonts.googleapis.com` — "Unused preconnect. Check that the crossorigin attribute is used properly": el `<link>` no tenía `crossorigin`, así que el navegador abría la conexión pero la descarga real del CSS de Google Fonts (que sí pide con modo `crossorigin`) no la reutilizaba. **Fix:** se agregó `crossorigin` al `<link>` existente.
- `https://securetoken.googleapis.com` — "Only use preconnect for origins that the page is likely to request": no se pide nada de ahí en esta carga (solo se usa más tarde, al refrescar el token de sesión). **Fix:** se sacó — de paso, deja lugar dentro de la recomendación de Lighthouse de no pasar de 4 preconnects.

Y en "Preconnect candidates" (dominios sin preconnect que Lighthouse detectó como usados de verdad en esta carga, con ahorro estimado): `fonts.gstatic.com` (500 ms, el de mayor ahorro de los 4 sugeridos — es de donde bajan los `.woff2` reales, distinto del dominio que solo sirve el CSS), `apis.google.com` (360 ms), `mis-finanzas-z.firebaseapp.com` (350 ms), `fonts.googleapis.com` (300 ms, ya cubierto arriba). Se agregó solo `fonts.gstatic.com` — el de mayor impacto — para no pasarse de los ~5 preconnects totales que quedaron.

Cambio de solo `<link>` en el `<head>`, sin lógica — no necesita prueba en navegador para confirmar que no rompe nada (un preconnect de más o de menos no cambia el comportamiento, solo el timing), pero sí conviene remedir con Lighthouse real después de desplegar para confirmar el ahorro.

### 📋 Otros hallazgos del mismo reporte, sin tocar todavía

- **Minify JavaScript — 14.2 KiB de ahorro estimado**, concentrado en `core-state.js` (7.9 KiB), `spotify.js` (3.7 KiB), `mesada.js` (2.7 KiB). Ninguno de los ~36 archivos de `js/` está minificado. No se tocó — minificar a mano no es viable de forma segura para archivos de este tamaño; necesitaría un paso de build (ya lo menciona la auditoría vieja como "disponible como paso de build").
- **Reduce unused CSS — 18.4 KiB, Font Awesome (`all.min.css` de cdnjs)**: ya documentado y bloqueado (sin acceso a cdnjs desde este entorno para self-hostear un subset).
- **`js/core/async-css.js` aparece en "Render-blocking requests"** junto con `css/styles.css` (que bloquea a propósito). El trabajo de `async-css.js` es específicamente volver *no* bloqueante la carga de Font Awesome/Google Fonts (con el truco `media="print"`), pero el `<script>` en sí no tiene `defer` — bloquea el parseo mientras hace ese trabajo. Impacto probablemente chico (1.4 KiB) pero irónico. No se tocó — no se subió ese archivo esta sesión, hace falta confirmar que agregarle `defer` no rompe el truco de `media="print"→"all"` que hace.
- **Cache TTL de 10 minutos** en todos los archivos servidos desde GitHub Pages (est. 344 KiB de ahorro en visitas repetidas). Limitación conocida de GitHub Pages — no permite configurar headers de caché personalizados sin poner un CDN (ej. Cloudflare) delante. Fuera de alcance de un cambio de código.


---

## Modularización por pantalla — mapeo y fase 0.5

### 🔍 Mapeo (sesión posterior) — hallazgo central: `refresh()` bloquea cualquier carga bajo demanda

Antes de diseñar el mecanismo de carga bajo demanda por pantalla (punto 3 de `auditoria-tecnica.md`), se mapeó con `grep` sistemático contra 24 de los ~36 archivos reales (faltan los core chicos: `events.js`, `diferencial.js`, `split.js`, `money-input.js`, `movimientos.js`, `mas-menu.js`, `sheet-viewport.js`, `sheet-swipe.js`, `gastos-fijos-progress.js`, `mejoras.js`, `mejoras-adicionales.js`, `busqueda-global.js`, `nav.js`, `actividad_reciente.js`, `personas-init.js`, `import-validado.js`, `async-css.js`). Tres hallazgos:

1. **`refresh()` en `core-state.js` — llamada después de CADA `save()` en toda la app — invocaba sin ningún `typeof` guard a `renderDetalleCuenta`/`renderMovsCustom`/`renderCajitas`/`renderCustomCuentasList`/`renderEncargosEnCuenta` (cuentas.js/encargos.js), `renderGastosVar`/`renderGastosFijos`/`renderMesFiltros` (gastos.js), `renderDeudoresList` (prestado.js), `renderMesada` (mesada.js), `renderSpotify` (spotify.js), `renderAttencion` (inicio.js), `renderTCDashboard` (tarjetas_credito.js).** Confirmado con jsdom que revienta con `ReferenceError` si cualquiera de esos módulos no está cargado — y al ser una excepción sin capturar a mitad de la función, corta también las llamadas posteriores a módulos que sí estaban cargados. Esto bloquea de raíz cualquier intento de cargar un módulo de dominio bajo demanda: hoy, no cargar `spotify.js` de entrada rompe `refresh()` para *toda* la app, no solo para Spotify.
2. **El patrón "parchar la función original" (`const _orig = X; X = function(){...}`) aparece en 8 de los 24 archivos ya vistos** (`spotify-personas.js`: 5, `encargos-personas.js`: 4, `encargos.js`/`prestado-personas.js`: 3 c/u, `alcancia.js`/`deudores-personas.js`/`sheet-stack.js`: 2 c/u, `inicio.js`: 1) — es la norma, no la excepción. Implica que ciertos grupos de archivos (`spotify.js`+`spotify-personas.js`, `prestado.js`+`prestado-personas.js`+`deudores-personas.js`, `encargos.js`+`encargos-personas.js`) tendrán que cargarse siempre juntos y en ese orden interno bajo cualquier mecanismo de carga bajo demanda — no se pueden separar.
3. **Personas confirmado como librería transversal, no una pantalla más:** `spotify-personas.js`, `encargos-personas.js`, `prestado-personas.js`, `deudores-personas.js` dependen todos de `getPersona`/`abrirSelPersona`/`_inyectarPersonaSheets`/`PERSONA_COLORES` de `personas.js`.

### 🔧 Cambio — Fase 0.5: blindar `refresh()` con `typeof` guards

Se agregó `if(typeof X==='function')` a las 12 llamadas sin guard listadas arriba — mismo patrón defensivo que ya usaba `showScreen()` en varios puntos de `sheet-stack.js`. Sin funciones nuevas, sin cambiar el comportamiento actual (todos los módulos siguen cargando de entrada, como siempre) — el único efecto hoy es que `refresh()` deja de asumir que un módulo de dominio específico existe. Es un prerrequisito para cualquier carga bajo demanda futura, independiente de qué tan lejos se llegue con el resto del plan.

**Verificado:**
- `node --check` sin errores en `core-state.js`.
- jsdom: `refresh()` extraída y ejecutada con un sandbox que a propósito no define ninguno de los 12 `render*`/`calc*` de dominio — no revienta. Con un solo módulo "cargado" (`renderSpotify` agregado al sandbox), se confirma que sí se invoca de verdad (no quedó guardeado por error).
- Reproducido el bug contra el `core-state.js` **original** en el mismo escenario: revienta con `renderCajitas is not defined` — confirma que el riesgo era real, no hipotético.

**Sigue pendiente:** terminar de mapear los ~17 archivos que faltan, y recién ahí diseñar el mecanismo de carga bajo demanda en sí (fase 1-4 de `auditoria-tecnica.md` #4).

### 🔍 Mapeo completo (40/40 archivos) — cierre de la fase 0

Con los 17 archivos restantes en mano (`events.js`, `diferencial.js`, `split.js`, `money-input.js`, `movimientos.js`, `mas-menu.js`, `sheet-viewport.js`, `sheet-swipe.js`, `gastos-fijos-progress.js`, `mejoras.js`, `mejoras-adicionales.js`, `busqueda-global.js`, `nav.js`, `actividad_reciente.js`, `personas-init.js`, `import-validado.js`, `async-css.js`), se cerró el mapeo de dependencias de los ~36 archivos de la app.

**Segundo caso del mismo bug de `refresh()`, encontrado y corregido:** `navTo()` en `nav.js` llamaba `renderTCScreen()` (tarjetas_credito.js) sin `typeof` guard. Inofensivo hoy — el único caller real es el propio `tarjetas_credito.js` vía `Events.registerAll({ verTodo: () => navTo('tarjetas') })`, así que `renderTCScreen` ya existe en ese momento — pero misma suposición implícita fragil que `refresh()`. Corregido con el mismo patrón: `if(screen==='tarjetas' && typeof renderTCScreen==='function')renderTCScreen();`. Confirmado que ningún otro de los 17 archivos tiene el mismo problema — ya usan `typeof`/polling/`try-catch` de forma consistente.

**Corrección a una hipótesis del mapeo anterior:** se pensó que `busqueda-global.js` sería otra razón para mantener los módulos de dominio en núcleo (buscar en Spotify/Encargos exigiría tenerlos cargados). Al revisar el archivo real, busca directo sobre `S.gastosVar`/`S.deudores`/`S.encargos`/`S.misDeudas`/`S.spotifyHistorial`/`S.spotifyPersonas`/`S.personas`/`S.cajitas`/`S.cuentasPersonalizadas`/`S.gastosFijos`/`S.movimientos` — los datos, no las funciones de render de cada módulo. Como `S` siempre está disponible (viene de Firestore, no del JS de cada módulo), la búsqueda global no obliga a que ningún módulo de dominio esté cargado.

**Mapa final de tiers:**

- **Núcleo (17 archivos):** `events.js`, `core-state.js`, `sheet-stack.js`, `diferencial.js`, `split.js`, `money-input.js`, `movimientos.js`, `personas.js`+`personas-init.js` (transversal a 4 pantallas), `mas-menu.js`, `sheet-viewport.js`, `sheet-swipe.js`, `mejoras.js`, `mejoras-adicionales.js`, `busqueda-global.js`, `nav.js`, `async-css.js`, `bootstrap.js` — más `firebase-init.js`/`firebase-sync.js`/`pin-bio.js`, que ya están en `async` desde los pasos 1-2 del arranque.
- **Por pantalla, en los grupos que deben cargar juntos por el patrón de override (ver mapeo anterior):** `mesada.js` · `spotify.js`+`spotify-personas.js` · `gastos.js`(+`gastos-fijos-progress.js`, hoy en núcleo, candidato a mover) · `prestado.js`+`prestado-personas.js`+`deudores-personas.js` · `encargos.js`+`encargos-personas.js` · `tarjetas_credito.js` · `cuentas.js` · `plata_comprometida.js` · `actividad_reciente.js` · `alcancia.js` · `configuracion.js`+`import-validado.js` · `analisis.js` · `inicio.js` (a confirmar si conviene núcleo por ser la pantalla de arranque).

Con esto queda cerrada la fase 0 (mapeo). Siguiente paso: diseñar el mecanismo de carga en sí (fase 1 de la hoja de ruta).

### 🔧 Cambio — Fase 1: piloto de carga bajo demanda con Alcancía

Con el mapeo completo (fase 0) y `refresh()`/`navTo()` ya blindados (fase 0.5), se diseñó e implementó el mecanismo de carga bajo demanda, y se hizo el piloto con Alcancía (elegida por ser chica — ~14 KiB — y no tener enredo con Personas).

**Hallazgo de diseño, revisando `showScreen()` completa para el enganche:** Alcancía no se integra con una rama `if(name==='alcancia')` como Mesada/Encargos/Cuentas — se auto-registra parchando `showScreen()` ella misma al cargar (`const _orig = showScreen; showScreen = function(name){ _orig(...); if(name==='alcancia') renderAlcancia(); }`). Un diseño de loader que simplemente "esperara a que cargue y siguiera con la lógica de siempre" habría dejado la *primera* visita sin renderizar nada — el parche recién queda activo para la llamada *siguiente*, no para la que disparó la carga.

**Solución:** en vez de continuar la ejecución después de cargar, el loader **vuelve a invocar `showScreen(name)` desde cero**. Así cubre los dos patrones de integración que existen hoy en la app (rama `if(name===X)`, y auto-parche de `showScreen()`) sin que el mecanismo tenga que saber cuál usa cada módulo — y cubre automáticamente cualquier patrón nuevo que aparezca en el futuro.

**De paso, un tercer caso del mismo bug de `refresh()`/`navTo()`:** al revisar `showScreen()` completa (antes solo se había visto en fragmentos) aparecieron 4 llamadas más sin `typeof` guard: `config`→`renderCatsConfig()`, `analisis`→`renderAnalisis()`, `personas`→`_inyectarPersonaSheets()`/`_renderListaPersonas()`/`_actualizarMasPersonasSub()`, `cuentas`→`renderDetalleCuenta()`. Se blindaron con el mismo patrón, ya que se estaba tocando esta función de todas formas.

**Piezas nuevas:**
- **`js/core/lazy-loader.js`** — `Loader.ensure(grupo)` (Promise, cachea por grupo, carga los archivos de un grupo en orden — no en paralelo, por el patrón de "parchar función original" que exige orden), `Loader.isLoaded(grupo)`, `Loader.GROUPS` (hoy solo `{ alcancia: ['js/modules/alcancia.js'] }` — el resto de las pantallas sigue cargando de entrada, sin cambios).
- **`showScreen()` en `sheet-stack.js`** — antes de las ramas `if(name===X)`, chequea `Loader.GROUPS[name] && !Loader.isLoaded(name)`: si aplica, muestra un estado "Cargando…" (texto centrado, insertado en el propio contenedor de la pantalla — deliberadamente simple, no spinner/skeleton, dado que el piloto es un solo archivo chico), pide `Loader.ensure(name)`, y al resolver oculta el estado de carga y vuelve a llamar `showScreen(name)`.
- **`index.html`** — se sacó `<script src="js/modules/alcancia.js" defer>` de la carga de entrada, se agregó `<script src="js/core/lazy-loader.js" defer>` (junto a `sheet-stack.js`).

**Verificado con jsdom (10 checks):** extraída `showScreen()`/`Loader` reales y simulada la descarga del script (sin red real) reproduciendo exactamente el auto-parche que hace `alcancia.js`:
- Primera visita: aparece "Cargando…", `renderAlcancia()` **sí se dispara en la primera visita** (el escenario que motivó el rediseño), el script se pide una sola vez.
- Segunda visita: no vuelve a mostrar "Cargando…", sí vuelve a renderizar (vía el `showScreen` ya parchado), el script no se vuelve a pedir (caché del `Loader`).
- Pantallas no registradas en `GROUPS` (ej. Inicio): comportamiento idéntico al de siempre, sin ningún estado de carga ni demora.
- `node --check` sin errores en `lazy-loader.js`, `sheet-stack.js`.

**Sigue pendiente:** prueba en navegador real — jsdom no puede simular la descarga de red real de `alcancia.js` vía GitHub Pages, solo la lógica del mecanismo. Verificar en vivo: entrar a Alcancía por primera vez en una sesión nueva (con la red del navegador visible en DevTools, para confirmar que `alcancia.js` no se descarga hasta ese momento), que el contenido real aparezca y no se quede pegado en "Cargando…", y que las acciones dentro de Alcancía (depositar, destapar) funcionen igual que antes.

**Si el piloto funciona bien en navegador real, próximos candidatos a agregar a `Loader.GROUPS`** (en grupos, respetando el orden de carga interno documentado en el mapeo): `mesada` · `spotify`+`spotify-personas` · `gastos`(+`gastos-fijos-progress`) · `prestado`+`prestado-personas`+`deudores-personas` · `encargos`+`encargos-personas` · `tarjetas_credito` · `cuentas` · `plata_comprometida` · `actividad_reciente` · `configuracion`+`import-validado` · `analisis`. `inicio` queda deliberadamente fuera del piloto — es la pantalla de arranque, conviene decidir aparte si conviene hacerla lazy.

### 🔎 Hallazgo — esta lista era optimista: casi ninguno de esos candidatos es lazy-cargable sin tocar `inicio.js` primero

Sesión posterior, con 14 de los 18 archivos de `js/modules/` disponibles (faltaron `gastos-fijos-progress.js`, `import-validado.js`, y los de infraestructura). Antes de tocar `Loader.GROUPS`, se armó el grafo de dependencias real (con un script en Python: qué función define cada archivo, quién la llama desde otro archivo) en vez de asumir que "un solo archivo, sin partirse en dos" (criterio usado en el mapeo original) implica que también es seguro cargarlo bajo demanda — son preguntas distintas.

**El resultado:** `inicio.js` (el dashboard, que por diseño carga siempre de entrada) llama **directo**, sin ningún `typeof` guard, a funciones de `mesada.js` (`_getCuotaAnio`, `_mesNombreDeKey`, `getMesadaData`), `spotify.js` (`spNombreDe`, `spPersonaPagadaVigente`), `prestado.js` (`getDeudorSaldo`, `totalPrestadoPendiente`), `tarjetas_credito.js` (`tcCupoUsadoPct`), `cuentas.js` (`calcC`, `calcCDT`, `calcRendimientoCDTsMes`, `nuTotal`) y `analisis.js` (`renderPresupuestos`) — para armar el resumen del dashboard, que se renderiza en cada boot. Si cualquiera de esos seis se vuelve lazy tal cual está, el dashboard revienta con `ReferenceError` en el primer login de cada sesión (no en un caso raro — en el camino más común de todos: abrir la app).

Encima, `cuentas.js` (que por esto queda forzado a cargar de entrada) llama a su vez, sin guard, a `renderEncargosEnCuenta()`/`getCajitaNombre()` de `encargos.js`, dentro del render normal del detalle de una cuenta (Nequi/Nu/Efectivo) — no un caso raro tampoco. Eso descarta también a `encargos`(+`encargos-personas`) como candidato lazy sin tocar antes ese acoplamiento.

Con eso, de los 11 candidatos de la lista original, quedan efectivamente **descartados sin refactor previo**: `mesada`, `spotify`+`spotify-personas`, `prestado`+`prestado-personas`+`deudores-personas`, `tarjetas_credito`, `cuentas`, `analisis`, `encargos`+`encargos-personas`. `gastos`(+`gastos-fijos-progress`) y `configuracion`(+`import-validado`) siguen sin poderse confirmar — faltaron esos dos archivos satélite en esta sesión, y el mapeo original ya los agrupó junto con su módulo principal precisamente por sospecha de un acoplamiento del mismo tipo.

**El único candidato que quedó limpio: `plata_comprometida.js`.** Nadie lo llama desde ningún otro archivo de los 14 revisados, y lo que él sí necesita (`prestado.js`, `tarjetas_credito.js`, `cuentas.js`, `inicio.js`) ya está forzado a cargar de entrada por la razón de arriba — sus dependencias están cubiertas sin que se le tenga que pedir nada especial a nadie.

### 🔧 Cambio — segundo grupo lazy: `comprometida` (`plata_comprometida.js`)

A diferencia de Alcancía, `plata_comprometida.js` no tenía ni su pantalla ni su ítem del menú "Más" como HTML estático — los auto-inyectaba en tiempo de ejecución (`_injectScreen()`, `_injectMasItem()`, cada una con guard por id). Si se lo dejaba tal cual y se sacaba solo el `<script>`, el ítem de menú que dispara la carga lazy no existiría hasta que el módulo ya hubiera cargado por su cuenta — círculo vicioso, y además `showScreen()` no tendría dónde insertar el texto "Cargando…" (necesita el contenedor de la pantalla ya en el DOM, ver nota del piloto de Alcancía arriba).

Se copió ese HTML (el que generaban esas dos funciones) tal cual a `index.html` — `#screen-comprometida` en el lugar de las pantallas, `#mas-comprometida` en el menú "Más", en la misma posición donde `_injectMasItem()` lo insertaba (antes de Alcancía). `plata_comprometida.js` no se tocó en su lógica: sus propios guards por id vuelven ambas funciones no-op automáticamente al encontrar el HTML ya puesto — mismo mecanismo, sin código nuevo, que ya usa `_injectMasItem()` cuando alguien se adelantó (busca `#mas-alcancia` como ancla). `_injectSheet()` (el otro contenido dinámico del archivo) se dejó sin tocar a propósito: nadie puede interactuar con ese sheet antes de que la pantalla esté activa, y la pantalla no se activa hasta que el módulo ya cargó — no hay carrera ahí, a diferencia del ítem de menú.

**Validado con jsdom:** se cargó el `index.html` real, se confirmó que `#screen-comprometida` y `#mas-comprometida` existen exactamente una vez cada uno, se extrajeron `_injectScreen()`/`_injectMasItem()` tal cual del archivo real y se corrieron contra ese DOM — ninguna lanzó error, ninguna duplicó nada. `node --check` sin errores en `plata_comprometida.js` y `lazy-loader.js`. **Sigue pendiente la prueba en navegador real** — jsdom no simula la carga de red ni el `showScreen()`/`Loader` real de `sheet-stack.js` (no disponible esta sesión, solo se pudo validar el HTML estático y las dos funciones de auto-inyección). Verificar en vivo, con DevTools abierto: que `plata_comprometida.js` no se descargue hasta hacer clic en "Plata comprometida" del menú Más, que la pantalla muestre "Cargando…" brevemente y después el contenido real, y que crear/editar/recibir un ingreso comprometido funcione igual que antes.

**Nota para retomar `gastos` y `configuracion`:** hace falta subir `gastos-fijos-progress.js` e `import-validado.js` para poder correr el mismo análisis de grafo de dependencias sobre esos dos y confirmar (o descartar) si son lazy-cargables.

### 🔎 Cierre del análisis — `configuracion` sí, `gastos` no (con `sheet-stack.js`, `nav.js` y los dos satélites ya disponibles)

Con los 4 archivos que faltaban, se pudo terminar el análisis de dependencias sobre los últimos dos candidatos de la lista original.

**`gastos.js` queda descartado — y esta vez el bloqueo es más duro que los anteriores.** No es `inicio.js` esta vez: es `sheet-stack.js` (núcleo, carga siempre) el que parchea `addGastoVar`/`addGastoFijo` **a nivel superior de su propio archivo** (`const _origAddGastoVar = addGastoVar; addGastoVar = function(){...}`, fuera de cualquier función) — el propio header de `sheet-stack.js` ya lo documentaba como una restricción de orden de carga explícita ("Debe cargar DESPUÉS de js/modules/gastos.js"). Si `gastos.js` se vuelve lazy, esto no rompe solo Gastos ni solo el primer login — rompe el parseo de `sheet-stack.js` en **cada carga de la app**, con `gastos.js` cargado o no, porque el `ReferenceError` ocurre al evaluar el archivo, no al invocar una función. Arreglarlo de raíz significaría diferir ese parche (mismo patrón que ya usa el override de `addSpotify` ahí mismo, que vive dentro de `_injectErrorSpans()` en vez de a nivel superior — el propio archivo ya muestra la forma correcta al lado de la incorrecta) — es un cambio real y acotado, pero es editar un archivo núcleo con restricciones de orden ya documentadas como frágiles, así que se deja aparte en vez de tocarlo sin que se pida explícitamente.

**`configuracion.js` (+ `import-validado.js`) sí se pudo confirmar limpio — el más simple de los tres grupos lazy hasta ahora.** `inicio.js` no lo llama. El único caller externo de una de sus funciones (`renderCatsConfig`, desde `sheet-stack.js`) ya tenía guard `typeof` desde la sesión del piloto de Alcancía (uno de los "4 ramas de showScreen()" corregidas en ese momento). Y a diferencia de Plata Comprometida, `#screen-config` y `#mas-config` **ya eran HTML estático** desde antes — no hubo que copiar ni una línea de HTML, solo sacar los dos `<script>` y agregar el grupo a `Loader.GROUPS`. Se verificaron uno por uno los 9 ids que `configuracion.js` cablea a nivel superior (`btn-exportar-json`, `btn-importar-json`, `btn-exportar-csv`, `btn-borrar-todo`, `importFileInput`, `nueva-cat-var`, `nueva-cat-fijo`, `cats-var-list`, `cats-fijo-list`) — los 9 existen en el HTML estático de `screen-config`, así que el wiring de `addEventListener` sigue funcionando igual sin importar cuándo cargue el archivo.

### 🔧 Cambio — tercer grupo lazy: `config` (`configuracion.js` + `import-validado.js`)

Se sacaron los `<script src="js/modules/configuracion.js" defer>` y `<script src="js/core/import-validado.js" defer>` de la carga de entrada. Se agregó `config: ['js/modules/configuracion.js', 'js/modules/import-validado.js']` a `Loader.GROUPS` — en ese orden, porque `import-validado.js` parchea `leerArchivoImport` a nivel superior de su propio archivo (necesita la versión base ya definida al parsear, mismo tipo de dependencia que bloqueó a `gastos.js`, pero acá sí queda satisfecha por el orden secuencial del propio `Loader.ensure`, que carga los archivos de un grupo uno por vez y en el orden declarado).

**Validado con jsdom, esta vez contra el `lazy-loader.js` y el `sheet-stack.js` reales** (no una simulación aparte como con Plata Comprometida — ya se tenían ambos archivos): se cargó `index.html` en un DOM real, se interceptó `document.body.appendChild` para simular la descarga de red sin depender de acceso externo, y se corrió `Loader.ensure()` sobre los 3 grupos (`alcancia`, `comprometida`, `config`). Los 3 cargan sus archivos en el orden declarado, cachean (`isLoaded` queda `true`), y una segunda llamada a `ensure()` no vuelve a encolar nada. Se confirmó además que los 3 tienen su `#screen-X` y su ítem de menú/nav ya en el DOM desde el arranque (requisito que `showScreen()` da por sentado sin `null`-check: `document.getElementById('screen-'+name).classList.add('active')`). `node --check` sin errores en `lazy-loader.js`.

**Sigue pendiente la prueba en navegador real** — jsdom valida la lógica de `Loader`/`showScreen()` pero no la descarga de red real contra GitHub Pages ni el resultado visual. Verificar en vivo: entrar a Configuración por primera vez en una sesión nueva con DevTools abierto (confirmar que `configuracion.js` no se descarga hasta ese momento), que las categorías, el export/import JSON y CSV, y el borrado de datos sigan funcionando igual.

Con esto, de los 11 candidatos de la lista original quedan: **3 confirmados y dados** (`alcancia`, `comprometida`, `config`), **7 descartados sin refactor previo** (`mesada`, `spotify`+`spotify-personas`, `prestado`+`prestado-personas`+`deudores-personas`, `tarjetas_credito`, `cuentas`, `analisis`, `encargos`+`encargos-personas`, `gastos`+`gastos-fijos-progress`), y **1 inconcluso** (`actividad_reciente` — pantalla estática confirmada, pero no se encontró desde dónde se entra a ella; probablemente en `mas-menu.js`, no disponible).

### 🔎 Cierre del análisis — `actividad_reciente` sí, con `mas-menu.js` ya disponible

`mas-menu.js` confirma el mecanismo genérico que ya se había inferido para Plata Comprometida y Configuración: cualquier `.mas-item[data-screen]` dispara `showScreen(screen)` sin código particular por pantalla (solo Spotify y Mesada tienen un toggle de visibilidad aparte, para ocultarse/mostrarse según el módulo activo — no relacionado con lazy loading).

Con `mas-menu.js` confirmado, se pudo cerrar la duda de `actividad_reciente`: su acceso real es un botón **dentro de la pantalla de Configuración** (`#cfg-historial-row`, `data-action="config:irA" data-args='["historial"]'`) — no hay entrada en el menú "Más" ni en el nav inferior, y el propio `actividad_reciente.js` ya lo documentaba en su encabezado (nota fechada, dejada por una sesión anterior: "ningún ítem del nav inferior usa data-screen='historial', y el menú 'Más' no tiene entrada 'Actividad reciente'"). Esto no era información nueva — solo confirma lo que el archivo ya decía, ahora contrastado contra `mas-menu.js` real.

**Con eso, `actividad_reciente.js` parecía otro candidato limpio como Plata Comprometida y Configuración** — nadie llama sus funciones (confirmado con el mismo análisis de grafo), `#screen-historial` ya es estático, y su único punto de entrada (el botón en Configuración) también es estático y solo alcanzable si Configuración ya cargó, prerequisito que ya existía de antes.

**Pero apareció un problema real, propio de este módulo, que no tuvieron los otros tres.** `actividad_reciente.js` no se auto-renderiza al cargar como sí hace `plata_comprometida.js` (con `_cpInit()`, incondicional) — se renderiza solo quando dispara alguno de 3 eventos: `DOMContentLoaded`, `appDataLoaded`, o un clic en `#cfg-historial-row` capturado por un listener que el propio archivo registra al cargar. **Con carga lazy, los 3 disparadores fallan siempre:** `DOMContentLoaded` y `appDataLoaded` ya pasaron mucho antes de que el usuario llegue a hacer clic en algo (el módulo carga recién ahí); y el listener de clic en `#cfg-historial-row` se registra DESPUÉS del propio clic que disparó la carga — llega tarde para capturar ese mismo clic. Sin arreglarlo, la pantalla Historial quedaría pegada en "Cargando…" para siempre en la primera visita de cada sesión.

**Fix, dentro de `actividad_reciente.js`:** se agregó un cuarto trigger, sin condición de evento, al final del archivo — una llamada directa a `renderFeedActividad()` que corre apenas termina de parsear el módulo, sea cual sea el momento en que eso pase. Mismo criterio que ya usa `_cpInit()` en `plata_comprometida.js` ("Render inicial si hay datos"). `renderFeedActividad()` ya lee `S` con fallback si no existe todavía (documentado en el propio encabezado del archivo), así que la llamada es segura sin condiciones extra. En el caso eager (si algún día se revirtiera el lazy loading) es inofensiva: los otros 3 triggers siguen cubriendo ese caso, esto solo suma una llamada más a una función idempotente.

### 🔧 Cambio — cuarto grupo lazy: `historial` (`actividad_reciente.js`)

Se agregó `historial: ['js/modules/actividad_reciente.js']` a `Loader.GROUPS` y se sacó su `<script src="js/modules/actividad_reciente.js" defer>` de la carga de entrada. No hizo falta copiar HTML a `index.html` (a diferencia de Plata Comprometida) — tanto `#screen-historial` como el botón `#cfg-historial-row` que dispara la carga ya eran estáticos.

**Validado con jsdom:** se evaluó `actividad_reciente.js` real contra un DOM stub (con `S`/`fmt`/`escHtml`/`hoy` simulados) simulando carga tardía — sin errores, y el contenido de `#feed-historial` cambió de "Cargando..." a un estado renderizado real (`"Aún no hay actividad registrada"` con los datos vacíos de prueba) apenas se evaluó el archivo, confirmando que el nuevo cuarto trigger no depende de que `DOMContentLoaded`/`appDataLoaded` disparen después. `node --check` sin errores. Balance de `<div>`/`</div>` en `index.html` verificado (1195/1195, sin cambios respecto a la ronda anterior).

**Sigue pendiente la prueba en navegador real** — jsdom valida la lógica de render y el timing del nuevo trigger, pero no la carga de red real ni la interacción completa (clic en Configuración → "Actividad reciente" → feed poblado, con datos reales, en una sesión nueva).

**Balance final de los 11 candidatos originales: 4 dados** (`alcancia`, `comprometida`, `config`, `historial`), **7 descartados sin refactor previo** (sin cambios respecto al balance anterior — `gastos` sigue siendo el único bloqueado por un núcleo, el resto por `inicio.js`). No queda ningún candidato inconcluso.

### 🔧 Cambio — se destraba `inicio.js`: guard `typeof` en las 6 llamadas que le faltaban

De los 6 candidatos que el cierre anterior descartó solo por culpa de `inicio.js` (`mesada`, `spotify`, `prestado`, `tarjetas_credito`, `cuentas`, `analisis`), se auditaron línea por línea las llamadas cruzadas dentro de `inicio.js` y se encontraron 6 sin guard, mezcladas con otras que ya lo tenían desde antes (`calcPatrimonioTotal`, `totalPrestadoPendiente`, `calcC`, `calcCDT`, `calcRendimientoCDTsMes`, `mesActual`, `getIngresosFijosMes` — patrón inconsistente, no ausente):

- `renderAttencion()`: `getDeudorSaldo(d)` (prestado.js) sin ningún check — a diferencia de Mesada/Spotify más abajo en la misma función, que sí tenían `if(S.modulos&&S.modulos.X)` (pero ese check cubre si el módulo está *activo en config*, no si el `.js` ya *cargó* — se agregó el guard `typeof` igual, sobre ese check existente).
- `getMesadaData(parent)` y, dentro de `calcHealthScore()`, `getMesadaData('papa'/'mama')` + `_getCuotaAnio(parent,anio)` (mesada.js).
- `tcCupoUsadoPct(tc)` (tarjetas_credito.js), dentro del `forEach` de tarjetas, sin check de ningún tipo.
- `spPersonaPagadaVigente(p)` + `spNombreDe(p)` (spotify.js/spotify-personas.js), mismo caso que Mesada: el check de módulo activo existía, el guard de función no.
- `calcDeudaTcPropia()` (tarjetas_credito.js) — dos apariciones, en `calcHealthScore()` y en `renderProyeccion()`, ninguna de las dos con guard.

Se agregó `typeof X === 'function'` a las 6, todas con el mismo criterio: si la función no existe, se comporta como si esa fuente de datos estuviera vacía (0, o directamente no se agrega el item a la lista de "Necesita atención") — no cambia nada del resultado actual, porque hoy los 6 archivos siguen cargando de entrada. `node --check` sin errores.

De paso, mismo criterio aplicado a `js/core/personas-init.js`: el `setTimeout` fijo (600ms tras `appDataLoaded`, 1000ms si el documento ya había cargado) que llamaba a `_inyectarPersonaSheets()` sin guard se reemplazó por un guard `typeof` + reintento cada 200ms (tope 25 intentos, ~5s) — mismo patrón ya usado para arreglar `Events('authgate'/'pin', ...)` en `firebase-sync.js`/`pin-bio.js` (ver `Infraestructura / seguridad` arriba). El timeout fijo era seguro *hoy* solo porque `personas.js` carga eager justo antes de este script — un dato de orden de carga, no una garantía; el guard lo vuelve robusto sin importar cuándo carguen sus dependencias.

### 🔧 Cambio — quinto grupo lazy: `mesada` (`mesada.js`)

Con `inicio.js` destrabado, se auditó `mesada.js` contra el mismo criterio que los cuatro grupos anteriores: no monkey-patchea ninguna función ajena, su wiring de botones (`btn-anio-prev`, `btn-confirmar-mesada`, los `<select>`/inputs de los tres sheets) ya corría top-level contra ids del DOM estático sin esperar `DOMContentLoaded` — mismo patrón seguro que `configuracion.js` — y **se asumió, sin volver a comprobarlo contra el archivo real, que `refresh()` ya tenía guard para `renderMesada` desde la fase 0.5** (esa asunción resultó falsa, ver corrección de esta misma fecha más abajo). `#screen-mesada` y `#mas-mesada` ya eran HTML estático, igual que Configuración/Actividad Reciente (a diferencia de Plata Comprometida). Se agregó `mesada: ['js/modules/mesada.js']` a `Loader.GROUPS` y se sacó su `<script src="js/modules/mesada.js" defer>` de la carga de entrada. `node --check` sin errores en `mesada.js` y `lazy-loader.js`.

**No verificado esta sesión:** si `analisis.js` (pantalla que muestra "Total mesada" en `#an-mesada-section`) llama alguna función de `mesada.js` sin guard — ese archivo no se recibió, queda como hallazgo abierto, no investigado.

**Sigue pendiente la prueba en navegador real** — sin `sheet-stack.js` disponible esta sesión no se pudo repetir la validación con jsdom contra el `Loader`/`showScreen()` reales que sí se hizo con los grupos anteriores. Verificar en vivo: entrar a Mesada por primera vez en una sesión nueva (confirmar que `mesada.js` no se descarga hasta ese momento), y que registrar/eliminar un pago, marcar/resolver pendiente y cambiar de año sigan funcionando igual.

### 🔴 Corrección (2026-08-02) — la Fase 0.5 no cubría `renderMesada` en el archivo real, y `load()`/`save()` nunca fueron auditadas

Al recibir `core-state.js` real por primera vez desde que se dio el grupo `mesada` como lazy, la consola mostró dos `ReferenceError` apenas arrancó la app: `_getCuotaAnio is not defined` (en `load()` y en `save()`) y `renderMesada is not defined` (en `refresh()`).

Contra el archivo real:

- **La afirmación de la entrada anterior era falsa.** Ninguna de las 12 llamadas que esta misma bitácora documenta como blindadas en "Fase 0.5" (`renderDetalleCuenta`, `renderMovsCustom`, `renderCajitas`, `renderCustomCuentasList`, `renderEncargosEnCuenta`, `renderGastosVar`, `renderGastosFijos`, `renderMesFiltros`, `renderDeudoresList`, `renderMesada`, `renderSpotify`, `renderAttencion`, `renderTCDashboard`) tiene guard `typeof` en `refresh()` — solo `_refreshCajitaDet` (agregado después, por otro motivo, en otra parte de la función) lo tiene. No se investigó si ese blindaje se revirtió en algún momento posterior o si nunca llegó a aplicarse pese a estar documentado como hecho y verificado con jsdom en su momento — queda como pregunta abierta, sin evidencia para afirmar ninguna de las dos.
- **`load()` y `save()` nunca formaron parte de ninguna auditoría de `mesada.js`** — ni el mapeo original (fase 0), ni el destrabe de `inicio.js`, ni el cierre que dio `mesada` como quinto grupo lazy revisaron estas dos funciones. Ambas llaman a `_getCuotaAnio()` directo, dos veces cada una, sin guard — con `mesada.js` lazy eso revienta en el primer `load()`/`save()` de cada sesión (el camino más común de todos: abrir la app y guardar cualquier cosa), no en un caso raro.

**Fix aplicado** (quirúrgico, mismo patrón defensivo que ya usa `_refreshCajitaDet` en la misma función): se envolvieron las 2 líneas de `load()`, las 2 de `save()` y la línea de `refresh()` en `if(typeof _getCuotaAnio==='function'){...}` / `if(typeof renderMesada==='function') renderMesada();`. Sin tocar `mesada.js` ni `Loader.GROUPS`. `node --check` sin errores en `core-state.js`.

**No se tocaron las otras 11 llamadas sin guard** de la lista de arriba — hoy no revientan porque sus módulos (`cuentas.js`, `encargos.js`, `gastos.js`, `prestado.js`, `spotify.js`, `inicio.js`, `tarjetas_credito.js`) siguen cargando eager. Pero si alguno se vuelve lazy más adelante, hace falta re-blindar `refresh()` de verdad contra el archivo real primero — no alcanza con lo documentado en la Fase 0.5, que resultó no reflejar el estado real del archivo. Queda pendiente para la próxima ronda de módulos lazy, no resuelto esta sesión.

### 🔎 Intento — `tarjetas_credito` NO se dio: hallazgo nuevo, bloqueado por `core-state.js`

Se auditó `tarjetas_credito.js` con el mismo criterio. Apareció un bug real, independiente del guard de `inicio.js` ya resuelto arriba: su wiring de botones (`btn-guardar-tc`, `btn-confirmar-compra-tc-tarjetas`, `btn-confirmar-pagar-tc`, los inputs de `tcc_*`) estaba envuelto en `document.addEventListener('DOMContentLoaded', function(){...})` — con carga lazy, ese evento ya disparó mucho antes de que el archivo llegue a descargarse, así que el listener nunca correría y los botones de las tres pantallas de TC quedarían muertos en la primera visita de cada sesión. Mismo bug, mismo fix, que ya se encontró y corrigió en `actividad_reciente.js` (grupo `historial`): se movió el wiring a top-level, contra ids que ya existen en el DOM estático — mismo patrón que ya usaba `mesada.js`. `aplicarPatchMAF()` (el patch de `mostrarAlertaFuente` para mostrar la deuda de la TC al elegirla como fuente en un gasto) no necesitó cambios: ya tenía guard de `document.readyState` desde antes.

Con ese bug corregido, apareció uno más duro que sí bloquea el cambio: `tcNormalizarTarjetas()` (definida en este archivo, ejecuta la migración/auto-sanación de tarjetas viejas) no tiene ningún caller dentro del propio `tarjetas_credito.js` — según su propio comentario ("Se ejecuta en cada `refresh()`"), quien la invoca es `refresh()` en `core-state.js`, no recibido esta sesión. El mapeo de la fase 0.5 solo blindó 12 funciones `render*` con guard `typeof`; `tcNormalizarTarjetas` no es una de ellas, así que no se puede confirmar si ya tiene guard o si `refresh()` la llama directo. Si no lo tiene, volver `tarjetas_credito` lazy rompería `refresh()` — el orquestador que corre después de cada `save()`, en las 13 pantallas — en cada boot hasta que el usuario entre a la pantalla de Tarjetas por primera vez. No se fuerza el cambio sin poder confirmarlo contra el archivo real. `tarjetas_credito.js` **sigue cargando eager**; el único cambio aplicado es el fix del wiring de botones (self-contained, sin riesgo, deja el archivo listo para cuando se pueda cerrar el hallazgo de `tcNormalizarTarjetas`). `node --check` sin errores.

Balance actualizado de los 11 candidatos originales: **5 dados** (`alcancia`, `comprometida`, `config`, `historial`, `mesada`), **1 bloqueado por su propio núcleo, hallazgo nuevo esta sesión** (`tarjetas_credito` — antes agrupado con los descartados por `inicio.js`, ahora es un caso aparte que necesita `core-state.js`), **5 sin re-auditar contra sus propios archivos tras el destrabe de `inicio.js`** (`spotify`+`spotify-personas`, `prestado`+`prestado-personas`+`deudores-personas`, `cuentas`, `analisis`, `encargos`+`encargos-personas`), **1 descartado por un núcleo distinto, sin cambios** (`gastos`+`gastos-fijos-progress`, bloqueado por `sheet-stack.js`).

### 🔧 Cambio (2026-08-02, continuación) — se recibió `core-state.js` real: se cierra la deuda de la Fase 0.5, se cierra `tarjetas_credito` del lado del núcleo, y aparece un bloqueo nuevo en `prestado`

Con `core-state.js` real en mano (primera vez desde la Corrección del mismo día), se pudieron confirmar y cerrar varios de los hallazgos que venían marcados como "no se pudo confirmar sin el archivo":

**1. `tcNormalizarTarjetas()` — la duda se resuelve a favor: ya tenía guard.** El `if(typeof tcNormalizarTarjetas==='function') tcNormalizarTarjetas();` en `refresh()` ya existía. El hallazgo del intento anterior ("hace falta `core-state.js` para cerrarlo") queda resuelto en ese punto específico — no era un bloqueo real.

**2. Pero apareció el bloqueo que realmente faltaba: `renderTCDashboard()` sin guard.** Auditando el resto de `refresh()` contra el archivo real se confirmó lo que la Corrección ya había anticipado como pregunta abierta: de las 13 llamadas `render*` de la Fase 0.5, solo `renderMesada` tenía guard (agregado en el fix de `_getCuotaAnio`, no como parte de un blindaje general). Las otras 12 — `renderDetalleCuenta`, `renderMovsCustom`, `renderCajitas`, `renderCustomCuentasList`, `renderEncargosEnCuenta`, `renderGastosVar`, `renderGastosFijos`, `renderMesFiltros`, `renderDeudoresList`, `renderSpotify`, `renderAttencion` y `renderTCDashboard` — seguían exactamente como en la Corrección: sin ningún guard. `renderTCDashboard` es justamente lo que bloqueaba `tarjetas_credito` de fondo, aparte de `tcNormalizarTarjetas`.

**Fix aplicado:** se envolvieron las 12 llamadas en `if(typeof X==='function') X();` (mismo patrón defensivo usado en toda la función). No cambia el comportamiento actual — los 7 módulos involucrados (`cuentas.js`, `encargos.js`, `gastos.js`, `prestado.js`, `spotify.js`, `inicio.js`, `tarjetas_credito.js`) siguen cargando eager, así que las condiciones siempre son verdaderas hoy. Lo que habilita es que cualquiera de esos módulos pueda volverse el sexto/séptimo grupo lazy sin romper `refresh()` — cierra formalmente la brecha que la Corrección del mismo día había dejado abierta ("queda pendiente para la próxima ronda de módulos lazy").

**3. Hallazgo nuevo, fuera de la lista de 13 de la Fase 0.5:** `calcPatrimonioTotal()` — llamada desde `save()` vía `snapshotPatrimonio()`, es decir en **cada** `save()` de la app, no solo en cada `refresh()` — invocaba `getDeudorSaldoPatrimonio(d)` (`prestado.js`) sin guard, dentro del `.reduce()` que suma la plata prestada pendiente. Mismo tipo de bloqueo exacto que `tcNormalizarTarjetas`, pero para `prestado`, y en un lugar que ninguna auditoría anterior había cubierto (la Fase 0.5 solo mapeó `refresh()`). **Fix aplicado**, mismo patrón. `node --check` sin errores en `core-state.js`.

Con estos tres fixes, `core-state.js` queda sin ninguna llamada sin guard hacia `prestado.js`, `spotify.js`, `cuentas.js`, `encargos.js`, `gastos.js`, `inicio.js` o `tarjetas_credito.js` — confirmado con `grep` sistemático de cada nombre de función usado.

### 🔎 Auditoría — `spotify.js` + `spotify-personas.js` contra sus propios archivos (cierra parte del punto 2 pendiente)

Revisados línea por línea contra el mismo criterio ya aplicado a los 13 módulos anteriores:

- **Sin `.innerHTML` sin escapar:** todo el texto libre interpolado (`spNombreDe(x)`, `h.nombre`, `h.nota`) pasa por `escHtml()`. Limpio.
- **Sin `onclick`/`onchange`/`oninput` inline:** ya migrados a `Events.attr(...)` — no queda ningún handler crudo en ninguno de los dos archivos.
- **Acoplamiento oculto real encontrado — el mismo tipo de caso que Cuentas→Encargos que motivó esta ronda de auditoría:** el flujo "pagar Spotify con tarjeta de crédito" llama a `getTCById`/`tcCupoDisponible`/`tcRecalcular` (`tarjetas_credito.js`) sin ningún guard, 3 veces — 2 en `confirmarPagarSpotify()` (validar cupo y recalcular tras el cargo) y 1 en `actualizarSpPagarPreview()` (mostrar el preview "Deuda: X → Y"). El propio header de `spotify.js` ya documentaba esta dependencia y explicaba por qué era segura *cuando `tarjetas_credito.js` cargaba siempre eager*: "no importa que se cargue más abajo en `index.html`, ya está disponible cuando el usuario interactúa". Ese razonamiento deja de sostenerse si `spotify` y `tarjetas_credito` llegan a ser grupos lazy independientes — un usuario podría entrar a Spotify sin haber visitado nunca Tarjetas, y en ese caso el módulo no estaría cargado al hacer clic en "pagar con tarjeta".
- **A diferencia de los casos de `refresh()` de arriba, acá NO se aplicó un guard silencioso.** Es una acción explícita del usuario (elegir pagar con una TC específica), no una llamada de render de fondo — envolverla en `if(typeof...)` dejaría el botón visible pero mudo, sin avisar nada. Queda como hallazgo abierto que necesita una decisión de producto (ej. `Loader.ensure('tarjetas_credito')` antes de permitir esa acción, o simplemente no separar `spotify` y `tarjetas_credito` en grupos lazy independientes).
- `spotify-personas.js` depende, también sin guard, de `getPersona`/`abrirSelPersona`/`_inyectarPersonaSheets`/`iniciales` (`personas.js`). Confirmado seguro por ahora: Personas es transversal (carga siempre eager, no es candidato a lazy — ya establecido en la nota del 2026-07-27) y el orden de `<script defer>` ya garantiza que carga antes que `spotify-personas.js`. No requiere fix.

`mesada.js` se re-auditó buscando acoplamiento saliente hacia spotify/prestado/tarjetas_credito/encargos/personas: ninguno encontrado, confirma la evaluación previa ("no monkey-patchea nada ajeno").

**Punto 3 del pedido original (¿`analisis.js` llama algo de `mesada.js` sin guard, en la sección "Total mesada"?) sigue sin poder verificarse** — `analisis.js` no se recibió esta sesión. Del lado de `mesada.js` no hay nada que dependa de `analisis.js`, así que si hay un problema está enteramente del lado de `analisis.js`, no se puede descartar ni confirmar sin ese archivo.

**Balance actualizado:** `tarjetas_credito` pasa de "bloqueado por su propio núcleo" a **bloqueado por su acoplamiento con `spotify.js`** (ya no por `core-state.js`, que queda limpio). `spotify` queda auditado y limpio salvo por ese mismo acoplamiento compartido. `prestado` gana un fix ya aplicado en `core-state.js` pero sigue sin auditar contra sus propios archivos (`prestado.js`, `prestado-personas.js`, `deudores-personas.js` no recibidos esta sesión). `cuentas`, `analisis` y `encargos` siguen sin auditar contra sus propios archivos — sin cambios en ese frente. `node --check` sin errores en `core-state.js`, `mesada.js`, `spotify.js`, `spotify-personas.js`.



### 🔴 Corrección + 🔧 Cambio (2026-08-02, tercera ronda) — se recibieron `analisis.js`, `cuentas.js`, `encargos.js`, `prestado.js`: 2 bugs vivos (no hipotéticos) y 3 acoplamientos ocultos tipo Cuentas→Encargos, todos corregidos

Con los 4 archivos que faltaban del punto 2 del pedido original en mano, se pudo auditar contra sus propios archivos y contra `mesada.js` (que ya es un grupo lazy real, no hipotético) — y aparecieron dos bugs que rompen **hoy**, no solo en un escenario futuro:

**1. `analisis.js` — confirma el punto 3 exacto del pedido original.** Las 3 llamadas a `getMesadaData()`/`_getCuotaAnio()` (ingresos estimados del mes, la sección "Total mesada" en `#an-mesada-section`, e ingresos del mes anterior para la comparación) estaban guardadas solo por `if(S.modulos&&S.modulos.mesada)` — ese chequeo confirma que el *módulo está activo en configuración*, no que el *archivo `mesada.js` ya cargó*. Como `mesada` es lazy desde hace varias sesiones, cualquiera que entrara a Análisis sin haber visitado antes Mesada en esa sesión se encontraba con `ReferenceError: getMesadaData is not defined` a mitad de `renderAnalisis()`. **Fix:** se agregó `&&typeof getMesadaData==='function'` a las 3 condiciones — si no está cargado, la sección se oculta/omite en vez de romper toda la pantalla.

**2. `cuentas.js` — el mismo bug, pero peor: sin ningún guard, ni siquiera el de config.** `getMovimientosCuenta()` (la función que arma el historial de movimientos al abrir el detalle de Nequi, Nu o Efectivo — una de las pantallas más visitadas de la app) llamaba a `getMesadaData(parent)` sin condición alguna. No dependía de si Mesada estaba activo o no: **cualquiera** que abriera el detalle de una de esas 3 cuentas sin haber visitado Mesada antes rompía. **Fix:** se envolvió el `['papa','mama'].forEach(...)` completo en `if(typeof getMesadaData==='function')`.

**3-5. Acoplamiento oculto Cuentas↔Encargos↔Préstamos, confirmado en ambas direcciones** — el caso concreto detrás de la frase "el mismo tipo de acoplamiento oculto que apareció con Cuentas→Encargos" que motivó esta ronda de auditoría:
- `cuentas.js → encargos.js`: `renderDetalleCuenta()` (nequi/nu/efectivo) y el detalle de cuenta personalizada llaman a `renderEncargosEnCuenta()` — 4 veces, ninguna con guard.
- `encargos.js → cuentas.js`: al eliminar un movimiento de un encargo, se llama a `renderDetalleCuenta()` sin guard (aparte de la llamada ya guardada que dispara `refresh()`), y `calcC()` se usa sin guard en el cálculo de interés compuesto de la porción de un encargo dentro de una cajita.
- `prestado.js → cuentas.js`: `calcC()` sin guard en el preview de impacto de un préstamo sobre una cajita con meta de ahorro.

Ninguno de estos 3 rompe hoy (`cuentas.js` y `encargos.js` cargan eager), pero son exactamente el tipo de dependencia que impediría volver lazy cualquiera de los dos módulos por separado. **Fix aplicado a los 6 puntos**, mismo patrón `typeof` en todos.

**Confirmado limpio:** ninguno de los 4 archivos nuevos toca funciones de `tarjetas_credito.js` (`prestado.js` y `encargos.js` sí leen/escriben `S.tarjetasCredito`, pero como datos — `tc.deuda = ...` — no como llamadas a función, el mismo patrón seguro que `descontarFuente`/`sumarFuente` en `core-state.js`). Ninguno toca `alcancia`, `comprometida`, `configuracion` ni `actividad_reciente`. `analisis.js` no depende de `cuentas.js`, `encargos.js` ni `prestado.js`. `node --check` sin errores en los 4 archivos.

**Balance actualizado:** de los 5 candidatos que quedaban "sin auditar contra sus propios archivos" tras el destrabe de `inicio.js`, **4 quedan cerrados esta ronda** (`cuentas`, `analisis`, `encargos`, `prestado`). Solo queda pendiente confirmar los archivos hermanos no recibidos (`prestado-personas.js`, `deudores-personas.js`, `encargos-personas.js`) — mismo patrón que `spotify-personas.js` (probablemente solo dependen de `personas.js`, transversal y siempre eager, pero sin el archivo no se puede confirmar). El único bloqueo real que le queda a `tarjetas_credito` para ser lazy-ready sigue siendo el acoplamiento con `spotify.js` documentado en la ronda anterior — es una decisión de producto (ver conversación), no algo que la auditoría de código pueda resolver sola.

### 🔎 Auditoría (2026-08-02, cuarta ronda) — `deudores-personas.js`, `encargos-personas.js`, `prestado-personas.js`: cierra el punto 2 por completo, sin fixes necesarios

Últimos 3 archivos hermanos del pedido original, auditados con el mismo criterio que `spotify-personas.js`: `.innerHTML` (limpio — templates estáticos o texto fijo, sin campos libres interpolados sin escapar), handlers inline (ninguno, ya migrados), y acoplamiento oculto hacia mesada/cuentas/encargos/spotify/tarjetas_credito (**ninguno encontrado**). Los 3 solo dependen de `personas.js` — transversal, siempre eager — y de su propio dominio. Orden de carga confirmado contra `index.html`: `personas.js` → `encargos-personas.js` → `spotify-personas.js` → `prestado-personas.js` → `deudores-personas.js`, consistente con lo que cada header declara (`deudores-personas.js` necesita cargar después de `prestado-personas.js` porque envuelve un `crearMiDeuda` ya envuelto por ese archivo — así es en el HTML real).

**No se aplicó ningún fix esta ronda.** Dos observaciones menores para dejar registradas, ninguna bloqueante:
- **Vinculación de persona duplicada en `crearMiDeuda`:** tanto `prestado-personas.js` (vincula por coincidencia de nombre) como `deudores-personas.js` (sobreescribe con el `personaId` ya seleccionado en el selector) hacen el mismo trabajo. El resultado final es correcto porque el segundo gana, pero es redundante, y con dos personas de nombre idéntico podría vincular momentáneamente a la persona equivocada antes de la corrección.
- **Posible código muerto en `addDeudor()`:** el wrap de `prestado-personas.js` está pensado para el viejo sheet con input `np_nombre`, pero `deudores-personas.js` intercepta `openSheet('nueva-persona')` y abre directo el selector de personas en su lugar — el sheet viejo podría no ser alcanzable ya desde la UI. Sin confirmar sin ver el botón que dispara `addDeudor()` en `index.html`.

**Cierra por completo el punto 2 del pedido original** ("spotify, prestado, cuentas, analisis, encargos — auditarlos contra sus propios archivos"), incluidos los 4 archivos hermanos. De toda la ronda de auditoría de lazy-loading, lo único que queda abierto es la decisión de producto sobre el acoplamiento `spotify.js`↔`tarjetas_credito.js` (ver entrada anterior) — ya no hay más código por revisar de este pedido.

### 🔧 Cambio (2026-08-02, quinta ronda) — resolver de raíz el acoplamiento spotify↔tarjetas_credito: `spotify.js` ya es lazy-safe; volver `tarjetas_credito` un grupo lazy queda bloqueado por un hallazgo nuevo

Pedido explícito: en vez de dejar el acoplamiento `spotify.js`→`tarjetas_credito.js` como una decisión de producto pendiente, resolverlo de raíz aunque sea el camino más largo — para que el próximo módulo con el mismo problema no lo vuelva a tener. Se recibió `js/core/lazy-loader.js`.

**`spotify.js` — hecho.** Se agregó `_spEnsureTC()`, un helper `async` que llama a `Loader.ensure('tarjetas')` solo si `getTCById` todavía no está definido — si `tarjetas_credito.js` sigue cargando eager (el caso de hoy), es un no-op inmediato; si algún día se vuelve lazy, espera la descarga antes de continuar. Si la descarga falla, un `toast` de error en vez de dejar el botón sin respuesta. Los 3 puntos de acoplamiento quedaron cubiertos:
- `actualizarSpPagarPreview()` — convertida a `async`, espera antes de mostrar el preview de cupo/deuda.
- `confirmarPagarSpotify()` — convertida a `async`, espera antes del branch de pago con tarjeta; si la carga falla, aborta con `return` antes de tocar cualquier estado.
- Dentro de `_borrarSpHistorial()` (ya era `async`) — al revertir un pago hecho con TC, `mov.eliminado=true` se marca siempre primero (es solo un dato, no una llamada a función), y solo `tcRecalcular()` espera la carga — así una descarga lenta o fallida nunca deja el estado a medias.

`node --check` sin errores.

**Volver `tarjetas_credito` un grupo lazy real — bloqueado, hallazgo nuevo.** Al ir a `index.html` para agregar la entrada a `Loader.GROUPS` y sacar el `<script>` eager (los dos cambios que completarían el punto 1 de la Nota `2026-08-02, continuación` de arriba), apareció un comentario ya existente en el archivo (fechado 2026-08-03) que no se había leído en detalle hasta ahora: `tarjetas_credito.js` usa `abrirDetalleMov` directo en su `Events.registerAll('tarjetas', {...})`, pero carga *antes* que `js/core/movimientos.js` (donde vive esa función) en el orden actual de `<script>` — ya tuvo que resolverse con un wrapper, mismo patrón que `leerArchivoImport` en `configuracion.js`. No se tocó el orden/momento de carga de `tarjetas_credito.js` sin ver ese wrapper: cambiarlo de carga-de-entrada a carga-bajo-demanda-mucho-más-tarde podría interactuar con esa solución de formas impredecibles sin el archivo real en mano. Tampoco se agregó la entrada a `Loader.GROUPS` de forma aislada — si `showScreen('tarjetas')` chequea `Loader.GROUPS` igual que con los otros 5 grupos, y el `<script>` eager sigue ahí, `tarjetas_credito.js` se descargaría *dos veces* al visitar esa pantalla, lo que tira `SyntaxError` si el archivo declara algo con `const`/`let` a nivel de módulo (rompería la carga completa de la pantalla, no solo un warning). Las dos mitades del cambio (agregar a `GROUPS` + sacar el `<script>`) tienen que aplicarse juntas, igual que en los otros 5 grupos — **falta `js/modules/tarjetas_credito.js` para completarlas.**

### 🔴 Corrección + 🔧 Cambio (2026-08-02, sexta ronda) — se recibió `js/core/movimientos.js`: confirma la dirección de acoplamiento que faltaba, y aparece un tercer bug vivo de mesada

`movimientos.js` es núcleo (no un módulo de dominio), pero su propio header confirma que depende de 3 módulos: `tcEliminarCompraInterna`/`tcEliminarPagoInterna` (Tarjetas de Crédito), `abrirCustomCuenta`/`renderDetalleCuenta` (Cuentas), `getEncargo` (Encargos) — "todos ya cargados antes de este archivo en index.html". Ninguna de las 5 llamadas tenía guard.

**Fixes de dos tipos, según si la llamada muta datos o solo renderiza:**

- **Lookups/renders de apoyo — guard simple:** `getEncargo` (fallback de búsqueda dentro de `abrirDetalleMov`, solo para mostrar el sheet de detalle) y `abrirCustomCuenta`/`renderDetalleCuenta` (re-render al final de `eliminarMovimiento`) — ninguna muta nada, así que un `if(typeof X==='function')` que las salte en silencio es suficiente y seguro, mismo patrón que en rondas anteriores.

- **Mutaciones financieras reales — patrón `_spEnsureTC()`:** `tcEliminarCompraInterna`/`tcEliminarPagoInterna` (rama `gasto` de `eliminarMovimiento`, al revertir una compra o pago hecho con tarjeta) y `getMesadaData` (rama `mesada`, al revertir un pago de mesada) SÍ mutan estado real — revierten deuda, revierten plata a una fuente, borran el registro original en su módulo de origen. Un guard silencioso acá dejaría el movimiento borrado del feed general pero SIN revertir su efecto — un problema de integridad de datos, no una UI a medias. Se aplicó el mismo patrón que ya se usó en `spotify.js`: `eliminarMovimiento()` (ya era `async`) espera `Loader.ensure('tarjetas')`/`Loader.ensure('mesada')` si la función todavía no existe, y si la carga falla, aborta todo con un `toast` de error y `return` — antes de tocar cualquier estado, nunca a medias.

**La rama `mesada` era un bug vivo, no hipotético — la tercera vez que aparece este bug exacto esta ronda de auditoría** (después de `analisis.js` y `cuentas.js`): como `mesada` ya es un grupo lazy real, borrar un movimiento de mesada desde el feed general de actividad sin haber visitado antes la pantalla Mesada tiraba `ReferenceError` a mitad de `eliminarMovimiento()` — sin guardar nada, sin revertir nada, con el sheet probablemente colgado.

Confirmado limpio el resto: sin `.innerHTML` sin escapar (todo pasa por `escHtml()`), sin acoplamiento hacia `spotify.js`/`prestado.js` más allá de datos planos en `S.tarjetasCredito`/`S.tcMovimientos` (mismo patrón seguro que `descontarFuente`/`sumarFuente` en `core-state.js`). `node --check` sin errores.

**Balance:** con esto, `movimientos.js` queda listo para cuando `tarjetas_credito` se vuelva lazy. Sigue faltando `js/modules/tarjetas_credito.js` en sí para completar las dos mitades pendientes: (a) confirmar que su propio wrapper de `abrirDetalleMov` (mencionado en el comentario de `index.html` fechado 2026-08-03) sigue siendo válido si cambia su momento de carga, y (b) agregar `Loader.GROUPS.tarjetas` + sacar el `<script>` eager de `index.html`, ambos cambios juntos.

### 🔧 Cambio (2026-08-02, séptima ronda) — se recibió `js/modules/tarjetas_credito.js`: sexto grupo lazy, cierra el acoplamiento spotify↔tarjetas_credito de raíz

Pedido: en vez de dejar el acoplamiento como una decisión de producto documentada, resolverlo de fondo. Con el archivo real, las dos dudas que quedaban abiertas se resolvieron:

- **El wrapper de `abrirDetalleMov`** (`Events.registerAll('tarjetas', {..., verMov: (...args) => abrirDetalleMov(...args)})`) resuelve el nombre global recién al hacer click, no al cargar — es lazy-safe sin ningún cambio, sin importar el orden de carga respecto a `js/core/movimientos.js`.
- **`tcNormalizarTarjetas()`** — la duda que el propio header del archivo dejaba abierta ("no se pudo confirmar si `core-state.js` ya tenía guard") ya estaba resuelta desde la ronda "continuación": sí lo tiene.

**Hallazgo nuevo en el archivo real:** 2 llamadas a `calcC()` (cuentas.js) sin guard, ambas en widgets de "cobertura" (¿la cajita vinculada alcanza para cubrir la deuda de la tarjeta?) — una en `renderTCDashboard()`, otra en `abrirDetalleTCSheet()`. Ninguna muta datos, así que el fix es un guard simple que oculta el widget. Cuidado especial en `abrirDetalleTCSheet()`: el `else if` original decía "la cajita fue eliminada" cuando no había cobertura — sin ajustar la condición, ese mensaje habría aparecido incorrectamente cuando la cajita sí existe pero `calcC` (cuentas.js) simplemente no cargó todavía. Se corrigió el `else if` para que solo dispare cuando la cajita de verdad no existe (`tc.cajitaId && !cajitaVinc`).

**Cambios aplicados:**
1. `js/core/lazy-loader.js` — `tarjetas: ['js/modules/tarjetas_credito.js']`, sexto grupo en `Loader.GROUPS`.
2. `index.html` — sacado el `<script src="js/modules/tarjetas_credito.js" defer>` eager, mismo patrón de comentario placeholder que los otros 5 grupos. `#screen-tarjetas`/`#mas-tarjetas` ya eran estáticos, sin cambios ahí.
3. `tarjetas_credito.js` — los 2 guards de `calcC()`, más el comentario de cabecera actualizado.

**Efecto secundario aceptado, no corregido:** el parche a `window.mostrarAlertaFuente` (hint "se carga a la TC" al elegir tarjeta como fuente en Gastos/Encargos/Préstamos) no aplica hasta la primera visita a Tarjetas de Crédito en la sesión — antes de eso, el selector de fuente simplemente no muestra ese hint extra, sin romper nada. No se intentó arreglar: requeriría que 3 pantallas más disparen `Loader.ensure('tarjetas')` al abrir su selector de fuente, demasiado invasivo para una mejora cosmética.

`node --check` sin errores en `tarjetas_credito.js` y `lazy-loader.js`. Sigue pendiente la prueba en navegador real (mismo pendiente que ya existía desde el grupo `mesada` — jsdom no disponible esta sesión).

**Balance:** el acoplamiento spotify↔tarjetas_credito queda resuelto de raíz. De los 6 grupos lazy que existen ahora, este es el primero que nació de un bug de acoplamiento ya encontrado (no de "cuál pantalla conviene lazy-cargar próximo") — el patrón (`_xxxEnsureModulo()` + `Loader.ensure()` + abortar con `toast` si la llamada muta datos reales, guard simple si solo renderiza) queda como referencia para la próxima vez que aparezca un caso similar.

### 🔧 Cambio (2026-08-02, octava ronda) — fusión de `spotify.js` + `spotify-personas.js` en un solo archivo

Pedido explícito: unificar en un solo archivo como ya es `tarjetas_credito.js`, que nunca se dividió.

**La causa por la que estaban partidos era real, verificada contra el archivo:** `encargos.js` (línea ~1999) tenía `btn_guardar_edit_sp.addEventListener('click', guardarEditarSpotify)` — una referencia directa (no diferida) a una función de `spotify.js`, que exige que ya exista en el momento exacto en que `encargos.js` se ejecuta. Por eso `spotify.js` tenía que cargar antes que `encargos.js`, mientras que `spotify-personas.js` necesitaba cargar después de `personas.js` — dos requisitos de orden incompatibles en un solo archivo. (El comentario original de `spotify.js` también mencionaba a `mesada.js` como otra fuente del mismo problema — no se confirmó: `mesada.js` no tiene ninguna referencia a `addSpotify`/`guardarEditarSpotify`. Podría ser una referencia desactualizada, o estar en `inicio.js`, no recibido esta sesión.)

**Fix de raíz:** dos líneas arriba, en el mismo `encargos.js`, `crearEncargo` ya tenía este problema resuelto con una referencia diferida — `() => crearEncargo()` en vez de la función directa, con un comentario explicando que así "cada clic lee el valor ACTUAL de la variable global". Se aplicó exactamente el mismo patrón a la línea de Spotify: `() => guardarEditarSpotify()`. Con eso, la función ya no necesita existir al momento en que `encargos.js` se ejecuta, solo para cuando el usuario haga click — momento en el que todos los `<script defer>` de la app ya cargaron, sin importar el orden entre ellos.

**Con la dependencia real resuelta, se fusionaron los archivos:** el contenido de `spotify-personas.js` se movió al final de `spotify.js`, bajo su propia sección. Los 2 `Events.registerAll('spotify', {...})` se dejaron como llamadas separadas (no se fusionaron en un solo objeto) para no arriesgar ningún cambio de comportamiento más allá de la fusión en sí — es exactamente el mismo comportamiento que hoy, solo que en un archivo en vez de dos. El `spotify.js` resultante se movió a la posición donde antes vivía `spotify-personas.js` (después de `personas.js` y `encargos-personas.js`), no a su posición vieja — es la mitad más exigente de las dos dependencias.

**Archivos tocados:**
1. `encargos.js` — referencia diferida para `guardarEditarSpotify`.
2. `spotify.js` — fusión completa; header reescrito; comentarios de registro de eventos actualizados.
3. `index.html` — sacado el `<script>` viejo de `spotify.js` (posición temprana); el de `spotify-personas.js` (posición tardía) ahora apunta al archivo fusionado; comentario del bloque de Personas actualizado.
4. **`spotify-personas.js` queda obsoleto — hay que borrarlo del repo**, nada lo referencia más.

`node --check` sin errores en `encargos.js` y `spotify.js`. No se tocó `mesada.js` ni ningún otro archivo. Pendiente: no se pudo descartar al 100% una referencia inmediata similar en `inicio.js` (no recibido) — si aparece un `ReferenceError` de `guardarEditarSpotify`/`addSpotify` al cargar, revisar ese archivo primero.

### 🔎 Cierre (2026-08-02, novena ronda) — se recibió `inicio.js`: confirma que la fusión de `spotify.js` + `spotify-personas.js` no tenía ningún cabo suelto

Única duda que quedaba abierta de la ronda anterior. `inicio.js` no tiene ninguna referencia — ni directa ni indirecta — a `addSpotify` ni a `guardarEditarSpotify`. Las 2 funciones de Spotify que sí usa (`spPersonaPagadaVigente`, `spNombreDe`, para el widget de alertas vencidas del dashboard) ya estaban guardadas con `typeof` desde la sesión anterior, mismo patrón que el resto de llamadas de este archivo hacia mesada/tarjetas_credito/prestado/cuentas — todas también confirmadas con guard contra el archivo real. Sin fixes necesarios. La fusión de `spotify.js` + `spotify-personas.js` queda 100% validada, sin ninguna duda pendiente.
