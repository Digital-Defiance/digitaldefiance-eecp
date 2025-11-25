import * as fc from 'fast-check';
import { TimeLockedEncryption } from './time-locked-encryption.js';
import { TemporalKey } from './temporal-key-derivation.js';

describe('TimeLockedEncryption Property Tests', () => {
  const encryption = new TimeLockedEncryption();
  
  /**
   * Property 15: Operation Encryption
   * For any CRDT operation created by a participant, the content payload must be 
   * encrypted with the current temporal key before transmission.
   * 
   * This property tests the round-trip: encrypt then decrypt should return the original content.
   * 
   * Validates: Requirements 4.2
   */
  test('Feature: eecp-full-system, Property 15: Operation Encryption - Round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random content (0 to 10KB)
        fc.uint8Array({ minLength: 0, maxLength: 10240 }),
        // Generate random key material (32 bytes for AES-256)
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        // Generate random key ID
        fc.string({ minLength: 1, maxLength: 50 }),
        // Generate random timestamps
        fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        fc.integer({ min: 1, max: 60 * 60 * 1000 }), // Duration up to 1 hour
        async (contentArray, keyMaterial, keyId, validFrom, duration) => {
          // Create content buffer
          const content = Buffer.from(contentArray);
          
          // Create temporal key
          const temporalKey: TemporalKey = {
            id: keyId,
            key: Buffer.from(keyMaterial),
            validFrom,
            validUntil: validFrom + duration,
            gracePeriodEnd: validFrom + duration + 60000
          };
          
          // Encrypt content
          const encrypted = await encryption.encrypt(content, temporalKey);
          
          // Verify encrypted payload structure
          expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
          expect(encrypted.nonce).toBeInstanceOf(Buffer);
          expect(encrypted.nonce.length).toBe(12); // GCM nonce is 12 bytes
          expect(encrypted.authTag).toBeInstanceOf(Buffer);
          expect(encrypted.authTag.length).toBe(16); // GCM auth tag is 16 bytes
          expect(encrypted.keyId).toBe(keyId);
          
          // Decrypt content
          const decrypted = await encryption.decrypt(encrypted, temporalKey);
          
          // Round-trip property: decrypt(encrypt(content)) === content
          expect(decrypted).toEqual(content);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Additional property: Encryption with additional authenticated data
   * Tests that AAD is properly bound to the ciphertext
   */
  test('Feature: eecp-full-system, Property 15: Operation Encryption - With AAD', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1024 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.uint8Array({ minLength: 2, maxLength: 256 }), // At least 2 bytes so reverse is different
        fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        async (contentArray, keyMaterial, keyId, aadArray, validFrom) => {
          const content = Buffer.from(contentArray);
          const aad = Buffer.from(aadArray);
          
          const temporalKey: TemporalKey = {
            id: keyId,
            key: Buffer.from(keyMaterial),
            validFrom,
            validUntil: validFrom + 60000,
            gracePeriodEnd: validFrom + 120000
          };
          
          // Encrypt with AAD
          const encrypted = await encryption.encrypt(content, temporalKey, aad);
          
          // Decrypt with same AAD should succeed
          const decrypted = await encryption.decrypt(encrypted, temporalKey, aad);
          expect(decrypted).toEqual(content);
          
          // Decrypt with different AAD should fail
          // Modify the first byte to ensure it's different
          const wrongAad = Buffer.from(aadArray);
          wrongAad[0] = (wrongAad[0] + 1) % 256;
          
          await expect(
            encryption.decrypt(encrypted, temporalKey, wrongAad)
          ).rejects.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property: Different keys produce different ciphertexts
   * Tests that encryption is key-dependent
   */
  test('Feature: eecp-full-system, Property 15: Different keys produce different ciphertexts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1024 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        async (contentArray, keyMaterial1, keyMaterial2, keyId, validFrom) => {
          // Skip if keys are the same
          if (Buffer.from(keyMaterial1).equals(Buffer.from(keyMaterial2))) {
            return;
          }
          
          const content = Buffer.from(contentArray);
          
          const key1: TemporalKey = {
            id: keyId + '-1',
            key: Buffer.from(keyMaterial1),
            validFrom,
            validUntil: validFrom + 60000,
            gracePeriodEnd: validFrom + 120000
          };
          
          const key2: TemporalKey = {
            id: keyId + '-2',
            key: Buffer.from(keyMaterial2),
            validFrom,
            validUntil: validFrom + 60000,
            gracePeriodEnd: validFrom + 120000
          };
          
          // Encrypt with both keys
          const encrypted1 = await encryption.encrypt(content, key1);
          const encrypted2 = await encryption.encrypt(content, key2);
          
          // Ciphertexts should be different (with overwhelming probability)
          expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
          
          // Cannot decrypt with wrong key
          await expect(
            encryption.decrypt(encrypted1, key2)
          ).rejects.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property 9: Key Deletion Guarantee
   * For any temporal key that has expired beyond its grace period, the key must be 
   * securely deleted from memory and no longer accessible for decryption.
   * 
   * This property tests that destroyKey() properly overwrites and zeros the key buffer.
   * 
   * Validates: Requirements 2.5, 2.7, 18.1, 18.2
   */
  test('Feature: eecp-full-system, Property 9: Key Deletion Guarantee', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random key material (32 bytes for AES-256)
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        // Generate random key ID
        fc.string({ minLength: 1, maxLength: 50 }),
        // Generate random timestamps
        fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
        async (keyMaterial, keyId, validFrom) => {
          // Create temporal key
          const temporalKey: TemporalKey = {
            id: keyId,
            key: Buffer.from(keyMaterial),
            validFrom,
            validUntil: validFrom + 60000,
            gracePeriodEnd: validFrom + 120000
          };
          
          // Store original key value for verification
          const originalKey = Buffer.from(temporalKey.key);
          
          // Verify key is not all zeros before deletion (if it has non-zero bytes)
          const hasNonZero = originalKey.some(byte => byte !== 0);
          
          // Destroy the key
          encryption.destroyKey(temporalKey);
          
          // Key buffer must be zeroed out
          const allZeros = temporalKey.key.every(byte => byte === 0);
          expect(allZeros).toBe(true);
          
          // Key must not equal original value (unless original was all zeros)
          if (hasNonZero) {
            expect(temporalKey.key).not.toEqual(originalKey);
          }
          
          // The key buffer should be the same length (not truncated)
          expect(temporalKey.key.length).toBe(32);
        }
      ),
      { numRuns: 100 }
    );
  });
});
