/* ═══════════════════════════════════════════════════════════════
   js/core/cuenta-efectos.js

   "Movimiento espejo" en el historial de una cuenta — un solo lugar.

   Regla del proyecto: todo dinero que un módulo mueve dentro de una cuenta
   (Nequi, efectivo, cajita, cuenta personalizada) deja un movimiento visible
   en el historial de esa cuenta, marcado como automático (_secundario) y
   protegido contra borrado directo desde ahí. Antes, cada módulo repetía a
   mano las tres ramas según el tipo de cuenta (prestado.js lo hacía en 22
   sitios). Ahora hay un solo código:

     registrarMovEspejo({cuenta, flujo, monto, fecha, desc, origen, extra})
        → crea el espejo y devuelve su id (o null si no se pudo escribir:
          cuenta vacía, tipo desconocido o cuenta que ya no existe).
     borrarMovEspejo(cuenta, id)
        → lo quita; devuelve true si lo encontró y lo quitó.

   Estas funciones NO tocan saldos: el efecto sobre el saldo sigue siendo
   sumarFuente()/descontarFuente() de core-state.js. Solo escriben/borran el
   registro del historial.

   Cada tipo de cuenta guarda su historial con campos distintos (así lo leen
   Cuentas, Actividad reciente y Búsqueda): no se unifican acá.

        cuenta            lista                 entrada      salida    texto
        nequi / efectivo  S.movimientos         'entrada'    'salida'  desc  (+ fuente)
        custom:<id>       cuenta.movimientos    'ingreso'    'egreso'  nota
        cajita:<id>       cajita.historial      'entrada'    'salida'  nota

   `extra` se mezcla en el registro (ej. { _esExtraIngreso: true }).

   Carga de entrada (<script defer>), después de core-state.js: usa uid(),
   getCuentaCustom() y S. Por ser núcleo, lo pueden usar módulos lazy
   (prestado, mesada, alcancia, encargos) sin depender del orden de carga.
   ═══════════════════════════════════════════════════════════════ */

// Resuelve la lista del historial donde vive el espejo de esa cuenta, y el
// 'tipo' que corresponde al flujo. crear=true crea la lista si no existe.
// Devuelve null si la cuenta no es rastreable (vacía, tipo desconocido o ya no existe).
function _espejoLista(cuenta, flujo, crear) {
  if (!cuenta || typeof cuenta !== 'string') return null;
  const entra = flujo !== 'salida';
  if (cuenta === 'efectivo' || cuenta === 'nequi') {
    if (!S.movimientos) { if (!crear) return null; S.movimientos = []; }
    return { lista: S.movimientos, tipo: entra ? 'entrada' : 'salida', campoTexto: 'desc', conFuente: true };
  }
  if (cuenta.startsWith('custom:')) {
    const c = getCuentaCustom(cuenta.split(':')[1]);
    if (!c) return null;
    if (!c.movimientos) { if (!crear) return null; c.movimientos = []; }
    return { lista: c.movimientos, tipo: entra ? 'ingreso' : 'egreso', campoTexto: 'nota', conFuente: false };
  }
  if (cuenta.startsWith('cajita:')) {
    const c = (S.cajitas || []).find(x => x.id === cuenta.split(':')[1]);
    if (!c) return null;
    if (!c.historial) { if (!crear) return null; c.historial = []; }
    return { lista: c.historial, tipo: entra ? 'entrada' : 'salida', campoTexto: 'nota', conFuente: false };
  }
  return null;
}

function registrarMovEspejo(o) {
  if (!o || !o.cuenta || !o.monto) return null;
  const dest = _espejoLista(o.cuenta, o.flujo, true);
  if (!dest) return null;
  const id = uid();
  const reg = { id, tipo: dest.tipo };
  if (dest.conFuente) reg.fuente = o.cuenta;
  reg.monto = o.monto;
  reg.fecha = o.fecha;
  reg[dest.campoTexto] = o.desc;
  reg._secundario = true;
  reg._origenSeccion = o.origen;
  if (o.extra) Object.assign(reg, o.extra);
  dest.lista.push(reg);
  return id;
}

function borrarMovEspejo(cuenta, id) {
  if (!cuenta || !id) return false;
  const dest = _espejoLista(cuenta, 'entrada', false);
  if (!dest) return false;
  const habia = dest.lista.some(x => x.id === id);
  if (!habia) return false;
  const restantes = dest.lista.filter(x => x.id !== id);
  // Las listas se reasignan en su dueño (como hacía el código original), no se mutan en sitio.
  if (cuenta === 'efectivo' || cuenta === 'nequi') S.movimientos = restantes;
  else if (cuenta.startsWith('custom:')) getCuentaCustom(cuenta.split(':')[1]).movimientos = restantes;
  else (S.cajitas || []).find(x => x.id === cuenta.split(':')[1]).historial = restantes;
  return true;
}
