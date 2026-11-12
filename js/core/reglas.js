/* ================================================================
   REGLAS — js/core/reglas.js   (puro: sin DOM ni `window`; corre en el navegador y en Node)
   ================================================================
   UNA sola lista de «reglas de alerta» para todos los canales:

     · 'atencion' → la sección «Necesita atención» de Inicio (renderAttencion, inicio.js)
     · 'push'     → las notificaciones diarias (scripts/notificaciones/checks.js, que lo importa en vez de copiarlo)

   Antes cada canal tenía su copia (Atención en inicio.js, push en checks.js «portado 1:1 a mano») y ya habían derivado una vez. Ahora
   una regla vive aquí, declara en qué canales se muestra y se escribe UNA vez; un módulo nuevo (p. ej. «gastos fijos con vencimiento»)
   añade su regla y aparece en los canales que diga, sin tocar a quien las consume.

   Una regla: { id, canales: ['atencion','push'], evaluar(ctx) → [{ tipo: 'red'|'amber', texto, ir? }] }
     · `texto` es TEXTO PLANO: quien lo pinta lo escapa (inicio.js lo pasa por html``; el push lo manda tal cual).
     · `ctx` = { hoy: 'AAAA-MM-DD', S, fmt?, umbrales?, situacion?, api? }
         S          el estado completo (lo único que tiene el push).
         situacion  métricas ya calculadas (ver salud.js): solo las reglas del canal 'atencion' las necesitan.
         api        «hechos» que solo la app sabe calcular (liquidez, calendario de caja, saldo de cada deudor…). Si falta una función
                    que la regla necesita, la regla no dice nada (así el push, que solo tiene `S`, corre solo las reglas basadas en S).
   Una regla que lanza una excepción no tumba a las demás: se registra en consola y se sigue.
   Cada regla con su prueba en tests/reglas.test.js; toda regla financiera nueva lleva además su escenario en
   tests/escenarios-financieros.test.js.
   ================================================================ */
const Reglas = (() => {
  const _U = ctx => ctx.umbrales || (typeof UMBRALES !== 'undefined' ? UMBRALES : (typeof require === 'function' ? require('./umbrales.js') : null));
  // Pesos «$1.234.567» / «-$850.000». La app inyecta su Dinero.fmt (ctx.fmt); sin él (push en Node) este, que da el mismo formato.
  const fmtPesos = n => { const v = Math.round(n || 0); return (v < 0 ? '-' : '') + '$' + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  const _fmt = ctx => ctx.fmt || fmtPesos;
  const _t = f => { const [y, m, d] = String(f).split('T')[0].split('-').map(Number); return Date.UTC(y, m - 1, d); };
  // Días de `desde` a `hasta` (negativo si `hasta` es anterior). Con Date.UTC: no depende de la zona horaria ni del cambio de hora.
  const dias = (desde, hasta) => Math.round((_t(hasta) - _t(desde)) / 86400000);
  const _plural = n => (n === 1 ? 'día' : 'días');

  /* ---- Helpers que antes vivían en inicio.js y comparten Salud y Atención (una sola definición) ---- */
  // «Runway»: cuántos meses de gasto típico cubre tu liquidez, sin contar ingresos. null si aún no hay gasto típico; 0 si no es positiva.
  const mesesCubiertos = (liquidoReal, gastoRef) => (gastoRef > 0 ? Math.max(0, liquidoReal) / gastoRef : null);
  const nivelRunway = (meses, U) => { const r = (U || _U({})).runway; return meses < r.critico ? 'critico' : meses < r.atencion ? 'atencion' : 'ok'; };
  const fmtMeses = meses => {
    if (meses < 1) return 'menos de 1 mes';
    if (meses >= 24) return 'más de 24 meses';
    const n = meses.toFixed(1).replace('.', ',');
    return n === '1,0' ? '1 mes' : n + ' meses';
  };
  const textoRunway = meses => (meses <= 0 ? 'Tu plata disponible no cubre tus gastos' : 'Cubres ' + fmtMeses(meses) + ' de gastos');
  // Meses de déficit que MERECEN aviso: 0 sin ingreso típico (sería solo no haber anotado ingresos) o con un fondo sólido (≥ 6 meses).
  const rachaDeficitRelevante = (racha, ingresoTipico, meses, U) => {
    U = U || _U({});
    if (!(ingresoTipico > 0)) return 0;
    if (meses !== null && meses !== undefined && meses >= U.salud.fondoMeses.completo) return 0;
    return racha.meses >= U.salud.rachaDeficitMeses.aviso ? racha.meses : 0;
  };

  // «5 de nov» para un 'AAAA-MM-DD'.
  const fechaCorta = f => {
    const m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const [, mm, d] = String(f).split('-').map(Number);
    return d + ' de ' + m[mm - 1];
  };

  // ¿Sigue vigente el «Pagó» de una persona de Spotify? Si ya llegó su próximo pago, el ciclo terminó y vuelve a «pendiente».
  const spotifyPagadoVigente = (p, hoy) => {
    if (!p || !p.pagado) return false;
    if (!p.proximoPago) return true;
    return dias(hoy, p.proximoPago) > 0;
  };
  // Nombre de una persona de Spotify: el de su ficha en Personas si la tiene, si no el propio.
  const nombreSpotify = (S, p) => {
    if (!p) return '';
    if (p.personaId) { const per = (S.personas || []).find(x => x.id === p.personaId); if (per && per.nombre) return per.nombre; }
    return p.nombre || '';
  };

  /* ---- Registro ---- */
  const _reglas = [];
  function registrar(r) {
    if (!r || typeof r.id !== 'string' || !r.id || !Array.isArray(r.canales) || !r.canales.length || typeof r.evaluar !== 'function') {
      throw new Error('Reglas.registrar({ id, canales: [...], evaluar(ctx) }): los tres son obligatorios');
    }
    const i = _reglas.findIndex(x => x.id === r.id);
    if (i >= 0) _reglas[i] = r; else _reglas.push(r);
  }
  function evaluar(canal, ctx) {
    const out = [];
    _reglas.filter(r => r.canales.includes(canal)).forEach(r => {
      try { (r.evaluar(ctx) || []).forEach(it => out.push(Object.assign({ regla: r.id }, it))); }
      catch (e) { console.error('[Reglas:' + r.id + ']', e); }
    });
    return out;
  }
  const lista = canal => _reglas.filter(r => !canal || r.canales.includes(canal)).map(r => ({ id: r.id, canales: r.canales.slice() }));

  /* ================================================================
     LAS REGLAS (el orden de registro es el orden en que se muestran)
     ================================================================ */
  const A = ['atencion'], AP = ['atencion', 'push'];

  // Gastos fijos con día que aún no se pagaron, calculados SOLO con `S` (el push corre en Node sin Periodo/núcleo). Misma definición que
  // Periodo.gastosFijosProgramados (un test los compara): clave de pago «<id>_AAAA-MM», día recortado al último día del mes.
  function _gastosFijosProgramadosDeS(S, hoy) {
    const [hy, hm] = hoy.split('-').map(Number), out = [];
    const pagos = (S && S.pagosGastosFijos) || {};
    [0, 1].forEach(off => {
      const d = new Date(Date.UTC(hy, hm - 1 + off, 1)), mes = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
      (S.gastosFijos || []).forEach(gastoFijo => {
        const dia = Number(gastoFijo.dia);
        if (!Number.isInteger(dia) || dia < 1 || dia > 31 || pagos[gastoFijo.id + '_' + mes]) return;
        const real = Math.min(dia, new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getDate());
        const fecha = mes + '-' + String(real).padStart(2, '0');
        out.push({ id: gastoFijo.id, nombre: gastoFijo.nombre, monto: gastoFijo.monto || 0, dias: dias(hoy, fecha) });
      });
    });
    return out.sort((a, b) => a.dias - b.dias);
  }

  // Situación: liquidez negativa o runway crítico; patrimonio negativo; racha de déficit.
  registrar({ id: 'liquidez', canales: A, evaluar(ctx) {
    const m = ctx.situacion; if (!m) return [];
    const f = _fmt(ctx), U = _U(ctx);
    if (m.liquidezNeta < 0) return [{ tipo: 'red', texto: 'Tus deudas superan la plata que tienes disponible en ' + f(-m.liquidezNeta), ir: 'cuentas' }];
    if (m.mesesCubiertos != null && nivelRunway(m.mesesCubiertos, U) === 'critico') return [{ tipo: 'amber', texto: textoRunway(m.mesesCubiertos), ir: 'cuentas' }];
    return [];
  } });
  // B6: el hero ya lo muestra en rojo, pero faltaba el ítem en la lista (y la acción).
  registrar({ id: 'patrimonio-negativo', canales: A, evaluar(ctx) {
    const m = ctx.situacion; if (!m || !(m.patrimonio < 0)) return [];
    return [{ tipo: 'red', texto: 'Tu patrimonio es negativo: debes ' + _fmt(ctx)(-m.patrimonio) + ' más de lo que tienes', ir: 'analisis' }];
  } });
  // B6-2: el patrimonio lleva varios meses completos bajando (cierres mensuales, sin depósitos ni retiros). Complementa la racha de déficit:
  // esta mira el patrimonio entero (deuda, tarjeta, gastos), no solo ingreso contra gasto.
  registrar({ id: 'patrimonio-cayendo', canales: A, evaluar(ctx) {
    const m = ctx.situacion; const c = m && m.patrimonioCayendo; if (!c) return [];
    const P = _U(ctx).salud.patrimonioCayendo;
    if (!(c.n >= P.aviso)) return [];
    return [{ tipo: c.n >= P.alerta ? 'red' : 'amber', texto: 'Tu patrimonio lleva ' + c.n + ' meses seguidos bajando (' + _fmt(ctx)(-c.total) + ' en total, sin contar lo que depositaste o retiraste)', ir: 'analisis' }];
  } });
  registrar({ id: 'racha-deficit', canales: A, evaluar(ctx) {
    const m = ctx.situacion; if (!m || !m.racha) return [];
    const U = _U(ctx);
    const n = rachaDeficitRelevante(m.racha, m.ingresoTipico, m.mesesCubiertos, U);
    if (n <= 0) return [];
    return [{ tipo: n >= U.salud.rachaDeficitMeses.alerta ? 'red' : 'amber', texto: 'Llevas ' + n + ' meses seguidos gastando más de lo que ingresas (' + _fmt(ctx)(-m.racha.acumulado) + ' en total)', ir: 'analisis' }];
  } });

  // Gastos fijos con día: vencidos sin pagar (rojo), por vencer (ámbar) y la brecha de caja a 30 días.
  registrar({ id: 'gastos-fijos', canales: AP, evaluar(ctx) {
    const api = ctx.api || {};
    // Sin `api` (el push diario) se calcula desde `S`; y un vencido de hace más de una semana no se repite cada día en el celular.
    const prog = api.gastosFijosProgramados ? api.gastosFijosProgramados() : (ctx.S && ctx.hoy ? _gastosFijosProgramadosDeS(ctx.S, ctx.hoy).filter(g => g.dias >= -7) : null);
    if (!prog) return [];
    const f = _fmt(ctx), U = _U(ctx), out = [];
    prog.forEach(g => {
      if (g.dias < 0) out.push({ tipo: 'red', texto: g.nombre + ' venció hace ' + (-g.dias) + ' ' + _plural(-g.dias) + ' y no está pagado (' + f(g.monto) + ')', ir: 'gastos' });
      else if (g.dias === 0) out.push({ tipo: 'amber', texto: g.nombre + ' vence hoy (' + f(g.monto) + ')', ir: 'gastos' });
      else if (g.dias <= U.atencion.gastoFijoAvisoDias) out.push({ tipo: 'amber', texto: g.nombre + ' vence en ' + g.dias + ' ' + _plural(g.dias) + ' (' + f(g.monto) + ')', ir: 'gastos' });
    });
    const cal = api.calendarioCaja && api.calendarioCaja();
    if (cal && cal.primerDeficit) {
      const d = cal.primerDeficit;
      out.push({ tipo: 'red', texto: 'El ' + fechaCorta(d.fecha) + ' tu plata disponible quedaría en ' + f(d.saldo) + (d.evento ? ' (vence ' + d.evento.texto + ': ' + f(-d.evento.monto) + ')' : ''), ir: 'gastos' });
    }
    return out;
  } });
  // B6: un gasto fijo SIN día no tiene vencimiento, pero «ya es 25 y el arriendo no está pagado» sí merece un aviso (suave, ámbar).
  registrar({ id: 'gastos-fijos-sin-dia', canales: A, evaluar(ctx) {
    const api = ctx.api || {}; if (!api.gastosFijosSinDia) return [];
    const desde = _U(ctx).atencion.gastoFijoSinDiaDesde, dia = Number(String(ctx.hoy).split('-')[2]);
    if (dia < desde) return [];
    const f = _fmt(ctx);
    return api.gastosFijosSinDia().map(g => ({ tipo: 'amber', texto: 'Ya es ' + dia + ' y ' + g.nombre + ' aún no está pagado este mes (' + f(g.monto) + ')', ir: 'gastos' }));
  } });
  // Ingresos fijos con día esperado que ya pasó sin ningún cobro este mes.
  registrar({ id: 'ingresos-fijos', canales: A, evaluar(ctx) {
    const api = ctx.api || {}; if (!api.ingresosFijosAtrasados) return [];
    const f = _fmt(ctx);
    return api.ingresosFijosAtrasados().map(i => ({ tipo: 'amber', texto: i.nombre + ' debía llegar el día ' + i.dia + ' y aún no lo registras (' + f(i.monto) + ')', ir: 'analisis' }));
  } });

  // Personas: lo que te deben y lo que tú debes (sin fecha de pago casi nunca la hay: se avisa mientras haya saldo).
  registrar({ id: 'deudas-personas', canales: A, evaluar(ctx) {
    const api = ctx.api || {}; if (!api.deudas) return [];
    const f = _fmt(ctx), out = [];
    api.deudas('favor').forEach(d => { if (d.saldo > 0) out.push({ tipo: 'amber', texto: d.nombre + ' te debe ' + f(d.saldo), ir: 'prestamos' }); });
    api.deudas('contra').forEach(d => { if (d.saldo > 0) out.push({ tipo: 'amber', texto: 'Le debes ' + f(d.saldo) + ' a ' + d.nombre, ir: 'prestamos' }); });
    return out;
  } });
  registrar({ id: 'mesada-pendiente', canales: A, evaluar(ctx) {
    const api = ctx.api || {}; if (!api.mesadaPendientes) return [];
    const f = _fmt(ctx);
    return api.mesadaPendientes().map(x => ({ tipo: 'amber', texto: x.quien + ' te debe ' + f(x.pendiente) + ' de la mesada de ' + x.mes, ir: 'mesada' }));
  } });
  // Tarjetas: una que ya no está activa pero sigue con deuda también se debe; y el cupo casi agotado (este modelo no simula ciclos).
  registrar({ id: 'tarjetas', canales: A, evaluar(ctx) {
    const S = ctx.S || {}, api = ctx.api || {}, f = _fmt(ctx), U = _U(ctx), out = [];
    (S.tarjetasCredito || []).forEach(tc => {
      if ((tc.estado || 'activa') !== 'activa') {
        if ((tc.deuda || 0) > 0) out.push({ tipo: 'amber', texto: tc.nombre + ': tarjeta ' + tc.estado + ' con deuda de ' + f(tc.deuda), ir: 'tarjetas' });
        return;
      }
      if (!tc.cupo || !api.tcCupoUsadoPct) return;
      const pct = api.tcCupoUsadoPct(tc);
      if (pct >= 100) out.push({ tipo: 'red', texto: tc.nombre + ': cupo agotado — deuda ' + f(tc.deuda || 0), ir: 'tarjetas' });
      else if (pct >= U.atencion.cupoTcCasiAgotadoPct) out.push({ tipo: 'amber', texto: tc.nombre + ': cupo casi agotado (' + pct.toFixed(0) + '% usado)', ir: 'tarjetas' });
    });
    return out;
  } });

  // Las tres que además van al push: solo necesitan `S` y la fecha de hoy.
  registrar({ id: 'spotify-vencido', canales: AP, evaluar(ctx) {
    const S = ctx.S || {}; if (!(S.modulos && S.modulos.spotify)) return [];
    const out = [];
    ((S.spotify && S.spotify.personas) || []).forEach(p => {
      if (p.proximoPago && p.proximoPago < ctx.hoy && !spotifyPagadoVigente(p, ctx.hoy)) out.push({ tipo: 'red', texto: 'Cobro Spotify de ' + nombreSpotify(S, p) + ' vencido', ir: 'spotify' });
    });
    return out;
  } });
  registrar({ id: 'cdt', canales: AP, evaluar(ctx) {
    const S = ctx.S || {}, U = _U(ctx), out = [];
    (S.cajitas || []).forEach(c => (c.cdts || []).filter(cdt => cdt.vence).forEach(cdt => {
      const d = dias(ctx.hoy, cdt.vence);
      if (d >= 0 && d <= U.atencion.cdtAvisoDias) out.push({ tipo: 'amber', texto: 'CDT "' + c.nombre + '" vence en ' + d + 'd', ir: 'cuentas' });
      if (d < 0) out.push({ tipo: 'red', texto: 'CDT "' + c.nombre + '" venció — ¡libera tu plata!', ir: 'cuentas' });
    }));
    return out;
  } });
  // Partes comprometidas de un encargo: desde 1 día antes avisa en ámbar; si la fecha ya pasó y no se marcó «ya la usé», en rojo.
  registrar({ id: 'encargos-comprometidos', canales: AP, evaluar(ctx) {
    const S = ctx.S || {}, f = _fmt(ctx), out = [];
    (S.encargos || []).forEach(enc => (enc.partes || []).filter(p => !p.usada && p.fecha).forEach(p => {
      const d = dias(ctx.hoy, p.fecha);
      if (d < 0) out.push({ tipo: 'red', texto: enc.nombre + ': "' + p.desc + '" (' + f(p.monto) + ') venció hace ' + Math.abs(d) + 'd sin usarse — sigue comprometida', ir: 'encargos' });
      else if (d <= 1) out.push({ tipo: 'amber', texto: enc.nombre + ': "' + p.desc + '" (' + f(p.monto) + ') es ' + (d === 0 ? 'hoy' : 'mañana') + ' — esa plata ya está comprometida', ir: 'encargos' });
    }));
    return out;
  } });
  // Solo push: aviso único el primer día de la ventana de Wrapped (1 de enero); el criterio completo vive en js/core/wrapped-gate.js.
  registrar({ id: 'wrapped-disponible', canales: ['push'], evaluar(ctx) {
    const [, mes, dia] = String(ctx.hoy).split('-');
    return mes === '01' && dia === '01' ? [{ tipo: 'amber', texto: 'Tu resumen anual (Wrapped) ya está disponible 🎉', ir: 'wrapped' }] : [];
  } });

  return { registrar, evaluar, lista, dias, fmtPesos, fechaCorta, mesesCubiertos, nivelRunway, fmtMeses, textoRunway, rachaDeficitRelevante, spotifyPagadoVigente, nombreSpotify };
})();
if (typeof window !== 'undefined') window.Reglas = Reglas;
if (typeof module !== 'undefined' && module.exports) module.exports = Reglas;
