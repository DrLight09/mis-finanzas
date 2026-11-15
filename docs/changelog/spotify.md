# Historial: Spotify

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Spotify

### 🐛 Corregido (2026-10-24) — «Pagar Spotify» se abría sin costo del plan y el aviso no era coherente con eso (`spotify.js`, `styles.css`)

*(Mejora 2.)* Sin costo no hay cuota ni ganancia que calcular, pero el botón abría el sheet igual y el aviso solo advertía que «los cálculos no son precisos».
- **Una sola condición:** `spCostoValido()` es verdadera solo si `S.spotify.costo` es un número finito mayor que 0 (el campo guarda `parseMoney(...) || 0`, así que vacío, 0 o texto llegan como 0). La usan el bloqueo y el aviso.
- **Bloqueo:** `abrirPagarSpotify()` (nueva, la que escucha el botón) avisa («Configura el costo del plan para registrar pagos») y lleva el foco a `#spotifyCosto` en vez de abrir el sheet.
- **Aviso:** ahora dice «Configura el costo del plan para empezar a registrar pagos.» con el botón «Configurar costo», y desaparece cuando el costo es válido. Se armaba con `style.cssText` (estilo inline): pasó a la clase `.sp-costo-aviso` en `styles.css`.
- **Decisión de diseño:** la validación va en el abridor y no en `openSheet()`. `openSheet()` ejecuta los efectos del sheet y siempre lo abre; no hay un mecanismo de validación previa que reutilizar (el resto de los sheets valida en su propio abridor, p. ej. `abrirTransferir` o `abrirTraspasoEncargo`), y el botón es el único camino a este sheet.
- **Pruebas:** `tests/nucleo.test.js` → `requisitos-y-filtros-de-sheets` (costo 0, NaN, vacío, texto y negativo no abren; 30.500 sí; el aviso aparece con el texto nuevo, sin `style`, y se quita con un costo válido). **Fallan sin el arreglo.**

### ✨ Nuevo (2026-10-06) — "Te dio un extra": pagar de más ya no se rechaza, se registra aparte

**Pedido:** a veces el período cuesta $5.100 y te dan $5.500. Antes, `confirmarSpDestino()` rechazaba cualquier monto mayor a lo esperado ("aumentá los períodos si pagó de más"), así que ese extra no tenía dónde vivir.

**Qué hace ahora:** si "¿Cuánto te dio?" supera períodos × cuota, el sheet muestra un bloque azul "Te dio un extra de +$400" con su propio selector "¿A dónde fue el extra?" (misma cuenta del cobro, otra cuenta o "Sin especificar"; en modo dividido hay que elegir una, no existe "la misma"). El cobro de Spotify guarda **solo la cuota** (`monto = períodos × cuota`), así que "Recaudado", "Total cobrado", ganancia y promedio por ciclo **no se inflan**. El extra va aparte:
- Se suma a la cuenta elegida (`sumarFuente`) y deja un movimiento espejo en su historial vía `registrarMovEspejo()` (`_esExtraIngreso: true`, `_secundario`, `_origenSeccion: 'Spotify'`) — cuenta como **ingreso real independiente** en Análisis, Salud financiera y Wrapped, y no se puede borrar desde la cuenta.
- Queda en el registro del cobro: `extra`, `extraFuente`, `extraMovId`. Si hubo "pago atrasado" (dos registros), cuelga del último, porque el extra no pertenece a ningún período.
- Borrar el cobro revierte el extra (`descontarFuente` exacto + `borrarMovEspejo`); el diálogo de borrado lo menciona.
- El historial de Spotify muestra una línea "+ $400 extra · Nequi · aparte del cobro de Spotify" y las estadísticas una tarjeta "Extras recibidos" (solo aparece si alguna vez hubo uno).
- Validado todo antes de tocar saldos (el destino del extra es obligatorio), para no repetir el bug de "aplicado a medias" de Prestado (2026-10-02).

**Límites conocidos:** con destino "Sin especificar" el extra queda anotado en el cobro pero no entra a ninguna cuenta ni cuenta como ingreso (no hay plata que mover). Un extra guardado en una cajita aparece en el historial de la cajita pero, como cualquier espejo de cajita, no entra a `entradasIngresoReal()` (comportamiento previo del núcleo).

### ✨ Cambio (2026-10-06) — Estadísticas: "En mano" y "Beneficio total" lado a lado

Antes la app mostraba una sola lectura: `cobrado − pagado + tu parte`. Ahora muestra las dos, porque responden preguntas distintas:
- **En mano** = `cobrado − pagado`: plata nueva y libre para gastar hoy.
- **Beneficio total** = `cobrado − pagado + tu parte`: lo anterior más el mes de Spotify que te salió gratis (el dinero que no tuviste que sacar de tu bolsillo).

"Promedio real por ciclo pagado" muestra ambos promedios en dos columnas; "Ganancia acumulada" mantiene el beneficio total como cifra grande y agrega la línea "en mano: …". Si el costo del plan no está configurado (no hay cuota del admin), las dos serían idénticas y se muestra una sola.

**Último / mejor / peor sin repetir:** con 1 ciclo dice "único ciclo pagado todavía"; si todos los ciclos dieron lo mismo, "todos los ciclos: +$20.483 · sin variación"; en cuanto hay diferencia vuelve el detalle "último · mejor · peor". De paso se corrigió que "mejor:" siempre llevaba un `+` fijo aunque el valor fuera negativo.

**Verificación:** `node --check spotify.js` limpio y 18 comprobaciones en jsdom (extra a la misma cuenta, a otra, con split, sin destino → bloquea sin escribir, borrar revierte saldos y espejo, cuota exacta y pago de menos sin bloque extra, y los tres formatos del pie de ciclos). **No probado en navegador real.**

### 🔧 Cambio (2026-09-20) — Limpieza de documentación y comentarios obsoletos de Spotify

- **`spotify.js` (solo comentarios, sin cambios de código):** se quitaron las referencias a `spotify-personas.js` (archivo que ya no existe) y el bloque "ORDEN DE CARGA" del encabezado (el módulo carga lazy, ya no tiene `<script>` propio). Las 5 referencias a una sección de `auditoria-tecnica.md` sobre atribución de ciclo que nunca existió ahora apuntan a `spotify.md` §7ter.
- **`spotify.md`:** el modelo de datos ahora incluye todos los campos reales (`splits`, `_pagoIdCierre`, `_periodoOffset`, `_pendienteAlCerrar`, `_tcMovId`); los flujos de cobro y de pago a Spotify reflejan fecha editable, split y tarjeta de crédito; nueva §7ter (fecha real, deuda al cerrar y pago atrasado, que antes solo estaba explicado en comentarios del código); se corrigió la fórmula de "Pendiente por cobrar" y las rutas de `spNombreDe`/`spPersonaPagadaVigente` (viven en `js/core/calc-helpers.js`). Se quitó la historia que ya vive en este CHANGELOG (división original en dos archivos, versión original con un registro por período).
- **`mis-finanzas.md`:** se quitaron las filas de archivos ya retirados (`nav.js`, `import-validado.js`) y las notas de fusión; se agregó `wrapped-gate.js` y `css/fa-subset.css`, que estaban en `index.html` y no en el documento; se restauró el encabezado "Principios que se repiten en toda la app", que se había perdido; se reemplazó la duda sobre lógica inline suelta por lo verificado (`index.html` no tiene ningún bloque `<script>` inline).

### ✅ Corregido (2026-09-20) — Un cobro de varios períodos inflaba "Recaudado este ciclo" con períodos que todavía no pertenecen a ese ciclo

Reportado con un caso real: Esteban debía su período el 21-sep y el 20-sep pagó 2 períodos ($10.200). "Recaudado este ciclo" subió a $15.300 (50 %) cuando debió ser $10.200: los $5.100 de AM: Esteban ya recaudados más $5.100 del período que Esteban paga hoy. El segundo período de Esteban (empieza el 21-oct) no es de este ciclo.

**Causa raíz:** un cobro de N períodos es un solo registro (`periodos: N`) y `spCicloCobrosActual()` sumaba su monto completo si estaba después del último pago a Spotify. Ciclo (entre dos pagos a Spotify) y período (30 días de cada integrante) son calendarios distintos y el registro no distinguía a cuál pertenecía cada período. El efecto era peor con el tiempo: si Spotify se pagaba antes del 21-oct, esos $5.100 quedaban contados en el ciclo que se cerró, y "Promedio real por ciclo" y "Ganancia acumulada" arrastraban la distorsión.

**Fix (`spotify.js`):** los períodos se atribuyen a ciclos por fecha de inicio (`proximoPagoAntes + 30·k`), sin guardar nada nuevo en `S`. El primero cuenta en el ciclo donde entró el cobro; los siguientes, en el ciclo abierto el día que empiezan. Mientras no llegue esa fecha y no se pague Spotify quedan flotantes: no suman a "Recaudado", "Balance del ciclo" ni "Ganancia acumulada", y la pantalla los muestra aparte como adelantado. Ver `spotify.md` §7bis.
- Nuevas: `spTramosDeCobro`, `spAsignarPeriodos`, `spResumenCicloActual`, `spMontoAntesDe`; `spPeriodosVencidos` recibe un parámetro `estricto`.
- `renderSpotify()` usa `spResumenCicloActual()`; `renderSpStats()` arma el cobrado de cada ciclo con `spAsignarPeriodos()` (mismo resultado que antes cuando no hay períodos prepagados).
- `confirmarSpDestino()`: el registro "resto" que sigue a un "Pago atrasado del ciclo anterior" guarda `_periodoOffset` (períodos que ya cubrió el registro de cierre), para no repartir su monto entre períodos que no le corresponden.

**Cambio de comportamiento — desempate del mismo día:** cuando un cobro registrado el mismo día que se paga Spotify pertenecía a alguien que ya tenía cubierta 1 cuota en el ciclo que se cierra, `confirmarPagarSpotify()` lo mandaba al ciclo nuevo. Ahora manda al nuevo solo si ya tenía 2 o más (`SP_EMPATE_PERIODOS`), igual que para períodos prepagados. Para volver al comportamiento anterior basta poner la constante en 1. Con 2 o más períodos ya cubiertos, el período que empieza justo el día del pago tampoco se registra como deuda del ciclo que cierra (`_pendienteAlCerrar`).

**Validación:** `node --check`; arnés Node que carga el `spotify.js` real con los datos del backup del 2026-09-20 y llama a `confirmarSpDestino()` y `confirmarPagarSpotify()` de verdad (no jsdom ni navegador). Reproduce el bug con el código anterior ($15.300 / 50 %) y con el nuevo da $10.200 / 33 % + $5.100 adelantado. También cubre: llega el 21-oct sin pagar Spotify ($15.300), se paga Spotify antes (el período pasa al ciclo nuevo y borrar ese pago lo devuelve), empate con 1 período (ciclo que cierra) y con 2 (ciclo nuevo), deuda del ciclo viejo + prepago, y regresión: con el backup tal cual, pantalla y estadísticas son idénticas a las del código anterior.

**Sin verificar:** otros archivos que puedan leer `S.spotifyHistorial` para calcular ciclos por su cuenta (p. ej. el "Wrapped" de ahorro entre ciclos, `cuentas.js`) no estaban entre los archivos subidos.

### 🔧 Cambio (2026-09-20) — `spNombreDe()` y `spPersonaPagadaVigente()` se movieron a `js/core/calc-helpers.js`

Mismo motivo que `getDeudorSaldo()` (avisos "Cobro Spotify de X vencido" de "Necesita atención" en el primer render). Siguen siendo globales; `spotify.js` ya no las define. Detalle en `changelog/inicio.md`.

### ✨ Agregado (2026-09-20) — "Pagar Spotify" solo ofrece cuentas con saldo ≥ $50 y TC con cupo

`openSheet_pagarSpotify()` filtra `spPagarFuente` con `FuentesFiltro.PRESET.SPOTIFY` (cuenta con saldo ≥ $50,00; TC con cupo ≥ $50,00). "Sin especificar" se mantiene. Si la cajita de Spotify no llega al mínimo, ya no se preselecciona. El split de **pago** (`spp`) pasó a usar `_spPagarSplitFuentesOpts()`, aparte de `_spSplitFuentesOpts()` **a propósito**: esa la comparte el split de **cobro** (`spc`), donde la plata entra y una cuenta vacía es un destino válido — filtrarla por saldo habría roto el cobro.


### ✅ Corregido — Los abonos de "lo pendiente" quedaban invisibles en toda la app

Reportado por el usuario con un caso real: un integrante dio $3.500 de su cuota, quedó debiendo $1.500, y tres días después dio esos $1.500 — pero a una cuenta distinta a la del cobro original. Esa plata sí subía el saldo real (`sumarFuente`), pero no había forma de verla en ningún lado: ni en el historial de Spotify, ni en el historial de ninguna cuenta.

**Causa raíz:** `confirmarSpResolverPendiente()` (spotify.js) guardaba cada abono dentro de `h.pendienteHistorial`, un array anidado *dentro* del cobro original, y sumaba su monto a `h.monto`. Pero:
1. `renderSpHistorial()` (spotify.js) nunca recorría `pendienteHistorial` — solo pintaba una tarjeta por cobro, con el `monto` ya inflado con todos los abonos fundidos adentro.
2. `getMovimientosCuenta()` / `_getMovimientosCuentaCustom()` (cuentas.js) — que sintetizan el historial de cada cuenta leyendo `S.spotifyHistorial` directamente, porque Spotify nunca generó un movimiento espejo real en `S.movimientos` como sí hace Mesada (`_registrarMovSecundarioMesada`) — solo miraban `h.fuente` y `h.monto` del cobro original. Un abono a una cuenta *distinta* a la del cobro no aparecía en ninguna cuenta; uno a la misma cuenta tampoco se veía por separado (mismo bloque, mismo monto ya fundido).

**Fix (3 archivos):**
- `spotify.js`: cada abono de `pendienteHistorial` ahora nace con `id` propio (`uid()`) y con `_secundario:true, _origenSeccion:'Spotify'` — mismos campos que cualquier otro registro de `spotifyHistorial`. `renderSpHistorial()` ahora pinta cada abono como su propia línea dentro de la tarjeta del cobro (monto, fecha, cuenta destino, nota).
- `cuentas.js`: los dos bloques que sintetizan el historial de Spotify (`getMovimientosCuenta()` y `_getMovimientosCuentaCustom()`) ahora recorren también `h.pendienteHistorial`, generando una tarjeta propia por cada abono en la cuenta que realmente le corresponde (`ab.destino`, no `h.fuente`). La tarjeta del cobro original resta el total de abonos ya recibidos (`h.monto − Σ pendienteHistorial`) para no contar la misma plata dos veces entre la tarjeta del cobro y la tarjeta del abono.
- `movimientos.js`: la búsqueda de `movObj` en `eliminarMovimiento()` (la que decide si un movimiento está protegido contra borrado directo) ahora también busca dentro de `pendienteHistorial` de cada registro de `spotifyHistorial`. Sin esto, borrar la tarjeta sintética de un abono desde una cuenta caía en la rama genérica de "ingreso" y descontaba el saldo directo sin tocar `h.pendienteHistorial`/`h.monto` — dejando el saldo de la cuenta y el historial de Spotify desincronizados. Con el fix, se bloquea igual que el cobro original y redirige a Spotify.

Validado con una simulación aritmética (no jsdom, por la cantidad de dependencias del DOM en `cuentas.js`) que reproduce el escenario reportado: cobro parcial de $3.500 a Nequi, abono de $1.500 tres días después a Efectivo. Confirmado que Nequi muestra $3.500 (neto de abonos), Efectivo muestra $1.500 con su propia fecha, la suma de ambas cuentas da los $5.000 reales sin duplicar, y que intentar borrar la tarjeta del abono desde Efectivo queda bloqueado y redirige a Spotify igual que el cobro original. **Sin verificar en navegador real.**

**Encontrado de paso, no arreglado en esta pasada:** ninguno de los dos bloques de `cuentas.js` lee `h.splits` — si un cobro se divide entre varias cuentas (motor de split, ver `spcSplitMode` en spotify.js), esa plata no aparece en el historial de **ninguna** cuenta, aunque sí se mueve el saldo real. Mismo síntoma de fondo (el bloque solo conoce la "foto" original del cobro por `h.fuente`), pendiente de una pasada aparte.

### ✅ Agregado — Deshacer un abono puntual de lo pendiente sin borrar el cobro completo

Consecuencia directa del fix de visibilidad de arriba: una vez que cada abono se ve como su propio movimiento, hacía falta poder deshacer uno puntual sin tener que borrar el cobro entero (que revertiría también el monto original y cualquier otro abono). Se agregó `deshacerAbonoPendienteSp(i, abIdx)` en `spotify.js`, con un botón "deshacer" en cada línea de abono del historial de Spotify — equivalente exacto a `deshacerPendienteMesada()` de Mesada, pero para Spotify. Revierte la plata de la cuenta a la que fue ese abono específico, devuelve ese monto de `h.monto` a `h.pendiente`, y lo quita de `pendienteHistorial` — el resto del cobro (monto original, otros abonos) queda intacto. Validado con simulación aritmética directa (mismo criterio que el fix de arriba, sin jsdom).

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

### 2026-08-15

- Corregido: al agregar un integrante nuevo vinculado a una persona (selector "¿Quién es?"), el avatar quedaba sin colorear (iniciales crudas de 2 letras, sin fondo/borde) hasta que otra acción en cualquier parte de la app disparara un refresco de pantalla. El dato (`personaId`) siempre quedó bien guardado — era solo la pantalla la que no se actualizaba. Causa: el hook que asigna `personaId` al integrante recién creado corre *después* de que la función de agregar ya guardó y renderizó, y nunca volvía a renderizar tras asignar el vínculo — a diferencia del hook de "Editar", que sí lo hacía. Encontrado en prueba de navegador real tras fusionar `spotify-personas.js` dentro de `spotify.js`; confirmado que el bug es preexistente a esa fusión, no causado por ella.

### 2026-08-20

- Corregido: en la hoja "Pagar Spotify", cuando la fuente de pago seleccionada es la propia Cajita Spotify (la preselección por defecto si existe), el mismo saldo y el mismo faltante aparecían repetidos hasta tres veces: en el aviso estático de arriba ("Cajita Spotify: $X — faltan $Y"), en "Saldo disponible: $X" y en el cálculo "$X − $monto = $resultado". El aviso de arriba se calculaba una sola vez al abrir la hoja (contra `spotifyCosto`, no contra el monto realmente tecleado), mientras que los otros dos son reactivos — coincidían en el número solo porque el monto viene prellenado con el costo. Fix inicial: se hizo el aviso reactivo y se ocultaba solo cuando la fuente elegida era la cajita. A pedido, se simplificó más: se **eliminó por completo** el aviso "Cajita Spotify: ... faltan ..." (el `<div id="spPagarSaldoInfo">` del HTML y el cálculo asociado en `spotify.js`) — la info de saldo y faltante queda solo en "Saldo disponible" + el cálculo, sin ningún texto redundante.

### 2026-08-20 (2)

- Corregido otro caso de repetición en la misma hoja "Pagar Spotify": con un monto ya tecleado, "Saldo disponible: $X" (arriba) y "$X − $monto = $resultado" (abajo) mostraban el mismo saldo dos veces, ya que el cálculo incluye el saldo como primer término. Ahora "Saldo disponible: $X" solo se muestra mientras el campo de monto está vacío (antes de que haya cálculo que mostrar); en cuanto hay un monto tecleado, se oculta y queda solo el cálculo.

### 2026-08-22

- ✨ Agregado: pago parcial con deuda pendiente al registrar un cobro a un integrante — mismo concepto que ya existía en Mesada (ver `changelog/mesada.md`), llevado a Spotify. Antes, el sheet "Registrar cobro" solo dejaba elegir cuántos períodos pagó (1-6) y calculaba el monto como un múltiplo exacto de la cuota; no había forma de registrar que alguien pagó su período pero dio menos de lo que debía. Ahora:
  - El monto a cobrar es editable (`spMontoRecibido`), prellenado con períodos × cuota pero se puede reducir.
  - Si el monto editado queda por debajo de lo esperado, aparece el toggle "Te está debiendo la diferencia" (igual al de Mesada). Sin marcarlo, un monto menor se guarda tal cual, sin deuda. Marcándolo, la diferencia queda registrada como `pendiente` en ese registro puntual de `spotifyHistorial`, junto con `cuotaEsperada` (snapshot de lo esperado) y `pendienteHistorial` (abonos futuros).
  - El período de todas formas avanza (`proximoPago` se mueve igual que con un cobro completo) — lo que queda pendiente es la plata, nunca el período; esto es intencional, ya que la persona sí pagó dentro de su período, solo que de menos.
  - Nuevo sheet "Registrar pago de lo pendiente" (`sp-hist-pend`), análogo al de Mesada, para saldar esa deuda después con su propio monto/fecha/destino/nota — cada abono puede ir a una cuenta distinta.
  - El historial de Spotify ahora muestra un badge "Debe $X" con acceso directo a resolverlo, y "✓ Saldó lo pendiente" una vez saldado.
  - Al eliminar un cobro que tuvo abonos de pendiente ya recibidos, cada abono se revierte de su propia cuenta por separado (no todo de la cuenta del cobro original) — mismo criterio que `_borrarMesadaPago()`. El diálogo de confirmación avisa explícitamente cuando el registro a borrar tiene una deuda abierta, para que quede claro que también se cancela.
  - Alcance: esta protección es independiente del mecanismo ya existente de `_pendienteAlCerrar` (integrantes que no pagaron nada antes de que se cerrara un ciclo) — son dos formas distintas de deuda y no se tocó esa lógica. Tampoco se le aplicó la protección por antigüedad de movimientos a los abonos de pendiente (`deshacerPendienteMesada` en Mesada tampoco la tiene); tiene solo el diálogo de confirmación genérico.

### ✅ Corregido — 3 sitios de `.innerHTML` sin escapar (nombre en fila, nombre en `title`, `toast()`)

*(2026-07-16, durante la migración a `data-action`, primer módulo migrado, antes de `html\`\``)*

Al migrar Spotify como primer módulo completo se creó el sistema reusable de eventos (`js/core/events.js`) y se corrigieron 3 casos de `.innerHTML` sin escapar. Un cuarto sitio (badge de "último destino" en `renderSpotify()`, vía `fuenteLabel()`) se escapó a estos tres, corregido después, el 2026-08-18 — ver `changelog/infraestructura-seguridad.md`.

### ✅ Corregido — Migrado a `html\`\``: 4 sitios de `.innerHTML`, más un quinto de `fuenteLabel()` sin escapar en el historial

*(sesión posterior, primero de los nueve módulos que quedaban)*

Migrados los 4 sitios de `.innerHTML` autocontenidos (asignación directa, sin pasar por ningún motor compartido): el render de la lista de personas en `renderSpotify()`, el historial en `renderSpHistorial()`, y los tres selectores de fuentes (`spDestinoSelect`, `spResDestino`, `spPagarFuente`).

**Se dejó sin tocar, a propósito, `_spSplitFuentesOpts()`** (usada por `crearSplitWidget`, motor compartido con Encargos y "Yo debo", en `split.js`, no recibido en esa sesión): ya escapa correctamente con `escHtml()`, y convertir su valor de retorno sin ver cómo lo consume el motor compartido es un riesgo que no vale la pena correr sin necesidad real. Los `toast()` (8 sitios) y un `textContent` se dejaron igual, mismo criterio ya establecido con Mesada/Análisis/Inicio.

**Hallazgo real de paso, decimosexta recurrencia del patrón "texto libre envuelto en función auxiliar":** `renderSpHistorial()` interpolaba `fuenteLabel()` (nombre de cajita/cuenta, texto libre) sin escapar tanto en el desglose de splits como en la fuente simple — sitio que el fix del badge de "último destino" (08-18) no cubría, por ser una función distinta. Corregido de raíz al migrar: ahora se arma como un string plano (`fuentesInfo`) y se interpola como una sola unidad, así `html\`\`` lo escapa completo sin tocar los separadores fijos (`' · '`, `' + '`).

Validado con `node --check` y una simulación con payloads maliciosos (`<img onerror>`, `<script>` cerrando atributos/tags) en nombre, nota y `fuenteLabel()` de los 3 bloques migrados: todo queda visible como texto escapado, sin ejecutar nada, con `data-action`/clases fijas/`var(--...)` intactos vía `raw()`. **Sin verificar en navegador real.**

---
