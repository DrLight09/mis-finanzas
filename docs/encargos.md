# Módulo: Encargos

## 1. Objetivo

Llevar el control de plata que el usuario administra en nombre de otra persona (la guarda, la mueve entre cuentas, paga cosas con ella) sin que esa plata se confunda nunca con la suya propia: no cuenta como patrimonio, no cuenta como ingreso ni gasto, y queda claro en todo momento cuánto es, dónde está guardada físicamente y qué parte ya tiene un destino asignado.

## 2. Conceptos importantes

- **Encargo**: registro de plata de un tercero que el usuario administra. Tiene un dueño (persona), un saldo y un historial de movimientos.
- **Saldo del encargo**: cuánto de esa plata queda sin gastar. Nunca se guarda como número — se calcula siempre sumando el saldo inicial más entradas menos salidas.
- **Saldo por cuenta**: el saldo del encargo puede estar repartido físicamente entre varias cuentas propias del usuario (ej. parte en Nu, parte en efectivo). El sistema lo rastrea por separado del saldo total para saber de dónde sacar plata al registrar una salida.
- **"Sin especificar"**: plata del encargo cuya ubicación física no quedó registrada. Se trata como una cuenta más a efectos de reparto.
- **Parte comprometida**: un monto del encargo que ya tiene un destino decidido pero aún no se ha usado (ej. "$200.000 para el arriendo, el día 30"). No mueve saldo por sí sola — es solo una reserva declarativa hasta que se marca "ya la usé". Aunque no mueve saldo, **sí resta del disponible para sacar**: mientras esté comprometida, esa plata no aparece como sacable en "Registrar salida" (ver `encargoLibre()` en §8).
- **Diferencial / margen**: cuando lo que le dijiste a la persona que costó algo no coincide con lo que realmente costó, la diferencia se puede repartir entre beneficiarios o quedarse el usuario con ella. Es un motor común (no exclusivo de Encargos) que aquí se usa en tres puntos: salida normal, compra con TC y "usar parte".
- **"Yo puse la plata"**: caso en que el gasto del encargo no salió realmente de la cuenta donde estaba guardado el dinero del encargo, sino del bolsillo del usuario, y este quiere recuperar ese monto de una cuenta propia. Genera un intercambio simple (salida de una cuenta propia + entrada a otra), sin repartir margen entre beneficiarios.

## 3. Reglas que nunca deben romperse

- El saldo de un encargo (total y por cuenta) **nunca se guarda como campo**, siempre se deriva de `saldoInicial` + movimientos. Cachear ese número en otro lugar es la forma más rápida de desincronizar el sistema.
- La plata de un encargo **nunca cuenta como patrimonio, ingreso o gasto propio** mientras siga siendo del encargo. Solo dos flujos la convierten en propia: "Traspaso de sobrante" (explícito) y el margen de un diferencial (explícito).
- **Nunca se asume una tarjeta de crédito como lugar donde se guarda plata ajena** — los selects de "¿en qué cuenta guardaste esa plata?" excluyen tarjetas. La única relación válida entre un encargo y una TC es "compré algo del encargo y lo cargué a mi tarjeta" (flujo separado).
- Todo movimiento de encargo que además toca una cuenta propia (traspaso, compra con TC, "yo puse la plata", margen de diferencial) debe guardar el/los ID de vínculo necesarios para poder revertir **exactamente** esos efectos secundarios si el movimiento se elimina. Nunca borrar solo el lado del encargo y dejar huérfano el lado de la cuenta propia. Lo mismo aplica a la transferencia entre encargos (`_transfId`), aunque ahí no hay cuenta propia de por medio: el vínculo es entre los dos encargos, no entre un encargo y una cuenta.
- Ninguna salida (total, por cuenta, o de un split) puede registrarse por más de lo que el encargo tiene disponible en ese momento — la validación ocurre **antes** de escribir cualquier dato, nunca después. "Disponible" es el saldo **menos** lo que ya está en partes comprometidas sin usar (`encargoLibre()`), no el saldo total, y esto aplica en **todos** los flujos que sacan plata del encargo: "Registrar salida", "Traspaso de sobrante" y "Compra con TC". La plata comprometida no se puede volver a sacar por ninguna de esas vías; solo sale marcando la parte como "ya la usé" (`usarParte`), que sí valida contra el saldo físico real en la cuenta elegida, no contra lo libre — es la única vía diseñada para gastar justamente esa plata ya reservada. "Mover entre cuentas" es la excepción: no saca plata del encargo (solo la reubica), así que no se limita por lo comprometido.
  - **Excepción explícita y siempre a elección del usuario:** una salida simple (no dividida) puede superar lo disponible únicamente a través de "Prestar lo que falta" (ver §5/§6), que jamás se dispara solo — retira lo disponible del encargo y registra el resto como un préstamo real, aparte, en "Me deben". El límite de `encargoLibre()` en sí no se relaja: lo que cambia es que el excedente deja de ser plata del encargo y pasa a ser una deuda tuya con esa persona.
  - Esa misma excepción **nunca puede dejar una cuenta propia en negativo en silencio**: antes de registrar el préstamo del faltante se valida `getSaldoFuente()` de la cuenta elegida contra el monto a prestar — mismo criterio que ya usa "Yo puse la plata" (`_validarMovEncMia`). Si no alcanza, no se registra nada (ni la salida del encargo tampoco) — ver `CHANGELOG.md#encargos`.
- Marcar una parte comprometida como usada, o eliminar un movimiento o un encargo entero, son siempre decisiones explícitas del usuario — nunca automáticas ni disparadas como efecto colateral de otra acción.
- Si un pago salió de varias cuentas del encargo a la vez (mismo grupo), eliminarlo debe eliminar **todas** esas salidas juntas — nunca dejar un pago a medio revertir.
- Un encargo nuevo **nunca se crea sin `personaId`** — no existe (ni debería agregarse) una vía de nombre libre; toda creación pasa por el selector de `S.personas`.
- El campo `cuenta` de una entrada o salida simple (Nequi, Efectivo, cuenta personalizada) es **solo metadata de dónde está guardada físicamente** esa porción del encargo — nunca debe sumarse ni restarse del saldo real de esa cuenta, ni del patrimonio total. Registrar una entrada de encargo no mueve plata real (no hay `sumarFuente`, no genera movimiento espejo): a diferencia de un traspaso, una compra con TC o "yo puse la plata", una entrada/salida simple nunca toca una cuenta propia. **Única excepción:** una cajita de Nu, donde el saldo de encargos sí se suma a la base que gana interés dentro de `calcC()` — ahí restarlo al mostrar el saldo propio de la cajita es intencional y correcto (ver §6). Tratar Nequi/Efectivo/personalizadas igual que una cajita fue justamente la causa de un bug real (ver `CHANGELOG.md#patrimonio-y-cálculos-globales`).

## 4. Modelo de datos

Cada encargo vive en `S.encargos[]`:

```js
{
  id, nombre, nota,
  saldoInicial, cuentaInicial,      // plata con la que se creó el encargo, y dónde quedó guardada
  fechaCreacion,
  personaId,                        // obligatorio en encargos nuevos (ver §7) — puede faltar solo en encargos creados antes de que esto se exigiera
  movimientos: [ ... ],
  partes: [ ... ]                   // opcional — partes comprometidas
}
```

**Movimiento** (dentro de `enc.movimientos`):

| Campo | Nota |
|---|---|
| `tipo` | `'entrada'` o `'salida'` — es lo único que determina el signo en el cálculo de saldo |
| `cuenta` | clave de la cuenta propia donde está/estaba guardada esa porción; vacío = "sin especificar" |
| `_esAbonoDeudor`, `_deudorId`, `_grupoAbonoId` | el movimiento es en realidad un pago de deuda de Préstamos hecho con plata del encargo; `_grupoAbonoId` agrupa varias salidas si el pago se dividió entre cuentas del encargo |
| `_esTcEncargo`, `_encId`, `_destino`, `_tcId`, `_tcMonto`, `_dijoMonto`, `_destinoMonto` | compra del encargo pagada con tarjeta de crédito propia — ver §5 |
| `_traspasoEncargo`, `_destino` | la salida es un "traspaso de sobrante": la plata deja de ser del encargo y pasa a ser propia |
| `_transfEncargo`, `_transfId`, `_encargoDestino` (en la salida) / `_encargoOrigen` (en la entrada) | la plata pasa de este encargo a otro (deuda entre los dos dueños, regalo, favor devuelto, etc.) — sigue siendo ajena todo el tiempo, nunca toca cuentas propias ni patrimonio; `_transfId` vincula la salida en el encargo origen con la entrada en el encargo destino para poder revertir ambos lados juntos |
| `_miaCuentaSale`, `_miaCuentaEntra` | intercambio "yo puse la plata" sin diferencial |
| `diferencial` | `{dijo, real, margen, beneficiarios[], miCuenta, yoMeQuedo}` si hubo margen en esta salida |
| `_parteId` | si la salida vino de marcar una parte comprometida como usada |
| `_splitTotal`, `_splitParte`, `_splitDe` | si la salida se dividió (÷) entre varias cuentas del encargo |

**Parte comprometida** (dentro de `enc.partes`):

```js
{ id, desc, monto, fecha, usada, creadaEn, fuente|fuentes, diferencial }
```
`fuente` (una cuenta) o `fuentes` (array, si se dividió) registran de dónde salió la plata al marcarla usada; `diferencial` guarda el margen si lo hubo en ese momento.

## 5. Flujo

**Crear un encargo**
`btn-nuevo-encargo → elegir persona (obligatorio, sin opción de nombre libre) + saldo/cuenta inicial → crearEncargo() → (hook) exige personaId (bloquea con error si no se seleccionó persona) y lo asigna al encargo recién creado`

**Registrar entrada / salida**
`abrirMovEncargo(tipo) → elegir cuenta (simple o dividir ÷) → [si es salida: diferencial opcional, "yo puse la plata" opcional] → confirmarMovEncargo() valida disponible (encargoLibre — saldo menos comprometido) y por cuenta → push movimiento(s)`

**Traspaso de sobrante a cuenta propia** (la plata deja de ser del encargo)
`abrirTraspasoEncargo → elegir cuenta destino → confirmarTraspasoEncargo(): valida contra encargoLibre() → salida marcada _traspasoEncargo en el encargo + sumarFuente(destino) + entrada visible en el historial de esa cuenta`

**Transferencia de plata a otro encargo** (sigue siendo ajena, solo cambia de dueño)
`abrirTransferenciaEncargo → elegir encargo destino, cuenta de origen (de qué cuenta del encargo salió) y cuenta física donde queda guardada para el destino → confirmarTransferenciaEncargo(): valida contra encargoLibre() del origen (y contra el saldo en la cuenta elegida, si se especificó una) → push de dos movimientos vinculados por el mismo _transfId: salida _transfEncargo en el encargo origen, entrada _transfEncargo en el encargo destino. A propósito no hay sumarFuente/descontarFuente en ningún lado: a diferencia de un traspaso de sobrante, esta plata nunca deja de ser ajena — solo pasa de un encargo a otro, así que nunca toca una cuenta propia ni el patrimonio (ver §3). El motivo (deuda entre los dos dueños, un regalo, un favor devuelto) no cambia el mecanismo — es libre en el campo `desc`.`

**Mover entre cuentas** (reubicación física, sigue siendo del encargo)
`abrirMoverEntreCuentasEncargo → elegir origen/destino (incluye "sin especificar") → confirmarMoverEncCuentas()`
- **Modo simple:** un origen → un destino → dos movimientos internos (salida+entrada) por el mismo monto.
- **Modo dividido (÷):** la plata sale de varias cuentas del encargo a la vez, todas hacia el **mismo** destino (ej. $100.000 de Nequi + $20.000 de Efectivo → una sola cajita) — el destino nunca se divide, solo el origen. El monto total ya no se pide aparte: se deduce sumando las filas, así que el campo "¿Cuánto vas a mover?" queda oculto mientras el split está activo. `_confirmarMoverEncCuentasSplit()` valida que cada fila tenga cuenta elegida, que ninguna repita cuenta entre sí ni coincida con el destino, y que cada cuenta tenga saldo suficiente del encargo → registra una salida por cada fila (marcada `_splitTotal/_splitParte/_splitDe` si hay más de una, mismo criterio que la salida dividida de "Registrar salida") + una única entrada en el destino por el total.
- El botón "Dividir ÷" solo aparece si el encargo tiene plata en 2 o más cuentas distintas — con una sola no hay nada que repartir.
- En ambos modos, el saldo total del encargo no cambia — solo su distribución por cuenta.

**Compra del encargo pagada con tarjeta de crédito propia**
`abrirCompraConTC → elegir cuenta del encargo de origen, TC, cuenta destino → confirmarCompraConTC(): valida contra encargoLibre() → salida _esTcEncargo en el encargo → sumarFuente(destino, tcMonto) → sube la deuda de la TC → se registra en el historial de la TC como cargo_encargo (no cuenta como gasto propio) → si hay diferencial, el margen se separa como ganancia propia`

**Partes comprometidas**
`abrirNuevaParte/editarParte → guardarParte() valida que lo comprometido no exceda el saldo → usarParte → abrirUsarParteSheet → _confirmarUsarParte(): elige de qué cuenta salió (simple o split), diferencial opcional → registra la(s) salida(s) vinculadas por _parteId, marca parte.usada = true`

**Pago de una deuda de Préstamos con plata de un encargo** (cruce entre módulos, vive en `prestado.js`)
`Si el deudor tiene personaId con un encargo vinculado y encargoLibre > 0, aparece "¿Viene de un encargo?" en el sheet de abono → confirmarMovimiento() valida contra encargoLibre() (no el saldo total) → registra la salida en el encargo (_esAbonoDeudor, posible _grupoAbonoId si salió de varias cuentas) y el abono correspondiente en el deudor`

**Salida que excede lo disponible: "Prestar lo que falta"** (cruce entre módulos, vive en `encargos.js` pero escribe en `S.deudores`)
```
Salida simple (no split) con monto > encargoLibre(enc)
  ↓
En vez de solo el error de siempre, aparece el banner "El encargo no
alcanza para este monto" con el desglose exacto (cuánto se retira del
encargo / cuánto queda prestado) y un selector: "¿de cuál cuenta tuya
sale lo prestado?" — el botón "Guardar" normal se oculta mientras tanto
  ↓
Elegir cuenta propia (nunca TC) y presionar "Retirar lo disponible y
prestar el resto"
  ↓
1) Se registra una salida NORMAL en el encargo, por exactamente
   encargoLibre(enc) — mismo movimiento que cualquier otra salida simple,
   sin marcas especiales
  ↓
2) Se busca (o crea, si no existe todavía) el deudor vinculado al
   personaId del encargo en S.deudores — nunca duplica a la persona
  ↓
3) Se resuelve el grupo de préstamo con el mismo criterio automático que
   usa "Compra con TC" en Prestado (_autoGrupoIdMov): reutiliza el único
   grupo abierto si hay exactamente uno, o crea uno nuevo si hay 0 o
   varios — nunca pregunta acá, a diferencia del sheet "Registrar
   movimiento" de Prestado
  ↓
4) Se registra un movimiento tipo:'prestamo' en el deudor por el
   faltante, con la cuenta propia elegida como fuente real
   (descontarFuente) — la plata sí sale de una cuenta tuya, a diferencia
   de una salida normal de encargo, que nunca toca cuentas reales
```

Requisito: el encargo necesita `personaId` (obligatorio en encargos nuevos, ver §3). Si falta — solo posible en encargos viejos de antes de que esto se exigiera — se avisa que hay que vincular una persona desde "Editar" antes de poder usar esta opción; no se genera ningún movimiento a medias. Mismo criterio de "todo o nada" si la cuenta propia elegida no tiene el saldo que hace falta prestar: se avisa (con el mismo hint en vivo que ya usa "Yo puse la plata") y no se registra ni la salida del encargo ni el préstamo.

**Eliminar un movimiento**
`deleteMovEncargo(encId, movId) revierte según qué marca tenga el movimiento (_esAbonoDeudor, _esTcEncargo, _traspasoEncargo, diferencial con pagadoPorMi, _miaCuentaSale) antes de quitarlo de enc.movimientos`

**Eliminar el encargo completo**
`eliminarEncargoActual() reúne todos los IDs de sus movimientos, revierte traspasos, limpia S.movimientos y S.tcMovimientos vinculados (por ID, y por patrón de descripción para registros antiguos sin ID de vínculo), y borra el encargo`

## 6. Casos especiales

- **"Prestar lo que falta" solo existe para salidas simples**, no en modo dividido (÷). Combinar ambas (¿de cuál cuenta del encargo sale cada parte del faltante? ¿de cuál cuenta propia?) complicaba la UI sin un caso real que lo pidiera todavía — si hace falta más adelante, es una extensión aparte, no algo que se coló sin querer.
- **El préstamo generado es independiente de la salida del encargo, a propósito.** Son dos movimientos separados en dos módulos distintos (`enc.movimientos` y `deudor.movimientos`), cada uno reversible con su propio flujo normal de borrado (`deleteMovEncargo` / `eliminarMovDeudor`). Borrar la salida del encargo **no** borra el préstamo, ni al revés: la deuda es real y sigue existiendo sin importar qué pase después con el encargo. El movimiento del deudor guarda `_encargoOrigenId`/`_encargoOrigenMovId` únicamente como trazabilidad (para poder ver de dónde salió si hace falta investigar), no como vínculo de borrado en cascada.
- **Diferencial y "Yo puse la plata" se ocultan mientras el banner de faltante está activo**, para no combinar tres mecanismos a la vez sobre el mismo monto. Vuelven a aparecer apenas se corrige el monto (o se activa el split) y deja de haber faltante.
- Si el encargo tiene **$0 disponible** (no solo insuficiente), el banner lo aclara explícitamente: todo el monto pedido queda como préstamo, no se genera ninguna salida de $0 en el encargo.

- Si el encargo no tiene distribución por cuenta (todo "sin especificar"), los selects de salida muestran todas las cuentas propias en vez de limitar a las que tienen saldo del encargo.
- Reubicar plata "sin especificar" hacia una cuenta se registra como una salida sin campo `cuenta` (vacío) — mismo tratamiento que cualquier otro "sin especificar". Esto aplica igual en el modo dividido de "Mover entre cuentas": una fila con origen "sin especificar" también guarda `cuenta: ''`.
- **"Mover entre cuentas" dividido no agrupa sus movimientos para borrado.** A diferencia del abono de deudor con `_grupoAbonoId` (ver §3), cada salida del split y la entrada al destino quedan como registros independientes en el historial del encargo — exactamente el mismo criterio que ya tiene la salida dividida de "Registrar salida" (§5). Borrar una de las partes no revierte ni afecta a las demás.
- En ambos modos de "Mover entre cuentas", el destino nunca puede coincidir con la cuenta de origen (o, en modo dividido, con ninguna de las cuentas de origen elegidas) — se valida antes de guardar, no solo se sugiere en el preview.
- **El placeholder de una fila del split de "Mover entre cuentas" dice "Elige cuenta", nunca "Sin especificar".** Las opciones de cada fila se arman a mano en vez de reusar `buildFuentesOptsHtml()` (que sí usan "Retirar plata" y "Usar parte"), porque ese helper reserva el texto "Sin especificar" para "no elegiste nada todavía" — algo válido ahí, pero acá chocaba con la opción real "Sin especificar" (el bucket de plata del encargo sin cuenta asignada), generando dos opciones con el mismo nombre y significados distintos. Una fila sin cuenta elegida (aunque tenga monto) se bloquea al confirmar y se avisa en el preview ("Falta elegir la cuenta en una o más filas") en vez de calcularse contra un saldo de $0.
- Movimientos con nota `"Movimiento interno entre cuentas"` o `"Traspaso a cuenta propia"` se excluyen del feed general de cambios, para no ensuciar el historial unificado con reubicaciones internas.
- Un encargo con saldo inicial pero sin cuenta inicial cuenta como "sin especificar" en el desglose por cuenta.
- El interés que genera en Nu la porción de una cajita que pertenece a un encargo se calcula y muestra como ganancia del usuario (no del encargante), proporcional a esa porción — el encargante solo tiene derecho al monto nominal, nunca al rendimiento.

## 7. Decisiones de diseño

- El saldo nunca se persiste como número: se deriva siempre de `encargoSaldo()`. El costo de recalcularlo es aceptable frente al riesgo de que un saldo guardado se desincronice de sus movimientos.
- "Traspaso de sobrante" y "Mover entre cuentas" usan selects parecidos pero son funciones y sheets separados a propósito: representan operaciones conceptualmente opuestas — una saca la plata del encargo (deja de ser ajena), la otra solo la reubica (sigue siendo ajena).
- El motor de diferencial/margen es compartido entre salida normal, compra con TC y "usar parte" en vez de reimplementarse tres veces — así "le dije que costaba X pero costó Y" se comporta igual en cualquiera de los tres flujos.
- "Yo puse la plata" se mantuvo como un intercambio simple, separado del diferencial con beneficiarios, porque resuelve un problema distinto: no reparte un margen entre varias personas, solo corrige de qué cuenta salió realmente el dinero.
- El split (÷) de "Mover entre cuentas" solo existe del lado del **origen**, nunca del destino. El caso real que lo motivó es "junté plata de varias cuentas del encargo y la llevé a un solo lugar" (ej. reubicar Nequi + Efectivo hacia una cajita en una sola operación en vez de dos reubicaciones manuales) — nunca "repartir esto en varios destinos a la vez". Si en algún momento aparece un caso real para dividir el destino, es una extensión aparte, no algo que se coló sin querer (mismo criterio que ya aplica a "Prestar lo que falta" solo existiendo para salidas simples, ver §6).

## 8. Referencia de implementación

| Función | Qué hace |
|---|---|
| `getEncargo(id)` / `encargoSaldo(enc)` | Búsqueda y cálculo de saldo (nunca cacheado) |
| `encargoComprometido(enc)` / `encargoLibre(enc)` | Suma de partes comprometidas sin usar, y saldo menos eso (nunca negativo) — es el tope real para "Registrar salida" |
| `crearEncargo()` | Crea el encargo; envuelta por un hook que exige `personaId` (bloquea con toast de error si no hay persona seleccionada) y se lo asigna al encargo recién creado |
| `renderEncargosList()` / `abrirEncargoDetalle(id)` | Lista y vista de detalle; `abrirEncargoDetalle` está envuelta para además llamar `renderEncargoParts` |
| `abrirMovEncargo(tipo)` / `confirmarMovEncargo()` | Sheet y confirmación de entrada/salida (con split ÷ opcional) |
| `_getEncargoSaldoPorCuenta(enc)` / `_getEncargoSaldoSinCuenta(enc)` / `_getEncargoSaldoEnCuenta(enc, cuenta)` | Desglose de saldo por cuenta física |
| `deleteMovEncargo(encId, movId)` | Elimina un movimiento revirtiendo todos sus efectos secundarios según su tipo |
| `eliminarEncargoActual()` | Elimina el encargo completo y limpia todo lo vinculado |
| `abrirTraspasoEncargo()` / `confirmarTraspasoEncargo()` | Sobrante del encargo → cuenta propia |
| `abrirTransferenciaEncargo()` / `confirmarTransferenciaEncargo()` | Encargo → otro encargo (deuda, regalo, favor entre sus dueños); nunca toca cuentas propias |
| `abrirMoverEntreCuentasEncargo()` / `confirmarMoverEncCuentas()` | Reubicación física entre cuentas, sin cambiar el saldo total — modo simple y dividido |
| `_confirmarMoverEncCuentasSplit(enc, destino, fecha)` | Rama de `confirmarMoverEncCuentas()` cuando el origen está dividido: valida y registra N salidas + 1 entrada |
| `_moverEncGetFuentesOptions()`, `crearSplitWidget('moverenc', ...)` | Config de la instancia `'moverenc'` del motor común de split (`js/core/split.js`) para el origen de "Mover entre cuentas" |
| `abrirCompraConTC()` / `confirmarCompraConTC()` | Compra del encargo pagada con tarjeta de crédito propia |
| `renderEncargoParts(enc)`, `abrirNuevaParte/editarParte/guardarParte`, `usarParte → abrirUsarParteSheet → _confirmarUsarParte`, `eliminarParte` | Ciclo completo de partes comprometidas |
| `diffRegistrarInstancia('movenc'\|'ctc'\|'usarParte', ...)` | Instancias del motor común de diferencial/margen para cada uno de los tres flujos |
| `_movEncMiaToggle` / `_procesarMovEncMia` | "Yo puse la plata" (intercambio simple) |
| `_movEncActualizarFaltante()` | Muestra/oculta el banner "Prestar lo que falta" según monto vs. `encargoLibre()`, en cada input de monto |
| `_movEncConfirmarPrestarFaltante()` | Registra la salida normal (lo disponible) en el encargo + el préstamo del faltante en `S.deudores`, vía `_autoGrupoIdMov` (de `prestado.js`) |
| `_initNuevoEncargoPersonaSelector`, `_onSelPersonaNuevoEncargo`, `editarEncargoActual`/`guardarEditarEncargo` | Vínculo e integración con `S.personas` |
| `renderEncargosEnCuenta(elId, tipoCuenta)` | Muestra los encargos guardados en una cuenta específica dentro del detalle de esa cuenta |
| `_normEncargos(S)` | Normaliza los movimientos de encargos para el feed unificado de historial/cambios |

IDs de sheets relevantes: `sheet-nuevo-encargo`, `sheet-editar-encargo`, `sheet-mov-encargo`, `sheet-traspaso-encargo`, `sheet-transferencia-encargo`, `sheet-compra-tc-encargo`, `mover-enc-cuentas`, `parte-encargo`, `usar-parte`.
