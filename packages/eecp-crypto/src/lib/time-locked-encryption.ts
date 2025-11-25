/**
 * Time-Locked Encryption Module
 * 
 * Implements authenticated encryption using AES-256-GCM with temporal keys.
 * Provides confidentiality and integrity for content that should only be
 * accessible during a specific time window.
 * 
 * Security Features:
 * - AES-256-GCM for authenticated encryption (prevents tampering)
 * - Random nonces for each encryption (prevents replay attacks)
 * - Additional authenticated data (AAD) support
 * - Secure key destruction after expiration
 * 
 * @module time-locked-encryption
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { TemporalKey } from './temporal-key-derivation.js';

/**
 * Encrypted payload with authentication tag
 * 
 * Contains all the data needed to decrypt content, including the ciphertext,
 * nonce, authentication tag, and key ID. The authentication tag ensures
 * the ciphertext hasn't been tampered with.
 * 
 * @property {Buffer} ciphertext - Encrypted content
 * @property {Buffer} nonce - 12-byte random nonce for GCM mode
 * @property {Buffer} authTag - 16-byte authentication tag for integrity verification
 * @property {string} keyId - ID of the temporal key used for encryption
 * 
 * @example
 * ```typescript
 * const payload: EncryptedPayload = {
 *   ciphertext: Buffer.from('...'),
 *   nonce: Buffer.from('...'), // 12 bytes
 *   authTag: Buffer.from('...'), // 16 bytes
 *   keyId: 'key-1'
 * };
 * ```
 */
export interface EncryptedPayload {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyId: string;
}

/**
 * Interface for time-locked encryption operations
 * 
 * Defines the contract for encrypting and decrypting content with temporal keys,
 * as well as securely destroying keys after they expire.
 */
export interface ITimeLockedEncryption {
  /**
   * Encrypt content with a temporal key using AES-256-GCM
   * 
   * Provides authenticated encryption, ensuring both confidentiality and integrity.
   * The key ID is automatically included in the additional authenticated data (AAD)
   * to bind the ciphertext to the specific key.
   * 
   * @param {Buffer} content - Plaintext content to encrypt
   * @param {TemporalKey} temporalKey - Temporal key to use for encryption
   * @param {Buffer} [additionalData] - Optional additional authenticated data (AAD)
   * @returns {Promise<EncryptedPayload>} Encrypted payload with nonce and auth tag
   * 
   * @example
   * ```typescript
   * const encrypted = await encryption.encrypt(
   *   Buffer.from('Hello, world!'),
   *   temporalKey,
   *   Buffer.from('metadata')
   * );
   * ```
   */
  encrypt(
    content: Buffer,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<EncryptedPayload>;
  
  /**
   * Decrypt content with a temporal key using AES-256-GCM
   * 
   * Verifies the authentication tag before decrypting to ensure the ciphertext
   * hasn't been tampered with. Throws an error if verification fails.
   * 
   * @param {EncryptedPayload} encrypted - Encrypted payload to decrypt
   * @param {TemporalKey} temporalKey - Temporal key to use for decryption
   * @param {Buffer} [additionalData] - Optional AAD (must match encryption AAD)
   * @returns {Promise<Buffer>} Decrypted plaintext content
   * 
   * @throws {Error} If key ID doesn't match
   * @throws {Error} If authentication tag verification fails
   * 
   * @example
   * ```typescript
   * const plaintext = await encryption.decrypt(
   *   encrypted,
   *   temporalKey,
   *   Buffer.from('metadata')
   * );
   * ```
   */
  decrypt(
    encrypted: EncryptedPayload,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<Buffer>;
  
  /**
   * Securely destroy a temporal key from memory
   * 
   * Overwrites the key material with random data and then zeros it out
   * to prevent recovery from memory dumps or swap files.
   * 
   * @param {TemporalKey} key - Temporal key to destroy
   * 
   * @example
   * ```typescript
   * encryption.destroyKey(expiredKey);
   * ```
   */
  destroyKey(key: TemporalKey): void;
}

/**
 * Time-locked encryption implementation using AES-256-GCM
 * 
 * Implements authenticated encryption with associated data (AEAD) using
 * AES-256 in Galois/Counter Mode (GCM). This provides both confidentiality
 * and integrity protection for encrypted content.
 * 
 * Security Properties:
 * - Confidentiality: Content is encrypted with AES-256
 * - Integrity: Authentication tag prevents tampering
 * - Authenticity: AAD binds ciphertext to context (key ID)
 * - Freshness: Random nonces prevent replay attacks
 * 
 * @implements {ITimeLockedEncryption}
 * 
 * @example
 * ```typescript
 * const encryption = new TimeLockedEncryption();
 * const encrypted = await encryption.encrypt(content, temporalKey);
 * const decrypted = await encryption.decrypt(encrypted, temporalKey);
 * ```
 */
export class TimeLockedEncryption implements ITimeLockedEncryption {
  /**
   * AES-256-GCM algorithm identifier
   * @private
   * @readonly
   */
  private readonly ALGORITHM = 'aes-256-gcm';
  
  /**
   * Nonce length for GCM mode (12 bytes is optimal for GCM)
   * @private
   * @readonly
   */
  private readonly NONCE_LENGTH = 12;
  
  /**
   * Encrypt content using AES-256-GCM with temporal key
   * 
   * Performs authenticated encryption:
   * 1. Generates a random 12-byte nonce
   * 2. Creates AES-256-GCM cipher with temporal key and nonce
   * 3. Sets additional authenticated data (AAD) including key ID
   * 4. Encrypts the content
   * 5. Extracts the authentication tag
   * 
   * The key ID is always included in the AAD to bind the ciphertext
   * to the specific temporal key, preventing key substitution attacks.
   * 
   * @param {Buffer} content - Plaintext content to encrypt
   * @param {TemporalKey} temporalKey - Temporal key for encryption
   * @param {Buffer} [additionalData] - Optional additional authenticated data
   * @returns {Promise<EncryptedPayload>} Encrypted payload with nonce and auth tag
   * 
   * @example
   * ```typescript
   * const content = Buffer.from('Sensitive data');
   * const encrypted = await encryption.encrypt(content, temporalKey);
   * console.log(encrypted.keyId); // 'key-1'
   * console.log(encrypted.nonce.length); // 12
   * console.log(encrypted.authTag.length); // 16
   * ```
   */
  async encrypt(
    content: Buffer,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<EncryptedPayload> {
    // Generate random nonce (12 bytes is optimal for GCM)
    const nonce = randomBytes(this.NONCE_LENGTH);
    
    // Create cipher with AES-256-GCM
    const cipher = createCipheriv(this.ALGORITHM, temporalKey.key, nonce);
    
    // Combine keyId and additional data into single AAD
    // This binds the ciphertext to the specific key
    const keyIdBuffer = Buffer.from(temporalKey.id, 'utf8');
    const aad = additionalData 
      ? Buffer.concat([keyIdBuffer, additionalData])
      : keyIdBuffer;
    
    // Set additional authenticated data
    cipher.setAAD(aad);
    
    // Encrypt content
    const ciphertext = Buffer.concat([
      cipher.update(content),
      cipher.final()
    ]);
    
    // Get authentication tag (16 bytes for GCM)
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
   * 
   * Performs authenticated decryption:
   * 1. Verifies the key ID matches
   * 2. Creates AES-256-GCM decipher with temporal key and nonce
   * 3. Sets the authentication tag
   * 4. Sets additional authenticated data (AAD) including key ID
   * 5. Decrypts and verifies the content
   * 
   * If the authentication tag doesn't match, decryption fails with an error,
   * indicating the ciphertext was tampered with or the wrong key was used.
   * 
   * @param {EncryptedPayload} encrypted - Encrypted payload to decrypt
   * @param {TemporalKey} temporalKey - Temporal key for decryption
   * @param {Buffer} [additionalData] - Optional AAD (must match encryption)
   * @returns {Promise<Buffer>} Decrypted plaintext content
   * 
   * @throws {Error} If key ID doesn't match the temporal key
   * @throws {Error} If authentication tag verification fails (tampering detected)
   * 
   * @example
   * ```typescript
   * try {
   *   const plaintext = await encryption.decrypt(encrypted, temporalKey);
   *   console.log(plaintext.toString()); // 'Sensitive data'
   * } catch (error) {
   *   console.error('Decryption failed:', error.message);
   * }
   * ```
   */
  async decrypt(
    encrypted: EncryptedPayload,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<Buffer> {
    // Verify keyId matches to prevent key substitution attacks
    if (encrypted.keyId !== temporalKey.id) {
      throw new Error(`Key ID mismatch: expected ${temporalKey.id}, got ${encrypted.keyId}`);
    }
    
    // Create decipher with AES-256-GCM
    const decipher = createDecipheriv(
      this.ALGORITHM,
      temporalKey.key,
      encrypted.nonce
    );
    
    // Set authentication tag for verification
    decipher.setAuthTag(encrypted.authTag);
    
    // Combine keyId and additional data into single AAD (must match encryption)
    const keyIdBuffer = Buffer.from(temporalKey.id, 'utf8');
    const aad = additionalData 
      ? Buffer.concat([keyIdBuffer, additionalData])
      : keyIdBuffer;
    
    // Set additional authenticated data
    decipher.setAAD(aad);
    
    // Decrypt content (will throw if auth tag verification fails)
    const plaintext = Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final()
    ]);
    
    return plaintext;
  }
  
  /**
   * Securely destroy a temporal key from memory
   * 
   * Implements secure key deletion by:
   * 1. Overwriting the key buffer with random data
   * 2. Zeroing out the buffer
   * 
   * This prevents key recovery from memory dumps, swap files, or
   * hibernation files. While JavaScript doesn't provide guaranteed
   * memory clearing, this is a best-effort approach.
   * 
   * Note: In a production system, you might also want to:
   * - Clear any caches that might hold the key
   * - Use platform-specific secure memory clearing if available
   * - Trigger garbage collection (though not guaranteed in JS)
   * 
   * @param {TemporalKey} key - Temporal key to destroy
   * 
   * @example
   * ```typescript
   * // After key expires
   * encryption.destroyKey(expiredKey);
   * // Key material is now overwritten and zeroed
   * ```
   */
  destroyKey(key: TemporalKey): void {
    if (!key.key || key.key.length === 0) {
      return;
    }
    
    // Overwrite with random data first
    const random = randomBytes(key.key.length);
    random.copy(key.key);
    
    // Then zero out the buffer
    key.key.fill(0);
    
    // Note: In a production system, you might also want to:
    // - Clear any caches that might hold the key
    // - Use platform-specific secure memory clearing if available
    // - Trigger garbage collection (though not guaranteed in JS)
  }
}
