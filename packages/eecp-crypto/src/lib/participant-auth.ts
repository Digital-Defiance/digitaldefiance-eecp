/**
 * Participant Authentication using Zero-Knowledge Proofs
 * 
 * Implements challenge-response authentication where the server can verify
 * a participant's identity without learning their private key.
 * Uses Member from @digitaldefiance/ecies-lib for cryptographic operations.
 */

import { randomBytes } from 'crypto';
import { ParticipantId } from '@digitaldefiance/eecp-protocol';
import { Member } from '@digitaldefiance/ecies-lib';

// Re-export shared ECIES configuration
export { eciesService, eciesConfig, generateId } from './ecies-config.js';

/**
 * Zero-knowledge proof for authentication
 */
export interface ZeroKnowledgeProof {
  signature: Buffer | Uint8Array; // ECDSA signature of challenge
  timestamp: number;
}

/**
 * Interface for participant authentication operations
 */
export interface IParticipantAuth {
  /**
   * Generate zero-knowledge proof for authentication
   * Signs the challenge with the participant's Member
   */
  generateProof(
    participantId: ParticipantId,
    member: Member,
    challenge: Buffer
  ): ZeroKnowledgeProof;

  /**
   * Verify zero-knowledge proof without learning identity
   * Verifies the signature using the Member's public key
   */
  verifyProof(
    proof: ZeroKnowledgeProof,
    member: Member,
    challenge: Buffer,
    participantId?: ParticipantId
  ): boolean;

  /**
   * Generate challenge for authentication
   * Creates a random challenge that must be signed by the participant
   */
  generateChallenge(): Buffer;
}

/**
 * Implementation of zero-knowledge participant authentication
 */
export class ParticipantAuth implements IParticipantAuth {
  private readonly CHALLENGE_SIZE = 32; // 32 bytes (256 bits)
  private readonly TIMESTAMP_TOLERANCE = 60 * 1000; // 60 seconds

  /**
   * Generate a zero-knowledge proof by signing the challenge
   * 
   * @param participantId - The participant's unique identifier
   * @param member - The participant's Member instance with private key
   * @param challenge - The challenge to sign
   * @returns Zero-knowledge proof containing signature and timestamp
   */
  generateProof(
    participantId: ParticipantId,
    member: Member,
    challenge: Buffer
  ): ZeroKnowledgeProof {
    if (!participantId) {
      throw new Error('Participant ID is required');
    }

    if (!member) {
      throw new Error('Member is required');
    }

    if (!member.hasPrivateKey) {
      throw new Error('Member must have private key loaded');
    }

    if (!challenge || challenge.length === 0) {
      throw new Error('Challenge is required');
    }

    const timestamp = Date.now();

    // Create message to sign: challenge || timestamp || participantId
    // Convert ParticipantId (GuidV4) to string for consistent serialization
    const participantIdStr = typeof participantId === 'string' 
      ? participantId 
      : participantId.toString();
    
    const message = Buffer.concat([
      challenge,
      Buffer.from(timestamp.toString()),
      Buffer.from(participantIdStr),
    ]);

    // Sign the message using Member's sign method
    const signatureUint8 = member.sign(new Uint8Array(message));
    const signature = Buffer.from(signatureUint8);

    return {
      signature,
      timestamp,
    };
  }

  /**
   * Verify a zero-knowledge proof without learning the participant's identity
   * 
   * The server can verify the signature is valid without learning the private key.
   * This maintains zero-knowledge property.
   * 
   * @param proof - The zero-knowledge proof to verify
   * @param member - The participant's Member instance (public key only)
   * @param challenge - The original challenge that was signed
   * @param participantId - The participant's ID (from handshake)
   * @returns true if the proof is valid, false otherwise
   */
  verifyProof(
    proof: ZeroKnowledgeProof,
    member: Member,
    challenge: Buffer,
    participantId?: ParticipantId
  ): boolean {
    if (!proof || !proof.signature || !proof.timestamp) {
      return false;
    }

    if (!member) {
      return false;
    }

    if (!challenge || challenge.length === 0) {
      return false;
    }

    // Check timestamp is recent (prevent replay attacks)
    const now = Date.now();
    const timeDiff = Math.abs(now - proof.timestamp);
    if (timeDiff > this.TIMESTAMP_TOLERANCE) {
      return false;
    }

    try {
      // Reconstruct the message that was signed
      let message: Buffer;
      if (participantId) {
        // Convert ParticipantId (GuidV4) to string for consistent serialization
        const participantIdStr = typeof participantId === 'string'
          ? participantId
          : participantId.toString();
        
        message = Buffer.concat([
          challenge,
          Buffer.from(proof.timestamp.toString()),
          Buffer.from(participantIdStr),
        ]);
      } else {
        message = Buffer.concat([
          challenge,
          Buffer.from(proof.timestamp.toString()),
        ]);
      }

      // Verify the signature using Member's verify method
      const signatureUint8 = new Uint8Array(proof.signature);
      const messageUint8 = new Uint8Array(message);
      
      return member.verify(signatureUint8 as any, messageUint8);
    } catch (error) {
      // Any error in verification means the proof is invalid
      return false;
    }
  }

  /**
   * Generate a random challenge for authentication
   * 
   * The challenge is a random value that the participant must sign
   * to prove they possess the private key.
   * 
   * @returns Random challenge bytes
   */
  generateChallenge(): Buffer {
    return randomBytes(this.CHALLENGE_SIZE);
  }
}
