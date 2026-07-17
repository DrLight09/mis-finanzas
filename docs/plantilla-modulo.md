# Cómo documentar un módulo de mis-finanzas

Guía de estructura a seguir cada vez que se escribe o rehace el `.md` de una sección de `index.html`. El objetivo de estos documentos **no es explicar el código línea por línea** — para eso está el código, y Git guarda cada cambio. El objetivo es poder volver dentro de seis meses, no recordar nada, y en una sola lectura poder responder:

- ¿Qué problema resuelve este módulo?
- ¿Qué reglas nunca se deben romper?
- ¿Qué datos guarda y por qué existe cada campo?
- ¿Cómo fluye la información desde que hago una acción hasta que todo queda actualizado?
- ¿Qué decisiones de diseño tomé y por qué, para no deshacerlas sin querer más adelante?

Los nombres de funciones, ids del DOM y demás detalles de implementación aparecen **solo al final**, como referencia rápida — no como el cuerpo del documento. Cuanto más ligado esté el documento a nombres exactos de variables o de `#ids`, más rápido se desactualiza apenas se refactoriza algo.

---

## Estructura estándar (en este orden)

### 1. Objetivo
Dos o tres líneas. Qué problema real resuelve el módulo, sin entrar en cómo lo resuelve todavía.

### 2. Conceptos importantes
Los términos propios del módulo que hay que tener claros antes de leer el resto (ej. "ciclo" vs. "período" en Spotify, "pendiente" en Mesada, "encargo" vs. "capital" en Encargos). Si el módulo no inventa vocabulario propio, esta sección puede omitirse.

### 3. Reglas que nunca deben romperse
La parte más importante del documento. Lista de invariantes de negocio — cosas que, si se rompen al tocar el código en el futuro, corrompen datos o generan comportamiento incorrecto. Ejemplos de este tipo de regla:
- "Los botones no son la fuente de verdad, los movimientos sí."
- "Nunca se asume una tarjeta de crédito como destino de dinero que entra."
- "Marcar una deuda pendiente es siempre una decisión explícita del usuario, nunca automática."

Si una regla existe *porque* en el pasado se rompió y causó un bug, la regla igual se queda acá (el bug puntual se documenta aparte, ver §8) — lo que importa es dejar constancia de la regla en sí.

### 4. Modelo de datos
Dónde vive la información dentro de `S`, con un bloque de código mostrando la forma real del objeto/array, y una nota corta por cada campo que no sea autoexplicativo — sobre todo los opcionales, o los que solo existen bajo ciertas condiciones. Ejemplo del nivel de detalle esperado:

> `pendiente` — cuánto dinero falta por recibir. No se calcula automáticamente: solo existe si el usuario marcó explícitamente que quedó una deuda.

### 5. Flujo
Los procesos principales del módulo, paso a paso, en diagramas de texto simples (`A → B → C`). No hace falta un flujo por cada función; alcanza con los 2-4 flujos principales (ej. "registrar un pago", "eliminar un registro", "cerrar un ciclo").

### 6. Casos especiales
Comportamientos no obvios en situaciones límite: qué pasa si el usuario no especifica destino, qué pasa si se edita algo a mitad de camino, qué pasa con datos viejos que no tienen un campo nuevo, etc.

### 7. Decisiones de diseño
Por qué se construyó así y no de otra forma, especialmente cuando la alternativa "obvia" fue descartada a propósito. Esta sección es la que más valor tiene con el tiempo — dentro de un año es fácil olvidar *por qué* no se hizo la integración más simple.

### 8. Referencia de implementación
Acá sí van los nombres reales: tabla de funciones con una línea de qué hace cada una, ids de sheets/inputs si hace falta tocar el HTML, y código muerto o sin usar que valga la pena anotar. Es la única sección que se puede desactualizar con un refactor menor — por diseño, para que el resto del documento no dependa de esto.

### (Fuera del documento del módulo) Bugs corregidos
Todo bug ya arreglado, con su causa y su fix, va en el **`CHANGELOG.md` compartido** de todo el proyecto, no en el `.md` del módulo — bajo una sección con el nombre del módulo. Esto mantiene el documento del módulo enfocado en cómo funciona *hoy*, sin ir creciendo indefinidamente con historia que ya no hace falta para entender el sistema actual.

---

## Reglas de estilo

- **Paráfrasis, no transcripción de commits.** "Se corrigió un error donde cambiar de año podía sobrescribir la cuota del año siguiente" — sin pegar el diff ni explicar variable por variable, salvo que el fix en sí sea la única forma clara de explicar la regla que dejó (en ese caso, un bloque de código corto está bien).
- **Una tabla vale más que tres párrafos** cuando se están listando estados, campos o funciones.
- **Si un dato o comportamiento cambia con el refactor, que solo haya que tocar la sección 8.** Si al cambiar un nombre de función hay que revisar todo el documento, es señal de que algo de implementación se coló en una sección que debería ser conceptual.
- **Extensión:** mejor un documento completo en las 7 secciones y corto en cada una, que uno larguísimo en una sola sección y vacío en el resto.

---

## Índice de referencia (documentos ya escritos con esta estructura)

- `mesada.md`
- `spotify.md`
- `CHANGELOG.md` — historial de bugs y limpieza de código, compartido entre todos los módulos

Módulos pendientes de documentar con esta misma plantilla: Cuentas, Gastos, Préstamos ("Me deben" / "Yo debo"), Encargos, Tarjetas de crédito, Plata Comprometida, Alcancía, Análisis financiero, Sistema de Personas.
