# Cierre de períodos (historia antigua) — etapa 1 implementada, etapa 2 diferida

Estado (2026-10-30): **etapa 1 implementada y probada** (huella de invariantes, vista previa de solo lectura, medidor de tamaño) y **ajustada tras revisar un análisis externo** (§10). **No se archiva, compacta ni borra nada.** Lo que sigue (etapa 2) se implementa solo cuando se cumpla el disparador de §5 y **está pendiente de aprobación el cambio de estrategia** descrito en §4: de «archivo por años» a «cierre con resumen congelado». La propuesta original literal (una `apertura` por cuenta + `resumenMensual` + borrar) sigue descartada, por las razones de §3 que se mantienen.

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
1. **Wrapped no se puede reproducir con un resumen mensual** (usa el gasto individual más grande con descripción y fecha, la categoría líder por monto y por frecuencia, promedio, conteos, racha, mejor/peor mes y un dominio por módulo). *Matiz (§10):* eso solo importa para el año que la app puede mostrar, que es **únicamente el recién cerrado** (`_wrappedVentana`, año actual − 1). La política de corte (≥ 24 meses, siempre ≤ dic de año − 2) lo deja intacto; la sonda `wrapped` ahora comprueba solo ese año.
2. **Lectores directos del detalle.** `S.gastosVar` se lee en 15 archivos (79 sitios) y `S.movimientos` en 15 (152). *Matiz (§10):* casi todos son altas, bajas y búsquedas por id sobre registros vivos (y los antiguos son inmutables), no agregados históricos. Los agregados por mes pasan por `Periodo`; las listas de meses viejos (pantalla Gastos, historial de pagos fijos en Configuración) mostrarían menos filas y necesitarían mostrar el resumen. Se poda solo por componentes completas, así que ningún registro queda apuntando a otro que ya no existe.
3. **Cada módulo deriva distinto.** Libro: aditivo. Tarjetas: saldo inicial + compras + cargos − pagos con borrado lógico (`eliminado`) y **piso en 0**. Encargos: bolsa propia (`enc.movimientos`), saldo siempre derivado. Alcancía: saldo guardado + copia ofuscada, y al destapar un ciclo sus depósitos se **copian** a `historial[].movimientos`; al iniciar el siguiente, `a.movimientos` se vacía, así que después esa copia es el único registro de esos depósitos (la pantalla del historial la lee para el desglose). Una regla central única de compactación no puede respetar todo eso.
4. **La protección por antigüedad no basta como candado.** `diasBloqueo` es configurable por el usuario; «≥ 2 años = inmutable» no está garantizado. Un cierre debe imponer su propio candado.
5. **El guardado actual es atómico por construcción** (un solo `setDoc` del estado completo). Repartir en varios documentos solo conserva la atomicidad con `runTransaction` (expuesto en `firebase-init.js`; `writeBatch`, `collection` y `getDocs` no lo están).
6. Una `reversion` del libro lleva la fecha de cuando se deshizo, no la del original: el corte puede partir el par. Y los registros se enlazan con ~25 campos distintos (`_encMovId`, `_transfId`, `_tcCompraId`, `origen.ref`…).

## 4. Decisión (revisada el 2026-10-30; pendiente de aprobación)
**Hecho (etapa 1, sin riesgo):** huella, vista previa, medidor y los ajustes de §10.
**Recomendación para la etapa 2: «cierre con resumen congelado» en lugar de «archivo por años».** Un solo documento, una sola operación, sin varios documentos ni `runTransaction` ni sync entre dispositivos; ahorro medido similar (~57 % sobre datos sintéticos de 5 años). Pasos, **todos juntos en una sola operación de cierre** (no por fases sueltas, ver abajo):
1. **Resumen congelado:** `S.resumenMeses[AAAA-MM]` = la salida de la sonda `periodos` de cada mes a cerrar (se calcula antes de borrar).
2. **`Periodo` lee ese resumen** cuando el mes no tiene detalle (hoy sin resumen se comporta exactamente igual). Es el único punto de entrada de los agregados mensuales (Inicio, Análisis, Salud, Proyección, cierre de mes).
3. **Poda solo de componentes completas** archivables según `Cierre.analizar` y entidades con saldo 0; lo bloqueado se conserva.
4. **Libro por componente, no por cuenta:** se pliegan en una entrada `cierre` por cuenta *únicamente las patas del libro de las componentes podadas*. Si se plegara todo lo anterior al corte por cuenta (la «Fase 1» de un análisis externo), el historial de la cuenta seguiría mostrando las filas de módulo aún no podadas **más** una fila «Saldo anterior» que ya las incluye: se contaría doble, y después no se podría reconstruir cuánto de ese saldo corresponde a lo que luego se pode. Por eso el libro y el detalle se cierran juntos. Tipo propio `cierre` (no `apertura`: ese ya significa «saldo inicial de una cuenta» y tiene fila gemela en `S.movimientos`), visible en `Libro.entradasVisibles` como «Saldo anterior».
5. **Mostrar el resumen** donde hoy hay una lista de un mes cerrado (Gastos, historial de pagos fijos).
6. Verificación: `Huella.verificarTransformacion` sobre la copia antes de escribir (la sonda `periodos` compara el cálculo desde el detalle contra el resumen: no es tautológica) y otra vez sobre lo leído de vuelta; backup JSON descargado, vista previa, confirmación y candado propio de inmutabilidad.

El archivo por años en varios documentos queda como **último recurso** (fase 3), solo si el tamaño vuelve a ser un problema sobre un estado ya recortado. El precio de esta estrategia: **el detalle viejo sale de la nube**; el backup JSON es el archivo de esa historia.

**Política de corte:** `Cierre.corteMasReciente()` = último mes completo con ≥ 24 meses de antigüedad. Es exacta (se prueba en ~2.600 fechas) y por construcción nunca llega al año anterior al actual. *(La regla «≤ 31-dic de año − 2» tomada literal da solo 12–22 meses, no cumple los 24; la de 24 meses ya la implica.)*

## 5. Disparadores (dos problemas distintos)
- **Tamaño** → cierre (§4): se plantea cuando el payload comprimido supera ~500 KB (`Cierre.disparador`, visible en Configuración). Nunca automático por reloj.
- **Lentitud de las listas** (no medible desde el código; aviso cuando hay datos de ≥ 2 años) → se arregla **paginando o cargando bajo demanda**, no cerrando períodos: el estado completo sigue en memoria.

## 6. Arquitectura de la etapa 1
- **`js/core/huella.js` — huella de invariantes.** Registro de *sondas*: funciones puras `estado → objeto plano` que miden lo que debe **sobrevivir** (nunca cuántos registros hay). Núcleo: `saldos` (libro cuadra, saldo guardado vs suma), `periodos` (ingresos/gastos/categorías de cada mes), `deudas`, `patrimonio`. Módulos (se registran al cargarse): `tarjetas`, `encargos`, `alcancia`, `wrapped` (solo el año objetivo, año actual − 1). `SONDAS_BASE` es la lista canónica: `Huella.completa()` carga los módulos diferidos y **exige las ocho**; una sonda ausente o que lanza excepción es un error y la comparación **no** es ok. Convención de entidades: `entidades:{id:{saldo,…}}`.
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

## 7. Contrato para el archivo por años (fase 3, solo si hiciera falta)
1. **Partición:** los años cerrados pasan a documentos aparte (almacén frío); el documento vivo conserva el año en curso y lo anterior que siga abierto. Al cargar, se **hidrata** `S` completo.
2. **Unidad:** solo componentes completas de `Cierre.analizar` (archivables); jamás registros sueltos.
3. **Atomicidad:** vivo + archivos nuevos en **una** `runTransaction` (límite de 500 operaciones y 10 MiB; ampliar `firebase-init.js`). Si no se puede garantizar, se detiene sin escribir.
4. **Verificación obligatoria:** `Huella.verificarTransformacion` sobre la copia antes de escribir y de nuevo sobre el estado hidratado leído de vuelta; cualquier diferencia o error de sonda aborta. La prueba de referencia (`partirPorAnio` + `hidratar`, en `tests/huella.test.js`) ya demuestra que la huella valida este tipo de transformación.
5. **Seguridad operativa:** vista previa, **backup JSON descargado antes**, confirmación explícita, **candado propio** (los registros archivados son inmutables, independiente de `diasBloqueo`) y nunca automático por reloj.
6. **Sync entre dispositivos:** `onSnapshot` de los archivos y manejo de dos dispositivos que archiven a la vez (versión en el documento vivo).
7. **Importar/exportar:** el backup JSON sigue siendo el estado completo (hidratado); importar reparte de nuevo.
8. **Puntos abiertos que la etapa 2 debe resolver:** sondas para Spotify, mesada, ingresos fijos y CDTs (hoy no se cierran); cómo colapsar una tarjeta con deuda al corte (el piso en 0 exige que el saldo bruto al corte sea ≥ 0); la alcancía NO es un candidato a ahorro de tamaño: la «copia» de depósitos de un ciclo destapado solo está duplicada entre destapar e iniciar el siguiente; después es el único registro y quitarla borraría el desglose del historial (verificado en `alcancia.js`, `alcanciaIniciarNueva` y la pantalla del historial).

## 8. Limitaciones conocidas de la etapa 1
- **Spotify y mesada** no tienen sonda propia: su efecto en ingresos/gastos queda cubierto por la sonda `periodos` y sus dominios en `wrapped`, pero no hay verificación de sus saldos pendientes.
- La huella usa tolerancia de 1 centavo para montos y el patrimonio incluye interés de cajitas calculado por días: una comparación que cruce la medianoche podría diferir en pesos.
- La sonda `wrapped` solo cubre el año objetivo; sigue obligando a cargar el grupo `wrapped` (~217 KB) al verificar, aceptable porque el cierre es una operación manual y rara.
- Los pagos de gastos fijos (`S.pagosGastosFijos`) y su gasto neutro en `gastosVar` no están enlazados por id (el gasto lleva `gastoFijoId`, que es de la plantilla, no del pago): el grafo puede podar uno sin el otro. Es inocuo para los totales (el pago es lo que cuenta, el gasto es `neutro`) pero hay que tenerlo presente al mostrar el historial de fijos.
- `Periodo` y otras funciones lanzan excepción ante registros nulos o con fecha no textual (la validación de carga ya los descarta); la huella lo reporta como error de sonda, no lo oculta.
- No hay `ejecutar`: la etapa 1 no tiene ninguna ruta que modifique datos.

## 9. Pruebas
`tests/huella.test.js` (motor, sondas, comparación, aislamiento, transformaciones, backup restaurado, datos incompletos) y `tests/cierre.test.js` (vista previa, enlaces, entidades, clasificación de claves, tamaño/proyección y el medidor de Configuración), con historia sintética de 2,7 años construida con las funciones reales (`tests/support/datos-sinteticos.js`).

## 10. Evaluación de un análisis externo de la etapa 1 (2026-10-30)
Se verificó cada afirmación contra el código y con mediciones propias (mismo generador sintético; las cifras absolutas no predicen tu tamaño real).

**Correcto y adoptado:**
- Wrapped solo muestra el año recién cerrado (`_wrappedVentana`): la sonda `wrapped` pasa a cubrir solo ese año, tomando `_wrappedAnioObjetivo` como única fuente. El corte de política nunca lo toca (prueba: Wrapped idéntico al podar hasta el corte; detectado si el corte llega a 2025).
- El libro pesa ~47 % y es derivado con un solo lector externo (`cuentas.js` vía `Libro.entradasVisibles`); cerrarlo deja la huella en 0 diferencias y ahorra ~26,5 % (el análisis decía 27,7 %). Podar el detalle sin resumen falla en `periodos` y `wrapped`, como dijo.
- Los lectores directos de `S.gastosVar`/`S.movimientos` son sobre todo CRUD de registros vivos, no agregados históricos; mi objeción de «~230 sitios» pesaba menos de lo que escribí.
- `maxComponente`: añadido (`componentes`, `advertencias:['componente-grande']`), con prueba de ids de formato real.
- Separar disparadores de tamaño y de lentitud: hecho (§5).

**Incorrecto o incompleto:**
- *«Corte ≤ 31-dic de año − 2 … cumple tus 24 meses»*: falso; da 12–22 meses. La regla de 24 meses ya implica la de Wrapped.
- *«Dos registros que comparten un texto de 6+ caracteres se fusionan»*: no; solo enlaza un campo cuyo valor es exactamente el id de otro registro (prueba con 300 gastos de igual descripción: 300 unidades).
- *Fase 1 «cerrar el libro» como paso independiente*: es una trampa de secuencia (ver §4.4). Debe hacerse por componente y junto con la poda.
- *«La rama `apertura` de `cuentas.js` está sin uso»*: la rama es inalcanzable desde `entradasVisibles`, pero `apertura` ya se escribe para el saldo inicial de cuentas personalizadas, con fila gemela en `S.movimientos`; reutilizarla duplicaría filas. Se usa un tipo nuevo.
- *«Empezar ahora»*: con la política de 24 meses no hay nada que cerrar hasta octubre de 2028, y a 5 movimientos/día el límite está a ~13 años (~18 con el libro cerrado). Lo que sí se puede y conviene hacer ahora ya está hecho: correcciones de la etapa 1.
- *«Nadie usa la app»*: **sí consta** en el CHANGELOG (2026-10-18: «no hay usuarios ni backups que conservar») y los datos de un esquema anterior al 9 se rechazan (`_esquemaAnterior`: «empieza de cero»). Lo que no se sabe es si desde entonces se han cargado datos propios; la vista previa (`Cierre.analizarCompleto`) se puede correr sobre ellos para comprobar los ids reales. *(Una versión anterior de este documento decía «no consta»: era un error.)*

**Error propio encontrado al verificar:** `corteMasReciente` desbordaba el día con `Date.setMonth` (el 29–30 de marzo daba un mes de más). Corregido con aritmética exacta y una prueba sobre ~2.600 fechas.

## 11. Wrapped guardado por el usuario (implementado, 2026-10-31)
Detalle completo y reglas en `docs/wrapped.md` §7quaterdecies. Lo que importa para el cierre:
- `S.wrappedAnios[AAAA]` (HTML congelado, ≈ 4,5 KB comprimidos por año) es un resultado que el usuario eligió guardar (botón «Guardar este Wrapped») y que **no se puede recalcular** tras podar el detalle: clase `congelada` en `CLASIFICACION`.
- **El cierre solo avisa, no bloquea:** `Cierre.analizar` informa `wrapped.conWrapped` (años tocados que habrían tenido Wrapped, es decir con datos suficientes) y `wrapped.sinGuardar` (los que no están guardados), con la advertencia `wrapped-sin-guardar`. Un año sin datos suficientes no avisa. No hace falta que el cierre genere nada.
- Guardar es opcional por diseño (modelo Spotify): lo que no se guarda en enero se pierde, y podar el detalle de ese año no cambia eso.
- **Contrato de CSS** del HTML guardado, vigilado por `tests/fixtures/wrapped-clases.json` (solo aditivo).
- **Qué no es posible hoy:** ver el Wrapped de 2024 o 2025. La app nació limpia el 2026-10-18 y los datos de esquemas anteriores se rechazan: el primer Wrapped real es el de 2026 (enero de 2027), y con poco uso será el mensaje «no alcanzó el tiempo». Para años anteriores haría falta un importador de datos antiguos, que no existe.
