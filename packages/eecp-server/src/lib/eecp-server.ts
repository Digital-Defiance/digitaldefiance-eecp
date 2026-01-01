/**
 * EECP Server
 * 
 * Express server with WebSocket support for routing encrypted operations.
 * Implements REST API for workspace management and WebSocket protocol for real-time collaboration.
 */

import express, { Express, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkspaceConfig,
  WorkspaceId,
} from '@digitaldefiance-eecp/eecp-protocol';
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
} from '@digitaldefiance-eecp/eecp-protocol';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import { IWorkspaceManager } from './workspace-manager.js';
import { IParticipantManager, ParticipantSession } from './participant-manager.js';
import { IOperationRouter } from './operation-router.js';
import { ITemporalCleanupService } from './temporal-cleanup-service.js';
import { IParticipantAuth } from '@digitaldefiance-eecp/eecp-crypto';

/**
 * EECP Server configuration
 */
export interface EECPServerConfig {
  port: number;
  host: string;
  protocolVersion: string;
}

/**
 * EECP Server class
 * Manages HTTP REST API and WebSocket connections for EECP protocol
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
   * Set up Express middleware
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
   * Set up REST API routes
   */
  private setupRoutes(): void {
    // POST /workspaces - Create workspace
    this.app.post('/workspaces', async (req: Request, res: Response) => {
      try {
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

        // Convert public key from base64 if needed
        const publicKeyBuffer = Buffer.isBuffer(creatorPublicKey)
          ? creatorPublicKey
          : Buffer.from(creatorPublicKey, 'base64');

        // Create workspace
        const workspace = await this.workspaceManager.createWorkspace(
          config as WorkspaceConfig,
          publicKeyBuffer
        );

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
        const workspaceId = new GuidV4(req.params.id);

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
          encryptedMetadata: workspace.encryptedMetadata.toString('base64'),
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
        const workspaceId = new GuidV4(req.params.id);
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
        const workspaceId = new GuidV4(req.params.id);

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
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        version: this.config.protocolVersion,
      });
    });
  }

  /**
   * Set up WebSocket server
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
   * Handle WebSocket connection
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
      }
      this.challenges.delete(challengeId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  /**
   * Handle handshake message
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
   * Handle operation message
   */
  private async handleOperation(
    ws: WebSocket,
    envelope: MessageEnvelope,
    session: ParticipantSession
  ): Promise<void> {
    try {
      const message = envelope.payload as OperationMessage;

      // Route operation to all participants
      await this.operationRouter.routeOperation(
        session.workspaceId,
        message.operation,
        session.participantId
      );

      // Send acknowledgment
      const ack: OperationAckMessage = {
        operationId: message.operation.id,
        serverTimestamp: Date.now(),
      };

      this.sendMessage(ws, 'operation_ack', ack);

      // Update last activity
      session.lastActivity = Date.now();
    } catch (error) {
      console.error('Operation error:', error);
      this.sendError(
        ws,
        'INVALID_OPERATION',
        error instanceof Error ? error.message : 'Failed to process operation'
      );
    }
  }

  /**
   * Handle sync request message
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
   * Handle ping message
   */
  private handlePing(ws: WebSocket, _envelope: MessageEnvelope): void {
    this.sendMessage(ws, 'pong', { timestamp: Date.now() });
  }

  /**
   * Send message to WebSocket client
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
   * Send error message to WebSocket client
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
   * Clean up expired challenges
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
   * Start the server
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
   * Stop the server
   */
  async stop(): Promise<void> {
    // Stop cleanup service
    this.cleanupService.stop();

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
   * Get server configuration
   */
  getConfig(): EECPServerConfig {
    return { ...this.config };
  }
}
