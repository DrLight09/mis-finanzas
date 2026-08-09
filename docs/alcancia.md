# Alcancía

## 1. Objetivo

Un "cerdito oculto" digital: permite guardar dinero apartándolo de la vista normal de las cuentas, sin poder ver cuánto llevas acumulado hasta el momento en que decides "destaparla". El punto del módulo no es solo registrar ahorro — es preservar la sorpresa del monto final, algo que ningún tracker de ahorro convencional hace (todos muestran el total corriendo todo el tiempo).

## 2. Conceptos importantes

- **Alcancía activa** — hay un ciclo de ahorro en curso: existe `S.alcancia`, no está marcada `_destapada`, y tiene fecha de inicio, depósitos o saldo. Mientras está activa, el total acumulado nunca se muestra en ningún lado de la app.
- **Destapar** — la acción de cerrar el ciclo: el usuario cuenta el dinero real que tiene guardado, lo compara contra lo que la app registró, y lo mueve a una cuenta real. Es el único momento en que el total se revela.
- **Saldo registrado vs. saldo real** — lo que la app *cree* que hay (`saldoRegistrado`, la suma de todos los depósitos) vs. lo que el usuario *cuenta físicamente* al destapar (`saldoReal`, un input manual). No tienen por qué coincidir — de ahí la sección 6.
- **Diferencia** — `saldoReal - saldoRegistrado`. Positiva = plata no registrada que apareció; negativa = falta plata respecto a lo que debería haber. Ambas se ajustan contra el patrimonio al destapar.
- **Tipo de depósito** — de dónde sale el dinero que se deposita. Determina si es un movimiento real (resta saldo de una cuenta), un ingreso nuevo (dinero que no estaba en ninguna cuenta antes) o, desde 2026-08-09, el cobro de una deuda ajena que nunca pasó por ninguna cuenta real. Ver tabla completa en §4.
- **Cobro de deuda** (`cobro-deuda`, agregado 2026-08-09) — cuando alguien te paga un préstamo (Prestado · Me deben) y esa plata se guarda directo en la alcancía, sin tocar ninguna cuenta real primero. Registra el abono en el deudor (descuenta su deuda) **y** el depósito en la alcancía en un solo paso, con un enlace bidireccional entre ambos registros para poder borrar desde cualquiera de los dos lados. No es un "tipo" más de la tabla de ingresos — no cuenta como ingreso nuevo (ver Decisiones de diseño, §7).
- **Ingreso neto-cero** — el truco usado para los tipos de depósito que no salen de ninguna cuenta (ver Decisiones de diseño, §7): se registra el ingreso (para que cuente en estadísticas del mes) y se resta de inmediato el mismo monto, así el dinero nunca queda "disponible" en la cuenta real.
- **Alcancía "fantasma"** — una alcancía que ya fue destapada (`_destapada: true`) pero el usuario aún no eligió "Iniciar nueva". Se trata como "no activa" en pantalla para no confundir, aunque el objeto `S.alcancia` técnicamente sigue existiendo con datos del ciclo anterior.

## 3. Reglas que nunca deben romperse

- **El total acumulado (`saldoRegistrado`) nunca se muestra mientras la alcancía está activa — en ningún lado.** Ni en Cuentas, ni dentro de la propia pantalla de Alcancía. `heroSaldo` no es un blur de CSS sobre el número real: mientras está activa, ese elemento contiene literalmente el string `"$??"`. Cualquier función nueva que toque esta pantalla debe preservar esto — incluida la lista de depósitos individuales (§7, muestran montos ocultos por defecto, uno a la vez).
- **Todo movimiento que Alcancía empuja a `S.movimientos`/`S.gastosVar` debe llevar `_secundario: true, _origenSeccion: 'Alcancía'`.** El borrado real de un depósito o del destape solo puede pasar desde dentro de Alcancía (`alcanciaEliminarDeposito`), nunca desde el feed genérico de Cuentas — `eliminarMovimiento()` no sabe revertir el estado propio de `S.alcancia` (`saldoRegistrado`, `depositos`, `movimientos[]`, el saldo ofuscado). Ver CHANGELOG.md § Alcancía, 2026-08-06, para el bug real que causó esto al no cumplirse.
- **Un depósito `cobro-deuda` puede borrarse desde dos lados** (la lista de depósitos de Alcancía, o el historial del deudor en Prestado) — cada lado guarda el id del otro (`_prestamoMovId`/`_prestamoDeudorId` en la entrada de Alcancía; `_alcanciaMovId` en el abono del deudor) y debe revertir ambos, nunca solo el propio. `eliminarMovDeudor()` usa `window._alcanciaQuitarPorCobroDeuda()` (sin diálogo propio ni tocar al deudor) y `alcanciaEliminarDeposito()` borra directo del deudor (sin diálogo propio ni tocar la alcancía) — ninguno de los dos vuelve a llamar al otro, para no duplicar la confirmación ni entrar en recursión.
- **El truco de ingreso neto-cero es obligatorio para los tipos que no vienen de una cuenta** (`yo-directo`, `regalo`, `mandado`, la parte de mamá en un `split`). Si algún día se simplifica a "no crear ningún movimiento", esos depósitos dejan de contar en las estadísticas de ingreso del mes. Si se simplifica a "solo sumar sin restar", el dinero queda incorrectamente disponible en Efectivo.
- **El reinicio del ciclo (`saldoRegistrado=0`, `depositos=0`, `movimientos=[]`) nunca es automático al destapar.** Solo ocurre cuando el usuario elige explícitamente "Iniciar nueva alcancía" desde la pantalla de resultado. Mientras tanto, la alcancía queda marcada `_destapada: true` pero con todos sus datos intactos.
- **Antes de `save()` en el destape, hay que sincronizar los inputs del DOM** (`nequiSaldo`, `efectivoSaldo`, el input de saldo de la cajita destino) con los valores ya actualizados en `S`. `save()` relee esos valores del DOM, no de `S` directamente — si no se sincronizan primero, `save()` sobreescribe con el valor viejo y `snapshotPatrimonio()` registra un patrimonio incorrecto.
- **En un depósito `split`, la suma de las partes debe cuadrar exactamente con el monto total** (comparación en centavos, no en punto flotante directo) antes de aceptar el depósito.

## 4. Modelo de datos

### `S.alcancia`

```js
{
  saldoRegistrado: 145000,       // suma de todos los depósitos del ciclo activo
  depositos: 7,                  // cantidad de depósitos registrados
  fechaInicio: "2026-06-01",     // fecha en que se creó/reinició la alcancía
  movimientos: [ /* ver abajo */ ],
  historial: [ /* ciclos ya destapados, ver abajo */ ],
  _destapada: true               // solo existe una vez destapada; se borra al iniciar una nueva
}
```

### Entrada de `S.alcancia.movimientos[]` (un depósito)

```js
{
  id: "abc123",                  // mismo id que el movimiento espejo en S.movimientos/gastosVar
  monto: 20000,
  fecha: "2026-06-15",
  tipo: "yo-cuenta",              // yo-directo | yo-cuenta | regalo | mandado | split
  tipoLabel: "Propio (de cuenta)",
  desc: "Ahorro semanal",
  fuenteOrigen: "cajita:xyz",     // solo si el dinero salió de una cuenta real; si no, null
  ts: 1750000000000,
  // Solo presentes si tipo === 'split':
  _splitYo: 12000,
  _splitMama: 8000,
  _splitFuente: "nequi",          // solo si la parte propia vino de una cuenta
  _splitMamaMovId: "abc123_m"     // id del movimiento espejo de la parte de mamá en S.movimientos
}
```

> `_splitMamaMovId` — depósitos `split` guardados antes del 2026-08-06 no tienen este campo (no existía). Ver §6.

### Entrada de `S.alcancia.historial[]` (un ciclo ya destapado)

```js
{
  fechaInicio: "2026-06-01",
  fechaFin: "2026-07-20",
  diasDuracion: 49,
  depositos: 7,
  saldoRegistrado: 145000,
  saldoReal: 150000,
  diferencia: 5000,
  movimientos: [ /* copia completa de los movimientos de ese ciclo, para el desglose de origen */ ]
}
```

### Otros campos en `S` que usa el módulo

- `S.alcanciaSaldoOfuscado` — el `saldoRegistrado` actual, codificado con XOR+Base64 (`_ALC_KEY = 0x4D`). Ver Decisiones de diseño (§7) sobre por qué existe si igual `saldoRegistrado` está en texto plano al lado.
- `S.alcanciaMigrada` — bandera de una migración de datos anterior a este documento; no la toca ninguna función actual del módulo.

### Movimientos espejo que genera Alcancía (fuera de `S.alcancia`)

| Situación | Dónde se guarda | Efecto en saldo real |
|---|---|---|
| Depósito `yo-cuenta` | `S.gastosVar`, `_esAlcancia: true` | Resta de la cuenta elegida |
| Depósito `yo-directo` / `regalo` / `mandado` | `S.movimientos`, `_esAlcanciaIngreso: true` | Ninguno (ingreso neto-cero) |
| Depósito `split`, parte propia con cuenta | `S.gastosVar`, `_esAlcancia: true` | Resta de la cuenta elegida |
| Depósito `split`, parte propia sin cuenta | `S.movimientos`, `_esAlcanciaIngreso: true` | Ninguno (ingreso neto-cero) |
| Depósito `split`, parte de mamá | `S.movimientos`, `_esAlcanciaIngreso: true` | Ninguno (ingreso neto-cero) |
| Destape — saldo registrado | `S.movimientos`, tipo `transferencia`, `_esAlcancia: true` | Suma a la cuenta destino |
| Destape — diferencia positiva | `S.movimientos`, tipo `entrada`, `_esAlcancia: true` | Suma a la cuenta destino |
| Destape — diferencia negativa | `S.gastosVar`, `_esAlcanciaAjuste: true` | Resta de la cuenta destino |
| Depósito `cobro-deuda` | `d.movimientos[]` del deudor (Prestado), no en `S.movimientos`/`gastosVar` | Ninguno en cuentas reales — reduce la deuda de la persona |

Todos estos, desde el 2026-08-06, llevan `_secundario: true, _origenSeccion: 'Alcancía'` (ver §3 y CHANGELOG.md) — excepto `cobro-deuda`, que no genera entrada en `S.movimientos`/`S.gastosVar` en absoluto (ver §7).

### Entrada de `S.alcancia.movimientos[]` para `cobro-deuda`

Además de los campos comunes (`id`, `monto`, `fecha`, `tipo`, `tipoLabel`, `desc`, `ts`), lleva:

```js
{
  fuenteOrigen: null,             // nunca sale de una cuenta real
  _prestamoDeudorId: "d_xxx",     // id en S.deudores
  _prestamoMovId: "m_xxx"         // id del abono creado en d.movimientos[]
}
```

El abono espejo en `d.movimientos[]` (Prestado) lleva `destino: ''`, `_viaAlcancia: true` y `_alcanciaMovId` apuntando de vuelta a esta entrada — mismo patrón de "toda entrada secundaria necesita su id de vuelta" que ya usa Prestado internamente (ver prestado.md §4.2).

## 5. Flujo

**Depositar:**
```
Elegir tipo → validar monto y, si aplica, saldo disponible en la cuenta de origen
  → crear movimiento espejo según el tipo (tabla de §4)
  → sumar a S.alcancia.saldoRegistrado y depositos
  → guardar la entrada en S.alcancia.movimientos[]
  → actualizar saldo ofuscado → save() → re-render (total sigue oculto)
```

**Depositar — `cobro-deuda`:**
```
Elegir "Me pagaron una deuda" → elegir la persona (solo aparecen deudores con saldo > 0)
  → si tiene ≥2 préstamos abiertos, elegir a cuál (igual que el selector de grupo en Prestado)
  → el monto se precarga con el saldo pendiente, editable (permite abono parcial)
  → validar monto ≤ saldo pendiente de la persona (o del grupo elegido)
  → registrar 'abono' en d.movimientos[] del deudor (destino: '', _viaAlcancia: true, _alcanciaMovId)
  → _autoCerrarGruposEnCero(d)
  → sumar a S.alcancia.saldoRegistrado y depositos, guardar entrada con _prestamoDeudorId/_prestamoMovId
  → actualizar saldo ofuscado → save() → re-render (total sigue oculto)
```

**Eliminar un depósito** (`alcanciaEliminarDeposito`):
```
Confirmar (dialogo, mostrando el monto de esa entrada puntual)
  → según tipo: devolver saldo a la cuenta de origen (yo-cuenta / split con cuenta)
                o solo quitar el registro (yo-directo / regalo / mandado / split sin cuenta)
  → si es split con parte de mamá, quitar también ese movimiento espejo vía _splitMamaMovId
  → quitar la entrada de S.alcancia.movimientos[]
  → restar de saldoRegistrado y depositos → actualizar saldo ofuscado → save() → re-render
```

**Destapar:**
```
Usuario cuenta el dinero real → ingresa saldoReal + cuenta destino
  → calcular diferencia = saldoReal - saldoRegistrado
  → si saldoRegistrado > 0: mover ese monto a la cuenta destino (movimiento "transferencia")
  → si diferencia > 0: registrar como ingreso extra en la cuenta destino
  → si diferencia < 0: registrar como gasto de ajuste en la cuenta destino
  → guardar copia completa del ciclo en S.alcancia.historial[]
  → sincronizar inputs del DOM (nequi/efectivo/cajita) ANTES de save()
  → marcar _destapada: true (el reset real espera a que el usuario elija "Iniciar nueva")
  → mostrar pantalla de resultado (acá sí se revela el total, es la sorpresa)
```

**Iniciar nueva alcancía:**
```
Resetear saldoRegistrado, depositos, movimientos[] y fechaInicio
  → quitar _destapada → guardar saldo ofuscado en 0 → save() → re-render
```

## 6. Casos especiales

- **Alcancía "fantasma"** — `_destapada: true` sin reiniciar se trata como "no activa" en la pantalla principal (`renderAlcancia`), para no mostrar un hero vacío o con datos de un ciclo que ya terminó.
- **Diferencia menor a $1** al destapar se considera "exacta" (por redondeo de punto flotante), no se genera ningún movimiento de ajuste.
- **Splits guardados antes del 2026-08-06** no tienen `_splitMamaMovId` — si el usuario intenta eliminar uno de esos depósitos hoy, la parte propia se revierte bien, pero la parte de mamá (el ingreso neto-cero en `S.movimientos`) queda huérfana, sin poder localizarse automáticamente. Requiere corrección manual si llega a pasar.
- **El movimiento de destape ("saldo registrado", tipo `transferencia`) no tiene todavía una función de reversión propia.** Queda bloqueado por `_secundario` pero, a diferencia de un depósito, no hay un `alcanciaDeshacerDestape()` — deshacerlo bien es más delicado porque puede haber movimientos posteriores al destape que ya gastaron parte de esa plata. Ver CHANGELOG.md § Alcancía.
- **Tipo de depósito no reconocido** (dato corrupto o futuro tipo sin agregar al mapa de íconos) cae en el ícono/color por defecto de "yo" en la lista de depósitos — no rompe el render, pero tampoco se identifica bien.

## 7. Decisiones de diseño

- **¿Por qué ofuscar el saldo (XOR+Base64) si `saldoRegistrado` ya está en texto plano al lado, en el mismo objeto JSON?** No es cifrado real ni pretende serlo (está anotado así en el propio código) — es una segunda barrera contra el vistazo casual al abrir el backup o inspeccionar el JSON crudo, no contra alguien decidido a buscar `saldoRegistrado`. La protección real contra la tentación diaria es que la UI nunca lo muestra, no el ofuscado.
- **¿Por qué el ingreso neto-cero en vez de simplemente no crear ningún movimiento para "yo-directo"/"regalo"/"mandado"?** Porque esos sí son plata que "entró" en un sentido real (mamá te la dio, o ya la tenías sin registrar) y deben contar en las estadísticas de ingreso del mes — omitir el movimiento por completo subestimaría cuánto entra. El costo es que el saldo de Efectivo nunca refleja ese dinero como "disponible", que es justo el punto: ya se fue a la alcancía.
- **¿Por qué reactivar la lista de depósitos individuales en vez de dejarla apagada?** Sin ella no había ninguna forma de corregir un error de tecleo (monto o cuenta equivocada) una vez guardado — ni desde Alcancía (bloque apagado) ni desde Cuentas (ocultos a propósito, o directamente rotos al borrar). La alternativa de "solo permitir editar, no ver" no resuelve nada: para editar hay que poder identificar cuál depósito es, y eso ya requiere una lista.
- **¿Por qué los montos de esa lista se ocultan por defecto, uno a la vez?** Mostrar todos los montos juntos permite sumarlos a mano y reconstruir el total — exactamente lo que `heroSaldo` existe para evitar. Ocultar por fila con revelado individual mantiene identificable cada depósito (fecha, tipo, cuenta) sin regalar el total de un vistazo; reconstruirlo a mano exige la misma fricción deliberada que ya tenía el diseño original.
- **¿Por qué `cobro-deuda` no usa el truco de ingreso neto-cero como `mandado`/`regalo`/`yo-directo`?** Porque no es plata nueva — es plata que ya era tuya (estaba prestada) cambiando de "por cobrar" a "guardada". El préstamo original, cuando salió de una cuenta, tampoco se contó como gasto (`'prestamo'` solo descuenta saldo, sin generar movimiento visible — ver prestado.md §4.1); por simetría, que vuelva tampoco debe contarse como ingreso. Contarlo infllaría artificialmente las estadísticas de ingreso del mes con dinero que en realidad nunca "entró" de nuevo — ya estaba contado como activo (la deuda) desde que se prestó.
- **¿Por qué el borrado es bidireccional (Alcancía ↔ Prestado) en vez de forzar al usuario a borrar siempre desde el mismo lado?** Porque el usuario puede llegar a corregir el error desde cualquiera de las dos pantallas — ve el depósito raro en Alcancía, o ve el abono raro en el historial del deudor — y obligarlo a recordar "esto se borra desde el otro módulo" es fricción evitable. El costo es mantener el enlace de ids sincronizado en ambos sentidos (ver Reglas, §3).
- **¿Por qué el flujo llama a `_migrarGruposDeudor(d)` antes de resolver el grupo?** Porque el único otro lugar que dispara esa migración silenciosa es `abrirDeudor()` (Prestado) — un deudor viejo que nunca se abrió desde que existen los grupos no tiene `d.grupos`. Sin este paso, `_gruposAbiertos(d)` ve "0 grupos abiertos" aunque la persona sí tenga una deuda real sin agrupar, y `_autoGrupoIdMov` crea un grupo nuevo en blanco en vez de reutilizar la deuda existente — el abono queda huérfano en un grupo aparte con saldo "a favor" en vez de cancelar la deuda real. Se llama en los tres puntos donde se lee o resuelve el grupo (`_alcDeudorSelActualizar`, la validación de saldo y la creación del abono en `alcanciaConfirmarDeposito`) — es barata e idempotente si ya migró.
- **¿Por qué no usar `eliminarMovimiento()` genérico para borrar un depósito?** Esa función no conoce `S.alcancia` — no sabe restar de `saldoRegistrado`/`depositos`, ni actualizar el saldo ofuscado, ni sacar la entrada de `S.alcancia.movimientos[]`. Usarla dejaría el estado de Alcancía desincronizado del resto de la app. De ahí que los movimientos espejo se marquen `_secundario` y exista `alcanciaEliminarDeposito()` como único camino de borrado real.
- **¿Por qué el reinicio del ciclo no es automático al destapar?** Para que la pantalla de resultado (con la comparación contra el ciclo anterior) siga teniendo datos que mostrar incluso si el usuario cierra el sheet sin decidir nada todavía — el ciclo recién destapado queda disponible hasta que explícitamente se elige empezar uno nuevo.

## 8. Referencia de implementación

### Funciones principales

| Función | Qué hace |
|---|---|
| `window.renderAlcancia()` | Pinta toda la pantalla: hero (oculto/revelado), stats, lista de depósitos, historial de ciclos destapados |
| `window.alcanciaConfirmarDeposito()` | Valida y registra un depósito nuevo según el tipo elegido |
| `window.alcanciaEliminarDeposito(movId)` | Revierte y borra un depósito existente (único camino real de borrado, ver §7) |
| `window.alcanciaToggleMontoDeposito(movId, el)` | Revela/oculta el monto de una fila puntual en la lista de depósitos |
| `window.alcanciaConfirmarDestapar()` | Cierra el ciclo activo: genera los movimientos de destape, guarda en `historial`, marca `_destapada` |
| `window.alcanciaIniciarNueva()` | Resetea `S.alcancia` para empezar un ciclo nuevo |
| `_initA()` / `_getA()` | Inicializan/leen `S.alcancia`, creándolo con valores por defecto si no existe |
| `_setSaldoOfuscado()` / `_getSaldoOfuscado()` | Codifican/decodifican `S.alcanciaSaldoOfuscado` (XOR+Base64) |
| `_alcDesgloseHtml(movimientos, fmtFn)` | Arma el desglose "de dónde salió la plata" (yo / mandado / mamá) que se ve en el historial y en el resultado del destape |
| `_alcanciaToggleDesglose(desgloseId, el)` | Expande/colapsa ese desglose en una entrada del historial |
| `_diasDesde()` / `_fmtTiempo()` | Helpers de tiempo activo ("3 semanas", "2 meses") |
| `_alcDeudorSelActualizar()` / `_alcDeudorSaldoHintActualizar()` | Pueblan el selector de persona/grupo y el hint de saldo cuando el tipo elegido es `cobro-deuda` (agregado 2026-08-09) |
| `window._alcanciaQuitarPorCobroDeuda(alcMovId)` | Quita solo el lado de Alcancía de un depósito `cobro-deuda`, sin tocar al deudor — usado por `eliminarMovDeudor()` (prestado.js) cuando el borrado se inicia desde Prestado (agregado 2026-08-09) |

### Ids de sheets / elementos del DOM relevantes

| Id | Qué es |
|---|---|
| `sheet-alcancia-depositar` | Formulario de depósito |
| `sheet-alcancia-destapar` | Paso 1 del destape: resumen + monto real + cuenta destino |
| `sheet-alcancia-resultado` | Pantalla de resultado tras destapar (acá se revela el total) |
| `alcancia-hero-saldo` | El `"$??"` / total revelado |
| `alcancia-movimientos-lista` | Lista de depósitos individuales (reactivada 2026-08-06) |
| `alcancia-historial-lista` | Historial de ciclos ya destapados |
| `alc_dep_tipo` | Select del tipo de depósito — dispara `_alcanciaActualizarTipo()` |

### Eventos registrados (`Events.registerAll('alcancia', ...)`)

`abrirDepositar`, `abrirDestapar`, `iniciarNueva`, `confirmarDeposito`, `confirmarDestapar`, `eliminarDeposito`, `toggleMontoDeposito`, `toggleDesglose`.

### Bugs corregidos

Ver `CHANGELOG.md` § Alcancía — no se repiten acá (ver plantilla-modulo.md, punto sobre dónde documentar bugs).
