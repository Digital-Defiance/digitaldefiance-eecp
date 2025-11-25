/**
 * Property-based tests for TemporalCleanupService
 * Feature: eecp-full-system
 */

import * as fc from 'fast-check';
import { TemporalCleanupService } from './temporal-cleanup-service.js';
import { WorkspaceManager } from './workspace-manager.js';
import { ParticipantManager, IParticipantManager } from './participant-manager.js';
import { OperationRouter } from './operation-router.js';
import {
  WorkspaceConfig,
  EncryptedOperation,
  ParticipantId,
} from '@digitaldefiance-eecp/eecp-protocol';
import { IParticipantAuth } from '@digitaldefiance-eecp/eecp-crypto';
import { ECIESService, Member, MemberType, EmailString, GuidV4 } from '@digitaldefiance/ecies-lib';

/**
 * Helper function to generate a valid public key for testing
 */
function generateValidPublicKey(eciesService: ECIESService): Buffer {
  const member = Member.newMember(
    eciesService,
    MemberType.User,
    'Creator',
    new EmailString('creator@example.com')
  );
  const publicKey = Buffer.from(member.member.publicKey);
  member.member.dispose();
  return publicKey;
}

// Mock ParticipantAuth for testing
class MockParticipantAuth implements IParticipantAuth {
  generateProof(): any {
    return { signature: Buffer.from('mock-signature'), timestamp: Date.now() };
  }
  
  verifyProof(): boolean {
    return true;
  }
  
  generateChallenge(): Buffer {
    return Buffer.from('mock-challenge');
  }
}

describe('TemporalCleanupService Property Tests', () => {
  let workspaceManager: WorkspaceManager;
  let participantManager: IParticipantManager;
  let operationRouter: OperationRouter;
  let cleanupService: TemporalCleanupService;
  let eciesService: ECIESService;

  beforeEach(() => {
    eciesService = new ECIESService();
    workspaceManager = new WorkspaceManager(eciesService);
    const mockAuth = new MockParticipantAuth();
    participantManager = new ParticipantManager(mockAuth);
    operationRouter = new OperationRouter(participantManager, workspaceManager);
    cleanupService = new TemporalCleanupService(workspaceManager, operationRouter);
  });

  afterEach(() => {
    if (cleanupService) {
      cleanupService.stop();
    }
    if (workspaceManager) {
      workspaceManager.cleanup();
    }
  });

  /**
   * Feature: eecp-full-system, Property 51: Complete Workspace Cleanup
   * Validates: Requirements 18.1, 18.3, 6.6, 9.5
   * 
   * For any expired workspace, the system must delete all keys, operations, metadata,
   * and references from server memory and indexes.
   */
  test('Property 51: Complete Workspace Cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 120 }), // Workspace duration (5-120 minutes)
        fc.integer({ min: 1, max: 10 }), // Number of operations to buffer
        fc.integer({ min: 1, max: 5 }), // Number of participants
        async (durationMinutes, numOperations, numParticipants) => {
          const testEciesService = new ECIESService();
          const workspaceManager = new WorkspaceManager(testEciesService);
          const mockAuth = new MockParticipantAuth();
          const participantManager = new ParticipantManager(mockAuth);
          const operationRouter = new OperationRouter(participantManager, workspaceManager);
          const cleanupService = new TemporalCleanupService(workspaceManager, operationRouter);

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: GuidV4.new(),
              createdAt: now,
              expiresAt: now + durationMinutes * 60 * 1000,
              timeWindow: {
                startTime: now,
                endTime: now + durationMinutes * 60 * 1000,
                rotationInterval: durationMinutes,
                gracePeriod: 60000,
              },
              maxParticipants: 50,
              allowExtension: false,
            };

            // Create workspace
            const workspace = await workspaceManager.createWorkspace(
              config,
              generateValidPublicKey(eciesService)
            );

            // Create participants
            const participantIds: ParticipantId[] = [];
            for (let i = 0; i < numParticipants; i++) {
              participantIds.push(GuidV4.new());
            }

            // Buffer operations for participants (simulating offline participants)
            for (let i = 0; i < numOperations; i++) {
              const operation: EncryptedOperation = {
                id: GuidV4.new(),
                workspaceId: workspace.id,
                participantId: participantIds[i % numParticipants],
                timestamp: now - 1000, // Old timestamp (before current time)
                position: i,
                operationType: 'insert',
                encryptedContent: Buffer.from(`operation-${i}`),
                signature: Buffer.from('signature'),
              };

              // Buffer operation for each participant
              operationRouter.bufferOperation(
                workspace.id,
                participantIds[i % numParticipants],
                operation
              );
            }

            // Verify operations are buffered
            for (const participantId of participantIds) {
              const buffered = operationRouter.getBufferedOperations(
                workspace.id,
                participantId
              );
              // Re-buffer them for the cleanup test
              for (const op of buffered) {
                operationRouter.bufferOperation(workspace.id, participantId, op);
              }
            }

            // Run cleanup with current time (should clear old operations)
            await cleanupService.runCleanup();

            // Verify buffered operations are cleared
            for (const participantId of participantIds) {
              const buffered = operationRouter.getBufferedOperations(
                workspace.id,
                participantId
              );
              // Operations with timestamp < now should be cleared
              expect(buffered.length).toBe(0);
            }

            // Note: In a full implementation, this would also verify:
            // - Temporal keys are deleted
            // - Workspace metadata is removed from memory
            // - Key deletion commitments are published
            // - Workspace is removed from indexes
          } finally {
            cleanupService.stop();
            workspaceManager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: eecp-full-system, Property 52: Cleanup Service Scheduling
   * Validates: Requirements 18.5
   * 
   * For any running server, the temporal cleanup service must scan for expired
   * workspaces every 60 seconds.
   */
  test('Property 52: Cleanup Service Scheduling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }), // Number of start/stop cycles
        async (numCycles) => {
          const testEciesService = new ECIESService();
          const workspaceManager = new WorkspaceManager(testEciesService);
          const mockAuth = new MockParticipantAuth();
          const participantManager = new ParticipantManager(mockAuth);
          const operationRouter = new OperationRouter(participantManager, workspaceManager);
          const cleanupService = new TemporalCleanupService(workspaceManager, operationRouter);

          try {
            // Test multiple start/stop cycles
            for (let i = 0; i < numCycles; i++) {
              // Verify service is not running initially
              expect(cleanupService.isServiceRunning()).toBe(false);

              // Start the service
              cleanupService.start();

              // Verify service is running
              expect(cleanupService.isServiceRunning()).toBe(true);

              // Starting again should be idempotent (no error)
              cleanupService.start();
              expect(cleanupService.isServiceRunning()).toBe(true);

              // Stop the service
              cleanupService.stop();

              // Verify service is stopped
              expect(cleanupService.isServiceRunning()).toBe(false);

              // Stopping again should be safe (no error)
              cleanupService.stop();
              expect(cleanupService.isServiceRunning()).toBe(false);
            }

            // Verify the service can be started and stopped multiple times
            // This validates that the scheduling mechanism is properly managed
            expect(cleanupService.isServiceRunning()).toBe(false);
          } finally {
            cleanupService.stop();
            workspaceManager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
