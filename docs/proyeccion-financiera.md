# Proyección financiera

Documenta la sección **Proyección financiera** de `mis-finanzas` (vive en Inicio, no en `screen-analisis`, pero se alimenta de los mismos snapshots que Análisis financiero). Qué la alimenta, qué la afecta, qué no la afecta, y por qué.

Relacionado: [`analisis-financiero.md`](./analisis-financiero.md) documenta `renderAnalisis()` y comparte con este módulo el historial de patrimonio (`S.patrimonioHistorial`) y `calcPatrimonioTotal()`.

---

## 1. Objetivo

Estima cuánto va a crecer (o decrecer) el patrimonio total en 3/6/12 meses, a partir de la tendencia real de los últimos días — sin pedirle al usuario que proyecte nada a mano.

---

## 2. Cómo funciona (mecanismo central)

La proyección **no** usa ingresos ni gastos registrados directamente. Su única fuente de verdad es el **historial de patrimonio** (`S.patrimonioHistorial`): un snapshot del patrimonio total guardado cada vez que el usuario guarda datos (`save()`), y también automáticamente al abrir la app.

### El pipeline completo

```
Cualquier acción del usuario
        ↓
     save()
        ↓
snapshotPatrimonio()          ← guarda { fecha, valor, montoBase? }
        ↓
calcPatrimonioTotal()         ← calcula el patrimonio real en ese instante
        ↓
S.patrimonioHistorial[]       ← array de hasta 365 snapshots diarios
        ↓
renderProyeccion()            ← lee los últimos 90 días y calcula tendencia
```

### Cómo se calcula la tendencia mensual

`renderProyeccion()` toma los últimos 90 snapshots y construye un array de **tasas de cambio diarias** (COP/día), donde cada tasa es:

```
tasa_día_i = (valor[i] - valor[i-1] - montoBase[i]) / días_entre_i_y_(i-1)
```

El `montoBase` se resta para descontar **saldos iniciales y ajustes de apertura** — plata que no es ingreso real sino corrección de datos. El resto (ingresos, gastos, intereses, rendimientos) queda capturado automáticamente en el cambio de patrimonio.

Con 5+ puntos aplica **trimmed mean** (descarta el día más alto y el más bajo en valor absoluto) para atenuar outliers. Luego multiplica por 30 para obtener la tendencia mensual, y por 3/6/12 para las proyecciones.

### Niveles de confianza

| Días de historial | Badge |
|---|---|
| < 7 | Sin proyección — mensaje de espera |
| 7–29 | PRELIMINAR (ámbar) |
| 30–59 | estimación (sin badge) |
| 60+ | ESTABLE (verde) |

---

## 3. `calcPatrimonioTotal()` — qué suma y qué resta

Esta función es el corazón del módulo. La proyección hereda todo lo que ella incluye o excluye.

### Suma (activos)

| Componente | Fuente en `S` |
|---|---|
| Cajitas Nu (capital + intereses acumulados) | `S.cajitas` → `calcC(c).val` |
| CDTs en cajitas (capital + rendimiento proyectado) | `S.cajitas[].cdts` → `calcCDT(cdt).val` |
| Saldo Nequi | `S.nequiSaldo` |
| Saldo Efectivo | `S.efectivoSaldo` |
| Saldo deudores (lo que me deben, positivo únicamente) | `S.deudores` → `getDeudorSaldoPatrimonio(d)` |
| Cuentas personalizadas marcadas como "incluir en total" | `S.cuentasPersonalizadas` filtrada por `incluirEnTotal` |
| Alcancía oculta (saldo registrado mientras está activa) | `S.alcancia.saldoRegistrado` |

### Resta (pasivos)

| Componente | Fuente en `S` | Motivo |
|---|---|---|
| Deuda total de tarjetas de crédito | `S.tarjetasCredito[].deuda` | Es plata que debo |
| Lo que yo le debo a otras personas | `S.misDeudas` → `totalMisDeudasPendiente()` | Físicamente en mis cuentas pero no es mía |
| Plata comprometida ajena en cuentas propias | `_saldoCPAjeno()` | Plata de otra persona que administro y aún no pagué |

> **Nota sobre `_saldoCPAjeno()`:** solo resta los destinos de plata comprometida que ya llegaron (`item.recibido = true`), son de tipo `gasto` con `gastoOrigen` cajita o TC, y todavía no se pagaron (`yaPague !== true`). Cuando se marca `yaPague`, la plata ya salió de la cuenta y deja de restarse.

---

## 4. Qué afecta la proyección (y cómo)

La proyección cambia cuando `calcPatrimonioTotal()` devuelve un valor diferente al snapshot anterior.

### Spotify

Cobrar cuotas **sí afecta** la proyección: el cobro entra a una cuenta real (`sumarFuente`) → el patrimonio sube. Pagar el plan sale de una cuenta (`descontarFuente`) → el patrimonio baja. El **neto del mes** queda capturado automáticamente en el cambio de patrimonio; no hay registro separado en `S.movimientos` — el efecto llega indirectamente por el cambio de saldo de la cuenta.

### Mesadas

Registrar el pago **sí afecta** la proyección porque la plata entra a una cuenta real. `S.mesadasV2` se usa solo para proyectar cuánto se *espera* recibir; el impacto en la tendencia real llega por el cambio de saldo al momento del pago.

### Tarjetas de crédito

Afectan la proyección de dos maneras:

- **Una compra:** aumenta `tc.deuda` → patrimonio baja.
- **Un pago:** disminuye `tc.deuda` y descuenta la cuenta de pago → neto cero (ya se había restado al comprar).

> La deuda TC que corresponde a encargos (`cargo_encargo`), plata comprometida (`_desdeCP`) y préstamos TC (`cargo_prestamo`) **no se resta del patrimonio** porque es ajena — `calcDeudaTcPropia()` la excluye.

### Encargos

No son patrimonio propio, así que el saldo de un encargo nunca entra en `calcPatrimonioTotal()`. Si el usuario saca un margen/diferencial que entra a una cuenta propia, **eso sí afecta** el patrimonio. Si pone plata propia para cubrir un encargo y luego se la recuperan, el efecto neto es cero.

### Plata comprometida

La ajena que ya llegó y no se ha pagado se resta vía `_saldoCPAjeno()`; al pagarse, sale de la cuenta y deja de restarse (neto cero). La propia no tiene efecto especial: ya está en la cuenta y se refleja normalmente.

### Alcancía oculta

Sí afecta la proyección real aunque esté oculta en el hero de Inicio: `calcPatrimonioTotal()` suma `S.alcancia.saldoRegistrado` mientras está activa. Un depósito externo (regalo, mandado, efectivo sin cuenta) genera ingreso real → sube. Un depósito desde cuenta propia es traslado → no cambia. Al destapar, `saldoRegistrado` se resetea a `0` **antes** de sumar a la cuenta destino, para evitar doble conteo.

### Gastos variables y fijos

Cada gasto descuenta una cuenta real → el patrimonio baja, capturado automáticamente. Excepciones que no afectan el análisis de gastos en pantalla (pero sí el patrimonio al salir de la cuenta): `_esAlcancia`, `esPagoGastoFijo`, `_esPagoTC`.

### Ingresos a cualquier cuenta / intereses

Cualquier flujo que suba el saldo de Nequi, Efectivo, cajita o cuenta personalizada mejora la tendencia. Los intereses de cajitas/CDTs se capturan automáticamente vía `calcC()`/`calcCDT()`, sin acción del usuario.

---

## 5. Qué NO afecta la proyección

- **Transferencias entre cuentas propias:** la suma de activos no cambia.
- **Préstamos a terceros con fuente especificada:** neto cero (una cuenta baja, el saldo deudor sube). **Excepción — sin fuente especificada:** `descontarFuente('')` no hace nada, así que el saldo deudor sube pero ninguna cuenta baja → el patrimonio sube ficticiamente. Es un uso legítimo cuando el usuario sabe que existe la deuda pero no de qué cuenta salió, no un bug.
- **Que alguien me preste plata (con cuenta especificada):** neto cero (la cuenta sube, `misDeudas` sube y se resta). **Excepción sin cuenta especificada:** revisar que `crearMiDeuda()` solo llame `sumarFuente(destino, monto)` cuando `destino` exista — actualmente sí está condicionado así.
- **Saldos iniciales / aperturas:** descontados del cálculo vía `montoBase`.
- **Pagos de TC:** neto cero (baja la cuenta de pago, baja la deuda en igual medida).
- **Gastos de encargos sin diferencial:** el gasto queda registrado en el encargo, no en el patrimonio propio. Solo un margen que entra a cuenta propia cambia el patrimonio.

---

## 6. Resumen por módulo

| Módulo / acción | ¿Afecta proyección? | Mecanismo |
|---|---|---|
| Mesada recibida | ✅ Sí — sube | Entra a una cuenta real |
| Spotify — cobrar cuota | ✅ Sí — sube | `sumarFuente` en la cuenta destino |
| Spotify — pagar plan | ✅ Sí — baja | `descontarFuente` en la cuenta origen |
| Compra con TC propia | ✅ Sí — baja | Aumenta `tc.deuda`, restado del patrimonio |
| Pago de TC | ❌ Neto cero | Baja cuenta de pago + baja deuda TC en igual monto |
| Compra con TC de encargo / plata comprometida | ❌ No | `calcDeudaTcPropia()` excluye esa deuda |
| Encargo — depósito | ❌ No | El saldo del encargo no es patrimonio propio |
| Encargo — margen/diferencial a cuenta propia | ✅ Sí — sube | El diferencial entra a una cuenta real |
| Plata comprometida ajena — recibida y no pagada | ✅ Sí — resta | `_saldoCPAjeno()` la descuenta |
| Plata comprometida ajena — pagada | ❌ Neto cero | Sale de la cuenta, deja de restarse |
| Alcancía — depósito desde cuenta | ❌ Neto cero | Traslado: la cuenta baja, `saldoRegistrado` sube |
| Alcancía — depósito externo (regalo, efectivo) | ✅ Sí — sube | Ingreso real: `S.movimientos` tipo `'entrada'` |
| Alcancía — destapar | ✅ Si hay diferencia positiva | "Dinero extra" es ingreso nuevo tipo `'entrada'` |
| Gasto variable | ✅ Sí — baja | Sale de una cuenta real |
| Gasto fijo pagado | ✅ Sí — baja | Sale de una cuenta real |
| Ingreso a cualquier cuenta | ✅ Sí — sube | Aumenta saldo de la cuenta |
| Intereses de cajita / CDT | ✅ Sí — sube | `calcC()` y `calcCDT()` los incluyen en el activo |
| Transferencia entre cuentas propias | ❌ Neto cero | Un activo sube, otro baja en igual monto |
| Préstamo a tercero (fuente especificada) | ❌ Neto cero | La cuenta baja, el saldo deudor sube |
| Préstamo a tercero (sin especificar fuente) | ✅ Sí — sube ficticiamente | Ninguna cuenta baja, el deudor sube |
| Alguien me prestó (con cuenta destino) | ❌ Neto cero | La cuenta sube, `misDeudas` sube y se resta |
| Saldo inicial / apertura | ❌ Excluido | `montoBase` lo descuenta del cálculo de tendencia |
| Abono de un deudor | ✅ Sí — depende | Entra a una cuenta real (sube) y el deudor baja |
