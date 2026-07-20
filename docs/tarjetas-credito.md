# Tarjetas de crédito

## 1. Objetivo

Llevar el registro de las tarjetas de crédito propias: cuánto cupo tiene cada una, cuánto se ha gastado, cuánto se debe hoy y si la plata guardada en una cajita alcanza para pagarle al banco. No intenta simular el funcionamiento real de un banco — no hay fecha de corte, no hay extracto, no hay pago mínimo. Solo responde tres preguntas: ¿cuánto debo?, ¿cuánto cupo me queda? y ¿me alcanza lo que tengo guardado para cubrirlo?

## 2. Conceptos importantes

- **Deuda (`tc.deuda`)** — lo que se debe hoy en total, sin importar de quién sea "moralmente" esa plata. Es un saldo neto, no un acumulado histórico: sube con compras y cargos, baja con pagos.
- **Deuda propia vs. deuda ajena** — una tarjeta puede tener cargos que en realidad son de un encargo, un préstamo o "plata comprometida" (alguien más te va a devolver esa plata, o ya la tenías apartada para otra cosa). La **deuda ajena** es la suma de esos cargos menos los pagos ya hechos sobre ellos; la **deuda propia** es lo que queda de la deuda total al restarle la ajena. Esta separación solo importa para calcular patrimonio y salud financiera — **el banco cobra el 100% de la deuda total sin importar esta distinción**, así que cualquier widget que responda "¿me alcanza para pagar?" debe usar la deuda total, nunca la propia.
- **Cupo disponible** — no se guarda como campo; siempre se calcula como `cupo total − deuda actual`. Si la tarjeta no tiene cupo configurado (`tc.cupo` en 0 o vacío), se trata como sin restricción.
- **Compra vs. pago vs. "cargo" (`tcMovimiento`)** — una *compra* se registra desde este módulo (o desde el gasto genérico, ver §5). Un *pago* reduce la deuda y sale de una cuenta real. Un *cargo* (`tipo: 'cargo_encargo'` o `'cargo_prestamo'`) es un tercer tipo de movimiento que **no crea este módulo** — lo generan Encargos o Préstamos cuando usan la tarjeta como método de pago, y vive en `S.tcMovimientos`, no en `tc.compras`. Tarjetas de crédito solo los *lee* (para sumarlos a la deuda y al historial), nunca los crea ni los borra.
- **Cuotas** — una compra puede marcarse como diferida a cuotas (`esCuotas`, `numCuotas`, `valorCuota`). El conteo de `cuotasPagadas` es puramente informativo (para saber cuántas cuotas del plan ya "sientes" pagadas) — no descuenta nada de la deuda ni se vincula a ningún pago real; la deuda solo baja con pagos de verdad.
- **Cobertura** — si una tarjeta tiene una cajita vinculada (`tc.cajitaId`), se muestra si el saldo de esa cajita alcanza para cubrir la deuda total de todas las tarjetas vinculadas a ella (puede haber más de una tarjeta por cajita).

## 3. Reglas que nunca deben romperse

- **`tc.deuda` nunca se edita a mano fuera de `tcRecalcular`.** Cualquier función que necesite cambiar la deuda debe hacerlo agregando/marcando un registro (compra, pago, saldo inicial) y llamando a `tcRecalcular(tc)` — nunca sumando o restando directo sobre `tc.deuda`. Como red de seguridad, `refresh()` recalcula la deuda de todas las tarjetas desde cero en cada ciclo (`tcNormalizarTarjetas` → `tcRecalcular`), así que cualquier mutación manual que quede suelta en otra parte del código queda pisada de inmediato — no rompe nada, pero es código muerto y confunde a quien lea después.
- **Ningún registro se borra físicamente.** Compras y pagos se marcan `eliminado:true` y se excluyen de los cálculos — nunca se hace `.splice()` ni se filtra el array. Esto preserva el historial completo y permite que `tcBuscarCompraPorIdOMatch` siga encontrando compras viejas por descripción+monto cuando no hay un id vinculado (datos de antes de este refactor).
- **Un mismo camino para crear una compra, sin importar la pantalla de origen.** Tanto el botón "+ Compra" de este módulo como el flujo genérico de "Gasto variable" pasan por `tcCrearCompra()` — la misma validación de cupo debe aplicar en ambos lugares. Si se agrega una tercera forma de crear una compra en TC en el futuro, también debe pasar por `tcCrearCompra()` y repetir la validación de cupo, no reinventar el flujo.
- **La tarjeta nunca es un destino de dinero que entra.** Los selectores de "fuente" que representan de dónde *sale* la plata sí incluyen tarjetas (`incluirTC=true` en `poblarFuente`); los que representan a dónde *entra* la plata (`getFuentesSinTC`) las excluyen siempre. Registrar dinero "hacia" una tarjeta no tiene sentido en este modelo — lo que existe es pagar (reducir deuda) o comprar (aumentarla).
- **Un pago cancela primero la deuda ajena, lo que sobra cancela la propia** (`calcDeudaAjenaDeTarjeta`). Esto evita que la deuda ajena calculada supere alguna vez a la deuda total.
- **Eliminar una compra o un pago de TC, sea desde el detalle de la tarjeta o desde el feed general de movimientos, siempre pasa por `tcEliminarCompraInterna`/`tcEliminarPagoInterna`.** Nunca se reimplementa la reversión a mano en el punto de entrada — ambos casos existen (ver `abrirDetalleTCSheet` y el feed general en `eliminarMovimiento`) y deben terminar en la misma función interna para no desincronizar la deuda.
- **Un pago de TC (`_esPagoTC`) nunca cuenta como gasto real del mes; una compra de TC (`_esCompraTC`) sí.** El gasto real ya se contó cuando se hizo la compra — el pago solo mueve plata de una cuenta a saldar la deuda, no es un gasto nuevo. Esta exclusión vive centralizada en `_esGastoVarNoReal()`; un flag de exclusión nuevo se agrega ahí, no repetido pantalla por pantalla.
- **La tarjeta no simula un banco real.** No se agregan fechas de corte, extractos ni pago mínimo — es una decisión de diseño explícita (ver §7), no un hueco por completar.

## 4. Modelo de datos

Cada tarjeta vive en `S.tarjetasCredito[]`:

```js
{
  id, nombre, banco, franquicia, color,
  cupo,               // 0 = sin límite configurado, sin restricción de cupo
  deuda,              // SIEMPRE derivado — nunca se edita a mano, ver §3
  estado,             // 'activa' | 'bloqueada' | 'cancelada' | 'vencida'
  cajitaId,           // cajita vinculada para pagar esta tarjeta, o null
  saldoInicial: {id, monto, fecha, nota, eliminado} | null,  // deuda que ya existía antes de usar la app
  compras: [{
    id, desc, cat, fecha, monto, nota, eliminado,
    esCuotas, numCuotas, valorCuota, cuotasPagadas,  // informativo, ver §2
    _esFavor, _desdeCP    // opcionales: marca que esta compra es deuda ajena
  }],
  pagos: [{id, monto, fecha, fuente, nota, eliminado}],
  creadoEn
}
```

Aparte, `S.tcMovimientos[]` (compartido con Encargos y Préstamos, no exclusivo de este módulo) guarda los "cargos" que otros módulos generan al usar una tarjeta como método de pago:

```js
{ id, tcId, tipo, monto, fecha, desc, nota, deudorId, eliminado }
// tipo: 'cargo_encargo' | 'cargo_prestamo' | 'corte_aviso' (legado, se limpia en cada refresh)
```

`tcMovimientos` es leído por este módulo (para sumar a la deuda y mostrarlo en el historial de la tarjeta) pero **no** es creado ni eliminado por él — esa responsabilidad es de Encargos/Préstamos.

## 5. Flujo

**Registrar una compra (desde este módulo):**
`abrirCompraTC(tcId)` → validar descripción/monto/cupo → `tcCrearCompra(tc, datos)` (agrega a `tc.compras`, llama `tcRecalcular`) → se crea un gasto espejo en `S.gastosVar` marcado `_esCompraTC` → `refresh()` → `renderTCScreen()`.

**Registrar una compra (desde "Gasto variable", fuente `tc:<id>`):**
Mismo destino final — `addGastoVar()` detecta `fuente.startsWith('tc:')`, valida cupo, y llama al mismo `tcCrearCompra()`. El gasto en `S.gastosVar` se crea una sola vez (no hay doble registro); la diferencia con el camino anterior es solo la pantalla de origen.

**Pagar una tarjeta:**
`abrirPagarTC(tcId)` → validar monto/fuente/saldo disponible en la cuenta de origen → `descontarFuente(fuente, monto)` (saca la plata real de la cuenta) → `tcCrearPago(tc, datos)` (agrega a `tc.pagos`, recalcula deuda) → gasto espejo marcado `_esPagoTC` → `refresh()`.

**Eliminar una compra:**
`eliminarCompraTC(tcId, compraId)` (o la ruta equivalente del feed general) → confirmación → `tcEliminarCompraInterna` (marca `eliminado`, recalcula) → se filtra el gasto espejo de `S.gastosVar` → `refresh()`.

**Eliminar un pago:**
`eliminarPagoTC(tcId, pagoId)` → confirmación → `tcEliminarPagoInterna` (marca `eliminado`, recalcula — la deuda sube de vuelta) → `sumarFuente(fuente, monto)` (la plata vuelve a la cuenta de origen) → se filtra el gasto espejo → `refresh()`.

**Cerrar el ciclo de cuotas de una compra:**
`tcIncrementarCuotaPagada(tcId, compraId, ±1)` — solo mueve el contador informativo `cuotasPagadas`, no toca la deuda ni genera ningún pago.

## 6. Casos especiales

- **Cajita vinculada eliminada:** si `tc.cajitaId` apunta a una cajita que ya no existe, el widget de cobertura no se muestra en el dashboard general (se ignora en silencio); en el detalle de la tarjeta sí se avisa explícitamente, invitando a vincular una nueva desde "Editar tarjeta".
- **Varias tarjetas comparten la misma cajita:** la cobertura se calcula agrupando todas las tarjetas con el mismo `cajitaId` y comparando el saldo de la cajita contra la suma de sus deudas — no contra la deuda de una sola tarjeta a la vez.
- **Tarjeta sin cupo configurado (`tc.cupo` en 0):** no se valida ningún límite al registrar una compra; se trata como cupo infinito.
- **Compra o cargo sin id vinculado (datos de antes de este refactor):** `tcBuscarCompraPorIdOMatch` cae de vuelta a un match por descripción + monto en vez de fallar silenciosamente.
- **Eliminar la tarjeta completa:** solo procede tras confirmación explícita; si tiene `tcMovimientos` vinculados (cargos de encargos/préstamos), se avisa que esas referencias se perderán. Al eliminar, se limpian también los gastos espejo (`S.gastosVar`) y los `tcMovimientos` que apuntaban a esa tarjeta — no quedan huérfanos apuntando a un id inexistente.

## 7. Decisiones de diseño

- **No simular un banco real (sin corte, sin extracto, sin pago mínimo):** el objetivo del módulo es saber cuánto se debe y si alcanza para pagarlo, no replicar el ciclo de facturación de un banco — eso agregaría complejidad (fechas de corte, intereses, pago mínimo) sin aportar a las preguntas que este módulo existe para responder.
- **Widgets de cobertura usan deuda total, no deuda propia:** decisión corregida explícitamente (ver `CHANGELOG.md`) tras confundir "¿me alcanza para pagar?" (pregunta que el banco hace sobre el 100% de la deuda) con "¿cuánta plata es realmente mía?" (pregunta de patrimonio, donde sí importa separar lo propio de lo ajeno).
- **`tcMovimientos` (cargos de Encargos/Préstamos) vive fuera de `tc.compras`:** en vez de forzar a Encargos/Préstamos a empujar registros directo al array de compras de la tarjeta (acoplando su formato interno a otro módulo), se creó un tipo de registro aparte que Tarjetas de crédito solo consume para calcular deuda ajena e historial. Mantiene la frontera clara: quien genera el cargo es dueño de esa entrada.
- **`cuotasPagadas` es puramente informativo:** se consideró que cada cuota generara automáticamente un pago real, pero eso obligaría a decidir de qué cuenta sale cada cuota sin que el usuario lo confirme explícitamente — se prefirió dejarlo como un contador de referencia y que el pago real siga siendo un paso separado y explícito.

## 8. Referencia de implementación

| Función | Qué hace |
|---|---|
| `getTCById(id)` | Busca una tarjeta por id |
| `tcDeudaTotal()` | Suma la deuda de todas las tarjetas |
| `tcCupoUsadoPct(tc)` / `tcCupoDisponible(tc)` | % de cupo usado / cupo restante |
| `calcDeudaAjenaDeTarjeta(tc)` / `calcDeudaTcPropiaDeTarjeta(tc)` / `calcDeudaTcPropia()` | Separan deuda ajena (encargos/préstamos/plata comprometida) de la propia, por tarjeta y agregada |
| `tcEstadoInfo(estado)` | Info de badge/label para `TC_ESTADOS` |
| `tcCalcularValorCuota` / `tcValorUltimaCuota` | Matemática de cuotas |
| `tcRecalcular(tc)` | Única función que escribe `tc.deuda`, desde saldo inicial + compras + cargos − pagos |
| `tcNormalizarTarjetas()` | Migración/auto-sanación, se llama en cada `refresh()`; recalcula deuda de todas las tarjetas |
| `tcCrearCompra(tc, datos)` / `tcEliminarCompraInterna(tc, id)` | Capa de datos de compras |
| `tcBuscarCompraPorIdOMatch` | Fallback de búsqueda para datos legado sin id vinculado |
| `tcIncrementarCuotaPagada(tcId, compraId, delta)` | Contador informativo de cuotas |
| `tcCrearPago(tc, datos)` / `tcEliminarPagoInterna(tc, id)` | Capa de datos de pagos |
| `abrirNuevaTarjeta` / `abrirEditarTC` / `guardarTC` / `eliminarTC` | CRUD de la tarjeta en sí |
| `renderTCScreen` / `renderTCDashboard` | Pantalla completa de Tarjetas / resumen en Inicio |
| `abrirCompraTC` / `confirmarCompraTC` | Sheet "Registrar compra en TC" (valida cupo, ver `CHANGELOG.md`) |
| `abrirPagarTC` / `confirmarPagarTC` | Sheet "Pagar tarjeta" |
| `abrirDetalleTCSheet` | Sheet de detalle: cobertura + historial completo (saldo inicial, compras, cargos, pagos) |
| `eliminarCompraTC` / `eliminarPagoTC` | Eliminar desde el detalle de la tarjeta (con confirmación) |
| `getFuentesSinTC` vs. `poblarFuente(..., incluirTC)` | Listas de cuentas destino (sin TC) vs. origen (con TC), ver regla en §3 |
| `getSaldoFuente` / `descontarFuente` / `sumarFuente` | Genéricas de todo el proyecto; su rama `tc:` es la interfaz que usa el resto de la app para tratar una tarjeta como "cuenta" de origen |

**Puntos de integración externa (no documentados acá, viven en sus propios módulos):** Encargos y Préstamos generan entradas en `S.tcMovimientos` (`cargo_encargo`/`cargo_prestamo`) cuando pagan algo con una tarjeta — ver `encargos.md`/`préstamos.md` para ese flujo. Este documento solo cubre el lado que Tarjetas de crédito posee: cómo esos cargos se leen, sí se sacan de cupo/deuda y sí de deuda ajena, sin volver a explicar cómo se crean.
