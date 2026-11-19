# Personas: una sola tabla y los módulos como relaciones — lo que falta

Plan de diseño (análisis original 2026-11-16, revisado contra el código el 2026-11-18). **Aquí solo queda lo pendiente.** Lo ya hecho vive en [`CHANGELOG.md`](./CHANGELOG.md) («Personas: núcleo único», fases 1 y 2) y en [`personas.md`](./personas.md). No se tiene en cuenta el riesgo de migración: la app no tiene usuarios activos y se busca el mejor resultado final.

## 1. Decisión (vigente)

Una sola entidad **Persona** (`S.personas`) que existe una vez; cada módulo (Spotify, Encargos, Préstamos, Yo debo, y los que vengan) guarda **solo su relación** con ella (`personaId` + los datos propios del módulo) y nunca una copia del nombre ni del color. Lo que la pantalla Personas muestra de cada persona (dónde participa, cuánto se debe, su posición neta) se **calcula** a partir de las relaciones, no se guarda.

Alternativas descartadas: persona con sub-objetos por módulo (acopla todos los módulos a un registro, una persona con dos encargos no cabe, apagar un módulo deja huecos) y «solo reconciliar al cargar» (arregla el síntoma pero deja la copia de nombre/color y las ramas «sin personaId»; ya se hizo como primer paso de esta decisión).

## 2. Estado actual

**Hecho:** fase 1 (`Personas` en el núcleo: lectura, `crear` sin duplicados, `editar`, `verificar` I1–I4, `huerfanos`), fase 2 (cada relación declara `saldo`, `resumen` y `pantalla` en el núcleo; lista, perfil y búsqueda salen de `Personas.relaciones(id)`) y fase 3 (nombre y color solo en `S.personas`: ningún módulo guarda copia, un único camino de lectura `Personas.nombre/color`, `S.spotify.integrantes`, `destino.deudorId`, sin ramas «sin personaId»). Todo está en el [`CHANGELOG.md`](./CHANGELOG.md). No hay migración de datos: la app no tiene datos que conservar.

**Queda, de los problemas originales:**

7. **Eliminar, archivar y fusionar:** sigue sin existir ninguna ruta que quite elementos de `S.personas`. (La parte de «duplicados creados por error» ya se previene: `Personas.crear` y `editar` no permiten nombres repetidos.)
8. **Campos fantasma:** `alias` y `notas` los documenta `estado.js:76` y los lee la búsqueda global (`busqueda-global.js:220`), pero ninguna pantalla los escribe. Un comentario de Spotify habla de «color/foto» y no hay foto.

### Tabla de dónde vive la gente (para lo que queda)

| Dónde | Estructura | Falta |
|---|---|---|
| Libreta central (única fuente de nombre y color) | `S.personas: [{id, nombre, color, alias?, notas?, creadoEn}]` | `archivada?`; escribir `alias`/`notas` desde la hoja de edición |
| Diferencial / reparto | `partes[].nombre` de texto libre | vincular opcional (ver §4.7) |
| Mesada | `MESADA_PADRES = ['papa','mama']` fijos | opcional (ver §4.7) |

## 3. Hallazgos de la revisión del 2026-11-18 (no estaban en el análisis original)

- **Notificaciones:** `scripts/notificaciones/run.js` y `checks.js` no leen nombres de las personas desde los registros (la regla de encargos y la de Spotify usan `nombrePersona(S, id)` de `reglas.js`, pura sobre `S`, porque también corre en Node sin el núcleo). Falta una prueba de paridad con un respaldo del esquema final.
- **Un solo documento de Firestore** (tope 1 MiB, avisa a 800 KB; `firebase-sync.js:246`). Quitar copias ayuda poco; partir el estado por colección es otro proyecto, fuera de este plan.

## 4. Modelo objetivo (lo que falta)

### 4.1 Datos finales

```text
S.personas: [{ id, nombre, color, alias?, notas?, creadoEn, archivada? }]

S.deudores:  [{ id, personaId, movimientos, … }]        // sin nombre ni color (ya así)
S.misDeudas: [{ id, personaId, tasaEA?, movimientos }]  // sin nombre ni color
S.encargos:  [{ id, personaId, nota, saldoInicial, … }] // sin nombre
S.spotify.integrantes: [{ id, personaId, monto, proximoPago, … }]   // sin nombre
S.spotify.historial: [{ …, personaId, nombre }]          // `nombre` es FOTO del momento (a propósito)
plataComprometida destino: { …, deudorId }
```

### 4.2 Invariantes

I1–I4 ya se comprueban (`Personas.verificar`). Quedan:

- **I2 (ya definitiva).** `verificar` reporta `copia-guardada` si un registro de una relación tiene `nombre` o `color`. Las **fotos** históricas (`spotify.historial`, descripciones del libro, Wrapped guardados) no son registros de relación y conservan el nombre a propósito.
- **I3 con archivadas.** Hoy la unicidad de nombre es entre todas las personas; con `archivada` pasa a ser «entre las no archivadas».
- **I5.** Una persona con relaciones que tengan saldo o historial **no se elimina**: se archiva.

### 4.3 API de `Personas` que falta

- Lectura: `iniciales(id)` (hoy existe un `iniciales` global en `bootstrap.js`), `lista({archivadas})`.
- Escritura: `archivar(id)`, `eliminar(id)` (solo sin relaciones), `fusionar(origenId, destinoId)`; `editar` con `alias` y `notas`.

### 4.4 Relaciones: lo que falta

Falta `alFusionar(origen, destino)` por relación (qué hacer si ambas personas ya tienen esa relación: `'bloquear'`, `'unir'`…), que usa la fusión de la fase 4. Con eso fusionar, archivar y eliminar son genéricos: recorren las relaciones declaradas.

### 4.5 Qué ve la persona: lo que falta

Nada pendiente en lista, perfil ni búsqueda.

### 4.6 Selector único

`PersonaPicker` y `abrirSelPersona` son la puerta para elegir o crear una persona; «crear» ya pasa por `Personas.crear` (detecta el duplicado y usa la existente). Falta revisar que ningún formulario acepte texto libre como persona (los `S.personas.push` manuales de `prestado.js` ya se quitaron).

### 4.7 Texto libre a propósito

- `diferencial` / reparto: `partes[].nombre` son invitados de un gasto compartido. Se permite vincular una parte a una persona (opcional), sin obligar a crear una persona por cada nombre suelto.
- `mesada`: papá y mamá. Opcional: `mesada.padres = { papa: personaId, mama: personaId }` para que aparezcan en Personas. Fase tardía.

## 5. Impacto por archivo (lo que falta)

| Archivo | Cambio pendiente |
|---|---|
| `core/personas-core.js` | `archivar`, `eliminar`, `fusionar` (+ `alFusionar` por relación) |
| `core/persistencia.js` | el aviso por-sesión de `verificar` ya existe; ampliarlo cuando haya archivadas |
| `modules/personas.js` | fusionar, archivar, eliminar; hoja de edición con `alias`/`notas` |
| `modules/configuracion.js` | `_validarEstructuraJSON` comprueba referencias (hoy el import solo reconcilia) |
| `docs/glosario-dominio.md` | revisar términos tras archivar/fusionar |

## 6. Casos sin cubrir

- Dos deudores de la misma persona (`verificar` lo reporta como I4; falta decidir si se unen sus movimientos o se marca en pantalla).
- Un destino de Plata comprometida (`deudorId`) que referencia un deudor que ya no existe.

## 7. Fases que quedan

4. **Ciclo de vida.** Archivar, eliminar, fusionar (con `alFusionar` por módulo).
5. **Complementos.** Vincular partes del diferencial y la mesada; `alias` y `notas` (o quitarlos del modelo).

## 8. Pruebas que faltan

- **Invariantes tras cada operación.** `Personas.verificar()` debe devolver vacío después de cada operación de los módulos (crear, editar, fusionar, importar). Hoy se prueba el núcleo y la pantalla; falta recorrer las operaciones de Encargos, Spotify y Préstamos.
- **Escenarios de Inicio.** Los 68 escenarios ya vinculan sus personas; ese chequeo pasaría a ser `Personas.verificar()`.
- **Notificaciones.** Prueba de paridad de `scripts/notificaciones` con un respaldo del esquema final.

## 9. Decisiones abiertas

Se asume lo recomendado salvo que se indique otra cosa.

1. **`alias` y `notas`:** ¿se añaden a la hoja de edición (el modelo y la búsqueda ya los esperan; sirven para distinguir homónimos) o se eliminan del modelo? *Recomendado: añadirlos.*
2. **Nombre en `spotify.historial` al renombrar a la persona:** foto del momento *(recomendado: es un registro histórico)* o nombre vivo.
3. **Eliminar con historial:** solo archivar *(recomendado)* o permitir borrar con confirmación reasignando a otra persona.
4. **Dos «me deben» de la misma persona:** se permiten (el modelo lo admite, el selector lo impide) o se unen siempre. *Recomendado: uno por persona (`unica`), porque el deudor ya tiene `grupos` internos.*
5. **Mesada y diferencial:** entran ya o se dejan como texto libre. *Recomendado: texto libre por ahora.*

## 10. Riesgos y límites

- Cada fase es verificable con `Personas.verificar()`; las fases 1 a 3 ya están dentro.
- La fusión automática por nombre puede unir a dos personas distintas con el mismo nombre (dos «Carlos»). `crear` y `editar` ya no permiten repetir un nombre (ignorando mayúsculas, tildes y espacios); los homónimos reales exigen apellido o apodo.
- Lo hecho hasta ahora (fases 1 a 3) **no** se pudo verificar por completo en el navegador con CSS e íconos reales (no estaban en el adjunto): hay que mirar la lista y el perfil de Personas, sobre todo el bloque «Saldo neto» del perfil, que reutiliza clases existentes (`pe-grid2-mb8`, `pe-celda`).
