import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { TemporalKey } from './temporal-key-derivation.js';

/**
 * Encrypted payload with authentication
 */
export interface EncryptedPayload {
  ciphertext: Buffer;
  nonce: Buffer; // 12 bytes for GCM
  authTag: Buffer; // 16 bytes for GCM
  keyId: string;
}

/**
 * Interface for time-locked encryption
 */
export interface ITimeLockedEncryption {
  /**
   * Encrypt content with temporal key
   * Uses AES-256-GCM for authenticated encryption
   */
  encrypt(
    content: Buffer,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<EncryptedPayload>;
  
  /**
   * Decrypt content with temporal key
   */
  decrypt(
    encrypted: EncryptedPayload,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<Buffer>;
  
  /**
   * Securely destroy a key from memory
   */
  destroyKey(key: TemporalKey): void;
}

/**
 * Time-locked encryption using AES-256-GCM
 */
export class TimeLockedEncryption implements ITimeLockedEncryption {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly NONCE_LENGTH = 12; // 12 bytes for GCM
  
  /**
   * Encrypt content using AES-256-GCM with temporal key
   */
  async encrypt(
    content: Buffer,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<EncryptedPayload> {
    // Generate random nonce
    const nonce = randomBytes(this.NONCE_LENGTH);
    
    // Create cipher
    const cipher = createCipheriv(this.ALGORITHM, temporalKey.key, nonce);
    
    // Combine keyId and additional data into single AAD
    const keyIdBuffer = Buffer.from(temporalKey.id, 'utf8');
    const aad = additionalData 
      ? Buffer.concat([keyIdBuffer, additionalData])
      : keyIdBuffer;
    
    // Set combined AAD
    cipher.setAAD(aad);
    
    // Encrypt content
    const ciphertext = Buffer.concat([
      cipher.update(content),
      cipher.final()
    ]);
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext,
      nonce,
      authTag,
      keyId: temporalKey.id
    };
  }
  
  /**
   * Decrypt content using AES-256-GCM with temporal key
   */
  async decrypt(
    encrypted: EncryptedPayload,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<Buffer> {
    // Verify keyId matches
    if (encrypted.keyId !== temporalKey.id) {
      throw new Error(`Key ID mismatch: expected ${temporalKey.id}, got ${encrypted.keyId}`);
    }
    
    // Create decipher
    const decipher = createDecipheriv(
      this.ALGORITHM,
      temporalKey.key,
      encrypted.nonce
    );
    
    // Set authentication tag
    decipher.setAuthTag(encrypted.authTag);
    
    // Combine keyId and additional data into single AAD (must match encryption)
    const keyIdBuffer = Buffer.from(temporalKey.id, 'utf8');
    const aad = additionalData 
      ? Buffer.concat([keyIdBuffer, additionalData])
      : keyIdBuffer;
    
    // Set combined AAD
    decipher.setAAD(aad);
    
    // Decrypt content
    const plaintext = Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final()
    ]);
    
    return plaintext;
  }
  
  /**
   * Securely destroy a key from memory
   * Overwrites the key buffer with random data then zeros it
   */
  destroyKey(key: TemporalKey): void {
    if (!key.key || key.key.length === 0) {
      return;
    }
    
    // Overwrite with random data
    const random = randomBytes(key.key.length);
    random.copy(key.key);
    
    // Zero out the buffer
    key.key.fill(0);
    
    // Note: In a production system, you might also want to:
    // - Clear any caches that might hold the key
    // - Use platform-specific secure memory clearing if available
    // - Trigger garbage collection (though not guaranteed in JS)
  }
}
