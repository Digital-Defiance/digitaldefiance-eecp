/**
 * CollaborativeEditor - Real-time collaborative text editor with encryption
 * 
 * Implements a collaborative editor that:
 * - Uses CRDT for conflict-free concurrent editing
 * - Encrypts all operations with temporal keys
 * - Signs operations with participant private keys
 * - Handles real-time synchronization via WebSocket
 * - Buffers operations when offline
 */

import { WebSocket } from 'ws';
import {
  WorkspaceId,
  ParticipantId,
  MessageEnvelope,
  OperationMessage,
  CRDTOperation,
  EncryptedOperation,
} from '@digitaldefiance-eecp/eecp-protocol';
import {
  EncryptedTextCRDT,
  IEncryptedTextCRDT,
  OperationEncryptor,
  IOperationEncryptor,
} from '@digitaldefiance-eecp/eecp-crdt';
import {
  TimeLockedEncryption,
  ITimeLockedEncryption,
} from '@digitaldefiance-eecp/eecp-crypto';
import { IClientKeyManager } from './client-key-manager.js';
import { randomUUID } from 'crypto';

/**
 * Interface for collaborative editor
 */
export interface ICollaborativeEditor {
  /**
   * Insert text at position
   */
  insert(position: number, text: string): void;
  
  /**
   * Delete text at position
   */
  delete(position: number, length: number): void;
  
  /**
   * Get current text
   */
  getText(): string;
  
  /**
   * Subscribe to changes
   */
  onChange(callback: (text: string) => void): () => void;
}

/**
 * Collaborative editor implementation with encryption and CRDT
 * 
 * Requirements:
 * - 4.1: CRDT operations for collaborative editing
 * - 4.2: Encrypted operation transmission
 * - 4.6: Operation decryption and application
 * - 8.2: Immediate operation application
 */
export class CollaborativeEditor implements ICollaborativeEditor {
  private crdt: IEncryptedTextCRDT;
  private encryptor: IOperationEncryptor;
  private encryption: ITimeLockedEncryption;
  private changeListeners: Set<(text: string) => void> = new Set();
  private offlineBuffer: CRDTOperation[] = [];
  private isConnected = true;
  private isFlushing = false;
  
  constructor(
    private workspaceId: WorkspaceId,
    private participantId: ParticipantId,
    private ws: WebSocket,
    private keyManager: IClientKeyManager
  ) {
    // Initialize CRDT
    this.crdt = new EncryptedTextCRDT();
    
    // Initialize encryption
    this.encryption = new TimeLockedEncryption();
    
    // Initialize operation encryptor
    this.encryptor = new OperationEncryptor(this.encryption);
    
    // Set up message handler for incoming operations
    this.setupMessageHandler();
    
    // Monitor connection status
    this.ws.on('close', () => {
      this.isConnected = false;
    });
    
    this.ws.on('open', async () => {
      this.isConnected = true;
      await this.flushOfflineBuffer();
    });
  }
  
  /**
   * Insert text at position
   * Creates a CRDT operation, encrypts it, and sends to server
   * 
   * @param position - Position to insert at
   * @param text - Text to insert
   */
  insert(position: number, text: string): void {
    // Create CRDT operation
    const operation = this.crdt.insert(position, text, this.participantId);
    
    // Send encrypted operation
    this.sendOperation(operation);
    
    // Notify listeners of change
    this.notifyChange();
  }
  
  /**
   * Delete text at position
   * Creates a CRDT operation, encrypts it, and sends to server
   * 
   * @param position - Position to delete from
   * @param length - Number of characters to delete
   */
  delete(position: number, length: number): void {
    // Create CRDT operation
    const operation = this.crdt.delete(position, length, this.participantId);
    
    // Send encrypted operation
    this.sendOperation(operation);
    
    // Notify listeners of change
    this.notifyChange();
  }
  
  /**
   * Get current document text
   * 
   * @returns Current text content
   */
  getText(): string {
    return this.crdt.getText();
  }
  
  /**
   * Subscribe to document changes
   * 
   * @param callback - Function to call when document changes
   * @returns Unsubscribe function
   */
  onChange(callback: (text: string) => void): () => void {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }
  
  /**
   * Send an encrypted operation to the server
   * Buffers operations when offline
   * 
   * Implements:
   * - Offline operation buffering (Requirement 15.3)
   * - Clock skew handling with grace period (Requirement 15.4)
   * 
   * @param operation - CRDT operation to send
   */
  private async sendOperation(operation: CRDTOperation): Promise<void> {
    try {
      // If offline, buffer the operation (Requirement 15.3)
      if (!this.isConnected) {
        this.offlineBuffer.push(operation);
        return;
      }
      
      // Get current temporal key with grace period support
      const temporalKey = await this.getTemporalKeyForEncryption();
      
      if (!temporalKey) {
        // Unable to get key, buffer operation for retry
        console.warn('Unable to get temporal key, buffering operation');
        this.offlineBuffer.push(operation);
        return;
      }
      
      // Get participant private key
      const privateKey = await this.keyManager.getParticipantKey(this.participantId);
      
      // Encrypt operation
      const encrypted = await this.encryptor.encryptOperation(
        operation,
        temporalKey,
        privateKey,
        this.workspaceId
      );
      
      // Create message envelope
      const message: OperationMessage = { operation: encrypted };
      const envelope: MessageEnvelope = {
        type: 'operation',
        payload: message,
        timestamp: Date.now(),
        messageId: randomUUID()
      };
      
      // Send via WebSocket
      this.ws.send(JSON.stringify(envelope));
    } catch (error) {
      // On error, buffer the operation for retry (but not if we're already flushing)
      console.error('Failed to send operation:', error);
      if (!this.isFlushing) {
        this.offlineBuffer.push(operation);
      }
    }
  }
  
  /**
   * Get temporal key for encryption with grace period support
   * 
   * Handles clock skew by accepting keys within grace period (Requirement 15.4)
   * 
   * @returns Temporal key for encryption
   */
  private async getTemporalKeyForEncryption(): Promise<any | null> {
    try {
      // Get current key
      const key = await this.keyManager.getCurrentKey(this.workspaceId);
      
      // Verify key is still valid (within grace period)
      const now = Date.now();
      if (key.gracePeriodEnd && now > key.gracePeriodEnd) {
        // Key has expired beyond grace period
        console.warn('Current key expired beyond grace period, fetching new key');
        
        // Try to fetch updated key from metadata
        try {
          return await this.fetchKeyFromMetadata();
        } catch (fetchError) {
          console.error('Failed to fetch updated key:', fetchError);
          return null;
        }
      }
      
      return key;
    } catch (error) {
      console.error('Failed to get temporal key for encryption:', error);
      return null;
    }
  }
  
  /**
   * Set up WebSocket message handler for incoming operations
   * Listens for operation messages and applies them to the CRDT
   */
  private setupMessageHandler(): void {
    this.ws.on('message', async (data: Buffer) => {
      try {
        const envelope: MessageEnvelope = JSON.parse(data.toString());
        
        // Handle operation messages
        if (envelope.type === 'operation') {
          await this.handleOperation(envelope.payload as OperationMessage);
        }
      } catch (error) {
        console.error('Failed to handle message:', error);
      }
    });
  }
  
  /**
   * Handle incoming encrypted operation
   * Decrypts the operation and applies it to the CRDT
   * 
   * Implements error handling for:
   * - Missing temporal keys (fetch from metadata)
   * - Decryption failures (log and skip)
   * - Clock skew (grace period handling)
   * 
   * Requirements: 15.1, 15.2, 15.4
   * 
   * @param message - Operation message from server
   */
  private async handleOperation(message: OperationMessage): Promise<void> {
    try {
      let encrypted = message.operation;
      
      // Convert Buffer-like objects back to actual Buffers after JSON deserialization
      if (encrypted.encryptedContent && typeof encrypted.encryptedContent === 'object' && 'type' in encrypted.encryptedContent) {
        encrypted = {
          ...encrypted,
          encryptedContent: Buffer.from((encrypted.encryptedContent as any).data),
          signature: encrypted.signature && typeof encrypted.signature === 'object' && 'type' in encrypted.signature
            ? Buffer.from((encrypted.signature as any).data)
            : encrypted.signature
        };
      }
      
      // Skip operations from self (already applied locally)
      if (encrypted.participantId === this.participantId) {
        return;
      }
      
      // Get temporal key for decryption with recovery
      const temporalKey = await this.getTemporalKeyWithRecovery(encrypted);
      
      if (!temporalKey) {
        // Unable to recover key, log and skip operation
        console.error('Unable to decrypt operation: missing temporal key', {
          operationId: encrypted.id,
          timestamp: encrypted.timestamp
        });
        return;
      }
      
      // Decrypt operation with error handling
      let operation: CRDTOperation;
      try {
        operation = await this.encryptor.decryptOperation(
          encrypted,
          temporalKey
        );
      } catch (decryptError) {
        // Decryption failed - log and skip operation (Requirement 15.2)
        console.error('Failed to decrypt operation, skipping:', {
          operationId: encrypted.id,
          error: decryptError instanceof Error ? decryptError.message : String(decryptError)
        });
        return;
      }
      
      // Apply to CRDT
      this.crdt.applyOperation(operation);
      
      // Notify listeners of change
      this.notifyChange();
    } catch (error) {
      console.error('Failed to handle operation:', error);
      // Non-critical error - operation is skipped but editor continues
    }
  }
  
  /**
   * Get temporal key with automatic recovery
   * 
   * Implements missing key recovery (Requirement 15.1):
   * 1. Try to get current key
   * 2. If missing, try to get key by ID from operation
   * 3. If still missing, attempt to fetch from workspace metadata
   * 4. Handle clock skew with grace period (Requirement 15.4)
   * 
   * @param encrypted - Encrypted operation containing key ID
   * @returns Temporal key or null if recovery fails
   */
  private async getTemporalKeyWithRecovery(
    encrypted: EncryptedOperation
  ): Promise<any | null> {
    try {
      // Try to get current key first
      const key = await this.keyManager.getCurrentKey(this.workspaceId);
      
      // Validate grace period (Requirement 15.4)
      if (key && this.isKeyExpired(key)) {
        console.warn('Current key is beyond grace period, attempting recovery');
        throw new Error('Key expired beyond grace period');
      }
      
      return key;
    } catch (currentKeyError) {
      // Current key not available, try recovery
      console.warn('Current key not available, attempting recovery');
      
      try {
        // Extract key ID from encrypted operation
        // The key ID is embedded in the encrypted payload metadata
        const keyId = this.extractKeyIdFromOperation(encrypted);
        
        if (keyId) {
          // Try to get key by ID (may be in grace period)
          try {
            const key = await this.keyManager.getKeyById(this.workspaceId, keyId);
            
            // Validate grace period for recovered key
            if (key && this.isKeyExpired(key)) {
              console.warn('Recovered key is beyond grace period, rejecting');
              return null;
            }
            
            return key;
          } catch (keyByIdError) {
            console.warn('Key not found by ID, attempting metadata fetch');
          }
        }
        
        // Last resort: fetch current key from workspace metadata
        // This handles the case where we're missing keys after reconnection
        return await this.fetchKeyFromMetadata();
      } catch (recoveryError) {
        console.error('Key recovery failed:', recoveryError);
        return null;
      }
    }
  }
  
  /**
   * Check if a temporal key is expired beyond its grace period
   * 
   * @param key - Temporal key to check
   * @returns true if key is beyond grace period, false otherwise
   */
  private isKeyExpired(key: any): boolean {
    const now = Date.now();
    return key.gracePeriodEnd && now > key.gracePeriodEnd;
  }
  
  /**
   * Extract key ID from encrypted operation
   * 
   * @param encrypted - Encrypted operation
   * @returns Key ID or null if not found
   */
  private extractKeyIdFromOperation(encrypted: EncryptedOperation): string | null {
    try {
      // The encrypted content includes metadata with the key ID
      // For now, we'll use a simple approach - in production this would
      // parse the actual encrypted payload structure
      
      // Check if there's a keyId field in the operation
      if ('keyId' in encrypted && typeof (encrypted as any).keyId === 'string') {
        return (encrypted as any).keyId;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to extract key ID:', error);
      return null;
    }
  }
  
  /**
   * Fetch current temporal key from workspace metadata
   * 
   * This is called when local keys are missing, typically after:
   * - Reconnection
   * - Key rotation
   * - Client restart
   * 
   * Requirement 15.1: Missing key recovery
   * 
   * @returns Temporal key from metadata
   */
  private async fetchKeyFromMetadata(): Promise<any> {
    // In a full implementation, this would:
    // 1. Fetch encrypted workspace metadata from server
    // 2. Decrypt metadata with participant's private key
    // 3. Extract current temporal key
    // 4. Store key in key manager
    // 5. Return the key
    
    // For now, throw an error indicating this needs server integration
    throw new Error('Metadata fetch not yet implemented - requires server integration');
  }
  
  /**
   * Notify all change listeners
   */
  private notifyChange(): void {
    const text = this.getText();
    // Convert Set to Array for iteration compatibility
    Array.from(this.changeListeners).forEach((listener) => {
      listener(text);
    });
  }
  
  /**
   * Flush buffered operations when connection is restored
   */
  private async flushOfflineBuffer(): Promise<void> {
    if (this.offlineBuffer.length === 0) {
      return;
    }
    
    // Set flushing flag to prevent re-buffering on errors
    this.isFlushing = true;
    
    try {
      // Sort operations by timestamp to maintain order
      this.offlineBuffer.sort((a, b) => a.timestamp - b.timestamp);
      
      // Send all buffered operations
      const operations = [...this.offlineBuffer];
      this.offlineBuffer = [];
      
      for (const operation of operations) {
        await this.sendOperation(operation);
      }
    } finally {
      this.isFlushing = false;
    }
  }
}
