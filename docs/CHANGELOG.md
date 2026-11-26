# Historial de cambios de Mis Finanzas

Aquí quedan las entradas más recientes (de la v117 en adelante, por fecha y versión del Service Worker). El resto del historial está en `docs/changelog/`:

- **Por tema** (qué cambió en cada módulo y por qué; el código cita estos archivos en sus comentarios):
  - [Arranque](changelog/arranque.md)
  - [Infraestructura / seguridad](changelog/infraestructura-seguridad.md)
  - [Sheets / UI](changelog/sheets-ui.md)
  - [Libro de movimientos](changelog/libro-de-movimientos.md)
  - [Cuentas](changelog/cuentas.md)
  - [Gastos](changelog/gastos.md)
  - [Inicio](changelog/inicio.md)
  - [Análisis financiero](changelog/analisis-financiero.md)
  - [Patrimonio y cálculos globales](changelog/patrimonio-y-calculos-globales.md)
  - [Salud financiera](changelog/salud-financiera.md)
  - [Proyección financiera](changelog/proyeccion-financiera.md)
  - [Prestado](changelog/prestado.md)
  - [Préstamos](changelog/prestamos.md)
  - [Encargos](changelog/encargos.md)
  - [Mesada](changelog/mesada.md)
  - [Spotify](changelog/spotify.md)
  - [Tarjetas de crédito](changelog/tarjetas-credito.md)
  - [Plata comprometida](changelog/plata-comprometida.md)
  - [Protección por antigüedad de movimientos](changelog/proteccion-antiguedad-movimientos.md)
  - [Wrapped](changelog/wrapped.md)
  - [Actividad reciente](changelog/actividad-reciente.md)
  - [Personas](changelog/personas.md)
  - [Configuración](changelog/configuracion.md)
  - [Lista de mejoras de octubre 2026](changelog/lista-de-mejoras-de-octubre-2026.md)
- **Por fecha** (v85 a v116, 1 al 10 de noviembre de 2026): [cronologico-2026-11.md](changelog/cronologico-2026-11.md).

Regla: una entrada nueva va **aquí, arriba**; cuando haya más de unas diez, las más antiguas se pasan a `docs/changelog/` (por tema si hablan de un módulo, por fecha si no).

---

## 2026-11-25 — Eliminar un respaldo desde la app

**Probado solo con Node y un Firestore simulado; sin ver en navegador real ni contra las reglas reales.**
- `borrarRespaldo` (`js/core/respaldos.js`, expuesto como `_firebaseRespaldos.borrar`): borra UN respaldo de la nube, del equipo o de ambos. En la nube el índice y el documento se actualizan en una sola transacción (sin fila fantasma ni documento huérfano). Solo acepta ids `respaldo-…`: `finanzas`, el índice y ids raros lanzan sin tocar nada. Un id que ya no existe no es un error. No lanza por fallos de red: devuelve `{ ok, nube, equipo, errores }`.
- Botón «Eliminar» por fila (`eliminarRespaldo`, `configuracion.js`) con confirmación que dice de dónde se borra; advierte si es el único respaldo previo; se rehúsa durante una importación; si falla a medias lo dice y no finge éxito; repinta la lista al terminar.
- Pruebas: 7 de `borrarRespaldo` y 3 de pantalla en `tests/respaldos.test.js`.

---

## 2026-11-25 — Importar, restaurar y «Ver» un respaldo muestran qué cambia

**Probado solo con Node; sin ver en navegador real.**
- `js/core/resumen-datos.js` (nuevo, puro, cargado desde `main.js`): `resumirDatos(plano)` (conteos de cuentas, cajitas, movimientos, tarjetas, préstamos, encargos, personas y meses cerrados; saldo de cuentas y cajitas; esquema; rango de fechas) y `compararResumenes(actual, nuevo)`. Tolera entradas raras, campos que falten y esquemas viejos. El saldo es el guardado (respaldos viejos) o se deriva de su libro, como lo mostrará la app tras cargarlo.
- «Importar datos» y «Restaurar respaldo» (`configuracion.js`) muestran en su confirmación «ahora X, en el archivo/respaldo Y» (`_textoImpacto`); antes la persona confirmaba a ciegas.
- Nuevo botón «Ver» en cada respaldo (`verContenidoRespaldo`): resumen y comparación sin cargar, validar ni migrar nada y sin PIN; un respaldo ilegible avisa y no abre nada.
- Pruebas: `tests/resumen-datos.test.js` (4) y 2 casos nuevos más aserciones del diálogo en `tests/respaldos.test.js`. **Sigue pendiente** «Eliminar un respaldo» (§15.3 de `pendientes.md`).

---

## 2026-11-26 — Bug: pagar un gasto fijo con fecha de otro mes y eliminar el pago dejaba el gasto «pagado»

**Probado solo con Node; sin ver en navegador real.** Lo encontró la prueba de secuencias aleatorias de gastos fijos y tarjeta (`tests/secuencias-fijos-tc.test.js`).
- **El bug:** `confirmarPagarGastoFijo` marca el pago en `S.pagosGastosFijos` con la clave del mes ACTUAL (el mes que cubre), pero la fecha del pago puede ser de otro mes (la hoja deja elegirla). Al eliminar ese pago, `deleteGastoVar` y `eliminarMovimiento` desmarcaban con el mes de su FECHA: otra clave. Resultado: la plata se devolvía y el gasto se borraba, pero el gasto fijo seguía «pagado» este mes (no se podía volver a pagar: «Este gasto ya fue pagado este mes») y su monto seguía contando en los gastos fijos del mes.
- **El arreglo:** el pago guarda `mesCubre` (el mes que cubre) y las dos rutas de eliminación desmarcan `g.mesCubre || mesKey(g.fecha)`. Los pagos creados antes del campo siguen desmarcándose por la fecha, como antes (hay prueba).
- **Pruebas:** `tests/secuencias-fijos-tc.test.js`: 6 secuencias aleatorias de 120 pasos (pagar gasto fijo con cuenta o tarjeta, con fecha de este mes o del anterior; pagar la tarjeta desde una cuenta; eliminar cualquiera) comprobando tras cada paso saldos, deuda de la tarjeta, gastos fijos marcados como pagados, `Libro.verificar` y `Libro.verificarEspejo`; más una regresión y una de compatibilidad. Sin la corrección fallan 7 de las 8. La protección por antigüedad (que bloquea a propósito un pago viejo con varias operaciones posteriores) se desactiva en estas pruebas: tiene las suyas.

---

## 2026-11-26 — Secuencias aleatorias de crear y eliminar con las funciones reales

**Probado solo con Node; sin ver en navegador real.** `tests/secuencias-libro.test.js`: 8 semillas × 150 pasos de ingreso, retiro, transferencia y gasto variable, creados con `registrarEntradaConApertura`, `registrarSalida`, `confirmarTransferir` y `addGastoVar` (formularios simulados) y eliminados con `eliminarMovimiento` (la ruta de la pantalla, con su protección y su diálogo). Tras cada paso: saldo de cada cuenta == modelo independiente, `Libro.verificar` y `Libro.verificarEspejo`; al final, eliminar todo devuelve los saldos iniciales y deja el libro neto en 0 por cada ref. **No encontró ningún fallo.** Validada con una mutación (reversión de retiros con +1 centavo → la prueba falla en el primer retiro eliminado).

---

## 2026-11-25 — Fusión: listas por fecha sin duplicar el mismo día

**Probado solo con Node; sin ver en navegador real.**
- **Bug real:** `patrimonioHistorial` e `historialTasas` son listas sin `id` (una fila por `fecha`) y se fusionaban como conjuntos por su JSON: si dos dispositivos registraban el patrimonio (o cambiaban la tasa) del MISMO día con valores distintos, quedaban DOS filas para ese día.
- **Arreglo** (`js/core/fusion.js`): `CLAVES_NATURALES = { patrimonioHistorial: 'fecha', historialTasas: 'fecha' }`; esas listas se fusionan por esa clave (altas y bajas de tres vías como las listas con `id`). Si los dos tocaron el mismo día de forma distinta gana la fila de mayor texto JSON: no es «mejor», pero es la misma en los dos dispositivos (determinista). La lista queda ordenada por fecha, así que el último elemento es el más reciente (lo que lee el resto del código).
- **No se cambió a propósito:** los nombres de categorías (`catsVar`, `catsFijo`) renombrados de forma distinta en los dos lados siguen dejando los dos nombres; son etiquetas y no hay forma de saber cuál prefiere la persona.
- Pruebas: 3 casos nuevos en `tests/fusion.test.js` y las 300 secuencias de `tests/fusion-propiedades.test.js` ahora incluyen estas listas (conmutatividad, idempotencia, una fila por fecha, orden).

---

## 2026-11-24 — Coherencia espejo ↔ libro (`Libro.verificarEspejo`) y ida-y-vuelta de Préstamos

**Probado solo con Node; sin ver en navegador real.**
- `Libro.verificarEspejo(estado)` (`js/core/cuentas-fuentes.js`): cada pata del libro con `origen.ref` cuyo neto por (ref, cuenta) no sea 0 tiene que apuntar a un registro existente (`id` o clave de `pagosGastosFijos`, que es como se referencian los gastos fijos). Detecta un registro borrado sin revertir su plata.
- **El cierre la exige:** si el espejo y el libro estaban coherentes y el cierre los separaría (podar un registro dejando su pata, o al revés), aborta con `espejo-roto` sin escribir. Si ya venían incoherentes no se bloquea.
- `tests/consistencia-libro.test.js` (6) y `tests/ida-y-vuelta.test.js` (6 operaciones de Préstamos: aplicar → coherente; revertir → estado y saldos exactos, libro neto 0). Todas pasaron: Préstamos ya cumplía el contrato.
- `tests/ida-y-vuelta-encargos.test.js` (3: traspaso «Me lo regalaron» y «Yo puse la plata» simple y dividido, eliminados con `deleteMovimientoEncargo`) y `tests/ida-y-vuelta-alcancia.test.js` (3: depósito desde cuenta, directo y dividido, eliminados con `alcanciaEliminarDeposito`). También pasaron. Como crear estos movimientos lee el DOM, el estado de creación se arma replicando lo que escribe el código; las pruebas verifican que ELIMINAR revierte exactamente lo que la creación deja.

---

## 2026-11-23 — Cierre de períodos, etapa 2: motor, candado y pantalla de Configuración

**Probado solo con Node y datos sintéticos; sin ver en navegador real.** El botón aparece únicamente cuando hay algo cerrable (con datos reales, desde ~oct 2028).
- **Relectura y dispositivo atrasado:** tras cerrar se fuerza el guardado y se relee el documento del servidor (`Cierre.verificarGuardado`, `window._firebaseReleerEstado`); si no coincide, aviso con la salida (el respaldo). Tras fusionar, `Cierre.registrosDeMesesCerrados` detecta registros de meses ya cerrados que trajo un dispositivo atrasado y deja `S.cierre.revisar` (alerta en Configuración con «Ya los revisé»). `scripts/generar-datos-prueba.js` genera un respaldo sintético importable para probar el cierre a mano.
- **Pantalla:** tarjeta «Cierre de períodos» en Configuración (`renderCierrePeriodos`) y flujo `cerrarPeriodosAntiguos`: resumen → aviso de Wrapped sin guardar (hay que aceptarlo) → descarga del respaldo y confirmación → PIN → `Cierre.ejecutarCompleto` (espera las sondas bajo demanda) → mensaje claro por cada motivo de rechazo. Gastos muestra el resumen de un mes cerrado (`.mes-cerrado-aviso`); el CSV trae su resumen por categoría.
- `Cierre.ejecutar(corte, opciones)` (`js/core/cierre.js`): clona, calcula la huella con todas las sondas base, analiza el corte, aplica el cierre al clon y vuelve a calcular la huella; cualquier diferencia, error de sonda, sonda faltante o `componente-grande` lo detiene **sin escribir**. Exige la política de 24 meses salvo `forzar`. Repetirlo da `ya-cerrado`.
- Aplica: resumen congelado `S.resumenMeses` (los 10 campos de la sonda más `extraTotal`, `recurrenteTotal`, `ingresosExtra`, `ingresosSinExtra`, `gastosSinExtra`: los 10 no bastaban para que `Periodo` diera lo mismo); poda por componentes archivables; libro plegado en una entrada `cierre` por cuenta (en centavos enteros; saldo derivado idéntico); `S.cierre = {corte, ejecutadoEn}`.
- `Periodo` lee el resumen de un mes cerrado para totales y agregados (las listas devuelven lo que quede); sin resumen se comporta igual que antes (prueba).
- Candado en `nivelAntiguedadMovimiento`; «Saldo anterior» en el historial de cuentas; `resumenMeses` y `cierre` en la clasificación y en la validación al importar.
- `tests/cierre-ejecucion.test.js` (15): saldos, libro, huella y `Periodo` de todos los meses idénticos; lo abierto no se toca; entidad cerrada sí se poda; idempotente; cierres sucesivos; política; huella distinta, sonda faltante → nada escrito; respaldo anterior importable; operaciones posteriores; candado.

---

## 2026-11-23 — Fusión: prueba de propiedades y dos bugs que encontró

**Probado solo con Node; sin ver en navegador real.** `tests/fusion-propiedades.test.js`: 300 secuencias aleatorias (semilla fija) de dos dispositivos que parten de la misma base, con libro, listas con `id` y listas sin `id`. Exige: conmutativa, idempotente, base como un lado da el otro, saldo fusionado == base + Δ local + Δ remoto al centavo, sin ids duplicados y montos a centavos.
- **Bug 1 (no conmutativa):** una entrada de rendimiento que los dos dispositivos aumentan en el mismo mes cambia su `fecha` en ambos; ganaba la del «local», así que el resultado dependía del orden. Nueva regla `MAXIMOS` en `js/core/fusion.js`: si los dos cambiaron esa fecha, queda la mayor (solo para `libro.fecha`).
- **Bug 2 (residuos binarios):** la suma `base + Δlocal + Δremoto` de `ADITIVOS` dejaba montos como `0.30000000000000004`; ahora se redondea a centavos.

---

## 2026-11-23 — Arreglos rápidos de `pendientes.md` (tope de tamaño, errores no atrapados, textos de Análisis)

**Probado solo con Node; sin ver en navegador real.**
- **Tope de tamaño coherente con las reglas.** El cliente avisaba a 800.000 y bloqueaba a 1.000.000 caracteres, pero `firestore.rules` rechaza desde 950.000: entre 950.000 y 1.000.000 la escritura fallaba sin el mensaje «no caben». Ahora avisa a 760.000 y bloquea a 940.000 (`firebase-sync.js` y `Cierre.LIMITES`), y los mensajes usan la cifra real. Una prueba lee `firestore.rules` y exige que el límite del cliente quede por debajo.
- **Registro de errores no atrapados** (`js/core/registro-errores.js`, importado en `main.js` tras `puente` y `fecha`): guarda en este dispositivo los últimos 30 (`error` y `unhandledrejection`, sin repetidos seguidos) y Configuración los muestra en «Errores recientes» con «Copiar para reportar» y «Limpiar». Nada sale a ningún servidor.
- **Análisis:** «¿Por qué cambió tu patrimonio?» dice «se mantuvo igual» en vez de «subió $0»; la comparación de gastos dice «Aún sin gastos este mes» (antes «100% menos por ahora») e «Igual que el mes pasado» (antes «0% más»).

---

## 2026-11-23 — Saldo derivado del libro (paso 1 de `docs/diseno-saldo-derivado-y-cierre.md`)

El saldo de cuentas y cajitas **ya no se guarda**: es la suma de `S.libro`. **Probado solo con Node (vm); sin ver en navegador real.**
- `Libro` mantiene un índice por libro en centavos enteros (`registrar` lo actualiza; se reconstruye si el largo del libro cambia por fuera) y `Libro.hidratar(estado)` pone en cada cuenta/cajita un `saldo` accesora y no enumerable. Por eso ningún punto de serialización (guardado local, nube, `exportarJSON`, clones) lo incluye.
- `sumarFuente`, `descontarFuente` y `ajustarSaldoCuenta` solo registran en el libro. Asignar `saldo` a mano deja un ajuste `asignacion-directa` (y lanza con `Libro.estricto = true`).
- Se hidrata en `setEstado`, `load()`, al aplicar la nube y la fusión, al importar un respaldo y al crear cuentas/cajitas. Un respaldo viejo con `saldo` se conserva como ajuste «Saldo importado».
- Eliminado: `Libro.recalcularSaldos`, `_fijarSaldoReconciliado` y el aviso «el libro no cuadra» de `load()`.
- Pruebas: `tests/saldo-derivado.test.js` (8) y las de fusión y libro reescritas. `tests/support/load-app.js` expone `WeakMap` al sandbox.

---

## Versión PC, parte 21: Tarjetas de crédito como el prototipo (PC y celular)

Rediseño visual de la pantalla de Tarjetas siguiendo `TarjetaCredito/` (prototipo). **Sin ver en navegador real** (jsdom no dibuja): revisar a 1366×768, 1100, 800, 430 y 360.
- **Lista (`#tc-lista`)**: tarjeta con ícono de 18 px, botones de editar/borrar cuadrados, cajas «Deuda actual» y «Cupo disponible» con tinte y borde, barra «Usado» y botones `+ Compra` (contorno), `Pagar` (verde) y `Ver`. En PC no hay «Ver»: tocar la tarjeta la elige y queda con borde verde. `.tc-card-deuda` ya no existe.
- **Cabecera de la lista (`.tarjetas-cab`)**: en celular, título «Tarjetas de crédito» + «Agregar tarjeta» arriba de todo; en PC, etiqueta «Tarjetas» + «Agregar tarjeta de crédito» fijos arriba de la lista. Un solo botón (`#btn-nueva-tarjeta`); con 0 tarjetas se oculta por CSS con `data-vacio="si"` en `#screen-tarjetas` (se quitó el `mostrarSi`). Con 0 tarjetas el resumen también se oculta y el estado vacío ocupa todo el ancho (PC).
- **Detalle**: en PC, caja a la derecha con las dos cajas (deuda / este mes), cobertura con barra y pastilla, «+ Cargo especial» punteado y los movimientos como **tabla** (Fecha, Descripción, Detalle, Monto, borrar). En celular el detalle **ya no es hoja**: es una pantalla propia dentro de `#screen-tarjetas` con botón volver (`data-detalle-abierto="si"`, acción `tarjetas:cerrarDetalle`), igual que la ficha de Personas. Se quitó `#sheet-detalle-tc`; `abrirDetalleTCSheet` conserva su nombre y pinta en el panel (PC) o abre la pantalla (celular).
- **Columna «Estado» del prototipo: no se hizo** (la app no guarda ese dato). En su lugar, «Detalle» trae la categoría (compras), el origen «Desde …» (pagos) o el tipo (encargo, préstamo, pago de deuda). El saldo inicial y «Reduce deuda» van como etiqueta debajo de la descripción.
- **Filas**: una sola función `_tcFila` para PC y celular (cuadrícula CSS: tabla en PC, lista en celular). Fecha corta («8 nov»; con año si no es el actual). Se quitó el `style="cursor:pointer;"` del fragmento `_tcAttrs`.
- **Hojas** (pagar y cargo especial): sin cambios. Ajustes posteriores (mismo día): (1) estado vacío de Tarjetas en caja con fondo también en celular, centrado en PC; (2) «Sin movimientos registrados.» centrado, con línea bajo «Movimientos» (`.tc-mv-vacio`); (3) `sheet-mov-detalle` (compartida con los demás módulos): la cabecera (tipo, monto, descripción, fecha) va dentro de una caja (`.mdet-cab`), con X en PC y «Cerrar» solo en celular (`.sheet-cerrar-movil`); (5) `sheet-pagar-tc`: X en PC y «Confirmar pago» + «Cancelar» en una fila y más pequeños (`.sheet-acciones`); (4) `sheet-compra-tc`: botón «Registrar compra» verde (`btn-primary`, como «Pagar»), X en PC, «Registrar compra» + «Cancelar» en una fila y más pequeños en PC (`.sheet-acciones`), y Monto junto a Fecha en PC (`.sheet-par`; en celular la Fecha sube justo debajo del Monto).
- Pruebas: `smoke-browser.js` (FASE 4) comprueba ahora `data-vacio` en vez de la visibilidad del botón. `npm test`, `npm run lint`, `npm run tipos` y `npm run smoke` en verde.
- Archivos: `index.html`, `css/styles.css` (bloque `tc-*` reescrito), `css/pc.css` (bloque de Tarjetas), `js/modules/tarjetas-credito.js`, `scripts/smoke-browser.js`.



## Varias pestañas: «Actualizar» y «Borrar todos los datos»

- **«Actualizar» en la segunda pestaña no hacía nada:** la primera ya había activado la versión nueva, y esa versión ya no atiende el mensaje de activación. Ahora, si el worker ya no está «en espera», el botón recarga directamente; y si otra pestaña activó la versión, esta muestra el aviso (sin recargar sola, por si se está escribiendo). `js/core/sw-registro.js`, pruebas en `tests/sw-registro.test.js`.
- **Los datos borrados volvían:** al borrar todo en una pestaña, la otra (con datos) ignoraba la nube vacía y, al agregar algo, volvía a subir todo. Ahora, si llega un documento vacío (`{}`) más nuevo y no lo escribió este mismo dispositivo, la pestaña bloquea el guardado, avisa «Se borraron todos los datos desde otro dispositivo» y recarga, igual que la que borró. No guarda copia local: se pidió borrar todo, y también limpia los respaldos de ese equipo (los de la nube ya los borró quien borró). Cubre además la carrera en que el borrado y un guardado de esta pestaña caen en la misma revisión, y varias entregas del mismo borrado recargan una sola vez. Límite conocido: un dispositivo que estuvo sin red con cambios sin enviar puede reponerlos al reconectar (la cola de escritura del SDK no se puede cancelar desde la app). `js/core/firebase-sync.js` (`_adoptarBorradoRemoto`) y `configuracion.js` (`_borrandoTodo`); dos pruebas en `tests/sesion-y-despliegue.test.js`.

## Aviso de Node en el chequeo de notificaciones

- Se añadió `js/package.json` con `{ "type": "module" }`: todo lo de `js/` es módulo ES, y así Node deja de avisar `MODULE_TYPELESS_PACKAGE_JSON` (y de releer `umbrales.js` y los demás) en el Action de notificaciones.

## Reglas de Firestore probadas y más cortas

- `firestore.rules` se probó en la Zona de pruebas de reglas de la consola (8 casos: lectura propia, de otro usuario, sin sesión y de ruta ajena; escritura válida, con campo de más, con payload vacío y de tokens push) y todas dieron lo esperado. Se recortaron los comentarios a los que evitan errores; la lógica no cambió.

## Teclado que se abría al cargar

- Se quitó `autofocus` del campo de búsqueda y del monto de «Agregar dinero»: en el celular el navegador lo aplicaba al cargar y abría el teclado (el numérico, el del monto) unos segundos en cada recarga. Prueba nueva en `tests/convenciones.test.js`.

## Tipos con `tsc --checkJs`, imports de la lógica pura y limpieza

- Nuevo `npm run tipos` (TypeScript como herramienta de desarrollo, sin build): revisa los archivos de lógica pura y de sincronización listados en `tsconfig.json`. Corre también dentro de `npm test` (`tests/tipos.test.js`). `subir.sh` ahora ejecuta `npm ci` solo si falta TypeScript/jsdom o cambió `package-lock.json`. Encontró que `salud.js` usaba `cuentasAhorro`/`fuenteDeCuenta` sin declararlas; quedan en `js/tipos-globales.d.ts`.
- `gastos`, `inicio`, `analisis`, `wrapped` y `wrapped-gate` importan `UMBRALES`, `Salud`, `Reglas` y `PlanDeudas` en vez de leerlos del global.
- Se borró `diffHtmlBloque` (plantilla que nadie llamaba) de `diferencial.js`.

## Los cuatro archivos de lógica pura pasan a módulos ES

- `umbrales.js`, `reglas.js`, `salud.js` y `plan-deudas.js` ya no son `<script>` clásicos: son módulos ES (`export const …`), importados desde `js/main.js` antes que el resto. `reglas.js` y `salud.js` importan `UMBRALES` (y `Reglas`) en vez de buscarlos en el global o con `require`; se quitaron los `window.X = …` y los `module.exports` de cada uno.
- Siguen sin tocar `window` ni el puente, a propósito, para que Node los cargue sin navegador: el script de notificaciones (`scripts/notificaciones/checks.js`) y las pruebas hacen `require` de un módulo ES (Node 20.19+ / 22.12+, el `.nvmrc` es 22) y leen `{ Reglas }`, `{ Salud }`, `{ UMBRALES }`, `{ PlanDeudas }`. El nuevo `js/core/globales-logica.js` los deja en `window` dentro de la app.
- `index.html` ya no tiene ningún `<script>` clásico de la app (solo `main.js` y los módulos de Firebase/PIN). Prueba nueva en `tests/modulos-es.test.js`: esos cuatro no usan `window`/`require`/puente y `globales-logica.js` expone todos sus nombres después de ellos.
- Se quitó de `index.html` un comentario suelto («Sistema centralizado de eventos») que ya no describía nada, y las notas de `docs/` que hablaban de scripts clásicos.

## Limpieza tras M6: `waitFor` en un solo archivo y comentarios al día
- `wait-for-module.js` (la copia de `waitFor` para los módulos de Firebase y PIN, que existía mientras convivían scripts clásicos y módulos) se borró: `firebase-sync.js` y `pin-bio.js` importan de `wait-for.js`, que ahora sirve a todos.
- Unos 50 archivos tenían comentarios de cabecera que decían «clásico (`<script defer>`)» o «sin `type="module"`»: ahora dicen módulo ES y `js/main.js`. El comentario repetido del puente global se acortó.

## M6 completo: la app pasa de scripts clásicos a módulos ES nativos (sin bundler)
- **Qué cambió.** `index.html` ya no lista ~50 `<script defer>`: carga UN módulo, `js/main.js`, que importa el núcleo y las pantallas de carga inmediata en el mismo orden de siempre. Cada archivo exporta lo suyo e importa de forma explícita lo que usa de los archivos que cargan ANTES (~890 referencias). Los módulos de pantalla lazy se cargan con `import()` desde `Loader`. Las dependencias dejaron de ser implícitas: `npm run lint` ahora también revisa en modo módulo y `tests/modulos-es.test.js` vigila la estructura (imports de una línea que existen y exportan lo pedido, solo hacia atrás, sin ciclos, sin importar módulos lazy, nombres únicos, nada asigna un import).
- **Puente global (`js/core/puente.js`).** Lo que no se puede importar (módulos lazy; una llamada «hacia adelante» que solo ocurre al ejecutar; ~150 referencias) sigue llamándose por nombre suelto: cada módulo deja sus funciones (al principio, se hoistean) y constantes/clases (al final) en `window`; las `let` que otro archivo lee tienen accesor, para que nadie se quede con una copia vieja. Es lo que antes hacía el ámbito global de los scripts clásicos, ahora explícito y limitado.
- **`S`.** Es un `export let` (los importadores ven el valor actual) y el único reemplazo del estado completo (`conEstadoAislado`) pasa por `setEstado()`, que también mantiene `window.S`.
- **Excepciones.** `umbrales.js`, `reglas.js`, `salud.js` y `plan-deudas.js` siguen como `<script>` clásicos: son lógica pura que también carga Node con `require` (notificaciones y tests).
- **Herramientas.** `scripts/modulos-a-clasico.js` quita `import`/`export` para el arnés de tests (`loadApp`, vm), el lint y los humos de jsdom (que no ejecutan módulos): `scripts/jsdom-modulos.js` sirve `main.js` como su lista equivalente de scripts y el cargador lazy tiene un gancho `window.__cargarModulo` para esos humos. `tests/support/html-clasico.js` expande `main.js` para los tests que vigilan el orden. `generar-mapa.js` entiende `export` y `main.js`.
- **Verificado en Chromium real.** `npm run navegador` ahora también toca de verdad cada botón de cada pantalla y falla ante cualquier error de página o «No hay handler»; además se comparó el original (scripts clásicos) con la versión nueva con fecha y aleatoriedad fijas: 137 salidas idénticas (HTML de las 12 pantallas, las 56 hojas, resultado de tocar cada botón, cálculos de patrimonio y saldos tras movimientos), 0 errores de página en ambos.
- **Qué NO se pudo probar aquí:** el despliegue real en GitHub Pages (el Service Worker precachea `js/**`, así que incluye `main.js` y `puente.js` sin tocar nada), Firebase y un celular real.

## Código sin uso (hallado al medir M6 fase 2) y por qué M6 se detiene en el piloto
- Se midió el código para la fase 2 con un análisis estático: 1.143 nombres globales de nivel superior, 99 reasignados desde otros archivos (entre ellos `S`, que `persistencia.js` y `wrapped.js` reemplazan, y funciones parchadas como `html` y `nombreCuenta`). Pasar esos archivos a módulos ES cambia el significado de esas reasignaciones, y la ganancia principal (que una función inexistente falle al cargar) ya la da `npm run lint` en el CI. Por eso M6 se queda en el piloto (`fecha.js`) hasta que haya una razón concreta.
- Quitado por no tener ningún uso en la app: `pagoIdx`, `pagoDestino`, `PERSONA_COLORES_MIS_DEUDAS`, `getIngresosFijosMes`, `_calcPrestadoMeta` (su aviso «prestado de esta cajita» ya no existía en pantalla), `_textoRunway` (los tests ahora llaman `Reglas.textoRunway`) y `cobroRevertirTodos` (`eliminarIngresoFijo` hace lo mismo en línea, con el historial). Docs ajustados. El lint pasó de 33 a 26 avisos.

## M6 fase 1 (piloto): `fecha.js` pasa a módulo ES
- `js/core/fecha.js` exporta `Fecha` (`export const Fecha`) y se carga con `<script type="module">`; sigue en `window.Fecha` como «compat» para los scripts clásicos que lo leen por nombre (un módulo se ejecuta en el orden del documento junto con los `defer`, así que carga antes que `ingresos.js` igual que antes). Los módulos ES nuevos lo importan: `import { Fecha } from './fecha.js'`.
- Herramientas: `tests/support/load-app.js` quita el `export` al evaluar archivos migrados; los humos de jsdom (`scripts/jsdom-modulos.js`) sirven los módulos sin `import` como scripts clásicos, porque jsdom no ejecuta `type="module"`. Prueba nueva que fija el formato; `npm run navegador` (Chromium real) pasa con el módulo.
- Se midió qué más cabe en la fase 1: `umbrales.js` y `reglas.js` los lee también el script de notificaciones en Node con `require` (no se pueden pasar a ES sin tocar ese servidor), y `salud.js`, `periodo.js`, `nu-calc.js` y `html-tag.js` dependen de globales de otros archivos (`S`, `escHtml`, `mesKey`, `fuenteDeCuenta`…), así que migran con la fase 2 (estado), no antes.

## Despliegue: reintento cuando GitHub no lista el artefacto
- `deploy-pages` falló por tercera vez con «Found 0 artifact(s)» aunque el paso anterior sí subió `dist/`: es la demora de GitHub en listar el artefacto recién subido. Ahora el job espera 20 s antes de publicar y, si falla, espera 45 s y reintenta una vez en el mismo job (no vuelve a subir nada, así que no aparece el error de artefactos duplicados). Si fallan los dos intentos, el despliegue falla como antes.

## Avisos push con el evento nativo, sin el SDK de Firebase en el Service Worker (M4)
- `sw.js` ya no hace `importScripts` de Firebase desde gstatic ni repite la config: recibe el aviso con `addEventListener('push')`, lee el JSON de FCM (`data.title/body/link/icon`; también acepta `notification`) y muestra la notificación. Si la app está abierta y visible no muestra nada, igual que antes con el SDK. Si el aviso llega sin datos o con texto plano, muestra uno genérico (el navegador exige mostrar siempre uno).
- La CSP baja `worker-src` a `'self'`. La config de Firebase queda en dos archivos (`firebase-init.js`, `notificaciones-push.js`), vigilados por `tests/paridad.test.js`. El token FCM lo sigue pidiendo la página sobre este mismo service worker.
- Sin probar en un celular real: tests con un SW simulado. Prueba pendiente: activar avisos y recibir uno con la app cerrada.

## Limpieza de comentarios y docs que contaban historia (2026-11-21)
- `index.html`: se quitaron los bloques de comentario que narraban migraciones ("migrado a…", "retirado", "fusionados") y los de código ya sacado; quedó una nota corta sobre el orden de los `<script defer>`. Los `<script>` son exactamente los mismos.
- `js/`: se quitaron los comentarios sobre `import-validado.js` y otros archivos que ya no existen (`prestado-personas.js`, `deudores-personas.js`), la historia de Lighthouse en `lazy-loader.js` (queda la regla vigente) y las fechas entre paréntesis de unos 70 comentarios. El código no cambió.
- Docs: se quitaron versiones que se desactualizan solas (`mis-finanzas-v84` en `cierre-de-periodos.md`, que además decía esquema 9: ahora 12; «SW v112», «SW v150») y la nota de archivos fusionados de `prestado.md`. La historia vive solo en este CHANGELOG y en `docs/changelog/`.

## 2026-11-21 — El PIN se llama por lo que es: candado de pantalla (H5, opción A)
- Configuración: «PIN de acceso» pasa a «Candado de pantalla» y el texto dice que sirve para que nadie curiosee si toma tu teléfono y que no cifra los datos. Al crear el PIN: «Este PIN será el candado de pantalla de la app» (antes «protegerá el acceso»). Los botones «Activar / Cambiar / Quitar PIN» no cambian.
- `docs/configuracion.md` explica qué da y qué no da el PIN. Cifrado de extremo a extremo (opción B de la revisión) queda como decisión de producto pendiente: rompería las notificaciones del servidor.

## 2026-11-21 — Despliegue: redespliegue manual (`workflow_dispatch`)
- Un despliegue falló con «Found 0 artifact(s)» (el artefacto `github-pages` no apareció a tiempo) y al pulsar «Re-run failed jobs» falló con «Multiple artifacts named "github-pages"… Artifact count is 2»: la repetición queda en la misma ejecución y sube un segundo artefacto con el mismo nombre.
- Para reintentar sin ese problema: Actions → «CI y despliegue» → Run workflow (rama main), que crea una ejecución nueva, o un commit nuevo. El job `deploy` ahora también corre con `workflow_dispatch` (sigue exigiendo rama main y que `ci` pase).

## 2026-11-21 — Pruebas en navegador real (M14): `npm run navegador`
- `scripts/pruebas-navegador.js` abre la app en un Chromium de verdad (servidor local, sin red externa, estado sintético inyectado) y comprueba: (1) axe-core sin violaciones en 12 pantallas y 56 hojas; (2) las hojas son diálogos con nombre, el foco entra y vuelve, Tab/Shift+Tab no se escapan; (3) presupuesto de rendimiento con 5 años de datos (pintar la lista < 80 ms, < 4.000 nodos, hay «Mostrar más»); (4) cero errores de página.
- Los presupuestos son holgados a propósito (atrapan volver a pintar 7.000 filas, no un 20 % de ruido); `--lento` los triplica. Comprobado que falla de verdad: sin paginación da 281 ms y 123.175 nodos; sin `role="dialog"` falla en las 56 hojas.
- Nuevas dependencias de desarrollo: `playwright` y `axe-core`. El CI instala Chromium y corre la prueba. `subir.sh` también la corre (después de los humos, solo si cambió código de la app) e instala Chromium solo la primera vez; si no puede instalarlo (sin red) avisa y la omite, porque el CI la exige igual antes de desplegar.

## 2026-11-21 — Accesibilidad (H4): hojas como diálogos, foco y teclado
- Medido con axe-core en Chromium real: 12 pantallas y 56 hojas (sin contraste de color, que se deja para la reforma de estilos). Salieron 4 problemas: botones de editar/eliminar tarjeta sin nombre, dos casillas «Es saldo inicial» sin etiqueta, el área con scroll sin acceso por teclado, y el texto de carga fuera de una región. Todos corregidos; el resultado final es 0 violaciones.
- Hojas (`navegacion.js`): cada `.sheet` se declara `role="dialog"` + `aria-modal` y toma su nombre del `.sheet-title` (o de un `aria-label` propio, p. ej. el perfil de persona). Al abrir, el foco entra en la hoja si ningún campo lo tomó; al cerrar vuelve a quien lo tenía (no a un campo de texto, para no reabrir el teclado del celular). Se hace en código una vez, no en las ~150 hojas del HTML.
- Tab no se escapa de la hoja de arriba (`eventos-base.js`), salvo con el diálogo de confirmación abierto.
- Lo clicable que no es botón (`data-action` en div/span, `.action-card`) recibe `tabindex="0"` y, si no contiene otros interactivos, `role="button"`; Enter y Espacio lo activan. Un `MutationObserver` marca también lo que pintan los módulos después. Si no tiene texto (muestras de color) se le da un `aria-label`.
- `scripts/smoke-browser.js`: FASE 6 comprueba todo esto en la página real (diálogo, nombre, foco que entra y vuelve, teclado, elementos nuevos).

## 2026-11-20 — Lista de movimientos de una cuenta: paginación «Mostrar más» (H3)
- Medido en Chromium real con 5 años de datos sintéticos (3,1 MB, ~7.400 filas en una cuenta): pintar la lista tardaba ~300 ms en un PC y creaba ~123.000 nodos (≈ 17 por fila); en un celular serían varios segundos. Para comparar: serializar todo el estado al guardar cuesta ~8 ms y armar las filas (`getMovimientosCuenta`) ~10 ms: el costo estaba en el DOM, no en los datos.
- Ahora el detalle de una cuenta pinta 100 filas y un botón «Mostrar más (N restantes)» agrega otras 100. Cualquier cambio de filtro (búsqueda, tipo, fechas, limpiar) vuelve a la primera página. Resultado en la misma medición: ~7 ms y ~1.700 nodos.
- Solo aplica al detalle de una cuenta; la vista de cajitas de Nu sigue pintando todo (su refresco de filtros no repinta, y un botón así no funcionaría).
- Tests: `tests/movimientos-paginacion.test.js` (5).

## 2026-11-20 — Limpieza: código muerto y detalles
- Se borraron 4 funciones sin ningún llamador (el análisis estático y la búsqueda en js/, tests y index.html lo confirmaron): `spotifyCobradoDePersona`, `_misDeudasPickColor`, `renderMetaProgress` y `_rachaDeficitRelevante` (la regla vive en `Reglas.rachaDeficitRelevante`; la doc de Salud financiera se ajustó).
- Se quitó el chip «Mesada» del filtro de movimientos de una cuenta: filtraba por `tipo === 'mesada'`, un tipo que ningún movimiento tiene (los de Mesada son entradas), así que nunca aparecía.
- `manifest.webmanifest`: se agregaron `id`, `lang` y `description` (el `id` fija la identidad de la PWA aunque cambie la `start_url`).
- `scripts/notificaciones/package.json`: `engines.node >= 20.19`, igual que el proyecto.

## 2026-11-20 — Validador de forma del estado y dinero a centavos
- `js/core/validar-estado.js` (`validarEstado`, módulo puro): antes de escribir en la nube comprueba que las listas sean listas y que `monto`/`saldo`/`deuda` sean números finitos. Un NaN se guardaría como `null` sin avisar. Si hay un problema grave NO se escribe (la nube conserva el último estado bueno), el estado de sincronización pasa a error y se avisa una vez; los ids repetidos solo se dejan en consola (`window._validacionEstado`).
- Puerta única de saldos: todo monto que entra a un saldo o al libro se redondea a 2 decimales (`redondearCentavos`), también el saldo resultante. Evita residuos binarios (0,1 + 0,2) que se acumulaban contra el libro. Los pesos siguen en enteros.
- Tests: `tests/validar-estado.test.js` (8) y 1 en `tests/sesion-y-despliegue.test.js`.

## 2026-11-20 — Fusión de tres vías: dos dispositivos que cambian cosas distintas ya no se pisan
- Antes: si dos dispositivos o pestañas guardaban a la vez, ganaba el último y lo del otro se descartaba (quedaba solo una copia en Respaldos).
- Ahora `js/core/fusion.js` (`fusionarEstados(base, local, remoto)`, módulo puro) une los dos cambios cuando no tocan lo mismo. La base es el último estado de la nube que el dispositivo vio (`_lastSavedPayload`; `_baseAntesDeEscribir` si dos escribieron la misma revisión). Sin marcas de borrado ni horas por registro: lo que estaba en la base y falta en un lado se borró en ese lado.
- Reglas: objetos por clave; listas con `id` por registro (alta se conserva; baja sin tocar en el otro lado se borra; baja y editado se conserva lo editado); listas sin `id` como conjuntos; el monto de una entrada del libro que crece en el sitio (intereses) suma los dos aumentos; choque real sobre el mismo valor: gana el local.
- `Libro.recalcularSaldos(estado, base)` vuelve a dejar el saldo de cada cuenta igual a la suma del libro tras fusionar (solo donde la base ya cuadraba).
- Se usa en los tres caminos: guardado con la nube más nueva (`_resolverConflicto`), actualización en tiempo real con cambios sin guardar, y dos escrituras de la misma revisión. Tras fusionar se sube lo combinado. La copia en Respaldos (`conflicto`) se sigue guardando como seguro; si no hay base o falla la fusión, vale el comportamiento anterior (se carga la nube y lo local queda como copia).
- Corrección: el nombre de la función exportada es `fusionarEstados` porque `respaldos.js` ya exporta `fusionar` (dos importaciones con el mismo nombre habrían roto el módulo en el navegador); un test lo vigila.
- Tests: `tests/fusion.test.js` (18) y 3 de dos pestañas en `tests/sesion-y-despliegue.test.js`.

## 2026-11-20 — Dos pestañas ya no divergen en silencio (sync)
- Caso real: dos pestañas guardando a la vez terminaban con datos distintos, sin aviso y ambas en «Sincronizado»; luego la pestaña vieja, al guardar, reemplazaba los datos nuevos en la nube y en las demás.
- Causa probable: si la transacción de Firestore respondía «sin conexión» (también ocurre en línea, p. ej. en una pestaña secundaria), el guardado caía a `setDoc` sin comparar la revisión. Ahora primero lee la revisión directo del servidor (`getDocFromServer`) y compara; solo si de verdad no hay red se encola.
- El guardado usa la revisión sobre la que se serializó (no la de después de esperar): si llegó una versión nueva mientras tanto, el payload viejo no se escribe encima.
- El listener detecta dos escrituras con la misma revisión y distinta hora (otro escritor), aplica la de la nube y guarda copia de lo local como respaldo `conflicto`.
- Tests: 3 nuevos en `tests/sesion-y-despliegue.test.js`. Pendiente de confirmar en navegador real (ver LEEME).

## 2026-11-20 — Copia de conflicto recuperable, análisis estático, categorías escapadas, código muerto fuera

- **Copia del conflicto de sincronización (N1):** cuando otro dispositivo guarda antes, lo local descartado ahora se guarda como respaldo tipo `conflicto` en el almacén del equipo (IndexedDB, comprimido, sin el tope de ~5 MB de `localStorage`), y aparece en Configuración, en Respaldos, desde donde se restaura. Se conservan las 5 más recientes (`LIMITES.conflictos`). Último recurso: `localStorage` comprimido (`mf_conflicto`, ya legible con `_firebaseConflictoGuardado()`, que ahora es async). Antes la copia iba SIN comprimir a `localStorage`, nada en la app la leía, y en el camino de tiempo real el aviso estaba dentro del mismo `try` que el `setItem`: si fallaba por cupo no salía ni la copia ni el aviso. Ahora el aviso dice dónde quedó la copia o, si no se pudo guardar en ningún lado, lo dice claro. Cambios en `respaldos.js`, `firebase-sync.js`, `configuracion.js`; 5 tests nuevos en `tests/respaldos.test.js`.
- **`poblarCatSelect` (N2):** las categorías (texto libre) se pintan con `html```: con comillas el `value` se cortaba y el gasto se guardaba con otra categoría sin error. `tests/poblar-cat-select.test.js`.
- **Análisis estático (H1):** `scripts/lint-globales.js` + `eslint.config.js` (`npm run lint`; lo corre `npm test` vía `tests/lint-globales.test.js`, así que lo cubren `subir.sh` y el CI). Concatena los scripts clásicos en el orden de la página y busca nombres que no existen, duplicados y similares; cuenta como definido lo que algún archivo expone con `window.X = …`.
- **Código muerto con referencias rotas (H1):** fuera el registro `Reversibles` de tipo `'mesada'` y las dos ramas `'mesada'` de `eliminarMovimiento` (ningún movimiento se guarda con ese tipo; el de Mesada es una `entrada` y su protección vive en `mesada.js`), y `setNombre` de `diferencial.js` (llamaba a una función inexistente).

## 2026-11-19 — Despliegue por GitHub Actions, sello del Service Worker en el despliegue, reglas de Firestore en el repo

- **Despliegue:** `.github/workflows/ci.yml` corre tests, los tres humos y `generar-mapa.js --check`; en push a `main`, si pasó, el job `deploy` arma `dist/` (`scripts/preparar-despliegue.js` = `npm run build`: solo `index.html`, manifest, `css/`, `js/`, `icons/` y `sw.js`) y lo publica en Pages. Con tests rojos no se publica. Requiere Settings → Pages → Source = «GitHub Actions». Reemplaza `test.yml` y `mapa-codigo.yml`.
- **Service Worker:** ya no hay `VERSION` a mano ni sello en el repo. `sw.js` queda con `BUILD = 'dev'` y `PRECACHE = []`; el despliegue los escribe en `dist/sw.js`. Caché: `mis-finanzas-v-<BUILD>`. `subir.sh` ya no sella (se quitó `npm run sellar` / `sellar:check`; se usa `npm run build`). Los tests de `sw` ejercitan el `sw.js` ya construido.
- **`uid()`:** garantiza ids distintos dentro del mismo milisegundo (el sufijo avanza desde un punto al azar); mismo formato de 11 caracteres, que lee `diaCreacionMovimiento`. `tests/ids.test.js`.
- **Reglas de Firestore:** `firestore.rules` + `firebase.json` (forma de cada documento y tope de payload; acceso = solo el dueño). Despliegue manual: `npx firebase-tools deploy --only firestore:rules`. Sin probar en emulador.
- **Proceso:** `.nvmrc` (22), `engines` `>=20.19`, `subir.sh` con `npm ci`, lockfile para `scripts/notificaciones` y `npm ci` en su workflow.

## Mesada: aviso del mes, X y «Cancelar» en las hojas, confirmar al borrar (2026-11-19)

Prototipos: `MesadaRegistrar`, `MesadaRegistrarParcial`, `MesadaMesPagado` y `MovilMesadaRegistrar` (`mesada_ac27e3.zip`). Donde el prototipo y la app difieren se dejó la app, salvo lo de esta lista.

- **Aviso «Cubre …»** (hoja «Registrar pago»): ya no aparecía cuando la fecha cae en el mes que se paga (`mesadaAvisoMesPago` devuelve `''` en ese caso; es lo que cubren los tests); solo salía cuando los meses difieren, que es lo que se pidió. Lo que confundía era el texto: decía «este mes» (¿cuál?) y «el mes en que te la pagan». Ahora: «Corresponde a Feb 2026, pero se cuenta como ingreso de Nov 2026, el mes de la fecha de pago.» (siempre con el nombre del mes).
- **X y «Cancelar»** (convención en `docs/guia-estilo-sheets.md` §2 ter; hoy solo las hojas de Mesada): formularios: celular igual que antes; PC con X arriba a la derecha y «Cancelar» junto a «Guardar», sin ocupar todo el ancho (`.sheet-x`, `.sheet-acciones`). Detalle de un mes (solo informa): celular «Cerrar» en vez de «Cancelar»; PC sin botón de abajo, se cierra con X, Esc o tocando fuera. **Esc** es nuevo (`js/core/eventos-base.js`): cierra la hoja de arriba si trae X y no actúa con un diálogo abierto. Tocar fuera ya cerraba.
- **Borrar este registro** pide confirmación («Borrar registro», con el padre y el mes, y avisa si se resta de una cuenta o encargo). Si el pago es «viejo», la confirmación de antigüedad ya cuenta y no se pregunta dos veces. Test nuevo: si se rechaza, no se borra.
- **Detalle de un mes:** las líneas entre filas (Monto / Fecha / Destino) ahora son un gris un poco más oscuro que el fondo del bloque (`var(--bg2)` sobre `var(--bg3)`); antes eran casi del mismo tono (`var(--border)`) y no se veían. Con `var(--bg)` quedaban demasiado negras y se descartó.
- **Caja «Te está debiendo …»:** borde y esquinas como el prototipo (radio 12, relleno 12 × 14) y la casilla con borde ámbar (antes la casilla nativa gris): casilla propia de 18 px, ámbar al marcarla, con la palanca de foco visible.
- **Sin barra de arrastre en PC** (todas las hojas, no solo las de Mesada): `.sheet-handle` se oculta a partir de 900 px y la hoja gana 22 px de relleno arriba. La barra es para arrastrar con el dedo; en PC la hoja es un modal centrado que se cierra con X, Esc, tocando fuera o «Cancelar».
- **Pruebas:** `tests/mesada.test.js` (textos del aviso, borrar con confirmación aceptada y rechazada).
- **Sin ver en navegador real.** Revisar: X de las tres hojas a 1366 px, «Cancelar | Guardar» en fila, «Cerrar» en celular, Esc, líneas del detalle y casilla ámbar.
- **Pendiente de decidir:** el módulo de ingresos fijos (`cobros.js`) tiene un aviso con el mismo texto viejo («Cubre … pero cuenta como ingreso de este mes»). No se tocó por no ser de Mesada.

## Mesada: meses en 4 columnas y resumen de la tarjeta más corto (2026-11-19)

Según el prototipo nuevo (`mesada_1.zip`: `Mesada.dc.html` y `MovilMesada.dc.html`):

- **Meses en 4 columnas** (12 meses = 3 filas, sin hueco), en PC y celular. Celular: hueco de 7 px y casilla de 56 px de alto; PC: hueco de 8 px y 62 px. El texto bajo el mes no se corta ni desborda la casilla (puntos suspensivos), porque en pantallas angostas «debe $75.000» ya no cabía entero.
- **Resumen bajo el nombre:** queda solo «$1.410.000 recibidos (10/12)». Se quitaron « · $75.000 pendiente» y « · 1 sin pagar»: lo pendiente ya está en el cuadro «Pendiente» y cada casilla dice «debe …» o «sin pagar».
- **Cabecera de la tarjeta:** en celular el avatar y el texto se alinean arriba y hay 14 px antes de los meses; en PC siguen centrados. «Cuota 2026» sigue encima del campo (el prototipo nuevo también lo pone así); campo de 92 px.

## Menú lateral: icono de Spotify (2026-11-19)

El icono de Spotify del menú lateral (`#lateral-spotify`) pasó de la nota musical al logo de Spotify, **de contorno, sin relleno**, igual que los demás iconos del menú: círculo de radio 10 y tres ondas, viewBox 24, `stroke="currentColor"`, `stroke-width="1.7"`, extremos redondeados (los atributos los hereda del `<svg>`, como los otros). Se descartaron dos intentos: el SVG de icons8 (anillo fino y ondas pequeñas, borroso a 17 px) y un disco sólido con las ondas recortadas (se veía bien pero pesaba más que los iconos de línea). Con tres ondas dentro de un círculo de 17 px, a 1× las ondas se juntan un poco; a 2× (pantallas retina) se ven separadas. El menú lateral muestra los iconos a 17 × 17 px (`.menu-lateral-icono`, `css/pc.css`). Solo cambia el menú lateral de PC; el botón «Más» del celular tiene su propio icono de Spotify (20 × 20, viewBox 64) y no se tocó. Para volver a la nota musical: `<path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />`.

## Versión PC y celular, parte 20: Mesada como el prototipo (2026-11-19, SW v159)

Prototipos de referencia: `Mesada.dc.html` (PC), `MesadaMesPendiente.dc.html` (detalle de un mes) y `MovilMesada.dc.html` (celular). Los años, montos y nombres del prototipo son de ejemplo; la app usa los suyos.

- **Celular:** arriba, el título «Mesada de papás» (22 px) con el selector de año (‹ 2026 ›) en la misma fila, como `MovilMesada` (antes: un título pequeño en mayúsculas y una fila de flechas de 48 px aparte). Resumen con tinte (los valores también van en su color: verde, azul y ámbar): «Recibido este año» (verde) y «Meses pagados» (azul) lado a lado, y debajo «Pendiente» (ámbar, con etiqueta y el texto «Papá te debe …»). Tarjetas de Papá y Mamá apiladas: avatar redondo de 38 px, nombre, resumen, «CUOTA 2026» **encima del campo** de la cuota a la derecha (como en la versión anterior de la app; el prototipo la pone en línea, pero se prefirió conservarlo) y los meses en **3 columnas con el monto debajo** (antes eran puntos de 6 columnas sin monto; el monto, «debe …» y «sin pagar» solo se veían en PC).
- **PC:** el título (ya estaba) y ahora **la tira de años van en la cabecera**, junto al buscador, y la tira solo se ve con Mesada abierta (`.app:has(#screen-mesada.active)`, sin JS). La cuota sigue con «Cuota 2026» encima del campo, a la derecha del nombre; las cajas de Papá y Mamá tienen el relleno del prototipo (18 × 20) y los tres cuadros de resumen llevan los mismos tintes. Entre 900 y 1279 px la tira es más compacta y el buscador se angosta mientras Mesada está abierta, para que la cabecera no se desborde.
- **Detalle de un mes** (hoja `sheet-mesada-det`, PC y celular): los datos (monto, fecha, destino) van en un bloque con divisores entre filas; «Cuota esperada / Pendiente / Registrar pago de lo pendiente» en una caja ámbar con borde completo (antes, borde izquierdo grueso); botones de 44 px.
- **HTML/JS:** `#ms-pendiente-banner` deja de ser una `attn-card` (esa clase fuerza fondo y borde con `!important` y no se podía teñir como el prototipo): ahora es `.mesada-pendiente` con la etiqueta «Pendiente» y el texto en `#ms-pendiente-texto` (lo pinta `renderMesada`). `#anio-tira` pasó del `<div id="mesadaSection">` a la cabecera. El test «pantalla principal» lee el texto de `#ms-pendiente-texto`.
- **CSS:** la regla base de `.mes-dot` estaba duplicada en tres sitios (la última pisaba a las otras con `aspect-ratio:1`, 10 px y `min-height:36px`); queda una sola. Las cuadrículas, avatares y tintes usan `color-mix` con las variables de `:root` (se fueron 2 colores hex). Se quitaron `.ms-sec-top`, `.ms-mb9`, `.ms-mb10` y `.ms-banner`; las clases nuevas llevan prefijo `mesada-` (no `ms-`, que el trinquete cuenta como abreviatura). Trinquete actualizado (`node scripts/convenciones-css.js --actualizar`).
- **Se quitó una regla que no hacía nada:** en 900–1279 px había `#mesadaSection > .card:not(.ms-banner){grid-column:span 5}` con el comentario «Papá y Mamá una debajo de la otra»; span 5 de 10 columnas es lo mismo que en PC completo, así que siempre se vieron lado a lado. Se dejó el comportamiento real (lado a lado) y se corrigió `docs/version-pc.md`.
- **Se conserva** «Vincular persona» / «Quitar» (el prototipo no los muestra): quedan como enlace discreto bajo el resumen de cada padre.
- **Sin ver en navegador real** (jsdom no dibuja). Revisar a mano a 1366×768, 1100, 800, 430 y 360 px: tarjetas con cuota en línea (PC), casillas de 3 columnas en celular, tinte del resumen, cabecera a 900 px, hoja de detalle de un mes pendiente.
- **Pruebas:** `tests/mesada.test.js` (el banner se lee en `#ms-pendiente-texto`); trinquete de CSS actualizado. `sw.js` sin tocar: al desplegar, `bash subir.sh` sube `VERSION` y lo sella.

## Mesada: vínculo opcional con una persona (2026-11-19, SW v158)

- Papá y Mamá siguen siendo dos casillas fijas, pero cada una tiene un botón «Vincular persona» (y «Quitar»). Si se usa, guarda `S.mesadas.papa|mama.personaId` y la persona muestra «Mesada · Papá/Mamá» en su perfil (relación `mesada`, `unica`), no se puede eliminar y la misma persona no puede ser papá y mamá a la vez. Quien no usa la mesada no tiene que crear nada.

## Diferencial: el margen se lo lleva una persona (2026-11-19, SW v157)

- Cada parte del reparto del diferencial guarda `personaId` en vez de un nombre escrito a mano. En el formulario, la casilla de texto pasó a un botón «Elegir persona» que abre el selector compartido; cada parte con plata debe tener persona («Elige a quién se lleva cada parte»).
- El historial, el detalle del movimiento y los textos de intercambio leen `Personas.nombre(personaId)`: si renombrás a la persona, cambia en todas partes.
- Nueva relación `margenes` en el núcleo: el perfil de la persona muestra «Margen $X», no se puede eliminar (se archiva) y `Personas.verificar` revisa I1/I2 también ahí. No entra en la posición neta.
- La mesada no cambia: sus padres son categorías fijas.

## Wrapped: Spotify mostraba «undefined personas» (2026-11-19, SW v156)

- Al renombrar `personas` → `integrantes` en la fase 3, `_wrappedSuscripciones` siguió devolviendo `{ personas }` mientras el texto leía `.integrantes`: la tarjeta de suscripciones decía «entre undefined personas». Ahora devuelve `integrantes`. Prueba de guarda en `personas-core.test.js`.

## Personas: se quita «Fusionar» (2026-11-19, SW v155)

- Se eliminó la opción «Fusionar con otra persona…» (`Personas.fusionar`, `puedeFusionar`, `alFusionar` de cada relación, `_unirDeudas`, `_repuntarIds`, `_prestadoSoltarSeleccion` y sus pruebas). Nació de pensar que los módulos creaban personas duplicadas, algo que ya no ocurre: toda persona se crea con «Nueva persona» y los módulos solo la eligen. Un duplicado hoy sería un error del usuario, que lo resuelve con Eliminar (si no tiene relaciones) o Archivar.
- Se mantienen Archivar, Restaurar y Eliminar solo sin relaciones.

## Personas: texto del estado vacío (2026-11-19, SW v154)

- El estado vacío de Personas decía que las personas «se crean automáticamente cuando agregas un deudor o encargo». Era del modelo viejo: hoy toda persona se crea con «Nueva persona» (en Personas o desde el selector) y los módulos solo la eligen. Ahora el texto lo explica así.

## Personas: alias y notas, fase 5 (2026-11-18, SW v153)

- **`alias` y `notas` ya se escriben:** la hoja «Editar persona» tiene los campos «Apodo o alias» y «Notas» (opcionales; vacío los quita) y `Personas.editar` los acepta. El perfil los muestra arriba, el selector de personas también busca por alias y la búsqueda global ya los leía. Sirven para distinguir homónimos.
- **Decisión:** las partes del diferencial y los padres de la Mesada se quedan como texto libre (la recomendación del plan): no son personas a las que se les presta ni deben plata, y obligar a crear una persona por cada invitado de un gasto compartido añade más fricción que valor. Si algún día se quiere, `Personas.registrarRelacion` ya permite añadirlos sin tocar el núcleo.

## Personas: ciclo de vida, fase 4 (2026-11-18, SW v152)

- **Archivar y restaurar personas** (`Personas.archivar/restaurar`, campo `archivada`). Una archivada no sale en la lista (hay un enlace «Ver archivadas (n)»), ni en los selectores, ni en la búsqueda global; sus préstamos, encargos y movimientos no cambian. Su nombre se puede reutilizar (I3 pasa a valer solo entre las no archivadas) y restaurar avisa si otra persona lo tomó.
- **Eliminar solo sin relaciones** (`Personas.eliminar`, invariante I5): con préstamos, encargos o Spotify (aunque estén en cero) se rechaza con `tiene-relaciones` y el botón ni aparece; con historial se archiva.
- **Fusionar personas** (`Personas.fusionar/puedeFusionar`): lo del origen pasa al destino y el origen desaparece; queda el nombre y el color del destino. Cada relación declara qué hacer si las dos personas ya la tienen (`alFusionar`): dos «me deben» o dos «yo debo» se **unen** (suman movimientos y grupos y todas las referencias a la deuda que desaparece —`deudorId`, `_deudorId`, `miDeudaId`, `_deudaId`, destinos de Plata comprometida, compras de tarjeta— pasan a la que queda; el total pendiente no cambia); dos integrantes de Spotify **bloquean** la fusión antes de tocar nada. Un módulo nuevo sin `alFusionar` también bloquea.
- **Pantalla Personas:** el final del perfil trae Fusionar con otra persona…, Archivar/Restaurar y Eliminar (solo sin relaciones), cada uno con su confirmación. `prestado.js` suelta la deuda abierta tras una fusión (`_prestadoSoltarSeleccion`).
- **Dos lectores que se me escaparon en la fase 3** (`tarjetas-credito.js` y `encargos.js` leían `(Deudas.porId(...)||{}).nombre`, que ya no existe y mostraba vacío): corregidos, y un test nuevo busca ese patrón en `js/core` y `js/modules` para que no vuelva.
- **Pruebas:** `personas-core.test.js` cubre archivar/restaurar/eliminar, fusión (reasignar, unir deudas con sus referencias y total intacto, bloqueo por Spotify, destino archivado, un módulo nuevo con `alFusionar`) y los botones del perfil. Con el CSS real en el proyecto pasa la suite completa.

## Personas: una sola fuente de nombre y color, fase 3 (2026-11-18, SW v151)

- **Los módulos ya no guardan `nombre` ni `color` de la persona.** `S.deudores`, `S.misDeudas`, `S.encargos` y `S.spotify.integrantes` guardan solo `personaId`; todo lo que se muestra sale de `Personas.nombre(id)` / `Personas.color(id)` (Préstamos, Encargos, Spotify, Inicio, Cuentas, Alcancía, Actividad reciente, Mesada, Plata comprometida, Wrapped y búsqueda global). Renombrar a alguien cambia todos los módulos sin código de sincronización.
- **Editar el nombre desde Préstamos/Yo debo o desde un encargo** pasa por `Personas.editar` (rechaza el nombre de otra persona antes de tocar nada) en vez de escribir en el registro y en la persona.
- **Desaparecen los resolvedores duplicados:** `spotifyNombreDe`, `_wrappedNombrePersona`, `getPersona`, `getPersonaNombre`, `getPersonaColor`. `reglas.js` conserva `nombrePersona(S, id)`, función pura sobre `S`, porque también corre en Node (notificaciones push) sin el núcleo de la app. `getPersonaDatos` pasó a ser `_datosPersona`, ayudante local de `personas.js`.
- **Ramas «sin personaId» eliminadas:** auto-vincular deudas al abrir el perfil o editar, chip «Ver perfil» condicional, aviso «encargo sin persona», agrupación del Wrapped por nombre crudo y emparejamiento legado por nombre del historial de Spotify (ahora solo `spotifyId`). Agregar un integrante de Spotify exige elegir o crear una persona.
- **Renombres:** `S.spotify.personas` → `S.spotify.integrantes` (evita confundirlo con `S.personas`); en Plata comprometida, `destino.personaId` → `destino.deudorId` (guardaba el id de un deudor, no de una persona).
- **Invariante I2 definitiva:** `Personas.verificar` reporta `copia-guardada` si un registro de una relación vuelve a guardar `nombre` o `color`. Se quitó la bandera `copia` del registro de relaciones. El `nombre` de `spotify.historial` sigue siendo una foto del momento, a propósito.
- **Pruebas:** fixtures (`datos-sinteticos.js`, `finanzas.test.js`, `mesada.test.js`, `personas-core.test.js`) y `scripts/smoke-browser.js` ahora siembran personas en vez de copias; el test de renombrado comprueba que ningún registro guarda copia.

## Personas: núcleo único, fases 1 y 2 (2026-11-18, SW v150)

Fases 1 y 2 del plan [`personas-modelo-unico.md`](personas-modelo-unico.md) (queda ahí lo pendiente). **Sin migración de datos** (esquema sigue en 12): la app no tiene datos que conservar.

- **`Personas` en el núcleo** (`js/core/personas-core.js`, carga justo después de `estado.js`): lectura (`obtener`, `nombre`, `color`, `lista`, `buscarPorNombre`), `crear` sin duplicados, `editar` que deja iguales las copias de nombre y color, `verificar` (invariantes I1–I4) y `huerfanos`. Las cuatro relaciones (me deben, encargos, Spotify, yo debo) se declaran ahí con `registrarRelacion`, con su colección, si es única por persona, su `saldo`, su `resumen` y su `pantalla`. Está en el núcleo y no en el módulo lazy para que lista, perfil e integridad funcionen aunque el módulo no haya cargado. Un módulo puede volver a registrar su `id` y se mezcla con lo declarado.
- **`Personas.relaciones(id)`, `registros(id, relación)` y `posicionNeta(id)`.** La posición neta es *me debe − le debo*; el saldo de un encargo **no** entra (es plata suya que solo administras, mismo criterio de Préstamos e Inicio que ya documentaba la lista).
- **`encargoSaldo`, `encargoComprometido` y `encargoLibre`** pasan de `encargos.js` (lazy) a `calc-helpers.js` (núcleo): Personas calculaba el saldo de los encargos sin guard desde un módulo que podía no haber cargado.
- **La lista de Personas ya no omite gente.** Antes no listaba encargos ni integrantes de Spotify sin `personaId`, ni deudores cuyo `personaId` apuntaba a una persona borrada, y mostraba aparte los deudores «sin perfil». Ahora hay una fila por persona, y su texto (celular y PC), sus etiquetas y su saldo neto salen de las relaciones. Se borraron los dos bloques «sin perfil» y la acción `prestado-personas:abrirPerfilMiDeuda`, que solo usaban ellos. Una persona solo en Spotify ahora dice «Spotify» en celular en vez de «Sin actividad».
- **El perfil recorre las relaciones** (`_PERFIL_SECCIONES`): una sección por relación viva; una relación nueva sin sección propia sale con `_perfilSeccionGenerica` (etiqueta, registros, saldo y «ver módulo») sin tocar `personas.js`. Si la persona tiene más de una relación con saldo (por ejemplo «me deben» y «yo debo»), arriba aparece su **saldo neto**, que antes no se veía en ningún lado.
- **Spotify en el perfil** cuenta los cobros por `spotifyId` (el nombre solo para historial sin ese campo); antes comparaba por nombre y un renombre dejaba el total en cero.
- **Búsqueda global: una entrada por persona**, con sus relaciones («Préstamo · Encargo · Spotify · Le debo») y abre su perfil. Se quitaron las entradas por nombre de Préstamos, Yo debo y Spotify (eran el nombre copiado de la persona). Los movimientos y notas se siguen encontrando; el encargo se busca por su nota. De paso, la búsqueda de encargos mostraba siempre $0 (leía un campo `saldo` que no existe): ahora usa `encargoSaldo`.
- **Nombres repetidos.** «Nueva persona» ya no crea otra con el mismo nombre (desde un selector usa la existente, con aviso; desde la lista avisa) y «Editar persona» rechaza el nombre de otra persona.
- **Editar una persona** ya no recorre cuatro colecciones a mano: `Personas.editar` lo hace sobre las relaciones declaradas, así que un módulo nuevo no puede quedar desincronizado por olvido. Se quitó también la sincronización de color de «yo debo» que hacía `load()`.
- **`save()`** avisa una vez por sesión en consola si `Personas.verificar()` encuentra violaciones (`window._personasViolaciones`).
- **Pruebas:** `tests/personas-core.test.js` (lectura, crear, editar, cada invariante, relaciones nuevas y mezcla de registros, posición neta, lista, perfil, sección genérica, búsqueda y cableado). `tests/support/nucleo-estado.js` incluye el archivo nuevo en el orden de carga.
- **Pendiente de despliegue:** `BUILD` de `sw.js` no se pudo resellar (el adjunto no traía `css/` ni `icons/`); `PRECACHE` ya incluye el archivo nuevo y `VERSION` subió a v150. Correr `npm run sellar` antes de publicar. Tampoco se miró en el navegador con CSS reales (en especial el bloque «Saldo neto» del perfil, que reutiliza clases existentes).

---

## Correcciones de la revisión con escenarios de prueba (2026-11-15, SW v136)

- **Origen.** Se importaron 68 respaldos de prueba que dejan Inicio y Análisis en cada estado posible, se comprobó cada uno contra la app real (Chromium sin Firebase) y salieron tres problemas reales y uno de despliegue. Los escenarios y su generador viven fuera del repo (`escenarios-inicio.zip`); la lista completa de posibles mejoras que dejó la revisión está en `MEJORAS-APP.md`.
- **Aviso falso «Otro dispositivo guardó antes que tú» tras importar o restaurar.** *Causa (probable, sin confirmar en la app real):* `_reemplazarDatos` guarda y recarga; en esa recarga el `beforeunload` de la página vieja escribía `rev: _revNube + 1` con `setDoc` sin actualizar `_revNube`, y el guardado de arranque de la página nueva (`_checkCierreMes` marca el mes visto y guarda) chocaba con esa escritura: un conflicto contra sí misma, sin ningún otro dispositivo. *Arreglo:* `configuracion.js` marca `window._recargandoPorImport = true` y `_locallyModified = false` cuando el guardado forzado se confirmó; `utilidades-ui.js` sale del `beforeunload` si esa marca está puesta. Si el aviso persiste, mirar `window._revNube` y `localStorage.mf_conflicto` antes de seguir.
- **«¿Y si…?» (Análisis) no mostraba el punto de partida.** Con «gastara −20%» decía «Balance mensual típico: +$100.000 (+$600.000 frente a hoy)» sin decir cuál era el balance de hoy (−$500.000), y parecía que hoy fuera más alto que el simulado. Los números eran correctos; el texto no. Ahora, con algún deslizador movido, muestra el antes y el después («hoy −$500.000 → +$100.000 (+$600.000 al mes)» y «reservas: hoy 2,3 → 2,9 meses»); con todos en 0 solo dice la situación de hoy. Solo cambia `renderSimulador` (`analisis.js`); `Salud.simular` no se tocó. Que «frente a hoy» salga siempre a favor es correcto: los deslizadores solo permiten gastar menos, ingresar más o pagar deuda.
- **`sellar-sw.js` ignora los `.zip`.** Un `js/js.zip` dentro de `js/` (armado para compartir el código) entró al `PRECACHE`, dio 404 en GitHub Pages y, por ser el precaché atómico (`cache.addAll`), la versión nueva del Service Worker no se instalaba y nadie recibía «Actualizar». Ahora cualquier `*.zip` queda fuera de la lista y de la huella (con o sin zip el `BUILD` es el mismo).
- **Se corrigieron los datos de prueba, no la app:** en «¿Por qué cambió tu patrimonio?» salía «subió $0 … quedan $1.000.000 sin explicar» porque el historial de patrimonio sintético no coincidía con los ingresos y gastos del mismo escenario; la tarjeta hacía lo correcto (avisar de datos que no cuadran). Los escenarios ahora traen historial coherente y movimientos en el mes en curso.
- **Pendiente, anotado en `MEJORAS-APP.md` (no es bug de datos):** «subió $0» debería decir «se mantuvo» (`renderConciliacion`); «Comparación con el mes anterior» compara un mes en curso vacío contra un mes completo («100% menos por ahora»); Salud no lee los cierres mensuales (puede decir «Excelente» junto a «3 meses bajando»); el umbral de «sin explicar» ($30.000) no escala con el patrimonio.
- **Al desplegar:** subir `VERSION` a `mis-finanzas-v136`, correr `node scripts/sellar-sw.js` (cambian `analisis.js`, `configuracion.js` y `utilidades-ui.js`, así que el `BUILD` cambia) y `npm test`. Probar a mano: importar un respaldo y comprobar que tras recargar no sale el aviso de conflicto; Análisis → «¿Y si…?» moviendo «Gastara menos».

## Quitado el «Plan de salida de deudas» de Inicio (2026-11-17, SW v149)

Pedido de Sebas. Se eliminó la tarjeta y todo lo que solo existía para ella:

- **Inicio:** `<div id="plan-deudas-card">` (index.html), `renderPlanDeudas`, `planDeudasDatos`, `_balancePromedioReciente`, su `Refresh.registrar('inicio-plan-deudas')` y la acción `inicio:planEstrategia` (inicio.js); el id en la columna principal de `disposicion-pc.js` y sus reglas en `pc.css`; todas las clases `.inicio-plan*` de `styles.css`.
- **Estado y umbrales:** `S.planDeudasEstrategia` (también su clasificación en `cierre.js`) y `UMBRALES.deudas.metaMeses`.
- **Cálculo:** de `plan-deudas.js` salen `ordenar`, `construir`, `pagarConviene` y `pagoPosible`; también `mejorTasaAhorro()` de `nu-calc.js`, que solo usaba la tarjeta (comparar lo que rinde la cajita con lo que cuesta la deuda).
- **Pruebas:** se borran las pruebas de esas funciones y de la tarjeta (finanzas.test.js) y las dos aserciones de `mejorTasaAhorro` (cuentas.test.js).
- **Se conserva lo que se usa en otras partes:** `_deudasPropias` (inicio.js) y `PlanDeudas.tasaMensual` / `costoMensual` (`plan-deudas.js`), que Análisis usa para `m.costoDeuda` y de ahí Salud (ahorro de intereses); la tasa E.A. de tarjetas, personas y cuentas de ahorro; `calcLiquidez` y `Periodo.gastoPromedioPrevio`. El archivo y el global siguen llamándose `plan-deudas.js` / `PlanDeudas`.
- Documentación actualizada (version-pc.md, CONTINUAR.md, salud-financiera.md, analisis-financiero.md, tests/README.md). Las entradas históricas del CHANGELOG no se tocan.
- Al desplegar: `bash subir.sh`. Los datos guardados que traigan `planDeudasEstrategia` simplemente la ignoran.

## Versión PC, parte 19: años de Mesada y «Registrar gasto» fijo en Gastos (2026-11-17, SW v148)

- **Mesada:** el selector de año ‹ 2026 › (botones de 48 px) se reemplaza en PC por la tira de los 5 años del prototipo (`#anio-tira`, la pinta `renderMesada`; el año elegido resaltado en acento; tocar uno llama a `cambiarAnio` con la diferencia). Son los mismos 5 años que permite `cambiarAnio` (actual ±2). En celular sigue el selector de siempre.
- **Gastos:** el botón «Registrar gasto» (`#btn-gasto-var-arriba`, abre `abrirNuevoGastoVar`) va ahora en la misma fila que el filtro de meses (`.gastos-filtros`) y esa fila queda fija arriba de la lista (sticky): ya no hay que bajar hasta el final para registrar un gasto. En PC se esconde el botón de abajo. En celular todo igual.
- **Smoke:** FASE 5 comprueba la tira de años y el botón de arriba.

## Versión PC, parte 18: Mesada, Gastos y scroll por dentro (2026-11-17, SW v147)

Según el prototipo (copia subida como `…Prototipo_45daba.html`). Corrige la parte 17.

- **Scroll por dentro (como el prototipo):** las pantallas de columnas ya no crecen: ocupan exactamente el alto de la ventana (`height:100%`, antes `min-height:100%`) y cada caja hace scroll por su cuenta, con la barra oculta (Gastos, Prestado, Personas, Spotify, Encargos, Alcancía, Cuentas, Tarjetas; ver el bloque «scroll interno» de `pc.css`). Entre 900 y 1279 px, donde las columnas se apilan (Gastos, Spotify, Alcancía, Cuentas), la página vuelve a fluir y a hacer scroll.
- **Gastos:** el resumen (3 tarjetas) queda solo sobre la columna de variables, el riel de fijos mensuales ocupa toda la altura a su lado (también arriba, junto al resumen), y la lista de variables y los fijos hacen scroll dentro de su caja.
- **Mesada:** las cajas de Papá y Mamá vuelven a ser del alto de su contenido (en el prototipo no se estiran); resumen en una fila (con pendiente: tres cuadros; sin pendiente: dos mitades; `data-pendiente` de `#mesadaSection` lo pone `mesada.js`), Papá | Mamá lado a lado, meses en 3 columnas. Celular sin cambios.

## Versión PC, parte 17: menú sin scroll, Prestado en una caja, Mesada, Tarjetas, cajas a todo el alto y perfil de persona como pantalla (2026-11-17, SW v146)

Según el prototipo (copia subida como `…Prototipo_9e3bfe.html`).

- **Menú lateral sin scroll:** `.menu-lateral-nav` ya no hace scroll; ítems y títulos de grupo más compactos para que quepa en 768 px de alto.
- **Prestado (HTML reorganizado):** nuevo `#prestamos-columna` envuelve las pestañas y las dos listas (`deudoresView`, `misDeudasView`); los detalles (`deudorDetalle`, `miDeudaDetalle`) quedan después, fuera de la columna. En PC la columna es UNA caja (400 px; 320 entre 900 y 1279) con las pestañas Me deben / Yo debo adentro (mitades iguales, ya no se salen ni se estiran), el título de la lista a la izquierda y el botón de agregar a la derecha, y el detalle al lado. En celular el envoltorio no tiene estilos: todo igual.
- **Cajas a todo el alto:** en PC las pantallas con columnas (Prestado, Personas, Gastos, Cuentas, Spotify, Encargos, Alcancía, Mesada, Tarjetas) ocupan el alto de la ventana y las cajas llegan hasta abajo aunque tengan poco contenido (`min-height:100%` + `align-items:stretch`). Gastos pasa de flex a cuadrícula (variables | fijos).
- **Mesada:** año arriba a la izquierda, fila de resumen (recibido, meses pagados y pendiente si hay) y Papá | Mamá a todo el alto con los meses en cuadrícula de 3 columnas; cada casilla lleva una segunda línea (monto, «debe $X» o «sin pagar», clase `mesada-mes-detalle`, solo PC). Corrige el reparto anterior, que dejaba a Mamá a todo el ancho.
- **Tarjetas de crédito:** resumen arriba (Deuda total en TC y Cupo total con «N tarjetas»; nueva tarjeta `tc-cupo-card`) y debajo la lista de tarjetas (420 px) | panel «Compras y pagos · {tarjeta}» (`#tc-detalle`). La primera tarjeta queda elegida; tocarla (o «Ver») cambia el panel; `abrirDetalleTCSheet` pinta en el panel en PC y abre la hoja en celular. El panel reutiliza el contenido de la hoja (filas de la app): no se copiaron los chips Todo / Compras / Pagos ni la tabla del prototipo.
- **Perfil de persona en celular = pantalla** (antes hoja): se usa la misma ficha (`personas-ficha`) a pantalla completa con el botón «Personas» para volver (`personas:cerrarFicha`); la lista y el botón de Configuración se esconden mientras tanto. La hoja `sheet-perfil-persona` ya no se abre (queda inyectada sin uso: borrar en una limpieza).
- **Smoke:** FASE 5 comprueba la ficha en celular y el panel de Tarjetas en PC.

## Versión PC, parte 16: botones de Personas (2026-11-17, SW v145)

- «Nueva persona» toma el estilo del prototipo (clase `personas-boton-nueva`, reemplaza `ix-button-155`): caja neutra de borde fino; en PC, transparente con borde de 1,5 px.
- Celular: botón «Configuración» arriba de Personas (acción `personas:volverConfiguracion` → `showScreen('config')`; oculto en PC, que tiene el menú lateral).

## Versión PC, parte 15: Personas con una persona abierta (2026-11-17, SW v145)

- Según el prototipo actualizado (copia subida como `…Prototipo_1.html`): al abrir una persona el resumen y las tarjetas ya no desaparecen; quedan en la columna izquierda (resumen arriba, tarjetas en 2 columnas) y la ficha a la derecha, a toda la altura. Solo el estado sin personas oculta el resumen. Reemplaza lo dicho en la parte 13 («el resumen se oculta»).

## Versión PC, parte 14: pestañas de Prestado dentro de la caja, marca del menú y título por sección (2026-11-17, SW v145)

- **Prestado:** las pestañas Me deben / Yo debo pasan a ser la parte de arriba de la caja de la lista (mismo fondo y borde, como el prototipo) y tienen medida fija (136 px mínimo, alineadas a la izquierda): ya no se estiran. La columna de la lista conserva siempre su medida (400 px; 320 entre 900 y 1279), así que al pasar a una pestaña sin personas nada se mueve; antes colapsaba a una columna.
- **Menú lateral:** arriba, logo (cartera) y «Mis finanzas» (`menu-lateral-marca`); entre 900 y 1279 px solo el logo.
- **Cabecera:** en PC el título es el de la sección (`#hSeccion`, lo pone `titularSeccion` de `disposicion-pc.js` con `Ui.pantalla('*')`, tomando el `title` del ítem del menú; Wrapped = «Tu resumen»); en celular sigue «Mis finanzas» (`encabezado-app` / `encabezado-seccion`). La fecha de abajo no cambia.
- Smoke FASE 5: comprueba el título de la cabecera al cambiar de pantalla.

## Versión PC, parte 13: Personas como el prototipo y Prestado con pestañas (2026-11-17, SW v145)

- **Personas (excepción pedida por Sebas: aquí se hace como el prototipo, no solo se acomoda).** En PC (≥900 px) al abrir no hay nadie elegido: resumen arriba y una cuadrícula de tarjetas, una caja por persona (avatar, nombre, línea de relación, «Saldo neto» y etiquetas Préstamo / Encargo / Spotify / Le debo). Al tocar una tarjeta se abre su ficha a la derecha (440 px; 360 px entre 900 y 1279) y el resumen se oculta; volver a tocar la misma persona, o salir de la pantalla, cierra la ficha. Los bloques de la ficha (Préstamos, Encargos, Spotify, Le debo) pasan al tono neutro (`--bg3`) con título sin color. Sin personas solo se ve el estado vacío en caja. «Personas · N» y «Nueva persona» (el « persona» solo se ve en PC).
- **Saldo neto = préstamos − Yo debo.** El prototipo sumaba también los encargos; no se hizo: en la app el saldo de un encargo es plata ajena que solo administras (docs/encargos.md), y «Me deben» de Inicio y Prestado no lo cuenta. Rojo con «−» si yo debo, «Al día» si es 0. Las personas sin perfil vinculado (deudores / Yo debo sueltos) llevan la misma tarjeta.
- **Estructura:** `_renderListaPersonas` agrega por fila `personas-sub-pc` (relación), `personas-pie` (saldo neto y etiquetas), ocultos en celular (`styles.css`); `_sincronizarFichaPersonas` ya no abre la primera persona; nuevos `_cerrarFichaPersonas` y `_alternarPerfilPersona` (acción `personas:abrirPerfil`); `Ui.pantalla('*')` cierra la ficha al salir. `data-lista-vacia` de la pantalla oculta el resumen sin personas.
- **Prestado con pestañas en PC.** Resumen arriba; debajo, la lista de la pestaña activa (Me deben · N / Yo debo · N, 400 px; 320 entre 900 y 1279) y el detalle de la persona en el ancho restante. Ya no se ven las dos listas a la vez. `_mostrarPanelPrestamos` deriva la pestaña del panel (`data-tab-prestamos` de la pantalla) y repinta los botones, así abrir a alguien de Yo debo desde otro módulo cambia de pestaña. `cambiarTabPrestamos` abre en PC la primera persona de esa pestaña (`_abrirPersonaPorDefectoPrestamos(true)`: si la pestaña está vacía se queda en su lista vacía). Los conteos los pinta `refresh()` (`tab-me-deben-n`, `tab-yo-debo-n`; ocultos en celular).
- **Smoke:** la FASE 5 comprueba Personas (nadie elegido, saldo neto +$300.000 sin encargo, etiquetas, abrir / cambiar / cerrar, salir y volver) y las pestañas de Prestado en PC.
- **No se copió del prototipo:** el icono de eliminar persona (no existe en la app), la etiqueta «Mesada» (las personas no están ligadas a la mesada), el encargo dentro del saldo neto y la tabla de movimientos de Prestado (Fecha / Movimiento / Cuenta / Monto): se conserva la lista de la app. Personas en celular no cambia.
- **Al desplegar:** `bash subir.sh` (sella `sw.js`; cambian index.html, css, personas.js, prestado.js, refresh.js). Probar a mano en 1366×768: Personas (tocar, cambiar, volver a tocar), Prestado (pestañas con y sin personas) y redimensionar a celular con una ficha abierta.

## Versión PC, parte 12: Personas como pantalla con ficha (2026-11-17, SW v144)

- **El perfil de una persona ya no es una hoja en PC (≥900 px).** Es una ficha dentro de la pantalla Personas: arriba un resumen (Me deben, Yo debo y En Spotify), debajo la lista de personas (en caja) a la izquierda y la ficha de la persona elegida a la derecha (en caja, con el mismo contenido que la hoja: préstamos, encargos, Spotify, deudas mías, y el botón de editar). Al entrar se abre la ficha de la primera persona; elegir otra en la lista cambia la ficha; la persona abierta se resalta. Sin personas, no hay ficha y la lista ocupa todo el ancho con su estado vacío.
- **Desde otros módulos** (el avatar de Préstamos, Encargos o Spotify, el chip «Ver perfil»): en PC `abrirPerfilPersona` lleva a la pantalla Personas con esa persona abierta en la ficha, en vez de abrir una hoja. En celular todo sigue igual: el perfil sigue abriéndose en su hoja.
- **Resumen (solo PC):** «Me deben» y «Yo debo» con los totales de `Deudas.totalPendiente` (los mismos de Inicio y Préstamos) y «N personas» / «Nadie te debe» / «No debes nada»; «En Spotify» con cuántas personas y los nombres de las dos primeras. Los pinta `_renderListaPersonas()`; en celular está oculto (`.personas-resumen`).
- **Estructura:** `abrirPerfilPersona` elige el destino (`pficha-*` en PC, `pperf-*` en celular) y es el único constructor del perfil, así la ficha y la hoja nunca se desfasan. La lista se vuelve a pintar con la ficha sincronizada (`_sincronizarFichaPersonas`), así no queda vieja tras editar. Nuevos en el HTML: `personas-lista` (envoltorio de bloque, sin cambios de espaciado en celular), `personas-ficha` y el resumen, todos ocultos en celular.
- **Smoke:** la FASE 5 comprueba que en celular no hay ficha, que en PC se abre la de la primera persona sin abrir la hoja y que en celular el perfil sigue abriendo la hoja.
- **No se copió del prototipo:** el «Saldo neto» con signo y las etiquetas «Préstamo / Encargo / Spotify / Deuda mía» de cada tarjeta (la app conserva el resumen de cada fila: monto pendiente, encargos, etc.) y el icono de eliminar persona de la ficha (no existe en la app).

## Versión PC, parte 11: Análisis y Configuración (2026-11-16, SW v143)

- **Análisis y Configuración en PC (≥900 px).** Dos columnas que fluyen (columnas CSS): los bloques conservan el orden de celular (primero abajo por la columna izquierda y luego por la derecha), ningún bloque se parte entre columnas y cada título se queda con su tarjeta. En Análisis, el resumen del mes (balance, ingresos y gastos, porcentaje de ahorro) ocupa todo el ancho; en Configuración, los accesos de Wrapped y «Mis Wrapped». Entre 900 y 1279 px, una sola columna. En celular no cambia nada.
- **Estructura:** un envoltorio de bloque nuevo en Análisis (`analisis-resumen`, sin relleno ni borde: el espaciado de celular no cambia). Configuración no necesitó cambios de HTML.
- **No se copió del prototipo:** en Análisis, las cuatro tarjetas de resumen con «vs. octubre» y «Fijos pagados 6 de 8», la gráfica de patrimonio con «6 m / 12 m» y las barras compactas; en Configuración, la agrupación de «Módulos», «Notificaciones» y «Copia de seguridad» como paneles y los textos «Exportar JSON / CSV», «Tamaño de tus datos» y «Respaldos automáticos» (la app conserva sus secciones y textos).

## Versión PC, parte 10: Encargos, Alcancía y Plata comprometida (2026-11-16, SW v142)

- **Encargos en PC (≥900 px).** La lista a la izquierda (siempre visible, en caja) y el detalle del encargo abierto a la derecha (en caja). Al entrar se abre el primer encargo; es una apertura automática que se deshace al achicar a celular si la persona no eligió otro. El «volver» se oculta en PC y el encargo abierto se resalta en la lista (`encargo-card-activa`). Sin encargos, la lista ocupa todo el ancho con su estado vacío.
- **Estructura (Encargos):** `encargosListView` y `encargoDetalle` se alternaban con `style.display` inline en dos sitios de `encargos.js`; ahora `_mostrarPanelEncargos` marca el activo con la clase `panel-activo` (regla `.encargos-panel` en `styles.css`) y deja su nombre en `data-panel-activo`. Mismo patrón que Cuentas y Prestado.
- **Alcancía en PC.** Lo de siempre (estado vacío o activa, con sus estadísticas, botones y movimientos, esta última en caja) a la izquierda y, en el riel derecho, el progreso entre ciclos y el historial de alcancías (solo se ven cuando ya hay dos o más ciclos). Nuevo envoltorio de bloque `alcancia-progreso`, sin relleno ni borde (en celular no cambia nada). Entre 900 y 1279 px el riel pasa debajo.
- **Plata comprometida en PC.** Los ingresos comprometidos en una cuadrícula en vez de apilados; su estado vacío en caja. Solo CSS.
- **Smoke:** la FASE 5 comprueba que en PC se abre el primer encargo y que al achicar se vuelve a la lista.
- **No se copió del prototipo:** en Encargos, el total «Total encargos aquí», las tarjetas «Libre (de él)» / «Comprometido» y el formato de movimientos; en Alcancía, la tabla de depósitos y los textos de su panel de progreso («Mejor alcancía hasta ahora», «Alcancías destapadas»); en Plata comprometida, el panel de detalle con la distribución y los botones «Agregar destino» / «Confirmar y distribuir» (en la app la distribución se hace en sus hojas).

## Versión PC, parte 9: buscador como campo y Spotify (2026-11-16, SW v141)

- **Buscador en PC (≥900 px).** El botón de la cabecera (`btn-buscar-global`) se ve como un campo de 290 px, como en el prototipo: ícono, «Buscar movimientos, personas, cuentas» y el atajo «Ctrl K» (que ya abría la búsqueda desde la parte 1). Mismo botón y misma búsqueda de siempre: solo se muestran dos elementos más (`buscar-texto` y `buscar-atajo`), ocultos en celular. El texto describe lo que la búsqueda global ya cubre (movimientos, personas, cuentas, entre otros).
- **Spotify en PC.** Lo de siempre (costo y cuenta, resumen de cobros, botón de pagar, integrantes, estadísticas) a la izquierda, y el historial de pagos en el riel derecho dentro de una caja. Entre 900 y 1279 px el historial pasa debajo. En celular el orden no cambia.
- **Estructura:** dos envoltorios de bloque en el HTML (`spotify-principal` y `spotify-historial`), sin relleno ni borde, así que el espaciado de celular no cambia. Sin reparto de columnas por JS.
- **No se copió del prototipo:** las cuatro tarjetas de resumen (la app ya muestra los cobros en su resumen y el resto en «Estadísticas»), la tabla de integrantes con «Próximo cobro» y los botones «+ Integrante», «Configurar costo» y «Registrar pago a Spotify» con esos textos (la app conserva los suyos; «Pagar Spotify» se queda en la columna izquierda).

## Versión PC, parte 8: Mesada (2026-11-16, SW v140)

- **Mesada en PC (≥900 px).** Solo CSS: Papá y Mamá lado a lado (cada una ya es una tarjeta con su cuota y sus doce meses), y el título, el año, el resumen («Recibido este año», «Meses pagados») y el aviso de pagos parciales ocupan todo el ancho. Entre 900 y 1279 px, Papá y Mamá una debajo de la otra. El detalle de cada mes sigue abriéndose en su hoja (ventana modal en PC).
- **No se copió del prototipo:** las tarjetas «Cuota esperada» y «Pendiente», la tabla por mes con estados («Pagado completo», «Sin pagar», «Por venir»), los selectores Papá/Mamá y de año, y el panel lateral del mes elegido: la app muestra cada mes en una cuadrícula y su detalle en una hoja, y nada de eso existe como pantalla. Si quieres ese formato, es una vista nueva y hay que decidir de dónde sale cada dato.

## Versión PC, parte 7: Prestado como el prototipo (2026-11-16, SW v139)

- **Reparto:** el resumen arriba y, debajo, tres columnas: Me deben | Yo debo | detalle de la persona abierta (340 px). Antes eran las dos listas apiladas a la izquierda. Entre 900 y 1279 px las listas se apilan a la izquierda y el detalle queda a la derecha. Sin nadie abierto (todavía no hay personas) las dos listas ocupan todo el ancho, cada una en su caja con su estado vacío.
- **Resumen (solo PC):** tres tarjetas (Me deben en tono verde, Yo debo en tono rojo y el neto), con el número grande y una línea debajo («N personas» / «Nadie te debe», «No debes nada», «Me deben − yo debo» / «Sin préstamos registrados»); el título del neto es «Neto a favor», «Neto en contra» o «Neto» según el signo. Debajo, la barra de proporción entre lo que te deben y lo que debes, con «N % a favor» y «N % en contra»; la barra se oculta si no hay préstamos. Totales: `Deudas.totalPendiente` (los mismos de Inicio y del patrimonio); los pinta `refresh()` en `p-resumen-*`, `p-texto-*` y `p-barra-*`. En celular todo el resumen está oculto.
- **Filas de las listas:** planas dentro de la caja de cada lista (sin tarjeta propia, con fondo al pasar el mouse) y la persona abierta con fondo propio, como en el prototipo.
- **Texto nuevo respecto a la app** (a pedido de Sebas, copiado del prototipo y calculado con datos reales): «Neto a favor / Neto en contra / Neto», «N personas», «Nadie te debe», «No debes nada», «Sin préstamos registrados», «N % a favor / en contra».
- **Sigue sin copiarse:** el subtexto «de $X · pagó N %» y la barrita de avance de cada fila, y «+ Persona» en la cabecera de la lista (en la app «Agregar persona» queda abajo de la lista, como hoy).

## Versión PC, parte 6: cajas, lista de cuentas solo compacta en PC, Prestado sin datos y Inicio activo (2026-11-16, SW v138)

- **Lista de cuentas:** en celular vuelven las tarjetas de dos por fila de antes, con una diferencia: cuando la cantidad es impar, la última ya no ocupa todo el ancho (se quitó la regla `:last-child:nth-child(odd)` del selector y del modo Ordenar). La fila compacta (ícono, nombre con etiqueta, saldo, flecha) queda solo en PC, en `css/pc.css`.
- **Cajas en PC.** La información va dentro de un cuadro (`--bg2` con borde y radio 14) sobre el fondo, y lo de adentro (tarjetas, `.stat`, filas de gasto) un tono más claro (`--bg3`), como en el prototipo. Aplica a los paneles de Gastos (variables y fijos), a las listas y detalles de Prestado, a la lista y a los movimientos de Cuentas y al estado vacío de Tarjetas. En celular no cambia nada: cada tarjeta sigue directamente sobre el fondo.
- **Prestado en PC:** arriba un resumen con tres tarjetas (Me deben, Yo debo, Neto; los totales son `Deudas.totalPendiente`, los mismos de Inicio y del patrimonio, y los pinta `refresh()` en `p-resumen-*`); en celular está oculto (`.prestamos-resumen` en `styles.css`). Sin nadie abierto (todavía no hay personas) las dos listas quedan lado a lado a todo el ancho, cada una en su caja con su estado vacío, y sin panel de detalle; con personas, el reparto de siempre (listas a la izquierda, detalle a la derecha). La selección por defecto abre la primera persona de Me deben y, si esa lista está vacía, la de Yo debo.
- **Menú lateral:** «Inicio» aparece resaltado desde que carga la app (antes solo se marcaba al navegar, y la app abre en Inicio).
- **No se copió del prototipo:** la barra de proporción de Prestado, los subtextos de sus tarjetas («4 personas», «Nadie te debe»), «+ Persona» / «+ Deuda» y, en Gastos, el buscador, los chips de categoría y la tabla.

## Versión PC, parte 5: Tarjetas de crédito y Prestado (2026-11-15, SW v137)

- **Tarjetas de crédito en PC (≥900 px).** Solo CSS: el hero arriba y las tarjetas en una cuadrícula (cada una ya trae Compra / Pagar / Ver) en vez de apiladas; «Agregar tarjeta» con ancho acotado. Los movimientos de una tarjeta siguen viéndose en su hoja («Ver»): la app no tiene un panel de movimientos en esta pantalla y no se inventó.
- **Prestado en PC.** Las dos listas (Me deben y Yo debo) quedan a la izquierda, siempre visibles y sin pestañas, y el detalle de la persona abierta va a la derecha. Al entrar se abre la primera persona de la lista (la que más pesa); es una apertura automática que se deshace al achicar a celular si la persona no eligió otra. El «volver» del detalle se oculta en PC; la persona abierta se resalta en su lista (`persona-card-activa`). Entre 900 y 1279 px se conserva el mismo reparto.
- **Estructura:** los cuatro paneles de `#screen-prestamos` (`deudoresView`, `deudorDetalle`, `misDeudasView`, `miDeudaDetalle`) se alternaban con `style.display` inline en cinco sitios de `prestado.js`; ahora un solo punto (`_mostrarPanelPrestamos`) marca el activo con la clase `panel-activo` (regla `.prestamos-panel` en `styles.css`) y deja su nombre en `data-panel-activo`. Las pestañas se ocultan dentro del detalle con la clase `prestamos-tabs-oculto` en lugar de `style.display`. Mismo patrón que Cuentas y Gastos.
- **Smoke:** la FASE 5 comprueba que las pestañas de Prestado dejan activo un solo panel.
- **No se copió del prototipo:** las tarjetas de balance (Me deben / Yo debo / Neto a favor) y su barra de proporción, la tabla de compras de la tarjeta y sus chips, el panel «Acciones» y los textos «+ Persona» / «+ Deuda».

## Versión PC, parte 4: resumen del mes en Gastos y color de la lista de cuentas (2026-11-15, SW v136)

- **Gastos en PC: resumen del mes arriba.** Tres tarjetas (`.stat`, las mismas de Inicio): «Total gastado este mes», «Variables» y «Fijos». Son los mismos tres números de «Gastos del mes» de Inicio: `refresh()` (`js/core/refresh.js`) los pinta junto a `s-gf`/`s-gv`/`s-gtotal` en `g-resumen-total`, `g-resumen-variables` y `g-resumen-fijos`, sin un cálculo aparte. En celular no se ven (`.gastos-resumen` oculta en `styles.css`, cuadrícula de 3 columnas en `pc.css`). Siguen sin copiarse del prototipo: los subtextos («23 movimientos», «39 % del total»), el buscador, los chips y la tabla.
- **Análisis:** los dos textos «hoy X → Y» (balance mensual típico y meses de reservas) usaban el símbolo de texto `→`, que `tests/interfaz.test.js` no permite; ahora llevan una flecha SVG (clase `analisis-flecha` en `styles.css`).
- **Lista de cuentas:** el nombre y el saldo de cada fila vuelven al color de la cuenta (con el texto normal quedaban demasiado blancos); la etiqueta sigue en gris.

## Versión PC, parte 3: Gastos y lista de cuentas compacta (2026-11-15, SW v135)

- **Gastos en PC (≥900 px).** Los gastos variables a la izquierda (filtro de mes, lista y total) y los fijos mensuales en el riel derecho (barra de progreso, lista y total), los dos a la vez y sin la barra de pestañas; en su lugar se ven los títulos «Gastos» y «Fijos mensuales». Entre 900 y 1279 px los fijos pasan debajo. En celular nada cambia: siguen las pestañas.
- **Estructura:** `switchGastoTab` (gastos.js) alternaba `panel-var` y `panel-fijo` con `style.display` inline; ahora lo hace la clase `panel-activo` (regla `.gastos-panel` en `styles.css`), igual que Cuentas. Los dos títulos (`gastos-panel-titulo`) están ocultos en celular y no son texto nuevo: son los de las pestañas. La barra de progreso de fijos (`gastos-fijos-progress.js`) ahora se inserta antes de la lista y no antes del título; el orden visible en celular no cambia.
- **Lista de cuentas compacta (celular y PC).** Cada cuenta es una fila: ícono, nombre con su etiqueta debajo, saldo a la derecha y flecha; una sola columna (antes eran tarjetas grandes en dos columnas, y la última de una cantidad impar ocupaba todo el ancho). La cuenta abierta lleva el tono de su color. El nombre y el saldo usan el color de texto normal; el color de la cuenta queda en el ícono y en la fila abierta. El modo Ordenar usa la misma fila con el agarre a la derecha. Cambia `.cuenta-card*` y `.cuentas-selector-grid` en `styles.css`; el marcado no cambia.
- **Smoke:** la FASE 5 también comprueba que las pestañas de Gastos dejan activo un solo panel.
- **No se copió del prototipo:** las tres tarjetas de resumen (Gastado/Variables/Fijos pagados), el buscador y los chips de categoría, la tabla con columnas, «Cargar más», los avisos «Fijo»/«TC» y las pastillas «Pagado/En N días» de los fijos.

## Versión PC, parte 2: Cuentas (2026-11-15, SW v134)

- **Qué cambia en PC (≥900 px).** Lista de cuentas a la izquierda (una por fila, la cuenta abierta resaltada), detalle al centro y movimientos de la cuenta a la derecha. Al entrar a Cuentas se abre la primera cuenta activa; el «volver al selector» del detalle sobra y se oculta. La cajita, Archivadas y las subpantallas Meta/CDTs usan todo el ancho (no tienen lista de movimientos). Entre 900 y 1279 px la lista es más angosta y los movimientos pasan debajo del detalle. Por debajo de 900 px nada cambia.
- **Estructura:** los siete paneles de `#screen-cuentas` se alternaban con `style.display` inline desde `_showCuentasPanel`; ahora lo hace la clase `panel-activo` (regla en `styles.css`) y la pantalla lleva `data-panel-activo` con el panel visible. Así en PC la lista nunca se oculta y el CSS sabe cuándo mostrar la columna de movimientos. Los dos bloques de movimientos (`cuenta-movs-bloque`) ganaron id (`cuenta-movimientos-simple`, `cuenta-movimientos-nu`) para poder moverlos a la columna derecha con `disposicion-pc.js`.
- **Selección por defecto.** Es automática y solo existe en PC: si la ventana se achica a celular sin que la persona haya elegido otra cosa, se vuelve al selector. Cualquier cambio de panel hecho por la persona (otra cuenta, una cajita, Archivadas) borra la marca y se conserva al achicar.
- **Smoke:** la FASE 5 de `scripts/smoke-browser.js` pasa la ventana a «PC» y de vuelta (con `matchMedia` controlable) y comprueba que Inicio y Cuentas se arman en columnas, que se abre la primera cuenta, que al volver a celular todo regresa a su orden original y que una cuenta abierta por la persona se conserva. La FASE 2 mide el panel visible por la clase `panel-activo`.
- **No se copió del prototipo:** la tabla de movimientos, el buscador/segmento/mes propios del prototipo (la app tiene sus filtros), «Total» bajo Nu en la lista, las cajitas como subítems de la lista, «Agregar cuenta» en la cabecera, la barra Libre/CDT, el pie «se deshace desde su origen» y los pasos de «Nu sin configurar».

## Versión PC, parte 1: estructura compartida e Inicio (2026-11-15, SW v133)

- **Qué es.** A partir de 900 px de ancho la app muestra un menú lateral (con grupos, o solo íconos entre 900 y 1279 px) en vez de la barra inferior, las hojas pasan a ventanas modales centradas y Inicio se reparte en columna principal + riel derecho (Necesita atención, Tarjetas de crédito, Salud financiera). Por debajo de 900 px todo sigue igual. Diseño y reglas: `version-pc.md`.
- **Archivos nuevos:** `css/pc.css` (solo reglas dentro de `@media (min-width:900px)`, salvo ocultar el menú lateral en celular) y `js/core/disposicion-pc.js`.
- **Cómo cambia de modo sin recargar.** El modo lo decide solo el CSS (`@media`); no hay JS que elija entre «celular» y «PC». Lo único que hace JS (`disposicion-pc.js`) es mover los mismos nodos de Inicio a dos contenedores al pasar a PC y devolverlos a su sitio exacto al volver: nada se vuelve a pintar, así que la pantalla abierta, las hojas y los formularios se conservan.
- **HTML:** el menú lateral (`aside.menu-lateral`) y cuatro envoltorios de bloque en Inicio (`inicio-patrimonio`, `inicio-gastos`, `inicio-salud`, `inicio-proyeccion`) que agrupan el título con su contenido. Son `div` de bloque sin relleno ni borde: el espaciado de celular no cambia.
- **JS tocado, mínimo:** `eventos-base.js` (clic del menú lateral y atajo Ctrl/Cmd + K, que abre la búsqueda global solo en PC), `navegacion.js` (ítem activo del menú lateral), `mas-menu.js` (Spotify y Mesada siguen los módulos activos también en el menú lateral) y `firebase-sync.js` (el estado de sincronización se refleja también en el pie del menú lateral).
- **No se copió del prototipo** lo que la app no tiene: barra de composición del patrimonio, botones Revisar/Ver/Cobrar, gráfica de la proyección, «Ver gastos →», barras de proporción de Fijos/Variables ni los textos de su Salud financiera.
- **Pendiente:** Wrapped no está en el menú lateral (se decide con su pantalla); las pastillas de cuentas de Inicio siguen en la misma cuadrícula de 3 columnas que Disponible/Prestado/CDTs.

## Mejora 12 (parte 10): cierre de abreviaturas, constantes, acciones vigiladas y changelog por tema (2026-11-14, SW v132)

- **Abreviaturas: de 38 a 0.** Las claves de estado de Mesada pasan de `mp`/`mpp` a `registrarPago`/`pagoPendiente`; los ids del HTML con prefijo abreviado se renombran a su nombre completo: `mp…` → `mesadaPago…`, `mpp…` → `mesadaPagoPendiente…` (y el id de instancia del widget de dividir), `ad…` → `agregarDinero…` (`adMenuDest` → `agregarDineroMenuDestino`), `nuMov…` y `_nuMovCheck_…` → `nuMovimiento…`. Son 75 ids en `index.html`, `js/`, `tests/` y `docs/`; se comprobó mecánicamente que cada id citado en el código existe en `index.html`. Un regex del `fake-dom` de los tests que citaba `mpp?UsarEncargo` no lo vio la herramienta de renombre y lo atrapó `mesada.test.js`. «Último mov:» en la ficha de persona pasa a «Último movimiento:» (el otro texto igual ya lo decía así). El trinquete queda en 0.
- **Constantes de valores guardados** (`js/core/estado.js`): `TIPO_PAGO_COMPLETO`, `TIPO_ALCANCIA` y `esAbonoDeDeuda()`, que reemplaza ocho veces la condición «abono o pago completo». Nueva prueba: esos valores no se escriben como texto suelto fuera de `estado.js`.
- **Acciones `data-action` vigiladas:** nueva prueba que cruza las acciones que escriben `index.html` y las plantillas con las registradas en `Events` (231 registradas, 220 escritas). Encontró una acción muerta, `cuentas:selTipoNuevaCuenta` (registrada, nadie la usaba), que se quitó.
- **Trinquete de CSS y reglas para clases nuevas:** `scripts/convenciones-css.js` + octava prueba de convenciones + `tests/fixtures/css-base.json`. Congela lo que existe (1.206 clases con prefijo abreviado, 11 fuera de `kebab-case`, 42 `!important`, 64 colores hex fuera de `:root`) y falla si algo de eso sube o si baja sin registrarlo. Las 11 reglas están en `guia-estilo-sheets.md` §0 bis; el renombre de las clases viejas queda para el rediseño de cada pantalla.
- **Glosario y guía:** `glosario-dominio.md` al día (valores guardados y constantes, prefijos de id, «cobro» y `splits` explicados en vez de pendientes, trinquete en 0, una sección con lo que se dejó a propósito) y documento nuevo `guia-de-renombres.md` con el método, las trampas, el protocolo de verificación y lo que se decidió no hacer.
- **Documentación:** `docs/CHANGELOG.md` pasaba de 830 KB; ahora trae un índice y las entradas desde la v117 (35 KB) y el resto vive en `docs/changelog/` (un archivo por tema y uno cronológico). Las 142 referencias `CHANGELOG.md#tema` del código y de los docs apuntan ya a `changelog/tema.md`. Se quitaron las citas a documentos que ya no existen (`reglas-visuales.md`, `plan-migracion-personas.md`, `mejoras-mis-finanzas.md`) y una nueva prueba vigila que todo «algo.md» citado en `js/`, `tests/` y `scripts/` exista.

## Mejora 12 (parte 9): se pliega la migración v12 (2026-11-14, SW v131)

- **`SCHEMA_BASE` pasa de 11 a 12 y `MIGRACIONES` vuelve a quedar vacía.** Los 21 campos guardados con nombre completo (`_movimientoId`, `_encargoMovimientoId`, `_encargoNombre`, `_tcMovimientoId`, `operacionesAviso`/`operacionesBloqueo`…) son ahora parte del modelo. Se quitó `_renombrarClavesEnArbol`, que solo servía a esa migración (queda en la historia de git por si un renombre futuro la necesita).
- **Consecuencia:** datos o backups del esquema 11 ya no se migran: la app los marca como «versión anterior» (`S._esquemaAnterior`) y un backup de esa versión se rechaza al importar. Como nadie usa la app no se pierde nada.
- **Tests:** se quitó el bloque «migración v12» (5 pruebas) y se agregaron 2 (la base 12 pasa intacta; el esquema 11 se marca como anterior y no se renombra nada). Las validaciones de backup usan el esquema 12 como válido y el 11 entra en la lista de «versión anterior».
- **Docs y scripts:** `configuracion.md`, `libro-de-movimientos.md` y los comentarios de `scripts/equivalencia.js` y `scripts/conciliacion.js` (el backup de prueba debe ser del esquema 12).

## Mejora 12 (parte 8): lo que había quedado pendiente (2026-11-14, SW v130)

- **Abreviaturas ambiguas, una por una:** `md` → `misDeudas` (es «mis deudas», `S.misDeudas`; el glosario decía «me deben» y estaba mal) y `cpd` → `destinoNuevo` (el destino que se arma en la hoja de plata comprometida); `reg` se renombró identificador por identificador (`saldoReg` → `saldoRegistrado`, `swReg` → `swRegistration`, `ultimoReg` → `ultimoRegistro`, `_reg` → `_registro` y la variable local según el archivo). `dd` no se tocó: son variables locales sin relación entre sí.
- **33 acciones de `data-action` con abreviatura:** claves de los registros, `Events.attr`, `index.html`, tests y docs (`abrirDetalleMov` → `abrirDetalleMovimiento`, `difToggle` → `diferencialToggle`, `selColorNC` → `selColorNuevaCuenta`, `eliminarMovMiDeuda` → `eliminarMovimientoMiDeuda`…), y el namespace `cp:` → `plata-comprometida:` (27 usos en `index.html` y en las plantillas). Ninguna acción conserva abreviatura.
- **Atributos y etiquetas:** los 13 atributos `data-mov-*` (`data-mov-fecha` → `data-movimiento-fecha`, `data-mov-enc-id` → `data-movimiento-encargo-id`…) más `data-mov-id`, `data-bar-ing` → `data-bar-ingreso` y `data-inst-id` → `data-instancia-id`, cada uno junto con la clave `dataset` que lo lee; y las etiquetas de búsqueda `prestamo_mov` / `encargo_mov` → `prestamo_movimiento` / `encargo_movimiento`.
- **Migración v12 (esquema 12):** 21 campos guardados pasan a su nombre completo en todo el árbol de datos: `_movId` → `_movimientoId`, `_encMovId` → `_encargoMovimientoId`, `_encNombre` → `_encargoNombre`, `_encId` → `_encargoId`, `_tcMovId` → `_tcMovimientoId`, `_movSecId`, `_abonoDestinoMovId`, `_alcanciaMovId`, `_deudorMovId`, `_deudaMovId`, `_miDeudaMovId`, `_abonoEncMovId`, `_encExtraMovId`, `_prestamoMovId`, `_encargoOrigenMovId`, `movId` → `movimientoId`, `extraMovId`, `movExtraId` y los umbrales `opsAviso` / `opsBloqueo` → `operacionesAviso` / `operacionesBloqueo`. Idempotente y sin pisar un nombre nuevo. `SCHEMA_BASE` sigue en 11; los datos de la nube se migran al cargar. **Cuando los datos de la nube y los backups ya estén en la v12 se puede plegar** (`SCHEMA_BASE = 12` y `MIGRACIONES = []`).
- **Error mío atrapado antes de entregar:** al renombrar `movId`, el código pasó a leer `dataset.movimientoId` mientras las plantillas seguían escribiendo `data-mov-id`; tocar un movimiento habría dejado de abrir su detalle y ningún test lo cubría. Se corrigió el atributo y se agregó una prueba general en `tests/convenciones.test.js`: todo `dataset.x`, `getAttribute('data-x')` o selector `[data-x]` que el código lee debe tener su atributo escrito en alguna plantilla (se comprobó que detecta el error original; tres lecturas que ya eran opcionales o dinámicas quedan como excepciones documentadas).
- **Otros avisos de los tests, corregidos:** la pasada sobre `docs/` también reescribió listas del glosario con los nombres nuevos (se rehízo el §4); el contador del trinquete tomaba texto de plantillas como código.
- **Tests:** 1046 (5 nuevos de la migración v12 y 1 de atributos; 1 actualizado, «datos nuevos nacen en el esquema 12»).
- **Equivalencia:** con un backup del esquema 11 al que se le inyectaron 5.520 campos viejos y los umbrales viejos, el código anterior y el final con migración dan el mismo patrimonio, ingresos y gastos; además un test compara la migración con un renombrado independiente sobre el texto del JSON.
- **Trinquete:** de 3.385 apariciones a **38**. Lo que queda son solo ids y prefijos del HTML (`mp`, `mpp`, `adAperturaWrap`, `adMenuDest`, `adMenuMonto`, `nuMovAperturaWrap`), documentados en `docs/glosario-dominio.md` §4.

## Mejora 12 (parte 7): segundo nivel de abreviaturas escrito completo (2026-11-14, SW v129)

- **19 abreviaturas más, con la misma herramienta y análisis de alcance:** `inst` → `instancia`, `hist` → `historial`, `st` → `estadoActual`, `fb` → `firebase`, `og` → `origenLibro`, `ops` → `operaciones`, `chk` → `checkbox`, `dest` → `destino`, `cont` → `contenedor`, `tt` → `tooltip`, `ab` → `abono`, `liq` → `liquidez`, `nc` → `nuevaCuenta`, `ad` → `agregarDinero`, `mp` → `mesadaPago`, `sc` → `scroller`, `sl` → `slide`, `ae` → `elementoActivo`, `vk` → `tecladoVirtual`. 331 variables y funciones, 6 referencias a globales, 210 propiedades y 32 claves abreviadas, 1.683 ediciones en 58 archivos de `js/`, `tests/` y `scripts/`; además 66 menciones en comentarios, 3 cadenas de tests y 44 en `docs/`. Ejemplos: `_fbSaveToCloud` → `_firebaseSaveToCloud`, `window._fb` → `window._firebase`, `instId` → `instanciaId`, `_ogCta` → `_origenLibroCta`, `showTT` → `showTooltip`.
- **Decisiones:** `st` pasa a `estadoActual` y no a `estado` porque `estado` ya es el parámetro de esas mismas funciones; `og` pasa a `origenLibro` porque es el origen del libro (`Libro.origen(...)`) y no el campo `origen`; `sc` es el `scroller`. **No se expandieron `reg` ni `dd`:** `reg` significa registro, registrado o registration según el sitio (y `RegExp` contiene `reg`), y `dd` tiene un solo sentido claro en un archivo.
- **Se dejó como estaba, a propósito:** `opsAviso` y `opsBloqueo` (umbrales guardados en `S.config.proteccionAntiguedad`), la clave `mp` del estado de Mesada (sale del prefijo de los ids) y las acciones `selIconoNC`, `selColorNC`, `selTipoNC` y `alternarAhorroNC` (nombres de `data-action`: solo se renombraron las funciones, y en los tests, que las llaman, también). `index.html` conserva todas sus acciones (comprobado: ninguna cambió).
- **Errores de mi herramienta que los tests atraparon y se corrigieron antes de entregar:** la pasada sobre `docs/` e `index.html` reescribía también esos cuatro nombres de acción; una función de prueba `hist` chocaba con la ayuda `historial` de `tests/finanzas.test.js` (ahora `historialPrueba`); y varias comprobaciones de código fuente por texto citaban nombres viejos (`window._fbDeleteAccount`, `_og*`, `_ncModoEdicion`).
- **Trinquete:** ahora vigila 35 abreviaturas (`scripts/convenciones.js` y glosario §3 actualizados) y `--actualizar --forzar` permite sumar abreviaturas nuevas sin que el recuento inicial cuente como «subida». También deja de contar como código el texto de comentarios al final de una línea de código.
- **Equivalencia:** con un backup del esquema 11 que incluye los campos renombrados, el código anterior al lote y el final dan el mismo patrimonio, ingresos y gastos.

## Mejora 12 (parte 6): se pliega la migración v11 (2026-11-13, SW v128)

- **`SCHEMA_BASE` pasa de 10 a 11 y `MIGRACIONES` vuelve a quedar vacía.** Los nueve campos guardados con nombre completo (`tasaRetencion`, `spotifyId`, `_desdePlataComprometida`, `_esReposicionPlataComprometida`, `_plataComprometidaItemId`, `_diferencialDijo`/`_diferencialReal`/`_diferencialMargen`, `_alcanciaTipo`) son ahora parte del modelo. Se quitó también `_renombrarClavesEnArbol`, que solo servía a esa migración.
- **Consecuencia:** datos o backups del esquema 10 ya no se migran: la app los marca como «versión anterior» (`S._esquemaAnterior`) y un backup de esa versión se rechaza al importar. Hay que exportar el backup con la app actual (esquema 11).
- **Tests:** se quitaron los 4 de la migración; el test de «versión anterior a la base» ahora incluye el esquema 10, y los de validación de backup usan el 11 como válido y rechazan 7, 8, 9 y 10. Total 1040.
- `scripts/equivalencia.js` y `scripts/conciliacion.js` avisan en su cabecera que el backup debe ser del esquema 11 o posterior. `docs/configuracion.md` y `docs/libro-de-movimientos.md` actualizados.

## Mejora 12 (parte 5): nueve campos guardados con nombre completo, esquema 11 (2026-11-12, SW v127)

- **Primera migración real del modelo de datos (v11, en `MIGRACIONES`):** renombra en todo el árbol de datos, sin importar dónde viva cada uno, `rte` → `tasaRetencion` (retención del CDT), `spId` → `spotifyId` (cobros de Spotify), `_desdeCP` → `_desdePlataComprometida`, `_esReposicionCP` → `_esReposicionPlataComprometida`, `_cpItemId` → `_plataComprometidaItemId`, `_difDijo` / `_difReal` / `_difMargen` → `_diferencialDijo` / `_diferencialReal` / `_diferencialMargen` y `_alcTipo` → `_alcanciaTipo`. Es idempotente y, si el nombre nuevo ya existe en un objeto, conserva el nuevo y descarta el viejo. La opción de formulario `rteDefecto` (no es dato guardado) pasa a `tasaRetencionDefecto`.
- **Versiones:** `SCHEMA_BASE` sigue en 10 (un backup del esquema 10 se importa y se lleva al 11 con `aplicarMigraciones`); `SCHEMA_VERSION_ACTUAL` pasa a 11. Los datos de la nube se migran al cargar y quedan en la v11 en el siguiente guardado. Un dispositivo con la versión vieja de la app que lea datos del esquema 11 los deja intactos («datos de una versión más nueva»): hay que tocar «Actualizar».
- **Código:** 119 propiedades, 13 menciones en comentarios y 21 en `docs/`, con la misma herramienta; datos de prueba de `scripts/smoke-browser.js` y de los tests actualizados. Se verificó que ningún literal de objeto quedara con una clave duplicada. Docs (`configuracion.md`, `libro-de-movimientos.md`) corregidos: decían «esquema 9» y «MIGRACIONES vacía».
- **Tests:** 4 nuevos (renombra donde viva el campo y sube la versión, no deja ninguna clave vieja ni toca el resto, es idempotente y no pisa un nombre nuevo, un backup del esquema 10 pasa al 11) y 1 actualizado (los datos nuevos nacen en el esquema 11). Total 1044.
- **Equivalencia:** con un backup en el formato viejo que incluye los nueve campos (un CDT de 50 millones con retención 0, cobros de Spotify, reposiciones y diferenciales), el código anterior y el nuevo con migración dan lo mismo: ingresos y gastos idénticos mes a mes y patrimonio igual a 1 peso. Control: con ese mismo backup sin el campo `rte`, el patrimonio cambia en ≈ 83.000, así que la comprobación sí detecta un renombre mal hecho.
- **Trinquete:** de 364 a 289 apariciones. Quedan solo los ids de enlace (`_movId`, `_encMovId`…), los atributos `data-mov-*`, las acciones y las etiquetas, que se leen bien y no se renombraron.
- **Pendiente (opcional):** cuando los datos de la nube y los backups ya estén en la v11, plegar la migración (`SCHEMA_BASE = 11` y `MIGRACIONES = []`).

## Mejora 12 (parte 4): `enc`, `mov` y `movs` escritas completas (2026-11-12, SW v126)

- **Último lote grande de abreviaturas:** 395 variables y funciones, 26 referencias a globales de otros archivos, 101 propiedades y 18 claves abreviadas, en 34 archivos de `js/`, `tests/` y `scripts/`; además 65 menciones en comentarios, 15 cadenas de tests y smokes que llaman funciones por nombre, y 92 en `docs/`. Ejemplos: `registrarMovEspejo` → `registrarMovimientoEspejo`, `_aplicarMovMiDeuda` → `_aplicarMovimientoMiDeuda`, `renderMovsCuenta` → `renderMovimientosCuenta`, `confirmarMoverEncCuentas` → `confirmarMoverEncargoCuentas`, y la variable local `movs` → `movimientos`.
- **Qué se dejó como estaba (a propósito):** los campos guardados con `enc`/`mov` (`_movId`, `_encMovId`, `_tcMovId`, `movId`, `extraMovId`…), los atributos `data-mov-*` (`movFecha`, `movTipo`…), las acciones de los eventos (`abrirMov`, `verMov`, `abrirDetalleMov`, `eliminarMovMiDeuda`…), las etiquetas de búsqueda `prestamo_mov`/`encargo_mov` y los ids de datos de prueba `encCerrado`/`encAbierto`. Lista completa en `docs/glosario-dominio.md` §4.
- **Cuando un nombre cumple dos papeles** (por ejemplo `abrirDetalleMov` es una función y también el nombre de una acción en `data-action`), solo se renombra la función; en el código de producción la herramienta no toca ninguna cadena. En tests y smokes solo se reescriben los nombres de funciones realmente renombradas.
- **Una comprobación de código fuente por texto** en `tests/interfaz.test.js` (`!movs.length`) se actualizó a `!movimientos.length`.
- **Trinquete:** de 2.132 a 364 apariciones; todas las que quedan son campos guardados, atributos, acciones o textos de la lista anterior (`mov` 201, `enc` 63, `sp` 25, `cp` 21, `rte` 19, `dif` 17, `mpp` 10, `ctc` 3, `movs` 2, `alc`, `ing` y `prtc` 1).

## Mejora 12 (parte 3): `sp`, `cp`, `dif`, `alc`, `ing`, `caj`, `ctc`, `rte`, `movenc`, `mpp`, `prtc` escritas completas (2026-11-12, SW v125)

- **Segundo lote de abreviaturas escrito completo,** con la misma herramienta de la parte 2, ahora con **análisis de alcance** (qué variable vive en qué función) para no chocar con nombres que ya existían: 291 variables y funciones, 19 referencias a globales de otros archivos, 38 propiedades y 12 claves abreviadas de objetos, en 39 archivos de `js/`, `tests/` y `scripts/`; además los nombres citados en comentarios, cadenas de tests/smokes y `docs/`. Ejemplos: `getSpFuente` → `getSpotifyFuente`, `_ogCp` → `_ogPlataComprometida`, `_cpRenderLista` → `_plataComprometidaRenderLista`, `_alcOculto` → `_alcanciaOculto`, `cajId` → `cajitaId`, `ing` → `ingreso`, `dif` → `diferencial`, `SP_PERIODO_DIAS` → `SPOTIFY_PERIODO_DIAS`, y la variable local `rte` → `tasaRetencion` (es una tasa; `retencion` ya era el monto).
- **No se renombró, a propósito,** lo que es dato guardado o texto en otro sitio: `cdt.rte` y `rteDefecto`, `spId`, `_desdeCP`, `_esReposicionCP`, `_cpItemId`, `_difDijo`/`_difReal`/`_difMargen`, `_alcTipo`; las acciones de los widgets de reparto (`difToggle`, `ctcMiAgregarRow`…), la clave `mpp` de Mesada, `barIng` (atributo `data-bar-ing`) y la clave `cp` del registro de módulos de los tests. Quedan en la lista de «nombres antiguos» de `docs/glosario-dominio.md` §4; los campos guardados se cambian con la migración al esquema 10, si se decide hacerla.
- **Desestructuraciones:** donde una variable se renombra pero la clave del objeto no (`const {tasa, rte: tasaRetencion, …} = v`), se conserva la clave.
- **Trinquete:** de 3.219 a 2.132 apariciones; `sp`, `cp`, `dif`, `alc`, `ing`, `caj`, `ctc`, `rte`, `movenc`, `mpp` y `prtc` casi en 0 (solo los nombres de la lista anterior). Quedan `enc` (994), `mov` (893) y `movs` (147).

## Mejora 12 (parte 2, piloto): `gv` / `gf` → `gastoVariable` / `gastoFijo` (2026-11-12, SW v124)

- **Primer grupo de abreviaturas escrito completo,** hecho con una herramienta que renombra solo identificadores (parser de JavaScript), no textos: 27 nombres, 176 apariciones en 9 archivos (`gastos.js`, `periodo.js`, `refresh.js`, `analisis.js`, `inicio.js`, `huella.js`, `cuentas-fuentes.js`, `reglas.js` y `tests/nucleo.test.js`). Ejemplos: `gvTotal` → `gastoVariableTotal`, `gfTotal` → `gastoFijoTotal`, `gvMes` → `gastoVariableMes`, `_ogGv` → `_ogGastoVariable`, `gvSplit` → `gastoVariableSplit`, `actualizarGvImpacto` → `actualizarGastoVariableImpacto`, `gf` (variable local) → `gastoFijo`.
- **No cambió ningún dato guardado ni la interfaz:** `Periodo.gastosDelMes()` y la sonda `periodos` de la huella devuelven ahora `gastoVariableTotal` / `gastoFijoTotal`, pero ninguna se guarda en `S`.
- **Se dejó como estaba, a propósito:** los ids del HTML y sus claves en los tests (`gv_monto`, `gv_fuente`, `totalGVFilt`, `gfTotalCard`…), las clases CSS, el prefijo `gv` de `crearSplitWidget` (arma ids) y las claves `gv`/`gf` de la foto de `scripts/equivalencia.js` (para poder comparar con fotos ya guardadas; solo se renombraron sus lecturas de `Periodo`).
- **Trinquete (`tests/fixtures/convenciones-base.json`):** `gv` y `gf` quedan en 0; ya no pueden volver. Además `scripts/convenciones.js` dejó de contar texto de los comentarios HTML de `index.html` como si fuera código.
- **Docs:** `analisis-financiero.md`, `libro-de-movimientos.md` y `cierre-de-periodos.md` citan los nombres nuevos.

## Mejora 12 (parte 1): convención de nombres y archivos en `kebab-case` (2026-11-12, SW v123)

- **Archivos renombrados** (único desorden de formato que había): `js/modules/actividad_reciente.js` → `actividad-reciente.js`, `plata_comprometida.js` → `plata-comprometida.js`, `tarjetas_credito.js` → `tarjetas-credito.js`. Se actualizaron `index.html`, `Loader.GROUPS`, `sw.js` (`PRECACHE`, sellado con `npm run sellar`), los tests, los comentarios de `js/` y `css/styles.css`, y los `.md` vivos; `docs/mapa-codigo.md` se regeneró. **`plata_comprometida` como clave de datos** (`config.proteccionAntiguedad`) **no se tocó**. Se corrigió de paso la referencia vieja de `index.html` a `docs/tarjetas_credito.md`.
- **Convención escrita:** `docs/arquitectura-archivos.md` §5 (lo técnico en inglés, el dominio en español, un concepto una palabra, sin abreviaturas opacas) y `docs/glosario-dominio.md` (vocabulario oficial, sinónimos que no se usan, abreviaturas y sus formas completas, nombres antiguos pendientes). También se quitaron los acentos graves de «`el núcleo`» que dejó un reemplazo mecánico en ese documento.
- **Decisión:** no se migra el código a inglés. El vocabulario del dominio coincide con el de la interfaz, los términos centrales no tienen traducción natural (`encargo`, `cajita`, `fuente`, `espejo`) y el mayor problema de legibilidad eran las abreviaturas, no el idioma. El glosario conserva la columna en inglés por si algún día se publica el repo.
- **`tests/convenciones.test.js` + `scripts/convenciones.js`:** (1) nombres de archivo en `kebab-case`; (2) **trinquete de abreviaturas** (`enc`, `mov`, `sp`, `gv`, `gf`, `cp`, `alc`, `caj`, `ctc`, `prtc`, `movenc`, `mpp`, `rte`, `ing`, `dif`): ninguna puede subir en ningún archivo y, si baja, hay que registrarlo con `node scripts/convenciones.js --actualizar` (hoy: 3385 apariciones en 34 archivos, en `tests/fixtures/convenciones-base.json`); (3) cada abreviatura vigilada debe estar en el glosario.
- **Al aplicar el zip:** borrar `js/modules/actividad_reciente.js`, `js/modules/plata_comprometida.js` y `js/modules/tarjetas_credito.js` del repo (el zip no borra archivos).

## Revisión estructural, parte 3: Service Worker robusto (M8) (2026-11-10, SW v122)

- **Precaché atómico por versión:** `sw.js` lleva un bloque `PRECACHE` (lista de todos los archivos desplegables) que escribe `npm run sellar`; `install` los baja TODOS a la caché de la versión y, si uno falla, la instalación falla (nunca queda una versión a medias). `sellar --check` también falla si la lista está desactualizada.
- **Sin mezcla de versiones:** la app se sirve cache-first desde la caché de SU versión; ya no hay stale-while-revalidate que mezclaba JS nuevo con viejo.
- **Actualización controlada:** el SW nuevo queda *waiting* y no se activa solo; el aviso «Actualizar» manda `SKIP_WAITING` y recarga una sola vez. Lógica en el nuevo `js/core/sw-registro.js` (salió de `mejoras-adicionales.js`).
- **Sin rutas fijas:** la base se deriva de `self.registration.scope`; ya no aparece `/mis-finanzas/` escrito en el cliente (el repo puede cambiar de nombre).
- **Push sin duplicados:** `scripts/notificaciones/run.js` envía mensajes solo-datos (`data`, sin `notification`) y el SW muestra UN aviso; `notificationclick` enfoca la ventana abierta o abre una. Variable opcional `APP_BASE_URL` en el workflow.
- **Limpieza:** al activar solo se borran cachés `mis-finanzas-v*` viejas; la de fuentes/SDK (`mis-finanzas-ext`) se conserva.
- **Limpieza (M12):** `mejoras-adicionales.js` (mezcla de cuatro cosas) se partió en `saldos-ocultos.js`, `arranque-ui.js` y `formularios-ui.js`; `personas-init.js` y el encabezado de `lazy-loader.js` se simplificaron y se quitaron comentarios históricos que ya no aplican. Historial `window.refresh` parcheado: ya resuelto con `Refresh.registrar` (A7).
- **M7 (parte 1):** `sheet-stack.js` se partió en `navegacion.js` (hojas + pantallas), `modulos-activos.js` y `eventos-base.js`; `mostrarAlertaFuente` pasó a `formularios-ui.js` y `saveAndRefresh` a `core-state.js` (`markDirty`/`_dirty` eliminados: sin uso). Las ramas `if(name===…)` de `showScreen` y los efectos por hoja de `openSheet` ahora los registra cada módulo dueño con `Ui.pantalla`/`Ui.hoja` (gastos, cuentas, nu, spotify, config, análisis, wrapped, personas, encargos, mesada, tarjetas, préstamos).
- **M7 (parte 2):** `core-state.js` (2150 líneas) se dividió, sin cambiar lógica, en `estado.js`, `cuentas-fuentes.js`, `persistencia.js`, `patrimonio.js`, `ingresos.js`, `dialogos.js`, `utilidades-ui.js` y `refresh.js` (orden de carga en index.html; `tests/support/nucleo-estado.js` es la lista para los tests, que siguen pidiendo «core-state.js» a `loadApp` y se expande solo). Test nuevo `tests/nucleo-partes.test.js`.
- **«Sin dato» como ícono:** el guion «—» que se veía (y se podía copiar) en Tendencia mensual, Análisis (balance, ingresos estimados, tasa de ahorro, ahorrado, % de patrimonio), Alcancía (tiempo activa), CDT de Nu, Mesada, Spotify, Plata comprometida , récords de Wrapped y «Ganancia acumulada» de Spotify ahora es un SVG (`SIN_DATO`, js/core/utilidades-ui.js; clase `.sin-dato`): no se selecciona, hereda el color y lleva aria-label.
- **Detalles de la revisión final:** el test de `_fechaSafe` ya no depende del huso horario (usa `Fecha.iso`; la suite pasa con `TZ=Pacific/Auckland`, Tokio, Los Ángeles y Bogotá); ~160 comentarios con referencias mecánicas a `core-state.js` se reescribieron (nombran el núcleo o el archivo exacto) y se quitaron las menciones a `sheet-stack.js`/`mejoras-adicionales.js`; el avatar de la lista de Encargos (color de la persona + clic al perfil) ahora viene en el HTML de la fila y se eliminó `_encListaPerfiles()`, que parchaba el DOM después de pintar.
- **Respaldos (Configuración):** el botón «Restaurar» de cada fila ocupaba todo el ancho (`.btn` trae `width:100%`) y apretaba la fecha; ahora `.cfg-resp-btn` es `width:auto` y la info ocupa el resto.
- **Respaldos:** el botón «Ver respaldos» ahora alterna con «Ocultar respaldos» (antes, con la lista abierta, volvía a cargar los mismos respaldos).
- **Scripts de diagnóstico:** `conciliacion.js` y `equivalencia.js` cargaban un archivo inexistente («el núcleo») por un reemplazo mecánico de comentarios; vuelven a pedir `core-state.js` (loadApp lo expande a las 8 partes) y un test los ejecuta.
- Tests nuevos: `tests/sw.test.js` (SW simulado en vm: precaché, activate, fetch offline, mensajes, clicks).

## Revisión estructural, parte 2: ciclo de vida `Ui`, sin parches de funciones, Firebase/CSS/higiene (M3, M1, M2, M4, M10, M9, M11, M12) (2026-11-10, SW v121)
**Origen:** la revisión estructural de noviembre de 2026 (documento ya retirado: todos sus hallazgos, M1–M12, quedaron resueltos en estas entradas); todos los hallazgos de esta parte eran ciertos (había 14 parches `const _orig = X; X = function…` y 3 formas distintas de «engancharse»).
**M3 — `js/core/ui.js` (`Ui`).** Un solo registro: `Ui.hoja(id, fn, {fase, key})`, `Ui.pantalla`, `Ui.en/emitir`. Misma key reemplaza; cada gancho en try/catch; una hoja puede cancelarse desde `antes` devolviendo `false`. `openSheet()` y `showScreen()` lo consultan; `applyModulos()`, `renderAttencion()`, `mostrarAlertaFuente()` y el guardado de personas emiten eventos (`modulos`, `atencion`, `fuente-alerta`, `persona-editada`). Se eliminó `js/core/hook-global.js` (y su `<script>`). Migrados: Alcancía (2 hojas + pantalla), foco de campos al abrir hojas (`mejoras-adicionales.js`), menú Más (`modulos`), Plata comprometida (`atencion`), Tarjetas de crédito (`fuente-alerta`, ya sin el truco de DOMContentLoaded), Préstamos (`persona-editada`).
**M1 — Personas integrado en su sitio, sin parches.** Spotify: `addSpotify`, `editarSpotify`, `guardarEditarSpotify` y `renderSpotify` ahora traen la lógica de la persona vinculada dentro (antes se re-renderizaba dos veces y el nombre se sincronizaba a posteriori). Encargos: `crearEncargo` guarda `personaId` desde el principio; `renderEncargosList` y `abrirEncargoDetalle` llaman explícitamente a `_encListaPerfiles` / `_encDetallePartes` / `_encDetallePersona`. Gastos: la validación inline de `addGastoVar`/`addGastoFijo` vive en `gastos.js` (antes eran overrides en `sheet-stack.js`); `_markError()` pasó a `core-state.js`. Se quitó el override muerto de `addSpotify` en `sheet-stack.js` (con Spotify lazy nunca llegaba a aplicarse). **Préstamos:** «Nueva persona» y «Nueva deuda» ya no son hojas: los botones abren directo el selector de personas; se borró `#sheet-nueva-persona` y su código muerto.
**Cambios de comportamiento (menores, deliberados):** al guardar un gasto variable/fijo con campo vacío ahora se marca el campo (mensaje inline) en vez de un toast; en Spotify/Encargos se renderiza una sola vez tras crear.
**M9/M11/M12 (ya hechos antes de esta parte):** paridad de la configuración Firebase y del codec de payload entre la app y el script de notificaciones (`tests/paridad.test.js`); el CSS crítico inline de `index.html` se vigila contra `css/styles.css` (`tests/critico-css.test.js`, que además detectó y corrigió una deriva real en `.toast`); higiene: se borró `hook-global-module.js` (código muerto) y se corrigieron encabezados y docs.
**Limpieza de datos viejos:** se quitó de `_ensureSpotify()` la conversión `cajitaId` → `fuenteId` (la app no migra datos de versiones anteriores; `MIGRACIONES` sigue vacía y no se agregó ninguna). Las claves de `Ui` no usan `modulo:nombre` (el smoke las confundía con `data-action`).
**Al aplicar el zip:** borrar `js/core/hook-global.js` y `js/core/hook-global-module.js` del repo (el zip no borra archivos).
**Pruebas:** `tests/ui.test.js` (registro, cancelación, reemplazo por key, aislamiento de errores y guardas: ningún `_orig` que reasigne, ni `hookGlobal`, ni `openSheet =` fuera de `sheet-stack.js`). Suite: 989/990 (solo falla el sello del SW hasta correr `npm run sellar`).
**Despliegue:** subir `js/core/ui.js` nuevo, borrar `js/core/hook-global.js`, correr `npm run sellar` y subir `sw.js`. **Probar a mano:** Spotify (agregar con persona, duplicada, editar con y sin persona vinculada, avatar con color); Encargos (crear sin persona = avisa; con persona; perfil desde la lista y el detalle); Préstamos (Me deben → Nueva persona abre el selector; Yo debo → Nueva deuda; editar una persona con su detalle abierto); Alcancía (depositar/destapar); gasto con tarjeta de crédito (aviso «se cargará a la TC»); menú Más con Spotify/Mesada apagados; gasto variable/fijo con campos vacíos.
**M2 — `PersonaPicker` (`personas.js`).** Los tres campos «¿Quién es?» (Spotify agregar, Spotify editar, Nuevo encargo) eran copias: cada una reescribía el campo con `innerHTML` al abrir la hoja y repetía su estado, su pintado y su reseteo. Ahora el HTML es estático en `index.html` y un solo componente (`PersonaPicker.crear`) maneja valor, pintado, bloqueo (editar con persona vinculada), «abrió el buscador y no eligió» y error. Se borraron `_initSpotifyPersonaSelector`, `_initSpotifyEditPersonaSelector`, `_onSelPersona*`, las variables `_spPersonaId/_spEditPersona*/_nuevoEncargoPersonaId` y las clases CSS duplicadas (`.sp-persona-btn`, `.enc-persona-btn`…, ahora `.persona-btn`). `tests/persona-picker.test.js`.
**M4 — fuentes de dinero: una sola API.** (1) `Fuente` (`core-state.js`): `parsear`, `tipo`, `esTC/esCajita/esCuenta`, `id`, `de`; los 57 `startsWith('tc:'|'cajita:'|'cuenta:')` de 12 archivos pasaron a usarla (seguros con valores no-texto) y un test impide volver a escribirlos. (2) Etiquetas con contrato explícito: `fuenteTexto(val)` SIEMPRE texto plano (ya no devuelve un `<svg>` para `'ganancia'`; ahora «Ganancia (no desembolsada)») y `fuenteHtml(val)` SIEMPRE HTML seguro; `fuenteLabel` queda como alias de `fuenteTexto`. Se eliminaron `_fuenteLabelHtml`, `_fuenteTexto` (búsqueda), `_cpFuenteLabel` y `fuenteLabel2`. (3) `opcionesCuenta` es la única API de `<option>`s de cuentas: se migraron los ~18 usos de `buildFuentesOptsHtml` (que pasó a ser el privado `_buildFuentesOpts`) y `poblarFuente` delega en ella; `opcionesCuenta` ganó `soloConSaldo`. Alcancía ya no arma un `<select>` temporal: usa `sentido:'sale'` + `preset:'ALCANCIA'` (nuevo, mismo umbral de $50) + `extra`; se borró `_alcFiltrarFuentesPorSaldo`. Se quitó el envoltorio `getFuentesOptions` de Mesada. `tests/fuentes.test.js`. **Cambios visibles:** en el buscador, el origen «ganancia» se lee «Ganancia (no desembolsada)» (antes «Ganancia»); la alcancía ofrece las cuentas con saldo **mayor a $50** igual que antes pero con el criterio ≥ $50 de `FuentesFiltro` (diferencia de 1 centavo en el borde). **Probar:** selectores de cuenta en gasto variable, registrar movimiento, agregar dinero, Mesada, Alcancía (depositar con varios orígenes), Encargos (mover/retirar/usar parte), Préstamos (me prestó), Plata comprometida; y el detalle de un movimiento con origen «ganancia».
**M10 — `Formulario` (`js/core/formulario.js`).** Un solo componente de validación inline (`Formulario.validar([{campo, mensaje, regla}])` y `Formulario.error`): marca todos los campos que fallan, enfoca el primero, crea el `<span>` de error la primera vez que hace falta y lo quita al escribir o a los 3 s. Reemplaza a `_markError` y a `_injectErrorSpans` (que creaba spans por JS al arrancar solo para 8 ids); el núcleo ya no conoce `gv_desc`/`gf_n`/`sp_n`. Gasto variable/fijo validan con él desde `gastos.js` y los planes de Préstamos con `Formulario.error` (antes solo `mov_monto`/`md_monto` tenían span: cualquier otro campo con error quedaba sin mensaje). Regla de producto escrita en `docs/guia-estilo-sheets.md`: campo → inline, operación → toast. `tests/formulario.test.js`. **Probar:** gasto variable y fijo con campos vacíos (ambos campos en rojo, foco en el primero, el rojo se va al escribir); registrar movimiento y «Yo debo» con monto 0 y con reparto que no suma.
**Pendiente de la revisión:** M8 (SW), resto de M12 y M7 (partir archivos grandes). Fuera de M4 a propósito: el constructor de opciones de Encargos «mover» sigue hecho a mano (comentado en encargos.js) y los `split(':')[1]` sueltos aún no usan `Fuente.id`.

## Revisión estructural, parte 1: avisos seguros (M6) y módulo `Fecha` (M5) (2026-11-10, SW v117)
**Origen:** la revisión estructural de noviembre de 2026 (documento ya retirado: todos sus hallazgos, M1–M12, quedaron resueltos en estas entradas) (verificada contra el código: los hallazgos M5 y M6 eran ciertos).
**M6 — `toast()` pinta texto, no HTML.** Antes el mensaje era HTML por contrato y cada llamada tenía que acordarse de `escHtml()` (65 lo hacían; las que no, eran un hueco, p. ej. el nombre de cuenta sin escapar en Spotify). Un intento de invertirlo se revirtió el 2026-08-17 porque salía `&amp;amp;`. Ahora: el mensaje va con `textContent`; el marcado deliberado entra con `html\`…\`` o `raw()` (5 sitios: Plata comprometida ×4, resumen de firebase-sync). Se quitaron los 65 `escHtml()` con un codemod sobre el AST, los validadores (`Plata.validarSalida`, `diffValidar…`) devuelven texto plano, `gastos.js` pinta el motivo con `textContent`, y se arregló un caso latente: «Reubicación desde …» en encargos guardaba el nombre escapado en el dato. Red transitoria: `_toastTexto()` decodifica solo las 5 entidades de `escHtml` por si algún texto llega pre-escapado. `tests/toast.test.js` (nuevo) + guarda que impide volver a escapar dentro de `toast(`.
**M5 — `js/core/fecha.js` (`Fecha`).** Una sola API de fechas en hora local: `hoy, iso, mes, mesKey, parsear, esValida, sumarDias, sumarMeses, diasEntre, diasHasta, nombreMes, MS_DIA`. `core-state.js` delega `hoy()`, `mesActual()`, `_fechaSafe()` y `MC`. **Bug real corregido:** Spotify calculaba próximo pago/ciclos con `toISOString()` (UTC) y `nextMonthFixed` (duplicado de `spSumarDias`); con un huso al este de UTC o la hora del equipo distinta corría un día. Migrados ~40 sitios (Spotify, Inicio, Personas, Encargos, Plata comprometida, Nu/CDT, Alcancía, Actividad, Gastos, Análisis, Wrapped, Cierre, Periodo…): un solo criterio para «faltan N días» (equivale al antiguo `Math.ceil` contra la hora actual) y desaparecen los fallbacks `typeof hoy==='function'`. `tests/fecha.test.js` (nuevo, 26 pruebas) corre en 6 husos horarios y prohíbe `toISOString().slice`, `getMonth()+1…padStart` y `86400000` sueltos. `loadApp()` precarga `fecha.js`.
**Despliegue:** subir `js/core/fecha.js` nuevo, correr `npm run sellar` (BUILD) y subir `sw.js`. Probar en el navegador: crear/editar un toast con nombre con `&` o `<`, pagar Spotify y ver «Paga en Nd», Alcancía «hace N días».
