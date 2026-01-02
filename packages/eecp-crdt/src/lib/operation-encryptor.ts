/**
 * Operation Encryptor Module
 * 
 * Handles encryption, decryption, and signing of CRDT operations for secure
 * transmission over untrusted networks. Operations are encrypted with temporal
 * keys to ensure time-bound confidentiality and signed with participant private
 * keys to ensure authenticity.
 * 
 * Security Features:
 * - AES-256-GCM encryption via TimeLockedEncryption
 * - ECDSA signatures for authentication
 * - Tamper-evident operation metadata
 * - Temporal key binding
 * 
 * The encryption process:
 * 1. Serialize operation content to JSON
 * 2. Encrypt content with temporal key
 * 3. Sign encrypted operation with participant private key
 * 4. Return encrypted operation for transmission
 * 
 * @module operation-encryptor
 */

import { 
  CRDTOperation, 
  EncryptedOperation, 
  WorkspaceId 
} from '@digitaldefiance/eecp-protocol';
import { 
  ITimeLockedEncryption, 
  TemporalKey,
  eciesService,
} from '@digitaldefiance/eecp-crypto';
import { createSign, createVerify } from 'crypto';

/**
 * Interface for operation encryption and decryption operations
 * 
 * Defines the contract for encrypting CRDT operations for transmission
 * and decrypting received operations for application.
 */
export interface IOperationEncryptor {
  /**
   * Encrypt a CRDT operation with temporal key and sign with participant key
   * 
   * Performs the complete encryption and signing process:
   * 1. Serializes operation content (content/length) to JSON
   * 2. Encrypts the JSON with the temporal key using AES-256-GCM
   * 3. Creates encrypted operation structure with metadata
   * 4. Signs the encrypted operation with participant's private key
   * 
   * The signature covers the operation metadata and encrypted content,
   * preventing tampering with any part of the operation.
   * 
   * @param {CRDTOperation} operation - CRDT operation to encrypt
   * @param {TemporalKey} temporalKey - Current temporal key for encryption
   * @param {Buffer} participantPrivateKey - Participant's private key for signing
   * @param {WorkspaceId} workspaceId - Workspace ID to include in encrypted operation
   * @returns {Promise<EncryptedOperation>} Encrypted and signed operation
   * 
   * @throws {Error} If operation is missing
   * @throws {Error} If temporal key is invalid
   * @throws {Error} If participant private key is missing
   * @throws {Error} If workspace ID is missing
   * 
   * @example
   * ```typescript
   * const encryptor = new OperationEncryptor(encryption);
   * const encrypted = await encryptor.encryptOperation(
   *   operation,
   *   temporalKey,
   *   participantPrivateKey,
   *   workspaceId
   * );
   * // Send encrypted to server for broadcast
   * ```
   */
  encryptOperation(
    operation: CRDTOperation,
    temporalKey: TemporalKey,
    participantPrivateKey: Buffer,
    workspaceId: WorkspaceId
  ): Promise<EncryptedOperation>;
  
  /**
   * Decrypt a CRDT operation with temporal key
   * 
   * Decrypts an encrypted operation received from another participant:
   * 1. Extracts nonce, auth tag, and ciphertext from encrypted content
   * 2. Decrypts using the temporal key with AES-256-GCM
   * 3. Parses the JSON content
   * 4. Reconstructs the original CRDT operation
   * 
   * The signature should be verified separately using verifySignature()
   * before trusting the decrypted content.
   * 
   * @param {EncryptedOperation} encrypted - Encrypted operation to decrypt
   * @param {TemporalKey} temporalKey - Temporal key for decryption
   * @returns {Promise<CRDTOperation>} Decrypted CRDT operation
   * 
   * @throws {Error} If encrypted operation is missing
   * @throws {Error} If temporal key is invalid
   * @throws {Error} If encrypted content is too short
   * @throws {Error} If decryption fails (wrong key or tampered content)
   * 
   * @example
   * ```typescript
   * const encryptor = new OperationEncryptor(encryption);
   * 
   * // Verify signature first
   * if (encryptor.verifySignature(encrypted, participantPublicKey)) {
   *   const operation = await encryptor.decryptOperation(encrypted, temporalKey);
   *   crdt.applyOperation(operation);
   * }
   * ```
   */
  decryptOperation(
    encrypted: EncryptedOperation,
    temporalKey: TemporalKey
  ): Promise<CRDTOperation>;
  
  /**
   * Verify the signature of an encrypted operation
   * 
   * Verifies that the operation was signed by the holder of the private key
   * corresponding to the provided public key. This ensures:
   * - The operation came from the claimed participant
   * - The operation hasn't been tampered with
   * - The metadata (timestamp, position, etc.) is authentic
   * 
   * @param {EncryptedOperation} encrypted - Encrypted operation with signature
   * @param {Buffer} publicKey - Participant's public key for verification
   * @returns {boolean} True if signature is valid, false otherwise
   * 
   * @example
   * ```typescript
   * const encryptor = new OperationEncryptor(encryption);
   * 
   * if (!encryptor.verifySignature(encrypted, participantPublicKey)) {
   *   console.error('Invalid signature - operation rejected');
   *   return;
   * }
   * ```
   */
  verifySignature(
    encrypted: EncryptedOperation,
    publicKey: Buffer
  ): boolean;
}

/**
 * Operation encryptor implementation
 * 
 * Implements encryption, decryption, and signing of CRDT operations using:
 * - TimeLockedEncryption for AES-256-GCM encryption
 * - Node.js crypto for ECDSA signing/verification
 * 
 * The implementation ensures:
 * - Confidentiality: Content is encrypted with temporal keys
 * - Integrity: Auth tags prevent tampering with content
 * - Authenticity: Signatures prove operation origin
 * - Non-repudiation: Signatures cannot be forged
 * 
 * @implements {IOperationEncryptor}
 * 
 * @example
 * ```typescript
 * const encryption = new TimeLockedEncryption();
 * const encryptor = new OperationEncryptor(encryption);
 * 
 * // Encrypt and sign
 * const encrypted = await encryptor.encryptOperation(
 *   operation,
 *   temporalKey,
 *   privateKey,
 *   workspaceId
 * );
 * 
 * // Verify and decrypt
 * if (encryptor.verifySignature(encrypted, publicKey)) {
 *   const decrypted = await encryptor.decryptOperation(encrypted, temporalKey);
 * }
 * ```
 */
export class OperationEncryptor implements IOperationEncryptor {
  /**
   * Signature algorithm for ECDSA signing
   * @private
   * @readonly
   */
  private readonly SIGNATURE_ALGORITHM = 'sha256';
  
  /**
   * Create a new operation encryptor
   * 
   * @param {ITimeLockedEncryption} encryption - Time-locked encryption instance
   * 
   * @example
   * ```typescript
   * const encryption = new TimeLockedEncryption();
   * const encryptor = new OperationEncryptor(encryption);
   * ```
   */
  constructor(
    private encryption: ITimeLockedEncryption
  ) {}
  
  /**
   * Encrypt a CRDT operation
   * 
   * Performs the complete encryption and signing workflow:
   * 1. Validates all inputs
   * 2. Serializes operation content to JSON
   * 3. Encrypts content with temporal key
   * 4. Constructs encrypted operation structure
   * 5. Signs the encrypted operation
   * 
   * The encrypted content format is:
   * [nonce (12 bytes)][authTag (16 bytes)][ciphertext (variable)]
   * 
   * The signature covers:
   * - Operation ID
   * - Timestamp
   * - Position
   * - Operation type
   * - Encrypted content
   * 
   * @param {CRDTOperation} operation - The CRDT operation to encrypt
   * @param {TemporalKey} temporalKey - The current temporal key for encryption
   * @param {Buffer} participantPrivateKey - The participant's private key for signing
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @returns {Promise<EncryptedOperation>} Encrypted operation ready for transmission
   * 
   * @throws {Error} If any required parameter is missing or invalid
   */
  async encryptOperation(
    operation: CRDTOperation,
    temporalKey: TemporalKey,
    participantPrivateKey: Buffer,
    workspaceId: WorkspaceId
  ): Promise<EncryptedOperation> {
    // Validate inputs
    if (!operation) {
      throw new Error('Operation is required');
    }
    if (!temporalKey || !temporalKey.key) {
      throw new Error('Valid temporal key is required');
    }
    if (!participantPrivateKey || participantPrivateKey.length === 0) {
      throw new Error('Participant private key is required');
    }
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }
    
    // Serialize operation content to JSON
    const content = JSON.stringify({
      content: operation.content,
      length: operation.length
    });
    
    // Encrypt content with temporal key
    const encrypted = await this.encryption.encrypt(
      Buffer.from(content, 'utf8'),
      temporalKey
    );
    
    // Create the encrypted operation structure (without signature yet)
    // Combine nonce, authTag, and ciphertext into single buffer
    const encryptedOp: Partial<EncryptedOperation> = {
      id: operation.id,
      workspaceId,
      participantId: operation.participantId,
      timestamp: operation.timestamp,
      position: operation.position,
      operationType: operation.type,
      encryptedContent: Buffer.concat([
        encrypted.nonce,
        encrypted.authTag,
        encrypted.ciphertext
      ])
    };
    
    // Sign the operation
    const signature = await this.signOperation(
      encryptedOp as EncryptedOperation,
      participantPrivateKey
    );
    
    return {
      ...encryptedOp,
      signature
    } as EncryptedOperation;
  }
  
  /**
   * Decrypt a CRDT operation
   * 
   * Decrypts an encrypted operation and reconstructs the original CRDT operation:
   * 1. Validates inputs
   * 2. Extracts nonce, auth tag, and ciphertext from encrypted content
   * 3. Decrypts using temporal key
   * 4. Parses JSON content
   * 5. Reconstructs CRDT operation
   * 
   * The encrypted content format is:
   * [nonce (12 bytes)][authTag (16 bytes)][ciphertext (variable)]
   * 
   * Note: This method does NOT verify the signature. Call verifySignature()
   * separately before trusting the decrypted content.
   * 
   * @param {EncryptedOperation} encrypted - The encrypted operation to decrypt
   * @param {TemporalKey} temporalKey - The temporal key for decryption
   * @returns {Promise<CRDTOperation>} Decrypted CRDT operation
   * 
   * @throws {Error} If inputs are invalid
   * @throws {Error} If encrypted content is too short (< 28 bytes)
   * @throws {Error} If decryption fails
   */
  async decryptOperation(
    encrypted: EncryptedOperation,
    temporalKey: TemporalKey
  ): Promise<CRDTOperation> {
    // Validate inputs
    if (!encrypted) {
      throw new Error('Encrypted operation is required');
    }
    if (!temporalKey || !temporalKey.key) {
      throw new Error('Valid temporal key is required');
    }
    
    // Extract nonce, authTag, and ciphertext from encryptedContent
    // Format: [nonce (12 bytes)][authTag (16 bytes)][ciphertext (remaining)]
    const encryptedContent = encrypted.encryptedContent;
    if (encryptedContent.length < 28) { // 12 + 16 = 28 minimum
      throw new Error('Invalid encrypted content: too short');
    }
    
    const nonce = encryptedContent.subarray(0, 12);
    const authTag = encryptedContent.subarray(12, 28);
    const ciphertext = encryptedContent.subarray(28);
    
    // Decrypt content
    const decrypted = await this.encryption.decrypt(
      {
        ciphertext,
        nonce,
        authTag,
        keyId: temporalKey.id
      },
      temporalKey
    );
    
    // Parse operation content
    const content = JSON.parse(decrypted.toString('utf8'));
    
    // Reconstruct CRDT operation
    return {
      id: encrypted.id,
      participantId: encrypted.participantId,
      timestamp: encrypted.timestamp,
      type: encrypted.operationType as 'insert' | 'delete',
      position: encrypted.position,
      content: content.content,
      length: content.length
    };
  }
  
  /**
   * Verify the signature of an encrypted operation
   * 
   * Verifies the ECDSA signature using the participant's public key.
   * The signature covers all operation metadata and the encrypted content,
   * ensuring nothing has been tampered with.
   * 
   * @param {EncryptedOperation} encrypted - The encrypted operation with signature
   * @param {Buffer} publicKey - The participant's public key
   * @returns {boolean} True if signature is valid, false otherwise
   */
  verifySignature(
    encrypted: EncryptedOperation,
    publicKey: Buffer
  ): boolean {
    if (!encrypted || !encrypted.signature) {
      return false;
    }
    if (!publicKey || publicKey.length === 0) {
      return false;
    }
    
    try {
      // Reconstruct the message that was signed
      const message = this.createSignatureMessage(encrypted);
      
      // Check if this is a PEM-formatted key (starts with "-----BEGIN")
      const isPemKey = publicKey.toString('utf8').startsWith('-----BEGIN');
      
      if (isPemKey) {
        // Use Node.js crypto for PEM keys
        const verify = createVerify(this.SIGNATURE_ALGORITHM);
        verify.update(message);
        verify.end();
        return verify.verify(publicKey, encrypted.signature);
      } else {
        // Use eciesService for raw key bytes (browser-compatible)
        return eciesService.verifyMessage(
          new Uint8Array(publicKey),
          new Uint8Array(message),
          new Uint8Array(encrypted.signature) as any
        );
      }
    } catch (error) {
      // Any error in verification means the proof is invalid
      return false;
    }
  }
  
  /**
   * Sign an encrypted operation
   * 
   * Creates an ECDSA signature over the operation metadata and encrypted content.
   * This prevents tampering with any part of the operation.
   * 
   * The signature covers:
   * - operationId: Prevents ID substitution
   * - timestamp: Prevents timestamp manipulation
   * - position: Prevents position tampering
   * - operationType: Prevents type changes
   * - encryptedContent: Prevents content tampering
   * 
   * @param {EncryptedOperation} operation - The encrypted operation to sign
   * @param {Buffer} privateKey - The participant's private key
   * @returns {Promise<Buffer>} Signature buffer
   * @private
   */
  private async signOperation(
    operation: EncryptedOperation,
    privateKey: Buffer
  ): Promise<Buffer> {
    // Create message to sign
    const message = this.createSignatureMessage(operation);
    
    // Check if this is a PEM-formatted key (starts with "-----BEGIN")
    const isPemKey = privateKey.toString('utf8').startsWith('-----BEGIN');
    
    if (isPemKey) {
      // Use Node.js crypto for PEM keys
      const sign = createSign(this.SIGNATURE_ALGORITHM);
      sign.update(message);
      sign.end();
      return sign.sign(privateKey);
    } else {
      // Use eciesService for raw key bytes (browser-compatible)
      const signature = eciesService.signMessage(
        new Uint8Array(privateKey),
        new Uint8Array(message)
      );
      return Buffer.from(signature);
    }
  }
  
  /**
   * Create the message to be signed/verified
   * 
   * Concatenates all operation metadata and encrypted content into a single
   * buffer for signing or verification. The order is fixed to ensure
   * deterministic signatures.
   * 
   * @param {EncryptedOperation} operation - The encrypted operation
   * @returns {Buffer} Message buffer for signing/verification
   * @private
   */
  private createSignatureMessage(operation: EncryptedOperation): Buffer {
    return Buffer.concat([
      Buffer.from(operation.id.toString(), 'utf8'),
      Buffer.from(operation.timestamp.toString(), 'utf8'),
      Buffer.from(operation.position.toString(), 'utf8'),
      Buffer.from(operation.operationType, 'utf8'),
      operation.encryptedContent
    ]);
  }
}
