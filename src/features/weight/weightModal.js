/**
 * weightModal.js — Modal para registrar o editar mediciones de peso corporal
 */
import { getState, refreshState, beginAsyncOperation, endAsyncOperation } from '../../app/state.js';
import { makeId, todayISO, validDate } from '../../utils/dates.js';
import { calculateMifflinStJeor } from '../../utils/energy.js';
import { saveWeightEntry } from '../../services/database/weightRepo.js';
import { setSetting } from '../../services/database/settingsRepo.js';
import { openModal, closeModal } from '../../components/Modal.js';
import { toast } from '../../components/Toast.js';

const $ = sel => document.querySelector(sel);

let editingWeightId = null;
let isSaving = false;

export function openWeightDialog(weightItem = null) {
  editingWeightId = weightItem?.id || null;

  const form = $('#weight-form');
  if (form) form.reset();

  const title = $('#weight-dialog-title');
  if (title) title.textContent = weightItem ? 'Editar peso' : 'Registrar peso';

  const dateInput = $('#w-date-input');
  const valInput = $('#w-val-input');
  const noteInput = $('#w-note-input');

  if (dateInput) dateInput.value = weightItem ? weightItem.date : todayISO();
  if (valInput) valInput.value = weightItem ? weightItem.weight : '';
  if (noteInput) noteInput.value = weightItem ? (weightItem.note || '') : '';

  const dialog = $('#weight-dialog');
  if (dialog) openModal(dialog);
}

export function closeWeightDialog() {
  const dialog = $('#weight-dialog');
  if (dialog) closeModal(dialog);
}

async function handleSaveWeightEntry(event) {
  event.preventDefault();
  if (isSaving) return;
  const date = $('#w-date-input')?.value;
  const weight = Number($('#w-val-input')?.value);
  const note = $('#w-note-input')?.value.trim() || '';

  if (!validDate(date)) {
    toast('Fecha inválida');
    return;
  }
  if (!Number.isFinite(weight) || weight < 20 || weight > 400) {
    toast('Introduce un peso válido entre 20 y 400 kg');
    return;
  }

  const { weightEntries, settings } = getState();
  const existingSameDate = weightEntries.find(w => w.date === date && w.id !== editingWeightId);
  const targetId = editingWeightId || (existingSameDate ? existingSameDate.id : makeId());

  const entry = {
    id: targetId,
    date,
    weight,
    note,
    createdAt: existingSameDate?.createdAt || new Date().toISOString()
  };

  isSaving = true;
  beginAsyncOperation('save-weight');
  try {
    await saveWeightEntry(entry);
    closeWeightDialog();

    // Comprobar si es la medición más reciente para recalcular mantenimiento
    const updatedWeights = weightEntries.filter(w => w.id !== targetId).concat(entry);
    const sorted = updatedWeights.slice().sort((a, b) => a.date.localeCompare(b.date));
    const isLatest = (sorted[sorted.length - 1].id === targetId);

    if (isLatest && settings.calcProfile) {
      try {
        const prof = { ...settings.calcProfile };
        const newResult = calculateMifflinStJeor({
          weightKg: weight,
          heightCm: prof.height,
          ageYears: prof.age,
          physiologicalParam: prof.param,
          activityMultiplier: Number(prof.activity)
        });

        prof.weight = weight;
        prof.updatedAt = new Date().toISOString();
        const updatedResultData = {
          ...newResult,
          weight,
          height: prof.height,
          age: prof.age,
          date: todayISO()
        };

        await setSetting('calcProfile', prof);
        await setSetting('calcResult', updatedResultData);

        if (settings.goal > 0 && Math.abs(settings.goal - updatedResultData.tdee) >= 20) {
          const pending = {
            oldGoal: settings.goal,
            newTdee: updatedResultData.tdee,
            newWeight: weight
          };
          await setSetting('pendingGoalReview', pending);
        }
      } catch (errCalc) {
        console.warn('No se pudo recalcular automáticamente el gasto:', errCalc);
      }
    }

    await refreshState();
    toast(existingSameDate && !editingWeightId ? 'Medición de esta fecha actualizada' : 'Peso guardado');
  } catch (err) {
    console.error(err);
    toast('Error al guardar el peso');
  } finally {
    isSaving = false;
    endAsyncOperation('save-weight');
  }
}

/**
 * Inicializa los escuchadores del modal de peso
 */
export function initWeightModalListeners() {
  const form = $('#weight-form');
  if (form) form.addEventListener('submit', handleSaveWeightEntry);

  const btnClose = $('#btn-close-weight-dialog');
  if (btnClose) btnClose.addEventListener('click', closeWeightDialog);
}
