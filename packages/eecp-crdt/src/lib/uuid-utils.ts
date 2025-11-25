/**
 * Browser-compatible UUID generation utility
 * 
 * Provides a consistent UUID generation function that works in both
 * Node.js and browser environments.
 */

/**
 * Generate a UUID v4 string using browser-compatible crypto API
 * 
 * @returns {string} A UUID v4 string
 */
export function generateUUID(): string {
  // Use Web Crypto API if available (modern browsers and Node.js 19+)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for older environments
  // This follows the UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
