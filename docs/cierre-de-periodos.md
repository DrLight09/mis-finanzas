# Cierre de períodos (historia antigua) — etapa 1 implementada, etapa 2 diferida

Estado (2026-10-29): **etapa 1 implementada y probada** (huella de invariantes, vista previa de solo lectura, medidor de tamaño). **No se archiva, compacta ni borra nada.** La etapa 2 (archivo por años) está diseñada aquí y se implementa solo cuando se cumpla el disparador de §5. La propuesta original (compactar con una `apertura` por cuenta y un `resumenMensual`) quedó **descartada como primera opción** por las razones de §3.

## 1. Por qué no es urgente (medido)
Todo el estado vive en un documento de Firestore (tope 1 MiB) y viaja comprimido. Medido con historia sintética (formas reales de movimiento, gasto y libro; ~5 movimientos/día), comprimido con el códec del guardado:

| Antigüedad | Comprimido | Respecto al límite |
|---|---|---|
| 2 años | ≈ 152 KB | 15 % |
| 5 años | ≈ 377 KB | 38 % |
| 9 años | ≈ 675 KB | bajo el aviso de 800 KB |

Solo se supera el límite con ~15 movimientos/día durante 5 años. Y la app nació limpia el 2026-10-18 (esquema 9): no habrá movimientos de 2 años hasta octubre de 2028. Las cifras reales las da el medidor (Configuración → Datos → «Tamaño de tus datos»).

## 2. La idea inicial, formalizada
Si el saldo de una cuenta hasta una fecha D suma 0, quitar esas entradas no cambia el saldo. Se generaliza: reemplazar las entradas ≤ D por una sola `apertura` con esa suma (cierre de libros). Es correcta **para el saldo**; el problema es que el saldo no es lo único que lee el pasado.

## 3. Por qué la compactación literal no es la mejor solución para esta app
1. **Wrapped no se puede reproducir con un resumen mensual.** Usa el gasto individual más grande (con descripción y fecha), la categoría líder por monto y por frecuencia, promedio por gasto, conteos, racha, mejor/peor mes y un dominio por cada módulo (encargos, préstamos, mesada, Spotify, comprometida, intereses y comisiones de tarjeta). Borrar el detalle cambia el Wrapped de un año cerrado; una prueba lo demuestra (la poda ingenua es detectada en períodos, Wrapped y libro).
2. **Demasiados lectores directos.** `S.gastosVar` se lee en 15 archivos (79 sitios) y `S.movimientos` en 15 (152). Adaptar solo `Periodo` y Wrapped dejaría el resto (búsqueda, actividad, Gastos, encargos, préstamos, Spotify) leyendo datos que ya no existen.
3. **Cada módulo deriva distinto.** Libro: aditivo. Tarjetas: saldo inicial + compras + cargos − pagos con borrado lógico (`eliminado`) y **piso en 0**. Encargos: bolsa propia (`enc.movimientos`), saldo siempre derivado. Alcancía: saldo guardado + copia ofuscada, y cada ciclo destapado guarda una **copia** de sus depósitos. Una regla central única de compactación no puede respetar todo eso.
4. **La protección por antigüedad no basta como candado.** `diasBloqueo` es configurable por el usuario; «≥ 2 años = inmutable» no está garantizado. Un cierre debe imponer su propio candado.
5. **El guardado actual es atómico por construcción** (un solo `setDoc` del estado completo). Repartir en varios documentos solo conserva la atomicidad con `runTransaction` (expuesto en `firebase-init.js`; `writeBatch`, `collection` y `getDocs` no lo están).
6. Una `reversion` del libro lleva la fecha de cuando se deshizo, no la del original: el corte puede partir el par. Y los registros se enlazan con ~25 campos distintos (`_encMovId`, `_transfId`, `_tcCompraId`, `origen.ref`…).

## 4. Decisión
**Etapa 1 (hecha, sin riesgo para los datos):** construir lo que cualquier estrategia posterior necesita — saber qué historia existe, qué partes se pueden mover como unidad, cuánto pesa y cómo comprobar que nada cambió.
**Etapa 2 (diferida):** archivo por años (alternativa B) **con hidratación transparente**: el estado en memoria sigue siendo completo y los ~230 lectores no cambian; solo se parte el almacenamiento. No pierde información. La poda destructiva (propuesta original) queda como último recurso y solo con un resumen mucho más completo.

## 5. Disparador para pasar a la etapa 2
Se plantea la etapa 2 cuando ocurra **cualquiera**: (a) el payload comprimido supera ~500 KB (`Cierre.disparador`, también visible en Configuración), o (b) hay datos de ≥ 2 años **y** las listas se sienten lentas (lo primero lo avisa la app; lo segundo no se puede medir desde el código). Nunca automático por reloj.

## 6. Arquitectura de la etapa 1
- **`js/core/huella.js` — huella de invariantes.** Registro de *sondas*: funciones puras `estado → objeto plano` que miden lo que debe **sobrevivir** (nunca cuántos registros hay). Núcleo: `saldos` (libro cuadra, saldo guardado vs suma), `periodos` (ingresos/gastos/categorías de cada mes), `deudas`, `patrimonio`. Módulos (se registran al cargarse): `tarjetas`, `encargos`, `alcancia`, `wrapped` (por año). `SONDAS_BASE` es la lista canónica: `Huella.completa()` carga los módulos diferidos y **exige las ocho**; una sonda ausente o que lanza excepción es un error y la comparación **no** es ok. Convención de entidades: `entidades:{id:{saldo,…}}`.
- **`conEstadoAislado(estado, fn)` (`core-state.js`).** Corre `fn` síncrona con la copia como `S` y lo restaura siempre; mientras dura, `save()` y `_fbSaveToCloud()` no escriben. Así las sondas usan las funciones reales de la app (que leen el `S` global) sin duplicar ninguna regla contable.
- **`Huella.verificarTransformacion(estado, fn)`.** Clona, calcula, aplica `fn` al clon (aislado), calcula y compara. Es el contrato de verificación de cualquier cambio de almacenamiento: cierre, archivo por año, importar un backup, una migración.
- **`js/core/cierre.js` — vista previa de solo lectura (`Cierre.analizar(corte)`).**
  - *Fuentes*: dónde guarda `S` cada registro con fecha (`registrarFuente`). `CLASIFICACION` clasifica **toda** clave de primer nivel de `S`; una prueba falla si aparece una sin clasificar o si una con historia no tiene fuente.
  - *Grafo de enlaces por valor*: dos registros están enlazados si uno contiene el id del otro en cualquier campo (hasta 4 niveles). Las componentes conexas son la **unidad atómica**: transferencias con una pata a cada lado del corte, reversiones partidas, pagos divididos y las copias de la alcancía se mueven completas o ninguna. Un campo de enlace nuevo no requiere cambios.
  - *Entidades*: tarjeta, encargo, deuda o alcancía se cierran solo con saldo 0 (lo dice la sonda: una sola fuente) y toda su historia ≤ corte. Entidades sin sonda (Spotify, mesada, ingresos fijos, CDTs) **no se cierran**: se encienden al registrar su sonda.
  - *Informe*: total, candidatos (≤ corte), archivables (unidades completas), bloqueados por motivo (`sin-fecha`, `entidad-abierta:*`, `enlazado-con-registro-bloqueado-o-posterior`), entidades y la **huella de antes** (`digest`) para compararla después. `completo:false` si falta alguna sonda.
  - `corteMasReciente()` da el último mes completo con ≥ 24 meses (política); `analizar` acepta cualquier mes terminado para poder explorar y probar.
- **Medidor** (`Cierre.tamano`, `Cierre.disparador`): bruto por clave, comprimido con el mismo códec del guardado (estimado si no hay códec), proyección de cuándo se llegaría al aviso y al límite (confianza baja con < 90 días de historia).
- **Cómo integrar un módulo nuevo con historia:** registrar una sonda (`Huella.registrar`) con lo que debe sobrevivir y, si guarda registros con fecha, una fuente (`Cierre.registrarFuente`); clasificar su clave en `CLASIFICACION`. No se toca nada más.

## 7. Contrato para la etapa 2 (archivo por años)
1. **Partición:** los años cerrados pasan a documentos aparte (almacén frío); el documento vivo conserva el año en curso y lo anterior que siga abierto. Al cargar, se **hidrata** `S` completo.
2. **Unidad:** solo componentes completas de `Cierre.analizar` (archivables); jamás registros sueltos.
3. **Atomicidad:** vivo + archivos nuevos en **una** `runTransaction` (límite de 500 operaciones y 10 MiB; ampliar `firebase-init.js`). Si no se puede garantizar, se detiene sin escribir.
4. **Verificación obligatoria:** `Huella.verificarTransformacion` sobre la copia antes de escribir y de nuevo sobre el estado hidratado leído de vuelta; cualquier diferencia o error de sonda aborta. La prueba de referencia (`partirPorAnio` + `hidratar`, en `tests/huella.test.js`) ya demuestra que la huella valida este tipo de transformación.
5. **Seguridad operativa:** vista previa, **backup JSON descargado antes**, confirmación explícita, **candado propio** (los registros archivados son inmutables, independiente de `diasBloqueo`) y nunca automático por reloj.
6. **Sync entre dispositivos:** `onSnapshot` de los archivos y manejo de dos dispositivos que archiven a la vez (versión en el documento vivo).
7. **Importar/exportar:** el backup JSON sigue siendo el estado completo (hidratado); importar reparte de nuevo.
8. **Puntos abiertos que la etapa 2 debe resolver:** sondas para Spotify, mesada, ingresos fijos y CDTs (hoy no se cierran); cómo colapsar una tarjeta con deuda al corte (el piso en 0 exige que el saldo bruto al corte sea ≥ 0); los ciclos de alcancía destapados duplican sus depósitos (buen primer candidato a ahorro de tamaño).

## 8. Limitaciones conocidas de la etapa 1
- **Spotify y mesada** no tienen sonda propia: su efecto en ingresos/gastos queda cubierto por la sonda `periodos` y sus dominios en `wrapped`, pero no hay verificación de sus saldos pendientes.
- La huella usa tolerancia de 1 centavo para montos y el patrimonio incluye interés de cajitas calculado por días: una comparación que cruce la medianoche podría diferir en pesos.
- `Periodo` y otras funciones lanzan excepción ante registros nulos o con fecha no textual (la validación de carga ya los descarta); la huella lo reporta como error de sonda, no lo oculta.
- No hay `ejecutar`: la etapa 1 no tiene ninguna ruta que modifique datos.

## 9. Pruebas
`tests/huella.test.js` (motor, sondas, comparación, aislamiento, transformaciones, backup restaurado, datos incompletos) y `tests/cierre.test.js` (vista previa, enlaces, entidades, clasificación de claves, tamaño/proyección y el medidor de Configuración), con historia sintética de 2,7 años construida con las funciones reales (`tests/support/datos-sinteticos.js`).
