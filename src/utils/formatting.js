/**
 * formatting.js — Utilidades puras de formateo numérico y escape seguro de texto
 */

export const numberFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/**
 * Formatea un número según las convenciones numéricas de la app
 * @param {number|string} val 
 * @returns {string}
 */
export function fmt(val) {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) return '0';
  return numberFormat.format(Number(val));
}

/**
 * Escapa cadenas de texto para evitar inyecciones XSS en el DOM
 * @param {string|null|undefined} text 
 * @returns {string}
 */
export function esc(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
