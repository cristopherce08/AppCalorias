/**
 * settingsView.js — Controlador de la vista de Ajustes y Configuración personal
 */
import { getState, refreshState } from '../../app/state.js';
import { navigateTo } from '../../app/router.js';
import { APP_DISPLAY_VERSION } from '../../utils/version.js';
import { setSetting } from '../../services/database/settingsRepo.js';
import { toast } from '../../components/Toast.js';
import { exportBackup, importBackup } from '../backup/backupService.js';

const $ = sel => document.querySelector(sel);

/**
 * Renderiza los valores de la vista de ajustes
 */
export function renderSettingsView() {
  const { settings } = getState();

  const goalInput = $('#goal-input');
  const protInput = $('#protein-goal-input');
  const versionLabel = $('#app-version-label');

  if (goalInput) goalInput.value = settings.goal ?? '';
  if (protInput) protInput.value = settings.proteinGoal ?? '';
  if (versionLabel) versionLabel.textContent = APP_DISPLAY_VERSION;

  checkStorageStatus();
}

export async function checkStorageStatus() {
  const statusEl = $('#storage-status');
  if (!statusEl) return;

  try {
    const protectedStorage = await navigator.storage?.persisted?.();
    statusEl.textContent = protectedStorage
      ? '✓ Almacenamiento persistente concedido en este iPhone'
      : 'Almacenamiento local activo (sin garantía de permanencia)';
  } catch {
    statusEl.textContent = 'Los datos están guardados localmente en tu iPhone';
  }
}

async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) {
      toast('Tu navegador no admite solicitar protección persistente');
      return;
    }
    const granted = await navigator.storage.persist();
    await checkStorageStatus();
    toast(granted ? 'Protección de almacenamiento concedida' : 'No se concedió protección; mantén respaldos periódicos');
  } catch {
    toast('No se pudo solicitar la protección');
  }
}

async function handleSaveGoals() {
  const rawKcal = $('#goal-input')?.value.trim() || '';
  const valKcal = rawKcal === '' ? null : Number(rawKcal);
  if (valKcal !== null && (!Number.isFinite(valKcal) || valKcal < 0 || valKcal > 20000)) {
    toast('Introduce una meta de calorías entre 0 y 20 000');
    return;
  }

  const rawProt = $('#protein-goal-input')?.value.trim() || '';
  const valProt = rawProt === '' ? null : Number(rawProt);
  if (valProt !== null && (!Number.isFinite(valProt) || valProt < 0 || valProt > 1000)) {
    toast('Introduce una meta de proteínas entre 0 y 1 000');
    return;
  }

  try {
    await setSetting('goal', valKcal);
    await setSetting('proteinGoal', valProt);
    await refreshState();
    toast('Metas guardadas');
  } catch (err) {
    console.error(err);
    toast('No se pudieron guardar las metas');
  }
}

/**
 * Inicializa los escuchadores para la vista de ajustes
 */
export function initSettingsListeners() {
  const btnSaveGoals = $('#btn-save-goals') || $('#btn-save-goal');
  if (btnSaveGoals) btnSaveGoals.addEventListener('click', handleSaveGoals);

  // Botones de valores rápidos de calorías
  document.querySelectorAll('.btn-quick-goal').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.val;
      const input = $('#goal-input');
      if (input && v !== undefined) input.value = v;
    });
  });

  // Botones de valores rápidos de proteínas
  document.querySelectorAll('.btn-quick-protein').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.val;
      const input = $('#protein-goal-input');
      if (input && v !== undefined) input.value = v;
    });
  });

  // Persistencia
  const btnPersist = $('#btn-persist');
  if (btnPersist) btnPersist.addEventListener('click', requestPersistence);

  // Búsqueda manual de actualizaciones PWA
  const btnCheckUpdate = $('#btn-check-update');
  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', async () => {
      btnCheckUpdate.disabled = true;
      const originalText = btnCheckUpdate.textContent;
      btnCheckUpdate.textContent = 'Comprobando en GitHub Pages...';
      try {
        if (!navigator.onLine) {
          toast('Sin conexión a internet');
          return;
        }
        const { checkForUpdates } = await import('../../services/pwa/serviceWorker.js');
        const res = await checkForUpdates(undefined, true);
        if (res?.status === 'found') {
          toast('Nueva versión detectada. Descargando...');
        } else {
          toast('Ya tienes la versión más reciente (Build 4.0.4)');
        }
      } catch (err) {
        toast('No se pudo comprobar la actualización');
      } finally {
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = originalText;
      }
    });
  }

  // Exportar respaldo
  const btnExport = $('#btn-export');
  if (btnExport) {
    btnExport.addEventListener('click', exportBackup);
  }

  // Importar respaldo
  const importInput = $('#import-file') || $('#file-import');
  if (importInput) {
    importInput.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) importBackup(file);
    });
  }

  const btnImportTrigger = $('#btn-import-trigger');
  if (btnImportTrigger && importInput) {
    btnImportTrigger.addEventListener('click', () => importInput.click());
  }

  // Atajos de navegación desde Ajustes
  const btnOpenCalc = $('#btn-open-calc') || $('#btn-goto-calc');
  if (btnOpenCalc) {
    btnOpenCalc.addEventListener('click', () => navigateTo('calculadora'));
  }

  const btnOpenPeso = $('#btn-goto-peso');
  if (btnOpenPeso) {
    btnOpenPeso.addEventListener('click', () => navigateTo('peso'));
  }

  const btnOpenHistory = $('#btn-open-history') || $('#btn-goto-historial');
  if (btnOpenHistory) {
    btnOpenHistory.addEventListener('click', () => navigateTo('historial'));
  }
}
