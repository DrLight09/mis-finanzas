/* ═══════════════════════════════════════════════════════════════
   js/core/calc-helpers.js

   Funciones de cálculo puras (solo dependen de `S`/`MC`, sin DOM ni UI)
   que Inicio (inicio.js) necesita para "Necesita atención" y el
   health score, pero que conceptualmente "viven" en mesada.js y
   tarjetas-credito.js — módulos que ahora son lazy (ver
   js/core/lazy-loader.js) y solo cargan cuando el usuario visita
   esas pantallas.

   Por qué existe este archivo: forzar la carga de esos dos módulos
   completos (44KB + 60KB) desde Inicio solo para leer 2-3 números
   anulaba el beneficio de haberlos vuelto lazy — con este archivo,
   Inicio tiene lo que necesita sin arrastrar el resto (botones,
   sheets, wiring de esas pantallas). Ver CHANGELOG.md.

   También aloja `Deudas` (capa de acceso a "Me deben"/"Yo debo" y sus saldos).

   Este archivo carga de entrada (<script defer>, sin passar por
   Loader), justo después del núcleo — ver orden de <script>
   en index.html. mesada.js y tarjetas-credito.js YA NO definen estas
   funciones: las usan como globales definidas acá. Por eso este
   archivo tiene que estar cargado ANTES que ellos (irrelevante en la
   práctica ya que son lazy y cargan mucho después, pero se respeta
   el mismo criterio de orden que el resto de la app).
   ═══════════════════════════════════════════════════════════════ */

import { exponerGlobales, exponerVariables } from './puente.js';
import { MC, S } from './estado.js';
import { Periodo } from './periodo.js';
import { _fechaSafe } from './dialogos.js';
// Puente global (M6): las funciones se hoistean, así que quedan en window desde el principio, igual que con scripts clásicos.
exponerGlobales({ _ensureMesadas, getMesadaData, _getCuotaAnio, _mesNombreDeKey, mesadaOrigenDeMovimientoEncargo, getTCById, tcCupoUsadoPct, tcCupoDisponible, getDeudorSaldo, getMiDeudaSaldo, totalPrestadoPendiente, totalMisDeudasPendiente, encargoSaldo, encargoComprometido, encargoLibre, spotifyPersonaPagadaVigente });

/* ---- Mesada (antes en mesada.js) ---- */
export function _ensureMesadas(){
  if(!S.mesadas)S.mesadas={papa:{cuotas:{},pagos:{}},mama:{cuotas:{},pagos:{}}};
  ['papa','mama'].forEach(p=>{
    if(!S.mesadas[p])S.mesadas[p]={cuotas:{},pagos:{}};
    if(!S.mesadas[p].cuotas)S.mesadas[p].cuotas={};
    if(!S.mesadas[p].pagos)S.mesadas[p].pagos={};
  });
}

export function getMesadaData(parent){
  _ensureMesadas();
  return S.mesadas[parent].pagos;
}

export function _getCuotaAnio(parent,anio){
  _ensureMesadas();
  return Periodo.cuotaMesada(S.mesadas[parent].cuotas,anio);
}

// Formatea una clave "2026-4" → "Mayo 2026" (depende de MC, la lista de
// nombres de mes definida en el núcleo de index.html — no de S).
export function _mesNombreDeKey(key){
  const partes=String(key).split('-');
  const anio=partes[0];
  const mesIdx=parseInt(partes[1],10)||0;
  return (MC[mesIdx]||'')+' '+anio;
}

// ¿Esta salida de un encargo la creó un pago de Mesada ("Usado para mesada")? Devuelve
// { parent, key } del mes que la originó, o null. Lo usa Encargos (grupo lazy distinto) para no
// dejar borrar a mano una salida cuyo efecto vive en Mesada (cuenta destino + espejo): solo
// Mesada sabe revertirla completa. No depende de marcas en el movimiento, así que también
// reconoce las creadas antes de este cambio.
export function mesadaOrigenDeMovimientoEncargo(movimientoId){
  if(!movimientoId||!S.mesadas)return null;
  for(const parent of ['papa','mama']){
    const pagos=(S.mesadas[parent]&&S.mesadas[parent].pagos)||{};
    for(const key of Object.keys(pagos)){
      const info=pagos[key];
      if(info.origenEncargo&&info.origenEncargo.movimientoId===movimientoId)return {parent,key};
      if((info.pendienteHistorial||[]).some(h=>h.origenEncargo&&h.origenEncargo.movimientoId===movimientoId))return {parent,key};
    }
  }
  return null;
}

/* ---- Tarjetas de crédito (antes en tarjetas-credito.js) ---- */
export function getTCById(id){ return (S.tarjetasCredito||[]).find(x=>x.id===id); }

export function tcCupoUsadoPct(tc){
  const cupo=tc.cupo||0;
  if(!cupo) return 0;
  return Math.min(100,((tc.deuda||0)/cupo)*100);
}

export function tcCupoDisponible(tc){
  return Math.max(0,(tc.cupo||0)-(tc.deuda||0));
}

/* ---- Deudas: "Me deben" (S.deudores) y "Yo debo" (S.misDeudas) ----
   Capa de acceso única. Ningún módulo debería leer ni escribir S.deudores /
   S.misDeudas directo: pasa por `Deudas`. Así, cómo se guardan las deudas
   (hoy dos listas) es un detalle de este bloque y no de los 12 archivos que
   las consultan.

   Dirección:  'favor'  = me deben (S.deudores)   — abre con 'prestamo'
               'contra' = yo debo (S.misDeudas)   — abre con 'recibido'
   El resto de tipos ('abono', 'pago_completo', 'pago') reducen la deuda. Los
   nombres de tipo son disjuntos, así que el saldo no necesita saber la
   dirección: saldo = lo que abre − lo que reduce, en la propia dirección de
   esa deuda (positivo = queda algo pendiente).

   Vive acá (carga de entrada) y no en prestado.js (lazy) porque el patrimonio,
   "Necesita atención" y Personas la consultan sin esperar al módulo — antes
   el núcleo caía a 0 con guards typeof y tuvo que bloquear snapshots
   mientras prestado.js no cargaba (ver _patrimonioDependenciasListas). */
export const Deudas = (() => {
  const COLECCION = { favor: 'deudores', contra: 'misDeudas' };
  const ABRE = { prestamo: true, recibido: true };
  return {
    FAVOR: 'favor',
    CONTRA: 'contra',
    // Tolerancias en pesos, una sola vez para todo el módulo:
    //  TOL       — suma de partes vs. total, saldo "≈ 0", guardia de integridad.
    //  TOL_FINO  — comparar un monto contra un saldo/tope (evita que un resto de
    //              decimales bloquee un pago completo).
    TOL: 1,
    TOL_FINO: 0.5,
    // Lista viva (nunca undefined). Para agregar/quitar usar agregar()/quitar().
    lista(dir) { return S[COLECCION[dir]] || []; },
    porId(dir, id) { return this.lista(dir).find(d => d.id === id); },
    porPersona(dir, personaId) { return this.lista(dir).find(d => d.personaId === personaId); },
    agregar(dir, deuda) {
      const k = COLECCION[dir];
      if (!S[k]) S[k] = [];
      S[k].push(deuda);
      return deuda;
    },
    quitar(dir, id) {
      const k = COLECCION[dir];
      S[k] = (S[k] || []).filter(d => d.id !== id);
    },
    // ¿Este tipo de movimiento abre/aumenta la deuda?
    abre(m) { return !!ABRE[m.tipo]; },
    // Saldo pendiente de UNA deuda (cualquier dirección).
    saldo(d) {
      return (d.movimientos || []).reduce((a, m) => ABRE[m.tipo] ? a + m.monto : a - m.monto, 0);
    },
    // Suma de lo que queda pendiente en una dirección (ignora saldos <= 0).
    totalPendiente(dir) {
      return this.lista(dir).reduce((a, d) => { const s = this.saldo(d); return a + (s > 0 ? s : 0); }, 0);
    }
  };
})();

// Nombres históricos (los usan 8 archivos y los tests): delegan en Deudas.
export function getDeudorSaldo(d) { return Deudas.saldo(d); }
export function getMiDeudaSaldo(d) { return Deudas.saldo(d); }
export function totalPrestadoPendiente() { return Deudas.totalPendiente('favor'); }
export function totalMisDeudasPendiente() { return Deudas.totalPendiente('contra'); }

/* ---- Encargos: saldo, comprometido y libre — 2026-11-18 ----
   Antes en encargos.js (lazy). Personas calcula la posición neta de una persona (personas-core.js) y el perfil muestra el saldo de sus
   encargos sin esperar a que cargue el módulo: mismo motivo que Deudas y las funciones de Spotify de abajo. Son puras (solo el encargo). */
export function encargoSaldo(encargo) {
  return (encargo.movimientos||[]).reduce((a,m)=>{
    return a + (m.tipo==='entrada'?m.monto:-m.monto);
  }, encargo.saldoInicial||0);
}

// Cuánto del saldo ya tiene destino asignado vía partes comprometidas (sin usar todavía).
export function encargoComprometido(encargo) {
  return (encargo.partes||[]).filter(p=>!p.usada).reduce((a,p)=>a+(p.monto||0), 0);
}

// Lo que realmente se puede sacar del encargo ahora mismo: saldo total menos lo ya
// comprometido. Nunca negativo — si el comprometido superó el saldo (p.ej. porque
// una salida por fuera de "usar parte" lo redujo), no hay nada libre para sacar.
export function encargoLibre(encargo) {
  return Math.max(0, encargoSaldo(encargo) - encargoComprometido(encargo));
}

/* ---- Spotify (antes en spotify.js) — 2026-09-20 ----
   Mismo motivo: los avisos "Cobro Spotify de X vencido" de "Necesita
   atención". El nombre del integrante sale de Personas.nombre(p.personaId) (personas-core.js). */
export function spotifyPersonaPagadaVigente(p){
  // Determina si el "Pagó" de esta persona sigue vigente para el ciclo actual.
  // Si ya llegó (o pasó) su fecha de próximo pago, el ciclo vencido ya terminó
  // y debe volver a mostrarse como "Pendiente" aunque el flag pagado siga en true.
  if(!p||!p.pagado)return false;
  if(!p.proximoPago)return true;
  const hoy0=new Date();hoy0.setHours(0,0,0,0);
  const prox=_fechaSafe(p.proximoPago);
  return prox>hoy0;
}

// Puente global (M6): constantes y clases (ya inicializadas) y variables que otros archivos leen por nombre.
exponerGlobales({ Deudas });
