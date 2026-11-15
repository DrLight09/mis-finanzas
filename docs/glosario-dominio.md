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
| **parte(s)** | Las partes de una alcancía, un diferencial o un encargo (`partes[]`) | confundirlas con `splits` | `parts` |
| **split** | Reparto de un monto entre cuentas (`[{ fuente, monto }]`): el widget `split.js` y el dato `splits` de Gastos, Mesada, Spotify y Cuentas. Es un concepto distinto de las `partes` y conserva su nombre | llamarle `partes` | `split` |
| **persona** | Alguien registrado en la app | | `person` |
| **bien** | Activo no líquido (moto, computador) | | `physicalAsset` |
| **periodo / cierre** | Mes o ciclo / cierre de periodos | | `period` / `periodClose` |
| **huella** | Medición de invariantes del cierre | | `fingerprint` |
| **racha** | Meses seguidos con una condición | | `streak` |
| **monto** | Cantidad de dinero de un registro | `valor` | `amount` |
| **valor** | Valor de un bien o de un campo de formulario | `monto` | `value` |
| **desc / nota** | `desc` = descripción del movimiento; `nota` = nota libre de otras entidades | mezclarlos | `description` / `note` |

### «Cobro» tiene tres sentidos, cada uno en su módulo

«Cobrar» es la palabra natural en los tres casos y **no se renombra**: ninguno comparte lista ni campo con otro, y el módulo ya dice de cuál se trata.

| Sentido | Dónde vive |
|---|---|
| Spotify le cobra a un integrante | `S.spotify.historial` (`tipo: 'cobro'`) |
| Cobrar una deuda | Prestado y Alcancía (`cobro_deuda`) |
| Recibir un ingreso fijo del mes | `js/core/cobros.js`, `ingreso.cobros` |

## 3. Abreviaturas

**Se conservan (oficiales):** `tc`, `cdt`, `ea`, `nu`, `id`, `ui`, `uid`, `url`, `el`, `btn`, `idx`, `fmt`, `msg`, `val`, `opts`, `args`, `cb`, `ctx`, `tmp`, `pct`, `pin`, `desc`, `cat`, `ts`. (`desc`, `cat` y `ts` también son campos guardados.) También se permite `diff` como término técnico en inglés (calcular la diferencia entre dos conjuntos); para el concepto del dominio se usa `diferencial`.

**Se escriben completas** (las vigila `tests/convenciones.test.js`; el trinquete `tests/fixtures/convenciones-base.json` está en **0**: cualquier abreviatura nueva en el código falla la prueba. Solo cuentan los identificadores; los textos y los ids entre comillas no, pero también se escriben completos):

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

## 4. Valores guardados

Los textos que se guardan en los datos (`tipo`, `origen`…) van en **`snake_case`** y, si tienen varios usos, como constante en `js/core/estado.js`; no se repiten como texto suelto (`tests/convenciones.test.js` lo vigila).

| Valor | Dónde | Constante |
|---|---|---|
| `pago_completo` | movimiento de deuda que salda todo lo que faltaba (el parcial es `abono`) | `TIPO_PAGO_COMPLETO`; `esAbonoDeDeuda(tipo)` para «abono o pago completo» |
| `yo_cuenta`, `yo_directo`, `regalo`, `mandado`, `cobro_deuda`, `multi` | `tipo` de los movimientos de Alcancía | `TIPO_ALCANCIA` |
| `abono_deuda`, `cargo_spotify`, `cargo_encargo`… | otros `tipo` | texto (un solo archivo los usa) |

La clave de `config.proteccionAntiguedad` para Plata comprometida es `plataComprometida`.

**Prefijos de id del HTML** (los ids de los sheets llevan el nombre completo del flujo): `mesadaPago…` (Registrar pago de Mesada), `mesadaPagoPendiente…` (Pago de lo pendiente), `agregarDinero…` (menú y sheet de agregar dinero), `nuMovimiento…` (movimiento de Nu). Las claves de estado de Mesada son `registrarPago` y `pagoPendiente`.

## 5. Lo que se dejó como está, a propósito

No son pendientes: se evaluaron y se decidió no tocarlos (el razonamiento está en [`guia-de-renombres.md`](./guia-de-renombres.md)).

- **Clases CSS con prefijo abreviado** (`ix-`, `cp-`, `an-`, `enc-`, `pe-`, `alc-`, `mdet-`, `pr-`, `ms-`, `sp-`…; 1.206 clases) y los ids del HTML de esos mismos módulos: el JavaScript los compone con prefijos y ningún test comprueba el aspecto. Se renombran al rediseñar cada pantalla; mientras tanto un trinquete (`scripts/convenciones-css.js`) impide que aparezcan clases nuevas con prefijo abreviado, y las reglas para clases nuevas están en `guia-estilo-sheets.md` §0 bis.
- **`splits` vs `partes`:** dos conceptos distintos (ver §2).
- **«Cobro»:** tres sentidos, uno por módulo (ver §2).
- **`dd`:** variables locales sin relación entre sí.
- **`mesadas.papa` / `mesadas.mama`:** claves fijas con nombres familiares; cambiarlas es rediseñar el modelo con una clave neutral.
- **Ruta de Firestore `usuarios`:** cambiarla exige modificar las reglas en la consola de Firebase.
- **Código en inglés:** la columna «Equivalente en inglés» existe por si algún día se publica el repo.
