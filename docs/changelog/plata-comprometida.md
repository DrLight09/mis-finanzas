# Historial: Plata comprometida

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

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

Detectado en la misma revisión general que Alcancía y Gastos (ver `changelog/mesada.md`). `_cpEliminar()` no tenía ningún chequeo de fecha ni de operaciones posteriores, a pesar de ser el módulo con más superficie de reversión: si el ingreso ya fue `recibido`, borrar revierte reposiciones en cuentas, entradas en cajitas y compras de TC asociadas — todo de golpe, sin importar cuánto tiempo pasó ni cuántas operaciones nuevas tocaron esas mismas cuentas desde entonces. El diálogo ya avisaba *qué* se iba a revertir; no protegía *cuándo* era seguro hacerlo.

Fix: antes de mostrar el diálogo de confirmación (único, no se agregó uno nuevo — el aviso de antigüedad se inyecta como párrafo adicional en el mismo mensaje que ya arma la función), se calculan las cuentas/TC realmente afectadas (mismo set de casos que ya usaba la función para construir la advertencia: `reposicion`, `gasto`+`tc`, `gasto`+`cajita`, y su versión "no recibido" con `yaSaque`/`yaPague`) y se toma el máximo de operaciones posteriores entre todas ellas — mismo patrón que la rama `'transferencia'` de `movimientos.js` cuando hay más de una cuenta en juego.

**Limitación conocida, documentada en el código y en el doc:** no hay una fecha propia por cada adelanto/marca individual (`d.yaSaque`/`d.yaPague` son solo booleanos). Se usa `item.fechaRecibido` cuando ya se recibió (que es cuando de verdad se generaron los movimientos reales), o `item.fechaLlegada` como mejor aproximación disponible si aún no se ha recibido pero ya hay adelantos/marcas de TC. Si en el futuro se guarda una fecha propia por destino, hay que actualizar esto.

Usa la clave de módulo nueva `'plata_comprometida'` en `nivelAntiguedadMovimiento()` — ver `changelog/infraestructura-seguridad.md` (2026-09-01) para el cierre de la config correspondiente en `core-state.js`.

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
