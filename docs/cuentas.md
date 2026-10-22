# Módulo Cuentas

Documentación de la sección **Cuentas** de `mis-finanzas` (`index.html` → `js/modules/cuentas.js`; Nu vive aparte, en [`nu.md`](./nu.md) / `js/modules/nu.js`, y se apoya en este archivo: la dependencia va en un solo sentido, Nu → Cuentas; ver §7). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos guarda y por qué, cómo fluye la información, y qué decisiones de diseño se tomaron. Los detalles de implementación (funciones, ids de sheets) aparecen al final, como referencia rápida — no como el foco del documento.

Los bugs ya corregidos viven en [`CHANGELOG.md`](./CHANGELOG.md#cuentas), no acá.

---

## 1. Objetivo

Es la vista de "cuentas de plata líquida": Nequi, Efectivo, cualquier cuenta personalizada (otros bancos/apps) y Nu — que además de ser una cuenta normal, funciona como cajitas de ahorro con tasa variable y la posibilidad de invertir en CDTs. Permite ver saldo y movimientos de cada una, mover plata entre ellas, y corregir errores (saldo inicial, chequeos manuales contra la app real de Nu).

A diferencia de Spotify, Mesada o Encargos — que registran la actividad propia de un proceso de negocio — Cuentas es sobre todo una **ventana**: la mayoría de lo que se ve en el historial de una cuenta lo generaron *otros* módulos (un cobro de Spotify, una mesada, un abono de un préstamo) y llega acá como movimiento espejo, no como dato propio de Cuentas.

---

## 2. Conceptos importantes

**Nu:** la cuenta con cajitas, tasa EA, CDTs, metas y chequeo rápido tiene su propia documentación y su propio archivo: [`nu.md`](./nu.md) (`js/modules/nu.js`). Acá solo está lo que Nu comparte con las demás cuentas (selector, detalle, historial, agregar/retirar/transferir).

**Cuenta rastreable:** Nequi, Efectivo, una cajita de Nu o una cuenta personalizada — cualquier cuenta cuyo saldo vive en `S` y puede recibir/perder plata de forma rastreada. Se identifican con una `fuente` (`'nequi'`, `'efectivo'`, `'cajita:ID'`, `'custom:ID'`) — el mismo formato que usa el resto de la app para "¿de dónde sale / a dónde entra la plata?" en cualquier sheet.

**Saldo inicial / apertura:** el monto que ya tenías en una cuenta al empezar a registrarla en la app — no es un ingreso real, es una foto de un momento. Se guarda como un movimiento con `tipo:'apertura'` para no confundirlo con crecimiento real en el historial de patrimonio (ver `montoBase` en `analisis-financiero.md §5`).






---

## 3. Reglas que nunca deben romperse

- **"Mover a otra cuenta" solo se puede usar con saldo ≥ $1,00 en esa cuenta.** El botón queda deshabilitado (`actualizarBotonesTransferir()`) y el origen de Transferir nunca lista cuentas vacías; el **destino** sí puede estar vacío, porque la plata entra. La regla de "qué cuentas se ofrecen cuando la plata sale" vive en `js/core/fuentes-filtro.js` (`FuentesFiltro`), no se repite en cada sheet. **Origen y destino nunca pueden ofrecer la misma cuenta a la vez**: elegir una cuenta en un lado la quita de las opciones del otro (`_trPodarSelect`, mismo patrón de exclusión mutua que usan las filas de Dividir en `js/core/split.js` — ver §8), en vez de solo avisar el error después de elegir mal.
- **Transferir respeta la plata "real":** los centavos solo se pueden mover entre cajitas de Nu. Si el origen o el destino es Nequi, Efectivo o una cuenta personalizada, el monto tiene que ser un número entero de pesos (ej. de una cajita a Nequi se pueden mover $9 o $10, nunca $9,90). Además, si Efectivo participa en cualquiera de los dos lados, el mínimo es $50. Es una validación del *monto* — no filtra qué cuentas se ofrecen — y se aplica igual en la vista previa (mensaje ámbar) y al confirmar, con la misma función (`validarTransferencia`, ver §Funciones).
- **Las tarjetas de crédito nunca son un destino válido para dinero que entra** — ni "Agregar dinero", ni el menú `+` del header, ni "Transferir" permiten una TC como destino. Sí se puede pagar *con* una TC en otros módulos (genera deuda), pero nunca "guardar" plata ahí.
- **Todo movimiento que otro módulo genera dentro de una cuenta (mesada, cobro de Spotify, abono de un préstamo, encargo) se ve en el historial de esa cuenta marcado como "Automático" y protegido contra borrado directo** — solo se puede deshacer desde el módulo que lo originó, nunca desde el historial de la cuenta. Cuentas es quien *muestra* la protección (candado 🔒, ícono de eliminar bloqueado), no quien la implementa por cuenta propia — cada módulo marca sus propios movimientos.
- **Eliminar un movimiento revierte exactamente la plata de ese movimiento, ni más ni menos** — incluyendo una transferencia, donde hay que revertir **ambos lados** (restar de donde entró, devolver a donde salió). Revertir es **añadir una entrada `reversion` al libro** (mismo `ref`, `rev: true`), no borrar; y como todas las cuentas guardan su historial en `S.movimientos`, `eliminarMovimiento()` no distingue convenciones por tipo de cuenta (solo el `tipo` de la salida manual, ver §4).
- **El saldo nunca se recorta en 0.** `descontarFuente()` (`core-state.js`) registra la salida completa aunque supere el saldo: la cuenta queda negativa y visible (un negativo es un movimiento mal registrado, y se ve en vez de perderse la diferencia). Antes tenía piso en 0 y la reversión debía pedir `{ exacto: true }`; esa opción ya no existe (`libro-de-movimientos.md` regla 5; ver `CHANGELOG.md#libro-de-movimientos`). Los saldos negativos se muestran tal cual.
- **El saldo inicial (apertura) es un movimiento especial, no un ingreso normal** — nunca debe sumarse como "ingreso del mes" en Análisis financiero, y corregirlo (`abrirEditarApertura`) nunca debe borrar y recrear el movimiento como si fuera nuevo, porque eso perdería su fecha original y afectaría el historial de patrimonio.
- **Una persona puede pagar/mover plata en la misma cuenta varias veces**; ningún cálculo de saldo o de intereses debe asumir "un solo movimiento por día/mes".
- **Todo movimiento de Alcancía que aparezca en el historial de una cuenta se pinta con el monto oculto (`••••`) y sin abrir el detalle** (desde 2026-09-19). Cuentas sí muestra la fila — es plata que salió (o pasó por) esa cuenta — pero nunca el monto, para que mientras la alcancía esté activa el total no pueda reconstruirse sumando filas. La marca es `_alcOculto` (y el `tipo` de esas filas es `'alcancia'`, con su propio chip de filtro y badge ámbar — nunca `'gasto'`/`'ingreso'`), que pone `getMovimientosCuenta()` (gastos `_esAlcancia` y entradas `_esAlcanciaIngreso`) y consume `renderMovsCuenta()`. Esas filas **no** llevan `data-mov-monto` ni abren detalle, pero **sí deben seguir en la lista** con su efecto real sobre el saldo (un depósito desde la cuenta pesa `−monto`; un ingreso neto-cero `_esAlcanciaIngreso` pesa `0`, porque `alcancia.js` suma y resta lo mismo) — `abrirDetalleMov()` reconstruye el Antes/Después de las demás filas sumando `getMovimientosCuenta()`, así que quitar una fila de la lista descuadra los saldos históricos de todo lo anterior. Cualquier tipo de cuenta nuevo o función nueva que arme filas de historial tiene que propagarla; los movimientos del destape (`Alcancía destapada…`, ajuste) no se marcan a propósito, porque el total ya se reveló. Ver `alcancia.md` §3/§7.
- **`renderMovsCuenta` reconstruye el historial en vivo desde todas las fuentes que tocan esa cuenta** (`S.movimientos`, `S.gastosVar`, préstamos, Spotify, transferencias y las entradas del libro sin fila propia) — Cuentas no mantiene su propio ledger paralelo. Si un módulo nuevo empieza a mover plata hacia/desde una cuenta, tiene que aparecer en esta reconstrucción o quedará invisible en el historial de esa cuenta aunque el saldo sí se haya movido.

---
- **Todo espejo nuevo se escribe con `registrarMovEspejo()` y nace con `_esEspejo: true`.** Un módulo nuevo no debe escribir a mano en `S.movimientos` una fila automática: sin la bandera, el ingreso del mes la contaría como plata nueva. Si el espejo SÍ es plata nueva (extra, perdón, diferencial), se marca con la bandera de ingreso correspondiente en `extra`.
- **Toda salida manual de cualquier cuenta es `tipo: 'salida_manual'`.** El tipo `'egreso'` (que se mostraba solo para las personalizadas) se eliminó el 2026-10-18: su rama de borrado en `movimientos.js` hacía exactamente lo mismo que la de `salida_manual`.
- **Retirar dinero no se ofrece sin saldo:** el botón "Retirar dinero" de Nequi, Efectivo, cuentas personalizadas y cajitas sale deshabilitado con saldo menor a $0,01, y `abrirRestarDinero` lo vuelve a comprobar (se reevalúa en cada `refresh()`). Un monto mayor al saldo nunca se aplica.
- **Toda salida de una cuenta comprueba el saldo ANTES de escribir.** `descontarFuente()` ya no recorta: registra el monto completo y la cuenta queda en negativo, así que sin la comprobación el historial mostraría un saldo negativo por un movimiento que no debió permitirse. Lo hacen Transferir (`validarTransferencia`), Retirar dinero, "Salió plata de Nu", Gastos y Spotify; mismo mensaje: "Saldo insuficiente en X".

## 4. Modelo de datos

```js
// Modelo único de cuentas. Helpers en core-state.js: getCuenta(id), getCuentaCustom(id), cuentasCustom(),
// getCuentaDeFuente(fuente). `_cuentasArr()` garantiza que S.cuentas exista y traiga Nequi y Efectivo
// (se crean en 0 si faltan). Nu va aparte, en S.cajitas (ver nu.md).
S.cuentas = [
  { id: "nequi",    tipo: "nequi",    saldo: 1500000 },   // cuentas fijas: nombre/color en CUENTAS_FIJAS (core-state.js)
  { id: "efectivo", tipo: "efectivo", saldo: 38000 },
  { id: "uid", tipo: "custom", nombre: "Bancolombia", saldo: 300000, icono: "bank", color: "#60b0f0" }
  // Ninguna cuenta guarda su propia lista de movimientos: el historial de TODAS vive en S.movimientos (abajo).
]
```


### Cómo se guarda un movimiento de una cuenta

**Una sola lista:** el historial de **todas** las cuentas (Nequi, Efectivo, cajitas `cajita:ID` y personalizadas `custom:ID`) vive en `S.movimientos`; el campo `fuente` dice a qué cuenta pertenece. No existen `cuenta.movimientos` ni `cajita.historial` (se retiraron el 2026-10-12; ver `libro-de-movimientos.md` regla 9). Cada fila: `{ id, tipo, fuente, monto, fecha, desc, clase, … }`, con `tipo` `'entrada'` · `'salida'` · `'salida_manual'` · `'apertura'` · `'transferencia'`.

Hay **dos tipos de movimiento**, que comparten lista pero no origen:

**1. Manual** (el usuario agrega, retira o abre saldo desde un sheet): `'entrada'` · `'salida_manual'` · `'apertura'` · `'transferencia'` (intercambios de Encargos).

**2. Espejo / automático** (un módulo mueve plata dentro de una cuenta y deja el rastro visible): lo escribe `registrarMovEspejo()` (`cuenta-efectos.js`), siempre en `S.movimientos`, con `tipo` `'entrada'` / `'salida'` y el texto en `desc`. Todo espejo lleva `_secundario: true` (automático y protegido contra borrado directo desde el historial de la cuenta), `_origenSeccion` (el módulo que lo creó) y `_esEspejo: true`. Las banderas de "sí es ingreso" que se pasen en `extra` (`_esExtraIngreso`, `_esPerdonRecibido`, `_esDiferencialEncargo`) tienen prioridad sobre `_esEspejo`.

**El saldo no sale de esta lista.** Cada cambio de saldo pasa por la puerta única (`sumarFuente` / `descontarFuente` / `ajustarSaldoCuenta`) y deja una entrada en `S.libro`; las entradas del libro sin fila propia (intereses, ajustes, CDT) salen en el historial como filas con candado. Ver `libro-de-movimientos.md`.

**Lo que no pasa por `registrarMovEspejo()` a propósito:**
- **Préstamos dados ("Me deben")**: no tienen espejo; el historial los reconstruye leyendo `Deudas.lista('favor')`.
- **Mesada**: su espejo lo escribe `_registrarMovSecundarioMesada()`, que llama a `registrarMovEspejo()` con `origen: 'Mesada'` (`clase: 'neutro'`: el ingreso de la mesada ya se cuenta en `Periodo.mesadaDelMes`). No volver a sintetizarlo leyendo `S.mesadas`.
- **Alcancía** y **Encargos** escriben con su propia forma (Alcancía: transferencias; Encargos: transferencias e ingresos reales), porque Inicio y los ingresos del mes dependen de esos campos.

**Qué se muestra y qué se borra:** `getMovimientosCuenta()` entrega la salida manual como `'salida_manual'` en **todas** las cuentas (etiqueta "Retiro", texto por defecto "Retiro"; la entrada, "Ingreso"). `movimientos.js` elige la rama de borrado y de reversión según ese tipo; antes las personalizadas usaban `'egreso'` con una rama idéntica, por eso se retiró (2026-10-18).

**`_movsFilters`:** estado de los filtros de búsqueda/tipo/fecha por cuenta (`{ [cuentaKey]: {q, tipo, desde, hasta} }`) — vive solo en memoria del navegador mientras la pantalla está abierta, no se persiste a Firestore. Es intencional: son filtros de exploración, no una preferencia que valga la pena sincronizar entre dispositivos.

---

### Clase de los movimientos (2026-10-09)

Desde 2026-10-09 todo movimiento de ingreso/gasto lleva `clase` (`ingreso` · `gasto` · `neutro` · `ajuste`), escrita al crearlo, y los totales del mes (`Periodo`) la leen en vez de deducirla de etiquetas. Ver `plan-clasificacion-movimientos.md` y `CHANGELOG.md#infraestructura--seguridad`.

- **Agregar dinero** (`registrarEntradaConApertura()` y la entrada desde el menú de movimientos): `clase: 'ingreso'`. **Apertura de cuenta** (`crearMovimientoApertura()`): `clase: 'ajuste'` (no es actividad real).
- **Retirar dinero** (`registrarSalida()`, `tipo: 'salida_manual'`): `clase: 'gasto'`. Es el opuesto de agregar dinero; como se usa para cuadrar la diferencia entre lo registrado y lo real, cuenta como gasto del mes (categoría `Ajuste`, `Periodo.retirosManuales()`). Borrarlo lo quita del gasto.
- **Espejos** (`registrarMovEspejo()`): `clase: 'neutro'` por defecto; `'ingreso'` si el módulo lo pide o `extra` trae `_esExtraIngreso` / `_esPerdonRecibido` / `_esDiferencialEncargo`. El historial de una cajita solo lo escribe `registrarMovEspejo()`: un espejo suyo con `clase: 'ingreso'` (extra de Spotify, extra de un pago) **sí cuenta como ingreso del mes**; sin esa clase es neutro.
- **Rendimientos por mes:** `materializarIntereses(c)` anota lo ganado en cada mes en `c.rendimientos` (`{ 'YYYY-MM': pesos }`) antes de fundirlo en el saldo; no es un movimiento ni toca el historial. `calcC(c, hasta)` acepta una fecha y `rendimientoCajitaPorMes(c)` (`nu-calc.js`) reparte por mes el interés aún sin materializar. `Periodo.rendimientosDelMes(mes)` suma ambos + el rendimiento de los CDT.

## 5. Flujo

### Agregar dinero a Nequi/Efectivo/cajita/cuenta personalizada

```
Elegir cuenta (o ya viene fija si se entró desde el detalle de esa cuenta)
  ↓
¿Es saldo inicial? → toggle explícito (ver §3) — mismo sheet y mismo toggle
                      para las cuatro, desde 2026-09 (ver CHANGELOG.md#cuentas)
  ↓
Elegir origen ("¿de dónde viene esta plata?") — obligatorio, TC excluida
  ↓
Monto + fecha + nota opcional
  ↓
Confirmar → sumarFuente(cuenta, +monto) + movimiento en S.movimientos
```

### Transferir entre cuentas

```
Elegir cuenta origen (solo cuentas con saldo ≥ $1,00 — TC excluida) y cuenta destino (TC excluida, sin filtrar por saldo)
  ↓
Monto (sin centavos si alguna de las dos cuentas no es una cajita de Nu; mín. $50 si interviene Efectivo; con validación de saldo suficiente en origen)
  ↓
Confirmar → descontarFuente(origen, monto) + sumarFuente(destino, monto)
  ↓
Un movimiento tipo:'transferencia' que registra ambos lados
```

### Eliminar un movimiento

```
eliminarMovimiento (punto de entrada único, compartido con toda la app)
  ↓
¿Es un movimiento "Automático" (marcado por otro módulo)? → bloqueado, avisa que se borre desde el módulo dueño
  ↓
Si es propio de Cuentas: revertir la plata de la cuenta (o de AMBAS cuentas si era una transferencia)
  (la reversión pasa el mismo `ref` con `rev: true` y deja una entrada `reversion` en el libro; ver §3)
  ↓
Cualquier cuenta (también las personalizadas): el registro vive en S.movimientos, con `fuente`
```

---

## 6. Casos especiales

- **Cuenta personalizada eliminada con movimientos:** al eliminar la cuenta se pide confirmación explícita; el historial de movimientos de esa cuenta se pierde junto con la cuenta (a diferencia de, por ejemplo, un integrante de Spotify, donde el historial de cobros sobrevive porque vive en `spotifyHistorial`, no dentro del integrante).
- **Filtro de movimientos sin resultados:** muestra un estado vacío explicando qué filtro está activo, no una lista en blanco sin contexto.
- **Ninguna cuenta con saldo ≥ $1,00 al abrir "Transferir":** el sheet no se abre y `abrirTransferir()` avisa con un toast (cubre el botón del menú `+` y el de "Agregar dinero", que no pasan por los botones de cada cuenta). Los botones "Mover a otra cuenta" de cada cuenta ya están deshabilitados en ese caso.
- **Depósito a la Alcancía en el historial de una cuenta** (2026-09-19): aparece como una fila normal ("Depósito en alcancía", fecha, badge "Alcancía", candado) con `••••` en vez del monto; tocarla no abre el detalle. Vale para Nequi, Efectivo, cajitas de Nu (en la lista de Nu) y cuentas personalizadas. Para borrarlo hay que ir a Alcancía (`alcanciaEliminarDeposito`), nunca desde acá — incluso los depósitos viejos (anteriores a 2026-08-06, sin `_secundario`) salen bloqueados por la misma razón. También se ocultan (con el mismo `••••`) en la búsqueda global; Actividad reciente no los lista. Antes de esa fecha el historial se comportaba distinto según el tipo de cuenta: Nequi/Efectivo/Nu no mostraban la fila y las cuentas personalizadas sí, con el monto a la vista (ver `CHANGELOG.md#cuentas`).
- **Movimiento sin destino especificado en otro módulo** (ej. mesada con "No especificar / lo gasté"): no aparece en el historial de ninguna cuenta porque nunca tocó ninguna — comportamiento esperado, no un bug de Cuentas.
- **Cobro de Spotify sin `id` en `S.spotify.historial`** (historial legado, de antes de que la app le asignara `id` a cada cobro): `getMovimientosCuenta()` usa un `_movId` de respaldo (`'sp_legacy_' + índice del registro en spotifyHistorial`) para que el ítem conserve un orden estable y siga marcado como "Automático" — no puede eliminarse directo desde Cuentas de todas formas, igual que cualquier otro movimiento secundario (ver `CHANGELOG.md#cuentas`, 2026-08-30).

---

## 7. Decisiones de diseño
- **Una sola nomenclatura:** "Agregar dinero" / "Retirar dinero" en Nequi, Efectivo, cuentas personalizadas, Nu y cajitas (botones, títulos de sheet y movimientos del historial). Encargos conserva "Entró plata / Salió plata" porque no es una cuenta propia.
- **Toast por tipo de operación:** `ok` verde (éxito, plata que entra), `salida` rojo con flecha (plata que sale: retirar dinero de una cuenta o de Nu), `err` rojo con X (algo salió mal), `info` azul (neutro). Cada toast lleva su ícono en un círculo del color del tipo y se anuncia como `status` (los errores, `alert`). Gastos y transferencias siguen con sus tipos actuales.

- **El historial de una cuenta se lee de una sola lista (`S.movimientos`) más lo que no es un movimiento de cuenta** (gastos variables, préstamos dados, transferencias, cobros de Spotify y las entradas del libro sin fila propia). `getMovimientosCuenta()` los junta en vivo; el saldo, en cambio, se guarda y se verifica contra el libro (`libro-de-movimientos.md`). Alternativa descartada: que cada módulo escribiera además una copia propia en un array de Cuentas (dos fuentes de verdad para la misma plata).
- **Cuentas personalizadas ya no tienen convención propia.** Antes usaban `ingreso`/`egreso` en `c.movimientos`; desde 2026-10-12 todo vive en `S.movimientos` con `fuente: 'custom:ID'`, incluido el saldo inicial (`crearCuentaCustom()` escribe la apertura ahí y en el libro). Ya no queda ninguna diferencia de tipo ni de texto entre las cuentas (2026-10-18).
- **Cuentas es la capa genérica; Nu es una capa encima (2026-10-18).** `cuentas.js` no nombra nada de `nu.js`: una cuenta con pantalla propia se registra en `CuentaPantallas` (`core-state.js`) y Cuentas le pregunta lo que necesita (`abrirCuenta`, `volverSelector`, `renderDetalleCuenta`, `_showCuentasPanel`, `actualizarBotonesTransferir`). El descriptor del selector lleva `pantallaPropia: true` y, sin la pantalla registrada, tocar esa cuenta no hace nada. Lo que Nu toma de aquí es una lista cerrada (cabecera de `nu.js`, vigilada por `cuentas.test.js`). Detalle y porqué: `nu.md` §7.
- **La identidad de Nequi, Nu y Efectivo vive en un solo sitio (`CUENTAS_FIJAS`, `core-state.js`); lo que solo necesita Cuentas lo agrega `cuentas.js`.** Antes el nombre, el color y la clase del badge estaban escritos a mano en cuatro lugares (`fuenteLabel`, `fuenteBadgeClass`, `getFuentes`/`getFuentesSinTC` y el descriptor del selector), así que cambiar el color de una cuenta fija o agregar una nueva implicaba acordarse de todos. Alternativa descartada: dejar el descriptor completo en `cuentas.js` y que el núcleo lo consulte con `typeof`; `cuentas.js` es lazy y `fuenteLabel()` se llama desde Inicio, Actividad y los sheets antes de que cargue. Por la misma razón el ícono y el saldo (`nuTotal()` es de `cuentas.js`) NO están en `CUENTAS_FIJAS`: el núcleo no puede depender de ellos. Para agregar una cuenta fija nueva: una entrada en `CUENTAS_FIJAS` y una en `_SELECTOR_FIJAS_EXTRA`. `getFuentes()` y `getFuentesSinTC()` son la misma lista (`_listaFuentes(incluirTC)`), con y sin tarjetas.

---
- **Ya no existe la migración `migrarCuentasLegacy()` (eliminada el 2026-10-05).** Convertía `nequiSaldo`, `efectivoSaldo` y `cuentasPersonalizadas` a `S.cuentas` en `load()`, en `importarJSON()` y en cada lectura. Se quitó porque el único documento existente ya estaba migrado y las cuentas nuevas nacen en el modelo actual. Lo único que se conserva es la garantía de `_cuentasArr()`: `S.cuentas` siempre existe y siempre trae Nequi y Efectivo. Consecuencias: (1) `_validarEstructuraJSON()` (`configuracion.js`) rechaza con un mensaje claro un backup anterior al 2026-10-01 que traiga los campos viejos y no `cuentas`, en vez de importarlo con las cuentas en cero; (2) un dispositivo con la versión anterior de la app ya no tiene quien le convierta sus campos, así que no debe volver a abrirse. Si algún día hace falta importar un backup viejo, está en el historial de git (CHANGELOG, "Modelo único de cuentas").

## 8. Referencia de implementación

### Sheets (ver `guia-estilo-sheets.md` para el detalle de campos y orden)

Los sheets de Nu (`nu-movimiento`, `crear-cdt`, `cobrar-cdt`, `meta-cajita`, `chequeo-nu`, `confirmar-tasa-nu`) están en [`nu.md`](./nu.md).

| Sheet | Qué hace |
|---|---|
| `sheet-nueva-cuenta` | Crear cuenta personalizada (nombre, saldo inicial, ícono, color) |
| `sheet-agregar-dinero` | Agregar dinero a Nequi/Efectivo/cuenta personalizada (con toggle de saldo inicial) |
| `sheet-agregar-dinero-menu` | Igual, pero desde el botón `+` del header sin cuenta preseleccionada (la tarjeta del menú dice "Agregar dinero") |
| `sheet-restar-dinero` | Retirar dinero de Nequi/Efectivo/cuenta personalizada (solo se abre con saldo) |
| `sheet-editar-apertura` | Corregir el saldo inicial ya registrado (Nequi/Efectivo/cuenta personalizada) |
| `sheet-transferir` | Transferir entre dos cuentas cualquiera (TC excluida; origen solo lista cuentas con saldo ≥ $1,00) |

### Funciones clave

| Función | Qué hace |
|---|---|
| `renderSelectorCuentas()` | Pinta la pantalla "Selecciona una cuenta" desde una sola lista de descriptores: `CUENTAS_FIJAS_SELECTOR` (Nequi, Nu, Efectivo) + las personalizadas de `S.cuentas`. Los datos de identidad de las tres fijas (nombre, color, `rgb`, badge) NO se escriben acá: vienen de `CUENTAS_FIJAS` (`core-state.js`) y `cuentas.js` solo les suma lo suyo (estilo del selector, ícono, saldo) en `_SELECTOR_FIJAS_EXTRA`. Estilo `tarjeta` (grid de 2) o `pastilla`; el clic es un único listener delegado sobre `#selector-cuentas-lista` (`data-fuente`). El saldo pasa siempre por `fmtSaldoSelector()` (`core-state.js`). El botón de ocultar saldos (`mejoras-adicionales.js`) depende de dos ids: `#selector-cuentas-lista` (en `SALDO_DINAMICO_IDS`) y `#det-cuenta-saldo` (en `MONEY_SELECTORS`); si se renombran, actualizar esas listas |
| `abrirCuenta(fuente)` / `volverSelector()` | Navegación entre el selector de cuentas y el detalle de una. `fuente` es `'nequi'`, `'nu'`, `'efectivo'` o `'custom:ID'`; una cuenta con pantalla propia (Nu) abre la que registró en `CuentaPantallas` y todas las demás comparten `cuentas-detalle-simple`; ambas reinician el estado de esas pantallas (`_reiniciarPantallasCuenta`) |
| `renderDetalleCuenta(fuente)` | Pinta el detalle de la cuenta abierta. Si la cuenta tiene pantalla propia (Nu: `renderDetalleNu()` en `nu.js`, ver `nu.md`) delega en ella; si no, `_renderDetalleSimple`: nombre, ícono, color (`--cuenta`/`--cuenta-rgb` sobre `#cuentas-detalle-simple`), saldo, banner de saldo inicial, encargos y movimientos, a partir del descriptor de la cuenta (`_descriptorCuenta`). Los botones del detalle son un único listener delegado que actúa sobre `cuentaActual` (la fuente de la cuenta abierta: `'nequi'`, `'nu'`, `'efectivo'` o `'custom:ID'`; una sola variable) |
| `validarSalidaFuente(fuente, monto)` (`core-state.js`) | ¿Se puede sacar `monto` de esa fuente? Devuelve `{ok:true}` o `{ok:false, mensaje}` con el mensaje ya escapado y listo para `toast()` ("Saldo insuficiente en X. Disponible: $N", o "Cupo insuficiente…" para una TC con cupo configurado). La usan Gastos y Spotify; Cuentas conserva sus propias validaciones (`validarTransferencia`, restar dinero) con su redacción, cubiertas por tests |
| `_tituloCuentaHtml(d)` | Título del header de cualquier detalle de cuenta: ícono (28 px) + nombre, siempre a partir del descriptor. Lo usan `_renderDetalleSimple` (Nequi, Efectivo, personalizadas) y la rama de Nu de `renderDetalleCuenta`, así ninguna cuenta queda con el título como texto suelto. Un cambio de logo o de nombre en el descriptor se ve en el selector y en el detalle |
| `CUENTAS_FIJAS` / `getCuentaFija(fuente)` (`core-state.js`) | Fuente única de identidad de las cuentas fijas: `{fuente, nombre, color, rgb, badge}` para `nequi`, `nu` y `efectivo`. La leen `fuenteLabel()`, `fuenteBadgeClass()`, `getFuentes()`/`getFuentesSinTC()` y el descriptor de `cuentas.js`. Está en el núcleo (carga de entrada) y no en `cuentas.js` porque ese archivo es lazy y esas funciones se usan desde todos lados |
| `getMovimientosCuenta(tipo)` | Reconstruye el historial de una cuenta desde todas las fuentes que la tocan (ver §7): `S.movimientos` por `fuente`, gastos variables, préstamos dados, transferencias, cobros de Spotify y las entradas del libro sin fila propia. **Una sola función** para Nequi, Efectivo, cajitas (`'nu'` = todas las cajitas) y personalizadas (`'custom:ID'`). Un bloque por fuente y un predicado `coincide(fuente)`. Todas las cuentas se leen igual (mismo tipo de salida manual y mismos textos). Nu la usa para su propio historial (`nu.js`). Prueba dorada: `tests/historial-cuenta.test.js` |
| `renderMovsCuenta(cuentaKey)` | Aplica filtros y pinta la lista de movimientos, con protección de borrado para los "Automático" y monto oculto (`••••`, sin detalle) para las filas con `_alcOculto` (depósitos a Alcancía) |
| `abrirTransferir(origen?)` / `confirmarTransferir()` | Sheet y confirmación de transferencia entre cuentas |
| `validarTransferencia({origen, destino, monto, saldoOrigen, etiquetaOrigen})` | Valida TODA la transferencia sin tocar el DOM. Devuelve `{ok:true}` o `{ok:false, codigo, mensaje}` con `codigo` en `falta_cuenta` · `mismo` · `sin_monto` (0, negativo, NaN, Infinity) · `monto` (centavos fuera de cajita↔cajita, mínimo $50 con Efectivo) · `saldo`. El orden de las comprobaciones es parte del contrato. Lo usan la vista previa y `confirmarTransferir()`. Constante `TR_MIN_EFECTIVO`. Tests: `tests/transferir.test.js` |
| `_trPodarSelect(selId, fuentes, valExcluir)` / `_trOrigenCambio()` / `_trDestinoCambio()` | Exclusión mutua origen/destino: al cambiar uno, quitan del otro la cuenta recién elegida (conservando la selección vigente si sigue disponible) |
| `actualizarBotonesTransferir()` | Habilita/deshabilita los botones "Mover a otra cuenta" según saldo ≥ $1,00 (el de la cuenta simple; las cuentas con pantalla propia ponen los suyos en `actualizarBotones()` de su registro) |
| `abrirAgregarDinero(fuente,nombre)` / `confirmarAgregarDinero()` | Agregar dinero (con o sin toggle de apertura) — Nequi/Efectivo/cuenta personalizada |
| `abrirRestarDinero(fuente,nombre)` / `confirmarRestarDinero()` | Retirar dinero — mismo alcance que arriba. `abrirRestarDinero` rechaza con aviso si no hay saldo (`_motivoSinRetiro`); `confirmarRestarDinero` rechaza un monto mayor al saldo. Avisa con el toast `salida` (rojo) |
| `actualizarBotonRetirar(btn, fuente)` / `_motivoSinRetiro(fuente)` / `_MIN_RETIRO` | Estado del botón "Retirar dinero" (deshabilitado con saldo < $0,01) y la comprobación que repite `abrirRestarDinero`. Lo usa también `nu.js` para el detalle de cajita |
| `_setBtnEstado(btn, ok, motivo)` | Habilita/deshabilita cualquier botón de acción con el motivo como título. Base de `_setBtnTransferir`, `actualizarBotonRetirar` y `actualizarBotonesNu` (`nu.js`) |
| `abrirEditarApertura(fuente)` / `confirmarEditarApertura()` | Corregir el saldo inicial ya registrado |
| `descontarFuente(fuente, monto, opts)` / `sumarFuente(fuente, monto, opts)` (`core-state.js`) | La puerta única que mueve el saldo guardado de Nequi/Efectivo/cajita/cuenta personalizada. Toda llamada lleva `opts.origen` (`{ modulo, ref }`; al revertir, `rev: true`). El saldo nunca se recorta: una salida mayor que el saldo deja la cuenta en negativo y visible (`libro-de-movimientos.md` reglas 4 y 5). Al sumar a una cajita materializan sus intereses |
| `getAperturaMov(fuente)` | Busca el movimiento de apertura vigente en `S.movimientos` (por `fuente`) |
| `abrirNuevaCuenta()` / `crearCuentaCustom()` / `editarCuentaCustom()` / `eliminarCuentaCustom()` | CRUD de cuentas personalizadas — `crearCuentaCustom()` escribe el saldo inicial como apertura en `S.movimientos` y en el libro |

