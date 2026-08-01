// Validación de estructura al importar un backup JSON (_validarEstructuraJSON,
// override de leerArchivoImport) — extraído de index.html. Debe cargar DESPUÉS
// de js/modules/configuracion.js (depende de leerArchivoImport ya definida).
// Ver auditoria-tecnica.md #2.

function _validarEstructuraJSON(data) {
  const errores = [];
  if (typeof data !== 'object' || Array.isArray(data)) {
    return ['El archivo no tiene el formato esperado (debe ser un objeto JSON).'];
  }
  // Verificar campos clave
  const camposOpcionales = ['nuRate', 'cajitas', 'nequiSaldo', 'efectivoSaldo',
    'deudores', 'gastosFijos', 'gastosVar', 'modulos'];
  const tieneAlgunCampo = camposOpcionales.some(c => c in data);
  if (!tieneAlgunCampo) {
    errores.push('El archivo no parece ser un backup de Mis Finanzas (no se encontraron campos conocidos).');
  }
  // Verificar tipos básicos
  if ('cajitas' in data && !Array.isArray(data.cajitas)) {
    errores.push('El campo "cajitas" debe ser un array.');
  }
  if ('gastosVar' in data && !Array.isArray(data.gastosVar)) {
    errores.push('El campo "gastosVar" debe ser un array.');
  }
  if ('deudores' in data && !Array.isArray(data.deudores)) {
    errores.push('El campo "deudores" debe ser un array.');
  }
  if ('nuRate' in data && typeof data.nuRate !== 'number') {
    errores.push('El campo "nuRate" debe ser un número.');
  }
  return errores;
}

// Override leerArchivoImport with validated version
const _origLeerArchivoImport = leerArchivoImport;
leerArchivoImport = async function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      // MEJORA 5: Validate structure before replacing
      const errores = _validarEstructuraJSON(data);
      if (errores.length > 0) {
        toast('Archivo inválido: ' + errores[0], 'err');
        setTimeout(() => {
          if (errores.length > 1) toast(errores.slice(1).join(' · '), 'err');
        }, 1200);
        e.target.value = '';
        return;
      }
      const ok = await dialogo('Importar datos',
        '¿Reemplazar todos los datos actuales con el archivo importado? Esta acción no se puede deshacer.',
        'Importar', true);
      if (!ok) return;
      // Reemplazar CONTENIDO de S sin romper la referencia de window.S
      Object.keys(S).forEach(k => delete S[k]);
      Object.assign(S, data);
      // Marcar timestamp ANTES del debounce de guardado para que cualquier
      // snapshot entrante de Firestore no pise los datos recién importados.
      const importTs = Date.now();
      window._lastSavedAt = importTs;
      try { localStorage.setItem('mf_lastSavedAt', String(importTs)); } catch(_){}
      // Bloquear snapshots de Firestore mientras se guarda en la nube.
      // El debounce de save() tarda 1.5s; bloqueamos 5s por seguridad.
      window._importing = true;
      setTimeout(() => { window._importing = false; }, 5000);
      // Usar _fbSaveToCloud() en lugar de save() para guardar window.S
      // directamente sin leer del DOM (que aún muestra valores viejos).
      if(window._fbSaveToCloud) window._fbSaveToCloud();
      // Recargar cuando el debounce de 1.5s + escritura en Firestore hayan terminado.
      setTimeout(() => { location.reload(); }, 4000);
      toast('Datos importados correctamente — recargando…', 'ok');
    } catch(err) {
      if (err instanceof SyntaxError) {
        toast('El archivo no es un JSON válido', 'err');
      } else {
        toast('Error al procesar el archivo: ' + err.message, 'err');
      }
    }
    e.target.value = '';
  };
  reader.readAsText(file);
};
