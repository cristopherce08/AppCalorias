/**
 * settingsRepo.js — Repositorio de configuración y metas del usuario
 */
import { getAll, mutate } from './db.js';

export async function getSettings() {
  const list = await getAll('settings');
  return Object.fromEntries(list.map(s => [s.key, s.value]));
}

export async function getSettingsRaw() {
  return getAll('settings');
}

export async function setSetting(key, value) {
  return mutate('settings', 'put', { key, value });
}

export async function removeSetting(key) {
  return mutate('settings', 'delete', key);
}
