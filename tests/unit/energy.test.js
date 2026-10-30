/**
 * energy.test.js — Pruebas unitarias para fórmulas energéticas y estadísticas de peso
 */
import assert from 'node:assert/strict';
import { calculateMifflinStJeor, calculateScenarios, computeWeightStats, getSortedWeightEntries } from '../../src/utils/energy.js';

console.log('--- Probando cálculo de gasto energético (Mifflin-St Jeor) ---');

// 1. Hombre: 80 kg, 180 cm, 30 años, factor 1.20 (sedentario)
// RMR = 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780 kcal
// TDEE = 1780 * 1.20 = 2136 kcal
const maleCalc = calculateMifflinStJeor({
  weightKg: 80,
  heightCm: 180,
  ageYears: 30,
  physiologicalParam: 'male',
  activityMultiplier: 1.20
});

assert.equal(maleCalc.rmr, 1780);
assert.equal(maleCalc.tdee, 2136);
assert.equal(maleCalc.isRange, false);
console.log('[PASS] Mifflin-St Jeor con parámetro masculino correcto');

// 2. Mujer: 60 kg, 165 cm, 28 años, factor 1.55 (moderado)
// RMR = 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25 -> 1330 kcal
// TDEE = 1330.25 * 1.55 = 2061.8875 -> 2062 kcal
const femaleCalc = calculateMifflinStJeor({
  weightKg: 60,
  heightCm: 165,
  ageYears: 28,
  physiologicalParam: 'female',
  activityMultiplier: 1.55
});

assert.equal(femaleCalc.rmr, 1330);
assert.equal(femaleCalc.tdee, 2062);
assert.equal(femaleCalc.isRange, false);
console.log('[PASS] Mifflin-St Jeor con parámetro femenino correcto');

// 3. Sin parámetro específico: debe devolver rango
const rangeCalc = calculateMifflinStJeor({
  weightKg: 70,
  heightCm: 170,
  ageYears: 35,
  physiologicalParam: 'neutral',
  activityMultiplier: 1.375
});
assert.equal(rangeCalc.isRange, true);
assert(rangeCalc.rmrMin < rangeCalc.rmrMax);
assert(rangeCalc.tdeeMin < rangeCalc.tdeeMax);
console.log('[PASS] Cálculo neutral genera rango válido');

// 4. Escenarios orientativos
const scen = calculateScenarios(2200);
assert.equal(scen.maintain, 2200);
assert.equal(scen.loss, 1850); // deficit de 350 kcal
assert.equal(scen.gain, 2550); // superavit de 350 kcal
console.log('[PASS] Escenarios orientativos calculados correctamente');

// 5. Estadísticas de peso
const weights = [
  { id: 'w1', date: '2026-10-01', weight: 82.5 },
  { id: 'w2', date: '2026-10-08', weight: 81.8 },
  { id: 'w3', date: '2026-10-15', weight: 81.2 }
];

const sortedW = getSortedWeightEntries(weights);
assert.equal(sortedW[0].date, '2026-10-01');
assert.equal(sortedW[2].date, '2026-10-15');

const stats = computeWeightStats(weights);
assert.equal(stats.latest.weight, 81.2);
assert.equal(stats.recentDiff, -0.6); // 81.2 - 81.8 = -0.6
assert.equal(stats.totalDiff, -1.3);  // 81.2 - 82.5 = -1.3

// 6. Estadísticas con 2 decimales
const weights2Decimals = [
  { id: 'w10', date: '2026-10-01', weight: 74.85 },
  { id: 'w11', date: '2026-10-08', weight: 74.50 },
  { id: 'w12', date: '2026-10-15', weight: 74.35 }
];
const stats2 = computeWeightStats(weights2Decimals);
assert.equal(stats2.latest.weight, 74.35);
assert.equal(stats2.recentDiff, -0.15); // 74.35 - 74.50 = -0.15
assert.equal(stats2.totalDiff, -0.5);   // 74.35 - 74.85 = -0.5
console.log('[PASS] Estadísticas de evolución de peso con 2 decimales correctas');
console.log('[PASS] Estadísticas de evolución de peso correctas');
