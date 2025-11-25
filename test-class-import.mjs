/**
 * Test ECIESService class import
 */

import { ECIESService, createRuntimeConfiguration, GuidV4Provider } from '@digitaldefiance/ecies-lib';

console.log('=== Checking ECIESService class ===');
console.log('ECIESService:', typeof ECIESService);
console.log('ECIESService.prototype:', ECIESService.prototype);
console.log('ECIESService.prototype.constants:', Object.getOwnPropertyDescriptor(ECIESService.prototype, 'constants'));

console.log('\n=== Checking all prototype properties ===');
const protoProps = Object.getOwnPropertyNames(ECIESService.prototype);
console.log('Prototype properties:', protoProps);

console.log('\n=== Checking for getters ===');
protoProps.forEach(prop => {
  const descriptor = Object.getOwnPropertyDescriptor(ECIESService.prototype, prop);
  if (descriptor?.get) {
    console.log(`  ${prop}: has getter`);
  }
});

console.log('\n=== Creating instance and checking ===');
const config = createRuntimeConfiguration({ idProvider: new GuidV4Provider() });
const service = new ECIESService(config);

console.log('Instance has constants property:', 'constants' in service);
console.log('Instance.constants:', service.constants !== undefined ? 'exists' : 'UNDEFINED');

// Check if it's an own property vs prototype property
console.log('\nIs constants an own property?', Object.hasOwnProperty.call(service, 'constants'));
console.log('Is constants in prototype?', 'constants' in ECIESService.prototype);

// Try to find where constants is defined
console.log('\nSearching prototype chain:');
let obj = service;
let level = 0;
while (obj) {
  const descriptor = Object.getOwnPropertyDescriptor(obj, 'constants');
  if (descriptor) {
    console.log(`  Found at level ${level}:`, descriptor.get ? 'getter' : 'property');
    break;
  }
  obj = Object.getPrototypeOf(obj);
  level++;
  if (level > 10) break;
}
