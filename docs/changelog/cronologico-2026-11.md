# Historial cronológico (1 al 10 de noviembre de 2026)

> Entradas por fecha y versión del Service Worker, de la v85 a la v116. Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Botón de Notificaciones: respuesta inmediata y «push service error» (2026-11-10, SW v116)
**Antes:** al tocar «Notificaciones» no pasaba nada visible durante varios segundos (se esperaba al navegador y a la confirmación de Firestore) y se podía lanzar más de un registro tocando otra vez. Si fallaba, salía el texto crudo «Registration failed - push service error», que no dice qué hacer.
**Ahora:** la fila pasa a «Activando…» al instante y queda «Activadas en este dispositivo» al terminar (también al volver a abrir la app, mientras el permiso siga concedido). Un segundo toque mientras registra se ignora. Si el navegador responde «push service error», se reintenta una vez borrando la suscripción vieja del navegador y el token anterior (causa frecuente). Si sigue fallando, el mensaje dice la causa probable: Brave (activar «Usar servicios de Google para mensajería push»), iPhone (instalar la app en la pantalla de inicio), sin conexión, permiso bloqueado, clave de API de Firebase, o pistas generales (VPN, bloqueadores, incógnito, navegador desactualizado). La confirmación de Firestore se espera como máximo 3 s: la escritura ya queda en la cola local y un fallo tardío se avisa igual.
**Si ya estaban activadas**, tocar la fila no vuelve a registrar ni a mostrar «Activando…»: solo avisa «ya están activadas en este dispositivo». La marca `mf_push_ok` guarda el uid, así que otra cuenta en el mismo navegador sí se registra.
**Cómo está hecho:** `js/core/notificaciones-push.js` (`_obtenerTokenPush`, `_mensajePushError`, estado en `#cfg-notificaciones-sub`, marca `mf_push_ok`). Pruebas en `tests/notificaciones-push.test.js`.

## Respaldos automáticos diarios en la nube y en el dispositivo (2026-11-09, SW v115)
**Antes:** el único respaldo era exportar el JSON a mano. Los datos viven en UN documento de Firestore que cada guardado sobrescribe sin historial: un error o una importación mala lo dejaba dañado en la nube sin forma de volver.
**Ahora:** la primera vez que se guarda en un día nuevo, la app conserva sola una copia de lo que había (el estado con que terminó el día anterior): 30 en la nube y 7 en el dispositivo (IndexedDB, sirve sin conexión). Antes de importar un JSON o restaurar un respaldo se guarda además una copia «previa» (5 en la nube, 2 en el dispositivo), así que importar por error también se puede deshacer. En Configuración → Datos → «Respaldos automáticos» se ven con fecha y tamaño y un botón «Restaurar» que pide confirmación y el PIN y pasa por la misma validación que importar un archivo. «Borrar todos los datos» y «Eliminar cuenta» también borran los respaldos.
**Cómo está hecho:** `js/core/respaldos.js` (módulo ES puro: ids, poda, copia a la nube, almacén IndexedDB, fusión nube+dispositivo) y `_respaldarAntesDeEscribir` en `firebase-sync.js`, llamado desde `_escribirNube`. Las copias son documentos hermanos del principal bajo `usuarios/{uid}/data/` (`respaldo-AAAA-MM-DD`, `respaldo-previo-…`) más un índice `respaldos-indice` en el mismo sitio, para listar y podar con una sola lectura; viven ahí para que las reglas de Firestore que ya cubren `data/` sirvan sin tocar nada. Cada copia va en una transacción propia y con `try/catch`: **un respaldo que falla jamás impide guardar**, y si las reglas lo deniegan se avisa una vez y no se insiste. El payload se copia tal cual (ya comprimido). `configuracion.js` extrae `_reemplazarDatos` (la ruta compartida por Importar y Restaurar). `firebase-init.js` expone `collection`/`getDocs` solo para limpiar huérfanos. Diseño y decisiones en `docs/respaldos-automaticos.md`.
**Reglas de Firestore:** ya cubren `usuarios/{userId}/{document=**}` solo para el dueño, así que los respaldos no necesitaron cambios en la consola.

## Orden de las cuentas personalizable, arrastrando (2026-11-09, SW v114)
**Antes:** Efectivo aparecía siempre primero (solo porque se crea primero) y no había forma de cambiar el orden.
**Ahora:** en Cuentas, el botón «Ordenar» (solo con 2 o más cuentas) activa el modo orden: cada ficha trae un agarre ⠿ y se **arrastra** a su nuevo sitio. La ficha sigue al dedo/ratón (levantada, con sombra), las demás se deslizan en vivo a su hueco, al soltar encaja con una animación corta, y si te acercas al borde de la pantalla la lista se desplaza sola. Ratón: arranca al mover 4 px. Dedo: el agarre arranca al tocar; en el resto de la ficha, con pulsación larga (220 ms, con vibración corta), para no pelear con el scroll. Escape cancela; con el teclado, las flechas sobre el agarre mueven de a una posición. «Listo» sale del modo.
**Cómo está hecho:** `js/core/reordenable.js` (`Reordenable.activar`) es genérico y sin dependencias —solo transform durante el arrastre, el DOM no se toca hasta soltar, así que no hay saltos— y reutilizable por cualquier lista; cuentas.js lo conecta con `ordenarCuentas(ids)`. El orden es el de `S.cuentas`: lo siguen Inicio y las listas de cuentas. Las archivadas conservan su sitio; las nuevas se añaden al final; Efectivo ya no está fijado arriba (sigue sin poder archivarse ni eliminarse). No toca saldos ni el libro. Prueba en navegador real: `node scripts/arrastre/probar.js` (ratón, dedo, pulsación larga, scroll sin reordenar, teclado). SW `mis-finanzas-v114`.

## Apagar un módulo solo oculta pantallas: ya no cambia lo que cuenta como plata
**Problema:** con el módulo **Mesada** apagado, `Periodo.mesadaEntradas` devolvía vacío: la mesada que ya habías recibido y metido a una cuenta desaparecía de ingresos, balance del mes, ahorro y Wrapped, aunque el saldo de la cuenta seguía incluyéndola (descuadre entre lo que tienes y lo que dice Análisis). Spotify ya funcionaba bien (sus entradas y el gasto del plan no dependen del módulo).
**Ahora:** regla general en `periodo.js`: un módulo apagado solo oculta pantallas y avisos; ingreso, gasto y saldo salen del dato registrado. Mesada cuenta aunque esté apagada; en Análisis su desglose se muestra si ese año tiene mesada registrada. Los avisos («Cobro Spotify vencido», mesada pendiente) siguen apagándose con el módulo.
**Gastos fijos:** se eliminó la fila «virtual» de Spotify Premium (solo salía con el módulo apagado, sin botón, no sumaba a ningún total y evitaba duplicados adivinando por el nombre). El pago del plan ya se registra como gasto variable con marca explícita.

## Spotify: la cuenta se elige (cualquiera), no se adivina por el nombre
**Antes:** si `S.spotify.cajitaId` estaba vacío, Spotify tomaba la primera cajita cuyo nombre contenía «spotify» (renombrarla la perdía; dos parecidas se confundían), solo servían cajitas y no había forma de elegir. Gastos decidía si «Spotify Premium» ya estaba pagado buscando «spotify» en la descripción.
**Ahora:** `S.spotify.fuenteId` ('cajita:ID' o 'cuenta:ID'; `cajitaId` viejo se convierte solo). Sirve CUALQUIER cuenta activa que no sea de ahorro (Efectivo, Nequi, un banco…) o cualquier cajita; siempre hay dónde elegir. El botón «Elegir/Cambiar» va junto al título de la fila (no agranda la fila) y abre el sheet `sp-fuente`; si aún no hay elección y existe UNA sola cajita con «spotify» en el nombre, se preselecciona como sugerencia (hay que pulsar Guardar). Eliminar la cajita elegida o archivar la cuenta la deja «sin elegir». Las acciones `spotify:abrirElegirFuente/guardarFuente` están en el primer `registerAll` del módulo. Gastos usa la marca `_origenSeccion === 'Spotify'` (y se quitó la fila virtual, ver abajo).

## Piezas de pantalla únicas: confirmar eliminación y estados vacíos
**Antes:** unos 25 diálogos «¿Eliminar…?» escritos a mano con redacción, botón y aviso de «no se puede deshacer» distintos; nombres escapados con `escHtml` dentro de un diálogo que pinta con `textContent` (un «Pérez & Cía» salía como «Pérez &amp; Cía»); el aviso de borrar un ingreso comprometido mostraba el código `<svg …>` como texto y un `confirm()` nativo de respaldo; y 20+ estados vacíos armados a mano con clases propias (`pr-vacio`, `nu-vacio`, `feed-empty`, `an-vacio-*`…) y a ratos mezclados con `emptyState()`.
**Ahora:** `confirmarEliminar()` y `avisarNoSePuede()` (sobre `dialogo()`), `emptyState()` con opciones (`compacto`, partes opcionales) y `emptyInline()` en `core-state.js`. Todos los módulos los usan; el color del botón del diálogo va por clases CSS; `#dialog-msg` respeta saltos de línea; se eliminaron ~25 clases CSS que quedaron sin uso. Nuevo `tests/estados-vacios.test.js` impide volver a armarlos a mano.
**Cambio visible:** el aviso de «no se puede deshacer» ahora va siempre al final del mensaje; los avisos de vacío comparten tipografía y espaciado (los del feed siguen más grandes); «Sin CDTs», «Sin meta», «Sin tarjetas» y la proyección sin datos usan el mismo bloque con icono.

## Validación de saldo única (`Plata.validarSalida/validarSalidas/resumenSalida`)
**Antes:** cada pantalla tenía su propia regla (estricta, tolerancia $0,50, solo comparar contra una fila…) y su propio mensaje; Préstamos y Plata comprometida no validaban nada y podían dejar una cuenta en negativo; en plata dividida cada fila se validaba sola.
**Ahora:** una sola función en `core-state.js` (centavos, mensaje único, escapado) y `validarSalidas` que suma por fuente. Se eliminó `validarSalidaFuente`. Migrados: Gastos (variable, dividido, fijo), Spotify, Alcancía, Nu (movimiento y CDT), Cuentas (transferir), Préstamos (simple y dividido, antes de mover nada) y Plata comprometida (crear destino y «Marcar pagos», todo o nada). **Cambio visible:** los avisos pasan a «Saldo insuficiente en X. Disponible: $N»; Alcancía/Encargos/Prestado conservan sus avisos específicos de «solo hay $X de este encargo» (otro concepto).

# CHANGELOG — mis-finanzas

Historial de bugs corregidos, código eliminado por diseño y decisiones de limpieza, por módulo. La documentación de cada módulo (`mesada.md`, `spotify.md`, etc.) se enfoca en cómo funciona *hoy*; el detalle de qué estaba mal antes y cómo se arregló vive acá, para no inflar los documentos principales.

---

## Efectivo permanente, administrar cuentas de ahorro y selector uniforme (2026-11-07, SW v113)

- **Selector:** todas las cuentas van en una sola grilla de tarjetas (antes «Efectivo» salía como pastilla aparte y dejaba un hueco); si la cantidad es impar, la última ocupa el ancho completo.
- **Efectivo permanente:** `asegurarEfectivo()` (en `refresh()`) crea la cuenta Efectivo si falta; `esCuentaFija()`; no se archiva ni se elimina, sí se renombra. Ya no se ofrece como tipo ni preset al crear.
- **Administrar cuentas de ahorro:** el detalle de ahorro no tenía editar/archivar/eliminar; ahora usa el mismo bloque (`_pintarAdministrarCuenta`) que el detalle simple.
- **Caja Social:** logo oficial (SVG multicolor) con rojo `#E2222E` y azul `#008FD1`.

---

## Cuentas sin cuentas fijas: modelo único y cuentas de ahorro (2026-11-07, SW v113)

Ver `cuentas.md` y `nu.md`.

- **Causa raíz:** Nequi, Efectivo y Nu estaban cableadas en el código (`CUENTAS_FIJAS`, `S.nuRate`, claves `nequi`/`nu`), así que quien usa otro banco (p. ej. Caja Social) cargaba cuentas que no usa y no podía cambiar de banco.
- **Ahora:** `S.cuentas` empieza vacío; fuente `cuenta:ID`; tipos `banco|billetera|efectivo|ahorro`; catálogo de bancos como presets; archivar en vez de borrar (se elimina solo lo que no tiene uso); onboarding de primera cuenta; tiles de Inicio dinámicos.
- **Nu → cuenta de ahorro genérica:** tasa EA e historial por cuenta, cajitas con `cuentaId`, chequeo rápido por cuenta, varias cuentas de ahorro posibles.
- **Bugs de paso:** `CuentaPantallas` no estaba declarada fuera del harness permisivo; `Salud.puntaje` asumía `cuentasAhorro`.
- `SCHEMA_BASE` 10 (sin datos previos que migrar). Tests migrados + 17 nuevos (`cuentas-modelo-unico`).

---

## Salud financiera sin historial y tarjeta rediseñada (2026-11-06, SW v112)

Ver `salud-financiera.md` («Rediseño de la tarjeta…») y `analisis-financiero.md`.

- **Bug:** con un saldo inicial gastado en dos días y sin ingresos anotados, Análisis mostraba balance `−$2.000.000` en rojo y «el patrimonio bajó $2.000.000», mientras Inicio decía «Estable»: el estado caía al último `else` sin tener base. Ahora hay estado neutro «Empezando» y ninguna conclusión de flujo sin base.
- **Bug:** un mes con gastos y sin ingresos registrados contaba como déficit (racha, pilar Flujo, resumen de 6 meses, plan de deudas). Nueva regla única `Periodo.balanceEvaluable`.
- **Bug:** el consejo del CDT salía sin gasto típico y podía dejar la reserva bajo 3 meses; el consejo de deuda mandaba a Préstamos aunque fuera de tarjeta.
- **Quitado:** franja `#inicio-franja-estado`, consejo «Registra las categorías», línea de runway de la tarjeta, textos genéricos de relleno.
- Tests: franja y «Sin base» actualizados; nuevos casos del saldo inicial, `tieneBase`, destinos y Análisis neutro.

---

## Sync con `rev`, extraordinarios, cierres y patrimonio cayendo (2026-11-06, SW v111)

Origen: `mejoras-mis-finanzas.md`, que seguía listando como pendientes cosas ya hechas (A1–A4, A9, B1, B5, B7, P8/P9 estaban resueltas en v95–v110); se comprobó cada punto contra el código antes de tocarlo. Pruebas: **823** (11 nuevas).

- **Sync sin depender de relojes (`rev`).** Era cierto: el guardado era `setDoc` sin comparar nada y el listener decidía por `updatedAt` del cliente con 5 s de margen. Ahora el documento lleva `rev` (entero, +1 por guardado) y `window._revNube` recuerda la que este dispositivo ya aplicó. El guardado se hace con `runTransaction` (lectura + escritura atómicas) y **solo se acepta si la nube sigue en esa revisión** (`_escribirNube`, `firebase-sync.js`).
  - Conflicto (otro dispositivo guardó antes): **no se pisa**. Se carga la versión de la nube, se avisa, y lo local descartado queda en `localStorage.mf_conflicto` (`{ts, payload}`; `window._fbConflictoGuardado()` lo devuelve). El cierre de sesión no cierra si hubo conflicto.
  - Listener: con `rev` manda la revisión (aunque el otro reloj esté atrasado); un documento sin `rev` cuenta como 0 y usa la regla antigua por hora. Si llega una actualización con cambios locales sin guardar, se guarda copia en `mf_conflicto` y se avisa.
  - Sin conexión la transacción falla de inmediato: se cae a `setDoc` (cola local de Firestore), como antes.
  - `_fbSaveToCloud({ forzar:true })` (importar backup) y `borrarTodo` escriben a propósito sobre la nube y suben la revisión (`window._fbEscribirDoc(payload, ts, true)`). El guardado de `beforeunload` (core-state.js) escribe `rev+1` directo.
  - Límite: sigue siendo un solo documento por usuario; no hay fusión entre dos versiones, gana la de la nube y la local queda como copia.
- **Ingreso típico sin extraordinarios.** `Periodo.ingresoPromedioPrevio` ya no cuenta los ingresos marcados «extraordinario» (`ingresosPorMes(estado, { sinExtra:true })`); un aguinaldo ya no sube `ingresoRef`. El total real del mes no cambia.
- **Marcar un ingreso ya registrado.** En el detalle de un movimiento (entrada real de `S.movimientos`) hay un botón «Marcar como extraordinario» / «Quitar la marca» (`core:toggleExtraordinario`, `movimientos.js`). No mueve plata.
- **Cierres mensuales al eliminar.** `quitarDeHistorial` ahora también ajusta `S.patrimonioCierres` desde el mes del movimiento en adelante (antes los meses ya podados de la serie diaria quedaban con el valor viejo).
- **«Patrimonio cayendo N meses»** (B6-2). `Salud.mesesCayendo(cierres, mesActual, { gastoTipico })` (pura): meses completos seguidos en que el cierre bajó, descontando `base` (aperturas) y con un ruido de `UMBRALES.salud.patrimonioCayendo.ruidoGastoPct` (10 % del gasto típico). Regla `patrimonio-cayendo` en «Necesita atención»: ámbar desde 2 meses, rojo desde 3.
- Prueba existente adaptada: `borrar-todo-pin` simula `_fbEscribirDoc` (carga solo configuracion.js).
- **Para probar:** (1) abrir la app en dos pestañas con la misma cuenta, editar en la A y guardar, editar en la B sin esperar el aviso: al guardar B debe salir «Otro dispositivo guardó antes que tú» y cargar lo de A. (2) Ingresos → abrir uno → «Marcar como extraordinario»: el ingreso típico del Inicio baja. (3) Importar backup sigue funcionando sin avisar conflicto.
- **Antes de desplegar:** `node scripts/sellar-sw.js` (el BUILD de `sw.js` no está resellado: faltaban `icons/` y `css/` en el entorno donde se hizo).

---

## Tests agrupados por sección (2026-11-06, sin cambio en la app)

- 20 archivos de prueba → 9: `finanzas.test.js`, `cierre-wrapped.test.js`, `sesion-y-despliegue.test.js` e `interfaz.test.js` agrupan los que eran pequeños y afines; `nucleo`, `cuentas`, `libro`, `prestamos` y `mesada` siguen aparte. Cada archivo anterior es ahora un `describe` con el mismo nombre (mismo patrón que ya usaban `libro` y `sync`). Mismos 812 tests, mismo resultado.
- Referencias en docs, scripts y `subir.sh` actualizadas. Las entradas antiguas de este changelog conservan los nombres de la época.

---

## «Apartar $X» en el plan de deudas (2026-11-06, SW v110)

- Nuevo `PlanDeudas.pagoPosible({ deuda, disponible, gastoTipico, mesesReserva, rendimientoEA })` (puro, `plan-deudas.js`): cuánto de la deuda más cara se puede pagar **ya** sin bajar de la reserva (3 meses de gasto típico), en múltiplos de $1.000, con el ahorro mensual de intereses (descontando lo que dejaría de rendir esa plata).
- La tarjeta «Plan de salida de deudas» (Inicio) muestra una línea y un botón «Ir a pagar» (lleva a Tarjetas o Préstamos). **No guarda nada nuevo**: no hay concepto de «apartar» ni dato extra.
- Qué plata cuenta: cuentas + cajitas + CDT vencidos, menos plata ajena. **La Alcancía nunca entra** (está oculta a propósito) y los CDT sin vencer tampoco. Por eso la línea dice «con lo que tienes en tus cuentas y cajitas»: si tienes ahorro en un lugar que la app no ve (o en la Alcancía), la sugerencia no lo sabe; si ya tienes esa plata en una cajita, sí la ve y la cuenta.
- No aparece si: la deuda no tiene tasa E.A., no hay gasto típico (no hay cómo medir la reserva), la cajita rinde igual o más de lo que cuesta la deuda, o no sobra nada sobre la reserva.
- Pagar con efectivo no cambia la liquidez neta (baja el efectivo y la deuda a la vez); lo que se gana son los intereses.
- Tests: 2 nuevos (función pura y la tarjeta del plan). 811 + 1.
- Para probar: tener una tarjeta con tasa E.A. y ahorros por encima de 3 meses de gasto → aparece la línea; bajar el saldo de las cuentas → desaparece.

---

## A10 (resto): seguridad de Firebase revisada (2026-11-06, solo docs)

- Reglas de Firestore verificadas (solo el dueño accede a `usuarios/{uid}`) y Authentication con solo Google activo. App Check queda sin activar a propósito (ver `mejoras-mis-finanzas.md`). No cambia la app ni el SW.

---

## A11: candado contra `innerHTML` sin escapar (2026-11-06, sin cambio en la app)

- `tests/innerhtml.test.js`: falla si aparece un `x.innerHTML = \`…${…}…\`` nuevo sin la etiqueta `html\`\``. Los 12 casos existentes se revisaron: solo interpolan números (`fmt`), clases/íconos internos o texto ya escapado con `escHtml()` (`toast()` recibe HTML por contrato). La cantidad por archivo queda fijada.
- No hace falta subir versión del service worker (solo tests y docs).
- Descartado a propósito: bundler/esbuild (no urgente, la app no lo necesita hoy).

---

## A9 (resto): `calcHealthScore` partido (2026-11-06, SW v108)

- El cálculo del puntaje (los 7 criterios a–h, consejos tipados, orden por urgencia) ahora vive en `Salud.puntaje(e)` (`js/core/salud.js`): **puro**, sin DOM, sin `window` ni `S`; corre igual en Node, así que Wrapped, el cierre de mes o el push pueden usarlo.
- `calcHealthScore()` en `inicio.js` queda como adaptador: junta las métricas con las definiciones únicas (`Periodo.*`, `calcLiquidez`, `calcPatrimonioVisible`…) y llama a `Salud.puntaje`. Misma salida de antes (`score, tips, consejos, sinDatos, ingresosMes, rendimientoCDTMes, mesesCubiertos, rachaDeficit`); no cambió ningún número ni texto (los 806 tests de comportamiento previos pasan sin tocarse).
- Test nuevo en Node puro (`tests/salud.test.js`).
- Para probar: Inicio → tarjeta de salud: puntaje, etiqueta y consejos iguales que antes.

---

## A3-2: `Reversibles` (2026-11-06, SW v107)

- Nuevo en `core-state.js`: `Reversibles.registrar({ tipo, proteccion(ref, ctx) })` y `Reversibles.proteger(tipo, ref)`. Cada tipo declara `{ fecha, ops, modulo, nombre, monto, direccion, campo?, dialogo? }`; el registro aplica `nivelAntiguedadMovimiento` (bloqueado → aviso; viejo → confirmación estándar o la propia del tipo) y devuelve `{ ok, confirmado }`.
- `movimientos.js`: el bloque de ~100 líneas con un `if` por tipo en `eliminarMovimiento` ahora es una sola llamada; los tipos `mesada`, `transferencia`, `salida_manual`, `ingreso/apertura/entrada` y `gasto` (TC, cuenta única y dividido) se registran al final del archivo. `deleteGastoVar` (gastos.js) usa el mismo registro, así que ya no hay dos copias de la regla del gasto.
- Un módulo nuevo se integra registrándose; no hay que tocar los puntos de borrado. Lo que NO se migró: la reversión en sí (el `switch` que devuelve la plata) y los flujos propios de préstamos, encargos, Spotify, Alcancía y plata comprometida, que ya traían su protección en su módulo.
- Para probar: borrar un gasto, transferencia, salida e ingreso recientes (confirma normal), uno viejo (aviso con monto) y uno muy antiguo (bloqueado), desde la cuenta y desde Gastos.
- Test nuevo del contrato (808).

---

## A2 + A4: `opcionesCuenta` y API del diferencial (2026-11-06, SW v106)

- **A4 — Diferencial:** `diffRegistrarInstancia(inst, cfg)` ahora devuelve la API (`toggle, addParte, removeParte, setNombre, setMonto, togglePagoYo, setCuentaSalida, setCuentaEntrada, resumen, validarIntercambios, estaAbierto, reset`). Se eliminaron **22 envoltorios** de una línea en `encargos.js` (movenc, usarParte, ctc) y `prestado.js` (prestamoDif, prtc), con sus referencias. Ojo para probar: el bloque «dijiste / real» (diferencial) en pago de encargo, usar parte de encargo, cobro de TC y préstamos.
- **A2 — «¿De qué cuenta?»:** nueva `opcionesCuenta({ sentido, preset, tarjetas, soloDe, mostrarSaldo, placeholder, placeholderDeshabilitado, sinOpcionesTexto, extra, selectedVal })` en `core-state.js` (sobre `buildFuentesOptsHtml` y `FuentesFiltro`; escapa todo). `crearSplitWidget` acepta `fuentes: {…}` (o función que lo devuelve) en lugar de escribir `getFuentesFn`. Migradas 8 funciones de `<option>`s: gastos, spotify (cobro y pago), préstamos (nuevo préstamo con «Ganancia», abono destino, mov. de deuda propia, abono a encargo) y encargos (usar parte, mov. de encargo). Queda aparte `_moverEncGetFuentesOptions` (HTML a mano a propósito, ver su comentario) y `mesada` (no es un split).
- `soloDe: []` significa «ninguna cuenta» (encargo sin plata) y `null` «todas»; así se conserva el comportamiento que tenía cada pantalla.
- `diferencial.js` y `split.js` usan `var` para sus tablas de instancias (cargarlos dos veces en tests no falla); los loaders de tests los cargan antes de encargos/prestado.
- Tests: 2 nuevos (`opcionesCuenta` y `fuentes` declarativo).

---

## A1: `crearSplitWidget` devuelve la API; fuera 37 envoltorios (2026-11-05, SW v105)

- `crearSplitWidget(inst, cfg)` ahora **devuelve** `{ toggle, addRow, data, reset, preview, instId }`. Cada módulo la guarda (`const _sp_prest = crearSplitWidget('prest', …)`) y llama `_sp_prest.data()` en vez de tener `splitGetData('prest')` envuelto en una función propia.
- Migradas **gastos** (3 envoltorios), **spotify** (6), **préstamos** (10) y **encargos** (14): se borraron 33 funciones de una línea y sus referencias (registros de `Events`, listeners) apuntan a la API. Los nombres de acción de `data-action` no cambiaron.
- `split.js` usa `var _splitInstancias`, así que cargarlo dos veces (tests con varios cargadores) ya no falla; los loaders de los tests cargan `split.js` antes de gastos/spotify/prestado/encargos.
- No migrado (no tenían envoltorios, solo lambdas en un listener): `mesada`, `analisis` (`cb`), `alcancia`, y la fábrica `_crearSplitSobrante` de encargos.
- Test nuevo: la API completa de `crearSplitWidget`.
- **Para probar en el navegador:** dividir entre cuentas en Gasto, pago de Spotify, nuevo préstamo, abono a un préstamo, mover/usar parte de un encargo.

---

## Tasa E.A. en «Yo debo» (2026-11-05, SW v104)

- «Editar deuda» (Yo debo) tiene el campo opcional **Tasa E.A.** (0–100 %, vacío = sin intereses). Se guarda como `tasaEA` en la deuda y entra al costo mensual y al plan de salida (`_deudasPropias`). Test `P2`.

---

## Sugerencia de presupuesto por categoría (2026-11-05, SW v103)

- En el editor de presupuestos, cada categoría con historial muestra «Sueles gastar ~$X · usar»: un toque rellena el campo (promedio de los últimos 3 meses con gasto, redondeado a la decena de miles, **sin compras grandes**). `Periodo.gastoPromedioPorCategoria(mes, n)` (nuevo). No guarda nada hasta que cambias el campo, igual que antes.
- Test con compra grande marcada (`grande:true`) que no entra al promedio.

---

## Push de gastos fijos (2026-11-05, SW v102)

- La regla `gastos-fijos` ahora también es del canal **push**: «Arriendo vence en 2 días ($900.000)», «Internet venció hace 1 día…». Sin `api` (el push corre en Node, sin Periodo ni core-state) la regla calcula desde `S` con `_gastosFijosProgramadosDeS`: clave de pago `<id>_AAAA-MM`, día recortado al último día del mes, mes actual + siguiente. Lo vencido hace **más de 7 días** no se repite cada día en el celular (en la app sí se sigue viendo). La brecha de caja a 30 días sigue siendo solo de la app.
- Test anti-deriva: el cálculo desde S coincide con `Periodo.gastosFijosProgramados`. Actualizados los tests que fijaban la lista de reglas del push. `docs/notificaciones-push.md` por actualizar con el nuevo aviso (ver abajo).

---

## Ingreso extraordinario (2026-11-05, SW v101)

- Los dos sheets de «Agregar dinero» tienen la casilla **«Es extraordinario (no se repite)»** (aguinaldo, venta, premio). La entrada guarda `extraordinario:true` (campo nuevo del movimiento; no aplica a saldos iniciales).
- `Periodo.balanceDelMes` devuelve `ingresosExtra` y `balanceRecurrente` ahora también lo descuenta: un mes con aguinaldo que tapa el déficit sigue contando como déficit para la racha y el flujo habitual. `balance` (real) no cambia.
- Análisis: el balance del mes dice «Incluye $X de ingresos extraordinarios · sin ellos, tu balance fue …».
- Limitación: el ingreso típico (`ingresoPromedioPrevio`) sigue incluyendo lo extraordinario; no hay forma aún de marcar uno ya registrado.
- Test: `B5` (extraordinario).

---

## Presupuestos con ritmo y «¿pagar o ahorrar?» (2026-11-05, SW v100)

- **Presupuestos:** cada uno muestra «A día 10 ya llevas 70 % (lo esperado: 33 %)» cuando vas 15 puntos o más por delante del mes (desde el día 5, y solo si aún no te pasaste). `Periodo.ritmoPresupuesto` (pura). Además, aviso si la **suma de presupuestos supera tu ingreso típico** (promedio de 3 meses).
- **Plan de deudas:** línea con `PlanDeudas.pagarConviene`: «Tu cajita rinde 9 % y «Visa» cuesta 28 %: pagarla con lo ahorrado te sale a favor» (o lo contrario). Solo si hay tasa en la tarjeta y tasa de Nu.
- Tests: `P-presup`, `P3`.
- **Sigue pendiente:** sugerir en el editor de presupuestos el promedio de 3 meses por categoría, tasa para «Yo debo», «Apartar $X», ingreso extraordinario, push de gastos fijos y los refactores A1/A2/A4/A3-2.

---

## Simulador «¿y si…?» y consejos con acción (2026-11-05, SW v99)

- **P8 — Simulador** en Análisis (`#an-simulador`, `renderSimulador`): tres deslizadores (gastar −0…30 %, ingresar +$ al mes, pagar $ a las deudas propias) que recalculan balance mensual típico, meses de reservas, tiempo para salir de deuda y ahorro de intereses (con la tasa E.A. de las tarjetas). Cálculo puro en `Salud.simular(m, ajustes)` sobre las mismas métricas de `_situacion()`; no guarda nada. Pagar deuda no cambia la liquidez neta (baja efectivo y deuda a la vez) y el simulador lo refleja.
- **P9 — Consejos con acción:** todos los consejos de alerta/aviso del puntaje (reservas, deudas, tarjetas, prestado, déficit) llevan ahora `ir` (cuentas, tarjetas, prestamos, gastos o analisis) y se pintan como botón con flecha. Test que lo garantiza en tres escenarios difíciles.
- Tests: `P8`, `P9`.

---

## Wrapped honesto y cierres mensuales de patrimonio (2026-11-05, SW v98)

- **`S.patrimonioCierres`** (nuevo, sin límite): `{ 'AAAA-MM': {valor, valorVisible, base} }`, el último valor de cada mes y la suma de sus aperturas. Se rellena en cada `snapshotPatrimonio()` desde la serie diaria (también meses previos a esta versión) y un mes cuyos días ya se podaron conserva su cierre. Clasificada `historica` en `cierre.js` y con su fuente descrita.
- **Wrapped** mide el año completo con el cierre de diciembre anterior (antes, a mediados de enero la serie de 365 días ya no tenía el 1 de enero). Sin ese cierre usa la serie diaria como siempre.
- **«Balance honesto»** (`_wrappedAnioDificil`): si el año cierra con patrimonio negativo, o cayó con gastos sobre ingresos, o hubo gastos sin ningún ingreso registrado, la portada cambia a un tono sobrio («Un año exigente, contado sin maquillaje») y el cierre no lanza confeti. Los números y demás diapositivas no cambian.
- **Análisis:** en estado Presión o Crisis, el balance del mes añade una línea que pide priorizar deudas y gastos fijos.
- Limitación: si se elimina un movimiento viejo, `purgarEfectoEnHistorial` corrige la serie diaria pero no los cierres de meses ya podados.
- Pendiente de B7: opción de no abrir/guardar en silencio el Wrapped de un año malo.
- Tests: 3 nuevos en `escenarios-financieros`.

---

## Análisis: ventana de patrimonio, frase-resumen, ingreso+gasto y racha (2026-11-05, SW v97)

- **Gráfica de patrimonio** con selector 30 días / 90 días / 1 año (por fecha, no por número de registros) y una **frase-resumen** debajo con la causa principal (`Salud.fraseTendencia`, pura): «Tu patrimonio bajó $X en los últimos 3 meses. La causa principal: gastaste $Y más de lo que ingresó». La ventana es solo de vista (no se guarda).
- **Barras de 12 meses** ahora muestran gasto (barra principal) e ingreso (azul) juntos, con tooltip de los dos, y debajo «Últimos 6 meses: N en superávit, M en déficit · acumulado ±$X».
- `Periodo.resumenFlujo(n, hasta)` (nuevo): ingreso, gasto y balance por mes + conteo y acumulado; un mes sin movimiento no cuenta.
- Tests: 2 nuevos en `escenarios-financieros`; el loader de `historial-patrimonio` carga `umbrales.js` y `salud.js`.
- **Pendiente de B5:** ingreso recurrente vs extraordinario (casilla en ingresos).

---

## «Sin base» y franja de estado bajo el hero (2026-11-05, SW v96)

- Salud: con saldos pero sin historial (sin gasto típico, sin meses completos, sin tendencia) la tarjeta dice **«Sin base»** en gris, con una línea que explica por qué, en vez de un «Regular» de piso.
- Inicio: nueva **franja bajo el hero** (`#inicio-franja-estado`) con el estado (Creciendo / Estable / Atención / Presión / Crisis) y su frase. Se pinta con `Refresh` (`inicio-franja-estado`). Oculta sin datos.
- `calcEstadoSituacion()` (inicio.js) devuelve el estado con `serio` (presión o crisis) para que otras pantallas ajusten el tono. **Pendiente:** que Análisis y Wrapped lo usen (va con B7).
- Tests `B3` y `P1`.

---

## Liquidez: neta vs. peor caso, saldo a favor aparte (2026-11-05, SW v95)

- `calcLiquidez()` ahora devuelve `tcTotal`, `saldoAFavorTC` y `netaPeorCaso` (= libre + CDT vencidos − deuda TC completa − Yo debo − ajeno), además de `neta` (que solo resta la parte propia de la tarjeta). `netaPeorCaso ≤ neta` siempre.
- Inicio: la línea «Neto de TC» pasó a «Neto de tarjetas» y muestra «Saldo a favor en tarjeta» como dato aparte (no cuenta como disponible). Si solo hay saldo a favor, la línea lo muestra sin restar nada.
- `docs/cuentas.md`: GMF 4×1000 y comisiones quedan documentados como limitación conocida.
- Test `B1` en `escenarios-financieros.test.js`.

---

## Reglas unificadas, pilares de salud, plan de deudas y cimientos de despliegue (2026-11-05, SW v94)

Origen: `mejoras-mis-finanzas.md`. Cada punto se comprobó en el código antes de tocarlo. Pruebas: **787/787** (51 nuevas: `reglas`, `salud`, `plan-deudas`, `refresh`, `sw-sellado` y escenarios de B6/P3/P6); `generar-mapa.js --check` y `npm run smoke` (la página real en jsdom) en verde. Nada de esto se probó en un navegador con datos reales: lo visual (pilares, plan de deudas, tarjeta de conciliación, aviso de versión) está verificado por jsdom y por lectura.

### Cimientos
- **A6 — fechas, resuelto.** `_fechaSafe(f, hora)` acepta una hora local y el sufijo `T…`; las 7 lecturas `new Date(x + 'T12:00:00')` (`wrapped.js`, `alcancia.js`, `configuracion.js` ×2, `actividad_reciente.js`, `cierre.js` ×2) pasaron a `_fechaSafe(x, 12)` y la guarda de `nucleo.test.js` ahora prohíbe también `T12:00:00`.
- **A8 — umbrales de Wrapped, resuelto.** Ventana (31 días), mínimos de datos (30 días / 3 meses), caídas y crecimientos (−5/−15 %, +15/+50 %), tope ±300 %, 70 % de «una compra explica la caída» y 70/30 de «fase» viven en `UMBRALES.wrapped`. `wrapped-gate.js` y `wrapped.js` los leen de ahí. Los tests cargan `umbrales.js`.
- **A7 — `Refresh.registrar(id, fn, { pantalla, orden })`.** `refresh()` ya no es una cadena de parches: el cuerpo de siempre es `_refreshNucleo()` y después corre un registro. Cada parte va en su `try/catch` con log (una que falle ya no silencia a las siguientes), el mismo `id` reemplaza (un módulo lazy cargado dos veces no se duplica) y `pantalla` permite no renderizar lo que nadie ve. Migrados los 7 parches (`inicio`, `encargos`, `actividad_reciente`, `mejoras-adicionales`, `gastos-fijos-progress`, `plata_comprometida`, `pin-bio`). Se eliminó `hook-global-module.js` (su único importador era `pin-bio.js`). Una guarda impide volver a parchear `window.refresh`. Las partes sin `pantalla` conservan el comportamiento anterior (corren siempre).
- **A10 — Service Worker sellado.** `scripts/sellar-sw.js` calcula un SHA-256 (12 caracteres) de `index.html`, `manifest`, `css/`, `js/` e `icons/` y lo escribe en `sw.js` (`const BUILD`). La caché se llama `VERSION-BUILD`: **aunque se olvide subir `VERSION`, un cambio en cualquier archivo desplegable renombra la caché**. `tests/sw-sellado.test.js` (dentro de `npm test`) falla si el sello quedó viejo: **antes de desplegar, `node scripts/sellar-sw.js`**. Además, al activarse un SW nuevo en una pestaña ya abierta aparece la barra «Hay una versión nueva · Actualizar» (no recarga sola para no perder lo que se esté escribiendo; no sale en la primera instalación).

### A9 — una sola lista de reglas de alerta
- **`js/core/reglas.js` (puro, corre en Node).** `Reglas.registrar({ id, canales, evaluar(ctx) })`; canales `atencion` y `push`. «Necesita atención» (`renderAttencion`) ahora solo arma los *hechos* (`_ctxReglas()`) y pinta lo que devuelve `Reglas.evaluar('atencion', ctx)`; los textos son plano y los escapa `html\`\``. `scripts/notificaciones/checks.js` **ya no tiene copia propia**: importa `reglas.js` (`../../js/core/`, así que el workflow debe hacer checkout del repo completo, que es lo normal con `actions/checkout`). Hay una prueba de **paridad**: Atención y push dicen exactamente lo mismo en las reglas compartidas (Spotify, CDT, encargos).
- Las funciones de runway (`_mesesCubiertos`, `_nivelRunway`, `_fmtMeses`, `_textoRunway`, `_rachaDeficitRelevante`) se definen ahora en `Reglas`; en `inicio.js` quedan como envoltorios de una línea para no tocar a sus llamadores.
- **Cambio visible en el push:** el aviso de encargos ahora dice «… es hoy — esa plata ya está comprometida» / «venció hace Nd sin usarse — sigue comprometida» (el texto de Atención; antes el push tenía una versión más corta). El aviso de CDT y de Spotify no cambia.
- **Límite conocido:** las reglas que necesitan cálculos de la app (liquidez, calendario de caja, saldos de deudores) no corren en el push, porque el script solo tiene `S`; sin `api` se callan. Subirlas exigiría que `periodo.js`/`core-state.js` corran sin navegador.

### B6 — alertas que faltaban
- **Patrimonio negativo** entra a la lista de Atención (rojo, con enlace a Análisis).
- **Gasto fijo sin día de vencimiento:** «Ya es 27 y el arriendo aún no está pagado este mes» desde el día `UMBRALES.atencion.gastoFijoSinDiaDesde` (25), solo para fijos sin día y sin pagar (`Periodo.gastosFijosSinDia`). Ámbar.
- Se dejó **fuera** «patrimonio cayendo N meses» (B6-2): el pilar de Tendencia y el estado «Atención» ya cubren la señal con una ventana de 90 días; falta la pendiente por mes natural (B4-1).

### B3 + P1 — pilares con semáforo y estado de situación (`js/core/salud.js`, puro)
- La tarjeta de Salud muestra, además del número, **cuatro pilares** (Liquidez, Deuda, Flujo, Tendencia), cada uno enlazado a la pantalla donde se actúa, y el **estado global de cinco niveles** (Creciendo / Estable / Atención / Presión / Crisis). Presión y Crisis: «Lo urgente primero» con hasta 3 acciones concretas (ver y priorizar deudas, cobrar lo que te deben, revisar gastos), sin celebración y sin ocultar cifras. Un patrimonio negativo **nunca** se muestra como «Creciendo», aunque esté mejorando.
- **Deuda mira más que la tarjeta:** el pilar usa `tcPropia + yoDebo` contra el ingreso típico *y* contra los activos líquidos, muestra los dos ratios y manda el peor. **El puntaje (criterio b) no cambia:** meter «Yo debo» ahí volvería a penalizar dos veces lo que ya penaliza la liquidez (el hallazgo N-3).
- **Tendencia:** `Salud.tendenciaPatrimonio` (90 días, sin depósitos ni retiros: `montoBase`; mínimo 30 días de historial). Con base no positiva no hay porcentaje y se compara contra un cuarto del gasto mensual típico.
- Umbrales en `UMBRALES.salud.pilares`. Escenarios en `tests/salud.test.js` y `tests/escenarios-financieros.test.js`.
- **No se hizo la «franja bajo el hero»**: el estado vive dentro de la tarjeta de Salud; moverlo bajo el hero es CSS y un contenedor nuevo, y el tono por estado en Análisis y Wrapped queda pendiente.

### P4 — runway con fecha
- La Proyección, con tendencia negativa y liquidez positiva, dice «…duraría unos 3 meses, **hasta febrero de 2027**» (`Salud.fechaAgotamiento`, mismo cálculo de antes más la fecha).

### P6 — «¿por qué cambió mi patrimonio?»
- `Periodo.conciliar(mes)` es ahora la **única** definición de la conciliación (`scripts/conciliacion.js` la usa en vez de su copia). Tarjeta nueva en Análisis (`#an-conciliacion`): «En octubre tu patrimonio bajó $430.000. Salió más de lo que entró ($180.000). Quedan **$250.000 sin explicar**: revisa movimientos sin cuenta, préstamos y ajustes». Por debajo de `UMBRALES.conciliacion.minimo` ($30.000) dice «Todo cuadra». Usa el patrimonio visible (sin Alcancía), como el hero y la gráfica.

### P2 + P3 — costo de la deuda y plan de salida (`js/core/plan-deudas.js`, puro)
- **Tasa E.A. opcional por tarjeta** (campo en el formulario; vacío = no se calcula, respeta «no simular al banco»; 0–100 %).
- **Tarjeta «Plan de salida de deudas»** en Inicio: deudas propias (la parte propia de cada tarjeta + «Yo debo»), orden **avalancha** (más cara primero; por defecto si hay alguna tasa) o **bola de nieve** (más pequeña primero; por defecto sin tasas), elegible y guardado en `S.planDeudasEstrategia`. Con balance promedio positivo: «libre de deuda en ~N meses» (simulación mes a mes con efecto cascada); con balance ≤ 0 o menor que los intereses: «con tu ritmo actual la deuda no baja: necesitarías liberar ~$X al mes para quedar libre en 24 meses». Costo mensual en intereses cuando hay tasa. `PlanDeudas.pagarConviene` (cajita 9 % vs tarjeta 28 %) está listo y probado pero **sin pantalla todavía**.
- Es una estimación: no modela cuotas mínimas, comisiones ni cambios de tasa. Las deudas «Yo debo» no tienen campo de tasa (se asume 0). No incluye aún el botón «Apartar $X para esta deuda» (no existe un mecanismo de «apartar» en la app).

---

## Cimientos de la revisión de mejoras: origen del libro, formato de pesos y fechas (2026-11-04, SW v93)

Origen: `mejoras-mis-finanzas.md`. Cada punto se comprobó en el código antes de tocarlo; dos afirmaciones del documento resultaron falsas (abajo). Pruebas: 736/736 (`tests/nucleo.test.js` y `tests/libro.test.js` ampliados); `generar-mapa.js --check` en verde.

- **A3-1 — `Libro.origen(modulo)`.** Había 11 copias de `_og*` (`_ogGv`, `_ogEnc`, `_ogSp`, `_ogMes`, `_ogTc`, `_ogAlc`, `_ogCta`, `_ogMov`, `_ogCobro`, `_ogCp`, `_og`) con la misma forma salvo que unas dejaban `rev: undefined` y otras omitían la clave. Ahora cada módulo hace `const _ogGv = Libro.origen('gastos');` y la entrada del libro no lleva claves vacías. Misma semántica (`_og(ref)` aplica, `_og(ref, true)` revierte). `_ogDif` (diferencial) no se tocó: es un objeto por llamada, no una función. Guarda estática: ningún archivo vuelve a declarar `_og*(ref…)` a mano.
- **A5 — `Dinero.fmt(n, { decimales, redondeo, signo })`.** Un solo formateador de pesos en `core-state.js`; `fmt()` y `fmtNoCents()` son atajos. Se eliminaron las dos copias con `Intl` de Proyección (`inicio.js`) y los respaldos `window.fmt || …` de `analisis.js`, `alcancia.js`, `actividad_reciente.js`, `firebase-sync.js` y `wrapped.js`. Efecto visible: ninguno (la salida era la misma); lo que cambia es que hay un solo sitio que mantener. Mejora menor: `fmtNoCents(-0.5)` ya no da «-$0». **Se descartó `compacto` ($1,2 M):** ninguna pantalla lo usa y una opción sin consumidor es código muerto. Guarda estática: ningún `js/` usa `style:'currency'`.
- **A6 — fechas.** 28 lecturas `new Date(x + 'T00:00:00')` pasaron a `_fechaSafe(x)`: `spotify.js` (15), `plata_comprometida.js` (9), `personas.js` (3), `encargos.js` (2) y `calc-helpers.js` (1); el documento solo listaba los dos primeros. Con una fecha sin ceros (`2099-1-5`) el parser ISO daba Invalid Date y toda comparación salía `false` sin avisar (ej. «¿sigue vigente el pago?»). Prueba con fechas sin ceros y guarda estática. Quedan fuera las lecturas con `'T12:00:00'` (solo visualización/diferencias de días; ver `mejoras-mis-finanzas.md`).
- **A11 — mapa de código.** `generar-mapa.js` ahora reconoce `import` estáticos y dinámicos: `hook-global-module.js`, `wait-for-module.js` y `payload-codec.js` aparecen como «módulo ES — importado por …». **Falso en el documento:** no eran código muerto (`pin-bio.js`, `firebase-sync.js` y `cierre.js` los importan); no se borra nada. El generador además normaliza CRLF/LF: con el árbol de trabajo en CRLF (Windows) las regex de declaraciones no calzaban y `--check` fallaba solo en la máquina local.
- **Falso en el documento (A5):** «la misma cifra se ve distinta según la pantalla». Proyección ya mostraba `$1.234.567` igual que `fmt()` (su `.replace` del espacio duro sí funcionaba); el problema real era la duplicación, no la cifra.

---

## Revisión de mejoras: hallazgos financieros y de estructura (2026-11-03, SW v92)

Origen: `mejoras-mis-finanzas.md` (análisis de la lógica financiera con los escenarios negativos). Cada hallazgo se **reprodujo ejecutando el código real** antes de tocarlo; los que no se reprodujeron o no aplicaban se anotan al final. Lo que sigue pendiente quedó en `mejoras-mis-finanzas.md` (ya sin lo resuelto). Pruebas: `tests/escenarios-financieros.test.js` (nuevo, 81 pruebas) + las existentes actualizadas: 729/729. `npm run smoke` y `generar-mapa.js --check` en verde. El puntaje de Salud **cambia** para varios estados (ver cada punto): es intencional.

### Salud financiera (`inicio.js`)

- **F3 — `tieneAlgo` ignoraba las deudas con personas.** Con «Yo debo» $500.000 y $100.000 en Nequi el score era 35 y `sinDatos: true`: la tarjeta decía «Registra más datos» justo en la situación más delicada. Ahora cuentan el patrimonio ≠ 0, las deudas con personas, la plata ajena, los saldos y los CDTs.
- **F4 — tener deuda de tarjeta SUMABA +5.** Mismo ahorro e ingreso: sin deuda 50, deuda de 1× el ingreso **55**, deuda de ~2,9× 42. Incentivo invertido. Ahora hasta 1,5× el ingreso no puntúa; el **+5 es para quien no tiene deudas propias** (tarjeta, «Yo debo» ni plata ajena) y tiene liquidez positiva. Orden resultante: sin deuda > deuda manejable > deuda alta.
- **N-3 — la misma deuda se penalizaba dos veces** (−15 por liquidez negativa y −15 por «tu patrimonio no la cubre», dos alertas casi iguales: tarjeta de 3 M sin ahorro → score 20). Ahora una sola alerta (score 35). *Es en parte decisión de diseño:* los dos criterios miden cosas distintas, por eso solo se evita avisar dos veces **lo mismo**; la rama «patrimonio no la cubre» sigue existiendo cuando la liquidez no es negativa.
- **N-2 — el consejo de liquidez negativa callaba la deuda cuando había un CDT.** La rama «tus ahorros están en CDTs» (−8) se evaluaba antes que `liquidoReal < 0`. Ahora la liquidez negativa se evalúa primero: con CDTs sin vencer que la cubren es un **aviso** (−8) que nombra la deuda («Tu deuda en tarjetas supera la plata que tienes disponible; lo que cubre la diferencia está en tus CDTs»); sin CDT es una **alerta** (−15). Se eliminó la jerga «patrimonio líquido» de los textos.
- **Ratio gasto/ingreso con mes parcial.** `gastosMes` (hasta hoy) ÷ ingreso de un mes completo daba ≈ 0,05 el día 3 y regalaba **+10 puntos** (gastar $50.000 → 60 vs 50 sin gastar) que se iban cayendo durante el mes; el mismo defecto ya corregido en el fondo de emergencia. Ahora el criterio (d) usa el gasto típico ÷ ingreso típico de los **meses completos**; el mes en curso solo puede decir que YA se pasó del ingreso («Por ahora estás gastando más de lo que ingresas»).
- **N1 — nada detectaba una caída sostenida.** Nuevo criterio (h): **2 meses completos seguidos en déficit −8 (aviso), 3 o más −15 (alerta)**, con `Periodo.rachaDeficit()`. No aplica sin ingreso reciente registrado (sería solo no haber anotado ingresos) ni con un fondo sólido (≥ 6 meses). Si aplica, sustituye al −10 de «ratio > 1» (no se penaliza dos veces). También aparece en «Necesita atención».
- **Runway visible.** La tarjeta de Salud muestra «Cubres 3,4 meses de gastos» (verde / ámbar < 3 / rojo < 1 mes); `calcHealthScore` devuelve `mesesCubiertos` y `rachaDeficit`.
- **Bono de CDT con liquidez negativa.** Daba hasta +10 con la alerta de liquidez negativa activa (CDT de 1 M + tarjeta de 300.000 + 100.000 en Nequi: 45 = 50 − 15 + 10). Ahora el tope baja a +3 también cuando `liquidoReal < 0` (antes solo con mucho prestado).
- **N-9 — se sugería «poner algo en un CDT» junto a «tu situación es muy vulnerable».** La sugerencia exige además que lo prestado no supere tu liquidez.
- **«Configurar la app» ya no puntúa.** (f) +5 por ≥ 2 gastos fijos y (g) −5 por una sola categoría medían uso de la app, no salud financiera. Se conserva la sugerencia de categorías como consejo.
- **Sin gasto típico:** con ahorros y sin ningún mes completo con gastos, un consejo explica por qué aún no se mide el fondo («Cuando completes un mes de gastos…»), en vez de un «Regular» mudo.
- **N-1 — el ingreso de referencia era un «fantasma».** `ingresoPromedioPrevio` tomaba los últimos 3 meses *con ingreso* sin importar cuándo fueron: con ingresos de hace 10–12 meses y 4 sin cobrar, la referencia seguía en 4 M, los ratios puntuaban contra plata que ya no entra y desaparecía «Registra tus ingresos». Ahora ambos promedios (ingreso y gasto) se limitan a los **últimos 6 meses calendario** (`Periodo.VENTANA_REFERENCIA_MESES`).
- **Umbrales centralizados:** `js/core/umbrales.js` (`UMBRALES`, congelado a fondo) con los límites de Salud, runway, Atención, gasto alto, hero y Proyección. Los puntos de cada criterio siguen en `calcHealthScore`. Los helpers `_mesesCubiertos`, `_nivelRunway`, `_textoRunway` y `_rachaDeficitRelevante` los comparten Salud y Atención (una sola definición).

### Núcleo (`core-state.js`, `nu-calc.js`, `periodo.js`)

- **N-5 — un saldo a favor en una tarjeta (`tc.deuda < 0`) sumaba como activo:** `deuda −500.000` con 100.000 en cuentas → patrimonio 600.000 y liquidez 100.000 (`_renderDispNetoTC` sí lo recortaba). Ahora `Math.max(0, deuda)` por tarjeta. El flujo normal de pagos nunca deja la deuda negativa (se recorta en 0): solo ocurría con datos importados o editados a mano.
- **N-6 — un CDT sin `tasa` dejaba el patrimonio en `NaN`** y `snapshotPatrimonio` dejaba de grabar el historial sin avisar (otra puerta al mismo fallo del CDT con fecha sin cero). `_tasaCDT()` toma 0 % (capital sin rendimiento) y deja una advertencia por CDT en consola.
- **N-7 — un CDT ya vencido seguía fuera de la liquidez:** con 20 M vencidos y nada en cuentas, la liquidez neta era 0 y el consejo decía «tus ahorros están en CDTs» (Atención sí avisaba «venció — ¡libera tu plata!»). Nuevo `cdtVencido()` (desde el día siguiente al vencimiento, la misma regla del aviso); `calcLiquidez()` los suma a `neta` y devuelve `cdtsVencidos` y `cdtsBloqueados`; `conCDTs = neta + cdtsBloqueados` (igual a `libre + cdts − obligaciones`).

### Proyección (`inicio.js`)

- **F1 — los negativos se mostraban como `$0`.** Patrimonio −200.000 bajando 150.000/mes: las tarjetas a 3/6/12 meses decían `$0 $0 $0` y el tooltip «$0 · 0.0 %» (`Math.max(0, val)` en dos sitios). Ahora el valor con **signo** (−$1.100.000 a 6 meses); sin porcentaje sobre una base ≤ 0 y la nota dice «Pasarías / Seguirías / Saldrías de números rojos».
- **Patrimonio exactamente 0 ya no es «sin datos»** (`if(!patrimonio)`): «sin datos» solo si no hay ningún activo visible ni deuda (la alcancía no cuenta, para no delatarla).
- **«ESTABLE» desde 60 días era demasiado optimista.** Ahora pide 90 días **y** que el ritmo de cada tercio del historial vaya en la misma dirección (`_ritmosPorTercio`); si no, «estimación» y una línea con el rango («Tu ritmo cambió mucho entre períodos (de −$X a +$Y al mes)»). La ventana del historial pasó de 90 a 120 puntos (`UMBRALES.proyeccion.puntosHistorial`): con 90 la ventana nunca llegaba a 90 días (89 con un punto diario).
- **N-4 — texto falso:** decía «Deuda TC propia: $400.000 ya descontada» cuando el patrimonio descuenta la deuda **total** ($1.000.000). Ahora «Deuda TC: $1.000.000 (propia $400.000) ya descontada del patrimonio».
- **«A este ritmo, tu plata disponible duraría unos N meses»** con tendencia negativa y liquidez positiva.
- **Fechas** del historial con `_fechaSafe` (una «2026-9-26» no produce `NaN`); también en el eje de la gráfica de patrimonio de Análisis.

### Hero y «Necesita atención» (`inicio.js`, `index.html`, `styles.css`)

- **F2 — el hero era verde fijo:** un patrimonio de −$800.000 se veía igual que uno de +$8.000.000. Nuevo `calcEstadoHero()`/`renderHeroEstado()` (la prioridad: negativo > cero > liquidez negativa > prestado): **rojo** + «Debes más de lo que tienes: $X»; **neutro** si es 0; **ámbar** + «Tienes valor, pero tus deudas superan tu plata disponible en $X» (patrimonio positivo con liquidez negativa: el hero decía «todo bien» y la Salud gritaba alerta); y «Sin contar lo que te deben: $X» cuando lo prestado pesa ≥ 25 % del patrimonio. Elemento `#hero-estado` (colapsa con `:empty`, se oculta con «ocultar saldos»).
- **`_checkGastoAlto` comparaba contra el disponible de ahora** (que ya descuenta ese gasto) y con `disp ≤ 0` no avisaba nada. Ahora compara contra el **ingreso de referencia**: «Gastos altos» (ámbar) desde 80 %, «Gastas más de lo que ingresas» (rojo) al superarlo; sin ingresos registrados, «Sin plata disponible» solo si ya no queda. Usa clases en vez de `style.color`.
- **Atención** ahora avisa: liquidez neta negativa (rojo), runway < 1 mes, 2–3 meses seguidos en déficit, **lo que tú debes a personas** («Le debes $X a Fulano») y **N-8 — tarjetas no activas con deuda** (se omitían todas las que no estaban «activa»). Los límites (85 % de cupo, 7 días de CDT) salen de `UMBRALES.atencion`.

### Gastos fijos con día de vencimiento (P7 / N4 — funcionalidad nueva)

- **N4 verificado:** `gastos.js` guardaba `{id, nombre, monto, cat}`: la app no podía avisar «el arriendo vence en 3 días» ni «ya es 25 y no está pagado», justo lo que más evita una crisis de caja (el estado sintético de los tests ya traía `dia: 5` sin que nada lo usara).
- **Campo opcional «Día de vencimiento»** (1–31) en «Gasto fijo mensual» (`#gf_d`); vacío = sin aviso, fuera de rango = se rechaza. `Periodo.gastosFijosProgramados(mes, hoy)` (puro): los pendientes del mes con `dias` hasta el vencimiento (negativo = vencido); un «31» se recorta al último día del mes (28/29 en febrero); los pagados ese mes y los sin día no aparecen.
- **Lista de gastos fijos:** «Vence el día 5» / «Vence en 2 días» (ámbar desde 3) / «Vence hoy» / «Venció hace N días» (rojo) mientras no esté pagado.
- **Necesita atención:** aviso por cada gasto fijo (por vencer, hoy, vencido sin pagar) y la **brecha de caja**: «En los próximos 7 días vencen $X y tu plata disponible es $Y» (suma lo que vence en 7 días y lo vencido sin pagar, incluido el mes siguiente: el día 30 el arriendo del 1 ya está encima). Límites en `UMBRALES.atencion` (`gastoFijoAvisoDias` = 3, `brechaCajaDias` = 7).
- No cambia ningún saldo ni la regla «un gasto fijo solo se convierte en gasto real al pagarlo». Los gastos fijos ya creados siguen igual (sin día no hay avisos).
- **Editar un gasto fijo** (antes solo se podía borrar y recrear, perdiendo nombre y categoría): botón «Editar» en cada fila que abre el mismo sheet cargado (`abrirEditarGastoFijo`); conserva el `id`, así los pagos anteriores no se tocan; dejar el día vacío lo quita; un día fuera de 1–31 se rechaza sin cambiar nada. De paso, el registro de cambios («Agregaste gasto fijo») guardaba nombre y monto **vacíos** porque los leía después de limpiar el formulario; ahora los lee antes.
- **Ingresos fijos con «Día en que te llega» (opcional)**: se guarda en `ing.dia`, se muestra en la fila y, si ese día ya pasó y no hay **ningún** cobro registrado ese mes, «Necesita atención» avisa («Sueldo debía llegar el día 30 y aún no lo registras», ámbar: no es una deuda tuya, pero sí plata que contabas). Con un cobro parcial, sin día o antes de «desde», no avisa. `Periodo.diaDelMes()` (nuevo, puro) es el helper común del día del mes (recorta al último día; devuelve `null` si no es un entero 1–31).

### Compra grande (una moto): un golpe real que no es un hábito (P5.1 / N2 / B4-1)

- **El problema (verificado):** `gastoPromedioPrevio`, el ratio de gasto, la racha de déficit y la pendiente de la Proyección trataban una moto de 15 M como un gasto habitual: «gastas 16 M al mes», runway subestimado durante meses, «llevas 2 meses seguidos en déficit» y una Proyección que o extrapolaba −15 M cada mes o se quedaba en «estimación» para siempre.
- **El criterio (el tuyo, y es el correcto financieramente):** una compra grande **no se excluye ni se esconde**: baja el patrimonio, la liquidez y los «meses que cubres» **por completo** (eso es **stock**: lo que tienes). Lo que se separa es el **flujo** (cómo gastas cada mes): una moto no se repite. Por eso la marca solo afecta al gasto típico, al ratio de (d), a la racha de (h) y a la pendiente de la Proyección; nunca al patrimonio, la liquidez, el runway ni al gasto real.
- **Quién decide: el usuario manda y, si no dice nada, la app detecta.** `gv.grande` es `true` (la marcó él), `false` (dijo que no lo es: se respeta siempre) o ausente (sin decisión). Sin decisión, `Periodo.compraGrandeEstado` la detecta sola si el gasto supera lo que normalmente gastas en un mes entero (`umbralCompraGrande`: la **mediana** del gasto mensual de los meses completos anteriores, mínimo 500.000, mínimo 2 meses de historia; retiros manuales no). Primero la hice «solo sugerir» y atribuí esa decisión al usuario, que no la pidió; una marca que depende de acordarse falla justo cuando importa (la moto sin marcar volvía a leerse como hábito) y el formulario no cubre las compras con tarjeta ni lo anterior. Es visible («Compra grande · automática») y reversible («No es compra grande»; las decisiones se guardan explícitas, true/false, para que no cambien solas). La mediana no se mueve con la moto y no depende de cuánto tienes hoy. El mínimo de 500.000 se aplica también dentro de la clasificación, no solo del umbral (una prueba lo detectó).
- **Formulario y lista:** casilla «Es una compra grande (no habitual)» en «Registrar gasto» y botón («Marcar grande» / «Quitar «grande»» / «No es compra grande») en la lista, desde 500.000 o si ya es grande; etiqueta «Compra grande» en la fila.
- **Impacto ANTES de comprar** (`calcImpactoCompra`, `UMBRALES.compraGrande`): al escribir el monto (desde 500.000) el formulario dice «Es el 75 % de tu plata disponible y el 60 % de tu patrimonio. Después cubrirías 5,0 meses de gastos (hoy: 20,0 meses)», en ámbar bajo 3 meses y en rojo bajo 1 mes o si tus deudas superarían tu plata disponible. Pagar con tarjeta pesa igual. La casilla se **marca sola** si es ≥ 30 % de lo disponible o ≥ 2 meses de gasto típico, y no se toca si la cambias a mano.
- **`Periodo`:** `gastosDelMes` devuelve `extraordinarios`, `extraTotal` y `recurrenteTotal` (el `total` sigue siendo el real); `balanceDelMes` devuelve `balanceRecurrente` y `extraordinarios`; `gastosPorMes(estado, { sinExtraordinarios })`; `gastoPromedioPrevio` ya excluye las compras grandes; `rachaDeficit` usa el balance recurrente; nuevos `esCompraGrande` y `comprasGrandesEntre(desde, hasta)`.
- **Proyección:** para la pendiente se suma de vuelta, en cada intervalo del historial, lo que cayó por una compra grande de esa fecha; la tarjeta lo dice («Sin contar tu compra grande (Moto: $15.000.000), tu ritmo es +$300.000 al mes. Ya está descontada de tu patrimonio de hoy; la proyección no la repite») y «ESTABLE» vuelve a ser posible. **Análisis:** «Incluye $15.000.000 en una compra grande (Moto) · sin ella, tu balance del mes fue +$X» (el balance real, que decide el color, no cambia). **Salud:** si una compra grande de los últimos 90 días dejó las reservas bajo el fondo completo, un consejo la nombra y dice qué hacer (reconstruir el fondo antes de otro gasto grande).
- **Pruebas:** 24 nuevas (bienes; la detección automática, la prioridad de la decisión del usuario, la mediana robusta, sin historia, retiros manuales), incluidas pruebas de mutación manuales (rompí la exclusión del gasto típico y el ajuste de la Proyección y las pruebas fallaron). `tests/gastos-filtros.test.js` carga ahora `umbrales.js`.
- **El bien como activo aparte (P5.2):** una moto vale algo aunque se deprecie. Nueva colección `S.bienes[]` (`{id, nombre, valor, fecha, depreciacionAnual?, origenGastoId?}`) con `calcValorBien` (depreciación anual compuesta desde la fecha, nunca bajo 0, sin `NaN`), `calcBienes` y `calcPatrimonioConBienes`. **Va aparte a propósito:** el patrimonio del inicio sigue siendo el financiero (meter la moto adentro escondería el golpe de la compra justo cuando más importa verlo), y los bienes nunca entran en la liquidez ni en el runway ni en la Salud (una prueba compara Salud con y sin bienes y es idéntica). El valor es una estimación del usuario.
  - **Cómo se registra:** botón «Registrar como bien» en la fila de una compra grande (abre el sheet con nombre, monto y fecha cargados; la fila pasa a «Bien registrado»); editable y quitable desde la tarjeta «Bienes» de Análisis, que además muestra «Patrimonio con bienes». Quitar el bien no toca el gasto.
  - **Infraestructura:** `bienes` en el estado inicial, clasificado como `estado-actual` en el cierre de períodos, validado como array al importar un respaldo, y `.an-bien-monto` entra en «ocultar saldos».

### Calendario de caja a 30 días (P7 horizonte / B4-2 «con lo programado»)

- **Diseño mejor que lo anotado:** en vez de solo ampliar la alerta de 7 a 30 días (que sumaba lo que vence sin ver lo que entra), un **calendario de caja** día a día con lo ya programado: **sale** cada gasto fijo con día sin pagar (el vencido, hoy; recurre el mes siguiente si cae en el horizonte); **entra** cada ingreso fijo con día esperado que aún no llega y cuyo día no ha pasado (uno atrasado **no** se da por hecho, igual que «lo que te deben» no cuenta hasta que llega) y cada CDT que vence (capital + rendimiento, desde el día siguiente). Parte de la liquidez neta de hoy, que ya descuenta lo que debes (por eso no hay evento de tarjeta).
- **`Periodo.saldoProyectado`** (puro): evalúa al **cierre de cada día** neteando entradas y salidas del mismo día (sueldo y arriendo el mismo día no dan una falsa alarma), devuelve `puntos`, `minimo` y `primerDeficit` (el primer día en negativo y su causa; solo si hoy no estás ya en negativo). `_eventosCaja` / `calcCalendarioCaja` (`inicio.js`) arman los eventos. `UMBRALES.caja.horizonteDias` = 30 (se quitó `atencion.brechaCajaDias`).
- **Atención** (rojo): «El 5 de nov tu plata disponible quedaría en −$X (vence Arriendo: $Y)» — reemplaza el viejo «En los próximos 7 días vencen…». **Proyección:** una línea «Próximos 30 días, con lo ya programado…: tu plata disponible pasaría de $X a $Y. Lo más bajo: …», también sin historial.
- **B4-2** («modo con lo programado» de la Proyección de 3/6/12 meses) **no** se hizo como ajuste de esa pendiente: mezclar lo programado con una tendencia histórica que ya lo contiene sería contar dos veces. Lo útil era el calendario de caja.
- **Pruebas:** 6 nuevas, y mutaciones manuales (quitar el límite del horizonte y la regla de «ya negativo» hacen fallar las pruebas). Una prueba mía asumía mal que el gasto fijo no recurre el mes siguiente.

### Análisis, Wrapped y push

- **Análisis — porcentaje sobre base negativa:** pasar de −$1.000.000 a −$500.000 decía «+50 %» en verde con el patrimonio aún en deuda. Ahora el % solo sobre base positiva («—» si no) y «En números rojos» si el valor final es < 0.
- **Presupuestos:** (a) **avisan al superar el 100 %** («Superaste el presupuesto de X por $Y»), antes solo entre 80 y 99 %; (b) el texto muestra el exceso («$180.000 / $100.000 · +$80.000») aunque la barra se recorte; (c) un límite no positivo ya no da `NaN%` de ancho; (d) los avisos ya mostrados se guardan en `localStorage` (`mf-presup-avisos`, solo el mes en curso) para no repetirse tras recargar.
- **F5 — Wrapped con base mínima o negativa** decía «casi se duplicó (+39900%)» (de $5.000 a $2 M), «casi se redondeó» (de −$900.000 a −$100.000, que **sigue en deuda**) y «−160 %» al cruzar a deuda. `_wrappedPatrimonioAnio` devuelve `pct` solo sobre base positiva y con |pct| ≤ 300 %, más `inicio`/`fin`; `_wrappedCopyPatrimonio` habla del **cruce de cero** (entró / salió / sigue en números rojos), usa **tres niveles de caída** (leve < 5 %, moderada 5–15 %, fuerte ≥ 15 %; antes un −24 % era «bajó un poco, nada que no se recupere»), corrige «redondeó» y añade la **causa** de la caída (una compra ≥ 70 % de la caída, gastar más de lo ingresado, o «ingresos superaron gastos pero el patrimonio bajó: revisa deudas o ajustes»; el texto del usuario va escapado).
- **F6 — las notificaciones push no veían Spotify.** `checks.js` leía `S.spotifyPersonas`, que desde la migración (esquema 9) es `S.spotify.personas`: «Cobro Spotify vencido» dejó de llegar sin ningún error. Corregido, y el guardián de `tests/nucleo.test.js` que prohíbe las llaves sueltas ahora recorre también `scripts/` (por eso F6 se había escapado).

### Infraestructura

- **A10 — `sw.js`:** la línea de `VERSION` arrastraba un comentario de ~12 KB (el historial ya está aquí). Queda `const VERSION = 'mis-finanzas-v92'; // bump manual…` y un test que impide que vuelva a crecer. Versión 92.
- `mapa-codigo.md` regenerado (53 archivos). Los tests que cargan `inicio.js` cargan ahora `umbrales.js` (ver `tests/README.md`); `estilos.test.js` conoce `inicio-runway-*` como clase armada.

### Pruebas actualizadas (fijaban justo los defectos)

`nucleo.test.js`: el +10 por «gastos 2,5 % de los ingresos» de un mes que apenas empieza (ahora 55 = 50 + 5 sin deudas), el +10 del ratio en «el gasto típico es el promedio de los últimos 3 meses» (ahora trae ingresos previos), los textos «patrimonio líquido», y la doble alerta de una deuda sin ingresos. Los cuatro cargadores de `inicio.js` suman `umbrales.js`.

### Revisado y NO cambiado (con el porqué)

- **«Un test de `@property` falla»:** es de `jsdom` 30; tu `package.json` fija `^27` y pasa. No aplica.
- **Las deudas «Yo debo» en el ratio de endeudamiento (b):** se deja la liquidez como único canal (una deuda con una persona normalmente no tiene interés ni plazo); queda en `mejoras-mis-finanzas.md` como decisión pendiente.

---

## Sheets: el teclado ya no mueve el layout, el sheet se desliza con él (2026-11-01, SW v91)

Síntomas: en sheets pequeños (p. ej. «¿Quién te debe?» sin personas) el sheet aparecía abajo, saltaba al abrir el teclado y al cerrarlo bajaba y subía de golpe.

Causa raíz (medida en Chromium con un banco de pruebas que simula Android: el layout se achica al instante y el teclado desliza ~300 ms por su cuenta): el sheet dependía del layout, así que se **teletransportaba 330 px en un solo cuadro** hasta 308 px por delante del teclado al subir y, al cerrar, caía de golpe mientras el teclado aún lo tapaba. Las versiones v85–v89 compensaban en JS ese salto (variables, márgenes, histéresis) sin quitarlo; era un problema de estructura, no de ajuste.

- **Diseño nuevo (`sheet-behavior.js` + `styles.css`):** el overlay no cambia de tamaño; una sola variable `--kb` (y `--pan` en iOS) la escribe el JS; el sheet se desplaza con `translate` + transición (curvas de subida y bajada afinadas contra varias curvas de teclado). Con la VirtualKeyboard API (Chrome/Edge/Samsung) la página entra en `overlaysContent` solo mientras hay un sheet abierto, así el fondo no se reacomoda y se dibuja bajo el teclado. Fuera de sheets, comportamiento del navegador intacto. Resto de navegadores: `visualViewport`.
- **Resultado medido:** paso máximo por cuadro 330 → 37 px al subir (81 al bajar); hueco visible junto al teclado 308 → ≤ 16 px al subir (≤ ~50 al bajar, contra curvas de teclado extremas); 0 inversiones de sentido; sheet alto con borde superior estable; borde en pantalla constante cuando iOS desplaza el viewport; interrupciones (abrir/cerrar el teclado a mitad) se redirigen sin saltos.
- **Entrada animada** (`sheet-in`, `overlay-in`), respeta `prefers-reduced-motion`. Va en `.overlay.open`, así que cubre `openSheet()` y los `classList` directos; volver al sheet de abajo no la repite.
- **`focusSheetField(idOEl, {select})`** reemplaza los 19 `setTimeout(…focus(), 200)` de Personas, Cuentas, Nu, Encargos, Tarjetas y Plata comprometida, y el autofocus de `mejoras-adicionales.js`: teclado y entrada arrancan juntos, y al pasar de un sheet a otro (p. ej. «Nueva persona» / «Volver») el teclado no se cierra y reabre.
- Eliminado: `kb-open` como reglas de layout, `--vv-top`, `--vv-h`, `--kb-pad`, el estado `kbOpen` y el ajuste del `padding-bottom` del sheet. `html.kb-open` queda solo como marca.
- `#sheetdebug` muestra ahora la fuente del teclado, `--kb`, `--pan` y la latencia foco → teclado.
- **No verificado en un teléfono real:** las pruebas simulan la geometría del teclado; la VirtualKeyboard API y iOS dependen del navegador. Contrato y guía de depuración en `guia-estilo-sheets.md` §4.

---

## Service Worker: ya no guarda copias viejas + panel de diagnóstico de sheets (2026-11-01, SW v90)

Motivo: tras varias iteraciones de sheets el comportamiento no cambiaba en el celular. Se reprodujo en un servidor de prueba con `Cache-Control: max-age=600` (lo que manda GitHub Pages): con el SW anterior, tras un deploy la caché del SW **seguía guardando la copia vieja** de los JS/CSS, porque la «revalidación» de `staleWhileRevalidate` salía de la caché HTTP del navegador y no del servidor.

- **`sw.js`:** nuevo `fetchFresh()` (mismo origen → `fetch(request, {cache:'no-cache'})`, o sea revalida con el servidor y recibe 304 si no cambió); lo usan `staleWhileRevalidate` y `networkFirst`. Terceros (CDN, fuentes) siguen igual. `install` pide el `APP_SHELL` con `cache:'reload'`. Se mantiene la estrategia (stale-while-revalidate para JS/CSS, network-first para `index.html`) y el borrado de cachés viejas al activar.
- **Panel `#sheetdebug`** (`sheet-behavior.js`): abriendo `…/mis-finanzas/#sheetdebug` aparece arriba a la izquierda un panel con: build cargado (`window.__sheetBuild`), nombre de la caché del SW, si el `<meta viewport>` tiene `interactive-widget=resizes-content` (o «FALTA: index.html viejo»), modo de teclado activo (reposo / LAYOUT / VV kb-open), `innerHeight`, `visualViewport` (alto, offsetTop, escala), variables CSS activas y el campo enfocado. Sin el hash no se crea nada.
- Para actualizar en el celular tras un deploy: abrir la app dos veces seguidas (la primera instala el SW nuevo y borra la caché vieja; la segunda ya carga todo fresco) y confirmar el build en el panel.

---

## Sheets: el navegador redimensiona el layout con el teclado (2026-11-01, SW v89)

Síntomas reportados en el sheet pequeño («¿Quién te debe?»): al abrirlo con autofocus la subida parpadeaba y se veía texto del sheet por debajo; con el gesto «atrás» (cancelado) y al cerrar el teclado, el sheet bajaba de más y luego subía. En los sheets grandes no se notaba porque su borde superior lo fija `max-height`: lo que se movía era el ancla inferior, y solo un sheet pequeño la deja ver.

Causa: toda la compensación del teclado dependía de código propio que reaccionaba a medidas del `visualViewport` que el navegador entrega a saltos y a destiempo (más un estado «hay teclado» con histéresis), así que sheet y teclado podían contradecirse unos cuadros.

- **`index.html`:** `<meta viewport>` con `interactive-widget=resizes-content`. En Chrome/Edge/Samsung (Android) el navegador achica el layout viewport con el teclado, así que el `.overlay` (`position:fixed; inset:0`) y el sheet anclado abajo quedan pegados a lo visible en el mismo cuadro en que se mueve el teclado, también durante el gesto «atrás». Es el comportamiento de `adjustResize` de las apps nativas y no pasa por JS.
- **`sheet-behavior.js`:** la compensación por `visualViewport` (clase `kb-open`, `--vv-top`, `--vv-h`, `--kb-pad`) queda como **respaldo para iOS Safari y Firefox**, y se desactiva sola cuando detecta que el navegador ya achicó el layout (`restInner - innerHeight > 100 px`; una barra de direcciones mueve ~56 px y no cuenta; el giro de pantalla reinicia la referencia). Así no se compensa dos veces ni siquiera en cuadros transitorios donde `visualViewport` y `innerHeight` discrepan.
- **Gesto de cierre con teclado visible:** ahora se decide con `keyboardVisible()`, válido en ambos modos: el deslizamiento desde el handle solo cierra el teclado; el sheet no se mueve.
- **Ajuste de scroll del campo enfocado:** espera a que cualquier evento de viewport (también `resize` de ventana) lleve 160 ms quieto.
- Pruebas: layout 800→700→600→520→460 y gesto «atrás» cancelado (460→500→540→520→480→460): el sheet va exactamente donde va el layout, sin bajar de más ni rebotar.

---

## Sheets: corrección de la v87 — el sheet salta al abrir el teclado (2026-11-01, SW v88)

La v87 anclaba el sheet al borde inferior del **layout**. Pero Android no redimensiona el layout cuando sale el teclado: **desplaza el viewport visual** (`visualViewport.offsetTop`) para mostrar el campo enfocado, y eso movía el sheet en pantalla de golpe. El cálculo se corregía después, con una transición de .26 s, y se veía como «salta, vuelve y baja».

- **Overlay pegado a lo visible:** con teclado, `html.kb-open .overlay{top:var(--vv-top)}`: el overlay empieza donde empieza lo visible y sigue hasta el borde inferior del layout (se extiende bajo el teclado). Si el viewport se desplaza, el overlay se desplaza con él y el sheet no se mueve en pantalla. El borde superior del sheet depende solo de `--vv-h` y del contenido. Se conserva lo bueno de la v87: el fondo del sheet ya está bajo el teclado mientras sube, así que no queda «partido».
- **Sin transiciones en `.sheet`:** el overlay cambia de tamaño de golpe, y una transición en el sheet lo desfasaba.
- **Teclado abierto + deslizar desde el handle:** el sheet **ya no se mueve**; el primer deslizamiento hacia abajo solo cierra el teclado y el siguiente cierra el sheet. Antes el sheet bajaba del todo mientras el teclado bajaba un poco, y al soltar quedaba el hueco del teclado (el layout congelado). Se eliminó el congelado de layout, que ya no hace falta.
- Se conserva: el modo teclado exige campo de texto enfocado y visible; un campo oculto con foco se suelta solo; autofocus de Mesada desactivado.
- Prueba de regresión nueva: desplazar `offsetTop` (0→60→160→90→0) deja constante el borde superior físico del sheet (la v87 lo movía de 18 a −37, 10, 40 y 53 px).

---

## Sheets: teclado rehecho como «sheet extendido bajo el teclado» (2026-11-01, SW v87)

Tres síntomas, una misma causa: el sheet se *encogía* para quedar justo encima del teclado, y el tamaño del teclado lo informa el navegador tarde y a saltos, mientras el teclado se anima por su cuenta.

- **Sheet «partido» mientras sube el teclado (sheets altos como Mesada):** el sheet saltaba de golpe a su posición final y entre su borde inferior y el teclado (aún en camino) se veía el fondo. Ahora el overlay ya no cambia de tamaño: el sheet queda anclado al borde inferior de la pantalla y se **extiende por debajo del teclado** con `padding-bottom: calc(38px + var(--kb-pad))` y `max-height: calc(var(--vv-h) * .96 + var(--kb-pad))`. Su fondo siempre llega al borde, así que no hay hueco por mucho que tarde el teclado. El contenido (con scroll) termina justo encima del teclado.
- **«Nueva persona» / «Volver» con teclado abierto (sheet que sube de más, se queda pegado ~1 s y baja de golpe):** el modo teclado dependía solo del tamaño del viewport, que seguía «achicado» un buen rato después de que el teclado ya se había ido. Ahora exige además **un campo de texto enfocado y visible**: si el foco se va (botón, otro sheet, overlay oculto) el espacio reservado se libera en el siguiente frame sin esperar al navegador. Un campo enfocado dentro de un overlay recién oculto se suelta solo (muchos sheets —Personas, Plata comprometida…— se abren y cierran con `classList` directo, sin pasar por `openSheet`/`closeSheet`); un `MutationObserver` sobre la clase `open` de los `.overlay` lo detecta.
- **Cambios de altura animados:** `.sheet` transiciona `max-height` y `padding-bottom` (.26 s) para acompañar al teclado en vez de saltar; `prefers-reduced-motion` lo desactiva.
- **Cerrar por gesto con teclado abierto (sheet abajo del todo y teclado a medias):** el teclado se suelta cuando el sheet baja más de 24 px (como en iOS), no al soltar el dedo, y el layout queda **congelado** durante el arrastre para que el sheet no se despegue del dedo. Se descongela al terminar (cierre o rebote).
- **Franja de agarre:** los 56 px superiores solo agarran si el sheet está arriba del todo; scrolleado, esa franja es contenido.
- **Ajuste de scroll del campo enfocado:** espera a que el layout del teclado lleve 280 ms quieto (incluye la transición CSS) y se hace una sola vez.
- Variables nuevas en `<html>` (solo con teclado): `--kb-pad`, `--vv-h`. Desaparecen `--vv-top` y las reglas que redimensionaban el overlay.

---

## Sheets: ajustes tras probar en el celular (2026-11-01, SW v86)

- **Hueco bajo el sheet al subirlo:** el arrastre dejaba un poco de «elasticidad» hacia arriba (`y * 0.15`), que desplazaba el sheet por encima de su sitio y dejaba ver el fondo debajo. Ahora el desplazamiento nunca es negativo: el sheet solo baja, y al volver sube hasta su sitio y se detiene.
- **Cierre «de golpe»:** al soltar, un cuadro de arrastre pendiente (`requestAnimationFrame`) se aplicaba DESPUÉS de iniciar la animación de cierre y devolvía el sheet a su posición anterior; se quedaba arriba hasta que el temporizador lo cerraba de golpe. `settle()` ahora cancela ese cuadro y aplica la posición final del dedo antes de animar.
- **Temblor al abrir/cerrar el teclado rápido:** (a) un único umbral de 120 px se cruzaba varias veces durante la animación del teclado y el overlay alternaba entre «pantalla completa» y «viewport visible»; ahora hay histéresis (entra con más de 60 px, sale con menos de 30 px). (b) el ajuste de scroll del campo enfocado medía con el teclado a medio camino y corregía de más; ahora espera a que el viewport lleve 110 ms sin cambios.
- **Mesada:** `mesada-pago` y `mesada-pend` ya no enfocan el monto al abrirse (venía precargado con la cuota del mes / lo pendiente, y el teclado saltaba sin necesidad).

---

## Sheets: teclado y gesto de cierre rehechos (2026-11-01, SW v85)

Causa raíz de los saltos del teclado: el sheet se reposicionaba con tres relojes distintos encadenados (debounce de 120 ms, espera a que «no hubiera toques» hasta 300 ms y una transición de `margin-bottom` de 220 ms) más una medición del campo enfocado que esperaba a todo lo anterior. Según el momento en que cayera el toque, el sheet empezaba desde abajo del todo, desde la mitad, o saltaba dos veces. Al cerrar el teclado pasaba lo mismo a la inversa (quedaba un hueco donde estaba el teclado).

- **Teclado, una sola fuente de verdad (`js/core/sheet-behavior.js` + `.overlay` en `styles.css`).** Con el teclado abierto, `<html>` recibe la clase `kb-open` y las variables `--vv-top`/`--vv-h` (Visual Viewport), escritas en un `requestAnimationFrame` en cada `resize`/`scroll` del viewport. El `.overlay` pasa a medir exactamente lo visible y el sheet, alineado abajo, queda pegado al teclado: sin márgenes inline, sin debounce, sin esperas, sin transición de `margin-bottom`/`max-height` en `.sheet`. Funciona igual con `offsetTop` ≠ 0 (iOS). El zoom de pellizco no cuenta como teclado.
- **Campo enfocado visible:** se mide en el frame siguiente a cada cambio de layout del teclado y tras el foco (tres pasadas baratas que no hacen nada si el campo ya se ve); nunca bajo un dedo. El autofocus de `mejoras-adicionales.js` usa `preventScroll` para que no compita con ese ajuste.
- **Selector de persona (y cualquier lista interna con scroll):** el gesto de cierre ya no arrastra el sheet mientras la lista puede seguir scrolleando hacia arriba (antes bajaba la lista y el sheet a la vez). Se recorre desde el elemento tocado hasta el sheet buscando un contenedor con `scrollTop > 0`. `.pe-sel-lista` y `.ix-busqueda-resultados` llevan `overscroll-behavior-y: contain` para que, al llegar al final de la lista, el scroll no se encadene al sheet.
- **Gesto de cierre:** zona de agarre (handle con área de toque ampliada + franja superior de 56 px) que controla el gesto desde el primer píxel; seguimiento 1:1; escritura por rAF; velocidad medida sobre ~100 ms; cierre o rebote con duración proporcional al recorrido; un rebote en curso se puede interrumpir con un toque nuevo; solo se atenúa el fondo (`--ov-k`), ya no la `opacity` del overlay entero, que también desvanecía el sheet. Con el teclado abierto se puede cerrar desde el handle (suelta el foco); desde el cuerpo no. Soporta ratón en la zona de agarre.
- **Bug de pila:** los sheets inyectados después de cargar (Personas, Plata comprometida) se cerraban por gesto con `classList.remove('open')`, sin pasar por `closeSheet()`, y quedaban en `_sheetStack`; el siguiente `openSheet()` les ponía `sheet-background` (que fuerza `display:flex`) y reaparecía un sheet fantasma atenuado. Ahora todo cierre por gesto pasa por `closeSheet()`.
- **`closeSheet()` suelta el foco** si está dentro del sheet que se cierra, para que el teclado se cierre siempre a la vez que el sheet.
- **Alcancía:** `makeSwipeable` se expone como `window.makeSwipeable` (antes estaba encerrada en el IIFE y su `typeof makeSwipeable === 'function'` era siempre falso: sus tres sheets nunca se cerraban por gesto).
- Eliminado el `MutationObserver` por overlay y el estado `kbState`: ya no hacen falta.

---
