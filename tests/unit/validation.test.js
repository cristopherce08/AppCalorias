/**
 * validation.test.js — Pruebas unitarias para exportación e importación de respaldos v1, v2 y v3
 */
import assert from 'node:assert/strict';
import { validateAndMigrateImport, buildBackupPayload, getBackupFilename } from '../../src/utils/validation.js';

console.log('--- Probando validación y migración de respaldos ---');

// 1. Generación de nombre de archivo
const filename = getBackupFilename(new Date('2026-10-29T10:30:00'));
assert.equal(filename, 'Kalora_Respaldo_2026-10-29_10-30.json');
console.log('[PASS] Nombre de respaldo determinista');

// 2. Construcción de payload
const mockState = {
  entries: [{ id: 'e1', name: 'Avena', amount: 50, date: '2026-10-29', meal: 'desayuno' }],
  foods: [{ id: 'f1', name: 'Avena', unit: 'g' }],
  weightEntries: [{ id: 'w1', date: '2026-10-29', weight: 80 }],
  settings: { goal: 2000, proteinGoal: 140 }
};
const payload = buildBackupPayload(mockState);
assert.equal(payload.app, 'Kalora');
assert.equal(payload.schemaVersion, 3);
assert.equal(payload.entries.length, 1);
assert.equal(payload.foods.length, 1);
assert.equal(payload.weightEntries.length, 1);
assert.equal(payload.settings.length, 2);
console.log('[PASS] Construcción de payload de respaldo v3 válida');

// 3. Migración desde v1 (sin proteínas ni peso)
const v1Backup = {
  app: 'MiCalorías',
  schemaVersion: 1,
  exportedAt: '2025-01-01T00:00:00.000Z',
  entries: [
    { id: 'v1-1', date: '2025-01-01', meal: 'desayuno', name: 'Manzana', amount: 100, kcalPer100: 52 }
  ],
  foods: [
    { id: 'f1-1', name: 'Manzana', kcalPer100: 52, defaultAmount: 100 }
  ],
  settings: [
    { key: 'goal', value: 1800 }
  ]
};

const migratedV1 = validateAndMigrateImport(v1Backup);
assert.equal(migratedV1.entries.length, 1);
assert.equal(migratedV1.entries[0].protein, null);
assert.equal(migratedV1.entries[0].kcal, 52);
assert.equal(migratedV1.weightEntries.length, 0);
console.log('[PASS] Migración de respaldo v1 completada con retrocompatibilidad');

// 4. Migración desde v2 (con proteínas pero sin peso)
const v2Backup = {
  app: 'MiCalorías',
  schemaVersion: 2,
  exportedAt: '2025-06-01T00:00:00.000Z',
  entries: [
    { id: 'v2-1', date: '2025-06-01', meal: 'almuerzo', name: 'Pechuga de pollo', amount: 150, kcalPer100: 165, proteinPer100: 31 }
  ],
  foods: [
    { id: 'f2-1', name: 'Pechuga de pollo', kcalPer100: 165, proteinPer100: 31, defaultAmount: 150 }
  ],
  settings: [
    { key: 'goal', value: 2200 },
    { key: 'proteinGoal', value: 150 }
  ]
};

const migratedV2 = validateAndMigrateImport(v2Backup);
assert.equal(migratedV2.entries.length, 1);
assert.equal(migratedV2.entries[0].kcal, 247.5);
assert.equal(migratedV2.entries[0].protein, 46.5);
assert.equal(migratedV2.weightEntries.length, 0);
console.log('[PASS] Migración de respaldo v2 completada con nutrición exacta');

// 5. Rechazo de archivos corruptos o ilegítimos
assert.throws(() => validateAndMigrateImport(null), /El archivo no es un respaldo compatible/);
assert.throws(() => validateAndMigrateImport({ app: 'OtraApp', schemaVersion: 3 }), /El archivo no es un respaldo compatible/);
console.log('[PASS] Archivos malformados o ajenos son rechazados con seguridad');
