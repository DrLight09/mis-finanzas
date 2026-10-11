/* ═══════════════════════════════════════════════════════════════
   js/core/libro.js   —   plan-libro-de-movimientos.md (pasos 1 a 3)

   LIBRO DE MOVIMIENTOS: S.libro es la lista única de "patas de caja" de las cuentas con saldo
   (Nequi, Efectivo, cuentas personalizadas y cajitas de Nu). Regla central:

       saldo guardado de una cuenta  ==  suma de sus entradas en S.libro      (Libro.verificar)

   Toda variación de saldo pasa por sumarFuente()/descontarFuente()/ajustarSaldoCuenta() (core-state.js),
   que escriben aquí con Libro.registrar(). Ningún módulo debe tocar `c.saldo` directamente.

   Entrada del libro:  { id, fecha, cuenta, monto (con signo), tipo, desc?, origen? }
     tipo:    'apertura' | 'movimiento' | 'reversion' | 'rendimiento' | 'ajuste' | 'cdt'
              ('reversion' = deshace un movimiento anterior: lleva el mismo origen.ref y origen.rev=true)
     origen:  { modulo, ref? }  → módulo que la originó y, cuando se conoce, el id de su registro.
              Sin origen explícito queda como { modulo:'sin-origen' }: se asigna módulo por módulo con
              Libro.conOrigen() o pasando `origen` en las opts de sumarFuente/descontarFuente.
     Los 'rendimiento' (intereses de Nu) se agrupan por cuenta y mes: una sola entrada por cajita y mes.

   Este archivo también reconstruye las patas desde las listas heredadas (S.movimientos,
   cuenta.movimientos, cajita.historial, gastosVar, transferencias, deudores, Spotify, Mesada) para:
     · sembrar el libro en la migración v5 (Libro.sembrar), y
     · auditar que las listas heredadas y el libro cuadren (Libro.auditar, scripts/auditoria-libro.js).

   Reglas de lectura de las listas heredadas (verificadas con un backup real):
     · Solo cuentan patas con fecha >= `inicio` (la apertura más antigua).
     · Una misma pata puede estar en dos registros (espejo y registro del módulo): se cuenta UNA vez.
     · `_esAlcanciaIngreso` NO es pata de ninguna cuenta (plata que entró directo a la alcancía).
     · Pagos de gasto fijo ya están en gastosVar; el pago de Spotify con `_gastoVarId` también (si ese
       gasto aún existe).
     · Plata de encargos es informativa: no mueve el saldo propio.
     · El capital de un CDT sale del saldo de la cajita sin registro previo: pata inferida (tipo 'cdt').
   Sin DOM. Clásico (<script defer>, global `Libro`) o require() en Node.
   ═══════════════════════════════════════════════════════════════ */
const Libro = (() => {
  const _st = e => e || (typeof S !== 'undefined' ? S : {});
  const _arr = x => (Array.isArray(x) ? x : []);
  const TOL = 0.01;                       // diferencia máxima tolerada entre saldo guardado y libro
  let _seq = 0, _ctx = null;
  const _id = () => 'l' + Date.now().toString(36) + (_seq++).toString(36);
  const _hoyStr = () => (typeof hoy === 'function' ? hoy() : new Date().toISOString().slice(0, 10));
  const esCuenta = k => typeof k === 'string' && (k === 'nequi' || k === 'efectivo' || k.startsWith('custom:') || k.startsWith('cajita:'));

  function cuentasDe(st) {
    const out = {};
    _arr(st.cuentas).forEach(c => { if (c && c.id) out[c.tipo === 'custom' ? 'custom:' + c.id : c.id] = { saldo: c.saldo || 0, nombre: c.tipo === 'custom' ? (c.nombre || c.id) : c.id }; });
    _arr(st.cajitas).forEach(c => { if (c && c.id) out['cajita:' + c.id] = { saldo: c.saldo || 0, nombre: (c.nombre || 'Cajita') + ' (Nu)' }; });
    return out;
  }

  /* ───────────── ESCRITURA ───────────── */
  // Contexto de origen para código síncrono: Libro.conOrigen({modulo:'prestado', ref:id}, () => { sumarFuente(...); ... }).
  function conOrigen(origen, fn) { const prev = _ctx; _ctx = origen; try { return fn(); } finally { _ctx = prev; } }

  // Añade una pata al libro. `o`: { tipo, desc, origen, fecha }. Devuelve el id (o null si no es cuenta de saldo).
  function registrar(cuenta, monto, o, estado) {
    if (!esCuenta(cuenta) || !monto) return null;
    const st = _st(estado); if (!Array.isArray(st.libro)) st.libro = [];
    o = o || {};
    const og = o.origen || _ctx || { modulo: 'sin-origen' };
    const fecha = o.fecha || _hoyStr(), tipo = o.tipo || (og.rev ? 'reversion' : 'movimiento');
    if (tipo === 'rendimiento') {           // intereses: una entrada por cuenta y mes (evita ~1 entrada/día/cajita)
      const mes = fecha.slice(0, 7);
      for (let i = st.libro.length - 1, n = 0; i >= 0 && n < 400; i--, n++) {
        const l = st.libro[i];
        if (l && l.cuenta === cuenta && l.tipo === 'rendimiento' && String(l.fecha).slice(0, 7) === mes) { l.monto += monto; if (fecha > l.fecha) l.fecha = fecha; return l.id; }
      }
    }
    const reg = { id: _id(), fecha, cuenta, monto, tipo };
    if (o.desc) reg.desc = o.desc;
    reg.origen = og;
    st.libro.push(reg);
    return reg.id;
  }

  /* ───────────── VERIFICACIÓN (invariante) ───────────── */
  // saldo guardado vs suma del libro, por cuenta. ok=false → alguna operación movió saldo sin pasar por el libro.
  function verificar(estado) {
    const st = _st(estado), cu = cuentasDe(st), suma = {};
    _arr(st.libro).forEach(l => { if (l && cu[l.cuenta]) suma[l.cuenta] = (suma[l.cuenta] || 0) + (l.monto || 0); });
    const filas = Object.keys(cu).map(k => ({ cuenta: k, nombre: cu[k].nombre, guardado: cu[k].saldo, libro: suma[k] || 0, dif: cu[k].saldo - (suma[k] || 0) }));
    const descuadres = filas.filter(f => Math.abs(f.dif) >= TOL);
    return { ok: descuadres.length === 0, filas, descuadres };
  }
  const saldo = (cuenta, estado) => _arr(_st(estado).libro).reduce((a, l) => (l && l.cuenta === cuenta ? a + (l.monto || 0) : a), 0);

  /* ───────────── LECTURA DE LAS LISTAS HEREDADAS ───────────── */
  function fechaInicio(st) {
    const f = [];
    const mira = m => { if (m && m.tipo === 'apertura' && m.fecha) f.push(m.fecha); };
    _arr(st.movimientos).forEach(mira);
    _arr(st.cuentas).forEach(c => _arr(c && c.movimientos).forEach(mira));
    _arr(st.cajitas).forEach(c => _arr(c && c.historial).forEach(mira));
    return f.length ? f.sort()[0] : '';
  }

  // { inicio, patas:[{cuenta, monto(con signo), fecha, fuente, id, desc, sec?, inferida?}] }
  // opts.todas=true incluye también las patas anteriores a `inicio` (para sembrar aperturas que faltan).
  function patas(estado, opts) {
    const st = _st(estado), inicio = fechaInicio(st), out = [], vistos = new Set();
    const ok = f => !!f && ((opts && opts.todas) || f >= inicio);
    const add = (cuenta, monto, fecha, fuente, id, desc, extra) => {
      if (!cuenta || !monto || !ok(fecha)) return;
      out.push(Object.assign({ cuenta, monto, fecha, fuente, id, desc: desc || '' }, extra || {}));
    };
    const sec = m => (m && m._origenSeccion ? { sec: m._origenSeccion } : null);

    _arr(st.movimientos).forEach(m => {                                   // 1) S.movimientos
      if (!m) return;
      if (m.id) vistos.add(m.id);
      if (m._esAlcanciaIngreso) return;
      if (m.tipo === 'apertura') add(m.fuente, m.monto, m.fecha, 'apertura', m.id, m.desc);
      else if (m.tipo === 'entrada') add(m.fuente, m.monto, m.fecha, m._secundario ? 'espejo' : 'manual', m.id, m.desc, sec(m));
      else if (m.tipo === 'salida' || m.tipo === 'salida_manual') add(m.fuente, -m.monto, m.fecha, 'salida manual', m.id, m.desc);
      else if (m.tipo === 'transferencia') {
        const sale = m._intercambioSalida ? true : m._intercambioEntrada ? false : !!(m._fuenteDestino && m._fuenteDestino !== m.fuente);
        add(m.fuente, sale ? -m.monto : m.monto, m.fecha, 'intercambio de encargo', m.id, m.desc);
      }
    });
    _arr(st.cuentas).filter(c => c && c.tipo === 'custom').forEach(c => _arr(c.movimientos).forEach(m => {   // 2)
      if (!m || (m.id && vistos.has(m.id))) return; if (m.id) vistos.add(m.id);
      const entra = m.tipo === 'apertura' || m.tipo === 'ingreso' || m.tipo === 'entrada';
      add('custom:' + c.id, entra ? m.monto : -m.monto, m.fecha, m.tipo === 'apertura' ? 'apertura' : 'espejo', m.id, m.nota || m.desc, sec(m));
    }));
    _arr(st.cajitas).forEach(c => _arr(c && c.historial).forEach(m => {                                        // 3)
      if (!m || (m.id && vistos.has(m.id))) return; if (m.id) vistos.add(m.id);
      add('cajita:' + c.id, m.tipo === 'entrada' ? m.monto : -m.monto, m.fecha, 'espejo', m.id, m.nota || m.desc, sec(m));
    }));
    _arr(st.gastosVar).forEach(g => { if (g && g.fuente) add(g.fuente, -g.monto, g.fecha, g._esAlcancia ? 'depósito alcancía' : g._esPagoTC ? 'pago de TC' : 'gasto', g.id, g.desc); });   // 4)
    _arr(st.transferencias).forEach(t => { if (!t) return; add(t.origen, -t.monto, t.fecha, 'transferencia', t.id, t.nota || t.desc); add(t.destino, t.monto, t.fecha, 'transferencia', t.id, t.nota || t.desc); });   // 5)
    const entra = (m, nombre, fuente) => {
      if (m.destinos) m.destinos.forEach(f => { if (!(f._movId && vistos.has(f._movId))) add(f.fuente, f.monto, m.fecha, fuente, m.id, nombre); });
      else if (m.destino && !(m._abonoDestinoMovId && vistos.has(m._abonoDestinoMovId))) add(m.destino, m.monto, m.fecha, fuente, m.id, nombre);
    };
    const sale = (m, nombre, fuente) => {
      if (m._viaTC) return;
      if (m.fuentes) m.fuentes.forEach(f => add(f.fuente, -f.monto, m.fecha, fuente, m.id, nombre)); else if (m.fuente) add(m.fuente, -m.monto, m.fecha, fuente, m.id, nombre);
    };
    _arr(st.deudores).forEach(d => _arr(d && d.movimientos).forEach(m => {                                      // 6)
      if (!m || m._perdon) return;
      if (m.tipo === 'prestamo') sale(m, d.nombre, 'préstamo dado');
      else if (m.tipo === 'abono' || m.tipo === 'pago-completo') entra(m, d.nombre, 'cobro de préstamo');
    }));
    _arr(st.misDeudas).forEach(d => _arr(d && d.movimientos).forEach(m => {   // "Yo debo": sin datos reales para verificar
      if (!m || m._perdon) return;
      if (m.tipo === 'recibido') entra(m, d.nombre, 'préstamo recibido');
      else if (['pago', 'abono', 'pago-completo'].includes(m.tipo)) sale(m, d.nombre, 'pago de deuda');
    }));
    const gastoExiste = id => !!id && _arr(st.gastosVar).some(g => g && g.id === id);
    _arr(st.spotifyHistorial).forEach(h => {                                                                    // 7)
      if (!h) return;
      if (h.tipo === 'cobro') add(h.fuente, h.monto, h.fecha, 'cobro Spotify', h.id, h.nombre);
      else if (!gastoExiste(h._gastoVarId)) add(h.fuente, -h.monto, h.fecha, 'pago Spotify', h.id, h.nombre);
    });
    ['papa', 'mama'].forEach(p => Object.values((st.mesadas && st.mesadas[p] && st.mesadas[p].pagos) || {}).forEach(x => {   // 8)
      const pago = r => {
        if (!r) return;
        if (r.splits) r.splits.forEach(s => { if (s.fuente && !(s._movSecId && vistos.has(s._movSecId))) add(s.fuente, s.monto, r.fecha, 'mesada', s._movSecId, p); });
        else if (r.destino && !(r._movSecId && vistos.has(r._movSecId))) add(r.destino, r.monto, r.fecha, 'mesada', r._movSecId, p);
      };
      pago(x); _arr(x && x.pendienteHistorial).forEach(pago);
    }));
    _arr(st.cajitas).forEach(c => _arr(c && c.cdts).forEach(cdt => add('cajita:' + c.id, -cdt.monto, cdt.inicio > inicio ? cdt.inicio : inicio, 'capital en CDT', cdt.id, 'CDT', { inferida: true })));   // 9)
    return { inicio, patas: out };
  }

  const _MODULO = { 'gasto': 'gastos', 'depósito alcancía': 'alcancia', 'pago de TC': 'tarjetas', 'transferencia': 'cuentas', 'manual': 'cuentas', 'salida manual': 'cuentas', 'apertura': 'cuentas',
    'intercambio de encargo': 'encargos', 'préstamo dado': 'prestado', 'cobro de préstamo': 'prestado', 'préstamo recibido': 'prestado', 'pago de deuda': 'prestado',
    'cobro Spotify': 'spotify', 'pago Spotify': 'spotify', 'mesada': 'mesada', 'capital en CDT': 'cuentas' };

  // MIGRACIÓN v5: siembra S.libro desde las listas heredadas y añade UNA entrada explícita por cada diferencia con el
  // saldo guardado, de modo que el invariante (saldo == suma del libro) valga desde el primer día. Idempotente.
  function sembrar(d) {
    if (!d || typeof d !== 'object') return d;
    if (Array.isArray(d.libro) && d.libro.length) return d;
    const cu = cuentasDe(d), { inicio, patas: ps } = patas(d, { todas: true }), out = [], hoyS = _hoyStr();
    const nueva = (cuenta, monto, fecha, tipo, desc, origen) => out.push({ id: _id(), fecha, cuenta, monto, tipo, desc, origen });
    Object.keys(cu).forEach(k => {
      const mias = ps.filter(p => p.cuenta === k);
      const previas = mias.filter(p => p.fecha < inicio), recientes = mias.filter(p => p.fecha >= inicio);
      let suma = 0;
      const previo = previas.reduce((a, p) => a + p.monto, 0);
      if (!mias.some(p => p.fuente === 'apertura') && Math.abs(previo) >= 0.005) {      // cuenta con saldo previo y sin apertura
        nueva(k, previo, inicio, 'apertura', 'Saldo previo al reinicio (movimientos anteriores a ' + inicio + ')', { modulo: 'migracion-v5' }); suma += previo;
      }
      recientes.forEach(p => {
        nueva(k, p.monto, p.fecha, p.fuente === 'apertura' ? 'apertura' : p.inferida ? 'cdt' : 'movimiento', p.desc || p.fuente, { modulo: p.sec || _MODULO[p.fuente] || 'otro', ref: p.id }); suma += p.monto;
      });
      const resto = cu[k].saldo - suma;
      if (Math.abs(resto) >= 0.005) {
        if (k.startsWith('cajita:') && resto > 0) nueva(k, resto, hoyS, 'rendimiento', 'Intereses de Nu anteriores al libro', { modulo: 'migracion-v5' });
        else nueva(k, resto, hoyS, 'ajuste', 'Diferencia anterior al libro (sin explicar)', { modulo: 'migracion-v5' });
      }
    });
    out.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    d.libro = out;
    return d;
  }

  /* ───────────── AUDITORÍA (listas heredadas vs saldo guardado) ───────────── */
  function saldoDerivado(cuenta, estado) { return patas(estado).patas.filter(p => p.cuenta === cuenta).reduce((a, p) => a + p.monto, 0); }
  function auditar(estado) {
    const st = _st(estado), cu = cuentasDe(st), { inicio, patas: ps } = patas(st);
    const filas = Object.keys(cu).map(k => {
      const mias = ps.filter(p => p.cuenta === k), derivado = mias.reduce((a, p) => a + p.monto, 0);
      return { cuenta: k, nombre: cu[k].nombre, guardado: cu[k].saldo, derivado, residuo: cu[k].saldo - derivado, patas: mias.length };
    });
    const ajenas = ps.filter(p => !cu[p.cuenta]).reduce((a, p) => { a[p.cuenta] = (a[p.cuenta] || 0) + p.monto; return a; }, {});
    return { inicio, filas, patasAjenas: ajenas, cobertura: { noVerificadoConDatosReales: ['misDeudas ("Yo debo")', 'mesada con splits'] } };
  }
  // Cada "Chequeo rápido" de Nu compara la app con la lectura real: un cambio brusco entre dos lecturas ubica una pata que falta.
  function diferenciasPorChequeo(cajitaId, estado) {
    const st = _st(estado), { patas: ps } = patas(st), key = 'cajita:' + cajitaId;
    let prev = 0;
    return _arr(st.chequeosNu).filter(c => c && c.cajitaId === cajitaId).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map(c => {
      const der = ps.filter(p => p.cuenta === key && p.fecha <= c.fecha).reduce((a, p) => a + p.monto, 0);
      const dif = c.saldoReal - der, fila = { fecha: c.fecha, real: c.saldoReal, derivado: der, difAcumulada: dif, cambio: dif - prev };
      prev = dif; return fila;
    });
  }

  return { esCuenta, registrar, conOrigen, verificar, saldo, patas, sembrar, saldoDerivado, auditar, diferenciasPorChequeo, fechaInicio, TOL };
})();

if (typeof window !== 'undefined') window.Libro = Libro;
if (typeof module !== 'undefined' && module.exports) module.exports = Libro;
