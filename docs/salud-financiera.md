# Salud financiera

Documentación de la tarjeta **Salud financiera** (`health-score-card`, pantalla Inicio) de `mis-finanzas` (`index.html`). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos usa y cómo fluye el cálculo. Los detalles de implementación (funciones, ids de DOM) aparecen al final, como referencia rápida.

El historial de bugs corregidos vive en [`CHANGELOG.md`](./CHANGELOG.md#salud-financiera), no acá.

---

## 1. Objetivo

Da un puntaje único de 0 a 100 que resume qué tan sana está la situación financiera actual — combinando liquidez disponible, deuda de tarjetas de crédito, plata prestada a otros, disciplina de gasto y ahorro estructurado — para tener una sola cifra de referencia en Inicio sin tener que revisar cada módulo por separado.

---

## 2. Conceptos importantes

- **Score base:** arranca en 50 (neutro) y sube o baja según siete factores independientes (a–g, ver §5), y al final se recorta al rango [0, 100].
- **Liquidez real (`liquidoReal`):** solo cuentas disponibles de inmediato — Nequi, efectivo, cajitas (sin CDTs) y cuentas personalizadas — restando la deuda de TC y la plata de encargos (ajena) guardada en esas cuentas. No incluye CDTs, porque están bloqueados y no sirven para una emergencia.
- **Liquidez con CDTs (`liquidoConCDTs`):** `liquidoReal` + el valor de los CDTs. Se usa solo para distinguir "no tengo nada disponible" de "tengo algo, pero está todo bloqueado".
- **Ingresos del mes (`ingresosMes`):** mesada + ingresos de cuentas personalizadas + entradas reales a Nequi/Efectivo/cajitas + ingresos fijos configurados — excluyendo siempre movimientos espejo (`_esEntradaEspejoNoIngreso()`, ver `analisis-financiero.md`).
- **Gastos del mes (`gastosMes`):** gastos variables reales (vía `_esGastoVarNoReal()`: excluye pagos de gasto fijo, pagos de TC, alcancía y extras de préstamo gastados de inmediato) + gastos fijos pagados ese mes. Mismo criterio que "Gastos totales" en Análisis financiero.
- **`tieneAlgo`:** hay datos suficientes para evaluar (patrimonio, plata prestada, deuda TC o gasto del mes > 0). Si no, la tarjeta no muestra un score — evita mostrar un 50 o un 0 engañoso por falta de datos.

---

## 3. Reglas que nunca deben romperse

- **El criterio de "qué es un ingreso o gasto real" debe coincidir siempre con Análisis financiero.** Se comparten dos helpers centralizados (`_esEntradaEspejoNoIngreso()` para ingresos, `_esGastoVarNoReal()` para gastos, documentados en `analisis-financiero.md#9bis`) precisamente porque ya pasó dos veces que la misma exclusión se corrigiera en una pantalla y no en la otra por estar duplicada a mano. Cualquier exclusión nueva se agrega en esos helpers, nunca copiada directamente en `calcHealthScore()`.
- **Un CDT nunca cuenta como liquidez disponible para el fondo de emergencia**, aunque sí cuenta en el patrimonio general y en `liquidoConCDTs`. Está bloqueado, no sirve para una emergencia inmediata.
- **El rendimiento generado por un CDT en el mes nunca se suma a `ingresosMes`.** Es plata que el patrimonio ya ganó, pero sigue atrapada dentro del CDT — no es flujo de caja real disponible, que es lo que miden los ratios de deuda y gasto.
- **El score siempre se recorta entre 0 y 100** antes de mostrarse.
- **El puntaje nunca se persiste en `S`.** Se recalcula desde cero en cada render, para que nunca quede desactualizado respecto a los datos reales de los demás módulos.

---

## 4. Modelo de datos

No mantiene estado propio en `S` — se recalcula íntegramente en cada llamado a `calcHealthScore()`, leyendo datos de otros módulos (`S.cajitas`, `S.gastosVar`, `S.gastosFijos`, `S.mesadas`, `S.cuentasPersonalizadas`, `S.movimientos`, `S.tarjetasCredito`).

```js
// Valor de retorno de calcHealthScore()
{
  score: 78,               // 0-100, ya recortado
  tips: ["..."],           // mensajes de mejora o felicitación, uno por cada factor con penalización/bonus destacable
  ingresosMes: 450000,
  rendimientoCDTMes: 1200  // informativo — no afecta el score, ver §3
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
a) Fondo de emergencia: liquidoReal / gastosMes           → +20 / +10 / −5 / −8 / −15
b) Deuda TC vs ingresos (o vs patrimonio si no hay ingresos) → +5 / −8 / −15 / −10
c) Plata prestada a otros vs liquidoReal                   → −8 / −13 / −15 / −18
d) Ratio gastos/ingresos (disciplina de gasto)              → +10 / +5 / −10
e) CDTs activos (bonus reducido si hay mucho prestado sin cobrar) → +3 / +10
f) Gastos fijos configurados (≥2)                           → +5
g) Categorías diversificadas en gastos variables             → −5 si solo hay una
  ↓
score recortado a [0, 100]
  ↓
Si ninguna de las reglas anteriores generó un tip, se agrega uno genérico según el rango del score
```

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
- **Deuda de TC sin ingresos registrados ese mes:** en vez de no evaluar nada, compara la deuda contra el patrimonio total como respaldo (con manejo explícito del caso `patrimonio <= 0`).
- **Toda la liquidez está prestada** (`liquidoReal <= 0` y `prest > 0`): caso crítico marcado aparte con `ratioPrest = Infinity`, para que el bonus de CDTs (factor e) también se reduzca automáticamente sin tener que repetir la condición.
- **Mucho dinero prestado sin cobrar + CDTs activos:** el bonus de tener CDTs baja de +10 a +3 — tener ahorro estructurado no compensa igual si al mismo tiempo hay mucho riesgo de no cobrar lo prestado.
- **Solo gastos fijos, sin gastos variables este mes:** el factor (g) de "categorías diversificadas" no penaliza — solo se evalúa si `gvMes > 0`.

---

## 7. Decisiones de diseño

- **El score nunca se persiste, siempre se recalcula:** mismo principio de "los movimientos son la fuente de verdad" aplicado a un indicador derivado — evita que el puntaje quede desactualizado si se borra o edita algo en otro módulo.
- **Rendimiento de CDT expuesto aparte, nunca sumado a ingresos:** los ratios de deuda/gasto necesitan medir flujo de caja real y disponible, no crecimiento de patrimonio todavía bloqueado dentro de un CDT.
- **Reutiliza los mismos filtros de ingreso/gasto real que Análisis financiero**, en vez de tener su propio criterio: `_esEntradaEspejoNoIngreso()` para ingresos, y `_esGastoVarNoReal()` para gastos (`_esPagoTC`, `_esAlcancia`, `_esExtraPrestamo`, `esPagoGastoFijo`). Ambos helpers están centralizados en un solo lugar del código — no duplicados a mano en cada pantalla —, que fue precisamente el fix que resolvió los dos bugs de divergencia detectados entre esta tarjeta y Análisis financiero (ver `CHANGELOG.md`).
- **Liquidez con y sin CDTs separadas:** existir como dos variables (`liquidoReal` / `liquidoConCDTs`) en vez de una sola con un flag, para que cada factor del score pueda elegir explícitamente cuál necesita, sin ambigüedad.

---

## 8. Referencia de implementación

| Función | Qué hace |
|---|---|
| `calcHealthScore()` | Calcula el puntaje 0-100, la lista de tips e `ingresosMes`/`rendimientoCDTMes`; devuelve `null` si no hay datos base (`!S.cajitas`) |
| `renderHealthScore()` | Pinta la tarjeta `#health-score-card`: anillo de progreso SVG, etiqueta (Excelente/Regular/Necesita atención) y tips |

**ID del DOM:** `health-score-card` (pantalla Inicio).
