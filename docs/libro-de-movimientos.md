# Libro de movimientos

Infraestructura transversal del núcleo: la lista de entradas de plata de las cuentas con saldo. Explica cómo funciona **hoy**; el historial de cambios vive en [`CHANGELOG.md`](./CHANGELOG.md#libro-de-movimientos).

---

## 1. Objetivo

Que el saldo de cada cuenta (Nequi, Efectivo, cuentas personalizadas y cajitas de Nu) sea siempre explicable: **hay una entrada del libro por cada vez que ese saldo cambió, y la suma de sus entradas es el saldo.** Así ninguna plata aparece o desaparece sin dejar rastro, y cualquier descuadre se detecta en el momento en que ocurre en vez de descubrirse meses después.

El libro responde "¿cuánta plata hay en cada cuenta y por qué?". No responde "¿cuánto ingresé y gasté este mes?": eso incluye hechos sin movimiento de caja (compras con tarjeta, préstamos y regalos sin cuenta, márgenes de encargo) y lo siguen calculando los registros de cada módulo (`Periodo`). Son dos vistas distintas que se complementan.

## 2. Conceptos

| Concepto | Qué es |
|---|---|
| **Entrada del libro** | Un cambio del saldo de una cuenta, con signo: `+` entra, `−` sale. Vive en `S.libro`. |
| **Cuenta con saldo** | `'nequi'`, `'efectivo'`, `'custom:<id>'`, `'cajita:<id>'`. Las tarjetas de crédito y la alcancía **no** son cuentas del libro (ver §7). |
| **Origen** | `{ modulo, ref?, rev? }`: qué módulo causó la entrada y, cuando existe, el id del registro de ese módulo (un movimiento de deuda, un gasto, un abono de mesada…). |
| **Reversión** | Una entrada nueva que deshace una anterior: mismo `ref`, `rev: true`, `tipo: 'reversion'`. Nunca se borran entradas. |
| **Puerta única** | `sumarFuente`, `descontarFuente` y `ajustarSaldoCuenta` (`core-state.js`): la única forma de cambiar un saldo. Cada una deja su entrada. |
| **Historial único** | `S.movimientos` guarda el historial de **todas** las cuentas; `fuente` dice a cuál pertenece. Ninguna cuenta tiene lista propia. |

## 3. Reglas que nunca se rompen

1. **Saldo == suma del libro**, por cuenta (`Libro.verificar`). `save()` lo comprueba y avisa una vez por sesión si algo no cuadra.
2. **Nadie escribe `c.saldo` directamente.** Solo la puerta única. Un código que lo haga rompe la regla 1 y se ve al guardar.
3. **Toda llamada a la puerta única lleva `origen`** (`{ modulo, ref }`). Excepciones sin `ref`: intereses de Nu, chequeo rápido, CDT y destape de la alcancía, que no nacen de un registro suelto.
4. **Deshacer = una entrada `reversion`**, no borrar. Quien revierte pasa el mismo `ref` con `rev: true` (o envuelve el bloque en `Libro.conOrigen({ …, rev: true }, fn)`).
5. **El saldo nunca se recorta.** Una salida mayor que el saldo se registra completa y la cuenta queda negativa y visible (los selectores ya solo ofrecen cuentas con saldo suficiente, así que un negativo es un movimiento mal registrado).
6. **Los intereses de Nu (`rendimiento`) van en una sola entrada por cuenta y mes.**
7. **El libro no clasifica.** Ingreso/gasto/neutro lo decide `clase` en los registros de cada módulo; el libro solo mueve plata.
8. **Crear el registro del módulo antes de aplicar el saldo**, para que la entrada pueda apuntar a su id.
9. **El historial de cuentas vive solo en `S.movimientos`.** Nadie crea `cuenta.movimientos` ni `cajita.historial`.

## 4. Modelo de datos

```js
S.libro = [{
  id, fecha, cuenta,          // 'nequi' | 'efectivo' | 'custom:ID' | 'cajita:ID'
  monto,                      // con signo
  tipo,                       // 'apertura' | 'movimiento' | 'reversion' | 'rendimiento' | 'ajuste' | 'cdt'
  desc?,                      // texto corto (solo en entradas que no tienen fila propia en el historial)
  origen: { modulo, ref?, rev? }
}]
```

| `tipo` | Cuándo |
|---|---|
| `apertura` | Saldo inicial de una cuenta |
| `movimiento` | Cualquier cambio que causa un módulo (gasto, abono, mesada, transferencia, "Sumar/Restar dinero"…) |
| `reversion` | Deshace un movimiento (al borrarlo) |
| `rendimiento` | Intereses de Nu materializados, agrupados por cuenta y mes |
| `ajuste` | Chequeo rápido de Nu: la app vs la lectura real |
| `cdt` | Capital que sale de una cajita al crear un CDT, y lo que vuelve al cobrarlo |

`S.movimientos` (historial de cuentas): `{ id, tipo: 'entrada' | 'salida' | 'apertura' | 'transferencia' | 'salida_manual', fuente, monto, fecha, desc, clase, _secundario?, _origenSeccion?, … }`.

`c.saldo` (de cuentas y cajitas) se guarda como dato de lectura rápida; el libro es contra lo que se verifica.

**Versión del esquema:** `S.schemaVersion` (hoy 9; `SCHEMA_BASE` = 9 es la primera compatible y `MIGRACIONES` está vacía). La app no migra datos de versiones anteriores a 9: `aplicarMigraciones` los marca (`S._esquemaAnterior`) y el import de un backup así se rechaza. El mecanismo de `MIGRACIONES` queda para cambios futuros del modelo; ver §6.

## 5. Flujo

**Escribir.** Un módulo crea su registro y llama `sumarFuente(cuenta, monto, { origen: { modulo, ref } })` o `descontarFuente(…)`. La puerta única cambia `c.saldo` y llama `Libro.registrar`. Intereses, chequeo y CDT usan `ajustarSaldoCuenta(cuenta, nuevoSaldo, opts)`, que registra la *diferencia*.

**Revertir.** Borrar un movimiento principal lo deshace todo lo que generó (cuentas, espejos y márgenes de "El valor era diferente"), como si no hubiera pasado; por eso todo efecto secundario se enlaza al principal (`_encMovId` / `linkId` en `diffAplicar`). Al borrar un movimiento, el módulo devuelve el saldo con `origen: { …, rev: true }`; queda una `reversion` con el mismo `ref`. Cada módulo tiene su helper (`_og…(ref, rev)`) y los que revierten en varios pasos usan `Libro.conOrigen`.

**Verificar.** `save()` llama `Libro.verificar()`; si alguna cuenta no cuadra, avisa una vez por sesión (consola y aviso en pantalla) y deja el detalle en `window._libroDescuadres`.

**Leer.** El historial de una cuenta (`getMovimientosCuenta`, `cuentas.js`) junta `S.movimientos` (por `fuente`), gastos variables, préstamos dados, transferencias y cobros de Spotify, y le añade las entradas del libro sin fila propia (`Libro.entradasVisibles`: intereses, ajustes y CDT) como filas con candado. Así el historial explica todo el saldo.

## 6. Casos especiales

- **Plata de encargos:** informativa. No cambia el saldo propio de ninguna cuenta; los intereses que genera en una cajita pertenecen al dueño de la cajita. Esto incluye su **saldo inicial** (`enc.saldoInicial`/`cuentaInicial`): es plata ajena que ya estaba en la cuenta, así que crearlo y eliminarlo no mueven saldo ni dejan entrada en el libro.
- **Alcancía:** el ingreso que entra directo (`_esAlcanciaIngreso`) no mueve ninguna cuenta y no genera entrada.
- **CDT:** su capital sale del saldo de la cajita (`tipo: 'cdt'`); su rendimiento se calcula aparte (`nu-calc.js`).
- **Cuenta eliminada:** sus entradas quedan en el libro y `verificar` las ignora.
- **Reversión en otra fecha:** la `reversion` lleva la fecha de cuando se deshizo; el libro no atribuye gastos a meses (eso lo hace `Periodo` desde los registros).
- **Datos de un esquema anterior (< 9):** no se migran. `aplicarMigraciones` los marca (`S._esquemaAnterior`), `load()` avisa que esta versión empieza de cero (Configuración → Borrar todo) y el import de un backup de esa versión se rechaza. Datos de una versión más nueva no se tocan.
- **Tamaño:** todo el estado vive en un único documento de Firestore (tope 1 MiB). Una entrada del libro pesa ≈ 150 bytes y su espejo en `S.movimientos` ≈ 210; con 5 movimientos al día son ≈ 650 KB por año entre las dos. Por eso el payload viaja comprimido (gzip + base64, prefijo `gz1:`, `js/core/payload-codec.js`): ≈ 6× más chico, unos 9 años de margen a ese ritmo. `firebase-sync.js` mide el tamaño ya comprimido: avisa a los 800 KB y deja de escribir a 1.000.000 de bytes con el motivo real. Si algún día no alcanza, el paso siguiente es partir libro y movimientos por año en documentos aparte (hay que mantener `Libro.verificar` leyendo todo).

## 7. Decisiones de diseño

- **Libro de patas de caja, no partida doble.** Cada módulo conserva su historia propia (a quién, qué deuda, qué abonos); el libro solo guarda el efecto en las cuentas.
- **Dos vistas, no una.** El ingreso y gasto del mes incluyen hechos sin pata de caja, así que `Periodo` sigue leyendo los registros de los módulos. El libro no clasifica ingreso/gasto.
- **Las tarjetas de crédito no son cuenta del libro.** Su deuda ya se deriva de sus propios registros (`tcRecalcular`: saldo inicial + compras + cargos externos − pagos, en cada `refresh`); duplicarla en el libro no aportaría nada.
- **Saldo guardado + verificación**, en lugar de calcularlo siempre: la lectura es instantánea y cualquier código que cambie un saldo sin pasar por el libro se detecta al guardar. Derivarlo en cada refresh habría escondido el error.
- **Revertir añade, no borra.** Deja rastro auditable de qué se deshizo y por qué módulo.
- **Una sola lista de historial.** Evita que una pantalla o un cálculo se olvide de una lista (el origen de varios descuadres silenciosos) y que cada módulo tenga que saber en cuál escribir.
- **El libro vive en el núcleo (`core-state.js`)**, no en un archivo aparte: la puerta única que lo usa está ahí y tiene que funcionar en cualquier pantalla y en cualquier test que cargue el núcleo.
- **Sin migraciones: la app nació limpia en el esquema 9 (2026-10-18).** No quedan datos de usuario que migrar, así que las migraciones de las versiones 8 (tasa única de Nu) y 9 (Spotify en `S.spotify`) se plegaron en el modelo actual en vez de arrastrarse como código que transforma formas anteriores. El mecanismo (`MIGRACIONES`, vacío) se usará para el próximo cambio de forma de los datos.
- **No existe una función única "mover plata + espejo".** Se evaluó (`Libro.mover`): hay solo 9 pares saldo+espejo (Préstamos 6, Mesada 1, Spotify 1, y la definición) frente a 86 llamadas de saldo que van con los registros propios de cada módulo (gastos, encargos, tarjetas, alcancía). Unificar 9 pares no justifica una puerta nueva; la puerta única ya es `sumarFuente`/`descontarFuente`.
- **Las entradas del libro sin fila propia se muestran como filas con candado** en el historial: no se pueden borrar desde ahí, porque no las originó un módulo.

## 8. Referencia de implementación

| Qué | Dónde |
|---|---|
| El libro (`Libro`: `registrar`, `conOrigen`, `verificar`, `entradasVisibles`, `saldo`), la puerta única (`sumarFuente`, `descontarFuente`, `ajustarSaldoCuenta`, `_libroPata`), la verificación en `save()`, y la versión del esquema (`SCHEMA_BASE`, `MIGRACIONES`, `aplicarMigraciones`) | `js/core/core-state.js` |
| Espejo en el historial (`registrarMovEspejo`, `borrarMovEspejo`): siempre en `S.movimientos` con `fuente` | `js/core/cuenta-efectos.js` |
| Historial de una cuenta con las entradas del libro sin fila | `getMovimientosCuenta` en `js/modules/cuentas.js` |
| Borrado desde el feed o el historial de una cuenta | `eliminarMovimiento` en `js/core/movimientos.js` |
| Origen por módulo | `_ogGv` (gastos), `_ogEnc` (encargos), `_ogSp` (spotify), `_ogMes` (mesada), `_ogTc` (tarjetas), `_ogAlc` (alcancía), `_ogCta` (cuentas), `_ogMov` (borrado desde el historial), `_og`/`_enReversion` (préstamos) |
| Validación al importar un backup (versión del esquema, `libro` debe ser array) | `_validarEstructuraJSON` en `js/modules/configuracion.js` |
| Pruebas | `tests/libro.test.js` (suites `libro` y `libro-modulos`), `tests/cuentas.test.js` (suite `historial-cuenta`), `tests/nucleo.test.js` (suites `migraciones`, `clase-movimientos` y `clase-cobertura`) |
| Guardia de las reglas 2 y 3 (nadie escribe `.saldo`; toda llamada de saldo con `origen`) | `tests/libro.test.js` (suite `puerta-unica`) |

**Para cambiar un saldo desde un módulo nuevo:** crea tu registro, llama `sumarFuente`/`descontarFuente` con `{ origen: { modulo: 'tu-modulo', ref: idDelRegistro } }`, y al borrar el registro devuelve el saldo con `rev: true` y el mismo `ref`. No toques `c.saldo`.
