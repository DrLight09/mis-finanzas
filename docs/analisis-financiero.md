# Análisis financiero

Documentación de la pantalla `screen-analisis` (menú → Análisis) de **mis-finanzas**: qué muestra cada bloque, de dónde saca los números, y qué relación tiene con otras secciones de la app (Inicio, Salud financiera, Proyección).

El historial de bugs corregidos en esta pantalla (y en los cálculos globales de patrimonio que la alimentan) vive en [`CHANGELOG.md`](./CHANGELOG.md#análisis-financiero) y en [`CHANGELOG.md`](./CHANGELOG.md#patrimonio-y-cálculos-globales), no acá.

Función principal que renderiza toda la pantalla: **`renderAnalisis()`**.

---

> **Cómo se compone el mes (2026-10-08):** todos los números de ingresos/gastos de esta pantalla (resumen, comparación con el mes anterior, barras de 12 meses, ranking, categorías, presupuestos) salen de `Periodo` (`js/core/periodo.js`), la misma fuente que usan Inicio, el cierre de mes, la exportación CSV y Wrapped. Un gasto fijo pertenece al mes de su clave en `S.pagosGastosFijos` y cuenta con el monto realmente pagado; la Mesada se busca con la clave `año-índice de mes (0-11)`. Ver `CHANGELOG.md#infraestructura--seguridad`.

## 1. Estructura de la pantalla (de arriba hacia abajo)

1. Resumen del mes
2. Ingresos fijos
3. Comparación con el mes anterior
4. Historial de patrimonio
5. Top categorías este mes
6. Gastos por mes (últimos 12)
7. Ranking: meses con más gastos
8. Mesada recibida este año (solo si el módulo Mesada está activo)
9. Presupuestos por categoría

---

## 2. Resumen del mes

**IDs:** `analisis-balance-hero`, `an-ingresos`, `an-gastos`, `an-tasa-ahorro`, `an-ahorrado`, `an-fijos`, `an-variables`.

- **Ingresos estimados** = mesada del mes (si el módulo está activo) + ingresos fijos configurados + entradas reales (`Periodo.ingresosDelMes()` → `entradasIngresoReal()`): los movimientos cuya `clase` es `ingreso` (ver §9bis) en `S.movimientos`, en cuentas personalizadas y, desde 2026-10-09, en el historial de las cajitas de Nu (extras que entran directo a una cajita: extra de Spotify, extra de un pago de deuda). Los espejos (`clase: 'neutro'`: reposiciones de plata comprometida, intercambios de Encargos, Mesada, abonos de deudores, etc.) no cuentan. **Desde 2026-10-09 incluye los rendimientos de Nu** (intereses de cajitas y CDT, ver más abajo): Análisis pide `Periodo.balanceDelMes(mes, undefined, { conRendimientos: true })`.
- **Gastos totales** = gastos variables del mes (`S.gastosVar`, excluyendo los que marca `_esGastoVarNoReal()` como no reales: pagos de gasto fijo, pagos de TC, alcancía y extras de préstamo gastados de inmediato — `_esExtraPrestamo`) + **retiros manuales** ("Restar dinero": `S.movimientos` tipo `salida_manual`, `clase: 'gasto'`, categoría **Ajuste**, agrupados con los variables; desde 2026-10-09 — es el opuesto de "Sumar dinero" y suele usarse para cuadrar gastos que se olvidaron de registrar) + gastos fijos pagados ese mes (`S.pagosGastosFijos`). `_esGastoVarNoReal()` es el mismo criterio que usan también el dashboard de Inicio, la pantalla de Gastos, el resumen de cierre de mes, Salud financiera y Presupuestos por categoría — ver §9bis.
- **Balance** = Ingresos estimados − Gastos totales. El hero (`#analisis-balance-hero`) tiene un estado por escenario, con la clase `an-hero-pos` (verde) / `an-hero-neg` (rojo) / `an-hero-neu` (neutro), y el color, el signo del monto y el mensaje dicen lo mismo:

  | Escenario | Estado | Monto | Mensaje |
  |---|---|---|---|
  | Sin ingresos ni gastos | neutro | `$0` | «Aún no hay movimientos este mes.» |
  | Sin ingresos y con gastos | rojo | `-$X` | «Has gastado $X y aún no registras ingresos este mes. Registra tus ingresos para ver el balance del mes.» |
  | Ingresos > gastos | verde | `+$X` | «Por ahora vas bien: has gastado menos de lo que has recibido este mes.» |
  | Ingresos = gastos | neutro | `$0` | «Por ahora has gastado todo lo que has recibido este mes.» |
  | Gastos > ingresos | rojo | `-$X` | «Por ahora has gastado más de lo que has recibido este mes.» |

  «Sin ingresos» = sin ingresos operativos (los rendimientos de Nu solos no cuentan; en ese caso la línea «Incluye … de rendimientos» tampoco se muestra). El cero exacto es neutro también en «Tasa de ahorro» y «Ahorrado este mes», que siguen en «—» mientras no haya ingresos. La comparación con el mes anterior dice «por ahora» (el mes en curso contra el anterior completo).
- **Tasa de ahorro** = Balance / Ingresos estimados, en %. Si no hay ingresos, muestra `—`.
- **Ahorrado este mes** = el Balance mismo, mostrado aparte con signo.
- **Gastos fijos pagados** / **Gastos variables**: desglose simple de `gastosTotalMes` (los retiros manuales van dentro de Variables).
- **Rendimientos de Nu** (desde 2026-10-09): los intereses del mes (`Periodo.rendimientosDelMes(mes).total` = cajitas + CDTs) son plata nueva, así que **entran en Ingresos, Balance, Tasa de ahorro y Ahorrado** de esta pantalla (y en la comparación con el mes anterior), y una línea bajo el balance dice "Incluye $X de rendimientos de Nu". Así el balance mide cuánto creció el patrimonio por ingresos − gastos. Si no hay ingresos operativos (mesada, fijos, entradas) el hero sigue mostrando solo el gasto, aunque haya intereses. Inicio, Salud financiera, el cierre de mes y Wrapped **no** los suman (`balanceDelMes` sin la opción): sus ratios miden flujo de caja operativo. Los meses anteriores a 2026-10-09 salen en 0 para las cajitas (el interés ya estaba fundido en el saldo); el registro por mes (`cajita.rendimientos`) empieza al materializar. Los CDT sí se calculan exactos para cualquier mes.

## 3. Ingresos fijos

**ID:** `an-ingresos-fijos-list` (lista) — se renderiza con `renderIngresosFijos()`, llamada al inicio de `renderAnalisis()`.

Cada ingreso fijo vive en `S.ingresosFijos` (sueldo, freelance, etc.). `getIngresosFijosMes(mesK)` solo cuenta un ingreso si ya estaba activo ese mes (`!ing.desde || ing.desde<=mesK`), así que agregar un ingreso fijo hoy no reescribe meses pasados donde todavía no existía.

El botón «+ Agregar» (`data-action="analisis:abrirSheetIngresoFijo"`, `data-args="[]"`) abre el sheet en modo nuevo y el lápiz de cada fila (`analisis:editarIngresoFijo`, con el id) lo abre en modo edición. `Events` pasa siempre el elemento y el evento al final de los argumentos, por eso `abrirSheetIngresoFijo` se registra envuelta (`() => abrirSheetIngresoFijo()`): si recibiera el botón como `id` no encontraría ningún ingreso y no abriría nada.

## 4. Comparación con el mes anterior

**ID:** `an-comparacion`.

Repite el mismo cálculo de ingresos/gastos/balance (mismo criterio de ingreso/gasto real que en §2) pero para el mes calendario anterior (`mesPrev`), y muestra la diferencia (flecha arriba/abajo + %) para **Gastos** y, si hay ingresos en ambos meses, para **Balance**. Si el mes anterior no tiene gastos registrados (`totalPrev===0`), muestra "Sin datos del mes anterior para comparar" en vez de un cálculo engañoso (división por cero).

## 5. Historial de patrimonio

**ID:** `an-patrimonio-chart`. Gráfica de línea con los últimos 30 puntos de `S.patrimonioHistorial`.

- La serie **no** se grafica cruda: a cada punto se le resta el `montoBase` acumulado (aperturas de cuenta nuevas, correcciones de saldo inicial) para que abrir una cuenta nueva, corregir un saldo o destapar una alcancía con sobrante/faltante no se vea como un salto/caída falsa de patrimonio. (El sobrante o faltante **sí** cuenta como ingreso/gasto del mes en §2: aparece el día en que se encontró.)
- Se usa `valorVisible` (patrimonio sin la alcancía) en vez de `valor` (patrimonio real total), tanto en la curva como en el número de encabezado ("Últimos N días: $X") y en el tooltip al tocar un punto — para no revelar el saldo/depósitos de la alcancía a través de la gráfica, mismo criterio que el hero de Inicio. Puntos guardados antes de que existiera `valorVisible` caen a `valor` como fallback. Al destapar la alcancía (`alcanciaConfirmarDestapar()`), `valorVisible` se iguala a `valor` en todo el historial: esa plata ya dejó de ser oculta, así que la curva y la tendencia la reflejan en el día en que se depositó, sin un salto único el día del destape.
- Debajo de la gráfica se muestra el cambio total de la ventana (`diffTotal`) en monto y %. Con cambio cero (p. ej. todo en $0) se muestra `$0` y `0.0%` sin signo, en el color neutro de la app, y la línea y el degradado van en gris; solo un cambio real usa `+` con verde o `−` con rojo.

### ¿Cómo se genera cada punto del historial? (`snapshotPatrimonio()`)

- Se llama cada vez que se guarda algo en la app (`save()`) o llega una sincronización desde Firebase (`_applyCloudData()`) — es decir, con mucha frecuencia, no una vez al día.
- Si ya existe un punto para **hoy**, lo **sobrescribe** con el valor actual. Si no existe, crea uno nuevo.
- Consecuencia práctica: lo que queda registrado para un día es el patrimonio en el momento del **último** guardado/sync de ese día — no el primero, ni un promedio, ni el más alto.
- Guarda `valor` (patrimonio total real, con alcancía) y `valorVisible` (sin alcancía) por separado — ver arriba.
- **`montoBase` también incluye (desde 2026-10-10) los movimientos de deudas sin pata de caja** (préstamo "Me deben" sin cuenta ni tarjeta, abono recibido sin cuenta destino, y su equivalente en "Yo debo"): mueven el patrimonio sin ser ingreso ni gasto. `load()` recalcula `montoBase` de todo el historial en cada carga (`recalcularMontoBaseHistorial()`), así que la corrección vale hacia atrás y se limpia sola si se borra el movimiento. `scripts/conciliacion.js` mide cuánto del cambio de patrimonio de cada mes queda sin explicar.
- Guarda también `montoBase` (monto exacto de aperturas/ajustes de saldo inicial ese día **más el sobrante (+) o faltante (−) de un destape de alcancía ese día**, desde 2026-09-29 — es plata que ya existía y no estaba anotada, no crecimiento), usado tanto por esta gráfica como por la Proyección financiera (§8) para no confundir un saldo inicial con crecimiento real.
- El array se recorta a los últimos 365 puntos.

### Eliminar un movimiento no deja rastro en el historial

Las instantáneas son una foto por día; si después se elimina algo que ya estaba contado (un ingreso por error, un gasto mal puesto), las fotos desde el día en que se creó siguen incluyéndolo y la gráfica mostraría un salto sin movimiento que lo respalde. Por eso **todo flujo que elimina algo que mueve el patrimonio lo quita también de las instantáneas**: mide `medirPatrimonioParaHistorial()` antes de revertir y, antes de guardar, llama a `purgarEfectoEnHistorial(antes, item)`, que resta lo que cambió (en `valor` y `valorVisible`) a todas las instantáneas con fecha ≥ el día de creación del movimiento (`diaCreacionMov()`: su `ts`, o la hora que lleva su id de `uid()`, y solo si no tiene ninguno, su `fecha`). Se usa el día de creación y no la `fecha` del movimiento porque un movimiento cargado con fecha pasada no estaba en las fotos de esos días. Cubre `eliminarMovimiento` (ingresos, saldos iniciales, retiros, transferencias, gastos y mesada), `deleteGastoVar`, `eliminarMovDeudor`, `eliminarMovMiDeuda`, `eliminarCompraTC`, `eliminarPagoTC`, `eliminarMesadaPago` y el borrado de un registro del historial de Spotify. Editar un movimiento es eliminar y crear otro, así que pasa por el mismo camino.

- **Saldos iniciales:** `purgarAperturaDelHistorial(m)` quita el monto original desde el día en que se creó la cuenta y cada corrección (`_ajustes`) desde el día en que se hizo (`m.monto` ya incluye las correcciones). Eliminar un saldo inicial no deja ningún registro aparte: la base (`montoBase`) sale solo de lo que existe, así que `valor` y `valorReal` no pueden diferir por un movimiento eliminado.
- **Una transferencia** entre cuentas propias no cambia el patrimonio; su eliminación no toca el historial.
- **Límite:** el efecto se resta por igual en todos los días desde la creación; el interés que una cajita de Nu haya generado sobre ese dinero entre medias entra como si hubiera estado desde el primer día.

### Limitación conocida: movimientos backdateados

`snapshotPatrimonio()` clasifica el punto por la fecha real del guardado (`hoy()`), nunca por la `fecha` que se le haya puesto al movimiento. Si el día 10 se carga un ingreso con fecha 6 (algo que se había olvidado registrar), el punto ya existente del día 6 no se toca, y el salto de patrimonio aparece en el punto del día 10 — el día en que se guardó, no el día en que "pasó" según la fecha elegida.

`montoBase` no cubre este caso: solo resta aperturas de cuenta y ajustes de saldo inicial fechados hoy, no entradas manuales normales backdateadas — así que ese salto queda sin filtrar, tanto en la curva como en la tendencia que usa la Proyección financiera (§8), que no aplica recorte de outliers.

Esto es distinto del "Resumen del mes" y la "Comparación con el mes anterior" (§2, §4), que sí agrupan por la `fecha` real del movimiento (`mesKey(m.fecha)`) y no por la fecha de guardado — ahí un ingreso backdateado dentro del mismo mes se refleja correctamente sin importar cuándo se cargó. La discrepancia queda documentada acá a propósito, sin corrección: dado el uso actual (backdatear es poco frecuente), no se justifica sumar la complejidad de recalcular puntos pasados de `S.patrimonioHistorial` cada vez que se guarda un movimiento no fechado hoy.

## 6. Top categorías este mes

**ID:** `an-cats-mes`. Agrupa `gvMes` (gastos variables del mes, incluidos los retiros manuales bajo la categoría `Ajuste`) + gastos fijos pagados por categoría (`g.cat`), ordena de mayor a menor y muestra el top 5 con barra proporcional al máximo.

## 7. Gastos por mes (últimos 12) y Ranking de meses

**IDs:** `an-grafico-barras` / `an-grafico-labels` (barras) y `an-ranking-meses` (ranking).

Recorren `S.gastosVar` (mismo criterio de gasto real que en §2, vía `_esGastoVarNoReal()`) + `S.gastosFijos` pagados mes a mes, igual que el "Resumen del mes" pero repetido para cada uno de los últimos 12 meses (barras) o para todos los meses con datos (ranking, ordenado de mayor a menor gasto).

## 8. Mesada recibida este año

**IDs:** `an-mesada-section` (se oculta si el módulo no está activo), `an-mesada-total`. Suma lo recibido de papá y mamá mes a mes del año actual (`getMesadaData()`).

## 9. Presupuestos por categoría

**ID:** `an-presupuestos`, función `renderPresupuestos()`. Los límites viven en `S.presupuestos` (objeto `categoría → monto`), editables desde el sheet "Presupuestos mensuales" (`abrirPresupuestos()`). El gasto por categoría se calcula con el mismo criterio de gasto real que el resto de la pantalla (`_esGastoVarNoReal()`). Por cada categoría con presupuesto, muestra una barra de progreso (gasto del mes / límite) en verde/ámbar/rojo según el %, y dispara un toast de aviso la primera vez que alguna categoría llega a 80–99%.

---

## 9bis. Qué cuenta como ingreso o gasto real (`clase`, `_esEntradaEspejoNoIngreso()` / `_esGastoVarNoReal()`)

> **La respuesta está guardada en el movimiento (desde 2026-10-09):** cada uno lleva `clase` (`ingreso` · `gasto` · `neutro` · `ajuste`), escrita por el módulo que lo crea. Los dos helpers de abajo solo leen `clase` (vía `claseEfectivaMovimiento()`): **no hay reglas de respaldo** que la deduzcan de etiquetas, descripciones o banderas (se retiraron el 2026-10-13: la app nace limpia y `tests/nucleo.test.js`, bloque `clase-cobertura`, exige que todo escritor la ponga al crear el movimiento). Un movimiento sin `clase` no cuenta como ingreso ni se excluye como gasto, y `save()` avisa de los que llegan sin ella (`movimientosSinClase`). Para un módulo nuevo basta escribir `clase` al crear el movimiento; los criterios que siguen explican **qué clase recibe** cada caso. Ver `libro-de-movimientos.md` (regla 7: el libro no clasifica).

Ambos viven en `js/core/core-state.js`, no en `analisis.js` — por eso los puede usar cualquier pantalla sin cargar el módulo de Análisis. Todos los bloques de esta pantalla que suman ingresos o gastos (§2, §4, §7, §9) usan dos helpers centralizados, no un filtro propio cada uno:

- **`_esEntradaEspejoNoIngreso(m)`** — devuelve `true` cuando la `clase` guardada del movimiento no es `ingreso` (sin respaldo por descripción ni por banderas). Qué movimientos `tipo:'entrada'` de `S.movimientos` reciben `clase: 'ingreso'` y cuáles quedan como espejo de plata que ya se contó en otro lado (reposición de plata comprometida, intercambio/traspaso de Encargos, Mesada, Prestado) lo decide el módulo que los crea. **Excepción:** lo que lleva `_esExtraIngreso` sí es ingreso real, aunque tenga `_origenSeccion` de Prestado o `_encMovId` de Encargos: el extra/propina de un pago de deuda guardado en una cuenta el traspaso "Me lo regalaron" de un encargo el margen de "Ya la usé" (`yoMeQuedo`), y todo margen que escribe el motor de diferencial (`_esDiferencialEncargo`: salida de encargo, compra con TC, Préstamo con TC).
- **`_esGastoVarNoReal(g)`** — devuelve `true` si el gasto de `S.gastosVar` tiene una `clase` distinta de `gasto` (sin `clase` cuenta como real). Cada módulo le pone esa clase al crearlo; quedan fuera pagos de gasto fijo, pagos de TC (cancelación de deuda, no gasto nuevo), alcancía (sigue siendo plata propia) y extras de préstamo gastados de inmediato (`_esExtraPrestamo`, plata que nunca se contó como ingreso).

Estos dos helpers **no son exclusivos de esta pantalla** — también los usan el dashboard de Inicio, la pantalla de Gastos, el resumen de cierre de mes y Salud financiera (ver §Relación con otras secciones). Son la única fuente de verdad de "qué es ingreso/gasto real" en toda la app: si se agrega una exclusión nueva, agregarla acá basta para que se propague a todas las pantallas — no hace falta (ni se debe) copiar la condición a mano en cada lugar. Antes de que existieran centralizados así, la misma exclusión llegó a faltar en 9 lugares distintos por estar duplicada a mano (ver `CHANGELOG.md#análisis-financiero`).

---

## Relación con otras secciones (fuera de "Análisis" pero comparten lógica)

Estos dos bloques **no viven en `screen-analisis`**, sino en Inicio, pero se calculan con las mismas funciones base:

- **Salud financiera** (`health-score-card`, Inicio) — usa `calcPatrimonioTotal()`, `ingresosMes`, `liquidoReal`, deuda TC propia, gastos del mes, etc. para dar un puntaje. Comparte con esta pantalla los mismos helpers de "qué es ingreso/gasto real" (§9bis) — al estar centralizados, ya no hace falta sincronizarlos a mano entre pantallas. Documentación propia en [`salud-financiera.md`](./salud-financiera.md).
- **Proyección financiera** (`proyeccion-card`, Inicio) — calcula una **tendencia mensual** a partir de `S.patrimonioHistorial` (los mismos snapshots del historial de patrimonio) y proyecta patrimonio a 3/6/12 meses:
  - Suma el cambio neto de patrimonio (restando `montoBase` de cada día, para no contar aperturas/ajustes como "crecimiento") sobre todos los pares de puntos consecutivos, y lo divide entre los días reales totales — un promedio ponderado por días, no un promedio de tasas diarias. **No aplica ningún recorte de outliers (trimmed mean):** el ingreso real llega en pocos días grandes, y descartar el día más alto lo trataría como ruido en vez de como ingreso — ver `proyeccion-financiera.md` §2 para el detalle.
  - Exige al menos 7 días reales de separación entre el primer y último punto (`MIN_DIAS_PARA_TENDENCIA`, en `js/modules/inicio.js`) antes de mostrar cualquier proyección; si no hay suficiente historial, muestra un mensaje de "vuelve en unos días" en vez de un número poco confiable.
  - Nivel de confianza escalonado: sin proyección con menos de 7 días de historial, `preliminar` (7–29 días), `normal` (30–59 días), `estable` (60+ días).

## 10. Patrimonio total: `calcPatrimonioTotal()`

**Ubicación:** el módulo de esta pantalla es [`js/modules/analisis.js`](../js/modules/analisis.js) (`renderAnalisis()`, ingresos fijos, presupuestos). `calcPatrimonioTotal()` y `snapshotPatrimonio()` viven en `js/core/core-state.js`, no en este módulo: `save()` las llama en cada guardado, no solo al entrar a esta pantalla. El cálculo de Nu que usa (`calcC`, `calcCDT`, `nuTotal`) está en `js/core/nu-calc.js`. `renderHealthScore()`/`renderProyeccion()` viven en `js/modules/inicio.js`.


Es la base de todo lo anterior (historial, tendencia, proyección, salud financiera, hero de Inicio). Suma:

```
nu (cajitas Nu) + CDTs + Nequi + Efectivo + prestado (Me deben) + cuentas personalizadas + alcancía
− deuda TC total − Yo debo (S.misDeudas) − plata comprometida ajena (_saldoCPAjeno)
```

Un saldo (Efectivo, Nequi, cuenta personalizada) puede quedar temporalmente negativo tras borrar un movimiento cuyo dinero ya se gastó (reversión sin piso en 0, 2026-09-30): el patrimonio lo suma tal cual, sin recortarlo, y vuelve al valor correcto al rehacer el movimiento.

Todo lo que es plata **ajena** que solo estás cuidando (encargos, plata comprometida de otra persona, lo que le debés a alguien) se resta para que el patrimonio refleje solo lo que es realmente tuyo. Ver [`CHANGELOG.md`](./CHANGELOG.md#patrimonio-y-cálculos-globales) para el detalle de qué faltaba restar acá y ya se corrigió.
