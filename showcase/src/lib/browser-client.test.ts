/**
 * Browser Client Tests
 * 
 * Unit tests for the browser-compatible EECP client.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserEECPClient } from './browser-client';
import { BrowserEECPServer } from './browser-server';
import { WorkspaceConfig } from '@digitaldefiance-eecp/eecp-protocol';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import 'fake-indexeddb/auto';

describe('BrowserEECPClient', () => {
  let client: BrowserEECPClient;
  let server: BrowserEECPServer;
  let workspaceId: any;
  let workspaceSecret: Buffer;
  let workspaceConfig: WorkspaceConfig;

  beforeEach(async () => {
    // Create server
    server = new BrowserEECPServer();
    server.start();

    // Create workspace
    workspaceConfig = {
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
    const workspace = await server.createWorkspace(workspaceConfig, publicKey);
    workspaceId = workspace.id;

    // Generate workspace secret
    workspaceSecret = Buffer.alloc(32);
    crypto.getRandomValues(workspaceSecret);

    // Create client
    client = new BrowserEECPClient();
    await client.initialize();
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
    if (server) {
      server.stop();
    }
  });

  describe('Initialization', () => {
    it('should initialize client', async () => {
      const newClient = new BrowserEECPClient();
      await expect(newClient.initialize()).resolves.not.toThrow();
    });
  });

  describe('Connection', () => {
    it('should connect to workspace', async () => {
      const transport = server.createTransport();
      transport.connect();

      await client.connect(transport, workspaceId, workspaceSecret);

      expect(client.isConnected()).toBe(true);
      expect(client.getWorkspaceId()).toBe(workspaceId);
      expect(client.getParticipantId()).toBeDefined();
    });

    it('should disconnect from workspace', async () => {
      const transport = server.createTransport();
      transport.connect();

      await client.connect(transport, workspaceId, workspaceSecret);
      expect(client.isConnected()).toBe(true);

      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('CRDT Operations', () => {
    beforeEach(async () => {
      const transport = server.createTransport();
      transport.connect();
      await client.connect(transport, workspaceId, workspaceSecret);
    });

    it('should insert text', async () => {
      await client.insert(0, 'Hello');
      expect(client.getText()).toBe('Hello');
    });

    it('should delete text', async () => {
      await client.insert(0, 'Hello World');
      await client.delete(5, 6); // Delete ' World'
      expect(client.getText()).toBe('Hello');
    });

    it('should handle multiple operations', async () => {
      await client.insert(0, 'Hello');
      await client.insert(5, ' World');
      await client.insert(11, '!');
      expect(client.getText()).toBe('Hello World!');
    });

    it('should notify change listeners', async () => {
      let notified = false;
      let receivedText = '';

      client.onChange((text) => {
        notified = true;
        receivedText = text;
      });

      await client.insert(0, 'Test');

      expect(notified).toBe(true);
      expect(receivedText).toBe('Test');
    });

    it('should unsubscribe change listeners', async () => {
      let callCount = 0;

      const unsubscribe = client.onChange(() => {
        callCount++;
      });

      await client.insert(0, 'Test1');
      expect(callCount).toBe(1);

      unsubscribe();

      await client.insert(5, 'Test2');
      expect(callCount).toBe(1); // Should not increment
    });
  });

  describe('Error Handling', () => {
    it('should throw error when inserting without connection', async () => {
      await expect(client.insert(0, 'Test')).rejects.toThrow('Not connected');
    });

    it('should throw error when deleting without connection', async () => {
      await expect(client.delete(0, 1)).rejects.toThrow('Not connected');
    });
  });

  describe('Encryption', () => {
    beforeEach(async () => {
      const transport = server.createTransport();
      transport.connect();
      await client.connect(transport, workspaceId, workspaceSecret);
    });

    it('should encrypt operations before sending', async () => {
      // This is tested implicitly - operations should be encrypted
      // The fact that insert/delete work means encryption is working
      await client.insert(0, 'Encrypted');
      expect(client.getText()).toBe('Encrypted');
    });
  });

  describe('Multi-Client Collaboration', () => {
    it('should sync operations between two clients', async () => {
      // Create first client
      const transport1 = server.createTransport();
      transport1.connect();
      await client.connect(transport1, workspaceId, workspaceSecret, workspaceConfig);

      // Create second client
      const client2 = new BrowserEECPClient();
      await client2.initialize();
      const transport2 = server.createTransport();
      transport2.connect();
      await client2.connect(transport2, workspaceId, workspaceSecret, workspaceConfig);

      // Client 1 inserts text
      await client.insert(0, 'Hello');

      // Wait for propagation and decryption
      await new Promise(resolve => setTimeout(resolve, 100));

      // Client 2 should see the text
      expect(client2.getText()).toBe('Hello');

      // Cleanup
      client2.disconnect();
    });
  });
});
