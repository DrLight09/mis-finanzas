# Historial: Proyección financiera

> Parte del historial de cambios de «Mis Finanzas». Índice y últimas entradas: [`../CHANGELOG.md`](../CHANGELOG.md).

## Proyección financiera

### ✅ Corregido (2026-09-22) — La tendencia mensual no usa trimmed mean; el algoritmo real es otro

`proyeccion-financiera.md` §2 y `analisis-financiero.md` (sección "Relación con otras secciones") describían el cálculo de tendencia como un promedio de tasas diarias de cambio con **trimmed mean** (descartar la más alta y la más baja de 5+ tasas). Revisado `renderProyeccion()` en `inicio.js`: el algoritmo real es la suma del cambio neto total de patrimonio dividida entre los días reales totales — un promedio ponderado por días, sin ningún recorte de outliers. El propio comentario del código explica por qué: el ingreso real llega en pocos días grandes (mesada, pagos), y un trimmed-mean de tasas por-intervalo terminaría descartando esos días como "outliers", subestimando la tendencia. Se reescribió el mecanismo en ambos documentos. De paso se confirmó y restauró la cifra exacta que había suavizado por precaución en el pase anterior: `MIN_DIAS_PARA_TENDENCIA = 7`.

También en `proyeccion-financiera.md`: la fila "Cuentas personalizadas marcadas como 'incluir en total'" no es real — `calcPatrimonioTotal()` (`core-state.js`) suma TODAS las cuentas personalizadas sin ningún filtro (`incluirEnTotal` no existe en el código). Se corrigió. Se agregó una nota sobre `_calcCSafe`/`_calcCDTSafe` (envoltorios defensivos de `calcC()`/`calcCDT()`, que viven en el módulo lazy `cuentas.js`) y sobre `_patrimonioDependenciasListas()`, el guard que evita grabar un snapshot de patrimonio artificialmente bajo si `cuentas.js` o `prestado.js` todavía no cargaron.
