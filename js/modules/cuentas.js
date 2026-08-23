/* ═══════════════════════════════════════════════════════════════
   js/modules/cuentas.js

   Módulo Cuentas de mis-finanzas. Cubre:
     · Selector de cuentas + Nequi + Efectivo (saldo, movimientos,
       saldo inicial/apertura)
     · Cuentas personalizadas (bancos/apps con ícono y color propios)
     · Nu: cajitas de ahorro, tasa EA con historial por tramos, CDTs,
       metas de ahorro por cajita, chequeo manual de saldo real
     · Motor de filtros de movimientos (búsqueda, tipo, rango de
       fechas) — usado por Nequi, Nu, Efectivo y cuentas personalizadas
     · Agregar/restar dinero, transferir entre cuentas

   Ver docs/cuentas.md para el objetivo, las reglas de negocio y el
   modelo de datos de cada parte. El historial de bugs corregidos
   vive en CHANGELOG.md#cuentas, no acá.

   ── Qué se quedó en index.html (núcleo compartido, no exclusivo
      de Cuentas) ──────────────────────────────────────────────────
   S, save(), load(), escHtml(), toast(), dialogo(), fmt()/fmtInput(),
   uid(), hoy(), descontarFuente()/sumarFuente(), getFuentes()/
   getFuentesSinTC()/fuenteLabel()/poblarFuente()/getSaldoFuente(),
   buildFuentesOptsHtml(), calcPatrimonioTotal(), snapshotPatrimonio(),
   _saldoEncargosEnCuenta() (generalizado, lo usa también Encargos),
   abrirDetalleMov()/eliminarMovimiento() (genéricos para TODA la app,
   no solo Cuentas — el feed general de actividad también los usa).
   crearSplitWidget() tampoco se usa acá: Cuentas no tiene ningún
   "dividir entre cuentas" tipo Mesada/Encargos.

   ── Sobre el tamaño de este módulo ────────────────────────────────
   Es el más grande extraído hasta ahora (más líneas que Encargos y
   Tarjetas de Crédito juntos) porque "Cuentas" en la UI agrupa varias
   cosas que en otras apps serían pantallas separadas: cuentas simples
   (Nequi/Efectivo/personalizadas) y todo el subsistema de Nu (cajitas
   + CDTs + metas + chequeo de tasa). No se dividió en dos archivos
   (como Spotify/Encargos) porque no hay una dependencia de orden de
   carga real que lo exija — es un solo archivo por cohesión temática,
   no por necesidad técnica.

   ── Onclick eliminados en esta migración ─────────────────────────
   27 sitios con onclick inline → data-action (10 en HTML estático de
   screen-cuentas que el barrido por nombre de función no agarra —
   mismo patrón ya visto en Mesada/TC — y 17 generados dinámicamente
   en cajitas/CDTs/metas/filtros de movimientos). 2 sitios más
   (abrirDetalleMov/eliminarMovimiento) quedan registrados como
   'core:...' en index.html, porque esas funciones son compartidas
   por toda la app, no exclusivas de Cuentas — ver nota arriba.

   ── .innerHTML / toast() sin escapar corregidos ──────────────────
   12 sitios con texto libre (nombre de cuenta personalizada, nombre
   de cajita, nota/descripción de un movimiento, fuenteLabel()) sin
   pasar por escHtml() antes de toast()/.innerHTML — quinta vez que
   aparece este mismo patrón (después de Spotify, Mesada, Encargos y
   Tarjetas de Crédito), confirmando que no es un caso aislado de un
   módulo. Detalle completo de cada sitio en CHANGELOG.md#cuentas.

   ── Código muerto encontrado (no se tocó) ────────────────────────
   toggleCDT(), toggleCajita() y _expandCajitaCDTs() ya no se llaman
   desde ningún lado — trabajan sobre ids ('cajita-wrap-*',
   'cajita-cdt-*-*') que renderCajitas()/_renderDetalleCajita() ya no
   generan (quedaron de un diseño de UI anterior, con las cajitas
   expandibles en una sola lista en vez de una pantalla de detalle
   aparte). Se dejaron intactas y comentadas como tal, mismo criterio
   que `mpMesNombre` en Mesada: se anota para una limpieza futura, no
   se borra de paso en una migración que no es sobre eso.
   ═══════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Selector de cuentas (Nequi / Nu / Efectivo / personalizada)
   ─────────────────────────────────────────────────────────────── */
/* ---- CUENTAS SELECTOR ---- */
let cuentaActual = ''; // 'nequi' | 'nu' | 'efectivo'

function abrirCuenta(tipo) {
  cuentaActual = tipo;
  _cajitaActualId = null;
  document.getElementById('cuentas-selector').style.display = 'none';
  document.getElementById('cuentas-detalle-nequi').style.display = 'none';
  document.getElementById('cuentas-detalle-nu').style.display = 'none';
  document.getElementById('cuentas-detalle-efectivo').style.display = 'none';
  document.getElementById('cuentas-detalle-custom').style.display = 'none';
  document.getElementById('cuentas-detalle-cajita').style.display = 'none';
  document.getElementById('cuentas-sub-meta').style.display = 'none';
  document.getElementById('cuentas-sub-cdts').style.display = 'none';
  if (tipo === 'nequi') {
    document.getElementById('cuentas-detalle-nequi').style.display = '';
    renderDetalleCuenta('nequi');
  } else if (tipo === 'nu') {
    document.getElementById('cuentas-detalle-nu').style.display = '';
    renderDetalleCuenta('nu');
  } else if (tipo === 'efectivo') {
    document.getElementById('cuentas-detalle-efectivo').style.display = '';
    renderDetalleCuenta('efectivo');
  }
  document.getElementById('scrollArea').scrollTop = 0;
}

function volverSelector() {
  cuentaActual = '';
  _customCuentaActualId = null;
  _cajitaActualId = null;
  document.getElementById('cuentas-selector').style.display = '';
  document.getElementById('cuentas-detalle-nequi').style.display = 'none';
  document.getElementById('cuentas-detalle-nu').style.display = 'none';
  document.getElementById('cuentas-detalle-efectivo').style.display = 'none';
  document.getElementById('cuentas-detalle-custom').style.display = 'none';
  document.getElementById('cuentas-detalle-cajita').style.display = 'none';
  document.getElementById('cuentas-sub-meta').style.display = 'none';
  document.getElementById('cuentas-sub-cdts').style.display = 'none';
  document.getElementById('scrollArea').scrollTop = 0;
}

function renderDetalleCuenta(tipo) {
  // FIX (auditoria-tecnica.md #5, hallazgo "Cuentas→Encargos"): las 3 llamadas
  // de este bloque no tenían guard typeof. Hoy encargos.js carga eager, así
  // que no rompe nada — pero es el acoplamiento exacto que bloquearía volver
  // lazy cuentas o encargos por separado.
  if (tipo === 'nequi') {
    document.getElementById('det-nequi-saldo').textContent = fmt(S.nequiSaldo || 0);
    // Banner saldo inicial Nequi
    renderBannerApertura('nequi');
    // Encargos en Nequi
    if(typeof renderEncargosEnCuenta==='function') renderEncargosEnCuenta('det-nequi-encargos', 'nequi');
    // Movimientos relacionados con Nequi
    const movs = getMovimientosCuenta('nequi');
    renderMovsCuenta('det-nequi-movs', movs, '#ff4da6', 'nequi');
  } else if (tipo === 'nu') {
    // Cajitas ya se renderizan en renderCajitas()
    renderCajitas();
    // Encargos en Nu (cualquier cajita)
    if(typeof renderEncargosEnCuenta==='function') renderEncargosEnCuenta('det-nu-encargos', 'nu');
    // Movimientos Nu (cajitas)
    const movs = getMovimientosCuenta('nu');
    renderMovsCuenta('det-nu-movs', movs, 'var(--nu-light)', 'nu');
  } else if (tipo === 'efectivo') {
    document.getElementById('det-ef-saldo').textContent = fmt(S.efectivoSaldo || 0);
    // Banner saldo inicial Efectivo
    renderBannerApertura('efectivo');
    // Encargos en Efectivo
    if(typeof renderEncargosEnCuenta==='function') renderEncargosEnCuenta('det-ef-encargos', 'efectivo');
    const movs = getMovimientosCuenta('efectivo');
    renderMovsCuenta('det-ef-movs', movs, 'var(--amber)', 'efectivo');
  }
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
    return`<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size*.28)}px;background:rgba(${hexRgb},.18);display:flex;align-items:center;justify-content:center;color:${hex};">${icono.svg}</div>`;
  }
  // Fallback: iniciales
  const iniciales=(c.nombre||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  return`<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size*.28)}px;background:rgba(${hexRgb},.18);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.38)}px;font-weight:700;color:${hex};font-family:'DM Mono',monospace;">${iniciales}</div>`;
}

let _ncColorSel='#60b0f0';
let _ncIconoSel='otro';
let _customCuentaActualId=null;

function selColorNC(color){
  _ncColorSel=color;
  document.querySelectorAll('.nc-color-opt').forEach(el=>{
    el.style.border=el.dataset.color===color?'2px solid var(--accent)':'2px solid transparent';
  });
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
  grid.innerHTML=ICONOS_CUENTA.map(ic=>{
    const sel=ic.id===_ncIconoSel;
    const hexRgb=hexToRgb(ic.color);
    return`<div class="nc-icon-opt" data-icono="${ic.id}" ${Events.attr('cuentas:selIconoNC', ic.id)}
      style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:9px 4px;border-radius:10px;cursor:pointer;border:2px solid ${sel?'var(--accent)':'var(--border2)'};background:${sel?`rgba(${hexRgb},.18)`:'var(--bg3)'};transition:all .15s;">
      <div style="color:${ic.color};display:flex;align-items:center;justify-content:center;width:24px;height:24px;">${ic.svg}</div>
      <div style="font-size:9px;font-family:'DM Mono',monospace;color:var(--text3);text-align:center;line-height:1.2;">${ic.label}</div>
    </div>`;
  }).join('');
}

function abrirNuevaCuenta(){
  _ncIconoSel='otro';
  _ncColorSel='#888880';
  renderIconGrid();
  document.querySelectorAll('.nc-color-opt').forEach(el=>{
    el.style.border=el.dataset.color===_ncColorSel?'2px solid var(--accent)':'2px solid transparent';
  });
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
  if(!S.cuentasPersonalizadas)S.cuentasPersonalizadas=[];
  const nueva={id:uid(),nombre,icono:_ncIconoSel,color:_ncColorSel,saldo,movimientos:[]};
  if(saldo>0) nueva.movimientos.push(crearMovimientoApertura(saldo,hoy(),'Saldo inicial'));
  S.cuentasPersonalizadas.push(nueva);
  save();refresh();
  closeSheet('nueva-cuenta');
  toast(`Cuenta "${escHtml(nombre)}" creada`,'ok');
  if(window.logCambio)logCambio('Creaste cuenta "'+nombre+'"','',saldo||0,'cajita');
}

function renderCustomCuentasList(){
  const el=document.getElementById('custom-cuentas-list');
  if(!el)return;
  const cuentas=S.cuentasPersonalizadas||[];
  if(!cuentas.length){el.innerHTML='';return;}
  el.innerHTML=cuentas.map(c=>{
    const hex=c.color||(getIconoData(c.icono).color)||'#60b0f0';
    const hexRgb=hexToRgb(hex);
    const iconoHtml=renderIconoCustom(c,30);
    return`<div data-cuenta-custom="${c.id}" style="margin-top:8px;background:linear-gradient(135deg,rgba(${hexRgb},.12) 0%,rgba(${hexRgb},.04) 100%);border:1px solid rgba(${hexRgb},.35);border-radius:var(--radius-sm);padding:13px 15px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${iconoHtml}
        <div>
          <div style="font-size:13px;font-weight:600;color:${hex};">${escHtml(c.nombre)}</div>
          <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;">${fmt(c.saldo||0)}</div>
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${hex}" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-cuenta-custom]').forEach(div=>{
    div.addEventListener('click',()=>abrirCustomCuenta(div.dataset.cuentaCustom));
  });
}

function hexToRgb(hex){
  if(!hex||hex.length<7)return'96,176,240';
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  return`${r},${g},${b}`;
}

function abrirCustomCuenta(id){
  const c=(S.cuentasPersonalizadas||[]).find(x=>x.id===id);
  if(!c)return;
  _customCuentaActualId=id;
  const hex=c.color||(getIconoData(c.icono).color)||'#60b0f0';
  const hexRgb=hexToRgb(hex);
  const hero=document.getElementById('det-custom-hero');
  if(hero){
    hero.style.background=`linear-gradient(135deg,rgba(${hexRgb},.15),rgba(${hexRgb},.04))`;
    hero.style.border=`1px solid rgba(${hexRgb},.3)`;
  }
  const nombreEl=document.getElementById('det-custom-nombre');
  // Mostrar ícono + nombre en el header
  if(nombreEl){
    const iconoHtml=renderIconoCustom(c,28);
    nombreEl.innerHTML=`<div style="display:flex;align-items:center;gap:8px;">${iconoHtml}<span style="color:${hex};">${escHtml(c.nombre)}</span></div>`;
    nombreEl.style.color=hex;
  }
  const saldoEl=document.getElementById('det-custom-saldo');
  if(saldoEl){saldoEl.textContent=fmt(c.saldo||0);saldoEl.style.color=hex;}
  const labelEl=document.getElementById('det-custom-label');
  if(labelEl)labelEl.style.color=hex;
  const btnAg=document.getElementById('btn-agregar-custom-det');
  if(btnAg){
    btnAg.style.background=`rgba(${hexRgb},.12)`;
    btnAg.style.borderColor=`rgba(${hexRgb},.35)`;
    btnAg.style.color=hex;
    btnAg.onclick=()=>abrirMovCustom('ingreso');
  }
  const btnRe=document.getElementById('btn-restar-custom-det');
  if(btnRe) btnRe.onclick=()=>abrirMovCustom('egreso');
  const btnTr=document.getElementById('btn-transferir-custom-det');
  if(btnTr) btnTr.onclick=()=>abrirTransferir('custom:'+id);
  const btnEl=document.getElementById('btn-eliminar-cuenta-custom');
  if(btnEl) btnEl.onclick=()=>eliminarCuentaCustom(id);
  const btnEd=document.getElementById('btn-editar-cuenta-custom');
  if(btnEd) btnEd.onclick=()=>editarCuentaCustom(id);
  renderMovsCustom(c);
  if(typeof renderEncargosEnCuenta==='function') renderEncargosEnCuenta('det-custom-encargos', 'custom:'+id);
  document.getElementById('cuentas-selector').style.display='none';
  document.getElementById('cuentas-detalle-nequi').style.display='none';
  document.getElementById('cuentas-detalle-nu').style.display='none';
  document.getElementById('cuentas-detalle-efectivo').style.display='none';
  document.getElementById('cuentas-detalle-custom').style.display='';
  document.getElementById('scrollArea').scrollTop=0;
}

function renderMovsCustom(c){
  // Ahora delega al mismo render genérico que usan Nequi/efectivo,
  // leyendo todos los movimientos desde getMovimientosCuenta('custom:ID').
  const fuente = 'custom:' + c.id;
  const hex = c.color || (getIconoData(c.icono).color) || '#60b0f0';
  const movs = getMovimientosCuenta(fuente);
  renderMovsCuenta('det-custom-movs', movs, hex, 'custom');
}

let _movCustomTipo='ingreso';
function abrirMovCustom(tipo){
  _movCustomTipo=tipo;
  const c=(S.cuentasPersonalizadas||[]).find(x=>x.id===_customCuentaActualId);
  if(!c)return;
  openSheet('mov-cuenta-custom');
  document.getElementById('mcc-title').textContent=tipo==='ingreso'?'Agregar a '+c.nombre:'Retirar de '+c.nombre;
  document.getElementById('mcc-btn').textContent=tipo==='ingreso'?'Agregar':'Retirar';
  document.getElementById('mcc-btn').style.background=tipo==='ingreso'?'var(--accent)':'rgba(240,104,104,.2)';
  document.getElementById('mcc-btn').style.color=tipo==='ingreso'?'#0a0a0a':'var(--red)';
  document.getElementById('mcc-btn').style.borderColor=tipo==='ingreso'?'transparent':'rgba(240,104,104,.4)';
  const mi=document.getElementById('mcc-monto');
  if(mi){mi.value='';_moneyDigits.delete(mi);}
  const ni=document.getElementById('mcc-nota');
  if(ni)ni.value='';
  document.getElementById('mcc-fecha').value=hoy();
}

function confirmarMovCustom(){
  const c=(S.cuentasPersonalizadas||[]).find(x=>x.id===_customCuentaActualId);
  if(!c)return;
  const monto=parseMoney(document.getElementById('mcc-monto').value)||0;
  if(!monto){toast('Ingresa el monto','err');return;}
  const nota=document.getElementById('mcc-nota').value.trim();
  if(!nota){toast('Agrega una descripción','err');return;}
  const fecha=document.getElementById('mcc-fecha').value||hoy();
  if(_movCustomTipo==='egreso'&&monto>(c.saldo||0)){
    toast('Saldo insuficiente. Disponible: '+fmt(c.saldo||0),'err');return;
  }
  const fuente='custom:'+c.id;
  const movId=uid();
  // Actualizar saldo
  if(_movCustomTipo==='ingreso') c.saldo=(c.saldo||0)+monto;
  else c.saldo=Math.max(0,(c.saldo||0)-monto);
  // Escribir en S.movimientos (para que eliminarMovimiento genérico y getMovimientosCuenta lo lean)
  if(!S.movimientos)S.movimientos=[];
  S.movimientos.push({
    id: movId,
    tipo: _movCustomTipo==='ingreso'?'entrada':'salida_manual',
    fuente,
    monto,
    fecha,
    desc: nota,
  });
  // También escribir en c.movimientos para compatibilidad con datos existentes
  if(!c.movimientos)c.movimientos=[];
  c.movimientos.push({id:movId,tipo:_movCustomTipo,monto,fecha,nota});
  save();refresh();
  closeSheet('mov-cuenta-custom');
  abrirCustomCuenta(_customCuentaActualId);
  toast(_movCustomTipo==='ingreso'?'Dinero agregado':'Dinero retirado','ok');
}

async function eliminarCuentaCustom(id){
  const c=(S.cuentasPersonalizadas||[]).find(x=>x.id===id);
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
  S.cuentasPersonalizadas=(S.cuentasPersonalizadas||[]).filter(x=>x.id!==id);
  save();refresh();
  document.getElementById('cuentas-detalle-custom').style.display='none';
  document.getElementById('cuentas-selector').style.display='';
  _customCuentaActualId=null;
  toast(`Cuenta "${escHtml(c.nombre)}" eliminada`,'info');
}

/* ---- Editar cuenta personalizada ---- */
function editarCuentaCustom(id){
  const c=(S.cuentasPersonalizadas||[]).find(x=>x.id===id);
  if(!c)return;
  // Rellenar el sheet reutilizando el mismo form de nueva cuenta
  const ni=document.getElementById('nc_nombre');
  const si=document.getElementById('nc_saldo');
  if(ni) ni.value=c.nombre;
  // Saldo no editable aquí (se maneja con depósitos/retiros), ocultarlo
  if(si){si.value='';si.closest('.ig').style.display='none';}
  // Preseleccionar ícono y color actuales
  _ncIconoSel=c.icono||'banco';
  _ncColorSel=c.color||'#60b0f0';
  // Actualizar UI del picker de color
  document.querySelectorAll('.nc-color-opt').forEach(el=>{
    el.style.border=el.dataset.color===_ncColorSel?'2px solid var(--accent)':'2px solid transparent';
  });
  // Actualizar UI del picker de ícono (si ya está renderizado)
  document.querySelectorAll('#nc-icon-grid .nc-icon-opt').forEach(el=>{
    el.classList.toggle('selected',el.dataset.icono===_ncIconoSel);
  });
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
      const cc=(S.cuentasPersonalizadas||[]).find(x=>x.id===id);
      if(!cc){closeSheet('nueva-cuenta');return;}
      cc.nombre=nombre;
      cc.icono=_ncIconoSel;
      cc.color=_ncColorSel;
      save();refresh();
      closeSheet('nueva-cuenta');
      // Volver a abrir la cuenta con datos actualizados
      abrirCustomCuenta(id);
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

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Nu — tasa EA (con historial por tramos) y cálculo de CDTs
   ─────────────────────────────────────────────────────────────── */
function _saldoEncargosEnCajita(cajitaId){
  if(!cajitaId)return 0;
  return _saldoEncargosEnCuenta('cajita:'+cajitaId);
}

// Devuelve la tasa EA vigente en una fecha dada, según S.historialTasasNu.
// Si la fecha es anterior a cualquier cambio registrado, usa la tasa base (S.nuTasaGlobal).
function _tasaVigenteEnFecha(fechaStr){
  const hist=(S.historialTasasNu||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:(a.fecha>b.fecha?1:0));
  let tasa=(S.nuTasaGlobal!=null?S.nuTasaGlobal:(S.nuRate||9.25));
  let encontrada=null;
  for(const h of hist){
    if(h.fecha<=fechaStr) encontrada=h.tasa; else break;
  }
  if(encontrada!=null) tasa=encontrada;
  else if(hist.length) tasa=hist[0].tasa;
  return tasa;
}

// Registra (o actualiza) un cambio de tasa Nu vigente desde una fecha específica.
// Permite corregir retroactivamente: si Nu subió la tasa el 6 de julio pero te enteraste
// el 12, registras {fecha:'2026-07-06', tasa:9.30} y calcC() recalcula automáticamente
// todos los días desde el 6 con la tasa nueva.
function registrarTasaNuHistorial(fechaStr, tasa){
  if(!fechaStr||tasa==null||isNaN(tasa))return;
  if(!S.historialTasasNu)S.historialTasasNu=[];
  const idx=S.historialTasasNu.findIndex(h=>h.fecha===fechaStr);
  if(idx>=0)S.historialTasasNu[idx].tasa=tasa;
  else S.historialTasasNu.push({fecha:fechaStr,tasa});
  S.historialTasasNu.sort((a,b)=>a.fecha<b.fecha?-1:(a.fecha>b.fecha?1:0));
  if(S.historialTasasNu.length>60)S.historialTasasNu=S.historialTasasNu.slice(-60);
}

function _diasEntreFechas(a,b){
  return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);
}
function _segmentosTasaNu(desdeStr,hastaStr){
  const cambios=(S.historialTasasNu||[])
    .filter(h=>h.fecha>desdeStr&&h.fecha<hastaStr)
    .sort((a,b)=>a.fecha<b.fecha?-1:1);
  const puntos=[desdeStr,...cambios.map(h=>h.fecha),hastaStr];
  const segmentos=[];
  for(let i=0;i<puntos.length-1;i++){
    const dias=_diasEntreFechas(puntos[i],puntos[i+1]);
    if(dias<=0)continue;
    segmentos.push({desde:puntos[i],hasta:puntos[i+1],dias,tasa:_tasaVigenteEnFecha(puntos[i])});
  }
  return segmentos;
}

function calcC(c){
  // Interés diario compuesto sobre el saldo total en la cajita.
  // El saldo guardado (c.saldo) ya incluye los intereses materializados anteriormente.
  // La base real para el interés = c.saldo (propio) + saldo de encargos en esta cajita.
  // IMPORTANTE: si la tasa EA cambió durante el periodo (ver S.historialTasasNu), el
  // cálculo se hace POR TRAMOS — cada tramo compone con la tasa que estuvo vigente en
  // ese tramo — en vez de aplicar la tasa de hoy a todo el periodo.
  const saldoPropio=c.saldo||0;
  const saldoEncargos=_saldoEncargosEnCajita(c.id);
  const saldoBase=saldoPropio+saldoEncargos;
  const tasaHoy=_tasaVigenteEnFecha(hoy());
  if(!c.fecha||!saldoBase)return{val:saldoPropio,ganado:0,dias:0,tasaDiaria:0,tasa:tasaHoy,saldoEncargos};
  const hoyStr=hoy();
  const segmentos=_segmentosTasaNu(c.fecha,hoyStr);
  let valor=saldoBase;
  segmentos.forEach(seg=>{
    const tasaDiaria=Math.pow(1+seg.tasa/100,1/365)-1;
    valor=valor*Math.pow(1+tasaDiaria,seg.dias);
  });
  const val=valor-saldoEncargos;
  const ganado=val-saldoPropio;
  const dias=segmentos.reduce((a,s)=>a+s.dias,0);
  const tasaActual=segmentos.length?segmentos[segmentos.length-1].tasa:tasaHoy;
  const tasaDiaria=Math.pow(1+tasaActual/100,1/365)-1;
  return{val,ganado,dias,tasaDiaria,tasa:tasaActual,saldoEncargos};
}

// Materializa los intereses acumulados en el saldo (llama esto antes de depósitos/retiros)
function materializarIntereses(c){
  if(!c.fecha)c.fecha=hoy();
  const k=calcC(c);
  if(k.dias>0&&k.ganado>0.005){
    c.saldo=k.val;
    c.fecha=hoy();
  }
}

// Calcula, para cada fecha en que hiciste un chequeo, la tasa EA que mejor explica el
// crecimiento real de las cajitas chequeadas ese día (ponderado por saldo). Misma lógica
// validada en el laboratorio externo de cajitas Nu.
function calcularSerieTasaImplicitaNu(){
  const chequeos=S.chequeosNu||[];
  if(!chequeos.length)return[];
  const fechas=[...new Set(chequeos.map(ch=>ch.fecha))].sort();
  const prevByCajita={};
  (S.cajitas||[]).forEach(c=>{
    prevByCajita[c.id]={balance:(c.saldo||0)+_saldoEncargosEnCajita(c.id),fecha:c.fecha||hoy()};
  });
  const serie=[];
  fechas.forEach(fecha=>{
    let sumaPond=0,sumaPesos=0;
    chequeos.filter(ch=>ch.fecha===fecha).forEach(ch=>{
      const prev=prevByCajita[ch.cajitaId];
      if(!prev){prevByCajita[ch.cajitaId]={balance:ch.saldoReal,fecha};return;}
      const dias=_diasEntreFechas(prev.fecha,fecha);
      if(dias>0&&prev.balance>=1000){
        const rDiaria=Math.pow(ch.saldoReal/prev.balance,1/dias)-1;
        const ea=(Math.pow(1+rDiaria,365)-1)*100;
        sumaPond+=ea*prev.balance;sumaPesos+=prev.balance;
      }
      prevByCajita[ch.cajitaId]={balance:ch.saldoReal,fecha};
    });
    if(sumaPesos>0)serie.push({fecha,ea:sumaPond/sumaPesos});
  });
  return serie;
}

// Revisa si los últimos chequeos se desviaron sostenidamente de la tasa registrada.
// Devuelve {sugerida, desde} si detecta un posible cambio, o null si todo cuadra.
function verificarTasaNu(){
  const serie=calcularSerieTasaImplicitaNu();
  if(!serie.length)return null;
  const tasaActual=_tasaVigenteEnFecha(hoy());
  const UMBRAL=0.05;
  let racha=[];
  for(let i=serie.length-1;i>=0;i--){
    if(Math.abs(serie[i].ea-tasaActual)>UMBRAL)racha.unshift(serie[i]); else break;
  }
  if(racha.length>=2){
    const prom=racha.reduce((a,p)=>a+p.ea,0)/racha.length;
    return{sugerida:Math.round(prom*100)/100,desde:racha[0].fecha};
  }
  return null;
}

function poblarChequeoNu(){
  const cont=document.getElementById('chequeoNuLista');
  if(!cont)return;
  cont.innerHTML=(S.cajitas||[]).map(c=>{
    const calc=calcC(c);
    return `<div class="ig" style="margin-bottom:10px;">
      <label class="il" for="chq-${c.id}">${escHtml(c.nombre)} <span style="font-size:10px;color:var(--text3);font-weight:400;">(calculado: ${fmt(calc.val)})</span></label>
      <input type="text" inputmode="decimal" class="money-input" id="chq-${c.id}" data-chq-cajita="${c.id}" placeholder="${fmt(calc.val)}">
    </div>`;
  }).join('');
}

function guardarChequeoNu(){
  const inputs=document.querySelectorAll('[data-chq-cajita]');
  const hoyStr=hoy();
  if(!S.chequeosNu)S.chequeosNu=[];
  let n=0;
  inputs.forEach(inp=>{
    const raw=(inp.value||'').replace(/\./g,'').replace(',','.');
    const val=parseFloat(raw);
    if(!raw||isNaN(val))return;
    const cajitaId=inp.dataset.chqCajita;
    const idx=S.chequeosNu.findIndex(ch=>ch.cajitaId===cajitaId&&ch.fecha===hoyStr);
    if(idx>=0)S.chequeosNu[idx].saldoReal=val;
    else S.chequeosNu.push({fecha:hoyStr,cajitaId,saldoReal:val});
    n++;
  });
  if(S.chequeosNu.length>500)S.chequeosNu=S.chequeosNu.slice(-500);
  if(n===0){if(window.toast)toast('No pusiste ningún saldo para chequear.','err',3000);return;}
  save();
  closeSheet('chequeo-nu');
  const r=verificarTasaNu();
  if(r){
    const tasaActual=_tasaVigenteEnFecha(hoy());
    if(confirm(`Los chequeos ya no cuadran con ${tasaActual}% desde el ${r.desde}. Con lo que anotaste, parece que ahora es ${r.sugerida}%.\n\n¿Aplicar este cambio de tasa desde el ${r.desde}?`)){
      registrarTasaNuHistorial(r.desde,r.sugerida);
      const el=document.getElementById('nuTasaGlobal');
      if(el)el.value=String(r.sugerida).replace('.',',');
      S.nuTasaGlobal=r.sugerida;
      save();refresh();
      _renderTasaHistorialTag();
      if(window.toast)toast('Tasa actualizada a '+r.sugerida+'% desde '+r.desde,'ok',4000);
    }
  }else{
    if(window.toast)toast('Chequeo guardado — todo cuadra con la tasa actual.','ok',3000);
  }
}

// Calcula intereses del CDT de una cajita
// Nu calcula el CDT así:
// 1. Rendimiento bruto = monto × ((1 + EA)^(dias/365) - 1)  [compuesto, base 365]
// 2. Nu redondea el bruto al $0,50 más cercano: round(bruto × 2) / 2
// 3. RTE = bruto_redondeado × rte%
// 4. Rendimiento neto = bruto_redondeado - RTE
// 5. Total neto = monto + rendimiento neto
// Verificado con dos CDTs reales: replica exactamente los valores de la app Nu.
function calcCDT(cdt){
  if(!cdt||!cdt.monto||!cdt.inicio)return{val:cdt?cdt.monto:0,ganado:0,ganado_bruto:0,retencion:0,dias:0};
  const rate=cdt.tasa/100;
  const rte=(cdt.rte!=null?cdt.rte:4)/100; // retención en fuente (default 4%)
  const desde=new Date(cdt.inicio+'T00:00:00');
  const hasta=cdt.vence?new Date(cdt.vence+'T00:00:00'):new Date();
  const ahora=new Date();
  const fechaFin=ahora<hasta?ahora:hasta;
  const dias=Math.max(0,Math.floor((fechaFin-desde)/86400000));
  // Rendimiento bruto compuesto (fórmula EA base 365, igual que Nu)
  const ganado_bruto_exacto=cdt.monto*(Math.pow(1+rate,dias/365)-1);
  // Nu redondea el bruto al $0,50 más cercano antes de calcular RTE
  const ganado_bruto=Math.round(ganado_bruto_exacto*2)/2;
  // RTE se aplica sobre el bruto redondeado
  const retencion=ganado_bruto*rte;
  const ganado=ganado_bruto-retencion;
  const val=cdt.monto+ganado;
  return{val,ganado,ganado_bruto,retencion,dias};
}

// Rendimiento neto acumulado de un CDT después de N días (misma fórmula que calcCDT, sin fechas).
function _rendimientoCDTaDias(cdt,dias){
  if(dias<=0)return 0;
  const rate=cdt.tasa/100;
  const rte=(cdt.rte!=null?cdt.rte:4)/100;
  const ganado_bruto_exacto=cdt.monto*(Math.pow(1+rate,dias/365)-1);
  const ganado_bruto=Math.round(ganado_bruto_exacto*2)/2;
  const retencion=ganado_bruto*rte;
  return ganado_bruto-retencion;
}

// Calcula el rendimiento neto de un CDT que corresponde específicamente a un mes dado (formato 'YYYY-MM').
// No es flujo de caja disponible (el dinero sigue bloqueado en el CDT), pero sí es
// "rendimiento generado" ese mes — patrimonio que aumenta día a día aunque el efectivo
// disponible no cambie (Opción 2: patrimonio real, sin movimiento visible).
function calcRendimientoCDTMes(cdt,mesK){
  if(!cdt||!cdt.monto||!cdt.inicio||!mesK)return 0;
  const inicio=new Date(cdt.inicio+'T00:00:00');
  const [anioM,mesM]=mesK.split('-').map(Number);
  const inicioMes=new Date(anioM,mesM-1,1);
  const finMes=new Date(anioM,mesM,0); // último día del mes
  const ahora=new Date();
  const vence=cdt.vence?new Date(cdt.vence+'T00:00:00'):null;
  const limiteSup=vence&&vence<ahora?vence:ahora;
  if(limiteSup<inicioMes||inicio>finMes)return 0;
  // Días acumulados desde el inicio del CDT hasta el corte de inicio/fin de este mes
  const cortePrev=inicioMes>inicio?inicioMes:inicio;
  const corteFin=limiteSup<finMes?limiteSup:finMes;
  const diasPrev=Math.max(0,Math.floor((cortePrev-inicio)/86400000));
  const diasFin=Math.max(0,Math.floor((corteFin-inicio)/86400000));
  if(diasFin<=diasPrev)return 0;
  return Math.max(0,_rendimientoCDTaDias(cdt,diasFin)-_rendimientoCDTaDias(cdt,diasPrev));
}

// Suma el rendimiento de TODOS los CDTs (en todas las cajitas) generado durante un mes dado.
// Esto es "rendimiento acumulado/patrimonio" — el patrimonio total aumenta, pero NO es
// efectivo disponible (el dinero sigue bloqueado hasta que el CDT venza/se cobre).
function calcRendimientoCDTsMes(mesK){
  let total=0;
  (S.cajitas||[]).forEach(c=>{
    (c.cdts||[]).forEach(cdt=>{
      total+=calcRendimientoCDTMes(cdt,mesK);
    });
  });
  return total;
}

// Verifica y libera CDTs vencidos automáticamente
// Cola de CDTs vencidos pendientes de confirmar (uno a la vez vía sheet 'cobrar-cdt')
let _colaCDTsVencidos=[];

// Detecta CDTs vencidos y los encola para que el usuario confirme el valor REAL
// depositado por Nu (igual que abrirCobrarCDT/confirmarCobrarCDT).
// Ya NO acredita automáticamente el estimado de la app — eso causaba que el
// monto (a veces ligeramente distinto al real) entrara solo, sin que el usuario
// pudiera corregirlo, porque el CDT ya se había borrado del array antes de
// que la pantalla terminara de cargar.
function verificarVencimientosCDT(){
  _colaCDTsVencidos=[];
  (S.cajitas||[]).forEach(c=>{
    (c.cdts||[]).forEach(cdt=>{
      if(cdt.vence){
        const vence=new Date(cdt.vence+'T00:00:00');
        if(new Date()>=vence){
          _colaCDTsVencidos.push({cajitaId:c.id,cdtId:cdt.id});
        }
      }
    });
  });
  _procesarSiguienteCDTVencido();
}

// Abre el sheet de cobro real para el siguiente CDT vencido en cola (si hay).
function _procesarSiguienteCDTVencido(){
  if(!_colaCDTsVencidos.length)return;
  const {cajitaId,cdtId}=_colaCDTsVencidos[0];
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  const cdt=c&&(c.cdts||[]).find(x=>x.id===cdtId);
  // Si ya no existe (cobrado/editado/borrado entretanto), saltar al siguiente
  if(!c||!cdt){
    _colaCDTsVencidos.shift();
    _procesarSiguienteCDTVencido();
    return;
  }
  abrirCobrarCDT(cajitaId,cdtId,true);
}

function nuTotal(){
  return(S.cajitas||[]).reduce((a,c)=>{
    const k=calcC(c);
    const cdtVal=(c.cdts||[]).reduce((b,cdt)=>b+calcCDT(cdt).val,0);
    return a+k.val+cdtVal;
  },0);
}

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Nu — cajitas, metas de ahorro y CDTs (UI)
   ─────────────────────────────────────────────────────────────── */
/* ---- METAS DE AHORRO EN CAJITAS ---- */
// meta = { objetivo, inicio, fin, aportes:[{desc,monto}], minimo }
let _metaCajitaId = null;
let _metaAportesTemp = [];

function calcMetaProgreso(c){
  const meta = c.meta;
  if(!meta || !meta.objetivo || !meta.fin) return null;
  const saldo = calcC(c).val;
  const obj = meta.objetivo;
  const hoyStr = hoy();
  const inicio = meta.inicio || hoyStr;
  const fin = meta.fin;
  const totalMeses = Math.max(1, Math.round((new Date(fin+'T00:00:00') - new Date(inicio+'T00:00:00')) / (1000*60*60*24*30.44)));
  const mesesPasados = Math.max(0, Math.round((new Date(hoyStr+'T00:00:00') - new Date(inicio+'T00:00:00')) / (1000*60*60*24*30.44)));
  const mesesRestantes = Math.max(0, Math.round((new Date(fin+'T00:00:00') - new Date(hoyStr+'T00:00:00')) / (1000*60*60*24*30.44)));
  const esperadoHoy = obj * (mesesPasados / totalMeses);
  const cuotaMensual = meta.aportes && meta.aportes.length ? meta.aportes.reduce((a,ap)=>a+(ap.monto||0),0) : (obj / totalMeses);
  const pct = Math.min(100, (saldo / obj) * 100);
  // cuánto falta para llegar a la meta
  const falta = Math.max(0, obj - saldo);
  // cuánto debería haber acumulado ya
  const diferencia = saldo - esperadoHoy; // positivo = adelantado, negativo = atrasado
  return { saldo, obj, pct, falta, cuotaMensual, esperadoHoy, diferencia, mesesRestantes, totalMeses, mesesPasados };
}

function renderMetaProgress(c){
  const p = calcMetaProgreso(c);
  if(!p) return '';
  const estado = p.diferencia >= 0 ? 'ok' : (p.diferencia > -(p.cuotaMensual*0.5) ? 'warn' : 'late');
  const estadoLabels = {ok:'Al día', warn:'Un poco atrás', late:'Atrasado/a'};
  const estadoColors = {ok:'var(--accent)', warn:'var(--amber)', late:'var(--red)'};
  const aportesHtml = c.meta.aportes && c.meta.aportes.length ? c.meta.aportes.map(ap=>`<span class="cajita-meta-aporte-chip">${escHtml(ap.desc)}: ${fmt(ap.monto)}/mes</span>`).join('') : '';
  // saldo mínimo
  const minInfo = c.meta.minimo ? `<div style="margin-top:8px;padding:7px 9px;background:rgba(240,104,104,.08);border:1px solid rgba(240,104,104,.2);border-radius:7px;">
    <div style="font-size:9px;color:var(--red);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Saldo mínimo configurado</div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:11px;color:var(--text2);">Mínimo: <b style="color:var(--text);">${fmt(c.meta.minimo)}</b></span>
      ${p.saldo < c.meta.minimo ? `<span style="font-size:10px;color:var(--red);font-family:'DM Mono',monospace;">¡Bajo el mínimo! Faltan ${fmt(c.meta.minimo - p.saldo)}</span>` : `<span style="font-size:10px;color:var(--accent);font-family:'DM Mono',monospace;">OK (${fmt(p.saldo - c.meta.minimo)} sobre el mínimo)</span>`}
    </div>
    ${_calcPrestadoMeta(c.id) > 0 ? `<div style="margin-top:5px;font-size:10px;color:var(--amber);font-family:'DM Mono',monospace;">${fmt(_calcPrestadoMeta(c.id))} prestado de esta cajita · Debería haber: ${fmt(p.saldo + _calcPrestadoMeta(c.id))}</div>` : ''}
  </div>` : '';
  return `<div class="cajita-meta-box">
    <div class="cajita-meta-header">
      <span class="cajita-meta-title">Meta: ${fmt(p.obj)}</span>
      <button type="button" ${Events.attr('cuentas:abrirMetaCajita', c.id)} data-stop-propagation="true" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:10px;font-family:'DM Mono',monospace;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,.07);">editar</button>
    </div>
    <div class="cajita-meta-progress"><div class="cajita-meta-fill" style="width:${p.pct.toFixed(1)}%;background:${estadoColors[estado]};"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px;">
      <span>${p.pct.toFixed(0)}% logrado</span>
      <span>${p.mesesRestantes} ${p.mesesRestantes===1?'mes':'meses'} restantes · ${fmt(p.falta)} por ahorrar</span>
    </div>
    <div class="cajita-meta-stats">
      <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Cuota/mes</div><div class="cajita-meta-stat-val">${fmt(p.cuotaMensual)}</div></div>
      <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Esperado hoy</div><div class="cajita-meta-stat-val">${fmt(p.esperadoHoy)}</div></div>
      <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Estado</div><div class="cajita-meta-stat-val ${estado}">${estadoLabels[estado]}</div></div>
    </div>
    ${aportesHtml ? `<div class="cajita-meta-aporte-row">${aportesHtml}</div>` : ''}
    ${minInfo}
  </div>`;
}

function _calcPrestadoMeta(cajitaId){
  // Suma todos los préstamos pendientes que incluyen esta cajita como fuente
  let total = 0;
  (S.deudores||[]).forEach(d=>{
    (d.movimientos||[]).forEach(m=>{
      if(m.tipo==='prestamo'){
        // fuente simple
        if(m.fuente && m.fuente === 'cajita:'+cajitaId) total += m.monto;
        // fuente dividida
        if(m.fuentes && Array.isArray(m.fuentes)){
          m.fuentes.forEach(f=>{ if(f.fuente==='cajita:'+cajitaId) total += (f.monto||0); });
        }
      }
      // restar abonos que pueden haber regresado a la cajita
      if(m.tipo==='abono' || m.tipo==='pago-completo'){
        // destino simple
        if(m.destino==='cajita:'+cajitaId) total -= m.monto;
        // destino dividido
        if(m.destinos && Array.isArray(m.destinos)){
          m.destinos.forEach(r=>{ if(r.fuente==='cajita:'+cajitaId) total -= (r.monto||0); });
        }
      }
    });
  });
  return Math.max(0, total);
}

function abrirMetaCajita(cajitaId){
  _metaCajitaId = cajitaId;
  const c = (S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c) return;
  const meta = c.meta || {};
  document.getElementById('meta_objetivo').value = meta.objetivo ? fmtInput(meta.objetivo) : '';
  document.getElementById('meta_inicio').value = meta.inicio || hoy();
  document.getElementById('meta_fin').value = meta.fin || '';
  document.getElementById('meta_minimo').value = meta.minimo ? fmtInput(meta.minimo) : '';
  _metaAportesTemp = (meta.aportes || []).map(a=>({...a}));
  const wrap = document.getElementById('meta_min_wrap');
  wrap.style.display = meta.minimo ? '' : 'none';
  document.getElementById('btn-toggle-meta-min').textContent = meta.minimo ? '<i class="fa-solid fa-chevron-up" style="margin-right:4px;"></i>Ocultar saldo mínimo' : '<i class="fa-solid fa-chevron-down" style="margin-right:4px;"></i>Configurar saldo mínimo';
  document.getElementById('btn-quitar-meta').style.display = meta.objetivo ? '' : 'none';
  _renderMetaAportes();
  _updateMetaCuotaPreview();
  openSheet('meta-cajita');
}

function _renderMetaAportes(){
  const el = document.getElementById('meta_aportes_list');
  if(!el) return;
  el.innerHTML = _metaAportesTemp.map((ap,i)=>`
    <div class="prest-split-row" style="gap:6px;margin-bottom:7px;">
      <input type="text" value="${escHtml(ap.desc||'')}" placeholder="Ej: Papá, Mamá" class="meta-aporte-desc" data-idx="${i}" style="flex:1;font-size:13px;padding:8px 10px;background:var(--bg3);border:1.5px solid var(--border2);border-radius:var(--radius-sm);color:var(--text);outline:none;font-family:'DM Sans',sans-serif;">
      <input type="text" inputmode="decimal" value="${ap.monto?fmtInput(ap.monto):''}" placeholder="$0" class="money-input meta-aporte-monto" data-idx="${i}" style="width:100px;flex-shrink:0;">
      <button class="prest-split-del" ${Events.attr('cuentas:metaAporteEliminar', i)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
  // Reemplaza los oninput="_metaAportesTemp[i]..." inline (CSP los bloquea).
  // Un solo listener delegado en el contenedor, enganchado una sola vez —
  // #meta_aportes_list no se recrea entre renders, solo su innerHTML, así
  // que hace falta guard (mismo patrón que sheet._personaHook en
  // deudores-personas.js) para no acumular. A diferencia del bug de
  // renderAttencion() (Inicio), acá el listener no cierra sobre `i` ni
  // sobre `ap` — lee el índice de data-idx en el momento del evento, así
  // que no hay problema de "valor viejo" aunque se enganche una sola vez.
  if(!el._metaAportesHooked){
    el._metaAportesHooked = true;
    el.addEventListener('input', (e)=>{
      const descInput = e.target.closest('.meta-aporte-desc');
      if(descInput){
        const idx = Number(descInput.dataset.idx);
        if(_metaAportesTemp[idx]) _metaAportesTemp[idx].desc = descInput.value;
        return;
      }
      const montoInput = e.target.closest('.meta-aporte-monto');
      if(montoInput){
        const idx = Number(montoInput.dataset.idx);
        if(_metaAportesTemp[idx]){
          _metaAportesTemp[idx].monto = parseMoney(montoInput.value)||0;
          _updateMetaCuotaPreview();
        }
      }
    });
  }
}

// Wrapper con nombre propio para el data-action (antes era un onclick con 3
// sentencias inline: splice + re-render + actualizar preview).
function _metaAporteEliminar(i){
  _metaAportesTemp.splice(i,1);
  _renderMetaAportes();
  _updateMetaCuotaPreview();
}

function _updateMetaCuotaPreview(){
  const obj = parseMoney(document.getElementById('meta_objetivo').value)||0;
  const inicio = document.getElementById('meta_inicio').value;
  const fin = document.getElementById('meta_fin').value;
  const el = document.getElementById('meta_cuota_preview');
  if(!el) return;
  if(!obj || !fin){ el.textContent=''; return; }
  const meses = Math.max(1, Math.round((new Date(fin+'T00:00:00') - new Date((inicio||hoy())+'T00:00:00')) / (1000*60*60*24*30.44)));
  const totalAportes = _metaAportesTemp.reduce((a,ap)=>a+(ap.monto||0),0);
  const cuota = totalAportes || (obj / meses);
  el.textContent = `${meses} meses · cuota estimada: ${fmt(cuota)}/mes${totalAportes&&totalAportes!==cuota?' (suma de tus aportes)':''}`;
}

function guardarMetaCajita(){
  const c = (S.cajitas||[]).find(x=>x.id===_metaCajitaId);
  if(!c){ toast('Cajita no encontrada','err'); return; }
  const obj = parseMoney(document.getElementById('meta_objetivo').value)||0;
  const fin = document.getElementById('meta_fin').value;
  if(!obj){ toast('Ingresa el monto objetivo','err'); return; }
  if(!fin){ toast('Ingresa la fecha límite','err'); return; }
  const minimo = parseMoney(document.getElementById('meta_minimo').value)||0;
  const inicio = document.getElementById('meta_inicio').value || hoy();
  if(!c.meta) c.meta = {};
  c.meta.objetivo = obj;
  c.meta.inicio = inicio;
  c.meta.fin = fin;
  c.meta.aportes = _metaAportesTemp.filter(a=>a.monto>0);
  if(minimo) c.meta.minimo = minimo; else delete c.meta.minimo;
  save();
  closeSheet('meta-cajita');
  refresh();
  toast('Meta guardada','ok');
}

// Migrado desde un onclick inline en index.html (botón #btn-toggle-meta-min,
// sheet meta cajita) — usaba `this` para el botón clickeado; acá se busca
// por id en vez de depender de `this`, para que funcione igual vía
// data-action (ver Events.registerAll más abajo).
function toggleMetaMinWrap(){
  const wrap=document.getElementById('meta_min_wrap');
  const btn=document.getElementById('btn-toggle-meta-min');
  if(!wrap||!btn)return;
  const abierto=wrap.style.display==='none';
  wrap.style.display=abierto?'':'none';
  btn.innerHTML=abierto
    ?'<i class="fa-solid fa-chevron-up" style="margin-right:4px;"></i>Ocultar saldo mínimo'
    :'<i class="fa-solid fa-chevron-down" style="margin-right:4px;"></i>Configurar saldo mínimo';
}

function quitarMetaCajita(){
  const c = (S.cajitas||[]).find(x=>x.id===_metaCajitaId);
  if(!c) return;
  delete c.meta;
  save();
  closeSheet('meta-cajita');
  refresh();
  toast('Meta eliminada','info');
}

// Sección "Préstamo con origen dividido" (togglePrestSplit / _renderPrestSplit /
// _updatePrestSplitResumen) migrada a js/modules/prestado.js — ver docs/prestado.md.

function getNuTasaGlobal(){
  const el=document.getElementById('nuTasaGlobal');
  const v=el?parseFloat(el.value.replace(',','.'))||9.25:9.25;
  S.nuTasaGlobal=v;
  return v;
}

// Muestra un resumen corto ("9,25% hasta 05 jul · 9,30% desde 06 jul") de los últimos
// cambios de tasa registrados.
function _renderTasaHistorialTag(){
  const tag=document.getElementById('nuTasaHistorialTag');
  if(!tag)return;
  const hist=(S.historialTasasNu||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:1);
  if(!hist.length){tag.textContent='';return;}
  const fmtFecha=f=>{const d=new Date(f+'T00:00:00');return d.toLocaleDateString('es-CO',{day:'2-digit',month:'short'}).replace('.','');};
  const partes=hist.slice(-3).map(h=>String(h.tasa).replace('.',',')+'% desde '+fmtFecha(h.fecha));
  tag.textContent=partes.join(' · ');
}

function addCajita(){
  if(!S.cajitas)S.cajitas=[];
  if(S.cajitas.length>=MAX)return;
  const nombre='Cajita '+(S.cajitas.length+1);
  S.cajitas.push({id:uid(),nombre,saldo:0,cdts:[]});
  save();renderCajitas();
  const _newId=S.cajitas[S.cajitas.length-1].id;
  if(window.logCambio)logCambio('Creaste una cajita',nombre,0,'cajita',_newId);
}

async function deleteCajita(id){
  const c=(S.cajitas||[]).find(x=>x.id===id);
  if(!c)return;
  if(c.cdts&&c.cdts.length){
    await dialogo('No se puede eliminar','Esta cajita tiene CDTs activos. Espera a que venzan para eliminarla.','Entendido',false);
    return;
  }
  const saldoActual=calcC(c).val;
  if(saldoActual>0){
    await dialogo('No se puede eliminar','Para eliminar esta cajita primero debes retirar todo el dinero. Saldo actual: '+fmt(saldoActual)+'.','Entendido',false);
    return;
  }
  const tcVinculadas=(S.tarjetasCredito||[]).filter(x=>x.cajitaId===id);
  const msgCajita='¿Seguro que quieres eliminar "'+c.nombre+'"? Esta acción no se puede deshacer.'
    +(tcVinculadas.length?' '+(tcVinculadas.length===1?'La tarjeta "'+tcVinculadas[0].nombre+'" está':'Las tarjetas '+tcVinculadas.map(x=>'"'+x.nombre+'"').join(', ')+' están')+' vinculada'+(tcVinculadas.length===1?'':'s')+' a esta cajita para su pago y quedará'+(tcVinculadas.length===1?'':'n')+' sin cajita asignada.':'');
  const ok=await dialogo('Eliminar cajita',msgCajita,'Eliminar',true);
  if(!ok)return;
  const nombreEl=c.nombre;
  S.cajitas=(S.cajitas||[]).filter(x=>x.id!==id);
  // Desvincular tarjetas que pagaban desde esta cajita — sin esto quedaban
  // apuntando a una cajita fantasma (mismo espíritu que eliminarTC con tcMovimientos).
  if(tcVinculadas.length) tcVinculadas.forEach(x=>{x.cajitaId=null;});
  save();refresh();
  toast('Cajita eliminada','info');
  if(window.logCambio)logCambio('Eliminaste cajita "'+nombreEl+'"','',0,'eliminar');
}

let _cdtCajitaId=null;
function abrirCrearCDT(cajitaId){
  _cdtCajitaId=cajitaId;
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const k=calcC(c);
  document.getElementById('cdtCajitaSaldo').textContent=fmt(k.val);
  document.getElementById('cdt_monto').value='';
  document.getElementById('cdt_tasa').value=c.tasa?String(c.tasa).replace('.',','):'';
  document.getElementById('cdt_inicio').value=hoy();
  document.getElementById('cdt_vence').value='';
  document.getElementById('cdt_rte').value='4,00';
  document.getElementById('cdt_preview').textContent='';
  // Botón invertir todo
  const btnInv=document.getElementById('btn-cdt-invertir-todo');
  if(btnInv){
    btnInv.onclick=function(){
      const saldo=calcC((S.cajitas||[]).find(x=>x.id===_cdtCajitaId)||{}).val||0;
      document.getElementById('cdt_monto').value=fmtInput(saldo);
      document.getElementById('cdt_monto').dispatchEvent(new Event('input'));
    };
  }
  openSheet('crear-cdt');
}

function confirmarCrearCDT(){
  const c=(S.cajitas||[]).find(x=>x.id===_cdtCajitaId);
  if(!c){toast('Cajita no encontrada','err');return;}
  const monto=parseMoney(document.getElementById('cdt_monto').value)||0;
  const tasa=parsePct(document.getElementById('cdt_tasa').value)||9.25;
  const rte=parsePct(document.getElementById('cdt_rte').value)||4;
  const inicio=document.getElementById('cdt_inicio').value||hoy();
  const vence=document.getElementById('cdt_vence').value;
  if(monto<50000){toast('El monto mínimo para un CDT es $50.000','err');return;}
  if(new Date(inicio+'T00:00:00')>new Date()){toast('La fecha de apertura no puede ser futura','err');return;}
  if(!vence){toast('Debes definir la fecha de vencimiento','err');return;}
  if(new Date(vence+'T00:00:00')<=new Date(inicio+'T00:00:00')){toast('La fecha de vencimiento debe ser posterior a la apertura','err');return;}
  // Calcular saldo real incluyendo intereses sub-día (lo mismo que muestra el modal)
  const saldoReal=calcC(c).val;
  // Tolerancia de 1 centavo: fmtInput() redondea el saldo mostrado (p.ej. al usar
  // "Invertir todo"), mientras que el saldo interno puede tener precisión de
  // sub-centavo. Sin esta tolerancia, "invertir todo" podía fallar por diferencias
  // de fracción de centavo que no son un déficit real.
  if(monto>saldoReal+0.01){toast(`Saldo insuficiente. Solo tienes ${fmt(saldoReal)} en la cajita.`,'err');return;}
  const montoFinal=Math.min(monto,saldoReal);
  // Materializar los intereses acumulados y descontar el monto del CDT
  c.saldo=saldoReal;
  c.fecha=hoy();
  c.saldo=c.saldo-montoFinal;
  // Agregar CDT al array de CDTs de la cajita
  if(!c.cdts)c.cdts=[];
  c.cdts.push({id:uid(),monto:montoFinal,tasa,rte,inicio,vence});
  save();
  closeSheet('crear-cdt');
  refresh();
  if(window.logCambio)logCambio('Invertiste en un CDT en "'+c.nombre+'"',fmt(montoFinal)+' al '+String(tasa).replace('.',',')+' % EA · vence '+vence,montoFinal,'ahorro',c.id);
  toast(`CDT creado por ${fmt(montoFinal)} al ${String(tasa).replace('.',',')}% EA — se libera el ${vence}`,'ok',4000);
}

async function liberarCDTManual(cajitaId,cdtId){
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt)return;
  const k=calcCDT(cdt);
  const ok=await dialogo('Cerrar CDT','Se cierra el CDT y los '+fmt(k.val)+' (capital '+fmt(cdt.monto)+' + '+fmt(k.ganado)+' de intereses netos) se suman al saldo de la cajita "'+c.nombre+'".','Cerrar y acreditar',false);
  if(!ok)return;
  materializarIntereses(c);
  c.saldo=(c.saldo||0)+k.val;
  c.fecha=hoy();
  c.cdts=(c.cdts||[]).filter(x=>x.id!==cdtId);
  refresh();save();
  if(window.logCambio)logCambio('Cerraste CDT en "'+c.nombre+'"','Capital '+fmt(cdt.monto)+' + intereses acreditados',k.val,'ingreso',c.id);
  toast(`CDT cerrado — ${fmt(k.val)} acreditados a "${escHtml(c.nombre)}"`,'ok',4000);
}


let _cobrarCajitaId=null, _cobrarCdtId=null;

function abrirCobrarCDT(cajitaId,cdtId,esVencimientoAuto){
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt)return;
  const k=calcCDT(cdt);
  _cobrarCajitaId=cajitaId;
  _cobrarCdtId=cdtId;
  document.getElementById('cobrar_estimado').textContent=fmt(k.val);
  document.getElementById('cobrar_detalle_est').textContent=
    'Capital '+fmt(cdt.monto)+' + '+fmt(k.ganado)+' netos (RTE '+fmt(k.retencion)+')';
  // Título y aviso del sheet: si viene del chequeo automático de vencimientos,
  // aclaramos que el CDT ya venció y se necesita el valor real antes de acreditar.
  const tituloEl=document.querySelector('#sheet-cobrar-cdt .sheet-title');
  if(tituloEl)tituloEl.textContent=esVencimientoAuto
    ?'CDT "'+c.nombre+'" venció'
    :'Cobrar CDT vencido';
  const inp=document.getElementById('cobrar_valor');
  inp.value='';
  document.getElementById('cobrar_diff').textContent='';
  // Preview de diferencia en tiempo real
  inp.oninput=()=>{
    const v=parseMoney(inp.value);
    const diff=document.getElementById('cobrar_diff');
    if(!v||isNaN(v)){diff.textContent='';return;}
    const d=v-k.val;
    const abs=Math.abs(d).toFixed(2);
    if(Math.abs(d)<0.01){diff.innerHTML='<i class="fa-solid fa-check" style="margin-right:4px;"></i>Coincide exacto con el estimado';diff.style.color='var(--accent)';}
    else if(d>0){diff.textContent='↑ +$'+abs.replace('.',',') +' más que el estimado';diff.style.color='var(--purple)';}
    else{diff.textContent='↓ −$'+abs.replace('.',',')+' menos que el estimado';diff.style.color='var(--text3)';}
  };
  openSheet('cobrar-cdt');
}

async function confirmarCobrarCDT(){
  const cajitaId=_cobrarCajitaId, cdtId=_cobrarCdtId;
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt)return;
  const valorReal=parseMoney(document.getElementById('cobrar_valor').value);
  if(!valorReal||valorReal<=0){toast('Pon el valor real que te depositó Nu','err');return;}
  if(valorReal<cdt.monto){toast('El valor no puede ser menor al capital invertido','err');return;}
  const ok=await dialogo('Cobrar CDT',
    fmt(valorReal)+' se acreditarán a la cajita "'+c.nombre+'". Este valor reemplaza el estimado de la app.',
    'Confirmar cobro',false);
  if(!ok)return;
  materializarIntereses(c);
  c.saldo=(c.saldo||0)+valorReal;
  c.fecha=hoy();
  c.cdts=(c.cdts||[]).filter(x=>x.id!==cdtId);
  closeSheet('cobrar-cdt');
  refresh();save();
  if(window.logCambio)logCambio('Cobraste CDT de "'+c.nombre+'"','Valor real acreditado a la cajita',valorReal,'ingreso',c.id);
  toast('CDT cobrado — '+fmt(valorReal)+' acreditados a "'+escHtml(c.nombre)+'"','ok',4000);
  // Si este CDT venía de la cola de vencimientos automáticos, sacarlo y seguir
  // con el siguiente pendiente (si hay más vencidos esperando confirmación).
  if(_colaCDTsVencidos.length&&_colaCDTsVencidos[0].cajitaId===cajitaId&&_colaCDTsVencidos[0].cdtId===cdtId){
    _colaCDTsVencidos.shift();
    setTimeout(_procesarSiguienteCDTVencido,400);
  }
}

// Si el usuario cancela el sheet de "Cobrar CDT" sin confirmar:
// - El CDT sigue en S.cdts con fecha vencida (volverá a preguntarse después).
// - Si hay más CDTs vencidos en cola, mostramos el siguiente (no nos quedamos
//   atorados esperando que el usuario abra el sheet manualmente).
function _cancelarCobrarCDT(){
  if(_colaCDTsVencidos.length){
    const {cajitaId,cdtId}=_colaCDTsVencidos[0];
    if(cajitaId===_cobrarCajitaId&&cdtId===_cobrarCdtId){
      _colaCDTsVencidos.shift();
      setTimeout(_procesarSiguienteCDTVencido,400);
    }
  }
}

async function editarCDT(cajitaId,cdtId){
  const ok=await dialogo('Editar CDT','Los CDTs están diseñados para no tocarse. Editar puede cambiar los intereses calculados. ¿Estás seguro?','Editar de todas formas',true);
  if(!ok)return;
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt)return;
  // Reutilizar el sheet de creación en modo edición
  _cdtCajitaId=cajitaId;
  _cdtEditId=cdtId;
  document.getElementById('cdtCajitaSaldo').textContent=fmt(calcC(c).val+cdt.monto);
  document.getElementById('cdt_monto').value=fmtInput(cdt.monto);
  document.getElementById('cdt_tasa').value=String(cdt.tasa).replace('.',',');
  document.getElementById('cdt_inicio').value=cdt.inicio||hoy();
  document.getElementById('cdt_vence').value=cdt.vence||'';
  document.getElementById('cdt_rte').value=cdt.rte!=null?cdt.rte:'4';
  // Cambiar botón confirmar para que guarde en modo edición
  const btn=document.querySelector('#sheet-crear-cdt .btn-primary');
  if(btn){ btn._origOnclick=btn.onclick; btn.textContent='Guardar cambios'; btn.onclick=()=>guardarCDT(cajitaId,cdtId); }
  openSheet('crear-cdt');
  toast('Edita los campos y presiona guardar','info');
}

let _cdtEditId=null;

function guardarCDT(cajitaId,cdtId){
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c)return;
  const cdt=(c.cdts||[]).find(x=>x.id===cdtId);
  if(!cdt)return;
  const nuevaTasa=parsePct(document.getElementById('cdt_tasa').value)||cdt.tasa;
  const nuevoVence=document.getElementById('cdt_vence').value||cdt.vence;
  const nuevoRte=parsePct(document.getElementById('cdt_rte').value);
  if(isNaN(nuevaTasa)||nuevaTasa<=0){toast('Tasa inválida','err');return;}
  if(!nuevoVence){toast('Fecha de vencimiento requerida','err');return;}
  const nuevoInicio=document.getElementById('cdt_inicio').value||cdt.inicio;
  cdt.tasa=nuevaTasa;
  cdt.inicio=nuevoInicio||cdt.inicio;
  cdt.vence=nuevoVence;
  if(!isNaN(nuevoRte))cdt.rte=nuevoRte;
  // Restaurar botón original
  const btn=document.querySelector('#sheet-crear-cdt .btn-primary');
  if(btn&&btn._origOnclick){ btn.onclick=btn._origOnclick; btn.textContent='Crear CDT'; delete btn._origOnclick; }
  _cdtEditId=null;
  save();
  closeSheet('crear-cdt');
  refresh();
  if(window.logCambio){const _ce=(S.cajitas||[]).find(x=>x.id===cajitaId);if(_ce)logCambio('Editaste CDT en "'+_ce.nombre+'"','Tasa o fechas modificadas',0,'editar',cajitaId);}
  toast('CDT actualizado','ok',3000);
}

function renderCajitas(){
  const el=document.getElementById('cajitasList');
  const msg=document.getElementById('cajitasMsg');
  const btn=document.getElementById('btnAddCajita');
  const cajitas=S.cajitas||[];
  if(!cajitas.length){
    el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:6px 0 8px;">Sin cajitas. Agrega tu primera cajita de Nu — empieza en $0 y crece sola.</div>';
    msg.textContent='';btn.style.display='';return;
  }
  el.innerHTML=cajitas.map(c=>{
    const k=calcC(c);
    const cdts=c.cdts||[];
    const hasCDTs=cdts.length>0;
    const totalCDT=cdts.reduce((a,cdt)=>a+calcCDT(cdt).val,0);
    const tasaDisplay=getNuTasaGlobal();
    // El interés diario se calcula sobre la base completa (saldo propio + encargos en la cajita)
    const _baseInteresRender=k.val+(k.saldoEncargos||0);
    const interesHoy=_baseInteresRender>0?(_baseInteresRender*(Math.pow(1+tasaDisplay/100,1/365)-1)):0;
    const hasMeta=!!(c.meta&&c.meta.objetivo);
    const metaPct=hasMeta?Math.min(100,(k.val/c.meta.objetivo)*100):0;
    // Badges indicadores
    const cdtBadge=hasCDTs?`<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px 3px 6px;border-radius:20px;background:rgba(176,144,240,.15);border:1px solid rgba(176,144,240,.4);color:var(--purple);font-size:10px;font-weight:600;font-family:'DM Mono',monospace;white-space:nowrap;flex-shrink:0;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>${cdts.length===1?fmt(totalCDT):cdts.length+' CDTs'}</span>`:'';
    const metaBadge=hasMeta?`<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:20px;background:rgba(200,240,96,.12);border:1px solid rgba(200,240,96,.3);color:var(--accent);font-size:10px;font-weight:600;font-family:'DM Mono',monospace;white-space:nowrap;flex-shrink:0;">${metaPct.toFixed(0)}%</span>`:'';
    return`<div class="cajita-row-hover" style="background:var(--bg3);border-radius:var(--radius-sm);padding:14px 13px;margin-bottom:7px;cursor:pointer;transition:border-color .15s,background .15s;display:flex;align-items:center;gap:10px;" id="cajita-row-${c.id}" ${Events.attr('cuentas:abrirDetalleCajita', c.id)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nu-light)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(c.nombre)}</div>
        ${interesHoy>0.1?`<div style="font-size:10px;color:var(--accent);font-family:'DM Mono',monospace;margin-top:2px;">+${fmt(interesHoy)}/día</div>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:5px;flex-wrap:nowrap;flex-shrink:0;">${cdtBadge}${metaBadge}</div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:15px;font-weight:500;font-family:'DM Mono',monospace;color:var(--nu-light);">${fmt(k.val)}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  }).join('');
  if(cajitas.length>=MAX){msg.innerHTML=`<div class="cajita-limit-msg">Límite alcanzado (${MAX}/${MAX})</div>`;btn.style.display='none';}
  else{msg.innerHTML=`<div class="cajita-limit-msg">${cajitas.length}/${MAX} cajitas</div>`;btn.style.display='';}
}

/* ══ NAVEGACIÓN CAJITA DETAIL ══ */
let _cajitaActualId = null;

function _showCuentasPanel(panelId){
  const panels=['cuentas-selector','cuentas-detalle-nequi','cuentas-detalle-nu','cuentas-detalle-efectivo','cuentas-detalle-custom','cuentas-detalle-cajita','cuentas-sub-meta','cuentas-sub-cdts'];
  panels.forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display = id===panelId ? '' : 'none';
  });
}

function volverANu(){
  _cajitaActualId = null;
  renderCajitas();
  _showCuentasPanel('cuentas-detalle-nu');
}

function volverADetalleCajita(){
  const c=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(c) _renderDetalleCajita(c);
  _showCuentasPanel('cuentas-detalle-cajita');
}

function abrirDetalleCajita(cajitaId){
  const c=(S.cajitas||[]).find(x=>x.id===cajitaId);
  if(!c) return;
  _cajitaActualId = cajitaId;
  _renderDetalleCajita(c);
  _showCuentasPanel('cuentas-detalle-cajita');
}

function _renderDetalleCajita(c){
  if(!c) c=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(!c) return;
  const k=calcC(c);
  const tasaDisplay=getNuTasaGlobal();
  // Interés diario sobre la base completa (saldo propio + encargos en la cajita)
  const _baseInteresDet=k.val+(k.saldoEncargos||0);
  const interesHoy=_baseInteresDet>0?(_baseInteresDet*(Math.pow(1+tasaDisplay/100,1/365)-1)):0;
  const cdts=c.cdts||[];
  const hasCDTs=cdts.length>0;
  const totalCDT=cdts.reduce((a,cdt)=>a+calcCDT(cdt).val,0);
  const hasMeta=!!(c.meta&&c.meta.objetivo);

  // Nombre en header
  document.getElementById('cajita-det-nombre').textContent=c.nombre;
  // Saldo hero
  document.getElementById('cajita-det-saldo').textContent=fmt(k.val);
  document.getElementById('cajita-det-interes').textContent=interesHoy>0.1?'+'+fmt(interesHoy)+'/día · '+String(tasaDisplay).replace('.',',')+'% EA':'';
  // Input nombre editable — sync con el campo
  const nameInput=document.getElementById('cajita-det-name-input');
  if(nameInput){
    nameInput.value=c.nombre;
    let _renameTimer=null;
    let _nombreAntes=c.nombre;
    nameInput.oninput=()=>{
      c.nombre=nameInput.value;
      document.getElementById('cajita-det-nombre').textContent=nameInput.value;
      save();
      clearTimeout(_renameTimer);
      _renameTimer=setTimeout(()=>{
        if(nameInput.value&&nameInput.value!==_nombreAntes){
          if(window.logCambio)logCambio('Renombraste cajita a "'+nameInput.value+'"',_nombreAntes?'antes: '+_nombreAntes:'',0,'editar',c.id);
          _nombreAntes=nameInput.value;
        }
      },1200);
    };
  }

  // Botones acción
  document.getElementById('cajita-det-agregar').onclick=()=>abrirAgregarDinero('cajita:'+c.id, c.nombre);
  document.getElementById('cajita-det-retirar').onclick=()=>abrirRestarDinero('cajita:'+c.id, c.nombre);
  document.getElementById('cajita-det-mover').onclick=()=>abrirTransferir('cajita:'+c.id);

  // Card Meta preview
  const metaPreview=document.getElementById('cajita-det-meta-preview');
  const metaBarWrap=document.getElementById('cajita-det-meta-bar-wrap');
  const metaBar=document.getElementById('cajita-det-meta-bar');
  if(hasMeta){
    const pct=Math.min(100,(k.val/c.meta.objetivo)*100);
    metaPreview.textContent=fmt(c.meta.objetivo)+' · '+pct.toFixed(0)+'% logrado';
    metaPreview.style.color='var(--accent)';
    metaBarWrap.style.display='';
    metaBar.style.width=pct.toFixed(1)+'%';
  } else {
    metaPreview.textContent='Toca para configurar una meta';
    metaPreview.style.color='var(--text3)';
    metaBarWrap.style.display='none';
  }

  // Card CDTs preview
  const cdtPreview=document.getElementById('cajita-det-cdt-preview');
  if(hasCDTs){
    cdtPreview.textContent=cdts.length+' CDT'+(cdts.length>1?'s':'')+' · '+fmt(totalCDT)+' bloqueado';
    cdtPreview.style.color='var(--purple)';
  } else {
    cdtPreview.textContent='Toca para crear un CDT';
    cdtPreview.style.color='var(--text3)';
  }
}

async function _cajitaDetDelete(){
  if(!_cajitaActualId) return;
  await deleteCajita(_cajitaActualId);
  // Si se eliminó, volver a Nu
  const aun=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(!aun){ _cajitaActualId=null; _showCuentasPanel('cuentas-detalle-nu'); }
}

/* ── Sub-pantalla: Meta ── */
function abrirSubMeta(){
  const c=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(!c) return;
  const el=document.getElementById('sub-meta-content');
  const p=calcMetaProgreso(c);
  if(!p){
    // Sin meta — mostrar formulario rápido
    el.innerHTML=`<div class="card" style="text-align:center;padding:24px 20px;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" style="margin-bottom:12px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px;">Sin meta configurada</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:18px;">Define un objetivo de ahorro para esta cajita y lleva el seguimiento mes a mes.</div>
      <button type="button" class="btn btn-primary" ${Events.attr('cuentas:abrirMetaCajita', c.id)}>Configurar meta</button>
    </div>`;
  } else {
    const estadoColors={ok:'var(--accent)',warn:'var(--amber)',late:'var(--red)'};
    const estadoLabels={ok:'Al día',warn:'Un poco atrás',late:'Atrasado/a'};
    const estado=p.diferencia>=0?'ok':(p.diferencia>-(p.cuotaMensual*0.5)?'warn':'late');
    const aportesHtml=c.meta.aportes&&c.meta.aportes.length?c.meta.aportes.map(ap=>`<span class="cajita-meta-aporte-chip">${escHtml(ap.desc)}: ${fmt(ap.monto)}/mes</span>`).join(''):'';
    const minimoHtml=c.meta.minimo?`<div style="margin-top:10px;padding:10px 12px;background:rgba(240,104,104,.08);border:1px solid rgba(240,104,104,.2);border-radius:9px;">
      <div style="font-size:10px;color:var(--red);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Saldo mínimo</div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;color:var(--text2);">Mínimo: <b style="color:var(--text);">${fmt(c.meta.minimo)}</b></span>
        ${p.saldo<c.meta.minimo?`<span style="font-size:11px;color:var(--red);font-family:'DM Mono',monospace;">¡Bajo! −${fmt(c.meta.minimo-p.saldo)}</span>`:`<span style="font-size:11px;color:var(--accent);font-family:'DM Mono',monospace;">OK +${fmt(p.saldo-c.meta.minimo)}</span>`}
      </div>
    </div>`:'';
    el.innerHTML=`
      <div class="card" style="margin-bottom:9px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div>
            <div style="font-size:18px;font-weight:600;font-family:'DM Mono',monospace;color:var(--accent);">${fmt(p.obj)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;">Objetivo</div>
          </div>
          <span class="badge" style="background:rgba(${estado==='ok'?'200,240,96':'warn'===estado?'240,184,64':'240,104,104'},.12);color:${estadoColors[estado]};border:1px solid;border-color:${estadoColors[estado]}40;">${estadoLabels[estado]}</span>
        </div>
        <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-bottom:8px;">
          <div style="height:100%;width:${p.pct.toFixed(1)}%;background:${estadoColors[estado]};border-radius:4px;transition:width .5s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:14px;">
          <span>${p.pct.toFixed(0)}% logrado · ${fmt(p.saldo)} ahorrado</span>
          <span>Faltan ${fmt(p.falta)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:${aportesHtml||minimoHtml?'12':'0'}px;">
          <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Cuota/mes</div><div class="cajita-meta-stat-val">${fmt(p.cuotaMensual)}</div></div>
          <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Esperado hoy</div><div class="cajita-meta-stat-val">${fmt(p.esperadoHoy)}</div></div>
          <div class="cajita-meta-stat"><div class="cajita-meta-stat-label">Meses rest.</div><div class="cajita-meta-stat-val">${p.mesesRestantes}</div></div>
        </div>
        ${aportesHtml?`<div class="cajita-meta-aporte-row" style="margin-bottom:10px;">${aportesHtml}</div>`:''}
        ${minimoHtml}
      </div>
      <button type="button" class="btn btn-ghost" style="margin-bottom:8px;" ${Events.attr('cuentas:abrirMetaCajita', c.id)}>Editar meta</button>
      <button type="button" class="btn btn-ghost" style="color:var(--red);border-color:rgba(240,104,104,.3);" ${Events.attr('cuentas:quitarMetaCajita')}>Eliminar meta</button>`;
  }
  _showCuentasPanel('cuentas-sub-meta');
}

/* ── Sub-pantalla: CDTs ── */
function abrirSubCDTs(){
  const c=(S.cajitas||[]).find(x=>x.id===_cajitaActualId);
  if(!c) return;
  const el=document.getElementById('sub-cdts-content');
  const cdts=c.cdts||[];
  const saldoDisp=calcC(c).val;
  let html='';
  if(!cdts.length){
    html=`<div class="card" style="text-align:center;padding:24px 20px;margin-bottom:9px;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="1.5" stroke-linecap="round" style="margin-bottom:12px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px;">Sin CDTs activos</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:18px;">Bloquea parte del saldo de esta cajita como CDT y gana intereses mientras esperas el vencimiento.</div>
    </div>`;
  } else {
    html=cdts.map(cdt=>{
      const cdtK=calcCDT(cdt);
      const dr=cdt.vence?Math.ceil((new Date(cdt.vence+'T00:00:00')-new Date())/86400000):null;
      const vencido=dr!==null&&dr<=0;
      return`<div class="card" style="margin-bottom:9px;background:rgba(176,144,240,.06);border-color:rgba(176,144,240,.25);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">
          <div>
            <div style="font-size:18px;font-weight:500;font-family:'DM Mono',monospace;color:var(--purple);">${fmt(cdtK.val)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;">Capital: ${fmt(cdt.monto)} · +${fmt(cdtK.ganado)} netos · ${String(cdt.tasa).replace('.',',')}% EA</div>
            ${cdtK.retencion>0.01?`<div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:1px;">RTE ${cdt.rte!=null?cdt.rte:4}%: −${fmt(cdtK.retencion)}</div>`:''}
          </div>
          ${dr!==null?`<span class="badge ${vencido?'bg-red':'bg-purple'}">${vencido?'¡Venció!':dr+'d'}</span>`:''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <div style="background:var(--bg4);border-radius:7px;padding:8px 10px;">
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-family:'DM Mono',monospace;margin-bottom:3px;">Apertura</div>
            <div style="font-size:12px;font-family:'DM Mono',monospace;">${cdt.inicio||'—'}</div>
          </div>
          <div style="background:var(--bg4);border-radius:7px;padding:8px 10px;">
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-family:'DM Mono',monospace;margin-bottom:3px;">Vence</div>
            <div style="font-size:12px;font-family:'DM Mono',monospace;">${cdt.vence||'—'}</div>
          </div>
        </div>
        <div style="display:flex;gap:7px;">
          <button type="button" class="btn btn-ghost btn-sm" style="flex:1;" ${Events.attr('cuentas:editarCDT', c.id, cdt.id)}>Editar</button>
          ${vencido
            ? `<button type="button" class="btn btn-sm" style="flex:1;background:rgba(200,240,96,.18);border-color:rgba(200,240,96,.6);color:var(--accent);font-weight:700;" ${Events.attr('cuentas:abrirCobrarCDT', c.id, cdt.id)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="margin-right:4px;vertical-align:middle;"><polyline points="20 6 9 17 4 12"/></svg>
            Cobrar CDT
          </button>`
            : `<button type="button" class="btn btn-sm" style="flex:1;background:rgba(200,240,96,.12);border-color:rgba(200,240,96,.35);color:var(--accent);" ${Events.attr('cuentas:liberarCDTManual', c.id, cdt.id)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="margin-right:4px;vertical-align:middle;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>
            Cerrar CDT
          </button>`}
        </div>
      </div>`;
    }).join('');
  }
  html+=`<button type="button" class="btn btn-ghost" style="margin-top:${cdts.length?'4':'0'}px;" ${Events.attr('cuentas:abrirCrearCDT', c.id)}>
    <span style="display:flex;align-items:center;justify-content:center;gap:5px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      ${cdts.length?'Agregar otro CDT':'Crear CDT'}
    </span>
  </button>
  <div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;text-align:center;">Disponible en cajita: ${fmt(saldoDisp)}</div>`;
  el.innerHTML=html;
  _showCuentasPanel('cuentas-sub-cdts');
}

// Cuando se guarde/refresh, actualizar el detalle de cajita si está abierto
function _refreshCajitaDet(){
  // Usar _cajitaActualId, o _metaCajitaId como fallback (cuando se abre meta desde lista)
  const idActual = _cajitaActualId || _metaCajitaId;
  if(!idActual) return;
  const c=(S.cajitas||[]).find(x=>x.id===idActual);
  if(!c) return;
  const panel=document.getElementById('cuentas-detalle-cajita');
  if(panel&&panel.style.display!=='none') _renderDetalleCajita(c);
  const subMeta=document.getElementById('cuentas-sub-meta');
  if(subMeta&&subMeta.style.display!=='none') abrirSubMeta();
  const subCDTs=document.getElementById('cuentas-sub-cdts');
  if(subCDTs&&subCDTs.style.display!=='none') abrirSubCDTs();
}

/* ---- CAJITA TOGGLE ---- */
function toggleCDT(e, cajitaId, cdtId){
  if(e&&e.stopPropagation)e.stopPropagation();
  const box=document.getElementById('cajita-cdt-'+cajitaId+'-'+cdtId);
  if(!box){
    // Abrir body de la cajita si está colapsado
    const wrap=document.getElementById('cajita-wrap-'+cajitaId);
    if(wrap){
      const body=wrap.querySelector('.cajita-body');
      if(body&&body.style.display==='none'){body.style.display='block';wrap.classList.add('cajita-expanded');}
    }
    return;
  }
  // Si la cajita está colapsada, expandirla primero
  const wrap=document.getElementById('cajita-wrap-'+cajitaId);
  if(wrap){
    const body=wrap.querySelector('.cajita-body');
    if(body&&body.style.display==='none'){body.style.display='block';wrap.classList.add('cajita-expanded');}
  }
  const isOpen=box.style.display!=='none';
  box.style.display=isOpen?'none':'block';
}

// Expande cajita y muestra todos sus CDTs (llamado desde el pill único en header)
function _expandCajitaCDTs(cajitaId){
  const wrap=document.getElementById("cajita-wrap-"+cajitaId);
  if(!wrap)return;
  const body=wrap.querySelector(".cajita-body");
  const prefix="cajita-cdt-"+cajitaId+"-";
  const allBoxes=wrap.querySelectorAll("[id]");
  const cdtBoxes=[...allBoxes].filter(el=>el.id.startsWith(prefix));
  // Toggle: si todos los CDTs están abiertos los cierra, si no los abre
  const allOpen=cdtBoxes.length>0&&cdtBoxes.every(b=>b.style.display!=='none'&&b.style.display!=='');
  if(allOpen){
    cdtBoxes.forEach(box=>{ box.style.display='none'; });
  } else {
    if(body&&body.style.display==='none'){
      body.style.display='block';
      wrap.classList.remove('cajita-collapsed');
      wrap.classList.add('cajita-expanded');
      const btn=wrap.querySelector('.cajita-toggle-btn');
      if(btn)btn.style.transform='rotate(180deg)';
    }
    cdtBoxes.forEach(box=>{ box.style.display='block'; });
    if(cdtBoxes.length>0){
      setTimeout(()=>{ cdtBoxes[0].scrollIntoView({behavior:'smooth',block:'nearest'}); },80);
    }
  }
}

function toggleCajita(e, id){
  if(e&&e.stopPropagation)e.stopPropagation();
  const wrap=document.getElementById('cajita-wrap-'+id);
  if(!wrap)return;
  const body=wrap.querySelector('.cajita-body');
  const btn=wrap.querySelector('.cajita-toggle-btn');
  const isOpen=wrap.classList.contains('cajita-expanded');
  if(isOpen){
    body.style.display='none';
    wrap.classList.remove('cajita-expanded');
    wrap.classList.add('cajita-collapsed');
    if(btn)btn.style.transform='';
  } else {
    body.style.display='block';
    wrap.classList.remove('cajita-collapsed');
    wrap.classList.add('cajita-expanded');
    if(btn)btn.style.transform='rotate(180deg)';
  }
}

/* ───────────────────────────────────────────────────────────────
   SECCIÓN: Movimientos por cuenta (recopilación desde todas las
   fuentes: manuales, gastos, préstamos, mesada, Spotify, transferencias)
   ─────────────────────────────────────────────────────────────── */
/* ---- MOVIMIENTOS PARA CUENTA PERSONALIZADA ---- */
// Recopila todos los movimientos que afectan a una cuenta personalizada
// (fuente 'custom:ID') desde todas las fuentes, igual que getMovimientosCuenta
// hace para nequi/efectivo/cajitas.
function _getMovimientosCuentaCustom(fuente) {
  const cid = fuente.split(':')[1];
  const c = (S.cuentasPersonalizadas || []).find(x => x.id === cid);
  const movs = [];
  let _idx = 0;

  // 1. Movimientos manuales directos guardados en c.movimientos[] (legacy + nuevos tipo ingreso/egreso)
  (c ? (c.movimientos || []) : []).forEach(m => {
    const esApertura = m.tipo === 'apertura';
    const esIngreso  = m.tipo === 'ingreso' || m.tipo === 'entrada';
    const esEgreso   = m.tipo === 'egreso'  || m.tipo === 'salida_manual';
    const tipoDisplay = esApertura ? 'apertura' : esIngreso ? 'ingreso' : 'egreso';
    const montoDisplay = esIngreso ? +m.monto : esEgreso ? -m.monto : +m.monto;
    let _origen = esApertura ? 'Saldo inicial' : m._origenSeccion || 'Cuenta personalizada · Movimiento manual';
    movs.push({
      tipo: tipoDisplay, fecha: m.fecha, desc: m.nota || m.desc || (esApertura ? 'Saldo inicial' : esIngreso ? 'Ingreso' : 'Retiro'),
      monto: montoDisplay, fuente, _idx: _idx++, _movId: m.id,
      _fuenteOrigen: fuente, _fuenteDestino: '', _origen,
      _otrasCuentas: null, _secundario: !!m._secundario, _origenSeccion: m._origenSeccion || ''
    });
  });

  // 2. Movimientos en S.movimientos con fuente o destino = custom:ID
  (S.movimientos || []).forEach(m => {
    if (m.fuente !== fuente) return;
    // Evitar duplicados: los que están en c.movimientos ya se incluyen arriba
    const yaIncluido = c && (c.movimientos || []).some(x => x.id === m.id);
    if (yaIncluido) return;
    const esEntrada = m.tipo === 'entrada';
    const esApertura = m.tipo === 'apertura';
    const esTransferencia = m.tipo === 'transferencia';
    const esIntercambioSalida = esTransferencia && (
      m._intercambioSalida ? true :
      m._intercambioEntrada ? false :
      !!(m._fuenteDestino && m._fuenteDestino !== m.fuente)
    );
    const tipoDisplay = esApertura ? 'apertura' : esTransferencia ? 'transferencia' : esEntrada ? 'ingreso' : 'egreso';
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
    else { _origen = 'Cuentas · Movimiento manual'; }
    movs.push({
      tipo: tipoDisplay, fecha: m.fecha, desc: m.desc || (esApertura ? 'Saldo inicial' : esEntrada ? 'Ingreso' : esTransferencia ? 'Intercambio' : 'Retiro'),
      monto: montoDisplay, fuente, _idx: _idx++, _movId: m.id,
      _fuenteOrigen: fuente, _fuenteDestino: m._fuenteDestino || '', _origen, _otrasCuentas,
      _secundario: !!m._secundario, _origenSeccion: m._origenSeccion || ''
    });
  });

  // 3. Gastos variables pagados desde esta cuenta
  (S.gastosVar || []).forEach(g => {
    if (g.fuente !== fuente) return;
    const _origen = g._secundario && g._origenSeccion ? g._origenSeccion : g.esPagoGastoFijo ? 'Gastos fijos' : g._esPagoTC ? 'Tarjeta de crédito' : g._esExtraPrestamo ? 'Préstamos' : 'Gastos';
    movs.push({ tipo: 'gasto', fecha: g.fecha, desc: g.desc, monto: -g.monto, fuente, _idx: _idx++, _movId: g.id, _fuenteOrigen: fuente, _origen, _otrasCuentas: null, _secundario: !!g._secundario, _origenSeccion: g._origenSeccion || '' });
  });

  // 4. Préstamos dados desde esta cuenta
  (S.deudores || []).forEach(d => {
    (d.movimientos || []).forEach(m => {
      if (m.tipo === 'prestamo' && (m.fuente === fuente || (m.fuentes || []).some(f => f.fuente === fuente))) {
        const _origenP = 'Préstamos · ' + d.nombre;
        if (m.fuente === fuente) {
          movs.push({ tipo: 'prestamo', fecha: m.fecha, desc: 'Préstamo a ' + d.nombre, monto: -m.monto, nota: m.nota, fuente, _idx: _idx++, _movId: m.id, _fuenteOrigen: fuente, _origen: _origenP, _otrasCuentas: null });
        }
        (m.fuentes || []).forEach(f => {
          if (f.fuente === fuente && f.monto) {
            movs.push({ tipo: 'prestamo', fecha: m.fecha, desc: 'Préstamo a ' + d.nombre, monto: -f.monto, nota: m.nota, fuente, _idx: _idx++, _movId: m.id, _fuenteOrigen: fuente, _origen: _origenP, _otrasCuentas: null });
          }
        });
      }
    });
  });

  // 5. Transferencias entre cuentas
  (S.transferencias || []).forEach(t => {
    if (t.origen === fuente) {
      movs.push({ tipo: 'transferencia', fecha: t.fecha, desc: 'Transferencia → ' + fuenteLabel(t.destino), monto: -t.monto, nota: t.nota, fuente, _idx: _idx++, _movId: t.id, _fuenteOrigen: t.origen, _fuenteDestino: t.destino, _origen: 'Cuentas · Transferencia', _otrasCuentas: [{ fuente: t.destino, monto: +t.monto }] });
    }
    if (t.destino === fuente) {
      movs.push({ tipo: 'transferencia', fecha: t.fecha, desc: 'Transferencia ← ' + fuenteLabel(t.origen), monto: +t.monto, nota: t.nota, fuente, _idx: _idx++, _movId: t.id, _fuenteOrigen: t.origen, _fuenteDestino: t.destino, _origen: 'Cuentas · Transferencia', _otrasCuentas: [{ fuente: t.origen, monto: -t.monto }] });
    }
  });

  // 6. Cobros Spotify
  (S.spotifyHistorial || []).forEach(h => {
    if (h.tipo === 'pago' || h.fuente !== fuente) return;
    movs.push({ tipo: 'ingreso', fecha: h.fecha, desc: 'Cobro Spotify (' + h.nombre + ')', monto: +h.monto, fuente, _idx: _idx++, _movId: h.id || null, _origen: 'Spotify', _otrasCuentas: null, _secundario: true, _origenSeccion: 'Spotify' });
  });

  // Sort: fecha desc, luego _movId desc (timestamp base-36)
  movs.sort((a, b) => {
    const dc = (b.fecha || '').localeCompare(a.fecha || '');
    if (dc !== 0) return dc;
    const aId = a._movId || '', bId = b._movId || '';
    if (aId && bId) return bId.localeCompare(aId);
    if (aId) return -1; if (bId) return 1;
    return (b._idx || 0) - (a._idx || 0);
  });
  return movs;
}

function getMovimientosCuenta(tipo) {
  // Custom accounts: 'custom:ID' — delegate to specialised function
  if (tipo && tipo.startsWith('custom:')) return _getMovimientosCuentaCustom(tipo);
  const movs = [];
  let _idx = 0;
  // Movimientos manuales de entrada/salida (agregar/restar dinero)
  (S.movimientos || []).forEach(m => {
    const matchFuente = tipo === 'nu'
      ? (m.fuente && m.fuente.startsWith('cajita:'))
      : m.fuente === tipo;
    if (matchFuente) {
      const esEntrada = m.tipo === 'entrada';
      const esApertura = m.tipo === 'apertura';
      const esTransferencia = m.tipo === 'transferencia';
      // Para transferencias de intercambio encargo: usar los flags semánticos directamente.
      // _intercambioSalida = plata que salió de esta cuenta (negativo)
      // _intercambioEntrada = plata que entró a esta cuenta (positivo)
      // Sin esos flags, caer al comportamiento anterior: _fuenteDestino distinto → salida
      const esIntercambioSalida = esTransferencia && (
        m._intercambioSalida ? true :
        m._intercambioEntrada ? false :
        !!(m._fuenteDestino && m._fuenteDestino !== m.fuente)
      );
      const tipoDisplay = esApertura ? 'apertura' : esTransferencia ? 'transferencia' : esEntrada ? 'ingreso' : 'salida_manual';
      const montoDisplay = (esApertura) ? +m.monto : esTransferencia ? (esIntercambioSalida ? -m.monto : +m.monto) : esEntrada ? +m.monto : -m.monto;
      let _origen, _otrasCuentas = null;
      if (esApertura) { _origen = 'Saldo inicial'; }
      else if (m._esIntercambioEncargo) {
        _origen = 'Encargos · Intercambio';
        const hermano = (S.movimientos || []).find(x => x._esIntercambioEncargo && x._encMovId === m._encMovId && x.id !== m.id);
        if (hermano) _otrasCuentas = [{ fuente: hermano.fuente, monto: hermano._intercambioSalida ? -hermano.monto : +hermano.monto }];
      }
      else if (esTransferencia) { _origen = 'Cuentas · Movimiento manual'; if (m._fuenteDestino) _otrasCuentas = [{ fuente: m._fuenteDestino, monto: esIntercambioSalida ? +m.monto : -m.monto }]; }
      else if (m._esReposicionCP) { _origen = 'Plata comprometida'; }
      else if (m._encMovId || /encargo/i.test(m.desc||'')) { _origen = 'Encargos'; }
      else if (m._secundario && m._origenSeccion) { _origen = m._origenSeccion; }
      else { _origen = 'Cuentas · Movimiento manual'; }
      movs.push({ tipo: tipoDisplay, fecha: m.fecha, desc: m.desc || (esApertura ? 'Saldo inicial' : esEntrada ? 'Entrada de efectivo' : esTransferencia ? 'Intercambio' : 'Salida manual'), monto: montoDisplay, fuente: m.fuente, _idx: _idx++, _movId: m.id, _fuenteOrigen: m.fuente, _fuenteDestino: m._fuenteDestino || '', _origen, _otrasCuentas, _secundario: m._secundario || false, _origenSeccion: m._origenSeccion || '' });
    }
  });
  // Movimientos secundarios guardados en cajita.historial (tipo 'nu' o cajita específica)
  if (tipo === 'nu') {
    (S.cajitas || []).forEach(c => {
      (c.historial || []).forEach(h => {
        if (!h._secundario) return; // solo secundarios — los manuales ya van por otro path
        const esEntradaH = h.tipo === 'entrada';
        const montoH = esEntradaH ? +h.monto : -h.monto;
        const tipoH = esEntradaH ? 'ingreso' : 'salida_manual';
        const cajitaFuente = 'cajita:' + c.id;
        movs.push({ tipo: tipoH, fecha: h.fecha, desc: h.nota || h.desc || (esEntradaH ? 'Entrada' : 'Salida'), monto: montoH, fuente: cajitaFuente, _idx: _idx++, _movId: h.id, _fuenteOrigen: cajitaFuente, _fuenteDestino: '', _origen: h._origenSeccion || 'Automático', _otrasCuentas: null, _secundario: true, _origenSeccion: h._origenSeccion || '' });
      });
    });
  }
  // Gastos variables que usaron esta fuente
  (S.gastosVar || []).forEach(g => {
    if (g._esAlcancia) return; // oculto mientras la alcancía está activa
    const match = tipo === 'nu'
      ? (g.fuente && g.fuente.startsWith('cajita:'))
      : g.fuente === tipo;
    if (match) {
      const _origen = g._secundario && g._origenSeccion ? g._origenSeccion : g.esPagoGastoFijo ? 'Gastos fijos' : g._esPagoTC ? 'Tarjeta de crédito' : g._esExtraPrestamo ? 'Préstamos' : /encargo/i.test(g.nota||'') ? 'Encargos' : 'Gastos';
      movs.push({ tipo: 'gasto', fecha: g.fecha, desc: g.desc, monto: -g.monto, cat: g.cat, fuente: g.fuente, nota: g.nota, _idx: _idx++, _movId: g.id, _fuenteOrigen: g.fuente, _origen, _otrasCuentas: null, _secundario: !!g._secundario, _origenSeccion: g._origenSeccion || '' });
    }
  });
  // Préstamos dados desde esta fuente
  (S.deudores || []).forEach(d => {
    (d.movimientos || []).forEach(m => {
      const matchFuente = tipo === 'nu'
        ? (m.fuente && m.fuente.startsWith('cajita:'))
        : m.fuente === tipo;
      if (m.tipo === 'prestamo' && (matchFuente || (m.fuentes && m.fuentes.length))) {
        const _origenP = 'Préstamos · ' + d.nombre;
        if (matchFuente) {
          const otrasFuentesSplit = (m.fuentes||[]).filter(f=>f.fuente!==m.fuente).map(f=>({fuente:f.fuente, monto:-f.monto}));
          movs.push({ tipo: 'prestamo', fecha: m.fecha, desc: 'Préstamo a ' + d.nombre, monto: -m.monto, nota: m.nota, fuente: m.fuente, _idx: _idx++, _movId: m.id, _fuenteOrigen: m.fuente, _origen: _origenP, _otrasCuentas: otrasFuentesSplit.length ? otrasFuentesSplit : null });
        }
        // Préstamo con fuentes split
        if (m.fuentes) {
          m.fuentes.forEach(f => {
            const mfSplit = tipo === 'nu' ? (f.fuente && f.fuente.startsWith('cajita:')) : f.fuente === tipo;
            if (mfSplit && f.monto) {
              const otras = (m.fuentes||[]).filter(f2=>f2.fuente!==f.fuente).map(f2=>({fuente:f2.fuente, monto:-f2.monto}));
              if (m.fuente) otras.push({fuente:m.fuente, monto:-m.monto});
              movs.push({ tipo: 'prestamo', fecha: m.fecha, desc: 'Préstamo a ' + d.nombre, monto: -f.monto, nota: m.nota, fuente: f.fuente, _idx: _idx++, _movId: m.id, _fuenteOrigen: f.fuente, _origen: _origenP, _otrasCuentas: otras.length ? otras : null });
            }
          });
        }
      }
    });
  });
  // Mesadas recibidas en esta cuenta
  // FIX: getMesadaData (mesada.js) es lazy — sin este guard, abrir el
  // detalle de Nequi/Nu/Efectivo sin haber visitado Mesada antes tiraba
  // ReferenceError acá y cortaba renderDetalleCuenta() a la mitad.
  if(typeof getMesadaData==='function') ['papa', 'mama'].forEach(parent => {
    const data = getMesadaData(parent);
    Object.entries(data).forEach(([k, info]) => {
      const [anio, mesIdx] = k.split('-');
      const fechaBase = info.fecha || anio + '-' + String(parseInt(mesIdx) + 1).padStart(2, '0') + '-01';
      const descBase = 'Mesada de ' + (parent === 'papa' ? 'Pap\u00e1' : 'Mam\u00e1');
      if (info.splits && info.splits.length) {
        // Mesada dividida: registrar cada split en su cuenta correspondiente
        info.splits.forEach(s => {
          const matchSplit = tipo === 'nu'
            ? (s.fuente && s.fuente.startsWith('cajita:'))
            : s.fuente === tipo;
          if (matchSplit && s.monto) {
            const otras = (info.splits||[]).filter(s2=>s2.fuente!==s.fuente).map(s2=>({fuente:s2.fuente, monto:+s2.monto}));
            movs.push({ tipo: 'mesada', fecha: fechaBase, desc: descBase, monto: +s.monto, nota: info.nota, fuente: s.fuente, _idx: _idx++, _origen: 'Mesadas', _otrasCuentas: otras.length ? otras : null });
          }
        });
      } else {
        const matchDest = tipo === 'nu'
          ? (info.destino && info.destino.startsWith('cajita:'))
          : info.destino === tipo;
        if (matchDest && info.monto) {
          movs.push({ tipo: 'mesada', fecha: fechaBase, desc: descBase, monto: +info.monto, nota: info.nota, fuente: info.destino, _idx: _idx++, _origen: 'Mesadas', _otrasCuentas: null });
        }
      }
    });
  });
  // Spotify cobros a personas (no pagos, que ya están en gastosVar como gasto variable)
  (S.spotifyHistorial || []).forEach(h => {
    if (h.tipo === 'pago') return;
    const matchFuente = tipo === 'nu'
      ? (h.fuente && h.fuente.startsWith('cajita:'))
      : h.fuente === tipo;
    if (matchFuente) {
      // Usar h.id si existe, o fabricar un _movId estable a partir del índice para que el sort
      // funcione igual que los demás movimientos (por timestamp de registro, no por orden de iteración)
      movs.push({ tipo: 'ingreso', fecha: h.fecha, desc: 'Cobro Spotify (' + h.nombre + ')', monto: +h.monto, fuente: h.fuente, _idx: _idx++, _movId: h.id || null, _origen: 'Spotify', _otrasCuentas: null, _secundario: true, _origenSeccion: 'Spotify' });
    }
  });
  // Transferencias entre cuentas
  (S.transferencias || []).forEach(t => {
    const estaEnOrigen = tipo === 'nu'
      ? (t.origen && t.origen.startsWith('cajita:'))
      : t.origen === tipo;
    const estaEnDestino = tipo === 'nu'
      ? (t.destino && t.destino.startsWith('cajita:'))
      : t.destino === tipo;
    if (estaEnOrigen) {
      movs.push({ tipo: 'transferencia', fecha: t.fecha, desc: 'Transferencia → ' + fuenteLabel(t.destino), monto: -t.monto, nota: t.nota, fuente: t.origen, _idx: _idx++, _movId: t.id, _fuenteOrigen: t.origen, _fuenteDestino: t.destino, _origen: 'Cuentas · Transferencia', _otrasCuentas: [{fuente:t.destino, monto:+t.monto}] });
    }
    if (estaEnDestino) {
      movs.push({ tipo: 'transferencia', fecha: t.fecha, desc: 'Transferencia ← ' + fuenteLabel(t.origen), monto: +t.monto, nota: t.nota, fuente: t.destino, _idx: _idx++, _movId: t.id, _fuenteOrigen: t.origen, _fuenteDestino: t.destino, _origen: 'Cuentas · Transferencia', _otrasCuentas: [{fuente:t.origen, monto:-t.monto}] });
    }
  });
  // Sort by date desc, then by creation time desc (_movId starts with Date.now().toString(36))
  movs.sort((a, b) => {
    const dateCmp = (b.fecha || '').localeCompare(a.fecha || '');
    if (dateCmp !== 0) return dateCmp;
    // Use _movId as tiebreaker: uid() = Date.now().toString(36) + random,
    // so lexicographic comparison of the base-36 timestamp gives insertion order
    const aId = a._movId || '';
    const bId = b._movId || '';
    if (aId && bId) return bId.localeCompare(aId);
    // Si solo uno tiene _movId, ese va primero (tiene timestamp confiable)
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
  ].filter(t => t.val === 'todos' || tiposPresentes.has(t.val));

  wrap.innerHTML = `
    <div class="movs-search-wrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="movs-search-input" placeholder="Buscar movimiento..." value="${f.q}">
    </div>
    <div class="movs-tipo-chips">
      ${tiposConfig.map(t => `<div class="movs-chip${f.tipo===t.val?' active':''}" ${Events.attr('cuentas:movsOnTipo', t.val, cuentaKey)}>${t.label}</div>`).join('')}
    </div>
    <div class="movs-fecha-row">
      <span class="movs-fecha-label">Desde</span>
      <input type="date" class="movs-fecha-desde" value="${f.desde}">
      <span class="movs-fecha-label">Hasta</span>
      <input type="date" class="movs-fecha-hasta" value="${f.hasta}">
      ${(f.desde||f.hasta)?`<button ${Events.attr('cuentas:movsLimpiarFechas', cuentaKey)} style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:11px;font-family:'DM Mono',monospace;white-space:nowrap;padding:0 2px;">× fechas</button>`:''}
    </div>
  `;
  // Reemplaza los oninput/onchange inline (CSP los bloquea). Delegado,
  // enganchado una sola vez por wrap — cada cuentaKey tiene su propio wrap
  // fijo (filtrosElId = 'movs-filtros-'+cuentaKey), así que cerrar sobre
  // cuentaKey acá es seguro: nunca cambia para este wrap en particular,
  // a diferencia de `items` en el bug de renderAttencion() (Inicio).
  if(!wrap._movsFiltrosHooked){
    wrap._movsFiltrosHooked = true;
    wrap.addEventListener('input', (e)=>{
      if(e.target.classList.contains('movs-search-input')) _movsOnSearch(e.target, cuentaKey);
    });
    wrap.addEventListener('change', (e)=>{
      if(e.target.classList.contains('movs-fecha-desde')) _movsOnFecha('desde', e.target.value, cuentaKey);
      else if(e.target.classList.contains('movs-fecha-hasta')) _movsOnFecha('hasta', e.target.value, cuentaKey);
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
  if (cuentaKey === 'custom') {
    const c = (S.cuentasPersonalizadas||[]).find(x=>x.id===_customCuentaActualId);
    if (c) renderMovsCustom(c);
    return;
  }
  renderDetalleCuenta(cuentaKey);
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

function renderMovsCuenta(elId, movs, accentColor, cuentaKey) {
  const el = document.getElementById(elId);
  if (!el) return;

  // Render filtros (siempre, aunque no haya movs)
  const filtrosElId = 'movs-filtros-' + (cuentaKey || '');
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

  el.innerHTML = filtrados.map(m => {
    const esSalida = m.tipo === 'salida_manual' || m.tipo === 'gasto' || m.tipo === 'egreso';
    const esApertura = m.tipo === 'apertura';
    const esPositivo = esApertura ? true : esSalida ? false : m.monto > 0;
    const colorMonto = esApertura ? 'var(--blue)' : esPositivo ? 'var(--accent)' : 'var(--red)';
    const signo = esApertura ? '' : esPositivo ? '+' : '−';
    const tipoLabel = { gasto: 'Gasto', ingreso: 'Ingreso', egreso: 'Retiro', apertura: 'Apertura', prestamo: 'Préstamo', abono: 'Abono', mesada: 'Mesada', transferencia: 'Transferencia', salida_manual: 'Salida' }[m.tipo] || m.tipo;
    const bgLabel = esApertura ? 'bg-blue' : esPositivo ? 'bg-green' : m.tipo === 'gasto' || m.tipo === 'salida_manual' || m.tipo === 'egreso' ? 'bg-red' : m.tipo === 'transferencia' ? 'bg-blue' : 'bg-amber';
    const dataId = m._movId ? `data-mov-id="${m._movId}"` : '';
    const dataTipo = `data-mov-tipo="${m.tipo}"`;
    const dataFuente = m._fuenteOrigen ? `data-mov-fuente="${m._fuenteOrigen}"` : '';
    const dataDestino = m._fuenteDestino ? `data-mov-destino="${m._fuenteDestino}"` : '';
    const dataMonto = `data-mov-monto="${Math.abs(m.monto)}"`;
    const dataFuenteReal = m.fuente ? `data-mov-fuente-real="${escHtml(m.fuente)}"` : '';
    const dataFecha = `data-mov-fecha="${escHtml(m.fecha)}"`;
    const dataOrigen = m._origen ? `data-mov-origen="${escHtml(m._origen)}"` : '';
    const dataOtras = m._otrasCuentas ? `data-mov-otras="${escHtml(JSON.stringify(m._otrasCuentas))}"` : '';
    const esSecundarioHist = !!m._secundario;
    const puedeEliminar = !!m._movId && !esSecundarioHist;
    const puedeVerDetalle = !!m.fuente;
    return `<div class="gasto-item" ${dataId} ${dataTipo} ${dataFuente} ${dataDestino} ${dataMonto} ${dataFuenteReal} ${dataFecha} ${dataOrigen} ${dataOtras} ${puedeVerDetalle ? 'data-cuenta-key="'+cuentaKey+'" style="cursor:pointer;" data-action="core:abrirDetalleMov"' : ''}>
      <div class="gasto-item-top">
        <div style="flex:1;min-width:0;">
          <div class="row-name" style="font-size:13px;display:flex;align-items:center;gap:6px;">${escHtml(m.desc)}${esSecundarioHist ? `<span style="display:inline-flex;align-items:center;gap:2px;font-size:9px;color:var(--text3);background:var(--bg2);border-radius:4px;padding:1px 5px;white-space:nowrap;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Automático</span>` : ''}</div>
          <div class="row-sub" style="font-family:'DM Mono',monospace;">${escHtml(m.fecha) || '—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-size:14px;font-weight:500;font-family:'DM Mono',monospace;color:${colorMonto};">${signo} ${fmt(Math.abs(m.monto))}</div>
          ${puedeEliminar ? `<button type="button" class="btn-icon" data-action="core:eliminarMovimiento" data-stop-propagation="true" title="Eliminar movimiento" style="color:var(--text3);min-width:32px;min-height:32px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>` : esSecundarioHist && m._movId ? `<span title="Generado automáticamente — elimínalo desde ${escHtml(m._origenSeccion||'la sección de origen')}" style="display:flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;color:var(--text3);opacity:.4;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>` : ''}
        </div>
      </div>
      <div class="gasto-item-meta">
        <span class="badge ${bgLabel}" style="font-size:9px;">${escHtml(tipoLabel)}</span>
        ${m._origen === 'Alcancía oculta' ? `<span class="badge" style="font-size:9px;background:rgba(240,184,64,.18);color:var(--amber);border:none;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Alcancía</span>` : ''}
        ${(()=>{ const cn=getCajitaNombre(m.fuente); return cn?`<span class="badge bg-nu" style="font-size:9px;">${escHtml(cn)}</span>`:''; })()}
        ${m.cat ? `<span class="badge bg-blue" style="font-size:9px;">${escHtml(m.cat)}</span>` : ''}
        ${m.nota ? `<span style="font-size:10px;color:var(--text3);">${escHtml(m.nota)}</span>` : ''}
        ${m.tipo === 'transferencia' && m._fuenteDestino ? `<span style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="width:11px;height:11px;fill:currentColor;vertical-align:middle;"><path fill-rule="evenodd" d="M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5zm14-7a.5.5 0 0 1-.5.5H2.707l3.147 3.146a.5.5 0 1 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 4H14.5a.5.5 0 0 1 .5.5z"/></svg> ${escHtml(fuenteLabel(m._fuenteDestino||m._fuenteOrigen))}</span>` : ''}
      </div>
    </div>`;
  }).join('');
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
  sumarFuente(fuente,monto);
  if(!S.movimientos)S.movimientos=[];
  let mov;
  if(esApertura){
    mov=crearMovimientoApertura(monto,fecha,desc);
    mov.fuente=fuente;
  } else {
    mov={id:uid(),tipo:'entrada',fuente,monto,fecha,desc:desc||''};
  }
  if(nota)mov.nota=nota;
  S.movimientos.push(mov);
  return mov.desc;
}

function registrarSalida(fuente,monto,fecha,desc,nota){
  // Simétrico a registrarEntradaConApertura: descuenta de la fuente y registra
  // el movimiento de salida manual. Cualquier sheet que reste dinero de una
  // fuente (cuenta, cajita, etc.) debe usar esto en vez de reimplementar
  // descontarFuente + push manual a S.movimientos.
  // `nota` es opcional — ver nota en registrarEntradaConApertura de arriba.
  descontarFuente(fuente,monto);
  if(!S.movimientos)S.movimientos=[];
  const mov={id:uid(),tipo:'salida_manual',fuente,monto,fecha,desc:desc||''};
  if(nota)mov.nota=nota;
  S.movimientos.push(mov);
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
  if(!v||!adFuente)return;
  // Materializar intereses antes de agregar dinero a la cajita
  if(adFuente.startsWith('cajita:')){
    const id=adFuente.split(':')[1];
    const c=(S.cajitas||[]).find(x=>x.id===id);
    if(c)materializarIntereses(c);
  }
  const descFinal=registrarEntradaConApertura(adFuente,v,fecha,desc,esApertura,nota);
  save();
  closeSheet('agregar-dinero');
  refresh();
  if(window.logCambio){const _fLabel=fuenteLabel(adFuente);const _accion=esApertura?'Saldo inicial en '+_fLabel:'Sumaste dinero en '+_fLabel;const _cjId=adFuente&&adFuente.startsWith('cajita:')?adFuente.split(':')[1]:null;logCambio(_accion,descFinal||'',v,'ingreso',_cjId);}
  adFuente='';
toast(fmt(v) + (esApertura?' registrado como saldo inicial':' sumado — ' + escHtml(descFinal)), 'ok');
}

function openSheet_adMenu(){
  poblarFuente('adMenuDest');
  // Replace options with all accounts including all cajitas
  const sel=document.getElementById('adMenuDest');
  const fuentes=getFuentes();
  sel.innerHTML=fuentes.map(f=>`<option value="${f.val}">${f.label}</option>`).join('');
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
  sumarFuente(fuente,v);
  // Registrar movimiento de entrada
  if(!S.movimientos)S.movimientos=[];
  const _movAdMenu={id:uid(),tipo:'entrada',fuente,monto:v,fecha,desc};
  if(nota)_movAdMenu.nota=nota;
  S.movimientos.push(_movAdMenu);
  save();
  closeSheet('agregar-dinero-menu');
  refresh();
  if(window.logCambio){const _fLabel=fuenteLabel(fuente);const _cjId2=fuente&&fuente.startsWith('cajita:')?fuente.split(':')[1]:null;logCambio('Sumaste dinero en '+_fLabel,desc,v,'ingreso',_cjId2);}
  toast(fmt(v) + ' sumado — ' + escHtml(desc), 'ok');
}


/* ---- SALDO INICIAL / APERTURA ---- */
let _eaFuente=''; // 'nequi' | 'efectivo'

function getAperturaMov(fuente){
  // Busca el movimiento de apertura de S.movimientos para nequi/efectivo
  return (S.movimientos||[]).find(m=>m.fuente===fuente&&m.tipo==='apertura');
}

function renderBannerApertura(fuente){
  const elId='banner-apertura-'+fuente;
  const el=document.getElementById(elId);
  if(!el)return;
  const mov=getAperturaMov(fuente);
  const colorMap={nequi:'#ff4da6',efectivo:'var(--amber)'};
  const color=colorMap[fuente]||'var(--blue)';
  if(mov){
    // Ya tiene saldo inicial — mostrar chip con valor y botón editar discreto
    el.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(96,176,240,.06);border:1px solid rgba(96,176,240,.18);border-radius:9px;padding:9px 13px;margin-bottom:12px;">
      <div>
        <div style="font-size:9px;color:var(--blue);text-transform:uppercase;letter-spacing:.8px;font-family:'DM Mono',monospace;margin-bottom:2px;">Saldo inicial registrado</div>
        <div style="font-size:15px;font-weight:500;font-family:'DM Mono',monospace;color:var(--blue);">${fmt(mov.monto)}</div>
      </div>
      <button type="button" ${Events.attr('cuentas:abrirEditarApertura', fuente)} style="background:none;border:1px solid rgba(96,176,240,.3);border-radius:7px;color:var(--blue);font-size:11px;font-weight:600;padding:5px 11px;cursor:pointer;font-family:'DM Sans',sans-serif;">Corregir</button>
    </div>`;
  } else {
    // No tiene saldo inicial — mostrar botón para registrarlo
    el.innerHTML=`<div style="margin-bottom:12px;">
      <button type="button" ${Events.attr('cuentas:abrirRegistrarApertura', fuente)} style="width:100%;padding:11px;background:rgba(96,176,240,.07);border:1.5px dashed rgba(96,176,240,.35);border-radius:9px;color:var(--blue);font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:7px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Registrar saldo inicial
      </button>
      <div style="font-size:11px;color:var(--text3);text-align:center;margin-top:5px;">Plata que ya tenías antes de usar la app</div>
    </div>`;
  }
}

function abrirRegistrarApertura(fuente){
  // Abre el sheet normal de agregar dinero con el toggle de apertura ya marcado
  const nombreMap={nequi:'Nequi',efectivo:'Efectivo'};
  abrirAgregarDinero(fuente, nombreMap[fuente]);
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
  const nombreMap={nequi:'Nequi',efectivo:'Efectivo'};
  document.getElementById('eaTitle').textContent='Corregir saldo inicial · '+nombreMap[fuente];
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
  if(diff>0) sumarFuente(_eaFuente,diff);
  else descontarFuente(_eaFuente,Math.abs(diff));
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

/* ---- ENTRÓ / SALIÓ PLATA EN NU ---- */
let _nuMovTipo = 'entrada'; // 'entrada' | 'salida'
let _nuMovCajitaSel = null; // fuente seleccionada: 'cajita:id'

function abrirNuMovimiento(tipo) {
  save();
  _nuMovTipo = tipo;
  _nuMovCajitaSel = null;
  const esEntrada = tipo === 'entrada';

  document.getElementById('nuMovTitle').textContent = esEntrada ? 'Entró plata a Nu' : 'Salió plata de Nu';
  document.getElementById('nuMovSubtitle').innerHTML = esEntrada
    ? 'El valor se <b style="color:var(--nu-light);">sumará</b> a la cajita que elijas y contará como ingreso del mes.'
    : 'El valor se <b style="color:var(--red);">restará</b> de la cajita que elijas.';
  document.getElementById('nuMovDescLabel').innerHTML = esEntrada
    ? '¿De dónde viene esta plata? <span style="color:var(--red);">*</span>'
    : '¿En qué se gastó o a dónde fue? <span style="color:var(--red);">*</span>';
  document.getElementById('nuMovMontoLabel').textContent = esEntrada ? '¿Cuánto recibiste?' : '¿Cuánto vas a restar?';
  const btnConf = document.getElementById('btn-confirmar-nu-mov');
  if (btnConf) {
    btnConf.textContent = esEntrada ? 'Registrar ingreso' : 'Registrar salida';
    btnConf.style.background = esEntrada ? 'rgba(192,96,240,.85)' : 'var(--red)';
    btnConf.style.boxShadow = esEntrada ? '0 2px 14px rgba(192,96,240,.3)' : '0 2px 14px rgba(240,104,104,.3)';
  }

  // Ocultar toggle apertura en salida, y también si la config lo desactiva
  const aperturaWrap = document.getElementById('nuMovAperturaWrap');
  const _mostrarApertura = esEntrada && (S.modulos?.corregirSaldo !== false);
  if (aperturaWrap) aperturaWrap.style.display = _mostrarApertura ? 'flex' : 'none';
  const chk = document.getElementById('nuMovEsApertura');
  if (chk) chk.checked = false;

  // Resetear campos
  document.getElementById('nuMovDesc').value = '';
  document.getElementById('nuMovMonto').value = '';
  document.getElementById('nuMovFecha').value = hoy();
  const nuMovNotaEl = document.getElementById('nuMovNota');
  if (nuMovNotaEl) nuMovNotaEl.value = '';
  document.getElementById('nuMovPreview').textContent = '';

  // Renderizar selector de cajitas
  _nuMovRenderCajitas();

  openSheet('nu-movimiento');
  setTimeout(() => document.getElementById('nuMovDesc').focus(), 200);
}

function _nuMovRenderCajitas() {
  const wrap = document.getElementById('nuMovCajitasWrap');
  if (!wrap) return;
  const cajitas = S.cajitas || [];
  if (!cajitas.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0;">No tenés cajitas. Creá una primero desde la pantalla de Nu.</div>';
    return;
  }
  wrap.innerHTML = cajitas.map(c => {
    const saldo = typeof calcC === 'function' ? calcC(c).val : (c.saldo || 0);
    return `<div data-nu-cajita="cajita:${c.id}"
      style="display:flex;align-items:center;justify-content:space-between;padding:11px 13px;border-radius:10px;border:1.5px solid var(--border2);background:var(--bg3);cursor:pointer;transition:all .15s;">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">${escHtml(c.nombre||'Cajita')}</div>
        <div style="font-size:11px;font-family:'DM Mono',monospace;color:var(--nu-light);margin-top:2px;">${fmt(saldo)}</div>
      </div>
      <div id="_nuMovCheck_${c.id}" style="width:20px;height:20px;border-radius:50%;border:2px solid var(--border2);flex-shrink:0;display:flex;align-items:center;justify-content:center;"></div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('[data-nu-cajita]').forEach(el => {
    el.addEventListener('click', function() {
      _nuMovCajitaSel = this.dataset.nuCajita;
      // Resaltar selección
      wrap.querySelectorAll('[data-nu-cajita]').forEach(e => {
        e.style.borderColor = 'var(--border2)';
        e.style.background = 'var(--bg3)';
        const cid = e.dataset.nuCajita.split(':')[1];
        const chkEl = document.getElementById('_nuMovCheck_'+cid);
        if (chkEl) chkEl.innerHTML = '';
      });
      this.style.borderColor = 'var(--nu-light)';
      this.style.background = 'rgba(192,96,240,.08)';
      const selId = _nuMovCajitaSel.split(':')[1];
      const chkEl = document.getElementById('_nuMovCheck_'+selId);
      if (chkEl) chkEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--nu-light)" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
      _nuMovActualizarPreview();
    });
  });

  // Auto-seleccionar si solo hay una cajita
  if (cajitas.length === 1) {
    const único = wrap.querySelector('[data-nu-cajita]');
    if (único) único.click();
  }
}

function _nuMovToggleApertura() {
  _aperturaToggleUI({chk:'nuMovEsApertura',lbl:'nuMovDescLabel',inp:'nuMovDesc',descPlaceholder:'Ej: Salario, mesada, bono...'});
}

function _nuMovActualizarPreview() {
  const prev = document.getElementById('nuMovPreview');
  if (!prev || !_nuMovCajitaSel) return;
  const v = parseMoney(document.getElementById('nuMovMonto').value) || 0;
  if (!v) { prev.textContent = ''; return; }
  const cid = _nuMovCajitaSel.split(':')[1];
  const caj = (S.cajitas || []).find(x => x.id === cid);
  if (!caj) return;
  const saldoActual = typeof calcC === 'function' ? calcC(caj).val : (caj.saldo || 0);
  if (_nuMovTipo === 'entrada') {
    prev.textContent = fmt(saldoActual) + ' + ' + fmt(v) + ' = ' + fmt(saldoActual + v);
    prev.style.color = 'var(--accent)';
  } else {
    const resultado = saldoActual - v;
    prev.textContent = fmt(saldoActual) + ' − ' + fmt(v) + ' = ' + fmt(resultado);
    prev.style.color = resultado < 0 ? 'var(--red)' : 'var(--accent)';
  }
}

function confirmarNuMovimiento() {
  const v = parseMoney(document.getElementById('nuMovMonto').value) || 0;
  const desc = document.getElementById('nuMovDesc').value.trim();
  const fecha = document.getElementById('nuMovFecha').value || hoy();
  const nota = document.getElementById('nuMovNota')?.value.trim() || '';
  const esApertura = _nuMovTipo === 'entrada' && (document.getElementById('nuMovEsApertura')?.checked || false);

  if (!_nuMovCajitaSel) { toast('Seleccioná una cajita', 'err'); return; }
  if (!v) { toast('Ingresá el monto', 'err'); return; }
  if (!esApertura && !desc) {
    toast(_nuMovTipo === 'entrada' ? 'Describí de dónde viene la plata' : 'Describí en qué se gastó', 'err');
    return;
  }

  const cid = _nuMovCajitaSel.split(':')[1];
  const caj = (S.cajitas || []).find(x => x.id === cid);
  if (!caj) { toast('Cajita no encontrada', 'err'); return; }

  // Materializar intereses antes de tocar el saldo
  if (typeof materializarIntereses === 'function') materializarIntereses(caj);

  if (_nuMovTipo === 'entrada') {
    const descFinal = registrarEntradaConApertura(_nuMovCajitaSel, v, fecha, desc, esApertura, nota);
    if (window.logCambio) logCambio('Entró plata a ' + (caj.nombre || 'cajita'), descFinal, v, 'ingreso', cid);
    toast(fmt(v) + (esApertura ? ' registrado como saldo inicial en ' : ' sumado a ') + escHtml(caj.nombre || 'cajita'), 'ok');
  } else {
    registrarSalida(_nuMovCajitaSel, v, fecha, desc, nota);
    if (window.logCambio) logCambio('Salió plata de ' + (caj.nombre || 'cajita'), desc, v, 'gasto', cid);
    toast('− ' + fmt(v) + ' de ' + escHtml(caj.nombre || 'cajita') + ' — ' + escHtml(desc), 'info');
  }

  save();
  closeSheet('nu-movimiento');
  refresh();
  _nuMovCajitaSel = null;
}

function abrirRestarDinero(fuente,nombre){
  save();
  rdFuente=fuente;
  const label=nombre||(fuente==='nequi'?'Nequi':fuente==='efectivo'?'Efectivo':'Cuenta');
  document.getElementById('rdTitle').textContent='Restar de '+label;
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
  if(!v||!rdFuente)return;
  registrarSalida(rdFuente,v,fecha,desc,nota);
  save();refresh();
  closeSheet('restar-dinero');
  if(window.logCambio){const _fLabel=fuenteLabel(rdFuente);const _cjId3=rdFuente&&rdFuente.startsWith('cajita:')?rdFuente.split(':')[1]:null;logCambio('Retiraste dinero de '+_fLabel,desc,v,'gasto',_cjId3);}
  rdFuente='';
  toast('− '+fmt(v)+' restado — '+escHtml(desc),'info');
}

/* ---- TRANSFERIR ENTRE CUENTAS ---- */
function abrirTransferir(origenSugerido) {
  // Populate both selects
  const fuentes = getFuentes();
  const optsHtml = fuentes.map(f => `<option value="${f.val}">${f.label}</option>`).join('');
  document.getElementById('tr_origen').innerHTML = optsHtml;
  document.getElementById('tr_destino').innerHTML = optsHtml;
  // Pre-select suggested origin if provided
  if (origenSugerido) {
    document.getElementById('tr_origen').value = origenSugerido;
  }
  // Select a different default destino
  const primerDestino = fuentes.find(f => f.val !== document.getElementById('tr_origen').value);
  if (primerDestino) document.getElementById('tr_destino').value = primerDestino.val;
  document.getElementById('tr_monto').value = '';
  document.getElementById('tr_nota').value = '';
  const trFechaEl = document.getElementById('tr_fecha');
  if (trFechaEl) trFechaEl.value = hoy();
  document.getElementById('tr_preview').textContent = '';
  actualizarTransfPreview();
  openSheet('transferir');
  setTimeout(() => document.getElementById('tr_monto').focus(), 200);
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
  if (!origen || !destino || origen === destino) {
    prev.textContent = origen === destino ? 'El origen y destino deben ser diferentes' : '';
    prev.style.color = 'var(--amber)';
    return;
  }
  if (monto <= 0) { prev.textContent = ''; return; }
  const nuevoOrigen = saldoOrigen - monto;
  const nuevoDestino = saldoDestino + monto;
  const colorOrigen = nuevoOrigen < 0 ? 'var(--red)' : 'var(--accent)';
  prev.innerHTML =
    `<span style="color:var(--red);">${escHtml(fuenteLabel(origen))}: ${fmt(saldoOrigen)} <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> ${fmt(nuevoOrigen)}</span><br>` +
    `<span style="color:var(--accent);">${escHtml(fuenteLabel(destino))}: ${fmt(saldoDestino)} <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> ${fmt(nuevoDestino)}</span>`;
  if (nuevoOrigen < 0) {
    prev.innerHTML += `<br><span style="color:var(--red);font-size:10px;">Saldo insuficiente en ${escHtml(fuenteLabel(origen))}</span>`;
  }
}

function confirmarTransferir() {
  const origen = document.getElementById('tr_origen').value;
  const destino = document.getElementById('tr_destino').value;
  const monto = parseMoney(document.getElementById('tr_monto').value) || 0;
  const nota = document.getElementById('tr_nota').value.trim();
  const fecha = document.getElementById('tr_fecha')?.value || hoy();

  if (!origen || !destino) { toast('Elige origen y destino', 'err'); return; }
  if (origen === destino) { toast('El origen y destino deben ser diferentes', 'err'); return; }
  if (!monto) { toast('Ingresa un monto válido', 'err'); return; }
  const saldoOrigen = getSaldoActual(origen);
  if (monto > saldoOrigen) {
    toast(`Saldo insuficiente en ${escHtml(fuenteLabel(origen))} (${fmt(saldoOrigen)})`, 'err');
    return;
  }

  // Perform transfer
  descontarFuente(origen, monto);
  sumarFuente(destino, monto);

  // Save transfer record
  if (!S.transferencias) S.transferencias = [];
  S.transferencias.push({
    id: uid(),
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


// Preview en vivo del sheet "crear CDT" (monto/tasa/fecha → valor neto
// estimado). Se encontró compartiendo <script> con Tarjetas de Crédito en
// index.html — mismo problema de "código no relacionado en el mismo bloque"
// que ya describía la auditoría para TC. Es de Cuentas, así que se mueve acá.
// CDT preview
document.addEventListener('input',function(e){
  if(!['cdt_monto','cdt_tasa','cdt_vence','cdt_rte'].includes(e.target.id))return;
  const monto=parseMoney(document.getElementById('cdt_monto').value)||0;
  const tasa=parsePct(document.getElementById('cdt_tasa').value)||9.25;
  const rte=(parsePct(document.getElementById('cdt_rte').value)||4)/100;
  const vence=document.getElementById('cdt_vence').value;
  const prev=document.getElementById('cdt_preview');
  if(!prev)return;
  if(monto>=50000&&vence){
    const dias=Math.max(0,Math.ceil((new Date(vence+'T00:00:00')-new Date())/86400000));
    const tasaDiaria=Math.pow(1+tasa/100,1/365)-1;
    const tasaDiariaNet=tasaDiaria*(1-rte);
    const valorFinal=monto*Math.pow(1+tasaDiariaNet,dias);
    const valorBruto=monto*Math.pow(1+tasaDiaria,dias);
    const ganado=valorFinal-monto;
    const retencionTotal=valorBruto-valorFinal;
    prev.textContent=`En ${dias}d recibirás ~${fmt(valorFinal)} neto (+${fmt(ganado)} · RTE ${(rte*100).toFixed(0)}%: -${fmt(retencionTotal)})`;
    prev.style.color='var(--accent)';
  } else if(monto>0&&monto<50000){
    prev.textContent='Mínimo $50.000 para el CDT';
    prev.style.color='var(--red)';
  } else {
    prev.textContent='';
  }
});

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
  confirmarMovCustom,
  // Cajitas / metas / CDTs
  abrirMetaCajita,
  metaAporteEliminar: _metaAporteEliminar,
  toggleMetaMinWrap,
  abrirDetalleCajita,
  quitarMetaCajita,
  editarCDT,
  abrirCobrarCDT,
  liberarCDTManual,
  abrirCrearCDT,
  cancelarCobrarCDT: _cancelarCobrarCDT,
  volverANu,
  volverADetalleCajita,
  cajitaDetDelete: _cajitaDetDelete,
  abrirSubMeta,
  abrirSubCDTs,
  // Motor de filtros de movimientos
  movsOnTipo: _movsOnTipo,
  movsLimpiarFechas: _movsLimpiarFechas,
  // Saldo inicial / apertura
  abrirEditarApertura,
  abrirRegistrarApertura,
  // Nu — chequeo de saldo real
  guardarChequeoNu,
  // Transferir y abrir sheets estáticos (usado en el HTML de screen-cuentas)
  abrirTransferir,
  openSheet, // reutiliza el openSheet() del núcleo — solo se registra el nombre bajo 'cuentas' porque el onclick que lo usaba vivía en el HTML de esta sección (botón "Chequear saldo real")
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

// --- CDT ---
const btnCDTConf = document.getElementById('btn-confirmar-crear-cdt');
if (btnCDTConf) btnCDTConf.addEventListener('click', confirmarCrearCDT);
const btnCobrarConf = document.getElementById('btn-confirmar-cobrar-cdt');
if (btnCobrarConf) btnCobrarConf.addEventListener('click', confirmarCobrarCDT);

// --- Meta de ahorro en cajita ---
const btnGuardarMeta = document.getElementById('btn-guardar-meta');
if (btnGuardarMeta) btnGuardarMeta.addEventListener('click', guardarMetaCajita);
const btnQuitarMeta = document.getElementById('btn-quitar-meta');
if (btnQuitarMeta) btnQuitarMeta.addEventListener('click', quitarMetaCajita);
const btnAddMetaAporte = document.getElementById('btn-add-meta-aporte');
if (btnAddMetaAporte) btnAddMetaAporte.addEventListener('click', () => { _metaAportesTemp.push({desc:'',monto:0}); _renderMetaAportes(); });
// Preview en vivo al cambiar monto objetivo / fechas en el sheet de meta
['meta_objetivo','meta_inicio','meta_fin'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', _updateMetaCuotaPreview);
});

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
document.querySelectorAll('[data-cuenta]').forEach(card => {
  card.addEventListener('click', () => abrirCuenta(card.dataset.cuenta));
});
document.querySelectorAll('.btn-volver-selector').forEach(btn => {
  btn.addEventListener('click', volverSelector);
});

// --- Nequi / Efectivo: agregar y restar dinero ---
const btnAgrNequiDet = document.getElementById('btn-agregar-nequi-det');
if (btnAgrNequiDet) btnAgrNequiDet.addEventListener('click', () => abrirAgregarDinero('nequi'));
const btnRestNequiDet = document.getElementById('btn-restar-nequi-det');
if (btnRestNequiDet) btnRestNequiDet.addEventListener('click', () => abrirRestarDinero('nequi'));
const btnAgrEfDet = document.getElementById('btn-agregar-efectivo-det');
if (btnAgrEfDet) btnAgrEfDet.addEventListener('click', () => abrirAgregarDinero('efectivo'));
const btnRestEfDet = document.getElementById('btn-restar-efectivo-det');
if (btnRestEfDet) btnRestEfDet.addEventListener('click', () => abrirRestarDinero('efectivo'));

// --- Nu: entró / salió plata ---
const btnNuEntro = document.getElementById('btn-nu-entro');
if (btnNuEntro) btnNuEntro.addEventListener('click', () => abrirNuMovimiento('entrada'));
const btnNuSalio = document.getElementById('btn-nu-salio');
if (btnNuSalio) btnNuSalio.addEventListener('click', () => abrirNuMovimiento('salida'));
const btnNuMovConf = document.getElementById('btn-confirmar-nu-mov');
if (btnNuMovConf) btnNuMovConf.addEventListener('click', confirmarNuMovimiento);
document.addEventListener('input', function(e) {
  if (e.target.id === 'nuMovMonto') _nuMovActualizarPreview();
});

// --- Cajita: agregar ---
const btnAddCajita = document.getElementById('btnAddCajita');
if (btnAddCajita) btnAddCajita.addEventListener('click', addCajita);

// --- Agregar dinero (menú combinado, selector de cuenta destino) ---
const adMenuDest = document.getElementById('adMenuDest');
if (adMenuDest) adMenuDest.addEventListener('change', actualizarAdMenuSaldo);
const adMenuMonto = document.getElementById('adMenuMonto');
if (adMenuMonto) adMenuMonto.addEventListener('input', actualizarAdMenuPreview);

// --- Nu: tasa EA ---
const nuRateEl = document.getElementById('nuRate');
if (nuRateEl) nuRateEl.addEventListener('input', () => debounceSave(1000));

// --- Transferir: selects y monto (preview en vivo) ---
const trOrigen = document.getElementById('tr_origen');
if (trOrigen) trOrigen.addEventListener('change', actualizarTransfPreview);
const trDestino = document.getElementById('tr_destino');
if (trDestino) trDestino.addEventListener('change', actualizarTransfPreview);
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
   onchange="_nuMovToggleApertura()" inline en el HTML) se agrega acá mismo. */
[['adAperturaWrap','adEsApertura',toggleAdApertura],['nuMovAperturaWrap','nuMovEsApertura',_nuMovToggleApertura]].forEach(([wrapId,chkId,onChangeFn])=>{
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
