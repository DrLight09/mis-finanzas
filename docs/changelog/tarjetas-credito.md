# Historial: Tarjetas de crédito

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Tarjetas de crédito

## Tarjetas de crédito

### 🔧 Cambio (2026-09-22) — Eliminado un sistema de "cuotas" documentado que no existe en el código

`tarjetas-credito.md` describía un sistema completo de compras a cuotas (`esCuotas`, `numCuotas`, `valorCuota`, `cuotasPagadas`, y las funciones `tcCalcularValorCuota`, `tcValorUltimaCuota`, `tcIncrementarCuotaPagada`) en §2, §4, §5, §7 y §8. Ninguno de esos nombres aparece en `tarjetas_credito.js` — `tcCrearCompra()` no tiene esos campos. Se quitó por completo de las cinco secciones.

También se corrigió la atribución de tres funciones que la Referencia de implementación listaba como propias del módulo sin decir dónde viven de verdad: `getTCById`, `tcCupoUsadoPct` y `tcCupoDisponible` se movieron a `js/core/calc-helpers.js` (comentario propio del archivo, "RESUELTO 2026-08-04"); `calcDeudaAjenaDeTarjeta` y `calcDeudaTcPropia` viven en `js/core/core-state.js`. Se quitó `calcDeudaTcPropiaDeTarjeta`, que no existe en ningún archivo.

(Corrección sobre esta misma entrada: con `core-state.js` a la vista se confirmó que `calcDeudaTcPropiaDeTarjeta` sí existe ahí — se había quitado por error al no tener ese archivo disponible en el momento del primer pase; se restauró con la atribución correcta, junto con `calcSaldoInicialPendiente`. También se corrigió el orden real de cancelación de un pago en §3: primero el saldo inicial pendiente, luego lo ajeno, luego lo propio — antes decía solo "ajena primero, luego propia", sin mencionar el saldo inicial.)
