/**
 * @module eecp-server
 * 
 * EECP Server - Express server with WebSocket support for routing encrypted operations.
 * 
 * This module implements the core EECP server that provides:
 * - REST API for workspace management (create, extend, revoke, query)
 * - WebSocket protocol for real-time collaborative editing
 * - Zero-knowledge authentication using challenge-response protocol
 * - Operation routing to workspace participants
 * - Rate limiting and metrics collection
 * - Temporal cleanup of expired workspaces
 * 
 * The server maintains zero-knowledge properties by:
 * - Never decrypting operation content
 * - Using challenge-response authentication without storing credentials
 * - Routing encrypted operations without learning their content
 * - Supporting anonymous participation with public key authentication
 * 
 * @example
 * ```typescript
 * import { EECPServer } from '@digitaldefiance/eecp-server';
 * import { WorkspaceManager } from './workspace-manager';
 * import { ParticipantManager } from './participant-manager';
 * import { OperationRouter } from './operation-router';
 * import { TemporalCleanupService } from './temporal-cleanup-service';
 * import { ParticipantAuth } from '@digitaldefiance/eecp-crypto';
 * import { RateLimiter } from './rate-limiter';
 * import { MetricsService } from './metrics-service';
 * 
 * // Create dependencies
 * const workspaceManager = new WorkspaceManager();
 * const participantAuth = new ParticipantAuth();
 * const participantManager = new ParticipantManager(participantAuth);
 * const operationRouter = new OperationRouter(participantManager, workspaceManager);
 * const cleanupService = new TemporalCleanupService(workspaceManager);
 * const rateLimiter = new RateLimiter();
 * const metricsService = new MetricsService();
 * 
 * // Create and start server
 * const server = new EECPServer(
 *   workspaceManager,
 *   participantManager,
 *   operationRouter,
 *   cleanupService,
 *   participantAuth,
 *   rateLimiter,
 *   metricsService,
 *   { port: 3000, host: 'localhost' }
 * );
 * 
 * await server.start();
 * console.log('Server running on http://localhost:3000');
 * 
 * // Later, stop the server
 * await server.stop();
 * ```
 */

import express, { Express, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkspaceConfig,
  WorkspaceId,
  EncryptedOperation,
} from '@digitaldefiance/eecp-protocol';
import {
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
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import { IWorkspaceManager } from './workspace-manager.js';
import { IParticipantManager, ParticipantSession } from './participant-manager.js';
import { IOperationRouter } from './operation-router.js';
import { ITemporalCleanupService } from './temporal-cleanup-service.js';
import { IParticipantAuth } from '@digitaldefiance/eecp-crypto';
import { IRateLimiter } from './rate-limiter.js';
import { IMetricsService } from './metrics-service.js';

/**
 * EECP Server configuration options.
 * 
 * @interface EECPServerConfig
 * @property {number} port - Port number for HTTP/WebSocket server
 * @property {string} host - Host address to bind to (e.g., 'localhost', '0.0.0.0')
 * @property {string} protocolVersion - EECP protocol version (e.g., '1.0.0')
 * 
 * @example
 * ```typescript
 * const config: EECPServerConfig = {
 *   port: 3000,
 *   host: 'localhost',
 *   protocolVersion: '1.0.0'
 * };
 * ```
 */
export interface EECPServerConfig {
  port: number;
  host: string;
  protocolVersion: string;
}

/**
 * EECP Server class - Manages HTTP REST API and WebSocket connections for EECP protocol.
 * 
 * The server provides:
 * - REST endpoints for workspace lifecycle management
 * - WebSocket connections for real-time operation routing
 * - Challenge-response authentication for participants
 * - Rate limiting and metrics collection
 * - Health check and monitoring endpoints
 * 
 * @class EECPServer
 * 
 * @example
 * ```typescript
 * const server = new EECPServer(
 *   workspaceManager,
 *   participantManager,
 *   operationRouter,
 *   cleanupService,
 *   participantAuth,
 *   rateLimiter,
 *   metricsService,
 *   { port: 3000 }
 * );
 * 
 * await server.start();
 * ```
 */
export class EECPServer {
  private app: Express;
  private httpServer: HTTPServer;
  private wss: WebSocketServer;
  private config: EECPServerConfig;
  private challenges: Map<string, { challenge: Buffer; timestamp: number }> = new Map();
  private readonly CHALLENGE_TIMEOUT = 60000; // 60 seconds

  constructor(
    private workspaceManager: IWorkspaceManager,
    private participantManager: IParticipantManager,
    private operationRouter: IOperationRouter,
    private cleanupService: ITemporalCleanupService,
    private participantAuth: IParticipantAuth,
    private rateLimiter: IRateLimiter,
    private metricsService: IMetricsService,
    config?: Partial<EECPServerConfig>
  ) {
    this.config = {
      port: config?.port || 3000,
      host: config?.host || 'localhost',
      protocolVersion: config?.protocolVersion || '1.0.0',
    };

    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  /**
   * Set up Express middleware for request processing.
   * 
   * Configures:
   * - JSON body parsing
   * - URL-encoded body parsing
   * - CORS headers for cross-origin requests
   * - OPTIONS request handling
   * 
   * @private
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  /**
   * Set up REST API routes for workspace management.
   * 
   * Endpoints:
   * - POST /workspaces - Create new workspace
   * - GET /workspaces/:id - Get workspace information
   * - POST /workspaces/:id/extend - Extend workspace expiration
   * - DELETE /workspaces/:id - Revoke workspace
   * - GET /health - Health check endpoint
   * - GET /metrics - Prometheus metrics endpoint
   * 
   * @private
   */
  private setupRoutes(): void {
    // POST /workspaces - Create workspace
    this.app.post('/workspaces', async (req: Request, res: Response) => {
      try {
        // Get client IP address
        const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

        // Check workspace creation rate limit
        const rateLimitResult = this.rateLimiter.checkWorkspaceCreationRate(ipAddress);
        if (!rateLimitResult.allowed) {
          res.status(429).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: rateLimitResult.reason,
            retryAfter: rateLimitResult.retryAfter,
          });
          return;
        }

        const { config, creatorPublicKey } = req.body;

        if (!config || !creatorPublicKey) {
          res.status(400).json({
            error: 'Missing required fields: config, creatorPublicKey',
          });
          return;
        }

        // Validate workspace config
        if (!config.id || !config.createdAt || !config.expiresAt) {
          res.status(400).json({
            error: 'Invalid workspace config',
          });
          return;
        }

        // Reconstruct GuidV4 from serialized format
        const reconstructGuidV4 = (value: any): GuidV4 => {
          if (typeof value === 'string') {
            return new GuidV4(value);
          } else if (value && value._value && value._value.data) {
            return GuidV4.fromBuffer(Buffer.from(value._value.data));
          } else {
            throw new Error('Invalid GuidV4 format');
          }
        };

        // Reconstruct the workspace config with proper GuidV4
        const workspaceConfig: WorkspaceConfig = {
          ...config,
          id: reconstructGuidV4(config.id),
        };

        // Convert public key from base64 if needed
        const publicKeyBuffer = Buffer.isBuffer(creatorPublicKey)
          ? creatorPublicKey
          : Buffer.from(creatorPublicKey, 'base64');

        // Create workspace
        const workspace = await this.workspaceManager.createWorkspace(
          workspaceConfig,
          publicKeyBuffer
        );

        // Record workspace creation for rate limiting
        this.rateLimiter.recordWorkspaceCreation(ipAddress);

        // Update metrics
        this.metricsService.incrementWorkspaceCount();

        res.status(201).json({
          id: workspace.id,
          createdAt: workspace.createdAt,
          expiresAt: workspace.expiresAt,
          status: workspace.status,
        });
      } catch (error) {
        console.error('Error creating workspace:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to create workspace',
        });
      }
    });

    // GET /workspaces/:id - Get workspace info
    this.app.get('/workspaces/:id', async (req: Request, res: Response) => {
      try {
        let workspaceId: GuidV4;
        try {
          workspaceId = new GuidV4(req.params.id);
        } catch (error) {
          res.status(404).json({
            error: 'Workspace not found',
          });
          return;
        }

        const workspace = await this.workspaceManager.getWorkspace(workspaceId);

        if (!workspace) {
          res.status(404).json({
            error: 'Workspace not found',
          });
          return;
        }

        res.json({
          id: workspace.id,
          createdAt: workspace.createdAt,
          expiresAt: workspace.expiresAt,
          status: workspace.status,
          participantCount: workspace.participantCount,
          encryptedMetadata: JSON.stringify(workspace.encryptedMetadata),
        });
      } catch (error) {
        console.error('Error getting workspace:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to get workspace',
        });
      }
    });

    // POST /workspaces/:id/extend - Extend workspace
    this.app.post('/workspaces/:id/extend', async (req: Request, res: Response) => {
      try {
        let workspaceId: GuidV4;
        try {
          workspaceId = new GuidV4(req.params.id);
        } catch (error) {
          res.status(404).json({
            error: 'Workspace not found',
          });
          return;
        }
        
        const { additionalMinutes } = req.body;

        if (!additionalMinutes || typeof additionalMinutes !== 'number') {
          res.status(400).json({
            error: 'Missing or invalid additionalMinutes',
          });
          return;
        }

        await this.workspaceManager.extendWorkspace(workspaceId, additionalMinutes);

        const workspace = await this.workspaceManager.getWorkspace(workspaceId);

        if (!workspace) {
          res.status(404).json({
            error: 'Workspace not found',
          });
          return;
        }

        res.json({
          id: workspace.id,
          expiresAt: workspace.expiresAt,
          status: workspace.status,
        });
      } catch (error) {
        console.error('Error extending workspace:', error);
        const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
        res.status(statusCode).json({
          error: error instanceof Error ? error.message : 'Failed to extend workspace',
        });
      }
    });

    // DELETE /workspaces/:id - Revoke workspace
    this.app.delete('/workspaces/:id', async (req: Request, res: Response) => {
      try {
        let workspaceId: GuidV4;
        try {
          workspaceId = new GuidV4(req.params.id);
        } catch (error) {
          res.status(404).json({
            error: 'Workspace not found',
          });
          return;
        }

        await this.workspaceManager.revokeWorkspace(workspaceId);

        res.json({
          message: 'Workspace revoked successfully',
        });
      } catch (error) {
        console.error('Error revoking workspace:', error);
        const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
        res.status(statusCode).json({
          error: error instanceof Error ? error.message : 'Failed to revoke workspace',
        });
      }
    });

    // GET /health - Health check
    this.app.get('/health', (req: Request, res: Response) => {
      const workspaceCount = this.workspaceManager.getWorkspaceCount();
      const participantCount = this.participantManager.getTotalParticipantCount();
      
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        version: this.config.protocolVersion,
        workspaces: workspaceCount,
        participants: participantCount,
      });
    });

    // GET /metrics - Prometheus metrics
    this.app.get('/metrics', async (req: Request, res: Response) => {
      try {
        res.set('Content-Type', this.metricsService.getRegistry().contentType);
        const metrics = await this.metricsService.getMetrics();
        res.send(metrics);
      } catch (error) {
        console.error('Error getting metrics:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to get metrics',
        });
      }
    });
  }

  /**
   * Set up WebSocket server for real-time operation routing.
   * 
   * Handles:
   * - HTTP upgrade requests
   * - WebSocket connection establishment
   * - Connection delegation to handleConnection
   * 
   * @private
   */
  private setupWebSocket(): void {
    // Handle upgrade requests
    this.httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });

    // Handle WebSocket connections
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });
  }

  /**
   * Handle new WebSocket connection from a participant.
   * 
   * Connection flow:
   * 1. Generate and send authentication challenge
   * 2. Wait for handshake with proof
   * 3. Authenticate participant using zero-knowledge proof
   * 4. Route operations between participants
   * 5. Handle disconnection and cleanup
   * 
   * @private
   * @param {WebSocket} ws - WebSocket connection
   * @param {IncomingMessage} req - HTTP request that initiated the connection
   * 
   * @example
   * ```typescript
   * // Called automatically when client connects via WebSocket
   * // Client receives challenge and must respond with handshake
   * ```
   */
  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    let session: ParticipantSession | null = null;
    let workspaceId: WorkspaceId | null = null;

    // Generate challenge for authentication
    const challengeId = uuidv4();
    const challenge = this.participantAuth.generateChallenge();
    this.challenges.set(challengeId, { challenge, timestamp: Date.now() });

    // Clean up expired challenges
    this.cleanupExpiredChallenges();

    // Send challenge to client
    const challengeMsg: ChallengeMessage = {
      challengeId,
      challenge: Buffer.from(challenge).toString('base64'),
    };
    this.sendMessage(ws, 'challenge', challengeMsg);

    // Set up message handler
    ws.on('message', async (data: Buffer) => {
      try {
        const envelope: MessageEnvelope = JSON.parse(data.toString());

        // Route message based on type
        switch (envelope.type) {
          case 'handshake': {
            await this.handleHandshake(ws, envelope, challengeId, challenge);
            // Store session info after successful handshake
            // Need to reconstruct IDs from the payload
            const handshakePayload = envelope.payload as HandshakeMessage;
            const reconstructGuidV4 = (value: any): GuidV4 => {
              if (typeof value === 'string') {
                return new GuidV4(value);
              } else if (value && value._value && value._value.data) {
                return GuidV4.fromBuffer(Buffer.from(value._value.data));
              } else {
                throw new Error('Invalid GuidV4 format');
              }
            };
            
            workspaceId = reconstructGuidV4(handshakePayload.workspaceId);
            const pId = reconstructGuidV4(handshakePayload.participantId);
            session = this.participantManager.getSession(workspaceId, pId);
            break;
          }

          case 'operation': {
            if (!session) {
              this.sendError(ws, 'AUTH_FAILED', 'Not authenticated');
              return;
            }
            await this.handleOperation(ws, envelope, session);
            break;
          }

          case 'sync_request': {
            if (!session) {
              this.sendError(ws, 'AUTH_FAILED', 'Not authenticated');
              return;
            }
            await this.handleSyncRequest(ws, envelope, session);
            break;
          }

          case 'ping': {
            this.handlePing(ws, envelope);
            break;
          }

          default:
            console.warn('Unknown message type:', envelope.type);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        this.sendError(
          ws,
          'INVALID_OPERATION',
          error instanceof Error ? error.message : 'Invalid message'
        );
      }
    });

    // Handle connection close
    ws.on('close', () => {
      if (session && workspaceId) {
        this.participantManager.removeParticipant(workspaceId, session.participantId);
        this.metricsService.decrementParticipantCount();
      }
      this.challenges.delete(challengeId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  /**
   * Handle handshake message from participant.
   * 
   * Validates:
   * - Protocol version compatibility
   * - Workspace existence and active status
   * - Participant limit not exceeded
   * - Zero-knowledge proof of identity
   * 
   * On success:
   * - Creates participant session
   * - Sends handshake acknowledgment
   * - Enables operation routing
   * 
   * @private
   * @param {WebSocket} ws - WebSocket connection
   * @param {MessageEnvelope} envelope - Message envelope containing handshake
   * @param {string} challengeId - Challenge ID for this connection
   * @param {Buffer} challenge - Challenge bytes that were sent to client
   * @throws {Error} If authentication fails or workspace is invalid
   * 
   * @example
   * ```typescript
   * // Called when client sends handshake message
   * // Verifies proof and establishes authenticated session
   * ```
   */
  private async handleHandshake(
    ws: WebSocket,
    envelope: MessageEnvelope,
    challengeId: string,
    challenge: Buffer
  ): Promise<void> {
    try {
      const handshake = envelope.payload as HandshakeMessage;
      
      // Helper to reconstruct Buffer from serialized format
      const reconstructBuffer = (value: any): Buffer => {
        if (Buffer.isBuffer(value)) {
          return value;
        } else if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
          return Buffer.from(value.data);
        } else if (value instanceof Uint8Array) {
          return Buffer.from(value);
        } else {
          throw new Error('Invalid Buffer format');
        }
      };
      
      // Reconstruct GuidV4 instances from serialized data
      // When sent over WebSocket, GuidV4 objects are serialized to plain objects
      // Use asHex to get a simple string representation
      const reconstructGuidV4 = (value: any): GuidV4 => {
        if (typeof value === 'string') {
          return new GuidV4(value);
        } else if (value && value._value && value._value.data) {
          // Reconstruct from serialized Buffer format
          return GuidV4.fromBuffer(Buffer.from(value._value.data));
        } else {
          throw new Error('Invalid GuidV4 format');
        }
      };
      
      const workspaceId = reconstructGuidV4(handshake.workspaceId);
      const participantId = reconstructGuidV4(handshake.participantId);
      const publicKey = reconstructBuffer(handshake.publicKey);
      const proofSignature = reconstructBuffer(handshake.proof.signature);

      // Validate protocol version
      if (handshake.protocolVersion !== this.config.protocolVersion) {
        this.sendError(
          ws,
          'AUTH_FAILED',
          `Protocol version mismatch. Server: ${this.config.protocolVersion}, Client: ${handshake.protocolVersion}`
        );
        ws.close();
        return;
      }

      // Verify workspace exists and is active
      const workspace = await this.workspaceManager.getWorkspace(workspaceId);
      if (!workspace) {
        this.sendError(ws, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
        ws.close();
        return;
      }

      if (this.workspaceManager.isWorkspaceExpired(workspace)) {
        this.sendError(ws, 'WORKSPACE_EXPIRED', 'Workspace has expired');
        ws.close();
        return;
      }

      // Check participant limit
      const currentParticipantCount = this.participantManager.getWorkspaceParticipants(workspaceId).length;
      const participantLimitResult = this.rateLimiter.checkParticipantLimit(
        workspaceId,
        currentParticipantCount
      );
      if (!participantLimitResult.allowed) {
        this.sendError(ws, 'RATE_LIMIT_EXCEEDED', participantLimitResult.reason || 'Participant limit exceeded');
        ws.close();
        return;
      }

      // Authenticate participant
      // Create a modified handshake with reconstructed IDs and Buffers
      const handshakeWithReconstructed: HandshakeMessage = {
        protocolVersion: handshake.protocolVersion,
        workspaceId,
        participantId,
        publicKey,
        proof: {
          signature: proofSignature,
          timestamp: handshake.proof.timestamp,
        },
      };
      
      const session = await this.participantManager.authenticateParticipant(
        workspaceId,
        handshakeWithReconstructed,
        challenge
      );

      // Store WebSocket in session
      session.websocket = ws;

      // Update metrics
      this.metricsService.incrementParticipantCount();

      // Send handshake acknowledgment
      const ack: HandshakeAckMessage = {
        success: true,
        currentKeyId: 'key-0', // TODO: Get from temporal key manager
        encryptedMetadata: workspace.encryptedMetadata,
        serverTime: Date.now(),
      };

      this.sendMessage(ws, 'handshake_ack', ack);

      // Clean up challenge
      this.challenges.delete(challengeId);
    } catch (error) {
      console.error('Handshake error:', error instanceof Error ? error.message : String(error));
      this.sendError(
        ws,
        'AUTH_FAILED',
        error instanceof Error ? error.message : 'Authentication failed'
      );
      ws.close();
    }
  }

  /**
   * Handle operation message from participant.
   * 
   * Processing:
   * 1. Check rate limits
   * 2. Reconstruct operation from serialized format
   * 3. Route to all other workspace participants
   * 4. Send acknowledgment to sender
   * 5. Update metrics
   * 
   * The server never decrypts operation content, maintaining zero-knowledge property.
   * 
   * @private
   * @param {WebSocket} ws - WebSocket connection
   * @param {MessageEnvelope} envelope - Message envelope containing operation
   * @param {ParticipantSession} session - Authenticated participant session
   * 
   * @example
   * ```typescript
   * // Called when authenticated participant sends an operation
   * // Operation is routed to other participants without decryption
   * ```
   */
  private async handleOperation(
    ws: WebSocket,
    envelope: MessageEnvelope,
    session: ParticipantSession
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Check operation rate limit
      const rateLimitResult = this.rateLimiter.checkOperationRate(
        session.workspaceId,
        session.participantId
      );
      if (!rateLimitResult.allowed) {
        this.sendError(
          ws,
          'RATE_LIMIT_EXCEEDED',
          rateLimitResult.reason || 'Rate limit exceeded',
          { retryAfter: rateLimitResult.retryAfter }
        );
        return;
      }

      const message = envelope.payload as OperationMessage;

      // Helper to reconstruct Buffer from serialized format
      const reconstructBuffer = (value: any): Buffer => {
        if (Buffer.isBuffer(value)) {
          return value;
        } else if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
          return Buffer.from(value.data);
        } else if (value instanceof Uint8Array) {
          return Buffer.from(value);
        } else {
          throw new Error('Invalid Buffer format');
        }
      };

      // Reconstruct GuidV4 from serialized format
      const reconstructGuidV4 = (value: any): GuidV4 => {
        if (typeof value === 'string') {
          return new GuidV4(value);
        } else if (value && value._value && value._value.data) {
          return GuidV4.fromBuffer(Buffer.from(value._value.data));
        } else {
          throw new Error('Invalid GuidV4 format');
        }
      };

      // Reconstruct the operation with proper types
      const reconstructedOperation: EncryptedOperation = {
        id: reconstructGuidV4(message.operation.id),
        workspaceId: reconstructGuidV4(message.operation.workspaceId),
        participantId: reconstructGuidV4(message.operation.participantId),
        timestamp: message.operation.timestamp,
        position: message.operation.position,
        operationType: message.operation.operationType,
        encryptedContent: reconstructBuffer(message.operation.encryptedContent),
        signature: reconstructBuffer(message.operation.signature),
      };

      // Record operation for rate limiting
      this.rateLimiter.recordOperation(session.workspaceId, session.participantId);

      // Route operation to all participants
      await this.operationRouter.routeOperation(
        session.workspaceId,
        reconstructedOperation,
        session.participantId
      );

      // Send acknowledgment with the original operation ID
      const ack: OperationAckMessage = {
        operationId: reconstructedOperation.id,
        serverTimestamp: Date.now(),
      };

      this.sendMessage(ws, 'operation_ack', ack);

      // Update last activity
      session.lastActivity = Date.now();

      // Record metrics
      this.metricsService.recordOperation();
      const latency = Date.now() - startTime;
      this.metricsService.recordOperationLatency(latency);
    } catch (error) {
      console.error('Operation error:', error);
      this.sendError(
        ws,
        'INVALID_OPERATION',
        error instanceof Error ? error.message : 'Failed to process operation'
      );
      
      // Still record latency for failed operations
      const latency = Date.now() - startTime;
      this.metricsService.recordOperationLatency(latency);
    }
  }

  /**
   * Handle sync request message from participant.
   * 
   * Returns buffered operations that the participant missed while offline.
   * Operations are filtered by timestamp to only include new operations.
   * 
   * @private
   * @param {WebSocket} ws - WebSocket connection
   * @param {MessageEnvelope} envelope - Message envelope containing sync request
   * @param {ParticipantSession} session - Authenticated participant session
   * 
   * @example
   * ```typescript
   * // Called when participant reconnects and requests missed operations
   * // Returns operations since last known timestamp
   * ```
   */
  private async handleSyncRequest(
    ws: WebSocket,
    envelope: MessageEnvelope,
    session: ParticipantSession
  ): Promise<void> {
    try {
      const message = envelope.payload as SyncRequestMessage;

      // Get buffered operations for this participant
      const operations = this.operationRouter.getBufferedOperations(
        session.workspaceId,
        session.participantId
      );

      // Filter operations by timestamp
      const filteredOps = operations.filter(
        (op) => op.timestamp > message.fromTimestamp
      );

      // Send sync response
      const response: SyncResponseMessage = {
        operations: filteredOps,
        currentState: Buffer.alloc(0), // TODO: Get current CRDT state
      };

      this.sendMessage(ws, 'sync_response', response);
    } catch (error) {
      console.error('Sync error:', error);
      this.sendError(
        ws,
        'INVALID_OPERATION',
        error instanceof Error ? error.message : 'Failed to sync'
      );
    }
  }

  /**
   * Handle ping message for connection keep-alive.
   * 
   * @private
   * @param {WebSocket} ws - WebSocket connection
   * @param {MessageEnvelope} _envelope - Message envelope (unused)
   */
  private handlePing(ws: WebSocket, _envelope: MessageEnvelope): void {
    this.sendMessage(ws, 'pong', { timestamp: Date.now() });
  }

  /**
   * Send message to WebSocket client.
   * 
   * Wraps payload in MessageEnvelope with type, timestamp, and message ID.
   * 
   * @private
   * @param {WebSocket} ws - WebSocket connection
   * @param {MessageType} type - Message type
   * @param {unknown} payload - Message payload
   */
  private sendMessage(ws: WebSocket, type: MessageType, payload: unknown): void {
    const envelope: MessageEnvelope = {
      type,
      payload,
      timestamp: Date.now(),
      messageId: uuidv4(),
    };

    ws.send(JSON.stringify(envelope));
  }

  /**
   * Send error message to WebSocket client.
   * 
   * @private
   * @param {WebSocket} ws - WebSocket connection
   * @param {ErrorCode} code - Error code
   * @param {string} message - Error message
   * @param {unknown} [details] - Optional error details
   */
  private sendError(ws: WebSocket, code: ErrorCode, message: string, details?: unknown): void {
    const error: ErrorMessage = {
      code,
      message,
      details,
    };

    this.sendMessage(ws, 'error', error);
  }

  /**
   * Clean up expired authentication challenges.
   * 
   * Removes challenges older than CHALLENGE_TIMEOUT (60 seconds).
   * 
   * @private
   */
  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [id, { timestamp }] of this.challenges.entries()) {
      if (now - timestamp > this.CHALLENGE_TIMEOUT) {
        this.challenges.delete(id);
      }
    }
  }

  /**
   * Start the EECP server.
   * 
   * Starts:
   * - Temporal cleanup service
   * - HTTP server
   * - WebSocket server
   * 
   * @returns {Promise<void>} Resolves when server is listening
   * 
   * @example
   * ```typescript
   * await server.start();
   * console.log('Server started');
   * ```
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      // Start cleanup service
      this.cleanupService.start();

      // Start HTTP server
      this.httpServer.listen(this.config.port, this.config.host, () => {
        console.log(`EECP Server listening on http://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the EECP server gracefully.
   * 
   * Stops:
   * - Temporal cleanup service
   * - Rate limiter
   * - All WebSocket connections
   * - WebSocket server
   * - HTTP server
   * 
   * @returns {Promise<void>} Resolves when server is fully stopped
   * 
   * @example
   * ```typescript
   * await server.stop();
   * console.log('Server stopped');
   * ```
   */
  async stop(): Promise<void> {
    // Stop cleanup service
    this.cleanupService.stop();

    // Stop rate limiter
    this.rateLimiter.stop();

    // Close all WebSocket connections
    this.wss.clients.forEach((client) => {
      client.close();
    });

    // Close WebSocket server
    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
    });

    // Close HTTP server
    await new Promise<void>((resolve) => {
      this.httpServer.close(() => resolve());
    });
  }

  /**
   * Get server configuration.
   * 
   * @returns {EECPServerConfig} Copy of server configuration
   * 
   * @example
   * ```typescript
   * const config = server.getConfig();
   * console.log(`Server on port ${config.port}`);
   * ```
   */
  getConfig(): EECPServerConfig {
    return { ...this.config };
  }
}
