# Auditoría técnica — mis-finanzas (pendientes)

> Este documento es distinto a los demás: no describe cómo funciona un módulo ni un bug ya corregido — es la lista de lo que sigue **genuinamente pendiente** de seguridad, arquitectura o rendimiento. Todo lo que ya se resolvió (CSP, escapado de `.innerHTML`, la modularización completa a 14 archivos + carga lazy, y la mayor parte del trabajo de rendimiento) se condensó en [`CHANGELOG.md`](./CHANGELOG.md#infraestructura--seguridad) el 2026-09-22 — este archivo llegó a 886 líneas, casi todas de hallazgos ya cerrados narrados sesión por sesión, y se redujo a esto.

---

## Rendimiento — pendiente

- **Minificar JS (~120 KiB estimados de ahorro, Lighthouse).** Ninguno de los archivos de `js/core/`/`js/modules/` está minificado. Requiere un paso de build (Vite/esbuild) que hoy no existe — GitHub Pages sirve los archivos tal cual se suben.
- **Cache TTL de GitHub Pages (~172-419 KiB según cuántos módulos lazy entren en la ventana de medición).** Todos los archivos sirven con TTL de 10 minutos, no configurable desde el código sin pasar por un CDN. Limitación estructural, no un bug.
- **CLS intermitente de `#health-score-card` (0.236 en 1 de 3 corridas de Lighthouse), sin diagnosticar.** El resto de las causas de CLS (overlay de PIN, `.app{display:none}`, cards sin `min-height`) ya se resolvieron — esta es la única que queda suelta. Para diagnosticarla hace falta `PerformanceObserver('layout-shift', {buffered:true})` con CPU 4× y Slow 4G, confirmando cuántos tips puede devolver `calcHealthScore()` en la práctica (la estimación de alto del skeleton puede quedarse corta si son más de los asumidos).
- **Imágenes base64 embebidas (3, ~1.4 KB).** Impacto bajo, nunca fue prioridad.

## Arquitectura — sugerencias sin comprometer

Del plan original de modularización, los puntos 1 y 2 (extraer módulos a `js/modules/`, núcleo compartido a `js/core/`) y el punto 5 (carga lazy por pantalla) están dados. Quedan sin decidir:

- **Namespace único** (`S.encargos.xxx` en vez de funciones sueltas globales) — ya existe el patrón en `S.personas`/`S.ingresosFijos`, extenderlo al resto es una decisión de diseño grande, no un bug.
- **Bundler ligero (Vite/esbuild) solo para desarrollo**, deployando igual un único `index.html`+`styles.css` a GitHub Pages — habilitaría la minificación de arriba.
- **`window.refresh` parcheado en cadena por 6 archivos distintos.** Discutido con el usuario (2026-09-08), no implementado a propósito por ahora.

## Buenas prácticas a repetir (no hallazgos)

- **Segunda pasada de auditoría de `.innerHTML`/escapado** cada vez que se agregue un campo de texto libre nuevo al modelo de datos de cualquier módulo — la migración a `html\`\`` cubre lo que existe hoy, no lo que se agregue después.
- **Tests unitarios de las funciones de cálculo financiero puras** (`calcC`, `calcCDT`, `calcPatrimonioTotal`, `calcHealthScore`, etc.) — ya existe un harness con el test runner nativo de Node (`node --test`) cubriendo algunas; falta ampliar la cobertura a medida que se tocan.
