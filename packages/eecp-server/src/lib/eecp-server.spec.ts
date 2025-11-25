/**
 * Integration tests for EECP Server
 * Tests REST API endpoints for workspace management
 */

import { EECPServer } from './eecp-server';
import { WorkspaceManager } from './workspace-manager';
import { ParticipantManager } from './participant-manager';
import { OperationRouter } from './operation-router';
import { TemporalCleanupService } from './temporal-cleanup-service';
import { RateLimiter } from './rate-limiter';
import { MetricsService } from './metrics-service';
import { ParticipantAuth } from '@digitaldefiance-eecp/eecp-crypto';
import { WorkspaceConfig } from '@digitaldefiance-eecp/eecp-protocol';
import { GuidV4, ECIESService, Member, MemberType, EmailString } from '@digitaldefiance/ecies-lib';
import axios from 'axios';

/**
 * Helper function to generate a valid public key for testing
 */
function generateValidPublicKey(eciesService: ECIESService): Buffer {
  const member = Member.newMember(
    eciesService,
    MemberType.User,
    'Test User',
    new EmailString('test@example.com')
  );
  const publicKey = Buffer.from(member.member.publicKey);
  member.member.dispose();
  return publicKey;
}

describe('EECPServer Integration Tests', () => {
  let server: EECPServer;
  let workspaceManager: WorkspaceManager;
  let participantManager: ParticipantManager;
  let operationRouter: OperationRouter;
  let cleanupService: TemporalCleanupService;
  let participantAuth: ParticipantAuth;
  let rateLimiter: RateLimiter;
  let metricsService: MetricsService;
  let eciesService: ECIESService;
  const port = 3001; // Use different port for testing
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    // Initialize dependencies
    participantAuth = new ParticipantAuth();
    eciesService = new ECIESService();
    workspaceManager = new WorkspaceManager(eciesService);
    participantManager = new ParticipantManager(participantAuth);
    operationRouter = new OperationRouter(participantManager, workspaceManager);
    cleanupService = new TemporalCleanupService(workspaceManager, operationRouter);
    rateLimiter = new RateLimiter();
    metricsService = new MetricsService();

    // Create server
    server = new EECPServer(
      workspaceManager,
      participantManager,
      operationRouter,
      cleanupService,
      participantAuth,
      rateLimiter,
      metricsService,
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
        id: GuidV4.new(),
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

      const creatorPublicKey = generateValidPublicKey(eciesService).toString('base64');

      const response = await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      expect(response.status).toBe(201);
      // Compare GuidV4 as string
      expect(response.data.id).toBeDefined();
      expect(response.data.createdAt).toBe(config.createdAt);
      expect(response.data.expiresAt).toBe(config.expiresAt);
      expect(response.data.status).toBe('active');
    });

    it('should reject workspace creation with invalid duration', async () => {
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: GuidV4.new(),
        createdAt: now,
        expiresAt: now + 3 * 60 * 1000, // 3 minutes (too short)
        timeWindow: {
          startTime: now,
          endTime: now + 3 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const creatorPublicKey = generateValidPublicKey(eciesService).toString('base64');

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
        id: GuidV4.new(),
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

      const creatorPublicKey = generateValidPublicKey(eciesService).toString('base64');

      // Create workspace first
      await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      // Retrieve workspace
      const response = await axios.get(`${baseUrl}/workspaces/${config.id.asFullHexGuid}`);

      expect(response.status).toBe(200);
      // Compare fields individually
      expect(response.data.createdAt).toBe(config.createdAt);
      expect(response.data.expiresAt).toBe(config.expiresAt);
      expect(response.data.status).toBe('active');
      expect(response.data.participantCount).toBe(1); // Creator is counted as a participant
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
        id: GuidV4.new(),
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

      const creatorPublicKey = generateValidPublicKey(eciesService).toString('base64');

      // Create workspace
      await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      // Extend workspace
      const response = await axios.post(`${baseUrl}/workspaces/${config.id.asFullHexGuid}/extend`, {
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
        id: GuidV4.new(),
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

      const creatorPublicKey = generateValidPublicKey(eciesService).toString('base64');

      // Create workspace
      await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      // Try to extend with invalid minutes
      try {
        await axios.post(`${baseUrl}/workspaces/${config.id.asFullHexGuid}/extend`, {
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
        id: GuidV4.new(),
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

      const creatorPublicKey = generateValidPublicKey(eciesService).toString('base64');

      // Create workspace
      await axios.post(`${baseUrl}/workspaces`, {
        config,
        creatorPublicKey,
      });

      // Revoke workspace
      const response = await axios.delete(`${baseUrl}/workspaces/${config.id.asFullHexGuid}`);

      expect(response.status).toBe(200);
      expect(response.data.message).toContain('revoked successfully');

      // Verify workspace is revoked
      const getResponse = await axios.get(`${baseUrl}/workspaces/${config.id.asFullHexGuid}`);
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

    it('should include workspace and participant counts', async () => {
      const response = await axios.get(`${baseUrl}/health`);

      expect(response.status).toBe(200);
      expect(response.data.workspaces).toBeDefined();
      expect(response.data.participants).toBeDefined();
      expect(typeof response.data.workspaces).toBe('number');
      expect(typeof response.data.participants).toBe('number');
    });
  });

  describe('GET /metrics - Prometheus metrics', () => {
    it('should return metrics in Prometheus format', async () => {
      const response = await axios.get(`${baseUrl}/metrics`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(typeof response.data).toBe('string');
    });

    it('should include workspace count metric', async () => {
      const response = await axios.get(`${baseUrl}/metrics`);

      expect(response.status).toBe(200);
      expect(response.data).toContain('eecp_workspace_count');
      expect(response.data).toContain('# HELP eecp_workspace_count');
      expect(response.data).toContain('# TYPE eecp_workspace_count gauge');
    });

    it('should include participant count metric', async () => {
      const response = await axios.get(`${baseUrl}/metrics`);

      expect(response.status).toBe(200);
      expect(response.data).toContain('eecp_participant_count');
      expect(response.data).toContain('# HELP eecp_participant_count');
      expect(response.data).toContain('# TYPE eecp_participant_count gauge');
    });

    it('should include operation metrics', async () => {
      const response = await axios.get(`${baseUrl}/metrics`);

      expect(response.status).toBe(200);
      expect(response.data).toContain('eecp_operations_total');
      expect(response.data).toContain('# HELP eecp_operations_total');
      expect(response.data).toContain('# TYPE eecp_operations_total counter');
    });

    it('should include operation latency histogram', async () => {
      const response = await axios.get(`${baseUrl}/metrics`);

      expect(response.status).toBe(200);
      expect(response.data).toContain('eecp_operation_latency_ms');
      expect(response.data).toContain('# HELP eecp_operation_latency_ms');
      expect(response.data).toContain('# TYPE eecp_operation_latency_ms histogram');
      expect(response.data).toContain('eecp_operation_latency_ms_bucket');
    });

    it('should include default Node.js metrics', async () => {
      const response = await axios.get(`${baseUrl}/metrics`);

      expect(response.status).toBe(200);
      expect(response.data).toContain('process_cpu');
      expect(response.data).toContain('nodejs_');
    });
  });
});
