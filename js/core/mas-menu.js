// "MÁS MENU": abrir/cerrar el menú de más opciones, navegación desde sus
// items, y wrap de applyModulos para mostrar/ocultar Spotify/Mesada en el
// menú según el estado de esos módulos — extraído de index.html. Depende
// de applyModulos (definido en el bloque sheet-stack/nav, que carga antes)
// y de showScreen/refresh (llamados en runtime, con guard typeof donde
// corresponde). Ver auditoria-tecnica.md #2/#4.

// ── 1. MÁS MENU ─────────────────────────────────────────────────────────────
(function(){
  const masBtn = document.getElementById('nav-mas-btn');
  const masMenu = document.getElementById('mas-menu');
  const masOverlay = document.getElementById('mas-menu-overlay');

  function openMas() {
    masMenu.style.display = 'block';
    masOverlay.classList.add('open');
    masMenu.style.transform = 'translateY(100%)';
    masMenu.style.transition = 'none';
    requestAnimationFrame(()=>{
      masMenu.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
      masMenu.style.transform = 'translateY(0)';
    });
    // Highlight nav-mas-btn
    masBtn.classList.add('active');
  }
  function closeMas() {
    masMenu.style.transform = 'translateY(100%)';
    setTimeout(()=>{ masMenu.style.display='none'; }, 280);
    masOverlay.classList.remove('open');
    masBtn.classList.remove('active');
  }
  window.closeMas = closeMas;

  masBtn && masBtn.addEventListener('click', ()=>{
    if(masMenu.style.display==='block') closeMas(); else openMas();
  });
  masOverlay.addEventListener('click', closeMas);

  // Navigate from Más items
  document.querySelectorAll('.mas-item[data-screen]').forEach(item=>{
    item.addEventListener('click', ()=>{
      const screen = item.getAttribute('data-screen');
      closeMas();
      showScreen(screen);
      if(typeof refresh==='function') refresh();
    });
  });

  // Expose applyModulos override for Spotify and Mesada in Más menu
  const _origApplyMod = window.applyModulos;
  window.applyModulos = function(){
    if(_origApplyMod) _origApplyMod();
    // Show/hide spotify in Más menu based on module state
    const masSpotify = document.getElementById('mas-spotify');
    const cfgSpotify = document.getElementById('cfg-spotify');
    if(masSpotify && cfgSpotify) {
      masSpotify.style.display = cfgSpotify.checked ? 'flex' : 'none';
    }
    // Show/hide mesada in Más menu based on module state
    const masMesada = document.getElementById('mas-mesada');
    const cfgMesada = document.getElementById('cfg-mesada');
    if(masMesada && cfgMesada) {
      masMesada.style.display = cfgMesada.checked ? 'flex' : 'none';
    }
  };
  // Initial update
  setTimeout(window.applyModulos, 100);
})();
