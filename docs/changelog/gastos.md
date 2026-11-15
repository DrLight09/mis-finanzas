# Historial: Gastos

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Gastos

### 🐛 Corregido (2026-10-24) — «Registrar gasto» se abría aunque no hubiera ninguna cuenta con saldo (`gastos.js`, `fuentes-filtro.js`)

*(Mejora 2.)* «¿De dónde salió la plata?» es obligatorio y su selector ya se podaba con `PRESET.SALIDA`; sin cuentas utilizables el sheet se abría con un select sin opciones. `abrirNuevoGastoVar()` ahora consulta la nueva `FuentesFiltro.hayUtilizable(getFuentes(), PRESET.SALIDA)` y, si no hay ninguna, avisa con `FuentesFiltro.MSG_SIN_SALDO` y no abre. Cuenta como utilizable una TC con cupo (un gasto también puede cargarse a una tarjeta). Cubre los tres accesos (estado vacío, botón de la lista y menú +), que pasan por esa función.
- **Tuteo:** `MSG_SIN_SALDO` decía «No tenés cuentas con saldo disponible» (voseo) y se mostraba también como texto del select vacío de Registrar gasto, Pagar gasto fijo, Pagar Spotify y Pagar TC. Ahora: «No tienes cuentas con saldo disponible».
- **Prueba:** `tests/nucleo.test.js` → `requisitos-y-filtros-de-sheets` (sin saldo no abre; con saldo abre; sin saldo pero con una TC con cupo abre). **Falla sin el arreglo.**

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

Detectado en la misma revisión general que Alcancía (ver `changelog/mesada.md`, `CHANGELOG.md`). Dos hallazgos separados:

1. **`deleteGastoVar()` (botón de eliminar en la pantalla de Gastos) no tenía ninguna protección**, a pesar de que el mismo `S.gastosVar` SÍ está protegido cuando se borra desde la pantalla de movimientos de una cuenta (rama `'gasto'` de `eliminarMovimiento()` en `movimientos.js`, que ya exigía `g.fuente` antes de calcular nivel). Mismo dato, dos botones de borrado, solo uno protegido. Fix: se replicó la misma lógica (gasto normal, compra/pago de TC) directamente en `deleteGastoVar()`, con un flag `confirmado` para no pedir doble confirmación cuando el nivel es 'viejo' (mismo patrón que `eliminarMovimiento()`).
2. **Los gastos divididos entre varias cuentas (`g.splits`) no tenían protección en NINGÚN lado** — ni en `movimientos.js` ni (antes del fix de este mismo commit) en `gastos.js`. Causa: `g.fuente` queda vacío cuando el gasto se registró dividido (ver `addGastoVar`), y la rama `'gasto'` de `eliminarMovimiento()` solo chequeaba `g.fuente`, sin una rama alterna para `g.splits`. Fix: nueva rama en ambos archivos que toma el máximo de operaciones posteriores entre todas las cuentas del split (mismo patrón que `_deudorOpsPosteriores` para préstamos con `fuentes[]`).

Validado con `node --check` en ambos archivos (`gastos.js`, `movimientos.js`).

### ✅ Corregido — 5 sitios de `fuenteLabel()`/`cat`/`<option>` sin escapar

*(2026-07-23, confirmando la extracción a `js/modules/gastos.js` contra su código fuente)*

Séptima confirmación del mismo patrón: `fuenteLabel()` sin escapar en el badge de fuente de cada gasto, en dos `toast()` de error de `addGastoVar` y en el `toast()` de "compra cargada a" (con `tc.nombre`), más el `<option>` del selector propio de `abrirPagarGastoFijo()` sin escapar (reimplementaba su selector a mano en vez de `poblarFuente()`, mismo hallazgo puntual que ya tenía Tarjetas de Crédito). Los 5 corregidos con `escHtml()`. Por separado, el 2026-08-22 apareció además `g.cat`/`x.cat` (categoría personalizada) sin escapar en los badges de gasto variable y fijo — ver `changelog/infraestructura-seguridad.md`.

### ✅ Corregido — Migrado a `html\`\``: sombra de variable y un `raw()` mal aplicado corregido a tiempo

*(sesión posterior, primero de los siete módulos que quedaban)*

Migrados `renderMesFiltros()`, `renderGastosVar()` (incluida la función interna `itemHtml()`, usada tanto para gastos variables puros como para compras/pagos de TC y pagos de fijos en el mismo historial) y `renderGastosFijos()`, más el `<option>` del selector de cuentas en `abrirPagarGastoFijo()`.

Dos hallazgos reales:

1. **Sombra de variable**, misma recurrencia que `mesada.js`: `renderGastosVar()` tenía `let html=''` para ir acumulando el string final — tapaba la función global `html\`\`` dentro de esa misma función. Renombrada a `contenido`, y convertida a array en vez de string: las tres secciones (gastos puros, compras TC, pagos TC, pagos de fijos) se acumulan como fragmentos `html\`\``/arrays anidados sin `.join()` explícito, así que no aplica el punto ciego de doble escapado que sí tuvo `mesada.js`.
2. **Uno nuevo, no visto en los módulos anteriores:** al migrar el `<option>` de cuentas se envolvió primero `f.val` en `raw()`, por parecerse al caso ya confirmado de `ing.id` en `analisis.js` (un id interno, no texto de usuario). Pero acá no había forma de confirmarlo sin `getFuentes()` (núcleo, no recibido esa sesión) — pudo ser un id fijo o el nombre de una cuenta personalizada. Una simulación jsdom con un `val` malicioso (`ahorros"><script>alert(2)</script>`) confirmó que envolverlo en `raw()` sí rompía el atributo `value` del `<option>` si el supuesto fuera falso. Se corrigió dejándolo escapado por defecto, como `f.label`.

Los 4 `toast()` con `fuenteLabel()`/`tc.nombre` se dejaron con `escHtml()` a mano, mismo criterio de siempre. Validado con `node --check` y una simulación jsdom (contra la implementación real de `js/core/html-tag.js`) con payloads maliciosos en `desc`, `cat`, `nota`, `fuenteLabel()` de splits, `_origenSeccion`, nombre de gasto fijo, y `label`/`val` de fuentes — verificado por DOM real (`querySelector`/atributos), no por substring del HTML serializado (que puede mostrar `<`/`>` literales dentro de un atributo sin que sea un problema real; así aparecieron los primeros dos falsos positivos de esta misma simulación, antes de corregir el método de verificación). **Sin verificar en navegador real.**

---
