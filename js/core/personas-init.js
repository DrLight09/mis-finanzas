// js/core/personas-init.js
//
// Inyecta (una vez) el HTML de los sheets de personas al cargar los datos. personas.js carga de entrada, antes que este archivo, así
// que _inyectarPersonaSheets() ya existe; waitFor() solo cubre el caso de que algún día cargue después.
import { exponerGlobales, exponerVariables } from './puente.js';
import { waitFor } from './wait-for.js';
import { _inyectarPersonaSheets } from '../modules/personas.js';
// Puente global (M6): las funciones se hoistean, así que quedan en window desde el principio, igual que con scripts clásicos.
exponerGlobales({ _intentarInyectarPersonaSheets });

export function _intentarInyectarPersonaSheets() {
  waitFor(
    () => typeof _inyectarPersonaSheets === 'function',
    _inyectarPersonaSheets,
    { maxAttempts: 25, onGiveUp: () => console.warn('[personas-init] _inyectarPersonaSheets() no apareció tras 25 intentos (~5 s): los sheets de personas no se inyectaron.') }
  );
}

window.addEventListener('appDataLoaded', _intentarInyectarPersonaSheets);
if (document.readyState !== 'loading' && window.S) _intentarInyectarPersonaSheets();
