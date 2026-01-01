import { createHmac } from 'crypto';
import { TimeWindow } from '@digitaldefiance-eecp/eecp-protocol';

/**
 * Temporal key with validity period
 */
export interface TemporalKey {
  id: string;
  key: Buffer; // 32 bytes for AES-256
  validFrom: number;
  validUntil: number;
  gracePeriodEnd: number;
}

/**
 * Interface for temporal key derivation
 */
export interface ITemporalKeyDerivation {
  /**
   * Derive a temporal key for a specific time window
   * Uses HKDF with workspace secret and time window as inputs
   */
  deriveKey(
    workspaceSecret: Buffer,
    timeWindow: TimeWindow,
    keyId: string
  ): Promise<TemporalKey>;
  
  /**
   * Get the current key ID for a given timestamp
   */
  getCurrentKeyId(
    createdAt: number,
    timestamp: number,
    rotationInterval: number
  ): string;
  
  /**
   * Check if a key is still valid (within grace period)
   */
  isKeyValid(
    keyId: string,
    currentTime: number,
    rotationInterval: number,
    gracePeriod: number
  ): boolean;
}

/**
 * Temporal key derivation using HKDF-SHA256
 */
export class TemporalKeyDerivation implements ITemporalKeyDerivation {
  private readonly HKDF_INFO = 'EECP-Temporal-Key-v1';
  private readonly KEY_LENGTH = 32; // 32 bytes for AES-256
  
  /**
   * Derive a temporal key using HKDF-SHA256
   */
  async deriveKey(
    workspaceSecret: Buffer,
    timeWindow: TimeWindow,
    keyId: string
  ): Promise<TemporalKey> {
    // Create salt from keyId and time window start
    const salt = Buffer.concat([
      Buffer.from(keyId, 'utf8'),
      Buffer.from(timeWindow.startTime.toString(), 'utf8')
    ]);
    
    // HKDF-Extract: PRK = HMAC-Hash(salt, IKM)
    const prk = createHmac('sha256', salt)
      .update(workspaceSecret)
      .digest();
    
    // HKDF-Expand: OKM = HMAC-Hash(PRK, info || 0x01)
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
