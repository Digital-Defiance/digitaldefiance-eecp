import { TextEncoder, TextDecoder } from 'util';

// Polyfill TextEncoder/TextDecoder for jsdom
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// Polyfill structuredClone for older Node.js versions
if (typeof global.structuredClone === 'undefined') {
  // Use native Node.js structuredClone if available (Node 17+)
  // Otherwise, use a simple fallback
  global.structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
}

// Polyfill crypto.getRandomValues for jsdom
if (!global.crypto) {
  const crypto = require('crypto');
  global.crypto = {
    getRandomValues: (buffer: Uint8Array) => {
      return crypto.randomFillSync(buffer);
    },
  } as any;
}

// Import fake-indexeddb after setting up other polyfills
import 'fake-indexeddb/auto';
