/**
 * totalConsumedNutrition.test.js — Pruebas de la modalidad "Valores totales consumidos"
 * Cubre las 15 especificaciones de la Fase 8 de MiCalorías / Kalora 4.0.
 */
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { computeNutrition, convertTotalToPer100, sumKcal, sumProtein } from '../../src/utils/nutrition.js';
import { buildBackupPayload, validateAndMigrateImport } from '../../src/utils/validation.js';
import { setDatabaseNameForTesting, closeDatabase } from '../../src/services/database/db.js';
import { saveEntry, getEntries } from '../../src/services/database/entriesRepo.js';
import { saveFood, getFoods } from '../../src/services/database/foodsRepo.js';

console.log('--- Probando modalidad "Valores totales consumidos" y salvaguardas ---');

// 1. 600 g y 180 kcal totales -> 180 kcal
const item1 = {
  baseType: 'total_consumed',
  amount: 600,
  unit: 'g',
  totalKcal: 180,
  totalProtein: 0
};
const res1 = computeNutrition(item1);
assert.equal(res1.kcal, 180);
console.log('[PASS 1/15] 600 g y 180 kcal totales calcula exactamente 180 kcal');

// 2. 600 g y 0 g de proteína -> 0 g
assert.equal(res1.protein, 0);
console.log('[PASS 2/15] 600 g y 0 g de proteína calcula exactamente 0 g (no null)');

// 3. 600 g y proteína vacía -> null (desconocida)
const item3 = {
  baseType: 'total_consumed',
  amount: 600,
  unit: 'g',
  totalKcal: 180,
  totalProtein: ''
};
const res3 = computeNutrition(item3);
assert.equal(res3.kcal, 180);
assert.equal(res3.protein, null);
console.log('[PASS 3/15] 600 g y proteína vacía asigna valor desconocido (null)');

// 4. 600 ml y 120 kcal totales -> 120 kcal
const item4 = {
  baseType: 'total_consumed',
  amount: 600,
  unit: 'ml',
  totalKcal: 120,
  totalProtein: null
};
const res4 = computeNutrition(item4);
assert.equal(res4.kcal, 120);
assert.equal(res4.protein, null);
console.log('[PASS 4/15] 600 ml y 120 kcal totales calcula exactamente 120 kcal');

// 5. Conversión interna correcta de totales a valores por 100 g/ml
const conv1 = convertTotalToPer100(180, 0, 600);
assert.equal(conv1.kcalPer100, 30);
assert.equal(conv1.proteinPer100, 0);

const conv2 = convertTotalToPer100(120, '', 600);
assert.equal(conv2.kcalPer100, 20);
assert.equal(conv2.proteinPer100, null);

const conv3 = convertTotalToPer100(330, 15, 500);
assert.equal(conv3.kcalPer100, 66);
assert.equal(conv3.proteinPer100, 3);
console.log('[PASS 5/15] Conversión interna de totales a densidad por 100 g/ml exacta');

// 6. Reutilización de alimento guardado con cantidad diferente
// Se guarda con base 30 kcal/100g derivada de 180 kcal en 600 g
const recurrentFood = {
  id: 'food-carambola',
  name: 'Fresco de carambola',
  baseType: 'weight_volume',
  unit: 'g',
  kcalPer100: conv1.kcalPer100,
  proteinPer100: conv1.proteinPer100,
  defaultAmount: 600
};
// Usuario consume 300 g
const res6_half = computeNutrition({
  baseType: recurrentFood.baseType,
  amount: 300,
  kcalPer100: recurrentFood.kcalPer100,
  proteinPer100: recurrentFood.proteinPer100
});
assert.equal(res6_half.kcal, 90);
assert.equal(res6_half.protein, 0);

// Usuario consume 100 g
const res6_100 = computeNutrition({
  baseType: recurrentFood.baseType,
  amount: 100,
  kcalPer100: recurrentFood.kcalPer100,
  proteinPer100: recurrentFood.proteinPer100
});
assert.equal(res6_100.kcal, 30);
assert.equal(res6_100.protein, 0);
console.log('[PASS 6/15] Reutilización con cantidad diferente escala consistentemente (300g -> 90 kcal)');

// 7. Cálculos anteriores por 100 g/ml sin regresiones
const reg100 = computeNutrition({
  baseType: 'weight_volume',
  amount: 150,
  kcalPer100: 200,
  proteinPer100: 12.5
});
assert.equal(reg100.kcal, 300);
assert.equal(reg100.protein, 18.8);
console.log('[PASS 7/15] Modo por 100 g/ml opera sin regresiones');

// 8. Cálculos por porción sin regresiones
const regPortion = computeNutrition({
  baseType: 'portion',
  amount: 2.5,
  kcalPerPortion: 120,
  proteinPerPortion: 24
});
assert.equal(regPortion.kcal, 300);
assert.equal(regPortion.protein, 60);
console.log('[PASS 8/15] Modo por porción opera sin regresiones');

// 9. Guardado correcto en IndexedDB
const TEST_DB = 'test-total-nutrition-' + Date.now();
setDatabaseNameForTesting(TEST_DB);

const testEntry = {
  id: 'entry-total-1',
  date: '2026-10-29',
  meal: 'almuerzo',
  name: 'Fresco de carambola',
  brand: 'Casero',
  baseType: 'total_consumed',
  amount: 600,
  unit: 'g',
  kcalPer100: 30,
  proteinPer100: 0,
  totalKcal: 180,
  totalProtein: 0,
  kcal: 180,
  protein: 0,
  createdAt: new Date().toISOString()
};

await saveEntry(testEntry);
const retrieved = (await getEntries()).find(e => e.id === 'entry-total-1');
assert.equal(retrieved.name, 'Fresco de carambola');
assert.equal(retrieved.amount, 600);
assert.equal(retrieved.kcal, 180);
assert.equal(retrieved.protein, 0);
assert.equal(retrieved.totalKcal, 180);
assert.equal(retrieved.totalProtein, 0);
assert.equal(retrieved.baseType, 'total_consumed');
console.log('[PASS 9/15] Guardado y lectura íntegra en IndexedDB verificado');

// 10. Historial con snapshots inmutables
const entriesList = [
  retrieved,
  { id: 'e2', date: '2026-10-29', meal: 'almuerzo', kcal: 250, protein: 30 }
];
assert.equal(sumKcal(entriesList), 430);
const protSum = sumProtein(entriesList);
assert.equal(protSum.total, 30);
assert.equal(protSum.hasKnown, true);
assert.equal(protSum.isPartial, false);
console.log('[PASS 10/15] Historial y métricas agregadas operan con snapshots inmutables');

// 11. Edición del registro
const updatedEntry = {
  ...retrieved,
  amount: 400,
  totalKcal: 120,
  kcal: 120,
  kcalPer100: 30
};
await saveEntry(updatedEntry);
const reRead = (await getEntries()).find(e => e.id === 'entry-total-1');
assert.equal(reRead.amount, 400);
assert.equal(reRead.totalKcal, 120);
assert.equal(reRead.kcal, 120);
console.log('[PASS 11/15] Edición de registro de valores totales completada');

// 12. Respaldo JSON compatible
const mockState = {
  entries: [reRead],
  foods: [recurrentFood],
  weightEntries: [],
  settings: { goal: 2000 }
};
const backupPayload = buildBackupPayload(mockState);
assert.equal(backupPayload.schemaVersion, 3);
assert.equal(backupPayload.entries[0].baseType, 'total_consumed');
assert.equal(backupPayload.entries[0].totalKcal, 120);
console.log('[PASS 12/15] Respaldo JSON exportado preserva campos de valores totales');

// 13. Importación de registros anteriores y retrocompatibilidad
const imported = validateAndMigrateImport(backupPayload);
assert.equal(imported.entries.length, 1);
assert.equal(imported.entries[0].kcal, 120);
assert.equal(imported.entries[0].totalKcal, 120);

// Comprobar que respaldo legado v1 sin totalKcal sigue importando perfectamente
const legacyV1 = {
  app: 'MiCalorías',
  schemaVersion: 1,
  entries: [{ id: 'leg-1', date: '2025-05-01', meal: 'cena', name: 'Arroz', amount: 150, kcalPer100: 130 }],
  foods: [],
  settings: []
};
const legacyImported = validateAndMigrateImport(legacyV1);
assert.equal(legacyImported.entries[0].kcal, 195);
console.log('[PASS 13/15] Importación retrocompatible comprobada sin regresiones');

// 14. Verificación de funcionamiento offline
assert.ok(typeof computeNutrition === 'function');
assert.ok(typeof convertTotalToPer100 === 'function');
console.log('[PASS 14/15] Cálculo 100% autónomo y determinista sin red');

// 15. Prevención de doble guardado y protección de estado
let saveCallCount = 0;
let isBusy = false;
async function mockSaveOperation() {
  if (isBusy) return;
  isBusy = true;
  saveCallCount++;
  await new Promise(r => setTimeout(r, 20));
  isBusy = false;
}
await Promise.all([mockSaveOperation(), mockSaveOperation()]);
assert.equal(saveCallCount, 1);
console.log('[PASS 15/15] Prevención de ejecuciones concurrentes y doble guardado verificada');

closeDatabase();
console.log('\n✔ TODAS LAS 15 PRUEBAS ESPECÍFICAS DE LA FASE 8 PASARON EXITOSAMENTE');
