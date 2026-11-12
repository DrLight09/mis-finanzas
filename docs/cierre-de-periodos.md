# Cierre de períodos — documento maestro (etapa 1 hecha; etapa 2 sin empezar)

**Estado: 2026-10-31 (actualizado tras pasar la huella y el cierre a carga bajo demanda).** Este es el **único documento vigente** sobre el cierre de períodos: reemplaza a todas las versiones anteriores de este archivo y al análisis externo (`analisis-cierre-etapa1*.md`). Si ves otro que diga que la etapa 2 es «archivo por años», que `S.wrappedAnios` lleva un campo `estado`, que el cierre *bloquea* por falta de Wrapped guardado o que se puede «quitar la copia duplicada» de la alcancía, **es viejo o está equivocado**.

## 0. Lee esto primero (para quien retome la etapa 2)

1. **Hecho y probado (etapa 1):** huella de invariantes (`js/core/huella.js`), vista previa de solo lectura y medidor de tamaño (`js/core/cierre.js`), `conEstadoAislado` y `registrarSonda` (`js/core/persistencia.js`), tarjeta «Tamaño de tus datos» en Configuración. **No existe ninguna ruta que modifique, archive o borre historia.** `huella.js` y `cierre.js` **no se cargan al arrancar**: son el grupo `cierre` del Loader, solo bajo demanda (al abrir Configuración). Desde la consola: `await Loader.ensure('cierre')` antes de usar `Huella` o `Cierre`.
2. **Hecho aparte, relacionado:** Wrapped guardado por el usuario (`docs/wrapped.md` §7quaterdecies), mensaje «no alcanzó el tiempo», y el guardado en la nube sin clon redundante.
3. **Etapa 2 = «cierre con resumen congelado»**, en **una sola operación sobre un solo documento** (§5). **No** es archivo por años en varios documentos (eso es la fase D, último recurso, §6).
4. **Cuándo:** cuando el medidor avise que el payload comprimido pasó de ~500 KB. No por fecha. Con la regla de 24 meses no hay nada que cerrar antes de octubre de 2028 (la app nació limpia el 2026-10-18).
5. **El precio, que el usuario aceptó:** el detalle viejo **sale de la nube**; el backup JSON descargado antes es el único archivo de esa historia. Por eso el backup es un paso obligatorio del flujo.
6. **Antes de escribir código:** corre las pruebas (§9) para confirmar que el estado del repo es el que describe este documento, y relee §4 (hallazgos) y §8 (errores ya cometidos).
7. **Principio de trabajo del usuario:** si un módulo limita lo que se quiere hacer, se modifica el módulo (la página debe verse y funcionar igual de cara al usuario). Cambios quirúrgicos, sin código muerto, sin estilos inline (clases en `css/styles.css`), texto de la app en tuteo.

## 1. Estado del código

| Qué | Dónde | Notas |
|---|---|---|
| Huella de invariantes | `js/core/huella.js` (bajo demanda) | Registro de sondas puras; `SONDAS_BASE` = `saldos, periodos, deudas, patrimonio, tarjetas, encargos, alcancia, wrapped`; `Huella.completa()` carga los 4 grupos diferidos **por nombre** (`GRUPOS_CON_SONDA`; `Loader.ensureAll()` se salta `wrapped` fuera de enero). API: `registrar, registradas, calcular, comparar, verificarTransformacion, completa, digest`. |
| Estado aislado | `conEstadoAislado(estado, fn)` en `js/core/persistencia.js` | `fn` síncrona; mientras corre, `save()` y `_fbSaveToCloud()` no escriben (`window._estadoAislado`). |
| Vista previa y medidor | `js/core/cierre.js` | `analizar(corte, estado, {huella, mesActual})`, `analizarCompleto`, `tamano`, `disparador`, `corteMasReciente`, `registrarFuente`, `CLASIFICACION`. |
| Sondas de módulos | `tarjetas_credito.js` (`tcDeudaCalculada`, pura), `encargos.js`, `alcancia.js`, `wrapped.js` | Se registran con **`registrarSonda(nombre, fn)`** (`js/core/persistencia.js`), nunca con `Huella.registrar` directo: los módulos se precargan al arrancar y `huella.js` llega después, así que la sonda espera en cola (`window._sondasPendientes`) y `huella.js` la vacía al cargarse. |
| Carga bajo demanda | `js/core/lazy-loader.js` | Grupo `cierre: ['js/core/huella.js','js/core/cierre.js']`, en `SOLO_BAJO_DEMANDA`: `ensureAll()` (que precarga **todos** los demás grupos en tiempo ocioso tras `appDataLoaded`) **no** lo carga. `renderTamanoDatos` hace `await Loader.ensure('cierre')`; si la descarga falla (sin conexión) el medidor queda vacío y la pantalla no se rompe. |
| Wrapped | `js/core/wrapped-gate.js` (criterio `_wrappedDatosAnio`, `_wrappedAbrir`), `js/modules/wrapped.js` | `S.wrappedAnios[AAAA] = { version, generadoEn, slides }` (sin `estado`). |
| Medidor y «Mis Wrapped» | `js/modules/configuracion.js` (`renderTamanoDatos`, `renderMisWrapped`, `eliminarWrapped`) | Clases `cfg-tamano*` y `cfg-wrapped*` en `css/styles.css`. |
| Datos sintéticos | `tests/support/datos-sinteticos.js` | `cargarApp(extra)`, `generar(ctx, {desde, dias, semilla})`, `HOY = '2026-10-30'`. Usa las funciones **reales** de la app. |
| Pruebas | `tests/cierre-wrapped.test.js`, `tests/cierre-wrapped.test.js`, `tests/cierre-wrapped.test.js`, `tests/fixtures/wrapped-clases.json` | Más `scripts/smoke-wrapped.js` y `scripts/smoke-cierre.js` (jsdom). |
| Versión | `sw.js` → `mis-finanzas-v84` | Esquema de datos 9; la app no tiene migraciones. |

`Cierre.analizar` devuelve: `corte, fechaCorte, completo, huella (digest), erroresHuella, advertencias, wrapped:{conWrapped, sinGuardar}, componentes:{total, maxRegistros, mayores}, total/candidatos/archivables:{registros, bytes, unidades}, bloqueados:{registros, porMotivo, detalle}, porFuente, entidades`. Motivos de bloqueo: `sin-fecha`, `entidad-abierta:{saldo-pendiente|registros-posteriores|sin-sonda}`, `enlazado-con-registro-bloqueado-o-posterior`. Advertencias: `componente-grande`, `wrapped-sin-guardar`.

## 2. Decisiones vigentes

1. La etapa 1 se conserva tal cual (huella, vista previa, medidor).
2. Etapa 2 = cierre con resumen congelado, **una operación, un documento**. Archivo por años = último recurso.
3. El Wrapped lo guarda el usuario con un botón; sin guardar se pierde al cerrar enero (modelo Spotify). **El cierre solo avisa** si falta el de un año con datos suficientes; no bloquea ni genera nada.
4. La política de corte es `Cierre.corteMasReciente()`: último mes completo con ≥ 24 meses de antigüedad (exacta, probada sobre ~2.600 fechas; por construcción nunca llega al año anterior al actual).
5. Todo cierre es manual, con vista previa, backup JSON descargado, confirmación y PIN. Nunca automático por reloj.
6. Los cambios a módulos para mejorar la app son bienvenidos si la huella y las pruebas siguen pasando y la página se ve y funciona igual.

## 3. Cuándo hacer la etapa 2

- **Tamaño:** payload comprimido > ~500 KB (`Cierre.disparador`; la tarjeta de Configuración lo avisa con «Tus datos ya pesan bastante; es momento de revisar el cierre de períodos»: es solo un aviso, la función de cerrar aún no existe). Medido con datos **sintéticos** (~5 movimientos/día): 2 años ≈ 134–152 KB, 5 años ≈ 327–377 KB, 9 años ≈ 675 KB; el límite de Firestore es 1 MiB y el aviso de la app 800 KB. Solo se supera con ~15 movimientos/día durante 5 años. Las cifras reales las da el medidor.
- **Lentitud de las listas** es **otro problema** con otro remedio: paginar o cargar bajo demanda. Cerrar períodos no la arregla mientras el estado completo siga en memoria.
- **Antes de octubre de 2028 no hay nada que cerrar** (regla de 24 meses). Hacerlo antes solo tendría sentido para explorar.

## 4. Hallazgos verificados que condicionan el diseño

1. **Wrapped solo muestra el año recién cerrado** (año actual − 1) y solo en enero (`_wrappedVentana`; `?wrappedForzar=1` abre la ventana pero el año sigue siendo año − 1). Nada más consume los cálculos de Wrapped. El corte de política nunca lo toca. La sonda `wrapped` de la huella solo cubre ese año (`_wrappedAnioObjetivo`).
2. **La sonda `periodos` ya es el resumen mensual** necesario: por mes `mesada, fijos, spotify, entradas, ingresos, gvTotal, gfTotal, gastos, balance, porCategoria`. Se congela antes de podar. Podar sin resumen falla la huella en `periodos` y `wrapped`.
3. **`Periodo` es un punto de entrada estrecho para agregados mensuales.** API pública (`js/core/periodo.js`): `cuotaMesada, mesDesplazado, mesAnterior, ultimosMeses, mesadaDelMes, ingresosFijosDelMes, ingresosFijosEntradas, spotifyEntradas, spotifyDelMes, ingresosDelMes, ingresosPorMes, ingresoPromedioPrevio, mesadaEntradas, pagosFijos, retirosManuales, rendimientosDelMes, gastosFijosDelMes, gastosVarRealesDelMes, gastosDelMes, gastosPorMes, gastoPromedioPrevio, gastoPorCategoria, balanceDelMes`. Consumidores de agregados: `inicio.js`, `analisis.js`, `cuentas.js`, `el núcleo` (~l.1538), `firebase-sync.js` (~l.620). Las funciones que devuelven **listas** de registros de un mes (`gastosVarRealesDelMes, pagosFijos, retirosManuales, gastosFijosDelMes`) quedarían vacías para meses cerrados; sus consumidores de pantalla son Gastos y el historial de pagos fijos de Configuración (~l.311).
4. **Los lectores directos de `S.gastosVar`/`S.movimientos` son sobre todo altas, bajas y búsquedas por id** sobre registros vivos (15 archivos cada uno); los antiguos son inmutables por la protección por antigüedad. Aun así, **ninguna pantalla se probó con un hueco**: es un punto abierto (§7).
5. **Peso (sintético, 5 años):** `libro` 47 %, `gastosVar` 26 %, `movimientos` 17 %, `transferencias` 8 %. Cerrar solo el libro (una entrada por cuenta) deja la huella en 0 diferencias y ahorra ~26–28 %; con poda del detalle y resumen, ~57 %.
6. **El libro lo lee desde fuera solo `cuentas.js`** (`Libro.entradasVisibles`, ~l.602). **No se puede cerrar el libro suelto:** el historial de cada cuenta junta filas de los módulos con las del libro; plegar todo lo anterior al corte en «Saldo anterior» con el detalle aún presente **cuenta doble**, y después no se puede saber qué parte corresponde a lo podado. Hay que plegar **por componente podada y junto con la poda**.
7. **`apertura` ya significa «saldo inicial»** de una cuenta personalizada, con fila gemela en `S.movimientos`; reutilizarla duplicaría filas. El cierre necesita un tipo propio, `cierre`. (La rama de `cuentas.js` para `apertura` es hoy inalcanzable desde `entradasVisibles`.)
8. **Grafo de enlaces por valor:** dos registros se enlazan solo si un campo (hasta 4 niveles) vale **exactamente** el id de otro registro (≥ 6 caracteres). Compartir un texto largo no enlaza. Los ids de `uid()` miden ~11 caracteres. Las componentes conexas son la unidad atómica. Diagnóstico: `componentes.maxRegistros` (normal 1–10; > 100 = `componente-grande`).
9. **Entidades:** una tarjeta, encargo, deuda o la alcancía se cierran solo con saldo 0 (de la sonda) y toda su historia ≤ corte. Sin sonda (Spotify, mesada, ingresos fijos, CDT) **no se cierran**. Una entidad activa con historia posterior retiene toda su historia (conservador; medirlo con uso real).
10. **Guardado atómico por construcción:** un solo `setDoc` del estado completo, comprimido (`codificarPayload`). Una operación de cierre sobre un solo documento hereda esa atomicidad; por eso se prefiere a repartir en varios documentos (que exigiría `runTransaction`).
11. **Candado:** `nivelAntiguedadMovimiento(fecha, ops, modulo)` (`js/core/dialogos.js`, ~l.1347) devuelve `'bloqueado'` pasados `S.config.proteccionAntiguedad.diasBloqueo` (365 por defecto, **configurable por el usuario**). No sirve como candado del cierre.
12. **Alcancía:** al destapar, los depósitos se copian a `historial[].movimientos`; al iniciar el siguiente ciclo `a.movimientos` se vacía. Después esa copia es el **único** registro y la pantalla del historial la lee. No hay copia duplicada que quitar.
13. **Una `reversion` del libro lleva la fecha de cuando se deshizo**, no la del original: el corte puede partir el par. Resuelto por el grafo (el par queda en una unidad).
14. **Pagos de gastos fijos y su gasto neutro** (`S.pagosGastosFijos` ↔ `gastosVar` con `gastoFijoId`) **no están enlazados por id**; el grafo puede podar uno sin el otro. Inocuo para totales (el pago es lo que cuenta; el gasto es `neutro`), pero hay que cubrirlo con una prueba y al mostrar el historial de fijos.
15. **Costo de guardar:** una medición previa dio ~68 ms por guardado completo (serializar, comprimir, base64) a 5 años sintéticos en Node; quitar el clon redundante de `firebase-sync.js` ahorra ~30 ms de eso (medido solo ese paso: 39 → 9 ms). En celular será varias veces más y crece lineal con el tamaño; no se midió en celular.

## 5. Especificación de la etapa 2 (cierre con resumen congelado)

### 5.1 Principios
Una sola operación; un solo documento; manual; verificada antes de escribir y después de leer de vuelta; si algo no se puede garantizar, **se detiene sin modificar nada** y explica el motivo. Repetirla o interrumpirla no puede duplicar ni dejar estados parciales.

### 5.2 Datos
- `S.resumenMeses['AAAA-MM'] = { mesada, fijos, spotify, entradas, ingresos, gvTotal, gfTotal, gastos, balance, porCategoria }` = salida de la sonda `periodos` de cada mes a cerrar, **calculada antes de borrar** y sobre el estado completo.
- `S.cierre = { corte: 'AAAA-MM', ejecutadoEn }` (corte más reciente ya cerrado; sirve de candado, §5.7).
- Clasificar ambas claves en `Cierre.CLASIFICACION` (`congelada` la primera, `meta` o `configuracion` la segunda); añadirlas a la validación de importación (`_validarEstructuraJSON`, configuracion.js: lista de claves que deben ser objeto). La carga y la importación **no** descartan claves desconocidas, así que no hace falta tocar `S` por defecto ni subir el esquema: son claves opcionales. Una prueba (`clasificación`) falla si se olvida clasificarlas.
- No se podan: `resumenMeses`, `wrappedAnios`, `patrimonioHistorial`, rendimientos y CDT, entidades abiertas, nada de lo bloqueado por `Cierre.analizar`.

### 5.3 `Periodo` lee el resumen
Cuando un mes tiene entrada en `S.resumenMeses`, las funciones de agregado mensual (`ingresosPorMes, gastosPorMes, gastoPorCategoria, balanceDelMes, ingresosDelMes, gastosDelMes, ingresoPromedioPrevio, gastoPromedioPrevio` y las derivadas) devuelven los valores del resumen en lugar de recalcular desde el detalle. Sin resumen se comportan **exactamente igual que hoy** (regla de oro: el cambio es no-op hasta que exista un resumen; probarlo). Las funciones de **listas** devuelven lo que quede. `ultimosMeses` y las claves de mes no cambian. Como el resumen se calculó con el detalle completo del mes (incluidos los registros que se conservan), sirve para el mes entero.

### 5.4 Poda por componentes
Solo las componentes marcadas **archivables** por `Cierre.analizar(corte)` (todas sus piezas con fecha ≤ corte, ninguna en entidad abierta, sin `sin-fecha`) y las entidades con saldo 0. Fuentes: `libro, movimientos, gastosVar, transferencias, pagosGastosFijos, tcMovimientos, tarjetas, deudas, encargos, alcancia (ciclos), ingresosExtra, chequeosNu, historialTasasNu`. Los bloqueados se conservan.

### 5.5 Libro: plegar por componente
Para cada cuenta, las patas del libro **de las componentes podadas** se sustituyen por **una** entrada `tipo: 'cierre'` (`origen: { modulo: 'cierre' }`) con su suma. `Libro.verificar` debe seguir cuadrando (guardado = suma). `Libro.entradasVisibles` la muestra como «Saldo anterior» (y la rama de `cuentas.js` para ese tipo debe renderizarla); `rendimiento`, `ajuste` y `cdt` no se pliegan (crecen poco). La suma plegada no depende de pares partidos, pero sí de que se pliegue **solo** lo podado.

### 5.6 Pantallas con meses sin detalle
Gastos (filtro y lista por mes) y el historial de pagos fijos de Configuración deben mostrar el resumen del mes cerrado en lugar de una lista vacía. Revisar además: búsqueda global, actividad reciente, Prestado, Encargos, Plata comprometida (leen muchas listas). **Probar en jsdom y a mano** (esto no se ha probado).

### 5.7 Candado propio
Ningún registro con fecha ≤ `S.cierre.corte` (conservado o no) puede editarse ni eliminarse: si no, el resumen de su mes quedaría desactualizado. Integrar en `nivelAntiguedadMovimiento` (devolver `'bloqueado'` si `fecha ≤ fin de S.cierre.corte`, sin importar `diasBloqueo`) o en un punto único equivalente; cubrir con pruebas todos los módulos que editan/borran movimientos.

### 5.8 Flujo de usuario (Configuración → «Cerrar períodos antiguos»)
1. Medidor y disparador visibles (la tarjeta actual no ofrece ninguna acción: la etapa 2 debe añadir aquí el botón de «Cerrar períodos antiguos»); el corte propuesto es `Cierre.corteMasReciente()` (no se puede elegir uno posterior).
2. **Vista previa** (`Cierre.analizarCompleto`): registros y KB a podar, ahorro estimado, bloqueados por motivo, advertencias (`componente-grande` detiene hasta investigar; `wrapped-sin-guardar` solo informa y ofrece guardar antes), entidades.
3. **Backup JSON obligatorio** (`exportarJSON`, configuracion.js, descarga `mis-finanzas-backup-FECHA.json`). El navegador no confirma la descarga: pedir confirmación explícita («Ya lo descargué»).
4. Confirmación + **PIN** (`pedirPinAntesDe`).
5. Ejecutar (§5.9), mostrar resultado (antes/después de KB, saldos iguales) y dejar constancia (`S.cierre`).

### 5.9 Ejecución y verificación
1. Clonar el estado; construir `resumenMeses` de los meses ≤ corte sobre el clon completo.
2. Aplicar la transformación (poda + plegado del libro + `S.cierre`) **al clon**, dentro de `conEstadoAislado`.
3. `Huella.verificarTransformacion` con `SONDAS_BASE` requeridas: la sonda `periodos` compara el cálculo desde el detalle (antes, sin resumen) con el resumen (después): **no es tautológica**. Cualquier diferencia o error de sonda aborta **sin escribir**.
4. Escribir **una sola vez** (el `save()` normal: un `setDoc`).
5. Releer lo escrito (`_fbLoadData`) y volver a verificar contra la huella de antes; si falla, avisar y conservar el backup.
6. Idempotencia: ejecutar dos veces seguidas no cambia nada la segunda.

### 5.10 Pruebas que deben existir (con datos sintéticos; no tocar datos reales)
Invariantes antes = después: saldo de cada cuenta y cajita; `Libro.verificar().ok`; deuda de cada tarjeta, persona y encargo; patrimonio; `Periodo` de **todos** los meses (los cerrados contra el resumen); Wrapped del año objetivo. Casos: transferencia con una pata a cada lado del corte; `reversion` partida; préstamo abierto que cruza el corte (no se toca); tarjeta con deuda al corte; entidad sin sonda (no se cierra); pago fijo ↔ gasto neutro (§4.14); `componente-grande`; `Periodo` sin resumen idéntico a hoy; backup anterior al cierre importable; editar/eliminar un registro ≤ corte rechazado; operaciones posteriores (nuevo gasto, reversión de uno posterior) siguen funcionando; interrupción (fallo de verificación → nada escrito); repetir la operación; datos incompletos; pantallas con meses cerrados (jsdom, como `scripts/smoke-wrapped.js`).

### 5.11 Documentación a actualizar al terminar
`docs/libro-de-movimientos.md` (tipo `cierre`), `docs/proteccion-antiguedad-movimientos.md` (candado), `docs/configuracion.md`, `docs/wrapped.md` si cambia algo, `docs/arquitectura-archivos.md`, `docs/CHANGELOG.md`, `tests/README.md`, `mapa-codigo.md` (`node scripts/generar-mapa.js`), y subir `sw.js`.

## 6. Descartado, y por qué

| Idea | Por qué no |
|---|---|
| Compactación literal (una `apertura` por cuenta + `resumenMensual` + borrar) | `apertura` ya tiene otro significado; el resumen original no bastaba; dejaba lectores sin datos. La versión actual (§5) corrige las tres cosas. |
| Cerrar el libro suelto como «fase 1» | Cuenta doble en el historial (§4.6). |
| Archivo por años en varios documentos (fase D) | Más maquinaria (varios documentos, `runTransaction` con límites de 500 operaciones y 10 MiB, `firebase-init.js` hoy solo expone `runTransaction` y no `writeBatch/collection/getDocs`, sincronización entre dispositivos, versión por archivo, hidratar, reabrir año). Solo si el tamaño vuelve a ser problema sobre un estado ya recortado. Contrato: unidades = componentes archivables; vivo + archivos en una transacción; `Huella.verificarTransformacion` antes y después; backup, candado propio, nunca automático. El prototipo `partirPorAnio` + `hidratar` en `tests/cierre-wrapped.test.js` ya demuestra que la huella valida ese tipo de transformación. |
| Quitar la «copia duplicada» de la alcancía | No es duplicada (§4.12): borraría el desglose del historial. |
| Regla literal «corte ≤ 31-dic de año − 2» | Da 12–22 meses, no 24; la regla de 24 meses ya la implica. |
| Generar Wrapped fuera de enero / guardado automático / bloquear el cierre por Wrapped | El modelo es el de Spotify (§2.3). |
| Que el cierre genere los Wrapped que falten | Ya no hace falta: solo avisa. |
| Relajar la regla de entidad abierta | Solo valdría para un archivo sin pérdida (fase D). |

## 7. Lo que no se sabe

- El tamaño real de los datos y la mezcla real de listas (solo hay datos sintéticos; con uso real el medidor da la cifra).
- Si alguna pantalla se nota con un hueco tras podar (§5.6). La regla de entidades abiertas debería protegerlas; no se probó en pantalla.
- El costo de guardar en celular (se midió en Node).
- Cuánto retiene en la práctica la regla «una entidad se cierra o se queda completa» con encargos y préstamos muy usados.
- Nada se probó en navegador real con datos reales; solo pruebas en Node y recorridos en jsdom con datos sintéticos.

## 8. Errores ya cometidos (no volver a asumirlos)

1. Cerrar el libro suelto como primera fase (duplica el historial).
2. Dar por buena la regla «≤ 31-dic de año − 2» como equivalente a 24 meses.
3. Creer que dos registros con un texto largo en común se enlazan (solo enlaza la igualdad exacta con un id).
4. `corteMasReciente` con `Date.setMonth` (desbordaba el día: el 29–30 de marzo daba un corte con menos de 24 meses). Ya es aritmética exacta.
5. Reutilizar `apertura` para el cierre; quitar la «copia duplicada» de la alcancía; ver riesgo de privacidad donde no lo había (la diapositiva muestra depósitos del período, no el saldo, y la ofuscación XOR «solo esconde el número del JSON plano»).
6. Suponer que `Loader.ensureAll()` carga `wrapped` (no lo hace fuera de enero).
7. Una edición que borró dos líneas de `renderWrapped`: las pruebas de lógica no ejecutan esa función; la atrapó el recorrido en jsdom. **Toda función que arma pantalla necesita su recorrido en la página real.**
8. Un test del PIN esperaba 520 ms fijos con 10 ms de margen sobre el código y fallaba bajo carga; ya espera la señal real. Si algo es intermitente, repetir la suite en paralelo.
9. Pasar `huella.js` a carga bajo demanda sin más habría **perdido las sondas** de tarjetas, encargos, alcancía y Wrapped (se registran antes de que exista `Huella`); y usar un grupo diferido «a secas» no ahorra nada, porque `ensureAll()` precarga todos los grupos al arrancar salvo los de `SOLO_BAJO_DEMANDA`. Resuelto con `registrarSonda` + cola y con ese conjunto. Un aviso de la app que promete una acción inexistente («archivar») también era un error: ya es neutro.
10. Afirmar «nadie usa la app» sin evidencia: sí consta en el CHANGELOG (2026-10-18: «no hay usuarios ni backups que conservar»), pero no se sabe si desde entonces hay datos propios.

## 9. Cómo verificar el repo

```
npm ci                      # una vez (jsdom)
node --test                 # 648 pruebas, 0 fallos (tarda ~45 s)
npm run smoke               # recorrido de la página real: «TODO OK — sin fallos reales»
npm run smoke:wrapped       # 36 comprobaciones del Wrapped en la página real
npm run smoke:cierre        # carga bajo demanda de huella/cierre en la página real (no al arrancar, sondas en cola, sin conexión)
node scripts/generar-mapa.js --check   # «mapa-codigo.md está al día»
```
Archivos de entrada del cierre: `js/core/huella.js`, `js/core/cierre.js`, `js/core/periodo.js`, `js/core/lazy-loader.js`, el núcleo (`js/core/cuentas-fuentes.js`) (`Libro`, `conEstadoAislado`, `registrarSonda`, `nivelAntiguedadMovimiento`), `js/modules/cuentas.js` (historial), `js/modules/configuracion.js` (`exportarJSON`, `renderTamanoDatos`), `js/core/firebase-sync.js`. Guardas automáticas que fallan si se olvida algo: clasificación de claves de `S`, saldo solo por la puerta única del libro, símbolos decorativos, estilos inline, tuteo, contrato de clases CSS del Wrapped guardado.

## 10. Apéndice: Wrapped (resumen; detalle en `docs/wrapped.md` §7quaterdecies)

Criterio de datos suficientes (`wrapped-gate.js`): `nada` (0 registros), `poco` (< 30 días o < 3 meses distintos), `suficiente`. «No alcanzó el tiempo»: 2–3 diapositivas con banco de frases (`WRAPPED_BANCO_INSUFICIENTE`), nunca se guarda. Guardar = botón «Guardar este Wrapped»; abrir no guarda; dentro de enero un guardado se recalcula y reemplaza (si ya no hay datos suficientes se conserva); fuera de enero queda fijo; eliminar en «Mis Wrapped» con confirmación y PIN; «Ocultar saldos» se aplica al mostrar. Contrato de CSS: `tests/fixtures/wrapped-clases.json` (solo aditivo). No es posible ver el Wrapped de 2024/2025: los datos de esquemas anteriores al 9 se rechazan; el primer Wrapped real es el de 2026 (enero de 2027).

## 11. Apéndice: prompt de arranque para un chat nuevo

> Voy a implementar la etapa 2 del cierre de períodos de Mis Finanzas. Te adjunto el documento maestro `cierre-de-periodos.md` y el código actual (zips de `js`, `tests`, `docs`, `scripts`, más `index.html`, `sw.js`, `css/styles.css`, `package.json`, `mapa-codigo.md`). Lee primero el documento completo (sobre todo §0, §4, §5 y §8). Antes de modificar nada: reconstruye el repo, corre `node --test`, `npm run smoke` y `npm run smoke:wrapped` y confírmame que dan lo que dice §9. Recuerda que `Huella` y `Cierre` solo existen tras `await Loader.ensure('cierre')`. Después propón el plan de implementación de §5 con los archivos a tocar y las pruebas, y espera mi aprobación antes de escribir código. No toques datos reales; usa datos sintéticos. Distingue siempre entre lo implementado, lo probado y lo pendiente, y no des nada por funcionando sin comprobarlo (incluida la página real en jsdom).
