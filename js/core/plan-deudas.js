/* ================================================================
   PLAN DE DEUDAS — js/core/plan-deudas.js   (cálculo PURO: sin DOM, sin `window`, sin `S`; corre igual en Node)
   ================================================================
   P2 (costo de la deuda) y P3 (plan de salida) del documento de mejoras. La app no simula al banco: la tasa E.A. es OPCIONAL por
   deuda; sin ella el costo no se calcula (se muestra «sin tasa») y el plan igual funciona por saldos.

   Una deuda: { id, nombre, tipo: 'tarjeta'|'persona', saldo, tasaEA? (en %, p. ej. 28) }.  Solo deudas PROPIAS (lo ajeno no entra).

     · PlanDeudas.tasaMensual(ea)          E.A. → mensual: (1 + ea)^(1/12) − 1
     · PlanDeudas.costoMensual(saldo, ea)  intereses de un mes sobre el saldo (0 sin tasa)
     · PlanDeudas.ordenar(deudas, estrategia)   'avalancha' = la más cara primero (con tasa; las que no tienen, al final por saldo)
                                                'bola' = la más pequeña primero (cierra deudas rápido, motiva)
     · PlanDeudas.construir({ deudas, balancePromedio, estrategia, metaMeses })
         → { orden, saldoTotal, costoMensualTotal, pagoMensual, mesesLibre (n | null), baja (¿con este ritmo la deuda baja?),
             necesitasLiberar ($/mes para quedar libre en `metaMeses` si no baja), meta }
       `balancePromedio` = lo que sobra al mes en promedio (ingresos − gastos de los últimos meses completos). Se supone que TODO ese
       sobrante se destina a las deudas, en el orden elegido, y que lo que se libera de una deuda pasa a la siguiente («efecto cascada»).
   Es una estimación para decidir, no una promesa: no modela cuotas mínimas, comisiones ni cambios de tasa. No es asesoría financiera.
   ================================================================ */
const PlanDeudas = (() => {
  const MAX_MESES = 600; // 50 años: más que eso se trata como «no baja»

  const tasaMensual = ea => (ea > 0 ? Math.pow(1 + ea / 100, 1 / 12) - 1 : 0);
  const costoMensual = (saldo, ea) => Math.max(0, saldo || 0) * tasaMensual(ea);

  function ordenar(deudas, estrategia) {
    const l = (deudas || []).filter(d => d && d.saldo > 0).slice();
    if (estrategia === 'bola') return l.sort((a, b) => a.saldo - b.saldo || String(a.nombre).localeCompare(String(b.nombre)));
    // avalancha: tasa descendente; sin tasa (0 / null) quedan al final, entre ellas por saldo menor
    return l.sort((a, b) => (b.tasaEA || 0) - (a.tasaEA || 0) || a.saldo - b.saldo || String(a.nombre).localeCompare(String(b.nombre)));
  }

  // Simula mes a mes: se acumulan intereses, se paga `pago` empezando por la primera deuda del orden y lo que sobra pasa a la siguiente.
  // → meses hasta saldar todo, o null si no se sale en MAX_MESES (el pago no supera los intereses).
  function _meses(orden, pago) {
    let saldos = orden.map(d => d.saldo);
    const tasas = orden.map(d => tasaMensual(d.tasaEA));
    for (let mes = 1; mes <= MAX_MESES; mes++) {
      saldos = saldos.map((s, i) => s * (1 + tasas[i]));
      let resto = pago;
      for (let i = 0; i < saldos.length && resto > 0; i++) { const p = Math.min(saldos[i], resto); saldos[i] -= p; resto -= p; }
      if (saldos.every(s => s <= 0.5)) return mes;
    }
    return null;
  }

  function construir(o) {
    const meta = o.metaMeses || 24;
    const orden = ordenar(o.deudas, o.estrategia).map(d => Object.assign({}, d, { costoMensual: costoMensual(d.saldo, d.tasaEA) }));
    const saldoTotal = orden.reduce((a, d) => a + d.saldo, 0);
    const costoMensualTotal = orden.reduce((a, d) => a + d.costoMensual, 0);
    const pago = Math.max(0, o.balancePromedio || 0);
    const res = { orden, saldoTotal, costoMensualTotal, pagoMensual: pago, mesesLibre: null, baja: false, necesitasLiberar: 0, meta, estrategia: o.estrategia === 'bola' ? 'bola' : 'avalancha' };
    if (!orden.length) { res.mesesLibre = 0; res.baja = true; return res; }
    res.mesesLibre = pago > 0 ? _meses(orden, pago) : null;
    res.baja = res.mesesLibre !== null;
    if (!res.baja) {
      // Pago mensual constante que salda todo en `meta` meses (cuota de un préstamo a la tasa ponderada): solo informativo, se redondea hacia arriba a $1.000.
      const r = saldoTotal > 0 ? costoMensualTotal / saldoTotal : 0;
      const cuota = r > 0 ? saldoTotal * r / (1 - Math.pow(1 + r, -meta)) : saldoTotal / meta;
      res.necesitasLiberar = Math.ceil(cuota / 1000) * 1000;
    }
    return res;
  }

  // «tu cajita rinde 9 % y tu tarjeta cuesta 28 %»: ¿conviene pagar la deuda con la plata que rinde menos que lo que cuesta?
  // → { conviene, diferenciaPts } o null si falta alguna de las dos tasas.
  function pagarConviene(tasaDeudaEA, rendimientoEA) {
    if (!(tasaDeudaEA > 0) || !(rendimientoEA >= 0)) return null;
    return { conviene: tasaDeudaEA > rendimientoEA, diferenciaPts: tasaDeudaEA - rendimientoEA };
  }

  // «Apartar $X»: ¿cuánto de la deuda se puede pagar YA con plata que tienes, sin quedarte por debajo del fondo de emergencia?
  //   o.deuda: { saldo, tasaEA }   o.disponible: plata usable ya (cuentas + cajitas + CDT vencidos, menos plata ajena; nunca la Alcancía)
  //   o.gastoTipico y o.mesesReserva: la reserva que se respeta = gastoTipico × mesesReserva   o.rendimientoEA: lo que rinde esa plata (opcional)
  // → { monto (múltiplo de 1.000), total (¿salda la deuda?), reserva, ahorroMensual } o null si no aplica: sin tasa, sin gasto típico (no
  // hay con qué medir la reserva), la plata rinde igual o más de lo que cuesta la deuda, o no sobra nada sobre la reserva.
  // Pagar con efectivo NO cambia la liquidez neta (baja el efectivo y la deuda a la vez): lo que se gana son los intereses.
  function pagoPosible(o) {
    const d = o && o.deuda;
    if (!d || !(d.saldo > 0) || !(d.tasaEA > 0) || !(o.gastoTipico > 0)) return null;
    const rend = o.rendimientoEA > 0 ? o.rendimientoEA : 0;
    if (d.tasaEA <= rend) return null;
    const reserva = o.gastoTipico * (o.mesesReserva || 0);
    const sobra = (o.disponible || 0) - reserva;
    const monto = Math.floor(Math.min(d.saldo, sobra) / 1000) * 1000;
    if (!(monto > 0)) return null;
    const ahorroMensual = Math.max(0, costoMensual(monto, d.tasaEA) - costoMensual(monto, rend));
    return { monto, total: monto >= d.saldo, reserva, ahorroMensual };
  }

  return { tasaMensual, costoMensual, ordenar, construir, pagarConviene, pagoPosible };
})();
if (typeof window !== 'undefined') window.PlanDeudas = PlanDeudas;
if (typeof module !== 'undefined' && module.exports) module.exports = PlanDeudas;
