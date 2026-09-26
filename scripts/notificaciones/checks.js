/* ================================================================
   functions/checks.js
   ================================================================
   Chequeos de "vencimiento" para las notificaciones push diarias.

   Cada check es una función pura: recibe el estado completo `S` (el
   mismo objeto que la app guarda en Firestore como JSON en
   usuarios/{uid}/data/finanzas, ya con JSON.parse aplicado) y la
   fecha de "hoy" en formato YYYY-MM-DD (zona horaria America/Bogota,
   calculada en index.js), y devuelve una lista de items
   { tipo: 'amber'|'red', texto: string }.

   Portado 1:1 desde la lógica real de la app (no reinventado):
     - Spotify vencido        → js/modules/inicio.js renderAttencion()
                                 + js/core/calc-helpers.js spPersonaPagadaVigente()
     - CDT por vencer/vencido → js/modules/inicio.js renderAttencion()
     - Encargos comprometidos → js/modules/inicio.js renderAttencion()

   A propósito quedaron AFUERA (ver conversación — no tienen fecha real):
     - Deudores con saldo pendiente (préstamos sin fecha)
     - Mesada con pago parcial (no es un recordatorio para el usuario,
       es plata que le deben a él)
     - Tarjetas con cupo casi agotado (umbral de cupo, no vencimiento)

   Para agregar un chequeo nuevo más adelante (ej. "gasto alto" una vez
   que se porte nuTotal() de cuentas.js):
     1. Escribir una función `checkX(S, hoyStr)` que devuelva items.
     2. Agregarla al array CHECKS al final de este archivo, con un
        `id` único.
   No hace falta tocar index.js — lee CHECKS dinámicamente.
   ================================================================ */

function spPersonaPagadaVigente(p, hoyStr) {
  if (!p || !p.pagado) return false;
  if (!p.proximoPago) return true;
  const hoy0 = new Date(hoyStr + 'T00:00:00');
  const prox = new Date(p.proximoPago + 'T00:00:00');
  return prox > hoy0;
}

// Igual que spNombreDe() en calc-helpers.js, pero sin getPersona() (esa
// función vive en personas.js, que no corre acá) — se busca directo en
// S.personas por id, que es lo mismo que hace getPersona() por dentro.
function spNombreDe(S, p) {
  if (!p) return '';
  if (p.personaId) {
    const per = (S.personas || []).find((x) => x.id === p.personaId);
    if (per && per.nombre) return per.nombre;
  }
  return p.nombre || '';
}

/* ---- Spotify: cobro vencido ---- */
function checkSpotifyVencido(S, hoyStr) {
  const items = [];
  if (!(S.modulos && S.modulos.spotify)) return items;
  (S.spotifyPersonas || []).forEach((p) => {
    if (p.proximoPago && p.proximoPago < hoyStr && !spPersonaPagadaVigente(p, hoyStr)) {
      items.push({ tipo: 'red', texto: `Cobro Spotify de ${spNombreDe(S, p)} vencido` });
    }
  });
  return items;
}

/* ---- CDT: por vencer (7 días) o vencido ---- */
function checkCDT(S, hoyStr) {
  const items = [];
  const hoyDate = new Date(hoyStr + 'T00:00:00');
  (S.cajitas || []).forEach((c) => {
    (c.cdts || [])
      .filter((cdt) => cdt.vence)
      .forEach((cdt) => {
        const dias = Math.ceil((new Date(cdt.vence + 'T00:00:00') - hoyDate) / 86400000);
        if (dias >= 0 && dias <= 7) {
          items.push({ tipo: 'amber', texto: `CDT "${c.nombre}" vence en ${dias}d` });
        }
        if (dias < 0) {
          items.push({ tipo: 'red', texto: `CDT "${c.nombre}" venció — ¡libera tu plata!` });
        }
      });
  });
  return items;
}

/* ---- Encargos: partes comprometidas por vencer o vencidas ---- */
function checkEncargos(S, hoyStr) {
  const items = [];
  const hoyDate = new Date(hoyStr + 'T00:00:00');
  (S.encargos || []).forEach((enc) => {
    (enc.partes || [])
      .filter((p) => !p.usada && p.fecha)
      .forEach((p) => {
        const dias = Math.round((new Date(p.fecha + 'T00:00:00') - hoyDate) / 86400000);
        if (dias < 0) {
          items.push({
            tipo: 'red',
            texto: `${enc.nombre}: "${p.desc}" venció hace ${Math.abs(dias)}d sin usarse`,
          });
        } else if (dias <= 1) {
          items.push({
            tipo: 'amber',
            texto: `${enc.nombre}: "${p.desc}" es ${dias === 0 ? 'hoy' : 'mañana'}`,
          });
        }
      });
  });
  return items;
}

/**
 * Registro de chequeos activos. El orden acá define el orden en que
 * aparecen los avisos dentro de una misma notificación.
 */
const CHECKS = [
  { id: 'spotify-vencido', run: checkSpotifyVencido },
  { id: 'cdt', run: checkCDT },
  { id: 'encargos', run: checkEncargos },
];

function ejecutarChecks(S, hoyStr) {
  const items = [];
  for (const check of CHECKS) {
    try {
      items.push(...check.run(S, hoyStr));
    } catch (e) {
      // Un chequeo roto no debe tumbar los demás ni la función entera.
      console.error(`Error en check "${check.id}":`, e);
    }
  }
  return items;
}

module.exports = { ejecutarChecks, CHECKS };
