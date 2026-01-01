/**
 * Encrypted Text CRDT implementation using Yjs
 * Provides conflict-free replicated data type for collaborative text editing
 */

import * as Y from 'yjs';
import type { CRDTOperation, OperationId, ParticipantId } from '@digitaldefiance-eecp/eecp-protocol';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import { randomUUID } from 'crypto';

/**
 * Interface for encrypted text CRDT operations
 */
export interface IEncryptedTextCRDT {
  /**
   * Insert text at position
   */
  insert(
    position: number,
    text: string,
    participantId: ParticipantId
  ): CRDTOperation;
  
  /**
   * Delete text at position
   */
  delete(
    position: number,
    length: number,
    participantId: ParticipantId
  ): CRDTOperation;
  
  /**
   * Apply operation from another participant
   */
  applyOperation(operation: CRDTOperation): void;
  
  /**
   * Get current document text
   */
  getText(): string;
  
  /**
   * Get document state for sync
   */
  getState(): Uint8Array;
  
  /**
   * Apply state from sync
   */
  applyState(state: Uint8Array): void;
}

/**
 * Encrypted Text CRDT implementation using Yjs
 */
export class EncryptedTextCRDT implements IEncryptedTextCRDT {
  private doc: Y.Doc;
  private text: Y.Text;
  
  constructor() {
    this.doc = new Y.Doc();
    this.text = this.doc.getText('content');
  }
  
  /**
   * Insert text at position
   * @param position - Position to insert at
   * @param text - Text to insert
   * @param participantId - ID of participant making the edit
   * @returns CRDT operation for encryption and broadcast
   */
  insert(
    position: number,
    text: string,
    participantId: ParticipantId
  ): CRDTOperation {
    // Insert into Yjs document
    this.text.insert(position, text);
    
    // Return operation for encryption and broadcast
    return {
      id: new GuidV4(randomUUID()) as OperationId,
      participantId,
      timestamp: Date.now(),
      type: 'insert',
      position,
      content: text
    };
  }
  
  /**
   * Delete text at position
   * @param position - Position to delete from
   * @param length - Number of characters to delete
   * @param participantId - ID of participant making the edit
   * @returns CRDT operation for encryption and broadcast
   */
  delete(
    position: number,
    length: number,
    participantId: ParticipantId
  ): CRDTOperation {
    // Only delete if there's content to delete
    const currentLength = this.text.length;
    if (currentLength > 0 && position < currentLength && length > 0) {
      // Clamp length to available content
      const actualLength = Math.min(length, currentLength - position);
      this.text.delete(position, actualLength);
    }
    
    // Return operation for encryption and broadcast
    return {
      id: new GuidV4(randomUUID()) as OperationId,
      participantId,
      timestamp: Date.now(),
      type: 'delete',
      position,
      length
    };
  }
  
  /**
   * Apply operation from another participant
   * @param operation - CRDT operation to apply
   */
  applyOperation(operation: CRDTOperation): void {
    // Apply operation to Yjs document
    if (operation.type === 'insert') {
      if (operation.content === undefined) {
        throw new Error('Insert operation must have content');
      }
      this.text.insert(operation.position, operation.content);
    } else if (operation.type === 'delete') {
      if (operation.length === undefined) {
        throw new Error('Delete operation must have length');
      }
      // Only delete if there's content to delete
      const currentLength = this.text.length;
      if (currentLength > 0 && operation.position < currentLength && operation.length > 0) {
        const actualLength = Math.min(operation.length, currentLength - operation.position);
        this.text.delete(operation.position, actualLength);
      }
    } else {
      throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }
  
  /**
   * Get current document text
   * @returns Current text content
   */
  getText(): string {
    return this.text.toString();
  }
  
  /**
   * Get document state for sync
   * @returns Encoded Yjs state
   */
  getState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }
  
  /**
   * Apply state from sync
   * @param state - Encoded Yjs state to apply
   */
  applyState(state: Uint8Array): void {
    Y.applyUpdate(this.doc, state);
  }
}
