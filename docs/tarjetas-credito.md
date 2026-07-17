# Módulo Tarjetas de Crédito

Referencia técnica del modelo actual de `S.tarjetasCredito[]`. El módulo viejo (ciclos de facturación, fechas de corte, pago mínimo, extracto) fue reemplazado por completo.

El historial de bugs corregidos (incluyendo el del widget de cobertura y el de `eliminarMovimiento`) vive en [`CHANGELOG.md`](./CHANGELOG.md#tarjetas-de-crédito), no acá.

---

## Modelo de datos (`S.tarjetasCredito[]`)

```js
{
  id, nombre, banco, franquicia, color,   // metadata — color/banco/franquicia opcionales visualmente
  cupo,                                    // cupo total
  deuda,                                   // = cupo utilizado = deuda actual (UN SOLO campo)
  estado,                                  // 'activa' | 'bloqueada' | 'cancelada' | 'vencida'
  saldoInicial: {id,monto,fecha,nota,eliminado} | null,
  compras: [{id,desc,cat,fecha,monto,nota,eliminado,
             esCuotas,numCuotas,valorCuota,cuotasPagadas}],
  pagos: [{id,monto,fecha,fuente,nota,eliminado}],
  creadoEn
}
```

**Cupo disponible** nunca se guarda: `tcCupoDisponible(tc) = cupo - deuda`.
**Cupo utilizado** es literalmente el mismo número que `deuda` — no puede desincronizarse porque es el mismo campo.

---

## La regla de consistencia: `tcRecalcular(tc)`

Reconstruye `tc.deuda` sumando `saldoInicial + compras (no eliminadas) + cargos externos (encargos/préstamos pagados con esta TC) - pagos (no eliminados)`, con piso en cero. Se llama después de cada operación y, como red de seguridad, dentro de `tcNormalizarTarjetas()` en **cada** `refresh()`. Si algo se desincroniza en cualquier parte de la app, se autocorrige solo.

---

## Eliminación = marcar, nunca borrar

`compras`, `pagos` y `saldoInicial` usan **soft delete** (`eliminado:true`, se quedan en el array). Los movimientos espejo en `S.gastosVar` (para que reportes/categorías/estadísticas sigan funcionando sin tocarlos) sí se remueven físicamente, porque esos son el "movimiento secundario" y las agregaciones del resto de la app no filtran `eliminado`.

Tres funciones concentran esta lógica y todo el resto del código llama a estas (antes había 3-4 copias distintas):

- `tcCrearCompra(tc, datos)` / `tcEliminarCompraInterna(tc, id)`
- `tcCrearPago(tc, datos)` / `tcEliminarPagoInterna(tc, id)`
- `tcBuscarCompraPorIdOMatch(tc, id, desc, monto)` — busca por id; si no hay id (registros viejos) cae a un match por desc+monto.

---

## Cuotas

`tcCalcularValorCuota(total, n)` redondea `total/n`. La última cuota (`tcValorUltimaCuota`) absorbe el residuo para que la suma cuadre exacto con el total. `cuotasPagadas`/`cuotasRestantes` son un contador manual (+1/-1 en el detalle de la tarjeta) — **no** mueven la deuda; la deuda solo baja con un Pago.

---

## Integraciones con otros módulos

- **Encargos** ("Pagué con mi TC") y **préstamos** ("Presté con mi TC") escriben en `S.tcMovimientos` (`cargo_encargo`/`cargo_prestamo`); `tcRecalcular` los suma.
- **Plata comprometida**: las rutas que tocan `tc.compras`/`tc.deuda` (crear al marcar "ya pagué", crear al "¡Llegó!", y sus reversiones) pasan por los mismos helpers, y guardan `_tcCompraId` para poder revertir por id en vez de por desc+monto.
- Tarjetas **no activas** (bloqueada/cancelada/vencida) desaparecen de todos los selectores de fuente (gasto variable, préstamo vía TC, plata comprometida) pero se pueden seguir pagando y viendo su historial.
- IDs de campos: el sheet directo de "Registrar compra en TC" usa el prefijo `tcc_` (no `ctc_`) porque `ctc_desc/monto/fecha/nota` ya existían — duplicados — en el sheet de "Compra con TC" de encargos.

---

## Migración de tarjetas existentes

`tcNormalizarTarjetas()` corre en cada `refresh()` y es idempotente: agrega campos nuevos con default, e **infiere** un movimiento de "Saldo inicial" para tarjetas viejas a partir de `deuda actual - compras + pagos`, de modo que la deuda que el usuario ya ve **no cambia** — solo queda mejor respaldada por movimientos reales. Los avisos de corte viejos (`tcMovimientos` tipo `corte_aviso`) se purgan solos.

---

## Deuda de TC y patrimonio: cuatro funciones, no una

La deuda de una tarjeta se mide distinto según quién pregunta. No es un descuido tener varias funciones — cada una responde una pregunta distinta y mezclar los cálculos es lo que producía bugs.

| Función | Para qué se usa | Qué mide |
|---|---|---|
| `tc.deuda` | Widgets de cobertura (Inicio y detalle de tarjeta): "¿me alcanza la plata en la cajita para pagarle al banco?" | Deuda **total** real de la tarjeta — el banco cobra el 100% del corte sin importar de quién es moralmente la plata |
| `calcDeudaAjenaDeTarjeta(tc)` | Función interna | Saldo **neto** de deuda ajena de esa tarjeta: bruto de cargos ajenos (encargos/préstamos/plata comprometida) **menos** los pagos ya hechos — nunca puede superar la deuda actual |
| `calcDeudaTcPropiaDeTarjeta(tc)` | Función interna | `tc.deuda − ajena neta` de una tarjeta puntual |
| `calcDeudaTcPropia()` | Salud financiera / tips financieros | Suma de deuda propia neta de todas las tarjetas — nota informativa, no tiene que cuadrar con la aritmética exacta del patrimonio |
| `calcDeudaTcExcluidaPatrimonio()` / `calcDeudaTcParaPatrimonio()` | `calcPatrimonioTotal()` y hero de Inicio | Excluyen encargos y plata comprometida (no tienen activo que los compense), **pero no excluyen préstamos vía TC** — ese dinero ya cuenta como activo (el deudor te lo debe), así que si también se excluyera la deuda se contaría el mismo beneficio dos veces |

**Regla de negocio detrás de `calcDeudaAjenaDeTarjeta`:** un pago cancela primero lo ajeno (encargos/préstamos) y lo que sobra cancela lo propio — porque esa plata ajena es un pasivo de paso que se recupera y se usa específicamente para saldar esa parte de la deuda. Es una decisión de negocio, no algo derivable matemáticamente sin un registro explícito de qué pago corresponde a qué cargo; si en la práctica hay casos donde se paga específicamente para cubrir un gasto propio antes de que devuelvan la plata del encargo, vale la pena revisar esta regla si el número de "deuda propia" se ve raro en algún caso futuro.

---

## Cajita "Tarjeta" — el resumen de Inicio

`renderTCDashboard()` (el widget en Inicio) incluye el sub-label del menú "Más" y el aviso de si la cajita cuyo nombre contiene "tarjeta" alcanza para cubrir la deuda — comparando contra la deuda **total** de todas las tarjetas juntas (no una por tarjeta), porque la pregunta que responde es "¿tengo ahorrado lo suficiente para cubrir lo que debo en tarjetas?", no "esta cajita es de esta tarjeta en particular". Una cajita dedicada por tarjeta sería una función distinta.

---

## Validado

32 pruebas unitarias corridas directamente contra las funciones tal como quedaron en `index.html`: redondeo de cuotas, recálculo de deuda, reversión de compras/pagos, sobrepago, cargos externos, migración/inferencia de saldo inicial e idempotencia. 13 pruebas adicionales sobre las funciones de patrimonio, incluyendo el caso mixto (préstamo + encargo + compra propia en la misma tarjeta) y la prueba clave: prestar plata con la TC no debe mover el patrimonio ni un peso.

---

## Vale la pena probar a mano

- Crear una tarjeta con deuda inicial → revisar que aparezca el movimiento "Saldo inicial" en Ver movimientos.
- Una compra en cuotas (ej. 100.000 en 3) → confirmar que la última cuota queda en 33.334 (no 33.333) para que sume exacto.
- Bloquear una tarjeta → confirmar que desaparece de los selectores de fuente pero se puede seguir pagando.
- Eliminar un pago desde el detalle de la tarjeta → la deuda debe subir y la plata debe volver a la cuenta de origen.
- Prestar plata con la TC (desde un deudor) → el patrimonio del Inicio no debería moverse (el deudor nuevo compensa la deuda nueva). Pagar algo de un encargo con la TC sí debería excluirse de ese mismo cálculo.
- Si tenés la cajita "Tarjeta", revisá que el widget de Inicio siga mostrando si te alcanza para cubrir la deuda total.
