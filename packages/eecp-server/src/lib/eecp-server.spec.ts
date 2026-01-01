/**
 * Integration tests for EECP Server
 * Tests REST API endpoints for workspace management
 */

import { EECPServer } from './eecp-server';
import { WorkspaceManager } from './workspace-manager';
import { ParticipantManager } from './participant-manager';
import { OperationRouter } from './operation-router';
import { TemporalCleanupService } from './temporal-cleanup-service';
import { ParticipantAuth } from '@digitaldefiance-eecp/eecp-crypto';
import { WorkspaceConfig } from '@digitaldefiance-eecp/eecp-protocol';
import axios from 'axios';

describe('EECPServer Integration Tests', () => {
  let server: EECPServer;
  let workspaceManager: WorkspaceManager;
  let participantManager: ParticipantManager;
  let operationRouter: OperationRouter;
  let cleanupService: TemporalCleanupService;
  let participantAuth: ParticipantAuth;
  const port = 3001; // Use different port for testing
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    // Initialize dependencies
    participantAuth = new ParticipantAuth();
    workspaceManager = new WorkspaceManager();
    participantManager = new ParticipantManager(participantAuth);
    operationRouter = new OperationRouter(participantManager, workspaceManager);
    cleanupService = new TemporalCleanupService(workspaceManager, operationRouter);

    // Create server
    server = new EECPServer(
      workspaceManager,
      participantManager,
      operationRouter,
      cleanupService,
      participantAuth,
      { port, host: 'localhost' }
    );

    // Start server
    await server.start();
  });

  afterAll(async () => {
    // Stop server
    await server.stop();
    
    // Clean up workspace manager timers
    workspaceManager.cleanup();
  });

  describe('POST /workspaces - Create workspace', () => {
    it('should create a workspace with valid config', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: 'test-workspace-1',
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000, // 30 minutes
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const creatorPublicKey = Buffer.from('test-public-key').toString('base64');

      const response = await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      expect(response.status).toBe(201);
      expect(response.data).toMatchObject({
        id: config.id,
        createdAt: config.createdAt,
        expiresAt: config.expiresAt,
        status: 'active',
      });
    });

    it('should reject workspace creation with invalid duration', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: 'test-workspace-invalid',
        createdAt: now,
        expiresAt: now + 20 * 60 * 1000, // 20 minutes (invalid)
        timeWindow: {
          startTime: now,
          endTime: now + 20 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const creatorPublicKey = Buffer.from('test-public-key').toString('base64');

      try {
        await axios.post(`${baseUrl}/workspaces`, {
          config,
          creatorPublicKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(500);
        expect(error.response.data.error).toContain('Invalid expiration duration');
      }
    });

    it('should reject workspace creation with missing fields', async () => {
      try {
        await axios.post(`${baseUrl}/workspaces`, {
          config: {},
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('Missing required fields');
      }
    });
  });

  describe('GET /workspaces/:id - Get workspace info', () => {
    it('should retrieve workspace information', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: 'test-workspace-2',
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const creatorPublicKey = Buffer.from('test-public-key').toString('base64');

      // Create workspace first
      await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      // Retrieve workspace
      const response = await axios.get(`${baseUrl}/workspaces/${config.id}`);

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        id: config.id,
        createdAt: config.createdAt,
        expiresAt: config.expiresAt,
        status: 'active',
        participantCount: 0,
      });
      expect(response.data.encryptedMetadata).toBeDefined();
    });

    it('should return 404 for non-existent workspace', async () => {
      try {
        await axios.get(`${baseUrl}/workspaces/non-existent-workspace`);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toContain('Workspace not found');
      }
    });
  });

  describe('POST /workspaces/:id/extend - Extend workspace', () => {
    it('should extend workspace expiration', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: 'test-workspace-3',
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: true, // Allow extension
      };

      const creatorPublicKey = Buffer.from('test-public-key').toString('base64');

      // Create workspace
      await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      // Extend workspace
      const response = await axios.post(`${baseUrl}/workspaces/${config.id}/extend`, {
        additionalMinutes: 15,
      });

      expect(response.status).toBe(200);
      expect(response.data.expiresAt).toBe(config.expiresAt + 15 * 60 * 1000);
      expect(response.data.status).toBe('active');
    });

    it('should reject extension for non-existent workspace', async () => {
      try {
        await axios.post(`${baseUrl}/workspaces/non-existent/extend`, {
          additionalMinutes: 15,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toContain('not found');
      }
    });

    it('should reject extension with invalid additionalMinutes', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: 'test-workspace-4',
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: true,
      };

      const creatorPublicKey = Buffer.from('test-public-key').toString('base64');

      // Create workspace
      await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      // Try to extend with invalid minutes
      try {
        await axios.post(`${baseUrl}/workspaces/${config.id}/extend`, {
          additionalMinutes: 'invalid',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('invalid additionalMinutes');
      }
    });
  });

  describe('DELETE /workspaces/:id - Revoke workspace', () => {
    it('should revoke workspace', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: 'test-workspace-5',
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        timeWindow: {
          startTime: now,
          endTime: now + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const creatorPublicKey = Buffer.from('test-public-key').toString('base64');

      // Create workspace
      await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      // Revoke workspace
      const response = await axios.delete(`${baseUrl}/workspaces/${config.id}`);

      expect(response.status).toBe(200);
      expect(response.data.message).toContain('revoked successfully');

      // Verify workspace is revoked
      const getResponse = await axios.get(`${baseUrl}/workspaces/${config.id}`);
      expect(getResponse.data.status).toBe('revoked');
    });

    it('should return 404 for non-existent workspace', async () => {
      try {
        await axios.delete(`${baseUrl}/workspaces/non-existent`);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toContain('not found');
      }
    });
  });

  describe('GET /health - Health check', () => {
    it('should return health status', async () => {
      const response = await axios.get(`${baseUrl}/health`);

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: 'ok',
        version: '1.0.0',
      });
      expect(response.data.timestamp).toBeDefined();
      expect(typeof response.data.timestamp).toBe('number');
    });
  });
});
