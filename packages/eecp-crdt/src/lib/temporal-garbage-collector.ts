/**
 * Temporal Garbage Collector
 * Removes expired CRDT operations based on expiration time
 */

import type { CRDTOperation } from '@digitaldefiance-eecp/eecp-protocol';

/**
 * Interface for temporal garbage collection
 */
export interface ITemporalGarbageCollector {
  /**
   * Remove expired operations
   * @param operations - Array of CRDT operations to filter
   * @param expirationTime - Unix timestamp (ms) before which operations are considered expired
   * @returns Array of non-expired operations
   */
  collectExpiredOperations(
    operations: CRDTOperation[],
    expirationTime: number
  ): CRDTOperation[];
  
  /**
   * Check if operation is expired
   * @param operation - CRDT operation to check
   * @param expirationTime - Unix timestamp (ms) before which operations are considered expired
   * @returns true if operation is expired, false otherwise
   */
  isOperationExpired(
    operation: CRDTOperation,
    expirationTime: number
  ): boolean;
}

/**
 * Temporal Garbage Collector implementation
 * Filters out expired operations based on their timestamp
 */
export class TemporalGarbageCollector implements ITemporalGarbageCollector {
  /**
   * Remove expired operations from the array
   * Returns only operations that are not expired
   * @param operations - Array of CRDT operations to filter
   * @param expirationTime - Unix timestamp (ms) before which operations are considered expired
   * @returns Array of non-expired operations
   */
  collectExpiredOperations(
    operations: CRDTOperation[],
    expirationTime: number
  ): CRDTOperation[] {
    return operations.filter(op => !this.isOperationExpired(op, expirationTime));
  }
  
  /**
   * Check if an operation is expired
   * An operation is expired if its timestamp is before the expiration time
   * @param operation - CRDT operation to check
   * @param expirationTime - Unix timestamp (ms) before which operations are considered expired
   * @returns true if operation.timestamp < expirationTime, false otherwise
   */
  isOperationExpired(
    operation: CRDTOperation,
    expirationTime: number
  ): boolean {
    return operation.timestamp < expirationTime;
  }
}
