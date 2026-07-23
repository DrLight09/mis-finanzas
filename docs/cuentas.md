# Módulo Cuentas

Documentación de la sección **Cuentas** de `mis-finanzas` (`index.html` → `js/modules/cuentas.js`). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos guarda y por qué, cómo fluye la información, y qué decisiones de diseño se tomaron. Los detalles de implementación (funciones, ids de sheets) aparecen al final, como referencia rápida — no como el foco del documento.

Los bugs ya corregidos viven en [`CHANGELOG.md`](./CHANGELOG.md#cuentas), no acá.

---

## 1. Objetivo

Es la vista de "cuentas de plata líquida": Nequi, Efectivo, cualquier cuenta personalizada (otros bancos/apps) y Nu — que además de ser una cuenta normal, funciona como cajitas de ahorro con tasa variable y la posibilidad de invertir en CDTs. Permite ver saldo y movimientos de cada una, mover plata entre ellas, y corregir errores (saldo inicial, chequeos manuales contra la app real de Nu).

A diferencia de Spotify, Mesada o Encargos — que registran la actividad propia de un proceso de negocio — Cuentas es sobre todo una **ventana**: la mayoría de lo que se ve en el historial de una cuenta lo generaron *otros* módulos (un cobro de Spotify, una mesada, un abono de un préstamo) y llega acá como movimiento espejo, no como dato propio de Cuentas.

---

## 2. Conceptos importantes

**Cuenta rastreable:** Nequi, Efectivo, una cajita de Nu o una cuenta personalizada — cualquier cuenta cuyo saldo vive en `S` y puede recibir/perder plata de forma rastreada. Se identifican con una `fuente` (`'nequi'`, `'efectivo'`, `'cajita:ID'`, `'custom:ID'`) — el mismo formato que usa el resto de la app para "¿de dónde sale / a dónde entra la plata?" en cualquier sheet.

**Saldo inicial / apertura:** el monto que ya tenías en una cuenta al empezar a registrarla en la app — no es un ingreso real, es una foto de un momento. Se guarda como un movimiento marcado `_esApertura` para no confundirlo con crecimiento real en el historial de patrimonio (ver `montoBase` en `analisis-financiero.md §5`).

**Cajita (Nu):** una "bolsa" dentro de Nu con su propio saldo, que rinde intereses a una tasa EA (efectiva anual) — la misma para todas las cajitas de la cuenta, pero puede cambiar con el tiempo (ver "tramos de tasa" abajo). Puede tener una meta de ahorro asociada y CDTs abiertos.

**Tramos de tasa:** la tasa EA de Nu no es fija — sube o baja con el tiempo, y Nu no avisa el día exacto en que cambió. La app guarda un historial de tramos (`tasa vigente desde tal fecha`) para poder calcular intereses correctamente sobre períodos donde la tasa cambió a mitad de camino, en vez de aplicar la tasa de hoy a todo el historial.

**CDT (Certificado de Depósito a Término):** una inversión a plazo fijo dentro de una cajita, con su propia tasa EA (puede ser distinta a la de la cajita), fecha de vencimiento y retención en la fuente (RTE) sobre los intereses generados. Al vencer, se puede cobrar (la plata vuelve a la cajita) o liberar manualmente.

**Meta de ahorro:** un objetivo de monto + fecha límite asociado a una cajita, con seguimiento de aportes y una cuota sugerida (cuánto falta ÷ meses que quedan) para saber si vas al día.

**Chequeo de saldo real:** una corrección manual del saldo calculado de Nu contra lo que la app de Nu muestra de verdad — existe porque la tasa variable y el redondeo diario de intereses pueden hacer que el cálculo de la app se desvíe un poco del valor real con el tiempo.

---

## 3. Reglas que nunca deben romperse

- **Las tarjetas de crédito nunca son un destino válido para dinero que entra** — ni "Agregar dinero", ni el menú `+` del header, ni "Transferir" permiten una TC como destino. Sí se puede pagar *con* una TC en otros módulos (genera deuda), pero nunca "guardar" plata ahí.
- **Todo movimiento que otro módulo genera dentro de una cuenta (mesada, cobro de Spotify, abono de un préstamo, encargo) se ve en el historial de esa cuenta marcado como "Automático" y protegido contra borrado directo** — solo se puede deshacer desde el módulo que lo originó, nunca desde el historial de la cuenta. Cuentas es quien *muestra* la protección (candado 🔒, ícono de eliminar bloqueado), no quien la implementa por cuenta propia — cada módulo marca sus propios movimientos.
- **Eliminar un movimiento revierte exactamente la plata de ese movimiento, ni más ni menos** — incluyendo una transferencia, donde hay que revertir **ambos lados** (restar de donde entró, devolver a donde salió), y una cuenta personalizada, donde la reversión tiene que hablar en su propia convención de saldo (`ingreso`/`egreso`, ver §4) en vez de la de `S.movimientos`.
- **El saldo inicial (apertura) es un movimiento especial, no un ingreso normal** — nunca debe sumarse como "ingreso del mes" en Análisis financiero, y corregirlo (`abrirEditarApertura`) nunca debe borrar y recrear el movimiento como si fuera nuevo, porque eso perdería su fecha original y afectaría el historial de patrimonio.
- **Una persona puede pagar/mover plata en la misma cuenta varias veces**; ningún cálculo de saldo o de intereses debe asumir "un solo movimiento por día/mes".
- **El cálculo de intereses de Nu respeta los tramos de tasa histórica** — nunca aplica la tasa de hoy retroactivamente a todo el saldo. Si se corrige una tasa vieja, solo afecta el período donde esa tasa estuvo vigente.
- **Un CDT usa el valor real que Nu depositó al cobrarlo, no el valor calculado.** El cálculo teórico (`calcCDT`) es una proyección para mostrar en pantalla mientras el CDT está activo — al cobrar, el usuario ingresa el monto real que le llegó, y ese es el que se acredita. Nunca se asume que el cálculo teórico y el real van a coincidir exactamente (redondeos, cambios de RTE, etc.).
- **El chequeo de saldo real de Nu es siempre una corrección explícita del usuario**, nunca una auto-corrección silenciosa — mismo criterio que el resto de la app para decisiones que tocan plata.
- **`renderMovsCuenta` reconstruye el historial en vivo desde todas las fuentes que tocan esa cuenta** (`S.movimientos`, `S.gastosVar`, préstamos, mesada, Spotify, encargos, transferencias, cuentas personalizadas) — Cuentas no mantiene su propio ledger paralelo. Si un módulo nuevo empieza a mover plata hacia/desde una cuenta, tiene que aparecer en esta reconstrucción o quedará invisible en el historial de esa cuenta aunque el saldo sí se haya movido.

---

## 4. Modelo de datos

```js
S.cuentas = {
  nequi:    { saldo: 450000 },
  efectivo: { saldo: 80000 }
}

S.nu = {
  tasaActual: 12.75,               // % EA vigente hoy
  tasaHistorial: [                 // tramos de tasa (ver §2)
    { desde: "2026-01-01", tasa: 12.25 },
    { desde: "2026-05-15", tasa: 12.75 }
  ],
  cajitas: [
    {
      id: "uid", nombre: "Emergencias", saldo: 1200000,
      color: "#c8f060",
      meta: {                       // opcional — solo si se configuró una meta
        monto: 5000000, desde: "2026-01-01", hasta: "2026-12-31",
        aportes: [{ monto: 200000, fecha: "2026-03-01", desc: "" }]
      },
      cdts: [
        {
          id: "uid", monto: 500000, tasa: 13.5, rte: 4,
          fechaApertura: "2026-06-01", fechaVence: "2026-09-01",
          estado: "activo",          // 'activo' | 'cobrado' | 'liberado'
          valorReal: null            // se llena al cobrar (ver §3)
        }
      ]
    }
  ]
}

S.cuentasPersonalizadas = [
  {
    id: "uid", nombre: "Bancolombia", saldo: 300000,
    icono: "bank", color: "#60b0f0",
    movimientos: [
      // Convención PROPIA, distinta a S.movimientos — ver §7
      { id: "uid", tipo: "ingreso", monto: 50000, fecha: "2026-07-01", desc: "" }
      // tipo: 'ingreso' | 'egreso' (nunca 'entrada'/'salida'/'apertura'/'transferencia')
    ]
  }
]
```

**Movimientos de Nequi/Efectivo/cajitas:** viven en `S.movimientos`, con `tipo: 'entrada'|'salida'|'apertura'|'transferencia'` y `fuente`/`destino` apuntando a la cuenta. Cualquier otro valor de `tipo` (ej. un antiguo `'ingreso'` heredado de otra convención) cae por descarte en la rama de "salida" al renderizar — ver la nota de este mismo gotcha documentada en `guia-estilo-sheets.md` para Alcancía, que usa el mismo motor de cuentas.

**`_movsFilters`:** estado de los filtros de búsqueda/tipo/fecha por cuenta (`{ [cuentaKey]: {q, tipo, desde, hasta} }`) — vive solo en memoria del navegador mientras la pantalla está abierta, no se persiste a Firestore. Es intencional: son filtros de exploración, no una preferencia que valga la pena sincronizar entre dispositivos.

---

## 5. Flujo

### Agregar dinero a Nequi/Efectivo/cajita

```
Elegir cuenta (o ya viene fija si se entró desde el detalle de esa cuenta)
  ↓
¿Es saldo inicial? → toggle explícito (ver §3)
  ↓
Elegir origen ("¿de dónde viene esta plata?") — obligatorio, TC excluida
  ↓
Monto + fecha + nota opcional
  ↓
Confirmar → sumarFuente(cuenta, +monto) + movimiento en S.movimientos
```

### Transferir entre cuentas

```
Elegir cuenta origen y cuenta destino (TC excluida de ambos lados)
  ↓
Monto (con validación de saldo suficiente en origen)
  ↓
Confirmar → descontarFuente(origen, monto) + sumarFuente(destino, monto)
  ↓
Un movimiento tipo:'transferencia' que registra ambos lados
```

### Crear y cobrar un CDT

```
Elegir cajita → monto (mín. $50.000), tasa EA, fecha de apertura y vencimiento, RTE
  ↓
sumarFuente sale de la cajita hacia el CDT (deja de contar como saldo líquido de la cajita)
  ↓
calcCDT() proyecta el valor teórico mientras está activo
  ↓
Al vencer: cobrar (ingresar valor REAL depositado por Nu) o liberar manualmente
  ↓
Ese valor real se acredita de vuelta a la cajita — nunca el valor teórico
```

### Eliminar un movimiento

```
eliminarMovimiento (punto de entrada único, compartido con toda la app)
  ↓
¿Es un movimiento "Automático" (marcado por otro módulo)? → bloqueado, avisa que se borre desde el módulo dueño
  ↓
Si es propio de Cuentas: revertir la plata de la cuenta (o de AMBAS cuentas si era una transferencia)
  ↓
Si la cuenta es personalizada: revertir en su propia convención (ingreso/egreso), no en la de S.movimientos
```

### Chequeo de saldo real de Nu

```
Abrir "Chequear saldo real" desde la pantalla de Nu
  ↓
Mostrar saldo calculado vs. campo para el saldo real (según la app de Nu)
  ↓
Confirmar → se registra la diferencia como ajuste, sin tocar la tasa ni el historial de tramos
```

---

## 6. Casos especiales

- **Cambiar la tasa de Nu a mitad de un tramo ya calculado:** no reescribe intereses ya materializados; el tramo nuevo solo aplica desde su fecha `desde` en adelante.
- **Cobrar un CDT antes de tiempo (liberar manual):** existe aparte de "cobrar" porque cobrar asume que ya venció (usa el flujo de valor real); liberar manual es para el caso de necesitar la plata antes, sin pasar por esa validación de vencimiento.
- **Editar el nombre o la cuota de un integrante de una cajita no toca su meta ni sus CDTs** — son sub-objetos independientes dentro de la misma cajita.
- **Cuenta personalizada eliminada con movimientos:** al eliminar la cuenta se pide confirmación explícita; el historial de movimientos de esa cuenta se pierde junto con la cuenta (a diferencia de, por ejemplo, un integrante de Spotify, donde el historial de cobros sobrevive porque vive en `spotifyHistorial`, no dentro del integrante).
- **Filtro de movimientos sin resultados:** muestra un estado vacío explicando qué filtro está activo, no una lista en blanco sin contexto.
- **Movimiento sin destino especificado en otro módulo** (ej. mesada con "No especificar / lo gasté"): no aparece en el historial de ninguna cuenta porque nunca tocó ninguna — comportamiento esperado, no un bug de Cuentas.

---

## 7. Decisiones de diseño

- **El historial de una cuenta se reconstruye en vivo, no se guarda como su propio ledger.** La alternativa — que cada módulo, al mover plata, además escribiera una copia del movimiento dentro de un array propio de Cuentas — hubiera significado dos fuentes de verdad para la misma plata (la de Cuentas y la del módulo original), con el riesgo de que se desincronizaran. Reconstruir on-demand desde las fuentes originales es más lento de calcular pero estructuralmente imposible de desincronizar.
- **Cuentas personalizadas usan su propia convención de movimiento (`ingreso`/`egreso`) en vez de la de `S.movimientos` (`entrada`/`salida`/`apertura`/`transferencia`).** Documentado ya como una fuente de bugs (ver la nota en `guia-estilo-sheets.md` sobre Alcancía) — nace de que las cuentas personalizadas se agregaron después, sin retrofit del modelo original. No se unificó en esta migración por ser un cambio de modelo de datos, no de arquitectura de eventos — fuera del alcance de esta sesión.
- **Nu es una cuenta más para el usuario, pero un subsistema aparte en el código** (tasa, tramos, cajitas, CDTs, metas): la complejidad real de Nu (tasa variable con historial, CDTs con RTE) no existe en ninguna otra cuenta, así que forzarla a compartir estructura con Nequi/Efectivo hubiera complicado ambas sin necesidad.
- **El valor real de un CDT al cobrarlo manda sobre el cálculo teórico** — ver §3. Alternativa descartada: confiar ciegamente en `calcCDT()` y acreditar ese valor automáticamente. Se prefirió pedir el valor real porque el cálculo teórico es una proyección (asume tasa constante, sin contar redondeos de Nu), y una inversión real merece registrar la plata que de verdad llegó, no la que se esperaba.
- **El chequeo de saldo real es manual, no una sincronización automática con Nu.** La app no tiene integración con la API de Nu (ni la tiene ningún otro módulo del proyecto) — es una corrección de bolsillo para cuando el usuario nota una diferencia, no un proceso recurrente automatizado.

---

## 8. Referencia de implementación

### Sheets (ver `guia-estilo-sheets.md` para el detalle de campos y orden)

| Sheet | Qué hace |
|---|---|
| `sheet-nueva-cuenta` | Crear cuenta personalizada (nombre, saldo inicial, ícono, color) |
| `sheet-mov-cuenta-custom` | Agregar/retirar dinero de una cuenta personalizada |
| `sheet-agregar-dinero` | Agregar dinero a Nequi/Efectivo (con toggle de saldo inicial) |
| `sheet-agregar-dinero-menu` | Igual, pero desde el botón `+` del header sin cuenta preseleccionada |
| `sheet-restar-dinero` | Restar dinero de Nequi/Efectivo |
| `sheet-editar-apertura` | Corregir el saldo inicial ya registrado |
| `sheet-transferir` | Transferir entre dos cuentas cualquiera (TC excluida) |
| `sheet-nu-movimiento` | Entrada/salida de plata en una cajita de Nu |
| `sheet-crear-cdt` | Abrir un CDT dentro de una cajita |
| `sheet-cobrar-cdt` | Cobrar un CDT vencido con el valor real |
| `sheet-meta-cajita` | Configurar/editar la meta de ahorro de una cajita |
| `chequeo-nu` *(sin id documentado en `guia-estilo-sheets.md` — pendiente agregarlo ahí)* | Corregir el saldo calculado de Nu contra el real |

### Funciones clave

| Función | Qué hace |
|---|---|
| `abrirCuenta(fuente)` / `volverSelector()` | Navegación entre el selector de cuentas y el detalle de una |
| `renderDetalleCuenta()` | Pinta saldo, acciones y lista de movimientos de la cuenta activa |
| `getMovimientosCuenta(fuente)` / `_getMovimientosCuentaCustom(fuente)` | Reconstruyen el historial de una cuenta desde todas las fuentes que la tocan (ver §7) |
| `renderMovsCuenta(cuentaKey)` | Aplica filtros y pinta la lista de movimientos, con protección de borrado para los "Automático" |
| `abrirTransferir(origen?)` / `confirmarTransferir()` | Sheet y confirmación de transferencia entre cuentas |
| `abrirAgregarDinero(fuente)` / `confirmarAgregarDinero()` | Agregar dinero (con o sin toggle de apertura) |
| `abrirRestarDinero(fuente)` / `confirmarRestarDinero()` | Restar dinero |
| `abrirEditarApertura(fuente)` / `confirmarEditarApertura()` | Corregir el saldo inicial ya registrado |
| `addCajita()` / `deleteCajita(id)` | Crear/eliminar una cajita de Nu |
| `registrarTasaNuHistorial(tasa, desde)` | Agrega un tramo nuevo al historial de tasa EA |
| `calcCDT(cdt)` / `calcRendimientoCDTMes(...)` | Proyección teórica de un CDT activo |
| `abrirCrearCDT(cajitaId)` / `confirmarCrearCDT()` | Abrir un CDT nuevo |
| `abrirCobrarCDT(cajitaId, cdtId)` / `confirmarCobrarCDT()` | Cobrar con el valor real (ver §3, §7) |
| `liberarCDTManual(cajitaId, cdtId)` | Liberar antes de vencimiento sin pasar por el flujo de "cobrar" |
| `abrirMetaCajita(cajitaId)` / `guardarMetaCajita()` / `quitarMetaCajita()` | Configurar/quitar la meta de ahorro de una cajita |
| `calcMetaProgreso(cajita)` | % de avance y cuota sugerida de la meta |
| `poblarChequeoNu()` / `guardarChequeoNu()` | Sheet de corrección manual del saldo real de Nu |
| `abrirNuevaCuenta()` / `crearCuentaCustom()` / `editarCuentaCustom()` / `eliminarCuentaCustom()` | CRUD de cuentas personalizadas |

### Código sin uso

`toggleCDT()`, `toggleCajita()` y `_expandCajitaCDTs()` ya no los llama nadie — trabajan sobre ids (`cajita-wrap-*`, `cajita-cdt-*-*`) que el render actual de cajitas ya no genera. Quedaron de un diseño de UI anterior (cajitas expandibles en una sola lista, antes de que existiera la pantalla de detalle aparte). Se dejaron intactas y anotadas para una limpieza futura — mismo criterio que `mpMesNombre` en Mesada.

### Observación aparte (no es un bug de Cuentas, pero se notó al documentar)

`guardarChequeoNu()` usa el `confirm()` nativo del navegador en vez de `dialogo()` (el reemplazo que usa el resto de la app). No se tocó por estar fuera del alcance de la migración — queda anotado para revisar si vale la pena unificarlo.
