# Mis Finanzas

## Qué es

**Mis Finanzas** es una aplicación web personal para llevar el control completo de las finanzas propias: cuentas, gastos, préstamos entre personas cercanas, suscripciones compartidas, dinero encargado por terceros, ahorros, deudas de tarjeta de crédito y la mensualidad que dan los papás. No es una app genérica de presupuesto — está construida a la medida de la vida financiera real de una sola persona, incluyendo relaciones de dinero con familia y amigos que una app de finanzas normal no contempla (mesadas, encargos de plata para guardar, préstamos informales, gastos compartidos con roommates o familiares vía Spotify).

Es un proyecto de un solo desarrollador, para uso personal, pensado para mantenerse y crecer durante años — no un producto para terceros.

## Cómo está construida

- **Un solo archivo HTML** (`index.html`) con JavaScript vanilla, sin frameworks ni build step.
- **Firebase / Firestore** para sincronización en la nube entre dispositivos, con **IndexedDB** como caché local.
- **Desplegada en GitHub Pages.**
- **Estado global (`S`)**: un objeto central que se sincroniza bidireccionalmente con Firestore y contiene todos los datos de la app — cuentas, movimientos, préstamos, encargos, tarjetas, mesadas, Spotify, personas, etc. Todo el HTML se re-renderiza a partir de `S`.
- **Sin backend propio**: toda la lógica de negocio (cálculos, validaciones, reversión de movimientos) vive en el cliente.
- **Migración en curso a módulos separados**: los módulos se van extrayendo uno por uno desde `index.html` hacia `js/modules/` (mismo scope global, cargados como `<script src>` clásicos — todavía no ES modules), con un despachador de eventos centralizado en `js/core/events.js` que reemplaza los `onclick` inline. Ver [`auditoria-tecnica.md`](./auditoria-tecnica.md) para el detalle y el orden. **Ya migrados:** Spotify, Mesada, Encargos, Personas. **Sigue inline en `index.html`:** el resto.

## Principios que se repiten en toda la app

Aunque cada módulo se documenta por separado, hay reglas de diseño que atraviesan todos ellos:

- **Los movimientos financieros son siempre la fuente de verdad.** Ningún estado visual (un botón, un badge, un flag) debe guardar información propia — todo se deriva de los movimientos ya registrados. Esto evita que la interfaz se desincronice de la plata real.
- **Todo dinero que se mueve por una acción de un módulo dentro de una cuenta (Nequi, efectivo, cajita, cuenta personalizada) deja un "movimiento espejo" visible en el historial de esa cuenta**, marcado como automático y protegido contra borrado directo desde ahí — solo se puede deshacer desde el módulo que lo originó. Así ninguna plata "aparece de la nada" en el historial de una cuenta.
- **Las tarjetas de crédito nunca son un destino válido para dinero que entra** (mesadas, cobros de Spotify, encargos, préstamos que devuelven plata). Tiene sentido pagar *con* una TC porque genera deuda, pero no existe forma de "guardar" plata ajena o propia dentro de una TC.
- **Eliminar un registro siempre revierte exactamente los efectos de ese registro**, ni más ni menos — incluyendo casos donde la plata terminó repartida entre varias cuentas distintas a lo largo del tiempo (splits, abonos parciales, pagos adelantados).
- **Las decisiones que afectan dinero de otra persona (deudas, encargos, mesadas) requieren una acción explícita del usuario**, nunca se infieren automáticamente de un monto o una fecha.
- **El Sistema de Personas (`S.personas`) unifica la identidad** de las personas con las que hay relaciones financieras (familia, amigos) a través de los distintos módulos (Spotify, Encargos, "Me deben", Deudores), en vez de que cada módulo tenga su propio registro de nombres sueltos y desconectados entre sí.

## Módulos de la aplicación

| Pantalla | Qué hace |
|---|---|
| **Inicio** | Dashboard general: patrimonio total, alertas de "Necesita atención", resumen de plata comprometida |
| **Cuentas** | Saldos y movimientos de Nequi, efectivo, cajitas y cuentas personalizadas |
| **Gastos** | Registro de gastos variables, con o sin tarjeta de crédito |
| **Tarjetas de crédito** | Deuda de TC, pagos, fechas de corte y detalle de cada movimiento cargado |
| **Préstamos → Me deben** | Plata que otras personas te deben a vos |
| **Préstamos → Yo debo** | Plata que vos le debés a otras personas (`S.misDeudas`) |
| **Encargos** | Dinero que un tercero te encarga guardar (separa el capital ajeno de cualquier interés propio que genere) |
| **Mesada** | Mensualidad de papá y mamá, mes a mes, con manejo de pagos parciales y deuda pendiente |
| **Spotify** | Suscripción compartida: cobro a integrantes, pago al servicio, cálculo de ganancia/pérdida del administrador |
| **Alcancía** | Ahorro tipo "piggy bank" con distintos tipos de depósito y desglose por origen |
| **Plata Comprometida** | Dinero ya destinado a un gasto futuro (fijo o con fecha de pago), para no contarlo como libre en el patrimonio |
| **Análisis financiero** | Vista consolidada: ingresos, patrimonio real, proyección a 3/6/12 meses, salud financiera |
| **Personas** | Sistema unificado de identidad, compartido por Spotify, Encargos, Deudores y "Me deben" |

## Estado de la documentación

Cada módulo se documenta en su propio `.md`, siguiendo la estructura definida en [`plantilla-modulo.md`](./plantilla-modulo.md). El historial de bugs corregidos de todos los módulos vive en un solo [`CHANGELOG.md`](./CHANGELOG.md) compartido, para que el documento de cada módulo se mantenga enfocado en cómo funciona hoy y no crezca indefinidamente con historia ya resuelta.

**Documentados:** Mesada, Spotify, Personas.
**Pendientes:** Cuentas, Gastos, Préstamos, Tarjetas de crédito, Encargos, Alcancía, Plata Comprometida, Análisis financiero.
