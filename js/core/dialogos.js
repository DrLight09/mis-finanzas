// js/core/dialogos.js
//
// Avisos y diálogos: toast, dialogo/confirmarEliminar/avisarNoSePuede y los avisos de movimientos antiguos o bloqueados.
// Parte del antiguo el núcleo (js/core/estado.js y hermanos) (dividido por responsabilidad). Clásico (<script defer>), sin type="module": sus globales son
// léxicos de script clásico. El ORDEN de carga en index.html es el de esta lista: estado → cuentas-fuentes → persistencia →
// patrimonio → ingresos → dialogos → utilidades-ui → refresh.

function _toastTexto(v){
  if(v==null)return'';
  return String(v).replace(/&(amp|lt|gt|quot|#39);/g,(_,e)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[e]));
}
function toast(msg, tipo='ok', dur=2800){
  // El color indica el RESULTADO de la acción, no el tipo de dato: 'ok' (se hizo: registrar, guardar, eliminar; verde) · 'salida'
  //       (se hizo y es plata que sale: verde con flecha, para distinguirla de una entrada sin confundirla con un error) · 'warn' (se
  //       hizo, pero con algo que revisar; ámbar) · 'err' (no se hizo o falló; rojo con X) · 'info' (neutro, nada cambió; azul).
  //       Los colores y el tamaño están en la clase .toast-<tipo> (CSS crítico de index.html, espejo en styles.css).
  const c=document.getElementById('toast-container');
  const el=document.createElement('div');
  const svg=(trazo,ancho)=>`<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ancho}" stroke-linecap="round" stroke-linejoin="round">${trazo}</svg>`;
  const ICONOS={
    ok:svg('<polyline points="20 6 9 17 4 12"/>',3),
    salida:svg('<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',2.6),
    err:svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',3),
    warn:svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',2.5),
    info:svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',2.5)
  };
  el.className='toast toast-'+tipo;
  el.setAttribute('role',tipo==='err'?'alert':'status');
  const ico=document.createElement('span');ico.className='toast-ico';ico.innerHTML=ICONOS[tipo]||'•';
  const cuerpo=document.createElement('span');cuerpo.className='toast-msg';
  if(msg&&msg.__raw===true)cuerpo.innerHTML=msg.value;   // marcado explícito (html``/raw())
  else cuerpo.textContent=_toastTexto(msg);              // todo lo demás es texto
  el.appendChild(ico);el.appendChild(cuerpo);
  c.appendChild(el);
  setTimeout(()=>{el.classList.add('hiding');setTimeout(()=>el.remove(),220);},dur);
}

/* ---- DIALOG (reemplaza confirm) ---- */
window._dialogResolve=null;
function _closeDialog(val){
  if(window._dialogResolve){
    const fn=window._dialogResolve;
    window._dialogResolve=null;
    document.getElementById('dialog-overlay').classList.remove('open');
    fn(val);
  }
}
function dialogo(titulo, msg, btnOk='Confirmar', peligro=false){
  return new Promise(res=>{
    // Un solo diálogo a la vez: si ya hay uno abierto se cancela (resuelve en false) en vez de perder su resolvedor, que dejaba
    // la función que lo esperaba colgada para siempre y, con un doble disparo, una acción pendiente que nunca se cancelaba.
    if(window._dialogResolve){ const _previo=window._dialogResolve; window._dialogResolve=null; _previo(false); }
    window._dialogResolve=res;
    document.getElementById('dialog-title').textContent=titulo;
    document.getElementById('dialog-msg').textContent=msg;
    const btn=document.getElementById('dialog-confirm');
    btn.textContent=btnOk;
    btn.classList.toggle('dialog-ok-peligro',!!peligro);
    btn.classList.toggle('dialog-ok-normal',!peligro);
    document.getElementById('dialog-overlay').classList.add('open');
  });
}
document.getElementById('dialog-overlay').addEventListener('click',function(e){
  if(e.target===this) _closeDialog(false);
});

/* ---- CONFIRMAR ELIMINACIÓN / AVISO DE «NO SE PUEDE» ----
   Todos los «¿Eliminar…?» de la app pasan por aquí, para que la redacción, el botón y el color sean los mismos:
     confirmarEliminar({ titulo, objeto, detalle, irreversible=true, etiqueta='Eliminar' }) → Promise<boolean>
       titulo      encabezado («Eliminar gasto fijo»).
       objeto      lo que se elimina, con su artículo y sin comillas de más: «este gasto fijo», «a María», «la cuenta "Nequi"».
                   Da la pregunta «¿Eliminar <objeto>?».
       detalle     (opcional) qué pasa con el resto: efectos sobre saldos, historial que se conserva…
       irreversible agrega «Esta acción no se puede deshacer.» (por defecto sí; se omite si el detalle ya lo dice).
       etiqueta    texto del botón rojo («Eliminar», «Borrar», «Sí, eliminar y revertir»). verbo: el de la pregunta (por defecto «Eliminar»).
     avisarNoSePuede(titulo, motivo) → Promise: un solo botón «Entendido» (la acción está bloqueada y se explica por qué).
   dialogo() pinta con textContent: aquí NUNCA se escapa con escHtml() (saldría «&amp;» en pantalla); se pasa el texto tal cual. */
function confirmarEliminar({titulo,objeto,detalle='',irreversible=true,etiqueta='Eliminar',verbo='Eliminar'}={}){
  const partes=['¿'+verbo+' '+objeto+'?'];
  if(detalle)partes.push(String(detalle).trim());
  if(irreversible&&!/no se puede deshacer/i.test(detalle))partes.push('Esta acción no se puede deshacer.');
  return dialogo(titulo||('Eliminar '+objeto),partes.join(' '),etiqueta,true);
}
function avisarNoSePuede(titulo,motivo){
  return dialogo(titulo||'No se puede',motivo,'Entendido',false);
}

// Convierte un string de fecha 'YYYY-M-D' o 'YYYY-MM-DD' (con o sin ceros a
// la izquierda en mes/día) en un Date válido a medianoche local, construido
// por componentes numéricos en vez de confiar en el parser de strings de JS.
//
// Blindaje ante un bug real (2026-09-26): `new Date(fechaStr+'T00:00:00')` —
// patrón usado en 14 sitios entre este archivo y cuentas.js — da `Invalid
// Date` si mes o día no tienen 2 dígitos (ej. '2026-9-26' en vez de
// '2026-09-26'). Sin el sufijo de hora el parser de JS es permisivo, pero
// CON él exige ISO 8601 estricto. Ese `Invalid Date` se propaga como `NaN`
// en cualquier cálculo downstream (calcCDT, nivelAntiguedadMovimiento, etc.)
// sin tirar ningún error — y `fmt()`/`fmtNoCents()` lo muestran como "$0"
// (`NaN||0`), indistinguible de un valor real de cero. Así se vio: un CDT
// con `vence` sin padear dejó `calcCDT().val` en NaN, que subió a
// `_patrimonioVisible` en refresh() y mostró "Patrimonio visible $0" y
// "CDTs Nu $0" con datos reales de sobra en las demás cuentas. Ver
// CHANGELOG.md#patrimonio-y-cálculos-globales.
//
// Por la UI normal esto no puede pasar (los `<input type="date">` siempre
// devuelven YYYY-MM-DD con ceros a la izquierda) — apareció por una edición
// manual de datos fuera de la app. Este helper cierra la puerta para
// cualquier otra vía futura (import, script, edición directa en Firebase).
// `hora` (opcional, 0 por defecto) fija la hora local: _fechaSafe(f, 12) reemplaza a new Date(f+'T12:00:00') en las lecturas de
// visualización o de diferencia de días (el mediodía evita que un cambio de hora o una zona horaria lleve el día a otro al formatear).
// Acepta también 'AAAA-MM-DDTHH:MM…' (toma solo la parte de la fecha), porque algunos registros guardan la hora.
function _fechaSafe(fechaStr, hora){ return Fecha.parsear(fechaStr, hora); }   // alias: la lógica vive en js/core/fecha.js

/* ---- PROTECCIÓN POR ANTIGÜEDAD DE MOVIMIENTOS ---- */
// Ver docs/proteccion-antiguedad-movimientos.md para el detalle completo.
// Un movimiento viejo ya se mezcló lógicamente con todo lo que pasó en su
// cuenta después: revertirlo hoy no "deshace el error", introduce un
// descuadre nuevo. Estas funciones son el único lugar donde vive esa regla
// — cada módulo (Spotify, Mesada, Préstamos, Encargos, Tarjetas) las llama
// desde su(s) punto(s) de borrado en vez de reimplementar el cálculo.

// Nivel de protección de un movimiento, según DOS criterios independientes
// (basta con que se cumpla uno): tiempo transcurrido desde su fecha, y
// cantidad de operaciones posteriores que ya tocaron la misma cuenta/ciclo.
// Los umbrales de tiempo son globales; los de cantidad son por módulo.
//
// @param {string} fecha           Fecha del movimiento, 'YYYY-MM-DD'.
// @param {number} opsPosteriores  Cantidad de operaciones posteriores ya
//                                 registradas sobre la misma cuenta/ciclo
//                                 (0 si el módulo aún no define este criterio).
// @param {string} modulo          Clave dentro de S.config.proteccionAntiguedad
//                                 con los umbrales opsAviso/opsBloqueo del
//                                 módulo (ej: 'spotify'). Si el módulo todavía
//                                 no tiene esos umbrales definidos, el nivel
//                                 se decide solo por tiempo.
// @returns {'reciente'|'viejo'|'bloqueado'}
function nivelAntiguedadMovimiento(fecha, opsPosteriores, modulo){
  const cfg=S.config.proteccionAntiguedad;
  const modCfg=cfg[modulo]||{};
  const dias=Fecha.diasEntre(fecha,hoy());
  const ops=opsPosteriores||0;
  if(dias>cfg.diasBloqueo || (modCfg.opsBloqueo!=null && ops>=modCfg.opsBloqueo)) return 'bloqueado';
  if(dias>cfg.diasAviso || (modCfg.opsAviso!=null && ops>=modCfg.opsAviso)) return 'viejo';
  return 'reciente';
}

// Aviso para nivel 'viejo': muestra qué cuenta se afecta y de cuánto sube o
// baja su saldo si se confirma, y deja decidir al usuario con esa
// información — nunca a ciegas. Devuelve true si confirma, false si cancela.
// No usar para nivel 'bloqueado' (ver avisarMovimientoBloqueado).
//
// @param {string} nombreCuenta    Nombre a mostrar de la cuenta afectada.
// @param {number} montoRevertido  Monto que se revertirá (siempre positivo).
// @param {'sube'|'baja'} direccion  Si el campo de esa cuenta sube o baja al revertir.
// @param {'saldo'|'deuda'} [campo='saldo']  Qué campo cambia (ej: 'deuda' para
//                                            revertir un cargo hecho a una TC).
function confirmarBorrarMovimientoViejo(nombreCuenta, montoRevertido, direccion, campo='saldo'){
  const verbo=direccion==='sube'?'sube':'baja';
  return dialogo(
    'Movimiento antiguo',
    `Este movimiento ya tiene tiempo y puede estar mezclado con operaciones más recientes de "${nombreCuenta}". Si lo eliminas, su ${campo} ${verbo} ${fmt(montoRevertido)} ahora mismo — no se recalcula el historial completo. ¿Eliminar de todas formas?`,
    'Eliminar de todas formas', true
  );
}

// Aviso para nivel 'bloqueado': solo informa, no ofrece la opción de
// continuar (coherente con dialogo(), que ya soporta este patrón de un solo
// botón — ver el uso existente para movimientos secundarios en movimientos.js).
function avisarMovimientoBloqueado(){
  return avisarNoSePuede(
    'No se puede eliminar',
    'Este movimiento es demasiado antiguo o ya está muy mezclado con operaciones posteriores de esa cuenta. Eliminarlo ahora dejaría un descuadre imposible de corregir a mano. Si hay un error real, corrígelo editando el dato (nota o fecha) sin borrar el movimiento.'
  );
}

// Registro de tipos de movimiento reversibles. Un tipo declara cómo se protege su borrado:
//   Reversibles.registrar({ tipo: 'x' | ['x','y'], proteccion(ref, ctx) → null | { fecha, ops, modulo, nombre, monto,
//                           direccion:'sube'|'baja', campo?:'saldo'|'deuda', dialogo?: () => Promise<boolean> } })
// proteger(tipo, ref) aplica nivelAntiguedadMovimiento: 'bloqueado' avisa y devuelve {ok:false};
// 'viejo' pide confirmación (la del tipo si trae `dialogo`, si no la estándar) y devuelve {ok, confirmado}.
// Un módulo nuevo se integra registrándose; los puntos de borrado (movimientos.js, gastos.js…) no cambian.
