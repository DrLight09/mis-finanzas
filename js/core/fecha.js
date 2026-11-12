// js/core/fecha.js — UNA sola forma de trabajar con fechas (análogo a `Dinero` para la plata). M5 de la revisión estructural.
//
// Convención de toda la app: una fecha es el texto 'YYYY-MM-DD' en HORA LOCAL de quien usa la app (el «día» del usuario). Un mes es 'YYYY-MM'.
// Nada de esto pasa por toISOString(): ese método devuelve la fecha en UTC, así que en un huso al este de UTC (o con la hora del equipo
// distinta a la de Colombia) el día se corre ±1 sin error ni aviso. Las fechas de calendario se construyen con componentes locales
// (año, mes, día) y se restan contando días de calendario, no milisegundos (por eso un cambio de hora de verano no mueve el resultado).
//
// Puro y sin DOM: depende solo de `Date`. Carga como <script> clásico ANTES de el núcleo (js/core/estado.js y hermanos) (que delega aquí hoy(), mesActual(),
// mesKey() y _fechaSafe()). Se expone también en `window.Fecha` para los módulos ES (firebase-sync.js, pin-bio.js).
//
//   Fecha.hoy()                  → '2026-11-10'
//   Fecha.iso(date)              → 'YYYY-MM-DD' local de un Date
//   Fecha.mes(dateOrIso?)        → 'YYYY-MM' (sin argumento: el mes actual)
//   Fecha.mesKey(anio, m1a12)    → 'YYYY-MM'
//   Fecha.parsear(iso, hora?)    → Date local (Invalid Date si no es una fecha válida; NaN en silencio es justo lo que se evita)
//   Fecha.esValida(iso)          → boolean (fecha real de calendario: '2026-02-31' es falso)
//   Fecha.sumarDias(iso, n)      → 'YYYY-MM-DD'    (n puede ser negativo; cruza meses, años y bisiestos)
//   Fecha.sumarMeses(iso, n)     → 'YYYY-MM-DD'    (mismo día del mes; si no existe, el último: 31-ene + 1 mes = 28/29-feb)
//   Fecha.diasEntre(a, b)        → entero: días de calendario de a a b (b − a). ÚNICO criterio de «faltan N días» / «hace N días»
//   Fecha.diasHasta(iso, desde?) → días desde `desde` (hoy) hasta iso; negativo = ya pasó. Equivale al antiguo Math.ceil(ms/86400000)
//   Fecha.nombreMes(m1a12, {largo}) → 'Ene' | 'Enero'
//   Fecha.ultimoDiaDelMes(anio, m1a12) → 28…31
//   Fecha.MS_DIA                 → 86400000, para quien de verdad compare marcas de tiempo (timestamps), no fechas de calendario
const Fecha = (() => {
  const MS_DIA = 86400000;
  const p2 = n => String(n).padStart(2, '0');
  const CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }

  // 'YYYY-MM-DD' (o 'YYYY-M-D', o con hora tras la T) → Date local. Por componentes, sin el parser ISO de Date: '2026-9-26' no es ISO
  // y daba Invalid Date (CDT que mostraba $0). `hora` (0-23) sirve para evitar bordes de cambio de hora (se suele usar 12).
  function parsear(fecha, hora) {
    if (!fecha) return new Date(NaN);
    const partes = String(fecha).split('T')[0].split('-').map(Number);
    if (partes.length !== 3 || partes.some(isNaN)) return new Date(NaN);
    const [anio, mes, dia] = partes;
    return new Date(anio, mes - 1, dia, hora || 0);   // hora local. (Igual que siempre, un día imposible como 31-feb rueda al mes siguiente: ver esValida)
  }

  // ¿Es una fecha real de calendario? (no solo parseable: '2026-02-31' rueda a marzo en parsear(), aquí es falso)
  function esValida(fecha) {
    const d = parsear(fecha);
    if (isNaN(d.getTime())) return false;
    const [anio, mes, dia] = String(fecha).split('T')[0].split('-').map(Number);
    return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia;
  }
  function hoy() { return iso(new Date()); }
  function mesKey(anio, m) { return anio + '-' + p2(m); }
  function mes(x) {
    if (x == null) return iso(new Date()).slice(0, 7);
    if (x instanceof Date) return iso(x).slice(0, 7);
    return String(x).slice(0, 7);
  }
  function sumarDias(fecha, n) {
    const d = parsear(fecha, 12);   // a mediodía: ningún cambio de hora cruza de día
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function ultimoDiaDelMes(anio, m) { return new Date(anio, m, 0).getDate(); }
  function sumarMeses(fecha, n) {
    const d = parsear(fecha, 12);
    if (isNaN(d.getTime())) return '';
    const dia = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(dia, ultimoDiaDelMes(d.getFullYear(), d.getMonth() + 1)));
    return iso(d);
  }
  // Días de calendario de `a` a `b`. Se cuentan con Date.UTC de los componentes locales: exacto y sin depender del huso ni del cambio de hora.
  function diasEntre(a, b) {
    const x = parsear(a), y = parsear(b);
    if (isNaN(x.getTime()) || isNaN(y.getTime())) return NaN;
    return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / MS_DIA);
  }
  function diasHasta(fecha, desde) { return diasEntre(desde || hoy(), fecha); }
  function nombreMes(m, opts) {
    const i = Number(m) - 1;
    return ((opts && opts.largo) ? LARGOS : CORTOS)[i] || '';
  }

  return { MS_DIA, iso, hoy, mes, mesKey, parsear, esValida, sumarDias, sumarMeses, diasEntre, diasHasta, nombreMes, ultimoDiaDelMes, MESES_CORTOS: CORTOS, MESES_LARGOS: LARGOS };
})();
if (typeof window !== 'undefined') window.Fecha = Fecha;
