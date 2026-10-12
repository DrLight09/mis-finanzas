// Prueba de comportamiento del libro (jsdom): migración v5 sobre un backup real + operaciones por la puerta única.
//   MIS_FINANZAS_ROOT=<raíz del repo> node tests/libro-migracion.js backup.json     (requiere: npm i jsdom)
const {JSDOM}=require('jsdom'),fs=require('fs');
const ROOT=process.env.MIS_FINANZAS_ROOT||process.cwd(), OUT=ROOT+'/js/';
const dom=new JSDOM('<!doctype html><html><body><div id="toast"></div></body></html>',{runScripts:'outside-only',url:'https://localhost/'});
const w=dom.window; w.console=console;
const vm=require('vm'), ctxv=dom.getInternalVMContext(); // como <script> clásicos: los `const` de nivel superior se ven entre archivos
w.HTMLCanvasElement.prototype.getContext=()=>({measureText:()=>({width:10}),font:''});
const errs=[];
const files=['core/core-state.js','core/cuenta-efectos.js','core/periodo.js','core/nu-calc.js','core/libro.js','core/calc-helpers.js','core/diferencial.js','modules/cuentas.js','modules/prestado.js','modules/mesada.js'].filter(f=>fs.existsSync(OUT+f));
w.eval("function crearSplitWidget(){} window.Events={on(){},attr(){},registerAll(){}}; window._guardarEditarPersonaGlobal=function(){}; window.PERSONA_COLORES=['#c8f060']; window.openSheet=window.closeSheet=function(){};"); // stubs de split.js, events.js y personas.js (no hacen falta para lo que se prueba)
for(const f of files){ const p=OUT+f; try{ vm.runInContext(fs.readFileSync(p,'utf8'),ctxv,{filename:p}); }catch(e){ errs.push(f+': '+e.message); } }
if(errs.length) console.log('errores de carga (informativo):',errs);
const run=c=>vm.runInContext(c,ctxv);
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

// 14) cuentas.js: "Sumar dinero" y "Restar dinero" dejan origen = id del movimiento que crean (cuentas.js ya aplica el saldo DESPUÉS de crearlo)
if(run("typeof registrarEntradaConApertura")==='function'){
  w.S.libro=w.S.libro||[]; const n0=w.S.libro.length;
  run(`registrarEntradaConApertura('efectivo',1000,'2026-10-11','Sueldo de prueba',false,'')`);
  const movIn=w.S.movimientos[w.S.movimientos.length-1];
  const eIn=w.S.libro[w.S.libro.length-1];
  console.log('14a) Sumar dinero → libro:',eIn.monto===1000&&eIn.origen.modulo==='cuentas'&&eIn.origen.ref===movIn.id?'✓ origen cuentas, ref = id del movimiento':'✗ '+JSON.stringify(eIn));
  run(`registrarSalida('efectivo',400,'2026-10-11','Restar de prueba','')`);
  const movOut=w.S.movimientos[w.S.movimientos.length-1], eOut=w.S.libro[w.S.libro.length-1];
  console.log('14b) Restar dinero → libro:',eOut.monto===-400&&eOut.origen.ref===movOut.id?'✓':'✗ '+JSON.stringify(eOut));
  chk('14c) tras sumar y restar dinero');
} else console.log('14) cuentas.js sin registrarEntradaConApertura (omitido)');
// 15) mesada.js: entrar y sacar un abono — el ref es el id del espejo
if(run("typeof _mesadaEntrar")==='function'){
  const id=run(`_mesadaEntrar('nequi',500,'2026-10-11','Mesada de prueba')`);
  const a=w.S.libro[w.S.libro.length-1]; console.log('15a) _mesadaEntrar → libro:',a.origen.modulo==='mesada'&&a.origen.ref===id&&!!id?'✓ ref = id del espejo':'✗ '+JSON.stringify(a));
  run(`_mesadaSacar('nequi',500,'${id}',true)`);
  const b=w.S.libro[w.S.libro.length-1]; console.log('15b) _mesadaSacar → libro:',b.tipo==='reversion'&&b.origen.ref===id?'✓ tipo reversion, mismo ref':'✗ '+JSON.stringify(b));
  chk('15c) tras entrar y sacar el abono');
} else console.log('15) mesada.js no cargó en este entorno (omitido)');

// 16) el historial de cada cuenta (getMovimientosCuenta) ahora incluye las entradas del libro sin fila heredada
if(run("typeof getMovimientosCuenta")==='function'){
  try{
    if(!w.Deudas) w.Deudas={lista:()=>[]}; // viene de calc-helpers.js (no está en este entorno de prueba)
    const cid=w.S.cajitas[0].id;
    run(`ajustarSaldoCuenta('cajita:${cid}',(S.cajitas[0].saldo||0)+123.45,{tipo:'ajuste',desc:'Chequeo de prueba'})`);
    run(`ajustarSaldoCuenta('cajita:${cid}',(S.cajitas[0].saldo||0)+10,{tipo:'rendimiento',desc:'Intereses de Nu'})`);
    const filas=run(`getMovimientosCuenta('nu')`).filter(f=>f._origen&&f._origen.indexOf('Libro')===0);
    const ok=filas.length>=3&&filas.every(f=>f._secundario===true&&f._movId&&f.fuente.startsWith('cajita:'));
    console.log('16a) historial de Nu incluye filas del libro:',ok?'✓ '+filas.length+' filas (intereses, ajustes, CDT…), todas con candado':'✗ '+filas.length);
    const aj=filas.find(f=>f.desc==='Chequeo de prueba');
    console.log('16b) fila del ajuste:',aj&&aj.monto===123.45&&aj.tipo==='ingreso'?'✓ +123,45 como ingreso con candado':'✗ '+JSON.stringify(aj));
    const sinExp=filas.find(f=>f.desc.indexOf('sin explicar')>-1);
    console.log('16c) la diferencia de Sobra aparece como fila visible:',sinExp&&Math.abs(sinExp.monto+7848.54)<0.01?'✓ −7.848,54 "sin explicar" (ya no es plata invisible)':'✗ '+JSON.stringify(sinExp));
    const ef=run(`getMovimientosCuenta('efectivo')`).filter(f=>f._origen&&f._origen.indexOf('Libro')===0);
    console.log('16e) Efectivo (cuadra al centavo) no recibe filas extra:',ef.length===0?'✓':'✗ '+ef.length);
    chk('16d) libro tras los ajustes de prueba');
  }catch(e){ console.log('16) getMovimientosCuenta no pudo correr en jsdom:',e.message.slice(0,120)); }
} else console.log('16) cuentas.js sin getMovimientosCuenta (omitido)');
