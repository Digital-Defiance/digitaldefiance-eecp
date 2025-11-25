/**
 * Test for dual package hazard
 */

// Import ECIESService two different ways
import { ECIESService as ESMImport } from '@digitaldefiance/ecies-lib';

// Simulate what happens in compiled code - it might be loading CJS version
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ECIESService: CJSImport } = require('@digitaldefiance/ecies-lib');

console.log('=== Dual Package Hazard Test ===');
console.log('ESM ECIESService:', ESMImport.name);
console.log('CJS ECIESService:', CJSImport.name);
console.log('Are they the same class?', ESMImport === CJSImport);

console.log('\n=== Check what our compiled code uses ===');
import { eciesService } from './packages/eecp-crypto/dist/lib/ecies-config.js';
console.log('Compiled service constructor === ESM?', eciesService.constructor === ESMImport);
console.log('Compiled service constructor === CJS?', eciesService.constructor === CJSImport);

console.log('\n=== Check prototype ===');
console.log('ESM prototype has constants getter?', Object.getOwnPropertyDescriptor(ESMImport.prototype, 'constants') !== undefined);
console.log('CJS prototype has constants getter?', Object.getOwnPropertyDescriptor(CJSImport.prototype, 'constants') !== undefined);
console.log('Compiled service prototype has constants getter?', Object.getOwnPropertyDescriptor(Object.getPrototypeOf(eciesService), 'constants') !== undefined);

console.log('\n=== The Problem ===');
console.log('The compiled code creates an ECIESService instance at module load time.');
console.log('This instance might be using a different version of the class than what we import later.');
console.log('Result: The prototype chain is broken, getters don\'t work.');
