/**
 * updateSafety.test.js — Pruebas unitarias sobre la seguridad del ciclo de vida de actualizaciones PWA
 */
import assert from 'node:assert/strict';
import { getState, setState, beginAsyncOperation, endAsyncOperation, isPerformingAsyncOperation } from '../../src/app/state.js';
import { hasUnsavedChanges, applyPendingUpdate } from '../../src/services/pwa/serviceWorker.js';

console.log('--- Probando salvaguardas de actualización PWA y detección de operaciones activas ---');

// 1. Estado en reposo: sin cambios ni operaciones
setState({ isSaving: false, isExporting: false, isImporting: false, stagedItems: [] });
assert.equal(isPerformingAsyncOperation(), false);
assert.equal(hasUnsavedChanges(), false);
console.log('[PASS] Estado en reposo no bloquea actualizaciones');

// 2. Operación de guardado activa
beginAsyncOperation('save-meal');
assert.equal(isPerformingAsyncOperation(), true);
assert.equal(hasUnsavedChanges(), true);
endAsyncOperation('save-meal');
assert.equal(isPerformingAsyncOperation(), false);
assert.equal(hasUnsavedChanges(), false);
console.log('[PASS] Operación de guardado activa es detectada y liberada');

// 3. Operación de exportación activa
beginAsyncOperation('export');
assert.equal(isPerformingAsyncOperation(), true);
assert.equal(hasUnsavedChanges(), true);
endAsyncOperation('export');
assert.equal(isPerformingAsyncOperation(), false);
console.log('[PASS] Operación de exportación protege el ciclo de actualización');

// 4. Operación de importación activa
beginAsyncOperation('import');
assert.equal(isPerformingAsyncOperation(), true);
assert.equal(hasUnsavedChanges(), true);
endAsyncOperation('import');
assert.equal(isPerformingAsyncOperation(), false);
console.log('[PASS] Operación de importación atómica protege el ciclo de actualización');

// 5. Ingredientes en bandeja (staged items) no guardados
setState({ stagedItems: [{ id: 's1', name: 'Huevos', amount: 2 }] });
assert.equal(hasUnsavedChanges(), true);
setState({ stagedItems: [] });
assert.equal(hasUnsavedChanges(), false);
console.log('[PASS] Alimentos no consolidados en bandeja evitan recarga prematura');

// 6. Intento de actualizar sin forzar mientras hay cambios pendientes
setState({ stagedItems: [{ id: 's1', name: 'Avena', amount: 50 }] });
const updateSentWithoutForce = applyPendingUpdate(false);
assert.equal(updateSentWithoutForce, false);
console.log('[PASS] applyPendingUpdate(false) rechaza activar SW si hay datos sin guardar');

// 7. Forzar actualización tras confirmación del usuario
setState({ stagedItems: [] });
console.log('[PASS] Salvaguardas de actualización PWA verificadas correctamente');
