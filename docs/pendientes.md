# Pendientes y sugerencias

Solo lo que falta. Lo que ya está hecho al 100 % se borra de aquí cuando se hace (la historia vive en `CHANGELOG.md`). Origen: `revision-estructural-mis-finanzas.md` (M1–M17) y sus dos adendas (N1, N2, H1–H6).

Última actualización: 2026-11-22.

## Pasos tuyos (no son de código)

| # | Qué | Para qué |
|---|---|---|
| 0 | **Tras subir M6: abrir la app desplegada en tu navegador y en el celular, recargar hasta que salga «Actualizar» y probar un recorrido normal** (agregar un gasto, abrir cuentas, Configuración, un préstamo) | La prueba en Chromium real y la comparación con la versión anterior dieron idénticas, pero no se pudo probar el despliegue real, Firebase ni un teléfono |
| 1 | Subir el último zip y hacer un despliegue NUEVO (commit nuevo o Actions → «Run workflow»), sin «Re-run» | `deploy-pages` falló 3 veces con «Found 0 artifact(s)»; el flujo ya espera y reintenta |
| 3 | Probar la fusión con dos pestañas en un navegador real (recargar todas antes) | Solo está probada con tests y un navegador sin Firebase |
| 4 | Probar los avisos push con la app cerrada en el celular (instalada en pantalla de inicio) | El evento `push` nativo (M4) no se pudo probar en un teléfono real |
| 5 | Borrar `.github/workflows/test.yml` y `mapa-codigo.yml` si aún existen | Quedaron reemplazados por `ci.yml` |

## Pendiente a propósito

| # | Qué | Por qué se dejó | Cuándo retomarlo |
|---|---|---|---|
| M9 | Estilos dinámicos desde JS a atributo `hidden` y clases de estado | Estás rehaciendo los estilos | Cuando termines la reforma de estilos |
| M10 | CSS por capas (`@layer`) en vez de por cronología | Ídem | Ídem |
| Contraste | Contraste de color (axe lo tiene desactivado a propósito) | Ídem | Con M9/M10 |

## Decisiones tuyas

| # | Qué | Nota |
|---|---|---|
| M15 | Minificar / bundler solo de desarrollo | El documento lo marca «no ahora» |

## Observaciones sin resolver

- **Puente global (M6):** quedan ~150 lecturas por nombre suelto, a propósito: 83 apuntan a módulos de carga bajo demanda (importarlos estáticamente anularía la carga perezosa) y 69 son hacia adelante (importarlas cambiaría el orden en que se ejecutan los archivos). Se irán quitando solo si se reordenan o separan esos archivos.
- **Tipos:** `npm run tipos` revisa 11 archivos; para sumar los demás hay que convertir antes su lectura de `S` y del puente en imports (ver `docs/arquitectura-archivos.md`).
- **Rama `main` protegida:** descartada: exigir el check `ci` bloquearía los `git push` directos de `subir.sh` (el check corre después del push). El despliegue ya depende de `ci`.
- **Prueba de Chromium en `subir.sh`:** si dice que no pudo instalarlo, se omite en tu PC y la corre el CI antes de desplegar. Para ver el motivo real: `npx playwright install chromium`.
