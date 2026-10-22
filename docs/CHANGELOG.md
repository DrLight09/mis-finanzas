# CHANGELOG — mis-finanzas

Historial de bugs corregidos, código eliminado por diseño y decisiones de limpieza, por módulo. La documentación de cada módulo (`mesada.md`, `spotify.md`, etc.) se enfoca en cómo funciona *hoy*; el detalle de qué estaba mal antes y cómo se arregló vive acá, para no inflar los documentos principales.

---

## Libro de movimientos

Documentación: [`libro-de-movimientos.md`](./libro-de-movimientos.md).

### 📚 Auditoría de documentación (2026-10-22)

Se recorrieron los 26 `.md` de `docs/`, `libro-de-movimientos.md` y `tests/README.md` contra el código real (¿existe cada función, archivo, id y prueba que citan?) y se corrigió lo que describía un estado anterior:
- **`plan-clasificacion-movimientos.md` no existe** (9 documentos lo enlazaban: actividad-reciente, alcancia, cuentas, encargos, gastos, mesada, plata-comprometida, spotify, tarjetas-credito): ahora apuntan a `libro-de-movimientos.md` (regla 7) y al CHANGELOG.
- **`analisis-financiero.md` §9bis:** describía reglas de respaldo "congeladas" (`_reglaHistorica…`) y la migración v3; `claseEfectivaMovimiento()` solo lee `clase` desde el 2026-10-13 (no hay respaldo; `save()` avisa de movimientos sin clase). Reescrito el aviso y las dos viñetas de los helpers.
- **`configuracion.md`:** hablaba de la migración v3 de `clase`; hoy `MIGRACIONES` está vacío (esquema 9, sin migrar datos anteriores; los backups de esquemas menores se rechazan).
- **`actividad-reciente.md`:** el feed ya no lee `S.cajitas[].historial` ni `S.cuentasPersonalizadas[].movimientos` (no existen; todo está en `S.movimientos`, regla 9 del libro), `_normCajitas` ya no existe, y Spotify es `S.spotify.historial`. Corregidas las filas de fuentes, "Mesada a una cajita" (sí aparece), los duplicados revisados y la tabla de funciones.
- **Spotify en el esquema 9:** `S.spotifyPersonas`/`S.spotifyHistorial` → `S.spotify.personas`/`S.spotify.historial` en `personas.md` y `wrapped.md`; `spotify.md` citaba `_registrarMovSecundarioMesada` (hoy `_mesadaEntrar`).
- **`arquitectura-archivos.md` §4:** decía que `calcC`/`calcCDT` viven en `cuentas.js` (lazy) y que `snapshotPatrimonio` espera a `getDeudorSaldoPatrimonio` (no existe). Hoy están en `nu-calc.js` y `calc-helpers.js` (de entrada) y el guard es `calcC`, `calcCDT` y `Deudas`. Lo mismo en `proyeccion-financiera.md` (ya no hay `_calcCSafe`/`_calcCDTSafe`; `crearMiDeuda()` no existe → `_aplicarMovMiDeuda`).
- **`guia-estilo-sheets.md`:** la tabla de "tipos de depósito" de Alcancía era del diseño anterior al de orígenes (y decía que `yo-cuenta` va a `S.gastosVar`); reemplazada por el diseño actual con un puntero a `alcancia.md`. Quitada la convención `ingreso`/`egreso` de `c.movimientos` (no existe) y `totalMamá`. Nueva §0 "Estilos: clases, no `style=""`" y los ejemplos de `*` y `(opcional)` pasan a `c-red` y `lbl-opc` (clase nueva en `styles.css`).
- **Otros:** `proteccion-antiguedad-movimientos.md` (un solo `_deudaTieneCuentaAfectada`), `alcancia.md` (ids `alc_dep_origen`/`alc_split_rows`, eventos `toggleDividir`/`agregarOrigen`; `alc_dep_tipo` no existe), `gastos.md` (`getSaldoActual` ya no existe), `tarjetas-credito.md` (enlace a `prestado.md`), `cuentas.md`/`mesada.md`/`libro-de-movimientos.md`/`tests/README.md` (las pruebas viven consolidadas en `cuentas`, `libro`, `mesada`, `nucleo`, `prestamos` `.test.js`, no en los archivos sueltos que citaban), `wrapped.md` (scripts de época fuera del repo).
- **Nombres de campos de `S`:** plata comprometida es `S.plataComprometida` (los docs de `plata-comprometida`, `actividad-reciente` y `wrapped` seguían diciendo `plataCometida` y hasta explicaban el typo como vigente; se renombró en la migración v2, ya retirada); `proyeccion-financiera.md` citaba `S.mesadasV2` (es `S.mesadas`); `alcancia.md` listaba `S.alcanciaMigrada`, que no existe en el código (quitada).
- **Sumado:** `mis-finanzas.md` (filas de `scripts/` y `tests/`; `configuracion.md` y `actividad-reciente.md` sí existen), `auditoria-tecnica.md` (sección de seguridad pendiente: la CSP aún permite estilos inline) y `tests/README.md` (herramientas `equivalencia-*`).
- **Verificación:** script de auditoría que extrae de cada documento los identificadores y archivos entre comillas inversas y comprueba que existan en el código; lo que queda sin encontrar es histórico a propósito ("antes existía X", `modulo.md`, etc.).
- **Hallazgo de código (no tocado):** `alcancia.js` conserva la lógica de "grupo de deudor" (`alc_dep_deudor_grupo`, `_gruposAbiertos`) y los estilos de `index.html`/JS siguen pendientes; se resuelve al convertir `alcancia.js` (Paso 5).

### 🎨 Estilos inline → clases (2026-10-21, Paso 5, tanda 7) — `cuentas.js`

`cuentas.js` pasa de 47 `style=""` a 7, todos valores calculados: el tamaño y los colores del ícono de cada cuenta (`renderIconoCustom`, `_iconoEfectivo`: `width/height/border-radius/background/color` salen del tamaño pedido y del color que eligió el usuario), el fondo y el color de cada opción de la cuadrícula de íconos, y las variables `--cuenta`/`--cuenta-rgb` de cada tarjeta del selector. Lo estático de esos mismos elementos pasó a clases (`cuenta-ico-box`, `cuenta-ico-op*`).
- **Convertido:** fila de cuenta con ícono, historial de movimientos (fila, nombre, chip "Automático", fecha, monto, botón borrar y candado, etiquetas, nota, destino de transferencia; vacío y "sin resultados"), botón de limpiar fechas, banner de saldo inicial (con y sin apertura), etiquetas del formulario "Agregar dinero", vistas previas de "Corregir saldo inicial" y de Transferir. Se reutilizaron `gasto-item-info`, `gasto-nombre-fila`, `badge-xs`, `ico-inline`, `c-red/c-green/c-blue`. Clases nuevas `cuenta-*` al final de `styles.css`.
- **Cambio de estructura mínimo:** `colorMonto` (un `var(--x)`) pasó a `claseMonto` (`c-blue`/`c-green`/`c-red`); la fila con detalle suma `gasto-item-click` en vez de `style="cursor:pointer"` dentro de un atributo armado en una cadena.
- **Verificado ejecutando las funciones reales** del `cuentas.js` de `js.zip` y el nuevo (herramienta nueva `scripts/equivalencia-cuentas.js`, DOM falso + `html-tag.js`): íconos y selector de las 4 cuentas (Nequi, Efectivo, 2 personalizadas, una con iniciales), título del detalle, cuadrícula con 4 opciones seleccionadas, historial con 9 filas de todo tipo (apertura, ingreso con nota, gasto con categoría, retiro, transferencia, préstamo automático, depósito oculto de Alcancía, cajita, sin id), filtros con y sin fechas, sin resultados, vacío, banner con y sin apertura, etiqueta de apertura marcada/no marcada, Transferir normal y con saldo insuficiente: **29 comparaciones, 0 diferencias**. Mutación (tamaño del monto y color del aviso): falla.
- **Lo que la verificación atrapó:** la opción seleccionada de la cuadrícula tenía `border-color` suelto sobre un `border` abreviado; se dejó la forma abreviada (`border:2px solid var(--accent)`), idéntica a la original.
- `tests/estilos.test.js` suma el archivo con los 4 valores calculados permitidos. Pruebas: `npm test` 413/413; smoke sin fallos. `sw.js` v44.

### 🎨 Estilos inline → clases (2026-10-21, Paso 5, tanda 6) — archivos sueltos

Cinco archivos de 1 a 6 `style=""` quedan sin ninguno: `mesada.js` (badge 9px → `badge-xs`, que ya existía), `wrapped-gate.js` (flecha del botón → `wrapped-gate-flecha`), `core-state.js` (ícono de ganancia → `ico-inline`), `pin-bio.js` (6: fila de botones `pin-fila-btns`, `btn-flex1`, `btn-block`, `btn-peligro`) y `gastos-fijos-progress.js` (el `width:0%` inicial pasó a la regla de `.fijos-progress-fill`; JS sigue poniendo el ancho real al calcular). Clases al final de `css/styles.css`.
- **Quedan `style=""` a propósito en dos archivos más pequeños:** `diferencial.js` (3 `display:none` que JS conmuta) y `actividad_reciente.js` (2 valores calculados: fondo del ícono y color del monto de cada movimiento). Ya estaban o quedan registrados en `tests/estilos.test.js` como permitidos.
- **Verificado por pares** con `scripts/equivalencia-sueltos.js` (8 fragmentos antes/después con el CSS nuevo y `equivalencia-estilos.js`): 0 diferencias; por mutación (color de `btn-peligro`) falla. Los botones de `pin-bio` tenían tres fuentes de estilo que competían (`.btn-sm{width:auto}`, `.btn-ghost`, inline): las clases nuevas son de 2-3 clases para ganar igual que ganaba el inline.
- La guardia `tests/estilos.test.js` ahora acepta una clase igual al prefijo (`badge-xs`, `ico-inline`) y suma los 7 archivos. Pruebas: `npm test` 411/411; smoke sin fallos. `sw.js` v43.

### 🎨 Estilos inline → clases (2026-10-21, Paso 5, tanda 5) — `wrapped.js`

`wrapped.js` pasa de 16 `style=""` a 1: el gráfico de línea y el mensual (`wrapped-svg-block`, zonas táctiles `wrapped-hit`), el número grande de cada slide, el detalle de un mes, los puntos de color de la vista mensual (`wrapped-mes-dot-ok/mal/cero`), el separador de la nota de préstamos (`wrapped-sub-sep`) y el ícono de la estrella (`wrapped-icono-sep`). Las clases nuevas van **dentro del `<style>` que inyecta el propio archivo** (`_wrappedInyectarEstilos`, donde ya vivía todo el CSS de Wrapped); los colores usan las utilidades `c-green/red/amber/purple/blue` de `styles.css` y `wrapped-c-text`. El que queda es el `animation-delay` de cada punto de la línea (`i*0.09s`: un valor distinto por punto, no puede ser clase).
- **Causa raíz que casi se cuela (otro lector del estilo inline):** el color de fondo de cada slide (`mood`) se deducía con una regex sobre el HTML del slide (`color:\s*var\(--X\)`, en `_wrappedBuildSlides`). Al quitar el `style="color:…"` esa regex ya no encontraba nada y **todos los slides sin mood explícito habrían caído a `accent`** (verde) sin dar error. Ahora lee la clase (`c-purple`…`c-green`, `c-green` → `accent`) y `_wrappedColorClase(color)` traduce el `var(--X)` que reciben los 14 llamadores de `_wrappedSlideBignum` (avisa por consola si llega uno sin clase). Regla para el resto del Paso 5: **antes de convertir un archivo, buscar quién lee su HTML o su `.style`** (regex sobre `color:`, `getAttribute('style')`, selectores `[style*=…]`).
- **Código muerto quitado:** la clase `wrapped-dot-final` (y `esFinal`) del último punto de la línea: sin regla CSS ni lector.
- **Verificado ejecutando `_wrappedBuildSlides` completo** con el código de `js.zip` y el nuevo (herramienta nueva `scripts/equivalencia-wrapped.js`: expone `_wrappedBuildSlides` en una copia de prueba, suma el CSS inyectado a `styles.css` y compara mood + estilo efectivo de cada elemento) sobre 5 escenarios (base, racha de alcancía, préstamo devuelto rápido y otro sin devolver, mes con balance exacto 0, gasto raro que no es el mayor): **86 slides, 0 diferencias**, las 13 clases nuevas ejercitadas. Mutación: con el regex roto salen 17 fallos de mood; con un color de punto cambiado, 5 fallos de estilo.
- `tests/estilos.test.js` suma el archivo (con `cssEn` para leer el CSS inyectado) y una prueba del mapa de colores/mood. Pruebas: `npm test` 399/399; smoke sin fallos. `sw.js` v42.

### 🎨 Estilos inline → clases (2026-10-21, Paso 5, tanda 4) — `inicio.js`

`inicio.js` pasa de 43 `style=""` a 1: tarjeta "Necesita atención" (badge e ítems), Salud financiera (anillo, puntaje, consejos) y Proyección (estado vacío, tendencia, tarjetas 3m/6m/12m, chips de confianza y los dos tooltips que arma `showTT`). Clases `inicio-*` al final de `css/styles.css`. El que queda es `display:none` del tooltip `#_proy-tt`, que JS conmuta con `style.display`.
- **Colores calculados → clases modificadoras:** `inicio-attn-badge-red/amber`, `inicio-attn-texto-red/amber`, `inicio-salud-ok/warn/mal`, `inicio-tip-ok/warn`, `inicio-proy-pos/neg`, `inicio-tt-pos/neg`. Se quitaron la variable `col` de `renderProyeccion` (ya no se usa), `color` de los consejos y `col2` del tooltip.
- **Verificado renderizando antes y después** con la herramienta nueva `scripts/equivalencia-inicio.js` (JSDOM real: ejecuta el `inicio.js` de `js.zip` y el nuevo con los mismos datos y compara el estilo efectivo de cada elemento con `equivalencia-estilos.js`): atención ámbar y roja con la sección abierta y cerrada, salud con puntaje 100/80/60/30 y sin datos, proyección sin patrimonio / historial insuficiente / preliminar / normal / estable / tendencia negativa, y el tooltip que sale al tocar la cabecera y las tarjetas 3m y 12m: **27 comparaciones, 0 diferencias, 0 avisos**. Se comprobó por mutación (cambiar el color de `.inicio-proy-neg` y el tamaño de `.inicio-tt-delta`) que el verificador falla.
- `tests/estilos.test.js` suma el archivo. Pruebas: `npm test` 396/396; smoke sin fallos (207/0/0). `sw.js` v41.

### 🎨 Estilos inline → clases (2026-10-20, Paso 5, tanda 3) — `gastos.js`

`gastos.js` pasa de 29 `style=""` a 0: lista de gastos variables (fila, chip "Automático", candado, nota, cabecera por día con su variante de primer día), lista de gastos fijos (Pagado, botón Pagar, fila de meta) y la flecha de deuda del sheet de pago de un fijo. Clases `gasto-*`, `badge-xs` y `row-name-13` al final de `css/styles.css`.
- **Verificado renderizando antes y después** (`renderGastosVar` y `renderGastosFijos` con el código de `js.zip` y el nuevo, mismos datos: gasto normal con nota, dividido en dos cuentas, compra con TC, pago de TC, pago de gasto fijo con y sin TC, movimiento automático/secundario, "Restar dinero", fijos pagados, pendientes y Spotify virtual): 150 + 43 elementos equivalentes, sin avisos. La flecha de `pgfActualizarSaldo` se comprobó aparte.
- Lo calculado (opacidad del gasto fijo/pago de TC, color del monto, margen del primer día) pasó a clases modificadoras: `gasto-item-atenuado`, `c-red`/`c-green`/`gasto-monto-fijo`, `gasto-dia-primero`. El badge de 9px se repetía 9 veces y ahora es `badge-xs`.
- `tests/estilos.test.js` suma el archivo. Pruebas: `npm test` 394/394; smoke sin fallos.

### 🎨 Estilos inline → clases (2026-10-20, Paso 5, tanda 2) — `busqueda-global.js` y `configuracion.js`

`busqueda-global.js` pasa de 16 `style=""` a 2 y `configuracion.js` de 4 a 0. Las clases nuevas (`busqueda-*`, `cat-chips`, `cat-chip`, `cat-chip-del`) van al final de `css/styles.css`. Los 2 que quedan en búsqueda son valores que salen del resultado (el color del tipo y el fondo del ícono según el color).
- **Verificado en un DOM real:** se ejecutó el código anterior y el nuevo en jsdom con los mismos datos (gastos, fijos, deudores, cajitas, encargos, personas, Spotify, movimientos, alcancía; con y sin resultados; con menos de 2 caracteres) y se comparó con `scripts/equivalencia-estilos.js`: 372 elementos equivalentes. Chips de categorías: 14 elementos equivalentes.
- **Cambio de comportamiento deliberado:** la regla `.cat-chip-del:hover{color:var(--red)}` ya existía pero nunca se aplicaba (el `color` inline del botón le ganaba). Ahora la `x` de una categoría se pone roja al pasar el ratón, que era lo previsto.
- Los resultados sin destino (`navTipo` vacío) usan `.busqueda-item.busqueda-item-sin-nav{cursor:default}` en vez de un `cursor` inline.
- `tests/estilos.test.js` suma estos dos archivos y ahora solo cuenta clases dentro de atributos `class`/`className` (los ids `busqueda-*` no cuentan); acepta como permitido un texto exacto o una expresión regular.
- Pruebas: `npm test` 392/392; smoke sin fallos.

### 🎨 Estilos inline → clases (2026-10-20, Paso 5, tanda 1) — `diferencial.js` y `split.js`

38 `style=""` de `diferencial.js` (quedan 3 `display:none` que JS conmuta) y 3 + un `style.cssText` de `split.js` pasan a clases `diferencial-*` / `split-*` al final de `css/styles.css`. Es la primera tanda del Paso 5; el método y los hallazgos están en `CONTINUAR.md` §13.16.
- **Equivalencia comprobada, no supuesta:** `scripts/equivalencia-estilos.js` (nuevo) compara, elemento por elemento, el estilo efectivo antes y después con la cascada real (especificidad, orden, `!important`, shorthands, reglas de estado y `@media`). Cubre la fila de beneficiario con y sin intercambio, la plantilla completa, el historial, los 5 estados del resumen y la fila de split: todo equivalente. Por mutación se comprobó que detecta diferencias.
- **Lo que casi se pierde:** el resumen vacío se colapsaba por `[style*="min-height"]:empty` sobre el `style=""`; al pasar a clase se añadió `.diferencial-resumen:empty{min-height:0}`.
- **Especificidad:** las reglas base de `input[type=text]`, `select`, `.il`, `.ig` ganan a una clase suelta, así que las nuevas son `input.diferencial-input`, `select.diferencial-select`, `.il.diferencial-lbl-*`, `.ig.diferencial-ig` y el bloque va al final.
- Nuevo `tests/estilos.test.js`: ningún `style=""` estático nuevo en los archivos convertidos y toda clase que usan existe en el CSS (+ la regla `:empty`).
- Pruebas: `npm test` 388/388; smoke sin fallos.

### 🧹 Limpieza (2026-10-20) — fuera el código que existía solo para datos anteriores (§13.15 de `CONTINUAR.md`)

La app no tiene datos antiguos que proteger (decisión de Sebas, 2026-10-18), así que se borró en vez de mantenerse. Para cada candidato se buscó antes quién escribe el dato; si nadie, el código de lectura era muerto.
- **`_migrarGruposDeudor`** (`prestado.js`, con 5 llamadas en `prestado.js` y `alcancia.js`) y su prueba. Los 7 sitios que crean movimientos de deuda ya escriben `grupoId`; `_getOrCrearHistorico` crea `d.grupos` cuando hace falta y `_gruposAbiertos`/`_autoCerrarGruposEnCero` toleran su ausencia.
- **Spotify / Cuentas:** el id `sp_legacy_<índice>` para cobros sin id (`cuentas.js`; todo cobro nace con `id`), el respaldo por nombre en `spCobradoDePersona` (todo cobro lleva `spId`) y el respaldo de `_cuotaAdmin` (todo pago la guarda). El fixture de `cuentas.test.js` pasó el cobro "Sin id" a un cobro con id (`sp9`) y la prueba del id estable se quitó.
- **Wrapped:** el fallback `S.nu.cajitas` (`_wrappedListaCajitas` lee solo `S.cajitas`) y los comentarios que decían que `pagosGastosFijos` podía ser un array (`Periodo` ya solo lee el mapa).
- **Alcancía:** el tipo de depósito `'split'` (lectura en el desglose, aviso de antigüedad, texto del diálogo y reversión; nada lo escribe desde que existe `'multi'`) y el filtro de `S.gastosVar` en `_alcQuitarMirrorCuenta` (el espejo de un depósito con cuenta vive solo en `S.transferencias`).
- **Búsqueda global:** la rama `_esAlcancia` de los gastos variables (el destape guarda `_esAlcanciaAjuste`, nunca `_esAlcancia`, en `S.gastosVar`).
- **`getSaldoActual`:** el alias de `getSaldoFuente` (27 usos renombrados; los tests dejan de enlazarlo a mano).
- Comentarios: `split (legacy)` en el modelo de origen de `core-state.js`; "legacy" en `movimientos.js` (`'ingreso'` no es legado: es como la vista de Cuentas rotula una entrada).

Documentación ajustada: `alcancia.md` (sin `split` ni migración de grupos), `prestado.md`, `spotify.md`, `wrapped.md`. **Sin hacer, anotado como candidato:** `_esAlcancia` en `S.gastosVar` también se lee en `cuentas.js` (~514), `actividad_reciente.js` (~237) y `_esGastoVarNoReal`, y los fixtures g06/g11 de `cuentas.test.js` lo usan; nada lo escribe ya. `configuracion.js` conserva su rechazo del formato viejo de cuentas (una línea útil).

Verificación: `npm test` 383/383, `scripts/smoke-browser.js` sin fallos (207 usadas, 0 sin registrar, 0 duplicadas).

### 🐛 Corregido (2026-10-13) — Plata comprometida: al eliminar un ingreso no se devolvía todo, y las llamadas de saldo no llevaban `origen` (`plata_comprometida.js`)

La guardia `puerta-unica` encontró 15 llamadas a `sumarFuente`/`descontarFuente` sin `origen`; al revisarlas aparecieron cuatro fallos de fondo en la reversión, todos contra la regla "eliminar el movimiento principal lo deshace todo, como si nunca hubiera pasado":
- **El sobrante ("Ingreso libre") nunca se devolvía.** `_cpEliminar` borraba la fila de `S.movimientos` pero dejaba la plata en la cuenta (el saldo quedaba más alto que su historial). Ahora el ingreso guarda `item.sobrante = { cuenta, monto }` al recibirse y eliminarlo lo descuenta.
- **Un adelanto o un pago ya hechos tampoco se devolvían** si el ingreso ya estaba recibido: solo se revertía lo que se movió al recibir. Con un adelanto de $30.000 repuesto y luego eliminado, la cuenta quedaba $30.000 abajo. Ahora se devuelven también (y su fila de `S.movimientos`).
- **Quedaba una fila huérfana** (`Reposición gasto: …`) porque el filtro buscaba el texto del ingreso, que esa fila no incluye. Las filas que se crean al recibir llevan ahora `_cpItemId` y se borran por ese id.
- **Seguía escribiendo la lista vieja `cuenta.movimientos`** cuando el sobrante entraba a una cuenta personalizada. Se quitó.

Todas las llamadas llevan `origen` (`_ogCp(ref, rev)`, módulo `plata-comprometida`, `ref` = id del destino, o del ingreso para el sobrante) y las reversiones pasan el mismo `ref` con `rev: true`. La opción `{ exacto: true }` (ya sin efecto desde que el saldo no se recorta) se retiró. Pruebas nuevas en `tests/libro.test.js` (bloque `plata-comprometida`, 6 casos); fallan todas con el código anterior.

**Decisión de comportamiento:** eliminar un ingreso recibido ahora también devuelve los adelantos y pagos que ya se habían hecho. Antes los dejaba (el aviso solo prometía revertir lo generado al recibir); ahora el aviso y el código coinciden con la regla de arriba.

### 🐛 Corregido (2026-10-13) — Eliminar un movimiento desde una cuenta pedía dos clics y revertía dos veces (`movimientos.js`)

Causa raíz: `eliminarMovimiento()` tenía **todo el bloque "confirmación + reversión" duplicado dentro de la misma función** (un copiar y pegar accidental). Corría así: protección por antigüedad → confirmación 1 → reversión 1 → confirmación 2 → reversión 2. Por eso el primer clic en "Eliminar" parecía no hacer nada (era el segundo diálogo, idéntico) y el segundo clic revertía otra vez.

El efecto dependía del tipo de movimiento: en gastos y transferencias la segunda reversión no encontraba el registro y no hacía nada (por eso "se revierte bien"), pero en **saldo inicial, ingresos manuales y retiros de cuentas personalizadas** la segunda vuelta usaba el monto que mostraba la fila (sin comprobar que el registro siguiera existiendo) y devolvía la plata dos veces: un saldo inicial de $10 pasaba a −$10 y un retiro de $2.000 sobre $10.000 terminaba en $12.000.

Arreglo: se quitó la copia (queda una sola confirmación y una sola cadena de reversión, −112 líneas) y se añadieron tres protecciones para que no se pueda duplicar plata aunque el clic se dispare dos veces o la fila quede pintada:
- `eliminarMovimiento` es ahora un envoltorio con un candado por movimiento (`_movEliminando`): un segundo disparo del mismo clic no abre otro diálogo ni revierte.
- `_movExiste(tipo, id)`: antes de preguntar y otra vez después de confirmar se comprueba que el registro siga existiendo; si no, avisa "Este movimiento ya se eliminó" y no mueve nada.
- La reversión sale del **registro**, nunca del monto de la pantalla; se retiró la rama "dato huérfano" que devolvía el monto de la fila aunque el registro ya no estuviera.

Pruebas (`tests/cuentas.test.js`, bloque `eliminar-movimiento`, 9 casos): saldo inicial, retiro, retiro de cuenta personalizada, ingreso, transferencia, gasto, doble disparo, movimiento ya eliminado y gasto dividido. Con el archivo anterior fallan las 9 con los mismos números que se vieron en pantalla (−10, 12.000, dos diálogos).

### 🐛 Corregido (2026-10-13) — Un gasto dividido entre dos cuentas no aparecía en ninguna y, borrado desde la cuenta, no devolvía la plata (`cuentas.js`, `movimientos.js`)

- **No aparecía:** `getMovimientosCuenta` solo buscaba gastos con `g.fuente`, y un gasto dividido guarda `fuente: ''` más una lista `splits`, así que no coincidía con ninguna cuenta aunque el saldo sí bajaba (los préstamos divididos sí lo contemplaban). Ahora cada cuenta muestra **su parte** del gasto, con las otras cuentas en el detalle.
- **No devolvía la plata:** la rama de gastos de `eliminarMovimiento` solo devolvía `g.fuente`; con un gasto dividido borraba el registro y la plata no volvía a ninguna cuenta. Ahora devuelve cada parte a su cuenta, igual que `deleteGastoVar` en `gastos.js`.

### 🔧 Cambio (2026-10-13) — `dialogo()` cancela el diálogo anterior en vez de dejarlo colgado (`core-state.js`)

`dialogo()` guarda un único resolvedor (`window._dialogResolve`): abrir un segundo diálogo mientras había uno abierto perdía el primero, y la función que lo esperaba (`await dialogo(...)`) quedaba colgada para siempre. Ahora el anterior se resuelve en `false` (cancelado). Prueba en `tests/nucleo.test.js` (bloque `dialogo`).

### ✨ Agregado (2026-10-13) — Guardia contra bloques de código duplicados (`tests/nucleo.test.js`, bloque `sin-bloques-duplicados`)

Falla si algún archivo de `js/` repite 10 líneas significativas seguidas. Habría detectado el bug de `eliminarMovimiento` (líneas 534 y 673 del archivo original). Hoy no hay ningún duplicado en todo el proyecto. Variable `MIS_FINANZAS_JS_DIR` para apuntarlo a otra carpeta.

### 🔍 Auditoría (2026-10-13) — "Eliminar el movimiento principal lo deshace todo": revisión por módulo

Se revisó, módulo por módulo, que borrar un registro devuelva lo mismo que su creación movió (cuentas, espejos, márgenes, estado de pago), con el mismo `ref` en el libro:
- **Cubierto por pruebas de ida y vuelta** (estado final igual al inicial salvo el libro, y el libro suma cero por cuenta): Mesada, Me deben, Yo debo, Plata comprometida (esta tras el arreglo de arriba), Préstamo con TC y **Gastos** (cuenta, y tarjeta; bloque `gastos-ida-y-vuelta` de `tests/cuentas.test.js`).
- **Revisado por lectura, sin hallazgos:** Spotify (`_borrarSpHistorial`: cobro con extra, abonos del pendiente, pago con tarjeta), Tarjetas (`eliminarCompraTC`, `eliminarPagoTC`) y Alcancía (`_alcanciaEjecutarEliminarDeposito`, todos los tipos de depósito). No se añadieron pruebas porque su registro depende de formularios muy grandes; quedan para la verificación en el navegador.

### 🔧 Cambio (2026-10-13) — `clase` pasa a ser la única fuente de verdad: se retiran las reglas históricas (`core-state.js`)

Desde el esquema 7 la app nace limpia y todo escritor pone `clase` al crear el movimiento (lo exige `tests/nucleo.test.js`, bloque `clase-cobertura`, y se auditó que ningún `push` por variable se la salte). La cascada de respaldo ya no servía a nadie y era frágil: clasificaba por etiquetas y por **texto** (`/^(Reposición[: ]|Para pagar TC \(/`, `desc` que empezara por "Margen", prefijos de `_origenSeccion`…).

Se eliminan `deducirClaseMovimiento`, `estamparClasesMovimientos`, `_reglaHistoricaEntradaEspejo` y `_reglaHistoricaGastoVarNoReal` (−84 líneas del núcleo). Los lectores quedan así:
- `claseEfectivaMovimiento(m)`: la `clase` guardada o `null`.
- `_esEntradaEspejoNoIngreso(m)`: solo cuenta como ingreso la entrada con `clase: 'ingreso'`; una sin clase no cuenta.
- `_esGastoVarNoReal(g)`: queda fuera del gasto real el que tenga `clase` distinta de `'gasto'`; uno sin clase cuenta como gasto (es lo que es por estar en esa lista).
- `movimientosSinClase()` + aviso en `save()` (una vez por sesión en consola; detalle en `window._movimientosSinClase`), igual que `Libro.verificar()` con los saldos. Sustituye al normalizador que estampaba por deducción.

Las pruebas que armaban datos a mano sin `clase` (`periodo`, `ingreso-real`, `clase-movimientos`) ahora la llevan; se retiraron las tres que probaban las funciones eliminadas y se añadió la de `movimientosSinClase`. Todas las pruebas que pasan por los módulos reales siguieron en verde sin tocarlas, que es la comprobación de que los escritores ponen `clase`.

### 🔧 Cambio (2026-10-13) — Retirado el último borrado de la lista vieja `cuenta.movimientos` (`movimientos.js`)

`eliminarMovimiento()`, en la rama de "retiro manual de una cuenta personalizada", todavía filtraba `cc.movimientos` para limpiar datos de una función ya retirada. Desde el esquema 7 esa lista no existe, así que el filtro era un no-op; se quitó junto con su comentario. Con esto, un barrido de todo `js/` ya no encuentra ninguna lectura ni escritura de `cuenta.movimientos` ni `cajita.historial` (las `.movimientos` que quedan son las de Encargos y Deudas, que son su historia propia). Las escrituras directas a `tc.deuda` se revisaron y se dejan: cada una tiene su registro (`tcMovimientos`, compras) y `tcRecalcular` reconstruye el mismo valor (lo cubren las pruebas de "Me deben" y "Yo debo" con tarjeta).

### 🔧 Cambio (2026-10-13) — Pruebas: un archivo por sección y arreglo de las que seguían el modelo anterior (`tests/`)

Las pruebas sueltas (27, con `yodebo`, `transferir`, `totalPrestadoPendiente` y `spotify-cajita`) pasan a 6 archivos, uno por sección de la app, con un bloque `describe` por cada archivo anterior (sin perder ninguna prueba: 239 antes y después): `nucleo.test.js` (patrimonio, salud financiera, Periodo, migraciones, ingreso real, clase), `libro.test.js` (libro, módulos, puerta única), `cuentas.test.js` (historial, Nu, CDT, chequeo, Restar dinero), `prestamos.test.js` (Me deben, deudas, margen), `mesada.test.js` (reglas y pantalla) y `sync.test.js` (Firestore).

Para limpiar el repo, desde su raíz (conserva solo los 6 archivos nuevos): `cd tests && ls *.test.js | grep -vE '^(nucleo|libro|cuentas|prestamos|mesada|sync)\.test\.js$' | xargs git rm && git rm libro-migracion.js historial-unificado.js`. `libro.test.js` no se borra: el archivo nuevo del mismo nombre lo reemplaza.

Tres grupos fallaban en el CI por seguir el modelo anterior, no por un error de la app:
- `ingreso-real` (4 pruebas): daban por bueno `cuenta.movimientos` y los "gemelos" con el mismo id. Ahora comprueban que el historial de una cuenta personalizada vive en `S.movimientos` con `fuente`, y que lo que quede en `cuenta.movimientos` no se lee.
- `mesada-reglas` (7 pruebas de "ida y vuelta"): comparaban todo `S` antes y después de registrar y borrar, pero el libro no borra (deja entrada + reversión). Ahora comparan `S` sin el libro y exigen que lo que el libro sumó neto a cero por cuenta.
- `firebase-sync`: fallaba porque `js/core/payload-codec.js` no estaba en el repo.

Las dos pruebas que seguían en rojo eran fallas reales y quedan arregladas: `puerta-unica` (15 llamadas sin `origen` en `plata_comprometida.js`, ver arriba) y `yodebo` (`registrarMovEspejo / borrarMovEspejo` leía las listas `cuenta.movimientos` y `cajita.historial`, que ya no existen). `yodebo` y `totalPrestadoPendiente` se unieron a `prestamos.test.js`, `transferir` y `spotify-cajita` a `cuentas.test.js` y las de plata comprometida a `libro.test.js`: 307 pruebas en 6 archivos.

### 📝 Documentación (2026-10-13) — Modelo de una sola lista en los `.md` de módulo

`cuentas.md` ya no describe `c.movimientos`, `cajita.historial`, los gemelos ni la lectura "de ambas convenciones": todo está en `S.movimientos` con `fuente`. `propuesta-movimientos-en-un-solo-lugar.md`, `plan-clasificacion-movimientos.md` y `plan-reestructuracion.md` llevan un aviso de estado arriba (Parte A hecha, B pendiente; migraciones retiradas; tope de 1 MiB resuelto con compresión). `actividad-reciente.md` se reescribió contra `actividad_reciente.js` (el feed ya lee solo `S.movimientos`). `plata-comprometida.md` documenta el libro (`_ogCp`), `item.sobrante`, `_cpItemId` y que eliminar un ingreso recibido lo devuelve todo.

### 🐛 Corregido (2026-10-13) — El margen de "Préstamo con TC" se quedaba como ingreso al borrar el préstamo (`prestado.js`)

Regla: borrar un movimiento principal revierte todo lo que generó (margen incluido), como si no hubiera pasado. El préstamo normal con "El valor era diferente" ya la cumplía, pero `confirmarPrestamoTC` llamaba `diffAplicar('prtc', …)` sin `linkId`: el ingreso del margen nacía sin `_encMovId` y `_revertirMovDeudorImpl` (que lo busca por ese campo) no lo encontraba. Borrar el préstamo dejaba el margen contando como ingreso del mes para siempre.

Ahora se pasa `movId` como `linkId`. Pruebas en `tests/prestamo-margen.test.js`: el margen se va con el préstamo, y una prueba estática exige `linkId` en toda llamada a `diffAplicar` (falla con el código anterior).

### 🐛 Corregido (2026-10-13) — Eliminar el saldo inicial de un encargo descontaba plata propia de la cuenta (`encargos.js`)

Causa raíz: el saldo inicial de un encargo (`enc.saldoInicial` / `enc.cuentaInicial`) es plata **ajena** que ya estaba guardada en esa cuenta; nunca formó parte de `c.saldo`, que guarda solo la porción propia (ver `calcC` en `nu-calc.js` y `_saldoEncargosEnCuenta`). Por eso `crearEncargo` no suma nada a la cuenta, y es correcto. El borrado añadido el 2026-08-30 llamaba `descontarFuente(enc.cuentaInicial, enc.saldoInicial)`: al quitar una anotación, restaba esa plata de la cuenta propia. Antes quedaba oculto porque el saldo se recortaba en 0 y el historial no lo contaba; con "el saldo nunca se recorta" la cuenta quedaba por debajo de lo real.

Escenario que lo dispara: crear un encargo con saldo inicial en Nequi y luego eliminar ese saldo inicial desde el historial del encargo; Nequi bajaba por ese monto (reproducido en un test: 1.000 → 700).

Ahora eliminarlo solo quita la anotación del encargo (el diálogo lo dice) y no mueve ninguna cuenta ni deja entrada en el libro. Prueba nueva en `tests/libro-modulos.test.js`, que falla sin el cambio.

### ✨ Agregado (2026-10-13) — Guardia estática de la puerta única de saldos (`tests/puerta-unica.test.js`)

Dos reglas del libro pasan de convención a prueba de CI: nadie escribe `.saldo` fuera de `sumarFuente`/`descontarFuente`/`ajustarSaldoCuenta`, y toda llamada a `sumarFuente`/`descontarFuente` lleva `origen` (las 5 de las reversiones de Préstamos que corren dentro de `_enReversion` están listadas por texto exacto). Detecta el caso de `diffAplicar` de arriba. Sin esto, `Libro.verificar` solo avisa una vez por sesión y una llamada sin origen ni siquiera descuadra.

### 🔧 Cambio (2026-10-13) — El estado viaja comprimido a Firestore y hay tope de tamaño (`firebase-sync.js`, `payload-codec.js`)

Todo el estado se guarda como un único campo `payload` de un único documento, que Firestore limita a 1 MiB. Cada movimiento de cuenta ocupa ≈ 150 B en el libro más ≈ 210 B de espejo en `S.movimientos`: con 5 movimientos al día solo esas dos listas suman ≈ 650 KB por año, y con el resto del estado el documento se llenaba en poco más de un año. Si se pasaba, `setDoc` fallaba y la app decía "Error al guardar — revisa conexión", mientras la nube se quedaba en el último guardado bueno.

Ahora:
- **Compresión.** `js/core/payload-codec.js` (módulo ES, solo vía `import`, como `wait-for-module.js`) guarda el JSON como gzip + base64 con prefijo `gz1:`. Con datos sintéticos de 2 años a 5 movimientos al día: 1.374 KB → 218 KB (6,3×), unos 9 años hasta el límite en lugar de poco más de 1. Un payload sin prefijo se sigue leyendo como JSON plano; sin `CompressionStream` se guarda en plano; un `gz1:` ilegible se trata como `parse-error` (nunca se guarda encima).
- **Lectura.** `_applyCloudData` y el cuerpo del listener no cambiaron: el listener recibe un snapshot ya descomprimido (`_decodificarSnap`), y los snapshots y el error del listener se procesan en una cola para respetar el orden de llegada aunque descomprimir sea asíncrono.
- **Escritura.** `_ejecutarGuardado` comprime antes de `setDoc`. Como comprimir es asíncrono, cada guardado toma un número al empezar y uno que quedó viejo no escribe (evita que un guardado lento pise a uno más nuevo). La comparación "¿cambió algo?" sigue usando el JSON plano.
- **Tope.** Se mide el tamaño ya comprimido: aviso a los 800 KB (una vez por sesión), y a 1.000.000 de bytes no escribe y lo dice (`window._payloadBytes` deja el valor).
- El cierre de sesión también guarda comprimido. `sw.js` pasa a `v30`.

Pruebas: `tests/firebase-sync.test.js` carga el `firebase-sync.js` real con un Firestore simulado (ida y vuelta, plano, ilegible, orden, guardados concurrentes, tope). Sin Firestore real no se probó la entrega en la nube ni el listener en un navegador.

### 🐛 Corregido (2026-10-13) — `diffAplicar` movía saldo sin `origen`, y esas entradas quedaban como `sin-origen` (`diferencial.js`)

Causa raíz: las tres llamadas de saldo de `diffAplicar` (el sobrante que entra a "mi cuenta" y las dos patas de un intercambio "lo pagué yo") no pasaban `origen`, y quien las invoca (`prestado.js`, y Encargos) no las envuelve en `Libro.conOrigen`. Al venir de un módulo que no las cubría, la regla 3 de `libro-de-movimientos.md` se rompía sin que ninguna prueba lo notara: el saldo seguía cuadrando con el libro, pero la entrada nacía como `{ modulo: 'sin-origen' }` y sin `ref`, así que no se podía enlazar con la reversión.

Escenario que lo dispara: un préstamo o un encargo con "El valor era diferente" donde el usuario se queda con un sobrante en una cuenta, o paga una parte de su bolsillo.

Ahora `diffAplicar` arma `{ origen: { modulo: 'diferencial', ref: linkId } }` (sin `ref` cuando el llamador no pasa `linkId`, como en Préstamo con TC) y lo pasa a las tres llamadas.

### 🔧 Cambio (2026-10-12) — App limpia: esquema 7, sin migraciones; el libro vive en el núcleo (`core-state.js`, `configuracion.js`, `index.html`, `sw.js`)

La app empieza de cero con el modelo ya estructurado, sin cargar con código que transforma datos de formas anteriores. Se retiraron las migraciones v3–v6 (clase explícita, corrección del regalo de la abuela, siembra del libro, historial unificado) y `unificarHistorialCuentas`; `MIGRACIONES` queda vacía y `SCHEMA_VERSION_ACTUAL` = `SCHEMA_BASE` = 7. El mecanismo (`aplicarMigraciones`) se conserva para cambios futuros.

Datos de un esquema anterior (< 7) no se tocan: `aplicarMigraciones` los marca (`S._esquemaAnterior`), `load()` avisa que esta versión empieza de cero (Configuración → Borrar todo) y el import de un backup de esa versión se rechaza con ese mismo motivo (`_validarEstructuraJSON`). Datos de una versión más nueva siguen sin tocarse.

El libro (`Libro`) pasó de `libro.js` al propio `core-state.js`: `sumarFuente`/`descontarFuente` lo necesitan en cualquier pantalla y los tests que cargaban solo `core-state.js` (modo permisivo) recibían un `Libro` vacío ("`Libro.registrar is not a function`", 82 tests). Ya no hay archivo aparte ni guardas `typeof Libro`.

### ✨ Agregado (2026-10-11) — Libro de movimientos (`S.libro`) y puerta única de saldos (`core-state.js`, `cuentas.js`, `alcancia.js`, todos los módulos que mueven plata)

Verificado con un backup real: el saldo de una cuenta era un número guardado aparte (`c.saldo += monto`) y el historial un registro paralelo; nada garantizaba que sumaran igual. Quedaron diferencias que ningún registro explicaba (intereses de Nu, el capital de un CDT de $2.000.000, el saldo previo de Spotify, ≈ $10.000 salidos de Sobra).

`S.libro` guarda una entrada por cada cambio de saldo (monto con signo, `tipo`, `origen: { modulo, ref }`) y la regla es **saldo == suma del libro**. `sumarFuente`, `descontarFuente` y la nueva `ajustarSaldoCuenta` son la única forma de cambiar un saldo; `save()` verifica la regla y avisa una vez por sesión si no se cumple. Cada módulo (Préstamos, Encargos, Spotify, Gastos, Mesada, Tarjetas, Cuentas, Alcancía, `movimientos.js`) pasa su `origen`; las reversiones quedan como `tipo: 'reversion'` con el mismo `ref`. Cuando el id del registro nacía después de mover el saldo, se reordenó (crear el registro y luego aplicar el saldo; en Tarjetas, crear el pago y luego descontar).

### 🔧 Cambio (2026-10-12) — El historial de TODAS las cuentas vive en una sola lista, `S.movimientos` (`cuenta-efectos.js`, `cuentas.js`, `movimientos.js`, `actividad_reciente.js`, `busqueda-global.js`, `core-state.js`)

Verificado: el historial de una cuenta se guardaba en tres formas — `S.movimientos` (Nequi/Efectivo), `cuenta.movimientos` (personalizadas: `ingreso`/`egreso` + `nota`) y `cajita.historial` — y se juntaba en cada lectura con reglas de deduplicación a mano (`entradasIngresoReal` combinaba tres fuentes; `getMovimientosCuenta` listaba cuatro diferencias a propósito). Cualquier lector que olvidara una lista daba un número mal sin avisar.

Ahora todo está en `S.movimientos` con `fuente` (`'nequi'`, `'efectivo'`, `'custom:ID'`, `'cajita:ID'`), tipo `entrada`/`salida` y texto en `desc`. `registrarMovEspejo`/`borrarMovEspejo` escriben y borran solo ahí. Se simplificaron `getMovimientosCuenta`, `entradasIngresoReal`, el borrado de `movimientos.js`, Actividad reciente (una apertura de cuenta personalizada ya no sale como "Retiro") y Búsqueda.

### ✨ Agregado (2026-10-11) — Historial de cuenta: las entradas del libro sin fila propia (intereses, ajustes, CDT) salen como filas con candado (`core-state.js`, `cuentas.js`)

Verificado: el saldo de una cuenta incluía plata que ninguna fila del historial explicaba (intereses de Nu materializados, el chequeo rápido, el capital de un CDT). `Libro.entradasVisibles()` las devuelve y `getMovimientosCuenta` las añade como filas automáticas (`_secundario`, sin botón de eliminar). El "Antes/Después" del detalle de un movimiento sale más exacto.

### 🐛 Corrección (2026-10-11) — `descontarFuente` recortaba el saldo en 0 y la diferencia se perdía sin avisar (`core-state.js`)

Verificado: restar más de lo que había dejaba la cuenta en 0 y descartaba el resto (en un backup real, $108,23 de una cajita; la opción `exacto` solo existía para saltarse el recorte en reversiones). Ahora el saldo refleja exactamente lo restado, aunque quede negativo, y se ve. La opción `exacto` se retiró.

### 🐛 Corrección (2026-10-11) — El chequeo rápido de Nu pisaba el saldo sin dejar rastro (`cuentas.js`)

Verificado: `guardarChequeoNu` asignaba `c.saldo` con la lectura real de Nu sin ningún movimiento asociado. La diferencia queda ahora como entrada `ajuste` del libro (y deshacer el chequeo deja otra), y los intereses materializados quedan como `rendimiento`, una entrada por cajita y mes.

### 🗑️ Eliminado (2026-10-12) — Listas propias de las cuentas, `libro.js`, las migraciones v3–v6 y las herramientas de transición

`cuenta.movimientos` y `cajita.historial` (y la rama que las leía), `libro.js`, `Libro.sembrar`/`patas`/`auditar`, `scripts/auditoria-libro.js`, y las pruebas `historial-cuenta.test.js` (dorada, contra la implementación anterior congelada) y `tests/support/historial-legacy.js`, que servían solo para validar la transición.

---

## Sheets / UI

### 🔧 Cambio (2026-10-18) — App limpia: esquema 9 sin migraciones y fuera la compatibilidad con datos viejos (`core-state.js`, `periodo.js`, `diferencial.js`, `encargos.js`, `scripts/`, `sw.js`)
**Por qué:** no hay usuarios ni backups que conservar, y mantener código que entiende formas antiguas de los datos es complejidad sin dueño. Decisión: la app nace limpia en el esquema 9.
**Qué se hizo:** (1) `SCHEMA_BASE = 9` y `MIGRACIONES = []`: las migraciones v8 (tasa única de Nu) y v9 (Spotify en `S.spotify`) se plegaron en el modelo actual; el mecanismo queda para el próximo cambio de forma. Un backup de un esquema anterior se rechaza al importar y unos datos así se marcan (`_esquemaAnterior`) y empiezan de cero, como ya pasaba con los menores de 7. (2) `Periodo.pagosFijos` solo lee el mapa `{"<id>_YYYY-MM": {fecha, fuente, monto}}` que escribe la app: se quitan el formato en array, el valor `true` y el respaldo al monto actual del gasto fijo (un pago sin monto cuenta 0). (3) Se quitan dos alias que nadie leía: `window._difBenefs` (Encargos) y `_difRenderHistorial` (Diferencial; Encargos llama directo a `diffRenderHistorial`).
**Pruebas:** `nucleo.test.js` pierde los bloques de las migraciones v8 y v9 y gana "estado de Spotify" (por defecto completo y guardia de las cuatro llaves sueltas), "un backup de un esquema anterior se rechaza" y "un backup de esta versión no cambia al pasar por `aplicarMigraciones`"; los fixtures de `calcHealthScore` pasan a `{ monto }` en `pagosGastosFijos`. **385/385** en `node --test tests/*.test.js` (cuentas, nucleo, libro, mesada, prestamos, sync), prueba de humo sin fallos (0 acciones sin registrar).
**CI (diagnóstico de la corrida con 12 fallos):** (a) los fallos de `historial-cuenta`, `eliminar-movimiento` y de la guardia de las llaves de Spotify eran de una copia **parcial** de la entrega (un `cuentas.test.js` anterior al cambio de `'egreso'` y de `S.spotify`, y seis archivos `.js` que aún usaban `S.spotifyHistorial`); con todos los archivos copiados pasan. (b) `smoke-browser.js` fallaba porque `node --test` ejecuta todo `.js` de la carpeta de tests y esa prueba necesita `jsdom`: se movió a `scripts/`. `scripts/` ahora encuentra solo la carpeta `tests/` o `test/`. `package.json`: se añade `npm run smoke`, `engines.node` pasa a `>=20` (jsdom 27) y jsdom se queda en `^27.4.0` (la 28 quitó `ResourceLoader`); `package-lock.json` regenerado (solo cambia `engines`). `sw.js` pasa a v37.
**Quedan, a propósito, como lista de candidatos (no se tocaron):** ver `CONTINUAR.md` §13.15.

### 🔧 Cambio (2026-10-18) — Todo el estado de Spotify en una sola llave `S.spotify` (esquema 9) (`core-state.js` y 10 archivos más, `sw.js`)
**Por qué:** el JSON guardaba Spotify en cuatro llaves sueltas con prefijo (`spotifyPersonas`, `spotifyCosto`, `spotifyCajitaId`, `spotifyHistorial`): un espacio de nombres escrito a mano, distinto de `alcancia` y `mesadas`, que ya son una llave por sección. Se mantienen **dos listas** dentro (integrantes e historial): un estado que cambia y hechos que solo se añaden son cosas distintas, y el historial de Spotify guarda a quién y qué periodos, cosa que un movimiento de cuenta no tiene (lo que sí toca una cuenta ya se refleja con espejo y libro).
**Cómo:** `S.spotify = { personas, costo, cajitaId, historial }`. Migración **v9** (`spotify-un-solo-objeto`): arma el objeto desde las cuatro llaves, las borra, normaliza valores inválidos y deja que las llaves viejas manden sobre un `spotify` vacío que ponga el estado por defecto (caso `Object.assign` de la nube sobre `S`). Nuevo `_ensureSpotify()` en `load()` (como `_ensureMesadas`): `S.spotify` siempre existe y trae sus cuatro campos. 103 referencias cambiadas en `spotify.js` (73), `wrapped.js` (15, con lectura tolerante `(S.spotify||{})` porque recibe el estado por parámetro), `busqueda-global.js`, `personas.js`, `movimientos.js`, `inicio.js`, `gastos.js`, `actividad_reciente.js`, `cuentas.js`, `sheet-stack.js` (el campo de costo conserva su id `spotifyCosto`, solo cambia dónde guarda) y `core-state.js`. `_validarEstructuraJSON` rechaza un backup donde `spotify` no sea un objeto.
**Pruebas:** `nucleo.test.js` → `v9` (migración con datos, vacía, llaves viejas sobre `spotify` vacío, valores inválidos, ya migrado, `_ensureSpotify`) y una **guardia** que impide volver a usar `S.spotifyPersonas/Costo/CajitaId/Historial` fuera de la migración; los tests de `schemaVersion` pasan a 9. La prueba de humo ahora pinta la pantalla de Spotify con datos y toca sus botones. **338/338** en `npm test` (cuentas 182, nucleo 85, libro 24, mesada 47), prueba de humo sin fallos, y `equivalencia.js` con un backup en esquema 8 (llaves viejas) migra y sale equivalente. **Sin verificar:** con un backup real y en el navegador. **Pendiente de documentar:** `docs/spotify.md` (§3 y el modelo de datos nombran `S.spotifyHistorial`; no lo tenía). Mesada (`mesadas` + `mesadaAnio`) se dejó como está a propósito. `sw.js` pasa a v36.

### 🔧 Cambio (2026-10-18) — Movimientos: se cierra E6 con la parte que vale la pena (sin tipo `'egreso'`) (`cuentas.js`, `movimientos.js`, `core-state.js`)
**Análisis (qué se hizo y qué no, para no repetirlo):** E6 era "unificar los nombres de campo". Tras la lista única de historial (`S.movimientos`) casi todo ya estaba unificado: dentro de esa lista `desc` es el título y `nota` el detalle opcional (9 sitios llevan los dos a propósito), y el resto de listas (Deudas, Encargos, Spotify con `spotifyHistorial`, tarjetas, mesadas) guardan información que un movimiento de cuenta no tiene y se quedan con su propia forma. Renombrar `nota`/`desc` en las demás habría tocado 124 usos en 17 archivos, la migración y los backups sin cambiar ningún comportamiento: **no se hace**. Lo único que seguía siendo una diferencia artificial era el tipo `'egreso'`, que `getMovimientosCuenta()` fabricaba solo para las cuentas personalizadas y cuya rama de borrado en `movimientos.js` era idéntica a la de `'salida_manual'`.
**Cómo:** todas las cuentas muestran la salida manual como `'salida_manual'`, con etiqueta "Retiro" (antes "Salida" en Nequi/Efectivo y "Retiro" en las personalizadas) y textos por defecto "Ingreso"/"Retiro" en todas (antes "Entrada de efectivo"/"Salida manual" en las demás). Se quitan las ramas y casos de `'egreso'` de `movimientos.js` (`_movExiste`, el aviso de antigüedad y el borrado), de `cuentas.js` (`getMovimientosCuenta`, `renderMovsCuenta`) y de `core-state.js`; se actualizan `cuentas.test.js` (la salida de una personalizada es `salida_manual` y su borrado devuelve el saldo) y `nucleo.test.js`.
**Verificado:** 331/331 en `npm test` (cuentas, nucleo, libro, mesada), la prueba de humo sin fallos, y `scripts/equivalencia.js` antes/después con un backup sintético: equivalente. **Sin verificar con un backup real** (no lo tengo): correr `equivalencia.js` y `conciliacion.js` con el tuyo; el cambio solo toca cómo se muestra y se borra una salida, no cómo se suma ingreso ni gasto. `sw.js` pasa a v35.

### 🔧 Cambio (2026-10-18) — Frontera limpia entre `cuentas.js` y `nu.js`: Nu se apoya en Cuentas, nunca al revés (`core-state.js`, `cuentas.js`, `nu.js`, `sw.js`)
**Por qué:** el corte del 2026-10-17 fue mecánico por líneas y dejó un ciclo: `nu.js` usaba 16 cosas genéricas de `cuentas.js` (legítimo: Nu es una cuenta) pero `cuentas.js` seguía llamando a 4 cosas de Nu (`_cdtEditId`, `renderCajitas`, `materializarIntereses`, `_cajitaActualId`). Se evaluó volver a un solo archivo y se descartó: Nu es un subdominio propio y Cuentas la capa genérica sobre la que se apoya.
**Cómo:** (1) El preview en vivo del CDT, el filtro de los campos `[data-tasa-ea]`, la rama de Nu de `renderDetalleCuenta` (ahora `renderDetalleNu()`) y la parte de Nu de `actualizarBotonesTransferir` (ahora `_nuActualizarBotonesTransferir()`) pasan a `nu.js`. (2) Se quita la llamada a `materializarIntereses` de `confirmarAgregarDinero`: era redundante, `sumarFuente` ya materializa los intereses de una cajita al sumar. (3) Nuevo registro `CuentaPantallas` en `core-state.js` (junto a `CUENTAS_FIJAS`): una cuenta con pantalla propia se registra al cargar su archivo con `{ paneles, panel, reiniciar, render, actualizarBotones }` y `cuentas.js` le pregunta lo que necesita (`abrirCuenta`, `volverSelector`, `renderDetalleCuenta`, `_showCuentasPanel`, `actualizarBotonesTransferir`); vive en el núcleo para que el orden de carga no importe. El descriptor de Nu lleva `pantallaPropia: true`: sin `nu.js`, tocar Nu en el selector no hace nada. `cuentas.js` ya no nombra nada de `nu.js`.
**Pruebas:** `cuentas.test.js` → `cuentas-nu-archivos`: `cuentas.js` no usa nada de `nu.js` y lo que Nu toma de `cuentas.js` es una lista exacta (16 nombres); `libro.test.js` ahora carga `nu.js` (lo detectó esa guardia). Nuevo `tests/smoke-browser.js` (jsdom con la página real: toca cada `data-action` y recorre selector → Nu → cajita → volver → Nequi; comprobado por mutación). La prueba de humo también compara todas las acciones `data-action` del proyecto con las registradas en tiempo de ejecución (207 usadas, 0 sin registrar, 0 duplicadas) y encontró 4 registros muertos que nadie nombraba (`encargos:abrirTraspaso`, `encargos:abrirTransferencia`, `encargos:abrirCompraTC`, `prestado:toggleExtraSection`, restos de antes de `salidaMenuIr` y de un listener directo); se quitaron de `encargos.js` y `prestado.js` (las funciones siguen, porque otras las llaman). Con la carpeta `js/` completa: 331/331 en `npm test` (cuentas, nucleo, libro, mesada). **Sin verificar en navegador:** abrir Nu → cajita → volver → Nequi, botones Mover, preview del CDT. Documentación: `nu.md` §7, `cuentas.md` (§4, §7 y funciones clave, que además describían listas ya retiradas por el libro) y `CONTINUAR.md` §13.10. `sw.js` pasa a v34.

### 🔧 Cambio (2026-10-17) — `cuentas.js` se parte en `nu.js` + `cuentas.js` (estructura, sin cambio de comportamiento)
**Por qué:** `cuentas.js` llegó a ~3.000 líneas con Nu (cajitas, CDTs, metas, chequeo, tasa) ocupando casi la mitad; el cálculo ya estaba en el núcleo (`nu-calc.js`) y lo que quedaba era un subsistema completo con sus propios botones. El proyecto es "un archivo por dominio".
**Cómo:** se movieron líneas sin reescribirlas (168 declaraciones de nivel superior: ninguna perdida ni repetida, comprobado por script) a `js/modules/nu.js`; el cableado de Nu (botones, `Events.registerAll`) se fue con Nu. Mismo grupo lazy (`cuentas: ['js/modules/nu.js','js/modules/cuentas.js']` en `lazy-loader.js`): ninguno usa al otro al cargar, solo cuando una función corre, así que el orden no importa y cada archivo carga solo. Los 19 botones de Nu pasan de `data-action="cuentas:…"` a `"nu:…"` (`index.html` y el HTML que arma `nu.js`). Se quitó además el registro muerto `cuentas:openSheet` y el objeto `S.cuentas` obsoleto de `cuentas.md`.
**Pruebas:** `cuentas.test.js` → `cuentas-nu-archivos` (cada archivo carga solo; ninguna función en los dos; todo botón registrado; ningún test carga `cuentas.js` sin `nu.js`). Los tests que cargaban `cuentas.js` ahora cargan también `nu.js`. Documentación: `nu.md` (nuevo) y `cuentas.md` recortado.

### 🔧 Cambio (2026-10-17) — Vocabulario único y toast de plata que sale (`index.html`, `cuentas.js`, `nu.js`, `gastos.js`)
Todo el flujo de meter plata a una cuenta dice "Agregar" (la tarjeta "Sumar dinero" del menú `+` → "Agregar dinero", "Sumar al saldo" → "Agregar al saldo", avisos "agregado", historial "Agregaste dinero en …") y el de sacar dice "Retirar". El toast `salida` (rojo, flecha) se usa para toda plata que sale de tus cuentas: retirar dinero, gasto registrado y pago de gasto fijo (`gastos.js`, 3 líneas). Transferir entre cuentas propias se queda en `ok` (éxito neutro). Convenciones en `guia-estilo-sheets.md` §2 bis. **Pruebas:** `cuentas-textos`.

### 🐛 Corregido (2026-10-17) — "Cajitas recalculadas: $0 — compara con la app de Nu" al cambiar la tasa (`firebase-sync.js`)
**Causa raíz:** el aviso se disparaba en cada `blur` del campo de tasa y solo mostraba `calcC().val` sumado de las cajitas: no recalculaba nada. Era un resto de cuando la tasa se aplicaba hacia atrás; con los intereses sellados en cada movimiento (`materializarIntereses`) eso ya no es posible (por eso se quitó "Vigente desde") y el Chequeo rápido cubre contrastar con Nu. Con ninguna cajita decía "$0".
**Ahora:** el aviso desaparece. Cambiar la tasa la registra en `S.historialTasasNu` desde hoy y refresca; nada más. Se quitó también el código del campo `nuTasaVigenciaFecha` (no existe en la página). **Pruebas:** `cuentas-textos`.

### ✨ Agregado (2026-10-17) — El campo de tasa solo acepta números con coma o punto (`nu-calc.js`, `firebase-sync.js`, `cuentas.js`, `index.html`)
**Antes:** permitía escribir letras y `parsePct` aceptaba "9abc" como 9. **Ahora:** `nuTasaSanear` limpia lo que se escribe (letras, signos, segundo separador; 3 enteros y 4 decimales); `nuTasaDesdeTexto` valida estricto (número completo, > 0 y ≤ 100; "9abc" y "9," no valen); un valor inválido no cambia la tasa y al salir del campo se restaura. Lo usan la tasa de las cajitas, la sugerida tras un chequeo (`confirmarCambioTasaNu`, que antes también aceptaba letras) y el saneo de la tasa de un CDT (`data-tasa-ea`). `nuTasaATexto` reemplaza cuatro `String(x).replace('.',',')` repetidos. **Pruebas:** `nu-tasa-global` → "el campo de tasa solo acepta números…", `cuentas-textos`.

### 🔧 Cambio (2026-10-17) — Misma nomenclatura en todas las cuentas: "Agregar dinero" / "Retirar dinero" (`index.html`, `cuentas.js`)
Nu ("Entró plata" / "Salió plata"), el detalle de cajita ("Agregar" / "Retirar" / "Mover") y el sheet de retiro ("Restar…") pasan a los mismos textos que Nequi, Efectivo y cuentas personalizadas: botones, títulos de sheet (`Agregar a X` / `Retirar de X`), botón "Retirar del saldo" y movimientos del historial (`Sumaste dinero en X` / `Retiraste dinero de X`). Encargos no cambia (no es una cuenta propia). **Pruebas:** `cuentas-textos`.

### ✨ Agregado (2026-10-17) — Toast de salida (rojo) y toast rediseñado (`core-state.js`, `index.html`, `cuentas.js`)
**Antes:** retirar dinero avisaba con el azul de `info`. **Ahora:** nuevo tipo `salida` (rojo con flecha) para retirar dinero de una cuenta o de Nu; `err` (rojo con X) queda para errores. Todos los toast llevan un círculo de color con su ícono, texto con mejor ajuste y `role` accesible (`alert` en errores, `status` en el resto). Gastos y transferencias mantienen su tipo. **Pruebas:** `nucleo.test.js` → `toast`; `cuentas-textos`.

### 🐛 Corregido (2026-10-17) — Chequeo rápido: en una cajita con encargos mostraba solo lo propio (`cuentas.js`, `nu-calc.js`)
**Causa raíz:** el sheet mostraba `calcC().val`, que excluye el dinero de encargos (la cajita física lo tiene y Nu muestra la suma). El usuario tenía que sumarlo a mano, y al guardar `_interpretarLecturaChequeoNu` adivinaba si lo anotado era el total o lo propio según cuál referencia quedaba más cerca.
**Ahora:** `nuValorEsperadoCajita(c)` devuelve `{propio, encargos, total}`; el sheet muestra el total que Nu debería marcar (con una nota de cuánto son encargos) y se anota siempre el total. Saldo propio = lectura − encargos, referencia = total esperado, y `S.chequeosNu.saldoReal` guarda el total. Sin sumar ni omitir nada: `calcC` ya compone intereses sobre la base total y devuelve `val` solo con lo propio. Si lo anotado es menor que el dinero de encargos de esa cajita se avisa y no se guarda. Sin encargos nada cambia. **Pruebas:** `nu-acciones` → "Chequeo rápido con encargos".

### 🐛 Corregido (2026-10-16) — El ícono y el color elegidos en "Nueva cuenta" no se marcaban y la consola lanzaba `marcarColorSeleccionado is not defined` (`index.html`, `cuentas.js`)
**Causa raíz:** `selColorNC()` llama a `marcarColorSeleccionado()` (`js/core/color-picker.js`), pero ese archivo no tenía `<script>` en `index.html` ni grupo lazy (el mapa de código ya lo marcaba como "sin `<script>`"). Al tocar un color el `ReferenceError` cortaba la función; `selIconoNC()` llama a `selColorNC()` ANTES de repintar el grid de íconos, así que el ícono tampoco se marcaba (y "Otra" seguía activa) aunque `_ncIconoSel` y `_ncColorSel` sí se guardaban: por eso la cuenta salía con el ícono correcto.
**Ahora:** `index.html` carga `color-picker.js` (núcleo eager, lo usan Cuentas, Tarjetas y Prestado). Además `editarCuentaCustom()` dejaba marcado en el grid el ícono de la última vez que se abrió el sheet (alternaba una clase `selected` sin estilo) y usaba el id inexistente `'banco'` por defecto: ahora vuelve a dibujar el grid con `renderIconGrid()` y el defecto es `'otro'`.
**Pruebas:** `tests/cuentas.test.js` → `cuenta-iconos-colores`; `tests/nucleo.test.js` → `archivos-cargados` (guardia: todo archivo de `js/core` y `js/modules` debe llegar al navegador por un `<script>`, un grupo lazy o un `import`; con el código anterior habría señalado `color-picker.js`). Los dos bloques de color en `abrirNuevaCuenta`/`editarCuentaCustom` que repetían a mano lo mismo ahora usan `marcarColorSeleccionado`. **Sin verificar en navegador real.** Los errores `content.js` / "message port closed" no son de la app (ver abajo).

### 🔧 Cambio (2026-10-16) — Una sola tasa EA para todas las cajitas de Nu: `S.nuRate` (`core-state.js`, `nu-calc.js`, `cuentas.js`, `firebase-sync.js`, migración v8)
**Causa raíz:** la tasa vivía en tres sitios. `S.nuRate` (9,25 por defecto, nadie lo elegía y NO se leía si existía la otra), `S.nuTasaGlobal` (la que se escribía en el campo) y `tasa` en cada cajita, que `save()` reescribía con `getNuTasaGlobal()` en cada guardado (la copia nunca aportaba nada; con `nuRate = 9,3` y sin `nuTasaGlobal`, las cajitas quedaban en 9,25). Además `getNuTasaGlobal()` inventaba 9,25 cuando el usuario no había puesto nada, así que no se podía saber si la tasa estaba configurada.
**Ahora:** solo existe `S.nuRate` (`null` = sin configurar). Se eliminan `S.nuTasaGlobal` y `cajita.tasa`; los CDT conservan `cdt.tasa` (el CDT nuevo se precarga con la tasa global). `getNuTasaGlobal()` devuelve 0 sin tasa (sin tasa no hay intereses, en vez de inventarla); nuevas `nuTasaConfigurada()` y `nuTasaDesdeTexto()` (`nu-calc.js`). El campo "Tasa EA %" ya no puede quedar vacío ni en 0: un valor inválido se ignora y al salir del campo se restaura.
**Migración v8 (`MIGRACIONES`, `SCHEMA_VERSION_ACTUAL` pasa a 8):** si había `nuTasaGlobal` → `nuRate = nuTasaGlobal`; con cajitas y sin ella → la que se venía usando (`nuRate` o 9,25); sin cajitas → `null`. Borra `nuTasaGlobal` y `cajita.tasa`. Corre al cargar de Firestore y al importar un backup (`aplicarMigraciones`), por eso el import/export no necesita código aparte. `historialTasasNu` no cambia.
**Import/export:** `_validarEstructuraJSON` (`configuracion.js`) rechazaba `nuRate: null` ("debe ser un número"): un backup exportado sin tasa configurada no se habría podido importar. Ahora acepta número o `null`. `encargos.js` conservaba un respaldo muerto `S.nuTasaGlobal || 9.25` (nunca se usaba porque `getNuTasaGlobal` siempre existe): ahora llama directo a `getNuTasaGlobal()`.
**Pruebas:** `tests/cuentas.test.js` → `nu-tasa-global`; `tests/nucleo.test.js` → `migraciones` (v8, sus casos) y `backup-import`. Las pruebas existentes que sembraban `nuTasaGlobal` pasaron a `nuRate`.

### ✨ Agregado (2026-10-16) — Acciones de Nu que dependen de las cajitas y de la tasa (`cuentas.js`, `index.html`)
**Antes:** "Entró plata", "Salió plata" y "Chequeo rápido" se podían abrir sin cajitas, y se podían crear cajitas sin tasa.
**Ahora:** sin tasa no se crea cajita (el botón queda deshabilitado, hay un aviso y `addCajita()` lo vuelve a comprobar y enfoca el campo). Sin cajitas, los tres botones salen deshabilitados; "Salió plata" además exige alguna cajita con saldo. Cada acción vuelve a comprobarlo (`abrirNuMovimiento`, `abrirChequeoNu`, `guardarChequeoNu`), una sola fuente del motivo (`_motivoNu*`) alimenta el título del botón, el aviso en pantalla y el mensaje. Los botones se reevalúan en cada `renderCajitas()` (lo que corre tras cada `refresh()`). Momento elegido para pedir la tasa: **al crear la primera cajita** (el campo está en la misma pantalla); como la tasa no puede quedar vacía, una cajita nunca existe sin tasa. `_setBtnTransferir` pasa a usar el nuevo `_setBtnEstado`.
**Pruebas:** `tests/cuentas.test.js` → `nu-acciones` (botones de Nu y lógica de cada acción).

### 🐛 Corregido (2026-10-16) — Un depósito en una cajita vacía ganaba intereses desde el día en que se creó la cajita (`cuentas.js`)
**Causa raíz:** el reloj de los intereses es `c.fecha`, y `materializarIntereses()` solo lo avanzaba cuando había intereses que sellar. Con la cajita en $0, `calcC()` devolvía 0 días y `c.fecha` seguía en la fecha de creación; el primer depósito (días después) se componía retroactivamente desde ahí. Escenario: cajita creada hace 5 días, depósito de $100.000 hoy → mostraba intereses de 5 días al instante.
**Ahora:** si no hay plata adentro (ni propia ni de encargos), `materializarIntereses()` pone `c.fecha = hoy()`: el reloj arranca con el depósito. No cambia nada con saldo > 0.
**Pruebas:** `nu-acciones` → "el reloj de los intereses arranca con el primer depósito".

### ✨ Agregado (2026-10-16) — "Chequeo rápido" solo con cajitas que ya generaron intereses un día completo, evaluado por cajita (`nu-calc.js`, `cuentas.js`)
**Referencia temporal:** no la fecha de creación sino la de `calcC()` (`c.fecha`, último sellado de intereses o primer depósito) con plata adentro: `cajitaGeneraIntereses(c)` = tasa configurada y `calcC(c).dias >= 1`. `cajitaChequeable(c)` suma una excepción: una cajita ya chequeada HOY (sale de `S.chequeosNu`, sin estado nuevo) sigue disponible hoy, porque el chequeo reinicia su reloj y, sin esto, no se podía corregir una lectura mal anotada (lo cubría una prueba existente). `cajitasChequeables()` es la lista. El botón se deshabilita mientras ninguna cumpla (con aviso del motivo); el sheet lista solo las que cumplen y avisa cuántas faltan; `guardarChequeoNu` ignora cualquier cajita que no cumpla. Una cajita nueva no afecta a las demás. **Consecuencia a conocer:** tras "Entró/Salió plata" una cajita sale del chequeo hasta el día siguiente (su reloj se reinicia hoy).
**Pruebas:** `nu-acciones` → "qué cajitas entran al Chequeo rápido (una por una)". Las pruebas existentes de `chequeo-nu` ahora siembran la tasa y cajitas con 3 días de intereses.

### 🐛 Corregido (2026-10-16) — "Retirar dinero" se podía abrir con saldo 0 (`cuentas.js`)
**Ahora:** en Efectivo, Nequi, cuentas personalizadas (y en el detalle de cajita) el botón sale deshabilitado con saldo menor a $0,01 y `abrirRestarDinero()` lo vuelve a comprobar con el mensaje "No hay saldo para retirar en esta cuenta". `confirmarRestarDinero()` ya rechazaba montos mayores al saldo ("Saldo insuficiente en …"): se dejó igual y ahora tiene prueba de regresión junto con el retiro válido. Se reevalúa al pintar el detalle (también tras cada `refresh()`).
**Pruebas:** `tests/cuentas.test.js` → `retirar-sin-saldo` (3 tipos de cuenta); el bloque `restar-dinero` ahora carga `fuentes-filtro.js`, que `abrirRestarDinero` usa.

### 🔍 Investigación (2026-10-16) — Errores de consola ajenos a la app
`content.js:18 ... reading 'useCache'`, `Unchecked runtime.lastError: The message port closed...` y `A listener indicated an asynchronous response ... globals-front.js`: la app no tiene ningún `content.js` ni `globals-front.js` (no están en el repo ni en el HTML) y no usa `chrome.runtime`; son scripts de contenido de una extensión del navegador. No se tocó nada. Para confirmarlo: abre la app en una ventana de incógnito sin extensiones, o desactiva las extensiones una a una. El único error propio era `marcarColorSeleccionado` (arriba).

### 🔧 Cambio (2026-10-07) — Textos de la interfaz unificados en tuteo (se mezclaba con voseo)

Verificado: `spotify.js`, `alcancia.js` e `index.html` mezclaban voseo ("Ingresá", "Elegí", "Seleccioná", "Registrá", "Marcá", "sabés", "No tenés") con tuteo ("Selecciona", "Ingresa", "Revisa"). El resto de la app (`core-state.js`, `movimientos.js`, `inicio.js`) ya estaba en tuteo, así que se unificó hacia ahí en 21 líneas: `spotify.js` (3), `alcancia.js` (13) e `index.html` (5 en Spotify, Mesada, Plata comprometida y eliminar cuenta). Solo cambian los textos mostrados; ningún id, clave ni lógica. **Pendiente:** `cuentas.js` no se revisó (no estaba disponible en esa sesión); conviene un `grep` por las mismas formas.

### 🔧 Refactor (2026-10-07) — Las reglas de los campos del CDT viven en una sola función pura, `validarCamposCDT` (`cuentas.js`)

**Antes:** al arreglar la edición del CDT, `guardarCDT()` quedó con una copia de las reglas de `confirmarCrearCDT()` (tasa, retención, apertura y vencimiento). Dos copias de la misma regla se desalinean con el tiempo: ya se habían separado (el vencimiento vacío avisaba con dos textos distintos y la tasa se validaba solo al editar).

**Ahora:** `validarCamposCDT(campos, ahora?)` es pura (no lee el DOM ni muestra avisos) y la usan crear y editar. Cada una pasa sus valores por defecto: al crear, tasa 9,25 y RTE 4; al editar, los valores actuales del CDT. `confirmarCrearCDT()` conserva el monto mínimo de $50.000 y el chequeo contra el saldo de la cajita, que solo aplican al crear. `guardarCDT()` no cambia su comportamiento.

**Cambios visibles (a propósito):**
- Al crear, una tasa escrita como `0` o como texto que no se pueda leer ahora se rechaza con "La tasa (EA) debe ser un número mayor que 0"; antes se convertía en 9,25 sin avisar. La tasa vacía sigue valiendo 9,25.
- Un vencimiento vacío avisa siempre con "Debes definir la fecha de vencimiento" (al editar decía "Fecha de vencimiento requerida").
- Al crear, si hay varios errores a la vez, el aviso del monto mínimo sale después de los de tasa, retención y fechas (antes salía en medio).

**Tests:** nuevo `tests/cdt-campos.test.js` (11 tests). Prueba la función pura (campos válidos, tasa y RTE por defecto y rechazadas, RTE 0, apertura futura, vencimiento) y la edición real: con la cajita en $0 y con saldo solo sale "CDT actualizado", sin crear otro CDT ni mover plata; los errores no tocan el CDT y dejan el sheet abierto; cancelar una edición y abrir "crear" devuelve el sheet a modo crear sin pisar el CDT anterior. Con ese archivo y `nu-cdt`, `chequeo-nu`, `restar-dinero`, `transferir`, `calcPatrimonioTotal`, `calcHealthScore`, `deudas` y `totalPrestadoPendiente` pasan 97 de 97 en una copia con un stub de DOM mío; falta correr la suite completa en tu repo.

### 🗑️ Eliminado (2026-10-05) — CSS de cajitas sin uso (`styles.css`)

**Qué se borró:** 29 reglas (y los 5 comentarios de sección que quedaban vacíos) de dos diseños anteriores de cajita: el acordeón (`.cajita`, `.cajita-header`, `-header-left`, `-header-right`, `-chevron`, `-body`, `.cajita.expanded …`, `-collapsed`, `-expanded`, `-toggle-btn`), la tarjeta editable (`.cajita-top`, `-name`, `-grow`, `-fields`) y el CDT en línea (`.cajita-cdt-box`, `-locked`, `-val`, `-meta`).

**Cómo se comprobó:** ninguna de esas clases aparece como clase en `index.html` ni en los módulos JS revisados (incluidos `prestado`, `mesada`, `encargos`, `alcancia`, `spotify`, `gastos`); los únicos usos eran las funciones ya eliminadas de `cuentas.js`. Las llaves del archivo quedan balanceadas (445/445).

**Se conserva** porque sí tiene referencia: `.cajita-val` (selector de ocultar saldos), `.cajita-limit-msg`, `.cajita-meta-*` y `.cajita-row-hover` (usados por `cuentas.js`). Antes de desplegar, busca `class="cajita` y `cajita-header` en los módulos que no revisé.

### 🔧 Refactor (2026-10-05) — Prestado, Encargos y Alcancía reutilizan lo compartido en vez de repetirlo (`prestado.js`, `encargos.js`, `alcancia.js`)

- **`prestado.js`:** `_getPrestSplitFuentesOptions`, `_getMdSplitFuentesOptions` y el select de "Yo debo" (`md_cuenta`) armaban las `<option>` a mano con `FuentesFiltro.filtrar()`; ahora usan `FuentesFiltro.optsHtml()` (plata que sale) o `buildFuentesOptsHtml({incluirTC:false})` (plata que entra, sin filtrar por saldo). La opción "Ganancia" del split de préstamo se sigue agregando aparte.
- **`encargos.js`:** el mapa `{nequi:'#ff4da6', efectivo:'var(--amber)'}` de "Encargos en esta cuenta" salió de `CUENTAS_FIJAS` (`getCuentaFija()`).
- **`alcancia.js`:** el historial de la alcancía tenía una copia de `_alcNombreFuente()` en línea (nequi / efectivo / cajita / custom); ahora la llama. Único cambio visible: si la cajita de origen ya no existe, el nombre sale como lo resuelve `fuenteLabel()` ("Cajita Nu") en vez de "Cajita".

**Docs:** `prestado.md` (§2.1 y §5b), `encargos.md` (§7 y tabla de funciones) y `alcancia.md` (§7 y tabla de funciones) explican estos cambios y por qué sus validaciones de saldo siguen siendo propias. `sw.js` pasa a `mis-finanzas-v18` con esta tanda.

**Verificación:** prueba con DOM (jsdom) comparando, con los archivos viejos y nuevos y las funciones reales de `core-state.js` y `fuentes-filtro.js`, las opciones (valor, texto, seleccionada) de los tres selectores de Prestado: 2 tipos × 3 escenarios de saldo × 4 selecciones, todas iguales. `node --check` limpio en los tres archivos. Encargos y Alcancía sin prueba automática.

**Revisado y NO cambiado, con motivo:**
- Los avisos de saldo de Prestado (`_planMovMiDeuda`, cupo de TC), Encargos (`_validarMovEncMia`, "para prestar") y Alcancía no usan `validarSalidaFuente()`: comparan con una tolerancia de $0,50 (`Deudas.TOL_FINO`) en lugar de estricto y cada uno redacta su mensaje con el contexto del flujo ("No tenés $X en Y", "En Y solo hay $Z"). Unificarlos cambiaría textos y tolerancias; si se quiere, `validarSalidaFuente` necesitaría una opción `tolerancia`.
- Los avisos que muestran un nombre de cuenta ya escapan con `escHtml()` (`toast()` pinta HTML) y los `dialogo()` pasan el texto por `textContent`, así que no necesitan escape. No se encontraron huecos del tipo corregido en Spotify.
- `_alcNombreFuente()` conserva sus fallbacks defensivos con `typeof`.

### 🔧 Cambio (2026-10-05) — El detalle de cajita usa el mismo estilo compartido y el color de Nu viene del descriptor (`cuentas.js`, `index.html`)

**Antes:** `#cuentas-detalle-cajita` repetía `rgba(192,96,240,…)` y `var(--nu-light)` en estilos inline (5 y 5 veces) para el hero, el título y el campo de nombre, y escribía a mano los colores de Retirar y Mover.

**Ahora:** `_renderDetalleCajita()` (por donde pasan todas las rutas al detalle) pone `--cuenta` y `--cuenta-rgb` sobre el panel desde el descriptor de Nu; el hero es `.cuenta-hero` (con `.cuenta-hero-label` y `.cuenta-hero-saldo`), el título y el campo de nombre usan las variables, y Retirar y Mover usan `.cuenta-action-btn--rojo` y `--azul` (mismo aspecto). "Agregar" conserva su verde de acento. Cambio visual mínimo: el rótulo "Disponible" queda con la misma opacidad que en las demás cuentas. Ids sin cambios. No se tocaron los sub-paneles de meta y de CDTs ni las tarjetas de cajita de la lista de Nu. Sin pruebas automáticas; `node --check` limpio.

### 🐛 Corrección (2026-10-05) — "Nueva cuenta" podía quedar en modo edición si se cerraba el sheet tocando el fondo (`cuentas.js`)

**Síntoma posible:** abrir "Editar cuenta" de una cuenta personalizada, cerrar el sheet tocando fuera (en vez de "Cancelar") y abrir "Nueva cuenta": el sheet seguía con título "Editar cuenta", botón "Guardar cambios" y sin campo de saldo, y guardar renombraba la cuenta anterior en lugar de crear una. Solo "Cancelar" reiniciaba el sheet (`resetSheetNuevaCuenta`); `sheet-stack.js` también cierra los sheets al tocar el fondo.

**Ahora:** `abrirNuevaCuenta()` llama a `_resetSheetNuevaCuenta()` al abrir, igual que `abrirCrearCDT()` con el CDT. Se razonó sobre el código; no hay prueba automática de este caso.

### 🐛 Corrección (2026-10-05) — Editar un CDT mostraba "Saldo insuficiente" y, con saldo en la cajita, podía crear un CDT duplicado (`cuentas.js`, `index.html`)

**Síntoma:** al editar un CDT y guardar aparecían juntos "Saldo insuficiente. Solo tienes $0 en la cajita." y "CDT actualizado"; el CDT quedaba bien.

**Causa:** el modo edición reutiliza el sheet de crear y le ponía un segundo handler al botón (`btn.onclick = () => guardarCDT(...)`), pero el listener de `confirmarCrearCDT` (`addEventListener` al cargar) seguía activo. Al guardar corrían los dos. `confirmarCrearCDT()` toma el capital que muestra el formulario como "monto a invertir" y lo compara con el saldo libre de la cajita: con la cajita en $0 fallaba (el aviso que viste, y `guardarCDT()` seguía y guardaba); con saldo suficiente habría creado un CDT nuevo del mismo monto descontándolo de la cajita. Otro riesgo del mismo origen: si se cancelaba una edición, el botón quedaba en "Guardar cambios" y el siguiente "Crear CDT" volvía a ejecutar `guardarCDT()` sobre el CDT viejo.

**Ahora:**
- Un solo listener en el botón (`confirmarSheetCDT`) que decide por `_cdtEditId`: `guardarCDT()` si hay un CDT en edición, `confirmarCrearCDT()` si no. Se eliminó el `btn.onclick`/`_origOnclick`.
- `_cdtModoSheet(editando)` ajusta el sheet cada vez que se abre: al editar el título es "Editar CDT", el capital queda de solo lectura ("no se puede cambiar"), se ocultan "Disponible en cajita" e "Invertir todo" y el botón dice "Guardar cambios". `abrirCrearCDT()` lo devuelve a modo crear, así que cancelar una edición ya no deja estado pegado.
- `guardarCDT()` solo toca tasa, fechas y retención (capital y saldo de la cajita intactos) y valida como al crear: tasa > 0, RTE numérica entre 0 y 100 (0 es válido), apertura no futura, vencimiento obligatorio y posterior a la apertura. Antes aceptaba un vencimiento anterior a la apertura, ignoraba una RTE inválida y fallaba en silencio si la cajita o el CDT ya no existían (ahora avisa). El campo RTE vacío conserva la retención actual.
- Preview del sheet: la RTE 0 ya no se leía como 4, no muestra "Mínimo $50.000" al editar un CDT existente, y "Invertir todo" ahora actualiza la vista previa (el evento no burbujeaba hasta el listener).
- `index.html`: ids `cdtSheetTitle`, `cdtDisponibleBox` y `cdtMontoLabel` en el sheet.

**Verificación:** prueba con un DOM real (jsdom) y el HTML del sheet: editar con la cajita en $0 y con $5.000.000 deja solo "CDT actualizado", sin crear otro CDT ni mover saldo; cancelar la edición y abrir "crear" devuelve el sheet a modo crear y crea un CDT nuevo sin tocar el viejo; seis errores de validación (vencimiento anterior, vacío, RTE no numérica, RTE > 100, tasa 0, apertura futura) se rechazan sin modificar el CDT y el sheet sigue en edición; RTE 0 se acepta. `node --check` limpio. No se probó en el navegador real con tus datos.

### 🗑️ Eliminado (2026-10-05) — Migración de cuentas `migrarCuentasLegacy()` (`core-state.js`, `configuracion.js`)

**Qué era:** al arrancar, al importar un backup y en cada lectura, convertía los campos viejos `S.nequiSaldo`, `S.efectivoSaldo` y `S.cuentasPersonalizadas` al modelo único `S.cuentas` (con reglas para que un cliente viejo no pisara saldos con ceros).

**Por qué se quita:** el único documento existente ya está migrado y las cuentas que se creen desde ahora nacen en el modelo actual; no queda nada que convertir.

**Qué cambió:**
- `core-state.js`: se borra la función (≈ 20 líneas y su comentario). `_cuentasArr()` conserva solo la garantía que sí hace falta: si `S.cuentas` no existe o le falta Nequi o Efectivo (documento nuevo, nube vacía, backup sin `cuentas`), los crea en 0. `load()` llama a `_cuentasArr()` para que ese estado se guarde.
- `configuracion.js`: `leerArchivoImport()` ya no llama a la migración. `_validarEstructuraJSON()` deja de reconocer los campos viejos y, si un backup los trae sin `cuentas`, lo rechaza con "Este backup usa el formato anterior de cuentas y ya no se puede importar." (antes se convertía; ahora importarlo habría dejado Nequi, Efectivo y las personalizadas en cero sin avisar).
- Dejan de tener sentido y se pueden borrar del repo: `probar-migracion.js` (raíz) y cualquier test de la migración en `tests/`.
- **Tests:** doce tests fallaron en CI porque cargaban los saldos con los campos viejos (`nequiSaldo`, `efectivoSaldo`, `cuentasPersonalizadas`) y dependían de que la migración los convirtiera: 7 en `calcPatrimonioTotal.test.js`, 2 en `calcHealthScore.test.js`, 1 en `deudas.test.js` y 2 en `totalPrestadoPendiente.test.js`. Se actualizaron para armar `S.cuentas` directamente (helper `cuentas({ nequi, efectivo, custom })`); las comprobaciones no cambian. Con los archivos nuevos pasan los 32 tests de esos cuatro archivos; los otros 154 de la suite ya pasaban en CI.

**Verificación:** prueba con `S` vacío (crea las dos cuentas fijas en 0), con `S.cuentas` parcial (conserva saldo de Nequi y la personalizada, agrega Efectivo; idempotente) y con la validación de backups (formato viejo rechazado, formato nuevo aceptado, `cuentas` que no es array y objeto sin campos conocidos siguen dando error). `node --check` limpio. No se probó la importación de un archivo real en el navegador.

### 🔧 Refactor (2026-10-05) — Gastos y Spotify arman el selector de cuentas de salida con `FuentesFiltro.optsHtml()` (`gastos.js`, `spotify.js`, `sw.js`)

**Antes:** `abrirPagarGastoFijo()` (Gastos), `openSheet_pagarSpotify()` y `_spPagarSplitFuentesOpts()` (Spotify) filtraban con `FuentesFiltro.filtrar()` y luego escribían las `<option>` a mano, reimplementando lo que `FuentesFiltro.optsHtml()` ya hace para el split de gasto variable.

**Ahora:** los tres llaman a `optsHtml()` con su preset (`SALIDA` / `SPOTIFY`). Salida idéntica, comprobada con el `fuentes-filtro.js` real en tres escenarios de saldo (cuenta con saldo, saldos mínimos, ninguna cuenta; con y sin cajita preseleccionada; nombre con `<b>`). **Única diferencia visible:** en las filas del split de pago de Spotify la opción vacía "Selecciona una cuenta..." deja de estar bloqueada (`disabled`), igual que en el split de Gastos. Los selects donde la plata ENTRA no se tocaron: `optsHtml()` filtra por saldo y una cuenta vacía es un destino válido. `sw.js` pasa a `mis-finanzas-v17` para que los dispositivos descarguen los archivos nuevos.

### 🔧 Corrección (2026-10-05) — Spotify mostraba el nombre de la cuenta sin escapar en 3 avisos de "saldo/cupo insuficiente"; ahora Gastos y Spotify validan con una sola función (`core-state.js`, `gastos.js`, `spotify.js`)

**Hallazgo real:** en `confirmarPagarSpotify` (Pagar Spotify) tres `toast()` armaban "Saldo/Cupo insuficiente en …" con `fuenteLabel()` sin pasar por `escHtml()`, y `toast()` inserta el mensaje con `innerHTML`. El nombre de una cuenta personalizada o de una cajita es texto libre, así que era el mismo patrón ya corregido en Cuentas, Gastos, Mesada y Encargos. Gastos sí escapaba.

**Causa de fondo:** la comprobación "¿alcanza el saldo/cupo?" estaba escrita a mano en cada módulo, con redacción distinta (`— disponible:`, `. Disponible:`, `(…)`) y cada uno decidía por su cuenta si escapaba.

**Ahora:** `validarSalidaFuente(fuente, monto)` en `core-state.js` devuelve `{ok, mensaje}` con el mensaje ya escapado. Reglas: cuenta o cajita falla si saldo < monto; TC falla solo si tiene cupo configurado y no alcanza; fuente vacía, TC sin cupo o TC inexistente no bloquean. `gastos.js` (`addGastoVar`, modo simple y dividido) y `spotify.js` (`confirmarPagarSpotify`: dividido, TC y cuenta) la usan; el mensaje queda "Saldo insuficiente en X. Disponible: $N" / "Cupo insuficiente en X. Disponible: $N" en ambos. **Cambio visible:** en Gastos el texto pasa de "— disponible:" a ". Disponible:". Además `pgfActualizarSaldo()` y `confirmarPagarGastoFijo()` usan `getSaldoFuente()` en vez del alias `getSaldoActual()` (misma función).

**No se tocó:** las validaciones de Cuentas (`validarTransferencia`, restar dinero, salida de Nu) ni los mensajes en línea de gastos fijos ("Necesario: …"), por tener tests y otra redacción.

**Verificación:** prueba con 9 casos de la función nueva (igual al saldo pasa, uno más falla, efectivo en 0, TC con y sin cupo, TC inexistente, fuente vacía, nombre con `<b>` escapado); `node --check` limpio en los tres archivos. Los tests existentes de Gastos y Spotify no se corrieron: si alguno compara el texto del aviso, hay que actualizarlo.

### 🔧 Cambio (2026-10-05) — El detalle de Nu usa el mismo estilo compartido que las demás cuentas, y se borró el código sin uso de cajitas (`cuentas.js`, `index.html`)

**Antes:** el hero y los tres botones del detalle de Nu repetían `rgba(192,96,240,…)` y `var(--nu-light)` en estilos inline (unas 10 veces), mientras Nequi, Efectivo y las personalizadas ya usaban `.cuenta-hero` y `.cuenta-action-btn--*` con `--cuenta`/`--cuenta-rgb`.

**Ahora:** `renderDetalleCuenta('nu')` pone `--cuenta`, `--cuenta-rgb`, el título y el rótulo "Total Nu" desde el descriptor de Nu; el hero es `.cuenta-hero` (con `.cuenta-hero-label` y `.cuenta-hero-saldo`), los botones son `--cuenta` (Entró plata), `--rojo` (Salió plata) y `--azul` (Mover a otra cuenta), y el bloque de tasa/chequeo usa las variables. El historial de Nu recibe el color del descriptor. Cambiar el color de Nu en `CUENTAS_FIJAS` cambia selector y detalle a la vez. Ids sin cambios (`nuTotalDisp`, `btn-nu-entro`, `btn-nu-salio`, `btn-transferir-nu-det`), así que el ocultar saldos y los listeners siguen igual. El detalle de cajita (`#cuentas-detalle-cajita`) y las tarjetas de cajita conservan su morado propio; no se tocaron.

**Código sin uso eliminado:** `toggleCDT()`, `toggleCajita()` y `_expandCajitaCDTs()` (≈85 líneas): sin ningún llamador en los archivos revisados y trabajaban sobre ids (`cajita-wrap-*`, `cajita-cdt-*-*`) que el render actual no genera.

### 🔧 Cambio (2026-10-05) — El título del detalle de Nu lleva el mismo ícono que las demás cuentas (`cuentas.js`, `index.html`)

**Antes:** el detalle de Nequi, Efectivo y las personalizadas mostraba ícono + nombre en el header (lo pintaba `_renderDetalleSimple`), pero el de Nu era un `<div>` escrito a mano en `index.html` con el texto "Nu" y nada más.

**Ahora:** el bloque ícono + nombre salió de `_renderDetalleSimple` a un helper, `_tituloCuentaHtml(d)`, y lo usan los dos detalles. El título de Nu tiene id `det-nu-nombre` y `renderDetalleCuenta('nu')` lo pinta con el descriptor de Nu (`CUENTAS_FIJAS_SELECTOR`), la misma fuente del selector. Se agregó `flex:1;min-width:0` al título de Nu, igual que el de las otras cuentas. No cambia ningún dato ni saldo. El header de una cajita (`#cajita-det-nombre`) no se tocó a propósito: una cajita no es una cuenta.

### 🔧 Refactor (2026-10-05) — Nombre, color y badge de Nequi/Nu/Efectivo en un solo lugar: `CUENTAS_FIJAS` (`core-state.js`, `cuentas.js`)

**Antes:** esos tres datos estaban repetidos en `fuenteLabel()`, `fuenteBadgeClass()`, `getFuentes()`, `getFuentesSinTC()` (`core-state.js`) y en `CUENTAS_FIJAS_SELECTOR` (`cuentas.js`). Además `getFuentes()` y `getFuentesSinTC()` eran dos copias casi idénticas que solo diferían en las tarjetas de crédito.

**Ahora:** `CUENTAS_FIJAS` + `getCuentaFija(fuente)` en `core-state.js` (carga de entrada) guardan `{fuente, nombre, color, rgb, badge}`. Las cuatro funciones del núcleo la leen; `getFuentes()` y `getFuentesSinTC()` son envoltorios de `_listaFuentes(incluirTC)`; y `CUENTAS_FIJAS_SELECTOR` se arma como `CUENTAS_FIJAS` + `_SELECTOR_FIJAS_EXTRA` (estilo del selector, ícono y saldo, que son lo único que solo `cuentas.js` puede aportar porque es lazy y `nuTotal()` es suyo). Comportamiento idéntico: mismas etiquetas, mismas clases de badge, misma lista y orden de cuentas, mismos descriptores del selector.

**Verificación:** script contra los archivos anteriores y los nuevos (con las funciones extraídas y datos de prueba: cajita normal y de CDT, TC activa y cerrada, cuenta personalizada, y trece valores de `fuente` incluyendo ids inexistentes, `''`, `alcancia`, `ganancia` y desconocidos). `getFuentes()`, `getFuentesSinTC()`, `fuenteLabel()` y `fuenteBadgeClass()` devuelven exactamente lo mismo, y los tres descriptores de `CUENTAS_FIJAS_SELECTOR` quedan iguales (salvo el campo nuevo `badge`). `node --check` limpio en `core-state.js` y `cuentas.js`. No se probó en navegador.

### 🔧 Corrección (2026-10-05) — Revisión de `cuentas.js`: salidas que superaban el saldo, chequeo de Nu con campos sin anotar y RTE 0 de un CDT (`cuentas.js`)

Revisión de las funciones de `cuentas.js` que mueven plata y no se habían leído (chequeo de Nu, CDT, agregar/restar, movimientos de Nu, apertura). Cuatro defectos reales, cada uno reproducido con un test contra el código anterior antes de arreglarlo:

1. **Restar dinero (`confirmarRestarDinero`) y "Salió plata de Nu" (`confirmarNuMovimiento`) permitían sacar más de lo que había.** `descontarFuente()` recorta el saldo en 0, pero `registrarSalida()` guardaba el movimiento con el monto COMPLETO: restar 20.000 de una cuenta con 5.000 la dejaba en 0 con un movimiento de −20.000, el historial no cuadraba con el saldo y, al borrar ese movimiento, `sumarFuente(monto)` devolvía 20.000 (15.000 inventados). La pantalla solo pintaba el resultado en rojo, sin bloquear. Ahora se rechaza con "Saldo insuficiente en X (saldo)", comparando en centavos (misma regla y mismo mensaje que `gastos.js`, `spotify.js` y Transferir). En Nu la comprobación va antes de materializar intereses para no dejar la cajita modificada a medias.
2. **Chequeo rápido de Nu (`guardarChequeoNu`): un campo tocado y dejado en `0,00` se guardaba como "esta cajita tiene $0".** `money-input.js` rellena `0,00` al enfocar y nada lo limpia al salir. Ponía la cajita en 0 (con aviso solo si se alejaba más de max($1.000; 2 %), o sea, en silencio para cajitas chicas) y ensuciaba `S.chequeosNu`. Ahora 0 significa "no anoté"; si de verdad quedó vacía, se registra el retiro como movimiento (lo que ya decía el aviso).
3. **`confirmarCrearCDT` convertía un RTE de 0 en 4** (`parsePct(...)||4`), mientras que `guardarCDT` (editar) sí aceptaba 0. Ahora: vacío = 4, 0 se respeta, texto no numérico o > 100 se rechaza.
4. **Agregar/restar dinero con monto 0 no avisaba nada** (`return` silencioso). Ahora muestra "Ingresa un monto válido".

**Verificación:** `tests/restar-dinero.test.js` (8), `tests/chequeo-nu.test.js` (10) y `tests/nu-cdt.test.js` (12). Contra el código anterior fallan exactamente los casos que reproducen cada defecto y pasan los de control; con los arreglos pasan los 30. **Sin verificar en navegador real.**

**Observaciones sin cambio:** (a) prestar desde una cuenta en `prestado.js` (`_planPrestamo`) no compara el monto con el saldo de origen: medido en la capa de datos, prestar 150.000 desde una cuenta con 100.000 deja la cuenta en 0, la deuda en 150.000 y sube el patrimonio 50.000. No se confirmó si la pantalla lo impide (`FuentesFiltro`, que filtra las cuentas del selector, no estaba entre los archivos revisados); (b) el tuteo y el voseo conviven en los textos (`cuentas.js`, `spotify.js`, `alcancia.js`): puede ser intencional y no se tocó.


### 📝 Documentación (2026-10-04) — Las formas de guardar un movimiento de cuenta, escritas en un solo lugar (`cuentas.md`, `proyeccion-financiera.md`)

Era conocimiento repartido en comentarios de `cuenta-efectos.js`, `cuentas.js` y `movimientos.js`. Ahora `cuentas.md` (§4, "Cómo se guarda un movimiento de una cuenta") separa movimiento **manual** (siempre `S.movimientos`) de **espejo** (una forma por tipo de cuenta: Nequi/Efectivo en `S.movimientos` con `entrada`/`salida`; personalizada en `c.movimientos` con `ingreso`/`egreso`; cajita en `cajita.historial`), explica los gemelos viejos de las personalizadas, lista lo que no pasa por `registrarMovEspejo()` a propósito (Me deben, Mesada, Alcancía, Encargos) y deja escrito el acoplamiento entre el `tipo` mostrado y el borrado de `movimientos.js`. §3 suma dos reglas: los espejos nuevos nacen con `_esEspejo`, y no unificar `egreso`/`salida_manual` sin tocar el borrado. `proyeccion-financiera.md` citaba `S.nequiSaldo`, `S.efectivoSaldo` y `S.cuentasPersonalizadas` (reemplazados por `S.cuentas` el 2026-10-01); corregido. Sin cambios de código.


### 🔧 Refactor (2026-10-04) — El historial de una cuenta lo arma UNA sola función (`cuentas.js`)

**Antes:** `getMovimientosCuenta()` (Nequi, Efectivo, cajitas) y `_getMovimientosCuentaCustom()` (personalizadas) eran dos funciones casi gemelas (184 y 148 líneas); cuatro bloques (gastos, préstamos dados, transferencias, Spotify) estaban duplicados casi palabra por palabra y ya se habían desviado: la personalizada no mostraba `cat`/`nota` de un gasto, ni la etiqueta "Encargos", ni las otras cuentas de un préstamo dividido, y un movimiento de Mesada en una personalizada salía como "Movimiento manual". Cada arreglo había que hacerlo dos veces (Spotify, Alcancía y transferencias se corrigieron en las dos, una por una).

**Ahora:** `getMovimientosCuenta(tipo)` es la única función, con un bloque por fuente y un predicado `coincide(fuente)` (`'nu'` = cualquier cajita; el resto, la fuente exacta). `_getMovimientosCuentaCustom` desaparece. Se quitaron además las ramas de Alcancía que quedaban dentro de un bloque que ya hacía `return` antes (código muerto en las dos funciones).

**Diferencias que se conservan a propósito** (opciones explícitas, comentadas en el código): (1) el tipo de una salida manual: `'egreso'` en personalizadas y `'salida_manual'` en las demás — `movimientos.js` elige la rama de borrado y de reversión de saldo por ese tipo, así que unificarlo habría roto el borrado; (2) la lista propia: `c.movimientos` entera y leída primero (personalizadas) vs `cajita.historial` solo `_secundario` y después (cajitas); (3) el texto cuando no hay descripción; (4) el salto del gemelo viejo de S.movimientos.

**Cambios visibles (solo cuentas personalizadas, todos aditivos):** un gasto ahora trae categoría y nota, y se etiqueta "Encargos" si su nota lo menciona; un préstamo dividido entre cuentas muestra las otras cuentas; un movimiento secundario (Mesada, etc.) usa su sección de origen en vez de "Movimiento manual". Nequi, Efectivo y cajitas: resultado idéntico campo por campo.

**Verificación:** `tests/historial-cuenta.test.js` (28 tests). Prueba dorada: compara la función nueva con las dos anteriores, congeladas en `tests/support/historial-legacy.js`, sobre los mismos datos (fixture con ~90 registros: manuales, aperturas, intercambios de Encargos, espejos, Alcancía, gastos, préstamos simples y divididos, Spotify con abonos y sin id, transferencias, gemelos viejos, filas sin id) para 6 cuentas: mismas filas, mismo orden, y solo difieren los cambios deliberados, cada uno con su valor esperado. 12 mutaciones (perder el salto del gemelo, unificar el tipo de salida, mostrar el ingreso de Alcancía, contar pagos de Spotify, no restar abonos, perder transferencias entrantes o préstamos divididos, listar espejos no secundarios, perder `c.movimientos`, que Nu deje de juntar las cajitas, invertir el desempate) hacen fallar entre 2 y 11 tests. **Sin verificar en navegador real.** `historial-legacy.js` y la comparación son transitorios: se pueden borrar cuando la función lleve un tiempo en producción sin incidencias.


### 🔧 Corrección (2026-10-04) — Una sola definición de "ingreso real" para Inicio, Análisis y Wrapped (`core-state.js`, `inicio.js`, `analisis.js`, `wrapped.js`, `cuenta-efectos.js`)

**Antes:** la pregunta "¿esto cuenta como ingreso del mes?" se respondía en tres sitios, con tres reglas:
- **Inicio** exigía además que la entrada tuviera cuenta (Nequi, Efectivo, cajita, personalizada) o `_prestadoDirectamente`, y sumaba aparte los `ingreso` de `c.movimientos` de las cuentas personalizadas.
- **Análisis y Wrapped** solo miraban `S.movimientos` con el filtro `_esEntradaEspejoNoIngreso`: no veían `c.movimientos` ni exigían cuenta.

Dos divergencias reales: una entrada sin cuenta ni bandera contaba en Análisis/Wrapped y no en Inicio (así falló el perdón de "Yo debo"), y un ingreso que solo vive en `c.movimientos` (p. ej. el extra de un préstamo que cae en una cuenta personalizada, porque `registrarMovEspejo` escribe ahí) contaba en Inicio y no en Análisis/Wrapped. Con un mismo conjunto de datos de prueba, Inicio daba 126.600 y Wrapped 122.311 para el mismo mes.

**Regla única** (decisión del 2026-10-04): ingreso real = plata nueva que sube el patrimonio, tenga o no cuenta. Se implementa una vez, en `core-state.js`:
- `entradasIngresoReal(estado?)` devuelve la lista de movimientos que cuentan: `S.movimientos` tipo `entrada` que no sean espejo + `c.movimientos` tipo `ingreso` que no sean espejo; los datos viejos escritos en las dos listas con el mismo id (`confirmarMovCustom()`, retirada) se cuentan una vez. Recibe el estado porque Wrapped trabaja sobre el `S` que le pasan.
- `ingresosRealesDelMes(mes, estado?)` suma esa lista por mes. La mesada y los ingresos fijos los sigue sumando cada pantalla aparte.
Inicio (`calcHealthScore`), Análisis (balance del mes y del mes anterior) y Wrapped (periodo, año y "mayor ingreso") la usan. Se borraron las tres copias de la lógica.

**Espejos marcados por defecto:** `registrarMovEspejo()` ahora marca todo espejo nuevo con `_esEspejo: true`, y `_esEntradaEspejoNoIngreso()` lo respeta (después de `_esExtraIngreso`, `_esPerdonRecibido` y `_esDiferencialEncargo`, que tienen prioridad: un espejo que sea plata nueva se marca con esas banderas vía `extra`). Así un módulo nuevo es seguro por defecto y ya no depende del texto de `desc` ni de que su `_origenSeccion` empiece por "Prestado". Los datos anteriores no tienen la bandera y siguen cayendo en los fallbacks por texto/prefijo, que **no** se borraron.

**Qué puede cambiar en pantalla:** Inicio puede subir si hay entradas reales sin cuenta ni bandera (el diagnóstico `diagnostico-ingresos.js` sobre los datos reales dio 0 de esas). Análisis y Wrapped pueden subir si hay ingresos que solo viven en `c.movimientos` (a comprobar con `diagnostico-ingresos-cuentas.js`). Si ambos dan vacío, ninguna cifra cambia.

**Verificación:** `tests/ingreso-real.test.js`, 17 tests con `load-app.js`: qué cuenta y qué no (sueldo, regalo, sin cuenta, perdón, extra, diferencial; espejos de Mesada/Prestado, reposiciones, márgenes viejos, intercambios, alcancía destapada), cuentas personalizadas (solo en cuenta, espejos, gemelos viejos una sola vez), espejos nuevos nacen marcados, y Inicio / `ingresosRealesDelMes` / Wrapped dan la misma cifra con los mismos datos. Los 17 fallan contra el código anterior y pasan con el nuevo; 6 mutaciones (no filtrar espejos de cuenta, quitar el dedupe del gemelo, quitar `_esEspejo` en el filtro o en `registrarMovEspejo`, Wrapped o Inicio con su regla vieja) hacen fallar entre 1 y 4 tests. **Sin verificar en navegador real.**


### 🔧 Corrección (2026-10-04) — Transferir: una sola función valida toda la transferencia, y un monto negativo ya no pasa (`cuentas.js`)

**Antes:** `_trValidarMonto()` solo validaba la regla del monto (centavos y mínimo con Efectivo). El resto (cuentas faltantes, origen = destino, monto vacío, saldo) estaba escrito dos veces: en `actualizarTransfPreview()` y en `confirmarTransferir()`. Además `confirmarTransferir()` solo comprobaba `!monto`, así que un monto **negativo** pasaba todas las validaciones (`_trValidarMonto` lo ignoraba, y el saldo es mayor que un negativo) y llegaba a `descontarFuente(origen, -X)`, que **suma** al origen y resta del destino. Revisado `money-input.js`: el campo bloquea todo salvo dígitos (teclado) y el pegado solo acepta números > 0, así que **desde la pantalla no se podía llegar a un monto negativo**. Era un hueco latente (cualquier otro camino que llame a la función, o un cambio futuro en el input), no un bug activo; ahora la validación no depende del input.

**Ahora:** `validarTransferencia({origen, destino, monto, saldoOrigen, etiquetaOrigen})` devuelve `{ok:true}` o `{ok:false, codigo, mensaje}` (`falta_cuenta`, `mismo`, `sin_monto`, `monto`, `saldo`). Rechaza monto no numérico, NaN, Infinity, 0 y negativos. La vista previa y la confirmación la usan, así que dicen lo mismo. `_trValidarMonto` desaparece (solo la usaban esos dos sitios). Las reglas de negocio no cambian.

**Cambios de comportamiento (deliberados):** (1) monto negativo o no finito → "Ingresa un monto válido" y no se escribe nada; (2) con origen y destino vacíos la vista previa ya no dice "deben ser diferentes", queda en blanco; (3) el aviso de saldo insuficiente ahora lo da la misma función en la confirmación (mismo texto, mismo escape del nombre de cuenta).

**Verificación:** `tests/transferir.test.js`, 24 tests con `node --test`, que cargan `core-state.js`, `calc-helpers.js`, `cuenta-efectos.js` y `cuentas.js` reales con `tests/support/load-app.js` (modo `permissive`; `getSaldoActual`, que vive en `index.html`, se enlaza a `getSaldoFuente`) y usan los saldos reales de `S.cuentas`: centavos (cajita↔cajita sí; con Nequi, Efectivo o personalizada no), mínimo $50 con Efectivo en las dos direcciones, saldo comparado en centavos, orden de los avisos, y que cada rechazo no llama `descontarFuente`/`sumarFuente`, no guarda y no cierra el sheet. Probado también por mutación: quitar la regla de centavos, el mínimo, el saldo o la comprobación origen = destino hace fallar entre 2 y 4 tests; el rechazo de montos ≤ 0 tiene dos guardas redundantes a propósito y los tests fallan solo si se quitan las dos. **Sin verificar en navegador real.**


### 🔧 Corrección (2026-10-02) — El botón "ocultar saldos" vuelve a ocultar el selector y el detalle de cuentas (`mejoras-adicionales.js`)

**Causa:** el módulo apuntaba a elementos que desaparecieron al unificar las cuentas (etapas 1 y 2). `MONEY_SELECTORS` listaba `#sel-nequi-saldo`, `#sel-nu-saldo`, `#sel-ef-saldo`, `#det-nequi-saldo`, `#det-ef-saldo` y `#det-custom-saldo`, y `SALDO_DINAMICO_IDS` observaba `#custom-cuentas-list`. Ningún selector coincidía con el HTML nuevo, así que el botón cambiaba de ícono pero no ocultaba nada de esas pantallas.

**Ahora:**
- `SALDO_DINAMICO_IDS`: `custom-cuentas-list` → `selector-cuentas-lista`. Es el mecanismo correcto para el selector: `renderSelectorCuentas()` reescribe todo el contenedor con `innerHTML` en cada `refresh()`, y esa lista envuelve cada monto `$…` en un `<span class="saldo-inline">` y lo vuelve a envolver con un `MutationObserver` tras cada repintado. Cubre Nequi, Nu, Efectivo y las personalizadas con un solo contenedor (antes Nequi, Nu y Efectivo eran elementos fijos con clase puesta una vez; ese enfoque no sirve con elementos que se recrean).
- `MONEY_SELECTORS`: se quitan los seis ids muertos y se agrega `#det-cuenta-saldo` (saldo del detalle unificado; es un elemento fijo, solo cambia su texto).
- Los nombres de las cuentas siguen visibles: solo se oculta el monto.

**Verificado en jsdom** con el `mejoras-adicionales.js` real y el `index.html` real (13 comprobaciones): arrancar con saldos ocultos restaura el estado, el botón alterna selector y detalle, y los saldos siguen ocultos (o visibles) tras volver a repintar el selector. `hookGlobal` se estubeó (viene de `js/core/hook-global.js`). Sin probar en navegador real.

**Observación (sin cambiar):** los montos de la lista de movimientos del detalle de una cuenta (`#det-cuenta-movs`, antes `#det-nequi-movs`, etc.) no figuraban en `SALDO_DINAMICO_IDS` ni usan `.row-amount`, así que el botón nunca los ocultó.

### 🔧 Corrección (2026-10-02) — Búsqueda global muestra el nombre de la cuenta (no su id) y las flechas del selector quedan iguales

- **`busqueda-global.js`:** en los resultados de "Movimiento" el meta mostraba `m.fuente` crudo (`cajita:mpkdex5cksh`, `custom:mtrq491i8sj`, `nequi`). Ahora pasa por `fuenteLabel()` vía un helper `_fuenteTexto()`: `nequi` → "Nequi", `cajita:ID` → "Nombre (Nu)", `custom:ID` → nombre de la cuenta, `tc:ID` → nombre de la tarjeta. Dos casos que `fuenteLabel()` no resuelve a texto se cubren en el helper: `ganancia` (devuelve un SVG, que `escHtml` mostraría como texto) y una cuenta personalizada ya borrada (devuelve el id crudo; ahora muestra "Cuenta eliminada").
- **`styles.css`:** la flecha de las tarjetas (Nequi, Nu) usaba el color de la cuenta al 40 % de opacidad; la de las pastillas (Efectivo y personalizadas) usa el color completo. Ahora la tarjeta usa también `var(--cuenta)` completo, como la pastilla (se mantiene su posición abajo a la derecha).

### 🔧 Corrección (2026-10-02) — "Gastos altos" cuenta las cuentas personalizadas y `encargos.js` protege `cuentaActual`

- **`inicio.js` (chequeo de "Gastos altos"):** el disponible contra el que se compara el 80 % era `nu + nequi + ef`; ahora suma también las cuentas personalizadas (`cuentasCustom()`), igual que el "Disponible" del hero (`refresh()`) y `liquidoReal` del mismo archivo. Efecto visible: quien tenga saldo en cuentas personalizadas deja de ver el aviso cuando solo lo disparaba haber dejado esa plata fuera de la cuenta. Sin saldo en personalizadas el resultado es idéntico al anterior. Es una decisión de criterio (no un error de sintaxis): si se prefiere el cálculo anterior, es borrar la línea `custom` y su suma.
- **`encargos.js` (`eliminarMovimientoEncargo`):** `cuentaActual` se leía sin `typeof`. Vive en `cuentas.js` (lazy), así que si ese módulo no estaba cargado, borrar un movimiento de un encargo tiraba `ReferenceError` justo antes de reabrir el detalle del encargo. Ahora usa el mismo guard que `refresh()`, `sheet-stack.js` y `movimientos.js`. Con el estado único de la etapa 3 también repinta la cuenta abierta cuando es personalizada.

### 🔧 Cambio (2026-10-01) — Modelo único de cuentas: `S.cuentas` reemplaza a `S.nequiSaldo`, `S.efectivoSaldo` y `S.cuentasPersonalizadas` (etapa 3 de 3)

**Causa:** Nequi y Efectivo eran dos números sueltos, las personalizadas una lista aparte, y `save()` volvía a leer los dos números de inputs ocultos del DOM (`#nequiSaldo`, `#efectivoSaldo`) — cada módulo que movía plata tenía que acordarse de espejar el input antes de guardar (ver el bloque "Sincronizar DOM antes de save()" de `alcancia.js`). Además cada módulo repetía su propio `(S.cuentasPersonalizadas||[]).find(x=>x.id===id)` (una treintena de veces) y había dos variables de estado para la cuenta abierta.

**Ahora:**
- **Datos:** `S.cuentas = [{id:'nequi',tipo:'nequi',saldo}, {id:'efectivo',tipo:'efectivo',saldo}, ...personalizadas {id,tipo:'custom',nombre,icono,color,saldo,movimientos}]`. Las personalizadas conservan su forma de siempre (más `tipo:'custom'`); Nu sigue en `S.cajitas`. El identificador de fuente no cambia (`'nequi' | 'efectivo' | 'custom:ID'`). `S` ya no trae los tres campos viejos por defecto.
- **`core-state.js`:** helpers `getCuenta(id)`, `getCuentaCustom(id)`, `cuentasCustom()`, `getCuentaDeFuente(fuente)` y `migrarCuentasLegacy()`. `sumarFuente()`, `descontarFuente()` y `getSaldoFuente()` tratan Nequi, Efectivo y personalizadas por el mismo camino (misma semántica: piso en 0, `exacto` sin piso). `save()` ya no relee saldos del DOM; `load()` migra. Los inputs `#nequiSaldo` / `#efectivoSaldo` se eliminan de `index.html`.
- **Migración (`migrarCuentasLegacy`):** idempotente; corre en `load()` (que ya se llama tras cada hidratación desde Firestore y en cada snapshot), en `importarJSON()` y en cada lectura. Si `S` trae alguno de los campos viejos, son la verdad: se arma `S.cuentas` desde ellos y se borran. Eso cubre documentos de la nube anteriores al cambio, backups JSON viejos y dispositivos con la versión anterior. Excepción deliberada: un valor viejo en 0 (o una lista vieja vacía) no pisa una cuenta que ya tiene saldo — un cliente viejo que abre un documento ya migrado no ve ningún saldo y, si guarda, devuelve ceros.
- **Estado único de cuenta abierta:** `cuentaActual` ahora guarda la fuente completa (`'custom:ID'` para las personalizadas) y se elimina `_customCuentaActualId` (y `_fuenteAbierta()`). `refresh()`, `sheet-stack.js`, `movimientos.js` y `cuentas.js` dejan de tener dos ramas.
- **Resto de módulos** (`cuentas`, `movimientos`, `alcancia`, `inicio`, `busqueda-global`, `actividad_reciente`, `encargos`, `mesada`, `plata_comprometida`, `prestado`, `wrapped`, `configuracion`): los `find` repetidos pasan a `getCuentaCustom(id)`, los recorridos a `cuentasCustom()` y las lecturas de Nequi/Efectivo a `getSaldoFuente()`. `crearCuentaCustom()` agrega a `S.cuentas` con `tipo:'custom'` y `eliminarCuentaCustom()` filtra `S.cuentas`. En `actividad_reciente.js` la etiqueta interna `fuente:'cuentasPersonalizadas'` pasa a `'cuenta_custom'` (nadie la leía). `importarJSON()` valida `cuentas` y convierte backups viejos con `migrarCuentasLegacy()` antes de repintar.
- **`probar-migracion.js`** (nuevo, raíz del proyecto): prueba en seco con una copia de tus datos (`node probar-migracion.js backup.json js/core/core-state.js`). Usa el `migrarCuentasLegacy()` real, compara saldos antes/después, comprueba que no cambie nada más, que sea idempotente y que sobreviva un viaje por JSON.

**Cambio de formato en la nube:** el documento de Firestore pasa a traer `cuentas` y deja de traer los tres campos viejos. Una versión anterior de la app (PWA en caché de otro dispositivo, o revertir el código) no sabe leer `cuentas`: vería todos los saldos en 0. Por eso, después de desplegar: recargar con caché limpia en cada dispositivo y no abrir una versión vieja. Antes de desplegar: exportar un backup JSON desde Configuración.

**Hallazgos de esta etapa:** `inicio.js` calculaba `disp = nu + nequi + ef` (sin personalizadas) en la comprobación de "Gastos altos", y `encargos.js` referenciaba `cuentaActual` sin `typeof`. Ambos se corrigen en la entrada siguiente.

**Verificado** con el código real: migración (21 casos: documento viejo, ida y vuelta por JSON, backup viejo importado, cliente viejo en ceros, valores no cero, S vacío), `core-state.js` completo cargado sobre el `index.html` real (`load()`, movimientos de saldo, `calcPatrimonioTotal()`, `refresh()`, `save()` y payload sin campos viejos), `alcancia._sumarASaldo`, validación de backups y las pruebas del selector y del detalle de las etapas 1 y 2 (49 comprobaciones). Sin probar en navegador real ni contra Firestore.

### 🔧 Corrección (2026-10-01) — `movimientos.js`: `_rerenderCuentaActiva()` ya no llama a `abrirCustomCuenta()` (resto de la etapa 2)

`_rerenderCuentaActiva()` (se usa al borrar un movimiento) tenía una rama para cuentas personalizadas que llamaba a `abrirCustomCuenta()`, eliminada al unificar el detalle de cuentas simples. La rama además estaba muerta desde antes: comparaba `cuentaActual === 'custom'`, pero una cuenta personalizada abierta deja `cuentaActual` en `''` (su identificador es `_customCuentaActualId`), así que la función salía en la primera línea y quien refrescaba el detalle era `refresh()`. Ahora vuelve a pintar la cuenta abierta con `renderDetalleCuenta()` (fuente `'custom:ID'` para las personalizadas) y usa `typeof` para las dos variables, que viven en `cuentas.js` (grupo lazy). Verificado en jsdom; sin probar en navegador real.

### 🔧 Cambio (2026-10-01) — Detalle de cuenta unificado: Nequi, Efectivo y las personalizadas comparten una sola pantalla (etapa 2 de 3)

**Causa:** el detalle de una cuenta simple estaba escrito tres veces: `cuentas-detalle-nequi`, `cuentas-detalle-efectivo` y `cuentas-detalle-custom` en `index.html` (HTML casi idéntico), con ids por cuenta (`det-nequi-saldo`, `det-ef-movs`, `btn-agregar-efectivo-det`, …), tres ramas en `abrirCuenta`/`renderDetalleCuenta`/`volverSelector`, una función aparte para las personalizadas (`abrirCustomCuenta` + `renderMovsCustom`) y una rama duplicada de esa misma lógica dentro de `refresh()`.

**Ahora:**
- `index.html`: un solo `#cuentas-detalle-simple` (header con editar/eliminar solo para personalizadas, hero, banner de saldo inicial, encargos, filtros y movimientos). Salen 130 líneas de HTML. Nu conserva su pantalla propia (`cuentas-detalle-nu`: cajitas, CDTs, chequeo de tasa).
- `cuentas.js`: `abrirCuenta(fuente)` acepta `'nequi' | 'nu' | 'efectivo' | 'custom:ID'`; `renderDetalleCuenta(fuente)` delega en `_renderDetalleSimple()`, que lee el descriptor de la cuenta (los mismos de la etapa 1, ahora con `etiquetaDetalle`, `cuentaKey`, `esCustom` e `iconoHtml(size)`; helper `_descriptorCuenta(fuente)`). Se eliminan `abrirCustomCuenta()` y `renderMovsCustom()`. Los botones del detalle son un único listener delegado sobre `#cuentas-detalle-simple` que actúa sobre `_fuenteAbierta()`. `actualizarBotonesTransferir()` maneja un solo botón. `renderMovsCuenta()` recibe un 5º parámetro opcional con el id del contenedor de filtros.
- `core-state.js`: `refresh()` ya no tiene una rama aparte para la cuenta personalizada abierta; llama a `renderDetalleCuenta(fuente)` en los dos casos.
- `sheet-stack.js`: el hook de `showScreen('cuentas')` llama a `renderSelectorCuentas()` (cierra el cambio pendiente de la etapa 1) y re-renderiza la cuenta abierta con `renderDetalleCuenta()`; el banner de saldo inicial pasa a ser uno solo (`banner-apertura-cuenta`).
- `styles.css`: `.cuenta-hero*` y los modificadores `.cuenta-action-btn--cuenta|rojo|azul`, con el color por las mismas variables del selector.

**Bugs que se corrigen de paso:**
- El hook de `showScreen('cuentas')` llamaba a `renderDetalleCustomCuenta()`, una función que nunca existió: el detalle de una cuenta personalizada abierta no se re-renderizaba al volver a la pantalla.
- `refresh()` solo actualizaba saldo, movimientos y encargos de la cuenta personalizada abierta; ahora repinta todo (banner, botón de transferir deshabilitado según saldo).
- Las cuentas personalizadas nunca mostraron el banner "Registrar saldo inicial": el código escribía en `banner-apertura-custom`, pero ese div no existía en `index.html`. Ahora lo tienen, y respetan el toggle "Saldo inicial" de Configuración.
- Los filtros de movimientos de una pantalla compartida: los listeners de `renderMovsFiltros()` cerraban sobre `cuentaKey`, lo que con un contenedor compartido habría filtrado siempre la primera cuenta abierta. Ahora leen `wrap._movsKey`, que se actualiza en cada render.

**Se mantiene a propósito (contratos que pueden leer módulos que no se revisaron):** `cuentaActual` y `_customCuentaActualId` siguen siendo dos variables, y `cuentaKey` sigue valiendo `'nequi' | 'efectivo' | 'custom' | 'nu'` (es lo que `abrirDetalleMov()` lee de `data-cuenta-key`). Se unifican en la etapa 3.

**Los inputs ocultos `nequiSaldo` / `efectivoSaldo`** vivían dentro de las pantallas eliminadas y `core-state.js` los escribe sin guard (`getElementById('nequiSaldo').value=…`); borrarlos habría roto cada movimiento. Se movieron fuera de las pantallas, con un comentario; se eliminan en la etapa 3.

**Cambios visuales mínimos:** el header de Nequi y Efectivo ahora lleva el ícono de la cuenta (como las personalizadas); el rótulo del saldo usa el mismo 70 % de opacidad en las tres.

**Verificado en jsdom** con el `index.html` real y el código real: navegación y estado de las cuatro cuentas, color, rótulos, botones (agregar/retirar/transferir/editar/eliminar con la fuente correcta), cuenta borrada, re-render por `refresh()` y filtros con contenedor compartido. Sin probar en navegador real.

### 🔧 Cambio (2026-10-01) — Selector de cuentas dirigido por datos: una sola función pinta Nequi, Nu, Efectivo y las personalizadas

**Causa:** el mismo dato (la pastilla/tarjeta de una cuenta en el selector) se escribía en cuatro lugares: tres bloques de HTML a mano en `index.html` (con su `sel-*-saldo`) escritos desde `refresh()`, más `renderCustomCuentasList()` para las personalizadas. Cambiar el formato en uno y olvidar el otro ya había dejado las personalizadas con decimales el 2026-09-30.

**Ahora:**
- `cuentas.js`: `renderSelectorCuentas()` reemplaza a `renderCustomCuentasList()`. Recorre `CUENTAS_FIJAS_SELECTOR` (descriptores de Nequi, Nu y Efectivo: `fuente`, `nombre`, `color`, `rgb`, `estilo` `'tarjeta'|'pastilla'`, `saldo()`) más `S.cuentasPersonalizadas`, y pinta cada una con `_cuentaSelectorHtml()`. Los logos de Nequi y Nu salen de `ICONOS_CUENTA` (antes estaban duplicados en `index.html`). El clic es un solo listener delegado sobre `#selector-cuentas-lista` (`data-fuente`; `custom:ID` abre `abrirCustomCuenta`, el resto `abrirCuenta`), reemplazando el `querySelectorAll('[data-cuenta]')`.
- `core-state.js`: nueva `fmtSaldoSelector(n)` (hoy = `fmtNoCents`), único punto de formato del selector. Se quitaron de `refresh()` las tres escrituras a `sel-nequi-saldo` / `sel-nu-saldo` / `sel-ef-saldo`; `refresh()` ahora llama a `renderSelectorCuentas()` con el mismo gate de "pantalla Cuentas activa".
- `index.html`: los bloques a mano de Nequi, Nu, Efectivo y `#custom-cuentas-list` (83 líneas) pasan a un único `<div id="selector-cuentas-lista">`.
- `styles.css`: clases `.cuentas-selector-grid`, `.cuenta-card*` y `.cuenta-pill*` con el color por variables (`--cuenta`, `--cuenta-rgb`). El wrap del saldo largo de la tarjeta (`min-width:0`, `overflow-wrap:anywhere`, `padding-right`) se mantiene.

**Cambios visuales mínimos:** el borde de la pastilla de Efectivo pasa de `.3` a `.35` (igual al de las personalizadas) y el fondo del ícono de Nequi/Nu usa el color del catálogo (`#ff4da6`/`#c060f0` al .18) en vez de `rgba(229,0,116,.2)`/`rgba(192,96,240,.2)`.

**Requiere un cambio fuera de estos archivos:** el hook de `showScreen()` en `sheet-stack.js` (rama `name==='cuentas'`) debe llamar a `renderSelectorCuentas()` en vez de `renderCustomCuentasList()` (la función vieja ya no existe). Verificado en jsdom con el código real (render, formato, escape del nombre, orden, clics y un único listener tras re-render); sin probar en navegador real.

**Siguientes etapas previstas:** (2) pantalla de detalle genérica en lugar de las cuatro escritas a mano (`abrirCuenta`/`renderDetalleCuenta` sin `if/else` por cuenta); (3) colección única `S.cuentas` con migración de `S.nequiSaldo`/`S.efectivoSaldo`.

### 🔧 Cambio (2026-09-30) — Selector de cuentas: los saldos de Nequi, Nu y Efectivo se muestran sin decimales

**Antes:** `refresh()` (`core-state.js`) pintaba `sel-nequi-saldo`, `sel-nu-saldo` y `sel-ef-saldo` con `fmt()`, que muestra centavos; un saldo con decimales (ej. Nu con intereses) hacía el número largo dentro de la tarjeta.

**Ahora:** esas tres líneas usan `fmtNoCents()` (solo entero con puntos de mil; trunca, igual que `s-cdt`, `s-gf`, etc.). El detalle de cada cuenta (`nuTotalDisp`, `det-nequi-saldo`, `det-ef-saldo`) y Inicio no se tocaron y siguen con `fmt()`. El wrap de `styles.css` de la entrada anterior queda como red de seguridad. Sin probar en navegador.

**Ampliación (mismo día):** las cuentas personalizadas también — `renderCustomCuentasList()` (`cuentas.js`) usa `fmtNoCents(c.saldo||0)` en la pastilla del selector. El detalle de la cuenta custom (`det-custom-saldo`) sigue con `fmt()`.

### 🔧 Cambio (2026-09-30) — Selector de cuentas: el saldo largo de Nequi/Nu ya baja de línea en vez de salirse

**Causa:** el saldo (`sel-nequi-saldo`, `sel-nu-saldo`) es un solo "palabra" sin espacios, así que no tenía dónde partirse; además la tarjeta es un grid item (`1fr` = `minmax(auto,1fr)`) y crecía con el número, y su `overflow:hidden` recortaba lo que sobraba.

**Fix, solo en `styles.css`:** `min-width:0` en `#cuentas-selector [data-cuenta]` y `overflow-wrap:anywhere` + `line-height:1.25` + `padding-right:16px` (para no pisar la flecha) en los dos saldos. Mismo criterio que `.stat-value`. Sin cambios en JS ni HTML. No se tocó la pastilla de Efectivo (`sel-ef-saldo`), que es flex y tiene el número chico. Sin probar en navegador.

### 🔧 Cambio (2026-10-01) — Detalle de un movimiento con diferencial: se quitó "¿Qué pasó con el precio?" y la explicación en frases

**Antes:** el recuadro decía "¿Qué pasó con el precio? Le dijiste que costó $108.000, pero en realidad costó $107.910. La diferencia de $90 es tu margen." — título confuso y texto largo para algo que solo usa el dueño de la app.

**Ahora:** una línea con "Ganancia por valor diferente" y el monto a la derecha ("Pérdida" en rojo si el margen es negativo), y debajo "Cobrado $108.000 · Real $107.910". Es el bloque `rm.diferencial` de `abrirDetalleMov()` (`movimientos.js`), así que aplica igual a los movimientos de Encargos, Préstamo con TC y Nuevo préstamo. Las líneas de abajo ("Guardaste … en", "Del margen le diste", "Pagaste de tu bolsillo por") quedaron igual. Sin probar en navegador.

### 🔧 Cambio (2026-10-01) — `mov-dif-resumen` ("El valor real era diferente", Nuevo préstamo): ya no se ve ni ocupa espacio vacío

**Causa:** la regla genérica `[style*="min-height"]:empty` solo anula el `min-height`; este div además lleva fondo y `padding` inline, así que vacío se veía como una barra oscura de ~18px dentro del bloque.

**Fix, solo en `styles.css`, scoped por ID:** `#mov-dif-resumen:empty{display:none;}`. `diffReset()` y `diffResumen()` (sin monto real) lo dejan con `textContent=''`, así que aparece solo cuando hay resumen o el aviso "El valor real debe ser menor…". Sin cambios en JS ni HTML. No se tocó `prtc-dif-resumen` (Préstamo con TC), que tiene el mismo markup y sigue mostrando la barra vacía. Sin probar en navegador.

### 🔧 Cambio (2026-09-28) — Hints vacíos de Encargos ya no ocupan espacio (`traspaso_origen_hint`, `traspaso_saldo_hint`, `movenc_cuenta_hint`)

Mismo pedido que el del 2026-09-25 en "Registrar gasto", ahora para tres hints de Encargos: `traspaso_origen_hint` y `traspaso_saldo_hint` (sheet "Me lo regalaron") y `movenc_cuenta_hint` (sheet "Registrar salida de plata" / "Registrar entrada de plata" — es el mismo sheet y el mismo div, `abrirMovEncargo` solo cambia el tipo).

**Causa:** `.field-hint` reserva `min-height:14px` + `margin-top:4px` desde la clase, y la regla genérica `[style*="min-height"]:empty` solo aplica a `min-height` *inline*, así que estos tres divs dejaban un hueco vacío aunque no tuvieran texto.

**Fix, solo en `styles.css`, scoped por ID:** `:empty` colapsa `min-height` y `margin-top` a 0, con `transition` de 180ms al aparecer el texto. No hizo falta la variante `visibility` de `gv_fuente_hint`: estos hints se vacían con `textContent=''` (o quedan `display:none` cuando el select ya pinta el saldo en cada opción), así que `:empty` sí aplica. Sin cambios en JS ni HTML.

**Efecto colateral aceptado:** al elegir una cuenta cuyo hint sí aparece (select sin saldo en la opción), el contenido de abajo se desplaza ~18px, de forma progresiva.

---

### 🔧 Cambio (2026-09-25) — `gv_fuente_hint`/`gv_fuente_saldo` (Registrar gasto): ya no ocupan espacio vacíos

El trade-off aceptado el 2026-09-24 en `mostrarAlertaFuente()` (hueco fijo de ~18px en vez de salto de layout) dejó de gustar puntualmente en el sheet "Registrar gasto" (`gasto-var`). Se revirtió el trade-off ahí, sin tocar `mostrarAlertaFuente()` ni los sheets de Préstamos que la comparten (`mov_fuente_hint`/`mov_destino_hint`, que siguen reservando el espacio).

**Fix, solo en `styles.css`, scoped por ID:**
- `#gv_fuente_hint[style*="visibility: hidden"]` colapsa a `max-height:0;margin-top:0` (con `overflow:hidden` y `max-height:20px` como estado base) — como el toggle es `visibility` (no `textContent`), la regla general `[style*="min-height"]:empty` no aplicaba acá (el div siempre tiene texto, solo invisible).
- `#gv_fuente_saldo:empty` pierde el `margin-top` (ese div sí se vacía con `textContent=''`, así que la regla `:empty` ya colapsaba el `min-height`, pero quedaba el margen).
- Ambos con `transition` (`max-height`/`min-height`/`margin-top`, 180ms) para que el salto sea progresivo en vez de instantáneo — mismo criterio que el `transition` de `.sheet` para el reacomodo de teclado (entrada anterior, 2026-09-24). `max-height` en vez de `height` porque `height:auto` no anima.

**Efecto colateral aceptado a propósito:** sigue habiendo un desplazamiento al elegir cuenta en "Registrar gasto" — es el mismo salto que el fix del 2026-09-24 evitaba, revertido acá a pedido explícito, aunque ahora suavizado con transición en vez de instantáneo. Si en el futuro se quiere lo mismo en Préstamos, extender el mismo selector a `#mov_fuente_hint`/`#mov_destino_hint`.

Comentario agregado en `sheet-stack.js` (junto a `mostrarAlertaFuente()`) documentando la excepción para que no se lea como inconsistencia.

---

### ✅ Corregido (2026-09-25) — Al abrir un sheet con teclado, el contenido pegaba un salto y después se reajustaba solo

**Síntoma:** al enfocar un campo (típicamente el autofocus de `mejoras-adicionales.js`, 250ms después de abrir el sheet), el sheet sube junto con el teclado, pega un salto, y un instante después se corre un poco más — como si se centrara el input en dos pasos en vez de uno.

**Causa raíz:** el reacomodo por teclado (`marginBottom`/`maxHeight`, según cuánto tapa el teclado) y el centrado del campo enfocado (`ensureFocusedVisible`, que hace scroll interno del sheet si el campo quedó tapado) corrían de forma independiente, sin esperarse entre sí:

1. El `marginBottom`/`maxHeight` se aplicaba **instantáneo**, sin transición — un salto seco en vez de un movimiento suave.
2. El centrado del campo tenía su propio temporizador de 350ms desde el `focus`, sin mirar si el reacomodo por teclado ya había terminado de aplicarse. Si el teclado tardaba en animar más que esos 350ms (dispositivo lento, o varios eventos de resize seguidos mientras el SO anima la apertura), el centrado se calculaba **antes** de que el sheet tuviera su margen final — con una geometría vieja, daba un delta incorrecto (de más). Cuando el margen del teclado se aplicaba después, todo lo ya corregido se corría de nuevo — dos movimientos en cadena, uno de ellos mal calculado.

**Fix (dos cambios, ambos quirúrgicos):**

- `styles.css`: se agregó `transition:margin-bottom .22s ease,max-height .22s ease` a `.sheet`, para que el reacomodo por teclado sea un deslizamiento suave en vez de un salto instantáneo (mismos 220ms que ya usa el swipe-to-close, por consistencia).
- `sheet-behavior.js`: el centrado del campo enfocado ahora **espera** a que el margen del teclado ya esté aplicado antes de medir:
  - Cuando lo dispara el propio reacomodo por teclado (`applyKbLayout`), espera a que termine la transición del `margin-bottom`/`max-height` de ese sheet (`transitionend`, con un respaldo de 260ms por si el navegador no la dispara) antes de centrar.
  - Cuando lo dispara el `focus` (temporizador de 350ms), reintenta cada 60ms (hasta 10 veces) si el margen del sheet todavía no coincide con la altura actual del teclado, en vez de medir con una geometría que sabe que está vieja.

Con esto, los dos caminos siempre terminan midiendo sobre el mismo layout ya asentado — cuando ambos disparan, el segundo no hace nada (el campo ya quedó bien) en vez de corregir una medición equivocada.

Validado con una simulación en jsdom que reproduce la carrera con eventos de resize escalonados (imitando cómo el SO anima la apertura del teclado) en dos escenarios — teclado rápido (se asienta antes de los 350ms) y teclado lento (sigue en eventos más allá de los 350ms). En el escenario lento, contra el código de antes de este fix, se reprodujo exactamente el defecto: un scroll de 186px con geometría vieja **antes** de que se aplicara el margen del teclado, seguido del salto del margen — dos movimientos en cadena. Con el fix, el margen se aplica primero y el ajuste del campo llega después, ya correcto (36px), en un solo paso perceptible. **Pendiente:** confirmación visual en celular real — jsdom no ejecuta transiciones CSS de verdad, así que la suavidad del `transition` no se pudo validar automáticamente, solo su coordinación con el JS.

---

### ✅ Corregido (2026-09-24) — `sheet-behavior.js`: los sheets se movían bajo el dedo al tocar botones rápido

**Síntoma (celular):** el usuario ve un botón, va a tocarlo, y justo antes el contenido del sheet se corre solo — el toque cae sobre otra cosa. Pasaba sobre todo al tocar un control y enseguida otro.

**Causa raíz** (tres ajustes automáticos que movían la pantalla sin importar si había un toque en curso):

1. **Scroll al enfocar.** El handler de `focusin` hacía `scrollIntoView({block:'center', behavior:'smooth'})` 350 ms después de enfocar *cualquier* `input`/`textarea`/`select` dentro de un sheet — incluidos checkbox (toggles como "quedó debiendo"), selects y campos que ya estaban a la vista. Ese scroll suave arrancaba justo cuando el dedo iba hacia el siguiente botón. Además `scrollIntoView` puede desplazar también contenedores ancestros, no solo el sheet.
2. **Reposicionado por teclado.** Al abrir o cerrar el teclado, el sheet cambiaba de margen y de `maxHeight` con un debounce de 120 ms, sin mirar si el usuario estaba tocando algo en ese instante (típico: tocar un botón cierra el teclado → el sheet se reacomoda entre el `touchstart` y el `click`). Además tenía dos defectos propios: solo se limpiaba el estilo en los overlays que existían al cargar la página (uno inyectado después podía quedar con el margen pegado), y un cambio chico que cruzaba el umbral de 100 px (ej. 105 → 85) se descartaba por el filtro de "cambio < 20 px", dejando el margen viejo.
3. **Swipe para cerrar demasiado sensible.** Con solo 8 px de movimiento hacia abajo, un toque con el dedo algo corrido ya arrastraba el sheet entero. Arrastres casi horizontales o que empezaban sobre un campo de texto también contaban. Y la velocidad de "flick" se calculaba entre la última posición registrada y la posición al soltar, que casi siempre son la misma — así que cerrar con un gesto rápido en la práctica nunca funcionaba (solo el arrastre largo de 90 px). Tampoco se manejaba `touchcancel`: si el sistema interrumpía el gesto, el sheet podía quedar desplazado y con el scroll bloqueado.

**Fix:**

- Se agregó una noción compartida de "pantalla quieta" (sin dedos apoyados y sin toques en los últimos 300 ms). El reposicionado por teclado y el scroll al campo enfocado esperan a que la pantalla esté quieta antes de aplicarse, así el toque en curso siempre se completa sobre el layout que el usuario vio.
- Scroll al enfocar: solo para campos que realmente abren el teclado de texto (no checkbox/radio/select/fecha/etc.), solo si el campo quedó tapado (por el teclado o el borde del sheet), moviendo el scroll del propio `.sheet` lo mínimo necesario y sin animación. Si el campo ya se ve, no se mueve nada; si perdió el foco antes de aplicarse, se cancela.
- Teclado: el estado se compara contra el último aplicado (0 o la altura real), se aplica a todos los sheets (no solo los vigilados al cargar), y un overlay que se abre con el teclado ya visible arranca con el margen correcto; al cerrarse queda limpio. `_makeSheetSwipeable` también registra el overlay para esta vigilancia.
- Swipe: umbral de arrastre 14 px (el sheet arranca desde 0, sin "salto"), ignora gestos más horizontales que verticales y toques que empiezan sobre `input`/`textarea`/`select`, velocidad de flick calculada entre los dos últimos movimientos (cierra con ≥ 40 px y > 0,5 px/ms; se anula si el dedo se frena antes de soltar), `touchcancel` deja el sheet limpio sin cerrarlo, y `overscroll-behavior-y: contain` en el sheet para que el rebote no se encadene con la pantalla de atrás.

No cambia: el umbral de cierre por distancia (90 px) ni la regla de deshabilitar el swipe con el teclado abierto.

Validado con `node --check` y pruebas jsdom con toques simulados y `visualViewport` simulado (27 casos: checkbox/select/fecha sin scroll, campo visible sin scroll, scroll mínimo cuando está tapado, espera con el dedo apoyado, teclado que se cierra con el dedo apoyado, umbral 105→85, overlays abiertos/inyectados con el teclado visible, y los gestos de swipe descritos arriba). **Pendiente:** confirmación en celular real (jsdom no calcula layout, solo valida la lógica).

### ✅ Corregido (2026-09-24) — `mostrarAlertaFuente()`: elegir cuenta en "Registrar movimiento" empujaba los botones de golpe

Revisando `styles.css` se confirmó que el patrón "reservar el espacio para que el hint no salte el layout" (`.field-hint{min-height:14px}` + `[style*="min-height"]:empty{min-height:0}`, documentado en `reglas-visuales.md#hints-vacíos`) ya está bien aplicado en los hints de Encargos (`ctc_destino_hint`, `moverenc_destino_hint`). Pero `mostrarAlertaFuente(prefix)` — usada por `mov_fuente_hint`/`mov_destino_hint` en "Registrar movimiento" (Préstamos) y por `gv_fuente_hint` en "Nuevo gasto" — es anterior a ese patrón y todavía alternaba `display:'none'`/`'block'`. `display:none` saca el elemento del layout por completo sin importar el `min-height` de `.field-hint`, así que elegir una cuenta hacía aparecer el hint de golpe y empujaba ~18px todo lo de abajo — justo el tipo de salto que hace que, si se toca rápido, el dedo caiga sobre otro botón.

Fix: `mostrarAlertaFuente()` pasó a alternar `visibility` en vez de `display` (mismo criterio de "reservar el espacio" que ya usan los hints de Encargos, aplicado con la herramienta que tenía disponible este toggle en particular). Los tres divs (`gv_fuente_hint`, `mov_fuente_hint`, `mov_destino_hint`) perdieron el `display:none;` inicial en su `style` inline — sin eso, `visibility:hidden` no alcanza para que el hueco quede reservado desde que se abre el sheet.

**Efecto colateral esperado, no un bug:** ahora esos tres sheets muestran un hueco en blanco de ~18px mientras no se eligió cuenta, en vez de no ocupar nada. Es el mismo trade-off que ya se aceptó a propósito en los hints de Encargos — mejor un hueco fijo que un salto de layout. Si visualmente no gusta, se puede revertir con solo cambiar `visibility` de vuelta a `display` en `mostrarAlertaFuente()` y restaurar el `display:none;` en los tres divs.

### ✅ Corregido (2026-09-24) — El aviso de "se carga a la TC" quedaba invisible tras el fix anterior

Al revisar `tarjetas_credito.js` (pendiente en la entrada anterior) apareció el caso que ahí se dejó como "no revisado": el archivo parchea `window.mostrarAlertaFuente` — cuando la fuente elegida es una tarjeta de crédito (`val.startsWith('tc:')`, ej. "Préstamo con TC" en Registrar movimiento), toma el control para mostrar un aviso rojo distinto ("El gasto se cargará a la TC — no sale plata de tus cuentas") en vez de delegar en la función original. Ese branch hacía `hint.style.display=''`, nunca tocaba `visibility` — así que con el cambio de la entrada anterior (que dejó esos hints ocultos vía `visibility:hidden` en vez de `display:none`), elegir una tarjeta de crédito como fuente dejaba el aviso con el texto y el color ya puestos, pero invisible: `display=''` no alcanza para revertir un `visibility:hidden` que había quedado de antes.

Fix: la línea pasó a `hint.style.visibility='visible'`, igual que el resto de `mostrarAlertaFuente()`. Sin cambios en `sheet-stack.js` ni en `index.html` — el problema estaba solo en este patch.

Validado con una prueba de integración en jsdom que carga `mostrarAlertaFuente()` real de `sheet-stack.js` + el patch real de `tarjetas_credito.js` y alterna la fuente entre vacía / cuenta normal / tarjeta de crédito (4 casos); confirmado además que fallaba exactamente así contra el archivo sin este fix.

---

### 🔧 Cambio (2026-09-23) — `split.js`: con 2 filas (el mínimo) ya no queda un hueco donde iba el botón de borrar

Al activar "Dividir" en cualquier pantalla que use el motor de split (Mesada, Encargos, Préstamos, Gastos, etc.), las 2 filas mínimas ocultaban el botón "×" con `visibility:hidden` — que esconde el botón pero **sigue ocupando su espacio** (28px + el gap de la grilla), dejando un hueco vacío a la derecha del campo de monto.

Fix: `splitActualizarBotones()` ahora usa `display:none` en vez de `visibility:hidden` cuando hay 2 filas, y además cambia el `grid-template-columns` de cada fila de `1fr auto auto` a `1fr auto` (una columna vacía en un grid igual reserva su gap, así que solo ocultar el botón no alcanzaba). Con 3 o más filas todo vuelve al layout de 3 columnas con el botón visible. La regla de negocio (mínimo 2 filas, no se puede bajar de eso) no cambia — solo cómo se ve. Como vive en el motor común, aplica a todos los módulos sin tocarlos.

---

### ✅ Corregido (2026-08-24) — Decimales y NBSP raro en la card "Proyección financiera" (header + tarjetas 3m/6m/12m + tooltips)

`renderProyeccion()` en `inicio.js` usaba `window.fmt` (formateador global, definido en otro archivo, que sí muestra decimales) tanto para pintar el header/tarjetas como para los tooltips (`fmt2`, al tocar el header o una tarjeta). Una proyección a 3/6/12 meses es una estimación, no un saldo exacto, así que los centavos no aportaban info y solo generaban ruido. Se reemplazó `fmt`/`fmt2` en esta función por un formateador local (`Math.round(x)` + `maximumFractionDigits:0`), aislado a `renderProyeccion()` — no se tocó `window.fmt` global por si otras pantallas sí necesitan decimales.

De paso se detectó que `toLocaleString('es-CO',{style:'currency',...})` inserta un espacio de no separación (NBSP, U+00A0) entre el símbolo `$` y el número — ese carácter es el que se veía "raro" y, según el contexto donde se sirve el HTML, puede terminar serializado como la entidad literal `&nbsp;` en vez de renderizarse como espacio. Se agregó `.replace(/\u00a0/g,'')` a los dos formateadores locales (`fmt` y `fmt2`) para quitarlo del todo (`$116.164` en vez de `$ 116.164`).

---

### ✨ Agregado (2026-08-23) — Persistencia del botón "ocultar saldos" y del estado de "Necesita atención"

**Ocultar saldos:** el toggle `btn-toggle-saldos` (`mejoras.js`) no guardaba nada — cada recarga volvía a mostrar los saldos aunque los hubieras ocultado antes. Se agregó `localStorage` (`mf-saldos-ocultos`): `toggleSaldos()` guarda el estado en cada click, y se separó la parte visual (ícono del botón + aplicar `.saldo-hidden`) en `_aplicarEstadoSaldos()`, que ahora también se llama una vez al cargar el script para restaurar el estado guardado sin depender de que el usuario haga click. Los montos que se pintan dinámicamente (proyección, análisis, tarjetas, etc., sección 1b) ya nacen ocultos correctamente porque `_saldosOcultos` se lee de `localStorage` antes de que se armen los observers de esa sección.

**"Necesita atención":** el estado abierto/cerrado (`renderAttencion()` en `inicio.js`) ya se guardaba con detección de items nuevos (`fingerprint`), pero en `sessionStorage` — sobrevivía a un F5 pero se perdía al cerrar el navegador/pestaña. Al no haber `lastFingerprint` en una sesión nueva, `hayNuevos` daba siempre `true` y la sección se abría sola aunque no hubiera nada nuevo en realidad. Cambiado `sessionStorage` → `localStorage` en las 4 referencias (`attn-open` ×2, `attn-fingerprint` ×2) para que la comparación sobreviva a cerrar el navegador del todo.

---

### ✅ Corregido (2026-08-23) — Cuadros de estadísticas (`.stat` en `grid3`/`grid2`) se desbordaban con valores grandes

Los cuadros de la sección de patrimonio en Inicio (Disponible, Nu libre, Efectivo, Nequi, Prestado, CDTs, etc.) y cualquier otro `.stat` dentro de un `grid3`/`grid2` en toda la app podían salirse de su contenedor cuando el número era muy grande. Causa: por defecto un hijo de CSS Grid tiene `min-width:auto`, así que nunca se encoge por debajo del ancho de su contenido — si el número era más ancho que la celda, empujaba el layout en vez de ajustarse.

Fix en `css/styles.css`: `min-width:0` en `.stat` (permite que el grid item se encoja) + `font-size:clamp(11px,3.4vw,16px)` en `.stat-value` (la letra se achica sola con valores grandes, en vez de mantener 16px fijo) + `overflow-wrap`/`word-break` como red de seguridad para el caso extremo en que ni achicando la letra entra.

Mismo problema y mismo criterio en las 3 tarjetas de "Proyección financiera" (3/6/12 meses, `renderProyeccion()` en `inicio.js`), que se generan por JS con estilos inline en vez de la clase `.stat`: se agregó `min-width:0` a cada tarjeta y `font-size:clamp(10px,3vw,13px)` + `overflow-wrap`/`word-break` al valor.

---

### ♿ Corregido (2026-08-22) — Accesibilidad: 29 `<label>` sin asociar a un campo (linter "No label associated with a form field")

Auditoría de las 35 instancias de `<label>` sin atributo `for` en `index.html`. 6 no necesitaban cambio (el `<input>` ya está anidado dentro del propio `<label>` — patrón válido usado en los toggles de Configuración y en el checkbox "préstamo aparte"). Las 29 restantes caían en dos categorías reales, verificadas una por una contra el HTML:

**Categoría 1 — el label sí describe un campo real, solo le faltaba `for` (20 casos):** se agregó `for="<id>"` apuntando al `<select>`/`<input>` correspondiente. La mayoría son el patrón "field-header" (pregunta + botón "Dividir ÷" + select en modo simple / filas en modo dividido, p. ej. `movenc_cuenta`, `mov_fuente`, `mov_destino`, `spDestinoSelect`, `spPagarFuente`, `mpDestino`, `usar_parte_fuente`, `nd_destino`, `md_cuenta`, `nuMovDesc`, `nuMovMonto`, más varios campos de diferencial `movenc_dif_real`/`movenc_dif_mi_cuenta`/`ctc_dif_real`/`ctc_dif_margen_cuenta`/`usar_parte_dif_real`/`usar_parte_dif_mi_cuenta`/`prtc_dif_real`/`movenc_faltante_cuenta`/`gv_fuente`). Se usó `for` apuntando siempre al select del modo simple porque ese ya era el patrón existente en el propio archivo (`mov_enc_cuenta`, línea ~3939, ya tenía `for` correcto desde antes) — no se inventó una convención nueva.

**Categoría 2 — el label describía un widget custom sin `<input>`/`<select>` nativo (9 casos):** cambiados de `<label class="il">` a `<div class="il">` (mismo `class`, mismo estilo visual — `.il` se define en `css/styles.css` como selector de clase, no `label.il`, así que no depende del tag). Casos: selector de ícono (`Ícono`, grid de divs con `data-action`), selector de color (`Color` ×3, círculos de color clicables), "Color del avatar" ×2 (mismo patrón en Personas), texto de solo lectura "Saldo actual" ×2 (seguido de un `<div>` no editable, no un input), "¿A qué cajita?" (lista dinámica de checkboxes de cajitas sin un único campo que etiquetar) y "¿Qué hiciste con ese extra?" (sistema de partes libres, sin campo único).

No se tocó ningún `id`, `data-action` ni lógica JS — el cambio es puramente de tag/atributo en el HTML, verificado que no rompe el balance de etiquetas (`<div>`/`</div>` +9/+9, `<label>`/`</label>` −9/−9) ni deja ningún `for` apuntando a un `id` inexistente (170 `for=` verificados contra los `id` del documento).

**Seguimiento (2026-08-22, mismo día) — 24 casos más, en los módulos `.js` (sheets inyectados dinámicamente):**

El fix de arriba dejó `index.html` en 0, pero el linter siguió reportando 18 (de 24 reales encontrados — algunos posiblemente no cuentan doble o no se renderizan siempre). La causa: varios sheets no viven como HTML estático en `index.html` sino que se arman como string e inyectan por `.innerHTML`/`appendChild` desde el propio módulo `.js` (mismo patrón "hybrid" ya documentado para Alcancía) — el linter escanea el DOM ya renderizado, así que ve ese HTML aunque no esté en el archivo fuente que se audite. Auditados los 13 módulos con `.js` propio; 8 tenían el problema:

- **`alcancia.js` (10):** 9 con `for` agregado (`alc_dep_tipo`, `alc_dep_deudor`, `alc_dep_deudor_grupo`, `alc_dep_fuente`, `alc_dep_monto`, `alc_dep_fecha`, `alc_dep_desc`, `alc_real_monto`, `alc_destino`) + 1 a `div` ("¿Cuánto puso cada uno?", que no tiene un campo único — son 2 inputs fijos, Vos/Tu mamá).
- **`analisis.js` (1):** el label de cada presupuesto por categoría (`${cat}`) no tenía forma de enlazarse porque el input tampoco tenía `id` (solo `data-cat`, y el nombre de categoría no es un valor seguro para usar como `id` HTML). Se agregó `id="presup-input-${i}"` al input (usando el índice del loop, no el texto de la categoría) y `for` a juego en el label.
- **`cuentas.js` (1):** mismo problema en "chequeo Nu" (input por cajita, solo tenía `data-chq-cajita`). Se agregó `id="chq-${c.id}"` (reutilizando el id de la cajita, que ya se usaba como valor de atributo en el mismo elemento) y `for` a juego.
- **`plata_comprometida.js` (6):** 5 a `div` ("¿A dónde va esta plata?", "Tipo de destino" —el `<select>` real ahí es oculto, solo para compatibilidad interna—, "¿De dónde salió o va a salir esta plata?", "¿Ya adelantaste esta plata?", "¿Ya lo pagaste?" — todos son botones/tarjetas custom, no select/input directo) + 1 con `for="cp-recibir-sobrante-cuenta"` (ese sí tiene un select real).
- **`encargos.js` (1) y `prestado.js` (1):** "¿De quién es la plata?" / "¿A quién le debes?" → `div`, ambos son el mismo widget custom de selector de persona (botón + avatar), el campo real detrás es `type="hidden"`.
- **`spotify.js` (2):** "¿Quién es?" (crear y editar) → `div`, mismo patrón de selector de persona.
- **`personas.js` (2):** "Color del avatar" (crear y editar persona) → `div`. Estos son los que el usuario vio reaparecer después del primer fix — son sheets inyectados por `personas.js` (`sheet-crear-persona-global`/`sheet-editar-persona-global`), no el HTML estático de `index.html` que se corrigió antes (que resultó no ser el que realmente se usa/renderiza para este flujo).

`actividad_reciente.js`, `gastos.js`, `inicio.js`, `mesada.js`, `tarjetas_credito.js` y `configuracion.js` no tenían ningún caso. Verificado archivo por archivo que no queda ningún `<label>` sin `for` (excepto los que ya tienen el input anidado adentro, que no aplica acá) y que cada `for` nuevo apunta a un `id` que existe en el mismo archivo.

Auditoría completa de los ~45 bottom sheets de `index.html` contra la regla de orden de `guia-estilo-sheets.md` §1 (Fecha va justo antes de Nota, no pegada al Monto). Se encontraron dos tipos de problema, ambos solo en el HTML — **el JS de guardado de cada módulo todavía no lee los campos nuevos, queda pendiente**:

**Huecos de simetría (campo faltante en un sheet cuyo par sí lo tenía):**
- `sheet-restar-dinero` no tenía Nota (su par `sheet-agregar-dinero` sí) → se agregó `#rdNota`.
- `sheet-sp-destino` no tenía Nota (sus pares `sheet-sp-hist-pend`/`sheet-pagar-spotify` sí) → se agregó `#spNota`.
- `sheet-transferir` no tenía Fecha, único sheet de movimiento sin ella → se agregó `#tr_fecha`.

**Fecha reordenada** (antes aparecía pegada al Monto, ahora va justo antes de Nota, después de los campos de cuenta/contexto): `sheet-gasto-var`, `sheet-compra-tc`, `sheet-nueva-deuda`, `sheet-mov-mi-deuda`, `sheet-prestamo-tc`, `sheet-registrar-movimiento`, `sheet-sp-hist-pend`, `sheet-mesada-pago`, `sheet-mesada-pend`. Solo cambió la posición del `<div class="ig">` en el DOM — los `id` de los inputs no cambiaron, así que cualquier JS que use `getElementById`/`querySelector` sigue funcionando igual.

**Seguimiento (2026-08-22, mismo día) — conectado en `cuentas.js`/`spotify.js`:**

Al conectar `#rdNota` se encontró que el problema era más viejo y más grande: **`#adNota` (agregar-dinero), `#adMenuNota` (agregar-dinero-menu) y `#nuMovNota` (nu-movimiento) ya existían en el HTML desde antes y tampoco se leían nunca** — el usuario podía escribir una nota, confirmar, y esa nota se perdía en silencio sin ningún error. Se corrigieron los 6 sheets juntos porque todos comparten la misma raíz:

- `registrarEntradaConApertura(fuente,monto,fecha,desc,esApertura,nota)` y `registrarSalida(fuente,monto,fecha,desc,nota)` (`cuentas.js`) ahora aceptan un 6º/5º parámetro opcional `nota` y lo guardan como `mov.nota` cuando viene no vacío. No se rompe ningún caller viejo — el parámetro es opcional y los que no lo pasan simplemente no agregan el campo, igual que antes.
- `confirmarAgregarDinero`, `confirmarAgregarDineroMenu`, `confirmarNuMovimiento` (ambos sentidos) y `confirmarRestarDinero` ahora leen su input de Nota (`#adNota`/`#adMenuNota`/`#nuMovNota`/`#rdNota`) y lo pasan. Los `abrir*` correspondientes limpian ese campo al abrir el sheet (antes quedaba con el valor de la vez anterior, invisible porque nunca se leía igual).
- `confirmarTransferir` (`cuentas.js`) ahora lee `#tr_fecha` y lo usa al guardar en `S.transferencias`, en vez del `fecha: hoy()` fijo que tenía. `abrirTransferir` inicializa `#tr_fecha` a hoy como valor por defecto editable.
- `confirmarSpDestino` (`spotify.js`) lee `#spNota` y la combina con la nota automática de períodos (`"X períodos × $Y (pago adelantado)"`) uniendo ambas con `' · '` — mismo patrón que ya usaba el propio archivo para la nota de "Pago atrasado del ciclo anterior". `abrirSpDestino` limpia `#spNota` al abrir.
- No hizo falta tocar `movimientos.js`: el sheet de detalle de movimiento ya prioriza `nota` sobre `desc` cuando existe (`abrirDetalleMov`), así que las notas nuevas se muestran automáticamente sin cambios ahí.

De paso, `guia-estilo-sheets.md` §3 quedó actualizada con 4 sheets que existían en el código pero no en el inventario (`sheet-transferencia-encargo` completo, campos nuevos en `sheet-traspaso-encargo`/`sheet-mesada-pago`/`sheet-mesada-pend`/`sheet-registrar-movimiento`/`sheet-nueva-tc`), y con una aclaración de que el campo #3 de la regla de orden ("Descripción") casi nunca se llama literalmente así — suele ser una pregunta específica ("¿De dónde viene esta plata?", etc.) y eso es el patrón correcto, no una desviación.

---

## Infraestructura / seguridad

### 🐛 Corrección (2026-10-10) — Los préstamos y abonos sin cuenta inflaban la tendencia y la proyección de Inicio (`core-state.js`)

**Síntoma:** un préstamo "Me deben" a Padre de $500.000 sin cuenta de origen (25 de septiembre) subió el patrimonio $500.000 sin ser ingreso, y la gráfica de patrimonio y la proyección lo leían como crecimiento real: tendencia de **+$558.680 al mes y +$6,7 M a 12 meses**, cuando sin ese salto era de **+$104.135 y +$1,25 M**. Se detectó con una conciliación del cambio de patrimonio contra los ingresos y gastos que explica la app (septiembre dejaba $473.869 sin explicar).

**Corrección:** los movimientos de deudas **sin pata de caja** (préstamo "Me deben" sin cuenta ni tarjeta, abono/pago recibido sin cuenta destino, y sus equivalentes en "Yo debo") se tratan como **ajuste de base** igual que una apertura: `_movsDeudaSinCuenta()` los enumera y `montoBase` los descuenta. Quedan fuera los perdones, lo pagado con TC (`_viaTC`) y los movimientos con `fuentes`/`destinos` repartidos. Si el movimiento trae `clase: 'ingreso'` (plata nueva, p. ej. un regalo) cuenta como ingreso del mes y no como ajuste (`entradasIngresoReal()`).
- `load()` recalcula `montoBase` de todo el historial con la nueva `recalcularMontoBaseHistorial()` (sin migración: vale hacia atrás), y ahora también **limpia** un `montoBase` que ya no tiene respaldo en los datos (antes un ajuste viejo quedaba pegado si se borraba el movimiento).
- Nuevo `scripts/conciliacion.js backup.json`: por mes, compara el cambio de patrimonio contra ingresos + mesada − gastos − retiros − fijos + rendimientos y marca lo que queda sin explicar. Con tu backup: septiembre pasó de $473.869 a −$26.131 sin explicar; octubre queda en $7.164.
- Tests: `tests/deudas-sin-cuenta.test.js` (6 casos), `tests/migraciones.test.js` (v4) y `scripts/conciliacion.js` aplica las migraciones como `load()`; 265 de 265 en verde. Ingresos y gastos por mes no cambian (`scripts/equivalencia.js --comparar`).
- **Plata nueva en un préstamo sin cuenta:** "Nuevo préstamo" tiene ahora el interruptor **"¿Es plata nueva para ti?"** (`index.html` `mov_regalo`, leído en `prestado.js`): sin cuenta de origen guarda `clase: 'ingreso'` y cuenta como ingreso del mes. La **migración v4** corrige el caso existente: el préstamo a Padre de $500.000 (25-sep, "Regalo - Abuela": la abuela le dijo al papá que le pagara a ella lo que le debía, y ahora te lo debe a ti) fue un regalo, así que septiembre suma **+$500.000 de ingreso** (se identifica por id y se verifica monto, fecha y que no tenga cuenta).

### 🐛 Corrección (2026-10-10) — La pantalla Gastos no mostraba ni sumaba los "Restar dinero" (`gastos.js`, `periodo.js`)

**Síntoma:** un retiro de "Restar dinero" ya contaba como gasto en Inicio, Análisis, cierre de mes y Wrapped (`Periodo`), pero no aparecía en la pantalla Gastos y su total del mes quedaba por debajo (esa pantalla arma su lista y su total solo con `S.gastosVar`).

**Corrección:** `renderGastosVar()` agrega los retiros (`Periodo.retirosManuales()`, ahora con `clase: 'gasto'`) como filas de solo lectura —categoría `Ajuste`, "elimínalo desde Cuentas · Restar dinero"— y los incluye en el total del mes y en los subtotales por día; el filtro de meses también ofrece un mes que solo tenga un retiro. Se comprobó con el backup del 2026-10-10: octubre suma $96.300 en Gastos, igual que `Periodo`.

### 🔧 Refactor (2026-10-10) — Etapa E5: reglas históricas congeladas y lectores unificados (`core-state.js`)

Con `schemaVersion` 3 y 0 movimientos sin `clase` en el backup del 2026-10-10: la cascada de etiquetas pasó a `_reglaHistoricaEntradaEspejo` / `_reglaHistoricaGastoVarNoReal` (congeladas, sin cambios de lógica); `_esEntradaEspejoNoIngreso()` y `_esGastoVarNoReal()` leen todo vía `claseEfectivaMovimiento()`. El normalizador de `save()` se **conserva** (los datos guardados quedan completos y un módulo futuro que olvide la clase no rompe nada; `tests/clase-cobertura.test.js` lo detecta). Las etiquetas (`_esEspejo`, `_esExtraIngreso`…) **no** se borran: siguen en los datos existentes y las usa la presentación (origen, borrado protegido) y la deducción. Verificado con ambos backups (`scripts/equivalencia.js --comparar`): sin diferencias respecto a antes de E5.

### 🔧 Mantenimiento (2026-10-10) — Service Worker `mis-finanzas-v21` → `v26` (`sw.js`)

Los JS se sirven con `staleWhileRevalidate`: sin cambiar `VERSION`, un dispositivo con la app instalada podía seguir con el código anterior (sin `clase`, con la cascada vieja) hasta una segunda carga. Subir la versión borra la caché vieja al activar. Es el único cambio de `sw.js`.

### 🐛 Corrección (2026-10-09) — "Restar dinero" no contaba como gasto del mes (`cuentas.js`, `core-state.js`, `periodo.js`)

**Síntoma:** "Sumar dinero" cuenta como ingreso del mes, pero "Restar dinero" bajaba el saldo y el patrimonio sin aparecer en los gastos de Inicio, Análisis, cierre de mes ni Wrapped. En la práctica se usa para cuadrar la diferencia entre lo registrado y lo real (gastos que se olvidaron de registrar), así que esos gastos nunca se veían.

**Corrección:** `registrarSalida()` escribe `clase: 'gasto'` y `Periodo` los cuenta (`Periodo.retirosManuales()`, agrupados con los gastos variables, categoría **Ajuste**), de modo que Inicio, Análisis, cierre de mes y Wrapped cambian a la vez. La migración v3 también estampa `gasto` en los `salida_manual` antiguos. Los espejos de salida (`salida`, `egreso`) siguen siendo neutros. Borrar el retiro lo quita del gasto (la clase viaja con el movimiento).

**Efecto sobre tus datos (backup 2026-10-09):** octubre +$40.000 de gasto (el retiro del 1 de octubre). El patrimonio no cambia.

**Límite:** los retiros antiguos de cuentas personalizadas guardados como `egreso` dentro de la propia cuenta no se cuentan (son copias "gemelas" de datos anteriores a 2026-09 y contarlos podría duplicar).

### ✨ Mejora (2026-10-09) — Rendimientos de Nu por mes: los intereses ya se pueden reportar como ingreso económico, aparte del ingreso operativo (`nu-calc.js`, `cuentas.js`, `periodo.js`, `inicio.js`)

**Antes:** el interés de las cajitas se calculaba al leer (`calcC`) y se fundía en el saldo al materializarlo, sin dejar rastro de en qué mes se ganó; el de los CDT solo se calculaba en Inicio y nadie lo usaba.

**Ahora:** los intereses son ingreso económico (plata nueva). **No** se suman a `ingresosDelMes().total`: ese total es flujo de caja operativo, alimenta los ratios de deuda y ahorro de Inicio (y un CDT ni siquiera es plata disponible); Análisis los suma a su balance mediante una opción. Se reportan en `Periodo.rendimientosDelMes(mes)` → `{ cajitas, cdts, total }`, y `balanceDelMes()` los trae en `rendimientos`.
- `calcC(c, hasta)` acepta una fecha opcional (sin ella funciona igual que siempre) y `rendimientoCajitaPorMes(c)` reparte el interés acumulado por mes (la suma da `calcC(c).ganado`).
- `materializarIntereses()` anota lo ganado por mes en `c.rendimientos` antes de fundirlo en el saldo. No es un movimiento: no toca saldos ni historial.
- Cajitas = lo anotado + lo acumulado aún sin materializar; CDT = `calcRendimientoCDTsMes()`, exacto para cualquier mes. Inicio ahora expone cajitas + CDT en `rendimientoCDTMes`. **Análisis** los suma a Ingresos, Balance, Tasa de ahorro y Ahorrado (y a la comparación con el mes anterior) y lo dice bajo el balance: "Incluye $X de rendimientos de Nu" (`analisis.js`), con `Periodo.balanceDelMes(mes, estado, { conRendimientos: true })`. Los demás consumidores (Inicio, Salud financiera, cierre de mes, Wrapped) no la piden y siguen midiendo flujo de caja operativo.
- **Límite:** los meses anteriores a este cambio no se pueden reconstruir (el interés ya estaba fundido en el saldo) y salen en 0; el registro empieza desde la próxima vez que se materialice cada cajita.
- Tests: `calcC-calcCDT.test.js` (reparto por mes, `calcC` con fecha, materialización) y `clase-movimientos.test.js` (retiros como gasto); 257 de 257 en verde.

### 🔧 Mantenimiento (2026-10-09) — Se retiran las migraciones v1 y v2 de `MIGRACIONES` (`core-state.js`)

Todos los datos guardados (y no existen backups anteriores) ya estaban en v2, así que `MIGRACIONES` empieza ahora en v3 (la de `clase`). La numeración no se reinicia: `S.schemaVersion` de los datos existentes vale 2 y la v3 se ejecuta sola al cargar. `tests/migraciones.test.js` ahora prueba v3 (estampa `clase`, idempotencia, datos más nuevos que la app).

### 🔧 Refactor (2026-10-09) — Clase explícita en los movimientos (`clase`): "¿ingreso, gasto o solo plata que se movió?" deja de deducirse y pasa a guardarse (`core-state.js`, `cuenta-efectos.js`, `diferencial.js`, `encargos.js`, `prestado.js`, `spotify.js`, `alcancia.js`, `plata_comprometida.js`, `gastos.js`, `tarjetas_credito.js`, `cuentas.js`, `actividad_reciente.js`)

Etapa 1 de `plan-clasificacion-movimientos.md`. **Antes:** la clasificación se reconstruía al leer, con una cascada de 12 condiciones sobre ~30 etiquetas (`_esEspejo`, `_secundario`, `_origenSeccion`, `_encMovId`, `_esExtraIngreso`…) y 3 comprobaciones por texto de la descripción. Cada módulo nuevo tenía que acordarse de la combinación correcta; si olvidaba una, el patrimonio salía bien pero el ingreso o gasto del mes salía mal, sin aviso.

**Ahora:** cada movimiento lleva `clase`: `ingreso` (plata nueva, sube el patrimonio), `gasto` (lo baja), `neutro` (mueve plata sin cambiar el patrimonio: el "espejo") o `ajuste` (corrección de datos, p. ej. apertura de cuenta). La clase viaja con el movimiento, así que borrarlo la revierte con él.

- **Se escribe al crear, en cada módulo.** `registrarMovEspejo()` recibe `clase` (por defecto `neutro`; `ingreso` si `extra` trae `_esExtraIngreso`/`_esPerdonRecibido`/`_esDiferencialEncargo`). Las escriben explícitamente: gasto variable y pago de gasto fijo (`gastos.js`), compra y pago de TC (`tarjetas_credito.js`), margen/diferencial, regalo e intercambios de Encargos (`diferencial.js`, `encargos.js`), perdón dado/recibido y extra de un pago (`prestado.js`), extra y gasto de Spotify (`spotify.js`), depósitos y destape de Alcancía (`alcancia.js`), reposiciones e ingreso libre de Plata comprometida (`plata_comprometida.js`), entrada manual y apertura (`cuentas.js`, `crearMovimientoApertura()`).
- **Migración v3** (`MIGRACIONES`): estampa `clase` en el histórico con las reglas de siempre, una sola vez, de forma idempotente y sin pisar una `clase` existente. También corre al importar un backup. Los movimientos que no se pueden clasificar con certeza (las `salida`/`egreso` sin etiqueta de espejo) se dejan sin `clase` y se cuentan en consola: no se adivina.
- **Lectores:** `_esEntradaEspejoNoIngreso()` y `_esGastoVarNoReal()` leen `clase`; si falta, la deducen con la cascada anterior, que desde la etapa E5 (2026-10-10) quedó **congelada** como `_reglaHistoricaEntradaEspejo` / `_reglaHistoricaGastoVarNoReal` y solo se usa vía `deducirClaseMovimiento()` (migración v3 y `claseEfectivaMovimiento()`): ningún lector mira etiquetas por su cuenta. `actividad_reciente.js` ya no mantiene su propia copia de la regla de "ingreso real".
- **Red de seguridad en `save()`:** todo movimiento sale a la nube con `clase`. Si un módulo, o un dispositivo con la app vieja, crea uno sin ella, se deduce con las mismas reglas de la migración y se avisa una vez por sesión en consola.
- **Guardia contra regresiones:** `tests/clase-cobertura.test.js` falla si algún código crea un movimiento (objeto literal en `S.movimientos`, `S.gastosVar` o una cuenta personalizada) sin `clase`. Se verificó rompiéndola a propósito.
- **No cambia:** almacenamiento (siguen las mismas listas), saldos, `calcPatrimonioTotal()` y la API de `Periodo`.
- **Fuera de alcance, a propósito:** `tcMovimientos`, `deudores/misDeudas/encargos[].movimientos` y `transferencias` no se estampan (nada lee su clase y no hay regla para clasificarlas sin adivinar). Las `salida`/`egreso` espejo tampoco (no son ingreso ni gasto: solo mueven plata). "Restar dinero" sí lleva `clase` `gasto`: ver la entrada siguiente.
- **Alcancía (revisado):** los depósitos "Plata mía / Regalo de mamá / Pago de mamá por un mandado" son plata que nunca estuvo en una cuenta y se registran como `ingreso` (es lo que el módulo ya hacía a propósito); lo que otras pantallas excluyen de ellos es solo para no mostrar el monto en las listas, no cambia el ingreso del mes. El único dudoso es "Plata mía" (ahorro propio que antes no estaba registrado), que se mantiene como ingreso.
- **Verificación:** sobre el backup del 2026-10-09 (`scripts/equivalencia.js`, que cubre todos los meses de enero a octubre, cuenta `sinClase` y tiene modo `--comparar`) ingresos y gastos por mes y patrimonio quedan idénticos, salvo la corrección de la entrada siguiente. Tests: `tests/clase-movimientos.test.js` (equivalencia, migración idempotente, tabla de deducción) y `tests/clase-cobertura.test.js`; 253 de 253 en verde.
- **Documentación:** actualizados `mis-finanzas.md` (principio de `clase`, filas de `periodo.js` y `nu-calc.js`), `analisis-financiero.md`, `salud-financiera.md`, `inicio.md`, `proyeccion-financiera.md`, `cuentas.md`, `alcancia.md`, `encargos.md`, `plata-comprometida.md`, `gastos.md`, `tarjetas-credito.md`, `mesada.md`, `spotify.md`, `prestado.md`, `actividad-reciente.md` y `configuracion.md`; se corrigió además en `cuentas.md` que la Mesada sí pasa por `registrarMovEspejo()`.
- **Pendiente:** (1) etapa E5 (ver `plan-clasificacion-movimientos.md` §11: congelar la cascada dentro de la migración v3 y quitar los fallbacks una vez desplegada); las migraciones v1/v2 ya se retiraron; (2) recomendado: una vez que ningún dispositivo use la app vieja, quitar la red de seguridad de `save()` si ya no se dispara.

### 🐛 Corrección (2026-10-09) — Los extras que entran directo a una cajita de Nu no contaban como ingreso del mes (`core-state.js`)

**Síntoma:** el extra/propina de Spotify o el extra de un pago de deuda guardado en una cajita (ej. $400 de Spotify, $2.000 de "Extra de pago") subía el patrimonio, pero el ingreso del mes de Inicio, Análisis y Wrapped no cambiaba.

**Causa:** `entradasIngresoReal()` solo leía `S.movimientos` y las cuentas personalizadas; el historial de las cajitas (`cajita.historial`) nunca se miraba, aunque esos movimientos ya estaban marcados `_esExtraIngreso`.

**Corrección:** `entradasIngresoReal()` suma también las entradas de `cajita.historial` con `clase` `ingreso` (sin duplicar ids). Es plata nueva que antes no tenías, así que es ingreso aunque nunca pase por Nequi/Efectivo. Como el historial de una cajita solo lo escribe `registrarMovEspejo()`, un espejo viejo sin etiquetas se deduce `neutro` (no ingreso): solo cuenta con bandera explícita de plata nueva. Los intereses de Nu se tratan en la entrada "Rendimientos de Nu por mes" (abajo).

**Efecto sobre tus datos (backup 2026-10-09):** septiembre +$2.000 y octubre +$400 de ingreso; el patrimonio no cambia (esa plata ya estaba sumada). Tests: `clase-movimientos.test.js` (cajitas).

### 🔧 Refactor (2026-10-08) — `Periodo` (`js/core/periodo.js`): una sola definición del mes

**Antes:** refresh() (núcleo), Inicio (salud financiera y aviso de "Gastos altos"), Análisis (resumen, comparación, barras de 12 meses, ranking, presupuestos), el resumen de cierre de mes, la exportación CSV, la pantalla Gastos y Wrapped armaban cada uno su propia suma de gastos variables + gastos fijos pagados + mesada + ingresos fijos. Las copias se habían desalineado:
- **Comparación con el mes anterior (Análisis):** buscaba la Mesada con la clave `'2026-09'` en vez de `'2026-8'` (año-índice 0-11), así que el balance del mes anterior **nunca** incluía Mesada y la diferencia de balance salía inflada.
- **Gastos fijos pagados:** Análisis, Inicio, el núcleo y el cierre de mes usaban el monto *actual* del gasto fijo (editarlo reescribía los meses pasados); Wrapped usaba el monto realmente pagado. Un pago de un gasto fijo ya eliminado se perdía en el ranking de Análisis pero Wrapped sí lo contaba.
- **Cuota de Mesada sin dato:** Análisis/Inicio caían en la cuota más antigua (o 80.000); Wrapped en 0.
- **"Gastos altos" (hero de Inicio):** sumaba TODOS los gastos variables (incluidos pagos de gasto fijo y de TC) más TODOS los gastos fijos configurados, pagados o no: contaba doble y avisaba de más.
- **Exportar CSV:** cada gasto fijo pagado salía dos veces (como variable y como fijo).
- **Wrapped:** los pagos de gasto fijo llegaban sin categoría a "categoría top" y a "cambio de hábitos".

**Ahora:** `Periodo` (carga de entrada, sin DOM, recibe `estado` opcional) es la única fuente: `gastosDelMes`, `ingresosDelMes`, `balanceDelMes`, `mesadaDelMes`, `ingresosFijosDelMes`, `pagosFijos`, `gastosPorMes`, `gastoPorCategoria`, `cuotaMesada`, `ultimosMeses`. Reglas: un gasto fijo pertenece al mes de su **clave** en `S.pagosGastosFijos` (el mes que cubre, el mismo que usa la pantalla Gastos para "Pagado"); su monto es el **pagado**; los gastos variables reales excluyen `_esGastoVarNoReal()`. `getIngresosFijosMes()` y `_getCuotaAnio()` delegan en `Periodo`; `_wrappedMesadaMes`/`_wrappedIngresosFijosMes`/`_wrappedItemsRealesPeriodo`/`_wrappedCambioDeHabitos` también (Wrapped asigna un pago fijo a su mes-clave, no a su `fecha`). Todo test que cargue estos módulos debe cargar también `periodo.js` y `nu-calc.js` (ver `tests/README.md`); `Periodo` se expone además como `window.Periodo`. Tests nuevos: `periodo.test.js`, `migraciones.test.js`.

**Cambio de comportamiento deliberado en Gastos fijos:** el pago ahora guarda `cat` y `nombre`, y **eliminar un gasto fijo ya no borra sus pagos** (esa plata salió de una cuenta de verdad; borrarlos hacía desaparecer un gasto real de los meses pasados). El diálogo lo dice.

### 🐛 Bugs menores (2026-10-08, Inicio)
- `renderAttencion()` (CDT por vencer) y los avisos de encargos usaban `new Date(fecha+'T00:00:00')`: con fechas sin ceros (`2026-9-5`) daba `Invalid Date` y el aviso fallaba. Ahora usan `_fechaSafe()`.
- `renderProyeccion()` registraba un `document.addEventListener('click')` nuevo en cada `refresh()`. Ahora hay un solo listener global.

### 🔧 Modelo (2026-10-08) — `S.plataCometida` → `S.plataComprometida` (migración v2)
El campo tenía un typo desde el principio. `MIGRACIONES` v2 lo renombra al cargar (y junta ambos sin repetir ids si un dispositivo con la app vieja escribió el campo viejo). Cambiado en `core-state.js`, `plata_comprometida.js` y `wrapped.js`. **Antes de desplegar, buscar `plataCometida` en el resto de `js/` (p. ej. `tarjetas_credito.js`, `busqueda-global.js`, `actividad_reciente.js`): cualquier lectura que quede con el nombre viejo verá una lista vacía.**
`spotify.js` llamaba a `_calcCSafe()` (eliminada al mover `calcC` al núcleo): `getSpCajitaSaldo()` fallaba al abrir Spotify; ahora usa `calcC()` y hay test de regresión (`spotify-cajita.test.js`).
`actividad_reciente.js` también leía `S.plataCometida` (el feed dejaba de mostrar "Llegó/Esperando plata comprometida"): corregido.
La importación de backups (`configuracion.js`) ahora valida más campos, rechaza backups de una versión más nueva y ejecuta `aplicarMigraciones()` antes de reemplazar `S`.

### 🔧 Refactor (2026-10-08) — El cálculo de Nu pasa al núcleo (`js/core/nu-calc.js`); desaparecen los guards `typeof calcC`

**Antes:** `calcC`, `calcCDT`, `nuTotal`, `getNuTasaGlobal` y sus auxiliares vivían en `cuentas.js` (grupo lazy) y `getCajitaNombre` en `encargos.js` (lazy). El núcleo (`calcPatrimonioTotal`, `refresh`, `save`) las llamaba con envoltorios `_calcCSafe`/`_calcCDTSafe`/`_nuTotalSafe` y valores de respaldo, y `snapshotPatrimonio()` necesitaba `_patrimonioDependenciasListas()` para no grabar un patrimonio artificialmente bajo. Además `cuentas.js` llamaba `getCajitaNombre` sin guard aunque estaba en otro módulo lazy: si se abría Cuentas antes de que Encargos cargara, fallaba al pintar movimientos con cajita.

**Ahora:** todo el cálculo puro de Nu (tramos de tasa EA, saldo de encargos en cajita por fecha, CDT, rendimiento mensual de CDTs, `getCajitaNombre`) vive en `js/core/nu-calc.js`, de carga de entrada justo después de `core-state.js`. `cuentas.js` y `encargos.js` conservan solo UI y lo que muta datos (`materializarIntereses`, `registrarTasaNuHistorial`). Se eliminaron `_calcCSafe`, `_calcCDTSafe`, `_nuTotalSafe`, `_getNuTasaGlobalSafe` y los `typeof calcC === 'function'` de `cuentas.js`, `encargos.js` y `firebase-sync.js`. `_patrimonioDependenciasListas()` queda solo como guard mínimo contra un orden de `<script>` roto.

**Cambio de comportamiento:** `getNuTasaGlobal()` ya no lee el input `#nuTasaGlobal` ni escribe en `S` como efecto colateral: devuelve `S.nuTasaGlobal || 9.25`. El input ya escribía en `S` en cada cambio (`firebase-sync.js`).

**Todo test que cargue `cuentas.js`, `encargos.js` o `core-state.js` y use estas funciones debe cargar también `nu-calc.js`.**

### 🔧 Refactor (2026-10-08) — `save()` ya no lee inputs del DOM

**Antes:** `save()` leía `#nuRate`, `#mesadaMontoPapa/Mama`, `#spotifyCosto` y los inputs `cn_`, `cs_`, `cdt_*` de las cajitas. Estos últimos ya no se generaban en ningún render (código muerto), pero los demás hacían que el guardado dependiera de qué pantalla estuviera pintada (la cuota de Mesada necesitaba un guard por pantalla activa para no congelar un valor heredado).

**Ahora:** la cuota de Mesada y el costo de Spotify llevan `data-s-bind` y escriben en `S` al teclear (`_bindInputsAS()` en `sheet-stack.js`); la cuota solo se graba si difiere de la heredada (`_getCuotaAnio`), igual que antes. Se quitó el input oculto `#nuRate` (nadie lo editaba): `S.nuRate` solo se inicializa en 9,25 si falta. `save()` solo serializa `S`.

### ✅ Migraciones del modelo (2026-10-08) — `S.schemaVersion` y `MIGRACIONES` (`core-state.js`)

Antes no había dónde enganchar un cambio de modelo: `migrarCuentasLegacy()` se eliminó el 2026-10-05 y los backups viejos se rechazaban. Ahora existe `MIGRACIONES` (lista ordenada, cada una corre una vez y debe ser idempotente) y `aplicarMigraciones(d)`, llamada al inicio de `load()`. Versión actual: 1 (línea base, sin cambios de datos). Pendiente: llamarla también desde la importación de backups (`configuracion.js`).

### 🐛 Bugs menores (2026-10-08)
- `index.html`: el botón "Configurar saldo mínimo" tenía el texto duplicado.
- `index.html`: se borró el HTML del sheet `mov-cuenta-custom` (su acción `confirmarMovCustom` ya no existía; el botón "Agregar" no hacía nada). La rama `egreso` de `eliminarMovimiento()` se conserva: limpia datos históricos.
- `encargos.js`: `crearEncargo()` vaciaba `enc_nombre` y después lo leía para el log de actividad, que quedaba sin nombre.

### 🔧 Cambio (2026-10-08) — Service worker v18 → v19 (despliegue del refactor de Mesada)

Los JS se sirven con stale-while-revalidate y `index.html` con network-first, así que justo después de desplegar la **primera** carga mezcla `index.html` nuevo con JS viejos en caché (el `mesada.js` viejo no conoce el id renombrado `mesadaMontoMama`). Subir `VERSION` hace que el nuevo SW borre las cachés viejas al activarse y las cargas siguientes queden limpias; esa primera carga mezclada no se puede evitar (si algo se ve raro, recargar). `APP_SHELL` solo lista `index.html`, así que los JS de Mesada no necesitaron entrar en ninguna lista: se cachean al cargarse.


### ✅ Corregido (2026-09-27) — Flujos destructivos (borrar datos, cerrar sesión, eliminar cuenta) no bloqueaban el resto de la app mientras corrían

**Síntoma reportado:** al tocar "Borrar todos los datos", se podía seguir navegando mientras la operación corría en segundo plano; si en ese momento se tocaba "Cerrar sesión", la sesión se cerraba pero los datos **no** quedaban borrados. Por separado, al cerrar sesión la app seguía respondiendo a toques durante unos segundos antes de recargar.

**Causa raíz:** el guard agregado el mismo día en `Events.dispatch()` (entrada anterior de este changelog) solo bloquea el *mismo* elemento que disparó una acción async — no impide interactuar con el resto de la UI mientras esa acción corre. Ni `borrarTodo()` (`configuracion.js`) ni `_fbSignOut()` (`firebase-sync.js`) mostraban ningún overlay entre la confirmación y el `location.reload()` final (el único overlay era el diálogo de confirmación, que se cierra al instante al confirmar). Consecuencia real y verificada en el código: `borrarTodo()` nunca vacía `window.S` en memoria — solo escribe `{}` directo a Firestore —, así que si en esa ventana se alcanzaba a disparar `_fbSignOut()`, su guardado final (`setDoc` con `window.S`, todavía completo) volvía a subir los datos viejos, pisando el borrado recién hecho.

De paso, mismo patrón encontrado en `_fbDeleteAccount()`: mientras la eliminación de cuenta corría, se podía cerrar su overlay de confirmación tocando "Cancelar" o haciendo clic afuera (`_cerrarEliminarCuenta`), sin que eso detuviera el borrado en curso.

**Fix:** se reutiliza `#fb-loading-screen` (overlay de pantalla completa, `position:fixed`, `z-index:99999`, ya usado por el arranque de la app — ver `index.html`) para bloquear cualquier interacción con el resto de la app mientras corren estos tres flujos:
- `borrarTodo()`: se muestra apenas se confirma, se mantiene hasta el `location.reload()` final (todos sus caminos terminan en reload, incluido el de error de red).
- `_fbSignOut()`: igual, con la excepción de que si el guardado final falla (no hay reload en ese camino) el overlay se vuelve a ocultar antes del `return` para no dejar la app bloqueada.
- `_fbDeleteAccount()`: se agregó `window._fbDeleteAccountEnCurso`, chequeada en `_cerrarEliminarCuenta` — mientras es `true`, ni "Cancelar" ni el clic afuera del overlay hacen nada. Se limpia en los dos caminos de error (que no terminan en reload); en el camino de éxito es innecesario porque termina en `location.reload()`.

`#toast-container` tiene `z-index:2147483647` (por encima de cualquier overlay), así que los toasts de error de estos flujos se siguen viendo con el overlay de carga puesto.

**No probado en navegador real:** verificado con `node --check` en los tres archivos. Falta confirmar en un dispositivo real que el overlay tapa de verdad los toques durante cada flujo, y reproducir el escenario original (borrar datos → cerrar sesión durante la carga) para confirmar que ya no revive los datos viejos.

---

### ✅ Corregido (2026-09-27) — Doble clic en botones con acción async podía disparar la acción dos veces (ej. dos ventanas de login con Google)

**Síntoma:** al presionar el botón "Entrar con Google" dos veces seguidas, o mientras la ventana de login seguía abierta, se abría más de una ventana de Google. Además, si la pantalla de login llegaba a reaparecer un instante justo después de haber iniciado sesión con éxito (mientras `onAuthStateChanged` terminaba de resolver), un clic ahí volvía a intentar iniciar sesión aunque ya hubiera una sesión activa.

**Causa raíz:** `Events.dispatch()` (`js/core/events.js`) despachaba cada clic sin mirar si el handler anterior de ese mismo elemento seguía en curso — no existía ningún bloqueo por elemento para acciones asíncronas. `window._fbSignIn` (`firebase-sync.js`) tampoco tenía guard propio de re-entrada, ni chequeaba si ya había una sesión activa antes de llamar a `signInWithPopup`.

**Fix (dos capas, quirúrgico):**
- `js/core/events.js`: en `dispatch()`, si el handler devuelve una promesa (es `async`), el elemento que disparó el clic queda marcado como "ocupado" (`WeakSet`) hasta que la promesa se resuelva o falle; clics repetidos sobre ese mismo elemento mientras tanto se ignoran. No requiere ningún cambio en los módulos — basta con que el handler sea `async`. Los handlers síncronos (la mayoría: abrir un sheet, el teclado del PIN) no se ven afectados, para no romper casos legítimos de clics rápidos repetidos (ej. teclear "11" en el PIN).
- `firebase-sync.js`: `_fbSignIn` corta temprano si `window._fbUser` ya existe — cubre el caso que `Events` no puede deducir por sí solo (la pantalla de login reapareciendo brevemente tras un login ya exitoso).

Efecto colateral positivo: el mismo bloqueo de `Events.dispatch()` protege ahora, sin cambios adicionales, a cualquier otro botón `data-action` cuyo handler sea `async` (cerrar sesión, eliminar cuenta, activar/desactivar biometría, entre otros).

**No probado en navegador real:** verificado solo con `node --check` en ambos archivos. Falta confirmar en un dispositivo real que el doble tap en el botón de Google ya no abre dos ventanas, y que el parpadeo post-login (si sigue ocurriendo visualmente) ya no permite reiniciar el login.

---

### ✅ Mejorado (2026-09-23) — `Loader.ensureAll()` ya no precarga Mesada ni Spotify si su toggle de Configuración está apagado

`ensureAll()` (`lazy-loader.js`) precargaba en segundo plano todos los grupos lazy sin mirar `S.modulos`, así que `mesada.js` (~1.160 líneas) y `spotify.js` (~1.790) se descargaban y ejecutaban aunque el usuario los tuviera desactivados en Configuración → "Módulos activos" — con su ítem del menú "Más" oculto y sin ningún camino para abrir esas pantallas. Mismo criterio que ya se usaba para `wrapped` fuera de enero.

**Por qué es seguro:** Inicio no necesita esos archivos. Las funciones que lee de ambos (`getMesadaData`, `_getCuotaAnio`, `spNombreDe`, `spPersonaPagadaVigente`) viven en `calc-helpers.js` (carga de entrada), y `inicio.js` ya se salta ambos módulos cuando `S.modulos.mesada`/`S.modulos.spotify` no están activos. `applyModulos()` (`mas-menu.js`) solo muestra u oculta los ítems del menú; no interviene en la carga.

**Fix:** dentro del `filter` de `ensureAll()`, los grupos `mesada` y `spotify` se omiten solo si `S.modulos.<clave> === false` explícito. Si `S`, `S.modulos` o la clave no existen se precarga, como antes. `S` se lee con `typeof S !== 'undefined'`, no como `window.S`. Sin cambios en `toggleModulo()`: al reactivar el toggle, el grupo se descarga la primera vez que se entra a la pantalla (`showScreen()` → `Loader.ensure()`), como cualquier grupo lazy. Se actualizó además el comentario de `ensureAll()`: ahora lista qué grupos se excluyen de la precarga y por qué, y su "Por qué existe" — que decía que "Necesita atención" dependía de funciones lazy de Préstamos/Tarjetas/Mesada/Spotify — se corrigió tras verificarlo contra `inicio.js`, `prestado.js` y `tarjetas_credito.js`: las 6 funciones que usa `renderAttencion()` (`getDeudorSaldo`, `getMesadaData`, `_mesNombreDeKey`, `tcCupoUsadoPct`, `spNombreDe`, `spPersonaPagadaVigente`) ya viven en `calc-helpers.js`, así que esa sección no depende de ningún módulo lazy. Lo que sí sigue necesitando la precarga son dos cosas que usan `cuentas.js` (`calcC`/`calcCDT`/`calcRendimientoCDTsMes`/`nuTotal`) y `prestado.js` (`getDeudorSaldoPatrimonio`/`totalMisDeudasPendiente`/`totalPrestadoPendiente`): el snapshot del historial de patrimonio (`snapshotPatrimonio()` no graba nada hasta que `_patrimonioDependenciasListas()` ve cargadas `calcC`, `calcCDT`, `getDeudorSaldoPatrimonio` y `totalMisDeudasPendiente`) y la salud financiera / alerta de gasto alto de Inicio, que caen a un valor de respaldo si el archivo no cargó. Verificado también con `core-state.js`: `calcDeudaTcPropia`, `calcPatrimonioTotal` y `getIngresosFijosMes` viven ahí (carga de entrada, con sus dependencias internas), y ni `core-state.js`, ni `inicio.js`, ni `calc-helpers.js` llaman a nada de `mesada.js`/`spotify.js` salvo `renderMesada()`/`renderSpotify()` con guard `typeof` y solo si su pantalla está activa. Los comentarios de `_appFullyLoaded` y del disparo por `appDataLoaded` también repetían la afirmación vieja y se reescribieron.

Validado con `node --check` y un test con `vm` cargando el `lazy-loader.js` real, con `document`/`window` simulados y `S` como `let` de nivel superior: con todo activo se piden 11 grupos; con Mesada apagado 10 (sin `mesada.js`); con Spotify apagado 10 (sin `spotify.js`); con ambos apagados 9; con `S`, `S.modulos` o la clave sin definir se piden los 11; `wrapped` sigue el mismo criterio de antes; `_appFullyLoaded` termina en `true` en todos los casos. **No probado en navegador real:** confirmar que con Mesada/Spotify apagados esos dos archivos ya no aparecen en la pestaña Network, y que al reactivar el toggle y entrar a la pantalla cargan normal.

### 🔧 Consolidado (2026-09-22) — Cierre de `auditoria-tecnica.md`: CSP, escapado, modularización y rendimiento

`auditoria-tecnica.md` nació para trackear hallazgos de seguridad/arquitectura/rendimiento *pendientes* (por eso vivía aparte de este archivo), pero llegó a 886 líneas casi enteramente de hallazgos ya resueltos, narrados sesión por sesión. Se leyó completo, se separaron los pocos puntos genuinamente pendientes (quedaron en una versión mucho más corta del archivo) y se condensa acá, de una vez, todo lo que ya estaba cerrado:

**CSP — `'unsafe-inline'` eliminado de `script-src`.** Los 3 bloques `<script>` inline que quedaban en `index.html` (`S`/`save()`, sheet-stack/nav, `refresh()`+IIFEs) se extrajeron a archivos propios; los 29 archivos de la app quedaron auditados. `'unsafe-inline'` salió del todo de la política. De paso: 0 atributos `onclick`/`onchange`/`oninput`/hover inline en toda la app (proceso módulo por módulo, en paralelo con la modularización de abajo).

**Escapado — migración completa a `js/core/html-tag.js`.** Se corrigió un bug de fondo en `escHtml()` (no escapaba comillas dobles) y se creó una plantilla etiquetada `html\`\`` que escapa por defecto todo valor interpolado, con `raw()` como opt-out explícito para HTML de confianza (clases CSS fijas, SVGs). Los 14 módulos de dominio se migraron uno por uno; en el proceso aparecieron y se corrigieron ~20 sitios puntuales de texto libre sin escapar (nombres de persona/cuenta/categoría interpolados directo, la mayoría en `toast()` o en `<option value="...">`), el más serio en el buscador de movimientos de Cuentas (`f.q`, término de búsqueda del usuario, sin ningún escapado). Migración terminada — no queda ningún módulo de dominio con `.innerHTML` sin pasar por `html\`\``/`escHtml()`.

**Arquitectura — de un `index.html` monolítico a 14 módulos + carga lazy.** Los 14 módulos de dominio (Spotify, Mesada, Encargos, Préstamos, Tarjetas de Crédito, Cuentas, Gastos, Plata Comprometida, Alcancía, Configuración, Actividad Reciente, Análisis, Personas, Inicio) se extrajeron a `js/modules/`, y el núcleo compartido a `js/core/` (`core-state.js`, `calc-helpers.js`, `events.js`, `lazy-loader.js`, entre otros). Encima de eso, los 11 módulos de pantalla se volvieron grupos lazy reales (`Loader.GROUPS`, cargados bajo demanda al entrar a cada pantalla, con `Loader.ensureAll()` precargando los 11 en paralelo en segundo plano tras el primer dato real) — el candidato más difícil (`cuentas`) tuvo una reversión y reactivación real por dependencias del núcleo que solo aparecieron al probarlo en navegador. `calc-helpers.js` nació específicamente para que Inicio pudiera leer 6 funciones puras de Mesada/TC/Préstamos/Spotify (`getMesadaData`, `getTCById`, `getDeudorSaldo`, `spNombreDe`, etc.) sin forzar la carga de esos módulos completos solo para "Necesita atención". En el camino se encontraron y corrigieron varios acoplamientos ocultos entre módulos lazy sin guard `typeof` (`spotify.js`↔`tarjetas_credito.js`, `cuentas.js`↔`encargos.js`, `movimientos.js`→3 módulos), y 3 casos reales de código duplicado (el bloque de pintar avatar de persona, repetido 5 veces entre 3 módulos; `_fuenteLabelHtml()` definida dos veces; el guard de `_ensureMesadas()` reimplementado a mano en `core-state.js`), todos consolidados en una sola función/lugar.

**Rendimiento — Lighthouse de 40 a 65-70 (mediana, sin PIN).** El diagnóstico real: el cuello de botella no era el JS propio sino la cadena Auth→Firestore bloqueando el primer contenido visible. Resuelto en capas: `async`/`defer` en los scripts de Firebase, pintar con el caché local de Firestore antes de esperar la confirmación del servidor, evitar cargar el iframe de Auth y `gapi` en el arranque normal (`initializeAuth` sin `popupRedirectResolver` cuando hay sesión previa), y la modularización lazy de arriba (TBT: 8.980ms → 1.840-3.240ms). Un CLS de 1.001 (roto) resultó tener cuatro causas reales superpuestas, diagnosticadas con 6+ corridas de Lighthouse: `.app{height:100dvh}` en vez de `100svh`; falta de `.app{display:none}` mientras el overlay de PIN lo tapaba (la API de Layout Instability de Chrome no excluye elementos tapados por z-index); "Necesita atención" y las cards de salud financiera/proyección arrancando vacías sin `min-height` (resuelto con skeletons); y `#hero-alcancia-indicator`/`div.grid3` revelándose de golpe cuando cargaban los módulos lazy. CLS final: 0.011-0.216 según la corrida (antes 1.001). Se resolvieron además: contraste insuficiente en `.pin-forgot`, CSP bloqueando `apis.google.com/js/gen_204`, CSS inline (46 KB) extraído a `styles.css`, Font Awesome self-hosteado como subset (156 KB → 4 KB), 22 botones ícono-solo sin `aria-label`, y un harness de tests unitarios con el test runner nativo de Node.

Detalle completo, número por número y sesión por sesión, en el historial de git de `auditoria-tecnica.md` (no se borra el archivo, se lo redujo a lo que sigue realmente pendiente — ver ese archivo).

### 🐛 Corregido (2026-09-20) — CI: `totalPrestadoPendiente.test.js` fallaba (2 tests, `Expected 300000, Actual 0`) tras mover `getDeudorSaldo()` a `calc-helpers.js`

`totalPrestadoPendiente()` (`prestado.js`) llama a `getDeudorSaldo()` como global. Al moverla a `calc-helpers.js` (ver `CHANGELOG.md#inicio`), ese test —que cargaba solo `core-state.js` y `prestado.js` en modo `permissive`— dejó de tenerla: el `Proxy` fabrica un no-op que devuelve `undefined`, `saldo > 0` da falso y la suma queda en 0 **sin ningún error** (la trampa ya documentada del modo `permissive`). Fallaban los tests de las líneas 54 y 64; los demás pasaban porque no llaman a esa función. El aviso de GitHub "Node.js 20 is deprecated" no era la causa.

Fix: `tests/totalPrestadoPendiente.test.js` carga ahora `core-state.js → calc-helpers.js → prestado.js`, el mismo orden que `index.html`. Reproducido con el `load-app.js` real (con un `core-state` mínimo de stand-in): `prestado.js` original 300.000; nuevo sin `calc-helpers.js` 0; nuevo con `calc-helpers.js` 300.000. Pasan los 6 tests que no necesitan el `core-state.js` real; los 2 de `calcPatrimonioTotal` de ese archivo quedan para confirmar en CI.

`calcC-calcCDT.test.js` también carga `prestado.js`, pero no llama a `getDeudorSaldo()` (ese test no falló), así que no se tocó. `calcHealthScore.test.js` ya cargaba `calc-helpers.js`.

**Regla para el futuro:** si una función se mueve a `calc-helpers.js`, todo test que cargue el archivo de origen y la use tiene que cargar también `calc-helpers.js`. En modo `permissive` la omisión no falla: da resultados en silencio.

### ✨ Agregado (2026-09-20) — `js/core/fuentes-filtro.js`: un solo lugar para decidir qué cuentas se ofrecen cuando la plata SALE

Los selectores "¿De dónde sale la plata?" listaban todas las cuentas sin importar si tenían saldo — invitando a elegir una cuenta vacía (o una TC sin cupo) y enterarse recién al confirmar. Cada módulo lo habría resuelto por su cuenta (ya existía `_alcFiltrarFuentesPorSaldo()` en Alcancía con umbral $50), así que se creó un archivo núcleo con la regla y los umbrales, en vez de repetirla en cinco módulos.

`FuentesFiltro` (constante global, mismo estilo que `Events`) expone: `filtrar(fuentes, opts)`, `optsHtml(fuentes, opts)` (pasa la lista filtrada a `buildFuentesOptsHtml` vía `fuentesCustom`, sin modificarlo), `podar(select, opts)` (quita las opciones no utilizables de un `<select>` ya poblado por `poblarFuente`; patrón: `poblarFuente(id)` seguido de `FuentesFiltro.podar(id, ...)`), `utilizable(valor, opts)`, `tcConCupo(tc)`, `hayTCConCupo()` y `puedeMover(valor)`. Umbrales en `FuentesFiltro.MIN` / presets en `FuentesFiltro.PRESET`:

| Flujo | Preset | Regla |
|---|---|---|
| Gastos, préstamos dados, transferencias, gasto fijo, "Yo debo → pagar" | `SALIDA` | cuenta con saldo ≥ $1,00; TC con cupo disponible ≥ $1,00 |
| Pagar Spotify | `SPOTIFY` | cuenta con saldo ≥ $50,00; TC con cupo disponible ≥ $50,00 |
| Pagar una TC | `PAGO_TC` | cuenta con saldo > $0 (se abona lo que sea), **efectivo ≥ $1.000**; nunca TC |

Los valores que no son una cuenta (`''` = "Sin especificar", `'ganancia'`, `'__sin_especificar__'`) nunca se filtran. Se compara en centavos (`Math.round(x*100)`), no con floats. **No se usa en selects donde la plata ENTRA** (destinos de mesada, cobros de Spotify, abonos, "Sumar dinero", destino de Transferir): ahí filtrar por saldo impediría depositar en una cuenta vacía.

`sheet-stack.js`: `openSheet('gasto-var')` — el único que puebla `gv_fuente` — ahora llama a `FuentesFiltro.podar('gv_fuente', ...)` justo después de `poblarFuente('gv_fuente', true)`.

`index.html`: `<script src="js/core/fuentes-filtro.js" defer>` justo después de `calc-helpers.js` (usa `getSaldoFuente`/`buildFuentesOptsHtml` de `core-state.js` y `tcCupoDisponible`/`getTCById` de `calc-helpers.js`, pero solo al ser llamado). `sw.js` no necesitó cambios: su `APP_SHELL` solo lista `index.html` y el resto de archivos entra por `staleWhileRevalidate`.

Validado con `node --check` y jsdom cargando el `core-state.js`/`calc-helpers.js` reales y el `openSheet` real de `sheet-stack.js` (bordes 0,99/1,00, 49,99/50,00, 999,99/1.000, TC sin cupo, escape de `label`, reabrir con saldo nuevo). **No probado en navegador real.**


### ✅ Corregido — Un cambio hecho justo antes de salir de la app podía no llegar a la nube

*(2026-09-19)*

Un cambio no se sube "de una": `debounceSave` espera ~0,8 s y `_fbSaveToCloud` otros 1,5 s antes de empezar a escribir, más el tiempo de red. El único guardado de emergencia era `beforeunload` (`core-state.js`), que en celulares casi nunca se dispara al cambiar de app o cerrarla. Escenario concreto: hacer un cambio en el celular, salir enseguida y abrir la app en el PC — el cambio podía no haber salido todavía.

Fix (`firebase-sync.js`): el cuerpo del guardado se extrajo a `_ejecutarGuardado()` para poder correrlo de inmediato; `_fbFlushSave()` lo ejecuta sin esperar el debounce, solo si hay un guardado pendiente. Se llama al pasar la página a segundo plano (`visibilitychange` → `hidden`) y en `pagehide`, con un guard de 1 s porque suelen llegar juntos. Si este dispositivo modificó algo (`_locallyModified`) se corre `save()` antes, por si el debounce corto no había disparado. Respeta `_dataLoaded`: en modo lectura no escribe.

**Limitación conocida:** reduce la ventana de ~2,3 s a prácticamente cero, pero no lo garantiza — si el sistema congela la página antes de que termine el envío, la escritura queda en la cola local de Firestore y sale la próxima vez que se abra la app en ese dispositivo.

### 🔧 Cambio — Firestore y Auth ya no pasan por el Service Worker (`sw.js` v6)

*(2026-09-19)*

El error `Cache.put() encountered a network error` venía de que `networkFirst` clonaba para caché las respuestas de Firestore, incluido el canal de escucha (`onSnapshot`), un stream largo que no termina hasta que el SDK lo corta. Además, el fallback de `networkFirst` respondía a una request de Firestore con una página HTML de "Sin conexión" con status 200, en vez de un error de red.

Fix: Firestore, Identity Toolkit y SecureToken ya no pasan por el SW (sin `respondWith`); el SDK de `gstatic.com/firebasejs` se sigue cacheando con `networkFirst`. Todas las escrituras en caché usan `guardarEnCache()`, con `.catch`, para que un fallo de caché no salga como error sin manejar. `VERSION` sube a `mis-finanzas-v6`, lo que borra el caché v5 al activarse.

### 🐛 Corregido (2026-09-10) — Colisión de nombres real: `alcancia.js` pisaba la función global `_initMoneyInput` de `money-input.js`

Al auditar `js/modules/*` completo se buscaron nombres de función duplicados entre archivos (`grep` de `^function nombre` en los ~30 archivos del proyecto). Aparecieron dos: `_validarEstructuraJSON` (ya conocido — `import-validado.js` está fusionado dentro de `configuracion.js` desde el 2026-08-30, el archivo viejo es peso muerto ya documentado) y **`_initMoneyInput`, que sí era un bug real y activo**:

- `js/core/money-input.js` define `function _initMoneyInput(el)` — toma el **elemento DOM** y siembra el buffer de dígitos (`_moneyDigits`) a partir de su valor actual. La llama internamente en cada `focusin` de cualquier `.money-input` de toda la app, y también la llama `tarjetas_credito.js`.
- `js/modules/alcancia.js` definía **su propia** `function _initMoneyInput(id)` — firma incompatible, toma un **id de string**, busca el elemento y le engancha un listener completamente distinto (o el fallback de abajo).

Al ser ambos `<script>` clásicos compartiendo el mismo scope global, cuando `alcancia.js` cargaba (lazy, al entrar a la pantalla Alcancía) su declaración de función **pisaba** la de `money-input.js` — sin ningún error, `function` duplicada en el mismo scope simplemente gana la que se ejecuta/parsea después. A partir de ahí, el `focusin` global de `money-input.js` (usado por *todos* los inputs de plata de la app, no solo los de Alcancía) empezaba a llamar a la función de Alcancía en su lugar, pasándole un elemento DOM donde esa función espera un string. `document.getElementById(elementoDOM)` no encuentra nada → la función no hace nada → el buffer de dígitos nunca se inicializa.

**Efecto real, no cosmético:** cualquier input de plata que ya tuviera un valor cargado (el caso típico: abrir "editar" sobre un gasto/préstamo/tarjeta ya existente) mostraba `0,00` al primer click en vez de conservar el valor — silenciosamente, sin ningún error en consola. Bug latente desde que existe `alcancia.js`, activo para el resto de la sesión desde el momento en que el usuario visita Alcancía una sola vez.

**Fix:** se renombró la función de `alcancia.js` a `_alcInitMoneyInput` (y sus 4 llamadas internas) — nombre namespaced, cero relación real con la de `money-input.js` más allá de la coincidencia de nombre. Sin cambios de comportamiento en Alcancía misma.

**Hallazgo aparte, no corregido:** `alcancia.js` llama a `moneyInputAttach(el)` en 5 lugares, pero esa función **no está definida en ningún archivo del proyecto** — `typeof moneyInputAttach === 'function'` siempre da `false`, así que Alcancía siempre tomó la rama de *fallback* (un parser simplificado con `replace`/`parseFloat`, sin el formateo estilo calculadora del resto de la app). Es una inconsistencia de UX preexistente, no una colisión de scope — se documentó en el propio archivo pero no se tocó, porque arreglarla cambiaría el comportamiento visible de esos 4 inputs y conviene decidirlo aparte, no de paso.

**Resto del barrido de `js/modules/*` + `styles.css` + `sw.js`:**
- `analisis.js`, `configuracion.js`, `cuentas.js`, `gastos.js`, `mesada.js`, `personas.js`, `wrapped.js`: sin wraps manuales de `refresh`/`openSheet`/`showScreen`/`applyModulos` (no había nada que migrar a `hookGlobal()` en estos 7), sin más nombres de función duplicados, sin `navTo()` real (solo menciones en comentarios), sin selectores de color propios sin migrar a `marcarColorSeleccionado()` (`cuentas.js` ya lo usa), sin interpolación de texto libre sin escapar en `toast()`/`.innerHTML` detectada por heurística (`err.message`, `_motivo`, `fmt(...)`, valores numéricos — nada de texto libre de usuario).
- `styles.css`: nota menor, no corregida — `.overlay` define `backdrop-filter` dos veces (línea ~132: `blur(4px)`; línea ~450, comentario "Overlay de sheet con mejor blur": `blur(6px)`). La segunda gana en cascada por igual especificidad — la primera queda muerta. Cosmético, cero riesgo, se deja anotado como candidato de limpieza opcional.
- `sw.js`: revisado completo, sin hallazgos — versión de caché, estrategias razonables por tipo de recurso (`cacheFirst` para fuentes, `networkFirst` para Firestore/auth/HTML, `staleWhileRevalidate` para el resto).

**También aprovechado de paso:** `plata_comprometida.js` ya tenía otro wrap manual sin migrar, de `window.renderAttencion` (no era duplicación real — único archivo que lo hacía — pero sí tenía el mismo problema de encimada silenciosa que el de `refresh()` migrado en la entrada anterior: si `window.renderAttencion` no existía todavía, el guard `typeof` no reintentaba nada). Se migró a `hookGlobal('renderAttencion', fn)` por la misma razón de robustez, aunque no hubiera triplicación que justificarlo por sí sola.

Validado con `node --check` en `alcancia.js` y `plata_comprometida.js`.

---

### ✅ Corregido (2026-09-10) — El mismo patrón de `hookGlobal()` estaba repetido 9 veces más, ahora en `js/modules/`

Al recibir el resto de los módulos (`js/modules/*`, `css/styles.css`, `sw.js`) se auditó si el patrón que motivó `hookGlobal()` (ver entrada de más arriba) aparecía también fuera de `js/core/`. Aparecía — 9 veces, en 6 archivos, para 3 funciones globales distintas:

| Archivo | Función envuelta |
|---|---|
| `actividad_reciente.js` | `refresh` |
| `encargos.js` | `refresh` y `openSheet` |
| `inicio.js` | `refresh` |
| `plata_comprometida.js` | `refresh` |
| `alcancia.js` | `openSheet` y `showScreen` |
| `spotify.js` | `openSheet` |

**Falsa alarma descartada en el camino, documentada por transparencia:** al buscar callers de `_cpInit()` (plata_comprometida.js) con `grep "_cpInit("` no apareció ninguno, lo que por un momento pareció código muerto. Era un error de método: se llama vía `setTimeout(_cpInit, 400)`, pasando la función como referencia sin paréntesis — un grep que exige el paréntesis literal no lo encuentra. Sí tiene caller (dos, por `DOMContentLoaded` y `appDataLoaded`, mismo patrón defensivo de doble disparo que ya usa `personas-init.js`). Se corrigió el método de búsqueda antes de reportar nada al respecto.

**8 de los 9 se migraron a `hookGlobal()`** — mismo cambio mecánico que en la entrada anterior, sin alterar la lógica de cada uno. Caso especial en `plata_comprometida.js`: su wrap de `refresh` tenía un guard `typeof` que, si `window.refresh` no existía todavía en ese momento, simplemente no enganchaba nada — en silencio, para siempre, sin reintento. En la práctica nunca fallaba (el wrap corre dentro de `_cpInit()`, disparado con `setTimeout` sobre `DOMContentLoaded`/`appDataLoaded`, mucho después de que `refresh()` ya exista), pero `hookGlobal()` cierra ese caso límite de encimada: si alguna vez no existiera, esperaría con `waitFor()` en vez de rendirse.

**1 de los 9 se dejó sin migrar a propósito — `prestado.js` (`openSheet`):** su wrap tiene un `return` temprano para `id === 'nueva-persona'` que evita a propósito que corra el `openSheet` real (que abriría el sheet genérico `#sheet-nueva-persona`), porque este módulo quiere mostrar un selector de personas existentes (`abrirSelPersona`) en su lugar. `hookGlobal()` siempre llama a la función original y DESPUÉS a la nueva — no tiene forma de saltarse la original — así que forzar este caso a `hookGlobal()` habría abierto los dos overlays a la vez. Se dejó el wrap manual, documentado en el propio archivo como decisión, no como deuda pendiente.

**Nota aparte, no migrada:** `plata_comprometida.js` también envuelve `window.renderAttencion` (línea ~1831) con el mismo patrón manual + guard `typeof` sin reintento. No se tocó porque es un caso aislado — a diferencia de `refresh`/`openSheet`/`showScreen`, ningún otro archivo envuelve `renderAttencion`, así que no hay duplicación real que `hookGlobal()` esté resolviendo ahí, solo se ganaría la red de seguridad del reintento. Queda como candidato opcional, no como hallazgo urgente.

Cambio en `index.html`: el comentario de `hook-global.js` se generalizó (antes nombraba archivo por archivo; ahora dice "y varios módulos lazy" con puntero a esta entrada) para no quedar desactualizado cada vez que un módulo nuevo lo adopte.

Validado con `node --check` en los 6 archivos convertidos y en `prestado.js` (sin cambios de lógica, solo comentario).

---

### ✅ Corregido (2026-09-10) — `navTo()`/`nav.js` retirados: un solo caller real, duplicaba `showScreen()`

Al confirmar quién llamaba a `navTo()` (nav.js) se encontró que su único caller real era `tarjetas_credito.js` (botón "Ver todo", `Events.on('tarjetas:verTodo', () => navTo('tarjetas'))`) — el propio comentario de `nav.js` ya lo documentaba ("hoy el único caller real de navTo('tarjetas') es el propio tarjetas_credito.js"). No código muerto, pero sí una duplicación real: `navTo()` y `showScreen()` (`sheet-stack.js`) hacen básicamente lo mismo (togglear `.screen`/`.nav-item`, resetear scroll), pero evolucionaron por separado — `showScreen()` acumuló integración con `lazy-loader.js`, reset de estado de Préstamos y hooks post-navegación (config/análisis/wrapped/personas) que `navTo()` nunca tuvo; a cambio, `navTo()` cerraba el menú "Más" inline, algo que `showScreen()` delega a cada caller (ej. `mas-menu.js` llama `closeMas()` antes de `showScreen()`).

Sin código nuevo en `showScreen()`, el único caller real de `navTo()` no rompía nada hoy (`tarjetas_credito.js` ya estaba cargado cuando se disparaba), pero quedaba expuesto a que cualquier lógica nueva agregada a `showScreen()` en el futuro nunca llegara a esa pantalla vía ese caller.

**Fix:** `tarjetas_credito.js` cambió su handler `verTodo` de `() => navTo('tarjetas')` a `() => { closeMas(); showScreen('tarjetas'); }` — mismo patrón que ya usa `mas-menu.js` para sus propios ítems. Con eso, `navTo()` quedó sin ningún caller conocido y se retiró junto con `js/core/nav.js` (el `<script>` en `index.html` y el archivo en sí).

**Advertencia de alcance:** la confirmación de "único caller real" en el comentario original de `nav.js` estaba acotada a `navTo('tarjetas')` específicamente, no a `navTo()` en general — no se auditaron los ~28 archivos de `js/core`/`js/modules` buscando otros usos con otro nombre de pantalla. Se recomienda un `grep -rn "navTo("` sobre el repo completo antes de dar este retiro por definitivo en producción.

Cambios: `tarjetas_credito.js` (handler + comentario de cabecera), `index.html` (se retira `<script src="js/core/nav.js" defer>`, se actualiza el conteo de "16→14 archivos" en la nota de `personas.js`), `mis-finanzas.md` (fila de `nav.js` marcada como retirada en la tabla de estructura).

Validado con `node --check` en `tarjetas_credito.js`.

---

### ✅ Corregido (2026-09-10) — `mejoras.js` + `mejoras-adicionales.js` eran la parte 1 y la parte 2 del mismo bloque, fusionados en un solo archivo

Mismo caso que la fusión de `sheet-swipe.js` + `sheet-viewport.js` en `sheet-behavior.js` (ver entrada de abajo, 2026-09-08): los propios encabezados de cada archivo lo decían explícitamente —

```
mejoras.js:            // "MEJORAS ADICIONALES" (parte 1): ocultar saldos, hook de refresh...
mejoras-adicionales.js: // "MEJORAS ADICIONALES" (parte 2): registro de Service Worker...
```

— dos mitades de un mismo bloque original, separadas solo por el corte arbitrario de la sesión de extracción, no por ninguna diferencia real de responsabilidad. Además el nombre confundía: `mejoras.js` y `mejoras-adicionales.js` sonaban como si fueran conceptos distintos, cuando el primero también se autodenominaba "MEJORAS ADICIONALES" en su propio comentario.

No había ninguna dependencia de orden de carga real entre las dos mitades (cada sección depende de cosas ya definidas por otros archivos — `hookGlobal`, DOM, `S` — nunca de una sección de la otra mitad), así que fusionarlas fue seguro.

**Se conserva el nombre `mejoras-adicionales.js`** (coincide con el título real de la sección en `index.html`, "MEJORAS ADICIONALES: Service Worker, Gestos, Undo/Redo") y se retira `mejoras.js`. Contenido: igual que antes, concatenado — las secciones conservan su numeración original de cada mitad (1, 1b, 2, 3, 4, 6, 7, 8, 9, 10 de `mejoras.js`, seguidas de Service Worker/Autofocus/Aria-labels de `mejoras-adicionales.js`), sin renumerar a una secuencia continua — mismo criterio que se usó con `sheet-behavior.js`. De paso se aclaró un comentario ambiguo: "NAVEGACIÓN POR GESTOS — manejado por makeSwipeable() (sección 7)" hacía referencia a la sección 7 de `sheet-behavior.js`, no a la sección 7 de este archivo (que es "EXPORTAR CSV: migrado...") — confusión preexistente entre dos numeraciones independientes, ahora con una nota explícita.

**Cambios en `index.html`:** se retira el `<script src="js/core/mejoras.js" defer>`; solo queda `<script src="js/core/mejoras-adicionales.js" defer>`, en la posición donde antes cargaba `mejoras.js` (justo antes de `busqueda-global.js`). Se actualizaron los 3 comentarios que mencionaban ambos nombres por separado (bloque de `wait-for.js`/`hook-global.js`, la lista de "16 archivos auditados" cerca de `personas.js` — ahora 15 — y la nota de auditoría de `cuentas` lazy).

**Otros archivos con referencias actualizadas** (comentarios, no lógica): `core-state.js` (dónde se envuelve `refresh()`), `lazy-loader.js` y `personas-init.js` (notas de auditorías/consolidaciones pasadas, aclarando que los dos nombres mencionados ahí ya son un solo archivo), `wait-for.js` (la lista de consumidores directos de `waitFor()` ya no incluía a `mejoras.js`/`mejoras-adicionales.js` desde la consolidación en `hookGlobal()` de la entrada anterior — se corrigió para reflejar que hoy los únicos consumidores directos del `waitFor()` clásico son `personas-init.js` y `js/core/hook-global.js`).

Las entradas de este mismo `CHANGELOG.md` anteriores a esta fecha que mencionan `mejoras.js`/`mejoras-adicionales.js` como dos archivos separados **no se reescribieron** — describen hechos ciertos en el momento en que ocurrieron (mismo criterio ya aplicado con `sheet-swipe.js`/`sheet-viewport.js` tras esa fusión).

Validado con `node --check` en los 5 archivos clásicos tocados.

---

### ✅ Corregido (2026-09-10) — Patrón "capturar función global + envolver + esperar si no existe" estaba repetido en 5 sitios, consolidado en `hookGlobal()`

Mismo tipo de triplicación que ya se cerró con `waitFor()` (ver entradas de abajo, 2026-09-07) y con `crearSplitWidget()` en `split.js`, pero para el paso siguiente: no solo "esperar hasta que una función exista", sino "envolverla sin pisar lo que ya hacía, preservando `this`/`arguments`, y sin perder de vista que puede que aún no exista". Encontrado al auditar los wraps manuales de `window.refresh`, `window.openSheet` y `window.applyModulos`:

- `gastos-fijos-progress.js` envolvía `window.refresh` a mano, asumiendo sin guard que ya existía en ese punto (cierto solo por el orden de `<script>` en `index.html`, no una garantía real).
- `mejoras.js` tenía la misma receta pero con guard `typeof` + `waitFor()` explícito (~10 líneas) para el mismo `window.refresh`.
- `pin-bio.js` (`type="module" async`) reimplementaba la misma receta una tercera vez, con dos ramas casi idénticas según si `window.refresh` ya existía o había que esperarlo — y solo una de las dos ramas hacía un render inicial del botón, inconsistencia menor sin ningún motivo real detrás.
- `mejoras-adicionales.js` repetía el patrón completo para `window.openSheet` (con guard + `waitFor()` + `console.warn`), y de paso tenía un bug latente sin efecto real: comparaba `window.openSheet !== arguments.callee` dentro de una arrow function, donde `arguments.callee` apuntaba al IIFE completo del archivo, no a la función interna — la comparación nunca hacía lo que parecía.
- `mas-menu.js` repetía el mismo patrón una quinta vez para `window.applyModulos`, sin guard alguno (asumía carga síncrona ya resuelta).

**Se evaluó reusar `Events` (`js/core/events.js`) para esto y se descartó a propósito**: `Events.on(accion, handler)` guarda un único handler por nombre de acción y **avisa + pisa** si se registra dos veces la misma acción — correcto para su propósito (un click, un handler), pero exactamente lo contrario de lo que hace falta acá (varios módulos independientes suscritos al mismo `refresh()` sin pisarse). Forzar `Events` a servir ambos casos habría mezclado responsabilidades que el propio archivo dice explícitamente que no quiere mezclar.

**Solución:** `js/core/hook-global.js` (nuevo, `<script defer>` clásico) expone `hookGlobal(name, fn, opts)`: si `window[name]` ya es función la envuelve de inmediato, si no espera con `waitFor()` (mismas `opts`) y envuelve apenas aparezca — en los dos casos `fn` recibe los mismos argumentos que recibió `window[name]`. Mismo split classic/module que ya existe entre `wait-for.js`/`wait-for-module.js` y por el mismo motivo (un `async` module no tiene garantía de orden frente a un `<script defer>`): se agregó `js/core/hook-global-module.js` (ES module, `export function hookGlobal`) para `pin-bio.js`, que lo importa junto con `waitFor` de `wait-for-module.js`.

Los 5 archivos consumidores pasaron de reimplementar la receta a una sola llamada:
- `gastos-fijos-progress.js`: `hookGlobal('refresh', updateFijosProgress)`
- `mejoras.js`: `hookGlobal('refresh', _renderMejoras, { intervalMs: 100 })`
- `mejoras-adicionales.js`: `hookGlobal('openSheet', fn, { intervalMs: 100 })` — de paso se eliminó el bug latente de `arguments.callee` (waitFor ya cubre "esperar hasta que exista" con su propio `checkFn`).
- `mas-menu.js`: `hookGlobal('applyModulos', fn)`
- `pin-bio.js`: `hookGlobal('refresh', _renderBtn)` + una llamada a `_renderBtn()` fuera del hook. Cambio de comportamiento menor e intencional: antes solo la rama "había que esperar" hacía un render inicial; ahora las dos rutas lo hacen siempre (idempotente, no cambia nada visible).

Cambio en `index.html`: un `<script src="js/core/hook-global.js" defer>` nuevo, justo después de `wait-for.js`. `hook-global-module.js` no tiene `<script>` propio — igual que `wait-for-module.js`, solo existe como dependencia vía `import`.

Impacto medido en tamaño: las líneas de código real (sin contar comentarios/blancos) de los 5 archivos consumidores bajaron de 674 a 633 líneas combinadas (−41); los dos archivos nuevos suman 35 líneas de código real. Neto: prácticamente plano en código real, con dos archivos más en el árbol — el costo no es de peso, es un archivo más que conocer al leer el orden de carga (mismo trade-off ya aceptado con el split `wait-for.js`/`wait-for-module.js`).

Validado con `node --check` en los 5 archivos clásicos y con `node --check --input-type=module` en los 2 archivos ES module.

---

### ✅ Mejorado (2026-09-08) — `onGiveUp` con `console.warn` en los 2 de 8 llamados a `waitFor()` que sí pueden agotar intentos

De los 8 sitios consolidados en `waitFor()` (ver entradas de abajo), solo 2 tienen `maxAttempts` finito — `personas-init.js` (25 intentos, ~5s) y `alcancia.js` (40 intentos, ~12s). Los otros 6 reintentan para siempre (`mejoras.js`, `mejoras-adicionales.js`, `pin-bio.js` ×2, `firebase-sync.js` ×2), así que un `onGiveUp` ahí nunca llegaría a dispararse — no se les agregó, a propósito: forzarles un tope solo para que `onGiveUp` "sirviera" habría sido cambiar su comportamiento real (de reintento infinito a reintento con límite), un cambio de política distinto y con su propio riesgo, no una mejora de logging gratis.

Antes, si `personas-init.js` o `alcancia.js` agotaban sus intentos sin que la condición esperada se cumpliera, la falla era 100% silenciosa — ningún rastro en consola, solo el efecto (sheets de personas nunca inyectados / Alcancía nunca inicializada) sin ninguna pista de por qué. Se agregó `onGiveUp: () => console.warn(...)` a esos dos llamados únicamente. No cambia el camino exitoso en absoluto — solo agrega una rama que antes no existía, para el único escenario que hoy fallaba sin dejar ninguna huella.

Validado con `node --check` en ambos archivos.

### ✅ Corregido (2026-09-08) — `sheet-swipe.js` + `sheet-viewport.js` fusionados en `sheet-behavior.js`

Recomendado en la discusión de esa sesión sobre qué archivos de `js/core/` convenía unir, y aplicado después. Los dos eran mitades de la misma lista numerada de comentarios original ("2. SHEET SWIPE-TO-CLOSE", "3. SCROLL INTO VIEW...", "3b. VISUAL VIEWPORT...", "5. CAJITAS COLAPSABLES", "6. ATENCIÓN section", "7. SWIPE TO CLOSE") — no una separación real de responsabilidad, sino el corte arbitrario de la sesión de extracción original. Ambos tratan el mismo objeto conceptual (comportamiento de un `.sheet`/`.overlay` una vez abierto: gesto de cierre por swipe, reposicionamiento con teclado en Android, scroll-into-view al enfocar un input), y ninguno tenía restricción de orden de carga real más allá de necesitar `closeSheet` (`sheet-stack.js`) ya definida.

`sheet-stack.js` NO se tocó — tiene restricción de orden de carga documentada y frágil, fusionar algo ahí habría sumado riesgo sin necesidad real.

Cambios en el repo: se borraron `js/core/sheet-swipe.js` y `js/core/sheet-viewport.js`, se agregó `js/core/sheet-behavior.js` (nuevo). En `index.html`, los dos `<script src="js/core/sheet-swipe.js" defer>` / `<script src="js/core/sheet-viewport.js" defer>` se reemplazaron por un solo `<script src="js/core/sheet-behavior.js" defer>`, en la misma posición relativa (antes de `gastos-fijos-progress.js`, después de `mas-menu.js`). También se actualizó el comentario que listaba los 16 archivos auditados para el orden de carga de `personas.js` (mencionaba los dos nombres viejos por nombre).

Validado con `node --check` sobre el archivo fusionado.

### 🐛 Corregido (2026-09-08) — 8ª copia del mismo patrón sin detectar, en `alcancia.js` (`js/modules/`)

Las entradas de abajo sobre la consolidación de `waitFor()` declararon el barrido "completo" y "cero copias en todo el proyecto" sin haber revisado `js/modules/` todavía (solo se tenían subidos los archivos de `js/core/` en ese momento). Al revisar los 14 archivos de `js/modules/` apareció una 8ª copia manual del mismo patrón, en el fallback de arranque de `alcancia.js`:

```js
let _alcTries = 0;
const _alcPoll = setInterval(()=>{
  _alcTries++;
  if(window.S && window._dataLoaded){ clearInterval(_alcPoll); _alcanciaInit(); }
  else if(_alcTries > 40) clearInterval(_alcPoll);
}, 300);
```

Migrada a `waitFor(() => window.S && window._dataLoaded, _alcanciaInit, { intervalMs: 300, maxAttempts: 40 })`, mismo intervalo y tope que tenía. `alcancia.js` carga vía `lazy-loader.js` (script clásico inyectado dinámicamente con `document.createElement`, mucho después de que `wait-for.js` — `<script defer>` del HTML inicial — ya terminó de correr), así que usa `waitFor()` como global sin ningún riesgo de la carrera que sí aplica a `pin-bio.js`/`firebase-sync.js` (ver entradas de abajo).

Barrido real y completo esta vez, `js/core/` + los 14 archivos de `js/modules/`: cero ocurrencias de `setInterval`/`setTimeout` recursivo del patrón "reintentar hasta que exista" en todo el código (no en comentarios). La única ocurrencia real de `setInterval` que queda en el proyecto es el autosave legítimo de `bootstrap.js` (cada 60s, no es del mismo patrón). Validado con `node --check`.

### 🐛 Corregido (2026-09-07/08, misma sesión) — `ReferenceError`/`SyntaxError` en producción por el diseño de la consolidación de `waitFor()`, corregidos en dos pasadas

**Primer bug:** la primera consolidación de los 4 reintentos async (`pin-bio.js`/`firebase-sync.js`, ver entrada de abajo) unificó `js/core/wait-for.js` en un solo archivo híbrido: `export function waitFor(...)` (para que esos dos lo importaran con `import`) más `window.waitFor = waitFor` al final (para que `personas-init.js`/`mejoras.js`/`mejoras-adicionales.js` lo siguieran llamando como global, vía `<script type="module">` sin `defer`). En producción, `personas-init.js` reventó con `ReferenceError: waitFor is not defined` — el global no estaba listo cuando ese `<script defer>` clásico corrió, pese a que `wait-for.js` aparece antes en el documento.

No se persiguió la causa exacta (candidatos: los módulos y los `defer` clásicos no comparten realmente la misma cola de ejecución ordenada pese a lo que sugiere la especificación, un 404 puntual de despliegue, o ambos) porque no hacía falta — la solución correcta no es entender ni depender de esa garantía cruzada, es no necesitarla. Se separó en dos archivos que no comparten ninguna suposición de orden entre sí:

- `js/core/wait-for.js` — vuelve a ser un `<script defer>` clásico simple (`function waitFor(...)`, sin `export`). Usado por `personas-init.js`/`mejoras.js`/`mejoras-adicionales.js`.
- `js/core/wait-for-module.js` (nuevo) — la misma función, pero como ES module de verdad (`export function waitFor`), consumida con `import { waitFor } from './wait-for-module.js'` solo desde `pin-bio.js`/`firebase-sync.js`. No tiene `<script>` propio en `index.html` — solo existe como dependencia de esos dos módulos.

**Segundo bug (despliegue parcial del primer fix):** tras aplicar la corrección de arriba, el usuario reportó `Uncaught SyntaxError: The requested module './wait-for.js' does not provide an export named 'waitFor'` en `pin-bio.js`/`firebase-sync.js`. Causa: se había actualizado `wait-for.js` (correcto, ya sin `export`) pero los `import` de `pin-bio.js`/`firebase-sync.js` seguían apuntando al nombre de archivo viejo (`'./wait-for.js'`) en vez de al nuevo (`'./wait-for-module.js'`) — archivos actualizados a medias, no un bug de diseño nuevo. Se corrigieron ambos `import` para apuntar a `./wait-for-module.js`.

Es la misma función de 15 líneas escrita dos veces, a propósito: preferible a una unificación "inteligente" que ya demostró romperse en producción. Validado con una simulación en `vm` de Node que reproduce fielmente dos `<script>` clásicos compartiendo el mismo contexto global (a diferencia de `require()`, que aísla cada archivo y no es representativa de cómo el navegador comparte `window` entre scripts) — confirmó que `wait-for.js` funciona como global sin `import`; y con una prueba de `import` real para `wait-for-module.js`.

### ✅ Corregido (2026-09-07, misma sesión) — Cierre completo: los 4 reintentos restantes de `pin-bio.js`/`firebase-sync.js` también consolidados, vía `import` de ES module

La entrada de abajo dejó **a propósito** sin migrar 4 reintentos más del mismo patrón — 2 en `pin-bio.js` (registro de `Events('pin', ...)`, hook de `refresh()`) y 2 en `firebase-sync.js` (`_runWhenEventListenersReady`, registro de `Events('authgate', ...)`) — porque ambos archivos cargan `type="module" async`, sin garantía de orden frente al `<script defer>` que carga `wait-for.js`. Depender de un `waitFor` global en ese contexto podía cambiar el polling duplicado por un `ReferenceError` intermitente si `wait-for.js` no había terminado de cargar todavía.

Se migraron los 4 a `waitFor()` importado con `import` de ES module — ver la entrada de arriba para el diseño final (dos archivos independientes, `wait-for.js` + `wait-for-module.js`); el primer intento de hacerlo con un solo archivo híbrido rompió en producción y se corrigió en la misma sesión.

Validado: `node --check` en los 3 archivos `defer`, chequeo de sintaxis ESM en `wait-for-module.js`/`pin-bio.js`/`firebase-sync.js`, y simulaciones reales en Node de ambos caminos (global vía `vm` compartiendo contexto, e `import` real).

### ✅ Corregido (2026-09-07) — Patrón "reintentar hasta que la función exista" estaba triplicado a mano, consolidado en `waitFor()`

El mismo patrón (`setInterval`/`setTimeout` recursivo + criterio propio de cuándo rendirse) estaba reimplementado por separado en tres archivos:

- `personas-init.js` (`_intentarInyectarPersonaSheets` — recursión con contador, tope 25 intentos / 200ms)
- `mejoras.js` (polling de `window.refresh` — `setInterval` cada 100ms, sin tope)
- `mejoras-adicionales.js` (retry de `window.openSheet` — `setInterval` cada 100ms, sin tope)

No era un bug activo (cada copia funcionaba bien por separado), pero es la misma categoría de riesgo que ya se documentó acá mismo con `window.Events`: la misma idea escrita a mano N veces, cada una con su propio intervalo/tope, sin una sola fuente de verdad — fácil de arreglar en una copia y olvidarse de las otras el día que haga falta.

Fix: nuevo `js/core/wait-for.js` con `waitFor(checkFn, callback, { intervalMs, maxAttempts, onGiveUp })`, cargado `defer` justo después de `calc-helpers.js` (sin dependencias, disponible para cualquier `defer` posterior). Los tres archivos de arriba ahora llaman a `waitFor()` en vez de reimplementar el loop. De paso se encontró y se sacó un bug latente sin efecto real en `mejoras-adicionales.js`: la condición vieja comparaba `window.openSheet !== arguments.callee` dentro de un arrow function — ahí `arguments.callee` apunta al IIFE que envuelve todo el archivo, no a la función interna, así que esa comparación nunca hacía lo que parecía.

Validado con `node --check` en los 4 archivos tocados.

### ✅ Corregido (2026-09-01) — `core-state.js`: módulos nuevos de protección por antigüedad nunca llegaban a cuentas con datos ya guardados

Al agregar protección por antigüedad a Alcancía y Plata Comprometida (ver `CHANGELOG.md#alcancía` y `CHANGELOG.md#plata-comprometida`), esas dos claves de módulo nuevas (`alcancia`, `plata_comprometida`) se agregaron primero solo al objeto `S` inicial — pero el `load()` real que corre en cada carga de datos guardados tenía esta guarda:

```js
if(!S.config.proteccionAntiguedad)S.config.proteccionAntiguedad={... las 7 claves originales ...};
```

Eso solo inicializa la config completa si `proteccionAntiguedad` falta **por completo**. Para cualquier cuenta que ya viniera usando esta protección (como la real, con las 7 claves originales ya guardadas), esta línea nunca se ejecuta de nuevo — así que un módulo nuevo agregado ahí jamás llegaba a los datos ya guardados, solo a una cuenta completamente nueva sin ningún dato previo. Mismo patrón de fondo que otras migraciones de este historial (agregar un campo/config nuevo sin backfill para datos existentes).

Fix: reemplazado por un backfill por clave — recorre los módulos conocidos y agrega solo los que falten en la config ya guardada, sin pisar los que el usuario ya tenga (incluidos ajustes manuales a umbrales existentes):

```js
const _paDefaults={spotify:{...}, mesada:{...}, ..., alcancia:{opsAviso:2,opsBloqueo:5}, plata_comprometida:{opsAviso:2,opsBloqueo:5}};
Object.keys(_paDefaults).forEach(k=>{ if(!S.config.proteccionAntiguedad[k])S.config.proteccionAntiguedad[k]=_paDefaults[k]; });
```

De paso se confirmó que `nivelAntiguedadMovimiento()` ya era defensiva ante una clave de módulo sin config (`cfg[modulo]||{}` — sin `opsAviso`/`opsBloqueo`, simplemente no dispara ese criterio, el de fecha sigue aplicando igual). Por eso se quitó el `try/catch` que se había puesto como cautela en `alcancia.js`/`plata_comprometida.js` mientras esta config no estaba confirmada — ya no hacía falta.

Validado con `node --check`.

### 🔍 Confirmado (2026-08-28) — Firestore sigue negociando por long-polling, no WebChannel

Quedaba pendiente desde las 3 corridas de Lighthouse del 2026-08-19 (ver `auditoria-tecnica.md`, nota de esa fecha): confirmar en la pestaña Network, con tráfico real, si el canal `Listen` de Firestore usa WebChannel (WebSocket) o long-polling — algo que un reporte de Lighthouse no puede distinguir por sí solo.

El usuario capturó 3 requests reales del canal `Listen`, todas con la firma inequívoca de long-polling clásico (protocolo `goog.net.rpc`, no WebSocket):

- `TYPE=xmlhttp` — Firestore cayendo explícitamente al modo de compatibilidad HTTP.
- `gsessionid` + `SID` + `RID=rpc` — parámetros de sesión propios de long-polling; no aparecen en una conexión WebSocket real.
- Ninguna con `101 Switching Protocols` en la pestaña WS.

**Esto no significa que `experimentalAutoDetectLongPolling: true` (aplicado el 2026-XX, ver punto "el cuello de botella real no es el JS") haya fallado o se haya revertido solo.** El propio nombre de la opción implica que Firestore puede elegir long-polling a propósito si detecta que el entorno lo necesita (proxies, extensiones, ciertas configuraciones de red/navegador) — lo único que garantiza es no *forzar* long-polling cuando no hace falta, no que nunca lo use. Lo que sí queda confirmado es que, en el entorno real donde se probó, **el costo de latencia extra de long-polling (varios round-trips HTTP en vez de una sola conexión persistente) sigue presente** — coincide con la latencia máxima de red de 2.998-3.696 ms que dominaba el LCP en las últimas corridas de Lighthouse.

**Decisión pendiente, no tomada todavía:** con esto confirmado, la única palanca de rendimiento que queda con margen real es repensar el arranque para pintar el dashboard con datos de caché local (IndexedDB) antes de esperar la confirmación de Firestore, en vez de bloquear el primer render en toda la cadena Auth→Firestore. Marcado como el cambio de mayor riesgo identificado en la auditoría — requiere `firebase-init.js`/`firebase-sync.js` para evaluarlo en serio, y no se empezó a tocar código.

### 🔍 Corrección (2026-08-28, misma sesión) — el "cambio de mayor riesgo" de arriba ya estaba dado; la causa real del LCP es otra

Con `firebase-sync.js`/`firebase-init.js` reales en mano, se confirma que "pintar el dashboard con datos de caché antes de que Firestore confirme" **ya está implementado** (era el "paso 4" documentado en `auditoria-tecnica.md`, sesión previa): `_fbLoadData()` pinta con lo que entregue primero el `onSnapshot` — caché local (`fromCache:true`, casi instantáneo vía `persistentLocalCache`) o servidor — sin esperar confirmación. La entrada de arriba (y una respuesta de chat basada en ella) asumía que esto seguía pendiente; era un error de no cruzar la nota contra el código real antes de repetirlo.

**Causa real de que el LCP siga en ~7s:** no es que se espere a Firestore (eso ya está resuelto) — es que todo el flujo depende de que `onAuthStateChanged` resuelva primero. Antes de poder construir la referencia al documento de Firestore hace falta el `uid` del usuario, y eso exige la cadena propia de Firebase Auth (`auth/iframe.js` → `getProjectConfig`), que corre *antes* de tocar Firestore, en serie, no en paralelo.

**Recomendación — no implementada a propósito:** la única forma de ganar ese tramo sería cachear el `uid` de la última sesión en `localStorage` y arrancar `_fbLoadData()` especulativamente en paralelo con la resolución de auth real, reconciliando si resulta ser otra cuenta o ninguna. Ese sí sería el cambio de mayor riesgo real — abre una carrera entre el PIN gate, el auth y una cuenta especulativa equivocada, la misma clase de bug de timing que causó la pantalla negra de `_initEventListeners` este mismo mes (ver más abajo). Para una app personal de un solo usuario, con una pantalla de carga visible al instante, el ahorro de 2-3s no justifica el riesgo. **Se cierra este frente de rendimiento sin más acción de código** — queda correctamente diagnosticado, no es un bug abierto.

### ✅ Cerrado (2026-08-28) — Hallazgo #1 de `auditoria-tecnica.md`: `Events.attr()` sí escapa internamente sus argumentos

Sospecha abierta desde la migración de Configuración: si `Events.attr(action, ...args)` no escapaba internamente, cualquier módulo que interpolara texto libre del usuario (nombre de categoría, de persona, etc.) en un `data-action` quedaba expuesto a romper el atributo e inyectar HTML nuevo. No se podía confirmar sin el archivo real.

Con `js/core/events.js` en mano, se confirmó que **sí escapa**: `attr()` arma `JSON.stringify(args)` y pasa ese string completo por `escHtml()` antes de meterlo en `data-args="..."` — el punto de escape centralizado que se pedía ya estaba en el diseño original del archivo.

Validado con una simulación jsdom que carga el `events.js` real (sin mockear `attr`/`dispatch`) y ejecuta el flujo de punta a punta — genera el atributo, lo inserta en el DOM real, dispara un `click` real y verifica qué le llega al handler:

- Payload `Comida"><img src=x onerror=alert(1)>` como argumento → 0 elementos `<img>` inyectados, el `<span>` conserva exactamente sus 2 atributos (`data-action`, `data-args`), y el handler recibe el string original intacto.
- Payload `O'Brien & <script>alert('x')</script>` → 0 `<script>` reales creados, dato reconstruido igual al original.

En ambos casos el dato viaja como dato (dentro del `data-args` escapado) y nunca se ejecuta como marcado. Esto también cierra la sospecha derivada de que el mismo patrón se repitiera en Encargos/Préstamos/Spotify con nombres de persona: como el escape vive dentro de `Events.attr()` mismo, cubre a cualquier módulo que lo llame, sin depender de que cada uno recuerde escapar a mano.

**Nota de robustez (no bloquea el cierre, no se toca):** el escape depende de `escHtml` ya existiendo como función global al momento de *llamar* `attr()` — el fallback es `: json` (sin escapar) si `escHtml` no está definida todavía, sin ningún aviso en consola. En el flujo real de `index.html` esto nunca ocurre (`attr()` solo se invoca durante el render, después de que `core-state.js` — donde vive `escHtml()` — ya corrió, sin importar que `events.js` se declare antes en el `<script>` de carga). Queda anotado por si algún día se reordenan los `<script>`; no amerita tocar `Events` ahora bajo el criterio de cambio mínimo.

Detalle y script de la simulación disponibles a pedido. Ver `auditoria-tecnica.md`, hallazgo #1 (ahora cerrado).

---

### 🐛 Corregido (2026-08-28) — Pantalla negra al reanudar: `_initEventListeners` podía llamarse antes de existir (race `async` vs `defer`)

Reportado por el usuario: PC suspendido con la pestaña de mis-finanzas abierta; al reanudar, pantalla en negro y en consola `Uncaught ReferenceError: _initEventListeners is not defined at _initAppUI (firebase-sync.js:146)`.

Causa: `firebase-sync.js` carga como `type="module" async` (a propósito, ver comentario junto al `<script>` en `index.html` — deja correr `_fbLoadData`/`onSnapshot` en paralelo con el parseo del documento). `async` no da ninguna garantía de orden frente a los `<script defer>`, incluido el que define `_initEventListeners`. Normalmente igual funciona porque Firestore tarda más en responder que en terminar de ejecutarse los `defer` — pero `onSnapshot(...,{includeMetadataChanges:true})` dispara primero desde el caché local de IndexedDB (`persistentLocalCache`), que con sesión ya "caliente" (como tras reanudar de suspensión) puede resolver en milisegundos: suficiente para ganarle la carrera a la cola de `defer`. `_applyCloudData` quedó registrado disparándose dos veces con el mismo `updatedAt` en el log del usuario — la primera vez (caché) truena en `_initEventListeners`, interrumpiendo `_initAppUI` a la mitad (nunca llega a `_injectErrorSpans`/`verificarVencimientosCDT`); la segunda (confirmación del servidor, ya con el `defer` cargado) corre bien pero ya era tarde.

Ya existía protección contra llamar `_initEventListeners` **dos veces** (ver comentario en `_finishFirstLoad`), pero no contra llamarlo **antes de tiempo**. Fix en `firebase-sync.js` (`_initAppUI`): en vez de apostarle a un orden de `<script>` no garantizado, se espera activamente con `_runWhenEventListenersReady()` (poll por `setTimeout` cada 20ms hasta que `typeof _initEventListeners === 'function'`) — mismo patrón que ya usa `mejoras-adicionales.js` para envolver `openSheet`. No se tocó el `async` de `index.html`; sigue siendo válido para su objetivo original.

---

### 🐛 Corregido (2026-08-20) — `split.js`: el motor de split de fuentes dejaba elegir la misma cuenta dos veces

El motor genérico de "split de fuentes" (usado por Mesada, MovEnc/Encargos y UsarParte vía `crearSplitWidget`) no validaba que dos filas del mismo split apuntaran a cuentas distintas: nada impedía, por ejemplo, dividir $30.000 poniendo $20.000 en Nequi en una fila y otros $10.000 en Nequi de nuevo en otra — el `<select>` de cada fila mostraba siempre el listado completo de `cfg.getFuentesFn()` sin mirar qué habían elegido las demás filas.

Fix: se agregaron `splitOpcionesUsadas(instId, rowExcluir)` (junta las cuentas ya elegidas en las otras filas de esa instancia) y `splitActualizarOpciones(instId)` (reconstruye el `<select>` de cada fila quitándole esas cuentas, conservando siempre su propio valor actual y la opción vacía "elige cuenta" para no autobloquear filas todavía sin elegir). Se llama en los tres puntos donde el conjunto de filas o sus valores cambia: al cambiar de cuenta en cualquier select, al borrar una fila (libera esa cuenta para las demás) y al agregar una fila nueva.

Como vive en el motor común, la validación aplica igual a Mesada, MovEnc y UsarParte sin tocar esos tres módulos ni el HTML — mismo principio de la migración original (`crearSplitWidget`/`splitToggle`/`splitGetData`/`splitPreview` con la misma firma y nombres globales).

### ✨ Agregado (2026-08-20) — Harness de tests unitarios para las funciones de cálculo puras

Cerraba el punto "Sin tests" de `auditoria-tecnica.md` desde hacía varias rondas. Cubre `calcPatrimonioTotal()`/`calcHealthScore()` (`core-state.js`/`inicio.js`) y `calcC()`/`calcCDT()`/`totalPrestadoPendiente()`/`getDeudorSaldoPatrimonio()`/`totalMisDeudasPendiente()` (`cuentas.js`/`prestado.js`) — **35 tests, los 35 pasan**, corridos contra los archivos reales de la app, sin copiarlos ni modificarlos.

Herramienta: test runner nativo de Node (`node --test`, disponible desde Node 18, cero dependencias — coherente con la arquitectura sin build tool del proyecto). El obstáculo real no era el runner sino cómo llamar funciones que solo existen como globals de un `<script>` clásico (sin `export`) sin tocar producción: se resolvió con un loader (`tests/support/load-app.js`) que ejecuta el código fuente real dentro de un contexto `vm` de Node, simulando cómo el navegador carga `<script defer>` (mismo scope léxico compartido entre archivos que se cargan en secuencia, `function` de nivel superior colgando de `window` — igual que en el navegador real).

Dos modos de carga en el loader:
- **`permissive: false`** (default) — usado para probar los *guards* (`typeof calcC==='function'`, etc.) que protegen `calcPatrimonioTotal()`/`calcHealthScore()` de que Cuentas/Préstamos sean lazy (ver el fix de `auditoria-tecnica.md #5`, `_calcCSafe`/`_calcCDTSafe`). Cualquier función no cargada da `undefined`/`ReferenceError` de verdad.
- **`permissive: true`** — usado al cargar `cuentas.js`/`prestado.js` reales, que referencian funciones de UI de otros archivos core no incluidos en el harness (`openSheet`/`toast`/`dialogo` — `sheet-stack.js`/`events.js`) a nivel de módulo. Un `Proxy` sobre el sandbox `vm` hace que cualquier global no definida caiga a un no-op en vez de reventar. **Ojo documentado en el propio loader:** en este modo `typeof cualquierCosa==='function'` siempre da `true` (el Proxy fabrica una función para todo) — mezclar este modo con un guard que depende de que algo NO exista contamina el resultado con `NaN`/`undefined` en silencio. Se encontró este problema en la práctica armando los tests de `calcC` (`calcPatrimonioTotal()` daba `NaN` porque `getDeudorSaldoPatrimonio`/`totalMisDeudasPendiente` — de `prestado.js`, no cargado en ese archivo de test — resolvían al no-op fantasma en vez de al fallback real de 0); se corrigió cargando `prestado.js` también, no ajustando el guard.

Bugs de arranque encontrados armando el stub de `document` (sin tocar producción, documentados por transparencia):
- `medirAnchoTexto()` en `core-state.js` crea un `<canvas>` a nivel de módulo (línea ~158) — no es un problema hoy, pero es una dependencia dura del DOM en el archivo "núcleo" que bloquea cargarlo en cualquier entorno sin `document.createElement('canvas').getContext('2d')` (Node, SSR, cualquier test runner futuro).

**Corrección de alcance:** la fila original de `auditoria-tecnica.md` mencionaba "priorizar amortización" junto a `calcPatrimonioTotal()`/`calcHealthScore()` — se confirmó que no existe ninguna función de amortización en este proyecto (revisados `core-state.js`, `calc-helpers.js`, `inicio.js`, `cuentas.js`, `prestado.js`). `prestamo_jfk_tracker.html` es un proyecto aparte, no relacionado con `mis-finanzas`.

No cubierto todavía: interacción de `calcHealthScore()` con préstamos reales (`totalPrestadoPendiente()` cargado junto con `inicio.js` en el mismo test — hoy están en archivos de test separados), y el interés compuesto de `calcC()` combinado con encargos en cuentas ajenas más complejas (parcialmente cubierto).

### ✨ Agregado (2026-08-19) — Emojis Unicode visibles reemplazados por íconos Font Awesome (`index.html`)

Barrido de todo `index.html` y `encargos.js` (excluyendo comentarios de código/HTML, que no se ven en pantalla) buscando emojis Unicode visibles al usuario — quedaban seleccionables/copiables desde la UI, indeseado. Se encontraron y reemplazaron dos:

- **`⚠` en el aviso "El encargo no alcanza para este monto"** (`#movenc-faltante-wrap`) → `<i class="fa-solid fa-triangle-exclamation">`.
- **`🆕` en el checkbox "Es un préstamo aparte"** (`#mov_grupo_check_wrap`) → `<i class="fa-solid fa-circle-info">`.

Ambos glifos ya estaban incluidos en el subset existente (`fa-subset.css` / `fa-solid-subset.woff2`) — no hizo falta tocar ninguno de los dos archivos, solo cambiar el marcado en `index.html`. Se mantuvieron `font-size`/`color` inline de cada caso para no alterar el aspecto visual. Los símbolos tipográficos usados como texto normal en cadenas de `encargos.js` (`→`, `←`, `−`, `↔`, p. ej. `"Sale $X → Recupero $X"`) no son emojis ni íconos de UI y se dejaron sin tocar.

### 🐛 Corregido — `busqueda-global.js`: `tipo` y `meta` de resultados sin escapar en `.innerHTML` (XSS real, no teórico)

*(2026-08-19, con `busqueda-global.js` en mano por primera vez desde su extracción del 2026-07-26)*

De los 3 campos que arma cada resultado de búsqueda (`desc`, `tipo`, `meta`), solo `desc` pasaba por `escHtml()` al momento de renderizar. `tipo` y `meta` se interpolaban directo en `.innerHTML` — y, a diferencia de los campos `nota` de otros módulos (que sí se escapan en su punto de render en `cuentas.js`, sea cual sea el módulo que los generó), acá no había ninguna capa de escape más abajo. Dos vías reales de texto libre llegaban sin escapar:

- **`meta`** — para resultados de tipo "Persona", arrastra `p.alias` y `p.notas` directo (`(p.alias?'@'+p.alias+' · ':'')+(p.notas||'Sin notas')`), ambos campos de texto libre editables desde la pantalla "Personas".
- **`tipo`** — para resultados de tipo "Abono", "Mov." (préstamos y cuentas personalizadas), arrastra el nombre de la persona/deudor/cuenta concatenado (`'Abono · '+d.nombre`, `'Mov. · '+d.nombre`, `'Mov. '+c.nombre`), también texto libre. Este mismo valor de `tipo`, además, se reutiliza sin escapar como título de cada sección agrupada (`g = r.tipo.split(' · ')[0]`).

Escenario concreto: ponerle a una persona el alias `<img src=x onerror=alert(1)>` (o cualquier payload real) y cualquier búsqueda global que la incluya entre los resultados lo ejecuta — sin necesidad de que la víctima entre al perfil de esa persona, alcanza con que aparezca en cualquier búsqueda global del propio usuario. Es el bug de escapado más directamente explotable de los encontrados en toda la auditoría hasta ahora — los anteriores (`fuenteLabel()` en Spotify/Encargos/etc.) requerían nombres de cuentas personalizadas, que se editan con menos frecuencia y suelen ser de un solo usuario; acá cualquier persona registrada en el sistema unificado (`S.personas`) puede disparar el mismo problema desde su alias o sus notas.

Fix: se envolvieron los tres puntos de interpolación (`escHtml(g)` en el título de sección, `escHtml(r.tipo)`, `escHtml(r.meta)`) — mismo criterio que ya tenía `r.desc`. `node --check` sin errores.

### ✅ Confirmado — CSP (`'unsafe-inline'` fuera de `script-src`): los 7 archivos núcleo restantes también están limpios

*(2026-08-19)*

Con `busqueda-global.js`, `pin-bio.js`, `bootstrap.js`, `import-validado.js`, `mejoras.js`, `mejoras-adicionales.js` y `nav.js` — la última tanda pendiente de la lista original de 7 archivos núcleo — se repitió el mismo barrido de atributos `onclick=`/`onchange=`/`oninput=`/`onload=`/`onmouseenter=`/`onmouseleave=`/`onmousedown=`/`onmouseup=` generados dinámicamente: **cero casos reales**, igual que en la tanda anterior. Con esto, los 28 archivos de `js/core/` y `js/modules/` recibidos hasta ahora están confirmados sin atributos inline. Sigue pendiente la prueba en navegador real antes de sacar `'unsafe-inline'` de producción — el análisis estático no puede reemplazarla (ya se demostró con el hallazgo de `onload` en `<link>` de `async-css.js`, que ningún barrido de los 4 atributos "clásicos" había cubierto).


### ✅ Cerrado (2026-08-17) — punto 12 de la auditoría: "TBT alto con el PIN activo" era una pista falsa, no `ensureAll()`

*(el usuario corrió Lighthouse con el PIN activo a pedido nuestro, tras notar que el Best Practices score bajaba de 100 a 92/64/61/62 con el PIN puesto — 4 corridas en total a lo largo de la investigación)*

**Hipótesis original (auditoria-tecnica.md #12):** `Loader.ensureAll()` (precarga en segundo plano de los 11 grupos lazy, disparada por `appDataLoaded`) corría sin esperar el desbloqueo del PIN, compitiendo por el hilo principal con el teclado del PIN.

**Primer intento de fix (revertido, ver más abajo):** se agregó un `MutationObserver` en `lazy-loader.js` que esperaba a que `#pin-screen` perdiera la clase `open` antes de programar el `requestIdleCallback` de `ensureAll()`.

**Por qué se revirtió — la hipótesis es imposible en el código real, no solo improbable.** Con `pin-bio.js`, `firebase-init.js` y `firebase-sync.js` confirmados línea por línea, la cadena real es: `appDataLoaded` (firebase-sync.js, `_finishFirstLoad()`) solo se dispara dentro del callback de `onSnapshot`, que solo existe si `_fbLoadData()` ya corrió, que solo se llama desde `_launchApp()` (`pin-bio.js`) — y ahí **siempre** después de `_hidePin()` (que ya sacó la clase `open` del `#pin-screen`). `firebase-init.js` confirma que el único otro llamador de `_fbLoadData` es un timeout de emergencia de 5s si `pin-bio.js` ni siquiera cargó — no un camino paralelo real. No existe ningún punto del código donde `ensureAll()` pueda estar corriendo con el PIN todavía en pantalla.

**Confirmado además por evidencia negativa en las 3 corridas de Lighthouse con el PIN activo:** ninguno de los 11 archivos de los grupos lazy (`cuentas.js`, `tarjetas_credito.js`, `encargos.js`, etc.) aparece en "Avoid long main-thread tasks" ni en "Reduce JavaScript execution time" de esas corridas — si `ensureAll()` hubiera corrido, tendrían que aparecer (como sí pasó en la sesión que originalmente detectó el problema de `ensureAll()` dentro de la ventana de TBT, ver la entrada de abajo). El bot de Lighthouse nunca tipea el PIN, así que `_fbLoadData()` nunca corre durante esas corridas.

**Qué explica el TBT real medido (1.530-2.510ms en las 4 corridas con PIN activo):** el propio SDK de Firebase Auth/Google — `gapi.loaded_0` (loader de Google API, parte de `GoogleAuthProvider`) consumiendo 300-520ms de CPU por corrida, con tareas hasta los 7,2s — más los módulos eager (~154 KiB: `core-state.js`, `gastos.js`, `personas.js`, `movimientos.js`, `sheet-stack.js`, `bootstrap.js`, `mejoras.js`, `inicio.js`) parseándose/ejecutándose. Ninguno de los dos es código propio tocable quirúrgicamente. Es la misma limitación arquitectural ya documentada en la sesión del 2026-08-15 (latencia real de Auth→Firestore + peso fijo del SDK de Firebase, sin fix de código posible sin introducir un build step) — el punto 12 no era un hallazgo nuevo, era el mismo de siempre con otro disfraz.

**`lazy-loader.js` revertido a su versión anterior** — el `MutationObserver` protegía una condición que no puede ocurrir; dejarlo hubiera sido un guard especulativo sin justificación real, y una fuente de confusión para la próxima persona que investigue TBT en esta zona del código. `node --check` sin errores tras revertir.

### ✅ Corregido (2026-08-17) — Contraste insuficiente en `.pin-forgot` y CSP bloqueando `apis.google.com/js/gen_204`

*(dos hallazgos nuevos de Best Practices/Accessibility, encontrados corriendo Lighthouse con el PIN activo — misma ronda que la investigación del punto 12 de arriba)*

**Contraste — `.pin-forgot` (`index.html`).** El selector combinaba `color:var(--text3)` con `opacity:.65`. `var(--text3)` sola, sobre `--bg`, da ~5,8:1 de contraste (pasa AA) — pero la `opacity:.65` extra la re-oscurecía a ~3,1:1, por debajo del mínimo de 4,5:1 para texto de 11px. Doble atenuación redundante: `.pin-bio-label` usa el mismo `var(--text3)` sin `opacity` y no tiene el problema — mismo criterio aplicado acá. Fix: se sacó `opacity:.65` de `.pin-forgot`.

**CSP — `connect-src` sin `apis.google.com`.** El SDK de `GoogleAuthProvider` intenta un beacon de telemetría interno (`apis.google.com/js/gen_204`, parte de `gapi.loaded_0`) que la CSP bloqueaba: `script-src` ya incluía `https://apis.google.com`, pero `connect-src` no. No rompía el login, pero quedaba logueado como error en consola y en el Issues panel de Chrome DevTools, y restaba puntos en Best Practices. Fix: se agregó `https://apis.google.com` a `connect-src`.

Verificado balance de tags (`<head>`/`</head>`/`<body>`/`</body>`) en `index.html` tras ambos cambios. No probado en navegador real con Lighthouse — falta correrlo de nuevo para confirmar que Best Practices vuelve a 100.

### ✅ Solución de fondo (2026-08-17) — primitivo `html\`\`` que escapa por defecto, cierra la causa raíz del hallazgo recurrente de `.innerHTML` sin escapar

El mismo bug (texto libre interpolado en `.innerHTML`/`toast()` sin pasar por `escHtml()`) se venía corrigiendo módulo por módulo desde julio — catorce veces, en catorce módulos distintos, siempre a mano (ver `auditoria-tecnica.md`, punto "Auditoría exhaustiva de `.innerHTML`"). Reforzar el barrido manual nunca cerraba el hallazgo de raíz: cada campo de texto libre nuevo, o cada función auxiliar nueva que lo envolviera (`spNombreDe`, `fuenteLabel`, `_cpFuenteLabel`...), volvía a reproducirlo.

**Fix real:** se creó `js/core/html-tag.js` con una plantilla etiquetada `html\`\`` que escapa automáticamente cualquier valor interpolado (usa `escHtml()`, ya existente en `core-state.js`), con un escape hatch explícito (`raw(valor)`) para los casos donde el valor ya es HTML de confianza — otro `html\`\`` anidado, o un valor fijo de CSS (`var(--red)`, nunca texto de usuario). A diferencia de `escHtml()` a mano, acá no hay nada que "olvidarse de envolver": el escapado es el comportamiento por defecto del propio template, así que el bug deja de poder reaparecer en cualquier sitio migrado.

Validado con 7 casos: escapado de `<script>` inyectado, comillas dobles dentro de un atributo, `raw()` como opt-out, anidamiento de `html\`\`` sin doble escapado, arrays de fragmentos resueltos sin `.join('')`, `null`/`undefined` tratados como string vacío, y coerción implícita al asignar el resultado directo a `el.innerHTML` (el objeto que devuelve `html\`\`` tiene `toString()`, así que funciona igual que un string normal en cualquier contexto que espere uno).

**Piloto de migración, `analisis.js` (`abrirPresupuestos()` / `renderPresupuestos()`):** convertidas ambas funciones de `escHtml()` a mano a `html\`\``. De paso se cerró un descuido que tenía el propio código: `val` (el monto de `S.presupuestos[cat]`, usado como `value` de un input) nunca pasaba por `escHtml()` — bajo riesgo real hoy porque siempre es un número, pero con `html\`\`` deja de depender de que siga siendo siempre así. Validado con una simulación jsdom-style comparando la salida contra la versión original con datos idénticos (incluido un nombre de categoría con `<script>` malicioso): HTML visual idéntico, con el `<script>` correctamente escapado en el resultado. `node --check` sin errores.

**Migración gradual, no un rewrite de golpe:** el resto de los módulos (Spotify, Mesada, Encargos, TC, Cuentas, Préstamos, Inicio, Gastos, Plata Comprometida, Configuración, Actividad Reciente, Personas, el resto de Análisis) siguen con `escHtml()` a mano — nada roto, sin la protección automática todavía. Se migran uno por uno en próximas sesiones, mismo patrón ya usado para la migración a `data-action`.

**✅ Confirmado en navegador real (usuario, misma sesión):** sheet de Presupuestos, guardado de límite, barras de progreso y toast del 80% funcionando igual que antes de la migración.

**`<script src>` agregado a `index.html` (misma sesión):** `js/core/html-tag.js` como `<script defer>`, justo después de `core-state.js` y antes de `calc-helpers.js` — misma posición documentada en el header del propio archivo. Verificado con parser HTML real: 27 `<script>`, 0 inline, orden correcto.

### ✅ Corregido (2026-08-17) — toast falso de "Datos actualizados desde otro dispositivo" (dos causas distintas)

*(reportado por el usuario: le aparecía ese toast estando seguro de que no había otro dispositivo. Primera explicación (pestaña olvidada) resultó incompleta — el usuario confirmó que le pasó probando en una sola pestaña, en una sola computadora. Segunda vuelta encontró la causa real de ESE caso.)*

**Causa 1 — sí es real, pero no explica todos los casos:** el autosave cada 60s (`bootstrap.js`) y el snapshot diario de patrimonio (`firebase-sync.js`/`_finishFirstLoad()`) llamaban a `window._fbSaveToCloud()` sin chequear si algo había cambiado de verdad — cada llamada escribía a Firestore y pisaba `updatedAt` con la hora actual, aunque el payload fuera idéntico al ya guardado. Una pestaña olvidada abierta (en otro dispositivo, o una segunda pestaña del mismo) seguía "guardando" así para siempre, y cualquier otra pestaña activa —al recibir ese `updatedAt` más nuevo vía `onSnapshot`— disparaba el toast de "otro dispositivo", sin que hubiera cambiado un solo dato. Corregido con `window._lastSavedPayload` (ver más abajo el detalle sin cambios).

**Causa 2 — la que explica el caso de una sola pestaña, encontrada al confirmar que el usuario no tenía ninguna otra abierta:** `onSnapshot` (con `includeMetadataChanges:true`) dispara DOS veces por cada escritura propia — una optimista (`hasPendingWrites:true`, si filtrada por el guard existente) y otra cuando el servidor confirma (`hasPendingWrites:false` — **esa no la filtraba nada**, caía directo a la rama `remoteTs > localTs + 5000`). `window._lastSavedAt` se actualizaba recién DESPUÉS de que `await setDoc()` resolviera — pero esa resolución y la segunda notificación de `onSnapshot` las dispara el mismo viaje de red, sin garantía de orden entre sí. Si la notificación de `onSnapshot` procesaba primero, `localTs` todavía tenía el valor del guardado anterior, y la confirmación del guardado que la propia pestaña acababa de hacer se leía como "otro dispositivo" — carrera real, no un problema de múltiples pestañas.

**Fix causa 1:** `_fbSaveToCloud()` ahora guarda `window._lastSavedPayload` (el JSON del último guardado real) y compara antes de escribir — si el payload nuevo es idéntico, aborta antes del `setDoc`, sin gastar la escritura ni pisar `updatedAt`. La base de comparación se fija también en `_applyCloudData()` (recalculada con `JSON.stringify(window.S)`, no con el string crudo de la nube, para no generar falsos positivos por orden de claves) — así el primer autosave después de cargar ya compara correctamente.

**Fix causa 2 (la relevante para el caso reportado):** `window._lastSavedAt` (y su copia en `localStorage`) ahora se fijan ANTES de llamar a `setDoc()`, no después de que resuelva — así, llegue en el orden que llegue, la confirmación de `onSnapshot` para esa escritura siempre encuentra `remoteTs === localTs` (nunca "más nuevo"), sin importar la carrera.

Verificado con `node --check` en ambos. No probado en navegador real — de las tres cosas de esta sesión, esta es la que más valdría la pena confirmar con uso real, ya que el bug original solo se manifestaba de forma intermitente.

### ✅ Corregido (2026-08-17) — contención de IndexedDB entre pestañas (`persistentLocalCache` de una sola pestaña)

*(el usuario compartió este error de consola durante una tanda de pruebas de Lighthouse: `Failed to obtain exclusive access to the persistence layer`)*

`firebase-init.js` usaba `persistentLocalCache()` sin `tabManager`, que por defecto solo permite que UNA pestaña a la vez tenga acceso exclusivo al cache de IndexedDB — una segunda pestaña (real: dejar una olvidada abierta en otro dispositivo y volver a entrar en otro) rompe con ese error y esa pestaña cae a memoria, sin cache offline. Coincide con el aviso que el propio Lighthouse venía mostrando en las 5 corridas de esta ronda ("There may be stored data affecting loading performance in this location: IndexedDB"), y probablemente explicaba parte de la variación tan grande en LCP entre corridas.

**Fix:** se agregó `persistentMultipleTabManager()` como `tabManager` de `persistentLocalCache()` — Firestore ahora coordina el cache entre pestañas en vez de pelear por acceso exclusivo. Verificado con `node --check` (como módulo ES, ya que el archivo usa `import` de nivel superior). No probado en navegador real — este cambio en particular vale la pena confirmar con dos pestañas abiertas a propósito antes de darlo por cerrado.

### ✅ Corregido (2026-08-17) — `ensureAll()` (precarga de los 11 grupos lazy) compitiendo dentro de la ventana de TBT

*(hallazgo nuevo, apareció al comparar dos corridas reales de Lighthouse pedidas por el usuario tras la ronda del punto 12)*

Las dos corridas mostraron TBT **peor**, no mejor (1.570ms → 2.100ms), pese a las optimizaciones de `refresh()`/`showScreen()` de la sesión anterior (ver más abajo, "Cerrado — punto 12"). Cruzando "Avoid long main-thread tasks" y "Reduce unused JavaScript" de ambas corridas contra `lazy-loader.js` apareció la causa real: `ensureAll()` (la precarga en segundo plano de los 11 grupos lazy, disparada apenas termina `appDataLoaded`) se estaba ejecutando **adentro** de la ventana que Lighthouse audita como TBT, no después de ella como asumía el diseño original.

Evidencia en los reportes: `cuentas.js` con una tarea de 106ms a los 8,6s de carga (mucho después del primer pintado), y marcado con 76% de su peso (32,5 de 42,9 KiB) como JavaScript sin usar en esa corrida — confirma que el script se descargó y ejecutó sin que el usuario hubiera pedido esa pantalla, solo porque `ensureAll()` lo pidió sin ningún delay.

**Fix:** se reemplazó el disparo inmediato de `ensureAll()` por `requestIdleCallback` (con `timeout:5000` como garantía de que corra igual si el hilo nunca queda idle solo, y fallback a `setTimeout(2000)` para navegadores sin soporte — Safari). Es la semántica correcta para trabajo de fondo que no debe competir con nada: el navegador lo corre cuando el hilo principal está realmente libre, cediendo el paso a cualquier interacción real del usuario. Mismo patrón de timeout de seguridad que ya usa `firebase-init.js` (`window._pinGateTimeout`, `window._authgateReadyTimeout`).

**Nota honesta sobre el resultado esperado:** en la corrida de Lighthouse en sí (una sola pestaña, sin ninguna otra interacción real compitiendo por el hilo principal) es posible que `requestIdleCallback` dispare casi de inmediato de todas formas, porque ahí no hay nada más esperando — así que el número de TBT en Lighthouse podría no bajar mucho. El beneficio real es para un usuario de verdad que esté tocando algo justo en ese momento después de que carguen los datos.

**✅ Confirmado (2026-08-17) con 3 corridas nuevas de Lighthouse, después del fix:** el TBT bajó en las tres — 1.260ms / 820ms / 720ms, contra 1.570ms / 2.100ms antes. Mejor de lo que se esperaba por la nota de arriba: en varias corridas `cuentas.js`/`gastos.js` ya ni aparecen en "Reduce unused JavaScript" (antes `cuentas.js` mostraba 76% sin usar). El LCP sigue muy variable entre corridas (2,9s–7,6s) — no relacionado con este fix, dominado por la cadena de red de Firestore auth/Listen/Write, con una causa adicional encontrada esta misma sesión (ver la entrada de contención de IndexedDB, más abajo) que probablemente explica buena parte de esa variación.

### ✅ Corregido (2026-08-17) — `.innerHTML` sin escapar en `busqueda-global.js`

*(auditoria-tecnica.md #2, penúltimo hallazgo puntual sin resolver de ese punto — ver más abajo la entrada de `toast()`, revertida y corregida distinto)*

**`busqueda-global.js` — término de búsqueda sin escapar.** El mensaje "Sin resultados para..." interpolaba `q` (lo que el usuario escribió en el buscador global) directo en `.innerHTML`, sin pasar por `escHtml()` — el único de los ~15 sitios de este archivo con ese problema, preexistente desde que se extrajo el módulo (2026-07-26). Fix de una línea: `escHtml(q)`. Verificado con `node --check`. No probado en navegador real.

### ⚠️→✅ `toast()` — intento fallido, revertido, y los 3 bugs reales corregidos en su lugar correcto

*(auditoria-tecnica.md #2, último hallazgo puntual de ese punto — historia completa por transparencia, ver también preferences/proceso)*

**Primer intento (2026-08-17, temprano):** se agregó un 4º parámetro `msgEsHtml` a `toast()` (`core-state.js`) para escapar `msg` por defecto, asumiendo que el problema eran unas pocas llamadas con HTML intencional (íconos) sin identificar.

**Por qué se revirtió:** al revisar los ~63 call sites reales de `toast()` en `alcancia.js`/`analisis.js`/`encargos.js`/`mesada.js`/`prestado.js`/`spotify.js`/`tarjetas_credito.js`/`cuentas.js`/`gastos.js`, ninguno pasaba HTML de ícono — pero ~60 de esos 63 ya seguían el patrón establecido en todo el proyecto: escapar el texto libre en el punto de interpolación (`toast('Cuenta "'+escHtml(nombre)+'" creada')`), no en `toast()` mismo. Escapar `msg` completo adentro de `toast()` los habría **doble-escapado** — cualquier mensaje con comillas o "&" literales fuera del `escHtml()` (patrón repetido: `` `Cuenta "${escHtml(nombre)}" creada` `` — comillas literales, nombre escapado) habría mostrado `&quot;`/`&amp;` en pantalla en vez del carácter real. Se revirtió `toast()` a su firma y comportamiento original.

**Los 3 bugs reales** (texto libre interpolado en un mensaje de `toast()` SIN pasar por `escHtml()` en absoluto — no relacionados con íconos):
1. `encargos.js`/`guardarEditarEncargo()` — `toast(nombre + ' actualizado', 'ok')`, `nombre` viene directo de un `<input>`.
2. `prestado.js`/`guardarEditarMiDeuda()` — mismo patrón exacto, mismo mensaje "actualizado".
3. `diferencial.js`/`diffValidarIntercambios()` — `fuenteLabel(b.miCuentaSalida)` sin escapar dentro del mensaje de error de saldo insuficiente (usada tanto por Encargos como por Préstamos vía `_errIntSplit`/`_errInt`). Su función hermana, `_validarMovEncMia()` en `encargos.js`, sí tenía el `escHtml()` — inconsistencia entre dos funciones que hacen básicamente lo mismo.

Los 3 corregidos envolviendo el texto libre en `escHtml()` en el sitio exacto de interpolación, mismo patrón que el resto de la app. Verificado con `node --check` en los 4 archivos tocados (`core-state.js`, `encargos.js`, `prestado.js`, `diferencial.js`). Ninguno probado en navegador real.


### ✅ Corregido — `renderGastosVar()` se ejecutaba dos veces por cada `refresh()`

*(hallazgo nuevo, no estaba en auditoria-tecnica.md — apareció al confirmar `refresh()` contra `gastos.md`)*

`core-state.js`/`refresh()` llamaba a `renderGastosVar()` directo y, más abajo en la misma función, a `renderMesFiltros()` — que según `gastos.md` ("arma los chips de filtro por mes y dispara `renderGastosVar()`") ya dispara `renderGastosVar()` por su cuenta. El historial de gasto variable se reconstruía dos veces seguidas en cada `refresh()` (cascada de carga inicial, cada `save()`, cada 60s de autosave) sin ningún efecto distinto — trabajo tirado, no un bug de datos. Se sacó la llamada directa; sigue corriendo una sola vez, vía `renderMesFiltros()`. Verificado con `node --check` y contra la documentación de `gastos.js`.

### ✅ Cerrado — punto 12 de la auditoría (`refresh()` sin guard): las 5 llamadas restantes ya se gatean a "pantalla activa"

Con `cuentas.js` y `gastos.js` reales se confirmó que `renderCajitas()`, `renderCustomCuentasList()`, `renderGastosVar()` (vía `renderMesFiltros()`), `renderGastosFijos()` y `renderMesFiltros()` son funciones puras de render (leen `S`, escriben `.innerHTML`, sin efecto secundario sobre datos) — quedaba pendiente solo por no tener el hook de re-render al entrar a la pantalla, no por ningún riesgo de las funciones en sí.

Se agregaron los hooks que faltaban en `showScreen()` (`sheet-stack.js`):
- **`if(name==='cuentas')`** ahora también llama a `renderCajitas()` y `renderCustomCuentasList()` (las vistas de lista) además del detalle de cuenta que ya cubría.
- **`if(name==='gastos')`** — rama nueva, no existía. Llama a `renderMesFiltros()` (que ya dispara `renderGastosVar()`) y `renderGastosFijos()`.

Con esos hooks en su lugar, en `core-state.js`/`refresh()` las 4 llamadas restantes (`renderCajitas`, `renderCustomCuentasList`, `renderGastosFijos`, `renderMesFiltros`) se gatearon al mismo criterio "pantalla activa AHORA" que ya usaban `renderDeudoresList`/`renderMesada`/`renderSpotify` — `renderCajitas()` además respeta que no haya ninguna cuenta abierta (para no pisar el detalle). **Con esto se cierran los 5 candidatos originales del punto 12** — no queda ninguna función de render sin guard corriendo sobre pantallas ocultas en cada `refresh()`.

**Pendiente:** correr Lighthouse de nuevo para medir el ahorro real de este último tramo (mismo criterio que las rondas anteriores del punto 12 — promediar varias corridas, el TBT de esta app es muy ruidoso por la latencia de Firebase). No probado en navegador real.


### ✅ Corregido — Dos bugs reales de arranque encontrados al volver lazy `spotify`/`prestado`/`cuentas`/`analisis`/`encargos`

*(ronda de modularización por pantalla — séptimo a undécimo grupo lazy, ver `auditoria-tecnica.md` #4)*

Al auditar los 5 módulos que quedaban para completar la modularización por pantalla, aparecieron dos bugs reales (no solo hallazgos hipotéticos) del mismo tipo ya visto con `tarjetas_credito`/`actividad_reciente`: código que asumía que un evento de arranque (`DOMContentLoaded`) todavía no había disparado.

1. **`spotify.js`** — el monkey-patch de `openSheet()` que inyecta los sheets de Personas al abrir "Agregar"/"Editar" en Spotify estaba envuelto en un listener `DOMContentLoaded`. Con `spotify.js` cargando bajo demanda, ese evento ya pasó para cuando el archivo llega a existir — el listener nunca se habría disparado. Corregido: desenvuelto a nivel superior (seguro, `openSheet` es núcleo y siempre carga eager antes que cualquier módulo lazy).
2. **`sheet-stack.js` (núcleo) — el más serio de los dos:** dos puntos referenciaban globales de `prestado.js`/`spotify.js` sin ningún guard, y corrían en cada llamada a funciones núcleo, no solo al entrar a una pantalla específica:
   - El bloque de reset de Préstamos dentro de `showScreen()` (`deudorActualId`/`miDeudaActualId`/`prestamosTabActiva`) corre en **cada** navegación a cualquier pantalla (`name!=='prestamos'`, no `name==='prestamos'`). Sin guard, habría roto la navegación de toda la app la primera vez que alguien abriera Inicio sin haber visitado antes Préstamos.
   - La captura de `addSpotify` dentro de `_injectErrorSpans()` corre una sola vez, en el arranque. Sin guard, `addSpotify` (identificador no declarado con `spotify.js` todavía sin cargar) tira `ReferenceError` y aborta el resto del bootstrap.

   Ambos corregidos con guard `typeof`. Efecto secundario aceptado: la validación inline extra de Spotify ("El nombre es obligatorio") no aplica hasta la primera visita a esa pantalla — mismo tipo de degradación ya aceptada para el hint de `mostrarAlertaFuente` con `tarjetas_credito`.

Limpieza de paso: un listener `DOMContentLoaded` vacío en `encargos.js` (no hacía nada) se eliminó.

### ✨ Agregado — `spotify`, `prestamos`, `cuentas`, `analisis` y `encargos` pasan a ser grupos lazy

Se agregaron a `Loader.GROUPS` (`js/core/lazy-loader.js`) como séptimo a undécimo grupo, y se sacaron sus `<script src>` eager de `index.html`. Se agregaron las ramas `if(name==='spotify')`/`if(name==='prestamos')` en `showScreen()` (`sheet-stack.js`) para re-renderizar al entrar — `cuentas`/`encargos`/`analisis` ya tenían la suya desde antes de esta ronda. Ninguno necesitó copiar/inyectar HTML nuevo.

### 🚨 Corregido (urgente) — `cuentas` revertido a eager: rompía el arranque en navegador real

Al probar en navegador real la ronda de arriba, `cuentas.js` como grupo lazy reventó el arranque con 3 `ReferenceError` encadenados:

```
firebase-sync.js:54  Uncaught ReferenceError: _renderTasaHistorialTag is not defined
core-state.js:939    Uncaught ReferenceError: nuTotal is not defined
core-state.js:490    Uncaught ReferenceError: getNuTasaGlobal is not defined
```

Las tres son del subsistema de Nu, definido dentro de `cuentas.js`, llamadas sin guard `typeof` desde `core-state.js` (`save()`), `firebase-sync.js` (`_initAppUI()`) y la cadena de `refresh()` (`mejoras.js`→`gastos-fijos-progress.js`→`pin-bio.js`→`inicio.js`). Estos 5 archivos núcleo nunca se auditaron contra el cambio — no se recibieron en la sesión que hizo lazy este grupo, a diferencia de `sheet-stack.js`/`inicio.js`, que sí se revisaron esa misma sesión (ver entrada de arriba).

Fix: `cuentas.js` vuelve a `<script src>` eager en `index.html`, se saca de `Loader.GROUPS`. Corrección menor de paso: `_checkGastoAlto()` en `inicio.js` llamaba `nuTotal()` también sin guard — se le agregó `typeof` como red de seguridad.

**Pendiente para poder reintentar `cuentas` como lazy:** conseguir y auditar `core-state.js`, `firebase-sync.js`, `mejoras.js`, `gastos-fijos-progress.js` y `pin-bio.js`, y guardar cada llamada al subsistema de Nu. `spotify`/`prestamos`/`encargos`/`analisis` no reportaron errores en esta misma prueba y se mantienen lazy, con la reserva de que el mismo tipo de miss podría repetirse si alguno de esos 5 archivos también los llama sin guard.

### ✅ Corregido — `cuentas` reactivado como grupo lazy (mismo día, segundo intento)

Se recibieron y auditaron los 5 archivos núcleo pendientes. Se buscó, uno por uno, cada función que `cuentas.js` expone (no solo las 3 del error original) en los 5 archivos:

- **`core-state.js`:** `calcC`, `calcCDT`, `nuTotal`, `getNuTasaGlobal`, `materializarIntereses`, `renderDetalleCuenta`, `renderCustomCuentasList`, `renderMovsCustom`, `renderCajitas` — las 9 con guard `typeof`, incluidos los helpers `_calcCSafe()`/`_calcCDTSafe()`/`_nuTotalSafe()`/`_getNuTasaGlobalSafe()` con fallback razonable.
- **`firebase-sync.js`:** `_renderTasaHistorialTag`, `registrarTasaNuHistorial`, `calcC`, `materializarIntereses`, `verificarVencimientosCDT` — las 5 con guard `typeof`, en `_initAppUI()`.
- **`pin-bio.js`/`mejoras.js`/`gastos-fijos-progress.js`:** cero referencias a `cuentas.js`.

`cuentas.js` vuelve a `Loader.GROUPS`, se saca su `<script src>` eager de `index.html`. **Con esto, los 11 candidatos originales quedan cerrados** — esta vez confirmado contra el código real de los 5 archivos que faltaban. Falta la prueba en navegador real de este segundo intento.

### ✅ Corregido — `guardarEditarSpotify` podía quedar sin conectar en `encargos.js` (bug de guard `typeof` vs. referencia diferida)

*(2026-08-14, encontrado al auditar `encargos.js` contra `auditoria-tecnica.md` — la corrección original del 2026-08-13 nunca se había documentado)*

El wiring de `btn-guardar-editar-spotify` (sheet "Editar persona en Spotify" — edita nombre/cuota mensual/fecha de ingreso de alguien del plan compartido; **corrección:** no es "editar pago" ni se abre desde Encargos, se abre desde la pantalla de Spotify — el wiring quedó en `encargos.js` por un descuido de la modularización, mezclado entre el resto de botones de Encargos) usaba `if (btn && typeof guardarEditarSpotify === 'function') btn.addEventListener(...)`. Con `encargos` y `spotify` como grupos lazy independientes que pueden cargar en cualquier orden (más con `Loader.ensureAll()` pidiéndolos en paralelo), si `encargos.js` corría su wiring antes de que `spotify.js` terminara de cargar, el `if` daba falso y **el listener nunca se conectaba** — ni siquiera después, cuando `spotify.js` sí llegaba a cargar. El botón quedaba muerto en silencio para el resto de esa carga de página, sin `ReferenceError` ni ningún otro aviso visible.

Fix: se reemplazó el guard por la misma referencia diferida (`() => guardarEditarSpotify()`) que ya usa `crearEncargo` dos líneas arriba en el mismo archivo — el listener siempre se conecta, y recién al click se resuelve la función. Verificado con `node --check`. **Probado en navegador real (2026-08-15):** forzando por consola que `encargos.js` corriera su wiring antes que `spotify.js` cargara (con `Loader.GROUPS.spotify` apuntado a una ruta inexistente hasta después de que el wiring corrió), se confirmó `Loader.isLoaded('spotify') === false` en ese momento; al restaurar la ruta real y cargar Spotify, "Guardar cambios" en el sheet "Editar persona en Spotify" funcionó correctamente — confirma que el fix soluciona el caso real, no solo la sintaxis.

### ✅ Corregido — `buildFuentesOptsHtml()` interpolaba `f.label`/`val` sin escapar

*(2026-08-14, cierra el hallazgo pendiente anotado en `auditoria-tecnica.md` desde el 2026-07-20)*

Función núcleo compartida por toda la app para poblar selectores de cuenta (`<option>`s de Gastos, Encargos, Préstamos, pago de TC, etc.). `f.label` (nombre de cajita/cuenta personalizada, texto libre editable por el usuario) se interpolaba directo en el HTML del `<option>` sin pasar por `escHtml()` — mismo patrón de XSS ya corregido puntualmente en 8 módulos distintos, pero nunca en esta función núcleo por no querer tocar código compartido fuera del alcance de cada sesión.

Fix: `f.label` y `val` (este último por las dudas, va dentro de un atributo con comillas dobles) ahora pasan por `escHtml()` en `core-state.js`, línea ~50. `escHtml()` ya existía en el archivo (línea 168), no hizo falta crearla. Verificado con `node --check`. **Probado en navegador real (2026-08-15):** se creó una cuenta custom con nombre `Ahorro <test> & "comillas"` y se revisaron todos los selectores que usan esta función (Gastos, Encargos, Préstamos, TC) — se ven bien, sin HTML roto.

### ✅ Corregido — `js/core/async-css.js` sin `defer`, bloqueaba el render

*(2026-08-14, cierra el hallazgo pendiente anotado el 2026-07-16/2026-08-14 en `auditoria-tecnica.md`, tabla de advertencias)*

Reportado por Lighthouse: el `<script src="js/core/async-css.js">` corría como script clásico (sin `defer`/`async`), bloqueando el parser un instante en cada carga — irónico, ya que el trabajo del propio archivo es volver no-bloqueante el resto del CSS (Font Awesome, Google Fonts, `styles.css`). No se había tocado antes por no tener el archivo en mano para confirmar que `defer` no rompía el truco `media="print"→"all"`.

Con el archivo en mano, se confirmó que la dependencia real es de **orden en el documento** (los `<link data-async-css>` tienen que estar arriba en el DOM para que el `querySelectorAll` de `async-css.js` los encuentre), no de *timing* de ejecución — agregar `defer` no cambia el orden del DOM, solo cuándo corre el script. Los dos escenarios posibles ya estaban cubiertos por el propio archivo desde antes: si corre antes de que el CSS termine de bajar, el listener `'load'` se engancha a tiempo; si corre después (más probable ahora), el fallback `if (link.sheet) link.media='all'` ya detecta que terminó sin esperar el evento — y `.sheet` no requiere CORS, así que funciona igual con recursos de origen cruzado (cdnjs, fonts.googleapis).

Fix: `defer` agregado al `<script>` en `index.html`; comentarios de esa sección y del propio `async-css.js` actualizados para no seguir diciendo "sin defer/async". Verificado: comentarios HTML balanceados (233/233) y `<head>`/`</head>`/`<body>`/`</body>` balanceados (1/1 cada uno, contando solo fuera de comentarios) en `index.html`; `node --check` sin errores en `async-css.js`. **Probado en navegador real (2026-08-15):** sin FOUC del CSS. Con conexión muy lenta se observó FOUT normal de fuentes web (texto "Cargando Mis Finanzas" y íconos de Font Awesome se redibujan al llegar la fuente) — confirmado que es preexistente y no relacionado con este cambio: `.fb-loading-text` tiene el mismo `font-size` en el CSS crítico y en `styles.css`, y `defer` solo afecta cuándo corre el script, no cuándo bajan las fuentes. Anotado como mejora cosmética opcional en `auditoria-tecnica.md`, priorización #12.

### ✨ Agregado — `maxlength` en ~41 campos de texto libre sin límite (`index.html`)

*(2026-08-17, reportado por el usuario: crear una cuenta personalizada con nombre muy largo dañaba el aspecto visual de selects, tarjetas y encabezados)*

Un barrido de todos los `<input type="text">` de `index.html` mostró que solo 5 campos de descripción (`adDesc`, `adMenuDesc`, `nuMovDesc`, `rdDesc`, `parte-desc`, con `maxlength="80"`) y 2 de categorías (`nueva-cat-var`/`nueva-cat-fijo`, con `maxlength="30"`) tenían límite — el resto (nombres de cuenta personalizada, persona, tarjeta/banco, deuda, grupo de préstamo, Spotify, y todas las notas/descripciones de movimientos) no tenía ninguno. Cualquiera de esos valores termina interpolado en un `<select>`, una tarjeta o un encabezado (`flex:1`), así que un texto muy largo rompía el layout.

Fix aplicado siguiendo el patrón que ya existía en la app: `maxlength="30"` en los 14 campos de **nombre** (`nc_nombre`, `cajita-det-name-input`, `enc_nombre`/`enc_edit_nombre`, `np_nombre`, `nd_nombre`/`md_edit_nombre`, `mov_grupo_nombre`, `sp_n`/`sp_edit_n`, `tc_nombre`/`tc_banco`, `gf_n`, `if_n`), `maxlength="80"` en los 7 campos de **descripción principal/requerida** (`gv_desc`, `movenc_desc`, `traspaso_desc`, `transfenc_desc`, `ctc_desc`, `prtc_desc`, `tcc_desc`) y `maxlength="60"` en los 20 campos de **nota opcional** restantes. Verificado sin atributos `maxlength` duplicados en ningún tag (algunos ya tenían uno más adelante en la línea) y sin cambios en el número de líneas ni de tags `<input>` del archivo (diff limpio, solo el atributo agregado).

**Nota de alcance, discutida con el usuario:** `maxlength` es una protección solo de cliente (UX) — no impide que alguien edite el DOM o llame a Firestore directo desde la consola, ni corrige nombres ya guardados con más caracteres de antes de este fix. Para cerrar ese hueco de verdad haría falta una regla de validación en `firestore.rules` (`request.resource.data.campo.size() <= N`), que es la capa más cercana a "servidor" que existe en esta arquitectura (sin backend propio). **Decisión del usuario: no es necesario por ahora** — la app la usa un grupo familiar pequeño y de confianza, así que se deja documentado acá como opción futura si algún día hace falta. CSS revisado también (`styles.css`): no se tocó, ver razón en la entrada de `auditoria-tecnica.md`.

### ✅ Confirmado — CSP (`'unsafe-inline'` fuera de `script-src`): 0 atributos inline reales en los 21 archivos auditados esta sesión

*(2026-08-18)*

Con los 14 módulos de `js/modules/` más los 7 archivos núcleo (`core-state.js`, `sheet-stack.js`, `calc-helpers.js`, `personas-init.js`, `sheet-swipe.js`, `sheet-viewport.js`, `split.js`, `diferencial.js`, `movimientos.js`, `async-css.js`, `gastos-fijos-progress.js`, `mas-menu.js`) en mano, se buscó `onclick=`/`onchange=`/`oninput=`/`onload=`/`onmouseenter=`/`onmouseleave=`/`onmousedown=`/`onmouseup=` generados dinámicamente en cada uno. Resultado: **cero casos reales** — todos los matches encontrados viven dentro de comentarios que documentan la migración (ej. "antes tenía `onclick=\"...\"` inline"), no en código que se ejecuta. Confirma contra código real (no solo contra notas de sesiones anteriores) que la CSP puede quedar cerrada.

### 🐛 Corregido — dos sitios nuevos de `fuenteLabel()` sin escapar en `.innerHTML`

*(2026-08-18)*

Repitiendo el patrón ya descrito en `auditoria-tecnica.md` punto 2 (texto libre que llega envuelto en una función auxiliar, en vez de aparecer como nombre de campo directo), aparecieron dos sitios nuevos no cubiertos por ninguno de los barridos anteriores — ambos con `fuenteLabel()`, que devuelve sin escapar el nombre de una cajita o cuenta personalizada (texto libre editable por el usuario):

- **`spotify.js` → `renderSpotify()`, badge de "último destino" de cada integrante** (`destinoBadge`): interpolaba `fuenteLabel(x.ultimoDestino)` directo en el `.innerHTML` de la fila. Los 3 casos de Spotify ya cerrados (nombre en fila, nombre en `title`, toasts) no incluían este badge — es un cuarto sitio del mismo módulo. Fix: `escHtml(fuenteLabel(x.ultimoDestino))`.
- **`diferencial.js` → `diffRenderHistorial()`**, usada por `encargos.js` (`_difRenderHistorial(m)`) dentro del `.innerHTML` del historial de un encargo: interpolaba `fuenteLabel(d.miCuenta)` sin escapar en el renglón "Yo → [cuenta]" del resumen de un diferencial ya guardado. Al ser núcleo compartido (`diferencial.js` también lo usa Préstamos, aunque ese módulo no llama a esta función específica todavía), el bug viajaba escondido detrás de una capa más que los casos anteriores. Fix: `escHtml(fuenteLabel(d.miCuenta))`.

Se revisaron también, sin encontrar más casos: los usos de `fuenteLabel()`/`spNombreDe()` dentro de `.textContent` (seguros por diseño — `textContent` no interpreta HTML, a diferencia de `innerHTML`) en `encargos.js` (hints de saldo insuficiente) y `movimientos.js` (mensaje de `dialogo()`, que también usa `.textContent`); y los usos de `fuenteLabel()` dentro de campos `nota`/`desc` guardados en `S.movimientos`/`S.gastosVar` (`encargos.js`, `diferencial.js`) — no son un riesgo directo porque esos campos ya se escapan en el punto de render (`cuentas.js`, `escHtml(m.nota)`), sea cual sea el módulo que los generó. `node --check` sin errores en `spotify.js` y `diferencial.js`.

### 📝 Documentado (fix ya existente en el código, sin registrar hasta ahora) — regresión del ítem "Más" de Alcancía

*(2026-08-18, hallazgo al revisar código vs. `auditoria-tecnica.md`)*

La auditoría tenía anotado como pendiente "la inyección del ítem de menú 'Más' de Alcancía no cubre la primera visita, porque el módulo es lazy y el ítem se inyecta desde adentro de `alcancia.js`". Revisando `index.html` contra `alcancia.js`, el fix **ya existe en el código**: `#mas-alcancia` pasó a vivir como HTML estático en `index.html` (junto a `#mas-config`, mismo `data-screen="alcancia"`), y el handler genérico de `js/core/mas-menu.js` (`querySelectorAll('.mas-item[data-screen]')`) ya lo wirea sin depender de que `alcancia.js` termine de cargar. `_inyectarMasMenuItem()` sigue en `alcancia.js` pero su propio guard (`if(...document.getElementById('mas-alcancia'))return`) hace que retorne siempre sin crear nada — código muerto en la práctica, anotado en el propio archivo con un comentario (no borrado, mismo criterio que `toggleCDT()`/`toggleCajita()` en Cuentas). No se pudo determinar en qué sesión se aplicó este cambio — no hay entrada de `CHANGELOG.md` ni nota de `auditoria-tecnica.md` que lo registre; se cierra el punto de la auditoría con esta entrada.

### 🔍 Confirmado — los 3 duplicados de código del punto 14 de `auditoria-tecnica.md` sí están resueltos

*(2026-08-18)*

Con `core-state.js` y `calc-helpers.js` en mano, se confirmaron los tres cierres que la auditoría daba por hechos pero sin verificación contra código real: **avatar de persona** — `pintarAvatarPersona()` vive centralizada en `core-state.js`, y `encargos.js`/`prestado.js`/`spotify.js` la llaman desde ahí (nada de bloques repetidos). **`_fuenteLabelHtml()`** — solo definida en `js/core/movimientos.js`; `prestado.js` la referencia desde ahí con un comentario que lo deja explícito. **`_ensureMesadas()`** — solo definida en `calc-helpers.js`; `core-state.js` la invoca con guard `typeof` (línea ~516) en vez de reimplementar el guard de inicialización de `S.mesadas`.

### 🐛 Corregido — `fuenteLabel()` sin escapar en 22 `<option>` armados a mano (4 módulos), más nombre de deudor y categoría sin escapar en otros 2

*(2026-08-22)*

Con los 14 módulos de dominio completos por primera vez, un barrido sistemático de `${...}` contra los campos de texto libre ya conocidos (`.nombre`, `.cat`, `.label`) sin `escHtml()` alrededor encontró el hallazgo de mayor alcance real de toda la auditoría — ver `auditoria-tecnica.md`, punto 2, nota del 2026-08-22 para el detalle completo del diagnóstico. Resumen de los fixes:

- **`getFuentes()`/`getFuentesSinTC()` (núcleo) devuelven `{val, label}` con `label = fuenteLabel(cuenta)`** — texto libre real (nombre de cualquier cuenta personalizada). `buildFuentesOptsHtml()` ya escapaba esto desde el 2026-08-14, pero los módulos que arman su propio `<option>` a mano en vez de llamar a ese helper se habían quedado sin la protección. Corregidos los 22 sitios reales envolviendo en `escHtml(f.label)`: **`cuentas.js`** (2: `adMenuDest`, selects de Transferir), **`encargos.js`** (10: selectores de cuenta origen/destino en los distintos sheets de movimiento), **`prestado.js`** (6: selectores de cuenta en Préstamos/Deudores), **`spotify.js`** (4: selector de cuenta de pago). Sin tocar `v.label` de `_extTipos` en `prestado.js` (vocabulario fijo del código, no texto de usuario).
- **`alcancia.js`** — `dCheck.nombre` (nombre de deudor) sin escapar en el `toast()` de la ruta "cobro-deuda" (único caso de excepción entre ~20 `toast()` con `.nombre` en los 14 módulos). Corregido con `escHtml(dCheck.nombre)`.
- **`gastos.js`** — `g.cat`/`x.cat` (categoría personalizada, texto libre de hasta 30 caracteres creable desde Configuración) sin escapar en los badges de gasto variable y fijo. Corregido con `escHtml(g.cat)`/`escHtml(x.cat)`.

`node --check` sin errores en los 6 archivos tocados (`cuentas.js`, `encargos.js`, `prestado.js`, `spotify.js`, `alcancia.js`, `gastos.js`). **Sin verificar en navegador real** — mismo pendiente que el resto de esta sección.

## Encargos

### ✅ Corregido (2026-10-08) — Se podía borrar a mano la salida "Usado para mesada" de un encargo

`deleteMovEncargo` trataba esa salida como cualquier otra: devolvía la plata al encargo, pero el pago de mesada seguía contándola y su cuenta destino (más el espejo) quedaba inflada. Ahora la reconoce con `mesadaOrigenDeMovEncargo(movId)` (`calc-helpers.js`, carga de entrada porque Encargos y Mesada son grupos lazy distintos) y avisa que se borra desde Mesada. Detecta por lo guardado en `S.mesadas`, no por una marca en el movimiento, así que cubre también las salidas anteriores a este cambio. Ver `#mesada`.


### ✅ Corregido (2026-09-30) — "Yo puse la plata" contaba el margen dos veces cuando se usaba junto con el diferencial

**Síntoma:** encargo cobrado por $91.000 (54.000 Efectivo + 37.000 Nequi) que costó $89.405 pagados desde Nu. Con "Yo puse la plata" y el diferencial activos a la vez, de Nu salían $91.000 y además el margen de $1.595 entraba como ingreso aparte: el total quedaba $1.595 por encima de la realidad.

**Causa raíz:** `_validarMovEncMia`, `_movEncMiaPreview` y `_procesarMovEncMia` leían siempre el monto completo del campo (`movenc_monto`), sin saber que el diferencial ya trataba la diferencia como ganancia propia.

**Fix:** nueva `_miaMontoEfectivo()`: si el bloque del diferencial está abierto y `0 < real < monto`, "Yo puse la plata" usa el real. Sin diferencial, o con un real inválido, nada cambia. Se agregaron listeners de `movenc_monto` y `movenc_dif_real` para refrescar el preview. Además se guarda `_miaMonto` en el movimiento y la fila del historial muestra montos por cuenta ("Salió de Nu $89.405 · Entró a Efectivo $54.000 + Nequi $35.405"); antes solo decía los nombres.

**Sin probar en la app:** solo `node --check` y revisión del código. Tras registrar un caso real, confirmar que Nu baje exactamente el real y que el neto entre cuentas sea el margen.

### 🔧 Cambio (2026-09-30) — Una sola fila para la salida dividida (÷) de "Registrar salida"

**Pedido:** cuando el dinero del encargo estaba en dos cuentas, una sola salida generaba dos filas en el historial del encargo (una por cuenta).

**Qué cambió:** los datos **no** cambian (siguen siendo un registro por cuenta: el saldo del encargo se calcula por cuenta). Cambia la vista y el borrado: las porciones con el mismo `_splitGrupo` se pintan como un movimiento (monto total, cuentas con sus montos, saldo antes/después del grupo) y eliminarlo quita todas (`_encSplitKey`, `_encGrupoSplit`, `_encSplitCarrier`; `deleteMovEncargo` se redirige a la porción que lleva los efectos). Las salidas nuevas llevan `_splitGrupo`; las viejas se agrupan solo si el conjunto está completo y no son "Reubicación", abono de deudor ni compra con TC.

**Decisión de diseño que cambia:** antes las porciones eran independientes también al borrar. "Mover entre cuentas" (Reubicación) **no** cambió: sus salidas y su entrada siguen siendo filas independientes.

**Pendiente / no verificado:** la hoja de detalle muestra el total y el bloque de precio, pero no "Yo puse la plata" ni las cuentas del split (no emite `data-mov-otras`). Sin probar en la app; se probó la lógica de agrupado con datos de ejemplo.

### ✅ Corregido (2026-09-30) — El margen y los intercambios del diferencial se podían borrar sueltos desde el feed

**Síntoma:** la fila "Margen de encargo — …" en el detalle de Nequi tenía su botón de eliminar activo. Borrarla dejaba el encargo diciendo que se guardó un margen que ya no estaba en la cuenta.

**Causa raíz:** `diffAplicar()` escribía el margen, el ingreso sin cuenta y los intercambios de beneficiarios sin `_secundario` (los de "Yo puse la plata" sí lo llevaban), así que `eliminarMovimiento()` no los protegía. Comprobado en la consola con `S.movimientos`: los movimientos de margen salían con `_secundario: undefined`.

**Fix:** nueva opción `cfg.origenSeccion` en las instancias del diferencial; si se define, `diffAplicar()` marca esos movimientos con `_secundario: true` y `_origenSeccion`. Es **opt-in**: solo `movenc` y `ctc` la activan (`'Encargos'`), porque `deleteMovEncargo` ya los revierte por `_encMovId`. `prtc` (Préstamo con TC) no la activa; `usarParte` no pasa por `diffAplicar`.

**Alcance:** solo movimientos nuevos. Los ya guardados no llevan la marca; se pueden marcar a mano desde la consola, solo los que tienen dueño (`_encMovId` existente en algún encargo). Los huérfanos se dejan sin marcar. Sin probar en la app: confirmar que, al borrar el margen de un movimiento nuevo, salga el aviso "Movimiento vinculado…".

### 🔧 Cambio (2026-09-29) — "Dividir ÷" en "Yo puse la plata" y en el sobrante del margen (`movenc`, `ctc`, `usarParte`)

**Pedido:** al pagar servicios con plata propia de un encargo que estaba repartido en dos cuentas (Efectivo + Nequi), "Yo puse la plata" solo dejaba elegir **una** cuenta de salida y **una** de recuperación. Y si lo real había costado menos de lo dicho (ej. 98.000 en vez de 100.000), el sobrante solo podía entrar a **una** cuenta.

**Qué cambió:**
- **"Yo puse la plata":** cada lado ("De mi cuenta (sale)" y "Y recupero en (entra)") tiene su propio botón "Dividir ÷", con el motor común de split (`crearSplitWidget('miaSale')` / `('miaEntra')`; mínimo 2 filas, sin repetir cuenta). `_validarMovEncMia()` exige que cada lado sume el monto total (el de recupero puede quedar sin filas = "sin especificar") y que cada cuenta de salida tenga saldo. `_procesarMovEncMia()` genera un movimiento espejo por cuenta, todos con el mismo `_encMovId`, así que `deleteMovEncargo()` los revierte juntos sin cambios. Con más de una cuenta en algún lado el movimiento guarda además `_miaCuentas`; `_miaCuentaSale`/`_miaCuentaEntra` conservan la primera de cada lado.
- **Sobrante del margen:** "¿A cuál cuenta entra el sobrante?" (Registrar salida), "¿En qué cuenta te cayó ese margen?" (Ya la usé) y "¿A cuál cuenta entra el diferencial?" (Compra con TC) tienen "Dividir ÷". Es una opción del motor `js/core/diferencial.js`: `cfg.getMiCuentaSplit()` (devuelve `[{fuente,monto}]` si el split está activo, `null` si no), `cfg.onReset()` (que `diffReset()` llama para limpiar el split al reabrir el sheet) y la nueva `diffValidarMiCuenta(instId)`. `diffAplicar()` acredita una entrada por cuenta y guarda `diferencial.miCuentas` si fueron 2 o más. "Ya la usé" no pasa por `diffAplicar()`, así que `_confirmarUsarParte()` aplica la misma regla a mano (y `_usarParteMargenPendiente` pasó de objeto a array).
- **`js/core/split.js`:** nueva `splitReset(instId)` (devuelve un widget al modo simple, sin filas y con el botón "Dividir ÷" original). Sin otros cambios; `crearSplitWidget`/`splitToggle`/`splitGetData` intactos.
- **Historial:** el margen repartido se muestra como "Yo → Nequi $1.500 + Efectivo $500" (`diffRenderHistorial`) y "Yo (Nequi $1.500 + Efectivo $500)" en la parte usada; los movimientos de "Yo puse" con varias cuentas muestran todas.
- **`index.html`:** markup de los 5 widgets nuevos (2 de "Yo puse", 3 de sobrante), reusando las clases `btn-split` / `btn-add-cuenta`. Acciones nuevas registradas en `encargos.js`: `miaSaleSplitToggle`, `miaSaleAgregarRow`, `miaEntraSplitToggle`, `miaEntraAgregarRow`, `difMiSplitToggle`, `difMiAgregarRow`, `ctcMiSplitToggle`, `ctcMiAgregarRow`, `usarParteMiSplitToggle`, `usarParteMiAgregarRow`.

**Regla de validación del sobrante:** con el split activo, lo repartido debe sumar **exactamente** el sobrante y toda fila con monto necesita cuenta — se bloquea antes de tocar ningún saldo. Con el split apagado nada cambió.

**Verificación:** `node --check` OK en `encargos.js`, `diferencial.js` y `split.js`, y pruebas con jsdom y datos sintéticos: "Yo puse" (sale 40.000 Efectivo + 60.000 Nequi, recupera 70.000 Nequi + 30.000 Efectivo → saldos correctos, 4 espejos, rechazo cuando un lado suma 90.000), sobrante de 2.000 en 2 cuentas en las tres instancias (`movenc`, `usarParte`, `ctc`), rechazo de reparto que no cuadra, y `diffReset()` limpiando el split. **Sin verificar en navegador real.**

---

### ✅ Corregido (2026-09-29) — El resumen "Dijiste / Real / Margen" no se actualizaba al cambiar el monto

**Síntoma:** en "Registrar salida de plata" (y en "Compra con TC"), si se escribía el monto, luego "¿Cuánto era en realidad?" y después se corregía el monto, el resumen seguía mostrando el valor viejo (ej. "Dijiste: $200.000 Real: $198.000 Margen: +$2.000" con el monto ya en $198.000).

**Causa raíz:** `diffResumen()` solo se recalculaba desde el input del valor real y desde las partes; el input de monto (`movenc_monto`, `ctc_monto`) solo disparaba el preview del split / de la compra, y `getDijo()` se lee únicamente al calcular.

**Fix:** dos listeners nuevos en el wiring de `encargos.js`: `movenc_monto` → `_difResumen` y `ctc_monto` → `_ctcDifResumen`. "Ya la usé" no necesitaba fix: su "dijo" es el monto fijo de la parte.

---

### ✅ Corregido (2026-09-29) — Eliminar una salida con margen no devolvía el margen a tus cuentas

**Síntoma:** al borrar de un encargo una salida que tenía margen a favor tuyo (`diferencial` con sobrante acreditado), el movimiento del encargo se eliminaba pero la entrada de margen en tu cuenta (`_esDiferencialEncargo`) y su suma al saldo quedaban. Solo la compra con TC limpiaba esas entradas (por su propio bloque en `deleteMovEncargo()`).

**Fix:** `deleteMovEncargo()` ahora revierte, para movimientos con `diferencial` que no son `_esTcEncargo`, todas las entradas `_esDiferencialEncargo` vinculadas por `_encMovId` (`descontarFuente` + borrado), sean una o varias cuentas. Los intercambios "lo pagué yo" siguen manejándose en su bloque de siempre.

---

### ✅ Corregido (2026-09-29) — "Yo puse la plata" en una salida dividida solo recuperaba la primera porción

**Síntoma:** al registrar una salida dividida entre varias cuentas *del encargo* con "Yo puse la plata" activo, solo se descontaba de tu cuenta y se recuperaba el monto de la primera porción, no el total del gasto.

**Causa raíz:** `confirmarMovEncargo()` en modo split crea un movimiento por porción y llama a `_procesarMovEncMia(mov)` solo con el primero, y esa función usaba `movimiento.monto` (la porción) en vez del monto completo.

**Fix:** `_procesarMovEncMia()` lee el monto total del campo `movenc_monto` (con `movimiento.monto` de respaldo).

---

### ⚠️ Pendiente / limitación conocida (2026-09-29) — El margen de "Ya la usé" no se puede revertir

No existe ninguna acción para deshacer una parte marcada como usada, así que las entradas de margen que crea `_confirmarUsarParte()` (una por cuenta si se repartió con "Dividir ÷") no se revierten en ningún camino. Es previo al split y no se tocó; si se agrega un "deshacer usada" en el futuro, tiene que borrar esas entradas (marcadas `_esExtraIngreso`, sin `_encMovId`, así que habría que vincularlas primero) y restar cada una de su cuenta.

---

### ✅ Corregido (2026-09-28) — El margen de "Ya la usé" no contaba como ingreso

**Síntoma:** al usar una parte de un encargo por menos de lo que se había dicho (ej. dijiste 100.000, el servicio costó 90.000), los 10.000 que te quedas subían en tu cuenta pero no aparecían como ingreso en Análisis, Inicio ni Salud financiera.

**Causa raíz:** `_esEntradaEspejoNoIngreso()` excluía toda entrada cuyo `desc` empezara con `"Margen"`. Esa exclusión entró en el fix del 2026-08 (movimientos espejo / capital de Encargos) sin una razón propia para el margen: el margen no es capital devuelto, es plata que nunca estuvo en tus cuentas.

**Fix:** el ingreso de margen de `usarParte()` lleva ahora `_esExtraIngreso: true` (misma bandera que el extra de Prestado y "Me lo regalaron"). Solo cuenta la parte que te quedas (`yoMeQuedo`); lo asignado a beneficiarios nunca entra a tu cuenta ni a este movimiento.

**Resto de rutas:** el margen de la salida normal de encargo (`movenc`), de la compra con TC (`ctc`) y del "ingreso fantasma" de Préstamo con TC (`prtc`, `_prestadoDirectamente`) lo escribe `diffAplicar()` (`js/core/diferencial.js`) con la marca `_esDiferencialEncargo`. `_esEntradaEspejoNoIngreso()` ahora devuelve `false` para esa marca, así que las tres cuentan como ingreso sin tocar `diferencial.js`. En `prtc` esto restaura la intención original: el comentario de `diffAplicar()` y el filtro de Salud en `inicio.js` (`||m._prestadoDirectamente`) ya esperaban que ese ingreso contara, pero el prefijo `"Margen"` del `desc` lo descartaba. Como la marca ya existía en los movimientos guardados, el cambio también aplica a márgenes viejos del mes actual y el anterior (lo único que Análisis suma).

---

### ✅ Corregido (2026-09-28) — "Me lo regalaron" (traspaso de encargo a cuenta propia) no contaba como ingreso

**Síntoma:** al quedarte con parte de un encargo porque la persona te lo regaló (`confirmarTraspasoEncargo()`), la plata subía en tu cuenta pero Análisis, Inicio y Salud financiera no la veían como ingreso del mes.

**Causa raíz:** el movimiento `entrada` del traspaso lleva `_encMovId` (necesario para poder revertirlo desde `deleteMovEncargo()`), y `_esEntradaEspejoNoIngreso()` descarta todo lo que tenga `_encMovId`. La regla es correcta para depósitos, reubicaciones y "yo puse la plata" (movimientos espejo), pero aquí la plata sí es un regalo nuevo.

**Fix:** las dos escrituras del traspaso (`S.movimientos` para cuentas estándar, `c.movimientos` para cuentas personalizadas) llevan ahora `_esExtraIngreso: true`. Se conserva `_encMovId`, así que la reversión no cambia. Misma bandera que el extra/propina de Prestado (ver `CHANGELOG.md#prestado`).

**Sin tocar a propósito:** ~~el margen/diferencial de "Ya la usé" (`Margen encargo …`) sigue excluido de ingresos~~ — **obsoleto**: ese mismo día se corrigió (ver "El margen de 'Ya la usé' no contaba como ingreso", arriba); en `analisis.js` nunca hubo una exclusión propia, solo el comentario viejo de la línea ~78, ya actualizado (2026-09-29). Los traspasos hechos antes de este cambio no tienen la bandera y siguen sin contar. Análisis solo suma `S.movimientos`, así que un traspaso a cuenta personalizada se refleja en Salud/Inicio pero no en Análisis (limitación previa).

---

### ✅ Corregido — Migrado a `html\`\`` completo (~52 sitios de `.innerHTML`); dos hallazgos reales de paso

*(2026-08-28, primero de los tres módulos que quedaban)*

Convertidos todos los puntos de renderizado de `encargos.js`: `renderEncargosEnCuenta()` (rama Nu y rama genérica), `renderEncargosList()`, `abrirEncargoDetalle()` (desglose por cuenta e historial de movimientos completo), `renderEncargoParts()`, los previews de "yo puse la plata"/"ya la usé", y los ~15 selects de cuenta/TC/encargo-destino repartidos en traspaso, "mover entre cuentas del mismo encargo", transferencia entre encargos y compra con TC. Los fragmentos armados con `.map()` se interpolan directo (sin `.join()` explícito) en el nivel exterior, mismo patrón ya usado en Mesada/Gastos/Personas; `Events.attr(...)` y las funciones núcleo que ya devuelven HTML de confianza (`_difRenderHistorial()`, `_encAttrs()`) se envuelven en `raw()`. Los `toast()`/`dialogo()` y los campos `desc:`/`nota:` que se guardan como dato (no se pintan al momento) se dejaron con `escHtml()` a mano, mismo criterio de siempre.

**Sombra de variable `let html = ''`** tapando la función global `html\`\`` en dos funciones (`abrirEncargoDetalle()` → historial, y `renderEncargoParts()`) — mismo bug ya encontrado en Mesada/Gastos/Plata Comprometida. Renombrada a `contenido` en ambas.

**Hallazgo real de escapado:** en el selector de "mover entre cuentas del mismo encargo" (`origenOptsHtml`, función `_actualizarSelectsMoverEnc` o equivalente), `f.val` y `f.label` se interpolaban **sin ningún escapado**, ni siquiera `escHtml()` manual — a diferencia de los otros ~14 selects del archivo, que sí lo tenían. Cerrado de raíz al migrar a `html\`\``.

**Doble-escapado en `desc:`/`nota:` horneados — resuelto (2026-08-28, sesión posterior):** varios `desc:`/`nota:` de movimientos (ej. "Yo puse la plata: ...", "Parte usada: ...", "Margen encargo ... — ...", el ingreso de margen, la deuda automática por faltante, la compra/cargo con TC de encargo) se armaban con `escHtml()` ya aplicado en el momento de *guardar* el dato, no de pintarlo. Como el historial interpola `m.desc`/`m.nota` sin re-escaparlo a mano (lo hace `html\`\`` automáticamente), un nombre de cuenta/encargo con `&` o comillas quedaba visualmente doble-escapado (`&amp;amp;` en vez de `&amp;`). El mismo patrón vivía también en `prestado.js` (13 sitios) por el cruce de préstamos, así que se corrigieron ambos archivos juntos.

Fix: se quitó el `escHtml()` horneado en los 8 sitios de `encargos.js` (`_procesarIntercambioEncargo()` — salida/entrada de "Yo puse la plata"; `usarParte()` — dos sitios de "Parte usada" y el ingreso de margen; la deuda automática por faltante en préstamo; la compra/cargo con TC de encargo — dos sitios), dejando esos campos crudos: la capa de render (`html\`\``) ya los escapa una sola vez. Los `desc:`/`nota:` que arman `S.tcMovimientos`/`d.movimientos`/`S.movimientos` en `prestado.js` (13 sitios: `confirmarMovimiento()`, `confirmarMovMiDeuda()`, `confirmarPrestamoTC()`, el "extra" repartido a gasto/ingreso) se corrigieron igual. `cuentas.js` no necesitó cambios: ya asumía texto crudo en su capa de render.

Validado con `node --check` en los tres archivos y una simulación con `escHtml`/`html\`\`` reales confirmando que el output pasó de doble-escapado (`&amp;amp;`) a escapado simple (`&amp;`), preservando la neutralización de `<script>`. **Sin simulación jsdom ni prueba en navegador real** en esta sesión.

### ✅ Corregido — 4 selects de cuenta en `encargos.js` interpolaban `f.label`/`f.val`/`f.cuenta` sin escapar

*(2026-08-15, encontrado al investigar un warning de consola reportado por el usuario: "A `<select>` tag was parsed within another `<select>` tag and was ignored", disparado desde `encargos.js:2407` al abrir "Nuevo encargo")*

`buildFuentesOptsHtml()` (`core-state.js`) ya se había corregido para escapar `f.label`/`val` (ver hallazgo de esa fecha, más arriba), pero `encargos.js` tiene **4 lugares separados** que arman el mismo tipo de `<option>` HTML a mano — para los selects `movenc_cuenta` (entrada/salida de un movimiento) y `enc_cuenta_ini` (saldo inicial al crear un encargo) — sin pasar por esa función ni por `escHtml()` en ningún momento. Nombres de cuenta personalizada son texto libre del usuario; con `<`, `>`, `&` sin escapar dentro del `innerHTML` de un `<select>`, el parser del navegador puede comportarse de forma impredecible — consistente con el warning reportado (se sospecha que la cuenta de prueba `Ahorro <test> & "comillas"`, creada para probar el fix anterior, disparó esto, aunque no se pudo confirmar el mecanismo exacto sin poder reproducirlo en un navegador real).

Fix: los 4 lugares (`encargos.js` líneas ~1171, ~1184, ~1187, ~2402/2410) ahora envuelven `f.val`/`f.label`/`f.cuenta` en `escHtml()`, mismo criterio que `buildFuentesOptsHtml()`. Verificado con `node --check` y `diff` línea por línea contra el original para confirmar que no se perdió ningún otro cambio en el camino (se pisaron accidentalmente 2 líneas ajenas al hacer el fix por partes — corregido antes de guardar la versión final). **Falta prueba visual en navegador real**, en particular volver a abrir "Nuevo encargo" con la cuenta `Ahorro <test> & "comillas"` de prueba y confirmar que el warning de consola ya no aparece.

### ✅ Corregido — El avatar de un encargo recién creado no mostraba el color de la persona (dos causas distintas)

*(2026-08-15, reportado por el usuario: "cuando creo un nuevo encargo la persona se crea así como antes... como si no tuviera id"; después confirmó que el primer fix no alcanzaba)*

**Causa 1 (fix inicial, insuficiente por sí solo):** `renderEncargosList()` tenía el color del avatar **hardcodeado** en azul (`rgba(96,176,240,.15)` = exactamente `#60b0f0`), sin leer `enc.personaId`. La vista de detalle sí resolvía la persona real y aplicaba su color — por eso el color correcto solo se veía al entrar al encargo. Fix: se busca la persona con `(S.personas || []).find(x => x.id === enc.personaId)` (mismo patrón que ya usa este archivo en la línea ~67) y se arma el color del avatar desde `persona.color`, con `#60b0f0` como fallback si no hay persona o color.

**Causa 2 (la real, encontrada al revisar por qué el fix de arriba no se notaba):** el sheet "Nuevo encargo" no tiene campo de persona en `index.html` — la selección de persona la inyecta `_inyectarPersonaSheets()` (definida en `personas.js`) y se maneja aparte, en un hook sobre `crearEncargo` (línea ~2937): captura `pId` antes de crear el encargo, pero recién **después** de que `_origCrearEncargo()` ya corrió (y ya había refrescado la lista, en un momento en que el encargo todavía no tenía `personaId`) le asigna `last.personaId = pId` — y ahí se cortaba, sin volver a pintar la lista. Ni el fallback de la Causa 1 ni el wrapper que ya existía más abajo (línea ~2960, que sí aplica `getPersona(enc.personaId).color` correctamente pero solo si `personaId` ya está seteado) llegaban a correr con el dato completo a tiempo. El color correcto recién aparecía la próxima vez que algo más disparara un `renderEncargosList()` (ej. salir y volver a la pantalla) — nunca de entrada, que es justo lo que el usuario reportó.

Fix: se agregó `renderEncargosList()` justo después de `last.personaId = pId; ...; save();` en ese hook, para que la lista se repinte con el dato completo apenas se vincula la persona.

Verificado con `node --check` en ambos cambios. **Falta prueba visual en navegador real** de la secuencia completa: crear un encargo nuevo, elegir una persona con color propio, y confirmar que el avatar en la lista se ve bien de entrada, sin tener que salir y volver a la pantalla.

**Nota aparte, sin investigar:** al reportar esto, el usuario vio en consola un warning de `<select>` anidado (`<select id="enc_cuenta_ini">`) al abrir el sheet de agregar persona, disparado desde `_inyectarPersonaSheets()` en `personas.js` — no se pudo investigar en esta sesión por no tener ese archivo. Hipótesis sin confirmar: esa función se llama cada vez que se abre el sheet "Nuevo encargo" (y lo mismo en `prestado.js`/`spotify.js`), y no hay ningún guard visible en los archivos disponibles que evite reinyectar el HTML si el sheet ya existe en el DOM.

### ✅ Corregido — "Prestar lo que falta" registraba el préstamo aunque la cuenta propia elegida no tuviera esa plata

*(2026-08-13)*

Al agregar la opción "Prestar lo que falta" (salida de un encargo por más de lo disponible: se retira lo que hay y el resto queda como préstamo aparte en "Me deben"), el paso 2 llamaba `descontarFuente(fuentePrestamo, faltante)` directamente, sin validar antes si esa cuenta realmente tenía el monto. `descontarFuente()` no hace esa validación por sí sola — solo resta —, así que el préstamo se registraba igual aunque la cuenta quedara en negativo. Escenario concreto: encargo con $80.000 disponibles, salida pedida de $100.000 (faltan $20.000), se elige Nequi para prestar esos $20.000 aunque Nequi solo tuviera $5.000 reales — el préstamo se guardaba de todas formas.

Fix: se agregó la misma validación que ya usa "Yo puse la plata" (`_validarMovEncMia`) — `getSaldoFuente(fuentePrestamo)` contra el monto a prestar, antes de escribir cualquier dato. Si no alcanza, se avisa con el saldo real disponible y no se registra nada, ni la salida del encargo ni el préstamo (todo o nada, ver `encargos.md` §3). Se agregó además un hint en vivo bajo el selector de cuenta (`_movEncFaltanteCuentaHint`) que avisa antes de intentar confirmar.

### ✅ Corregido — Migrado a `escHtml()` a mano ~18 sitios de `.innerHTML`/`fuenteLabel()`/`iniciales()` sin escapar

*(2026-07-18, durante la migración a `data-action`, antes de que existiera `html\`\`` — creado recién el 2026-08-17)*

Al migrar Encargos como tercer módulo completo (junto con `encargos-personas.js`, separado en dos archivos por la misma dependencia de orden de carga que Spotify) se repitió, por tercera vez, el mismo hallazgo recurrente de otros módulos: texto libre interpolado sin `escHtml()` cuando llega envuelto en una función auxiliar (`fuenteLabel()`, `iniciales()`) en vez de aparecer como nombre de campo directo. Encargos tuvo el conteo más alto de todos los módulos migrados hasta ese momento: **~18 sitios**, repartidos en el desglose por cuenta, el historial de movimientos, los previews de "yo puse la plata"/"ya la usé", el traspaso, "mover cuentas" y la compra con TC — más un sitio de `iniciales()` sin escapar en `renderEncargosList()`. Todos corregidos envolviendo en `escHtml()` en el punto de interpolación. `node --check` sin errores. **Sin verificar en navegador real.** Encargos sigue sin migrar a `html\`\`` (ver `auditoria-tecnica.md`, punto 2) — queda como uno de los tres módulos pendientes de esa migración.

---

## Mesada

### 🔧 Refactor (2026-10-08) — Mesada se ordena en reglas (Parte 1) y pantalla (Parte 2) dentro de `mesada.js`; una sola versión de cada operación

**Antes:** `mesada.js` (1.126 líneas) mezclaba DOM y reglas de negocio, y repetía en tres sitios (pago original, abonos del pendiente y "deshacer abono") la misma secuencia: crear la salida del encargo, sumar a la cuenta + movimiento espejo, y revertirlo. Además tenía dos copias del widget "pagó con plata de un encargo" (prefijos `mp` y `mpp`): `_poblarMpEncargoCuentas`/`_poblarMppEncargoCuentas` y `_sincronizarMpDestinoConEncargo`/`_sincronizarMppDestinoConEncargo` eran idénticas salvo el id del DOM (comprobado con `diff`), y el cálculo de "disponible en el encargo" estaba escrito 4 veces.

**Ahora:**
- Parte 1 de `mesada.js` (reglas, sin DOM): `mesadaRegistrarPago`, `mesadaAbonarPendiente`, `mesadaMarcarPendiente`, `mesadaBorrarPago`, `mesadaDeshacerAbono`, `mesadaResumenAnio` (todo lo que pinta la pantalla, calculado una vez). Las operaciones **validan todo antes de mutar** y devuelven `{ok, motivo}`.
- `mesadaAbonosDe(info)` ve cada mes como `[pago original, ...abonos]` con la misma forma, **sin migrar lo guardado** (no se tocó el modelo de datos ni Firestore). Con eso, revertir es una sola función (`mesadaRevertirAbono`) en vez de tres copias.
- `_mesadaEntrar`/`_mesadaSacar` fusionan "sumar/restar saldo + espejo" (15 sitios) y reemplazan a los wrappers `_registrarMovSecundarioMesada`/`_borrarMovSecundarioMesada`. Se descartó simplemente inlinear los wrappers: habría repetido `flujo:'entrada', origen:'Mesada'` 15 veces sin quitar la duplicación real.
- Parte 2 de `mesada.js` (pantalla, que solo usa la API de la Parte 1): `_crearEncargoPicker(prefijo)` (una instancia por sheet, mismo patrón que `crearSplitWidget`) reemplaza las dos copias del widget; el wiring pasa a tablas (`_msCablear`); `renderMesada()` solo pinta lo que calcula `mesadaResumenAnio()`.
- **Un solo archivo.** Se probó separarlo en `mesada-dominio.js` + `mesada.js` y se descartó: cada grupo lazy de la app es un único archivo y la separación no justificaba una excepción ni una dependencia de orden de carga. `Loader.GROUPS.mesada` queda `['js/modules/mesada.js']`.

**Cómo se verificó:** `tests/mesada-reglas.test.js` (38 tests) y `tests/mesada-ui.test.js` (9 tests) + los 10 existentes de `calcPatrimonioTotal`: 57 en total. Además, antes de reemplazar el archivo se ejecutó el código **viejo** y el nuevo sobre el mismo estado y se comparó `S` completo: 9 escenarios de borrado, 8 de registro (incluido `confirmarMesadaPago` real con un DOM simulado) y 5 de abono: idénticos, salvo los bugs de abajo. Esas pruebas de paridad fueron un script de una sola vez (necesitaban el archivo viejo), no quedaron en el repo. Se comprobó por mutación que las regresiones fallan si se reintroduce cada bug.

**Cambios visibles (a propósito):** los dos previews de "dividido" ahora dicen igual `· Todo distribuido` (antes el flujo sin encargo omitía el `·`); el aviso de "dividido supera el monto" ahora aparece **antes** de tocar el encargo; los textos de `mesada.js` pasan a tuteo (ver `#sheets--ui`, 2026-10-07: `mesada.js` no había sido revisado). `_movSecId: null` ya no se guarda cuando no hay cuenta (nada lo leía fuera de Mesada).

### ✅ Corregido (2026-10-08) — Pago con encargo + dividido que se pasaba del monto dejaba la salida descontada del encargo

`confirmarMesadaPago` agregaba la salida al encargo **antes** de validar `totalSplit > monto`. Si la validación fallaba, el `return` dejaba la salida en `enc.movimientos` sin pago de mesada, y al corregir y confirmar de nuevo se descontaba por segunda vez (cualquier `save()` intermedio lo persistía). Ahora el dominio valida encargo y split antes de crear nada. Test: `REGRESIÓN bug 1`.

### ✅ Corregido (2026-10-08) — Borrar un pago pagado con encargo no devolvía la plata a la cuenta si la salida del encargo ya no existía

La reversión leía el monto a devolver del movimiento del encargo; sin ese movimiento el monto quedaba en 0, no se descontaba nada de la cuenta destino y **sí** se borraba el espejo: saldo inflado y sin rastro. Era alcanzable porque `deleteMovEncargo` no distinguía las salidas creadas por Mesada y se podían borrar a mano desde Encargos (lo que además devolvía la plata al encargo mientras Mesada seguía contándola). Ahora (a) la reversión usa el monto guardado en el abono y (b) Encargos bloquea ese borrado (ver `#encargos`). Misma causa en el bucle de `pendienteHistorial` y en `deshacerPendienteMesada`. Test: `REGRESIÓN bug 2`.

### ✅ Corregido (2026-10-08) — Nombre del encargo sin escapar en dos `toast()`

"Ahí solo hay $X guardados de «nombre»" (`confirmarMesadaPago` y `confirmarPendienteMesada`) concatenaba `enc.nombre` (texto libre, sincronizado a toda la familia por Firebase) en un `toast()` que inserta con `innerHTML`. Ahora pasa por `escHtml()` en `_mesadaMostrarError`. Test: `REGRESIÓN bug 3`.

### ✅ Corregido (2026-10-08) — Protección por antigüedad: cuentas de los abonos y etiqueta vacía

`_mesadaFuentesDe` solo miraba el pago original, no las cuentas de los abonos del pendiente. Si el original fue "no especificar" y un abono fue a Nequi, `_mesadaTieneCuentaAfectada` daba `true` pero `fuentes` quedaba vacío, y el aviso de nivel "viejo" llamaba `fuenteLabel(undefined)`. Ahora `mesadaFuentesDe` incluye todos los abonos y, si solo hay encargos, la etiqueta es "Encargos". **No se cambió** a propósito qué fecha se usa para medir la antigüedad (la del pago original).

### 🔧 Cambio (2026-10-08) — El match de encargos por nombre ahora es por palabra completa (se probó un vínculo con persona y se quitó)

`mesadaEncargosDelParent` buscaba con `includes` sobre el nombre del encargo: "papayera" coincidía con papá. Ahora compara por **palabra completa o su plural** (papá, papi, papito, padre; mamá, mami, mamita, madre; sin tildes ni mayúsculas). Limitaciones que quedan: "Papas" (comida) sigue coincidiendo con "Papás", y un encargo con otro nombre ("Carlos") no aparece; la solución es renombrar el encargo. El modo por nombre ya estaba documentado como decisión de diseño (`mesada.md` §8), así que no se trató como bug.

**Probado y descartado:** un vínculo opcional `S.mesadas[parent].personaId` (enlace "Vincular a una persona" en cada tarjeta) para ofrecer los encargos de esa persona sin depender del nombre. Se quitó antes de desplegar por no hacer falta (el costo es una pantalla más y un dato más que mantener). Si algún día hace falta, la lógica era: con vínculo, `e.personaId === personaId`; sin vínculo, por nombre; y un vínculo a una persona eliminada se ignora.

### 🔧 Cambio (2026-10-08) — Los previews de los sheets de Mesada no ocupan lugar cuando están vacíos

`#mpPreview` y `#mppPreview` (clase `.ms-preview`) reservaban `min-height:18px` + margen aunque no tuvieran texto, dejando un hueco en el sheet. Ahora `.ms-preview:empty{display:none}`: el JS los vacía con `textContent = ''`, y al escribir un mensaje reaparecen. Efecto secundario: al aparecer el primer mensaje el contenido de abajo baja unos píxeles (antes el espacio estaba reservado).

### 🔧 Cambio (2026-10-08) — Estilos inline de Mesada pasan a clases (`.ms-*` en `styles.css`) y se renombra `mesadaMonteMama`

La pantalla principal (las tarjetas de papá y mamá repetían el mismo bloque de estilos), los dos sheets (`index.html`) y la template de `abrirDetalleMesada()` repetían estilos inline (el bloque de encargo estaba duplicado entero). Ahora son clases `.ms-*` con los mismos valores; en `index.html` solo quedan los `style="display:none;"` iniciales, que el JS alterna con `style.display`; el botón ámbar de "marcar pendiente" quedó en `.12` de opacidad (antes `.10` en un lugar y `.12` en otro). El id `mesadaMonteMama` (typo) pasa a `mesadaMontoMama` en `index.html`, `core-state.js` y `mesada.js`. Se eliminó `_mostrarSeccionDestinoNormal(mostrar)`/`_mostrarMppDestinoNormal(mostrar)`: solo se llamaban con `true` y su selector `#sheet-mesada-pago .field-header` dependía del orden del DOM. También se eliminó `mpMesNombre` (variable sin uso) y se reemplazó el reseteo manual del widget de dividir por `splitReset('mp')`.

### 🔧 Cambio (2026-09-21) — Documentación de "pagar con plata de un encargo" y limpieza de comentarios

`mesada.md` no documentaba el flujo "Me pagó con plata de un encargo" (sheets `mpUsarEncargo`/`mppUsarEncargo`, campo `origenEncargo`), presente en `mesada.js` desde antes: se agregó a §2, §3, §4 (modelo de datos), §5 (flujos) y §6 (casos especiales). También se documentó la protección por antigüedad al borrar un pago (ya implementada, sin mencionar). Se quitaron fechas y referencias a la migración a módulos separados que ya no aportan (el archivo en sí ya dice dónde vive el código). `mesada.js`: limpieza de comentarios (sin cambios de código) que fechaban decisiones ya asentadas.

### ✅ Corregido — La cuota heredada se "congelaba" con cualquier `save()` de la app

Los inputs de cuota siempre muestran el valor que calcula `_getCuotaAnio` — que puede ser un fallback heredado de un año anterior, no necesariamente una cuota explícita de este año. El problema: `save()` (que corre en *cualquier* acción de la app — agregar un gasto, marcar un pago de Nu, editar Spotify, lo que sea) leía ese input y lo grababa como valor explícito sin verificar si realmente era distinto del heredado.

Escenario concreto: cuota de papá = 80.000 registrada solo para 2025. Al abrir la app en 2026, el input ya viene precargado con 80.000 (el fallback). Con solo registrar un gasto de mercado — sin tocar Mesada para nada — ese `save()` grababa 80.000 como cuota explícita de 2026. Meses después, si subías la cuota de 2025 a 90.000 esperando que 2026 la heredara automáticamente, ya no lo hacía — había quedado congelada desde ese primer `save()` accidental.

Fix: en `save()`, solo persistir si el valor en pantalla difiere del heredado — o sea, solo cuando el usuario realmente lo cambió.

### ✅ Corregido — `cambiarAnio()` podía corromper la cuota de otro año

`cambiarAnio(d)` cambiaba `S.mesadaAnio` **antes** de llamar `save()`. Dentro de `save()`, `_anioActivo` leía el año ya nuevo, pero los inputs del DOM todavía mostraban la cuota del año viejo — porque `renderMesada()` (quien los sincroniza) recién se llamaba después. Resultado: al navegar de año, el valor viejo en pantalla se escribía encima de la cuota ya guardada del año nuevo, pisándola en silencio.

Fix: invertir el orden, para que `save()` persista los inputs *mientras todavía representan el año que se está dejando*.

### ✅ Corregido — Las tarjetas de crédito aparecían como destino válido de mesada

Los tres selectores de destino de mesada (registrar pago en modo simple y dividido, resolver pendiente) usaban el mismo listado de cuentas que el módulo de gastos, donde sí tiene sentido pagar con TC porque genera deuda. Pero mesada es plata que **entra**, y no existe forma de "meter" dinero en una tarjeta de crédito. Se corrigió agregando un parámetro para excluir tarjetas de crédito del listado en los tres puntos de destino de mesada.

### ✅ Corregido — El mes en curso de mamá se marcaba "vencido" ~29 días antes de tiempo

El cálculo de "mes vencido" comparaba mal el plazo de mamá dentro del mismo mes, marcándola como "sin pagar" en rojo desde el día 2, aunque en realidad todavía estaba en plazo casi todo el mes (su plazo real vence el día 1 del mes *siguiente*).

Fix: dentro del mes en curso, solo papá puede quedar "pasado" (después del día 30). El vencimiento real de mamá ya queda cubierto automáticamente apenas se entra al mes siguiente sin pago registrado.

### ✅ Corregido — Mesada no dejaba rastro en las cuentas destino (sin movimiento espejo)

Mesada solo actualizaba el saldo de la cuenta destino, pero nunca generaba el movimiento visible con candado ("Automático") que sí generan Prestado, Encargos y Spotify. Resultado: si mirabas el historial de una cuenta, no había forma de ver que esa plata había venido de mesada — el saldo subía "de la nada".

Fix: se agregaron las funciones de movimiento espejo (`_registrarMovSecundarioMesada` / `_borrarMovSecundarioMesada`) y se conectaron en los tres puntos donde mesada mete plata en una cuenta y en los dos puntos donde se revierte.

### 🗑️ Eliminado por diseño — Toggle "Es saldo inicial"

Mesada tuvo en algún momento un toggle "Es saldo inicial", copiado del mismo patrón que usan Nequi, cajitas y cuentas personalizadas para configurar un saldo inicial de cuenta. Ahí tiene sentido porque es la foto de un momento — pero mesada es un registro de eventos mensuales, no un saldo acumulado, y cada pago ya está aislado por año dentro de su propia clave. No había ningún caso real donde tuviera sentido excluir un mes de las estadísticas de ese año — el aislamiento entre años ya lo resolvía la clave, no el flag.

Se descubrió además que el toggle nunca llegó a estar cableado en el sheet de registro (no existía ningún checkbox que lo activara) — todo el código que lo leía corría siempre por la rama `false`. Se quitó todo por completo (checkbox, función, rama de guardado, badge, exclusiones en estadísticas, CSS). También se corrió una migración una única vez (ya retirada del código) que convirtió los meses existentes marcados así a registros normales.

### ✅ Corregido — 3 sitios de `fuenteLabel()` sin escapar en `.innerHTML`

*(2026-07-17, durante la migración a `data-action`, antes de `html\`\``)*

Al migrar Mesada como segundo módulo completo se repitió el mismo patrón ya visto con Spotify: `fuenteLabel()` devuelve el nombre de una cajita/cuenta personalizada (texto libre) sin escapar. Corregidos 3 sitios en `abrirDetalleMesada()` con `escHtml()`. También aparecieron 2 controles estáticos con `onclick`/`onchange` inline que no vivían en las plantillas del módulo (quedaban fuera del barrido automático por nombre de función) — mismo hallazgo de infraestructura que se repitió después en TC y Cuentas.

### ✅ Corregido — Migrado a `html\`\``: 11 sitios convertidos, sombra de variable y doble escapado corregidos

*(2026-08-25, primero de los diez módulos que quedaban pendientes de esta migración)*

Los 11 `escHtml()` del archivo (dos pares de selectores de cuenta del encargo en `_poblarMpEncargoCuentas()`/`_poblarMppEncargoCuentas()`, dos selectores de encargo en `abrirRegistrarMesada()`/`abrirResolverPendiente()`, y seis sitios en `abrirDetalleMesada()`: nombre del encargo origen, `fuenteLabel()` del destino, `fuenteLabel()` de cada split, el historial de pendientes con nombre/fuente/nota, y la nota del pago) migrados a `html\`\``.

Dos hallazgos reales, no solo de estilo:

1. **Sombra de variable:** `abrirDetalleMesada()` tenía `let html=...` para el string final antes de asignarlo a `innerHTML` — tapaba la función global `html\`\`` dentro de esa misma función (con `let`, además, hubiera roto en tiempo de ejecución por temporal dead zone si se llamaba `html\`\`` antes de esa línea). Renombrada a `contenido`.
2. **Doble escapado** en los dos bloques con fragmentos anidados (`info.splits.map(...)` y `info.pendienteHistorial.map(...)`, cada uno con `.join('')`): al interpolar el resultado de `.join('')` directo en el `html\`\`` exterior sin `raw()`, el HTML ya escapado de cada fragmento interno se volvía a escapar. Distinto del patrón de `inicio.js`/`analisis.js` (arrays de fragmentos sin `.join('')`, que el propio `html\`\`` exterior sabe concatenar sin re-escapar) — acá, al forzar la conversión a string a mano con `.join('')`, hace falta envolver ese resultado en `raw()` explícito antes de interpolarlo. Lo agarró una simulación jsdom con payloads maliciosos en los 6 campos de texto libre, no una revisión visual del código.

`fuenteBadgeClass(...)` (nombre de clase CSS fijo, no texto de usuario) se envolvió en `raw()` en los atributos `class`, mismo criterio que un valor CSS fijo tipo `var(--red)`. Validado con `node --check` y jsdom (2 casos: pago con encargo/destino simple, y pago con splits — ambos con `<script>`, `<img onerror>` y comillas dobles en los campos libres): todo queda escapado una sola vez, sin ejecutar nada, con los `data-action` de los botones intactos vía `raw(Events.attr(...))`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-01) — Protección por antigüedad se activaba en pagos "Sin especificar" que no movían ningún saldo

Reportado por el usuario: al borrar un pago de mesada con destino "Sin especificar", aparecía el aviso de "Movimiento antiguo" mencionando que se afectaría el saldo de "Sin especificar" — cuando ese destino, por definición, no está ligado a ninguna cuenta real.

Causa: `_mesadaFuentesDe(info)` ya devolvía `[]` cuando no había `destino` (dejando `opsPosteriores` en 0 correctamente vía `_mesadaOpsPosteriores`), pero `eliminarMesadaPago()` calculaba el nivel de antigüedad igual, sin verificar antes si había algo que proteger. Como `nivelAntiguedadMovimiento()` decide por fecha **o** por operaciones posteriores (basta uno), un pago viejo por fecha caía en "viejo"/"bloqueado" aunque `_borrarMesadaPago()` no fuera a tocar ningún saldo real — contradice directamente la sección 6 del doc de protección ("no se advierte nada sobre movimientos que no muevan dinero").

Fix: nueva `_mesadaTieneCuentaAfectada(info)` que verifica si hay algo real que revertir (`destino`, `splits`, `origenEncargo`, o algún abono del `pendienteHistorial` con su propio destino/origenEncargo) — la protección solo se evalúa si esto da `true`. Aplicado en los dos puntos de entrada que tenían la lógica duplicada: `eliminarMesadaPago()` (`mesada.js`) y la rama `movTipoEl === 'mesada'` de `eliminarMovimiento()` (`movimientos.js`).

**Mismo bug encontrado en Préstamos (`prestado.js`), en 3 sitios** — mismo patrón: "Sin especificar" (abonos) y "Ganancia" (préstamos, que explícitamente no mueve plata) dejaban `opsPosteriores=0` pero el criterio de fecha igual disparaba el aviso sin que nada fuera a revertirse.

- `eliminarMovDeudor()` (préstamos dados y abonos recibidos) y su duplicado en `movimientos.js` (rama `'prestamo'`/`'abono'`): nueva `_deudorTieneCuentaAfectada(m)`, más completa que un simple chequeo de `destino`/`fuente` porque un abono/préstamo también puede afectar algo real vía Alcancía (`_viaAlcancia`), TC (`_viaTC`) o un encargo (`_viaEncargo`) sin que `destino`/`fuente` estén seteados — y porque `'ganancia'` como fuente de un préstamo es una cadena truthy pero explícitamente no representa una cuenta real, así que se excluye a propósito.
- `eliminarMovMiDeuda()` ("Yo debo"): nueva `_miDeudaTieneCuentaAfectada(m)`, más simple (un `recibido` sin `destino` o un `pago` sin `fuente` no mueven nada).

**Encargos (`encargos.js`) se revisó y no tenía este bug** — ahí, a diferencia de Mesada/Préstamos, borrar un movimiento *siempre* cambia el balance del encargo mismo (`enc.movimientos.filter(...)`), sin importar si tiene o no una `cuenta` externa asociada. El encargo actúa como su propia "cuenta", así que sí hay algo real que proteger aunque `mov.cuenta` esté vacío — y el diálogo ya está redactado en consecuencia (menciona "este encargo" en vez de inventar un nombre de cuenta cuando `mov.cuenta` no existe).

Validado con `node --check` en los tres archivos tocados (`mesada.js`, `movimientos.js`, `prestado.js`).

### ✅ Corregido (2026-08-30) — Pago de mesada con destino real aparecía DOS VECES en el historial de la cuenta (`cuentas.js`)

Reportado por el usuario con un caso real: registró la mesada de mamá en Nequi y vio el pago repetido — uno con candado y "Automático" (el correcto), y otro sin ningún ícono, con la descripción genérica "Mesada de Mamá" (sin acento en el archivo fuente).

Causa: `getMovimientosCuenta()` en `cuentas.js` tenía un bloque adicional ("Mesadas recibidas en esta cuenta") que leía `S.mesadas` directamente y sintetizaba su propio movimiento por cada pago con `destino`/`splits` reales — **en paralelo** al movimiento espejo real que `mesada.js` ya genera y guarda en `S.movimientos` vía `_registrarMovSecundarioMesada()` (con `_secundario:true` y su propio `id`, que el loop principal de esa misma función ya recorre). El comentario que acompañaba al bloque explicaba por qué tenía un guard contra `ReferenceError`, pero no por qué el bloque seguía existiendo — todo indica que es código previo a que mesada.js tuviera su propio sistema de movimiento espejo (ver más arriba, "Mesada no dejaba rastro en las cuentas destino"), que nunca se retiró cuando ese sistema se agregó.

Afectaba a **todo** pago de mesada con cuenta destino real (no a "No especificar / lo gasté", que no genera ningún movimiento en ninguno de los dos códigos). No duplicaba el saldo real de la cuenta (eso se actualiza en un solo punto en `mesada.js`), solo la lista de movimientos mostrada — pero cualquier cálculo que dependa de esa lista (por ejemplo, la reconstrucción de "Antes/Después" al abrir el detalle de un movimiento) quedaba corrompido por el doble conteo.

Fix: se eliminó el bloque completo. Validado con `node --check`.

### ✅ Corregido (2026-09-04) — El fix de "la cuota heredada se congelaba" tenía un hueco: no verificaba si la pantalla Mesada estaba abierta

Reportado por el usuario: exportando el backup, la cuota de papá para 2026 aparecía como `9.3` en vez de un monto real — un valor que coincide con la tasa EA de Nu (`nuTasaGlobal`), no con nada que tenga sentido como cuota mensual.

El fix de más arriba ("La cuota heredada se congelaba con cualquier `save()` de la app") resolvió el caso de que el valor coincidiera con el heredado, pero dejó un hueco distinto: `mesadaMontoPapa`/`mesadaMonteMama` son inputs **estáticos**, presentes en el DOM aunque la pantalla Mesada no esté abierta. `save()` los seguía leyendo y comparando contra `_getCuotaAnio` sin importar qué pantalla estuviera activa — así que si por lo que sea (autocompletado del navegador, tecleo accidental, o cualquier otro origen no confirmado) esos inputs llegaban a tener un valor distinto al heredado en algún momento, el próximo `save()` disparado desde **cualquier parte de la app** —ni siquiera relacionado con Mesada— lo grababa como cuota explícita de ese año. `refresh()` ya tenía el guard correcto (`screen-mesada.classList.contains('active')`) antes de llamar `renderMesada()`; `save()` nunca lo replicó para estos dos inputs.

No se pudo confirmar contra el código el origen exacto del valor `9.3` en el caso reportado (ninguno de los archivos revisados —`money-input.js`, `calc-helpers.js`, `core-state.js`— escribe el valor de `nuTasaGlobal` en los inputs de mesada) — el fix cierra el mecanismo que lo hace *permanente*, no necesariamente lo que lo originó.

Fix: agregado el mismo guard de pantalla activa que ya usa `refresh()`, como condición extra en el `if` de `save()` que ya comparaba contra `_getCuotaAnio`. Validado con `node --check`.

---

## Spotify

### ✨ Nuevo (2026-10-06) — "Te dio un extra": pagar de más ya no se rechaza, se registra aparte

**Pedido:** a veces el período cuesta $5.100 y te dan $5.500. Antes, `confirmarSpDestino()` rechazaba cualquier monto mayor a lo esperado ("aumentá los períodos si pagó de más"), así que ese extra no tenía dónde vivir.

**Qué hace ahora:** si "¿Cuánto te dio?" supera períodos × cuota, el sheet muestra un bloque azul "Te dio un extra de +$400" con su propio selector "¿A dónde fue el extra?" (misma cuenta del cobro, otra cuenta o "Sin especificar"; en modo dividido hay que elegir una, no existe "la misma"). El cobro de Spotify guarda **solo la cuota** (`monto = períodos × cuota`), así que "Recaudado", "Total cobrado", ganancia y promedio por ciclo **no se inflan**. El extra va aparte:
- Se suma a la cuenta elegida (`sumarFuente`) y deja un movimiento espejo en su historial vía `registrarMovEspejo()` (`_esExtraIngreso: true`, `_secundario`, `_origenSeccion: 'Spotify'`) — cuenta como **ingreso real independiente** en Análisis, Salud financiera y Wrapped, y no se puede borrar desde la cuenta.
- Queda en el registro del cobro: `extra`, `extraFuente`, `extraMovId`. Si hubo "pago atrasado" (dos registros), cuelga del último, porque el extra no pertenece a ningún período.
- Borrar el cobro revierte el extra (`descontarFuente` exacto + `borrarMovEspejo`); el diálogo de borrado lo menciona.
- El historial de Spotify muestra una línea "+ $400 extra · Nequi · aparte del cobro de Spotify" y las estadísticas una tarjeta "Extras recibidos" (solo aparece si alguna vez hubo uno).
- Validado todo antes de tocar saldos (el destino del extra es obligatorio), para no repetir el bug de "aplicado a medias" de Prestado (2026-10-02).

**Límites conocidos:** con destino "Sin especificar" el extra queda anotado en el cobro pero no entra a ninguna cuenta ni cuenta como ingreso (no hay plata que mover). Un extra guardado en una cajita aparece en el historial de la cajita pero, como cualquier espejo de cajita, no entra a `entradasIngresoReal()` (comportamiento previo del núcleo).

### ✨ Cambio (2026-10-06) — Estadísticas: "En mano" y "Beneficio total" lado a lado

Antes la app mostraba una sola lectura: `cobrado − pagado + tu parte`. Ahora muestra las dos, porque responden preguntas distintas:
- **En mano** = `cobrado − pagado`: plata nueva y libre para gastar hoy.
- **Beneficio total** = `cobrado − pagado + tu parte`: lo anterior más el mes de Spotify que te salió gratis (el dinero que no tuviste que sacar de tu bolsillo).

"Promedio real por ciclo pagado" muestra ambos promedios en dos columnas; "Ganancia acumulada" mantiene el beneficio total como cifra grande y agrega la línea "en mano: …". Si el costo del plan no está configurado (no hay cuota del admin), las dos serían idénticas y se muestra una sola.

**Último / mejor / peor sin repetir:** con 1 ciclo dice "único ciclo pagado todavía"; si todos los ciclos dieron lo mismo, "todos los ciclos: +$20.483 · sin variación"; en cuanto hay diferencia vuelve el detalle "último · mejor · peor". De paso se corrigió que "mejor:" siempre llevaba un `+` fijo aunque el valor fuera negativo.

**Verificación:** `node --check spotify.js` limpio y 18 comprobaciones en jsdom (extra a la misma cuenta, a otra, con split, sin destino → bloquea sin escribir, borrar revierte saldos y espejo, cuota exacta y pago de menos sin bloque extra, y los tres formatos del pie de ciclos). **No probado en navegador real.**

### 🔧 Cambio (2026-09-20) — Limpieza de documentación y comentarios obsoletos de Spotify

- **`spotify.js` (solo comentarios, sin cambios de código):** se quitaron las referencias a `spotify-personas.js` (archivo que ya no existe) y el bloque "ORDEN DE CARGA" del encabezado (el módulo carga lazy, ya no tiene `<script>` propio). Las 5 referencias a una sección de `auditoria-tecnica.md` sobre atribución de ciclo que nunca existió ahora apuntan a `spotify.md` §7ter.
- **`spotify.md`:** el modelo de datos ahora incluye todos los campos reales (`splits`, `_pagoIdCierre`, `_periodoOffset`, `_pendienteAlCerrar`, `_tcMovId`); los flujos de cobro y de pago a Spotify reflejan fecha editable, split y tarjeta de crédito; nueva §7ter (fecha real, deuda al cerrar y pago atrasado, que antes solo estaba explicado en comentarios del código); se corrigió la fórmula de "Pendiente por cobrar" y las rutas de `spNombreDe`/`spPersonaPagadaVigente` (viven en `js/core/calc-helpers.js`). Se quitó la historia que ya vive en este CHANGELOG (división original en dos archivos, versión original con un registro por período).
- **`mis-finanzas.md`:** se quitaron las filas de archivos ya retirados (`nav.js`, `import-validado.js`) y las notas de fusión; se agregó `wrapped-gate.js` y `css/fa-subset.css`, que estaban en `index.html` y no en el documento; se restauró el encabezado "Principios que se repiten en toda la app", que se había perdido; se reemplazó la duda sobre lógica inline suelta por lo verificado (`index.html` no tiene ningún bloque `<script>` inline).

### ✅ Corregido (2026-09-20) — Un cobro de varios períodos inflaba "Recaudado este ciclo" con períodos que todavía no pertenecen a ese ciclo

Reportado con un caso real: Esteban debía su período el 21-sep y el 20-sep pagó 2 períodos ($10.200). "Recaudado este ciclo" subió a $15.300 (50 %) cuando debió ser $10.200: los $5.100 de AM: Esteban ya recaudados más $5.100 del período que Esteban paga hoy. El segundo período de Esteban (empieza el 21-oct) no es de este ciclo.

**Causa raíz:** un cobro de N períodos es un solo registro (`periodos: N`) y `spCicloCobrosActual()` sumaba su monto completo si estaba después del último pago a Spotify. Ciclo (entre dos pagos a Spotify) y período (30 días de cada integrante) son calendarios distintos y el registro no distinguía a cuál pertenecía cada período. El efecto era peor con el tiempo: si Spotify se pagaba antes del 21-oct, esos $5.100 quedaban contados en el ciclo que se cerró, y "Promedio real por ciclo" y "Ganancia acumulada" arrastraban la distorsión.

**Fix (`spotify.js`):** los períodos se atribuyen a ciclos por fecha de inicio (`proximoPagoAntes + 30·k`), sin guardar nada nuevo en `S`. El primero cuenta en el ciclo donde entró el cobro; los siguientes, en el ciclo abierto el día que empiezan. Mientras no llegue esa fecha y no se pague Spotify quedan flotantes: no suman a "Recaudado", "Balance del ciclo" ni "Ganancia acumulada", y la pantalla los muestra aparte como adelantado. Ver `spotify.md` §7bis.
- Nuevas: `spTramosDeCobro`, `spAsignarPeriodos`, `spResumenCicloActual`, `spMontoAntesDe`; `spPeriodosVencidos` recibe un parámetro `estricto`.
- `renderSpotify()` usa `spResumenCicloActual()`; `renderSpStats()` arma el cobrado de cada ciclo con `spAsignarPeriodos()` (mismo resultado que antes cuando no hay períodos prepagados).
- `confirmarSpDestino()`: el registro "resto" que sigue a un "Pago atrasado del ciclo anterior" guarda `_periodoOffset` (períodos que ya cubrió el registro de cierre), para no repartir su monto entre períodos que no le corresponden.

**Cambio de comportamiento — desempate del mismo día:** cuando un cobro registrado el mismo día que se paga Spotify pertenecía a alguien que ya tenía cubierta 1 cuota en el ciclo que se cierra, `confirmarPagarSpotify()` lo mandaba al ciclo nuevo. Ahora manda al nuevo solo si ya tenía 2 o más (`SP_EMPATE_PERIODOS`), igual que para períodos prepagados. Para volver al comportamiento anterior basta poner la constante en 1. Con 2 o más períodos ya cubiertos, el período que empieza justo el día del pago tampoco se registra como deuda del ciclo que cierra (`_pendienteAlCerrar`).

**Validación:** `node --check`; arnés Node que carga el `spotify.js` real con los datos del backup del 2026-09-20 y llama a `confirmarSpDestino()` y `confirmarPagarSpotify()` de verdad (no jsdom ni navegador). Reproduce el bug con el código anterior ($15.300 / 50 %) y con el nuevo da $10.200 / 33 % + $5.100 adelantado. También cubre: llega el 21-oct sin pagar Spotify ($15.300), se paga Spotify antes (el período pasa al ciclo nuevo y borrar ese pago lo devuelve), empate con 1 período (ciclo que cierra) y con 2 (ciclo nuevo), deuda del ciclo viejo + prepago, y regresión: con el backup tal cual, pantalla y estadísticas son idénticas a las del código anterior.

**Sin verificar:** otros archivos que puedan leer `S.spotifyHistorial` para calcular ciclos por su cuenta (p. ej. el "Wrapped" de ahorro entre ciclos, `cuentas.js`) no estaban entre los archivos subidos.

### 🔧 Cambio (2026-09-20) — `spNombreDe()` y `spPersonaPagadaVigente()` se movieron a `js/core/calc-helpers.js`

Mismo motivo que `getDeudorSaldo()` (avisos "Cobro Spotify de X vencido" de "Necesita atención" en el primer render). Siguen siendo globales; `spotify.js` ya no las define. Detalle en `CHANGELOG.md#inicio`.

### ✨ Agregado (2026-09-20) — "Pagar Spotify" solo ofrece cuentas con saldo ≥ $50 y TC con cupo

`openSheet_pagarSpotify()` filtra `spPagarFuente` con `FuentesFiltro.PRESET.SPOTIFY` (cuenta con saldo ≥ $50,00; TC con cupo ≥ $50,00). "Sin especificar" se mantiene. Si la cajita de Spotify no llega al mínimo, ya no se preselecciona. El split de **pago** (`spp`) pasó a usar `_spPagarSplitFuentesOpts()`, aparte de `_spSplitFuentesOpts()` **a propósito**: esa la comparte el split de **cobro** (`spc`), donde la plata entra y una cuenta vacía es un destino válido — filtrarla por saldo habría roto el cobro.


### ✅ Corregido — Los abonos de "lo pendiente" quedaban invisibles en toda la app

Reportado por el usuario con un caso real: un integrante dio $3.500 de su cuota, quedó debiendo $1.500, y tres días después dio esos $1.500 — pero a una cuenta distinta a la del cobro original. Esa plata sí subía el saldo real (`sumarFuente`), pero no había forma de verla en ningún lado: ni en el historial de Spotify, ni en el historial de ninguna cuenta.

**Causa raíz:** `confirmarSpResolverPendiente()` (spotify.js) guardaba cada abono dentro de `h.pendienteHistorial`, un array anidado *dentro* del cobro original, y sumaba su monto a `h.monto`. Pero:
1. `renderSpHistorial()` (spotify.js) nunca recorría `pendienteHistorial` — solo pintaba una tarjeta por cobro, con el `monto` ya inflado con todos los abonos fundidos adentro.
2. `getMovimientosCuenta()` / `_getMovimientosCuentaCustom()` (cuentas.js) — que sintetizan el historial de cada cuenta leyendo `S.spotifyHistorial` directamente, porque Spotify nunca generó un movimiento espejo real en `S.movimientos` como sí hace Mesada (`_registrarMovSecundarioMesada`) — solo miraban `h.fuente` y `h.monto` del cobro original. Un abono a una cuenta *distinta* a la del cobro no aparecía en ninguna cuenta; uno a la misma cuenta tampoco se veía por separado (mismo bloque, mismo monto ya fundido).

**Fix (3 archivos):**
- `spotify.js`: cada abono de `pendienteHistorial` ahora nace con `id` propio (`uid()`) y con `_secundario:true, _origenSeccion:'Spotify'` — mismos campos que cualquier otro registro de `spotifyHistorial`. `renderSpHistorial()` ahora pinta cada abono como su propia línea dentro de la tarjeta del cobro (monto, fecha, cuenta destino, nota).
- `cuentas.js`: los dos bloques que sintetizan el historial de Spotify (`getMovimientosCuenta()` y `_getMovimientosCuentaCustom()`) ahora recorren también `h.pendienteHistorial`, generando una tarjeta propia por cada abono en la cuenta que realmente le corresponde (`ab.destino`, no `h.fuente`). La tarjeta del cobro original resta el total de abonos ya recibidos (`h.monto − Σ pendienteHistorial`) para no contar la misma plata dos veces entre la tarjeta del cobro y la tarjeta del abono.
- `movimientos.js`: la búsqueda de `movObj` en `eliminarMovimiento()` (la que decide si un movimiento está protegido contra borrado directo) ahora también busca dentro de `pendienteHistorial` de cada registro de `spotifyHistorial`. Sin esto, borrar la tarjeta sintética de un abono desde una cuenta caía en la rama genérica de "ingreso" y descontaba el saldo directo sin tocar `h.pendienteHistorial`/`h.monto` — dejando el saldo de la cuenta y el historial de Spotify desincronizados. Con el fix, se bloquea igual que el cobro original y redirige a Spotify.

Validado con una simulación aritmética (no jsdom, por la cantidad de dependencias del DOM en `cuentas.js`) que reproduce el escenario reportado: cobro parcial de $3.500 a Nequi, abono de $1.500 tres días después a Efectivo. Confirmado que Nequi muestra $3.500 (neto de abonos), Efectivo muestra $1.500 con su propia fecha, la suma de ambas cuentas da los $5.000 reales sin duplicar, y que intentar borrar la tarjeta del abono desde Efectivo queda bloqueado y redirige a Spotify igual que el cobro original. **Sin verificar en navegador real.**

**Encontrado de paso, no arreglado en esta pasada:** ninguno de los dos bloques de `cuentas.js` lee `h.splits` — si un cobro se divide entre varias cuentas (motor de split, ver `spcSplitMode` en spotify.js), esa plata no aparece en el historial de **ninguna** cuenta, aunque sí se mueve el saldo real. Mismo síntoma de fondo (el bloque solo conoce la "foto" original del cobro por `h.fuente`), pendiente de una pasada aparte.

### ✅ Agregado — Deshacer un abono puntual de lo pendiente sin borrar el cobro completo

Consecuencia directa del fix de visibilidad de arriba: una vez que cada abono se ve como su propio movimiento, hacía falta poder deshacer uno puntual sin tener que borrar el cobro entero (que revertiría también el monto original y cualquier otro abono). Se agregó `deshacerAbonoPendienteSp(i, abIdx)` en `spotify.js`, con un botón "deshacer" en cada línea de abono del historial de Spotify — equivalente exacto a `deshacerPendienteMesada()` de Mesada, pero para Spotify. Revierte la plata de la cuenta a la que fue ese abono específico, devuelve ese monto de `h.monto` a `h.pendiente`, y lo quita de `pendienteHistorial` — el resto del cobro (monto original, otros abonos) queda intacto. Validado con simulación aritmética directa (mismo criterio que el fix de arriba, sin jsdom).

### 2026-07-05

- Corregido: el indicador de "Ganancia" calculado desde el saldo de la cajita, que producía resultados negativos incorrectos cuando los cobros se repartían entre varias cuentas. La cajita ahora muestra únicamente cobertura de liquidez ("Te sobra" / "Faltan" / "Sin saldo").
- Aclarado en los textos de "Balance del ciclo" y "Ganancia acumulada" que la cifra ya está neta de la cuota propia del administrador.
- Reemplazado "Flujo mensual estimado" (valor teórico fijo) por "Promedio real por ciclo pagado" en cuanto existe al menos un ciclo pagado, calculado a partir del historial real. Sin pagos reales, se mantiene una proyección teórica renombrada a "Flujo mensual proyectado".
- Los campos de cantidad de períodos y destino del formulario de registrar cobro pasaron a ser selectores estándar. El primero queda preseleccionado en 1; el segundo ya no tiene valor por defecto y exige una elección explícita.
- Corregido: el gasto "Spotify Premium" y los ingresos "Cobro Spotify (persona)" podían eliminarse directamente desde la lista de movimientos de la cuenta o desde Gastos, dejando huérfano el registro correspondiente. Ahora quedan marcados como movimientos automáticos y protegidos contra borrado directo.
- Actualizada la interfaz para usar "período"/"períodos" en vez de "mes"/"meses" en las etiquetas relacionadas con el cobro a integrantes, eliminando la discrepancia entre lo que mostraba la pantalla y el funcionamiento real de 30 días.
- Corregido: al pagar Spotify se reseteaba el estado "Pagó" de todos los integrantes sin excepción, sin importar si habían prepagado períodos futuros — haciendo que aparecieran como "Pendiente" antes de tiempo. Ahora solo se resetea a quienes ya no tienen su próxima fecha de cobro en el futuro.
- Corregido el mismo problema en "Pendiente por cobrar", que tampoco reconocía a integrantes con períodos prepagados si su cobro había quedado registrado en un ciclo anterior al actual.
- Corregido: eliminar un integrante no pedía ninguna confirmación. Ahora exige confirmación explícita; su historial de cobros se conserva intencionalmente.
- Agregada validación de nombres duplicados al agregar un integrante, y de personas repetidas al usar el selector del sistema unificado de personas.
- Actualizado el control interactivo de estado: mientras un integrante está en "Pendiente", el botón ahora dice "Cobrar" para diferenciarlo de "Pagar Spotify".
- Corregido: `totalSlots` asumía arbitrariamente 5 integrantes cuando la lista estaba vacía. Ahora usa siempre la cantidad real de integrantes.
- Corregido: editar el nombre o la cuota de un integrante recalculaba su próxima fecha de cobro igual que si hubiera cambiado la fecha de ingreso, aunque no se hubiera tocado. Ahora solo se recalcula si la fecha de ingreso cambia de verdad.
- Corregido: al corregir la fecha de ingreso de alguien que ya tenía períodos pagados por adelantado, la próxima fecha de cobro se recalculaba desde cero, perdiendo ese avance. Ahora se desplaza la misma cantidad de días que cambió la fecha de ingreso.
- Agregada una cuota del administrador guardada en cada pago (`_cuotaAdmin`), para que la ganancia de un ciclo ya cerrado no se recalcule con la cantidad de integrantes de hoy.
- Mejorado el selector de personas compartido: cuando no encuentra coincidencias, ahora ofrece un botón de un toque para crear directamente a la persona buscada.
- Agregado un aviso cuando se abre el selector de personas en "Editar" pero se cierra sin confirmar ninguna selección nueva, para no guardar en silencio el nombre anterior.
- El título del selector de personas ahora se adapta según el módulo que lo abre ("¿Quién es?" en Spotify), en vez de mostrar siempre el título pensado para Encargos.
- Corregido un breve parpadeo del campo de texto original antes de ser reemplazado por el selector de personas.
- Corregido: el nombre de un integrante vinculado a una persona podía verse distinto según la pantalla. Se centralizó la resolución del nombre en `spNombreDe`, aplicado en todos esos puntos.
- Corregido: al eliminar un pago a Spotify desde el historial, el dinero y el gasto vinculado se revertían, pero el estado "Pagó"/"Pendiente" de cada integrante quedaba roto (todos en "Pendiente", sin forma de deshacerlo). Ahora se guarda una foto del estado de cada integrante justo antes de pagar, y se restaura al eliminar ese pago.
- Corregido en la raíz el desajuste entre el nombre guardado y la persona realmente vinculada: al guardar cualquier edición, si el integrante sigue vinculado a una persona, su nombre se resincroniza siempre desde ese vínculo.
- Rediseñado el cambio de persona vinculada en "Editar": una vez que un integrante tiene una persona vinculada, ese vínculo queda fijo y ya no se puede reemplazar desde ahí — para asignar el cupo a otra persona hay que eliminar el integrante y agregar uno nuevo.
- Corregido: el selector de destino al registrar un cobro incluía tarjetas de crédito como destino válido. Ahora las excluye, igual que Encargos, "Yo debo", Mis deudas y Alcancía.
- Corregido: el badge de "X períodos adelantados" seguía mostrándose aunque esos períodos ya hubieran vencido. Ahora depende de la misma vigencia que el estado "Pagó".
- Corregido: renombrar una persona desde la pantalla "Personas" no sincronizaba el campo crudo de los integrantes de Spotify vinculados a ella (sí lo hacía para Deudores, Encargos y Mis deudas).
- Agregada la misma validación de personas duplicadas al vincular por primera vez una persona desde "Editar" (antes solo existía al agregar un integrante nuevo).

### 2026-08-15

- Corregido: al agregar un integrante nuevo vinculado a una persona (selector "¿Quién es?"), el avatar quedaba sin colorear (iniciales crudas de 2 letras, sin fondo/borde) hasta que otra acción en cualquier parte de la app disparara un refresco de pantalla. El dato (`personaId`) siempre quedó bien guardado — era solo la pantalla la que no se actualizaba. Causa: el hook que asigna `personaId` al integrante recién creado corre *después* de que la función de agregar ya guardó y renderizó, y nunca volvía a renderizar tras asignar el vínculo — a diferencia del hook de "Editar", que sí lo hacía. Encontrado en prueba de navegador real tras fusionar `spotify-personas.js` dentro de `spotify.js`; confirmado que el bug es preexistente a esa fusión, no causado por ella.

### 2026-08-20

- Corregido: en la hoja "Pagar Spotify", cuando la fuente de pago seleccionada es la propia Cajita Spotify (la preselección por defecto si existe), el mismo saldo y el mismo faltante aparecían repetidos hasta tres veces: en el aviso estático de arriba ("Cajita Spotify: $X — faltan $Y"), en "Saldo disponible: $X" y en el cálculo "$X − $monto = $resultado". El aviso de arriba se calculaba una sola vez al abrir la hoja (contra `spotifyCosto`, no contra el monto realmente tecleado), mientras que los otros dos son reactivos — coincidían en el número solo porque el monto viene prellenado con el costo. Fix inicial: se hizo el aviso reactivo y se ocultaba solo cuando la fuente elegida era la cajita. A pedido, se simplificó más: se **eliminó por completo** el aviso "Cajita Spotify: ... faltan ..." (el `<div id="spPagarSaldoInfo">` del HTML y el cálculo asociado en `spotify.js`) — la info de saldo y faltante queda solo en "Saldo disponible" + el cálculo, sin ningún texto redundante.

### 2026-08-20 (2)

- Corregido otro caso de repetición en la misma hoja "Pagar Spotify": con un monto ya tecleado, "Saldo disponible: $X" (arriba) y "$X − $monto = $resultado" (abajo) mostraban el mismo saldo dos veces, ya que el cálculo incluye el saldo como primer término. Ahora "Saldo disponible: $X" solo se muestra mientras el campo de monto está vacío (antes de que haya cálculo que mostrar); en cuanto hay un monto tecleado, se oculta y queda solo el cálculo.

### 2026-08-22

- ✨ Agregado: pago parcial con deuda pendiente al registrar un cobro a un integrante — mismo concepto que ya existía en Mesada (ver `CHANGELOG.md#mesada`), llevado a Spotify. Antes, el sheet "Registrar cobro" solo dejaba elegir cuántos períodos pagó (1-6) y calculaba el monto como un múltiplo exacto de la cuota; no había forma de registrar que alguien pagó su período pero dio menos de lo que debía. Ahora:
  - El monto a cobrar es editable (`spMontoRecibido`), prellenado con períodos × cuota pero se puede reducir.
  - Si el monto editado queda por debajo de lo esperado, aparece el toggle "Te está debiendo la diferencia" (igual al de Mesada). Sin marcarlo, un monto menor se guarda tal cual, sin deuda. Marcándolo, la diferencia queda registrada como `pendiente` en ese registro puntual de `spotifyHistorial`, junto con `cuotaEsperada` (snapshot de lo esperado) y `pendienteHistorial` (abonos futuros).
  - El período de todas formas avanza (`proximoPago` se mueve igual que con un cobro completo) — lo que queda pendiente es la plata, nunca el período; esto es intencional, ya que la persona sí pagó dentro de su período, solo que de menos.
  - Nuevo sheet "Registrar pago de lo pendiente" (`sp-hist-pend`), análogo al de Mesada, para saldar esa deuda después con su propio monto/fecha/destino/nota — cada abono puede ir a una cuenta distinta.
  - El historial de Spotify ahora muestra un badge "Debe $X" con acceso directo a resolverlo, y "✓ Saldó lo pendiente" una vez saldado.
  - Al eliminar un cobro que tuvo abonos de pendiente ya recibidos, cada abono se revierte de su propia cuenta por separado (no todo de la cuenta del cobro original) — mismo criterio que `_borrarMesadaPago()`. El diálogo de confirmación avisa explícitamente cuando el registro a borrar tiene una deuda abierta, para que quede claro que también se cancela.
  - Alcance: esta protección es independiente del mecanismo ya existente de `_pendienteAlCerrar` (integrantes que no pagaron nada antes de que se cerrara un ciclo) — son dos formas distintas de deuda y no se tocó esa lógica. Tampoco se le aplicó la protección por antigüedad de movimientos a los abonos de pendiente (`deshacerPendienteMesada` en Mesada tampoco la tiene); tiene solo el diálogo de confirmación genérico.

### ✅ Corregido — 3 sitios de `.innerHTML` sin escapar (nombre en fila, nombre en `title`, `toast()`)

*(2026-07-16, durante la migración a `data-action`, primer módulo migrado, antes de `html\`\``)*

Al migrar Spotify como primer módulo completo se creó el sistema reusable de eventos (`js/core/events.js`) y se corrigieron 3 casos de `.innerHTML` sin escapar. Un cuarto sitio (badge de "último destino" en `renderSpotify()`, vía `fuenteLabel()`) se escapó a estos tres, corregido después, el 2026-08-18 — ver `CHANGELOG.md#infraestructura--seguridad`.

### ✅ Corregido — Migrado a `html\`\``: 4 sitios de `.innerHTML`, más un quinto de `fuenteLabel()` sin escapar en el historial

*(sesión posterior, primero de los nueve módulos que quedaban)*

Migrados los 4 sitios de `.innerHTML` autocontenidos (asignación directa, sin pasar por ningún motor compartido): el render de la lista de personas en `renderSpotify()`, el historial en `renderSpHistorial()`, y los tres selectores de fuentes (`spDestinoSelect`, `spResDestino`, `spPagarFuente`).

**Se dejó sin tocar, a propósito, `_spSplitFuentesOpts()`** (usada por `crearSplitWidget`, motor compartido con Encargos y "Yo debo", en `split.js`, no recibido en esa sesión): ya escapa correctamente con `escHtml()`, y convertir su valor de retorno sin ver cómo lo consume el motor compartido es un riesgo que no vale la pena correr sin necesidad real. Los `toast()` (8 sitios) y un `textContent` se dejaron igual, mismo criterio ya establecido con Mesada/Análisis/Inicio.

**Hallazgo real de paso, decimosexta recurrencia del patrón "texto libre envuelto en función auxiliar":** `renderSpHistorial()` interpolaba `fuenteLabel()` (nombre de cajita/cuenta, texto libre) sin escapar tanto en el desglose de splits como en la fuente simple — sitio que el fix del badge de "último destino" (08-18) no cubría, por ser una función distinta. Corregido de raíz al migrar: ahora se arma como un string plano (`fuentesInfo`) y se interpola como una sola unidad, así `html\`\`` lo escapa completo sin tocar los separadores fijos (`' · '`, `' + '`).

Validado con `node --check` y una simulación con payloads maliciosos (`<img onerror>`, `<script>` cerrando atributos/tags) en nombre, nota y `fuenteLabel()` de los 3 bloques migrados: todo queda visible como texto escapado, sin ejecutar nada, con `data-action`/clases fijas/`var(--...)` intactos vía `raw()`. **Sin verificar en navegador real.**

---

## Salud financiera

### ✅ Corregido — `calcHealthScore()` no excluía los extras de préstamo gastados de inmediato

El mismo filtro de "gasto real del mes" usado en Análisis financiero (ver arriba) le faltaba una condición a `calcHealthScore()`: no excluía `_esExtraPrestamo`, así que cada extra de préstamo gastado inflaba `gastosMes` — afectando el cálculo de fondo de emergencia (meses de liquidez cubiertos) y el ratio gastos/ingresos, y bajando el puntaje de salud financiera sin razón real cuando había extras de préstamo ese mes.

Fix: se agregó la misma exclusión (`!g._esExtraPrestamo`) al filtro de `gvMes` en `calcHealthScore()`, dejando el criterio consistente con `renderAnalisis()`. *(Este filtro puntual quedó luego absorbido por la centralización en `_esGastoVarNoReal()`, ver `CHANGELOG.md#análisis-financiero`.)*

### ✅ Corregido — `#health-score-card` dejaba espacio vacío de sobra cuando el contenido era corto

*(2026-08-23)*

El `min-height:148px` inline del contenedor (agregado a propósito para evitar el CLS del salto skeleton→contenido, ver comentario en `index.html`) es un valor fijo pensado para el caso de 4 tips simultáneos. El problema: `renderHealthScore()` solo sobreescribía el `innerHTML` de adentro, nunca el `style` del contenedor — así que ese min-height se quedaba aplicado para siempre, incluso cuando el contenido real terminaba siendo mucho más corto (p. ej. la rama "sin datos", que es una sola línea de texto), dejando espacio vacío debajo.

Fix: `renderHealthScore()` ahora limpia el min-height (`el.style.minHeight = ''`) apenas corre, en las dos ramas (con y sin datos). El valor de 148px sigue protegiendo el CLS solo durante la carga (mientras se ve el skeleton); una vez que hay contenido real, el alto lo vuelve a definir el contenido mismo.

### ✅ Corregido — El anillo de progreso no se veía completamente lleno con puntaje 100

*(2026-08-23)*

Con `score=100`, `stroke-dasharray` quedaba como `"circ circ"` (dash = gap = circunferencia completa). Combinado con `stroke-linecap="round"`, los extremos redondeados del trazo (inicio y cierre del círculo) no terminaban de fundirse en un círculo continuo — quedaba una costura/muesca visible aunque el puntaje fuera perfecto.

Fix: cuando `score >= 100` se dibuja el círculo sin `stroke-dasharray` (círculo completo, sin patrón de guiones) y con `stroke-linecap="butt"` en vez de `"round"` (no hace falta cap redondeado si no hay gap). Para cualquier otro puntaje se mantiene el cálculo dinámico existente (`dash = score/100 * circunferencia`), que ya variaba correctamente según el puntaje.

### ✨ Mejorado — Mensaje de respaldo "Vas bien, sigue así." no sugería cómo mejorar

*(2026-08-23)*

Cuando `calcHealthScore()` no dispara ningún tip específico (score en el rango 60-79, "Regular"), el mensaje de respaldo era puramente de ánimo, sin ninguna sugerencia — inconsistente con la etiqueta "Regular" (no "Excelente") que se muestra al lado. Se cambió el texto de respaldo para ese rango a uno accionable: *"Vas bien — diversifica tus ahorros o reduce gastos variables para subir tu puntaje."* El rango "Necesita atención" (sin `tieneAlgo`) también se ajustó en la misma línea. No cambió ninguna lógica de cálculo, solo el texto de los dos tips de respaldo.

*(Nota: se revisó si el cálculo del puntaje penalizaba tener poca plata en términos absolutos — no es el caso. Los 7 factores de `calcHealthScore()` ya son 100% proporcionales (razones como `liquidoReal/gastosMes`, `deudaTC/ingresosMes`, `prest/liquidoReal`, `gastosMes/ingresosMes`) o basados en conteos (cantidad de CDTs, cantidad de gastos fijos configurados), nunca en montos absolutos — el puntaje ya es invariante a la escala del dinero.)*

---

## Proyección financiera

### ✅ Corregido (2026-09-22) — La tendencia mensual no usa trimmed mean; el algoritmo real es otro

`proyeccion-financiera.md` §2 y `analisis-financiero.md` (sección "Relación con otras secciones") describían el cálculo de tendencia como un promedio de tasas diarias de cambio con **trimmed mean** (descartar la más alta y la más baja de 5+ tasas). Revisado `renderProyeccion()` en `inicio.js`: el algoritmo real es la suma del cambio neto total de patrimonio dividida entre los días reales totales — un promedio ponderado por días, sin ningún recorte de outliers. El propio comentario del código explica por qué: el ingreso real llega en pocos días grandes (mesada, pagos), y un trimmed-mean de tasas por-intervalo terminaría descartando esos días como "outliers", subestimando la tendencia. Se reescribió el mecanismo en ambos documentos. De paso se confirmó y restauró la cifra exacta que había suavizado por precaución en el pase anterior: `MIN_DIAS_PARA_TENDENCIA = 7`.

También en `proyeccion-financiera.md`: la fila "Cuentas personalizadas marcadas como 'incluir en total'" no es real — `calcPatrimonioTotal()` (`core-state.js`) suma TODAS las cuentas personalizadas sin ningún filtro (`incluirEnTotal` no existe en el código). Se corrigió. Se agregó una nota sobre `_calcCSafe`/`_calcCDTSafe` (envoltorios defensivos de `calcC()`/`calcCDT()`, que viven en el módulo lazy `cuentas.js`) y sobre `_patrimonioDependenciasListas()`, el guard que evita grabar un snapshot de patrimonio artificialmente bajo si `cuentas.js` o `prestado.js` todavía no cargaron.

## Tarjetas de crédito

## Préstamos

### 🔧 Cambio (2026-09-22) — Atribución de `getDeudorSaldo()`

Con `calc-helpers.js` a la vista se confirmó lo que ya decía el propio comentario de `prestado.js`: `getDeudorSaldo()` se movió ahí el 2026-09-20 (mismo motivo que `getMesadaData`/`spNombreDe`: Inicio la necesita para "Necesita atención" sin cargar el módulo lazy completo). `prestado.md` la mencionaba sin decir dónde vive. Se agregó la atribución.

## Protección por antigüedad de movimientos

### 🔧 Cambio (2026-09-22) — De propuesta a estado implementado

`proteccion-antiguedad-movimientos.md` seguía redactado en tono de propuesta ("Propuesta nueva", "Recomendación de implementación") aunque `nivelAntiguedadMovimiento(fecha, opsPosteriores, modulo)` ya está implementado y en uso en los ocho módulos que la tabla de cobertura (§5) lista como protegidos (confirmado con grep en `alcancia.js`, `encargos.js`, `gastos.js`, `mesada.js`, `plata_comprometida.js`, `prestado.js`, `spotify.js`, `tarjetas_credito.js`). Se reescribió la introducción y §6 en tiempo presente, describiendo la estructura de configuración real en vez de proponerla.

### 🔧 Cambio (2026-09-22) — Corrección de una nota de código muerto que ya no aplica

`prestado.md` §6.1 describía `addDeudor()`, `selColor` e `initColorPicker` como código muerto que seguía en el archivo sin ejecutarse nunca. Ninguna de las tres existe ya en `prestado.js` (cero coincidencias) — no es que no corran, es que ya no están. Se corrigió la nota: el sheet `sheet-nueva-persona` sigue interceptado por el override de `openSheet`, pero ya no hay ninguna función propia que describir como muerta.

### ✨ Agregado (2026-09-20) — El cupo de una TC es obligatorio; "Pagar TC" solo ofrece cuentas con saldo (> $0, efectivo ≥ $1.000)

- **Cupo obligatorio:** `guardarTC()` rechaza crear o editar una tarjeta sin cupo (o con cupo ≤ 0) y enfoca el campo; el label del formulario lleva el asterisco rojo. Motivo: los selectores de "de dónde sale la plata" (Gastos, Pagar gasto fijo, Pagar Spotify, Préstamo con TC) solo ofrecen una TC si tiene cupo disponible (`FuentesFiltro.tcConCupo`), y sin cupo configurado no hay forma de saber cuánto se le puede cargar. Hasta hoy una TC sin cupo se trataba como "sin límite" (`getSaldoFuente` devuelve 999999999 — **no se tocó**, es núcleo, y otros módulos que no usan `FuentesFiltro` siguen leyéndolo así).
- **Tarjetas sin cupo (hoy no existe ninguna):** si alguna apareciera, dejaría de mostrarse en esos selectores (cupo disponible = 0) hasta que se edite y se le ponga cupo; el formulario de edición lo exige aunque solo se quiera, por ejemplo, cambiar el estado.
- **"Pagar TC" (`ptc_fuente`):** solo ofrece cuentas con saldo > $0 — se puede abonar cualquier monto —, salvo **efectivo, que exige ≥ $1.000** (`FuentesFiltro.PRESET.PAGO_TC`). Sin cuentas utilizables muestra "No tenés cuentas con saldo disponible".


### ✅ Corregido — `calcDeudaAjenaDeTarjeta` no contaba las compras marcadas `_esFavor`

*(2026-08-07)*

`calcDeudaAjenaDeTarjeta(tc)` solo sumaba compras con `c._desdeCP`, ignorando `c._esFavor` — pese a que la capa visual (`tarjetas_credito.js`, listado de compras) siempre trató ambos flags como equivalentes (`const esFavor = c._esFavor || c._desdeCP`), pintando el mismo badge azul "favor" y la misma etiqueta "Favor cubierto" para cualquiera de los dos. Resultado: una compra marcada `_esFavor` (sin `_desdeCP`) se le mostraba al usuario como plata ajena, pero `calcDeudaTcPropiaDeTarjeta` la contaba como 100% propia — inflando la deuda propia real y, con ella, el health score.

Fix: `calcDeudaAjenaDeTarjeta` ahora suma compras con `c._desdeCP || c._esFavor`, igualando el cálculo a lo que la UI ya venía mostrando. No se tocó el orden de cancelación de pagos (saldo inicial → ajena → propia) ni ninguna otra función — `calcDeudaTcPropiaDeTarjeta` y `calcDeudaTcPropia` heredan el fix automáticamente por depender de esta función.

### 🗑️ Eliminado por diseño — Seguimiento de cuotas en compras

*(2026-08-07)*

El módulo permitía marcar una compra como "en cuotas" (`esCuotas`, `numCuotas`, `valorCuota`) y llevar un contador manual `cuotasPagadas` con botones +1/-1, mostrado como badge en el detalle de la compra ("Cuota 3/12 · $45.000"). Era puramente informativo desde el diseño original: nunca difería el cobro (la compra completa siempre entraba a `tc.deuda` desde el día del registro, vía `tcRecalcular`) ni se conectaba a Análisis financiero, Salud financiera ni Proyección — ningún otro módulo leía esos campos.

Se decidió quitarlo por completo: el usuario ya tiene la app del banco para ver en qué cuota va una compra real, y el propósito de esta app es responder "¿voy bien o no?" con la plata — un contador que no mueve deuda ni plata no aporta a esa pregunta, solo agrega fricción en el formulario de registrar compra.

Fix: se quitó el toggle "¿Es una compra en cuotas?" y sus campos asociados del sheet de registrar compra (`index.html`), y en `tarjetas_credito.js` se eliminaron `tcCalcularValorCuota`/`tcValorUltimaCuota`, `tcIncrementarCuotaPagada` (y su registro en `Events`), el badge y los botones +1/-1 del listado de compras, y la escritura de `esCuotas`/`numCuotas`/`valorCuota`/`cuotasPagadas` en `tcCrearCompra` y en la normalización (`tcNormalizarTarjetas`). Compras ya guardadas con esos campos no se migran ni se tocan — simplemente dejan de leerse, sin afectar `tc.deuda` (que nunca dependió de ellos).

### ✅ Corregido — Widget de cobertura mostraba "vincula una cajita" con una cajita ya vinculada, y la deuda propia podía llegar a $0 escondiendo gastos reales

*(2026-07-12)*

Una tarjeta con cajita vinculada seguía mostrando el mensaje genérico de "vincula una cajita a tus tarjetas", y la "deuda propia" calculada daba $0 aunque existiera una compra propia real de $59.435. Eran dos problemas separados que se retroalimentaban:

1. **Problema semántico:** los widgets de cobertura (Inicio y detalle de tarjeta) usaban la deuda "propia" de la tarjeta (total menos lo que viene de encargos/préstamos/plata comprometida ajena) para responder "¿me alcanza la plata en la cajita para pagarle al banco?". Pero el banco cobra el 100% del corte sin importar de quién es moralmente la plata — la pregunta correcta necesitaba la deuda **total**, no la propia.
2. **Bug técnico:** `calcDeudaAjenaDeTarjeta(tc)` sumaba todo lo que alguna vez se cargó como ajeno a la tarjeta (bruto histórico) pero nunca restaba los pagos hechos, mientras que `tc.deuda` sí es un saldo neto. Si se pagaba la tarjeta con la misma plata que devolvía un encargo/préstamo, el "ajena" bruto podía terminar superando la deuda actual, y `Math.max(0, deuda − ajena)` se iba a 0 — escondiendo gastos propios reales.

Fix: los widgets de cobertura pasaron a usar `tc.deuda` (total) en vez de la deuda propia. `calcDeudaAjenaDeTarjeta` pasó de bruto histórico a saldo neto (bruto − pagos, con piso en 0), bajo la regla de negocio "un pago cancela primero lo ajeno, lo que sobra cancela lo propio". `calcDeudaTcPropia()` (usada en salud financiera) tenía su propio cálculo bruto duplicado con el mismo bug a nivel agregado — se unificó para que sume la función ya corregida por tarjeta, en vez de tener dos fuentes de verdad. Ver `tarjetas-credito.md` para el detalle de qué función mide qué.

### ✅ Corregido — Eliminar un pago de TC desde el feed de actividad no restauraba la deuda

`eliminarMovimiento` (usado desde el feed de actividad general) devolvía la plata a la cuenta correcta al borrar un pago de tarjeta de crédito, pero nunca restauraba la deuda de la tarjeta — quedaba más baja de lo que debía después de "deshacer" el pago.

### ✅ Corregido — 5 sitios de `.innerHTML`/`toast()` sin escapar

*(2026-07-20, durante la migración a `data-action`, antes de `html\`\``)*

Al migrar Tarjetas de Crédito a `js/modules/tarjetas_credito.js` se repitió, cuarta vez seguida, el mismo hallazgo de otros módulos: `tc.nombre` y `fuenteLabel()` interpolados directo en `toast()` (cupo insuficiente, saldo insuficiente), `fuenteLabel()` sin escapar en el badge de origen de un pago, una variable `descPago` (arma texto con `tc.nombre` + nota libre) insertada sin escapar, y el `<option>` del selector de cuenta de pago con `f.label` sin escapar. Los 5 corregidos con `escHtml()`. El `<script>` original no se pudo extraer como bloque contiguo (compartía tag con `navTo()` y con "Feed de actividad financiera", sin relación con TC) — solo se extrajo lo que era realmente de TC.

**Hallazgo nuevo, sin resolver en esa sesión:** el mismo patrón (`f.label` sin escapar) existía también en `buildFuentesOptsHtml()` — núcleo compartido por toda la app, no solo TC. No se tocó por ser núcleo compartido fuera de alcance; corregido después, el 2026-08-14 (ver `CHANGELOG.md#infraestructura--seguridad`).

### ✅ Corregido — Migrado a `html\`\``: 6 sitios, más un hallazgo real (`tc.banco` nunca había pasado por `escHtml()`)

*(sesión posterior — junto con Plata Comprometida, dos primeros de los cinco módulos que quedaban)*

Convertidos `_tcPoblarSelectCajita()`, `renderTCScreen()` (lista de tarjetas), `renderTCDashboard()` (resumen en Inicio, incluido el widget de cobertura por cajita), `abrirPagarTC()` (opciones rápidas + selector de cuenta) y `abrirDetalleTCSheet()` (la función más grande del módulo: saldo inicial, compras, pagos, movimientos de encargo/préstamo, con los atributos `data-mov-*` que arma `_tcAttrs()` reconstruidos vía `html\`\`` e interpolados con `raw()`). Los dos `toast()` con `escHtml()` manual (cupo/saldo insuficiente) se dejaron igual, mismo criterio de siempre.

**Hallazgo real, no reportado antes:** `tc.banco` (nombre del banco, texto libre del input) nunca había pasado por `escHtml()` en el subtítulo de `renderTCScreen()` — quedaba sin escapar pese a que la cabecera del archivo documenta una "pasada de fixes de `.innerHTML`" previa. Corregido de paso.

**Sombra de variable**, misma recurrencia que Mesada/Gastos: `let html='';` en `abrirDetalleTCSheet()` tapaba la función global `html\`\``. Renombrada a `contenido`.

Validado con `node --check` y una simulación jsdom (con la implementación real de `js/core/html-tag.js`) inyectando un payload malicioso (`<img src=x onerror=alert(1)>"'&<script>alert(2)</script>`) en nombre de tarjeta/deudor/persona, banco y notas. Verificado sobre el DOM ya parseado (cero `<script>`/`img[onerror]` ejecutables creados, texto libre visible como texto plano) — no solo comparación de substrings contra el HTML serializado, que da un falso positivo dentro de valores de atributo (`data-mov-saldo-label`, etc.): ahí el navegador no vuelve a escapar `<`/`>` al serializar `.innerHTML` de vuelta a texto, aunque el valor ya haya sido parseado de forma segura la primera vez. **Sin verificar en navegador real.**

### ✨ Agregado (2026-09-04) — "Cargo especial" a la tarjeta (interés, comisión, corrección del banco), sin validar cupo a propósito

*(a pedido del usuario, tras reportar que un interés cobrado con el cupo al tope no tenía dónde registrarse)*

Nuevo botón "+ Cargo especial" dentro del detalle de cada tarjeta (`abrirDetalleTCSheet`), que abre un sheet propio (`sheet-cargo-especial-tc`) con descripción, monto, motivo (Interés / Comisión / Otro), fecha y nota. A diferencia de una compra, este flujo (`abrirCargoEspecialTC`/`confirmarCargoEspecialTC`) **no valida cupo disponible** — es el criterio central que lo distingue de "+ Compra": un interés o comisión lo impone el banco, no es una decisión de gasto del usuario, así que por definición puede superar el cupo configurado. Si el monto supera el disponible, el diálogo de confirmación lo advierte explícitamente antes de guardar (no es un error silencioso).

Implementación: reutiliza la capa de datos de compras (`tcCrearCompra`/`tcRecalcular`/`tcEliminarCompraInterna`) con dos campos nuevos, `_esCargoEspecial:true` y `_motivoCargo`, en vez de un array aparte — se elimina y aparece en el historial exactamente igual que cualquier compra, solo con un badge ámbar distinto ("Cargo especial · Interés") en vez del badge de categoría. Genera gasto espejo en `S.gastosVar` (sí cuenta como gasto real del mes, igual que una compra). Ver `tarjetas-credito.md` §2/§3/§5/§7 para el detalle completo.

Validado con `node --check`. **Sin verificar en navegador real.**

---

## Análisis financiero

### 🔧 Cambio (2026-09-21) — Ubicación del módulo y ajuste menor

`analisis-financiero.md` no decía en qué archivo vive el código (`js/modules/analisis.js`) ni que `calcPatrimonioTotal()`/`snapshotPatrimonio()` se quedaron a propósito en `index.html` (los llama `save()` en cada guardado). Se agregó al final de §10. Se agregaron los ids `an-mesada-section`/`an-mesada-total` en §8. Se suavizó una mención a `MIN_DIAS_PARA_TENDENCIA` que no pude verificar contra código (esa función vive en `inicio.js`, no incluido).

### 🐛 Corregido (2026-08-19) — Toast de "80% del presupuesto" reaparecía en cada refresh, no una sola vez

*(reportado por el usuario: con un solo presupuesto cargado al 90%, el aviso volvía a aparecer cada vez que cambiaba de pantalla — Inicio, Configuración, Análisis — y al volver a entrar después de salir; con varios presupuestos al mismo tiempo el problema iba a multiplicarse un toast por categoría en cada refresh)*

`renderPresupuestos()` está enganchada al ciclo de `refresh()` (vía el hook `_renderMejoras()` en `index.html`, que conecta Inicio + Análisis), así que corre en cada refresh de la app, no solo al entrar a la pantalla de Análisis. El guard que evita repetir el toast (`window._presupWarned`) tenía una línea al inicio de la función que lo reseteaba a `false` en **cada** llamada — con el comentario `// Bug fix: resetear para que el aviso funcione en cada render`, agregada pensando que sin eso el aviso no disparaba nunca. El efecto real era el opuesto al buscado: en vez de avisar una sola vez por categoría, el aviso se repetía en cada refresh mientras la categoría siguiera entre 80% y 100% — cambiar de pantalla, guardar cualquier movimiento, etc. Con varias categorías al 80%+ simultáneamente, cada refresh dispara un toast por cada una.

Fix: se reemplazó el flag global booleano por un `Set` (`window._presupWarnedKeys`) que registra qué combinaciones `categoría+mes` ya avisaron, sin resetearse en cada render. Cada categoría avisa una sola vez por mes (la clave incluye el mes, así que el aviso vuelve a estar disponible naturalmente al entrar un mes nuevo). Un F5 completo de la página sigue reseteando el registro por ser solo estado en memoria — eso es esperable, no es el bug reportado (que era la repetición *dentro* de la misma sesión de pestaña). `node --check` sin errores.

### ✅ Corregido — Filtro de "gasto real del mes" duplicado en 9 lugares, dos de ellos con exclusiones faltantes

Los dos bugs anteriores (extras de préstamo en Análisis financiero y en Salud financiera) tenían la misma causa raíz: el criterio de qué gasto de `S.gastosVar` cuenta como "gasto real" (excluye `esPagoGastoFijo`, `_esPagoTC`, `_esAlcancia` y `_esExtraPrestamo`) estaba copiado a mano en 9 lugares distintos del código, sin ninguna fuente única — cada corrección tenía que aplicarse manualmente en cada copia, y ya había pasado dos veces que una quedara desactualizada.

Al revisar los 9 lugares aparecieron dos casos adicionales con el mismo problema, sin haber sido reportados todavía:
- **Resumen de cierre de mes** (toast "Total gastado" al cambiar de mes en Inicio): no excluía `_esPagoTC` ni `_esExtraPrestamo` — un pago de tarjeta o un extra de préstamo gastado ese mes inflaban el "Total gastado" del resumen.
- **Presupuestos por categoría** (Análisis financiero): tampoco excluía `_esPagoTC` ni `_esExtraPrestamo` — un pago de TC o un extra de préstamo categorizado como "Varios" podían hacer que una categoría pareciera superar su presupuesto sin que fuera gasto real.

Fix: se creó el helper `_esGastoVarNoReal(g)` (análogo a `_esEntradaEspejoNoIngreso` para ingresos) que centraliza las cuatro exclusiones en un solo lugar. Se reemplazaron los 9 filtros duplicados por una llamada a este helper: dashboard de Inicio, los cuatro puntos de `renderAnalisis()`, el total de la pantalla de Gastos, el resumen de cierre de mes, `calcHealthScore()` y los presupuestos por categoría. La lista de movimientos del feed general (`_normGastos`) se dejó intacta a propósito — ahí sí deben verse todas las transacciones reales, incluidas las que no cuentan para los totales agregados.

### ✅ Corregido — Reposiciones viejas sin `_esReposicionCP` se contaban como ingreso solo en Análisis financiero

`_esEntradaEspejoNoIngreso(m)` (el helper que excluye movimientos espejo del cálculo de ingresos, ver el fix de doble conteo más abajo) no cubría movimientos antiguos con descripción `"Reposición: ..."` o `"Para pagar TC (...)"` creados antes de que existiera la bandera `_esReposicionCP`. `calcHealthScore()` sí tenía ese filtro de respaldo (un regex sobre la descripción) aplicado aparte, pero `renderAnalisis()` no — esos movimientos viejos inflaban `ingresosEstimados` (mes actual y mes anterior) únicamente en Análisis financiero, no en Salud financiera, haciendo que dos pantallas que deberían coincidir conceptualmente divergieran para datos históricos.

Fix: se movió el regex de respaldo dentro de `_esEntradaEspejoNoIngreso()`, para que quede en el único lugar que decide qué es o no ingreso real. Se quitó la duplicación del mismo regex en `calcHealthScore()`, que ahora depende exclusivamente del helper centralizado.

### ✅ Corregido — Extras de préstamo gastados de inmediato inflaban el gasto del mes

Cuando alguien paga una deuda con un extra/propina y se elige "gastar" esa plata (en vez de "guardar" o dejarla "pendiente"), el sistema registra el gasto en `S.gastosVar` marcado `_esExtraPrestamo:true`, pero nunca registra el ingreso correspondiente — a diferencia de la opción "guardar", que sí genera un movimiento de entrada real que cuenta como ingreso. Como el balance del mes se calcula como `ingresosEstimados − gastosTotalMes`, esa plata aparecía como gasto sin su contraparte de ingreso, aunque en la práctica entró y salió en el mismo momento (efecto neto cero) — inflando artificialmente el gasto total, el ranking de meses, el gráfico de 12 meses y la comparación con el mes anterior, y haciendo ver el balance y la tasa de ahorro más negativos de lo real.

Fix: se excluyó `_esExtraPrestamo` de los cuatro filtros de `gastosVar` en `renderAnalisis()` (gasto del mes actual, gráfico de 12 meses, ranking de meses, comparación con el mes anterior) — mismo criterio ya usado con `_esPagoTC` y `_esAlcancia`: plata cuyo movimiento ya está neutralizado queda invisible para el análisis, tanto del lado del ingreso como del gasto.

### ✅ Corregido — Doble conteo / mal conteo en "Ingresos estimados"

`renderAnalisis()` sumaba como ingreso nuevo **todo** movimiento `tipo:'entrada'` del mes en Efectivo/Nequi, sin excluir los movimientos "espejo" que otros módulos generan automáticamente:
- **Mesada** recibida en Efectivo/Nequi se contaba dos veces (una vía `getMesadaData()`, otra vía el movimiento espejo).
- Un **abono de deuda** ("Me deben") se contaba como ingreso nuevo, cuando es solo plata que ya era tuya volviendo.
- Que te **prestaran plata** ("Yo debo" → "Me prestó") se contaba como ingreso, cuando es una deuda tuya, no ingreso.
- Traspasos de **capital de Encargos** a tu cuenta propia tampoco se excluían (sí se excluían ya en el cálculo de salud financiera, pero no acá).

Fix: se creó el helper `_esEntradaEspejoNoIngreso(m)` que centraliza todas las exclusiones (`_esReposicionCP`, `_esIntercambioEncargo`/`_intercambioEntrada`, `_encMovId`, desc `"Margen..."`, `_origenSeccion==='Mesada'`, `_origenSeccion` que empiece con `"Prestado"`). Se aplicó en los dos loops de `renderAnalisis()` (mes actual y mes anterior) y en el cálculo de `ingresosMes` de Salud financiera (que antes tampoco filtraba estos casos en cuentas personalizadas).

### 🗑️ Eliminado — Filtro muerto de "plata comprometida" en el gráfico de 12 meses y el ranking

El gráfico de "Gastos por mes" y el "Ranking de meses" intentaban excluir gastos con `g.fuente!=='plata-comprometida'`, pero ese valor **nunca** se escribe en `S.gastosVar.fuente` — los gastos "favor" pagados con plata comprometida viven en `tc.compras` (con `_esFavor`/`_desdeCP`) o son solo una reposición de cajita (`_esReposicionCP` en `S.movimientos`), nunca tocan `S.gastosVar`. Era código muerto que no hacía nada. Se quitó la comparación rota de ambos lugares.

### 🔧 Cambio — Reordenamiento de la pantalla

"Resumen del mes" pasó a ser el primer bloque de la pantalla y "Ingresos fijos" se movió justo después (antes iba primero). Cambio puramente de HTML/orden visual, sin tocar ids ni lógica.

### ✅ Corregido — 5 sitios de `cat` (nombre de categoría) sin escapar

*(2026-07-28, confirmando el módulo contra su código fuente por primera vez)*

A diferencia de todos los hallazgos anteriores de este mismo patrón (que reincidían sobre `fuenteLabel()`/`.nombre`/`.nota`), acá el campo sin escapar era uno nuevo: `cat` (nombre de categoría, texto libre creable desde Configuración) sin `escHtml()` en 5 sitios — "Top categorías" del mes, label + atributo `data-cat` de Presupuestos, la barra de progreso de Presupuestos, y el `toast()` de aviso al 80%. Confirma que no basta con revisar los nombres de campo ya conocidos: cualquier texto libre nuevo agregado al modelo de datos puede repetir el patrón. Corregido con `escHtml()` en los 5 sitios.

### ✅ Corregido — Migrado a `html\`\`` (piloto + resto del archivo)

*(2026-08-17 el piloto de Presupuestos, 2026-08-25 el resto)*

`analisis.js` fue el piloto original de `html\`\`` (ver `CHANGELOG.md#infraestructura--seguridad` para la creación de `js/core/html-tag.js` y la migración inicial de `abrirPresupuestos()`/`renderPresupuestos()`, con el hallazgo de `val` sin `escHtml()`). El resto del archivo quedó sin tocar en ese momento y una sesión posterior lo dio por migrado completo por error — al retomar la migración del resto de módulos (2026-08-25) se confirmó que solo Presupuestos estaba hecho; **Ingresos Fijos** (7 `escHtml()`, `ing.nombre`/`ing.desde`) y "Top categorías" dentro de `renderAnalisis()` (`cat`, 1 sitio) seguían con `escHtml()` a mano.

Ambos migrados a `html\`\`` esa sesión. En "Top categorías" el array de fragmentos se dejó auto-concatenar por el `html\`\`` externo, sin `.join('')` explícito (mismo patrón que Presupuestos); en Ingresos Fijos se mantuvo `.join('<div class="divider"></div>')` explícito porque ahí sí hace falta un separador real entre ítems — cada fragmento interno ya es un `html\`\`` seguro, y `.join()` lo coacciona a string vía su propio `toString()` sin volver a escapar nada. `Events.attr(...)` en los dos botones de Ingresos Fijos se envolvió en `raw()` (el segundo argumento es `ing.id`, un `uid()` interno, nunca texto de usuario en este modelo de datos). `analisis.js` quedó con 0 sitios de `escHtml()` fuera de comentarios y del `toast()` de Presupuestos (que se deja a mano a propósito, `toast()` no pasa por `html\`\``). `node --check` sin errores en ambos archivos.

---

## Patrimonio y cálculos globales

### ✅ Corregido (2026-09-30) — Borrar un movimiento y rehacerlo inflaba el saldo: `descontarFuente()` recortaba en 0 al revertir

Reportado con un caso real. En un encargo, el margen y la plata puesta de su bolsillo se habían registrado en Nequi y debían ir a la cuenta personalizada "Madre". Para corregirlo hubo que borrar el movimiento del encargo y rehacerlo. Efectivo estaba en $49.000 (con el recupero de +$54.000 ya incluido) y, tras borrar y rehacer, quedó en $54.000. Las demás cuentas cuadraban.

**Causa:** Efectivo, Nequi, las cajitas y las cuentas personalizadas guardan un saldo corrido (`S.efectivoSaldo`, `S.nequiSaldo`, `c.saldo`) que cada operación suma o resta. `descontarFuente()` terminaba en `Math.max(0, saldo − monto)`. Al borrar el movimiento se revertían los +$54.000, pero otras operaciones posteriores ya habían bajado el saldo: la reversión daba −$5.000 y se guardaba 0, y esos $5.000 se perdían. Al rehacer el movimiento se sumaban otra vez los +$54.000 sobre 0, y el saldo quedaba $5.000 por encima del real. El borrado del encargo (`deleteMovEncargo()`) revertía bien cada efecto; lo que fallaba era el piso en 0 de la reversión, común a todos los módulos.

**Fix:** `descontarFuente(fuente, monto, opts)` acepta ahora `{ exacto: true }`, que no recorta en 0 y deja el saldo en negativo mientras dure la inconsistencia. Sin esa opción se comporta como siempre: el piso en 0 sigue valiendo para gastos y pagos normales, que ya validan saldo antes de descontar. Todas las reversiones pasaron a `{ exacto: true }`:
- `core-state.js`: la propia función; además `fmtInput()` maneja números negativos (el saldo de Efectivo se relee desde un input oculto en `save()` y se rompía con negativos).
- `encargos.js`: las 7 reversiones de `deleteMovEncargo()`.
- `movimientos.js`: transferencia, entradas y aperturas, fallback de saldo inicial y borrado de mesada desde el feed (6).
- `mesada.js`: `_borrarMesadaPago` y los abonos pendientes (8).
- `spotify.js`: borrar un cobro, sus abonos pendientes y "Deshacer abono" (4).
- `cuentas.js`: "editar saldo inicial" cuando el saldo baja (1).
- `prestado.js`: borrar abonos recibidos (destino simple y dividido), la parte "guardar" de un extra y "me pagaron" (6).
- `plata_comprometida.js`: al eliminar un ingreso, los destinos de reposición y la cajita usada para pagar TC (3).

**No se tocó, a propósito:** los descuentos al crear un gasto, pago o depósito (`gastos.js`, `alcancia.js`, `tarjetas_credito.js`, pago de Spotify, transferencia, "Pagar mi deuda"), porque validan saldo antes de descontar.

**Efecto visible:** un saldo puede mostrarse temporalmente negativo tras borrar un movimiento cuyo dinero ya se gastó. Es la consecuencia correcta y se corrige sola al rehacer el movimiento.

**Datos ya afectados:** el JSON con el error no se repara solo. Para el caso reportado, Efectivo quedó en $54.000 y el valor correcto era $49.000; se corrigió a mano con "ajustar saldo".

**No cubierto / pendiente:** `tc.deuda` tiene un piso en 0 parecido en varias reversiones de tarjeta (`Math.max(0, deuda − monto)`). Puede pasar al borrar una compra después de haber pagado la tarjeta; arreglarlo implica decidir cómo mostrar una deuda "a favor". Los cambios pasan `node --check` pero no se probaron en la app.

---

### ✅ Corregido (2026-09-29) — El sobrante/faltante del destape de la alcancía inflaba la tendencia y la proyección

**Síntoma:** al destapar una alcancía con más (o menos) efectivo del registrado (ej. $1.000.000 reales vs $200.000 registrados), el patrimonio saltaba $800.000 en un solo día y `renderProyeccion()` lo tomaba como ritmo normal de crecimiento (no aplica recorte de outliers), proyectando a 3/6/12 meses un patrimonio inflado. El faltante hacía lo contrario.

**Fix (`core-state.js`):** nuevo `_ajusteAlcanciaPorFecha()` (sobrante = `entrada` con `_esAlcancia` sin `_esAlcanciaIngreso`; faltante = gasto con `_esAlcanciaAjuste`). `snapshotPatrimonio()` lo suma a `montoBase` del día, y la migración retroactiva de `montoBase` lo aplica también a destapes ya hechos. Resultado: la curva de Análisis y la Proyección lo tratan como un saldo inicial (no crecimiento). **Sigue contando** como ingreso/gasto del mes en Análisis y Salud, en la fecha del destape.

**Decisión de diseño — por qué no se reparte el sobrante en el tiempo (promedio de alcancías anteriores):** se evaluó estimar cuándo se acumuló usando el ritmo de ahorro de destapes previos y no reescribir datos. Se descartó porque (1) el ritmo de lo *registrado* no dice nada de lo *no registrado*: el sobrante es justamente lo que no siguió ese patrón; (2) con pocas alcancías destapadas no hay base estadística; (3) cambiaría el ingreso de meses ya cerrados en pantalla y dejaría Análisis desalineado del patrimonio real (que sí saltó el día del destape). Decisión cerrada: el sobrante cuenta completo el mes del destape y queda fuera de la tendencia; no queda nada pendiente.

**Verificación:** `node --check` OK; prueba sintética de `_ajusteAlcanciaPorFecha()` (sobrante $800.000 el 29 y faltante −$30.000 el 10; depósitos `_esAlcanciaIngreso` y gastos normales ignorados). **Sin verificar en navegador real.**

*(`calcPatrimonioTotal()`, `snapshotPatrimonio()`, hero de Inicio, salud financiera — funciones compartidas por varias pantallas, no exclusivas de un solo módulo)*

### ✅ Corregido (2026-08-26) — `snapshotPatrimonio()` grababa un patrimonio artificialmente bajo cuando corría antes de que cargaran los módulos lazy de Cuentas/Préstamos

*(reportado por el usuario: en la card "Proyección financiera" de Inicio, "Tendencia mensual" aparecía a veces en verde/positiva y a veces en rojo/negativa recargando la misma página, sin haber hecho ningún movimiento real entre una carga y otra)*

Diagnóstico a partir de un backup real: `S.patrimonioHistorial` tenía dos caídas de un solo día que se revertían casi por completo al día siguiente (2026-08-17: cae ~$1.17M y se recupera el 19; 2026-08-24: cae ~$734K y se recupera el 25) — muy por encima del rango de variación diaria normal del resto del historial. Causa: `calcPatrimonioTotal()` depende de `getDeudorSaldoPatrimonio()`/`totalMisDeudasPendiente()` (`prestado.js`, módulo lazy) y de `calcC()`/`calcCDT()` (`cuentas.js`, módulo lazy), todas detrás de guards `typeof fn==='function'?fn():0` que, si el módulo todavía no cargó, devuelven 0 en silencio en vez de fallar. `save()` llama a `snapshotPatrimonio()` en cada guardado de la app sin esperar a que esos módulos carguen — si el primer `save()` de la sesión ocurre antes de que el usuario visite Cuentas o Préstamos (por ejemplo, justo al terminar de sincronizar Firebase al abrir la app), ese día queda grabado con "lo que te deben" en $0, permanentemente, hasta el próximo `save()` con todo ya cargado.

Fix: nuevo guard `_patrimonioDependenciasListas()` al inicio de `snapshotPatrimonio()` — si `calcC`, `calcCDT`, `getDeudorSaldoPatrimonio` o `totalMisDeudasPendiente` no están disponibles todavía, ese `save()` no graba ningún punto (mejor un día sin snapshot que un día con dato falso; el próximo `save()` con todo cargado sí lo graba bien).

**No se agregó limpieza retroactiva del historial ya corrupto** (se evaluó una auto-sanación tipo `tcNormalizarTarjetas()`, pero se descartó a pedido del usuario: la app está en desarrollo, el historial de prueba se borra y se rehace seguido, así que nunca llega a acumular ese tipo de hueco).

### ✅ Corregido (2026-08-26) — Proyección financiera: la "Tendencia mensual" no reflejaba el ingreso real, que llega en pocos días grandes, no repartido parejo día a día

Primer intento (mediana en vez de trimmed mean, ver más abajo) resultó insuficiente. El trimmed mean original (recorta 1 máximo y 1 mínimo del array de tasas por-intervalo) se dejaba arrastrar por outliers cuando había más de un par extremo en la ventana — con dos eventos del bug de arriba, cada uno con una caída y una recuperación, quedaban 4 valores extremos en vez de 2; recortar solo 1 y 1 dejaba un extremo negativo y uno positivo sin filtrar compitiendo entre sí, y cuál pesaba más (algo que variaba según el momento exacto del render) decidía el signo final de toda la tendencia. Cambiar a mediana resolvió ese síntoma, pero introdujo un problema distinto y más de fondo: en datos reales, el ingreso (mesada, pagos) llega en unos pocos días con cambios grandes — de 71 días de historial de prueba, solo 19 (27%) tenían cambios grandes; los otros 52 (73%) eran solo interés diario de cajitas. Como la mediana cae por definición en el "día del medio", con menos de la mitad de los días siendo de ingreso real, la mediana **siempre** aterriza en un día de puro interés e ignora el ingreso — mostrando una tendencia mucho más baja de lo real ($28.666/mes calculado vs. ~$74-77K/mes real en los mismos datos).

Fix definitivo: se reemplazó cualquier estadístico por-intervalo (mediana o trimmed mean) por un promedio ponderado por días: se suma el cambio neto total de la ventana (ya sin aperturas/ajustes) y se divide por el total de días reales transcurridos, en vez de promediar tasas por-intervalo con el mismo peso sin importar cuántos días abarca cada una. Esto tiene una ventaja adicional no buscada: una caída de un día que se revierte casi por completo al siguiente (la firma del bug de `snapshotPatrimonio()` de arriba) se cancela casi sola dentro de la suma — sin necesitar ningún filtro de outliers a mano, el método ya es robusto a ese patrón específico.

### ✅ Corregido — Plata de Encargos en Nequi/Efectivo/cuentas personalizadas se contaba como patrimonio propio

`calcPatrimonioTotal()` solo restaba la plata de un encargo cuando estaba guardada en una **cajita de Nu** (vía `_saldoEncargosEnCajita()`). Si el encargo se guardaba en Nequi, Efectivo o una cuenta personalizada, no existía ningún descuento equivalente — esa plata ajena se contaba como si fuera tuya.

Fix: se generalizó `_saldoEncargosEnCajita(cajitaId)` en `_saldoEncargosEnCuenta(cuentaKey)`, que acepta cualquier clave de cuenta (`'nequi'`, `'efectivo'`, `'custom:ID'`, `'cajita:ID'`). Se aplicó la resta en tres lugares que hacían el mismo cálculo de forma independiente: `calcPatrimonioTotal()`, el hero de Inicio (`refresh()` — el número más visible de la app tenía el mismo bug por separado), y `liquidoReal` en Salud financiera.

**Pendiente, fuera de esta corrección:** `getSaldoFuente('nequi'/'efectivo')` (usada para validar si hay saldo suficiente al registrar un gasto) todavía no resta la plata de encargos. En teoría permitiría "gastar" sin aviso plata que en realidad es de un encargo. Revisar si vale la pena aplicar el mismo criterio ahí.

### ✅ Corregido — La alcancía se filtraba en el Historial de Patrimonio (Análisis financiero)

La alcancía es una función de "ahorro oculto": el saldo no se muestra en ningún lado hasta que se decide destaparla. El hero de Inicio ya respetaba esto (calcula el patrimonio visible restando explícitamente la alcancía), pero `calcPatrimonioTotal()` — la función que alimenta `snapshotPatrimonio()`, que a su vez llena `S.patrimonioHistorial` (la data de la gráfica de Análisis Financiero) — sí la incluía.

Por qué era grave y no solo inconsistente: al registrar un depósito tipo `yo-directo` (efectivo que no tenías registrado), el movimiento en efectivo es neto cero, pero el saldo de la alcancía sí sube. El patrimonio total pegaba un salto ese día que no se explicaba por ningún ingreso visible — cualquiera que mirara la curva de tendencia podía ver, con precisión de peso, cuándo y cuánto se metió a la alcancía.

Fix: se guardan dos valores por punto del historial (`valor` = patrimonio real con alcancía, `valorVisible` = sin alcancía), calculados en `snapshotPatrimonio()`. La gráfica de Análisis Financiero pasó a consumir `valorVisible` en la curva, el número de encabezado y el tooltip (los dos últimos se habían quedado usando el valor real en una primera pasada del fix, y se corrigieron aparte). ~~Health score y Proyección financiera siguen usando `calcPatrimonioTotal()` con la alcancía incluida a propósito — ahí sí es plata real que debe contar, y no es una gráfica día a día que exponga montos puntuales.~~ **Superado (2026-08-28), ver entradas debajo:** esa afirmación resultó incorrecta para Proyección financiera — si bien no es una gráfica día a día, sí es un número puntual que se recalcula en cada render, así que un depósito a la alcancía la delataba igual de claro que la curva cruda. Corregido para ambas funciones.

**Limitación conocida:** los puntos del historial guardados antes de este cambio no tienen `valorVisible` (caen a `valor` como fallback) — no hay forma de reconstruir retroactivamente cuánto había en la alcancía en fechas pasadas, así que esos puntos viejos pueden seguir mostrando el salto original. De ahí en adelante, la curva queda limpia.

### ✅ Corregido (2026-08-28) — Proyección financiera delataba depósitos/destapes de la alcancía (mismo problema que ya se había resuelto en la gráfica de Análisis, sin aplicarlo acá)

*(reportado por el usuario con un backup real: alcancía con saldo $0 → Proyección financiera mostraba Tendencia mensual +$28.659, 3m $4.683.190; al agregar un depósito de $3.333.333,33 a la alcancía —sin tocar nada más—, la misma card saltó a Tendencia mensual +$28.673, 3m $8.016.565, delatando el monto exacto depositado)*

Causa: `renderProyeccion()` (`inicio.js`) usaba `calcPatrimonioTotal()` crudo (con alcancía incluida siempre, tapada o no — ver entrada de arriba) tanto para el patrimonio del día como, indirectamente, para la tendencia mensual (que se calcula sobre `hist[i].valor`, el campo crudo del historial, en vez de `hist[i].valorVisible`). El razonamiento original ("no es una gráfica día a día") no aplicaba: al ser un número puntual que se recalcula en cada render con datos frescos, un depósito o un destape se veía reflejado al instante y de forma exacta, exactamente igual de revelador que la curva cruda que ya se había corregido en Análisis financiero.

Fix, mismo criterio que ya existía para el gráfico: `patrimonio` ahora es `calcPatrimonioTotal() - S.alcancia.saldoRegistrado`, y el cálculo de `tendenciaMensual` usa `hist[i].valorVisible` (con fallback a `.valor` para puntos del historial guardados antes de que existiera ese campo) en vez de `hist[i].valor`. Mientras la alcancía esté tapada, ningún número de esta card se mueve por depositar/sacar plata de ahí; al destaparla, la plata entra a una cuenta real y el patrimonio visible sube solo, de forma natural, sin ningún caso especial.

Verificado con los números exactos del backup del usuario: patrimonio implícito antes del depósito (☰ $4.683.190 − $28.659×3) ≈ $4.597.213; después del depósito (☰ $8.016.565 − $28.673×3) ≈ $7.930.547 — exactamente $3.333.333,33 más. Con el fix, el patrimonio visible da $4.597.214 en ambos casos. Validado con `node --check`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-08-28) — Salud financiera: mismo criterio aplicado por consistencia, riesgo de filtración mucho menor

A diferencia de Proyección financiera, `calcHealthScore()` nunca muestra el monto de `patrimonio` en pesos — solo lo usa como gate booleano (`tieneAlgo`) y en un ratio deuda-TC/patrimonio que solo aplica cuando hay deuda de TC y cero ingresos registrados en el mes. El riesgo real de que un depósito a la alcancía se note acá es bajo (en el peor caso cambia un tip o unos pocos puntos de score, nunca un monto exacto). Se corrigió de todas formas, restando `S.alcancia.saldoRegistrado` de `patrimonio` igual que en Proyección financiera, para mantener el mismo principio en toda la app: mientras la alcancía esté tapada, no debe influir en nada visible al usuario, ni siquiera indirectamente.

Validado con `node --check`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-26) — Patrimonio visible (hero de Inicio) y "CDTs Nu" se veían en $0 con datos reales de sobra: una fecha de CDT sin cero adelante rompía `calcCDT()` en silencio

*(reportado por el usuario: "Patrimonio visible $0" en el hero de Inicio, con "Disponible", "Nu libre", "Efectivo" y "Prestado" mostrando montos reales al lado; "CDTs Nu" también en $0 pese a tener un CDT activo de $2.000.000)*

Diagnóstico: descartado primero el sospechoso obvio — el mismo patrón de módulos lazy sin cargar que causó el bug de `snapshotPatrimonio()` del 2026-08-26 (ver arriba) — corriendo `typeof calcC/calcCDT/getDeudorSaldoPatrimonio/totalMisDeudasPendiente` en consola: los cuatro daban `"function"` (todo ya cargado), y forzar `refresh()` a mano no cambió nada, descartando timing/carrera. Causa real, encontrada al revisar el backup real del usuario: el CDT "CDTS" tenía `vence:"2026-9-26"` (mes sin cero adelante) en vez de `"2026-09-26"`. `calcCDT()` arma la fecha con `new Date(cdt.vence+'T00:00:00')` — sin el sufijo de hora el parser de fechas de JS es permisivo con un mes de un solo dígito, pero *con* él exige ISO 8601 estricto y devuelve `Invalid Date`. Esa `Invalid Date` se propaga como `NaN` a través de toda la aritmética de días/interés (`dias`, `ganado_bruto_exacto`, `val`) sin tirar ninguna excepción en ningún punto. `cdts` en `refresh()` termina en `NaN`, y de ahí `_patrimonioVisible = disp+prest+cdts-deudaTCTotal-_cpAjenoHero` también da `NaN`. Como `fmt()`/`fmtNoCents()` hacen `n||0` (y `NaN` es *falsy* en JS), el `NaN` se mostró como "$0" tanto en `heroTotal` como en `s-cdt` — indistinguible de un valor real de cero, sin ningún rastro en consola.

Efecto secundario encontrado de yapa, mismo origen: `verificarVencimientosCDT()` usa el mismo patrón para decidir si un CDT ya venció (`new Date()>=vence`) — con `vence` en `Invalid Date`, esa comparación es siempre `false` (cualquier comparación con `NaN` lo es), así que este CDT, aunque vencía exactamente ese día, nunca entraba a la cola de "cobrar CDT" ni se marcaba como vencido en su tarjeta (mismo patrón en el cálculo de "días restantes" del listado de Cuentas).

Por la UI normal esto no puede pasar — el `<input type="date">` del sheet de crear/editar CDT siempre devuelve `YYYY-MM-DD` con ceros a la izquierda. La fecha llegó rota por una edición manual de datos fuera de la app (consola de Firebase). Se corrigió igual de raíz porque el patrón `new Date(str+'T00:00:00')` aparecía repetido **14 veces** entre `core-state.js` y `cuentas.js`, todas con la misma fragilidad ante cualquier fuente futura de una fecha sin padear (import, script, u otra edición manual).

**Fix, dos capas:**
- **Cierre de raíz:** nuevo helper `_fechaSafe(fechaStr)` en `core-state.js` — parsea el string partiéndolo a mano (`split('-').map(Number)`) y arma el `Date` por componentes en vez de confiar en el parser de strings de JS, inmune a la falta de padding. Reemplazó los 14 usos de `new Date(str+'T00:00:00')`: en `core-state.js` (`nivelAntiguedadMovimiento()`) y en `cuentas.js` (`_diasEntreFechas()` — la usa `calcC()` para intereses de cajitas —, `calcCDT()`, `calcRendimientoCDTMes()`, `verificarVencimientosCDT()`, `calcMetaProgreso()`, `_updateMetaCuotaPreview()`, el badge "vencido"/días-restantes de la tarjeta de CDT, y el preview + la validación al crear un CDT nuevo).
- **Red de seguridad:** `refresh()` ahora hace `console.error` con el desglose (`disp`, `prest`, `cdts`, `deudaTCTotal`, `_cpAjenoHero`) si `_patrimonioVisible` da `NaN`, antes de pintarlo; `snapshotPatrimonio()` hace lo mismo si `calcPatrimonioTotal()` da `NaN`/`null` (antes salía en silencio total, sin grabar el punto y sin ningún rastro). No arregla la causa, pero evita perder otra sesión entera diagnosticando a ciegas si algo similar vuelve a colarse por otra vía.

Validado con el CDT real del backup del usuario (`monto:2000000, tasa:9.5, rte:4, inicio:'2026-08-05', vence:'2026-9-26'`): confirmado que `new Date('2026-9-26T00:00:00')` da `Invalid Date`; con el fix, `calcCDT()` da `{val:2024985.44, ganado:24985.44, dias:52}`. `node --check` sin errores en los dos archivos. **Pendiente:** confirmar en el navegador real que `verificarVencimientosCDT()` ahora sí detecta el CDT como vencido y abre el sheet de cobro al cargar la app; y corregir el dato ya guardado en Firebase (`vence:"2026-9-26"` → `"2026-09-26"`), a mano o reabriendo el sheet de editar el CDT (el date picker lo va a guardar bien padeado solo).

---

## Arranque

### ✅ Cambiado (2026-09-20) — Firebase Auth ya no carga el iframe ni gapi en el arranque normal (`initializeAuth` sin `popupRedirectResolver` + marca `mf_auth_hint`)

Con `getAuth()` el SDK arranca con `popupRedirectResolver` y, en CADA carga —aunque el usuario ya tenga sesión y nunca vaya a abrir un popup—, baja `auth/iframe.js` (~93 KiB, caché de 30 min, no controlable desde acá), `apis.google.com` (gapi, ~144 KiB y ~250 ms de CPU) y pide `getProjectConfig`. Esa es la cadena `iframe.js → getProjectConfig` del camino crítico ya documentada en `auditoria-tecnica.md` (punto 4, "el iframe de Firebase Auth domina el camino crítico") y casi la mitad de los 251 KiB de "cache lifetimes" de la corrida previa.

Cambio:
- `firebase-init.js`: `getAuth(app)` → `initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence], … })` (misma persistencia y mismo orden que trae `getAuth()`). El `popupRedirectResolver` se pasa SOLO si no hay marca de sesión previa.
- Marca `mf_auth_hint` en `localStorage`: `_onAuthState()` la pone en `'1'` cuando hay usuario y la borra cuando no. Lleva prefijo `mf_`, así que `_limpiarStorageLocal()` (eliminar cuenta) también la borra. Si `localStorage` falla, se cae al camino completo (con resolver = comportamiento anterior).
- `window._fb.popupResolver` (nuevo) = `browserPopupRedirectResolver`. En `firebase-sync.js`, `_fbSignIn()` y `_fbDeleteAccount()` (rama `reauthenticateWithPopup`) lo pasan como tercer argumento. Sin resolver por defecto, un `signInWithPopup`/`reauthenticateWithPopup` sin ese argumento lanza `auth/argument-error`.

**Por qué NO se quitó el resolver para todos:** en Safari/iOS un popup que se abre después de un `await` (esperar la carga del iframe) puede ser bloqueado. Sin marca (primera visita, sesión cerrada, cuenta eliminada) el resolver se precarga igual que antes, así que el login conserva su comportamiento. Los tres caminos de salida (`_fbSignOut`, `_fbDeleteAccount` y `_pinOlvide` de `pin-bio.js`) terminan en `location.reload()` con la marca ya borrada por `_onAuthState(null)`, y la carga siguiente vuelve al camino con resolver. `pin-bio.js` no usa popups (solo `signOut`): revisado, sin cambios.

**Relación con el bug de datos pisados (2026-09-19, más abajo):** este cambio no toca `_dataLoaded`, `_fbUser`, `_finishFirstLoad` ni ningún guardado. Los logs `[Sync] snapshot/carga` de la prueba en navegador real muestran el camino sano: `fromCache=true → applied confiable=true` y luego `fromCache=false → applied confiable=true`, mismo `updatedAt`, 38 claves.

**Confirmado en navegador real (usuario, 2026-09-20):** login con popup OK, carga de datos OK, y en Lighthouse ya no aparecen `auth/iframe`, `apis.google.com` ni `getProjectConfig` (ni en el árbol de red ni en terceros). `node --check` sin errores en ambos archivos.

**Pendiente:** probar el login en Safari/iPhone. Y el caso raro de marca vieja (sesión revocada con la marca puesta): el primer clic en "Entrar con Google" carga el iframe y en Safari podría salir el aviso de popup bloqueado; el segundo clic funciona.

Avisos de consola que NO vienen de este cambio: `Cross-Origin-Opener-Policy policy would block the window.closed call` (`popup.ts`) es un aviso conocido del SDK con los popups de Google y no bloquea el login; los errores de `content.js`/`content-scripts.js` (`Extension context invalidated`, `sendMessage`) son de una extensión del navegador.

### ✅ Cambiado (2026-09-20) — `preconnect`: quitados `firebaseapp.com` y `apis.google.com`; `fonts.googleapis.com` sin `crossorigin`

- `crossorigin` en un `preconnect` abre una conexión "anónima" (modo CORS: fuentes, módulos, `fetch`). Un `<link rel="stylesheet">`, un iframe o un `<script>` clásico usan la conexión con credenciales, así que la anónima queda sin usar. Eso explica los "Unused preconnect" de `fonts.googleapis.com` (solo sirve el CSS), `mis-finanzas-z.firebaseapp.com` (iframe) y `apis.google.com` (gapi). `fonts.gstatic.com`, `www.gstatic.com`, `firestore.googleapis.com` e `identitytoolkit.googleapis.com` sí se piden en modo CORS y conservan `crossorigin`.
- Los dos de Auth se sacaron (ya no se usan en el arranque normal, ver entrada anterior): quedan **5** preconnect (eran 7). Si algún día se vuelve a `getAuth()` o a un resolver siempre cargado, volver a agregarlos SIN `crossorigin`.
- Resultado: en las 6 corridas posteriores, 3 sin ninguna marca y 3 con una distinta cada vez (`fonts.googleapis.com`; `firestore.googleapis.com` en la corrida detenida en el PIN, donde Firestore todavía no se usa; `identitytoolkit.googleapis.com`). Sigue siendo una señal ruidosa, como ya se anotó el 2026-08-19: no vale la pena perseguirla por un solo reporte. Comentarios HTML de `index.html` balanceados (255/255); CSP sin cambios.

### 🔍 Medido (2026-09-20) — Lighthouse antes y después del cambio de Auth y del arreglo de "Necesita atención"

| Etapa | Perf | LCP | TBT | CLS | Notas |
|---|---|---|---|---|---|
| Antes (misma mañana) | 46 | 6,1 s | 1.120 ms | 0,144 (`div.grid3`) | iframe 93 KiB + gapi 144 KiB en terceros; camino crítico 3.356 ms; caché 251 KiB |
| Tras el cambio de Auth (3 corridas) | 71 (PIN activo) / 70 / 70 | 4,6 / 2,9 / 4,7 s | 420 / 660 / 430 ms | 0,001 / 0,145 (`div.grid3`) / 0,001 | sin iframe ni gapi; camino crítico 1.293–2.233 ms (una corrida con un canal `Listen` de 33 s por long-polling, artefacto de esa corrida) |
| Tras el arreglo de "Necesita atención" (3 corridas) | 50 / 62 / 65 | 4,6 / 4,7 / 4,7 s | 780 / 710 / 610 ms | 0,248 (`health-score-card` 0,236 + `grid2` 0,012) / 0,012 / 0,012 | `div.grid3` ya no aparece en ninguna |

Lectura:
- **Sin PIN (app completa cargada): de 46–51 (4 corridas, mediana 48,5) a 50–70 (5 corridas, mediana 65).** La corrida detenida en la pantalla del PIN solo mide esa pantalla y no es comparable: 71 ahora, 64 y 77 el 2026-08-19, o sea sin cambio. Lo único que cambió entre la corrida de 46 y las siguientes es lo de Auth y `preconnect`, así que es lo más probable detrás del salto (acortó el camino crítico y sacó ~240 KiB de terceros), aunque no se pueden aislar los dos efectos.
- **TBT 430–780 ms en las 6 corridas**, sin ningún cambio de código que lo explique; los archivos que aparecen en las tareas largas son los mismos antes y después (el propio HTML, `inicio.js`, `encargos.js`, `cuentas.js`, `mejoras-adicionales.js`). Las tres corridas del segundo lote traen además el aviso "the page loaded too slowly". Se trata como ruido: para comparar conviene la mediana de 5 corridas.
- **"Agentic Browsing"** (sin nota 0–100, es una fracción de checks) dio 1/2 solo en las corridas con CLS > 0,1 y 2/2 en el resto, en las 6.
- **LCP ~4,6 s y TBT** son lo que queda (≈ 17 y 15 puntos). El LCP depende de la cadena Auth → Firestore ya diagnosticada (ver `auditoria-tecnica.md`).

### ✅ Corregido — La nube se pisaba con el estado por defecto tras borrar el storage del navegador

*(2026-09-19)*

Con la caché local de Firestore vacía o inconsistente (por ejemplo tras "Clear site data" con la app abierta), el listener de `onSnapshot` puede decir "sin documento" — incluso con `fromCache=false`, o sea, aparentemente confirmado por el servidor — para un documento que SÍ existe. `_finishFirstLoad()` lo tomaba como carga válida: marcaba `_dataLoaded = true` con `S` todavía por defecto y el siguiente guardado (`setDoc` sin `merge`, que reemplaza el documento completo y, una vez encolado en el SDK, no se cancela) pisaba la nube.

Escenario concreto: borrar el storage con la app abierta, volver a iniciar sesión (los datos se ven porque `S` seguía en memoria), recargar y encontrar la nube vacía. Reproducido con logs: `fromCache=false exists=false` mientras Firebase Console mostraba el documento con datos.

Fix (`firebase-sync.js` y `firebase-init.js`):
- `_applyCloudData()` devuelve qué pasó (`applied` / `empty` / `nodoc` / `parse-error`). `_cargaConfiable()` solo da por bueno un payload leído bien.
- "Sin documento" y "payload vacío" nunca se creen tal cual: se verifican con una lectura directa al servidor (`runTransaction` de solo lectura, sin pasar por la caché ni el listener). Si el documento existe, se aplican sus datos; si no existe, es un usuario nuevo y se habilita el guardado; si no se pudo verificar, la app queda en modo lectura.
- `_finishFirstLoad(confiable)`: en modo lectura `_dataLoaded` queda en `false`, así `_fbSaveToCloud()` responde `not-loaded`. Aviso al usuario tras 8 s sin confirmación, o de inmediato si el listener falla.
- `_fbSignOut` ya no hace su `setDoc` final si `_dataLoaded` es `false`.
- `firebase-init.js` expone `runTransaction` en `window._fb`.
- Logs de diagnóstico `[Sync] snapshot: ...` y `[Sync] carga: ...` (tipo de evento, `fromCache`, estado y confianza) para poder ver en consola qué llegó en cada arranque.

**Pendiente, fuera de esta corrección:**
- Con la caché sin el documento, la app pinta un instante sin datos hasta que termina la verificación (~1 s).
- Si el listener muere por error, la app queda en modo lectura hasta recargar; no hay reintento automático.
- Lo que se cargue en pantalla durante el modo lectura no se guarda.
- `_onAuthState(null)` no limpia `window._fbUser` ni `_dataLoaded`.
- Si un dispositivo abre con una caché más vieja que la nube y el servidor tarda más de 1,5 s en responder, el guardado automático del snapshot diario de patrimonio (`_finishFirstLoad`) puede escribir datos viejos encima. No es nuevo; no se probó.

---

## Encargos

### ✅ Corregido — "Registrar salida" dejaba sacar plata ya comprometida en una parte

Las partes comprometidas (`enc.partes`, "¿Para qué es esta plata?") ya calculaban y mostraban un "Libre" en la sección de partes, pero ese número era solo informativo: el sheet de "Registrar salida" (`abrirMovEncargo`/`confirmarMovEncargo`) seguía validando contra `encargoSaldo(enc)` (el saldo total), sin descontar lo comprometido. Resultado: si tenías, por ejemplo, $200.000 comprometidos para el arriendo, igual podías sacar esos $200.000 por "Registrar salida" como si estuvieran libres — la parte comprometida se quedaba sin respaldo real.

Fix inicial: nuevos helpers `encargoComprometido(enc)` (suma de partes sin usar) y `encargoLibre(enc)` (saldo menos eso, nunca negativo). `abrirMovEncargo` bloquea o limita la salida al disponible real, mostrando en el sheet cuánto hay comprometido cuando aplica; `confirmarMovEncargo` valida contra `encargoLibre()` en vez de `encargoSaldo()` tanto en modo simple como en split.

Extensión — mismo criterio en **todos** los lugares donde se muestra o se saca plata de un encargo, no solo en "Registrar salida":
- **Lista de encargos** y **hero del detalle**: ahora muestran `encargoLibre()` como el número principal (antes mostraban el saldo total, que incluía plata ya comprometida). Cuando hay algo comprometido, aparece un subtexto tipo "de $500.000, $200.000 comprometido".
- **Traspaso de sobrante** (`abrirTraspasoEncargo`/`confirmarTraspasoEncargo`): valida contra `encargoLibre()` — un "sobrante" por definición no puede incluir plata que ya tiene destino asignado.
- **Compra con TC del encargo** (`abrirCompraConTC`/`confirmarCompraConTC`): mismo cambio — no se puede pagar una compra con plata ya comprometida para otra cosa.
- **Mover entre cuentas** se dejó **sin cambios** a propósito: no saca plata del encargo, solo la reubica físicamente entre cuentas propias, así que lo comprometido no debería bloquearlo.
- **`usarParte`/`_confirmarUsarParte`** (marcar una parte como "ya la usé") también se dejó sin cambios: es la vía diseñada para gastar justamente esa plata comprometida, así que sigue validando contra el saldo físico real en la cuenta elegida, no contra `encargoLibre()` — no tendría sentido bloquear la única forma de liberar el compromiso.

Pendiente fuera de este archivo: el cruce con Préstamos ("pagar una deuda con plata de un encargo") vive en el módulo de deudores, no en `encargos.js`, y no se tocó — si ese flujo también debe respetar lo comprometido, hay que revisarlo por separado ahí.

### ✅ Corregido — El cruce con Préstamos ("pagar una deuda con plata de un encargo") también dejaba usar plata comprometida

Mismo problema que el de arriba, pero en `prestado.js`: el toggle "¿Viene de un encargo?" en el sheet de abono de una deuda validaba y mostraba el saldo total del encargo (`encargoSaldo`), sin descontar las partes comprometidas. Un encargo con plata ya apartada para otra cosa igual aparecía como "disponible" completo en el selector, dejaba pagar la deuda con esa plata, y hasta se ofrecía como opción cuando su único saldo era 100% comprometido.

Fix: mismo criterio que en `encargos.js` — todo lo que antes usaba `encargoSaldo(enc)` para decidir "cuánto hay disponible" ahora usa `encargoLibre(enc)` (definida en `encargos.js`, ya disponible globalmente): el filtro de qué encargos ofrecer como origen del abono, los montos que se muestran junto a cada encargo en el selector, la validación del monto (abono solo, y abono + extra), y el preview cuando no se elige una cuenta específica del encargo. Las validaciones por cuenta física (`_getEncargoSaldoEnCuenta`/`_getEncargoSaldoSinCuenta`) se dejaron igual, por la misma razón que en Encargos: lo comprometido no está ligado a una cuenta específica, así que no tiene sentido restringir ahí.

### 🔧 Ajustado (2026-09-01) — `opsPosteriores` de la protección por antigüedad ahora cuenta contra el encargo completo, no solo contra `mov.cuenta`

Detectado al revisar a fondo la protección por antigüedad de movimientos (ver `CHANGELOG.md#mesada`, "Protección por antigüedad se activaba en pagos 'Sin especificar'..."): `deleteMovEncargo()` calculaba `opsPosteriores` filtrando solo movimientos del encargo con `m.cuenta === mov.cuenta`. Esto seguía el criterio literal del doc (§4: "cuántos movimientos más ha tenido esa misma cuenta destino"), pero subestimaba la mezcla real en un encargo con plata repartida en varias cuentas (o movimientos sin cuenta asignada): un movimiento viejo podía tener muy pocas "operaciones posteriores en su misma cuenta" contadas, aunque el encargo en conjunto ya tuviera muchas más operaciones nuevas encima — dejándolo pasar como "reciente" por el criterio de operaciones cuando, en espíritu, ya estaba bastante mezclado con el resto del encargo.

Ajustado a propósito (decisión de diseño, no bug): ahora cuenta cualquier movimiento posterior del mismo encargo, sin filtrar por `mov.cuenta` — más conservador, protege más. El criterio de fecha (90 días/1 año) no cambió. Actualizado también `proteccion-antiguedad-movimientos.md` §4 con la excepción explícita para Encargos.

No afecta el texto del diálogo de aviso (`deleteMovEncargo`) — ya estaba redactado de forma genérica ("mezclado con operaciones más recientes de este encargo"), sin asumir una cuenta específica.

Validado con `node --check`.

### 🔧 Ajustado (2026-09-02) — Copy del sheet "Pagarle a otro encargo" generalizado (título, descripción, labels, placeholder, desc por defecto)

El sheet de transferencia entre encargos (`transferencia-encargo` / `confirmarTransferenciaEncargo`) daba por sentado que el movimiento siempre era el pago de una deuda ("Pagarle a otro encargo", "¿A cuál encargo le pagaste?", "¿Cuánto le pagaste?"), cuando en realidad puede ser eso, un regalo, o la devolución de un favor. Primera corrección de redacción también asumía por error que la deuda/regalo/favor era entre Sebas y las personas involucradas ("porque le debías... porque se lo regalaste... te hizo un favor"), cuando en realidad Sebas es solo el intermediario que mueve plata ajena entre los dos encargos — la relación (deuda/regalo/favor) es entre los dueños de esos encargos, no con él.

Cambios de texto en `index.html` (sin tocar lógica): título → "Pasarle plata a otro encargo"; descripción reescrita en tercera persona ("puede ser porque uno le debía al otro, porque quiso regalarle esta plata, o porque le hizo un favor y esto es la devuelta — vos solo sos el intermediario"); label del select destino → "¿A cuál encargo se la diste?"; label del monto → "¿Cuánto le diste?"; placeholder de descripción → "Ej: le debía, fue un regalo, fue por un favor...". En `encargos.js`, el valor por defecto de la descripción (`transfenc_desc`) pasó de "Pago a nombre de X" a "Plata para X", igual de neutral respecto al motivo.

No se tocó la lógica de `confirmarTransferenciaEncargo()` ni los campos guardados (`desc`, `nota: 'Transferencia a otro encargo'`/`'Transferencia de otro encargo'`), que ya eran genéricos. Validado con `node --check`. **Sin verificar en navegador real.**

## Wrapped (módulo nuevo)

### 🐛 Corregido (2026-09-16) — Un registro suelto de meses atrás podía ganar "mejor mes del año"

Reportado con un caso real: cuenta que empezó a usarse en septiembre, con un solo registro cargado de memoria de meses antes (mesada de enero, sin ningún otro movimiento ese mes). Ese enero pasaba como mes "real" en `_wrappedMejorPeorMesAnio`/`_wrappedHistoriasMensuales` (único filtro: `totalIngresos > 0 || totalGastos > 0`) — con ingreso y cero gastos registrados, salía con el mejor balance del año por default, y con una frase de "mes tranquilo" que en realidad describía un vacío de datos.

Nueva función `_wrappedInicioRachaReal(S, anioK, mesMax)`: encuentra el principio de la racha real de meses activos caminando hacia atrás desde el mes más reciente, cortando en el primer hueco de 2+ meses sin ningún ingreso/gasto (2, no 1, para no borrar un mes real flojo que caiga en medio de un historial real). `_wrappedMejorPeorMesAnio` y `_wrappedHistoriasMensuales` ahora arrancan su loop ahí en vez de en enero. No toca ningún total anual — el ingreso de enero sigue contando en los agregados del año completo, solo se saca de las comparaciones por mes. Verificado con dos casos simulados (el reportado + un control de "un solo mes flojo real" para confirmar que no se pierde historial legítimo) antes de tocar el archivo real. `_wrappedFasesAnio` y `_wrappedCambioDeHabitos` se revisaron y ya estaban a salvo de este mismo problema por otros motivos (ver `wrapped.md` §7terdecies para el detalle completo).

### ✨ Agregado (2026-09-15) — Ventana de disponibilidad (solo enero, año recién cerrado) + destacado en "Más" + banner de aviso

Resuelve la decisión que había quedado abierta en `wrapped.md` §7decies ("año en curso vs. año recién cerrado"): hasta ahora Wrapped estaba disponible los 12 meses del año mostrando el año EN CURSO en vivo (opción 3, "por ahora"). Pasa a la opción 2 que ya estaba documentada ahí mismo: revelación de verdad, del año recién cerrado, solo durante una ventana corta en enero — el resto del año, la pantalla no existe.

**Nuevo:** `js/core/wrapped-gate.js` — núcleo eager y chico, aparte de `wrapped.js` a propósito (así no hace falta bajar ~4000 líneas del módulo real solo para saber si mostrarlo). Un solo punto de verdad (`_wrappedVentana()`) decide, a partir de `hoy()`:
- si la ventana está abierta (1-31 de enero, `WRAPPED_VENTANA_DIAS`, un solo número para ajustar);
- el año objetivo (siempre `anioActual - 1`, nunca el año en curso en vivo);
- días restantes y fecha de cierre, para los textos de urgencia.

Expone `window._wrappedDisponible()`/`window._wrappedAnioObjetivo()`, consumidos por `lazy-loader.js` y `wrapped.js` (ver abajo). `?wrappedForzar=1` en la URL fuerza la ventana abierta para poder probar/hacer una demo sin esperar a enero — mismo espíritu que `?debug=1` en `wrapped.js`, decisión aparte (acá se decide si el módulo existe, allá qué tan detallado se ve).

**No gastar recursos fuera de la ventana:**
- `js/core/lazy-loader.js`: `ensureAll()` (precarga en segundo plano de todos los grupos lazy) ya no incluye `'wrapped'` salvo que `_wrappedDisponible()` confirme que la ventana está abierta. Guard `typeof` con fallback a "no disponible" si el gate no cargó (fallar cerrado).
- `index.html`: `#cfg-wrapped-row` (fila "Más → Tu resumen") arranca con `display:none` en el propio HTML — fail-closed — y `wrapped-gate.js` la muestra/oculta según la ventana. Sin esa fila visible, no hay ningún camino para que el usuario dispare `Loader.ensure('wrapped')` fuera de enero.
- `wrapped.js`: `window.renderWrapped()` agrega un cinturón de seguridad (no la gate real) que redirige a Configuración con un toast si se llega hasta ahí fuera de la ventana — cubre deep links viejos o `showScreen('wrapped')` a mano desde la consola, no el flujo normal.

**Ya no es "un módulo más del montón":** ver la corrección de ubicación más abajo — terminó siendo una tarjeta propia (`#wrapped-promo`) arriba de todo en Configuración, no una fila destacada dentro de la lista.

**Aviso proactivo:** `wrapped-gate.js` arma un banner flotante (`#wrapped-banner`, JS puro, mismo patrón que `#toast-container`/`#wrapped-overlay` — no vive en el HTML hasta que hace falta) con el título, los días restantes y un botón "Ver mi resumen →" que llama a `showScreen('wrapped')`. Se dispara una sola vez por año objetivo (flag en `localStorage`, `mf_wrapped_banner_visto_<año>` — UI, no un dato financiero nuevo en `S`), 1.5s después de `appDataLoaded` para no competir con el toast de bienvenida. Si el usuario ya abrió Wrapped por su cuenta desde el menú (`renderWrapped()` marca `mf_wrapped_visto_<año>`), el banner tampoco insiste.

**Corrección sobre la marcha (2026-09-16), ubicación y identidad visual.** Hicieron falta tres intentos:

1. Fila destacada dentro de la lista de "Herramientas" (`.cfg-toggle-destacado`: fondo tintado, badge, glow). Se veía como un parche.
2. Ajustar el espaciado de esa fila (`padding` + margen horizontal negativo, porque `.cfg-toggle` en `styles.css` es `padding:15px 0`, sin padding horizontal). Tapaba el síntoma: una fila de lista pintada de colores no se lee como algo especial por bien espaciada que esté.
3. Tarjeta propia `#wrapped-promo` **arriba del todo en Configuración, incluso sobre "Cuenta"** — lo primero que se ve al entrar, durante el único mes del año en que existe.

La primera versión de esa tarjeta se montó sobre `.hero`, pero quedaba idéntica al hero del patrimonio (mismo verde, misma forma). La versión final toma la identidad del **propio Wrapped**: fondo oscuro (`--bg2`) con blobs de color desenfocados (`.wp-blob`, versión en miniatura de `.wrapped-bg-blob` de `wrapped.js` — blur 34px acá vs. 64px allá) y la tira de segmentos de progreso (`.wp-segs`, el motivo de "stories" de `#wrapped-progress`). Los colores no son paleta nueva: son las mismas variables que Wrapped rota como `--wrapped-mood` (`--accent`/`--amber`/`--blue`/`--purple`, ver `wrapped.js:3567`). El año va en `--nu-light`→`--purple` degradado sobre el texto; el botón en `--text` sobre oscuro, no verde, para no volver a chocar con el hero.

El banner recibió el mismo tratamiento, así banner y tarjeta se leen como la misma pieza: blobs, la misma tira de segmentos en lugar del ícono decorativo (una estrellita se veía infantil, y sin nada el bloque quedaba vacío — los segmentos dicen "esto es un carrusel de historias" sin decorar), botón en `--text` y un botón "Después" que cierra **sin** marcar visto (la X sí lo marca para todo el año).

Eliminado en el proceso: `.cfg-toggle-destacado`, `.cfg-badge-nuevo`, el keyframe `wrappedGlow`, la fila `#cfg-wrapped-row` con sus ids, y el `<i class="fa-solid fa-star">` del banner. `_wrappedGateAplicarFila()` apunta ahora a `#wrapped-promo` y rellena `#wrapped-promo-anio`/`#wrapped-promo-dias`. Se mantienen el `display:none` en el HTML (fail-closed) y el handler genérico `config:irA`.

**Dos bugs reales encontrados al renderizar con Chromium** (no con `wkhtmltoimage`, que no soporta `filter:blur()` y daba blobs cuadrados — conviene usar Chromium para verificar esto a futuro):
- `#wrapped-banner > *:not(.wp-blob){position:relative}` le pisaba el `position:absolute` a `#wrapped-banner-close`, mandando la X al flujo normal (arriba a la izquierda, encima de los segmentos). Corregido excluyéndolo del `:not()` y dándole `z-index:2`; además `.wp-segs` dentro del banner lleva `margin-right:26px` para no correr por debajo de la X.
- `.wp-anio` era un bloque de ancho completo, y con `background-clip:text` el degradado se reparte sobre la **caja**, no sobre las letras: el tramo morado caía en el espacio vacío a la derecha del año y solo se veía verde→naranja. Corregido con `display:inline-block`.

**Nota aparte, emojis:** el título del banner y el toast del cinturón de seguridad en `renderWrapped()` habían quedado con emojis Unicode (`🎉`/`🎁`) — mismo problema ya barrido en `index.html`/`encargos.js` el 2026-08-19 (ver esa entrada más abajo). Corregidos antes de llegar a producción: el toast quedó en texto plano (los `toast()` de esta app nunca llevan íconos) y el título del banner pasó primero a `fa-star` y finalmente a la tira de segmentos descrita arriba, sin ícono.

**Resuelto de paso, el mismo punto de `_wrappedBuildSlides`:** `anioK` ya no sale de `_wrappedHoy().slice(0,4)` (siempre el año en curso) sino de `window._wrappedAnioObjetivo()`. No hizo falta tocar nada más del cálculo — `mesMax` (`_wrappedAnioYMesActual`) ya distinguía correctamente `anioK === anioActual` vs. un año pasado desde antes; con el nuevo `anioK` siempre siendo el año pasado, esa rama simplemente pasa a usarse siempre (12 meses completos), sin cambios de código.

Validado con `node --check` en los tres archivos tocados/nuevos (`wrapped-gate.js`, `lazy-loader.js`, `wrapped.js`). **No probado en navegador real** — no se pudo confirmar en vivo el ciclo `appDataLoaded` → banner → click → `showScreen('wrapped')`, ni el aspecto visual del destacado/banner, porque reproducirlo fielmente requeriría el resto de `core-state.js`/`bootstrap.js`/`sheet-stack.js`, que no forman parte de esta sesión. Pendiente confirmar en un dispositivo real cuando llegue enero (o con `?wrappedForzar=1` antes).

Fuera de alcance a propósito, quedó afuera de esta sesión: exportar/descargar el resumen como imagen o texto (el usuario lo mencionó como idea suelta, "no sé pero...") — agregarlo bien (captura del carrusel a imagen, o un resumen textual compartible) es una pieza de diseño e implementación aparte, no una extensión de una línea sobre lo de acá. Queda anotado como pendiente, no como decisión tomada.

### 🔧 Cambio (2026-09-08) — Se saca la vista mensual, Wrapped pasa a ser solo anual

Después del rediseño a "experiencia de revelación" (ver el cambio inmediatamente debajo), la vista mensual seguía sin encontrar su lugar: aun sin ingresos/gastos crudos, mostrar top-categoría-del-mes competía de lleno con "Top categorías" de Análisis financiero, y verla cada mes le quitaba a Wrapped la sensación de sorpresa que es la razón de que exista — un wrapped que aparece todos los meses deja de sentirse como un wrapped.

Se sacó por completo: las pestañas "Este mes"/"Este año", `_wrappedRenderMes()`, `wrappedVerMes()`/`wrappedVerAnio()`, la variable de estado `_wrappedTab`, y el `Events.registerAll('wrapped', ...)` (ya no hace falta, la pantalla no tiene ninguna interacción — es de solo lectura). `screen-wrapped` en `index.html` quedó reducido a un único `<div id="wrapped-body">`. Se agregó un mensaje neutro de fallback para cuando no hay absolutamente nada que mostrar (usuario nuevo, día 1).

Ver `wrapped.md` §7 para el razonamiento completo (por qué anual sí y mensual no, y por qué la alternativa de recortar Análisis financiero en su lugar no tenía sentido — Análisis existe justamente para ser la vista completa y chequeable).

Validado con `node --check` y jsdom: confirmado que `window.wrappedVerMes`/`wrappedVerAnio` ya no existen, que `renderWrapped()` funciona sin ningún elemento de pestaña en el DOM, y que `Events.registerAll` nunca se invoca (se hizo explotar el mock a propósito en el test para confirmarlo).

### 🔧 Cambio (2026-09-08) — Rediseño: de dashboard checkeable a experiencia de revelación animada

La primera versión de Wrapped terminó siendo, sin querer, un mini-Análisis financiero: filas planas de "Ingresos reales / Gastos reales / Tasa de ahorro" para mes y año. El punto de Wrapped es justo lo contrario — una sorpresa tipo Spotify Wrapped que se "vive" al abrirla, no un número que se chequea a diario (para eso ya existe Análisis financiero). Se rediseñaron ambas vistas:

- **Se eliminaron** todas las filas de ingresos/gastos/tasa de ahorro en crudo, en ambas vistas (mes y año). Esos números se siguen calculando internamente (hace falta el balance para rankear "mejor/peor mes"), pero nunca se pintan directamente.
- **Se agregó** un gráfico de línea animado (SVG, sin librerías) para la vista "Este año": un punto de patrimonio por mes desde el primer mes con dato real hasta el mes actual, coloreado según si terminó arriba (verde) o abajo (rojo) de donde empezó. La línea se "dibuja" con la técnica estándar de `stroke-dasharray`/`stroke-dashoffset`, animada en JS después de insertar el HTML en el DOM (necesita medir el `<path>` ya renderizado con `getTotalLength()`). Los puntos aparecen en cascada con un `animation-delay` escalonado por punto.
- **Se agregaron** dos "datos curiosos" nuevos que no existían: gasto más grande del período (mes y año), y se reformularon los existentes (top categoría, mejor/peor mes, total en Alcancía, racha) como tarjetas de "revelación" que aparecen en cascada con fade-up escalonado (`.wrapped-reveal`, keyframe nuevo en `index.html`), en vez de una lista estática de una sola vez.
- **Se agregaron** los keyframes `wrappedDotIn` / `wrappedFadeUp` y las clases `.wrapped-dot` / `.wrapped-reveal` al bloque de estilos de `index.html`, junto a los demás keyframes de la app (mismo patrón que `toastIn`/`pinShake`).
- La animación se dispara **cada vez que se abre la pantalla** (no solo la primera vez históricamente) — a propósito, para no tener que persistir un flag de "ya lo viste" en `S`. Ver `wrapped.md` §7 para el razonamiento completo.

De paso, se hizo `_wrappedCalcularPeriodo()` defensivo ante `S.pagosGastosFijos` llegando como objeto/mapa en vez de array (se encontró así en datos reales de producción, no solo hipotético — `Array.isArray()` + `Object.values()` como fallback).

Validado con `node --check` y una simulación jsdom contra un `melo.json` de prueba real: la serie mensual recorta correctamente hasta el primer mes con dato (mayo, no enero, porque no había datos anteriores), el gráfico no se genera con menos de 2 puntos, y ambas vistas confirmadas *sin* ningún rastro de "Ingresos reales"/"Tasa de ahorro" en el HTML resultante. **La animación en sí (la parte visual) no se pudo probar en un navegador real** — jsdom no implementa `getTotalLength()` de SVG, así que el código tiene un guard explícito para degradar sin romper en ese caso, pero el efecto visual de "dibujado" solo se puede confirmar abriendo la app de verdad.

### ✨ Agregado (2026-09-07) — Módulo nuevo: resumen "Wrapped" de mes/año

Nueva pantalla accesible desde Más → "Tu resumen", duodécimo grupo lazy (`js/core/lazy-loader.js`). Documentación completa en `wrapped.md` (nuevo). Resumen ejecutivo de lo tocado, para quien solo busque el detalle técnico del wiring:

- **`js/modules/wrapped.js` (nuevo):** todo el módulo — cálculo puro de gasto/ingreso real del mes o año (reutilizando `_esGastoVarNoReal`/`_esEntradaEspejoNoIngreso`), mejor/peor mes del año, crecimiento de patrimonio anual (mismo criterio de `valorVisible`/`montoBase` que Análisis financiero §5), y render de las dos vistas (mes/año).
- **`js/core/lazy-loader.js`:** agregado el grupo `wrapped: ['js/modules/wrapped.js']`.
- **`js/core/sheet-stack.js`:** agregada la rama `if(name==='wrapped'){ renderWrapped(); }` en `showScreen()`, mismo patrón que `analisis` (a diferencia de Alcancía, que se integra parcheando `openSheet` desde su propio archivo — Wrapped no necesitaba ese patrón porque no tiene sheets propias).
- **`index.html`:** agregado el contenedor `#screen-wrapped` (entre Análisis y Personas) y el ítem `#mas-wrapped` en el menú Más (justo después de Análisis financiero).
- **`alcancia.js`:** expuestas `window._alcRachaAhorro` y `window._alcMejorCiclo` (antes solo locales al IIFE) para que Wrapped reutilice el cálculo de racha sin duplicarlo — sin cambiar su comportamiento interno en Alcancía.

A propósito no cubre Mesada, Spotify, Encargos ni Plata Comprometida — ver `wrapped.md` §7 para el razonamiento. No persiste ningún dato nuevo: todo se calcula en vivo en cada apertura, mismo principio de "una sola fuente de verdad" que ya sostiene el resto de la app.

Validado con `node --check` en los cuatro archivos JS tocados y una simulación jsdom de los cuatro cálculos puros (gasto/ingreso real de mes y de año, top categoría, alcancía del período, mejor/peor mes, crecimiento de patrimonio con descuento de `montoBase`, formateo de mes, y render de ambas vistas con y sin datos). **No probado en navegador real** — en particular, no se pudo confirmar en vivo el flujo completo `Loader.ensure('wrapped')` → `showScreen('wrapped')` → `renderWrapped()`, porque reproducirlo fielmente requeriría el resto de `core-state.js`/`bootstrap.js` que no forman parte de esta sesión.

### ✨ Agregado (2026-09-07) — "Wrapped" de progreso de ahorro entre ciclos

Hasta ahora, la comparación "vs. alcancía anterior" solo existía en el instante de destapar (la sheet de resultado) — una vez cerrada, esa información no se podía volver a ver sin recalcularla a mano desde el historial. Se agregó una tarjeta persistente ("Tu progreso ahorrando") en la pantalla principal de Alcancía, justo encima del historial de ciclos, visible en cualquier momento (haya o no una alcancía activa en curso) — no solo justo después de destapar.

Muestra un mini gráfico de barras (SVG inline, sin librerías) de los últimos hasta 6 ciclos por `saldoRegistrado`, la racha actual (cuántas alcancías seguidas, contando desde la más reciente, ahorraron más que la anterior) y el mejor ciclo histórico. Todo se recalcula en vivo desde `S.alcancia.historial` en cada `renderAlcancia()` — no se persiste ningún número nuevo aparte, mismo principio que el resto de la app (los registros ya guardados son la única fuente de verdad). La tarjeta no se muestra con menos de 2 ciclos destapados (no hay nada que comparar todavía).

Se centralizaron los cálculos en `_alcRachaAhorro()` y `_alcMejorCiclo()`, usados tanto por la tarjeta persistente como por el mensaje de racha agregado a la sheet de resultado del destape (que antes solo mostraba diferencia de monto y de días) — mismo criterio de "una sola fuente de verdad por cifra" que ya usa el resto del proyecto (ver `_esGastoVarNoReal`/`_esEntradaEspejoNoIngreso` en Análisis financiero).

Cambios en `alcancia.js` (`_alcRachaAhorro`, `_alcMejorCiclo`, `_alcWrappedBarrasSvg`, `_alcWrappedProgresoHtml`, conectadas en `renderAlcancia()` y en `alcanciaConfirmarDestapar()`) e `index.html` (contenedor `#alcancia-wrapped-progreso`). Documentado en `alcancia.md` §7/§8.

Validado con `node --check` y una simulación jsdom de las cuatro funciones nuevas (racha ascendente, racha cortada, menos de 2 ciclos, mejor ciclo, límite de 6 barras). **No probado en navegador real.**

### ✨ Agregado (2026-09-07) — El selector de cuenta de origen al depositar solo muestra cuentas con saldo utilizable

El selector "¿De qué cuenta sale?" (depósito simple) y "Lo tenía yo (efectivo)" (parte propia de un split) listaban todas las cuentas sin tarjetas de crédito, sin importar si tenían saldo suficiente — invitando a elegir una cuenta vacía y enterarse recién al ver el hint de saldo debajo. Se agregó `_alcFiltrarFuentesPorSaldo()`, que tras poblar el select con `buildFuentesOptsHtml()` (sin tocar esa función compartida con Mesada/Encargos/Préstamos) quita las opciones de cuentas con saldo ≤ $50 — umbral fijo para no listar cuentas técnicamente "con algo" pero inutilizables por redondeos. Si no queda ninguna cuenta con saldo, el placeholder cambia a "No tenés cuentas con saldo disponible" en vez de dejar una lista vacía sin explicación.

No se tocó el selector de destino del destape (`alc_destino`): ahí la plata entra a la cuenta, no sale, así que filtrar por saldo no aplica.

Validado con `node --check` y una simulación jsdom (cuentas con saldo variado, caso de "ninguna cuenta con saldo").

### 🔧 Cambio (2026-09-24) — Al destapar la alcancía, el historial de patrimonio deja de ocultarla hacia atrás (`alcanciaConfirmarDestapar()`)

*(pedido del usuario al ver que el 22 de septiembre la gráfica de Historial de patrimonio bajaba $5.190,84: era un depósito de $6.000 a la alcancía, restado de `valorVisible` mientras estaba oculta)*

Cada punto de `S.patrimonioHistorial` guarda `valor` (patrimonio real, con alcancía) y `valorVisible` (sin ella). Mientras la alcancía está tapada, la gráfica de Análisis, la Tendencia mensual y la Proyección leen `valorVisible`, así que cada depósito se ve como una caída y, al destapar, la plata aparece de golpe en una sola subida. Como al destapar esa plata deja de ser secreta, ahora `alcanciaConfirmarDestapar()` iguala `valorVisible = valor` en todos los puntos que lo tienen, justo después de resetear `saldoRegistrado`. Los depósitos pasan a verse en el día en que ocurrieron y no queda un salto el día del destape.

Aplica a todos los puntos porque todo lo oculto pertenece a la alcancía que se está destapando o a ciclos ya destapados. `valor`, `montoBase` y `fecha` no se tocan; los puntos sin `valorVisible` ya usaban `valor` como fallback. No hay cambio en el hero de Inicio, Salud financiera ni `calcPatrimonioTotal()`: al destapar, la plata ya está en la cuenta destino y `saldoRegistrado` queda en 0, así que sus valores actuales ya reflejaban el destape.

Verificado con `node --check` y una prueba jsdom sobre el backup del 2026-09-23: los 17 puntos tenían `valorVisible ≠ valor` antes y 0 después, con `valor`/`montoBase`/`fecha` intactos; sin el cambio, los 17 seguían distintos. Confirmación en navegador real pendiente.

### ✅ Agregado (2026-09-01) — Protección por antigüedad en `alcanciaEliminarDeposito` (no tenía ninguna)

Detectado al hacer una revisión general de la protección por antigüedad en todos los módulos (ver `CHANGELOG.md#mesada` y `CHANGELOG.md#encargos` para el origen). `alcanciaEliminarDeposito()` no tenía ningún chequeo de fecha ni de operaciones posteriores — cualquier depósito, sin importar la antigüedad, se borraba tras un simple "¿Seguro?". Y a diferencia de un ingreso neto-cero suelto, acá sí había algo real que proteger: un depósito `'yo-cuenta'` o la parte propia de un `'split'` con `_splitFuente` reingresan plata a una cuenta real vía `sumarFuente()`.

Fix: nueva protección que **siempre** aplica (no hay un "Sin especificar" análogo al de Mesada/Préstamos, porque `a.saldoRegistrado` es un total corrido que se ajusta incrementalmente en cada borrado — igual que `enc.movimientos` en Encargos o `tc.deuda` en Tarjetas — así que siempre hay algo que se mezcla con lo posterior). "Operaciones posteriores" cuenta contra la alcancía completa (mismo criterio adoptado para Encargos). El mensaje de "movimiento antiguo" se adapta según qué se vaya a revertir: la cuenta real (si `yo-cuenta`/`split` con fuente), la deuda de la persona (si `cobro-deuda`), o el registro de la alcancía misma en cualquier otro caso.

Usa la clave de módulo nueva `'alcancia'` en `nivelAntiguedadMovimiento()` — ver `CHANGELOG.md#infraestructura--seguridad` (2026-09-01) para el cierre de la config correspondiente en `core-state.js`.

Refactor menor: se extrajo la reversión real a `_alcanciaEjecutarEliminarDeposito(a, idx, entry)` para poder llamarla desde los dos caminos de confirmación (el aviso específico de antigüedad y el diálogo genérico) sin duplicar el código de reversión.

Validado con `node --check`.

### ✨ Agregado — Nuevo tipo de depósito "Me pagaron una deuda que me tenían" (`cobro-deuda`)

Hasta ahora, si alguien te pagaba un préstamo (Prestado · Me deben) y esa plata se guardaba directo en la alcancía sin pasar por ninguna cuenta real primero, no había forma de registrarlo: el selector "¿A dónde entra el pago?" del sheet de Préstamos solo lista cuentas reales (Nequi, Efectivo, cajitas, cuentas personalizadas) — la alcancía nunca apareció ahí a propósito, porque no es una cuenta con `fuente`/`destino` (ver alcancia.md §7, "Decisiones de diseño").

Se agregó un tipo de depósito nuevo dentro de Alcancía → Depositar: elegís la persona (solo aparecen deudores con saldo pendiente) y, si tiene más de un préstamo abierto, a cuál corresponde. En un solo paso: registra el `'abono'` en `d.movimientos[]` del deudor (descontando la deuda) y el depósito en `S.alcancia`, enlazados bidireccionalmente (`_alcanciaMovId` en el abono ↔ `_prestamoMovId`/`_prestamoDeudorId` en el depósito) para poder borrarse desde cualquiera de los dos lados sin dejar huérfanos.

No cuenta como ingreso nuevo (a diferencia de `mandado`/`regalo`/`yo-directo`, que sí usan el truco de ingreso neto-cero): es plata que ya era tuya, solo cambia de "por cobrar" a "guardada" — el préstamo original tampoco se contó como gasto al salir, así que por simetría su regreso tampoco se cuenta como ingreso al volver.

Cambios: `alcancia.js` (nuevo tipo en el selector, selector de persona/grupo, validación de saldo, rama en `alcanciaConfirmarDeposito()`/`alcanciaEliminarDeposito()`, helper `window._alcanciaQuitarPorCobroDeuda()`), `prestado.js` (badge "→ Alcancía" en el historial del deudor, rama en `eliminarMovDeudor()` con guard de carga diferida `_prEnsureAlcancia()` ya que Alcancía es un grupo lazy). Documentado en alcancia.md §3/§4/§5/§7 y prestado.md §2.2/§2.3/§4.1.

**No probado en navegador real** (sin jsdom disponible en este entorno, igual que otros cambios recientes) — validar el flujo completo (registrar, ver el badge, borrar desde cada lado) a mano antes de confiar en él con datos reales.

### ✅ Corregido — `cobro-deuda` creaba un grupo "a favor" en vez de cancelar la deuda existente

Al probar el tipo `cobro-deuda` (ver entrada anterior) en una persona cuyo detalle nunca se había abierto desde que existen los grupos de préstamo (§2.4 de prestado.md), el abono creó un grupo nuevo en blanco ("Préstamo `<fecha>`") con saldo "a favor" en vez de cancelar la deuda real, que quedó huérfana sin grupo. Causa: `alcanciaConfirmarDeposito()` llamaba a `_autoGrupoIdMov(d, fecha)` directo, sin pasar antes por `_migrarGruposDeudor(d)` — el único otro lugar que dispara esa migración es `abrirDeudor()` (Prestado), así que un deudor nunca abierto no tiene `d.grupos`, `_gruposAbiertos()` ve "0 abiertos" y crea uno nuevo ciego a la deuda existente.

Fix: se agregó `_migrarGruposDeudor(d)` antes de cada punto donde se lee o resuelve el grupo del deudor (`_alcDeudorSelActualizar`, la validación de saldo y la creación del abono) — idempotente, no hace nada si ya migró.

**Si ya generaste un grupo corrupto con esta versión con bug:** borrá el depósito (desde Alcancía o desde el historial de la persona en Prestado — revierte ambos lados) y volvé a registrarlo con esta versión corregida; ahora sí va a encontrar y cancelar la deuda existente en vez de crear un grupo aparte.

### ✅ Corregido — `cobro-deuda` desaparecía del desglose de origen de la alcancía

`_alcDesgloseHtml()` (el desglose "de dónde salió esta plata" que se ve en la tarjeta de Alcancía) solo reconocía los tipos `yo-directo`/`yo-cuenta`/`mandado`/`regalo`/`split`. Un depósito `cobro-deuda` no caía en ninguno — no se sumaba mal a "Ahorrado con mi propio dinero" (eso no pasaba), pero sí desaparecía por completo del desglose, aunque su monto sí estuviera en el total (`saldoRegistrado`). Se agregó una categoría propia, "Cobrado de deudas que me tenían".

### ↩️ Revertido — "Cobrado de deudas que me tenían" ya no es una fila separada en el desglose

La entrada anterior le dio a `cobro-deuda` su propia fila en el desglose de origen de Alcancía. A pedido: es plata del usuario, así que debe sumar junto con `yo-directo`/`yo-cuenta` bajo "Ahorrado con mi propio dinero" en vez de mostrarse aparte. Revertido en `_alcDesgloseHtml()`.

### ✅ Corregido (2026-08-28) — `alcanciaConfirmarDestapar()` duplicaba el saldo en patrimonio/tendencia/proyección al destapar

*(reportado por el usuario: después de destapar la alcancía, "Tendencia mensual" y las tarjetas 3m/6m/12m de "Proyección financiera" casi se duplicaron de un momento a otro)*

Diagnóstico: `calcPatrimonioTotal()` (`core-state.js`) suma siempre `S.alcancia.saldoRegistrado` al patrimonio, tapada o destapada — a propósito (ver `CHANGELOG.md#patrimonio-y-cálculos-globales`, "Health score y Proyección financiera siguen usando `calcPatrimonioTotal()` con la alcancía incluida a propósito"). `alcanciaConfirmarDestapar()` transfiere ese mismo `saldoRegistrado` a la cuenta destino elegida vía `_sumarASaldo()`, pero nunca reseteaba `a.saldoRegistrado` a 0 — ese reset solo ocurría en `alcanciaIniciarNueva()`, una acción aparte que el usuario dispara manualmente después ("Iniciar nueva alcancía"). Mientras la alcancía queda en el estado intermedio `_destapada` sin reiniciar, el monto quedaba contado dos veces: una en la cuenta destino (correcta) y otra en el término `alcancia` de `calcPatrimonioTotal()` (fantasma). Efecto secundario del mismo bug, no reportado pero detectado de paso: el badge `#hero-alcancia-badge` ("hay plata escondida en Alcancía") se hubiera quedado visible para siempre después de destapar, en vez de desaparecer.

Fix: se agregó `a.saldoRegistrado = 0` y `_setSaldoOfuscado(0)` dentro de `alcanciaConfirmarDestapar()`, justo después de aplicar los tres movimientos de transferencia/ajuste y antes de armar el registro de `a.historial` — que ya guarda el valor por separado en `saldoRegistrado: saldoReg` (variable local capturada al inicio de la función), así que el reset no afecta el historial ni el resumen que se le muestra al usuario tras destapar.

### ✅ Corregido (2026-08-30) — "Saldo inicial" de un encargo no se podía eliminar ni corregir

Reportado por el usuario al preguntar si ese ítem debía tener candado (no debía — no es un movimiento espejo de otro módulo). Al investigar, se encontró que directamente **no tenía ninguna forma de borrarse o editarse**: `enc.saldoInicial`/`enc.cuentaInicial` se definen una sola vez al crear el encargo (línea ~699) y no hay ningún flujo de edición posterior. El ítem que lo representa en el historial (`id` fijo `'__saldo_ini__'`, igual en todo encargo, sintetizado solo para mostrarlo) no tenía botón de eliminar porque `deleteMovEncargo()` busca el `movId` dentro de `enc.movimientos` — un array donde ese ítem nunca vivió, así que aunque hubiera tenido botón, no habría encontrado nada que revertir.

Fix: se agregó un botón de eliminar al ítem (mismo estilo que los demás movimientos del encargo) y un caso especial al inicio de `deleteMovEncargo()` para `movId === '__saldo_ini__'`: descuenta `enc.saldoInicial` de `enc.cuentaInicial` (si tenía una cuenta asignada, vía `descontarFuente()`) y resetea ambos campos a su valor vacío. No resuelve la edición (sigue sin poder cambiarse el monto directamente), pero ahora si se cargó mal, se puede borrar y volver a crear el encargo con el valor correcto.

De paso se confirmó que "Proyección financiera" (`renderProyeccion()` en `inicio.js`) no tiene ningún concepto de gastos fijos programados a futuro (ej. un pago puntual como un impuesto de alcaldía): es un modelo puramente retrospectivo que extrapola el promedio de `patrimonioHistorial`. No es un bug — un gasto fijo pendiente que todavía no se pagó no puede reflejarse en la proyección porque no hay ningún día real en el historial que lo muestre; el efecto solo aparecerá naturalmente en la tendencia después de pagarlo.

Validado con `node --check`. **Sin verificar en navegador real** (mismo entorno sin jsdom que los cambios recientes).

---

## Prestado

### 🔧 Limpieza (2026-10-04) — referencias obsoletas tras la reestructuración

Un comentario de `prestado.js` apuntaba a `_onSelPersonaNuevaDeuda` (ya no existe; ahora es `_onSelPersonaYoDebo`), `prestado.md` mencionaba `nd_destino` (el sheet "Nueva deuda" ya no existe) y no decía que un pago de "Yo debo" sí ofrece tarjetas con cupo. Se corrigieron. El documento del proyecto (`mis-finanzas.md`) ahora lista `cuenta-efectos.js` entre los archivos de `js/core/` y describe `Deudas` en la fila de `calc-helpers.js`. Sin cambios de comportamiento.

### ✨ Agregado (2026-10-03) — Perdonar una parte de la deuda (Me deben y Yo debo)

**Qué cambió:** "¿Se lo regalas?" ya no obliga a perdonar todo lo que falta. En "Registrar abono" el toggle está disponible y el monto es libre (hasta lo que debe); en "Pagar préstamo completo" sigue siendo todo lo que falta. Lo perdonado cuenta como **gasto real** (patrimonio − lo perdonado) y la deuda baja solo esa parte. Una parte se guarda como `'abono'` con `_perdon: true`; si es todo lo que faltaba, como `'pago-completo'` con `_perdon: true` (se decide por el saldo al aplicar, y también cuando el abono iguala el saldo y se promueve solo a pago completo). El gasto se describe "Perdoné parte de la deuda — X" o "Perdoné deuda — X", y el aviso final dice cuánto todavía debe la persona.

**"Yo debo", igual:** que te perdonen una parte o todo. Lo perdonado es **ingreso** (con `_prestadoDirectamente`, para que Inicio lo cuente) y el monto sugerido es todo lo que falta, pero se puede bajar sin que el toggle pise lo ya escrito.

**Validación nueva:** no se puede perdonar más de lo que la persona debe (ni cuando no hay saldo): el monto perdonado se compara con el saldo con `Deudas.TOL_FINO` ($0,50). Antes no hacía falta porque el monto estaba fijo.

**Sin cambios para lo existente:** los perdones ya registrados (siempre `'pago-completo'` + `_perdon`) se leen, se muestran y se eliminan igual; todos los totales que filtran por `_perdon` (detalle, Personas, Wrapped) siguen igual.

**Verificación (jsdom, `index.html` real, y tests nuevos en `tests/medeben.test.js` y `tests/yodebo.test.js`):** perdonar 30.000 de 100.000 (debe 70.000, gasto 30.000, patrimonio −30.000, ninguna cuenta se mueve), perdonar lo que queda (pago completo), eliminar el perdón parcial (devuelve su parte y solo borra su gasto), perdonar todo desde "Registrar abono", perdonar de más (error sin escribir nada), y lo mismo en "Yo debo" con ingreso.

### 🐛 Corregido (2026-10-03) — "Yo debo": la lista no se actualizaba al eliminar o cambiar una persona; pestañas sin depender del CSS

**Causa (lista desactualizada):** `refresh()` (`core-state.js`) solo volvía a pintar la lista de "Me deben" cuando Préstamos estaba activa; la de "Yo debo" solo se pintaba al entrar a la pantalla o al cambiar de pestaña. Al eliminar a una persona de "Yo debo", la app volvía a la lista, pero la lista seguía mostrando a la persona hasta cambiar de pantalla. Lo mismo pasaba con cualquier cambio de saldo: registrar un movimiento y volver mostraba el saldo anterior. **Arreglo:** `refresh()` pinta las dos listas cuando Préstamos está activa (las dos viven en el DOM aunque una esté oculta), y `volverMisDeudas()` / `volverDeudores()` también pintan su lista al volver. Eliminar a alguien de "Yo debo" ahora muestra el aviso "X eliminado", igual que en "Me deben". Reproducido antes del arreglo con el `index.html` real.

**Pestañas Me deben / Yo debo:** se había pasado el color de la pestaña activa a una clase CSS (`.btn-tab-activa`). El Service Worker sirve el CSS desde caché y puede tardar una carga en actualizarse, y mientras tanto la pestaña activa dejaba de verse verde. Se volvió a pintar en línea (`_pintarTabPrestamos`, una sola función para las dos pestañas), que no depende de ningún archivo aparte. La regla `.btn.btn-tab-activa` ya no existe en `styles.css`.

**Verificación (jsdom, `index.html` real):** al eliminar a una persona de "Yo debo" y de "Me deben" la lista deja de mostrarla; después de registrar un movimiento y volver, la lista muestra el saldo nuevo; las pestañas activa e inactiva con el color correcto.

### 🐛 Corregido (2026-10-03) — "Yo debo": el perdón no sumaba al ingreso del mes, y los movimientos sin cuenta no salían en Actividad reciente

**Causa 1 (ingreso del mes):** el perdón de una deuda propia crea una entrada sin cuenta (`fuente: ''`). Inicio (`ingresosMes` en `inicio.js`) solo suma las entradas con cuenta (Nequi, Efectivo, cajita, cuenta personalizada) o con la bandera `_prestadoDirectamente`. El perdón subía el patrimonio pero no el ingreso del mes, y por lo tanto tampoco entraba en los ratios de salud financiera. Mis pruebas de la Fase 3 solo comprobaban el patrimonio y `_esEntradaEspejoNoIngreso`, y no lo vieron. Reproducido: ingreso del mes 0 después de perdonar $90.000. **Arreglo:** la entrada lleva `_prestadoDirectamente: true`, la misma bandera que usa el margen de un préstamo. Ahora suma $90.000.

**Causa 2 (Actividad reciente):** el feed solo mostraba de "Yo debo" los movimientos que dejaban un espejo en una cuenta, con el texto del espejo ("Me prestó — X"). Los pagos con tarjeta y los movimientos "sin especificar" no aparecían en ningún lado. **Arreglo:** una fila propia por movimiento (`_normMisDeudas`: "Me prestó X" / "Pago a X"), y los espejos de "Yo debo" se ocultan como ya se hacía con los de "Me deben" (`_espejosDeudores`). El perdón sigue saliendo una sola vez, como ingreso, y el pago de más como gasto.

**Verificación:** 2 tests nuevos en `tests/yodebo.test.js` (el perdón cuenta en el ingreso del mes; pagar o recibir una deuda no cuenta como ingreso ni gasto) y una prueba del feed sobre el `index.html` real (2 "Me prestó", 4 "Pago a", 1 perdón, 1 pago de más, ningún espejo duplicado).

**Sobre fusionar `S.deudores` y `S.misDeudas`:** `firebase-sync.js` no lee ninguna de las dos (sincroniza todo `S` tal cual), así que ese riesgo no existe. Se mantiene la decisión de dejarlas separadas por lo que sigue siendo cierto: cambiaría el formato del backup JSON (`configuracion.js` exige `deudores`), reescribiría datos guardados sin copias automáticas, y hoy no aporta nada que se use.

### ✨ Agregado (2026-10-03) — "Yo debo": grupos de préstamo, y pantallas compartidas con "Me deben"

**Grupos en "Yo debo":** igual que "Me deben": cada deuda propia se organiza en préstamos (Histórico, "Es un préstamo aparte", selector con 2 o más abiertos, cierre automático al saldarse y reapertura al borrar, acordeón en el detalle, migración silenciosa de deudas anteriores). La maquinaria de grupos ya recibía la deuda por parámetro; solo `getGrupoSaldo` asumía que lo que abre la deuda es `'prestamo'`, y ahora usa `Deudas.abre()`. El grupo se resuelve al aplicar el movimiento, no al validar, así que un error no deja grupos vacíos. Sheet nuevo: `md_grupo`, `md_grupo_check`, `md_grupo_nombre`.

**Pantallas compartidas:** las dos listas pasaron a un solo render (`_renderListaDeudas(dir)`, con la tabla `_UI_LISTA` para lo que cambia) y el encabezado del detalle a `_pintarEncabezadoDeuda`. El historial agrupado es una sola función (`_htmlHistorialPorGrupos`). Cambios visibles: el color de cada deuda ahora sale siempre de la persona vinculada (antes "Me deben" usaba `d.color` directo), y la lista de "Yo debo" también se ordena de mayor a menor saldo.

**Guardia de integridad:** también corre al registrar y eliminar en "Yo debo". Sigue siendo un aviso (con el registro dividido en validar y aplicar, solo puede saltar por datos corruptos); no revierte nada.

**Lecturas directas que quedaban:** `tarjetas_credito.js` ahora pasa por `Deudas`. Fuera de `Deudas`, solo quedan el valor inicial de `S` en `core-state.js`, la validación del backup JSON en `configuracion.js` y un chequeo de tipo en `wrapped.js`, que miran la estructura guardada a propósito.

**Decisión: las dos colecciones se quedan separadas.** Con todo el código pasando por `Deudas`, fusionar `S.deudores` y `S.misDeudas` en una sola lista con `direccion` ya no aportaría nada que se use hoy, y sí cambiaría datos guardados, el formato del backup JSON (`configuracion.js` exige `deudores`) y lo que lee `firebase-sync.js`. Si algún día hace falta (por ejemplo, para netear a una persona en ambas listas), solo cambia `Deudas` y se agrega una migración.

**Verificación (jsdom, sobre el `index.html` real):** 6 comprobaciones de grupos en Yo debo (primer grupo, préstamo aparte, selector con 2 abiertos, cierre y reapertura, acordeón, migración, error sin grupos huérfanos); las demás pruebas de Prestado siguen idénticas.

### 🔧 Reestructuración (2026-10-03) — "Me deben": registrar y eliminar un movimiento en dos pasos (validar → aplicar)

**Qué cambió:** `_confirmarMovimientoInterno` (unas 590 líneas, con las validaciones mezcladas con las escrituras) se partió en `_planMovimiento` (lee el formulario y valida; no escribe nada) y `_aplicarMovimiento` (escribe; sin ningún `return` de validación), con un par `_plan…`/`_aplicar…` por rama: perdón, préstamo, abono desde encargo y abono a cuenta propia. Los extras de las dos ramas de abono, que estaban copiados, quedaron en `_planExtra` y `_aplicarExtraPartes`. De `eliminarMovDeudor` se sacó la reversión a `_revertirMovDeudor(d, m)`; la función original conserva solo lo que decide si se puede borrar (antigüedad, confirmación, que Alcancía cargue). La guardia de integridad del saldo sigue ahí como aviso. `abrirDeudor` no se tocó: solo dibuja la pantalla y partirla no protege ningún saldo.

**Otro bug corregido:** el grupo del movimiento (`_resolverGrupoIdMov`) se calculaba al principio, antes de validar, y puede crear un grupo nuevo si se eligió "Es un préstamo nuevo". Un error de validación (por ejemplo, un reparto que no suma) dejaba ese grupo creado y vacío. Reproducido: 1 grupo antes, 2 después del error. Ahora se resuelve al aplicar: 1 y 1.

**Sin cambios de comportamiento:** mismos datos guardados, mismos avisos y mismo orden de validación.

**Verificación (jsdom):** 16 escenarios (perdón, préstamo simple, dividido y con margen, abono simple, dividido y sin cuenta, pago completo, abono con extra de las cuatro clases, abono vía encargo simple, sin cuenta, dividido y con extra, pago completo vía encargo) dan exactamente los mismos registros y saldos que la versión anterior, y al eliminarlos vuelve todo al estado inicial; 12 errores dan el mismo aviso y no cambian ningún dato; 6 casos de eliminación (préstamo vía TC, con margen, abono vía Alcancía, cuando Alcancía no carga, y abonos antiguos sin ids) son idénticos. 10 tests nuevos en `tests/medeben.test.js`.

### 🔧 Cambio (2026-10-02) — Agregar persona: título propio, sin repetidos, y "Yo debo" igual que "Me deben"

**Qué se veía mal:** (1) el selector de personas decía "¿De quién es la plata?" (el texto de Encargos) también al agregar a alguien a Me deben o Yo debo. (2) En Yo debo, "Nueva deuda" abría un sheet distinto, con un campo "¿A quién le debes?" que a su vez abría el selector por encima. (3) El selector ofrecía a personas que ya estaban en la lista, que luego no se podían volver a agregar.

**Qué cambió:** `abrirSelPersona(callback, titulo, opts)` acepta título y un filtro `opts.excluir`. Me deben usa "¿Quién te debe?" y oculta a quienes ya tienen un deudor; Yo debo usa "¿A quién le debes?" y oculta a quienes ya tienen una deuda propia. "Nueva deuda" ya no abre un sheet propio: abre el mismo selector, crea la deuda vacía y abre su detalle (igual que Me deben), y el primer "Me prestó" se registra desde ahí. Buscar a alguien ya agregado avisa que ya está en la lista en vez de ofrecer crearla; si todas ya están, avisa. Encargos no cambia.

**Código retirado:** `sheet-nueva-deuda` (HTML), `crearMiDeuda` y sus dos envoltorios (uno en la sección de Personas y otro del selector), `_ndPoblarSelectDestino`, `_initNuevaDeudaPersonaSelector` y `_onSelPersonaNuevaDeuda`. Eran tres capas para un formulario que ya no existe.

**Efecto colateral bueno:** el sheet viejo sumaba el primer monto a la cuenta sin dejar movimiento espejo en su historial (rompía la regla del proyecto). Ahora el primer "Me prestó" pasa por el flujo común y sí lo deja.

**Verificación (jsdom, sobre el `index.html` real):** título y lista de cada flujo, ocultar a quien ya está, búsqueda de alguien ya agregado, "todas ya están", crear la deuda vacía y abrir el detalle (lista y detalle renderizan con 0 movimientos), y que Encargos conserve su título y lista completa.

### ✨ Agregado (2026-10-02) — "Yo debo": pagar una deuda con tarjeta de crédito

**Qué cambió:** el selector de cuenta de un pago de "Yo debo" ahora ofrece las tarjetas de crédito con cupo disponible (sola o como una fila del reparto). El pago baja la deuda con el prestamista y sube la deuda de la tarjeta por el mismo monto. Pagar o recibir una deuda sigue sin poder usar una tarjeta como destino de plata que entra.

**Tratamiento financiero:** es un cambio de deuda por deuda, no un gasto: patrimonio igual, y la parte cargada a la tarjeta cuenta como deuda **propia** de la TC (`calcDeudaAjenaDeTarjeta` solo suma encargos y préstamos). Con "pagaste de más", la tarjeta sube `monto + extra` y el extra es el gasto.

**Detalle técnico:** cada fila con tarjeta deja un cargo `cargo_deuda` en `S.tcMovimientos` (`miDeudaId`, `_miDeudaMovId`). `tarjetas_credito.js` reconstruye `tc.deuda` desde sus registros en cada refresh (`tcRecalcular`, `tcNormalizarTarjetas`); se agregó `_tcEsCargoExterno()` con el tipo nuevo en ambos sitios. Sin eso, la deuda sumada a la TC se perdía en el siguiente refresh (reproducido en las pruebas). El detalle de la tarjeta muestra estos cargos como "Pago de deuda". Eliminar el pago quita el cargo y baja la deuda de la TC.

**Verificación (jsdom):** pago simple y dividido (efectivo + TC), la deuda de la TC sobrevive a `tcNormalizarTarjetas()`, patrimonio sin cambios, pago de más con TC (−extra), cupo insuficiente y TC como destino sin escribir nada, reversión exacta, y `cargo_prestamo` sigue contando como ajena.

### ✨ Agregado (2026-10-02) — "Yo debo": pago dividido, perdón y pago de más (Fase 3)

**Qué cambió:** el sheet de movimientos de "Yo debo" (`sheet-mov-mi-deuda`) ahora puede (1) **dividir** un préstamo recibido o un pago entre varias cuentas (`destinos[]` / `fuentes[]`), (2) registrar que **te perdonaron** lo que faltaba y (3) registrar que **pagaste de más**. Lo hace con el mismo patrón que "Me deben": validar todo antes de escribir (`_planMovMiDeuda`), luego aplicar (`_aplicarMovMiDeuda`, sin `return` de validación), y una sola reversión (`_revertirMovMiDeuda`).

**Tratamiento financiero:** perdón = **ingreso** (la deuda baja sin que salga plata: patrimonio +saldo). Pago de más = **gasto** (sale de la cuenta pero no baja la deuda: patrimonio −extra); las cuentas descuentan `monto + extra`. Pagar o recibir una deuda por sí solo deja el patrimonio igual. `_esEntradaEspejoNoIngreso()` ahora no excluye `_esPerdonRecibido`, porque todo `_origenSeccion` que empieza por "Prestado" se excluía como espejo.

**Cambios de comportamiento en lo que ya existía:** (a) un pago ahora se rechaza si la cuenta elegida no tiene saldo suficiente (antes podía dejarla en negativo); (b) `_deudaCuentasDe` ahora también cuenta las cuentas de `destinos[]`/`fuentes[]`, así que la protección por antigüedad cuenta bien los abonos repartidos de "Me deben" (antes no los veía); (c) un perdón de "Yo debo" no suma en "Pagado" ni en Wrapped.

**Pendiente en "Yo debo":** nada de lo que tiene "Me deben" (los grupos se agregaron después, ver arriba).

**Verificación (jsdom):** pago y recibido divididos, perdón, pago de más y su reversión exacta; patrimonio antes/después de cada caso; 6 casos de error que no cambian ningún dato; y un registro antiguo de una sola cuenta se elimina igual que antes.

### 🔧 Reestructuración (2026-10-02) — Fase 2: capa de acceso `Deudas`, un solo juego de helpers y tolerancias con nombre

**Qué cambió:** "Me deben" (`S.deudores`) y "Yo debo" (`S.misDeudas`) ahora se consultan por un único objeto, `Deudas` (en `js/core/calc-helpers.js`, carga de entrada): `lista(dir)`, `porId`, `porPersona`, `agregar`, `quitar`, `saldo(d)`, `totalPendiente(dir)`, con dirección `'favor'` / `'contra'`. Los datos guardados **no cambian** (siguen las dos listas, mismos tipos de movimiento). 11 archivos (`actividad_reciente`, `alcancia`, `busqueda-global`, `cuentas`, `encargos`, `inicio`, `movimientos`, `personas`, `plata_comprometida`, `wrapped`, `prestado`) y `core-state.js` dejaron de leer/escribir las listas directo.

**H3 resuelto (era una sospecha):** `getDeudorSaldo` y `getDeudorSaldoPatrimonio` eran el mismo `reduce`. Se eliminó `getDeudorSaldoPatrimonio`; el patrimonio y la pantalla usan la misma definición (`Deudas.saldo`). Los nombres `getDeudorSaldo`, `getMiDeudaSaldo`, `totalPrestadoPendiente` y `totalMisDeudasPendiente` se conservan como envoltorios (los usan 8 archivos y los tests). `_patrimonioDependenciasListas` ya no depende de que `prestado.js` haya cargado, porque `Deudas` carga de entrada.

**H4 resuelto:** `Deudas.TOL` ($1) y `Deudas.TOL_FINO` ($0,50) reemplazan los `1` y `0.5` sueltos de `prestado.js`. Mismos valores que antes, ahora con nombre.

**Helpers espejo unificados:** `_deudorCuentasDe`/`_miDeudaCuentasDe`, `_deudorOpsPosteriores`/`_miDeudaOpsPosteriores` y `_deudorTieneCuentaAfectada`/`_miDeudaTieneCuentaAfectada` pasaron a `_deudaCuentasDe`, `_deudaOpsPosteriores` y `_deudaTieneCuentaAfectada`. Los tipos de movimiento son disjuntos, así que no necesitan saber la dirección. Las pestañas Me deben / Yo debo se pintan con una sola función (`_pintarTabPrestamos`).

**Verificación:** `node --check` en los 15 archivos tocados; en jsdom, mismo patrimonio y mismos totales que el código anterior, `agregar`/`quitar`/`porPersona`, equivalencia de los helpers unificados y de las pestañas, y la prueba dorada de la Fase 1 sigue idéntica.

### 🔧 Reestructuración (2026-10-02) — Fase 1: el efecto sobre la cuenta vive en un solo lugar (`js/core/cuenta-efectos.js`)

**Qué cambió:** `registrarMovEspejo()` y `borrarMovEspejo()` reemplazan los 7 bloques de escritura y 6 de reversión del movimiento espejo que `prestado.js` repetía por tipo de cuenta, y las dos funciones propias de `mesada.js` (que ahora delegan). `prestado.js` pasó de 3.040 a ~2.780 líneas. Solo escriben/borran el registro del historial; el saldo sigue siendo `sumarFuente`/`descontarFuente`. Si la cuenta ya no existe, el id del espejo queda `null` (antes quedaba un id de algo que nunca se escribió; sin efecto sobre saldos).

**También corregido:** un abono vía encargo con pago dividido entre varias cuentas sumaba saldo a cada cuenta destino pero no dejaba movimiento espejo en su historial. Ahora lo deja, guarda su id en cada fila de `destinos[]` y la eliminación lo revierte. Los abonos antiguos sin ese id se revierten como antes.

**Verificación:** misma entrada en el código anterior y el nuevo da exactamente los mismos registros y saldos (8 escenarios, ver arriba), y al eliminar todo vuelve al estado inicial.

### 🐛 Corregido (2026-10-02) — Abono con "extra" inválido quedaba aplicado a medias (y se duplicaba al corregirlo)

**Causa:** en la rama normal de `_confirmarMovimientoInterno`, el abono se registraba (`d.movimientos.push`, `sumarFuente`, movimientos espejo) **antes** de validar el extra. Con el monto del extra vacío, sin partes o con partes que no sumaban, la función hacía `return` con un toast, pero el abono ya estaba aplicado en memoria con el sheet abierto: al corregir y volver a confirmar se registraba dos veces, y un `save()` de cualquier otra pantalla lo guardaba a medias.

**Arreglo:** las tres validaciones del extra se hacen primero (paso 0) y el resto de la rama ya no puede salirse a medias. Caso reproducido: abono de $20.000 a Nequi con extra vacío, luego corregido. Antes: Nequi $40.000, deuda $60.000. Ahora: Nequi $20.000, deuda $80.000.

### ✨ Agregado (2026-10-01) — Un abono que cubre toda la deuda se guarda como "Pago completo"

**Caso:** la persona debe 4.000, abrís "Registrar abono" (en vez de "Pagar préstamo completo") y ponés 4.000. Antes quedaba como `'abono'`; ahora queda como `'pago-completo'`, con la etiqueta "Pago completo" en el historial y la descripción "Pago de deuda completo — …" en el movimiento de la cuenta, igual que si hubieran abierto el otro sheet.

**Cómo:** `confirmarMovimiento()` pasó a ser un envoltorio de `_confirmarMovimientoInterno()`. Si `movTipo === 'abono'` y el monto iguala el saldo total de la persona (`getDeudorSaldo`, tolerancia $0,50), promueve `movTipo` a `'pago-completo'` solo durante el guardado y lo restaura en `finally`, así que si una validación aborta el sheet sigue siendo "abono". Todo lo que ya dependía de `movTipo` (tipo guardado, desc secundaria, rama de encargo) lo toma solo, sin tocar nada más.

**Alcance:** se compara contra el saldo TOTAL de la persona (igual que "Pagar préstamo completo"), no el de un grupo. Un abono menor al saldo sigue siendo abono. Solo aplica a abonos; no a préstamos ni a "¿Se lo regalas?". Verificado en sandbox con los archivos reales (abono 1.000 → `abono`; abono 3.000 que salda → `pago-completo`; `movTipo` restaurado). No probado en navegador.

### ✨ Agregado (2026-09-30) — "Nuevo préstamo": opción "El valor real era diferente" (margen cuando cobras más de lo que costó)

**Caso:** prestás algo que pagaste a 698.000 y le cobrás 700.000 a la persona (siempre redondea). Antes solo se podía registrar 700.000 de deuda *y* 700.000 salidos de la cuenta, o bien usar el préstamo con TC, que sí tenía este bloque.

**Qué hace:** en `sheet-registrar-movimiento`, solo en "Nuevo préstamo", aparece el mismo bloque colapsable que ya usan Encargos y "Préstamo con TC" (`mov-dif-wrap`, instancia `'prestamoDif'` del motor `diferencial.js`). *Monto* = lo que le cobrás (la deuda de la persona); *¿Cuánto era en realidad?* = lo que de verdad sale de tu cuenta. Con 700.000 / 698.000: la deuda queda en 700.000, de la cuenta salen 698.000 y los 2.000 de margen se registran como ingreso.

**Decisiones:**
- El margen es un ingreso **sin cuenta** (`fuente:''`, `_prestadoDirectamente`, `permiteMiCuenta:false`), igual que en "Préstamo con TC": esos 2.000 nunca pasaron por ninguna cuenta tuya; cuando te paguen los 700.000 entran enteros a la cuenta destino del abono.
- El ingreso se enlaza al préstamo (`diffAplicar('prestamoDif', …, movId)` → `_encMovId`), y `eliminarMovDeudor()` lo borra junto con el préstamo (no hay saldo que revertir).
- En modo simple con margen, el préstamo se guarda como `fuentes:[{fuente, monto: real}]` (la misma forma del préstamo dividido) en vez de `fuente`. Así revertir, el detalle y el historial de la cuenta usan el monto real sin ningún caso especial. Sin margen, nada cambia (sigue `fuente`).
- Con "Dividir ÷", las filas deben sumar el valor real (no el monto cobrado); `_updatePrestSplitResumen()` usa `_prestMontoSalida()`.
- Si el valor real es mayor que el monto cobrado se bloquea con un toast (cobrar de menos no se modela). Real vacío, o igual al monto, = sin diferencial.
- La tarjeta del movimiento muestra el margen con `diffRenderHistorial()` (solo en préstamos normales; los de TC siguen como estaban).

**Verificado:** corrido con los archivos reales (`diferencial.js`, `calc-helpers.js`, `fuentes-filtro.js`, `prestado.js`) en un sandbox con DOM simulado: préstamo 700.000/698.000 desde Nequi → deuda 700.000, Nequi −698.000, un ingreso de 2.000 enlazado; borrarlo deja deuda 0, Nequi como antes y sin ingreso; real > monto bloquea sin escribir nada; sin diferencial sigue igual. **No probado en un navegador real** (el bloque HTML, el toggle y la lectura de `mov_dif_real` en vivo).

### ✅ Corregido (2026-09-30) — El margen de un préstamo con TC quedaba huérfano al borrar el préstamo

**Síntoma:** al borrar un préstamo hecho con tarjeta, la deuda de la TC y su cargo se revertían, pero el ingreso "Margen préstamo TC — …" seguía en `S.movimientos` y seguía contando como ingreso en Análisis y Salud financiera.

**Causa raíz:** `confirmarPrestamoTC()` llamaba a `diffAplicar('prtc', {...})` sin el tercer argumento (vínculo), así que el margen no quedaba ligado al préstamo, y la rama `_viaTC` de `eliminarMovDeudor()` no lo limpiaba.

**Fix:** `diffAplicar('prtc', …, movId)` deja `_encMovId` = id del préstamo, y `eliminarMovDeudor()` borra en la rama `_viaTC` los `_esDiferencialEncargo` con ese vínculo. El ingreso se escribe sin cuenta, así que no hay saldo que revertir.

**Alcance a propósito:** solo préstamos nuevos; los guardados antes no tienen el vínculo y su margen seguiría huérfano al borrar el préstamo. Tampoco se le puso `_secundario` a ese margen (ver la entrada de Encargos del mismo día): sin vínculo en datos viejos, protegerlo lo dejaría sin forma de borrarse. Sin probar en la app.

### ✅ Corregido (2026-09-28) — El extra/propina de un pago de deuda no contaba como ingreso en Análisis ni en Salud financiera

**Síntoma:** al registrar el pago de un préstamo con "me dio de más" (extra → guardar en cuenta), la plata sumaba al saldo de la cuenta y al patrimonio, pero Análisis financiero y Salud financiera no la veían como ingreso.

**Causa raíz:** el movimiento `entrada` que se escribe para el extra llevaba `_origenSeccion: 'Prestado · Me deben'`, y `_esEntradaEspejoNoIngreso()` descarta todo lo que empiece con `Prestado` (pensado para el abono principal, que solo devuelve capital ya contado).

**Fix:** los movimientos del extra "guardar" de la **rama normal** de `confirmarMovimiento()` llevan ahora `_esExtraIngreso: true`, y `_esEntradaEspejoNoIngreso()` devuelve `false` para ellos antes de cualquier otra regla. El abono principal sigue siendo espejo (no ingreso).

**Alcance a propósito:** la rama "abono vía encargo" no cambió — ahí el extra sale de plata del encargo, no de un regalo del deudor. Los extras "gastar" siguen excluidos (`_esExtraPrestamo`). Análisis solo suma `S.movimientos`, así que el fix se refleja para destinos Efectivo/Nequi; un extra guardado en cajita o cuenta personalizada solo escribe en el historial de esa cuenta (comportamiento previo, sin tocar).

---

### 🔧 Cambio (2026-09-20) — `getDeudorSaldo()` se movió a `js/core/calc-helpers.js`

Es un `reduce` puro sobre `d.movimientos` y "Necesita atención" (`inicio.js`) la necesita en el primer render. Sigue siendo global: el resto de `prestado.js` la usa igual, pero `prestado.js` ya no la define. `getDeudorSaldoPatrimonio()` se dejó donde estaba. Detalle en `CHANGELOG.md#inicio`; el efecto en los tests, en `CHANGELOG.md#infraestructura--seguridad`.

### ✨ Agregado (2026-09-20) — Préstamos: la plata que sale solo se ofrece de cuentas con saldo ≥ $1,00; "Préstamo con TC" exige cupo

- **`mov_fuente`** ("¿De dónde sacó la plata?", nuevo préstamo, modo simple): `initMovSheet()` lo poda tras `poblarFuente()` (`openSheet('registrar-movimiento')` ya lo había poblado sin filtrar; `initMovSheet()` lo repuebla y poda después, y es el último en escribirlo). `mov_destino` (abonos) **no** se filtra: es plata que entra.
- **Split de préstamo (`_getPrestSplitFuentesOptions`)** y **"Yo debo → Registrar pago"** (`md_cuenta`, solo cuando `tipo !== 'recibido'`): mismo filtro. "Sin especificar" y "Ganancia (no salió plata)" nunca se filtran.
- **Préstamo con TC:** `abrirSheetPrestamoTC()` no abre el sheet y avisa "No se puede: ninguna de tus tarjetas tiene cupo disponible" si ninguna TC activa tiene cupo; el select `prtc_tarjeta` lista solo las TC con cupo y muestra el cupo disponible (antes mostraba la deuda). El botón `btn-prestamo-tc` se ve atenuado (`_actualizarBtnPrestamoTC()`, llamada desde `abrirDeudor()`), pero **no** usa `disabled` a propósito: en móvil un botón deshabilitado no explica nada, y el toast sí.
- La validación de cupo contra el monto real de la compra (`confirmarPrestamoTC`) queda igual.


### ✨ Agregado (2026-09-19) — "¿Se lo regalas?": perdonar lo que falta en "Pagar préstamo completo" (cuenta como gasto)

Hasta ahora no había forma de decir "ya no me debes nada, te lo regalo": lo más cercano era pagar el préstamo completo con destino "Sin especificar", que dejaba el saldo en 0 pero quedaba en el historial como un pago normal y **no contaba como gasto** (el patrimonio bajaba, pero Gastos/Análisis/salud no se enteraban, y la tasa de ahorro del mes salía mejor de lo que fue). El regalo de un *extra* (`p.tipo === 'regalar'`) tampoco servía: solo aplica al extra de un abono, no a la deuda en sí.

- **UI (`index.html`, sheet `registrar-movimiento`):** nuevo toggle `#mov_perdon` ("¿Se lo regalas?") dentro de `#mov_perdon_wrap`, visible solo en "Pagar préstamo completo". Al activarlo se ocultan el destino (`#mov_destino_wrap`), el extra y "¿Viene de un encargo?" (y se apagan si estaban prendidos, para no dejar estado oculto), el título pasa a "Perdonar deuda" y el botón a "Perdonar deuda". Wiring en el arreglo `[id, evento, fn]` del final de `prestado.js`.
- **Modelo:** el movimiento del deudor sigue siendo `tipo:'pago-completo'` (así `getDeudorSaldo`, grupos, `_autoCerrarGruposEnCero` y la integridad de saldo funcionan sin tocar nada) con `destino:''`, `_perdon:true` y `_gastoPerdonId`. Al mismo tiempo se crea un gasto en `S.gastosVar`: `{ monto, fecha, cat:'Otro', desc:'Perdoné deuda — <nombre>', fuente:'', _secundario:true, _origenSeccion:'Prestado · Me deben', _esPerdonDeuda:true, _deudorId, _deudorMovId }`.
- **Por qué cuenta como gasto:** la plata ya había salido de tus cuentas cuando prestaste (eso nunca fue gasto: pasó de cuenta a "por cobrar"); al perdonarla se da por perdida. `fuente:''` hace que no descuente ningún saldo (no hay doble descuento) y `_esGastoVarNoReal()` **no** lo excluye (a diferencia de `_esExtraPrestamo`, `_esPagoTC`, etc.), así que entra al total de Gastos, salud, presupuestos y cierre de mes. Categoría `'Otro'` porque existe en las categorías por defecto (`'Varios'`, la del extra, no).
- **`_secundario`:** el gasto se ve en Gastos con candado y solo se borra desde Préstamos (regla 3.6 de `gastos.md`); `deleteGastoVar()` y `eliminarMovimiento()` ya lo bloquean con ese flag.
- **Reversión (`eliminarMovDeudor`):** si `m._perdon`, además de quitar el movimiento borra el gasto por `m._gastoPerdonId`; el diálogo dice que el gasto también se borrará (en vez de "el saldo de la cuenta destino se revertirá") y el toast final lo aclara. `_deudorTieneCuentaAfectada()` devuelve `true` para un perdón: no toca cuentas, pero borrarlo cambia un gasto de un mes ya cerrado, así que pasa por la protección por antigüedad.
- **Historial del deudor:** badge "Perdonado" (rojo) en vez de "Pago completo", con la etiqueta "se lo regalé · cuenta como gasto". "Pagado" en la cabecera **no** suma lo perdonado (no es plata que te pagó).
- **Sin efecto en cuentas:** no llama `sumarFuente`, no crea movimiento secundario, no toca `S.movimientos`. Verificado con un arnés que carga las funciones reales (`confirmarMovimiento`, `eliminarMovDeudor`, `_deudorTieneCuentaAfectada`, `_esGastoVarNoReal`): saldo 600 → 0, un gasto de 600 que `_esGastoVarNoReal` no excluye, ninguna cuenta tocada, y al borrar el perdón el saldo vuelve a 600 y `gastosVar` queda en 0.

**Verificado después contra `inicio.js`, `analisis.js`, `actividad_reciente.js` y `personas.js`:**
- **`inicio.js` / `analisis.js`:** todos los cálculos de gasto (gastos del mes de Inicio; total del mes, tendencia, ranking de meses, comparativa con el mes anterior, gasto por categoría y presupuestos en Análisis) filtran con `_esGastoVarNoReal()`, así que el perdón suma sin cambios. Categoría `'Otro'` (con fallback a `'Otro'` también en presupuestos). "Necesita atención" lista deudores con saldo > 0: tras perdonar, la persona sale de la lista.
- **`actividad_reciente.js`:** `_normDeudores()` mostraba todo movimiento que no fuera `'prestamo'` como "Abono de X" (+), así que el perdón aparecía como plata recibida **y** además el gasto ("Perdoné deuda — X", −) — doble. Fix: `_normDeudores()` salta los movimientos con `_perdon`; queda solo el gasto. El feed es de solo lectura (sin borrar/click), así que no hay más que tocar.
- **`personas.js` (perfil de la persona; lo que antes vivía también en `prestado-personas.js`, ya fusionado en `prestado.js`):** `abonos` incluía todo `'abono'`/`'pago-completo'`, así que un perdón inflaba "Abonado", el "Progreso de pago" y "Mayor abono". Fix: se excluye `_perdon` de `abonos`; "Último movimiento" muestra "Deuda perdonada" en vez de "Pago completo".
- **`wrapped.js`:** el gasto del perdón ya entra bien (todos sus cálculos de gasto filtran con `_esGastoVarNoReal`), pero dos funciones trataban el `'pago-completo'` de un perdón como devolución: `_wrappedCalcularPrestado()` lo sumaba a `totalDevuelto` ("te devolvieron $600") y `_wrappedRecuperacionMasRapida()` lo contaba como préstamo recuperado en N días. Fix: ambas ignoran `m._perdon` (verificado con las funciones reales: un préstamo pagado da devuelto 600 y recuperación en 49 días; el mismo perdonado da devuelto 0 y sin recuperación). Se dejaron como están los contadores de "día más activo" y "movimientos registrados", que ya sumaban a la vez el movimiento del deudor y su reflejo en otras listas (un perdón cuenta 2 en vez de 1, mismo criterio de aproximación que el resto del archivo).

**Sin prueba en navegador real.**

---

### ✅ Corregido (2026-09-19) — Reversión de préstamos/abonos borrados desde el feed o el detalle de una cuenta (`movimientos.js` → `eliminarMovDeudor`)

`eliminarMovimiento()` (`js/core/movimientos.js`) tenía su propia copia de la reversión para `'prestamo'`/`'abono'` (movimientos de `S.deudores[]`), mucho más pobre que `eliminarMovDeudor()` (`prestado.js`), que es la implementación completa. Diferencias verificadas leyendo ambos archivos:

- **Préstamo con fuentes divididas (`m.fuentes`):** la copia solo hacía `if (mov.fuente) sumarFuente(...)`. Un préstamo dividido borrado desde una cuenta desaparecía **sin devolver la plata a ninguna de las cuentas** (el saldo quedaba bajo para siempre). Además el propio encabezado de `movimientos.js` afirmaba que esa rama "lo revierte completo".
- **Préstamo vía TC (`_viaTC`):** no revertía `tc.deuda` ni limpiaba `S.tcMovimientos`.
- **Abono con `destinos` dividido, vía encargo o vía Alcancía:** solo revertía `mov.destino` simple; nada de encargo/Alcancía/extra.
- **Grupos de préstamo:** no llamaba `_autoCerrarGruposEnCero(d)` ni la guardia `_verificarIntegridadSaldoDeudor`.
- **Grupo lazy sin guard:** la protección por antigüedad de esa rama llamaba `_deudorTieneCuentaAfectada`, `_deudorOpsPosteriores` y `_deudorCuentasDe` (todas de `prestado.js`) sin `typeof`; borrar un préstamo desde el detalle de una cuenta sin haber visitado antes Préstamos en la sesión tiraba `ReferenceError` (mismo patrón que ya se había encontrado con `getMesadaData` y `tcEliminar*`).

Fix: `eliminarMovimiento()` ya no tiene lógica propia para estos dos tipos. Si `movTipoEl` es `'prestamo'`/`'abono'`, busca el deudor dueño, asegura `Loader.ensure('prestamos')` si `eliminarMovDeudor` todavía no existe (aborta con toast si falla la carga, sin dejar nada a medias) y delega con `eliminarMovDeudor(deudorId, movId, { desdeFeed: true })`. Si el id no está en ningún deudor muestra un toast de error en vez del falso "Movimiento eliminado y saldos revertidos" de antes. Se borraron el bloque de protección por antigüedad y las dos ramas de reversión duplicadas de `movimientos.js` (la protección, el diálogo y la reversión viven ahora solo en `eliminarMovDeudor`). Para no perder el re-render de la cuenta abierta, esa cola se extrajo a `_rerenderCuentaActiva()` (usada por la delegación y por el final de `eliminarMovimiento()`).

`eliminarMovDeudor(deudorId, movId, opts)`: nuevo 3er parámetro opcional `opts.desdeFeed === true` → hace todo igual pero **no** llama `abrirDeudor()` al terminar (el usuario se queda en la cuenta desde donde borró). Sin el parámetro (botón del detalle del deudor) el comportamiento es idéntico al de antes.

Validado con `node --check` y con un arnés de `vm` con stubs (módulo no cargado → `ensure('prestamos')` + delegación con `{desdeFeed:true}` + re-render; módulo ya cargado → sin `ensure`; id inexistente → toast de error; falla de carga → toast y sin efectos). **Sin prueba en navegador real.**

**Verificado después contra `cuentas.js` y `tarjetas_credito.js`:** (1) `getMovimientosCuenta()` y `_getMovimientosCuentaCustom()` arman cada fila de un préstamo — simple o por cada fuente de un préstamo dividido — con `_movId: m.id`, el id del movimiento del deudor, así que la delegación lo encuentra. (2) En el detalle de una TC, las filas `cargo_encargo`/`cargo_prestamo` no tienen botón de borrar (solo compras y pagos) y el sheet de detalle tampoco, así que un `cargo_prestamo` solo se puede eliminar borrando el préstamo en Préstamos (`eliminarMovDeudor`, rama `_viaTC`: revierte `tc.deuda` y quita la fila de `S.tcMovimientos` por `_deudorMovId`) — no queda ningún camino que borre un lado y deje el otro.

---

### ✅ Corregido (2026-09-19) — Las tarjetas de crédito aparecían en "¿A dónde entra el pago?" (abono / pago completo) y en "¿De dónde sacó la plata?" (préstamo nuevo)

En el sheet `sheet-registrar-movimiento`, con el modo simple (sin "Dividir ÷"), `initMovSheet()` poblaba `#mov_destino` y `#mov_fuente` con `poblarFuente(id)`, cuyo 3er parámetro `incluirTC` vale `true` por defecto, así que aparecía p. ej. "Nu Mastercard Gold (TC)" en los dos. Los modos divididos ya estaban bien (`_getAbonoDestinoFuentesOptions()` y `_getPrestSplitFuentesOptions()` usan `getFuentesSinTC()`). Fix: `poblarFuente('mov_fuente', false, false)` y `poblarFuente('mov_destino', false, false)` — sin helper propio, con el parámetro que el núcleo ya trae.

- **Destino de un abono / pago completo:** una TC nunca recibe plata entrante (pagarle a una TC es otro flujo, con su propio sheet en Tarjetas de crédito).
- **Fuente de un préstamo nuevo:** un préstamo pagado con TC tiene su flujo dedicado, el botón "Préstamo con TC" (`abrirSheetPrestamoTC()` / `confirmarPrestamoTC()`): valida el cupo (`tcCupoDisponible`), pide la descripción de la compra, suma `tc.deuda`, crea el cargo enlazado en `S.tcMovimientos` (`tipo:'cargo_prestamo'`, `_deudorMovId`), marca el movimiento con `_viaTC`/`_tcId`/`_tcMonto` y soporta el diferencial (margen) vía la instancia `'prtc'`. El camino simple solo hacía `descontarFuente('tc:...')` (que sí sube `tc.deuda`, verificado en `core-state.js`) y guardaba `fuente:'tc:...'`: sin validación de cupo, sin descripción y **sin el cargo `cargo_prestamo`**, así que `calcDeudaAjenaDeTarjeta()` no lo contaba como deuda ajena y `calcDeudaTcPropiaDeTarjeta()` lo trataba como deuda **propia** (simulado con las funciones reales del núcleo: un préstamo de $200.000 por el camino simple da deuda propia $200.000; por "Préstamo con TC", $0). Y peor: `refresh()` llama `tcNormalizarTarjetas()` (si Tarjetas ya cargó), que ejecuta `tcRecalcular(tc)` — reconstruye `tc.deuda` **desde** saldo inicial + compras + cargos (`cargo_encargo`/`cargo_prestamo`/`cargo_spotify`) − pagos. Un préstamo hecho por el camino simple nunca creó ninguna de esas filas, así que en el siguiente `refresh()` su deuda **desaparece de `tc.deuda`** (simulado con las funciones reales: tarjeta con $50.000 de compras propias + préstamo simple de $200.000 → deuda $250.000, y tras `tcRecalcular` vuelve a $50.000). Efecto para el usuario: la app muestra menos deuda de TC de la que el banco tiene, y el patrimonio queda inflado en ese monto (el saldo del deudor sigue sumando como activo).
- **Reversión de estos préstamos viejos:** `eliminarMovDeudor()` los revierte bien — `sumarFuente('tc:...')` devuelve la deuda (`Math.max(0, deuda - monto)`). Lo que faltaba era el cargo enlazado, no la reversión (y como `refresh()` recalcula `tc.deuda` desde los movimientos, borrar uno de estos préstamos tampoco deja la deuda desalineada). *(Una versión anterior de esta entrada decía que la deuda no se revertía: era incorrecto, corregido tras revisar `core-state.js`.)*

**Decisión de diseño — NO unir "Nuevo préstamo" y "Préstamo con TC" en un solo sheet.** Se evaluó y se descartó por ahora: (1) una TC no es una "fuente de plata" como Nequi o una cajita, es otro modelo de datos (descripción obligatoria, cupo, cargo enlazado, diferencial); (2) unirlos implicaba meter descripción, selector de TC y el motor `'prtc'` (ids `prtc-dif-*`) dentro del sheet más cargado de Préstamos (grupos, dividir, ganancia, encargo), con reglas de exclusión (TC no combina con Dividir ni con Ganancia); (3) el botón "Préstamo con TC" ya está al lado de "Nuevo préstamo" en el detalle de la persona; (4) sin prueba en navegador real, el riesgo de regresión en el sheet más usado no compensa. Si más adelante se quiere una sola entrada, la variante barata es que elegir la TC en `#mov_fuente` abra `abrirSheetPrestamoTC()` con monto/fecha/nota/grupo pre-llenados, reutilizando la lógica existente en vez de duplicarla.

**Confirmado por el usuario (2026-09-19): no existe ningún préstamo registrado por este camino (nunca supo que se podía), así que no hay datos que migrar. Se deja la nota por si aparece algún dato viejo importado.** Contexto del riesgo: préstamos viejos ya registrados por el camino simple con una TC de fuente (y, antes de la migración a `crearSplitWidget`, también por el modo dividido). Quedaron sin `_viaTC` ni `cargo_prestamo` y, por lo de `tcRecalcular()`, su deuda ya no está en `tc.deuda`. Si aparece alguno hay que migrarlo: quitar `fuente`/`fuentes` de TC, poner `_viaTC:true`, `_tcId`, `_tcMonto`, `_tcDesc` y crear el `cargo_prestamo` con `_deudorMovId`, y luego `tcRecalcular(tc)`. Se pueden listar desde la consola: `console.table(S.deudores.flatMap(d => (d.movimientos||[]).filter(m => m.tipo==='prestamo' && ((m.fuente||'').startsWith('tc:') || (m.fuentes||[]).some(f => (f.fuente||'').startsWith('tc:')))).map(m => ({persona:d.nombre, monto:m.monto, fecha:m.fecha, fuente:m.fuente}))))`.

Se revisaron los demás selects de plata entrante de este módulo: `nd_destino` (nuevo deudor), `md_cuenta` (Yo debo — "me prestó más") y las filas de "guardar en cuenta" del extra ya usaban `getFuentesSinTC()`; `mov_enc_cuenta` se llena con las cuentas del propio encargo, no con la lista general. Sin más casos en `prestado.js`/`index.html`.

Validado con `node --check` (sin errores). **Sin prueba en navegador real.**

---

### 🗑️ Eliminado (2026-09-09) — Código muerto del sheet "Nueva persona" viejo (`addDeudor()`, color picker, sheet completo)

*(el hallazgo ya estaba documentado desde el 2026-07-27 en `auditoria-tecnica.md`, pero nunca se había borrado — solo anotado)*

Confirmado de nuevo antes de tocar nada: el override de `openSheet()` en el propio `prestado.js` intercepta `id==='nueva-persona'` con un `return` antes de mostrar el sheet original, redirigiendo siempre a `abrirSelPersona(_onSelPersonaMeDeben)` (el selector genérico de Personas). El sheet `#sheet-nueva-persona` nunca se muestra, así que nada de lo que solo se dispara desde ahí tiene ya una vía de ejecución real.

Borrado en `prestado.js`: `npColorSel`, `selColor()`, el wiring `[data-pick-color]`, `initColorPicker()`, `addDeudor()` (función original), la entrada `addDeudor: addDeudor,` del objeto de registro de acciones, y el wrapper `_origAddDeudorPersonas`/reasignación de `addDeudor` (vinculaba el deudor nuevo a `S.personas`, pero nunca corría porque nadie llamaba a `addDeudor()`). Se borraron la función y el wrapper en la misma pasada para no dejar `const _origAddDeudorPersonas = addDeudor` apuntando a un identificador ya inexistente — esa línea corre a nivel superior del archivo, al parsear, así que un `ReferenceError` ahí tumba la carga completa de `prestado.js`, no solo esta feature.

Borrado en `index.html`: el sheet `#sheet-nueva-persona` completo (overlay, título, input de nombre, los 6 círculos `data-pick-color`, y los botones "Crear persona"/"Cancelar"). Confirmado además que `btn-crear-deudor` no tenía ningún listener en ningún archivo — estaba huérfano del todo, ni siquiera le faltaba wiring.

No se tocó `abrirSheetNuevaPersona`/`_abrirSheetNuevaPersona` ni el override de `openSheet` — siguen siendo el camino real y en uso hoy hacia el selector de Personas.

Validado con `node --check` (sin errores) y balance de etiquetas en `index.html`: −14 `<div>`/−14 `</div>` y −2 `<button>`, exactamente lo que traía el bloque removido (6 círculos + overlay + sheet + 2 `ig` + título + `np_colores` = 14 divs; "Crear persona" + "Cancelar" = 2 buttons), confirma que no se arrastró ni de más ni de menos. **Sin prueba en navegador real.**

### ✅ Corregido (2026-09-01) — Protección por antigüedad se activaba en préstamos/abonos "Ganancia"/"Sin especificar" que no movían ningún saldo

Mismo bug encontrado primero en Mesada — detalle completo, causa y fix en `CHANGELOG.md#mesada`. Resumen: `eliminarMovDeudor()`, su duplicado en `movimientos.js` (rama `'prestamo'`/`'abono'`) y `eliminarMovMiDeuda()` calculaban el nivel de antigüedad sin verificar antes si había algo real que revertir. Nuevas `_deudorTieneCuentaAfectada(m)` / `_miDeudaTieneCuentaAfectada(m)` gatean ese cálculo.

### 🗑️ Eliminado por diseño — Botón "Devolver a donde salió el préstamo"

Se quitó el atajo del sheet de abono/pago-completo que, al registrar un pago, prellenaba automáticamente el destino con la(s) misma(s) cuenta(s) de donde había salido el préstamo original (`mov_btn_origen` + los badges de `mov_origen_tags`).

Eliminado por completo: `movSetOrigenBtn()` (calculaba las fuentes del último movimiento tipo `'prestamo'` del deudor y pintaba los tags), `abonoAplicarOrigen()` (aplicaba esas fuentes como destino, en modo simple o dividido), su entrada en el objeto de exportación de `Events`, el precargado del botón al abrir el sheet (`if (tipo === 'abono' || tipo === 'pago-completo') ...`), el reset de sus elementos al abrir cualquier sheet de movimiento, y el markup del botón/badges en `index.html`.

Se dejó intacto el flujo manual de "Dividir ÷" del destino (`_abonoSplitMode`/`_abonoSplitRows`/`abonoRenderSplit`/`toggleAbonoSplit`/`abonoAddSplitRow`), que es independiente — solo servía como atajo para prellenarlo, no como su base.

### ✅ Corregido — Dos `toast()` de "recién creado" sin escapar (`addDeudor()`, `crearMiDeuda()`)

*(2026-07-30, confirmando el módulo contra su código fuente por primera vez)*

El módulo ya era cuidadoso en general (49 usos de `escHtml()`, incluyendo la mayoría de sus `toast()` con nombre de persona) — pero los dos `toast()` de "recién creado" se quedaron sin envolver, mientras que los de eliminar, error y advertencia de saldo sí escapaban bien el mismo campo. A diferencia de los hallazgos anteriores de este mismo patrón en otros módulos (donde solía faltar en todos los sitios, o en ninguno), acá se rompió justo en dos de más de una decena de sitios similares — confirma que "el módulo ya es cuidadoso" tampoco es garantía completa. Corregido con `escHtml()` en ambos. Un tercer sitio del mismo patrón (`guardarEditarMiDeuda()`) apareció después, el 2026-08-17 — ver `CHANGELOG.md#infraestructura--seguridad`.

Préstamos (`prestado.js`) sigue sin migrar a `html\`\`` — el único módulo que queda pendiente de esa migración (ver `auditoria-tecnica.md`, punto 2).

### ✅ Corregido (2026-08-28) — Migrado a `html\`\``: campo `p.quien` sin escapar en el reparto del extra

*(sesión posterior, tercero y último de los tres módulos que quedaban)*

Convertidos todos los puntos de renderizado con texto libre: `_renderPrestSplit()`/`_updatePrestSplitResumen()` (split de fuente del préstamo, incl. aviso de impacto en cajitas), `renderDeudoresList()`, `abrirDeudor()` (historial completo de "Me deben", con agrupamiento por `grupoId` en acordeón — la función más grande del módulo), `_initMovGrupoSelector()`, el selector de encargo y el de cuenta del encargo en el flujo de abono, `abonoRenderSplit()`, `extRenderPartes()`/`extResumenPartes()` (reparto del extra: guardar/gastar/regalar), `renderMisDeudasList()`, `abrirMiDeuda()` (historial de "Yo debo"), los dos selects "Sin especificar" y `abrirSheetPrestamoTC()`/`_abonoEncCuentaSplitPreview()`. Sin shadowing de `let html=''` esta vez — primera vez que no se repite ese hallazgo puntual desde que empezó a aparecer en Mesada.

**Hallazgo real, en `extRenderPartes()`:** el campo `p.quien` ("¿A quién?" del reparto "regalar" del extra de un abono) se interpolaba en `value="${p.quien||''}"` sin ningún escapado — ni siquiera `escHtml()` manual, a diferencia de su hermano `p.desc` (reparto "gastar"), que sí estaba cubierto desde el barrido original. Duodécimo campo nuevo que reincide en este patrón. Cerrado al migrar.

**Doble-escapado en `desc:`/`nota:` horneados — resuelto (2026-08-28, sesión posterior), misma familia que Encargos:** varios `desc:`/`nota:` que este módulo escribe en movimientos de *otras* cuentas (`cuentas.js`, `encargos.js`, `S.tcMovimientos`) venían con `escHtml(d.nombre)`/`escHtml(enc.nombre)`/`escHtml(tc.nombre)` horneado al guardarse; como esos módulos escapan en su capa de render (`html\`\``), quedaban doble-escapados si el nombre tenía `&`/comillas. Corregidos los 13 sitios identificados (`confirmarMovimiento()` — abono simple, split y destino; `confirmarMovMiDeuda()` — recibido y pagado; `confirmarPrestamoTC()` — nota del préstamo y `S.tcMovimientos`; el "extra" repartido a gasto/ingreso/guardado), junto con los 8 sitios equivalentes de `encargos.js` en la misma sesión — ver `CHANGELOG.md#encargos`.

Validado con `node --check` y una simulación (implementación real de `html`/`raw`/`escHtml`, sin DOM) con payloads maliciosos en el campo `p.quien` recién cerrado, el nombre de deudor (texto y atributo `title`), la `nota` de un movimiento dentro del agrupamiento por grupo (confirma que el join de fragmentos `html\`\`` ya escapados vía `raw()` no dobla el escapado del badge `_fuenteLabelHtml()` anidado), y el `opts` de `_renderPrestSplit()` (string pre-escapado a mano envuelto en `raw()`, confirma que no se re-escapa). Los cuatro casos pasaron. **Sin prueba en navegador real.**

Con esto quedan migrados a `html\`\`` los tres módulos que faltaban (Encargos, Cuentas, Préstamos) — todos los módulos con `.js` propio están migrados.

### 🔄 Cambiado (2026-09-07) — El balde por defecto de grupos de préstamo ya no es "Préstamo `<fecha>`" sino "Histórico", y nunca se cierra solo

*(reportado por el usuario: le apareció un grupo/acordeón en el historial de "Madre" sin haberlo creado a propósito)*

Causa: un deudor sin grupos abiertos (`_gruposAbiertos(d).length === 0`) disparaba `_autoGrupoIdMov()` → `_crearGrupoDeudor(d, fecha)`, que crea un grupo nuevo con nombre autogenerado `"Préstamo " + fecha`. Eso pasa cada vez que el único grupo existente llega a saldo $0 y `_autoCerrarGruposEnCero()` lo cierra solo — el siguiente préstamo que se registre, aunque el usuario no toque el checkbox "🆕 Es un préstamo aparte", cae en "0 grupos abiertos" y arranca uno nuevo sin preguntar. Es el comportamiento que documentaba §2.4 de `prestado.md` ("0 grupos abiertos → se crea uno automático, sin preguntar"), pero en la práctica sorprende: el usuario nunca pidió separar nada, solo quería que el préstamo nuevo siguiera en el mismo historial de siempre.

Fix: nuevo helper `_getOrCrearHistorico(d, fecha)` (reemplaza la creación inline que solo vivía en `_migrarGruposDeudor`). `_autoGrupoIdMov()` ahora usa ese helper en el caso de 0 grupos abiertos en vez de `_crearGrupoDeudor` — el balde por defecto pasa a ser siempre "Histórico" (mismo grupo que ya se usaba para migrar deudores viejos), nunca uno con nombre de fecha. Y `_autoCerrarGruposEnCero()` ahora excluye explícitamente `id === '_historico'` de su lógica de auto-cierre, así que ese grupo nunca se cierra solo aunque su saldo llegue a $0 — se queda contando como "1 grupo abierto" para siempre.

Efecto práctico: mientras el usuario no marque a propósito el checkbox "🆕 Es un préstamo aparte" (o use el selector cuando ya hay ≥2 grupos), **todo** cae en Histórico sin acordeón — igual que el historial plano de antes de que existieran los grupos —, sin importar cuántas veces el saldo pase por $0. Solo se crea un grupo nuevo cuando el usuario lo pide explícitamente.

**No se migraron los datos existentes** — el usuario decidió no fusionar retroactivamente los grupos con nombre de fecha ya creados en "Hermanito" y "Madre" (ver backup del 2026-09-07); esos dos deudores se quedan con su acordeón actual, el fix solo aplica a movimientos nuevos de ahí en adelante.

Validado con `node --check`. **Sin verificar en navegador real.**

### 🐛 Corregido (2026-09-04) — "Préstamo con TC" dejaba guardar un monto mayor al cupo disponible de la tarjeta

*(reportado por el usuario: podía registrar el préstamo aunque la tarjeta no tuviera cupo disponible, y el mismo problema aparecía usando "el valor real era diferente")*

`confirmarPrestamoTC()` nunca validaba cupo disponible antes de sumar `montoTC` a `tc.deuda` — a diferencia de `confirmarCompraTC()` (Tarjetas de crédito), que sí lo hace siempre. El segundo síntoma reportado (usando el diferencial) tenía la misma causa: como no había ninguna validación de cupo, daba igual si el monto que finalmente cargaba la tarjeta era el nominal o el "valor real" calculado por `diffCalcular('prtc')`.

Fix: se agregó `if (tc.cupo && tcCupoDisponible(tc) < montoTC) { toast(...); return; }` justo después de calcular `montoTC` (antes de tocar `d.movimientos`, `tc.deuda` o `S.tcMovimientos`) — mismo patrón que `tarjetas_credito.js:confirmarCompraTC`. Se validó contra `montoTC` (lo que realmente carga la tarjeta) y no contra `dijo` (lo que se le dijo al deudor) a propósito, para que la validación no se salte cuando hay diferencial activo. Distinto del caso de "Compra con TC" de Encargos (`confirmarCompraConTC`), que sigue sin validar cupo — ver `tarjetas-credito.md` para por qué ahí sí se justifica no validar (cargo bancario/de terceros) y acá no (decisión de gasto propia). Validado con `node --check`. **Sin verificar en navegador real.**

---

## Wrapped

### 🔧 Cambio (2026-09-21) — Reordenamiento y limpieza de fechas en wrapped.md

Las secciones de "Decisiones de diseño" numeradas con ordinales latinos (§7bis a §7terdecies) no estaban en orden: §7bis (por qué el overlay vive en `document.body`) aparecía después de §7decies. Se reordenaron numéricamente. Se quitaron las fechas sueltas de los títulos de esas secciones (el contenido y el razonamiento de cada una se mantienen intactos; las fechas no aportaban a entender el diseño actual). Verificado contra `wrapped.js`: las ~50 funciones citadas en la Referencia de implementación existen todas (o, en el caso de `_wrappedRenderAnio`, se confirma que ya no existe — la tabla lo documenta correctamente como reemplazada).

## Tarjetas de crédito

### 🔧 Cambio (2026-09-22) — Eliminado un sistema de "cuotas" documentado que no existe en el código

`tarjetas-credito.md` describía un sistema completo de compras a cuotas (`esCuotas`, `numCuotas`, `valorCuota`, `cuotasPagadas`, y las funciones `tcCalcularValorCuota`, `tcValorUltimaCuota`, `tcIncrementarCuotaPagada`) en §2, §4, §5, §7 y §8. Ninguno de esos nombres aparece en `tarjetas_credito.js` — `tcCrearCompra()` no tiene esos campos. Se quitó por completo de las cinco secciones.

También se corrigió la atribución de tres funciones que la Referencia de implementación listaba como propias del módulo sin decir dónde viven de verdad: `getTCById`, `tcCupoUsadoPct` y `tcCupoDisponible` se movieron a `js/core/calc-helpers.js` (comentario propio del archivo, "RESUELTO 2026-08-04"); `calcDeudaAjenaDeTarjeta` y `calcDeudaTcPropia` viven en `js/core/core-state.js`. Se quitó `calcDeudaTcPropiaDeTarjeta`, que no existe en ningún archivo.

(Corrección sobre esta misma entrada: con `core-state.js` a la vista se confirmó que `calcDeudaTcPropiaDeTarjeta` sí existe ahí — se había quitado por error al no tener ese archivo disponible en el momento del primer pase; se restauró con la atribución correcta, junto con `calcSaldoInicialPendiente`. También se corrigió el orden real de cancelación de un pago en §3: primero el saldo inicial pendiente, luego lo ajeno, luego lo propio — antes decía solo "ajena primero, luego propia", sin mencionar el saldo inicial.)

## Cuentas

### ✅ Corregido (2026-09-29) — Alcancía: destape a cuenta personalizada duplicaba filas y contaba como ingreso; depósitos sin orden por fecha

**1. Destape hacia una cuenta personalizada.** `_sumarASaldo()` (`alcancia.js`) además de subir el saldo escribía en `c.movimientos` un `ingreso` "Alcancía destapada" (y un `egreso` para el faltante). Esas mismas filas ya se guardan en `S.movimientos` y `S.gastosVar`, y el historial de la cuenta (`_getMovimientosCuentaCustom`) lee de ambos lados, así que salían dobles. Efectos: (a) el saldo registrado (plata que ya era tuya) contaba como **ingreso del mes** en Salud financiera, (b) el sobrante contaba **dos veces** (una por `c.movimientos` y otra por la entrada de `S.movimientos`), (c) el feed mostraba "+ ingreso" repetido. **Fix:** `_sumarASaldo()` ahora solo mueve `c.saldo`. Para datos viejos: `_esEntradaEspejoNoIngreso()` (`core-state.js`) ignora la desc exacta `Alcancía destapada`, y `_normMovimientos()` (`actividad_reciente.js`) salta las filas viejas de cuentas personalizadas con esa desc o "Ajuste alcancía — faltante". **Limitación:** el historial de la propia cuenta (`cuentas.js`) no se tocó, así que en destapes anteriores a hoy puede seguir mostrando la fila doble.

**2. Orden de "Movimientos actuales".** La lista de depósitos se pintaba en orden de registro invertido, no por fecha: un depósito anotado tarde con fecha 23 quedaba arriba del 25 y el 24. Ahora se ordena por fecha del depósito (desc) y, a igual fecha, por `ts` (desc). Archivo: `alcancia.js`, `renderAlcancia()`.

**Verificación:** `node --check` OK en los 3 archivos; prueba con datos sintéticos: `_sumarASaldo('custom:…')` cambia el saldo (100 → 130) sin dejar filas en `c.movimientos`, y las fechas 23/25/24 salen 25, 25, 24, 23. **Sin verificar en navegador real.**

### 🔧 Cambio (2026-09-28) — Transferir: sin centavos fuera de cajitas de Nu, y mínimo $50 con Efectivo

*(pedido del usuario: en la vida real no existe dinero físico en centavos, y Nequi tampoco deja mover $9,90 desde Nu)*

**Regla nueva en `confirmarTransferir()` y en la vista previa:** solo entre dos cajitas de Nu se aceptan centavos. Si el origen o el destino es Nequi, Efectivo o una cuenta personalizada, el monto debe ser entero. Si Efectivo interviene en cualquiera de los dos lados, el mínimo es $50. Antes se podía transferir cualquier monto ≥ $0,01 entre cualquier par de cuentas.

**Fix:** función `_trValidarMonto(origen, destino, monto)` en `cuentas.js`, llamada desde `actualizarTransfPreview()` (mensaje ámbar, sin mostrar el resumen de saldos) y desde `confirmarTransferir()` (toast de error, no mueve nada). Una sola función para las dos, para que no puedan decir cosas distintas. No cambia qué cuentas se ofrecen ni el mínimo de $1,00 para poder abrir "Mover a otra cuenta".

**Alcance:** solo el sheet Transferir de Cuentas. No toca otros flujos que también mueven plata hacia Efectivo (gastos, Encargos, abonos, etc.).

---

### 🐛 Corregido (2026-09-27, mismo día) — Buscador global: ignoraba tildes, y un depósito de Alcancía sin cuenta de origen aparecía como "Movimiento" en vez de "Ahorro"

*(pedido del usuario: buscar "alcancia" sin tilde no encontraba "Depósito en alcancía"; y notó que, de los 9 resultados de Alcancía, uno salía agrupado aparte bajo "Movimiento" en vez de bajo "Ahorro" con los otros 8)*

Dos hallazgos independientes en `busqueda-global.js`:

1. **Sin normalización de tildes.** Las 18 comparaciones del archivo (`(campo||'').toLowerCase().includes(q)`, una por cada tipo de dato buscable) comparaban texto tal cual, así que "alcancia" (sin tilde, lo más natural al escribir rápido en el celular) no hacía match con "alcancía". Fix: cada comparación (25 ocurrencias en total, contando las que combinan varios campos con `||`) ahora encadena `.normalize('NFD').replace(/[\u0300-\u036f]/g,'')` después de `.toLowerCase()`, separando la tilde de la letra base y descartándola — tanto en `q` (lo que escribe el usuario) como en cada campo contra el que se compara. Efecto general, no solo para Alcancía: cualquier búsqueda con acentos deja de ser sensible a si el usuario los tipeó o no.

2. **El depósito `yo-directo`/`regalo`/`mandado` (sin cuenta de origen, vive en `S.movimientos` con `_esAlcanciaIngreso`) tenía el mismo bug de fondo que ya se había corregido para los depósitos con cuenta** (ver entrada de arriba, mismo día): el bloque que busca en `S.movimientos` fijaba `tipo:'Movimiento'` sin mirar la bandera, así que agrupaba aparte de los demás depósitos de Alcancía. Además, su "Ir ahí" navegaba a Efectivo — engañoso, porque `fuente:'efectivo'` en estas entradas es un truco interno de `alcancia.js` para que cuenten en `ingresosMes()`, no el lugar real del registro; `cuentas.js` las salta del historial de Efectivo a propósito (ver `alcancia.md` §7). Fix: cuando `m._esAlcanciaIngreso`, el resultado agrupa como "Ahorro" (se une a los depósitos con cuenta) y navega a `alcancia` en vez de a `efectivo`.

Validado con `node --check` y una prueba puntual en Node confirmando que `"Depósito en alcancía".normalize('NFD')...` sí contiene `"alcancia"` sin tilde. **Sin verificar en navegador real.**

### 🔧 Cambio (2026-09-27) — Los depósitos a la Alcancía con cuenta de origen dejan de vivir en `S.gastosVar`: ahora son una transferencia (`S.transferencias`, `destino: 'alcancia'`)

*(pedido del usuario: notó que el buscador global mostraba los depósitos a la alcancía como "Gasto variable" — al revisar el porqué, planteó que conceptualmente nunca debieron contar como gasto, sino como un traslado entre cuentas, "así traiga riesgos" hacerlo bien)*

Diagnóstico de fondo (más allá del bug puntual del buscador, ya corregido antes de esta entrada — ver más abajo): un depósito `yo-cuenta`, o la parte con cuenta de un `multi`/`split`, es plata que sigue siendo tuya — un traslado, no un gasto. Ya se trataba así en las **cifras** (`_esGastoVarNoReal()` los excluye de "gasto real" desde antes, y `calcPatrimonioTotal()` los cuenta neto-cero como cualquier traslado), pero la **implementación** vivía como una excepción sobre `S.gastosVar` (`_esAlcancia: true`) que cada pantalla nueva tenía que recordar excluir a mano: `_esGastoVarNoReal()` (Análisis/Inicio/Salud/Presupuestos), `actividad_reciente.js`, el historial de cada cuenta en `cuentas.js`, y — el síntoma que disparó esto — `busqueda-global.js`, que ocultaba el monto pero seguía agrupando el resultado bajo "Gasto variable" porque el `tipo` del resultado estaba fijo al string literal, sin mirar la categoría real.

Cambio: estas dos situaciones (`yo-cuenta`, y la parte con `origen:'cuenta'` de un `multi`) ya no se guardan en `S.gastosVar`. Se guardan en `S.transferencias` — la misma tabla y el mismo mecanismo (`descontarFuente`/`sumarFuente`) que usa `confirmarTransferir()` en Cuentas para cualquier traslado entre cuentas reales — con `origen: <cuenta elegida>, destino: 'alcancia'`. `'alcancia'` se agregó como destino reconocido solo para este flujo interno; **no** se agregó a `getFuentes()`/`getFuentesSinTC()`, así que sigue sin poder elegirse desde el sheet genérico "Transferir" — el depósito real sigue siendo un flujo propio de Alcancía, con sus propias reglas de ofuscación y borrado.

Archivos tocados:

- **`alcancia.js`** (`alcanciaConfirmarDeposito`, `_alcanciaEjecutarEliminarDeposito`): al depositar, push a `S.transferencias` en vez de `S.gastosVar`, y `descontarFuente(cuenta, monto)` en vez del truco `sumarFuente(cuenta, -monto)`. Al eliminar, nueva función `_alcQuitarMirrorCuenta(id)` que filtra el espejo de `S.transferencias` (y, como red de seguridad, también de `S.gastosVar` por si queda algún registro sin migrar) — cubre `yo-cuenta`, `split` legado con `_splitFuente`, y cada parte con `origen:'cuenta'` de un `multi`.
- **`cuentas.js`** (`getMovimientosCuenta()`, `_getMovimientosCuentaCustom()`): el bucle que ya listaba `S.transferencias` en el historial de cada cuenta ahora reconoce `destino==='alcancia'` y arma la fila igual que antes (monto oculto, `tipo:'alcancia'`, `_secundario:true`, `_origenSeccion:'Alcancía'`, sin `_otrasCuentas` porque la alcancía no es una cuenta navegable). `renderMovsCuenta()` no se tocó — ya renderizaba estas filas genéricamente a partir de esos mismos flags, vinieran de donde vinieran.
- **`busqueda-global.js`**: nueva sección que busca en `S.transferencias` (`destino==='alcancia'`), agrupa el resultado como "Ahorro" (antes "Gasto variable", el bug original) y navega directo a la pantalla de Alcancía (`navTipo:'alcancia'`, nuevo ícono). La rama vieja que ocultaba el monto en `S.gastosVar` se deja como red de seguridad — ya no debería encontrar ningún `_esAlcancia` ahí.
- **`core-state.js`**: un agregado de una línea, `fuenteLabel('alcancia')` → `"Alcancía"` (antes devolvía el string crudo). Sin cambios en `descontarFuente`/`sumarFuente`/`getFuentes` más allá de eso — `S.alcancia.saldoRegistrado` lo sigue manejando `alcancia.js` directamente, no a través de estas funciones, para no duplicar la suma que ya hace por separado.
- **`_esGastoVarNoReal()`, `calcPatrimonioTotal()`, `analisis.js`, `inicio.js`**: sin cambios — no hacía falta. El primero conserva su chequeo de `_esAlcancia` como red de seguridad para datos viejos; el segundo ya sumaba `S.alcancia.saldoRegistrado` aparte, así que el patrimonio no se mueve ni un peso.
- **`actividad_reciente.js`**: revisado, sin cambios. Nunca leyó `S.transferencias` (ni para estos depósitos ni para transferencias normales entre cuentas — hueco preexistente sin relación con este cambio), así que el depósito sigue sin aparecer en Actividad reciente, exactamente igual que antes.

**Migración del historial existente:** los depósitos ya guardados (formato antiguo, en `S.gastosVar` con `_esAlcancia:true`) se migraron a `S.transferencias` en un backup exportado, con verificación de que ningún saldo de cuenta cambia (`nequiSaldo`, `efectivoSaldo`, saldo de cada cajita, y `S.alcancia` completo idénticos antes/después — solo cambia dónde vive el registro-espejo) y que la suma migrada coincide exacto entre origen y destino. Incluye un caso legado real: un depósito `split` (formato previo al 2026-08-06, con `_splitFuente`) donde solo la parte con cuenta ($1.800 de $2.000) se migra — la parte de mamá sigue en `S.movimientos` sin tocar, fuera de alcance de este cambio.

Documentado en `alcancia.md` §3 y §4 (tabla de movimientos espejo). **Sin verificar en navegador real ni con `node --check` — pendiente antes de desplegar.**



Reportado por el usuario: depositó $70.000 hoy en el encargo "Madre" (que vive en la cajita Nu "Madre"), y al poco rato el saldo de la cajita ya mostraba ~$239 de más — sin que hubiera pasado ni una hora, muchísimo menos un día.

Causa raíz: `calcC()` calcula `saldoEncargos=_saldoEncargosEnCajita(c.id)` — el saldo del encargo **de hoy** (`_saldoEncargosEnCuenta()` suma todos los movimientos sin filtrar por fecha) — y lo mete en `saldoBase` para componer interés sobre **todo** el rango de días desde `c.fecha` (última materialización) hasta hoy. Si la cajita no se materializaba hacía 15 días y el encargo recibió plata nueva hoy, la fórmula la trataba como si hubiera estado ahí generando interés los 15 días completos. Reconstruido con el backup real del usuario: cajita "Madre" con `c.saldo=81.16`, `c.fecha='2026-09-10'` (último chequeo); el encargo tenía $111.000 un solo día (9-10→11, antes de gastarse) y $70.000 depositados hoy. El cálculo viejo daba `ganado=$256,58` sobre esos 15 días; el correcto es `ganado=$27,44` (básicamente el único día real en que hubo plata ajena de más: los $111.000 del 10 al 11).

Fix: `calcC()` ahora parte el cálculo también en cada fecha en que cambió el saldo de encargos dentro de la cajita (no solo en cambios de tasa EA), reconstruyendo con dos funciones nuevas — `_saldoEncargosEnCajitaEnFecha(cajitaId, fecha)` (saldo de encargo *a una fecha pasada*, no el de hoy) y `_fechasCambioEncargoEnCajita(cajitaId, desde, hasta)` (los puntos de quiebre). Cada tramo compone con el saldo de encargo que realmente había vigente en ese tramo, igual que ya se hacía con los tramos de tasa. Validado con `node --check` y una simulación con los datos reales del backup del usuario, comparando la versión vieja vs. la corregida (ver arriba). **No corrige retroactivamente saldos ya inflados por el bug** (p. ej. el de "Madre" en este caso) — eso requiere un chequeo manual del usuario contra el valor real de Nu. **Sin verificar en navegador real.**

Documentado en `cuentas.md` §3 (nueva regla, análoga a la de tramos de tasa), §6 (caso especial) y §8 (`calcC()` no estaba en la tabla de funciones clave — se agregó junto con las dos funciones nuevas).

### 🔧 Cambio (2026-09-21) — Corrección de un dato desactualizado en cuentas.md

`cuentas.md` §2 decía que el saldo inicial se marca con un campo `_esApertura`; el código real usa `tipo:'apertura'` en el movimiento — no existe tal campo. Se corrigió. También se limpiaron comentarios que narraban una corrección de documentación ya resuelta (dentro del bloque de código del modelo de datos) y fechas de CHANGELOG incrustadas en la referencia de implementación, que ya viven en `CHANGELOG.md#cuentas`.

### ✨ Agregado (2026-09-20) — "Mover a otra cuenta" solo se activa con saldo ≥ $1,00; el origen de Transferir exige ≥ $1,00

- **Botones "Mover a otra cuenta"** (Nequi, Efectivo, Nu, cuenta personalizada, cajita): quedan `disabled` (atenuados, con `title`) si la cuenta tiene menos de $1,00. Nu se habilita si alguna cajita (no CDT) tiene saldo movible. Los botones estáticos de Nequi/Efectivo/Nu no tenían `id`: se agregaron `btn-transferir-nequi-det`, `btn-transferir-efectivo-det` y `btn-transferir-nu-det`. El estado se recalcula en `actualizarBotonesTransferir()`, llamada desde `renderDetalleCuenta()`, el detalle de cuenta personalizada y el de cajita (o sea, tras cada `save()`+`refresh()`).
- **Sheet "Transferir entre cuentas":** el origen pasó de `saldo > 0` a `saldo ≥ $1,00` (vía `FuentesFiltro`), así no aparecen cuentas con centavos sueltos. **El destino sigue sin filtrarse** (ya estaba así a propósito, ver `cuentas.md`): la plata entra, y una cuenta vacía es un destino válido.
- **`abrirTransferir()` avisa y no abre** si ninguna cuenta tiene saldo ≥ $1,00. Cubre los caminos que no pasan por los botones: la tarjeta "Transferir" del menú `+` y el botón "Transferir" dentro de "Sumar dinero". Reemplaza a la opción "No tenés cuentas con saldo disponible" del select de origen, que ya no puede quedar vacío porque el sheet no se abre.
- **No se tocó "Sumar dinero" (¿A dónde entra la plata?):** su campo "¿De dónde viene esta plata?" es una descripción en texto libre (no un select) y "Cuenta destino" recibe plata, así que no aplica filtrar por saldo.


### ✅ Corregido — 12 sitios de `.innerHTML`/`toast()` sin escapar

*(2026-07-22, durante la migración a `data-action`, antes de `html\`\``)*

Al migrar Cuentas — el módulo más grande extraído hasta ese momento (Nequi, Efectivo, cuentas personalizadas y todo el subsistema de Nu: cajitas, tasa EA con historial por tramos, CDTs y metas de ahorro) a un solo `js/modules/cuentas.js` — se repitió, quinta vez seguida, el mismo hallazgo: nombre de cuenta personalizada y nombre de cajita sin escapar en `toast()` (crear/editar cuenta, cobrar CDT), nota/descripción libre del usuario sin escapar en cuatro `toast()` distintos (agregar dinero, sumar/restar en Nu, restar dinero), y `fuenteLabel()` sin escapar en el sheet de transferir (dos en `.innerHTML` del preview, tres en `toast()`) — 12 sitios en total, el conteo más alto hasta ese momento. Todos corregidos con `escHtml()`.

**Código muerto encontrado (no se tocó):** `toggleCDT()`, `toggleCajita()` y `_expandCajitaCDTs()` ya no los llama nadie — trabajan sobre ids que el render actual de cajitas ya no genera. Anotado en `cuentas.md`, no borrado de paso.

### ✅ Corregido (2026-08-28) — Migrado a `html\`\``: hallazgo real de escapado en el buscador de movimientos

*(sesión posterior, segundo de los tres módulos que quedaban)*

Convertidos todos los puntos de renderizado con texto libre: `renderIconoCustom()` (incl. el fallback de `iniciales` derivadas de `c.nombre`), `renderCustomCuentasList()`, `abrirCustomCuenta()`, `poblarChequeoNu()`, `_renderMetaAportes()` (nombre de aportante de meta), `renderCajitas()`, `abrirSubMeta()`, `abrirSubCDTs()` (mismo shadowing de `let html=''` visto en Mesada/Gastos/Plata Comprometida/TC/Encargos, renombrado a `contenido`), `renderMovsFiltros()`, `renderMovsCuenta()` (la función más grande del módulo: `desc`, `nota`, `cat`, `fecha`, `_origen`, `_origenSeccion`, `fuenteLabel()`), `renderBannerApertura()`, `_nuMovRenderCajitas()`, los dos selects de fuentes (`openSheet_adMenu()`, `abrirTransferir()`) y `actualizarTransfPreview()`. `renderIconGrid()` también se migró por consistencia, sin hallazgo (`ic.label` es un valor fijo, no texto libre).

**Hallazgo real, el más serio de este módulo:** en `renderMovsFiltros()`, el término de búsqueda (`f.q`, texto libre que el usuario escribe en el buscador de movimientos) se interpolaba directo en `value="${f.q}"` sin pasar por `escHtml()` en ningún momento — a diferencia de los filtros de fecha, que sí eran valores controlados. Con comillas en el término buscado se podía romper el atributo `value` e inyectar HTML/atributos arbitrarios en el propio input de búsqueda. Cerrado al migrar.

Validado con `node --check` y una simulación jsdom (con la implementación real de `js/core/html-tag.js`) inyectando un payload malicioso (`<img src=x onerror=alert(1)>"'&<script>alert(2)</script>`) en nombre de cuenta/cajita/aportante y en `desc`/`nota`/`cat` de un movimiento, más un segundo payload (`"><img src=x onerror=alert(3)>`) específico para el término de búsqueda de `renderMovsFiltros()`. Todos los checks pasaron sobre el DOM ya parseado (cero `<script>`/`img[onerror]` ejecutables creados; el payload del buscador queda contenido como `.value` del input, no como marcado inyectado). **Sin verificar en navegador real.** Se revisaron los ~10 sitios de `.innerHTML=`/`.textContent=` que quedaron sin convertir: todos strings fijos del código (textos de UI, íconos, números ya formateados), sin texto libre — no son hallazgo.

### ✅ Confirmado (2026-08-28, sesión posterior) — Sin cambios necesarios para el cierre del doble-escapado de Encargos/Préstamos

El hallazgo de `desc:`/`nota:` horneados con `escHtml()` (ver `CHANGELOG.md#encargos` y `CHANGELOG.md#prestado`) se cerró quitando el `escHtml()` en el punto de *guardado*, en `encargos.js` y `prestado.js`. `cuentas.js` no necesitó ningún cambio: `renderMovsCuenta()` ya interpola `m.desc`/`m.nota` crudos dentro de `html\`\`` (línea ~2071/2084), sin escape manual — exactamente el comportamiento que el resto del fix asume. Validado con `node --check` y una simulación con `escHtml`/`html\`\`` reales confirmando el paso de doble-escapado (`&amp;amp;`) a escapado simple (`&amp;`).

### ✅ Corregido (2026-08-30) — `_movId` de cobros de Spotify sin id quedaba `null`: sin candado, sin `data-mov-id`, sin criterio de orden

Encontrado al revisar un movimiento real del detalle de la cuenta Nu que aparecía sin ningún ícono a la derecha (ni botón de borrar, ni el candado de "Automático — elimínalo desde Spotify" que sí tienen los demás cobros de Spotify). Causa: tanto `getMovimientosCuenta()` (línea ~1892) como `_getMovimientosCuentaCustom()` (línea ~1747) arman cada cobro de Spotify con `_movId: h.id || null` — si el registro de `S.spotifyHistorial` no tiene campo `id`, `_movId` queda `null`, y `renderMovsCuenta()` solo dibuja el candado cuando `esSecundarioHist && m._movId` es verdadero. El comentario justo arriba de esa línea, en ambas funciones, ya decía *"fabricar un `_movId` estable a partir del índice para que el sort funcione"* — pero nunca se había implementado, así que el fallback prometido no existía.

El registro afectado en el backup del usuario era el cobro más viejo (Samuel, 2026-06-02) — de antes de que la app empezara a asignarle `id` a cada cobro de Spotify. Se parchó ese dato puntual (se le generó un `id` con el mismo formato de `uid()`) y, por separado, se implementó el fallback que el comentario ya prometía en las dos funciones: `_movId: h.id || ('sp_legacy_' + índice del registro en S.spotifyHistorial)`. No cambia el comportamiento de ningún cobro que ya tenía `id`; solo evita que un futuro registro sin `id` (p. ej. por editar/combinar backups a mano, como en este caso) vuelva a quedar sin candado ni orden estable. Validado con `node --check`.

### ✅ Corregido (2026-08-30) — Eliminar un retiro de una cuenta personalizada no revertía nada, pero mostraba "eliminado" igual (`movimientos.js`)

Reportado por el usuario: al eliminar un movimiento en una cuenta custom, el dinero "desaparecía" pero el movimiento seguía en la lista, y al recargar la página el dinero volvía a aparecer. Causa raíz: `_getMovimientosCuentaCustom()` (`cuentas.js`) muestra **todo** retiro manual de una cuenta personalizada con `tipo:'egreso'` — tanto si el registro vive en `c.movimientos` (`confirmarMovCustom()` guarda ahí con ese mismo nombre de tipo) como si vive en `S.movimientos` (mismo `confirmarMovCustom()`, doble-escritura, ahí con `tipo:'salida_manual'`, pero mostrado igual como `'egreso'` por el mapeo de `tipoDisplay`). El switch de `eliminarMovimiento()` (`movimientos.js`) **no tenía ninguna rama para `movTipoEl === 'egreso'`** — ni en el pre-chequeo de protección por antigüedad ni en la reversión real. Sin ninguna rama que calzara, la función no tocaba `c.saldo` ni ninguno de los dos registros duplicados, pero igual llegaba al `save()`+`refresh()`+`toast('Movimiento eliminado y saldos revertidos')` incondicional del final — un falso positivo completo.

Fix: se agregó la rama `movTipoEl === 'egreso'` en ambos puntos (protección por antigüedad, agrupada con `'ingreso'/'apertura'/'entrada'`; y la reversión real), que revierte con `sumarFuente()` y limpia el registro tanto de `S.movimientos` como de `c.movimientos`. Validado con `node --check`. Confirmado contra `core-state.js`: `sumarFuente('custom:ID', monto)` (línea 266-269) sí hace `c.saldo=(c.saldo||0)+monto` — la reversión del saldo queda correctamente respaldada, sin sorpresas. **Sin verificar en navegador real.**

### ✅ Corregido (2026-08-31) — "Saldo inicial" de una cuenta personalizada revertía el saldo pero el registro quedaba huérfano para siempre (`movimientos.js`)

Reportado por el usuario probando el fix anterior: borró la "Saldo inicial" (Apertura) de una cuenta custom, el saldo disponible sí bajó a $0 correctamente, pero el movimiento siguió apareciendo en la lista — permanentemente, no era un problema de refresco.

Causa distinta a la del fix anterior: `crearMovimientoApertura()` (`core-state.js`) es una fábrica pura — solo devuelve el objeto `{id, tipo:'apertura', ...}`. Cuando se crea una cuenta personalizada nueva con saldo inicial, `cuentas.js` (línea 239) empuja ese objeto **directo a `c.movimientos`**, nunca a `S.movimientos`. La rama `'ingreso'/'apertura'/'entrada'` de `eliminarMovimiento()` primero busca el registro en `S.movimientos`; al no encontrarlo, cae a un fallback (`else if (fuenteOrigen && monto > 0) descontarFuente(...)`) que sí revierte el saldo — pero ese fallback nunca tuvo código para quitar el registro de `c.movimientos`, así que quedaba huérfano ahí para siempre, visible en pantalla aunque la plata ya se hubiera devuelto.

Fix: el fallback ahora también filtra `c.movimientos` cuando `fuenteOrigen` es una cuenta personalizada, igual que ya hacía la rama principal (con `m` encontrado) unas líneas arriba. Validado con `node --check`.

### ✨ Mejorado (2026-09-03) — Parity de "saldo inicial" entre cuentas personalizadas y Nequi/Efectivo; cierra parcialmente el hallazgo de convención propia de §7

Pedido por el usuario: en una cuenta personalizada solo se podía fijar el saldo inicial al **crear** la cuenta — a diferencia de Nequi/Efectivo, que tienen el toggle "Es saldo inicial (ya lo tenía)" en el sheet de "Agregar dinero" y un banner para registrarlo/corregirlo después, en cualquier momento.

Causa: las cuentas personalizadas usaban un sheet propio y más simple (`sheet-mov-cuenta-custom`: solo monto/nota/fecha, sin toggle de apertura) en vez del genérico `sheet-agregar-dinero` que sí trae ese toggle. Fix: "Agregar"/"Retirar" en una cuenta personalizada ahora abren los mismos sheets genéricos que Nequi/Efectivo (`abrirAgregarDinero('custom:'+id, nombre)` / `abrirRestarDinero(...)`), y se agregó el mismo banner "Registrar/Corregir saldo inicial" (`banner-apertura-custom`) a la pantalla de detalle. Se retiró por completo el sheet viejo y sus funciones (`abrirMovCustom()`/`confirmarMovCustom()`), que quedaron sin ningún llamador — no se dejaron como código muerto, mismo criterio que la fusión de `leerArchivoImport()` en `configuracion.js` (ver `CHANGELOG.md#configuración`, si existe esa entrada, o el comentario de cabecera de ese archivo).

Efecto colateral importante: esto **cierra a medias** el hallazgo de §7 de `cuentas.md` ("cuentas personalizadas usan su propia convención `ingreso`/`egreso` en `c.movimientos`, en vez de `entrada`/`salida`/`apertura` en `S.movimientos`"). Las entradas/retiros/aperturas **nuevos** de una cuenta personalizada ahora se escriben exactamente igual que en Nequi/Efectivo (`S.movimientos`, con la convención estándar) — pero los datos **viejos** (escritos por la función ya retirada, dual-escritos en `c.movimientos` con `tipo:'ingreso'/'egreso'` y en `S.movimientos` con el mismo id) y el saldo inicial fijado al **crear** la cuenta (`crearCuentaCustom()`, que sigue empujando directo a `c.movimientos`, sin tocar `S.movimientos`) siguen en el formato viejo. No es una migración de datos, solo el punto de entrada de escritura hacia adelante — `cuentas.md §4/§7` se actualiza aparte para reflejar este estado mixto.

Bugs de esta unificación parcial encontrados y corregidos de una vez, antes de que llegaran a producción:

- **`getAperturaMov()` (cuentas.js) no encontraba el saldo inicial fijado al crear la cuenta** (vive en `c.movimientos`, no en `S.movimientos`, y no tiene campo `fuente`) — el banner nuevo hubiera mostrado "Registrar saldo inicial" en cuentas que ya lo tenían, permitiendo un segundo registro duplicado. Se agregó un fallback a `c.movimientos` cuando `fuente` empieza con `'custom:'`.
- **`abrirRegistrarApertura()`/`abrirEditarApertura()` tenían un `nombreMap` fijo con solo `nequi`/`efectivo`** — hubieran mostrado "undefined" como nombre de cuenta en el título del sheet para una cuenta personalizada. Se agregó fallback a `fuenteLabel(fuente)`.
- **`calcHealthScore()` (`inicio.js`) dejaba de contar ingresos nuevos de cuentas personalizadas.** Sumaba en dos partes separadas: `c.movimientos` (`tipo==='ingreso'`, formato viejo) para cuentas personalizadas, y `S.movimientos` (`tipo==='entrada'`) con una lista blanca de fuentes que excluía `custom:` a propósito (para no duplicar con la primera parte). Como las entradas nuevas ya no tocan `c.movimientos`, se hubieran dejado de sumar del todo. Fix: se agregó `custom:` a la lista blanca de `S.movimientos`, con un chequeo de deduplicación por `id` contra `c.movimientos` para no volver a contar las entradas viejas dual-escritas. `analisis.js` no tenía este problema — su cálculo de ingresos ya era genérico, sin filtrar por fuente.
- **Comentario desactualizado en `movimientos.js`** (rama `movTipoEl==='egreso'` de `eliminarMovimiento()`): nombraba a `confirmarMovCustom()` como si siguiera viva. Actualizado para dejar claro que es código retirado, solo relevante para datos históricos.
- El toggle de Configuración "Saldo inicial" (`cfg-corregirSaldo`) describía que ocultaba el banner en "Nequi y Efectivo", pero `renderBannerApertura()` nunca lo chequeaba en absoluto (para ninguna cuenta) — quedaba sin efecto. Se agregó el chequeo, aplicando ahora parejo a Nequi, Efectivo y cuentas personalizadas.

Validado con `node --check` en los cuatro archivos tocados (`cuentas.js`, `index.html`, `movimientos.js`, `inicio.js`) y trazado a mano contra `core-state.js` real (confirmando que `sumarFuente`/`descontarFuente`/`getSaldoFuente`/`fuenteLabel` ya soportan `'custom:ID'` de fábrica, y que `_esEntradaEspejoNoIngreso()` es agnóstica a la fuente) y contra `analisis.js`/`inicio.js` reales para el conteo de ingresos. **Sin verificar en navegador real.**

### ✅ Corregido — "Chequeo rápido — cajitas Nu" guardaba el dato pero nunca corregía el saldo

`guardarChequeoNu()` guardaba cada saldo real reportado en `S.chequeosNu`, pero ese arreglo solo se usaba como insumo para `verificarTasaNu()` (detectar si la tasa EA configurada se desvió). En ningún punto del flujo se escribía `c.saldo` con el valor real que el usuario acababa de anotar — el sheet decía "Chequeo rápido" y mostraba "calculado" vs. un campo para el "real", pero confirmar no cambiaba el saldo calculado que se seguía mostrando en toda la app, aunque hubiera diferencia y sin importar si `verificarTasaNu()` detectaba o no una desviación de tasa (que además exige 2 chequeos seguidos desviados más de 0,05 puntos — una diferencia de un solo centavo, como la reportada, nunca iba a disparar ese `confirm()`).

Fix: `guardarChequeoNu()` ahora corrige `c.saldo` de cada cajita chequeada al valor real ingresado (restando primero lo que haya de encargos guardado en esa misma cajita vía `_saldoEncargosEnCajita`, ya que el valor real que se anota es el total físico en Nu, y `c.saldo` representa solo la porción propia — mismo criterio que ya usaba `calcularSerieTasaImplicitaNu`) y actualiza `c.fecha` a hoy, igual que hace `materializarIntereses()` al acreditar intereses: sin generar ningún movimiento, porque es un ajuste de saldo, no plata que entra o sale de ninguna cuenta. La detección de desviación de tasa sigue funcionando igual que antes, en paralelo.

Validado con `node --check` y una simulación jsdom llamando a la función real con inputs de prueba: confirma que `c.saldo`/`c.fecha` quedan en el valor y fecha esperados, que una cajita con encargos guardados solo corrige la porción propia, y que una diferencia mínima (1 centavo) no dispara el `confirm()` de cambio de tasa. **Sin verificar en navegador real.**

### 🔧 Mejorado — Ambigüedad al chequear el saldo de una cajita con encargo adentro: ¿el usuario anotó el total o ya su parte neta?

El fix anterior siempre restaba `_saldoEncargosEnCajita()` del valor ingresado, asumiendo que el usuario siempre anota el total físico que ve en la app de Nu (propio + encargo, sin distinguir, porque así lo muestra Nu). Pero si el usuario ya sabe cuánto es la parte del encargo y anota directamente su saldo propio ya neto, esa resta lo hubiera descontado **dos veces**, dejando `c.saldo` corrupto.

Fix: cuando la cajita tiene algo de encargo (`saldoEncargos>0`), se calculan las dos referencias posibles — el saldo propio calculado hoy (`calcC(c).val`, lo mismo que muestra el placeholder "calculado" del sheet) y ese mismo valor sumado al encargo (el total físico) — y se compara cuál de las dos queda **más cerca** del valor ingresado. Si está más cerca del total, se resta el encargo antes de guardar; si está más cerca del propio, se guarda tal cual. La diferencia entre ambas referencias es normalmente el monto completo del encargo (mucho mayor que la corrección de unos pocos pesos que se está haciendo), así que no debería haber casos reales de ambigüedad real entre las dos.

Validado con jsdom, tres escenarios sobre la función real: sin encargo (corrige directo), con encargo anotando el total (resta el encargo), con encargo anotando ya la parte neta (no resta nada) — los tres quedan con el `c.saldo` esperado. **Sin verificar en navegador real.**

### 🗑️ Eliminado por diseño — Input "Vigente desde" (`nuTasaVigenciaFecha`) junto a la tasa EA de Nu

Existía un campo de fecha "Vigente desde" al lado del input de tasa EA, con la intención aparente de registrar manualmente desde qué día aplicaba un cambio de tasa que Nu hizo sin avisar. Nunca estuvo conectado a ninguna función — no tenía `data-action`, `data-save`, `onchange`, ni ningún `document.getElementById('nuTasaVigenciaFecha')` en ningún archivo del proyecto. Cualquier fecha escrita ahí no se guardaba ni se leía en ningún lado.

Se evaluó conectarlo (llamando a `registrarTasaNuHistorial(fecha, tasa)` al confirmar), pero se descartó: el sistema de tramos de tasa solo puede recalcular correctamente el intervalo entre el último movimiento de cada cajita (`c.fecha`) y hoy, porque cada depósito/retiro ya "sella" los intereses ganados hasta ese momento con la tasa que estaba configurada en ese instante (`materializarIntereses()`). Si el cambio de tasa real ocurrió antes de un movimiento ya materializado, ese tramo queda con la tasa vieja para siempre — no hay forma de reabrirlo retroactivamente sin reconstruir el historial completo de movimientos, algo mucho más invasivo que lo que este campo prometía resolver. Mantenerlo hubiera dado una falsa sensación de corrección exacta en casos donde en realidad no corrige nada.

Se eliminó el input en vez de conectarlo: el **Chequeo rápido de cajitas** (ver el fix anterior) ya resuelve el mismo problema de fondo — un saldo desviado por un cambio de tasa no detectado — sin esa limitación, porque pisa el resultado final en vez de intentar reconstruir el cálculo. Una sola vía para corregir esto es más simple y más confiable que mantener dos, una de ellas con un techo de corrección más bajo.

### 🐛 Corregido (2026-09-10) — Tarjetas de crédito seleccionables como origen/destino en "Transferir entre cuentas" y como destino en el menú "+" (Agregar dinero)

Reportado por el usuario: en el sheet "Transferir entre cuentas", tanto "¿de dónde sale?" como "¿a dónde entra?" listaban las tarjetas de crédito — algo sin sentido, ya que transferir es mover plata líquida entre cuentas, no un pago con tarjeta. Viola la regla ya documentada en `cuentas.md §3` ("las tarjetas de crédito nunca son un destino válido para dinero que entra").

Causa: `abrirTransferir()` poblaba ambos selects con `getFuentes()`, que sí incluye tarjetas de crédito, en vez de `getFuentesSinTC()` — función que ya existe en el núcleo (`core-state.js`) para exactamente este caso y que ya aparecía listada en el comentario de imports al inicio de `cuentas.js`, pero nunca se llamaba desde ningún lado del archivo. Se encontró el mismo patrón, de paso, en `openSheet_adMenu()` (destino del menú "+" del header para Agregar dinero), que también usaba `getFuentes()` en vez de `getFuentesSinTC()`.

Fix: los dos sitios ahora usan `getFuentesSinTC()`. Cambio de una línea en cada función, sin tocar la firma de ninguna de las dos. Validado con `node --check`. **Sin verificar en navegador real.**

### ✨ Mejorado (2026-09-10, misma sesión) — "¿De dónde sale?" en Transferir ya no lista cuentas con saldo $0

Pedido por el usuario: no tiene sentido ofrecer como origen de una transferencia una cuenta que no tiene nada — es imposible que salga plata de ahí. `abrirTransferir()` ahora filtra el select de origen a `getSaldoActual(f.val) > 0`; el destino queda sin filtrar (sí tiene sentido transferir hacia una cuenta en $0). Si no queda ninguna cuenta con saldo, el placeholder cambia a "No tenés cuentas con saldo disponible" en vez de dejar el select vacío — mismo criterio que ya usa Alcancía en `_alcFiltrarFuentesPorSaldo()` (ver más arriba en esta sección), aunque acá sin el umbral de $50 por redondeo: se filtra en `> 0` exacto, tal como se pidió.

Si el sheet se abre con un origen sugerido (botón "transferir" desde una cuenta o cajita puntual) y esa cuenta tiene $0, ya no se preselecciona — el select cae en la primera cuenta con saldo disponible. `confirmarTransferir()` ya tenía el guard `if (!origen || !destino)`, así que un select vacío no rompe nada. Validado con `node --check`. **Sin verificar en navegador real.**

### 🐛 Corregido (2026-09-14) — Botón "Configurar saldo mínimo" (sheet meta de cajita) mostraba el HTML del ícono como texto plano al abrir

Reportado por el usuario: al abrir el sheet de meta de una cajita, el botón de saldo mínimo mostraba literalmente `<i class="fa-solid...">Configurar saldo mínimo` en vez del ícono renderizado — pero un clic (que sí togglea el estado) lo arreglaba, y otro clic más lo volvía a arreglar.

Causa: `abrirMetaCajita()` pinta el texto inicial del botón (`#btn-toggle-meta-min`) con `.textContent`, mientras que `toggleMetaMinWrap()` — la función que corre al hacer clic — usa `.innerHTML` para el mismo string con markup del ícono. `.textContent` escapa el `<i>...</i>` en vez de renderizarlo; el primer clic lo pisaba con el `.innerHTML` correcto del toggle, ocultando el bug hasta que se abría el sheet de nuevo.

Fix: cambiada esa línea de `.textContent` a `.innerHTML` en `abrirMetaCajita()`. Es un string estático sin texto libre de usuario, así que no es un hallazgo de escapado ni afecta el trabajo de migración a `html\`\``. Cambio de una línea.

### ✨ Mejorado (2026-09-15) — Aviso de cambio de tasa Nu (chequeo rápido) usaba `confirm()` nativo del navegador, sin poder editar el valor sugerido

Reportado por el usuario: al guardar el "Chequeo rápido — cajitas Nu" con un saldo alto, cuando `verificarTasaNu()` detecta un desvío sostenido y sugiere un cambio de tasa, el aviso era el `confirm()` nativo del navegador — solo Aceptar/Cancelar, sin ningún campo editable. Si el usuario se equivocaba al anotar un saldo y se daba cuenta tarde, no tenía forma de corregir la tasa o la fecha sugeridas antes de aplicarlas; su única opción era cancelar del todo y repetir el chequeo desde cero.

Fix: se reemplazó el `confirm()` de `guardarChequeoNu()` por un sheet propio de la app (`sheet-confirmar-tasa-nu`, `index.html`), con el mismo mensaje explicativo y dos campos editables — **tasa EA %** y **fecha desde la cual aplica** — prellenados con lo que calculó `verificarTasaNu()` pero ajustables antes de confirmar. `_abrirConfirmarTasaNu(r)` guarda la sugerencia pendiente y llena el sheet; el nuevo `confirmarCambioTasaNu()` (registrado en el dispatcher de `cuentas`, `data-action="cuentas:confirmarCambioTasaNu"`) lee los valores del sheet (editados o no) y aplica el cambio con `registrarTasaNuHistorial()`, igual que antes. Cancelar el sheet no aplica nada, mismo comportamiento que cancelar el `confirm()` viejo. Validado con `node --check`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-18) — Chequeo rápido de Nu: sin aviso ante saldos absurdos, falsos "cambios de tasa" por diferencias mínimas, y sin forma de deshacer un chequeo mal anotado

Reportado por el usuario en tres partes:

1. **Anotar 3.333.333,33 en una cajita con 20.950,09 calculados no mostraba ninguna advertencia.** Causa raíz: el chequeo no tenía ninguna validación del valor anotado — `guardarChequeoNu()` sobrescribía `c.saldo` directamente — y la única alarma existente (`verificarTasaNu()`) exige una racha de 2+ chequeos consecutivos desviados, así que un solo salto (o el primer chequeo de la cajita, que solo fija el punto de partida) nunca la disparaba. Con un salto así la tasa implícita era ~10⁸² % (o `Infinity` según los días), y ese valor absurdo, si hubiera coincidido con otro punto desviado, habría terminado como "tasa sugerida".
2. **Diferencias mínimas sí disparaban "cambio de tasa".** Causa raíz: la tasa implícita entre dos chequeos se calcula con los saldos anotados y los días entre ellos, y el ruido de un peso (Nu muestra centavos; el usuario a veces anota enteros) equivale a casi 2 puntos de EA sobre un día de rendimiento de una cajita de ~$20.000. Con el umbral de 0,05 puntos, dos chequeos seguidos (cada uno con su propio redondeo) alcanzaban para sugerir un cambio. Reproducido con las funciones reales: chequeos con pesos enteros y la tasa exacta (9,25 %) sugerían 9,10 % con chequeos diarios o cada 2 días, y 9,22 % con chequeos semanales — este último con puntos de 9,37 % y 9,08 %, uno por encima y otro por debajo, es decir ruido que se compensa, no una tasa nueva.
3. **El aviso de cambio de tasa no permitía corregir el chequeo.** Aunque desde 2026-09-15 ese aviso deja editar tasa y fecha, el chequeo ya estaba aplicado cuando aparecía: los saldos anotados ya habían sobrescrito los de las cajitas, y "Cancelar" solo descartaba la tasa sugerida. Quien se daba cuenta ahí de que se había equivocado en un saldo no tenía cómo revertirlo.

Fix (`cuentas.js`, `index.html`):
- **Aviso previo al guardar:** si algún saldo anotado difiere de lo calculado en más del 2 % **y** más de $1.000, `guardarChequeoNu()` (ahora `async`) muestra un `dialogo()` con el detalle por cajita (anotado, calculado, diferencia) y recuerda que una diferencia así suele ser un error de digitación o plata sin registrar. Cancelar deja el sheet abierto con lo anotado; no se guarda nada. La comparación usa el mismo criterio de encargos de siempre, ahora extraído a `_interpretarLecturaChequeoNu()` (única fuente, antes vivía dentro del bucle de guardado).
- **Detección de tasa más estricta** (`calcularSerieTasaImplicitaNu()` / `verificarTasaNu()`, umbrales centralizados en `_CFG_CHEQUEO_NU`): solo se comparan chequeos separados por ≥ 5 días (uno más cercano no cuenta y el siguiente se mide contra el último válido); un punto solo es desvío si además de > 0,05 puntos EA equivale a > $1 contra lo que habría dado la tasa vigente; los pares a más de 5 puntos EA de la tasa vigente se descartan de la serie (son saltos imposibles, no tasas); la racha debe ser de 2+ puntos consecutivos **del mismo lado**.
- **"Me equivoqué — corregir los saldos"** en el sheet de cambio de tasa (`corregirChequeoNu()`): restaura saldos, fechas y `S.chequeosNu` a como estaban antes del chequeo (foto en memoria `_chequeoNuUndo`, tomada justo antes de aplicar; no se guarda en `S`) y reabre el sheet de chequeo con los mismos valores para editarlos. Los otros dos botones se renombraron para que se entienda qué hace cada uno: "Aplicar cambio de tasa" y "Dejar la tasa como está" (antes "Cancelar", que en realidad dejaba el chequeo guardado).

Validado con `node --check` y un harness en Node que carga las funciones reales de `cuentas.js`: el escenario reportado (aviso, cancelar sin efectos ni `save()`, aceptar guarda), diferencias de pocos pesos sin aviso, caso con encargo adentro anotando el total físico, los cuatro casos de ruido que antes daban falso positivo ahora devuelven `null`, un cambio real de tasa (9,25 → 10,5 % con chequeos semanales) sigue detectándose con la tasa correcta, y el ciclo sugerencia → "Me equivoqué" → volver a guardar → aplicar tasa restaura el estado exacto. **Sin verificar en navegador real**, en particular que `openSheet('chequeo-nu')` + `poblarChequeoNu()` no pise los valores recuperados al reabrir (el hook que puebla ese sheet vive en un archivo núcleo que no estaba a la vista). Limitaciones conocidas: el primer chequeo de una cajita solo fija su punto de partida; una cajita pequeña tarda más en revelar un cambio de tasa chico.

---

### ✨ Mejorado (2026-09-19) — Los depósitos a la Alcancía ahora aparecen en el historial de cada cuenta, con el monto oculto (`cuentas.js`)

*(pedido del usuario: "antes se ocultaban los movimientos de la alcancía, pero en la sección de Alcancía sí se ven con el monto oculto — que en Cuentas también se muestre el movimiento, pero con el monto oculto, en cualquier tipo de cuenta")*

Estado anterior, distinto según el tipo de cuenta (inconsistente, y en un caso filtraba el monto):

- **Nequi / Efectivo / cajitas de Nu** (`getMovimientosCuenta()`): los gastos con `_esAlcancia` (depósito `yo-cuenta` y la parte propia de un `split` con cuenta) se saltaban con un `return` — la fila no existía en el historial de la cuenta, aunque el saldo sí hubiera bajado.
- **Cuentas personalizadas** (`_getMovimientosCuentaCustom()`): ese mismo gasto **no** se saltaba nunca — aparecía en el historial con el monto a la vista, contradiciendo la regla de Alcancía (alcancia.md §3).
- **Efectivo, depósitos sin cuenta de origen** (`yo-directo` / `regalo` / `mandado` / parte de mamá): el ingreso neto-cero (`_esAlcanciaIngreso`) aparecía como "+ $X Ingreso" con el monto a la vista.

Fix: las dos funciones ahora incluyen **siempre** estas filas y les ponen `_alcOculto: true` (gastos con `_esAlcancia` y entradas con `_esAlcanciaIngreso`); `renderMovsCuenta()` pinta esas filas con `••••` (mismo texto que la lista de depósitos dentro de Alcancía, sin signo ni color) en lugar del monto. Detalles:

- **Siguen bloqueadas contra borrado.** Se fuerza `_secundario: true` / `_origenSeccion: 'Alcancía'` en estas filas aunque el registro original no las traiga — los depósitos anteriores al 2026-08-06 no tienen `_secundario` (ver alcancia.md §3/§6) y, al dejar de saltarse, habrían aparecido con botón de eliminar que no revierte `S.alcancia`. Ahora muestran el candado "elimínalo desde Alcancía", igual que el resto de movimientos automáticos.
- **No abren el detalle del movimiento** (`core:abrirDetalleMov`): esa hoja muestra monto y saldos antes/después. Tampoco llevan `data-mov-monto` en el DOM (verificado con `movimientos.js`: `abrirDetalleMov()` solo lo lee de la fila clickeada y `eliminarMovimiento()` del botón de borrar, y estas filas no tienen ni lo uno ni lo otro).
- **Badge ámbar "🔒 Alcancía"** en lugar del badge de tipo: la plantilla ya tenía ese badge para `_origen === 'Alcancía oculta'` (resto de un diseño anterior que ninguna función producía); ahora se dispara con `_alcOculto` y **reemplaza** al badge rojo "Gasto" / verde "Ingreso" (una primera versión los mostraba juntos y el depósito parecía un gasto, que no es: es plata que se aparta). Para eso las filas de Alcancía ya no se disfrazan de `'gasto'`/`'ingreso'`: llevan `tipo: 'alcancia'` (los cuatro puntos donde se arman en `getMovimientosCuenta()` y `_getMovimientosCuentaCustom()`).
- **No se ocultan los movimientos del destape** (`Alcancía destapada — saldo registrado`, `Dinero extra encontrado…`, `Ajuste alcancía — faltante`): el total ya se reveló en la pantalla de resultado, y esos movimientos no llevan `_esAlcanciaIngreso` ni son gastos `_esAlcancia`.
- Filtros del historial: búsqueda y fechas siguen igual; el filtro por tipo tiene un chip nuevo "Alcancía" (`tiposConfig` en `renderMovsFiltros()`, solo aparece si la cuenta tiene alguna de estas filas) y, como consecuencia, estas filas **ya no salen bajo los chips "Gasto" / "Ingreso"**. El tipo nuevo no afecta a `abrirDetalleMov()` ni a `eliminarMovimiento()` (estas filas no abren detalle ni tienen botón de borrar) ni al cálculo de Antes/Después (solo usa `monto`).

Validado con `node --check` y un harness en Node que carga las funciones reales de `cuentas.js` (`getMovimientosCuenta`, `_getMovimientosCuentaCustom`, `renderMovsCuenta`, con `html`/`S`/`document` simulados): depósito `yo-cuenta` en Nequi, en cajita de Nu y en cuenta personalizada, ingreso neto-cero en Efectivo, depósito viejo sin `_secundario` y los tres movimientos del destape — el monto no aparece en el HTML de las filas ocultas, el gasto normal de al lado sí lo muestra y abre su detalle, y el harness falla contra el `cuentas.js` anterior. **Sin verificar en navegador real.**

**Revisión posterior (mismo día, con `movimientos.js`, `busqueda-global.js` y `actividad_reciente.js` en mano)** — se revisaron las otras tres pantallas que listan estos movimientos. Tres hallazgos, los tres corregidos:

1. **Búsqueda global (`busqueda-global.js`) mostraba el monto exacto de cada depósito.** Buscar "alcancía" o "Ahorro" listaba cada gasto `_esAlcancia` como `$monto · Ahorro · fecha` (la búsqueda ya miraba `g.nota`, que dice "Guardado en alcancía oculta"), y lo mismo con los ingresos neto-cero (`_esAlcanciaIngreso`) en el bloque de `S.movimientos`. Ahora esos resultados salen, pero con `••••` en lugar del monto. Los movimientos del destape no se ocultan (el total ya se reveló). No se tocó la navegación de los resultados.
2. **Actividad reciente (`actividad_reciente.js`) se saltaba los gastos `_esAlcancia` pero no los ingresos neto-cero**: un depósito `yo-directo`/`regalo`/`mandado`/parte de mamá aparecía como "+ $X Ingreso" con el monto a la vista. `_normMovimientos()` ahora también los excluye (`_esAlcanciaIngreso`), consistente con lo que ya hacía con los gastos. **Decisión de criterio:** en el feed se optó por excluir, no por mostrar con `••••` como en Cuentas, porque ya era el comportamiento de los gastos de alcancía en ese mismo feed; si se prefiere que el feed también muestre las filas ocultas, es cambiar ambos filtros.
3. **"Antes/Después" del detalle de un movimiento (`abrirDetalleMov()` en `movimientos.js`)** reconstruye el saldo histórico como `saldo actual − Σ montos de los movimientos más recientes`, usando `getMovimientosCuenta()` (no el DOM). Dos consecuencias: (a) **efecto positivo del cambio de arriba** — en Nequi/Efectivo/Nu los depósitos `_esAlcancia` no estaban en esa lista aunque sí habían bajado el saldo, así que el Antes/Después de todo movimiento anterior a un depósito salía descuadrado por el monto del depósito (en cuentas personalizadas ya estaba bien); ahora cuadra. (b) **bug previo, corregido**: los ingresos neto-cero de Alcancía figuraban en esa lista como `+monto` aunque `alcancia.js` suma y resta lo mismo (el saldo no cambia), descuadrando el Antes/Después de todo movimiento de Efectivo anterior a un depósito `yo-directo`/`regalo`/`mandado`. `getMovimientosCuenta()` y `_getMovimientosCuentaCustom()` ahora les dan `monto: 0` (efecto sobre el saldo), lo cual no afecta lo que se ve porque la fila va oculta.

Validado con `node --check` y el mismo harness ampliado (`cuentas.js` + `busqueda-global.js` + `actividad_reciente.js` cargados con `S`/`document` simulados): Antes/Después reconstruido con la misma fórmula que `abrirDetalleMov` para Nequi, Efectivo y cuenta personalizada; búsqueda de "alcancía" (depósito y neto-cero sin monto, gasto normal y destape con monto); feed (neto-cero fuera, ingreso normal y ajuste de destape dentro). Los tests nuevos fallan contra el código anterior. **Sin verificar en navegador real.**

**Sin tocar, a propósito:** `movimientos.js` (no hizo falta; el candado de `eliminarMovimiento()` ya cubre `_secundario`, y las filas de Alcancía en Cuentas no tienen botón de borrar); el abono de un `cobro-deuda` sigue viéndose con su monto en el historial del deudor y en Actividad reciente ("Abono de …"), porque es un pago de deuda visible en Prestado por diseño. Sin revisar (no venían en la sesión): `inicio.js`, `gastos.js`. Los depósitos de ciclos **ya destapados** también quedan ocultos en Cuentas y en la búsqueda (la marca vive en el registro, no depende del ciclo actual); si se prefiere revelarlos una vez destapada la alcancía, es una decisión aparte.

---

## Gastos

### ✨ Agregado (2026-09-20) — Registrar gasto y Pagar gasto fijo solo ofrecen cuentas con saldo ≥ $1,00 y TC con cupo

- **`gv_fuente`** ("¿De dónde salió la plata?", modo simple): lo puebla `openSheet('gasto-var')` en `js/core/sheet-stack.js` (`poblarFuente('gv_fuente', true)`, sin filtro), así que el filtro (`FuentesFiltro.podar` con `PRESET.SALIDA`) se agregó ahí, en la línea siguiente — no en `gastos.js`. Sin ninguna cuenta utilizable, el placeholder pasa a "No tenés cuentas con saldo disponible".
- **Modo dividido (`getGvSplitFuentesOptions`)** y **`pgf-fuente`** ("Pagar gasto fijo"): mismo filtro.
- Una TC solo aparece si tiene cupo disponible ≥ $1,00. Como el cupo ahora es obligatorio al crear/editar una TC (ver Tarjetas de crédito), una TC sin cupo configurado se considera sin cupo.
- **No se tocaron** las validaciones de `addGastoVar()`/`confirmarPagarGastoFijo()` (saldo/cupo contra el monto): el filtro evita elegir una cuenta vacía, pero que el saldo alcance para *este* monto sigue validándose al confirmar.


### ✅ Corregido (2026-09-20) — Gastos del mismo día quedaban en orden inverso al registrado + historial partido en secciones

*(reportado por el usuario: registró "Carro" el 19/09 y después "Moto" también con fecha 19/09; "Moto" aparecía debajo de "Carro")*

1. **Orden.** `renderGastosVar()` ordenaba solo por `fecha` (`b.fecha.localeCompare(a.fecha)`). `Array.prototype.sort` es estable, así que los gastos con la misma fecha conservaban su orden original en `S.gastosVar` — que es el orden de creación (más viejo primero). Resultado: dentro de un día, el último gasto registrado quedaba abajo. Fix: se guarda el índice de cada gasto *antes* de filtrar por mes y se usa de desempate (`fecha` desc., luego índice desc.). No hace falta migrar datos ni agregar un campo de timestamp: `S.gastosVar` solo se agrega con `push` (verificado en `gastos.js`/`cuentas.js`/`index.html`: ningún `unshift`/`splice`/`sort` sobre el array). **Pendiente de confirmar** contra `core-state.js`, `tarjetas_credito.js`, `encargos.js` y `prestado.js` (no recibidos esta sesión) que ninguno lo reordene.
2. **Una sola lista.** Compras en TC, pagos de TC y pagos de fijos ya no tienen sección propia (antes: cuatro bloques con separador). Van mezclados en orden cronológico, cada fila con su etiqueta de tipo, y agrupados por día con encabezado ("Hoy", "Ayer", "sáb 19 sep") y subtotal del día (gasto real + "en TC" aparte, misma regla que el total de arriba). Helper nuevo `_gvDiaLabel()`.
3. **Bug de paso — fijo pagado con TC aparecía dos veces.** Un gasto con `esPagoGastoFijo` y `_esCompraTC` a la vez caía en dos filtros (`gastosTC` y `gastosFijosEnHistorial`), así que se pintaba en "Compras en TC" *y* en "Pagos de fijos". Con la lista única sale una sola vez, con las dos etiquetas (`Fijo` + `TC — deuda`); antes la de fijo tapaba la de TC.

Sin cambios: los totales de arriba (`totalGVFilt`, `totalGVFiltTC`) usan exactamente los mismos filtros; los movimientos de alcancía y extras de préstamo siguen fuera de este historial (como antes). Documentado en `gastos.md` §4, §6, §7 y §8. Validado con `node --check` y un arnés en Node con un stub de `html\`\`` (no se tuvo `html-tag.js` real): orden Moto > Carro el mismo día, fijo pagado con TC una sola vez, totales iguales a los de antes, etiquetas de día. **Sin verificar en navegador real.**

### ✅ Agregado (2026-09-01) — Protección por antigüedad en `deleteGastoVar` (no tenía ninguna) + gastos divididos sin proteger en ningún lado

Detectado en la misma revisión general que Alcancía (ver `CHANGELOG.md#mesada`, `CHANGELOG.md#alcancía`). Dos hallazgos separados:

1. **`deleteGastoVar()` (botón de eliminar en la pantalla de Gastos) no tenía ninguna protección**, a pesar de que el mismo `S.gastosVar` SÍ está protegido cuando se borra desde la pantalla de movimientos de una cuenta (rama `'gasto'` de `eliminarMovimiento()` en `movimientos.js`, que ya exigía `g.fuente` antes de calcular nivel). Mismo dato, dos botones de borrado, solo uno protegido. Fix: se replicó la misma lógica (gasto normal, compra/pago de TC) directamente en `deleteGastoVar()`, con un flag `confirmado` para no pedir doble confirmación cuando el nivel es 'viejo' (mismo patrón que `eliminarMovimiento()`).
2. **Los gastos divididos entre varias cuentas (`g.splits`) no tenían protección en NINGÚN lado** — ni en `movimientos.js` ni (antes del fix de este mismo commit) en `gastos.js`. Causa: `g.fuente` queda vacío cuando el gasto se registró dividido (ver `addGastoVar`), y la rama `'gasto'` de `eliminarMovimiento()` solo chequeaba `g.fuente`, sin una rama alterna para `g.splits`. Fix: nueva rama en ambos archivos que toma el máximo de operaciones posteriores entre todas las cuentas del split (mismo patrón que `_deudorOpsPosteriores` para préstamos con `fuentes[]`).

Validado con `node --check` en ambos archivos (`gastos.js`, `movimientos.js`).

### ✅ Corregido — 5 sitios de `fuenteLabel()`/`cat`/`<option>` sin escapar

*(2026-07-23, confirmando la extracción a `js/modules/gastos.js` contra su código fuente)*

Séptima confirmación del mismo patrón: `fuenteLabel()` sin escapar en el badge de fuente de cada gasto, en dos `toast()` de error de `addGastoVar` y en el `toast()` de "compra cargada a" (con `tc.nombre`), más el `<option>` del selector propio de `abrirPagarGastoFijo()` sin escapar (reimplementaba su selector a mano en vez de `poblarFuente()`, mismo hallazgo puntual que ya tenía Tarjetas de Crédito). Los 5 corregidos con `escHtml()`. Por separado, el 2026-08-22 apareció además `g.cat`/`x.cat` (categoría personalizada) sin escapar en los badges de gasto variable y fijo — ver `CHANGELOG.md#infraestructura--seguridad`.

### ✅ Corregido — Migrado a `html\`\``: sombra de variable y un `raw()` mal aplicado corregido a tiempo

*(sesión posterior, primero de los siete módulos que quedaban)*

Migrados `renderMesFiltros()`, `renderGastosVar()` (incluida la función interna `itemHtml()`, usada tanto para gastos variables puros como para compras/pagos de TC y pagos de fijos en el mismo historial) y `renderGastosFijos()`, más el `<option>` del selector de cuentas en `abrirPagarGastoFijo()`.

Dos hallazgos reales:

1. **Sombra de variable**, misma recurrencia que `mesada.js`: `renderGastosVar()` tenía `let html=''` para ir acumulando el string final — tapaba la función global `html\`\`` dentro de esa misma función. Renombrada a `contenido`, y convertida a array en vez de string: las tres secciones (gastos puros, compras TC, pagos TC, pagos de fijos) se acumulan como fragmentos `html\`\``/arrays anidados sin `.join()` explícito, así que no aplica el punto ciego de doble escapado que sí tuvo `mesada.js`.
2. **Uno nuevo, no visto en los módulos anteriores:** al migrar el `<option>` de cuentas se envolvió primero `f.val` en `raw()`, por parecerse al caso ya confirmado de `ing.id` en `analisis.js` (un id interno, no texto de usuario). Pero acá no había forma de confirmarlo sin `getFuentes()` (núcleo, no recibido esa sesión) — pudo ser un id fijo o el nombre de una cuenta personalizada. Una simulación jsdom con un `val` malicioso (`ahorros"><script>alert(2)</script>`) confirmó que envolverlo en `raw()` sí rompía el atributo `value` del `<option>` si el supuesto fuera falso. Se corrigió dejándolo escapado por defecto, como `f.label`.

Los 4 `toast()` con `fuenteLabel()`/`tc.nombre` se dejaron con `escHtml()` a mano, mismo criterio de siempre. Validado con `node --check` y una simulación jsdom (contra la implementación real de `js/core/html-tag.js`) con payloads maliciosos en `desc`, `cat`, `nota`, `fuenteLabel()` de splits, `_origenSeccion`, nombre de gasto fijo, y `label`/`val` de fuentes — verificado por DOM real (`querySelector`/atributos), no por substring del HTML serializado (que puede mostrar `<`/`>` literales dentro de un atributo sin que sea un problema real; así aparecieron los primeros dos falsos positivos de esta misma simulación, antes de corregir el método de verificación). **Sin verificar en navegador real.**

---

## Plata comprometida

### 🐛 Corregido (2026-09-10) — Marcar "ya pagué" en un Gasto al crearlo no movía ninguna plata

Encontrado al revisar con el usuario un caso de uso real del módulo (adelantar plata a un tercero contra un ingreso ya comprometido, cubriendo varios gastos antes de que llegue). Comparando el flujo de creación (`_cpdConfirmar()`) contra el de "Marcar pagos" (`_cpGuardarMarcados()`) apareció una asimetría real:

- **Reposición con "ya saqué" (`yaSaque`), al crear el destino:** sí descuenta la cuenta en el acto (`sumarFuente(cuentaId, -monto)` + movimiento `'salida'`) — esto ya funcionaba bien.
- **Gasto con "ya pagué" (`yaPague`), al crear el destino:** el flag se guardaba (`yaPague:true`) pero **no pasaba nada más** — ni se descontaba la cajita (`gastoOrigen:'cajita'`) ni se cargaba la compra a la tarjeta (`gastoOrigen:'tc'`). La única rama que sí movía la plata para este caso era `_cpGuardarMarcados()` (el sheet "Marcar pagos" sobre un ingreso ya guardado), y esa función **solo actúa sobre transiciones** pendiente→pagado (`!dViejo.yaPague && dNuevo.yaPague`). Un destino que nacía *ya* marcado como pagado nunca pasa por una transición — así que esa plata quedaba "pagada" solo en apariencia, sin ningún movimiento real detrás, sin ningún error visible ni en consola ni en la UI.

**Efecto real:** si al crear un ingreso comprometido se agregaba un destino tipo Gasto y se marcaba "ya lo pagué" en el mismo paso (en vez de guardar primero y marcarlo después desde "Marcar pagos"), la cajita elegida nunca perdía ese saldo (o la TC nunca ganaba esa deuda) — pero el destino quedaba mostrado como pagado igual. El patrimonio no reflejaba la salida real de plata que sí ocurrió fuera de la app.

**Fix:** se agregó a `_cpdConfirmar()` la misma lógica que ya tenía `_cpGuardarMarcados()` para la transición false→true de un Gasto (cajita: `descontarFuente()` + movimiento `'salida'`; TC: `tcCrearCompra()` con `_esFavor:true`/`_desdeCP:true`), sin comparar contra un estado viejo porque acá no lo hay — el destino recién nace, así que "si `yaPague` es true, mover la plata" alcanza. De paso se guarda `_tcCompraId` en el destino nuevo cuando corresponde (antes se perdía esa referencia si el cargo a TC hubiera pasado en este punto).

**Decisión de diseño tomada en la misma sesión, documentada en `plata-comprometida.md` §7 en vez de acá porque no es un bug:** se evaluó si un adelanto (Reposición o Gasto ya pagado) debería compensarse con un activo tipo "me deben", para que el patrimonio no baje mientras se espera el ingreso — igual que un préstamo registrado en `S.deudores` no baja el patrimonio neto. Se decidió que no: `calcPatrimonioTotal()` es compartida por Salud financiera/Proyección/Análisis/Wrapped, y un adelanto de este módulo nace atado a un ingreso concreto con fecha y monto ya conocidos — no es un préstamo abierto e independiente. El bache de patrimonio mientras se espera el ingreso es real, pero es información correcta (la plata de verdad no está disponible), no un error. Ver `plata-comprometida.md` para el razonamiento completo y la alternativa que quedó anotada por si hace falta en el futuro.

Validado con `node --check`.

### ✅ Agregado (2026-09-01) — Protección por antigüedad en `_cpEliminar` (no tenía ninguna — el hallazgo más delicado de la revisión)

Detectado en la misma revisión general que Alcancía y Gastos (ver `CHANGELOG.md#mesada`). `_cpEliminar()` no tenía ningún chequeo de fecha ni de operaciones posteriores, a pesar de ser el módulo con más superficie de reversión: si el ingreso ya fue `recibido`, borrar revierte reposiciones en cuentas, entradas en cajitas y compras de TC asociadas — todo de golpe, sin importar cuánto tiempo pasó ni cuántas operaciones nuevas tocaron esas mismas cuentas desde entonces. El diálogo ya avisaba *qué* se iba a revertir; no protegía *cuándo* era seguro hacerlo.

Fix: antes de mostrar el diálogo de confirmación (único, no se agregó uno nuevo — el aviso de antigüedad se inyecta como párrafo adicional en el mismo mensaje que ya arma la función), se calculan las cuentas/TC realmente afectadas (mismo set de casos que ya usaba la función para construir la advertencia: `reposicion`, `gasto`+`tc`, `gasto`+`cajita`, y su versión "no recibido" con `yaSaque`/`yaPague`) y se toma el máximo de operaciones posteriores entre todas ellas — mismo patrón que la rama `'transferencia'` de `movimientos.js` cuando hay más de una cuenta en juego.

**Limitación conocida, documentada en el código y en el doc:** no hay una fecha propia por cada adelanto/marca individual (`d.yaSaque`/`d.yaPague` son solo booleanos). Se usa `item.fechaRecibido` cuando ya se recibió (que es cuando de verdad se generaron los movimientos reales), o `item.fechaLlegada` como mejor aproximación disponible si aún no se ha recibido pero ya hay adelantos/marcas de TC. Si en el futuro se guarda una fecha propia por destino, hay que actualizar esto.

Usa la clave de módulo nueva `'plata_comprometida'` en `nivelAntiguedadMovimiento()` — ver `CHANGELOG.md#infraestructura--seguridad` (2026-09-01) para el cierre de la config correspondiente en `core-state.js`.

Validado con `node --check`.

### ✅ Corregido — 6 sitios de `.innerHTML`/`toast()` sin escapar

*(2026-07-23, confirmando la extracción a `js/modules/plata_comprometida.js` contra su código fuente)*

Octava confirmación del mismo patrón: `item.cuentaDestino` sin escapar en la card principal, `tc.nombre` en dos ramas del plan de "Recibir", `_cpFuenteLabel(d.gastoCajita)` en las dos alertas de "Necesita atención", y `errores.join(', ')` en un `toast()`. Los 6 corregidos con `escHtml()`.

### ✅ Corregido — Migrado a `html\`\``: bug real de TDZ encontrado y corregido de paso

*(sesión posterior — junto con Tarjetas de Crédito, dos primeros de los cinco módulos que quedaban)*

Convertidos los cuatro puntos de renderizado con texto libre: `_cpRenderLista()` (card principal: `item.desc`, `_cpFuenteLabel(item.cuentaDestino)`, chips de destino con `d.desc` + badges de estado fijos, tarjeta de "plata guardada para pagar" con `d.desc`/`cajLabel`/fecha de pago), `_cpRenderDestinosTmp()` (label de cuenta y nombre de deudor en los badges del formulario), `_cpAbrirRecibir()` (plan de destinos: nombre de deudor/tarjeta, `_cpFuenteLabel()`, badge "te devuelven"; y el bloque de recordatorios de pago) y `_cpRenderMarcarList()` (lista de "marcar pagos"). Los fragmentos armados con `.map().join('')` se interpolan con `raw()` en el nivel exterior, mismo criterio ya documentado con Mesada/Gastos (fragmentos ya escapados, evitar doble escapado).

**Hallazgo real, no de escapado:** `_cpRenderLista()` tenía `const hoy = hoy();` — una variable local que se auto-referencia antes de inicializarse (temporal dead zone), lo que dispara `ReferenceError` en cuanto hay al menos un ingreso pendiente; era además código muerto (nunca se usaba dentro del bloque). Se eliminó.

Validado con `node --check` y una simulación jsdom (con la implementación real de `js/core/html-tag.js`) inyectando un payload malicioso en nombre de tarjeta/deudor/persona, `desc` y `fuenteLabel()`/`_cpFuenteLabel()`. Todos los checks pasaron sobre el DOM ya parseado (cero `<script>`/`img[onerror]` ejecutables creados). **Sin verificar en navegador real.**

---

## Inicio

### ✅ Corregido (2026-09-20) — CLS de ~0,14–0,19 en Inicio: "Necesita atención" crecía ~150 px al cargar Préstamos/Spotify (lazy)

**Diagnóstico**, con un `PerformanceObserver('layout-shift')` en la consola del navegador real: un corrimiento de 0,194 con `s-attn-section` 243→229, los dos `grid3` 371→510 y 465→604 (≈ +139 px), y `grid2`/`health-score-card` empujados por debajo del viewport (rect actual `0,0`). Es el mismo culpable (`div.grid3`, 0,144) que Lighthouse venía marcando desde el 2026-08-15 como "candidato a rediseño", y que la nota del 2026-08-19 daba por varianza sin culpable fijo.

Hipótesis descartadas antes de dar con la causa: (1) columnas `1fr` que se reacomodan de forma horizontal con montos grandes — no, `.stat{min-width:0}` y `clamp()` en `.stat-value` ya lo impiden (entrada del 2026-08-23); (2) reservar un `min-height` para la sección — descartado por el usuario: deja un hueco vacío feo, que además cambia según haya 2 o 3 avisos.

**Causa:** `renderAttencion()` (`inicio.js`) arma una tarjeta por aviso y llama con guard `typeof` a `getDeudorSaldo` (`prestado.js`, lazy) y a `spPersonaPagadaVigente`/`spNombreDe` (`spotify.js`, lazy). En el primer render esos avisos no existían porque los módulos todavía no habían cargado; al terminar `Loader.ensureAll()` aparecían 3–4 tarjetas de ~50 px y empujaban todo Inicio hacia abajo. Mesada y Tarjetas ya no tenían el problema desde el 2026-08-04 (sus funciones puras viven en `calc-helpers.js`).

**Fix, mismo patrón del 2026-08-04:** las 3 funciones son cálculo puro sobre `S`/`p`, así que se movieron (copia literal, verificada idéntica) a `js/core/calc-helpers.js`, que carga de entrada. `prestado.js` y `spotify.js` ya no las definen (queda un comentario que apunta al nuevo lugar) y siguen siendo globales: el resto de esos archivos las usa igual. `spNombreDe` usa `getPersona` (`personas.js`) con guard `typeof`, así que no depende del orden de carga. El guard `typeof getDeudorSaldo` de `inicio.js` se deja como red de seguridad. La primera pintada ya trae las mismas tarjetas que la final: sin hueco y sin cambio de diseño.

**Verificación:** `node --check` en los 3 archivos. Simulación con el `inicio.js` real en `vm`, con `prestado.js`/`spotify.js` SIN cargar: antes 0 tarjetas y sección oculta; después 3 tarjetas (deudores con saldo + cobro de Spotify vencido; el deudor con saldo 0 queda fuera). **Confirmado en navegador real (usuario):** el snippet de layout-shift ya no muestra el corrimiento de ~140 px (solo entradas 0.000) y `div.grid3` no aparece como culpable en las 3 corridas siguientes de Lighthouse.

**Sigue abierto, sin diagnosticar:**
- `div.grid2` 0,012 en las 3 corridas (irrelevante).
- `div#health-score-card` 0,236 en 1 de 3 corridas (la de 50 puntos). `renderHealthScore()` quita el `min-height:148px` apenas corre; un cambio de 1–2 tips (~20 px) no alcanza para explicar 0,236, así que falta ver qué se mueve. Pendiente capturar con CPU 4× / Slow 4G (ver `auditoria-tecnica.md`).

**Se mantiene por diseño:** el auto-abrir de la lista cuando los avisos cambian de verdad desde la última vez (`hayNuevos`, solo tras `_appFullyLoaded`). `plata_comprometida.js` (lazy) envuelve `renderAttencion()` y puede aportar tarjetas propias; no se verificó si hoy suma alguna tarde.

### ✅ Corregido — 1 sitio de `spNombreDe(p)` sin escapar en "Necesita atención"

*(2026-07-22, durante la migración a `data-action`, sexto módulo migrado)*

`screen-inicio` no tiene ningún `onclick` inline (pantalla de solo lectura, sin formularios propios) — a diferencia de los cinco módulos anteriores, la migración de eventos no tuvo nada que hacer acá. Sí apareció, sexta vez seguida, el mismo hallazgo de escapado: `spNombreDe(p)` (nombre de persona en Spotify, texto libre) interpolado directo en el texto de un ítem de "Necesita atención" dentro de `renderAttencion()`, sin pasar por `escHtml()`. Corregido. El resto de `renderAttencion()`, `renderHealthScore()` y `renderProyeccion()` se revisaron a mano y no tenían más casos: solo números calculados, strings fijos, o valores que ya pasan por `escHtml()`/`fmt()` en otros puntos.

### ✅ Corregido — Migrado a `html\`\`` (segundo intento — el primero nunca se había hecho de verdad)

*(2026-08-25)*

Al arrancar la ronda de migraciones pendientes se descubrió que `inicio.js` **nunca se había migrado**, pese a haber quedado listado junto a `analisis.js` como parte del piloto original (2026-07-28) — el archivo real tenía 0 usos de `html\`\`` y seguía con sus 8 `escHtml()` manuales intactos. El documento se había adelantado al código.

Los 8 `escHtml()` vivían todos en `renderAttencion()`. Los seis campos de texto libre reales (`d.nombre`, `tc.nombre`, `spNombreDe(p)`, `c.nombre`, `enc.nombre`, `p.desc`) ahora se arman como fragmentos `html\`\`` en cada `items.push(...)`, guardados en `it.texto`; el render final (`list.innerHTML=html\`${items.map(...)}\``) los interpola sin volver a escaparlos, aprovechando la misma propiedad de anidamiento sin doble escape ya validada con el piloto de `analisis.js`. Efecto colateral correcto y esperado: `it.texto` pasó de ser un `string` a un objeto con `.toString()` — no rompe el fingerprint de "items nuevos" (`items.map(i=>i.texto).sort().join('|')`), porque tanto `Array.prototype.sort()` sin comparador como `Array.prototype.join()` coaccionan cada elemento a string internamente.

Validado con `node --check` y una simulación jsdom con payloads maliciosos en los 6 campos (`<img onerror>`, `<script>`, `</div><script>`, comillas dobles): todos quedan como texto visible escapado, sin ejecutar nada y sin romper la estructura de las cards. **Sin verificar en navegador real.**

### ✅ Corregido (2026-08-30) — Anillo de `#health-score-card` no arrancaba arriba (el truco de `stroke-dashoffset` asumía mal el sentido de trazado del `<circle>`)

`renderHealthScore()` usaba `stroke-dashoffset="${circ/4}"` para intentar que el relleno del anillo empezara a las 12 en vez de a las 3 (punto de inicio por defecto de un `<circle>` SVG). En la práctica no arrancaba arriba — el cálculo asumía un sentido de trazado que no correspondía al real, así que el offset movía el inicio a otro punto del círculo, no a las 12. Reemplazado por la técnica estándar para anillos de progreso en SVG: `transform="rotate(-90 38 38)"` en el círculo de progreso (el de fondo no lo necesita, al ser un círculo completo no tiene "inicio" visible). Al ser una rotación real del elemento, no depende de en qué dirección interprete el navegador el trazado del `<circle>` — funciona sin importar esa ambigüedad. El cálculo de `dash`/`dasharray` (porcentaje del score sobre la circunferencia) no cambió, seguía siendo correcto. Validado con `node --check`.

### ✨ Mejorado (2026-08-30) — Empty-state de `#proyeccion-card` ("Sin datos suficientes")

El estado sin datos era una sola línea de texto gris pegada arriba a la izquierda de una card con `min-height:126px`, dejando el resto vacío sin ningún criterio visual. Reemplazado por un empty-state compacto centrado (ícono redondo + título + subtítulo), mismo patrón visual que ya usan los estados vacíos de Encargos/Tarjetas de crédito/Spotify (`empty-state-icon`/`empty-state-title`/`empty-state-sub`), pero armado a mano a escala reducida (ícono de 34px en vez de 52px) para caber en una card pequeña sin agrandarla. No se tocó la condición que decide cuándo se muestra (`!patrimonio`).

### ✨ Agregado (2026-09-17) — "Neto de TC" junto a Disponible

Disparador: el usuario prestó plata confiando en el "Disponible" bruto (`#s-disp` = Nu + Nequi + Efectivo), sin ver que parte de eso ya tenía como destino pagar la tarjeta de crédito. Se evaluó y descartó agregar fecha de corte/pago a Tarjetas de crédito para resolverlo (contradice la decisión de diseño explícita de ese módulo, `tarjetas-credito.md` §7: "no simula un banco real") y también usar Plata Comprometida (ese módulo es para ingresos futuros con destino ya planeado, no para deuda propia saliente — caso de uso distinto, ver `plata-comprometida.md` §1).

Se agregó `#s-disp-neto-tc`, una segunda línea chica debajo de `#s-disp` (no la reemplaza) con `_renderDispNetoTC()` en `inicio.js`, hookeada al mismo monkey-patch de `refresh()` que ya usaba `_checkGastoAlto()`. Solo se muestra si hay algo que restar; vacía en caso contrario, sin "$0" de relleno.

**Hallazgo real durante la implementación:** el primer intento usó `calcDeudaTcPropia()` (la función que ya usa Salud financiera), pero esa función también descuenta el saldo inicial pendiente de la deuda — `calcSaldoInicialPendiente()` en `core-state.js` lo trata a propósito como "neutral, sin clasificar" (ni propio ni ajeno). Con una tarjeta cuya deuda es 100% saldo inicial + un cargo ajeno confirmado, `calcDeudaTcPropia()` daba 0 y el bloque se quedaba vacío aunque sí había plata sin clasificar que muy probablemente había que pagar. Se cambió el cálculo a `tc.deuda − calcDeudaAjenaDeTarjeta(tc)` sumado por tarjeta — mismo criterio que ya usa el widget de "cobertura" de Tarjetas de crédito (deuda total, no la propia, porque "el banco cobra el 100% sin importar esta distinción" — `tarjetas-credito.md` §2): se resta todo lo que NO esté confirmado como ajeno, tratando el saldo inicial sin clasificar como si fuera propio hasta que algo diga lo contrario.

Se agregó también un reintento corto (`setTimeout` cada 500ms, hasta 10s) por una sospecha inicial de que `calcDeudaAjenaDeTarjeta`/`calcDeudaTcPropia` cargaban lazy vía `tarjetas_credito.js` — descartado al revisar `core-state.js`/`calc-helpers.js`: ambas viven en `core-state.js`, que carga eager antes que `inicio.js`. El reintento se dejó como red de seguridad barata (por si ese archivo se vuelve lazy en el futuro), sin efecto práctico hoy.

Validado con `node --check`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-20) — "Neto de TC" podía mostrar un valor MAYOR que "Disponible", y restaba solo la deuda propia en vez de la total

**Bug de cálculo:** `_renderDispNetoTC()` recalculaba "disponible" a mano (`nuTotal()+nequiSaldo+efectivoSaldo`) en vez de reusar la fórmula real de `refresh()` (`cajitasLibres+nequi+ef+customTotal`) — le faltaba sumar `cuentasPersonalizadas`. Si alguna cuenta personalizada tenía saldo negativo, el `disp` local quedaba más alto que el `#s-disp` real, y el "Neto" resultante podía superar al "Disponible" bruto — matemáticamente imposible si la resta fuera correcta (`Math.max(0,...)` garantizaba una deuda no-negativa). Corregido: se cambió a `_nuTotalSafe()` (mismo fallback seguro que ya usa `refresh()`) y se agregó `customTotal` a la suma.

**Decisión de criterio (cambio de diseño, no solo bug):** el cálculo original restaba `tc.deuda − calcDeudaAjenaDeTarjeta(tc)` (solo la parte "propia"), asumiendo que lo ajeno seguía pendiente de cobro. Pero `calcDeudaAjenaDeTarjeta()` solo baja con un pago real a la tarjeta — si el tercero ya devolvió esa plata por otro medio (efectivo/Nequi/Nu), la app no tiene forma de saberlo, y seguía tratando esa parte de la deuda como "no tuya" aunque el dinero recibido ya estuviera contado como disponible libre. Se cambió a restar `tc.deuda` completa, sin descontar lo ajeno — mismo criterio que ya usa el widget de "cobertura" de Tarjetas de crédito (`tarjetas-credito.md` §2: el banco cobra el 100% sin importar esta distinción). Efecto: "Neto de TC" ahora asume el peor caso (toda la deuda es tuya de pagar) en vez de un supuesto que la app no puede verificar.

Se eliminó también el sistema de reintento (`_dispNetoTcIntentos`/`_renderDispNetoTCConReintento`), que dependía de que `calcDeudaAjenaDeTarjeta` existiera — ya no se usa esa función acá, y `_nuTotalSafe()` no necesita reintento.

Validado con `node --check`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-20, mismo día) — "Neto de TC" volvió a poder mostrar un valor MAYOR que "Disponible" — esta vez por un saldo a favor en una tarjeta

Al cambiar la resta de "solo deuda propia" a "deuda total" (ver fix de arriba), se perdió el `Math.max(0, ...)` que tenía el cálculo original. Si una tarjeta tiene `tc.deuda` negativo (saldo a favor — se pagó de más), `(S.tarjetasCredito||[]).reduce((a,tc)=>a+(tc.deuda||0), 0)` podía dar un total de deuda negativo, y `neto = disp - deudaTCTotal` con `deudaTCTotal` negativo es `disp + algo` — Neto apareciendo por encima de Disponible otra vez, esta vez sin relación con `cuentasPersonalizadas`.

Corregido aplicando el piso en 0 **por tarjeta antes de sumar** (`a+Math.max(0,tc.deuda||0)`), no sobre el total: un saldo a favor en una tarjeta no debe restarle deuda a las demás tarjetas, ni inflar el "peor caso" de Neto por encima de Disponible — esa plata a favor no está disponible en la mano hasta que se pida reembolso o se aplique a compras futuras.

Validado con `node --check`. **Sin verificar en navegador real.**

### ✅ Corregido (2026-09-20, mismo día) — Rediseño: "Neto de TC" deja de recalcular "disponible" y lee el valor real de `refresh()`

Las dos correcciones anteriores de este mismo día (`cuentasPersonalizadas` faltante, y el saldo a favor sin piso en 0) arreglaban síntomas puntuales del mismo problema de fondo: `_renderDispNetoTC()` recalculaba "disponible" de forma independiente a `refresh()`, así que cualquier diferencia entre ambos cálculos — por pequeña que fuera — podía volver a producir un "Neto" mayor que "Disponible", sin garantía de que no apareciera un tercer caso.

Se eliminó la causa raíz en vez de seguir parchando síntomas: `core-state.js` ahora expone `window._dispActualHoy = disp` justo después de calcular `disp` dentro de `refresh()` (una sola línea añadida, no cambia nada existente de esa función). `_renderDispNetoTC()` en `inicio.js` ya no recalcula `nu+nequi+ef+customTotal` — lee directamente `window._dispActualHoy`, el mismo número que se acaba de pintar en `#s-disp`. Por construcción, "Neto de TC" no puede volver a desalinearse de "Disponible": es literalmente ese mismo número menos la deuda de TC. El orden ya estaba garantizado (el monkey-patch de `refresh()` en `inicio.js` llama primero a `_origRefreshInicio()`, que setea la variable, y recién después a `_renderDispNetoTC()`).

Validado con `node --check` en ambos archivos (`core-state.js`, `inicio.js`). **Sin verificar en navegador real.**

`#s-disp-neto-tc` vivía dentro de la misma celda `.stat` que "Disponible", dentro del `grid3` compartido con "Nu libre" y "Efectivo". La línea extra hacía crecer esa celda, y como las tres celdas de una fila de grid comparten altura, "Nu libre"/"Efectivo" se estiraban con espacio muerto de sobra aunque no tuvieran nada que mostrar ahí. Se sacó `#s-disp-neto-tc` de adentro de la celda `.stat` y se dejó como una línea propia, de ancho completo, justo debajo del `grid3` (antes del siguiente `grid3` de Nequi/Prestado/CDTs) — sigue leyéndose pegado a "Disponible" por posición y porque el texto ya dice "Neto de TC: $X", pero ya no participa en el alto de esa fila. Cambio solo de `index.html`; `_renderDispNetoTC()` no cambió (sigue usando `getElementById`, indiferente a dónde vive el elemento en el DOM).

---

## Configuración

### ✅ Corregido (2026-09-28) — Código sin uso en `borrarTodo()`: `localStorage.removeItem('mf_historial_v1')`

Esa clave no la lee ni la escribe ningún archivo del proyecto (confirmado por búsqueda en todo el repo): era resto del historial anterior a que Actividad reciente pasara a derivarse de `S`. La línea se quitó de `borrarTodo()`; no cambia ningún comportamiento (`removeItem` sobre una clave inexistente no hace nada). Validado con `node --check`.

### ✅ Corregido (2026-09-28) — Comentarios de `configuracion.js` desactualizados o con historia que ya no importa

Limpieza solo de comentarios, sin cambios de comportamiento: en `borrarTodo()`, dos comentarios describían algo que la función no hace (uno decía que registraba un evento en el historial; otro decía que se evitaba un "`{}` vacío", cuando el código escribe `payload: "{}"` a propósito), y otros describían cómo era el código antes (fusión de `import-validado.js`, "MEJORA 5", el `FIX` de import y de borrado narrados como historia). Ahora dicen la regla vigente. La cabecera apunta a `configuracion.md`. Validado con `node --check`.

**Observaciones anotadas en `configuracion.md` (sin tocar código):** `exportarCSV()` ordena `S.gastosVar` en el sitio (deja el arreglo reordenado en memoria, sin `save()`); `S.modulos` nace en `core-state.js` con solo `mesada` y `spotify`, así que `corregirSaldo` no existe hasta el primer toggle (cómo lo interpreta `applyModulos()` cuando falta no se pudo verificar, `sheet-stack.js` no estaba disponible). Descartados con el código real: `Events.attr()` sí escapa (ver la entrada de `renderCatsConfig()` más abajo) y `getCatsVar()`/`getCatsFijo()` devuelven una copia de los `*_DEFAULT`, no la constante.

### ✅ Confirmado — Sin hallazgos de escapado al migrar a `data-action`

*(2026-07-25, décimo módulo migrado)*

A diferencia de los nueve módulos anteriores, Configuración salió limpia: los chips de categorías (`renderCatsConfig`) y los `toast()` de agregar/eliminar categoría ya interpolaban el nombre libre de la categoría envuelto en `escHtml()` en todos los sitios — segunda vez (de diez módulos) que este hallazgo no aparece (la primera fue Alcancía). 6 `onclick` migrados, todos estáticos.

### ✅ Corregido — Migrado a `html\`\`` (sin escapado nuevo) — hallazgo sobre `Events.attr()` descartado (2026-09-28)

*(2026-08-25, primera de la tanda de diez módulos pendientes)*

`renderCatsConfig()` convertido a `html\`\``. No agrega escapado nuevo — `escHtml(c)` ya cubría el nombre de categoría antes de este cambio — pero deja de depender de acordarse de envolverlo a mano si se toca esta función en el futuro. Los `toast()` de `agregarCat()`/`eliminarCat()` se dejaron con `escHtml()` a mano, mismo criterio que `renderPresupuestos()`.

**Hallazgo sobre `Events.attr()` — descartado (2026-09-28, con `js/core/events.js` y `core-state.js` reales).** La sospecha era que el nombre de categoría (texto libre) se interpolaba en `data-action`/`data-args` sin escapar. `Events.attr()` real serializa los argumentos a JSON y los pasa por `escHtml()` (que escapa `&`, `<`, `>`, `"` y `'`) antes de armar el atributo, y el despachador los lee con `dataset` + `JSON.parse`. Simulación jsdom con el `events.js` y el `escHtml` reales y cuatro nombres hostiles (`Ropa "vintage"`, `O'Neil`, `<img src=x onerror=alert(1)>`, `A&B "C" 'D' <e>`): el atributo queda bien formado, no se crea ningún nodo extra y el handler recibe exactamente el texto original. **Sin bug.** Por extensión, el mismo patrón queda cubierto en todo módulo que arme sus `data-action` con `Events.attr()` (nombres de persona en Encargos/Préstamos/Spotify incluidos); solo queda fuera un `data-action` armado a mano sin `Events.attr()`, que no se revisó.

Validado con `node --check` y una simulación jsdom con una categoría maliciosa (`<img src=x onerror=alert(1)>`) y otra con comillas dobles: el texto visible del chip queda escapado correctamente en ambos casos, y el botón "eliminar" sigue apareciendo solo en categorías no-default. **Sin verificar en navegador real.**

---

## Actividad reciente

### ✅ Corregido (2026-09-29) — El feed escondía dos ingresos reales que Análisis sí cuenta

**Síntoma:** el saldo de una cuenta subía pero no aparecía ninguna fila en Actividad reciente, en dos casos: el sobrante al destapar la alcancía ("Dinero extra encontrado en alcancía") y el margen o regalo de un encargo ("Margen encargo …", "Margen — …", "Me lo regalaron"). Análisis, Inicio y Salud financiera sí los suman como ingreso (`_esEntradaEspejoNoIngreso()` en `core-state.js`). Verificado leyendo `analisis.js`, `inicio.js`, `diferencial.js` y `alcancia.js`. Al revés, el faltante del destape ("Ajuste alcancía — faltante") sí se veía, así que el feed mostraba la pérdida y escondía la ganancia.

**Causa raíz:** `_normMovimientos()` descartaba todo lo que llevara `_esAlcancia`, `_encMovId` o descripción "Margen…". Los filtros son anteriores a los fixes del 2026-09-28 que hicieron que esas entradas cuenten como ingreso, y el motivo original ("evitar duplicados con `_normEncargos`") no aplicaba: `_normEncargos()` lee `enc.movimientos` y estas filas viven en `S.movimientos`. Además, la privacidad de `_esAlcancia` ya no protegía nada en esta fila: el total se revela al destapar y desde el 2026-09-27 los depósitos van a `S.transferencias` (que el feed no lee).

**Fix (`actividad_reciente.js`, solo `_normMovimientos()`):** pasan al feed (a) las `entrada` con `_esExtraIngreso` o `_esDiferencialEncargo`, aunque lleven `_encMovId` o desc "Margen…", y (b) las `entrada` con `_esAlcancia` que no sean `_esAlcanciaIngreso`. Se decide por bandera, no por descripción, para que el feed y Análisis usen el mismo criterio.

**Sigue oculto a propósito:** transferencias y espejos de encargos ("Yo puse la plata", intercambios, depósitos), depósitos de alcancía (`_esAlcanciaIngreso`), y márgenes viejos sin bandera (Análisis tampoco los cuenta).

**Verificación:** `node --check` OK, y prueba con datos sintéticos extrayendo `_normMovimientos()`: pasan el sobrante de alcancía, el margen con `_esDiferencialEncargo` y el margen con `_esExtraIngreso`; siguen ocultos la transferencia del destape, el margen viejo sin bandera, el espejo "Yo puse la plata" y el depósito `_esAlcanciaIngreso`. **Sin verificar en navegador real.**

**~~Pendiente detectado, sin tocar~~ → resuelto el mismo día (ver "Alcancía" en Cuentas, abajo):** si el destino del destape es una cuenta personalizada, `_sumarASaldo()` (`alcancia.js:1298`) escribe en `c.movimientos` un `tipo:'ingreso'` "Alcancía destapada" por el saldo registrado (movimiento neutro). El feed lo muestra como "+ ingreso" y el bloque de cuentas personalizadas de `inicio.js` (`calcHealthScore`) lo cuenta como ingreso del mes en Salud financiera. No se corrigió porque no estaba en el alcance pedido.

### ✅ Corregido (2026-09-28) — Mesada y préstamos hacia una cajita Nu no aparecían en el feed

**Causa raíz:** los movimientos manuales de una cajita (agregar/restar dinero) se guardan en `S.movimientos` con `fuente: 'cajita:ID'`, pero los espejos que Mesada y Préstamos dejan al entrar plata a una cajita se guardan en `cajita.historial` (con `_secundario`), y el feed nunca leía ese arreglo. Escenario: cobrar una mesada con destino a una cajita Nu — el saldo subía, aparecía en el historial de la cuenta, pero no en Actividad reciente.

**Fix (`actividad_reciente.js`):** nuevo `_normCajitas()` que lee `S.cajitas[].historial` filtrado a `_secundario` y aplica las mismas exclusiones que `_normMovimientos` (espejo de abono de "Me deben", `_encMovId`, alcancía, márgenes de encargo). La detección de espejos de "Me deben" se extrajo a `_espejosDeudores()` para compartirla entre ambos normalizadores.

**Validado:** `node --check` y jsdom con datos con la forma real (`mesada.js`, `prestado.js`). Antes → después: "Mesada papá" 0 → 1, propina 0 → 1, "Yo debo" 0 → 1, espejo del abono de Cami 0 → 0 (sigue saliendo una sola vez como "Abono de Cami"). **Sin verificar en navegador real.** Revisado también `encargos.js` y `alcancia.js`: ninguno escribe en `cajita.historial` (Encargos deja sus espejos en `S.movimientos` con `_encMovId`; Alcancía en `S.movimientos` con `_esAlcancia`, y su `historial` es el de `S.alcancia`, no el de una cajita), así que `_normCajitas` no puede duplicarlos.

### ✅ Corregido (2026-09-28) — Duplicados y borrados en el feed (pago de tarjeta, abonos de "Me deben")

**Síntoma:** un pago de tarjeta salía dos veces ("Pago tarjeta X" como gasto y "Abono a deuda · X"); un abono de un deudor también dos veces ("Abono de X" y una entrada "Ingreso" con el texto "Abono de deuda — X"); y un pago de tarjeta eliminado seguía apareciendo.

**Causa raíz:** el feed lee cada módulo por separado, pero esos módulos dejan más de un registro por la misma operación. `confirmarPagarTC()` crea el pago en `tarjetasCredito[].pagos` **y** un gasto `_esPagoTC` en `gastosVar`; `confirmarMovimiento()` de "Me deben" crea el movimiento del deudor **y** un espejo `_secundario` en `S.movimientos` (o en la cuenta personalizada) que el movimiento señala con `_abonoDestinoMovId` / `destinos[]._movId`. Y `tcEliminarPagoInterna()` solo marca `eliminado: true`, sin quitar el pago de la lista, y `_normTC` no miraba ese flag.

**Fix (`actividad_reciente.js`, solo el feed, sin tocar los módulos):** `_normGastos` excluye `_esPagoTC`; `_normTC` ignora pagos y avisos de corte con `eliminado`; `_normMovimientos` oculta los espejos que un abono de "Me deben" referencia por id. No se usa `_secundario` ni `_esEntradaEspejoNoIngreso()` como filtro general: ocultarían filas que no tienen otra fuente (gasto "Spotify Premium", perdón, espejos de "Yo debo", Mesada).

**Validado:** `node --check` y una simulación jsdom con datos con la forma real de cada módulo. Antes: "Abono de deuda — Ana" 1, "Abono de deuda — Ben" (cuenta personalizada) 1, "Pago tarjeta Nu" 1, "Abono a deuda" 2, "Corte llegó" 1 (eliminado). Después: 0, 0, 0, 1 y 0; siguen visibles "Abono de Ana", "Abono de Ben", la propina de Ana, la mesada y el almuerzo. **Sin verificar en navegador real ni con `html-tag.js` real** (la prueba usó un stub equivalente).

**Revisados y sin duplicado:** préstamo entregado, "Yo debo", cobro de Spotify, Encargos; Mesada (`mesada.js` solo escribe el espejo). Detalle en `actividad-reciente.md` §6.

### ✅ Corregido (2026-09-28) — Dos comentarios de `actividad_reciente.js` desactualizados

Solo comentarios: la cabecera decía que `#cfg-historial-row` conservaba un `onclick` inline en `index.html` (hoy navega con `data-action="config:irA"`), y un comentario apuntaba a "la línea 435" del archivo. Sin cambios de comportamiento. **Observación anotada en `actividad-reciente.md` (sin tocar código):** `#mas-historial-sub` no tiene elemento en el HTML.

### ✅ Confirmado — Sin hallazgos de escapado al extraer el módulo

*(2026-07-26, undécimo módulo migrado)*

Las siete fuentes normalizadas (`_normMovimientos`, `_normGastos`, `_normDeudores`, `_normSpotify`, `_normEncargos`, `_normTC`, `_normCP`) arman `titulo`/`subtitulo` con texto libre sin escapar en el objeto intermedio, pero el único punto de render (`renderFeedActividad()`) pasa ambos campos por `esc()` antes de tocar el DOM — a diferencia de los módulos con el hallazgo, acá no hay múltiples sitios de salida que puedan quedar sin cubrir, solo uno. Tercera vez (de trece módulos) que este hallazgo no aparece.

### ✅ Corregido — Migrado a `html\`\`` (solo por consistencia, sin bug real)

*(sesión posterior)*

Los dos únicos usos de `.innerHTML` (mensaje de "vacío" y el render principal de `renderFeedActividad()`) ya escapaban correctamente con `esc()` a mano — sin bug real, migración solo por consistencia con el resto de módulos. Convertidos a fragmentos `html\`\`` anidados (por fecha → por ítem), sin `.join()` explícito, mismo patrón que `inicio.js`/`analisis.js`. `ik.bg`/`ik.svg` (íconos SVG fijos del diccionario `ICONOS`) y `colorReal` (siempre `var(--accent)`/`var(--red)`/`#1ed760`, nunca texto de usuario) se envolvieron en `raw()`, mismo criterio que un valor CSS fijo.

Validado solo con `node --check` — a diferencia de las migraciones anteriores de este punto, esta sesión no tuvo `js/core/html-tag.js` a la vista, así que no se pudo simular con jsdom contra la implementación real de `html\`\``/`raw()`. **Sin verificar en navegador real**, y sin la simulación de payloads maliciosos que sí se hizo con Mesada/Spotify — queda como pendiente más fuerte que en esos dos casos.

---

## Personas

### ✅ Confirmado — Sin hallazgos de escapado (verificado solo contra `index.html`)

*(2026-07-28)*

~15 sitios donde interpola texto libre (`nombre`, `nota`, iniciales, término de búsqueda) ya pasan por `escHtml()`. Diferencia con las confirmaciones anteriores: no se recibió el archivo `personas.js`, solo lo que `index.html` deja ver (`<script src>`, `data-action` estáticos, comentarios de migración) — no se verificó línea por línea contra el código fuente como sí se pudo hacer con los ocho módulos anteriores.

### ✅ Corregido — Migrado a `html\`\`` completo, incluida `abrirPerfilPersona()` (~250 líneas)

*(2026-08-26, primero de los seis módulos que quedaban)*

Los tres sitios con texto libre se convirtieron a `html\`\``: `_renderListaPersonas()` y `_selPersonaFiltrar()` (nombre + iniciales de persona/deudor/mi-deuda, badges de estado antes armados a mano con `+`/template strings sin tag, ahora fragmentos `html\`\`` interpolados directo sin `.join()`, más el término buscado `q` en el mensaje "No se encontró") y **`abrirPerfilPersona()`** — la función más grande del archivo, con una estructura más densa: bloques `${cond ? \`<div>...</div>\` : ''}` con HTML literal anidado dentro de otros `${}`. Cada uno de esos bloques anidados se convirtió a `html\`\`` también, así el fragmento interno llega marcado `__raw` y el `html\`\`` exterior lo interpola sin re-escaparlo — nada de `raw()` a mano salvo en `Events.attr(...)`.

Ningún hallazgo nuevo de escapado — los cuatro sitios ya escapaban bien con `escHtml()` antes de esta migración. Los `toast()` se dejaron con `escHtml()` a mano, mismo criterio de siempre. `_renderColorPicker()` no se tocó por no tener texto libre que corregir.

Validado con `node --check` y una simulación jsdom con un payload malicioso (`<img src=x onerror=alert(1)>"'&`) inyectado en el nombre de persona/deudor/mi-deuda y en las cinco notas de texto libre de `abrirPerfilPersona()` — las cinco aparecen escapadas en el DOM resultante, cero HTML sin escapar, sin romper la estructura de grids/badges/botones alrededor. **Sin prueba en navegador real** (jsdom, no un navegador).
