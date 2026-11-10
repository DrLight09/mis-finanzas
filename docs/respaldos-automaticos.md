# Respaldos automáticos

Desde 2026-11-09 (SW v115) la app conserva sola copias de tus datos, sin que tengas que exportar nada. Complementan la exportación manual a `.json`, no la reemplazan.

## 1. El problema

Todos los datos viven en **un solo documento** de Firestore (`usuarios/{uid}/data/finanzas`) que cada guardado sobrescribe. No guarda historial: si un error, una importación equivocada o un guardado malo lo daña, queda dañado en la nube. La única red de seguridad era acordarse de exportar el JSON.

## 2. Qué hace

Antes de sobrescribir la nube, la app copia lo que había. Hay dos clases de respaldo:

| Clase | Cuándo se crea | Qué contiene | Cuántos se conservan |
|---|---|---|---|
| **diario** | La primera vez que se guarda algo en un día nuevo | El estado con que terminó el día anterior | 30 en la nube · 7 en el dispositivo |
| **previo** | Justo antes de importar un JSON o de restaurar un respaldo | Lo que había un instante antes de pisarlo | 5 en la nube · 2 en el dispositivo |

Se guardan en **dos sitios independientes**:

- **La nube:** documentos hermanos del principal, en la misma colección `data`: `respaldo-AAAA-MM-DD`, `respaldo-previo-AAAA-MM-DD-HHMMSS` y un índice `respaldos-indice` con sus metadatos (así listar y podar cuesta **una** lectura).
- **El dispositivo:** IndexedDB (`mf-respaldos`). Sirve sin conexión y no depende de Firebase. Se pierde si limpias los datos del navegador o desinstalas la app, por eso es complemento y no reemplazo de la nube.

**Lo que NO hace:** no corre si no abres la app (un respaldo «a las 11:59 pm» sin abrirla exige un servidor: plan Blaze, ver §7). Si un día no abres la app, ese día no tiene respaldo, y tampoco hace falta: no cambió nada.

## 3. Restaurar

Configuración → Datos → **Respaldos automáticos** → «Ver respaldos» → «Restaurar» en la fila que quieras.

1. Se lee el respaldo (de la nube; si no responde, del dispositivo).
2. Pasa por **la misma validación que importar un archivo** (`_validarEstructuraJSON`): uno que no la pasa no reemplaza nada.
3. Pide confirmación y el **PIN** (si lo tienes activo).
4. Antes de pisar, el guardado forzado crea un respaldo **previo** de lo que tienes ahora: restaurar también se puede deshacer.

Importar un JSON usa exactamente el mismo camino (`_reemplazarDatos` en `configuracion.js`) y también deja un previo.

## 4. Reglas que no se rompen

- **Un respaldo que falla jamás impide guardar.** Va en una transacción propia y dentro de `try/catch`, separada del guardado de los datos. Si las reglas de Firestore lo rechazan, el guardado sigue normal.
- **Nunca se respalda un documento vacío ni inexistente** (`{}`, usuario nuevo, «borrar todo»): no hay nada que proteger.
- **El payload se copia tal cual** (ya comprimido, `gz1:`): no se descomprime ni se recomprime, así que la copia es idéntica byte a byte.
- **Si las reglas deniegan, se avisa una vez y no se insiste** en esa sesión (cero peticiones fallidas extra). Configuración muestra el motivo.
- **«Borrar todos los datos» y «Eliminar cuenta» también borran los respaldos** (nube y dispositivo). Es el comportamiento esperado de «borrar todo»; el diálogo lo dice. El borrado de respaldos ocurre **después** de confirmar que el documento principal se vació.

## 5. Reglas de seguridad de Firestore (lo único que se revisa en la consola)

Esas reglas **no están en este repo**: se editan en Firebase Console → Firestore → Reglas. Los respaldos viven bajo `usuarios/{uid}/data/…`, la misma ruta del documento principal, así que:

- Si tus reglas ya cubren todo `usuarios/{uid}` o todo `usuarios/{uid}/data/{documento}` → **no hay que cambiar nada.**
- Si solo permiten el documento `finanzas` por nombre → hay que ampliarlas. Una regla mínima y suficiente:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid}/{documento=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

**Cómo comprobar que funciona (en tu app real):** guarda algo (basta abrir la app: el snapshot diario de patrimonio ya dispara un guardado) y mira en Firestore → `usuarios/{uid}/data`: deben aparecer `respaldo-AAAA-MM-DD` y `respaldos-indice`. En la app, «Ver respaldos» debe listar el de hoy. Si las reglas lo impiden, la app lo dice en Configuración y con un aviso.

## 6. Costos y tamaño

- Cada día: 1 lectura del principal + 2 del respaldo/índice y 2 escrituras (+ 1 borrado cuando se llega al tope). Listar respaldos: 1 lectura.
- Cada copia pesa como el documento principal (hoy una fracción del límite de 1 MiB; ver «Tamaño de tus datos»). 30 diarios + 5 previos = 35 copias: aun con el documento en el tope serían ~35 MiB, muy por debajo del 1 GiB del plan gratis.
- Todo cabe en el plan gratis (Spark); no hace falta tarjeta.

## 7. Decisiones de diseño

- **Dentro de `data/` y no en una subcolección `backups/`.** Se propuso `usuarios/{uid}/backups/…`, pero una subcolección nueva casi seguro exige tocar las reglas; `data/` ya está cubierta por las reglas del documento principal. Menos fricción, mismo resultado.
- **Índice en un documento aparte.** Firestore no permite leer solo los metadatos de un documento: listar 35 respaldos completos serían 35 lecturas y hasta decenas de MiB. Con el índice son 1 lectura y unos bytes. Se actualiza en la misma transacción que crea/borra el respaldo, así que no se desincroniza.
- **Transacción propia, no la del guardado.** Si el respaldo viviera en la transacción principal, unas reglas que lo denieguen harían fallar TODO el guardado. Separadas, el peor caso es «no hay respaldo hoy».
- **Se identifica por día local** (hora del dispositivo, `fechaLocal`), no UTC: el «día» es el tuyo. La marca «hoy ya respaldé» (`mf_respaldoDia`, `mf_respaldoEquipoDia`) lleva el uid para que otra cuenta en el mismo navegador no la herede.
- **La copia del dispositivo parte del último estado conocido de la nube** (`_lastSavedPayload`, que solo se actualiza después de escribir), así funciona sin conexión.
- **Si hay conflicto de revisión, no se respalda:** el guardado se descarta y se carga la versión de la nube (ver `rev` en `firebase-sync.js`); no hay nada que pisar.
- **Alternativa de servidor (plan Blaze, no implementada):** una Cloud Function programada o la recuperación a un punto en el tiempo de Firestore (hasta 7 días) funcionan aunque no abras la app, pero piden tarjeta y configurar Cloud Functions. Si algún día se quiere, es independiente de esto y se suma, no lo reemplaza.

## 8. Referencia de implementación

| Qué | Dónde |
|---|---|
| Lógica pura (ids, poda, copia a la nube, almacén IndexedDB, copia al dispositivo, fusión, lectura, borrado) | `js/core/respaldos.js` (módulo ES, sin DOM; todo lo externo entra por parámetros) |
| Cuándo respaldar, manejo de errores, `window._fbRespaldos` (`listar`, `leer`, `estado`, `borrarTodos`) | `js/core/firebase-sync.js` (`_respaldarAntesDeEscribir`, llamado desde `_escribirNube`) |
| `collection` / `getDocs` expuestos (solo para limpiar huérfanos) | `js/core/firebase-init.js` |
| UI: lista, restaurar, reemplazo de datos compartido con importar | `js/modules/configuracion.js` (`renderRespaldos`, `verRespaldos`, `restaurarRespaldo`, `_reemplazarDatos`) |
| Pruebas | `tests/respaldos.test.js` (Firestore e IndexedDB simulados; integración con `firebase-sync.js` real) |

**Claves de `localStorage`:** `mf_respaldoDia`, `mf_respaldoEquipoDia` (día ya respaldado, con uid), `mf_respaldoUltimo` (último respaldo creado, para mostrarlo), `mf_respaldoError` (`permisos` u otro motivo). Todas llevan prefijo `mf_`, así que «Eliminar cuenta» las limpia.
