# Configuración

Documenta cómo funciona **hoy** la pantalla `screen-config` (`js/modules/configuracion.js`). El detalle de qué estaba mal antes y cómo se arregló vive en [`CHANGELOG.md`](./CHANGELOG.md#configuración); el trabajo de arquitectura pendiente/hecho, en [`auditoria-tecnica.md`](./auditoria-tecnica.md).

> **No tiene sheets propios.** A diferencia de la mayoría de los módulos, Configuración no abre ningún `overlay`/`sheet-*` — todo vive inline en la pantalla, y las dos únicas confirmaciones ("Borrar todos los datos", "Eliminar cuenta") usan el `dialogo()` genérico compartido por toda la app, no un sheet dedicado. Por eso no tiene entrada propia en `guia-estilo-sheets.md`.

---

## 1. Secciones de la pantalla

En orden de aparición:

1. **Cuenta** — chip de usuario de Firebase + estado de sincronización.
2. **Seguridad** — PIN de acceso y biometría (huella/Face ID).
3. **Módulos activos** — toggles para ocultar/mostrar Mesada, Spotify y el banner de saldo inicial.
4. **Categorías** — categorías personalizadas de gastos (variables y fijos).
5. **Datos** — copia de seguridad (exportar/importar JSON, exportar CSV) y "Borrar todos los datos".
6. **Zona de peligro** — eliminar cuenta por completo (dispositivo + nube).
7. **Herramientas** — accesos directos a Personas y Actividad reciente.

---

## 2. Cuenta

Muestra el usuario de Firebase conectado (avatar con iniciales, nombre, email) y un indicador de sincronización (`fb-sync-dot` + `fb-sync-text`, actualizados desde el módulo de auth, no desde acá).

El botón **"Salir"** (`data-action="config:signOut"`) invoca `window._fbSignOut()` — vive en el módulo de autenticación de Firebase (núcleo compartido, no en `configuracion.js`), porque gestiona la sesión de toda la app, no solo esta pantalla.

---

## 3. Seguridad (PIN / biometría)

`pin-config-container` y `bio-config-container` son contenedores vacíos que rellena el módulo de PIN/biometría (`window._pinRenderBtn()`, invocado desde el hook de `showScreen('config')`). La tarjeta de biometría (`bio-config-card`) empieza oculta y solo se muestra si el dispositivo la soporta.

Este sistema es el **gate de seguridad de toda la app** — se muestra al abrir Mis Finanzas, no solo desde Configuración — así que su lógica completa vive en el núcleo (`index.html`), fuera de `configuracion.js`. Esta pantalla solo tiene los contenedores donde se inyecta.

---

## 4. Módulos activos

Tres toggles sobre `S.modulos` (`{mesada, spotify, corregirSaldo}`), cada uno con `data-modulo="<nombre>"`:

| Toggle | Efecto al desactivar |
|---|---|
| Mesada de papás | Oculta la pantalla de Mesada y su nav item |
| Spotify compartido | Oculta la pestaña de Spotify en el nav |
| Saldo inicial | Oculta el banner de saldo inicial en Nequi y Efectivo |

**Los datos de un módulo desactivado no se borran** — al reactivarlo, todo sigue igual.

- `toggleModulo(nombre)` (en `configuracion.js`) lee el checkbox, actualiza `S.modulos`, guarda y llama a `applyModulos()`.
- `applyModulos()` **se quedó en el núcleo (`index.html`)**, no en `configuracion.js`: además de reflejar estos toggles, oculta/muestra la pestaña de Spotify en el nav, la pantalla de Mesada, los banners de saldo inicial en Cuentas, y dispara `renderAttencion()` en Inicio — toca varias pantallas, no solo esta.
- Estos `<input type="checkbox">` no usan `onclick` ni pasaron por `Events` (que solo despacha `click`): siguen con `addEventListener('change', ...)` directo, ahora registrado desde `configuracion.js`.

---

## 5. Categorías personalizadas

Dos listas independientes — `S.catsVar` (gastos variables) y `S.catsFijo` (gastos fijos) — con sus valores por defecto en `CATS_VAR_DEFAULT`/`CATS_FIJO_DEFAULT`. **Estas cuatro (`getCatsVar()`, `getCatsFijo()`, y las dos constantes) se quedaron en el núcleo**: las comparte también el módulo de Gastos (selectores de categoría al registrar un gasto).

- `renderCatsConfig()` pinta cada categoría como un chip (`cat-chip`). Las categorías por defecto no llevan botón de eliminar; las agregadas por el usuario sí.
- **Agregar** (`config:agregarCat`, arg `'var'`/`'fijo'`): valida no vacío, máx. 30 caracteres, y que no exista ya (case-insensitive).
- **Eliminar** (`config:eliminarCat`, args `tipo, cat`): bloqueada si es una categoría por defecto, o si está en uso en algún gasto existente (`S.gastosVar`/`S.gastosFijos`) — hay que reasignar esos gastos primero.

Los chips se regeneran enteros en cada `renderCatsConfig()`, así que el botón de eliminar de cada chip usa `Events.attr('config:eliminarCat', tipo, c)` en vez de un `addEventListener` propio por chip — mismo patrón que el resto de listas dinámicas de la app (Cuentas, Encargos, etc.).

---

## 6. Datos

### Copia de seguridad

- **Exportar JSON** (`btn-exportar-json`): descarga `S` completo como `mis-finanzas-backup-<fecha>.json`.
- **Importar JSON** (`btn-importar-json` → dispara el `<input type="file" id="importFileInput">` oculto): pide confirmación (reemplaza *todo* `S`), guarda vía `_fbSaveToCloud()` (no `save()`, porque el DOM todavía muestra los valores viejos en ese momento) y recarga la página.
  - `leerArchivoImport()` tiene una **versión base** en `configuracion.js` y un **override posterior** en `index.html` ("MEJORA 5: Validación") que la reemplaza por una versión con validación de estructura del JSON antes de aceptar el import — mismo patrón que usa `addGastoVar` con Gastos. Ambas piezas siguen funcionando porque `configuracion.js` carga antes que el bloque de overrides.
- **Exportar CSV (gastos)** (`btn-exportar-csv`): arma un CSV con todos los gastos variables y los pagos de gastos fijos, columnas `Fecha, Descripción, Categoría, Monto, Tipo, Cuenta`.

### Borrar todos los datos

`btn-borrar-todo` → `borrarTodo()`: pide confirmación, limpia el historial local, y sobreescribe el documento de Firestore con una estructura vacía (no borra el documento, para no romper el listener `onSnapshot`). Si falla el borrado en la nube (ej. sin conexión), avisa antes de recargar — si no se avisara, al reabrir con conexión el snapshot viejo podría volver a sincronizarse.

---

## 7. Zona de peligro — eliminar cuenta

`config:abrirEliminarCuenta` → `window._abrirEliminarCuenta()`. Igual que "Salir", esta función (junto con `_fbDeleteAccount()`) vive en el módulo de autenticación de Firebase, no en `configuracion.js` — borra el documento en Firestore, cierra sesión y borra todo lo local, no solo lo que gestiona esta pantalla.

---

## 8. Herramientas (accesos directos)

Dos filas que navegan a otras pantallas — `config:irA` con arg `'personas'` o `'historial'` — llaman directo a `showScreen(screen)`. Los subtítulos (`cfg-personas-sub`, `cfg-historial-sub`) se actualizan desde otras pantallas (ej. `renderFeedActividad`), no desde acá.

---

## 9. Arquitectura — qué vive dónde

`js/modules/configuracion.js` es un archivo único (no necesitó dividirse en dos, a diferencia de Spotify/Encargos): no depende de nada definido más abajo en `index.html`, y nada depende de que cargue en un punto específico del documento — carga justo después de `gastos.js`.

**En `configuracion.js`:** `renderCatsConfig`, `agregarCat`, `eliminarCat`, `exportarJSON`, `importarJSON`, `leerArchivoImport` (base), `exportarCSV`, `toggleModulo`, `borrarTodo`, y todo el wiring de esta pantalla (`Events.registerAll('config', ...)` + los `change`/`keydown` que no pasan por `Events`).

**Se quedó en el núcleo (`index.html`), a propósito:**

| Qué | Por qué |
|---|---|
| `applyModulos()` | Toca Cuentas, Mesada e Inicio, no solo esta pantalla |
| `_fbSignOut()`, `_abrirEliminarCuenta()`, `_fbDeleteAccount()` | Auth de Firebase — gestiona toda la sesión |
| Todo el sistema de PIN/biometría | Gate de toda la app, no solo de acá |
| `getCatsVar()`, `getCatsFijo()`, `CATS_VAR_DEFAULT`, `CATS_FIJO_DEFAULT` | Compartidas con el módulo de Gastos |
| Override de validación de `leerArchivoImport()` ("MEJORA 5") | Ver nota en §6 — se deja tal cual, funciona con la base movida |
