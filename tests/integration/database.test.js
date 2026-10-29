/**
 * database.test.js — Pruebas de integración para repositorios y mutaciones de datos
 */
import assert from 'node:assert/strict';
import { getState, setState, subscribe } from '../../src/app/state.js';

console.log('--- Probando integración del almacén de estado reactivo y repositorios ---');

// 1. Estado inicial
const initial = getState();
assert(Array.isArray(initial.entries));
assert(Array.isArray(initial.foods));
assert(Array.isArray(initial.weightEntries));
assert(typeof initial.settings === 'object');
console.log('[PASS] Estructura inicial del estado reactivo correcta');

// 2. Suscripción y notificación reactiva
let notified = false;
let observedState = null;
const unsubscribe = subscribe(st => {
  notified = true;
  observedState = st;
});

setState({ currentDate: '2026-10-30' });
assert.equal(notified, true);
assert.equal(observedState.currentDate, '2026-10-30');
assert.equal(getState().currentDate, '2026-10-30');
console.log('[PASS] Patrón Observer del estado reactivo funciona correctamente');

unsubscribe();
notified = false;
setState({ currentDate: '2026-10-31' });
assert.equal(notified, false);
console.log('[PASS] Desuscripción limpia observadores sin fugas de memoria');
