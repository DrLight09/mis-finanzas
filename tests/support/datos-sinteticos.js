'use strict';
// tests/support/datos-sinteticos.js — historia sintética de varios años para probar la huella y el cierre de períodos.
//
// La app nació limpia el 2026-10-18: aún no existen movimientos con 2 años de antigüedad, así que se simulan. Los saldos y el
// libro se escriben con las funciones REALES de la app (sumarFuente/descontarFuente con Libro.conOrigen, registrarMovimientoEspejo,
// tcRecalcular), de modo que las invariantes (el libro cuadra, deuda de tarjeta calculada…) se prueban contra el comportamiento
// real y no contra una copia. Lo que no tiene una función pura (bolsa de un encargo, movimientos de una deuda) se arma con la forma
// que documentan docs/encargos.md y docs/prestamos.md.
//
// Determinista: misma semilla → mismos datos. Los ids son 'x00001'… (el uid() real mezcla Date.now() y puede repetirse dentro de
// un mismo milisegundo al generar miles de registros; un id repetido se leería como el mismo registro).
//
// Qué contiene (para que los casos de prueba puedan señalarlo):
//   · cada día: 3 gastos (con su pata en el libro) y una transferencia nequi→efectivo (S.transferencias + 2 espejos + 2 patas);
//   · cada mes: un ingreso, el pago de un gasto fijo y, cada trimestre, una compra con tarjeta;
//   · tarjetas: 'tcCerrada' (todo pagado antes de 2025-07: deuda 0) y 'tcAbierta' (con deuda hasta hoy);
//   · encargos: 'encCerrado' (entra y sale lo mismo en 2024) y 'encAbierto' (saldo > 0 con movimiento reciente);
//   · deudas: 'favorCerrada' (prestó y le pagaron todo) y 'favorAbierta'; 'contraAbierta' (yo debo);
//   · alcancía: un ciclo ya destapado (con la copia de sus depósitos) y uno activo.
const path = require('node:path');
const { loadApp } = require('./load-app');

const RAIZ = path.join(__dirname, '..', '..', 'js');
const HOY = '2026-10-30';
const ARCHIVOS = [
  'core/core-state.js', 'core/cuenta-efectos.js', 'core/umbrales.js', 'core/periodo.js', 'core/nu-calc.js', 'core/calc-helpers.js', 'core/huella.js', 'core/cierre.js',
  'core/split.js', 'core/diferencial.js', 'modules/tarjetas-credito.js', 'modules/encargos.js', 'modules/alcancia.js', 'modules/wrapped.js',
].map(f => path.join(RAIZ, f));

function cargarApp(extra) {
  // `extra`: archivos de js/ adicionales (p. ej. 'core/wrapped-gate.js'), cargados DESPUÉS de los base.
  const ctx = loadApp(ARCHIVOS.concat((extra || []).map(f => path.join(RAIZ, f))), { permissive: true });
  let n = 0;
  ctx.uid = () => 'x' + String(++n).padStart(5, '0');
  ctx.hoy = () => HOY; // fecha fija: Wrapped apunta al año anterior al actual y los cortes dependen de «hoy»
  return ctx;
}

function rng(semilla) { // mulberry32
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const iso = d => d.toISOString().slice(0, 10);
const suma = (f, dias) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return iso(d); };

// Estado base vacío pero completo (las claves que la app espera), con dos cuentas con saldo.
function estadoBase(ctx) {
  Object.assign(ctx.S, {
    modulos: {}, libro: [], movimientos: [], gastosVar: [], transferencias: [], pagosGastosFijos: {}, gastosFijos: [{ id: 'gfRenta', nombre: 'Arriendo', monto: 600000, cat: 'Hogar', dia: 5 }],
    tarjetasCredito: [], tcMovimientos: [], encargos: [], deudores: [], misDeudas: [], personas: [{ id: 'pAna', nombre: 'Ana' }, { id: 'pLuis', nombre: 'Luis' }],
    cuentas: [{ id: 'nequi', tipo: 'billetera', nombre: 'Nequi', saldo: 0 }, { id: 'efectivo', tipo: 'efectivo', nombre: 'Efectivo', saldo: 0 }, { id: 'nu', tipo: 'ahorro', nombre: 'Nu', tasaEA: 9.25 }], cajitas: [], patrimonioHistorial: [], alcancia: null,
  });
}

// generar(ctx, { desde: 'AAAA-MM-DD', dias, semilla }) escribe en ctx.S. Devuelve ids útiles para los casos de prueba.
function generar(ctx, { desde = '2024-01-01', dias = 1000, semilla = 7 } = {}) {
  estadoBase(ctx);
  const S = ctx.S, azar = rng(semilla), cats = ['Alimentación', 'Transporte', 'Salud', 'Entretenimiento', 'Hogar', 'Servicios'];
  const con = (origen, fn) => ctx.Libro.conOrigen(origen, fn);

  const tcCerrada = { id: 'tcCerrada', nombre: 'Visa vieja', banco: 'X', franquicia: 'Visa', cupo: 3000000, estado: 'activa', compras: [], pagos: [], saldoInicial: null, deuda: 0 };
  const tcAbierta = { id: 'tcAbierta', nombre: 'Master', banco: 'Y', franquicia: 'Mastercard', cupo: 5000000, estado: 'activa', compras: [], pagos: [], saldoInicial: null, deuda: 0 };
  S.tarjetasCredito.push(tcCerrada, tcAbierta);

  for (let i = 0; i < dias; i++) {
    const f = suma(desde, i), dia = Number(f.slice(8, 10)), mes = f.slice(0, 7);
    if (dia === 1) { // ingreso del mes
      const id = ctx.uid(), monto = 3500000;
      S.movimientos.push({ id, tipo: 'entrada', fuente: 'cuenta:nequi', monto, fecha: f, desc: 'Sueldo', clase: 'ingreso' });
      con({ modulo: 'ingresos', ref: id }, () => ctx.sumarFuente('cuenta:nequi', monto, { fecha: f }));
    }
    if (dia === 5) { // gasto fijo
      S.pagosGastosFijos['gfRenta_' + mes] = { fecha: f, fuente: 'cuenta:nequi', monto: 600000, cat: 'Hogar', nombre: 'Arriendo' };
      con({ modulo: 'gastos-fijos', ref: 'gfRenta_' + mes }, () => ctx.descontarFuente('cuenta:nequi', 600000, { fecha: f }));
    }
    for (let k = 0; k < 3; k++) { // gastos del día
      const id = ctx.uid(), monto = Math.round(8000 + azar() * 60000), fuente = k % 2 ? 'cuenta:efectivo' : 'cuenta:nequi';
      S.gastosVar.push({ id, desc: 'Compra ' + k, monto, fecha: f, cat: cats[Math.floor(azar() * cats.length)], fuente, clase: 'gasto' });
      con({ modulo: 'gastos', ref: id }, () => ctx.descontarFuente(fuente, monto, { fecha: f }));
    }
    { // transferencia nequi → efectivo: una fila en S.transferencias, dos espejos y dos patas en el libro, todos ligados por el id
      const tid = ctx.uid(), monto = Math.round(20000 + azar() * 100000);
      S.transferencias.push({ id: tid, fecha: f, origen: 'cuenta:nequi', destino: 'cuenta:efectivo', monto });
      ctx.registrarMovimientoEspejo({ cuenta: 'cuenta:nequi', flujo: 'salida', monto, fecha: f, desc: 'Transferencia a Efectivo', origen: 'Cuentas', extra: { _transferenciaId: tid } });
      ctx.registrarMovimientoEspejo({ cuenta: 'cuenta:efectivo', flujo: 'entrada', monto, fecha: f, desc: 'Transferencia desde Nequi', origen: 'Cuentas', extra: { _transferenciaId: tid } });
      con({ modulo: 'cuentas', ref: tid }, () => { ctx.descontarFuente('cuenta:nequi', monto, { fecha: f }); ctx.sumarFuente('cuenta:efectivo', monto, { fecha: f }); });
    }
    if (dia === 15 && Number(mes.slice(5)) % 3 === 0) { // compra trimestral con tarjeta
      const tc = f < '2025-07-01' ? tcCerrada : tcAbierta, monto = 400000;
      tc.compras.push({ id: ctx.uid(), desc: 'Compra grande', monto, fecha: f, eliminado: false });
      if (tc === tcCerrada) tc.pagos.push({ id: ctx.uid(), monto, fecha: suma(f, 20), eliminado: false }); // se paga completa
    }
    if (dia === 20) S.patrimonioHistorial.push({ fecha: f, valor: 1000000 + i * 1000, valorVisible: 1000000 + i * 1000 });
  }
  ctx.tcRecalcular(tcCerrada); ctx.tcRecalcular(tcAbierta);

  const hoyIso = suma(desde, dias - 1);
  // Encargos: cada movimiento lleva `cuenta` (dónde está guardada esa plata) y el saldo se deriva, nunca se guarda.
  S.encargos.push(
    { id: 'encCerrado', nombre: 'Mamá', personaId: 'pAna', saldoInicial: 0, cuentaInicial: '', partes: [], movimientos: [
      { id: ctx.uid(), tipo: 'entrada', monto: 500000, fecha: '2024-02-10', cuenta: 'cuenta:efectivo', desc: 'Me dio' },
      { id: ctx.uid(), tipo: 'salida', monto: 500000, fecha: '2024-03-05', cuenta: 'cuenta:efectivo', desc: 'Pagué por ella' }] },
    { id: 'encAbierto', nombre: 'Tío', personaId: 'pLuis', saldoInicial: 100000, cuentaInicial: 'cuenta:nequi', partes: [], movimientos: [
      { id: ctx.uid(), tipo: 'entrada', monto: 300000, fecha: '2024-06-01', cuenta: 'cuenta:nequi', desc: 'Me dio' },
      { id: ctx.uid(), tipo: 'salida', monto: 50000, fecha: hoyIso, cuenta: 'cuenta:nequi', desc: 'Mandado' }] });
  // Deudas: saldo = abre (prestamo/recibido) − el resto de los tipos.
  S.deudores.push(
    { id: 'favorCerrada', personaId: 'pAna', nombre: 'Ana', grupos: [], movimientos: [
      { id: ctx.uid(), tipo: 'prestamo', monto: 200000, fecha: '2024-04-02' }, { id: ctx.uid(), tipo: 'abono', monto: 200000, fecha: '2024-09-02' }] },
    { id: 'favorAbierta', personaId: 'pLuis', nombre: 'Luis', grupos: [], movimientos: [
      { id: ctx.uid(), tipo: 'prestamo', monto: 150000, fecha: '2025-01-10' }, { id: ctx.uid(), tipo: 'abono', monto: 50000, fecha: '2025-03-10' }] });
  S.misDeudas.push({ id: 'contraAbierta', personaId: 'pAna', nombre: 'Ana', grupos: [], movimientos: [{ id: ctx.uid(), tipo: 'recibido', monto: 80000, fecha: '2025-05-05' }] });
  // Alcancía: un ciclo destapado (con la copia de sus depósitos dentro del historial) y uno activo.
  const dep1 = { id: ctx.uid(), monto: 100000, fecha: '2024-05-01' }, dep2 = { id: ctx.uid(), monto: 50000, fecha: '2024-06-01' }, dep3 = { id: ctx.uid(), monto: 70000, fecha: '2026-09-01' };
  S.alcancia = { saldoRegistrado: 70000, depositos: 70000, fechaInicio: '2026-09-01', movimientos: [dep3],
    historial: [{ fechaInicio: '2024-05-01', fechaFin: '2024-12-31', diasDuracion: 244, depositos: 150000, saldoRegistrado: 150000, saldoReal: 150000, diferencia: 0, movimientos: [dep1, dep2] }] };
  S.alcanciaSaldoOfuscado = '';
  ctx.Libro.verificar(S); // sanity: el generador nunca debe dejar el libro descuadrado
  return { hoyIso, desde, dias };
}

module.exports = { cargarApp, generar, estadoBase, ARCHIVOS, suma, HOY };
