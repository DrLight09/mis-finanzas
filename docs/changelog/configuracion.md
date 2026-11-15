# Historial: Configuración

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Configuración

### 🐛 Corregido (2026-10-24) — «Borrar todos los datos» dejaba activos el PIN y la huella (`configuracion.js`, `pin-bio.js`)

*(Mejora 9.)* **Causa raíz:** `borrarTodo()` solo escribía `{}` en Firestore y recargaba. El PIN, su activación y la huella viven en `localStorage` de este dispositivo (`mf_pin`, `mf_bio_enabled`, `mf_bio_cred`), dentro del IIFE de `pin-bio.js` (módulo ES), y nada del borrado los tocaba: al recargar, `_pinGate()` seguía encontrando un PIN y lo pedía para una app ya vacía. Se revisó dónde más podía guardarse algo de esto: no hay PIN en `sessionStorage`, IndexedDB ni cookies (IndexedDB solo la usa la sesión de Firebase Auth, que a propósito sigue abierta tras borrar los datos).
- **`pin-bio.js`:** nueva `window._pinReset()` (`_delPin()` + `_delCred()` + repintar los botones de Configuración). `_delCred()` borra la activación de la huella y el id de la credencial; el sensor del dispositivo no se toca, solo la configuración de la app.
- **`configuracion.js`:** `borrarTodo()` la llama **solo si el borrado en la nube se confirmó**. Si falló (sin conexión), el PIN se conserva: al reabrir, el snapshot viejo de la nube puede volver y tiene que seguir protegido. Las confirmaciones de seguridad no cambian.
- **No se reutilizó `_limpiarStorageLocal()`** (la de «Eliminar cuenta»): borra todas las claves `mf_*`, incluida `mf_lastSavedAt`, que `borrarTodo()` fija justo antes a propósito para que un snapshot viejo no pise el borrado.
- **Pantalla de PIN al reabrir:** no hace falta tocarla; tras el reload `_pinGate()` no encuentra PIN y lanza la app directo.
- **Prueba:** `tests/nucleo.test.js` → `borrar-todo-pin` (carga el `pin-bio.js` real quitando solo sus `import`, y el `borrarTodo()` real): tras borrar no quedan las tres claves, `mf_lastSavedAt` y `mf_auth_hint` se conservan, Configuración muestra «Activar PIN de acceso» y `_pinGate()` lanza la app sin abrir la pantalla de PIN; con la nube caída el PIN se conserva; cancelar no borra nada. **Falla con el código anterior.**

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
