/**
 * Operation Encryptor
 * 
 * Handles encryption, decryption, and signing of CRDT operations.
 * Operations are encrypted with temporal keys and signed with participant private keys.
 */

import { 
  CRDTOperation, 
  EncryptedOperation, 
  WorkspaceId 
} from '@digitaldefiance-eecp/eecp-protocol';
import { 
  ITimeLockedEncryption, 
  TemporalKey 
} from '@digitaldefiance-eecp/eecp-crypto';
import { createSign, createVerify } from 'crypto';

/**
 * Interface for operation encryption and decryption
 */
export interface IOperationEncryptor {
  /**
   * Encrypt a CRDT operation with temporal key and sign with participant key
   */
  encryptOperation(
    operation: CRDTOperation,
    temporalKey: TemporalKey,
    participantPrivateKey: Buffer,
    workspaceId: WorkspaceId
  ): Promise<EncryptedOperation>;
  
  /**
   * Decrypt a CRDT operation with temporal key
   */
  decryptOperation(
    encrypted: EncryptedOperation,
    temporalKey: TemporalKey
  ): Promise<CRDTOperation>;
  
  /**
   * Verify operation signature
   */
  verifySignature(
    encrypted: EncryptedOperation,
    publicKey: Buffer
  ): boolean;
}

/**
 * Operation encryptor implementation
 */
export class OperationEncryptor implements IOperationEncryptor {
  private readonly SIGNATURE_ALGORITHM = 'sha256';
  
  constructor(
    private encryption: ITimeLockedEncryption
  ) {}
  
  /**
   * Encrypt a CRDT operation
   * 
   * Serializes the operation content to JSON, encrypts it with the temporal key,
   * and signs the encrypted operation with the participant's private key.
   * 
   * @param operation - The CRDT operation to encrypt
   * @param temporalKey - The current temporal key for encryption
   * @param participantPrivateKey - The participant's private key for signing
   * @param workspaceId - The workspace ID
   * @returns Encrypted operation ready for transmission
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
   * Decrypts the operation content using the temporal key and reconstructs
   * the original CRDT operation.
   * 
   * @param encrypted - The encrypted operation to decrypt
   * @param temporalKey - The temporal key for decryption
   * @returns Decrypted CRDT operation
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
   * @param encrypted - The encrypted operation with signature
   * @param publicKey - The participant's public key
   * @returns true if signature is valid, false otherwise
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
      
      // Verify the signature
      const verify = createVerify(this.SIGNATURE_ALGORITHM);
      verify.update(message);
      verify.end();
      
      return verify.verify(publicKey, encrypted.signature);
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Sign an encrypted operation
   * 
   * Signs: operationId + timestamp + position + operationType + ciphertext
   * This prevents tampering with operation metadata.
   * 
   * @param operation - The encrypted operation to sign
   * @param privateKey - The participant's private key
   * @returns Signature buffer
   */
  private async signOperation(
    operation: EncryptedOperation,
    privateKey: Buffer
  ): Promise<Buffer> {
    // Create message to sign
    const message = this.createSignatureMessage(operation);
    
    // Sign the message
    const sign = createSign(this.SIGNATURE_ALGORITHM);
    sign.update(message);
    sign.end();
    
    return sign.sign(privateKey);
  }
  
  /**
   * Create the message to be signed/verified
   * 
   * @param operation - The encrypted operation
   * @returns Message buffer for signing/verification
   */
  private createSignatureMessage(operation: EncryptedOperation): Buffer {
    return Buffer.concat([
      Buffer.from(operation.id, 'utf8'),
      Buffer.from(operation.timestamp.toString(), 'utf8'),
      Buffer.from(operation.position.toString(), 'utf8'),
      Buffer.from(operation.operationType, 'utf8'),
      operation.encryptedContent
    ]);
  }
}
