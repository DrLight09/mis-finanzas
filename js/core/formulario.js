// js/core/formulario.js
//
// Validación de formularios: UN componente para marcar un campo con error. Regla de producto:
//   · error DE CAMPO (falta el nombre, monto 0, fecha vacía) → inline: borde rojo + mensaje bajo el campo  → Formulario.validar / Formulario.error
//   · error DE OPERACIÓN (saldo insuficiente, algo que no se puede hacer) → toast('…', 'err')
// Cada módulo llama esto desde su propia función de guardar; el núcleo ya no conoce los ids de ningún formulario.
//
//   Formulario.validar([{ campo, mensaje, regla }, …]) → true si todos pasan. Marca TODOS los que fallan y enfoca el primero.
//        campo    id del input/select
//        mensaje  texto que se muestra bajo el campo (texto plano)
//        regla    'obligatorio' (por defecto: no vacío) | 'monto' (parseMoney > 0) | función (valor, elemento) → true si es válido
//   Formulario.error(campo, mensaje)  marca un solo campo (lo usan los planes de Préstamos, que ya traen {field, msg}).
//   Formulario.limpiar(campo)         quita la marca (se quita sola a los 3 s, y en cuanto la persona escribe).
//
// El <span class="field-error-msg" id="CAMPO_err"> se crea la primera vez que hace falta, justo después del campo: no hay que
// escribirlo en el HTML de cada hoja.
const Formulario = (() => {
  const MS_VISIBLE = 3000;
  const temporizadores = new Map(); // campo → id de setTimeout

  function _span(el, campo) {
    let span = document.getElementById(campo + '_err');
    if (!span && el && el.parentNode) {
      span = document.createElement('span');
      span.id = campo + '_err';
      span.className = 'field-error-msg';
      span.setAttribute('role', 'alert');
      el.parentNode.insertBefore(span, el.nextSibling);
    }
    return span;
  }

  function limpiar(campo) {
    clearTimeout(temporizadores.get(campo));
    temporizadores.delete(campo);
    const el = document.getElementById(campo);
    const span = document.getElementById(campo + '_err');
    if (el) el.classList.remove('input-error');
    if (span) span.classList.remove('visible');
  }

  function _marcar(campo, mensaje, enfocar) {
    const el = document.getElementById(campo);
    const span = _span(el, campo);
    if (el) {
      el.classList.add('input-error');
      if (enfocar) el.focus();
      el.addEventListener('input', () => limpiar(campo), { once: true }); // al escribir, el error se quita
    }
    if (span) { span.textContent = mensaje; span.classList.add('visible'); }
    clearTimeout(temporizadores.get(campo));
    temporizadores.set(campo, setTimeout(() => limpiar(campo), MS_VISIBLE));
  }

  const error = (campo, mensaje) => _marcar(campo, mensaje, true);

  function _cumple(regla, el) {
    const v = el ? String(el.value == null ? '' : el.value) : '';
    if (typeof regla === 'function') return !!regla(v, el);
    if (regla === 'monto') return (typeof parseMoney === 'function' ? parseMoney(v) : parseFloat(v)) > 0;
    return v.trim() !== ''; // 'obligatorio'
  }

  function validar(reglas) {
    let primero = true, ok = true;
    (reglas || []).forEach(r => {
      if (_cumple(r.regla || 'obligatorio', document.getElementById(r.campo))) return;
      ok = false;
      _marcar(r.campo, r.mensaje, primero);
      primero = false;
    });
    return ok;
  }

  return { validar, error, limpiar };
})();
if (typeof window !== 'undefined') window.Formulario = Formulario;
