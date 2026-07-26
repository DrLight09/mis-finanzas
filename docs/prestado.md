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
- **`_calcPrestadoMeta(cajitaId)`** usa estos movimientos para calcular cuánta plata de una cajita sigue "prestada" — resta tanto `destino` como cada fila de `destinos` que apunte a esa cajita.

### 2.3 Eliminar un movimiento (`eliminarMovDeudor`)

Al borrar un `'prestamo'`: revierte el saldo de la(s) fuente(s) con `sumarFuente` (o `descontarFuente` de las fuentes según corresponda). No hay movimiento secundario que limpiar.

Al borrar un `'abono'` / `'pago-completo'`:
1. Si es vía encargo: revierte usando `_encMovId`/`_encMovIds`.
2. Si no: busca el movimiento secundario por `_abonoDestinoMovId` (destino simple) o por `_movId` en cada fila de `destinos` (destino dividido), lo elimina de `S.movimientos` / `cObj.movimientos` / `cObj.historial` según dónde viva, y **solo entonces** descuenta el saldo con `descontarFuente`.
3. Si el movimiento es de datos antiguos y no tiene `_abonoDestinoMovId`/`_movId` (creado antes de que existiera esta referencia), se descuenta el saldo igual pero no se puede localizar la entrada secundaria para borrarla — queda huérfana en el historial de la cuenta destino.

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

Tanto un deudor (Me deben) como una misDeuda (Yo debo) pueden estar vinculados a una persona del registro central `S.personas[]` vía `personaId` — así se comparte nombre/avatar/color con Encargos y Spotify en vez de tener texto libre repetido en cada módulo. El módulo está repartido en tres archivos por razones de orden de carga (todos dependen de funciones de Personas — `getPersona`, `abrirSelPersona`, `_inyectarPersonaSheets` — definidas más abajo en `index.html` que el resto de Préstamos):

| Archivo | Contenido |
|---|---|
| `js/modules/prestado.js` | CRUD completo de ambos flujos (Me deben y Yo debo), namespace `data-action="prestado:..."` |
| `js/modules/prestado-personas.js` | Crear/vincular persona al agregar un deudor o una deuda desde su propio sheet; refresco cruzado con el sheet global "Editar persona"; sheet "Editar mi deuda" |
| `js/modules/deudores-personas.js` | Selector de persona (existente o nueva) compartido por "Agregar persona" (Me deben) y "Nueva deuda" (Yo debo) — mismo patrón ya usado en Encargos y Spotify |

`deudores-personas.js` cubre:
- **Me deben** (`_onSelPersonaMeDeben`): "Agregar persona" abre directamente el selector de personas en vez de un formulario de nombre libre; al elegir una persona (existente o recién creada desde el selector), crea el deudor ya vinculado.
- **Yo debo** (`_initNuevaDeudaPersonaSelector`, `_onSelPersonaNuevaDeuda`): el sheet `sheet-nueva-deuda` reemplaza su campo de nombre por un botón que abre el mismo selector; si la persona elegida ya tiene una deuda registrada, no crea una segunda — redirige al detalle de la existente. El hook sobre `crearMiDeuda` exige que haya una persona seleccionada (no un nombre libre) y usa su `personaId` real en vez de adivinar por coincidencia de nombre.
