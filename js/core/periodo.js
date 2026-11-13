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
     · Ingreso del mes = mesada + ingresos fijos cobrados + entradas reales (entradasIngresoReal, js/core/ingresos.js).
     · La Mesada cuenta en el mes de la FECHA en que te pagaron (cada abono de un pendiente, en la suya); su clave
       S.mesadas[padre].pagos['YYYY-<mes 0-11>'] es solo el mes que cubre. Pago sin monto: la cuota del año; sin fecha:
       el mes que cubre.
     · Un ingreso fijo (sueldo, freelance…) es una plantilla que NO suma por sí sola: cuenta cuando se registra su COBRO
       (js/core/cobros.js), en el mes de la fecha del cobro. Si no registras el cobro, ese mes no tiene ese ingreso.
     · Spotify: cada cuota que te pagan un integrante (y cada abono de lo que quedó debiendo) cuenta como ingreso en el mes
       de SU fecha, y el pago del plan cuenta como gasto completo (gastosVar). Así el balance del mes refleja la caja real
       aunque cobres semanas antes de pagar. El extra con cuenta destino ya cuenta como entrada real; el extra con «Sin
       especificar» lo cuenta spotifyEntradas. No depende de si el módulo está activo: el gasto del plan tampoco depende.
     · REGLA GENERAL: encender o apagar un módulo (Mesada, Spotify…) solo muestra u oculta pantallas y avisos. Nunca cambia lo que
       cuenta como ingreso, gasto o saldo: eso lo decide el dato registrado, no una preferencia de pantalla.
       Las estadísticas por ciclo de la pantalla Spotify son otra lectura y no cambian.
     · Es la misma regla del historial de patrimonio y de las entradas reales.

   Todas las funciones reciben `estado` opcional (por defecto S): Wrapped trabaja
   sobre el estado que le pasan, no necesariamente el global.
   Sin DOM. Carga de entrada (<script defer>) justo después del núcleo; solo
   usa mesKey/_esGastoVarNoReal/entradasIngresoReal (el núcleo) al ser llamado.
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
    return Fecha.mes(new Date(a, m - 1 + n, 1));
  }
  const mesAnterior = mes => mesDesplazado(mes, -1);

  // Los últimos n meses terminando en `hasta` (inclusive), del más viejo al más nuevo.
  function ultimosMeses(n, hasta) {
    const fin = hasta || mesActual();
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(mesDesplazado(fin, -i));
    return out;
  }

  // Meses calendario hacia atrás que cuentan como «recientes» para el ingreso y el gasto TÍPICOS. Un ingreso de hace un año no es
  // el ingreso de hoy: sin este límite, quien dejó de cobrar hace 4 meses seguía con el ingreso de entonces como referencia (los
  // ratios de Salud se medían contra plata que ya no entra y desaparecía el aviso «Registra tus ingresos»). Lo mismo con el gasto:
  // el fondo de emergencia se mide contra lo que gastas ahora, no contra lo que gastabas hace un año. Si ningún mes de la ventana
  // tiene datos, no hay referencia (promedio 0), igual que antes cuando no había ningún mes.
  const VENTANA_REFERENCIA_MESES = 6;

  // Los últimos `n` meses con total > 0, anteriores a `mes` (completos) y dentro de la ventana, del más viejo al más nuevo.
  function _mesesDeReferencia(porMes, mes, n) {
    const desde = mesDesplazado(mes, -VENTANA_REFERENCIA_MESES);
    return Object.keys(porMes).filter(k => k < mes && k >= desde && porMes[k] > 0).sort().slice(-(n || 3));
  }

  /* ---- INGRESOS ---- */
  // La Mesada es plata que entra el día en que te la pagan, así que cuenta como ingreso del mes de esa FECHA (regla de
  // caja, la misma de las entradas reales y del historial de patrimonio). La clave del pago ("2026-0" = enero) es solo el
  // mes que la mesada CUBRE: sirve para saber qué mes está pagado o pendiente en la pantalla de Mesada, no para sumar.
  // Cada pago y cada abono de un pendiente cuenta en su propia fecha; sin fecha, cae en el mes que cubre.
  // → [{ parent, key, mesCubre:'YYYY-MM', monto, fecha, mes:'YYYY-MM' }]  (`mes` = mes en que entró la plata)
  function mesadaEntradas(estado) {
    const st = _st(estado);
    // NO depende de si el módulo Mesada está activo: apagarlo solo oculta la pantalla; la plata que ya entró a tus cuentas sigue siendo ingreso
    // (igual que Spotify). Sin pagos registrados, esto da [] por sí solo.
    if (!st.mesadas || typeof st.mesadas !== 'object') return [];
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
    fijos.forEach(ingreso => {
      if (!ingreso || !Array.isArray(ingreso.cobros)) return;
      ingreso.cobros.forEach(c => {
        if (!c || !(c.monto > 0)) return;
        out.push({ id: ingreso.id, nombre: ingreso.nombre || '', cobroId: c.id, mesCubre: c.mesCubre || '', monto: c.monto, fecha: c.fecha || '', mes: c.fecha ? mesKey(c.fecha) : (c.mesCubre || '') });
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
    const spotify = _st(estado).spotify;
    const hist = spotify && Array.isArray(spotify.historial) ? spotify.historial : [];
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
  // `opts.sinExtra`: deja fuera los ingresos marcados «extraordinario» (aguinaldo, venta, premio): lo que queda es el ritmo habitual.
  function ingresosPorMes(estado, opts) {
    const out = {};
    const sinExtra = !!(opts && opts.sinExtra);
    const sumar = (mes, monto) => { if (mes && monto > 0) out[mes] = (out[mes] || 0) + monto; };
    mesadaEntradas(estado).forEach(e => sumar(e.mes, e.monto));
    ingresosFijosEntradas(estado).forEach(e => sumar(e.mes, e.monto));
    spotifyEntradas(estado).forEach(e => sumar(e.mes, e.monto));
    entradasIngresoReal(estado).forEach(m => { if (!(sinExtra && m.extraordinario)) sumar(mesKey(m.fecha), m.monto || 0); });
    return out;
  }

  // Ingreso mensual típico: promedio de los últimos `n` meses ANTERIORES a `mes` que tengan ingreso (el mes en curso no entra:
  // con la regla de caja el ingreso llega en pocos días, y a principio de mes aún no ha llegado). Misma forma que gastoPromedioPrevio.
  // Los ingresos marcados «extraordinario» no entran: un aguinaldo no es lo que cobras normalmente.
  function ingresoPromedioPrevio(mes, n, estado) {
    const porMes = ingresosPorMes(estado, { sinExtra: true });
    const previos = _mesesDeReferencia(porMes, mes, n);
    if (!previos.length) return { promedio: 0, meses: 0 };
    return { promedio: previos.reduce((a, k) => a + porMes[k], 0) / previos.length, meses: previos.length };
  }

  /* ---- GASTOS ---- */
  // Todos los pagos de gastos fijos, normalizados: [{id, mes, mesCubre, monto, fecha, cat, nombre}].
  // S.pagosGastosFijos es un mapa {"<gastoFijoId>_YYYY-MM": {fecha, fuente, monto}}; `mesCubre` sale de la clave y `mes` (el que
  // cuenta) de la fecha del pago.
  function pagosFijos(estado) {
    const st = _st(estado);
    const raw = st.pagosGastosFijos;
    if (!raw || typeof raw !== 'object') return [];
    const gfs = st.gastosFijos || [];
    const out = [];
    const sumar = (id, mes, p) => {
      if (!p || !mes) return;
      const gastoFijo = gfs.find(x => x.id === id);
      out.push({
        id, mesCubre: mes,
        mes: p.fecha ? mesKey(p.fecha) : mes, // regla de caja: cuenta en el mes de la fecha del pago
        monto: p.monto || 0,
        fecha: p.fecha || '',
        cat: (gastoFijo && gastoFijo.cat) || p.cat || null,
        nombre: (gastoFijo && gastoFijo.nombre) || p.nombre || ''
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

  // «Compra grande»: un gasto variable grande y NO habitual (una moto, un computador). Es un golpe REAL al patrimonio, a la liquidez y a
  // los meses que cubres: por eso `gastos.total`, el patrimonio y la liquidez la cuentan completa. Lo que no es, es un hábito: las
  // medidas de FLUJO (el gasto «típico», el ratio gasto/ingreso, la racha de déficit, la pendiente de la Proyección) la separan, para que
  // una moto de 15 M no se lea como «gastas 15 M al mes».
  //
  // Quién decide: el USUARIO manda, y si no ha dicho nada, se detecta sola.
  //   · g.grande === true  → «sí» (la marcó él)
  //   · g.grande === false → «no» (dijo que no lo es; se respeta siempre, aunque el monto parezca grande)
  //   · sin decisión       → «auto» si el gasto supera lo que normalmente gastas en UN MES entero (ver umbralCompraGrande), si no «no».
  // Una marca que depende de acordarse falla justo cuando importa (la moto sin marcar volvía a leerse como hábito), y el formulario solo
  // cubre lo registrado desde ahí (no las compras de tarjeta ni lo anterior). La detección es visible («automática») y reversible.
  const COMPRA_GRANDE_AUTO = Object.freeze({
    minimo: 500000,        // por debajo de esto nunca se detecta sola (ruido). Igual a UMBRALES.compraGrande.minimo (lo verifica una prueba)
    vecesLaMediana: 1,     // un solo gasto ≥ 1× la mediana de tu gasto mensual es extraordinario
    mesesMinimos: 2,       // con menos meses completos de historia no hay con qué juzgar: no se detecta sola
    ventana: 6,            // meses anteriores que entran a la mediana
  });

  // Umbral en pesos desde el cual un gasto SIN decisión del usuario es una compra grande: la mediana de tu gasto mensual de los meses
  // anteriores (el más reciente puede estar en curso y se descarta), con el mínimo de COMPRA_GRANDE_AUTO. Infinity si no hay historia
  // suficiente. La mediana (no el promedio) es a propósito: una moto en un mes no mueve la mediana, y el umbral depende solo del
  // pasado, no de cuánto tienes hoy, así que una compra no cambia de «normal» a «grande» (ni al revés) con el paso del tiempo.
  function umbralCompraGrande(estado) {
    const porMes = gastosPorMes(estado); // sin opciones: no llama a esCompraGrande (sin recursión)
    const meses = Object.keys(porMes).filter(k => porMes[k] > 0).sort();
    meses.pop();
    const base = meses.slice(-COMPRA_GRANDE_AUTO.ventana).map(k => porMes[k]).sort((a, b) => a - b);
    if (base.length < COMPRA_GRANDE_AUTO.mesesMinimos) return Infinity;
    const m = Math.floor(base.length / 2);
    const mediana = base.length % 2 ? base[m] : (base[m - 1] + base[m]) / 2;
    return Math.max(COMPRA_GRANDE_AUTO.minimo, mediana * COMPRA_GRANDE_AUTO.vecesLaMediana);
  }

  // 'si' | 'auto' | 'no' para un gasto. `umbral` = umbralCompraGrande() (calcúlalo UNA vez al recorrer varios gastos). Los retiros manuales
  // («Restar dinero», cuadrar lo registrado con lo real) no se detectan solos: no son una compra.
  function compraGrandeEstado(g, umbral) {
    if (!g) return 'no';
    if (g.grande === true) return 'si';
    if (g.grande === false || g._esRetiroManual) return 'no';
    // El mínimo se aplica también aquí (no solo dentro de umbralCompraGrande): un gasto pequeño nunca se detecta solo, pase lo que pase.
    return (g.monto || 0) >= Math.max(COMPRA_GRANDE_AUTO.minimo, umbral === undefined ? Infinity : umbral) ? 'auto' : 'no';
  }
  const esCompraGrande = (g, umbral) => compraGrandeEstado(g, umbral) !== 'no';

  const gastosVarRealesDelMes = (mes, estado) =>
    (_st(estado).gastosVar || []).filter(g => mesKey(g.fecha) === mes && !_esGastoVarNoReal(g))
      .concat(retirosManuales(estado).filter(r => mesKey(r.fecha) === mes));

  // { variables:[gastos], fijos:[pagos], gastoVariableTotal, gastoFijoTotal, total, items }
  // `items` junta ambos (cada uno con cat y monto) para agrupar por categoría.
  function gastosDelMes(mes, estado) {
    const variables = gastosVarRealesDelMes(mes, estado);
    const fijos = gastosFijosDelMes(mes, estado);
    const gastoVariableTotal = variables.reduce((a, g) => a + (g.monto || 0), 0);
    const gastoFijoTotal = fijos.reduce((a, p) => a + p.monto, 0);
    const umbral = umbralCompraGrande(estado);
    const extraordinarios = variables.filter(g => esCompraGrande(g, umbral));
    const extraTotal = extraordinarios.reduce((a, g) => a + (g.monto || 0), 0);
    // total = TODO lo que salió (real). recurrenteTotal = lo mismo sin las compras grandes (el ritmo del mes).
    return { variables, fijos, gastoVariableTotal, gastoFijoTotal, total: gastoVariableTotal + gastoFijoTotal, items: [...variables, ...fijos], extraordinarios, extraTotal, recurrenteTotal: gastoVariableTotal + gastoFijoTotal - extraTotal };
  }

  // Compras grandes con fecha en (desde, hasta] — `desde` excluida, `hasta` incluida, ambas 'YYYY-MM-DD'. Para ajustar la pendiente
  // del patrimonio entre dos fotos del historial: lo que cayó ese intervalo por una compra grande no es el ritmo del usuario.
  function comprasGrandesEntre(desde, hasta, estado) {
    const umbral = umbralCompraGrande(estado);
    return (_st(estado).gastosVar || []).filter(g => esCompraGrande(g, umbral) && !_esGastoVarNoReal(g) && g.fecha > desde && g.fecha <= hasta);
  }

  // Total de gasto real por mes: { 'YYYY-MM': total } con todos los meses que tienen datos.
  // `opciones.sinExtraordinarios`: deja fuera las compras grandes (el flujo recurrente).
  function gastosPorMes(estado, opciones) {
    const out = {};
    const sinExtra = !!(opciones && opciones.sinExtraordinarios);
    const umbral = sinExtra ? umbralCompraGrande(estado) : Infinity;
    (_st(estado).gastosVar || []).forEach(g => {
      if (_esGastoVarNoReal(g)) return;
      if (sinExtra && esCompraGrande(g, umbral)) return;
      const k = mesKey(g.fecha);
      if (k) out[k] = (out[k] || 0) + (g.monto || 0);
    });
    retirosManuales(estado).forEach(r => { const k = mesKey(r.fecha); if (k) out[k] = (out[k] || 0) + r.monto; });
    pagosFijos(estado).forEach(p => { out[p.mes] = (out[p.mes] || 0) + p.monto; });
    return out;
  }

  // Gasto mensual típico: promedio de los últimos `n` meses ANTERIORES a `mes` que tengan gasto, dentro de los últimos
  // VENTANA_REFERENCIA_MESES (meses completos;
  // el mes en curso no entra, porque a principio de mes su total es parcial y haría ver las reservas enormes).
  // { promedio, meses }: `meses` = cuántos meses con datos se promediaron (0 si todavía no hay ninguno).
  function gastoPromedioPrevio(mes, n, estado) {
    // «Típico»: sin las compras grandes (una moto en un mes no es el gasto de ese mes). El fondo de emergencia se mide contra lo que
    // gastas normalmente; la moto ya bajó la liquidez (el numerador), no debe además inflar el denominador.
    const porMes = gastosPorMes(estado, { sinExtraordinarios: true });
    const previos = _mesesDeReferencia(porMes, mes, n);
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

  // Gasto típico por categoría: promedio de los últimos `n` meses anteriores a `mes` con gasto, sin las compras grandes (mismo criterio que
  // gastoPromedioPrevio). Sirve para sugerir un presupuesto realista. → { cats: { cat: promedio }, meses }
  function gastoPromedioPorCategoria(mes, n, estado) {
    const meses = _mesesDeReferencia(gastosPorMes(estado, { sinExtraordinarios: true }), mes, n);
    const suma = {};
    meses.forEach(m => {
      const g = gastosDelMes(m, estado), grandes = new Set(g.extraordinarios);
      g.items.forEach(it => { if (grandes.has(it)) return; const c = it.cat || 'Otro'; suma[c] = (suma[c] || 0) + (it.monto || 0); });
    });
    const cats = {};
    Object.keys(suma).forEach(c => { cats[c] = suma[c] / (meses.length || 1); });
    return { cats, meses: meses.length };
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
    // balanceRecurrente: el balance sin las compras grandes (el ritmo del mes). `balance` sigue siendo el real.
    // Un ingreso marcado «extraordinario» (aguinaldo, venta, premio: `extraordinario:true` en la entrada) tampoco es el ritmo del mes.
    const ingresosExtra = entradasIngresoReal(estado).reduce((a, m) => m.extraordinario && mesKey(m.fecha) === mes ? a + (m.monto || 0) : a, 0);
    const balanceRecurrente = balance + gastos.extraTotal - ingresosExtra;
    return { mes, ingresos, gastos, balance, balanceRecurrente, extraordinarios: gastos.extraTotal, ingresosExtra, rendimientos, tasaAhorro: ingresos.total > 0 ? balance / ingresos.total * 100 : null };
  }

  // Día de un mes «YYYY-MM» (entero 1–31, recortado al último día del mes: un «31» cae el 28 en febrero) y cuántos días faltan desde
  // `hoyStr`: { dia, fecha:'YYYY-MM-DD', dias } (0 = hoy, negativo = ya pasó). null si `dia` no es un entero 1–31. Lo comparten los
  // gastos fijos (vencimiento) y los ingresos fijos (día esperado).
  function diaDelMes(dia, mes, hoyStr) {
    const d = Number(dia);
    if (!Number.isInteger(d) || d < 1 || d > 31) return null;
    const [y, m] = String(mes).split('-').map(Number);
    const real = Math.min(d, new Date(y, m, 0).getDate());
    const [hy, hm, hd] = String(hoyStr).split('-').map(Number);
    return { dia: real, fecha: mes + '-' + String(real).padStart(2, '0'),
      dias: Math.round((Date.UTC(y, m - 1, real) - Date.UTC(hy, hm - 1, hd)) / 86400000) };
  }

  // Gastos fijos con día de vencimiento (`gastoFijo.dia`, entero 1–31, opcional) que todavía NO se han pagado en `mes`. El día se recorta al
  // último día del mes (un «31» vence el 28 en febrero). `dias` = días desde `hoyStr` hasta el vencimiento: 0 = vence hoy, negativo = ya
  // venció. Un gasto fijo sin día no aparece aquí (la app no inventa un vencimiento: solo avisa de lo que el usuario dijo).
  // → [{ id, nombre, monto, cat, dia, fecha:'YYYY-MM-DD', dias }] ordenado por vencimiento.
  function gastosFijosProgramados(mes, hoyStr, estado) {
    const st = _st(estado);
    const pagados = new Set(pagosFijos(estado).filter(p => p.mesCubre === mes).map(p => p.id));
    const out = [];
    (st.gastosFijos || []).forEach(gastoFijo => {
      const f = diaDelMes(gastoFijo.dia, mes, hoyStr);
      if (!f || pagados.has(gastoFijo.id)) return;
      out.push({ id: gastoFijo.id, nombre: gastoFijo.nombre, monto: gastoFijo.monto || 0, cat: gastoFijo.cat, dia: f.dia, fecha: f.fecha, dias: f.dias });
    });
    return out.sort((a, b) => a.dias - b.dias);
  }

  // Gastos fijos SIN día de vencimiento que todavía no se han pagado en `mes` (todos son mensuales). La app no inventa un vencimiento para
  // ellos, pero «ya es 25 y el arriendo no está pagado» merece un aviso suave (ver la regla 'gastos-fijos-sin-dia' en reglas.js).
  // → [{ id, nombre, monto, cat }] en el orden en que están guardados.
  function gastosFijosSinDia(mes, estado) {
    const st = _st(estado);
    const pagados = new Set(pagosFijos(estado).filter(p => p.mesCubre === mes).map(p => p.id));
    return (st.gastosFijos || [])
      .filter(gastoFijo => !diaDelMes(gastoFijo.dia, mes, mes + '-01') && !pagados.has(gastoFijo.id))
      .map(gastoFijo => ({ id: gastoFijo.id, nombre: gastoFijo.nombre, monto: gastoFijo.monto || 0, cat: gastoFijo.cat }));
  }

  // Calendario de caja (puro): cómo evoluciona un saldo (tu plata disponible, neta de deudas) día a día con eventos CONOCIDOS de antemano.
  // `eventos`: [{ fecha:'YYYY-MM-DD', monto (+ entra / − sale), texto, tipo? }]. Solo cuentan los de [hoyStr, hoyStr + dias]. Se evalúa al
  // CIERRE de cada día (las entradas y salidas del mismo día se netean: no se sabe en qué orden pasan, y un «déficit» de media mañana
  // por el orden sería una falsa alarma). → { saldoInicial, final, limite, puntos:[{fecha, saldo, neto, eventos}], minimo:{fecha, saldo},
  // primerDeficit:{fecha, saldo, evento}|null }. `primerDeficit` solo si el saldo inicial no era ya negativo (si ya lo es, no es una
  // sorpresa futura: ya lo dice el resto de la app); `evento` es la mayor salida de ese día (lo que lo causó).
  function saldoProyectado(saldoInicial, eventos, hoyStr, dias) {
    const [hy, hm, hd] = String(hoyStr).split('-').map(Number);
    const f = new Date(Date.UTC(hy, hm - 1, hd + (dias || 0)));
    const limite = f.getUTCFullYear() + '-' + String(f.getUTCMonth() + 1).padStart(2, '0') + '-' + String(f.getUTCDate()).padStart(2, '0');
    const porDia = {};
    (eventos || []).forEach(e => {
      if (!e || !isFinite(e.monto) || e.monto === 0 || e.fecha < hoyStr || e.fecha > limite) return;
      (porDia[e.fecha] = porDia[e.fecha] || []).push(e);
    });
    let saldo = saldoInicial;
    let minimo = { fecha: hoyStr, saldo: saldoInicial };
    let primerDeficit = null;
    const puntos = Object.keys(porDia).sort().map(fecha => {
      const evs = porDia[fecha];
      const neto = evs.reduce((a, e) => a + e.monto, 0);
      saldo += neto;
      if (saldo < minimo.saldo) minimo = { fecha, saldo };
      if (saldo < 0 && !primerDeficit && saldoInicial >= 0) {
        primerDeficit = { fecha, saldo, evento: evs.filter(e => e.monto < 0).sort((a, b) => a.monto - b.monto)[0] || evs[0] };
      }
      return { fecha, saldo, neto, eventos: evs };
    });
    return { saldoInicial, final: saldo, limite, puntos, minimo, primerDeficit };
  }

  // ¿Se puede juzgar el balance de un mes (`b` = balanceDelMes)? Solo si tiene ingresos registrados. Un mes con gastos y SIN ningún ingreso
  // anotado no es un déficit: lo más probable es que el usuario no registró lo que recibió (o que gastó de lo que ya tenía ahorrado, p. ej.
  // un saldo inicial, que NO es un ingreso del mes). Ausencia de registros ≠ situación negativa: ese mes queda «sin evaluar», ni déficit ni
  // superávit. Lo usan la racha de déficit, el resumen de flujo, los pilares de Salud y el plan de deudas (una sola definición).
  const balanceEvaluable = b => !!b && b.ingresos.total > 0;

  // Racha de déficit: cuántos meses COMPLETOS seguidos, terminando en el mes anterior a `mes`, cerraron con balance negativo (gastaste
  // más de lo que entró, flujo de caja operativo, sin rendimientos: la misma base de Salud y del cierre de mes). Un mes sin ningún
  // movimiento ni ingreso ni gasto no es déficit ni superávit: corta la racha (no hay nada que juzgar). `max` limita cuántos meses
  // se miran hacia atrás (6 por defecto). → { meses: n, balances: [{ mes, balance }] con el más reciente primero, acumulado } donde
  // `acumulado` es la suma (negativa) de lo que se perdió en toda la racha.
  function rachaDeficit(mes, max, estado) {
    const balances = [];
    for (let i = 1; i <= (max || 6); i++) {
      const m = mesDesplazado(mes, -i);
      const b = balanceDelMes(m, estado);
      // Se mide el balance RECURRENTE: un mes de déficit solo por una compra grande aislada no es un hábito de gastar más de lo que
      // entra (el golpe ya lo cuentan la liquidez y el runway). Un mes con solo la compra grande y nada más no tiene qué juzgar.
      // Un mes SIN ingresos registrados tampoco: gastos sin ingresos anotados es información que falta, no un déficit (ver balanceEvaluable).
      if (!balanceEvaluable(b) || b.balanceRecurrente >= 0) break;
      balances.push({ mes: m, balance: b.balanceRecurrente });
    }
    return { meses: balances.length, balances, acumulado: balances.reduce((a, x) => a + x.balance, 0) };
  }

  /* ---- CONCILIACIÓN: «¿por qué cambió mi patrimonio?» ----
     Compara lo que CAMBIÓ el patrimonio en un mes contra lo que explican los ingresos, gastos y rendimientos que registra la app:
         sinExplicar = Δpatrimonio − montoBase − (ingresos + rendimientos − gastos)
     `montoBase` son los saldos iniciales y ajustes (una cuenta nueva con saldo no es plata ganada). Lo que queda sin explicar son
     movimientos que tocan el patrimonio sin estar clasificados como ingreso o gasto (un préstamo sin cuenta, un ajuste olvidado…):
     por eso además de informar sirve de alarma de integridad de los datos. Es una guía, no una igualdad exacta: el patrimonio se
     fotografía una vez al día (al guardar) y los movimientos van por su fecha, y hay intereses de Nu y de tarjeta.
     Se mide entre la última foto de un mes ANTERIOR y la última foto de `mes` (los movimientos van por esa misma ventana de fechas).
     Usa el valor VISIBLE del patrimonio (sin Alcancía), igual que el hero y la gráfica de Análisis; lo que se mueve a la Alcancía ya
     entra en montoBase. Es la ÚNICA definición: la usan la tarjeta de Análisis y scripts/conciliacion.js.
     → { mes, desde, hasta, delta, base, ingresos, gastos, rendimientos, explicado, sinExplicar } o null si el mes no tiene dos fotos. */
  function conciliar(mes, estado) {
    const st = _st(estado);
    const H = (st.patrimonioHistorial || []).filter(h => h && h.fecha).slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    const mk = h => String(h.fecha).slice(0, 7);
    const prev = H.filter(h => mk(h) < mes).pop();
    const fin = H.filter(h => mk(h) === mes).pop();
    if (!prev || !fin) return null;
    const d0 = prev.fecha, d1 = fin.fecha, en = f => !!f && f > d0 && f <= d1;
    const val = h => (typeof h.valorVisible === 'number' ? h.valorVisible : (h.valor || 0));
    const sum = (arr, f) => arr.filter(x => en(x.fecha)).reduce((a, x) => a + (f ? f(x) : (x.monto || 0)), 0);
    const base = H.filter(h => en(h.fecha)).reduce((a, h) => a + (h.montoBase || 0), 0);
    let mesada = 0;
    ['papa', 'mama'].forEach(par => Object.values(((st.mesadas || {})[par] || {}).pagos || {}).forEach(x => { if (x && en(x.fecha)) mesada += x.monto || 0; }));
    const ingresos = sum(entradasIngresoReal(estado)) + sum(spotifyEntradas(estado)) + sum(ingresosFijosEntradas(estado)) + mesada;
    const gastos = (st.gastosVar || []).filter(g => en(g.fecha) && !_esGastoVarNoReal(g)).reduce((a, g) => a + (g.monto || 0), 0)
      + sum(retirosManuales(estado)) + sum(pagosFijos(estado));
    const rendimientos = rendimientosDelMes(mes, estado).total;
    const explicado = ingresos - gastos + rendimientos;
    const delta = val(fin) - val(prev);
    return { mes, desde: d0, hasta: d1, delta, base, ingresos, gastos, rendimientos, explicado, sinExplicar: delta - base - explicado };
  }

  // Resumen de flujo de los últimos `n` meses (el actual incluido): ingreso, gasto y balance de cada uno, cuántos cerraron en superávit o déficit
  // y el acumulado. Un mes sin ningún movimiento, o con gastos pero sin ingresos registrados, no cuenta ni como superávit ni como déficit.
  function resumenFlujo(n, hasta, estado) {
    const meses = ultimosMeses(n, hasta).map(m => {
      const b = balanceDelMes(m, estado);
      return { mes: m, ingresos: b.ingresos.total, gastos: b.gastos.total, balance: b.balance, conDatos: b.ingresos.total > 0 || b.gastos.total > 0, evaluable: balanceEvaluable(b) };
    });
    // Los totales de superávit/déficit/acumulado solo cuentan meses EVALUABLES (con ingresos registrados): un mes con gastos y sin
    // ingresos anotados no es un «déficit» (ver balanceEvaluable). `conDatos` (del resultado) = cuántos meses se pudieron evaluar.
    const c = meses.filter(x => x.evaluable);
    return { meses, conDatos: c.length, superavit: c.filter(x => x.balance >= 0).length, deficit: c.filter(x => x.balance < 0).length, acumulado: c.reduce((a, x) => a + x.balance, 0) };
  }

  // Ritmo de un presupuesto: ¿vas más rápido de lo que avanza el mes? `hoyStr` 'AAAA-MM-DD'. Solo avisa si el mes ya tiene 5 días, el gasto
  // supera lo esperado por 15 puntos o más y el presupuesto aún no se pasó (si se pasó, ya lo dice el propio presupuesto).
  // → { dia, diasMes, esperadoPct, usadoPct, adelantado }
  function ritmoPresupuesto(gasto, limite, hoyStr) {
    const [a, m, d] = String(hoyStr).split('-').map(Number);
    const diasMes = new Date(a, m, 0).getDate();
    const esperadoPct = Math.round(d / diasMes * 100);
    const usadoPct = limite > 0 ? Math.round((gasto || 0) / limite * 100) : 0;
    return { dia: d, diasMes, esperadoPct, usadoPct, adelantado: limite > 0 && d >= 5 && usadoPct < 100 && usadoPct - esperadoPct >= 15 };
  }

  return { gastoPromedioPorCategoria, ritmoPresupuesto, resumenFlujo, cuotaMesada, mesDesplazado, mesAnterior, ultimosMeses, mesadaDelMes, ingresosFijosDelMes, ingresosFijosEntradas, spotifyEntradas, spotifyDelMes, ingresosDelMes, ingresosPorMes, ingresoPromedioPrevio, mesadaEntradas,
           pagosFijos, retirosManuales, rendimientosDelMes, gastosFijosDelMes, gastosFijosProgramados, gastosFijosSinDia, conciliar, diaDelMes, saldoProyectado, esCompraGrande, compraGrandeEstado, umbralCompraGrande, COMPRA_GRANDE_AUTO, comprasGrandesEntre, gastosVarRealesDelMes, gastosDelMes, gastosPorMes, gastoPromedioPrevio, gastoPorCategoria, balanceDelMes, balanceEvaluable, rachaDeficit, VENTANA_REFERENCIA_MESES };
})();

// Visible también como propiedad global (un `const` de nivel superior no lo es): los tests lo leen como ctx.Periodo.
if (typeof window !== 'undefined') window.Periodo = Periodo;

