// js/core/registro-errores.js
//
// Registro LOCAL de errores no atrapados. Hasta ahora un error inesperado (una promesa rechazada, un fallo dentro de un listener) solo
// aparecía en una consola que en el celular nadie abre, así que un fallo real se veía como «a veces no hace nada». Aquí se guardan los
// últimos errores en este dispositivo (nada sale a ningún servidor) y Configuración los muestra con un botón para copiarlos y reportarlos.
//
// Se importa PRIMERO en js/main.js para que un error al arrancar cualquier otro módulo también quede registrado.
import { exponerGlobales } from './puente.js';

const CLAVE = 'mf-errores';
const MAXIMO = 30;                       // los más recientes; el almacenamiento local es chico y esto es diagnóstico, no historial
const IGNORAR = /ResizeObserver loop/;   // aviso inofensivo del navegador, no un fallo de la app

function _leer() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch (_) { return []; }
}

// Anota un error. Nunca lanza (un registro de errores que falla no puede causar otro error). Si es el mismo mensaje que el último
// registrado solo sube su contador, para que un bucle de errores no desplace todo lo demás.
export function registrarError(origen, error) {
  try {
    const mensaje = String((error && error.message) || error || 'Error desconocido').slice(0, 300);
    if (IGNORAR.test(mensaje)) return;
    const pila = String((error && error.stack) || '').slice(0, 600);
    const ahora = new Date().toISOString();
    const lista = _leer();
    const ultimo = lista[lista.length - 1];
    if (ultimo && ultimo.mensaje === mensaje && ultimo.origen === origen) {
      ultimo.veces = (ultimo.veces || 1) + 1;
      ultimo.ultima = ahora;
    } else {
      lista.push({ origen, mensaje, pila, veces: 1, primera: ahora, ultima: ahora });
    }
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(-MAXIMO)));
  } catch (_) { /* nada más que hacer */ }
}

export const listarErrores = _leer;
export function limpiarErrores() { try { localStorage.removeItem(CLAVE); } catch (_) { /* nada */ } }

// Texto listo para pegar en un reporte.
export function erroresATexto(lista = _leer()) {
  return lista.map(e => `[${e.ultima || e.primera}] ${e.origen}${e.veces > 1 ? ' ×' + e.veces : ''}: ${e.mensaje}${e.pila ? '\n' + e.pila : ''}`).join('\n\n');
}

if (typeof window !== 'undefined' && window.addEventListener) {
  // Los errores de carga de imágenes/scripts (sin `error` ni `message`) no son fallos de lógica: se ignoran.
  window.addEventListener('error', e => { if (e.error || e.message) registrarError('error', e.error || e.message); });
  window.addEventListener('unhandledrejection', e => registrarError('promesa', e.reason));
  exponerGlobales({ registrarError, listarErrores, limpiarErrores, erroresATexto });
}
