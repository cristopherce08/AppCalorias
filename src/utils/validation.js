/**
 * validation.js — Validaciones de integridad, migración y verificación de esquemas de respaldo (v1, v2, v3)
 */
import { validDate } from './dates.js';
import { computeNutrition } from './nutrition.js';

export const VALID_MEALS = ['desayuno', 'almuerzo', 'cena', 'snack'];

/**
 * Valida y normaliza un objeto importado de respaldo en conformidad con el esquema 3.0
 * Soporta retrocompatibilidad con esquemas 1 y 2.
 * @param {Object} json 
 * @returns {{ entries: Array, foods: Array, weightEntries: Array, settings: Array }}
 */
export function validateAndMigrateImport(json) {
  if (!json || json.app !== 'MiCalorías' || ![1, 2, 3].includes(json.schemaVersion) || !Array.isArray(json.entries) || !Array.isArray(json.foods) || !Array.isArray(json.settings)) {
    throw new Error('El archivo no es un respaldo compatible de MiCalorías');
  }

  if (json.entries.length > 200000 || json.foods.length > 20000 || json.settings.length > 100) {
    throw new Error('El archivo contiene demasiados registros');
  }

  const migratedEntries = [];
  const migratedFoods = [];
  const migratedWeights = [];
  const seenEntries = new Set();
  const seenFoods = new Set();
  const seenWeights = new Set();

  for (const e of json.entries) {
    if (!e || typeof e.id !== 'string' || e.id.length > 150 || !validDate(e.date) || !VALID_MEALS.includes(e.meal) || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 120 || !Number.isFinite(e.amount) || e.amount <= 0 || seenEntries.has(e.id)) {
      throw new Error(`Entrada inválida en el respaldo: ${e?.name || 'sin nombre'}`);
    }
    seenEntries.add(e.id);

    const baseType = e.baseType || 'weight_volume';
    const computed = computeNutrition({
      amount: e.amount,
      baseType,
      kcalPer100: e.kcalPer100 ?? null,
      proteinPer100: e.proteinPer100 ?? null,
      kcalPerPortion: e.kcalPerPortion ?? null,
      proteinPerPortion: e.proteinPerPortion ?? null
    });

    migratedEntries.push({
      id: e.id,
      date: e.date,
      meal: e.meal,
      name: e.name,
      brand: e.brand || '',
      baseType,
      amount: e.amount,
      unit: e.unit || 'g',
      portionGrams: e.portionGrams || null,
      kcalPer100: e.kcalPer100 ?? null,
      proteinPer100: e.proteinPer100 ?? null,
      kcalPerPortion: e.kcalPerPortion ?? null,
      proteinPerPortion: e.proteinPerPortion ?? null,
      kcal: (Number.isFinite(e.kcal)) ? e.kcal : computed.kcal,
      protein: (e.protein !== undefined && e.protein !== null) ? e.protein : computed.protein,
      createdAt: e.createdAt || new Date().toISOString()
    });
  }

  for (const f of json.foods) {
    if (!f || typeof f.id !== 'string' || f.id.length > 150 || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 120 || seenFoods.has(f.id)) {
      throw new Error(`Alimento inválido en el respaldo: ${f?.name || 'sin nombre'}`);
    }
    seenFoods.add(f.id);

    migratedFoods.push({
      id: f.id,
      name: f.name,
      brand: f.brand || '',
      baseType: f.baseType || 'weight_volume',
      unit: f.unit || 'g',
      portionUnit: f.portionUnit || '',
      portionGrams: f.portionGrams || null,
      kcalPer100: f.kcalPer100 ?? null,
      proteinPer100: f.proteinPer100 ?? null,
      kcalPerPortion: f.kcalPerPortion ?? null,
      proteinPerPortion: f.proteinPerPortion ?? null,
      defaultAmount: f.defaultAmount || 1,
      favorite: Boolean(f.favorite),
      updatedAt: f.updatedAt || new Date().toISOString()
    });
  }

  if (Array.isArray(json.weightEntries)) {
    for (const w of json.weightEntries) {
      if (!w || typeof w.id !== 'string' || !validDate(w.date) || !Number.isFinite(w.weight) || w.weight <= 0 || seenWeights.has(w.id)) {
        continue;
      }
      seenWeights.add(w.id);
      migratedWeights.push({
        id: w.id,
        date: w.date,
        weight: Number(w.weight),
        note: w.note || '',
        createdAt: w.createdAt || new Date().toISOString()
      });
    }
  }

  const seenSettings = new Set();
  const migratedSettings = [];
  for (const s of json.settings) {
    if (!s || seenSettings.has(s.key)) continue;
    seenSettings.add(s.key);
    migratedSettings.push(s);
  }

  return {
    entries: migratedEntries,
    foods: migratedFoods,
    weightEntries: migratedWeights,
    settings: migratedSettings
  };
}

/**
 * Genera el nombre estandarizado de archivo de respaldo
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function getBackupFilename(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `MiCalorias_Respaldo_${y}-${m}-${d}_${hh}-${mm}.json`;
}

/**
 * Empaqueta las colecciones de datos en el formato oficial de respaldo v3.0
 */
export function buildBackupPayload({ entries = [], foods = [], settings = {}, weightEntries = [] }) {
  const settingsArray = Array.isArray(settings)
    ? settings
    : Object.entries(settings || {}).map(([key, value]) => ({ key, value }));

  return {
    app: 'MiCalorías',
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    entries,
    foods,
    weightEntries,
    settings: settingsArray
  };
}
