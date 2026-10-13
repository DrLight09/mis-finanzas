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

   TODAS las cuentas guardan su historial en una sola lista, S.movimientos, con la cuenta en `fuente`:

        cuenta                 tipo entrada / salida    texto   fuente
        nequi / efectivo       'entrada' / 'salida'     desc    'nequi' | 'efectivo'
        custom:<id>            'entrada' / 'salida'     desc    'custom:<id>'
        cajita:<id>            'entrada' / 'salida'     desc    'cajita:<id>'

   `extra` se mezcla en el registro (ej. { _esExtraIngreso: true }).
   Todo espejo nace con `_esEspejo: true` (2026-10-04): _esEntradaEspejoNoIngreso() lo
   excluye del ingreso sin depender del texto ni del prefijo de _origenSeccion. Las
   banderas de "sí es ingreso" de `extra` tienen prioridad sobre `_esEspejo`.

   Carga de entrada (<script defer>), después de core-state.js: usa uid(),
   getCuentaCustom() y S. Por ser núcleo, lo pueden usar módulos lazy
   (prestado, mesada, alcancia, encargos) sin depender del orden de carga.
   ═══════════════════════════════════════════════════════════════ */

// Resuelve dónde vive el espejo de esa cuenta (siempre S.movimientos) y el 'tipo' que corresponde al flujo.
// crear=true crea la lista si no existe. Devuelve null si la cuenta no es rastreable (vacía, tipo desconocido o ya no existe).
function _espejoLista(cuenta, flujo, crear) {
  if (!cuenta || typeof cuenta !== 'string') return null;
  const entra = flujo !== 'salida';
  const existe = cuenta === 'efectivo' || cuenta === 'nequi'
    || (cuenta.startsWith('custom:') && !!getCuentaCustom(cuenta.split(':')[1]))
    || (cuenta.startsWith('cajita:') && !!(S.cajitas || []).find(x => x.id === cuenta.split(':')[1]));
  if (!existe) return null;
  if (!S.movimientos) { if (!crear) return null; S.movimientos = []; }
  return { lista: S.movimientos, tipo: entra ? 'entrada' : 'salida', campoTexto: 'desc', conFuente: true };
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
  reg._esEspejo = true; // por defecto un espejo NO es ingreso; `extra` lo anula si es plata nueva (_esExtraIngreso, _esPerdonRecibido, _esDiferencialEncargo)
  reg._origenSeccion = o.origen;
  if (o.extra) Object.assign(reg, o.extra);
  // `clase` (plan-clasificacion-movimientos.md): explícita si el módulo la pasa; si no, se deduce
  // de las banderas de "plata nueva" de `extra` (hasta que cada llamador pase `clase` a mano) y,
  // por defecto, un espejo es 'neutro'. Las salidas de un espejo también son 'neutro'.
  reg.clase = _claseValida(o.clase) ? o.clase
    : (o.flujo !== 'salida' && (reg._esExtraIngreso || reg._esPerdonRecibido || reg._esDiferencialEncargo)) ? 'ingreso'
    : 'neutro';
  dest.lista.push(reg);
  return id;
}

function borrarMovEspejo(cuenta, id) {
  if (!cuenta || !id) return false;
  const dest = _espejoLista(cuenta, 'entrada', false);
  if (!dest) return false;
  if (!dest.lista.some(x => x.id === id && x.fuente === cuenta)) return false;
  // La lista se reasigna en su dueño (como hacía el código original), no se muta en sitio.
  S.movimientos = dest.lista.filter(x => !(x.id === id && x.fuente === cuenta));
  return true;
}
