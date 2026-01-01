/**
 * Unit tests for EncryptedTextCRDT
 * Tests edge cases and specific scenarios
 */

import { EncryptedTextCRDT } from './encrypted-text-crdt.js';
import type { ParticipantId } from '@digitaldefiance-eecp/eecp-protocol';
import { randomUUID } from 'crypto';

describe('EncryptedTextCRDT', () => {
  let crdt: EncryptedTextCRDT;
  let participantId: ParticipantId;
  
  beforeEach(() => {
    crdt = new EncryptedTextCRDT();
    participantId = randomUUID() as ParticipantId;
  });
  
  describe('empty document', () => {
    it('should return empty string for new document', () => {
      expect(crdt.getText()).toBe('');
    });
    
    it('should allow insert at position 0 in empty document', () => {
      const operation = crdt.insert(0, 'Hello', participantId);
      
      expect(operation.type).toBe('insert');
      expect(operation.content).toBe('Hello');
      expect(operation.position).toBe(0);
      expect(crdt.getText()).toBe('Hello');
    });
    
    it('should handle delete on empty document gracefully', () => {
      // Yjs handles this gracefully - deleting from empty doc does nothing
      const operation = crdt.delete(0, 5, participantId);
      
      expect(operation.type).toBe('delete');
      expect(operation.length).toBe(5);
      expect(crdt.getText()).toBe('');
    });
  });
  
  describe('concurrent inserts at same position', () => {
    it('should handle two inserts at position 0', () => {
      const op1 = crdt.insert(0, 'A', participantId);
      const op2 = crdt.insert(0, 'B', participantId);
      
      // After both inserts, document should contain both characters
      const text = crdt.getText();
      expect(text).toContain('A');
      expect(text).toContain('B');
      expect(text.length).toBe(2);
    });
    
    it('should handle multiple inserts at same position', () => {
      crdt.insert(0, 'A', participantId);
      crdt.insert(0, 'B', participantId);
      crdt.insert(0, 'C', participantId);
      
      const text = crdt.getText();
      expect(text).toContain('A');
      expect(text).toContain('B');
      expect(text).toContain('C');
      expect(text.length).toBe(3);
    });
    
    it('should apply remote operations at same position', () => {
      const crdt2 = new EncryptedTextCRDT();
      const participant2 = randomUUID() as ParticipantId;
      
      // Both CRDTs insert at position 0
      const op1 = crdt.insert(0, 'X', participantId);
      const op2 = crdt2.insert(0, 'Y', participant2);
      
      // Apply each other's operations
      crdt.applyOperation(op2);
      crdt2.applyOperation(op1);
      
      // Both should have both characters
      const text1 = crdt.getText();
      const text2 = crdt2.getText();
      
      expect(text1).toContain('X');
      expect(text1).toContain('Y');
      expect(text2).toContain('X');
      expect(text2).toContain('Y');
    });
  });
  
  describe('delete beyond document length', () => {
    it('should handle delete beyond document length', () => {
      crdt.insert(0, 'Hello', participantId);
      
      // Try to delete more than document length
      crdt.delete(0, 100, participantId);
      
      // Document should be empty (Yjs clamps to available length)
      expect(crdt.getText()).toBe('');
    });
    
    it('should handle delete at position beyond document length', () => {
      crdt.insert(0, 'Hello', participantId);
      
      // Try to delete at position beyond document
      crdt.delete(100, 5, participantId);
      
      // Document should be unchanged (Yjs handles this gracefully)
      expect(crdt.getText()).toBe('Hello');
    });
    
    it('should handle delete with length 0', () => {
      crdt.insert(0, 'Hello', participantId);
      
      // Delete with length 0 should do nothing
      crdt.delete(2, 0, participantId);
      
      expect(crdt.getText()).toBe('Hello');
    });
  });
  
  describe('operation validation', () => {
    it('should throw error for insert operation without content', () => {
      const operation = {
        id: randomUUID(),
        participantId,
        timestamp: Date.now(),
        type: 'insert' as const,
        position: 0,
        // content is missing
      };
      
      expect(() => crdt.applyOperation(operation)).toThrow('Insert operation must have content');
    });
    
    it('should throw error for delete operation without length', () => {
      const operation = {
        id: randomUUID(),
        participantId,
        timestamp: Date.now(),
        type: 'delete' as const,
        position: 0,
        // length is missing
      };
      
      expect(() => crdt.applyOperation(operation)).toThrow('Delete operation must have length');
    });
    
    it('should throw error for unknown operation type', () => {
      const operation = {
        id: randomUUID(),
        participantId,
        timestamp: Date.now(),
        type: 'unknown' as any,
        position: 0,
      };
      
      expect(() => crdt.applyOperation(operation)).toThrow('Unknown operation type');
    });
  });
  
  describe('state synchronization', () => {
    it('should sync state between two CRDTs', () => {
      // Create operations in first CRDT
      crdt.insert(0, 'Hello', participantId);
      crdt.insert(5, ' World', participantId);
      
      // Get state
      const state = crdt.getState();
      
      // Create new CRDT and apply state
      const crdt2 = new EncryptedTextCRDT();
      crdt2.applyState(state);
      
      expect(crdt2.getText()).toBe('Hello World');
    });
    
    it('should sync empty document state', () => {
      const state = crdt.getState();
      
      const crdt2 = new EncryptedTextCRDT();
      crdt2.applyState(state);
      
      expect(crdt2.getText()).toBe('');
    });
    
    it('should handle multiple state syncs', () => {
      crdt.insert(0, 'A', participantId);
      const state1 = crdt.getState();
      
      crdt.insert(1, 'B', participantId);
      const state2 = crdt.getState();
      
      const crdt2 = new EncryptedTextCRDT();
      crdt2.applyState(state1);
      expect(crdt2.getText()).toBe('A');
      
      crdt2.applyState(state2);
      expect(crdt2.getText()).toBe('AB');
    });
  });
  
  describe('basic operations', () => {
    it('should insert text at beginning', () => {
      const operation = crdt.insert(0, 'Hello', participantId);
      
      expect(operation.id).toBeDefined();
      expect(operation.participantId).toBe(participantId);
      expect(operation.type).toBe('insert');
      expect(operation.position).toBe(0);
      expect(operation.content).toBe('Hello');
      expect(crdt.getText()).toBe('Hello');
    });
    
    it('should insert text at end', () => {
      crdt.insert(0, 'Hello', participantId);
      crdt.insert(5, ' World', participantId);
      
      expect(crdt.getText()).toBe('Hello World');
    });
    
    it('should insert text in middle', () => {
      crdt.insert(0, 'Helo', participantId);
      crdt.insert(3, 'l', participantId);
      
      expect(crdt.getText()).toBe('Hello');
    });
    
    it('should delete text', () => {
      crdt.insert(0, 'Hello World', participantId);
      const operation = crdt.delete(5, 6, participantId);
      
      expect(operation.type).toBe('delete');
      expect(operation.position).toBe(5);
      expect(operation.length).toBe(6);
      expect(crdt.getText()).toBe('Hello');
    });
    
    it('should handle multiple operations', () => {
      crdt.insert(0, 'Hello', participantId);
      crdt.insert(5, ' ', participantId);
      crdt.insert(6, 'World', participantId);
      crdt.delete(5, 1, participantId);
      crdt.insert(5, ', ', participantId);
      
      expect(crdt.getText()).toBe('Hello, World');
    });
  });
});
