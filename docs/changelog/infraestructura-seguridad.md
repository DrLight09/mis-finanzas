# Historial: Infraestructura / seguridad

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Infraestructura / seguridad

### 🧱 Fila de movimiento compartida (2026-10-27, último punto del análisis de estructura transversal)

- **Antes:** Tarjetas (4 plantillas), Encargos (2), Gastos (2) y Cuentas (1) armaban a mano el mismo esqueleto `.gasto-item > .gasto-item-top > nombre/fecha | monto/acciones > meta`, cada una con envoltorios propios que eran la misma regla CSS repetida (`tc-flex1-min0`/`enc-flex1-min0`, `tc-row-13`/`enc-rn13`/`row-name-13`, `tc-monto-fila`/`enc-fila-g6`/`gasto-acciones`/`cuenta-flex-8`). Cambiar el aspecto de una fila obligaba a tocar 4 módulos.
- **Ahora:** `filaMovimiento({clase, attrs, nombre, nombreClase, nombreExtra, sub, subClase, monto, montoClase | montoHtml, acciones, antesMeta, meta, metaClase, despues})` y `botonEliminarFila(accion, args, titulo)` en `core-state.js` (junto a `emptyState()`). El borde/color de cada variante sigue siendo una clase que pasa el módulo (`tc-item-b-*`, `enc-item-b-*`), nunca estilo en línea. Las 9 plantillas pasaron al helper; `data-mov-*` y `data-action` viajan en `attrs`, así que el detalle de movimientos funciona igual.
- **Cambios visibles (mínimos, a propósito):** el espacio entre monto y botón de eliminar es 8px en todas las filas (Tarjetas y Encargos tenían 6px); el icono de eliminar mide 14px en todas (Tarjetas usaba 13px y un tapón distinto); los botones de eliminar de Tarjetas y Gastos ganan `title` (accesibilidad). La fila de Cuentas conserva su botón y su candado propios (`btn-icon cuenta-btn-del`), pasados por `acciones`.
- **CSS retirado (sin uso):** `.tc-row-13`, `.tc-monto-fila`, `.enc-rn13`, `.enc-flex1`. Siguen `.tc-flex1-min0`, `.enc-flex1-min0`, `.enc-fila-g6` y `.cuenta-flex-8` porque otras pantallas los usan.
- **Pruebas:** bloque `fila-movimiento` en `tests/nucleo.test.js` (esqueleto y escapado, meta opcional, `montoHtml`, botón sin `onclick`) y una guardia: `class="gasto-item-top"` solo puede aparecer en `core-state.js`. Con esto el análisis quedó cerrado: lo único que quedaba era este punto; los formularios y los módulos gigantes se atacan al tocarlos, como ya decía.

### 🧹 Planes retirados tras verificarlos contra el código (2026-10-27)

- **Se eliminaron de la raíz** el plan de reestructuración, el plan de clasificación de movimientos y una copia suelta de `libro-de-movimientos.md` (idéntica a la de `docs/`). Comprobado en el código antes de borrar: B1–B5 y B8 ya corregidos (`Configurar saldo mínimo` una sola vez, sheet `mov-cuenta-custom` fuera, `_fechaSafe` en `inicio.js`, un solo listener de cierre del tooltip de Proyección); `calcC`/`calcCDT`/`getCajitaNombre` viven en `js/core/nu-calc.js`; `Periodo` (`periodo.js`) es la definición única del mes; `save()` ya no lee inputs del DOM (esas lecturas están en `load()`, que solo pinta valores); `mesadaMonteMama`/`plataCometida` no existen; `S.schemaVersion` + `MIGRACIONES` en `core-state.js`; Paso 5 cerrado el 2026-10-24. La clasificación por `clase` está implementada y documentada en `analisis-financiero.md`; E6 (una sola lista) es `S.movimientos` y E7 se resolvió con el libro de patas de caja, no con partida doble.
- **Lo único que se conservó** es la decisión «`clase` en vez de partida doble» y el pendiente de Encargos (`neutro` vs `tercero`), ahora en `libro-de-movimientos.md` §7. Los comentarios de código que apuntaban al plan de clasificación (`core-state.js`, `cuenta-efectos.js`, `tests/nucleo.test.js`) y los de `guia-estilo-sheets.md` y de la entrada del Paso 5 apuntan ahora a `analisis-financiero.md` / `auditoria-tecnica.md`. Sin cambios de comportamiento.
- **Referencias a `mejoras.md` retiradas** (el archivo no existe): los puntos de esa lista ahora se citan como «Mejora N» y la sección se llama «Lista de mejoras de octubre 2026». **Pendiente cerrado en `configuracion.md`:** con `sheet-stack.js` y `html-tag.js` ya en el repo se verificó que `applyModulos()` trata un `corregirSaldo` sin valor como encendido (`!== false`), y que `notificaciones:activar` lo atiende `notificaciones-push.js`.
- **Análisis de estructura transversal, re-medido:** el punto 1 (estados vacíos) y el 4 (mínimo de cuentas al dividir) ya estaban hechos (mejoras 1, 3 y 4 de la lista de octubre); el 2 (íconos) también: 290 de 293 `<svg>` llevan `aria-hidden` y los 3 restantes son el favicon y reglas CSS; el 7 (personas de Spotify) no duplica datos: cada integrante guarda `personaId` y su `nombre` se resuelve desde `S.personas` (`spNombreDe`) al guardar, así que no hace falta migración. Quedan solo el 3 (fila de movimiento compartida) y los puntos 5 y 6, que el propio documento marca como «no de forma preventiva».

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

`totalPrestadoPendiente()` (`prestado.js`) llama a `getDeudorSaldo()` como global. Al moverla a `calc-helpers.js` (ver `changelog/inicio.md`), ese test —que cargaba solo `core-state.js` y `prestado.js` en modo `permissive`— dejó de tenerla: el `Proxy` fabrica un no-op que devuelve `undefined`, `saldo > 0` da falso y la suma queda en 0 **sin ningún error** (la trampa ya documentada del modo `permissive`). Fallaban los tests de las líneas 54 y 64; los demás pasaban porque no llaman a esa función. El aviso de GitHub "Node.js 20 is deprecated" no era la causa.

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

Al agregar protección por antigüedad a Alcancía y Plata Comprometida (ver `CHANGELOG.md` y `changelog/plata-comprometida.md`), esas dos claves de módulo nuevas (`alcancia`, `plata_comprometida`) se agregaron primero solo al objeto `S` inicial — pero el `load()` real que corre en cada carga de datos guardados tenía esta guarda:

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
