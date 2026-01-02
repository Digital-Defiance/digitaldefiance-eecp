/**
 * @module operation-router
 * 
 * Operation Router for EECP Server - Routes encrypted operations to workspace participants.
 * 
 * This module implements zero-knowledge operation routing:
 * - Routes encrypted operations without decrypting content
 * - Broadcasts operations to all workspace participants except sender
 * - Buffers operations for offline participants
 * - Validates workspace status before routing
 * - Cleans up expired buffered operations
 * 
 * The router maintains zero-knowledge properties by:
 * - Never decrypting operation content
 * - Treating operations as opaque encrypted blobs
 * - Only using metadata (workspace ID, participant ID, timestamp) for routing
 * 
 * Buffering strategy:
 * - Operations are buffered when participants are offline
 * - Buffered operations are delivered when participant reconnects
 * - Expired operations are periodically cleaned up
 * 
 * @example
 * ```typescript
 * import { OperationRouter } from './operation-router';
 * import { ParticipantManager } from './participant-manager';
 * import { WorkspaceManager } from './workspace-manager';
 * 
 * const router = new OperationRouter(participantManager, workspaceManager);
 * 
 * // Route operation to all participants except sender
 * await router.routeOperation(workspaceId, operation, senderParticipantId);
 * 
 * // Get buffered operations for reconnecting participant
 * const buffered = router.getBufferedOperations(workspaceId, participantId);
 * 
 * // Clean up old buffered operations
 * const oneHourAgo = Date.now() - 3600000;
 * router.clearExpiredBuffers(oneHourAgo);
 * ```
 */

import {
  WorkspaceId,
  ParticipantId,
  EncryptedOperation,
} from '@digitaldefiance/eecp-protocol';
import {
  MessageEnvelope,
  OperationMessage,
} from '@digitaldefiance/eecp-protocol';
import { IParticipantManager } from './participant-manager.js';
import { IWorkspaceManager } from './workspace-manager.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for operation routing operations.
 * 
 * Defines the contract for routing encrypted operations between participants
 * while maintaining zero-knowledge properties.
 * 
 * @interface IOperationRouter
 */
export interface IOperationRouter {
  /**
   * Route operation to all workspace participants except sender.
   * 
   * Validates workspace is active and broadcasts to connected participants.
   * Buffers operations for offline participants.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {EncryptedOperation} operation - Encrypted operation to route
   * @param {ParticipantId} senderParticipantId - Participant who sent the operation
   * @returns {Promise<void>} Resolves when operation is routed
   * @throws {Error} If workspace is not found or expired
   */
  routeOperation(
    workspaceId: WorkspaceId,
    operation: EncryptedOperation,
    senderParticipantId: ParticipantId
  ): Promise<void>;

  /**
   * Buffer operation for offline participant.
   * 
   * Operations are stored until participant reconnects or buffer expires.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {ParticipantId} participantId - Participant ID
   * @param {EncryptedOperation} operation - Encrypted operation to buffer
   */
  bufferOperation(
    workspaceId: WorkspaceId,
    participantId: ParticipantId,
    operation: EncryptedOperation
  ): void;

  /**
   * Get buffered operations for participant.
   * 
   * Returns and clears all buffered operations for the participant.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {ParticipantId} participantId - Participant ID
   * @returns {EncryptedOperation[]} Array of buffered operations
   */
  getBufferedOperations(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): EncryptedOperation[];

  /**
   * Clear expired buffered operations.
   * 
   * Removes operations older than the expiration time.
   * 
   * @param {number} expirationTime - Timestamp before which operations should be discarded
   */
  clearExpiredBuffers(expirationTime: number): void;
}

/**
 * Implementation of operation router.
 * 
 * Routes encrypted operations to workspace participants while maintaining
 * zero-knowledge properties by never decrypting operation content.
 * 
 * @class OperationRouter
 * @implements {IOperationRouter}
 * 
 * @example
 * ```typescript
 * const router = new OperationRouter(participantManager, workspaceManager);
 * 
 * // Route operation
 * await router.routeOperation(workspaceId, operation, senderParticipantId);
 * ```
 */
export class OperationRouter implements IOperationRouter {
  private buffers: Map<string, EncryptedOperation[]> = new Map();

  constructor(
    private participantManager: IParticipantManager,
    private workspaceManager: IWorkspaceManager
  ) {
    if (!participantManager) {
      throw new Error('ParticipantManager is required');
    }
    if (!workspaceManager) {
      throw new Error('WorkspaceManager is required');
    }
  }

  /**
   * Route operation to all workspace participants except sender.
   * 
   * Processing:
   * 1. Validates workspace exists and is active
   * 2. Gets all participants in workspace
   * 3. Creates message envelope with operation
   * 4. Broadcasts to all participants except sender
   * 5. Buffers operation for offline participants
   * 
   * The operation content is never decrypted, maintaining zero-knowledge property.
   * 
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @param {EncryptedOperation} operation - The encrypted operation to route
   * @param {ParticipantId} senderParticipantId - The participant who sent the operation
   * @returns {Promise<void>} Resolves when operation is routed
   * @throws {Error} If workspace ID, operation, or sender ID is missing
   * @throws {Error} If workspace is not found or expired
   * 
   * @example
   * ```typescript
   * await router.routeOperation(
   *   workspaceId,
   *   encryptedOperation,
   *   senderParticipantId
   * );
   * ```
   */
  async routeOperation(
    workspaceId: WorkspaceId,
    operation: EncryptedOperation,
    senderParticipantId: ParticipantId
  ): Promise<void> {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    if (!operation) {
      throw new Error('Operation is required');
    }

    if (!senderParticipantId) {
      throw new Error('Sender participant ID is required');
    }

    // Validate workspace is active
    const workspace = await this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (this.workspaceManager.isWorkspaceExpired(workspace)) {
      throw new Error('Workspace expired');
    }

    // Get all participants in the workspace
    const participants = this.participantManager.getWorkspaceParticipants(workspaceId);

    // Create message envelope
    const message: OperationMessage = { operation };
    const envelope: MessageEnvelope = {
      type: 'operation',
      payload: message,
      timestamp: Date.now(),
      messageId: uuidv4(),
    };

    // Broadcast to all participants except sender
    for (const participant of participants) {
      // Skip sender
      if (participant.participantId === senderParticipantId) {
        continue;
      }

      try {
        // Attempt to send via WebSocket
        if (participant.websocket && typeof participant.websocket.send === 'function') {
          participant.websocket.send(JSON.stringify(envelope));
        } else {
          // Participant offline or websocket not available, buffer operation
          this.bufferOperation(workspaceId, participant.participantId, operation);
        }
      } catch (error) {
        // Send failed, participant likely offline - buffer operation
        this.bufferOperation(workspaceId, participant.participantId, operation);
      }
    }
  }

  /**
   * Buffer operation for offline participant.
   * 
   * Stores operation in memory until participant reconnects or buffer is cleared.
   * Operations are keyed by workspace ID and participant ID.
   * 
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @param {ParticipantId} participantId - The participant ID
   * @param {EncryptedOperation} operation - The encrypted operation to buffer
   * 
   * @example
   * ```typescript
   * // Buffer operation for offline participant
   * router.bufferOperation(workspaceId, participantId, operation);
   * ```
   */
  bufferOperation(
    workspaceId: WorkspaceId,
    participantId: ParticipantId,
    operation: EncryptedOperation
  ): void {
    if (!workspaceId || !participantId || !operation) {
      return;
    }

    const key = this.getBufferKey(workspaceId, participantId);
    const buffer = this.buffers.get(key) || [];
    buffer.push(operation);
    this.buffers.set(key, buffer);
  }

  /**
   * Get buffered operations for participant.
   * 
   * Returns all buffered operations and clears the buffer.
   * Called when participant reconnects to receive missed operations.
   * 
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @param {ParticipantId} participantId - The participant ID
   * @returns {EncryptedOperation[]} Array of buffered operations (empty if none)
   * 
   * @example
   * ```typescript
   * // Get buffered operations when participant reconnects
   * const buffered = router.getBufferedOperations(workspaceId, participantId);
   * console.log(`Delivering ${buffered.length} buffered operations`);
   * ```
   */
  getBufferedOperations(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): EncryptedOperation[] {
    if (!workspaceId || !participantId) {
      return [];
    }

    const key = this.getBufferKey(workspaceId, participantId);
    const buffer = this.buffers.get(key) || [];
    
    // Clear buffer after retrieval
    this.buffers.delete(key);
    
    return buffer;
  }

  /**
   * Clear expired buffered operations.
   * 
   * Removes operations older than the expiration time to prevent memory leaks.
   * Should be called periodically by cleanup service.
   * 
   * @param {number} expirationTime - Timestamp before which operations should be discarded
   * 
   * @example
   * ```typescript
   * // Clear operations older than 1 hour
   * const oneHourAgo = Date.now() - 3600000;
   * router.clearExpiredBuffers(oneHourAgo);
   * ```
   */
  clearExpiredBuffers(expirationTime: number): void {
    if (typeof expirationTime !== 'number' || isNaN(expirationTime) || expirationTime < 0) {
      return;
    }

    for (const [key, operations] of this.buffers.entries()) {
      // Filter out expired operations
      const filtered = operations.filter(op => op.timestamp > expirationTime);
      
      if (filtered.length === 0) {
        // All operations expired, delete buffer
        this.buffers.delete(key);
      } else if (filtered.length < operations.length) {
        // Some operations expired, update buffer
        this.buffers.set(key, filtered);
      }
    }
  }

  /**
   * Generate buffer key for storage.
   * 
   * Combines workspace ID and participant ID into a unique key for the buffer map.
   * 
   * @private
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @param {ParticipantId} participantId - The participant ID
   * @returns {string} Buffer key string
   */
  private getBufferKey(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): string {
    return `${workspaceId}:${participantId}`;
  }
}
