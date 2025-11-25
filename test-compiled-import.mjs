/**
 * Test importing from compiled TypeScript output
 */

import { eciesService, eciesConfig } from './packages/eecp-crypto/dist/lib/ecies-config.js';
import { Member, MemberType, EmailString } from '@digitaldefiance/ecies-lib';

console.log('=== Testing compiled TypeScript import ===');
console.log('eciesConfig.MEMBER_ID_LENGTH:', eciesConfig.MEMBER_ID_LENGTH);
console.log('eciesConfig.idProvider:', eciesConfig.idProvider?.constructor.name);

console.log('\neciesService.constants:', eciesService.constants !== undefined ? 'exists' : 'UNDEFINED');
console.log('eciesService.constants.MEMBER_ID_LENGTH:', eciesService.constants?.MEMBER_ID_LENGTH);
console.log('eciesService.constants.idProvider:', eciesService.constants?.idProvider?.constructor.name);

console.log('\nChecking internal state:');
console.log('eciesService._constants:', eciesService._constants !== undefined ? 'exists' : 'UNDEFINED');
console.log('eciesService._constants.MEMBER_ID_LENGTH:', eciesService._constants?.MEMBER_ID_LENGTH);

console.log('\nTesting Member creation:');
const result = await Member.newMember(eciesService, MemberType.User, 'Test', new EmailString('test@example.com'));
console.log('Member ID length:', result.member.id.length);
console.log('Member ID hex:', Buffer.from(result.member.id).toString('hex'));
result.member.dispose();

console.log('\n=== Checking getter ===');
const proto = Object.getPrototypeOf(eciesService);
const descriptor = Object.getOwnPropertyDescriptor(proto, 'constants');
console.log('Getter exists:', descriptor !== undefined);
console.log('Getter function:', descriptor?.get?.toString());

console.log('\n=== Calling getter directly ===');
if (descriptor?.get) {
  const constantsValue = descriptor.get.call(eciesService);
  console.log('Direct getter call result:', constantsValue !== undefined ? 'exists' : 'UNDEFINED');
  console.log('Direct getter MEMBER_ID_LENGTH:', constantsValue?.MEMBER_ID_LENGTH);
}
