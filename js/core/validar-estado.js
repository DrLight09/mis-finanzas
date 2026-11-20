// js/core/validar-estado.js — comprobación de la forma del estado (módulo ES sin <script> propio: lo importa firebase-sync.js).
//
// Qué evita: JSON.stringify convierte NaN e Infinity en `null` SIN avisar, así que un saldo roto por un bug se guardaría como null en la
// nube y al volver a cargar «desaparecería». Una lista que deja de ser lista o un registro sin forma de objeto tumban pantallas enteras.
// Se llama justo antes de escribir en la nube (js/core/firebase-sync.js): si hay un problema GRAVE no se escribe (la nube conserva el
// último estado bueno) y se avisa; los problemas leves (ids repetidos) solo se dejan en consola. Función pura, probada en
// tests/validar-estado.test.js. No es un esquema completo: mira solo lo que rompe dinero y listas.

// Listas del estado cuyos elementos son objetos con `id`.
export const LISTAS_CON_ID = ['cuentas', 'cajitas', 'libro', 'movimientos', 'gastosVar', 'gastosFijos', 'tcMovimientos', 'tarjetasCredito',
  'encargos', 'transferencias', 'ingresosFijos', 'ingresosExtra', 'plataComprometida', 'bienes', 'personas', 'misDeudas'];
// Campos de dinero que, si existen, deben ser números finitos.
export const CAMPOS_DINERO = ['monto', 'saldo', 'deuda'];

const esRegistro = x => x !== null && typeof x === 'object' && !Array.isArray(x);

// → { ok, graves:[texto], leves:[texto] }
export function validarEstado(estado) {
  const graves = [], leves = [];
  if (!esRegistro(estado)) return { ok: false, graves: ['el estado no es un objeto'], leves };
  for (const nombre of LISTAS_CON_ID) {
    const lista = estado[nombre];
    if (lista === undefined) continue;
    if (!Array.isArray(lista)) { graves.push(`«${nombre}» debería ser una lista`); continue; }
    const vistos = new Set();
    let repetidos = 0;
    lista.forEach((x, i) => {
      if (!esRegistro(x)) { graves.push(`«${nombre}»[${i}] no es un registro`); return; }
      for (const campo of CAMPOS_DINERO) {
        if (typeof x[campo] === 'number' && !Number.isFinite(x[campo])) graves.push(`«${nombre}»[${i}].${campo} no es un número válido (${x[campo]})`);
      }
      if (x.id != null) { if (vistos.has(x.id)) repetidos++; else vistos.add(x.id); }
    });
    if (repetidos) leves.push(`«${nombre}» tiene ${repetidos} id(s) repetido(s)`);
  }
  return { ok: graves.length === 0, graves, leves };
}
