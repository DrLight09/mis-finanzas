/* ═══════════════════════════════════════════════════════════════
   js/core/fuentes-filtro.js

   Única fuente de verdad de "qué cuentas se pueden ofrecer cuando la
   plata SALE" (gastos, préstamos dados, transferencias, pagar Spotify,
   pagar una TC, etc.).

   Reglas (2026-09-20):
   - Una cuenta rastreable (Nequi, efectivo, cajita de Nu, cuenta
     personalizada) solo se ofrece si su saldo alcanza el mínimo del
     flujo — así no se puede elegir una cuenta vacía y enterarse recién
     al confirmar.
   - Una tarjeta de crédito solo se ofrece si tiene cupo disponible
     (mínimo del flujo). El cupo es obligatorio al crear/editar una TC
     (ver guardarTC en tarjetas_credito.js), así que una TC sin cupo
     configurado se considera SIN cupo disponible (datos anteriores a
     esta regla).
   - Valores que no son una cuenta (''/"Sin especificar", 'ganancia',
     '__sin_especificar__', etc.) nunca se filtran.

   NO usar para selects donde la plata ENTRA (destinos de mesada, cobros
   de Spotify, abonos, "Agregar dinero", destino de Transferir): ahí
   filtrar por saldo impediría depositar en una cuenta vacía.

   Núcleo, carga de entrada (<script defer>) justo después de
   calc-helpers.js — usa getSaldoFuente/getFuentesSinTC (core-state.js)
   y tcCupoDisponible/getTCById (calc-helpers.js) SOLO al ser llamado,
   nunca al cargar. No modifica buildFuentesOptsHtml/poblarFuente: los
   consume (vía fuentesCustom) o poda el <select> ya poblado (patrón:
   poblarFuente(id) seguido de FuentesFiltro.podar(id, ...), ver openSheet
   en sheet-stack.js).
   ═══════════════════════════════════════════════════════════════ */
const FuentesFiltro = (() => {
  // Mínimos por flujo. Se comparan en centavos (los saldos son floats).
  const MIN = Object.freeze({
    GENERAL: 1,          // gastos, préstamos, transferencias, pagos varios
    SPOTIFY: 50,         // pagar Spotify
    PAGO_TC: 0.01,       // abonar a una TC: cualquier saldo positivo...
    PAGO_TC_EFECTIVO: 1000 // ...salvo efectivo (menos de $1.000 no es utilizable)
  });

  // Presets listos para usar como `opts`.
  const PRESET = Object.freeze({
    SALIDA:   Object.freeze({ minSaldo: MIN.GENERAL }),
    SPOTIFY:  Object.freeze({ minSaldo: MIN.SPOTIFY }),
    PAGO_TC:  Object.freeze({ minSaldo: MIN.PAGO_TC, minEfectivo: MIN.PAGO_TC_EFECTIVO, incluirTC: false })
  });

  const MSG_SIN_SALDO = 'No tenés cuentas con saldo disponible';

  const _cents = n => Math.round((Number(n) || 0) * 100);

  // ¿El valor es una cuenta con saldo/cupo evaluable? Lo demás (vacío,
  // 'ganancia', opciones especiales) nunca se filtra.
  function esCuenta(val) {
    if (!val || typeof val !== 'string') return false;
    return val === 'nequi' || val === 'efectivo' ||
      val.startsWith('cajita:') || val.startsWith('custom:') || val.startsWith('tc:');
  }

  // ¿Esta TC tiene cupo disponible >= min? Sin cupo configurado = sin cupo.
  function tcConCupo(tc, min) {
    if (!tc || !tc.cupo) return false;
    return _cents(tcCupoDisponible(tc)) >= _cents(min == null ? MIN.GENERAL : min);
  }

  // ¿Hay al menos una TC activa con cupo?
  function hayTCConCupo(min) {
    return (S.tarjetasCredito || []).some(tc => (tc.estado || 'activa') === 'activa' && tcConCupo(tc, min));
  }

  // Mínimo aplicable a una cuenta concreta (efectivo puede tener el suyo).
  function _minPara(val, opts) {
    const base = opts.minSaldo == null ? MIN.GENERAL : opts.minSaldo;
    if (val === 'efectivo' && opts.minEfectivo != null) return opts.minEfectivo;
    return base;
  }

  // ¿Se puede ofrecer esta fuente como origen de plata?
  //   opts.minSaldo    mínimo de saldo (default 1)
  //   opts.minEfectivo mínimo propio de efectivo (default = minSaldo)
  //   opts.minCupo     mínimo de cupo de una TC (default = minSaldo)
  //   opts.incluirTC   false = las TC nunca se ofrecen (default true)
  function utilizable(val, opts) {
    opts = opts || PRESET.SALIDA;
    if (!esCuenta(val)) return true;
    if (val.startsWith('tc:')) {
      if (opts.incluirTC === false) return false;
      const min = opts.minCupo != null ? opts.minCupo : (opts.minSaldo == null ? MIN.GENERAL : opts.minSaldo);
      return tcConCupo(getTCById(val.slice(3)), min);
    }
    return _cents(getSaldoFuente(val)) >= _cents(_minPara(val, opts));
  }

  // Filtra una lista [{val,label}] (getFuentes()/getFuentesSinTC()).
  function filtrar(fuentes, opts) {
    return (fuentes || []).filter(f => utilizable(f.val, opts));
  }

  // <option>s (con placeholder) de una lista ya filtrada, reusando el
  // constructor canónico del núcleo (escapa label/val). Si no queda
  // ninguna cuenta y `sinOpcionesTexto` viene dado, el placeholder lo usa.
  function optsHtml(fuentes, opts) {
    opts = opts || {};
    const lista = filtrar(fuentes, opts);
    const placeholder = (!lista.length && opts.sinOpcionesTexto) ? opts.sinOpcionesTexto : (opts.placeholder || 'Sin especificar');
    return buildFuentesOptsHtml({ selectedVal: opts.selectedVal || '', placeholder, fuentesCustom: lista });
  }

  // Quita de un <select> ya poblado las opciones-cuenta no utilizables.
  // Devuelve cuántas cuentas quedan. Si la opción seleccionada se quitó,
  // vuelve al placeholder. Si no queda ninguna cuenta y opts.sinOpcionesTexto
  // viene dado, lo usa como texto del placeholder.
  function podar(sel, opts) {
    sel = typeof sel === 'string' ? document.getElementById(sel) : sel;
    if (!sel) return 0;
    opts = opts || PRESET.SALIDA;
    let quedan = 0;
    let quitoSeleccionada = false;
    Array.from(sel.options).forEach(o => {
      if (!esCuenta(o.value)) return;
      if (utilizable(o.value, opts)) { quedan++; return; }
      if (o.selected) quitoSeleccionada = true;
      o.remove();
    });
    if (quitoSeleccionada) sel.selectedIndex = 0;
    if (!quedan && opts.sinOpcionesTexto && sel.options.length && !sel.options[0].value) {
      sel.options[0].textContent = opts.sinOpcionesTexto;
    }
    return quedan;
  }

  // ¿La cuenta tiene saldo suficiente para "moverla" (botones de Transferir)?
  function puedeMover(val, min) {
    return _cents(getSaldoFuente(val)) >= _cents(min == null ? MIN.GENERAL : min);
  }

  return { MIN, PRESET, MSG_SIN_SALDO, esCuenta, tcConCupo, hayTCConCupo, utilizable, filtrar, optsHtml, podar, puedeMover };
})();
