/**
 * @module utils
 * @description Shared utility functions used across multiple modules.
 */

/**
 * Async sleep — pauses execution for the given duration.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format a number as $X,XXX.XX currency string.
 * @param {number} n - The amount to format
 * @returns {string}
 */
export function fmt(n) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Schedule DOM element removal after a delay.
 * Safely checks parentNode before removing.
 * @param {HTMLElement} el - Element to remove
 * @param {number} ms - Delay in milliseconds
 */
export function scheduleRemove(el, ms) {
  setTimeout(() => { if (el.parentNode) el.remove(); }, ms);
}
