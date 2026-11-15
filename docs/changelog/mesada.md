# Historial: Mesada

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Mesada

### 🔧 Refactor (2026-10-08) — Mesada se ordena en reglas (Parte 1) y pantalla (Parte 2) dentro de `mesada.js`; una sola versión de cada operación

**Antes:** `mesada.js` (1.126 líneas) mezclaba DOM y reglas de negocio, y repetía en tres sitios (pago original, abonos del pendiente y "deshacer abono") la misma secuencia: crear la salida del encargo, sumar a la cuenta + movimiento espejo, y revertirlo. Además tenía dos copias del widget "pagó con plata de un encargo" (prefijos `mp` y `mpp`): `_poblarMpEncargoCuentas`/`_poblarMppEncargoCuentas` y `_sincronizarMpDestinoConEncargo`/`_sincronizarMppDestinoConEncargo` eran idénticas salvo el id del DOM (comprobado con `diff`), y el cálculo de "disponible en el encargo" estaba escrito 4 veces.

**Ahora:**
- Parte 1 de `mesada.js` (reglas, sin DOM): `mesadaRegistrarPago`, `mesadaAbonarPendiente`, `mesadaMarcarPendiente`, `mesadaBorrarPago`, `mesadaDeshacerAbono`, `mesadaResumenAnio` (todo lo que pinta la pantalla, calculado una vez). Las operaciones **validan todo antes de mutar** y devuelven `{ok, motivo}`.
- `mesadaAbonosDe(info)` ve cada mes como `[pago original, ...abonos]` con la misma forma, **sin migrar lo guardado** (no se tocó el modelo de datos ni Firestore). Con eso, revertir es una sola función (`mesadaRevertirAbono`) en vez de tres copias.
- `_mesadaEntrar`/`_mesadaSacar` fusionan "sumar/restar saldo + espejo" (15 sitios) y reemplazan a los wrappers `_registrarMovSecundarioMesada`/`_borrarMovSecundarioMesada`. Se descartó simplemente inlinear los wrappers: habría repetido `flujo:'entrada', origen:'Mesada'` 15 veces sin quitar la duplicación real.
- Parte 2 de `mesada.js` (pantalla, que solo usa la API de la Parte 1): `_crearEncargoPicker(prefijo)` (una instancia por sheet, mismo patrón que `crearSplitWidget`) reemplaza las dos copias del widget; el wiring pasa a tablas (`_msCablear`); `renderMesada()` solo pinta lo que calcula `mesadaResumenAnio()`.
- **Un solo archivo.** Se probó separarlo en `mesada-dominio.js` + `mesada.js` y se descartó: cada grupo lazy de la app es un único archivo y la separación no justificaba una excepción ni una dependencia de orden de carga. `Loader.GROUPS.mesada` queda `['js/modules/mesada.js']`.

**Cómo se verificó:** `tests/mesada-reglas.test.js` (38 tests) y `tests/mesada-ui.test.js` (9 tests) + los 10 existentes de `calcPatrimonioTotal`: 57 en total. Además, antes de reemplazar el archivo se ejecutó el código **viejo** y el nuevo sobre el mismo estado y se comparó `S` completo: 9 escenarios de borrado, 8 de registro (incluido `confirmarMesadaPago` real con un DOM simulado) y 5 de abono: idénticos, salvo los bugs de abajo. Esas pruebas de paridad fueron un script de una sola vez (necesitaban el archivo viejo), no quedaron en el repo. Se comprobó por mutación que las regresiones fallan si se reintroduce cada bug.

**Cambios visibles (a propósito):** los dos previews de "dividido" ahora dicen igual `· Todo distribuido` (antes el flujo sin encargo omitía el `·`); el aviso de "dividido supera el monto" ahora aparece **antes** de tocar el encargo; los textos de `mesada.js` pasan a tuteo (ver `#sheets--ui`, 2026-10-07: `mesada.js` no había sido revisado). `_movSecId: null` ya no se guarda cuando no hay cuenta (nada lo leía fuera de Mesada).

### ✅ Corregido (2026-10-08) — Pago con encargo + dividido que se pasaba del monto dejaba la salida descontada del encargo

`confirmarMesadaPago` agregaba la salida al encargo **antes** de validar `totalSplit > monto`. Si la validación fallaba, el `return` dejaba la salida en `enc.movimientos` sin pago de mesada, y al corregir y confirmar de nuevo se descontaba por segunda vez (cualquier `save()` intermedio lo persistía). Ahora el dominio valida encargo y split antes de crear nada. Test: `REGRESIÓN bug 1`.

### ✅ Corregido (2026-10-08) — Borrar un pago pagado con encargo no devolvía la plata a la cuenta si la salida del encargo ya no existía

La reversión leía el monto a devolver del movimiento del encargo; sin ese movimiento el monto quedaba en 0, no se descontaba nada de la cuenta destino y **sí** se borraba el espejo: saldo inflado y sin rastro. Era alcanzable porque `deleteMovEncargo` no distinguía las salidas creadas por Mesada y se podían borrar a mano desde Encargos (lo que además devolvía la plata al encargo mientras Mesada seguía contándola). Ahora (a) la reversión usa el monto guardado en el abono y (b) Encargos bloquea ese borrado (ver `#encargos`). Misma causa en el bucle de `pendienteHistorial` y en `deshacerPendienteMesada`. Test: `REGRESIÓN bug 2`.

### ✅ Corregido (2026-10-08) — Nombre del encargo sin escapar en dos `toast()`

"Ahí solo hay $X guardados de «nombre»" (`confirmarMesadaPago` y `confirmarPendienteMesada`) concatenaba `enc.nombre` (texto libre, sincronizado a toda la familia por Firebase) en un `toast()` que inserta con `innerHTML`. Ahora pasa por `escHtml()` en `_mesadaMostrarError`. Test: `REGRESIÓN bug 3`.

### ✅ Corregido (2026-10-08) — Protección por antigüedad: cuentas de los abonos y etiqueta vacía

`_mesadaFuentesDe` solo miraba el pago original, no las cuentas de los abonos del pendiente. Si el original fue "no especificar" y un abono fue a Nequi, `_mesadaTieneCuentaAfectada` daba `true` pero `fuentes` quedaba vacío, y el aviso de nivel "viejo" llamaba `fuenteLabel(undefined)`. Ahora `mesadaFuentesDe` incluye todos los abonos y, si solo hay encargos, la etiqueta es "Encargos". **No se cambió** a propósito qué fecha se usa para medir la antigüedad (la del pago original).

### 🔧 Cambio (2026-10-08) — El match de encargos por nombre ahora es por palabra completa (se probó un vínculo con persona y se quitó)

`mesadaEncargosDelParent` buscaba con `includes` sobre el nombre del encargo: "papayera" coincidía con papá. Ahora compara por **palabra completa o su plural** (papá, papi, papito, padre; mamá, mami, mamita, madre; sin tildes ni mayúsculas). Limitaciones que quedan: "Papas" (comida) sigue coincidiendo con "Papás", y un encargo con otro nombre ("Carlos") no aparece; la solución es renombrar el encargo. El modo por nombre ya estaba documentado como decisión de diseño (`mesada.md` §8), así que no se trató como bug.

**Probado y descartado:** un vínculo opcional `S.mesadas[parent].personaId` (enlace "Vincular a una persona" en cada tarjeta) para ofrecer los encargos de esa persona sin depender del nombre. Se quitó antes de desplegar por no hacer falta (el costo es una pantalla más y un dato más que mantener). Si algún día hace falta, la lógica era: con vínculo, `e.personaId === personaId`; sin vínculo, por nombre; y un vínculo a una persona eliminada se ignora.

### 🔧 Cambio (2026-10-08) — Los previews de los sheets de Mesada no ocupan lugar cuando están vacíos

`#mpPreview` y `#mppPreview` (clase `.ms-preview`) reservaban `min-height:18px` + margen aunque no tuvieran texto, dejando un hueco en el sheet. Ahora `.ms-preview:empty{display:none}`: el JS los vacía con `textContent = ''`, y al escribir un mensaje reaparecen. Efecto secundario: al aparecer el primer mensaje el contenido de abajo baja unos píxeles (antes el espacio estaba reservado).

### 🔧 Cambio (2026-10-08) — Estilos inline de Mesada pasan a clases (`.ms-*` en `styles.css`) y se renombra `mesadaMonteMama`

La pantalla principal (las tarjetas de papá y mamá repetían el mismo bloque de estilos), los dos sheets (`index.html`) y la template de `abrirDetalleMesada()` repetían estilos inline (el bloque de encargo estaba duplicado entero). Ahora son clases `.ms-*` con los mismos valores; en `index.html` solo quedan los `style="display:none;"` iniciales, que el JS alterna con `style.display`; el botón ámbar de "marcar pendiente" quedó en `.12` de opacidad (antes `.10` en un lugar y `.12` en otro). El id `mesadaMonteMama` (typo) pasa a `mesadaMontoMama` en `index.html`, `core-state.js` y `mesada.js`. Se eliminó `_mostrarSeccionDestinoNormal(mostrar)`/`_mostrarMppDestinoNormal(mostrar)`: solo se llamaban con `true` y su selector `#sheet-mesada-pago .field-header` dependía del orden del DOM. También se eliminó `mpMesNombre` (variable sin uso) y se reemplazó el reseteo manual del widget de dividir por `splitReset('mp')`.

### 🔧 Cambio (2026-09-21) — Documentación de "pagar con plata de un encargo" y limpieza de comentarios

`mesada.md` no documentaba el flujo "Me pagó con plata de un encargo" (sheets `mpUsarEncargo`/`mppUsarEncargo`, campo `origenEncargo`), presente en `mesada.js` desde antes: se agregó a §2, §3, §4 (modelo de datos), §5 (flujos) y §6 (casos especiales). También se documentó la protección por antigüedad al borrar un pago (ya implementada, sin mencionar). Se quitaron fechas y referencias a la migración a módulos separados que ya no aportan (el archivo en sí ya dice dónde vive el código). `mesada.js`: limpieza de comentarios (sin cambios de código) que fechaban decisiones ya asentadas.

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

### ✅ Corregido — 3 sitios de `fuenteLabel()` sin escapar en `.innerHTML`

*(2026-07-17, durante la migración a `data-action`, antes de `html\`\``)*

Al migrar Mesada como segundo módulo completo se repitió el mismo patrón ya visto con Spotify: `fuenteLabel()` devuelve el nombre de una cajita/cuenta personalizada (texto libre) sin escapar. Corregidos 3 sitios en `abrirDetalleMesada()` con `escHtml()`. También aparecieron 2 controles estáticos con `onclick`/`onchange` inline que no vivían en las plantillas del módulo (quedaban fuera del barrido automático por nombre de función) — mismo hallazgo de infraestructura que se repitió después en TC y Cuentas.

### ✅ Corregido — Migrado a `html\`\``: 11 sitios convertidos, sombra de variable y doble escapado corregidos

*(2026-08-25, primero de los diez módulos que quedaban pendientes de esta migración)*

Los 11 `escHtml()` del archivo (dos pares de selectores de cuenta del encargo en `_poblarMpEncargoCuentas()`/`_poblarMppEncargoCuentas()`, dos selectores de encargo en `abrirRegistrarMesada()`/`abrirResolverPendiente()`, y seis sitios en `abrirDetalleMesada()`: nombre del encargo origen, `fuenteLabel()` del destino, `fuenteLabel()` de cada split, el historial de pendientes con nombre/fuente/nota, y la nota del pago) migrados a `html\`\``.

Dos hallazgos reales, no solo de estilo:

1. **Sombra de variable:** `abrirDetalleMesada()` tenía `let html=...` para el string final antes de asignarlo a `innerHTML` — tapaba la función global `html\`\`` dentro de esa misma función (con `let`, además, hubiera roto en tiempo de ejecución por temporal dead zone si se llamaba `html\`\`` antes de esa línea). Renombrada a `contenido`.
2. **Doble escapado** en los dos bloques con fragmentos anidados (`info.splits.map(...)` y `info.pendienteHistorial.map(...)`, cada uno con `.join('')`): al interpolar el resultado de `.join('')` directo en el `html\`\`` exterior sin `raw()`, el HTML ya escapado de cada fragmento interno se volvía a escapar. Distinto del patrón de `inicio.js`/`analisis.js` (arrays de fragmentos sin `.join('')`, que el propio `html\`\`` exterior sabe concatenar sin re-escapar) — acá, al forzar la conversión a string a mano con `.join('')`, hace falta envolver ese resultado en `raw()` explícito antes de interpolarlo. Lo agarró una simulación jsdom con payloads maliciosos en los 6 campos de texto libre, no una revisión visual del código.

`fuenteBadgeClass(...)` (nombre de clase CSS fijo, no texto de usuario) se envolvió en `raw()` en los atributos `class`, mismo criterio que un valor CSS fijo tipo `var(--red)`. Validado con `node --check` y jsdom (2 casos: pago con encargo/destino simple, y pago con splits — ambos con `<script>`, `<img onerror>` y comillas dobles en los campos libres): todo queda escapado una sola vez, sin ejecutar nada, con los `data-action` de los botones intactos vía `raw(Events.attr(...))`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-01) — Protección por antigüedad se activaba en pagos "Sin especificar" que no movían ningún saldo

Reportado por el usuario: al borrar un pago de mesada con destino "Sin especificar", aparecía el aviso de "Movimiento antiguo" mencionando que se afectaría el saldo de "Sin especificar" — cuando ese destino, por definición, no está ligado a ninguna cuenta real.

Causa: `_mesadaFuentesDe(info)` ya devolvía `[]` cuando no había `destino` (dejando `opsPosteriores` en 0 correctamente vía `_mesadaOpsPosteriores`), pero `eliminarMesadaPago()` calculaba el nivel de antigüedad igual, sin verificar antes si había algo que proteger. Como `nivelAntiguedadMovimiento()` decide por fecha **o** por operaciones posteriores (basta uno), un pago viejo por fecha caía en "viejo"/"bloqueado" aunque `_borrarMesadaPago()` no fuera a tocar ningún saldo real — contradice directamente la sección 6 del doc de protección ("no se advierte nada sobre movimientos que no muevan dinero").

Fix: nueva `_mesadaTieneCuentaAfectada(info)` que verifica si hay algo real que revertir (`destino`, `splits`, `origenEncargo`, o algún abono del `pendienteHistorial` con su propio destino/origenEncargo) — la protección solo se evalúa si esto da `true`. Aplicado en los dos puntos de entrada que tenían la lógica duplicada: `eliminarMesadaPago()` (`mesada.js`) y la rama `movTipoEl === 'mesada'` de `eliminarMovimiento()` (`movimientos.js`).

**Mismo bug encontrado en Préstamos (`prestado.js`), en 3 sitios** — mismo patrón: "Sin especificar" (abonos) y "Ganancia" (préstamos, que explícitamente no mueve plata) dejaban `opsPosteriores=0` pero el criterio de fecha igual disparaba el aviso sin que nada fuera a revertirse.

- `eliminarMovDeudor()` (préstamos dados y abonos recibidos) y su duplicado en `movimientos.js` (rama `'prestamo'`/`'abono'`): nueva `_deudorTieneCuentaAfectada(m)`, más completa que un simple chequeo de `destino`/`fuente` porque un abono/préstamo también puede afectar algo real vía Alcancía (`_viaAlcancia`), TC (`_viaTC`) o un encargo (`_viaEncargo`) sin que `destino`/`fuente` estén seteados — y porque `'ganancia'` como fuente de un préstamo es una cadena truthy pero explícitamente no representa una cuenta real, así que se excluye a propósito.
- `eliminarMovMiDeuda()` ("Yo debo"): nueva `_miDeudaTieneCuentaAfectada(m)`, más simple (un `recibido` sin `destino` o un `pago` sin `fuente` no mueven nada).

**Encargos (`encargos.js`) se revisó y no tenía este bug** — ahí, a diferencia de Mesada/Préstamos, borrar un movimiento *siempre* cambia el balance del encargo mismo (`enc.movimientos.filter(...)`), sin importar si tiene o no una `cuenta` externa asociada. El encargo actúa como su propia "cuenta", así que sí hay algo real que proteger aunque `mov.cuenta` esté vacío — y el diálogo ya está redactado en consecuencia (menciona "este encargo" en vez de inventar un nombre de cuenta cuando `mov.cuenta` no existe).

Validado con `node --check` en los tres archivos tocados (`mesada.js`, `movimientos.js`, `prestado.js`).

### ✅ Corregido (2026-08-30) — Pago de mesada con destino real aparecía DOS VECES en el historial de la cuenta (`cuentas.js`)

Reportado por el usuario con un caso real: registró la mesada de mamá en Nequi y vio el pago repetido — uno con candado y "Automático" (el correcto), y otro sin ningún ícono, con la descripción genérica "Mesada de Mamá" (sin acento en el archivo fuente).

Causa: `getMovimientosCuenta()` en `cuentas.js` tenía un bloque adicional ("Mesadas recibidas en esta cuenta") que leía `S.mesadas` directamente y sintetizaba su propio movimiento por cada pago con `destino`/`splits` reales — **en paralelo** al movimiento espejo real que `mesada.js` ya genera y guarda en `S.movimientos` vía `_registrarMovSecundarioMesada()` (con `_secundario:true` y su propio `id`, que el loop principal de esa misma función ya recorre). El comentario que acompañaba al bloque explicaba por qué tenía un guard contra `ReferenceError`, pero no por qué el bloque seguía existiendo — todo indica que es código previo a que mesada.js tuviera su propio sistema de movimiento espejo (ver más arriba, "Mesada no dejaba rastro en las cuentas destino"), que nunca se retiró cuando ese sistema se agregó.

Afectaba a **todo** pago de mesada con cuenta destino real (no a "No especificar / lo gasté", que no genera ningún movimiento en ninguno de los dos códigos). No duplicaba el saldo real de la cuenta (eso se actualiza en un solo punto en `mesada.js`), solo la lista de movimientos mostrada — pero cualquier cálculo que dependa de esa lista (por ejemplo, la reconstrucción de "Antes/Después" al abrir el detalle de un movimiento) quedaba corrompido por el doble conteo.

Fix: se eliminó el bloque completo. Validado con `node --check`.

### ✅ Corregido (2026-09-04) — El fix de "la cuota heredada se congelaba" tenía un hueco: no verificaba si la pantalla Mesada estaba abierta

Reportado por el usuario: exportando el backup, la cuota de papá para 2026 aparecía como `9.3` en vez de un monto real — un valor que coincide con la tasa EA de Nu (`nuTasaGlobal`), no con nada que tenga sentido como cuota mensual.

El fix de más arriba ("La cuota heredada se congelaba con cualquier `save()` de la app") resolvió el caso de que el valor coincidiera con el heredado, pero dejó un hueco distinto: `mesadaMontoPapa`/`mesadaMonteMama` son inputs **estáticos**, presentes en el DOM aunque la pantalla Mesada no esté abierta. `save()` los seguía leyendo y comparando contra `_getCuotaAnio` sin importar qué pantalla estuviera activa — así que si por lo que sea (autocompletado del navegador, tecleo accidental, o cualquier otro origen no confirmado) esos inputs llegaban a tener un valor distinto al heredado en algún momento, el próximo `save()` disparado desde **cualquier parte de la app** —ni siquiera relacionado con Mesada— lo grababa como cuota explícita de ese año. `refresh()` ya tenía el guard correcto (`screen-mesada.classList.contains('active')`) antes de llamar `renderMesada()`; `save()` nunca lo replicó para estos dos inputs.

No se pudo confirmar contra el código el origen exacto del valor `9.3` en el caso reportado (ninguno de los archivos revisados —`money-input.js`, `calc-helpers.js`, `core-state.js`— escribe el valor de `nuTasaGlobal` en los inputs de mesada) — el fix cierra el mecanismo que lo hace *permanente*, no necesariamente lo que lo originó.

Fix: agregado el mismo guard de pantalla activa que ya usa `refresh()`, como condición extra en el `if` de `save()` que ya comparaba contra `_getCuotaAnio`. Validado con `node --check`.

---
