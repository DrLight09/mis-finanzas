/* Prueba en navegador real (Playwright) de js/core/reordenable.js con el CSS de la app: arrastre con ratón, con el dedo (agarre y
   pulsación larga), que deslizar sea scroll y no reordene, teclado y que no queden estilos residuales.
   Uso: node scripts/arrastre/probar.js   (CAPTURA=ruta.png guarda una captura a mitad de arrastre). Sale con código 1 si algo falla. */
const {chromium}=require('playwright');
let fallos=0;
function ok(n,a,e){const bien=String(a)===String(e);if(!bien)fallos++;console.log((bien?'OK   ':'FALLA')+' '+n+(bien?'':'  → '+a+'  (esperado '+e+')'));}
(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:420,height:700},hasTouch:true,isMobile:true,deviceScaleFactor:1});
const p=await ctx.newPage();
const logs=[];p.on('pageerror',e=>logs.push('ERR '+e.message));p.on('console',m=>{if(m.type()==='error')logs.push(m.text())});
await p.goto('file://'+require('path').join(__dirname,'pagina.html'));
const orden=()=>p.$$eval('[data-cuenta-id]',n=>n.map(x=>x.dataset.cuentaId).join(','));
console.log('inicio',await orden());
// 1) TOQUE en el agarre: Efectivo (0) -> hueco 3 (Nu)
const cdp=await ctx.newCDPSession(p);
const centro=async sel=>{const r=await p.$eval(sel,e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}});return r;};
const g0=await p.$eval('[data-cuenta-id="efectivo"] .cuenta-ord-grip',e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}});
const dest=await centro('[data-cuenta-id="nu"]');
const t=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
await t('touchStart',g0.x,g0.y);
for(let i=1;i<=12;i++){await t('touchMove',g0.x+(dest.x-g0.x)*i/12,g0.y+(dest.y-g0.y)*i/12);await p.waitForTimeout(16);}
await p.waitForTimeout(300);
if(process.env.CAPTURA)await p.screenshot({path:process.env.CAPTURA});
await t('touchEnd');
await p.waitForTimeout(450);
ok('toque en el agarre',await orden(),'cs,nequi,nu,efectivo,x');
// 2) RATON: tarjeta 'x' (última) -> primera
const r1=await centro('[data-cuenta-id="x"]'),r0=await centro('[data-cuenta-id="cs"]');
await p.mouse.move(r1.x,r1.y);await p.mouse.down();
for(let i=1;i<=10;i++){await p.mouse.move(r1.x+(r0.x-r1.x)*i/10,r1.y+(r0.y-r1.y)*i/10);await p.waitForTimeout(16);}
await p.mouse.up();await p.waitForTimeout(450);
ok('ratón',await orden(),'x,cs,nequi,nu,efectivo');
// 3) toque pulsación larga FUERA del agarre
const q=await p.$eval('[data-cuenta-id="nequi"] .cuenta-card-nombre',e=>{const r=e.getBoundingClientRect();return {x:r.left+5,y:r.top+5}});
const q2=await centro('[data-cuenta-id="efectivo"]');
await t('touchStart',q.x,q.y);await p.waitForTimeout(320);
for(let i=1;i<=8;i++){await t('touchMove',q.x+(q2.x-q.x)*i/8,q.y+(q2.y-q.y)*i/8);await p.waitForTimeout(16);}
await t('touchEnd');await p.waitForTimeout(450);
ok('pulsación larga fuera del agarre',await orden(),'x,cs,nu,efectivo,nequi');
// 4) deslizar rápido fuera del agarre = scroll, no arrastre
const antes=await orden();const y0=await p.evaluate(()=>scrollY);
await t('touchStart',q.x,q.y+200);for(let i=1;i<=6;i++){await t('touchMove',q.x,q.y+200-i*30);await p.waitForTimeout(16);}await t('touchEnd');await p.waitForTimeout(300);
ok('deslizar = scroll, no reordena',await orden(),antes);
// 5) teclado
await p.focus('[data-cuenta-id="nu"] .cuenta-ord-grip');await p.keyboard.press('ArrowRight');
ok('teclado',JSON.stringify((await p.evaluate(()=>window.llamadas)).slice(-1)),'[["tecla","nu",1]]');
ok('sin estilos residuales',await p.$$eval('[data-cuenta-id]',n=>n.some(x=>(x.getAttribute('style')||'').includes('transform')||x.className.includes('reord'))),false);
ok('sin errores de consola',logs.join('|'),'');
if(fallos)process.exitCode=1;
await b.close();})();
