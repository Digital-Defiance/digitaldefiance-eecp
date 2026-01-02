/**
 * Unit tests for Temporal Garbage Collector
 * Tests expired operations removal and non-expired operations retention
 */

import { TemporalGarbageCollector } from './temporal-garbage-collector';
import type { CRDTOperation, OperationId, ParticipantId } from '@digitaldefiance/eecp-protocol';
import { generateUUID } from './uuid-utils.js';

describe('TemporalGarbageCollector', () => {
  let collector: TemporalGarbageCollector;

  beforeEach(() => {
    collector = new TemporalGarbageCollector();
  });

  /**
   * Helper function to create a test CRDT operation
   */
  function createOperation(timestamp: number, content = 'test'): CRDTOperation {
    return {
      id: generateUUID() as OperationId,
      participantId: generateUUID() as ParticipantId,
      timestamp,
      type: 'insert',
      position: 0,
      content
    };
  }

  describe('isOperationExpired', () => {
    it('should return true for operations with timestamp before expiration time', () => {
      const operation = createOperation(1000);
      const expirationTime = 2000;

      const result = collector.isOperationExpired(operation, expirationTime);

      expect(result).toBe(true);
    });

    it('should return false for operations with timestamp equal to expiration time', () => {
      const operation = createOperation(2000);
      const expirationTime = 2000;

      const result = collector.isOperationExpired(operation, expirationTime);

      expect(result).toBe(false);
    });

    it('should return false for operations with timestamp after expiration time', () => {
      const operation = createOperation(3000);
      const expirationTime = 2000;

      const result = collector.isOperationExpired(operation, expirationTime);

      expect(result).toBe(false);
    });

    it('should handle operations at timestamp 0', () => {
      const operation = createOperation(0);
      const expirationTime = 1000;

      const result = collector.isOperationExpired(operation, expirationTime);

      expect(result).toBe(true);
    });

    it('should handle expiration time at 0', () => {
      const operation = createOperation(1000);
      const expirationTime = 0;

      const result = collector.isOperationExpired(operation, expirationTime);

      expect(result).toBe(false);
    });
  });

  describe('collectExpiredOperations', () => {
    it('should remove expired operations and retain non-expired operations', () => {
      const now = Date.now();
      const operations: CRDTOperation[] = [
        createOperation(now - 10000, 'expired1'), // 10 seconds ago
        createOperation(now - 5000, 'expired2'),  // 5 seconds ago
        createOperation(now, 'current'),          // now
        createOperation(now + 5000, 'future')     // 5 seconds in future
      ];
      const expirationTime = now - 1000; // 1 second ago

      const result = collector.collectExpiredOperations(operations, expirationTime);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('current');
      expect(result[1].content).toBe('future');
    });

    it('should return empty array when all operations are expired', () => {
      const operations: CRDTOperation[] = [
        createOperation(1000),
        createOperation(2000),
        createOperation(3000)
      ];
      const expirationTime = 5000;

      const result = collector.collectExpiredOperations(operations, expirationTime);

      expect(result).toHaveLength(0);
    });

    it('should return all operations when none are expired', () => {
      const operations: CRDTOperation[] = [
        createOperation(5000),
        createOperation(6000),
        createOperation(7000)
      ];
      const expirationTime = 3000;

      const result = collector.collectExpiredOperations(operations, expirationTime);

      expect(result).toHaveLength(3);
      expect(result).toEqual(operations);
    });

    it('should handle empty operations array', () => {
      const operations: CRDTOperation[] = [];
      const expirationTime = 5000;

      const result = collector.collectExpiredOperations(operations, expirationTime);

      expect(result).toHaveLength(0);
    });

    it('should preserve operation order', () => {
      const operations: CRDTOperation[] = [
        createOperation(5000, 'first'),
        createOperation(6000, 'second'),
        createOperation(7000, 'third')
      ];
      const expirationTime = 3000;

      const result = collector.collectExpiredOperations(operations, expirationTime);

      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('first');
      expect(result[1].content).toBe('second');
      expect(result[2].content).toBe('third');
    });

    it('should handle operations at the boundary (equal to expiration time)', () => {
      const expirationTime = 5000;
      const operations: CRDTOperation[] = [
        createOperation(4999, 'before'),
        createOperation(5000, 'boundary'),
        createOperation(5001, 'after')
      ];

      const result = collector.collectExpiredOperations(operations, expirationTime);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('boundary');
      expect(result[1].content).toBe('after');
    });

    it('should handle mixed operation types (insert and delete)', () => {
      const now = Date.now();
      const operations: CRDTOperation[] = [
        {
          id: generateUUID() as OperationId,
          participantId: generateUUID() as ParticipantId,
          timestamp: now - 5000,
          type: 'insert',
          position: 0,
          content: 'expired insert'
        },
        {
          id: generateUUID() as OperationId,
          participantId: generateUUID() as ParticipantId,
          timestamp: now,
          type: 'delete',
          position: 0,
          length: 5
        }
      ];
      const expirationTime = now - 1000;

      const result = collector.collectExpiredOperations(operations, expirationTime);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('delete');
    });

    it('should not mutate the original operations array', () => {
      const operations: CRDTOperation[] = [
        createOperation(1000),
        createOperation(5000),
        createOperation(10000)
      ];
      const originalLength = operations.length;
      const expirationTime = 3000;

      collector.collectExpiredOperations(operations, expirationTime);

      expect(operations).toHaveLength(originalLength);
    });
  });
});
