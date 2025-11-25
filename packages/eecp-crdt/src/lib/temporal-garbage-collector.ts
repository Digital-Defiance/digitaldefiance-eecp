/**
 * Temporal Garbage Collector Module
 * 
 * Implements garbage collection for expired CRDT operations. As workspaces expire
 * and temporal keys are deleted, operations encrypted with those keys become
 * unreadable. This module removes such expired operations from memory to prevent
 * accumulation of undecryptable data.
 * 
 * The garbage collector:
 * - Filters operations based on expiration time
 * - Removes operations older than the workspace expiration
 * - Helps maintain memory efficiency
 * - Ensures expired content is not retained
 * 
 * @module temporal-garbage-collector
 */

import type { CRDTOperation } from '@digitaldefiance-eecp/eecp-protocol';

/**
 * Interface for temporal garbage collection operations
 * 
 * Defines the contract for identifying and removing expired CRDT operations.
 */
export interface ITemporalGarbageCollector {
  /**
   * Remove expired operations from an array
   * 
   * Filters the input array to return only operations that are not expired.
   * Operations with timestamps before the expiration time are considered expired
   * and are removed.
   * 
   * @param {CRDTOperation[]} operations - Array of CRDT operations to filter
   * @param {number} expirationTime - Unix timestamp in milliseconds; operations before this are expired
   * @returns {CRDTOperation[]} Array containing only non-expired operations
   * 
   * @example
   * ```typescript
   * const collector = new TemporalGarbageCollector();
   * const expirationTime = Date.now() - 3600000; // 1 hour ago
   * const validOps = collector.collectExpiredOperations(allOps, expirationTime);
   * console.log(`Removed ${allOps.length - validOps.length} expired operations`);
   * ```
   */
  collectExpiredOperations(
    operations: CRDTOperation[],
    expirationTime: number
  ): CRDTOperation[];
  
  /**
   * Check if a single operation is expired
   * 
   * Determines whether an operation's timestamp is before the expiration time.
   * This is useful for checking individual operations before processing.
   * 
   * @param {CRDTOperation} operation - CRDT operation to check
   * @param {number} expirationTime - Unix timestamp in milliseconds; operations before this are expired
   * @returns {boolean} True if operation is expired, false otherwise
   * 
   * @example
   * ```typescript
   * const collector = new TemporalGarbageCollector();
   * const expirationTime = workspace.expiresAt;
   * 
   * if (collector.isOperationExpired(operation, expirationTime)) {
   *   console.log('Operation is expired and should be discarded');
   * }
   * ```
   */
  isOperationExpired(
    operation: CRDTOperation,
    expirationTime: number
  ): boolean;
}

/**
 * Temporal Garbage Collector implementation
 * 
 * Implements garbage collection for CRDT operations based on temporal expiration.
 * Operations are considered expired if their timestamp is before the specified
 * expiration time.
 * 
 * This is used to:
 * - Clean up operations after workspace expiration
 * - Remove operations encrypted with deleted temporal keys
 * - Maintain memory efficiency in long-running sessions
 * - Ensure compliance with data retention policies
 * 
 * The collector uses a simple timestamp comparison for efficiency.
 * Operations are immutable, so once expired, they remain expired.
 * 
 * @implements {ITemporalGarbageCollector}
 * 
 * @example
 * ```typescript
 * const collector = new TemporalGarbageCollector();
 * 
 * // Clean up expired operations
 * const expirationTime = workspace.expiresAt;
 * const validOps = collector.collectExpiredOperations(operations, expirationTime);
 * 
 * // Check individual operation
 * if (collector.isOperationExpired(op, expirationTime)) {
 *   // Discard expired operation
 * }
 * ```
 */
export class TemporalGarbageCollector implements ITemporalGarbageCollector {
  /**
   * Remove expired operations from an array
   * 
   * Filters the input array using the isOperationExpired() method to determine
   * which operations should be retained. This is a pure function that doesn't
   * modify the input array.
   * 
   * The filtering is done in a single pass for efficiency. Operations are
   * checked in order, and only non-expired operations are included in the result.
   * 
   * @param {CRDTOperation[]} operations - Array of CRDT operations to filter
   * @param {number} expirationTime - Unix timestamp in milliseconds
   * @returns {CRDTOperation[]} New array containing only non-expired operations
   * 
   * @example
   * ```typescript
   * const collector = new TemporalGarbageCollector();
   * 
   * // Remove operations older than 1 hour
   * const oneHourAgo = Date.now() - 3600000;
   * const recentOps = collector.collectExpiredOperations(allOps, oneHourAgo);
   * 
   * console.log(`Kept ${recentOps.length} of ${allOps.length} operations`);
   * ```
   */
  collectExpiredOperations(
    operations: CRDTOperation[],
    expirationTime: number
  ): CRDTOperation[] {
    return operations.filter(op => !this.isOperationExpired(op, expirationTime));
  }
  
  /**
   * Check if an operation is expired
   * 
   * Compares the operation's timestamp with the expiration time.
   * An operation is considered expired if its timestamp is strictly less than
   * the expiration time.
   * 
   * This method is used internally by collectExpiredOperations() and can also
   * be used directly for checking individual operations.
   * 
   * @param {CRDTOperation} operation - CRDT operation to check
   * @param {number} expirationTime - Unix timestamp in milliseconds
   * @returns {boolean} True if operation.timestamp < expirationTime
   * 
   * @example
   * ```typescript
   * const collector = new TemporalGarbageCollector();
   * const workspaceExpiration = workspace.expiresAt;
   * 
   * // Check before processing
   * if (!collector.isOperationExpired(operation, workspaceExpiration)) {
   *   await processOperation(operation);
   * } else {
   *   console.log('Skipping expired operation');
   * }
   * ```
   */
  isOperationExpired(
    operation: CRDTOperation,
    expirationTime: number
  ): boolean {
    return operation.timestamp < expirationTime;
  }
}
