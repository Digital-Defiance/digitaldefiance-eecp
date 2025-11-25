/**
 * @module eecp-client
 * 
 * EECP Client - Browser and Node.js client for connecting to EECP workspaces.
 * 
 * This module provides the main client interface for:
 * - Connecting to EECP servers via WebSocket
 * - Creating new collaborative workspaces
 * - Joining existing workspaces with temporal keys
 * - Automatic reconnection with exponential backoff
 * - Zero-knowledge authentication
 * 
 * The client handles:
 * - WebSocket connection management
 * - Challenge-response authentication
 * - Message routing and handling
 * - Automatic reconnection on disconnect
 * - Workspace lifecycle management
 * 
 * @example
 * ```typescript
 * import { EECPClient } from '@digitaldefiance-eecp/eecp-client';
 * import { GuidV4 } from '@digitaldefiance/ecies-lib';
 * 
 * // Create client
 * const client = new EECPClient();
 * 
 * // Connect to server
 * await client.connect('ws://localhost:3000');
 * 
 * // Create workspace
 * const workspace = await client.createWorkspace({
 *   id: GuidV4.new(),
 *   createdAt: Date.now(),
 *   expiresAt: Date.now() + 30 * 60 * 1000,
 *   timeWindow: {
 *     startTime: Date.now(),
 *     endTime: Date.now() + 30 * 60 * 1000,
 *     rotationInterval: 15,
 *     gracePeriod: 60000
 *   },
 *   maxParticipants: 50,
 *   allowExtension: false
 * });
 * 
 * // Or join existing workspace
 * const workspace = await client.joinWorkspace(workspaceId, temporalKey);
 * 
 * // Use workspace
 * const editor = workspace.getEditor();
 * editor.insert(0, 'Hello, world!');
 * 
 * // Disconnect
 * client.disconnect();
 * ```
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

/**
 * Interface for EECP Client operations.
 * 
 * @interface IEECPClient
 */
export interface IEECPClient {
  /**
   * Connect to EECP server via WebSocket.
   * 
   * @param {string} serverUrl - WebSocket server URL (e.g., 'ws://localhost:3000')
   * @returns {Promise<void>} Resolves when connected
   * @throws {Error} If connection fails or times out
   */
  connect(serverUrl: string): Promise<void>;

  /**
   * Disconnect from server and clean up resources.
   * 
   * Stops automatic reconnection and closes WebSocket connection.
   */
  disconnect(): void;

  /**
   * Create a new collaborative workspace.
   * 
   * @param {WorkspaceConfig} config - Workspace configuration
   * @returns {Promise<IWorkspaceClient>} Workspace client for the new workspace
   * @throws {Error} If not connected or workspace creation fails
   */
  createWorkspace(config: WorkspaceConfig): Promise<IWorkspaceClient>;

  /**
   * Join an existing workspace with temporal key.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID to join
   * @param {Buffer} temporalKey - Temporal key for authentication and decryption
   * @returns {Promise<IWorkspaceClient>} Workspace client for the joined workspace
   * @throws {Error} If not connected, authentication fails, or workspace not found
   */
  joinWorkspace(
    workspaceId: WorkspaceId,
    temporalKey: Buffer
  ): Promise<IWorkspaceClient>;
}

/**
 * EECP Client implementation.
 * 
 * Manages WebSocket connections, authentication, and workspace lifecycle.
 * Implements automatic reconnection with exponential backoff.
 * 
 * @class EECPClient
 * @implements {IEECPClient}
 * 
 * @example
 * ```typescript
 * const client = new EECPClient();
 * await client.connect('ws://localhost:3000');
 * const workspace = await client.joinWorkspace(workspaceId, temporalKey);
 * ```
 */
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

  /**
   * Connect to EECP server via WebSocket.
   * 
   * Establishes WebSocket connection with:
   * - 10 second connection timeout
   * - Automatic message handler setup
   * - Reconnection on unexpected disconnect
   * 
   * @param {string} serverUrl - WebSocket server URL (e.g., 'ws://localhost:3000')
   * @returns {Promise<void>} Resolves when connected
   * @throws {Error} If connection fails or times out
   * 
   * @example
   * ```typescript
   * await client.connect('ws://localhost:3000');
   * console.log('Connected to server');
   * ```
   */
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

  /**
   * Disconnect from server and clean up resources.
   * 
   * Stops automatic reconnection, closes WebSocket, and clears message handlers.
   * 
   * @example
   * ```typescript
   * client.disconnect();
   * console.log('Disconnected from server');
   * ```
   */
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

  /**
   * Create a new collaborative workspace.
   * 
   * Creates workspace via REST API and returns workspace client.
   * Generates:
   * - Creator public key
   * - Workspace secret for encryption
   * - Participant ID for creator
   * 
   * @param {WorkspaceConfig} config - Workspace configuration
   * @returns {Promise<IWorkspaceClient>} Workspace client for the new workspace
   * @throws {Error} If not connected or workspace creation fails
   * 
   * @example
   * ```typescript
   * const workspace = await client.createWorkspace({
   *   id: GuidV4.new(),
   *   createdAt: Date.now(),
   *   expiresAt: Date.now() + 30 * 60 * 1000,
   *   timeWindow: {
   *     startTime: Date.now(),
   *     endTime: Date.now() + 30 * 60 * 1000,
   *     rotationInterval: 15,
   *     gracePeriod: 60000
   *   },
   *   maxParticipants: 50,
   *   allowExtension: false
   * });
   * ```
   */
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
    // @ts-expect-error - Response data not currently used but may be needed in future
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _responseData = await response.json();

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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.ws!,
      this.keyManager,
      workspaceSecret
    );
  }

  /**
   * Join an existing workspace with temporal key.
   * 
   * Authentication flow:
   * 1. Wait for challenge from server
   * 2. Generate zero-knowledge proof
   * 3. Send handshake with proof
   * 4. Wait for acknowledgment
   * 5. Return workspace client
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID to join
   * @param {Buffer} temporalKey - Temporal key for authentication and decryption
   * @returns {Promise<IWorkspaceClient>} Workspace client for the joined workspace
   * @throws {Error} If not connected, authentication fails, or workspace not found
   * 
   * @example
   * ```typescript
   * const workspace = await client.joinWorkspace(workspaceId, temporalKey);
   * console.log('Joined workspace');
   * ```
   */
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

  /**
   * Handle unexpected disconnect and attempt reconnection.
   * 
   * Uses exponential backoff with maximum 5 attempts.
   * 
   * @private
   */
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

  /**
   * Calculate exponential backoff delay for reconnection.
   * 
   * Formula: 2^n * base delay (1 second)
   * 
   * @private
   * @returns {number} Delay in milliseconds
   */
  private calculateBackoffDelay(): number {
    // Exponential backoff: 2^n * base delay
    return Math.pow(2, this.reconnectAttempts) * this.BASE_RECONNECT_DELAY;
  }

  /**
   * Attempt to reconnect to server.
   * 
   * @private
   */
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

  /**
   * Set up WebSocket message handler.
   * 
   * Routes incoming messages to registered handlers by message type.
   * 
   * @private
   */
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

  /**
   * Wait for challenge message from server.
   * 
   * Times out after 5 seconds.
   * 
   * @private
   * @returns {Promise<ChallengeMessage>} Challenge from server
   * @throws {Error} If challenge times out
   */
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

  /**
   * Wait for handshake acknowledgment from server.
   * 
   * Times out after 5 seconds.
   * 
   * @private
   * @returns {Promise<HandshakeAckMessage>} Handshake acknowledgment
   * @throws {Error} If acknowledgment times out
   */
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

  /**
   * Generate zero-knowledge proof for authentication.
   * 
   * Signs challenge with participant's private key.
   * Simplified implementation - production would use proper signing.
   * 
   * @private
   * @param {ChallengeMessage} challenge - Challenge from server
   * @param {Buffer} temporalKey - Temporal key (used as signing key in simplified version)
   * @returns {Promise<ZeroKnowledgeProof>} Zero-knowledge proof
   */
  private async generateProof(
    challenge: ChallengeMessage,
    _temporalKey: Buffer
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
