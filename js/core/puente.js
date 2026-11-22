// js/core/puente.js — el «puente global» de la migración a módulos ES (M6).
//
// Los scripts clásicos compartían un ámbito global: cualquier archivo podía llamar a una función de otro por su nombre. Ahora cada
// archivo es un módulo ES y lo que usa de los archivos que cargan ANTES lo importa de forma explícita. Pero hay dos casos en que no se
// puede importar y se sigue usando el nombre «suelto» (que el navegador busca en `window`):
//   · los módulos lazy (js/modules/…): se cargan con import() la primera vez que se entra a su pantalla, así que el núcleo no puede
//     importarlos de forma estática (eso los volvería a cargar todos de entrada);
//   · las llamadas «hacia adelante» (un archivo que carga antes usa una función de uno que carga después, solo al ejecutarse, nunca al
//     cargar): importar eso crearía un ciclo y cambiaría el orden de evaluación.
// Por eso cada módulo deja sus nombres en `window` con estas dos funciones. Las funciones se exponen al principio (se hoistean, como en un
// script clásico); las constantes y clases al final; las variables `let` que otro archivo lee por nombre, con un accesor (así no se
// quedan con una copia vieja cuando el módulo las reasigna).
export function exponerGlobales(nombres) {
  for (const k of Object.keys(nombres)) {
    try { Object.defineProperty(window, k, { value: nombres[k], writable: true, configurable: true, enumerable: true }); } catch (_) { /* propiedad nativa no configurable (top, document…): no se toca */ }
  }
}
export function exponerVariables(accesores) {
  for (const k of Object.keys(accesores)) {
    try { Object.defineProperty(window, k, { get: accesores[k][0], set: accesores[k][1], configurable: true, enumerable: true }); } catch (_) { /* ídem */ }
  }
}
