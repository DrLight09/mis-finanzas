/* ═══════════════════════════════════════════════════════════════
   js/core/personas-core.js

   Núcleo de Personas: UNA tabla de personas (S.personas) y los módulos como relaciones.

   Vive en el núcleo (carga de entrada, justo después de estado.js) por la misma razón que `Deudas` en calc-helpers.js: la integridad,
   el borrado y la fusión de personas tienen que ver TODAS las relaciones aunque el módulo dueño (Encargos, Spotify, Préstamos) sea lazy
   y todavía no haya cargado. Por eso este archivo declara aquí la mitad de DATOS de cada relación (dónde están sus registros, si es
   única por persona, qué campos copia). La mitad de PANTALLA (resumen, «ver en el módulo») la registrará cada módulo al cargar.

   Todo recibe opcionalmente un objeto de datos `d` (por defecto el S global): así la migración y la importación de un backup lo usan
   sobre datos crudos, antes de que sean el S de la app.

   Invariantes (lo que verificar() comprueba):
     I1. Todo registro de una relación tiene `personaId` y esa persona existe en S.personas.
     I2. (transitoria, hasta quitar las copias) `nombre`/`color` copiados en un registro coinciden con los de su persona.
     I3. Los ids de S.personas son únicos y los nombres también (ignorando mayúsculas, tildes y espacios sobrantes).
     I4. Como máximo un registro vivo por (persona, relación) en las relaciones `unica`.

   Qué NO hace todavía (ver docs/personas-modelo-unico.md): archivar/eliminar/fusionar desde la interfaz, perfil y lista genéricos sobre
   relaciones, quitar las copias de nombre y color, resumen/saldo por relación.
   ═══════════════════════════════════════════════════════════════ */

const Personas = (() => {
  const COLOR_DEFECTO = '#60b0f0'; // el primero de PERSONA_COLORES (personas.js carga después y no se puede leer desde acá)
  const SIN_NOMBRE = 'Sin nombre';

  // Nombre comparable: sin tildes, sin mayúsculas, sin espacios de más.
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const _d = d => d || S;
  const _arr = x => (Array.isArray(x) ? x : []);

  /* ── Relaciones (mitad de datos) ────────────────────────────
     id        identificador estable de la relación.
     etiqueta  cómo se llama en pantalla.
     coleccion(d) → arreglo VIVO con los registros (todos con `personaId`). Debe tolerar que la colección no exista todavía.
     unica     true = a lo más un registro por persona (I4).
     copia     {nombre?, color?}: campos que el registro todavía guarda copiados de la persona. Mientras existan, editar() y
               reconciliar() los mantienen iguales; al quitar la copia de un módulo se borra aquí su bandera y ya no hay nada que sincronizar. */
  const _relaciones = [];

  function registrarRelacion(rel) {
    if (!rel || typeof rel.id !== 'string' || typeof rel.coleccion !== 'function') throw new Error('Personas.registrarRelacion: se necesita { id, coleccion(d) }');
    const nueva = { etiqueta: rel.id, unica: false, copia: {}, ...rel };
    const i = _relaciones.findIndex(r => r.id === rel.id);
    if (i >= 0) _relaciones[i] = nueva; else _relaciones.push(nueva);
    return nueva;
  }

  registrarRelacion({ id: 'me-deben', etiqueta: 'Me debe', unica: true, copia: { nombre: true, color: true }, coleccion: d => _arr(d.deudores) });
  registrarRelacion({ id: 'yo-debo', etiqueta: 'Yo debo', unica: true, copia: { nombre: true, color: true }, coleccion: d => _arr(d.misDeudas) });
  registrarRelacion({ id: 'encargos', etiqueta: 'Encargo', unica: false, copia: { nombre: true }, coleccion: d => _arr(d.encargos) });
  registrarRelacion({ id: 'spotify', etiqueta: 'Spotify', unica: true, copia: { nombre: true }, coleccion: d => _arr(d.spotify && d.spotify.personas) });

  /* ── Lectura ──────────────────────────────────────────────── */
  const lista = d => _arr(_d(d).personas);
  const obtener = (id, d) => (id ? lista(d).find(p => p && p.id === id) : undefined);
  const nombre = (id, d) => { const p = obtener(id, d); return p ? p.nombre : '—'; };
  const color = (id, d) => { const p = obtener(id, d); return p ? (p.color || COLOR_DEFECTO) : COLOR_DEFECTO; };
  const buscarPorNombre = (n, d) => { const k = norm(n); return k ? lista(d).find(p => p && norm(p.nombre) === k) : undefined; };
  const relaciones = () => _relaciones.slice();

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

  // Cambia nombre y/o color y deja iguales las copias que los registros todavía guardan. Rechaza un nombre que ya tiene OTRA persona.
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
    _sincronizarCopias(est, p);
    return { ok: true, persona: p };
  }

  function _sincronizarCopias(est, p) {
    let n = 0;
    _relaciones.forEach(rel => {
      if (!rel.copia || (!rel.copia.nombre && !rel.copia.color)) return;
      rel.coleccion(est).forEach(r => {
        if (!r || r.personaId !== p.id) return;
        if (rel.copia.nombre && r.nombre !== p.nombre) { r.nombre = p.nombre; n++; }
        if (rel.copia.color && p.color && r.color !== p.color) { r.color = p.color; n++; }
      });
    });
    return n;
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
      const k = norm(p.nombre);
      if (nombres.has(k)) out.push({ regla: 'I3', tipo: 'nombre-repetido', personaId: p.id, otraId: nombres.get(k), nombre: p.nombre });
      else nombres.set(k, p.id);
    });
    huerfanos(est).forEach(h => out.push({ regla: 'I1', tipo: h.motivo, relacion: h.relacion, id: h.registro.id, nombre: h.registro.nombre }));
    _relaciones.forEach(rel => {
      const vistos = new Map();
      rel.coleccion(est).forEach(r => {
        if (!r || !r.personaId) return;
        const p = obtener(r.personaId, est);
        if (rel.unica) {
          if (vistos.has(r.personaId)) out.push({ regla: 'I4', tipo: 'relacion-repetida', relacion: rel.id, personaId: r.personaId, ids: [vistos.get(r.personaId), r.id] });
          else vistos.set(r.personaId, r.id);
        }
        if (p && rel.copia) {
          if ((rel.copia.nombre && r.nombre !== p.nombre) || (rel.copia.color && p.color && r.color !== p.color)) out.push({ regla: 'I2', tipo: 'copia-desfasada', relacion: rel.id, id: r.id, personaId: p.id });
        }
      });
    });
    return out;
  }

  // Repara por nombre lo que se pueda reparar sin adivinar (migración 13, importación, carga). Idempotente.
  //   1. Quita personas con id repetido o inválido.
  //   2. Une las personas con el MISMO nombre normalizado (se conserva la más antigua) y reasigna sus relaciones.
  //   3. Vincula cada registro sin `personaId` válido: busca una persona con su nombre; si no hay, la crea (con el color del registro).
  //   4. Iguala las copias de nombre/color a las de su persona.
  // Lo que no se puede decidir solo (dos registros de una relación `unica` para la misma persona) NO se toca: queda en `revision`.
  function reconciliar(d) {
    const est = _d(d), cambios = [];
    if (!Array.isArray(est.personas)) est.personas = [];

    // 1. ids únicos y entradas válidas
    const vistosId = new Set();
    est.personas = est.personas.filter(p => {
      if (!p || typeof p !== 'object' || !p.id || vistosId.has(p.id)) { cambios.push({ tipo: 'persona-descartada', id: p && p.id }); return false; }
      vistosId.add(p.id);
      return true;
    });

    // 2. fusionar nombres iguales (la más antigua gana; a igual fecha, la que estaba primero)
    const porNombre = new Map();
    est.personas.forEach((p, i) => {
      const k = norm(p.nombre);
      if (!porNombre.has(k)) { porNombre.set(k, []); }
      porNombre.get(k).push({ p, i });
    });
    const reemplazo = new Map();
    porNombre.forEach(grupo => {
      if (grupo.length < 2) return;
      grupo.sort((a, b) => String(a.p.creadoEn || '9999').localeCompare(String(b.p.creadoEn || '9999')) || a.i - b.i);
      const ganadora = grupo[0].p;
      grupo.slice(1).forEach(({ p }) => {
        reemplazo.set(p.id, ganadora.id);
        ['alias', 'notas'].forEach(campo => { if (!ganadora[campo] && p[campo]) ganadora[campo] = p[campo]; });
        cambios.push({ tipo: 'fusion', conservada: ganadora.id, eliminada: p.id, nombre: ganadora.nombre });
      });
    });
    if (reemplazo.size) {
      est.personas = est.personas.filter(p => !reemplazo.has(p.id));
      _relaciones.forEach(rel => rel.coleccion(est).forEach(r => { if (r && reemplazo.has(r.personaId)) r.personaId = reemplazo.get(r.personaId); }));
    }

    // 3. vincular huérfanos
    _relaciones.forEach(rel => rel.coleccion(est).forEach(r => {
      if (!r || typeof r !== 'object') return;
      if (r.personaId && obtener(r.personaId, est)) return;
      const n = String(r.nombre || '').replace(/\s+/g, ' ').trim() || SIN_NOMBRE;
      let p = buscarPorNombre(n, est);
      if (!p) {
        p = { id: uid(), nombre: n, color: r.color || COLOR_DEFECTO, creadoEn: hoy() };
        est.personas.push(p);
        cambios.push({ tipo: 'persona-creada', id: p.id, nombre: n, relacion: rel.id });
      }
      cambios.push({ tipo: 'vinculo', relacion: rel.id, id: r.id, personaId: p.id });
      r.personaId = p.id;
    }));

    // 4. copias iguales a su persona
    est.personas.forEach(p => { if (_sincronizarCopias(est, p)) cambios.push({ tipo: 'copia-igualada', personaId: p.id }); });

    const revision = verificar(est).filter(v => v.regla === 'I4');
    return { cambios, revision };
  }

  return { COLOR_DEFECTO, norm, registrarRelacion, relaciones, lista, obtener, nombre, color, buscarPorNombre, crear, editar, huerfanos, verificar, reconciliar };
})();
if (typeof window !== 'undefined') window.Personas = Personas; // los tests lo leen como ctx.Personas
