/* ================================================================
   SALUD — js/core/salud.js   (cálculo PURO: sin DOM, sin `window`, sin `S`; corre igual en el navegador y en Node)
   ================================================================
   Dos lecturas de la situación financiera, derivadas de UN objeto de métricas `m` que arma inicio.js (`_situacion()`):

     · Salud.pilares(m)  → cuatro pilares con semáforo (liquidez, deuda, flujo, tendencia), cada uno con la pantalla donde se actúa.
                            Un solo número (el puntaje) esconde cuál de las cuatro cosas va mal; esto lo muestra.
     · Salud.estado(m)   → el estado global de cinco niveles (creciendo, estable, atención, presión, crisis), con el tono que le
                            corresponde: celebrar con moderación arriba; en presión y crisis, sin juicio, sin celebración y con lo
                            urgente primero (acciones concretas), sin ocultar ningún número.
     · Salud.tendenciaPatrimonio(historial, hoy)  → variación del patrimonio visible en los últimos 90 días, sin contar lo que entró
                            o salió por depósitos/retiros (`montoBase`) — mismo criterio que la gráfica de Análisis y Wrapped.

   Métricas `m` (todas números ya calculados con las definiciones únicas de la app; lo que no se sabe va en null):
     patrimonio        patrimonio visible (activos − pasivos, sin Alcancía)
     liquidezNeta      calcLiquidez().neta        activosLiquidos  libre + CDT vencidos (plata usable ya, antes de restar deudas)
     deudaPropia       tarjeta propia + «Yo debo» (lo ajeno no entra: no es una deuda tuya)
     meDeben           lo prestado sin cobrar     ingresoTipico / gastoTipico   promedio de los últimos meses completos
     mesesCubiertos    runway: meses de gasto típico que cubre la liquidez neta (null si no hay gasto típico)
     racha             { meses }  meses completos seguidos en déficit (Periodo.rachaDeficit)
     balances          balance recurrente de los últimos meses completos, del más reciente al más viejo: [number]
     deficitMesActual  true si lo gastado en el mes en curso ya supera el ingreso de referencia (el mes cierra en déficit pase lo que pase)
     tendencia         resultado de tendenciaPatrimonio (o null)
     sinDatos          true si no hay nada que evaluar todavía
   Los límites salen de UMBRALES (js/core/umbrales.js): se pasan como segundo argumento o se leen del global/CommonJS.
   ================================================================ */
const Salud = (() => {
  const _R = () => (typeof Reglas !== 'undefined' ? Reglas : require('./reglas.js'));
  const _U = () => (typeof UMBRALES !== 'undefined' ? UMBRALES : (typeof require === 'function' ? require('./umbrales.js') : null));
  const NIVELES = ['verde', 'ambar', 'rojo']; // de menos a más grave: 'sin' (sin datos) queda fuera del orden
  const peor = (a, b) => NIVELES.indexOf(a) >= NIVELES.indexOf(b) ? a : b;

  const _d = f => { const [y, m, d] = String(f).split('T')[0].split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const _dias = (a, b) => Math.round((_d(b) - _d(a)) / 86400000);

  // Variación del patrimonio visible en los últimos `dias` días del historial. `historial`: [{ fecha, valorVisible|valor, montoBase }].
  // → { dias, delta, pct (null si la base no es positiva), inicio, fin } o null si no hay al menos `minDias` de historial.
  function tendenciaPatrimonio(historial, hoy, opts) {
    const U = ((opts && opts.umbrales) || _U()).salud.pilares.tendencia;
    const dias = (opts && opts.dias) || U.dias;
    const val = p => (typeof p.valorVisible === 'number' ? p.valorVisible : (p.valor || 0));
    const h = (historial || []).filter(p => p && p.fecha).slice().sort((a, b) => _d(a.fecha) - _d(b.fecha)); // por fecha real, no por texto: '2026-8-10' > '2026-11-05' como string
    if (h.length < 2) return null;
    const ultimo = h[h.length - 1];
    const corte = h.filter(p => _dias(p.fecha, ultimo.fecha) <= dias);
    const primero = corte[0];
    if (!primero || primero === ultimo) return null;
    const span = _dias(primero.fecha, ultimo.fecha);
    if (span < U.minDias) return null;
    let base = 0; corte.forEach(p => { if (p !== primero) base += (p.montoBase || 0); });
    const delta = (val(ultimo) - val(primero)) - base;
    const inicio = val(primero);
    return { dias: span, delta, pct: inicio > 0 ? (delta / inicio) * 100 : null, inicio, fin: val(ultimo) };
  }

  // Dirección de una tendencia: 'sube' | 'plana' | 'cae' | null (sin historial suficiente). Con base no positiva no hay porcentaje: se
  // compara el cambio contra un cuarto del gasto mensual típico (un cambio menor a eso es ruido).
  function _direccion(t, m, U) {
    if (!t) return null;
    if (t.pct != null) return t.pct > U.planoPct ? 'sube' : t.pct < -U.planoPct ? 'cae' : 'plana';
    const ruido = Math.max(1, (m.gastoTipico || 0) * 0.25);
    return t.delta > ruido ? 'sube' : t.delta < -ruido ? 'cae' : 'plana';
  }

  function pilares(m, umbrales) {
    const U = umbrales || _U(), P = U.salud.pilares;
    const out = [];

    // 1) Liquidez: meses de gasto cubiertos con la liquidez NETA (lo que se puede usar ya, después de deudas).
    {
      let nivel = 'sin', texto = 'Registra un mes completo de gastos para medirla', valor = null;
      if (m.liquidezNeta != null && m.liquidezNeta <= 0 && (m.deudaPropia > 0 || m.mesesCubiertos != null || m.activosLiquidos > 0)) {
        nivel = 'rojo'; texto = 'Tus deudas superan tu plata disponible'; valor = 0;
      } else if (m.mesesCubiertos != null) {
        valor = m.mesesCubiertos;
        nivel = m.mesesCubiertos < U.runway.critico ? 'rojo' : m.mesesCubiertos < U.runway.atencion ? 'ambar' : 'verde';
        texto = 'Cubres ' + _R().fmtMeses(m.mesesCubiertos) + ' de gastos';
      }
      out.push({ id: 'liquidez', titulo: 'Liquidez', nivel, valor, texto, ir: 'cuentas' });
    }

    // 2) Deuda: tarjeta propia + «Yo debo» frente a tu ingreso típico y frente a tus activos líquidos; manda el peor de los dos.
    {
      let nivel, texto, valor = null;
      if (!(m.deudaPropia > 0)) { nivel = 'verde'; texto = 'Sin deudas propias'; }
      else {
        const xIng = m.ingresoTipico > 0 ? m.deudaPropia / m.ingresoTipico : null;
        const xAct = m.activosLiquidos > 0 ? m.deudaPropia / m.activosLiquidos : Infinity;
        const nIng = xIng == null ? null : xIng > P.deuda.ingresoRojo ? 'rojo' : xIng > P.deuda.ingresoAmbar ? 'ambar' : 'verde';
        const nAct = xAct > P.deuda.activosRojo ? 'rojo' : xAct > P.deuda.activosAmbar ? 'ambar' : 'verde';
        nivel = nIng == null ? nAct : peor(nIng, nAct);
        valor = xIng;
        texto = xIng == null
          ? 'Debes ' + _pct(xAct) + ' de tus activos líquidos'
          : 'Debes ' + _x(xIng) + ' tu ingreso mensual' + (xAct !== Infinity ? ' y ' + _pct(xAct) + ' de tus activos líquidos' : ' y no tienes activos líquidos');
      }
      out.push({ id: 'deuda', titulo: 'Deuda', nivel, valor, texto, ir: m.deudaPropia > 0 ? 'prestamos' : '' });
    }

    // 3) Flujo: de los últimos 3 meses completos, cuántos cerraron en déficit.
    {
      const b = (m.balances || []).slice(0, P.flujo.meses);
      let nivel = 'sin', texto = 'Aún no hay meses completos para medirlo', valor = null;
      if (b.length) {
        const n = b.filter(x => x < 0).length;
        valor = n;
        nivel = n >= P.flujo.rojo ? 'rojo' : n >= P.flujo.ambar ? 'ambar' : 'verde';
        texto = n === 0 ? 'Ningún déficit en tus últimos ' + b.length + (b.length === 1 ? ' mes' : ' meses')
          : n + (n === 1 ? ' mes' : ' meses') + ' en déficit de los últimos ' + b.length;
      }
      out.push({ id: 'flujo', titulo: 'Flujo', nivel, valor, texto, ir: 'analisis' });
    }

    // 4) Tendencia: hacia dónde va el patrimonio en 90 días (sin contar depósitos ni retiros).
    {
      const dir = _direccion(m.tendencia, m, P.tendencia);
      const nivel = dir === 'cae' ? 'rojo' : dir === 'plana' ? 'ambar' : dir === 'sube' ? 'verde' : 'sin';
      const texto = dir == null ? 'Necesita al menos ' + P.tendencia.minDias + ' días de historial'
        : dir === 'cae' ? 'Tu patrimonio bajó ' + _monto(-m.tendencia.delta) + ' en ' + m.tendencia.dias + ' días'
        : dir === 'sube' ? 'Tu patrimonio subió ' + _monto(m.tendencia.delta) + ' en ' + m.tendencia.dias + ' días'
        : 'Tu patrimonio está estable en ' + m.tendencia.dias + ' días';
      out.push({ id: 'tendencia', titulo: 'Tendencia', nivel, valor: m.tendencia ? m.tendencia.delta : null, texto, ir: 'analisis' });
    }
    return out;
  }

  // Estado global. Prioridad: crisis > presión > atención > creciendo > estable. null si no hay nada que evaluar.
  //   crisis    patrimonio < 0 y (liquidez neta ≤ 0 o el último mes cerró en déficit)
  //   presión   liquidez neta ≤ 0 con patrimonio positivo, o 2+ meses seguidos de déficit con menos de 1 mes de reservas
  //   atención  patrimonio negativo (aunque mejore: no se celebra), patrimonio cayendo, o reservas de 1 a 3 meses, o déficit este mes
  //   creciendo patrimonio subiendo y balance ≥ 0 en 2 de los últimos 3 meses
  //   estable   patrimonio plano (±3 %) y reservas ≥ 3 meses; lo demás con datos, también
  function estado(m, umbrales) {
    const U = umbrales || _U();
    if (m.sinDatos) return null;
    const dir = _direccion(m.tendencia, m, U.salud.pilares.tendencia);
    const ultimoDeficit = (m.balances || [])[0] < 0;
    const rachaMeses = (m.racha && m.racha.meses) || 0;
    const reservas = m.mesesCubiertos;
    let id;
    if (m.patrimonio < 0 && (m.liquidezNeta <= 0 || ultimoDeficit)) id = 'crisis';
    else if ((m.patrimonio > 0 && m.liquidezNeta <= 0) || (rachaMeses >= U.salud.rachaDeficitMeses.aviso && reservas != null && reservas < U.runway.critico)) id = 'presion';
    else if (m.patrimonio < 0 || dir === 'cae' || (reservas != null && reservas < U.runway.atencion) || m.deficitMesActual) id = 'atencion';
    else if (dir === 'sube' && (m.balances || []).slice(0, 3).filter(x => x >= 0).length >= 2) id = 'creciendo';
    else id = 'estable';
    return Object.assign({ id }, ESTADOS[id], { acciones: id === 'presion' || id === 'crisis' ? accionesUrgentes(m) : [] });
  }

  const ESTADOS = {
    creciendo: { etiqueta: 'Creciendo', tono: 'verde', frase: 'Tu patrimonio va en aumento y tus cuentas cierran en positivo.' },
    estable:   { etiqueta: 'Estable',   tono: 'verde', frase: 'Tus finanzas están en equilibrio.' },
    atencion:  { etiqueta: 'Atención',  tono: 'ambar', frase: 'Hay señales que conviene mirar a tiempo.' },
    presion:   { etiqueta: 'Presión',   tono: 'rojo',  frase: 'Lo urgente primero.' },
    crisis:    { etiqueta: 'Crisis',    tono: 'rojo',  frase: 'Lo urgente primero.' },
  };

  // Hasta tres acciones concretas, de lo que más alivia a lo que menos; cada una lleva la pantalla donde se hace (`ir`).
  function accionesUrgentes(m) {
    const a = [];
    if (m.deudaPropia > 0) a.push({ texto: 'Ver y priorizar tus deudas (' + _monto(m.deudaPropia) + ')', ir: m.tcPropia > 0 ? 'tarjetas' : 'prestamos' });
    if (m.meDeben > 0) a.push({ texto: 'Cobrar lo que te deben (' + _monto(m.meDeben) + ')', ir: 'prestamos' });
    if (m.gastoTipico > 0 || m.ingresoTipico > 0) a.push({ texto: 'Revisar tus gastos fijos y variables', ir: 'gastos' });
    return a.slice(0, 3);
  }

  const _pct = r => Math.round(r * 100) + ' %';
  const _x = r => r.toFixed(1).replace('.', ',') + '×';
  const _monto = n => '$' + Math.round(n).toLocaleString('es-CO');

  // P4 — runway con fecha. Si el patrimonio baja `tendenciaMensual` (negativa) por mes y hay `liquidezNeta` positiva, ¿cuándo se acaba?
  // → { meses (redondeado, mínimo 1), fecha 'AAAA-MM-DD' (hoy + liquidez / ritmo diario, ritmo = 30 días por mes), mes 'AAAA-MM' } o null
  // si no hay tendencia negativa ni liquidez positiva (no hay nada que fechar).
  function fechaAgotamiento(liquidezNeta, tendenciaMensual, hoyStr) {
    if (!(liquidezNeta > 0) || !(tendenciaMensual < 0)) return null;
    const dias = Math.round(liquidezNeta / Math.abs(tendenciaMensual) * 30);
    const f = new Date(_d(hoyStr) + dias * 86400000);
    const iso = f.getUTCFullYear() + '-' + String(f.getUTCMonth() + 1).padStart(2, '0') + '-' + String(f.getUTCDate()).padStart(2, '0');
    return { meses: Math.max(1, Math.round(dias / 30)), dias, fecha: iso, mes: iso.slice(0, 7) };
  }

  return { pilares, estado, tendenciaPatrimonio, fechaAgotamiento, accionesUrgentes, ESTADOS };
})();
if (typeof window !== 'undefined') window.Salud = Salud;
if (typeof module !== 'undefined' && module.exports) module.exports = Salud;
