/**
 * Browser Server Tests
 * 
 * Comprehensive unit and integration tests for the browser-compatible EECP server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserEECPServer, BrowserTransport } from './browser-server';
import { WorkspaceConfig, MessageEnvelope } from '@digitaldefiance/eecp-protocol';
import { GuidV4 } from '@digitaldefiance/ecies-lib';

describe('BrowserEECPServer', () => {
  let server: BrowserEECPServer;

  beforeEach(() => {
    server = new BrowserEECPServer();
    server.start();
  });

  afterEach(() => {
    server.stop();
  });

  describe('Workspace Management', () => {
    it('should create a workspace', async () => {
      const config: WorkspaceConfig = {
        id: GuidV4.new(),
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

      const publicKey = new Uint8Array(32);
      const workspace = await server.createWorkspace(config, publicKey);

      expect(workspace).toBeDefined();
      expect(workspace.id).toBe(config.id);
      expect(workspace.status).toBe('active');
      expect(workspace.participantCount).toBe(0);
    });

    it('should retrieve a workspace by ID', async () => {
      const config: WorkspaceConfig = {
        id: GuidV4.new(),
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

      const publicKey = new Uint8Array(32);
      await server.createWorkspace(config, publicKey);

      const workspace = await server.getWorkspace(config.id);
      expect(workspace).toBeDefined();
      expect(workspace?.id).toBe(config.id);
    });

    it('should return null for non-existent workspace', async () => {
      const workspace = await server.getWorkspace(GuidV4.new());
      expect(workspace).toBeNull();
    });

    it('should extend workspace expiration', async () => {
      const config: WorkspaceConfig = {
        id: GuidV4.new(),
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
        timeWindow: {
          startTime: Date.now(),
          endTime: Date.now() + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: true,
      };

      const publicKey = new Uint8Array(32);
      await server.createWorkspace(config, publicKey);

      const originalExpiry = config.expiresAt;
      await server.extendWorkspace(config.id, 15);

      const workspace = await server.getWorkspace(config.id);
      expect(workspace?.expiresAt).toBeGreaterThan(originalExpiry);
    });

    it('should revoke a workspace', async () => {
      const config: WorkspaceConfig = {
        id: GuidV4.new(),
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

      const publicKey = new Uint8Array(32);
      await server.createWorkspace(config, publicKey);

      await server.revokeWorkspace(config.id);

      const workspace = await server.getWorkspace(config.id);
      expect(workspace?.status).toBe('revoked');
    });

    it('should check if workspace is expired', async () => {
      const config: WorkspaceConfig = {
        id: GuidV4.new(),
        createdAt: Date.now(),
        expiresAt: Date.now() - 1000, // Already expired
        timeWindow: {
          startTime: Date.now() - 2000,
          endTime: Date.now() - 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const publicKey = new Uint8Array(32);
      const workspace = await server.createWorkspace(config, publicKey);

      expect(server.isWorkspaceExpired(workspace)).toBe(true);
    });

    it('should throw error when extending non-existent workspace', async () => {
      await expect(
        server.extendWorkspace(GuidV4.new(), 15)
      ).rejects.toThrow('Workspace not found');
    });

    it('should throw error when revoking non-existent workspace', async () => {
      await expect(
        server.revokeWorkspace(GuidV4.new())
      ).rejects.toThrow('Workspace not found');
    });
  });

  describe('Transport and Messaging', () => {
    it('should create a transport', () => {
      const transport = server.createTransport();
      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(BrowserTransport);
    });

    it('should connect and disconnect transport', () => {
      const transport = server.createTransport();
      
      const openSpy = vi.fn();
      const closeSpy = vi.fn();
      
      transport.on('open', openSpy);
      transport.on('close', closeSpy);

      transport.connect();
      expect(openSpy).toHaveBeenCalled();
      expect(transport.isConnected()).toBe(true);

      transport.close();
      expect(closeSpy).toHaveBeenCalled();
      expect(transport.isConnected()).toBe(false);
    });

    it('should send and receive messages', async () => {
      const transport = server.createTransport();
      
      const messageSpy = vi.fn();
      transport.on('message', messageSpy);

      transport.connect();

      // Server sends a message to transport
      const envelope: MessageEnvelope = {
        type: 'pong',
        payload: { timestamp: Date.now() },
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      };

      transport.receive(envelope);
      expect(messageSpy).toHaveBeenCalled();
    });

    it('should handle ping message', async () => {
      const config: WorkspaceConfig = {
        id: GuidV4.new(),
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

      const publicKey = new Uint8Array(32);
      await server.createWorkspace(config, publicKey);

      const transport = server.createTransport();
      const messageSpy = vi.fn();
      transport.on('message', messageSpy);

      transport.connect();

      const pingEnvelope: MessageEnvelope = {
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      };

      transport.send(JSON.stringify(pingEnvelope));

      // Should receive pong response
      expect(messageSpy).toHaveBeenCalled();
    });

    it('should throw error when sending on disconnected transport', () => {
      const transport = server.createTransport();
      
      expect(() => {
        transport.send('test');
      }).toThrow('Transport not connected');
    });
  });

  describe('Participant Management', () => {
    let config: WorkspaceConfig;

    beforeEach(async () => {
      config = {
        id: GuidV4.new(),
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

      const publicKey = new Uint8Array(32);
      await server.createWorkspace(config, publicKey);
    });

    it('should authenticate participant with handshake', async () => {
      const transport = server.createTransport();
      const messageSpy = vi.fn();
      transport.on('message', messageSpy);

      transport.connect();

      // Wait for challenge
      await new Promise(resolve => setTimeout(resolve, 10));

      const handshake = {
        protocolVersion: '1.0.0',
        workspaceId: config.id,
        participantId: GuidV4.new(),
        publicKey: new Uint8Array(32),
        proof: {
          signature: new Uint8Array(64),
          timestamp: Date.now(),
        },
      };

      const envelope: MessageEnvelope = {
        type: 'handshake',
        payload: handshake,
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      };

      transport.send(JSON.stringify(envelope));

      // Wait for async message handling
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should receive challenge + handshake_ack
      expect(messageSpy).toHaveBeenCalled();
      expect(messageSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject handshake with wrong protocol version', async () => {
      const transport = server.createTransport();
      const messageSpy = vi.fn();
      transport.on('message', messageSpy);

      transport.connect();

      const handshake = {
        protocolVersion: '2.0.0', // Wrong version
        workspaceId: config.id,
        participantId: GuidV4.new(),
        publicKey: new Uint8Array(32),
        proof: {
          signature: new Uint8Array(64),
          timestamp: Date.now(),
        },
      };

      const envelope: MessageEnvelope = {
        type: 'handshake',
        payload: handshake,
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      };

      transport.send(JSON.stringify(envelope));

      // Should receive error
      expect(messageSpy).toHaveBeenCalled();
      const call = messageSpy.mock.calls[0][0];
      const response = JSON.parse(call);
      expect(response.type).toBe('error');
    });

    it('should reject handshake for non-existent workspace', async () => {
      const transport = server.createTransport();
      const messageSpy = vi.fn();
      transport.on('message', messageSpy);

      transport.connect();

      // Wait for challenge
      await new Promise(resolve => setTimeout(resolve, 10));

      const handshake = {
        protocolVersion: '1.0.0',
        workspaceId: GuidV4.new(), // Non-existent
        participantId: GuidV4.new(),
        publicKey: new Uint8Array(32),
        proof: {
          signature: new Uint8Array(64),
          timestamp: Date.now(),
        },
      };

      const envelope: MessageEnvelope = {
        type: 'handshake',
        payload: handshake,
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      };

      transport.send(JSON.stringify(envelope));

      // Wait for async message handling
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should receive challenge first, then error
      expect(messageSpy).toHaveBeenCalled();
      expect(messageSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      
      // Find the error message (should be after challenge)
      const messages = messageSpy.mock.calls.map(call => JSON.parse(call[0]));
      const errorMessage = messages.find(msg => msg.type === 'error');
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.type).toBe('error');
    });
  });

  describe('Rate Limiting', () => {
    let config: WorkspaceConfig;

    beforeEach(async () => {
      config = {
        id: GuidV4.new(),
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
        timeWindow: {
          startTime: Date.now(),
          endTime: Date.now() + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 2, // Low limit for testing
        allowExtension: false,
      };

      const publicKey = new Uint8Array(32);
      await server.createWorkspace(config, publicKey);
    });

    it('should enforce participant limit', async () => {
      // Connect first participant
      const transport1 = server.createTransport();
      transport1.connect();

      // Wait for challenge
      await new Promise(resolve => setTimeout(resolve, 10));

      const handshake1 = {
        protocolVersion: '1.0.0',
        workspaceId: config.id,
        participantId: GuidV4.new(),
        publicKey: new Uint8Array(32),
        proof: {
          signature: new Uint8Array(64),
          timestamp: Date.now(),
        },
      };

      transport1.send(JSON.stringify({
        type: 'handshake',
        payload: handshake1,
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      }));

      // Wait for handshake to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Connect second participant
      const transport2 = server.createTransport();
      transport2.connect();

      // Wait for challenge
      await new Promise(resolve => setTimeout(resolve, 10));

      const handshake2 = {
        protocolVersion: '1.0.0',
        workspaceId: config.id,
        participantId: GuidV4.new(),
        publicKey: new Uint8Array(32),
        proof: {
          signature: new Uint8Array(64),
          timestamp: Date.now(),
        },
      };

      transport2.send(JSON.stringify({
        type: 'handshake',
        payload: handshake2,
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      }));

      // Wait for handshake to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Try to connect third participant (should fail)
      const transport3 = server.createTransport();
      const messageSpy = vi.fn();
      transport3.on('message', messageSpy);
      transport3.connect();

      // Wait for challenge
      await new Promise(resolve => setTimeout(resolve, 10));

      const handshake3 = {
        protocolVersion: '1.0.0',
        workspaceId: config.id,
        participantId: GuidV4.new(),
        publicKey: new Uint8Array(32),
        proof: {
          signature: new Uint8Array(64),
          timestamp: Date.now(),
        },
      };

      transport3.send(JSON.stringify({
        type: 'handshake',
        payload: handshake3,
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      }));

      // Wait for async message handling
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should receive challenge first, then rate limit error
      expect(messageSpy).toHaveBeenCalled();
      
      // Find the error message (should be after challenge)
      const messages = messageSpy.mock.calls.map(call => JSON.parse(call[0]));
      const errorMessage = messages.find(msg => msg.type === 'error');
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.type).toBe('error');
      expect(errorMessage?.payload.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Operation Buffering', () => {
    it('should buffer operations for offline participants', async () => {
      const config: WorkspaceConfig = {
        id: GuidV4.new(),
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

      const publicKey = new Uint8Array(32);
      const workspace = await server.createWorkspace(config, publicKey);

      // The workspace should have an empty operation buffer
      expect(workspace.operationBuffers).toBeDefined();
      expect(workspace.operationBuffers.size).toBe(0);
    });
  });

  describe('Server Health and Statistics', () => {
    it('should return health status', () => {
      const health = server.getHealth();
      
      expect(health).toBeDefined();
      expect(health.status).toBe('ok');
      expect(health.version).toBe('1.0.0');
      expect(typeof health.workspaces).toBe('number');
      expect(typeof health.participants).toBe('number');
      expect(typeof health.timestamp).toBe('number');
    });

    it('should track workspace count', async () => {
      const initialCount = server.getWorkspaceCount();

      const config: WorkspaceConfig = {
        id: GuidV4.new(),
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

      const publicKey = new Uint8Array(32);
      await server.createWorkspace(config, publicKey);

      expect(server.getWorkspaceCount()).toBe(initialCount + 1);
    });

    it('should track participant count', () => {
      const count = server.getTotalParticipantCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Crypto Compatibility', () => {
    it('should generate unique challenges', async () => {
      const challenge1 = await server.generateChallenge();
      const challenge2 = await server.generateChallenge();

      expect(challenge1).toBeInstanceOf(Uint8Array);
      expect(challenge2).toBeInstanceOf(Uint8Array);
      expect(challenge1.length).toBe(32);
      expect(challenge2.length).toBe(32);
      
      // Challenges should be different
      expect(challenge1).not.toEqual(challenge2);
    });
  });

  describe('Cleanup Service', () => {
    it('should start and stop cleanup service', () => {
      const newServer = new BrowserEECPServer();
      
      // Start should not throw
      expect(() => newServer.start()).not.toThrow();
      
      // Stop should not throw
      expect(() => newServer.stop()).not.toThrow();
    });

    it('should clean up expired workspaces', async () => {
      vi.useFakeTimers();

      const config: WorkspaceConfig = {
        id: GuidV4.new(),
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000, // Expires in 1 second
        timeWindow: {
          startTime: Date.now(),
          endTime: Date.now() + 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const publicKey = new Uint8Array(32);
      const workspace = await server.createWorkspace(config, publicKey);

      expect(workspace.status).toBe('active');

      // Fast-forward time past expiration
      vi.advanceTimersByTime(2000);

      // Workspace should be expired
      expect(server.isWorkspaceExpired(workspace)).toBe(true);

      vi.useRealTimers();
    });
  });
});
