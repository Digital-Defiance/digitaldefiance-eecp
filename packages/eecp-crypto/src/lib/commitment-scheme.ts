import { createHash } from 'crypto';
import { TemporalKey } from './temporal-key-derivation.js';

/**
 * Cryptographic commitment to a key before deletion
 */
export interface Commitment {
  keyId: string;
  hash: Buffer; // SHA-256 of key + metadata
  timestamp: number;
  validFrom: number;
  validUntil: number;
}

/**
 * Interface for commitment scheme
 */
export interface ICommitmentScheme {
  /**
   * Create a commitment to a key before deletion
   */
  createCommitment(key: TemporalKey): Commitment;
  
  /**
   * Verify a commitment matches the claimed key properties
   */
  verifyCommitment(
    commitment: Commitment,
    keyId: string,
    validFrom: number,
    validUntil: number
  ): boolean;
  
  /**
   * Publish commitment to verifiable log
   */
  publishCommitment(commitment: Commitment): Promise<void>;
}

/**
 * Commitment scheme for proving key deletion
 * Creates SHA-256 commitments before key deletion
 */
export class CommitmentScheme implements ICommitmentScheme {
  private commitmentLog: Commitment[] = [];
  
  /**
   * Create a cryptographic commitment to a key
   * Hash: SHA-256(key || keyId || validFrom || validUntil)
   */
  createCommitment(key: TemporalKey): Commitment {
    // Concatenate key material and metadata
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
   * Cannot verify the key itself (it's deleted), but can verify metadata
   */
  verifyCommitment(
    commitment: Commitment,
    keyId: string,
    validFrom: number,
    validUntil: number
  ): boolean {
    // Verify metadata matches
    return (
      commitment.keyId === keyId &&
      commitment.validFrom === validFrom &&
      commitment.validUntil === validUntil
    );
  }
  
  /**
   * Publish commitment to append-only log
   * In production, this could use a blockchain or signed log file
   * For now, we use an in-memory append-only log
   */
  async publishCommitment(commitment: Commitment): Promise<void> {
    // Append to log (simulating append-only behavior)
    this.commitmentLog.push(commitment);
  }
  
  /**
   * Get all published commitments (for testing/verification)
   */
  getCommitmentLog(): Commitment[] {
    return [...this.commitmentLog];
  }
  
  /**
   * Find a commitment by key ID
   */
  findCommitment(keyId: string): Commitment | undefined {
    return this.commitmentLog.find(c => c.keyId === keyId);
  }
}
