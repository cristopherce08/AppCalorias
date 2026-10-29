import assert from 'node:assert';
import { fmt, esc } from '../../src/utils/formatting.js';
import { todayISO, validDate, offsetDate } from '../../src/utils/dates.js';
import { computeNutrition, sumKcal, sumProtein } from '../../src/utils/nutrition.js';
import { calculateMifflinStJeor, calculateScenarios, computeWeightStats } from '../../src/utils/energy.js';
import { validateAndMigrateImport, getBackupFilename, buildBackupPayload } from '../../src/utils/validation.js';

console.log('--- Probando utilidades puras del dominio ---');

// 1. Formatting
assert.strictEqual(fmt(1234.5), (new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 })).format(1234.5));
assert.strictEqual(fmt(0), '0');
assert.strictEqual(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

// 2. Dates
assert.strictEqual(validDate('2026-10-29'), true);
assert.strictEqual(validDate('2026-02-30'), false);
assert.strictEqual(validDate('invalid'), false);
assert.strictEqual(offsetDate('2026-10-29', 1), '2026-10-30');
assert.strictEqual(offsetDate('2026-10-29', -1), '2026-10-28');

// 3. Nutrition
const itemGram = { baseType: 'weight_volume', amount: 150, kcalPer100: 165, proteinPer100: 31 };
const resGram = computeNutrition(itemGram);
assert.strictEqual(resGram.kcal, 247.5);
assert.strictEqual(resGram.protein, 46.5);

const itemPortion = { baseType: 'portion', amount: 2, kcalPerPortion: 120, proteinPerPortion: 24 };
const resPortion = computeNutrition(itemPortion);
assert.strictEqual(resPortion.kcal, 240);
assert.strictEqual(resPortion.protein, 48);

const totalKcal = sumKcal([itemGram, itemPortion]);
assert.strictEqual(totalKcal, 487.5);

const protStats = sumProtein([itemGram, { ...itemPortion, proteinPerPortion: null }]);
assert.strictEqual(protStats.total, 46.5);
assert.strictEqual(protStats.isPartial, true);

// 4. Energy
const tdeeObj = calculateMifflinStJeor({ weightKg: 80, heightCm: 180, ageYears: 30, physiologicalParam: 'male', activityMultiplier: 1.55 });
assert.strictEqual(tdeeObj.tdee, 2759);
const scenarios = calculateScenarios(tdeeObj.tdee);
assert.strictEqual(scenarios.maintain, 2759);
assert.strictEqual(scenarios.loss, 2409);
assert.strictEqual(scenarios.gain, 3109);

const weights = [
  { id: '1', date: '2026-10-01', weight: 82.0 },
  { id: '2', date: '2026-10-08', weight: 81.2 },
  { id: '3', date: '2026-10-15', weight: 80.5 }
];
const weightStats = computeWeightStats(weights);
assert.strictEqual(weightStats.latest.weight, 80.5);
assert.strictEqual(weightStats.recentDiff, -0.7);
assert.strictEqual(weightStats.totalDiff, -1.5);

// 5. Validation & Backup
const payload = buildBackupPayload({ entries: [], foods: [], settings: [], weightEntries: [] });
assert.strictEqual(payload.schemaVersion, 3);
assert.strictEqual(payload.app, 'MiCalorías');
const migrated = validateAndMigrateImport(payload);
assert.strictEqual(Array.isArray(migrated.entries), true);

console.log('[PASS] Todas las pruebas de utilidades puras pasaron con éxito.');
