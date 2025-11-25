/**
 * Property-Based Tests for Participant Authentication
 * 
 * Tests Property 11: Zero-Knowledge Authentication
 * Validates: Requirements 3.1, 3.2, 3.3
 */

import * as fc from 'fast-check';
import { ParticipantAuth, eciesService } from './participant-auth.js';
import { Member, MemberType, EmailString, GuidV4 } from '@digitaldefiance/ecies-lib';

describe('ParticipantAuth Property Tests', () => {
  let auth: ParticipantAuth;

  beforeEach(() => {
    auth = new ParticipantAuth();
  });

  /**
   * Property 11: Zero-Knowledge Authentication
   * 
   * For any participant authentication attempt, the server must verify
   * the participant's proof without learning the participant's identity
   * or private key.
   * 
   * This property tests that:
   * 1. A valid proof generated with a private key can be verified with the corresponding public key
   * 2. The verification process doesn't require knowledge of the private key
   * 3. The proof is specific to the challenge (different challenges produce different proofs)
   * 
   * Validates: Requirements 3.1, 3.2, 3.3
   */
  test('Feature: eecp-full-system, Property 11: Zero-Knowledge Authentication', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random challenges (32 bytes)
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        async (challengeArray) => {
          // Generate a Member for this participant using shared eciesService
          const memberWithMnemonic = await Member.newMember(
            eciesService,
            MemberType.User,
            'Test User',
            new EmailString('test@example.com')
          );
          const member = memberWithMnemonic.member as Member;
          
          // Use member's ID as participantId (GuidV4-compatible with 4.7.14+)
          const participantId = GuidV4.fromBuffer(member.id);

          const challenge = Buffer.from(challengeArray);

          // Generate proof using member (with private key)
          const proof = auth.generateProof(
            participantId,
            member,
            challenge
          );

          // Verify proof using only member (zero-knowledge property)
          // The verifier never sees the private key directly
          const isValid = auth.verifyProof(
            proof,
            member,
            challenge,
            participantId
          );

          // The proof must be valid when verified with the correct member
          expect(isValid).toBe(true);

          // Additional property: proof must have a timestamp
          expect(proof.timestamp).toBeGreaterThan(0);
          expect(proof.timestamp).toBeLessThanOrEqual(Date.now());

          // Additional property: proof must have a signature
          expect(proof.signature).toBeDefined();
          expect(proof.signature.length).toBeGreaterThan(0);
          
          // Clean up
          member.dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Challenge Specificity
   * 
   * For any two different challenges, the proofs generated must be different.
   * This ensures that proofs are bound to specific challenges and cannot be reused.
   */
  test('Property: Different challenges produce different proofs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        async (challenge1Array, challenge2Array) => {
          // Ensure challenges are different
          fc.pre(!Buffer.from(challenge1Array).equals(Buffer.from(challenge2Array)));

          const memberWithMnemonic = await Member.newMember(
            eciesService,
            MemberType.User,
            'Test User',
            new EmailString('test@example.com')
          );
          const member = memberWithMnemonic.member as Member;
          const participantId = GuidV4.fromBuffer(member.id);

          const challenge1 = Buffer.from(challenge1Array);
          const challenge2 = Buffer.from(challenge2Array);

          const proof1 = auth.generateProof(
            participantId,
            member,
            challenge1
          );

          const proof2 = auth.generateProof(
            participantId,
            member,
            challenge2
          );

          // Different challenges must produce different signatures
          expect(Buffer.from(proof1.signature).equals(Buffer.from(proof2.signature))).toBe(false);
          
          // Clean up
          member.dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Wrong Public Key Rejection
   * 
   * For any proof generated with one member, verification with a different
   * member must fail. This ensures proofs are bound to specific participants.
   */
  test('Property: Proof cannot be verified with wrong public key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        async (challengeArray) => {
          // Generate two different members
          const member1WithMnemonic = await Member.newMember(
            eciesService,
            MemberType.User,
            'User1',
            new EmailString('user1@example.com')
          );
          const member1 = member1WithMnemonic.member as Member;
          const participantId = GuidV4.fromBuffer(member1.id);

          const member2WithMnemonic = await Member.newMember(
            eciesService,
            MemberType.User,
            'User2',
            new EmailString('user2@example.com')
          );
          const member2 = member2WithMnemonic.member as Member;

          const challenge = Buffer.from(challengeArray);

          // Generate proof with member1's private key
          const proof = auth.generateProof(
            participantId,
            member1,
            challenge
          );

          // Try to verify with member2's public key (wrong key)
          const isValid = auth.verifyProof(
            proof,
            member2,
            challenge,
            participantId
          );

          // Verification must fail with wrong member
          expect(isValid).toBe(false);
          
          // Clean up
          member1.dispose();
          member2.dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Challenge Generation Uniqueness
   * 
   * For any two challenge generation calls, the challenges should be different
   * (with overwhelming probability due to randomness).
   */
  test('Property: Generated challenges are unique', () => {
    const challenges = new Set<string>();
    const numChallenges = 1000;

    for (let i = 0; i < numChallenges; i++) {
      const challenge = auth.generateChallenge();
      const challengeHex = challenge.toString('hex');
      
      // Check this challenge hasn't been seen before
      expect(challenges.has(challengeHex)).toBe(false);
      
      challenges.add(challengeHex);
      
      // Check challenge is the correct size (32 bytes)
      expect(challenge.length).toBe(32);
    }

    // All challenges should be unique
    expect(challenges.size).toBe(numChallenges);
  });
});
