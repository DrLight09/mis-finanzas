/* ═══════════════════════════════════════════════════════════════
   js/core/huella.js

   HUELLA DE INVARIANTES — "qué tiene que seguir igual" cuando se transforma el almacenamiento del historial.

   Una operación que reorganice los datos (cierre de períodos, archivo por año, importar un backup, una migración) es
   correcta si, antes y después, la plata y los resultados que ve el usuario son los mismos. La huella es la medida de esa
   igualdad: un objeto plano, comparable, con lo que NO puede cambiar. Es la herramienta común de verificación de
   docs/cierre-de-periodos.md; la usan las pruebas y la vista previa de js/core/cierre.js, y la usará quien ejecute el archivo.

   ── Diseño ──────────────────────────────────────────────────────────────────────────────────────────────────────────
   · Registro de SONDAS. Cada sonda es una función PURA `estado → objeto plano` que mide una familia de invariantes. El
     núcleo registra las suyas aquí (saldos, períodos, deudas, patrimonio); cada módulo registra la propia al cargarse
     (tarjetas, encargos, alcancía, Wrapped) porque solo él conoce su regla de derivación (borrado lógico y piso en 0 en las
     tarjetas, bolsa propia en los encargos…). Un módulo nuevo se integra registrando una sonda, sin tocar este archivo.
   · Una sonda mide lo que debe SOBREVIVIR, nunca cuántos registros hay: el conteo cambia legítimamente al archivar.
   · Convención de entidades: si la sonda trata entidades (tarjetas, encargos, deudas), las expone en `entidades:{id:{saldo,…}}`.
     La vista previa del cierre (cierre.js) lee de ahí el saldo de cada entidad en vez de recalcularlo: una sola fuente.
   · SONDAS_BASE es la lista canónica. `completa()` carga los módulos diferidos y exige TODAS: una sonda ausente es un error,
     nunca un "no hubo diferencias" (un módulo sin cargar no puede hacer pasar la verificación en silencio).
   · Una sonda que lanza excepción queda en `errores` y la comparación NO es ok.
   · Las sondas usan las funciones reales de la app, que leen el S global. Por eso `calcular(estado)` las corre dentro de
     conEstadoAislado (js/core/persistencia.js): la copia hace de S, nada se guarda y no existe una segunda versión de ninguna regla.

   API (todo síncrono salvo completa):
     Huella.registrar(nombre, fn)                    — fn(estado) → objeto plano; vuelve a registrar = reemplaza
     Huella.calcular(estado?, {solo?, requeridas?})  — { version, sondas, errores }
     Huella.comparar(a, b, {tol?})                   — { ok, diferencias:[{ruta,antes,despues}], errores:[...] }
     Huella.verificarTransformacion(estado, fn, op)  — clona, calcula, aplica fn al clon (aislado), calcula y compara
     Huella.completa(estado?)                        — async: carga módulos diferidos y calcula con SONDAS_BASE requeridas
     Huella.digest(huella)                           — resumen corto estable (para registros y mensajes)
   Sin DOM. Se carga BAJO DEMANDA (Loader, grupo 'cierre', junto con cierre.js): solo al abrir Configuración o al usarla. Los módulos registran
   sus sondas con registrarSonda (js/core/persistencia.js), que las deja en cola si este archivo aún no existe; al cargarse, aquí se vacía la cola.
   ═══════════════════════════════════════════════════════════════ */
const Huella = (() => {
  const VERSION = 1;
  const TOL = 0.01; // diferencia máxima entre dos montos para darlos por iguales
  const SONDAS_BASE = ['saldos', 'periodos', 'deudas', 'patrimonio', 'tarjetas', 'encargos', 'alcancia', 'wrapped'];
  const _reg = new Map();

  function registrar(nombre, fn) {
    if (typeof nombre !== 'string' || !nombre) throw new Error('Huella.registrar: falta el nombre de la sonda');
    if (typeof fn !== 'function') throw new Error('Huella.registrar: la sonda "' + nombre + '" debe ser una función');
    _reg.set(nombre, fn);
  }
  const registradas = () => Array.from(_reg.keys());

  // Objeto plano y determinista: claves ordenadas, undefined → null, números no finitos como texto (así NaN no se confunde con 0).
  function _plano(x) {
    if (x === undefined || x === null) return null;
    if (typeof x === 'number') return Number.isFinite(x) ? x : String(x);
    if (typeof x === 'string' || typeof x === 'boolean') return x;
    if (Array.isArray(x)) return x.map(_plano);
    if (typeof x === 'object') {
      const out = {};
      Object.keys(x).sort().forEach(k => { if (typeof x[k] !== 'function') out[k] = _plano(x[k]); });
      return out;
    }
    return String(x);
  }

  function calcular(estado, opciones) {
    const op = opciones || {}, st = estado || S;
    const sondas = {}, errores = {};
    const nombres = op.solo || registradas();
    conEstadoAislado(st, () => {
      nombres.forEach(n => {
        const fn = _reg.get(n);
        if (!fn) { errores[n] = 'sonda no registrada'; return; }
        try { sondas[n] = _plano(fn(st)); } catch (e) { errores[n] = String((e && e.message) || e); }
      });
    });
    (op.requeridas || []).forEach(n => { if (!_reg.has(n)) errores[n] = 'sonda requerida no registrada (¿módulo sin cargar?)'; });
    return { version: VERSION, sondas, errores };
  }

  function comparar(a, b, opciones) {
    const tol = opciones && opciones.tol != null ? opciones.tol : TOL;
    const diferencias = [], errores = [];
    [['antes', a], ['despues', b]].forEach(([lado, h]) => {
      Object.keys((h && h.errores) || {}).forEach(n => errores.push(lado + ': ' + n + ' — ' + h.errores[n]));
    });
    const diferencial = (ruta, x, y) => diferencias.push({ ruta, antes: x, despues: y });
    (function rec(x, y, ruta) {
      if (typeof x === 'number' && typeof y === 'number') { if (Math.abs(x - y) > tol) diferencial(ruta, x, y); return; }
      if (Array.isArray(x) && Array.isArray(y)) {
        if (x.length !== y.length) { diferencial(ruta + '.length', x.length, y.length); return; }
        x.forEach((v, i) => rec(v, y[i], ruta + '[' + i + ']'));
        return;
      }
      if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
        const claves = new Set(Object.keys(x).concat(Object.keys(y)));
        claves.forEach(k => rec(k in x ? x[k] : undefined, k in y ? y[k] : undefined, ruta ? ruta + '.' + k : k));
        return;
      }
      if (x !== y) diferencial(ruta, x === undefined ? '(no existe)' : x, y === undefined ? '(no existe)' : y);
    })((a && a.sondas) || {}, (b && b.sondas) || {}, '');
    return { ok: diferencias.length === 0 && errores.length === 0, diferencias, errores };
  }

  // Aplica `transformar` a una COPIA del estado (aislada: las funciones de la app la ven como S y nada se guarda) y compara
  // la huella de antes con la de después. El estado recibido no se modifica. `transformar(copia)` debe ser síncrona.
  function verificarTransformacion(estado, transformar, opciones) {
    if (typeof transformar !== 'function') throw new Error('Huella.verificarTransformacion: falta la transformación');
    const op = opciones || {};
    const copia = JSON.parse(JSON.stringify(estado || S));
    const antes = calcular(copia, op);
    conEstadoAislado(copia, () => transformar(copia));
    const despues = calcular(copia, op);
    return Object.assign({ antes, despues }, comparar(antes, despues, op));
  }

  // Grupos diferidos (Loader.GROUPS) cuyos módulos registran una sonda. Se cargan SIEMPRE y por nombre: Loader.ensureAll() se salta
  // 'wrapped' fuera de su ventana de disponibilidad (_wrappedDisponible), y sin su sonda la huella nunca sería completa.
  const GRUPOS_CON_SONDA = ['tarjetas', 'encargos', 'alcancia', 'wrapped'];

  // Carga los módulos diferidos (cada uno registra su sonda al cargarse) y calcula con todas las sondas base exigidas.
  async function completa(estado) {
    if (typeof Loader !== 'undefined' && Loader.ensure) await Promise.all(GRUPOS_CON_SONDA.map(g => Loader.ensure(g).catch(() => {})));
    return calcular(estado, { requeridas: SONDAS_BASE });
  }

  // FNV-1a de 32 bits sobre el JSON con los montos a centavos: dos huellas iguales dan el mismo texto.
  function digest(h) {
    const txt = JSON.stringify(h && h.sondas, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));
    let x = 0x811c9dc5;
    for (let i = 0; i < txt.length; i++) { x ^= txt.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
    return x.toString(16).padStart(8, '0');
  }

  /* ---- SONDAS DEL NÚCLEO ---- */

  // Saldo guardado y suma del libro de cada cuenta y cajita (Libro.verificar), más si todo cuadra.
  registrar('saldos', st => {
    const v = Libro.verificar(st), porCuenta = {};
    v.filas.forEach(f => { porCuenta[f.cuenta] = { guardado: f.guardado, libro: f.libro }; });
    return { libroOk: v.ok, porCuenta };
  });

  // Ingresos, gastos, balance y gasto por categoría de CADA mes con datos: lo que leen Inicio, Análisis, Salud y el cierre de mes.
  // Un cierre que dejara un mes sin resultado, o con otro, aparece aquí.
  registrar('periodos', st => {
    const meses = new Set(Object.keys(Periodo.ingresosPorMes(st)).concat(Object.keys(Periodo.gastosPorMes(st))));
    const out = {};
    Array.from(meses).sort().forEach(mes => {
      const b = Periodo.balanceDelMes(mes, st);
      out[mes] = {
        mesada: b.ingresos.mesada, fijos: b.ingresos.fijos, spotify: b.ingresos.spotify, entradas: b.ingresos.entradas, ingresos: b.ingresos.total,
        gastoVariableTotal: b.gastos.gastoVariableTotal, gastoFijoTotal: b.gastos.gastoFijoTotal, gastos: b.gastos.total, balance: b.balance,
        porCategoria: Periodo.gastoPorCategoria(mes, st),
      };
    });
    return out;
  });

  // Saldo pendiente de cada deuda (Me deben / Yo debo) y los totales de cada lado.
  registrar('deudas', st => {
    const entidades = {};
    ['favor', 'contra'].forEach(dir => Deudas.lista(dir).forEach(d => { entidades[dir + ':' + d.id] = { saldo: Deudas.saldo(d), personaId: d.personaId || null }; }));
    return { entidades, totalFavor: Deudas.totalPendiente('favor'), totalContra: Deudas.totalPendiente('contra') };
  });

  // El patrimonio con su desglose (una sola definición: calcPatrimonioDesglose).
  registrar('patrimonio', () => calcPatrimonioDesglose());

  // Sondas que los módulos dejaron en cola (registrarSonda, js/core/persistencia.js) antes de que este archivo existiera.
  if (typeof window !== 'undefined') {
    (window._sondasPendientes || []).forEach(([nombre, fn]) => registrar(nombre, fn));
    window._sondasPendientes = [];
  }

  return { VERSION, TOL, SONDAS_BASE, GRUPOS_CON_SONDA, registrar, registradas, calcular, comparar, verificarTransformacion, completa, digest };
})();
if (typeof window !== 'undefined') window.Huella = Huella; // un `const` de nivel superior no cuelga de window: los tests lo leen como ctx.Huella
