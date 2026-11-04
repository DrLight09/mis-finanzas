/* ================================================================
   UMBRALES FINANCIEROS — js/core/umbrales.js
   ================================================================
   Los números que definen «qué es sano» en la app, en un solo sitio y con su porqué. Antes estaban enterrados en inicio.js
   (Salud, Proyección, Atención, gasto alto) y la única forma de discutir una regla era leer 700 líneas.

   Qué hay aquí: LÍMITES (a partir de cuándo algo es alto, bajo o preocupante). Qué NO hay: los puntos que suma o resta cada
   criterio del puntaje de Salud (son política de ese cálculo y viven junto a él en calcHealthScore) ni textos.

   Núcleo de carga de entrada, clásico y sin dependencias: debe cargar antes de inicio.js (que es quien lo lee). Es de solo lectura
   (congelado a fondo): cambiar un valor es editar este archivo, nunca asignarlo desde otro. Más adelante estos valores podrían
   salir de un ajuste del usuario (un estudiante con mesada no tiene el mismo «3 meses» que alguien con deudas) sin tocar a
   quien los lee.

   Fuera de aquí, a propósito: la ventana de meses «recientes» del ingreso y gasto típicos vive en periodo.js (VENTANA_REFERENCIA_MESES),
   porque periodo.js es cálculo puro que se carga solo en Node y en muchas pruebas, sin depender de otro archivo.
   ================================================================ */
const UMBRALES = (() => {
  const congelar = o => { Object.keys(o).forEach(k => { if (o[k] && typeof o[k] === 'object') congelar(o[k]); }); return Object.freeze(o); };
  return congelar({
    // Salud financiera (calcHealthScore, inicio.js)
    salud: {
      mesesReferencia: 3,                                          // meses completos que forman el gasto / ingreso «típico»
      fondoMeses: { completo: 6, minimo: 3 },                      // meses de gasto que cubre la liquidez: ≥ completo = fondo sólido; < minimo = fondo corto
      tcSobreIngreso: { alto: 1.5, critico: 3 },                   // deuda de tarjeta propia ÷ ingreso típico (en «meses de ingreso»)
      prestadoSobreLiquidez: { vigilar: 0.4, comprometido: 1, vulnerable: 2 }, // lo que te deben ÷ tu liquidez
      gastoSobreIngreso: { sano: 0.7, ajustado: 0.9, deficit: 1 }, // gasto típico ÷ ingreso típico
      cdtPesoCompleto: 0.10,                                       // el CDT puntúa completo cuando pesa ≥ 10 % de tu plata (cuentas libres + CDTs)
      rachaDeficitMeses: { aviso: 2, alerta: 3 },                  // meses completos seguidos con balance negativo
    },
    // «Compra grande» (una moto, un computador): cuándo se sugiere marcarla y se muestra su impacto ANTES de pagarla (gastos.js, calcImpactoCompra)
    compraGrande: {
      minimo: 500000,          // por debajo de esto no se muestra impacto ni se sugiere la marca (ruido)
      fraccionLiquidez: 0.3,   // se sugiere si el gasto es ≥ 30 % de tu plata disponible…
      mesesDeGasto: 2,         // …o ≥ 2 meses de tu gasto típico
    },
    // Calendario de caja (inicio.js, _eventosCaja + Periodo.saldoProyectado): cuántos días hacia adelante se mira lo ya programado
    caja: { horizonteDias: 30 },
    // Runway: meses de gasto típico que cubre la liquidez (se muestra en la tarjeta de Salud y en el hero)
    runway: { critico: 1, atencion: 3 },                           // < critico = rojo; < atencion = ámbar; el resto, verde
    // Aviso «Necesita atención» (renderAttencion, inicio.js)
    atencion: {
      cupoTcCasiAgotadoPct: 85, cdtAvisoDias: 7,
      gastoFijoAvisoDias: 3,  // un gasto fijo con día de vencimiento avisa desde N días antes
    },
    // Aviso de gasto del mes en el hero (_checkGastoAlto, inicio.js): fracción del ingreso de referencia que ya gastaste
    gastoAlto: { fraccionDelIngreso: 0.8 },
    // Hero de Inicio (calcEstadoHero, core-state.js): a partir de qué peso de «Me deben» dentro de tu patrimonio se avisa
    hero: { meDebenFraccion: 0.25 },
    // Proyección (renderProyeccion, inicio.js)
    proyeccion: {
      diasMinimos: 30,       // por debajo, un solo movimiento grande domina el promedio: no se proyecta
      puntosHistorial: 120,  // últimos N puntos del historial de patrimonio que entran a la tendencia (≈ 4 meses con un punto diario)
      diasEstable: 90,       // desde aquí la tendencia puede llamarse «estable» (si además el ritmo fue consistente entre períodos)
      maxMesesRunway: 36,    // «tu plata alcanza ~N meses» no se muestra más allá de esto (más es ruido)
    },
  });
})();
// Visible también como window.UMBRALES (igual que Periodo en periodo.js): lo lee quien accede a los globales por window, p. ej. las pruebas.
if (typeof window !== 'undefined') window.UMBRALES = UMBRALES;
