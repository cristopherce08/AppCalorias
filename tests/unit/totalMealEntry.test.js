/**
 * totalMealEntry.test.js — Pruebas unitarias para el registro de total directo por comida
 * Valida la funcionalidad de registrar calorías y proteínas totales de una comida
 * sin necesidad de desglosar ingrediente por ingrediente.
 */
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { computeNutrition, convertTotalToPer100, sumKcal, sumProtein, MEALS } from '../../src/utils/nutrition.js';
import { makeId } from '../../src/utils/dates.js';
import { setDatabaseNameForTesting, closeDatabase } from '../../src/services/database/db.js';
import { saveEntry, getEntriesByDate, deleteEntry } from '../../src/services/database/entriesRepo.js';

console.log('--- Probando funcionalidad "Total directo por comida (sin ingredientes)" ---');

setDatabaseNameForTesting(`test-meal-total-${Date.now()}`);

// 1. Registro directo con nombre personalizado, calorías y proteínas
const mealEntry1 = {
  id: makeId(),
  date: '2026-11-08',
  meal: 'almuerzo',
  name: 'Menú ejecutivo con pollo a la plancha',
  brand: '',
  baseType: 'total_consumed',
  amount: 1,
  unit: 'comida',
  totalKcal: 720,
  totalProtein: 48,
  kcal: 720,
  protein: 48,
  createdAt: new Date().toISOString()
};

const nutrition1 = computeNutrition(mealEntry1);
assert.equal(nutrition1.kcal, 720, 'Las calorías calculadas deben ser 720 kcal');
assert.equal(nutrition1.protein, 48, 'Las proteínas calculadas deben ser 48 g');
console.log('[PASS 1/7] Cálculo nutricional directo de comida completa con proteínas exacto');

// 2. Registro directo sin proteínas especificadas (opcional)
const mealEntry2 = {
  id: makeId(),
  date: '2026-11-08',
  meal: 'snack',
  name: 'Snack de la tarde',
  brand: '',
  baseType: 'total_consumed',
  amount: 1,
  unit: 'comida',
  totalKcal: 250,
  totalProtein: null,
  kcal: 250,
  protein: null,
  createdAt: new Date().toISOString()
};

const nutrition2 = computeNutrition(mealEntry2);
assert.equal(nutrition2.kcal, 250, 'Las calorías calculadas deben ser 250 kcal');
assert.equal(nutrition2.protein, null, 'Proteínas no especificadas deben ser null');
console.log('[PASS 2/7] Comida completa sin proteínas asigna null correctamente');

// 3. Fallback de nombre predeterminado si el usuario no escribe uno
const defaultMealObj = MEALS.find(m => m.id === 'cena') || MEALS[0];
const userProvidedName = '';
const resolvedName = userProvidedName.trim() || defaultMealObj.title;
assert.equal(resolvedName, 'Cena', 'El nombre debe tomar por defecto el título de la comida');
console.log('[PASS 3/7] Asignación por defecto al título de la comida cuando el campo está vacío');

// 4. Persistencia íntegra en IndexedDB
await saveEntry(mealEntry1);
await saveEntry(mealEntry2);

const savedEntries = await getEntriesByDate('2026-11-08');
assert.equal(savedEntries.length, 2, 'Deben existir 2 entradas guardadas en la fecha');

const savedAlmuerzo = savedEntries.find(e => e.meal === 'almuerzo');
assert.ok(savedAlmuerzo, 'La entrada de almuerzo debe existir en la base de datos');
assert.equal(savedAlmuerzo.name, 'Menú ejecutivo con pollo a la plancha');
assert.equal(savedAlmuerzo.totalKcal, 720);
assert.equal(savedAlmuerzo.totalProtein, 48);
assert.equal(savedAlmuerzo.baseType, 'total_consumed');
assert.equal(savedAlmuerzo.unit, 'comida');
console.log('[PASS 4/7] Persistencia y recuperación íntegra en IndexedDB verificada');

// 5. Agregación total del día combinando comidas completas
const dayKcal = sumKcal(savedEntries);
const dayProtein = sumProtein(savedEntries);
assert.equal(dayKcal, 970, 'La suma total de calorías debe ser 720 + 250 = 970 kcal');
assert.equal(dayProtein.total, 48, 'La suma conocida de proteínas debe ser 48 g');
assert.equal(dayProtein.isPartial, true, 'Debe indicar que las proteínas son parciales debido al snack sin proteínas');
console.log('[PASS 5/7] Métricas agregadas del día con totales directos calculadas correctamente');

// 6. Edición de un registro directo por comida
savedAlmuerzo.totalKcal = 780;
savedAlmuerzo.totalProtein = 52;
savedAlmuerzo.kcal = 780;
savedAlmuerzo.protein = 52;
await saveEntry(savedAlmuerzo);

const updatedEntries = await getEntriesByDate('2026-11-08');
const updatedAlmuerzo = updatedEntries.find(e => e.meal === 'almuerzo');
assert.equal(updatedAlmuerzo.totalKcal, 780);
assert.equal(updatedAlmuerzo.totalProtein, 52);
assert.equal(sumKcal(updatedEntries), 1030);
console.log('[PASS 6/7] Actualización atómica de calorías y proteínas de comida verificada');

// 7. Eliminación limpia del registro
await deleteEntry(savedAlmuerzo.id);
await deleteEntry(mealEntry2.id);
const finalEntries = await getEntriesByDate('2026-11-08');
assert.equal(finalEntries.length, 0, 'No deben quedar entradas tras la eliminación');
console.log('[PASS 7/7] Eliminación de registros de comida directa completada');

await closeDatabase();
console.log('\n✔ TODAS LAS 7 PRUEBAS DE REGISTRO DIRECTO POR COMIDA PASARON SATISFACTORIAMENTE');
