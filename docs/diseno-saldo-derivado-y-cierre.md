# Saldo derivado del libro + cierre de períodos (etapa 2) — diseño conjunto

**Estado: paso 1 implementado (2026-11-23); pasos 2–5 pendientes.** Reemplaza en `pendientes.md` las filas #2 (parte de recalcular saldos), #6 y #15, y desarrolla §5.6 y §3.8. Se apoya en `docs/cierre-de-periodos.md` (§4–§5), que sigue siendo el documento maestro del cierre.

Criterio de trabajo: gana el mejor resultado; no hay usuarios ni datos que migrar, así que el esquema cambia sin migración (se sube `SCHEMA_BASE` y se descarta lo viejo).

## 1. Por qué un solo cambio

Hoy el dinero de una cuenta vive en dos sitios: `c.saldo` y la suma de `S.libro`. Todo el código de seguridad existente (`Libro.verificar`, `recalcularSaldos`, `_fijarSaldoReconciliado`, el aviso de «el libro no cuadra») existe solo para vigilar que no se separen. Y el cierre (§5.5 del maestro) tiene que plegar el libro sin alterar ningún saldo: con dos copias hay que mantener ambas en sincronía; con una sola fuente de verdad no hay nada que sincronizar.

Verificado en el código: `S.libro` solo lo modifica `Libro.registrar` (en `cuentas-fuentes.js`); ningún otro archivo escribe en él ni asigna `.saldo` de una cuenta o cajita. El núcleo ya está encapsulado.

## 2. Modelo: el saldo es una vista del libro

**Regla:** `saldo` de una cuenta o cajita no se guarda nunca. Se calcula del libro.

### 2.1 Mecanismo
- `Libro` mantiene un índice por estado: `WeakMap<estado.libro, { largo, centavos: Map<cuenta, entero> }>`.
- Los montos se acumulan en **centavos enteros**. La suma de enteros no depende del orden, por lo que dos dispositivos que fusionan el mismo conjunto de entradas obtienen exactamente el mismo saldo (sin residuos de decimales binarios).
- `Libro.registrar` actualiza el índice de forma incremental, incluido el caso de `rendimiento` que crece en su sitio (ADITIVOS `monto`).
- Defensa: el índice guarda el largo del libro; si al leer no coincide (alguien hizo `push` por fuera), se reconstruye. Una reconstrucción completa es O(n) y solo ocurre tras carga, importación, fusión o cierre.
- `Libro.hidratar(estado)` define en cada cuenta (≠ ahorro) y cajita una propiedad `saldo` **accesora y no enumerable**: el getter lee el índice. **Cambio respecto a la primera versión del diseño:** el setter no lanza siempre; asignar `saldo` registra un ajuste `asignacion-directa` por la diferencia (así el libro nunca queda descuadrado y las ~190 pruebas que siembran saldos siguen valiendo), y con `Libro.estricto = true` lanza error (lo usan las pruebas de invariantes).

### 2.2 Qué se gana
- Al ser no enumerable, `JSON.stringify`, el guardado local, el de la nube, `exportarJSON` y los clones **no pueden filtrar** el saldo: no hay que tocar cada punto de serialización (hay al menos cuatro: `save()`, `firebase-sync.js`, `exportarJSON`, `huella.js`).
- El setter que lanza convierte «código que mueve un saldo por fuera de la puerta única» de bug silencioso en error inmediato en cualquier prueba. El descuadre pasa de **vigilado** a **imposible por construcción**.
- Los ~98 lugares que **leen** `.saldo` no cambian (muchos son de otras entidades: encargos, préstamos, deudores).

### 2.3 Qué se elimina
- `_fijarSaldoReconciliado`, `Libro.recalcularSaldos` y su heurística «solo si la base cuadraba».
- La escritura `c.saldo += …` dentro de `sumarFuente`/`descontarFuente` (quedan solo con `Libro.registrar`).
- El bloque de verificación de `persistencia.js` (~l.226) y el toast «El libro no cuadra».
- `saldo` en los tres sitios que crean cuentas o cajitas: `nu.js:599`, `cuentas-fuentes.js:111` (Efectivo) y `cuentas.js` (nueva cuenta). Estos pasan por una fábrica `Cuentas.nueva(...)` que hidrata.
- `Libro.verificar` se conserva, pero con otro papel: compara el **espejo** (`S.movimientos`, `gastosVar`, etc.) contra el libro (§5), no el saldo contra el libro.

### 2.4 Importación y respaldos
Un JSON con `saldo` guardado (respaldo viejo) **no se ignora**: se conserva y la diferencia con el libro queda como ajuste «Saldo importado» (mejor que ponerlo en 0). No hace falta subir `SCHEMA_BASE` ni migrar.

### 2.5 Dónde se hidrata
Fin de carga local y de nube, importación, restauración de respaldo, después de fusionar, dentro de `conEstadoAislado` (clones) y en la fábrica de cuentas. Un clon sin hidratar da `saldo === undefined`; hay que cubrirlo con prueba y auditar los sitios que hagan `{...cuenta}` o `structuredClone(cuenta)`.

## 3. Fusión entre dispositivos

Con `saldo` fuera del estado, la fusión del libro es solo unión por `id` más ADITIVOS en `monto` de `rendimiento`. Dos dispositivos que registran movimientos distintos producen la suma correcta sin lógica especial.

Casos a cubrir con la prueba de propiedades (§6): ambos dispositivos suman rendimiento al mismo mes; ambos retiran de la misma cuenta; uno revierte y otro edita.

## 4. Cierre de períodos (etapa 2) sobre este modelo

El maestro (§5.5) pliega el libro por componente en una entrada `tipo: 'cierre'` por cuenta. Con saldo derivado:
- La invariante del cierre es directa: **el saldo derivado antes == después** (la sonda `saldos` de la huella ya lo compara).
- Como la suma de enteros no cambia al plegar, no hay que reajustar nada guardado.
- `rendimiento`, `ajuste` y `cdt` no se pliegan (siguen el maestro).

### 4.1 Corrección a `pendientes.md` §3.8
El documento dice «no hace falta particionar». Ya se decidió construir la etapa 2 ahora y no esperar a 2028. La regla de 24 meses y el disparador por tamaño solo gobiernan **cuándo se ofrece** el botón en la UI, no si el código existe. Se desarrolla y prueba con datos sintéticos pasando el corte por parámetro (`Cierre.analizar(corte)` ya lo admite). Con datos reales el botón aparecerá cuando haya algo cerrable.

### 4.2 Riesgo nuevo que el maestro no cubre: cierre y fusión
Un dispositivo B atrasado podría traer entradas con fecha ≤ corte que el cierre ya resumió. La fusión es de 3 vías, así que lo podado y sin cambios en B se elimina bien, pero un registro **nuevo** en B con fecha antigua sobreviviría fuera del resumen. Mitigaciones:
1. El cierre solo corre con la revisión de nube vigente (el `rev` de `_escribirNube` ya existe): se relee antes de ejecutar.
2. Tras cualquier fusión, la huella verifica que no haya registros ≤ `S.cierre.corte` fuera de los plegados. Si aparece alguno, se avisa y se ofrece repetir el cierre (idempotente).
3. El candado §5.7 impide crearlos en el dispositivo que ya cerró.

## 5. Consistencia espejo ↔ libro (reemplaza lo que vigilaba `verificar`)

Cada módulo que mueve plata deja una fila en su espejo y patas en el libro. Hoy nada comprueba que coincidan. La prueba de propiedades (ver abajo) ejecuta secuencias aleatorias de operaciones (crear, editar, borrar, revertir) sobre datos sintéticos y exige, tras cada paso:
- el saldo derivado de cada cuenta = suma de las patas del libro de esa cuenta;
- las patas de cada `origen.ref` suman lo que dice su fila del espejo;
- crear + borrar deja el estado idéntico al inicial (contrato «aplicar / revertir» de §5.5 de `pendientes.md`).

## 6. Pruebas nuevas

| Prueba | Qué exige |
|---|---|
| Serialización | `JSON.stringify(S)` no contiene `saldo` de ninguna cuenta ni cajita; importar un JSON viejo con `saldo` lo ignora. |
| Setter | Asignar `cuenta.saldo = x` lanza error. |
| Índice | Tras N `registrar` aleatorios, el índice == recálculo desde cero; `push` externo se detecta por el largo. |
| Clones | `conEstadoAislado` y clones hidratados dan los mismos saldos; un clon sin hidratar falla la prueba de auditoría. |
| Fusión (propiedades) | Conmutativa e idempotente sobre estados generados; saldo del resultado == suma del libro de la unión. |
| Cierre | Saldos y huella idénticos antes y después; segunda ejecución no cambia nada; par partido por el corte (transferencia, reversión) queda en una unidad. |
| Cierre + fusión | El caso de §4.2. |
| Espejo ↔ libro | Las tres propiedades de §5 con secuencias aleatorias. |

## 7. Orden de implementación

1. `Libro` con índice en centavos + `hidratar` + setter que lanza; fábrica `Cuentas.nueva`; quitar escrituras de `saldo` y el código de reconciliación. Pruebas de §6 (serialización, setter, índice, clones).
2. Simplificar la fusión y añadir la prueba de propiedades.
3. Prueba de consistencia espejo ↔ libro; arreglar lo que encuentre.
4. Cierre etapa 2 según el maestro §5.2–§5.9, con §4.2 de este documento.
5. Actualizar `docs/libro-de-movimientos.md`, `docs/cierre-de-periodos.md`, `pendientes.md` (quitar #2 parcial, #6, #15), `mapa-codigo.md` y el CHANGELOG.

## 8. Lo que no se sabe todavía

- Si hay lecturas de cuentas que se clonan con spread o `structuredClone` y esperan `saldo` (auditoría del paso 1).
- El costo real del índice en celular con 5+ años de libro (se mide en el paso 1; se espera despreciable frente al guardado).
- Las pantallas con meses cerrados (§5.6 del maestro): hay que recorrerlas en jsdom y a mano.
- No pude correr la suite completa ni los escenarios en esta sesión (faltan `node_modules` y los escenarios); solo corrieron los 18 tests de fusión.
