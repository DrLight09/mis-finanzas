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
      // Pilares con semáforo y estado de situación (salud.js)
      pilares: {
        deuda: { ingresoAmbar: 1.5, ingresoRojo: 3, activosAmbar: 0.5, activosRojo: 1 }, // deuda propia (tarjeta + «Yo debo») ÷ ingreso típico, y ÷ tus activos líquidos
        flujo: { meses: 3, ambar: 1, rojo: 2 },                    // de los últimos 3 meses completos: 1 en déficit = ámbar; 2 o más = rojo
        tendencia: { dias: 90, minDias: 30, planoPct: 3 },         // patrimonio a 90 días; con menos de 30 días de historial no se opina; ±3 % es «plano»
      },
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
      gastoFijoSinDiaDesde: 25, // un gasto fijo SIN día y aún sin pagar este mes avisa desde este día del mes (el mes ya casi termina)
    },
    // Aviso de gasto del mes en el hero (_checkGastoAlto, inicio.js): fracción del ingreso de referencia que ya gastaste
    gastoAlto: { fraccionDelIngreso: 0.8 },
    // Hero de Inicio (calcEstadoHero, core-state.js): a partir de qué peso de «Me deben» dentro de tu patrimonio se avisa
    hero: { meDebenFraccion: 0.25 },
    // Plan de salida de deudas (plan-deudas.js)
    deudas: { metaMeses: 24 }, // si la deuda no baja a tu ritmo, cuánto liberar al mes para quedar libre en este plazo
    // Conciliación del patrimonio (Periodo.conciliar, tarjeta de Análisis, scripts/conciliacion.js)
    conciliacion: { minimo: 30000 }, // menos que esto sin explicar es ruido (redondeos, intereses de Nu y de tarjeta): no se muestra
    // Wrapped (wrapped-gate.js y wrapped.js): cuándo se puede abrir, cuánto dato hace falta y dónde cambia el tono de las frases
    wrapped: {
      ventanaDias: 31,       // el Wrapped del año anterior está disponible del 1 al 31 de enero
      minDias: 30,           // días distintos con registros para contar un año completo (menos = «poco»)
      minMeses: 3,           // meses distintos con registros (menos = «poco»)
      patrimonio: {          // variación del patrimonio del año, en %
        caidaLeve: 5,        // hasta −5 %: «bajó un poco»; de −5 a −15 %: «bajó»; desde −15 %: «cayó fuerte»
        caidaFuerte: 15,
        crecimientoMedio: 15, // desde +15 %: «creció con fuerza»; desde +50 %: «año grande»
        crecimientoFuerte: 50,
        tope: 300,           // por encima de ±300 % no se presenta porcentaje (base demasiado pequeña)
      },
      compraExplicaCaida: 0.7, // una sola compra «explica» la caída si es ≥ 70 % de lo que bajó el patrimonio
      cambioFuerte: 0.7,       // una mitad del año concentra ≥ 70 % (la otra ≤ 30 %) → hubo una «fase»
    },
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
// Y como módulo CommonJS para quien corre en Node sin navegador (scripts/notificaciones, vía reglas.js).
if (typeof module !== 'undefined' && module.exports) module.exports = UMBRALES;
