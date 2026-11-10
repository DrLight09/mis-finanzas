# Respaldos automáticos — cómo funcionan

Complementan la exportación manual a `.json`; no la reemplazan. La idea: **antes de que un guardado sobrescriba tus datos en la nube, la app se queda con una copia de lo que había.**

## 1. Por qué existen

Todos tus datos viven en un solo documento de Firestore (`usuarios/{uid}/data/finanzas`) que cada guardado sobrescribe sin historial. Si un error o una importación equivocada lo dañaba, quedaba dañado en la nube. Ahora siempre queda una copia anterior a la que volver.

## 2. Cuándo se crea un respaldo

Hay dos clases:

- **Diario.** La primera vez que se guarda algo en un día nuevo. Contiene el estado con que terminó el día anterior (lo que había en la nube justo antes de ese guardado). Se hace una vez por día; los guardados siguientes del mismo día no crean otro ni tocan el de ese día.
- **Previo.** Justo antes de importar un JSON o de restaurar un respaldo: guarda lo que estaba un instante antes de pisarlo. Por eso importar o restaurar por error también se puede deshacer.

El día es el de tu dispositivo (hora local), no el de UTC.

## 3. Cuándo NO se crea

- **Si no abres la app, no hay respaldo ese día.** La app solo corre cuando la abres; un respaldo «a las 11:59 pm» sin abrirla pediría un servidor (plan Blaze de Firebase). Tampoco hace falta: si no abres la app, nada cambió.
- **Si no hay nada que guardar** (los datos son idénticos a los ya guardados), la app no escribe, y por tanto no crea respaldo.
- **Si no hay datos en absoluto** (usuario nuevo, o el documento está vacío tras «Borrar todo»), no se respalda: no hay nada que proteger.
- **Tener todo en 0 no cuenta como «sin datos».** Cuentas, categorías, módulos, historial… siguen existiendo aunque los saldos sean $0, y eso sí vale la pena proteger. Solo se salta un documento realmente vacío.
- **Si hubo un conflicto de revisión** (otro dispositivo guardó antes), el guardado se descarta y no se respalda: no se pisó nada.

## 4. Días sin abrir la app e intereses

Los intereses de las cajitas no se guardan día a día: se **calculan al abrir la app**, desde la última fecha en que se sellaron, con el saldo y el historial de tasas de la cuenta. Entonces, tras varios días sin abrirla:

1. Abres la app: se calculan los intereses de todos esos días y se sellan en el saldo.
2. Se hace el primer guardado del día. El respaldo diario guarda lo que había **antes** de sellar (la fecha vieja y el saldo viejo).
3. Si restauras ese respaldo y vuelves a abrir la app, los intereses se recalculan hasta hoy desde esa fecha vieja: **no se pierde nada de lo generado.**

Lo único que un respaldo no trae es lo que registraste *después* de que se creó (movimientos, un cambio de tasa anotado más tarde, etc.): restaurar vuelve al estado de ese momento.

## 5. Dónde se guardan y cuántos

| | Dónde | Cuántos | Para qué |
|---|---|---|---|
| **Nube** | Documentos hermanos del principal, en `usuarios/{uid}/data/` (`respaldo-AAAA-MM-DD`, `respaldo-previo-…`) y un índice `respaldos-indice` | 30 diarios · 5 previos | Es la copia principal, disponible desde cualquier dispositivo |
| **Dispositivo** | IndexedDB del navegador (`mf-respaldos`) | 7 diarios · 2 previos | Sirve sin conexión y no depende de Firebase; se pierde si borras los datos del navegador o desinstalas la app |

Al llegar al tope se borra el más antiguo de cada clase. El índice guarda fecha, tamaño y origen de cada respaldo, así listar cuesta una sola lectura en vez de descargar todos. Se actualiza en la misma transacción que crea o borra el respaldo, así que no se desincroniza.

Cada copia es idéntica al documento original (el payload ya comprimido se copia tal cual, sin recomprimir). Pesan como tu documento principal; 35 copias caben de sobra en el plan gratis de Firebase.

## 6. Restaurar

Configuración → Datos → Respaldos automáticos → «Ver respaldos» → «Restaurar». La app:

1. lee el respaldo (de la nube; si no responde, del dispositivo);
2. lo valida igual que un archivo importado (uno inválido no reemplaza nada);
3. pide confirmación y el PIN;
4. crea un respaldo **previo** de lo que tienes ahora y recién entonces lo reemplaza.

Importar un JSON usa exactamente el mismo camino.

## 7. Garantías de diseño

- **Un respaldo que falla nunca impide guardar.** Se hace en una transacción propia, aparte del guardado de los datos. Lo peor que puede pasar es «hoy no hubo respaldo».
- **Si Firestore rechazara los respaldos** (reglas de seguridad), la app avisa una vez y no insiste durante esa sesión; la copia del dispositivo sigue funcionando.
- **Las reglas de Firestore ya los permiten:** cubren todo `usuarios/{uid}/…` solo para su dueño, así que los respaldos heredan esa misma protección: solo tú puedes leerlos o escribirlos.
- **«Borrar todos los datos» y «Eliminar cuenta» también borran los respaldos** (nube y dispositivo), porque son tus datos. Con «Borrar todo», los respaldos se borran solo después de confirmar que el documento principal quedó vacío.
- **Se guardan dentro de `data/`**, junto al documento principal, para no depender de reglas nuevas.

## 8. Dónde está el código

`js/core/respaldos.js` (lógica: ids, poda, copia, almacén IndexedDB, lectura), `js/core/firebase-sync.js` (cuándo respaldar y qué hacer si falla), `js/modules/configuracion.js` (lista y restaurar). Pruebas en `tests/respaldos.test.js`.
