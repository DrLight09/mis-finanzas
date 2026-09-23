# Módulo Spotify

Documentación de la sección **Spotify** de `mis-finanzas` (`js/modules/spotify.js`). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos guarda y por qué, cómo fluye la información, y qué decisiones de diseño se tomaron. Los detalles de implementación (funciones, ids) aparecen al final, como referencia rápida.

El historial de bugs corregidos vive en [`CHANGELOG.md`](./CHANGELOG.md#spotify), no acá.

---

## 1. Objetivo

Administra una suscripción compartida de Spotify donde el propietario de la cuenta (administrador) paga el plan y cobra a cada integrante su parte. No se limita a registrar quién pagó: administra todo el ciclo de cobro, mantiene sincronizados los movimientos financieros del resto de la app, y calcula automáticamente ganancias o pérdidas.

---

## 2. Conceptos importantes

El módulo maneja dos escalas de tiempo que no deben confundirse:

**Período de cobro (por integrante):** cada integrante tiene su propio período de **30 días exactos**, contados desde su último pago — no un mes de calendario. Cuando alguien paga, su próxima fecha de cobro se calcula sumando 30 días (o 30 × N si adelantó N períodos). La interfaz usa "período" en vez de "mes" en toda la UI relacionada.

**Ciclo (del módulo):** el intervalo entre dos pagos reales del administrador a Spotify. Como el administrador no paga apenas se cumplen los 30 días de cada integrante, sino según la facturación real del servicio, un ciclo normalmente dura un poco más de 30 días y no coincide con el período de ningún integrante en particular. Un mismo ciclo puede abarcar el período de varios integrantes, o más de un período de un mismo integrante.

**Período flotante:** cuando alguien paga varios períodos de una vez (ej. 2 × $5.100 = $10.200), solo el primero cuenta de inmediato en el ciclo en curso. Los siguientes están **flotantes**: es plata ya cobrada, pero todavía no pertenece a ningún ciclo, porque su fecha de inicio no ha llegado. Ver §7bis.

**Estado del integrante** (dentro de su período de cobro actual, dentro del ciclo en curso):
- **Pendiente** — todavía no cubrió el pago de su período actual.
- **Pagó** — ya realizó un pago válido para su período actual. No implica que todo el ciclo esté pagado, ya que un ciclo puede contener varios períodos.

---

## 3. Reglas que nunca deben romperse

- **Los botones no son la fuente de verdad.** El estado "Pagó" depende únicamente de los movimientos registrados en `spotifyHistorial`, nunca de un flag guardado aparte. Crear un pago puede hacer que alguien pase a "Pagó"; eliminarlo puede devolverlo a "Pendiente" — nunca al revés.
- **Una persona puede pagar varias veces dentro del mismo período de cobro** (ej. $5.000 + $5.000 + $10.000 para completar $30.000). El sistema nunca debe asumir que existe solo un pago por persona.
- **Cobrar varios períodos adelantados de una sola vez genera un único registro en `spotifyHistorial` por el monto total**, nunca uno por período. La plata realmente entró a la cuenta en un solo movimiento; fragmentarla en `N` registros de un período cada uno hace que el historial de la cuenta muestre `N` movimientos donde solo hubo uno. El detalle de cuántos períodos cubrió y a cómo cada uno queda en la nota del registro (`periodos` + `nota`), no en registros separados.
- **Vigencia con períodos adelantados:** el estado "Pagó" depende de si la próxima fecha de cobro sigue en el futuro, no de un booleano fijo. Alguien que adelantó varios períodos sigue en "Pagó" durante todos ellos, aunque en el medio el administrador pague a Spotify y arranque un ciclo nuevo. Solo vuelven a "Pendiente" quienes ya no tienen ningún período futuro cubierto. El badge "X períodos adelantados" sigue la misma regla: desaparece en cuanto el período vence, aunque el valor guardado no cambie hasta el próximo cobro.
- **Eliminar un pago solo revierte los efectos de ese pago específico.** Si Juan pagó dos veces y se borra el primero, el segundo sigue existiendo y Juan sigue en "Pagó" — el sistema siempre revisa si quedan pagos válidos antes de cambiar el estado.
- **Eliminar un pago a Spotify también restaura el estado "Pagó"/"Pendiente" que tenía cada integrante justo antes de ese pago**, no solo el dinero — nunca debe quedar todo el mundo en "Pendiente" sin poder deshacerlo.
- **Ningún movimiento secundario generado por Spotify** (el gasto del pago, el ingreso del cobro) **puede eliminarse directamente desde otra pantalla**; solo se elimina desde el historial de Spotify, borrando el movimiento principal. Si se elimina el principal, el secundario se elimina automáticamente con él — nunca deben quedar huérfanos.
- **Todos los indicadores se calculan desde exactamente la misma fuente** (`spotifyHistorial`). Nunca deben existir dos formas distintas de calcular la misma cifra, ni estados duplicados que puedan desincronizarse.
- **Las ganancias siempre están calculadas después de cubrir la cuota propia del administrador**; no se resta aparte. Pueden ser positivas, cero o negativas — la app nunca debe asumir que siempre hay ganancia.
- **Ningún indicador de cobertura de una cuenta específica (como la cajita) se usa para calcular la ganancia total.** Son preguntas distintas: liquidez de una cuenta puntual vs. ganancia real de todo el historial.
- **Registrar un cobro siempre exige elegir explícitamente un destino** (incluida la opción "Sin especificar"); nunca se asume un destino por defecto en silencio.
- **El destino de un cobro nunca puede ser una tarjeta de crédito** — mismo criterio que Encargos, "Yo debo", Mis deudas y Alcancía. Pagar el plan sí puede hacerse con TC, porque ahí es un gasto real del administrador.
- **No se puede agregar dos integrantes con el mismo nombre**, ni la misma persona del sistema unificado (`personaId`) dos veces.
- **Eliminar un integrante exige confirmación explícita y nunca borra su historial de cobros anteriores.**
- **Editar el nombre o la cuota de un integrante nunca modifica su próxima fecha de cobro**; solo un cambio real en la fecha de ingreso puede hacerlo, y ese cambio desplaza `proximoPago` la misma cantidad de días — nunca lo recalcula desde cero, para no perder períodos ya pagados por adelantado.
- **La cuota del administrador usada para la ganancia de un ciclo ya pagado se guarda en el momento de ese pago**, y no se recalcula con la cantidad de integrantes de hoy.
- **Una vez vinculado a una persona, ese vínculo no se puede cambiar desde Editar**; para reasignar el cupo hay que eliminar y agregar de nuevo. El nombre mostrado y guardado siempre se resuelve desde ese vínculo (`spNombreDe`), nunca desde una copia cruda que pueda desactualizarse.
- **Pagar de menos por un período no bloquea que ese período se cuente como cubierto.** El monto recibido puede editarse por debajo de lo esperado (períodos × cuota); si se marca explícitamente "quedó debiendo la diferencia", el registro de `spotifyHistorial` guarda esa deuda puntual (`pendiente`), pero `proximoPago` avanza igual — lo que queda pendiente es la plata, no el período. Si no se marca el toggle, el monto menor se registra tal cual, sin deuda.
- **Cada abono de `pendienteHistorial` es un movimiento visible por derecho propio, nunca un dato fundido en silencio dentro del cobro que lo originó.** Tiene su propia fecha, su propia cuenta destino (que puede ser distinta a la del cobro original) y su propio `id` — aparece como su propia línea en el historial de Spotify y como su propia tarjeta en el historial de la cuenta que le corresponde, protegida contra borrado directo igual que cualquier otro movimiento de Spotify (ver §6).
- **Un cobro de varios períodos no aporta todo su monto al ciclo donde entró la plata.** Solo el primer período cuenta ahí; cada período siguiente pertenece al ciclo que estaba abierto el día en que ESE período empieza (`proximoPagoAntes + 30·k`). Mientras no llegue esa fecha y no se haya pagado Spotify, es plata flotante y no suma a "Recaudado este ciclo".
- **La atribución de períodos a ciclos siempre se deriva del historial, nunca se guarda.** No existe ningún campo "este período es del ciclo X": borrar un cobro o un pago a Spotify reacomoda los períodos solos.
- **Empate (el período de una persona empieza el mismo día que se paga Spotify):** va al ciclo que se cierra, salvo que esa persona ya tenga 2 o más períodos cubiertos en él — entonces va al ciclo nuevo. El umbral es la constante `SP_EMPATE_PERIODOS`.
- **El ciclo de un cobro se decide por la fecha real, no por el orden en que se anotó.** Un pago a Spotify (o un cobro) puede registrarse días después de haber ocurrido; al anotar el pago, los cobros ya registrados se reparten entre el ciclo que cierra y el nuevo según su fecha (ver §7ter).
- **La plata de una persona que paga atrasado, después de que ya se cerró el ciclo que debía, pertenece a ese ciclo cerrado** y nunca infla "Recaudado este ciclo" del ciclo nuevo (ver §7ter).

---

## 4. Modelo de datos

```js
S.spotifyPersonas = [
  {
    id: "uid",
    nombre: "Juan",            // nombre crudo; si hay personaId, se resuelve via spNombreDe() en su lugar
    personaId: "uid|null",     // vínculo al sistema unificado de personas (S.personas)
    monto: 8000,               // cuota del integrante por período
    pagado: false,             // solo referencial — la fuente real de verdad son los movimientos (ver §3)
    proximoPago: "2026-08-05",
    fechaIngreso: "2026-01-05",
    ultimoDestino: "nequi",    // destino del último cobro; solo se muestra como badge junto al integrante
    ultimoDestinoSplit: false, // el último cobro se repartió entre varias cuentas
    mesesAdelantados: 1        // períodos que cubrió el último cobro
  }
]

S.spotifyCosto       // costo total del plan
S.spotifyCajitaId    // cajita asociada (opcional), solo para mostrar liquidez, no ganancia (ver §7)

S.spotifyHistorial = [
  // Un cobro de un integrante — SIEMPRE un solo registro por cobro, aunque cubra
  // varios períodos adelantados de una sola vez (ver §3). `monto` es el total
  // realmente movido a la cuenta destino, nunca la cuota de un solo período.
  {
    id: "uid", spId: "id del integrante", tipo: "cobro",
    nombre: "Juan",           // nombre ya resuelto al momento de registrar el cobro
    monto: 24000,             // total REALMENTE recibido hasta ahora (incluye abonos de pendienteHistorial, ver abajo)
    periodos: 3,              // cuántos períodos cubre este cobro (1 si fue un pago normal)
    fuente: "nequi", fecha: "2026-07-05",
    splits: [{ fuente: "nequi", monto: 14000 }, { fuente: "efectivo", monto: 10000 }],
                              // solo si el cobro se dividió entre varias cuentas (en ese caso `fuente` va vacío)
    nota: "3 períodos × 8.000 (pago adelantado)",  // detalle legible; vacío si periodos=1
    proximoPagoAntes: "...",  // snapshot para revertir la fecha de cobro al borrar; también es el inicio del período 1 (ver §7bis)
    _secundario: true, _origenSeccion: "Spotify",
    // Solo en los dos registros que nacen de un "pago atrasado" (ver §7ter):
    _pagoIdCierre: "id del pago a Spotify",  // el registro de cierre: plata que saldó deuda de un ciclo ya cerrado
    _periodoOffset: 1,        // en el registro "resto" que lo acompaña: períodos del pago que ya cubrió el de cierre
    // Campos opcionales de "pago parcial con deuda pendiente" (ej. el período
    // costaba 30.000 y solo te dio 20.000 — mismo concepto que Mesada, ver
    // mesada.md, "Pago parcial con deuda pendiente"):
    cuotaEsperada: 30000,     // snapshot de períodos × cuota cuando se marcó "quedó debiendo"
    pendiente: 10000,         // cuánto falta por recibir de ESTE cobro puntual (0/ausente = saldado)
    pendienteHistorial: [     // abonos posteriores que fueron cerrando `pendiente`. Cada uno es un
                              // movimiento propio (id + _secundario/_origenSeccion propios, igual que
                              // cualquier otro registro de spotifyHistorial) — no un dato suelto colgado
                              // del cobro, ver §5 y §6 para el porqué.
      { id: "uid", monto: 5000, fecha: "2026-07-20", destino: "efectivo", nota: "",
        _secundario: true, _origenSeccion: "Spotify" }
    ]
  },
  // Un pago del administrador a Spotify
  {
    id: "uid", tipo: "pago",
    monto: 30000, fuente: "cajita:xyz", fecha: "2026-07-05", nota: "",
    splits: [{ fuente: "...", monto: 0 }],  // solo si se pagó dividiendo entre varias cuentas
    _gastoVarId: "id del gasto vinculado en gastosVar",
    _tcMovId: "id del cargo en S.tcMovimientos",  // solo si se pagó con tarjeta de crédito
    _cuotaAdmin: 7500,        // cuota del admin en ESE momento, según integrantes de entonces (ver §7)
    _estadoAntes: [{ id: "id del integrante", pagado: true }],  // foto de quién estaba "Pagó" antes de resetear, para poder deshacer
    _pendienteAlCerrar: { "id del integrante": 8000 }  // lo que cada persona quedó debiendo al cerrar este ciclo (ver §7ter)
  }
]
```

---

## 5. Flujo

### Ciclo completo

```
Comienza un nuevo ciclo (justo después de un pago real a Spotify)
  ↓
Todos los integrantes aparecen como Pendiente
  ↓
Cada integrante paga su período → genera un registro tipo:'cobro'
  ↓
Estadísticas se recalculan en vivo desde spotifyHistorial
  ↓
Administrador paga a Spotify → genera un registro tipo:'pago', cierra el ciclo
  ↓
Se resetea a Pendiente solo quien ya no tiene período futuro cubierto
```

### Registrar un cobro

```
Elegir cuántos períodos pagó (1-6, cada uno = 30 días desde su fecha)
  ↓
Fecha del cobro (hoy por defecto; editable para anotarlo días después)
  ↓
Monto recibido (por defecto períodos × cuota)
  ↓
Elegir destino explícito: una cuenta (sin default, TC excluida, "Sin especificar"
  es válido) o dividido entre varias cuentas
  ↓
Confirmar
  ↓
Si la persona debía un período de un ciclo ya cerrado, esa parte se registra primero
  como "Pago atrasado del ciclo anterior" (ver §7ter)
  ↓
UN registro tipo:'cobro' con el monto (o lo que sobre tras el pago atrasado)
  (nota indica "N períodos × cuota" si N>1 — nunca N registros separados)
  ↓
Ingreso reflejado en la(s) cuenta(s) destino
  ↓
proximoPago avanza esa cantidad de períodos
```

### Registrar un pago a Spotify

```
Monto, fecha (hoy por defecto; puede ser anterior si se anota tarde) y de dónde sale:
  una cuenta, dividido entre varias cuentas, o tarjeta de crédito (cargo, no descuento)
  ↓
Se valida saldo o cupo antes de mover nada
  ↓
Se crea el gasto "Spotify Premium" vinculado (_gastoVarId)
  ↓
Se guarda una foto de quién estaba "Pagó" (_estadoAntes) y la cuota del admin (_cuotaAdmin)
  ↓
Los cobros ya anotados se reparten entre el ciclo que cierra y el nuevo según su fecha real (§7ter)
  ↓
Se congela lo que cada persona quedó debiendo al cerrar (_pendienteAlCerrar)
  ↓
Se resetea a Pendiente solo quien ya no tiene período futuro cubierto
  ↓
Comienza un ciclo nuevo
```

### Registrar un cobro con pago parcial (quedó debiendo)

```
Elegir cuántos períodos pagó → se calcula "lo esperado" (períodos × cuota)
  ↓
Editar "¿Cuánto te dio?" a un monto menor a lo esperado
  ↓
Aparece el toggle "Te está debiendo la diferencia" → marcarlo
  ↓
Elegir destino, confirmar
  ↓
UN registro tipo:'cobro' con el monto REALMENTE recibido,
guarda cuotaEsperada + pendiente (la diferencia) + pendienteHistorial: []
  ↓
proximoPago avanza igual que un cobro normal — el período queda cubierto,
lo pendiente es solo la plata
```

### Resolver un pendiente de un cobro

```
Desde el historial, "Registrar pago de lo pendiente" en el cobro con deuda
  ↓
Ingresar cuánto dio ahora (máximo: lo que quedó pendiente) + destino
  ↓
Confirmar
  ↓
Se suma esa plata a la cuenta elegida y se agrega a pendienteHistorial,
  con su propio id y _secundario/_origenSeccion (es un movimiento propio,
  no solo un dato colgado del cobro — ver §7)
  ↓
pendiente baja esa cantidad; monto del cobro sube esa misma cantidad
  ↓
Aparece como su propia línea en la tarjeta del cobro (Spotify) y como su
  propia tarjeta en el historial de la cuenta elegida (con su fecha real,
  no la del cobro original)
  ↓
Si pendiente llega a 0, el cobro queda saldado
```

### Deshacer un abono puntual (sin borrar el cobro completo)

```
Desde la línea del abono en el historial de Spotify, "deshacer"
  ↓
Confirmar
  ↓
Revertir la plata de la cuenta a la que fue ESE abono
  ↓
h.monto baja esa cantidad; h.pendiente sube esa misma cantidad (vuelve a deberse)
  ↓
Se quita esa entrada de pendienteHistorial — el resto de la historia del cobro
  (el monto original, otros abonos) queda intacta
```

### Eliminar un pago o cobro

```
deleteSpHistorial (único punto de entrada válido)
  ↓
Si es un pago: protección por antigüedad — los muy viejos se bloquean y los viejos
  piden una confirmación específica (ver docs/proteccion-antiguedad-movimientos.md)
  ↓
Cobro:
  revertir la plata de la(s) cuenta(s) destino y de cada abono de pendienteHistorial
  ↓
  si era un "pago atrasado" (_pagoIdCierre) → devolver esa plata al _pendienteAlCerrar de su pago
  ↓
  si era el cobro más reciente de esa persona → vuelve a Pendiente y proximoPago vuelve a
  proximoPagoAntes (salvo que quede otro registro del mismo lote)
Pago:
  devolver la plata a la cuenta (o marcar como eliminado el cargo a la TC y recalcular)
  ↓
  borrar el gasto "Spotify Premium" vinculado
  ↓
  restaurar el estado Pagó/Pendiente guardado en _estadoAntes
```

---

## 6. Casos especiales

- **Selector de personas compartido:** "Agregar integrante" y "Editar" usan el mismo componente que Encargos y Deudores, con el título adaptado ("¿Quién es?" en Spotify). Si el nombre buscado no existe, ofrece un botón de un toque para crear la persona directamente.
- **Nombres únicos** (sin distinguir mayúsculas): evita que el emparejamiento de cobros por nombre — usado como respaldo en registros antiguos sin `spId` — mezcle el historial de dos personas homónimas. Si son dos personas distintas de verdad, hay que diferenciarlas ("Juan" y "Juan (primo)").
- **Corregir la fecha de ingreso sin perder pagos adelantados:** si alguien ya tiene `proximoPago` bien adelantado por pagos previos, corregir `fechaIngreso` desplaza `proximoPago` la misma cantidad de días — nunca la recalcula como `fechaIngreso nueva + 30 días`, que borraría ese avance.
- **Integrante sin persona vinculada todavía** (registros creados antes de existir el sistema de personas): el campo "¿Quién es?" sigue siendo interactivo y permite vincularlo una única vez.
- **Cerrar el selector de personas sin confirmar:** el sistema avisa explícitamente que no se aplicó ningún cambio, en vez de guardar en silencio el valor anterior.
- **Renombrar una persona** desde la pantalla "Personas" también sincroniza el campo crudo (`nombre`) de los integrantes de Spotify vinculados a ella — igual que ya pasa en Deudores, Encargos y Mis deudas.
- **Un abono de `pendienteHistorial` puede ir a una cuenta distinta a la del cobro original.** Spotify no genera un movimiento espejo real en `S.movimientos` (a diferencia de Mesada) — el historial de cada cuenta se arma leyendo `S.spotifyHistorial` directamente (`getMovimientosCuenta()` / `_getMovimientosCuentaCustom()` en `cuentas.js`). Por eso cada abono necesita su propio `id`/`_secundario`/`_origenSeccion`: sin eso, quedaría invisible en la cuenta a la que realmente fue, o — peor — sería borrable directo desde ahí sin revertir `h.pendiente`/`h.monto`, desincronizando el saldo real del historial de Spotify. El monto que se muestra en la tarjeta del cobro original siempre resta lo que ya se movió a `pendienteHistorial`, para no contar la misma plata dos veces entre la tarjeta del cobro y la tarjeta de cada abono.

---

## 7. Cuota del administrador y ganancias

El administrador también es usuario del plan, así que el costo se reparte conceptualmente entre integrantes + administrador:

```
totalSlots = número de integrantes + 1
cuotaAdmin = costo / totalSlots   (redondeado)
```

Como el administrador no se cobra a sí mismo, `cuotaAdmin` no aparece como un cobro en el historial, pero es necesario para que la ganancia no aparezca negativa en ese valor cuando en realidad el balance está neutro. La cantidad de integrantes cambia con el tiempo, así que `cuotaAdmin` se calcula y guarda en el momento de cada pago real (`_cuotaAdmin`) — la ganancia de un ciclo ya cerrado sigue usando la cuota que aplicaba en esa época, no la de hoy.

**Antes del primer pago real ("Balance del ciclo"):**
```
Balance = Total recaudado en el ciclo actual − costo del plan
```
(`costo` ya incluye el cupo del administrador, así que este número ya está neto de esa parte.)

**Después de registrar al menos un pago real ("Ganancia acumulada"):**
```
Ganancia acumulada = Total cobrado histórico − Total pagado histórico + (cuotaAdmin × ciclos pagados)
```

Las ganancias pueden ser positivas, cero o negativas (pérdida = hubo que poner plata adicional del bolsillo del administrador, más allá de su propia cuota).

**La cajita no equivale a la ganancia:** no todos los cobros necesariamente entran en la cajita asociada — algunos van a Nequi, efectivo u otra cuenta. Por eso su saldo nunca se usa para calcular la ganancia total; solo muestra cobertura de liquidez de esa cuenta puntual ("Te sobra" / "Faltan" / "Sin saldo"). La ganancia real vive únicamente en "Balance del ciclo" / "Ganancia acumulada", calculada sobre todo `spotifyHistorial` sin importar a qué cuenta llegó cada peso.

---

## 7bis. Períodos prepagados y atribución a ciclos

El módulo maneja dos calendarios que no coinciden: los **ciclos** (los marca el administrador cada vez que paga a Spotify, la app no sabe cuándo se vence Spotify hasta que se registra ese pago) y los **períodos** de cada integrante (30 días desde su fecha de cobro). Un cobro de N períodos es un solo registro, pero cada período tiene su propia fecha de inicio.

Ejemplo real: Esteban debía el 21-sep y paga hoy (20-sep) 2 períodos = $10.200. Último pago a Spotify: 15-sep.

```
15-sep  pagas Spotify → empieza el ciclo actual
20-sep  Esteban paga $10.200
21-sep  empieza su período 1  → cuenta en el ciclo actual
21-oct  empieza su período 2  → flotante hasta que se resuelva
```

| Qué pasa primero | El período 2 cuenta en… |
|---|---|
| Llega el 21-oct sin haber pagado Spotify | el ciclo actual (ciclo largo, con 2 períodos de Esteban) |
| Pagas Spotify antes del 21-oct | el ciclo nuevo, de inmediato |
| Pagas Spotify el mismo 21-oct | el ciclo que se cierra; si Esteban ya tenía 2 períodos en él, el nuevo |

Hasta que se resuelve, "Recaudado este ciclo" no lo incluye y la pantalla lo muestra aparte ("+ $5.100 adelantado"). "Ganancia acumulada" y "Balance del ciclo" tampoco lo cuentan; "Total cobrado" sí (es plata real), con el adelantado indicado debajo.

La misma regla se aplica a "Pendiente por cobrar" cuando alguien no había pagado el período del día del cierre: con menos de 2 períodos cubiertos sigue siendo deuda del ciclo que cierra; con 2 o más, ya es del ciclo nuevo.

---

## 7ter. Fecha real y cobros atrasados

El módulo no sabe cuándo se vence Spotify: el administrador lo registra al pagar, y esa fecha es la frontera entre ciclos. Como el pago (o un cobro) se puede anotar días después de que ocurrió, el ciclo de cada cobro se decide por su **fecha real**, no por el orden en que se anotó.

**Al registrar un pago a Spotify con fecha F**, los cobros ya anotados desde el pago anterior se reparten así:

| Fecha del cobro | Pertenece al… |
|---|---|
| antes de F | ciclo que se cierra |
| después de F | ciclo nuevo (aunque se haya anotado antes que el pago) |
| igual a F | ciclo que se cierra, salvo que esa persona ya tenga 2 o más períodos cubiertos en él (`SP_EMPATE_PERIODOS`) — entonces, el nuevo |

**Deuda al cerrar.** Quien no está vigente cuando se paga Spotify (su próximo cobro ya llegó) queda debiendo, al ciclo que se cierra, los períodos vencidos a la fecha F × su cuota. Esa foto se guarda en el pago (`_pendienteAlCerrar`). El período que empieza justo en F cuenta como deuda del ciclo que cierra, salvo que la persona ya tenga 2 o más períodos cubiertos (mismo empate de arriba).

**Pago atrasado.** Cuando esa persona paga después, lo primero que cubre es esa deuda. Se registra como un cobro aparte ("Pago atrasado del ciclo anterior", con `_pagoIdCierre`) atribuido al ciclo ya cerrado: suma al cobrado y a la ganancia de ese ciclo, no a "Recaudado este ciclo" del ciclo nuevo, y descuenta el `_pendienteAlCerrar` del pago. Si sobra plata, esa parte es un cobro normal del ciclo en curso (con `_periodoOffset` para no repartir por períodos lo que ya cubrió el cobro de cierre). Si el pago referenciado ya no existe, el cobro cae al ciclo que esté acumulando.

---

## 8. Estadísticas de la sección

| Estadística | Cómo se calcula |
|---|---|
| **Recaudado este ciclo** | Suma de los **períodos** del ciclo abierto que ya empezaron (no del monto entero de cada cobro). Los períodos prepagados que todavía no empiezan se muestran aparte como adelantado (ver §7bis). Los pagos atrasados de un ciclo ya cerrado no cuentan aquí (ver §7ter). Se reinicia al pagar Spotify, salvo los períodos prepagados que ya pertenecen al ciclo nuevo. |
| **Pendiente por cobrar** | Para cada integrante no vigente: períodos vencidos a hoy × cuota, más lo que quedó debiendo en cobros parciales del ciclo (`pendiente`). Quienes siguen vigentes por prepago no suman por períodos. |
| **% recaudado** | Recaudado ÷ costo del plan, limitado visualmente a 100%. |
| **Saldo de la cajita** | Saldo real de la cajita asociada, con su estado de cobertura (ver §7). |
| **Promedio real por ciclo pagado / Margen proyectado** | Mutuamente excluyentes según exista o no un pago real: proyección teórica antes del primer pago (con la configuración actual, sin asumir una cadencia mensual real), o promedio real (incluyendo mejor/peor/último ciclo) una vez hay historial. |
| **Total cobrado** | Suma de todo el historial de cobros (plata real, incluye lo adelantado), nunca se reinicia. |
| **Balance del ciclo / Ganancia acumulada** | Ver §7. |

Registrar un pago a Spotify mueve "Balance del ciclo" hacia "Ganancia acumulada" y reinicia "Recaudado este ciclo" / "Pendiente por cobrar". Registrar un cobro sube "Recaudado este ciclo", "Total cobrado" y "% recaudado".

---

## 9. Impacto en patrimonio y proyección

El módulo no recibe tratamiento especial: un cobro sube el saldo real de la cuenta destino (el patrimonio sube en ese instante); un pago a Spotify baja el saldo de la cuenta usada. La "Ganancia" que muestra el módulo es solo una interpretación de esos mismos cambios de saldo, nunca dinero adicional o virtual. La proyección general de patrimonio a 3/6/12 meses se calcula a partir de la tendencia real de `S.patrimonioHistorial` (ver `proyeccion-financiera.md`), sin dar ningún peso especial a los movimientos de Spotify.

---

## 10. Decisiones de diseño

- **El botón nunca es la fuente de verdad, los movimientos sí** — evita que el estado visual se desincronice de la plata realmente movida (ver §3).
- **Nombre resuelto vía `spNombreDe`, nunca leído crudo:** cuando un integrante está vinculado a una persona, su nombre real vive en `S.personas`, no en el campo `nombre` del propio registro (que puede quedar desactualizado, ej. si se corrige una falta de ortografía desde "Personas"). Un cobro nuevo guarda el nombre ya resuelto en ese momento; los cobros pasados conservan el nombre tal como estaba cuando se registraron, igual que cualquier dato de un historial financiero.
- **Vínculo a persona fijo una vez establecido:** permitir reemplazar directamente la persona vinculada era una fuente recurrente de inconsistencias (nombre desincronizado, dos integrantes apuntando a la misma persona). Bloquearlo elimina esa clase de problemas de raíz, a cambio de un flujo (eliminar y volver a agregar) que de todas formas ya se usa cuando alguien deja el plan y otra persona ocupa su lugar.
- **Eliminar un integrante no borra su historial:** el historial financiero nunca se pierde (ver §3); quitar a alguien de la lista activa es una acción distinta a borrar la plata que ya se le cobró.
- **Un cobro de varios períodos es un solo registro, no uno por período:** la plata entró a la cuenta en un solo movimiento, así que el historial de la cuenta debe mostrar uno solo (3 períodos de $5.000 = un ingreso de $15.000, no tres de $5.000). El detalle de cuántos períodos cubrió queda en `periodos` y en la nota. Además, las estadísticas que cuentan cobros (ej. "mayor cobro" en la ficha de la persona) reflejan pagos reales, no fragmentos.
- **Los períodos prepagados se reparten entre ciclos por cálculo, no partiendo el registro:** se evaluó dividir el cobro de varios períodos en un registro por período al pagar Spotify, pero eso habría obligado a mantener sincronizados varios registros con una sola entrada de plata (movimiento en la cuenta, `proximoPagoAntes` compartido, borrado). Derivarlo del historial (`spAsignarPeriodos`) mantiene un solo registro y hace que eliminar un cobro o un pago a Spotify se reacomode solo.
- **Empate: 2 períodos, no 1.** Cuando un período empieza el mismo día que se paga Spotify, esa plata financia el pago que cierra el ciclo, salvo que la persona ya haya aportado 2 períodos a ese ciclo. La regla vive en una sola constante (`SP_EMPATE_PERIODOS`) y la usan por igual los períodos prepagados, los cobros registrados el mismo día del pago y la deuda al cierre.

---

## 11. Referencia de implementación

**Ubicación:** el módulo vive en un único archivo, [`js/modules/spotify.js`](../js/modules/spotify.js) — funciones base (personas del plan, cobros, pago, ganancia) junto con la integración con el sistema unificado de Personas (`openSheet`, `addSpotify`, `editarSpotify`, `guardarEditarSpotify`, `renderSpotify`, selector de personas).

Es un grupo lazy (`Loader.GROUPS.spotify` en `js/core/lazy-loader.js`): no tiene `<script>` propio en `index.html`. Depende de `js/core/events.js` y de los globals del núcleo (`S`, `save`, `escHtml`, `toast`, `dialogo`, etc., definidos en `js/core/`). Dos helpers que el módulo usa viven en `js/core/calc-helpers.js` porque Inicio los necesita en el primer render: `spNombreDe` y `spPersonaPagadaVigente`.

**Spotify no genera movimiento espejo propio en `S.movimientos`** (a diferencia de Mesada, que sí tiene `_registrarMovSecundarioMesada`). El historial de cada cuenta se arma directamente desde `S.spotifyHistorial` en dos funciones de `cuentas.js`: `getMovimientosCuenta()` (Nequi/Efectivo/cajitas) y `_getMovimientosCuentaCustom()` (cuentas personalizadas). Esto es relevante para cualquier cambio futuro al modelo de datos de `spotifyHistorial` — cualquier campo nuevo que deba verse en el historial de una cuenta tiene que sintetizarse ahí, no alcanza con guardarlo en `spotifyHistorial`.

### Funciones clave

| Función | Qué hace |
|---|---|
| `renderSpotify()` | Pinta toda la pantalla: lista de integrantes, estadísticas, banner de vencidos |
| `spNombreDe(integrante)` | Resuelve el nombre mostrado: usa la persona vinculada si existe, si no cae al campo crudo (en `js/core/calc-helpers.js`) |
| `spPersonaPagadaVigente(integrante)` | ¿Su próximo cobro sigue en el futuro? Es lo que decide "Pagó" (en `js/core/calc-helpers.js`) |
| `confirmarSpDestino()` | Registra un cobro: valida, mueve la plata, avanza `proximoPago`, crea el registro (y el de "pago atrasado" si corresponde) |
| `confirmarPagarSpotify()` | Registra el pago a Spotify: mueve la plata, crea el gasto, reparte los cobros entre ciclos y congela `_pendienteAlCerrar` |
| `renderSpStats()` | Estadísticas de la sección (ganancia, promedio por ciclo, total cobrado) |
| `deleteSpHistorial(id)` | Único punto válido para borrar un cobro o un pago; revierte plata, movimiento secundario y estado |
| `resolverPendienteSpHistorial(i)` | Abre el sheet para registrar un abono contra la deuda puntual (`pendiente`) de un cobro específico |
| `confirmarSpResolverPendiente()` | Aplica el abono: suma la plata al destino elegido y lo agrega a `pendienteHistorial` como movimiento propio (`id`, `_secundario`, `_origenSeccion`), reduce `pendiente` |
| `deshacerAbonoPendienteSp(i, abIdx)` | Revierte un abono puntual (plata + `pendiente` + `pendienteHistorial`) sin borrar el resto del cobro |
| `spTramosDeCobro(h)` | Divide un cobro en sus períodos (fecha de inicio y monto de cada uno). Registros viejos sin `periodos`/`proximoPagoAntes` son un solo tramo que nunca flota |
| `spAsignarPeriodos(hist)` | Asigna cada período de cada cobro a un ciclo (por posición el primero, por fecha de inicio los demás, con la regla del empate) y marca los flotantes |
| `spResumenCicloActual()` | `{recaudado, flotante}` del ciclo abierto; alimenta "Recaudado este ciclo" y el adelantado |
| `spMontoAntesDe(h, fecha)` | Plata de un cobro que ya cubría períodos anteriores a `fecha`; usada en el desempate al pagar Spotify |
| `spPeriodosVencidos(p, corte, estricto)` | Períodos vencidos de un integrante; con `estricto` no cuenta el que empieza justo el día de corte |

### Eventos (`data-action`)

Los botones/badges de la pantalla ya no usan `onclick` inline — usan `data-action` despachado por `Events` (`js/core/events.js`). Si se necesita ubicar qué función corre un botón, esta tabla es la fuente de verdad (junto con los bloques `Events.registerAll('spotify', …)` de `spotify.js`):

| `data-action` | Función registrada |
|---|---|
| `spotify:abrirSheetAgregar` | Abre el sheet de agregar integrante |
| `spotify:marcarPago` | `marcarPagoSpotify` |
| `spotify:editar` | `editarSpotify` |
| `spotify:eliminar` | `deleteSpotify` |
| `spotify:eliminarHistorial` | `deleteSpHistorial` |
| `spotify:resolverPendiente` | `resolverPendienteSpHistorial` |
| `spotify:deshacerAbonoPendiente` | `deshacerAbonoPendienteSp` |
| `spotify:abrirSelectorPersona` | Abre el selector de personas unificado (`abrirSelPersona`) |
| `spotify:onClickEditPersonaBtn` | `_onClickSpEditPersonaBtn` |

Todas se registran en `spotify.js`: las de funciones base en el bloque "REGISTRO DE EVENTOS" y las dos del selector de personas junto a su integración.

### Protección contra borrado directo

El gasto "Spotify Premium" y cada "Cobro Spotify (persona)" quedan marcados `_secundario: true, _origenSeccion: 'Spotify'`. En la vista de movimientos de cuentas y en Gastos aparecen con la etiqueta "Automático" y el ícono de eliminar bloqueado; si se intenta borrar igual, se avisa que debe hacerse desde Spotify.

Cada abono de `pendienteHistorial` tiene la misma protección de forma independiente: `eliminarMovimiento()` (`js/core/movimientos.js`) busca su `_secundario` no solo en `S.spotifyHistorial` sino también dentro de `pendienteHistorial` de cada registro. Intentar borrar la tarjeta sintética de un abono desde el historial de una cuenta redirige a Spotify igual que el cobro original — desde ahí, `deshacerAbonoPendienteSp()` revierte ese abono puntual sin tocar el resto del cobro (equivalente al `deshacerPendienteMesada` de Mesada).
