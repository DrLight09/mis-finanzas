# CHANGELOG — mis-finanzas

Historial de bugs corregidos, código eliminado por diseño y decisiones de limpieza, por módulo. La documentación de cada módulo (`mesada.md`, `spotify.md`, etc.) se enfoca en cómo funciona *hoy*; el detalle de qué estaba mal antes y cómo se arregló vive acá, para no inflar los documentos principales.

---

## Infraestructura / seguridad

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

## Encargos

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

---

## Mesada

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

---

## Spotify

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

---

## Salud financiera

### ✅ Corregido — `calcHealthScore()` no excluía los extras de préstamo gastados de inmediato

El mismo filtro de "gasto real del mes" usado en Análisis financiero (ver arriba) le faltaba una condición a `calcHealthScore()`: no excluía `_esExtraPrestamo`, así que cada extra de préstamo gastado inflaba `gastosMes` — afectando el cálculo de fondo de emergencia (meses de liquidez cubiertos) y el ratio gastos/ingresos, y bajando el puntaje de salud financiera sin razón real cuando había extras de préstamo ese mes.

Fix: se agregó la misma exclusión (`!g._esExtraPrestamo`) al filtro de `gvMes` en `calcHealthScore()`, dejando el criterio consistente con `renderAnalisis()`. *(Este filtro puntual quedó luego absorbido por la centralización en `_esGastoVarNoReal()`, ver `CHANGELOG.md#análisis-financiero`.)*

---

## Tarjetas de crédito

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

---

## Análisis financiero

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

---

## Patrimonio y cálculos globales

*(`calcPatrimonioTotal()`, `snapshotPatrimonio()`, hero de Inicio, salud financiera — funciones compartidas por varias pantallas, no exclusivas de un solo módulo)*

### ✅ Corregido — Plata de Encargos en Nequi/Efectivo/cuentas personalizadas se contaba como patrimonio propio

`calcPatrimonioTotal()` solo restaba la plata de un encargo cuando estaba guardada en una **cajita de Nu** (vía `_saldoEncargosEnCajita()`). Si el encargo se guardaba en Nequi, Efectivo o una cuenta personalizada, no existía ningún descuento equivalente — esa plata ajena se contaba como si fuera tuya.

Fix: se generalizó `_saldoEncargosEnCajita(cajitaId)` en `_saldoEncargosEnCuenta(cuentaKey)`, que acepta cualquier clave de cuenta (`'nequi'`, `'efectivo'`, `'custom:ID'`, `'cajita:ID'`). Se aplicó la resta en tres lugares que hacían el mismo cálculo de forma independiente: `calcPatrimonioTotal()`, el hero de Inicio (`refresh()` — el número más visible de la app tenía el mismo bug por separado), y `liquidoReal` en Salud financiera.

**Pendiente, fuera de esta corrección:** `getSaldoFuente('nequi'/'efectivo')` (usada para validar si hay saldo suficiente al registrar un gasto) todavía no resta la plata de encargos. En teoría permitiría "gastar" sin aviso plata que en realidad es de un encargo. Revisar si vale la pena aplicar el mismo criterio ahí.

### ✅ Corregido — La alcancía se filtraba en el Historial de Patrimonio (Análisis financiero)

La alcancía es una función de "ahorro oculto": el saldo no se muestra en ningún lado hasta que se decide destaparla. El hero de Inicio ya respetaba esto (calcula el patrimonio visible restando explícitamente la alcancía), pero `calcPatrimonioTotal()` — la función que alimenta `snapshotPatrimonio()`, que a su vez llena `S.patrimonioHistorial` (la data de la gráfica de Análisis Financiero) — sí la incluía.

Por qué era grave y no solo inconsistente: al registrar un depósito tipo `yo-directo` (efectivo que no tenías registrado), el movimiento en efectivo es neto cero, pero el saldo de la alcancía sí sube. El patrimonio total pegaba un salto ese día que no se explicaba por ningún ingreso visible — cualquiera que mirara la curva de tendencia podía ver, con precisión de peso, cuándo y cuánto se metió a la alcancía.

Fix: se guardan dos valores por punto del historial (`valor` = patrimonio real con alcancía, `valorVisible` = sin alcancía), calculados en `snapshotPatrimonio()`. La gráfica de Análisis Financiero pasó a consumir `valorVisible` en la curva, el número de encabezado y el tooltip (los dos últimos se habían quedado usando el valor real en una primera pasada del fix, y se corrigieron aparte). Health score y Proyección financiera siguen usando `calcPatrimonioTotal()` con la alcancía incluida a propósito — ahí sí es plata real que debe contar, y no es una gráfica día a día que exponga montos puntuales.

**Limitación conocida:** los puntos del historial guardados antes de este cambio no tienen `valorVisible` (caen a `valor` como fallback) — no hay forma de reconstruir retroactivamente cuánto había en la alcancía en fechas pasadas, así que esos puntos viejos pueden seguir mostrando el salto original. De ahí en adelante, la curva queda limpia.

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

## Alcancía

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

---

## Prestado

### 🗑️ Eliminado por diseño — Botón "Devolver a donde salió el préstamo"

Se quitó el atajo del sheet de abono/pago-completo que, al registrar un pago, prellenaba automáticamente el destino con la(s) misma(s) cuenta(s) de donde había salido el préstamo original (`mov_btn_origen` + los badges de `mov_origen_tags`).

Eliminado por completo: `movSetOrigenBtn()` (calculaba las fuentes del último movimiento tipo `'prestamo'` del deudor y pintaba los tags), `abonoAplicarOrigen()` (aplicaba esas fuentes como destino, en modo simple o dividido), su entrada en el objeto de exportación de `Events`, el precargado del botón al abrir el sheet (`if (tipo === 'abono' || tipo === 'pago-completo') ...`), el reset de sus elementos al abrir cualquier sheet de movimiento, y el markup del botón/badges en `index.html`.

Se dejó intacto el flujo manual de "Dividir ÷" del destino (`_abonoSplitMode`/`_abonoSplitRows`/`abonoRenderSplit`/`toggleAbonoSplit`/`abonoAddSplitRow`), que es independiente — solo servía como atajo para prellenarlo, no como su base.
