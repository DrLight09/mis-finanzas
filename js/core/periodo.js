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
     · REGLA DE CAJA, una sola para todo: un ingreso o un gasto cuenta en el mes de la FECHA en que la plata se movió
       (la que escribe quien registra), no en el mes al que "pertenece" ni en el día en que se tecleó.
     · Un gasto fijo se identifica por su CLAVE en S.pagosGastosFijos ("<id>_YYYY-MM"): es el mes que ese pago cubre, y
       sirve a la pantalla Gastos para marcar "Pagado" y a la barra de progreso. Pero CUENTA como gasto en el mes de la
       fecha del pago (pago.fecha); sin fecha, en el mes que cubre. El arriendo de septiembre pagado el 3 de octubre es
       gasto de octubre, igual que cualquier otra plata que sale ese día.
     · Su monto es el que se PAGÓ (pago.monto); solo si falta cae al monto actual del gasto fijo. Nunca depende de si el
       gasto fijo todavía existe.
     · Gasto variable real = S.gastosVar del mes que no sea _esGastoVarNoReal().
     · Ingreso del mes = mesada + ingresos fijos cobrados + entradas reales (entradasIngresoReal, core-state.js).
     · La Mesada cuenta en el mes de la FECHA en que te pagaron (cada abono de un pendiente, en la suya); su clave
       S.mesadas[padre].pagos['YYYY-<mes 0-11>'] es solo el mes que cubre. Pago sin monto: la cuota del año; sin fecha:
       el mes que cubre.
     · Un ingreso fijo (sueldo, freelance…) es una plantilla que NO suma por sí sola: cuenta cuando se registra su COBRO
       (js/core/cobros.js), en el mes de la fecha del cobro. Si no registras el cobro, ese mes no tiene ese ingreso.
     · Spotify: cada cuota que te pagan un integrante (y cada abono de lo que quedó debiendo) cuenta como ingreso en el mes
       de SU fecha, y el pago del plan cuenta como gasto completo (gastosVar). Así el balance del mes refleja la caja real
       aunque cobres semanas antes de pagar. El extra con cuenta destino ya cuenta como entrada real; el extra con «Sin
       especificar» lo cuenta spotifyEntradas. No depende de si el módulo está activo: el gasto del plan tampoco depende.
       Las estadísticas por ciclo de la pantalla Spotify son otra lectura y no cambian.
     · Es la misma regla del historial de patrimonio y de las entradas reales.

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
  // La Mesada es plata que entra el día en que te la pagan, así que cuenta como ingreso del mes de esa FECHA (regla de
  // caja, la misma de las entradas reales y del historial de patrimonio). La clave del pago ("2026-0" = enero) es solo el
  // mes que la mesada CUBRE: sirve para saber qué mes está pagado o pendiente en la pantalla de Mesada, no para sumar.
  // Cada pago y cada abono de un pendiente cuenta en su propia fecha; sin fecha, cae en el mes que cubre.
  // → [{ parent, key, mesCubre:'YYYY-MM', monto, fecha, mes:'YYYY-MM' }]  (`mes` = mes en que entró la plata)
  function mesadaEntradas(estado) {
    const st = _st(estado);
    if (!(st.modulos && st.modulos.mesada) || !st.mesadas || typeof st.mesadas !== 'object') return [];
    const out = [];
    ['papa', 'mama'].forEach(parent => {
      const d = st.mesadas[parent];
      const pagos = d && d.pagos;
      if (!pagos) return;
      Object.keys(pagos).forEach(key => {
        const info = pagos[key];
        const m = /^(\d{4})-(\d{1,2})$/.exec(key);
        if (!info || !m) return;
        const anio = Number(m[1]);
        const mesCubre = anio + '-' + String(Number(m[2]) + 1).padStart(2, '0');
        const abonos = Array.isArray(info.pendienteHistorial) ? info.pendienteHistorial : [];
        const total = info.monto || cuotaMesada(d.cuotas, anio) || 0; // sin monto guardado: la cuota del año
        const principal = total - abonos.reduce((a, h) => a + ((h && h.monto) || 0), 0);
        [{ monto: principal, fecha: info.fecha }].concat(abonos.map(h => ({ monto: (h && h.monto) || 0, fecha: h && h.fecha })))
          .forEach(pt => {
            if (!(pt.monto > 0)) return;
            out.push({ parent, key, mesCubre, monto: pt.monto, fecha: pt.fecha || '', mes: pt.fecha ? mesKey(pt.fecha) : mesCubre });
          });
      });
    });
    return out;
  }

  const mesadaDelMes = (mes, estado) => mesadaEntradas(estado).reduce((a, e) => e.mes === mes ? a + e.monto : a, 0);

  // Cobros de ingresos fijos (js/core/cobros.js): cada uno cuenta en el mes de su fecha; sin fecha, en el mes que cubre.
  // → [{ id, nombre, cobroId, mesCubre:'YYYY-MM', monto, fecha, mes:'YYYY-MM' }]
  function ingresosFijosEntradas(estado) {
    const fijos = _st(estado).ingresosFijos;
    if (!Array.isArray(fijos)) return [];
    const out = [];
    fijos.forEach(ing => {
      if (!ing || !Array.isArray(ing.cobros)) return;
      ing.cobros.forEach(c => {
        if (!c || !(c.monto > 0)) return;
        out.push({ id: ing.id, nombre: ing.nombre || '', cobroId: c.id, mesCubre: c.mesCubre || '', monto: c.monto, fecha: c.fecha || '', mes: c.fecha ? mesKey(c.fecha) : (c.mesCubre || '') });
      });
    });
    return out;
  }

  const ingresosFijosDelMes = (mes, estado) => ingresosFijosEntradas(estado).reduce((a, e) => e.mes === mes ? a + e.monto : a, 0);

  // Plata que entra por Spotify (S.spotify.historial): cada cuota cobrada, cada abono de lo que quedó debiendo y los extras
  // sin cuenta destino, en el mes de SU fecha. → [{ id, spId, nombre, tipo:'cuota'|'abono'|'extra', monto, fecha, mes }]
  //   · Un cobro con abonos guarda en `monto` la cuota + lo abonado (spotify.js suma el abono al registrar): se separa para que el
  //     principal cuente en la fecha del cobro y cada abono en la suya.
  //   · El extra con destino (extraFuente) ya cuenta como entrada real (movimiento espejo clase 'ingreso'): aquí no se repite.
  function spotifyEntradas(estado) {
    const sp = _st(estado).spotify;
    const hist = sp && Array.isArray(sp.historial) ? sp.historial : [];
    const out = [];
    const push = (h, tipo, monto, fecha) => {
      if (!(monto > 0)) return;
      out.push({ id: h.id, spId: h.spId || '', nombre: h.nombre || '', tipo, monto, fecha: fecha || '', mes: fecha ? mesKey(fecha) : '' });
    };
    hist.forEach(h => {
      if (!h || h.tipo !== 'cobro') return;
      const abonos = Array.isArray(h.pendienteHistorial) ? h.pendienteHistorial : [];
      const abonado = abonos.reduce((a, x) => a + ((x && x.monto) || 0), 0);
      push(h, 'cuota', (h.monto || 0) - abonado, h.fecha);
      abonos.forEach(x => { if (x) push(h, 'abono', x.monto, x.fecha || h.fecha); });
      if (h.extra > 0 && !h.extraFuente) push(h, 'extra', h.extra, h.fecha);
    });
    return out;
  }

  const spotifyDelMes = (mes, estado) => spotifyEntradas(estado).reduce((a, e) => e.mes === mes ? a + e.monto : a, 0);

  function ingresosDelMes(mes, estado) {
    const mesada = mesadaDelMes(mes, estado);
    const fijos = ingresosFijosDelMes(mes, estado);
    const spotify = spotifyDelMes(mes, estado);
    const entradas = ingresosRealesDelMes(mes, estado);
    return { mesada, fijos, spotify, entradas, total: mesada + fijos + spotify + entradas };
  }

  // Ingreso total por mes ('YYYY-MM' → pesos), con las mismas fuentes y la misma regla de caja que ingresosDelMes().
  function ingresosPorMes(estado) {
    const out = {};
    const sumar = (mes, monto) => { if (mes && monto > 0) out[mes] = (out[mes] || 0) + monto; };
    mesadaEntradas(estado).forEach(e => sumar(e.mes, e.monto));
    ingresosFijosEntradas(estado).forEach(e => sumar(e.mes, e.monto));
    spotifyEntradas(estado).forEach(e => sumar(e.mes, e.monto));
    entradasIngresoReal(estado).forEach(m => sumar(mesKey(m.fecha), m.monto || 0));
    return out;
  }

  // Ingreso mensual típico: promedio de los últimos `n` meses ANTERIORES a `mes` que tengan ingreso (el mes en curso no entra:
  // con la regla de caja el ingreso llega en pocos días, y a principio de mes aún no ha llegado). Misma forma que gastoPromedioPrevio.
  function ingresoPromedioPrevio(mes, n, estado) {
    const porMes = ingresosPorMes(estado);
    const previos = Object.keys(porMes).filter(k => k < mes && porMes[k] > 0).sort().slice(-(n || 3));
    if (!previos.length) return { promedio: 0, meses: 0 };
    return { promedio: previos.reduce((a, k) => a + porMes[k], 0) / previos.length, meses: previos.length };
  }

  /* ---- GASTOS ---- */
  // Todos los pagos de gastos fijos, normalizados: [{id, mes, mesCubre, monto, fecha, cat, nombre}].
  // S.pagosGastosFijos es un mapa {"<gfId>_YYYY-MM": {fecha, fuente, monto}}; `mesCubre` sale de la clave y `mes` (el que
  // cuenta) de la fecha del pago.
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
        id, mesCubre: mes,
        mes: p.fecha ? mesKey(p.fecha) : mes, // regla de caja: cuenta en el mes de la fecha del pago
        monto: p.monto || 0,
        fecha: p.fecha || '',
        cat: (gf && gf.cat) || p.cat || null,
        nombre: (gf && gf.nombre) || p.nombre || ''
      });
    };
    Object.keys(raw).forEach(k => {
      const m = /^(.*)_(\d{4}-\d{2})$/.exec(k);
      if (m) sumar(m[1], m[2], raw[k]);
    });
    return out;
  }

  const gastosFijosDelMes = (mes, estado) => pagosFijos(estado).filter(p => p.mes === mes);

  // 'Restar dinero' (S.movimientos tipo 'salida_manual', clase 'gasto'): plata que salió del patrimonio sin un
  // gasto registrado, normalmente para cuadrar lo registrado con lo real. Es el opuesto de sumar dinero
  // (ingreso), así que cuenta como gasto del mes, en la categoría 'Ajuste'. Se agrupa con los variables.
  function retirosManuales(estado) {
    return (_st(estado).movimientos || [])
      .filter(m => m && m.tipo === 'salida_manual' && claseEfectivaMovimiento(m) === 'gasto')
      .map(m => ({ id: m.id, monto: m.monto || 0, fecha: m.fecha, cat: 'Ajuste', desc: m.desc || m.nota || 'Retiro manual', fuente: m.fuente, clase: 'gasto', _esRetiroManual: true }));
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

  // Gasto mensual típico: promedio de los últimos `n` meses ANTERIORES a `mes` que tengan gasto (meses completos;
  // el mes en curso no entra, porque a principio de mes su total es parcial y haría ver las reservas enormes).
  // { promedio, meses }: `meses` = cuántos meses con datos se promediaron (0 si todavía no hay ninguno).
  function gastoPromedioPrevio(mes, n, estado) {
    const porMes = gastosPorMes(estado);
    const previos = Object.keys(porMes).filter(k => k < mes && porMes[k] > 0).sort().slice(-(n || 3));
    if (!previos.length) return { promedio: 0, meses: 0 };
    return { promedio: previos.reduce((a, k) => a + porMes[k], 0) / previos.length, meses: previos.length };
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
  // `opciones.conRendimientos` (solo Análisis lo pide): suma los rendimientos de Nu a los ingresos, de modo que el
  // balance y la tasa de ahorro midan cuánto creció el patrimonio por ingresos − gastos (los intereses son plata
  // nueva). Sin la opción el balance queda como flujo de caja operativo, que es lo que miden los ratios de deuda y
  // gasto de Salud financiera, el cierre de mes y Wrapped. `ingresos.rendimientos` indica cuánto de `total` son intereses.
  function balanceDelMes(mes, estado, opciones) {
    const rendimientos = rendimientosDelMes(mes, estado);
    const base = ingresosDelMes(mes, estado);
    const ingresos = opciones && opciones.conRendimientos
      ? Object.assign({}, base, { rendimientos: rendimientos.total, total: base.total + rendimientos.total })
      : base;
    const gastos = gastosDelMes(mes, estado);
    const balance = ingresos.total - gastos.total;
    return { mes, ingresos, gastos, balance, rendimientos, tasaAhorro: ingresos.total > 0 ? balance / ingresos.total * 100 : null };
  }

  return { cuotaMesada, mesDesplazado, mesAnterior, ultimosMeses, mesadaDelMes, ingresosFijosDelMes, ingresosFijosEntradas, spotifyEntradas, spotifyDelMes, ingresosDelMes, ingresosPorMes, ingresoPromedioPrevio, mesadaEntradas,
           pagosFijos, retirosManuales, rendimientosDelMes, gastosFijosDelMes, gastosVarRealesDelMes, gastosDelMes, gastosPorMes, gastoPromedioPrevio, gastoPorCategoria, balanceDelMes };
})();

// Visible también como propiedad global (un `const` de nivel superior no lo es): los tests lo leen como ctx.Periodo.
if (typeof window !== 'undefined') window.Periodo = Periodo;

