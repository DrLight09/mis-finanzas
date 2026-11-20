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

Bloques (en orden de celular): patrimonio (`inicio-patrimonio`: hero, cuentas, neto de TC), tarjetas (`tc-deuda-card`), gastos del mes (`inicio-gastos`), salud financiera (`inicio-salud`), proyección (`inicio-proyeccion`), necesita atención (`s-attn-section`).

En PC: columna principal = patrimonio, gastos y proyección lado a lado. Riel = necesita atención, tarjetas de crédito, salud financiera.

## 6. Cuentas

Paneles de `#screen-cuentas` (uno a la vez, por la clase `panel-activo`): selector, archivadas, detalle simple, detalle Nu, detalle de cajita, sub-meta y sub-CDTs. `_showCuentasPanel` también deja el panel visible en `data-panel-activo` de la pantalla.

En PC: lista (`cuentas-selector`, siempre visible) | centro (el panel activo) | movimientos (`cuenta-movimientos-simple` o `cuenta-movimientos-nu`, solo con el detalle simple o el de Nu). La cajita, Archivadas y las subpantallas ocupan el centro y parte del ancho de la columna de movimientos. Entre 900 y 1279 px la columna de movimientos pasa debajo del centro.

Selección por defecto (`_abrirCuentaPorDefecto`, `cuentas.js`): solo en PC y solo si no hay cuenta abierta; es automática y se deshace al achicar a celular mientras la persona no haya cambiado de panel.

## 7. Gastos

Panel de variables (`panel-var`: filtro de mes, lista, total) y panel de fijos (`panel-fijo`: barra de progreso, lista, total), alternados en celular por las pestañas (`switchGastoTab`, clase `panel-activo`). En PC, arriba va el resumen del mes (`gastos-resumen`: total gastado, variables y fijos, pintados por `refresh()` con los mismos números de Inicio; oculto en celular); debajo, los dos paneles a la vez: variables a la izquierda, fijos en el riel derecho (`--riel-ancho`); la barra de pestañas se oculta y se muestran los títulos `gastos-panel-titulo`. No hay reparto de columnas por JS: los dos paneles ya son hermanos contiguos en el HTML.

## 8. Lista de cuentas

Fila compacta por cuenta (`.cuenta-card`) solo en PC: ícono, nombre y etiqueta, saldo, flecha; una columna. Solo en PC (decisión de Sebas: le gustó más en el prototipo que las tarjetas grandes). En celular se conservan las tarjetas de dos por fila, sin que la última de una cantidad impar ocupe todo el ancho. Nombre y saldo en el color de la cuenta.

## 9. Tarjetas de crédito

`#tc-lista` en cuadrícula (`minmax(380px,1fr)`); sin reparto de columnas por JS. Las acciones y los movimientos de cada tarjeta siguen siendo los de la app (botones de la tarjeta y hoja «Ver»).

## 10. Prestado

Paneles de `#screen-prestamos` (por clase `panel-activo`): `deudoresView`, `deudorDetalle`, `misDeudasView`, `miDeudaDetalle`. En PC, como el prototipo: arriba el resumen (`prestamos-resumen`: tarjetas Me deben / Yo debo / neto, barra de proporción y porcentajes, pintados por `refresh()`; oculto en celular); debajo, las pestañas «Me deben · N / Yo debo · N» (siempre visibles), la lista de la pestaña activa (400 px) y el detalle activo en el ancho restante. Solo se ve una lista a la vez: la pestaña la deja `_mostrarPanelPrestamos` en `data-tab-prestamos` de la pantalla (se deriva del panel, así abrir a alguien de Yo debo desde otro módulo cambia de pestaña). Las pestañas son la parte de arriba de la caja de la lista y tienen medida fija; la lista conserva siempre su columna (sin nadie abierto, a la derecha queda vacío). Entre 900 y 1279 px la lista mide 320 px. Selección por defecto: `_abrirPersonaPorDefectoPrestamos` (prestado.js): al entrar, la primera persona de la pestaña (si está vacía, la de la otra); al tocar una pestaña, la primera de esa pestaña (si está vacía se queda en su lista vacía).

## 10 bis. Mesada

Como el prototipo (`Mesada.dc.html`, `MesadaMesPendiente.dc.html`, `MovilMesada.dc.html`). En PC el título y la tira de años (`#anio-tira`, dentro de `<header>`, solo visible con `#screen-mesada.active` vía `:has()`) van en la cabecera; `#mesadaSection` es una cuadrícula de 10 columnas: resumen (`.mesada-stat` ×2 y `.mesada-pendiente` si hay pendiente, `data-pendiente="si"`: 3 + 3 + 4 columnas; sin pendiente 5 + 5) y debajo Papá y Mamá (`.mesada-persona`, 5 columnas cada una, del alto de su contenido, «Cuota 2026» encima del campo de la cuota (a la derecha del nombre), meses en 4 columnas). Entre 900 y 1279 px también van lado a lado (la tira y el buscador se angostan). En celular: `.mesada-titulo-fila` (título + selector de año), resumen en dos cuadros + «Pendiente» a todo el ancho y las tarjetas apiladas, con la cuota a la derecha del nombre y los meses en 4 columnas con el monto debajo (misma cuadrícula `.mesada-grid` / `.mes-dot` que PC; en PC solo cambian el hueco y el alto). Sin reparto de columnas por JS.

## 10 ter. Spotify y buscador

Spotify: `spotify-principal` (costo y cuenta, resumen, integrantes, estadísticas) y `spotify-historial` (historial de pagos, en caja) como dos columnas; entre 900 y 1279 px el historial va debajo. Buscador: en PC el botón `btn-buscar-global` muestra `buscar-texto` y `buscar-atajo` (ocultos en celular) y se ve como el campo del prototipo; el atajo Ctrl/Cmd + K lo acciona (`eventos-base.js`).

## 10 quater. Encargos, Alcancía y Plata comprometida

Encargos: paneles `encargosListView` y `encargoDetalle` (por clase `panel-activo`, `data-panel-activo` en la pantalla); en PC, lista | detalle, con selección por defecto del primer encargo (`_abrirEncargoPorDefecto`, encargos.js). Alcancía: cuadrícula de dos columnas; `alcancia-no-iniciada` / `alcancia-activa` a la izquierda y `alcancia-progreso` (progreso entre ciclos e historial) en el riel; entre 900 y 1279 px el riel va debajo. Plata comprometida: `#cp-lista` en cuadrícula (`minmax(380px,1fr)`).

## 10 quinquies. Análisis y Configuración

Ambas pantallas usan columnas CSS en PC (`column-count:2`, una sola columna entre 900 y 1279 px): cada hijo directo tiene `break-inside:avoid` y los títulos `break-after:avoid`. `analisis-resumen` (resumen del mes), `wrapped-promo` y `cfg-mis-wrapped` abarcan todo el ancho (`column-span:all`). Para agregar un bloque nuevo a estas pantallas basta con ponerlo como hijo directo de la pantalla.

## 10 sexies. Personas

Excepción: Personas se hace como el prototipo (no solo se acomoda). En PC: resumen (`personas-resumen`) y cuadrícula de tarjetas (`#lista-personas-body`, una caja por persona: relación, «Saldo neto» y etiquetas); la ficha (`personas-ficha`, ids `pficha-*`, 440 px) aparece al tocar una persona; el resumen y las tarjetas siguen a la vista (las tarjetas pasan a 2 columnas) y la ficha ocupa toda la altura a la derecha. Al abrir no hay nadie elegido; tocar la persona abierta, o salir de la pantalla, cierra la ficha. `data-ficha-abierta` ("si" / "no") y `data-lista-vacia` de la pantalla lo deciden por CSS. `abrirPerfilPersona` (personas.js) pinta el perfil en la ficha si la ventana es de PC (navegando a la pantalla si hace falta) o en la hoja `sheet-perfil-persona` (ids `pperf-*`) en celular; es el único constructor del perfil. El saldo neto de la tarjeta es préstamos − Yo debo (el encargo no entra: es plata ajena). Celular: la fila de siempre.

## 11. Cajas (solo PC)

La información va dentro de un cuadro (`--bg2`, borde, radio 14, relleno 14) sobre el fondo; lo de adentro (`.card`, `.stat`, `.gasto-item`) usa `--bg3`. Selectores en `pc.css`: `#panel-var`, `#panel-fijo`, `#deudoresView`, `#misDeudasView`, `#deudorDetalle`, `#miDeudaDetalle`, `#spotify-historial`, `#encargosListView`, `#encargoDetalle`, `#alcancia-activa`, `.columna-lista`, `.columna-movimientos` y `#tc-lista > .empty-state`. Las pantallas que falten deben usar el mismo criterio (un cuadro por bloque de información, no la información suelta sobre el fondo).

## 12. Prueba

Automática: la FASE 5 de `npm run smoke` (ida y vuelta celular ↔ PC con Inicio y Cuentas).

A mano: redimensionar 1366 → 1100 → 800 → 430 → 360 → 1366 con una pantalla, una hoja y un formulario abiertos: no debe perderse ninguno ni quedar un bloque fuera de su sitio al volver a celular.


## Marca y título de sección

En PC el menú lateral lleva arriba el logo y «Mis finanzas» (`menu-lateral-marca`) y el `<h1>` de la cabecera muestra el nombre de la sección (`#hSeccion`, `titularSeccion` en `disposicion-pc.js`); en celular el `<h1>` sigue siendo «Mis finanzas».


## Alto completo, Mesada y Tarjetas (parte 17)

En PC las pantallas de columnas ocupan exactamente el alto de la ventana (`height:100%`) y cada caja hace scroll por dentro (barra oculta); la página no crece (parte 18). Mesada: año, resumen y Papá | Mamá con meses en 4 columnas. Tarjetas: resumen, lista (420 px) y panel `#tc-detalle` con la tarjeta elegida (`_tcSelId`). Prestado: `#prestamos-columna` es la caja de pestañas + lista. En celular el perfil de una persona es la ficha a pantalla completa con botón «Personas».
