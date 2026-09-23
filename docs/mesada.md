# Módulo Mesada

Documentación de la sección **Mesada** de `mis-finanzas`. El HTML (pantalla y sheets) vive en `index.html`; la lógica vive en [`js/modules/mesada.js`](./js/modules/mesada.js). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos guarda y por qué, cómo fluye la información, y qué decisiones de diseño se tomaron. Los detalles de implementación (funciones, ids de DOM) aparecen al final, como referencia rápida — no como el foco del documento.

Los bugs ya corregidos y el detalle de cada fix viven en [`CHANGELOG.md`](./CHANGELOG.md#mesada), no acá.

---

## 1. Objetivo

Lleva el control de la mensualidad ("mesada") que dan papá y mamá, mes a mes, año a año, incluyendo el caso de pagos parciales donde queda una deuda pendiente por cobrar.

---

## 2. Conceptos importantes

Cada mes, para cada padre, puede estar en uno de estos estados:

| Estado | Punto en la grilla | Qué significa |
|---|---|---|
| **Sin pagar (futuro)** | Gris | Todavía no venció ese mes |
| **Sin pagar (vencido)** | 🔴 Rojo | Ya venció y no hay registro de pago |
| **Pagado completo** | 🟢 Verde | Se registró un pago (igual o mayor a la cuota) |
| **Pago parcial pendiente** | 🟡 Ámbar | Recibiste menos que la cuota **y** quedó marcado que te deben la diferencia |

El caso ámbar es el que resuelve el problema típico: *"me dio 60mil de una mesada de 80mil, me quedó debiendo 20mil, y dice que me los va a dar después."*

**Cuota:** el monto mensual esperado, guardado por año (no por mes). Si un año no tiene cuota propia, hereda la del año anterior más cercano que sí la tenga.

**Pendiente:** la plata que falta por recibir de un mes marcado en ámbar. Se va cerrando con abonos posteriores hasta llegar a `0`.

**Pago con plata de un encargo:** si papá o mamá te dejó plata guardada en un encargo (módulo Encargos), la mesada de un mes puede pagarse con esa plata en vez de que entre plata nueva: se descuenta del encargo y cuenta como recibida. Solo se ofrecen encargos con saldo cuyo nombre coincide con papá/mamá (o variantes como padre, papi, madre, mami; sin importar tildes ni mayúsculas).

**Vencido (día de corte):** papá y mamá tienen plazos distintos — papá vence el día 30 del propio mes, mamá vence el día 1 del mes siguiente.

---

## 3. Reglas que nunca deben romperse

- **Marcar "quedó debiendo" es siempre una decisión explícita del usuario**, nunca automática por el solo hecho de que el monto sea menor a la cuota. Hay meses donde simplemente dan menos plata y no hay deuda real — el sistema no debe asumir que sí la hay.
- **El monto de un mes siempre refleja la plata total ya recibida a la fecha**, incluyendo abonos posteriores del pendiente. Esto mantiene coherentes los totales anuales sin tener que sumar por separado el historial en ningún otro lado.
- **Un mes queda "resuelto" cuando el pendiente llega a `0`**, pero el historial de abonos nunca se borra — queda como comprobante de que hubo un pago parcial en su momento.
- **Las tarjetas de crédito nunca son un destino válido de mesada.** Es plata que entra, no que sale, y no existe forma de "meter" dinero en una TC como si fuera una cuenta de ahorro.
- **Toda plata que entra a una cuenta rastreable (Nequi, efectivo, cajita, cuenta personalizada) deja un movimiento visible en el historial de esa cuenta**, marcado como automático — nunca debe subir un saldo "de la nada".
- **Borrar un registro de mesada revierte la plata en la cuenta exacta donde había entrado**, incluso cuando hubo abonos posteriores del pendiente que fueron a cuentas distintas al pago original. Si se pagó con plata de un encargo, también se le devuelve su saldo.
- **El saldo de un encargo por cuenta es solo una etiqueta interna:** las entradas y salidas de un encargo nunca mueven el saldo real de una cuenta. Por eso, cuando esa plata pasa a ser tuya como pago de mesada, sí se suma a la cuenta destino elegida (y se descuenta al borrar). El destino es independiente de la cuenta del encargo, que solo dice de dónde sale la plata.
- **Pagar con plata de un encargo nunca deja al encargo en negativo:** se valida lo disponible en la cuenta elegida antes de guardar.
- **La cuota se guarda por año, nunca se sobrescribe accidentalmente por un guardado de otra parte de la app.** Solo se persiste como valor explícito cuando el usuario realmente lo cambia en pantalla.

---

## 4. Modelo de datos

Todo vive en `S.mesadas`:

```js
S.mesadas = {
  papa: {
    cuotas: { "2025": 90000, "2026": 90000 },   // cuota mensual por año
    pagos: {
      "2026-6": {                                // key = "<año>-<mesIndex 0-11>"
        monto: 80000,           // total recibido a la fecha para ese mes
        fecha: "2026-07-05",
        destino: "nu",          // cuenta donde se metió la plata (modo simple) — nunca una TC
        splits: [                              // o bien, un arreglo si se dividió entre varias cuentas
          { fuente: "nequi", monto: 50000, _movSecId: "abc123" },
          { fuente: "cajita:xyz", monto: 30000, _movSecId: "def456" }
        ],
        nota: "",
        _movSecId: "abc123",    // id del movimiento espejo en la cuenta destino (solo modo simple)
        origenEncargo: {        // solo si se pagó con plata de un encargo (ver §2)
          encargoId: "...", movId: "...", nombre: "Papá",
          sumado: true          // la plata se sumó a una cuenta destino (false si el destino quedó vacío)
        },

        // Campos opcionales — solo existen si hubo pago parcial con deuda:
        cuotaEsperada: 80000,        // snapshot de la cuota cuando se marcó pendiente
        pendiente: 20000,            // cuánto falta por recibir (0 = ya saldado)
        pendienteHistorial: [        // abonos posteriores que fueron cerrando `pendiente`
          { monto: 20000, fecha: "2026-07-20", destino: "nequi", nota: "", _movSecId: "ghi789",
            origenEncargo: {...} }   // igual que arriba, si ese abono también salió de un encargo
        ]
      }
    }
  },
  mama: { cuotas: {...}, pagos: {...} }
}

S.mesadaAnio  // año que se está viendo actualmente en la pantalla (nav ← →)
```

**`origenEncargo`:** `movId` es la salida que se creó en el encargo al pagar; borrar el pago (o el abono) la quita de ahí.

**`_movSecId`:** id del movimiento "espejo" generado en la cuenta destino (ver §7). Solo existe si el destino era una cuenta rastreable — si el destino quedó vacío ("No especificar / lo gasté"), no hay `_movSecId` porque no hubo ninguna cuenta que tocar.

---

## 5. Flujo

### Registrar un pago

```
Elegir monto, fecha y destino (o dividir entre varias cuentas)
  (opcional) "Me pagó con plata de un encargo": elegir el encargo y de qué cuenta sale
  ↓
¿Monto < cuota? → aparece el toggle "quedó debiendo"
  ↓
Confirmar
  ↓
Con encargo: validar que hay saldo ahí → crear la salida en el encargo (origenEncargo)
  ↓
Sumar la plata a la(s) cuenta(s) destino + generar movimiento espejo
  ↓
Si quedó debiendo → guardar cuotaEsperada / pendiente / pendienteHistorial: []
```

### Resolver un pendiente

```
Abrir el mes con deuda activa
  ↓
Registrar abono (se recorta automáticamente si supera lo pendiente)
  ↓
Sumar a monto, restar de pendiente, agregar a pendienteHistorial
  ↓
Mover la plata a la cuenta elegida + generar movimiento espejo
```

### Borrar un registro

```
Protección por antigüedad (solo si borrar mueve el saldo de una cuenta o encargo)
  ↓
Calcular pago original = monto − suma de pendienteHistorial
  ↓
Si se pagó con encargo: quitar la salida creada en ese encargo
  ↓
Revertir el pago original de su cuenta (o de cada split, si fue dividido)
  ↓
Revertir cada abono del pendienteHistorial de su propia cuenta (y de su encargo, si aplica)
  ↓
Borrar todos los movimientos espejo asociados
```

---

## 6. Casos especiales

- **Subir la cuota a mitad de año** puede hacer que meses anteriores del mismo año (ya pagados completos en su momento) aparezcan sugeridos como "¿marcar como pendiente?" al abrir su detalle — porque la cuota se compara siempre contra el valor vigente hoy, no contra la que regía ese mes. No corrompe nada (es solo un botón sugerido, nada se marca solo), pero puede ser confuso si no se sabe que pasa esto.
- **Sin destino especificado** ("No especificar / lo gasté"): el mes cuenta igual como recibido en las estadísticas, pero no mueve ningún saldo ni genera movimiento espejo.
- **Un mes registrado con menos plata que la cuota pero nunca marcado como pendiente** (típico de registros viejos): muestra un aviso neutro para marcarlo retroactivamente como deuda, sin perder nada de lo ya guardado.
- **Abono mal cargado:** se puede deshacer un abono puntual del historial de pendiente (con confirmación), revirtiendo su plata, su movimiento espejo, y devolviendo ese monto de `monto` a `pendiente`.
- **Sin encargos cargados:** Mesada consulta a Encargos con guards, sin forzar su carga. Si el módulo todavía no cargó, o no hay un encargo con saldo que coincida con papá/mamá, la opción de pagar con encargo simplemente no aparece.
- **Borrar un pago viejo:** si borrarlo movería el saldo de una cuenta o de un encargo, aplica la protección por antigüedad (ver `docs/proteccion-antiguedad-movimientos.md`): los muy viejos se bloquean y los viejos piden una confirmación específica. Las "operaciones posteriores" que cuentan son los pagos de mesada más nuevos que tocaron alguna de las mismas cuentas. Un pago 100% "Sin especificar" (sin cuenta ni encargo afectados) no tiene nada que proteger y se borra normal.

---

## 7. Movimientos espejo en la cuenta destino

Cuando entra plata de mesada y se elige una cuenta destino, además de sumarle el saldo, mesada deja un **movimiento visible** en el historial de esa cuenta — el mismo mecanismo que usan Prestado, Encargos y Spotify. Aparece con un candado 🔒 y la etiqueta "Automático": indica que vino de otra sección y que solo se puede eliminar desde ahí, no directamente desde el historial de la cuenta.

El `id` de cada movimiento espejo se guarda junto al dato que lo originó (`_movSecId` en el pago simple, en cada `split`, o en cada entrada de `pendienteHistorial`) para poder encontrarlo y borrarlo después sin ambigüedad.

> Cuentas (`getMovimientosCuenta()`) debe leer estos movimientos **únicamente** desde `S.movimientos` — nunca reconstruirlos a partir de `S.mesadas`: cada pago aparecería dos veces, el segundo sin candado.

---

## 8. Decisiones de diseño

- **El sistema de deuda pendiente es autocontenido en el módulo Mesada**, a propósito no conectado con "Me deben" / personas (que ya tiene su propia lógica de sync con papá/mamá en otros módulos como Spotify). Mezclarlos hubiera significado meter mano en ese sync ya delicado sin necesidad. Si en algún momento se quiere que la deuda de mesada aparezca en el perfil de la persona dentro de "Me deben", es una integración aparte, no automática.
- **No existe un toggle de "saldo inicial" para mesada**, a diferencia de Nequi, cajitas y cuentas personalizadas. Ahí tiene sentido porque es la foto de un momento (cuánta plata ya tenías al empezar a usar la app) — pero mesada es un registro de eventos mensuales, no un saldo acumulado, y cada pago ya está aislado por año dentro de su propia clave (`"2025-3"`). Si se necesita registrar un mes del que se sabe que se recibió la plata pero no dónde quedó, se usa **"No especificar / lo gasté"** como destino.
- **La única integración con otro módulo es opcional y por lectura: pagar con plata de un encargo.** Mesada no comparte identidad con Personas ni con "Me deben"; encuentra el encargo por coincidencia de nombre (papá/mamá y variantes) en vez de un vínculo guardado, porque el pago con encargo es una comodidad puntual, no una relación permanente entre los dos módulos.
- **La visibilidad de pendientes no se limita a la pantalla de Mesada:** cualquier mes con deuda activa también aparece en "Necesita atención" del dashboard de inicio, para que no se pierda de vista.

---

## 9. Referencia de implementación

**Ubicación:** el HTML de la pantalla y los sheets (abajo) sigue en `index.html`. Toda la lógica vive en `js/modules/mesada.js`, un grupo lazy (`Loader.GROUPS.mesada` en `js/core/lazy-loader.js`) sin `<script>` propio. Depende de:

- los globals del núcleo (`S`, `save`, `refresh`, `fmt`, `parseMoney`, `hoy`, `uid`, `toast`, `openSheet`/`closeSheet`, `dialogo`, `sumarFuente`/`descontarFuente`, etc.);
- `js/core/calc-helpers.js`, que define `_ensureMesadas`, `_getCuotaAnio`, `getMesadaData` y `_mesNombreDeKey` (las usa también Inicio; `mesada.js` las consume como globales y no las define);
- `js/core/events.js` (`Events`) y el motor de split compartido (`js/core/split.js`, también usado por Encargos y "Yo debo");
- `encargos.js`, solo de forma opcional (ver §6).

**Clicks generados dinámicamente** (botones dentro de `abrirDetalleMesada()` y los puntos de la grilla) no usan `onclick` inline: se emiten con `Events.attr('mesada:accion', ...)` y se registran una vez con `Events.registerAll('mesada', {...})` en `mesada.js`. Los controles estáticos del sheet (`btn-anio-prev/next`, `btn-confirmar-mesada`, `btn-confirmar-mesada-pend`, `mpDestino`/`mpMonto`, `mpDebeWrap`/`mpQuedaDebiendo`, `mppDestino`/`mppMonto`, `mpSplitToggle`, `btn-add-split-row`) se cablean con `addEventListener` normal en el propio `mesada.js`.

### Pantalla principal (`#screen-mesada`)

Navegación de año (`#anioLabel`, botones prev/next, función `cambiarAnio(d)`, rango ±2 años), resumen del año (`#ms-total`, `#ms-count`), banner de pendientes (`#ms-pendiente-banner`), y una tarjeta por padre con input de cuota (`data-save-refresh`, se guarda solo) y grilla de 12 puntos. Cada punto se pinta con `renderMesada()` y al hacer click llama a `clickMesDot(parent, key, nombre)`, que decide si abrir "registrar pago" o "ver detalle".

### Sheets

| Sheet | id del overlay | Campos principales | Función que abre |
|---|---|---|---|
| Registrar pago | `sheet-mesada-pago` | `mpMonto`, `mpFecha`, `mpDestino`, `mpModoSimple`/`mpModoDividido`, `mpQuedaDebiendo`, `mpNota`, `mpUsarEncargo` (+ `mpEncargoSel`, `mpEncargoCuentaSel`) | `abrirRegistrarMesada(parent, key, nombre)` |
| Detalle del mes | `sheet-mesada-det` | `mdTitle`, `mdContent` (armado 100% por JS) | `abrirDetalleMesada(parent, key, nombre)` |
| Resolver pendiente | `sheet-mesada-pend` | `mppMonto`, `mppFecha`, `mppDestino`, `mppNota`, `mppPreview`, `mppUsarEncargo` (+ `mppEncargoSel`, `mppEncargoCuentaSel`) | `abrirResolverPendiente(parent, key)` |

### Funciones

| Función | Qué hace |
|---|---|
| `_ensureMesadas()`, `getMesadaData(parent)`, `_getCuotaAnio(parent, año)`, `_mesNombreDeKey(key)` | Viven en `js/core/calc-helpers.js`, no en `mesada.js`: garantizan que exista `S.mesadas`, devuelven los pagos de un padre, la cuota de un año (o la más cercana hacia atrás) y `"2026-6"` → `"Jul 2026"` |
| `getMontoPadre(parent)` | Cuota del año actualmente visible |
| `renderMesada()` | Pinta toda la pantalla: grillas, resúmenes, banner de pendientes |
| `clickMesDot(parent, key, nombre)` | Decide si abrir "registrar" o "detalle" según si ya hay datos |
| `cambiarAnio(d)` | Navega ±1 año (limitado a ±2 del año real). Guarda los inputs de cuota **antes** de cambiar el año activo |
| `abrirRegistrarMesada(parent, key, nombre)` | Abre el sheet de registrar pago, resetea todos los campos y toggles |
| `actualizarMpPreview()` | Preview en vivo del sheet de registrar pago (monto/cuentas) |
| `_syncMpDebeWrap(v)` | Muestra/oculta el toggle "quedó debiendo" según monto vs. cuota |
| `_registrarMovSecundarioMesada(destino, monto, fecha, desc)` | Crea el movimiento espejo en la cuenta destino |
| `_borrarMovSecundarioMesada(destino, movSecId)` | Borra un movimiento espejo previamente creado |
| `confirmarMesadaPago()` | Guarda el pago, mueve la plata, genera el espejo, guarda `pendiente` si corresponde |
| `abrirDetalleMesada(parent, key, nombre)` | Arma el HTML del detalle de un mes (incluye estado de pendiente) |
| `eliminarMesadaPago(parent, key)` | Punto de entrada del borrado: aplica la protección por antigüedad y luego llama a `_borrarMesadaPago` |
| `marcarMesadaComoPendiente(parent, key)` | Convierte retroactivamente un mes ya cerrado en uno con deuda pendiente |
| `abrirResolverPendiente(parent, key)` | Abre el sheet para registrar un abono de lo pendiente |
| `actualizarMppPreview()` | Preview en vivo del sheet de resolver pendiente |
| `confirmarPendienteMesada()` | Guarda el abono, actualiza `monto`/`pendiente`, mueve la plata y genera el espejo |
| `deshacerPendienteMesada(parent, key, idx)` | Deshace un abono puntual del historial de pendiente y su espejo (con confirmación) |
| `_mesadaEncargosDelParent(parent)` | Encargos con saldo cuyo nombre coincide con papá/mamá: candidatos a "pagó con plata de un encargo" |
| `_poblarMpEncargoCuentas()` / `_sincronizarMpDestinoConEncargo()` | Arman el selector de cuenta del encargo elegido y sugieren esa misma cuenta como destino (editable). Hay una versión `Mpp` para el sheet de pendiente |
| `_mesadaFuentesDe(info)` / `_mesadaTieneCuentaAfectada(info)` / `_mesadaOpsPosteriores(...)` | Insumos de la protección por antigüedad al borrar (ver §6) |
| `_borrarMesadaPago(parent, key, info)` | Cuerpo real del borrado, separado de `eliminarMesadaPago` para no duplicar la reversión |

### Código sin uso

`mpMesNombre` (variable global) se asigna en `abrirRegistrarMesada()` pero no se lee en ningún otro lado. Inofensivo, anotado por si en algún momento se hace limpieza de código.
