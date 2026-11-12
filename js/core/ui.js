// js/core/ui.js
//
// Ciclo de vida de la interfaz: UN registro para enterarse de «se abrió la hoja X», «se mostró la pantalla Y» o «cambiaron los
// módulos», en vez de que cada módulo reasigne `openSheet = function(){…}` o envuelva la global con hookGlobal() (eliminado).
//
// Mismo modelo que Refresh (js/core/refresh.js):
//   · cada gancho se registra con una `key` única; registrar otra vez la misma key REEMPLAZA el gancho anterior (un módulo lazy que
//     se carga dos veces, o un test que recarga el archivo, no duplica nada);
//   · cada gancho corre en su propio try/catch con log: uno que falle no silencia a los demás ni rompe la navegación;
//   · el orden es el de registro (o `orden` si se pasa: menor corre antes).
//
// API
//   Ui.hoja(id, fn, { key, fase, orden })     fn(id) al abrir la hoja `id` ('*' = cualquiera).
//        fase 'antes' (por defecto): corre ANTES de marcarla abierta; si fn devuelve `false`, la hoja NO se abre
//              (útil para abrir otra cosa en lugar de la hoja: un selector, un menú).
//        fase 'despues': corre cuando la hoja ya está abierta y apilada (enfocar un campo, pintar contenido).
//   Ui.pantalla(nombre, fn, { key, orden })   fn(nombre) cuando showScreen(nombre) terminó de activar la pantalla ('*' = cualquiera).
//   Ui.en(evento, fn, { key, orden })         evento libre. Hoy: 'modulos' (applyModulos), 'atencion' (renderAttencion),
//        'persona-editada' (id), 'fuente-alerta' (prefix; devolver true = aviso ya pintado).
//   Ui.emitir(evento, ...args)                corre los ganchos de un evento; devuelve la lista de resultados.
//   Ui.quitar(evento, key) · Ui.registrados([evento])   para tests y para depurar.
//
// Los nombres de evento de hoja/pantalla son 'hoja:antes:<id>', 'hoja:despues:<id>' y 'pantalla:<nombre>'.
//
// Este archivo no depende de nada de la app (ni de document): carga antes que navegacion.js y que cualquier módulo.
const Ui = (() => {
  const eventos = new Map(); // evento -> [{ key, fn, orden, n }]
  let n = 0;
  let anonimas = 0;

  function en(evento, fn, opts) {
    if (typeof evento !== 'string' || !evento || typeof fn !== 'function') {
      throw new Error('Ui.en(evento, fn, opts): evento (texto) y fn (función) son obligatorios');
    }
    const o = opts || {};
    const key = o.key == null ? '#anon' + (anonimas++) : String(o.key);
    const lista = eventos.get(evento) || [];
    const i = lista.findIndex(g => g.key === key);
    const gancho = { key, fn, orden: o.orden == null ? 100 : o.orden, n: i >= 0 ? lista[i].n : n++ };
    if (i >= 0) lista[i] = gancho; else lista.push(gancho);
    lista.sort((a, b) => a.orden - b.orden || a.n - b.n);
    eventos.set(evento, lista);
  }

  function emitir(evento, ...args) {
    const lista = eventos.get(evento);
    if (!lista) return [];
    return lista.slice().map(g => {
      try { return g.fn(...args); }
      catch (e) { console.error('[Ui:' + evento + ':' + g.key + ']', e); return undefined; }
    });
  }

  const quitar = (evento, key) => {
    const lista = eventos.get(evento);
    if (!lista) return;
    const i = lista.findIndex(g => g.key === String(key));
    if (i >= 0) lista.splice(i, 1);
  };

  const registrados = evento => {
    const filas = [];
    eventos.forEach((lista, ev) => {
      if (evento && ev !== evento) return;
      lista.forEach(g => filas.push({ evento: ev, key: g.key, orden: g.orden }));
    });
    return filas;
  };

  function hoja(id, fn, opts) {
    const o = opts || {};
    const fase = o.fase === 'despues' ? 'despues' : 'antes';
    en('hoja:' + fase + ':' + id, fn, o);
  }
  const pantalla = (nombre, fn, opts) => en('pantalla:' + nombre, fn, opts);

  /* Lo llama openSheet(): corre los ganchos 'antes' de la hoja y de '*'. Devuelve false si alguno pidió cancelar la apertura. */
  function antesDeAbrirHoja(id) {
    const r = emitir('hoja:antes:' + id, id).concat(emitir('hoja:antes:*', id));
    return !r.includes(false);
  }
  /* Lo llama openSheet() al terminar: la hoja ya está abierta y en la pila. */
  function despuesDeAbrirHoja(id) {
    emitir('hoja:despues:' + id, id);
    emitir('hoja:despues:*', id);
  }
  /* Lo llama showScreen() al terminar de activar la pantalla. */
  function alMostrarPantalla(nombre) {
    emitir('pantalla:' + nombre, nombre);
    emitir('pantalla:*', nombre);
  }

  return { en, emitir, quitar, registrados, hoja, pantalla, antesDeAbrirHoja, despuesDeAbrirHoja, alMostrarPantalla };
})();
if (typeof window !== 'undefined') window.Ui = Ui;
