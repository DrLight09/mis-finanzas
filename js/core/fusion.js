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
//   4b. Listas sin `id` con CLAVE NATURAL (`CLAVES_NATURALES`: `patrimonioHistorial` y `historialTasas`, una fila por `fecha`): como las listas con `id`
//      pero por esa clave, para que dos dispositivos que registran el MISMO día no dejen dos filas. Si los dos lo registraron distinto elige de
//      forma determinista (la de mayor texto JSON: no es «mejor», pero es la misma en los dos dispositivos) y la lista queda ordenada por fecha.
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
const conId = (lista, campo = 'id') => lista.length > 0 && lista.every(x => esObjeto(x) && x[campo] != null);
// Listas sin `id` cuya fila se identifica por un campo (una por fecha). Se busca por NOMBRE DE CAMPO en cualquier nivel.
export const CLAVES_NATURALES = { patrimonioHistorial: 'fecha', historialTasas: 'fecha' };

function fusionarListaConId(base, local, remoto, aditivos, maximos, campo = 'id') {
  const natural = campo !== 'id';
  const pb = new Map(base.map(x => [x[campo], x]));
  const pl = new Map(local.map(x => [x[campo], x]));
  const pr = new Map(remoto.map(x => [x[campo], x]));
  const out = [];
  const visto = new Set();
  const poner = (id) => {
    if (visto.has(id)) return;
    visto.add(id);
    const b = pb.get(id), l = pl.get(id), r = pr.get(id);
    if (l !== undefined && r !== undefined) {
      if (natural) { out.push(clon(igual(l, r) || igual(b, r) ? l : igual(b, l) ? r : (JSON.stringify(l) >= JSON.stringify(r) ? l : r))); return; }
      out.push(fusionarRegistro(b, l, r, aditivos, maximos)); return;
    }
    if (l === undefined && r === undefined) return;               // borrado en los dos
    const queda = l !== undefined ? l : r;                         // existe solo de un lado
    if (b === undefined) { out.push(clon(queda)); return; }       // alta: se conserva
    if (igual(b, queda)) return;                                   // lo borró el otro lado y este no lo tocó: se borra
    out.push(clon(queda));                                         // lo borró un lado pero el otro lo editó: se conserva lo editado
  };
  // Orden: el de la nube (lo que ya vieron los demás), y al final lo que solo existe aquí.
  remoto.forEach(x => poner(x[campo]));
  local.forEach(x => poner(x[campo]));
  if (natural) out.sort((p, q) => (p[campo] < q[campo] ? -1 : p[campo] > q[campo] ? 1 : 0));
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

function fusionarValor(b, l, r, aditivos, maximos, campoClave) {
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
      const v = fusionarValor(base[c], l[c], r[c], ADITIVOS_POR_RUTA(c, aditivos), MAXIMOS_POR_RUTA(c, aditivos), Object.prototype.hasOwnProperty.call(CLAVES_NATURALES, c) ? CLAVES_NATURALES[c] : undefined);
      if (v !== undefined) out[c] = v;
    }
    return out;
  }
  if (Array.isArray(l) && Array.isArray(r)) {
    const base = Array.isArray(b) ? b : [];
    if (campoClave && conId(l.concat(r), campoClave) && (base.length === 0 || conId(base, campoClave))) return fusionarListaConId(base, l, r, aditivos, maximos, campoClave);
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

// Reversiones del libro hechas A LA VEZ por los dos dispositivos. Si los dos eliminan el MISMO movimiento antes de sincronizar, cada uno anota su
// propia reversión de la plata (ids distintos), y al unir los libros la plata se devolvía DOS veces: el saldo quedaba por encima de lo real y el
// libro con una pata sin registro (Libro.verificarEspejo). Dos reversiones NUEVAS (que no estaban en la base), una en cada lado, con la misma
// cuenta, monto, módulo y ref son el mismo suceso: se queda una (la de menor id, para que el resultado no dependa de qué lado es el local).
// Es una heurística consciente: dos reversiones idénticas e independientes del mismo ref a la vez son muchísimo menos probables que una
// eliminación doble, y la otra elección (dejar las dos) deja plata de más.
function _firmaReversion(l) {
  const o = esObjeto(l.origen) ? l.origen : {};
  return l.tipo === 'reversion' && o.ref ? [l.cuenta, l.monto, o.modulo, o.ref].join('|') : null;
}
function deduplicarReversionesConcurrentes(base, local, remoto, fusionado) {
  if (!Array.isArray(fusionado.libro)) return fusionado;
  const lista = x => (x && Array.isArray(x.libro) ? x.libro : []);
  const enBase = new Set(lista(base).filter(esObjeto).map(l => l.id));
  const nuevos = estado => lista(estado).filter(l => esObjeto(l) && !enBase.has(l.id));
  const delRemoto = new Map();
  nuevos(remoto).forEach(l => { const f = _firmaReversion(l); if (f) { if (!delRemoto.has(f)) delRemoto.set(f, []); delRemoto.get(f).push(l); } });
  const sobrantes = new Set();
  nuevos(local).forEach(l => {
    const f = _firmaReversion(l), candidatos = f ? delRemoto.get(f) : null;
    if (!candidatos || !candidatos.length || candidatos.some(c => c.id === l.id)) return; // mismo id: la fusión ya lo unió
    const r = candidatos.shift();
    sobrantes.add(l.id < r.id ? r.id : l.id); // se descarta el de mayor id
  });
  if (!sobrantes.size) return fusionado;
  return Object.assign({}, fusionado, { libro: fusionado.libro.filter(l => !(esObjeto(l) && sobrantes.has(l.id))) });
}

// Punto de entrada. `base`, `local` y `remoto` son los estados ya como objetos. Devuelve un objeto nuevo.
export function fusionarEstados(base, local, remoto) {
  const b = base || {}, l = local || {}, r = remoto || {};
  return deduplicarReversionesConcurrentes(b, l, r, fusionarValor(b, l, r));
}
