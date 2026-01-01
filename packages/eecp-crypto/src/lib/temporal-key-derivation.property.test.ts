import * as fc from 'fast-check';
import { TemporalKeyDerivation } from './temporal-key-derivation.js';
import { TimeWindow } from '@digitaldefiance-eecp/eecp-protocol';

describe('TemporalKeyDerivation Property Tests', () => {
  const derivation = new TemporalKeyDerivation();

  /**
   * Feature: eecp-full-system, Property 6: Deterministic Key Derivation
   * Validates: Requirements 2.1, 2.2
   * 
   * For any workspace secret and time window, deriving a temporal key using HKDF
   * must produce the same key when given the same inputs (deterministic derivation).
   */
  test('Property 6: Deterministic Key Derivation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random workspace secret (32 bytes)
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        // Generate random timestamp
        fc.integer({ min: 0, max: Date.now() }),
        // Generate random rotation interval (5, 15, 30, or 60 minutes)
        fc.constantFrom(5, 15, 30, 60),
        // Generate random grace period (30-120 seconds)
        fc.integer({ min: 30000, max: 120000 }),
        async (secretArray, startTime, rotationInterval, gracePeriod) => {
          const workspaceSecret = Buffer.from(secretArray);
          const endTime = startTime + rotationInterval * 60 * 1000;
          
          const timeWindow: TimeWindow = {
            startTime,
            endTime,
            rotationInterval,
            gracePeriod
          };
          
          const keyId = 'test-key-1';
          
          // Derive the key twice with the same inputs
          const key1 = await derivation.deriveKey(workspaceSecret, timeWindow, keyId);
          const key2 = await derivation.deriveKey(workspaceSecret, timeWindow, keyId);
          
          // Keys must be identical (deterministic)
          expect(key1.id).toBe(key2.id);
          expect(key1.key.equals(key2.key)).toBe(true);
          expect(key1.validFrom).toBe(key2.validFrom);
          expect(key1.validUntil).toBe(key2.validUntil);
          expect(key1.gracePeriodEnd).toBe(key2.gracePeriodEnd);
          
          // Verify key properties
          expect(key1.id).toBe(keyId);
          expect(key1.key.length).toBe(32); // AES-256 requires 32 bytes
          expect(key1.validFrom).toBe(startTime);
          expect(key1.validUntil).toBe(endTime);
          expect(key1.gracePeriodEnd).toBe(endTime + gracePeriod);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });
});
