/* ═══════════════════════════════════════════════════════════════
   js/core/personas-core.js

   Núcleo de Personas: UNA tabla de personas (S.personas) y los módulos como relaciones.

   Vive en el núcleo (carga de entrada, justo después de estado.js) por la misma razón que `Deudas` en calc-helpers.js: la integridad,
   el borrado y la fusión de personas tienen que ver TODAS las relaciones aunque el módulo dueño (Encargos, Spotify, Préstamos) sea lazy
   y todavía no haya cargado. Por eso este archivo declara aquí la mitad de DATOS de cada relación (dónde están sus registros, si es
   única por persona). Con eso la lista, el perfil y la posición neta de Personas salen de las relaciones, no de código escrito por módulo.

   Todo recibe opcionalmente un objeto de datos `d` (por defecto el S global), para poder comprobar un estado aislado.

   Invariantes (lo que verificar() comprueba):
     I1. Todo registro de una relación tiene `personaId` y esa persona existe en S.personas.
     I2. Ningún registro de una relación guarda `nombre` ni `color` de la persona: salen siempre de S.personas (una sola fuente).
     I3. Los ids de S.personas son únicos y los nombres de las personas NO archivadas también (ignorando mayúsculas, tildes y espacios).
     I4. Como máximo un registro vivo por (persona, relación) en las relaciones `unica`.

   Ciclo de vida: archivar/restaurar (la persona deja de ofrecerse y de listarse, pero sus registros siguen intactos), eliminar (solo si no
   tiene ninguna relación: con historial se archiva, nunca se borra) y fusionar (junta dos personas en una; ver `fusionar`).

   Qué NO hace todavía (ver docs/personas-modelo-unico.md): vincular el diferencial y la mesada.
   ═══════════════════════════════════════════════════════════════ */

const Personas = (() => {
  const COLOR_DEFECTO = '#60b0f0'; // el primero de PERSONA_COLORES (personas.js carga después y no se puede leer desde acá)

  // Nombre comparable: sin tildes, sin mayúsculas, sin espacios de más.
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const _d = d => d || S;
  const _arr = x => (Array.isArray(x) ? x : []);

  /* ── Relaciones ───────────────────────────────────────────
     Cada módulo con gente se declara como relación. Campos:
       id         identificador estable.
       etiqueta   cómo se llama en pantalla.
       coleccion(d) → arreglo VIVO con los registros (todos con `personaId`). Debe tolerar que la colección no exista todavía.
       unica      true = a lo más un registro por persona (I4).
       alFusionar { unir(origen, destino, d, rel) } — qué hacer al fusionar dos personas que YA tienen esta relación `unica`. Sin él, la
                  fusión se bloquea (por ejemplo Spotify: dos integrantes no se mezclan). Una relación no `unica` simplemente se reasigna.
       pantalla   pantalla del módulo (para «ver en el módulo»).
       saldo(r)   aporte del registro a la posición neta con la persona: positivo = te deben, negativo = le debes. Sin `saldo` no aporta.
       resumen(registros, saldo) → { tag, cab, corto: {texto, tono}, pc }: lo que muestran la lista y la cabecera del perfil.
                  tag = etiqueta corta; cab = texto de la cabecera del perfil; corto = línea de la lista en celular (tono: 'ambar' |
                  'rojo' | 'ok' | ''); pc = texto de la lista en PC ('' si no dice nada).
     Todo esto vive en el núcleo (no en el módulo lazy) para que lista, perfil, integridad y posición neta funcionen aunque el módulo no
     haya cargado. Un módulo puede volver a registrar su `id` para añadir o cambiar campos: se MEZCLA con lo declarado aquí. */
  const _relaciones = [];

  function registrarRelacion(rel) {
    if (!rel || typeof rel.id !== 'string') throw new Error('Personas.registrarRelacion: se necesita { id, coleccion(d) }');
    const i = _relaciones.findIndex(r => r.id === rel.id);
    const nueva = i >= 0 ? { ..._relaciones[i], ...rel } : { etiqueta: rel.id, unica: false, ...rel };
    if (typeof nueva.coleccion !== 'function') throw new Error('Personas.registrarRelacion: se necesita { id, coleccion(d) }');
    if (i >= 0) _relaciones[i] = nueva; else _relaciones.push(nueva);
    return nueva;
  }

  const _plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const _fmt = n => (typeof fmt === 'function' ? fmt(n) : String(n));
  const _suma = (regs, f) => regs.reduce((a, r) => a + (Number(f(r)) || 0), 0);
  // Los cálculos viven en calc-helpers.js (de entrada); el guard solo evita un ReferenceError si alguien carga este archivo suelto.
  const _saldoDeudor = r => (typeof getDeudorSaldo === 'function' ? getDeudorSaldo(r) : 0);
  const _saldoMiDeuda = r => (typeof getMiDeudaSaldo === 'function' ? getMiDeudaSaldo(r) : 0);

  // ── Fusión: cómo se unen dos registros de una relación `unica` cuando AMBAS personas ya la tienen ──
  // Una deuda unida conserva los datos de la que queda (destino) y suma los movimientos y grupos de la otra; luego toda referencia a la
  // deuda que desaparece (cualquier campo con «deud» en su nombre: deudorId, _deudorId, miDeudaId, _deudaId…) pasa a la que queda. Los ids
  // son uid() únicos, así que un valor igual al id viejo solo puede ser una referencia a esa deuda.
  function _repuntarIds(nodo, deId, aId) {
    if (!nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) { nodo.forEach(x => _repuntarIds(x, deId, aId)); return; }
    Object.keys(nodo).forEach(k => {
      const v = nodo[k];
      if (v === deId && /deud/i.test(k)) nodo[k] = aId;
      else if (v && typeof v === 'object') _repuntarIds(v, deId, aId);
    });
  }
  function _unirDeudas(origen, destino, est, rel) {
    Object.keys(origen).forEach(k => {
      if (k === 'id' || k === 'personaId') return;
      if (Array.isArray(origen[k]) && Array.isArray(destino[k])) destino[k] = destino[k].concat(origen[k]);
      else if (destino[k] === undefined) destino[k] = origen[k];
    });
    _repuntarIds(est, origen.id, destino.id);
    const arr = rel.coleccion(est), i = arr.indexOf(origen);
    if (i >= 0) arr.splice(i, 1);
  }

  // El orden de registro es el orden en que el perfil muestra las secciones.
  registrarRelacion({
    id: 'me-deben', etiqueta: 'Me debe', unica: true, pantalla: 'prestamos', alFusionar: { unir: _unirDeudas },
    coleccion: d => _arr(d.deudores),
    saldo: _saldoDeudor,
    resumen: (regs, saldo) => ({
      tag: 'Préstamo', cab: 'Préstamos',
      corto: saldo !== 0 ? { texto: _fmt(saldo) + ' pendiente', tono: 'ambar' } : { texto: 'Al día', tono: 'ok' },
      pc: saldo > 0 ? 'Me debe' : '',
    }),
  });
  registrarRelacion({
    id: 'encargos', etiqueta: 'Encargo', unica: false, pantalla: 'encargos',
    coleccion: d => _arr(d.encargos),
    // Sin `saldo`: el saldo de un encargo NO entra en la posición neta. Es plata suya que solo administras, no una deuda a tu favor ni en
    // tu contra (mismo criterio que Préstamos e Inicio).
    resumen: regs => { const t = _plural(regs.length, 'encargo', 'encargos'); return { tag: 'Encargo', cab: t, corto: { texto: t, tono: '' }, pc: t }; },
  });
  registrarRelacion({
    id: 'spotify', etiqueta: 'Spotify', unica: true, pantalla: 'spotify',
    coleccion: d => _arr(d.spotify && d.spotify.integrantes),
    resumen: () => ({ tag: 'Spotify', cab: 'Spotify', corto: { texto: 'Spotify', tono: '' }, pc: 'Spotify' }),
  });
  registrarRelacion({
    id: 'yo-debo', etiqueta: 'Yo debo', unica: true, pantalla: 'prestamos', alFusionar: { unir: _unirDeudas },
    coleccion: d => _arr(d.misDeudas),
    saldo: r => -_saldoMiDeuda(r),
    resumen: (regs, saldo) => ({
      tag: 'Le debo', cab: 'Le debo',
      corto: saldo < 0 ? { texto: 'Le debes ' + _fmt(-saldo), tono: 'rojo' } : { texto: 'Deuda saldada', tono: 'ok' },
      pc: saldo < 0 ? 'Yo le debo' : '',
    }),
  });

  /* ── Lectura ──────────────────────────────────────────────── */
  const lista = d => _arr(_d(d).personas);                 // todas, archivadas incluidas
  const activas = d => lista(d).filter(p => p && !p.archivada); // las que se ofrecen y se listan
  const obtener = (id, d) => (id ? lista(d).find(p => p && p.id === id) : undefined);
  const nombre = (id, d) => { const p = obtener(id, d); return p ? p.nombre : '—'; };
  const color = (id, d) => { const p = obtener(id, d); return p ? (p.color || COLOR_DEFECTO) : COLOR_DEFECTO; };
  // Entre las NO archivadas: un nombre de una persona archivada se puede volver a usar.
  const buscarPorNombre = (n, d) => { const k = norm(n); return k ? activas(d).find(p => p && norm(p.nombre) === k) : undefined; };
  const declaradas = () => _relaciones.slice();

  // Registros de una relación que pertenecen a una persona.
  const registros = (personaId, relacionId, d) => {
    const rel = _relaciones.find(r => r.id === relacionId);
    return rel && personaId ? rel.coleccion(_d(d)).filter(r => r && r.personaId === personaId) : [];
  };

  // Relaciones vivas de una persona (las que tienen al menos un registro), en el orden de registro, ya con su saldo y su resumen.
  //   [{ id, etiqueta, pantalla, registros, saldo, resumen }]   (saldo: positivo = te deben; 0 si la relación no tiene saldo)
  function relaciones(personaId, d) {
    const est = _d(d), out = [];
    _relaciones.forEach(rel => {
      const regs = rel.coleccion(est).filter(r => r && r.personaId === personaId);
      if (!regs.length) return;
      const saldo = typeof rel.saldo === 'function' ? _suma(regs, rel.saldo) : 0;
      out.push({ id: rel.id, etiqueta: rel.etiqueta, pantalla: rel.pantalla, tieneSaldo: typeof rel.saldo === 'function', registros: regs, saldo, resumen: typeof rel.resumen === 'function' ? rel.resumen(regs, saldo) : null });
    });
    return out;
  }

  // Lo que te debe (Préstamos) menos lo que le debes (Yo debo). Positivo = te debe; negativo = le debes. Los encargos no entran.
  const posicionNeta = (personaId, d) => relaciones(personaId, d).reduce((a, r) => a + r.saldo, 0);

  /* ── Escritura ────────────────────────────────────────────── */
  // Crea una persona. Si ya hay una con el mismo nombre (sin mirar mayúsculas ni tildes) NO crea otra: devuelve la existente con
  // creada:false para que quien llama decida (elegirla o avisar). Devuelve null si el nombre está vacío.
  function crear(datos, d) {
    const est = _d(d);
    const n = String((datos && datos.nombre) || '').replace(/\s+/g, ' ').trim();
    if (!n) return null;
    const existente = buscarPorNombre(n, est);
    if (existente) return { persona: existente, creada: false };
    if (!Array.isArray(est.personas)) est.personas = [];
    const p = { id: uid(), nombre: n, color: (datos && datos.color) || COLOR_DEFECTO, creadoEn: hoy() };
    est.personas.push(p);
    return { persona: p, creada: true };
  }

  // Cambia nombre, color, alias y/o notas de la persona (los módulos lo leen de aquí, no hay nada que sincronizar). Rechaza un nombre que ya tiene OTRA persona.
  function editar(id, cambios, d) {
    const est = _d(d);
    const p = obtener(id, est);
    if (!p) return { ok: false, error: 'no-existe' };
    const c = cambios || {};
    if (c.nombre !== undefined) {
      const n = String(c.nombre).replace(/\s+/g, ' ').trim();
      if (!n) return { ok: false, error: 'sin-nombre' };
      const otra = buscarPorNombre(n, est);
      if (otra && otra.id !== id) return { ok: false, error: 'duplicado', persona: otra };
      p.nombre = n;
    }
    if (c.color !== undefined && c.color) p.color = c.color;
    // alias (otro nombre con el que la buscas, p. ej. «Mami») y notas (texto libre para distinguirla): vacío = se quita el campo.
    ['alias', 'notas'].forEach(k => {
      if (c[k] === undefined) return;
      const v = String(c[k]).replace(/\s+/g, ' ').trim();
      if (v) p[k] = v; else delete p[k];
    });
    return { ok: true, persona: p };
  }

  /* ── Ciclo de vida ────────────────────────────────────────── */
  // Archivar no toca ningún registro: la persona deja de ofrecerse en los selectores y de salir en la lista, y sus préstamos, encargos y
  // demás siguen donde están (se siguen viendo en su módulo con su nombre).
  function archivar(id, d) {
    const p = obtener(id, _d(d));
    if (!p) return { ok: false, error: 'no-existe' };
    p.archivada = true;
    return { ok: true, persona: p };
  }
  // Devuelve a la lista a una persona archivada. Si mientras tanto otra persona tomó su nombre, no se puede (I3): hay que renombrar una.
  function restaurar(id, d) {
    const est = _d(d), p = obtener(id, est);
    if (!p) return { ok: false, error: 'no-existe' };
    const otra = buscarPorNombre(p.nombre, est);
    if (otra && otra.id !== id) return { ok: false, error: 'duplicado', persona: otra };
    delete p.archivada;
    return { ok: true, persona: p };
  }
  // Solo una persona SIN ninguna relación se borra (I5). Con préstamos, encargos o Spotify (aunque estén en cero) queda su historial:
  // se archiva.
  function eliminar(id, d) {
    const est = _d(d), p = obtener(id, est);
    if (!p) return { ok: false, error: 'no-existe' };
    const rels = relaciones(id, est);
    if (rels.length) return { ok: false, error: 'tiene-relaciones', relaciones: rels.map(r => r.id) };
    est.personas.splice(est.personas.indexOf(p), 1);
    return { ok: true };
  }

  // Qué haría fusionar `origenId` dentro de `destinoId`, sin tocar nada. { ok:true, pasos } o { ok:false, error, relacion?, etiqueta? }:
  //   'mismo' | 'no-existe' | 'destino-archivada' | 'conflicto' (ambas tienen una relación `unica` que no sabe unirse).
  function _planFusion(origenId, destinoId, est) {
    if (!origenId || !destinoId || origenId === destinoId) return { ok: false, error: 'mismo' };
    const o = obtener(origenId, est), dst = obtener(destinoId, est);
    if (!o || !dst) return { ok: false, error: 'no-existe' };
    if (dst.archivada) return { ok: false, error: 'destino-archivada' };
    const pasos = [];
    for (const rel of _relaciones) {
      const col = rel.coleccion(est);
      const ro = col.filter(r => r && r.personaId === origenId);
      if (!ro.length) continue;
      const rd = col.filter(r => r && r.personaId === destinoId);
      if (rel.unica && rd.length) {
        if (!(rel.alFusionar && typeof rel.alFusionar.unir === 'function')) return { ok: false, error: 'conflicto', relacion: rel.id, etiqueta: rel.etiqueta };
        pasos.push({ rel, tipo: 'unir', origen: ro, destino: rd[0] });
      } else pasos.push({ rel, tipo: 'mover', origen: ro });
    }
    return { ok: true, o, dst, pasos };
  }
  const puedeFusionar = (origenId, destinoId, d) => { const r = _planFusion(origenId, destinoId, _d(d)); return r.ok ? { ok: true } : { ok: false, error: r.error, relacion: r.relacion, etiqueta: r.etiqueta }; };

  // Junta dos personas en una: todo lo de `origen` pasa a `destino` y `origen` desaparece. El nombre y el color que quedan son los del destino.
  //   · Relación que solo tiene el origen, o que admite varios registros (Encargos): se reasigna a `destino`.
  //   · Relación `unica` que tienen las dos: se une con su `alFusionar.unir` (Préstamos/Yo debo suman movimientos) o, si no sabe unirse
  //     (Spotify), se rechaza ANTES de tocar nada con error 'conflicto'.
  // Devuelve { ok:true, persona, unidas:[ids de relación], movidas:n } o { ok:false, error }.
  function fusionar(origenId, destinoId, d) {
    const est = _d(d), plan = _planFusion(origenId, destinoId, est);
    if (!plan.ok) return plan;
    const unidas = [];
    let movidas = 0;
    plan.pasos.forEach(paso => {
      if (paso.tipo === 'mover') { paso.origen.forEach(r => { r.personaId = destinoId; movidas++; }); return; }
      paso.origen.forEach(r => paso.rel.alFusionar.unir(r, paso.destino, est, paso.rel));
      unidas.push(paso.rel.id);
    });
    // Lo que el destino no tenía (alias y notas) se conserva del origen.
    ['alias', 'notas'].forEach(k => { if (plan.o[k] && !plan.dst[k]) plan.dst[k] = plan.o[k]; });
    est.personas.splice(est.personas.indexOf(plan.o), 1);
    return { ok: true, persona: plan.dst, unidas, movidas };
  }

  /* ── Integridad ───────────────────────────────────────────── */
  // Registros que apuntan a una persona que no existe o que no tienen vínculo (I1).
  function huerfanos(d) {
    const est = _d(d), ids = new Set(lista(est).map(p => p && p.id)), out = [];
    _relaciones.forEach(rel => rel.coleccion(est).forEach(r => {
      if (!r || typeof r !== 'object') return;
      if (!r.personaId) out.push({ relacion: rel.id, registro: r, motivo: 'sin-personaId' });
      else if (!ids.has(r.personaId)) out.push({ relacion: rel.id, registro: r, motivo: 'persona-inexistente' });
    }));
    return out;
  }

  // Lista de violaciones de I1–I4 (vacía = todo en orden). No modifica nada.
  function verificar(d) {
    const est = _d(d), out = [], personas = lista(est);
    const ids = new Set(), nombres = new Map();
    personas.forEach(p => {
      if (!p || !p.id) { out.push({ regla: 'I3', tipo: 'persona-sin-id', persona: p }); return; }
      if (ids.has(p.id)) out.push({ regla: 'I3', tipo: 'id-repetido', personaId: p.id });
      ids.add(p.id);
      if (p.archivada) return; // I3: el nombre solo es único entre las no archivadas
      const k = norm(p.nombre);
      if (nombres.has(k)) out.push({ regla: 'I3', tipo: 'nombre-repetido', personaId: p.id, otraId: nombres.get(k), nombre: p.nombre });
      else nombres.set(k, p.id);
    });
    huerfanos(est).forEach(h => out.push({ regla: 'I1', tipo: h.motivo, relacion: h.relacion, id: h.registro.id }));
    _relaciones.forEach(rel => {
      const vistos = new Map();
      rel.coleccion(est).forEach(r => {
        if (!r || !r.personaId) return;
        const p = obtener(r.personaId, est);
        if (rel.unica) {
          if (vistos.has(r.personaId)) out.push({ regla: 'I4', tipo: 'relacion-repetida', relacion: rel.id, personaId: r.personaId, ids: [vistos.get(r.personaId), r.id] });
          else vistos.set(r.personaId, r.id);
        }
        if (p && (Object.prototype.hasOwnProperty.call(r, 'nombre') || Object.prototype.hasOwnProperty.call(r, 'color'))) out.push({ regla: 'I2', tipo: 'copia-guardada', relacion: rel.id, id: r.id, personaId: p.id });
      });
    });
    return out;
  }

  return { COLOR_DEFECTO, norm, registrarRelacion, declaradas, relaciones, registros, posicionNeta, lista, activas, obtener, nombre, color, buscarPorNombre, crear, editar, archivar, restaurar, eliminar, puedeFusionar, fusionar, huerfanos, verificar };
})();
if (typeof window !== 'undefined') window.Personas = Personas; // los tests lo leen como ctx.Personas
