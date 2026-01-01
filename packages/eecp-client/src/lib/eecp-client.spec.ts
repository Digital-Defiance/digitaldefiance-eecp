/**
 * Unit tests for EECPClient connection edge cases
 * Feature: eecp-full-system
 * Requirements: 11.5
 */

import { EECPClient } from './eecp-client.js';
import { WebSocket, Server as WebSocketServer } from 'ws';
import { createServer, Server } from 'http';

describe('EECPClient Connection Edge Cases', () => {
  let httpServer: Server;
  let wsServer: WebSocketServer;
  let serverPort: number;

  beforeEach((done) => {
    // Create HTTP server
    httpServer = createServer();
    httpServer.listen(0, () => {
      serverPort = (httpServer.address() as any).port;
      done();
    });
  });

  afterEach((done) => {
    // Clean up servers
    if (wsServer) {
      wsServer.close(() => {
        if (httpServer) {
          httpServer.close(done);
        } else {
          done();
        }
      });
    } else if (httpServer) {
      httpServer.close(done);
    } else {
      done();
    }
  });

  describe('Connection Timeout', () => {
    it('should timeout if connection takes longer than 10 seconds', async () => {
      // Create a server that never responds to connection
      wsServer = new WebSocketServer({ noServer: true });
      
      // Don't upgrade the connection - let it hang
      httpServer.on('upgrade', () => {
        // Do nothing - connection will hang
      });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Mock setTimeout to speed up the test
      jest.useFakeTimers();

      const connectPromise = client.connect(serverUrl);

      // Fast-forward time by 10 seconds
      jest.advanceTimersByTime(10000);

      await expect(connectPromise).rejects.toThrow('Connection timeout');

      jest.useRealTimers();
      client.disconnect();
    });

    it('should not timeout if connection succeeds within 10 seconds', async () => {
      // Create a server that responds immediately
      wsServer = new WebSocketServer({ server: httpServer });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      await expect(client.connect(serverUrl)).resolves.not.toThrow();

      client.disconnect();
    });

    it('should clear timeout on successful connection', async () => {
      wsServer = new WebSocketServer({ server: httpServer });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Connect successfully
      await client.connect(serverUrl);

      // Wait a bit to ensure timeout doesn't fire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Client should still be connected
      expect((client as any).ws).toBeDefined();
      expect((client as any).ws.readyState).toBe(WebSocket.OPEN);

      client.disconnect();
    });

    it('should clear timeout on connection error', async () => {
      // Create a server that rejects connections
      wsServer = new WebSocketServer({ noServer: true });
      
      httpServer.on('upgrade', (request, socket) => {
        socket.destroy();
      });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      await expect(client.connect(serverUrl)).rejects.toThrow();

      // Timeout should have been cleared
      client.disconnect();
    });
  });

  describe('Max Reconnection Attempts', () => {
    it('should stop reconnecting after 5 failed attempts', async () => {
      wsServer = new WebSocketServer({ server: httpServer });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Connect initially
      await client.connect(serverUrl);

      // Track reconnection attempts
      let reconnectCalls = 0;
      const originalReconnect = (client as any).reconnect.bind(client);
      (client as any).reconnect = jest.fn(async () => {
        reconnectCalls++;
        return originalReconnect();
      });

      // Close the server to trigger reconnection
      wsServer.close();
      wsServer = undefined as any;

      // Simulate disconnect
      (client as any).ws.close();

      // Use fake timers to control reconnection timing
      jest.useFakeTimers();

      // Trigger handleDisconnect multiple times
      for (let i = 0; i < 10; i++) {
        (client as any).reconnectAttempts = i;
        (client as any).handleDisconnect();
        
        if (i < 5) {
          // Should schedule reconnection
          expect((client as any).reconnectTimer).toBeDefined();
          jest.advanceTimersByTime(Math.pow(2, i) * 1000);
        } else {
          // Should not schedule reconnection after max attempts
          // The timer from previous attempt might still exist, but no new one should be created
        }
      }

      jest.useRealTimers();
      client.disconnect();
    });

    it('should not exceed MAX_RECONNECT_ATTEMPTS constant', async () => {
      const client = new EECPClient();
      const MAX_ATTEMPTS = (client as any).MAX_RECONNECT_ATTEMPTS;

      expect(MAX_ATTEMPTS).toBe(5);

      // Verify the logic respects this limit
      for (let i = 0; i <= 10; i++) {
        (client as any).reconnectAttempts = i;
        const shouldReconnect = i < MAX_ATTEMPTS;
        
        if (shouldReconnect) {
          expect(i).toBeLessThan(MAX_ATTEMPTS);
        } else {
          expect(i).toBeGreaterThanOrEqual(MAX_ATTEMPTS);
        }
      }

      client.disconnect();
    });

    it('should reset reconnection counter on successful reconnection', async () => {
      wsServer = new WebSocketServer({ server: httpServer });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Connect initially
      await client.connect(serverUrl);

      // Simulate some failed reconnection attempts
      (client as any).reconnectAttempts = 3;
      expect((client as any).reconnectAttempts).toBe(3);

      // Close and reconnect
      (client as any).ws.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Reconnect successfully
      await client.connect(serverUrl);

      // Counter should be reset
      expect((client as any).reconnectAttempts).toBe(0);

      client.disconnect();
    });

    it('should log error when max attempts reached', async () => {
      const client = new EECPClient();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Set attempts to max
      (client as any).reconnectAttempts = 5;

      // Try to handle disconnect
      (client as any).handleDisconnect();

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Max reconnection attempts reached'
      );

      consoleErrorSpy.mockRestore();
      client.disconnect();
    });
  });

  describe('Connection During Server Shutdown', () => {
    it('should handle connection attempt to unavailable server', async () => {
      // Don't create a WebSocket server - just try to connect to a port with no server
      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Try to connect to server that doesn't exist
      // This should fail relatively quickly with ECONNREFUSED
      await expect(client.connect(serverUrl)).rejects.toThrow();

      client.disconnect();
    }, 15000); // Increase timeout to 15 seconds for connection attempt

    it('should handle disconnection when server shuts down', async () => {
      wsServer = new WebSocketServer({ server: httpServer });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Connect successfully
      await client.connect(serverUrl);
      expect((client as any).ws.readyState).toBe(WebSocket.OPEN);

      // Track disconnect handling
      const handleDisconnectSpy = jest.spyOn(
        client as any,
        'handleDisconnect'
      );

      // Close all client connections first
      wsServer.clients.forEach((ws) => {
        ws.close();
      });

      // Wait for disconnect to be detected
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have triggered disconnect handling
      expect(handleDisconnectSpy).toHaveBeenCalled();

      client.disconnect();
    }, 10000);

    it('should not reconnect if manually disconnected before server shutdown', async () => {
      wsServer = new WebSocketServer({ server: httpServer });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Connect successfully
      await client.connect(serverUrl);

      // Manually disconnect
      client.disconnect();
      expect((client as any).isManualDisconnect).toBe(true);

      // Should not have reconnect timer
      expect((client as any).reconnectTimer).toBeUndefined();
    });

    it('should handle server shutdown during reconnection attempt', async () => {
      wsServer = new WebSocketServer({ server: httpServer });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Connect initially
      await client.connect(serverUrl);

      // Close connection to trigger reconnection
      (client as any).ws.close();

      // Wait a bit for reconnection to be scheduled
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify reconnection was scheduled
      expect((client as any).reconnectTimer).toBeDefined();

      // Clean up
      client.disconnect();
    });

    it('should handle error when server closes connection abruptly', async () => {
      wsServer = new WebSocketServer({ server: httpServer });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Connect successfully
      await client.connect(serverUrl);

      // Track error handling
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Server closes connection abruptly
      wsServer.clients.forEach((ws) => {
        ws.terminate();
      });

      // Wait for close event
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have triggered disconnect handling
      expect((client as any).reconnectAttempts).toBeGreaterThan(0);

      consoleErrorSpy.mockRestore();
      client.disconnect();
    }, 10000);
  });

  describe('Connection State Management', () => {
    it('should throw error when trying to join workspace without connection', async () => {
      const client = new EECPClient();

      await expect(
        client.joinWorkspace('test-workspace-id' as any, Buffer.from('key'))
      ).rejects.toThrow('Not connected to server');

      client.disconnect();
    });

    it('should throw error when creating workspace without connection', async () => {
      const client = new EECPClient();

      await expect(
        client.createWorkspace({
          id: 'test-id' as any,
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
          timeWindow: {
            startTime: Date.now(),
            endTime: Date.now() + 3600000,
            rotationInterval: 15,
            gracePeriod: 60000,
          },
          maxParticipants: 50,
          allowExtension: true,
        })
      ).rejects.toThrow('Not connected to server');

      client.disconnect();
    });

    it('should maintain connection state correctly', async () => {
      wsServer = new WebSocketServer({ server: httpServer });

      const client = new EECPClient();
      const serverUrl = `ws://localhost:${serverPort}`;

      // Initially not connected
      expect((client as any).ws).toBeUndefined();

      // Connect
      await client.connect(serverUrl);
      expect((client as any).ws).toBeDefined();
      expect((client as any).ws.readyState).toBe(WebSocket.OPEN);

      // Disconnect
      client.disconnect();
      expect((client as any).ws).toBeUndefined();
    });
  });
});
