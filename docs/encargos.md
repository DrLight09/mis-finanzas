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
- **"Yo puse la plata"**: caso en que el gasto del encargo no salió realmente de la cuenta donde estaba guardado el dinero del encargo, sino del bolsillo del usuario, y este quiere recuperar ese monto de una cuenta propia. Genera un intercambio simple (salida de una cuenta propia + entrada a otra), sin repartir margen entre beneficiarios. Cada lado se puede repartir entre varias cuentas propias con "Dividir ÷" (ej. pagaste $100.000 con $40.000 de Efectivo + $60.000 de Nequi, y lo recuperás en dos cuentas distintas).

## 3. Reglas que nunca deben romperse

- El saldo de un encargo (total y por cuenta) **nunca se guarda como campo**, siempre se deriva de `saldoInicial` + movimientos. Cachear ese número en otro lugar es la forma más rápida de desincronizar el sistema.
- La plata de un encargo **nunca cuenta como patrimonio, ingreso o gasto propio** mientras siga siendo del encargo. Solo dos flujos la convierten en propia: "Traspaso de sobrante" (explícito) y el margen de un diferencial (explícito).
- **Nunca se asume una tarjeta de crédito como lugar donde se guarda plata ajena** — los selects de "¿en qué cuenta guardaste esa plata?" excluyen tarjetas. La única relación válida entre un encargo y una TC es "compré algo del encargo y lo cargué a mi tarjeta" (flujo separado).
- Todo movimiento de encargo que además toca una cuenta propia (traspaso, compra con TC, "yo puse la plata", margen de diferencial) debe guardar el/los ID de vínculo necesarios para poder revertir **exactamente** esos efectos secundarios si el movimiento se elimina. Nunca borrar solo el lado del encargo y dejar huérfano el lado de la cuenta propia. Lo mismo aplica a la transferencia entre encargos (`_transfId`), aunque ahí no hay cuenta propia de por medio: el vínculo es entre los dos encargos, no entre un encargo y una cuenta.
- **Todo lo que el motor de diferencial escribe en `S.movimientos` por una salida de encargo o una compra con TC (margen, ingreso sin cuenta, intercambios de beneficiarios) es secundario**: lleva `_secundario: true` y `_origenSeccion: 'Encargos'`, igual que los movimientos de "Yo puse la plata". Así `eliminarMovimiento()` (feed/detalle de cuenta) no deja borrarlos sueltos y manda a borrar el movimiento principal en Encargos, que sí los revierte por `_encMovId`. La marca es opt-in por módulo (`cfg.origenSeccion` de la instancia del diferencial): solo `movenc` y `ctc` la activan; ver §6 para lo que no cubre.
- Ninguna salida (total, por cuenta, o de un split) puede registrarse por más de lo que el encargo tiene disponible en ese momento — la validación ocurre **antes** de escribir cualquier dato, nunca después. "Disponible" es el saldo **menos** lo que ya está en partes comprometidas sin usar (`encargoLibre()`), no el saldo total, y esto aplica en **todos** los flujos que sacan plata del encargo: "Registrar salida", "Traspaso de sobrante" y "Compra con TC". La plata comprometida no se puede volver a sacar por ninguna de esas vías; solo sale marcando la parte como "ya la usé" (`usarParte`), que sí valida contra el saldo físico real en la cuenta elegida, no contra lo libre — es la única vía diseñada para gastar justamente esa plata ya reservada. "Mover entre cuentas" es la excepción: no saca plata del encargo (solo la reubica), así que no se limita por lo comprometido.
  - **Excepción explícita y siempre a elección del usuario:** una salida simple (no dividida) puede superar lo disponible únicamente a través de "Prestar lo que falta" (ver §5/§6), que jamás se dispara solo — retira lo disponible del encargo y registra el resto como un préstamo real, aparte, en "Me deben". El límite de `encargoLibre()` en sí no se relaja: lo que cambia es que el excedente deja de ser plata del encargo y pasa a ser una deuda tuya con esa persona.
  - Esa misma excepción **nunca puede dejar una cuenta propia en negativo en silencio**: antes de registrar el préstamo del faltante se valida `getSaldoFuente()` de la cuenta elegida contra el monto a prestar — mismo criterio que ya usa "Yo puse la plata" (`_validarMovEncMia`). Si no alcanza, no se registra nada (ni la salida del encargo tampoco) — ver `CHANGELOG.md#encargos`.
- Marcar una parte comprometida como usada, o eliminar un movimiento o un encargo entero, son siempre decisiones explícitas del usuario — nunca automáticas ni disparadas como efecto colateral de otra acción.
- Si un pago salió de varias cuentas del encargo a la vez (mismo grupo), eliminarlo debe eliminar **todas** esas salidas juntas — nunca dejar un pago a medio revertir.
- **`deleteMovEncargo()` revierte los saldos con `descontarFuente(..., { exacto: true })`** (sin piso en 0). Con piso, borrar un movimiento cuyo dinero ya se había gastado perdía la diferencia, y al rehacerlo el saldo de la cuenta quedaba inflado (caso real con "Yo puse la plata" + margen). Ver `CHANGELOG.md#patrimonio-y-cálculos-globales` (2026-09-30).
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
| `_miaCuentaSale`, `_miaCuentaEntra` | intercambio "yo puse la plata" sin diferencial. Con varias cuentas guardan la **primera** de cada lado (compatibilidad con el historial y con `deleteMovEncargo`) |
| `_miaMonto` | lo que realmente se puso del bolsillo en "Yo puse la plata". Puede ser menor que `monto` del movimiento cuando hay diferencial (ahí se usa el *real*, ver §6). La fila del historial lo usa para mostrar "Salió de Nu $89.405"; los movimientos anteriores a 2026-09-30 no lo tienen y simplemente no muestran el monto |
| `_miaCuentas` | solo si "Yo puse la plata" se dividió (÷) en algún lado: `{ sale: [{cuenta, monto}], entra: [{cuenta, monto}] }` con el reparto completo. Cada elemento tiene su propio movimiento espejo en `S.movimientos` (todos con el mismo `_encMovId`) |
| `diferencial` | `{dijo, real, margen, beneficiarios[], miCuenta, yoMeQuedo, miCuentas?}` si hubo margen en esta salida. `miCuenta` es la primera cuenta donde entró tu sobrante; `miCuentas` (`[{cuenta, monto}]`) solo existe si lo repartiste en 2 o más cuentas con "Dividir ÷" |
| `_parteId` | si la salida vino de marcar una parte comprometida como usada |
| `_splitTotal`, `_splitParte`, `_splitDe`, `_splitGrupo` | si la salida se dividió (÷) entre varias cuentas del encargo. `_splitGrupo` (solo en "Registrar salida", desde 2026-09-30) es un id común a todas las porciones: sirve para mostrarlas y borrarlas como un solo movimiento (ver §6). Las salidas de "Mover entre cuentas" nunca lo llevan |

**Parte comprometida** (dentro de `enc.partes`):

```js
{ id, desc, monto, fecha, usada, creadaEn, fuente|fuentes, diferencial }
```
`fuente` (una cuenta) o `fuentes` (array, si se dividió) registran de dónde salió la plata al marcarla usada; `diferencial` guarda el margen si lo hubo en ese momento (con `miCuentas` si tu sobrante se repartió en varias cuentas, mismo formato que en un movimiento).

## 5. Flujo

**Crear un encargo**
`btn-nuevo-encargo → elegir persona (obligatorio, sin opción de nombre libre) + saldo/cuenta inicial → crearEncargo() → (hook) exige personaId (bloquea con error si no se seleccionó persona) y lo asigna al encargo recién creado`

**Registrar entrada / salida**
`abrirMovEncargo(tipo) → elegir cuenta (simple o dividir ÷) → [si es salida: diferencial opcional, "yo puse la plata" opcional] → confirmarMovEncargo() valida disponible (encargoLibre — saldo menos comprometido) y por cuenta → push movimiento(s)`

Antes de escribir cualquier dato, `confirmarMovEncargo()` valida en este orden: intercambios de beneficiarios (`_validarIntercambiosBenefs`), "Yo puse la plata" (`_validarMovEncMia`) y el reparto del sobrante (`diffValidarMiCuenta('movenc')`). Si cualquiera falla no se registra nada. Los mismos tres widgets de reparto ("Yo puse" sale, "Yo puse" entra y sobrante del margen) usan el motor común de split (`js/core/split.js`) y las mismas reglas de siempre: mínimo 2 filas, sin repetir cuenta entre filas.

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
Si el movimiento es una porción de una salida dividida de "Registrar salida" (`_encGrupoSplit`), se quitan todas las porciones juntas y los efectos secundarios se revierten una sola vez, a través de la porción que los lleva (`_encSplitCarrier`); si llega el id de otra porción, `deleteMovEncargo` se redirige a esa.

**Eliminar el encargo completo**
`eliminarEncargoActual() reúne todos los IDs de sus movimientos, revierte traspasos, limpia S.movimientos y S.tcMovimientos vinculados (por ID, y por patrón de descripción para registros antiguos sin ID de vínculo), y borra el encargo`

## 6. Casos especiales

- **"Prestar lo que falta" solo existe para salidas simples**, no en modo dividido (÷). Combinar ambas (¿de cuál cuenta del encargo sale cada parte del faltante? ¿de cuál cuenta propia?) complicaba la UI sin un caso real que lo pidiera todavía — si hace falta más adelante, es una extensión aparte, no algo que se coló sin querer.
- **El préstamo generado es independiente de la salida del encargo, a propósito.** Son dos movimientos separados en dos módulos distintos (`enc.movimientos` y `deudor.movimientos`), cada uno reversible con su propio flujo normal de borrado (`deleteMovEncargo` / `eliminarMovDeudor`). Borrar la salida del encargo **no** borra el préstamo, ni al revés: la deuda es real y sigue existiendo sin importar qué pase después con el encargo. El movimiento del deudor guarda `_encargoOrigenId`/`_encargoOrigenMovId` únicamente como trazabilidad (para poder ver de dónde salió si hace falta investigar), no como vínculo de borrado en cascada.
- **Diferencial y "Yo puse la plata" se ocultan mientras el banner de faltante está activo**, para no combinar tres mecanismos a la vez sobre el mismo monto. Vuelven a aparecer apenas se corrige el monto (o se activa el split) y deja de haber faltante.
- Si el encargo tiene **$0 disponible** (no solo insuficiente), el banner lo aclara explícitamente: todo el monto pedido queda como préstamo, no se genera ninguna salida de $0 en el encargo.

- Si el encargo no tiene distribución por cuenta (todo "sin especificar"), los selects de salida muestran todas las cuentas propias en vez de limitar a las que tienen saldo del encargo.
- Reubicar plata "sin especificar" hacia una cuenta se registra como una salida sin campo `cuenta` (vacío) — mismo tratamiento que cualquier otro "sin especificar". Esto aplica igual en el modo dividido de "Mover entre cuentas": una fila con origen "sin especificar" también guarda `cuenta: ''`.
- **"Mover entre cuentas" dividido no agrupa sus movimientos para borrado.** A diferencia del abono de deudor con `_grupoAbonoId` (ver §3), cada salida del split y la entrada al destino quedan como registros independientes en el historial del encargo — a diferencia de la salida dividida de "Registrar salida", que desde 2026-09-30 se muestra y se borra como un solo movimiento (ver más abajo). Borrar una de las partes no revierte ni afecta a las demás. La agrupación excluye a propósito las descripciones que empiezan por "Reubicación".
- En ambos modos de "Mover entre cuentas", el destino nunca puede coincidir con la cuenta de origen (o, en modo dividido, con ninguna de las cuentas de origen elegidas) — se valida antes de guardar, no solo se sugiere en el preview.
- **El placeholder de una fila del split de "Mover entre cuentas" dice "Elige cuenta", nunca "Sin especificar".** Las opciones de cada fila se arman a mano en vez de reusar `buildFuentesOptsHtml()` (que sí usan "Retirar plata" y "Usar parte"), porque ese helper reserva el texto "Sin especificar" para "no elegiste nada todavía" — algo válido ahí, pero acá chocaba con la opción real "Sin especificar" (el bucket de plata del encargo sin cuenta asignada), generando dos opciones con el mismo nombre y significados distintos. Una fila sin cuenta elegida (aunque tenga monto) se bloquea al confirmar y se avisa en el preview ("Falta elegir la cuenta en una o más filas") en vez de calcularse contra un saldo de $0.
- Movimientos con nota `"Movimiento interno entre cuentas"` o `"Traspaso a cuenta propia"` se excluyen del feed general de cambios, para no ensuciar el historial unificado con reubicaciones internas.
- Un encargo con saldo inicial pero sin cuenta inicial cuenta como "sin especificar" en el desglose por cuenta.
- El interés que genera en Nu la porción de una cajita que pertenece a un encargo se calcula y muestra como ganancia del usuario (no del encargante), proporcional a esa porción — el encargante solo tiene derecho al monto nominal, nunca al rendimiento.

- **"Dividir ÷" en "Yo puse la plata": cada lado se valida por separado y ambos deben sumar el monto total.** Lo que sale de tus cuentas tiene que igualar el monto (y cada cuenta necesita saldo propio suficiente, `getSaldoFuente`); lo que recuperás también tiene que igualarlo — o quedar sin ninguna fila, que equivale a "sin especificar" (no se acredita nada). Los dos lados son independientes: se puede dividir uno y dejar el otro simple. Se crea un movimiento espejo por cuenta (`_intercambioSalida` / `_intercambioEntrada`, todos con el mismo `_encMovId`), y `deleteMovEncargo()` los revierte todos juntos por ese vínculo.
- **"Yo puse la plata" cubre el monto TOTAL del campo, no solo la porción del movimiento.** En una salida dividida entre cuentas del *encargo*, `confirmarMovEncargo()` crea un movimiento por porción y aplica el intercambio solo sobre el primero. `_procesarMovEncMia()` lee el monto completo del input (`movenc_monto`) en vez de `movimiento.monto`; antes, en ese caso, solo se recuperaba la primera porción (ver `CHANGELOG.md#encargos`).
- **Con diferencial activo, "Yo puse la plata" cubre el valor REAL, no el monto dicho.** Si el bloque "El valor real era diferente" está abierto y `0 < real < monto`, `_miaMontoEfectivo()` hace que `_validarMovEncMia`, `_movEncMiaPreview` y `_procesarMovEncMia` trabajen con el real (ej.: dijiste $91.000, costó $89.405 → de tu cuenta salen $89.405). La diferencia (margen, $1.595) la acredita el diferencial como ganancia propia; si "Yo puse" también usara el total, ese margen se contaría dos veces. Los dos bloques conviven en el mismo movimiento (`confirmarMovEncargo()` llama a `_procesarDiferencial` y luego a `_procesarMovEncMia`), y `movenc_monto` / `movenc_dif_real` refrescan el preview. Con un real vacío, 0 o mayor o igual al monto, se usa el monto total como siempre. El reparto de cada lado (÷) debe sumar ese monto efectivo.
- **Salida dividida (÷) de "Registrar salida": una sola fila en el historial.** Cuando el encargo tiene plata en varias cuentas (ej. Efectivo $54.000 + Madre $37.000) se siguen guardando **N registros en `enc.movimientos`**, uno por cuenta: el saldo del encargo se calcula por cuenta (`m.cuenta`), así que no se pueden fusionar en un solo dato. Lo que se unifica es la **vista y el borrado**: `abrirEncargoDetalle` pinta las porciones como un movimiento (monto total, "Madre $37.000 + Efectivo $54.000", saldo antes/después del grupo completo, y las líneas de "Yo puse" y de diferencial) y eliminarlo borra todas las porciones. La porción que lleva los efectos secundarios (`_encSplitCarrier`: la que tiene `_miaCuentaSale` o `diferencial`; si no, la primera) es la que representa al grupo. Se agrupan las porciones con el mismo `_splitGrupo`; las guardadas antes de este cambio (sin ese campo) se agrupan solo si el conjunto está completo (misma `desc`, `fecha`, `_splitTotal`, `_splitDe` y partes 1..N) y no son "Reubicación", abono de deudor ni compra con TC. Un conjunto incompleto o ambiguo se sigue viendo como filas sueltas. Esto reemplaza el criterio anterior, en el que las porciones eran independientes también al borrar.
- **La hoja de detalle de esa fila** (`abrirDetalleMov`, `js/core/movimientos.js`) toma monto y saldo antes/después de los atributos de la fila, así que muestra el total del grupo, y el bloque "¿Qué pasó con el precio?" sale del movimiento portador. Limitación previa, sin resolver: no muestra "Yo puse la plata" ni las cuentas del split (las filas de encargo no emiten `data-mov-otras`). Esa hoja no tiene botón de eliminar.
- **Márgenes e intercambios protegidos (`_secundario`) — alcance.** Solo cubre los que escribe `diffAplicar()` para `movenc` y `ctc`. "Ya la usé" escribe su margen por otro camino (`_confirmarUsarParte`) y no está protegido; "Préstamo con TC" (`prtc`) no activa la opción (ver `prestado.md`). Los movimientos guardados antes del 2026-09-30 no llevan la marca y se pueden borrar sueltos desde el feed; se marcan a mano (consola) solo si tienen dueño, es decir, si su `_encMovId` existe en algún encargo. Los huérfanos se dejan sin marcar a propósito: marcados, no habría forma de borrarlos.
- **"Dividir ÷" en el sobrante del margen** ("¿A cuál cuenta entra el sobrante?", en "Registrar salida", "Ya la usé" y "Compra con TC"): si se activa, lo repartido tiene que sumar **exactamente** el sobrante (`diffCalcular().sinAsignar`) y toda fila con monto necesita cuenta elegida — se valida con `diffValidarMiCuenta(instId)` antes de tocar ningún saldo. Con el split apagado el comportamiento es el de siempre (un solo select, y "Sin especificar" deja el sobrante como nota sin acreditar nada). Se genera una entrada de ingreso por cuenta: `_esDiferencialEncargo` en salida normal y compra con TC (vía `diffAplicar`), `_esExtraIngreso` en "Ya la usé".
- **El margen de una parte usada ("Ya la usé") no se revierte en ningún flujo**, con o sin "Dividir ÷": no existe una acción para deshacer una parte marcada como usada, así que sus entradas de margen quedan permanentes en `S.movimientos`. Es una limitación previa, no algo introducido por el split.
- **El resumen "Dijiste / Real / Margen" se recalcula al cambiar el monto**, no solo al editar "¿Cuánto era en realidad?". `movenc_monto` y `ctc_monto` disparan `diffResumen` en cada `input`. ("Ya la usé" no tiene este caso: su "dijo" sale del monto fijo de la parte.)

## 7. Decisiones de diseño

- El saldo nunca se persiste como número: se deriva siempre de `encargoSaldo()`. El costo de recalcularlo es aceptable frente al riesgo de que un saldo guardado se desincronice de sus movimientos.
- "Traspaso de sobrante" y "Mover entre cuentas" usan selects parecidos pero son funciones y sheets separados a propósito: representan operaciones conceptualmente opuestas — una saca la plata del encargo (deja de ser ajena), la otra solo la reubica (sigue siendo ajena).
- El motor de diferencial/margen es compartido entre salida normal, compra con TC y "usar parte" en vez de reimplementarse tres veces — así "le dije que costaba X pero costó Y" se comporta igual en cualquiera de los tres flujos.
- "Yo puse la plata" se mantuvo como un intercambio simple, separado del diferencial con beneficiarios, porque resuelve un problema distinto: no reparte un margen entre varias personas, solo corrige de qué cuenta salió realmente el dinero. Dividirlo en varias cuentas (÷) no cambia eso: sigue siendo el mismo monto total, solo repartido físicamente entre más de una cuenta propia.
- El split del sobrante del margen vive como opción genérica del motor de diferencial (`cfg.getMiCuentaSplit` / `cfg.onReset`, `diffValidarMiCuenta`), no como código propio de cada flujo: `diffAplicar()` es quien acredita cada cuenta, así que salida normal y compra con TC lo heredan sin duplicar lógica. Solo "Ya la usé" tiene su propio camino (`_confirmarUsarParte`, no pasa por `diffAplicar`) y aplica la misma regla a mano. La fábrica `_crearSplitSobrante()` arma el widget + preview de "Ya la usé" y "Compra con TC"; "Registrar salida" define el suyo (`movencDifMi`) explícito.
- El split (÷) de "Mover entre cuentas" solo existe del lado del **origen**, nunca del destino. El caso real que lo motivó es "junté plata de varias cuentas del encargo y la llevé a un solo lugar" (ej. reubicar Nequi + Efectivo hacia una cajita en una sola operación en vez de dos reubicaciones manuales) — nunca "repartir esto en varios destinos a la vez". Si en algún momento aparece un caso real para dividir el destino, es una extensión aparte, no algo que se coló sin querer (mismo criterio que ya aplica a "Prestar lo que falta" solo existiendo para salidas simples, ver §6).

- La salida dividida se unifica **por vista, no por dato.** La alternativa obvia (guardar un solo movimiento con una lista de cuentas) habría obligado a tocar todo lo que calcula saldo por cuenta (`_getEncargoSaldoPorCuenta` y derivados). Se descartó: el saldo por cuenta es la regla más sensible del módulo (§3), y agrupar al pintar y al borrar da lo mismo al usuario sin tocarla. "Reubicación" quedó fuera a propósito: sus salidas y su entrada no comparten id, y unificarlas exigiría enlazar las tres partes.
- La protección de movimientos secundarios del diferencial es **opt-in por módulo** (`cfg.origenSeccion`), no automática. El motor también lo usan módulos que no limpian ese margen al borrar su movimiento principal; marcarlos sin esa limpieza dejaría registros imposibles de borrar. Encargos lo activa porque `deleteMovEncargo` ya revierte esos movimientos por `_encMovId`.

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
| `diffRegistrarInstancia('movenc'\|'ctc'\|'usarParte', ...)` | Instancias del motor común de diferencial/margen para cada uno de los tres flujos. `movenc` y `ctc` definen `origenSeccion: 'Encargos'` (ver §3) |
| `_movEncMiaToggle` / `_movEncMiaPreview` / `_validarMovEncMia` / `_procesarMovEncMia` | "Yo puse la plata" (intercambio simple), con split ÷ opcional en cada lado |
| `_miaMontoEfectivo(montoCampo)` | Devuelve el real del diferencial si el bloque está abierto y `0 < real < monto`; si no, el monto del campo. Lo usan las tres funciones de "Yo puse la plata" |
| `_encSplitKey(m)` / `_encGrupoSplit(enc, m)` / `_encSplitCarrier(partes)` | Agrupan las porciones de una salida dividida de "Registrar salida" (por `_splitGrupo`, o por coincidencia completa en datos viejos), y eligen la porción que lleva los efectos secundarios; las usan el historial del detalle y `deleteMovEncargo` |
| `crearSplitWidget('miaSale', ...)`, `crearSplitWidget('miaEntra', ...)`, `_miaLeerCuentas(monto)` | Instancias del motor común de split para los dos lados de "Yo puse la plata"; `_miaLeerCuentas` devuelve `{sale, entra}` como `[{fuente, monto}]` sea modo simple o dividido |
| `crearSplitWidget('movencDifMi', ...)`, `_difMiSplitPreview()` | Split del sobrante del margen en "Registrar salida" |
| `_crearSplitSobrante(instId, key, ids)`, `_usarParteMi`, `_ctcMi` | Fábrica y las dos instancias del split del sobrante en "Ya la usé" y "Compra con TC" |
| `diffValidarMiCuenta(instId)` (`js/core/diferencial.js`) | Valida que el reparto del sobrante sume exactamente el sobrante y que cada fila tenga cuenta; se llama al confirmar en los tres flujos |
| `_movEncActualizarFaltante()` | Muestra/oculta el banner "Prestar lo que falta" según monto vs. `encargoLibre()`, en cada input de monto |
| `_movEncConfirmarPrestarFaltante()` | Registra la salida normal (lo disponible) en el encargo + el préstamo del faltante en `S.deudores`, vía `_autoGrupoIdMov` (de `prestado.js`) |
| `_initNuevoEncargoPersonaSelector`, `_onSelPersonaNuevoEncargo`, `editarEncargoActual`/`guardarEditarEncargo` | Vínculo e integración con `S.personas` |
| `renderEncargosEnCuenta(elId, tipoCuenta)` | Muestra los encargos guardados en una cuenta específica dentro del detalle de esa cuenta |
| `_normEncargos(S)` | Normaliza los movimientos de encargos para el feed unificado de historial/cambios |

IDs de sheets relevantes: `sheet-nuevo-encargo`, `sheet-editar-encargo`, `sheet-mov-encargo`, `sheet-traspaso-encargo`, `sheet-transferencia-encargo`, `sheet-compra-tc-encargo`, `mover-enc-cuentas`, `parte-encargo`, `usar-parte`.
