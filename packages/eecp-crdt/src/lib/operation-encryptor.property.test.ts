/**
 * Property-based tests for OperationEncryptor
 */

import * as fc from 'fast-check';
import { generateKeyPairSync } from 'crypto';
import { OperationEncryptor } from './operation-encryptor.js';
import { TimeLockedEncryption } from '@digitaldefiance-eecp/eecp-crypto';
import { CRDTOperation, OperationId, ParticipantId, WorkspaceId } from '@digitaldefiance-eecp/eecp-protocol';

describe('OperationEncryptor Property Tests', () => {
  const encryption = new TimeLockedEncryption();
  const encryptor = new OperationEncryptor(encryption);

  /**
   * Feature: eecp-full-system, Property 16: Operation Signing
   * Validates: Requirements 4.3
   * 
   * For any CRDT operation, the operation must be signed with the participant's
   * private key, and the signature must be verifiable using the participant's public key.
   */
  test('Property 16: Operation Signing', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random operation data
        fc.uuid().map(id => id as OperationId),
        fc.uuid().map(id => id as ParticipantId),
        fc.uuid().map(id => id as WorkspaceId),
        fc.integer({ min: 0, max: 1000 }), // position
        fc.constantFrom('insert' as const, 'delete' as const), // operation type
        fc.string({ minLength: 0, maxLength: 100 }), // content for insert
        fc.integer({ min: 1, max: 100 }), // length for delete
        fc.integer({ min: Date.now() - 86400000, max: Date.now() }), // timestamp (last 24h)
        // Generate temporal key
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.integer({ min: 0, max: Date.now() }),
        async (
          operationId,
          participantId,
          workspaceId,
          position,
          operationType,
          content,
          length,
          timestamp,
          keyArray,
          keyStartTime
        ) => {
          // Generate a keypair for the participant
          const { privateKey, publicKey } = generateKeyPairSync('ec', {
            namedCurve: 'secp256k1',
            publicKeyEncoding: {
              type: 'spki',
              format: 'pem'
            },
            privateKeyEncoding: {
              type: 'pkcs8',
              format: 'pem'
            }
          });

          // Create temporal key
          const temporalKey = {
            id: 'test-key-1',
            key: Buffer.from(keyArray),
            validFrom: keyStartTime,
            validUntil: keyStartTime + 3600000, // 1 hour
            gracePeriodEnd: keyStartTime + 3660000 // 1 hour + 1 minute
          };

          // Create CRDT operation
          const operation: CRDTOperation = {
            id: operationId,
            participantId,
            timestamp,
            type: operationType,
            position,
            content: operationType === 'insert' ? content : undefined,
            length: operationType === 'delete' ? length : undefined
          };

          // Encrypt and sign the operation
          const encrypted = await encryptor.encryptOperation(
            operation,
            temporalKey,
            Buffer.from(privateKey),
            workspaceId
          );

          // Verify the signature is present
          expect(encrypted.signature).toBeDefined();
          expect(encrypted.signature.length).toBeGreaterThan(0);

          // Verify the signature using the public key
          const isValid = encryptor.verifySignature(
            encrypted,
            Buffer.from(publicKey)
          );

          // Signature must be valid
          expect(isValid).toBe(true);

          // Verify that tampering with the operation invalidates the signature
          const tamperedOperation = {
            ...encrypted,
            position: encrypted.position + 1 // Change position
          };

          const isTamperedValid = encryptor.verifySignature(
            tamperedOperation,
            Buffer.from(publicKey)
          );

          // Tampered signature must be invalid
          expect(isTamperedValid).toBe(false);

          // Verify that using a different public key fails verification
          const { publicKey: wrongPublicKey } = generateKeyPairSync('ec', {
            namedCurve: 'secp256k1',
            publicKeyEncoding: {
              type: 'spki',
              format: 'pem'
            },
            privateKeyEncoding: {
              type: 'pkcs8',
              format: 'pem'
            }
          });

          const isWrongKeyValid = encryptor.verifySignature(
            encrypted,
            Buffer.from(wrongPublicKey)
          );

          // Wrong public key must fail verification
          expect(isWrongKeyValid).toBe(false);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Feature: eecp-full-system, Property 19: Operation Decryption and Application
   * Validates: Requirements 4.6
   * 
   * For any operation received by a participant, the participant must decrypt
   * the content using the temporal key and apply the CRDT operation to their
   * local document.
   */
  test('Property 19: Operation Decryption and Application', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random operation data
        fc.uuid().map(id => id as OperationId),
        fc.uuid().map(id => id as ParticipantId),
        fc.uuid().map(id => id as WorkspaceId),
        fc.integer({ min: 0, max: 1000 }), // position
        fc.constantFrom('insert' as const, 'delete' as const), // operation type
        fc.string({ minLength: 1, maxLength: 100 }), // content for insert
        fc.integer({ min: 1, max: 100 }), // length for delete
        fc.integer({ min: Date.now() - 86400000, max: Date.now() }), // timestamp (last 24h)
        // Generate temporal key
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.integer({ min: 0, max: Date.now() }),
        async (
          operationId,
          participantId,
          workspaceId,
          position,
          operationType,
          content,
          length,
          timestamp,
          keyArray,
          keyStartTime
        ) => {
          // Generate a keypair for the participant
          const { privateKey } = generateKeyPairSync('ec', {
            namedCurve: 'secp256k1',
            publicKeyEncoding: {
              type: 'spki',
              format: 'pem'
            },
            privateKeyEncoding: {
              type: 'pkcs8',
              format: 'pem'
            }
          });

          // Create temporal key
          const temporalKey = {
            id: 'test-key-1',
            key: Buffer.from(keyArray),
            validFrom: keyStartTime,
            validUntil: keyStartTime + 3600000, // 1 hour
            gracePeriodEnd: keyStartTime + 3660000 // 1 hour + 1 minute
          };

          // Create CRDT operation
          const originalOperation: CRDTOperation = {
            id: operationId,
            participantId,
            timestamp,
            type: operationType,
            position,
            content: operationType === 'insert' ? content : undefined,
            length: operationType === 'delete' ? length : undefined
          };

          // Encrypt the operation
          const encrypted = await encryptor.encryptOperation(
            originalOperation,
            temporalKey,
            Buffer.from(privateKey),
            workspaceId
          );

          // Decrypt the operation
          const decrypted = await encryptor.decryptOperation(
            encrypted,
            temporalKey
          );

          // Verify all fields match the original operation
          expect(decrypted.id).toBe(originalOperation.id);
          expect(decrypted.participantId).toBe(originalOperation.participantId);
          expect(decrypted.timestamp).toBe(originalOperation.timestamp);
          expect(decrypted.type).toBe(originalOperation.type);
          expect(decrypted.position).toBe(originalOperation.position);

          // Verify content/length based on operation type
          if (operationType === 'insert') {
            expect(decrypted.content).toBe(originalOperation.content);
            expect(decrypted.length).toBeUndefined();
          } else {
            expect(decrypted.length).toBe(originalOperation.length);
            expect(decrypted.content).toBeUndefined();
          }

          // Verify that decryption with wrong key fails
          const wrongKey = {
            id: 'wrong-key',
            key: Buffer.from(fc.sample(fc.uint8Array({ minLength: 32, maxLength: 32 }), 1)[0]),
            validFrom: keyStartTime,
            validUntil: keyStartTime + 3600000,
            gracePeriodEnd: keyStartTime + 3660000
          };

          await expect(
            encryptor.decryptOperation(encrypted, wrongKey)
          ).rejects.toThrow();
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });
});
