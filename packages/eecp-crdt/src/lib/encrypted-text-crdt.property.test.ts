/**
 * Property-based tests for EncryptedTextCRDT
 * Feature: eecp-full-system
 */

import * as fc from 'fast-check';
import { EncryptedTextCRDT } from './encrypted-text-crdt.js';
import type { CRDTOperation, ParticipantId } from '@digitaldefiance-eecp/eecp-protocol';
import { randomUUID } from 'crypto';

/**
 * Property 20: CRDT Convergence
 * For any set of concurrent operations from multiple participants,
 * all participants must converge to the same document state regardless
 * of operation arrival order.
 * 
 * Validates: Requirements 4.7, 4.8
 */
describe('Feature: eecp-full-system, Property 20: CRDT Convergence', () => {
  test('CRDT instances converge to same state when synced', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of operations
        fc.array(
          fc.record({
            type: fc.constantFrom('insert' as const, 'delete' as const),
            position: fc.nat(100),
            content: fc.string({ minLength: 1, maxLength: 10 }),
            length: fc.nat(10)
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (rawOperations) => {
          // Create two CRDT instances
          const crdt1 = new EncryptedTextCRDT();
          const crdt2 = new EncryptedTextCRDT();
          
          // Convert raw operations to CRDTOperation format
          const operations: CRDTOperation[] = rawOperations.map((op) => ({
            id: randomUUID(),
            participantId: randomUUID() as ParticipantId,
            timestamp: Date.now() + Math.random() * 1000,
            type: op.type,
            position: Math.min(op.position, 100), // Clamp position
            content: op.type === 'insert' ? op.content : undefined,
            length: op.type === 'delete' ? Math.max(1, op.length) : undefined
          }));
          
          // Apply operations in original order to crdt1
          for (const op of operations) {
            try {
              crdt1.applyOperation(op);
            } catch (error) {
              // Skip operations that fail (e.g., delete beyond document length)
              // This is expected behavior
            }
          }
          
          // Apply operations in shuffled order to crdt2
          const shuffled = [...operations].sort(() => Math.random() - 0.5);
          for (const op of shuffled) {
            try {
              crdt2.applyOperation(op);
            } catch (error) {
              // Skip operations that fail
            }
          }
          
          // Sync the two CRDTs using Yjs state synchronization
          // This is the proper way to test CRDT convergence
          const state1 = crdt1.getState();
          const state2 = crdt2.getState();
          
          // Apply each other's states
          crdt1.applyState(state2);
          crdt2.applyState(state1);
          
          // After synchronization, both must converge to same state
          const text1 = crdt1.getText();
          const text2 = crdt2.getText();
          
          // The texts should be equal (convergence property)
          expect(text1).toEqual(text2);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('CRDT state sync produces identical documents', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            type: fc.constantFrom('insert' as const, 'delete' as const),
            position: fc.nat(50),
            content: fc.string({ minLength: 1, maxLength: 5 }),
            length: fc.nat(5)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (rawOperations) => {
          // Create source CRDT and apply operations
          const source = new EncryptedTextCRDT();
          
          const operations: CRDTOperation[] = rawOperations.map((op) => ({
            id: randomUUID(),
            participantId: randomUUID() as ParticipantId,
            timestamp: Date.now(),
            type: op.type,
            position: Math.min(op.position, 50),
            content: op.type === 'insert' ? op.content : undefined,
            length: op.type === 'delete' ? Math.max(1, op.length) : undefined
          }));
          
          for (const op of operations) {
            try {
              source.applyOperation(op);
            } catch (error) {
              // Skip invalid operations
            }
          }
          
          // Get state from source
          const state = source.getState();
          
          // Create new CRDT and apply state
          const target = new EncryptedTextCRDT();
          target.applyState(state);
          
          // Both should have identical text
          expect(target.getText()).toEqual(source.getText());
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('CRDT convergence with concurrent edits from multiple participants', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate operations from two participants
        fc.tuple(
          fc.array(
            fc.record({
              type: fc.constantFrom('insert' as const, 'delete' as const),
              position: fc.nat(20),
              content: fc.string({ minLength: 1, maxLength: 5 }),
              length: fc.nat(5)
            }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.array(
            fc.record({
              type: fc.constantFrom('insert' as const, 'delete' as const),
              position: fc.nat(20),
              content: fc.string({ minLength: 1, maxLength: 5 }),
              length: fc.nat(5)
            }),
            { minLength: 1, maxLength: 10 }
          )
        ),
        async ([ops1Raw, ops2Raw]) => {
          const participant1 = randomUUID() as ParticipantId;
          const participant2 = randomUUID() as ParticipantId;
          
          // Create two CRDT instances (one per participant)
          const crdt1 = new EncryptedTextCRDT();
          const crdt2 = new EncryptedTextCRDT();
          
          // Convert to proper operations
          const ops1: CRDTOperation[] = ops1Raw.map((op) => ({
            id: randomUUID(),
            participantId: participant1,
            timestamp: Date.now(),
            type: op.type,
            position: Math.min(op.position, 20),
            content: op.type === 'insert' ? op.content : undefined,
            length: op.type === 'delete' ? Math.max(1, op.length) : undefined
          }));
          
          const ops2: CRDTOperation[] = ops2Raw.map((op) => ({
            id: randomUUID(),
            participantId: participant2,
            timestamp: Date.now(),
            type: op.type,
            position: Math.min(op.position, 20),
            content: op.type === 'insert' ? op.content : undefined,
            length: op.type === 'delete' ? Math.max(1, op.length) : undefined
          }));
          
          // Participant 1 applies their own operations
          for (const op of ops1) {
            try {
              crdt1.applyOperation(op);
            } catch (error) {
              // Skip invalid operations
            }
          }
          
          // Participant 2 applies their own operations
          for (const op of ops2) {
            try {
              crdt2.applyOperation(op);
            } catch (error) {
              // Skip invalid operations
            }
          }
          
          // Now sync: each participant receives the other's state
          const state1 = crdt1.getState();
          const state2 = crdt2.getState();
          
          crdt1.applyState(state2);
          crdt2.applyState(state1);
          
          // After sync, both should have the same text
          expect(crdt1.getText()).toEqual(crdt2.getText());
        }
      ),
      { numRuns: 100 }
    );
  });
});
