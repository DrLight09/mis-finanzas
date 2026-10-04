# Préstamos (Prestado) — mis-finanzas

Documenta cómo funciona hoy la sección "Prestado", sus dos flujos (Me deben / Yo debo), los sheets involucrados y el modelo de datos. Sigue la [guía de estilo de sheets](./guia-estilo-sheets.md) para el orden de campos y las convenciones de labels.

El historial de bugs encontrados y corregidos en este módulo no vive acá — ver [`CHANGELOG.md`](./CHANGELOG.md).

---

## 1. Los dos flujos

La pantalla "Prestado" tiene dos pestañas independientes, con su propia estructura de datos:

| | Me deben | Yo debo |
|---|---|---|
| ¿Quién le presta a quién? | Yo le presto a otra persona | Otra persona me presta a mí |
| Estructura de datos | `S.deudores[]` (personas) → `d.movimientos[]` | `S.misDeudas[]` (deudas) → `d.movimientos[]` |
| Tipos de movimiento | `'prestamo'`, `'abono'`, `'pago-completo'` | `'recibido'`, `'pago'` |
| Alta | Selector de personas (`sheet-sel-persona`, título "¿Quién te debe?"): crea el deudor vacío; el préstamo se registra aparte con `sheet-registrar-movimiento` | El mismo selector (título "¿A quién le debes?"): crea la deuda vacía; el primer "Me prestó" se registra aparte con `sheet-mov-mi-deuda` |
| Sheet de movimientos | `sheet-registrar-movimiento` (polivalente) | `sheet-mov-mi-deuda` |

**Capa de acceso (`Deudas`, `js/core/calc-helpers.js`):** ningún módulo lee ni escribe `S.deudores` / `S.misDeudas` directo; todos pasan por `Deudas` con una dirección (`'favor'` = Me deben, `'contra'` = Yo debo): `lista`, `porId`, `porPersona`, `agregar`, `quitar`, `saldo(d)`, `totalPendiente(dir)`. Los tipos `'prestamo'` y `'recibido'` abren la deuda; `'abono'`, `'pago-completo'` y `'pago'` la reducen, así que el saldo es una sola fórmula para ambos lados. Carga de entrada porque el patrimonio y "Necesita atención" la necesitan sin esperar al módulo lazy.

Ambos lados afectan el saldo de una cuenta real (cajita, Nequi, efectivo o cuenta personalizada) y, cuando lo hacen, generan un **movimiento secundario** visible en esa cuenta — ver sección 4.

---

## 2. Me deben (`S.deudores`)

### 2.1 Sheets

**`sheet-nueva-persona`** — Nueva persona: Nombre → Color del avatar

**`sheet-editar-deudor`** — Editar persona: Nombre → Color del avatar

**`sheet-registrar-movimiento`** — Nuevo préstamo / Abono / Pago completo *(sheet polivalente con campos condicionales según el tipo de movimiento)*: Monto → Fecha → ¿De dónde sacó la plata? (condicional, solo en préstamo) → ¿A dónde entra el pago? (condicional, solo en abono/pago-completo) → ¿De qué encargo? (condicional) → ¿De qué cuenta del encargo sale? (condicional) → ¿Cuánto de extra? + distribución (condicional en abonos con extra) → Nota (opcional)

**Selects de cuenta en estos sheets:** ninguna tarjeta de crédito aparece en los selects de `sheet-registrar-movimiento`. `#mov_fuente` y `#mov_destino` (modo simple) se pueblan con `poblarFuente(id, false, false)` (3er parámetro `incluirTC=false`), igual que los modos divididos, `nd_destino`, `md_cuenta` y la cuenta del extra (`getFuentesSinTC()`). Una TC nunca recibe plata entrante, y un préstamo pagado con TC se registra únicamente por el botón "Préstamo con TC" (`sheet-prestamo-tc`: valida cupo, pide descripción, deja `_viaTC` + cargo `cargo_prestamo` enlazado en `S.tcMovimientos`; sin ese cargo `calcDeudaAjenaDeTarjeta()` no lo cuenta como deuda ajena y `tcRecalcular()`, que corre en cada `refresh()`, lo borra de `tc.deuda`). Se decidió no unir ambos sheets — razones en CHANGELOG 2026-09-19.

### 2.2 Tipos de movimiento (`d.movimientos[]`)

**`'prestamo'`** — Dinero que sale de una cuenta tuya hacia la persona.
- Destino simple: `fuente` (string, ej. `'cajita:abc123'`)
- Destino dividido: `fuentes` (array de `{fuente, monto}`)
- No genera movimiento secundario en la cuenta de origen — solo descuenta el saldo (`descontarFuente`). No hay otro rastro de este movimiento en el historial de esa cuenta más que la reconstrucción que hace `getMovimientosCuenta()` a partir de este mismo registro (ver 4.3).
- **"El valor real era diferente"** (solo en "Nuevo préstamo", agregado 2026-09-30): `monto` es lo que le cobrás (la deuda) y "¿Cuánto era en realidad?" lo que realmente sale de la cuenta. Si el real es menor, de la cuenta sale el real, la deuda sigue siendo `monto` y la diferencia se registra como ingreso sin cuenta (`fuente:''`, `_prestadoDirectamente`) enlazado por `_encMovId` al préstamo. En modo simple el préstamo se guarda entonces como `fuentes:[{fuente, monto: real}]` (no `fuente`), y `m.diferencial` guarda `{dijo, real, margen, …}`. Instancia `'prestamoDif'` de `diferencial.js`. Borrar el préstamo borra también ese ingreso (2.3).

**`'abono'`** / **`'pago-completo'`** — Dinero que la persona te devuelve, hacia una cuenta tuya. Un abono cuyo monto iguala el saldo total de la persona se guarda como `'pago-completo'` aunque se haya abierto "Registrar abono" (ver `confirmarMovimiento()`).
- Destino simple: `destino` (string) + `_abonoDestinoMovId` (id del movimiento secundario que se creó en esa cuenta)
- Destino dividido: `destinos` (array de `{fuente, monto, _movId}`, un `_movId` por fila)
- Vía encargo: además de lo anterior, `_viaEncargo: true`, `_encId`, `_encNombre`, `_encMovId` / `_encMovIds`
- **Vía Alcancía** (agregado 2026-08-09, ver alcancia.md §4/§5): cuando el cobro se guarda directo en la alcancía sin pasar por ninguna cuenta real — se origina desde Alcancía → Depositar → "Me pagaron una deuda", no desde este módulo. `destino: ''` (no hay cuenta real), `_viaAlcancia: true`, `_alcanciaMovId` (id de la entrada espejo en `S.alcancia.movimientos[]`). No genera movimiento secundario en ninguna cuenta — mismo motivo que `'prestamo'` en 4.1: no hay cuenta destino tuya que registrar. Tampoco lo ve `_calcPrestadoMeta(cajitaId)` como "devuelto" a esa cajita (correctamente: la plata no volvió a la cajita, se quedó en la alcancía).
- **`_calcPrestadoMeta(cajitaId)`** usa estos movimientos para calcular cuánta plata de una cajita sigue "prestada" — resta tanto `destino` como cada fila de `destinos` que apunte a esa cajita.

### 2.2b Registrar un movimiento: validar y luego aplicar

`_confirmarMovimientoInterno()` hace tres cosas, en este orden: `_planMovimiento()` lee el formulario y **valida todo sin escribir nada** (devuelve `{ error }` o un plan); `_aplicarMovimiento(plan)` escribe y **no tiene ningún `return` de validación**; luego se registra el log, se cierran los grupos saldados, se guarda y se refresca. Así un error de formulario no puede dejar una deuda a medias. Cada rama tiene su par: perdón (`_aplicarPerdon`), préstamo (`_planPrestamo` / `_aplicarPrestamo`), abono desde encargo (`_planAbonoEncargo` / `_aplicarAbonoEncargo`) y abono a una cuenta propia (`_planAbonoNormal` / `_aplicarAbonoNormal`). Los extras ("¿pagaron de más?") los comparten las dos ramas de abono (`_planExtra`, `_aplicarExtraPartes`); lo único que cambia entre ellas son las descripciones y que el extra de la rama normal es ingreso real (`_esExtraIngreso`).

El grupo del movimiento (`_resolverGrupoIdMov`) se resuelve al **aplicar**, no antes de validar, porque puede crear un grupo nuevo ("Es un préstamo nuevo"): si se creara antes, un error de validación dejaría un grupo vacío.

### 2.3 Eliminar un movimiento (`eliminarMovDeudor`)

`eliminarMovDeudor` solo decide **si** se puede borrar y lo confirma (antigüedad, diálogo, que Alcancía cargue). La reversión en sí es `_revertirMovDeudor(d, m)`: deshace saldos, movimientos espejo, deuda de la TC, salidas del encargo, extras, gasto del perdón y margen, sin ninguna pregunta ni validación, así que no puede quedar a medias.

Al borrar un `'prestamo'`: revierte el saldo de la(s) fuente(s) con `sumarFuente` (o `descontarFuente` de las fuentes según corresponda). No hay movimiento secundario que limpiar. Si el préstamo tenía `m.diferencial` ("El valor real era diferente"), borra además el ingreso del margen (`_esDiferencialEncargo` con `_encMovId === m.id`), que no tiene cuenta y por eso no hay saldo que revertir.

**Toda reversión que resta saldo (borrar un abono, la parte "guardar" de un extra, un "me pagaron") usa `descontarFuente(..., { exacto: true })`**, sin piso en 0: así borrar y rehacer un movimiento no deja la cuenta con un saldo inflado. Ver `CHANGELOG.md#patrimonio-y-cálculos-globales` (2026-09-30).

**Excepción — préstamo con tarjeta (`_viaTC`, `confirmarPrestamoTC()`):** además de revertir la deuda de la TC y su cargo en `S.tcMovimientos` (por `_deudorMovId`), borra el ingreso del margen del diferencial (`_esDiferencialEncargo` con `_encMovId === m.id`). Ese ingreso se escribe sin cuenta (`fuente: ''`), así que no hay saldo que revertir; solo se quita para que deje de contar como ingreso. Desde 2026-09-30 `confirmarPrestamoTC()` pasa el id del préstamo a `diffAplicar('prtc', …, movId)` para dejar ese vínculo. Los préstamos con TC guardados antes no lo tienen: si se borran, su margen queda como ingreso huérfano (limitación conocida, sin migrar).

Ese margen **no** lleva `_secundario` a propósito: como no tiene cuenta, no debería listarse en el detalle de ninguna cuenta (no verificado en la app), y marcarlo habría dejado un registro que solo este borrado puede limpiar, sin forma de borrarlo aparte en los casos sin vínculo.

Al borrar un `'abono'` / `'pago-completo'`:
1. Si es vía encargo: revierte usando `_encMovId`/`_encMovIds`.
2. Si es vía Alcancía (`_viaAlcancia`): antes de tocar `d.movimientos`, asegura que `alcancia.js` esté cargado (`_prEnsureAlcancia()` — Alcancía es un grupo lazy, puede no haberse visitado en la sesión — aborta con toast si falla la carga, para no dejar el borrado a medias) y llama `window._alcanciaQuitarPorCobroDeuda(m._alcanciaMovId)`, que quita solo la entrada espejo de `S.alcancia.movimientos[]` sin volver a tocar este deudor (evita recursión/doble confirmación).
3. Si no: busca el movimiento secundario por `_abonoDestinoMovId` (destino simple) o por `_movId` en cada fila de `destinos` (destino dividido), lo elimina de `S.movimientos` / `cObj.movimientos` / `cObj.historial` según dónde viva, y **solo entonces** descuenta el saldo con `descontarFuente(..., { exacto: true })`.
4. Si el movimiento es de datos antiguos y no tiene `_abonoDestinoMovId`/`_movId` (creado antes de que existiera esta referencia), se descuenta el saldo igual pero no se puede localizar la entrada secundaria para borrarla — queda huérfana en el historial de la cuenta destino.

Un depósito vía Alcancía también puede borrarse desde el otro lado (`alcanciaEliminarDeposito()` en alcancia.js), que revierte el abono de este deudor directamente — sin pasar por `eliminarMovDeudor()` ni duplicar el diálogo de confirmación. Ver alcancia.md §3/§7 para el detalle del enlace bidireccional.

Tras revertir, `_autoCerrarGruposEnCero(d)` reevalúa el grupo del movimiento borrado — ver 2.4.

**Desde el feed / detalle de una cuenta:** `eliminarMovimiento()` (`js/core/movimientos.js`) no revierte préstamos ni abonos por su cuenta — delega en `eliminarMovDeudor(deudorId, movId, { desdeFeed: true })` (cargando el grupo lazy `prestamos` con `Loader.ensure` si hace falta). `desdeFeed` hace que, al terminar, no navegue al detalle del deudor (el usuario sigue en la cuenta). Hay una sola implementación de la reversión; ver CHANGELOG 2026-09-19.

### 2.4 Grupos de préstamo (`d.grupos[]`) — Me deben y Yo debo

**Aplica a las dos direcciones.** Toda la maquinaria de grupos (`_migrarGruposDeudor`, `_gruposAbiertos`, `_autoCerrarGruposEnCero`, `_resolverGrupoIdSel`, `_initGrupoSelector`, `getGrupoSaldo`, y el acordeón `_htmlHistorialPorGrupos`) recibe la deuda como parámetro y usa `Deudas.abre()`, así que sirve igual para "Yo debo", donde el movimiento que abre es `'recibido'` en vez de `'prestamo'`. En el sheet de "Yo debo" los ids son `md_grupo*` y el texto del checkbox es "Es un préstamo aparte (no sumarlo al que ya le debes)". Como en "Me deben", el grupo se resuelve al aplicar el movimiento, no al validar.

Una misma persona puede tener varios préstamos separados en el tiempo (ej. "el préstamo viejo" y "el de la moto"), y confundirlos hace que responder "¿cuánto me debes de lo nuevo?" sea impreciso. Los grupos resuelven esto **sin duplicar a la persona en la lista**: cada deudor tiene un solo registro, pero sus movimientos se reparten en sub-préstamos aislados.

**Modelo:**
```js
d.grupos = [
  { id: 'g_xxx', nombre: 'Préstamo viejo', creadoEn: '2024-03-12', cerrado: false }
]
// cada movimiento de d.movimientos[] gana:
m.grupoId = 'g_xxx'
```

**Migración silenciosa (`_migrarGruposDeudor`)** — deudores creados antes de que existieran los grupos no tienen `d.grupos`. La primera vez que se abre su detalle (`abrirDeudor`), todos sus movimientos sueltos se agrupan automáticamente bajo un grupo `"Histórico"`. Idempotente, no requiere migración manual ni toca el saldo.

**Saldo:** `getDeudorSaldo(d)` (envoltorio de `Deudas.saldo`, en `js/core/calc-helpers.js` — Inicio y el patrimonio lo necesitan sin cargar `prestado.js`; el total de la persona) no cambia — sigue sumando todos los movimientos sin filtrar por grupo. `getGrupoSaldo(d, grupoId)` es el mismo cálculo pero acotado a un grupo.

**Resolución de a qué grupo pertenece un movimiento nuevo (`_resolverGrupoIdMov` / `_autoGrupoIdMov`):**
- **0 grupos abiertos** → se usa/crea el grupo **"Histórico"** (`_getOrCrearHistorico`, id fijo `'_historico'`), sin preguntar. Nunca se crea un grupo con nombre de fecha por sorpresa — ese nombre solo se usa cuando el usuario abre un grupo aparte a propósito (ver abajo). Este caso en la práctica solo ocurre en el primer movimiento de un deudor nuevo: una vez creado, "Histórico" nunca se vuelve a cerrar (ver Auto-cierre), así que 0 grupos abiertos no vuelve a pasar después.
- **1 grupo abierto** → se reutiliza ese mismo grupo automáticamente (sin fricción para el caso simple, que es la mayoría — normalmente es "Histórico"). Para un **préstamo nuevo** (no un abono) aparece además un checkbox opcional "🆕 Es un préstamo aparte" (`#mov_grupo_check_wrap`) — es la única forma de llegar a tener 2 grupos abiertos, porque sin él todo préstamo nuevo se fusionaría siempre con el único grupo existente. Marcarlo es la única vía para crear un grupo con nombre de fecha (o nombre custom).
- **≥2 grupos abiertos** → aparece el selector `#mov_grupo_wrap` (obligatorio elegir a cuál pertenece el movimiento, con opción "🆕 Es un préstamo nuevo" para arrancar un tercero).

**Auto-cierre (`_autoCerrarGruposEnCero`)** — tras registrar o eliminar un movimiento, cualquier grupo cuyo saldo quede en $0 se marca `cerrado: true` automáticamente (se oculta de los selectores y del listado de "abiertos"), **excepto "Histórico"**, que nunca se cierra solo así su saldo llegue a $0 — es el balde por defecto y debe seguir contando como "1 grupo abierto" para que un préstamo nuevo nunca dispare la creación automática de otro grupo. Si luego se borra un movimiento de un grupo no-histórico y eso hace que su saldo deje de ser $0, se reabre solo.

*(Cambiado 2026-09-07 — antes, 0 grupos abiertos creaba un grupo nuevo con nombre de fecha en vez de usar "Histórico", y "Histórico" no tenía trato especial en el auto-cierre; eso hacía que cualquier deudor cuyo único grupo llegara a $0 y se cerrara solo, terminara con un grupo/acordeón nuevo sin que el usuario lo pidiera. Ver `CHANGELOG.md#prestado`.)*

**Render del detalle (`abrirDeudor`):** con un solo grupo, el historial se ve exactamente igual que antes de que existiera esta feature (sin acordeón). Con ≥2 grupos, cada uno se muestra como una tarjeta `<details>` colapsable con su nombre y saldo — los grupos abiertos aparecen primero (más nuevo primero), los cerrados al final.

**Qué NO toca:** los movimientos secundarios (`_abonoDestinoMovId`, `_encMovId`), `getMovimientosCuenta()`, `_calcPrestadoMeta()` — `grupoId` es puramente organizativo sobre el mismo `d.movimientos[]`, el motor de saldo real no cambia.

---

## 3. Yo debo (`S.misDeudas`)

### 3.1 Sheets

**Alta:** "Nueva deuda" no tiene sheet propio: abre directamente el selector de personas (`sheet-sel-persona`, ver sección 6), igual que "Agregar persona" en Me deben. Al elegir a alguien queda su deuda vacía y se abre su detalle, desde donde se registra el primer "Me prestó" (con **Dividir ÷** y movimiento espejo en la cuenta).

**`sheet-editar-mi-deuda`** — Editar deuda: Nombre → Color del avatar

**`sheet-mov-mi-deuda`** — Me prestó más / Registrar pago *(el título y el label de cuenta cambian según el tipo)*: Monto → ¿Te lo perdonaron? (solo en pago) → ¿A qué cuenta entró la plata? / ¿De qué cuenta sale el pago? (con **Dividir ÷** entre varias cuentas; se oculta si es perdón) → ¿Pagaste de más? + Monto de más (solo en pago; se oculta si es perdón) → Fecha → Nota (opcional)

### 3.2 Tipos de movimiento (`d.movimientos[]`)

**`'recibido'`** — Te prestaron más plata; entra a una o varias cuentas tuyas.
- `destino` (string, opcional — puede quedar "sin especificar") + `_movSecId`: id del movimiento secundario creado en esa cuenta.
- `destinos[]` (solo si usó **Dividir ÷** con 2 o más cuentas): `{ fuente, monto, _movId }` por fila, con el id del movimiento secundario de cada una. En ese caso no hay `destino` ni `_movSecId`.

**`'pago'`** — Le pagas parte de la deuda; sale de una o varias cuentas tuyas.
- `fuente` + `_movSecId` (una sola cuenta) o `fuentes[]` (`{ fuente, monto, _movId }`, dividido). Los montos de las cuentas suman `monto` + el extra, si lo hay.
- `extra: { monto, gastoId }` — pagaste de más. El pago baja la deuda solo `monto`; el extra sale de la cuenta pero no baja la deuda, así que es un **gasto real** del mes (`S.gastosVar`, `_esExtraDeuda`, `fuente: ''`, enlazado por `gastoId`). Las cuentas descuentan `monto + extra`.
- `_perdon: true` + `_ingresoPerdonId` — te perdonaron lo que faltaba. El `monto` es el saldo completo; no sale plata de ninguna cuenta. Es un **ingreso real** (tu patrimonio neto sube): queda un ingreso "fantasma" en `S.movimientos` (`fuente: ''`, `_esPerdonRecibido`, enlazado por `_ingresoPerdonId`) que `_esEntradaEspejoNoIngreso()` no excluye. No cuenta como "Pagado" (ni en el detalle ni en Wrapped); en el historial aparece como "Perdonada".

Reglas que se validan **antes** de escribir nada (`_planMovMiDeuda`; `_aplicarMovMiDeuda` no tiene ningún `return` de validación, así que un error no puede dejar la deuda a medias): el pago no puede pasar del saldo (el extra es aparte); el perdón exige el saldo completo; con Dividir ÷ cada fila lleva cuenta y la suma debe cuadrar con `monto + extra`; en un pago, ninguna cuenta puede quedar con menos de lo que se le descuenta. Un pago puede salir de una tarjeta de crédito con cupo disponible (nunca una tarjeta recibe plata): ver abajo. Los movimientos de "Yo debo" también pertenecen a un grupo de préstamo (ver 2.4).

**Pago con tarjeta de crédito.** La fuente de un pago puede ser `tc:<id>` (sola o como una fila del reparto). En vez de un movimiento secundario, deja un cargo `cargo_deuda` en `S.tcMovimientos` (`miDeudaId`, `_miDeudaMovId`) y sube `tc.deuda`; la fila guarda su id en `_tcMovId`. Es deuda **propia** de la tarjeta (no ajena, a diferencia de `cargo_encargo` y `cargo_prestamo`) y **no es un gasto**: cambiaste deuda con el prestamista por deuda de tarjeta, así que el patrimonio queda igual. Cupo insuficiente se rechaza antes de escribir. `tcRecalcular` reconstruye `tc.deuda` desde los cargos en cada refresh, por eso `cargo_deuda` tiene que figurar en `_tcEsCargoExterno` (`tarjetas_credito.js`); de otro modo la deuda se perdería en el siguiente refresh.

### 3.3 Eliminar un movimiento (`eliminarMovMiDeuda`)

`_revertirMovMiDeuda` deshace exactamente lo que hizo el movimiento: revierte el saldo de cada cuenta (`destinos[]`/`fuentes[]`, o `destino`/`fuente` en los registros antiguos de una sola cuenta) y borra su movimiento secundario; si hubo extra, borra el gasto; si fue perdón, borra el ingreso; si una fila fue con tarjeta, borra el cargo `cargo_deuda` y baja la deuda de la TC (si el cargo ya no existe, no la resta otra vez). Si el movimiento secundario de una fila ya no existe, el saldo de esa fila no se toca otra vez. La reversión de saldo usa `{ exacto: true }` (ver 2.3). La protección por antigüedad aplica también al perdón y al extra, porque borrarlos quita un ingreso o gasto real.

---

## 4. Movimientos secundarios (rastro en la cuenta destino/origen)

Cada vez que un préstamo mueve plata hacia o desde una cuenta real, se crea una **segunda entrada visible** en esa cuenta, para que su historial refleje el movimiento. Se escribe y se borra siempre con `registrarMovEspejo()` / `borrarMovEspejo()` (`js/core/cuenta-efectos.js`, compartidas con Mesada): solo tocan el historial, nunca el saldo (eso sigue siendo `sumarFuente` / `descontarFuente`). Si la cuenta ya no existe, `registrarMovEspejo` devuelve `null`. Un abono cuyo espejo ya no existe se revierte sin descontar el saldo otra vez (`_revertirDestinoAbono`).

| Cuenta | Dónde vive | Tipo de entrada |
|---|---|---|
| Efectivo / Nequi | `S.movimientos[]` | `{tipo:'entrada'\|'salida', fuente, ...}` |
| Cuenta personalizada | `cObj.movimientos[]` | `{tipo:'ingreso'\|'egreso', ...}` |
| Cajita | `cObj.historial[]` | `{tipo:'entrada'\|'salida', ...}` |

Todas estas entradas llevan:
- `_secundario: true` — las marca como generadas automáticamente. En la UI aparecen con badge "Automático" y un candado en vez de botón de eliminar: solo se pueden borrar eliminando el movimiento original desde "Prestado".
- `_origenSeccion` — de dónde vino (`'Prestado · Me deben'` o `'Prestado · Yo debo'`), se usa como texto del origen al mostrarlas.

### 4.1 Por qué `'prestamo'` no tiene movimiento secundario

Cuando prestas dinero *desde* una cajita/cuenta, esa plata sale pero no "entra" a ningún otro lugar tuyo — no hay una cuenta destino tuya que registrar. Por eso `'prestamo'` solo descuenta saldo; su único rastro en el historial de la cuenta de origen es la reconstrucción que hace `getMovimientosCuenta()` (ver 4.3).

Un `'abono'`/`'pago-completo'` vía Alcancía (`_viaAlcancia`, agregado 2026-08-09) es la misma situación en reversa: la plata *entra*, pero no a ninguna cuenta real — entra a la alcancía, que no es una cuenta con `fuente`/`destino` (ver alcancia.md §7). Por eso tampoco genera entrada en `S.movimientos`/`cObj.movimientos`/`cObj.historial`; su rastro secundario vive en `S.alcancia.movimientos[]`, enlazado por `_alcanciaMovId` en vez de por `_abonoDestinoMovId`.

### 4.2 Regla: toda entrada secundaria necesita su id de vuelta

Cualquier movimiento de préstamo que cree una entrada secundaria en otra cuenta **debe guardar el id de esa entrada** en el propio registro (`_abonoDestinoMovId`, `_movId` por fila, `_movSecId`, `_encMovId`/`_encMovIds`, según el flujo). Sin esa referencia, `eliminarMovDeudor`/`eliminarMovMiDeuda` no tienen forma de encontrar y borrar la entrada al revertir el movimiento, y queda huérfana para siempre.

### 4.3 `getMovimientosCuenta()` / `_getMovimientosCuentaCustom()` — reconstrucción de préstamos entregados

Estas funciones arman el historial visible de una cuenta combinando varias fuentes. Para préstamos, **solo reconstruyen los `'prestamo'` entregados** (leyendo `d.movimientos` de `S.deudores` directamente, con `fuente`/`fuentes`) — porque, como en 4.1, esos no tienen otra representación en la cuenta.

Los `'abono'`/`'pago-completo'` (dinero que *entra*) **no se reconstruyen acá** — ya están representados por su movimiento secundario (sección 4). Reconstruirlos de nuevo generaría un duplicado sin `_secundario`, que se vería sin candado y sería borrable desde la vista de cuenta sin el candado de un movimiento secundario (histórico: cuando se documentó esto, `eliminarMovimiento` no revertía correctamente ese duplicado; hoy delega en `eliminarMovDeudor`, ver 2.3).

---

## 5. Meta de ahorro de cajita y "prestado"

`_calcPrestadoMeta(cajitaId)` — usada en la tarjeta de la meta de una cajita — calcula cuánta plata de esa cajita sigue prestada:

1. Suma todos los `'prestamo'` (simples y divididos) que salieron de esa cajita.
2. Resta todos los `'abono'`/`'pago-completo'` (simples y divididos) que volvieron a esa cajita.

El resultado, si es mayor a 0, se muestra como aviso en la tarjeta: `"$X prestado de esta cajita · Debería haber: $Y"`.

---

## 5a. Pantallas compartidas

Las dos listas se dibujan con un solo render, `_renderListaDeudas(dir)`; lo que cambia entre Me deben y Yo debo (textos, color del monto, a dónde lleva cada tap) vive en la tabla `_UI_LISTA`. El encabezado del detalle es `_pintarEncabezadoDeuda` (los ids del DOM difieren, `dd*` y `md*`). El color de una deuda siempre sale de la persona vinculada (`_colorDeuda`), con `d.color` de respaldo. Las dos listas se ordenan de mayor a menor saldo.

---

## 5b. Tolerancias

Dos constantes únicas, `Deudas.TOL` ($1: suma de partes contra total, saldo "≈ 0", guardia de integridad) y `Deudas.TOL_FINO` ($0,50: comparar un monto contra un saldo o tope, auto-detección de pago completo). No usar números sueltos.

---

## 6. Integración con `S.personas`

Tanto un deudor (Me deben) como una misDeuda (Yo debo) pueden estar vinculados a una persona del registro central `S.personas[]` vía `personaId` — así se comparte nombre/avatar/color con Encargos y Spotify en vez de tener texto libre repetido en cada módulo.

> Hasta el 2026-08-03 esto vivía repartido en tres archivos (`prestado.js` + `prestado-personas.js` + `deudores-personas.js`) por razones de orden de carga. Los tres se fusionaron en un solo `js/modules/prestado.js` ese día — `prestado-personas.js` y `deudores-personas.js` ya no existen como archivos propios. Todo lo que describe esta sección vive hoy en `prestado.js`, en los bloques marcados `// fusionado acá el 2026-08-03`.

El módulo cubre:
- **Me deben** (`_onSelPersonaMeDeben`): "Agregar persona" abre directamente el selector de personas en vez de un formulario de nombre libre. Si la persona elegida **ya tiene un deudor registrado**, no crea uno segundo — cierra el sheet, avisa con un toast y redirige al detalle del deudor existente (mismo patrón que el lado "Yo debo", ver abajo). Un préstamo nuevo con alguien que ya está en la lista se maneja como un **grupo aparte dentro del mismo deudor** (ver 2.4), no como una persona duplicada.
- **Yo debo** (`_onSelPersonaYoDebo`): "Nueva deuda" abre el mismo selector, sin sheet propio. Crea la deuda vacía enlazada por `personaId` (nunca por coincidencia de nombre) y abre su detalle. Misma red de seguridad que Me deben si llegara alguien que ya tiene deuda.

**El selector** (`abrirSelPersona(callback, titulo, opts)` en `personas.js`) recibe el título y un filtro `opts.excluir(persona)`. Cada lista oculta a quien ya está en ella, porque no se puede agregar dos veces: Me deben ("¿Quién te debe?") oculta a quienes tienen un deudor; Yo debo ("¿A quién le debes?") oculta a quienes tienen una deuda propia. Una misma persona sí puede estar en las dos listas. Si lo que se busca coincide exacto con alguien ya agregado, avisa que ya está en la lista en vez de ofrecer crearla de nuevo; si todas ya están, avisa y deja crear una nueva. Sin título ni filtro (Encargos) queda como siempre: "¿De quién es la plata?", sin exclusiones.

### 6.1 Código muerto relacionado

El sheet `sheet-nueva-persona` (nombre libre + color picker, sin pasar por el sistema de Personas) ya no tiene ninguna función propia en `prestado.js` — el override de `openSheet` en este mismo archivo intercepta `id==='nueva-persona'` y redirige siempre a `abrirSelPersona(_onSelPersonaMeDeben)` antes de que ese sheet llegue a mostrarse. Si el HTML de ese sheet sigue en `index.html`, es marcado inerte, no código muerto: no hay ninguna función que lo lea.

