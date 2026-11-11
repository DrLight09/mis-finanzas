// js/core/sw-registro.js
//
// Registro del Service Worker y aviso «hay una versión nueva».
//
// Diseño (ver sw.js): cada versión del SW precachea TODOS los archivos y los sirve de su propia caché, y NO se activa sola.
// Cuando hay una versión nueva descargada («en espera»), esta pestaña sigue funcionando completa con la anterior hasta que la persona
// toca «Actualizar»: ahí se le dice al SW que se active (SKIP_WAITING), y al cambiar el controlador se recarga la página. Así no se
// mezclan dos versiones en una pestaña ni se pierde lo que se esté escribiendo sin querer.
//
// Rutas relativas a la página (sw.js, scope './'): no depende del nombre del repositorio ni del dominio.
if ('serviceWorker' in navigator) {
  let _actualizando = false;
  const _teniaControlador = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register('sw.js', { scope: './' })
    .then(reg => {
      console.info('[SW] Registrado correctamente');
      // Una versión nueva ya descargada de una visita anterior…
      if (reg.waiting && navigator.serviceWorker.controller) mostrarAvisoNuevaVersion(reg.waiting);
      // …o una que se descarga ahora.
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) mostrarAvisoNuevaVersion(nuevo);
        });
      });
      // Una PWA puede quedar abierta días: al volver a ella se busca una versión nueva.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    })
    .catch(err => console.info('[SW] No disponible:', err.message));

  // El controlador cambia (a) en la primera instalación — no hay nada que recargar — o (b) cuando la persona aceptó actualizar.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_teniaControlador && _actualizando) location.reload();
  });

  window.__swActualizar = function (worker) {
    _actualizando = true;
    worker.postMessage({ tipo: 'SKIP_WAITING' });
  };
}

function mostrarAvisoNuevaVersion(worker) {
  if (document.getElementById('sw-aviso')) return; // ya está visible: varios cambios seguidos no apilan avisos
  const barra = document.createElement('div');
  barra.id = 'sw-aviso';
  barra.className = 'sw-aviso';
  barra.setAttribute('role', 'status');
  const texto = document.createElement('span');
  texto.className = 'sw-aviso-texto';
  texto.textContent = 'Hay una versión nueva de la app.';
  const actualizar = document.createElement('button');
  actualizar.type = 'button';
  actualizar.className = 'sw-aviso-btn';
  actualizar.textContent = 'Actualizar';
  actualizar.addEventListener('click', () => {
    if (worker && window.__swActualizar) window.__swActualizar(worker);
    else location.reload();
  });
  const luego = document.createElement('button');
  luego.type = 'button';
  luego.className = 'sw-aviso-cerrar';
  luego.setAttribute('aria-label', 'Cerrar');
  luego.textContent = '×';
  luego.addEventListener('click', () => barra.remove());
  barra.append(texto, actualizar, luego);
  document.body.appendChild(barra);
}
window.mostrarAvisoNuevaVersion = mostrarAvisoNuevaVersion;
