# Análisis financiero

Documentación de la pantalla `screen-analisis` (menú → Análisis) de **mis-finanzas**: qué muestra cada bloque, de dónde saca los números, y qué relación tiene con otras secciones de la app (Inicio, Salud financiera, Proyección).

El historial de bugs corregidos en esta pantalla (y en los cálculos globales de patrimonio que la alimentan) vive en [`CHANGELOG.md`](./CHANGELOG.md#análisis-financiero) y en [`CHANGELOG.md`](./CHANGELOG.md#patrimonio-y-cálculos-globales), no acá.

Función principal que renderiza toda la pantalla: **`renderAnalisis()`**.

---

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

- **Ingresos estimados** = mesada del mes (si el módulo está activo) + ingresos fijos configurados (`getIngresosFijosMes()`) + entradas manuales reales (`S.movimientos` tipo `'entrada'`, excluyendo movimientos espejo vía `_esEntradaEspejoNoIngreso()`: reposiciones de plata comprometida, intercambios/traspasos de Encargos, movimientos de Mesada y de Prestado — incluye un fallback por descripción para movimientos viejos sin la bandera `_esReposicionCP`).
- **Gastos totales** = gastos variables del mes (`S.gastosVar`, excluyendo los que marca `_esGastoVarNoReal()` como no reales: pagos de gasto fijo, pagos de TC, alcancía y extras de préstamo gastados de inmediato — `_esExtraPrestamo`) + gastos fijos pagados ese mes (`S.pagosGastosFijos`). `_esGastoVarNoReal()` es el mismo criterio que usan también el dashboard de Inicio, la pantalla de Gastos, el resumen de cierre de mes, Salud financiera y Presupuestos por categoría — ver §9bis.
- **Balance** = Ingresos estimados − Gastos totales. El hero cambia de color/mensaje según sea positivo, negativo, o si no hay ingresos registrados todavía.
- **Tasa de ahorro** = Balance / Ingresos estimados, en %. Si no hay ingresos, muestra `—`.
- **Ahorrado este mes** = el Balance mismo, mostrado aparte con signo.
- **Gastos fijos pagados** / **Gastos variables**: desglose simple de `gastosTotalMes`.

## 3. Ingresos fijos

**ID:** `an-ingresos-fijos-list` (lista) — se renderiza con `renderIngresosFijos()`, llamada al inicio de `renderAnalisis()`.

Cada ingreso fijo vive en `S.ingresosFijos` (sueldo, freelance, etc.). `getIngresosFijosMes(mesK)` solo cuenta un ingreso si ya estaba activo ese mes (`!ing.desde || ing.desde<=mesK`), así que agregar un ingreso fijo hoy no reescribe meses pasados donde todavía no existía.

## 4. Comparación con el mes anterior

**ID:** `an-comparacion`.

Repite el mismo cálculo de ingresos/gastos/balance (mismo criterio de ingreso/gasto real que en §2) pero para el mes calendario anterior (`mesPrev`), y muestra la diferencia (flecha arriba/abajo + %) para **Gastos** y, si hay ingresos en ambos meses, para **Balance**. Si el mes anterior no tiene gastos registrados (`totalPrev===0`), muestra "Sin datos del mes anterior para comparar" en vez de un cálculo engañoso (división por cero).

## 5. Historial de patrimonio

**ID:** `an-patrimonio-chart`. Gráfica de línea con los últimos 30 puntos de `S.patrimonioHistorial`.

- La serie **no** se grafica cruda: a cada punto se le resta el `montoBase` acumulado (aperturas de cuenta nuevas, correcciones de saldo inicial) para que abrir una cuenta nueva o corregir un saldo no se vea como un salto/caída falsa de patrimonio.
- Se usa `valorVisible` (patrimonio sin la alcancía) en vez de `valor` (patrimonio real total), tanto en la curva como en el número de encabezado ("Últimos N días: $X") y en el tooltip al tocar un punto — para no revelar el saldo/depósitos de la alcancía a través de la gráfica, mismo criterio que el hero de Inicio. Puntos guardados antes de que existiera `valorVisible` caen a `valor` como fallback.
- Debajo de la gráfica se muestra el cambio total de la ventana (`diffTotal`) en monto y %.

### ¿Cómo se genera cada punto del historial? (`snapshotPatrimonio()`)

- Se llama cada vez que se guarda algo en la app (`save()`) o llega una sincronización desde Firebase (`_applyCloudData()`) — es decir, con mucha frecuencia, no una vez al día.
- Si ya existe un punto para **hoy**, lo **sobrescribe** con el valor actual. Si no existe, crea uno nuevo.
- Consecuencia práctica: lo que queda registrado para un día es el patrimonio en el momento del **último** guardado/sync de ese día — no el primero, ni un promedio, ni el más alto.
- Guarda `valor` (patrimonio total real, con alcancía) y `valorVisible` (sin alcancía) por separado — ver arriba.
- Guarda también `montoBase` (monto exacto de aperturas/ajustes de saldo inicial ese día), usado tanto por esta gráfica como por la Proyección financiera (§8) para no confundir un saldo inicial con crecimiento real.
- El array se recorta a los últimos 365 puntos.

## 6. Top categorías este mes

**ID:** `an-cats-mes`. Agrupa `gvMes` (gastos variables del mes) + gastos fijos pagados por categoría (`g.cat`), ordena de mayor a menor y muestra el top 5 con barra proporcional al máximo.

## 7. Gastos por mes (últimos 12) y Ranking de meses

**IDs:** `an-grafico-barras` / `an-grafico-labels` (barras) y `an-ranking-meses` (ranking).

Recorren `S.gastosVar` (mismo criterio de gasto real que en §2, vía `_esGastoVarNoReal()`) + `S.gastosFijos` pagados mes a mes, igual que el "Resumen del mes" pero repetido para cada uno de los últimos 12 meses (barras) o para todos los meses con datos (ranking, ordenado de mayor a menor gasto).

## 8. Mesada recibida este año

Solo visible si `S.modulos.mesada` está activo. Suma lo recibido de papá y mamá mes a mes del año actual (`getMesadaData()`).

## 9. Presupuestos por categoría

**ID:** `an-presupuestos`, función `renderPresupuestos()`. Los límites viven en `S.presupuestos` (objeto `categoría → monto`), editables desde el sheet "Presupuestos mensuales" (`abrirPresupuestos()`). El gasto por categoría se calcula con el mismo criterio de gasto real que el resto de la pantalla (`_esGastoVarNoReal()`). Por cada categoría con presupuesto, muestra una barra de progreso (gasto del mes / límite) en verde/ámbar/rojo según el %, y dispara un toast de aviso la primera vez que alguna categoría llega a 80–99%.

---

## 9bis. Qué cuenta como ingreso o gasto real (`_esEntradaEspejoNoIngreso()` / `_esGastoVarNoReal()`)

Todos los bloques de esta pantalla que suman ingresos o gastos (§2, §4, §7, §9) usan dos helpers centralizados, no un filtro propio cada uno:

- **`_esEntradaEspejoNoIngreso(m)`** — decide si un movimiento `tipo:'entrada'` de `S.movimientos` es ingreso real o solo un movimiento espejo que ya se contó en otro lado (reposición de plata comprometida, intercambio/traspaso de Encargos, Mesada, Prestado — con fallback por descripción para movimientos viejos sin la bandera `_esReposicionCP`).
- **`_esGastoVarNoReal(g)`** — decide si un gasto de `S.gastosVar` cuenta como gasto real del mes: excluye pagos de gasto fijo, pagos de TC (cancelación de deuda, no gasto nuevo), alcancía (sigue siendo plata propia) y extras de préstamo gastados de inmediato (`_esExtraPrestamo`, plata que nunca se contó como ingreso).

Estos dos helpers **no son exclusivos de esta pantalla** — también los usan el dashboard de Inicio, la pantalla de Gastos, el resumen de cierre de mes y Salud financiera (ver §Relación con otras secciones). Son la única fuente de verdad de "qué es ingreso/gasto real" en toda la app: si se agrega una exclusión nueva, agregarla acá basta para que se propague a todas las pantallas — no hace falta (ni se debe) copiar la condición a mano en cada lugar. Antes de que existieran centralizados así, la misma exclusión llegó a faltar en 9 lugares distintos por estar duplicada a mano (ver `CHANGELOG.md#análisis-financiero`).

---

## Relación con otras secciones (fuera de "Análisis" pero comparten lógica)

Estos dos bloques **no viven en `screen-analisis`**, sino en Inicio, pero se calculan con las mismas funciones base:

- **Salud financiera** (`health-score-card`, Inicio) — usa `calcPatrimonioTotal()`, `ingresosMes`, `liquidoReal`, deuda TC propia, gastos del mes, etc. para dar un puntaje. Comparte con esta pantalla los mismos helpers de "qué es ingreso/gasto real" (§9bis) — al estar centralizados, ya no hace falta sincronizarlos a mano entre pantallas. Documentación propia en [`salud-financiera.md`](./salud-financiera.md).
- **Proyección financiera** (`proyeccion-card`, Inicio) — calcula una **tendencia mensual** a partir de `S.patrimonioHistorial` (los mismos snapshots del historial de patrimonio) y proyecta patrimonio a 3/6/12 meses:
  - Convierte cada par de puntos consecutivos en una tasa diaria de cambio (COP/día), restando `montoBase` para no contar aperturas/ajustes como "crecimiento".
  - Aplica **trimmed mean**: con 5+ tasas descarta la más alta y la más baja (outliers como un ingreso o gasto puntual grande) antes de promediar.
  - Exige al menos 7 días reales de separación entre el primer y último punto (`MIN_DIAS_PARA_TENDENCIA`) antes de mostrar cualquier proyección; si no hay suficiente historial, muestra un mensaje de "vuelve en unos días" en vez de un número poco confiable.
  - Nivel de confianza escalonado: `preliminar` (<30 días), `normal` (30–59 días), `estable` (60+ días).

## 10. Patrimonio total: `calcPatrimonioTotal()`

Es la base de todo lo anterior (historial, tendencia, proyección, salud financiera, hero de Inicio). Suma:

```
nu (cajitas Nu) + CDTs + Nequi + Efectivo + prestado (Me deben) + cuentas personalizadas + alcancía
− deuda TC total − Yo debo (S.misDeudas) − plata comprometida ajena (_saldoCPAjeno)
```

Todo lo que es plata **ajena** que solo estás cuidando (encargos, plata comprometida de otra persona, lo que le debés a alguien) se resta para que el patrimonio refleje solo lo que es realmente tuyo. Ver [`CHANGELOG.md`](./CHANGELOG.md#patrimonio-y-cálculos-globales) para el detalle de qué faltaba restar acá y ya se corrigió.
