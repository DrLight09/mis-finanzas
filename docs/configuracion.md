# Configuración

## 1. Objetivo

Pantalla de ajustes de la app y, sobre todo, el lugar donde el usuario controla el destino de sus datos: activar o desactivar módulos, personalizar las categorías de gastos, sacar copias de seguridad (JSON y CSV), restaurarlas, y borrar todo. También aloja el acceso a la sesión (chip de cuenta, cerrar sesión, eliminar cuenta), a la seguridad (PIN y biometría) y a las pantallas poco usadas (Personas, Notificaciones, Actividad reciente).

Es una pantalla de **utilidad/infraestructura**, no un dominio financiero: casi todo lo que muestra o dispara pertenece a otro archivo. Este documento cubre lo que realmente vive en `configuracion.js` y deja claro qué se queda fuera a propósito.

---

## 2. Conceptos importantes

| Término | Qué significa |
|---|---|
| **Módulo activo** | Interruptor que muestra u oculta una parte de la app (Mesada, Spotify, banner de saldo inicial). Es solo visibilidad: **no borra ni altera datos**. |
| **Categoría predeterminada** | Las que vienen con la app (`CATS_VAR_DEFAULT` / `CATS_FIJO_DEFAULT`). Nunca se pueden eliminar. |
| **Categoría propia** | Las que agrega el usuario. Se guardan en `S.catsVar` / `S.catsFijo`. |
| **Copia de seguridad** | Un JSON con el contenido completo de `S`. Se puede exportar e importar. |
| **Borrar todos los datos** | Vacía la nube y recarga; **la cuenta y la sesión siguen existiendo**. |
| **Eliminar cuenta** | Borra el documento de datos *y* el usuario de Firebase Auth, limpia el almacenamiento local y cierra sesión. Vive en la "Zona de peligro" y no es parte de este módulo (ver §3). |
| **Cerrar sesión** | Guarda una última vez, cierra sesión y recarga. Datos intactos en la nube. Tampoco es de este módulo. |

Las tres últimas se confunden fácil: están en la misma pantalla, con botones distintos, y hacen cosas muy diferentes.

---

## 3. Reglas que nunca deben romperse

**Importar un backup**
- Nunca se reemplaza nada sin (a) validar la estructura del archivo y (b) una confirmación explícita del usuario, con el aviso de que no se puede deshacer.
- La app **solo se recarga después de que el guardado en la nube se confirmó** (`ok:true`). Si el guardado falla, no se recarga: los datos quedaron solo en memoria y recargar los perdería (o traería de vuelta el dato viejo de la nube). El toast tiene que decir la verdad: nunca "importado correctamente" sin esa confirmación.
- Mientras dura la importación, el listener de tiempo real ignora los snapshots de la nube (`window._importing`), para que los datos viejos no pisen los recién importados.
- `S` se reemplaza **en su mismo objeto** (se borran las claves y se reasigna), nunca con `S = data`: el resto de la app y `window.S` comparten esa referencia.

**Borrar todos los datos**
- Es una acción destructiva con confirmación explícita.
- Entre la confirmación y el `location.reload()` final **la app tiene que quedar bloqueada** (overlay `#fb-loading-screen`). `borrarTodo()` no vacía `S` en memoria: solo escribe el estado vacío en la nube. Si en esa ventana se pudiera tocar "Cerrar sesión", el guardado final de `_fbSignOut()` volvería a subir el `S` viejo y anularía el borrado.
- Si no se pudo confirmar el borrado en la nube, el usuario tiene que enterarse antes del reload.

**Categorías**
- Una categoría predeterminada no se elimina.
- Una categoría **en uso** (algún gasto variable o fijo existente la referencia) no se elimina: primero hay que cambiar esos gastos.
- No puede haber dos categorías con el mismo nombre (sin distinguir mayúsculas), ni vacías, ni de más de 30 caracteres.

**Módulos activos**
- Desactivar un módulo **conserva sus datos**; reactivarlo lo deja exactamente igual.
- El estado de cada interruptor vive en `S.modulos`; el interruptor no guarda estado propio.

**Reparto de responsabilidades (núcleo compartido)**
- Este archivo **no define** y no debe reimplementar: `applyModulos()`, `_fbSignOut()`, `_abrirEliminarCuenta()` / `_fbDeleteAccount()`, el gate de PIN y biometría, ni `getCatsVar()` / `getCatsFijo()` / los `*_DEFAULT`. Solo los invoca. Son de toda la app, no de esta pantalla.

**Datos propios**
- Configuración no introduce estado nuevo fuera de `S.modulos`, `S.catsVar` y `S.catsFijo`. Todo lo demás se lee o se deriva de `S`.

---

## 4. Modelo de datos

Configuración escribe tres claves en `S`:

```js
S.modulos  = { mesada: true, spotify: true, corregirSaldo: true }
S.catsVar  = ['Comida', 'Transporte', /* ... predeterminadas + propias */]
S.catsFijo = ['Arriendo', /* ... predeterminadas + propias */]
```

- `modulos` — un booleano por módulo. El `S` por defecto (`core-state.js`) nace con solo `{ mesada: true, spotify: true }`: `corregirSaldo` **no existe hasta que el usuario toca ese interruptor por primera vez**. El fallback de `toggleModulo()` (crear los tres en `true` si `S.modulos` faltara del todo) casi nunca se ejecuta. Lo leen `applyModulos()` (visibilidad) y `wrapped.js` (solo cuenta Mesada si `modulos.mesada`).
- `catsVar` / `catsFijo` — nacen **vacías**; vacía significa "usar las predeterminadas" (`getCatsVar()` / `getCatsFijo()` devuelven entonces una copia de la constante). Al agregar la primera categoría propia se guarda la lista **completa** (predeterminadas y propias mezcladas). Qué es predeterminada se decide comparando contra las constantes, no con un flag en el dato.

**Fuera de `S` (lo que este módulo toca):**

| Dónde | Qué |
|---|---|
| Firestore `usuarios/{uid}/data/finanzas` | `{ payload: <JSON de S>, updatedAt }`. `borrarTodo()` escribe `payload: "{}"`. |
| `localStorage` `mf_lastSavedAt` | Marca de último guardado; se actualiza al importar y al borrar. |
| `window._lastSavedAt`, `window._importing` | Banderas de sincronización que import/borrado manipulan a mano. |

**Formato del backup:** `mis-finanzas-backup-AAAA-MM-DD.json` = `JSON.stringify(S, null, 2)`.

**Formato del CSV:** `gastos-AAAA-MM.csv` (año y mes del día de la exportación), con BOM UTF-8 y comillas dobles escapadas. Columnas: `Fecha, Descripción, Categoría, Monto, Tipo, Cuenta`. Los montos salen en negativo.

---

## 5. Flujo

**Importar un backup**
```
Botón "Importar JSON" → se abre el selector de archivo → se lee el texto
  → JSON.parse (si falla: "no es un JSON válido")
  → _validarEstructuraJSON (si hay errores: se muestran y se corta, S intacto)
  → diálogo de confirmación (si cancela: se corta, S intacto)
  → se vacía S y se le asigna el contenido del archivo
  → refresh() inmediato (la UI ya muestra lo importado)
  → se marca _lastSavedAt / mf_lastSavedAt y _importing = true (5 s)
  → _fbSaveToCloud() y se espera su resultado real
      ├─ ok:true  → toast de éxito → location.reload() a los 0,8 s
      └─ ok:false → toast de error con el motivo → NO recarga
```

**Borrar todos los datos**
```
Botón "Borrar todos los datos" → diálogo de confirmación (si cancela: nada)
  → overlay de pantalla completa (bloquea la app)
  → si hay sesión: setDoc del documento con payload "{}" (+ mf_lastSavedAt)
      ├─ ok    → location.reload()
      └─ falla → toast de error, espera 2,5 s, location.reload()
```
Tras el reload, la carga lee un payload vacío, lo verifica contra el servidor y arranca con el estado por defecto de `S`, con el guardado habilitado.

**Agregar / eliminar categoría**
```
Agregar: nombre → validar (no vacío, ≤30, no repetida sin distinguir mayúsculas)
  → se agrega a la lista → S.catsVar | S.catsFijo → save() → se repinta

Eliminar: ¿es predeterminada? → error
  → ¿algún gasto (variable o fijo, según el tipo) la usa? → error
  → se quita de la lista → save() → se repinta
```

**Activar / desactivar un módulo**
```
Cambia el checkbox → S.modulos[nombre] = estado del checkbox → save() → applyModulos()
```

**Exportar**
- JSON: `save()` → se serializa `S` completo → descarga.
- CSV: gastos variables (más recientes primero) + un renglón por cada pago mensual registrado de cada gasto fijo → descarga.

---

## 6. Casos especiales

- **Validación de estructura (deliberadamente laxa).** Un backup es válido si es un objeto y trae **al menos uno** de `nuRate`, `cajitas`, `nequiSaldo`, `efectivoSaldo`, `deudores`, `gastosFijos`, `gastosVar`, `modulos`; y si están presentes, `cajitas`/`gastosVar`/`deudores` son arrays y `nuRate` es número. El resto de `S` (tarjetas, encargos, mesadas, personas, alcancía…) no se valida: un backup que solo tenga `modulos` pasa.
- **El JSON `null`** pasa el chequeo de tipo (`typeof null === 'object'`) y revienta al buscar campos; lo atrapa el `catch` genérico y muestra "Error al procesar el archivo…" en vez del mensaje de formato.
- **Importar reemplaza, no fusiona.** Lo que no esté en el archivo desaparece de `S` en ese momento. Los valores por defecto de las claves ausentes se recuperan en el reload posterior, porque la carga desde la nube reasigna sobre el `S` por defecto.
- **Importar sin poder guardar.** Si `_fbSaveToCloud` no existe, o devuelve `not-loaded` (la app todavía en modo lectura), los datos quedan cargados solo en memoria y el aviso pide **no recargar**.
- **Importar el mismo contenido que ya está guardado** resuelve como `ok` sin escribir (el guardado detecta "sin cambios").
- **Categorías: lista congelada.** Una vez que `S.catsVar`/`S.catsFijo` dejan de estar vacías, las predeterminadas que se agreguen al código más adelante **no aparecen solas** para ese usuario: la lista guardada manda. Una categoría predeterminada también podría faltar de una lista guardada (backup viejo) sin que nada la restituya.
- **Guardado bloqueado.** `save()` no hace nada mientras `_dataLoaded` sea falso (app en modo lectura): agregar/quitar categorías o mover un interruptor cambia `S` en memoria y la pantalla, pero no se sube a la nube. Es el comportamiento general del guardado, no algo propio de este módulo.
- **Categorías: mayúsculas.** Agregar compara sin distinguir mayúsculas; eliminar y el chequeo de "predeterminada" comparan el texto exacto.
- **Categoría en uso.** El chequeo mira `S.gastosVar[].cat` o `S.gastosFijos[].cat` según el tipo. No mira ningún otro lugar donde pudiera usarse un nombre de categoría.
- **CSV.**
  - Exporta **todo** el historial de gastos aunque el nombre del archivo lleve solo el mes actual.
  - Los gastos variables se exportan sin pasar por `_esGastoVarNoReal()`: el CSV refleja todo lo que hay en `S.gastosVar`.
  - Los gastos fijos salen con su monto **actual** (`g.monto`), no con lo que se pagó en ese mes, y con fecha `AAAA-MM-01`; la columna Cuenta va vacía.
  - El ordenamiento de los gastos variables se hace sobre `S.gastosVar` mismo (`.sort()` in situ), así que exportar deja ese arreglo ordenado por fecha descendente en memoria, sin llamar a `save()`.
- **Borrar todos sin conexión o sin sesión.** Sin `_fbUser`, no se toca la nube y solo se limpia lo local. Sin conexión, el `setDoc` falla y el usuario ve el aviso; al recargar con conexión, la nube todavía puede traer los datos viejos.
- **Datos de módulos desactivados.** Se siguen guardando, exportando e importando como cualquier otra parte de `S`.

---

## 7. Decisiones de diseño

- **Import y borrado verifican antes de recargar.** El diseño anterior mostraba "importado correctamente" y recargaba a los 4 s pasara lo que pasara; si el guardado no había llegado a escribir, el reload traía de vuelta el dato viejo y el aviso había mentido. Por eso el guardado devuelve una promesa con resultado real y todo lo demás depende de él.
- **`borrarTodo()` escribe `{}` y no vacía `S` en memoria.** El payload vacío es la señal de "empezar de cero": la carga lo trata como estado por defecto y lo verifica contra el servidor antes de habilitar el guardado. Como `S` en memoria queda intacto hasta el reload, el bloqueo con overlay no es opcional (ver §3).
- **El overlay de `borrarTodo()` reutiliza `#fb-loading-screen`** (ya cubre toda la pantalla) en vez de crear otro, con el mismo criterio que `_fbSignOut()` y `_fbDeleteAccount()`.
- **`applyModulos()`, sesión, PIN/biometría y categorías por defecto se quedan en el núcleo.** `applyModulos()` toca el nav, Mesada, los banners de Cuentas e Inicio; sesión y PIN son de toda la app; las categorías las comparte Gastos. Moverlos acá crearía dependencias en sentido contrario (núcleo → módulo lazy).
- **Interruptores y botones de backup usan `addEventListener` directo, no `data-action`.** `Events` solo despacha clicks; los checkbox son `change` y los botones de backup tienen id fijo y ningún argumento variable. Lo que sí es click con argumentos (agregar/eliminar categoría, `irA`, sesión) va por `Events`.
- **Eliminar es más estricto que agregar** a propósito: no se puede dejar un gasto apuntando a una categoría que ya no existe.
- **Módulos desactivados conservan datos.** Es lo que permite apagar Spotify o Mesada sin miedo; por eso `toggleModulo` solo cambia visibilidad.
- **Herramientas como atajos.** Personas, Notificaciones y Actividad reciente no tienen entrada propia en el nav; se llega desde esta pantalla (Actividad reciente y Personas pintan además su propio subtítulo en la fila). Wrapped se muestra arriba de todo, como tarjeta destacada, solo durante enero.
- **Carga lazy.** El módulo entra por `Loader.GROUPS.config` la primera vez que se abre la pantalla; su único llamador externo, `renderCatsConfig()`, se invoca con guard `typeof`.

---

## 8. Referencia de implementación

**Funciones de `js/modules/configuracion.js`**

| Función | Qué hace |
|---|---|
| `renderCatsConfig()` | Pinta los chips de categorías variables y fijas; el botón de eliminar solo aparece en las no predeterminadas. |
| `agregarCat(tipo)` | Valida y agrega una categoría (`'var'` o `'fijo'`). |
| `eliminarCat(tipo, cat)` | Valida y elimina una categoría. |
| `exportarJSON()` | `save()` + descarga de `S` completo. |
| `importarJSON()` | Abre el selector de archivo (`#importFileInput`). |
| `_validarEstructuraJSON(data)` | Devuelve la lista de errores de estructura (vacía = válido). |
| `leerArchivoImport(e)` | Lee, valida, confirma, reemplaza `S`, guarda en la nube y recarga. |
| `exportarCSV()` | Descarga los gastos en CSV. |
| `toggleModulo(nombre)` | Escribe `S.modulos[nombre]`, `save()` y `applyModulos()`. |
| `borrarTodo()` | Borra los datos de la nube con overlay de bloqueo y recarga. |

**Acciones de `Events` (`config:*`)**

| Acción | Va a |
|---|---|
| `config:agregarCat` / `config:eliminarCat` | `agregarCat` / `eliminarCat` |
| `config:signOut` | `window._fbSignOut()` (firebase-sync.js) |
| `config:abrirEliminarCuenta` | `window._abrirEliminarCuenta()` (firebase-sync.js) |
| `config:irA` | `showScreen(pantalla)`; lo usan Personas, Actividad reciente y la tarjeta de Wrapped |

**Cableado directo (`addEventListener`):** `[data-modulo]` (change), `#btn-exportar-json`, `#btn-importar-json`, `#btn-exportar-csv`, `#btn-borrar-todo`, `#importFileInput` (change), y Enter en `#nueva-cat-var` / `#nueva-cat-fijo`.

**Ids del HTML (`#screen-config` en `index.html`):** `cfg-mesada`, `cfg-spotify`, `cfg-corregirSaldo`, `cats-var-list`, `cats-fijo-list`, `nueva-cat-var`, `nueva-cat-fijo`, `pin-config-container`, `bio-config-container`, `fb-user-avatar` / `fb-user-name` / `fb-user-email` (los llena `firebase-init.js`), `fb-sync-dot` / `fb-sync-text` (los actualiza `firebase-sync.js`), `wrapped-promo` (lo muestra `wrapped-gate.js`), `cfg-personas-sub` (`personas.js`), `cfg-historial-sub` (`actividad_reciente.js`), `cfg-notificaciones-row` (`data-action="notificaciones:activar"`).

**Dependencias de otros archivos**

| Símbolo | Vive en | Verificado |
|---|---|---|
| `_fbSaveToCloud`, `_fbSignOut`, `_abrirEliminarCuenta`, `_fbDeleteAccount`, `_importing`, `_lastSavedAt` | `firebase-sync.js` | Sí |
| `Events.registerAll` / `Events.attr` | `events.js` | Sí (`attr` escapa los argumentos; `Events` solo despacha `click`) |
| `getCatsVar` / `getCatsFijo` / `CATS_*_DEFAULT`, `save`, `toast`, `dialogo`, `refresh`, `fuenteLabel`, `escHtml`, `S.modulos` por defecto | `core-state.js` | Sí |
| `html\`\`` / `raw()` | `html-tag.js` | **No** — no estaba entre los archivos disponibles |
| `applyModulos`, `showScreen` | `sheet-stack.js` | **No** — no estaba entre los archivos disponibles |
| Handler de `notificaciones:activar` | — | **No encontrado** en los archivos disponibles (el backend del aviso está en `notificaciones-push.md`) |

**Pendiente abierto**
- Cómo interpreta `applyModulos()` un `corregirSaldo` inexistente (estado inicial del interruptor en `#cfg-corregirSaldo`, que en el HTML no trae `checked`). Requiere `sheet-stack.js`.
