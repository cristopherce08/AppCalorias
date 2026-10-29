/**
 * version.js — Centralización de constantes de versión y denominación del sistema
 * Distingue explícitamente:
 * 1. Versión de la aplicación (4.0).
 * 2. Versión del esquema IndexedDB (3, inmutable para conservar datos históricos).
 * 3. Versión de caché del Service Worker (micalorias-shell-v4.0).
 */

export const APP_VERSION = '4.0';
export const APP_NAME = 'MiCalorías';
export const APP_DISPLAY_VERSION = 'MiCalorías 4.0';
export const DB_SCHEMA_VERSION = 3;
export const SW_CACHE_NAME = 'micalorias-shell-v4.0.1';
