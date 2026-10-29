/**
 * state.js — Almacén reactivo de estado centralizado para la aplicación
 */
import { todayISO } from '../utils/dates.js';
import { getEntries } from '../services/database/entriesRepo.js';
import { getFoods } from '../services/database/foodsRepo.js';
import { getSettings } from '../services/database/settingsRepo.js';
import { getWeightEntries } from '../services/database/weightRepo.js';

let state = {
  entries: [],
  foods: [],
  settings: {},
  weightEntries: [],
  currentDate: todayISO(),
  currentView: 'diario',
  foodFilter: 'all',
  weightChartPeriod: '4w',
  stagedMeal: 'desayuno',
  stagedItems: [],
  selectedFoodForQuickAdd: null,
  activeFoodForDirectUse: null,
  editingEntryId: null,
  editingFoodId: null,
  editingWeightId: null,
  activeScenario: 'maintain',
  isSaving: false,
  isExporting: false
};

const listeners = new Set();

/**
 * Obtiene una copia de solo lectura del estado actual
 * @returns {typeof state}
 */
export function getState() {
  return state;
}

/**
 * Actualiza parcialmente el estado y notifica a los observadores
 * @param {Partial<typeof state>} updates 
 */
export function setState(updates) {
  state = { ...state, ...updates };
  notifyListeners();
}

/**
 * Suscribe un listener a cambios en el estado
 * @param {(state: typeof state) => void} fn 
 * @returns {() => void} Función para desuscribir
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (err) {
      console.error('Error en listener de estado:', err);
    }
  }
}

/**
 * Recarga todas las colecciones desde IndexedDB y sincroniza el estado
 */
export async function refreshState() {
  const [entries, foods, settings, weightEntries] = await Promise.all([
    getEntries(),
    getFoods(),
    getSettings(),
    getWeightEntries()
  ]);

  setState({
    entries: entries || [],
    foods: foods || [],
    settings: settings || {},
    weightEntries: weightEntries || []
  });
}
