# Módulo: Encargos

## 1. Objetivo

Llevar el control de plata que el usuario administra en nombre de otra persona (la guarda, la mueve entre cuentas, paga cosas con ella) sin que esa plata se confunda nunca con la suya propia: no cuenta como patrimonio, no cuenta como ingreso ni gasto, y queda claro en todo momento cuánto es, dónde está guardada físicamente y qué parte ya tiene un destino asignado.

## 2. Conceptos importantes

- **Encargo**: registro de plata de un tercero que el usuario administra. Tiene un dueño (persona), un saldo y un historial de movimientos.
- **Saldo del encargo**: cuánto de esa plata queda sin gastar. Nunca se guarda como número — se calcula siempre sumando el saldo inicial más entradas menos salidas.
- **Saldo por cuenta**: el saldo del encargo puede estar repartido físicamente entre varias cuentas propias del usuario (ej. parte en Nu, parte en efectivo). El sistema lo rastrea por separado del saldo total para saber de dónde sacar plata al registrar una salida.
- **"Sin especificar"**: plata del encargo cuya ubicación física no quedó registrada. Se trata como una cuenta más a efectos de reparto.
- **Parte comprometida**: un monto del encargo que ya tiene un destino decidido pero aún no se ha usado (ej. "$200.000 para el arriendo, el día 30"). No mueve saldo por sí sola — es solo una reserva declarativa hasta que se marca "ya la usé".
- **Diferencial / margen**: cuando lo que le dijiste a la persona que costó algo no coincide con lo que realmente costó, la diferencia se puede repartir entre beneficiarios o quedarse el usuario con ella. Es un motor común (no exclusivo de Encargos) que aquí se usa en tres puntos: salida normal, compra con TC y "usar parte".
- **"Yo puse la plata"**: caso en que el gasto del encargo no salió realmente de la cuenta donde estaba guardado el dinero del encargo, sino del bolsillo del usuario, y este quiere recuperar ese monto de una cuenta propia. Genera un intercambio simple (salida de una cuenta propia + entrada a otra), sin repartir margen entre beneficiarios.

## 3. Reglas que nunca deben romperse

- El saldo de un encargo (total y por cuenta) **nunca se guarda como campo**, siempre se deriva de `saldoInicial` + movimientos. Cachear ese número en otro lugar es la forma más rápida de desincronizar el sistema.
- La plata de un encargo **nunca cuenta como patrimonio, ingreso o gasto propio** mientras siga siendo del encargo. Solo dos flujos la convierten en propia: "Traspaso de sobrante" (explícito) y el margen de un diferencial (explícito).
- **Nunca se asume una tarjeta de crédito como lugar donde se guarda plata ajena** — los selects de "¿en qué cuenta guardaste esa plata?" excluyen tarjetas. La única relación válida entre un encargo y una TC es "compré algo del encargo y lo cargué a mi tarjeta" (flujo separado).
- Todo movimiento de encargo que además toca una cuenta propia (traspaso, compra con TC, "yo puse la plata", margen de diferencial) debe guardar el/los ID de vínculo necesarios para poder revertir **exactamente** esos efectos secundarios si el movimiento se elimina. Nunca borrar solo el lado del encargo y dejar huérfano el lado de la cuenta propia.
- Ninguna salida (total, por cuenta, o de un split) puede registrarse por más de lo que el encargo tiene disponible en ese momento — la validación ocurre **antes** de escribir cualquier dato, nunca después.
- Marcar una parte comprometida como usada, o eliminar un movimiento o un encargo entero, son siempre decisiones explícitas del usuario — nunca automáticas ni disparadas como efecto colateral de otra acción.
- Si un pago salió de varias cuentas del encargo a la vez (mismo grupo), eliminarlo debe eliminar **todas** esas salidas juntas — nunca dejar un pago a medio revertir.
- Un encargo nuevo **nunca se crea sin `personaId`** — no existe (ni debería agregarse) una vía de nombre libre; toda creación pasa por el selector de `S.personas`.

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
`abrirMovEncargo(tipo) → elegir cuenta (simple o dividir ÷) → [si es salida: diferencial opcional, "yo puse la plata" opcional] → confirmarMovEncargo() valida saldo total y por cuenta → push movimiento(s)`

**Traspaso de sobrante a cuenta propia** (la plata deja de ser del encargo)
`abrirTraspasoEncargo → elegir cuenta destino → confirmarTraspasoEncargo(): salida marcada _traspasoEncargo en el encargo + sumarFuente(destino) + entrada visible en el historial de esa cuenta`

**Mover entre cuentas** (reubicación física, sigue siendo del encargo)
`abrirMoverEntreCuentasEncargo → elegir origen/destino (incluye "sin especificar") → confirmarMoverEncCuentas(): dos movimientos internos (salida+entrada) por el mismo monto — el saldo total no cambia, solo su distribución por cuenta`

**Compra del encargo pagada con tarjeta de crédito propia**
`abrirCompraConTC → elegir cuenta del encargo de origen, TC, cuenta destino → confirmarCompraConTC(): salida _esTcEncargo en el encargo → sumarFuente(destino, tcMonto) → sube la deuda de la TC → se registra en el historial de la TC como cargo_encargo (no cuenta como gasto propio) → si hay diferencial, el margen se separa como ganancia propia`

**Partes comprometidas**
`abrirNuevaParte/editarParte → guardarParte() valida que lo comprometido no exceda el saldo → usarParte → abrirUsarParteSheet → _confirmarUsarParte(): elige de qué cuenta salió (simple o split), diferencial opcional → registra la(s) salida(s) vinculadas por _parteId, marca parte.usada = true`

**Pago de una deuda de Préstamos con plata de un encargo** (cruce entre módulos)
`Si el deudor tiene personaId con un encargo vinculado y saldo > 0, aparece "¿Viene de un encargo?" en el sheet de abono → confirmarMovimiento() registra la salida en el encargo (_esAbonoDeudor, posible _grupoAbonoId si salió de varias cuentas) y el abono correspondiente en el deudor`

**Eliminar un movimiento**
`deleteMovEncargo(encId, movId) revierte según qué marca tenga el movimiento (_esAbonoDeudor, _esTcEncargo, _traspasoEncargo, diferencial con pagadoPorMi, _miaCuentaSale) antes de quitarlo de enc.movimientos`

**Eliminar el encargo completo**
`eliminarEncargoActual() reúne todos los IDs de sus movimientos, revierte traspasos, limpia S.movimientos y S.tcMovimientos vinculados (por ID, y por patrón de descripción para registros antiguos sin ID de vínculo), y borra el encargo`

## 6. Casos especiales

- Si el encargo no tiene distribución por cuenta (todo "sin especificar"), los selects de salida muestran todas las cuentas propias en vez de limitar a las que tienen saldo del encargo.
- Reubicar plata "sin especificar" hacia una cuenta se registra como una salida sin campo `cuenta` (vacío) — mismo tratamiento que cualquier otro "sin especificar".
- Movimientos con nota `"Movimiento interno entre cuentas"` o `"Traspaso a cuenta propia"` se excluyen del feed general de cambios, para no ensuciar el historial unificado con reubicaciones internas.
- Un encargo con saldo inicial pero sin cuenta inicial cuenta como "sin especificar" en el desglose por cuenta.
- El interés que genera en Nu la porción de una cajita que pertenece a un encargo se calcula y muestra como ganancia del usuario (no del encargante), proporcional a esa porción — el encargante solo tiene derecho al monto nominal, nunca al rendimiento.

## 7. Decisiones de diseño

- El saldo nunca se persiste como número: se deriva siempre de `encargoSaldo()`. El costo de recalcularlo es aceptable frente al riesgo de que un saldo guardado se desincronice de sus movimientos.
- "Traspaso de sobrante" y "Mover entre cuentas" usan selects parecidos pero son funciones y sheets separados a propósito: representan operaciones conceptualmente opuestas — una saca la plata del encargo (deja de ser ajena), la otra solo la reubica (sigue siendo ajena).
- El motor de diferencial/margen es compartido entre salida normal, compra con TC y "usar parte" en vez de reimplementarse tres veces — así "le dije que costaba X pero costó Y" se comporta igual en cualquiera de los tres flujos.
- "Yo puse la plata" se mantuvo como un intercambio simple, separado del diferencial con beneficiarios, porque resuelve un problema distinto: no reparte un margen entre varias personas, solo corrige de qué cuenta salió realmente el dinero.

## 8. Referencia de implementación

| Función | Qué hace |
|---|---|
| `getEncargo(id)` / `encargoSaldo(enc)` | Búsqueda y cálculo de saldo (nunca cacheado) |
| `crearEncargo()` | Crea el encargo; envuelta por un hook que exige `personaId` (bloquea con toast de error si no hay persona seleccionada) y se lo asigna al encargo recién creado |
| `renderEncargosList()` / `abrirEncargoDetalle(id)` | Lista y vista de detalle; `abrirEncargoDetalle` está envuelta para además llamar `renderEncargoParts` |
| `abrirMovEncargo(tipo)` / `confirmarMovEncargo()` | Sheet y confirmación de entrada/salida (con split ÷ opcional) |
| `_getEncargoSaldoPorCuenta(enc)` / `_getEncargoSaldoSinCuenta(enc)` / `_getEncargoSaldoEnCuenta(enc, cuenta)` | Desglose de saldo por cuenta física |
| `deleteMovEncargo(encId, movId)` | Elimina un movimiento revirtiendo todos sus efectos secundarios según su tipo |
| `eliminarEncargoActual()` | Elimina el encargo completo y limpia todo lo vinculado |
| `abrirTraspasoEncargo()` / `confirmarTraspasoEncargo()` | Sobrante del encargo → cuenta propia |
| `abrirMoverEntreCuentasEncargo()` / `confirmarMoverEncCuentas()` | Reubicación física entre cuentas, sin cambiar el saldo total |
| `abrirCompraConTC()` / `confirmarCompraConTC()` | Compra del encargo pagada con tarjeta de crédito propia |
| `renderEncargoParts(enc)`, `abrirNuevaParte/editarParte/guardarParte`, `usarParte → abrirUsarParteSheet → _confirmarUsarParte`, `eliminarParte` | Ciclo completo de partes comprometidas |
| `diffRegistrarInstancia('movenc'\|'ctc'\|'usarParte', ...)` | Instancias del motor común de diferencial/margen para cada uno de los tres flujos |
| `_movEncMiaToggle` / `_procesarMovEncMia` | "Yo puse la plata" (intercambio simple) |
| `_initNuevoEncargoPersonaSelector`, `_onSelPersonaNuevoEncargo`, `editarEncargoActual`/`guardarEditarEncargo` | Vínculo e integración con `S.personas` |
| `renderEncargosEnCuenta(elId, tipoCuenta)` | Muestra los encargos guardados en una cuenta específica dentro del detalle de esa cuenta |
| `_normEncargos(S)` | Normaliza los movimientos de encargos para el feed unificado de historial/cambios |

IDs de sheets relevantes: `sheet-nuevo-encargo`, `sheet-editar-encargo`, `sheet-mov-encargo`, `sheet-traspaso-encargo`, `sheet-compra-tc-encargo`, `mover-enc-cuentas`, `parte-encargo`, `usar-parte`.
