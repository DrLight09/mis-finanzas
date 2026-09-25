# Mis Finanzas

## Qué es

**Mis Finanzas** es una aplicación web personal para llevar el control completo de las finanzas propias: cuentas, gastos, préstamos entre personas cercanas, suscripciones compartidas, dinero encargado por terceros, ahorros, deudas de tarjeta de crédito y la mensualidad que dan los papás. No es una app genérica de presupuesto — está construida a la medida de la vida financiera real de una sola persona, incluyendo relaciones de dinero con familia y amigos que una app de finanzas normal no contempla (mesadas, encargos de plata para guardar, préstamos informales, gastos compartidos con roommates o familiares vía Spotify).

Es un proyecto de un solo desarrollador, para uso personal, pensado para mantenerse y crecer durante años — no un producto para terceros.

## Cómo está construida

- **JavaScript vanilla, sin frameworks ni build step.** `index.html` es la carcasa (HTML, CSP y carga de scripts) y no contiene ningún bloque `<script>` inline; el código vive en `js/core/` y `js/modules/`, y los estilos en `css/`.
- **Firebase / Firestore** para sincronización en la nube entre dispositivos, con **IndexedDB** como caché local.
- **Desplegada en GitHub Pages.**
- **Estado global (`S`)**: un objeto central que se sincroniza bidireccionalmente con Firestore y contiene todos los datos de la app — cuentas, movimientos, préstamos, encargos, tarjetas, mesadas, Spotify, personas, etc. Todo el HTML se re-renderiza a partir de `S`.
- **Sin backend propio**: toda la lógica de negocio (cálculos, validaciones, reversión de movimientos) vive en el cliente.
- **Un archivo por dominio, con carga lazy:** cada pantalla tiene su propio archivo en `js/modules/` (mismo scope global, `<script>` clásicos — todavía no ES modules), con un despachador de eventos centralizado en `js/core/events.js` que reemplaza los `onclick` inline. Los 11 módulos de pantalla son grupos lazy (`js/core/lazy-loader.js`, `Loader.GROUPS`) que cargan bajo demanda al entrar a cada pantalla, con `Loader.ensureAll()` precargando los 11 en paralelo en segundo plano tras el primer dato real. `js/core/calc-helpers.js` expone un puñado de funciones puras de Mesada/TC/Préstamos/Spotify para que Inicio ("Necesita atención") no tenga que cargar esos módulos completos. Ver "Estructura de archivos" más abajo para el archivo de cada uno, y [`CHANGELOG.md#infraestructura--seguridad`](./CHANGELOG.md#infraestructura--seguridad) para el detalle de esa modularización; [`auditoria-tecnica.md`](./auditoria-tecnica.md) solo lista lo que sigue pendiente.

## Estructura de archivos — `js/core/`

Ver también "Estructura de archivos — `js/modules/`" y "Otros archivos" más abajo.

Todos viven en `js/core/` salvo que se indique lo contrario. "Clásico" = `<script defer>` (variables globales compartidas por scope léxico); "módulo" = `<script type="module" async>` (usa `import`, sin garantía de orden frente a los clásicos).

**Arranque y sincronización con Firebase**

| Archivo | Tipo | Qué hace |
|---|---|---|
| `firebase-init.js` | módulo | Inicializa Firebase (config, Auth, Firestore con caché offline multi-pestaña) y escucha `onAuthStateChanged` para arrancar la app o mostrar el login. Expone en `window._fb` lo que usa el resto (incluido `runTransaction`, para leer el documento directo del servidor — ver `firebase-sync.js` — y `popupResolver`, que los popups de login/reautenticación reciben como tercer argumento). Auth usa `initializeAuth()`: con sesión previa (marca `mf_auth_hint` en `localStorage`, que mantiene `_onAuthState`) arranca SIN el iframe/gapi de Firebase Auth; sin marca, con el resolver precargado. |
| `firebase-sync.js` | módulo | Guardado en Firestore con debounce y detección de "sin cambios" (`_fbSaveToCloud`), carga inicial de datos, `onSnapshot` para sync entre dispositivos, indicador de estado de sync. **Regla que no se debe romper:** `_dataLoaded` (que habilita todo guardado) solo pasa a `true` con un payload leído bien (`_cargaConfiable`) o tras verificar contra el servidor que el documento no existe (`_verificarSinDocumento`); "sin documento" del listener nunca se cree tal cual, ni siquiera con `fromCache=false`. Mientras no haya confianza la app queda en modo lectura (ver `CHANGELOG.md`, sección "Arranque"). Al pasar a segundo plano (`visibilitychange`/`pagehide`) fuerza el guardado pendiente en vez de esperar el debounce (`_fbFlushSave`). |
| `pin-bio.js` | módulo | Bloqueo con PIN de 4 dígitos + biometría opcional (WebAuthn/Face ID/huella) entre el login y la carga real de datos. |
| `bootstrap.js` | clásico | Arranque mínimo: `iniciales()`, fecha del header, autosave silencioso cada 60s. |
| `async-css.js` | clásico | Activa el CSS de Font Awesome/Google Fonts (cargado con `media="print"` para no bloquear el render) una vez que termina de descargar. |

**Núcleo de estado y utilidades transversales**

| Archivo | Tipo | Qué hace |
|---|---|---|
| `core-state.js` | clásico | El corazón de la app: objeto de estado global `S`, `save()`, `refresh()` base, `escHtml()`, formateo de dinero (`_moneyDigits`/`_moneyRender`), y el resto de helpers puros que usa toda la app. |
| `events.js` | clásico | Despachador centralizado de clicks (`Events.on`/`attr`/`registerAll`) — reemplaza los `onclick` inline bloqueados por la CSP; un solo listener delegado en `document` para toda la app. |
| `html-tag.js` | clásico | Primitivo `` html`` `` que escapa por defecto cualquier valor interpolado — migración gradual, módulo por módulo, para cerrar de raíz el bug recurrente de `.innerHTML` sin escapar. |
| `calc-helpers.js` | clásico | Funciones de cálculo puras de Mesada, Tarjetas de Crédito, Préstamos (`getDeudorSaldo`) y Spotify (`spNombreDe`, `spPersonaPagadaVigente`) que Inicio necesita (para "Necesita atención"/salud financiera) en el primer render, sin tener que cargar esos módulos lazy completos. Los módulos de origen ya no las definen y las usan como globales: **todo test que cargue uno de ellos y las use tiene que cargar también `calc-helpers.js`** (ver `tests/README.md`). |
| `fuentes-filtro.js` | clásico | `FuentesFiltro`: decide qué cuentas se ofrecen cuando la plata SALE (saldo mínimo por flujo: $1 general, $50 Spotify, > $0 pagar TC con efectivo ≥ $1.000; TC solo con cupo disponible). Carga después de `calc-helpers.js`. |
| `color-picker.js` | clásico | Un solo helper (`marcarColorSeleccionado`) para los selectores de color circulares, compartido por Cuentas, TC y Prestado. |
| `split.js` | clásico | Motor genérico de "split de fuentes": Mesada, MovEnc y Usar Parte comparten la misma lógica para dividir un monto entre varias cuentas. |
| `diferencial.js` | clásico | Motor genérico de "margen dijo vs. real" (diferencia entre lo que correspondía y lo que realmente costó/se recibió), usado por 5 sheets distintos de varios módulos. |
| `wait-for.js` / `wait-for-module.js` | clásico / módulo | `waitFor(checkFn, callback, opts)`: reintenta hasta que una condición se cumpla, en vez de que cada consumidor reimplemente su propio `setInterval` + contador. Duplicado a propósito en dos archivos (uno por tipo de script) — un intento de unificarlos rompió en producción. |
| `hook-global.js` / `hook-global-module.js` | clásico / módulo | `hookGlobal(name, fn, opts)`: envuelve una función global existente (`refresh`, `openSheet`, `applyModulos`) sin pisar lo que ya hacía, esperando con `waitFor()` si todavía no existe. Mismo split clásico/módulo que `wait-for.js` y por el mismo motivo. |
| `movimientos.js` | clásico | `abrirDetalleMov()`/`eliminarMovimiento()` — detalle y borrado de cualquier movimiento desde el feed general o el historial de una cuenta; transversal, no pertenece a un solo dominio. |
| `busqueda-global.js` | clásico | Buscador global sobre gastos, deudores, cajitas, cuentas, encargos, personas y movimientos — transversal por naturaleza, no pertenece a un módulo. |
| `lazy-loader.js` | clásico | Motor de carga bajo demanda por pantalla (`Loader.ensure()`): descarga el JS de una pantalla recién cuando el usuario entra a ella, en vez de cargar todo de entrada. |

**Sheets, navegación y UI genérica**

| Archivo | Tipo | Qué hace |
|---|---|---|
| `sheet-stack.js` | clásico | Sistema de apertura/cierre de sheets (`openSheet`/`closeSheet`), `showScreen()`, `applyModulos()` y el wiring legacy de `_initEventListeners()` — un solo sistema lógico, con restricciones de orden de carga documentadas. |
| `sheet-behavior.js` | clásico | Comportamiento de un sheet ya abierto: swipe-to-close, reposicionamiento con el teclado en Android (Visual Viewport) y mantener visible el campo enfocado. Los ajustes automáticos esperan a que no haya toques en curso, para no mover botones bajo el dedo. |
| `wrapped-gate.js` | clásico | Decide si Wrapped está disponible en este momento (solo durante la ventana de enero, ver `wrapped.md`): muestra/oculta la tarjeta `#wrapped-promo` y le avisa a `Loader.ensureAll()` que no precargue el grupo lazy `wrapped` fuera de esa ventana, sin descargar el módulo real solo para saber si mostrarlo. |
| `mas-menu.js` | clásico | Abrir/cerrar el menú "Más", navegación desde sus ítems, y mostrar/ocultar Spotify/Mesada en ese menú según los módulos activos. |
| `gastos-fijos-progress.js` | clásico | Barra de progreso de "gastos fijos pagados este mes" en el panel de Gastos. |
| `mejoras-adicionales.js` | clásico | Ocultar/mostrar saldos (blur), render de salud financiera/proyección/presupuestos tras cada `refresh()`, validación de montos grandes, animación de carga inicial, registro del Service Worker (PWA offline), autofocus del primer campo al abrir un sheet, aria-labels de las pantallas. |
| `personas-init.js` | clásico | Inicializa `_inyectarPersonaSheets()` una vez que los datos cargan. |

**Inputs y validación**

| Archivo | Tipo | Qué hace |
|---|---|---|
| `money-input.js` | clásico | Auto-formateo estilo calculadora para los inputs de plata (`.money-input`): los dígitos se empujan de derecha a izquierda desde los centavos. |

## Estructura de archivos — `js/modules/`

A diferencia de `js/core/`, acá **"clásico"** siempre significa `<script defer>` — no hay ningún módulo `type="module"` en esta carpeta. Lo que sí varía es **cuándo** carga cada uno:

- **Eager** (3 de 15): tienen su propio `<script src="js/modules/archivo.js" defer>` fijo en `index.html`, cargan siempre, desde el arranque.
- **Lazy** (12 de 15): no tienen `<script>` propio en `index.html` — `js/core/lazy-loader.js` los descarga bajo demanda, recién cuando el usuario entra a esa pantalla (`Loader.GROUPS`).

| Archivo | Carga | Qué hace |
|---|---|---|
| `inicio.js` | eager | Dashboard: patrimonio total, salud financiera, proyección, "Necesita atención" (`renderAttencion`), alerta de gasto alto. |
| `gastos.js` | eager | Gastos variables, con o sin tarjeta de crédito, con split de fuentes. |
| `personas.js` | eager | Sistema unificado de identidad (`S.personas`): colores, avatares, edición global compartida por Spotify/Encargos/Deudores/"Me deben". |
| `cuentas.js` | lazy (`cuentas`) | Nequi, efectivo, cajitas, cuentas personalizadas; también Nu (tasa/interés) y CDT. |
| `tarjetas_credito.js` | lazy (`tarjetas`) | Deuda de TC, pagos, fechas de corte, detalle de cada movimiento cargado. |
| `prestado.js` | lazy (`prestamos`) | Préstamos "Me deben"/"Yo debo", incluida su integración con Personas. |
| `encargos.js` | lazy (`encargos`) | Dinero que un tercero encarga guardar, separado de cualquier interés propio que genere. |
| `mesada.js` | lazy (`mesada`) | Mensualidad de papá y mamá, pagos parciales y deuda pendiente. |
| `spotify.js` | lazy (`spotify`) | Suscripción compartida: cobro a integrantes, pago al servicio, ganancia/pérdida del administrador. |
| `alcancia.js` | lazy (`alcancia`) | Ahorro tipo piggy-bank con desglose por origen del depósito. |
| `plata_comprometida.js` | lazy (`comprometida`) | Dinero ya destinado a un gasto futuro, para no contarlo como libre en el patrimonio. |
| `analisis.js` | lazy (`analisis`) | Vista consolidada: balance del mes, patrimonio, proyección, categorías, presupuestos. |
| `wrapped.js` | lazy (`wrapped`) | Resumen narrativo de mes/año. |
| `configuracion.js` | lazy (`config`) | Ajustes, exportar CSV, import/export de backup JSON (incluye la validación de estructura del backup, `_validarEstructuraJSON`). |
| `actividad_reciente.js` | lazy (`historial`) | Feed "Actividad reciente" — de solo lectura, como Inicio. |


## Otros archivos (raíz del proyecto)

| Archivo | Qué hace |
|---|---|
| `css/styles.css` | Hoja de estilos de toda la app. |
| `css/fa-subset.css` | Subconjunto de Font Awesome autoalojado (solo los íconos usados). |
| `sw.js` | Service Worker (PWA offline): `cacheFirst` para fuentes, `networkFirst` para el HTML y el SDK de Firebase (`gstatic.com/firebasejs`), `staleWhileRevalidate` para el resto. **Firestore, Identity Toolkit y SecureToken no pasan por el SW** (el canal de escucha es un stream largo: cachearlo fallaba con `Cache.put() ... network error`, y el fallback respondía HTML con status 200 a requests de Firestore). Toda escritura en caché va por `guardarEnCache()`, con `.catch`. Versión de caché en `VERSION` (bump manual al desplegar). |

---

## Principios que se repiten en toda la app

Aunque cada módulo se documenta por separado, hay reglas de diseño que atraviesan todos ellos:

- **Los movimientos financieros son siempre la fuente de verdad.** Ningún estado visual (un botón, un badge, un flag) debe guardar información propia — todo se deriva de los movimientos ya registrados. Esto evita que la interfaz se desincronice de la plata real.
- **Todo dinero que se mueve por una acción de un módulo dentro de una cuenta (Nequi, efectivo, cajita, cuenta personalizada) deja un "movimiento espejo" visible en el historial de esa cuenta**, marcado como automático y protegido contra borrado directo desde ahí — solo se puede deshacer desde el módulo que lo originó. Así ninguna plata "aparece de la nada" en el historial de una cuenta.
- **Los selectores de "de dónde sale la plata" solo ofrecen lo utilizable:** cuentas con saldo suficiente para el flujo y tarjetas de crédito con cupo disponible (el cupo es obligatorio al crear una TC). Los selectores donde la plata *entra* nunca se filtran por saldo. La regla vive en `js/core/fuentes-filtro.js`; ningún módulo debe reimplementarla.
- **Las tarjetas de crédito nunca son un destino válido para dinero que entra** (mesadas, cobros de Spotify, encargos, préstamos que devuelven plata). Tiene sentido pagar *con* una TC porque genera deuda, pero no existe forma de "guardar" plata ajena o propia dentro de una TC.
- **Eliminar un registro siempre revierte exactamente los efectos de ese registro**, ni más ni menos — incluyendo casos donde la plata terminó repartida entre varias cuentas distintas a lo largo del tiempo (splits, abonos parciales, pagos adelantados).
- **Las decisiones que afectan dinero de otra persona (deudas, encargos, mesadas) requieren una acción explícita del usuario**, nunca se infieren automáticamente de un monto o una fecha.
- **El Sistema de Personas (`S.personas`) unifica la identidad** de las personas con las que hay relaciones financieras (familia, amigos) a través de los distintos módulos (Spotify, Encargos, "Me deben", Deudores), en vez de que cada módulo tenga su propio registro de nombres sueltos y desconectados entre sí.

## Módulos de la aplicación

| Pantalla | Qué hace |
|---|---|
| **Inicio** | Dashboard general: patrimonio total, alertas de "Necesita atención", resumen de plata comprometida |
| **Cuentas** | Saldos y movimientos de Nequi, efectivo, cajitas y cuentas personalizadas |
| **Gastos** | Registro de gastos variables, con o sin tarjeta de crédito |
| **Tarjetas de crédito** | Deuda de TC, pagos, fechas de corte y detalle de cada movimiento cargado |
| **Préstamos → Me deben** | Plata que otras personas te deben a vos |
| **Préstamos → Yo debo** | Plata que vos le debés a otras personas (`S.misDeudas`) |
| **Encargos** | Dinero que un tercero te encarga guardar (separa el capital ajeno de cualquier interés propio que genere) |
| **Mesada** | Mensualidad de papá y mamá, mes a mes, con manejo de pagos parciales y deuda pendiente |
| **Spotify** | Suscripción compartida: cobro a integrantes, pago al servicio, cálculo de ganancia/pérdida del administrador |
| **Alcancía** | Ahorro tipo "piggy bank" con distintos tipos de depósito y desglose por origen |
| **Plata Comprometida** | Dinero ya destinado a un gasto futuro (fijo o con fecha de pago), para no contarlo como libre en el patrimonio |
| **Análisis financiero** | Vista consolidada: ingresos, patrimonio real, proyección a 3/6/12 meses, salud financiera |
| **Wrapped** | Resumen narrativo de mes/año ("Tu resumen"): ahorro, gasto, patrimonio — solo datos inequívocamente propios |
| **Personas** | Sistema unificado de identidad, compartido por Spotify, Encargos, Deudores y "Me deben" |

## Estado de la documentación

Cada módulo se documenta en su propio `.md`, siguiendo la estructura definida en [`plantilla-modulo.md`](./plantilla-modulo.md). El historial de bugs corregidos de todos los módulos vive en un solo [`CHANGELOG.md`](./CHANGELOG.md) compartido, para que el documento de cada módulo se mantenga enfocado en cómo funciona hoy y no crezca indefinidamente con historia ya resuelta.

**Documentados (14 de 14 módulos):** Inicio (`inicio.md`), Cuentas (`cuentas.md`), Gastos (`gastos.md`), Tarjetas de crédito (`tarjetas-credito.md`), Préstamos — Me deben / Yo debo, un solo doc para los dos flujos (`prestado.md`), Encargos (`encargos.md`), Mesada (`mesada.md`), Spotify (`spotify.md`), Alcancía (`alcancia.md`), Plata Comprometida (`plata-comprometida.md`), Análisis financiero (`analisis-financiero.md`), Wrapped (`wrapped.md`), Personas (`personas.md`).

**Sub-documentos de Inicio** (no son módulos de la tabla de arriba, pero tampoco caben dentro de `inicio.md` porque cada uno tiene su propia lógica de cálculo extensa, compartida con Análisis financiero): [`salud-financiera.md`](./salud-financiera.md) (`health-score-card`) y [`proyeccion-financiera.md`](./proyeccion-financiera.md) (`proyeccion-card`).

**Documentación de proyecto (no son módulos):**

| Archivo | Qué es |
|---|---|
| `plantilla-modulo.md` | La guía de estructura que siguen todos los `.md` de módulo — ver más arriba. |
| `guia-estilo-sheets.md` | Orden estándar de campos e inventario de sheets de toda la app. |
| `auditoria-tecnica.md` | Hallazgos técnicos **pendientes** de seguridad, arquitectura o rendimiento — lo ya resuelto vive en `CHANGELOG.md#infraestructura--seguridad`. |
| `CHANGELOG.md` | Historial de bugs corregidos y limpieza de código de todos los módulos, en un solo archivo compartido. |

No se verificó si `configuracion.js` y `actividad_reciente.js` (`js/modules/`, ver tabla de arriba) tienen o deberían tener su propio `.md` — no aparecen como filas en "Módulos de la aplicación" porque son pantallas de utilidad/infraestructura, no un dominio financiero propio, pero es una asimetría que vale la pena decidir a propósito y no dejar así por omisión.
