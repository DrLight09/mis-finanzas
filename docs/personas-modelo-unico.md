# Personas: una sola tabla y los módulos como relaciones — lo que falta

Plan de diseño (análisis original 2026-11-16, revisado contra el código el 2026-11-18). **Aquí solo queda lo pendiente.** Lo ya hecho vive en [`CHANGELOG.md`](./CHANGELOG.md) («Personas: núcleo único, fase 1») y en [`personas.md`](./personas.md). No se tiene en cuenta el riesgo de migración: la app no tiene usuarios activos y se busca el mejor resultado final.

## 1. Decisión (vigente)

Una sola entidad **Persona** (`S.personas`) que existe una vez; cada módulo (Spotify, Encargos, Préstamos, Yo debo, y los que vengan) guarda **solo su relación** con ella (`personaId` + los datos propios del módulo) y nunca una copia del nombre ni del color. Lo que la pantalla Personas muestra de cada persona (dónde participa, cuánto se debe, su posición neta) se **calcula** a partir de las relaciones, no se guarda.

Alternativas descartadas: persona con sub-objetos por módulo (acopla todos los módulos a un registro, una persona con dos encargos no cabe, apagar un módulo deja huecos) y «solo reconciliar al cargar» (arregla el síntoma pero deja la copia de nombre/color y las ramas «sin personaId»; ya se hizo como primer paso de esta decisión).

## 2. Estado actual

**Hecho (fase 1):** `Personas` en el núcleo (`js/core/personas-core.js`) con lectura, `crear` sin duplicados, `editar` que sincroniza copias por relación, `verificar` (I1–I4), `reconciliar` y `huerfanos`; migración 13; reconciliación al cargar, al importar y al abrir la lista; la lista de Personas muestra una fila por persona y ya no omite gente.

**Queda, de los problemas originales:**

3. **Doble fuente de verdad para nombre y color.** Cada registro sigue copiando `nombre` (y `color` en deudas). Hoy `Personas.editar` las mantiene iguales, pero la copia sigue existiendo (unas 170 lecturas de `.nombre` sobre registros de persona: `prestado.js` ≈60, `encargos.js` ≈34, `personas.js` ≈24, `wrapped.js` ≈14, `busqueda-global.js` ≈13).
4. **Cuatro resolvedores del mismo nombre:** `getPersonaNombre` (ahora envoltorio), `spotifyNombreDe` (`calc-helpers.js:158`), `nombreSpotify` (`reglas.js:67`) y `_wrappedNombrePersona` (`wrapped.js:2117`).
5. **Un campo con dos significados.** En Plata comprometida `destino.personaId` guarda el **id de un deudor** (`plata-comprometida.js:1085`, `1166`, `1339`: `Deudas.lista('favor').find(x => x.id === d.personaId)`), no el de una persona. Con el modelo unificado esto se vuelve un bug.
6. **Ramas por «sin personaId»** que ya no pueden ocurrir y siguen en el código: `prestado.js` (`avatarAccion` en la línea ≈374, auto-vincular al editar ≈2520 y ≈2759, chip «Ver perfil» condicional), `encargos.js` (≈1851 y ≈3379), Wrapped agrupando por `personaId` o por nombre crudo (`wrapped.js` ≈2636, ≈2996), y los textos de `docs/encargos.md` §3 que dicen «puede faltar en encargos viejos».
7. **Eliminar, archivar y fusionar:** sigue sin existir ninguna ruta que quite elementos de `S.personas`. (La parte de «duplicados creados por error» ya se previene: `Personas.crear` y `editar` no permiten nombres repetidos.)
8. **Campos fantasma:** `alias` y `notas` los documenta `estado.js:76` y los lee la búsqueda global (`busqueda-global.js:220`), pero ninguna pantalla los escribe. Un comentario de Spotify habla de «color/foto» y no hay foto.
9. **Nombre cruzado entre módulos:** `S.spotify.personas` se llama «personas» pero son **integrantes del plan**; confunde con `S.personas`.

### Tabla de dónde vive la gente (para lo que queda)

| Dónde | Estructura | Falta |
|---|---|---|
| Libreta central | `S.personas: [{id, nombre, color, alias?, notas?, creadoEn}]` | `archivada?`; escribir `alias`/`notas` desde la hoja de edición |
| Préstamos «me deben» | `S.deudores[]` con `nombre`, `color`, `personaId` | quitar `nombre` y `color` |
| Préstamos «yo debo» | `S.misDeudas[]` igual | quitar `nombre` y `color` |
| Encargos | `S.encargos[]` con `nombre`, `personaId`, … | quitar `nombre` |
| Spotify | `S.spotify.personas[]` con `nombre`, `personaId`, `monto`, … | renombrar a `integrantes`; quitar `nombre` |
| Plata comprometida | destinos con un campo `personaId` que es un id de deudor | renombrar a `deudorId` |
| Diferencial / reparto | `partes[].nombre` de texto libre | vincular opcional (ver §4.7) |
| Mesada | `MESADA_PADRES = ['papa','mama']` fijos | opcional (ver §4.7) |

## 3. Hallazgos de la revisión del 2026-11-18 (no estaban en el análisis original)

- **La copia de nombre fue una decisión escrita**, no un descuido: `personas.md` §7 decía que se duplicaba a propósito porque Spotify usa el nombre crudo para emparejar historial viejo (`spotify.js:754`: `x.nombre === h.nombre`) y para no depender de `S.personas`. Ese motivo ya no aplica: el emparejamiento por nombre es solo el camino legado sin `spotifyId`. Al quitar las copias hay que **reescribir §7 de `personas.md`** (hoy lo marca como transitorio) y quitar ese camino legado de Spotify.
- **El registro de relaciones (§4.4) no puede ser solo «cada módulo llama `registrarRelacion` al cargar».** Spotify, Encargos y Préstamos son módulos lazy: con ese diseño, `verificar`, fusión y borrado solo verían los ya cargados, y se podría archivar a alguien que sí tiene un integrante de Spotify. Por eso la mitad de **datos** de cada relación (colección, `unica`, `copia`) se declara en el núcleo (`personas-core.js`, hecho) y la mitad de **pantalla** (resumen, saldo, «ver en el módulo», `alFusionar`) la registra el módulo al cargar (pendiente).
- **Lógica de dominio dentro de módulos lazy.** `getPersonaDatos` llama `encargoSaldo()` (vive en `encargos.js`, lazy) **sin guard**; hoy funciona porque `Loader.ensureAll()` precarga en segundo plano, pero es frágil. Mismo patrón que ya obligó a mover `Deudas` al núcleo. Para el saldo por relación, el perfil y la posición neta hace falta mover al núcleo lo mínimo de Encargos y Spotify (colección, saldo, nombre), dejando la pantalla en el módulo lazy.
- **`scripts/notificaciones/run.js` y `checks.js` no leen nombres de personas** (comprobado en el código): quitar `nombre` de los registros no los afecta. Falta solo una prueba de paridad con un respaldo del esquema 13 al terminar la fase 3.
- **Un solo documento de Firestore** (tope 1 MiB, avisa a 800 KB; `firebase-sync.js:246`). Quitar copias ayuda poco; partir el estado por colección es otro proyecto, fuera de este plan.

## 4. Modelo objetivo (lo que falta)

### 4.1 Datos finales

```text
S.personas: [{ id, nombre, color, alias?, notas?, creadoEn, archivada? }]

S.deudores:  [{ id, personaId, movimientos, … }]        // sin nombre ni color
S.misDeudas: [{ id, personaId, tasaEA?, movimientos }]  // sin nombre ni color
S.encargos:  [{ id, personaId, nota, saldoInicial, … }] // sin nombre
S.spotify.integrantes: [{ id, personaId, monto, proximoPago, … }]   // antes S.spotify.personas; sin nombre
S.spotify.historial: [{ …, personaId, nombre }]          // `nombre` es FOTO del momento (a propósito)
plataComprometida destino: { …, deudorId }               // antes `personaId` (id de deudor)
```

### 4.2 Invariantes

I1, I3 e I4 ya se comprueban (`Personas.verificar`). Quedan:

- **I2 (definitiva).** Ningún registro guarda copia de `nombre` ni `color` de la persona. Hoy `verificar` la comprueba como `copia-desfasada` (transitoria); al quitar las copias se borra la bandera `copia` de cada relación y la comprobación pasa a «el campo no existe». Excepción: las **fotos** históricas (`spotify.historial`, descripciones del libro, Wrapped guardados), que son texto de un momento y no cambian al renombrar.
- **I3 con archivadas.** Hoy la unicidad de nombre es entre todas las personas; con `archivada` pasa a ser «entre las no archivadas».
- **I5.** Una persona con relaciones que tengan saldo o historial **no se elimina**: se archiva.

### 4.3 API de `Personas` que falta

- Lectura: `iniciales(id)` (hoy existe un `iniciales` global en `bootstrap.js`), `lista({archivadas})`.
- Escritura: `archivar(id)`, `eliminar(id)` (solo sin relaciones), `fusionar(origenId, destinoId)`; `editar` con `alias` y `notas`.
- Derivados (no se guardan): `relaciones(id)` → relaciones vivas con su resumen; `posicionNeta(id)`.

### 4.4 Relaciones registradas — mitad de pantalla

La mitad de datos ya está (`Personas.registrarRelacion({ id, etiqueta, coleccion, unica, copia })`). Falta lo que aporta cada módulo al cargar:

```js
Personas.registrarRelacion({
  id: 'spotify',
  resumen: r => ({ texto: 'Paga en 5 d', tono: 'ok' }),   // lo que muestra el perfil
  saldo: r => 0,                                          // aporte a la posición neta (positivo = te deben)
  abrir: r => showScreen('spotify'),                      // «ver en el módulo»
  alFusionar: (origen, destino) => 'bloquear'             // qué hacer si ambas personas ya tienen esta relación
});
```

El registro debe **mezclar** con la declaración del núcleo (mismo `id`), no reemplazarla. Con esto el perfil, la lista, la fusión y el borrado son genéricos y un módulo nuevo (tandas, mesada con personas) se conecta sin tocar `personas.js`. Hoy `abrirPerfilPersona` (`personas.js`) tiene una sección escrita a mano por módulo.

### 4.5 Qué ve la persona

- **Lista:** una fila por persona (hecho) con las etiquetas de sus relaciones («Spotify · Encargo · Me debe $70.000»), generadas desde las relaciones y no a mano (`_relacionPersonaPc`, `_pieTarjetaPersona`).
- **Perfil:** una sección por relación registrada y la **posición neta** con esa persona (lo que te debe, menos lo que le debes, menos la plata que le guardas en encargos). Hoy una persona que está a la vez en «me deben» y «yo debo» no muestra su balance real.
- **Búsqueda global:** una sola entrada por persona (con sus relaciones), en vez de una entrada por módulo con el nombre copiado (`busqueda-global.js`).

### 4.6 Selector único

`PersonaPicker` y `abrirSelPersona` son la puerta para elegir o crear una persona; «crear» ya pasa por `Personas.crear` (detecta el duplicado y usa la existente). Falta: que ningún formulario acepte texto libre como persona (revisar los dos `S.personas.push` que quedan en `prestado.js` ≈693, ≈2536 y ≈2777, que crean personas a mano y se van con las ramas «sin personaId» del problema 6).

### 4.7 Texto libre a propósito

- `diferencial` / reparto: `partes[].nombre` son invitados de un gasto compartido. Se permite vincular una parte a una persona (opcional), sin obligar a crear una persona por cada nombre suelto.
- `mesada`: papá y mamá. Opcional: `mesada.padres = { papa: personaId, mama: personaId }` para que aparezcan en Personas. Fase tardía.

## 5. Impacto por archivo (lo que falta)

| Archivo | Cambio pendiente |
|---|---|
| `core/estado.js` | `S.spotify.integrantes`; corregir el comentario de campos de persona (`estado.js:76-78`) |
| `core/personas-core.js` | `archivar`, `eliminar`, `fusionar`, `posicionNeta`, `relaciones(id)`; quitar banderas `copia` a medida que cada módulo deja de copiar |
| `core/persistencia.js` | quitar el aviso por-sesión de I2 cuando ya no haya copias; `_ensureSpotify` con `integrantes` |
| `core/calc-helpers.js`, `core/reglas.js`, `modules/wrapped.js` | borrar `spotifyNombreDe`, `nombreSpotify`, `_wrappedNombrePersona`; usar `Personas.nombre`; mover al núcleo lo mínimo de Encargos/Spotify (hallazgo §3) |
| `core/busqueda-global.js` | una entrada por persona; ya no busca por `d.nombre` |
| `modules/personas.js` | perfil y lista genéricos sobre relaciones; fusionar, archivar, eliminar; hoja de edición con `alias`/`notas`; borrar los envoltorios `getPersona*` |
| `modules/prestado.js` | quitar las ramas «sin personaId» y los `S.personas.push` manuales; leer nombre y color de la persona |
| `modules/encargos.js`, `modules/spotify.js` | leer nombre y color de la persona; Spotify valida duplicados solo por `personaId` y deja el emparejamiento legado por nombre |
| `modules/plata-comprometida.js` | `destino.deudorId`; el selector se llena con personas que tienen un «me deben» con saldo |
| `modules/configuracion.js` | `_validarEstructuraJSON` comprueba referencias (hoy el import solo reconcilia) |
| `tests/support/datos-sinteticos.js`, `tests/finanzas.test.js` | dejar de sembrar `nombre` en deudores/encargos cuando se quite la copia |
| `docs/personas.md`, `docs/glosario-dominio.md`, `docs/encargos.md`, `docs/spotify.md` | reescribir con el modelo final (hoy `personas.md` §7 marca la copia como transitoria) |

## 6. Migración pendiente

La v13 (vincular huérfanos y unir duplicados exactos) ya existe. Faltan, en una migración nueva idempotente (v14) y plegando todo en `SCHEMA_BASE` al final, porque no hay datos viejos que conservar:

1. **Quitar copias.** Borrar `nombre` y `color` de `deudores`, `misDeudas`, `encargos` e integrantes de Spotify. En `spotify.historial` se conserva `nombre` como foto y se añade `personaId` donde se pueda deducir.
2. **Renombrar** `S.spotify.personas` a `S.spotify.integrantes` y, en Plata comprometida, `destino.personaId` a `destino.deudorId`.
3. **Plegar** v13 y v14 en `SCHEMA_BASE` y registrar el cambio en el CHANGELOG.

Casos borde que siguen sin cubrir: dos deudores de la misma persona (hoy solo se avisa en consola; falta decidir si se unen sus movimientos o se marca en pantalla), y un destino de Plata comprometida que referencia un deudor que ya no existe (dejarlo sin vínculo y avisar).

## 7. Fases que quedan

2. **Relaciones registradas + dominio en el núcleo.** Mover al núcleo lo mínimo de Encargos y Spotify (colección, saldo, nombre); mitad de pantalla del registro; perfil y lista genéricos, etiquetas, posición neta, búsqueda única.
3. **Una sola fuente de nombre y color.** Quitar copias y los cuatro resolvedores; borrar las ramas «sin personaId»; renombres de §6. Conviene hacerla justo después de la 2 para no mantener dos modelos a la vez.
4. **Ciclo de vida.** Archivar, eliminar, fusionar (con `alFusionar` por módulo).
5. **Complementos.** Vincular partes del diferencial y la mesada; `alias` y `notas` (o quitarlos del modelo).

## 8. Pruebas que faltan

- **Invariantes tras cada operación.** `Personas.verificar()` debe devolver vacío después de cada operación de los módulos (crear, editar, fusionar, importar). Hoy se prueba el núcleo y la pantalla; falta recorrer las operaciones de Encargos, Spotify y Préstamos.
- **Escenarios de Inicio.** Los 68 escenarios ya vinculan sus personas; ese chequeo pasaría a ser `Personas.verificar()`.
- **Migración v14.** Respaldos con cada caso borde de §6, antes y después: mismo patrimonio, mismas deudas y mismos saldos por persona.
- **Renombrar.** Con las copias quitadas, comprobar que cambia en todos los módulos sin código de sincronización.
- **Notificaciones.** Prueba de paridad de `scripts/notificaciones` con un respaldo del esquema final (`tests/paridad.test.js` ya existe para otras cosas).

## 9. Decisiones abiertas

Se asume lo recomendado salvo que se indique otra cosa.

1. **`alias` y `notas`:** ¿se añaden a la hoja de edición (el modelo y la búsqueda ya los esperan; sirven para distinguir homónimos) o se eliminan del modelo? *Recomendado: añadirlos.*
2. **Nombre en `spotify.historial` al renombrar a la persona:** foto del momento *(recomendado: es un registro histórico)* o nombre vivo.
3. **Eliminar con historial:** solo archivar *(recomendado)* o permitir borrar con confirmación reasignando a otra persona.
4. **Dos «me deben» de la misma persona:** se permiten (el modelo lo admite, el selector lo impide) o se unen siempre. *Recomendado: uno por persona (`unica`), porque el deudor ya tiene `grupos` internos.*
5. **Mesada y diferencial:** entran ya o se dejan como texto libre. *Recomendado: texto libre por ahora.*

## 10. Riesgos y límites

- Cambio transversal que toca unos doce archivos y ≈170 lecturas de `.nombre`. Se compensa con que cada fase es verificable con `Personas.verificar()` y con que la fase 1 ya está dentro.
- La fusión automática por nombre puede unir a dos personas distintas con el mismo nombre (dos «Carlos»). `reconciliar` solo une coincidencias exactas (ignorando mayúsculas, tildes y espacios) y `crear` ya no permite repetirlas; los homónimos reales exigen apellido o apodo.
- Mover dominio de módulos lazy al núcleo (hallazgo §3) toca `encargos.js` y `spotify.js`: es mover funciones puras sin cambiar su lógica, y las pruebas de `finanzas`, `prestamos` y `cuentas` lo cubren, pero es la parte con más superficie de la fase 2.
- Lo hecho hasta ahora **no** se pudo verificar en el navegador con CSS e íconos reales (no estaban en el adjunto): ver el CHANGELOG.
