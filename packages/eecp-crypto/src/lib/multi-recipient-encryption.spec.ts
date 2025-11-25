import { MultiRecipientEncryption, Participant } from './multi-recipient-encryption';
import { ECIESService } from '@digitaldefiance/ecies-lib';
import { Member } from '@digitaldefiance/ecies-lib';

describe('MultiRecipientEncryption', () => {
  let eciesService: ECIESService;
  let multiRecipientEncryption: MultiRecipientEncryption;

  beforeAll(() => {
    eciesService = new ECIESService();
    multiRecipientEncryption = new MultiRecipientEncryption(eciesService);
  });

  describe('Edge Cases', () => {
    /**
     * Test single recipient encryption/decryption
     * Requirements: 5.2
     */
    test('should encrypt and decrypt for single recipient', async () => {
      const temporalKey = new Uint8Array(32);
      crypto.getRandomValues(temporalKey);

      // Create single recipient
      const memberWithMnemonic = Member.newMember(
        eciesService,
        0, // MemberType.User
        'Single-Recipient',
        'single@eecp.local' as any
      );
      const recipient = memberWithMnemonic.member as Member;

      // Encrypt for single recipient
      const encryptedMessage = await multiRecipientEncryption.encryptForRecipients(
        temporalKey,
        [recipient]
      );

      expect(encryptedMessage.recipientCount).toBe(1);
      expect(encryptedMessage.recipientIds.length).toBe(1);

      // Decrypt
      const decryptedKey = await multiRecipientEncryption.decryptForRecipient(
        encryptedMessage,
        recipient
      );

      expect(new Uint8Array(decryptedKey)).toEqual(temporalKey);

      // Clean up
      recipient.dispose();
    });

    /**
     * Test many recipients (50+)
     * Requirements: 5.2
     */
    test('should encrypt and decrypt for many recipients (50+)', async () => {
      const temporalKey = new Uint8Array(32);
      crypto.getRandomValues(temporalKey);

      const recipientCount = 50;
      const recipients: Member[] = [];

      // Create 50 recipients
      for (let i = 0; i < recipientCount; i++) {
        const memberWithMnemonic = Member.newMember(
          eciesService,
          0, // MemberType.User
          `Recipient-${i}`,
          `recipient${i}@eecp.local` as any
        );
        recipients.push(memberWithMnemonic.member as Member);
      }

      // Encrypt for all recipients
      const encryptedMessage = await multiRecipientEncryption.encryptForRecipients(
        temporalKey,
        recipients
      );

      expect(encryptedMessage.recipientCount).toBe(recipientCount);
      expect(encryptedMessage.recipientIds.length).toBe(recipientCount);
      expect(encryptedMessage.recipientKeys.length).toBe(recipientCount);

      // Verify each recipient can decrypt
      for (let i = 0; i < recipientCount; i++) {
        const decryptedKey = await multiRecipientEncryption.decryptForRecipient(
          encryptedMessage,
          recipients[i]
        );

        expect(new Uint8Array(decryptedKey)).toEqual(temporalKey);
      }

      // Clean up
      recipients.forEach(r => r.dispose());
    }, 30000); // Increase timeout for many recipients

    /**
     * Test Member key management (load/unload)
     * Requirements: 5.2
     */
    test('should handle Member key management (load/unload)', async () => {
      const temporalKey = new Uint8Array(32);
      crypto.getRandomValues(temporalKey);

      // Create member with keys
      const memberWithMnemonic = Member.newMember(
        eciesService,
        0, // MemberType.User
        'Key-Management-Test',
        'keytest@eecp.local' as any
      );
      const member = memberWithMnemonic.member as Member;

      // Verify member has private key
      expect(member.hasPrivateKey).toBe(true);

      // Encrypt for member
      const encryptedMessage = await multiRecipientEncryption.encryptForRecipients(
        temporalKey,
        [member]
      );

      // Decrypt with private key loaded
      const decryptedKey1 = await multiRecipientEncryption.decryptForRecipient(
        encryptedMessage,
        member
      );
      expect(new Uint8Array(decryptedKey1)).toEqual(temporalKey);

      // Unload private key
      member.unloadPrivateKey();
      expect(member.hasPrivateKey).toBe(false);

      // Attempt to decrypt without private key should fail
      await expect(
        multiRecipientEncryption.decryptForRecipient(encryptedMessage, member)
      ).rejects.toThrow('Recipient must have private key loaded');

      // Clean up
      member.dispose();
    });

    /**
     * Test encryption/decryption round-trip
     * Requirements: 5.2
     */
    test('should complete encryption/decryption round-trip successfully', async () => {
      const temporalKey = new Uint8Array(32);
      crypto.getRandomValues(temporalKey);

      // Create multiple recipients
      const recipients: Member[] = [];
      for (let i = 0; i < 5; i++) {
        const memberWithMnemonic = Member.newMember(
          eciesService,
          0, // MemberType.User
          `RoundTrip-${i}`,
          `roundtrip${i}@eecp.local` as any
        );
        recipients.push(memberWithMnemonic.member as Member);
      }

      // Encrypt
      const encryptedMessage = await multiRecipientEncryption.encryptForRecipients(
        temporalKey,
        recipients
      );

      // Verify structure
      expect(encryptedMessage.recipientCount).toBe(5);
      expect(encryptedMessage.encryptedMessage).toBeDefined();
      expect(encryptedMessage.encryptedMessage.length).toBeGreaterThan(0);

      // Decrypt for each recipient and verify
      for (const recipient of recipients) {
        const decryptedKey = await multiRecipientEncryption.decryptForRecipient(
          encryptedMessage,
          recipient
        );

        // Verify exact match
        expect(decryptedKey.length).toBe(temporalKey.length);
        expect(new Uint8Array(decryptedKey)).toEqual(temporalKey);
      }

      // Clean up
      recipients.forEach(r => r.dispose());
    });
  });
});

describe('Participant', () => {
  let eciesService: ECIESService;

  beforeAll(() => {
    eciesService = new ECIESService();
  });

  test('should create participant with generated keys', () => {
    const participant = new Participant(
      eciesService,
      'participant-1',
      'Test Participant',
      'test@eecp.local'
    );

    expect(participant.id).toBeDefined();
    expect(participant.publicKey).toBeDefined();
    expect(participant.hasPrivateKey).toBe(true);

    participant.dispose();
  });

  test('should sign and verify data', () => {
    const participant = new Participant(
      eciesService,
      'participant-2',
      'Signing Test',
      'signing@eecp.local'
    );

    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = participant.sign(data);

    expect(signature).toBeDefined();
    expect(signature.length).toBeGreaterThan(0);

    // Verify signature
    const isValid = participant.verify(signature, data);
    expect(isValid).toBe(true);

    // Verify with wrong data should fail
    const wrongData = new Uint8Array([5, 4, 3, 2, 1]);
    const isInvalid = participant.verify(signature, wrongData);
    expect(isInvalid).toBe(false);

    participant.dispose();
  });

  test('should encrypt and decrypt data', async () => {
    const sender = new Participant(
      eciesService,
      'sender',
      'Sender',
      'sender@eecp.local'
    );

    const recipient = new Participant(
      eciesService,
      'recipient',
      'Recipient',
      'recipient@eecp.local'
    );

    const data = new Uint8Array([10, 20, 30, 40, 50]);

    // Encrypt for recipient
    const encrypted = await sender.encryptFor(data, recipient.publicKey);
    expect(encrypted).toBeDefined();
    expect(encrypted.length).toBeGreaterThan(data.length);

    // Decrypt
    const decrypted = await recipient.decrypt(encrypted);
    expect(new Uint8Array(decrypted)).toEqual(data);

    sender.dispose();
    recipient.dispose();
  });

  test('should load participant from existing keys', () => {
    // Create a participant to get keys
    const original = new Participant(
      eciesService,
      'original',
      'Original',
      'original@eecp.local'
    );

    const publicKey = original.publicKey;
    const privateKey = original.getMember().privateKey;

    // Load from keys
    const loaded = Participant.fromKeys(
      eciesService,
      original.id,
      publicKey,
      privateKey
    );

    expect(loaded.id).toEqual(original.id);
    expect(loaded.publicKey).toEqual(publicKey);
    expect(loaded.hasPrivateKey).toBe(true);

    original.dispose();
    loaded.dispose();
  });
});
