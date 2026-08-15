# CHANGELOG — mis-finanzas

Historial de bugs corregidos, código eliminado por diseño y decisiones de limpieza, por módulo. La documentación de cada módulo (`mesada.md`, `spotify.md`, etc.) se enfoca en cómo funciona *hoy*; el detalle de qué estaba mal antes y cómo se arregló vive acá, para no inflar los documentos principales.

---

## Infraestructura / seguridad

### ✅ Corregido — Dos bugs reales de arranque encontrados al volver lazy `spotify`/`prestado`/`cuentas`/`analisis`/`encargos`

*(ronda de modularización por pantalla — séptimo a undécimo grupo lazy, ver `auditoria-tecnica.md` #4)*

Al auditar los 5 módulos que quedaban para completar la modularización por pantalla, aparecieron dos bugs reales (no solo hallazgos hipotéticos) del mismo tipo ya visto con `tarjetas_credito`/`actividad_reciente`: código que asumía que un evento de arranque (`DOMContentLoaded`) todavía no había disparado.

1. **`spotify.js`** — el monkey-patch de `openSheet()` que inyecta los sheets de Personas al abrir "Agregar"/"Editar" en Spotify estaba envuelto en un listener `DOMContentLoaded`. Con `spotify.js` cargando bajo demanda, ese evento ya pasó para cuando el archivo llega a existir — el listener nunca se habría disparado. Corregido: desenvuelto a nivel superior (seguro, `openSheet` es núcleo y siempre carga eager antes que cualquier módulo lazy).
2. **`sheet-stack.js` (núcleo) — el más serio de los dos:** dos puntos referenciaban globales de `prestado.js`/`spotify.js` sin ningún guard, y corrían en cada llamada a funciones núcleo, no solo al entrar a una pantalla específica:
   - El bloque de reset de Préstamos dentro de `showScreen()` (`deudorActualId`/`miDeudaActualId`/`prestamosTabActiva`) corre en **cada** navegación a cualquier pantalla (`name!=='prestamos'`, no `name==='prestamos'`). Sin guard, habría roto la navegación de toda la app la primera vez que alguien abriera Inicio sin haber visitado antes Préstamos.
   - La captura de `addSpotify` dentro de `_injectErrorSpans()` corre una sola vez, en el arranque. Sin guard, `addSpotify` (identificador no declarado con `spotify.js` todavía sin cargar) tira `ReferenceError` y aborta el resto del bootstrap.

   Ambos corregidos con guard `typeof`. Efecto secundario aceptado: la validación inline extra de Spotify ("El nombre es obligatorio") no aplica hasta la primera visita a esa pantalla — mismo tipo de degradación ya aceptada para el hint de `mostrarAlertaFuente` con `tarjetas_credito`.

Limpieza de paso: un listener `DOMContentLoaded` vacío en `encargos.js` (no hacía nada) se eliminó.

### ✨ Agregado — `spotify`, `prestamos`, `cuentas`, `analisis` y `encargos` pasan a ser grupos lazy

Se agregaron a `Loader.GROUPS` (`js/core/lazy-loader.js`) como séptimo a undécimo grupo, y se sacaron sus `<script src>` eager de `index.html`. Se agregaron las ramas `if(name==='spotify')`/`if(name==='prestamos')` en `showScreen()` (`sheet-stack.js`) para re-renderizar al entrar — `cuentas`/`encargos`/`analisis` ya tenían la suya desde antes de esta ronda. Ninguno necesitó copiar/inyectar HTML nuevo.

### 🚨 Corregido (urgente) — `cuentas` revertido a eager: rompía el arranque en navegador real

Al probar en navegador real la ronda de arriba, `cuentas.js` como grupo lazy reventó el arranque con 3 `ReferenceError` encadenados:

```
firebase-sync.js:54  Uncaught ReferenceError: _renderTasaHistorialTag is not defined
core-state.js:939    Uncaught ReferenceError: nuTotal is not defined
core-state.js:490    Uncaught ReferenceError: getNuTasaGlobal is not defined
```

Las tres son del subsistema de Nu, definido dentro de `cuentas.js`, llamadas sin guard `typeof` desde `core-state.js` (`save()`), `firebase-sync.js` (`_initAppUI()`) y la cadena de `refresh()` (`mejoras.js`→`gastos-fijos-progress.js`→`pin-bio.js`→`inicio.js`). Estos 5 archivos núcleo nunca se auditaron contra el cambio — no se recibieron en la sesión que hizo lazy este grupo, a diferencia de `sheet-stack.js`/`inicio.js`, que sí se revisaron esa misma sesión (ver entrada de arriba).

Fix: `cuentas.js` vuelve a `<script src>` eager en `index.html`, se saca de `Loader.GROUPS`. Corrección menor de paso: `_checkGastoAlto()` en `inicio.js` llamaba `nuTotal()` también sin guard — se le agregó `typeof` como red de seguridad.

**Pendiente para poder reintentar `cuentas` como lazy:** conseguir y auditar `core-state.js`, `firebase-sync.js`, `mejoras.js`, `gastos-fijos-progress.js` y `pin-bio.js`, y guardar cada llamada al subsistema de Nu. `spotify`/`prestamos`/`encargos`/`analisis` no reportaron errores en esta misma prueba y se mantienen lazy, con la reserva de que el mismo tipo de miss podría repetirse si alguno de esos 5 archivos también los llama sin guard.

### ✅ Corregido — `cuentas` reactivado como grupo lazy (mismo día, segundo intento)

Se recibieron y auditaron los 5 archivos núcleo pendientes. Se buscó, uno por uno, cada función que `cuentas.js` expone (no solo las 3 del error original) en los 5 archivos:

- **`core-state.js`:** `calcC`, `calcCDT`, `nuTotal`, `getNuTasaGlobal`, `materializarIntereses`, `renderDetalleCuenta`, `renderCustomCuentasList`, `renderMovsCustom`, `renderCajitas` — las 9 con guard `typeof`, incluidos los helpers `_calcCSafe()`/`_calcCDTSafe()`/`_nuTotalSafe()`/`_getNuTasaGlobalSafe()` con fallback razonable.
- **`firebase-sync.js`:** `_renderTasaHistorialTag`, `registrarTasaNuHistorial`, `calcC`, `materializarIntereses`, `verificarVencimientosCDT` — las 5 con guard `typeof`, en `_initAppUI()`.
- **`pin-bio.js`/`mejoras.js`/`gastos-fijos-progress.js`:** cero referencias a `cuentas.js`.

`cuentas.js` vuelve a `Loader.GROUPS`, se saca su `<script src>` eager de `index.html`. **Con esto, los 11 candidatos originales quedan cerrados** — esta vez confirmado contra el código real de los 5 archivos que faltaban. Falta la prueba en navegador real de este segundo intento.

### ✅ Corregido — `guardarEditarSpotify` podía quedar sin conectar en `encargos.js` (bug de guard `typeof` vs. referencia diferida)

*(2026-08-14, encontrado al auditar `encargos.js` contra `auditoria-tecnica.md` — la corrección original del 2026-08-13 nunca se había documentado)*

El wiring de `btn-guardar-editar-spotify` (sheet "Editar pago de Spotify", dentro de Encargos) usaba `if (btn && typeof guardarEditarSpotify === 'function') btn.addEventListener(...)`. Con `encargos` y `spotify` como grupos lazy independientes que pueden cargar en cualquier orden (más con `Loader.ensureAll()` pidiéndolos en paralelo), si `encargos.js` corría su wiring antes de que `spotify.js` terminara de cargar, el `if` daba falso y **el listener nunca se conectaba** — ni siquiera después, cuando `spotify.js` sí llegaba a cargar. El botón quedaba muerto en silencio para el resto de esa carga de página, sin `ReferenceError` ni ningún otro aviso visible.

Fix: se reemplazó el guard por la misma referencia diferida (`() => guardarEditarSpotify()`) que ya usa `crearEncargo` dos líneas arriba en el mismo archivo — el listener siempre se conecta, y recién al click se resuelve la función. Verificado con `node --check`. **Falta prueba en navegador real:** entrar a Encargos sin haber visitado Spotify antes y confirmar que "Guardar" en ese sheet funciona.

### ✅ Corregido — `buildFuentesOptsHtml()` interpolaba `f.label`/`val` sin escapar

*(2026-08-14, cierra el hallazgo pendiente anotado en `auditoria-tecnica.md` desde el 2026-07-20)*

Función núcleo compartida por toda la app para poblar selectores de cuenta (`<option>`s de Gastos, Encargos, Préstamos, pago de TC, etc.). `f.label` (nombre de cajita/cuenta personalizada, texto libre editable por el usuario) se interpolaba directo en el HTML del `<option>` sin pasar por `escHtml()` — mismo patrón de XSS ya corregido puntualmente en 8 módulos distintos, pero nunca en esta función núcleo por no querer tocar código compartido fuera del alcance de cada sesión.

Fix: `f.label` y `val` (este último por las dudas, va dentro de un atributo con comillas dobles) ahora pasan por `escHtml()` en `core-state.js`, línea ~50. `escHtml()` ya existía en el archivo (línea 168), no hizo falta crearla. Verificado con `node --check`. **Falta prueba visual en navegador real** de que los selectores que usan esta función (Gastos, Encargos, Préstamos, TC) siguen viéndose bien.

### ✅ Corregido — `js/core/async-css.js` sin `defer`, bloqueaba el render

*(2026-08-14, cierra el hallazgo pendiente anotado el 2026-07-16/2026-08-14 en `auditoria-tecnica.md`, tabla de advertencias)*

Reportado por Lighthouse: el `<script src="js/core/async-css.js">` corría como script clásico (sin `defer`/`async`), bloqueando el parser un instante en cada carga — irónico, ya que el trabajo del propio archivo es volver no-bloqueante el resto del CSS (Font Awesome, Google Fonts, `styles.css`). No se había tocado antes por no tener el archivo en mano para confirmar que `defer` no rompía el truco `media="print"→"all"`.

Con el archivo en mano, se confirmó que la dependencia real es de **orden en el documento** (los `<link data-async-css>` tienen que estar arriba en el DOM para que el `querySelectorAll` de `async-css.js` los encuentre), no de *timing* de ejecución — agregar `defer` no cambia el orden del DOM, solo cuándo corre el script. Los dos escenarios posibles ya estaban cubiertos por el propio archivo desde antes: si corre antes de que el CSS termine de bajar, el listener `'load'` se engancha a tiempo; si corre después (más probable ahora), el fallback `if (link.sheet) link.media='all'` ya detecta que terminó sin esperar el evento — y `.sheet` no requiere CORS, así que funciona igual con recursos de origen cruzado (cdnjs, fonts.googleapis).

Fix: `defer` agregado al `<script>` en `index.html`; comentarios de esa sección y del propio `async-css.js` actualizados para no seguir diciendo "sin defer/async". Verificado: comentarios HTML balanceados (233/233) y `<head>`/`</head>`/`<body>`/`</body>` balanceados (1/1 cada uno, contando solo fuera de comentarios) en `index.html`; `node --check` sin errores en `async-css.js`. **Falta prueba visual en navegador real** de que no haya FOUC de Font Awesome/Google Fonts/`styles.css` con el nuevo timing.

## Encargos

### ✅ Corregido — "Prestar lo que falta" registraba el préstamo aunque la cuenta propia elegida no tuviera esa plata

*(2026-08-13)*

Al agregar la opción "Prestar lo que falta" (salida de un encargo por más de lo disponible: se retira lo que hay y el resto queda como préstamo aparte en "Me deben"), el paso 2 llamaba `descontarFuente(fuentePrestamo, faltante)` directamente, sin validar antes si esa cuenta realmente tenía el monto. `descontarFuente()` no hace esa validación por sí sola — solo resta —, así que el préstamo se registraba igual aunque la cuenta quedara en negativo. Escenario concreto: encargo con $80.000 disponibles, salida pedida de $100.000 (faltan $20.000), se elige Nequi para prestar esos $20.000 aunque Nequi solo tuviera $5.000 reales — el préstamo se guardaba de todas formas.

Fix: se agregó la misma validación que ya usa "Yo puse la plata" (`_validarMovEncMia`) — `getSaldoFuente(fuentePrestamo)` contra el monto a prestar, antes de escribir cualquier dato. Si no alcanza, se avisa con el saldo real disponible y no se registra nada, ni la salida del encargo ni el préstamo (todo o nada, ver `encargos.md` §3). Se agregó además un hint en vivo bajo el selector de cuenta (`_movEncFaltanteCuentaHint`) que avisa antes de intentar confirmar.

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

## Salud financiera

### ✅ Corregido — `calcHealthScore()` no excluía los extras de préstamo gastados de inmediato

El mismo filtro de "gasto real del mes" usado en Análisis financiero (ver arriba) le faltaba una condición a `calcHealthScore()`: no excluía `_esExtraPrestamo`, así que cada extra de préstamo gastado inflaba `gastosMes` — afectando el cálculo de fondo de emergencia (meses de liquidez cubiertos) y el ratio gastos/ingresos, y bajando el puntaje de salud financiera sin razón real cuando había extras de préstamo ese mes.

Fix: se agregó la misma exclusión (`!g._esExtraPrestamo`) al filtro de `gvMes` en `calcHealthScore()`, dejando el criterio consistente con `renderAnalisis()`. *(Este filtro puntual quedó luego absorbido por la centralización en `_esGastoVarNoReal()`, ver `CHANGELOG.md#análisis-financiero`.)*

---

## Tarjetas de crédito

### ✅ Corregido — `calcDeudaAjenaDeTarjeta` no contaba las compras marcadas `_esFavor`

*(2026-08-07)*

`calcDeudaAjenaDeTarjeta(tc)` solo sumaba compras con `c._desdeCP`, ignorando `c._esFavor` — pese a que la capa visual (`tarjetas_credito.js`, listado de compras) siempre trató ambos flags como equivalentes (`const esFavor = c._esFavor || c._desdeCP`), pintando el mismo badge azul "favor" y la misma etiqueta "Favor cubierto" para cualquiera de los dos. Resultado: una compra marcada `_esFavor` (sin `_desdeCP`) se le mostraba al usuario como plata ajena, pero `calcDeudaTcPropiaDeTarjeta` la contaba como 100% propia — inflando la deuda propia real y, con ella, el health score.

Fix: `calcDeudaAjenaDeTarjeta` ahora suma compras con `c._desdeCP || c._esFavor`, igualando el cálculo a lo que la UI ya venía mostrando. No se tocó el orden de cancelación de pagos (saldo inicial → ajena → propia) ni ninguna otra función — `calcDeudaTcPropiaDeTarjeta` y `calcDeudaTcPropia` heredan el fix automáticamente por depender de esta función.

### 🗑️ Eliminado por diseño — Seguimiento de cuotas en compras

*(2026-08-07)*

El módulo permitía marcar una compra como "en cuotas" (`esCuotas`, `numCuotas`, `valorCuota`) y llevar un contador manual `cuotasPagadas` con botones +1/-1, mostrado como badge en el detalle de la compra ("Cuota 3/12 · $45.000"). Era puramente informativo desde el diseño original: nunca difería el cobro (la compra completa siempre entraba a `tc.deuda` desde el día del registro, vía `tcRecalcular`) ni se conectaba a Análisis financiero, Salud financiera ni Proyección — ningún otro módulo leía esos campos.

Se decidió quitarlo por completo: el usuario ya tiene la app del banco para ver en qué cuota va una compra real, y el propósito de esta app es responder "¿voy bien o no?" con la plata — un contador que no mueve deuda ni plata no aporta a esa pregunta, solo agrega fricción en el formulario de registrar compra.

Fix: se quitó el toggle "¿Es una compra en cuotas?" y sus campos asociados del sheet de registrar compra (`index.html`), y en `tarjetas_credito.js` se eliminaron `tcCalcularValorCuota`/`tcValorUltimaCuota`, `tcIncrementarCuotaPagada` (y su registro en `Events`), el badge y los botones +1/-1 del listado de compras, y la escritura de `esCuotas`/`numCuotas`/`valorCuota`/`cuotasPagadas` en `tcCrearCompra` y en la normalización (`tcNormalizarTarjetas`). Compras ya guardadas con esos campos no se migran ni se tocan — simplemente dejan de leerse, sin afectar `tc.deuda` (que nunca dependió de ellos).

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

### ✅ Corregido — La alcancía se filtraba en el Historial de Patrimonio (Análisis financiero)

La alcancía es una función de "ahorro oculto": el saldo no se muestra en ningún lado hasta que se decide destaparla. El hero de Inicio ya respetaba esto (calcula el patrimonio visible restando explícitamente la alcancía), pero `calcPatrimonioTotal()` — la función que alimenta `snapshotPatrimonio()`, que a su vez llena `S.patrimonioHistorial` (la data de la gráfica de Análisis Financiero) — sí la incluía.

Por qué era grave y no solo inconsistente: al registrar un depósito tipo `yo-directo` (efectivo que no tenías registrado), el movimiento en efectivo es neto cero, pero el saldo de la alcancía sí sube. El patrimonio total pegaba un salto ese día que no se explicaba por ningún ingreso visible — cualquiera que mirara la curva de tendencia podía ver, con precisión de peso, cuándo y cuánto se metió a la alcancía.

Fix: se guardan dos valores por punto del historial (`valor` = patrimonio real con alcancía, `valorVisible` = sin alcancía), calculados en `snapshotPatrimonio()`. La gráfica de Análisis Financiero pasó a consumir `valorVisible` en la curva, el número de encabezado y el tooltip (los dos últimos se habían quedado usando el valor real en una primera pasada del fix, y se corrigieron aparte). Health score y Proyección financiera siguen usando `calcPatrimonioTotal()` con la alcancía incluida a propósito — ahí sí es plata real que debe contar, y no es una gráfica día a día que exponga montos puntuales.

**Limitación conocida:** los puntos del historial guardados antes de este cambio no tienen `valorVisible` (caen a `valor` como fallback) — no hay forma de reconstruir retroactivamente cuánto había en la alcancía en fechas pasadas, así que esos puntos viejos pueden seguir mostrando el salto original. De ahí en adelante, la curva queda limpia.

## Encargos

### ✅ Corregido — "Registrar salida" dejaba sacar plata ya comprometida en una parte

Las partes comprometidas (`enc.partes`, "¿Para qué es esta plata?") ya calculaban y mostraban un "Libre" en la sección de partes, pero ese número era solo informativo: el sheet de "Registrar salida" (`abrirMovEncargo`/`confirmarMovEncargo`) seguía validando contra `encargoSaldo(enc)` (el saldo total), sin descontar lo comprometido. Resultado: si tenías, por ejemplo, $200.000 comprometidos para el arriendo, igual podías sacar esos $200.000 por "Registrar salida" como si estuvieran libres — la parte comprometida se quedaba sin respaldo real.

Fix inicial: nuevos helpers `encargoComprometido(enc)` (suma de partes sin usar) y `encargoLibre(enc)` (saldo menos eso, nunca negativo). `abrirMovEncargo` bloquea o limita la salida al disponible real, mostrando en el sheet cuánto hay comprometido cuando aplica; `confirmarMovEncargo` valida contra `encargoLibre()` en vez de `encargoSaldo()` tanto en modo simple como en split.

Extensión — mismo criterio en **todos** los lugares donde se muestra o se saca plata de un encargo, no solo en "Registrar salida":
- **Lista de encargos** y **hero del detalle**: ahora muestran `encargoLibre()` como el número principal (antes mostraban el saldo total, que incluía plata ya comprometida). Cuando hay algo comprometido, aparece un subtexto tipo "de $500.000, $200.000 comprometido".
- **Traspaso de sobrante** (`abrirTraspasoEncargo`/`confirmarTraspasoEncargo`): valida contra `encargoLibre()` — un "sobrante" por definición no puede incluir plata que ya tiene destino asignado.
- **Compra con TC del encargo** (`abrirCompraConTC`/`confirmarCompraConTC`): mismo cambio — no se puede pagar una compra con plata ya comprometida para otra cosa.
- **Mover entre cuentas** se dejó **sin cambios** a propósito: no saca plata del encargo, solo la reubica físicamente entre cuentas propias, así que lo comprometido no debería bloquearlo.
- **`usarParte`/`_confirmarUsarParte`** (marcar una parte como "ya la usé") también se dejó sin cambios: es la vía diseñada para gastar justamente esa plata comprometida, así que sigue validando contra el saldo físico real en la cuenta elegida, no contra `encargoLibre()` — no tendría sentido bloquear la única forma de liberar el compromiso.

Pendiente fuera de este archivo: el cruce con Préstamos ("pagar una deuda con plata de un encargo") vive en el módulo de deudores, no en `encargos.js`, y no se tocó — si ese flujo también debe respetar lo comprometido, hay que revisarlo por separado ahí.

### ✅ Corregido — El cruce con Préstamos ("pagar una deuda con plata de un encargo") también dejaba usar plata comprometida

Mismo problema que el de arriba, pero en `prestado.js`: el toggle "¿Viene de un encargo?" en el sheet de abono de una deuda validaba y mostraba el saldo total del encargo (`encargoSaldo`), sin descontar las partes comprometidas. Un encargo con plata ya apartada para otra cosa igual aparecía como "disponible" completo en el selector, dejaba pagar la deuda con esa plata, y hasta se ofrecía como opción cuando su único saldo era 100% comprometido.

Fix: mismo criterio que en `encargos.js` — todo lo que antes usaba `encargoSaldo(enc)` para decidir "cuánto hay disponible" ahora usa `encargoLibre(enc)` (definida en `encargos.js`, ya disponible globalmente): el filtro de qué encargos ofrecer como origen del abono, los montos que se muestran junto a cada encargo en el selector, la validación del monto (abono solo, y abono + extra), y el preview cuando no se elige una cuenta específica del encargo. Las validaciones por cuenta física (`_getEncargoSaldoEnCuenta`/`_getEncargoSaldoSinCuenta`) se dejaron igual, por la misma razón que en Encargos: lo comprometido no está ligado a una cuenta específica, así que no tiene sentido restringir ahí.

## Alcancía

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
