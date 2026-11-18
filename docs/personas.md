# Módulo Personas

Documentación de la sección **Personas** de `mis-finanzas` (`js/modules/personas.js`). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos guarda y por qué, cómo fluye la información, y qué decisiones de diseño se tomaron. Los detalles de implementación (funciones, ids) aparecen al final, como referencia rápida.

El historial de bugs corregidos vive en [`changelog/personas.md`](./changelog/personas.md), no acá.

---

## 1. Objetivo

Da una identidad única a cada persona con la que hay relación financiera (familia, amigos), para que Encargos, Préstamos ("Me deben" / "Yo debo") y Spotify no tengan cada uno su propia lista suelta de nombres. En vez de "Juan" existiendo tres veces sin conexión entre sí (uno en Encargos, otro en Deudores, otro en Spotify), existe una sola persona con un perfil que junta todo lo que se le debe, lo que debe, y en qué está metida.

---

## 2. Conceptos importantes

**Una sola persona (`S.personas`) y los módulos como relaciones:** cada persona existe una vez. Todo registro de Préstamos, Encargos y Spotify tiene `personaId` y esa persona existe — no hay registros "sin perfil". Lo garantiza `Personas.reconciliar()` (js/core/personas-core.js): al cargar, al importar un backup y al abrir la lista de Personas vincula por nombre cualquier huérfano (creando la persona si no existe) y une las personas con el mismo nombre. `Personas.verificar()` comprueba los invariantes I1–I4 en cada `save()`.

**Vínculo (`personaId`):** cada módulo (Encargos, Deudores, Mis deudas, Spotify) guarda su propia copia del nombre además de una referencia opcional a `S.personas` vía `personaId`. El nombre mostrado siempre se resuelve preferentemente desde la persona vinculada (ver §7 de `spotify.md` para el caso ya documentado de `spotifyNombreDe`); acá el mismo criterio aplica a `getPersonaNombre`.

**Perfil consolidado:** al abrir una persona, el módulo no muestra solo su nombre — junta en una sola pantalla todo lo que hay de ella repartido en otros módulos (préstamos, encargos, Spotify, lo que se le debe), cada sección con sus propias estadísticas armadas a partir de los movimientos reales de ese módulo, no de un resumen guardado aparte.

---

## 3. Reglas que nunca deben romperse

- **Personas es una libreta de identidad, no una fuente de saldos propia.** Todo lo que se muestra en un perfil (deuda pendiente, encargos activos, estado de Spotify) se calcula en el momento a partir de los datos reales de cada módulo (`S.deudores`, `S.encargos`, `S.misDeudas`, `S.spotify.personas`) — Personas nunca guarda un total o un estado por su cuenta que pueda desincronizarse.
- **No hay dos personas con el mismo nombre** (ignorando mayúsculas, tildes y espacios): `Personas.crear` devuelve la existente en vez de crear otra, y `Personas.editar` rechaza el nombre de otra persona. El selector compartido además ofrece elegir una existente antes de crear una.
- **Renombrar o cambiar el color de una persona se sincroniza en todos los módulos vinculados en el mismo momento** — lo hace `Personas.editar` recorriendo las relaciones declaradas en personas-core.js (no una lista escrita a mano en la pantalla), así que un módulo nuevo que se declare como relación queda incluido sin tocar `personas.js`.
- **Todo registro con relación a una persona tiene `personaId` válido.** Crear un deudor, encargo o integrante sin pasar por una persona existente rompe el invariante I1: `save()` lo avisa en consola (`window._personasViolaciones`) y la próxima carga lo repara.
- **Eliminar una persona no es una operación de este módulo.** No existe "borrar persona" acá a propósito (ver §7): su historial financiero vive en otros módulos y son esos módulos los que deciden si algo se puede borrar, no Personas.
- **El destino de un cobro/pago nunca se decide acá.** Personas no mueve plata ni genera movimientos — es un directorio de identidad; las reglas de dinero (fuente de verdad son los movimientos, TC nunca como destino de entrada, etc.) viven en cada módulo dueño de esos movimientos.
- **Cerrar cualquier sheet de Personas sin confirmar no debe dejar cambios a medias:** crear o editar una persona son operaciones atómicas (o se guardó, o no se guardó nada) — no hay estados intermedios persistidos.

---

## 4. Modelo de datos

```js
S.personas = [
  {
    id: "uid",
    nombre: "Juan",
    color: "#60b0f0",     // uno de PERSONA_COLORES; se usa en el avatar y en badges
    creadoEn: "2026-07-05"
  }
]
```

Cada módulo que se vincula a una persona guarda su propia referencia:

```js
S.deudores[i].personaId   // "Me deben"
S.misDeudas[i].personaId  // "Yo debo"
S.encargos[i].personaId   // Encargos
S.spotify.personas[i].personaId  // Spotify (ver spotify.md §4)
```

**`personaId` es obligatorio en los cuatro casos** (desde la migración 13, 2026-11-18). Un registro sin `personaId` o con uno que apunta a una persona inexistente es un dato roto que `Personas.reconciliar()` repara.

**`nombre` y `color` todavía se copian en cada módulo vinculado** (transitorio): `Personas.editar` y `Personas.reconciliar` las mantienen iguales a las de la persona. Quitarlas, para que cada módulo lea siempre de `S.personas`, es parte pendiente del plan en [`personas-modelo-unico.md`](./personas-modelo-unico.md) (fase 3); ver §7.

---

## 5. Flujo

### Crear una persona nueva desde cualquier módulo

```
Módulo (Encargos/Deudores/Spotify) abre el selector compartido (abrirSelPersona)
  ↓
Usuario busca por nombre → si no existe, botón "Crear a '...'"
  ↓
Sheet "Nueva persona": nombre + color
  ↓
Personas.crear: si ya hay una con ese nombre, devuelve la existente (el selector la elige; la lista avisa); si no, se agrega a S.personas
  ↓
El callback del módulo que abrió el selector recibe el personaId nuevo
  ↓
Ese módulo vincula su propio registro (deudor/encargo/integrante) a ese personaId
```

### Editar una persona (nombre o color)

```
Abrir perfil → botón editar → sheet "Editar persona"
  ↓
Guardar cambios
  ↓
Se actualiza S.personas
  ↓
Personas.editar iguala nombre/color en TODAS las relaciones declaradas:
  deudores, misDeudas, encargos, integrantes de Spotify (y las que se registren)
  ↓
Se refresca la lista de Personas y las pantallas de Encargos / Mis deudas
  ↓
Si el perfil estaba abierto, se vuelve a pintar con los datos ya actualizados
```

### Abrir el perfil de una persona

```
Click en una fila (lista de Personas o selector)
  ↓
getPersonaDatos(personaId): junta deudor(es), encargos, misDeudas y el integrante de Spotify (si existe)
  ↓
Se arma una sección por cada módulo donde la persona tiene actividad
  (Préstamos, Encargos, Spotify, "Le debo") — cada una con sus propias
  estadísticas calculadas en el momento
  ↓
Si no tiene actividad en ningún módulo, se muestra un estado vacío
```

### Selector de persona (usado por Encargos, Deudores y Spotify)

```
Módulo llama abrirSelPersona(callback, título)
  ↓
Lista filtrable de S.personas, con badges de actividad por persona
  ↓
Elegir una persona → cierra el sheet → llama al callback con el personaId
     o
Crear una nueva → mismo flujo que "Crear persona nueva" de arriba,
  el callback también se dispara al terminar
```

---

## 6. Casos especiales

- **Registros sin `personaId` (datos de antes, backups viejos):** ya no se muestran aparte. Se vinculan por nombre al cargar, al importar y al abrir la lista (si el nombre coincide con una persona se usa esa; si no, se crea). Dos registros de una relación única (p. ej. dos "me deben") para la misma persona no se fusionan solos: quedan avisados en consola para revisión.
- **Nombres duplicados:** no se permiten entre personas (ver §3). Dos personas reales con el mismo nombre (dos "Carlos") se distinguen con apellido o apodo.
- **Perfil de una persona sin actividad en ningún módulo:** puede pasar si se crea una persona directamente desde la lista de Personas ("Nueva") sin todavía vincularla a nada — el perfil lo indica explícitamente en vez de mostrar secciones vacías.
- **Cerrar el sheet de crear/editar sin guardar:** no persiste ningún cambio a medio escribir; el nombre y color solo se guardan al confirmar.

---

## 7. Decisiones de diseño

- **El nombre y el color se duplican en cada módulo vinculado, en vez de leerse siempre en vivo desde `S.personas`.** *(Decisión vigente solo de forma transitoria: el plan en [`personas-modelo-unico.md`](./personas-modelo-unico.md) la revierte porque su motivo — emparejar historial viejo de Spotify por nombre — ya no aplica sin datos antiguos.)* La alternativa obvia — que cada módulo lea el nombre directo desde `S.personas` cada vez que lo necesita — hubiera evitado la resincronización manual al editar. Se descartó a propósito: varios módulos (Spotify, en particular) usan el campo `nombre` crudo para lógica propia (comparaciones, validación de duplicados, emparejamiento de historial viejo por nombre) que necesita seguir funcionando aunque `S.personas` cambie o la persona se desvincule más adelante. Guardar una copia y resincronizarla explícitamente al editar es más código, pero mantiene a cada módulo funcionando de forma autónoma con sus propios datos.
- **No existe "eliminar persona" en este módulo, a propósito.** Encargos y Spotify sí tienen su propio flujo de "eliminar integrante/encargo", con sus propias reglas sobre qué pasa con el historial (ver `spotify.md §3`, `encargos.md`). Meter un "eliminar persona" acá obligaría a decidir en un solo lugar central qué hacer con la plata y el historial de cada módulo vinculado — una decisión que le corresponde a cada módulo dueño de esos datos, no a la libreta de identidad.
- **El perfil no cachea ni guarda las estadísticas que muestra.** Se recalculan siempre desde los datos reales de cada módulo al momento de abrir el perfil (mismo principio que atraviesa toda la app: los movimientos son la fuente de verdad, nunca un valor guardado aparte). El costo es recalcular en cada apertura; la ganancia es que nunca puede haber un perfil desincronizado de la plata real.
- **El selector de persona es un componente compartido, no una copia por módulo.** Encargos, Deudores y Spotify abren el mismo sheet (`abrirSelPersona`) en vez de tener cada uno su propio buscador de personas — mismo criterio que llevó a compartir `crearSplitWidget` entre Encargos y Préstamos (ver `mesada.md §8` para el caso ya documentado de motores compartidos).

---

## 8. Referencia de implementación

### Funciones clave

| Función | Qué hace |
|---|---|
| `Personas` (js/core/personas-core.js) | API del núcleo: `obtener/nombre/color/lista/buscarPorNombre`, `crear` (sin duplicar), `editar` (sincroniza copias), `registrarRelacion`, `verificar` (I1–I4), `reconciliar`, `huerfanos` |
| `getPersona(id)` / `getPersonaNombre(id)` / `getPersonaColor(id)` | Envoltorios de `Personas.obtener/nombre/color` (los llaman muchos módulos; se reemplazan en la fase 3) |
| `getPersonaDatos(personaId)` | Junta deudor(es), encargos y misDeudas vinculados a una persona, con sus saldos ya calculados |
| `_renderListaPersonas()` | Pinta la pantalla "Personas": una fila por persona (repara antes cualquier huérfano) |
| `abrirPerfilPersona(personaId)` | Arma y abre el sheet de perfil consolidado (Préstamos, Encargos, Spotify, Le debo) |
| `abrirSelPersona(callback, titulo)` | Abre el selector compartido; el `callback` recibe el `personaId` elegido o recién creado |
| `_crearPersonaGlobal()` / `_guardarEditarPersonaGlobal()` | Crean o editan una persona; el segundo resincroniza nombre/color en todos los módulos vinculados |
| `_inyectarPersonaSheets()` | Inyecta en el DOM (una sola vez) los 4 sheets del módulo: selector, crear, editar, perfil |

### Sheets

| Sheet | id del overlay | Función que abre |
|---|---|---|
| Seleccionar persona | `sheet-sel-persona` | `abrirSelPersona(callback, titulo)` |
| Nueva persona | `sheet-crear-persona-global` | `_abrirCrearPersonaGlobal(desdeListaPersonas)` |
| Editar persona | `sheet-editar-persona-global` | `abrirEditarPersonaGlobal(personaId)` |
| Perfil de persona | `sheet-perfil-persona` | `abrirPerfilPersona(personaId)` |

### Integración con otros módulos

La integración de cada módulo con Personas **no vive en `personas.js`**, sino dentro del propio módulo (los archivos `*-personas.js` que existieron se fusionaron de vuelta el 2026-08-03; ver `changelog/encargos.md`, `#spotify` y `#préstamos`):

| Módulo | Archivo |
|---|---|
| Encargos | `js/modules/encargos.js` (selector en "Nuevo encargo", hook que exige `personaId`, botones de perfil, `_irAEncargo`) |
| Spotify | `js/modules/spotify.js` |
| Préstamos ("Me deben" / "Yo debo") | `js/modules/prestado.js` |

`personas.js` carga antes que esos módulos y estos usan `getPersona`, `abrirSelPersona` y `_inyectarPersonaSheets` solo dentro de handlers (en el click), así que el orden entre `<script defer>` no importa para esta dependencia.

**Eventos:** los botones "Ver →" del perfil usan `data-action` con prefijos heredados (`encargos-personas:irAEncargo`, `prestado-personas:irADeudor`, `prestado-personas:irAMiDeuda`). El prefijo es solo el namespace del evento; cada handler se registra en `encargos.js` / `prestado.js`, donde vive la función. No queda ningún punto sin migrar a `js/core/events.js`.

## Campo «¿Quién es?»: `PersonaPicker`

Todo campo que elige una persona (Spotify agregar/editar, Nuevo encargo) usa `PersonaPicker.crear({ prefijo, inputId, titulo, alCambiar })` de `personas.js`. El HTML es **estático** en `index.html` (`#PREFIJO-btn` con `data-action="personas:pickerAbrir" data-picker="PREFIJO"`, más `-avatar`, `-label`, `-chevron`, `-hint` opcional y un `<input type="hidden">` con el nombre); nadie reescribe el campo con `innerHTML` en runtime. API: `.valor`, `.abrir()`, `.elegir(id)`, `.precargar({personaId, nombre})` (con `personaId` queda bloqueado), `.abiertoSinConfirmar`, `.limpiar()`, `.marcarError()`. Estilos únicos: `.persona-btn` (`is-set`, `is-error`, `is-locked`), `.persona-btn-av`, `.persona-chevron`, `.persona-hint`. Para sumar otro campo de persona: copiar el bloque de markup con otro prefijo y crear el picker en el módulo; no escribir otro selector. Pruebas: `tests/persona-picker.test.js`.


---

**PC (2026-11-17):** en ≥900 px la pantalla es resumen + tarjetas por persona y una ficha lateral que se abre al tocar (nadie elegido al abrir); con una abierta, el resumen y las tarjetas siguen a la vista. Saldo neto de la tarjeta = préstamos − Yo debo; el saldo de encargos no entra (es plata ajena). Detalle en [`version-pc.md`](./version-pc.md) §10 sexies.
