# Salud financiera

Documentación de la tarjeta **Salud financiera** (`health-score-card`, pantalla Inicio) de `mis-finanzas` (`index.html`). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos usa y cómo fluye el cálculo. Los detalles de implementación (funciones, ids de DOM) aparecen al final, como referencia rápida.

El historial de bugs corregidos vive en [`CHANGELOG.md`](./CHANGELOG.md#salud-financiera), no acá.

---

## 1. Objetivo

Da un puntaje único de 0 a 100 que resume qué tan sana está la situación financiera actual — combinando liquidez disponible, deuda de tarjetas de crédito, plata prestada a otros, disciplina de gasto y ahorro estructurado — para tener una sola cifra de referencia en Inicio sin tener que revisar cada módulo por separado.

---

## 2. Conceptos importantes

- **Score base:** arranca en 50 (neutro) y sube o baja según seis criterios que puntúan (a, b, c, d, e y h, ver §5), y al final se recorta al rango [0, 100]. Los antiguos (f) «≥ 2 gastos fijos configurados» y (g) «una sola categoría» **ya no puntúan**: medían cómo usas la app, no tu salud financiera. La sugerencia de categorías se conserva como consejo.
- **Liquidez real (`liquidoReal`):** viene de `calcLiquidez()` (`js/core/ (estado.js, cuentas-fuentes.js…)`, la misma fuente única del patrimonio). Suma las cuentas disponibles de inmediato — Nequi, efectivo, cajitas (sin CDTs) y cuentas personalizadas — y resta tres cosas: la deuda de TC **propia**, lo que **debes a personas** (`Yo debo`, aunque no tenga fecha de pago: es plata que te pueden pedir en cualquier momento) y la **plata ajena** que guardas en tus cuentas (plata comprometida). No incluye CDTs (bloqueados) ni lo que te deben (sin fecha cierta no es plata disponible) ni la Alcancía (oculta). Es a propósito prudente y asimétrica: lo que te deben no cuenta hasta que llega, lo que debes cuenta completo. Antes solo restaba la tarjeta y la calificación salía optimista con deudas a personas.
- **`patrimonio`:** `calcPatrimonioVisible()` (sin Alcancía, con todas las deudas restadas). Solo sirve para saber si hay datos y para el ratio de deuda de TC cuando aún no hay ingresos.
- **Liquidez con CDTs (`liquidoConCDTs`):** `liquidoReal` + los CDTs que **aún no vencen** (`cdtsBloqueados`). Se usa para distinguir «no tengo nada disponible» de «tengo algo, pero está bloqueado» y para el peso del bono de CDT. Un CDT **vencido** (`cdtVencido()`, `nu-calc.js`: desde el día siguiente al vencimiento) ya no está bloqueado y suma en `liquidoReal`, aunque siga sin «liberarse» en la cajita.
- **Compras grandes (`gv.grande`, marcadas por el usuario o detectadas solas, ver `docs/gastos.md`):** golpe real para el patrimonio, la liquidez y el runway (criterios a, b y c las cuentan completas), pero **fuera del flujo**: el gasto típico (`gastoPromedioPrevio`), el ratio de (d) y la racha de (h) no las incluyen. Si una compra grande reciente (90 días) dejó las reservas por debajo del fondo completo, un consejo la nombra (sin puntos propios: la liquidez ya bajó). Ver `docs/gastos.md#compra-grande`.
- **Referencia reciente:** el ingreso y el gasto «típicos» (`Periodo.ingresoPromedioPrevio` / `gastoPromedioPrevio`) promedian hasta 3 meses completos con datos, **dentro de los últimos 6 meses calendario** (`Periodo.VENTANA_REFERENCIA_MESES`). Un ingreso de hace un año no es el de hoy: sin la ventana, quien dejó de cobrar seguía medido contra plata que ya no entra y desaparecía el aviso «Registra tus ingresos».
- **Umbrales:** los límites (6 y 3 meses de fondo, 1,5× y 3× de deuda de tarjeta, 0,4/1/2 de prestado, 0,7/0,9/1 de gasto sobre ingreso, 10 % del CDT, racha de 2 y 3 meses) están en `js/core/umbrales.js` (`UMBRALES.salud`). Los **puntos** de cada criterio siguen en `calcHealthScore`.
- **Ingresos del mes (`ingresosMes`):** mesada + ingresos reales del mes + cobros de ingresos fijos registrados (regla de caja: cuentan en el mes de su fecha). Los ratios de deuda de TC, gasto/ingreso y «sin ingresos» usan el ingreso de referencia: el mayor entre lo de este mes y el promedio de los últimos 3 meses con ingreso. Los "ingresos reales" salen de `ingresosRealesDelMes()` (`el núcleo (js/core/estado.js y hermanos)`), la misma definición que usan Análisis financiero y Wrapped (`entradasIngresoReal()`): movimientos con `clase: 'ingreso'` en `S.movimientos`, cuentas personalizadas y (desde 2026-10-09) el historial de las cajitas de Nu (extras que entran directo a una cajita), con o sin cuenta. Desde 2026-10-04 ya no se exige que la entrada tenga cuenta.
- **Gastos del mes (`gastosMes`):** gastos variables reales (vía `_esGastoVarNoReal()`: excluye pagos de gasto fijo, pagos de TC, alcancía y extras de préstamo gastados de inmediato) + retiros manuales ("Restar dinero", `clase: 'gasto'`, desde 2026-10-09) + gastos fijos pagados ese mes. Mismo criterio que "Gastos totales" en Análisis financiero (todo sale de `Periodo`).
- **`tieneAlgo`:** hay datos suficientes para evaluar: cualquier activo o deuda cuenta (patrimonio ≠ 0, plata prestada, deuda de tarjeta, **deudas con personas, plata ajena**, cuentas con saldo, CDTs o gasto del mes). Antes un patrimonio negativo o solo deber a personas no contaba, y la tarjeta decía «Registra más datos» justo en la situación más delicada. Si no hay nada, no se muestra un score (evita un 50 o un 0 engañoso).

---

## 3. Reglas que nunca deben romperse

- **El criterio de "qué es un ingreso o gasto real" debe coincidir siempre con Análisis financiero.** Se comparten dos helpers centralizados (`_esEntradaEspejoNoIngreso()` para ingresos, `_esGastoVarNoReal()` para gastos, documentados en `analisis-financiero.md#9bis`) precisamente porque ya pasó dos veces que la misma exclusión se corrigiera en una pantalla y no en la otra por estar duplicada a mano. Cualquier exclusión nueva se agrega en esos helpers, nunca copiada directamente en `calcHealthScore()`.
- **Un CDT sin vencer nunca cuenta como liquidez disponible para el fondo de emergencia**, aunque sí cuenta en el patrimonio general y en `liquidoConCDTs`. Está bloqueado, no sirve para una emergencia inmediata. Al vencer deja de estar bloqueado (ver «Liquidez con CDTs»).
- **Los rendimientos del mes (intereses de cajitas y CDT) nunca se suman a `ingresosMes`.** Son ingreso económico, pero los ratios de deuda y gasto miden flujo de caja real y disponible, y un CDT sigue bloqueado. Desde 2026-10-09 `rendimientoCDTMes` trae cajitas + CDT (`Periodo.rendimientosDelMes(mes).total`); sigue siendo solo informativo. (Análisis financiero, en cambio, sí los suma a su balance: mide crecimiento de patrimonio, no flujo de caja.)
- **El score siempre se recorta entre 0 y 100** antes de mostrarse.
- **El puntaje nunca se persiste en `S`.** Se recalcula desde cero en cada render, para que nunca quede desactualizado respecto a los datos reales de los demás módulos.

---

## 4. Modelo de datos

No mantiene estado propio en `S` — se recalcula íntegramente en cada llamado a `calcHealthScore()`, leyendo datos de otros módulos (`S.cajitas`, `S.gastosVar`, `S.gastosFijos`, `S.mesadas`, `S.cuentasPersonalizadas`, `S.movimientos`, `S.tarjetasCredito`).

```js
// Valor de retorno de calcHealthScore()
{
  score: 78,               // 0-100, ya recortado
  tips: ["..."],           // los textos de los consejos
  consejos: [{ texto, tipo, ... }], // tipo: alerta | aviso | sugerencia | ok (ordenados: lo urgente primero)
  sinDatos: false,         // true si no hay nada que evaluar (tieneAlgo falso)
  ingresosMes: 450000,
  rendimientoCDTMes: 1200, // rendimientos del mes (cajitas + CDT), informativo — no afecta el score, ver §3
  mesesCubiertos: 3.4,     // «runway»: liquidez real ÷ gasto típico; 0 si no hay liquidez; null si aún no hay gasto típico
  rachaDeficit: 0          // meses seguidos en déficit que MERECEN aviso (0 si no merecen, ver (h))
}
```

Si `!S.cajitas` (la app todavía no tiene datos base), `calcHealthScore()` devuelve `null` directamente.

---

## 5. Flujo

### Cálculo del puntaje

```
Calcular gastosMes, ingresosMes, liquidoReal, liquidoConCDTs, deudaTC, prest (plata prestada a otros)
  ↓
score = 50 (base)
  ↓
a) Fondo de emergencia: liquidoReal / gasto típico (≥ 6 meses → +20, ≥ 3 → +10, < 3 → −5). Con liquidoReal < 0: −8 si los CDTs sin vencer la cubren (aviso), −15 si no (alerta); el texto nombra la deuda
b) Deuda TC vs ingresos (o vs patrimonio sin ingresos): > 1,5× → −8, > 3× → −15; hasta 1,5× no puntúa. Sin deudas propias y con liquidez positiva → +5 (antes SUMABA +5 por tener deuda)
c) Plata prestada a otros vs liquidoReal                   → −8 / −13 / −15 / −18
d) Ritmo de gasto (meses COMPLETOS): gasto típico ÷ ingreso típico → ≤ 0,7: +10 · ≤ 0,9: +5 · > 1: −10. Además, si el mes en curso ya gastó más que el ingreso de referencia → −10 («Por ahora…»)
e) CDTs activos: bono proporcional al peso del CDT (completo desde el 10 % de tu plata; tope 3 si hay mucho prestado o liquidez negativa) → 0 a +10 (0 a +3)
h) Racha de déficit: 2 meses completos seguidos con balance negativo → −8 (aviso); 3 o más → −15 (alerta). No aplica sin ingreso reciente registrado ni con un fondo sólido (≥ 6 meses). Si aplica, sustituye al −10 de d) por «ratio > 1» (no se penaliza dos veces)
  ↓
score recortado a [0, 100]
  ↓
Si ninguna de las reglas anteriores generó un tip, se agrega uno genérico según el rango del score
```

Los criterios (f) y (g) de versiones anteriores ya no existen como puntos (ver §2).


### Render

```
calcHealthScore()
  ↓
Si null → mensaje "Registra más datos para calcular tu salud financiera"
  ↓
Si hay score → anillo de progreso SVG + etiqueta (Excelente / Regular / Necesita atención) + lista de tips
```

---

## 6. Casos especiales

- **Sin datos suficientes** (`tieneAlgo` falso): la tarjeta muestra un mensaje neutro en vez de un score de 0 o 50 que se vería como un puntaje real.
- **Deuda de TC sin ingresos registrados ese mes:** compara la deuda contra el patrimonio visible como respaldo. Si la liquidez ya es negativa (la misma deuda ya se alertó en (a)), no se penaliza una segunda vez.
- **Sin liquidez libre y con plata prestada** (`liquidoReal <= 0` y `prest > 0`; el cero puede venir de lo prestado o de lo que debes): caso crítico marcado aparte con `ratioPrest = Infinity`, para que el bonus de CDTs (factor e) también se reduzca automáticamente sin tener que repetir la condición.
- **Mucho dinero prestado sin cobrar + CDTs activos:** el bonus de tener CDTs baja de +10 a +3 — tener ahorro estructurado no compensa igual si al mismo tiempo hay mucho riesgo de no cobrar lo prestado.
- **Fondo de emergencia sin meses anteriores con gastos** (primer mes de uso): el criterio (a) no puntúa ni aconseja, porque no hay con qué medir. No se usa el gasto del mes en curso: a principio de mes apenas hay gastos y «reservas ÷ gastos del mes» salía en decenas de meses (+20 puntos que se iban cayendo a medida que pasaba el mes). La referencia es `Periodo.gastoPromedioPrevio(mes, 3)`: promedio de hasta 3 meses anteriores completos con gasto.
- **CDT pequeño:** el bono es `round(tope × min(1, peso ÷ 10 %))`, con `peso = valor de los CDTs ÷ (cuentas libres + CDTs)`. Un CDT de $1.000 dentro de $81.000 (1,2 %) suma 1 punto, no 10.
- **Mesada de un mes anterior cobrada este mes:** cuenta como ingreso de este mes (`Periodo.ingresosDelMes()` usa la regla de caja: el mes en que entró la plata), así que no deja a Salud «sin ingresos».
- **Ahorros sin gasto típico todavía:** con liquidez positiva y ningún mes completo con gastos, no se puntúa el fondo de emergencia, pero se avisa con una sugerencia («Cuando completes un mes de gastos…») en vez de quedarse en un «Regular» mudo.
- **Mes en curso incompleto:** ningún criterio compara «gastado hasta hoy» contra un ingreso o gasto de mes completo (daba puntos regalados a principio de mes). El mes en curso solo se usa para decir que YA se pasó del ingreso, lo que no puede deshacerse con lo que falta del mes.
- **Liquidez negativa cubierta por CDT:** la deuda existe aunque haya CDTs: se avisa (−8, aviso) nombrando la deuda y que la diferencia está en CDTs; sin CDT que la cubra es alerta (−15).

---

## 7. Decisiones de diseño

- **El score nunca se persiste, siempre se recalcula:** mismo principio de "los movimientos son la fuente de verdad" aplicado a un indicador derivado — evita que el puntaje quede desactualizado si se borra o edita algo en otro módulo.
- **Rendimientos de Nu expuestos aparte, nunca sumados a ingresos:** los ratios de deuda/gasto necesitan medir flujo de caja real y disponible, no crecimiento de patrimonio (ni plata todavía bloqueada dentro de un CDT).
- **Reutiliza los mismos filtros de ingreso/gasto real que Análisis financiero**, en vez de tener su propio criterio: `_esEntradaEspejoNoIngreso()` para ingresos, y `_esGastoVarNoReal()` para gastos (`_esPagoTC`, `_esAlcancia`, `_esExtraPrestamo`, `esPagoGastoFijo`). Ambos helpers están centralizados en un solo lugar del código — no duplicados a mano en cada pantalla —, que fue precisamente el fix que resolvió los dos bugs de divergencia detectados entre esta tarjeta y Análisis financiero (ver `CHANGELOG.md`).
- **Liquidez con y sin CDTs separadas:** existir como dos variables (`liquidoReal` / `liquidoConCDTs`) en vez de una sola con un flag, para que cada factor del score pueda elegir explícitamente cuál necesita, sin ambigüedad.
- **Las reglas compartidas con «Necesita atención» viven en funciones, no en copias:** `_mesesCubiertos`, `_nivelRunway`, `_textoRunway` y `_rachaDeficitRelevante` (`inicio.js`) las usan tanto la Salud como Atención, para que ambas digan lo mismo.
- **Sin puntos por configurar la app:** un número de «salud financiera» que sube por tener 2 gastos fijos anotados premiaba el orden en la app, no el estado del dinero.
- **El runway («Cubres X meses de gastos») se muestra en la tarjeta:** es la cifra más útil en una crisis y el puntaje solo no la dice. Niveles en `UMBRALES.runway` (< 1 mes rojo, < 3 ámbar).

---

## 8. Referencia de implementación

| Función | Qué hace |
|---|---|
| `calcHealthScore()` | Calcula el puntaje 0-100, la lista de tips e `ingresosMes`/`rendimientoCDTMes`; devuelve `null` si no hay datos base (`!S.cajitas`) |
| `renderHealthScore()` | Pinta la tarjeta `#health-score-card`: anillo de progreso SVG, etiqueta (Excelente/Regular/Necesita atención), runway («Cubres X meses de gastos») y tips |
| `_mesesCubiertos()` / `_nivelRunway()` / `_textoRunway()` | Runway: cálculo, nivel (crítico / atención / ok según `UMBRALES.runway`) y texto |
| `_rachaDeficitRelevante()` | Meses seguidos de déficit que merecen aviso (comparte Salud y Atención); usa `Periodo.rachaDeficit()` |

**ID del DOM:** `health-score-card` (pantalla Inicio).

## Consejo de liquidez negativa según la causa

Cuando `liquidoReal < 0` el texto dice qué lo causó: solo tarjeta → «Tu deuda en tarjetas supera la plata que tienes disponible»; solo deudas con personas → «Lo que debes a personas supera la plata que tienes disponible»; mezcla o plata ajena → «Tus deudas y la plata ajena que guardas superan la plata que tienes disponible». Si los CDTs sin vencer cubren la diferencia, el consejo es un **aviso** (−8) y añade «lo que cubre la diferencia está en tus CDTs»; si no, una **alerta** (−15). («Patrimonio líquido» era jerga: ya no se usa en los textos.)

## Pilares con semáforo y estado de situación (2026-11-05)

Además del puntaje, la tarjeta muestra cuatro pilares (**Liquidez, Deuda, Flujo, Tendencia**) y un estado global de cinco niveles (**Creciendo, Estable, Atención, Presión, Crisis**). Todo se calcula en `js/core/salud.js` (puro) a partir de un único objeto de métricas que arma `_situacion()` en `inicio.js`; la misma `_situacion()` alimenta las reglas de «Necesita atención» (`js/core/reglas.js`).

- **Liquidez:** meses de gasto cubiertos con la liquidez neta (< 1 rojo, 1–3 ámbar, ≥ 3 verde; negativa = rojo).
- **Deuda:** `tcPropia + yoDebo` frente al ingreso típico (> 3× rojo, 1,5–3× ámbar) y frente a los activos líquidos (> 100 % rojo, > 50 % ámbar); manda el peor. **No cambia el puntaje** (criterio b sigue mirando solo la tarjeta, para no penalizar dos veces con la liquidez).
- **Flujo:** de los últimos 3 meses completos, 0 en déficit verde, 1 ámbar, 2+ rojo.
- **Tendencia:** patrimonio a 90 días sin depósitos ni retiros (`Salud.tendenciaPatrimonio`); necesita 30 días de historial.
- **Patrimonio cayendo N meses:** `Salud.mesesCayendo` cuenta los meses completos seguidos con el cierre mensual (`S.patrimonioCierres`) bajando, sin aperturas y descontando ruido; la regla `patrimonio-cayendo` avisa desde 2 (ámbar) y 3 (rojo) en «Necesita atención». No cambia el puntaje.
- **Estado:** crisis > presión > atención > creciendo > estable (reglas en el comentario de `Salud.estado`). Presión y crisis no celebran y proponen hasta 3 acciones con enlace. Patrimonio negativo nunca es «Creciendo».
- Límites en `UMBRALES.salud.pilares`; pruebas en `tests/finanzas.test.js`.

## Rediseño de la tarjeta y comportamiento sin historial (2026-11-06, SW v112)

- **Un solo estado.** La franja bajo el hero (`#inicio-franja-estado`) se eliminó: duplicaba el estado de la tarjeta, que además trae las acciones de presión/crisis. `calcEstadoSituacion()` sigue alimentando a Análisis y Wrapped.
- **«Base» para evaluar (`Salud.tieneBase`).** Hay base con una tendencia de patrimonio (≥ 30 días), con 2 meses completos con datos o con 1 mes completo y ≥ 30 días de uso (`UMBRALES.salud.historial`; `_situacion()` aporta `mesesReferencia` y `diasDeUso`). Sin base (`m.sinBase`) no se concluye nada de ahorro, flujo ni tendencia: el estado es **Empezando** (neutro) salvo que haya patrimonio negativo, liquidez negativa o crisis (hechos que no necesitan historial); la tarjeta no muestra puntaje ni pilares sin datos; el puntaje ignora gasto típico, racha y «por ahora gastas más» (`puntaje({ sinBase })`); el aviso «Gastas más de lo que ingresas» del hero tampoco aparece.
- **Falta de ingresos ≠ déficit.** `Periodo.balanceEvaluable(b)`: solo los meses con ingresos registrados cuentan como superávit/déficit (racha, `resumenFlujo`, pilar Flujo, estado, plan de deudas). Un saldo inicial no es ingreso.
- **Tres estados por indicador:** favorable (verde), desfavorable (ámbar/rojo) y sin evaluar (`sin`, gris). «Sin deudas propias» es favorable y nunca genera una recomendación de endeudarse.
- **Consejos.** Máximo 3, lo urgente primero. Se quitó «Registra las categorías» (es de Configuración) y el relleno genérico; «Registra tus ingresos» y «Cuando completes un mes de gastos» se unificaron en un consejo corto («Registra tus ingresos y gastos para una evaluación más precisa» / «Sigue registrando…» si ya hay ingresos). El CDT solo se sugiere con gasto típico medido, sin deudas y con ≥ 1 mes de gasto **por encima** del fondo mínimo, diciendo cuánto sobra (`UMBRALES.salud.cdtExcedenteMeses`).
- **Sin repetir cifras.** El runway («Cubres X meses») vive solo en el pilar Liquidez; se quitó la línea suelta sobre los consejos.
- **Destinos exactos (`irConsejo` → `_irADestino`).** `pantalla/detalle`: `cuentas/nu` (abre Nu), `prestamos/me-deben|yo-debo` (pestaña), `analisis/ingresos` (ingresos fijos), `tarjetas` cuando la deuda es solo de tarjeta.

**Ajuste (2026-11-06):** sin base y en estado «Empezando», la tarjeta es un solo bloque («Todavía no hay datos suficientes» + botón «Registrar ingresos/gastos»), sin el cuadro de estado, el puntaje ni pilares sin datos. El pilar **Deuda** no se muestra cuando no hay deudas propias («sin deudas» no es un dato que mostrar y podía leerse como una invitación a endeudarse). Sin base solo se muestran los pilares en ámbar o rojo.
