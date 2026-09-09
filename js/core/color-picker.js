/* ═══════════════════════════════════════════════════════════════
   js/core/color-picker.js

   Helper mínimo compartido para los selectores de color (círculos)
   que aparecen en Cuentas, Tarjetas de crédito y Prestado. Antes
   cada módulo tenía su propia función de 5 líneas (selColorNC,
   tcSelColor, selColor) haciendo exactamente lo mismo: marcar con
   borde el círculo cuyo dataset.color coincide con el elegido.
   Ahora hay una sola función; cada módulo la llama pasándole su
   propia clase CSS de círculos. No es un "motor" tipo split.js —
   acá alcanza con esto, montar un widget parametrizado sería
   sobre-ingeniería para algo de una línea.
   ═══════════════════════════════════════════════════════════════ */
function marcarColorSeleccionado(claseCirculos, color){
  document.querySelectorAll(claseCirculos).forEach(el=>{
    el.style.border = (color && el.dataset.color === color) ? '2px solid var(--accent)' : '2px solid transparent';
  });
}
