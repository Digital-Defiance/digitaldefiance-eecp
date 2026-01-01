/**
 * EECP Client - Browser and Node.js client for connecting to EECP workspaces
 */

import { WebSocket } from 'ws';
import {
  WorkspaceId,
  WorkspaceConfig,
  MessageEnvelope,
  HandshakeMessage,
  HandshakeAckMessage,
  ZeroKnowledgeProof,
  ChallengeMessage,
  WorkspaceMetadata,
} from '@digitaldefiance-eecp/eecp-protocol';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import { WorkspaceClient, IWorkspaceClient } from './workspace-client.js';
import { ClientKeyManager, IClientKeyManager } from './client-key-manager.js';

export interface IEECPClient {
  /**
   * Connect to server
   */
  connect(serverUrl: string): Promise<void>;

  /**
   * Disconnect from server
   */
  disconnect(): void;

  /**
   * Create workspace
   */
  createWorkspace(config: WorkspaceConfig): Promise<IWorkspaceClient>;

  /**
   * Join workspace
   */
  joinWorkspace(
    workspaceId: WorkspaceId,
    temporalKey: Buffer
  ): Promise<IWorkspaceClient>;
}

export class EECPClient implements IEECPClient {
  private ws?: WebSocket;
  private serverUrl?: string;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly BASE_RECONNECT_DELAY = 1000; // 1 second
  private reconnectTimer?: NodeJS.Timeout;
  private isManualDisconnect = false;
  private messageHandlers: Map<string, (envelope: MessageEnvelope) => void> =
    new Map();
  private keyManager: IClientKeyManager;

  constructor(keyManager?: IClientKeyManager) {
    this.keyManager = keyManager || new ClientKeyManager();
  }

  async connect(serverUrl: string): Promise<void> {
    this.serverUrl = serverUrl;
    this.isManualDisconnect = false;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);

        const timeout = setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000); // 10 second timeout

        this.ws.on('open', () => {
          clearTimeout(timeout);
          this.reconnectAttempts = 0;
          this.setupMessageHandler();
          resolve();
        });

        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        this.ws.on('close', () => {
          clearTimeout(timeout);
          if (!this.isManualDisconnect) {
            this.handleDisconnect();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.isManualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.messageHandlers.clear();
  }

  async createWorkspace(config: WorkspaceConfig): Promise<IWorkspaceClient> {
    if (!this.serverUrl) {
      throw new Error('Not connected to server');
    }

    // Generate a creator public key (placeholder for now)
    const creatorPublicKey = Buffer.alloc(32);
    crypto.getRandomValues(creatorPublicKey);

    // Generate workspace secret (32 bytes for AES-256)
    const workspaceSecret = Buffer.alloc(32);
    crypto.getRandomValues(workspaceSecret);

    // Create workspace via REST API
    const response = await fetch(`${this.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          ...config,
          id: config.id.toString(),
        },
        creatorPublicKey: creatorPublicKey.toString('base64'),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create workspace: ${response.statusText}`);
    }

    // Response data available if needed in future
    await response.json();

    // Generate participant ID for creator
    const participantId = GuidV4.new();

    // Create mock metadata for the workspace
    const metadata: WorkspaceMetadata = {
      config,
      participants: [{
        id: participantId,
        publicKey: creatorPublicKey,
        joinedAt: Date.now(),
        role: 'creator',
      }],
      currentTemporalKeyId: 'key-0',
      keyRotationSchedule: {
        currentKeyId: 'key-0',
        nextRotationAt: config.expiresAt,
      },
    };

    // Return workspace client with workspace secret
    return new WorkspaceClient(
      config.id,
      participantId,
      metadata,
      this.ws!,
      this.keyManager,
      workspaceSecret
    );
  }

  async joinWorkspace(
    workspaceId: WorkspaceId,
    temporalKey: Buffer
  ): Promise<IWorkspaceClient> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to server');
    }

    // Generate participant ID
    const participantId = GuidV4.new();

    // Wait for challenge from server
    const challenge = await this.waitForChallenge();

    // Generate zero-knowledge proof
    const proof = await this.generateProof(challenge, temporalKey);

    // Send handshake
    const handshake: HandshakeMessage = {
      protocolVersion: '1.0.0',
      workspaceId,
      participantId,
      publicKey: temporalKey, // Simplified for now
      proof,
    };

    const envelope: MessageEnvelope = {
      type: 'handshake',
      payload: handshake,
      timestamp: Date.now(),
      messageId: GuidV4.new().toString(),
    };

    this.ws.send(JSON.stringify(envelope));

    // Wait for handshake acknowledgment
    const ack = await this.waitForHandshakeAck();

    if (!ack.success) {
      throw new Error('Authentication failed');
    }

    // Decrypt metadata from acknowledgment
    // For now, create mock metadata
    const metadata: WorkspaceMetadata = {
      config: {
        id: workspaceId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
        timeWindow: {
          startTime: Date.now(),
          endTime: Date.now() + 30 * 60 * 1000,
          rotationInterval: 15,
          gracePeriod: 60 * 1000,
        },
        maxParticipants: 50,
        allowExtension: false,
      },
      participants: [{
        id: participantId,
        publicKey: temporalKey,
        joinedAt: Date.now(),
        role: 'editor',
      }],
      currentTemporalKeyId: ack.currentKeyId,
      keyRotationSchedule: {
        currentKeyId: ack.currentKeyId,
        nextRotationAt: Date.now() + 15 * 60 * 1000,
      },
    };

    // Pass temporalKey as workspaceSecret for shareable link generation
    return new WorkspaceClient(
      workspaceId,
      participantId,
      metadata,
      this.ws,
      this.keyManager,
      temporalKey
    );
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      const delay = this.calculateBackoffDelay();
      this.reconnectTimer = setTimeout(() => {
        this.reconnect();
      }, delay);
      this.reconnectAttempts++;
    } else {
      // Max reconnection attempts reached
      console.error('Max reconnection attempts reached');
    }
  }

  private calculateBackoffDelay(): number {
    // Exponential backoff: 2^n * base delay
    return Math.pow(2, this.reconnectAttempts) * this.BASE_RECONNECT_DELAY;
  }

  private async reconnect(): Promise<void> {
    if (!this.serverUrl) {
      return;
    }

    try {
      await this.connect(this.serverUrl);
      // TODO: Restore sessions after reconnection
    } catch (error) {
      console.error('Reconnection failed:', error);
      // handleDisconnect will be called again via the 'close' event
    }
  }

  private setupMessageHandler(): void {
    if (!this.ws) return;

    this.ws.on('message', (data: Buffer) => {
      try {
        const envelope: MessageEnvelope = JSON.parse(data.toString());
        const handler = this.messageHandlers.get(envelope.type);
        if (handler) {
          handler(envelope);
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });
  }

  private waitForChallenge(): Promise<ChallengeMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageHandlers.delete('challenge');
        reject(new Error('Challenge timeout'));
      }, 5000);

      this.messageHandlers.set('challenge', (envelope: MessageEnvelope) => {
        clearTimeout(timeout);
        this.messageHandlers.delete('challenge');
        resolve(envelope.payload as ChallengeMessage);
      });
    });
  }

  private waitForHandshakeAck(): Promise<HandshakeAckMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageHandlers.delete('handshake_ack');
        reject(new Error('Handshake acknowledgment timeout'));
      }, 5000);

      this.messageHandlers.set('handshake_ack', (envelope: MessageEnvelope) => {
        clearTimeout(timeout);
        this.messageHandlers.delete('handshake_ack');
        resolve(envelope.payload as HandshakeAckMessage);
      });
    });
  }

  private async generateProof(
    challenge: ChallengeMessage,
    temporalKey: Buffer
  ): Promise<ZeroKnowledgeProof> {
    // Simplified proof generation for now
    // In a real implementation, this would use the participant's private key
    // to sign the challenge
    return {
      signature: Buffer.from(challenge.challenge, 'base64'),
      timestamp: Date.now(),
    };
  }
}
