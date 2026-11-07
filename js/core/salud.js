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
     mesesReferencia   cuántos meses completos con datos (gasto o ingreso) hay detrás de los «típicos» (opcional)
     diasDeUso         días desde el primer punto del historial de patrimonio (null si no hay; opcional)
     sinDatos          true si no hay nada que evaluar todavía
   «Base» (tieneBase): hay con qué evaluar ahorro, flujo y tendencia. Sin base (usuario nuevo) se evalúa solo lo que no necesita historial
   —deudas, liquidez negativa, patrimonio negativo— y lo demás se dice «sin evaluar»: la falta de registros no es una situación negativa.
   Los límites salen de UMBRALES (js/core/umbrales.js): se pasan como segundo argumento o se leen del global/CommonJS.
   ================================================================ */
const Salud = (() => {
  const _R = () => (typeof Reglas !== 'undefined' ? Reglas : require('./reglas.js'));
  const _U = () => (typeof UMBRALES !== 'undefined' ? UMBRALES : (typeof require === 'function' ? require('./umbrales.js') : null));
  const NIVELES = ['verde', 'ambar', 'rojo']; // de menos a más grave: 'sin' (sin datos) queda fuera del orden
  const peor = (a, b) => NIVELES.indexOf(a) >= NIVELES.indexOf(b) ? a : b;

  // ¿Hay base para juzgar el ahorro, el flujo y la tendencia? Sí con una tendencia de patrimonio (≥ 30 días de historial), con 2 meses
  // completos con datos, o con 1 mes completo y 30 días de uso. Un solo mes «completo» que en realidad fueron tres días de uso (se empezó a
  // usar la app el 29) NO alcanza: su gasto típico sería ruido. Sin `mesesReferencia` (las pruebas y quien arma `m` a mano) se infiere de
  // si hay gasto típico o balances. `diasDeUso` null = no se sabe: no bloquea.
  function tieneBase(m, umbrales) {
    const H = ((umbrales || _U()).salud || {}).historial || { mesesCompletos: 2, minDias: 30 };
    if (m.tendencia) return true;
    const meses = typeof m.mesesReferencia === 'number' ? m.mesesReferencia : ((m.gastoTipico > 0 || (m.balances || []).length) ? 1 : 0);
    if (meses >= H.mesesCompletos) return true;
    if (meses >= 1) return m.diasDeUso == null || m.diasDeUso >= H.minDias;
    return false;
  }

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

  // Meses completos SEGUIDOS (los más recientes) en que el patrimonio bajó, con los cierres mensuales (`S.patrimonioCierres`:
  // { 'AAAA-MM': { valor|valorVisible, base } }). La variación de un mes es cierre − cierre del mes anterior − `base` (aperturas del
  // mes: saldos iniciales que no son crecimiento). `mesActual` ('AAAA-MM') no entra: aún no cerró. Una baja menor al ruido
  // (`ruidoGastoPct` % del gasto típico) no cuenta y corta la racha, igual que un mes sin cierre anterior para comparar.
  // → { n, total (suma de las variaciones, negativa), desde ('AAAA-MM' del primer mes de la racha) } con n = 0 si no hay racha.
  function mesesCayendo(cierres, mesActual, opts) {
    const U = ((opts && opts.umbrales) || _U()).salud.patrimonioCayendo;
    const c = cierres || {};
    const val = x => (typeof x.valorVisible === 'number' ? x.valorVisible : (x.valor || 0));
    const ruido = Math.max(1, ((opts && opts.gastoTipico) || 0) * U.ruidoGastoPct / 100);
    const antes = k => { const [a, m] = k.split('-').map(Number); return m === 1 ? (a - 1) + '-12' : a + '-' + String(m - 1).padStart(2, '0'); };
    let k = antes(mesActual), n = 0, total = 0, desde = null;
    while (c[k] && c[antes(k)]) {
      const delta = val(c[k]) - val(c[antes(k)]) - (c[k].base || 0);
      if (!(delta < -ruido)) break;
      n++; total += delta; desde = k; k = antes(k);
    }
    return { n, total, desde };
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
    const sb = !tieneBase(m, U);
    const out = [];

    // 1) Liquidez: meses de gasto cubiertos con la liquidez NETA (lo que se puede usar ya, después de deudas).
    {
      let nivel = 'sin', texto = 'Registra un mes completo de gastos para medirla', valor = null;
      if (m.liquidezNeta != null && m.liquidezNeta <= 0 && (m.deudaPropia > 0 || m.mesesCubiertos != null || m.activosLiquidos > 0)) {
        nivel = 'rojo'; texto = 'Tus deudas superan tu plata disponible'; valor = 0;
      } else if (sb && m.mesesCubiertos != null) {
        texto = 'Aún no hay historial para medirla'; // sin base el gasto típico es ruido: no se mide
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
      const b = sb ? [] : (m.balances || []).slice(0, P.flujo.meses);
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

  // Estado global. Prioridad: crisis > presión > atención > inicial > creciendo > estable. null si no hay nada que evaluar.
  //   crisis    patrimonio < 0 y (liquidez neta ≤ 0 o el último mes cerró en déficit)
  //   presión   liquidez neta ≤ 0 con patrimonio positivo, o 2+ meses seguidos de déficit con menos de 1 mes de reservas
  //   atención  patrimonio negativo (aunque mejore: no se celebra), patrimonio cayendo, o reservas de 1 a 3 meses, o déficit este mes
  //   inicial   sin base (ver tieneBase) y sin deudas ni patrimonio negativo: neutro, no se afirma ni «estable» ni un problema
  //   creciendo patrimonio subiendo y balance ≥ 0 en 2 de los últimos 3 meses
  //   estable   patrimonio plano (±3 %) y reservas ≥ 3 meses; lo demás con datos, también
  function estado(m, umbrales) {
    const U = umbrales || _U();
    if (m.sinDatos) return null;
    const dir = _direccion(m.tendencia, m, U.salud.pilares.tendencia);
    const sb = !tieneBase(m, U);
    // Sin base no se juzga el flujo: un «déficit» de los primeros días puede ser solo no haber anotado los ingresos.
    const ultimoDeficit = !sb && (m.balances || [])[0] < 0;
    const rachaMeses = sb ? 0 : ((m.racha && m.racha.meses) || 0);
    const reservas = sb ? null : m.mesesCubiertos;
    let id;
    if (m.patrimonio < 0 && (m.liquidezNeta <= 0 || ultimoDeficit)) id = 'crisis';
    else if ((m.patrimonio > 0 && m.liquidezNeta <= 0) || (rachaMeses >= U.salud.rachaDeficitMeses.aviso && reservas != null && reservas < U.runway.critico)) id = 'presion';
    else if (m.patrimonio < 0) id = 'atencion';
    // Usuario nuevo, sin deudas ni patrimonio negativo: no hay con qué evaluar. Ni «Estable» (afirmaría algo que no sabemos) ni «Atención».
    else if (sb) id = 'inicial';
    else if (dir === 'cae' || (reservas != null && reservas < U.runway.atencion) || m.deficitMesActual) id = 'atencion';
    else if (dir === 'sube' && (m.balances || []).slice(0, 3).filter(x => x >= 0).length >= 2) id = 'creciendo';
    else id = 'estable';
    return Object.assign({ id }, ESTADOS[id], { acciones: id === 'presion' || id === 'crisis' ? accionesUrgentes(m) : [] });
  }

  const ESTADOS = {
    creciendo: { etiqueta: 'Creciendo', tono: 'verde', frase: 'Tu patrimonio va en aumento y tus cuentas cierran en positivo.' },
    estable:   { etiqueta: 'Estable',   tono: 'verde', frase: 'Tus finanzas están en equilibrio.' },
    inicial:   { etiqueta: 'Empezando', tono: 'neutro', frase: 'Aún no hay historial suficiente para evaluar tus finanzas. Sigue registrando tus movimientos.' },
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

  // B5 — frase-resumen bajo la gráfica de patrimonio. delta: cambio real del patrimonio en la ventana; balance: suma de los balances
  // (ingresos − gastos) de los meses que cubre. Dice QUÉ pasó y, si los datos lo sostienen, la causa principal.
  function fraseTendencia(delta, dias, balance, base) {
    if (delta == null || !isFinite(delta) || !(dias > 0)) return '';
    const plano = Math.abs(delta) < Math.max(1, Math.abs(base || 0) * 0.005);
    const periodo = dias >= 60 ? 'los últimos ' + Math.round(dias / 30) + ' meses' : 'los últimos ' + dias + ' días';
    if (plano) return 'Tu patrimonio se mantuvo estable en ' + periodo + '.';
    const sube = delta > 0;
    let f = 'Tu patrimonio ' + (sube ? 'subió ' : 'bajó ') + _monto(Math.abs(delta)) + ' en ' + periodo + '.';
    if (balance != null && isFinite(balance) && Math.abs(balance) >= 1) {
      if (!sube && balance < 0) f += ' La causa principal: gastaste ' + _monto(-balance) + ' más de lo que ingresó.';
      else if (sube && balance > 0) f += ' Se explica por ingresos ' + _monto(balance) + ' por encima de tus gastos.';
      else if (!sube && balance >= 0) f += ' Tus ingresos cubrieron los gastos, así que revisa deudas, retiros o valores que cambiaron.';
      else f += ' Subió aunque los gastos superaron a los ingresos: algo más (rendimientos, valor de bienes, deuda que bajó) lo compensó.';
    }
    return f;
  }

  // P8 — simulador «¿y si…?». Recalcula con las MISMAS métricas de la situación (`m`, de _situacion()) sin tocar nada guardado.
  //   ajustes: { gastoPct (0–50: gastar ese % menos), ingresoExtra ($ al mes), pagoDeuda ($ de una vez a la deuda propia) }
  //   m.costoDeuda: intereses mensuales de la deuda propia con tasa conocida (0 si no hay).
  // → { balance, balanceBase, mejoraMensual, gastoTipico, mesesCubiertos, deudaPropia, mesesLibre (n | null), ahorroIntereses }
  // Pagar deuda con efectivo NO cambia la liquidez NETA (baja el efectivo y la deuda a la vez), así que las reservas no se mueven por eso:
  // el beneficio es menos deuda e intereses. La simulación lo dice tal cual.
  function simular(m, ajustes) {
    const a = ajustes || {};
    const gastoBase = m.gastoTipico || 0, ingresoBase = m.ingresoTipico || 0;
    const gasto = gastoBase * (1 - Math.min(50, Math.max(0, a.gastoPct || 0)) / 100);
    const ingreso = ingresoBase + Math.max(0, a.ingresoExtra || 0);
    const balance = ingreso - gasto, balanceBase = ingresoBase - gastoBase;
    const deuda0 = m.deudaPropia || 0;
    const pago = Math.min(Math.max(0, a.pagoDeuda || 0), deuda0);
    const deuda = deuda0 - pago;
    return {
      balance, balanceBase, mejoraMensual: balance - balanceBase, gastoTipico: gasto,
      mesesCubiertos: gasto > 0 && m.liquidezNeta > 0 ? m.liquidezNeta / gasto : null,
      deudaPropia: deuda,
      mesesLibre: deuda <= 0 ? 0 : balance > 0 ? Math.ceil(deuda / balance) : null,
      ahorroIntereses: deuda0 > 0 ? (m.costoDeuda || 0) * pago / deuda0 : 0,
    };
  }

  // Puntaje 0–100 y consejos tipados. `e`: métricas ya calculadas por inicio.js (calcHealthScore), ver el cuerpo para los campos.
  function puntaje(e){
  const R = _R(), U0 = _U();
  const fmt = e.fmt || (n => String(n));
  const { patrimonio, gastosMes, deudaTC, ingresoRef, liq } = e;
  // Sin base (usuario nuevo, ver tieneBase) no se concluye nada de ahorro, flujo ni tendencia: el «gasto típico» sería de tres días de uso y
  // el «déficit» solo la falta de ingresos anotados. Esas medidas se anulan; lo que no necesita historial (deudas, liquidez negativa,
  // lo prestado) se evalúa igual.
  const sinBase = !!e.sinBase;
  const gastoRef = sinBase ? 0 : e.gastoRef, ingresoTipico = sinBase ? 0 : e.ingresoTipico, racha = sinBase ? { meses: 0 } : e.racha;
  let score = 50;
  // Cada consejo lleva su TIPO explícito (no se deduce del texto):
  //   ok         → algo ya cumplido o bien hecho (check verde)
  //   alerta     → importante, hay que atenderlo (rojo, advertencia)
  //   aviso      → conviene mirarlo (ámbar, advertencia)
  //   sugerencia → oportunidad o tarea pendiente, no un logro (neutro, ícono de información); `ir` = pantalla donde se resuelve
  const consejos = [];
  const add = (texto, tipo, ir, id) => { consejos.push({ texto, tipo, ir: ir || '', id: id || '' }); }; // `id`: solo para los que la interfaz trata aparte (p. ej. 'registro')

  // ── Cálculos base ────────────────────────────────────────────────────
  // Patrimonio VISIBLE (sin alcancía) — mismo criterio que renderProyeccion().
  // El riesgo real acá es bajo: `patrimonio` solo se usa como gate booleano
  // (tieneAlgo) y en el ratio deudaTC/patrimonio cuando no hay ingresos del
  // mes registrados (líneas más abajo) — nunca se muestra el monto en pesos,
  // a diferencia de la Proyección financiera. Aun así, restarla acá evita
  // cualquier filtración indirecta (ej. un depósito grande a la alcancía
  // haciendo que "tieneAlgo" pase de false a true, o cambiando qué tip
  // aparece) y mantiene el mismo principio en toda la app: mientras esté
  // tapada, es como si esa plata no existiera para nada visible al usuario.
  // Patrimonio VISIBLE (sin alcancía): una sola definición en core-state.js (calcPatrimonioVisible), la misma del hero, el historial
  // y la Proyección. Resta TODAS las deudas (tarjetas, «Yo debo», plata ajena), así que ya no hay que corregirlo aquí.




  // ── Rendimiento de CDTs generado este mes (Opción 2: patrimonio real) ──
  // Es plata que el patrimonio total ya ganó este mes, pero sigue bloqueada
  // dentro del CDT — NO es efectivo disponible, así que NO se suma a ingresosMes
  // (que mide flujo de caja real para los ratios de deuda/gasto).
  // Se expone aparte para que la app "sepa" que ese rendimiento existe.

  // ── Liquidez real: una sola definición en core-state.js (calcLiquidez) ─────
  // Suma lo que se puede usar ya (cajitas, Nequi, Efectivo, cuentas propias) y resta lo que no es tuyo o ya debes: la tarjeta
  // propia, lo que debes a personas (aunque no haya fecha de pago: entre amigos casi nunca la hay, y es plata que te pueden
  // pedir en cualquier momento) y la plata ajena que guardas. NO suma los CDTs (bloqueados) ni lo que te deben (sin fecha
  // cierta no es plata disponible). Ver el bloque «PATRIMONIO Y LIQUIDEZ» de core-state.js.
  const liquidoReal = liq.neta;
  const cdtVal = liq.cdts;
  // patrimonio total sí incluye CDTs para otros cálculos
  const liquidoConCDTs = liq.conCDTs;

  // ── Plata prestada a otros ────────────────────────────────────────────
  const prest = liq.meDeben;

  // ── Hay datos suficientes para evaluar? ───────────────────────────────
  // Cualquier activo o deuda cuenta como dato, también las deudas con personas y la plata ajena: antes solo contaban un patrimonio
  // positivo, lo prestado, la tarjeta o los gastos del mes, y quien solo debía («Yo debo») veía «Registra más datos» justo cuando su
  // situación era más delicada.
  const tieneAlgo = patrimonio !== 0 || prest > 0 || deudaTC > 0 || liq.yoDebo > 0 || liq.ajeno > 0 || liq.libre !== 0 || liq.cdts > 0 || gastosMes > 0;
  const U = U0.salud;

  // a) Fondo de emergencia: liquidez real vs gasto mensual TÍPICO
  // Se usa liquidoReal (sin CDTs sin vencer) — un CDT bloqueado no cubre una emergencia.
  // El gasto de referencia es el promedio de los últimos meses COMPLETOS con datos (Periodo.gastoPromedioPrevio), no el gasto del mes
  // en curso: a los 2 días de empezar el mes apenas hay gastos, y «reservas / gastos del mes» salía en decenas de meses y regalaba +20
  // puntos que se iban cayendo a medida que pasaba el mes. Sin ningún mes anterior con gastos todavía no hay con qué medir.
  const mesesCubiertos = R.mesesCubiertos(liquidoReal, gastoRef); // «runway»: cuántos meses aguantas sin ingresos (null si no hay gasto típico)
  let avisoDeudaTC = false; // si la deuda de tarjeta ya se avisó por liquidez negativa, (b) no la penaliza otra vez
  if(liquidoReal > 0){
    if(gastoRef > 0){
      if(mesesCubiertos >= U.fondoMeses.completo) score += 20;
      else if(mesesCubiertos >= U.fondoMeses.minimo) score += 10;
      else { score -= 5; add(`Tus reservas cubren menos de ${U.fondoMeses.minimo} meses de gastos.`,'aviso','cuentas'); }
    }
  } else if(liquidoReal < 0){
    // Debes más de lo que tienes disponible. Se nombra QUÉ deuda es. Si lo cubren CDTs sin vencer es menos grave (la plata existe, solo está
    // bloqueada). Antes un CDT mandaba este caso a «tus ahorros están en CDTs» y el consejo no decía que la liquidez era negativa.
    const quien = (liq.yoDebo <= 0 && liq.ajeno <= 0) ? 'Tu deuda en tarjetas supera'
      : (liq.tcPropia <= 0 && liq.ajeno <= 0) ? 'Lo que debes a personas supera'
      : 'Tus deudas y la plata ajena que guardas superan';
    avisoDeudaTC = liq.tcPropia > 0;
    // El botón lleva a donde se paga esa deuda: la tarjeta, la pestaña «Yo debo» o (si es mezcla) Préstamos.
    const irDeuda = (liq.yoDebo <= 0 && liq.ajeno <= 0) ? 'tarjetas' : (liq.tcPropia <= 0 && liq.ajeno <= 0) ? 'prestamos/yo-debo' : 'prestamos';
    if(liquidoConCDTs >= 0){ score -= 8; add(`${quien} la plata que tienes disponible; lo que cubre la diferencia está en tus CDTs.`,'aviso',irDeuda); }
    else { score -= 15; add(`${quien} la plata que tienes disponible.`,'alerta',irDeuda); }
  } else if((gastosMes > 0 || gastoRef > 0) && liquidoConCDTs > 0){
    // Liquidez justo en cero y solo CDTs sin vencer: el ahorro existe pero no está libre.
    score -= 8; add('Tu liquidez disponible es muy baja — tus ahorros están en CDTs, no en cuentas libres.','aviso','cuentas');
  }

  // b) Deuda de tarjetas de crédito vs ingresos (ratio de endeudamiento TC)
  if(deudaTC > 0 && ingresoRef > 0){
    const ratioTC = deudaTC / ingresoRef;
    if(ratioTC > U.tcSobreIngreso.critico){ score -= 15; add(`Tu deuda en TC supera ${U.tcSobreIngreso.critico} meses de ingresos — prioriza pagarla.`,'alerta','tarjetas'); }
    else if(ratioTC > U.tcSobreIngreso.alto){ score -= 8; add('Tu deuda en tarjetas es alta respecto a tus ingresos.','aviso','tarjetas'); }
    // Hasta 1,5 meses de ingreso es una deuda manejable: no suma ni resta. Antes SUMABA +5 por tenerla (incentivo invertido: quien
    // no debe nada recibía 0). El punto a favor es de quien no tiene deudas propias, más abajo.
  } else if(deudaTC > 0 && ingresoRef === 0){
    // Tiene deuda TC pero no registra ingresos — verificar vs patrimonio
    if(patrimonio > 0 && deudaTC / patrimonio > 0.4){
      score -= 10; add('Tu deuda en tarjetas es alta — considera pagarla con tus ahorros.','aviso','tarjetas');
    } else if(patrimonio <= 0 && !avisoDeudaTC){
      // Sin la guarda se penalizaba dos veces la MISMA deuda (−15 aquí y −15 por liquidez negativa, con dos alertas casi iguales).
      score -= 15; add('Tienes deuda en tarjetas y tu patrimonio no la cubre — prioriza pagarla.','alerta','tarjetas');
    }
  }
  // Sin deudas propias y con plata disponible: lo único que se premia en endeudamiento.
  if(deudaTC <= 0 && liq.yoDebo <= 0 && liq.ajeno <= 0 && liquidoReal > 0) score += 5;

  // c) Plata prestada a otros (riesgo de incobrabilidad / inmovilización)
  // Penalización escalonada por ratio — independiente del bonus de CDTs
  let ratioPrest = 0;
  if(prest > 0){
    if(liquidoReal <= 0){
      // Sin liquidez libre y con plata prestada sin cobrar — caso crítico (la liquidez puede estar en cero por lo prestado o por lo que debes)
      score -= 15; add('No te queda liquidez libre y tienes plata prestada sin cobrar — no tienes nada disponible para emergencias.','alerta','prestamos/me-deben');
      ratioPrest = Infinity;
    } else {
      ratioPrest = prest / liquidoReal;
      if(ratioPrest > U.prestadoSobreLiquidez.vulnerable){
        score -= 18; add('Tienes más del doble de tu liquidez prestada — tu situación financiera es muy vulnerable.','alerta','prestamos/me-deben');
      } else if(ratioPrest > U.prestadoSobreLiquidez.comprometido){
        score -= 13; add('Tienes más plata prestada que tu liquidez disponible — queda poco para emergencias.','alerta','prestamos/me-deben');
      } else if(ratioPrest > U.prestadoSobreLiquidez.vigilar){
        score -= 8; add('Tienes mucho dinero prestado sin cobrar (>40% de tu liquidez).','aviso','prestamos/me-deben');
      }
      // ratioPrest <= 0.4: situación sana, no penalizar
    }
  }

  // d) Ritmo de gasto vs ingreso (disciplina de gasto) y h) racha de déficit.
  // d) se mide con lo TÍPICO de los meses completos (gasto típico ÷ ingreso típico), no con «gastado hasta hoy ÷ ingreso del mes
  // completo»: a los 3 días eso daba ≈ 0,05 y regalaba +10 puntos que se iban cayendo a medida que avanzaba el mes (el mismo defecto
  // que ya se corrigió en el fondo de emergencia, a). Lo único que el mes en curso puede decir sin riesgo de parcialidad es que YA se
  // pasó: si lo gastado hasta hoy supera el ingreso de referencia, el mes cierra en déficit pase lo que pase.
  // h) Tendencia: meses completos SEGUIDOS cerrando en déficit. Es la dirección que la foto de a)–c) no ve: alguien puede llevar meses
  // gastando más de lo que entra y seguir en «Regular» porque aún tiene colchón. Un fondo sólido (≥ 6 meses) la absorbe y no puntúa.
  const rachaMeses = R.rachaDeficitRelevante(racha, ingresoTipico, mesesCubiertos, U0);
  let enDeficit = false;
  if(rachaMeses >= U.rachaDeficitMeses.alerta){
    score -= 15; enDeficit = true; add(`Llevas ${rachaMeses} meses seguidos gastando más de lo que ingresas.`,'alerta','gastos');
  } else if(rachaMeses >= U.rachaDeficitMeses.aviso){
    score -= 8; enDeficit = true; add(`Llevas ${rachaMeses} meses seguidos gastando más de lo que ingresas.`,'aviso','gastos');
  }
  if(ingresoTipico > 0 && gastoRef > 0){
    const ratioGasto = gastoRef / ingresoTipico;
    if(ratioGasto <= U.gastoSobreIngreso.sano) score += 10;
    else if(ratioGasto <= U.gastoSobreIngreso.ajustado) score += 5;
    else if(ratioGasto > U.gastoSobreIngreso.deficit && !enDeficit){ score -= 10; enDeficit = true; add('Vienes gastando más de lo que ingresas.','aviso','gastos'); }
  }
  // El mes en curso solo se juzga con base: en el primer mes un ingreso aún sin anotar haría ver un «déficit» que no existe.
  if(!sinBase && !enDeficit && ingresoRef > 0 && gastosMes > ingresoRef){ score -= 10; add('Por ahora estás gastando más de lo que ingresas.','aviso','gastos'); }

  // e) CDTs activos (ahorro estructurado)
  // Si el riesgo de prestado es alto (ratio > 1) o la liquidez es negativa, el CDT no compensa — bonus reducido a +3.
  // Solo cuando la situación de liquidez es sana merece el bonus completo.
  const cdts = e.cdtsActivos || 0;
  if(cdts >= 1){
    // El bono es proporcional al peso del CDT en tu plata (cuentas libres + CDTs): llega completo cuando el CDT es el 10 % o más;
    // un CDT de $1.000 dentro de $80.000 ya no regala los 10 puntos.
    const cdtBonusMax = (ratioPrest > U.prestadoSobreLiquidez.comprometido || liquidoReal < 0) ? 3 : 10;
    const pesoCDT = liquidoConCDTs > 0 ? cdtVal / liquidoConCDTs : 0;
    score += Math.round(cdtBonusMax * Math.min(1, pesoCDT / U.cdtPesoCompleto));
  } else if(tieneAlgo && gastoRef > 0 && deudaTC <= 0 && liq.yoDebo <= 0 && ratioPrest <= U.prestadoSobreLiquidez.comprometido){
    // Un CDT bloquea la plata (no cuenta como liquidez), así que solo se sugiere lo que SOBRA por encima del fondo mínimo: sin deudas (ni de
    // tarjeta ni con personas: pagarlas rinde más que cualquier CDT), sin tener prestado más de lo que tienes disponible, y con gasto típico
    // medido (sin él no se sabe cuánto es «de sobra»). Antes se sugería también sin gasto típico, y poner en CDT parte de la reserva la dejaba
    // por debajo de 3 meses y disparaba el aviso contrario. Lleva a la cuenta Nu, donde se crea el CDT.
    const excedente = liquidoReal - gastoRef * U.fondoMeses.minimo;
    if(excedente >= gastoRef * U.cdtExcedenteMeses)
      add(`Te sobran ${fmt(Math.floor(excedente))} por encima de tus ${U.fondoMeses.minimo} meses de reserva: podrías ponerlos en un CDT para que crezcan.`,'sugerencia','cuentas/nu');
  }

  // f) y g) (≥ 2 gastos fijos configurados: +5; una sola categoría en gastos variables: −5) ya NO puntúan: miden cómo usas la app, no
  // tu salud financiera. Tampoco se aconseja ya «registra las categorías de tus gastos»: eso es configurar la app (Configuración), no mejorar
  // tus finanzas; lo que sí aporta es registrar los gastos, y eso lo cubre el consejo unificado de más abajo.

  // Una compra grande reciente (marcada por el usuario) que dejó las reservas bajas: no resta puntos propios (la liquidez baja y el
  // runway ya lo cuentan), pero se nombra para que la causa no sea un misterio y se sepa qué hacer: reconstruir el fondo.
  const _cgRecientes = e.comprasGrandes || [];
  if(_cgRecientes.length && (mesesCubiertos === null || mesesCubiertos < U.fondoMeses.completo)){
    const _mayor = _cgRecientes.slice().sort((a, b) => (b.monto||0) - (a.monto||0))[0];
    add(`Tu compra grande reciente (${_mayor.desc || 'sin nombre'}, ${fmt(_mayor.monto||0)}) pesa en tus reservas: antes de otro gasto grande, reconstruir tu fondo es la prioridad.`,'sugerencia','cuentas');
  }

  // Sin ingresos registrados no se puede evaluar la disciplina de gasto ni el endeudamiento (los ratios b y d se saltan): no puede salir
  // «Excelente». Y sin gasto típico (o sin base) no se puede medir cuántos meses cubren tus reservas. Las dos carencias se dicen con UN
  // solo consejo, corto, que lleva a donde falta el dato: los ingresos (Análisis) o, si ya hay, los gastos.
  const sinIngresos = ingresoRef <= 0 && gastosMes > 0;
  if(sinIngresos) score = Math.min(score, 74);
  const sinHistorial = tieneAlgo && (sinBase || (liquidoReal > 0 && gastoRef <= 0));
  if(sinIngresos || sinHistorial){
    // El texto no acusa lo que no falta: si ya hay ingresos, se pide seguir registrando; si no hay ninguno, se piden.
    add(ingresoRef <= 0 ? 'Registra tus ingresos y gastos para una evaluación más precisa.' : 'Sigue registrando tus ingresos y gastos: con un mes completo la evaluación será más precisa.','sugerencia', ingresoRef <= 0 ? 'analisis/ingresos' : 'gastos', 'registro');
  }
  score = Math.max(0, Math.min(100, score));
  if(!consejos.length){
    // Sin alertas ni tareas pendientes: se dice, sin inventar una recomendación genérica.
    if(score >= 80) add('¡Excelente! Tus finanzas están muy bien.','ok');
    else if(score >= 60) add('Sin alertas por ahora. Sigue así.','ok');
    else if(tieneAlgo) add('Hay espacio para mejorar: revisa tus gastos y ahorros para subir tu puntaje.','sugerencia','gastos');
    else add('Registra más movimientos para un análisis más preciso.','sugerencia');
  }
  // Lo urgente primero y las sugerencias suaves después (el orden es estable dentro de cada tipo).
  const ORDEN = { alerta: 0, aviso: 1, sugerencia: 2, ok: 3 };
  consejos.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);
  const tips = consejos.map(c => c.texto); // los textos, para quien solo necesita la lista
  return { score, tips, consejos, sinDatos: !tieneAlgo, sinBase, mesesCubiertos, rachaDeficit: rachaMeses };
}

  return { puntaje, simular, fraseTendencia, pilares, estado, tieneBase, tendenciaPatrimonio, mesesCayendo, fechaAgotamiento, accionesUrgentes, ESTADOS };
})();
if (typeof window !== 'undefined') window.Salud = Salud;
if (typeof module !== 'undefined' && module.exports) module.exports = Salud;
