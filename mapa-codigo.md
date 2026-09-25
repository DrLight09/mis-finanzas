# Mapa de código — mis-finanzas

> **Archivo generado — no editar a mano.** Se regenera con `node scripts/generar-mapa.js` (y `--check` en CI lo verifica). Sirve para saber **qué archivo mirar**, no qué hace cada función: el comportamiento real siempre está en el código. Reglas y advertencias escritas a mano: [`arquitectura-archivos.md`](./arquitectura-archivos.md).

Lista solo declaraciones de nivel superior (funciones, y constantes/objetos globales en PascalCase o MAYÚSCULAS). No incluye funciones anidadas ni métodos de objetos. Ver los límites en la cabecera de `scripts/generar-mapa.js`.

## 1. Archivos y cómo cargan

| Archivo | Carga | Funciones | Globales |
|---|---|---|---|
| `js/core/async-css.js` | de entrada (async) | 0 | 0 |
| `js/core/bootstrap.js` | de entrada (defer) | 1 | 0 |
| `js/core/busqueda-global.js` | de entrada (defer) | 0 | 0 |
| `js/core/calc-helpers.js` | de entrada (defer) | 10 | 0 |
| `js/core/color-picker.js` | sin <script> ni grupo lazy (¿lo importa otro archivo?) | 1 | 0 |
| `js/core/core-state.js` | de entrada (defer) | 55 | 5 |
| `js/core/diferencial.js` | de entrada (defer) | 22 | 0 |
| `js/core/events.js` | de entrada (defer) | 1 | 0 |
| `js/core/firebase-init.js` | de entrada (módulo ES) | 0 | 0 |
| `js/core/firebase-sync.js` | de entrada (módulo ES) | 0 | 0 |
| `js/core/fuentes-filtro.js` | de entrada (defer) | 1 | 0 |
| `js/core/gastos-fijos-progress.js` | de entrada (defer) | 0 | 0 |
| `js/core/hook-global-module.js` | sin <script> ni grupo lazy (¿lo importa otro archivo?) | 0 | 0 |
| `js/core/hook-global.js` | de entrada (defer) | 1 | 0 |
| `js/core/html-tag.js` | de entrada (defer) | 3 | 0 |
| `js/core/lazy-loader.js` | de entrada (defer) | 1 | 0 |
| `js/core/mas-menu.js` | de entrada (defer) | 0 | 0 |
| `js/core/mejoras-adicionales.js` | de entrada (defer) | 0 | 0 |
| `js/core/money-input.js` | de entrada (defer) | 1 | 0 |
| `js/core/movimientos.js` | de entrada (defer) | 5 | 0 |
| `js/core/personas-init.js` | de entrada (defer) | 1 | 0 |
| `js/core/pin-bio.js` | de entrada (módulo ES) | 0 | 0 |
| `js/core/sheet-behavior.js` | de entrada (defer) | 0 | 0 |
| `js/core/sheet-stack.js` | de entrada (defer) | 12 | 0 |
| `js/core/split.js` | de entrada (defer) | 8 | 0 |
| `js/core/wait-for-module.js` | sin <script> ni grupo lazy (¿lo importa otro archivo?) | 0 | 0 |
| `js/core/wait-for.js` | de entrada (defer) | 1 | 0 |
| `js/core/wrapped-gate.js` | de entrada (defer) | 8 | 1 |
| `js/modules/actividad_reciente.js` | lazy — grupo `historial` | 0 | 0 |
| `js/modules/alcancia.js` | lazy — grupo `alcancia` | 32 | 0 |
| `js/modules/analisis.js` | lazy — grupo `analisis` | 8 | 0 |
| `js/modules/configuracion.js` | lazy — grupo `config` | 10 | 0 |
| `js/modules/cuentas.js` | lazy — grupo `cuentas` | 115 | 1 |
| `js/modules/diferencial.js` | sin <script> ni grupo lazy (¿lo importa otro archivo?) | 22 | 0 |
| `js/modules/encargos.js` | lazy — grupo `encargos` | 98 | 0 |
| `js/modules/gastos.js` | de entrada (defer) | 20 | 0 |
| `js/modules/import-validado.js` | sin <script> ni grupo lazy (¿lo importa otro archivo?) | 1 | 0 |
| `js/modules/inicio.js` | de entrada (defer) | 6 | 0 |
| `js/modules/lazy-loader.js` | sin <script> ni grupo lazy (¿lo importa otro archivo?) | 1 | 0 |
| `js/modules/mesada.js` | lazy — grupo `mesada` | 34 | 0 |
| `js/modules/personas.js` | de entrada (defer) | 22 | 1 |
| `js/modules/plata_comprometida.js` | lazy — grupo `comprometida` | 33 | 0 |
| `js/modules/prestado.js` | lazy — grupo `prestamos` | 100 | 1 |
| `js/modules/split.js` | sin <script> ni grupo lazy (¿lo importa otro archivo?) | 5 | 0 |
| `js/modules/spotify.js` | lazy — grupo `spotify` | 48 | 2 |
| `js/modules/tarjetas_credito.js` | lazy — grupo `tarjetas` | 29 | 2 |
| `js/modules/wrapped.js` | lazy — grupo `wrapped` | 105 | 1 |

## 2. Qué declara cada archivo

### `js/core/async-css.js`

Carga: de entrada (async)

**Funciones:** —

### `js/core/bootstrap.js`

Carga: de entrada (defer)

**Funciones:** `iniciales`

### `js/core/busqueda-global.js`

Carga: de entrada (defer)

**Funciones:** —

### `js/core/calc-helpers.js`

Carga: de entrada (defer)

**Funciones:** `_ensureMesadas`, `_getCuotaAnio`, `_mesNombreDeKey`, `getDeudorSaldo`, `getMesadaData`, `getTCById`, `spNombreDe`, `spPersonaPagadaVigente`, `tcCupoDisponible`, `tcCupoUsadoPct`

### `js/core/color-picker.js`

Carga: sin <script> ni grupo lazy (¿lo importa otro archivo?)

**Funciones:** `marcarColorSeleccionado`

### `js/core/core-state.js`

Carga: de entrada (defer)

**Funciones:** `_calcCDTSafe`, `_calcCSafe`, `_closeDialog`, `_esEntradaEspejoNoIngreso`, `_esGastoVarNoReal`, `_getNuTasaGlobalSafe`, `_moneyRender`, `_moneyValue`, `_nuTotalSafe`, `_patrimonioDependenciasListas`, `_saldoCPAjeno`, `_saldoEncargosEnCuenta`, `avisarMovimientoBloqueado`, `buildFuentesOptsHtml`, `calcDeudaAjenaDeTarjeta`, `calcDeudaTcPropia`, `calcDeudaTcPropiaDeTarjeta`, `calcPatrimonioTotal`, `calcSaldoInicialPendiente`, `confirmarBorrarMovimientoViejo`, `crearMovimientoApertura`, `debounceSave`, `descontarFuente`, `dialogo`, `emptyState`, `escHtml`, `fmt`, `fmtInput`, `fmtNoCents`, `fuenteBadgeClass`, `fuenteLabel`, `gastosMes`, `getCatsFijo`, `getCatsVar`, `getFuentes`, `getFuentesSinTC`, `getIngresosFijosMes`, `getSaldoFuente`, `hoy`, `load`, `medirAnchoTexto`, `mesActual`, `mesKey`, `nivelAntiguedadMovimiento`, `parseMoney`, `parsePct`, `pintarAvatarPersona`, `poblarCatSelect`, `poblarFuente`, `refresh`, `save`, `snapshotPatrimonio`, `sumarFuente`, `toast`, `uid`

**Globales:** `CATS_FIJO_DEFAULT`, `CATS_VAR_DEFAULT`, `MAX`, `MC`, `S`

**Asigna a `window`:** `_dialogResolve`, `_locallyModified`

### `js/core/diferencial.js`

Carga: de entrada (defer)

**Funciones:** `_diffActualizarMiCuenta`, `_diffFuentesOptsHtml`, `_difRenderHistorial`, `diffAddParte`, `diffAplicar`, `diffCalcular`, `diffEstaAbierto`, `diffHtmlBloque`, `diffInst`, `diffRegistrarInstancia`, `diffRemoveParte`, `diffRenderHistorial`, `diffRenderPartes`, `diffReset`, `diffResumen`, `diffSetCuentaEntrada`, `diffSetCuentaSalida`, `diffSetMonto`, `diffSetNombre`, `diffToggle`, `diffTogglePagoYo`, `diffValidarIntercambios`

### `js/core/events.js`

Carga: de entrada (defer)

**Funciones:** `Events`

### `js/core/firebase-init.js`

Carga: de entrada (módulo ES)

**Funciones:** —

### `js/core/firebase-sync.js`

Carga: de entrada (módulo ES)

**Funciones:** —

### `js/core/fuentes-filtro.js`

Carga: de entrada (defer)

**Funciones:** `FuentesFiltro`

### `js/core/gastos-fijos-progress.js`

Carga: de entrada (defer)

**Funciones:** —

### `js/core/hook-global-module.js`

Carga: sin <script> ni grupo lazy (¿lo importa otro archivo?)

**Funciones:** —

### `js/core/hook-global.js`

Carga: de entrada (defer)

**Funciones:** `hookGlobal`

### `js/core/html-tag.js`

Carga: de entrada (defer)

**Funciones:** `_htmlEscapeValue`, `html`, `raw`

### `js/core/lazy-loader.js`

Carga: de entrada (defer)

**Funciones:** `Loader`

### `js/core/mas-menu.js`

Carga: de entrada (defer)

**Funciones:** —

### `js/core/mejoras-adicionales.js`

Carga: de entrada (defer)

**Funciones:** —

### `js/core/money-input.js`

Carga: de entrada (defer)

**Funciones:** `_initMoneyInput`

### `js/core/movimientos.js`

Carga: de entrada (defer)

**Funciones:** `_cuentaOpsPosteriores`, `_fuenteLabelHtml`, `_rerenderCuentaActiva`, `abrirDetalleMov`, `eliminarMovimiento`

### `js/core/personas-init.js`

Carga: de entrada (defer)

**Funciones:** `_intentarInyectarPersonaSheets`

### `js/core/pin-bio.js`

Carga: de entrada (módulo ES)

**Funciones:** —

### `js/core/sheet-behavior.js`

Carga: de entrada (defer)

**Funciones:** —

### `js/core/sheet-stack.js`

Carga: de entrada (defer)

**Funciones:** `_hideScreenLoading`, `_initEventListeners`, `_injectErrorSpans`, `_markError`, `_showScreenLoading`, `applyModulos`, `closeSheet`, `markDirty`, `mostrarAlertaFuente`, `openSheet`, `saveAndRefresh`, `showScreen`

### `js/core/split.js`

Carga: de entrada (defer)

**Funciones:** `crearSplitWidget`, `splitActualizarBotones`, `splitActualizarOpciones`, `splitAgregarRow`, `splitGetData`, `splitOpcionesUsadas`, `splitPreview`, `splitToggle`

### `js/core/wait-for-module.js`

Carga: sin <script> ni grupo lazy (¿lo importa otro archivo?)

**Funciones:** —

### `js/core/wait-for.js`

Carga: de entrada (defer)

**Funciones:** `waitFor`

### `js/core/wrapped-gate.js`

Carga: de entrada (defer)

**Funciones:** `_wrappedGateAplicarFila`, `_wrappedGateForzado`, `_wrappedGateHoy`, `_wrappedGateLocalKey`, `_wrappedGateMarcarVisto`, `_wrappedGateMostrarBanner`, `_wrappedGateYaVisto`, `_wrappedVentana`

**Globales:** `WRAPPED_VENTANA_DIAS`

**Asigna a `window`:** `_wrappedAnioObjetivo`, `_wrappedDisponible`, `_wrappedVentanaInfo`

### `js/modules/actividad_reciente.js`

Carga: lazy — grupo `historial`

**Funciones:** —

### `js/modules/alcancia.js`

Carga: lazy — grupo `alcancia`

**Funciones:** `_actualizarDiferenciaHint`, `_alcanciaEjecutarEliminarDeposito`, `_alcanciaInit`, `_alcanciaToggleDesglose`, `_alcDecode`, `_alcDesgloseHtml`, `_alcDeudorSaldoHintActualizar`, `_alcDeudorSelActualizar`, `_alcEncode`, `_alcFiltrarFuentesPorSaldo`, `_alcInitMoneyInput`, `_alcMejorCiclo`, `_alcNombreFuente`, `_alcOrigenActualizar`, `_alcOrigenOptsHtml`, `_alcParteDesdeValor`, `_alcRachaAhorro`, `_alcSplitPreview`, `_alcWrappedBarrasSvg`, `_alcWrappedProgresoHtml`, `_diasDesde`, `_fmtTiempo`, `_getA`, `_getMoneyVal`, `_getSaldoOfuscado`, `_initA`, `_inyectarAlcanciaSheets`, `_inyectarMasMenuItem`, `_saldoRegistrado`, `_setSaldoOfuscado`, `_sumarASaldo`, `closeSwipeSheet`

**Asigna a `window`:** `_alcanciaQuitarPorCobroDeuda`, `alcanciaAgregarOrigen`, `alcanciaConfirmarDeposito`, `alcanciaConfirmarDestapar`, `alcanciaEliminarDeposito`, `alcanciaIniciarNueva`, `alcanciaToggleDividir`, `alcanciaToggleMontoDeposito`, `renderAlcancia`

### `js/modules/analisis.js`

Carga: lazy — grupo `analisis`

**Funciones:** `abrirPresupuestos`, `abrirSheetIngresoFijo`, `editarIngresoFijo`, `eliminarIngresoFijo`, `guardarIngresoFijo`, `renderAnalisis`, `renderIngresosFijos`, `renderPresupuestos`

### `js/modules/configuracion.js`

Carga: lazy — grupo `config`

**Funciones:** `_validarEstructuraJSON`, `agregarCat`, `borrarTodo`, `eliminarCat`, `exportarCSV`, `exportarJSON`, `importarJSON`, `leerArchivoImport`, `renderCatsConfig`, `toggleModulo`

### `js/modules/cuentas.js`

Carga: lazy — grupo `cuentas`

**Funciones:** `_abrirConfirmarTasaNu`, `_aperturaToggleUI`, `_cajitaDetDelete`, `_calcPrestadoMeta`, `_cancelarCobrarCDT`, `_diasEntreFechas`, `_expandCajitaCDTs`, `_getMovimientosCuentaCustom`, `_getMovsFilter`, `_interpretarLecturaChequeoNu`, `_metaAporteEliminar`, `_movsAplicarFiltro`, `_movsLimpiarFechas`, `_movsOnFecha`, `_movsOnSearch`, `_movsOnTipo`, `_movsRefresh`, `_nuMovActualizarPreview`, `_nuMovRenderCajitas`, `_nuMovToggleApertura`, `_procesarSiguienteCDTVencido`, `_refreshCajitaDet`, `_renderDetalleCajita`, `_renderMetaAportes`, `_renderTasaHistorialTag`, `_rendimientoCDTaDias`, `_resetSheetNuevaCuenta`, `_saldoEncargosEnCajita`, `_segmentosTasaNu`, `_setBtnTransferir`, `_showCuentasPanel`, `_tasaVigenteEnFecha`, `_trDestinoCambio`, `_trOrigenCambio`, `_trPodarSelect`, `_updateMetaCuotaPreview`, `abrirAgregarDinero`, `abrirCobrarCDT`, `abrirCrearCDT`, `abrirCuenta`, `abrirCustomCuenta`, `abrirDetalleCajita`, `abrirEditarApertura`, `abrirMetaCajita`, `abrirNuevaCuenta`, `abrirNuMovimiento`, `abrirRegistrarApertura`, `abrirRestarDinero`, `abrirSubCDTs`, `abrirSubMeta`, `abrirTransferir`, `actualizarAdMenuPreview`, `actualizarAdMenuSaldo`, `actualizarBotonesTransferir`, `actualizarTransfPreview`, `addCajita`, `calcC`, `calcCDT`, `calcMetaProgreso`, `calcRendimientoCDTMes`, `calcRendimientoCDTsMes`, `calcularSerieTasaImplicitaNu`, `confirmarAgregarDinero`, `confirmarAgregarDineroMenu`, `confirmarCambioTasaNu`, `confirmarCobrarCDT`, `confirmarCrearCDT`, `confirmarEditarApertura`, `confirmarNuMovimiento`, `confirmarRestarDinero`, `confirmarTransferir`, `corregirChequeoNu`, `crearCuentaCustom`, `deleteCajita`, `editarCDT`, `editarCuentaCustom`, `eliminarCuentaCustom`, `getAperturaMov`, `getIconoData`, `getMovimientosCuenta`, `getNuTasaGlobal`, `guardarCDT`, `guardarChequeoNu`, `guardarMetaCajita`, `hexToRgb`, `liberarCDTManual`, `materializarIntereses`, `nuTotal`, `openSheet_adMenu`, `poblarChequeoNu`, `quitarMetaCajita`, `registrarEntradaConApertura`, `registrarSalida`, `registrarTasaNuHistorial`, `renderBannerApertura`, `renderCajitas`, `renderCustomCuentasList`, `renderDetalleCuenta`, `renderIconGrid`, `renderIconoCustom`, `renderMetaProgress`, `renderMovsCuenta`, `renderMovsCustom`, `renderMovsFiltros`, `selColorNC`, `selIconoNC`, `toggleAdApertura`, `toggleCajita`, `toggleCDT`, `toggleMetaMinWrap`, `verificarTasaNu`, `verificarVencimientosCDT`, `volverADetalleCajita`, `volverANu`, `volverSelector`

**Globales:** `ICONOS_CUENTA`

### `js/modules/diferencial.js`

Carga: sin <script> ni grupo lazy (¿lo importa otro archivo?)

**Funciones:** `_diffActualizarMiCuenta`, `_diffFuentesOptsHtml`, `_difRenderHistorial`, `diffAddParte`, `diffAplicar`, `diffCalcular`, `diffEstaAbierto`, `diffHtmlBloque`, `diffInst`, `diffRegistrarInstancia`, `diffRemoveParte`, `diffRenderHistorial`, `diffRenderPartes`, `diffReset`, `diffResumen`, `diffSetCuentaEntrada`, `diffSetCuentaSalida`, `diffSetMonto`, `diffSetNombre`, `diffToggle`, `diffTogglePagoYo`, `diffValidarIntercambios`

### `js/modules/encargos.js`

Carga: lazy — grupo `encargos`

**Funciones:** `_actualizarMovEncCuentaHint`, `_actualizarMoverEncDestinoHint`, `_actualizarMoverEncOrigenHint`, `_actualizarMoverEncPreview`, `_actualizarPartePreview`, `_actualizarTransfEncPreview`, `_actualizarTraspasoHint`, `_actualizarTraspasoOrigenHint`, `_actualizarTraspasoPreview`, `_confirmarMoverEncCuentasSplit`, `_confirmarUsarParte`, `_ctcActualizarCuentaEncHint`, `_ctcActualizarDestinoHint`, `_ctcActualizarPreview`, `_ctcDifResumen`, `_ctcDifToggle`, `_difAddBenef`, `_difRemoveBenef`, `_difRenderHistorialParte`, `_difResumen`, `_difSetCuentaEntrada`, `_difSetCuentaSalida`, `_difSetMonto`, `_difSetNombre`, `_difToggle`, `_difTogglePagoYo`, `_encAbrirSelectorPersonaNueva`, `_getEncargoSaldoEnCuenta`, `_getEncargoSaldoPorCuenta`, `_getEncargoSaldoSinCuenta`, `_getUsarParteFuentesOptions`, `_getUsarParteSplitData`, `_initNuevoEncargoPersonaSelector`, `_irAEncargo`, `_movEncActualizarFaltante`, `_movEncAgregarSplitRow`, `_movEncConfirmarPrestarFaltante`, `_movEncFaltanteCuentaHint`, `_movEncGetFuentesOptions`, `_movEncGetSplitData`, `_movEncMiaPreview`, `_movEncMiaToggle`, `_movEncSplitPreview`, `_movEncSplitToggle`, `_moverEncAgregarSplitRow`, `_moverEncGetFuentesOptions`, `_moverEncGetSplitData`, `_moverEncSplitPreview`, `_moverEncSplitToggle`, `_onSelPersonaNuevoEncargo`, `_procesarDiferencial`, `_procesarMovEncMia`, `_salidaEncMenuIr`, `_usarParteAddBenef`, `_usarParteAgregarSplitRow`, `_usarParteDifResumen`, `_usarParteDifToggle`, `_usarParteFuentePreview`, `_usarParteRemoveBenef`, `_usarParteSetMonto`, `_usarParteSetNombre`, `_usarParteSplitToggle`, `_validarIntercambiosBenefs`, `_validarMovEncMia`, `abrirCompraConTC`, `abrirEncargoDesdeCuenta`, `abrirEncargoDetalle`, `abrirMovEncargo`, `abrirMoverEntreCuentasEncargo`, `abrirNuevaParte`, `abrirSalidaEncargoMenu`, `abrirTransferenciaEncargo`, `abrirTraspasoEncargo`, `abrirUsarParteSheet`, `cerrarPartSheet`, `confirmarCompraConTC`, `confirmarMovEncargo`, `confirmarMoverEncCuentas`, `confirmarTransferenciaEncargo`, `confirmarTraspasoEncargo`, `crearEncargo`, `deleteMovEncargo`, `editarEncargoActual`, `editarParte`, `eliminarEncargoActual`, `eliminarParte`, `encargoComprometido`, `encargoLibre`, `encargoSaldo`, `getCajitaNombre`, `getEncargo`, `guardarEditarEncargo`, `guardarParte`, `renderEncargoParts`, `renderEncargosEnCuenta`, `renderEncargosList`, `usarParte`, `volverEncargosLista`

### `js/modules/gastos.js`

Carga: de entrada (defer)

**Funciones:** `_gvDiaLabel`, `abrirNuevoGastoFijo`, `abrirNuevoGastoVar`, `abrirPagarGastoFijo`, `actualizarGvSplitPreview`, `addGastoFijo`, `addGastoVar`, `agregarGvSplitRow`, `confirmarPagarGastoFijo`, `deleteGastoFijo`, `deleteGastoVar`, `getGvSplitData`, `getGvSplitFuentesOptions`, `pgfActualizarSaldo`, `renderGastosFijos`, `renderGastosVar`, `renderMesFiltros`, `setMesFiltro`, `switchGastoTab`, `toggleGvSplit`

### `js/modules/import-validado.js`

Carga: sin <script> ni grupo lazy (¿lo importa otro archivo?)

**Funciones:** `_validarEstructuraJSON`

### `js/modules/inicio.js`

Carga: de entrada (defer)

**Funciones:** `_checkGastoAlto`, `_renderDispNetoTC`, `calcHealthScore`, `renderAttencion`, `renderHealthScore`, `renderProyeccion`

**Asigna a `window`:** `refresh`

### `js/modules/lazy-loader.js`

Carga: sin <script> ni grupo lazy (¿lo importa otro archivo?)

**Funciones:** `Loader`

### `js/modules/mesada.js`

Carga: lazy — grupo `mesada`

**Funciones:** `_borrarMesadaPago`, `_borrarMovSecundarioMesada`, `_mesadaClavesParent`, `_mesadaEncargosDelParent`, `_mesadaFuentesDe`, `_mesadaOpsPosteriores`, `_mesadaTieneCuentaAfectada`, `_mostrarMppDestinoNormal`, `_mostrarSeccionDestinoNormal`, `_normTxt`, `_poblarMpEncargoCuentas`, `_poblarMppEncargoCuentas`, `_registrarMovSecundarioMesada`, `_sincronizarMpDestinoConEncargo`, `_sincronizarMppDestinoConEncargo`, `_syncMpDebeWrap`, `abrirDetalleMesada`, `abrirRegistrarMesada`, `abrirResolverPendiente`, `actualizarMppPreview`, `actualizarMpPreview`, `agregarMpSplitRow`, `cambiarAnio`, `clickMesDot`, `confirmarMesadaPago`, `confirmarPendienteMesada`, `deshacerPendienteMesada`, `eliminarMesadaPago`, `getFuentesOptions`, `getMontoPadre`, `getMpSplitData`, `marcarMesadaComoPendiente`, `renderMesada`, `toggleMpSplit`

### `js/modules/personas.js`

Carga: de entrada (defer)

**Funciones:** `_abrirCrearPersonaGlobal`, `_abrirListaPersonas`, `_actualizarMasPersonasSub`, `_crearPersonaGlobal`, `_editarPersonaDesdePerfilSheet`, `_guardarEditarPersonaGlobal`, `_inyectarPersonaSheets`, `_irASpotify`, `_renderColorPicker`, `_renderListaPersonas`, `_seleccionarColorPersona`, `_selPersonaCrearDirecto`, `_selPersonaElegir`, `_selPersonaFiltrar`, `_volverASelPersona`, `abrirEditarPersonaGlobal`, `abrirPerfilPersona`, `abrirSelPersona`, `getPersona`, `getPersonaColor`, `getPersonaDatos`, `getPersonaNombre`

**Globales:** `PERSONA_COLORES`

### `js/modules/plata_comprometida.js`

Carga: lazy — grupo `comprometida`

**Funciones:** `_cpAbrirEditar`, `_cpAbrirNuevo`, `_cpAbrirRecibir`, `_cpAgregarDestino`, `_cpCancelSheet`, `_cpConfirmarRecibir`, `_cpData`, `_cpdConfirmar`, `_cpDiasHastaStr`, `_cpdPoblarGastoSelectores`, `_cpdSetGastoOrigen`, `_cpdSetTipo`, `_cpdSetYaPague`, `_cpdSetYaSaque`, `_cpdTipoChange`, `_cpEliminar`, `_cpFuenteLabel`, `_cpGuardar`, `_cpGuardarMarcados`, `_cpInit`, `_cpInitSwipe`, `_cpMarcarPagos`, `_cpPoblarCuentas`, `_cpPoblarPersonas`, `_cpPoblarTC`, `_cpQuitarDestino`, `_cpRenderDestinosTmp`, `_cpRenderLista`, `_cpRenderMarcarList`, `_cpToggleMarcar`, `_injectMasItem`, `_injectScreen`, `_injectSheet`

### `js/modules/prestado.js`

Carga: lazy — grupo `prestamos`

**Funciones:** `_abonoEncCuentaAgregarSplitRow`, `_abonoEncCuentaSplitPreview`, `_abonoEncCuentaSplitToggle`, `_abrirMovMiDeudaPago`, `_abrirMovMiDeudaRecibido`, `_abrirPerfilDesdeDeudor`, `_abrirPerfilDesdeDeudorActual`, `_abrirPerfilDesdeMiDeuda`, `_abrirPerfilDesdeMiDeudaActual`, `_abrirSheetAbono`, `_abrirSheetNuevaDeuda`, `_abrirSheetNuevaPersona`, `_abrirSheetNuevoPrestamo`, `_abrirSheetPagoCompleto`, `_actualizarBtnPrestamoTC`, `_actualizarEncPreview`, `_autoCerrarGruposEnCero`, `_autoGrupoIdMov`, `_confirmarMovimientoConGuard`, `_crearGrupoDeudor`, `_deudorCuentasDe`, `_deudorOpsPosteriores`, `_deudorTieneCuentaAfectada`, `_getAbonoDestinoFuentesOptions`, `_getAbonoDestinoSplitData`, `_getAbonoEncCuentaFuentesOptions`, `_getAbonoEncCuentaSplitData`, `_getOrCrearHistorico`, `_getPrestSplitFuentesOptions`, `_gruposAbiertos`, `_initGrupoSelector`, `_initMovGrupoSelector`, `_initNuevaDeudaPersonaSelector`, `_irADeudor`, `_irAMiDeuda`, `_mdPickColor`, `_miDeudaCuentasDe`, `_miDeudaOpsPosteriores`, `_miDeudaTieneCuentaAfectada`, `_migrarGruposDeudor`, `_movEsPerdon`, `_movTieneEncargoVinculado`, `_ndPoblarSelectDestino`, `_onMovMontoInput`, `_onSelPersonaMeDeben`, `_onSelPersonaNuevaDeuda`, `_prEnsureAlcancia`, `_prestAddSplitRow`, `_prtcDifResumen`, `_prtcDifToggle`, `_resetEncCuentaSplitToggleStyle`, `_resolverGrupoIdMov`, `_resolverGrupoIdSel`, `_updatePrestSplitResumen`, `_verificarIntegridadSaldoDeudor`, `abonoAddSplitRow`, `abonoSplitResumen`, `abrirDeudor`, `abrirMiDeuda`, `abrirMovMiDeuda`, `abrirSheetPrestamoTC`, `cambiarTabPrestamos`, `confirmarMovimiento`, `confirmarMovMiDeuda`, `confirmarPrestamoTC`, `crearMiDeuda`, `editarDeudorActual`, `editarMiDeudaActual`, `eliminarDeudorActual`, `eliminarMiDeuda`, `eliminarMovDeudor`, `eliminarMovMiDeuda`, `extAddParte`, `extDelParte`, `extRenderPartes`, `extResumenPartes`, `extSetCuenta`, `extSetDesc`, `extSetMonto`, `extSetQuien`, `extSetTipo`, `fuenteLabel2`, `getDeudorSaldoPatrimonio`, `getGrupoSaldo`, `getMiDeudaSaldo`, `guardarEditarMiDeuda`, `initMovSheet`, `onChangeMov_enc_cuenta`, `onChangeMov_enc_sel`, `renderDeudoresList`, `renderMisDeudasList`, `toggleAbonoSplit`, `toggleDesdeEncargo`, `toggleExtraSection`, `toggleMovPerdon`, `togglePrestSplit`, `totalMisDeudasPendiente`, `totalPrestadoPendiente`, `volverDeudores`, `volverMisDeudas`

**Globales:** `PERSONA_COLORES_MD`

**Asigna a `window`:** `_miDeudaEditColor`

### `js/modules/split.js`

Carga: sin <script> ni grupo lazy (¿lo importa otro archivo?)

**Funciones:** `crearSplitWidget`, `splitAgregarRow`, `splitGetData`, `splitPreview`, `splitToggle`

### `js/modules/spotify.js`

Carga: lazy — grupo `spotify`

**Funciones:** `_abrirSelPersonaSpotifyEdit`, `_borrarSpHistorial`, `_initSpotifyEditPersonaSelector`, `_initSpotifyPersonaSelector`, `_onClickSpEditPersonaBtn`, `_onSelPersonaSpotify`, `_onSelPersonaSpotifyEdit`, `_spEnsureTC`, `_spPagarSplitFuentesOpts`, `_spProporcionarSplits`, `_spSplitFuentesOpts`, `_syncSpDebeWrap`, `actualizarSpDestinoPreview`, `actualizarSpPagarPreview`, `actualizarSpResolverPreview`, `addSpotify`, `agregarSpCobSplitRow`, `agregarSpPagarSplitRow`, `confirmarPagarSpotify`, `confirmarSpDestino`, `confirmarSpResolverPendiente`, `deleteSpHistorial`, `deleteSpotify`, `deshacerAbonoPendienteSp`, `editarSpotify`, `getSpCajita`, `getSpCajitaSaldo`, `getSpCobSplitData`, `getSpPagarSplitData`, `guardarEditarSpotify`, `marcarPagoSpotify`, `nextMonthFixed`, `openSheet_pagarSpotify`, `renderSpHistorial`, `renderSpotify`, `renderSpStats`, `resolverPendienteSpHistorial`, `selSpMeses`, `spAsignarPeriodos`, `spCicloCobrosActual`, `spCobradoDePersona`, `spMontoAntesDe`, `spPeriodosVencidos`, `spResumenCicloActual`, `spSumarDias`, `spTramosDeCobro`, `toggleSpCobSplit`, `toggleSpPagarSplit`

**Globales:** `SP_EMPATE_PERIODOS`, `SP_PERIODO_DIAS`

### `js/modules/tarjetas_credito.js`

Carga: lazy — grupo `tarjetas`

**Funciones:** `_tcOpsPosteriores`, `_tcPoblarSelectCajita`, `abrirCargoEspecialTC`, `abrirCompraTC`, `abrirDetalleTCSheet`, `abrirEditarTC`, `abrirNuevaTarjeta`, `abrirPagarTC`, `confirmarCargoEspecialTC`, `confirmarCompraTC`, `confirmarPagarTC`, `eliminarCompraTC`, `eliminarPagoTC`, `eliminarTC`, `guardarTC`, `ptcActualizarPreview`, `ptcSetMonto`, `renderTCDashboard`, `renderTCScreen`, `tcBuscarCompraPorIdOMatch`, `tcCrearCompra`, `tcCrearPago`, `tcDeudaTotal`, `tcEliminarCompraInterna`, `tcEliminarPagoInterna`, `tcEstadoInfo`, `tcNormalizarTarjetas`, `tcRecalcular`, `tcSelColor`

**Globales:** `TC_ESTADOS`, `TC_MOTIVOS_CARGO`

### `js/modules/wrapped.js`

Carga: lazy — grupo `wrapped`

**Funciones:** `_wrappedAgruparPorCategoria`, `_wrappedAlcanciaDepositosPeriodo`, `_wrappedAnimarBarras`, `_wrappedAnimarLinea`, `_wrappedAnimarNumeros`, `_wrappedAnioYMesActual`, `_wrappedBankPick`, `_wrappedBuildSlides`, `_wrappedCalcularComisionesTC`, `_wrappedCalcularComprometida`, `_wrappedCalcularEncargos`, `_wrappedCalcularInteresesTC`, `_wrappedCalcularMesada`, `_wrappedCalcularMisDeudas`, `_wrappedCalcularPeriodo`, `_wrappedCalcularPrestado`, `_wrappedCalcularSpotify`, `_wrappedCambioDeHabitos`, `_wrappedCambioFuerte`, `_wrappedCategoriaMasConcentrada`, `_wrappedCerrar`, `_wrappedComparaciones`, `_wrappedCopyAlcancia`, `_wrappedCopyCategoria`, `_wrappedCopyCierre`, `_wrappedCopyCierrePoema`, `_wrappedCopyComisionesTC`, `_wrappedCopyComprometida`, `_wrappedCopyDesgloseMes`, `_wrappedCopyEncargos`, `_wrappedCopyFases`, `_wrappedCopyGasto`, `_wrappedCopyInteresesTC`, `_wrappedCopyIntro`, `_wrappedCopyMejorMes`, `_wrappedCopyMesada`, `_wrappedCopyMeta`, `_wrappedCopyMisDeudas`, `_wrappedCopyPatrimonio`, `_wrappedCopyPeorMes`, `_wrappedCopyPrestado`, `_wrappedCopyPuente`, `_wrappedCopyRacha`, `_wrappedCopySpotify`, `_wrappedCorteMitadAnio`, `_wrappedCuotaAnioFallback`, `_wrappedDebugOn`, `_wrappedDebugPanelHtml`, `_wrappedDescubrimientos`, `_wrappedEnRango`, `_wrappedFasesAnio`, `_wrappedFechaLuceValida`, `_wrappedFmtFechaLarga`, `_wrappedFmtSigned`, `_wrappedFraseDelAnio`, `_wrappedFrasesHtml`, `_wrappedGastoMasRandom`, `_wrappedGoTo`, `_wrappedGraficoAnimadoSvg`, `_wrappedGraficoMensualSvg`, `_wrappedHashStr`, `_wrappedHistoriasMensuales`, `_wrappedHoy`, `_wrappedIngresosFijosMes`, `_wrappedIniciarBanco`, `_wrappedInicioRachaReal`, `_wrappedInyectarEstilos`, `_wrappedItemsRealesPeriodo`, `_wrappedLanzarConfeti`, `_wrappedLimpiarNav`, `_wrappedLineaMes`, `_wrappedListaCajitas`, `_wrappedLogDebug`, `_wrappedMejorPeorMesAnio`, `_wrappedMesadaMes`, `_wrappedMesDetalleHtml`, `_wrappedMesKaAbrev`, `_wrappedMesKaNombre`, `_wrappedMetaCajita`, `_wrappedNombrePersona`, `_wrappedPatrimonioAnio`, `_wrappedPeriodoEnNumeros`, `_wrappedPersonalidad`, `_wrappedPersonasInvolucradas`, `_wrappedProtagonistas`, `_wrappedRangoFechasAnio`, `_wrappedRankingCategorias`, `_wrappedRecordsAnio`, `_wrappedRecordsHtml`, `_wrappedRecuperacionMasRapida`, `_wrappedSaldosOcultos`, `_wrappedScoreInsight`, `_wrappedSeededRandom`, `_wrappedSeleccionarMes`, `_wrappedSerieMensualAnio`, `_wrappedSerieMensualIngresoGasto`, `_wrappedSetupGraficoMensual`, `_wrappedSetupNav`, `_wrappedSiTuAnioFuera`, `_wrappedSlideBignum`, `_wrappedSuscripciones`, `_wrappedTopCategoriaDe`, `_wrappedValidarDatos`, `_wrappedVisible`, `escHtml2`

**Globales:** `WRAPPED_MAX_INSIGHTS_POOL`

**Asigna a `window`:** `_wrappedInternals`, `renderWrapped`

## 3. Nombres declarados en más de un archivo

Un nombre declarado (function/const/let/var) en dos archivos es una posible colisión: la última carga pisa a la anterior. No cuenta `window.x = …`, que se usa a propósito para parchar.

| Nombre | Archivos |
|---|---|
| `_diffActualizarMiCuenta` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `_diffFuentesOptsHtml` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `_difRenderHistorial` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `_validarEstructuraJSON` | `js/modules/configuracion.js`, `js/modules/import-validado.js` |
| `crearSplitWidget` | `js/core/split.js`, `js/modules/split.js` |
| `diffAddParte` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffAplicar` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffCalcular` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffEstaAbierto` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffHtmlBloque` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffInst` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffRegistrarInstancia` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffRemoveParte` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffRenderHistorial` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffRenderPartes` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffReset` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffResumen` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffSetCuentaEntrada` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffSetCuentaSalida` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffSetMonto` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffSetNombre` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffToggle` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffTogglePagoYo` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffValidarIntercambios` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `Loader` | `js/core/lazy-loader.js`, `js/modules/lazy-loader.js` |
| `splitAgregarRow` | `js/core/split.js`, `js/modules/split.js` |
| `splitGetData` | `js/core/split.js`, `js/modules/split.js` |
| `splitPreview` | `js/core/split.js`, `js/modules/split.js` |
| `splitToggle` | `js/core/split.js`, `js/modules/split.js` |

## 4. Índice inverso (nombre → archivo)

| Nombre | Archivo |
|---|---|
| `_abonoEncCuentaAgregarSplitRow` | `js/modules/prestado.js` |
| `_abonoEncCuentaSplitPreview` | `js/modules/prestado.js` |
| `_abonoEncCuentaSplitToggle` | `js/modules/prestado.js` |
| `_abrirConfirmarTasaNu` | `js/modules/cuentas.js` |
| `_abrirCrearPersonaGlobal` | `js/modules/personas.js` |
| `_abrirListaPersonas` | `js/modules/personas.js` |
| `_abrirMovMiDeudaPago` | `js/modules/prestado.js` |
| `_abrirMovMiDeudaRecibido` | `js/modules/prestado.js` |
| `_abrirPerfilDesdeDeudor` | `js/modules/prestado.js` |
| `_abrirPerfilDesdeDeudorActual` | `js/modules/prestado.js` |
| `_abrirPerfilDesdeMiDeuda` | `js/modules/prestado.js` |
| `_abrirPerfilDesdeMiDeudaActual` | `js/modules/prestado.js` |
| `_abrirSelPersonaSpotifyEdit` | `js/modules/spotify.js` |
| `_abrirSheetAbono` | `js/modules/prestado.js` |
| `_abrirSheetNuevaDeuda` | `js/modules/prestado.js` |
| `_abrirSheetNuevaPersona` | `js/modules/prestado.js` |
| `_abrirSheetNuevoPrestamo` | `js/modules/prestado.js` |
| `_abrirSheetPagoCompleto` | `js/modules/prestado.js` |
| `_actualizarBtnPrestamoTC` | `js/modules/prestado.js` |
| `_actualizarDiferenciaHint` | `js/modules/alcancia.js` |
| `_actualizarEncPreview` | `js/modules/prestado.js` |
| `_actualizarMasPersonasSub` | `js/modules/personas.js` |
| `_actualizarMovEncCuentaHint` | `js/modules/encargos.js` |
| `_actualizarMoverEncDestinoHint` | `js/modules/encargos.js` |
| `_actualizarMoverEncOrigenHint` | `js/modules/encargos.js` |
| `_actualizarMoverEncPreview` | `js/modules/encargos.js` |
| `_actualizarPartePreview` | `js/modules/encargos.js` |
| `_actualizarTransfEncPreview` | `js/modules/encargos.js` |
| `_actualizarTraspasoHint` | `js/modules/encargos.js` |
| `_actualizarTraspasoOrigenHint` | `js/modules/encargos.js` |
| `_actualizarTraspasoPreview` | `js/modules/encargos.js` |
| `_alcanciaEjecutarEliminarDeposito` | `js/modules/alcancia.js` |
| `_alcanciaInit` | `js/modules/alcancia.js` |
| `_alcanciaQuitarPorCobroDeuda` | `js/modules/alcancia.js` (window._alcanciaQuitarPorCobroDeuda = …) |
| `_alcanciaToggleDesglose` | `js/modules/alcancia.js` |
| `_alcDecode` | `js/modules/alcancia.js` |
| `_alcDesgloseHtml` | `js/modules/alcancia.js` |
| `_alcDeudorSaldoHintActualizar` | `js/modules/alcancia.js` |
| `_alcDeudorSelActualizar` | `js/modules/alcancia.js` |
| `_alcEncode` | `js/modules/alcancia.js` |
| `_alcFiltrarFuentesPorSaldo` | `js/modules/alcancia.js` |
| `_alcInitMoneyInput` | `js/modules/alcancia.js` |
| `_alcMejorCiclo` | `js/modules/alcancia.js` |
| `_alcNombreFuente` | `js/modules/alcancia.js` |
| `_alcOrigenActualizar` | `js/modules/alcancia.js` |
| `_alcOrigenOptsHtml` | `js/modules/alcancia.js` |
| `_alcParteDesdeValor` | `js/modules/alcancia.js` |
| `_alcRachaAhorro` | `js/modules/alcancia.js` |
| `_alcSplitPreview` | `js/modules/alcancia.js` |
| `_alcWrappedBarrasSvg` | `js/modules/alcancia.js` |
| `_alcWrappedProgresoHtml` | `js/modules/alcancia.js` |
| `_aperturaToggleUI` | `js/modules/cuentas.js` |
| `_autoCerrarGruposEnCero` | `js/modules/prestado.js` |
| `_autoGrupoIdMov` | `js/modules/prestado.js` |
| `_borrarMesadaPago` | `js/modules/mesada.js` |
| `_borrarMovSecundarioMesada` | `js/modules/mesada.js` |
| `_borrarSpHistorial` | `js/modules/spotify.js` |
| `_cajitaDetDelete` | `js/modules/cuentas.js` |
| `_calcCDTSafe` | `js/core/core-state.js` |
| `_calcCSafe` | `js/core/core-state.js` |
| `_calcPrestadoMeta` | `js/modules/cuentas.js` |
| `_cancelarCobrarCDT` | `js/modules/cuentas.js` |
| `_checkGastoAlto` | `js/modules/inicio.js` |
| `_closeDialog` | `js/core/core-state.js` |
| `_confirmarMoverEncCuentasSplit` | `js/modules/encargos.js` |
| `_confirmarMovimientoConGuard` | `js/modules/prestado.js` |
| `_confirmarUsarParte` | `js/modules/encargos.js` |
| `_cpAbrirEditar` | `js/modules/plata_comprometida.js` |
| `_cpAbrirNuevo` | `js/modules/plata_comprometida.js` |
| `_cpAbrirRecibir` | `js/modules/plata_comprometida.js` |
| `_cpAgregarDestino` | `js/modules/plata_comprometida.js` |
| `_cpCancelSheet` | `js/modules/plata_comprometida.js` |
| `_cpConfirmarRecibir` | `js/modules/plata_comprometida.js` |
| `_cpData` | `js/modules/plata_comprometida.js` |
| `_cpdConfirmar` | `js/modules/plata_comprometida.js` |
| `_cpDiasHastaStr` | `js/modules/plata_comprometida.js` |
| `_cpdPoblarGastoSelectores` | `js/modules/plata_comprometida.js` |
| `_cpdSetGastoOrigen` | `js/modules/plata_comprometida.js` |
| `_cpdSetTipo` | `js/modules/plata_comprometida.js` |
| `_cpdSetYaPague` | `js/modules/plata_comprometida.js` |
| `_cpdSetYaSaque` | `js/modules/plata_comprometida.js` |
| `_cpdTipoChange` | `js/modules/plata_comprometida.js` |
| `_cpEliminar` | `js/modules/plata_comprometida.js` |
| `_cpFuenteLabel` | `js/modules/plata_comprometida.js` |
| `_cpGuardar` | `js/modules/plata_comprometida.js` |
| `_cpGuardarMarcados` | `js/modules/plata_comprometida.js` |
| `_cpInit` | `js/modules/plata_comprometida.js` |
| `_cpInitSwipe` | `js/modules/plata_comprometida.js` |
| `_cpMarcarPagos` | `js/modules/plata_comprometida.js` |
| `_cpPoblarCuentas` | `js/modules/plata_comprometida.js` |
| `_cpPoblarPersonas` | `js/modules/plata_comprometida.js` |
| `_cpPoblarTC` | `js/modules/plata_comprometida.js` |
| `_cpQuitarDestino` | `js/modules/plata_comprometida.js` |
| `_cpRenderDestinosTmp` | `js/modules/plata_comprometida.js` |
| `_cpRenderLista` | `js/modules/plata_comprometida.js` |
| `_cpRenderMarcarList` | `js/modules/plata_comprometida.js` |
| `_cpToggleMarcar` | `js/modules/plata_comprometida.js` |
| `_crearGrupoDeudor` | `js/modules/prestado.js` |
| `_crearPersonaGlobal` | `js/modules/personas.js` |
| `_ctcActualizarCuentaEncHint` | `js/modules/encargos.js` |
| `_ctcActualizarDestinoHint` | `js/modules/encargos.js` |
| `_ctcActualizarPreview` | `js/modules/encargos.js` |
| `_ctcDifResumen` | `js/modules/encargos.js` |
| `_ctcDifToggle` | `js/modules/encargos.js` |
| `_cuentaOpsPosteriores` | `js/core/movimientos.js` |
| `_deudorCuentasDe` | `js/modules/prestado.js` |
| `_deudorOpsPosteriores` | `js/modules/prestado.js` |
| `_deudorTieneCuentaAfectada` | `js/modules/prestado.js` |
| `_dialogResolve` | `js/core/core-state.js` (window._dialogResolve = …) |
| `_diasDesde` | `js/modules/alcancia.js` |
| `_diasEntreFechas` | `js/modules/cuentas.js` |
| `_difAddBenef` | `js/modules/encargos.js` |
| `_diffActualizarMiCuenta` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `_diffFuentesOptsHtml` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `_difRemoveBenef` | `js/modules/encargos.js` |
| `_difRenderHistorial` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `_difRenderHistorialParte` | `js/modules/encargos.js` |
| `_difResumen` | `js/modules/encargos.js` |
| `_difSetCuentaEntrada` | `js/modules/encargos.js` |
| `_difSetCuentaSalida` | `js/modules/encargos.js` |
| `_difSetMonto` | `js/modules/encargos.js` |
| `_difSetNombre` | `js/modules/encargos.js` |
| `_difToggle` | `js/modules/encargos.js` |
| `_difTogglePagoYo` | `js/modules/encargos.js` |
| `_editarPersonaDesdePerfilSheet` | `js/modules/personas.js` |
| `_encAbrirSelectorPersonaNueva` | `js/modules/encargos.js` |
| `_ensureMesadas` | `js/core/calc-helpers.js` |
| `_esEntradaEspejoNoIngreso` | `js/core/core-state.js` |
| `_esGastoVarNoReal` | `js/core/core-state.js` |
| `_expandCajitaCDTs` | `js/modules/cuentas.js` |
| `_fmtTiempo` | `js/modules/alcancia.js` |
| `_fuenteLabelHtml` | `js/core/movimientos.js` |
| `_getA` | `js/modules/alcancia.js` |
| `_getAbonoDestinoFuentesOptions` | `js/modules/prestado.js` |
| `_getAbonoDestinoSplitData` | `js/modules/prestado.js` |
| `_getAbonoEncCuentaFuentesOptions` | `js/modules/prestado.js` |
| `_getAbonoEncCuentaSplitData` | `js/modules/prestado.js` |
| `_getCuotaAnio` | `js/core/calc-helpers.js` |
| `_getEncargoSaldoEnCuenta` | `js/modules/encargos.js` |
| `_getEncargoSaldoPorCuenta` | `js/modules/encargos.js` |
| `_getEncargoSaldoSinCuenta` | `js/modules/encargos.js` |
| `_getMoneyVal` | `js/modules/alcancia.js` |
| `_getMovimientosCuentaCustom` | `js/modules/cuentas.js` |
| `_getMovsFilter` | `js/modules/cuentas.js` |
| `_getNuTasaGlobalSafe` | `js/core/core-state.js` |
| `_getOrCrearHistorico` | `js/modules/prestado.js` |
| `_getPrestSplitFuentesOptions` | `js/modules/prestado.js` |
| `_getSaldoOfuscado` | `js/modules/alcancia.js` |
| `_getUsarParteFuentesOptions` | `js/modules/encargos.js` |
| `_getUsarParteSplitData` | `js/modules/encargos.js` |
| `_gruposAbiertos` | `js/modules/prestado.js` |
| `_guardarEditarPersonaGlobal` | `js/modules/personas.js` |
| `_gvDiaLabel` | `js/modules/gastos.js` |
| `_hideScreenLoading` | `js/core/sheet-stack.js` |
| `_htmlEscapeValue` | `js/core/html-tag.js` |
| `_initA` | `js/modules/alcancia.js` |
| `_initEventListeners` | `js/core/sheet-stack.js` |
| `_initGrupoSelector` | `js/modules/prestado.js` |
| `_initMoneyInput` | `js/core/money-input.js` |
| `_initMovGrupoSelector` | `js/modules/prestado.js` |
| `_initNuevaDeudaPersonaSelector` | `js/modules/prestado.js` |
| `_initNuevoEncargoPersonaSelector` | `js/modules/encargos.js` |
| `_initSpotifyEditPersonaSelector` | `js/modules/spotify.js` |
| `_initSpotifyPersonaSelector` | `js/modules/spotify.js` |
| `_injectErrorSpans` | `js/core/sheet-stack.js` |
| `_injectMasItem` | `js/modules/plata_comprometida.js` |
| `_injectScreen` | `js/modules/plata_comprometida.js` |
| `_injectSheet` | `js/modules/plata_comprometida.js` |
| `_intentarInyectarPersonaSheets` | `js/core/personas-init.js` |
| `_interpretarLecturaChequeoNu` | `js/modules/cuentas.js` |
| `_inyectarAlcanciaSheets` | `js/modules/alcancia.js` |
| `_inyectarMasMenuItem` | `js/modules/alcancia.js` |
| `_inyectarPersonaSheets` | `js/modules/personas.js` |
| `_irADeudor` | `js/modules/prestado.js` |
| `_irAEncargo` | `js/modules/encargos.js` |
| `_irAMiDeuda` | `js/modules/prestado.js` |
| `_irASpotify` | `js/modules/personas.js` |
| `_locallyModified` | `js/core/core-state.js` (window._locallyModified = …) |
| `_markError` | `js/core/sheet-stack.js` |
| `_mdPickColor` | `js/modules/prestado.js` |
| `_mesadaClavesParent` | `js/modules/mesada.js` |
| `_mesadaEncargosDelParent` | `js/modules/mesada.js` |
| `_mesadaFuentesDe` | `js/modules/mesada.js` |
| `_mesadaOpsPosteriores` | `js/modules/mesada.js` |
| `_mesadaTieneCuentaAfectada` | `js/modules/mesada.js` |
| `_mesNombreDeKey` | `js/core/calc-helpers.js` |
| `_metaAporteEliminar` | `js/modules/cuentas.js` |
| `_miDeudaCuentasDe` | `js/modules/prestado.js` |
| `_miDeudaEditColor` | `js/modules/prestado.js` (window._miDeudaEditColor = …) |
| `_miDeudaOpsPosteriores` | `js/modules/prestado.js` |
| `_miDeudaTieneCuentaAfectada` | `js/modules/prestado.js` |
| `_migrarGruposDeudor` | `js/modules/prestado.js` |
| `_moneyRender` | `js/core/core-state.js` |
| `_moneyValue` | `js/core/core-state.js` |
| `_mostrarMppDestinoNormal` | `js/modules/mesada.js` |
| `_mostrarSeccionDestinoNormal` | `js/modules/mesada.js` |
| `_movEncActualizarFaltante` | `js/modules/encargos.js` |
| `_movEncAgregarSplitRow` | `js/modules/encargos.js` |
| `_movEncConfirmarPrestarFaltante` | `js/modules/encargos.js` |
| `_movEncFaltanteCuentaHint` | `js/modules/encargos.js` |
| `_movEncGetFuentesOptions` | `js/modules/encargos.js` |
| `_movEncGetSplitData` | `js/modules/encargos.js` |
| `_movEncMiaPreview` | `js/modules/encargos.js` |
| `_movEncMiaToggle` | `js/modules/encargos.js` |
| `_movEncSplitPreview` | `js/modules/encargos.js` |
| `_movEncSplitToggle` | `js/modules/encargos.js` |
| `_moverEncAgregarSplitRow` | `js/modules/encargos.js` |
| `_moverEncGetFuentesOptions` | `js/modules/encargos.js` |
| `_moverEncGetSplitData` | `js/modules/encargos.js` |
| `_moverEncSplitPreview` | `js/modules/encargos.js` |
| `_moverEncSplitToggle` | `js/modules/encargos.js` |
| `_movEsPerdon` | `js/modules/prestado.js` |
| `_movsAplicarFiltro` | `js/modules/cuentas.js` |
| `_movsLimpiarFechas` | `js/modules/cuentas.js` |
| `_movsOnFecha` | `js/modules/cuentas.js` |
| `_movsOnSearch` | `js/modules/cuentas.js` |
| `_movsOnTipo` | `js/modules/cuentas.js` |
| `_movsRefresh` | `js/modules/cuentas.js` |
| `_movTieneEncargoVinculado` | `js/modules/prestado.js` |
| `_ndPoblarSelectDestino` | `js/modules/prestado.js` |
| `_normTxt` | `js/modules/mesada.js` |
| `_nuMovActualizarPreview` | `js/modules/cuentas.js` |
| `_nuMovRenderCajitas` | `js/modules/cuentas.js` |
| `_nuMovToggleApertura` | `js/modules/cuentas.js` |
| `_nuTotalSafe` | `js/core/core-state.js` |
| `_onClickSpEditPersonaBtn` | `js/modules/spotify.js` |
| `_onMovMontoInput` | `js/modules/prestado.js` |
| `_onSelPersonaMeDeben` | `js/modules/prestado.js` |
| `_onSelPersonaNuevaDeuda` | `js/modules/prestado.js` |
| `_onSelPersonaNuevoEncargo` | `js/modules/encargos.js` |
| `_onSelPersonaSpotify` | `js/modules/spotify.js` |
| `_onSelPersonaSpotifyEdit` | `js/modules/spotify.js` |
| `_patrimonioDependenciasListas` | `js/core/core-state.js` |
| `_poblarMpEncargoCuentas` | `js/modules/mesada.js` |
| `_poblarMppEncargoCuentas` | `js/modules/mesada.js` |
| `_prEnsureAlcancia` | `js/modules/prestado.js` |
| `_prestAddSplitRow` | `js/modules/prestado.js` |
| `_procesarDiferencial` | `js/modules/encargos.js` |
| `_procesarMovEncMia` | `js/modules/encargos.js` |
| `_procesarSiguienteCDTVencido` | `js/modules/cuentas.js` |
| `_prtcDifResumen` | `js/modules/prestado.js` |
| `_prtcDifToggle` | `js/modules/prestado.js` |
| `_refreshCajitaDet` | `js/modules/cuentas.js` |
| `_registrarMovSecundarioMesada` | `js/modules/mesada.js` |
| `_renderColorPicker` | `js/modules/personas.js` |
| `_renderDetalleCajita` | `js/modules/cuentas.js` |
| `_renderDispNetoTC` | `js/modules/inicio.js` |
| `_renderListaPersonas` | `js/modules/personas.js` |
| `_renderMetaAportes` | `js/modules/cuentas.js` |
| `_renderTasaHistorialTag` | `js/modules/cuentas.js` |
| `_rendimientoCDTaDias` | `js/modules/cuentas.js` |
| `_rerenderCuentaActiva` | `js/core/movimientos.js` |
| `_resetEncCuentaSplitToggleStyle` | `js/modules/prestado.js` |
| `_resetSheetNuevaCuenta` | `js/modules/cuentas.js` |
| `_resolverGrupoIdMov` | `js/modules/prestado.js` |
| `_resolverGrupoIdSel` | `js/modules/prestado.js` |
| `_saldoCPAjeno` | `js/core/core-state.js` |
| `_saldoEncargosEnCajita` | `js/modules/cuentas.js` |
| `_saldoEncargosEnCuenta` | `js/core/core-state.js` |
| `_saldoRegistrado` | `js/modules/alcancia.js` |
| `_salidaEncMenuIr` | `js/modules/encargos.js` |
| `_segmentosTasaNu` | `js/modules/cuentas.js` |
| `_seleccionarColorPersona` | `js/modules/personas.js` |
| `_selPersonaCrearDirecto` | `js/modules/personas.js` |
| `_selPersonaElegir` | `js/modules/personas.js` |
| `_selPersonaFiltrar` | `js/modules/personas.js` |
| `_setBtnTransferir` | `js/modules/cuentas.js` |
| `_setSaldoOfuscado` | `js/modules/alcancia.js` |
| `_showCuentasPanel` | `js/modules/cuentas.js` |
| `_showScreenLoading` | `js/core/sheet-stack.js` |
| `_sincronizarMpDestinoConEncargo` | `js/modules/mesada.js` |
| `_sincronizarMppDestinoConEncargo` | `js/modules/mesada.js` |
| `_spEnsureTC` | `js/modules/spotify.js` |
| `_spPagarSplitFuentesOpts` | `js/modules/spotify.js` |
| `_spProporcionarSplits` | `js/modules/spotify.js` |
| `_spSplitFuentesOpts` | `js/modules/spotify.js` |
| `_sumarASaldo` | `js/modules/alcancia.js` |
| `_syncMpDebeWrap` | `js/modules/mesada.js` |
| `_syncSpDebeWrap` | `js/modules/spotify.js` |
| `_tasaVigenteEnFecha` | `js/modules/cuentas.js` |
| `_tcOpsPosteriores` | `js/modules/tarjetas_credito.js` |
| `_tcPoblarSelectCajita` | `js/modules/tarjetas_credito.js` |
| `_trDestinoCambio` | `js/modules/cuentas.js` |
| `_trOrigenCambio` | `js/modules/cuentas.js` |
| `_trPodarSelect` | `js/modules/cuentas.js` |
| `_updateMetaCuotaPreview` | `js/modules/cuentas.js` |
| `_updatePrestSplitResumen` | `js/modules/prestado.js` |
| `_usarParteAddBenef` | `js/modules/encargos.js` |
| `_usarParteAgregarSplitRow` | `js/modules/encargos.js` |
| `_usarParteDifResumen` | `js/modules/encargos.js` |
| `_usarParteDifToggle` | `js/modules/encargos.js` |
| `_usarParteFuentePreview` | `js/modules/encargos.js` |
| `_usarParteRemoveBenef` | `js/modules/encargos.js` |
| `_usarParteSetMonto` | `js/modules/encargos.js` |
| `_usarParteSetNombre` | `js/modules/encargos.js` |
| `_usarParteSplitToggle` | `js/modules/encargos.js` |
| `_validarEstructuraJSON` | `js/modules/configuracion.js`, `js/modules/import-validado.js` |
| `_validarIntercambiosBenefs` | `js/modules/encargos.js` |
| `_validarMovEncMia` | `js/modules/encargos.js` |
| `_verificarIntegridadSaldoDeudor` | `js/modules/prestado.js` |
| `_volverASelPersona` | `js/modules/personas.js` |
| `_wrappedAgruparPorCategoria` | `js/modules/wrapped.js` |
| `_wrappedAlcanciaDepositosPeriodo` | `js/modules/wrapped.js` |
| `_wrappedAnimarBarras` | `js/modules/wrapped.js` |
| `_wrappedAnimarLinea` | `js/modules/wrapped.js` |
| `_wrappedAnimarNumeros` | `js/modules/wrapped.js` |
| `_wrappedAnioObjetivo` | `js/core/wrapped-gate.js` (window._wrappedAnioObjetivo = …) |
| `_wrappedAnioYMesActual` | `js/modules/wrapped.js` |
| `_wrappedBankPick` | `js/modules/wrapped.js` |
| `_wrappedBuildSlides` | `js/modules/wrapped.js` |
| `_wrappedCalcularComisionesTC` | `js/modules/wrapped.js` |
| `_wrappedCalcularComprometida` | `js/modules/wrapped.js` |
| `_wrappedCalcularEncargos` | `js/modules/wrapped.js` |
| `_wrappedCalcularInteresesTC` | `js/modules/wrapped.js` |
| `_wrappedCalcularMesada` | `js/modules/wrapped.js` |
| `_wrappedCalcularMisDeudas` | `js/modules/wrapped.js` |
| `_wrappedCalcularPeriodo` | `js/modules/wrapped.js` |
| `_wrappedCalcularPrestado` | `js/modules/wrapped.js` |
| `_wrappedCalcularSpotify` | `js/modules/wrapped.js` |
| `_wrappedCambioDeHabitos` | `js/modules/wrapped.js` |
| `_wrappedCambioFuerte` | `js/modules/wrapped.js` |
| `_wrappedCategoriaMasConcentrada` | `js/modules/wrapped.js` |
| `_wrappedCerrar` | `js/modules/wrapped.js` |
| `_wrappedComparaciones` | `js/modules/wrapped.js` |
| `_wrappedCopyAlcancia` | `js/modules/wrapped.js` |
| `_wrappedCopyCategoria` | `js/modules/wrapped.js` |
| `_wrappedCopyCierre` | `js/modules/wrapped.js` |
| `_wrappedCopyCierrePoema` | `js/modules/wrapped.js` |
| `_wrappedCopyComisionesTC` | `js/modules/wrapped.js` |
| `_wrappedCopyComprometida` | `js/modules/wrapped.js` |
| `_wrappedCopyDesgloseMes` | `js/modules/wrapped.js` |
| `_wrappedCopyEncargos` | `js/modules/wrapped.js` |
| `_wrappedCopyFases` | `js/modules/wrapped.js` |
| `_wrappedCopyGasto` | `js/modules/wrapped.js` |
| `_wrappedCopyInteresesTC` | `js/modules/wrapped.js` |
| `_wrappedCopyIntro` | `js/modules/wrapped.js` |
| `_wrappedCopyMejorMes` | `js/modules/wrapped.js` |
| `_wrappedCopyMesada` | `js/modules/wrapped.js` |
| `_wrappedCopyMeta` | `js/modules/wrapped.js` |
| `_wrappedCopyMisDeudas` | `js/modules/wrapped.js` |
| `_wrappedCopyPatrimonio` | `js/modules/wrapped.js` |
| `_wrappedCopyPeorMes` | `js/modules/wrapped.js` |
| `_wrappedCopyPrestado` | `js/modules/wrapped.js` |
| `_wrappedCopyPuente` | `js/modules/wrapped.js` |
| `_wrappedCopyRacha` | `js/modules/wrapped.js` |
| `_wrappedCopySpotify` | `js/modules/wrapped.js` |
| `_wrappedCorteMitadAnio` | `js/modules/wrapped.js` |
| `_wrappedCuotaAnioFallback` | `js/modules/wrapped.js` |
| `_wrappedDebugOn` | `js/modules/wrapped.js` |
| `_wrappedDebugPanelHtml` | `js/modules/wrapped.js` |
| `_wrappedDescubrimientos` | `js/modules/wrapped.js` |
| `_wrappedDisponible` | `js/core/wrapped-gate.js` (window._wrappedDisponible = …) |
| `_wrappedEnRango` | `js/modules/wrapped.js` |
| `_wrappedFasesAnio` | `js/modules/wrapped.js` |
| `_wrappedFechaLuceValida` | `js/modules/wrapped.js` |
| `_wrappedFmtFechaLarga` | `js/modules/wrapped.js` |
| `_wrappedFmtSigned` | `js/modules/wrapped.js` |
| `_wrappedFraseDelAnio` | `js/modules/wrapped.js` |
| `_wrappedFrasesHtml` | `js/modules/wrapped.js` |
| `_wrappedGastoMasRandom` | `js/modules/wrapped.js` |
| `_wrappedGateAplicarFila` | `js/core/wrapped-gate.js` |
| `_wrappedGateForzado` | `js/core/wrapped-gate.js` |
| `_wrappedGateHoy` | `js/core/wrapped-gate.js` |
| `_wrappedGateLocalKey` | `js/core/wrapped-gate.js` |
| `_wrappedGateMarcarVisto` | `js/core/wrapped-gate.js` |
| `_wrappedGateMostrarBanner` | `js/core/wrapped-gate.js` |
| `_wrappedGateYaVisto` | `js/core/wrapped-gate.js` |
| `_wrappedGoTo` | `js/modules/wrapped.js` |
| `_wrappedGraficoAnimadoSvg` | `js/modules/wrapped.js` |
| `_wrappedGraficoMensualSvg` | `js/modules/wrapped.js` |
| `_wrappedHashStr` | `js/modules/wrapped.js` |
| `_wrappedHistoriasMensuales` | `js/modules/wrapped.js` |
| `_wrappedHoy` | `js/modules/wrapped.js` |
| `_wrappedIngresosFijosMes` | `js/modules/wrapped.js` |
| `_wrappedIniciarBanco` | `js/modules/wrapped.js` |
| `_wrappedInicioRachaReal` | `js/modules/wrapped.js` |
| `_wrappedInternals` | `js/modules/wrapped.js` (window._wrappedInternals = …) |
| `_wrappedInyectarEstilos` | `js/modules/wrapped.js` |
| `_wrappedItemsRealesPeriodo` | `js/modules/wrapped.js` |
| `_wrappedLanzarConfeti` | `js/modules/wrapped.js` |
| `_wrappedLimpiarNav` | `js/modules/wrapped.js` |
| `_wrappedLineaMes` | `js/modules/wrapped.js` |
| `_wrappedListaCajitas` | `js/modules/wrapped.js` |
| `_wrappedLogDebug` | `js/modules/wrapped.js` |
| `_wrappedMejorPeorMesAnio` | `js/modules/wrapped.js` |
| `_wrappedMesadaMes` | `js/modules/wrapped.js` |
| `_wrappedMesDetalleHtml` | `js/modules/wrapped.js` |
| `_wrappedMesKaAbrev` | `js/modules/wrapped.js` |
| `_wrappedMesKaNombre` | `js/modules/wrapped.js` |
| `_wrappedMetaCajita` | `js/modules/wrapped.js` |
| `_wrappedNombrePersona` | `js/modules/wrapped.js` |
| `_wrappedPatrimonioAnio` | `js/modules/wrapped.js` |
| `_wrappedPeriodoEnNumeros` | `js/modules/wrapped.js` |
| `_wrappedPersonalidad` | `js/modules/wrapped.js` |
| `_wrappedPersonasInvolucradas` | `js/modules/wrapped.js` |
| `_wrappedProtagonistas` | `js/modules/wrapped.js` |
| `_wrappedRangoFechasAnio` | `js/modules/wrapped.js` |
| `_wrappedRankingCategorias` | `js/modules/wrapped.js` |
| `_wrappedRecordsAnio` | `js/modules/wrapped.js` |
| `_wrappedRecordsHtml` | `js/modules/wrapped.js` |
| `_wrappedRecuperacionMasRapida` | `js/modules/wrapped.js` |
| `_wrappedSaldosOcultos` | `js/modules/wrapped.js` |
| `_wrappedScoreInsight` | `js/modules/wrapped.js` |
| `_wrappedSeededRandom` | `js/modules/wrapped.js` |
| `_wrappedSeleccionarMes` | `js/modules/wrapped.js` |
| `_wrappedSerieMensualAnio` | `js/modules/wrapped.js` |
| `_wrappedSerieMensualIngresoGasto` | `js/modules/wrapped.js` |
| `_wrappedSetupGraficoMensual` | `js/modules/wrapped.js` |
| `_wrappedSetupNav` | `js/modules/wrapped.js` |
| `_wrappedSiTuAnioFuera` | `js/modules/wrapped.js` |
| `_wrappedSlideBignum` | `js/modules/wrapped.js` |
| `_wrappedSuscripciones` | `js/modules/wrapped.js` |
| `_wrappedTopCategoriaDe` | `js/modules/wrapped.js` |
| `_wrappedValidarDatos` | `js/modules/wrapped.js` |
| `_wrappedVentana` | `js/core/wrapped-gate.js` |
| `_wrappedVentanaInfo` | `js/core/wrapped-gate.js` (window._wrappedVentanaInfo = …) |
| `_wrappedVisible` | `js/modules/wrapped.js` |
| `abonoAddSplitRow` | `js/modules/prestado.js` |
| `abonoSplitResumen` | `js/modules/prestado.js` |
| `abrirAgregarDinero` | `js/modules/cuentas.js` |
| `abrirCargoEspecialTC` | `js/modules/tarjetas_credito.js` |
| `abrirCobrarCDT` | `js/modules/cuentas.js` |
| `abrirCompraConTC` | `js/modules/encargos.js` |
| `abrirCompraTC` | `js/modules/tarjetas_credito.js` |
| `abrirCrearCDT` | `js/modules/cuentas.js` |
| `abrirCuenta` | `js/modules/cuentas.js` |
| `abrirCustomCuenta` | `js/modules/cuentas.js` |
| `abrirDetalleCajita` | `js/modules/cuentas.js` |
| `abrirDetalleMesada` | `js/modules/mesada.js` |
| `abrirDetalleMov` | `js/core/movimientos.js` |
| `abrirDetalleTCSheet` | `js/modules/tarjetas_credito.js` |
| `abrirDeudor` | `js/modules/prestado.js` |
| `abrirEditarApertura` | `js/modules/cuentas.js` |
| `abrirEditarPersonaGlobal` | `js/modules/personas.js` |
| `abrirEditarTC` | `js/modules/tarjetas_credito.js` |
| `abrirEncargoDesdeCuenta` | `js/modules/encargos.js` |
| `abrirEncargoDetalle` | `js/modules/encargos.js` |
| `abrirMetaCajita` | `js/modules/cuentas.js` |
| `abrirMiDeuda` | `js/modules/prestado.js` |
| `abrirMovEncargo` | `js/modules/encargos.js` |
| `abrirMoverEntreCuentasEncargo` | `js/modules/encargos.js` |
| `abrirMovMiDeuda` | `js/modules/prestado.js` |
| `abrirNuevaCuenta` | `js/modules/cuentas.js` |
| `abrirNuevaParte` | `js/modules/encargos.js` |
| `abrirNuevaTarjeta` | `js/modules/tarjetas_credito.js` |
| `abrirNuevoGastoFijo` | `js/modules/gastos.js` |
| `abrirNuevoGastoVar` | `js/modules/gastos.js` |
| `abrirNuMovimiento` | `js/modules/cuentas.js` |
| `abrirPagarGastoFijo` | `js/modules/gastos.js` |
| `abrirPagarTC` | `js/modules/tarjetas_credito.js` |
| `abrirPerfilPersona` | `js/modules/personas.js` |
| `abrirPresupuestos` | `js/modules/analisis.js` |
| `abrirRegistrarApertura` | `js/modules/cuentas.js` |
| `abrirRegistrarMesada` | `js/modules/mesada.js` |
| `abrirResolverPendiente` | `js/modules/mesada.js` |
| `abrirRestarDinero` | `js/modules/cuentas.js` |
| `abrirSalidaEncargoMenu` | `js/modules/encargos.js` |
| `abrirSelPersona` | `js/modules/personas.js` |
| `abrirSheetIngresoFijo` | `js/modules/analisis.js` |
| `abrirSheetPrestamoTC` | `js/modules/prestado.js` |
| `abrirSubCDTs` | `js/modules/cuentas.js` |
| `abrirSubMeta` | `js/modules/cuentas.js` |
| `abrirTransferenciaEncargo` | `js/modules/encargos.js` |
| `abrirTransferir` | `js/modules/cuentas.js` |
| `abrirTraspasoEncargo` | `js/modules/encargos.js` |
| `abrirUsarParteSheet` | `js/modules/encargos.js` |
| `actualizarAdMenuPreview` | `js/modules/cuentas.js` |
| `actualizarAdMenuSaldo` | `js/modules/cuentas.js` |
| `actualizarBotonesTransferir` | `js/modules/cuentas.js` |
| `actualizarGvSplitPreview` | `js/modules/gastos.js` |
| `actualizarMppPreview` | `js/modules/mesada.js` |
| `actualizarMpPreview` | `js/modules/mesada.js` |
| `actualizarSpDestinoPreview` | `js/modules/spotify.js` |
| `actualizarSpPagarPreview` | `js/modules/spotify.js` |
| `actualizarSpResolverPreview` | `js/modules/spotify.js` |
| `actualizarTransfPreview` | `js/modules/cuentas.js` |
| `addCajita` | `js/modules/cuentas.js` |
| `addGastoFijo` | `js/modules/gastos.js` |
| `addGastoVar` | `js/modules/gastos.js` |
| `addSpotify` | `js/modules/spotify.js` |
| `agregarCat` | `js/modules/configuracion.js` |
| `agregarGvSplitRow` | `js/modules/gastos.js` |
| `agregarMpSplitRow` | `js/modules/mesada.js` |
| `agregarSpCobSplitRow` | `js/modules/spotify.js` |
| `agregarSpPagarSplitRow` | `js/modules/spotify.js` |
| `alcanciaAgregarOrigen` | `js/modules/alcancia.js` (window.alcanciaAgregarOrigen = …) |
| `alcanciaConfirmarDeposito` | `js/modules/alcancia.js` (window.alcanciaConfirmarDeposito = …) |
| `alcanciaConfirmarDestapar` | `js/modules/alcancia.js` (window.alcanciaConfirmarDestapar = …) |
| `alcanciaEliminarDeposito` | `js/modules/alcancia.js` (window.alcanciaEliminarDeposito = …) |
| `alcanciaIniciarNueva` | `js/modules/alcancia.js` (window.alcanciaIniciarNueva = …) |
| `alcanciaToggleDividir` | `js/modules/alcancia.js` (window.alcanciaToggleDividir = …) |
| `alcanciaToggleMontoDeposito` | `js/modules/alcancia.js` (window.alcanciaToggleMontoDeposito = …) |
| `applyModulos` | `js/core/sheet-stack.js` |
| `avisarMovimientoBloqueado` | `js/core/core-state.js` |
| `borrarTodo` | `js/modules/configuracion.js` |
| `buildFuentesOptsHtml` | `js/core/core-state.js` |
| `calcC` | `js/modules/cuentas.js` |
| `calcCDT` | `js/modules/cuentas.js` |
| `calcDeudaAjenaDeTarjeta` | `js/core/core-state.js` |
| `calcDeudaTcPropia` | `js/core/core-state.js` |
| `calcDeudaTcPropiaDeTarjeta` | `js/core/core-state.js` |
| `calcHealthScore` | `js/modules/inicio.js` |
| `calcMetaProgreso` | `js/modules/cuentas.js` |
| `calcPatrimonioTotal` | `js/core/core-state.js` |
| `calcRendimientoCDTMes` | `js/modules/cuentas.js` |
| `calcRendimientoCDTsMes` | `js/modules/cuentas.js` |
| `calcSaldoInicialPendiente` | `js/core/core-state.js` |
| `calcularSerieTasaImplicitaNu` | `js/modules/cuentas.js` |
| `cambiarAnio` | `js/modules/mesada.js` |
| `cambiarTabPrestamos` | `js/modules/prestado.js` |
| `CATS_FIJO_DEFAULT` | `js/core/core-state.js` |
| `CATS_VAR_DEFAULT` | `js/core/core-state.js` |
| `cerrarPartSheet` | `js/modules/encargos.js` |
| `clickMesDot` | `js/modules/mesada.js` |
| `closeSheet` | `js/core/sheet-stack.js` |
| `closeSwipeSheet` | `js/modules/alcancia.js` |
| `confirmarAgregarDinero` | `js/modules/cuentas.js` |
| `confirmarAgregarDineroMenu` | `js/modules/cuentas.js` |
| `confirmarBorrarMovimientoViejo` | `js/core/core-state.js` |
| `confirmarCambioTasaNu` | `js/modules/cuentas.js` |
| `confirmarCargoEspecialTC` | `js/modules/tarjetas_credito.js` |
| `confirmarCobrarCDT` | `js/modules/cuentas.js` |
| `confirmarCompraConTC` | `js/modules/encargos.js` |
| `confirmarCompraTC` | `js/modules/tarjetas_credito.js` |
| `confirmarCrearCDT` | `js/modules/cuentas.js` |
| `confirmarEditarApertura` | `js/modules/cuentas.js` |
| `confirmarMesadaPago` | `js/modules/mesada.js` |
| `confirmarMovEncargo` | `js/modules/encargos.js` |
| `confirmarMoverEncCuentas` | `js/modules/encargos.js` |
| `confirmarMovimiento` | `js/modules/prestado.js` |
| `confirmarMovMiDeuda` | `js/modules/prestado.js` |
| `confirmarNuMovimiento` | `js/modules/cuentas.js` |
| `confirmarPagarGastoFijo` | `js/modules/gastos.js` |
| `confirmarPagarSpotify` | `js/modules/spotify.js` |
| `confirmarPagarTC` | `js/modules/tarjetas_credito.js` |
| `confirmarPendienteMesada` | `js/modules/mesada.js` |
| `confirmarPrestamoTC` | `js/modules/prestado.js` |
| `confirmarRestarDinero` | `js/modules/cuentas.js` |
| `confirmarSpDestino` | `js/modules/spotify.js` |
| `confirmarSpResolverPendiente` | `js/modules/spotify.js` |
| `confirmarTransferenciaEncargo` | `js/modules/encargos.js` |
| `confirmarTransferir` | `js/modules/cuentas.js` |
| `confirmarTraspasoEncargo` | `js/modules/encargos.js` |
| `corregirChequeoNu` | `js/modules/cuentas.js` |
| `crearCuentaCustom` | `js/modules/cuentas.js` |
| `crearEncargo` | `js/modules/encargos.js` |
| `crearMiDeuda` | `js/modules/prestado.js` |
| `crearMovimientoApertura` | `js/core/core-state.js` |
| `crearSplitWidget` | `js/core/split.js`, `js/modules/split.js` |
| `debounceSave` | `js/core/core-state.js` |
| `deleteCajita` | `js/modules/cuentas.js` |
| `deleteGastoFijo` | `js/modules/gastos.js` |
| `deleteGastoVar` | `js/modules/gastos.js` |
| `deleteMovEncargo` | `js/modules/encargos.js` |
| `deleteSpHistorial` | `js/modules/spotify.js` |
| `deleteSpotify` | `js/modules/spotify.js` |
| `descontarFuente` | `js/core/core-state.js` |
| `deshacerAbonoPendienteSp` | `js/modules/spotify.js` |
| `deshacerPendienteMesada` | `js/modules/mesada.js` |
| `dialogo` | `js/core/core-state.js` |
| `diffAddParte` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffAplicar` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffCalcular` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffEstaAbierto` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffHtmlBloque` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffInst` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffRegistrarInstancia` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffRemoveParte` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffRenderHistorial` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffRenderPartes` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffReset` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffResumen` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffSetCuentaEntrada` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffSetCuentaSalida` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffSetMonto` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffSetNombre` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffToggle` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffTogglePagoYo` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `diffValidarIntercambios` | `js/core/diferencial.js`, `js/modules/diferencial.js` |
| `editarCDT` | `js/modules/cuentas.js` |
| `editarCuentaCustom` | `js/modules/cuentas.js` |
| `editarDeudorActual` | `js/modules/prestado.js` |
| `editarEncargoActual` | `js/modules/encargos.js` |
| `editarIngresoFijo` | `js/modules/analisis.js` |
| `editarMiDeudaActual` | `js/modules/prestado.js` |
| `editarParte` | `js/modules/encargos.js` |
| `editarSpotify` | `js/modules/spotify.js` |
| `eliminarCat` | `js/modules/configuracion.js` |
| `eliminarCompraTC` | `js/modules/tarjetas_credito.js` |
| `eliminarCuentaCustom` | `js/modules/cuentas.js` |
| `eliminarDeudorActual` | `js/modules/prestado.js` |
| `eliminarEncargoActual` | `js/modules/encargos.js` |
| `eliminarIngresoFijo` | `js/modules/analisis.js` |
| `eliminarMesadaPago` | `js/modules/mesada.js` |
| `eliminarMiDeuda` | `js/modules/prestado.js` |
| `eliminarMovDeudor` | `js/modules/prestado.js` |
| `eliminarMovimiento` | `js/core/movimientos.js` |
| `eliminarMovMiDeuda` | `js/modules/prestado.js` |
| `eliminarPagoTC` | `js/modules/tarjetas_credito.js` |
| `eliminarParte` | `js/modules/encargos.js` |
| `eliminarTC` | `js/modules/tarjetas_credito.js` |
| `emptyState` | `js/core/core-state.js` |
| `encargoComprometido` | `js/modules/encargos.js` |
| `encargoLibre` | `js/modules/encargos.js` |
| `encargoSaldo` | `js/modules/encargos.js` |
| `escHtml` | `js/core/core-state.js` |
| `escHtml2` | `js/modules/wrapped.js` |
| `Events` | `js/core/events.js` |
| `exportarCSV` | `js/modules/configuracion.js` |
| `exportarJSON` | `js/modules/configuracion.js` |
| `extAddParte` | `js/modules/prestado.js` |
| `extDelParte` | `js/modules/prestado.js` |
| `extRenderPartes` | `js/modules/prestado.js` |
| `extResumenPartes` | `js/modules/prestado.js` |
| `extSetCuenta` | `js/modules/prestado.js` |
| `extSetDesc` | `js/modules/prestado.js` |
| `extSetMonto` | `js/modules/prestado.js` |
| `extSetQuien` | `js/modules/prestado.js` |
| `extSetTipo` | `js/modules/prestado.js` |
| `fmt` | `js/core/core-state.js` |
| `fmtInput` | `js/core/core-state.js` |
| `fmtNoCents` | `js/core/core-state.js` |
| `fuenteBadgeClass` | `js/core/core-state.js` |
| `fuenteLabel` | `js/core/core-state.js` |
| `fuenteLabel2` | `js/modules/prestado.js` |
| `FuentesFiltro` | `js/core/fuentes-filtro.js` |
| `gastosMes` | `js/core/core-state.js` |
| `getAperturaMov` | `js/modules/cuentas.js` |
| `getCajitaNombre` | `js/modules/encargos.js` |
| `getCatsFijo` | `js/core/core-state.js` |
| `getCatsVar` | `js/core/core-state.js` |
| `getDeudorSaldo` | `js/core/calc-helpers.js` |
| `getDeudorSaldoPatrimonio` | `js/modules/prestado.js` |
| `getEncargo` | `js/modules/encargos.js` |
| `getFuentes` | `js/core/core-state.js` |
| `getFuentesOptions` | `js/modules/mesada.js` |
| `getFuentesSinTC` | `js/core/core-state.js` |
| `getGrupoSaldo` | `js/modules/prestado.js` |
| `getGvSplitData` | `js/modules/gastos.js` |
| `getGvSplitFuentesOptions` | `js/modules/gastos.js` |
| `getIconoData` | `js/modules/cuentas.js` |
| `getIngresosFijosMes` | `js/core/core-state.js` |
| `getMesadaData` | `js/core/calc-helpers.js` |
| `getMiDeudaSaldo` | `js/modules/prestado.js` |
| `getMontoPadre` | `js/modules/mesada.js` |
| `getMovimientosCuenta` | `js/modules/cuentas.js` |
| `getMpSplitData` | `js/modules/mesada.js` |
| `getNuTasaGlobal` | `js/modules/cuentas.js` |
| `getPersona` | `js/modules/personas.js` |
| `getPersonaColor` | `js/modules/personas.js` |
| `getPersonaDatos` | `js/modules/personas.js` |
| `getPersonaNombre` | `js/modules/personas.js` |
| `getSaldoFuente` | `js/core/core-state.js` |
| `getSpCajita` | `js/modules/spotify.js` |
| `getSpCajitaSaldo` | `js/modules/spotify.js` |
| `getSpCobSplitData` | `js/modules/spotify.js` |
| `getSpPagarSplitData` | `js/modules/spotify.js` |
| `getTCById` | `js/core/calc-helpers.js` |
| `guardarCDT` | `js/modules/cuentas.js` |
| `guardarChequeoNu` | `js/modules/cuentas.js` |
| `guardarEditarEncargo` | `js/modules/encargos.js` |
| `guardarEditarMiDeuda` | `js/modules/prestado.js` |
| `guardarEditarSpotify` | `js/modules/spotify.js` |
| `guardarIngresoFijo` | `js/modules/analisis.js` |
| `guardarMetaCajita` | `js/modules/cuentas.js` |
| `guardarParte` | `js/modules/encargos.js` |
| `guardarTC` | `js/modules/tarjetas_credito.js` |
| `hexToRgb` | `js/modules/cuentas.js` |
| `hookGlobal` | `js/core/hook-global.js` |
| `hoy` | `js/core/core-state.js` |
| `html` | `js/core/html-tag.js` |
| `ICONOS_CUENTA` | `js/modules/cuentas.js` |
| `importarJSON` | `js/modules/configuracion.js` |
| `iniciales` | `js/core/bootstrap.js` |
| `initMovSheet` | `js/modules/prestado.js` |
| `leerArchivoImport` | `js/modules/configuracion.js` |
| `liberarCDTManual` | `js/modules/cuentas.js` |
| `load` | `js/core/core-state.js` |
| `Loader` | `js/core/lazy-loader.js`, `js/modules/lazy-loader.js` |
| `marcarColorSeleccionado` | `js/core/color-picker.js` |
| `marcarMesadaComoPendiente` | `js/modules/mesada.js` |
| `marcarPagoSpotify` | `js/modules/spotify.js` |
| `markDirty` | `js/core/sheet-stack.js` |
| `materializarIntereses` | `js/modules/cuentas.js` |
| `MAX` | `js/core/core-state.js` |
| `MC` | `js/core/core-state.js` |
| `medirAnchoTexto` | `js/core/core-state.js` |
| `mesActual` | `js/core/core-state.js` |
| `mesKey` | `js/core/core-state.js` |
| `mostrarAlertaFuente` | `js/core/sheet-stack.js` |
| `nextMonthFixed` | `js/modules/spotify.js` |
| `nivelAntiguedadMovimiento` | `js/core/core-state.js` |
| `nuTotal` | `js/modules/cuentas.js` |
| `onChangeMov_enc_cuenta` | `js/modules/prestado.js` |
| `onChangeMov_enc_sel` | `js/modules/prestado.js` |
| `openSheet` | `js/core/sheet-stack.js` |
| `openSheet_adMenu` | `js/modules/cuentas.js` |
| `openSheet_pagarSpotify` | `js/modules/spotify.js` |
| `parseMoney` | `js/core/core-state.js` |
| `parsePct` | `js/core/core-state.js` |
| `PERSONA_COLORES` | `js/modules/personas.js` |
| `PERSONA_COLORES_MD` | `js/modules/prestado.js` |
| `pgfActualizarSaldo` | `js/modules/gastos.js` |
| `pintarAvatarPersona` | `js/core/core-state.js` |
| `poblarCatSelect` | `js/core/core-state.js` |
| `poblarChequeoNu` | `js/modules/cuentas.js` |
| `poblarFuente` | `js/core/core-state.js` |
| `ptcActualizarPreview` | `js/modules/tarjetas_credito.js` |
| `ptcSetMonto` | `js/modules/tarjetas_credito.js` |
| `quitarMetaCajita` | `js/modules/cuentas.js` |
| `raw` | `js/core/html-tag.js` |
| `refresh` | `js/core/core-state.js`, `js/modules/inicio.js` (window.refresh = …) |
| `registrarEntradaConApertura` | `js/modules/cuentas.js` |
| `registrarSalida` | `js/modules/cuentas.js` |
| `registrarTasaNuHistorial` | `js/modules/cuentas.js` |
| `renderAlcancia` | `js/modules/alcancia.js` (window.renderAlcancia = …) |
| `renderAnalisis` | `js/modules/analisis.js` |
| `renderAttencion` | `js/modules/inicio.js` |
| `renderBannerApertura` | `js/modules/cuentas.js` |
| `renderCajitas` | `js/modules/cuentas.js` |
| `renderCatsConfig` | `js/modules/configuracion.js` |
| `renderCustomCuentasList` | `js/modules/cuentas.js` |
| `renderDetalleCuenta` | `js/modules/cuentas.js` |
| `renderDeudoresList` | `js/modules/prestado.js` |
| `renderEncargoParts` | `js/modules/encargos.js` |
| `renderEncargosEnCuenta` | `js/modules/encargos.js` |
| `renderEncargosList` | `js/modules/encargos.js` |
| `renderGastosFijos` | `js/modules/gastos.js` |
| `renderGastosVar` | `js/modules/gastos.js` |
| `renderHealthScore` | `js/modules/inicio.js` |
| `renderIconGrid` | `js/modules/cuentas.js` |
| `renderIconoCustom` | `js/modules/cuentas.js` |
| `renderIngresosFijos` | `js/modules/analisis.js` |
| `renderMesada` | `js/modules/mesada.js` |
| `renderMesFiltros` | `js/modules/gastos.js` |
| `renderMetaProgress` | `js/modules/cuentas.js` |
| `renderMisDeudasList` | `js/modules/prestado.js` |
| `renderMovsCuenta` | `js/modules/cuentas.js` |
| `renderMovsCustom` | `js/modules/cuentas.js` |
| `renderMovsFiltros` | `js/modules/cuentas.js` |
| `renderPresupuestos` | `js/modules/analisis.js` |
| `renderProyeccion` | `js/modules/inicio.js` |
| `renderSpHistorial` | `js/modules/spotify.js` |
| `renderSpotify` | `js/modules/spotify.js` |
| `renderSpStats` | `js/modules/spotify.js` |
| `renderTCDashboard` | `js/modules/tarjetas_credito.js` |
| `renderTCScreen` | `js/modules/tarjetas_credito.js` |
| `renderWrapped` | `js/modules/wrapped.js` (window.renderWrapped = …) |
| `resolverPendienteSpHistorial` | `js/modules/spotify.js` |
| `S` | `js/core/core-state.js` |
| `save` | `js/core/core-state.js` |
| `saveAndRefresh` | `js/core/sheet-stack.js` |
| `selColorNC` | `js/modules/cuentas.js` |
| `selIconoNC` | `js/modules/cuentas.js` |
| `selSpMeses` | `js/modules/spotify.js` |
| `setMesFiltro` | `js/modules/gastos.js` |
| `showScreen` | `js/core/sheet-stack.js` |
| `snapshotPatrimonio` | `js/core/core-state.js` |
| `SP_EMPATE_PERIODOS` | `js/modules/spotify.js` |
| `SP_PERIODO_DIAS` | `js/modules/spotify.js` |
| `spAsignarPeriodos` | `js/modules/spotify.js` |
| `spCicloCobrosActual` | `js/modules/spotify.js` |
| `spCobradoDePersona` | `js/modules/spotify.js` |
| `splitActualizarBotones` | `js/core/split.js` |
| `splitActualizarOpciones` | `js/core/split.js` |
| `splitAgregarRow` | `js/core/split.js`, `js/modules/split.js` |
| `splitGetData` | `js/core/split.js`, `js/modules/split.js` |
| `splitOpcionesUsadas` | `js/core/split.js` |
| `splitPreview` | `js/core/split.js`, `js/modules/split.js` |
| `splitToggle` | `js/core/split.js`, `js/modules/split.js` |
| `spMontoAntesDe` | `js/modules/spotify.js` |
| `spNombreDe` | `js/core/calc-helpers.js` |
| `spPeriodosVencidos` | `js/modules/spotify.js` |
| `spPersonaPagadaVigente` | `js/core/calc-helpers.js` |
| `spResumenCicloActual` | `js/modules/spotify.js` |
| `spSumarDias` | `js/modules/spotify.js` |
| `spTramosDeCobro` | `js/modules/spotify.js` |
| `sumarFuente` | `js/core/core-state.js` |
| `switchGastoTab` | `js/modules/gastos.js` |
| `TC_ESTADOS` | `js/modules/tarjetas_credito.js` |
| `TC_MOTIVOS_CARGO` | `js/modules/tarjetas_credito.js` |
| `tcBuscarCompraPorIdOMatch` | `js/modules/tarjetas_credito.js` |
| `tcCrearCompra` | `js/modules/tarjetas_credito.js` |
| `tcCrearPago` | `js/modules/tarjetas_credito.js` |
| `tcCupoDisponible` | `js/core/calc-helpers.js` |
| `tcCupoUsadoPct` | `js/core/calc-helpers.js` |
| `tcDeudaTotal` | `js/modules/tarjetas_credito.js` |
| `tcEliminarCompraInterna` | `js/modules/tarjetas_credito.js` |
| `tcEliminarPagoInterna` | `js/modules/tarjetas_credito.js` |
| `tcEstadoInfo` | `js/modules/tarjetas_credito.js` |
| `tcNormalizarTarjetas` | `js/modules/tarjetas_credito.js` |
| `tcRecalcular` | `js/modules/tarjetas_credito.js` |
| `tcSelColor` | `js/modules/tarjetas_credito.js` |
| `toast` | `js/core/core-state.js` |
| `toggleAbonoSplit` | `js/modules/prestado.js` |
| `toggleAdApertura` | `js/modules/cuentas.js` |
| `toggleCajita` | `js/modules/cuentas.js` |
| `toggleCDT` | `js/modules/cuentas.js` |
| `toggleDesdeEncargo` | `js/modules/prestado.js` |
| `toggleExtraSection` | `js/modules/prestado.js` |
| `toggleGvSplit` | `js/modules/gastos.js` |
| `toggleMetaMinWrap` | `js/modules/cuentas.js` |
| `toggleModulo` | `js/modules/configuracion.js` |
| `toggleMovPerdon` | `js/modules/prestado.js` |
| `toggleMpSplit` | `js/modules/mesada.js` |
| `togglePrestSplit` | `js/modules/prestado.js` |
| `toggleSpCobSplit` | `js/modules/spotify.js` |
| `toggleSpPagarSplit` | `js/modules/spotify.js` |
| `totalMisDeudasPendiente` | `js/modules/prestado.js` |
| `totalPrestadoPendiente` | `js/modules/prestado.js` |
| `uid` | `js/core/core-state.js` |
| `usarParte` | `js/modules/encargos.js` |
| `verificarTasaNu` | `js/modules/cuentas.js` |
| `verificarVencimientosCDT` | `js/modules/cuentas.js` |
| `volverADetalleCajita` | `js/modules/cuentas.js` |
| `volverANu` | `js/modules/cuentas.js` |
| `volverDeudores` | `js/modules/prestado.js` |
| `volverEncargosLista` | `js/modules/encargos.js` |
| `volverMisDeudas` | `js/modules/prestado.js` |
| `volverSelector` | `js/modules/cuentas.js` |
| `waitFor` | `js/core/wait-for.js` |
| `WRAPPED_MAX_INSIGHTS_POOL` | `js/modules/wrapped.js` |
| `WRAPPED_VENTANA_DIAS` | `js/core/wrapped-gate.js` |
