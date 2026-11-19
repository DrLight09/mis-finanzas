# Personas: una sola tabla y los módulos como relaciones — lo que falta

Plan de diseño (análisis original 2026-11-16, revisado contra el código el 2026-11-18). **Aquí solo queda lo pendiente.** Lo ya hecho vive en [`CHANGELOG.md`](./CHANGELOG.md) («Personas: núcleo único», fases 1 y 2) y en [`personas.md`](./personas.md). No se tiene en cuenta el riesgo de migración: la app no tiene usuarios activos y se busca el mejor resultado final.

## 1. Decisión (vigente)

Una sola entidad **Persona** (`S.personas`) que existe una vez; cada módulo (Spotify, Encargos, Préstamos, Yo debo, y los que vengan) guarda **solo su relación** con ella (`personaId` + los datos propios del módulo) y nunca una copia del nombre ni del color. Lo que la pantalla Personas muestra de cada persona (dónde participa, cuánto se debe, su posición neta) se **calcula** a partir de las relaciones, no se guarda.

Alternativas descartadas: persona con sub-objetos por módulo (acopla todos los módulos a un registro, una persona con dos encargos no cabe, apagar un módulo deja huecos) y «solo reconciliar al cargar» (arregla el síntoma pero deja la copia de nombre/color y las ramas «sin personaId»; ya se hizo como primer paso de esta decisión).

## 2. Estado actual

**Hecho:** fase 1 (`Personas` en el núcleo: lectura, `crear` sin duplicados, `editar`, `verificar` I1–I4, `huerfanos`), fase 2 (cada relación declara `saldo`, `resumen` y `pantalla` en el núcleo; lista, perfil y búsqueda salen de `Personas.relaciones(id)`) fase 5 (`alias` y `notas` editables), fase 4 (archivar, restaurar, eliminar solo sin relaciones; la fusión se hizo y luego se quitó, ver el CHANGELOG) y fase 3 (nombre y color solo en `S.personas`: ningún módulo guarda copia, un único camino de lectura `Personas.nombre/color`, `S.spotify.integrantes`, `destino.deudorId`, sin ramas «sin personaId»). Todo está en el [`CHANGELOG.md`](./CHANGELOG.md). No hay migración de datos: la app no tiene datos que conservar.

**Queda, de los problemas originales:**


### Tabla de dónde vive la gente (para lo que queda)

| Dónde | Estructura | Falta |
|---|---|---|
| Libreta central (única fuente de nombre y color) | `S.personas: [{id, nombre, color, alias?, notas?, creadoEn, archivada?}]` | nada |
| Diferencial / reparto | `beneficiarios[].personaId` (relación `margenes`) | nada |
| Mesada | `MESADA_PADRES = ['papa','mama']` fijos | opcional (ver §4.7) |

## 3. Hallazgos de la revisión del 2026-11-18 (no estaban en el análisis original)

- **Notificaciones:** `scripts/notificaciones/run.js` y `checks.js` no leen nombres de las personas desde los registros (la regla de encargos y la de Spotify usan `nombrePersona(S, id)` de `reglas.js`, pura sobre `S`, porque también corre en Node sin el núcleo). Falta una prueba de paridad con un respaldo del esquema final.
- **Un solo documento de Firestore** (tope 1 MiB, avisa a 800 KB; `firebase-sync.js:246`). Quitar copias ayuda poco; partir el estado por colección es otro proyecto, fuera de este plan.

## 4. Modelo objetivo (lo que falta)

### 4.1 Datos finales

```text
S.personas: [{ id, nombre, color, alias?, notas?, creadoEn, archivada? }]   // archivada ya existe

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
- **I3 con archivadas** e **I5** (una persona con relaciones no se elimina, se archiva) ya se cumplen: `verificar` vigila I3 solo entre las no archivadas y `eliminar` rechaza a quien tenga relaciones.

### 4.3 API de `Personas` que falta

- Lectura: `iniciales(id)` (hoy existe un `iniciales` global en `bootstrap.js`); opcional.

### 4.4 Relaciones: lo que falta

Nada.

### 4.5 Qué ve la persona: lo que falta

Nada pendiente en lista, perfil ni búsqueda.

### 4.6 Selector único

`PersonaPicker` y `abrirSelPersona` son la puerta para elegir o crear una persona; «crear» ya pasa por `Personas.crear` (detecta el duplicado y usa la existente). Falta revisar que ningún formulario acepte texto libre como persona (los `S.personas.push` manuales de `prestado.js` ya se quitaron).

### 4.7 Texto libre a propósito

- `diferencial` / reparto: **ya vinculado** (2026-11-19). Cada parte guarda `personaId`, se elige con el selector de personas y es obligatoria si la parte tiene plata. Relación `margenes` en el núcleo.
- `mesada`: papá y mamá. Opcional: `mesada.padres = { papa: personaId, mama: personaId }` para que aparezcan en Personas. Fase tardía.

## 5. Impacto por archivo (lo que falta)

| Archivo | Cambio pendiente |
|---|---|
| `modules/configuracion.js` | `_validarEstructuraJSON` comprueba referencias (hoy el import solo reconcilia) |
| `docs/glosario-dominio.md` | revisar términos tras archivar |

## 6. Casos sin cubrir

- Un destino de Plata comprometida (`deudorId`) que referencia un deudor que ya no existe.

## 7. Fases que quedan

Las cinco fases previstas están hechas. Solo queda lo opcional de §4.7 (los padres de la mesada, que son categorías fijas y se dejan así).

## 8. Pruebas que faltan

- **Invariantes tras cada operación.** `Personas.verificar()` debe devolver vacío después de cada operación de los módulos (crear, editar, importar). Hoy se prueba el núcleo y la pantalla; falta recorrer las operaciones de Encargos, Spotify y Préstamos.
- **Escenarios de Inicio.** Los 68 escenarios ya vinculan sus personas; ese chequeo pasaría a ser `Personas.verificar()`.
- **Notificaciones.** Prueba de paridad de `scripts/notificaciones` con un respaldo del esquema final.

## 9. Decisiones abiertas

Decididas con lo recomendado; se reabren solo si tú lo pides.

1. **Nombre en `spotify.historial` al renombrar a la persona:** se dejó como foto del momento (es un registro histórico).
2. **Mesada:** sus padres (`papa`, `mama`) se dejan como categorías fijas. El diferencial sí se vinculó (el usuario indicó que quien se lleva el margen siempre es una persona de la app).

## 10. Riesgos y límites

- Cada fase es verificable con `Personas.verificar()`; las cinco fases ya están dentro.
- `crear` y `editar` no permiten repetir un nombre entre las no archivadas; los homónimos reales exigen apellido o apodo.
- Lo hecho hasta ahora (fases 1 a 5) pasa todos los tests y el smoke con el CSS real, pero **no se ha visto en un navegador de verdad**: hay que mirar la lista y el perfil de Personas (bloque «Saldo neto» y los botones nuevos de Fusionar, Archivar/Restaurar y Eliminar, que reutilizan `btn btn-ghost pe-mt10`), y probar a fusionar dos personas con préstamos y a archivar una con saldo.
