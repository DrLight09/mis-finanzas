// navTo(): navegación global entre pantallas, usada por las 13 pantallas
// de la app (no es específica de ningún módulo) — extraído de index.html.
// Ver auditoria-tecnica.md #2.

// ── Módulo Tarjetas de Crédito ────────────────────────────────────
// Migrado a js/modules/tarjetas_credito.js (ver ese archivo para el
// detalle de la migración de onclick→data-action y los fixes de
// escapado aplicados). Acá solo queda lo que NO le pertenece
// exclusivamente a Tarjetas de Crédito: navTo() (navegación global)
// y el Feed de actividad financiera (módulo aparte que compartía
// este mismo <script> por casualidad, no por relación real con TC).

// ── Navegar entre pantallas (función global, usada por las 13
//    pantallas de la app — no es específica de Tarjetas de Crédito) ──
function navTo(screen){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const scr=document.getElementById('screen-'+screen);
  if(scr)scr.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const masOverlay=document.getElementById('mas-menu-overlay');
  const masMenu=document.getElementById('mas-menu');
  if(masOverlay)masOverlay.classList.remove('open');
  if(masMenu)masMenu.style.display='none';
  if(screen==='tarjetas')renderTCScreen();
  const scrollArea=document.getElementById('scrollArea');
  if(scrollArea)scrollArea.scrollTop=0;
}

// ── Feed de actividad financiera ("Actividad reciente") ──────────
// Migrado a js/modules/actividad_reciente.js — ver auditoria-tecnica.md,
// punto 3. Módulo de solo lectura (como Inicio): no tenía ningún onclick
// propio que migrar. Se carga vía <script src> más abajo, en esta misma
// posición del documento, porque el wrap de window.refresh() que hace
// requiere que refresh() ya exista al parsear el archivo.
