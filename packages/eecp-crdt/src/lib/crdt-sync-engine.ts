/**
 * CRDT Sync Engine for merging and synchronizing operations
 * Handles operation ordering, conflict resolution, and state synchronization
 */

import type { CRDTOperation, OperationId } from '@digitaldefiance-eecp/eecp-protocol';

/**
 * Interface for CRDT synchronization engine
 */
export interface ICRDTSyncEngine {
  /**
   * Merge operations from multiple participants
   * Operations are sorted by timestamp and applied in order
   */
  mergeOperations(operations: CRDTOperation[]): void;
  
  /**
   * Resolve conflicts deterministically using Yjs
   * Yjs handles conflict resolution automatically through its CRDT algorithm
   */
  resolveConflicts(
    op1: CRDTOperation,
    op2: CRDTOperation
  ): CRDTOperation[];
  
  /**
   * Get operations since a specific timestamp
   * Used for synchronization when a participant reconnects
   */
  getOperationsSince(timestamp: number): CRDTOperation[];
}

/**
 * CRDT Sync Engine implementation
 * Manages operation history and synchronization
 */
export class CRDTSyncEngine implements ICRDTSyncEngine {
  private operations: Map<OperationId, CRDTOperation> = new Map();
  
  /**
   * Merge operations from multiple participants
   * @param operations - Array of operations to merge
   */
  mergeOperations(operations: CRDTOperation[]): void {
    // Sort operations by timestamp for deterministic ordering
    const sorted = operations.sort((a, b) => {
      // Primary sort by timestamp
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      // Secondary sort by operation ID for deterministic tie-breaking
      return a.id.toString().localeCompare(b.id.toString());
    });
    
    // Apply operations in order, skipping duplicates
    for (const op of sorted) {
      if (!this.operations.has(op.id)) {
        this.operations.set(op.id, op);
        // Note: Actual CRDT application happens in EncryptedTextCRDT.applyOperation()
        // This engine just manages the operation history
      }
    }
  }
  
  /**
   * Resolve conflicts deterministically
   * Yjs handles conflict resolution automatically, so we just return operations in order
   * @param op1 - First operation
   * @param op2 - Second operation
   * @returns Operations in timestamp order
   */
  resolveConflicts(
    op1: CRDTOperation,
    op2: CRDTOperation
  ): CRDTOperation[] {
    // Yjs handles conflict resolution automatically through its CRDT algorithm
    // Operations are commutative and associative
    // Return both operations in timestamp order
    if (op1.timestamp !== op2.timestamp) {
      return op1.timestamp < op2.timestamp ? [op1, op2] : [op2, op1];
    }
    
    // If timestamps are equal, use operation ID for deterministic ordering
    return op1.id.toString().localeCompare(op2.id.toString()) < 0 ? [op1, op2] : [op2, op1];
  }
  
  /**
   * Get operations since a specific timestamp
   * @param timestamp - Timestamp to get operations after
   * @returns Array of operations sorted by timestamp
   */
  getOperationsSince(timestamp: number): CRDTOperation[] {
    return Array.from(this.operations.values())
      .filter(op => op.timestamp > timestamp)
      .sort((a, b) => {
        // Primary sort by timestamp
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp;
        }
        // Secondary sort by operation ID for deterministic ordering
        return a.id.toString().localeCompare(b.id.toString());
      });
  }
  
  /**
   * Get total number of operations in history
   * @returns Number of operations
   */
  getOperationCount(): number {
    return this.operations.size;
  }
  
  /**
   * Clear all operations from history
   * Used for cleanup when workspace expires
   */
  clear(): void {
    this.operations.clear();
  }
  
  /**
   * Check if an operation exists in history
   * @param operationId - Operation ID to check
   * @returns True if operation exists
   */
  hasOperation(operationId: OperationId): boolean {
    return this.operations.has(operationId);
  }
}
