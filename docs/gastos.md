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
7. **Gastos fijos = solo lo que el usuario creó.** Ya no existe la fila «virtual» de Spotify Premium: el pago del plan lo registra el módulo Spotify como gasto variable (con la marca `_origenSeccion:'Spotify'`) y ese gasto cuenta completo en el balance del mes, esté el módulo activo o no. Si quieres verlo también como plantilla recurrente, créalo tú como gasto fijo.

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
  grande: true,             // opcional: true = «compra grande» (la marcó el usuario), false = «no lo es» (decisión del usuario); ausente = sin decisión (se detecta sola), ver «Compra grande»

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

- **Orden del array = orden de creación.** `S.gastosVar` solo crece con `push` (nadie hace `unshift`/`sort` sobre él), así que la posición de un gasto en el array dice cuál se registró primero. El historial de Gastos lo usa para desempatar gastos del mismo día (el último registrado arriba); no hay campo de timestamp aparte. Si algún día algo reordena el array, el desempate se rompe en silencio.
- `fuente` — de dónde salió (o a qué tarjeta se cargó) la plata. Determina si el gasto descuenta una cuenta real o solo aumenta deuda de TC.
- `esPagoGastoFijo` / `gastoFijoId` — presentes solo en el gasto espejo que crea `confirmarPagarGastoFijo()`. `gastoFijoId` es lo que permite, al eliminarlo, desmarcar el pago del mes correspondiente.
- `_esCompraTC` / `_tcId` / `_tcCompraId` — presentes solo si la fuente era `tc:...`. `_tcCompraId` es el vínculo con el registro real de la compra dentro de la tarjeta (necesario para poder revertirla ahí sin duplicar lógica).
- `_esPagoTC` / `_tcPagoId` — igual que el anterior pero para pagos de tarjeta, no compras.
- `_secundario` / `_origenSeccion` — si están presentes, el gasto es de solo lectura desde acá (regla 3.6).

### `S.gastosFijos[]` — plantillas de gasto recurrente

```js
{ id: 'uuid', nombre: 'Arriendo', monto: 900000, cat: 'Vivienda', dia: 5 }   // dia: opcional, entero 1–31
```

`dia` (opcional) es el **día de vencimiento**: con él la app avisa y muestra el estado en la lista; sin él no inventa ningún vencimiento. Un «31» vence el último día de un mes corto (`Periodo.gastosFijosProgramados`). Se escribe en el campo «Día de vencimiento» de «Gasto fijo mensual»; vacío = sin aviso; un valor fuera de 1–31 se rechaza al guardar.

**Qué hace el día:** (1) en la lista, un texto «Vence el día 5» / «Vence en 2 días» (ámbar desde 3 días, `UMBRALES.atencion.gastoFijoAvisoDias`) / «Vence hoy» / «Venció hace N días» (rojo) mientras no esté pagado ese mes; (2) en «Necesita atención» de Inicio: el aviso de cada uno y la **brecha de caja**: el **calendario de caja** de 30 días (gastos fijos que salen, ingresos fijos y CDT que entran; ver `docs/proyeccion-financiera.md`) avisa el día exacto en que tu plata disponible quedaría en negativo y qué lo causa. **Editar:** el botón «Editar» de cada fila abre el mismo sheet con los datos cargados (`abrirEditarGastoFijo`; título «Editar gasto fijo»): sirve para ponerle o cambiarle el día, el monto o la categoría sin borrarlo. Conserva el `id`, así que los pagos de meses anteriores (`pagosGastosFijos`, que guardan su propio monto) no se tocan; dejar el día vacío lo quita. No cambia ningún saldo ni la regla de que un gasto fijo solo se convierte en gasto real al pagarlo.

No tiene campo de "pagado" — eso vive aparte, en `S.pagosGastosFijos`, precisamente para poder tener un estado de pago distinto cada mes sin duplicar la plantilla.

### Compra grande (`gv.grande`) — un golpe real que no es un hábito

Una moto o un computador son un **golpe real** al patrimonio y a la liquidez, pero **no un hábito**. Una compra grande no se oculta de nada que mida lo que **tienes**, y sí se separa de lo que mide cómo **gastas cada mes**:

| Medida | ¿Cuenta la compra grande? |
|---|---|
| Patrimonio, liquidez (`calcLiquidez`), «meses que cubres» (runway), Salud (a, b, c), gasto real del mes (`gastosDelMes.total`), balance real | **Sí, completa** |
| Gasto **típico** (`Periodo.gastoPromedioPrevio`), ratio gasto/ingreso (d), racha de déficit (h, balance recurrente), pendiente de la Proyección | **No** (es flujo, y una moto no se repite) |

Así, comprar una moto de 15 M con 20 M de ahorro deja el runway en 5 meses (el golpe es real), pero no convierte «gastas 16 M al mes» en el ritmo de los próximos meses, ni dispara «llevas 2 meses seguidos en déficit», ni deja la Proyección en «estimación» para siempre.

**Quién decide: tú mandas, y si no dices nada, la app lo detecta.** `Periodo.compraGrandeEstado(g, umbral)` devuelve `'si'`, `'auto'` o `'no'`:

- `g.grande === true` → **sí**: la marcaste tú (casilla del formulario o botón de la fila).
- `g.grande === false` → **no**: dijiste que no lo es. Se respeta siempre, aunque sea una moto, y no cambia sola.
- sin decisión → **auto** si el gasto supera lo que normalmente gastas en **un mes entero** (`Periodo.umbralCompraGrande()`: la **mediana** del gasto mensual de los meses completos anteriores, mínimo 500.000, y al menos 2 meses de historia; con menos no se detecta sola). La mediana y no el promedio es a propósito: una moto no la mueve, y el umbral depende solo del pasado, no de cuánto tienes hoy, así que una compra no pasa de «normal» a «grande» con el tiempo. Los retiros manuales («Restar dinero») no se detectan solos: no son una compra.

Por qué detectar sola y no solo sugerir: una marca que depende de acordarse falla justo cuando importa (la moto sin marcar volvía a leerse como hábito), y el formulario solo cubre lo registrado desde ahí, no las compras con tarjeta ni lo anterior. Es visible (etiqueta «Compra grande · automática») y reversible (botón «No es compra grande»).

- **Antes de guardar:** al escribir el monto (desde 500.000), el formulario muestra el impacto (`calcImpactoCompra`, `inicio.js`): «Es el 75 % de tu plata disponible y el 60 % de tu patrimonio. Después cubrirías 5,0 meses de gastos (hoy: 20,0 meses)». En ámbar bajo 3 meses y en rojo bajo 1 mes, o si con eso tus deudas superarían tu plata disponible. Pagar con tarjeta pesa igual (la deuda propia resta de la liquidez neta). Si el gasto es ≥ 30 % de lo disponible o ≥ 2 meses de gasto típico (`UMBRALES.compraGrande`), la casilla se **marca sola**; si la cambias a mano, ya no se toca. Al guardar, la decisión de la casilla queda **explícita** (`true`; o `false` si no la marcaste en un gasto desde 500.000), para que la detección no te la cambie después.
- **Después:** `toggleCompraGrande(id)` corrige un gasto ya registrado (la moto de hace dos semanas): si contaba como grande pasa a «no» y si no, a «sí»; siempre guarda una decisión explícita. Es una propiedad del propio gasto: no guarda estado aparte, todo se recalcula solo.
- **Dónde se ve:** etiqueta en la lista; en Análisis, «Incluye $X en una compra grande (Moto) · sin ella, tu balance del mes fue +$Y» (el balance real, que decide el color, no cambia); en la Proyección, «Sin contar tu compra grande (Moto: $X), tu ritmo es +$Y al mes. Ya está descontada de tu patrimonio de hoy; la proyección no la repite»; en Salud, si dejó las reservas bajas, «Tu compra grande reciente (Moto, $X) pesa en tus reservas: antes de otro gasto grande, reconstruir tu fondo es la prioridad».
- Los gastos fijos no se marcan (ya son recurrentes por definición). Una compra grande suele ser un **bien** (una moto vale algo): se registra aparte con «Registrar como bien», ver `S.bienes[]` abajo.

### `S.bienes[]` — activos no líquidos (una moto, un computador)

```js
{ id: 'uuid', nombre: 'Moto', valor: 14000000, fecha: '2026-10-20', depreciacionAnual: 15, origenGastoId: 'uuid-del-gasto' }
//                              ↑ lo que vale en `fecha`    ↑ % al año (opcional)  ↑ opcional: el gasto con el que se compró
```

Una moto de 15 M no «desaparece»: vale algo, aunque se deprecie. Pero **va aparte, a propósito**:

- El **patrimonio financiero** (hero de Inicio, historial, Proyección, Salud) sigue siendo lo que te protege en una emergencia. Meter el bien adentro escondería el golpe de la compra justo cuando más importa verlo.
- Un bien **nunca entra en la liquidez ni en el runway** (`calcLiquidez` no los mira): no se pueden gastar sin venderlos. Salud tampoco los mira (una prueba lo fija: con y sin bienes, el resultado de Salud es idéntico).
- El valor es una **estimación del usuario**: la app no sabe lo que vale tu moto. `valor` es lo que vale en `fecha`; con `depreciacionAnual` (% al año, **compuesto**: 10 M al 10 % anual valen 8,1 M tras 2 años, no 8) baja desde esa fecha (`calcValorBien`). Para revaluarlo se edita el valor y la fecha. Una fecha futura no lo revaloriza, y una ilegible no produce `NaN`.
- **Dónde:** el botón «Registrar como bien» aparece en la fila de un gasto que es una compra grande (marcada o detectada) y abre el sheet con nombre, monto y fecha del gasto ya cargados (`abrirSheetBien(idGasto)`); el bien guarda `origenGastoId` y la fila pasa a decir «Bien registrado». Borrar el bien **no** toca el gasto. En **Análisis**, una tarjeta «Bienes» (solo si hay) muestra el valor estimado, el «Patrimonio con bienes» (`calcPatrimonioConBienes` = patrimonio financiero + bienes, **solo para mostrar aparte**) y cada bien con Editar y Quitar.
- `S.bienes` viaja a la nube y a los respaldos con el resto del estado; el import rechaza un respaldo donde `bienes` no sea un array; el cierre de períodos lo clasifica como `estado-actual`.

### `S.pagosGastosFijos{}` — registro de qué se pagó cada mes

```js
{
  'uuid-del-fijo_2026-07': { fecha: '2026-07-05', fuente: 'nequi', monto: 900000 }
}
```

La clave combina el id del gasto fijo con el mes (`YYYY-MM`) — así un mismo gasto fijo puede tener (o no) un pago independiente cada mes, y "¿ya se pagó este mes?" es una sola consulta directa en vez de recorrer todo el historial de gasto variable.

### Clase de los movimientos (2026-10-09)

Desde 2026-10-09 todo movimiento de ingreso/gasto lleva `clase` (`ingreso` · `gasto` · `neutro` · `ajuste`), escrita al crearlo, y los totales del mes (`Periodo`) la leen en vez de deducirla de etiquetas. Ver `libro-de-movimientos.md` (el libro no clasifica: lo hace `clase`) y `CHANGELOG.md#infraestructura--seguridad`.

- Gasto variable (`S.gastosVar[]`, incluida la compra con TC): `clase: 'gasto'`.
- Pago de un gasto fijo (`esPagoGastoFijo`): `clase: 'neutro'` — el pago ya cuenta en `Periodo.gastosFijosDelMes` (clave `"<id>_YYYY-MM"` de `S.pagosGastosFijos`); contarlo otra vez como variable lo duplicaría. Es la clase que antes se deducía con `_esGastoVarNoReal()`.
- Un gasto cuenta como real en el mes si su `clase` es `gasto`; `_esGastoVarNoReal(g)` lee la clase y solo cae a las reglas históricas congeladas (pago de TC, alcancía, extra de préstamo, pago de fijo) si falta.
- **Retiros manuales ("Restar dinero")**: desde 2026-10-10 la pantalla también los lista, como filas de solo lectura (categoría `Ajuste`, "Generado automáticamente — elimínalo desde Cuentas · Restar dinero") y los suma a su total del mes (`Periodo.retirosManuales()`), para que Gastos sume lo mismo que Inicio y Análisis. Viven en `S.movimientos`, no en `S.gastosVar`: se eliminan desde Cuentas.

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

- **Historial en una sola lista, agrupada por día:** compras en TC, pagos de TC y pagos de fijos ya no tienen sección propia — van mezclados en orden cronológico, cada uno con su etiqueta (`TC — deuda`, `Pago TC`, `Fijo — ya sumado en Fijos mensuales`). Cada día tiene un encabezado ("Hoy", "Ayer", "sáb 19 sep") con su subtotal: gasto real del día + "en TC" aparte; los pagos de fijos y de TC no suman al subtotal (misma regla que el total de arriba, ver regla 3.3).
- **Orden dentro del historial:** fecha del gasto de más reciente a más antigua y, dentro del mismo día, el último registrado arriba (ver el invariante de orden en §4).
- **Fijo pagado con TC:** tiene a la vez `esPagoGastoFijo` y `_esCompraTC`. Sale una sola fila con las dos etiquetas; suma al total "en TC" pero no al gasto real.
- **Sigue oculto en el historial** (igual que antes del cambio): los movimientos de alcancía y los extras de préstamo (`_esGastoVarNoReal` sin ninguna de las otras banderas). Se ven en el feed general de movimientos, no acá.
- **Filtro de mes en "todos":** el total mostrado es sobre todo el historial, no solo el mes actual; el botón de estado vacío cambia de texto según haya o no un mes específico elegido.
- **Gasto fijo sin pagar vs. pagado este mes:** la plantilla siempre aparece en la lista de Fijos; lo que cambia es si se ve el botón "Pagar" o la etiqueta "Pagado" con su fecha — nunca desaparece de la lista por estar pagada.
- **Sin fila virtual de Spotify:** se eliminó (ver regla 7). Era informativa, sin botón, y dependía de heurísticas por nombre.
- **Datos viejos sin los flags nuevos** (`_esCompraTC`, `_esPagoTC`, etc.): al no tener el flag, `_esGastoVarNoReal()` los trata como gasto real normal — no rompe nada, simplemente no aplica la exclusión que no les corresponde.

## 7. Decisiones de diseño

- **¿Por qué pagar un gasto fijo crea un gasto variable en vez de solo marcarlo "pagado"?** Para que el historial de la cuenta y los totales de caja del mes salgan de un único lugar (`gastosVar`) sin tener que sumar dos fuentes distintas en cada pantalla que reporta gastos. El costo es que hay que excluirlo explícitamente al calcular "gasto variable puro" (ver regla 3.3) — se aceptó ese costo a cambio de no duplicar la lógica de reportes.
- **¿Por qué una sola lista en vez de secciones (variables / TC / pagos de TC / fijos)?** Porque el usuario piensa el historial como un timeline por día y por orden de registro: con secciones, un gasto de hoy pagado con TC quedaba lejos del resto de lo de hoy, y un fijo pagado con TC salía repetido (en "Compras en TC" y en "Pagos de fijos"). Las etiquetas por fila y el subtotal por día conservan la distinción real/TC sin partir la lista.
- **¿Por qué las compras y pagos de TC aparecen en el historial de Gastos si no son "gasto real" del mes?** Porque el usuario quiere ver todo lo que gastó en un solo timeline, sin importar con qué plata lo pagó. Separar totales (real vs. TC) permite mostrar ambos sin que se mezclen ni se dupliquen.
- **¿Por qué eliminar un gasto revierte en vez de simplemente borrar el registro?** Para que el saldo de cuentas y tarjetas nunca quede desincronizado del historial visible — la alternativa (borrar y dejar que el usuario ajuste el saldo a mano) es la fuente más común de descuadres en una app de finanzas personales.
- **¿Por qué ya no hay un gasto fijo «virtual» de Spotify?** Porque aparecía solo con el módulo apagado (justo cuando el usuario no quiere ver Spotify), no tenía acción, no sumaba a ningún total y para evitar duplicados adivinaba por el texto del nombre.
- **¿Por qué el módulo quedó en un solo archivo (`gastos.js`) en vez de dividirse como Spotify o Encargos?** Porque ninguna de sus funciones depende de código definido más abajo en `index.html` al momento de cargar el script — a diferencia de Spotify/Encargos, que necesitan que Personas ya exista.
- **¿Por qué "saldo insuficiente" no está escrito en `gastos.js`?** Porque esa comprobación es la misma para toda la app. `addGastoVar()` llama a `Plata.validarSalida` / `Plata.validarSalidas` (`el núcleo (js/core/estado.js y hermanos)`), que devuelve `{ok, motivo}` con el mensaje ya escapado: cuenta o cajita falla si el saldo es menor que el monto; una TC falla solo si tiene cupo configurado y no alcanza. Antes cada módulo lo escribía a mano con redacción distinta y Spotify sin escapar el nombre de la cuenta. Los mensajes en línea de `confirmarPagarGastoFijo()` ("Necesario: …") se dejaron propios a propósito: son otro formato.
- **¿Por qué el selector de "Pagar gasto fijo" no arma las `<option>` a mano?** `abrirPagarGastoFijo()` usa `FuentesFiltro.optsHtml()` (`js/core/fuentes-filtro.js`): filtra por saldo/cupo con `PRESET.SALIDA` y construye las opciones con `opcionesCuenta`, que escapa nombre y valor en un solo sitio. Es la misma pieza que usa el split de gasto variable.
- **¿Por qué "Registrar gasto" no abre si no hay de dónde sacar la plata?** `abrirNuevoGastoVar()` consulta `FuentesFiltro.hayUtilizable(getFuentes(), PRESET.SALIDA)`: hace falta al menos una cuenta con saldo ≥ $1,00 o una TC con cupo (una TC también puede cargar un gasto). Si no hay ninguna, muestra `FuentesFiltro.MSG_SIN_SALDO` («No tienes cuentas con saldo disponible») y no abre el sheet, porque «¿De dónde salió la plata?» es obligatorio y quedaría sin opciones. Cubre los tres accesos (botón del estado vacío, botón de la lista y acción del menú +), que pasan por esa función.

## 8. Referencia de implementación

Archivo: `js/modules/gastos.js`.

| Función | Qué hace |
|---|---|
| `switchGastoTab(t)` | Cambia entre la pestaña "Gastos" (variable) y "Fijos mensuales". |
| `renderMesFiltros()` | Arma los chips de filtro por mes y dispara `renderGastosVar()`. El filtro (`#mesFilter`) solo se muestra desde el **segundo** mes con gastos (o retiros manuales): con un solo mes «Todos» y ese mes muestran lo mismo. Si el mes filtrado deja de existir, el filtro vuelve a «todos». |
| `renderGastosFijos()` | Pinta la lista de fijos; el «Total mensual fijo» (`#gfTotalCard`) y el botón de pie solo se muestran si hay al menos un gasto fijo (el estado vacío ya trae su botón). |
| `setMesFiltro(m)` | Cambia el mes filtrado y vuelve a renderizar. |
| `renderGastosVar()` | Pinta el historial de gasto variable en una sola lista ordenada (fecha desc., y dentro del día el último registrado arriba), agrupada por día con subtotal, más los totales de arriba. |
| `_gvDiaLabel(fecha)` | Etiqueta del encabezado de día: "Hoy", "Ayer" o "sáb 19 sep" (con año si no es el actual). Arma la fecha con `new Date(y, m-1, d)`, no con `new Date('YYYY-MM-DD')` (UTC). |
| `addGastoVar()` | Valida y crea un gasto variable; si la fuente es TC, delega en `tcCrearCompra()`. |
| `deleteGastoVar(id)` | Elimina un gasto revirtiendo su efecto según el tipo (ver §5). |
| `abrirNuevoGastoVar()` | Pobla categorías y abre el sheet de gasto variable — usada por el estado vacío. |
| `renderGastosFijos()` | Pinta la lista de plantillas de gasto fijo. |
| `addGastoFijo()` | Crea una nueva plantilla de gasto fijo. |
| `deleteGastoFijo(id)` | Elimina una plantilla y limpia su historial de pagos. |
| `abrirNuevoGastoFijo()` | Pobla categorías y abre el sheet de gasto fijo — usada por el estado vacío. |
| `abrirPagarGastoFijo(id)` | Abre el sheet de pago con los datos de la plantilla. |
| `pgfActualizarSaldo()` | Muestra el saldo disponible de la cuenta elegida para el pago. |
| `confirmarPagarGastoFijo()` | Valida, descuenta la cuenta, crea el gasto espejo y marca el pago del mes. |

Funciones núcleo de las que depende (definidas en `index.html`, compartidas con otras secciones): `escHtml`, `toast`, `save`, `refresh`, `openSheet`, `closeSheet`, `dialogo`, `uid`, `hoy`, `mesActual`, `mesKey`, `parseMoney`, `fmtInput`, `getSaldoFuente`, `getFuentes`, `fuenteLabel`, `fuenteBadgeClass`, `descontarFuente`, `sumarFuente`, `poblarCatSelect`, `getCatsVar`, `getCatsFijo`, `emptyState`, `logCambio`, `Events`. También depende de tres funciones del módulo de Tarjetas de Crédito (`tcCrearCompra`, `tcEliminarCompraInterna`, `tcEliminarPagoInterna`), y dos helpers compartidos con el resto de la app que **no** viven en este archivo porque se usan fuera de Gastos: `gastosMes()` y `_esGastoVarNoReal()` (ambos en `index.html`, usados también por Análisis y el dashboard de inicio).

IDs de sheets/inputs relevantes: `sheet-gasto-var` (`gv_desc`, `gv_monto`, `gv_fecha`, `gv_cat`, `gv_fuente`, `gv_nota`), `sheet-gasto-fijo` (`gf_n`, `gf_m`, `gf_c`), `sheet-pagar-gasto-fijo` (`pgf-title`, `pgf-monto`, `pgf-cat-badge`, `pgf-fuente`, `pgf-fecha`, `pgf-nota`, `pgf-error`).
