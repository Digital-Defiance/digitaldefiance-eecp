/**
 * Unit tests for CRDT Sync Engine
 * Tests edge cases for operation merging and synchronization
 */

import { CRDTSyncEngine } from './crdt-sync-engine';
import type { CRDTOperation, OperationId, ParticipantId } from '@digitaldefiance/eecp-protocol';
import { generateUUID } from './uuid-utils.js';

describe('CRDTSyncEngine', () => {
  let syncEngine: CRDTSyncEngine;
  
  beforeEach(() => {
    syncEngine = new CRDTSyncEngine();
  });
  
  // Helper function to create test operations
  function createOperation(
    timestamp: number,
    type: 'insert' | 'delete' = 'insert',
    content?: string,
    length?: number
  ): CRDTOperation {
    return {
      id: generateUUID() as OperationId,
      participantId: generateUUID() as ParticipantId,
      timestamp,
      type,
      position: 0,
      content,
      length
    };
  }
  
  describe('mergeOperations', () => {
    it('should handle empty operation list', () => {
      // Test empty operation list
      syncEngine.mergeOperations([]);
      
      expect(syncEngine.getOperationCount()).toBe(0);
      expect(syncEngine.getOperationsSince(0)).toEqual([]);
    });
    
    it('should merge operations in timestamp order', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(2000, 'insert', 'b');
      const op3 = createOperation(1500, 'insert', 'c');
      
      // Merge operations in random order
      syncEngine.mergeOperations([op2, op1, op3]);
      
      // Should be sorted by timestamp
      const operations = syncEngine.getOperationsSince(0);
      expect(operations).toHaveLength(3);
      expect(operations[0].id).toBe(op1.id);
      expect(operations[1].id).toBe(op3.id);
      expect(operations[2].id).toBe(op2.id);
    });
    
    it('should skip duplicate operations', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(2000, 'insert', 'b');
      
      // Merge operations twice
      syncEngine.mergeOperations([op1, op2]);
      syncEngine.mergeOperations([op1, op2]); // Duplicates
      
      // Should only have 2 operations, not 4
      expect(syncEngine.getOperationCount()).toBe(2);
      expect(syncEngine.hasOperation(op1.id)).toBe(true);
      expect(syncEngine.hasOperation(op2.id)).toBe(true);
    });
    
    it('should handle operations with same timestamp', () => {
      const timestamp = 1000;
      const op1 = createOperation(timestamp, 'insert', 'a');
      const op2 = createOperation(timestamp, 'insert', 'b');
      const op3 = createOperation(timestamp, 'insert', 'c');
      
      // Merge operations with same timestamp
      syncEngine.mergeOperations([op3, op1, op2]);
      
      // Should be sorted by operation ID (deterministic)
      const operations = syncEngine.getOperationsSince(0);
      expect(operations).toHaveLength(3);
      
      // Verify deterministic ordering by ID
      const sortedByIdManually = [op1, op2, op3].sort((a, b) => a.id.localeCompare(b.id));
      expect(operations[0].id).toBe(sortedByIdManually[0].id);
      expect(operations[1].id).toBe(sortedByIdManually[1].id);
      expect(operations[2].id).toBe(sortedByIdManually[2].id);
    });
    
    it('should handle single operation', () => {
      const op = createOperation(1000, 'insert', 'test');
      
      syncEngine.mergeOperations([op]);
      
      expect(syncEngine.getOperationCount()).toBe(1);
      expect(syncEngine.hasOperation(op.id)).toBe(true);
    });
    
    it('should handle large number of operations', () => {
      const operations: CRDTOperation[] = [];
      for (let i = 0; i < 1000; i++) {
        operations.push(createOperation(i + 1, 'insert', `op${i}`));
      }
      
      syncEngine.mergeOperations(operations);
      
      expect(syncEngine.getOperationCount()).toBe(1000);
      const retrieved = syncEngine.getOperationsSince(0);
      expect(retrieved).toHaveLength(1000);
      
      // Verify sorted by timestamp
      for (let i = 1; i < retrieved.length; i++) {
        expect(retrieved[i].timestamp).toBeGreaterThanOrEqual(retrieved[i - 1].timestamp);
      }
    });
  });
  
  describe('resolveConflicts', () => {
    it('should order operations by timestamp', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(2000, 'insert', 'b');
      
      const resolved = syncEngine.resolveConflicts(op2, op1);
      
      expect(resolved).toHaveLength(2);
      expect(resolved[0].id).toBe(op1.id);
      expect(resolved[1].id).toBe(op2.id);
    });
    
    it('should handle operations with same timestamp', () => {
      const timestamp = 1000;
      const op1 = createOperation(timestamp, 'insert', 'a');
      const op2 = createOperation(timestamp, 'insert', 'b');
      
      const resolved = syncEngine.resolveConflicts(op1, op2);
      
      expect(resolved).toHaveLength(2);
      
      // Should be ordered by operation ID
      const expectedFirst = op1.id.localeCompare(op2.id) < 0 ? op1 : op2;
      const expectedSecond = op1.id.localeCompare(op2.id) < 0 ? op2 : op1;
      
      expect(resolved[0].id).toBe(expectedFirst.id);
      expect(resolved[1].id).toBe(expectedSecond.id);
    });
    
    it('should be deterministic for same inputs', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(1000, 'insert', 'b');
      
      const resolved1 = syncEngine.resolveConflicts(op1, op2);
      const resolved2 = syncEngine.resolveConflicts(op1, op2);
      const resolved3 = syncEngine.resolveConflicts(op2, op1); // Reversed order
      
      // All should produce same ordering
      expect(resolved1[0].id).toBe(resolved2[0].id);
      expect(resolved1[1].id).toBe(resolved2[1].id);
      expect(resolved1[0].id).toBe(resolved3[0].id);
      expect(resolved1[1].id).toBe(resolved3[1].id);
    });
    
    it('should handle insert and delete operations', () => {
      const insertOp = createOperation(1000, 'insert', 'hello');
      const deleteOp = createOperation(2000, 'delete', undefined, 5);
      
      const resolved = syncEngine.resolveConflicts(deleteOp, insertOp);
      
      expect(resolved).toHaveLength(2);
      expect(resolved[0].id).toBe(insertOp.id);
      expect(resolved[1].id).toBe(deleteOp.id);
    });
  });
  
  describe('getOperationsSince', () => {
    it('should return empty array when no operations exist', () => {
      const operations = syncEngine.getOperationsSince(0);
      
      expect(operations).toEqual([]);
    });
    
    it('should return operations after timestamp', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(2000, 'insert', 'b');
      const op3 = createOperation(3000, 'insert', 'c');
      
      syncEngine.mergeOperations([op1, op2, op3]);
      
      const operations = syncEngine.getOperationsSince(1500);
      
      expect(operations).toHaveLength(2);
      expect(operations[0].id).toBe(op2.id);
      expect(operations[1].id).toBe(op3.id);
    });
    
    it('should return all operations when timestamp is 0', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(2000, 'insert', 'b');
      
      syncEngine.mergeOperations([op1, op2]);
      
      const operations = syncEngine.getOperationsSince(0);
      
      expect(operations).toHaveLength(2);
    });
    
    it('should return empty array when timestamp is after all operations', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(2000, 'insert', 'b');
      
      syncEngine.mergeOperations([op1, op2]);
      
      const operations = syncEngine.getOperationsSince(3000);
      
      expect(operations).toEqual([]);
    });
    
    it('should not include operations at exact timestamp', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(2000, 'insert', 'b');
      const op3 = createOperation(3000, 'insert', 'c');
      
      syncEngine.mergeOperations([op1, op2, op3]);
      
      const operations = syncEngine.getOperationsSince(2000);
      
      // Should only include op3 (timestamp > 2000)
      expect(operations).toHaveLength(1);
      expect(operations[0].id).toBe(op3.id);
    });
    
    it('should return operations in sorted order', () => {
      const op1 = createOperation(3000, 'insert', 'c');
      const op2 = createOperation(1000, 'insert', 'a');
      const op3 = createOperation(2000, 'insert', 'b');
      
      syncEngine.mergeOperations([op1, op2, op3]);
      
      const operations = syncEngine.getOperationsSince(0);
      
      expect(operations).toHaveLength(3);
      expect(operations[0].timestamp).toBe(1000);
      expect(operations[1].timestamp).toBe(2000);
      expect(operations[2].timestamp).toBe(3000);
    });
  });
  
  describe('utility methods', () => {
    it('should track operation count correctly', () => {
      expect(syncEngine.getOperationCount()).toBe(0);
      
      const op1 = createOperation(1000, 'insert', 'a');
      syncEngine.mergeOperations([op1]);
      expect(syncEngine.getOperationCount()).toBe(1);
      
      const op2 = createOperation(2000, 'insert', 'b');
      syncEngine.mergeOperations([op2]);
      expect(syncEngine.getOperationCount()).toBe(2);
    });
    
    it('should check if operation exists', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(2000, 'insert', 'b');
      
      syncEngine.mergeOperations([op1]);
      
      expect(syncEngine.hasOperation(op1.id)).toBe(true);
      expect(syncEngine.hasOperation(op2.id)).toBe(false);
    });
    
    it('should clear all operations', () => {
      const op1 = createOperation(1000, 'insert', 'a');
      const op2 = createOperation(2000, 'insert', 'b');
      
      syncEngine.mergeOperations([op1, op2]);
      expect(syncEngine.getOperationCount()).toBe(2);
      
      syncEngine.clear();
      
      expect(syncEngine.getOperationCount()).toBe(0);
      expect(syncEngine.getOperationsSince(0)).toEqual([]);
      expect(syncEngine.hasOperation(op1.id)).toBe(false);
    });
  });
});
