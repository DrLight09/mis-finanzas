// js/core/formularios-ui.js
//
// Comportamiento común de los formularios:
//   · validación de montos (.money-input): sin negativos y sin cifras absurdas (> 1e12);
//   · foco automático del primer campo al abrir cada hoja (un solo gancho comodín de Ui).
// (La validación por campo con mensaje vive en Formulario, js/core/formulario.js.)
(function(){
  // ── Validación de montos ──
  document.addEventListener('change', e => {
    const inp = e.target;
    if(!inp.classList.contains('money-input')) return;
    const val = window.parseMoney ? window.parseMoney(inp.value) : 0;
    if(val < 0){
      if(window.toast) window.toast('El monto no puede ser negativo','err');
      inp.value = '';
    }
    if(val > 1e12){
      if(window.toast) window.toast('El monto parece demasiado grande','err');
      inp.value = '';
    }
  });

  // ── Foco automático al abrir una hoja ──
  // Mapeo de sheet-id → id del primer campo a enfocar
  const focusMap = {
    'gasto-var': 'gv_desc',
    'gasto-fijo': 'gf_n',
    'spotify': 'sp_n',
    'nuevo-encargo': 'enc_nombre',
    'nueva-cuenta': 'nc_nombre',
    'agregar-dinero': 'adDesc',
    'restar-dinero': 'rdDesc',
    // 'mesada-pago' y 'mesada-pend' NO se enfocan a propósito: abren con el monto ya
    // precargado (la cuota del mes / lo pendiente), que casi siempre es el correcto;
    // el teclado saltaría sin necesidad. El campo sigue editable con un toque.
    'transferir': 'tr_monto',
  };

  // Foco al abrir cada hoja: un solo gancho comodín (Ui.hoja '*', fase 'despues': la hoja ya está visible).
  Ui.hoja('*', function(id) {
    const focusId = focusMap[id];
    if (focusId) focusSheetField(focusId);   // js/core/sheet-behavior.js: foco en el momento justo, sin timers sueltos
  }, { fase: 'despues', key: 'mejoras-foco' });
})();
