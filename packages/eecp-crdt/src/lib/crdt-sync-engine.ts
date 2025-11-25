/**
 * CRDT Synchronization Engine Module
 * 
 * Manages operation history, merging, and synchronization for CRDT-based
 * collaborative editing. Ensures deterministic operation ordering and provides
 * mechanisms for participants to catch up after being offline.
 * 
 * Key Responsibilities:
 * - Maintain operation history
 * - Merge operations from multiple participants
 * - Resolve conflicts deterministically
 * - Provide operations for synchronization
 * 
 * The sync engine works with Yjs CRDT to ensure:
 * - Eventual consistency across all participants
 * - Deterministic conflict resolution
 * - Efficient state synchronization
 * 
 * @module crdt-sync-engine
 */

import type { CRDTOperation, OperationId } from '@digitaldefiance-eecp/eecp-protocol';

/**
 * Interface for CRDT synchronization engine operations
 * 
 * Defines the contract for managing operation history and synchronization.
 */
export interface ICRDTSyncEngine {
  /**
   * Merge operations from multiple participants
   * 
   * Accepts an array of operations and merges them into the operation history.
   * Operations are sorted by timestamp for deterministic ordering, with
   * operation ID used as a tie-breaker for operations with identical timestamps.
   * 
   * Duplicate operations (same ID) are automatically skipped to ensure
   * idempotent merging.
   * 
   * @param {CRDTOperation[]} operations - Array of operations to merge
   * 
   * @example
   * ```typescript
   * const engine = new CRDTSyncEngine();
   * engine.mergeOperations([op1, op2, op3]);
   * // Operations are now in history, sorted by timestamp
   * ```
   */
  mergeOperations(operations: CRDTOperation[]): void;
  
  /**
   * Resolve conflicts deterministically using Yjs
   * 
   * Returns two operations in deterministic order based on timestamp and ID.
   * Yjs handles the actual conflict resolution automatically through its CRDT
   * algorithm - this method just ensures consistent ordering.
   * 
   * Operations are commutative and associative in Yjs, so the order only
   * matters for determinism, not correctness.
   * 
   * @param {CRDTOperation} op1 - First operation
   * @param {CRDTOperation} op2 - Second operation
   * @returns {CRDTOperation[]} Operations in deterministic order
   * 
   * @example
   * ```typescript
   * const engine = new CRDTSyncEngine();
   * const ordered = engine.resolveConflicts(op1, op2);
   * // Apply in order: ordered[0], then ordered[1]
   * ```
   */
  resolveConflicts(
    op1: CRDTOperation,
    op2: CRDTOperation
  ): CRDTOperation[];
  
  /**
   * Get operations since a specific timestamp
   * 
   * Returns all operations in history that occurred after the given timestamp,
   * sorted by timestamp (and ID for tie-breaking). This is used for
   * synchronization when a participant reconnects or joins mid-session.
   * 
   * @param {number} timestamp - Unix timestamp in milliseconds to get operations after
   * @returns {CRDTOperation[]} Array of operations sorted by timestamp
   * 
   * @example
   * ```typescript
   * const engine = new CRDTSyncEngine();
   * const lastSeen = Date.now() - 60000; // 1 minute ago
   * const missedOps = engine.getOperationsSince(lastSeen);
   * // Apply missedOps to catch up
   * ```
   */
  getOperationsSince(timestamp: number): CRDTOperation[];
}

/**
 * CRDT Synchronization Engine implementation
 * 
 * Manages operation history and provides synchronization capabilities for
 * CRDT-based collaborative editing. Works in conjunction with Yjs to ensure
 * eventual consistency across all participants.
 * 
 * The engine maintains an in-memory map of all operations, indexed by operation ID
 * for efficient duplicate detection and retrieval.
 * 
 * Operation Ordering:
 * - Primary sort: timestamp (earlier operations first)
 * - Secondary sort: operation ID (lexicographic order)
 * 
 * This ensures deterministic ordering even when operations have identical timestamps,
 * which can occur due to clock precision or concurrent edits.
 * 
 * @implements {ICRDTSyncEngine}
 * 
 * @example
 * ```typescript
 * const engine = new CRDTSyncEngine();
 * 
 * // Merge incoming operations
 * engine.mergeOperations(receivedOps);
 * 
 * // Get operations for sync
 * const ops = engine.getOperationsSince(lastSeenTimestamp);
 * 
 * // Check operation count
 * console.log('Total operations:', engine.getOperationCount());
 * ```
 */
export class CRDTSyncEngine implements ICRDTSyncEngine {
  /**
   * Map of operation ID to operation for efficient lookup and duplicate detection
   * @private
   */
  private operations: Map<OperationId, CRDTOperation> = new Map();
  
  /**
   * Merge operations from multiple participants
   * 
   * Sorts operations by timestamp (and ID for tie-breaking) and adds them to
   * the operation history. Duplicate operations are automatically skipped.
   * 
   * The sorting ensures deterministic ordering across all participants, which
   * is important for:
   * - Consistent operation application
   * - Reproducible document states
   * - Debugging and auditing
   * 
   * Note: This method manages the operation history. The actual CRDT application
   * happens in EncryptedTextCRDT.applyOperation().
   * 
   * @param {CRDTOperation[]} operations - Array of operations to merge
   * 
   * @example
   * ```typescript
   * const engine = new CRDTSyncEngine();
   * 
   * // Merge operations from multiple sources
   * engine.mergeOperations([...localOps, ...remoteOps]);
   * 
   * console.log('Total operations:', engine.getOperationCount());
   * ```
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
   * 
   * Returns two operations in deterministic order based on timestamp and ID.
   * Yjs handles the actual conflict resolution automatically through its CRDT
   * algorithm, so this method just ensures consistent ordering.
   * 
   * The ordering is:
   * 1. Earlier timestamp first
   * 2. If timestamps equal, lexicographically smaller ID first
   * 
   * This ensures all participants apply operations in the same order, which
   * is important for deterministic behavior even though Yjs operations are
   * commutative.
   * 
   * @param {CRDTOperation} op1 - First operation
   * @param {CRDTOperation} op2 - Second operation
   * @returns {CRDTOperation[]} Operations in timestamp order
   * 
   * @example
   * ```typescript
   * const engine = new CRDTSyncEngine();
   * 
   * // Get deterministic order for concurrent operations
   * const ordered = engine.resolveConflicts(op1, op2);
   * 
   * // Apply in order
   * for (const op of ordered) {
   *   crdt.applyOperation(op);
   * }
   * ```
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
   * 
   * Filters the operation history to return only operations that occurred after
   * the given timestamp. Results are sorted by timestamp (and ID for tie-breaking).
   * 
   * This is used for:
   * - Catching up after reconnection
   * - Syncing new participants
   * - Incremental state updates
   * 
   * @param {number} timestamp - Unix timestamp in milliseconds to get operations after
   * @returns {CRDTOperation[]} Array of operations sorted by timestamp
   * 
   * @example
   * ```typescript
   * const engine = new CRDTSyncEngine();
   * 
   * // Get operations since last sync
   * const lastSync = localStorage.getItem('lastSyncTime');
   * const newOps = engine.getOperationsSince(Number(lastSync));
   * 
   * // Apply new operations
   * for (const op of newOps) {
   *   crdt.applyOperation(op);
   * }
   * 
   * // Update last sync time
   * localStorage.setItem('lastSyncTime', Date.now().toString());
   * ```
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
   * 
   * Returns the count of unique operations stored in the engine.
   * Useful for monitoring memory usage and debugging.
   * 
   * @returns {number} Number of operations in history
   * 
   * @example
   * ```typescript
   * const engine = new CRDTSyncEngine();
   * console.log('Operations in history:', engine.getOperationCount());
   * ```
   */
  getOperationCount(): number {
    return this.operations.size;
  }
  
  /**
   * Clear all operations from history
   * 
   * Removes all operations from the engine. This should be called when:
   * - A workspace expires
   * - Cleaning up resources
   * - Resetting state for testing
   * 
   * @example
   * ```typescript
   * const engine = new CRDTSyncEngine();
   * 
   * // When workspace expires
   * engine.clear();
   * console.log('Operations cleared:', engine.getOperationCount() === 0);
   * ```
   */
  clear(): void {
    this.operations.clear();
  }
  
  /**
   * Check if an operation exists in history
   * 
   * Checks whether an operation with the given ID has been merged into
   * the history. Useful for duplicate detection and debugging.
   * 
   * @param {OperationId} operationId - Operation ID to check
   * @returns {boolean} True if operation exists in history
   * 
   * @example
   * ```typescript
   * const engine = new CRDTSyncEngine();
   * 
   * if (engine.hasOperation(op.id)) {
   *   console.log('Operation already processed');
   * } else {
   *   engine.mergeOperations([op]);
   * }
   * ```
   */
  hasOperation(operationId: OperationId): boolean {
    return this.operations.has(operationId);
  }
}
