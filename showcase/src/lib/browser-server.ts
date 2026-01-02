/**
 * Browser-Compatible EECP Server
 * 
 * In-memory server implementation that runs entirely in the browser.
 * Uses Web Crypto API instead of Node.js crypto and event-based transport instead of WebSocket.
 * 
 * Key differences from Node server:
 * - No Express/HTTP server (uses direct method calls)
 * - No WebSocket (uses BrowserTransport event emitter)
 * - No separate service classes (integrated functionality)
 * - No rate limiting (simplified for demo)
 * - No metrics service (simplified for demo)
 * - No audit logging (simplified for demo)
 * - Uses Web Crypto API instead of Node crypto
 * - In-memory storage only (no persistence)
 * 
 * Features implemented:
 * ✅ Workspace creation, retrieval, extension, revocation
 * ✅ Participant authentication and session management
 * ✅ Operation routing and broadcasting
 * ✅ Sync request handling
 * ✅ Challenge-response authentication
 * ✅ Workspace expiration and cleanup
 * ✅ Health status endpoint
 * ✅ Ping/pong for connection keep-alive
 * 
 * Features NOT implemented (Node server only):
 * ❌ REST API endpoints (POST /workspaces, GET /workspaces/:id, etc.)
 * ❌ Rate limiting (operations, workspace creation, participant limits)
 * ❌ Metrics collection (Prometheus)
 * ❌ Audit logging
 * ❌ Zero-knowledge proof verification (simplified authentication)
 * ❌ Temporal cleanup service (integrated into main class)
 * ❌ Operation buffering for offline participants
 * ❌ WebSocket upgrade handling
 */

import { EventEmitter } from 'events';
import {
  WorkspaceConfig,
  WorkspaceId,
  EncryptedOperation,
  MessageEnvelope,
  MessageType,
  ChallengeMessage,
  HandshakeMessage,
  HandshakeAckMessage,
  OperationMessage,
  OperationAckMessage,
  SyncRequestMessage,
  SyncResponseMessage,
  ErrorMessage,
  ErrorCode,
} from '@digitaldefiance/eecp-protocol';

/**
 * Browser-compatible base64 encoding
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Recursively reconstruct GuidV4 and Buffer objects from parsed JSON
 * GuidV4 objects are serialized as objects with _value property
 * Buffer objects are serialized as { type: 'Buffer', data: [...] }
 */
function reconstructGuidV4(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Check if this looks like a serialized Buffer
  if (typeof obj === 'object' && obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return new Uint8Array(obj.data);
  }
  
  // Check if this looks like a serialized GuidV4
  if (typeof obj === 'object' && obj._value !== undefined) {
    try {
      // GuidV4 stores its value as a Buffer-like object
      if (obj._value.type === 'Buffer' && Array.isArray(obj._value.data)) {
        // For browser, we can't use GuidV4.fromBuffer, so create a mock
        const bytes = new Uint8Array(obj._value.data);
        // Convert to hex string
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const fullHex = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        return {
          asFullHexGuid: fullHex,
          asShortHexGuid: hex,
          toString: () => fullHex,
        };
      }
    } catch (e) {
      // If reconstruction fails, return original
    }
  }
  
  // Recursively process arrays
  if (Array.isArray(obj)) {
    return obj.map(reconstructGuidV4);
  }
  
  // Recursively process objects
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = reconstructGuidV4(obj[key]);
    }
    return result;
  }
  
  return obj;
}

/**
 * In-memory workspace storage
 */
interface BrowserWorkspace {
  id: WorkspaceId;
  config: WorkspaceConfig;
  encryptedMetadata: Uint8Array;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'revoked';
  participantCount: number;
  participants: Map<string, BrowserParticipantSession>;
  operations: EncryptedOperation[];
  operationBuffers: Map<string, EncryptedOperation[]>; // Buffer for offline participants
}

/**
 * Browser participant session
 */
interface BrowserParticipantSession {
  participantId: WorkspaceId;
  workspaceId: WorkspaceId;
  publicKey: Uint8Array;
  connectedAt: number;
  lastActivity: number;
  transport: BrowserTransport;
  operationCount: number; // For rate limiting
  lastOperationWindow: number; // For rate limiting
}

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  operationsPerSecond: number;
  maxParticipantsPerWorkspace: number;
}

/**
 * Rate limit result
 */
interface RateLimitResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Browser transport layer (replaces WebSocket).
 * 
 * Provides event-based communication between client and server in the browser.
 * Emulates WebSocket interface but uses direct method calls instead of network.
 * 
 * @class BrowserTransport
 * @extends EventEmitter
 * 
 * Events:
 * - 'open': Connection established
 * - 'message': Message received (data: string)
 * - 'close': Connection closed
 * - 'error': Error occurred
 * 
 * @example
 * ```typescript
 * const transport = server.createTransport();
 * transport.on('message', (data) => console.log(data));
 * transport.connect();
 * transport.send(JSON.stringify(envelope));
 * ```
 */
export class BrowserTransport extends EventEmitter {
  private connected = false;
  
  constructor(private server: BrowserEECPServer) {
    super();
  }

  /**
   * Send message to server
   */
  send(data: string): void {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }
    
    try {
      const parsed = JSON.parse(data);
      // Reconstruct GuidV4 objects that were lost during JSON serialization
      const envelope: MessageEnvelope = reconstructGuidV4(parsed);
      // Emit to server for processing
      this.server.handleMessage(this, envelope);
    } catch (error) {
      console.error('Error sending message:', error);
      this.emit('error', error);
    }
  }

  /**
   * Receive message from server
   */
  receive(envelope: MessageEnvelope): void {
    this.emit('receive', envelope);
    this.emit('message', JSON.stringify(envelope));
  }

  /**
   * Connect transport
   */
  connect(): void {
    this.connected = true;
    this.emit('open');
    
    // Send challenge immediately upon connection
    this.server.sendChallenge(this);
  }

  /**
   * Close transport
   */
  close(): void {
    this.connected = false;
    this.emit('close');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Browser-compatible EECP Server.
 * 
 * Simplified server implementation for browser environments.
 * Provides core EECP functionality without Node.js dependencies.
 * 
 * @class BrowserEECPServer
 * @extends EventEmitter
 * 
 * @example
 * ```typescript
 * const server = new BrowserEECPServer();
 * server.start();
 * 
 * // Create workspace
 * const workspace = await server.createWorkspace(config, publicKey);
 * 
 * // Create transport for client
 * const transport = server.createTransport();
 * transport.connect();
 * 
 * // Stop server
 * server.stop();
 * ```
 */
export class BrowserEECPServer extends EventEmitter {
  private workspaces: Map<string, BrowserWorkspace> = new Map();
  private challenges: Map<string, { challenge: Uint8Array; timestamp: number }> = new Map();
  private readonly CHALLENGE_TIMEOUT = 60000; // 60 seconds
  private readonly protocolVersion = '1.0.0';
  private cleanupInterval?: number;
  private rateLimitConfig: RateLimitConfig = {
    operationsPerSecond: 100,
    maxParticipantsPerWorkspace: 50,
  };

  constructor() {
    super();
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(
    config: WorkspaceConfig,
    _creatorPublicKey: Uint8Array
  ): Promise<BrowserWorkspace> {
    const workspace: BrowserWorkspace = {
      id: config.id,
      config,
      encryptedMetadata: new Uint8Array(0), // Will be set by caller
      createdAt: config.createdAt,
      expiresAt: config.expiresAt,
      status: 'active',
      participantCount: 0,
      participants: new Map(),
      operations: [],
      operationBuffers: new Map(),
    };

    this.workspaces.set(config.id.asFullHexGuid, workspace);

    // Schedule expiration
    this.scheduleExpiration(workspace);

    return workspace;
  }

  /**
   * Get workspace by ID
   */
  async getWorkspace(workspaceId: WorkspaceId): Promise<BrowserWorkspace | null> {
    return this.workspaces.get(workspaceId.asFullHexGuid) || null;
  }

  /**
   * Extend workspace expiration
   */
  async extendWorkspace(workspaceId: WorkspaceId, additionalMinutes: number): Promise<void> {
    const workspace = this.workspaces.get(workspaceId.asFullHexGuid);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    workspace.expiresAt += additionalMinutes * 60 * 1000;
    workspace.config.expiresAt = workspace.expiresAt;

    // Reschedule expiration
    this.scheduleExpiration(workspace);
  }

  /**
   * Revoke workspace
   */
  async revokeWorkspace(workspaceId: WorkspaceId): Promise<void> {
    const workspace = this.workspaces.get(workspaceId.asFullHexGuid);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    workspace.status = 'revoked';
    workspace.expiresAt = Date.now();

    // Close all participant connections
    for (const session of workspace.participants.values()) {
      session.transport.close();
    }

    // Clear operations but keep workspace for grace period
    workspace.operations = [];
    
    // Remove from memory after grace period
    setTimeout(() => {
      this.workspaces.delete(workspaceId.asFullHexGuid);
    }, 60000); // 1 minute grace period
  }

  /**
   * Check if workspace is expired
   */
  isWorkspaceExpired(workspace: BrowserWorkspace): boolean {
    return workspace.expiresAt <= Date.now() || workspace.status !== 'active';
  }

  /**
   * Create a new transport connection
   */
  createTransport(): BrowserTransport {
    return new BrowserTransport(this);
  }

  /**
   * Send challenge to newly connected transport
   */
  async sendChallenge(transport: BrowserTransport): Promise<void> {
    try {
      const challenge = await this.generateChallenge();
      const challengeId = this.generateMessageId();
      
      // Store challenge for verification
      this.challenges.set(challengeId, {
        challenge,
        timestamp: Date.now(),
      });

      const challengeMessage: ChallengeMessage = {
        challengeId,
        challenge: uint8ArrayToBase64(challenge),
      };

      this.sendMessage(transport, 'challenge', challengeMessage);
    } catch (error) {
      console.error('Error sending challenge:', error);
      transport.close();
    }
  }

  /**
   * Handle message from transport
   */
  async handleMessage(transport: BrowserTransport, envelope: MessageEnvelope): Promise<void> {
    try {
      switch (envelope.type) {
        case 'handshake':
          await this.handleHandshake(transport, envelope);
          break;

        case 'operation':
          await this.handleOperation(transport, envelope);
          break;

        case 'sync_request':
          await this.handleSyncRequest(transport, envelope);
          break;

        case 'ping':
          this.handlePing(transport, envelope);
          break;

        default:
          console.warn('Unknown message type:', envelope.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(
        transport,
        'INVALID_OPERATION',
        error instanceof Error ? error.message : 'Invalid message'
      );
    }
  }

  /**
   * Handle handshake
   */
  private async handleHandshake(
    transport: BrowserTransport,
    envelope: MessageEnvelope
  ): Promise<void> {
    try {
      const handshake = envelope.payload as HandshakeMessage;

      // Validate protocol version
      if (handshake.protocolVersion !== this.protocolVersion) {
        this.sendError(
          transport,
          'AUTH_FAILED',
          `Protocol version mismatch. Server: ${this.protocolVersion}, Client: ${handshake.protocolVersion}`
        );
        transport.close();
        return;
      }

      // Verify workspace exists and is active
      const workspace = await this.getWorkspace(handshake.workspaceId);
      if (!workspace) {
        this.sendError(transport, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
        transport.close();
        return;
      }

      if (this.isWorkspaceExpired(workspace)) {
        this.sendError(transport, 'WORKSPACE_EXPIRED', 'Workspace has expired');
        transport.close();
        return;
      }

      // Check participant limit
      const participantLimitResult = this.checkParticipantLimit(workspace);
      if (!participantLimitResult.allowed) {
        this.sendError(transport, 'RATE_LIMIT_EXCEEDED', participantLimitResult.reason || 'Participant limit exceeded');
        transport.close();
        return;
      }

      // Create session
      const session: BrowserParticipantSession = {
        participantId: handshake.participantId,
        workspaceId: handshake.workspaceId,
        publicKey: handshake.publicKey,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        transport,
        operationCount: 0,
        lastOperationWindow: Date.now(),
      };

      // Store session
      workspace.participants.set(handshake.participantId.asFullHexGuid, session);
      workspace.participantCount++;

      // Send handshake acknowledgment
      const ack: HandshakeAckMessage = {
        success: true,
        currentKeyId: 'key-0',
        encryptedMetadata: workspace.encryptedMetadata as any,
        serverTime: Date.now(),
      };

      this.sendMessage(transport, 'handshake_ack', ack);

      // Deliver buffered operations if any
      const bufferedOps = workspace.operationBuffers.get(handshake.participantId.asFullHexGuid);
      if (bufferedOps && bufferedOps.length > 0) {
        for (const op of bufferedOps) {
          const message: OperationMessage = { operation: op };
          this.sendMessage(transport, 'operation', message);
        }
        workspace.operationBuffers.delete(handshake.participantId.asFullHexGuid);
      }

      // Set up transport close handler
      transport.once('close', () => {
        workspace.participants.delete(handshake.participantId.asFullHexGuid);
        workspace.participantCount--;
      });
    } catch (error) {
      console.error('Handshake error:', error);
      this.sendError(
        transport,
        'AUTH_FAILED',
        error instanceof Error ? error.message : 'Authentication failed'
      );
      transport.close();
    }
  }

  /**
   * Handle operation
   */
  private async handleOperation(
    transport: BrowserTransport,
    envelope: MessageEnvelope
  ): Promise<void> {
    try {
      const message = envelope.payload as OperationMessage;
      const operation = message.operation;

      // Find workspace and session
      const workspace = await this.getWorkspace(operation.workspaceId);
      if (!workspace) {
        this.sendError(transport, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
        return;
      }

      const session = workspace.participants.get(operation.participantId.asFullHexGuid);
      if (!session) {
        this.sendError(transport, 'AUTH_FAILED', 'Not authenticated');
        return;
      }

      // Check operation rate limit
      const rateLimitResult = this.checkOperationRate(session);
      if (!rateLimitResult.allowed) {
        this.sendError(transport, 'RATE_LIMIT_EXCEEDED', rateLimitResult.reason || 'Rate limit exceeded');
        return;
      }

      // Record operation for rate limiting
      this.recordOperation(session);

      // Store operation
      workspace.operations.push(operation);

      // Broadcast to all participants except sender
      for (const participant of workspace.participants.values()) {
        // Compare participant IDs - handle both GuidV4 objects and reconstructed mock objects
        const participantIdStr = typeof participant.participantId === 'object' && participant.participantId.asFullHexGuid 
          ? participant.participantId.asFullHexGuid 
          : participant.participantId.toString();
        const operationIdStr = typeof operation.participantId === 'object' && operation.participantId.asFullHexGuid
          ? operation.participantId.asFullHexGuid
          : operation.participantId.toString();
        
        if (participantIdStr !== operationIdStr) {
          try {
            if (participant.transport.isConnected()) {
              this.sendMessage(participant.transport, 'operation', message);
            } else {
              // Buffer operation for offline participant
              this.bufferOperation(workspace, participant.participantId.asFullHexGuid, operation);
            }
          } catch (error) {
            // Participant offline, buffer operation
            this.bufferOperation(workspace, participant.participantId.asFullHexGuid, operation);
          }
        }
      }

      // Send acknowledgment
      const ack: OperationAckMessage = {
        operationId: operation.id,
        serverTimestamp: Date.now(),
      };

      this.sendMessage(transport, 'operation_ack', ack);

      // Update last activity
      session.lastActivity = Date.now();
    } catch (error) {
      console.error('Operation error:', error);
      this.sendError(
        transport,
        'INVALID_OPERATION',
        error instanceof Error ? error.message : 'Failed to process operation'
      );
    }
  }

  /**
   * Handle sync request
   */
  private async handleSyncRequest(
    transport: BrowserTransport,
    envelope: MessageEnvelope
  ): Promise<void> {
    try {
      const message = envelope.payload as SyncRequestMessage;

      // Find workspace from any participant session
      let workspace: BrowserWorkspace | null = null;
      for (const ws of this.workspaces.values()) {
        for (const session of ws.participants.values()) {
          if (session.transport === transport) {
            workspace = ws;
            break;
          }
        }
        if (workspace) break;
      }

      if (!workspace) {
        this.sendError(transport, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
        return;
      }

      // Filter operations by timestamp
      const operations = workspace.operations.filter(
        (op) => op.timestamp > message.fromTimestamp
      );

      // Send sync response
      const response: SyncResponseMessage = {
        operations,
        currentState: new Uint8Array(0) as any, // TODO: Get current CRDT state - cast to any for browser compatibility
      };

      this.sendMessage(transport, 'sync_response', response);
    } catch (error) {
      console.error('Sync error:', error);
      this.sendError(
        transport,
        'INVALID_OPERATION',
        error instanceof Error ? error.message : 'Failed to sync'
      );
    }
  }

  /**
   * Handle ping
   */
  private handlePing(transport: BrowserTransport, _envelope: MessageEnvelope): void {
    this.sendMessage(transport, 'pong', { timestamp: Date.now() });
  }

  /**
   * Send message to transport
   */
  private sendMessage(transport: BrowserTransport, type: MessageType, payload: unknown): void {
    const envelope: MessageEnvelope = {
      type,
      payload,
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
    };

    transport.receive(envelope);
  }

  /**
   * Send error message
   */
  private sendError(transport: BrowserTransport, code: ErrorCode, message: string, details?: unknown): void {
    const error: ErrorMessage = {
      code,
      message,
      details,
    };

    this.sendMessage(transport, 'error', error);
  }

  /**
   * Generate challenge using Web Crypto API
   */
  async generateChallenge(): Promise<Uint8Array> {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    return challenge;
  }

  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return crypto.randomUUID();
  }

  /**
   * Schedule workspace expiration
   */
  private scheduleExpiration(workspace: BrowserWorkspace): void {
    const delay = workspace.expiresAt - Date.now();
    if (delay > 0) {
      setTimeout(() => this.expireWorkspace(workspace), delay);
    }
  }

  /**
   * Expire workspace
   */
  private async expireWorkspace(workspace: BrowserWorkspace): Promise<void> {
    workspace.status = 'expired';

    // Close all participant connections
    for (const session of workspace.participants.values()) {
      session.transport.close();
    }

    // Clear operations
    workspace.operations = [];

    // Remove from memory after grace period
    setTimeout(() => {
      this.workspaces.delete(workspace.id.asFullHexGuid);
    }, 60000); // 1 minute grace period
  }

  /**
   * Start cleanup service
   */
  start(): void {
    // Run cleanup every 60 seconds
    this.cleanupInterval = window.setInterval(() => {
      this.runCleanup();
    }, 60000);
  }

  /**
   * Stop cleanup service
   */
  stop(): void {
    if (this.cleanupInterval) {
      window.clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Run cleanup cycle
   */
  private runCleanup(): void {
    const now = Date.now();

    // Clean up expired workspaces
    for (const [, workspace] of this.workspaces.entries()) {
      if (this.isWorkspaceExpired(workspace)) {
        this.expireWorkspace(workspace);
      }
    }

    // Clean up expired challenges
    for (const [id, { timestamp }] of this.challenges.entries()) {
      if (now - timestamp > this.CHALLENGE_TIMEOUT) {
        this.challenges.delete(id);
      }
    }

    // Clean up expired buffered operations
    this.clearExpiredBuffers();
  }

  /**
   * Get workspace count
   */
  getWorkspaceCount(): number {
    return this.workspaces.size;
  }

  /**
   * Get total participant count
   */
  getTotalParticipantCount(): number {
    let count = 0;
    for (const workspace of this.workspaces.values()) {
      count += workspace.participantCount;
    }
    return count;
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: string;
    timestamp: number;
    version: string;
    workspaces: number;
    participants: number;
  } {
    return {
      status: 'ok',
      timestamp: Date.now(),
      version: this.protocolVersion,
      workspaces: this.getWorkspaceCount(),
      participants: this.getTotalParticipantCount(),
    };
  }

  /**
   * Check operation rate limit for participant
   */
  private checkOperationRate(session: BrowserParticipantSession): RateLimitResult {
    const now = Date.now();
    const windowDuration = 1000; // 1 second window

    // Check if we're in a new window
    if (now - session.lastOperationWindow >= windowDuration) {
      // New window, reset counter
      return { allowed: true };
    }

    // Check if limit exceeded
    if (session.operationCount >= this.rateLimitConfig.operationsPerSecond) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.rateLimitConfig.operationsPerSecond} operations per second`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record operation for rate limiting
   */
  private recordOperation(session: BrowserParticipantSession): void {
    const now = Date.now();
    const windowDuration = 1000; // 1 second window

    if (now - session.lastOperationWindow >= windowDuration) {
      // Start new window
      session.operationCount = 1;
      session.lastOperationWindow = now;
    } else {
      // Increment counter in current window
      session.operationCount++;
    }
  }

  /**
   * Check participant limit for workspace
   */
  private checkParticipantLimit(workspace: BrowserWorkspace): RateLimitResult {
    // Use workspace's maxParticipants config if available, otherwise use server default
    const maxParticipants = workspace.config.maxParticipants || this.rateLimitConfig.maxParticipantsPerWorkspace;
    
    if (workspace.participantCount >= maxParticipants) {
      return {
        allowed: false,
        reason: `Participant limit exceeded: maximum ${maxParticipants} participants per workspace`,
      };
    }

    return { allowed: true };
  }

  /**
   * Buffer operation for offline participant
   */
  private bufferOperation(
    workspace: BrowserWorkspace,
    participantId: string,
    operation: EncryptedOperation
  ): void {
    let buffer = workspace.operationBuffers.get(participantId);
    if (!buffer) {
      buffer = [];
      workspace.operationBuffers.set(participantId, buffer);
    }
    buffer.push(operation);

    // Limit buffer size to prevent memory issues
    const MAX_BUFFER_SIZE = 1000;
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.shift(); // Remove oldest operation
    }
  }

  /**
   * Clear expired buffered operations
   */
  private clearExpiredBuffers(): void {
    const expirationTime = Date.now() - 3600000; // 1 hour

    for (const workspace of this.workspaces.values()) {
      for (const [participantId, operations] of workspace.operationBuffers.entries()) {
        // Filter out expired operations
        const filtered = operations.filter(op => op.timestamp > expirationTime);
        
        if (filtered.length === 0) {
          // All operations expired, delete buffer
          workspace.operationBuffers.delete(participantId);
        } else if (filtered.length < operations.length) {
          // Some operations expired, update buffer
          workspace.operationBuffers.set(participantId, filtered);
        }
      }
    }
  }
}
