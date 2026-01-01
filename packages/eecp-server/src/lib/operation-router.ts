/**
 * Operation Router for EECP Server
 * 
 * Routes encrypted operations to workspace participants without decrypting content.
 * Implements zero-knowledge operation routing and buffering for offline participants.
 */

import {
  WorkspaceId,
  ParticipantId,
  EncryptedOperation,
} from '@digitaldefiance-eecp/eecp-protocol';
import {
  MessageEnvelope,
  OperationMessage,
} from '@digitaldefiance-eecp/eecp-protocol';
import { IParticipantManager } from './participant-manager.js';
import { IWorkspaceManager } from './workspace-manager.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for operation routing operations
 */
export interface IOperationRouter {
  /**
   * Route operation to all workspace participants except sender
   * Validates workspace is active and broadcasts to connected participants
   * Buffers operations for offline participants
   */
  routeOperation(
    workspaceId: WorkspaceId,
    operation: EncryptedOperation,
    senderParticipantId: ParticipantId
  ): Promise<void>;

  /**
   * Buffer operation for offline participant
   * Operations are stored until participant reconnects or buffer expires
   */
  bufferOperation(
    workspaceId: WorkspaceId,
    participantId: ParticipantId,
    operation: EncryptedOperation
  ): void;

  /**
   * Get buffered operations for participant
   * Returns and clears all buffered operations for the participant
   */
  getBufferedOperations(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): EncryptedOperation[];

  /**
   * Clear expired buffered operations
   * Removes operations older than the expiration time
   */
  clearExpiredBuffers(expirationTime: number): void;
}

/**
 * Implementation of operation router
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
   * Route operation to all workspace participants except sender
   * 
   * @param workspaceId - The workspace ID
   * @param operation - The encrypted operation to route
   * @param senderParticipantId - The participant who sent the operation
   * @throws Error if workspace is expired or not found
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
   * Buffer operation for offline participant
   * 
   * @param workspaceId - The workspace ID
   * @param participantId - The participant ID
   * @param operation - The encrypted operation to buffer
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
   * Get buffered operations for participant
   * Returns and clears all buffered operations
   * 
   * @param workspaceId - The workspace ID
   * @param participantId - The participant ID
   * @returns Array of buffered operations
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
   * Clear expired buffered operations
   * Removes operations older than the expiration time
   * 
   * @param expirationTime - Timestamp before which operations should be discarded
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
   * Generate buffer key for storage
   * 
   * @param workspaceId - The workspace ID
   * @param participantId - The participant ID
   * @returns Buffer key string
   */
  private getBufferKey(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): string {
    return `${workspaceId}:${participantId}`;
  }
}
