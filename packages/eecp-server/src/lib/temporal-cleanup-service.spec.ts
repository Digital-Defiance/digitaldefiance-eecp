/**
 * Unit tests for TemporalCleanupService
 */

import { TemporalCleanupService } from './temporal-cleanup-service.js';
import { WorkspaceManager } from './workspace-manager.js';
import { ParticipantManager, IParticipantManager } from './participant-manager.js';
import { OperationRouter } from './operation-router.js';
import {
  WorkspaceConfig,
  EncryptedOperation,
} from '@digitaldefiance-eecp/eecp-protocol';
import { IParticipantAuth } from '@digitaldefiance-eecp/eecp-crypto';
import { randomUUID } from 'crypto';

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

describe('TemporalCleanupService', () => {
  let workspaceManager: WorkspaceManager;
  let participantManager: IParticipantManager;
  let operationRouter: OperationRouter;
  let cleanupService: TemporalCleanupService;

  beforeEach(() => {
    workspaceManager = new WorkspaceManager();
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

  describe('constructor', () => {
    it('should require WorkspaceManager', () => {
      expect(() => {
        new TemporalCleanupService(null as any, operationRouter);
      }).toThrow('WorkspaceManager is required');
    });

    it('should require OperationRouter', () => {
      expect(() => {
        new TemporalCleanupService(workspaceManager, null as any);
      }).toThrow('OperationRouter is required');
    });

    it('should create service successfully with valid dependencies', () => {
      const service = new TemporalCleanupService(workspaceManager, operationRouter);
      expect(service).toBeDefined();
      expect(service.isServiceRunning()).toBe(false);
    });
  });

  describe('start', () => {
    it('should start the cleanup service', () => {
      expect(cleanupService.isServiceRunning()).toBe(false);
      cleanupService.start();
      expect(cleanupService.isServiceRunning()).toBe(true);
    });

    it('should be idempotent - starting twice should not cause issues', () => {
      cleanupService.start();
      expect(cleanupService.isServiceRunning()).toBe(true);
      
      // Start again
      cleanupService.start();
      expect(cleanupService.isServiceRunning()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop the cleanup service', () => {
      cleanupService.start();
      expect(cleanupService.isServiceRunning()).toBe(true);
      
      cleanupService.stop();
      expect(cleanupService.isServiceRunning()).toBe(false);
    });

    it('should be safe to call stop when not running', () => {
      expect(cleanupService.isServiceRunning()).toBe(false);
      
      // Should not throw
      cleanupService.stop();
      expect(cleanupService.isServiceRunning()).toBe(false);
    });

    it('should be safe to call stop multiple times', () => {
      cleanupService.start();
      cleanupService.stop();
      
      // Stop again
      cleanupService.stop();
      expect(cleanupService.isServiceRunning()).toBe(false);
    });
  });

  describe('runCleanup', () => {
    it('should execute cleanup without errors', async () => {
      await expect(cleanupService.runCleanup()).resolves.not.toThrow();
    });

    it('should clear expired buffered operations', async () => {
      const now = Date.now();
      const workspaceId = randomUUID();
      const participantId = randomUUID();

      // Create a workspace
      const config: WorkspaceConfig = {
        id: workspaceId,
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 30,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      await workspaceManager.createWorkspace(
        config,
        Buffer.from('creator-public-key')
      );

      // Buffer an old operation
      const oldOperation: EncryptedOperation = {
        id: randomUUID(),
        workspaceId,
        participantId,
        timestamp: now - 5000, // 5 seconds ago
        position: 0,
        operationType: 'insert',
        encryptedContent: Buffer.from('old-content'),
        signature: Buffer.from('signature'),
      };

      operationRouter.bufferOperation(workspaceId, participantId, oldOperation);

      // Run cleanup
      await cleanupService.runCleanup();

      // Verify old operation was cleared
      const buffered = operationRouter.getBufferedOperations(workspaceId, participantId);
      expect(buffered.length).toBe(0);
    });

    it('should preserve recent buffered operations', async () => {
      const now = Date.now();
      const workspaceId = randomUUID();
      const participantId = randomUUID();

      // Create a workspace
      const config: WorkspaceConfig = {
        id: workspaceId,
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 30,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      await workspaceManager.createWorkspace(
        config,
        Buffer.from('creator-public-key')
      );

      // Buffer a recent operation (future timestamp)
      const recentOperation: EncryptedOperation = {
        id: randomUUID(),
        workspaceId,
        participantId,
        timestamp: now + 5000, // 5 seconds in the future
        position: 0,
        operationType: 'insert',
        encryptedContent: Buffer.from('recent-content'),
        signature: Buffer.from('signature'),
      };

      operationRouter.bufferOperation(workspaceId, participantId, recentOperation);

      // Run cleanup
      await cleanupService.runCleanup();

      // Verify recent operation was preserved
      const buffered = operationRouter.getBufferedOperations(workspaceId, participantId);
      expect(buffered.length).toBe(1);
      expect(buffered[0].id).toBe(recentOperation.id);
    });
  });

  describe('lifecycle', () => {
    it('should support multiple start/stop cycles', () => {
      // Cycle 1
      cleanupService.start();
      expect(cleanupService.isServiceRunning()).toBe(true);
      cleanupService.stop();
      expect(cleanupService.isServiceRunning()).toBe(false);

      // Cycle 2
      cleanupService.start();
      expect(cleanupService.isServiceRunning()).toBe(true);
      cleanupService.stop();
      expect(cleanupService.isServiceRunning()).toBe(false);

      // Cycle 3
      cleanupService.start();
      expect(cleanupService.isServiceRunning()).toBe(true);
      cleanupService.stop();
      expect(cleanupService.isServiceRunning()).toBe(false);
    });
  });
});
