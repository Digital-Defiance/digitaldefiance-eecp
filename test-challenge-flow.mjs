/**
 * Test the challenge flow to debug authentication
 */

import { Member, MemberType, EmailString, GuidV4 } from '@digitaldefiance/ecies-lib';
import { ParticipantAuth, eciesService } from '@digitaldefiance-eecp/eecp-crypto';

async function test() {
  console.log('=== Testing Challenge Flow ===\n');

  const auth = new ParticipantAuth();

  // Create a member (like the client would)
  const result = await Member.newMember(
    eciesService,
    MemberType.User,
    'Test User',
    new EmailString('test@example.com')
  );
  const member = result.member;
  const participantId = GuidV4.fromBuffer(member.id);

  console.log('1. Created member');
  console.log('   Member ID:', Buffer.from(member.id).toString('hex'));
  console.log('   ParticipantId:', participantId.toString());
  console.log('   Public key length:', member.publicKey.length);

  // Server generates challenge
  const challenge = auth.generateChallenge();
  console.log('\n2. Server generated challenge');
  console.log('   Challenge length:', challenge.length);

  // Client generates proof
  const proof = auth.generateProof(participantId, member, challenge);
  console.log('\n3. Client generated proof');
  console.log('   Signature length:', proof.signature.length);
  console.log('   Timestamp:', proof.timestamp);

  // Server creates Member from public key (like ParticipantManager does)
  const publicKeyUint8 = new Uint8Array(member.publicKey);
  const participantIdUint8 = participantId.asUint8Array;
  
  const serverMember = new Member(
    eciesService,
    MemberType.User,
    'Participant',
    new EmailString('participant@eecp.local'),
    publicKeyUint8,
    undefined, // No private key
    undefined,
    participantIdUint8
  );

  console.log('\n4. Server created member from public key');
  console.log('   Server member ID:', Buffer.from(serverMember.id).toString('hex'));
  console.log('   Server member public key length:', serverMember.publicKey.length);
  console.log('   IDs match:', Buffer.from(member.id).equals(Buffer.from(serverMember.id)));

  // Server verifies proof
  const valid = auth.verifyProof(proof, serverMember, challenge, participantId);
  console.log('\n5. Server verified proof');
  console.log('   Valid:', valid);

  // Cleanup
  member.dispose();
  serverMember.dispose();

  if (!valid) {
    console.log('\n❌ FAILED: Proof verification failed');
    process.exit(1);
  } else {
    console.log('\n✅ SUCCESS: Challenge flow works correctly');
  }
}

test().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
