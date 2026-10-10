/* ═══════════════════════════════════════════════════════════════
   js/core/periodo.js

   ÚNICA definición de "cuánto entró y cuánto salió en un mes" para toda la app.

   Antes Inicio (salud financiera), Análisis (resumen, comparación con el mes
   anterior, barras, ranking, presupuestos), el resumen de cierre de mes, el
   refresh() del núcleo y Wrapped armaban cada uno su propia suma de gastos
   variables + gastos fijos pagados + mesada + ingresos fijos + entradas, y
   las copias se habían desalineado:
     · la comparación con el mes anterior buscaba la Mesada con la clave
       'YYYY-MM' en vez de 'YYYY-<índice de mes 0-11>' → nunca la encontraba;
     · los gastos fijos pagados se sumaban con el monto ACTUAL del gasto fijo
       (editarlo reescribía los meses pasados) en unas pantallas y con el monto
       realmente pagado en otras; un pago de un gasto fijo ya borrado se perdía
       en el ranking pero Wrapped sí lo contaba;
     · sin cuota explícita de Mesada, una pantalla caía en la cuota más antigua
       (o 80.000) y otra en 0;
     · en Wrapped los pagos fijos llegaban sin categoría.

   Reglas (todas las pantallas):
     · Un gasto fijo pertenece al mes de su CLAVE en S.pagosGastosFijos
       ("<id>_YYYY-MM"): es el mes que ese pago cubre. Es la misma clave que usa
       la pantalla Gastos para marcar "Pagado" y la barra de progreso.
     · Su monto es el que se PAGÓ (pago.monto); solo si falta cae al monto actual
       del gasto fijo. Nunca depende de si el gasto fijo todavía existe.
     · Gasto variable real = S.gastosVar del mes que no sea _esGastoVarNoReal().
     · Ingreso del mes = mesada + ingresos fijos + entradas reales
       (entradasIngresoReal, core-state.js).
     · Mesada del mes = pago registrado en S.mesadas[padre].pagos['YYYY-<mes 0-11>']
       con su monto recibido, o la cuota del año si el pago no trae monto.

   Todas las funciones reciben `estado` opcional (por defecto S): Wrapped trabaja
   sobre el estado que le pasan, no necesariamente el global.
   Sin DOM. Carga de entrada (<script defer>) justo después de core-state.js; solo
   usa mesKey/_esGastoVarNoReal/entradasIngresoReal (core-state.js) al ser llamado.
   ═══════════════════════════════════════════════════════════════ */
const Periodo = (() => {
  const _st = e => e || S;

  // Cuota de Mesada de un año: la del año, o la del año más cercano hacia atrás,
  // o la más antigua, o 80.000 si no hay ninguna configurada. Es la regla única
  // (_getCuotaAnio en calc-helpers.js delega acá).
  function cuotaMesada(cuotas, anio) {
    cuotas = cuotas || {};
    const key = String(anio);
    if (cuotas[key]) return cuotas[key];
    const anios = Object.keys(cuotas).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
    for (const a of anios) { if (a <= anio) return cuotas[String(a)]; }
    if (anios.length) return cuotas[String(anios[anios.length - 1])];
    return 80000;
  }

  // 'YYYY-MM' ± n meses.
  function mesDesplazado(mes, n) {
    const [a, m] = String(mes).split('-').map(Number);
    const d = new Date(a, m - 1 + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  const mesAnterior = mes => mesDesplazado(mes, -1);

  // Los últimos n meses terminando en `hasta` (inclusive), del más viejo al más nuevo.
  function ultimosMeses(n, hasta) {
    const fin = hasta || mesActual();
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(mesDesplazado(fin, -i));
    return out;
  }

  /* ---- INGRESOS ---- */
  function mesadaDelMes(mes, estado) {
    const st = _st(estado);
    if (!(st.modulos && st.modulos.mesada) || !st.mesadas || typeof st.mesadas !== 'object') return 0;
    const [anio, mm] = String(mes).split('-').map(Number);
    if (!anio || !mm) return 0;
    const key = anio + '-' + (mm - 1);
    let total = 0;
    ['papa', 'mama'].forEach(p => {
      const d = st.mesadas[p];
      const info = d && d.pagos && d.pagos[key];
      if (info) total += (info.monto || cuotaMesada(d.cuotas, anio) || 0);
    });
    return total;
  }

  function ingresosFijosDelMes(mes, estado) {
    const fijos = _st(estado).ingresosFijos;
    if (!Array.isArray(fijos)) return 0;
    return fijos.reduce((a, ing) => (!ing.desde || ing.desde <= mes) ? a + (ing.monto || 0) : a, 0);
  }

  function ingresosDelMes(mes, estado) {
    const mesada = mesadaDelMes(mes, estado);
    const fijos = ingresosFijosDelMes(mes, estado);
    const entradas = ingresosRealesDelMes(mes, estado);
    return { mesada, fijos, entradas, total: mesada + fijos + entradas };
  }

  /* ---- GASTOS ---- */
  // Todos los pagos de gastos fijos, normalizados: [{id, mes, monto, fecha, cat, nombre}].
  // S.pagosGastosFijos es un mapa {"<gfId>_YYYY-MM": {fecha, fuente, monto}}, pero datos
  // viejos pueden traerlo como array: ahí el mes sale de la fecha.
  function pagosFijos(estado) {
    const st = _st(estado);
    const raw = st.pagosGastosFijos;
    if (!raw || typeof raw !== 'object') return [];
    const gfs = st.gastosFijos || [];
    const out = [];
    const sumar = (id, mes, p) => {
      if (!p || !mes) return;
      const gf = gfs.find(x => x.id === id);
      out.push({
        id, mes,
        monto: (p.monto != null ? p.monto : (gf ? gf.monto : 0)) || 0,
        fecha: p.fecha || '',
        cat: (gf && gf.cat) || p.cat || null,
        nombre: (gf && gf.nombre) || p.nombre || ''
      });
    };
    if (Array.isArray(raw)) {
      raw.forEach(p => p && sumar(p.gastoFijoId || p.id, mesKey(p.fecha), p));
    } else {
      Object.keys(raw).forEach(k => {
        const m = /^(.*)_(\d{4}-\d{2})$/.exec(k);
        if (m) sumar(m[1], m[2], raw[k]);
      });
    }
    return out;
  }

  const gastosFijosDelMes = (mes, estado) => pagosFijos(estado).filter(p => p.mes === mes);

  // 'Restar dinero' (S.movimientos tipo 'salida_manual', clase 'gasto'): plata que salió del patrimonio sin un
  // gasto registrado, normalmente para cuadrar lo registrado con lo real. Es el opuesto de sumar dinero
  // (ingreso), así que cuenta como gasto del mes, en la categoría 'Ajuste'. Se agrupa con los variables.
  function retirosManuales(estado) {
    return (_st(estado).movimientos || [])
      .filter(m => m && m.tipo === 'salida_manual' && claseEfectivaMovimiento(m, 'movimientos') === 'gasto')
      .map(m => ({ id: m.id, monto: m.monto || 0, fecha: m.fecha, cat: 'Ajuste', desc: m.desc || m.nota || 'Retiro manual', fuente: m.fuente, _esRetiroManual: true }));
  }

  const gastosVarRealesDelMes = (mes, estado) =>
    (_st(estado).gastosVar || []).filter(g => mesKey(g.fecha) === mes && !_esGastoVarNoReal(g))
      .concat(retirosManuales(estado).filter(r => mesKey(r.fecha) === mes));

  // { variables:[gastos], fijos:[pagos], gvTotal, gfTotal, total, items }
  // `items` junta ambos (cada uno con cat y monto) para agrupar por categoría.
  function gastosDelMes(mes, estado) {
    const variables = gastosVarRealesDelMes(mes, estado);
    const fijos = gastosFijosDelMes(mes, estado);
    const gvTotal = variables.reduce((a, g) => a + (g.monto || 0), 0);
    const gfTotal = fijos.reduce((a, p) => a + p.monto, 0);
    return { variables, fijos, gvTotal, gfTotal, total: gvTotal + gfTotal, items: [...variables, ...fijos] };
  }

  // Total de gasto real por mes: { 'YYYY-MM': total } con todos los meses que tienen datos.
  function gastosPorMes(estado) {
    const out = {};
    (_st(estado).gastosVar || []).forEach(g => {
      if (_esGastoVarNoReal(g)) return;
      const k = mesKey(g.fecha);
      if (k) out[k] = (out[k] || 0) + (g.monto || 0);
    });
    retirosManuales(estado).forEach(r => { const k = mesKey(r.fecha); if (k) out[k] = (out[k] || 0) + r.monto; });
    pagosFijos(estado).forEach(p => { out[p.mes] = (out[p.mes] || 0) + p.monto; });
    return out;
  }

  // Gasto real por categoría de un mes: { cat: total }.
  function gastoPorCategoria(mes, estado) {
    const out = {};
    gastosDelMes(mes, estado).items.forEach(g => {
      const c = g.cat || 'Otro';
      out[c] = (out[c] || 0) + (g.monto || 0);
    });
    return out;
  }

  /* ---- RENDIMIENTOS (intereses de Nu) ---- */
  // Los intereses de las cajitas y CDTs de Nu SON ingreso económico (plata nueva que antes no tenías), pero no
  // entran en `ingresosDelMes().total`: ese total mide flujo de caja operativo y alimenta los ratios de deuda y
  // ahorro de Inicio, y un CDT ni siquiera es plata disponible. Se reportan aparte, sumando:
  //  · cajitas: lo ya materializado (c.rendimientos, anotado por mes al materializar) + lo acumulado sin
  //    materializar, repartido por mes (rendimientoCajitaPorMes). Meses anteriores a que existiera el registro
  //    por mes no se pueden reconstruir y salen en 0.
  //  · CDTs: calcRendimientoCDTsMes(), exacto para cualquier mes.
  // Con un `estado` distinto del global solo se lee lo ya anotado (el cálculo en vivo depende de S).
  function rendimientosDelMes(mes, estado) {
    const st = _st(estado), esGlobal = st === S;
    let cajitas = 0;
    (st.cajitas || []).forEach(c => {
      if (!c) return;
      cajitas += (c.rendimientos && c.rendimientos[mes]) || 0;
      if (esGlobal && typeof rendimientoCajitaPorMes === 'function') cajitas += rendimientoCajitaPorMes(c)[mes] || 0;
    });
    const cdts = esGlobal && typeof calcRendimientoCDTsMes === 'function' ? calcRendimientoCDTsMes(mes) : 0;
    return { cajitas, cdts, total: cajitas + cdts };
  }

  /* ---- BALANCE ---- */
  function balanceDelMes(mes, estado) {
    const ingresos = ingresosDelMes(mes, estado);
    const gastos = gastosDelMes(mes, estado);
    const balance = ingresos.total - gastos.total;
    const rendimientos = rendimientosDelMes(mes, estado);
    return { mes, ingresos, gastos, balance, rendimientos, tasaAhorro: ingresos.total > 0 ? balance / ingresos.total * 100 : null };
  }

  return { cuotaMesada, mesDesplazado, mesAnterior, ultimosMeses, mesadaDelMes, ingresosFijosDelMes, ingresosDelMes,
           pagosFijos, retirosManuales, rendimientosDelMes, gastosFijosDelMes, gastosVarRealesDelMes, gastosDelMes, gastosPorMes, gastoPorCategoria, balanceDelMes };
})();

// Visible también como propiedad global (un `const` de nivel superior no lo es): los tests lo leen como ctx.Periodo.
if (typeof window !== 'undefined') window.Periodo = Periodo;

