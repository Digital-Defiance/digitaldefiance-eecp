/**
 * Unit Tests for Participant Authentication
 * 
 * Tests edge cases and error conditions for authentication
 * Validates: Requirements 3.1, 3.5
 */

import { ParticipantAuth, ZeroKnowledgeProof, eciesService } from './participant-auth.js';
import { Member, MemberType, EmailString, GuidV4 } from '@digitaldefiance/ecies-lib';

describe('ParticipantAuth Unit Tests', () => {
  let auth: ParticipantAuth;
  let member: Member;
  let challenge: Buffer;
  let participantId: GuidV4;

  beforeEach(async () => {
    auth = new ParticipantAuth();
    
    // Generate a test member with keys using shared eciesService
    const memberWithMnemonic = await Member.newMember(
      eciesService,
      MemberType.User,
      'Test User',
      new EmailString('test@example.com')
    );
    member = memberWithMnemonic.member as Member;
    
    // Use the member's ID as participantId (it's now GuidV4-compatible with 4.7.14+)
    participantId = GuidV4.fromBuffer(member.id);

    // Generate a test challenge
    challenge = auth.generateChallenge();
  });

  afterEach(() => {
    // Clean up member
    if (member) {
      member.dispose();
    }
  });

  describe('generateProof', () => {
    it('should throw error for empty participant ID', () => {
      expect(() => {
        auth.generateProof('' as any, member, challenge);
      }).toThrow('Participant ID is required');
    });

    it('should throw error for missing member', () => {
      expect(() => {
        auth.generateProof(participantId, null as any, challenge);
      }).toThrow('Member is required');
    });

    it('should throw error for member without private key', async () => {
      // Create a member and then create a public-key-only version
      const fullMemberWithMnemonic = await Member.newMember(
        eciesService,
        MemberType.User,
        'Public Only',
        new EmailString('public@example.com')
      );
      const fullMember = fullMemberWithMnemonic.member as Member;
      
      // Create a new Member with only the public key (no private key)
      const publicOnlyMember = new Member(
        eciesService,
        fullMember.memberType,
        fullMember.name,
        fullMember.email,
        fullMember.publicKey,
        undefined, // No private key
        fullMember.id
      );
      
      expect(() => {
        auth.generateProof(participantId, publicOnlyMember, challenge);
      }).toThrow('Member must have private key loaded');
      
      publicOnlyMember.dispose();
      fullMember.dispose();
    });

    it('should throw error for empty challenge', () => {
      expect(() => {
        auth.generateProof(
          participantId,
          member,
          Buffer.alloc(0)
        );
      }).toThrow('Challenge is required');
    });

    it('should throw error for missing challenge', () => {
      expect(() => {
        auth.generateProof(
          participantId,
          member,
          null as any
        );
      }).toThrow('Challenge is required');
    });

    it('should generate proof with valid inputs', () => {
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      expect(proof).toBeDefined();
      expect(proof.signature).toBeDefined();
      expect(proof.signature.length).toBeGreaterThan(0);
      expect(proof.timestamp).toBeGreaterThan(0);
    });
  });

  describe('verifyProof - Expired Challenges', () => {
    /**
     * Test expired challenges (Requirements 3.1, 3.5)
     * Proofs with timestamps older than 60 seconds should be rejected
     */
    it('should reject proof with expired timestamp', () => {
      // Generate a proof
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      // Modify the timestamp to be 61 seconds in the past
      const expiredProof: ZeroKnowledgeProof = {
        ...proof,
        timestamp: Date.now() - 61 * 1000,
      };

      const isValid = auth.verifyProof(
        expiredProof,
        member,
        challenge,
        participantId
      );

      expect(isValid).toBe(false);
    });

    it('should reject proof with future timestamp beyond tolerance', () => {
      // Generate a proof
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      // Modify the timestamp to be 61 seconds in the future
      const futureProof: ZeroKnowledgeProof = {
        ...proof,
        timestamp: Date.now() + 61 * 1000,
      };

      const isValid = auth.verifyProof(
        futureProof,
        member,
        challenge,
        participantId
      );

      expect(isValid).toBe(false);
    });

    it('should accept proof within timestamp tolerance', () => {
      // Generate a fresh proof
      const freshProof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      const isValid = auth.verifyProof(
        freshProof,
        member,
        challenge,
        participantId
      );

      expect(isValid).toBe(true);
    });
  });

  describe('verifyProof - Invalid Signatures', () => {
    /**
     * Test invalid signatures (Requirements 3.5)
     * Tampered or invalid signatures should be rejected
     */
    it('should reject proof with tampered signature', () => {
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      // Tamper with the signature
      const tamperedSignature = Buffer.from(proof.signature);
      for (let i = 0; i < tamperedSignature.length; i++) {
        tamperedSignature[i] ^= 0xff; // Flip all bits
      }
      const tamperedProof: ZeroKnowledgeProof = {
        ...proof,
        signature: tamperedSignature,
      };

      const isValid = auth.verifyProof(
        tamperedProof,
        member,
        challenge,
        participantId
      );

      expect(isValid).toBe(false);
    });

    it('should reject proof with empty signature', () => {
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      const invalidProof: ZeroKnowledgeProof = {
        ...proof,
        signature: Buffer.alloc(0),
      };

      const isValid = auth.verifyProof(
        invalidProof,
        member,
        challenge,
        participantId
      );

      expect(isValid).toBe(false);
    });

    it('should reject proof with missing signature', () => {
      const isValid = auth.verifyProof(
        { signature: null as any, timestamp: Date.now() },
        member,
        challenge,
        participantId
      );

      expect(isValid).toBe(false);
    });

    it('should reject proof signed for different challenge', () => {
      // Generate proof for one challenge
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      // Try to verify with a different challenge
      const differentChallenge = auth.generateChallenge();

      const isValid = auth.verifyProof(
        proof,
        member,
        differentChallenge,
        participantId
      );

      expect(isValid).toBe(false);
    });

    it('should reject proof with wrong public key', async () => {
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      // Generate a different member
      const wrongMemberWithMnemonic = await Member.newMember(
        eciesService,
        MemberType.User,
        'Wrong User',
        new EmailString('wrong@example.com')
      );
      const wrongMember = wrongMemberWithMnemonic.member as Member;

      const isValid = auth.verifyProof(
        proof,
        wrongMember,
        challenge,
        participantId
      );

      expect(isValid).toBe(false);
      
      wrongMember.dispose();
    });
  });

  describe('verifyProof - Replay Attacks', () => {
    /**
     * Test replay attack prevention (Requirements 3.1, 3.5)
     * The same proof should not be reusable with different challenges
     */
    it('should reject reused proof with different challenge', () => {
      // Generate proof for first challenge
      const challenge1 = auth.generateChallenge();
      const proof = auth.generateProof(
        participantId,
        member,
        challenge1
      );

      // Verify with first challenge (should succeed)
      const isValid1 = auth.verifyProof(
        proof,
        member,
        challenge1,
        participantId
      );
      expect(isValid1).toBe(true);

      // Try to reuse the same proof with a different challenge (should fail)
      const challenge2 = auth.generateChallenge();
      const isValid2 = auth.verifyProof(
        proof,
        member,
        challenge2,
        participantId
      );
      expect(isValid2).toBe(false);
    });

    it('should allow same proof to be verified multiple times with same challenge', () => {
      // Generate proof
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      // Verify multiple times with same challenge (should all succeed)
      const isValid1 = auth.verifyProof(
        proof,
        member,
        challenge,
        participantId
      );
      const isValid2 = auth.verifyProof(
        proof,
        member,
        challenge,
        participantId
      );
      const isValid3 = auth.verifyProof(
        proof,
        member,
        challenge,
        participantId
      );

      expect(isValid1).toBe(true);
      expect(isValid2).toBe(true);
      expect(isValid3).toBe(true);
    });
  });

  describe('verifyProof - Input Validation', () => {
    it('should reject proof with missing timestamp', () => {
      const isValid = auth.verifyProof(
        { signature: Buffer.alloc(64), timestamp: null as any },
        member,
        challenge,
        participantId
      );

      expect(isValid).toBe(false);
    });

    it('should reject proof with missing member', () => {
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      const isValid = auth.verifyProof(
        proof,
        null as any,
        challenge,
        participantId
      );

      expect(isValid).toBe(false);
    });

    it('should reject proof with empty challenge', () => {
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      const isValid = auth.verifyProof(
        proof,
        member,
        Buffer.alloc(0),
        participantId
      );

      expect(isValid).toBe(false);
    });

    it('should reject proof with missing challenge', () => {
      const proof = auth.generateProof(
        participantId,
        member,
        challenge
      );

      const isValid = auth.verifyProof(
        proof,
        member,
        null as any,
        participantId
      );

      expect(isValid).toBe(false);
    });
  });

  describe('generateChallenge', () => {
    it('should generate challenge of correct size', () => {
      const challenge = auth.generateChallenge();
      expect(challenge.length).toBe(32);
    });

    it('should generate different challenges each time', () => {
      const challenge1 = auth.generateChallenge();
      const challenge2 = auth.generateChallenge();
      const challenge3 = auth.generateChallenge();

      expect(challenge1.equals(challenge2)).toBe(false);
      expect(challenge2.equals(challenge3)).toBe(false);
      expect(challenge1.equals(challenge3)).toBe(false);
    });

    it('should generate cryptographically random challenges', () => {
      // Generate many challenges and check they're not all zeros or all ones
      const challenges = Array.from({ length: 10 }, () =>
        auth.generateChallenge()
      );

      const allZeros = challenges.every((c) => c.every((b) => b === 0));
      const allOnes = challenges.every((c) => c.every((b) => b === 255));

      expect(allZeros).toBe(false);
      expect(allOnes).toBe(false);
    });
  });
});
