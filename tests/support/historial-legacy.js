/* tests/support/historial-legacy.js — SOLO PARA LA PRUEBA DORADA (tests/historial-cuenta.test.js)

   Copia LITERAL de las dos funciones de historial de cuenta tal como estaban en cuentas.js
   antes del 2026-10-04 (getMovimientosCuenta y _getMovimientosCuentaCustom), renombradas con
   el prefijo _legacy para poder cargarlas junto a la versión nueva y comparar su salida con
   los mismos datos. NO se usa en la app ni se carga en index.html.

   Es una referencia transitoria: cuando la función única lleve un tiempo en producción sin
   incidencias, se puede borrar este archivo y la prueba dorada (los tests de comportamiento
   de tests/historial-cuenta.test.js siguen valiendo solos). */
function _legacyGetMovimientosCuentaCustom(fuente) {
  const cid = fuente.split(':')[1];
  const c = getCuentaCustom(cid);
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
    // Ingreso de Alcancía sin cuenta de origen (propio/regalo/mandado): no movió esta cuenta, así que no
    // es un movimiento de la cuenta y no se lista en su historial (ver alcancia.md §3).
    if (m._esAlcanciaIngreso) return;
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
    const tipoDisplay = m._esAlcanciaIngreso ? 'alcancia' : esApertura ? 'apertura' : esTransferencia ? 'transferencia' : esEntrada ? 'ingreso' : 'egreso';
    const montoDisplay = m._esAlcanciaIngreso ? 0 : esApertura ? +m.monto : esTransferencia ? (esIntercambioSalida ? -m.monto : +m.monto) : esEntrada ? +m.monto : -m.monto; // neto-cero de Alcancía: efecto 0 sobre el saldo (ver getMovimientosCuenta)
    let _origen, _otrasCuentas = null;
    if (esApertura) { _origen = 'Saldo inicial'; }
    else if (m._esAlcanciaIngreso) { _origen = 'Alcancía'; }
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
      _secundario: !!m._secundario || !!m._esAlcanciaIngreso, _origenSeccion: m._origenSeccion || (m._esAlcanciaIngreso ? 'Alcancía' : ''),
      _alcOculto: !!m._esAlcanciaIngreso
    });
  });

  // 3. Gastos variables pagados desde esta cuenta
  (S.gastosVar || []).forEach(g => {
    if (g.fuente !== fuente) return;
    // A diferencia de getMovimientosCuenta() (que se los saltaba), acá los depósitos a la alcancía
    // siempre se mostraron — con el monto a la vista. Ahora igual que arriba: fila visible, monto oculto.
    const _origen = g._esAlcancia ? 'Alcancía' : g._secundario && g._origenSeccion ? g._origenSeccion : g.esPagoGastoFijo ? 'Gastos fijos' : g._esPagoTC ? 'Tarjeta de crédito' : g._esExtraPrestamo ? 'Préstamos' : 'Gastos';
    movs.push({ tipo: g._esAlcancia ? 'alcancia' : 'gasto', fecha: g.fecha, desc: g.desc, monto: -g.monto, fuente, _idx: _idx++, _movId: g.id, _fuenteOrigen: fuente, _origen, _otrasCuentas: null, _secundario: !!g._secundario || !!g._esAlcancia, _origenSeccion: g._origenSeccion || (g._esAlcancia ? 'Alcancía' : ''), _alcOculto: !!g._esAlcancia });
  });

  // 4. Préstamos dados desde esta cuenta
  Deudas.lista('favor').forEach(d => {
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
    // Depósito a la alcancía desde esta cuenta (t.destino==='alcancia'): fila visible,
    // monto oculto, sin "otras cuentas" (la alcancía no es una cuenta navegable) — mismo
    // criterio que ya aplicaba a estos depósitos cuando vivían en S.gastosVar antes del
    // 2026-09-27 (ver docs/alcancia.md §3 y CHANGELOG.md#alcancia).
    const esAlc = t.destino === 'alcancia';
    if (t.origen === fuente) {
      movs.push({
        tipo: esAlc ? 'alcancia' : 'transferencia',
        fecha: t.fecha,
        desc: esAlc ? (t.desc || 'Depósito en alcancía') : 'Transferencia → ' + fuenteLabel(t.destino),
        monto: -t.monto, nota: t.nota, fuente,
        _idx: _idx++, _movId: t.id, _fuenteOrigen: t.origen, _fuenteDestino: t.destino,
        _origen: esAlc ? 'Alcancía' : 'Cuentas · Transferencia',
        _otrasCuentas: esAlc ? null : [{ fuente: t.destino, monto: +t.monto }],
        _secundario: esAlc || !!t._secundario, _origenSeccion: esAlc ? 'Alcancía' : '',
        _alcOculto: esAlc
      });
    }
    if (t.destino === fuente) {
      movs.push({ tipo: 'transferencia', fecha: t.fecha, desc: 'Transferencia ← ' + fuenteLabel(t.origen), monto: +t.monto, nota: t.nota, fuente, _idx: _idx++, _movId: t.id, _fuenteOrigen: t.origen, _fuenteDestino: t.destino, _origen: 'Cuentas · Transferencia', _otrasCuentas: [{ fuente: t.origen, monto: -t.monto }] });
    }
  });

  // 6. Cobros Spotify (+ abonos posteriores de lo pendiente, cada uno como su propia
  // tarjeta — antes quedaban invisibles, fundidos dentro de h.monto del cobro original,
  // ver CHANGELOG.md#spotify). Cada abono puede haber ido a una cuenta distinta a la del
  // cobro original, así que se filtran por su propio `destino`, no por `h.fuente`.
  (S.spotifyHistorial || []).forEach((h, _spIdx) => {
    if (h.tipo === 'pago') return;
    // h.monto acumula el cobro original + todos los abonos ya recibidos (ver
    // confirmarSpResolverPendiente en spotify.js) — hay que restar los abonos para
    // no contar esa misma plata dos veces (una acá, otra en su propia tarjeta de abajo).
    const historialPendTotal = (h.pendienteHistorial || []).reduce((a, ab) => a + (ab.monto || 0), 0);
    const montoOriginalCobro = Math.max(0, (h.monto || 0) - historialPendTotal);
    // Fallback estable si el registro no tiene id (p.ej. historial antiguo, previo
    // a que se empezara a asignar id a cada cobro de Spotify): usa el índice fijo
    // dentro de S.spotifyHistorial en vez de dejar _movId en null.
    if (h.fuente === fuente) {
      movs.push({ tipo: 'ingreso', fecha: h.fecha, desc: 'Cobro Spotify (' + h.nombre + ')', monto: +montoOriginalCobro, fuente, _idx: _idx++, _movId: h.id || ('sp_legacy_' + _spIdx), _origen: 'Spotify', _otrasCuentas: null, _secundario: true, _origenSeccion: 'Spotify' });
    }
    (h.pendienteHistorial || []).forEach(ab => {
      if (ab.destino !== fuente) return;
      movs.push({ tipo: 'ingreso', fecha: ab.fecha, desc: 'Abono pendiente Spotify (' + h.nombre + ')', monto: +ab.monto, fuente, _idx: _idx++, _movId: ab.id, _origen: 'Spotify', _otrasCuentas: null, _secundario: true, _origenSeccion: 'Spotify' });
    });
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

function _legacyGetMovimientosCuenta(tipo) {
  // Custom accounts: 'custom:ID' — delegate to specialised function
  if (tipo && tipo.startsWith('custom:')) return _legacyGetMovimientosCuentaCustom(tipo);
  const movs = [];
  let _idx = 0;
  // Movimientos manuales de entrada/salida (agregar/restar dinero)
  (S.movimientos || []).forEach(m => {
    // Ingreso de Alcancía sin cuenta de origen (propio/regalo/mandado): no movió esta cuenta, así que no
    // es un movimiento de la cuenta y no se lista en su historial (ver alcancia.md §3).
    if (m._esAlcanciaIngreso) return;
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
      const tipoDisplay = m._esAlcanciaIngreso ? 'alcancia' : esApertura ? 'apertura' : esTransferencia ? 'transferencia' : esEntrada ? 'ingreso' : 'salida_manual';
      // Ingreso neto-cero de Alcancía (yo-directo/regalo/mandado/split): alcancia.js suma y resta el mismo
      // monto, así que el saldo de la cuenta NO cambia. `monto` acá es el efecto sobre el saldo (lo usa
      // abrirDetalleMov() en movimientos.js para reconstruir Antes/Después) → 0, no +monto.
      const montoDisplay = m._esAlcanciaIngreso ? 0 : (esApertura) ? +m.monto : esTransferencia ? (esIntercambioSalida ? -m.monto : +m.monto) : esEntrada ? +m.monto : -m.monto;
      let _origen, _otrasCuentas = null;
      if (esApertura) { _origen = 'Saldo inicial'; }
      else if (m._esAlcanciaIngreso) { _origen = 'Alcancía'; } // depósito a la alcancía sin cuenta de origen (yo-directo/regalo/mandado/split): fila visible, monto oculto
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
      movs.push({ tipo: tipoDisplay, fecha: m.fecha, desc: m.desc || (esApertura ? 'Saldo inicial' : esEntrada ? 'Entrada de efectivo' : esTransferencia ? 'Intercambio' : 'Salida manual'), monto: montoDisplay, fuente: m.fuente, _idx: _idx++, _movId: m.id, _fuenteOrigen: m.fuente, _fuenteDestino: m._fuenteDestino || '', _origen, _otrasCuentas, _secundario: m._secundario || !!m._esAlcanciaIngreso, _origenSeccion: m._origenSeccion || (m._esAlcanciaIngreso ? 'Alcancía' : ''), _alcOculto: !!m._esAlcanciaIngreso });
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
    // Depósito a la alcancía desde una cuenta (yo-cuenta / parte propia de un split): antes se
    // saltaba acá y la fila desaparecía del historial. Ahora se muestra, pero con `_alcOculto`
    // para que renderMovsCuenta() pinte el monto oculto (ver CHANGELOG.md#cuentas, 2026-09-19).
    const match = tipo === 'nu'
      ? (g.fuente && g.fuente.startsWith('cajita:'))
      : g.fuente === tipo;
    if (match) {
      const _origen = g._esAlcancia ? 'Alcancía' : g._secundario && g._origenSeccion ? g._origenSeccion : g.esPagoGastoFijo ? 'Gastos fijos' : g._esPagoTC ? 'Tarjeta de crédito' : g._esExtraPrestamo ? 'Préstamos' : /encargo/i.test(g.nota||'') ? 'Encargos' : 'Gastos';
      movs.push({ tipo: g._esAlcancia ? 'alcancia' : 'gasto', fecha: g.fecha, desc: g.desc, monto: -g.monto, cat: g.cat, fuente: g.fuente, nota: g.nota, _idx: _idx++, _movId: g.id, _fuenteOrigen: g.fuente, _origen, _otrasCuentas: null, _secundario: !!g._secundario || !!g._esAlcancia, _origenSeccion: g._origenSeccion || (g._esAlcancia ? 'Alcancía' : ''), _alcOculto: !!g._esAlcancia });
    }
  });
  // Préstamos dados desde esta fuente
  Deudas.lista('favor').forEach(d => {
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
  // NOTA (2026-08-30): el bloque "Mesadas recibidas en esta cuenta" que vivía acá
  // se eliminó — duplicaba cada pago de mesada con destino real. mesada.js ya
  // genera el movimiento espejo real vía _registrarMovSecundarioMesada() (guardado
  // en S.movimientos con _secundario:true), que el loop principal de esta función
  // ya recorre más arriba. Este bloque volvía a sintetizar el mismo pago leyendo
  // directamente S.mesadas, generando un segundo movimiento fantasma sin candado
  // (sin _movId) por cada pago con destino/split real. Ver CHANGELOG.md#mesada.
  // Spotify cobros a personas (no pagos, que ya están en gastosVar como gasto variable)
  // + abonos posteriores de lo pendiente, cada uno como su propia tarjeta — antes quedaban
  // invisibles, fundidos dentro de h.monto del cobro original (ver CHANGELOG.md#spotify).
  // Cada abono puede haber ido a una cuenta distinta a la del cobro original, así que se
  // filtran por su propio `destino`, no por `h.fuente`.
  (S.spotifyHistorial || []).forEach((h, _spIdx) => {
    if (h.tipo === 'pago') return;
    const matchFuente = tipo === 'nu'
      ? (h.fuente && h.fuente.startsWith('cajita:'))
      : h.fuente === tipo;
    // h.monto acumula el cobro original + todos los abonos ya recibidos (ver
    // confirmarSpResolverPendiente en spotify.js) — hay que restar los abonos para
    // no contar esa misma plata dos veces (una acá, otra en su propia tarjeta de abajo).
    const historialPendTotal = (h.pendienteHistorial || []).reduce((a, ab) => a + (ab.monto || 0), 0);
    const montoOriginalCobro = Math.max(0, (h.monto || 0) - historialPendTotal);
    if (matchFuente) {
      // Usar h.id si existe, o fabricar un _movId estable a partir del índice para que el sort
      // funcione igual que los demás movimientos (por timestamp de registro, no por orden de iteración)
      movs.push({ tipo: 'ingreso', fecha: h.fecha, desc: 'Cobro Spotify (' + h.nombre + ')', monto: +montoOriginalCobro, fuente: h.fuente, _idx: _idx++, _movId: h.id || ('sp_legacy_' + _spIdx), _origen: 'Spotify', _otrasCuentas: null, _secundario: true, _origenSeccion: 'Spotify' });
    }
    (h.pendienteHistorial || []).forEach(ab => {
      const abMatch = tipo === 'nu' ? (ab.destino && ab.destino.startsWith('cajita:')) : ab.destino === tipo;
      if (!abMatch) return;
      movs.push({ tipo: 'ingreso', fecha: ab.fecha, desc: 'Abono pendiente Spotify (' + h.nombre + ')', monto: +ab.monto, fuente: ab.destino, _idx: _idx++, _movId: ab.id, _origen: 'Spotify', _otrasCuentas: null, _secundario: true, _origenSeccion: 'Spotify' });
    });
  });
  // Transferencias entre cuentas
  (S.transferencias || []).forEach(t => {
    const estaEnOrigen = tipo === 'nu'
      ? (t.origen && t.origen.startsWith('cajita:'))
      : t.origen === tipo;
    const estaEnDestino = tipo === 'nu'
      ? (t.destino && t.destino.startsWith('cajita:'))
      : t.destino === tipo;
    // Depósito a la alcancía (t.destino==='alcancia'): nunca hace match con estaEnDestino
    // (ninguna cuenta real se llama 'alcancia'), así que solo hace falta el caso "esta
    // cuenta es el origen" — mismo criterio oculto que cuando vivía en S.gastosVar antes
    // del 2026-09-27 (ver docs/alcancia.md §3 y CHANGELOG.md#alcancia).
    const esAlc = t.destino === 'alcancia';
    if (estaEnOrigen) {
      movs.push({
        tipo: esAlc ? 'alcancia' : 'transferencia',
        fecha: t.fecha,
        desc: esAlc ? (t.desc || 'Depósito en alcancía') : 'Transferencia → ' + fuenteLabel(t.destino),
        monto: -t.monto, nota: t.nota, fuente: t.origen,
        _idx: _idx++, _movId: t.id, _fuenteOrigen: t.origen, _fuenteDestino: t.destino,
        _origen: esAlc ? 'Alcancía' : 'Cuentas · Transferencia',
        _otrasCuentas: esAlc ? null : [{fuente:t.destino, monto:+t.monto}],
        _secundario: esAlc || !!t._secundario, _origenSeccion: esAlc ? 'Alcancía' : '',
        _alcOculto: esAlc
      });
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
