/**
 * Temporal Key Derivation Module
 * 
 * Implements HKDF-based temporal key derivation for time-bound encryption.
 * Keys are automatically rotated on a schedule and include a grace period
 * for handling clock skew between participants.
 * 
 * @module temporal-key-derivation
 */

import { createHmac } from 'crypto';
import { TimeWindow } from '@digitaldefiance/eecp-protocol';

/**
 * Temporal key with validity period and grace period
 * 
 * Represents a time-bound encryption key that is valid for a specific
 * time window and includes a grace period for clock skew handling.
 * 
 * @property {string} id - Unique identifier for the key (e.g., "key-0", "key-1")
 * @property {Buffer} key - 32-byte AES-256 encryption key
 * @property {number} validFrom - Unix timestamp in milliseconds when key becomes valid
 * @property {number} validUntil - Unix timestamp in milliseconds when key expires
 * @property {number} gracePeriodEnd - Unix timestamp in milliseconds when grace period ends
 * 
 * @example
 * ```typescript
 * const temporalKey: TemporalKey = {
 *   id: 'key-1',
 *   key: Buffer.from('...'), // 32 bytes
 *   validFrom: Date.now(),
 *   validUntil: Date.now() + 15 * 60 * 1000, // 15 minutes
 *   gracePeriodEnd: Date.now() + 20 * 60 * 1000 // 20 minutes (15 + 5 grace)
 * };
 * ```
 */
export interface TemporalKey {
  id: string;
  key: Buffer;
  validFrom: number;
  validUntil: number;
  gracePeriodEnd: number;
}

/**
 * Interface for temporal key derivation operations
 * 
 * Defines the contract for deriving, identifying, and validating temporal keys.
 */
export interface ITemporalKeyDerivation {
  /**
   * Derive a temporal key for a specific time window using HKDF-SHA256
   * 
   * Uses HMAC-based Key Derivation Function (HKDF) with SHA-256 to derive
   * a deterministic key from the workspace secret and time window parameters.
   * 
   * @param {Buffer} workspaceSecret - Secret key material for the workspace (32 bytes recommended)
   * @param {TimeWindow} timeWindow - Time window configuration for the key
   * @param {string} keyId - Unique identifier for this key (e.g., "key-0")
   * @returns {Promise<TemporalKey>} The derived temporal key with validity period
   * 
   * @example
   * ```typescript
   * const key = await derivation.deriveKey(
   *   workspaceSecret,
   *   { startTime: Date.now(), endTime: Date.now() + 3600000, ... },
   *   'key-0'
   * );
   * ```
   */
  deriveKey(
    workspaceSecret: Buffer,
    timeWindow: TimeWindow,
    keyId: string
  ): Promise<TemporalKey>;
  
  /**
   * Get the current key ID for a given timestamp
   * 
   * Calculates which key rotation period a timestamp falls into based on
   * the workspace creation time and rotation interval.
   * 
   * @param {number} createdAt - Unix timestamp in milliseconds when workspace was created
   * @param {number} timestamp - Unix timestamp in milliseconds to check
   * @param {number} rotationInterval - Key rotation interval in minutes
   * @returns {string} The key ID for the given timestamp (e.g., "key-2")
   * 
   * @example
   * ```typescript
   * const keyId = derivation.getCurrentKeyId(
   *   Date.now() - 3600000, // Created 1 hour ago
   *   Date.now(),           // Current time
   *   15                    // 15 minute rotation
   * ); // Returns "key-4" (4th rotation period)
   * ```
   */
  getCurrentKeyId(
    createdAt: number,
    timestamp: number,
    rotationInterval: number
  ): string;
  
  /**
   * Check if a key is still valid (within its validity period or grace period)
   * 
   * Determines if a key can still be used for decryption based on the current
   * time and the key's grace period. This allows for clock skew between participants.
   * 
   * @param {string} keyId - ID of the key to check (e.g., "key-1")
   * @param {number} currentTime - Current Unix timestamp in milliseconds
   * @param {number} rotationInterval - Key rotation interval in minutes
   * @param {number} gracePeriod - Grace period in milliseconds
   * @returns {boolean} True if the key is still valid, false otherwise
   * 
   * @example
   * ```typescript
   * const isValid = derivation.isKeyValid(
   *   'key-1',
   *   Date.now(),
   *   15,              // 15 minute rotation
   *   5 * 60 * 1000    // 5 minute grace period
   * );
   * ```
   */
  isKeyValid(
    keyId: string,
    currentTime: number,
    rotationInterval: number,
    gracePeriod: number
  ): boolean;
}

/**
 * Temporal key derivation implementation using HKDF-SHA256
 * 
 * Implements deterministic key derivation for time-bound encryption keys.
 * Uses HKDF (HMAC-based Key Derivation Function) with SHA-256 to derive
 * keys from a workspace secret and time window parameters.
 * 
 * The derivation process ensures that:
 * - Keys are deterministic (same inputs always produce same key)
 * - Keys are cryptographically independent (knowing one key doesn't help derive others)
 * - Keys are time-bound (automatically expire after their validity period)
 * 
 * @implements {ITemporalKeyDerivation}
 * 
 * @example
 * ```typescript
 * const derivation = new TemporalKeyDerivation();
 * const key = await derivation.deriveKey(workspaceSecret, timeWindow, 'key-0');
 * ```
 */
export class TemporalKeyDerivation implements ITemporalKeyDerivation {
  /**
   * HKDF info string for key derivation context
   * @private
   * @readonly
   */
  private readonly HKDF_INFO = 'EECP-Temporal-Key-v1';
  
  /**
   * Length of derived keys in bytes (32 bytes for AES-256)
   * @private
   * @readonly
   */
  private readonly KEY_LENGTH = 32;
  
  /**
   * Derive a temporal key using HKDF-SHA256
   * 
   * Implements the HKDF key derivation function:
   * 1. HKDF-Extract: Derives a pseudorandom key (PRK) from the workspace secret
   * 2. HKDF-Expand: Expands the PRK into the final key material
   * 
   * The salt is constructed from the key ID and time window start time to ensure
   * each key is unique and deterministic.
   * 
   * @param {Buffer} workspaceSecret - Secret key material for the workspace
   * @param {TimeWindow} timeWindow - Time window configuration
   * @param {string} keyId - Unique identifier for this key
   * @returns {Promise<TemporalKey>} The derived temporal key
   * 
   * @throws {Error} If workspace secret is invalid or empty
   */
  async deriveKey(
    workspaceSecret: Buffer,
    timeWindow: TimeWindow,
    keyId: string
  ): Promise<TemporalKey> {
    // Create salt from keyId and time window start
    // This ensures each key is unique and deterministic
    const salt = Buffer.concat([
      Buffer.from(keyId, 'utf8'),
      Buffer.from(timeWindow.startTime.toString(), 'utf8')
    ]);
    
    // HKDF-Extract: PRK = HMAC-Hash(salt, IKM)
    // Derives a pseudorandom key from the input key material
    const prk = createHmac('sha256', salt)
      .update(workspaceSecret)
      .digest();
    
    // HKDF-Expand: OKM = HMAC-Hash(PRK, info || 0x01)
    // Expands the PRK into the final output key material
    const info = Buffer.concat([
      Buffer.from(this.HKDF_INFO, 'utf8'),
      Buffer.from([0x01])
    ]);
    
    const key = createHmac('sha256', prk)
      .update(info)
      .digest()
      .subarray(0, this.KEY_LENGTH);
    
    return {
      id: keyId,
      key,
      validFrom: timeWindow.startTime,
      validUntil: timeWindow.endTime,
      gracePeriodEnd: timeWindow.endTime + timeWindow.gracePeriod
    };
  }
  
  /**
   * Calculate the current key ID based on rotation interval
   * 
   * Determines which key rotation period a timestamp falls into by:
   * 1. Calculating elapsed time since workspace creation
   * 2. Dividing by rotation interval to get rotation number
   * 3. Formatting as "key-N" where N is the rotation number
   * 
   * @param {number} createdAt - Workspace creation timestamp
   * @param {number} timestamp - Timestamp to check
   * @param {number} rotationInterval - Rotation interval in minutes
   * @returns {string} Key ID (e.g., "key-0", "key-1", "key-2")
   */
  getCurrentKeyId(
    createdAt: number,
    timestamp: number,
    rotationInterval: number
  ): string {
    // Calculate elapsed time in milliseconds
    const elapsed = timestamp - createdAt;
    
    // Calculate rotation number (which rotation period we're in)
    const rotationMs = rotationInterval * 60 * 1000;
    const rotationNumber = Math.floor(elapsed / rotationMs);
    
    return `key-${rotationNumber}`;
  }
  
  /**
   * Check if a key is still valid (current or within grace period)
   * 
   * A key is considered valid if the current time is before the end of its
   * grace period. This allows for clock skew between participants while still
   * ensuring keys are eventually deleted.
   * 
   * @param {string} keyId - Key ID to check (must match format "key-N")
   * @param {number} currentTime - Current timestamp
   * @param {number} rotationInterval - Rotation interval in minutes
   * @param {number} gracePeriod - Grace period in milliseconds
   * @returns {boolean} True if key is valid, false otherwise
   */
  isKeyValid(
    keyId: string,
    currentTime: number,
    rotationInterval: number,
    gracePeriod: number
  ): boolean {
    // Extract rotation number from keyId
    const match = keyId.match(/^key-(\d+)$/);
    if (!match) {
      return false;
    }
    
    const rotationNumber = parseInt(match[1], 10);
    
    // Calculate when this key's validity period ends
    const rotationMs = rotationInterval * 60 * 1000;
    const keyValidUntil = rotationNumber * rotationMs + rotationMs;
    const keyGracePeriodEnd = keyValidUntil + gracePeriod;
    
    // Key is valid if we're before the grace period end
    return currentTime < keyGracePeriodEnd;
  }
}
