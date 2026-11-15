# Historial: Personas

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Personas

### ✅ Confirmado — Sin hallazgos de escapado (verificado solo contra `index.html`)

*(2026-07-28)*

~15 sitios donde interpola texto libre (`nombre`, `nota`, iniciales, término de búsqueda) ya pasan por `escHtml()`. Diferencia con las confirmaciones anteriores: no se recibió el archivo `personas.js`, solo lo que `index.html` deja ver (`<script src>`, `data-action` estáticos, comentarios de migración) — no se verificó línea por línea contra el código fuente como sí se pudo hacer con los ocho módulos anteriores.

### ✅ Corregido — Migrado a `html\`\`` completo, incluida `abrirPerfilPersona()` (~250 líneas)

*(2026-08-26, primero de los seis módulos que quedaban)*

Los tres sitios con texto libre se convirtieron a `html\`\``: `_renderListaPersonas()` y `_selPersonaFiltrar()` (nombre + iniciales de persona/deudor/mi-deuda, badges de estado antes armados a mano con `+`/template strings sin tag, ahora fragmentos `html\`\`` interpolados directo sin `.join()`, más el término buscado `q` en el mensaje "No se encontró") y **`abrirPerfilPersona()`** — la función más grande del archivo, con una estructura más densa: bloques `${cond ? \`<div>...</div>\` : ''}` con HTML literal anidado dentro de otros `${}`. Cada uno de esos bloques anidados se convirtió a `html\`\`` también, así el fragmento interno llega marcado `__raw` y el `html\`\`` exterior lo interpola sin re-escaparlo — nada de `raw()` a mano salvo en `Events.attr(...)`.

Ningún hallazgo nuevo de escapado — los cuatro sitios ya escapaban bien con `escHtml()` antes de esta migración. Los `toast()` se dejaron con `escHtml()` a mano, mismo criterio de siempre. `_renderColorPicker()` no se tocó por no tener texto libre que corregir.

Validado con `node --check` y una simulación jsdom con un payload malicioso (`<img src=x onerror=alert(1)>"'&`) inyectado en el nombre de persona/deudor/mi-deuda y en las cinco notas de texto libre de `abrirPerfilPersona()` — las cinco aparecen escapadas en el DOM resultante, cero HTML sin escapar, sin romper la estructura de grids/badges/botones alrededor. **Sin prueba en navegador real** (jsdom, no un navegador).
