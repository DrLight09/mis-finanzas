// js/core/ingresos.js
//
// Mes actual, clases de movimiento e ingreso real: mesActual/gastosMes, CLASES_MOV, la ÚNICA definición de «ingreso real» (Inicio, Análisis y Wrapped) y _esGastoVarNoReal.
// Parte del antiguo el núcleo (js/core/estado.js y hermanos) (dividido por responsabilidad). Clásico (<script defer>), sin type="module": sus globales son
// léxicos de script clásico. El ORDEN de carga en index.html es el de esta lista: estado → cuentas-fuentes → persistencia →
// patrimonio → ingresos → dialogos → utilidades-ui → refresh.

function mesActual(){return Fecha.mes();}   // alias de Fecha.mes()

function gastosMes(mesK){
  return(S.gastosVar||[]).filter(g=>mesKey(g.fecha)===mesK);
}

// Suma los ingresos fijos configurados que aplican para un mes dado (YYYY-MM)
function getIngresosFijosMes(mesK){ return Periodo.ingresosFijosDelMes(mesK); }

// ── CLASE EXPLÍCITA (docs/analisis-financiero.md y docs/libro-de-movimientos.md §7) ──
// Cada movimiento nace con `clase`: 'ingreso' (sube el patrimonio), 'gasto' (lo baja), 'neutro' (mueve plata sin cambiar el
// patrimonio: el "espejo" de Mesada, Préstamos, Encargos, plata comprometida…) o 'ajuste' (corrección de datos, ej. la apertura
// de una cuenta). Todo lector pasa por claseEfectivaMovimiento(): no hay otro camino que mire etiquetas ni textos.
const CLASES_MOV = ['ingreso', 'gasto', 'neutro', 'ajuste'];
const _claseValida = c => CLASES_MOV.indexOf(c) !== -1;

// ¿Esta entrada NO cuenta como ingreso real? Solo cuenta la que tiene `clase: 'ingreso'`; una sin clase no cuenta (y save() avisa).
function _esEntradaEspejoNoIngreso(m){
  if(!m) return false;
  return claseEfectivaMovimiento(m) !== 'ingreso';
}

// ── INGRESO REAL: UNA sola definición para Inicio, Análisis y Wrapped (2026-10-04) ──
// Antes cada pantalla armaba su propia lista: Inicio exigía además una cuenta (o
// `_prestadoDirectamente`) y sumaba por separado los `ingreso` de c.movimientos de las
// cuentas personalizadas; Análisis y Wrapped solo miraban S.movimientos. Esa condición
// de cuenta ya hizo fallar al perdón de "Yo debo" (subía el patrimonio pero no el
// ingreso del mes). Regla única: ingreso real = plata nueva que sube el patrimonio,
// tenga o no cuenta (el margen de un préstamo y el perdón recibido no la tienen).
//
// Devuelve la LISTA de movimientos que cuentan; cada pantalla filtra por fecha y suma.
//   · S.movimientos tipo 'entrada' que no sean espejo (_esEntradaEspejoNoIngreso), de CUALQUIER cuenta: Nequi, Efectivo,
//     personalizadas y cajitas de Nu (todas viven aquí, con `fuente`). Un espejo con clase 'ingreso'
//     (extra de Spotify, extra de un pago de deuda, perdón recibido) es plata NUEVA aunque entre directo a una cajita.
//   · Deudas sin pata de caja marcadas `clase:'ingreso'` (p. ej. un regalo registrado como "Me deben").
// `estado` es opcional (por defecto S): Wrapped recibe el estado como parámetro.
function entradasIngresoReal(estado){
  const st = estado || S;
  const lista = [];
  (st.movimientos||[]).forEach(m => {
    if(!m || m.tipo!=='entrada' || _esEntradaEspejoNoIngreso(m)) return;
    lista.push(m);
  });
  // Deudas sin pata de caja marcadas `clase:'ingreso'` (p. ej. un regalo registrado como "Me deben"): plata nueva.
  _movsDeudaSinCuenta(st).forEach(x=>{ if(x.clase==='ingreso'&&x.monto>0) lista.push({id:x.m.id,tipo:'entrada',monto:x.monto,fecha:x.fecha,desc:x.m.nota||('Ingreso vía '+(x.deuda.nombre||'deuda')),clase:'ingreso',_esDeudaSinCuenta:true}); });
  return lista;
}

// Suma de ingresos reales de un mes 'YYYY-MM' (no incluye mesada ni ingresos fijos:
// esos los suma cada pantalla aparte).
function ingresosRealesDelMes(mes, estado){
  return entradasIngresoReal(estado).reduce((a,m) => mesKey(m.fecha)===mes ? a+(m.monto||0) : a, 0);
}

// ¿Este gasto de S.gastosVar queda fuera del "gasto real" del mes (balance, salud financiera, ranking, presupuestos, cierre de
// mes)? Sí cuando su `clase` no es 'gasto': 'neutro' (pago de gasto fijo, que ya cuenta aparte; pago de TC, que cancela una deuda
// ya contada; alcancía, que solo cambió de lugar; extra de un préstamo gastado de inmediato). Un gasto sin clase cuenta como gasto,
// que es lo que es por estar en esta lista, y save() avisa del módulo que no la puso.
function _esGastoVarNoReal(g){
  if(!g) return false;
  const c = claseEfectivaMovimiento(g);
  return c ? c !== 'gasto' : false;
}

/* ---- TOAST ---- */
// toast(msg, tipo, dur) — M6 (2026-11-10): el mensaje es TEXTO por defecto (se pinta con textContent: nada de lo que venga de datos del
// usuario puede inyectar marcado, no hay nada que "olvidar" escapar). Para marcado deliberado (un ícono, un <br>) se pasa un html`…`
// o raw(…) (js/core/html-tag.js): ese objeto lleva `__raw` y SÍ se pinta como HTML, con los valores interpolados ya escapados por html``.
//   toast(`Cuenta "${nombre}" creada`)                   ← texto: NO uses escHtml() aquí (se vería &amp;)
//   toast(html`Ingreso registrado <i class="fa-solid fa-check"></i>`)   ← marcado explícito
// Historia: el 2026-08-17 se había intentado "escapar por defecto" y se revirtió, porque ~60 llamadas ya escapaban en el sitio de
// interpolación y salía `&amp;amp;`. Esta vez se migraron todas en el mismo cambio (tests/interfaz.test.js vigila que no vuelva
// escHtml() dentro de toast()) y, como red para cualquier texto que aún llegue pre-escapado desde un validador, `_toastTexto()` decodifica
// SOLO las cinco entidades que produce escHtml() — compatibilidad transitoria, no contrato: ya no hay llamadas que dependan de ella.
