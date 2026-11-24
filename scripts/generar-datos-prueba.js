// scripts/generar-datos-prueba.js
//
// Genera un respaldo JSON con datos SINTÉTICOS (los mismos de tests/support/datos-sinteticos.js: ≈ 33 meses de gastos, ingresos, tarjetas,
// préstamos, encargos y alcancía) para probar a mano el cierre de períodos sin esperar a tener 24 meses de datos reales.
//
// Uso:    node scripts/generar-datos-prueba.js [salida.json]        (por defecto: datos-prueba.json)
// Luego:  Configuración → Importar datos, EN UNA CUENTA DE PRUEBA (importar REEMPLAZA todo lo que haya en la cuenta).
// Los datos sintéticos van de 2024-01 a 2026-09. El corte del cierre se calcula solo con la fecha de hoy (mes completo con 24 meses de
// antigüedad): desde octubre de 2026 hay meses cerrables y el botón «Cerrar períodos antiguos» aparece en Configuración.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { cargarApp, generar } = require('../tests/support/datos-sinteticos');

const ctx = cargarApp();
generar(ctx, { dias: 1000 });
const texto = JSON.stringify(ctx.S, null, 2);
const salida = path.resolve(process.argv[2] || 'datos-prueba.json');
fs.writeFileSync(salida, texto);
console.log('Datos sintéticos escritos en ' + salida + ' (' + Math.round(texto.length / 1000) + ' KB).');
