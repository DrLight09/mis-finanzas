# Módulo Inicio (Dashboard)

Documenta la pantalla `#screen-inicio` y su código en `js/modules/inicio.js`. A diferencia del resto de los módulos documentados (`cuentas.md`, `mesada.md`, `spotify.md`, `prestado.md`, `encargos.md`, `personas.md`), Inicio **no tiene sheets propios** — es una pantalla de solo lectura que resume el estado de los demás módulos. Por eso este documento no sigue el inventario de [`guia-estilo-sheets.md`](./guia-estilo-sheets.md); esa guía sigue siendo la referencia si Inicio llegara a necesitar un sheet en el futuro.

> Los cambios puntuales de la sesión en que se migró este módulo no viven acá — ver [`CHANGELOG.md`](./CHANGELOG.md#inicio) y [`auditoria-tecnica.md`](./auditoria-tecnica.md) (nota del 2026-07-22).

---

## 1. Qué es

Inicio es la pantalla que se ve al abrir la app: un resumen agregado de patrimonio, disponibilidad por cuenta, gastos del mes, salud financiera, proyección y alertas ("Necesita atención"). No registra movimientos ni abre sheets — solo lee y muestra datos que otros módulos ya calcularon o guardaron en `S`.

## 2. Elementos de la pantalla (`#screen-inicio`)

| Elemento (id) | Contenido |
|---|---|
| `#heroTotal` | Patrimonio total visible (excluye la alcancía oculta, ver `guia-estilo-sheets.md#alcancía`) |
| `#hero-patrimonio-label` | "Patrimonio total" o "Patrimonio visible" (cambia si hay alcancía activa) |
| `#hero-alcancia-indicator` | Pill ámbar "+$?? en alcancía oculta" — visible solo si `S.alcancia.saldoRegistrado > 0` |
| `#hero-change-indicator` | Aviso "Gastos altos" cuando el gasto del mes supera el 80% de lo disponible |
| `#s-disp`, `#s-nu`, `#s-ef`, `#s-nequi`, `#s-prest`, `#s-cdt` | Grid de saldos por cuenta |
| `#s-gf`, `#s-gv`, `#s-gtotal` | Gastos del mes: fijos, variables, total |
| `#tc-deuda-card` | Card de deuda TC (oculto si no hay tarjetas) |
| `#health-score-card` | Anillo + tips de salud financiera |
| `#proyeccion-card` | Tendencia mensual + proyección a 3/6/12 meses |
| `#s-attn-section` / `#s-attn-list` | Sección colapsable "Necesita atención" |

Ninguno de estos elementos tiene `onclick` inline — son de solo lectura, salvo el toggle de la sección "Necesita atención" (ver punto 4) y los tooltips de Proyección (ya usaban `addEventListener`, no requirieron migración).

## 3. Funciones (`js/modules/inicio.js`)

**`renderAttencion()`** — arma la lista de alertas ("Necesita atención") a partir de: deudores con saldo pendiente, mesadas con pago parcial, tarjetas con cupo casi agotado o agotado, cobros de Spotify vencidos, y CDTs por vencer o vencidos. Controla también el estado abierto/cerrado de la sección (persistido en `sessionStorage`, con detección de items nuevos vía fingerprint).

**`calcHealthScore()`** — calcula el puntaje de salud financiera (0-100) a partir de: fondo de emergencia (liquidez vs gastos mensuales), ratio de deuda TC vs ingresos, plata prestada a otros vs liquidez, ratio gastos/ingresos, CDTs activos, gastos fijos configurados, y diversidad de categorías de gasto. Devuelve `{ score, tips, ingresosMes, rendimientoCDTMes }`.

**`renderHealthScore()`** — pinta el anillo SVG y los tips de `calcHealthScore()` en `#health-score-card`.

**`renderProyeccion()`** — calcula la tendencia mensual de patrimonio (trimmed mean sobre los últimos 90 días de `S.patrimonioHistorial`, con mínimo de 7 días reales para no extrapolar de un solo movimiento grande) y proyecta a 3/6/12 meses en `#proyeccion-card`. Incluye tooltips táctiles con el detalle de cada proyección.

**`_checkGastoAlto()`** — revisa si el gasto del mes supera el 80% de lo disponible (Nu + Nequi + Efectivo) y muestra/oculta el aviso en `#hero-change-indicator`. Se engancha a `refresh()` mediante monkey-patch al cargar el módulo.

**IIFE de reposicionamiento** — mueve `#s-attn-section` justo debajo del `.hero` de Inicio al cargar el módulo (antes vivía más abajo en el DOM estático).

## 4. Qué NO vive en `inicio.js` (a propósito)

| Código | Por qué se quedó en `index.html` |
|---|---|
| `refresh()` | Orquestador central compartido por las 13 pantallas — no es lógica de Inicio, aunque escribe varios de sus elementos (`#heroTotal`, `#s-disp`, etc.) |
| `_renderMejoras()` / `_hookRefreshMejoras()` | Además de llamar a `renderHealthScore()`/`renderProyeccion()`, dispara `renderPresupuestos()` (módulo de Análisis) — infraestructura compartida entre dos módulos |
| Selectores de cuenta (`#nuTotalDisp`, `#sel-nequi-saldo`, etc.) | Se actualizan dentro de `refresh()` junto con los de Inicio porque comparten las mismas variables calculadas (`nu`, `nequi`, `ef`), pero pertenecen a la pantalla Cuentas, no a Inicio |

## 5. Seguridad — hallazgos de esta migración

- **`onclick` inline:** ninguno. `screen-inicio` es de solo lectura.
- **`.innerHTML` sin escapar:** un caso — `spNombreDe(p)` (nombre de persona en Spotify) se interpolaba sin `escHtml()` en `renderAttencion()`. Corregido. Es la sexta vez que aparece este mismo patrón (texto libre envuelto en una función auxiliar) desde que empezó la auditoría — ver `auditoria-tecnica.md#2`.
- El resto de `renderAttencion()`, `renderHealthScore()` y `renderProyeccion()` se revisó a mano contra el mismo patrón: solo interpolan números calculados, strings fijos, o valores que ya pasaban por `escHtml()`/`fmt()`.

## 6. Dependencias de carga

`js/modules/inicio.js` debe cargarse **después** de: `js/core/events.js`, `mesada.js`, `spotify.js`, `prestado.js` y `tarjetas_credito.js` — `renderAttencion()` usa `getMesadaData()`, `spNombreDe()`, `spPersonaPagadaVigente()` y `tcCupoUsadoPct()`, definidas en esos módulos. Por eso su `<script src>` va al final de `index.html`, después de `alcancia.js`.
