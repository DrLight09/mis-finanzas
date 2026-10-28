/* ═══════════════════════════════════════════════════════════════
   js/core/cobros.js

   COBRO de un ingreso fijo (sueldo, freelance, etc.): la plata que de verdad te pagaron.

   Un ingreso fijo (S.ingresosFijos) es solo la PLANTILLA: nombre, monto esperado y desde cuándo. No suma nada por sí
   solo. El ingreso nace cuando registras su cobro, igual que la Mesada cuando registras su pago:

     S.ingresosFijos[i].cobros = [{
       id,
       mesCubre: '2026-10',   // a qué mes corresponde el pago (solo para saber qué mes está cobrado o pendiente)
       monto, fecha,          // cuánto y CUÁNDO entró la plata: la fecha decide el mes en que cuenta como ingreso
       destino,               // cuenta donde entró ('' = no especificar / ya estaba en tu saldo / lo gasté)
       splits?, nota,         // o repartido entre varias cuentas: [{ fuente, monto, _movSecId }]
       _movSecId?             // id del movimiento espejo en la cuenta destino
     }]

   Tres fechas, tres papeles (misma regla que la Mesada):
     · mesCubre → etiqueta. Nunca decide en qué mes cuenta el ingreso.
     · fecha    → la que escribe quien registra; es el mes en que cuenta (regla de caja).
     · cuándo se registra → no decide nada: solo es el valor por defecto del campo de fecha.

   Quién lo lee: Periodo.ingresosFijosEntradas() (js/core/periodo.js) → Inicio, Salud, Análisis, cierre de mes y Wrapped.
   Si el ingreso fijo se elimina, sus cobros se van con él (el cobro que tocó una cuenta se revierte antes de eliminar,
   ver cobroRevertirTodos).

   Reglas (como Mesada):
     · Toda plata que entra a una cuenta rastreable deja un movimiento espejo (clase 'neutro': el ingreso se cuenta UNA
       sola vez, en Periodo, por la fecha del cobro). Nunca sube un saldo "de la nada".
     · Borrar un cobro revierte la plata en la cuenta exacta donde había entrado.
     · Las tarjetas de crédito no son destino válido (es plata que entra).
     · Registrar el cobro es el ÚNICO camino para un ingreso fijo: «Agregar dinero» es otro ingreso distinto.

   Las funciones de dominio validan antes de mutar (un rechazo no deja efectos a medias) y devuelven
   { ok:true, ... } o { ok:false, motivo }. No llaman a save(), refresh(), toast() ni tocan el DOM.
   Carga de entrada (<script defer>) después de cuenta-efectos.js: usa uid(), hoy(), S, sumarFuente(), descontarFuente(),
   registrarMovEspejo() y borrarMovEspejo().
   ═══════════════════════════════════════════════════════════════ */

// Libro (core-state.js): cada sumar/descontarFuente deja { modulo:'ingreso-fijo', ref:<id del espejo> }; rev=true es la reversión.
const _ogCobro = (ref, rev) => ({ origen: { modulo: 'ingreso-fijo', ref, rev: rev || undefined } });

const COBRO_MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function _cobroEntrar(destino, monto, fecha, desc) {
  if (!destino || !monto) return null;
  // El espejo se crea primero para que el libro apunte a su id (el orden no afecta al saldo).
  const movId = registrarMovEspejo({ cuenta: destino, flujo: 'entrada', monto, fecha, desc, origen: 'Ingreso fijo' });
  sumarFuente(destino, monto, _ogCobro(movId || undefined));
  return movId;
}

function _cobroSacar(destino, monto, movId) {
  if (!destino) return;
  descontarFuente(destino, monto, _ogCobro(movId, true));
  borrarMovEspejo(destino, movId);
}

function ingresoFijoPorId(id, estado) {
  return ((estado || S).ingresosFijos || []).find(x => x && x.id === id) || null;
}

// Cobros de un ingreso fijo (siempre un arreglo).
function cobrosDeIngresoFijo(ing) {
  return ing && Array.isArray(ing.cobros) ? ing.cobros : [];
}

// ¿Ese ingreso fijo ya se espera en el mes `mes` ('YYYY-MM')? Sin `desde`, siempre.
function ingresoFijoEsperadoEn(ing, mes) {
  return !!ing && (!ing.desde || ing.desde <= mes);
}

// Estado de un ingreso fijo respecto a un mes que CUBRE: { esperado, cobrado (suma), cobros:[...] }.
function ingresoFijoEstadoMes(ing, mes) {
  const cobros = cobrosDeIngresoFijo(ing).filter(c => c.mesCubre === mes);
  return { esperado: ingresoFijoEsperadoEn(ing, mes), cobrado: cobros.reduce((a, c) => a + (c.monto || 0), 0), cobros };
}

// 'YYYY-MM' → 'Oct 2026' (_mesNombreDeKey espera el índice de mes 0-11, como la clave de la Mesada).
function cobroMesTexto(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ''));
  return m ? _mesNombreDeKey(m[1] + '-' + (Number(m[2]) - 1)) : '';
}

// Cuentas realmente afectadas por un cobro (para la protección por antigüedad al borrar).
function cobroFuentesDe(c) {
  if (!c) return [];
  if (c.splits && c.splits.length) return c.splits.filter(s => s.fuente).map(s => s.fuente);
  return c.destino ? [c.destino] : [];
}

// p = { id (del ingreso fijo), mesCubre, monto, fecha, nota, destino, splitMode, splits }
function cobroRegistrar(p) {
  const ing = ingresoFijoPorId(p && p.id);
  if (!ing) return { ok: false, motivo: 'ingreso-inexistente' };
  const monto = p.monto || 0;
  if (!(monto > 0)) return { ok: false, motivo: 'monto-invalido' };
  if (!COBRO_MES_RE.test(String(p.mesCubre || ''))) return { ok: false, motivo: 'mes-invalido' };
  const fecha = p.fecha || hoy();
  const splits = p.splitMode ? (p.splits || []).map(s => ({ fuente: s.fuente, monto: s.monto })) : null;
  // 1) Validar TODO antes de tocar nada.
  if (splits && splits.reduce((a, s) => a + s.monto, 0) > monto + 1) return { ok: false, motivo: 'split-excede' };

  // 2) Aplicar.
  const desc = (ing.nombre || 'Ingreso fijo') + ' — cobro de ' + cobroMesTexto(p.mesCubre);
  const cobro = { id: uid(), mesCubre: p.mesCubre, monto, fecha, nota: p.nota || '' };
  if (splits) {
    cobro.destino = '';
    cobro.splits = splits;
    splits.forEach(s => { if (s.fuente) s._movSecId = _cobroEntrar(s.fuente, s.monto, fecha, desc); });
  } else {
    cobro.destino = p.destino || '';
    if (cobro.destino) cobro._movSecId = _cobroEntrar(cobro.destino, monto, fecha, desc);
  }
  if (!Array.isArray(ing.cobros)) ing.cobros = [];
  ing.cobros.push(cobro);
  return { ok: true, cobro };
}

// Revierte los efectos de UN cobro sobre las cuentas (no lo quita de la lista).
function cobroRevertir(c) {
  if (!c) return;
  if (c.splits && c.splits.length) { c.splits.forEach(s => { if (s.fuente) _cobroSacar(s.fuente, s.monto, s._movSecId); }); return; }
  _cobroSacar(c.destino, c.monto, c._movSecId);
}

// Borra un cobro: revierte la plata donde entró y lo quita del ingreso fijo.
function cobroBorrar(id, cobroId) {
  const ing = ingresoFijoPorId(id);
  const c = ing && cobrosDeIngresoFijo(ing).find(x => x.id === cobroId);
  if (!c) return false;
  cobroRevertir(c);
  ing.cobros = ing.cobros.filter(x => x.id !== cobroId);
  return true;
}

// Revierte todos los cobros de un ingreso fijo (antes de eliminarlo: ninguna plata queda sumada sin su registro).
function cobroRevertirTodos(ing) {
  cobrosDeIngresoFijo(ing).forEach(cobroRevertir);
  if (ing) ing.cobros = [];
}

// La plata cuenta en el mes de la FECHA en que te pagaron, no en el mes que cubre. Si son distintos, este texto lo dice antes
// de guardar (es solo informativo: cobrar con atraso es un caso legítimo). '' si coinciden o falta un dato.
function cobroAvisoMes(mesCubre, fecha) {
  const f = /^(\d{4})-(\d{2})-\d{2}/.exec(String(fecha || ''));
  if (!COBRO_MES_RE.test(String(mesCubre || '')) || !f) return '';
  const mesFecha = f[1] + '-' + f[2];
  if (mesFecha === mesCubre) return '';
  const donde = mesFecha === mesActual() ? 'este mes' : cobroMesTexto(mesFecha);
  return 'Cubre ' + cobroMesTexto(mesCubre) + ', pero cuenta como ingreso de ' + donde + ': el mes en que te pagaron.';
}
