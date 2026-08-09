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
| Sheet de alta | `sheet-nueva-persona` (crea la persona; el préstamo se registra aparte con `sheet-registrar-movimiento`) | `sheet-nueva-deuda` (crea la deuda con su primer monto en el mismo paso) |
| Sheet de movimientos | `sheet-registrar-movimiento` (polivalente) | `sheet-mov-mi-deuda` |

Ambos lados afectan el saldo de una cuenta real (cajita, Nequi, efectivo o cuenta personalizada) y, cuando lo hacen, generan un **movimiento secundario** visible en esa cuenta — ver sección 4.

---

## 2. Me deben (`S.deudores`)

### 2.1 Sheets

**`sheet-nueva-persona`** — Nueva persona: Nombre → Color del avatar

**`sheet-editar-deudor`** — Editar persona: Nombre → Color del avatar

**`sheet-registrar-movimiento`** — Nuevo préstamo / Abono / Pago completo *(sheet polivalente con campos condicionales según el tipo de movimiento)*: Monto → Fecha → ¿De dónde sacó la plata? (condicional, solo en préstamo) → ¿A dónde entra el pago? (condicional, solo en abono/pago-completo) → ¿De qué encargo? (condicional) → ¿De qué cuenta del encargo sale? (condicional) → ¿Cuánto de extra? + distribución (condicional en abonos con extra) → Nota (opcional)

### 2.2 Tipos de movimiento (`d.movimientos[]`)

**`'prestamo'`** — Dinero que sale de una cuenta tuya hacia la persona.
- Destino simple: `fuente` (string, ej. `'cajita:abc123'`)
- Destino dividido: `fuentes` (array de `{fuente, monto}`)
- No genera movimiento secundario en la cuenta de origen — solo descuenta el saldo (`descontarFuente`). No hay otro rastro de este movimiento en el historial de esa cuenta más que la reconstrucción que hace `getMovimientosCuenta()` a partir de este mismo registro (ver 4.3).

**`'abono'`** / **`'pago-completo'`** — Dinero que la persona te devuelve, hacia una cuenta tuya.
- Destino simple: `destino` (string) + `_abonoDestinoMovId` (id del movimiento secundario que se creó en esa cuenta)
- Destino dividido: `destinos` (array de `{fuente, monto, _movId}`, un `_movId` por fila)
- Vía encargo: además de lo anterior, `_viaEncargo: true`, `_encId`, `_encNombre`, `_encMovId` / `_encMovIds`
- **Vía Alcancía** (agregado 2026-08-09, ver alcancia.md §4/§5): cuando el cobro se guarda directo en la alcancía sin pasar por ninguna cuenta real — se origina desde Alcancía → Depositar → "Me pagaron una deuda", no desde este módulo. `destino: ''` (no hay cuenta real), `_viaAlcancia: true`, `_alcanciaMovId` (id de la entrada espejo en `S.alcancia.movimientos[]`). No genera movimiento secundario en ninguna cuenta — mismo motivo que `'prestamo'` en 4.1: no hay cuenta destino tuya que registrar. Tampoco lo ve `_calcPrestadoMeta(cajitaId)` como "devuelto" a esa cajita (correctamente: la plata no volvió a la cajita, se quedó en la alcancía).
- **`_calcPrestadoMeta(cajitaId)`** usa estos movimientos para calcular cuánta plata de una cajita sigue "prestada" — resta tanto `destino` como cada fila de `destinos` que apunte a esa cajita.

### 2.3 Eliminar un movimiento (`eliminarMovDeudor`)

Al borrar un `'prestamo'`: revierte el saldo de la(s) fuente(s) con `sumarFuente` (o `descontarFuente` de las fuentes según corresponda). No hay movimiento secundario que limpiar.

Al borrar un `'abono'` / `'pago-completo'`:
1. Si es vía encargo: revierte usando `_encMovId`/`_encMovIds`.
2. Si es vía Alcancía (`_viaAlcancia`): antes de tocar `d.movimientos`, asegura que `alcancia.js` esté cargado (`_prEnsureAlcancia()` — Alcancía es un grupo lazy, puede no haberse visitado en la sesión — aborta con toast si falla la carga, para no dejar el borrado a medias) y llama `window._alcanciaQuitarPorCobroDeuda(m._alcanciaMovId)`, que quita solo la entrada espejo de `S.alcancia.movimientos[]` sin volver a tocar este deudor (evita recursión/doble confirmación).
3. Si no: busca el movimiento secundario por `_abonoDestinoMovId` (destino simple) o por `_movId` en cada fila de `destinos` (destino dividido), lo elimina de `S.movimientos` / `cObj.movimientos` / `cObj.historial` según dónde viva, y **solo entonces** descuenta el saldo con `descontarFuente`.
4. Si el movimiento es de datos antiguos y no tiene `_abonoDestinoMovId`/`_movId` (creado antes de que existiera esta referencia), se descuenta el saldo igual pero no se puede localizar la entrada secundaria para borrarla — queda huérfana en el historial de la cuenta destino.

Un depósito vía Alcancía también puede borrarse desde el otro lado (`alcanciaEliminarDeposito()` en alcancia.js), que revierte el abono de este deudor directamente — sin pasar por `eliminarMovDeudor()` ni duplicar el diálogo de confirmación. Ver alcancia.md §3/§7 para el detalle del enlace bidireccional.

Tras revertir, `_autoCerrarGruposEnCero(d)` reevalúa el grupo del movimiento borrado — ver 2.4.

### 2.4 Grupos de préstamo (`d.grupos[]`)

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

**Saldo:** `getDeudorSaldo(d)` (el total de la persona) no cambia — sigue sumando todos los movimientos sin filtrar por grupo. `getGrupoSaldo(d, grupoId)` es el mismo cálculo pero acotado a un grupo.

**Resolución de a qué grupo pertenece un movimiento nuevo (`_resolverGrupoIdMov` / `_autoGrupoIdMov`):**
- **0 grupos abiertos** → se crea uno automático, sin preguntar.
- **1 grupo abierto** → se reutiliza ese mismo grupo automáticamente (sin fricción para el caso simple, que es la mayoría). Para un **préstamo nuevo** (no un abono) aparece además un checkbox opcional "🆕 Es un préstamo aparte" (`#mov_grupo_check_wrap`) — es la única forma de llegar a tener 2 grupos abiertos, porque sin él todo préstamo nuevo se fusionaría siempre con el único grupo existente.
- **≥2 grupos abiertos** → aparece el selector `#mov_grupo_wrap` (obligatorio elegir a cuál pertenece el movimiento, con opción "🆕 Es un préstamo nuevo" para arrancar un tercero).

**Auto-cierre (`_autoCerrarGruposEnCero`)** — tras registrar o eliminar un movimiento, cualquier grupo cuyo saldo quede en $0 se marca `cerrado: true` automáticamente (se oculta de los selectores y del listado de "abiertos"). Si luego se borra un movimiento y eso hace que el saldo del grupo deje de ser $0, se reabre solo.

**Render del detalle (`abrirDeudor`):** con un solo grupo, el historial se ve exactamente igual que antes de que existiera esta feature (sin acordeón). Con ≥2 grupos, cada uno se muestra como una tarjeta `<details>` colapsable con su nombre y saldo — los grupos abiertos aparecen primero (más nuevo primero), los cerrados al final.

**Qué NO toca:** los movimientos secundarios (`_abonoDestinoMovId`, `_encMovId`), `getMovimientosCuenta()`, `_calcPrestadoMeta()` — `grupoId` es puramente organizativo sobre el mismo `d.movimientos[]`, el motor de saldo real no cambia.

---

## 3. Yo debo (`S.misDeudas`)

### 3.1 Sheets

**`sheet-nueva-deuda`** — Nueva deuda: ¿A quién le debes? `*` → ¿Cuánto te prestó? `*` → Fecha → ¿A qué cuenta entró la plata? → Nota (opcional)

**`sheet-editar-mi-deuda`** — Editar deuda: Nombre → Color del avatar

**`sheet-mov-mi-deuda`** — Me prestó más / Le pagué *(el título y el label de cuenta cambian según el tipo)*: Monto → Fecha → ¿A qué cuenta entró la plata? (condicional, solo en "me prestó más" — en "le pagué" el label pasa a ser la cuenta de origen) → Nota (opcional)

### 3.2 Tipos de movimiento (`d.movimientos[]`)

**`'recibido'`** — Te prestaron más plata; entra a una cuenta tuya.
- `destino` (string, opcional — puede quedar "sin especificar")
- `_movSecId`: id del movimiento secundario creado en esa cuenta (si `destino` está definido)

**`'pago'`** — Le pagas parte de la deuda; sale de una cuenta tuya.
- `fuente` (string, opcional)
- `_movSecId`: id del movimiento secundario creado en esa cuenta (si `fuente` está definido)

Este lado **no tiene modo dividido** (una sola cuenta por movimiento) y **ya vincula correctamente** el movimiento secundario desde que se creó — es el patrón que se replicó en 2.3 para el lado "Me deben".

### 3.3 Eliminar un movimiento (`eliminarMovMiDeuda`)

Revierte el saldo de `destino`/`fuente` y, si `m._movSecId` existe, borra la entrada correspondiente de `S.movimientos` / `cObj.movimientos` / `cObj.historial` antes de terminar.

---

## 4. Movimientos secundarios (rastro en la cuenta destino/origen)

Cada vez que un préstamo mueve plata hacia o desde una cuenta real, se crea una **segunda entrada visible** en esa cuenta, para que su historial refleje el movimiento:

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

Los `'abono'`/`'pago-completo'` (dinero que *entra*) **no se reconstruyen acá** — ya están representados por su movimiento secundario (sección 4). Reconstruirlos de nuevo generaría un duplicado sin `_secundario`, que se vería sin candado y sería borrable por una ruta que no revierte nada correctamente (`eliminarMovimiento` no busca en `S.deudores`).

---

## 5. Meta de ahorro de cajita y "prestado"

`_calcPrestadoMeta(cajitaId)` — usada en la tarjeta de la meta de una cajita — calcula cuánta plata de esa cajita sigue prestada:

1. Suma todos los `'prestamo'` (simples y divididos) que salieron de esa cajita.
2. Resta todos los `'abono'`/`'pago-completo'` (simples y divididos) que volvieron a esa cajita.

El resultado, si es mayor a 0, se muestra como aviso en la tarjeta: `"$X prestado de esta cajita · Debería haber: $Y"`.

---

## 6. Integración con `S.personas`

Tanto un deudor (Me deben) como una misDeuda (Yo debo) pueden estar vinculados a una persona del registro central `S.personas[]` vía `personaId` — así se comparte nombre/avatar/color con Encargos y Spotify en vez de tener texto libre repetido en cada módulo.

> Hasta el 2026-08-03 esto vivía repartido en tres archivos (`prestado.js` + `prestado-personas.js` + `deudores-personas.js`) por razones de orden de carga. Los tres se fusionaron en un solo `js/modules/prestado.js` ese día — `prestado-personas.js` y `deudores-personas.js` ya no existen como archivos propios. Todo lo que describe esta sección vive hoy en `prestado.js`, en los bloques marcados `// fusionado acá el 2026-08-03`.

El módulo cubre:
- **Me deben** (`_onSelPersonaMeDeben`): "Agregar persona" abre directamente el selector de personas en vez de un formulario de nombre libre. Si la persona elegida **ya tiene un deudor registrado**, no crea uno segundo — cierra el sheet, avisa con un toast y redirige al detalle del deudor existente (mismo patrón que el lado "Yo debo", ver abajo). Un préstamo nuevo con alguien que ya está en la lista se maneja como un **grupo aparte dentro del mismo deudor** (ver 2.4), no como una persona duplicada.
- **Yo debo** (`_initNuevaDeudaPersonaSelector`, `_onSelPersonaNuevaDeuda`): el sheet `sheet-nueva-deuda` reemplaza su campo de nombre por un botón que abre el mismo selector; si la persona elegida ya tiene una deuda registrada, no crea una segunda — redirige al detalle de la existente. El hook sobre `crearMiDeuda` exige que haya una persona seleccionada (no un nombre libre) y usa su `personaId` real en vez de adivinar por coincidencia de nombre.

### 6.1 Código muerto relacionado

`addDeudor()` (crea un deudor desde `sheet-nueva-persona` con nombre libre + color picker) y su color picker (`selColor`/`initColorPicker`) nunca se ejecutan: el override de `openSheet` en este mismo archivo intercepta `id==='nueva-persona'` y redirige siempre a `abrirSelPersona(_onSelPersonaMeDeben)` antes de que ese sheet se muestre. Se deja sin borrar (mismo criterio que el resto del código muerto documentado del proyecto), pero no vale la pena editarlo esperando ver el cambio reflejado en la app — no corre.

