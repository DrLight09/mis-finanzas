// Respaldos automáticos (ES module, igual que payload-codec.js: solo existe como dependencia vía `import` de firebase-sync.js).
// Diseño y razones: docs/respaldos-automaticos.md.
//
// Todo el estado vive en UN documento de Firestore (usuarios/{uid}/data/finanzas) que cada guardado sobrescribe. Este módulo
// conserva copias de lo que había ANTES de sobrescribir, en dos sitios independientes:
//   · la nube:   documentos hermanos en la misma colección `data` (respaldo-AAAA-MM-DD, respaldo-previo-…) + un índice
//                (respaldos-indice) con sus metadatos, para listar y podar con UNA lectura. Viven en `data` a propósito: si las
//                reglas de seguridad ya permiten leer/escribir `usuarios/{uid}/data/…`, no hay que tocar nada en la consola.
//   · el equipo: IndexedDB del navegador. Funciona sin conexión y no depende de Firebase.
//
// Dos clases de respaldo:
//   · 'diario'  — la primera vez que se guarda en un día nuevo: es el estado con que terminó el día anterior.
//   · 'previo'  — justo antes de una escritura intencional que pisa todo (importar un JSON, restaurar un respaldo).
//
// Reglas que no se negocian:
//   · un respaldo que falla JAMÁS impide guardar (quien llama lo envuelve en try/catch; acá nada toca el documento principal);
//   · nunca se respalda un documento vacío ni inexistente (no hay nada que proteger);
//   · el payload se copia tal cual está en la nube (ya viene comprimido, 'gz1:'): no se descomprime ni se recomprime.
//
// Sin dependencias del DOM ni de Firebase: todo lo externo (Firestore, IndexedDB, el códec) entra por parámetros, así que
// tests/respaldos.test.js lo corre con un Firestore y un almacén simulados.

export const PREFIJO_RESPALDO = 'respaldo-';
export const ID_INDICE = 'respaldos-indice';
// Cuántos se conservan. La nube cabe de sobra en el plan gratis (1 GiB; cada copia pesa como máximo ~1 MiB, hoy mucho menos).
export const LIMITES = { diarios: 30, previos: 5, localDiarios: 7, localPrevios: 2 };

const dos = n => String(n).padStart(2, '0');

// AAAA-MM-DD en la hora LOCAL del dispositivo (el «día» de la persona, no el de UTC).
export function fechaLocal(d = new Date()) {
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
}
export const idDiario = fecha => PREFIJO_RESPALDO + fecha;
export function idPrevio(ahora) {
  const d = new Date(ahora);
  return PREFIJO_RESPALDO + 'previo-' + fechaLocal(d) + '-' + dos(d.getHours()) + dos(d.getMinutes()) + dos(d.getSeconds());
}

// ¿El payload (ya en texto plano) es un objeto JSON con al menos una clave? Un `{}` (estado de «borrar todo») o un texto roto no se respaldan.
export function planoTieneDatos(plano) {
  if (typeof plano !== 'string' || plano.length < 2) return false;
  try {
    const o = JSON.parse(plano);
    return !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length > 0;
  } catch (_) { return false; }
}
// Igual, pero sobre el payload como está en la nube (puede venir comprimido: se decodifica solo si hace falta).
export async function payloadTieneDatos(payload, decodificar) {
  if (typeof payload !== 'string') return false;
  if (payload.length < 40 && !payload.startsWith('gz1:')) return planoTieneDatos(payload);
  try { return planoTieneDatos(await decodificar(payload)); } catch (_) { return false; }
}

// Aplica los topes por clase: se queda con los más recientes de cada una. Devuelve { conservar, borrar }.
export function podar(items, limites = LIMITES, local = false) {
  const tope = { diario: local ? limites.localDiarios : limites.diarios, previo: local ? limites.localPrevios : limites.previos };
  const conservar = [], borrar = [];
  ['diario', 'previo'].forEach(tipo => {
    const delTipo = items.filter(i => i.tipo === tipo).sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
    delTipo.forEach((it, n) => (n < tope[tipo] ? conservar : borrar).push(it));
  });
  items.filter(i => i.tipo !== 'diario' && i.tipo !== 'previo').forEach(i => conservar.push(i)); // clase desconocida: no se toca
  conservar.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
  return { conservar, borrar };
}

// ── Nube ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Copia el documento principal tal como está AHORA en la nube. Va en su propia transacción, separada del guardado: si las reglas
// de Firestore no permiten estas rutas, falla ESTA transacción y el guardado de los datos sigue como siempre.
// Devuelve { estado: 'creado' | 'ya-existia' | 'sin-datos', id }.
export async function respaldarEnNube({ fb, uid, tipo, ahora = Date.now(), decodificar, limites = LIMITES }) {
  const { db, doc, runTransaction } = fb;
  const fecha = fechaLocal(new Date(ahora));
  const id = tipo === 'diario' ? idDiario(fecha) : idPrevio(ahora);
  const ref = nombre => doc(db, 'usuarios', uid, 'data', nombre);
  return runTransaction(db, async (tx) => {
    // Todas las lecturas primero (Firestore exige leer antes de escribir dentro de una transacción).
    const sPrincipal = await tx.get(ref('finanzas'));
    const sCopia = tipo === 'diario' ? await tx.get(ref(id)) : null;
    const sIndice = await tx.get(ref(ID_INDICE));
    const datos = sPrincipal.exists() ? sPrincipal.data() : null;
    if (!datos || !(await payloadTieneDatos(datos.payload, decodificar))) return { estado: 'sin-datos', id };
    if (sCopia && sCopia.exists()) return { estado: 'ya-existia', id };
    const previos = (sIndice.exists() && sIndice.data() && Array.isArray(sIndice.data().items)) ? sIndice.data().items : [];
    const rev = typeof datos.rev === 'number' ? datos.rev : 0;
    const nuevo = { id, tipo, fecha, de: datos.updatedAt || null, rev, bytes: datos.payload.length, creadoEn: ahora };
    const { conservar, borrar } = podar([nuevo, ...previos.filter(i => i && i.id !== id)], limites);
    tx.set(ref(id), { payload: datos.payload, updatedAt: datos.updatedAt || 0, rev, respaldo: { tipo, fecha, creadoEn: ahora } });
    tx.set(ref(ID_INDICE), { items: conservar });
    borrar.forEach(i => tx.delete(ref(i.id)));
    return { estado: 'creado', id, borrados: borrar.length };
  });
}

// Respaldos de la nube (metadatos, sin descargar los payloads): una sola lectura, la del índice.
export async function listarEnNube({ fb, uid }) {
  const { db, doc, getDoc } = fb;
  const s = await getDoc(doc(db, 'usuarios', uid, 'data', ID_INDICE));
  const items = s.exists() && s.data() && Array.isArray(s.data().items) ? s.data().items : [];
  return items.filter(i => i && typeof i.id === 'string');
}

// Borra TODO rastro de respaldos en la nube (al eliminar la cuenta o «borrar todos los datos»). Además del índice, recorre la
// colección por si quedó algún respaldo huérfano. Nunca lanza: devuelve cuántos borró y cuántos no pudo.
export async function borrarRespaldosNube({ fb, uid }) {
  const { db, doc, getDoc, deleteDoc, collection, getDocs } = fb;
  const ids = new Set([ID_INDICE]);
  try { (await listarEnNube({ fb, uid })).forEach(i => ids.add(i.id)); } catch (_) { /* sin índice legible: sigue con el recorrido */ }
  try {
    if (typeof collection === 'function' && typeof getDocs === 'function') {
      const q = await getDocs(collection(db, 'usuarios', uid, 'data'));
      q.forEach(d => { if (typeof d.id === 'string' && d.id.startsWith(PREFIJO_RESPALDO)) ids.add(d.id); });
    }
  } catch (_) { /* sin permiso de listado: quedan los del índice */ }
  let borrados = 0, errores = 0;
  for (const id of ids) {
    try { await deleteDoc(doc(db, 'usuarios', uid, 'data', id)); borrados++; } catch (_) { errores++; }
  }
  return { borrados, errores };
}

// ── Equipo (IndexedDB) ───────────────────────────────────────────────────────────────────────────────────────────────
// Un «almacén» es cualquier objeto con { guardar(rec), leer(id), listar(), borrar(id), vaciar() } (todo async).
export function almacenMemoria() {
  const m = new Map();
  return {
    async guardar(rec) { m.set(rec.id, JSON.parse(JSON.stringify(rec))); },
    async leer(id) { const r = m.get(id); return r ? JSON.parse(JSON.stringify(r)) : null; },
    async listar() { return [...m.values()].map(r => JSON.parse(JSON.stringify(r))); },
    async borrar(id) { m.delete(id); },
    async vaciar() { m.clear(); },
  };
}

export function almacenIndexedDB(nombreDB = 'mf-respaldos', tienda = 'respaldos') {
  const abrir = () => new Promise((res, rej) => {
    const r = indexedDB.open(nombreDB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(tienda)) r.result.createObjectStore(tienda, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const pedido = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  // `fn` solo debe encadenar pedidos de IndexedDB (si espera otra cosa, la transacción se cierra sola).
  async function conTienda(modo, fn) {
    const db = await abrir();
    try {
      const t = db.transaction(tienda, modo);
      const fin = new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error || new Error('transacción cancelada')); });
      const r = await fn(t.objectStore(tienda));
      await fin;
      return r;
    } finally { db.close(); }
  }
  return {
    guardar: rec => conTienda('readwrite', st => pedido(st.put(rec))),
    leer: id => conTienda('readonly', st => pedido(st.get(id))).then(r => r || null),
    listar: () => conTienda('readonly', st => pedido(st.getAll())),
    borrar: id => conTienda('readwrite', st => pedido(st.delete(id))),
    vaciar: () => conTienda('readwrite', st => pedido(st.clear())),
  };
}

// Guarda en el equipo una copia del estado `plano` (JSON ya en texto, el que la nube tenía antes de esta escritura).
// Devuelve { estado: 'creado' | 'ya-existia' | 'sin-datos', id }.
export async function respaldarEnEquipo({ almacen, plano, tipo, ahora = Date.now(), codificar, limites = LIMITES }) {
  if (!planoTieneDatos(plano)) return { estado: 'sin-datos' };
  const fecha = fechaLocal(new Date(ahora));
  const id = tipo === 'diario' ? idDiario(fecha) : idPrevio(ahora);
  if (tipo === 'diario' && await almacen.leer(id)) return { estado: 'ya-existia', id };
  const payload = await codificar(plano);
  await almacen.guardar({ id, tipo, fecha, de: null, bytes: payload.length, creadoEn: ahora, payload });
  const { borrar } = podar((await almacen.listar()).map(({ payload: _p, ...meta }) => meta), limites, true);
  for (const it of borrar) await almacen.borrar(it.id);
  return { estado: 'creado', id };
}

export async function listarEnEquipo({ almacen }) {
  return (await almacen.listar()).map(({ payload: _p, ...meta }) => meta);
}

// ── Lista unificada y lectura ────────────────────────────────────────────────────────────────────────────────────────
// Una fila por respaldo, con las fuentes donde existe ('nube', 'equipo'). Más reciente primero.
export function fusionar(nube, equipo) {
  const filas = new Map();
  const sumar = (it, fuente) => {
    const f = filas.get(it.id) || { id: it.id, tipo: it.tipo, fecha: it.fecha, de: it.de || null, bytes: it.bytes || 0, creadoEn: it.creadoEn || 0, fuentes: [] };
    f.fuentes.push(fuente);
    f.creadoEn = Math.max(f.creadoEn, it.creadoEn || 0);
    f.bytes = f.bytes || it.bytes || 0;
    f.de = f.de || it.de || null;
    filas.set(it.id, f);
  };
  nube.forEach(i => sumar(i, 'nube'));
  equipo.forEach(i => sumar(i, 'equipo'));
  return [...filas.values()].sort((a, b) => b.creadoEn - a.creadoEn);
}

// Devuelve el JSON (texto plano) de un respaldo. Prefiere la nube y cae al equipo si la nube no responde o no lo tiene.
export async function leerRespaldo({ fb, uid, almacen, fila, decodificar }) {
  let ultimoError = null;
  if (fila.fuentes.includes('nube') && fb && uid) {
    try {
      const s = await fb.getDoc(fb.doc(fb.db, 'usuarios', uid, 'data', fila.id));
      if (s.exists() && s.data() && typeof s.data().payload === 'string') return await decodificar(s.data().payload);
    } catch (e) { ultimoError = e; }
  }
  if (fila.fuentes.includes('equipo') && almacen) {
    const r = await almacen.leer(fila.id);
    if (r && typeof r.payload === 'string') return await decodificar(r.payload);
  }
  throw ultimoError || new Error('No se encontró el contenido del respaldo.');
}
