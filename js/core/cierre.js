/* ═══════════════════════════════════════════════════════════════
   js/core/cierre.js

   CIERRE DE PERÍODOS — etapa 1: vista previa de SOLO LECTURA y medidor de tamaño. No modifica ningún dato ni escribe nada.
   Diseño y decisión: docs/cierre-de-periodos.md. Esta etapa construye lo que cualquier estrategia posterior necesita
   (archivo por año en documentos aparte, o compactación): saber QUÉ historia existe, cuáles de sus partes se pueden mover
   como una unidad sin romper nada, y cuánto pesa. La verificación de que nada cambió es la huella (js/core/huella.js).

   ── Qué resuelve ────────────────────────────────────────────────────────────────────────────────────────────────────
   1. FUENTES de historia: dónde guarda S cada registro con fecha (libro, movimientos, gastos, bolsa de cada encargo, compras
      y pagos de cada tarjeta, movimientos de cada deuda…). Cada fuente se describe una vez (registrarFuente); un módulo con
      historia nueva se suma describiéndola. CLASIFICACION dice qué es cada clave de primer nivel de S, y una prueba exige que
      ninguna clave quede sin clasificar: una colección nueva no puede pasar desapercibida.
   2. GRAFO de enlaces POR VALOR. Los registros se apuntan entre sí con ~25 campos distintos (_encMovId, _transfId, _tcCompraId,
      origen.ref del libro…). En lugar de listarlos (y quedar desactualizados), dos registros están enlazados si uno contiene,
      en cualquier campo, el id del otro. Las componentes conexas son la UNIDAD ATÓMICA: se mueven completas o ninguna. Eso
      cubre transferencias con una pata a cada lado del corte, reversiones, pagos divididos y copias (alcancía), sin tocar los
      módulos cuando aparece un campo de enlace nuevo.
   3. ENTIDADES. Una tarjeta, un encargo, una deuda o la alcancía solo se consideran cerradas si su saldo es 0 (lo dice la sonda
      de la huella: una sola fuente) y toda su historia es anterior al corte. Una entidad sin sonda (Spotify, mesada, ingresos
      fijos…) no se cierra: es conservador y se enciende solo al registrar su sonda.
   4. TAMAÑO: bruto por clave, comprimido (el mismo códec del guardado), proyección de cuándo se llegaría al aviso y al límite, y
      el disparador acordado para pasar de esta etapa a la siguiente.

   Todo es síncrono salvo lo que comprime. Sin DOM. Carga de entrada (<script defer>) después de huella.js.
   ═══════════════════════════════════════════════════════════════ */
const Cierre = (() => {
  const VERSION = 1;
  // Política acordada (docs/cierre-de-periodos.md §4): el corte es un mes terminado con al menos 24 meses de antigüedad.
  // analizar() acepta cualquier mes terminado (hace falta para explorar y para probar con datos sintéticos); quien EJECUTE un
  // cierre debe exigir `corteMasReciente()` o anterior.
  const POLITICA = { mesesMinimos: 24 };
  // Umbrales por defecto = los de firebase-sync.js (una prueba vigila que no se desalineen). Ese archivo es un módulo ES y carga DESPUÉS
  // de este script, así que sus valores reales (window._payloadLimites) se leen al usarlos, no al cargar.
  const LIMITES = { aviso: 800000, limite: 1000000 };
  const _limites = () => (typeof window !== 'undefined' && window._payloadLimites) || LIMITES;
  // Disparador para pasar a la etapa siguiente (archivo por año): payload comprimido sobre este valor.
  const DISPARADOR_BYTES = 500000, DISPARADOR_ANTIGUEDAD_DIAS = 730;
  // Una unidad atómica de más de esto registros es sospechosa (las legítimas son de 1 a ~10); ver `advertencias` en analizar().
  const COMPONENTE_GRANDE = 100;

  const _lst = x => (Array.isArray(x) ? x : []);
  const _obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const _fechaOk = f => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f);
  const _R = (obj, fecha, id, entidad) => ({ obj, fecha, id: (obj && obj.id) || id, entidad: entidad || null });

  /* ---- 1. FUENTES ---- */
  const _fuentes = new Map();
  // def: { clave, etiqueta, raiz:[claves de S que describe], sonda?:nombre de la sonda de huella que da el saldo de sus entidades,
  //        registros(estado) → [{ obj, fecha, id, entidad }] }   (`obj` es el registro real: se mide y se escanea en busca de enlaces)
  function registrarFuente(def) {
    if (!def || typeof def.clave !== 'string' || !Array.isArray(def.raiz) || typeof def.registros !== 'function') throw new Error('Cierre.registrarFuente: definición inválida');
    _fuentes.set(def.clave, def);
  }
  const _plana = (clave, etiqueta, raiz) => registrarFuente({ clave, etiqueta, raiz: [raiz], registros: st => _lst(st[raiz]).map((x, i) => _R(x, x && x.fecha, clave + '#' + i)) });
  _plana('libro', 'Libro de movimientos', 'libro');
  _plana('movimientos', 'Movimientos de cuentas', 'movimientos');
  _plana('gastosVar', 'Gastos variables', 'gastosVar');
  _plana('transferencias', 'Transferencias', 'transferencias');
  _plana('ingresosExtra', 'Ingresos extra', 'ingresosExtra');
  _plana('chequeosNu', 'Chequeos de Nu', 'chequeosNu');
  _plana('historialTasasNu', 'Historial de tasas de Nu', 'historialTasasNu');
  _plana('patrimonioHistorial', 'Historial de patrimonio', 'patrimonioHistorial');
  registrarFuente({ clave: 'pagosGastosFijos', etiqueta: 'Pagos de gastos fijos', raiz: ['pagosGastosFijos'], registros: st =>
    Object.keys(_obj(st.pagosGastosFijos)).map(k => { const p = _obj(st.pagosGastosFijos[k]); return { obj: p, id: 'gf:' + k, entidad: null, fecha: p.fecha || (k.split('_').pop() + '-01') }; }) });
  registrarFuente({ clave: 'tcMovimientos', etiqueta: 'Cargos de tarjetas', raiz: ['tcMovimientos'], sonda: 'tarjetas', registros: st =>
    _lst(st.tcMovimientos).map((m, i) => _R(m, m && m.fecha, 'tcm#' + i, m && m.tcId)) });
  registrarFuente({ clave: 'tarjetas', etiqueta: 'Compras y pagos de tarjetas', raiz: ['tarjetasCredito'], sonda: 'tarjetas', registros: st => {
    const out = [];
    _lst(st.tarjetasCredito).forEach(tc => {
      if (tc && tc.saldoInicial) out.push(_R(tc.saldoInicial, tc.saldoInicial.fecha, 'tcsi:' + tc.id, tc.id));
      _lst(tc && tc.compras).forEach((c, i) => out.push(_R(c, c && c.fecha, 'tcc:' + tc.id + i, tc.id)));
      _lst(tc && tc.pagos).forEach((p, i) => out.push(_R(p, p && p.fecha, 'tcp:' + tc.id + i, tc.id)));
    });
    return out;
  } });
  registrarFuente({ clave: 'deudas', etiqueta: 'Movimientos de deudas', raiz: ['deudores', 'misDeudas'], sonda: 'deudas', registros: st => {
    const out = [];
    [['favor', 'deudores'], ['contra', 'misDeudas']].forEach(([dir, k]) => _lst(st[k]).forEach(d =>
      _lst(d && d.movimientos).forEach((m, i) => out.push(_R(m, m && m.fecha, 'dm:' + d.id + i, dir + ':' + d.id)))));
    return out;
  } });
  registrarFuente({ clave: 'encargos', etiqueta: 'Movimientos de encargos', raiz: ['encargos'], sonda: 'encargos', registros: st => {
    const out = [];
    _lst(st.encargos).forEach(enc => _lst(enc && enc.movimientos).forEach((m, i) => out.push(_R(m, m && m.fecha, 'em:' + enc.id + i, enc.id))));
    return out;
  } });
  registrarFuente({ clave: 'alcancia', etiqueta: 'Alcancía (depósitos y ciclos)', raiz: ['alcancia', 'alcanciaSaldoOfuscado'], sonda: 'alcancia', registros: st => {
    const a = _obj(st.alcancia), out = [];
    _lst(a.movimientos).forEach((m, i) => out.push(_R(m, m && m.fecha, 'alm#' + i, 'alcancia')));
    // Un ciclo destapado ya es historia cerrada (no pertenece a la entidad activa); si todavía comparte ids con un depósito activo,
    // el grafo los une y el ciclo queda retenido igual.
    _lst(a.historial).forEach((h, i) => out.push(_R(h, h && h.fechaFin, 'alh#' + i, null)));
    return out;
  } });
  // Fuentes SIN sonda de saldo: sus entidades se reportan pero no se cierran (ver 3. ENTIDADES).
  registrarFuente({ clave: 'spotify', etiqueta: 'Historial de Spotify', raiz: ['spotify'], registros: st =>
    _lst(_obj(st.spotify).historial).map((h, i) => _R(h, h && h.fecha, 'sp#' + i, 'spotify')) });
  registrarFuente({ clave: 'mesada', etiqueta: 'Pagos de mesada', raiz: ['mesadas'], registros: st => {
    const out = [];
    Object.keys(_obj(st.mesadas)).forEach(padre => { const pagos = _obj(_obj(st.mesadas[padre]).pagos);
      Object.keys(pagos).forEach(k => { const m = /^(\d{4})-(\d{1,2})$/.exec(k), p = _obj(pagos[k]);
        out.push({ obj: p, id: 'mes:' + padre + k, entidad: 'mesada:' + padre, fecha: p.fecha || (m ? m[1] + '-' + String(Number(m[2]) + 1).padStart(2, '0') + '-01' : '') }); }); });
    return out;
  } });
  registrarFuente({ clave: 'ingresosFijos', etiqueta: 'Cobros de ingresos fijos', raiz: ['ingresosFijos'], registros: st => {
    const out = [];
    _lst(st.ingresosFijos).forEach(ing => _lst(ing && ing.cobros).forEach((c, i) => out.push(_R(c, c && c.fecha, 'cf:' + ing.id + i, 'ingreso:' + ing.id))));
    return out;
  } });
  registrarFuente({ clave: 'cdts', etiqueta: 'CDTs de las cajitas', raiz: ['cajitas'], registros: st => {
    const out = [];
    _lst(st.cajitas).forEach(c => _lst(c && c.cdts).forEach((x, i) => out.push(_R(x, x && (x.inicio || x.fecha), 'cdt:' + c.id + i, 'cajita:' + c.id))));
    return out;
  } });

  /* Qué es cada clave de primer nivel de S. 'historica' y 'entidad-con-historia' DEBEN tener fuente (prueba); el resto no guarda
     registros con fecha que un cierre pueda mover. Una clave nueva sin clasificar hace fallar la prueba `clasificacion`. */
  const CLASIFICACION = {
    libro: 'historica', movimientos: 'historica', gastosVar: 'historica', transferencias: 'historica', ingresosExtra: 'historica',
    chequeosNu: 'historica', historialTasasNu: 'historica', patrimonioHistorial: 'historica', pagosGastosFijos: 'historica', tcMovimientos: 'historica',
    tarjetasCredito: 'entidad-con-historia', deudores: 'entidad-con-historia', misDeudas: 'entidad-con-historia', encargos: 'entidad-con-historia',
    alcancia: 'entidad-con-historia', spotify: 'entidad-con-historia', mesadas: 'entidad-con-historia', ingresosFijos: 'entidad-con-historia', cajitas: 'entidad-con-historia',
    alcanciaSaldoOfuscado: 'derivada',
    cuentas: 'estado-actual', personas: 'estado-actual', gastosFijos: 'estado-actual', plataComprometida: 'estado-actual', nuRate: 'estado-actual',
    catsVar: 'configuracion', catsFijo: 'configuracion', presupuestos: 'configuracion', modulos: 'configuracion', config: 'configuracion', mesadaAnio: 'configuracion',
    schemaVersion: 'meta', _esquemaAnterior: 'meta', _ultimoMesVisto: 'meta', _ajustesBaseLog: 'meta', cdts: 'meta', nequiSaldo: 'meta', efectivoSaldo: 'meta', cuentasPersonalizadas: 'meta',
  };

  /* ---- 2. GRAFO DE ENLACES POR VALOR ---- */
  function _recorrerTextos(x, prof, fn) {
    if (typeof x === 'string') { if (x.length >= 6) fn(x); return; }
    if (prof <= 0 || !x || typeof x !== 'object') return;
    (Array.isArray(x) ? x : Object.keys(x).map(k => x[k])).forEach(v => _recorrerTextos(v, prof - 1, fn));
  }

  function _grafo(st) {
    const regs = [];
    _fuentes.forEach(f => f.registros(st).forEach(r => { if (r && r.obj && typeof r.obj === 'object') regs.push(Object.assign({ fuente: f.clave, sonda: f.sonda || null, bytes: JSON.stringify(r.obj).length }, r)); }));
    const padre = regs.map((_, i) => i);
    const raiz = i => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
    const unir = (a, b) => { a = raiz(a); b = raiz(b); if (a !== b) padre[b] = a; };
    const porId = new Map();
    regs.forEach((r, i) => { if (r.id) { if (!porId.has(r.id)) porId.set(r.id, []); porId.get(r.id).push(i); } });
    porId.forEach(idx => { for (let k = 1; k < idx.length; k++) unir(idx[0], idx[k]); }); // el mismo id en dos sitios es el mismo registro (copias de la alcancía)
    regs.forEach((r, i) => _recorrerTextos(r.obj, 4, s => { if (s !== r.id && porId.has(s)) porId.get(s).forEach(j => unir(i, j)); }));
    regs.forEach((r, i) => { r.comp = raiz(i); });
    return regs;
  }

  /* ---- 3. VISTA PREVIA (dry-run) ---- */
  const _mesActual = () => hoy().slice(0, 7);
  // Último mes COMPLETO con al menos `mesesMinimos` de antigüedad: el mes cuyo último día cae en o antes de (hoy − 24 meses). La cuenta es
  // aritmética (sin Date.setMonth, que desborda el día: el 30-mar menos 25 meses caía en «feb 30» = marzo y daba un mes de más).
  // Consecuencia que aprovecha Wrapped: el corte nunca llega al año anterior al actual (siempre queda ≤ dic de año − 2); una prueba lo recorre.
  function corteMasReciente(hoyStr) {
    const [y, m, d] = (hoyStr || hoy()).split('-').map(Number);
    let idx = y * 12 + (m - 1) - POLITICA.mesesMinimos;               // mes de (hoy − 24 meses), contado desde el año 0
    const ultimoDia = new Date(Date.UTC(Math.floor(idx / 12), (idx % 12) + 1, 0)).getUTCDate();
    if (d < ultimoDia) idx -= 1;                                      // ese mes aún no estaba completo hace 24 meses
    return Math.floor(idx / 12) + '-' + String((idx % 12) + 1).padStart(2, '0');
  }

  // analizar(corte 'YYYY-MM', estado?, {huella?, mesActual?}) → informe. NO modifica nada. Si no se pasa `huella` la calcula con las
  // sondas registradas; `completo` indica si están TODAS las base y sin errores (si no, las entidades sin sonda quedan abiertas).
  function analizar(corte, estado, opciones) {
    const op = opciones || {}, st = estado || S;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(corte))) throw new Error('Cierre.analizar: el corte debe ser un mes «AAAA-MM»');
    if (corte >= (op.mesActual || _mesActual())) throw new Error('Cierre.analizar: el corte debe ser un mes ya terminado');
    const fechaCorte = corte + '-31'; // comparación de texto: cualquier día de ese mes es ≤
    const huella = op.huella || Huella.calcular(st);
    const completo = Object.keys(huella.errores || {}).length === 0 && Huella.SONDAS_BASE.every(n => huella.sondas && n in huella.sondas);
    const regs = conEstadoAislado(st, () => _grafo(st));

    // Entidades: cerrada ⇔ saldo 0 (sonda) y ninguna fecha posterior ni ausente en su historia.
    const ents = new Map();
    regs.forEach(r => { if (r.entidad) { const e = ents.get(r.entidad) || { id: r.entidad, fuente: r.fuente, sonda: r.sonda, n: 0, tardio: false }; e.n++; if (!_fechaOk(r.fecha) || r.fecha.slice(0, 10) > fechaCorte) e.tardio = true; ents.set(r.entidad, e); } });
    ents.forEach(e => {
      const sd = e.sonda && huella.sondas && huella.sondas[e.sonda], dato = sd && sd.entidades && sd.entidades[e.id];
      if (!dato || typeof dato.saldo !== 'number') { e.cerrada = false; e.motivo = 'sin-sonda'; }
      else { e.valor = dato.saldo; if (Math.abs(dato.saldo) > Huella.TOL) { e.cerrada = false; e.motivo = 'saldo-pendiente'; } else if (e.tardio) { e.cerrada = false; e.motivo = 'registros-posteriores'; } else { e.cerrada = true; e.motivo = 'cerrada'; } }
    });

    // Estado individual de cada registro y propagación por componente.
    const comps = new Map();
    regs.forEach(r => {
      if (!_fechaOk(r.fecha)) r.estado = 'sin-fecha';
      else if (r.fecha.slice(0, 10) > fechaCorte) r.estado = 'posterior';
      else if (r.entidad && !ents.get(r.entidad).cerrada) r.estado = 'entidad-abierta:' + ents.get(r.entidad).motivo;
      else r.estado = 'libre';
      const c = comps.get(r.comp) || { n: 0, libre: 0 }; c.n++; if (r.estado === 'libre') c.libre++; comps.set(r.comp, c);
    });
    // Tamaño de las unidades atómicas sobre TODOS los registros (no solo los candidatos). Lo normal es de 1 a ~10 (un gasto y su pata del
    // libro, una transferencia = 5). Una componente enorme delata un enlace por valor falso (dos registros que comparten un texto largo): en
    // ese caso casi nada sería archivable y hay que investigar antes de confiar en el informe.
    const tam = new Map();
    regs.forEach(r => { const c = tam.get(r.comp) || { registros: 0, fuentes: {} }; c.registros++; c.fuentes[r.fuente] = (c.fuentes[r.fuente] || 0) + 1; tam.set(r.comp, c); });
    const mayores = Array.from(tam.values()).sort((a, b) => b.registros - a.registros).slice(0, 3);
    const advertencias = [];
    if (mayores.length && mayores[0].registros > COMPONENTE_GRANDE) advertencias.push('componente-grande');
    const vacio = () => ({ registros: 0, bytes: 0 });
    const suma = (o, r) => { o.registros++; o.bytes += r.bytes; };
    const total = vacio(), candidatos = vacio(), archivables = vacio(), porFuente = {}, motivos = {}, detalle = [];
    const compsArchivables = new Set();
    regs.forEach(r => {
      suma(total, r);
      const pf = porFuente[r.fuente] || (porFuente[r.fuente] = { total: vacio(), candidatos: vacio(), archivables: vacio() });
      suma(pf.total, r);
      if (r.estado === 'posterior') return;
      suma(candidatos, r); suma(pf.candidatos, r);
      const c = comps.get(r.comp);
      if (r.estado === 'libre' && c.libre === c.n) { suma(archivables, r); suma(pf.archivables, r); compsArchivables.add(r.comp); return; }
      const motivo = r.estado === 'libre' ? 'enlazado-con-registro-bloqueado-o-posterior' : r.estado;
      motivos[motivo] = (motivos[motivo] || 0) + 1;
      if (detalle.length < 50) detalle.push({ motivo, fuente: r.fuente, id: r.id, fecha: r.fecha || null });
    });
    return {
      version: VERSION, corte, fechaCorte, completo, huella: Huella.digest(huella), erroresHuella: huella.errores || {},
      advertencias, componentes: { total: tam.size, maxRegistros: mayores.length ? mayores[0].registros : 0, mayores },
      total, candidatos, archivables: Object.assign(archivables, { unidades: compsArchivables.size }),
      bloqueados: { registros: candidatos.registros - archivables.registros, porMotivo: motivos, detalle },
      porFuente, entidades: Array.from(ents.values()).map(e => ({ id: e.id, fuente: e.fuente, registros: e.n, saldo: e.valor == null ? null : e.valor, estado: e.cerrada ? 'cerrada' : 'abierta', motivo: e.motivo })),
    };
  }

  // Igual que analizar pero carga antes los módulos diferidos y exige todas las sondas: es lo que debe usar la pantalla.
  async function analizarCompleto(corte, estado, opciones) {
    const huella = await Huella.completa(estado);
    return analizar(corte, estado, Object.assign({}, opciones, { huella }));
  }

  /* ---- 4. TAMAÑO ---- */
  const _comprimirReal = async txt => { const m = await import('./payload-codec.js'); return (await m.codificarPayload(txt)).length; };

  // tamano(estado?, {hoy?, comprimir?}) → bruto (caracteres del JSON), por clave, comprimido (mismo códec del guardado), antigüedad y
  // proyección. `comprimir(texto) → Promise<bytes>` se puede inyectar (pruebas); por defecto usa js/core/payload-codec.js.
  async function tamano(estado, opciones) {
    const op = opciones || {}, st = estado || S, hoyStr = op.hoy || hoy();
    const texto = JSON.stringify(st), bruto = texto.length;
    const porClave = Object.keys(st).map(k => ({ clave: k, bytes: JSON.stringify(st[k] === undefined ? null : st[k]).length })).sort((a, b) => b.bytes - a.bytes);
    let comprimido = null, estimado = true;
    try { comprimido = await (op.comprimir || _comprimirReal)(texto); estimado = false; } catch (e) { /* sin códec (p. ej. navegador viejo): se estima abajo */ }
    if (comprimido == null) comprimido = Math.round(bruto * 0.14); // ≈ 7× (docs/libro-de-movimientos.md §6)
    const fechas = [];
    _fuentes.forEach(f => f.registros(st).forEach(r => { if (_fechaOk(r.fecha)) fechas.push(r.fecha.slice(0, 10)); }));
    fechas.sort();
    const masAntigua = fechas[0] || null;
    const dias = masAntigua ? Math.max(1, Math.round((new Date(hoyStr + 'T12:00:00') - new Date(masAntigua + 'T12:00:00')) / 864e5) + 1) : 0;
    const ratio = bruto ? comprimido / bruto : 0;
    // Lo que crece con el tiempo = las claves con historia (aproximación: incluye los campos fijos de cada entidad, que son pocos).
    const bytesHistoria = porClave.filter(k => ['historica', 'entidad-con-historia'].includes(CLASIFICACION[k.clave])).reduce((a, k) => a + k.bytes, 0);
    const lim = _limites();
    const porDia = dias ? bytesHistoria * ratio / dias : 0;
    const hasta = tope => (porDia > 0 ? Math.max(0, Math.round((tope - comprimido) / porDia)) : null);
    const fechaEn = d => { if (d == null) return null; const x = new Date(hoyStr + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
    const dAviso = hasta(lim.aviso), dLimite = hasta(lim.limite);
    return {
      bruto, comprimido, comprimidoEstimado: estimado, porClave, limites: lim,
      porcentajeDelLimite: comprimido / lim.limite * 100,
      antiguedad: { masAntigua, dias },
      proyeccion: { bytesComprimidosPorDia: porDia, diasHastaAviso: dAviso, fechaAviso: fechaEn(dAviso), diasHastaLimite: dLimite, fechaLimite: fechaEn(dLimite), confianza: dias >= 90 ? 'media' : 'baja' },
    };
  }

  // ¿Toca pasar a la etapa siguiente? Solo el tamaño comprimido lo dispara. La antigüedad es solo un aviso, y la lentitud de las listas
  // (que no se puede medir desde aquí) es OTRO problema con otro remedio: paginar o cargar bajo demanda; cerrar/archivar períodos
  // no la arregla si el estado completo sigue en memoria.
  function disparador(t) {
    const motivos = [], avisos = [];
    if (t.comprimido > DISPARADOR_BYTES) motivos.push('El payload comprimido (' + t.comprimido + ' bytes) pasó de ' + DISPARADOR_BYTES + '.');
    if (t.antiguedad.dias >= DISPARADOR_ANTIGUEDAD_DIAS) avisos.push('Hay datos de más de 2 años. Si las listas se sienten lentas, el remedio es paginarlas; cerrar períodos no lo arregla.');
    return { recomendado: motivos.length > 0, motivos, avisos };
  }

  return { VERSION, POLITICA, LIMITES, DISPARADOR_BYTES, CLASIFICACION, registrarFuente, fuentes: () => Array.from(_fuentes.values()), corteMasReciente, analizar, analizarCompleto, tamano, disparador };
})();
if (typeof window !== 'undefined') window.Cierre = Cierre; // un `const` de nivel superior no cuelga de window: los tests lo leen como ctx.Cierre
