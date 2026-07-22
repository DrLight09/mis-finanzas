# Gastos

## 1. Objetivo

Registrar en qué se va la plata mes a mes, separando lo que es puntual (gasto variable: mercado, transporte, salidas) de lo que se repite todos los meses por el mismo monto (gasto fijo: arriendo, suscripciones, servicios). El módulo es también el punto de entrada para las compras hechas con tarjeta de crédito y para el pago de gastos fijos, aunque la lógica de fondo de esos dos casos vive en otros módulos (Tarjetas de Crédito y el propio historial de gasto variable).

## 2. Conceptos importantes

- **Gasto variable** — un movimiento de salida puntual, con fecha, monto, categoría y de qué cuenta salió. Es la unidad base de todo el módulo; hasta el pago de un gasto fijo termina siendo, por dentro, un gasto variable.
- **Gasto fijo** — una plantilla recurrente (nombre + monto + categoría) que **no** representa plata que ya salió. Solo se convierte en gasto real cuando el usuario lo "paga" explícitamente ese mes.
- **Pagar un gasto fijo** — acción distinta a "crear un gasto fijo": toma la plantilla, descuenta el monto de una cuenta elegida en ese momento, y dos cosas quedan registradas: el pago del mes (para no poder pagarlo dos veces) y un gasto variable espejo (para que aparezca en el historial y en los totales de caja del mes).
- **Compra en TC** — un gasto variable cuya fuente es una tarjeta de crédito. Aparece en el historial de Gastos porque el usuario quiere verlo ahí, pero no sale plata de ninguna cuenta — la deuda queda en la tarjeta.
- **Pago de TC** — lo inverso: cuando se paga una tarjeta de crédito (desde el módulo de Tarjetas), ese pago también aparece en el historial de Gastos como referencia, pero no es un gasto nuevo — ya se contó cuando se hizo la compra.
- **Gasto secundario** — un gasto variable generado automáticamente por *otra* sección de la app (por ejemplo, un encargo pagado con TC). Aparece en el historial de Gastos para que el usuario tenga la foto completa, pero pertenece a otra sección: no se edita ni se borra desde acá.
- **"Gasto real" del mes** — el subconjunto de gastos variables que sí representan plata que salió de una cuenta *este mes* y que no está ya contado en otro lado (ver regla 3.3). Es el número que alimenta salud financiera, presupuestos y el resumen de cierre de mes — no es simplemente "todo lo que hay en `gastosVar`".

## 3. Reglas que nunca deben romperse

1. **Un gasto fijo nunca descuenta plata solo, tiene que pagarse.** Crear un gasto fijo es crear una plantilla; el dinero no se mueve hasta que el usuario confirma el pago con una cuenta de origen.
2. **Pagar el mismo gasto fijo dos veces en el mismo mes calendario está prohibido.** Se valida contra el registro de pagos del mes antes de dejar avanzar el pago.
3. **Un gasto que ya está contado en otro lado nunca debe sumarse otra vez al "gasto real" del mes.** Esto aplica a: el gasto espejo de un fijo ya pagado, un pago de TC (la compra ya se contó), un movimiento de alcancía, y el extra de un préstamo. La decisión de qué excluir está centralizada en un solo lugar (no se copia el filtro a mano en cada pantalla) — precisamente porque ya pasó más de una vez que un filtro se corrigiera en una pantalla y se quedara desactualizado en otra.
4. **Una compra en TC nunca descuenta saldo de una cuenta.** La plata "sale" de la tarjeta (aumenta su deuda), no de Nu/Nequi/Efectivo/cuenta personalizada.
5. **Eliminar un gasto siempre revierte su efecto, nunca lo borra a secas.** Según el tipo: se devuelve el saldo a la cuenta de origen, o se revierte la compra/pago en la tarjeta correspondiente, o se desmarca el pago del gasto fijo del mes — para que se pueda volver a pagar. Un gasto nunca desaparece dejando saldos o estados a medias.
6. **Un gasto secundario (generado desde otra sección) no se elimina desde Gastos.** Se muestra pero se bloquea su borrado acá, con un mensaje que manda al usuario a la sección de origen — de lo contrario la sección de origen queda con un registro huérfano.
7. **El gasto fijo virtual de Spotify nunca se guarda como dato.** Se calcula al vuelo cada vez que se renderiza la lista, y solo aparece si no hay ya un gasto fijo real de Spotify, no se pagó ya este mes, y el módulo Spotify no está manejando el costo por su cuenta (para no duplicarlo).

## 4. Modelo de datos

### `S.gastosVar[]` — historial de gasto variable (incluye compras/pagos de TC y pagos de fijos)

```js
{
  id: 'uuid',
  desc: 'Mercado',
  monto: 85000,
  fecha: '2026-07-20',      // YYYY-MM-DD
  cat: 'Alimentación',
  fuente: 'cajita:xxx',     // o 'nequi' | 'efectivo' | 'custom:xxx' | 'tc:xxx'
  nota: 'opcional',

  // Solo si nació de pagar un gasto fijo:
  esPagoGastoFijo: true,
  gastoFijoId: 'uuid-del-fijo',

  // Solo si la fuente fue una tarjeta de crédito (compra):
  _esCompraTC: true,
  _tcId: 'uuid-tarjeta',
  _tcCompraId: 'uuid-compra-en-tc',

  // Solo si es el reflejo de un pago de TC (viene del módulo Tarjetas):
  _esPagoTC: true,
  _tcPagoId: 'uuid-pago-en-tc',

  // Solo si lo generó otra sección (encargos, préstamos, etc.):
  _secundario: true,
  _origenSeccion: 'Encargos',
}
```

- `fuente` — de dónde salió (o a qué tarjeta se cargó) la plata. Determina si el gasto descuenta una cuenta real o solo aumenta deuda de TC.
- `esPagoGastoFijo` / `gastoFijoId` — presentes solo en el gasto espejo que crea `confirmarPagarGastoFijo()`. `gastoFijoId` es lo que permite, al eliminarlo, desmarcar el pago del mes correspondiente.
- `_esCompraTC` / `_tcId` / `_tcCompraId` — presentes solo si la fuente era `tc:...`. `_tcCompraId` es el vínculo con el registro real de la compra dentro de la tarjeta (necesario para poder revertirla ahí sin duplicar lógica).
- `_esPagoTC` / `_tcPagoId` — igual que el anterior pero para pagos de tarjeta, no compras.
- `_secundario` / `_origenSeccion` — si están presentes, el gasto es de solo lectura desde acá (regla 3.6).

### `S.gastosFijos[]` — plantillas de gasto recurrente

```js
{ id: 'uuid', nombre: 'Arriendo', monto: 900000, cat: 'Vivienda' }
```

No tiene campo de "pagado" — eso vive aparte, en `S.pagosGastosFijos`, precisamente para poder tener un estado de pago distinto cada mes sin duplicar la plantilla.

### `S.pagosGastosFijos{}` — registro de qué se pagó cada mes

```js
{
  'uuid-del-fijo_2026-07': { fecha: '2026-07-05', fuente: 'nequi', monto: 900000 }
}
```

La clave combina el id del gasto fijo con el mes (`YYYY-MM`) — así un mismo gasto fijo puede tener (o no) un pago independiente cada mes, y "¿ya se pagó este mes?" es una sola consulta directa en vez de recorrer todo el historial de gasto variable.

## 5. Flujo

**Registrar un gasto variable (cuenta normal):**
Formulario → validar descripción/monto/fuente → validar saldo suficiente en la cuenta → descontar la cuenta → guardar en `gastosVar` → refrescar UI.

**Registrar un gasto variable con TC:**
Formulario (fuente = tarjeta) → validar cupo disponible → `tcCrearCompra()` en el módulo de Tarjetas → guardar en `gastosVar` con `_esCompraTC` y el id de la compra real → **no** se toca el saldo de ninguna cuenta.

**Pagar un gasto fijo:**
Elegir "Pagar" en la plantilla → elegir cuenta de pago → validar que no esté ya pagado este mes y que haya saldo → descontar la cuenta → crear gasto variable espejo (`esPagoGastoFijo:true`) → marcar `pagosGastosFijos[id_mes]`.

**Eliminar un gasto:**
→ Si es secundario: bloquear y avisar que se borra desde la sección de origen.
→ Si es compra en TC: revertir la compra en la tarjeta (`tcEliminarCompraInterna`).
→ Si es pago de TC: revertir el pago en la tarjeta y devolver esa plata a la cuenta que la pagó.
→ Si es un gasto normal (incluye el espejo de un fijo pagado): devolver el monto a la cuenta de origen, y si además era el espejo de un fijo, desmarcar su pago del mes.
→ En todos los casos: sacarlo de `gastosVar`, guardar, refrescar.

## 6. Casos especiales

- **Filtro de mes en "todos":** el total mostrado es sobre todo el historial, no solo el mes actual; el botón de estado vacío cambia de texto según haya o no un mes específico elegido.
- **Gasto fijo sin pagar vs. pagado este mes:** la plantilla siempre aparece en la lista de Fijos; lo que cambia es si se ve el botón "Pagar" o la etiqueta "Pagado" con su fecha — nunca desaparece de la lista por estar pagada.
- **Spotify como fijo virtual:** solo se muestra si (a) hay un costo de Spotify configurado, (b) no existe ya un gasto fijo real con "spotify" en el nombre, (c) no se pagó ya este mes vía un gasto variable con "spotify" en la descripción, y (d) el módulo Spotify no está activo gestionando su propio costo. Si se cumplen las cuatro, se inyecta en la lista sin persistirse en `S.gastosFijos`.
- **Datos viejos sin los flags nuevos** (`_esCompraTC`, `_esPagoTC`, etc.): al no tener el flag, `_esGastoVarNoReal()` los trata como gasto real normal — no rompe nada, simplemente no aplica la exclusión que no les corresponde.

## 7. Decisiones de diseño

- **¿Por qué pagar un gasto fijo crea un gasto variable en vez de solo marcarlo "pagado"?** Para que el historial de la cuenta y los totales de caja del mes salgan de un único lugar (`gastosVar`) sin tener que sumar dos fuentes distintas en cada pantalla que reporta gastos. El costo es que hay que excluirlo explícitamente al calcular "gasto variable puro" (ver regla 3.3) — se aceptó ese costo a cambio de no duplicar la lógica de reportes.
- **¿Por qué las compras y pagos de TC aparecen en el historial de Gastos si no son "gasto real" del mes?** Porque el usuario quiere ver todo lo que gastó en un solo timeline, sin importar con qué plata lo pagó. Separar totales (real vs. TC) permite mostrar ambos sin que se mezclen ni se dupliquen.
- **¿Por qué eliminar un gasto revierte en vez de simplemente borrar el registro?** Para que el saldo de cuentas y tarjetas nunca quede desincronizado del historial visible — la alternativa (borrar y dejar que el usuario ajuste el saldo a mano) es la fuente más común de descuadres en una app de finanzas personales.
- **¿Por qué el gasto fijo virtual de Spotify no se guarda como un gasto fijo real?** Porque su costo y su estado ya se gestionan enteramente en el módulo Spotify cuando está activo; mostrarlo también acá es solo una ayuda visual para quien no activó ese módulo, no una segunda fuente de verdad.
- **¿Por qué el módulo quedó en un solo archivo (`gastos.js`) en vez de dividirse como Spotify o Encargos?** Porque ninguna de sus funciones depende de código definido más abajo en `index.html` al momento de cargar el script — a diferencia de Spotify/Encargos, que necesitan que Personas ya exista.

## 8. Referencia de implementación

Archivo: `js/modules/gastos.js`.

| Función | Qué hace |
|---|---|
| `switchGastoTab(t)` | Cambia entre la pestaña "Gastos" (variable) y "Fijos mensuales". |
| `renderMesFiltros()` | Arma los chips de filtro por mes y dispara `renderGastosVar()`. |
| `setMesFiltro(m)` | Cambia el mes filtrado y vuelve a renderizar. |
| `renderGastosVar()` | Pinta el historial de gasto variable, separado en secciones (variables puros, compras TC, pagos TC, pagos de fijos) con sus totales. |
| `addGastoVar()` | Valida y crea un gasto variable; si la fuente es TC, delega en `tcCrearCompra()`. |
| `deleteGastoVar(id)` | Elimina un gasto revirtiendo su efecto según el tipo (ver §5). |
| `abrirNuevoGastoVar()` | Pobla categorías y abre el sheet de gasto variable — usada por el estado vacío. |
| `renderGastosFijos()` | Pinta la lista de plantillas de gasto fijo, incluyendo el virtual de Spotify si aplica. |
| `addGastoFijo()` | Crea una nueva plantilla de gasto fijo. |
| `deleteGastoFijo(id)` | Elimina una plantilla y limpia su historial de pagos. |
| `abrirNuevoGastoFijo()` | Pobla categorías y abre el sheet de gasto fijo — usada por el estado vacío. |
| `abrirPagarGastoFijo(id)` | Abre el sheet de pago con los datos de la plantilla. |
| `pgfActualizarSaldo()` | Muestra el saldo disponible de la cuenta elegida para el pago. |
| `confirmarPagarGastoFijo()` | Valida, descuenta la cuenta, crea el gasto espejo y marca el pago del mes. |

Funciones núcleo de las que depende (definidas en `index.html`, compartidas con otras secciones): `escHtml`, `toast`, `save`, `refresh`, `openSheet`, `closeSheet`, `dialogo`, `uid`, `hoy`, `mesActual`, `mesKey`, `parseMoney`, `fmtInput`, `getSaldoFuente`, `getSaldoActual`, `getFuentes`, `fuenteLabel`, `fuenteBadgeClass`, `descontarFuente`, `sumarFuente`, `poblarCatSelect`, `getCatsVar`, `getCatsFijo`, `emptyState`, `logCambio`, `Events`. También depende de tres funciones del módulo de Tarjetas de Crédito (`tcCrearCompra`, `tcEliminarCompraInterna`, `tcEliminarPagoInterna`), y dos helpers compartidos con el resto de la app que **no** viven en este archivo porque se usan fuera de Gastos: `gastosMes()` y `_esGastoVarNoReal()` (ambos en `index.html`, usados también por Análisis y el dashboard de inicio).

IDs de sheets/inputs relevantes: `sheet-gasto-var` (`gv_desc`, `gv_monto`, `gv_fecha`, `gv_cat`, `gv_fuente`, `gv_nota`), `sheet-gasto-fijo` (`gf_n`, `gf_m`, `gf_c`), `sheet-pagar-gasto-fijo` (`pgf-title`, `pgf-monto`, `pgf-cat-badge`, `pgf-fuente`, `pgf-fecha`, `pgf-nota`, `pgf-error`).
