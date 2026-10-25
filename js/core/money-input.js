// Auto-formateo estilo calculadora para inputs de plata (clase .money-input):
// los dígitos se empujan de derecha a izquierda desde los centavos — extraído
// de index.html. Depende de _moneyDigits/_moneyRender (definidos en el bloque
// S/save de index.html, que carga antes) y de parseMoney() — variables
// globales compartidas entre scripts clásicos, no imports; por eso este
// archivo debe seguir cargando como <script> normal (sin type="module") y
// en la misma posición relativa donde vivía este código. Ver
// auditoria-tecnica.md #2/#4 y CHANGELOG.md#infraestructura--seguridad.

/* ---- AUTO-FORMATEO CALCULADORA PARA INPUTS MONETARIOS ---- */
// Estilo calculadora: los dígitos se empujan de derecha a izquierda desde los centavos.
// 0,00 → tecleo 5 → 0,05 → tecleo 0 → 0,50 → tecleo 5 → 5,00 → tecleo 0 → 50,00
// Teclear 0 cuando el valor ya es 0,00 no hace nada.

function _initMoneyInput(el){
  // Initialize digit buffer from current value
  const num=parseMoney(el.value||'');
  if(num>0){
    // Convert number to digit buffer: e.g. 1234.56 → "123456"
    const cents=Math.round(num*100);
    _moneyDigits.set(el, cents===0?'':String(cents));
  } else {
    _moneyDigits.set(el,'');
  }
}

document.addEventListener('focusin', function(e){
  const el=e.target;
  if(!el.classList.contains('money-input'))return;
  if(el.id==='nuRate'||(el.id&&el.id.startsWith('ct_')||el.id.startsWith('cdt_tasa_')||el.id.startsWith('cdt_rte_')))return;
  _initMoneyInput(el);
  // Show formatted value
  const digits=_moneyDigits.get(el)||'';
  el.value=_moneyRender(digits);
  // Move cursor to end
  setTimeout(()=>{try{el.setSelectionRange(el.value.length,el.value.length);}catch(ex){}},0);
});

document.addEventListener('keydown', function(e){
  const el=e.target;
  if(!el.classList.contains('money-input'))return;
  if(el.id==='nuRate'||(el.id&&el.id.startsWith('ct_')||el.id.startsWith('cdt_tasa_')||el.id.startsWith('cdt_rte_')))return;

  const key=e.key;

  // Allow: Tab, Enter, arrows, F-keys, etc.
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(['Tab','Enter','ArrowUp','ArrowDown'].includes(key))return;

  // Digits 0-9
  if(/^\d$/.test(key)){
    e.preventDefault();
    let digits=_moneyDigits.get(el)||'';
    // If all digits are zero or empty, and key is '0', do nothing
    if(key==='0'&&(digits===''||parseInt(digits,10)===0)){
      // Already at 0,00 — no-op
      return;
    }
    // Append digit (max 12 digits to avoid overflow)
    if(digits.length<12){
      digits+=key;
      // Remove leading zeros
      digits=digits.replace(/^0+/,'')||'0';
      if(digits==='0')digits='';
    }
    _moneyDigits.set(el,digits);
    el.value=_moneyRender(digits);
    try{el.setSelectionRange(el.value.length,el.value.length);}catch(ex){}
    // Trigger oninput callbacks
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return;
  }

  // Backspace: remove last digit
  if(key==='Backspace'){
    e.preventDefault();
    let digits=_moneyDigits.get(el)||'';
    digits=digits.slice(0,-1);
    _moneyDigits.set(el,digits);
    el.value=_moneyRender(digits);
    try{el.setSelectionRange(el.value.length,el.value.length);}catch(ex){}
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return;
  }

  // Delete: clear all
  if(key==='Delete'){
    e.preventDefault();
    _moneyDigits.set(el,'');
    el.value='0,00';
    try{el.setSelectionRange(el.value.length,el.value.length);}catch(ex){}
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return;
  }

  // Block everything else (coma, punto, letras, etc.) except navigation
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(key)){
    e.preventDefault();
  }
});

// Prevent paste of arbitrary text — convert pasted number to digit buffer
document.addEventListener('paste', function(e){
  const el=e.target;
  if(!el.classList.contains('money-input'))return;
  if(el.id==='nuRate'||(el.id&&el.id.startsWith('ct_')||el.id.startsWith('cdt_tasa_')||el.id.startsWith('cdt_rte_')))return;
  e.preventDefault();
  const text=(e.clipboardData||window.clipboardData).getData('text');
  const num=parseMoney(text);
  if(num>0){
    const cents=Math.round(num*100);
    const digits=String(cents);
    _moneyDigits.set(el,digits);
    el.value=_moneyRender(digits);
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }
});

/* ---- MILES EN ENTEROS (.miles-input) ----
   Para montos en pesos enteros (p. ej. Presupuestos mensuales): se escribe 500000 y se ve 500.000
   mientras se teclea. NO es el estilo calculadora de .money-input (que empuja desde los centavos).
   El punto es solo visual: al guardar se usa parseMiles(), que devuelve el número sin puntos. */
function _milesFormatear(texto, pegado){
  let t=String(texto==null?'':texto);
  // Al pegar, "1.500.000,50" trae decimales: se descartan (el campo es de pesos enteros).
  if(pegado)t=t.replace(/,\d{1,2}\s*$/,'');
  const d=t.replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,12);
  return d.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}

function parseMiles(v){
  if(typeof v==='number')return isFinite(v)?Math.round(v):0;
  return parseInt(String(v==null?'':v).replace(/\D/g,''),10)||0;
}

document.addEventListener('input', function(e){
  const el=e.target;
  if(!el.classList||!el.classList.contains('miles-input'))return;
  const antes=el.value;
  const pos=el.selectionStart==null?antes.length:el.selectionStart;
  const digitosIzq=antes.slice(0,pos).replace(/\D/g,'').length;
  const pegado=/^insertFrom(Paste|Drop)/.test(e.inputType||'');
  const nuevo=_milesFormatear(antes,pegado);
  if(nuevo===antes)return;
  el.value=nuevo;
  // El cursor se queda junto al mismo dígito (no salta al final al formatear).
  let n=0,p=0;
  while(p<nuevo.length&&n<digitosIzq){if(/\d/.test(nuevo[p]))n++;p++;}
  try{el.setSelectionRange(p,p);}catch(ex){}
});
