// js/core/resumen-datos.js
//
// Resumen de un estado, para decidir ANTES de reemplazar, restaurar o ver un respaldo. Lo usan «Importar JSON», «Restaurar respaldo» y «Ver»
// (js/modules/configuracion.js): una sola fuente para las tres. Puro: no depende de nada de la app ni de otros archivos.
import { exponerGlobales } from './puente.js';

// Función PURA sobre un estado ya decodificado (el actual, un archivo importado o un respaldo): no lo carga ni lo valida ni lo migra, y
// tolera campos que falten o un esquema viejo. Sirve a «Importar JSON», «Restaurar respaldo» y «Ver» del respaldo (una sola fuente).
// El saldo de una cuenta o cajita es el guardado (respaldos viejos) o, si no hay, la suma de sus entradas del libro: así coincide con lo que
// mostrará la app tras cargarlo (Libro.hidratar). Las cuentas de ahorro no tienen saldo propio: lo tienen sus cajitas.
const _lista = x => (Array.isArray(x) ? x : []);
const _centavos = x => Math.round((Number(x) || 0) * 100);
const _esFecha = f => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f);

export function resumirDatos(plano) {
  const e = plano && typeof plano === 'object' && !Array.isArray(plano) ? plano : {};
  const porFuente = new Map();
  _lista(e.libro).forEach(l => { if (l && l.cuenta) porFuente.set(l.cuenta, (porFuente.get(l.cuenta) || 0) + _centavos(l.monto)); });
  const saldoDe = (objeto, fuente) => (objeto && typeof objeto.saldo === 'number' && isFinite(objeto.saldo) ? _centavos(objeto.saldo) : (porFuente.get(fuente) || 0));
  const cuentas = _lista(e.cuentas).filter(c => c && c.id);
  const cajitas = _lista(e.cajitas).filter(c => c && c.id);
  const centavos = cuentas.filter(c => c.tipo !== 'ahorro').reduce((a, c) => a + saldoDe(c, 'cuenta:' + c.id), 0)
    + cajitas.reduce((a, c) => a + saldoDe(c, 'cajita:' + c.id), 0);
  const movimientos = [e.gastosVar, e.movimientos, e.ingresosExtra, e.transferencias].map(_lista);
  const fechas = [];
  movimientos.forEach(lista => lista.forEach(m => { if (m && _esFecha(m.fecha)) fechas.push(m.fecha.slice(0, 10)); }));
  fechas.sort();
  return {
    esquema: Number(e.schemaVersion) || null,
    cuentas: cuentas.length,
    cajitas: cajitas.length,
    saldoCuentas: centavos / 100,
    movimientos: movimientos.reduce((a, l) => a + l.length, 0),
    tarjetas: _lista(e.tarjetasCredito).length,
    prestamos: _lista(e.deudores).length + _lista(e.misDeudas).length,
    encargos: _lista(e.encargos).length,
    personas: _lista(e.personas).length,
    mesesCerrados: e.resumenMeses && typeof e.resumenMeses === 'object' ? Object.keys(e.resumenMeses).length : 0,
    primeraFecha: fechas.length ? fechas[0] : null,
    ultimaFecha: fechas.length ? fechas[fechas.length - 1] : null,
  };
}

/** @type {Array<[string, string, boolean]>} [clave del resumen, etiqueta, ¿es dinero?] */
const FILAS_RESUMEN = [
  ['cuentas', 'Cuentas', false], ['cajitas', 'Cajitas', false], ['saldoCuentas', 'Saldo de cuentas y cajitas', true], ['movimientos', 'Movimientos', false],
  ['tarjetas', 'Tarjetas', false], ['prestamos', 'Préstamos', false], ['encargos', 'Encargos', false], ['personas', 'Personas', false], ['mesesCerrados', 'Meses cerrados', false],
];
// Filas para mostrar lado a lado: [{ clave, etiqueta, actual, nuevo, dinero }]. Se omiten las que son 0 en los dos (no aportan nada).
/**
 * @param {Record<string, any> | null | undefined} actual
 * @param {Record<string, any> | null | undefined} nuevo
 */
export function compararResumenes(actual, nuevo) {
  const a = actual || {}, n = nuevo || {};
  return FILAS_RESUMEN.map(([clave, etiqueta, dinero]) => ({ clave, etiqueta, actual: a[clave] || 0, nuevo: n[clave] || 0, dinero }))
    .filter(f => f.actual !== 0 || f.nuevo !== 0);
}

exponerGlobales({ resumirDatos, compararResumenes });
