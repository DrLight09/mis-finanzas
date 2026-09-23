# Protección por antigüedad de movimientos (todos los módulos)

Mecanismo transversal implementado en todos los módulos que mueven dinero. Nació de una pregunta puntual sobre Spotify, pero el riesgo que resuelve es general a toda la app: `nivelAntiguedadMovimiento(fecha, opsPosteriores, modulo)` (en `js/core/core-state.js`) es el único punto que decide el nivel, y cada módulo lo llama con su propia clave (`'spotify'`, `'mesada'`, `'prestamos'`, `'encargos'`, `'tarjetas'`, `'gastos'`, `'alcancia'`, `'plata_comprometida'`) y su propio conteo de "operaciones posteriores".

---

## 1. El problema

Cuando se elimina un movimiento (un pago de Spotify, un abono de encargo, una cuota de préstamo, un pago de tarjeta...), el sistema revierte ese monto sobre el **saldo actual** de la cuenta afectada — no recalcula el historial completo desde cero. Si el movimiento tiene mucho tiempo, esa plata ya se mezcló lógicamente con todo lo que pasó en esa cuenta después. Revertirla hoy no "deshace el error" — introduce un descuadre nuevo, y entre más vieja la operación, más imposible es en la práctica saber cuánto ajustar a mano para volver a cuadrar. Esto aplica igual en cualquier módulo, no solo Spotify.

## 2. Niveles de protección

1. **Reciente** — se edita o se borra exactamente como hoy, sin ningún cambio.
2. **Viejo** — se puede borrar, pero antes se muestra un aviso explícito: qué cuenta se afecta y de cuánto sube o baja su saldo si se confirma. El usuario decide con esa información, no a ciegas.
3. **Muy viejo / bloqueado** — no se puede eliminar bajo ninguna circunstancia. Solo se permiten ediciones que no muevan plata (nota, fecha del registro); el monto y la eliminación quedan cerrados. Si hay un error real que corregir ahí, se corrige el dato histórico visible, nunca el saldo de hoy.

Pasar de un nivel a otro se decide por **cualquiera** de dos criterios (basta con que se cumpla uno):
- **Tiempo transcurrido** desde la fecha del movimiento.
- **Cantidad de operaciones posteriores** que ya tocaron esa misma cuenta o ese mismo ciclo — mide qué tan "mezclada" está esa plata con movimientos más recientes, algo que el tiempo solo no siempre refleja bien.

## 3. Valores confirmados para Spotify

- **Nivel Viejo (aviso):** el pago tiene más de **90 días**, o ya hay **2 o más** pagos reales registrados después de él.
- **Nivel Bloqueado:** el pago tiene más de **1 año**, o ya hay **5 o más** pagos reales registrados después de él.
- Aplica solo a los registros tipo `pago` (el pago real a Spotify) — un `cobro` individual siempre se puede seguir borrando igual que hoy, porque su alcance ya es pequeño y contenido (solo revierte el `proximoPago` de un integrante).

## 4. Extensión a los demás módulos

La idea aplica igual a Préstamos, Encargos, Mesada y Tarjetas de Crédito, pero con un matiz: en Spotify existe un evento recurrente natural para contar ("cuántos pagos reales después"); en módulos sin ciclo (Encargos, Préstamos, Tarjetas) no hay ese mismo ancla. Ahí el criterio de "cantidad de operaciones posteriores" se traduce como: **cuántos movimientos más ha tenido esa misma cuenta destino desde esa fecha** — mismo concepto (qué tan mezclada está esa plata con lo de después), adaptado a cada módulo.

**Excepción — Encargos (2026-09-01):** en Encargos, "esa misma cuenta destino" no es la unidad correcta. Un encargo es su propia bolsa de plata (`enc.movimientos`) que puede tener movimientos ligados a una cuenta externa (`mov.cuenta`) o sin ninguna asignada; filtrar operaciones posteriores por `cuenta` coincidente subestimaba la mezcla real en un encargo con movimientos repartidos entre varias cuentas — cada movimiento veía muy pocas "operaciones posteriores en su misma cuenta" aunque el encargo en conjunto tuviera muchas más encima. Ahí el criterio cuenta contra **el encargo completo**: cualquier movimiento posterior del mismo encargo, sin filtrar por `cuenta`.

El umbral por **tiempo** (90 días / 1 año) sí se puede reutilizar igual en todos los módulos sin ajustarlo.

Definir el número exacto de "operaciones posteriores" para cada módulo (Encargos, Préstamos, Tarjetas) puede quedar pendiente hasta el momento de implementar cada uno — no hace falta resolverlo todo ya.

## 5. Estado de cobertura por módulo (2026-09-01)

Todos los módulos de la app fueron revisados. Estado final:

| Módulo | Protegido | Ancla usada para "operaciones posteriores" |
|---|---|---|
| Spotify | ✅ | Pagos reales posteriores (evento natural del ciclo) |
| Tarjetas de crédito | ✅ | Compras+pagos posteriores de la misma tarjeta (`tc.deuda` como cuenta propia) |
| Mesada | ✅ | Cuenta(s) destino reales afectadas — gateado por `_mesadaTieneCuentaAfectada` |
| Préstamos ("Me deben" y "Yo debo") | ✅ | Cuenta(s) reales afectadas (incluye Alcancía/TC/Encargo vía el préstamo) — gateado por `_deudorTieneCuentaAfectada`/`_miDeudaTieneCuentaAfectada` |
| Encargos | ✅ | El encargo completo (`enc.movimientos`, sin filtrar por cuenta — ver §4) |
| Cuentas (transferencias, salidas manuales, ajustes) | ✅ | Cuenta(s) reales afectadas, vía `movimientos.js` |
| Gastos (variables, incl. divididos) | ✅ (nuevo 2026-09-01) | Cuenta(s) reales afectadas. Antes solo estaba protegido desde la pantalla de movimientos de una cuenta (`movimientos.js`); el botón propio de la pantalla de Gastos (`deleteGastoVar`) no tenía protección — ahora sí, con la misma lógica. Los gastos **divididos** (`splits`) tampoco estaban protegidos en ningún lado — ahora lo están en ambos puntos de entrada |
| Alcancía | ✅ (nuevo 2026-09-01) | La alcancía completa (`a.movimientos`, mismo criterio que Encargos) — antes no tenía ninguna protección |
| Plata Comprometida | ✅ (nuevo 2026-09-01) | Cuenta(s)/TC reales afectadas (máximo entre todas, como en transferencias) — antes no tenía ninguna protección |

**Cierre del pendiente de config (2026-09-01, con `core-state.js` ya disponible):** se agregaron las entradas `alcancia` y `plata_comprometida` a `S.config.proteccionAntiguedad` (mismo formato `{opsAviso:2,opsBloqueo:5}` que las demás), en los dos lugares donde vive esa config: el objeto `S` inicial y el backfill de `load()`. Sobre `load()` en particular: la línea original solo creaba `proteccionAntiguedad` completo si faltaba por completo — eso significa que agregar un módulo nuevo ahí **nunca habría llegado a una cuenta con datos ya guardados** (como la real de producción, que ya tenía las 7 claves originales). Se cambió a un backfill por clave: agrega cualquier módulo que falte sin pisar los que el usuario ya tenga (incluidos ajustes manuales a los umbrales existentes). De paso se confirmó que `nivelAntiguedadMovimiento()` ya era defensiva ante una clave de módulo desconocida (`cfg[modulo]||{}`, sin `opsAviso`/`opsBloqueo` simplemente no dispara ese criterio) — así que el `try/catch` que se había puesto en `alcancia.js`/`plata_comprometida.js` como cautela se quitó, ya no hacía falta.

**Limitación conocida en Plata Comprometida:** los "adelantos"/"marcas de TC" (`d.yaSaque`/`d.yaPague`) no tienen su propia fecha — se usa `item.fechaLlegada` como aproximación cuando el ingreso aún no fue recibido. Si en el futuro se guarda una fecha propia por destino, hay que actualizar esto para usarla en vez de esta aproximación.

## 6. Umbrales centralizados

Los umbrales viven en un solo lugar de configuración en vez de repetir números sueltos en cada módulo:

```js
S.config.proteccionAntiguedad = {
  diasAviso: 90,
  diasBloqueo: 365,
  spotify: { opsAviso: 2, opsBloqueo: 5 }
  // cada módulo de §5 tiene su propia entrada con el mismo formato {opsAviso, opsBloqueo}
}
```

Ajustar un umbral (ej. bajar de 1 año a 6 meses) es un solo cambio, no uno por módulo. `load()` hace un backfill por clave (ver §5) para que agregar un módulo nuevo no dependa de que la cuenta no tenga datos guardados todavía.

## 7. Qué NO cambia

- No se bloquea ni se advierte nada sobre movimientos que no muevan dinero (editar nombre, categoría, nota).
- No aplica a los `cobro` de Spotify, ya que su alcance es individual y pequeño.
- No reemplaza la protección ya existente de movimientos secundarios (el gasto/ingreso generado automáticamente sigue sin poder borrarse desde otra pantalla, solo desde el módulo dueño) — esta es una capa adicional sobre esa misma protección, no un reemplazo.
