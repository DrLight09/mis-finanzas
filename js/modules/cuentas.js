/* ═══════════════════════════════════════════════════════════════
   js/modules/cuentas.js

   Módulo Cuentas de mis-finanzas: las cuentas con saldo "simples" y todo lo
   que comparten. Cubre:
     · Selector de cuentas (Nequi, Nu, Efectivo, personalizadas) y detalle
       de una cuenta simple (saldo, movimientos, saldo inicial/apertura)
     · Cuentas personalizadas (bancos/apps con ícono y color propios)
     · Historial de una cuenta (getMovimientosCuenta) y su motor de filtros
       (búsqueda, tipo, rango de fechas), usado también por Nu
     · Agregar dinero, retirar dinero, transferir entre cuentas

   Nu (cajitas, tasa EA, CDTs, metas, chequeo rápido y "Agregar/Retirar
   dinero" de una cajita) vive en js/modules/nu.js. Los dos archivos forman
   el grupo lazy 'cuentas' (js/core/lazy-loader.js) y comparten el scope
   global. Regla de dependencia (UN solo sentido): este archivo es la capa
   genérica de cuentas y NO nombra nada de nu.js; Nu se apoya en lo que
   exportamos acá (ver la cabecera de nu.js) y se le presenta a esta capa
   registrándose en CuentaPantallas (core-state.js). Cada archivo carga solo
   y el orden no importa (lo comprueba tests/cuentas.test.js).

   Ver docs/cuentas.md (objetivo, reglas y modelo de datos) y docs/nu.md.
   El historial de bugs corregidos vive en CHANGELOG.md, no acá.

   Núcleo compartido que este módulo usa pero no define (js/core/): S,
   save(), escHtml(), toast(), dialogo(), fmt(), uid(), hoy(),
   sumarFuente()/descontarFuente()/ajustarSaldoCuenta() (puerta única del
   libro), getFuentes()/fuenteLabel()/getSaldoFuente(), CUENTAS_FIJAS,
   calcPatrimonioTotal(), _saldoEncargosEnCuenta(), FuentesFiltro, y
   abrirDetalleMov()/eliminarMovimiento() (compartidos por toda la app;
   se registran como 'core:…' en movimientos.js).
   ═══════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Selector de cuentas (Nequi / Nu / Efectivo / personalizada)
   ─────────────────────────────────────────────────────────────── */
/* ---- CUENTAS SELECTOR ---- */
// Fuente de la cuenta abierta en el detalle: 'nequi' | 'nu' | 'efectivo' | 'custom:ID' ('' si no hay
// ninguna). Una sola variable para todas las cuentas; la leen core-state.js, sheet-stack.js,
// movimientos.js y encargos.js (siempre con guard typeof: este archivo es lazy).
let cuentaActual = '';

// Abre el detalle de una cuenta. `fuente` es el identificador de siempre
// ('nequi' | 'nu' | 'efectivo' | 'custom:ID'). Nu tiene su propia pantalla (cajitas, CDTs);
// todas las demás comparten #cuentas-detalle-simple.
// ── Libro (core-state.js) ─────────────────────────────────────────────────────────────────────────────────
// _ogCta(ref, rev): cada sumar/descontarFuente deja en el libro { modulo:'cuentas', ref:<id del movimiento o de la transferencia> }. Con rev=true es una reversión (tipo 'reversion', mismo ref que lo que deshace).
const _ogCta = (ref, rev) => ({ origen: { modulo: 'cuentas', ref, rev: rev || undefined } });

// Al cambiar de cuenta o volver al selector, cada cuenta con pantalla propia (Nu) deja en blanco su estado interno.
function _reiniciarPantallasCuenta() {
  Object.values(CuentaPantallas).forEach(p => { if (p.reiniciar) p.reiniciar(); });
}

function abrirCuenta(fuente) {
  const d = _descriptorCuenta(fuente);
  if (!d) return; // cuenta personalizada ya borrada
  const pantalla = CuentaPantallas[fuente]; // cuenta con pantalla propia (Nu): su archivo la registra
  if (d.pantallaPropia && !pantalla) return;
  cuentaActual = fuente;
  _reiniciarPantallasCuenta();
  _showCuentasPanel(pantalla ? pantalla.panel : 'cuentas-detalle-simple');
  renderDetalleCuenta(fuente);
  document.getElementById('scrollArea').scrollTop = 0;
}

function volverSelector() {
  cuentaActual = '';
  _reiniciarPantallasCuenta();
  _showCuentasPanel('cuentas-selector');
  document.getElementById('scrollArea').scrollTop = 0;
}

function renderDetalleCuenta(fuente) {
  // FIX (auditoria-tecnica.md #5, hallazgo "Cuentas→Encargos"): las llamadas a
  // renderEncargosEnCuenta no tenían guard typeof. Hoy encargos.js carga eager, así
  // que no rompe nada — pero es el acoplamiento exacto que bloquearía volver
  // lazy cuentas o encargos por separado.
  // Una cuenta con pantalla propia (Nu) se pinta a sí misma; las demás comparten el detalle simple.
  const pantalla = CuentaPantallas[fuente];
  if (pantalla) pantalla.render();
  else _renderDetalleSimple(fuente);
  actualizarBotonesTransferir(); // "Mover a otra cuenta" solo activo con saldo >= $1,00
}

// Título del header de cualquier detalle de cuenta: ícono + nombre, siempre desde el descriptor.
// Lo usan el detalle simple (Nequi/Efectivo/personalizadas) y el de Nu (nu.js).
function _tituloCuentaHtml(d) {
  return html`<div style="display:flex;align-items:center;gap:8px;">${d.iconoHtml(28)}<span>${d.nombre}</span></div>`;
}

// Detalle de Nequi, Efectivo y cuentas personalizadas: misma pantalla, el descriptor de la
// cuenta (ver CUENTAS_FIJAS_SELECTOR) aporta nombre, color, etiqueta y saldo.
function _renderDetalleSimple(fuente) {
  const d = _descriptorCuenta(fuente);
  if (!d) return;
  const cont = document.getElementById('cuentas-detalle-simple');
  cont.style.setProperty('--cuenta', d.color);
  cont.style.setProperty('--cuenta-rgb', d.rgb);
  document.getElementById('det-cuenta-nombre').innerHTML = _tituloCuentaHtml(d);
  document.getElementById('det-cuenta-label').textContent = d.etiquetaDetalle;
  document.getElementById('det-cuenta-saldo').textContent = fmt(d.saldo());
  actualizarBotonRetirar(document.getElementById('btn-restar-cuenta-det'), fuente);
  document.getElementById('det-cuenta-acciones-custom').style.display = d.esCustom ? 'flex' : 'none';
  // Banner saldo inicial. El div es único (banner-apertura-cuenta), por eso el elId va explícito:
  // el default de renderBannerApertura armaría un id con el ':' de 'custom:ID'.
  renderBannerApertura(fuente, { elId: 'banner-apertura-cuenta' });
  // Encargos en esta cuenta
  if(typeof renderEncargosEnCuenta==='function') renderEncargosEnCuenta('det-cuenta-encargos', fuente);
  // Movimientos. cuentaKey ('nequi' | 'efectivo' | 'custom') es la clave de los filtros y el
  // valor que abrirDetalleMov() lee de data-cuenta-key; las personalizadas comparten 'custom'.
  renderMovsCuenta('det-cuenta-movs', getMovimientosCuenta(fuente), d.color, d.cuentaKey, 'movs-filtros-cuenta');
}

// renderEncargosEnCuenta() y abrirEncargoDesdeCuenta() migradas a js/modules/encargos.js (ver docs/encargos.md).

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Cuentas personalizadas
   ─────────────────────────────────────────────────────────────── */
/* ---- CUENTAS PERSONALIZADAS ---- */
// Catálogo de íconos de bancos/apps colombianos y genéricos
const ICONOS_CUENTA = [
  { id:'nequi',    label:'Nequi',       color:'#ff4da6', svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20.5 23.3" width="20" height="13"><path d="M19.7 0h-3.4c-.5 0-.8.4-.8.8v13.5c0 .3-.4.4-.5.1L7.1.4C7 .2 6.7 0 6.5 0H.8C.4 0 0 .4 0 .8v21.7c0 .5.4.8.8.8h3.4c.5 0 .8-.4.8-.8v-14c0-.3.4-.4.5-.1L13.6 23c.1.2.4.4.6.4h5.4c.5 0 .8-.4.8-.8V.8c0-.5-.4-.8-.8-.8Z" fill="currentColor"/></svg>` },
  { id:'nu',       label:'Nu',          color:'#c060f0', svg:`<svg viewBox="0 -0.5 1366 750.5" xmlns="http://www.w3.org/2000/svg" width="22" height="12"><g fill="currentColor"><path d="M235.8 70.7C105.6 70.7 0 176.3 0 306.5v421.2h180.9V235.3c0-63.9 25.4-121.9 66.7-164.3-3.9-.2-7.8-.3-11.8-.3zM416.8-.5C350.5-.5 290.5 26.9 247.7 71c124.7 6.2 224 109.3 224 235.5v421.2h180.9V235.3C652.6 105.1 547-.5 416.8-.5zM1130.2 678.8c130.2 0 235.8-105.6 235.8-235.8V21.8h-180.9v492.4c0 63.9-25.4 121.9-66.7 164.3 3.9.2 7.8.3 11.8.3zM949.2 750c66.3 0 126.3-27.4 169.1-71.5-124.7-6.2-224-109.3-224-235.5V21.8H713.4v492.4C713.4 644.4 819 750 949.2 750z"/></g></svg>` },
  { id:'bancolombia', label:'Bancolombia', color:'#000000', svg:`<svg viewBox="0 0 1587 1591" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M229.5 275.5c-9.9-38.6 14.1-82.1 52.9-94.3C580.8 94.7 878.6 38.6 1186.8.6c33.7-3.6 66.5 18.2 78.7 51.6 28.6 78.5 42.7 117.9 70.7 196.8 13.4 37.5-6.4 74.9-42.6 79.7-315.3 46.7-621 110.9-925.9 204.7-37.2 12.4-73.8-6.4-83.2-42.9-22.2-86.2-33.2-129.2-55-215m1353.4 448.6c11.9 36.9-4 72.5-35.1 77.6-490.6 78.8-968.9 210.6-1421.4 417.9-36.4 17.7-73.2-.5-80.9-39.9-17.8-92.4-26.6-138.3-44.1-230.5-6.8-36.1 12.8-77 45.2-92.4C492.2 659.7 962 540.5 1444.5 479c31.8-4.2 63.9 19.4 75.7 54.7 25.5 75.9 38 114 62.7 190.4m-4 516.1c10.7 34.9-3.5 68.9-32.4 75.9-301 73-595.5 164.3-887.1 268.7-41.7 15.8-86.9-4.8-97.9-45.1-23.5-85.8-35.2-128.6-58.3-214.2-9.7-35.9 11.1-74.9 48.1-88.5 291.7-100.2 586.2-178.9 887.4-244.3 33.3-7 68.2 17.6 80.2 55.4 24.4 76.7 36.3 115.1 60 192.1" fill="currentColor"/></svg>` },
  { id:'daviplata', label:'Daviplata',   color:'#dd141d', svg:`<svg viewBox="0 0 50 41" width="22" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M12.35,17.46c.02-.09.04-.18.06-.28.02-.08.03-.17.05-.25.04-.33.05-.64.03-.94,0-.02,0-.03,0-.05,0-.08-.02-.16-.03-.24-.09-.51-.24-.98-.46-1.4,0,0-.01-.02-.01-.03-.06-.11-.12-.21-.18-.31-.04-.07-.08-.13-.13-.2-.03-.04-.06-.08-.09-.13-.06-.09-.12-.16-.18-.24-.07-.08-.14-.16-.21-.24-.02-.02-.03-.03-.05-.05-2.75-2.82-8.74-2.53-10.45-1.78-1.16.51-.76,1.99.51,1.41,2.06-.54,4.05-.53,6.09,0,1.66.43,3.4,1.94,3.4,3.56-.12,4.04-5.26,4.2-7.35,3.67v-5.02c0-1.2-1.49-1.21-1.49,0v5.05c0,1.01.5,1.38,1.17,1.54,1.57.37,8.16.77,9.33-4.09ZM40.13,20.79v-8.85c0-1.4-1.69-1.39-1.69-.02v8.83c0,1.32,1.69,1.37,1.69.05ZM35.89,11.43c-.74,2.18-3.28,8.29-4.81,8.3-1.54.02-4.16-6.03-4.94-8.2-.47-1.3-1.9-.36-1.43.95.84,2.33,3.99,9.37,6.41,9.29,2.41.04,5.43-7.07,6.23-9.42.44-1.31-1-2.23-1.45-.92ZM19.48,10.85c-2.61-.08-5.99,6.97-6.88,9.31-.5,1.3,1.05,2.24,1.55.94.83-2.17,3.67-8.23,5.33-8.22,1.66.01,4.4,6.1,5.21,8.28.49,1.31,2.05.39,1.56-.92-.87-2.35-4.17-9.44-6.78-9.39ZM47.19,11.48c-1.22-1.06-3.19-2.6-4.05-3.27.09-.96.26-1.98.47-2.83.26-1.06.48-2.27-.18-3.16-.45-.6-1.15-.89-2.16-.89h-3.47c-.97,0-1.68.31-2.13.92-.18.25-.31.53-.37.85C31.7,1.13,28.66,0,26.87,0c-3.03.02-10.23,3.64-16.39,8.25-.24.18-.29.52-.12.77.17.25.5.3.74.12C17.71,4.19,24.44,1.11,26.87,1.1c1.71,0,4.95,1.28,8.67,3.39l.92.53-.15-1.08c-.06-.41.01-.76.19-1.01.24-.33.67-.49,1.29-.49h3.47c.66,0,1.09.15,1.32.46.37.5.2,1.37,0,2.22-.24,1-.43,2.21-.52,3.32l-.02.31.24.18c.66.51,2.91,2.25,4.24,3.41,1.99,1.74,2.78,3.33,2.3,4.6-.52,1.37-2.61,2.2-5.2,2.06-.33-.02-.67-.03-.99-.05l-.6-.03.04.62c.11,1.58.66,4.05,2.63,6.79l.02.02c2.1,2.61,2.42,5.76.85,8.42-1.86,3.16-6.5,5.72-12.67,4.31l-.14-.03-.14.05c-1.79.6-4.47.82-5.74.82s-3.95-.22-5.74-.82l-.14-.05-.14.03c-6.17,1.41-10.81-1.15-12.67-4.31-1.57-2.66-1.25-5.81.85-8.42.19-.23.16-.58-.07-.77-.22-.19-.56-.16-.75.07-2.4,2.99-2.75,6.61-.94,9.7,1.1,1.87,2.95,3.41,5.21,4.31,2.53,1.01,5.45,1.2,8.46.54,1.9.6,4.63.83,5.93.83s4.03-.23,5.93-.83c1.22.27,2.38.39,3.48.39,4.87,0,8.51-2.4,10.18-5.24,1.81-3.08,1.46-6.7-.93-9.68-1.57-2.19-2.15-4.16-2.35-5.58.12,0,.25.01.37.02.21.01.41.02.61.02,2.8,0,4.97-1.06,5.62-2.77.46-1.22.39-3.22-2.6-5.84Z" fill="currentColor"/></svg>` },
  { id:'bbva',     label:'BBVA',        color:'#004580', svg:`<svg viewBox="-.004 0 1998.364 600.414" width="26" height="8" xmlns="http://www.w3.org/2000/svg"><path d="m1713.3 0h6.543c7.79 4.95 10.746 14.25 15.035 21.953 59.086 110.74 118.26 221.43 177.42 332.14 28.59 53.934 57.766 107.58 86.062 161.66v1.055c-1.684 3.047-3.027 7.836-7.375 7.41-28.738.09-57.52.148-86.242-.027-6.894.277-8.754-7.25-11.359-12.098-5.227-9.93-10.863-19.61-15.578-29.801-8.066-13.691-14.418-28.277-22.484-41.953-6.195-13.531-14.203-26.082-20.438-39.586-3.852-8.172-8.918-15.7-12.738-23.883-5.664-12.156-13-23.418-18.504-35.66-8.3-14.38-15.168-29.508-23.465-43.891-5.828-12.887-13.586-24.762-19.473-37.621-4.113-8.844-9.617-16.973-13.703-25.844-5.328-11.512-12.414-22.102-17.492-33.727-2.535-4.497-4.277-10.75-9.605-12.551-3.426-.278-8.227-1.141-10.16 2.535-8.957 14.395-15.516 30.105-24.152 44.69-6.18 13.52-14.246 26.067-20.453 39.57-3.688 7.848-8.536 15.083-12.254 22.903-2.825 5.875-5.696 11.73-9.032 17.34-5.902 9.957-10.117 20.809-16.09 30.723-5.21 8.699-8.914 18.203-14.113 26.902-5.46 8.976-9.265 18.816-14.637 27.824-6.148 10.25-10.484 21.453-16.648 31.69-5.195 8.7-8.882 18.189-14.098 26.888-5.46 8.976-9.265 18.816-14.637 27.824-5.785 9.648-10.03 20.105-15.477 29.918-1.86 2.914-3.644 6.574-7.304 7.422-5.621.996-11.375.41-17.055.484-21.973-.016-43.95-.086-65.922.074-3.98-.074-8.754-.015-11.477-3.441-.848-3.735-.543-7.777 1.492-11.07 89.637-168.04 179.46-335.97 269.18-503.98 1.379-2.574 3.851-4.274 6.238-5.871zm-1713.3 80.703c6.148-6.484 15.473-4.363 23.422-4.582 80.035.043 160.05 0 240.09.016 23.539-.793 47.371 2.765 69.465 11.012 37.184 13.34 69.184 43.3 81.219 81.406 5.328 14.453 6.484 30.008 7.555 45.238-.98 16.312-2.957 32.89-9.121 48.164-7.395 17.879-18.066 35.102-33.977 46.598-3.836 3.703-9.782 5.273-12.578 9.93 21.172 7.644 39.383 22.124 53.113 39.8 22.574 29.523 28.855 68.594 25.02 104.84-2.02 23.898-8.887 47.621-21.36 68.2-8.327 12.796-18.604 24.526-31.077 33.43-27.23 20.21-60.93 29.522-94.207 33.358-6.82.926-13.82.426-20.512 2.301h-270.95c-2.254-1.816-4.348-3.836-6.106-6.152v-513.56m89.828 75.082c-2.562 3.133-1.86 7.41-2.004 11.16.23 38.91-.351 77.832.29 116.73 2.386 2.976 6.046 5.012 9.925 4.805 51.738.042 103.49-.06 155.22.058 7.203.309 14.29-1.2 21.391-2.195 16.102-2.344 32.191-8.715 43.422-20.867 7.684-7.645 11.184-18.25 13.773-28.5.629-8.301 3.281-16.637.969-24.926-1.113-14.027-6.809-27.66-16.31-38.074-13.308-12.066-31.124-17.836-48.69-19.961-5.621-.555-11.332.281-16.91-.832-6.938-1.496-14.04-.778-21.066-.863-42.47-.047-84.938.042-127.39-.06-4.422 0-8.844 1.216-12.621 3.528m2.883 210.79c-1.727.543-3.38 1.567-3.907 3.426-3.12 6.035-2.476 12.977-2.445 19.535.059 40.039-.043 80.078.043 120.11.086 5.727 3.277 13.84 10.176 13.137 54.664.027 109.34-.031 164 .016 5.492.187 10.98 0 16.398-.996 19.234-1.641 39.145-5.493 55.352-16.578 13.027-9.227 20.188-24.484 22.97-39.848 3.687-17.734 2.312-36.29-2.84-53.598-4.614-13.355-13.72-25.523-26.485-31.996-16.863-9.286-36.215-12.066-55.117-13.68-57.605.015-115.21.015-172.82 0a24.191 24.191 0 0 0-5.328.468zm440.744-290.03c6.09-.996 12.312-.293 18.461-.41 84.91-.016 169.83.043 254.76-.031 38.383 1.964 77.383 15.39 105.11 42.777 21.082 20.84 33.789 49.438 36.832 78.77-.059 11.613.484 23.258-.32 34.855-3.645 24.895-13.426 49.965-32.164 67.39-5.297 5.551-11.051 10.708-17.785 14.454-1.39 1.171-4.336 1.757-3.47 4.132 21.548 8.786 41.005 23.473 54.399 42.613 5.754 7.895 9.894 16.797 13.879 25.688 7.918 17.88 9.398 37.664 10.555 56.938-.98 14.906-1.875 29.945-5.43 44.531-5.183 25.422-18.402 48.984-36.863 67.113-7.539 6.227-15.152 12.465-23.613 17.414-23.863 14.613-51.633 21.367-79.129 24.996-7.668 1.305-15.574.602-23.145 2.637h-270.77c-4.215-2.46-8.297-6.34-7.758-11.688.032-166.96.032-333.93 0-500.89-.175-4.613 2.578-8.95 6.457-11.289m90.707 76.266c-2.812.66-5.87 1.684-7.379 4.363-2.62 3.707-1.875 8.45-1.976 12.711.133 35.645.043 71.29.027 106.92-.246 4.645 2.844 8.657 6.383 11.305 10.527.926 21.141.106 31.711.368 44.914-.028 89.812.058 134.73-.028 15.066-1.699 30.656-3.664 43.875-11.688 13.617-6.12 22.223-19.375 26.848-33.098 3.484-11.098 2.285-22.828 2.344-34.266-.996-8.113-3.586-16.094-7.277-23.387-10.555-18.117-30.887-28.102-51.062-31.047-7.934-1.992-16.176-.351-24.141-1.992-6.09-1.184-12.297-.598-18.43-.656-43.45-.047-86.898.043-130.34-.059-1.801.012-3.57.188-5.313.555m-2.945 213.79c-4.36.95-6.57 5.55-6.336 9.707-.031 42 .027 83.984-.031 125.97.058 5.348-.528 10.926 1.55 16.008 1.043 3.59 5.434 4.406 8.684 4.48 55.629.075 111.27-.058 166.92.075 7.352.367 14.539-1.524 21.859-1.86 18.75-2.344 38.004-7.746 52.465-20.488 11.406-11.496 16.984-27.59 18.215-43.492 1.46-7.879 1.8-15.949.176-23.828-1.422-17.836-7.656-36.875-22.445-48.016-17.887-13.812-41.078-17.004-62.918-19.055-55.633.016-111.28.016-166.91 0-3.746.09-7.555-.308-11.23.5zm355.702-279.354c-2.648-5.36 2.594-11.805 8.29-11.145 27.343-.016 54.706.133 82.065-.059 3.18-.16 6.691.293 8.39 3.399 6.485 9.957 11.728 20.69 16.939 31.367 3.293 6.824 7.507 13.152 10.805 19.977 6.074 13.164 13.938 25.39 19.953 38.586 8.05 13.69 14.418 28.277 22.473 41.957 6.906 14.789 15.59 28.645 22.41 43.477 5.93 10.37 11.316 21.016 16.69 31.69 6.821 11.056 11.595 23.185 18.329 34.298 4.699 8.172 8.183 16.973 13.043 25.055 6.164 10.238 10.48 21.457 16.645 31.676 6.105 10.254 10.25 21.559 16.82 31.53 2.945 5.536 12.578 5.552 15.535 0 6.543-9.987 10.699-21.276 16.805-31.53 5.445-8.961 9.28-18.79 14.64-27.81 6.15-10.25 10.48-21.452 16.646-31.702 6.09-10.648 10.832-22.027 17.258-32.496 7.496-15.715 16.543-30.605 23.938-46.363 6.062-10.297 11.168-21.09 16.703-31.66 6.472-10.441 10.949-21.938 17.289-32.438 5.476-9.402 9.488-19.551 15.035-28.91 5.62-9.285 9.547-19.461 15.18-28.746 7.527-12.668 12.387-26.93 21.289-38.777 2.02-3.121 5.984-2.418 9.176-2.594 26.863.25 53.742.047 80.605.074 3.648-.41 6.722 2.024 8.449 5.055 1.71 5.05-1.961 9.648-4.278 13.809-85.418 159.65-170.59 319.43-255.98 479.1-4.89 9.121-9.02 19.035-16.586 26.344h-6.441c-9.707-6.078-12.973-17.926-18.52-27.324-86.562-161.92-172.94-323.98-259.59-485.84z" fill="currentColor"/></svg>` },
  { id:'davivienda', label:'Davivienda', color:'#DB343D', svg:`<svg viewBox="0 0 21 17" width="22" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M3.247 7.494C3.288 7.852 3.258 9.347 1.85 11.4.391 13.666 2.697 17.446 7.347 16.487c1.016.362 2.121.413 2.833.407.714.006 1.83-.039 2.848-.396 4.648.96 6.943-2.83 5.484-5.096-1.407-2.054-1.438-3.549-1.399-3.907H3.247Z" fill="#DB343D"/><path d="M10.18 16.871c-4.543-.112-5.368-2.168-4.112-2.597.728-.25 1.689-.671 1.689-.671-.484-2.318.317-5.277 2.436-5.271 2.121-.004 2.893 3.051 2.413 5.324l.969.276c1.182.455.431 2.485-4.112 2.597Z" fill="#2075A9"/><path d="M8.469 15.234c-1.196-3.262-.145-6.402 1.712-6.396 1.773.01 2.974 3.022 1.724 6.412 0 0-.59-.134-1.784-.134-.888 0-1.652.118-1.652.118Z" fill="#F9D93A"/><path d="M10.18 16.905c1.832 0 3.27-.384 3.27-.921 0-.537-1.438-.923-3.27-.923-1.831 0-3.27.386-3.27.923 0 .537 1.439.921 3.27.921Z" fill="#E89133"/><rect x="3.504" y="9.131" width="3.456" height="2.694" rx="0.629" fill="#2075A9"/><rect x="13.401" y="9.131" width="3.456" height="2.694" rx="0.629" fill="#2075A9"/><path d="M3.91 9.947c0-.258.211-.466.475-.466h1.74c.263 0 .476.208.476.466v1.063c0 .257-.213.465-.475.465H4.386c-.264 0-.475-.208-.475-.465V9.947Z" fill="#0F1013"/><path d="M6.602 10.742c-.786-.078-1.059-.98-1.127-1.263h.651c.263 0 .476.21.476.466v.797ZM5.046 9.479c-.05.258-.298 1.226-1.134 1.269V9.947c0-.258.211-.466.475-.466h.66Z" fill="#F9D93A"/><path d="M13.808 9.947c0-.258.211-.466.475-.466h1.74c.263 0 .476.208.476.466v1.063c0 .257-.213.465-.475.465h-1.74c-.264 0-.475-.208-.475-.465V9.947Z" fill="#0F1013"/><path d="M16.499 10.742c-.786-.078-1.059-.98-1.127-1.263h.651c.263 0 .476.21.476.466v.797ZM14.943 9.479c-.05.258-.298 1.226-1.134 1.269V9.947c0-.258.211-.466.475-.466h.66Z" fill="#F9D93A"/><path d="M10.181 7.423c-2.368.002-5.627.201-7.718.36-1.605.121-2.847-1.081-1.78-2.218C2.958 3.146 8.515.09 10.198.09c1.788 0 7.237 3.056 9.512 5.476 1.067 1.137.09 2.217-1.521 2.217-1.798 0-5.542-.358-7.907-.36Z" fill="#E89133"/><path d="M14.73 1.889c-.236-.775-.276-1.163.444-1.165h1.596c.96-.017.565.722.47 1.446-.123.953-.123 1.242-.123 1.242C17.117 3.412 14.731 1.9 14.73 1.889Z" fill="#D22431"/></svg>` },
  { id:'otro',     label:'Otra',        color:'#888880', svg:`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><circle cx="7" cy="15" r="1.2" fill="currentColor" stroke="none"/><path d="M12 15h5"/></svg>` },
];

function getIconoData(iconoId){
  return ICONOS_CUENTA.find(x=>x.id===iconoId)||ICONOS_CUENTA[ICONOS_CUENTA.length-1];
}

function renderIconoCustom(c, size=30){
  const icono=getIconoData(c.icono);
  const hex=c.color||icono.color||'#60b0f0';
  const hexRgb=hexToRgb(hex);
  if(icono && icono.id!=='otro'){
    return html`<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size*.28)}px;background:rgba(${hexRgb},.18);display:flex;align-items:center;justify-content:center;color:${hex};">${raw(icono.svg)}</div>`;
  }
  // Fallback: iniciales (derivadas de c.nombre, texto libre — antes se interpolaban sin
  // escapar; con solo 2 caracteres el vector real era mínimo, pero html`` lo cierra igual
  // que el resto de free text de este archivo, sin depender de que siga siendo así)
  const iniciales=(c.nombre||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  return html`<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size*.28)}px;background:rgba(${hexRgb},.18);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.38)}px;font-weight:700;color:${hex};font-family:'DM Mono',monospace;">${iniciales}</div>`;
}

let _ncColorSel='#60b0f0';
let _ncIconoSel='otro';

function selColorNC(color){
  _ncColorSel=color;
  marcarColorSeleccionado('.nc-color-opt', color); // js/core/color-picker.js
}

function selIconoNC(iconoId){
  _ncIconoSel=iconoId;
  const icono=getIconoData(iconoId);
  // Auto-set color matching the brand
  selColorNC(icono.color);
  // Update icon grid selection
  document.querySelectorAll('.nc-icon-opt').forEach(el=>{
    const sel=el.dataset.icono===iconoId;
    el.style.border=sel?'2px solid var(--accent)':'2px solid var(--border2)';
    el.style.background=sel?`rgba(${hexToRgb(icono.color)},.18)`:'var(--bg3)';
  });
}

function renderIconGrid(){
  const grid=document.getElementById('nc-icon-grid');
  if(!grid)return;
  grid.innerHTML=html`${ICONOS_CUENTA.map(ic=>{
    const sel=ic.id===_ncIconoSel;
    const hexRgb=hexToRgb(ic.color);
    return html`<div class="nc-icon-opt" data-icono="${ic.id}" ${raw(Events.attr('cuentas:selIconoNC', ic.id))}
      style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:9px 4px;border-radius:10px;cursor:pointer;border:2px solid ${sel?'var(--accent)':'var(--border2)'};background:${sel?`rgba(${hexRgb},.18)`:'var(--bg3)'};transition:all .15s;">
      <div style="color:${ic.color};display:flex;align-items:center;justify-content:center;width:24px;height:24px;">${raw(ic.svg)}</div>
      <div style="font-size:9px;font-family:'DM Mono',monospace;color:var(--text3);text-align:center;line-height:1.2;">${ic.label}</div>
    </div>`;
  })}`;
}

function abrirNuevaCuenta(){
  // El sheet también sirve para editar una cuenta (editarCuentaCustom). Cerrarlo tocando el fondo no pasa por
  // "Cancelar" (único que lo reiniciaba), así que se reinicia acá: si no, "Nueva cuenta" podía quedar en modo
  // edición y guardar renombrando la cuenta anterior en vez de crear una.
  _resetSheetNuevaCuenta();
  _ncIconoSel='otro';
  _ncColorSel='#888880';
  renderIconGrid();
  marcarColorSeleccionado('.nc-color-opt', _ncColorSel); // js/core/color-picker.js
  const ni=document.getElementById('nc_nombre');
  const si=document.getElementById('nc_saldo');
  if(ni)ni.value='';
  if(si){si.value='';_moneyDigits.delete(si);}
  openSheet('nueva-cuenta');
}

function crearCuentaCustom(){
  const nombre=(document.getElementById('nc_nombre').value||'').trim();
  if(!nombre){toast('Escribe un nombre para la cuenta','err');return;}
  const saldo=parseMoney(document.getElementById('nc_saldo').value)||0;
  const nueva={id:uid(),tipo:'custom',nombre,icono:_ncIconoSel,color:_ncColorSel,saldo};
  // El saldo inicial es un movimiento de apertura en S.movimientos con `fuente` (igual que Nequi y Efectivo).
  const movApertura=saldo>0?crearMovimientoApertura(saldo,hoy(),'Saldo inicial'):null;
  if(movApertura){movApertura.fuente='custom:'+nueva.id;if(!S.movimientos)S.movimientos=[];S.movimientos.push(movApertura);}
  _cuentasArr().push(nueva);
  if(movApertura)_libroPata('custom:'+nueva.id,saldo,{tipo:'apertura',desc:'Saldo inicial',origen:{modulo:'cuentas',ref:movApertura.id}});
  save();refresh();
  closeSheet('nueva-cuenta');
  toast(`Cuenta "${escHtml(nombre)}" creada`,'ok');
  if(window.logCambio)logCambio('Creaste cuenta "'+nombre+'"','',saldo||0,'cajita');
}

/* ---- CUENTAS DIRIGIDAS POR DATOS (selector + detalle) ----
   Una sola lista de descriptores alimenta la pantalla "Selecciona una cuenta" y el detalle de
   cuenta simple: las cuentas fijas (CUENTAS_FIJAS_SELECTOR) + las personalizadas
   (personalizadas de S.cuentas). Agregar una cuenta fija nueva es agregar un descriptor acá; el
   formato del saldo del selector vive en fmtSaldoSelector() (core-state.js) y el estilo en
   .cuenta-card / .cuenta-pill / .cuenta-hero (styles.css).
   Descriptor: { fuente, nombre, color (texto), rgb (bordes/fondos "r,g,b"), estilo
   ('tarjeta'|'pastilla'), etiqueta (solo tarjeta), etiquetaDetalle (rótulo del saldo en el
   detalle), cuentaKey (clave de filtros de movimientos), esCustom, pantallaPropia (Nu: su detalle lo pinta
   CuentaPantallas[fuente], registrado por su archivo), iconoHtml(size), saldo() }.
   `fuente` es el mismo identificador que usa el resto de la app
   ('nequi' | 'nu' | 'efectivo' | 'custom:ID'). Nu figura acá para el selector (y su color/ícono); su detalle
   es una pantalla propia que se registra en CuentaPantallas (core-state.js). */
const ICONO_EFECTIVO_SELECTOR = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`;
function _iconoEfectivo(size){
  return html`<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size*.28)}px;background:rgba(240,184,64,.15);display:flex;align-items:center;justify-content:center;color:var(--amber);">${raw(ICONO_EFECTIVO_SELECTOR)}</div>`;
}

// Lo propio de cuentas.js para cada cuenta fija (estilo del selector, ícono, saldo). Nombre, color,
// rgb y badge NO se repiten acá: vienen de CUENTAS_FIJAS (core-state.js).
const _SELECTOR_FIJAS_EXTRA = {
  nequi:    { estilo:'tarjeta',  etiqueta:'Saldo',    etiquetaDetalle:'Saldo disponible',       cuentaKey:'nequi',    iconoHtml:size=>renderIconoCustom({icono:'nequi'},size), saldo:()=>getSaldoFuente('nequi') },
  nu:       { estilo:'tarjeta',  etiqueta:'Total Nu', etiquetaDetalle:'Total Nu',               cuentaKey:'nu',       pantallaPropia:true, iconoHtml:size=>renderIconoCustom({icono:'nu'},size),    saldo:()=>nuTotal() },
  efectivo: { estilo:'pastilla',                      etiquetaDetalle:'Disponible en efectivo', cuentaKey:'efectivo', iconoHtml:_iconoEfectivo,                                  saldo:()=>getSaldoFuente('efectivo') },
};
const CUENTAS_FIJAS_SELECTOR = CUENTAS_FIJAS.map(f => ({ ...f, ..._SELECTOR_FIJAS_EXTRA[f.fuente] }));

function _descriptorCustom(c){
  const hex=c.color||(getIconoData(c.icono).color)||'#60b0f0';
  return { fuente:'custom:'+c.id, nombre:c.nombre, color:hex, rgb:hexToRgb(hex), estilo:'pastilla',
    etiquetaDetalle:'Saldo disponible', cuentaKey:'custom', esCustom:true,
    iconoHtml:size=>renderIconoCustom(c,size), saldo:()=>c.saldo||0 };
}

// Descriptor de una cuenta por su fuente; null si no existe (p. ej. personalizada ya borrada).
function _descriptorCuenta(fuente){
  if(fuente.startsWith('custom:')){
    const id=fuente.slice('custom:'.length);
    const c=getCuentaCustom(id);
    return c?_descriptorCustom(c):null;
  }
  return CUENTAS_FIJAS_SELECTOR.find(d=>d.fuente===fuente)||null;
}

function _cuentasSelector(){
  return [...CUENTAS_FIJAS_SELECTOR, ...cuentasCustom().map(c=>_descriptorCustom(c))];
}

function _cuentaSelectorHtml(d){
  const vars='--cuenta:'+d.color+';--cuenta-rgb:'+d.rgb;
  const flecha=(cls,pts)=>html`<svg class="${cls}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><polyline points="${pts}"/></svg>`;
  if(d.estilo==='tarjeta'){
    return html`<div class="cuenta-card" data-fuente="${d.fuente}" style="${vars}">
      <div class="cuenta-card-head">
        ${d.iconoHtml(34)}
        <span class="cuenta-card-nombre">${d.nombre}</span>
      </div>
      <div class="cuenta-card-etiqueta">${d.etiqueta}</div>
      <div class="cuenta-card-saldo">${fmtSaldoSelector(d.saldo())}</div>
      ${flecha('cuenta-card-flecha','9 18 15 12 9 6')}
    </div>`;
  }
  return html`<div class="cuenta-pill" data-fuente="${d.fuente}" style="${vars}">
    <div class="cuenta-pill-info">
      ${d.iconoHtml(30)}
      <div>
        <div class="cuenta-pill-nombre">${d.nombre}</div>
        <div class="cuenta-pill-saldo">${fmtSaldoSelector(d.saldo())}</div>
      </div>
    </div>
    ${flecha('cuenta-pill-flecha','9 18 15 12 9 6')}
  </div>`;
}

function renderSelectorCuentas(){
  const el=document.getElementById('selector-cuentas-lista');
  if(!el)return;
  const cuentas=_cuentasSelector();
  const tarjetas=cuentas.filter(d=>d.estilo==='tarjeta');
  const pastillas=cuentas.filter(d=>d.estilo==='pastilla');
  el.innerHTML=html`${tarjetas.length?html`<div class="cuentas-selector-grid">${tarjetas.map(d=>_cuentaSelectorHtml(d))}</div>`:''}${pastillas.length?html`<div class="cuentas-selector-pills">${pastillas.map(d=>_cuentaSelectorHtml(d))}</div>`:''}`;
}

function hexToRgb(hex){
  if(!hex||hex.length<7)return'96,176,240';
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  return`${r},${g},${b}`;
}

// abrirMovCustom()/confirmarMovCustom() (sheet "mov-cuenta-custom": solo
// monto/nota/fecha, sin toggle de saldo inicial) se retiraron — Agregar/Retirar
// en cuentas personalizadas ahora usan los mismos sheets genéricos
// "agregar-dinero"/"restar-dinero" que Nequi y Efectivo (ver el listener de
// #cuentas-detalle-simple al final de este archivo).
// Se elimina la función completa en vez de dejarla como código muerto sin
// llamador (mismo criterio que en configuracion.js, ver su nota de cabecera
// sobre leerArchivoImport/import-validado.js).

async function eliminarCuentaCustom(id){
  const c=getCuentaCustom(id);
  if(!c)return;
  if((c.saldo||0)>0){
    await dialogo('No se puede eliminar','Para eliminar "'+c.nombre+'" primero retira todo el saldo. Disponible: '+fmt(c.saldo||0)+'.','Entendido',false);
    return;
  }
  // Verificar si algún encargo tiene saldo en esta cuenta
  const tipoCuenta='custom:'+id;
  const encargosConSaldo=[];
  (S.encargos||[]).forEach(enc=>{
    const mapRaw={};
    if(enc.saldoInicial>0){
      const k=enc.cuentaInicial||'__sin__';
      mapRaw[k]=(mapRaw[k]||0)+enc.saldoInicial;
    }
    (enc.movimientos||[]).forEach(m=>{
      const k=m.cuenta||'__sin__';
      if(m.tipo==='entrada') mapRaw[k]=(mapRaw[k]||0)+m.monto;
      else mapRaw[k]=(mapRaw[k]||0)-m.monto;
    });
    let saldo=0;
    Object.entries(mapRaw).forEach(([k,v])=>{if(k===tipoCuenta)saldo+=v;});
    if(saldo>0) encargosConSaldo.push({nombre:enc.nombre,saldo});
  });
  if(encargosConSaldo.length>0){
    const lista=encargosConSaldo.map(e=>'• '+e.nombre+': '+fmt(e.saldo)).join('\n');
    await dialogo(
      'No se puede eliminar',
      'La cuenta "'+c.nombre+'" tiene plata de encargos guardada aquí:\n\n'+lista+'\n\nPrimero devuelve o mueve ese dinero desde cada encargo.',
      'Entendido',
      false
    );
    return;
  }
  const ok=await dialogo('Eliminar cuenta','¿Eliminar "'+c.nombre+'" y su historial? Esta acción no se puede deshacer.','Eliminar',true);
  if(!ok)return;
  S.cuentas=_cuentasArr().filter(x=>x.id!==id);
  save();refresh();
  volverSelector();
  toast(`Cuenta "${escHtml(c.nombre)}" eliminada`,'info');
}

/* ---- Editar cuenta personalizada ---- */
function editarCuentaCustom(id){
  const c=getCuentaCustom(id);
  if(!c)return;
  // Rellenar el sheet reutilizando el mismo form de nueva cuenta
  const ni=document.getElementById('nc_nombre');
  const si=document.getElementById('nc_saldo');
  if(ni) ni.value=c.nombre;
  // Saldo no editable aquí (se maneja con depósitos/retiros), ocultarlo
  if(si){si.value='';si.closest('.ig').style.display='none';}
  // Preseleccionar ícono y color actuales
  _ncIconoSel=c.icono||'otro';
  _ncColorSel=c.color||'#60b0f0';
  // Actualizar UI del picker de color
  marcarColorSeleccionado('.nc-color-opt', _ncColorSel); // js/core/color-picker.js
  // Actualizar UI del picker de ícono: se vuelve a dibujar el grid (así marca SU ícono; antes se dejaba el
  // que hubiera quedado marcado de la última vez que se abrió el sheet).
  renderIconGrid();
  // Cambiar título y botón del sheet
  const titulo=document.querySelector('#sheet-nueva-cuenta .sheet-title');
  if(titulo) titulo.textContent='Editar cuenta';
  const btnCrear=document.getElementById('btn-crear-cuenta-custom');
  if(btnCrear){
    btnCrear.textContent='Guardar cambios';
    btnCrear._editId=id; // marcar modo edición
    btnCrear.onclick=function(){
      const nombre=(document.getElementById('nc_nombre').value||'').trim();
      if(!nombre){toast('Escribe un nombre para la cuenta','err');return;}
      const cc=getCuentaCustom(id);
      if(!cc){closeSheet('nueva-cuenta');return;}
      cc.nombre=nombre;
      cc.icono=_ncIconoSel;
      cc.color=_ncColorSel;
      save();refresh();
      closeSheet('nueva-cuenta');
      // Volver a abrir la cuenta con datos actualizados
      abrirCuenta('custom:'+id);
      toast(`Cuenta "${escHtml(nombre)}" actualizada`,'ok');
      if(window.logCambio)logCambio('Editaste cuenta "'+nombre+'"','',0,'editar');
      // Resetear estado del sheet
      _resetSheetNuevaCuenta();
    };
  }
  openSheet('nueva-cuenta');
}

function _resetSheetNuevaCuenta(){
  const titulo=document.querySelector('#sheet-nueva-cuenta .sheet-title');
  if(titulo) titulo.textContent='Nueva cuenta';
  const btnCrear=document.getElementById('btn-crear-cuenta-custom');
  if(btnCrear){
    btnCrear.textContent='Crear cuenta';
    btnCrear._editId=null;
    btnCrear.onclick=crearCuentaCustom;
  }
  const si=document.getElementById('nc_saldo');
  if(si) si.closest('.ig').style.display='';
}

/* ---- FIN CUENTAS PERSONALIZADAS ---- */

function _showCuentasPanel(panelId){
  // Los paneles de cada cuenta con pantalla propia (Nu) los aporta su registro en CuentaPantallas.
  const panels=['cuentas-selector','cuentas-detalle-simple'].concat(...Object.values(CuentaPantallas).map(p=>p.paneles||[]));
  panels.forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display = id===panelId ? '' : 'none';
  });
}

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Movimientos por cuenta (recopilación desde todas las
   fuentes: manuales, gastos, préstamos, mesada, Spotify, transferencias)
   ─────────────────────────────────────────────────────────────── */
/* ---- HISTORIAL DE UNA CUENTA: UNA sola función (2026-10-04) ---- */
// Antes eran dos funciones casi gemelas (getMovimientosCuenta para Nequi/Efectivo/cajitas y
// _getMovimientosCuentaCustom para las personalizadas) que ya se habían desviado: cada arreglo
// había que hacerlo dos veces, y una fuente nueva había que escribirla dos veces. Ahora hay UN
// bloque por fuente y un predicado `coincide(fuente)` que dice si esa fuente pertenece a la cuenta:
//   'nequi' | 'efectivo' → la fuente exacta   ·   'custom:ID' → la fuente exacta
//   'nu'                 → CUALQUIER cajita ('cajita:...'), para la pantalla de Nu
// Recopila lo que afecta a la cuenta desde todas las fuentes: S.movimientos (el historial de TODAS las cuentas, con
// `fuente`), gastos variables, préstamos dados, transferencias, cobros de Spotify y las
// entradas del libro sin fila propia (intereses, ajustes, CDT).
//
// Todas las cuentas se leen igual: una salida manual es siempre 'salida_manual' (desde 2026-10-18 ya no existe el
// tipo 'egreso' de las personalizadas: su borrado hacía lo mismo que el de 'salida_manual') y, sin descripción,
// los textos son 'Ingreso' / 'Retiro'.
// Cada fila lleva `_movId` (id del registro de origen); ordenado por fecha desc y luego por id desc.
function getMovimientosCuenta(tipo) {
  const esCustom = !!tipo && tipo.startsWith('custom:');
  const coincide = tipo === 'nu' ? (f => !!f && f.startsWith('cajita:')) : (f => f === tipo);
  const tipoSalidaManual = 'salida_manual';
  const textoEntrada = 'Ingreso';
  const textoSalida = 'Retiro';
  const movs = [];
  let _idx = 0;

  // S.movimientos: entradas/salidas manuales, aperturas, intercambios de Encargos, espejos.
  const desdeMovimientos = () => {
    (S.movimientos || []).forEach(m => {
      // Ingreso de Alcancía sin cuenta de origen (propio/regalo/mandado): no movió esta cuenta, así que no
      // es un movimiento de la cuenta y no se lista en su historial (ver alcancia.md §3).
      if (m._esAlcanciaIngreso) return;
      if (!coincide(m.fuente)) return;
      const esEntrada = m.tipo === 'entrada';
      const esApertura = m.tipo === 'apertura';
      const esTransferencia = m.tipo === 'transferencia';
      // Intercambio de Encargos: los flags semánticos dicen si la plata salió (_intercambioSalida) o
      // entró (_intercambioEntrada) de ESTA cuenta; sin flags, _fuenteDestino distinto → salida.
      const esIntercambioSalida = esTransferencia && (
        m._intercambioSalida ? true :
        m._intercambioEntrada ? false :
        !!(m._fuenteDestino && m._fuenteDestino !== m.fuente)
      );
      const tipoDisplay = esApertura ? 'apertura' : esTransferencia ? 'transferencia' : esEntrada ? 'ingreso' : tipoSalidaManual;
      const montoDisplay = esApertura ? +m.monto : esTransferencia ? (esIntercambioSalida ? -m.monto : +m.monto) : esEntrada ? +m.monto : -m.monto;
      let _origen, _otrasCuentas = null;
      if (esApertura) { _origen = 'Saldo inicial'; }
      else if (m._esIntercambioEncargo) {
        _origen = 'Encargos · Intercambio';
        const hermano = (S.movimientos || []).find(x => x._esIntercambioEncargo && x._encMovId === m._encMovId && x.id !== m.id);
        if (hermano) _otrasCuentas = [{ fuente: hermano.fuente, monto: hermano._intercambioSalida ? -hermano.monto : +hermano.monto }];
      }
      else if (esTransferencia) { _origen = 'Cuentas · Movimiento manual'; if (m._fuenteDestino) _otrasCuentas = [{ fuente: m._fuenteDestino, monto: esIntercambioSalida ? +m.monto : -m.monto }]; }
      else if (m._esReposicionCP) { _origen = 'Plata comprometida'; }
      else if (m._encMovId || /encargo/i.test(m.desc || '')) { _origen = 'Encargos'; }
      else if (m._secundario && m._origenSeccion) { _origen = m._origenSeccion; }
      else { _origen = 'Cuentas · Movimiento manual'; }
      movs.push({
        tipo: tipoDisplay, fecha: m.fecha,
        desc: m.desc || (esApertura ? 'Saldo inicial' : esEntrada ? textoEntrada : esTransferencia ? 'Intercambio' : textoSalida),
        monto: montoDisplay, fuente: m.fuente, _idx: _idx++, _movId: m.id, _fuenteOrigen: m.fuente, _fuenteDestino: m._fuenteDestino || '',
        _origen, _otrasCuentas, _secundario: !!m._secundario, _origenSeccion: m._origenSeccion || '', _alcOculto: false
      });
    });
  };

  desdeMovimientos();

  // Gastos variables pagados desde esta cuenta. Los depósitos a la alcancía se muestran como fila
  // visible con el monto oculto (`_alcOculto`).
  (S.gastosVar || []).forEach(g => {
    // Gasto dividido entre varias cuentas: `g.fuente` queda vacío (ver addGastoVar en gastos.js) y cada parte salió de su cuenta,
    // así que cada cuenta muestra SU parte (con las otras cuentas en el detalle). Antes no coincidía con ninguna y no se veía en ninguna.
    if (!g.fuente && g.splits && g.splits.length) {
      g.splits.forEach(sp => {
        if (!sp.fuente || !sp.monto || !coincide(sp.fuente)) return;
        const otras = g.splits.filter(o => o !== sp && o.fuente).map(o => ({ fuente: o.fuente, monto: -o.monto }));
        movs.push({ tipo: 'gasto', fecha: g.fecha, desc: g.desc, monto: -sp.monto, cat: g.cat, fuente: sp.fuente, nota: g.nota, _idx: _idx++, _movId: g.id, _fuenteOrigen: sp.fuente, _origen: 'Gastos', _otrasCuentas: otras.length ? otras : null, _secundario: false, _origenSeccion: '', _alcOculto: false });
      });
      return;
    }
    if (!coincide(g.fuente)) return;
    const _origen = g._esAlcancia ? 'Alcancía' : g._secundario && g._origenSeccion ? g._origenSeccion : g.esPagoGastoFijo ? 'Gastos fijos' : g._esPagoTC ? 'Tarjeta de crédito' : g._esExtraPrestamo ? 'Préstamos' : /encargo/i.test(g.nota || '') ? 'Encargos' : 'Gastos';
    movs.push({ tipo: g._esAlcancia ? 'alcancia' : 'gasto', fecha: g.fecha, desc: g.desc, monto: -g.monto, cat: g.cat, fuente: g.fuente, nota: g.nota, _idx: _idx++, _movId: g.id, _fuenteOrigen: g.fuente, _origen, _otrasCuentas: null, _secundario: !!g._secundario || !!g._esAlcancia, _origenSeccion: g._origenSeccion || (g._esAlcancia ? 'Alcancía' : ''), _alcOculto: !!g._esAlcancia });
  });

  // Préstamos dados desde esta cuenta (incluye los divididos entre varias cuentas).
  Deudas.lista('favor').forEach(d => {
    (d.movimientos || []).forEach(m => {
      const matchFuente = coincide(m.fuente);
      if (m.tipo === 'prestamo' && (matchFuente || (m.fuentes && m.fuentes.length))) {
        const _origenP = 'Préstamos · ' + d.nombre;
        if (matchFuente) {
          const otrasFuentesSplit = (m.fuentes || []).filter(f => f.fuente !== m.fuente).map(f => ({ fuente: f.fuente, monto: -f.monto }));
          movs.push({ tipo: 'prestamo', fecha: m.fecha, desc: 'Préstamo a ' + d.nombre, monto: -m.monto, nota: m.nota, fuente: m.fuente, _idx: _idx++, _movId: m.id, _fuenteOrigen: m.fuente, _origen: _origenP, _otrasCuentas: otrasFuentesSplit.length ? otrasFuentesSplit : null });
        }
        (m.fuentes || []).forEach(f => {
          if (coincide(f.fuente) && f.monto) {
            const otras = (m.fuentes || []).filter(f2 => f2.fuente !== f.fuente).map(f2 => ({ fuente: f2.fuente, monto: -f2.monto }));
            if (m.fuente) otras.push({ fuente: m.fuente, monto: -m.monto });
            movs.push({ tipo: 'prestamo', fecha: m.fecha, desc: 'Préstamo a ' + d.nombre, monto: -f.monto, nota: m.nota, fuente: f.fuente, _idx: _idx++, _movId: m.id, _fuenteOrigen: f.fuente, _origen: _origenP, _otrasCuentas: otras.length ? otras : null });
          }
        });
      }
    });
  });

  // NOTA (2026-08-30): no hay un bloque "Mesadas recibidas en esta cuenta": duplicaba cada pago de
  // mesada con un movimiento fantasma sin candado. mesada.js ya genera el espejo real vía
  // _registrarMovSecundarioMesada() (en S.movimientos con _secundario:true), que desdeMovimientos()
  // recorre. No volver a sintetizar el pago desde S.mesadas. Ver CHANGELOG.md#mesada.

  // Cobros de Spotify a personas (los pagos del plan ya están en gastosVar) + abonos posteriores de lo
  // pendiente, cada uno como su propia fila. Cada abono puede haber ido a una cuenta distinta a la del
  // cobro original, así que se filtra por su propio `destino`, no por `h.fuente`.
  (S.spotify.historial || []).forEach((h, _spIdx) => {
    if (h.tipo === 'pago') return;
    // h.monto acumula el cobro original + los abonos ya recibidos (confirmarSpResolverPendiente): hay que
    // restar los abonos para no contar la misma plata dos veces (una acá, otra en su propia fila).
    const historialPendTotal = (h.pendienteHistorial || []).reduce((a, ab) => a + (ab.monto || 0), 0);
    const montoOriginalCobro = Math.max(0, (h.monto || 0) - historialPendTotal);
    if (coincide(h.fuente)) {
      // Sin id (historial antiguo): _movId estable a partir del índice, para que el orden funcione igual.
      movs.push({ tipo: 'ingreso', fecha: h.fecha, desc: 'Cobro Spotify (' + h.nombre + ')', monto: +montoOriginalCobro, fuente: h.fuente, _idx: _idx++, _movId: h.id || ('sp_legacy_' + _spIdx), _origen: 'Spotify', _otrasCuentas: null, _secundario: true, _origenSeccion: 'Spotify' });
    }
    (h.pendienteHistorial || []).forEach(ab => {
      if (!coincide(ab.destino)) return;
      movs.push({ tipo: 'ingreso', fecha: ab.fecha, desc: 'Abono pendiente Spotify (' + h.nombre + ')', monto: +ab.monto, fuente: ab.destino, _idx: _idx++, _movId: ab.id, _origen: 'Spotify', _otrasCuentas: null, _secundario: true, _origenSeccion: 'Spotify' });
    });
  });

  // Transferencias entre cuentas. Un depósito a la alcancía (t.destino==='alcancia') solo hace match
  // como origen (ninguna cuenta real se llama 'alcancia'): fila visible, monto oculto, sin "otras
  // cuentas" (la alcancía no es una cuenta navegable). Ver docs/alcancia.md §3.
  (S.transferencias || []).forEach(t => {
    const esAlc = t.destino === 'alcancia';
    if (coincide(t.origen)) {
      movs.push({
        tipo: esAlc ? 'alcancia' : 'transferencia',
        fecha: t.fecha,
        desc: esAlc ? (t.desc || 'Depósito en alcancía') : 'Transferencia → ' + fuenteLabel(t.destino),
        monto: -t.monto, nota: t.nota, fuente: t.origen,
        _idx: _idx++, _movId: t.id, _fuenteOrigen: t.origen, _fuenteDestino: t.destino,
        _origen: esAlc ? 'Alcancía' : 'Cuentas · Transferencia',
        _otrasCuentas: esAlc ? null : [{ fuente: t.destino, monto: +t.monto }],
        _secundario: esAlc || !!t._secundario, _origenSeccion: esAlc ? 'Alcancía' : '',
        _alcOculto: esAlc
      });
    }
    if (coincide(t.destino)) {
      movs.push({ tipo: 'transferencia', fecha: t.fecha, desc: 'Transferencia ← ' + fuenteLabel(t.origen), monto: +t.monto, nota: t.nota, fuente: t.destino, _idx: _idx++, _movId: t.id, _fuenteOrigen: t.origen, _fuenteDestino: t.destino, _origen: 'Cuentas · Transferencia', _otrasCuentas: [{ fuente: t.origen, monto: -t.monto }] });
    }
  });

  // Entradas del LIBRO sin fila de módulo (intereses de Nu, ajustes del chequeo rápido, CDT): sin ellas el historial no sumaba el saldo de la cuenta y esa plata "aparecía de la nada".
  // Van como filas automáticas (_secundario: con candado, sin botón de eliminar). Ver Libro.entradasVisibles (core-state.js).
  Libro.entradasVisibles().forEach(l => {
    if (!coincide(l.cuenta)) return;
    const etiqueta = l.tipo === 'rendimiento' ? 'Intereses de Nu' : l.tipo === 'cdt' ? 'CDT' : l.tipo === 'apertura' ? 'Saldo inicial' : 'Ajuste';
    movs.push({
      tipo: l.tipo === 'apertura' ? 'apertura' : l.monto > 0 ? 'ingreso' : tipoSalidaManual,
      fecha: l.fecha, desc: l.desc || etiqueta, monto: l.monto, fuente: l.cuenta, _idx: _idx++, _movId: l.id,
      _fuenteOrigen: l.cuenta, _fuenteDestino: '', _origen: 'Libro · ' + etiqueta, _otrasCuentas: null,
      _secundario: true, _origenSeccion: etiqueta, _alcOculto: false
    });
  });

  // Orden: fecha desc y luego por creación desc (_movId empieza con Date.now().toString(36), así que
  // comparar el id en texto da el orden de inserción). Sin id en alguno, va primero el que sí tiene
  // (timestamp confiable); si ninguno tiene, por orden de recolección.
  movs.sort((a, b) => {
    const dateCmp = (b.fecha || '').localeCompare(a.fecha || '');
    if (dateCmp !== 0) return dateCmp;
    const aId = a._movId || '';
    const bId = b._movId || '';
    if (aId && bId) return bId.localeCompare(aId);
    if (aId) return -1;
    if (bId) return 1;
    return (b._idx || 0) - (a._idx || 0);
  });
  return movs;
}

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Motor de filtros de movimientos (búsqueda / tipo / fechas)
   ─────────────────────────────────────────────────────────────── */
const _movsFilters = {}; // { cuentaKey: { q:'', tipo:'todos', desde:'', hasta:'' } }

function _getMovsFilter(cuentaKey) {
  if (!_movsFilters[cuentaKey]) _movsFilters[cuentaKey] = { q: '', tipo: 'todos', desde: '', hasta: '' };
  return _movsFilters[cuentaKey];
}

function renderMovsFiltros(elId, cuentaKey, movs, accentColor) {
  const wrap = document.getElementById(elId);
  if (!wrap) return;
  const f = _getMovsFilter(cuentaKey);

  // Tipos presentes en los movimientos
  const tiposPresentes = new Set(movs.map(m => m.tipo));
  const tiposConfig = [
    { val: 'todos', label: 'Todos' },
    { val: 'ingreso', label: 'Ingreso' },
    { val: 'salida_manual', label: 'Retiro' },
    { val: 'gasto', label: 'Gasto' },
    { val: 'transferencia', label: 'Transferencia' },
    { val: 'mesada', label: 'Mesada' },
    { val: 'prestamo', label: 'Préstamo' },
    { val: 'abono', label: 'Abono' },
    { val: 'alcancia', label: 'Alcancía' },
  ].filter(t => t.val === 'todos' || tiposPresentes.has(t.val));

  wrap.innerHTML = html`
    <div class="movs-search-wrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="movs-search-input" placeholder="Buscar movimiento..." value="${f.q}">
    </div>
    <div class="movs-tipo-chips">
      ${tiposConfig.map(t => html`<div class="movs-chip${f.tipo===t.val?' active':''}" ${raw(Events.attr('cuentas:movsOnTipo', t.val, cuentaKey))}>${t.label}</div>`)}
    </div>
    <div class="movs-fecha-row">
      <span class="movs-fecha-label">Desde</span>
      <input type="date" class="movs-fecha-desde" value="${f.desde}">
      <span class="movs-fecha-label">Hasta</span>
      <input type="date" class="movs-fecha-hasta" value="${f.hasta}">
      ${(f.desde||f.hasta)?html`<button ${raw(Events.attr('cuentas:movsLimpiarFechas', cuentaKey))} style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:11px;font-family:'DM Mono',monospace;white-space:nowrap;padding:0 2px;">× fechas</button>`:''}
    </div>
  `;
  // Reemplaza los oninput/onchange inline (CSP los bloquea). Delegado,
  // enganchado una sola vez por wrap. El wrap de la cuenta simple
  // (movs-filtros-cuenta) lo comparten Nequi, Efectivo y las personalizadas, así que su
  // cuentaKey cambia entre renders: los listeners leen wrap._movsKey (se actualiza en cada
  // render) en vez de cerrar sobre cuentaKey — igual que el bug de `items` en
  // renderAttencion() (Inicio), cerrar sobre un valor que cambia dejaría filtrando la cuenta
  // equivocada.
  wrap._movsKey = cuentaKey;
  if(!wrap._movsFiltrosHooked){
    wrap._movsFiltrosHooked = true;
    wrap.addEventListener('input', (e)=>{
      if(e.target.classList.contains('movs-search-input')) _movsOnSearch(e.target, wrap._movsKey);
    });
    wrap.addEventListener('change', (e)=>{
      if(e.target.classList.contains('movs-fecha-desde')) _movsOnFecha('desde', e.target.value, wrap._movsKey);
      else if(e.target.classList.contains('movs-fecha-hasta')) _movsOnFecha('hasta', e.target.value, wrap._movsKey);
    });
  }
}

function _movsOnSearch(input, cuentaKey) {
  _getMovsFilter(cuentaKey).q = input.value;
  _movsRefresh(cuentaKey);
}
function _movsOnTipo(tipo, cuentaKey) {
  _getMovsFilter(cuentaKey).tipo = tipo;
  _movsRefresh(cuentaKey);
}
function _movsOnFecha(campo, val, cuentaKey) {
  _getMovsFilter(cuentaKey)[campo] = val;
  _movsRefresh(cuentaKey);
}
function _movsLimpiarFechas(cuentaKey) {
  const f = _getMovsFilter(cuentaKey);
  f.desde = ''; f.hasta = '';
  _movsRefresh(cuentaKey);
}

function _movsRefresh(cuentaKey) {
  // 'custom' es la clave compartida de las personalizadas: la cuenta es la abierta ahora.
  const fuente = cuentaKey === 'custom' ? (cuentaActual.startsWith('custom:') ? cuentaActual : '') : cuentaKey;
  if (fuente) renderDetalleCuenta(fuente);
}

function _movsAplicarFiltro(movs, cuentaKey) {
  const f = _getMovsFilter(cuentaKey);
  let res = movs;
  if (f.tipo && f.tipo !== 'todos') res = res.filter(m => m.tipo === f.tipo);
  if (f.q && f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    res = res.filter(m => (m.desc||'').toLowerCase().includes(q) || (m.nota||'').toLowerCase().includes(q) || (m.fecha||'').includes(q));
  }
  if (f.desde) res = res.filter(m => (m.fecha||'') >= f.desde);
  if (f.hasta) res = res.filter(m => (m.fecha||'') <= f.hasta);
  return res;
}

function renderMovsCuenta(elId, movs, accentColor, cuentaKey, filtrosElIdExplicito) {
  const el = document.getElementById(elId);
  if (!el) return;

  // Render filtros (siempre, aunque no haya movs)
  const filtrosElId = filtrosElIdExplicito || ('movs-filtros-' + (cuentaKey || ''));
  if (cuentaKey) renderMovsFiltros(filtrosElId, cuentaKey, movs, accentColor);

  // Aplicar filtros
  const filtrados = cuentaKey ? _movsAplicarFiltro(movs, cuentaKey) : movs;

  if (!movs.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0 4px;">No hay movimientos registrados en esta cuenta.</div>';
    return;
  }
  if (!filtrados.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:10px 0 4px;text-align:center;">Sin resultados para esos filtros.</div>';
    return;
  }

  el.innerHTML = html`${filtrados.map(m => {
    const esSalida = m.tipo === 'salida_manual' || m.tipo === 'gasto';
    const esApertura = m.tipo === 'apertura';
    const esPositivo = esApertura ? true : esSalida ? false : m.monto > 0;
    const colorMonto = esApertura ? 'var(--blue)' : esPositivo ? 'var(--accent)' : 'var(--red)';
    const signo = esApertura ? '' : esPositivo ? '+' : '−';
    const tipoLabel = { gasto: 'Gasto', ingreso: 'Ingreso', apertura: 'Apertura', prestamo: 'Préstamo', abono: 'Abono', alcancia: 'Alcancía', mesada: 'Mesada', transferencia: 'Transferencia', salida_manual: 'Retiro' }[m.tipo] || m.tipo;
    const bgLabel = esApertura ? 'bg-blue' : esPositivo ? 'bg-green' : m.tipo === 'gasto' || m.tipo === 'salida_manual' ? 'bg-red' : m.tipo === 'transferencia' ? 'bg-blue' : 'bg-amber';
    const dataId = m._movId ? html`data-mov-id="${m._movId}"` : '';
    const dataTipo = html`data-mov-tipo="${m.tipo}"`;
    const dataFuente = m._fuenteOrigen ? html`data-mov-fuente="${m._fuenteOrigen}"` : '';
    const dataDestino = m._fuenteDestino ? html`data-mov-destino="${m._fuenteDestino}"` : '';
    const dataMonto = m._alcOculto ? '' : html`data-mov-monto="${Math.abs(m.monto)}"`; // fila de Alcancía: el monto no va ni al DOM
    const dataFuenteReal = m.fuente ? html`data-mov-fuente-real="${m.fuente}"` : '';
    const dataFecha = html`data-mov-fecha="${m.fecha}"`;
    const dataOrigen = m._origen ? html`data-mov-origen="${m._origen}"` : '';
    const dataOtras = m._otrasCuentas ? html`data-mov-otras="${JSON.stringify(m._otrasCuentas)}"` : '';
    const esSecundarioHist = !!m._secundario;
    const puedeEliminar = !!m._movId && !esSecundarioHist;
    // Depósito a la alcancía: la fila se ve (para saber que salió/entró plata) pero el monto va
    // oculto (tampoco se escribe data-mov-monto) y no abre el detalle, que mostraría monto y
    // saldos antes/después. Sin botón eliminar (siempre _secundario). El Antes/Después de las
    // OTRAS filas no depende del DOM sino de getMovimientosCuenta(), que sí incluye estas filas.
    const alcOculto = !!m._alcOculto;
    const puedeVerDetalle = !!m.fuente && !alcOculto;
    return html`<div class="gasto-item" ${dataId} ${dataTipo} ${dataFuente} ${dataDestino} ${dataMonto} ${dataFuenteReal} ${dataFecha} ${dataOrigen} ${dataOtras} ${puedeVerDetalle ? raw('data-cuenta-key="'+escHtml(cuentaKey)+'" style="cursor:pointer;" data-action="core:abrirDetalleMov"') : ''}>
      <div class="gasto-item-top">
        <div style="flex:1;min-width:0;">
          <div class="row-name" style="font-size:13px;display:flex;align-items:center;gap:6px;">${m.desc}${esSecundarioHist ? html`<span style="display:inline-flex;align-items:center;gap:2px;font-size:9px;color:var(--text3);background:var(--bg2);border-radius:4px;padding:1px 5px;white-space:nowrap;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Automático</span>` : ''}</div>
          <div class="row-sub" style="font-family:'DM Mono',monospace;">${m.fecha || '—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${alcOculto
            ? html`<div title="Monto oculto — se ve dentro de Alcancía" style="display:flex;align-items:center;color:var(--text3);"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="6" viewBox="0 0 32 6" fill="currentColor" role="img" aria-label="Monto oculto" style="display:block"><circle cx="2" cy="3" r="2"/><circle cx="11.3333" cy="3" r="2"/><circle cx="20.6667" cy="3" r="2"/><circle cx="30" cy="3" r="2"/></svg></div>`
            : html`<div style="font-size:14px;font-weight:500;font-family:'DM Mono',monospace;color:${colorMonto};">${signo} ${fmt(Math.abs(m.monto))}</div>`}
          ${puedeEliminar ? html`<button type="button" class="btn-icon" data-action="core:eliminarMovimiento" data-stop-propagation="true" title="Eliminar movimiento" style="color:var(--text3);min-width:32px;min-height:32px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>` : esSecundarioHist && m._movId ? html`<span title="Generado automáticamente — elimínalo desde ${m._origenSeccion||'la sección de origen'}" style="display:flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;color:var(--text3);opacity:.4;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>` : ''}
        </div>
      </div>
      <div class="gasto-item-meta">
        ${alcOculto ? '' : html`<span class="badge ${bgLabel}" style="font-size:9px;">${tipoLabel}</span>`}
        ${(m._alcOculto || m._origen === 'Alcancía oculta') ? html`<span class="badge" style="font-size:9px;background:rgba(240,184,64,.18);color:var(--amber);border:none;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Alcancía</span>` : ''}
        ${(()=>{ const cn=getCajitaNombre(m.fuente); return cn?html`<span class="badge bg-nu" style="font-size:9px;">${cn}</span>`:''; })()}
        ${m.cat ? html`<span class="badge bg-blue" style="font-size:9px;">${m.cat}</span>` : ''}
        ${m.nota ? html`<span style="font-size:10px;color:var(--text3);">${m.nota}</span>` : ''}
        ${m.tipo === 'transferencia' && m._fuenteDestino ? html`<span style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="width:11px;height:11px;fill:currentColor;vertical-align:middle;"><path fill-rule="evenodd" d="M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5zm14-7a.5.5 0 0 1-.5.5H2.707l3.147 3.146a.5.5 0 1 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 4H14.5a.5.5 0 0 1 .5.5z"/></svg> ${fuenteLabel(m._fuenteDestino||m._fuenteOrigen)}</span>` : ''}
      </div>
    </div>`;
  })}`;
}

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Agregar dinero / saldo inicial-apertura / restar dinero /
   entró-salió plata en Nu / transferir entre cuentas
   ─────────────────────────────────────────────────────────────── */
/* ---- AGREGAR DINERO ---- */
let adFuente='';

function abrirAgregarDinero(fuente,nombre){
  save();
  adFuente=fuente;
  const label=nombre||(fuente==='nequi'?'Nequi':fuente==='efectivo'?'Efectivo':'Cuenta');
  document.getElementById('adTitle').textContent='Agregar a '+label;
  const actual=getSaldoActual(fuente);
  document.getElementById('adSaldoActual').textContent=fmt(actual);
  document.getElementById('adMonto').value='';
  document.getElementById('adDesc').value='';
  document.getElementById('adFecha').value=hoy();
  const adNotaEl=document.getElementById('adNota');
  if(adNotaEl)adNotaEl.value='';
  document.getElementById('adPreview').textContent='';
  // Reset apertura toggle
  const chk=document.getElementById('adEsApertura');
  if(chk){chk.checked=false;}
  const lbl=document.getElementById('adDescLabel');
  if(lbl)lbl.innerHTML='¿De dónde viene esta plata? <span style="color:var(--red);">*</span>';
  const inp=document.getElementById('adDesc');
  if(inp)inp.placeholder='Ej: Mesada, regalo, venta, sueldo...';
  openSheet('agregar-dinero');
  setTimeout(()=>document.getElementById('adDesc').focus(),200);
}

/* ---- SALDO INICIAL / APERTURA — núcleo reutilizable ----
   Cualquier sheet que agregue dinero a una fuente (cuenta, cajita, etc.)
   y quiera ofrecer el toggle "Es saldo inicial" debe usar estas 2 funciones
   en vez de reimplementar el comportamiento:
     1) _aperturaToggleUI(ids)   -> maneja el cambio de label/placeholder al marcar/desmarcar
     2) registrarEntradaConApertura(...) -> aplica el saldo + crea el movimiento correcto
   Así, agregar un nuevo sheet con este patrón es solo: poner el wrap HTML
   (copiando el de adAperturaWrap), darle ids propios, y llamar estas 2 funciones. */

function _aperturaToggleUI(ids){
  // ids = {chk, lbl, inp, notaPlaceholder, descPlaceholder}
  const chk=document.getElementById(ids.chk);
  if(!chk)return;
  const lbl=ids.lbl?document.getElementById(ids.lbl):null;
  const inp=ids.inp?document.getElementById(ids.inp):null;
  const notaPh=ids.notaPlaceholder||'Ej: Ahorros de varios meses...';
  const descPh=ids.descPlaceholder||'Ej: Mesada, regalo, venta, sueldo...';
  if(chk.checked){
    if(lbl)lbl.innerHTML='Nota opcional <span style="color:var(--text3);font-weight:400;">(ej: ahorros de varios meses)</span>';
    if(inp)inp.placeholder=notaPh;
  } else {
    if(lbl)lbl.innerHTML='¿De dónde viene esta plata? <span style="color:var(--red);">*</span>';
    if(inp)inp.placeholder=descPh;
  }
}

function registrarEntradaConApertura(fuente,monto,fecha,desc,esApertura,nota){
  // Aplica el monto a la fuente y registra el movimiento con el tipo correcto.
  // Devuelve la descripción final (por si el caller la necesita para toasts/log).
  // `nota` es opcional — ver auditoria-tecnica.md / guia-estilo-sheets.md
  // (2026-08-22): el campo Nota de estos sheets existía en el HTML desde antes
  // pero nunca se leía ni se guardaba en el movimiento.
  if(!S.movimientos)S.movimientos=[];
  let mov;
  if(esApertura){
    mov=crearMovimientoApertura(monto,fecha,desc);
    mov.fuente=fuente;
  } else {
    mov={id:uid(),tipo:'entrada',clase:'ingreso',fuente,monto,fecha,desc:desc||''};
  }
  if(nota)mov.nota=nota;
  S.movimientos.push(mov);
  sumarFuente(fuente,monto,_ogCta(mov.id)); // el saldo se aplica una vez creado el movimiento, para que el libro apunte a su id
  return mov.desc;
}

function registrarSalida(fuente,monto,fecha,desc,nota){
  // Simétrico a registrarEntradaConApertura: descuenta de la fuente y registra
  // el movimiento de salida manual. Cualquier sheet que reste dinero de una
  // fuente (cuenta, cajita, etc.) debe usar esto en vez de reimplementar
  // descontarFuente + push manual a S.movimientos.
  // `nota` es opcional — ver nota en registrarEntradaConApertura de arriba.
  if(!S.movimientos)S.movimientos=[];
  // clase 'gasto': plata que sale del patrimonio sin pasar por un gasto registrado (simétrico a sumar dinero = ingreso;
  // en la práctica se usa para cuadrar la diferencia entre lo registrado y lo real). Cuenta en Periodo.gastosDelMes.
  const mov={id:uid(),tipo:'salida_manual',clase:'gasto',fuente,monto,fecha,desc:desc||''};
  if(nota)mov.nota=nota;
  S.movimientos.push(mov);
  descontarFuente(fuente,monto,_ogCta(mov.id));
  return mov.desc;
}

function toggleAdApertura(){
  _aperturaToggleUI({chk:'adEsApertura',lbl:'adDescLabel',inp:'adDesc'});
}

document.addEventListener('input',function(e){
  if(e.target.id==='adMonto'){
    const v=parseMoney(e.target.value)||0;
    const actual=getSaldoActual(adFuente);
    const prev=document.getElementById('adPreview');
    if(v>0){prev.textContent=fmt(actual)+' + '+fmt(v)+' = '+fmt(actual+v);prev.style.color='var(--accent)';}
    else{prev.textContent='';}
  }
});

function confirmarAgregarDinero(){
  const v=parseMoney(document.getElementById('adMonto').value)||0;
  const desc=document.getElementById('adDesc').value.trim();
  const fecha=document.getElementById('adFecha').value||hoy();
  const nota=document.getElementById('adNota')?.value.trim()||'';
  const esApertura=document.getElementById('adEsApertura')?.checked||false;
  if(!esApertura&&!desc){toast('Describe de dónde viene esta plata','err');return;}
  if(!v){toast('Ingresa un monto válido','err');return;}
  if(!adFuente)return;
  // Los intereses de una cajita se materializan solos al sumar (sumarFuente, core-state.js).
  const descFinal=registrarEntradaConApertura(adFuente,v,fecha,desc,esApertura,nota);
  save();
  closeSheet('agregar-dinero');
  refresh();
  if(window.logCambio){const _fLabel=fuenteLabel(adFuente);const _accion=esApertura?'Saldo inicial en '+_fLabel:'Agregaste dinero en '+_fLabel;const _cjId=adFuente&&adFuente.startsWith('cajita:')?adFuente.split(':')[1]:null;logCambio(_accion,descFinal||'',v,'ingreso',_cjId);}
  adFuente='';
toast(fmt(v) + (esApertura?' registrado como saldo inicial':' agregado — ' + escHtml(descFinal)), 'ok');
}

function openSheet_adMenu(){
  poblarFuente('adMenuDest');
  // Replace options with all accounts including all cajitas (sin tarjetas de crédito — no son destino válido)
  const sel=document.getElementById('adMenuDest');
  const fuentes=getFuentesSinTC();
  sel.innerHTML=html`${fuentes.map(f=>html`<option value="${f.val}">${f.label}</option>`)}`;
  actualizarAdMenuSaldo();
  document.getElementById('adMenuMonto').value='';
  document.getElementById('adMenuDesc').value='';
  document.getElementById('adMenuFecha').value=hoy();
  const adMenuNotaEl=document.getElementById('adMenuNota');
  if(adMenuNotaEl)adMenuNotaEl.value='';
  document.getElementById('adMenuPreview').textContent='';
}

function actualizarAdMenuSaldo(){
  const fuente=document.getElementById('adMenuDest').value;
  const actual=getSaldoActual(fuente);
  document.getElementById('adMenuSaldo').textContent='Saldo actual: '+fmt(actual);
  actualizarAdMenuPreview();
}

function actualizarAdMenuPreview(){
  const fuente=document.getElementById('adMenuDest').value;
  const v=parseMoney(document.getElementById('adMenuMonto').value)||0;
  const actual=getSaldoActual(fuente);
  const prev=document.getElementById('adMenuPreview');
  if(v>0){prev.textContent=fmt(actual)+' + '+fmt(v)+' = '+fmt(actual+v);prev.style.color='var(--accent)';}
  else{prev.textContent='';}
}

function confirmarAgregarDineroMenu(){
  const fuente=document.getElementById('adMenuDest').value;
  const v=parseMoney(document.getElementById('adMenuMonto').value)||0;
  const desc=document.getElementById('adMenuDesc').value.trim();
  const fecha=document.getElementById('adMenuFecha').value||hoy();
  const nota=document.getElementById('adMenuNota')?.value.trim()||'';
  if(!desc){toast('Describe de dónde viene esta plata','err');return;}
  if(!v||!fuente)return;
  // Registrar movimiento de entrada
  if(!S.movimientos)S.movimientos=[];
  const _movAdMenu={id:uid(),tipo:'entrada',clase:'ingreso',fuente,monto:v,fecha,desc};
  if(nota)_movAdMenu.nota=nota;
  S.movimientos.push(_movAdMenu);
  sumarFuente(fuente,v,_ogCta(_movAdMenu.id));
  save();
  closeSheet('agregar-dinero-menu');
  refresh();
  if(window.logCambio){const _fLabel=fuenteLabel(fuente);const _cjId2=fuente&&fuente.startsWith('cajita:')?fuente.split(':')[1]:null;logCambio('Agregaste dinero en '+_fLabel,desc,v,'ingreso',_cjId2);}
  toast(fmt(v) + ' agregado — ' + escHtml(desc), 'ok');
}


/* ---- SALDO INICIAL / APERTURA ---- */
let _eaFuente=''; // 'nequi' | 'efectivo'

function getAperturaMov(fuente){
  // Busca el movimiento de apertura de S.movimientos para nequi/efectivo/custom
  // (registrado desde el banner "Registrar saldo inicial" o desde el toggle
  // del sheet "Agregar dinero").
  return (S.movimientos||[]).find(m=>m.fuente===fuente&&m.tipo==='apertura');
}

function renderBannerApertura(fuente,opts){
  // opts.elId: id explícito del contenedor. Necesario para 'custom:ID' — el
  // default 'banner-apertura-'+fuente le metería el ':' del id de la cuenta
  // al id del elemento, y de todas formas la pantalla de cuenta personalizada
  // es una sola plantilla reusada (no un div por cuenta).
  const elId=(opts&&opts.elId)||('banner-apertura-'+fuente);
  const el=document.getElementById(elId);
  if(!el)return;
  // Config "Saldo inicial" (cfg-corregirSaldo, ver index.html/configuracion.js):
  // el toggle decía en su descripción "Muestra el banner de saldo inicial en
  // Nequi y Efectivo" pero renderBannerApertura() no lo estaba chequeando —
  // se agrega acá, aplicando parejo a Nequi/Efectivo/cuentas personalizadas.
  if(S.modulos?.corregirSaldo===false){el.innerHTML='';return;}
  const mov=getAperturaMov(fuente);
  const colorMap={nequi:'#ff4da6',efectivo:'var(--amber)'};
  const color=colorMap[fuente]||'var(--blue)';
  if(mov){
    // Ya tiene saldo inicial — mostrar chip con valor y botón editar discreto
    el.innerHTML=html`<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(96,176,240,.06);border:1px solid rgba(96,176,240,.18);border-radius:9px;padding:9px 13px;margin-bottom:12px;">
      <div>
        <div style="font-size:9px;color:var(--blue);text-transform:uppercase;letter-spacing:.8px;font-family:'DM Mono',monospace;margin-bottom:2px;">Saldo inicial registrado</div>
        <div style="font-size:15px;font-weight:500;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(mov.monto)}</div>
      </div>
      <button type="button" ${raw(Events.attr('cuentas:abrirEditarApertura', fuente))} style="background:none;border:1px solid rgba(96,176,240,.3);border-radius:7px;color:var(--blue);font-size:11px;font-weight:600;padding:5px 11px;cursor:pointer;font-family:'DM Sans',sans-serif;">Corregir</button>
    </div>`;
  } else {
    // No tiene saldo inicial — mostrar botón para registrarlo
    el.innerHTML=html`<div style="margin-bottom:12px;">
      <button type="button" ${raw(Events.attr('cuentas:abrirRegistrarApertura', fuente))} style="width:100%;padding:11px;background:rgba(96,176,240,.07);border:1.5px dashed rgba(96,176,240,.35);border-radius:9px;color:var(--blue);font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:7px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Registrar saldo inicial
      </button>
      <div style="font-size:11px;color:var(--text3);text-align:center;margin-top:5px;">Plata que ya tenías antes de usar la app</div>
    </div>`;
  }
}

function abrirRegistrarApertura(fuente){
  // Abre el sheet normal de agregar dinero con el toggle de apertura ya marcado.
  // nombreMap cubre nequi/efectivo; para 'custom:ID' (y cualquier fuente futura)
  // cae a fuenteLabel(), que ya sabe resolver el nombre de una cuenta personalizada.
  const nombreMap={nequi:'Nequi',efectivo:'Efectivo'};
  const nombre=nombreMap[fuente]||(typeof fuenteLabel==='function'?fuenteLabel(fuente):fuente);
  abrirAgregarDinero(fuente, nombre);
  // Forzar toggle activo después de que abra
  setTimeout(()=>{
    const chk=document.getElementById('adEsApertura');
    if(chk&&!chk.checked){
      chk.checked=true;
      toggleAdApertura();
    }
  },120);
}

function abrirEditarApertura(fuente){
  _eaFuente=fuente;
  const mov=getAperturaMov(fuente);
  const actual=mov?mov.monto:0;
  // Mismo fallback a fuenteLabel() que abrirRegistrarApertura, para que el
  // título salga bien también en cuentas personalizadas ('custom:ID').
  const nombreMap={nequi:'Nequi',efectivo:'Efectivo'};
  const nombre=nombreMap[fuente]||(typeof fuenteLabel==='function'?fuenteLabel(fuente):fuente);
  document.getElementById('eaTitle').textContent='Corregir saldo inicial · '+nombre;
  document.getElementById('eaSaldoActual').textContent=fmt(actual);
  document.getElementById('eaMonto').value='';
  document.getElementById('eaPreview').textContent='';
  openSheet('editar-apertura');
  setTimeout(()=>document.getElementById('eaMonto').focus(),200);
}

function confirmarEditarApertura(){
  const nuevo=parseMoney(document.getElementById('eaMonto').value)||0;
  if(!nuevo){toast('Ingresa el nuevo saldo inicial','err');return;}
  const mov=getAperturaMov(_eaFuente);
  const anterior=mov?mov.monto:0;
  const diff=nuevo-anterior;
  if(diff===0){toast('El valor es igual al actual','err');return;}
  // Ajustar saldo de la cuenta por la diferencia
  if(diff>0) sumarFuente(_eaFuente,diff,_ogCta(mov?mov.id:'apertura:'+_eaFuente));
  else descontarFuente(_eaFuente,Math.abs(diff),_ogCta(mov?mov.id:'apertura:'+_eaFuente,true));
  // Actualizar o crear el movimiento de apertura
  if(mov){
    mov.monto=nuevo;
    // No cambiamos mov.fecha (preserva la fecha original de creación de la cuenta),
    // pero registramos cuándo y por cuánto se ajustó: snapshotPatrimonio() usa esto
    // para que el cambio de patrimonio de HOY (el día de la corrección) también se
    // reste del cálculo de tendencia, igual que una apertura nueva.
    mov._ajustes=mov._ajustes||[];
    mov._ajustes.push({fecha:hoy(),monto:diff});
  } else {
    if(!S.movimientos)S.movimientos=[];
    const movNuevo=crearMovimientoApertura(nuevo,hoy(),'Saldo inicial');
    movNuevo.fuente=_eaFuente;
    S.movimientos.push(movNuevo);
  }
  save();refresh();
  closeSheet('editar-apertura');
  toast('Saldo inicial actualizado a '+fmt(nuevo),'ok');
}

document.addEventListener('input',function(e){
  if(e.target.id==='eaMonto'){
    const mov=getAperturaMov(_eaFuente);
    const anterior=mov?mov.monto:0;
    const nuevo=parseMoney(e.target.value)||0;
    const prev=document.getElementById('eaPreview');
    if(nuevo>0){
      const diff=nuevo-anterior;
      const signo=diff>=0?'+':'';
      prev.innerHTML=fmt(anterior)+' <i class="fa-solid fa-arrow-right" style="margin:0 3px;font-size:10px;"></i> '+fmt(nuevo)+(diff!==0?' ('+signo+fmt(diff)+')':'');
      prev.style.color=diff>0?'var(--accent)':diff<0?'var(--red)':'var(--text3)';
    } else {prev.textContent='';}
  }
});

/* ---- RESTAR DINERO ---- */
let rdFuente='';

function abrirRestarDinero(fuente,nombre){
  const motivo=_motivoSinRetiro(fuente);
  if(motivo){toast(motivo,'err',3500);return;}
  save();
  rdFuente=fuente;
  const label=nombre||(fuente==='nequi'?'Nequi':fuente==='efectivo'?'Efectivo':'Cuenta');
  document.getElementById('rdTitle').textContent='Retirar de '+label;
  const actual=getSaldoActual(fuente);
  document.getElementById('rdSaldoActual').textContent=fmt(actual);
  document.getElementById('rdMonto').value='';
  document.getElementById('rdDesc').value='';
  document.getElementById('rdFecha').value=hoy();
  const rdNotaEl=document.getElementById('rdNota');
  if(rdNotaEl)rdNotaEl.value='';
  document.getElementById('rdPreview').textContent='';
  openSheet('restar-dinero');
  setTimeout(()=>document.getElementById('rdDesc').focus(),200);
}

document.addEventListener('input',function(e){
  if(e.target.id==='rdMonto'){
    const v=parseMoney(e.target.value)||0;
    const actual=getSaldoActual(rdFuente);
    const prev=document.getElementById('rdPreview');
    const resultado=actual-v;
    if(v>0){
      prev.textContent=fmt(actual)+' − '+fmt(v)+' = '+fmt(resultado);
      prev.style.color=resultado<0?'var(--red)':'var(--accent)';
    } else{prev.textContent='';}
  }
});

function confirmarRestarDinero(){
  const v=parseMoney(document.getElementById('rdMonto').value)||0;
  const desc=document.getElementById('rdDesc').value.trim();
  const fecha=document.getElementById('rdFecha').value||hoy();
  const nota=document.getElementById('rdNota')?.value.trim()||'';
  if(!desc){toast('Describe en qué se gastó o a dónde fue','err');return;}
  if(!v){toast('Ingresa un monto válido','err');return;}
  if(!rdFuente)return;
  // Guarda de saldo (2026-10-05). descontarFuente() recorta el saldo en 0, pero registrarSalida()
  // guarda el movimiento con el monto COMPLETO: restar más de lo que hay dejaba el saldo en 0 y el
  // historial diciendo que salió más plata de la que había, y al borrar ese movimiento
  // (sumarFuente(monto)) la cuenta recibía de más. Misma regla que Transferir: se compara en centavos.
  const saldoDisponible=getSaldoActual(rdFuente);
  if(Math.round(v*100)>Math.round(saldoDisponible*100)){
    toast('Saldo insuficiente en '+escHtml(fuenteLabel(rdFuente))+' ('+fmt(saldoDisponible)+')','err',3500);
    return;
  }
  registrarSalida(rdFuente,v,fecha,desc,nota);
  save();refresh();
  closeSheet('restar-dinero');
  if(window.logCambio){const _fLabel=fuenteLabel(rdFuente);const _cjId3=rdFuente&&rdFuente.startsWith('cajita:')?rdFuente.split(':')[1]:null;logCambio('Retiraste dinero de '+_fLabel,desc,v,'gasto',_cjId3);}
  rdFuente='';
  toast('− '+fmt(v)+' retirado — '+escHtml(desc),'salida');
}

/* ---- Botones "Mover a otra cuenta": solo activos si la cuenta tiene >= $1,00 ----
   Una cuenta sin saldo (o con centavos sueltos) no puede ser origen de una
   transferencia, así que el botón queda deshabilitado en vez de abrir un sheet
   que no se puede completar. Se re-evalúa cada vez que se pinta el detalle de
   la cuenta (renderDetalleCuenta / detalle de cuenta personalizada / de
   cajita), que es también lo que corre tras cada save()+refresh(). */
// Estado de cualquier botón de acción: deshabilitado (y con el motivo como título) o activo.
function _setBtnEstado(btn, ok, motivo) {
  if (!btn) return;
  btn.disabled = !ok;
  btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
  btn.style.opacity = ok ? '' : '.4';
  btn.style.cursor = ok ? '' : 'not-allowed';
  btn.title = ok ? '' : (motivo || '');
}

function _setBtnTransferir(btn, ok) {
  _setBtnEstado(btn, ok, 'Necesitas al menos ' + fmt(FuentesFiltro.MIN.GENERAL) + ' en esta cuenta para moverla');
}

/* ---- Retirar dinero: solo con saldo ----
   Nequi, Efectivo, cuentas personalizadas (y cajitas) no pueden retirar con saldo 0: el botón sale deshabilitado y
   abrirRestarDinero() lo vuelve a comprobar. confirmarRestarDinero() sigue validando el monto contra el saldo. */
const _MIN_RETIRO = 0.01; // cualquier saldo positivo (se compara en centavos, como el resto de FuentesFiltro)

function _motivoSinRetiro(fuente) {
  return FuentesFiltro.puedeMover(fuente, _MIN_RETIRO) ? '' : 'No hay saldo para retirar en esta cuenta.';
}

function actualizarBotonRetirar(btn, fuente) {
  const motivo = _motivoSinRetiro(fuente);
  _setBtnEstado(btn, !motivo, motivo);
}

function actualizarBotonesTransferir() {
  // Cuenta simple abierta (Nequi, Efectivo o personalizada): un solo botón compartido
  const fuenteSimple = cuentaActual;
  if (fuenteSimple && fuenteSimple !== 'nu') _setBtnTransferir(document.getElementById('btn-transferir-cuenta-det'), FuentesFiltro.puedeMover(fuenteSimple));
  // Cuentas con pantalla propia (Nu: botón de la cuenta y de la cajita abierta)
  Object.values(CuentaPantallas).forEach(p => { if (p.actualizarBotones) p.actualizarBotones(); });
}

/* ---- TRANSFERIR ENTRE CUENTAS ---- */
function abrirTransferir(origenSugerido) {
  // Populate both selects (sin tarjetas de crédito — no son cuentas líquidas)
  const fuentes = getFuentesSinTC();
  // El origen solo lista cuentas con saldo >= $1,00 (FuentesFiltro, js/core/fuentes-filtro.js):
  // de una cuenta en $0 — o con centavos sueltos — no puede salir plata. El destino NO se
  // filtra por saldo: la plata entra, y una cuenta vacía es un destino perfectamente válido.
  const fuentesOrigen = FuentesFiltro.filtrar(fuentes, FuentesFiltro.PRESET.SALIDA);
  // Sin ninguna cuenta con saldo no hay nada que transferir: se avisa en vez de abrir un sheet
  // inutilizable (cubre también el botón del menú "+" y el "Transferir" de "Sumar dinero").
  if (!fuentesOrigen.length) {
    toast('No tienes ninguna cuenta con al menos ' + fmt(FuentesFiltro.MIN.GENERAL) + ' para transferir', 'err', 3500);
    return;
  }
  document.getElementById('tr_origen').innerHTML = html`${fuentesOrigen.map(f => html`<option value="${f.val}">${f.label}</option>`)}`;
  // Pre-select suggested origin if provided y tiene saldo
  if (origenSugerido && fuentesOrigen.some(f => f.val === origenSugerido)) {
    document.getElementById('tr_origen').value = origenSugerido;
  }
  // El destino nunca puede ofrecer la cuenta ya elegida como origen — misma
  // mecánica de exclusión mutua que usan las filas de Dividir (ver
  // splitActualizarOpciones en js/core/split.js), acá para los dos selects
  // fijos de Transferir en vez de un número variable de filas.
  _trPodarSelect('tr_destino', fuentes, document.getElementById('tr_origen').value);
  document.getElementById('tr_monto').value = '';
  document.getElementById('tr_nota').value = '';
  const trFechaEl = document.getElementById('tr_fecha');
  if (trFechaEl) trFechaEl.value = hoy();
  document.getElementById('tr_preview').textContent = '';
  actualizarTransfPreview();
  openSheet('transferir');
  setTimeout(() => document.getElementById('tr_monto').focus(), 200);
}

// Reconstruye el <select> #selId a partir de `fuentes` (ya filtrada por
// saldo si corresponde a ese select), quitando la opción cuyo value sea
// `valExcluir` — la cuenta ya elegida en el OTRO select. Si la selección
// vigente sigue disponible, se conserva; si era justo la que se acaba de
// excluir, cae a la primera opción que quede. Mismo patrón que
// splitActualizarOpciones() (js/core/split.js) para las filas de Dividir,
// aplicado acá a los dos selects fijos de Transferir en vez de N filas.
function _trPodarSelect(selId, fuentes, valExcluir) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const valorActual = sel.value;
  const opts = fuentes.filter(f => f.val !== valExcluir);
  sel.innerHTML = html`${opts.map(f => html`<option value="${f.val}">${f.label}</option>`)}`;
  if (opts.some(f => f.val === valorActual)) sel.value = valorActual;
  else if (opts.length) sel.selectedIndex = 0;
}

// Al cambiar el origen, el destino no puede seguir ofreciendo esa cuenta.
function _trOrigenCambio() {
  _trPodarSelect('tr_destino', getFuentesSinTC(), document.getElementById('tr_origen').value);
  actualizarTransfPreview();
}
// Al cambiar el destino, el origen (ya limitado a cuentas con saldo, ver
// FuentesFiltro.PRESET.SALIDA) tampoco puede seguir ofreciendo esa cuenta.
function _trDestinoCambio() {
  const fuentesOrigen = FuentesFiltro.filtrar(getFuentesSinTC(), FuentesFiltro.PRESET.SALIDA);
  _trPodarSelect('tr_origen', fuentesOrigen, document.getElementById('tr_destino').value);
  actualizarTransfPreview();
}

// ── Validación de Transferir — UNA sola función, sin DOM ─────────────────────
// Reglas (2026-09-28, "plata real"): solo entre cajitas de Nu se pueden mover
// centavos. Si el origen o el destino es Nequi, Efectivo o una cuenta
// personalizada, el monto tiene que ser un número entero de pesos. Si Efectivo
// participa, el mínimo es $50 (la moneda más pequeña que existe).
// 2026-10-04: pasó de validar solo el monto (_trValidarMonto) a validar TODA la
// transferencia, para que la vista previa y la confirmación digan lo mismo y
// la regla se pueda probar sin abrir el sheet (tests/transferir.test.js).
//
//   validarTransferencia({ origen, destino, monto, saldoOrigen, etiquetaOrigen })
//     → { ok: true }
//     → { ok: false, codigo, mensaje }
//
//   codigo:  'falta_cuenta' | 'mismo' | 'sin_monto' | 'monto' | 'saldo'
//   etiquetaOrigen: texto para el aviso de saldo. Quien llama lo escapa
//     (toast() no escapa — patrón del proyecto: se escapa al interpolar).
//   saldoOrigen: si no es un número finito, no se valida el saldo (así la
//     vista previa puede validar la forma antes de leer saldos).
// El orden de las comprobaciones es parte del contrato: lo que se avisa primero
// es lo que el usuario debe corregir primero.
const TR_MIN_EFECTIVO = 50;
function validarTransferencia({ origen, destino, monto, saldoOrigen, etiquetaOrigen } = {}) {
  const fallo = (codigo, mensaje) => ({ ok: false, codigo, mensaje });
  if (!origen || !destino) return fallo('falta_cuenta', 'Elige origen y destino');
  if (origen === destino) return fallo('mismo', 'El origen y destino deben ser diferentes');
  // Number.isFinite también deja fuera NaN e Infinity; monto <= 0 deja fuera los
  // negativos (descontarFuente con un monto negativo SUMARÍA al origen).
  if (typeof monto !== 'number' || !Number.isFinite(monto) || !(monto > 0)) {
    return fallo('sin_monto', 'Ingresa un monto válido');
  }
  const centavos = Math.round(monto * 100);
  if (centavos <= 0) return fallo('sin_monto', 'Ingresa un monto válido');
  const esCajita = v => typeof v === 'string' && v.startsWith('cajita:');
  const involucraEfectivo = origen === 'efectivo' || destino === 'efectivo';
  const soloCajitas = esCajita(origen) && esCajita(destino);
  if (!soloCajitas && centavos % 100 !== 0) {
    return fallo('monto', involucraEfectivo
      ? 'El efectivo no tiene centavos: usa un monto entero (ej. ' + fmt(TR_MIN_EFECTIVO) + ')'
      : 'Solo entre cajitas de Nu se pueden mover centavos: usa un monto entero de pesos');
  }
  if (involucraEfectivo && centavos < TR_MIN_EFECTIVO * 100) {
    return fallo('monto', 'El mínimo para mover plata desde o hacia Efectivo es ' + fmt(TR_MIN_EFECTIVO));
  }
  if (typeof saldoOrigen === 'number' && Number.isFinite(saldoOrigen)
      && centavos > Math.round(saldoOrigen * 100)) {
    return fallo('saldo', 'Saldo insuficiente en ' + (etiquetaOrigen || 'el origen') + ' (' + fmt(saldoOrigen) + ')');
  }
  return { ok: true };
}

function actualizarTransfPreview() {
  const origen = document.getElementById('tr_origen').value;
  const destino = document.getElementById('tr_destino').value;
  const monto = parseMoney(document.getElementById('tr_monto').value) || 0;
  const saldoOrigen = getSaldoActual(origen);
  const saldoDestino = getSaldoActual(destino);

  // Update saldo hints
  const orEl = document.getElementById('tr_origen_saldo');
  const dsEl = document.getElementById('tr_destino_saldo');
  if (orEl) orEl.textContent = origen ? 'Disponible: ' + fmt(saldoOrigen) : '';
  if (dsEl) dsEl.textContent = destino ? 'Saldo actual: ' + fmt(saldoDestino) : '';

  const prev = document.getElementById('tr_preview');
  const v = validarTransferencia({ origen, destino, monto, saldoOrigen });
  // Avisos que se muestran en ámbar. 'falta_cuenta' y 'sin_monto' no avisan nada
  // todavía (el usuario aún no terminó de llenar el formulario). 'saldo' no corta
  // la vista previa: se muestran los saldos y el aviso rojo va al final.
  if (!v.ok && v.codigo !== 'saldo') {
    const avisa = v.codigo === 'mismo' || v.codigo === 'monto';
    prev.textContent = avisa ? v.mensaje : '';
    prev.style.color = 'var(--amber)';
    return;
  }
  const nuevoOrigen = saldoOrigen - monto;
  const nuevoDestino = saldoDestino + monto;
  const colorOrigen = nuevoOrigen < 0 ? 'var(--red)' : 'var(--accent)';
  prev.innerHTML = html`<span style="color:var(--red);">${fuenteLabel(origen)}: ${fmt(saldoOrigen)} <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> ${fmt(nuevoOrigen)}</span><br>
    <span style="color:var(--accent);">${fuenteLabel(destino)}: ${fmt(saldoDestino)} <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> ${fmt(nuevoDestino)}</span>`;
  if (!v.ok) { // v.codigo === 'saldo' (los demás ya salieron arriba)
    prev.innerHTML = html`${raw(prev.innerHTML)}<br><span style="color:var(--red);font-size:10px;">Saldo insuficiente en ${fuenteLabel(origen)}</span>`;
  }
}

function confirmarTransferir() {
  const origen = document.getElementById('tr_origen').value;
  const destino = document.getElementById('tr_destino').value;
  const monto = parseMoney(document.getElementById('tr_monto').value) || 0;
  const nota = document.getElementById('tr_nota').value.trim();
  const fecha = document.getElementById('tr_fecha')?.value || hoy();

  const saldoOrigen = getSaldoActual(origen);
  const v = validarTransferencia({ origen, destino, monto, saldoOrigen, etiquetaOrigen: escHtml(fuenteLabel(origen)) });
  if (!v.ok) { toast(v.mensaje, 'err', v.codigo === 'monto' ? 3500 : undefined); return; }

  // Perform transfer
  const _trId = uid();
  descontarFuente(origen, monto, _ogCta(_trId));
  sumarFuente(destino, monto, _ogCta(_trId));

  // Save transfer record
  if (!S.transferencias) S.transferencias = [];
  S.transferencias.push({
    id: _trId,
    fecha,
    origen,
    destino,
    monto,
    nota
  });

  save(); refresh();
  closeSheet('transferir');
  toast(`${fmt(monto)} transferido de ${escHtml(fuenteLabel(origen))} a ${escHtml(fuenteLabel(destino))}`, 'ok', 3500);
}


/* ═══════════════════════════════════════════════════════════════
   Registro de acciones — Events.on / Events.registerAll
   (ver js/core/events.js). Todas las funciones ya existían con
   estos nombres; acá solo se conectan al despachador centralizado.
   ═══════════════════════════════════════════════════════════════ */
Events.registerAll('cuentas', {
  // Cuentas personalizadas
  selIconoNC,
  selColorNC,
  resetSheetNuevaCuenta: _resetSheetNuevaCuenta,
  // Motor de filtros de movimientos
  movsOnTipo: _movsOnTipo,
  movsLimpiarFechas: _movsLimpiarFechas,
  // Saldo inicial / apertura
  abrirEditarApertura,
  abrirRegistrarApertura,
  // Transferir (usado en el HTML de screen-cuentas)
  abrirTransferir,
});

/* ───────────────────────────────────────────────────────────────
   WIRING redistribuido desde _initEventListeners() (index.html) —
   grupo "Cuentas", el más grande de los ~80 listeners originales
   (ver auditoria-tecnica.md, nota del 2026-07-26). Mismo criterio
   que Mesada/Spotify/Gastos: código de nivel superior, sin envolver
   en DOMContentLoaded, porque este script carga con <script src>
   después de que todo el HTML estático de screen-cuentas y sus
   sheets ya existe en el documento (sin dependencia real de orden
   de carga — se verificó línea por línea, igual que en las
   redistribuciones anteriores).
   ─────────────────────────────────────────────────────────────── */

// --- Cuentas personalizadas ---
const btnAgregarCuentaCustom = document.getElementById('btn-agregar-cuenta-custom');
if (btnAgregarCuentaCustom) btnAgregarCuentaCustom.addEventListener('click', abrirNuevaCuenta);
const btnCrearCuentaCustom = document.getElementById('btn-crear-cuenta-custom');
if (btnCrearCuentaCustom) btnCrearCuentaCustom.onclick = crearCuentaCustom;

// --- Agregar / restar dinero, editar apertura, transferir (confirmación) ---
const btnAdConf = document.getElementById('btn-confirmar-agregar-dinero');
if (btnAdConf) btnAdConf.addEventListener('click', confirmarAgregarDinero);
const btnAdMenuConf = document.getElementById('btn-confirmar-agregar-dinero-menu');
if (btnAdMenuConf) btnAdMenuConf.addEventListener('click', confirmarAgregarDineroMenu);
const btnRdConf = document.getElementById('btn-confirmar-restar');
if (btnRdConf) btnRdConf.addEventListener('click', confirmarRestarDinero);
const btnEaConf = document.getElementById('btn-confirmar-editar-apertura');
if (btnEaConf) btnEaConf.addEventListener('click', confirmarEditarApertura);
const btnTrConf = document.getElementById('btn-confirmar-transferir');
if (btnTrConf) btnTrConf.addEventListener('click', confirmarTransferir);
const btnSwitchTr = document.getElementById('btn-switch-to-transferir');
if (btnSwitchTr) btnSwitchTr.addEventListener('click', () => { closeSheet('agregar-dinero-menu'); abrirTransferir(); });

// --- Selector de cuentas (tarjetas de screen-cuentas + botón "volver") ---
// Un solo listener delegado para todas las cuentas del selector (el contenido se
// reescribe en cada renderSelectorCuentas(), el contenedor no).
const _selectorCuentasLista = document.getElementById('selector-cuentas-lista');
if (_selectorCuentasLista) _selectorCuentasLista.addEventListener('click', e => {
  const item = e.target.closest('[data-fuente]');
  if (item) abrirCuenta(item.dataset.fuente);
});
document.querySelectorAll('.btn-volver-selector').forEach(btn => {
  btn.addEventListener('click', volverSelector);
});

// --- Cuenta simple (Nequi / Efectivo / personalizada): un listener delegado para todos los
// botones del detalle; la cuenta es la que esté abierta (cuentaActual) ---
const _detalleSimple = document.getElementById('cuentas-detalle-simple');
if (_detalleSimple) _detalleSimple.addEventListener('click', e => {
  const btn = e.target.closest('button[id]');
  const fuente = cuentaActual;
  const d = btn && fuente ? _descriptorCuenta(fuente) : null;
  if (!d) return;
  if (btn.id === 'btn-agregar-cuenta-det') abrirAgregarDinero(fuente, d.nombre);
  else if (btn.id === 'btn-restar-cuenta-det') abrirRestarDinero(fuente, d.nombre);
  else if (btn.id === 'btn-transferir-cuenta-det') abrirTransferir(fuente);
  else if (btn.id === 'btn-editar-cuenta-custom' && d.esCustom) editarCuentaCustom(fuente.slice('custom:'.length));
  else if (btn.id === 'btn-eliminar-cuenta-custom' && d.esCustom) eliminarCuentaCustom(fuente.slice('custom:'.length));
});

// --- Agregar dinero (menú combinado, selector de cuenta destino) ---
const adMenuDest = document.getElementById('adMenuDest');
if (adMenuDest) adMenuDest.addEventListener('change', actualizarAdMenuSaldo);
const adMenuMonto = document.getElementById('adMenuMonto');
if (adMenuMonto) adMenuMonto.addEventListener('input', actualizarAdMenuPreview);

// --- Transferir: selects y monto (preview en vivo + exclusión mutua origen/destino) ---
const trOrigen = document.getElementById('tr_origen');
if (trOrigen) trOrigen.addEventListener('change', _trOrigenCambio);
const trDestino = document.getElementById('tr_destino');
if (trDestino) trDestino.addEventListener('change', _trDestinoCambio);
const trMonto = document.getElementById('tr_monto');
if (trMonto) trMonto.addEventListener('input', actualizarTransfPreview);

/* ---- WIRING de controles que no son data-action simples ----
   El wrapper de "toggle apertura" (adAperturaWrap/nuMovAperturaWrap) usa
   el patrón label-click-delegado: clic en cualquier parte de la fila activa
   el checkbox, y el checkbox detiene la propagación para no re-disparar el
   clic del wrapper. Ninguno de los dos es una acción con argumentos — es
   mecánica de UI — así que se conecta directo con addEventListener, mismo
   criterio ya usado en configuracion.js para data-modulo/inputs de archivo,
   en vez de pasar por el despachador de data-action.
   El 'change' de cada checkbox (antes onchange="toggleAdApertura()" /
   onchange="_nuMovToggleApertura()" inline en el HTML; el de Nu vive en nu.js) se agrega acá mismo. */
[['adAperturaWrap','adEsApertura',toggleAdApertura]].forEach(([wrapId,chkId,onChangeFn])=>{
  const wrap=document.getElementById(wrapId);
  const chk=document.getElementById(chkId);
  if(wrap&&chk){
    wrap.addEventListener('click', () => chk.click());
    chk.addEventListener('click', e => e.stopPropagation());
    chk.addEventListener('change', onChangeFn);
  }
});

// abrirDetalleMov() y eliminarMovimiento() son núcleo compartido por TODA
// la app (feed general de actividad, no solo cuentas) — quedaron en
// index.html, y se registran ahí mismo como 'core:abrirDetalleMov' /
// 'core:eliminarMovimiento'. No se registran acá para no hacer parecer
// que este módulo es dueño de esas dos funciones.

