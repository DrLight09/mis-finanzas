// Configuración del análisis estático (scripts/lint-globales.js). Solo mira el archivo temporal .lint/todo.js, que ese script arma
// concatenando los scripts clásicos en el orden en que los carga el navegador (así ESLint ve las mismas globales que la app).
// Reglas elegidas por lo que de verdad han causado bugs aquí: nombres que no existen, duplicados, código inalcanzable.
const globals = require('globals');
module.exports = [{
  files: ['.lint/todo.js'],
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'script',
    globals: { ...globals.browser, firebase: 'readonly', module: 'readonly', require: 'readonly' },
  },
  rules: {
    'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-dupe-else-if': 'error',
    'no-func-assign': 'error', 'no-const-assign': 'error', 'no-unsafe-finally': 'error',
    'use-isnan': 'error', 'valid-typeof': 'error',
    'no-unreachable': 'warn', 'no-self-assign': 'warn',
    'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  },
}];
