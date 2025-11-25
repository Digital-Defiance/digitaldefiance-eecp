import * as fc from 'fast-check';
import { MultiRecipientEncryption, Participant } from './multi-recipient-encryption.js';
import { ECIESService } from '@digitaldefiance/ecies-lib';
import { Member } from '@digitaldefiance/ecies-lib';

describe('MultiRecipientEncryption Property Tests', () => {
  let eciesService: ECIESService;
  let multiRecipientEncryption: MultiRecipientEncryption;

  beforeAll(() => {
    eciesService = new ECIESService();
    multiRecipientEncryption = new MultiRecipientEncryption(eciesService);
  });

  /**
   * Feature: eecp-full-system, Property 21: Temporal Key Encryption for Participants
   * Validates: Requirements 5.2
   * 
   * For any participant joining a workspace, the current temporal key must be encrypted
   * using ECIES with that participant's public key.
   */
  test('Property 21: Temporal Key Encryption for Participants', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random temporal key (32 bytes for AES-256)
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        // Generate random number of recipients (1-10 for test performance)
        fc.integer({ min: 1, max: 10 }),
        async (temporalKeyArray, recipientCount) => {
          const temporalKey = new Uint8Array(temporalKeyArray);
          
          // Create recipients with generated keys
          const recipients: Member[] = [];
          for (let i = 0; i < recipientCount; i++) {
            const memberWithMnemonic = Member.newMember(
              eciesService,
              0, // MemberType.User
              `Participant-${i}`,
              `participant${i}@eecp.local` as any
            );
            recipients.push(memberWithMnemonic.member as Member);
          }
          
          // Encrypt temporal key for all recipients
          const encryptedMessage = await multiRecipientEncryption.encryptForRecipients(
            temporalKey,
            recipients
          );
          
          // Verify encrypted message structure
          expect(encryptedMessage.recipientCount).toBe(recipientCount);
          expect(encryptedMessage.recipientIds.length).toBe(recipientCount);
          expect(encryptedMessage.recipientKeys.length).toBe(recipientCount);
          
          // Each recipient should be able to decrypt the temporal key
          for (let i = 0; i < recipientCount; i++) {
            const recipient = recipients[i];
            
            // Decrypt the temporal key
            const decryptedKey = await multiRecipientEncryption.decryptForRecipient(
              encryptedMessage,
              recipient
            );
            
            // Decrypted key must match original temporal key
            expect(decryptedKey.length).toBe(temporalKey.length);
            expect(new Uint8Array(decryptedKey)).toEqual(temporalKey);
          }
          
          // Clean up
          recipients.forEach(r => r.dispose());
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  }, 60000); // Increase timeout for property test with crypto operations
});
