/**
 * Minimal test case to debug ecies-lib constants issue
 */

import { 
  createRuntimeConfiguration,
  GuidV4Provider, 
  ECIESService,
  Member,
  MemberType,
  EmailString
} from '@digitaldefiance/ecies-lib';

console.log('=== Test 1: Direct inline creation ===');
const config1 = createRuntimeConfiguration({ idProvider: new GuidV4Provider() });
const service1 = new ECIESService(config1);
console.log('Config MEMBER_ID_LENGTH:', config1.MEMBER_ID_LENGTH);
console.log('Service has constants:', service1.constants !== undefined);
console.log('Service.constants.MEMBER_ID_LENGTH:', service1.constants?.MEMBER_ID_LENGTH);
console.log('Service.constants.idProvider:', service1.constants?.idProvider?.constructor.name);

const result1 = await Member.newMember(service1, MemberType.User, 'Test1', new EmailString('test1@example.com'));
console.log('Member ID length:', result1.member.id.length);
result1.member.dispose();

console.log('\n=== Test 2: Module-level export simulation ===');
// Simulate what happens in ecies-config.ts
export const eciesConfig = createRuntimeConfiguration({ idProvider: new GuidV4Provider() });
export const eciesService = new ECIESService(eciesConfig);

console.log('Exported config MEMBER_ID_LENGTH:', eciesConfig.MEMBER_ID_LENGTH);
console.log('Exported service has constants:', eciesService.constants !== undefined);
console.log('Exported service.constants.MEMBER_ID_LENGTH:', eciesService.constants?.MEMBER_ID_LENGTH);
console.log('Exported service.constants.idProvider:', eciesService.constants?.idProvider?.constructor.name);

const result2 = await Member.newMember(eciesService, MemberType.User, 'Test2', new EmailString('test2@example.com'));
console.log('Member ID length:', result2.member.id.length);
result2.member.dispose();

console.log('\n=== Test 3: Check internal state ===');
console.log('service1._constants:', service1._constants !== undefined);
console.log('eciesService._constants:', eciesService._constants !== undefined);

// Try to access private field
console.log('\nDirect _constants access:');
console.log('service1._constants.MEMBER_ID_LENGTH:', service1._constants?.MEMBER_ID_LENGTH);
console.log('eciesService._constants.MEMBER_ID_LENGTH:', eciesService._constants?.MEMBER_ID_LENGTH);

console.log('\n=== Test 4: Check if it\'s a getter issue ===');
const constantsGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(eciesService), 'constants');
console.log('constants getter exists:', constantsGetter !== undefined);
console.log('constants getter:', constantsGetter?.get?.toString());
