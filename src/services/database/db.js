/**
 * db.js — Conexión y operaciones de bajo nivel con IndexedDB
 * Mantiene intacto el nombre 'micalorias-local-v1' y el esquema v3.
 */

export const DB_NAME = 'micalorias-local-v1';
export const DB_VERSION = 3;

let dbInstance = null;

/**
 * Abre o reutiliza la conexión activa a IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB no está disponible en este entorno'));
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) {
        const entryStore = db.createObjectStore('entries', { keyPath: 'id' });
        entryStore.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('foods')) {
        db.createObjectStore('foods', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('weightEntries')) {
        const weightStore = db.createObjectStore('weightEntries', { keyPath: 'id' });
        weightStore.createIndex('date', 'date', { unique: false });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña. Ciérrala para continuar.'));
  });
}

/**
 * Obtiene todos los registros de una tabla de IndexedDB
 * @param {'entries'|'foods'|'settings'|'weightEntries'} table 
 * @returns {Promise<Array>}
 */
export async function getAll(table) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, 'readonly');
    const req = tx.objectStore(table).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Ejecuta una mutación atómica en una tabla
 * @param {'entries'|'foods'|'settings'|'weightEntries'} table 
 * @param {'put'|'add'|'delete'} method 
 * @param {*} value 
 * @returns {Promise<void>}
 */
export async function mutate(table, method, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, 'readwrite');
    const store = tx.objectStore(table);
    store[method](value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Error guardando en el dispositivo'));
    tx.onabort = () => reject(tx.error || new Error('Operación cancelada'));
  });
}

/**
 * Reemplazo atómico de todas las colecciones al importar un respaldo
 * @param {{ entries: Array, foods: Array, settings: Array, weightEntries: Array }} data 
 * @returns {Promise<void>}
 */
export async function importTransaction(data) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['entries', 'foods', 'settings', 'weightEntries'], 'readwrite');
    for (const name of ['entries', 'foods', 'settings', 'weightEntries']) {
      tx.objectStore(name).clear();
    }
    for (const e of data.entries) tx.objectStore('entries').put(e);
    for (const f of data.foods) tx.objectStore('foods').put(f);
    for (const s of data.settings) tx.objectStore('settings').put(s);
    for (const w of data.weightEntries) tx.objectStore('weightEntries').put(w);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
