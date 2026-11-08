# Mapa de código — mis-finanzas

> **Archivo generado — no editar a mano.** Se regenera con `node scripts/generar-mapa.js` (y `--check` en CI lo verifica). Sirve para saber **qué archivo mirar**, no qué hace cada función: el comportamiento real siempre está en el código. Reglas y advertencias escritas a mano: [`arquitectura-archivos.md`](./arquitectura-archivos.md).

Lista solo declaraciones de nivel superior (funciones, y constantes/objetos globales en PascalCase o MAYÚSCULAS). No incluye funciones anidadas ni métodos de objetos. Ver los límites en la cabecera de `scripts/generar-mapa.js`.

## 1. Archivos y cómo cargan

| Archivo | Carga | Funciones | Globales |
|---|---|---|---|
| `js/core/async-css.js` | de entrada (async) | 0 | 0 |
| `js/core/bootstrap.js` | de entrada (defer) | 1 | 0 |
| `js/core/busqueda-global.js` | de entrada (defer) | 0 | 0 |
| `js/core/calc-helpers.js` | de entrada (defer) | 15 | 0 |
| `js/core/cierre.js` | lazy — grupo `cierre` | 1 | 0 |
| `js/core/cobros.js` | de entrada (defer) | 13 | 1 |
| `js/core/color-picker.js` | de entrada (defer) | 1 | 0 |
| `js/core/core-state.js` | de entrada (defer) | 115 | 14 |
| `js/core/cuenta-efectos.js` | de entrada (defer) | 3 | 0 |
| `js/core/diferencial.js` | de entrada (defer) | 22 | 0 |
| `js/core/events.js` | de entrada (defer) | 1 | 0 |
| `js/core/firebase-init.js` | de entrada (módulo ES) | 0 | 0 |
| `js/core/firebase-sync.js` | de entrada (módulo ES) | 0 | 0 |
| `js/core/fuentes-filtro.js` | de entrada (defer) | 1 | 0 |
| `js/core/gastos-fijos-progress.js` | de entrada (defer) | 0 | 0 |
| `js/core/hook-global-module.js` | sin <script>, sin grupo lazy y sin import (posible código muerto) | 0 | 0 |
| `js/core/hook-global.js` | de entrada (defer) | 1 | 0 |
| `js/core/html-tag.js` | de entrada (defer) | 3 | 0 |
| `js/core/huella.js` | lazy — grupo `cierre` | 1 | 0 |
| `js/core/lazy-loader.js` | de entrada (defer) | 1 | 0 |
| `js/core/mas-menu.js` | de entrada (defer) | 0 | 0 |
| `js/core/mejoras-adicionales.js` | de entrada (defer) | 1 | 0 |
| `js/core/money-input.js` | de entrada (defer) | 5 | 0 |
| `js/core/movimientos.js` | de entrada (defer) | 8 | 0 |
| `js/core/notificaciones-push.js` | de entrada (defer) | 1 | 0 |
| `js/core/nu-calc.js` | de entrada (defer) | 29 | 0 |
| `js/core/payload-codec.js` | módulo ES — importado por `js/core/cierre.js`, `js/core/firebase-sync.js` | 2 | 0 |
| `js/core/periodo.js` | de entrada (defer) | 1 | 0 |
| `js/core/personas-init.js` | de entrada (defer) | 1 | 0 |
| `js/core/pin-bio.js` | de entrada (módulo ES) | 0 | 0 |
| `js/core/plan-deudas.js` | de entrada (defer) | 1 | 0 |
| `js/core/reglas.js` | de entrada (defer) | 1 | 0 |
| `js/core/salud.js` | de entrada (defer) | 1 | 0 |
| `js/core/sheet-behavior.js` | de entrada (defer) | 0 | 0 |
| `js/core/sheet-stack.js` | de entrada (defer) | 13 | 0 |
| `js/core/split.js` | de entrada (defer) | 10 | 0 |
| `js/core/umbrales.js` | de entrada (defer) | 1 | 0 |
| `js/core/wait-for-module.js` | módulo ES — importado por `js/core/firebase-sync.js`, `js/core/hook-global-module.js`, `js/core/pin-bio.js` | 0 | 0 |
| `js/core/wait-for.js` | de entrada (defer) | 1 | 0 |
| `js/core/wrapped-gate.js` | de entrada (defer) | 9 | 2 |
| `js/modules/actividad_reciente.js` | lazy — grupo `historial` | 0 | 0 |
| `js/modules/alcancia.js` | lazy — grupo `alcancia` | 32 | 0 |
| `js/modules/analisis.js` | lazy — grupo `analisis` | 16 | 0 |
| `js/modules/configuracion.js` | lazy — grupo `config` | 13 | 0 |
| `js/modules/cuentas.js` | lazy — grupo `cuentas` | 78 | 2 |
| `js/modules/encargos.js` | lazy — grupo `encargos` | 83 | 0 |
| `js/modules/gastos.js` | de entrada (defer) | 25 | 0 |
| `js/modules/inicio.js` | de entrada (defer) | 28 | 1 |
| `js/modules/mesada.js` | lazy — grupo `mesada` | 57 | 1 |
| `js/modules/nu.js` | lazy — grupo `cuentas` | 62 | 0 |
| `js/modules/personas.js` | de entrada (defer) | 22 | 1 |
| `js/modules/plata_comprometida.js` | lazy — grupo `comprometida` | 33 | 0 |
| `js/modules/prestado.js` | lazy — grupo `prestamos` | 117 | 1 |
| `js/modules/spotify.js` | lazy — grupo `spotify` | 44 | 2 |
| `js/modules/tarjetas_credito.js` | lazy — grupo `tarjetas` | 31 | 2 |
| `js/modules/wrapped.js` | lazy — grupo `wrapped` | 117 | 3 |

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

**Funciones:** `_ensureMesadas`, `_getCuotaAnio`, `_mesNombreDeKey`, `Deudas`, `getDeudorSaldo`, `getMesadaData`, `getMiDeudaSaldo`, `getTCById`, `mesadaOrigenDeMovEncargo`, `spNombreDe`, `spPersonaPagadaVigente`, `tcCupoDisponible`, `tcCupoUsadoPct`, `totalMisDeudasPendiente`, `totalPrestadoPendiente`

### `js/core/cierre.js`

Carga: lazy — grupo `cierre`

**Funciones:** `Cierre`

### `js/core/cobros.js`

Carga: de entrada (defer)

**Funciones:** `_cobroEntrar`, `_cobroSacar`, `cobroAvisoMes`, `cobroBorrar`, `cobroFuentesDe`, `cobroMesTexto`, `cobroRegistrar`, `cobroRevertir`, `cobroRevertirTodos`, `cobrosDeIngresoFijo`, `ingresoFijoEsperadoEn`, `ingresoFijoEstadoMes`, `ingresoFijoPorId`

**Globales:** `COBRO_MES_RE`

### `js/core/color-picker.js`

Carga: de entrada (defer)

**Funciones:** `marcarColorSeleccionado`

### `js/core/core-state.js`

Carga: de entrada (defer)

**Funciones:** `_actualizarCierresPatrimonio`, `_ajusteAlcanciaPorFecha`, `_ajusteDeudasSinCuentaPorFecha`, `_clasePorCuenta`, `_claseValida`, `_closeDialog`, `_colorSeguro`, `_cuentasArr`, `_ensureSpotify`, `_esEntradaEspejoNoIngreso`, `_esGastoVarNoReal`, `_fechaSafe`, `_libroPata`, `_listaFuentes`, `_luminancia`, `_movsDeudaSinCuenta`, `_patrimonioDependenciasListas`, `_refreshNucleo`, `_saldoCPAjeno`, `_saldoEncargosEnCuenta`, `ajustarSaldoCuenta`, `aplicarMigraciones`, `asegurarEfectivo`, `avisarMovimientoBloqueado`, `botonEliminarFila`, `buildFuentesOptsHtml`, `cajitasDeCuenta`, `calcBienes`, `calcDeudaAjenaDeTarjeta`, `calcDeudaTcPropia`, `calcDeudaTcPropiaDeTarjeta`, `calcLiquidez`, `calcPatrimonioConBienes`, `calcPatrimonioDesglose`, `calcPatrimonioTotal`, `calcPatrimonioVisible`, `calcSaldoInicialPendiente`, `calcValorBien`, `claseEfectivaMovimiento`, `colorCuenta`, `colorLegible`, `conEstadoAislado`, `confirmarBorrarMovimientoViejo`, `crearMovimientoApertura`, `cuentaDeCajita`, `cuentasActivas`, `cuentasAhorro`, `cuentasConSaldo`, `cuentasTodas`, `debounceSave`, `descontarFuente`, `diaCreacionMov`, `dialogo`, `Dinero`, `emptyState`, `entradasIngresoReal`, `escHtml`, `esCuentaAhorro`, `esCuentaFija`, `esFuenteCuenta`, `filaMovimiento`, `fmt`, `fmtInput`, `fmtNoCents`, `fmtSaldoSelector`, `fuenteBadgeClass`, `fuenteDeCuenta`, `fuenteLabel`, `gastosMes`, `getCatsFijo`, `getCatsVar`, `getCuenta`, `getCuentaDeFuente`, `getFuentes`, `getFuentesSinTC`, `getIngresosFijosMes`, `getSaldoFuente`, `hoy`, `idDeFuenteCuenta`, `ingresosRealesDelMes`, `Libro`, `load`, `medirAnchoTexto`, `medirPatrimonioParaHistorial`, `mesActual`, `mesKey`, `mostrarSi`, `movimientosSinClase`, `nivelAntiguedadMovimiento`, `nombreCuenta`, `opcionesCuenta`, `parseMoney`, `parsePct`, `patrimonioFormulaTexto`, `pedirPinAntesDe`, `pintarAvatarPersona`, `poblarCatSelect`, `poblarFuente`, `purgarAperturaDelHistorial`, `purgarEfectoEnHistorial`, `quitarDeHistorial`, `recalcularMontoBaseHistorial`, `Refresh`, `refresh`, `registrarSonda`, `renderCuentasInicio`, `Reversibles`, `saldoCuentas`, `save`, `setMoneyInput`, `snapshotPatrimonio`, `sumarFuente`, `toast`, `uid`, `validarSalidaFuente`

**Globales:** `CATS_FIJO_DEFAULT`, `CATS_VAR_DEFAULT`, `CLASES_MOV`, `CuentaPantallas`, `FUENTE_CUENTA_PREFIJO`, `ICONO_VACIO_CUENTAS`, `MAX`, `MC`, `ME_DEBEN_ABRE`, `MIGRACIONES`, `S`, `SCHEMA_BASE`, `SCHEMA_VERSION_ACTUAL`, `TIPOS_CUENTA`

**Asigna a `window`:** `_dialogResolve`, `_locallyModified`

### `js/core/cuenta-efectos.js`

Carga: de entrada (defer)

**Funciones:** `_espejoLista`, `borrarMovEspejo`, `registrarMovEspejo`

### `js/core/diferencial.js`

Carga: de entrada (defer)

**Funciones:** `_diffActualizarMiCuenta`, `_diffFuentesOptsHtml`, `diffAddParte`, `diffAplicar`, `diffCalcular`, `diffEstaAbierto`, `diffHtmlBloque`, `diffInst`, `diffRegistrarInstancia`, `diffRemoveParte`, `diffRenderHistorial`, `diffRenderPartes`, `diffReset`, `diffResumen`, `diffSetCuentaEntrada`, `diffSetCuentaSalida`, `diffSetMonto`, `diffSetNombre`, `diffToggle`, `diffTogglePagoYo`, `diffValidarIntercambios`, `diffValidarMiCuenta`

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

Carga: sin <script>, sin grupo lazy y sin import (posible código muerto)

**Funciones:** —

### `js/core/hook-global.js`

Carga: de entrada (defer)

**Funciones:** `hookGlobal`

### `js/core/html-tag.js`

Carga: de entrada (defer)

**Funciones:** `_htmlEscapeValue`, `html`, `raw`

### `js/core/huella.js`

Carga: lazy — grupo `cierre`

**Funciones:** `Huella`

### `js/core/lazy-loader.js`

Carga: de entrada (defer)

**Funciones:** `Loader`

### `js/core/mas-menu.js`

Carga: de entrada (defer)

**Funciones:** —

### `js/core/mejoras-adicionales.js`

Carga: de entrada (defer)

**Funciones:** `mostrarAvisoNuevaVersion`

### `js/core/money-input.js`

Carga: de entrada (defer)

**Funciones:** `_milesFormatear`, `_montoAlEscribir`, `_montoCursor`, `_montoFormatear`, `parseMiles`

### `js/core/movimientos.js`

Carga: de entrada (defer)

**Funciones:** `_cuentaOpsPosteriores`, `_eliminarMovimientoImpl`, `_fuenteLabelHtml`, `_movExiste`, `_rerenderCuentaActiva`, `abrirDetalleMov`, `eliminarMovimiento`, `toggleExtraordinario`

### `js/core/notificaciones-push.js`

Carga: de entrada (defer)

**Funciones:** `activarNotificaciones`

### `js/core/nu-calc.js`

Carga: de entrada (defer)

**Funciones:** `_diasEntreFechas`, `_fechasCambioEncargoEnCajita`, `_historialTasas`, `_rendimientoCDTaDias`, `_saldoEncargosEnCajita`, `_saldoEncargosEnCajitaEnFecha`, `_segmentosTasa`, `_tasaCDT`, `_tasaVigenteEnFecha`, `ahorroAplicarTasaEscrita`, `ahorroTasaConfigurada`, `ahorroTotal`, `ahorroTotalGeneral`, `ahorroValorEsperadoCajita`, `cajitaChequeable`, `cajitaGeneraIntereses`, `cajitasChequeables`, `calcC`, `calcCDT`, `calcRendimientoCDTMes`, `calcRendimientoCDTsMes`, `cdtVencido`, `getCajitaNombre`, `getTasaCuenta`, `mejorTasaAhorro`, `rendimientoCajitaPorMes`, `tasaATexto`, `tasaDesdeTexto`, `tasaSanear`

### `js/core/payload-codec.js`

Carga: módulo ES — importado por `js/core/cierre.js`, `js/core/firebase-sync.js`

**Funciones:** `_aBase64`, `_deBase64`

### `js/core/periodo.js`

Carga: de entrada (defer)

**Funciones:** `Periodo`

### `js/core/personas-init.js`

Carga: de entrada (defer)

**Funciones:** `_intentarInyectarPersonaSheets`

### `js/core/pin-bio.js`

Carga: de entrada (módulo ES)

**Funciones:** —

### `js/core/plan-deudas.js`

Carga: de entrada (defer)

**Funciones:** `PlanDeudas`

### `js/core/reglas.js`

Carga: de entrada (defer)

**Funciones:** `Reglas`

### `js/core/salud.js`

Carga: de entrada (defer)

**Funciones:** `Salud`

### `js/core/sheet-behavior.js`

Carga: de entrada (defer)

**Funciones:** —

### `js/core/sheet-stack.js`

Carga: de entrada (defer)

**Funciones:** `_bindInputsAS`, `_hideScreenLoading`, `_initEventListeners`, `_injectErrorSpans`, `_markError`, `_showScreenLoading`, `applyModulos`, `closeSheet`, `markDirty`, `mostrarAlertaFuente`, `openSheet`, `saveAndRefresh`, `showScreen`

### `js/core/split.js`

Carga: de entrada (defer)

**Funciones:** `crearSplitWidget`, `splitActualizarBotones`, `splitActualizarOpciones`, `splitAgregarRow`, `splitCuentasValidas`, `splitGetData`, `splitOpcionesUsadas`, `splitPreview`, `splitReset`, `splitToggle`

### `js/core/umbrales.js`

Carga: de entrada (defer)

**Funciones:** `UMBRALES`

### `js/core/wait-for-module.js`

Carga: módulo ES — importado por `js/core/firebase-sync.js`, `js/core/hook-global-module.js`, `js/core/pin-bio.js`

**Funciones:** —

### `js/core/wait-for.js`

Carga: de entrada (defer)

**Funciones:** `waitFor`

### `js/core/wrapped-gate.js`

Carga: de entrada (defer)

**Funciones:** `_wrappedDatosAnio`, `_wrappedGateAplicarFila`, `_wrappedGateForzado`, `_wrappedGateHoy`, `_wrappedGateLocalKey`, `_wrappedGateMarcarVisto`, `_wrappedGateMostrarBanner`, `_wrappedGateYaVisto`, `_wrappedVentana`

**Globales:** `WRAPPED_MIN_DIAS`, `WRAPPED_VENTANA_DIAS`

**Asigna a `window`:** `_wrappedAbrir`, `_wrappedAnioObjetivo`, `_wrappedDisponible`, `_wrappedUmbrales`, `_wrappedVentanaInfo`

### `js/modules/actividad_reciente.js`

Carga: lazy — grupo `historial`

**Funciones:** —

### `js/modules/alcancia.js`

Carga: lazy — grupo `alcancia`

**Funciones:** `_actualizarDiferenciaHint`, `_alcanciaEjecutarEliminarDeposito`, `_alcanciaInit`, `_alcanciaToggleDesglose`, `_alcDecode`, `_alcDesgloseHtml`, `_alcDeudorSaldoHintActualizar`, `_alcDeudorSelActualizar`, `_alcEncode`, `_alcFiltrarFuentesPorSaldo`, `_alcMejorCiclo`, `_alcNombreFuente`, `_alcOrigenActualizar`, `_alcOrigenOptsHtml`, `_alcParteDesdeValor`, `_alcQuitarMirrorCuenta`, `_alcRachaAhorro`, `_alcSplitPreview`, `_alcWrappedBarrasSvg`, `_alcWrappedProgresoHtml`, `_diasDesde`, `_fmtTiempo`, `_getA`, `_getMoneyVal`, `_getSaldoOfuscado`, `_initA`, `_inyectarAlcanciaSheets`, `_inyectarMasMenuItem`, `_saldoRegistrado`, `_setSaldoOfuscado`, `_sumarASaldo`, `closeSwipeSheet`

**Asigna a `window`:** `_alcanciaQuitarPorCobroDeuda`, `alcanciaAgregarOrigen`, `alcanciaConfirmarDeposito`, `alcanciaConfirmarDestapar`, `alcanciaEliminarDeposito`, `alcanciaIniciarNueva`, `alcanciaToggleDividir`, `alcanciaToggleMontoDeposito`, `renderAlcancia`

### `js/modules/analisis.js`

Carga: lazy — grupo `analisis`

**Funciones:** `abrirCobroIngresoFijo`, `abrirPresupuestos`, `abrirSheetIngresoFijo`, `actualizarCbAvisoMes`, `actualizarCbPreview`, `confirmarCobroIngresoFijo`, `editarIngresoFijo`, `eliminarCobroIngresoFijo`, `eliminarIngresoFijo`, `guardarIngresoFijo`, `renderAnalisis`, `renderBienes`, `renderConciliacion`, `renderIngresosFijos`, `renderPresupuestos`, `renderSimulador`

### `js/modules/configuracion.js`

Carga: lazy — grupo `config`

**Funciones:** `_validarEstructuraJSON`, `agregarCat`, `borrarTodo`, `eliminarCat`, `eliminarWrapped`, `exportarCSV`, `exportarJSON`, `importarJSON`, `leerArchivoImport`, `renderCatsConfig`, `renderMisWrapped`, `renderTamanoDatos`, `toggleModulo`

### `js/modules/cuentas.js`

Carga: lazy — grupo `cuentas`

**Funciones:** `_accionAdministrarCuenta`, `_aperturaToggleUI`, `_cuentaSelectorHtml`, `_cuentasSelector`, `_descriptorCuenta`, `_descriptorDeCuenta`, `_encargosConSaldoEn`, `_fuentesDeCuenta`, `_getMovsFilter`, `_mostrarTipoNC`, `_motivoNoArchivar`, `_motivoSinRetiro`, `_movsAplicarFiltro`, `_movsLimpiarFechas`, `_movsOnFecha`, `_movsOnSearch`, `_movsOnTipo`, `_movsRefresh`, `_pintarAdministrarCuenta`, `_reiniciarPantallasCuenta`, `_renderDetalleSimple`, `_renderTiposNC`, `_resetSheetNuevaCuenta`, `_setBtnEstado`, `_setBtnTransferir`, `_showCuentasPanel`, `_tituloCuentaHtml`, `_trDestinoCambio`, `_trOrigenCambio`, `_trPodarSelect`, `abrirAgregarDinero`, `abrirArchivadas`, `abrirCuenta`, `abrirEditarApertura`, `abrirNuevaCuenta`, `abrirOnboarding`, `abrirRegistrarApertura`, `abrirRestarDinero`, `abrirTransferir`, `actualizarAdMenuPreview`, `actualizarAdMenuSaldo`, `actualizarBotonesTransferir`, `actualizarBotonRetirar`, `actualizarTransfPreview`, `alternarAhorroNC`, `archivarCuenta`, `confirmarAgregarDinero`, `confirmarAgregarDineroMenu`, `confirmarEditarApertura`, `confirmarRestarDinero`, `confirmarTransferir`, `crearCuenta`, `cuentaSePuedeEliminar`, `editarCuenta`, `eliminarCuenta`, `getAperturaMov`, `getIconoData`, `getMovimientosCuenta`, `hexToRgb`, `ocultarInvitacionCuentas`, `openSheet_adMenu`, `reactivarCuenta`, `registrarEntradaConApertura`, `registrarSalida`, `renderArchivadas`, `renderBannerApertura`, `renderDetalleCuenta`, `renderIconGrid`, `renderIconoCustom`, `renderMovsCuenta`, `renderMovsFiltros`, `renderSelectorCuentas`, `selColorNC`, `selIconoNC`, `selTipoNC`, `toggleAdApertura`, `validarTransferencia`, `volverSelector`

**Globales:** `ICONOS_CUENTA`, `TR_MIN_EFECTIVO`

### `js/modules/encargos.js`

Carga: lazy — grupo `encargos`

**Funciones:** `_actualizarMovEncCuentaHint`, `_actualizarMoverEncDestinoHint`, `_actualizarMoverEncOrigenHint`, `_actualizarMoverEncPreview`, `_actualizarPartePreview`, `_actualizarTransfEncPreview`, `_actualizarTraspasoHint`, `_actualizarTraspasoOrigenHint`, `_actualizarTraspasoPreview`, `_confirmarMoverEncCuentasSplit`, `_confirmarUsarParte`, `_crearSplitSobrante`, `_ctcActualizarCuentaEncHint`, `_ctcActualizarDestinoHint`, `_ctcActualizarPreview`, `_ctcMiAgregarRow`, `_ctcMiSplitToggle`, `_difMiSplitPreview`, `_difRenderHistorialParte`, `_encAbrirSelectorPersonaNueva`, `_encGrupoSplit`, `_encSplitCarrier`, `_encSplitKey`, `_getEncargoSaldoEnCuenta`, `_getEncargoSaldoPorCuenta`, `_getEncargoSaldoSinCuenta`, `_initNuevoEncargoPersonaSelector`, `_irAEncargo`, `_miaLeerCuentas`, `_miaMontoEfectivo`, `_miaResumenLado`, `_movEncActualizarFaltante`, `_movEncConfirmarPrestarFaltante`, `_movEncFaltanteCuentaHint`, `_movEncMiaPreview`, `_movEncMiaToggle`, `_movEncSplitPreview`, `_moverEncGetFuentesOptions`, `_moverEncSplitPreview`, `_moverEncSplitToggle`, `_onSelPersonaNuevoEncargo`, `_procesarDiferencial`, `_procesarMovEncMia`, `_salidaEncMenuIr`, `_usarParteFuentePreview`, `_usarParteFuentes`, `_usarParteMiAgregarRow`, `_usarParteMiSplitToggle`, `_validarMovEncMia`, `abrirCompraConTC`, `abrirEncargoDesdeCuenta`, `abrirEncargoDetalle`, `abrirMovEncargo`, `abrirMoverEntreCuentasEncargo`, `abrirNuevaParte`, `abrirNuevoEncargo`, `abrirSalidaEncargoMenu`, `abrirTransferenciaEncargo`, `abrirTraspasoEncargo`, `abrirUsarParteSheet`, `cerrarPartSheet`, `confirmarCompraConTC`, `confirmarMovEncargo`, `confirmarMoverEncCuentas`, `confirmarTransferenciaEncargo`, `confirmarTraspasoEncargo`, `crearEncargo`, `deleteMovEncargo`, `editarEncargoActual`, `editarParte`, `eliminarEncargoActual`, `eliminarParte`, `encargoComprometido`, `encargoLibre`, `encargoSaldo`, `getEncargo`, `guardarEditarEncargo`, `guardarParte`, `renderEncargoParts`, `renderEncargosEnCuenta`, `renderEncargosList`, `usarParte`, `volverEncargosLista`

### `js/modules/gastos.js`

Carga: de entrada (defer)

**Funciones:** `_bienPoblar`, `_gfPoblar`, `_gvDiaLabel`, `abrirEditarBien`, `abrirEditarGastoFijo`, `abrirNuevoGastoFijo`, `abrirNuevoGastoVar`, `abrirPagarGastoFijo`, `abrirSheetBien`, `actualizarGvImpacto`, `actualizarGvSplitPreview`, `addGastoFijo`, `addGastoVar`, `confirmarPagarGastoFijo`, `deleteGastoFijo`, `deleteGastoVar`, `eliminarBien`, `guardarBien`, `pgfActualizarSaldo`, `renderGastosFijos`, `renderGastosVar`, `renderMesFiltros`, `setMesFiltro`, `switchGastoTab`, `toggleCompraGrande`

### `js/modules/inicio.js`

Carga: de entrada (defer)

**Funciones:** `_balancePromedioReciente`, `_checkGastoAlto`, `_ctxReglas`, `_deudasPropias`, `_diasDeUso`, `_eventosCaja`, `_fechaCorta`, `_fmtMeses`, `_irADestino`, `_mesesCubiertos`, `_nivelRunway`, `_rachaDeficitRelevante`, `_renderDispNetoTC`, `_ritmosPorTercio`, `_situacion`, `_textoRunway`, `calcCalendarioCaja`, `calcEstadoHero`, `calcEstadoSituacion`, `calcHealthScore`, `calcImpactoCompra`, `calcSinBase`, `planDeudasDatos`, `renderAttencion`, `renderHealthScore`, `renderHeroEstado`, `renderPlanDeudas`, `renderProyeccion`

**Globales:** `SALUD_MAX_CONSEJOS`

### `js/modules/mesada.js`

Carga: lazy — grupo `mesada`

**Funciones:** `_crearEncargoPicker`, `_htmlMesDot`, `_mesadaAnioDeKey`, `_mesadaApiEncargos`, `_mesadaAplicarEntrada`, `_mesadaCrearSalidaEncargo`, `_mesadaEntrar`, `_mesadaMostrarError`, `_mesadaNombreCoincide`, `_mesadaQuitarSalidaEncargo`, `_mesadaSacar`, `_mesadaSumaSplits`, `_mesadaValidarEncargo`, `_msCablear`, `_msEl`, `_msFilaClickeable`, `_msOn`, `_msVal`, `_normTxt`, `_poblarDestinoMesada`, `_previewDisponible`, `_previewSplit`, `_syncMpDebeWrap`, `abrirDetalleMesada`, `abrirRegistrarMesada`, `abrirResolverPendiente`, `actualizarMpAvisoMes`, `actualizarMppPreview`, `actualizarMpPreview`, `cambiarAnio`, `clickMesDot`, `confirmarMesadaPago`, `confirmarPendienteMesada`, `deshacerPendienteMesada`, `eliminarMesadaPago`, `getFuentesOptions`, `marcarMesadaComoPendiente`, `mesadaAbonarPendiente`, `mesadaAbonosDe`, `mesadaAvisoMesPago`, `mesadaBorrarPago`, `mesadaCuentasDeEncargo`, `mesadaCuotaDeKey`, `mesadaDeshacerAbono`, `mesadaDisponibleEncargo`, `mesadaEncargosDelParent`, `mesadaEstadoMes`, `mesadaFuentesDe`, `mesadaMarcarPendiente`, `mesadaMesVencido`, `mesadaNombrePadre`, `mesadaOpsPosteriores`, `mesadaRegistrarPago`, `mesadaResumenAnio`, `mesadaRevertirAbono`, `mesadaTieneCuentaAfectada`, `renderMesada`

**Globales:** `MESADA_PADRES`

### `js/modules/nu.js`

Carga: lazy — grupo `cuentas`

**Funciones:** `_abrirConfirmarTasaNu`, `_ahorroActual`, `_ahorroActualId`, `_cajitaDetDelete`, `_cajitasAhorroActual`, `_calcPrestadoMeta`, `_cancelarCobrarCDT`, `_cdtModoSheet`, `_interpretarLecturaChequeoNu`, `_metaAporteEliminar`, `_motivoNuChequeo`, `_motivoNuMovimiento`, `_motivoNuSinCajitas`, `_motivoNuSinTasa`, `_nombreAhorro`, `_nuActualizarBotonesTransferir`, `_nuMovActualizarPreview`, `_nuMovRenderCajitas`, `_nuMovToggleApertura`, `_procesarSiguienteCDTVencido`, `_refreshCajitaDet`, `_renderDetalleCajita`, `_renderMetaAportes`, `_updateMetaCuotaPreview`, `_wireTasaInput`, `abrirChequeoNu`, `abrirCobrarCDT`, `abrirCrearCDT`, `abrirDetalleCajita`, `abrirMetaCajita`, `abrirNuMovimiento`, `abrirSubCDTs`, `abrirSubMeta`, `actualizarBotonesNu`, `addCajita`, `calcMetaProgreso`, `calcularSerieTasaImplicita`, `confirmarCambioTasaNu`, `confirmarCobrarCDT`, `confirmarCrearCDT`, `confirmarNuMovimiento`, `confirmarSheetCDT`, `corregirChequeoNu`, `deleteCajita`, `editarCDT`, `guardarCDT`, `guardarChequeoNu`, `guardarMetaCajita`, `liberarCDTManual`, `materializarIntereses`, `poblarChequeoNu`, `quitarMetaCajita`, `registrarTasaHistorial`, `renderCajitas`, `renderDetalleAhorro`, `renderMetaProgress`, `toggleMetaMinWrap`, `validarCamposCDT`, `verificarTasaAhorro`, `verificarVencimientosCDT`, `volverADetalleCajita`, `volverANu`

### `js/modules/personas.js`

Carga: de entrada (defer)

**Funciones:** `_abrirCrearPersonaGlobal`, `_abrirListaPersonas`, `_actualizarMasPersonasSub`, `_crearPersonaGlobal`, `_editarPersonaDesdePerfilSheet`, `_guardarEditarPersonaGlobal`, `_inyectarPersonaSheets`, `_irASpotify`, `_renderColorPicker`, `_renderListaPersonas`, `_seleccionarColorPersona`, `_selPersonaCrearDirecto`, `_selPersonaElegir`, `_selPersonaFiltrar`, `_volverASelPersona`, `abrirEditarPersonaGlobal`, `abrirPerfilPersona`, `abrirSelPersona`, `getPersona`, `getPersonaColor`, `getPersonaDatos`, `getPersonaNombre`

**Globales:** `PERSONA_COLORES`

### `js/modules/plata_comprometida.js`

Carga: lazy — grupo `comprometida`

**Funciones:** `_cpAbrirEditar`, `_cpAbrirNuevo`, `_cpAbrirRecibir`, `_cpAgregarDestino`, `_cpCancelSheet`, `_cpConfirmarRecibir`, `_cpData`, `_cpdConfirmar`, `_cpDiasHastaStr`, `_cpdPoblarGastoSelectores`, `_cpdSetGastoOrigen`, `_cpdSetTipo`, `_cpdSetYaPague`, `_cpdSetYaSaque`, `_cpdTipoChange`, `_cpEliminar`, `_cpFuenteLabel`, `_cpGuardar`, `_cpGuardarMarcados`, `_cpInit`, `_cpInitSwipe`, `_cpMarcarPagos`, `_cpPoblarCuentas`, `_cpPoblarPersonas`, `_cpPoblarTC`, `_cpQuitarDestino`, `_cpRenderDestinosTmp`, `_cpRenderLista`, `_cpRenderMarcarList`, `_cpToggleMarcar`, `_injectMasItem`, `_injectScreen`, `_injectSheet`

### `js/modules/prestado.js`

Carga: lazy — grupo `prestamos`

**Funciones:** `_abonoEncCuentaSplitPreview`, `_abrirMovMiDeudaPago`, `_abrirMovMiDeudaRecibido`, `_abrirPerfilDesdeDeudor`, `_abrirPerfilDesdeDeudorActual`, `_abrirPerfilDesdeMiDeuda`, `_abrirPerfilDesdeMiDeudaActual`, `_abrirSheetAbono`, `_abrirSheetNuevaDeuda`, `_abrirSheetNuevaPersona`, `_abrirSheetNuevoPrestamo`, `_abrirSheetPagoCompleto`, `_actualizarBtnPrestamoTC`, `_actualizarEncPreview`, `_aplicarAbonoEncargo`, `_aplicarAbonoNormal`, `_aplicarExtraPartes`, `_aplicarMovimiento`, `_aplicarMovMiDeuda`, `_aplicarPerdon`, `_aplicarPrestamo`, `_autoCerrarGruposEnCero`, `_autoGrupoIdMov`, `_colorDeuda`, `_confirmarMovimientoConGuard`, `_confirmarMovimientoInterno`, `_crearGrupoDeudor`, `_deudaCuentasDe`, `_deudaOpsPosteriores`, `_deudaTieneCuentaAfectada`, `_enReversion`, `_errFilaSinCuenta`, `_errMonto`, `_errSumaCuentas`, `_getOrCrearHistorico`, `_gruposAbiertos`, `_htmlHistorialPorGrupos`, `_initGrupoSelector`, `_initMovGrupoSelector`, `_irADeudor`, `_irAMiDeuda`, `_mdEl`, `_mdEsPerdon`, `_mdExtra`, `_mdPickColor`, `_mdTitulo`, `_mdTotalCuentas`, `_mostrarErrorPlan`, `_movEsPerdon`, `_movTieneEncargoVinculado`, `_onMovMontoInput`, `_onSelPersonaMeDeben`, `_onSelPersonaYoDebo`, `_optGanancia`, `_pintarEncabezadoDeuda`, `_pintarTabPrestamos`, `_planAbonoEncargo`, `_planAbonoNormal`, `_planErr`, `_planExtra`, `_planMovimiento`, `_planMovMiDeuda`, `_planPrestamo`, `_prEnsureAlcancia`, `_prestMontoSalida`, `_renderListaDeudas`, `_resetEncCuentaSplitToggleStyle`, `_resolverGrupoIdMov`, `_resolverGrupoIdSel`, `_revertirDestinoAbono`, `_revertirDestinosAbono`, `_revertirMovDeudor`, `_revertirMovDeudorImpl`, `_revertirMovMiDeuda`, `_revertirMovMiDeudaImpl`, `_updateMdSplitResumen`, `_updatePrestSplitResumen`, `_verificarIntegridadSaldoDeudor`, `abonoSplitResumen`, `abrirDeudor`, `abrirMiDeuda`, `abrirMovMiDeuda`, `abrirSheetPrestamoTC`, `cambiarTabPrestamos`, `confirmarMovimiento`, `confirmarMovMiDeuda`, `confirmarPrestamoTC`, `editarDeudorActual`, `editarMiDeudaActual`, `eliminarDeudorActual`, `eliminarMiDeuda`, `eliminarMovDeudor`, `eliminarMovMiDeuda`, `extAddParte`, `extDelParte`, `extRenderPartes`, `extResumenPartes`, `extSetCuenta`, `extSetDesc`, `extSetMonto`, `extSetQuien`, `extSetTipo`, `fuenteLabel2`, `getGrupoSaldo`, `guardarEditarMiDeuda`, `initMovSheet`, `onChangeMov_enc_cuenta`, `onChangeMov_enc_sel`, `renderDeudoresList`, `renderMisDeudasList`, `toggleDesdeEncargo`, `toggleExtraSection`, `toggleMdExtra`, `toggleMdPerdon`, `toggleMovPerdon`, `volverDeudores`, `volverMisDeudas`

**Globales:** `PERSONA_COLORES_MD`

**Asigna a `window`:** `_miDeudaEditColor`

### `js/modules/spotify.js`

Carga: lazy — grupo `spotify`

**Funciones:** `_abrirSelPersonaSpotifyEdit`, `_borrarSpHistorial`, `_initSpotifyEditPersonaSelector`, `_initSpotifyPersonaSelector`, `_onClickSpEditPersonaBtn`, `_onSelPersonaSpotify`, `_onSelPersonaSpotifyEdit`, `_spEnsureTC`, `_spExtraOpts`, `_spProporcionarSplits`, `_syncSpDebeWrap`, `_syncSpExtraWrap`, `abrirPagarSpotify`, `actualizarSpDestinoPreview`, `actualizarSpPagarPreview`, `actualizarSpResolverPreview`, `addSpotify`, `confirmarPagarSpotify`, `confirmarSpDestino`, `confirmarSpResolverPendiente`, `deleteSpHistorial`, `deleteSpotify`, `deshacerAbonoPendienteSp`, `editarSpotify`, `getSpCajita`, `getSpCajitaSaldo`, `guardarEditarSpotify`, `marcarPagoSpotify`, `nextMonthFixed`, `openSheet_pagarSpotify`, `renderSpHistorial`, `renderSpotify`, `renderSpStats`, `resolverPendienteSpHistorial`, `selSpMeses`, `spAsignarPeriodos`, `spCicloCobrosActual`, `spCobradoDePersona`, `spCostoValido`, `spMontoAntesDe`, `spPeriodosVencidos`, `spResumenCicloActual`, `spSumarDias`, `spTramosDeCobro`

**Globales:** `SP_EMPATE_PERIODOS`, `SP_PERIODO_DIAS`

### `js/modules/tarjetas_credito.js`

Carga: lazy — grupo `tarjetas`

**Funciones:** `_tcEsCargoExterno`, `_tcOpsPosteriores`, `_tcPoblarSelectCajita`, `abrirCargoEspecialTC`, `abrirCompraTC`, `abrirDetalleTCSheet`, `abrirEditarTC`, `abrirNuevaTarjeta`, `abrirPagarTC`, `confirmarCargoEspecialTC`, `confirmarCompraTC`, `confirmarPagarTC`, `eliminarCompraTC`, `eliminarPagoTC`, `eliminarTC`, `guardarTC`, `ptcActualizarPreview`, `ptcSetMonto`, `renderTCDashboard`, `renderTCScreen`, `tcBuscarCompraPorIdOMatch`, `tcCrearCompra`, `tcCrearPago`, `tcDeudaCalculada`, `tcDeudaTotal`, `tcEliminarCompraInterna`, `tcEliminarPagoInterna`, `tcEstadoInfo`, `tcNormalizarTarjetas`, `tcRecalcular`, `tcSelColor`

**Globales:** `TC_ESTADOS`, `TC_MOTIVOS_CARGO`

### `js/modules/wrapped.js`

Carga: lazy — grupo `wrapped`

**Funciones:** `_wrappedAgruparPorCategoria`, `_wrappedAlcanciaDepositosPeriodo`, `_wrappedAlGuardar`, `_wrappedAnimarBarras`, `_wrappedAnimarLinea`, `_wrappedAnimarNumeros`, `_wrappedAnioDificil`, `_wrappedAnioYMesActual`, `_wrappedBankPick`, `_wrappedBuildSlides`, `_wrappedCalcularComisionesTC`, `_wrappedCalcularComprometida`, `_wrappedCalcularEncargos`, `_wrappedCalcularInteresesTC`, `_wrappedCalcularMesada`, `_wrappedCalcularMisDeudas`, `_wrappedCalcularPeriodo`, `_wrappedCalcularPrestado`, `_wrappedCalcularSpotify`, `_wrappedCambioDeHabitos`, `_wrappedCambioFuerte`, `_wrappedCategoriaMasConcentrada`, `_wrappedCerrar`, `_wrappedColorClase`, `_wrappedComparaciones`, `_wrappedConMascara`, `_wrappedCopyAlcancia`, `_wrappedCopyCategoria`, `_wrappedCopyCierre`, `_wrappedCopyCierrePoema`, `_wrappedCopyComisionesTC`, `_wrappedCopyComprometida`, `_wrappedCopyDesgloseMes`, `_wrappedCopyEncargos`, `_wrappedCopyFases`, `_wrappedCopyGasto`, `_wrappedCopyInteresesTC`, `_wrappedCopyIntro`, `_wrappedCopyMejorMes`, `_wrappedCopyMesada`, `_wrappedCopyMeta`, `_wrappedCopyMisDeudas`, `_wrappedCopyPatrimonio`, `_wrappedCopyPeorMes`, `_wrappedCopyPrestado`, `_wrappedCopyPuente`, `_wrappedCopyRacha`, `_wrappedCopySpotify`, `_wrappedCorteMitadAnio`, `_wrappedCuotaAnioFallback`, `_wrappedDebugOn`, `_wrappedDebugPanelHtml`, `_wrappedDescubrimientos`, `_wrappedEnRango`, `_wrappedEntradasIngreso`, `_wrappedFasesAnio`, `_wrappedFechaLuceValida`, `_wrappedFmtFechaLarga`, `_wrappedFmtSigned`, `_wrappedFraseDelAnio`, `_wrappedFrasesHtml`, `_wrappedGastoMasRandom`, `_wrappedGoTo`, `_wrappedGraficoAnimadoSvg`, `_wrappedGraficoMensualSvg`, `_wrappedGuardar`, `_wrappedHashStr`, `_wrappedHistoriasMensuales`, `_wrappedHoy`, `_wrappedIngresosFijosMes`, `_wrappedIniciarBanco`, `_wrappedInicioRachaReal`, `_wrappedInyectarEstilos`, `_wrappedItemsRealesPeriodo`, `_wrappedLanzarConfeti`, `_wrappedLimpiarNav`, `_wrappedLineaMes`, `_wrappedListaCajitas`, `_wrappedLogDebug`, `_wrappedMarcarGuardado`, `_wrappedMejorPeorMesAnio`, `_wrappedMesadaMes`, `_wrappedMesDetalleHtml`, `_wrappedMesKaAbrev`, `_wrappedMesKaNombre`, `_wrappedMetaCajita`, `_wrappedNombrePersona`, `_wrappedPatrimonioAnio`, `_wrappedPeriodoEnNumeros`, `_wrappedPersonalidad`, `_wrappedPersonasInvolucradas`, `_wrappedProtagonistas`, `_wrappedRangoFechasAnio`, `_wrappedRankingCategorias`, `_wrappedRecordsAnio`, `_wrappedRecordsHtml`, `_wrappedRecuperacionMasRapida`, `_wrappedSaldosOcultos`, `_wrappedScoreInsight`, `_wrappedSeededRandom`, `_wrappedSeleccionarMes`, `_wrappedSerieMensualAnio`, `_wrappedSerieMensualIngresoGasto`, `_wrappedSetupGraficoMensual`, `_wrappedSetupNav`, `_wrappedSinMascara`, `_wrappedSiTuAnioFuera`, `_wrappedSlideBignum`, `_wrappedSlidesDeSnapshot`, `_wrappedSlidesInsuficiente`, `_wrappedSnapshotDe`, `_wrappedSpotifyMes`, `_wrappedSuscripciones`, `_wrappedTopCategoriaDe`, `_wrappedValidarDatos`, `_wrappedVisible`, `escHtml2`

**Globales:** `WRAPPED_BANCO_INSUFICIENTE`, `WRAPPED_MAX_INSIGHTS_POOL`, `WRAPPED_SNAPSHOT_VERSION`

**Asigna a `window`:** `_wrappedInternals`, `renderWrapped`

## 3. Nombres declarados en más de un archivo

Ninguno.

## 4. Índice inverso (nombre → archivo)

| Nombre | Archivo |
|---|---|
| `_aBase64` | `js/core/payload-codec.js` |
| `_abonoEncCuentaSplitPreview` | `js/modules/prestado.js` |
| `_abrirConfirmarTasaNu` | `js/modules/nu.js` |
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
| `_accionAdministrarCuenta` | `js/modules/cuentas.js` |
| `_actualizarBtnPrestamoTC` | `js/modules/prestado.js` |
| `_actualizarCierresPatrimonio` | `js/core/core-state.js` |
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
| `_ahorroActual` | `js/modules/nu.js` |
| `_ahorroActualId` | `js/modules/nu.js` |
| `_ajusteAlcanciaPorFecha` | `js/core/core-state.js` |
| `_ajusteDeudasSinCuentaPorFecha` | `js/core/core-state.js` |
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
| `_alcMejorCiclo` | `js/modules/alcancia.js` |
| `_alcNombreFuente` | `js/modules/alcancia.js` |
| `_alcOrigenActualizar` | `js/modules/alcancia.js` |
| `_alcOrigenOptsHtml` | `js/modules/alcancia.js` |
| `_alcParteDesdeValor` | `js/modules/alcancia.js` |
| `_alcQuitarMirrorCuenta` | `js/modules/alcancia.js` |
| `_alcRachaAhorro` | `js/modules/alcancia.js` |
| `_alcSplitPreview` | `js/modules/alcancia.js` |
| `_alcWrappedBarrasSvg` | `js/modules/alcancia.js` |
| `_alcWrappedProgresoHtml` | `js/modules/alcancia.js` |
| `_aperturaToggleUI` | `js/modules/cuentas.js` |
| `_aplicarAbonoEncargo` | `js/modules/prestado.js` |
| `_aplicarAbonoNormal` | `js/modules/prestado.js` |
| `_aplicarExtraPartes` | `js/modules/prestado.js` |
| `_aplicarMovimiento` | `js/modules/prestado.js` |
| `_aplicarMovMiDeuda` | `js/modules/prestado.js` |
| `_aplicarPerdon` | `js/modules/prestado.js` |
| `_aplicarPrestamo` | `js/modules/prestado.js` |
| `_autoCerrarGruposEnCero` | `js/modules/prestado.js` |
| `_autoGrupoIdMov` | `js/modules/prestado.js` |
| `_balancePromedioReciente` | `js/modules/inicio.js` |
| `_bienPoblar` | `js/modules/gastos.js` |
| `_bindInputsAS` | `js/core/sheet-stack.js` |
| `_borrarSpHistorial` | `js/modules/spotify.js` |
| `_cajitaDetDelete` | `js/modules/nu.js` |
| `_cajitasAhorroActual` | `js/modules/nu.js` |
| `_calcPrestadoMeta` | `js/modules/nu.js` |
| `_cancelarCobrarCDT` | `js/modules/nu.js` |
| `_cdtModoSheet` | `js/modules/nu.js` |
| `_checkGastoAlto` | `js/modules/inicio.js` |
| `_clasePorCuenta` | `js/core/core-state.js` |
| `_claseValida` | `js/core/core-state.js` |
| `_closeDialog` | `js/core/core-state.js` |
| `_cobroEntrar` | `js/core/cobros.js` |
| `_cobroSacar` | `js/core/cobros.js` |
| `_colorDeuda` | `js/modules/prestado.js` |
| `_colorSeguro` | `js/core/core-state.js` |
| `_confirmarMoverEncCuentasSplit` | `js/modules/encargos.js` |
| `_confirmarMovimientoConGuard` | `js/modules/prestado.js` |
| `_confirmarMovimientoInterno` | `js/modules/prestado.js` |
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
| `_crearEncargoPicker` | `js/modules/mesada.js` |
| `_crearGrupoDeudor` | `js/modules/prestado.js` |
| `_crearPersonaGlobal` | `js/modules/personas.js` |
| `_crearSplitSobrante` | `js/modules/encargos.js` |
| `_ctcActualizarCuentaEncHint` | `js/modules/encargos.js` |
| `_ctcActualizarDestinoHint` | `js/modules/encargos.js` |
| `_ctcActualizarPreview` | `js/modules/encargos.js` |
| `_ctcMiAgregarRow` | `js/modules/encargos.js` |
| `_ctcMiSplitToggle` | `js/modules/encargos.js` |
| `_ctxReglas` | `js/modules/inicio.js` |
| `_cuentaOpsPosteriores` | `js/core/movimientos.js` |
| `_cuentasArr` | `js/core/core-state.js` |
| `_cuentaSelectorHtml` | `js/modules/cuentas.js` |
| `_cuentasSelector` | `js/modules/cuentas.js` |
| `_deBase64` | `js/core/payload-codec.js` |
| `_descriptorCuenta` | `js/modules/cuentas.js` |
| `_descriptorDeCuenta` | `js/modules/cuentas.js` |
| `_deudaCuentasDe` | `js/modules/prestado.js` |
| `_deudaOpsPosteriores` | `js/modules/prestado.js` |
| `_deudasPropias` | `js/modules/inicio.js` |
| `_deudaTieneCuentaAfectada` | `js/modules/prestado.js` |
| `_dialogResolve` | `js/core/core-state.js` (window._dialogResolve = …) |
| `_diasDesde` | `js/modules/alcancia.js` |
| `_diasDeUso` | `js/modules/inicio.js` |
| `_diasEntreFechas` | `js/core/nu-calc.js` |
| `_diffActualizarMiCuenta` | `js/core/diferencial.js` |
| `_diffFuentesOptsHtml` | `js/core/diferencial.js` |
| `_difMiSplitPreview` | `js/modules/encargos.js` |
| `_difRenderHistorialParte` | `js/modules/encargos.js` |
| `_editarPersonaDesdePerfilSheet` | `js/modules/personas.js` |
| `_eliminarMovimientoImpl` | `js/core/movimientos.js` |
| `_encAbrirSelectorPersonaNueva` | `js/modules/encargos.js` |
| `_encargosConSaldoEn` | `js/modules/cuentas.js` |
| `_encGrupoSplit` | `js/modules/encargos.js` |
| `_encSplitCarrier` | `js/modules/encargos.js` |
| `_encSplitKey` | `js/modules/encargos.js` |
| `_enReversion` | `js/modules/prestado.js` |
| `_ensureMesadas` | `js/core/calc-helpers.js` |
| `_ensureSpotify` | `js/core/core-state.js` |
| `_errFilaSinCuenta` | `js/modules/prestado.js` |
| `_errMonto` | `js/modules/prestado.js` |
| `_errSumaCuentas` | `js/modules/prestado.js` |
| `_esEntradaEspejoNoIngreso` | `js/core/core-state.js` |
| `_esGastoVarNoReal` | `js/core/core-state.js` |
| `_espejoLista` | `js/core/cuenta-efectos.js` |
| `_eventosCaja` | `js/modules/inicio.js` |
| `_fechaCorta` | `js/modules/inicio.js` |
| `_fechaSafe` | `js/core/core-state.js` |
| `_fechasCambioEncargoEnCajita` | `js/core/nu-calc.js` |
| `_fmtMeses` | `js/modules/inicio.js` |
| `_fmtTiempo` | `js/modules/alcancia.js` |
| `_fuenteLabelHtml` | `js/core/movimientos.js` |
| `_fuentesDeCuenta` | `js/modules/cuentas.js` |
| `_getA` | `js/modules/alcancia.js` |
| `_getCuotaAnio` | `js/core/calc-helpers.js` |
| `_getEncargoSaldoEnCuenta` | `js/modules/encargos.js` |
| `_getEncargoSaldoPorCuenta` | `js/modules/encargos.js` |
| `_getEncargoSaldoSinCuenta` | `js/modules/encargos.js` |
| `_getMoneyVal` | `js/modules/alcancia.js` |
| `_getMovsFilter` | `js/modules/cuentas.js` |
| `_getOrCrearHistorico` | `js/modules/prestado.js` |
| `_getSaldoOfuscado` | `js/modules/alcancia.js` |
| `_gfPoblar` | `js/modules/gastos.js` |
| `_gruposAbiertos` | `js/modules/prestado.js` |
| `_guardarEditarPersonaGlobal` | `js/modules/personas.js` |
| `_gvDiaLabel` | `js/modules/gastos.js` |
| `_hideScreenLoading` | `js/core/sheet-stack.js` |
| `_historialTasas` | `js/core/nu-calc.js` |
| `_htmlEscapeValue` | `js/core/html-tag.js` |
| `_htmlHistorialPorGrupos` | `js/modules/prestado.js` |
| `_htmlMesDot` | `js/modules/mesada.js` |
| `_initA` | `js/modules/alcancia.js` |
| `_initEventListeners` | `js/core/sheet-stack.js` |
| `_initGrupoSelector` | `js/modules/prestado.js` |
| `_initMovGrupoSelector` | `js/modules/prestado.js` |
| `_initNuevoEncargoPersonaSelector` | `js/modules/encargos.js` |
| `_initSpotifyEditPersonaSelector` | `js/modules/spotify.js` |
| `_initSpotifyPersonaSelector` | `js/modules/spotify.js` |
| `_injectErrorSpans` | `js/core/sheet-stack.js` |
| `_injectMasItem` | `js/modules/plata_comprometida.js` |
| `_injectScreen` | `js/modules/plata_comprometida.js` |
| `_injectSheet` | `js/modules/plata_comprometida.js` |
| `_intentarInyectarPersonaSheets` | `js/core/personas-init.js` |
| `_interpretarLecturaChequeoNu` | `js/modules/nu.js` |
| `_inyectarAlcanciaSheets` | `js/modules/alcancia.js` |
| `_inyectarMasMenuItem` | `js/modules/alcancia.js` |
| `_inyectarPersonaSheets` | `js/modules/personas.js` |
| `_irADestino` | `js/modules/inicio.js` |
| `_irADeudor` | `js/modules/prestado.js` |
| `_irAEncargo` | `js/modules/encargos.js` |
| `_irAMiDeuda` | `js/modules/prestado.js` |
| `_irASpotify` | `js/modules/personas.js` |
| `_libroPata` | `js/core/core-state.js` |
| `_listaFuentes` | `js/core/core-state.js` |
| `_locallyModified` | `js/core/core-state.js` (window._locallyModified = …) |
| `_luminancia` | `js/core/core-state.js` |
| `_markError` | `js/core/sheet-stack.js` |
| `_mdEl` | `js/modules/prestado.js` |
| `_mdEsPerdon` | `js/modules/prestado.js` |
| `_mdExtra` | `js/modules/prestado.js` |
| `_mdPickColor` | `js/modules/prestado.js` |
| `_mdTitulo` | `js/modules/prestado.js` |
| `_mdTotalCuentas` | `js/modules/prestado.js` |
| `_mesadaAnioDeKey` | `js/modules/mesada.js` |
| `_mesadaApiEncargos` | `js/modules/mesada.js` |
| `_mesadaAplicarEntrada` | `js/modules/mesada.js` |
| `_mesadaCrearSalidaEncargo` | `js/modules/mesada.js` |
| `_mesadaEntrar` | `js/modules/mesada.js` |
| `_mesadaMostrarError` | `js/modules/mesada.js` |
| `_mesadaNombreCoincide` | `js/modules/mesada.js` |
| `_mesadaQuitarSalidaEncargo` | `js/modules/mesada.js` |
| `_mesadaSacar` | `js/modules/mesada.js` |
| `_mesadaSumaSplits` | `js/modules/mesada.js` |
| `_mesadaValidarEncargo` | `js/modules/mesada.js` |
| `_mesesCubiertos` | `js/modules/inicio.js` |
| `_mesNombreDeKey` | `js/core/calc-helpers.js` |
| `_metaAporteEliminar` | `js/modules/nu.js` |
| `_miaLeerCuentas` | `js/modules/encargos.js` |
| `_miaMontoEfectivo` | `js/modules/encargos.js` |
| `_miaResumenLado` | `js/modules/encargos.js` |
| `_miDeudaEditColor` | `js/modules/prestado.js` (window._miDeudaEditColor = …) |
| `_milesFormatear` | `js/core/money-input.js` |
| `_montoAlEscribir` | `js/core/money-input.js` |
| `_montoCursor` | `js/core/money-input.js` |
| `_montoFormatear` | `js/core/money-input.js` |
| `_mostrarErrorPlan` | `js/modules/prestado.js` |
| `_mostrarTipoNC` | `js/modules/cuentas.js` |
| `_motivoNoArchivar` | `js/modules/cuentas.js` |
| `_motivoNuChequeo` | `js/modules/nu.js` |
| `_motivoNuMovimiento` | `js/modules/nu.js` |
| `_motivoNuSinCajitas` | `js/modules/nu.js` |
| `_motivoNuSinTasa` | `js/modules/nu.js` |
| `_motivoSinRetiro` | `js/modules/cuentas.js` |
| `_movEncActualizarFaltante` | `js/modules/encargos.js` |
| `_movEncConfirmarPrestarFaltante` | `js/modules/encargos.js` |
| `_movEncFaltanteCuentaHint` | `js/modules/encargos.js` |
| `_movEncMiaPreview` | `js/modules/encargos.js` |
| `_movEncMiaToggle` | `js/modules/encargos.js` |
| `_movEncSplitPreview` | `js/modules/encargos.js` |
| `_moverEncGetFuentesOptions` | `js/modules/encargos.js` |
| `_moverEncSplitPreview` | `js/modules/encargos.js` |
| `_moverEncSplitToggle` | `js/modules/encargos.js` |
| `_movEsPerdon` | `js/modules/prestado.js` |
| `_movExiste` | `js/core/movimientos.js` |
| `_movsAplicarFiltro` | `js/modules/cuentas.js` |
| `_movsDeudaSinCuenta` | `js/core/core-state.js` |
| `_movsLimpiarFechas` | `js/modules/cuentas.js` |
| `_movsOnFecha` | `js/modules/cuentas.js` |
| `_movsOnSearch` | `js/modules/cuentas.js` |
| `_movsOnTipo` | `js/modules/cuentas.js` |
| `_movsRefresh` | `js/modules/cuentas.js` |
| `_movTieneEncargoVinculado` | `js/modules/prestado.js` |
| `_msCablear` | `js/modules/mesada.js` |
| `_msEl` | `js/modules/mesada.js` |
| `_msFilaClickeable` | `js/modules/mesada.js` |
| `_msOn` | `js/modules/mesada.js` |
| `_msVal` | `js/modules/mesada.js` |
| `_nivelRunway` | `js/modules/inicio.js` |
| `_nombreAhorro` | `js/modules/nu.js` |
| `_normTxt` | `js/modules/mesada.js` |
| `_nuActualizarBotonesTransferir` | `js/modules/nu.js` |
| `_nuMovActualizarPreview` | `js/modules/nu.js` |
| `_nuMovRenderCajitas` | `js/modules/nu.js` |
| `_nuMovToggleApertura` | `js/modules/nu.js` |
| `_onClickSpEditPersonaBtn` | `js/modules/spotify.js` |
| `_onMovMontoInput` | `js/modules/prestado.js` |
| `_onSelPersonaMeDeben` | `js/modules/prestado.js` |
| `_onSelPersonaNuevoEncargo` | `js/modules/encargos.js` |
| `_onSelPersonaSpotify` | `js/modules/spotify.js` |
| `_onSelPersonaSpotifyEdit` | `js/modules/spotify.js` |
| `_onSelPersonaYoDebo` | `js/modules/prestado.js` |
| `_optGanancia` | `js/modules/prestado.js` |
| `_patrimonioDependenciasListas` | `js/core/core-state.js` |
| `_pintarAdministrarCuenta` | `js/modules/cuentas.js` |
| `_pintarEncabezadoDeuda` | `js/modules/prestado.js` |
| `_pintarTabPrestamos` | `js/modules/prestado.js` |
| `_planAbonoEncargo` | `js/modules/prestado.js` |
| `_planAbonoNormal` | `js/modules/prestado.js` |
| `_planErr` | `js/modules/prestado.js` |
| `_planExtra` | `js/modules/prestado.js` |
| `_planMovimiento` | `js/modules/prestado.js` |
| `_planMovMiDeuda` | `js/modules/prestado.js` |
| `_planPrestamo` | `js/modules/prestado.js` |
| `_poblarDestinoMesada` | `js/modules/mesada.js` |
| `_prEnsureAlcancia` | `js/modules/prestado.js` |
| `_prestMontoSalida` | `js/modules/prestado.js` |
| `_previewDisponible` | `js/modules/mesada.js` |
| `_previewSplit` | `js/modules/mesada.js` |
| `_procesarDiferencial` | `js/modules/encargos.js` |
| `_procesarMovEncMia` | `js/modules/encargos.js` |
| `_procesarSiguienteCDTVencido` | `js/modules/nu.js` |
| `_rachaDeficitRelevante` | `js/modules/inicio.js` |
| `_refreshCajitaDet` | `js/modules/nu.js` |
| `_refreshNucleo` | `js/core/core-state.js` |
| `_reiniciarPantallasCuenta` | `js/modules/cuentas.js` |
| `_renderColorPicker` | `js/modules/personas.js` |
| `_renderDetalleCajita` | `js/modules/nu.js` |
| `_renderDetalleSimple` | `js/modules/cuentas.js` |
| `_renderDispNetoTC` | `js/modules/inicio.js` |
| `_renderListaDeudas` | `js/modules/prestado.js` |
| `_renderListaPersonas` | `js/modules/personas.js` |
| `_renderMetaAportes` | `js/modules/nu.js` |
| `_renderTiposNC` | `js/modules/cuentas.js` |
| `_rendimientoCDTaDias` | `js/core/nu-calc.js` |
| `_rerenderCuentaActiva` | `js/core/movimientos.js` |
| `_resetEncCuentaSplitToggleStyle` | `js/modules/prestado.js` |
| `_resetSheetNuevaCuenta` | `js/modules/cuentas.js` |
| `_resolverGrupoIdMov` | `js/modules/prestado.js` |
| `_resolverGrupoIdSel` | `js/modules/prestado.js` |
| `_revertirDestinoAbono` | `js/modules/prestado.js` |
| `_revertirDestinosAbono` | `js/modules/prestado.js` |
| `_revertirMovDeudor` | `js/modules/prestado.js` |
| `_revertirMovDeudorImpl` | `js/modules/prestado.js` |
| `_revertirMovMiDeuda` | `js/modules/prestado.js` |
| `_revertirMovMiDeudaImpl` | `js/modules/prestado.js` |
| `_ritmosPorTercio` | `js/modules/inicio.js` |
| `_saldoCPAjeno` | `js/core/core-state.js` |
| `_saldoEncargosEnCajita` | `js/core/nu-calc.js` |
| `_saldoEncargosEnCajitaEnFecha` | `js/core/nu-calc.js` |
| `_saldoEncargosEnCuenta` | `js/core/core-state.js` |
| `_saldoRegistrado` | `js/modules/alcancia.js` |
| `_salidaEncMenuIr` | `js/modules/encargos.js` |
| `_segmentosTasa` | `js/core/nu-calc.js` |
| `_seleccionarColorPersona` | `js/modules/personas.js` |
| `_selPersonaCrearDirecto` | `js/modules/personas.js` |
| `_selPersonaElegir` | `js/modules/personas.js` |
| `_selPersonaFiltrar` | `js/modules/personas.js` |
| `_setBtnEstado` | `js/modules/cuentas.js` |
| `_setBtnTransferir` | `js/modules/cuentas.js` |
| `_setSaldoOfuscado` | `js/modules/alcancia.js` |
| `_showCuentasPanel` | `js/modules/cuentas.js` |
| `_showScreenLoading` | `js/core/sheet-stack.js` |
| `_situacion` | `js/modules/inicio.js` |
| `_spEnsureTC` | `js/modules/spotify.js` |
| `_spExtraOpts` | `js/modules/spotify.js` |
| `_spProporcionarSplits` | `js/modules/spotify.js` |
| `_sumarASaldo` | `js/modules/alcancia.js` |
| `_syncMpDebeWrap` | `js/modules/mesada.js` |
| `_syncSpDebeWrap` | `js/modules/spotify.js` |
| `_syncSpExtraWrap` | `js/modules/spotify.js` |
| `_tasaCDT` | `js/core/nu-calc.js` |
| `_tasaVigenteEnFecha` | `js/core/nu-calc.js` |
| `_tcEsCargoExterno` | `js/modules/tarjetas_credito.js` |
| `_tcOpsPosteriores` | `js/modules/tarjetas_credito.js` |
| `_tcPoblarSelectCajita` | `js/modules/tarjetas_credito.js` |
| `_textoRunway` | `js/modules/inicio.js` |
| `_tituloCuentaHtml` | `js/modules/cuentas.js` |
| `_trDestinoCambio` | `js/modules/cuentas.js` |
| `_trOrigenCambio` | `js/modules/cuentas.js` |
| `_trPodarSelect` | `js/modules/cuentas.js` |
| `_updateMdSplitResumen` | `js/modules/prestado.js` |
| `_updateMetaCuotaPreview` | `js/modules/nu.js` |
| `_updatePrestSplitResumen` | `js/modules/prestado.js` |
| `_usarParteFuentePreview` | `js/modules/encargos.js` |
| `_usarParteFuentes` | `js/modules/encargos.js` |
| `_usarParteMiAgregarRow` | `js/modules/encargos.js` |
| `_usarParteMiSplitToggle` | `js/modules/encargos.js` |
| `_validarEstructuraJSON` | `js/modules/configuracion.js` |
| `_validarMovEncMia` | `js/modules/encargos.js` |
| `_verificarIntegridadSaldoDeudor` | `js/modules/prestado.js` |
| `_volverASelPersona` | `js/modules/personas.js` |
| `_wireTasaInput` | `js/modules/nu.js` |
| `_wrappedAbrir` | `js/core/wrapped-gate.js` (window._wrappedAbrir = …) |
| `_wrappedAgruparPorCategoria` | `js/modules/wrapped.js` |
| `_wrappedAlcanciaDepositosPeriodo` | `js/modules/wrapped.js` |
| `_wrappedAlGuardar` | `js/modules/wrapped.js` |
| `_wrappedAnimarBarras` | `js/modules/wrapped.js` |
| `_wrappedAnimarLinea` | `js/modules/wrapped.js` |
| `_wrappedAnimarNumeros` | `js/modules/wrapped.js` |
| `_wrappedAnioDificil` | `js/modules/wrapped.js` |
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
| `_wrappedColorClase` | `js/modules/wrapped.js` |
| `_wrappedComparaciones` | `js/modules/wrapped.js` |
| `_wrappedConMascara` | `js/modules/wrapped.js` |
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
| `_wrappedDatosAnio` | `js/core/wrapped-gate.js` |
| `_wrappedDebugOn` | `js/modules/wrapped.js` |
| `_wrappedDebugPanelHtml` | `js/modules/wrapped.js` |
| `_wrappedDescubrimientos` | `js/modules/wrapped.js` |
| `_wrappedDisponible` | `js/core/wrapped-gate.js` (window._wrappedDisponible = …) |
| `_wrappedEnRango` | `js/modules/wrapped.js` |
| `_wrappedEntradasIngreso` | `js/modules/wrapped.js` |
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
| `_wrappedGuardar` | `js/modules/wrapped.js` |
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
| `_wrappedMarcarGuardado` | `js/modules/wrapped.js` |
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
| `_wrappedSinMascara` | `js/modules/wrapped.js` |
| `_wrappedSiTuAnioFuera` | `js/modules/wrapped.js` |
| `_wrappedSlideBignum` | `js/modules/wrapped.js` |
| `_wrappedSlidesDeSnapshot` | `js/modules/wrapped.js` |
| `_wrappedSlidesInsuficiente` | `js/modules/wrapped.js` |
| `_wrappedSnapshotDe` | `js/modules/wrapped.js` |
| `_wrappedSpotifyMes` | `js/modules/wrapped.js` |
| `_wrappedSuscripciones` | `js/modules/wrapped.js` |
| `_wrappedTopCategoriaDe` | `js/modules/wrapped.js` |
| `_wrappedUmbrales` | `js/core/wrapped-gate.js` (window._wrappedUmbrales = …) |
| `_wrappedValidarDatos` | `js/modules/wrapped.js` |
| `_wrappedVentana` | `js/core/wrapped-gate.js` |
| `_wrappedVentanaInfo` | `js/core/wrapped-gate.js` (window._wrappedVentanaInfo = …) |
| `_wrappedVisible` | `js/modules/wrapped.js` |
| `abonoSplitResumen` | `js/modules/prestado.js` |
| `abrirAgregarDinero` | `js/modules/cuentas.js` |
| `abrirArchivadas` | `js/modules/cuentas.js` |
| `abrirCargoEspecialTC` | `js/modules/tarjetas_credito.js` |
| `abrirChequeoNu` | `js/modules/nu.js` |
| `abrirCobrarCDT` | `js/modules/nu.js` |
| `abrirCobroIngresoFijo` | `js/modules/analisis.js` |
| `abrirCompraConTC` | `js/modules/encargos.js` |
| `abrirCompraTC` | `js/modules/tarjetas_credito.js` |
| `abrirCrearCDT` | `js/modules/nu.js` |
| `abrirCuenta` | `js/modules/cuentas.js` |
| `abrirDetalleCajita` | `js/modules/nu.js` |
| `abrirDetalleMesada` | `js/modules/mesada.js` |
| `abrirDetalleMov` | `js/core/movimientos.js` |
| `abrirDetalleTCSheet` | `js/modules/tarjetas_credito.js` |
| `abrirDeudor` | `js/modules/prestado.js` |
| `abrirEditarApertura` | `js/modules/cuentas.js` |
| `abrirEditarBien` | `js/modules/gastos.js` |
| `abrirEditarGastoFijo` | `js/modules/gastos.js` |
| `abrirEditarPersonaGlobal` | `js/modules/personas.js` |
| `abrirEditarTC` | `js/modules/tarjetas_credito.js` |
| `abrirEncargoDesdeCuenta` | `js/modules/encargos.js` |
| `abrirEncargoDetalle` | `js/modules/encargos.js` |
| `abrirMetaCajita` | `js/modules/nu.js` |
| `abrirMiDeuda` | `js/modules/prestado.js` |
| `abrirMovEncargo` | `js/modules/encargos.js` |
| `abrirMoverEntreCuentasEncargo` | `js/modules/encargos.js` |
| `abrirMovMiDeuda` | `js/modules/prestado.js` |
| `abrirNuevaCuenta` | `js/modules/cuentas.js` |
| `abrirNuevaParte` | `js/modules/encargos.js` |
| `abrirNuevaTarjeta` | `js/modules/tarjetas_credito.js` |
| `abrirNuevoEncargo` | `js/modules/encargos.js` |
| `abrirNuevoGastoFijo` | `js/modules/gastos.js` |
| `abrirNuevoGastoVar` | `js/modules/gastos.js` |
| `abrirNuMovimiento` | `js/modules/nu.js` |
| `abrirOnboarding` | `js/modules/cuentas.js` |
| `abrirPagarGastoFijo` | `js/modules/gastos.js` |
| `abrirPagarSpotify` | `js/modules/spotify.js` |
| `abrirPagarTC` | `js/modules/tarjetas_credito.js` |
| `abrirPerfilPersona` | `js/modules/personas.js` |
| `abrirPresupuestos` | `js/modules/analisis.js` |
| `abrirRegistrarApertura` | `js/modules/cuentas.js` |
| `abrirRegistrarMesada` | `js/modules/mesada.js` |
| `abrirResolverPendiente` | `js/modules/mesada.js` |
| `abrirRestarDinero` | `js/modules/cuentas.js` |
| `abrirSalidaEncargoMenu` | `js/modules/encargos.js` |
| `abrirSelPersona` | `js/modules/personas.js` |
| `abrirSheetBien` | `js/modules/gastos.js` |
| `abrirSheetIngresoFijo` | `js/modules/analisis.js` |
| `abrirSheetPrestamoTC` | `js/modules/prestado.js` |
| `abrirSubCDTs` | `js/modules/nu.js` |
| `abrirSubMeta` | `js/modules/nu.js` |
| `abrirTransferenciaEncargo` | `js/modules/encargos.js` |
| `abrirTransferir` | `js/modules/cuentas.js` |
| `abrirTraspasoEncargo` | `js/modules/encargos.js` |
| `abrirUsarParteSheet` | `js/modules/encargos.js` |
| `activarNotificaciones` | `js/core/notificaciones-push.js` |
| `actualizarAdMenuPreview` | `js/modules/cuentas.js` |
| `actualizarAdMenuSaldo` | `js/modules/cuentas.js` |
| `actualizarBotonesNu` | `js/modules/nu.js` |
| `actualizarBotonesTransferir` | `js/modules/cuentas.js` |
| `actualizarBotonRetirar` | `js/modules/cuentas.js` |
| `actualizarCbAvisoMes` | `js/modules/analisis.js` |
| `actualizarCbPreview` | `js/modules/analisis.js` |
| `actualizarGvImpacto` | `js/modules/gastos.js` |
| `actualizarGvSplitPreview` | `js/modules/gastos.js` |
| `actualizarMpAvisoMes` | `js/modules/mesada.js` |
| `actualizarMppPreview` | `js/modules/mesada.js` |
| `actualizarMpPreview` | `js/modules/mesada.js` |
| `actualizarSpDestinoPreview` | `js/modules/spotify.js` |
| `actualizarSpPagarPreview` | `js/modules/spotify.js` |
| `actualizarSpResolverPreview` | `js/modules/spotify.js` |
| `actualizarTransfPreview` | `js/modules/cuentas.js` |
| `addCajita` | `js/modules/nu.js` |
| `addGastoFijo` | `js/modules/gastos.js` |
| `addGastoVar` | `js/modules/gastos.js` |
| `addSpotify` | `js/modules/spotify.js` |
| `agregarCat` | `js/modules/configuracion.js` |
| `ahorroAplicarTasaEscrita` | `js/core/nu-calc.js` |
| `ahorroTasaConfigurada` | `js/core/nu-calc.js` |
| `ahorroTotal` | `js/core/nu-calc.js` |
| `ahorroTotalGeneral` | `js/core/nu-calc.js` |
| `ahorroValorEsperadoCajita` | `js/core/nu-calc.js` |
| `ajustarSaldoCuenta` | `js/core/core-state.js` |
| `alcanciaAgregarOrigen` | `js/modules/alcancia.js` (window.alcanciaAgregarOrigen = …) |
| `alcanciaConfirmarDeposito` | `js/modules/alcancia.js` (window.alcanciaConfirmarDeposito = …) |
| `alcanciaConfirmarDestapar` | `js/modules/alcancia.js` (window.alcanciaConfirmarDestapar = …) |
| `alcanciaEliminarDeposito` | `js/modules/alcancia.js` (window.alcanciaEliminarDeposito = …) |
| `alcanciaIniciarNueva` | `js/modules/alcancia.js` (window.alcanciaIniciarNueva = …) |
| `alcanciaToggleDividir` | `js/modules/alcancia.js` (window.alcanciaToggleDividir = …) |
| `alcanciaToggleMontoDeposito` | `js/modules/alcancia.js` (window.alcanciaToggleMontoDeposito = …) |
| `alternarAhorroNC` | `js/modules/cuentas.js` |
| `aplicarMigraciones` | `js/core/core-state.js` |
| `applyModulos` | `js/core/sheet-stack.js` |
| `archivarCuenta` | `js/modules/cuentas.js` |
| `asegurarEfectivo` | `js/core/core-state.js` |
| `avisarMovimientoBloqueado` | `js/core/core-state.js` |
| `borrarMovEspejo` | `js/core/cuenta-efectos.js` |
| `borrarTodo` | `js/modules/configuracion.js` |
| `botonEliminarFila` | `js/core/core-state.js` |
| `buildFuentesOptsHtml` | `js/core/core-state.js` |
| `cajitaChequeable` | `js/core/nu-calc.js` |
| `cajitaGeneraIntereses` | `js/core/nu-calc.js` |
| `cajitasChequeables` | `js/core/nu-calc.js` |
| `cajitasDeCuenta` | `js/core/core-state.js` |
| `calcBienes` | `js/core/core-state.js` |
| `calcC` | `js/core/nu-calc.js` |
| `calcCalendarioCaja` | `js/modules/inicio.js` |
| `calcCDT` | `js/core/nu-calc.js` |
| `calcDeudaAjenaDeTarjeta` | `js/core/core-state.js` |
| `calcDeudaTcPropia` | `js/core/core-state.js` |
| `calcDeudaTcPropiaDeTarjeta` | `js/core/core-state.js` |
| `calcEstadoHero` | `js/modules/inicio.js` |
| `calcEstadoSituacion` | `js/modules/inicio.js` |
| `calcHealthScore` | `js/modules/inicio.js` |
| `calcImpactoCompra` | `js/modules/inicio.js` |
| `calcLiquidez` | `js/core/core-state.js` |
| `calcMetaProgreso` | `js/modules/nu.js` |
| `calcPatrimonioConBienes` | `js/core/core-state.js` |
| `calcPatrimonioDesglose` | `js/core/core-state.js` |
| `calcPatrimonioTotal` | `js/core/core-state.js` |
| `calcPatrimonioVisible` | `js/core/core-state.js` |
| `calcRendimientoCDTMes` | `js/core/nu-calc.js` |
| `calcRendimientoCDTsMes` | `js/core/nu-calc.js` |
| `calcSaldoInicialPendiente` | `js/core/core-state.js` |
| `calcSinBase` | `js/modules/inicio.js` |
| `calcularSerieTasaImplicita` | `js/modules/nu.js` |
| `calcValorBien` | `js/core/core-state.js` |
| `cambiarAnio` | `js/modules/mesada.js` |
| `cambiarTabPrestamos` | `js/modules/prestado.js` |
| `CATS_FIJO_DEFAULT` | `js/core/core-state.js` |
| `CATS_VAR_DEFAULT` | `js/core/core-state.js` |
| `cdtVencido` | `js/core/nu-calc.js` |
| `cerrarPartSheet` | `js/modules/encargos.js` |
| `Cierre` | `js/core/cierre.js` |
| `claseEfectivaMovimiento` | `js/core/core-state.js` |
| `CLASES_MOV` | `js/core/core-state.js` |
| `clickMesDot` | `js/modules/mesada.js` |
| `closeSheet` | `js/core/sheet-stack.js` |
| `closeSwipeSheet` | `js/modules/alcancia.js` |
| `COBRO_MES_RE` | `js/core/cobros.js` |
| `cobroAvisoMes` | `js/core/cobros.js` |
| `cobroBorrar` | `js/core/cobros.js` |
| `cobroFuentesDe` | `js/core/cobros.js` |
| `cobroMesTexto` | `js/core/cobros.js` |
| `cobroRegistrar` | `js/core/cobros.js` |
| `cobroRevertir` | `js/core/cobros.js` |
| `cobroRevertirTodos` | `js/core/cobros.js` |
| `cobrosDeIngresoFijo` | `js/core/cobros.js` |
| `colorCuenta` | `js/core/core-state.js` |
| `colorLegible` | `js/core/core-state.js` |
| `conEstadoAislado` | `js/core/core-state.js` |
| `confirmarAgregarDinero` | `js/modules/cuentas.js` |
| `confirmarAgregarDineroMenu` | `js/modules/cuentas.js` |
| `confirmarBorrarMovimientoViejo` | `js/core/core-state.js` |
| `confirmarCambioTasaNu` | `js/modules/nu.js` |
| `confirmarCargoEspecialTC` | `js/modules/tarjetas_credito.js` |
| `confirmarCobrarCDT` | `js/modules/nu.js` |
| `confirmarCobroIngresoFijo` | `js/modules/analisis.js` |
| `confirmarCompraConTC` | `js/modules/encargos.js` |
| `confirmarCompraTC` | `js/modules/tarjetas_credito.js` |
| `confirmarCrearCDT` | `js/modules/nu.js` |
| `confirmarEditarApertura` | `js/modules/cuentas.js` |
| `confirmarMesadaPago` | `js/modules/mesada.js` |
| `confirmarMovEncargo` | `js/modules/encargos.js` |
| `confirmarMoverEncCuentas` | `js/modules/encargos.js` |
| `confirmarMovimiento` | `js/modules/prestado.js` |
| `confirmarMovMiDeuda` | `js/modules/prestado.js` |
| `confirmarNuMovimiento` | `js/modules/nu.js` |
| `confirmarPagarGastoFijo` | `js/modules/gastos.js` |
| `confirmarPagarSpotify` | `js/modules/spotify.js` |
| `confirmarPagarTC` | `js/modules/tarjetas_credito.js` |
| `confirmarPendienteMesada` | `js/modules/mesada.js` |
| `confirmarPrestamoTC` | `js/modules/prestado.js` |
| `confirmarRestarDinero` | `js/modules/cuentas.js` |
| `confirmarSheetCDT` | `js/modules/nu.js` |
| `confirmarSpDestino` | `js/modules/spotify.js` |
| `confirmarSpResolverPendiente` | `js/modules/spotify.js` |
| `confirmarTransferenciaEncargo` | `js/modules/encargos.js` |
| `confirmarTransferir` | `js/modules/cuentas.js` |
| `confirmarTraspasoEncargo` | `js/modules/encargos.js` |
| `corregirChequeoNu` | `js/modules/nu.js` |
| `crearCuenta` | `js/modules/cuentas.js` |
| `crearEncargo` | `js/modules/encargos.js` |
| `crearMovimientoApertura` | `js/core/core-state.js` |
| `crearSplitWidget` | `js/core/split.js` |
| `cuentaDeCajita` | `js/core/core-state.js` |
| `CuentaPantallas` | `js/core/core-state.js` |
| `cuentasActivas` | `js/core/core-state.js` |
| `cuentasAhorro` | `js/core/core-state.js` |
| `cuentasConSaldo` | `js/core/core-state.js` |
| `cuentaSePuedeEliminar` | `js/modules/cuentas.js` |
| `cuentasTodas` | `js/core/core-state.js` |
| `debounceSave` | `js/core/core-state.js` |
| `deleteCajita` | `js/modules/nu.js` |
| `deleteGastoFijo` | `js/modules/gastos.js` |
| `deleteGastoVar` | `js/modules/gastos.js` |
| `deleteMovEncargo` | `js/modules/encargos.js` |
| `deleteSpHistorial` | `js/modules/spotify.js` |
| `deleteSpotify` | `js/modules/spotify.js` |
| `descontarFuente` | `js/core/core-state.js` |
| `deshacerAbonoPendienteSp` | `js/modules/spotify.js` |
| `deshacerPendienteMesada` | `js/modules/mesada.js` |
| `Deudas` | `js/core/calc-helpers.js` |
| `diaCreacionMov` | `js/core/core-state.js` |
| `dialogo` | `js/core/core-state.js` |
| `diffAddParte` | `js/core/diferencial.js` |
| `diffAplicar` | `js/core/diferencial.js` |
| `diffCalcular` | `js/core/diferencial.js` |
| `diffEstaAbierto` | `js/core/diferencial.js` |
| `diffHtmlBloque` | `js/core/diferencial.js` |
| `diffInst` | `js/core/diferencial.js` |
| `diffRegistrarInstancia` | `js/core/diferencial.js` |
| `diffRemoveParte` | `js/core/diferencial.js` |
| `diffRenderHistorial` | `js/core/diferencial.js` |
| `diffRenderPartes` | `js/core/diferencial.js` |
| `diffReset` | `js/core/diferencial.js` |
| `diffResumen` | `js/core/diferencial.js` |
| `diffSetCuentaEntrada` | `js/core/diferencial.js` |
| `diffSetCuentaSalida` | `js/core/diferencial.js` |
| `diffSetMonto` | `js/core/diferencial.js` |
| `diffSetNombre` | `js/core/diferencial.js` |
| `diffToggle` | `js/core/diferencial.js` |
| `diffTogglePagoYo` | `js/core/diferencial.js` |
| `diffValidarIntercambios` | `js/core/diferencial.js` |
| `diffValidarMiCuenta` | `js/core/diferencial.js` |
| `Dinero` | `js/core/core-state.js` |
| `editarCDT` | `js/modules/nu.js` |
| `editarCuenta` | `js/modules/cuentas.js` |
| `editarDeudorActual` | `js/modules/prestado.js` |
| `editarEncargoActual` | `js/modules/encargos.js` |
| `editarIngresoFijo` | `js/modules/analisis.js` |
| `editarMiDeudaActual` | `js/modules/prestado.js` |
| `editarParte` | `js/modules/encargos.js` |
| `editarSpotify` | `js/modules/spotify.js` |
| `eliminarBien` | `js/modules/gastos.js` |
| `eliminarCat` | `js/modules/configuracion.js` |
| `eliminarCobroIngresoFijo` | `js/modules/analisis.js` |
| `eliminarCompraTC` | `js/modules/tarjetas_credito.js` |
| `eliminarCuenta` | `js/modules/cuentas.js` |
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
| `eliminarWrapped` | `js/modules/configuracion.js` |
| `emptyState` | `js/core/core-state.js` |
| `encargoComprometido` | `js/modules/encargos.js` |
| `encargoLibre` | `js/modules/encargos.js` |
| `encargoSaldo` | `js/modules/encargos.js` |
| `entradasIngresoReal` | `js/core/core-state.js` |
| `escHtml` | `js/core/core-state.js` |
| `escHtml2` | `js/modules/wrapped.js` |
| `esCuentaAhorro` | `js/core/core-state.js` |
| `esCuentaFija` | `js/core/core-state.js` |
| `esFuenteCuenta` | `js/core/core-state.js` |
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
| `filaMovimiento` | `js/core/core-state.js` |
| `fmt` | `js/core/core-state.js` |
| `fmtInput` | `js/core/core-state.js` |
| `fmtNoCents` | `js/core/core-state.js` |
| `fmtSaldoSelector` | `js/core/core-state.js` |
| `FUENTE_CUENTA_PREFIJO` | `js/core/core-state.js` |
| `fuenteBadgeClass` | `js/core/core-state.js` |
| `fuenteDeCuenta` | `js/core/core-state.js` |
| `fuenteLabel` | `js/core/core-state.js` |
| `fuenteLabel2` | `js/modules/prestado.js` |
| `FuentesFiltro` | `js/core/fuentes-filtro.js` |
| `gastosMes` | `js/core/core-state.js` |
| `getAperturaMov` | `js/modules/cuentas.js` |
| `getCajitaNombre` | `js/core/nu-calc.js` |
| `getCatsFijo` | `js/core/core-state.js` |
| `getCatsVar` | `js/core/core-state.js` |
| `getCuenta` | `js/core/core-state.js` |
| `getCuentaDeFuente` | `js/core/core-state.js` |
| `getDeudorSaldo` | `js/core/calc-helpers.js` |
| `getEncargo` | `js/modules/encargos.js` |
| `getFuentes` | `js/core/core-state.js` |
| `getFuentesOptions` | `js/modules/mesada.js` |
| `getFuentesSinTC` | `js/core/core-state.js` |
| `getGrupoSaldo` | `js/modules/prestado.js` |
| `getIconoData` | `js/modules/cuentas.js` |
| `getIngresosFijosMes` | `js/core/core-state.js` |
| `getMesadaData` | `js/core/calc-helpers.js` |
| `getMiDeudaSaldo` | `js/core/calc-helpers.js` |
| `getMovimientosCuenta` | `js/modules/cuentas.js` |
| `getPersona` | `js/modules/personas.js` |
| `getPersonaColor` | `js/modules/personas.js` |
| `getPersonaDatos` | `js/modules/personas.js` |
| `getPersonaNombre` | `js/modules/personas.js` |
| `getSaldoFuente` | `js/core/core-state.js` |
| `getSpCajita` | `js/modules/spotify.js` |
| `getSpCajitaSaldo` | `js/modules/spotify.js` |
| `getTasaCuenta` | `js/core/nu-calc.js` |
| `getTCById` | `js/core/calc-helpers.js` |
| `guardarBien` | `js/modules/gastos.js` |
| `guardarCDT` | `js/modules/nu.js` |
| `guardarChequeoNu` | `js/modules/nu.js` |
| `guardarEditarEncargo` | `js/modules/encargos.js` |
| `guardarEditarMiDeuda` | `js/modules/prestado.js` |
| `guardarEditarSpotify` | `js/modules/spotify.js` |
| `guardarIngresoFijo` | `js/modules/analisis.js` |
| `guardarMetaCajita` | `js/modules/nu.js` |
| `guardarParte` | `js/modules/encargos.js` |
| `guardarTC` | `js/modules/tarjetas_credito.js` |
| `hexToRgb` | `js/modules/cuentas.js` |
| `hookGlobal` | `js/core/hook-global.js` |
| `hoy` | `js/core/core-state.js` |
| `html` | `js/core/html-tag.js` |
| `Huella` | `js/core/huella.js` |
| `ICONO_VACIO_CUENTAS` | `js/core/core-state.js` |
| `ICONOS_CUENTA` | `js/modules/cuentas.js` |
| `idDeFuenteCuenta` | `js/core/core-state.js` |
| `importarJSON` | `js/modules/configuracion.js` |
| `ingresoFijoEsperadoEn` | `js/core/cobros.js` |
| `ingresoFijoEstadoMes` | `js/core/cobros.js` |
| `ingresoFijoPorId` | `js/core/cobros.js` |
| `ingresosRealesDelMes` | `js/core/core-state.js` |
| `iniciales` | `js/core/bootstrap.js` |
| `initMovSheet` | `js/modules/prestado.js` |
| `leerArchivoImport` | `js/modules/configuracion.js` |
| `liberarCDTManual` | `js/modules/nu.js` |
| `Libro` | `js/core/core-state.js` |
| `load` | `js/core/core-state.js` |
| `Loader` | `js/core/lazy-loader.js` |
| `marcarColorSeleccionado` | `js/core/color-picker.js` |
| `marcarMesadaComoPendiente` | `js/modules/mesada.js` |
| `marcarPagoSpotify` | `js/modules/spotify.js` |
| `markDirty` | `js/core/sheet-stack.js` |
| `materializarIntereses` | `js/modules/nu.js` |
| `MAX` | `js/core/core-state.js` |
| `MC` | `js/core/core-state.js` |
| `ME_DEBEN_ABRE` | `js/core/core-state.js` |
| `medirAnchoTexto` | `js/core/core-state.js` |
| `medirPatrimonioParaHistorial` | `js/core/core-state.js` |
| `mejorTasaAhorro` | `js/core/nu-calc.js` |
| `mesActual` | `js/core/core-state.js` |
| `MESADA_PADRES` | `js/modules/mesada.js` |
| `mesadaAbonarPendiente` | `js/modules/mesada.js` |
| `mesadaAbonosDe` | `js/modules/mesada.js` |
| `mesadaAvisoMesPago` | `js/modules/mesada.js` |
| `mesadaBorrarPago` | `js/modules/mesada.js` |
| `mesadaCuentasDeEncargo` | `js/modules/mesada.js` |
| `mesadaCuotaDeKey` | `js/modules/mesada.js` |
| `mesadaDeshacerAbono` | `js/modules/mesada.js` |
| `mesadaDisponibleEncargo` | `js/modules/mesada.js` |
| `mesadaEncargosDelParent` | `js/modules/mesada.js` |
| `mesadaEstadoMes` | `js/modules/mesada.js` |
| `mesadaFuentesDe` | `js/modules/mesada.js` |
| `mesadaMarcarPendiente` | `js/modules/mesada.js` |
| `mesadaMesVencido` | `js/modules/mesada.js` |
| `mesadaNombrePadre` | `js/modules/mesada.js` |
| `mesadaOpsPosteriores` | `js/modules/mesada.js` |
| `mesadaOrigenDeMovEncargo` | `js/core/calc-helpers.js` |
| `mesadaRegistrarPago` | `js/modules/mesada.js` |
| `mesadaResumenAnio` | `js/modules/mesada.js` |
| `mesadaRevertirAbono` | `js/modules/mesada.js` |
| `mesadaTieneCuentaAfectada` | `js/modules/mesada.js` |
| `mesKey` | `js/core/core-state.js` |
| `MIGRACIONES` | `js/core/core-state.js` |
| `mostrarAlertaFuente` | `js/core/sheet-stack.js` |
| `mostrarAvisoNuevaVersion` | `js/core/mejoras-adicionales.js` |
| `mostrarSi` | `js/core/core-state.js` |
| `movimientosSinClase` | `js/core/core-state.js` |
| `nextMonthFixed` | `js/modules/spotify.js` |
| `nivelAntiguedadMovimiento` | `js/core/core-state.js` |
| `nombreCuenta` | `js/core/core-state.js` |
| `ocultarInvitacionCuentas` | `js/modules/cuentas.js` |
| `onChangeMov_enc_cuenta` | `js/modules/prestado.js` |
| `onChangeMov_enc_sel` | `js/modules/prestado.js` |
| `opcionesCuenta` | `js/core/core-state.js` |
| `openSheet` | `js/core/sheet-stack.js` |
| `openSheet_adMenu` | `js/modules/cuentas.js` |
| `openSheet_pagarSpotify` | `js/modules/spotify.js` |
| `parseMiles` | `js/core/money-input.js` |
| `parseMoney` | `js/core/core-state.js` |
| `parsePct` | `js/core/core-state.js` |
| `patrimonioFormulaTexto` | `js/core/core-state.js` |
| `pedirPinAntesDe` | `js/core/core-state.js` |
| `Periodo` | `js/core/periodo.js` |
| `PERSONA_COLORES` | `js/modules/personas.js` |
| `PERSONA_COLORES_MD` | `js/modules/prestado.js` |
| `pgfActualizarSaldo` | `js/modules/gastos.js` |
| `pintarAvatarPersona` | `js/core/core-state.js` |
| `PlanDeudas` | `js/core/plan-deudas.js` |
| `planDeudasDatos` | `js/modules/inicio.js` |
| `poblarCatSelect` | `js/core/core-state.js` |
| `poblarChequeoNu` | `js/modules/nu.js` |
| `poblarFuente` | `js/core/core-state.js` |
| `ptcActualizarPreview` | `js/modules/tarjetas_credito.js` |
| `ptcSetMonto` | `js/modules/tarjetas_credito.js` |
| `purgarAperturaDelHistorial` | `js/core/core-state.js` |
| `purgarEfectoEnHistorial` | `js/core/core-state.js` |
| `quitarDeHistorial` | `js/core/core-state.js` |
| `quitarMetaCajita` | `js/modules/nu.js` |
| `raw` | `js/core/html-tag.js` |
| `reactivarCuenta` | `js/modules/cuentas.js` |
| `recalcularMontoBaseHistorial` | `js/core/core-state.js` |
| `Refresh` | `js/core/core-state.js` |
| `refresh` | `js/core/core-state.js` |
| `registrarEntradaConApertura` | `js/modules/cuentas.js` |
| `registrarMovEspejo` | `js/core/cuenta-efectos.js` |
| `registrarSalida` | `js/modules/cuentas.js` |
| `registrarSonda` | `js/core/core-state.js` |
| `registrarTasaHistorial` | `js/modules/nu.js` |
| `Reglas` | `js/core/reglas.js` |
| `renderAlcancia` | `js/modules/alcancia.js` (window.renderAlcancia = …) |
| `renderAnalisis` | `js/modules/analisis.js` |
| `renderArchivadas` | `js/modules/cuentas.js` |
| `renderAttencion` | `js/modules/inicio.js` |
| `renderBannerApertura` | `js/modules/cuentas.js` |
| `renderBienes` | `js/modules/analisis.js` |
| `renderCajitas` | `js/modules/nu.js` |
| `renderCatsConfig` | `js/modules/configuracion.js` |
| `renderConciliacion` | `js/modules/analisis.js` |
| `renderCuentasInicio` | `js/core/core-state.js` |
| `renderDetalleAhorro` | `js/modules/nu.js` |
| `renderDetalleCuenta` | `js/modules/cuentas.js` |
| `renderDeudoresList` | `js/modules/prestado.js` |
| `renderEncargoParts` | `js/modules/encargos.js` |
| `renderEncargosEnCuenta` | `js/modules/encargos.js` |
| `renderEncargosList` | `js/modules/encargos.js` |
| `renderGastosFijos` | `js/modules/gastos.js` |
| `renderGastosVar` | `js/modules/gastos.js` |
| `renderHealthScore` | `js/modules/inicio.js` |
| `renderHeroEstado` | `js/modules/inicio.js` |
| `renderIconGrid` | `js/modules/cuentas.js` |
| `renderIconoCustom` | `js/modules/cuentas.js` |
| `renderIngresosFijos` | `js/modules/analisis.js` |
| `renderMesada` | `js/modules/mesada.js` |
| `renderMesFiltros` | `js/modules/gastos.js` |
| `renderMetaProgress` | `js/modules/nu.js` |
| `renderMisDeudasList` | `js/modules/prestado.js` |
| `renderMisWrapped` | `js/modules/configuracion.js` |
| `renderMovsCuenta` | `js/modules/cuentas.js` |
| `renderMovsFiltros` | `js/modules/cuentas.js` |
| `renderPlanDeudas` | `js/modules/inicio.js` |
| `renderPresupuestos` | `js/modules/analisis.js` |
| `renderProyeccion` | `js/modules/inicio.js` |
| `renderSelectorCuentas` | `js/modules/cuentas.js` |
| `renderSimulador` | `js/modules/analisis.js` |
| `renderSpHistorial` | `js/modules/spotify.js` |
| `renderSpotify` | `js/modules/spotify.js` |
| `renderSpStats` | `js/modules/spotify.js` |
| `renderTamanoDatos` | `js/modules/configuracion.js` |
| `renderTCDashboard` | `js/modules/tarjetas_credito.js` |
| `renderTCScreen` | `js/modules/tarjetas_credito.js` |
| `renderWrapped` | `js/modules/wrapped.js` (window.renderWrapped = …) |
| `rendimientoCajitaPorMes` | `js/core/nu-calc.js` |
| `resolverPendienteSpHistorial` | `js/modules/spotify.js` |
| `Reversibles` | `js/core/core-state.js` |
| `S` | `js/core/core-state.js` |
| `saldoCuentas` | `js/core/core-state.js` |
| `Salud` | `js/core/salud.js` |
| `SALUD_MAX_CONSEJOS` | `js/modules/inicio.js` |
| `save` | `js/core/core-state.js` |
| `saveAndRefresh` | `js/core/sheet-stack.js` |
| `SCHEMA_BASE` | `js/core/core-state.js` |
| `SCHEMA_VERSION_ACTUAL` | `js/core/core-state.js` |
| `selColorNC` | `js/modules/cuentas.js` |
| `selIconoNC` | `js/modules/cuentas.js` |
| `selSpMeses` | `js/modules/spotify.js` |
| `selTipoNC` | `js/modules/cuentas.js` |
| `setMesFiltro` | `js/modules/gastos.js` |
| `setMoneyInput` | `js/core/core-state.js` |
| `showScreen` | `js/core/sheet-stack.js` |
| `snapshotPatrimonio` | `js/core/core-state.js` |
| `SP_EMPATE_PERIODOS` | `js/modules/spotify.js` |
| `SP_PERIODO_DIAS` | `js/modules/spotify.js` |
| `spAsignarPeriodos` | `js/modules/spotify.js` |
| `spCicloCobrosActual` | `js/modules/spotify.js` |
| `spCobradoDePersona` | `js/modules/spotify.js` |
| `spCostoValido` | `js/modules/spotify.js` |
| `splitActualizarBotones` | `js/core/split.js` |
| `splitActualizarOpciones` | `js/core/split.js` |
| `splitAgregarRow` | `js/core/split.js` |
| `splitCuentasValidas` | `js/core/split.js` |
| `splitGetData` | `js/core/split.js` |
| `splitOpcionesUsadas` | `js/core/split.js` |
| `splitPreview` | `js/core/split.js` |
| `splitReset` | `js/core/split.js` |
| `splitToggle` | `js/core/split.js` |
| `spMontoAntesDe` | `js/modules/spotify.js` |
| `spNombreDe` | `js/core/calc-helpers.js` |
| `spPeriodosVencidos` | `js/modules/spotify.js` |
| `spPersonaPagadaVigente` | `js/core/calc-helpers.js` |
| `spResumenCicloActual` | `js/modules/spotify.js` |
| `spSumarDias` | `js/modules/spotify.js` |
| `spTramosDeCobro` | `js/modules/spotify.js` |
| `sumarFuente` | `js/core/core-state.js` |
| `switchGastoTab` | `js/modules/gastos.js` |
| `tasaATexto` | `js/core/nu-calc.js` |
| `tasaDesdeTexto` | `js/core/nu-calc.js` |
| `tasaSanear` | `js/core/nu-calc.js` |
| `TC_ESTADOS` | `js/modules/tarjetas_credito.js` |
| `TC_MOTIVOS_CARGO` | `js/modules/tarjetas_credito.js` |
| `tcBuscarCompraPorIdOMatch` | `js/modules/tarjetas_credito.js` |
| `tcCrearCompra` | `js/modules/tarjetas_credito.js` |
| `tcCrearPago` | `js/modules/tarjetas_credito.js` |
| `tcCupoDisponible` | `js/core/calc-helpers.js` |
| `tcCupoUsadoPct` | `js/core/calc-helpers.js` |
| `tcDeudaCalculada` | `js/modules/tarjetas_credito.js` |
| `tcDeudaTotal` | `js/modules/tarjetas_credito.js` |
| `tcEliminarCompraInterna` | `js/modules/tarjetas_credito.js` |
| `tcEliminarPagoInterna` | `js/modules/tarjetas_credito.js` |
| `tcEstadoInfo` | `js/modules/tarjetas_credito.js` |
| `tcNormalizarTarjetas` | `js/modules/tarjetas_credito.js` |
| `tcRecalcular` | `js/modules/tarjetas_credito.js` |
| `tcSelColor` | `js/modules/tarjetas_credito.js` |
| `TIPOS_CUENTA` | `js/core/core-state.js` |
| `toast` | `js/core/core-state.js` |
| `toggleAdApertura` | `js/modules/cuentas.js` |
| `toggleCompraGrande` | `js/modules/gastos.js` |
| `toggleDesdeEncargo` | `js/modules/prestado.js` |
| `toggleExtraordinario` | `js/core/movimientos.js` |
| `toggleExtraSection` | `js/modules/prestado.js` |
| `toggleMdExtra` | `js/modules/prestado.js` |
| `toggleMdPerdon` | `js/modules/prestado.js` |
| `toggleMetaMinWrap` | `js/modules/nu.js` |
| `toggleModulo` | `js/modules/configuracion.js` |
| `toggleMovPerdon` | `js/modules/prestado.js` |
| `totalMisDeudasPendiente` | `js/core/calc-helpers.js` |
| `totalPrestadoPendiente` | `js/core/calc-helpers.js` |
| `TR_MIN_EFECTIVO` | `js/modules/cuentas.js` |
| `uid` | `js/core/core-state.js` |
| `UMBRALES` | `js/core/umbrales.js` |
| `usarParte` | `js/modules/encargos.js` |
| `validarCamposCDT` | `js/modules/nu.js` |
| `validarSalidaFuente` | `js/core/core-state.js` |
| `validarTransferencia` | `js/modules/cuentas.js` |
| `verificarTasaAhorro` | `js/modules/nu.js` |
| `verificarVencimientosCDT` | `js/modules/nu.js` |
| `volverADetalleCajita` | `js/modules/nu.js` |
| `volverANu` | `js/modules/nu.js` |
| `volverDeudores` | `js/modules/prestado.js` |
| `volverEncargosLista` | `js/modules/encargos.js` |
| `volverMisDeudas` | `js/modules/prestado.js` |
| `volverSelector` | `js/modules/cuentas.js` |
| `waitFor` | `js/core/wait-for.js` |
| `WRAPPED_BANCO_INSUFICIENTE` | `js/modules/wrapped.js` |
| `WRAPPED_MAX_INSIGHTS_POOL` | `js/modules/wrapped.js` |
| `WRAPPED_MIN_DIAS` | `js/core/wrapped-gate.js` |
| `WRAPPED_SNAPSHOT_VERSION` | `js/modules/wrapped.js` |
| `WRAPPED_VENTANA_DIAS` | `js/core/wrapped-gate.js` |
