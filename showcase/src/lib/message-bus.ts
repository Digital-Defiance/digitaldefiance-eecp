/**
 * In-Memory Message Bus
 * 
 * EventEmitter-based communication between client and server.
 * Replaces WebSocket with direct method calls while maintaining message envelope format.
 */

import { EventEmitter } from 'events';
import { MessageEnvelope } from '@digitaldefiance/eecp-protocol';
import { BrowserTransport } from './browser-server.js';

/**
 * Message bus for client-server communication
 */
export class MessageBus extends EventEmitter {
  private clientTransport: BrowserTransport | null = null;
  private messageHistory: MessageEnvelope[] = [];
  private readonly MAX_HISTORY = 1000;

  constructor() {
    super();
  }

  /**
   * Connect client transport to the bus
   */
  connectClient(transport: BrowserTransport): void {
    this.clientTransport = transport;

    // Forward messages from client to server
    transport.on('message', (data: string) => {
      try {
        const envelope: MessageEnvelope = JSON.parse(data);
        this.recordMessage('client->server', envelope);
        this.emit('client-message', envelope);
      } catch (error) {
        console.error('Error parsing client message:', error);
      }
    });

    // Forward messages from server to client
    transport.on('receive', (envelope: MessageEnvelope) => {
      this.recordMessage('server->client', envelope);
      this.emit('server-message', envelope);
    });

    // Handle connection events
    transport.on('open', () => {
      this.emit('client-connected');
    });

    transport.on('close', () => {
      this.emit('client-disconnected');
    });

    transport.on('error', (error: Error) => {
      this.emit('client-error', error);
    });
  }

  /**
   * Disconnect client transport
   */
  disconnectClient(): void {
    if (this.clientTransport) {
      this.clientTransport.removeAllListeners();
      this.clientTransport = null;
    }
  }

  /**
   * Record message in history
   */
  private recordMessage(direction: 'client->server' | 'server->client', envelope: MessageEnvelope): void {
    this.messageHistory.push({
      ...envelope,
      // Add direction metadata
      payload: {
        ...envelope.payload as any,
        _direction: direction,
      },
    });

    // Trim history if too large
    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory.shift();
    }

    // Emit for visualization
    this.emit('message-recorded', {
      direction,
      envelope,
      timestamp: Date.now(),
    });
  }

  /**
   * Get message history
   */
  getMessageHistory(): MessageEnvelope[] {
    return [...this.messageHistory];
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = [];
    this.emit('history-cleared');
  }

  /**
   * Get message statistics
   */
  getStatistics(): {
    totalMessages: number;
    messagesByType: Record<string, number>;
    clientToServer: number;
    serverToClient: number;
  } {
    const stats = {
      totalMessages: this.messageHistory.length,
      messagesByType: {} as Record<string, number>,
      clientToServer: 0,
      serverToClient: 0,
    };

    for (const msg of this.messageHistory) {
      // Count by type
      stats.messagesByType[msg.type] = (stats.messagesByType[msg.type] || 0) + 1;

      // Count by direction
      const direction = (msg.payload as any)?._direction;
      if (direction === 'client->server') {
        stats.clientToServer++;
      } else if (direction === 'server->client') {
        stats.serverToClient++;
      }
    }

    return stats;
  }

  /**
   * Filter messages by type
   */
  getMessagesByType(type: string): MessageEnvelope[] {
    return this.messageHistory.filter((msg) => msg.type === type);
  }

  /**
   * Filter messages by direction
   */
  getMessagesByDirection(direction: 'client->server' | 'server->client'): MessageEnvelope[] {
    return this.messageHistory.filter((msg) => {
      const msgDirection = (msg.payload as any)?._direction;
      return msgDirection === direction;
    });
  }

  /**
   * Get recent messages (last N)
   */
  getRecentMessages(count: number): MessageEnvelope[] {
    return this.messageHistory.slice(-count);
  }
}

/**
 * Create a connected message bus with client and server
 */
export function createMessageBus(transport: BrowserTransport): MessageBus {
  const bus = new MessageBus();
  bus.connectClient(transport);
  return bus;
}
