# Glosario de dominio — mis-finanzas

Qué palabra se usa para cada concepto del dominio y cómo se escriben los nombres. Regla de fondo (ver [`arquitectura-archivos.md`](./arquitectura-archivos.md) §5): **lo técnico va en inglés; el vocabulario del dominio, en español; un concepto = una palabra; sin abreviaturas opacas.** Lo vigila `tests/convenciones.test.js`.

La columna «Equivalente en inglés» no se usa en el código: está para poder migrar con una herramienta si algún día el repo se comparte con personas que no leen español.

## 1. Cómo se arma un nombre

- **Verbo técnico en inglés + sustantivo de dominio en español:** `getSaldoFuente`, `renderEncargos`, `confirmDelete`.
- **¿Inglés o español?** Si el usuario lo ve o lo nombra en la app → español. Si es mecánica interna → inglés.
- **Formato:** archivos en `kebab-case` (sin `_`, tildes ni mayúsculas); funciones y variables en `camelCase`; objetos globales en `PascalCase`.
- **Orden:** el nombre se lee como en español (`saldoInicial`, `gastoFijo`, `fechaPago`).

## 2. Vocabulario (una palabra por concepto)

| Término | Qué es | No usar para eso | Equivalente en inglés |
|---|---|---|---|
| **cuenta** | Banco, billetera, efectivo o ahorro propio | | `account` |
| **fuente** | Cuenta **o** tarjeta de donde sale o a donde va el dinero | «origen», «cuenta» (si incluye tarjetas) | `fundSource` |
| **origen** | De dónde **vino** un dinero (`regalo`, `mandado`, `deuda`) | «fuente» | `origin` |
| **movimiento** | Entrada o salida de dinero; fuente de verdad (`S.movimientos`) | «transacción», «registro» | `transaction` |
| **movimiento espejo** | Registro que refleja otro en una cuenta | | `mirrorEntry` |
| **libro** | Una entrada por cada cambio de saldo de las cuentas con saldo (`S.libro`) | | `ledger` |
| **saldo** | Dinero que tiene **una cuenta** | | `balance` |
| **balance** | Ingresos menos gastos **de un periodo** | «saldo» | `periodBalance` |
| **patrimonio** | Todo lo que tienes menos lo que debes | | `netWorth` |
| **plata comprometida** | Dinero que ya tiene destino | | `committedFunds` |
| **encargo** | Plata de otra persona que administras | | `custody` |
| **mandado** | Plata que recibes para hacer un mandado | «encargo» | `errand` |
| **mesada** | Pago periódico (de papá/mamá) | | `allowance` |
| **alcancía** | Ahorro oculto | | `piggyBank` |
| **cajita** | Subcuenta de ahorro de Nu | | `savingsPocket` |
| **CDT** | Certificado de depósito a término | | `cdt` |
| **tasa EA** | Tasa efectiva anual | | `annualEffectiveRate` |
| **retención** | Retención en la fuente de los rendimientos de Nu | `rte` | `withholdingTax` |
| **rendimiento** | Interés que generan las cajitas | | `yield` |
| **chequeo rápido** | Control del saldo de una cajita | | `quickCheck` |
| **tarjeta de crédito** | Tarjeta propia (abreviatura oficial: `tc`) | | `creditCard` |
| **cupo** | Límite de crédito de la tarjeta | | `creditLimit` |
| **cargo especial** | Interés o comisión del banco, sin validar cupo | | `specialCharge` |
| **préstamo** | Dinero prestado | | `loan` |
| **me deben / yo debo** | Los dos lados de Prestado | | `owedToMe` / `iOwe` |
| **deudor** | Persona que te debe | | `debtor` |
| **abono** | Pago parcial de una deuda | | `partialPayment` |
| **perdón** | Parte de una deuda que se perdona | | `forgiveness` |
| **extra** | Lo que dan de más al pagar | «propina» | `tip` |
| **regalo** | Dinero regalado | | `gift` |
| **reposición** | Devolver al encargo plata que se usó | | `replenishment` |
| **diferencial** | «El valor real era diferente» (698.000 vs 700.000) | `dif`, «diferencia» | `priceDifference` |
| **margen** | Lo que queda de un diferencial como ingreso | | `margin` |
| **parte(s)** | Reparto de un monto entre cuentas | `splits` como dato (ver §4) | `parts` |
| **split** | Solo el componente técnico de reparto (`split.js`, `crearSplitWidget`) | usarlo como dato guardado | `split` |
| **persona** | Alguien registrado en la app | | `person` |
| **bien** | Activo no líquido (moto, computador) | | `physicalAsset` |
| **periodo / cierre** | Mes o ciclo / cierre de periodos | | `period` / `periodClose` |
| **huella** | Medición de invariantes del cierre | | `fingerprint` |
| **racha** | Meses seguidos con una condición | | `streak` |
| **monto** | Cantidad de dinero de un registro | `valor` | `amount` |
| **valor** | Valor de un bien o de un campo de formulario | `monto` | `value` |
| **desc / nota** | `desc` = descripción del movimiento; `nota` = nota libre de otras entidades | mezclarlos | `description` / `note` |

### «Cobro» tiene tres sentidos: en código nuevo se usan tres nombres

| Sentido | Nombre para código nuevo |
|---|---|
| Spotify le cobra a un integrante | `cobroSpotify` |
| Cobrar una deuda | `cobroDeuda` |
| Recibir un ingreso fijo del mes | `recepcionIngreso` |

## 3. Abreviaturas

**Se conservan (oficiales):** `tc`, `cdt`, `ea`, `nu`, `id`, `ui`, `uid`, `url`, `el`, `btn`, `idx`, `fmt`, `msg`, `val`, `opts`, `args`, `cb`, `ctx`, `tmp`, `pct`, `pin`, `desc`, `cat`, `ts`. (`desc`, `cat` y `ts` también son campos guardados.) También se permite `diff` como término técnico en inglés (calcular la diferencia entre dos conjuntos); para el concepto del dominio se usa `diferencial`.

**Se escriben completas** (las vigila `tests/convenciones.test.js`; el código viejo que aún las usa está en el trinquete `tests/fixtures/convenciones-base.json`, que solo puede bajar):

| Abreviatura | Completo | Abreviatura | Completo |
|---|---|---|---|
| `enc` | `encargo` | `mov` | `movimiento` |
| `movs` | `movimientos` | `sp` | `spotify` |
| `gv` | `gastoVariable` | `gf` | `gastoFijo` |
| `cp` | `plataComprometida` | `alc` | `alcancia` |
| `caj` | `cajita` | `ctc` | `compraConTc` |
| `prtc` | `prestamoConTc` | `movenc` | `movimientoEncargo` |
| `mpp` | `mesadaPagoPendiente` | `rte` | `retencion` |
| `ing` | `ingreso` | `dif` | `diferencial` |
| `inst` | `instancia` | `hist` | `historial` |
| `st` | `estadoActual` | `fb` | `firebase` |
| `og` | `origenLibro` | `ops` | `operaciones` |
| `chk` | `checkbox` | `dest` | `destino` |
| `cont` | `contenedor` | `tt` | `tooltip` |
| `ab` | `abono` | `liq` | `liquidez` |
| `nc` | `nuevaCuenta` | `ad` | `agregarDinero` |
| `mp` | `mesadaPago` | `sc` | `scroller` |
| `sl` | `slide` | `ae` | `elementoActivo` |
| `vk` | `tecladoVirtual` | `md` | `misDeudas` |
| `cpd` | `destinoNuevo` | | |

**No se expanden de forma automática** (significan cosas distintas según el sitio): `reg` y `dd`. `reg` se renombró identificador por identificador: `saldoReg` → `saldoRegistrado`, `swReg` → `swRegistration`, `ultimoReg` → `ultimoRegistro`, `_reg` → `_registro` y la variable local `reg` según el archivo (`registro`, `registration`, `saldoRegistrado` o `registros`); no está vigilada porque `RegExp` la contiene y `__reg` es el registro que los tests inyectan como texto en la página. `dd` son variables locales sin relación entre sí (dígitos decimales, distancia al cuadrado, deudor, días de diferencia) y no se tocan. `md` es **mis deudas** (`S.misDeudas`; la hoja «Mis deudas» de Prestado) y `cpd` es el **destino nuevo** que se arma en la hoja de plata comprometida. `st` se escribe `estadoActual` y no `estado` porque `estado` ya es el parámetro de esas mismas funciones; `og` es el origen **del libro** (`Libro.origen(...)`), por eso `origenLibro` y no `origen`.

## 4. Nombres antiguos que siguen en el código

Se corrigen cuando se toca ese código, no en una campaña aparte:

- `cobros.js` y `tipo: 'cobro'` (los tres sentidos de «cobro»).
- `splits` en `spotify.historial` (el mismo concepto que `partes` en Alcancía, Prestado y Encargos).
- `plata_comprometida` como clave de `config.proteccionAntiguedad` (clave de datos: cambiarla exige migrar datos).
- **Ids y clases del HTML cuyo prefijo es una abreviatura** (`gv_`, `sp_`, `mp_`, `mpp_`, `ctc_`, `prtc_`, `alc-`, `caj-`…), los prefijos con que los widgets de reparto arman sus ids, los ids `adAperturaWrap`, `adMenuDest`, `adMenuMonto` y `nuMovAperturaWrap`, y las claves `mp` y `mpp` del estado de Mesada (salen de ese mismo prefijo). Se dejaron porque cada id se escribe a mano en `index.html`, se compone con prefijos en el JavaScript y se usa en el CSS, y ningún test comprueba el aspecto visual.
- Valores guardados con formatos mezclados (`pago-completo`, `abono_deuda`, `yo-cuenta`, `cargo_spotify`).
