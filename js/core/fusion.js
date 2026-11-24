// js/core/fusion.js — fusión de tres vías del estado (módulo ES sin <script> propio: lo importa firebase-sync.js).
//
// Problema: dos dispositivos o pestañas parten del mismo estado (la BASE), cada uno cambia algo y guarda. Antes «gana el último» y
// lo del otro se perdía aunque no tuviera nada que ver (un saldo agregado aquí, un nombre cambiado allá).
// Solución: fusionarEstados(base, local, remoto). La BASE es el último estado de la nube que este dispositivo vio; con ella se sabe QUÉ
// cambió cada lado, y solo chocan los cambios sobre la MISMA cosa. No hace falta marcar borrados ni guardar horas por registro:
// un registro que estaba en la base y ya no está en un lado se borró en ese lado.
//
// Reglas (en este orden, para cualquier valor):
//   1. Lo que no cambió en un lado se toma del otro. Lo que cambió igual en los dos queda igual.
//   2. Objetos: cada clave se fusiona por separado (por eso un cambio de nombre y un saldo nuevo conviven).
//   3. Listas de objetos con `id`: se fusionan registro por registro. Alta en un lado → se conserva. Baja en un lado y sin tocar en
//      el otro → se borra. Baja en uno y editado en el otro → se conserva el editado (no se pierde trabajo). Editado en los dos → regla 2.
//   4. Listas sin `id` (nombres de categorías, historiales por fecha…): como conjuntos. Lo agregado por cualquiera se conserva; lo
//      quitado por alguien se quita.
//   5. Choque real (los dos cambiaron el MISMO valor a cosas distintas): gana el local, el cambio que se está guardando ahora.
//   6. Números que se acumulan (`ADITIVOS`: p. ej. el monto de una entrada de intereses del libro, que crece en el sitio): se suman
//      los dos cambios sobre la base en vez de elegir uno (y se redondea a centavos: base + Δlocal + Δremoto en coma flotante deja residuos).
//   7. Fechas que solo avanzan (`MAXIMOS`: la fecha de esa misma entrada de intereses, que cada dispositivo adelanta al sumar): si los dos
//      la cambiaron queda la mayor. Sin esto el resultado dependía de qué lado era «local» (no era conmutativa).
//
// Es una función pura (sin DOM, sin red, no modifica sus entradas): se prueba sola en tests/fusion.test.js.

// Campos numéricos que dos dispositivos pueden aumentar a la vez: lista → campos. Fusión: base + (local − base) + (remoto − base).
export const ADITIVOS = { libro: ['monto'] };
// Campos de fecha ISO (YYYY-MM-DD, comparables como texto) que solo avanzan: lista → campos. Solo cuenta si los DOS lados la cambiaron.
export const MAXIMOS = { libro: ['fecha'] };

const esObjeto = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const clon = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const conId = lista => lista.length > 0 && lista.every(x => esObjeto(x) && x.id != null);

function fusionarListaConId(base, local, remoto, aditivos, maximos) {
  const pb = new Map(base.map(x => [x.id, x]));
  const pl = new Map(local.map(x => [x.id, x]));
  const pr = new Map(remoto.map(x => [x.id, x]));
  const out = [];
  const visto = new Set();
  const poner = (id) => {
    if (visto.has(id)) return;
    visto.add(id);
    const b = pb.get(id), l = pl.get(id), r = pr.get(id);
    if (l !== undefined && r !== undefined) { out.push(fusionarRegistro(b, l, r, aditivos, maximos)); return; }
    if (l === undefined && r === undefined) return;               // borrado en los dos
    const queda = l !== undefined ? l : r;                         // existe solo de un lado
    if (b === undefined) { out.push(clon(queda)); return; }       // alta: se conserva
    if (igual(b, queda)) return;                                   // lo borró el otro lado y este no lo tocó: se borra
    out.push(clon(queda));                                         // lo borró un lado pero el otro lo editó: se conserva lo editado
  };
  // Orden: el de la nube (lo que ya vieron los demás), y al final lo que solo existe aquí.
  remoto.forEach(x => poner(x.id));
  local.forEach(x => poner(x.id));
  return out;
}

function fusionarRegistro(b, l, r, aditivos, maximos) {
  if (b === undefined) return fusionarValor(undefined, l, r);     // el mismo id dado de alta en los dos lados con contenido distinto
  const res = fusionarValor(b, l, r);
  if (aditivos && esObjeto(res)) {
    for (const campo of aditivos) {
      if (typeof b[campo] === 'number' && typeof l[campo] === 'number' && typeof r[campo] === 'number') {
        res[campo] = Math.round((b[campo] + (l[campo] - b[campo]) + (r[campo] - b[campo])) * 100) / 100;
      }
    }
  }
  if (maximos && esObjeto(res)) {
    for (const campo of maximos) {
      if (typeof l[campo] === 'string' && typeof r[campo] === 'string' && l[campo] !== b[campo] && r[campo] !== b[campo]) {
        res[campo] = l[campo] > r[campo] ? l[campo] : r[campo];
      }
    }
  }
  return res;
}

function fusionarConjunto(base, local, remoto) {
  const k = x => JSON.stringify(x);
  const enBase = new Set(base.map(k)), enLocal = new Set(local.map(k)), enRemoto = new Set(remoto.map(k));
  const quitados = new Set([...enBase].filter(x => !enLocal.has(x) || !enRemoto.has(x)));
  const out = [], visto = new Set();
  [...remoto, ...local].forEach(x => {
    const c = k(x);
    if (visto.has(c) || quitados.has(c)) return;
    visto.add(c); out.push(clon(x));
  });
  return out;
}

function fusionarValor(b, l, r, aditivos, maximos) {
  if (igual(l, r)) return clon(l);
  if (igual(b, l)) return clon(r);   // solo cambió el remoto
  if (igual(b, r)) return clon(l);   // solo cambió el local
  if (b !== undefined && l === undefined) return clon(r);   // borrado aquí y editado allá: se conserva lo editado (no se pierde trabajo)
  if (b !== undefined && r === undefined) return clon(l);
  if (esObjeto(l) && esObjeto(r)) {
    const base = esObjeto(b) ? b : {};
    const out = {};
    const claves = new Set([...Object.keys(r), ...Object.keys(l), ...Object.keys(base)]);
    for (const c of claves) {
      const v = fusionarValor(base[c], l[c], r[c], ADITIVOS_POR_RUTA(c, aditivos), MAXIMOS_POR_RUTA(c, aditivos));
      if (v !== undefined) out[c] = v;
    }
    return out;
  }
  if (Array.isArray(l) && Array.isArray(r)) {
    const base = Array.isArray(b) ? b : [];
    if (conId(l.concat(r)) && (base.length === 0 || conId(base))) return fusionarListaConId(base, l, r, aditivos, maximos);
    return fusionarConjunto(base, l, r);
  }
  return clon(l);                    // choque real: gana el local
}

// En el nivel de las claves de S, `libro` baja con la lista de campos aditivos; más abajo ya no se propaga.
function ADITIVOS_POR_RUTA(clave, actual) {
  if (actual === undefined && Object.prototype.hasOwnProperty.call(ADITIVOS, clave)) return ADITIVOS[clave];
  return undefined;
}

function MAXIMOS_POR_RUTA(clave, actual) {
  if (actual === undefined && Object.prototype.hasOwnProperty.call(MAXIMOS, clave)) return MAXIMOS[clave];
  return undefined;
}

// Punto de entrada. `base`, `local` y `remoto` son los estados ya como objetos. Devuelve un objeto nuevo.
export function fusionarEstados(base, local, remoto) {
  return fusionarValor(base || {}, local || {}, remoto || {});
}
