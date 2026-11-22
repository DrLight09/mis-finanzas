// js/main.js — punto de entrada ÚNICO de la app (M6: módulos ES nativos, sin bundler).
//
// Importa los archivos del núcleo y de las pantallas de carga inmediata, EN EL ORDEN en que antes cargaban como <script defer> en index.html
// (ese orden importa: p. ej. navegacion.js parchea funciones de gastos.js; ver docs/mis-finanzas.md). Cada archivo importa de forma explícita
// lo que usa de los que cargan antes; lo demás se resuelve por el puente global (js/core/puente.js). Los módulos de pantallas lazy
// (Loader.GROUPS en lazy-loader.js) NO van aquí: se cargan con import() la primera vez que se entra a su pantalla.
// umbrales.js, reglas.js, salud.js y plan-deudas.js NO son módulos: son lógica pura que también carga Node con require (notificaciones y tests), así que siguen como <script> clásicos, antes de este.

import './core/puente.js';
import './core/fecha.js';
import './core/async-css.js';
import './core/events.js';
import './core/diferencial.js';
import './core/split.js';
import './core/ui.js';
import './core/formulario.js';
import './core/sw-registro.js';
import './core/estado.js';
import './core/personas-core.js';
import './core/cuentas-fuentes.js';
import './core/persistencia.js';
import './core/patrimonio.js';
import './core/ingresos.js';
import './core/dialogos.js';
import './core/utilidades-ui.js';
import './core/refresh.js';
import './core/cuenta-efectos.js';
import './core/cobros.js';
import './core/html-tag.js';
import './core/periodo.js';
import './core/nu-calc.js';
import './core/calc-helpers.js';
import './core/fuentes-filtro.js';
import './core/reordenable.js';
import './core/color-picker.js';
import './core/wait-for.js';
import './core/wrapped-gate.js';
import './modules/gastos.js';
import './modules/personas.js';
import './core/navegacion.js';
import './core/modulos-activos.js';
import './core/eventos-base.js';
import './core/disposicion-pc.js';
import './core/lazy-loader.js';
import './core/money-input.js';
import './core/movimientos.js';
import './core/bootstrap.js';
import './core/mas-menu.js';
import './core/sheet-behavior.js';
import './core/gastos-fijos-progress.js';
import './core/saldos-ocultos.js';
import './core/arranque-ui.js';
import './core/formularios-ui.js';
import './core/busqueda-global.js';
import './core/personas-init.js';
import './core/notificaciones-push.js';
import './modules/inicio.js';
