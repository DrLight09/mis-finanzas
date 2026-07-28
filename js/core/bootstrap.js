// Bootstrap mínimo: iniciales(), fecha del header, autosave — extraído de
// index.html (bloque inline post-Cuentas). Ver docs/auditoria-tecnica.md #2.


function iniciales(nombre) {
  return nombre.trim().split(/\s+/).map(w=>w[0]||'').slice(0,2).join('').toUpperCase()||'?';
}


/* ================================================================ */

/* ================================================================ */


document.getElementById('hDate').textContent=new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
// FIREBASE: load() y refresh() se llaman desde _fbLoadData() después de autenticar.
// Solo inicializamos lo que no depende de datos de usuario:
// Autosave silencioso cada 60s
setInterval(() => { if(window._fbUser) save(); }, 60000);
// Enter en inputs de nueva categoría: migrado a js/modules/configuracion.js (evita doble-wiring/doble-agregado).
// Preview del sheet "crear CDT" migrado a js/modules/cuentas.js (estaba compartiendo <script> con Tarjetas de Crédito, sin relación real con TC).
