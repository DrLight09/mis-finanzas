# Historial: Prestado

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Prestado

### 🔧 Limpieza (2026-10-04) — referencias obsoletas tras la reestructuración

Un comentario de `prestado.js` apuntaba a `_onSelPersonaNuevaDeuda` (ya no existe; ahora es `_onSelPersonaYoDebo`), `prestado.md` mencionaba `nd_destino` (el sheet "Nueva deuda" ya no existe) y no decía que un pago de "Yo debo" sí ofrece tarjetas con cupo. Se corrigieron. El documento del proyecto (`mis-finanzas.md`) ahora lista `cuenta-efectos.js` entre los archivos de `js/core/` y describe `Deudas` en la fila de `calc-helpers.js`. Sin cambios de comportamiento.

### ✨ Agregado (2026-10-03) — Perdonar una parte de la deuda (Me deben y Yo debo)

**Qué cambió:** "¿Se lo regalas?" ya no obliga a perdonar todo lo que falta. En "Registrar abono" el toggle está disponible y el monto es libre (hasta lo que debe); en "Pagar préstamo completo" sigue siendo todo lo que falta. Lo perdonado cuenta como **gasto real** (patrimonio − lo perdonado) y la deuda baja solo esa parte. Una parte se guarda como `'abono'` con `_perdon: true`; si es todo lo que faltaba, como `'pago-completo'` con `_perdon: true` (se decide por el saldo al aplicar, y también cuando el abono iguala el saldo y se promueve solo a pago completo). El gasto se describe "Perdoné parte de la deuda — X" o "Perdoné deuda — X", y el aviso final dice cuánto todavía debe la persona.

**"Yo debo", igual:** que te perdonen una parte o todo. Lo perdonado es **ingreso** (con `_prestadoDirectamente`, para que Inicio lo cuente) y el monto sugerido es todo lo que falta, pero se puede bajar sin que el toggle pise lo ya escrito.

**Validación nueva:** no se puede perdonar más de lo que la persona debe (ni cuando no hay saldo): el monto perdonado se compara con el saldo con `Deudas.TOL_FINO` ($0,50). Antes no hacía falta porque el monto estaba fijo.

**Sin cambios para lo existente:** los perdones ya registrados (siempre `'pago-completo'` + `_perdon`) se leen, se muestran y se eliminan igual; todos los totales que filtran por `_perdon` (detalle, Personas, Wrapped) siguen igual.

**Verificación (jsdom, `index.html` real, y tests nuevos en `tests/medeben.test.js` y `tests/yodebo.test.js`):** perdonar 30.000 de 100.000 (debe 70.000, gasto 30.000, patrimonio −30.000, ninguna cuenta se mueve), perdonar lo que queda (pago completo), eliminar el perdón parcial (devuelve su parte y solo borra su gasto), perdonar todo desde "Registrar abono", perdonar de más (error sin escribir nada), y lo mismo en "Yo debo" con ingreso.

### 🐛 Corregido (2026-10-03) — "Yo debo": la lista no se actualizaba al eliminar o cambiar una persona; pestañas sin depender del CSS

**Causa (lista desactualizada):** `refresh()` (`core-state.js`) solo volvía a pintar la lista de "Me deben" cuando Préstamos estaba activa; la de "Yo debo" solo se pintaba al entrar a la pantalla o al cambiar de pestaña. Al eliminar a una persona de "Yo debo", la app volvía a la lista, pero la lista seguía mostrando a la persona hasta cambiar de pantalla. Lo mismo pasaba con cualquier cambio de saldo: registrar un movimiento y volver mostraba el saldo anterior. **Arreglo:** `refresh()` pinta las dos listas cuando Préstamos está activa (las dos viven en el DOM aunque una esté oculta), y `volverMisDeudas()` / `volverDeudores()` también pintan su lista al volver. Eliminar a alguien de "Yo debo" ahora muestra el aviso "X eliminado", igual que en "Me deben". Reproducido antes del arreglo con el `index.html` real.

**Pestañas Me deben / Yo debo:** se había pasado el color de la pestaña activa a una clase CSS (`.btn-tab-activa`). El Service Worker sirve el CSS desde caché y puede tardar una carga en actualizarse, y mientras tanto la pestaña activa dejaba de verse verde. Se volvió a pintar en línea (`_pintarTabPrestamos`, una sola función para las dos pestañas), que no depende de ningún archivo aparte. La regla `.btn.btn-tab-activa` ya no existe en `styles.css`.

**Verificación (jsdom, `index.html` real):** al eliminar a una persona de "Yo debo" y de "Me deben" la lista deja de mostrarla; después de registrar un movimiento y volver, la lista muestra el saldo nuevo; las pestañas activa e inactiva con el color correcto.

### 🐛 Corregido (2026-10-03) — "Yo debo": el perdón no sumaba al ingreso del mes, y los movimientos sin cuenta no salían en Actividad reciente

**Causa 1 (ingreso del mes):** el perdón de una deuda propia crea una entrada sin cuenta (`fuente: ''`). Inicio (`ingresosMes` en `inicio.js`) solo suma las entradas con cuenta (Nequi, Efectivo, cajita, cuenta personalizada) o con la bandera `_prestadoDirectamente`. El perdón subía el patrimonio pero no el ingreso del mes, y por lo tanto tampoco entraba en los ratios de salud financiera. Mis pruebas de la Fase 3 solo comprobaban el patrimonio y `_esEntradaEspejoNoIngreso`, y no lo vieron. Reproducido: ingreso del mes 0 después de perdonar $90.000. **Arreglo:** la entrada lleva `_prestadoDirectamente: true`, la misma bandera que usa el margen de un préstamo. Ahora suma $90.000.

**Causa 2 (Actividad reciente):** el feed solo mostraba de "Yo debo" los movimientos que dejaban un espejo en una cuenta, con el texto del espejo ("Me prestó — X"). Los pagos con tarjeta y los movimientos "sin especificar" no aparecían en ningún lado. **Arreglo:** una fila propia por movimiento (`_normMisDeudas`: "Me prestó X" / "Pago a X"), y los espejos de "Yo debo" se ocultan como ya se hacía con los de "Me deben" (`_espejosDeudores`). El perdón sigue saliendo una sola vez, como ingreso, y el pago de más como gasto.

**Verificación:** 2 tests nuevos en `tests/yodebo.test.js` (el perdón cuenta en el ingreso del mes; pagar o recibir una deuda no cuenta como ingreso ni gasto) y una prueba del feed sobre el `index.html` real (2 "Me prestó", 4 "Pago a", 1 perdón, 1 pago de más, ningún espejo duplicado).

**Sobre fusionar `S.deudores` y `S.misDeudas`:** `firebase-sync.js` no lee ninguna de las dos (sincroniza todo `S` tal cual), así que ese riesgo no existe. Se mantiene la decisión de dejarlas separadas por lo que sigue siendo cierto: cambiaría el formato del backup JSON (`configuracion.js` exige `deudores`), reescribiría datos guardados sin copias automáticas, y hoy no aporta nada que se use.

### ✨ Agregado (2026-10-03) — "Yo debo": grupos de préstamo, y pantallas compartidas con "Me deben"

**Grupos en "Yo debo":** igual que "Me deben": cada deuda propia se organiza en préstamos (Histórico, "Es un préstamo aparte", selector con 2 o más abiertos, cierre automático al saldarse y reapertura al borrar, acordeón en el detalle, migración silenciosa de deudas anteriores). La maquinaria de grupos ya recibía la deuda por parámetro; solo `getGrupoSaldo` asumía que lo que abre la deuda es `'prestamo'`, y ahora usa `Deudas.abre()`. El grupo se resuelve al aplicar el movimiento, no al validar, así que un error no deja grupos vacíos. Sheet nuevo: `md_grupo`, `md_grupo_check`, `md_grupo_nombre`.

**Pantallas compartidas:** las dos listas pasaron a un solo render (`_renderListaDeudas(dir)`, con la tabla `_UI_LISTA` para lo que cambia) y el encabezado del detalle a `_pintarEncabezadoDeuda`. El historial agrupado es una sola función (`_htmlHistorialPorGrupos`). Cambios visibles: el color de cada deuda ahora sale siempre de la persona vinculada (antes "Me deben" usaba `d.color` directo), y la lista de "Yo debo" también se ordena de mayor a menor saldo.

**Guardia de integridad:** también corre al registrar y eliminar en "Yo debo". Sigue siendo un aviso (con el registro dividido en validar y aplicar, solo puede saltar por datos corruptos); no revierte nada.

**Lecturas directas que quedaban:** `tarjetas_credito.js` ahora pasa por `Deudas`. Fuera de `Deudas`, solo quedan el valor inicial de `S` en `core-state.js`, la validación del backup JSON en `configuracion.js` y un chequeo de tipo en `wrapped.js`, que miran la estructura guardada a propósito.

**Decisión: las dos colecciones se quedan separadas.** Con todo el código pasando por `Deudas`, fusionar `S.deudores` y `S.misDeudas` en una sola lista con `direccion` ya no aportaría nada que se use hoy, y sí cambiaría datos guardados, el formato del backup JSON (`configuracion.js` exige `deudores`) y lo que lee `firebase-sync.js`. Si algún día hace falta (por ejemplo, para netear a una persona en ambas listas), solo cambia `Deudas` y se agrega una migración.

**Verificación (jsdom, sobre el `index.html` real):** 6 comprobaciones de grupos en Yo debo (primer grupo, préstamo aparte, selector con 2 abiertos, cierre y reapertura, acordeón, migración, error sin grupos huérfanos); las demás pruebas de Prestado siguen idénticas.

### 🔧 Reestructuración (2026-10-03) — "Me deben": registrar y eliminar un movimiento en dos pasos (validar → aplicar)

**Qué cambió:** `_confirmarMovimientoInterno` (unas 590 líneas, con las validaciones mezcladas con las escrituras) se partió en `_planMovimiento` (lee el formulario y valida; no escribe nada) y `_aplicarMovimiento` (escribe; sin ningún `return` de validación), con un par `_plan…`/`_aplicar…` por rama: perdón, préstamo, abono desde encargo y abono a cuenta propia. Los extras de las dos ramas de abono, que estaban copiados, quedaron en `_planExtra` y `_aplicarExtraPartes`. De `eliminarMovDeudor` se sacó la reversión a `_revertirMovDeudor(d, m)`; la función original conserva solo lo que decide si se puede borrar (antigüedad, confirmación, que Alcancía cargue). La guardia de integridad del saldo sigue ahí como aviso. `abrirDeudor` no se tocó: solo dibuja la pantalla y partirla no protege ningún saldo.

**Otro bug corregido:** el grupo del movimiento (`_resolverGrupoIdMov`) se calculaba al principio, antes de validar, y puede crear un grupo nuevo si se eligió "Es un préstamo nuevo". Un error de validación (por ejemplo, un reparto que no suma) dejaba ese grupo creado y vacío. Reproducido: 1 grupo antes, 2 después del error. Ahora se resuelve al aplicar: 1 y 1.

**Sin cambios de comportamiento:** mismos datos guardados, mismos avisos y mismo orden de validación.

**Verificación (jsdom):** 16 escenarios (perdón, préstamo simple, dividido y con margen, abono simple, dividido y sin cuenta, pago completo, abono con extra de las cuatro clases, abono vía encargo simple, sin cuenta, dividido y con extra, pago completo vía encargo) dan exactamente los mismos registros y saldos que la versión anterior, y al eliminarlos vuelve todo al estado inicial; 12 errores dan el mismo aviso y no cambian ningún dato; 6 casos de eliminación (préstamo vía TC, con margen, abono vía Alcancía, cuando Alcancía no carga, y abonos antiguos sin ids) son idénticos. 10 tests nuevos en `tests/medeben.test.js`.

### 🔧 Cambio (2026-10-02) — Agregar persona: título propio, sin repetidos, y "Yo debo" igual que "Me deben"

**Qué se veía mal:** (1) el selector de personas decía "¿De quién es la plata?" (el texto de Encargos) también al agregar a alguien a Me deben o Yo debo. (2) En Yo debo, "Nueva deuda" abría un sheet distinto, con un campo "¿A quién le debes?" que a su vez abría el selector por encima. (3) El selector ofrecía a personas que ya estaban en la lista, que luego no se podían volver a agregar.

**Qué cambió:** `abrirSelPersona(callback, titulo, opts)` acepta título y un filtro `opts.excluir`. Me deben usa "¿Quién te debe?" y oculta a quienes ya tienen un deudor; Yo debo usa "¿A quién le debes?" y oculta a quienes ya tienen una deuda propia. "Nueva deuda" ya no abre un sheet propio: abre el mismo selector, crea la deuda vacía y abre su detalle (igual que Me deben), y el primer "Me prestó" se registra desde ahí. Buscar a alguien ya agregado avisa que ya está en la lista en vez de ofrecer crearla; si todas ya están, avisa. Encargos no cambia.

**Código retirado:** `sheet-nueva-deuda` (HTML), `crearMiDeuda` y sus dos envoltorios (uno en la sección de Personas y otro del selector), `_ndPoblarSelectDestino`, `_initNuevaDeudaPersonaSelector` y `_onSelPersonaNuevaDeuda`. Eran tres capas para un formulario que ya no existe.

**Efecto colateral bueno:** el sheet viejo sumaba el primer monto a la cuenta sin dejar movimiento espejo en su historial (rompía la regla del proyecto). Ahora el primer "Me prestó" pasa por el flujo común y sí lo deja.

**Verificación (jsdom, sobre el `index.html` real):** título y lista de cada flujo, ocultar a quien ya está, búsqueda de alguien ya agregado, "todas ya están", crear la deuda vacía y abrir el detalle (lista y detalle renderizan con 0 movimientos), y que Encargos conserve su título y lista completa.

### ✨ Agregado (2026-10-02) — "Yo debo": pagar una deuda con tarjeta de crédito

**Qué cambió:** el selector de cuenta de un pago de "Yo debo" ahora ofrece las tarjetas de crédito con cupo disponible (sola o como una fila del reparto). El pago baja la deuda con el prestamista y sube la deuda de la tarjeta por el mismo monto. Pagar o recibir una deuda sigue sin poder usar una tarjeta como destino de plata que entra.

**Tratamiento financiero:** es un cambio de deuda por deuda, no un gasto: patrimonio igual, y la parte cargada a la tarjeta cuenta como deuda **propia** de la TC (`calcDeudaAjenaDeTarjeta` solo suma encargos y préstamos). Con "pagaste de más", la tarjeta sube `monto + extra` y el extra es el gasto.

**Detalle técnico:** cada fila con tarjeta deja un cargo `cargo_deuda` en `S.tcMovimientos` (`miDeudaId`, `_miDeudaMovId`). `tarjetas_credito.js` reconstruye `tc.deuda` desde sus registros en cada refresh (`tcRecalcular`, `tcNormalizarTarjetas`); se agregó `_tcEsCargoExterno()` con el tipo nuevo en ambos sitios. Sin eso, la deuda sumada a la TC se perdía en el siguiente refresh (reproducido en las pruebas). El detalle de la tarjeta muestra estos cargos como "Pago de deuda". Eliminar el pago quita el cargo y baja la deuda de la TC.

**Verificación (jsdom):** pago simple y dividido (efectivo + TC), la deuda de la TC sobrevive a `tcNormalizarTarjetas()`, patrimonio sin cambios, pago de más con TC (−extra), cupo insuficiente y TC como destino sin escribir nada, reversión exacta, y `cargo_prestamo` sigue contando como ajena.

### ✨ Agregado (2026-10-02) — "Yo debo": pago dividido, perdón y pago de más (Fase 3)

**Qué cambió:** el sheet de movimientos de "Yo debo" (`sheet-mov-mi-deuda`) ahora puede (1) **dividir** un préstamo recibido o un pago entre varias cuentas (`destinos[]` / `fuentes[]`), (2) registrar que **te perdonaron** lo que faltaba y (3) registrar que **pagaste de más**. Lo hace con el mismo patrón que "Me deben": validar todo antes de escribir (`_planMovMiDeuda`), luego aplicar (`_aplicarMovMiDeuda`, sin `return` de validación), y una sola reversión (`_revertirMovMiDeuda`).

**Tratamiento financiero:** perdón = **ingreso** (la deuda baja sin que salga plata: patrimonio +saldo). Pago de más = **gasto** (sale de la cuenta pero no baja la deuda: patrimonio −extra); las cuentas descuentan `monto + extra`. Pagar o recibir una deuda por sí solo deja el patrimonio igual. `_esEntradaEspejoNoIngreso()` ahora no excluye `_esPerdonRecibido`, porque todo `_origenSeccion` que empieza por "Prestado" se excluía como espejo.

**Cambios de comportamiento en lo que ya existía:** (a) un pago ahora se rechaza si la cuenta elegida no tiene saldo suficiente (antes podía dejarla en negativo); (b) `_deudaCuentasDe` ahora también cuenta las cuentas de `destinos[]`/`fuentes[]`, así que la protección por antigüedad cuenta bien los abonos repartidos de "Me deben" (antes no los veía); (c) un perdón de "Yo debo" no suma en "Pagado" ni en Wrapped.

**Pendiente en "Yo debo":** nada de lo que tiene "Me deben" (los grupos se agregaron después, ver arriba).

**Verificación (jsdom):** pago y recibido divididos, perdón, pago de más y su reversión exacta; patrimonio antes/después de cada caso; 6 casos de error que no cambian ningún dato; y un registro antiguo de una sola cuenta se elimina igual que antes.

### 🔧 Reestructuración (2026-10-02) — Fase 2: capa de acceso `Deudas`, un solo juego de helpers y tolerancias con nombre

**Qué cambió:** "Me deben" (`S.deudores`) y "Yo debo" (`S.misDeudas`) ahora se consultan por un único objeto, `Deudas` (en `js/core/calc-helpers.js`, carga de entrada): `lista(dir)`, `porId`, `porPersona`, `agregar`, `quitar`, `saldo(d)`, `totalPendiente(dir)`, con dirección `'favor'` / `'contra'`. Los datos guardados **no cambian** (siguen las dos listas, mismos tipos de movimiento). 11 archivos (`actividad_reciente`, `alcancia`, `busqueda-global`, `cuentas`, `encargos`, `inicio`, `movimientos`, `personas`, `plata_comprometida`, `wrapped`, `prestado`) y `core-state.js` dejaron de leer/escribir las listas directo.

**H3 resuelto (era una sospecha):** `getDeudorSaldo` y `getDeudorSaldoPatrimonio` eran el mismo `reduce`. Se eliminó `getDeudorSaldoPatrimonio`; el patrimonio y la pantalla usan la misma definición (`Deudas.saldo`). Los nombres `getDeudorSaldo`, `getMiDeudaSaldo`, `totalPrestadoPendiente` y `totalMisDeudasPendiente` se conservan como envoltorios (los usan 8 archivos y los tests). `_patrimonioDependenciasListas` ya no depende de que `prestado.js` haya cargado, porque `Deudas` carga de entrada.

**H4 resuelto:** `Deudas.TOL` ($1) y `Deudas.TOL_FINO` ($0,50) reemplazan los `1` y `0.5` sueltos de `prestado.js`. Mismos valores que antes, ahora con nombre.

**Helpers espejo unificados:** `_deudorCuentasDe`/`_miDeudaCuentasDe`, `_deudorOpsPosteriores`/`_miDeudaOpsPosteriores` y `_deudorTieneCuentaAfectada`/`_miDeudaTieneCuentaAfectada` pasaron a `_deudaCuentasDe`, `_deudaOpsPosteriores` y `_deudaTieneCuentaAfectada`. Los tipos de movimiento son disjuntos, así que no necesitan saber la dirección. Las pestañas Me deben / Yo debo se pintan con una sola función (`_pintarTabPrestamos`).

**Verificación:** `node --check` en los 15 archivos tocados; en jsdom, mismo patrimonio y mismos totales que el código anterior, `agregar`/`quitar`/`porPersona`, equivalencia de los helpers unificados y de las pestañas, y la prueba dorada de la Fase 1 sigue idéntica.

### 🔧 Reestructuración (2026-10-02) — Fase 1: el efecto sobre la cuenta vive en un solo lugar (`js/core/cuenta-efectos.js`)

**Qué cambió:** `registrarMovEspejo()` y `borrarMovEspejo()` reemplazan los 7 bloques de escritura y 6 de reversión del movimiento espejo que `prestado.js` repetía por tipo de cuenta, y las dos funciones propias de `mesada.js` (que ahora delegan). `prestado.js` pasó de 3.040 a ~2.780 líneas. Solo escriben/borran el registro del historial; el saldo sigue siendo `sumarFuente`/`descontarFuente`. Si la cuenta ya no existe, el id del espejo queda `null` (antes quedaba un id de algo que nunca se escribió; sin efecto sobre saldos).

**También corregido:** un abono vía encargo con pago dividido entre varias cuentas sumaba saldo a cada cuenta destino pero no dejaba movimiento espejo en su historial. Ahora lo deja, guarda su id en cada fila de `destinos[]` y la eliminación lo revierte. Los abonos antiguos sin ese id se revierten como antes.

**Verificación:** misma entrada en el código anterior y el nuevo da exactamente los mismos registros y saldos (8 escenarios, ver arriba), y al eliminar todo vuelve al estado inicial.

### 🐛 Corregido (2026-10-02) — Abono con "extra" inválido quedaba aplicado a medias (y se duplicaba al corregirlo)

**Causa:** en la rama normal de `_confirmarMovimientoInterno`, el abono se registraba (`d.movimientos.push`, `sumarFuente`, movimientos espejo) **antes** de validar el extra. Con el monto del extra vacío, sin partes o con partes que no sumaban, la función hacía `return` con un toast, pero el abono ya estaba aplicado en memoria con el sheet abierto: al corregir y volver a confirmar se registraba dos veces, y un `save()` de cualquier otra pantalla lo guardaba a medias.

**Arreglo:** las tres validaciones del extra se hacen primero (paso 0) y el resto de la rama ya no puede salirse a medias. Caso reproducido: abono de $20.000 a Nequi con extra vacío, luego corregido. Antes: Nequi $40.000, deuda $60.000. Ahora: Nequi $20.000, deuda $80.000.

### ✨ Agregado (2026-10-01) — Un abono que cubre toda la deuda se guarda como "Pago completo"

**Caso:** la persona debe 4.000, abrís "Registrar abono" (en vez de "Pagar préstamo completo") y ponés 4.000. Antes quedaba como `'abono'`; ahora queda como `'pago-completo'`, con la etiqueta "Pago completo" en el historial y la descripción "Pago de deuda completo — …" en el movimiento de la cuenta, igual que si hubieran abierto el otro sheet.

**Cómo:** `confirmarMovimiento()` pasó a ser un envoltorio de `_confirmarMovimientoInterno()`. Si `movTipo === 'abono'` y el monto iguala el saldo total de la persona (`getDeudorSaldo`, tolerancia $0,50), promueve `movTipo` a `'pago-completo'` solo durante el guardado y lo restaura en `finally`, así que si una validación aborta el sheet sigue siendo "abono". Todo lo que ya dependía de `movTipo` (tipo guardado, desc secundaria, rama de encargo) lo toma solo, sin tocar nada más.

**Alcance:** se compara contra el saldo TOTAL de la persona (igual que "Pagar préstamo completo"), no el de un grupo. Un abono menor al saldo sigue siendo abono. Solo aplica a abonos; no a préstamos ni a "¿Se lo regalas?". Verificado en sandbox con los archivos reales (abono 1.000 → `abono`; abono 3.000 que salda → `pago-completo`; `movTipo` restaurado). No probado en navegador.

### ✨ Agregado (2026-09-30) — "Nuevo préstamo": opción "El valor real era diferente" (margen cuando cobras más de lo que costó)

**Caso:** prestás algo que pagaste a 698.000 y le cobrás 700.000 a la persona (siempre redondea). Antes solo se podía registrar 700.000 de deuda *y* 700.000 salidos de la cuenta, o bien usar el préstamo con TC, que sí tenía este bloque.

**Qué hace:** en `sheet-registrar-movimiento`, solo en "Nuevo préstamo", aparece el mismo bloque colapsable que ya usan Encargos y "Préstamo con TC" (`mov-dif-wrap`, instancia `'prestamoDif'` del motor `diferencial.js`). *Monto* = lo que le cobrás (la deuda de la persona); *¿Cuánto era en realidad?* = lo que de verdad sale de tu cuenta. Con 700.000 / 698.000: la deuda queda en 700.000, de la cuenta salen 698.000 y los 2.000 de margen se registran como ingreso.

**Decisiones:**
- El margen es un ingreso **sin cuenta** (`fuente:''`, `_prestadoDirectamente`, `permiteMiCuenta:false`), igual que en "Préstamo con TC": esos 2.000 nunca pasaron por ninguna cuenta tuya; cuando te paguen los 700.000 entran enteros a la cuenta destino del abono.
- El ingreso se enlaza al préstamo (`diffAplicar('prestamoDif', …, movId)` → `_encMovId`), y `eliminarMovDeudor()` lo borra junto con el préstamo (no hay saldo que revertir).
- En modo simple con margen, el préstamo se guarda como `fuentes:[{fuente, monto: real}]` (la misma forma del préstamo dividido) en vez de `fuente`. Así revertir, el detalle y el historial de la cuenta usan el monto real sin ningún caso especial. Sin margen, nada cambia (sigue `fuente`).
- Con "Dividir ÷", las filas deben sumar el valor real (no el monto cobrado); `_updatePrestSplitResumen()` usa `_prestMontoSalida()`.
- Si el valor real es mayor que el monto cobrado se bloquea con un toast (cobrar de menos no se modela). Real vacío, o igual al monto, = sin diferencial.
- La tarjeta del movimiento muestra el margen con `diffRenderHistorial()` (solo en préstamos normales; los de TC siguen como estaban).

**Verificado:** corrido con los archivos reales (`diferencial.js`, `calc-helpers.js`, `fuentes-filtro.js`, `prestado.js`) en un sandbox con DOM simulado: préstamo 700.000/698.000 desde Nequi → deuda 700.000, Nequi −698.000, un ingreso de 2.000 enlazado; borrarlo deja deuda 0, Nequi como antes y sin ingreso; real > monto bloquea sin escribir nada; sin diferencial sigue igual. **No probado en un navegador real** (el bloque HTML, el toggle y la lectura de `mov_dif_real` en vivo).

### ✅ Corregido (2026-09-30) — El margen de un préstamo con TC quedaba huérfano al borrar el préstamo

**Síntoma:** al borrar un préstamo hecho con tarjeta, la deuda de la TC y su cargo se revertían, pero el ingreso "Margen préstamo TC — …" seguía en `S.movimientos` y seguía contando como ingreso en Análisis y Salud financiera.

**Causa raíz:** `confirmarPrestamoTC()` llamaba a `diffAplicar('prtc', {...})` sin el tercer argumento (vínculo), así que el margen no quedaba ligado al préstamo, y la rama `_viaTC` de `eliminarMovDeudor()` no lo limpiaba.

**Fix:** `diffAplicar('prtc', …, movId)` deja `_encMovId` = id del préstamo, y `eliminarMovDeudor()` borra en la rama `_viaTC` los `_esDiferencialEncargo` con ese vínculo. El ingreso se escribe sin cuenta, así que no hay saldo que revertir.

**Alcance a propósito:** solo préstamos nuevos; los guardados antes no tienen el vínculo y su margen seguiría huérfano al borrar el préstamo. Tampoco se le puso `_secundario` a ese margen (ver la entrada de Encargos del mismo día): sin vínculo en datos viejos, protegerlo lo dejaría sin forma de borrarse. Sin probar en la app.

### ✅ Corregido (2026-09-28) — El extra/propina de un pago de deuda no contaba como ingreso en Análisis ni en Salud financiera

**Síntoma:** al registrar el pago de un préstamo con "me dio de más" (extra → guardar en cuenta), la plata sumaba al saldo de la cuenta y al patrimonio, pero Análisis financiero y Salud financiera no la veían como ingreso.

**Causa raíz:** el movimiento `entrada` que se escribe para el extra llevaba `_origenSeccion: 'Prestado · Me deben'`, y `_esEntradaEspejoNoIngreso()` descarta todo lo que empiece con `Prestado` (pensado para el abono principal, que solo devuelve capital ya contado).

**Fix:** los movimientos del extra "guardar" de la **rama normal** de `confirmarMovimiento()` llevan ahora `_esExtraIngreso: true`, y `_esEntradaEspejoNoIngreso()` devuelve `false` para ellos antes de cualquier otra regla. El abono principal sigue siendo espejo (no ingreso).

**Alcance a propósito:** la rama "abono vía encargo" no cambió — ahí el extra sale de plata del encargo, no de un regalo del deudor. Los extras "gastar" siguen excluidos (`_esExtraPrestamo`). Análisis solo suma `S.movimientos`, así que el fix se refleja para destinos Efectivo/Nequi; un extra guardado en cajita o cuenta personalizada solo escribe en el historial de esa cuenta (comportamiento previo, sin tocar).

---

### 🔧 Cambio (2026-09-20) — `getDeudorSaldo()` se movió a `js/core/calc-helpers.js`

Es un `reduce` puro sobre `d.movimientos` y "Necesita atención" (`inicio.js`) la necesita en el primer render. Sigue siendo global: el resto de `prestado.js` la usa igual, pero `prestado.js` ya no la define. `getDeudorSaldoPatrimonio()` se dejó donde estaba. Detalle en `changelog/inicio.md`; el efecto en los tests, en `changelog/infraestructura-seguridad.md`.

### ✨ Agregado (2026-09-20) — Préstamos: la plata que sale solo se ofrece de cuentas con saldo ≥ $1,00; "Préstamo con TC" exige cupo

- **`mov_fuente`** ("¿De dónde sacó la plata?", nuevo préstamo, modo simple): `initMovSheet()` lo poda tras `poblarFuente()` (`openSheet('registrar-movimiento')` ya lo había poblado sin filtrar; `initMovSheet()` lo repuebla y poda después, y es el último en escribirlo). `mov_destino` (abonos) **no** se filtra: es plata que entra.
- **Split de préstamo (`_getPrestSplitFuentesOptions`)** y **"Yo debo → Registrar pago"** (`md_cuenta`, solo cuando `tipo !== 'recibido'`): mismo filtro. "Sin especificar" y "Ganancia (no salió plata)" nunca se filtran.
- **Préstamo con TC:** `abrirSheetPrestamoTC()` no abre el sheet y avisa "No se puede: ninguna de tus tarjetas tiene cupo disponible" si ninguna TC activa tiene cupo; el select `prtc_tarjeta` lista solo las TC con cupo y muestra el cupo disponible (antes mostraba la deuda). El botón `btn-prestamo-tc` se ve atenuado (`_actualizarBtnPrestamoTC()`, llamada desde `abrirDeudor()`), pero **no** usa `disabled` a propósito: en móvil un botón deshabilitado no explica nada, y el toast sí.
- La validación de cupo contra el monto real de la compra (`confirmarPrestamoTC`) queda igual.


### ✨ Agregado (2026-09-19) — "¿Se lo regalas?": perdonar lo que falta en "Pagar préstamo completo" (cuenta como gasto)

Hasta ahora no había forma de decir "ya no me debes nada, te lo regalo": lo más cercano era pagar el préstamo completo con destino "Sin especificar", que dejaba el saldo en 0 pero quedaba en el historial como un pago normal y **no contaba como gasto** (el patrimonio bajaba, pero Gastos/Análisis/salud no se enteraban, y la tasa de ahorro del mes salía mejor de lo que fue). El regalo de un *extra* (`p.tipo === 'regalar'`) tampoco servía: solo aplica al extra de un abono, no a la deuda en sí.

- **UI (`index.html`, sheet `registrar-movimiento`):** nuevo toggle `#mov_perdon` ("¿Se lo regalas?") dentro de `#mov_perdon_wrap`, visible solo en "Pagar préstamo completo". Al activarlo se ocultan el destino (`#mov_destino_wrap`), el extra y "¿Viene de un encargo?" (y se apagan si estaban prendidos, para no dejar estado oculto), el título pasa a "Perdonar deuda" y el botón a "Perdonar deuda". Wiring en el arreglo `[id, evento, fn]` del final de `prestado.js`.
- **Modelo:** el movimiento del deudor sigue siendo `tipo:'pago-completo'` (así `getDeudorSaldo`, grupos, `_autoCerrarGruposEnCero` y la integridad de saldo funcionan sin tocar nada) con `destino:''`, `_perdon:true` y `_gastoPerdonId`. Al mismo tiempo se crea un gasto en `S.gastosVar`: `{ monto, fecha, cat:'Otro', desc:'Perdoné deuda — <nombre>', fuente:'', _secundario:true, _origenSeccion:'Prestado · Me deben', _esPerdonDeuda:true, _deudorId, _deudorMovId }`.
- **Por qué cuenta como gasto:** la plata ya había salido de tus cuentas cuando prestaste (eso nunca fue gasto: pasó de cuenta a "por cobrar"); al perdonarla se da por perdida. `fuente:''` hace que no descuente ningún saldo (no hay doble descuento) y `_esGastoVarNoReal()` **no** lo excluye (a diferencia de `_esExtraPrestamo`, `_esPagoTC`, etc.), así que entra al total de Gastos, salud, presupuestos y cierre de mes. Categoría `'Otro'` porque existe en las categorías por defecto (`'Varios'`, la del extra, no).
- **`_secundario`:** el gasto se ve en Gastos con candado y solo se borra desde Préstamos (regla 3.6 de `gastos.md`); `deleteGastoVar()` y `eliminarMovimiento()` ya lo bloquean con ese flag.
- **Reversión (`eliminarMovDeudor`):** si `m._perdon`, además de quitar el movimiento borra el gasto por `m._gastoPerdonId`; el diálogo dice que el gasto también se borrará (en vez de "el saldo de la cuenta destino se revertirá") y el toast final lo aclara. `_deudorTieneCuentaAfectada()` devuelve `true` para un perdón: no toca cuentas, pero borrarlo cambia un gasto de un mes ya cerrado, así que pasa por la protección por antigüedad.
- **Historial del deudor:** badge "Perdonado" (rojo) en vez de "Pago completo", con la etiqueta "se lo regalé · cuenta como gasto". "Pagado" en la cabecera **no** suma lo perdonado (no es plata que te pagó).
- **Sin efecto en cuentas:** no llama `sumarFuente`, no crea movimiento secundario, no toca `S.movimientos`. Verificado con un arnés que carga las funciones reales (`confirmarMovimiento`, `eliminarMovDeudor`, `_deudorTieneCuentaAfectada`, `_esGastoVarNoReal`): saldo 600 → 0, un gasto de 600 que `_esGastoVarNoReal` no excluye, ninguna cuenta tocada, y al borrar el perdón el saldo vuelve a 600 y `gastosVar` queda en 0.

**Verificado después contra `inicio.js`, `analisis.js`, `actividad_reciente.js` y `personas.js`:**
- **`inicio.js` / `analisis.js`:** todos los cálculos de gasto (gastos del mes de Inicio; total del mes, tendencia, ranking de meses, comparativa con el mes anterior, gasto por categoría y presupuestos en Análisis) filtran con `_esGastoVarNoReal()`, así que el perdón suma sin cambios. Categoría `'Otro'` (con fallback a `'Otro'` también en presupuestos). "Necesita atención" lista deudores con saldo > 0: tras perdonar, la persona sale de la lista.
- **`actividad_reciente.js`:** `_normDeudores()` mostraba todo movimiento que no fuera `'prestamo'` como "Abono de X" (+), así que el perdón aparecía como plata recibida **y** además el gasto ("Perdoné deuda — X", −) — doble. Fix: `_normDeudores()` salta los movimientos con `_perdon`; queda solo el gasto. El feed es de solo lectura (sin borrar/click), así que no hay más que tocar.
- **`personas.js` (perfil de la persona; lo que antes vivía también en `prestado-personas.js`, ya fusionado en `prestado.js`):** `abonos` incluía todo `'abono'`/`'pago-completo'`, así que un perdón inflaba "Abonado", el "Progreso de pago" y "Mayor abono". Fix: se excluye `_perdon` de `abonos`; "Último movimiento" muestra "Deuda perdonada" en vez de "Pago completo".
- **`wrapped.js`:** el gasto del perdón ya entra bien (todos sus cálculos de gasto filtran con `_esGastoVarNoReal`), pero dos funciones trataban el `'pago-completo'` de un perdón como devolución: `_wrappedCalcularPrestado()` lo sumaba a `totalDevuelto` ("te devolvieron $600") y `_wrappedRecuperacionMasRapida()` lo contaba como préstamo recuperado en N días. Fix: ambas ignoran `m._perdon` (verificado con las funciones reales: un préstamo pagado da devuelto 600 y recuperación en 49 días; el mismo perdonado da devuelto 0 y sin recuperación). Se dejaron como están los contadores de "día más activo" y "movimientos registrados", que ya sumaban a la vez el movimiento del deudor y su reflejo en otras listas (un perdón cuenta 2 en vez de 1, mismo criterio de aproximación que el resto del archivo).

**Sin prueba en navegador real.**

---

### ✅ Corregido (2026-09-19) — Reversión de préstamos/abonos borrados desde el feed o el detalle de una cuenta (`movimientos.js` → `eliminarMovDeudor`)

`eliminarMovimiento()` (`js/core/movimientos.js`) tenía su propia copia de la reversión para `'prestamo'`/`'abono'` (movimientos de `S.deudores[]`), mucho más pobre que `eliminarMovDeudor()` (`prestado.js`), que es la implementación completa. Diferencias verificadas leyendo ambos archivos:

- **Préstamo con fuentes divididas (`m.fuentes`):** la copia solo hacía `if (mov.fuente) sumarFuente(...)`. Un préstamo dividido borrado desde una cuenta desaparecía **sin devolver la plata a ninguna de las cuentas** (el saldo quedaba bajo para siempre). Además el propio encabezado de `movimientos.js` afirmaba que esa rama "lo revierte completo".
- **Préstamo vía TC (`_viaTC`):** no revertía `tc.deuda` ni limpiaba `S.tcMovimientos`.
- **Abono con `destinos` dividido, vía encargo o vía Alcancía:** solo revertía `mov.destino` simple; nada de encargo/Alcancía/extra.
- **Grupos de préstamo:** no llamaba `_autoCerrarGruposEnCero(d)` ni la guardia `_verificarIntegridadSaldoDeudor`.
- **Grupo lazy sin guard:** la protección por antigüedad de esa rama llamaba `_deudorTieneCuentaAfectada`, `_deudorOpsPosteriores` y `_deudorCuentasDe` (todas de `prestado.js`) sin `typeof`; borrar un préstamo desde el detalle de una cuenta sin haber visitado antes Préstamos en la sesión tiraba `ReferenceError` (mismo patrón que ya se había encontrado con `getMesadaData` y `tcEliminar*`).

Fix: `eliminarMovimiento()` ya no tiene lógica propia para estos dos tipos. Si `movTipoEl` es `'prestamo'`/`'abono'`, busca el deudor dueño, asegura `Loader.ensure('prestamos')` si `eliminarMovDeudor` todavía no existe (aborta con toast si falla la carga, sin dejar nada a medias) y delega con `eliminarMovDeudor(deudorId, movId, { desdeFeed: true })`. Si el id no está en ningún deudor muestra un toast de error en vez del falso "Movimiento eliminado y saldos revertidos" de antes. Se borraron el bloque de protección por antigüedad y las dos ramas de reversión duplicadas de `movimientos.js` (la protección, el diálogo y la reversión viven ahora solo en `eliminarMovDeudor`). Para no perder el re-render de la cuenta abierta, esa cola se extrajo a `_rerenderCuentaActiva()` (usada por la delegación y por el final de `eliminarMovimiento()`).

`eliminarMovDeudor(deudorId, movId, opts)`: nuevo 3er parámetro opcional `opts.desdeFeed === true` → hace todo igual pero **no** llama `abrirDeudor()` al terminar (el usuario se queda en la cuenta desde donde borró). Sin el parámetro (botón del detalle del deudor) el comportamiento es idéntico al de antes.

Validado con `node --check` y con un arnés de `vm` con stubs (módulo no cargado → `ensure('prestamos')` + delegación con `{desdeFeed:true}` + re-render; módulo ya cargado → sin `ensure`; id inexistente → toast de error; falla de carga → toast y sin efectos). **Sin prueba en navegador real.**

**Verificado después contra `cuentas.js` y `tarjetas_credito.js`:** (1) `getMovimientosCuenta()` y `_getMovimientosCuentaCustom()` arman cada fila de un préstamo — simple o por cada fuente de un préstamo dividido — con `_movId: m.id`, el id del movimiento del deudor, así que la delegación lo encuentra. (2) En el detalle de una TC, las filas `cargo_encargo`/`cargo_prestamo` no tienen botón de borrar (solo compras y pagos) y el sheet de detalle tampoco, así que un `cargo_prestamo` solo se puede eliminar borrando el préstamo en Préstamos (`eliminarMovDeudor`, rama `_viaTC`: revierte `tc.deuda` y quita la fila de `S.tcMovimientos` por `_deudorMovId`) — no queda ningún camino que borre un lado y deje el otro.

---

### ✅ Corregido (2026-09-19) — Las tarjetas de crédito aparecían en "¿A dónde entra el pago?" (abono / pago completo) y en "¿De dónde sacó la plata?" (préstamo nuevo)

En el sheet `sheet-registrar-movimiento`, con el modo simple (sin "Dividir ÷"), `initMovSheet()` poblaba `#mov_destino` y `#mov_fuente` con `poblarFuente(id)`, cuyo 3er parámetro `incluirTC` vale `true` por defecto, así que aparecía p. ej. "Nu Mastercard Gold (TC)" en los dos. Los modos divididos ya estaban bien (`_getAbonoDestinoFuentesOptions()` y `_getPrestSplitFuentesOptions()` usan `getFuentesSinTC()`). Fix: `poblarFuente('mov_fuente', false, false)` y `poblarFuente('mov_destino', false, false)` — sin helper propio, con el parámetro que el núcleo ya trae.

- **Destino de un abono / pago completo:** una TC nunca recibe plata entrante (pagarle a una TC es otro flujo, con su propio sheet en Tarjetas de crédito).
- **Fuente de un préstamo nuevo:** un préstamo pagado con TC tiene su flujo dedicado, el botón "Préstamo con TC" (`abrirSheetPrestamoTC()` / `confirmarPrestamoTC()`): valida el cupo (`tcCupoDisponible`), pide la descripción de la compra, suma `tc.deuda`, crea el cargo enlazado en `S.tcMovimientos` (`tipo:'cargo_prestamo'`, `_deudorMovId`), marca el movimiento con `_viaTC`/`_tcId`/`_tcMonto` y soporta el diferencial (margen) vía la instancia `'prtc'`. El camino simple solo hacía `descontarFuente('tc:...')` (que sí sube `tc.deuda`, verificado en `core-state.js`) y guardaba `fuente:'tc:...'`: sin validación de cupo, sin descripción y **sin el cargo `cargo_prestamo`**, así que `calcDeudaAjenaDeTarjeta()` no lo contaba como deuda ajena y `calcDeudaTcPropiaDeTarjeta()` lo trataba como deuda **propia** (simulado con las funciones reales del núcleo: un préstamo de $200.000 por el camino simple da deuda propia $200.000; por "Préstamo con TC", $0). Y peor: `refresh()` llama `tcNormalizarTarjetas()` (si Tarjetas ya cargó), que ejecuta `tcRecalcular(tc)` — reconstruye `tc.deuda` **desde** saldo inicial + compras + cargos (`cargo_encargo`/`cargo_prestamo`/`cargo_spotify`) − pagos. Un préstamo hecho por el camino simple nunca creó ninguna de esas filas, así que en el siguiente `refresh()` su deuda **desaparece de `tc.deuda`** (simulado con las funciones reales: tarjeta con $50.000 de compras propias + préstamo simple de $200.000 → deuda $250.000, y tras `tcRecalcular` vuelve a $50.000). Efecto para el usuario: la app muestra menos deuda de TC de la que el banco tiene, y el patrimonio queda inflado en ese monto (el saldo del deudor sigue sumando como activo).
- **Reversión de estos préstamos viejos:** `eliminarMovDeudor()` los revierte bien — `sumarFuente('tc:...')` devuelve la deuda (`Math.max(0, deuda - monto)`). Lo que faltaba era el cargo enlazado, no la reversión (y como `refresh()` recalcula `tc.deuda` desde los movimientos, borrar uno de estos préstamos tampoco deja la deuda desalineada). *(Una versión anterior de esta entrada decía que la deuda no se revertía: era incorrecto, corregido tras revisar `core-state.js`.)*

**Decisión de diseño — NO unir "Nuevo préstamo" y "Préstamo con TC" en un solo sheet.** Se evaluó y se descartó por ahora: (1) una TC no es una "fuente de plata" como Nequi o una cajita, es otro modelo de datos (descripción obligatoria, cupo, cargo enlazado, diferencial); (2) unirlos implicaba meter descripción, selector de TC y el motor `'prtc'` (ids `prtc-dif-*`) dentro del sheet más cargado de Préstamos (grupos, dividir, ganancia, encargo), con reglas de exclusión (TC no combina con Dividir ni con Ganancia); (3) el botón "Préstamo con TC" ya está al lado de "Nuevo préstamo" en el detalle de la persona; (4) sin prueba en navegador real, el riesgo de regresión en el sheet más usado no compensa. Si más adelante se quiere una sola entrada, la variante barata es que elegir la TC en `#mov_fuente` abra `abrirSheetPrestamoTC()` con monto/fecha/nota/grupo pre-llenados, reutilizando la lógica existente en vez de duplicarla.

**Confirmado por el usuario (2026-09-19): no existe ningún préstamo registrado por este camino (nunca supo que se podía), así que no hay datos que migrar. Se deja la nota por si aparece algún dato viejo importado.** Contexto del riesgo: préstamos viejos ya registrados por el camino simple con una TC de fuente (y, antes de la migración a `crearSplitWidget`, también por el modo dividido). Quedaron sin `_viaTC` ni `cargo_prestamo` y, por lo de `tcRecalcular()`, su deuda ya no está en `tc.deuda`. Si aparece alguno hay que migrarlo: quitar `fuente`/`fuentes` de TC, poner `_viaTC:true`, `_tcId`, `_tcMonto`, `_tcDesc` y crear el `cargo_prestamo` con `_deudorMovId`, y luego `tcRecalcular(tc)`. Se pueden listar desde la consola: `console.table(S.deudores.flatMap(d => (d.movimientos||[]).filter(m => m.tipo==='prestamo' && ((m.fuente||'').startsWith('tc:') || (m.fuentes||[]).some(f => (f.fuente||'').startsWith('tc:')))).map(m => ({persona:d.nombre, monto:m.monto, fecha:m.fecha, fuente:m.fuente}))))`.

Se revisaron los demás selects de plata entrante de este módulo: `nd_destino` (nuevo deudor), `md_cuenta` (Yo debo — "me prestó más") y las filas de "guardar en cuenta" del extra ya usaban `getFuentesSinTC()`; `mov_enc_cuenta` se llena con las cuentas del propio encargo, no con la lista general. Sin más casos en `prestado.js`/`index.html`.

Validado con `node --check` (sin errores). **Sin prueba en navegador real.**

---

### 🗑️ Eliminado (2026-09-09) — Código muerto del sheet "Nueva persona" viejo (`addDeudor()`, color picker, sheet completo)

*(el hallazgo ya estaba documentado desde el 2026-07-27 en `auditoria-tecnica.md`, pero nunca se había borrado — solo anotado)*

Confirmado de nuevo antes de tocar nada: el override de `openSheet()` en el propio `prestado.js` intercepta `id==='nueva-persona'` con un `return` antes de mostrar el sheet original, redirigiendo siempre a `abrirSelPersona(_onSelPersonaMeDeben)` (el selector genérico de Personas). El sheet `#sheet-nueva-persona` nunca se muestra, así que nada de lo que solo se dispara desde ahí tiene ya una vía de ejecución real.

Borrado en `prestado.js`: `npColorSel`, `selColor()`, el wiring `[data-pick-color]`, `initColorPicker()`, `addDeudor()` (función original), la entrada `addDeudor: addDeudor,` del objeto de registro de acciones, y el wrapper `_origAddDeudorPersonas`/reasignación de `addDeudor` (vinculaba el deudor nuevo a `S.personas`, pero nunca corría porque nadie llamaba a `addDeudor()`). Se borraron la función y el wrapper en la misma pasada para no dejar `const _origAddDeudorPersonas = addDeudor` apuntando a un identificador ya inexistente — esa línea corre a nivel superior del archivo, al parsear, así que un `ReferenceError` ahí tumba la carga completa de `prestado.js`, no solo esta feature.

Borrado en `index.html`: el sheet `#sheet-nueva-persona` completo (overlay, título, input de nombre, los 6 círculos `data-pick-color`, y los botones "Crear persona"/"Cancelar"). Confirmado además que `btn-crear-deudor` no tenía ningún listener en ningún archivo — estaba huérfano del todo, ni siquiera le faltaba wiring.

No se tocó `abrirSheetNuevaPersona`/`_abrirSheetNuevaPersona` ni el override de `openSheet` — siguen siendo el camino real y en uso hoy hacia el selector de Personas.

Validado con `node --check` (sin errores) y balance de etiquetas en `index.html`: −14 `<div>`/−14 `</div>` y −2 `<button>`, exactamente lo que traía el bloque removido (6 círculos + overlay + sheet + 2 `ig` + título + `np_colores` = 14 divs; "Crear persona" + "Cancelar" = 2 buttons), confirma que no se arrastró ni de más ni de menos. **Sin prueba en navegador real.**

### ✅ Corregido (2026-09-01) — Protección por antigüedad se activaba en préstamos/abonos "Ganancia"/"Sin especificar" que no movían ningún saldo

Mismo bug encontrado primero en Mesada — detalle completo, causa y fix en `changelog/mesada.md`. Resumen: `eliminarMovDeudor()`, su duplicado en `movimientos.js` (rama `'prestamo'`/`'abono'`) y `eliminarMovMiDeuda()` calculaban el nivel de antigüedad sin verificar antes si había algo real que revertir. Nuevas `_deudorTieneCuentaAfectada(m)` / `_miDeudaTieneCuentaAfectada(m)` gatean ese cálculo.

### 🗑️ Eliminado por diseño — Botón "Devolver a donde salió el préstamo"

Se quitó el atajo del sheet de abono/pago-completo que, al registrar un pago, prellenaba automáticamente el destino con la(s) misma(s) cuenta(s) de donde había salido el préstamo original (`mov_btn_origen` + los badges de `mov_origen_tags`).

Eliminado por completo: `movSetOrigenBtn()` (calculaba las fuentes del último movimiento tipo `'prestamo'` del deudor y pintaba los tags), `abonoAplicarOrigen()` (aplicaba esas fuentes como destino, en modo simple o dividido), su entrada en el objeto de exportación de `Events`, el precargado del botón al abrir el sheet (`if (tipo === 'abono' || tipo === 'pago-completo') ...`), el reset de sus elementos al abrir cualquier sheet de movimiento, y el markup del botón/badges en `index.html`.

Se dejó intacto el flujo manual de "Dividir ÷" del destino (`_abonoSplitMode`/`_abonoSplitRows`/`abonoRenderSplit`/`toggleAbonoSplit`/`abonoAddSplitRow`), que es independiente — solo servía como atajo para prellenarlo, no como su base.

### ✅ Corregido — Dos `toast()` de "recién creado" sin escapar (`addDeudor()`, `crearMiDeuda()`)

*(2026-07-30, confirmando el módulo contra su código fuente por primera vez)*

El módulo ya era cuidadoso en general (49 usos de `escHtml()`, incluyendo la mayoría de sus `toast()` con nombre de persona) — pero los dos `toast()` de "recién creado" se quedaron sin envolver, mientras que los de eliminar, error y advertencia de saldo sí escapaban bien el mismo campo. A diferencia de los hallazgos anteriores de este mismo patrón en otros módulos (donde solía faltar en todos los sitios, o en ninguno), acá se rompió justo en dos de más de una decena de sitios similares — confirma que "el módulo ya es cuidadoso" tampoco es garantía completa. Corregido con `escHtml()` en ambos. Un tercer sitio del mismo patrón (`guardarEditarMiDeuda()`) apareció después, el 2026-08-17 — ver `changelog/infraestructura-seguridad.md`.

Préstamos (`prestado.js`) sigue sin migrar a `html\`\`` — el único módulo que queda pendiente de esa migración (ver `auditoria-tecnica.md`, punto 2).

### ✅ Corregido (2026-08-28) — Migrado a `html\`\``: campo `p.quien` sin escapar en el reparto del extra

*(sesión posterior, tercero y último de los tres módulos que quedaban)*

Convertidos todos los puntos de renderizado con texto libre: `_renderPrestSplit()`/`_updatePrestSplitResumen()` (split de fuente del préstamo, incl. aviso de impacto en cajitas), `renderDeudoresList()`, `abrirDeudor()` (historial completo de "Me deben", con agrupamiento por `grupoId` en acordeón — la función más grande del módulo), `_initMovGrupoSelector()`, el selector de encargo y el de cuenta del encargo en el flujo de abono, `abonoRenderSplit()`, `extRenderPartes()`/`extResumenPartes()` (reparto del extra: guardar/gastar/regalar), `renderMisDeudasList()`, `abrirMiDeuda()` (historial de "Yo debo"), los dos selects "Sin especificar" y `abrirSheetPrestamoTC()`/`_abonoEncCuentaSplitPreview()`. Sin shadowing de `let html=''` esta vez — primera vez que no se repite ese hallazgo puntual desde que empezó a aparecer en Mesada.

**Hallazgo real, en `extRenderPartes()`:** el campo `p.quien` ("¿A quién?" del reparto "regalar" del extra de un abono) se interpolaba en `value="${p.quien||''}"` sin ningún escapado — ni siquiera `escHtml()` manual, a diferencia de su hermano `p.desc` (reparto "gastar"), que sí estaba cubierto desde el barrido original. Duodécimo campo nuevo que reincide en este patrón. Cerrado al migrar.

**Doble-escapado en `desc:`/`nota:` horneados — resuelto (2026-08-28, sesión posterior), misma familia que Encargos:** varios `desc:`/`nota:` que este módulo escribe en movimientos de *otras* cuentas (`cuentas.js`, `encargos.js`, `S.tcMovimientos`) venían con `escHtml(d.nombre)`/`escHtml(enc.nombre)`/`escHtml(tc.nombre)` horneado al guardarse; como esos módulos escapan en su capa de render (`html\`\``), quedaban doble-escapados si el nombre tenía `&`/comillas. Corregidos los 13 sitios identificados (`confirmarMovimiento()` — abono simple, split y destino; `confirmarMovMiDeuda()` — recibido y pagado; `confirmarPrestamoTC()` — nota del préstamo y `S.tcMovimientos`; el "extra" repartido a gasto/ingreso/guardado), junto con los 8 sitios equivalentes de `encargos.js` en la misma sesión — ver `changelog/encargos.md`.

Validado con `node --check` y una simulación (implementación real de `html`/`raw`/`escHtml`, sin DOM) con payloads maliciosos en el campo `p.quien` recién cerrado, el nombre de deudor (texto y atributo `title`), la `nota` de un movimiento dentro del agrupamiento por grupo (confirma que el join de fragmentos `html\`\`` ya escapados vía `raw()` no dobla el escapado del badge `_fuenteLabelHtml()` anidado), y el `opts` de `_renderPrestSplit()` (string pre-escapado a mano envuelto en `raw()`, confirma que no se re-escapa). Los cuatro casos pasaron. **Sin prueba en navegador real.**

Con esto quedan migrados a `html\`\`` los tres módulos que faltaban (Encargos, Cuentas, Préstamos) — todos los módulos con `.js` propio están migrados.

### 🔄 Cambiado (2026-09-07) — El balde por defecto de grupos de préstamo ya no es "Préstamo `<fecha>`" sino "Histórico", y nunca se cierra solo

*(reportado por el usuario: le apareció un grupo/acordeón en el historial de "Madre" sin haberlo creado a propósito)*

Causa: un deudor sin grupos abiertos (`_gruposAbiertos(d).length === 0`) disparaba `_autoGrupoIdMov()` → `_crearGrupoDeudor(d, fecha)`, que crea un grupo nuevo con nombre autogenerado `"Préstamo " + fecha`. Eso pasa cada vez que el único grupo existente llega a saldo $0 y `_autoCerrarGruposEnCero()` lo cierra solo — el siguiente préstamo que se registre, aunque el usuario no toque el checkbox "🆕 Es un préstamo aparte", cae en "0 grupos abiertos" y arranca uno nuevo sin preguntar. Es el comportamiento que documentaba §2.4 de `prestado.md` ("0 grupos abiertos → se crea uno automático, sin preguntar"), pero en la práctica sorprende: el usuario nunca pidió separar nada, solo quería que el préstamo nuevo siguiera en el mismo historial de siempre.

Fix: nuevo helper `_getOrCrearHistorico(d, fecha)` (reemplaza la creación inline que solo vivía en `_migrarGruposDeudor`). `_autoGrupoIdMov()` ahora usa ese helper en el caso de 0 grupos abiertos en vez de `_crearGrupoDeudor` — el balde por defecto pasa a ser siempre "Histórico" (mismo grupo que ya se usaba para migrar deudores viejos), nunca uno con nombre de fecha. Y `_autoCerrarGruposEnCero()` ahora excluye explícitamente `id === '_historico'` de su lógica de auto-cierre, así que ese grupo nunca se cierra solo aunque su saldo llegue a $0 — se queda contando como "1 grupo abierto" para siempre.

Efecto práctico: mientras el usuario no marque a propósito el checkbox "🆕 Es un préstamo aparte" (o use el selector cuando ya hay ≥2 grupos), **todo** cae en Histórico sin acordeón — igual que el historial plano de antes de que existieran los grupos —, sin importar cuántas veces el saldo pase por $0. Solo se crea un grupo nuevo cuando el usuario lo pide explícitamente.

**No se migraron los datos existentes** — el usuario decidió no fusionar retroactivamente los grupos con nombre de fecha ya creados en "Hermanito" y "Madre" (ver backup del 2026-09-07); esos dos deudores se quedan con su acordeón actual, el fix solo aplica a movimientos nuevos de ahí en adelante.

Validado con `node --check`. **Sin verificar en navegador real.**

### 🐛 Corregido (2026-09-04) — "Préstamo con TC" dejaba guardar un monto mayor al cupo disponible de la tarjeta

*(reportado por el usuario: podía registrar el préstamo aunque la tarjeta no tuviera cupo disponible, y el mismo problema aparecía usando "el valor real era diferente")*

`confirmarPrestamoTC()` nunca validaba cupo disponible antes de sumar `montoTC` a `tc.deuda` — a diferencia de `confirmarCompraTC()` (Tarjetas de crédito), que sí lo hace siempre. El segundo síntoma reportado (usando el diferencial) tenía la misma causa: como no había ninguna validación de cupo, daba igual si el monto que finalmente cargaba la tarjeta era el nominal o el "valor real" calculado por `diffCalcular('prtc')`.

Fix: se agregó `if (tc.cupo && tcCupoDisponible(tc) < montoTC) { toast(...); return; }` justo después de calcular `montoTC` (antes de tocar `d.movimientos`, `tc.deuda` o `S.tcMovimientos`) — mismo patrón que `tarjetas_credito.js:confirmarCompraTC`. Se validó contra `montoTC` (lo que realmente carga la tarjeta) y no contra `dijo` (lo que se le dijo al deudor) a propósito, para que la validación no se salte cuando hay diferencial activo. Distinto del caso de "Compra con TC" de Encargos (`confirmarCompraConTC`), que sigue sin validar cupo — ver `tarjetas-credito.md` para por qué ahí sí se justifica no validar (cargo bancario/de terceros) y acá no (decisión de gasto propia). Validado con `node --check`. **Sin verificar en navegador real.**

---
