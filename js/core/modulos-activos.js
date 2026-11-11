// js/core/modulos-activos.js
//
// applyModulos(): refleja S.modulos (Spotify, Mesada, «saldo inicial») en la interfaz: pestaña de Spotify, interruptores de
// Configuración, banners de saldo inicial. Al final emite Ui 'modulos' para que otros módulos (menú Más…) se ajusten.
function applyModulos(){
  const mod=S.modulos||{mesada:true,spotify:true,corregirSaldo:true};
  // Spotify nav tab
  const navSp=document.getElementById('nav-spotify');
  if(navSp)navSp.style.display=mod.spotify?'':'none';
  // Mesada screen in Más menu
  const mesScreen=document.getElementById('screen-mesada');
  if(mesScreen && !mod.mesada) mesScreen.classList.remove('active');
  // Update config toggles
  const cfgMesada=document.getElementById('cfg-mesada');
  const cfgSpotify=document.getElementById('cfg-spotify');
  const cfgCorregirSaldo=document.getElementById('cfg-corregirSaldo');
  if(cfgMesada)cfgMesada.checked=!!mod.mesada;
  if(cfgSpotify)cfgSpotify.checked=!!mod.spotify;
  if(cfgCorregirSaldo)cfgCorregirSaldo.checked=(mod.corregirSaldo!==false);
  // If currently on spotify screen and it's disabled, go to inicio
  if(!mod.spotify&&document.getElementById('screen-spotify').classList.contains('active')){
    showScreen('inicio');
  }
  // Mostrar u ocultar banners de saldo inicial completos
  const mostrarBanners=(mod.corregirSaldo!==false);
  const bannerApertura=document.getElementById('banner-apertura-cuenta');
  if(bannerApertura)bannerApertura.style.display=mostrarBanners?'':'none';
  // Ocultar el toggle "Es saldo inicial" en el sheet de agregar dinero
  const adAperturaWrap=document.getElementById('adAperturaWrap');
  if(adAperturaWrap)adAperturaWrap.style.display=mostrarBanners?'flex':'none';
  // Ocultar el toggle "Es saldo inicial" en el sheet de Nu (entra plata)
  const nuMovAperturaWrap=document.getElementById('nuMovAperturaWrap');
  if(nuMovAperturaWrap&&!mostrarBanners)nuMovAperturaWrap.style.display='none';
  // Actualizar "Necesita atención" en Inicio para reflejar el nuevo estado de módulos
  // (ej: avisos de Spotify deben aparecer/desaparecer al activar/desactivar el módulo)
  if(typeof renderAttencion==='function') renderAttencion();
  Ui.emitir('modulos'); // ganchos de otros módulos (menú Más, ...)
}
