/**
 * weightRepo.js — Repositorio de persistencia para el seguimiento de peso corporal
 */
import { getAll, getByIndex, mutate } from './db.js';

export async function getWeightEntries() {
  return getAll('weightEntries');
}

export async function getWeightEntriesByDate(date) {
  return getByIndex('weightEntries', 'date', date);
}

export async function saveWeightEntry(weightItem) {
  return mutate('weightEntries', 'put', weightItem);
}

export async function deleteWeightEntry(id) {
  return mutate('weightEntries', 'delete', id);
}
