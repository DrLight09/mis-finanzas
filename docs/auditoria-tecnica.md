# Auditoría técnica — mis-finanzas (index.html)

Reporte basado en verificación directa del archivo.

> Este documento es distinto a los demás: no describe cómo funciona un módulo ni un bug ya corregido. Son hallazgos de seguridad/arquitectura **todavía pendientes** de resolver — por eso vive aparte y no en `CHANGELOG.md` (que es solo para lo ya corregido). A medida que se resuelve cada punto, se mueve al `CHANGELOG.md` bajo la sección "Infraestructura / seguridad" y se borra de acá.
>
> **Nota de esta revisión (2026-07-16):** se resolvió una buena parte de los hallazgos críticos (CSP, `setDoc` sin manejo de errores, contraste, viewport, SEO, parte del rendimiento) — el detalle de qué se hizo y por qué vive en [`CHANGELOG.md`](./CHANGELOG.md#infraestructura--seguridad). Este documento quedó reescrito para reflejar solo lo que sigue pendiente, más lo nuevo que apareció en el camino.
>
> **Nota adicional (2026-07-16, misma fecha, sesión distinta):** se construyó el sistema reusable de eventos (`js/core/events.js`) y se migró Spotify como primer módulo completo (`onclick` → `data-action`, extracción a `js/modules/spotify.js`, 3 casos nuevos de `.innerHTML` sin escapar corregidos). Detalle en [`CHANGELOG.md`](./CHANGELOG.md#infraestructura--seguridad). Puntos 1, 2 y 3 de abajo actualizados con el avance real.
>
> **Nota adicional (2026-07-17):** se migró Mesada como segundo módulo completo, mismo patrón que Spotify — con dos diferencias: no hizo falta partir el archivo en dos (una sola dependencia real, `crearSplitWidget`, ya definida donde hacía falta), y aparecieron 2 controles estáticos con `onclick`/`onchange` inline que no vivían en las plantillas del módulo (quedaban fuera del barrido). También se repitió el mismo hallazgo de `.innerHTML` que en Spotify (texto libre envuelto en una función, esta vez `fuenteLabel()`), 3 casos corregidos. Detalle en [`CHANGELOG.md`](./CHANGELOG.md#infraestructura--seguridad). Puntos 1, 2 y 3 de abajo actualizados otra vez.
>
> **Nota adicional (2026-07-18):** se migró Encargos como tercer módulo completo. Como Spotify, necesitó dos archivos (`encargos.js` + `encargos-personas.js`) por la misma razón de orden de carga: la integración con Personas depende de funciones definidas más abajo en `index.html`. Se repitió otra vez el mismo hallazgo de `.innerHTML` sin escapar vía función auxiliar (`fuenteLabel()`, `iniciales()`) — esta vez ~18 casos, el conteo más alto de los tres módulos migrados hasta ahora, lo que refuerza que no es un caso aislado. Detalle en [`CHANGELOG.md`](./CHANGELOG.md#encargos). Puntos 1, 2 y 3 de abajo actualizados otra vez.

---

## 🔴 Críticos — pendientes

### 1. Migrar `onclick` inline → `addEventListener` (habilita CSP estricta)

**Estado:** la CSP ya existe (ver CHANGELOG), pero mantiene `'unsafe-inline'` en `script-src` porque la app todavía tiene **190 atributos `onclick="..."` inline** (eran 247, luego 240 tras Spotify, 233 tras Mesada, ver avance abajo). Sin migrarlos todos, no se puede endurecer la CSP de verdad — `'unsafe-inline'` anula buena parte de su protección.

**Avance real:** se construyó el sistema reusable (`js/core/events.js`, ver `CHANGELOG.md#infraestructura--seguridad`) y se migraron **tres módulos completos: Spotify** (7 `onclick` → `data-action`), **Mesada** (7 `onclick` → `data-action`) **y Encargos** (~20 `onclick` → `data-action`, incluyendo los generados dinámicamente en `renderEncargosList`, `renderEncargosEnCuenta`, `abrirEncargoDetalle` y `renderEncargoParts`) — 0 restantes en los tres. Mesada y Encargos mueven plata, a diferencia del criterio de priorización sugerido más abajo ("empezar por los que no mueven plata") — se migraron en su momento porque así se pidió, no por cambio de criterio; la recomendación de dejar los módulos con plata para después de agotar los que no la mueven sigue en pie para lo que queda. Se sigue confirmando lo mismo que ya se había verificado: el resto de los `onclick` pasan ids/índices/valores de listas fijas como argumento, no texto libre de usuario — **no hay hueco de seguridad abierto por esto**, es trabajo de arquitectura pendiente, no un riesgo activo.

**Por qué sigue siendo un hallazgo:** migrar los 240 restantes es lo único que permite quitar `'unsafe-inline'` de la CSP. Con el sistema ya construido y probado en un módulo real, lo que queda es repetir el patrón módulo por módulo — cada uno registra sus acciones con `Events.on(...)`/`Events.registerAll(...)`, sin crear infraestructura nueva.

**Solución:** seguir migrando de a un módulo por vez sobre `js/core/events.js` ya existente: reemplazar `onclick="fn('${x.id}')"` por `${Events.attr('modulo:accion', x.id)}` en el HTML + `Events.on('modulo:accion', fn)` al final del archivo del módulo. Seguir con los módulos sin plata de por medio (Personas) antes que los de movimientos de dinero.

### 2. Auditoría exhaustiva de `.innerHTML` (barrido parcial hecho, no exhaustivo)

**Estado:** se corrigió el bug de fondo de `escHtml()` (no escapaba comillas dobles — un no-op, afectaba a todos sus usos) y se hizo un barrido de las interpolaciones de campos de texto libre con nombres conocidos (`nombre`, `nota`, `notas`, `desc`, `descripcion`, `concepto`, `titulo`, `title`, `razon`) sin escapar dentro de `.innerHTML`/`toast()` — unos 110 casos corregidos. Detalle completo en CHANGELOG.

**Avance real:** al migrar Spotify aparecieron 3 casos más que ese barrido no había agarrado, porque el valor pasaba por una función (`spNombreDe(x)`) y no por el nombre de campo directo — dos en `.innerHTML` (nombre en la fila del integrante, nombre en un atributo `title`) y varios en `toast()`. Corregidos (ver `CHANGELOG.md#infraestructura--seguridad`). Al migrar Mesada se repitió exactamente el mismo patrón, con otra función distinta: `fuenteLabel()` devuelve el nombre de una cajita/cuenta personalizada (texto libre) sin escapar — 3 casos más corregidos en `abrirDetalleMesada()`. Al migrar Encargos se repitió una tercera vez, con el conteo más alto hasta ahora: ~18 casos, otra vez mayormente `fuenteLabel()` (desglose por cuenta, historial, previews de "yo puse la plata"/"ya la usé", traspaso, mover-cuentas, compra con TC) más `iniciales()` en un punto de `renderEncargosList` — corregidos en `CHANGELOG.md#encargos`. Confirma tres veces seguidas el riesgo que ya describía este punto: el barrido por nombre de campo conocido no detecta texto libre que llega envuelto en una función, y no es un caso aislado de un solo módulo — cuantos más módulos se migran, más aparecen.

**Por qué sigue siendo un hallazgo:** el barrido se hizo por nombre de campo conocido, no revisando uno por uno los usos de `.innerHTML` del resto de la app. Cada módulo que se migre de acá en más debería revisarse a mano contra este mismo patrón (texto libre envuelto en una función auxiliar) antes de darlo por cerrado, como ya se hizo con Spotify.

**Solución de fondo (pendiente):** la única forma de cerrar esto de raíz y para siempre es dejar de construir HTML con template strings + `.innerHTML` y migrar a un método que escape por defecto (ej. `textContent` para nodos de solo texto, o una función `h()`/`render()` que fuerce escapado salvo que se pida explícitamente lo contrario). Cambio grande, no se intentó. **Hallazgo puntual nuevo, todavía sin resolver:** `toast()` sigue renderizando su mensaje con `innerHTML` sin escapar — no se tocó porque al menos 3 llamadas de otros módulos le pasan HTML intencional (íconos), y cambiarla de paso hubiera afectado pantallas fuera del alcance de esa sesión. Cuando se toque el núcleo compartido, separar el ícono (HTML de confianza) del mensaje (texto, debe ir escapado).

### 3. Arquitectura monolítica

**Avance real:** tres módulos extraídos. Spotify pasó de vivir inline en `index.html` a `js/modules/spotify.js` + `js/modules/spotify-personas.js` (dos archivos, no uno — por una razón real de orden de carga, no estética; ver `CHANGELOG.md#infraestructura--seguridad`). Mesada pasó a `js/modules/mesada.js` — acá un solo archivo alcanzó, porque su única dependencia real (`crearSplitWidget`, motor compartido con Encargos y "Yo debo") ya estaba definida en un único punto del documento. Encargos pasó a `js/modules/encargos.js` + `js/modules/encargos-personas.js` — mismo motivo de partir en dos que Spotify (la integración con Personas depende de funciones definidas más abajo en el documento); el motor de diferencial/margen y el de split se quedaron en `index.html` porque los comparte con Préstamos, solo se movieron las instancias que Encargos registra en ellos. No todos los módulos van a necesitar partirse en dos como Spotify y Encargos, depende de cuántos puntos de carga distintos exija cada uno. `index.html` bajó de 24.635 a 20.837 líneas. Se mantuvo como `<script src>` clásicos (no ES modules) en los tres casos, a propósito: el estado global (`S`) y los helpers (`save`, `escHtml`, `toast`, etc.) siguen sin extraer, y forzar `import/export` solo para un módulo hubiera exigido tocar ese núcleo compartido de paso — el cambio de mayor riesgo de este punto, que sigue pendiente como se describe abajo.

Para el resto: sin cambios desde la revisión anterior. ~1.3 MB repartidos ahora en `index.html` + 3 archivos nuevos, cientos de funciones globales, 13 pantallas y ~46+ sheets sin separación real de responsabilidades.

**Solución (gradual, sin reescribir todo):**
1. Seguir extrayendo módulos a `js/modules/` (uno por vez, mismo patrón que Spotify) antes de intentar pasar a ES modules de verdad.
2. Extraer el núcleo compartido (`S`, `save`, `refresh`, helpers de formato/escapado) a `js/core/` — recién ahí tiene sentido convertir todo a `<script type="module">` con `import`/`export` real.
3. Namespace único (`S.encargos.xxx` en vez de funciones sueltas globales) — ya existe el patrón `S.personas`, `S.ingresosFijos`, extenderlo a todo.
4. Bundler ligero (Vite/esbuild) solo para desarrollo, deployando igual un único `index.html` a GitHub Pages.

**Trade-off:** dividir en módulos hace más fácil depurar un bug aislado, pero más difícil rastrear un bug que se origina en un módulo y se manifiesta en otro, si no se sabe qué módulos comparten estado — el namespace único (punto 3) es lo que evita ese problema, debe ir de la mano con la modularización.

### 4. Rendimiento (parcialmente resuelto)

**Resuelto** (ver CHANGELOG para el detalle): Font Awesome/Google Fonts ya no bloquean el render, `preconnect`/`modulepreload` a los dominios de Firebase, minificación disponible como paso de build. Medido: **LCP 7.4s → 5.2s**.

**Sigue pendiente — y es la causa principal de lo que queda:**
- **La UI real depende de que termine toda la cadena de Auth/Firestore antes de mostrarse.** Ya existe una pantalla de carga visible al instante (logo + "Cargando Mis Finanzas"), pero el contenido real de la app (lo que Lighthouse mide como LCP) no aparece hasta que `onAuthStateChanged` → PIN gate → `_fbLoadData()` → `_launchApp()` terminan en cadena. Resolverlo de verdad requiere reestructurar ese arranque — **no se tocó**, es el cambio de mayor riesgo de toda la auditoría (puede introducir carreras entre el PIN gate y el auth) y no se quiso hacer sin pruebas en vivo paso a paso.
- **TBT (Total Blocking Time) medido en 8,980 ms** — muy alto, el hilo principal bloqueado casi 9 segundos. Misma causa raíz que el punto 3 (monolito): todo el JS de las 13 pantallas se parsea/ejecuta de una sola vez aunque el usuario solo esté viendo una. La minificación ayuda al tamaño de descarga pero no reduce el trabajo de ejecución en sí — eso solo se resuelve dividiendo el código por pantalla (mismo esfuerzo que el punto 3, con beneficio directo acá).
- **JS no usado:** ~526 KiB según la corrida más reciente de Lighthouse — mismo problema, todo se carga aunque no se use.
- **Font Awesome sin subsetear:** sigue cargándose completo desde cdnjs. No se pudo self-hostear un subconjunto de íconos en esta ronda por falta de acceso de red al CDN desde el entorno de trabajo — queda pendiente, hacerlo requiere bajar y re-alojar los archivos de fuente reales.
- **Cache lifetimes (~80 KiB de ahorro estimado):** depende de cabeceras HTTP de terceros (cdnjs, Google Fonts) o de GitHub Pages — no configurable desde el código, mismo límite que CSP/COOP.
- **Tamaño del DOM** (4,021 elementos) y **20 long tasks**: sin cambios, consecuencia directa del monolito.

---

## 🟡 Advertencias — pendientes

| Problema | Estado |
|---|---|
| Sin tests | Pendiente. Priorizar funciones de cálculo puras: `calcPatrimonioTotal()`, amortización, `calcHealthScore()`. |
| Solo 11 `aria-label` en toda la app | Pendiente, sin cambios. |
| CSS inline (44.7 KB) | Pendiente. Extraerlo a `styles.css` externo permitiría cachearlo aparte del HTML — pero es un cambio de arquitectura de despliegue (pasa de un archivo a dos), no se hizo sin discutirlo primero. |
| Imágenes base64 embebidas (3, ~1.4 KB) | Impacto bajo, sigue sin ser prioridad. |
| Service Worker (`sw.js`) | ✅ **Confirmado funcionando en producción** — se sacó de esta tabla, ver CHANGELOG. |

---

## ⚪ Puntos descartados (falsos positivos de revisiones anteriores)

- ~~"4 marcadores TODO/FIXME/HACK"~~ — descartado, eran la palabra "TODO" dentro de texto normal.
- ~~"Funciones muertas: `onOk`, `hideTT`, `addSpotify`, `importarJSON`"~~ — descartado, las cuatro están en uso.
- **"Patrón 'Dividir ÷' repetido"** — dejó de ser un hallazgo de arquitectura: al revisarlo de cerca, ya existía un sistema compartido (`crearSplitWidget`) usado en 4 de los módulos. Lo que sí había eran bugs puntuales de sincronización de color en los módulos que no usaban ese sistema (Préstamos, Encargos) — corregidos, ver CHANGELOG bajo esos dos módulos. No se unificó todo bajo `crearSplitWidget` porque no hacía falta: el problema real era más chico de lo que parecía.

---

## Priorización sugerida (actualizada)

1. **Migrar los 190 `onclick` restantes → `data-action`/`Events`**, de a un módulo por vez sobre el sistema ya construido (`js/core/events.js`, probado en Spotify, Mesada y Encargos), priorizando los que no mueven plata (habilita quitar `'unsafe-inline'` de la CSP).
2. **Reestructurar el arranque para no depender de toda la cadena de Auth/Firestore antes del primer contenido real** — el cambio de mayor impacto en rendimiento que queda, y el de mayor riesgo. Hacer con pruebas en vivo paso a paso, no de una sola vez.
3. **Modularizar por dominio** (resuelve monolito, JS no usado, TBT y tamaño del DOM a la vez — mismo trabajo que el punto 2 en buena parte).
4. Self-hostear un subconjunto de Font Awesome (requiere acceso al CDN para bajar los archivos reales).
5. Extraer CSS a archivo externo (decisión de arquitectura de despliegue, discutir antes de hacerlo).
6. Segunda pasada de auditoría de `.innerHTML` si se agregan campos de texto libre nuevos al modelo de datos.
7. Tests unitarios de las funciones de cálculo financiero puras.
8. Agregar `aria-label`s faltantes (accesibilidad, bajo impacto pero fácil de hacer de a poco).
