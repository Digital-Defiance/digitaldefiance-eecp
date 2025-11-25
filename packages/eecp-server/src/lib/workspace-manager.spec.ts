/**
 * Unit tests for WorkspaceManager
 */

import { WorkspaceManager } from './workspace-manager.js';
import { WorkspaceConfig } from '@digitaldefiance-eecp/eecp-protocol';
import { randomUUID } from 'crypto';
import { ECIESService, Member, MemberType, EmailString } from '@digitaldefiance/ecies-lib';

/**
 * Helper function to create a test member with proper keys
 */
async function createTestMember(eciesService: ECIESService): Promise<Member> {
  const result = await Member.newMember(
    eciesService,
    MemberType.User,
    'Test Creator',
    new EmailString('creator@example.com')
  );
  return result.member as Member;
}

describe('WorkspaceManager Unit Tests', () => {
  let manager: WorkspaceManager;
  let eciesService: ECIESService;
  let testMember: Member;

  beforeEach(async () => {
    eciesService = new ECIESService();
    manager = new WorkspaceManager(eciesService);
    testMember = await createTestMember(eciesService);
  });

  afterEach(() => {
    if (testMember) {
      testMember.dispose();
    }
    manager.cleanup();
  });

  describe('createWorkspace', () => {
    it('should create a workspace with valid configuration', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000, // 30 minutes
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );

      expect(workspace.id).toBe(config.id);
      expect(workspace.status).toBe('active');
      expect(workspace.createdAt).toBe(config.createdAt);
      expect(workspace.expiresAt).toBe(config.expiresAt);
      expect(workspace.participantCount).toBe(1); // Creator is added as participant
    });

    it('should reject invalid expiration duration (less than 5 minutes)', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 3 * 60 * 1000, // 3 minutes - too short
        timeWindow: {
          startTime: now,
          endTime: now + 3 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      await expect(
        manager.createWorkspace(config, testMember.publicKey)
      ).rejects.toThrow('Invalid expiration duration');
    });

    it('should reject invalid expiration duration (more than 120 minutes)', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 150 * 60 * 1000, // 150 minutes - too long
        timeWindow: {
          startTime: now,
          endTime: now + 150 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      await expect(
        manager.createWorkspace(config, testMember.publicKey)
      ).rejects.toThrow('Invalid expiration duration');
    });

    it('should accept 5 minute duration', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 5 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 5 * 60 * 1000,
          rotationInterval: 5,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );
      expect(workspace.status).toBe('active');
    });

    it('should accept 20 minute duration', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 20 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 20 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );
      expect(workspace.status).toBe('active');
    });

    it('should accept 120 minute duration', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 120 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 120 * 60 * 1000,
          rotationInterval: 60,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );
      expect(workspace.status).toBe('active');
    });
  });

  describe('getWorkspace', () => {
    it('should retrieve an existing workspace', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const created = await manager.createWorkspace(
        config,
        testMember.publicKey
      );
      const retrieved = await manager.getWorkspace(config.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return null for non-existent workspace', async () => {
      const result = await manager.getWorkspace('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('extendWorkspace', () => {
    it('should extend workspace expiration when extension is allowed', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: true, // Extension allowed
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );
      const originalExpiration = workspace.expiresAt;

      await manager.extendWorkspace(workspace.id, 15); // Extend by 15 minutes

      const extended = await manager.getWorkspace(workspace.id);
      expect(extended?.expiresAt).toBe(originalExpiration + 15 * 60 * 1000);
    });

    it('should reject extension when not allowed', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false, // Extension not allowed
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );

      await expect(
        manager.extendWorkspace(workspace.id, 15)
      ).rejects.toThrow('Workspace extension not allowed');
    });

    it('should reject extension of non-existent workspace', async () => {
      await expect(
        manager.extendWorkspace('non-existent-id', 15)
      ).rejects.toThrow('Workspace not found');
    });

    it('should reject extension of expired workspace', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now - 60 * 60 * 1000, // Created 1 hour ago
        expiresAt: now - 1000, // Expired 1 second ago
        timeWindow: {
          startTime: now - 60 * 60 * 1000,
          endTime: now - 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: true,
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );

      await expect(
        manager.extendWorkspace(workspace.id, 15)
      ).rejects.toThrow('Cannot extend expired workspace');
    });
  });

  describe('revokeWorkspace', () => {
    it('should revoke an active workspace', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );

      await manager.revokeWorkspace(workspace.id);

      const revoked = await manager.getWorkspace(workspace.id);
      expect(revoked?.status).toBe('revoked');
      expect(revoked?.expiresAt).toBeLessThanOrEqual(Date.now());
    });

    it('should reject revocation of non-existent workspace', async () => {
      await expect(
        manager.revokeWorkspace('non-existent-id')
      ).rejects.toThrow('Workspace not found');
    });
  });

  describe('isWorkspaceExpired', () => {
    it('should return false for active workspace with future expiration', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );

      expect(manager.isWorkspaceExpired(workspace)).toBe(false);
    });

    it('should return true for workspace with past expiration', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now - 60 * 60 * 1000,
        expiresAt: now - 1000, // Expired
        timeWindow: {
          startTime: now - 60 * 60 * 1000,
          endTime: now - 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );

      expect(manager.isWorkspaceExpired(workspace)).toBe(true);
    });

    it('should return true for revoked workspace', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const workspace = await manager.createWorkspace(
        config,
        testMember.publicKey
      );

      await manager.revokeWorkspace(workspace.id);

      expect(manager.isWorkspaceExpired(workspace)).toBe(true);
    });
  });
});
