import * as fc from 'fast-check';
import { CommitmentScheme } from './commitment-scheme.js';
import { TemporalKey } from './temporal-key-derivation.js';

describe('CommitmentScheme Property Tests', () => {
  /**
   * Feature: eecp-full-system, Property 10: Key Deletion Commitments
   * Validates: Requirements 2.6, 10.1, 10.2, 10.4, 10.5
   * 
   * For any deleted temporal key, a cryptographic commitment (SHA-256 hash) must be
   * created and published to a verifiable log before deletion.
   */
  test('Property 10: Key Deletion Commitments', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random key ID
        fc.string({ minLength: 5, maxLength: 20 }),
        // Generate random key (32 bytes for AES-256)
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        // Generate random validFrom timestamp
        fc.integer({ min: 0, max: Date.now() }),
        // Generate random validity duration (5-60 minutes)
        fc.integer({ min: 5 * 60 * 1000, max: 60 * 60 * 1000 }),
        // Generate random grace period (30-120 seconds)
        fc.integer({ min: 30000, max: 120000 }),
        async (keyId, keyArray, validFrom, duration, gracePeriod) => {
          // Create a fresh instance for each test run
          const commitmentScheme = new CommitmentScheme();
          
          const key: TemporalKey = {
            id: keyId,
            key: Buffer.from(keyArray),
            validFrom,
            validUntil: validFrom + duration,
            gracePeriodEnd: validFrom + duration + gracePeriod
          };
          
          // Create commitment before key deletion
          const commitment = commitmentScheme.createCommitment(key);
          
          // Verify commitment properties
          expect(commitment.keyId).toBe(key.id);
          expect(commitment.hash).toBeInstanceOf(Buffer);
          expect(commitment.hash.length).toBe(32); // SHA-256 produces 32 bytes
          expect(commitment.validFrom).toBe(key.validFrom);
          expect(commitment.validUntil).toBe(key.validUntil);
          expect(commitment.timestamp).toBeGreaterThan(0);
          expect(commitment.timestamp).toBeLessThanOrEqual(Date.now());
          
          // Publish commitment to verifiable log
          await commitmentScheme.publishCommitment(commitment);
          
          // Verify commitment was published
          const publishedCommitment = commitmentScheme.findCommitment(keyId);
          expect(publishedCommitment).toBeDefined();
          expect(publishedCommitment?.keyId).toBe(commitment.keyId);
          expect(publishedCommitment?.hash.equals(commitment.hash)).toBe(true);
          expect(publishedCommitment?.validFrom).toBe(commitment.validFrom);
          expect(publishedCommitment?.validUntil).toBe(commitment.validUntil);
          
          // Verify commitment is deterministic (same key produces same hash)
          const commitment2 = commitmentScheme.createCommitment(key);
          expect(commitment2.hash.equals(commitment.hash)).toBe(true);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Feature: eecp-full-system, Property 36: Commitment Verification
   * Validates: Requirements 10.3
   * 
   * For any published commitment, a verifier must be able to confirm the commitment
   * exists in the log and that the corresponding key is no longer accessible.
   */
  test('Property 36: Commitment Verification', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random key ID
        fc.string({ minLength: 5, maxLength: 20 }),
        // Generate random key (32 bytes for AES-256)
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        // Generate random validFrom timestamp
        fc.integer({ min: 0, max: Date.now() }),
        // Generate random validity duration (5-60 minutes)
        fc.integer({ min: 5 * 60 * 1000, max: 60 * 60 * 1000 }),
        // Generate random grace period (30-120 seconds)
        fc.integer({ min: 30000, max: 120000 }),
        async (keyId, keyArray, validFrom, duration, gracePeriod) => {
          // Create a fresh instance for each test run
          const commitmentScheme = new CommitmentScheme();
          
          const key: TemporalKey = {
            id: keyId,
            key: Buffer.from(keyArray),
            validFrom,
            validUntil: validFrom + duration,
            gracePeriodEnd: validFrom + duration + gracePeriod
          };
          
          // Create and publish commitment
          const commitment = commitmentScheme.createCommitment(key);
          await commitmentScheme.publishCommitment(commitment);
          
          // Verify commitment with correct metadata
          const isValid = commitmentScheme.verifyCommitment(
            commitment,
            key.id,
            key.validFrom,
            key.validUntil
          );
          expect(isValid).toBe(true);
          
          // Verify commitment with incorrect keyId fails
          const invalidKeyId = commitmentScheme.verifyCommitment(
            commitment,
            'wrong-key-id',
            key.validFrom,
            key.validUntil
          );
          expect(invalidKeyId).toBe(false);
          
          // Verify commitment with incorrect validFrom fails
          const invalidValidFrom = commitmentScheme.verifyCommitment(
            commitment,
            key.id,
            key.validFrom + 1000,
            key.validUntil
          );
          expect(invalidValidFrom).toBe(false);
          
          // Verify commitment with incorrect validUntil fails
          const invalidValidUntil = commitmentScheme.verifyCommitment(
            commitment,
            key.id,
            key.validFrom,
            key.validUntil + 1000
          );
          expect(invalidValidUntil).toBe(false);
          
          // Verify commitment exists in log
          const publishedCommitment = commitmentScheme.findCommitment(keyId);
          expect(publishedCommitment).toBeDefined();
          
          // Simulate key deletion (key is no longer accessible)
          // In real implementation, the key would be destroyed from memory
          // Here we verify that the commitment still exists after "deletion"
          const commitmentAfterDeletion = commitmentScheme.findCommitment(keyId);
          expect(commitmentAfterDeletion).toBeDefined();
          expect(commitmentAfterDeletion?.hash.equals(commitment.hash)).toBe(true);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });
});
