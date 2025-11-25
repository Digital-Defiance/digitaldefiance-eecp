/**
 * Cryptographic Commitment Scheme Module
 * 
 * Implements a commitment scheme for proving temporal key deletion.
 * Before deleting a key, a cryptographic commitment (hash) is created
 * and published to a verifiable log. This provides proof that the key
 * existed before deletion without revealing the key itself.
 * 
 * The commitment scheme ensures:
 * - Binding: Cannot change the committed value after commitment
 * - Hiding: Commitment doesn't reveal the committed value
 * - Verifiability: Can prove a value matches a commitment
 * 
 * @module commitment-scheme
 */

import { createHash } from 'crypto';
import { TemporalKey } from './temporal-key-derivation.js';

/**
 * Cryptographic commitment to a temporal key before deletion
 * 
 * A commitment is a cryptographic hash of the key material and metadata
 * that proves the key existed with specific properties before deletion.
 * The commitment can be verified against the claimed properties without
 * revealing the actual key.
 * 
 * @property {string} keyId - Unique identifier of the committed key
 * @property {Buffer} hash - SHA-256 hash of key + metadata
 * @property {number} timestamp - Unix timestamp in milliseconds when commitment was created
 * @property {number} validFrom - Unix timestamp when key became valid
 * @property {number} validUntil - Unix timestamp when key expired
 * 
 * @example
 * ```typescript
 * const commitment: Commitment = {
 *   keyId: 'key-1',
 *   hash: Buffer.from('...'), // 32 bytes SHA-256
 *   timestamp: Date.now(),
 *   validFrom: Date.now() - 3600000,
 *   validUntil: Date.now()
 * };
 * ```
 */
export interface Commitment {
  keyId: string;
  hash: Buffer;
  timestamp: number;
  validFrom: number;
  validUntil: number;
}

/**
 * Interface for commitment scheme operations
 * 
 * Defines the contract for creating, verifying, and publishing
 * cryptographic commitments to temporal keys.
 */
export interface ICommitmentScheme {
  /**
   * Create a cryptographic commitment to a temporal key before deletion
   * 
   * Generates a SHA-256 hash of the key material and metadata to create
   * a binding commitment. This commitment proves the key existed with
   * specific properties without revealing the key itself.
   * 
   * @param {TemporalKey} key - Temporal key to commit to
   * @returns {Commitment} Cryptographic commitment
   * 
   * @example
   * ```typescript
   * const commitment = scheme.createCommitment(temporalKey);
   * await scheme.publishCommitment(commitment);
   * // Now safe to delete the key
   * ```
   */
  createCommitment(key: TemporalKey): Commitment;
  
  /**
   * Verify a commitment matches the claimed key properties
   * 
   * Verifies that a commitment's metadata (key ID, validity period) matches
   * the claimed values. Cannot verify the actual key since it's been deleted,
   * but can verify the commitment was made for a key with these properties.
   * 
   * @param {Commitment} commitment - Commitment to verify
   * @param {string} keyId - Claimed key ID
   * @param {number} validFrom - Claimed validity start time
   * @param {number} validUntil - Claimed validity end time
   * @returns {boolean} True if metadata matches, false otherwise
   * 
   * @example
   * ```typescript
   * const isValid = scheme.verifyCommitment(
   *   commitment,
   *   'key-1',
   *   startTime,
   *   endTime
   * );
   * ```
   */
  verifyCommitment(
    commitment: Commitment,
    keyId: string,
    validFrom: number,
    validUntil: number
  ): boolean;
  
  /**
   * Publish commitment to a verifiable append-only log
   * 
   * Stores the commitment in a log that can be audited to prove
   * keys were properly deleted. In production, this could use a
   * blockchain or cryptographically signed log file.
   * 
   * @param {Commitment} commitment - Commitment to publish
   * @returns {Promise<void>}
   * 
   * @example
   * ```typescript
   * await scheme.publishCommitment(commitment);
   * // Commitment is now in the verifiable log
   * ```
   */
  publishCommitment(commitment: Commitment): Promise<void>;
}

/**
 * Commitment scheme implementation for proving key deletion
 * 
 * Implements a cryptographic commitment scheme using SHA-256 hashing.
 * Before deleting a temporal key, a commitment is created and published
 * to an append-only log. This provides verifiable proof that keys were
 * properly deleted according to the ephemeral guarantee.
 * 
 * The commitment hash is computed as:
 * SHA-256(key || keyId || validFrom || validUntil)
 * 
 * This binds the commitment to both the key material and its metadata,
 * ensuring the commitment cannot be reused for different keys or time periods.
 * 
 * @implements {ICommitmentScheme}
 * 
 * @example
 * ```typescript
 * const scheme = new CommitmentScheme();
 * 
 * // Before deleting a key
 * const commitment = scheme.createCommitment(temporalKey);
 * await scheme.publishCommitment(commitment);
 * 
 * // Now safe to delete the key
 * encryption.destroyKey(temporalKey);
 * 
 * // Later, verify the commitment exists
 * const found = scheme.findCommitment('key-1');
 * ```
 */
export class CommitmentScheme implements ICommitmentScheme {
  /**
   * In-memory append-only log of commitments
   * In production, this would be a persistent, tamper-evident log
   * @private
   */
  private commitmentLog: Commitment[] = [];
  
  /**
   * Create a cryptographic commitment to a temporal key
   * 
   * Computes SHA-256 hash of the key material concatenated with metadata:
   * hash = SHA-256(key || keyId || validFrom || validUntil)
   * 
   * This creates a binding commitment that:
   * - Proves the key existed (hiding property)
   * - Cannot be changed after creation (binding property)
   * - Can be verified against claimed properties
   * 
   * @param {TemporalKey} key - Temporal key to commit to
   * @returns {Commitment} Cryptographic commitment with hash and metadata
   * 
   * @example
   * ```typescript
   * const commitment = scheme.createCommitment(temporalKey);
   * console.log(commitment.hash.length); // 32 bytes (SHA-256)
   * console.log(commitment.keyId); // 'key-1'
   * ```
   */
  createCommitment(key: TemporalKey): Commitment {
    // Concatenate key material and metadata
    // This binds the commitment to both the key and its properties
    const data = Buffer.concat([
      key.key,
      Buffer.from(key.id, 'utf8'),
      Buffer.from(key.validFrom.toString(), 'utf8'),
      Buffer.from(key.validUntil.toString(), 'utf8')
    ]);
    
    // Create SHA-256 hash
    const hash = createHash('sha256').update(data).digest();
    
    return {
      keyId: key.id,
      hash,
      timestamp: Date.now(),
      validFrom: key.validFrom,
      validUntil: key.validUntil
    };
  }
  
  /**
   * Verify a commitment matches the claimed key properties
   * 
   * Checks that the commitment's metadata (key ID, validity period) matches
   * the claimed values. This verifies the commitment was made for a key with
   * these specific properties.
   * 
   * Note: Cannot verify the actual key material since it's been deleted.
   * This is intentional - the commitment proves the key existed without
   * revealing it.
   * 
   * @param {Commitment} commitment - Commitment to verify
   * @param {string} keyId - Claimed key ID
   * @param {number} validFrom - Claimed validity start time
   * @param {number} validUntil - Claimed validity end time
   * @returns {boolean} True if all metadata matches, false otherwise
   * 
   * @example
   * ```typescript
   * const commitment = scheme.findCommitment('key-1');
   * if (commitment) {
   *   const isValid = scheme.verifyCommitment(
   *     commitment,
   *     'key-1',
   *     startTime,
   *     endTime
   *   );
   *   console.log('Commitment valid:', isValid);
   * }
   * ```
   */
  verifyCommitment(
    commitment: Commitment,
    keyId: string,
    validFrom: number,
    validUntil: number
  ): boolean {
    // Verify metadata matches
    // Cannot verify the key itself (it's deleted), but can verify
    // the commitment was made for a key with these properties
    return (
      commitment.keyId === keyId &&
      commitment.validFrom === validFrom &&
      commitment.validUntil === validUntil
    );
  }
  
  /**
   * Publish commitment to append-only log
   * 
   * Appends the commitment to a verifiable log that can be audited to prove
   * keys were properly deleted. The log is append-only to prevent tampering.
   * 
   * In production, this could use:
   * - Blockchain for distributed verification
   * - Cryptographically signed log files
   * - Tamper-evident database with Merkle trees
   * 
   * For now, we use an in-memory append-only array.
   * 
   * @param {Commitment} commitment - Commitment to publish
   * @returns {Promise<void>}
   * 
   * @example
   * ```typescript
   * await scheme.publishCommitment(commitment);
   * // Commitment is now in the verifiable log
   * const log = scheme.getCommitmentLog();
   * console.log('Total commitments:', log.length);
   * ```
   */
  async publishCommitment(commitment: Commitment): Promise<void> {
    // Append to log (simulating append-only behavior)
    // In production, this would write to a persistent, tamper-evident log
    this.commitmentLog.push(commitment);
  }
  
  /**
   * Get all published commitments
   * 
   * Returns a copy of the commitment log for auditing and verification.
   * The returned array is a copy to prevent external modification of the log.
   * 
   * @returns {Commitment[]} Array of all published commitments
   * 
   * @example
   * ```typescript
   * const log = scheme.getCommitmentLog();
   * console.log(`Found ${log.length} commitments`);
   * log.forEach(c => console.log(`Key ${c.keyId} deleted at ${c.timestamp}`));
   * ```
   */
  getCommitmentLog(): Commitment[] {
    return [...this.commitmentLog];
  }
  
  /**
   * Find a commitment by key ID
   * 
   * Searches the commitment log for a commitment matching the given key ID.
   * Returns the first matching commitment, or undefined if not found.
   * 
   * @param {string} keyId - Key ID to search for
   * @returns {Commitment | undefined} Matching commitment or undefined
   * 
   * @example
   * ```typescript
   * const commitment = scheme.findCommitment('key-1');
   * if (commitment) {
   *   console.log('Found commitment for key-1');
   *   console.log('Deleted at:', new Date(commitment.timestamp));
   * } else {
   *   console.log('No commitment found for key-1');
   * }
   * ```
   */
  findCommitment(keyId: string): Commitment | undefined {
    return this.commitmentLog.find(c => c.keyId === keyId);
  }
}
