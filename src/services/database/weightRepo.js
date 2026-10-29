/**
 * weightRepo.js — Repositorio de registros de peso corporal
 */
import { getAll, mutate } from './db.js';

export async function getWeightEntries() {
  return getAll('weightEntries');
}

export async function saveWeightEntry(item) {
  return mutate('weightEntries', 'put', item);
}

export async function deleteWeightEntry(id) {
  return mutate('weightEntries', 'delete', id);
}
