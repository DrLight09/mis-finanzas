# Versión PC

Cómo se acomoda la app para pantallas de PC (objetivo 1366×768). Explica cómo funciona **hoy**; el historial vive en [`CHANGELOG.md`](./CHANGELOG.md).

## 1. Qué es y qué no es

Es solo una **distribución**: la app conserva sus componentes, colores, botones y textos. Lo que se agrega vive en `css/pc.css` (reglas dentro de `@media`) y `js/core/disposicion-pc.js` (reparto de columnas). Un solo `index.html` y los mismos JS. El rediseño visual va después, para PC y celular juntos.

## 2. Modos según el ancho

| Ancho | Modo | Qué se ve |
|---|---|---|
| 1280 px o más | PC completo | Menú lateral con grupos; en Inicio, columna principal + riel derecho |
| 900 a 1279 px | PC compacto | Menú lateral solo con íconos; el riel pasa debajo del contenido |
| Menos de 900 px | Celular | La app de siempre: barra inferior, hojas desde abajo |

El modo lo decide **solo el CSS** (`@media`). No hay JS que elija entre celular y PC, así que redimensionar no recarga nada: la pantalla abierta, las hojas y los formularios se conservan.

## 3. Reglas que no se rompen

1. Por debajo de 900 px nada de `pc.css` aplica, salvo ocultar el menú lateral.
2. Los bloques de una pantalla nunca se duplican para PC: se mueven (los mismos nodos, con sus ids y listeners) y vuelven a su sitio exacto.
3. Los módulos que pintan un bloque lo hacen por id; no deben depender de en qué contenedor está.
4. Las pantallas sin distribución de PC conservan su columna de celular (640 px, centrada).
5. Nada de texto, botón o dato que la app no tenga: si el prototipo lo traía, se pregunta antes.
6. `pc.css` sin `!important` ni colores sueltos (variables de `:root`).

## 4. Piezas

- **Menú lateral** (`aside.menu-lateral` en `index.html`): mismos destinos que la barra inferior y el menú «Más» (`data-screen` → `showScreen`). Grupos: Mi plata / Con otras personas / Planear y entender; al pie, Configuración y el estado de sincronización (`lateral-sync-*`, lo actualiza `setSyncStatus` junto al de Configuración). Spotify y Mesada se ocultan según los módulos activos.
- **Hojas:** en PC son ventanas modales centradas (hasta 520 px). El arrastre y el ajuste por teclado de `sheet-behavior.js` dependen de eventos táctiles y del teclado virtual, que en PC no se producen.
- **Atajo Ctrl/Cmd + K:** abre la búsqueda global (solo en PC).
- **Reparto de columnas** (`disposicion-pc.js`): tabla `DISPOSICIONES`, pantalla → columnas → ids de bloque. Para sumar una pantalla se agrega una entrada y sus estilos en `pc.css`.

## 5. Inicio

Bloques (en orden de celular): patrimonio (`inicio-patrimonio`: hero, cuentas, neto de TC), tarjetas (`tc-deuda-card`), gastos del mes (`inicio-gastos`), salud financiera (`inicio-salud`), plan de deudas (`plan-deudas-card`), proyección (`inicio-proyeccion`), necesita atención (`s-attn-section`).

En PC: columna principal = patrimonio, gastos y proyección lado a lado, plan de deudas (solo si hay deudas). Riel = necesita atención, tarjetas de crédito, salud financiera.

## 6. Prueba

Redimensionar 1366 → 1100 → 800 → 430 → 360 → 1366 con una pantalla, una hoja y un formulario abiertos: no debe perderse ninguno ni quedar un bloque de Inicio fuera de su sitio al volver a celular.
