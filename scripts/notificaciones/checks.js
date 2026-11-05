/* ================================================================
   scripts/notificaciones/checks.js
   ================================================================
   Chequeos de "vencimiento" para las notificaciones push diarias.

   YA NO tiene su propia copia de las reglas (antes «portado 1:1 a mano» desde inicio.js, y ya había derivado una vez): las reglas viven
   en UN solo sitio, js/core/reglas.js, y las comparten la sección «Necesita atención» de la app y este push. Este archivo solo:
     1. carga ese módulo (puro, sin DOM: corre igual en Node);
     2. llama a Reglas.evaluar('push', ctx) con el estado completo `S` (el JSON de usuarios/{uid}/data/finanzas ya decodificado) y la
        fecha de «hoy» (YYYY-MM-DD, zona America/Bogota, calculada en run.js).
   Devuelve una lista de items { tipo: 'amber'|'red', texto, ir }.

   Qué reglas llegan al push: las que declaran el canal 'push' en reglas.js (Spotify vencido, CDT por vencer/vencido, partes comprometidas
   de encargos, aviso de Wrapped). Las que necesitan cálculos de la app (liquidez, calendario de caja, saldos de deudores) no corren
   aquí: sin `api` se callan, a propósito, porque este script solo tiene `S`.

   Para sumar un aviso al push: escribe la regla en js/core/reglas.js con canales ['atencion','push'] (o solo ['push']). No hace falta
   tocar este archivo. Este script espera que el repo esté completo (GitHub Actions lo hace con actions/checkout): importa ../../js/core/.
   ================================================================ */
const path = require('path');
const Reglas = require(path.join(__dirname, '..', '..', 'js', 'core', 'reglas.js'));

function ejecutarChecks(S, hoyStr) {
  try {
    return Reglas.evaluar('push', { hoy: hoyStr, S }).map(({ tipo, texto }) => ({ tipo, texto }));
  } catch (e) {
    // Un fallo inesperado no debe tumbar el envío completo (Reglas.evaluar ya aísla cada regla; esto es la última red).
    console.error('Error evaluando las reglas del push:', e);
    return [];
  }
}

// Compatibilidad con run.js y con quien inspeccionaba CHECKS: la lista de reglas del canal push.
const CHECKS = Reglas.lista('push');

module.exports = { ejecutarChecks, CHECKS };
