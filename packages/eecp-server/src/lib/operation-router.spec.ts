/**
 * Unit tests for OperationRouter
 */

import { OperationRouter, IOperationRouter } from './operation-router.js';
import { IParticipantManager, ParticipantSession } from './participant-manager.js';
import { IWorkspaceManager, Workspace } from './workspace-manager.js';
import {
  WorkspaceId,
  ParticipantId,
  EncryptedOperation,
  WorkspaceConfig,
} from '@digitaldefiance-eecp/eecp-protocol';

describe('OperationRouter', () => {
  let router: IOperationRouter;
  let mockParticipantManager: jest.Mocked<IParticipantManager>;
  let mockWorkspaceManager: jest.Mocked<IWorkspaceManager>;
  let mockWorkspace: Workspace;
  let mockConfig: WorkspaceConfig;

  beforeEach(() => {
    // Create mock workspace config
    mockConfig = {
      id: 'workspace-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
      timeWindow: {
        startTime: Date.now(),
        endTime: Date.now() + 30 * 60 * 1000,
        rotationInterval: 15,
        gracePeriod: 60 * 1000,
      },
      maxParticipants: 50,
      allowExtension: false,
    };

    // Create mock workspace
    mockWorkspace = {
      id: 'workspace-1',
      config: mockConfig,
      encryptedMetadata: Buffer.alloc(0),
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
      status: 'active',
      participantCount: 0,
    };

    // Create mock participant manager
    mockParticipantManager = {
      authenticateParticipant: jest.fn(),
      getSession: jest.fn(),
      removeParticipant: jest.fn(),
      getWorkspaceParticipants: jest.fn(),
    } as jest.Mocked<IParticipantManager>;

    // Create mock workspace manager
    mockWorkspaceManager = {
      createWorkspace: jest.fn(),
      getWorkspace: jest.fn().mockResolvedValue(mockWorkspace),
      extendWorkspace: jest.fn(),
      revokeWorkspace: jest.fn(),
      isWorkspaceExpired: jest.fn().mockReturnValue(false),
    } as jest.Mocked<IWorkspaceManager>;

    // Create router instance
    router = new OperationRouter(mockParticipantManager, mockWorkspaceManager);
  });

  describe('constructor', () => {
    it('should throw error if participantManager is not provided', () => {
      expect(() => new OperationRouter(null as any, mockWorkspaceManager)).toThrow(
        'ParticipantManager is required'
      );
    });

    it('should throw error if workspaceManager is not provided', () => {
      expect(() => new OperationRouter(mockParticipantManager, null as any)).toThrow(
        'WorkspaceManager is required'
      );
    });
  });

  describe('routeOperation', () => {
    let mockOperation: EncryptedOperation;
    let mockSender: ParticipantSession;
    let mockReceiver1: ParticipantSession;
    let mockReceiver2: ParticipantSession;

    beforeEach(() => {
      mockOperation = {
        id: 'op-1',
        workspaceId: 'workspace-1',
        participantId: 'sender-1',
        timestamp: Date.now(),
        position: 0,
        operationType: 'insert',
        encryptedContent: Buffer.from('encrypted'),
        signature: Buffer.from('signature'),
      };

      mockSender = {
        participantId: 'sender-1',
        workspaceId: 'workspace-1',
        publicKey: Buffer.from('sender-key'),
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        websocket: {
          send: jest.fn(),
        },
      };

      mockReceiver1 = {
        participantId: 'receiver-1',
        workspaceId: 'workspace-1',
        publicKey: Buffer.from('receiver1-key'),
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        websocket: {
          send: jest.fn(),
        },
      };

      mockReceiver2 = {
        participantId: 'receiver-2',
        workspaceId: 'workspace-1',
        publicKey: Buffer.from('receiver2-key'),
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        websocket: {
          send: jest.fn(),
        },
      };
    });

    it('should throw error if workspaceId is not provided', async () => {
      await expect(
        router.routeOperation('' as WorkspaceId, mockOperation, 'sender-1')
      ).rejects.toThrow('Workspace ID is required');
    });

    it('should throw error if operation is not provided', async () => {
      await expect(
        router.routeOperation('workspace-1', null as any, 'sender-1')
      ).rejects.toThrow('Operation is required');
    });

    it('should throw error if senderParticipantId is not provided', async () => {
      await expect(
        router.routeOperation('workspace-1', mockOperation, '' as ParticipantId)
      ).rejects.toThrow('Sender participant ID is required');
    });

    it('should throw error if workspace not found', async () => {
      mockWorkspaceManager.getWorkspace.mockResolvedValue(null);

      await expect(
        router.routeOperation('workspace-1', mockOperation, 'sender-1')
      ).rejects.toThrow('Workspace not found');
    });

    it('should throw error if workspace is expired', async () => {
      mockWorkspaceManager.isWorkspaceExpired.mockReturnValue(true);

      await expect(
        router.routeOperation('workspace-1', mockOperation, 'sender-1')
      ).rejects.toThrow('Workspace expired');
    });

    it('should broadcast operation to all participants except sender', async () => {
      mockParticipantManager.getWorkspaceParticipants.mockReturnValue([
        mockSender,
        mockReceiver1,
        mockReceiver2,
      ]);

      await router.routeOperation('workspace-1', mockOperation, 'sender-1');

      // Sender should not receive
      expect(mockSender.websocket.send).not.toHaveBeenCalled();

      // Receivers should receive
      expect(mockReceiver1.websocket.send).toHaveBeenCalledTimes(1);
      expect(mockReceiver2.websocket.send).toHaveBeenCalledTimes(1);

      // Verify message format
      const sentMessage = JSON.parse(mockReceiver1.websocket.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('operation');
      expect(sentMessage.payload.operation.id).toBe(mockOperation.id);
      expect(sentMessage.payload.operation.workspaceId).toBe(mockOperation.workspaceId);
      expect(sentMessage.payload.operation.participantId).toBe(mockOperation.participantId);
      expect(sentMessage.messageId).toBeDefined();
      expect(sentMessage.timestamp).toBeDefined();
    });

    it('should buffer operation for offline participants', async () => {
      const offlineParticipant = {
        ...mockReceiver1,
        websocket: null,
      };

      mockParticipantManager.getWorkspaceParticipants.mockReturnValue([
        mockSender,
        offlineParticipant,
        mockReceiver2,
      ]);

      await router.routeOperation('workspace-1', mockOperation, 'sender-1');

      // Online receiver should receive
      expect(mockReceiver2.websocket.send).toHaveBeenCalledTimes(1);

      // Offline participant should have buffered operation
      const buffered = router.getBufferedOperations('workspace-1', 'receiver-1');
      expect(buffered).toHaveLength(1);
      expect(buffered[0]).toEqual(mockOperation);
    });

    it('should buffer operation when send throws error', async () => {
      mockReceiver1.websocket.send.mockImplementation(() => {
        throw new Error('Connection closed');
      });

      mockParticipantManager.getWorkspaceParticipants.mockReturnValue([
        mockSender,
        mockReceiver1,
        mockReceiver2,
      ]);

      await router.routeOperation('workspace-1', mockOperation, 'sender-1');

      // Failed send should buffer operation
      const buffered = router.getBufferedOperations('workspace-1', 'receiver-1');
      expect(buffered).toHaveLength(1);
      expect(buffered[0]).toEqual(mockOperation);

      // Other receiver should still receive
      expect(mockReceiver2.websocket.send).toHaveBeenCalledTimes(1);
    });

    it('should handle workspace with no other participants', async () => {
      mockParticipantManager.getWorkspaceParticipants.mockReturnValue([mockSender]);

      await router.routeOperation('workspace-1', mockOperation, 'sender-1');

      // No operations should be sent
      expect(mockSender.websocket.send).not.toHaveBeenCalled();
    });
  });

  describe('bufferOperation', () => {
    let mockOperation: EncryptedOperation;

    beforeEach(() => {
      mockOperation = {
        id: 'op-1',
        workspaceId: 'workspace-1',
        participantId: 'sender-1',
        timestamp: Date.now(),
        position: 0,
        operationType: 'insert',
        encryptedContent: Buffer.from('encrypted'),
        signature: Buffer.from('signature'),
      };
    });

    it('should buffer operation for participant', () => {
      router.bufferOperation('workspace-1', 'participant-1', mockOperation);

      const buffered = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered).toHaveLength(1);
      expect(buffered[0]).toEqual(mockOperation);
    });

    it('should buffer multiple operations for same participant', () => {
      const op2 = { ...mockOperation, id: 'op-2' };
      const op3 = { ...mockOperation, id: 'op-3' };

      router.bufferOperation('workspace-1', 'participant-1', mockOperation);
      router.bufferOperation('workspace-1', 'participant-1', op2);
      router.bufferOperation('workspace-1', 'participant-1', op3);

      const buffered = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered).toHaveLength(3);
      expect(buffered[0].id).toBe('op-1');
      expect(buffered[1].id).toBe('op-2');
      expect(buffered[2].id).toBe('op-3');
    });

    it('should handle null/undefined inputs gracefully', () => {
      router.bufferOperation(null as any, 'participant-1', mockOperation);
      router.bufferOperation('workspace-1', null as any, mockOperation);
      router.bufferOperation('workspace-1', 'participant-1', null as any);

      const buffered = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered).toHaveLength(0);
    });
  });

  describe('getBufferedOperations', () => {
    let mockOperation: EncryptedOperation;

    beforeEach(() => {
      mockOperation = {
        id: 'op-1',
        workspaceId: 'workspace-1',
        participantId: 'sender-1',
        timestamp: Date.now(),
        position: 0,
        operationType: 'insert',
        encryptedContent: Buffer.from('encrypted'),
        signature: Buffer.from('signature'),
      };
    });

    it('should return empty array if no operations buffered', () => {
      const buffered = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered).toEqual([]);
    });

    it('should return and clear buffered operations', () => {
      router.bufferOperation('workspace-1', 'participant-1', mockOperation);

      const buffered1 = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered1).toHaveLength(1);

      // Second call should return empty array
      const buffered2 = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered2).toEqual([]);
    });

    it('should handle null/undefined inputs gracefully', () => {
      const buffered1 = router.getBufferedOperations(null as any, 'participant-1');
      expect(buffered1).toEqual([]);

      const buffered2 = router.getBufferedOperations('workspace-1', null as any);
      expect(buffered2).toEqual([]);
    });

    it('should not affect buffers for other participants', () => {
      router.bufferOperation('workspace-1', 'participant-1', mockOperation);
      router.bufferOperation('workspace-1', 'participant-2', { ...mockOperation, id: 'op-2' });

      router.getBufferedOperations('workspace-1', 'participant-1');

      const buffered = router.getBufferedOperations('workspace-1', 'participant-2');
      expect(buffered).toHaveLength(1);
      expect(buffered[0].id).toBe('op-2');
    });
  });

  describe('clearExpiredBuffers', () => {
    it('should remove operations older than expiration time', () => {
      const now = Date.now();
      const oldOp: EncryptedOperation = {
        id: 'op-old',
        workspaceId: 'workspace-1',
        participantId: 'sender-1',
        timestamp: now - 120000, // 2 minutes ago
        position: 0,
        operationType: 'insert',
        encryptedContent: Buffer.from('encrypted'),
        signature: Buffer.from('signature'),
      };

      const recentOp: EncryptedOperation = {
        ...oldOp,
        id: 'op-recent',
        timestamp: now - 30000, // 30 seconds ago
      };

      router.bufferOperation('workspace-1', 'participant-1', oldOp);
      router.bufferOperation('workspace-1', 'participant-1', recentOp);

      // Clear operations older than 1 minute
      router.clearExpiredBuffers(now - 60000);

      const buffered = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered).toHaveLength(1);
      expect(buffered[0].id).toBe('op-recent');
    });

    it('should delete buffer if all operations expired', () => {
      const now = Date.now();
      const oldOp: EncryptedOperation = {
        id: 'op-old',
        workspaceId: 'workspace-1',
        participantId: 'sender-1',
        timestamp: now - 120000,
        position: 0,
        operationType: 'insert',
        encryptedContent: Buffer.from('encrypted'),
        signature: Buffer.from('signature'),
      };

      router.bufferOperation('workspace-1', 'participant-1', oldOp);
      router.clearExpiredBuffers(now - 60000);

      const buffered = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered).toEqual([]);
    });

    it('should handle invalid expiration time gracefully', () => {
      const mockOp: EncryptedOperation = {
        id: 'op-1',
        workspaceId: 'workspace-1',
        participantId: 'sender-1',
        timestamp: Date.now(),
        position: 0,
        operationType: 'insert',
        encryptedContent: Buffer.from('encrypted'),
        signature: Buffer.from('signature'),
      };

      router.bufferOperation('workspace-1', 'participant-1', mockOp);

      // Should not throw or clear buffers
      router.clearExpiredBuffers(-1);
      router.clearExpiredBuffers(NaN);
      router.clearExpiredBuffers(null as any);

      const buffered = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered).toHaveLength(1);
    });

    it('should handle multiple participants and workspaces', () => {
      const now = Date.now();
      const oldOp: EncryptedOperation = {
        id: 'op-old',
        workspaceId: 'workspace-1',
        participantId: 'sender-1',
        timestamp: now - 120000,
        position: 0,
        operationType: 'insert',
        encryptedContent: Buffer.from('encrypted'),
        signature: Buffer.from('signature'),
      };

      const recentOp: EncryptedOperation = {
        ...oldOp,
        id: 'op-recent',
        timestamp: now - 30000,
      };

      // Buffer operations for different participants
      router.bufferOperation('workspace-1', 'participant-1', oldOp);
      router.bufferOperation('workspace-1', 'participant-2', recentOp);
      router.bufferOperation('workspace-2', 'participant-1', oldOp);

      router.clearExpiredBuffers(now - 60000);

      // Old operations should be cleared
      const buffered1 = router.getBufferedOperations('workspace-1', 'participant-1');
      expect(buffered1).toEqual([]);

      // Recent operations should remain
      const buffered2 = router.getBufferedOperations('workspace-1', 'participant-2');
      expect(buffered2).toHaveLength(1);

      // Other workspace should be cleared
      const buffered3 = router.getBufferedOperations('workspace-2', 'participant-1');
      expect(buffered3).toEqual([]);
    });
  });
});
