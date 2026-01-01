import { Member } from '@digitaldefiance/ecies-lib';
import { ECIESService } from '@digitaldefiance/ecies-lib';
import { EciesMultiRecipient } from '@digitaldefiance/ecies-lib';
import { MemberType } from '@digitaldefiance/ecies-lib';
import { EmailString } from '@digitaldefiance/ecies-lib';
import { SecureBuffer } from '@digitaldefiance/ecies-lib';
import type { IMultiEncryptedMessage, IMultiRecipient } from '@digitaldefiance/ecies-lib';

/**
 * Wrapper for multi-recipient encryption using ecies-lib
 * Encrypts temporal keys for multiple participants
 */
export interface IMultiRecipientEncryption {
  /**
   * Encrypt temporal key for multiple recipients using ECIES
   * Uses EciesMultiRecipient from @digitaldefiance/ecies-lib
   */
  encryptForRecipients(
    temporalKey: Uint8Array,
    recipients: Member[]
  ): Promise<IMultiEncryptedMessage>;
  
  /**
   * Decrypt temporal key for a specific recipient
   * Uses EciesMultiRecipient from @digitaldefiance/ecies-lib
   */
  decryptForRecipient(
    encryptedMessage: IMultiEncryptedMessage,
    recipient: Member
  ): Promise<Uint8Array>;
}

/**
 * Multi-recipient encryption wrapper using ecies-lib
 */
export class MultiRecipientEncryption implements IMultiRecipientEncryption {
  private eciesMultiRecipient: EciesMultiRecipient;
  
  constructor(eciesService: ECIESService) {
    this.eciesMultiRecipient = new EciesMultiRecipient(eciesService.config);
  }
  
  async encryptForRecipients(
    temporalKey: Uint8Array,
    recipients: Member[]
  ): Promise<IMultiEncryptedMessage> {
    // Convert Members to IMultiRecipient format
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
 * Participant representation using Member class from ecies-lib
 * Provides key management, signing, and encryption capabilities
 */
export class Participant {
  private member: Member;
  
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
   * Load existing member from keys
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
  
  get id(): Uint8Array {
    return this.member.id;
  }
  
  get publicKey(): Uint8Array {
    return this.member.publicKey;
  }
  
  get hasPrivateKey(): boolean {
    return this.member.hasPrivateKey;
  }
  
  /**
   * Sign data using member's private key
   */
  sign(data: Uint8Array): Uint8Array {
    const signature = this.member.sign(data);
    // Convert SignatureUint8Array to plain Uint8Array
    return new Uint8Array(signature);
  }
  
  /**
   * Verify signature
   */
  verify(signature: Uint8Array, data: Uint8Array): boolean {
    // Cast to SignatureUint8Array for verification
    return this.member.verify(signature as any, data);
  }
  
  /**
   * Encrypt data for a specific recipient
   */
  async encryptFor(data: Uint8Array, recipientPublicKey: Uint8Array): Promise<Uint8Array> {
    return await this.member.encryptData(data, recipientPublicKey);
  }
  
  /**
   * Decrypt data encrypted for this participant
   */
  async decrypt(encryptedData: Uint8Array): Promise<Uint8Array> {
    return await this.member.decryptData(encryptedData);
  }
  
  /**
   * Get the underlying Member instance
   */
  getMember(): Member {
    return this.member;
  }
  
  /**
   * Securely dispose of keys
   */
  dispose(): void {
    this.member.dispose();
  }
}
