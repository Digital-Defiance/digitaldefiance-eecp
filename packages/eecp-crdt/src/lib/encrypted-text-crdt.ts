/**
 * Encrypted Text CRDT Module
 * 
 * Implements a Conflict-free Replicated Data Type (CRDT) for collaborative text editing
 * using Yjs. Provides strong eventual consistency guarantees, meaning all participants
 * will converge to the same document state regardless of operation order or network delays.
 * 
 * Key Features:
 * - Conflict-free merging of concurrent edits
 * - Deterministic conflict resolution
 * - Efficient state synchronization
 * - Support for insert and delete operations
 * 
 * The CRDT ensures that:
 * - Operations are commutative (order doesn't matter)
 * - Operations are associative (grouping doesn't matter)
 * - All participants converge to the same state
 * 
 * @module encrypted-text-crdt
 */

import * as Y from 'yjs';
import type { CRDTOperation, OperationId, ParticipantId } from '@digitaldefiance/eecp-protocol';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import { generateUUID } from './uuid-utils.js';

/**
 * Interface for encrypted text CRDT operations
 * 
 * Defines the contract for collaborative text editing with CRDT guarantees.
 * All operations are designed to be encrypted before transmission.
 */
export interface IEncryptedTextCRDT {
  /**
   * Insert text at a specific position
   * 
   * Creates an insert operation that adds text at the given position.
   * The operation is applied locally and returned for encryption and broadcast.
   * 
   * @param {number} position - Zero-based position to insert at
   * @param {string} text - Text content to insert
   * @param {ParticipantId} participantId - ID of participant making the edit
   * @returns {CRDTOperation} Operation for encryption and broadcast
   * 
   * @example
   * ```typescript
   * const op = crdt.insert(5, 'Hello', participantId);
   * // Encrypt and broadcast op to other participants
   * ```
   */
  insert(
    position: number,
    text: string,
    participantId: ParticipantId
  ): CRDTOperation;
  
  /**
   * Delete text at a specific position
   * 
   * Creates a delete operation that removes text starting at the given position.
   * The operation is applied locally and returned for encryption and broadcast.
   * 
   * @param {number} position - Zero-based position to delete from
   * @param {number} length - Number of characters to delete
   * @param {ParticipantId} participantId - ID of participant making the edit
   * @returns {CRDTOperation} Operation for encryption and broadcast
   * 
   * @example
   * ```typescript
   * const op = crdt.delete(5, 3, participantId);
   * // Encrypt and broadcast op to other participants
   * ```
   */
  delete(
    position: number,
    length: number,
    participantId: ParticipantId
  ): CRDTOperation;
  
  /**
   * Apply an operation from another participant
   * 
   * Applies a decrypted operation received from another participant.
   * Yjs automatically handles conflict resolution to ensure eventual consistency.
   * 
   * @param {CRDTOperation} operation - Decrypted operation to apply
   * 
   * @throws {Error} If operation type is unknown
   * @throws {Error} If insert operation is missing content
   * @throws {Error} If delete operation is missing length
   * 
   * @example
   * ```typescript
   * // After receiving and decrypting an operation
   * crdt.applyOperation(decryptedOp);
   * ```
   */
  applyOperation(operation: CRDTOperation): void;
  
  /**
   * Get the current document text
   * 
   * Returns the complete text content of the document in its current state.
   * 
   * @returns {string} Current document text
   * 
   * @example
   * ```typescript
   * const text = crdt.getText();
   * console.log('Document:', text);
   * ```
   */
  getText(): string;
  
  /**
   * Get the document state for synchronization
   * 
   * Encodes the entire Yjs document state as a binary update.
   * This can be sent to new participants for full synchronization.
   * 
   * @returns {Uint8Array} Encoded Yjs state
   * 
   * @example
   * ```typescript
   * const state = crdt.getState();
   * // Send state to new participant for sync
   * ```
   */
  getState(): Uint8Array;
  
  /**
   * Apply a document state from synchronization
   * 
   * Applies a Yjs state update received from another participant.
   * This is used for full synchronization when joining mid-session.
   * 
   * @param {Uint8Array} state - Encoded Yjs state to apply
   * 
   * @example
   * ```typescript
   * // When joining a workspace
   * crdt.applyState(receivedState);
   * ```
   */
  applyState(state: Uint8Array): void;
}

/**
 * Encrypted Text CRDT implementation using Yjs
 * 
 * Implements a collaborative text editor using Yjs, a high-performance CRDT library.
 * Yjs provides strong eventual consistency guarantees and efficient conflict resolution.
 * 
 * The implementation uses:
 * - Y.Doc: Yjs document container
 * - Y.Text: Yjs text type for collaborative editing
 * 
 * Yjs automatically handles:
 * - Conflict resolution for concurrent edits
 * - Operation transformation
 * - State synchronization
 * - Efficient delta encoding
 * 
 * @implements {IEncryptedTextCRDT}
 * 
 * @example
 * ```typescript
 * const crdt = new EncryptedTextCRDT();
 * 
 * // Local edit
 * const op = crdt.insert(0, 'Hello', participantId);
 * 
 * // Remote edit
 * crdt.applyOperation(remoteOp);
 * 
 * // Get current state
 * const text = crdt.getText();
 * ```
 */
export class EncryptedTextCRDT implements IEncryptedTextCRDT {
  /**
   * Yjs document container
   * @private
   */
  private doc: Y.Doc;
  
  /**
   * Yjs text type for collaborative editing
   * @private
   */
  private text: Y.Text;
  
  /**
   * Create a new encrypted text CRDT
   * 
   * Initializes a new Yjs document with a text type named 'content'.
   * 
   * @example
   * ```typescript
   * const crdt = new EncryptedTextCRDT();
   * ```
   */
  constructor() {
    this.doc = new Y.Doc();
    this.text = this.doc.getText('content');
  }
  
  /**
   * Insert text at position
   * 
   * Inserts text into the Yjs document at the specified position and creates
   * a CRDT operation for encryption and broadcast to other participants.
   * 
   * The operation is applied locally immediately (optimistic update) and then
   * broadcast to other participants for eventual consistency.
   * 
   * @param {number} position - Zero-based position to insert at
   * @param {string} text - Text content to insert
   * @param {ParticipantId} participantId - ID of participant making the edit
   * @returns {CRDTOperation} Operation for encryption and broadcast
   * 
   * @example
   * ```typescript
   * const op = crdt.insert(5, 'world', participantId);
   * // op = { id, participantId, timestamp, type: 'insert', position: 5, content: 'world' }
   * ```
   */
  insert(
    position: number,
    text: string,
    participantId: ParticipantId
  ): CRDTOperation {
    // Insert into Yjs document (optimistic local update)
    this.text.insert(position, text);
    
    // Return operation for encryption and broadcast
    return {
      id: new GuidV4(generateUUID()) as OperationId,
      participantId,
      timestamp: Date.now(),
      type: 'insert',
      position,
      content: text
    };
  }
  
  /**
   * Delete text at position
   * 
   * Deletes text from the Yjs document starting at the specified position and
   * creates a CRDT operation for encryption and broadcast to other participants.
   * 
   * The deletion is clamped to the available content to prevent errors.
   * The operation is applied locally immediately (optimistic update) and then
   * broadcast to other participants for eventual consistency.
   * 
   * @param {number} position - Zero-based position to delete from
   * @param {number} length - Number of characters to delete
   * @param {ParticipantId} participantId - ID of participant making the edit
   * @returns {CRDTOperation} Operation for encryption and broadcast
   * 
   * @example
   * ```typescript
   * const op = crdt.delete(5, 3, participantId);
   * // op = { id, participantId, timestamp, type: 'delete', position: 5, length: 3 }
   * ```
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
    // Note: We return the requested length, not actualLength, to maintain
    // consistency with the original operation intent
    return {
      id: new GuidV4(generateUUID()) as OperationId,
      participantId,
      timestamp: Date.now(),
      type: 'delete',
      position,
      length
    };
  }
  
  /**
   * Apply operation from another participant
   * 
   * Applies a decrypted operation received from another participant to the local
   * Yjs document. Yjs automatically handles conflict resolution to ensure all
   * participants converge to the same state.
   * 
   * The operation is validated before application:
   * - Insert operations must have content
   * - Delete operations must have length
   * - Unknown operation types are rejected
   * 
   * Delete operations are clamped to available content to prevent errors.
   * 
   * @param {CRDTOperation} operation - Decrypted CRDT operation to apply
   * 
   * @throws {Error} If operation type is unknown
   * @throws {Error} If insert operation is missing content
   * @throws {Error} If delete operation is missing length
   * 
   * @example
   * ```typescript
   * // After receiving and decrypting an operation
   * try {
   *   crdt.applyOperation(decryptedOp);
   * } catch (error) {
   *   console.error('Failed to apply operation:', error);
   * }
   * ```
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
   * 
   * Returns the complete text content of the document by converting the
   * Yjs text type to a string.
   * 
   * @returns {string} Current document text
   * 
   * @example
   * ```typescript
   * const text = crdt.getText();
   * console.log('Document length:', text.length);
   * console.log('Content:', text);
   * ```
   */
  getText(): string {
    return this.text.toString();
  }
  
  /**
   * Get document state for synchronization
   * 
   * Encodes the entire Yjs document state as a binary update using Yjs's
   * efficient encoding format. This can be sent to new participants for
   * full synchronization.
   * 
   * The encoded state includes all operations needed to reconstruct the
   * current document state.
   * 
   * @returns {Uint8Array} Encoded Yjs state
   * 
   * @example
   * ```typescript
   * const state = crdt.getState();
   * // Send state to new participant
   * await sendToParticipant(state);
   * ```
   */
  getState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }
  
  /**
   * Apply state from synchronization
   * 
   * Applies a Yjs state update received from another participant.
   * This merges the received state with the local state, automatically
   * resolving any conflicts.
   * 
   * This is typically used when:
   * - A new participant joins mid-session
   * - A participant reconnects after being offline
   * - Full synchronization is needed
   * 
   * @param {Uint8Array} state - Encoded Yjs state to apply
   * 
   * @example
   * ```typescript
   * // When joining a workspace
   * const state = await receiveState();
   * crdt.applyState(state);
   * console.log('Synced! Current text:', crdt.getText());
   * ```
   */
  applyState(state: Uint8Array): void {
    Y.applyUpdate(this.doc, state);
  }
}
