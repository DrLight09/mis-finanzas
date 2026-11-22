// js/core/globales-logica.js — deja en `window` la lógica pura (UMBRALES, Reglas, Salud, PlanDeudas) para quien la llama por nombre suelto.
// Esos cuatro archivos (umbrales.js, reglas.js, salud.js, plan-deudas.js) no importan el puente a propósito: no tocan `window`, así Node
// los carga con require/import (notificaciones push y pruebas) sin navegador. En la app, este módulo hace por ellos lo que hace
// exponerGlobales en el resto de archivos.
import { exponerGlobales } from './puente.js';
import { UMBRALES } from './umbrales.js';
import { Reglas } from './reglas.js';
import { Salud } from './salud.js';
import { PlanDeudas } from './plan-deudas.js';

exponerGlobales({ UMBRALES, Reglas, Salud, PlanDeudas });
