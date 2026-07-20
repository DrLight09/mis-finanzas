# Módulo Personas

Documentación de la sección **Personas** de `mis-finanzas` (`js/modules/personas.js`). Pensada para volver a leerla en unos meses y entender el módulo sin releer el código: qué problema resuelve, qué reglas no se deben romper, qué datos guarda y por qué, cómo fluye la información, y qué decisiones de diseño se tomaron. Los detalles de implementación (funciones, ids) aparecen al final, como referencia rápida.

El historial de bugs corregidos vive en [`CHANGELOG.md`](./CHANGELOG.md#personas), no acá.

---

## 1. Objetivo

Da una identidad única a cada persona con la que hay relación financiera (familia, amigos), para que Encargos, Préstamos ("Me deben" / "Yo debo") y Spotify no tengan cada uno su propia lista suelta de nombres. En vez de "Juan" existiendo tres veces sin conexión entre sí (uno en Encargos, otro en Deudores, otro en Spotify), existe una sola persona con un perfil que junta todo lo que se le debe, lo que debe, y en qué está metida.

---

## 2. Conceptos importantes

**Persona con perfil vs. registro sin vincular:** una persona puede existir formalmente en `S.personas` (con nombre y color propios), o puede no existir todavía como tal — un deudor o una deuda creados antes de que existiera este sistema, o creados sin pasar por el selector de personas, quedan "sin perfil". La pantalla de Personas los sigue mostrando igual (para no esconder plata real), pero no tienen perfil consolidado hasta que se vinculan.

**Vínculo (`personaId`):** cada módulo (Encargos, Deudores, Mis deudas, Spotify) guarda su propia copia del nombre además de una referencia opcional a `S.personas` vía `personaId`. El nombre mostrado siempre se resuelve preferentemente desde la persona vinculada (ver §7 de `spotify.md` para el caso ya documentado de `spNombreDe`); acá el mismo criterio aplica a `getPersonaNombre`.

**Perfil consolidado:** al abrir una persona, el módulo no muestra solo su nombre — junta en una sola pantalla todo lo que hay de ella repartido en otros módulos (préstamos, encargos, Spotify, lo que se le debe), cada sección con sus propias estadísticas armadas a partir de los movimientos reales de ese módulo, no de un resumen guardado aparte.

---

## 3. Reglas que nunca deben romperse

- **Personas es una libreta de identidad, no una fuente de saldos propia.** Todo lo que se muestra en un perfil (deuda pendiente, encargos activos, estado de Spotify) se calcula en el momento a partir de los datos reales de cada módulo (`S.deudores`, `S.encargos`, `S.misDeudas`, `S.spotifyPersonas`) — Personas nunca guarda un total o un estado por su cuenta que pueda desincronizarse.
- **No se puede crear dos personas con exactamente el mismo flujo sin querer:** cada módulo que crea una persona nueva (Encargos, Deudores, Spotify) lo hace a través del selector compartido, que ofrece elegir una existente antes de crear una — evita que "Juan" termine como tres personas distintas sin vínculo entre sí.
- **Renombrar o cambiar el color de una persona se sincroniza en todos los módulos vinculados en el mismo momento** (deudores, encargos, misDeudas, integrantes de Spotify) — nunca queda un módulo mostrando el nombre viejo mientras otro ya tiene el nuevo.
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
S.spotifyPersonas[i].personaId  // Spotify (ver spotify.md §4)
```

**`personaId` es opcional en los cuatro casos.** Un registro sin `personaId` sigue siendo válido — es un deudor, encargo, deuda o integrante "sin perfil" (ver §2), no un dato roto.

**`nombre` y `color` se duplican en cada módulo vinculado** en vez de leerse siempre desde `S.personas` en tiempo real — cada uno guarda su propia copia, que se resincroniza explícitamente al editar la persona (ver §5). Esto es intencional, no una inconsistencia: ver §7.

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
Se agrega a S.personas
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
Se resincroniza nombre/color en TODOS los registros vinculados:
  deudores, misDeudas, encargos, integrantes de Spotify
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

- **Deudores, misDeudas o integrantes de Spotify sin `personaId`:** la lista de Personas los sigue mostrando como "sin perfil" (agrupados aparte de las personas con `S.personas` propio), para que nunca desaparezca plata real de la vista solo por no estar vinculada todavía.
- **Nombres duplicados:** el selector no impide dos personas con el mismo nombre en `S.personas` — la prevención de duplicados vive en cada módulo que llama al selector (ej. Spotify valida que no se repita un integrante), no en Personas en sí, porque "duplicado" significa algo distinto según el contexto que está creando la persona.
- **Perfil de una persona sin actividad en ningún módulo:** puede pasar si se crea una persona directamente desde la lista de Personas ("Nueva") sin todavía vincularla a nada — el perfil lo indica explícitamente en vez de mostrar secciones vacías.
- **Cerrar el sheet de crear/editar sin guardar:** no persiste ningún cambio a medio escribir; el nombre y color solo se guardan al confirmar.

---

## 7. Decisiones de diseño

- **El nombre y el color se duplican en cada módulo vinculado, en vez de leerse siempre en vivo desde `S.personas`.** La alternativa obvia — que cada módulo lea el nombre directo desde `S.personas` cada vez que lo necesita — hubiera evitado la resincronización manual al editar. Se descartó a propósito: varios módulos (Spotify, en particular) usan el campo `nombre` crudo para lógica propia (comparaciones, validación de duplicados, emparejamiento de historial viejo por nombre) que necesita seguir funcionando aunque `S.personas` cambie o la persona se desvincule más adelante. Guardar una copia y resincronizarla explícitamente al editar es más código, pero mantiene a cada módulo funcionando de forma autónoma con sus propios datos.
- **No existe "eliminar persona" en este módulo, a propósito.** Encargos y Spotify sí tienen su propio flujo de "eliminar integrante/encargo", con sus propias reglas sobre qué pasa con el historial (ver `spotify.md §3`, `encargos.md`). Meter un "eliminar persona" acá obligaría a decidir en un solo lugar central qué hacer con la plata y el historial de cada módulo vinculado — una decisión que le corresponde a cada módulo dueño de esos datos, no a la libreta de identidad.
- **El perfil no cachea ni guarda las estadísticas que muestra.** Se recalculan siempre desde los datos reales de cada módulo al momento de abrir el perfil (mismo principio que atraviesa toda la app: los movimientos son la fuente de verdad, nunca un valor guardado aparte). El costo es recalcular en cada apertura; la ganancia es que nunca puede haber un perfil desincronizado de la plata real.
- **El selector de persona es un componente compartido, no una copia por módulo.** Encargos, Deudores y Spotify abren el mismo sheet (`abrirSelPersona`) en vez de tener cada uno su propio buscador de personas — mismo criterio que llevó a compartir `crearSplitWidget` entre Encargos y Préstamos (ver `mesada.md §8` para el caso ya documentado de motores compartidos).

---

## 8. Referencia de implementación

### Funciones clave

| Función | Qué hace |
|---|---|
| `getPersona(id)` / `getPersonaNombre(id)` / `getPersonaColor(id)` | Lectura básica de una persona por id, con fallback si no existe |
| `getPersonaDatos(personaId)` | Junta deudor(es), encargos y misDeudas vinculados a una persona, con sus saldos ya calculados |
| `_renderListaPersonas()` | Pinta la pantalla "Personas": personas con perfil + deudores/misDeudas sin vincular |
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

La integración específica de cada módulo con Personas **no vive en este archivo**, sino en el suyo propio, cargado después de `personas.js` porque depende de `getPersona`/`abrirSelPersona`/`_inyectarPersonaSheets`:

| Módulo | Archivo |
|---|---|
| Encargos | `js/modules/encargos-personas.js` |
| Spotify | `js/modules/spotify-personas.js` |
| Préstamos ("Me deben" / "Yo debo") | `js/modules/prestado-personas.js` |

**Caso pendiente:** el botón "Ver →" de cada encargo dentro del perfil de persona todavía llama directo a `_irAEncargo()`, definida en `encargos-personas.js` — es el único punto de este módulo sin migrar al sistema de eventos (`js/core/events.js`), documentado en el propio código. Ver `auditoria-tecnica.md` punto 1.
