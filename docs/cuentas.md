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

**Saldo inicial / apertura:** el monto que ya tenías en una cuenta al empezar a registrarla en la app — no es un ingreso real, es una foto de un momento. Se guarda como un movimiento con `tipo:'apertura'` para no confundirlo con crecimiento real en el historial de patrimonio (ver `montoBase` en `analisis-financiero.md §5`).

**Cajita (Nu):** una "bolsa" dentro de Nu con su propio saldo, que rinde intereses a una tasa EA (efectiva anual) — la misma para todas las cajitas de la cuenta, pero puede cambiar con el tiempo (ver "tramos de tasa" abajo). Puede tener una meta de ahorro asociada y CDTs abiertos.

**Tramos de tasa:** la tasa EA de Nu no es fija — sube o baja con el tiempo, y Nu no avisa el día exacto en que cambió. La app guarda un historial de tramos (`tasa vigente desde tal fecha`) para poder calcular intereses correctamente sobre períodos donde la tasa cambió a mitad de camino, en vez de aplicar la tasa de hoy a todo el historial.

**CDT (Certificado de Depósito a Término):** una inversión a plazo fijo dentro de una cajita, con su propia tasa EA (puede ser distinta a la de la cajita), fecha de vencimiento y retención en la fuente (RTE) sobre los intereses generados. Al vencer, se puede cobrar (la plata vuelve a la cajita) o liberar manualmente.

**Meta de ahorro:** un objetivo de monto + fecha límite asociado a una cajita, con seguimiento de aportes y una cuota sugerida (cuánto falta ÷ meses que quedan) para saber si vas al día. Aparte del objetivo a alcanzar, una meta puede tener opcionalmente un `minimo` — lo opuesto a una meta de ahorro: un piso de saldo que dispara una alerta visual si la cajita cae por debajo (no estaba documentado en ninguna versión anterior de este archivo).

**Chequeo de saldo real:** una corrección manual del saldo calculado de Nu contra lo que la app de Nu muestra de verdad — existe porque la tasa variable y el redondeo diario de intereses pueden hacer que el cálculo de la app se desvíe un poco del valor real con el tiempo.

---

## 3. Reglas que nunca deben romperse

- **"Mover a otra cuenta" solo se puede usar con saldo ≥ $1,00 en esa cuenta.** El botón queda deshabilitado (`actualizarBotonesTransferir()`) y el origen de Transferir nunca lista cuentas vacías; el **destino** sí puede estar vacío, porque la plata entra. La regla de "qué cuentas se ofrecen cuando la plata sale" vive en `js/core/fuentes-filtro.js` (`FuentesFiltro`), no se repite en cada sheet. **Origen y destino nunca pueden ofrecer la misma cuenta a la vez**: elegir una cuenta en un lado la quita de las opciones del otro (`_trPodarSelect`, mismo patrón de exclusión mutua que usan las filas de Dividir en `js/core/split.js` — ver §8), en vez de solo avisar el error después de elegir mal.
- **Las tarjetas de crédito nunca son un destino válido para dinero que entra** — ni "Agregar dinero", ni el menú `+` del header, ni "Transferir" permiten una TC como destino. Sí se puede pagar *con* una TC en otros módulos (genera deuda), pero nunca "guardar" plata ahí.
- **Todo movimiento que otro módulo genera dentro de una cuenta (mesada, cobro de Spotify, abono de un préstamo, encargo) se ve en el historial de esa cuenta marcado como "Automático" y protegido contra borrado directo** — solo se puede deshacer desde el módulo que lo originó, nunca desde el historial de la cuenta. Cuentas es quien *muestra* la protección (candado 🔒, ícono de eliminar bloqueado), no quien la implementa por cuenta propia — cada módulo marca sus propios movimientos.
- **Eliminar un movimiento revierte exactamente la plata de ese movimiento, ni más ni menos** — incluyendo una transferencia, donde hay que revertir **ambos lados** (restar de donde entró, devolver a donde salió), y una cuenta personalizada, donde `eliminarMovimiento()` tiene que saber leer **ambas** convenciones según la antigüedad del dato: los movimientos nuevos viven en `S.movimientos` igual que Nequi/Efectivo; el saldo inicial fijado al crear la cuenta y los movimientos viejos (anteriores a 2026-09) viven en `c.movimientos` con su propia convención (`ingreso`/`egreso`, ver §4/§7).
- **El saldo inicial (apertura) es un movimiento especial, no un ingreso normal** — nunca debe sumarse como "ingreso del mes" en Análisis financiero, y corregirlo (`abrirEditarApertura`) nunca debe borrar y recrear el movimiento como si fuera nuevo, porque eso perdería su fecha original y afectaría el historial de patrimonio.
- **Una persona puede pagar/mover plata en la misma cuenta varias veces**; ningún cálculo de saldo o de intereses debe asumir "un solo movimiento por día/mes".
- **El cálculo de intereses de Nu respeta los tramos de tasa histórica** — nunca aplica la tasa de hoy retroactivamente a todo el saldo. Si se corrige una tasa vieja, solo afecta el período donde esa tasa estuvo vigente.
- **Un CDT usa el valor real que Nu depositó al cobrarlo, no el valor calculado.** El cálculo teórico (`calcCDT`) es una proyección para mostrar en pantalla mientras el CDT está activo — al cobrar, el usuario ingresa el monto real que le llegó, y ese es el que se acredita. Nunca se asume que el cálculo teórico y el real van a coincidir exactamente (redondeos, cambios de RTE, etc.).
- **El chequeo de saldo real de Nu es siempre una corrección explícita del usuario**, nunca una auto-corrección silenciosa — mismo criterio que el resto de la app para decisiones que tocan plata.
- **Un saldo anotado en el chequeo que se aleja mucho de lo calculado nunca se aplica sin una confirmación explícita previa** (ver §5). Un cambio de tasa mueve el saldo unos pesos por mes; una diferencia grande casi siempre es un error de digitación o plata sin registrar, y el chequeo (que sobrescribe el saldo sin dejar movimiento) la absorbería en silencio.
- **Una sugerencia de cambio de tasa nunca se aplica sola, y quien la recibe siempre puede deshacer el chequeo que la originó** ("Me equivoqué — corregir los saldos"), no solo aceptar o rechazar la tasa.
- **Todo movimiento de Alcancía que aparezca en el historial de una cuenta se pinta con el monto oculto (`••••`) y sin abrir el detalle** (desde 2026-09-19). Cuentas sí muestra la fila — es plata que salió (o pasó por) esa cuenta — pero nunca el monto, para que mientras la alcancía esté activa el total no pueda reconstruirse sumando filas. La marca es `_alcOculto` (y el `tipo` de esas filas es `'alcancia'`, con su propio chip de filtro y badge ámbar — nunca `'gasto'`/`'ingreso'`), que ponen `getMovimientosCuenta()` y `_getMovimientosCuentaCustom()` (gastos `_esAlcancia` y entradas `_esAlcanciaIngreso`) y consume `renderMovsCuenta()`. Esas filas **no** llevan `data-mov-monto` ni abren detalle, pero **sí deben seguir en la lista** con su efecto real sobre el saldo (un depósito desde la cuenta pesa `−monto`; un ingreso neto-cero `_esAlcanciaIngreso` pesa `0`, porque `alcancia.js` suma y resta lo mismo) — `abrirDetalleMov()` reconstruye el Antes/Después de las demás filas sumando `getMovimientosCuenta()`, así que quitar una fila de la lista descuadra los saldos históricos de todo lo anterior. Cualquier tipo de cuenta nuevo o función nueva que arme filas de historial tiene que propagarla; los movimientos del destape (`Alcancía destapada…`, ajuste) no se marcan a propósito, porque el total ya se reveló. Ver `alcancia.md` §3/§7.
- **`renderMovsCuenta` reconstruye el historial en vivo desde todas las fuentes que tocan esa cuenta** (`S.movimientos`, `S.gastosVar`, préstamos, mesada, Spotify, encargos, transferencias, cuentas personalizadas) — Cuentas no mantiene su propio ledger paralelo. Si un módulo nuevo empieza a mover plata hacia/desde una cuenta, tiene que aparecer en esta reconstrucción o quedará invisible en el historial de esa cuenta aunque el saldo sí se haya movido.

---

## 4. Modelo de datos

```js
S.cuentas = {
  nequi:    { saldo: 450000 },
  efectivo: { saldo: 80000 }
}

// Las cajitas viven sueltas en S.cajitas[], y la tasa de Nu en dos
// campos aparte, también sueltos (no hay ningún contenedor S.nu):

S.nuTasaGlobal = 12.75            // % EA vigente hoy (S.nuRate es el
                                   // nombre legacy — _tasaVigenteEnFecha
                                   // cae a S.nuRate solo si nuTasaGlobal
                                   // no existe, nunca al revés)

S.historialTasasNu = [            // tramos de tasa (ver §2), clave `fecha`
  { fecha: "2026-01-01", tasa: 12.25 },   // NO `desde` — el campo real es `fecha`
  { fecha: "2026-05-15", tasa: 12.75 }
]

S.cajitas = [
  {
    id: "uid", nombre: "Emergencias", saldo: 1200000,
    fecha: "2026-06-01",            // fecha del último cálculo de interés materializado (ver calcC)
    color: "#c8f060",
    meta: {                         // opcional — solo si se configuró una meta
      objetivo: 5000000,            // NO `monto` — el campo real es `objetivo`
      inicio: "2026-01-01",
      fin: "2026-12-31",            // NO `hasta` — el campo real es `fin`
      aportes: [{ monto: 200000, desc: "" }],  // el aporte NO guarda fecha propia — ver nota abajo
      minimo: 300000                // opcional — piso de saldo, lo OPUESTO a un objetivo
                                     // a alcanzar (alerta si el saldo cae por debajo)
    },
    cdts: [
      {
        id: "uid", monto: 500000, tasa: 13.5, rte: 4,
        inicio: "2026-06-01", vence: "2026-09-01"
        // Eso es TODO el objeto. No existe `estado` ni `valorReal` en el
        // CDT — al cobrarlo (`confirmarCobrarCDT`), el valor real se
        // acredita directo a `c.saldo` y el CDT se saca del array con
        // `c.cdts = c.cdts.filter(x=>x.id!==cdtId)`. Un CDT "cobrado" no
        // queda registrado como tal en ningún lado del modelo — el único
        // rastro es la entrada de `logCambio` ("Cobraste CDT de...").
      }
    ]
  }
]

S.cuentasPersonalizadas = [
  {
    id: "uid", nombre: "Bancolombia", saldo: 300000,
    icono: "bank", color: "#60b0f0",
    movimientos: [
      // Convención PROPIA (histórica) — ver §7. Desde 2026-09 solo quedan acá
      // el saldo inicial fijado al CREAR la cuenta (crearCuentaCustom, siempre
      // tipo:'apertura') y los movimientos viejos, de antes de esa fecha. Los
      // ingresos/retiros/aperturas NUEVOS ya no se escriben acá — van a
      // S.movimientos, con la misma convención que Nequi/Efectivo (ver abajo).
      { id: "uid", tipo: "ingreso", monto: 50000, fecha: "2026-07-01", desc: "" }
      // tipo (legacy, solo datos viejos): 'ingreso' | 'egreso' | 'apertura'
    ]
  }
]
```

**Nota sobre `meta.aportes`:** a diferencia de lo que sugiere el nombre, cada aporte en el array NO guarda su propia fecha en el modelo verificado — la "cuota mensual" que calcula `calcMetaProgreso` sale de sumar `aportes[].monto` cuando ese array existe, y de `objetivo / totalMeses` si no. Si en algún momento se necesita fecha por aporte, es un cambio de modelo nuevo, no algo que ya exista y este documento simplemente no mencionaba.

**Movimientos de Nequi/Efectivo/cajitas y (desde 2026-09) cuentas personalizadas:** viven en `S.movimientos`, con `tipo: 'entrada'|'salida_manual'|'apertura'|'transferencia'` y `fuente`/`destino` apuntando a la cuenta (`'custom:ID'` para una personalizada). Cualquier otro valor de `tipo` (ej. un antiguo `'ingreso'` heredado de otra convención) cae por descarte en la rama de "salida" al renderizar — ver la nota de este mismo gotcha documentada en `guia-estilo-sheets.md` para Alcancía, que usa el mismo motor de cuentas. Para una cuenta personalizada, `getMovimientosCuenta`/`_getMovimientosCuentaCustom` combinan esto con lo que todavía viva en `c.movimientos` (ver arriba) sin duplicar — ver `CHANGELOG.md#cuentas` (2026-09-03).

**`_movsFilters`:** estado de los filtros de búsqueda/tipo/fecha por cuenta (`{ [cuentaKey]: {q, tipo, desde, hasta} }`) — vive solo en memoria del navegador mientras la pantalla está abierta, no se persiste a Firestore. Es intencional: son filtros de exploración, no una preferencia que valga la pena sincronizar entre dispositivos.

---

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
Si la cuenta es personalizada: el registro puede vivir en S.movimientos (movimientos
nuevos, desde 2026-09) o en c.movimientos (saldo inicial de creación + datos viejos)
— eliminarMovimiento() revisa ambos y revierte según dónde esté (ver §7)
```

### Chequeo de saldo real de Nu

```
Abrir "Chequear saldo real" desde la pantalla de Nu
  ↓
Mostrar saldo calculado vs. campo para el saldo real (según la app de Nu)
  ↓
Si la cajita tiene plata de un encargo adentro: se compara el valor anotado
contra dos referencias (saldo propio calculado vs. propio+encargo) para
decidir si el usuario escribió el total físico o ya su parte neta, y solo
se resta el encargo en el primer caso (ver "Casos especiales")
  ↓
Si algún valor anotado se aleja mucho de lo calculado (más de 2 % y más de $1.000) →
aviso previo con el detalle por cajita; "Cancelar" deja el sheet abierto con lo anotado
para corregirlo, y no se guarda nada
  ↓
Confirmar → el saldo de la cajita se corrige al valor real anotado (sin generar
movimiento, igual que la acreditación de intereses), y el valor queda guardado
como punto histórico en S.chequeosNu. Justo antes se toma una foto en memoria del estado
anterior (saldos, fechas y S.chequeosNu) por si hay que deshacerlo
  ↓
Con el historial de chequeos acumulado, se revisa aparte si la tasa EA configurada
sigue explicando el crecimiento real observado (ver "Detección de cambio de tasa"
más abajo) — es un chequeo independiente, no afecta si el saldo se corrige o no
```

### Detección de cambio de tasa (a partir de los chequeos)

```
Cada chequeo guardado alimenta una serie de "tasa implícita" por fecha
(solo se comparan dos chequeos de la misma cajita separados por ≥ 5 días;
un chequeo más cercano no cuenta y el siguiente se mide contra el último válido)
  ↓
Un punto cuenta como desvío solo si se aleja > 0,05 puntos EA de la tasa vigente
Y la diferencia equivale a > $1 contra lo que habría dado esa tasa (no es redondeo)
  ↓
Un par que se aleja > 5 puntos EA de la tasa vigente se descarta de la serie: no es
una tasa, es plata sin registrar o un valor mal anotado (el aviso previo ya lo cubre)
  ↓
Si los últimos 2+ puntos consecutivos son desvíos del MISMO lado (todos por encima o
todos por debajo) → se sugiere un cambio de tasa (con la fecha desde la que aplicaría)
  ↓
Sheet "Cambio de tasa Nu detectado", con tres salidas:
  · Aplicar cambio de tasa (tasa y fecha editables)
  · Me equivoqué — corregir los saldos: deshace el chequeo y reabre el sheet con lo que se anotó
  · Dejar la tasa como está: el chequeo queda guardado, sin tocar la tasa
```

El primer chequeo de una cajita solo fija su punto de partida; la primera comparación posible es con el segundo.

---

## 6. Casos especiales

- **Cambiar la tasa de Nu a mitad de un tramo ya calculado:** no reescribe intereses ya materializados; el tramo nuevo solo aplica desde su fecha `desde` en adelante.
- **Cobrar un CDT antes de tiempo (liberar manual):** existe aparte de "cobrar" porque cobrar asume que ya venció (usa el flujo de valor real); liberar manual es para el caso de necesitar la plata antes, sin pasar por esa validación de vencimiento.
- **Editar el nombre o la cuota de un integrante de una cajita no toca su meta ni sus CDTs** — son sub-objetos independientes dentro de la misma cajita.
- **Cuenta personalizada eliminada con movimientos:** al eliminar la cuenta se pide confirmación explícita; el historial de movimientos de esa cuenta se pierde junto con la cuenta (a diferencia de, por ejemplo, un integrante de Spotify, donde el historial de cobros sobrevive porque vive en `spotifyHistorial`, no dentro del integrante).
- **Filtro de movimientos sin resultados:** muestra un estado vacío explicando qué filtro está activo, no una lista en blanco sin contexto.
- **Ninguna cuenta con saldo ≥ $1,00 al abrir "Transferir":** el sheet no se abre y `abrirTransferir()` avisa con un toast (cubre el botón del menú `+` y el de "Sumar dinero", que no pasan por los botones de cada cuenta). Los botones "Mover a otra cuenta" de cada cuenta ya están deshabilitados en ese caso.
- **Depósito a la Alcancía en el historial de una cuenta** (2026-09-19): aparece como una fila normal ("Depósito en alcancía", fecha, badge "Alcancía", candado) con `••••` en vez del monto; tocarla no abre el detalle. Vale para Nequi, Efectivo, cajitas de Nu (en la lista de Nu) y cuentas personalizadas. Para borrarlo hay que ir a Alcancía (`alcanciaEliminarDeposito`), nunca desde acá — incluso los depósitos viejos (anteriores a 2026-08-06, sin `_secundario`) salen bloqueados por la misma razón. También se ocultan (con el mismo `••••`) en la búsqueda global; Actividad reciente no los lista. Antes de esa fecha el historial se comportaba distinto según el tipo de cuenta: Nequi/Efectivo/Nu no mostraban la fila y las cuentas personalizadas sí, con el monto a la vista (ver `CHANGELOG.md#cuentas`).
- **Movimiento sin destino especificado en otro módulo** (ej. mesada con "No especificar / lo gasté"): no aparece en el historial de ninguna cuenta porque nunca tocó ninguna — comportamiento esperado, no un bug de Cuentas.
- **Cobro de Spotify sin `id` en `S.spotifyHistorial`** (historial legado, de antes de que la app le asignara `id` a cada cobro): `getMovimientosCuenta()`/`_getMovimientosCuentaCustom()` usan un `_movId` de respaldo (`'sp_legacy_' + índice del registro en spotifyHistorial`) para que el ítem conserve un orden estable y siga marcado como "Automático" — no puede eliminarse directo desde Cuentas de todas formas, igual que cualquier otro movimiento secundario (ver `CHANGELOG.md#cuentas`, 2026-08-30).
- **Chequeo de saldo real en una cajita con encargo adentro:** el usuario puede anotar el total físico que ve en la app de Nu (propio + encargo, sin distinguir, que es como Nu lo muestra) o ya su parte neta si él mismo descontó el encargo antes de escribir. La app decide cuál de los dos casos aplica comparando el valor anotado contra ambas referencias calculadas y quedándose con la más cercana — solo resta el encargo si el valor está más cerca del total. No se pide una confirmación aparte para esto: se asume automáticamente, porque la diferencia entre "propio" y "total" es normalmente el monto completo del encargo, mucho mayor que cualquier corrección real de unos pocos pesos.

---

## 7. Decisiones de diseño

- **El historial de una cuenta se reconstruye en vivo, no se guarda como su propio ledger.** La alternativa — que cada módulo, al mover plata, además escribiera una copia del movimiento dentro de un array propio de Cuentas — hubiera significado dos fuentes de verdad para la misma plata (la de Cuentas y la del módulo original), con el riesgo de que se desincronizaran. Reconstruir on-demand desde las fuentes originales es más lento de calcular pero estructuralmente imposible de desincronizar.
- **Cuentas personalizadas usaban su propia convención de movimiento (`ingreso`/`egreso` en `c.movimientos`) en vez de la de `S.movimientos` (`entrada`/`salida`/`apertura`/`transferencia`).** Nacía de que las cuentas personalizadas se agregaron después, sin retrofit del modelo original — documentado como fuente de bugs (ver la nota en `guia-estilo-sheets.md` sobre Alcancía). **Cerrado a medias el 2026-09-03** (ver `CHANGELOG.md#cuentas`): "Agregar"/"Retirar" en una cuenta personalizada ahora usan los mismos sheets y la misma convención (`S.movimientos`) que Nequi/Efectivo, así que todo movimiento **nuevo** ya no tiene esta distinción. Lo que sigue sin unificar, a propósito, por ser cambio de modelo de datos y no de arquitectura de eventos: el saldo inicial fijado al **crear** la cuenta (`crearCuentaCustom()` sigue empujando directo a `c.movimientos`) y todo el historial **anterior** a esa fecha. `getMovimientosCuenta`/`_getMovimientosCuentaCustom` (lectura), `eliminarMovimiento` (borrado) y `calcHealthScore` (ingresos del mes, en `inicio.js`) ya saben combinar ambas fuentes sin duplicar — cualquier función nueva que necesite el historial completo de una cuenta personalizada tiene que hacer lo mismo, no asumir que todo vive en `S.movimientos`.
- **Nu es una cuenta más para el usuario, pero un subsistema aparte en el código** (tasa, tramos, cajitas, CDTs, metas): la complejidad real de Nu (tasa variable con historial, CDTs con RTE) no existe en ninguna otra cuenta, así que forzarla a compartir estructura con Nequi/Efectivo hubiera complicado ambas sin necesidad.
- **El valor real de un CDT al cobrarlo manda sobre el cálculo teórico** — ver §3. Alternativa descartada: confiar ciegamente en `calcCDT()` y acreditar ese valor automáticamente. Se prefirió pedir el valor real porque el cálculo teórico es una proyección (asume tasa constante, sin contar redondeos de Nu), y una inversión real merece registrar la plata que de verdad llegó, no la que se esperaba.
- **El chequeo de saldo real es manual, no una sincronización automática con Nu.** La app no tiene integración con la API de Nu (ni la tiene ningún otro módulo del proyecto) — es una corrección de bolsillo para cuando el usuario nota una diferencia, no un proceso recurrente automatizado.
- **Los umbrales de la detección de tasa están puestos para ignorar el ruido, no para captar cualquier diferencia.** Con Nu mostrando centavos y el usuario a veces anotando pesos enteros, 1 peso de diferencia sobre un día de rendimiento de una cajita de ~$20.000 equivale a casi 2 puntos de EA — sin los filtros (≥ 5 días entre chequeos, > $1 de diferencia, racha del mismo lado, tope de 5 puntos), un chequeo diario con pesos enteros sugería \"cambios de tasa\" de 9,25 % a 9,10 %. El costo es que una cajita pequeña tarda más en revelar un cambio de tasa chico (0,25 puntos sobre $20.000 son menos de $1 por semana); el efecto se suma entre cajitas porque la diferencia en pesos se acumula por fecha. Todos los valores viven en `_CFG_CHEQUEO_NU`.
- **El chequeo se aplica y luego se puede deshacer, en vez de esperar la decisión sobre la tasa antes de guardar.** Alternativa descartada: calcular la sugerencia de tasa con el chequeo \"hipotético\" antes de aplicarlo. Habría exigido reescribir cómo `calcularSerieTasaImplicitaNu()` arma su punto de partida (hoy usa el estado ya corregido de las cajitas). La foto en memoria (`_chequeoNuUndo`) es más simple, no agrega nada a `S`, y su única limitación es que si se cierra la app antes de decidir, el chequeo queda aplicado (igual que antes).
- **No existe una forma de registrar manualmente "la tasa cambió desde una fecha pasada X" con corrección retroactiva completa.** Se consideró (había incluso un input de fecha para esto que nunca llegó a conectarse a ninguna función — eliminado, ver `CHANGELOG.md#cuentas`) y se descartó a propósito: el sistema de tramos de tasa solo puede recalcular correctamente el intervalo entre el último movimiento de cada cajita y hoy, porque cada depósito/retiro ya sella los intereses ganados hasta ese momento con la tasa vigente en ese instante (`materializarIntereses()`). Si el cambio real de tasa ocurrió antes de un movimiento ya sellado, ese tramo queda con la tasa vieja para siempre — corregirlo de verdad exigiría reconstruir el historial completo de movimientos, mucho más invasivo que el problema que resuelve. El **chequeo de saldo real** cubre el mismo caso de uso (tasa que cambió sin avisar) sin esa limitación, porque corrige el resultado final en vez de intentar reconstruir el cálculo paso a paso.

---

## 8. Referencia de implementación

### Sheets (ver `guia-estilo-sheets.md` para el detalle de campos y orden)

| Sheet | Qué hace |
|---|---|
| `sheet-nueva-cuenta` | Crear cuenta personalizada (nombre, saldo inicial, ícono, color) |
| `sheet-agregar-dinero` | Agregar dinero a Nequi/Efectivo/cuenta personalizada (con toggle de saldo inicial) |
| `sheet-agregar-dinero-menu` | Igual, pero desde el botón `+` del header sin cuenta preseleccionada |
| `sheet-restar-dinero` | Restar dinero de Nequi/Efectivo/cuenta personalizada |
| `sheet-editar-apertura` | Corregir el saldo inicial ya registrado (Nequi/Efectivo/cuenta personalizada) |
| `sheet-transferir` | Transferir entre dos cuentas cualquiera (TC excluida; origen solo lista cuentas con saldo ≥ $1,00) |
| `sheet-nu-movimiento` | Entrada/salida de plata en una cajita de Nu |
| `sheet-crear-cdt` | Abrir un CDT dentro de una cajita |
| `sheet-cobrar-cdt` | Cobrar un CDT vencido con el valor real |
| `sheet-meta-cajita` | Configurar/editar la meta de ahorro de una cajita |
| `chequeo-nu` *(sin id documentado en `guia-estilo-sheets.md` — pendiente agregarlo ahí)* | Corregir el saldo calculado de Nu contra el real |
| `confirmar-tasa-nu` *(idem)* | Aviso de cambio de tasa tras un chequeo: aplicar (tasa y fecha editables), deshacer el chequeo o dejar la tasa como está |

### Funciones clave

| Función | Qué hace |
|---|---|
| `abrirCuenta(fuente)` / `volverSelector()` | Navegación entre el selector de cuentas y el detalle de una |
| `renderDetalleCuenta()` | Pinta saldo, acciones y lista de movimientos de la cuenta activa |
| `getMovimientosCuenta(fuente)` / `_getMovimientosCuentaCustom(fuente)` | Reconstruyen el historial de una cuenta desde todas las fuentes que la tocan (ver §7) |
| `renderMovsCuenta(cuentaKey)` | Aplica filtros y pinta la lista de movimientos, con protección de borrado para los "Automático" y monto oculto (`••••`, sin detalle) para las filas con `_alcOculto` (depósitos a Alcancía) |
| `abrirTransferir(origen?)` / `confirmarTransferir()` | Sheet y confirmación de transferencia entre cuentas |
| `_trPodarSelect(selId, fuentes, valExcluir)` / `_trOrigenCambio()` / `_trDestinoCambio()` | Exclusión mutua origen/destino: al cambiar uno, quitan del otro la cuenta recién elegida (conservando la selección vigente si sigue disponible) |
| `actualizarBotonesTransferir()` | Habilita/deshabilita los botones "Mover a otra cuenta" según saldo ≥ $1,00 |
| `abrirAgregarDinero(fuente,nombre)` / `confirmarAgregarDinero()` | Agregar dinero (con o sin toggle de apertura) — Nequi/Efectivo/cuenta personalizada |
| `abrirRestarDinero(fuente,nombre)` / `confirmarRestarDinero()` | Restar dinero — mismo alcance que arriba |
| `abrirEditarApertura(fuente)` / `confirmarEditarApertura()` | Corregir el saldo inicial ya registrado |
| `getAperturaMov(fuente)` | Busca el movimiento de apertura vigente — revisa `S.movimientos` y, para `'custom:ID'`, hace fallback a `c.movimientos` (ver §7) |
| `addCajita()` / `deleteCajita(id)` | Crear/eliminar una cajita de Nu |
| `registrarTasaNuHistorial(fechaStr, tasa)` | Agrega/actualiza un tramo en `S.historialTasasNu` (la firma real es `(fechaStr, tasa)`, y el campo que guarda es `fecha`, no `desde` — ver §4) |
| `calcCDT(cdt)` / `calcRendimientoCDTMes(...)` | Proyección teórica de un CDT activo |
| `abrirCrearCDT(cajitaId)` / `confirmarCrearCDT()` | Abrir un CDT nuevo |
| `abrirCobrarCDT(cajitaId, cdtId)` / `confirmarCobrarCDT()` | Cobrar con el valor real (ver §3, §7) |
| `liberarCDTManual(cajitaId, cdtId)` | Liberar antes de vencimiento sin pasar por el flujo de "cobrar" |
| `abrirMetaCajita(cajitaId)` / `guardarMetaCajita()` / `quitarMetaCajita()` | Configurar/quitar la meta de ahorro de una cajita |
| `calcMetaProgreso(cajita)` | % de avance y cuota sugerida de la meta |
| `poblarChequeoNu()` / `guardarChequeoNu()` | Sheet de corrección manual del saldo real de Nu (`guardarChequeoNu` es `async`: pide confirmación con `dialogo()` si un valor se aleja mucho de lo calculado) |
| `_interpretarLecturaChequeoNu(c, val)` | Dado lo que el usuario anotó, devuelve el saldo propio resultante y el valor calculado contra el que se comparó (resuelve el caso encargo adentro, ver §6). Única fuente de esa lógica |
| `calcularSerieTasaImplicitaNu()` / `verificarTasaNu()` | Serie de tasa implícita por chequeo y detección de desvío sostenido (ver §5). Umbrales en `_CFG_CHEQUEO_NU` |
| `_abrirConfirmarTasaNu(r)` / `confirmarCambioTasaNu()` / `corregirChequeoNu()` | Sheet `confirmar-tasa-nu`: aplicar la tasa sugerida (editable) o deshacer el chequeo con `_chequeoNuUndo` |
| `abrirNuevaCuenta()` / `crearCuentaCustom()` / `editarCuentaCustom()` / `eliminarCuentaCustom()` | CRUD de cuentas personalizadas — `crearCuentaCustom()` sigue siendo el único punto que escribe el saldo inicial directo en `c.movimientos` en vez de `S.movimientos` (ver §7) |

### Código sin uso

`toggleCDT()`, `toggleCajita()` y `_expandCajitaCDTs()` ya no los llama nadie — trabajan sobre ids (`cajita-wrap-*`, `cajita-cdt-*-*`) que el render actual de cajitas ya no genera. Quedaron de un diseño de UI anterior (cajitas expandibles en una sola lista, antes de que existiera la pantalla de detalle aparte). Se dejaron intactas y anotadas para una limpieza futura — mismo criterio que `mpMesNombre` en Mesada.
