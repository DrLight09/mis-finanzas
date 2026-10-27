# Módulo Nu

Documentación de la parte **Nu** de `mis-finanzas`: la cuenta con cajitas de ahorro, tasa EA, CDTs, metas y chequeo rápido (`index.html` → `js/modules/nu.js`, más el cálculo en `js/core/nu-calc.js`). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos guarda y por qué se diseñó así.

Nu comparte pantalla, historial y botones de "Agregar/Retirar dinero" con el resto de las cuentas: lo común está en [`cuentas.md`](./cuentas.md). Los bugs ya corregidos viven en [`CHANGELOG.md`](./CHANGELOG.md#sheets--ui), no acá.

## Estructura de archivos

| Archivo | Qué hace |
|---|---|
| `js/core/nu-calc.js` | **Núcleo.** Cálculo puro: `calcC` (interés diario compuesto por tramos de tasa y de encargos), `calcCDT`, `rendimientoCajitaPorMes`, `nuValorEsperadoCajita`, `nuTotal`, la tasa única (`nuTasaConfigurada`, `getNuTasaGlobal`, `nuTasaSanear/DesdeTexto/ATexto`) y la disponibilidad por cajita (`cajitaGeneraIntereses`, `cajitaChequeable`, `cajitasChequeables`). Vive en el núcleo porque el patrimonio, Inicio y Encargos lo necesitan en cualquier pantalla |
| `js/modules/nu.js` | **Lo que muta datos y pinta pantallas de Nu:** tasa e historial, `materializarIntereses`, cajitas (crear/eliminar/lista/detalle), "Agregar/Retirar dinero" de una cajita, CDTs, metas, chequeo rápido, y qué acciones están disponibles (`actualizarBotonesNu`). Registra sus botones como `data-action="nu:…"` |
| `js/modules/cuentas.js` | La capa genérica de cuentas (selector, detalle simple, historial, Agregar/Retirar/Transferir). `nu.js` y `cuentas.js` son el grupo lazy `cuentas`. **La dependencia va en un solo sentido: Nu usa a Cuentas, Cuentas no nombra nada de Nu** (la lista de lo que Nu toma está en la cabecera de `nu.js`). Nu se presenta a Cuentas registrándose en `CuentaPantallas` (`core-state.js`): `paneles`, `panel`, `reiniciar()`, `render()` y `actualizarBotones()` |

---

## 1. Objetivo

Llevar las cajitas de Nu con el mismo saldo e intereses que muestra la app de Nu: una tasa EA única para todas, intereses compuestos día a día que respetan los cambios de tasa y el dinero de encargos guardado en la cajita, CDTs con su propia tasa y retención, metas de ahorro, y un chequeo rápido para contrastar con la realidad sin integración automática con Nu.

Que el usuario nunca pueda operar sobre algo que no existe todavía: sin tasa no hay cajitas, sin cajitas no hay acciones de Nu, y una cajita solo entra al chequeo cuando ya generó un día completo de intereses.

---

## 2. Conceptos importantes

**Cajita (Nu):** una "bolsa" dentro de Nu con su propio saldo, que rinde intereses a una tasa EA (efectiva anual) — la misma para todas las cajitas de la cuenta, pero puede cambiar con el tiempo (ver "tramos de tasa" abajo). Puede tener una meta de ahorro asociada y CDTs abiertos.

**Tramos de tasa:** la tasa EA de Nu no es fija — sube o baja con el tiempo, y Nu no avisa el día exacto en que cambió. La app guarda un historial de tramos (`tasa vigente desde tal fecha`) para poder calcular intereses correctamente sobre períodos donde la tasa cambió a mitad de camino, en vez de aplicar la tasa de hoy a todo el historial.

**CDT (Certificado de Depósito a Término):** una inversión a plazo fijo dentro de una cajita, con su propia tasa EA (puede ser distinta a la de la cajita), fecha de vencimiento y retención en la fuente (RTE) sobre los intereses generados. Al vencer, se puede cobrar (la plata vuelve a la cajita) o liberar manualmente.

**Meta de ahorro:** un objetivo de monto + fecha límite asociado a una cajita, con seguimiento de aportes y una cuota sugerida (cuánto falta ÷ meses que quedan) para saber si vas al día. Aparte del objetivo a alcanzar, una meta puede tener opcionalmente un `minimo` — lo opuesto a una meta de ahorro: un piso de saldo que dispara una alerta visual si la cajita cae por debajo (no estaba documentado en ninguna versión anterior de este archivo).

**Chequeo de saldo real:** una corrección manual del saldo calculado de Nu contra lo que la app de Nu muestra de verdad — existe porque la tasa variable y el redondeo diario de intereses pueden hacer que el cálculo de la app se desvíe un poco del valor real con el tiempo.

**Tasa única:** `S.nuRate`, una sola tasa EA para todas las cajitas (`null` = sin configurar). Las cajitas no guardan tasa propia; solo cada CDT guarda la suya. Cambiarla (al salir del campo o con Enter, y solo si el valor cambió) la registra en `S.historialTasasNu` desde hoy; la pantalla ya no muestra un resumen de ese historial, que sigue siendo interno (lo usa `calcC` para calcular por tramos).

**Reloj de intereses de una cajita:** `c.fecha` — la fecha desde la que `calcC` compone intereses. Se reinicia al sellar intereses (`materializarIntereses`) y arranca con el primer depósito, no con la creación de la cajita. Con él se decide si la cajita ya generó "un día completo" (`calcC(c).dias >= 1`).

**Valor esperado de una cajita:** `nuValorEsperadoCajita(c)` = `{propio, encargos, total}`: lo propio con sus intereses, el dinero de encargos guardado ahí y la suma, que es lo que debería mostrar la app de Nu.

---

## 3. Reglas que nunca deben romperse

- **El cálculo de intereses de Nu respeta los tramos de tasa histórica** — nunca aplica la tasa de hoy retroactivamente a todo el saldo. Si se corrige una tasa vieja, solo afecta el período donde esa tasa estuvo vigente.
- **El saldo de encargos dentro de una cajita también respeta tramos por fecha, igual que la tasa** — nunca se le aplica el saldo de encargo *de hoy* a días anteriores a que esa plata realmente entrara. Si un encargo deposita plata nueva en una cajita, esa plata solo empieza a componer intereses desde su propia fecha de entrada, no desde la última vez que se materializó la cajita completa (corregido 2026-09-26, ver `CHANGELOG.md#cuentas`).
- **Un CDT usa el valor real que Nu depositó al cobrarlo, no el valor calculado.** El cálculo teórico (`calcCDT`) es una proyección para mostrar en pantalla mientras el CDT está activo — al cobrar, el usuario ingresa el monto real que le llegó, y ese es el que se acredita. Nunca se asume que el cálculo teórico y el real van a coincidir exactamente (redondeos, cambios de RTE, etc.).
- **El chequeo de saldo real de Nu es siempre una corrección explícita del usuario**, nunca una auto-corrección silenciosa — mismo criterio que el resto de la app para decisiones que tocan plata.
- **Un saldo anotado en el chequeo que se aleja mucho de lo calculado nunca se aplica sin una confirmación explícita previa** (ver §5). Un cambio de tasa mueve el saldo unos pesos por mes; una diferencia grande casi siempre es un error de digitación o plata sin registrar, y el chequeo (que sobrescribe el saldo sin dejar movimiento) la absorbería en silencio.
- **Una sugerencia de cambio de tasa nunca se aplica sola, y quien la recibe siempre puede deshacer el chequeo que la originó** ("Me equivoqué — corregir los saldos"), no solo aceptar o rechazar la tasa.
- **Sin tasa configurada no se crea ninguna cajita ni se opera en Nu.** `addCajita` lo comprueba, los botones salen deshabilitados con su motivo (`_motivoNu*`) y cada acción (`abrirNuMovimiento`, `abrirChequeoNu`, `guardarChequeoNu`) lo vuelve a comprobar. La tasa nunca puede quedar vacía ni en 0 (un valor inválido se ignora y se restaura al salir del campo).
- **Un depósito en una cajita vacía arranca el reloj de intereses ese día**, nunca desde la fecha de creación (`materializarIntereses` reinicia `c.fecha` cuando no hay plata propia ni de encargos).
- **Chequeo rápido: solo entran las cajitas que ya generaron intereses un día completo, evaluadas una por una** (más las ya chequeadas hoy, para poder corregir la lectura). Una cajita nueva nunca altera a las demás.
- **El Chequeo rápido siempre anota el TOTAL de Nu, encargos incluidos** (saldo propio = lectura − encargos). Una lectura menor que el dinero de encargos de esa cajita se rechaza antes de guardar nada.
- **Los intereses sellados no se reabren:** cambiar la tasa no recalcula hacia atrás.

---

## 4. Modelo de datos

```js
// Las cajitas viven sueltas en S.cajitas[], y la tasa de Nu en un campo
// aparte, también suelto (no hay ningún contenedor S.nu):

S.nuRate = 12.75                  // % EA de TODAS las cajitas (una sola). null = sin
                                   // configurar: no se pueden crear cajitas ni operar
                                   // en Nu hasta escribirla. Las cajitas NO guardan
                                   // tasa; solo cada CDT guarda la suya (cdt.tasa)

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
```

**Nota sobre `meta.aportes`:** a diferencia de lo que sugiere el nombre, cada aporte en el array NO guarda su propia fecha en el modelo verificado — la "cuota mensual" que calcula `calcMetaProgreso` sale de sumar `aportes[].monto` cuando ese array existe, y de `objetivo / totalMeses` si no. Si en algún momento se necesita fecha por aporte, es un cambio de modelo nuevo, no algo que ya exista y este documento simplemente no mencionaba.

**`S.chequeosNu`** (puntos históricos del chequeo): `{ fecha, cajitaId, saldoReal }` con `saldoReal` = el TOTAL anotado (encargos incluidos). Un segundo chequeo el mismo día reemplaza al primero.

**Versión del esquema:** la tasa única (`S.nuRate`; no existen `S.nuTasaGlobal` ni `cajita.tasa`) es parte del modelo base del esquema 9; ya no hay migración. Ver `libro-de-movimientos.md` §4.

---

## 5. Flujo

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

### Chequeo de saldo real de Nu

```
Abrir "Chequear saldo real" desde la pantalla de Nu
  ↓
Solo entran las cajitas que ya generaron intereses un día completo (cada una por su cuenta).
Por cajita se muestra lo que Nu DEBERÍA marcar hoy — el total: saldo propio con intereses
más el dinero de encargos guardado ahí (nuValorEsperadoCajita) — y un campo para anotar lo
que marca la app de Nu de verdad. Siempre se anota el TOTAL de Nu, encargos incluidos;
no se adivina nada: saldo propio = lectura − encargos (ver "Casos especiales")
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
- **Un encargo deposita plata nueva en una cajita que no se materializaba hacía varios días:** `calcC()` parte el cálculo también en la fecha exacta del depósito (no solo en cambios de tasa) — esa plata nueva gana intereses únicamente desde ese día en adelante, nunca retroactivos al último `c.fecha` de la cajita. Antes del fix, el saldo de encargo *de hoy* se aplicaba a todo el periodo compuesto, dándole a un depósito recién hecho intereses de días en los que esa plata ni siquiera existía ahí (bug real, reportado por el usuario y corregido 2026-09-26 — ver `CHANGELOG.md#cuentas`). Lo mismo aplica en sentido contrario: si el encargo retira plata de la cajita a mitad de periodo, esa porción deja de componer intereses desde su fecha de salida, no desde `c.fecha`.
- **Chequeo de saldo real en una cajita con encargo adentro:** Nu muestra un solo número (propio + encargos, sin distinguir), y eso es lo que se anota. El sheet muestra ese mismo total esperado (`nuValorEsperadoCajita`: lo propio con sus intereses + `_saldoEncargosEnCajita`, sin sumar nada dos veces: `calcC` ya compone los intereses sobre la base total y devuelve `val` solo con lo propio) y avisa cuánto de ese total son encargos. Al guardar, `_interpretarLecturaChequeoNu` fija el saldo propio como lectura − encargos y compara contra el total esperado; `S.chequeosNu.saldoReal` guarda el total (así la detección de tasa compara total contra total). Si lo anotado es menor que el dinero de encargos de esa cajita, el saldo propio saldría negativo: se avisa (casi siempre es haber anotado solo lo propio) y no se guarda nada. Antes la pantalla mostraba solo lo propio y la app adivinaba, por cuál valor quedaba más cerca, si lo anotado era el total o lo propio.

---

## 7. Decisiones de diseño
- **Cambiar la tasa no recalcula nada hacia atrás, y la app no lo aparenta.** `materializarIntereses()` sella los intereses en cada movimiento, así que no se pueden reabrir desde la fecha en que realmente cambió la tasa (por eso se retiró el campo "Vigente desde"). Confirmar una tasa nueva solo la registra en `S.historialTasasNu` desde hoy (no se guarda nada mientras se escribe, ni si es la misma tasa; no toca saldos, movimientos ni CDTs); para contrastar con la realidad está el Chequeo rápido (y su sugerencia de tasa). Por eso se quitó el aviso "Cajitas recalculadas: $X" (solo sumaba `calcC().val` de las cajitas) y el código del campo "Vigente desde", que ya no existía en la página.
- **El campo de tasa EA es solo numérico:** `nuTasaSanear()` quita letras, signos y separadores sobrantes mientras se escribe (3 enteros, 4 decimales) y `nuTasaDesdeTexto()` valida de forma estricta (número completo, mayor que 0 y hasta 100; "9abc" o "9," no valen). Lo usan el campo de las cajitas, la tasa sugerida tras un chequeo y (saneo) la tasa de un CDT. Un valor inválido nunca cambia `S.nuRate`; al salir del campo se restaura la tasa vigente.
- **Nu es una cuenta más para el usuario, pero un subsistema aparte en el código** (tasa, tramos, cajitas, CDTs, metas): la complejidad real de Nu (tasa variable con historial, CDTs con RTE) no existe en ninguna otra cuenta, así que forzarla a compartir estructura con Nequi/Efectivo hubiera complicado ambas sin necesidad.
- **El valor real de un CDT al cobrarlo manda sobre el cálculo teórico** — ver §3. Alternativa descartada: confiar ciegamente en `calcCDT()` y acreditar ese valor automáticamente. Se prefirió pedir el valor real porque el cálculo teórico es una proyección (asume tasa constante, sin contar redondeos de Nu), y una inversión real merece registrar la plata que de verdad llegó, no la que se esperaba.
- **El chequeo de saldo real es manual, no una sincronización automática con Nu.** La app no tiene integración con la API de Nu (ni la tiene ningún otro módulo del proyecto) — es una corrección de bolsillo para cuando el usuario nota una diferencia, no un proceso recurrente automatizado.
- **Los umbrales de la detección de tasa están puestos para ignorar el ruido, no para captar cualquier diferencia.** Con Nu mostrando centavos y el usuario a veces anotando pesos enteros, 1 peso de diferencia sobre un día de rendimiento de una cajita de ~$20.000 equivale a casi 2 puntos de EA — sin los filtros (≥ 5 días entre chequeos, > $1 de diferencia, racha del mismo lado, tope de 5 puntos), un chequeo diario con pesos enteros sugería \"cambios de tasa\" de 9,25 % a 9,10 %. El costo es que una cajita pequeña tarda más en revelar un cambio de tasa chico (0,25 puntos sobre $20.000 son menos de $1 por semana); el efecto se suma entre cajitas porque la diferencia en pesos se acumula por fecha. Todos los valores viven en `_CFG_CHEQUEO_NU`.
- **El chequeo se aplica y luego se puede deshacer, en vez de esperar la decisión sobre la tasa antes de guardar.** Alternativa descartada: calcular la sugerencia de tasa con el chequeo \"hipotético\" antes de aplicarlo. Habría exigido reescribir cómo `calcularSerieTasaImplicitaNu()` arma su punto de partida (hoy usa el estado ya corregido de las cajitas). La foto en memoria (`_chequeoNuUndo`) es más simple, no agrega nada a `S`, y su única limitación es que si se cierra la app antes de decidir, el chequeo queda aplicado (igual que antes).
- **No existe una forma de registrar manualmente "la tasa cambió desde una fecha pasada X" con corrección retroactiva completa.** Se consideró (había incluso un input de fecha para esto que nunca llegó a conectarse a ninguna función — eliminado, ver `CHANGELOG.md#cuentas`) y se descartó a propósito: el sistema de tramos de tasa solo puede recalcular correctamente el intervalo entre el último movimiento de cada cajita y hoy, porque cada depósito/retiro ya sella los intereses ganados hasta ese momento con la tasa vigente en ese instante (`materializarIntereses()`). Si el cambio real de tasa ocurrió antes de un movimiento ya sellado, ese tramo queda con la tasa vieja para siempre — corregirlo de verdad exigiría reconstruir el historial completo de movimientos, mucho más invasivo que el problema que resuelve. El **chequeo de saldo real** cubre el mismo caso de uso (tasa que cambió sin avisar) sin esa limitación, porque corrige el resultado final en vez de intentar reconstruir el cálculo paso a paso.
- **El sheet de CDT tiene un solo interruptor de modo (`_cdtEditId`) y un solo listener en el botón.** Editar un CDT reutiliza el sheet de crear. Antes el modo edición le asignaba un segundo handler al botón con `btn.onclick` mientras el listener de crear seguía puesto, así que al guardar corrían los dos: `confirmarCrearCDT()` mostraba "Saldo insuficiente. Solo tienes $0 en la cajita" (comparaba el capital del CDT contra el saldo libre) y, con saldo suficiente, habría creado un CDT duplicado descontando plata de la cajita. Ahora el botón llama siempre a `confirmarSheetCDT()`, que decide por `_cdtEditId`. Editar no depende del saldo porque el capital ya está invertido y no cambia. Alternativa descartada: permitir cambiar el capital al editar; moverlo exigiría ajustar el saldo de la cajita y el historial, y la edición está pensada para corregir tasa y fechas.
- **Cuentas y Nu son dos archivos del mismo grupo lazy, y Nu es una capa sobre Cuentas.** `cuentas.js` llegó a ~3.000 líneas con Nu (cajitas, CDTs, metas, chequeo) ocupando casi la mitad; el cálculo ya estaba en el núcleo (`nu-calc.js`) y lo que quedaba era un subsistema completo con sus propios botones. El primer corte (2026-10-17) fue mecánico y dejó un ciclo: Cuentas seguía llamando a 4 cosas de Nu (el preview del CDT, el filtro del campo de tasa, la rama de Nu del detalle y de los botones de transferir, y una materialización de intereses que `sumarFuente` ya hace). El 2026-10-18 se movió ese código a `nu.js` y se dejó **un solo sentido de dependencia**: Nu reutiliza lo genérico de Cuentas (sheets de Agregar/Retirar/Transferir, historial, enrutado de paneles: es una cuenta más) y Cuentas no sabe que Nu existe; le pregunta a lo que haya registrado en `CuentaPantallas` (en el núcleo, para que el orden de carga no importe). Una cuenta nueva con pantalla propia se hace igual: se registra desde su archivo. Los botones de Nu son `nu:…`. Alternativa descartada: volver a un solo archivo (no aportaba nada y mezclaba dos dominios). Las pruebas `cuentas-nu-archivos` vigilan que cada archivo cargue solo, que `cuentas.js` no use nada de `nu.js`, la lista exacta de lo que Nu toma de Cuentas, que ningún botón quede sin registrar y que ningún test cargue `cuentas.js` sin `nu.js`.

---

## 8. Referencia de implementación

### Sheets (ver `guia-estilo-sheets.md` para el detalle de campos y orden)

| Sheet | Qué hace |
|---|---|
| `sheet-nu-movimiento` | Entrada/salida de plata en una cajita de Nu |
| `sheet-crear-cdt` | Abrir un CDT dentro de una cajita |
| `sheet-cobrar-cdt` | Cobrar un CDT vencido con el valor real |
| `sheet-meta-cajita` | Configurar/editar la meta de ahorro de una cajita |
| `chequeo-nu` *(sin id documentado en `guia-estilo-sheets.md` — pendiente agregarlo ahí)* | Corregir el saldo calculado de Nu contra el real |
| `confirmar-tasa-nu` *(idem)* | Aviso de cambio de tasa tras un chequeo: aplicar (tasa y fecha editables), deshacer el chequeo o dejar la tasa como está |

### Funciones clave

| Función | Qué hace |
|---|---|
| `nuValorEsperadoCajita(c)` (`nu-calc.js`) | Lo que Nu debería mostrar hoy en la cajita: `{propio, encargos, total, ganado}`. El Chequeo rápido muestra y compara contra `total` |
| `nuTasaSanear` / `nuTasaDesdeTexto` / `nuTasaATexto` (`nu-calc.js`) | Saneo mientras se escribe, validación estricta y formato (coma decimal) de la tasa EA |
| `addCajita()` / `deleteCajita(id)` | Crear/eliminar una cajita de Nu |
| `calcC(c)` | Motor de interés diario compuesto de una cajita — por tramos de tasa (`S.historialTasasNu`) **y** por tramos de saldo de encargo (fechas en que un encargo depositó/retiró plata de esa cajita), para que cada porción de plata gane interés solo por los días que realmente estuvo ahí (ver §3, §6) |
| `_saldoEncargosEnCajitaEnFecha(cajitaId, fechaStr)` | Como `_saldoEncargosEnCajita()` pero reconstruido a una fecha pasada (solo cuenta movimientos de encargo hasta esa fecha) — usado por `calcC()` para partir tramos |
| `_fechasCambioEncargoEnCajita(cajitaId, desde, hasta)` | Fechas dentro de un rango en que algún movimiento de encargo tocó esa cajita — los puntos de quiebre que usa `calcC()` además de los cambios de tasa |
| `registrarTasaNuHistorial(fechaStr, tasa)` | Agrega/actualiza un tramo en `S.historialTasasNu` (la firma real es `(fechaStr, tasa)`, y el campo que guarda es `fecha`, no `desde` — ver §4) |
| `calcCDT(cdt)` / `calcRendimientoCDTMes(...)` | Proyección teórica de un CDT activo |
| `abrirCrearCDT(cajitaId)` / `confirmarCrearCDT()` | Abrir un CDT nuevo. `confirmarCrearCDT()` exige saldo en la cajita y descuenta el monto |
| `editarCDT(cajitaId, cdtId)` / `guardarCDT(cajitaId, cdtId)` | Editar un CDT existente en el mismo sheet. Solo cambia tasa, fechas y retención; el capital no se puede cambiar y el saldo de la cajita no se toca, así que no depende de tener saldo disponible |
| `validarCamposCDT(campos, ahora?)` | Reglas de tasa, retención y fechas de un CDT, UNA sola vez para crear y editar. Pura (no lee el DOM ni avisa): recibe los textos del formulario y los valores por defecto, y devuelve `{ok, tasa, rte, inicio, vence}` o `{ok:false, mensaje}`. Vacío usa el valor por defecto (crear: tasa 9,25, RTE 4; editar: el valor actual del CDT); la tasa debe ser > 0, la RTE 0–100 (0 es válida), la apertura no puede ser futura y el vencimiento es obligatorio y posterior. El monto mínimo y el saldo de la cajita siguen en `confirmarCrearCDT()` porque solo aplican al crear |
| `confirmarSheetCDT()` | Único listener del botón del sheet "crear-cdt": llama a `guardarCDT()` si `_cdtEditId` tiene un id y a `confirmarCrearCDT()` si es `null` |
| `_cdtModoSheet(editando)` | Pinta el sheet para crear o editar (título, texto, botón, capital de solo lectura, oculta "Disponible en cajita" e "Invertir todo" al editar). `abrirCrearCDT()` y `editarCDT()` lo llaman siempre al abrir, así que cancelar una edición no deja el sheet en modo edición |
| `abrirCobrarCDT(cajitaId, cdtId)` / `confirmarCobrarCDT()` | Cobrar con el valor real (ver §3, §7) |
| `liberarCDTManual(cajitaId, cdtId)` | Liberar antes de vencimiento sin pasar por el flujo de "cobrar" |
| `abrirMetaCajita(cajitaId)` / `guardarMetaCajita()` / `quitarMetaCajita()` | Configurar/quitar la meta de ahorro de una cajita |
| `calcMetaProgreso(cajita)` | % de avance y cuota sugerida de la meta |
| `poblarChequeoNu()` / `guardarChequeoNu()` | Sheet de corrección manual del saldo real de Nu (`guardarChequeoNu` es `async`: pide confirmación con `dialogo()` si un valor se aleja mucho de lo calculado) |
| `_interpretarLecturaChequeoNu(c, val)` | Dado lo que el usuario anotó, devuelve el saldo propio resultante y el valor calculado contra el que se comparó (resuelve el caso encargo adentro, ver §6). Única fuente de esa lógica |
| `calcularSerieTasaImplicitaNu()` / `verificarTasaNu()` | Serie de tasa implícita por chequeo y detección de desvío sostenido (ver §5). Umbrales en `_CFG_CHEQUEO_NU` |
| `_abrirConfirmarTasaNu(r)` / `confirmarCambioTasaNu()` / `corregirChequeoNu()` | Sheet `confirmar-tasa-nu`: aplicar la tasa sugerida (editable) o deshacer el chequeo con `_chequeoNuUndo` |
| `actualizarBotonesNu()` / `_motivoNuMovimiento(tipo)` / `_motivoNuChequeo()` | Estado de los botones de Nu (deshabilitados con su motivo en el título y un aviso en pantalla) y la comprobación que repite cada acción. Una sola fuente del "por qué no" |
| `abrirNuMovimiento(tipo)` / `confirmarNuMovimiento()` | "Agregar dinero" / "Retirar dinero" de una cajita (materializa intereses antes de mover) |
| `abrirChequeoNu()` | Abre el chequeo solo si alguna cajita es chequeable; si no, explica por qué |
| `cajitaGeneraIntereses(c)` / `cajitaChequeable(c)` / `cajitasChequeables()` (`nu-calc.js`) | Qué cajitas entran al chequeo |

### Código sin uso


Ninguno conocido. `toggleCDT()`, `toggleCajita()` y `_expandCajitaCDTs()` (restos de un diseño anterior de cajitas expandibles, sin ningún llamador) se borraron el 2026-10-05, junto con las 29 reglas de `styles.css` de ese diseño (`.cajita`, `.cajita-header*`, `.cajita-body`, `.cajita-chevron`, `.cajita-collapsed`/`-expanded`, `.cajita-toggle-btn`, `.cajita-top`, `.cajita-name`, `.cajita-grow`, `.cajita-fields`, `.cajita-cdt-*`); ver `CHANGELOG.md`. Se conservan `.cajita-val` (la lista de ocultar saldos la usa como selector), `.cajita-limit-msg`, `.cajita-meta-*` y `.cajita-row-hover`.
