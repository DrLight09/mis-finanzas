# Módulo Spotify

Documentación de la sección **Spotify** de `mis-finanzas` (`index.html`). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos guarda y por qué, cómo fluye la información, y qué decisiones de diseño se tomaron. Los detalles de implementación (funciones, ids) aparecen al final, como referencia rápida.

El historial de bugs corregidos vive en [`CHANGELOG.md`](./CHANGELOG.md#spotify), no acá.

---

## 1. Objetivo

Administra una suscripción compartida de Spotify donde el propietario de la cuenta (administrador) paga el plan y cobra a cada integrante su parte. No se limita a registrar quién pagó: administra todo el ciclo de cobro, mantiene sincronizados los movimientos financieros del resto de la app, y calcula automáticamente ganancias o pérdidas.

---

## 2. Conceptos importantes

El módulo maneja dos escalas de tiempo que no deben confundirse:

**Período de cobro (por integrante):** cada integrante tiene su propio período de **30 días exactos**, contados desde su último pago — no un mes de calendario. Cuando alguien paga, su próxima fecha de cobro se calcula sumando 30 días (o 30 × N si adelantó N períodos). La interfaz usa "período" en vez de "mes" en toda la UI relacionada.

**Ciclo (del módulo):** el intervalo entre dos pagos reales del administrador a Spotify. Como el administrador no paga apenas se cumplen los 30 días de cada integrante, sino según la facturación real del servicio, un ciclo normalmente dura un poco más de 30 días y no coincide con el período de ningún integrante en particular. Un mismo ciclo puede abarcar el período de varios integrantes, o más de un período de un mismo integrante.

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

---

## 4. Modelo de datos

```js
S.spotifyPersonas = [
  {
    id: "uid",
    nombre: "Juan",          // nombre crudo; si hay personaId, se resuelve via spNombreDe() en su lugar
    personaId: "uid|null",   // vínculo al sistema unificado de personas (S.personas)
    monto: 8000,             // cuota del integrante por período
    pagado: false,           // solo referencial — la fuente real de verdad son los movimientos (ver §3)
    proximoPago: "2026-08-05",
    fechaIngreso: "2026-01-05",
    ultimoDestino: "nequi",
    mesesAdelantados: 1
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
    monto: 24000,             // total cobrado (3 períodos × 8000, en este ejemplo)
    periodos: 3,              // cuántos períodos cubre este cobro (1 si fue un pago normal)
    fuente: "nequi", fecha: "2026-07-05",
    nota: "3 períodos × 8.000 (pago adelantado)",  // detalle legible; vacío si periodos=1
    proximoPagoAntes: "...",  // snapshot para poder revertir la fecha de cobro al borrar
    _secundario: true, _origenSeccion: "Spotify"
  },
  // Un pago del administrador a Spotify
  {
    id: "uid", tipo: "pago",
    monto: 30000, fuente: "cajita:xyz", fecha: "2026-07-05", nota: "",
    _gastoVarId: "id del gasto vinculado en gastosVar",
    _cuotaAdmin: 7500,        // cuota del admin en ESE momento, según integrantes de entonces (ver §7)
    _estadoAntes: {...}       // foto de quién estaba "Pagó" antes de resetear, para poder deshacer
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
Elegir destino explícito (sin default, TC excluida)
  ↓
Confirmar
  ↓
UN registro tipo:'cobro' en spotifyHistorial, con el monto TOTAL
  (nota indica "N períodos × cuota" si N>1 — nunca N registros separados)
  ↓
Ingreso reflejado en la cuenta destino (un solo movimiento)
  ↓
proximoPago avanza esa cantidad de períodos
```

### Registrar un pago a Spotify

```
Administrador paga el plan completo
  ↓
Se guarda una foto de quién estaba "Pagó" antes de resetear (_estadoAntes)
  ↓
Se calcula y guarda _cuotaAdmin según integrantes actuales
  ↓
Se resetea a Pendiente solo quien ya no tiene período futuro cubierto
  ↓
Se crea el gasto "Spotify Premium" vinculado (_gastoVarId)
  ↓
Comienza un ciclo nuevo
```

### Eliminar un pago o cobro

```
deleteSpHistorial (único punto de entrada válido)
  ↓
Revertir la plata movida
  ↓
Borrar el movimiento secundario vinculado (gasto o ingreso en la cuenta)
  ↓
Si era un pago a Spotify → restaurar el estado Pagó/Pendiente guardado en _estadoAntes
  ↓
Si era un cobro → restaurar proximoPago al valor guardado en proximoPagoAntes
```

---

## 6. Casos especiales

- **Selector de personas compartido:** "Agregar integrante" y "Editar" usan el mismo componente que Encargos y Deudores, con el título adaptado ("¿Quién es?" en Spotify). Si el nombre buscado no existe, ofrece un botón de un toque para crear la persona directamente.
- **Nombres únicos** (sin distinguir mayúsculas): evita que el emparejamiento de cobros por nombre — usado como respaldo en registros antiguos sin `spId` — mezcle el historial de dos personas homónimas. Si son dos personas distintas de verdad, hay que diferenciarlas ("Juan" y "Juan (primo)").
- **Corregir la fecha de ingreso sin perder pagos adelantados:** si alguien ya tiene `proximoPago` bien adelantado por pagos previos, corregir `fechaIngreso` desplaza `proximoPago` la misma cantidad de días — nunca la recalcula como `fechaIngreso nueva + 30 días`, que borraría ese avance.
- **Integrante sin persona vinculada todavía** (registros creados antes de existir el sistema de personas): el campo "¿Quién es?" sigue siendo interactivo y permite vincularlo una única vez.
- **Cerrar el selector de personas sin confirmar:** el sistema avisa explícitamente que no se aplicó ningún cambio, en vez de guardar en silencio el valor anterior.
- **Renombrar una persona** desde la pantalla "Personas" también sincroniza el campo crudo (`nombre`) de los integrantes de Spotify vinculados a ella — igual que ya pasa en Deudores, Encargos y Mis deudas.

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

## 8. Estadísticas de la sección

| Estadística | Cómo se calcula |
|---|---|
| **Recaudado este ciclo** | Suma de cobros posteriores al último pago real. Se reinicia a $0 al pagar Spotify. |
| **Pendiente por cobrar** | Para cada integrante no vigente: `max(0, cuota del período − lo ya pagado en este ciclo)`, sumado. Quienes siguen vigentes por prepago no suman nada. |
| **% recaudado** | Recaudado ÷ costo del plan, limitado visualmente a 100%. |
| **Saldo de la cajita** | Saldo real de la cajita asociada, con su estado de cobertura (ver §7). |
| **Promedio real por ciclo pagado / Margen proyectado** | Mutuamente excluyentes según exista o no un pago real: proyección teórica antes del primer pago (con la configuración actual, sin asumir una cadencia mensual real), o promedio real (incluyendo mejor/peor/último ciclo) una vez hay historial. |
| **Total cobrado** | Suma de todo el historial de cobros, nunca se reinicia. |
| **Balance del ciclo / Ganancia acumulada** | Ver §7. |

Registrar un pago a Spotify mueve "Balance del ciclo" hacia "Ganancia acumulada" y reinicia "Recaudado este ciclo" / "Pendiente por cobrar". Registrar un cobro sube "Recaudado este ciclo", "Total cobrado" y "% recaudado".

---

## 9. Impacto en patrimonio y proyección

El módulo no recibe tratamiento especial: un cobro sube el saldo real de la cuenta destino (el patrimonio sube en ese instante); un pago a Spotify baja el saldo de la cuenta usada. La "Ganancia" que muestra el módulo es solo una interpretación de esos mismos cambios de saldo, nunca dinero adicional o virtual. La proyección general de patrimonio a 3/6/12 meses se calcula a partir del crecimiento real del historial de patrimonio de los últimos 90 días, sin dar ningún peso especial a los movimientos de Spotify.

---

## 10. Decisiones de diseño

- **El botón nunca es la fuente de verdad, los movimientos sí** — evita que el estado visual se desincronice de la plata realmente movida (ver §3).
- **Nombre resuelto vía `spNombreDe`, nunca leído crudo:** cuando un integrante está vinculado a una persona, su nombre real vive en `S.personas`, no en el campo `nombre` del propio registro (que puede quedar desactualizado, ej. si se corrige una falta de ortografía desde "Personas"). Un cobro nuevo guarda el nombre ya resuelto en ese momento; los cobros pasados conservan el nombre tal como estaba cuando se registraron, igual que cualquier dato de un historial financiero.
- **Vínculo a persona fijo una vez establecido:** permitir reemplazar directamente la persona vinculada era una fuente recurrente de inconsistencias (nombre desincronizado, dos integrantes apuntando a la misma persona). Bloquearlo elimina esa clase de problemas de raíz, a cambio de un flujo (eliminar y volver a agregar) que de todas formas ya se usa cuando alguien deja el plan y otra persona ocupa su lugar.
- **Eliminar un integrante no borra su historial:** el historial financiero nunca se pierde (ver §3); quitar a alguien de la lista activa es una acción distinta a borrar la plata que ya se le cobró.
- **Un cobro de varios períodos es un solo registro, no uno por período:** la versión original creaba un registro (y por lo tanto un movimiento visible en la cuenta) por cada período adelantado, aunque la plata hubiera entrado de una sola vez — si alguien pagaba 3 períodos de $5.000, el historial de la cuenta mostraba 3 movimientos de $5.000 en vez de uno de $15.000. Se consolidó a un único registro con el monto total y una nota (`"3 períodos × 5.000 (pago adelantado)"`) que conserva el detalle sin fragmentar el movimiento. Como efecto secundario, esto también simplifica `deleteSpHistorial`: cada registro ya tiene su propio `proximoPagoAntes` sin "hermanos" que buscar, y las estadísticas que dependían de contar cobros (ej. "mayor cobro" en la ficha de la persona) pasan a reflejar pagos reales en vez de fragmentos.

---

## 11. Referencia de implementación

**Ubicación:** el módulo quedó en **dos archivos**, no uno — descubierto durante la migración, no una decisión de diseño de entrada (ver `CHANGELOG.md#infraestructura--seguridad` para el detalle del porqué):

- [`js/modules/spotify.js`](../js/modules/spotify.js) — funciones base (personas del plan, cobros, pago, ganancia). Se carga *temprano* en `index.html`, porque un par de wirings de botones de otros módulos las referencian de forma inmediata más adelante en el documento.
- [`js/modules/spotify-personas.js`](../js/modules/spotify-personas.js) — la integración con el sistema unificado de Personas (envuelve `openSheet`, `addSpotify`, `editarSpotify`, `guardarEditarSpotify` y `renderSpotify` del archivo anterior). Se carga *mucho más tarde* en `index.html`, porque necesita que `openSheet()` y el sistema de Personas ya estén definidos.

Los dos dependen de `js/core/events.js` (debe cargarse antes que cualquiera de los dos) y de los helpers globales del núcleo de la app (`S`, `save`, `escHtml`, `toast`, `dialogo`, etc., que todavía viven en `index.html` — ver `auditoria-tecnica.md` punto 3). **Si alguna vez alguien mueve alguno de estos dos `<script src>` de lugar en `index.html`, revisar primero el comentario al principio de cada archivo** — el orden no es cosmético, es una dependencia real.

### Funciones clave

| Función | Qué hace |
|---|---|
| `renderSpotify()` | Pinta toda la pantalla: lista de integrantes, estadísticas, banner de vencidos |
| `spNombreDe(integrante)` | Resuelve el nombre mostrado: usa la persona vinculada si existe, si no cae al campo crudo |
| `deleteSpHistorial(id)` | Único punto válido para borrar un cobro o un pago; revierte plata, movimiento secundario y estado |

### Eventos (`data-action`)

Los botones/badges de la pantalla ya no usan `onclick` inline — usan `data-action` despachado por `Events` (`js/core/events.js`). Si se necesita ubicar qué función corre un botón, esta tabla es la fuente de verdad (junto con el bloque "REGISTRO DE EVENTOS" al final de `spotify.js`):

| `data-action` | Función registrada |
|---|---|
| `spotify:abrirSheetAgregar` | Abre el sheet de agregar integrante |
| `spotify:marcarPago` | `marcarPagoSpotify` |
| `spotify:editar` | `editarSpotify` |
| `spotify:eliminar` | `deleteSpotify` |
| `spotify:eliminarHistorial` | `deleteSpHistorial` |
| `spotify:abrirSelectorPersona` | Abre el selector de personas unificado (`abrirSelPersona`) |
| `spotify:onClickEditPersonaBtn` | `_onClickSpEditPersonaBtn` |

Las primeras 5 filas se registran en `spotify.js`; las últimas 2 (selector de personas) en `spotify-personas.js`.

### Protección contra borrado directo

El gasto "Spotify Premium" y cada "Cobro Spotify (persona)" quedan marcados `_secundario: true, _origenSeccion: 'Spotify'`. En la vista de movimientos de cuentas y en Gastos aparecen con la etiqueta "Automático" y el ícono de eliminar bloqueado; si se intenta borrar igual, se avisa que debe hacerse desde Spotify.
