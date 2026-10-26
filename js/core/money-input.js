// Auto-formateo de inputs de plata mientras se escribe (extraído de index.html).
//   · .money-input → pesos con decimales opcionales: 1500000 se ve 1.500.000 y 1500000,5 se ve 1.500.000,5
//     (al salir del campo, 1 decimal se completa a 2: 1.500.000,50).
//   · .miles-input → pesos enteros (Presupuestos mensuales): nunca acepta decimales.
// Los dos comparten el mismo motor (_montoFormatear): el texto del campo ES el valor (sin buffer
// oculto), así que el cursor se puede mover y se puede escribir, borrar o pegar en medio del número
// sin que salte al final. El punto es solo visual: al leer, parseMoney()/parseMiles() lo quitan.
// Depende de parseMoney() (core-state.js) — variables globales compartidas entre scripts clásicos,
// no imports; por eso este archivo debe seguir cargando como <script> normal (sin type="module").
// Ver auditoria-tecnica.md #2/#4 y CHANGELOG.md#infraestructura--seguridad.

const _MONTO_MAX_ENTEROS = 12;

// Deja el texto como se muestra: enteros con puntos de miles + (si decimales>0) coma y hasta N decimales.
//   decimales: 0 = solo enteros; 2 = decimales opcionales.
//   pegado:    el texto viene del portapapeles/arrastre: se interpreta "1.500.000,50" y "1500.50", se ignora el signo.
// Devuelve { texto, prefijoCero }: prefijoCero=true si se antepuso un "0" (",5" → "0,5") para ubicar el cursor.
function _montoFormatear(entrada, decimales, pegado){
  let t=String(entrada==null?'':entrada);
  if(pegado){
    // Decimal = una sola coma con 1-2 cifras al final ("1.500.000,50"), o un único punto con 1-2 cifras
    // al final ("1500.50"). Todo lo demás ("1,500,000", "1.500") son miles. En campos de enteros se descarta.
    const m=t.match(/^([^,]*),(\d{1,2})\s*$/)||(t.indexOf(',')<0&&t.match(/^([^.]*)\.(\d{1,2})\s*$/));
    t=m?m[1]+','+m[2]:t.replace(/,/g,'');
    if(decimales===0)t=t.replace(/,\d*$/,'');
  }
  const iComa=decimales>0?t.indexOf(','):-1;
  const crudoEnt=(iComa<0?t:t.slice(0,iComa)).replace(/\D/g,'');
  let ent=crudoEnt.replace(/^0+(?=\d)/,'').slice(0,_MONTO_MAX_ENTEROS);
  let texto=ent.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  let prefijoCero=false;
  if(iComa>=0){
    const dec=t.slice(iComa+1).replace(/\D/g,'').slice(0,decimales);
    if(ent===''){texto='0';prefijoCero=true;}
    texto+=','+dec;
  }
  return{texto,prefijoCero};
}

// Cursor: se queda junto al mismo carácter significativo (dígito o coma) que tenía a su izquierda.
function _montoCursor(texto,significativosIzq){
  let n=0,p=0;
  while(p<texto.length&&n<significativosIzq){if(/[\d,]/.test(texto[p]))n++;p++;}
  return p;
}

function _montoAlEscribir(el,decimales,e){
  let antes=el.value;
  let pos=el.selectionStart==null?antes.length:el.selectionStart;
  // Un "." tecleado a mano (teclado numérico sin coma) hace de separador decimal: el formateador
  // nunca deja puntos que el usuario no haya puesto él (los de miles los añade solo, al formatear).
  if(decimales>0&&e&&e.inputType==='insertText'&&e.data==='.'&&pos>0&&antes[pos-1]==='.'&&antes.indexOf(',')<0){
    antes=antes.slice(0,pos-1)+','+antes.slice(pos);
  }
  const significativosIzq=(antes.slice(0,pos).match(/[\d,]/g)||[]).length;
  const pegado=!!e&&/^insertFrom(Paste|Drop)/.test(e.inputType||'');
  const r=_montoFormatear(antes,decimales,pegado);
  if(r.texto===el.value)return;
  el.value=r.texto;
  const p=_montoCursor(r.texto,significativosIzq+(r.prefijoCero?1:0));
  try{el.setSelectionRange(p,p);}catch(ex){}
}

document.addEventListener('input',function(e){
  const el=e.target;
  if(!el.classList)return;
  if(el.classList.contains('money-input'))_montoAlEscribir(el,2,e);
  else if(el.classList.contains('miles-input'))_montoAlEscribir(el,0,e);
});

// Al salir del campo: "5,5" → "5,50" y una coma sin decimales ("5,") se quita.
document.addEventListener('focusout',function(e){
  const el=e.target;
  if(!el.classList||!el.classList.contains('money-input'))return;
  const v=el.value;
  const i=v.indexOf(',');
  if(i<0)return;
  const dec=v.slice(i+1);
  const n=dec===''?v.slice(0,i):(dec.length===1?v+'0':v);
  if(n!==v){el.value=n;el.dispatchEvent(new Event('input',{bubbles:true}));}
});

// Número entero a partir de un campo de miles (o de un número): "1.500.000" → 1500000.
function parseMiles(v){
  if(typeof v==='number')return isFinite(v)?Math.round(v):0;
  return parseInt(String(v==null?'':v).replace(/\D/g,''),10)||0;
}

// Compat. con Presupuestos: formatea un entero ya numérico para mostrarlo (500000 → "500.000").
function _milesFormatear(texto,pegado){return _montoFormatear(texto,0,pegado).texto;}
