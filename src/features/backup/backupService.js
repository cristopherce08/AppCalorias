/**
 * backupService.js — Servicio determinista de respaldo: exportación e importación segura
 * Soluciona la doble descarga y garantiza compatibilidad con esquemas v1, v2 y v3.
 */
import { getState, setState, refreshState } from '../../app/state.js';
import { navigateTo } from '../../app/router.js';
import { todayISO } from '../../utils/dates.js';
import { buildBackupPayload, getBackupFilename, validateAndMigrateImport } from '../../utils/validation.js';
import { importTransaction } from '../../services/database/db.js';
import { toast } from '../../components/Toast.js';

const $ = sel => document.querySelector(sel);

let isExporting = false;

/**
 * Exporta un respaldo JSON con salvaguardas estrictas contra pulsaciones rápidas y duplicación
 * @param {Event} [event] 
 */
export async function exportBackup(event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  if (isExporting) return;
  isExporting = true;

  const exportBtn = $('#btn-export');
  const originalText = exportBtn ? exportBtn.textContent : '';

  try {
    if (exportBtn) {
      exportBtn.disabled = true;
      exportBtn.setAttribute('aria-busy', 'true');
      exportBtn.textContent = 'Preparando respaldo...';
    }

    const state = getState();
    const payload = buildBackupPayload(state);
    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const filename = getBackupFilename();

    // Detección de entorno iOS en modo PWA instalada (standalone)
    const isIOSStandalone = (
      (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true) ||
      (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches && /iphone|ipad|ipod/i.test(navigator.userAgent || ''))
    );

    // En iOS PWA standalone se recurre a Web Share API de forma estrictamente terminal
    if (isIOSStandalone && typeof navigator.share === 'function') {
      try {
        const file = new File([blob], filename, { type: 'application/json' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Respaldo de MiCalorías'
          });
          toast('Respaldo listo para guardar en Archivos');
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
          return;
        }
        console.warn('No se pudo compartir archivo en PWA standalone:', err);
        toast('No se pudo compartir el archivo de respaldo');
        return;
      }
    }

    // Descarga única determinista en navegador
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1500);

    toast('Copia de seguridad descargada');
  } catch (err) {
    console.error('Error al exportar datos:', err);
    toast('No se pudo exportar el respaldo');
  } finally {
    // Ventana de seguridad (600ms) contra rebotes táctiles
    setTimeout(() => {
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.removeAttribute('aria-busy');
        exportBtn.textContent = originalText;
      }
      isExporting = false;
    }, 600);
  }
}

/**
 * Procesa e importa un archivo JSON de respaldo de forma atómica
 * @param {File} file 
 */
export async function importBackup(file) {
  if (!file) return;

  try {
    if (file.size > 50_000_000) {
      throw new Error('El archivo supera los 50 MB permitidos');
    }

    const text = await file.text();
    const parsed = JSON.parse(text);
    const migrated = validateAndMigrateImport(parsed);

    const versionNote = parsed.schemaVersion < 3 ? ` (migrado desde v${parsed.schemaVersion}.0)` : '';
    const confirmation = confirm(`Este respaldo contiene:\n- ${migrated.entries.length} comidas registradas\n- ${migrated.foods.length} alimentos en biblioteca\n- ${migrated.weightEntries.length} mediciones de peso${versionNote}\n\n¿Sustituir TODOS los datos actuales en este iPhone? Esta acción no se puede deshacer.`);

    if (!confirmation) return;

    await importTransaction(migrated);
    setState({ currentDate: todayISO() });
    await refreshState();
    navigateTo('diario');
    toast('Respaldo importado correctamente');
  } catch (err) {
    console.error('Error al importar respaldo:', err);
    alert(`No se importó el respaldo: ${err.message || 'formato inválido'}`);
  }
}
