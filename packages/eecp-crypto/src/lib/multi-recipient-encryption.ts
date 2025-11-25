/**
 * Multi-Recipient Encryption Module
 * 
 * Implements multi-recipient encryption using ECIES (Elliptic Curve Integrated Encryption Scheme)
 * from the @digitaldefiance/ecies-lib library. This allows encrypting temporal keys for multiple
 * participants simultaneously, enabling secure key distribution in collaborative workspaces.
 * 
 * Key Features:
 * - ECIES-based public key encryption
 * - Multi-recipient support (encrypt once for many recipients)
 * - Secure key management with Member class
 * - Signing and verification capabilities
 * 
 * @module multi-recipient-encryption
 */

import { Member } from '@digitaldefiance/ecies-lib';
import { ECIESService } from '@digitaldefiance/ecies-lib';
import { EciesMultiRecipient } from '@digitaldefiance/ecies-lib';
import { MemberType } from '@digitaldefiance/ecies-lib';
import { EmailString } from '@digitaldefiance/ecies-lib';
import { SecureBuffer } from '@digitaldefiance/ecies-lib';
import type { IMultiEncryptedMessage, IMultiRecipient } from '@digitaldefiance/ecies-lib';

/**
 * Interface for multi-recipient encryption operations
 * 
 * Wraps the @digitaldefiance/ecies-lib multi-recipient encryption functionality
 * for encrypting temporal keys to multiple participants.
 */
export interface IMultiRecipientEncryption {
  /**
   * Encrypt temporal key for multiple recipients using ECIES
   * 
   * Encrypts the temporal key once in a way that allows multiple recipients
   * to decrypt it with their individual private keys. This is more efficient
   * than encrypting separately for each recipient.
   * 
   * Uses EciesMultiRecipient from @digitaldefiance/ecies-lib for the
   * underlying cryptographic operations.
   * 
   * @param {Uint8Array} temporalKey - Temporal key to encrypt (32 bytes for AES-256)
   * @param {Member[]} recipients - Array of Member objects representing recipients
   * @returns {Promise<IMultiEncryptedMessage>} Multi-recipient encrypted message
   * 
   * @example
   * ```typescript
   * const encrypted = await encryption.encryptForRecipients(
   *   temporalKey,
   *   [participant1.getMember(), participant2.getMember()]
   * );
   * ```
   */
  encryptForRecipients(
    temporalKey: Uint8Array,
    recipients: Member[]
  ): Promise<IMultiEncryptedMessage>;
  
  /**
   * Decrypt temporal key for a specific recipient
   * 
   * Decrypts the multi-recipient encrypted message using the recipient's
   * private key. Each recipient can independently decrypt the message
   * without knowing other recipients' private keys.
   * 
   * Uses EciesMultiRecipient from @digitaldefiance/ecies-lib for the
   * underlying cryptographic operations.
   * 
   * @param {IMultiEncryptedMessage} encryptedMessage - Multi-recipient encrypted message
   * @param {Member} recipient - Member object with private key loaded
   * @returns {Promise<Uint8Array>} Decrypted temporal key
   * 
   * @throws {Error} If recipient doesn't have private key loaded
   * 
   * @example
   * ```typescript
   * const temporalKey = await encryption.decryptForRecipient(
   *   encrypted,
   *   participant1.getMember()
   * );
   * ```
   */
  decryptForRecipient(
    encryptedMessage: IMultiEncryptedMessage,
    recipient: Member
  ): Promise<Uint8Array>;
}

/**
 * Multi-recipient encryption implementation using ecies-lib
 * 
 * Wraps the EciesMultiRecipient class from @digitaldefiance/ecies-lib to provide
 * multi-recipient encryption for temporal keys. This allows efficient key distribution
 * to multiple participants in a workspace.
 * 
 * The implementation uses ECIES (Elliptic Curve Integrated Encryption Scheme) which
 * provides:
 * - Public key encryption (recipients only need public keys to receive)
 * - Authenticated encryption (prevents tampering)
 * - Forward secrecy (compromising one key doesn't compromise others)
 * 
 * @implements {IMultiRecipientEncryption}
 * 
 * @example
 * ```typescript
 * const encryption = new MultiRecipientEncryption(eciesService);
 * const encrypted = await encryption.encryptForRecipients(key, recipients);
 * const decrypted = await encryption.decryptForRecipient(encrypted, recipient);
 * ```
 */
export class MultiRecipientEncryption implements IMultiRecipientEncryption {
  /**
   * ECIES multi-recipient encryption instance from ecies-lib
   * @private
   */
  private eciesMultiRecipient: EciesMultiRecipient;
  
  /**
   * Create a new multi-recipient encryption instance
   * 
   * @param {ECIESService} eciesService - ECIES service instance with configuration
   * 
   * @example
   * ```typescript
   * import { eciesService } from './ecies-config.js';
   * const encryption = new MultiRecipientEncryption(eciesService);
   * ```
   */
  constructor(eciesService: ECIESService) {
    this.eciesMultiRecipient = new EciesMultiRecipient(eciesService.config);
  }
  
  /**
   * Encrypt temporal key for multiple recipients
   * 
   * Converts Member objects to the IMultiRecipient format required by ecies-lib,
   * then performs multi-recipient encryption. The result can be decrypted by any
   * of the recipients using their private keys.
   * 
   * @param {Uint8Array} temporalKey - Temporal key to encrypt
   * @param {Member[]} recipients - Array of recipient Member objects
   * @returns {Promise<IMultiEncryptedMessage>} Encrypted message for all recipients
   * 
   * @example
   * ```typescript
   * const members = [participant1.getMember(), participant2.getMember()];
   * const encrypted = await encryption.encryptForRecipients(temporalKey, members);
   * ```
   */
  async encryptForRecipients(
    temporalKey: Uint8Array,
    recipients: Member[]
  ): Promise<IMultiEncryptedMessage> {
    // Convert Members to IMultiRecipient format required by ecies-lib
    const multiRecipients: IMultiRecipient[] = recipients.map(member => ({
      id: member.id,
      publicKey: member.publicKey
    }));
    
    // Use ecies-lib's multi-recipient encryption
    return await this.eciesMultiRecipient.encryptMultiple(
      multiRecipients,
      temporalKey
    );
  }
  
  /**
   * Decrypt temporal key for a specific recipient
   * 
   * Decrypts the multi-recipient encrypted message using the recipient's private key.
   * The recipient must have their private key loaded in the Member object.
   * 
   * @param {IMultiEncryptedMessage} encryptedMessage - Multi-recipient encrypted message
   * @param {Member} recipient - Recipient Member with private key loaded
   * @returns {Promise<Uint8Array>} Decrypted temporal key
   * 
   * @throws {Error} If recipient doesn't have private key loaded
   * 
   * @example
   * ```typescript
   * if (participant.getMember().hasPrivateKey) {
   *   const key = await encryption.decryptForRecipient(encrypted, participant.getMember());
   * }
   * ```
   */
  async decryptForRecipient(
    encryptedMessage: IMultiEncryptedMessage,
    recipient: Member
  ): Promise<Uint8Array> {
    if (!recipient.hasPrivateKey) {
      throw new Error('Recipient must have private key loaded');
    }
    
    // Use ecies-lib's multi-recipient decryption
    return await this.eciesMultiRecipient.decryptMultipleForRecipient(
      encryptedMessage,
      recipient.id,
      recipient.privateKey!.value
    );
  }
}

/**
 * Participant wrapper around Member class from ecies-lib
 * 
 * Provides a simplified interface for participant operations including:
 * - Key management (generation, loading, disposal)
 * - Signing and verification
 * - Encryption and decryption
 * 
 * Wraps the Member class from @digitaldefiance/ecies-lib to provide
 * EECP-specific functionality while leveraging the battle-tested
 * cryptographic implementations from ecies-lib.
 * 
 * @example
 * ```typescript
 * // Create new participant with generated keys
 * const participant = new Participant(
 *   eciesService,
 *   'participant-1',
 *   'Alice',
 *   'alice@example.com'
 * );
 * 
 * // Or load from existing keys
 * const participant = Participant.fromKeys(
 *   eciesService,
 *   participantId,
 *   publicKey,
 *   privateKey
 * );
 * ```
 */
export class Participant {
  /**
   * Underlying Member instance from ecies-lib
   * @private
   */
  private member: Member;
  
  /**
   * Create a new participant with generated keys
   * 
   * Generates a new Member with a fresh keypair using ecies-lib's Member.newMember().
   * The generated keys are suitable for ECIES encryption and ECDSA signing.
   * 
   * @param {ECIESService} eciesService - ECIES service instance
   * @param {string} participantId - Unique identifier for the participant
   * @param {string} name - Display name for the participant
   * @param {string} email - Email address for the participant
   * 
   * @example
   * ```typescript
   * const participant = new Participant(
   *   eciesService,
   *   'participant-1',
   *   'Alice',
   *   'alice@example.com'
   * );
   * console.log(participant.hasPrivateKey); // true
   * ```
   */
  constructor(
    eciesService: ECIESService,
    participantId: string,
    name: string,
    email: string
  ) {
    // Create a new Member with generated keys
    const memberWithMnemonic = Member.newMember(
      eciesService,
      MemberType.User,
      name,
      new EmailString(email)
    );
    
    this.member = memberWithMnemonic.member as Member;
  }
  
  /**
   * Load an existing participant from keys
   * 
   * Creates a Participant from existing key material. This is used when
   * loading a participant from storage or when a participant joins with
   * their public key only (for encryption without signing).
   * 
   * @param {ECIESService} eciesService - ECIES service instance
   * @param {Uint8Array} participantId - Participant's unique identifier
   * @param {Uint8Array} publicKey - Participant's public key
   * @param {SecureBuffer} [privateKey] - Optional private key (for signing/decryption)
   * @returns {Participant} Participant instance
   * 
   * @example
   * ```typescript
   * // Load with public key only (can encrypt for them, but can't sign)
   * const participant = Participant.fromKeys(
   *   eciesService,
   *   participantId,
   *   publicKey
   * );
   * 
   * // Load with private key (can sign and decrypt)
   * const participant = Participant.fromKeys(
   *   eciesService,
   *   participantId,
   *   publicKey,
   *   privateKey
   * );
   * ```
   */
  static fromKeys(
    eciesService: ECIESService,
    participantId: Uint8Array,
    publicKey: Uint8Array,
    privateKey?: SecureBuffer
  ): Participant {
    const member = new Member(
      eciesService,
      MemberType.User,
      'Participant',
      new EmailString('participant@eecp.local'),
      publicKey,
      privateKey,
      undefined,
      participantId
    );
    
    const participant = Object.create(Participant.prototype);
    participant.member = member;
    return participant;
  }
  
  /**
   * Get the participant's unique identifier
   * 
   * @returns {Uint8Array} Participant ID as Uint8Array
   * 
   * @example
   * ```typescript
   * const id = participant.id;
   * console.log(id.length); // 16 bytes (GuidV4)
   * ```
   */
  get id(): Uint8Array {
    return this.member.id;
  }
  
  /**
   * Get the participant's public key
   * 
   * The public key can be shared with other participants to enable
   * encryption and signature verification.
   * 
   * @returns {Uint8Array} Public key as Uint8Array
   * 
   * @example
   * ```typescript
   * const publicKey = participant.publicKey;
   * // Share with other participants for encryption
   * ```
   */
  get publicKey(): Uint8Array {
    return this.member.publicKey;
  }
  
  /**
   * Check if the participant has their private key loaded
   * 
   * Returns true if the private key is available for signing and decryption.
   * Returns false if only the public key is available.
   * 
   * @returns {boolean} True if private key is loaded
   * 
   * @example
   * ```typescript
   * if (participant.hasPrivateKey) {
   *   const signature = participant.sign(data);
   * } else {
   *   console.log('Cannot sign without private key');
   * }
   * ```
   */
  get hasPrivateKey(): boolean {
    return this.member.hasPrivateKey;
  }
  
  /**
   * Sign data using the participant's private key
   * 
   * Creates an ECDSA signature over the data. Requires the private key to be loaded.
   * The signature can be verified by anyone with the participant's public key.
   * 
   * @param {Uint8Array} data - Data to sign
   * @returns {Uint8Array} ECDSA signature
   * 
   * @throws {Error} If private key is not loaded
   * 
   * @example
   * ```typescript
   * const data = new TextEncoder().encode('Hello, world!');
   * const signature = participant.sign(data);
   * 
   * // Others can verify with public key
   * const isValid = otherParticipant.verify(signature, data);
   * ```
   */
  sign(data: Uint8Array): Uint8Array {
    const signature = this.member.sign(data);
    // Convert SignatureUint8Array to plain Uint8Array
    return new Uint8Array(signature);
  }
  
  /**
   * Verify a signature using the participant's public key
   * 
   * Verifies an ECDSA signature was created by the holder of the corresponding
   * private key. Does not require the private key - only the public key.
   * 
   * @param {Uint8Array} signature - Signature to verify
   * @param {Uint8Array} data - Original data that was signed
   * @returns {boolean} True if signature is valid, false otherwise
   * 
   * @example
   * ```typescript
   * const isValid = participant.verify(signature, data);
   * if (isValid) {
   *   console.log('Signature verified!');
   * } else {
   *   console.log('Invalid signature');
   * }
   * ```
   */
  verify(signature: Uint8Array, data: Uint8Array): boolean {
    // Cast to SignatureUint8Array for verification
    return this.member.verify(signature as any, data);
  }
  
  /**
   * Encrypt data for a specific recipient
   * 
   * Encrypts data using ECIES so that only the recipient (holder of the
   * corresponding private key) can decrypt it.
   * 
   * @param {Uint8Array} data - Data to encrypt
   * @param {Uint8Array} recipientPublicKey - Recipient's public key
   * @returns {Promise<Uint8Array>} Encrypted data
   * 
   * @example
   * ```typescript
   * const encrypted = await participant.encryptFor(
   *   data,
   *   otherParticipant.publicKey
   * );
   * // Only otherParticipant can decrypt this
   * ```
   */
  async encryptFor(data: Uint8Array, recipientPublicKey: Uint8Array): Promise<Uint8Array> {
    return await this.member.encryptData(data, recipientPublicKey);
  }
  
  /**
   * Decrypt data encrypted for this participant
   * 
   * Decrypts ECIES-encrypted data using the participant's private key.
   * Requires the private key to be loaded.
   * 
   * @param {Uint8Array} encryptedData - Encrypted data to decrypt
   * @returns {Promise<Uint8Array>} Decrypted data
   * 
   * @throws {Error} If private key is not loaded
   * @throws {Error} If decryption fails (wrong key or corrupted data)
   * 
   * @example
   * ```typescript
   * const decrypted = await participant.decrypt(encryptedData);
   * const text = new TextDecoder().decode(decrypted);
   * ```
   */
  async decrypt(encryptedData: Uint8Array): Promise<Uint8Array> {
    return await this.member.decryptData(encryptedData);
  }
  
  /**
   * Get the underlying Member instance
   * 
   * Provides access to the wrapped Member object for advanced operations
   * or integration with other ecies-lib functionality.
   * 
   * @returns {Member} Underlying Member instance
   * 
   * @example
   * ```typescript
   * const member = participant.getMember();
   * // Use member for multi-recipient encryption
   * const encrypted = await encryption.encryptForRecipients(key, [member]);
   * ```
   */
  getMember(): Member {
    return this.member;
  }
  
  /**
   * Securely dispose of the participant's keys
   * 
   * Clears the private key from memory and disposes of the underlying Member.
   * After calling this, the participant can no longer sign or decrypt.
   * 
   * This should be called when the participant leaves the workspace or
   * when cleaning up resources.
   * 
   * @example
   * ```typescript
   * // When participant leaves
   * participant.dispose();
   * // Keys are now cleared from memory
   * ```
   */
  dispose(): void {
    this.member.dispose();
  }
}
