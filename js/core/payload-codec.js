// Códec del payload de Firestore (ES module, igual que wait-for-module.js: solo existe como dependencia vía `import`
// de firebase-sync.js, no tiene <script> propio).
//
// Todo el estado de la app se guarda como UN campo `payload` de UN documento, y Firestore limita el documento a 1 MiB.
// El estado es JSON muy repetitivo (mismas claves en cada movimiento), así que gzip + base64 lo deja ≈ 6 veces más chico.
// El valor comprimido empieza con 'gz1:'; un payload sin ese prefijo es JSON plano (se lee igual).
//
// Es "mejor esfuerzo" y nunca inventa datos:
//   · si el navegador no tiene CompressionStream, se guarda en plano (sigue funcionando hasta el límite);
//   · si un 'gz1:' no se puede descomprimir, se devuelve tal cual: JSON.parse falla y firebase-sync lo trata como
//     'parse-error' (jamás se guarda encima de un payload ilegible).

export const PREFIJO_GZ = 'gz1:';

const _aBase64 = bytes => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const _deBase64 = b64 => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

export async function codificarPayload(texto) {
  if (typeof CompressionStream === 'undefined' || typeof texto !== 'string') return texto;
  try {
    const buf = await new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return PREFIJO_GZ + _aBase64(new Uint8Array(buf));
  } catch (e) {
    console.warn('[Sync] No se pudo comprimir el payload; se guarda sin comprimir:', e);
    return texto;
  }
}

export async function decodificarPayload(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(PREFIJO_GZ)) return payload;
  if (typeof DecompressionStream === 'undefined') {
    console.warn('[Sync] Este navegador no puede descomprimir los datos de la nube (falta DecompressionStream).');
    return payload;
  }
  try {
    const flujo = new Blob([_deBase64(payload.slice(PREFIJO_GZ.length))]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(flujo).text();
  } catch (e) {
    console.error('[Sync] No se pudo descomprimir el payload de la nube:', e);
    return payload;
  }
}
