# Historial: Actividad reciente

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

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
