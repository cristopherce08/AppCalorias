/**
 * entriesRepo.js — Repositorio de persistencia para el diario de comidas
 */
import { getAll, getByIndex, mutate } from './db.js';

export async function getEntries() {
  return getAll('entries');
}

export async function getEntriesByDate(date) {
  return getByIndex('entries', 'date', date);
}

export async function saveEntry(entry) {
  return mutate('entries', 'put', entry);
}

export async function deleteEntry(id) {
  return mutate('entries', 'delete', id);
}
