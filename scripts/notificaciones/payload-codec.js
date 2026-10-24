'use strict';
/* ================================================================
   scripts/notificaciones/payload-codec.js
   Copia adaptada a Node/CommonJS de js/core/payload-codec.js.
   Mismo formato: 'gz1:' + base64(gzip(JSON)). Un payload sin el
   prefijo es JSON plano (compatibilidad con datos viejos).
   Usa zlib de Node (gzip estándar), equivalente a
   CompressionStream/DecompressionStream('gzip') del navegador.
   ================================================================ */

const zlib = require('zlib');

const PREFIJO_GZ = 'gz1:';

async function codificarPayload(texto) {
  if (typeof texto !== 'string') return texto;
  try {
    const gz = zlib.gzipSync(Buffer.from(texto, 'utf8'));
    return PREFIJO_GZ + gz.toString('base64');
  } catch (e) {
    console.warn('[Sync] No se pudo comprimir el payload; se guarda sin comprimir:', e);
    return texto;
  }
}

async function decodificarPayload(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(PREFIJO_GZ)) return payload;
  try {
    const buf = Buffer.from(payload.slice(PREFIJO_GZ.length), 'base64');
    return zlib.gunzipSync(buf).toString('utf8');
  } catch (e) {
    console.error('[Sync] No se pudo descomprimir el payload de la nube:', e);
    return payload; // firebase-sync/run.js lo tratará como parse-error, igual que el navegador
  }
}

module.exports = { PREFIJO_GZ, codificarPayload, decodificarPayload };