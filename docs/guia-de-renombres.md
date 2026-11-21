# Guía de renombres

Cómo se hizo la mejora 12 (nombres y abreviaturas, noviembre de 2026), qué trampas aparecieron y qué se decidió no tocar y por qué. Sirve para repetir un renombre sin romper nada. El vocabulario y las reglas de nombres están en [`glosario-dominio.md`](./glosario-dominio.md); el historial de cambios, en [`CHANGELOG.md`](./CHANGELOG.md).

## 1. Qué protege hoy contra retrocesos

`tests/convenciones.test.js` (8 pruebas):

1. Nombres de archivo en `kebab-case`.
2. «Trinquete» de abreviaturas (`tests/fixtures/convenciones-base.json`, hoy en 0). `node scripts/convenciones.js` muestra el recuento; `--actualizar` baja el trinquete; `--actualizar --forzar` solo al sumar abreviaturas nuevas a la lista.
3. Cada abreviatura vigilada tiene su forma completa en el glosario.
4. Todo `dataset` / `getAttribute` / selector `data-*` que el código lee se escribe en alguna plantilla.
5. Los valores guardados con constante (`pago_completo`, `yo_cuenta`, `yo_directo`, `cobro_deuda`) no se repiten como texto suelto fuera de `js/core/estado.js`.
6. Toda acción `data-action` escrita en una plantilla está registrada con `Events`, y toda registrada se usa.
7. Todo «algo.md» citado en `js/`, `tests/` y `scripts/` existe en `docs/`.
8. **Trinquete de CSS** (`tests/fixtures/css-base.json`, `node scripts/convenciones-css.js`): no aparecen clases con prefijo abreviado ni fuera de `kebab-case`, ni más `!important`, ni más colores hex fuera de `:root`. Las reglas están en `guia-estilo-sheets.md` §0 bis.

## 2. Cómo se renombra (la herramienta no está en el repo)

Vivió en un entorno temporal. Si hace falta de nuevo hay que rehacerla:

- **Parser** (`acorn`) + **análisis de alcance** (`eslint-scope`): renombrar por variable (detectando choques y sombreado), no por texto. Propiedades y claves por separado. Los textos (comentarios, cadenas, plantillas) nunca a ciegas.
- **Recorrer el árbol con un recorrido genérico:** `acorn-walk` no entrega las propiedades de los patrones de desestructuración (`const {a, b} = x`) y una clave excluida se renombraba por error.
- **En desestructuraciones y claves abreviadas:** si la variable cambia pero la clave no, escribir `clave: variable`.
- Para ids del HTML y valores guardados (que son texto, no identificadores) sirve un reemplazo por expresión regular con límites de palabra, **después de comprobar que el nombre nuevo no existe ya** y verificando al final que cada id citado en el código exista en `index.html`.

## 3. Trampas reales

1. **Un nombre con dos papeles** (función + nombre de acción en `data-action`, o clave de un objeto + id del DOM): renombrar la función, no la cadena. Para las acciones, todo el conjunto de claves + `ns:nombre` + `index.html` + tests a la vez.
2. **Atributo y `dataset` van en pareja:** `data-movimiento-id` ↔ `dataset.movimientoId`. Si se renombra un solo lado nada falla en los tests unitarios pero la interfaz deja de funcionar (lo detectan las pruebas 4 y 6).
3. **Comprobaciones de código fuente por texto** en los tests (cadenas y regex que citan nombres cortos como `!movs.length`, o un regex con `mpp?UsarEncargo`): la herramienta no las ve; hay que buscarlas cuando un test falla.
4. **Campos guardados** (`rte`, `spId`, `_movId`…): se renombran solo con migración, o sin migrar si nadie usa la app (empezar de cero).
5. **Nombres que coinciden con ids del HTML** (claves del DOM falso de los tests) no se renombran por identificador.
6. **Una pasada de texto sobre `docs/`** reescribe también las listas del glosario con los nombres nuevos: revisarlo después.
7. **`reg` y `dd`** significan cosas distintas según el archivo: se renombran por identificador, no por palabra.
8. **Comentarios de bloque:** un reemplazo por líneas no ve que una línea sin `*` sigue dentro de un `/* */`; revisar que no queden constantes dentro de comentarios.
9. **Quitar paréntesis «de más» con una regex** puede comerse el de `if(...)`: correr `node --check` sobre todos los `.js` tras cada pasada.

## 4. Protocolo de verificación por entrega

`npm test` + los tres humos (`smoke`, `smoke:wrapped`, `smoke:cierre`) + `npm run navegador` (Chromium real) + `npm run build` (arma dist/ y comprueba el sello) + `node scripts/generar-mapa.js --check` + prueba de equivalencia (`node scripts/equivalencia.js <backup>` con el código anterior y el nuevo, luego `--comparar … --tol=1`) con un backup del esquema vigente + comprobar que `index.html` conserva sus `data-action` + aplicar el zip sobre una copia limpia y correr la suite ahí. Entregar el zip **acumulativo** (todo lo cambiado desde la última versión que se sabe aplicada) y recordar que un zip **no borra** archivos. Como ninguna prueba mira el aspecto, tras renombrar ids o clases abrir a mano los sheets afectados.

## 5. Lo que se evaluó y no se hizo

- **Clases CSS y ids con prefijos abreviados** (`gv_`, `sp_`, `ctc_`, `prtc_`, `alc-`, `caj-`…; unas 1.700 clases y 177 ids). Se probó un cruce de clases usadas contra definidas en `css/styles.css` y da demasiado ruido para ser una prueba: muchas clases se arman en el JavaScript (`'toast-' + tipo`, `'alc-' + tipo`) y hay CSS inyectado desde `wrapped.js`. Renombrarlas sin una prueba visual es riesgo sin ganancia. **Plan:** hacerlo al rediseñar cada pantalla (un prefijo por entrega, con capturas antes y después); mientras tanto el trinquete de CSS impide que crezcan (1.206 clases con prefijo abreviado al 2026-11-14) y las reglas para clases nuevas están en `guia-estilo-sheets.md` §0 bis.
- **«Cobro» con tres sentidos.** El valor `tipo: 'cobro'` solo existe en `S.spotify.historial`; el cobro de ingresos fijos y el de deudas viven en otros módulos y no se mezclan en ninguna lista.
- **`splits` ≠ `partes`.** `splits` es el reparto entre cuentas (`{ fuente, monto }`, widget `split.js`, siete módulos); `partes` son las partes de una alcancía, un diferencial o un encargo, con otra forma. Unificarlos tocaría unos 60 sitios y confundiría dos formas distintas.
- **`dd`:** variables locales sin relación entre sí.
- **`mesadas.papa` / `mesadas.mama`:** habría que rediseñar el modelo con una clave neutral.
- **Ruta de Firestore `usuarios`:** exige cambiar las reglas en la consola de Firebase.
- **Pasar el código a inglés:** el glosario conserva una columna con el equivalente por si se publica el repo.
- **No se auditó** rendimiento, accesibilidad, seguridad ni experiencia de uso: la mejora fue solo de nombres, estructura y pruebas.
