/* ================================================================
   COSTO DE LA DEUDA — js/core/plan-deudas.js   (cálculo PURO: sin DOM, sin `window`, sin `S`; corre igual en Node)
   ================================================================
   Intereses mensuales de una deuda a partir de su tasa E.A. (opcional por deuda: sin tasa el costo es 0). Lo usa Análisis
   (m.costoDeuda → Salud). El global conserva el nombre `PlanDeudas` (y el archivo `plan-deudas.js`) por historia: el «Plan de salida de
   deudas» de Inicio se eliminó y solo queda este cálculo.

     · PlanDeudas.tasaMensual(ea)          E.A. → mensual: (1 + ea)^(1/12) − 1
     · PlanDeudas.costoMensual(saldo, ea)  intereses de un mes sobre el saldo (0 sin tasa)
   Es una estimación, no una promesa: no modela cuotas, comisiones ni cambios de tasa.
   ================================================================ */
const PlanDeudas = (() => {
  const tasaMensual = ea => (ea > 0 ? Math.pow(1 + ea / 100, 1 / 12) - 1 : 0);
  const costoMensual = (saldo, ea) => Math.max(0, saldo || 0) * tasaMensual(ea);

  return { tasaMensual, costoMensual };
})();
if (typeof window !== 'undefined') window.PlanDeudas = PlanDeudas;
if (typeof module !== 'undefined' && module.exports) module.exports = PlanDeudas;
