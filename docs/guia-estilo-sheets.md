# Guía de estilo y referencia de sheets

Define el orden estándar de campos en todos los sheets (bottom sheets) de `mis-finanzas`, las convenciones de labels, y sirve como inventario del estado actual de cada sheet — para que agregar o modificar uno nuevo siga el mismo patrón que el resto en vez de inventar convenciones sueltas.

Los cambios puntuales de una sesión de limpieza (renombres, tildes, reordenamientos aplicados) no viven acá — ver [`CHANGELOG.md`](./CHANGELOG.md).

> **Auditoría 2026-08-22:** se revisaron los ~45 sheets del `index.html` actual contra esta guía. Se encontraron y corrigieron: 2 huecos de simetría (Nota faltante en `restar-dinero` y `sp-destino`, Fecha faltante en `transferir`) y 9 sheets con Fecha ubicada antes de tiempo (`gasto-var`, `compra-tc`, `nueva-deuda`, `mov-mi-deuda`, `prestamo-tc`, `registrar-movimiento`, `sp-hist-pend`, `mesada-pago`, `mesada-pend`). El HTML ya quedó corregido; **falta actualizar el JS de guardado** en los módulos correspondientes para que lea los campos nuevos (`rdNota`, `spNota`, `tr_fecha`) — ver detalle en el CHANGELOG.

---

## 1. Regla general de orden

Para cualquier sheet que registre un movimiento de plata, el orden es siempre:

```
1. [Contexto específico]   — si aplica: ¿A qué cajita?, Cuenta destino, info de saldo...
2. [Toggle especial]       — si aplica: "Es saldo inicial", checkbox de apertura
3. Descripción             — qué es / de dónde viene / para qué es
4. Monto
5. [Cuenta de origen/destino] — si aplica: ¿De dónde sale?, ¿A dónde entra?, Categoría,
                                 ¿A cuál encargo?, tarjeta usada, etc. — cualquier campo
                                 de contexto adicional que no sea Descripción/Monto/Fecha/Nota
6. Fecha
7. Nota (opcional)         — siempre al final, siempre con el texto "(opcional)"
```

- **Fecha va justo antes de Nota**, después de todos los campos de contexto/cuenta —
  nunca pegada al Monto. Si el sheet tiene secciones expandibles opcionales (ej. "El
  valor real era diferente"), esas van después de Nota; solo los campos que son parte
  del flujo principal van antes.
- **El campo Nota va siempre al final**, nunca en el medio.
- **El campo Descripción va siempre antes que Monto**, nunca después.
- **Todo sheet que registra un movimiento de plata debe tener Fecha.** Si hoy no la
  tiene, es un hueco a corregir, no una excepción válida (ver `sheet-transferir`,
  corregido 2026-08-22).
- **Si un sheet tiene un par simétrico** (agregar/restar del mismo saldo, cobro
  regular/cobro de lo pendiente, etc.), ambos deben tener el mismo set de campos.
  Una asimetría entre pares es un bug de diseño, no una decisión intencional — si
  se necesita una asimetría real, debe quedar anotada explícitamente en el
  inventario (§3) con el motivo.
- Los campos opcionales llevan el texto `(opcional)` en el label, en tamaño pequeño y color `text3`.

---

## 2. Convenciones de labels

**Campos obligatorios:** se marcan con `*` en rojo al final del label: `<span style="color:var(--red);">*</span>`

**Campos opcionales:** se marcan con `(opcional)` en pequeño y color `text3`: `<span style="font-size:10px;color:var(--text3);font-weight:400;">(opcional)</span>`

**Campos informativos (solo lectura):** se muestran como texto estático, no como `input`. Ej: "Saldo actual".

**Labels de pregunta:** llevan signo de apertura español obligatorio: `¿De dónde...?`, `¿Cuánto...?`, `¿A qué...?`

**"Nota (opcional)" vs "Descripción":**
- **Nota (opcional)** — campo de detalle extra al final, siempre libre y corto.
- **Descripción** — campo principal de identificación del movimiento, va antes del monto. Si es opcional se escribe "Descripción (opcional)".
- **Nunca usar** "Descripción / Nota (opcional)" — escoger uno solo.
- El campo principal de identificación **no siempre se llama literalmente "Descripción"** — muchas veces es una pregunta más específica y humana: "¿De dónde viene esta plata?", "¿En qué se gastó o a dónde fue?", "¿Qué compraste?". Todas cuentan como el campo #3 de la regla de orden (antes del Monto); "Descripción" es solo el nombre genérico cuando no aplica una pregunta más natural.
- **Regla práctica para decidir si un sheet necesita Nota además del campo principal:** si el campo principal ya es obligatorio (lleva `*`) y responde "qué es este movimiento", agregar Nota para detalle extra opcional. Si el campo principal YA es opcional y libre (ej. "Descripción (opcional)" en `sheet-mov-cuenta-custom`), no hace falta una Nota separada — sería un campo duplicado.

### Estilo visual de los labels (`class="il"`)

```css
.il {
  font-size: 11.5px;
  color: var(--text2);
  display: block;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-family: 'DM Mono', monospace;
  font-weight: 600;
}
```

Los grupos de campo usan `class="ig"` con `margin-bottom: 13px`.

---

## 3. Inventario de sheets por módulo

### Cuentas personalizadas

**`sheet-nueva-cuenta`** — Nueva cuenta: Nombre → Saldo inicial → Ícono → Color

**`sheet-mov-cuenta-custom`** — Agregar / Retirar dinero *(cualquier cuenta personalizada que no sea Nequi ni Nu)*: Descripción (opcional) → Monto → Fecha

### Nequi y Efectivo

**`sheet-agregar-dinero`** — Agregar dinero *(desde la tarjeta de Nequi o Efectivo)*: Saldo actual (informativo) → [Toggle] Es saldo inicial → ¿De dónde viene esta plata? `*` → ¿Cuánto recibiste? → Fecha → Nota (opcional)

**`sheet-agregar-dinero-menu`** — ¿A dónde entra la plata? *(desde el botón `+` del header sin cuenta seleccionada)*: Cuenta destino → ¿De dónde viene esta plata? `*` → ¿Cuánto recibiste? → Fecha → Nota (opcional)

**`sheet-restar-dinero`** — Restar dinero: Saldo actual (informativo) → ¿En qué se gastó o a dónde fue? `*` → ¿Cuánto vas a restar? → Fecha → Nota (opcional)

**`sheet-editar-apertura`** — Corregir saldo inicial: Nuevo saldo inicial

**`sheet-transferir`** — Transferir entre cuentas: ¿De dónde sale? → ¿A dónde entra? → ¿Cuánto vas a mover? → Fecha → Nota (opcional)

### Nu / Cajitas

**`sheet-nu-movimiento`** — Entró / Salió plata a Nu: ¿A qué cajita? `*` → [Toggle] Es saldo inicial → ¿De dónde viene esta plata? `*` → ¿Cuánto recibiste? → Fecha → Nota (opcional)

**`sheet-crear-cdt`** — Crear CDT en cajita: Monto a invertir (mín. $50.000) → Tasa EA % → Fecha de apertura → Fecha de vencimiento → Retefuente % (por defecto 4%)

**`sheet-cobrar-cdt`** — Cobrar CDT vencido: Valor real depositado por Nu

**`sheet-meta-cajita`** — Meta de ahorro: Monto objetivo → Fecha de inicio → Fecha límite

### Gastos

**`sheet-gasto-var`** — Registrar gasto: Descripción → Monto → Categoría → ¿De dónde salió la plata? `*` → Fecha → Nota (opcional)

**`sheet-gasto-fijo`** — Gasto fijo mensual: Nombre → Monto mensual → Categoría

**`sheet-pagar-gasto-fijo`** — Pagar gasto fijo: Cuenta / Fuente de pago → Fecha de pago → Nota (opcional)

**`sheet-presupuestos`** — Presupuestos mensuales *(campos generados dinámicamente por categoría)*

### Ingresos

**`sheet-ingreso-fijo`** — Ingreso fijo mensual: Nombre → Monto mensual → Aplica desde

### Plata comprometida

**`sheet-cp-nuevo`** — Nuevo ingreso comprometido: ¿Qué plata es? `*` → Monto total que va a llegar `*` → ¿Cuándo llega? `*` → ¿A qué cuenta cae? → ¿A dónde va esta plata? (destinos, dinámico)

**`sheet-cp-destino`** — Agregar destino: Tipo de destino → Descripción `*` → Monto `*` → [Condicionales según tipo]: ¿Quién te devuelve?, ¿De dónde salió?, cajita, TC, etc. → ¿Para cuándo hay que pagarlo? (opcional)

**`sheet-cp-recibir`** — ¡Llegó la plata!: ¿A dónde va este ingreso? (lista de destinos) → Fecha de recibo

### Mesada / Spotify

**`sheet-mesada-pago`** — Mesada recibida: Monto recibido → [Condicional] ¿Pagó desde un encargo? → ¿Cuál encargo? + ¿De cuál cuenta sale esa plata? → ¿Qué hiciste con esa plata? → Fecha en que te pagó → Nota (opcional)

**`sheet-mesada-pend`** — Pago de lo pendiente (Mesada): Monto recibido → [Condicional] ¿Pagó desde un encargo? → ¿Cuál encargo? + ¿De cuál cuenta sale esa plata? → ¿Dónde la metiste? → Fecha en que te pagó → Nota (opcional)

**`sheet-spotify`** — Agregar persona a Spotify: Nombre → Cuota mensual → Fecha de ingreso

**`sheet-editar-spotify`** — Editar persona en Spotify: Nombre → Cuota mensual → Fecha de ingreso

**`sheet-sp-destino`** — Registrar cobro: ¿Cuántos períodos pagó? → ¿Cuánto te dio? → ¿A dónde metiste esa plata? → Fecha en que te pagó → Nota (opcional)

**`sheet-sp-hist-pend`** — Pago de lo pendiente (Spotify): Monto recibido → ¿A dónde metiste esa plata? → Fecha en que te pagó → Nota (opcional)

**`sheet-pagar-spotify`** — Pagar Spotify: Monto a pagar → ¿De dónde sacas la plata? → Fecha en que pagaste → Nota (opcional)

### Encargos

**`sheet-nuevo-encargo`** — Nuevo encargo: ¿De quién es la plata? → Saldo inicial (opcional) → ¿En qué cuenta está ese saldo? → Nota (opcional)

**`sheet-editar-encargo`** — Editar encargo: ¿De quién es la plata? → Nota (opcional)

**`sheet-mov-encargo`** — Registrar movimiento: Descripción → Monto → ¿En qué cuenta está esa plata? → [Expandible] Yo puse la plata → ¿De cuál cuenta tuya sale lo prestado? → Fecha → Nota (opcional) → [Expandible] El valor real era diferente → ¿Cuánto era en realidad? + ¿A cuál de tus cuentas entra ese sobrante?

> Nota: los dos expandibles quedan en posiciones distintas (uno antes de Fecha, el otro después de Nota) porque así está en el código actual — no es el ideal, pero tocarlo implica reordenar lógica condicional en `encargos.js`, fuera del alcance de esta limpieza de sheets estáticos.

**`sheet-traspaso-encargo`** — Me lo regalaron: Descripción (opcional) → ¿Cuánto te regalaron? → ¿De qué cuenta del encargo salió? → ¿A cuál de tus cuentas entra? → Fecha

**`sheet-transferencia-encargo`** — Pagarle a otro encargo desde este: ¿A cuál encargo le pagaste? → Descripción (opcional) → ¿Cuánto le pagaste? → ¿De qué cuenta del encargo salió? → ¿En qué cuenta quedó, para el otro encargo? → Fecha

**`sheet-compra-tc-encargo`** — Pagué con mi TC: ¿Qué compraste? → Monto del encargo → ¿De qué cuenta salía esa plata del encargo? → ¿Con cuál tarjeta de crédito pagaste? → ¿A dónde va el dinero del encargo? (para pagar la TC) → [Expandible] El valor real era diferente → Valor real cobrado por la TC + ¿A cuál de tus cuentas entra el diferencial? → Fecha → Nota (opcional)

**`sheet-parte-encargo`** — Agregar parte: ¿Para qué es? `*` → Monto `*` → ¿Cuándo la vas a usar? (opcional)

**`sheet-usar-parte`** — Ya la usé: ¿De dónde sacaste la plata? → [Expandible] El valor real era diferente → ¿Cuánto era en realidad? + ¿En qué cuenta te cayó ese margen?

**`sheet-mover-enc-cuentas`** — Mover entre cuentas (encargo): ¿De qué cuenta sale? → ¿A qué cuenta va? → ¿Cuánto vas a mover? → Fecha

### Personas / Deudores

**`sheet-nueva-persona`** — Nueva persona: Nombre → Color del avatar

**`sheet-editar-deudor`** — Editar persona: Nombre → Color del avatar

### Préstamos (yo le debo a alguien)

**`sheet-nueva-deuda`** — Nueva deuda: ¿A quién le debes? → ¿Cuánto te prestó? → ¿A qué cuenta entró la plata? → Fecha → Nota (opcional)

**`sheet-mov-mi-deuda`** — Me prestó más / Le pagué: Monto → ¿A qué cuenta entró la plata? (condicional, solo en "me prestó más") → Fecha → Nota (opcional)

### Préstamos (yo le presté a alguien)

**`sheet-registrar-movimiento`** — Nuevo préstamo / Abono / Pago completo *(sheet polivalente con campos condicionales según el tipo de movimiento)*: Monto → ¿A cuál préstamo? (condicional, ≥2 grupos abiertos) → Nombre del préstamo nuevo (opcional, condicional) → ¿De dónde sacó la plata? (condicional) → ¿A dónde entra el pago? (condicional en abonos) → ¿De qué encargo? (condicional) → ¿De qué cuenta del encargo sale? (condicional) → ¿Cuánto de extra? + distribución (condicional en abonos con extra) → Fecha → Nota (opcional)

**`sheet-prestamo-tc`** — Préstamo con TC: Descripción → Monto → Tarjeta de crédito usada → Fecha → Nota (opcional) → [Expandible] El valor real era diferente → ¿Cuánto era en realidad?

### Tarjetas de crédito

**`sheet-nueva-tc`** — Nueva tarjeta de crédito *(formulario de creación, no sigue la regla de orden de movimientos)*: Nombre de la tarjeta → Banco → Franquicia → Cupo total → Cajita para pagarla (opcional) → Deuda actual (si ya debes algo antes de empezar a usar la app) → Estado → Color (opcional)

**`sheet-compra-tc`** — Registrar compra en TC: Descripción → Monto → Categoría → Fecha → Nota (opcional)

**`sheet-pagar-tc`** — Pagar tarjeta: [Opciones rápidas: mínimo / total / personalizado] → Abona a tu deuda (campo libre) → ¿Con qué cuenta pagas? `*` → Fecha de pago → Nota (opcional)

### Alcancía

> Alcancía física oculta de ahorro. Mientras está activa, el saldo se muestra ofuscado (`$??`) en la UI y los movimientos internos no aparecen en el feed general — pero ese dinero **sí es parte del patrimonio real** y afecta Salud financiera y Proyección. Al "destapar" se revela el saldo real, se compara contra lo registrado, y la diferencia se ajusta automáticamente.

**`sheet-alcancia-depositar`** — Guardar en la alcancía: ¿De dónde viene este dinero? (selector: lo tenía yo / lo saqué de una cuenta / regalo de mamá / mandado de mamá / entre los dos) → [Condicional, solo si "lo saqué de una cuenta"] ¿De qué cuenta sale? → [Condicional, solo si "entre los dos"] ¿Cuánto puso cada uno? (vos / tu mamá) + ¿De qué cuenta sale tu parte? (opcional) → Monto total → Fecha → Nota (opcional)

> Los campos condicionales son sub-opciones del selector inicial (aparecen pegados a él, no se separan con Monto/Fecha en el medio), por eso no rompen la regla general de orden.

**`sheet-alcancia-destapar`** — Destapar alcancía: Resumen (informativo: saldo registrado hasta ahora, no editable) → ¿Cuánto dinero encontraste realmente? → ¿Dónde vas a guardar este dinero?

> No tiene Fecha (se usa la fecha de hoy automáticamente) ni Descripción/Nota: los textos de los movimientos resultantes se generan solos ("Alcancía destapada — saldo registrado", "Dinero extra encontrado en alcancía", "Ajuste alcancía — faltante").

**`sheet-alcancia-resultado`** — Resultado *(sheet de confirmación, sin campos editables)*: muestra registrado vs. real, la diferencia, y la comparación con la alcancía anterior. Acciones: "Iniciar nueva alcancía" / "Cerrar".

#### Reglas de negocio de Alcancía — qué hace cada tipo de depósito

> Nota: esto excede lo puramente visual y es candidato a mudarse a un futuro `alcancia.md` propio siguiendo la plantilla del proyecto — se deja acá por ahora porque documenta directamente el comportamiento de estos sheets.

Cada tipo de depósito tiene un efecto **distinto e intencional** sobre cuentas, ingresos y patrimonio:

| Tipo | `_alcTipo` | ¿Descuenta cuenta? | ¿Genera ingreso del mes? | Mecanismo |
|---|---|---|---|---|
| Lo tenía yo (efectivo) | `yo-directo` | No | **Sí** | `S.movimientos` tipo `'entrada'` con `_esAlcanciaIngreso: true`. Entra y sale de `efectivo` en el mismo acto (neto = 0), pero el ingreso queda en estadísticas del mes. |
| Lo saqué de una cuenta | `yo-cuenta` | **Sí** | No | `S.gastosVar` con `_esAlcancia: true` + `sumarFuente(fuente, -monto)`. Traslado, no gasto real ni ingreso nuevo. |
| Me lo regaló mamá | `regalo` | No | **Sí** | Igual que `yo-directo`. Es plata nueva que entró a tu vida. |
| Mamá me dio por mandado | `mandado` | No | **Sí** | Igual que `regalo`. Pago por un servicio — ingreso real aunque no sea un regalo. |
| Entre los dos — tu parte con cuenta | `split` + `splitFuente` | **Sí (tu parte)** | No (tu parte) | `S.gastosVar` con `_esAlcancia: true` + `sumarFuente(splitFuente, -splitYo)`. Traslado. |
| Entre los dos — tu parte sin cuenta (efectivo) | `split` sin `splitFuente` | No | **Sí (tu parte)** | Igual que `yo-directo`. |
| Entre los dos — parte de mamá | `split` (campo `_splitMama`) | No | **Sí (parte mamá)** | La contribución de mamá siempre es ingreso nuevo para vos. |

**Regla mnemotécnica:** si la plata ya estaba en una cuenta tuya → traslado (no ingreso). Si viene de afuera (efectivo sin cuenta, regalo, mandado, parte de mamá) → ingreso nuevo del mes.

#### Patrimonio y visibilidad

- `calcPatrimonioTotal()` **sí suma** `S.alcancia.saldoRegistrado` — la plata en la alcancía es tuya y debe aparecer en Salud financiera, Proyección y el historial diario.
- El **hero de Inicio** (`#heroTotal`) muestra el patrimonio **sin** la alcancía — la sorpresa se mantiene en la pantalla principal. Mientras `saldoRegistrado > 0`, el hero dice "Patrimonio visible" (en vez de "Patrimonio total") con un pill ámbar: `🔒 +$?? en alcancía oculta — se revela al destapar`. Al destapar y volver `saldoRegistrado` a `0`, vuelve a decir "Patrimonio total" y el pill desaparece.
- Al destapar, `saldoRegistrado` se resetea a `0` **antes** de que el dinero entre a la cuenta destino, para no contarlo dos veces.

| Módulo | Ve la alcancía | Detalle |
|---|---|---|
| Hero Inicio (`#heroTotal`) | ❌ No | Muestra patrimonio visible; pill indica que hay algo oculto |
| `calcPatrimonioTotal()` | ✅ Sí | Suma `saldoRegistrado` |
| Historial de patrimonio (`snapshotPatrimonio`) | ✅ Sí | Usa `calcPatrimonioTotal()` directamente |
| Salud financiera | ✅ Sí (patrimonio) | Usa `calcPatrimonioTotal()` |
| Ingresos del mes (`ingresosMes`) | ✅ Sí (ingresos reales) | Los `_esAlcanciaIngreso` son tipo `'entrada'` y sí cuentan |
| Gastos del mes (`gastosMes`) | ❌ No | `_esAlcancia: true` los excluye |
| Feed de actividad | ❌ No (internos) / ✅ Sí (ingresos) | Traslados `_esAlcancia` ocultos; ingresos `_esAlcanciaIngreso` sí aparecen |
| Proyección financiera | ✅ Sí (patrimonio) | Usa `calcPatrimonioTotal()` |
| Plata comprometida | ❌ No | `_esAlcancia` excluido |

#### Lógica de movimientos al destapar

Al destapar se generan hasta 3 movimientos automáticos, y **no son intercambiables entre sí**: cada uno representa un flujo distinto y debe conservar su propio `tipo`, o el análisis financiero y el historial de cuentas vuelven a clasificarlos mal.

| Movimiento | Qué representa | `tipo` correcto | Por qué |
|---|---|---|---|
| "Alcancía destapada — saldo registrado" | Plata que **ya estaba contada** (ingreso al guardarla, o gasto al sacarla de una cuenta) y solo cambia de lugar | `transferencia` | Neutral: ni ingreso nuevo ni gasto. Si contara como `entrada`, el ingreso del mes quedaría inflado (doble conteo). |
| "Dinero extra encontrado en alcancía" (diferencia positiva) | Plata real **nunca registrada** en ningún lado | `entrada` | Ingreso nuevo de verdad: debe sumar a "Ingresos estimados" del mes. |
| "Ajuste alcancía — faltante" (diferencia negativa) | Plata esperada que no apareció | gasto en `S.gastosVar` con `_esAlcanciaAjuste: true` (no vive en `S.movimientos`) | Excluido de gastos normales. Llama `_sumarASaldo(destino, -absDif)` para que el saldo físico también quede correcto. |

**Reglas que no se deben romper en el código:**

- En `S.movimientos`, el campo `tipo` solo puede ser `'entrada'` o `'salida'` para contar como ingreso/gasto real. `'apertura'` y `'transferencia'` son los únicos tipos "neutros" reconocidos. **Cualquier otro valor (incluido `'ingreso'`) cae por descarte en la rama de "salida"** dentro de `getMovimientosCuenta()` y se muestra con signo negativo aunque el dinero esté entrando.
- `cuentasPersonalizadas` (`c.movimientos`) usa una convención **distinta y no intercambiable**: `'ingreso'` / `'egreso'`. Si el destino de la alcancía es una cuenta personalizada, `_sumarASaldo()` usa `'ingreso'` para montos positivos y `'egreso'` para montos negativos, con `Math.abs(monto)`.
- `_esAlcancia: true` oculta movimientos del feed general (`_normMovimientos`) — **no decide** si cuentan como ingreso; eso lo decide únicamente `tipo`.
- `_esAlcanciaIngreso: true` identifica los ingresos reales generados al momento del depósito (regalo, mandado, yo-directo, parte de mamá en split). Son tipo `'entrada'` y **sí aparecen** en el feed porque son ingresos reales visibles.
- Al destapar, `S.alcancia.saldoRegistrado` se resetea a `0` — necesario porque `calcPatrimonioTotal()` suma ese campo mientras está activa; si no se reseteara, el dinero quedaría contado dos veces.
- El historial (`entradaHist`) **incluye** `movimientos: [...a.movimientos]` para que las tarjetas de historial muestren el desglose por tipo. Sin esto, `totalMamá` siempre devuelve 0 en alcancías anteriores.
