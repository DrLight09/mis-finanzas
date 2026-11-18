// js/core/disposicion-pc.js
//
// Distribución de PC (≥900 px): reparte los bloques de una pantalla en columnas (principal + riel derecho) SIN duplicar nada.
//
// Por qué JS y no solo CSS: en celular el orden de los bloques es una sola columna (p. ej. en Inicio: patrimonio, tarjetas, gastos,
// salud, plan, proyección, atención). En PC los de la derecha (atención, tarjetas, salud) no son vecinos en el HTML, y una cuadrícula
// CSS con ellos mezclados acopla la altura de las filas de las dos columnas (huecos). Aquí, al pasar a PC, los mismos nodos
// (con sus ids, listeners y contenido ya pintado) se mueven a dos contenedores; al volver a celular cada uno regresa a su sitio
// exacto (una marca —comentario— queda donde estaba). El HTML de celular no cambia.
//
// Nada se vuelve a renderizar al cambiar de tamaño: la pantalla abierta, las hojas y los formularios siguen como estaban.
// Los módulos que pintan estos bloques lo hacen por id (getElementById), así que no saben ni les importa en qué contenedor están.
// Para sumar otra pantalla: una entrada más en DISPOSICIONES (ids de bloques, ya sean nodos únicos o envoltorios). Ver docs/version-pc.md.
(function () {
  'use strict';

  var CONSULTA = '(min-width: 900px)';

  // pantalla → columnas, en el orden en que se apilan en PC. `clase` es la del contenedor que se crea (estilos en css/pc.css).
  var DISPOSICIONES = [
    {
      pantalla: 'inicio',
      columnas: [
        { clase: 'columna-principal', ids: ['inicio-patrimonio', 'inicio-gastos', 'inicio-proyeccion'] },
        { clase: 'columna-riel', ids: ['s-attn-section', 'tc-deuda-card', 'inicio-salud'] },
      ],
    },
    {
      // Cuentas: lista | detalle de la cuenta abierta | movimientos. Los paneles del centro se alternan (uno a la vez) por la clase
      // panel-activo; la columna de movimientos solo se ve con el detalle simple o el de Nu (css/pc.css, según data-panel-activo).
      pantalla: 'cuentas',
      columnas: [
        { clase: 'columna-lista', ids: ['cuentas-selector'] },
        { clase: 'columna-centro', ids: ['cuentas-archivadas', 'cuentas-detalle-simple', 'cuentas-detalle-nu', 'cuentas-detalle-cajita', 'cuentas-sub-meta', 'cuentas-sub-cdts'] },
        { clase: 'columna-movimientos', ids: ['cuenta-movimientos-simple', 'cuenta-movimientos-nu'] },
      ],
    },
  ];

  function armar(d) {
    if (d.armada) return;
    var pantalla = document.getElementById('screen-' + d.pantalla);
    if (!pantalla) return;
    d.marcas = [];
    d.contenedores = d.columnas.map(function (col) {
      var contenedor = document.createElement('div');
      contenedor.className = col.clase;
      col.ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || !el.parentNode) return;
        var marca = document.createComment('disposicion-pc:' + id);
        el.parentNode.insertBefore(marca, el);
        d.marcas.push({ id: id, marca: marca });
        contenedor.appendChild(el);
      });
      pantalla.appendChild(contenedor);
      return contenedor;
    });
    pantalla.classList.add('en-columnas');
    d.armada = true;
  }

  function desarmar(d) {
    if (!d.armada) return;
    d.marcas.forEach(function (m) {
      var el = document.getElementById(m.id);
      if (el && m.marca.parentNode) m.marca.parentNode.insertBefore(el, m.marca);
      m.marca.remove();
    });
    d.contenedores.forEach(function (c) { c.remove(); });
    var pantalla = document.getElementById('screen-' + d.pantalla);
    if (pantalla) pantalla.classList.remove('en-columnas');
    d.marcas = []; d.contenedores = []; d.armada = false;
  }

  function aplicar(esPc) {
    DISPOSICIONES.forEach(function (d) { if (esPc) armar(d); else desarmar(d); });
  }

  // Sin matchMedia (entornos de prueba sin navegador) la app queda en su distribución de celular.
  if (typeof window.matchMedia !== 'function') return;
  var consultaPc = window.matchMedia(CONSULTA);
  aplicar(consultaPc.matches);
  if (consultaPc.addEventListener) consultaPc.addEventListener('change', function (e) { aplicar(e.matches); });
  else if (consultaPc.addListener) consultaPc.addListener(function (e) { aplicar(e.matches); });

  // ── Título de la cabecera = nombre de la sección (solo se ve en PC; en celular sigue «Mis finanzas») ──
  // El nombre sale del título del ítem del menú lateral; las pantallas que no están en el menú llevan el suyo aquí.
  var TITULOS_APARTE = { wrapped: 'Tu resumen' };
  function titularSeccion(nombre) {
    var destino = document.getElementById('hSeccion');
    if (!destino) return;
    var item = document.querySelector('.menu-lateral-item[data-screen="' + nombre + '"]');
    destino.textContent = TITULOS_APARTE[nombre] || (item && item.getAttribute('title')) || 'Mis finanzas';
  }
  titularSeccion('inicio');
  if (typeof Ui !== 'undefined') Ui.pantalla('*', titularSeccion, { key: 'titulo-seccion' });
})();
