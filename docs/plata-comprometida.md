# Plata Comprometida

Documentación de la sección **Plata Comprometida** de `mis-finanzas` (`index.html` → `js/modules/plata_comprometida.js`). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos guarda y por qué, cómo fluye la información, y qué decisiones de diseño se tomaron. Los detalles de implementación (funciones, ids de sheets) aparecen al final, como referencia rápida — no como el foco del documento.

El historial de bugs corregidos vive en [`CHANGELOG.md`](./CHANGELOG.md#plata-comprometida), no acá.

---

## 1. Objetivo

Registra dinero que **todavía no llegó** pero que ya se sabe que va a entrar (un reembolso, un pago pendiente, plata que alguien va a devolver) y para qué parte de esa plata ya hay un plan — para que el patrimonio actual no cuente esa plata como libre antes de tiempo, y para no perder de vista compromisos que dependen de un ingreso que aún no pasó.

## 2. Conceptos importantes

- **Ingreso comprometido:** el registro central del módulo — una entrada de plata futura con descripción, monto total, fecha estimada de llegada y una cuenta destino por defecto. Mientras no se marca como recibido, no mueve ningún saldo real (salvo los adelantos, ver más abajo).
- **Destino:** una porción planificada del ingreso, con un propósito específico. Cada ingreso puede tener cero o varios destinos, y siempre puede quedar una parte sin asignar. Los 4 tipos posibles:
  - **Reposición** — repone una cajita/cuenta de la que ya se sacó (o se va a sacar) esa plata.
  - **Gasto pendiente** — cubre un gasto propio, ya sea guardando la plata en una cajita hasta la fecha de pago, o cargándolo a una tarjeta de crédito como un "favor" (ver más abajo).
  - **Abono a deuda pendiente** — parte del ingreso es en realidad el abono de alguien que te debe plata (`S.deudores`), y se registra ahí directamente.
  - **Otro** — sin efecto en saldos, solo para llevar la cuenta de que esa porción tiene un propósito ya decidido.
- **Sobrante / "le sobra":** lo que queda del monto total después de sumar todos los destinos. Es la única parte del ingreso que se convierte en **ingreso libre real** al recibirse — todo lo demás ya tenía un destino planeado, no es ganancia nueva.
- **Adelanto (`yaSaque`, solo en Reposición):** decisión explícita de que la plata ya salió de la cuenta *antes* de que llegue el ingreso que la va a reponer (ej. "ya saqué 50mil de la cajita para cubrir esto, cuando llegue el reembolso se repone"). Descuenta la cuenta en el momento de marcarlo, no cuando llega el ingreso.
- **Ya pagado (`yaPague`, en Gasto y Otro):** igual que el adelanto pero para gastos — indica que el gasto ya se cubrió (con plata de una cajita ya guardada, o cargado a una TC) antes de que el ingreso llegue formalmente.
- **Favor (gasto con TC):** cuando un destino tipo Gasto se cubre cargándolo a una tarjeta de crédito, esa deuda se marca `_esFavor`/`_desdeCP` — es deuda que vas a cubrir con la plata de este ingreso, no deuda propia real. El resto de la app (`calcDeudaTcPropia()`) la excluye de "cuánto debo realmente" — ver `analisis-financiero.md`/`salud-financiera.md`.
- **Recibido:** el momento en que el ingreso deja de ser una promesa y se convierte en movimientos reales — cada destino ejecuta su efecto (reponer, pagar, abonar) y el sobrante entra como ingreso libre a la cuenta que se elija en ese momento.

## 3. Reglas que nunca deben romperse

- **Mientras un ingreso no está "recibido", no es patrimonio disponible.** Ni el monto total ni ningún destino cuentan como plata libre hasta que el usuario confirma explícitamente que llegó.
- **La plata ajena que ya llegó pero todavía no se pagó sí se resta del patrimonio**, aunque esté físicamente en una cuenta propia (`_saldoCPAjeno()`, en `core-state.js`) — no es tuya solo porque esté de paso en tu cajita.
- **Marcar un adelanto o un pago como hecho es siempre una decisión explícita del usuario** (`yaSaque`/`yaPague`), nunca se infiere automáticamente por fecha o por monto — mismo principio que ya usa Mesada para "quedó debiendo".
- **Un adelanto nunca se cuenta dos veces.** Si se marcó `yaSaque`, la cuenta ya se descontó en ese momento; al recibirse el ingreso, esa misma cuenta se vuelve a acreditar el mismo monto — el neto a través del tiempo es cero, la plata solo estuvo "prestada" de la propia cuenta mientras se esperaba el ingreso real.
- **Un gasto cargado a tarjeta de crédito por este módulo nunca aparece como deuda propia** en los cálculos de salud financiera o análisis — es un favor cubierto por el ingreso que se está esperando, no una compra propia.
- **Las tarjetas de crédito nunca son destino del dinero que llega.** El ingreso siempre aterriza en una cajita, Nequi, efectivo o cuenta personalizada — una TC solo puede recibir una *compra* (aumento de deuda) como forma de representar un gasto ya cubierto por este ingreso, nunca un depósito.
- **Eliminar un ingreso siempre revierte exactamente lo que ese ingreso generó** — ni más ni menos —, sin importar si ya se recibió, si solo tiene adelantos sueltos, o si no generó ningún movimiento todavía.

## 4. Modelo de datos

Todo vive en `S.plataCometida[]`:

```js
{
  id: 'uuid',
  desc: 'Reembolso de la universidad',
  montoTotal: 500000,
  fechaLlegada: '2026-08-15',   // estimada
  cuentaDestino: 'cajita:xxx',  // a dónde va el sobrante por defecto
  recibido: false,
  creadoEn: '2026-07-20',
  fechaRecibido: '2026-08-16',  // solo existe si recibido:true

  destinos: [
    {
      id: 'uuid',
      tipo: 'reposicion',        // 'reposicion' | 'gasto' | 'abono_deuda' | 'otro'
      desc: 'Plata que ya saqué de la cajita',
      monto: 200000,

      // Solo si tipo === 'reposicion':
      cuentaId: 'cajita:yyy',    // si no está, usa cuentaDestino del ingreso
      yaSaque: true,             // ya se descontó esta cuenta antes de recibir

      // Solo si tipo === 'abono_deuda':
      personaId: 'uuid-deudor',  // referencia directa a S.deudores

      // Solo si tipo === 'gasto':
      gastoOrigen: 'cajita',     // 'cajita' | 'tc'
      gastoCajita: 'cajita:zzz', // si origen='cajita': dónde se guarda/guardó la plata
      fechaPago: '2026-08-01',   // solo si origen='cajita' y aún no se pagó
      gastoTcId: 'uuid-tc',      // si origen='tc': qué tarjeta se carga
      gastoTcCajita: 'cajita:w', // si origen='tc': a qué cajita va la plata del ingreso
      _tcCompraId: 'uuid',       // vínculo con la compra real ya cargada a la TC

      // En 'gasto' y 'otro':
      yaPague: false,            // ya se cubrió este gasto antes de recibir el ingreso
    }
  ]
}
```

**Por qué `cuentaId`/`gastoCajita`/`gastoTcCajita` son campos separados en vez de uno solo:** cada tipo de destino necesita una cuenta con un rol distinto (dónde se repone, dónde se guarda un gasto pendiente, a dónde va la plata que cubre una TC) — nunca son intercambiables entre sí, así que unificarlos en un solo campo hubiera obligado a inferir el rol por el tipo en vez de leerlo directo.

**`_tcCompraId` solo existe una vez que el gasto realmente se cargó a la tarjeta** (al marcar `yaPague` — sea al crear el destino o después, desde "Marcar pagos" — o al recibir el ingreso, lo que pase primero) — permite encontrar y revertir esa compra puntual sin ambigüedad si se desmarca o se elimina el ingreso completo.

## 5. Flujo

### Registrar un ingreso comprometido

```
Descripción + monto total + fecha estimada + cuenta destino por defecto
  ↓
(Opcional) agregar uno o más destinos: elegir tipo, describir, monto
  — la suma de destinos no puede superar el monto total
  ↓
Guardar → S.plataCometida, recibido:false
```

### Adelantar o marcar un gasto como ya cubierto (antes de recibir)

```
Sheet "Marcar pagos" sobre un ingreso existente
  ↓
Por cada destino Reposición → togglear "ya la saqué" / Gasto u Otro → "ya lo pagué"
  ↓
Al pasar de No→Sí:
  Reposición  → descuenta la cuenta ahora mismo (se repone recién al recibir)
  Gasto/cajita → descuenta la cajita ahora (la plata ya estaba guardada ahí desde un recibo previo)
  Gasto/TC     → carga la compra a la tarjeta ahora (como favor)
  ↓
Al pasar de Sí→No: se revierte exactamente el efecto anterior
```

### Recibir el ingreso

```
"¡Llegó!" sobre un ingreso pendiente
  ↓
Por cada destino:
  Reposición   → suma la cuenta (haya o no haya adelanto — ver regla de "nunca dos veces")
  Abono deuda  → registra el abono directo en S.deudores
  Gasto/cajita → suma la cajita elegida (si no se había marcado yaPague antes)
  Gasto/TC     → carga la compra a la TC como favor + lleva la plata a la cajita elegida
  Otro         → sin efecto
  ↓
Sobrante (monto total − suma de destinos) → entra como ingreso libre real
  a la cuenta que se elija en este paso (por defecto, la cuenta destino del ingreso)
  ↓
Marcar recibido:true, fechaRecibido = hoy
```

### Eliminar un ingreso

```
Calcular qué hay que revertir según el estado:
  Ya recibido        → revertir TODOS los movimientos y compras de TC generados al recibir
  No recibido, con
  adelantos/TC marcada → revertir solo esos adelantos puntuales
  No recibido, sin
  ningún efecto        → borrar sin más
  ↓
Si corresponde, chequear antigüedad de los movimientos afectados
  (puede bloquear o solo advertir, según qué tan viejo y qué tan
  intervenidas están las cuentas involucradas desde entonces)
  ↓
Confirmar → revertir → sacar el ingreso de S.plataCometida
```

## 6. Casos especiales

- **Reposición adelantada vs. no adelantada, al recibir:** en los dos casos la cuenta termina sumando el mismo monto — la única diferencia es el texto del movimiento generado ("Reposición" vs. "Reposición (adelantada)"). El adelanto ya había descontado la cuenta por separado, así que el efecto neto a través del tiempo es el mismo, solo cambia cuándo se sintió la baja de saldo.
- **Gasto sin origen definido** (ni cajita ni TC elegidos): el destino queda como puro registro informativo, sin ningún efecto en saldos ni al marcarlo pagado ni al recibir el ingreso.
- **Botón Eliminar no visible para ingresos ya recibidos con pagos pendientes** (solo aparece "Marcar como pagado" en esa sección de la pantalla) — pero `_cpEliminar()` sabe revertir un ingreso recibido si se llega a invocar por otro camino; es código defensivo, no una ruta normal de uso.
- **Errores parciales al recibir:** cada destino se ejecuta dentro de su propio `try/catch` — si uno falla, los demás se siguen procesando igual, y al final se avisa con un solo toast qué destinos tuvieron problemas, en vez de frenar toda la distribución por un error puntual.
- **Protección por antigüedad al eliminar:** no hay una fecha propia guardada por cada adelanto/marca individual (solo el booleano `yaSaque`/`yaPague`), así que se usa `fechaRecibido` (si ya se recibió) o `fechaLlegada` como mejor aproximación disponible para decidir si el movimiento es demasiado viejo para revertir con confianza.
- **Marcar "ya pagué" en un Gasto, al crearlo, mueve la plata en el acto** — igual que marcar "ya saqué" en una Reposición. No siempre fue así: hasta el 2026-09-10 esa rama solo existía para Reposición; un Gasto marcado como pagado al momento de crearlo guardaba el flag pero nunca descontaba la cajita ni cargaba la tarjeta, y como el sheet "Marcar pagos" solo actúa sobre transiciones (pendiente→pagado), un destino que ya nacía marcado jamás pasaba por ahí — la plata quedaba "pagada" solo en apariencia, sin ningún movimiento real detrás, sin ningún error visible. Corregido — ver `CHANGELOG.md#plata-comprometida`.
- **Alertas en "Necesita atención":** un ingreso pendiente que llega en ≤3 días (o que ya debería haber llegado) genera un aviso; un gasto de cajita ya recibido pero sin pagar con fecha de pago próxima genera otro, por separado — ambos llevan directo a la pantalla al tocarlos.

## 7. Decisiones de diseño

- **¿Por qué el gasto cargado a TC se trata como "favor" y no como deuda propia?** Porque conceptualmente esa deuda ya está cubierta por el ingreso que se está esperando — contarla como deuda propia en salud financiera o análisis exageraría el riesgo real. Es el mismo criterio que ya usa la app para deuda de TC de encargos o préstamos (`calcDeudaTcPropia()`, ver `analisis-financiero.md`).
- **¿Por qué un adelanto descuenta la cuenta al marcarlo, no al crear el destino?** Porque crear un destino es solo planear — recién cuando el usuario confirma que *ya sacó* esa plata de verdad hay algo que reflejar en el saldo. Mezclar "plan" con "ya pasó" hubiera significado descontar saldos por una intención que todavía puede cambiar antes de guardarse.
- **¿Por qué existe un sheet aparte para "marcar pagos" en vez de solo permitirlo al crear el destino?** Porque la necesidad de adelantar o pagar algo suele aparecer *después* de haber registrado el ingreso — ej. se registra el reembolso el día 1, pero recién el día 10 hace falta sacar la plata de la cajita para cubrir algo urgente. Forzar todo a definirse en la creación no reflejaría cómo pasa en la realidad.
- **¿Por qué el módulo quedó en un solo archivo, a diferencia de Spotify o Encargos?** Porque no depende de nada definido más abajo en `index.html` — usa `S.deudores` directo para el destino "abono a deuda", en vez de pasar por las funciones de Personas. No hubo necesidad real de dividirlo en dos archivos por orden de carga.
- **¿Por qué un adelanto (Reposición con "ya saqué", o Gasto con "ya pagué") baja el patrimonio de inmediato, sin ningún activo que lo compense mientras se espera el ingreso?** Es una decisión consciente, evaluada explícitamente y no un descuido: la plata realmente salió de una cuenta real, así que "los movimientos son la fuente de verdad" (principio que atraviesa toda la app) dice que el patrimonio debe reflejar esa salida ya mismo, sin importar qué tan segura sea la llegada del ingreso que la va a reponer.

  Se evaluó la alternativa de tratarlo como "Me deben" (`S.deudores`), que sí compensa el retiro con un activo del mismo monto — ahí un préstamo no baja el patrimonio neto, porque plata líquida se convierte en una cuenta por cobrar. Se decidió **no** adoptar ese tratamiento acá, por dos motivos: (1) `calcPatrimonioTotal()` es una función compartida por Salud financiera, Proyección, Análisis y Wrapped — sumarle un activo sintético solo para el caso de adelantos de este módulo agrega una rama más a la función más central de toda la app, con un beneficio acotado a una ventana de tiempo corta (el bache dura lo que tarda en llegar el ingreso, no meses); y (2) un adelanto de este módulo no es un préstamo abierto e independiente como un deudor — nace atado a un ingreso concreto, con fecha y monto ya conocidos, y ese mismo ingreso ya es lo que "compensa" el adelanto en cuanto llega. Tratarlo como deudor hubiera sido duplicar, con otro nombre, algo que el propio ingreso comprometido ya representa.

  El costo real de esta decisión: mientras dura la espera, el patrimonio muestra una caída que no es un empobrecimiento real — es exactamente la misma situación que un préstamo a un tercero sin cuenta especificada (ver `proyeccion-financiera.md` §5), solo que en sentido contrario. La Proyección financiera ya absorbe este tipo de bache con su *trimmed mean* (descarta el día más alto y el más bajo antes de promediar, ver `proyeccion-financiera.md` §2), así que un adelanto puntual no debería distorsionar la tendencia de forma visible salvo que sea muy grande en relación al patrimonio total.

  Si en el futuro este bache llega a sentirse como un problema real de uso (no solo teórico), la extensión más simple sería un helper aislado y aditivo — simétrico a `_saldoCPAjeno()`, que ya existe en `core-state.js` para el caso inverso (plata ajena recibida y sin pagar, que sí se resta) — en vez de tocar `calcPatrimonioTotal()` a mano en el medio de sus otras sumas.
- **¿Por qué el HTML de la pantalla y del ítem del menú "Más" se copiaron como estático a `index.html`, pero el sheet de crear/editar no?** Porque el ítem de menú que dispara la carga lazy del módulo tiene que existir *antes* de que el módulo cargue — si solo lo inyectaba el propio script, sería un círculo vicioso (hace falta el botón para cargar el script que crea el botón). El sheet de crear/editar no tiene ese problema: nadie puede abrirlo antes de que la pantalla esté activa, y la pantalla no se activa hasta que el módulo ya cargó.

## 8. Referencia de implementación

**Ubicación:** `js/modules/plata_comprometida.js`, carga lazy (`Loader.GROUPS.comprometida`, ver `js/core/lazy-loader.js`). El HTML estático de `#screen-comprometida` y `#mas-comprometida` vive en `index.html` (ver §7); el resto de los sheets se inyecta en tiempo de ejecución (`_injectSheet()`).

### Sheets

| Sheet | id del overlay | Función que abre |
|---|---|---|
| Nuevo / editar ingreso | `cp-nuevo` | `_cpAbrirNuevo()` / `_cpAbrirEditar(id)` |
| Agregar destino | `cp-destino` | `_cpAgregarDestino()` |
| Recibir ingreso | `cp-recibir` | `_cpAbrirRecibir(id)` |
| Marcar pagos (dinámico, creado la primera vez que hace falta) | `cp-marcar` | `_cpMarcarPagos(id)` |

### Funciones

| Función | Qué hace |
|---|---|
| `_cpData()` | Devuelve `S.plataCometida`, garantizando que exista |
| `_cpFuenteLabel(val)` | Envuelve `fuenteLabel()` para el texto de una cuenta/cajita |
| `_cpRenderLista()` | Pinta la pantalla completa: stats hero, pendientes con su barra de compromiso, y recibidos con pagos de cajita aún abiertos |
| `_cpDiasHastaStr(fecha)` | Texto relativo ("Mañana", "En 3 días", "Vencido") para una fecha |
| `_cpAbrirNuevo()` / `_cpAbrirEditar(id)` | Abren el sheet de creación/edición, poblando destinos si corresponde |
| `_cpGuardar()` | Valida y guarda el ingreso (nuevo o editado) |
| `_cpdSetTipo(tipo)` / `_cpdTipoChange()` | Cambian el tipo de destino en construcción y qué campos se muestran |
| `_cpdSetGastoOrigen(val)` | Alterna la UI entre gasto de cajita y gasto con TC |
| `_cpdSetYaSaque(val)` / `_cpdSetYaPague(val)` | Togglean el estado de adelanto/pago del destino en construcción |
| `_cpdConfirmar()` | Valida y agrega el destino a la lista temporal; si es adelanto, descuenta la cuenta ya mismo |
| `_cpAgregarDestino()` / `_cpRenderDestinosTmp()` / `_cpQuitarDestino(i)` | Manejo de la lista de destinos mientras se arma el ingreso |
| `_cpAbrirRecibir(id)` | Arma el plan de distribución (qué le pasa a cada destino) antes de confirmar |
| `_cpConfirmarRecibir()` | Ejecuta la distribución real: reposiciones, abonos, gastos, sobrante |
| `_cpMarcarPagos(id)` / `_cpRenderMarcarList()` / `_cpToggleMarcar(i,val)` / `_cpGuardarMarcados()` | Sheet dinámico para marcar/desmarcar adelantos y pagos de un ingreso ya existente |
| `_cpEliminar(id)` | Revierte todo lo que corresponda (según recibido/adelantado) y borra el registro |
| `_cpInit()` / `_cpInitSwipe()` | Inicialización del módulo: inyecta pantalla/sheets si hace falta, conecta swipe |

### Integración con `renderAttencion()` y `refresh()`

El módulo se engancha a ambas funciones globales (definidas antes en la carga) para agregar sus propias alertas y mantener la lista actualizada tras cualquier cambio en la app — ver `js/core/hook-global.js` para el mecanismo (`hookGlobal('refresh', ...)`, `hookGlobal('renderAttencion', ...)`).

### Dependencias externas

`escHtml`, `html`/`raw`, `toast`, `save`, `refresh`, `openSheet`, `closeSheet`, `dialogo`, `uid`, `hoy`, `fmt`, `fmtInput`, `parseMoney`, `sumarFuente`, `descontarFuente`, `buildFuentesOptsHtml`, `fuenteLabel`, `materializarIntereses`, `getDeudorSaldo`, `logCambio`, `Events`, `showScreen`, `nivelAntiguedadMovimiento`/`avisarMovimientoBloqueado`/`_cuentaOpsPosteriores`/`_tcOpsPosteriores` (protección por antigüedad). De Tarjetas de Crédito: `tcCrearCompra`, `tcEliminarCompraInterna`, `tcBuscarCompraPorIdOMatch`. `_saldoCPAjeno()` (definida en `core-state.js`) es quien realmente resta esta plata ajena del patrimonio total — este módulo solo guarda los datos que esa función lee.
