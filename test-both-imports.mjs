/**
 * Compare direct import vs compiled import
 */

import { ECIESService as DirectECIESService, createRuntimeConfiguration, GuidV4Provider } from '@digitaldefiance/ecies-lib';
import { eciesService as CompiledService } from './packages/eecp-crypto/dist/lib/ecies-config.js';

console.log('=== Direct Import ===');
const config = createRuntimeConfiguration({ idProvider: new GuidV4Provider() });
const directService = new DirectECIESService(config);
console.log('Direct service.constants:', directService.constants !== undefined ? 'exists' : 'UNDEFINED');
console.log('Direct service.constants.MEMBER_ID_LENGTH:', directService.constants?.MEMBER_ID_LENGTH);
console.log('Direct service constructor:', directService.constructor.name);
console.log('Direct service prototype:', Object.getPrototypeOf(directService).constructor.name);

console.log('\n=== Compiled Import ===');
console.log('Compiled service.constants:', CompiledService.constants !== undefined ? 'exists' : 'UNDEFINED');
console.log('Compiled service.constants.MEMBER_ID_LENGTH:', CompiledService.constants?.MEMBER_ID_LENGTH);
console.log('Compiled service constructor:', CompiledService.constructor.name);
console.log('Compiled service prototype:', Object.getPrototypeOf(CompiledService).constructor.name);

console.log('\n=== Comparison ===');
console.log('Same constructor?', directService.constructor === CompiledService.constructor);
console.log('Same prototype?', Object.getPrototypeOf(directService) === Object.getPrototypeOf(CompiledService));

console.log('\n=== Check if CompiledService is actually an ECIESService ===');
console.log('CompiledService instanceof DirectECIESService:', CompiledService instanceof DirectECIESService);

console.log('\n=== Check prototype chain ===');
console.log('Direct service prototype chain:');
let obj = directService;
let level = 0;
while (obj && level < 5) {
  console.log(`  Level ${level}:`, obj.constructor?.name || 'Object');
  obj = Object.getPrototypeOf(obj);
  level++;
}

console.log('\nCompiled service prototype chain:');
obj = CompiledService;
level = 0;
while (obj && level < 5) {
  console.log(`  Level ${level}:`, obj.constructor?.name || 'Object');
  obj = Object.getPrototypeOf(obj);
  level++;
}
