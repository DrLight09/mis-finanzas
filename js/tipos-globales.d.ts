// Solo para `npm run tipos` (tsc --checkJs): declara lo que los archivos revisados leen del global sin importarlo.
// Ver docs/arquitectura-archivos.md, sección «Tipos».
interface Window { Fecha: unknown }
/** salud.js (puro, también corre en Node) la usa solo si existe: en la app la deja el puente; en Node no está y la sugerencia apunta a «cuentas». */
declare function cuentasAhorro(opts?: { soloActivas?: boolean }): Array<{ id: string }>;
declare function fuenteDeCuenta(id: string): string;
