/**
 * database.test.js — Pruebas de integración sobre transacciones y repositorios IndexedDB (v3.0)
 * Ejecuta operaciones reales de IndexedDB en entorno aislado (fake-indexeddb) sin tocar datos reales.
 */
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { openDatabase, closeDatabase, setDatabaseNameForTesting, getAll, mutate, importTransaction, DB_VERSION } from '../../src/services/database/db.js';
import { getEntries, getEntriesByDate, saveEntry, deleteEntry } from '../../src/services/database/entriesRepo.js';
import { getFoods, saveFood, deleteFood } from '../../src/services/database/foodsRepo.js';
import { getWeightEntries, getWeightEntriesByDate, saveWeightEntry, deleteWeightEntry } from '../../src/services/database/weightRepo.js';
import { getSettings, getSettingsRaw, setSetting, removeSetting } from '../../src/services/database/settingsRepo.js';
import { getState, setState, subscribe, refreshState } from '../../src/app/state.js';

console.log('--- Probando integración real de IndexedDB en base aislada de pruebas ---');

const TEST_DB = 'micalorias-test-isolated-v3';
setDatabaseNameForTesting(TEST_DB);

// 1. Apertura y verificación de esquema v3
const db = await openDatabase();
assert.equal(db.version, DB_VERSION);
assert.equal(db.objectStoreNames.contains('entries'), true);
assert.equal(db.objectStoreNames.contains('foods'), true);
assert.equal(db.objectStoreNames.contains('settings'), true);
assert.equal(db.objectStoreNames.contains('weightEntries'), true);
console.log('[PASS 1/16] Esquema IndexedDB v3 y almacenes de objetos verificados');

// 2. Creación y lectura de comidas (entries)
const testEntry = {
  id: 'entry-test-1',
  date: '2026-10-29',
  meal: 'desayuno',
  name: 'Avena con proteína',
  brand: 'Quaker',
  baseType: 'weight_volume',
  amount: 60,
  unit: 'g',
  kcalPer100: 380,
  proteinPer100: 25,
  kcal: 228,
  protein: 15,
  createdAt: new Date().toISOString()
};
await saveEntry(testEntry);
const allEntries = await getEntries();
assert.equal(allEntries.length, 1);
assert.equal(allEntries[0].name, 'Avena con proteína');
assert.equal(allEntries[0].kcal, 228);
assert.equal(allEntries[0].protein, 15);
console.log('[PASS 2/16] Creación y lectura en almacén "entries" exitosa');

// 3. Actualización de comida existente
const updatedEntry = { ...testEntry, amount: 80, kcal: 304, protein: 20 };
await saveEntry(updatedEntry);
const entriesAfterUpdate = await getEntries();
assert.equal(entriesAfterUpdate.length, 1);
assert.equal(entriesAfterUpdate[0].amount, 80);
assert.equal(entriesAfterUpdate[0].kcal, 304);
console.log('[PASS 3/16] Actualización atómica de registro en "entries"');

// 4. Búsqueda por índice "date"
const entriesByDate = await getEntriesByDate('2026-10-29');
assert.equal(entriesByDate.length, 1);
assert.equal(entriesByDate[0].id, 'entry-test-1');
const emptyDate = await getEntriesByDate('2026-10-01');
assert.equal(emptyDate.length, 0);
console.log('[PASS 4/16] Búsqueda por índice "date" en "entries" correcta');

// 5. Eliminación de comida
await deleteEntry('entry-test-1');
const entriesAfterDelete = await getEntries();
assert.equal(entriesAfterDelete.length, 0);
console.log('[PASS 5/16] Eliminación en "entries" completada');

// 6. Persistencia de alimentos recurrentes y favoritos (foods)
const testFood = {
  id: 'food-test-1',
  name: 'Proteína Whey',
  brand: 'Optimum',
  baseType: 'portion',
  unit: 'g',
  portionUnit: 'scoop',
  portionGrams: 30,
  kcalPerPortion: 120,
  proteinPerPortion: 24,
  defaultAmount: 1,
  favorite: true,
  updatedAt: new Date().toISOString()
};
await saveFood(testFood);
let allFoods = await getFoods();
assert.equal(allFoods.length, 1);
assert.equal(allFoods[0].favorite, true);

// Alternar favorito a false
testFood.favorite = false;
await saveFood(testFood);
allFoods = await getFoods();
assert.equal(allFoods[0].favorite, false);
console.log('[PASS 6/16] Persistencia de alimentos y estado de favoritos en "foods"');

// 7. Conservación de snapshots nutricionales
assert.equal(allFoods[0].kcalPerPortion, 120);
assert.equal(allFoods[0].proteinPerPortion, 24);
assert.equal(allFoods[0].portionGrams, 30);
console.log('[PASS 7/16] Conservación exacta de snapshots nutricionales');

// 8. Eliminación de alimento
await deleteFood('food-test-1');
allFoods = await getFoods();
assert.equal(allFoods.length, 0);
console.log('[PASS 8/16] Eliminación en almacén "foods" verificada');

// 9. Persistencia de configuración (settings)
await setSetting('goal', 2300);
await setSetting('proteinGoal', 150);
await setSetting('calcProfile', { weight: 81.5, height: 180, age: 30, activity: '1.55' });

const settingsObj = await getSettings();
assert.equal(settingsObj.goal, 2300);
assert.equal(settingsObj.proteinGoal, 150);
assert.equal(settingsObj.calcProfile.weight, 81.5);

await removeSetting('proteinGoal');
const settingsAfterRemove = await getSettings();
assert.equal(settingsAfterRemove.proteinGoal, undefined);
console.log('[PASS 9/16] Persistencia, lectura y eliminación de pares clave-valor en "settings"');

// 10. Persistencia de pesajes corporales y búsqueda por fecha (weightEntries)
const testWeight1 = { id: 'w-1', date: '2026-10-15', weight: 82.0, note: 'Ayunas', createdAt: new Date().toISOString() };
const testWeight2 = { id: 'w-2', date: '2026-10-22', weight: 81.3, note: 'Post-entreno', createdAt: new Date().toISOString() };
await saveWeightEntry(testWeight1);
await saveWeightEntry(testWeight2);

const weights = await getWeightEntries();
assert.equal(weights.length, 2);

const weightOn15 = await getWeightEntriesByDate('2026-10-15');
assert.equal(weightOn15.length, 1);
assert.equal(weightOn15[0].weight, 82.0);

await deleteWeightEntry('w-1');
const weightsAfterDel = await getWeightEntries();
assert.equal(weightsAfterDel.length, 1);
assert.equal(weightsAfterDel[0].id, 'w-2');
console.log('[PASS 10/16] Persistencia, búsqueda y borrado en "weightEntries"');

// 11. Transacción atómica de importación de respaldo
const importData = {
  entries: [
    { id: 'imp-e1', date: '2026-10-29', meal: 'almuerzo', name: 'Pollo', amount: 150, unit: 'g', kcal: 240, protein: 45 }
  ],
  foods: [
    { id: 'imp-f1', name: 'Arroz', unit: 'g', kcalPer100: 130, proteinPer100: 2.7, defaultAmount: 100 }
  ],
  settings: [
    { key: 'goal', value: 2100 }
  ],
  weightEntries: [
    { id: 'imp-w1', date: '2026-10-28', weight: 80.9, note: 'Balanza digital' }
  ]
};
await importTransaction(importData);

const impEntries = await getEntries();
const impFoods = await getFoods();
const impSettings = await getSettings();
const impWeights = await getWeightEntries();

assert.equal(impEntries.length, 1);
assert.equal(impEntries[0].id, 'imp-e1');
assert.equal(impFoods.length, 1);
assert.equal(impSettings.goal, 2100);
assert.equal(impWeights.length, 1);
assert.equal(impWeights[0].weight, 80.9);
console.log('[PASS 11/16] Transacción atómica de importación atómica (clear + put)');

// 12. Operaciones concurrentes
const concurrentPromises = [
  saveEntry({ id: 'c-1', date: '2026-10-29', meal: 'cena', name: 'Huevo', amount: 2, unit: 'unidad', kcal: 140, protein: 12 }),
  saveEntry({ id: 'c-2', date: '2026-10-29', meal: 'cena', name: 'Pan', amount: 1, unit: 'rebanada', kcal: 80, protein: 3 }),
  saveEntry({ id: 'c-3', date: '2026-10-29', meal: 'snack', name: 'Manzana', amount: 1, unit: 'unidad', kcal: 70, protein: 0 })
];
await Promise.all(concurrentPromises);
const entriesAfterConcurrent = await getEntries();
assert.equal(entriesAfterConcurrent.length, 4); // 1 de importación + 3 concurrentes
console.log('[PASS 12/16] Operaciones concurrentes completadas sin bloqueos de transacción');

// 13. Manejo de errores en mutaciones inválidas
await assert.rejects(
  async () => mutate('tabla_inexistente', 'put', { id: 'err-1' }),
  /NotFoundError|Error guardando|Operación cancelada/i
);
console.log('[PASS 13/16] Manejo de errores en operaciones inválidas');

// 14. Integración y reactividad con state.js
await refreshState();
const globalState = getState();
assert.equal(globalState.entries.length, 4);
assert.equal(globalState.foods.length, 1);
assert.equal(globalState.weightEntries.length, 1);
assert.equal(globalState.settings.goal, 2100);

let stateNotified = false;
const unsub = subscribe(() => { stateNotified = true; });
setState({ currentDate: '2026-10-31' });
assert.equal(stateNotified, true);
unsub();
console.log('[PASS 14/16] Sincronización reactiva entre IndexedDB y el almacén central (state.js)');

// 15. Preservación de datos tras cierre y reapertura de la base de datos
closeDatabase();
const reopenedDb = await openDatabase(TEST_DB);
const preservedEntries = await getAll('entries');
const preservedFoods = await getAll('foods');
const preservedSettings = await getSettings();
const preservedWeights = await getAll('weightEntries');

assert.equal(preservedEntries.length, 4);
assert.equal(preservedFoods.length, 1);
assert.equal(preservedSettings.goal, 2100);
assert.equal(preservedWeights.length, 1);
assert.equal(reopenedDb.version, 3);
console.log('[PASS 15/16] Cierre y reapertura conserva 100% de registros en el esquema v3');

// 16. Limpieza limpia de base de prueba aislada
closeDatabase();
setDatabaseNameForTesting(null); // Restaurar DB_NAME por defecto
console.log('[PASS 16/16] Base de datos de prueba cerrada y entorno restaurado limpiamente');
console.log('\n✔ TODAS LAS 16 PRUEBAS DE INTEGRACIÓN DE INDEXEDDB PASARON SATISFACTORIAMENTE');
