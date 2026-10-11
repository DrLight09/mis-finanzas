// Prueba de comportamiento del libro (jsdom): migración v5 sobre un backup real + operaciones por la puerta única.
//   MIS_FINANZAS_ROOT=<raíz del repo> node tests/libro-migracion.js backup.json     (requiere: npm i jsdom)
const {JSDOM}=require('jsdom'),fs=require('fs');
const ROOT=process.env.MIS_FINANZAS_ROOT||process.cwd(), OUT=ROOT+'/js/';
const dom=new JSDOM('<!doctype html><html><body><div id="toast"></div></body></html>',{runScripts:'outside-only',url:'https://localhost/'});
const w=dom.window; w.console=console;
w.HTMLCanvasElement.prototype.getContext=()=>({measureText:()=>({width:10}),font:''});
const errs=[];
const files=['core/core-state.js','core/cuenta-efectos.js','core/periodo.js','core/nu-calc.js','core/libro.js','core/calc-helpers.js','core/diferencial.js','modules/cuentas.js','modules/prestado.js'].filter(f=>fs.existsSync(OUT+f));
w.eval("function crearSplitWidget(){} window.Events={on(){},attr(){},registerAll(){}}; window._guardarEditarPersonaGlobal=function(){}; window.PERSONA_COLORES=['#c8f060']; window.openSheet=window.closeSheet=function(){};"); // stubs de split.js, events.js y personas.js (no hacen falta para lo que se prueba)
for(const f of files){ const p=OUT+f; try{ w.eval(fs.readFileSync(p,'utf8')); }catch(e){ errs.push(f+': '+e.message); } }
if(errs.length) console.log('errores de carga (informativo):',errs);
const run=c=>w.eval(c);
const backup=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
run('Object.keys(S).forEach(k=>delete S[k])');
Object.assign(w.S,JSON.parse(JSON.stringify(backup)));
w.eval('window.toast=function(){};');
// 1) migración real (v3,v4 ya aplicadas en el backup? schema:'+backup.schemaVersion+')
console.log('schemaVersion antes:',w.S.schemaVersion);
run('aplicarMigraciones(S)');
console.log('schemaVersion después:',w.S.schemaVersion,'· entradas libro:',w.S.libro.length);
let v=run('Libro.verificar()'); console.log('1) tras migrar: ok =',v.ok);
const chk=(t)=>{const r=run('Libro.verificar()');console.log(t.padEnd(52),r.ok?'✓ cuadra':'✗ DESCUADRE '+JSON.stringify(r.descuadres.map(d=>[d.nombre,+d.dif.toFixed(2)])));return r.ok;};
const caj=n=>w.S.cajitas.find(c=>c.nombre===n).id;
const sobra='cajita:'+caj('Sobra'), mesada='cajita:'+caj('Mesada');
// 2) operaciones por la puerta única
run(`sumarFuente('efectivo',5000,{desc:'prueba',origen:{modulo:'test'}})`); chk('2) sumarFuente efectivo +5.000');
run(`descontarFuente('nequi',100,{origen:{modulo:'test'}})`); chk('3) descontarFuente nequi −100 (saldo 0,06 → negativo)');
console.log('   saldo nequi ahora:',run("getSaldoFuente('nequi')"),'(antes se recortaba en 0)');
run(`sumarFuente('${sobra}',1234.56)`); chk('4) sumarFuente cajita Sobra (materializa interés)');
run(`descontarFuente('${mesada}',50000)`); chk('5) descontarFuente cajita Mesada −50.000');
run(`descontarFuente('tc:${w.S.tarjetasCredito[0]?w.S.tarjetasCredito[0].id:'x'}',999)`); chk('6) compra con TC (no toca libro)');
run(`Libro.conOrigen({modulo:'prestado',ref:'abc'},()=>{descontarFuente('efectivo',700);sumarFuente('nequi',700);})`); chk('7) conOrigen: transferencia efectivo→nequi');
const ult=w.S.libro.slice(-2).map(l=>l.origen.modulo+':'+l.origen.ref);console.log('   origen de las 2 últimas patas:',ult);
// 3) rutas de cuentas.js
if(run("typeof materializarIntereses")==='function'){
  run(`S.cajitas.find(c=>c.id==='${sobra.slice(7)}').fecha='2026-09-01'`); run(`materializarIntereses(S.cajitas.find(c=>c.id==='${sobra.slice(7)}'))`); chk('8) materializarIntereses (rendimiento)');
  const rd=w.S.libro.filter(l=>l.cuenta===sobra&&l.tipo==='rendimiento'); console.log('   entradas rendimiento Sobra en el libro:',rd.length,'(una por mes)',rd.map(r=>r.fecha.slice(0,7)+':'+r.monto.toFixed(2)).join(' | '));
  run(`ajustarSaldoCuenta('${sobra}',(S.cajitas.find(c=>c.id==='${sobra.slice(7)}').saldo)-300,{tipo:'ajuste',desc:'chequeo'})`); chk('9) ajustarSaldoCuenta (chequeo −300)');
} else console.log('materializarIntereses no cargó en jsdom (omitido)');
// 4) idempotencia + borrado de una cuenta no rompe
const n0=w.S.libro.length; run('Libro.sembrar(S)'); console.log('10) sembrar de nuevo no duplica:',w.S.libro.length===n0?'✓':'✗');
// 5) save() dispara verificación sin avisar si cuadra
w.S.libro.push({id:'x',fecha:'2026-10-11',cuenta:'efectivo',monto:50,tipo:'ajuste'}); // fuerza descuadre
let aviso=null; w.toast=(m)=>{aviso=m;}; w.eval('window._dataLoaded=true;window._fbLoadData=undefined;');
try{ run('save()'); }catch(e){ console.log('save() lanzó (informativo):',e.message); }
console.log('11) descuadre forzado detectado por save():',aviso?('✓ aviso → '+aviso):'✗ sin aviso', '· _libroDescuadres =',JSON.stringify(w.eval('window._libroDescuadres||null')).slice(0,120));

w.S.libro.pop(); run('window._libroAvisado=false'); // deshace el descuadre forzado de la prueba 11
// 12) origen y reversión (Libro.conOrigen con rev → tipo 'reversion')
run(`Libro.conOrigen({modulo:'prestado',ref:'m1',rev:true},()=>sumarFuente('efectivo',300))`);
const ult1=w.S.libro[w.S.libro.length-1]; console.log('12) reversión por contexto:',ult1.tipo==='reversion'&&ult1.origen.ref==='m1'&&ult1.origen.rev?'✓ tipo reversion, ref m1':'✗ '+JSON.stringify(ult1));
// 13) revertir un préstamo "Me deben" real de prestado.js (si el módulo carga en este entorno)
if(run("typeof _revertirMovDeudor")==='function'){
  run(`window.__d={id:'d1',nombre:'Test',movimientos:[]};window.__m={id:'mm1',tipo:'prestamo',monto:5000,fecha:'2026-10-11',fuente:'efectivo'};
       __d.movimientos.push(__m);descontarFuente('efectivo',5000,{origen:{modulo:'prestado',ref:'mm1'}});`);
  chk('13a) préstamo aplicado con origen prestado');
  try{ run('_revertirMovDeudor(__d,__m)'); const rv=w.S.libro.filter(l=>l.origen&&l.origen.ref==='mm1'); console.log('13b) entradas con ref mm1:',rv.map(l=>l.tipo+' '+l.monto).join(' | ')); chk('13c) libro tras revertir el préstamo');
  }catch(e){ console.log('13b) _revertirMovDeudor no pudo correr en jsdom (faltan helpers del navegador):',e.message.slice(0,90)); }
} else console.log('13) prestado.js no cargó en este entorno (omitido)');
