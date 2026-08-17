// js/core/html-tag.js
//
// Solución de raíz al punto "Auditoría exhaustiva de .innerHTML" de
// auditoria-tecnica.md: el mismo bug (texto libre sin escapar, interpolado
// en .innerHTML/toast()) se corrigió catorce veces, en catorce módulos
// distintos, siempre reforzando el barrido manual (buscar nombres de campo
// conocidos, revisar función por función). Eso nunca cierra el hallazgo de
// raíz — solo lo reduce hasta la próxima vez que se agregue un campo de
// texto libre nuevo o se lo envuelva en una función auxiliar nueva
// (spNombreDe, fuenteLabel, _cpFuenteLabel... ya pasó con las tres).
//
// Este archivo no reemplaza escHtml() (sigue existiendo en core-state.js,
// se sigue usando igual en sitios que arman un string suelto, no un
// template completo). Agrega un segundo primitivo, html``, para construir
// markup: escapa automáticamente TODO valor interpolado, salvo que se pida
// explícitamente lo contrario con raw(). El bug de "me olvidé de envolver
// esto en escHtml()" deja de ser posible en cualquier sitio migrado a
// html`` — no hay nada que olvidar, el escapado es el comportamiento por
// defecto del propio template.
//
// Uso:
//   el.innerHTML = html`<div>${nombre}</div>`;
//     → nombre se escapa solo, sin tocar escHtml() a mano.
//
//   el.innerHTML = html`<div>${raw(fragmentoYaConstruido)}</div>`;
//     → opt-out explícito, para cuando el valor YA es HTML de confianza
//       (ej. el resultado de otro html`` armado más arriba, o una
//       constante fija del propio código, nunca texto libre del usuario).
//
//   html`<ul>${items.map(x => html`<li>${x.nombre}</li>`)}</ul>`
//     → los arrays y los html`` anidados se resuelven solos, sin doble
//       escapado ni necesidad de .join('').
//
// Migración: gradual, módulo por módulo — mismo criterio que el resto de
// la refactorización (ver auditoria-tecnica.md, "Solución gradual, sin
// reescribir todo"). No hace falta convertir nada que no se esté tocando
// ya por otro motivo.
//
// Carga como <script> clásico (no type="module"), mismo criterio que
// core-state.js/sheet-stack.js: sus globales (html, raw) deben quedar
// disponibles como variables léxicas para el resto de los <script>
// clásicos del documento. Depende de escHtml(), definida en core-state.js
// — debe cargar después de ese archivo.

function raw(value) {
  return {
    __raw: true,
    value: value == null ? '' : String(value),
    toString() { return this.value; }
  };
}

function _htmlEscapeValue(v) {
  if (v == null) return '';
  if (v && v.__raw === true) return v.value;
  if (Array.isArray(v)) return v.map(_htmlEscapeValue).join('');
  return escHtml(String(v));
}

function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += _htmlEscapeValue(values[i]);
    out += strings[i + 1];
  }
  return raw(out);
}
