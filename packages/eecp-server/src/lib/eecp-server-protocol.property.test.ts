/**
 * Property-based tests for EECP Server WebSocket Protocol
 * Tests protocol handshake, message envelope format, and operation acknowledgment
 */

import * as fc from 'fast-check';
import { EECPServer } from './eecp-server';
import { WorkspaceManager } from './workspace-manager';
import { ParticipantManager } from './participant-manager';
import { OperationRouter } from './operation-router';
import { TemporalCleanupService } from './temporal-cleanup-service';
import { RateLimiter } from './rate-limiter';
import { ParticipantAuth, eciesService } from '@digitaldefiance-eecp/eecp-crypto';
import { WorkspaceConfig } from '@digitaldefiance-eecp/eecp-protocol';
import {
  MessageEnvelope,
  HandshakeMessage,
  HandshakeAckMessage,
  OperationMessage,
  OperationAckMessage,
  ZeroKnowledgeProof,
} from '@digitaldefiance-eecp/eecp-protocol';
import WebSocket from 'ws';
import { Member, MemberType, EmailString, GuidV4 } from '@digitaldefiance/ecies-lib';

describe('EECP Server Protocol Property Tests', () => {
  let server: EECPServer;
  let workspaceManager: WorkspaceManager;
  let participantManager: ParticipantManager;
  let operationRouter: OperationRouter;
  let cleanupService: TemporalCleanupService;
  let participantAuth: ParticipantAuth;
  let rateLimiter: RateLimiter;
  const port = 3002; // Use different port for property tests
  const wsUrl = `ws://localhost:${port}`;

  /**
   * Helper function to generate a test Member with proper keys
   */
  async function generateTestMember(name: string, email: string): Promise<Member> {
    const result = await Member.newMember(
      eciesService,
      MemberType.User,
      name,
      new EmailString(email)
    );
    return result.member as Member;
  }

  beforeAll(async () => {
    // Initialize dependencies
    participantAuth = new ParticipantAuth();
    workspaceManager = new WorkspaceManager();
    participantManager = new ParticipantManager(participantAuth);
    operationRouter = new OperationRouter(participantManager, workspaceManager);
    cleanupService = new TemporalCleanupService(workspaceManager, operationRouter);
    rateLimiter = new RateLimiter();

    // Create server
    server = new EECPServer(
      workspaceManager,
      participantManager,
      operationRouter,
      cleanupService,
      participantAuth,
      rateLimiter,
      { port, host: 'localhost', protocolVersion: '1.0.0' }
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

  /**
   * Property 37: Protocol Version Handshake
   * For any client connection, the system must perform a handshake with protocol version negotiation
   * before allowing workspace operations.
   * Validates: Requirements 11.1
   */
  describe('Feature: eecp-full-system, Property 37: Protocol Version Handshake', () => {
    it('should perform protocol version negotiation for any connection', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('1.0.0', '1.0.1', '0.9.0', '2.0.0'), // Protocol versions
          async (protocolVersion) => {
            // Generate GuidV4 IDs
            const workspaceId = GuidV4.new();
            const member = await generateTestMember('Test User', 'test@example.com');
            const participantId = GuidV4.fromBuffer(member.id);
            
            // Create a workspace first
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: workspaceId,
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

            await workspaceManager.createWorkspace(config, Buffer.from('test-key'));

            // Connect via WebSocket
            const ws = new WebSocket(wsUrl);

            const handshakeResult = await new Promise<{
              success: boolean;
              versionMatch: boolean;
            }>((resolve) => {
              ws.on('message', (data: Buffer) => {
                const envelope: MessageEnvelope = JSON.parse(data.toString());

                if (envelope.type === 'challenge') {
                  // Receive challenge from server
                  const challengeMsg = envelope.payload as { challengeId: string; challenge: string };
                  const challenge = Buffer.from(challengeMsg.challenge, 'base64');

                  // Generate authentication proof using server's challenge
                  const proof: ZeroKnowledgeProof = participantAuth.generateProof(
                    participantId,
                    member,
                    challenge
                  );

                  // Send handshake
                  const handshake: HandshakeMessage = {
                    protocolVersion,
                    workspaceId,
                    participantId,
                    publicKey: Buffer.from(member.publicKey),
                    proof,
                  };

                  const handshakeEnvelope: MessageEnvelope = {
                    type: 'handshake',
                    payload: handshake,
                    timestamp: Date.now(),
                    messageId: 'test-message-id',
                  };

                  ws.send(JSON.stringify(handshakeEnvelope));
                } else if (envelope.type === 'handshake_ack') {
                  const ack = envelope.payload as HandshakeAckMessage;
                  resolve({
                    success: ack.success,
                    versionMatch: protocolVersion === '1.0.0',
                  });
                  ws.close();
                } else if (envelope.type === 'error') {
                  resolve({
                    success: false,
                    versionMatch: protocolVersion === '1.0.0',
                  });
                  ws.close();
                }
              });

              // Timeout after 2 seconds
              setTimeout(() => {
                resolve({ success: false, versionMatch: false });
                ws.close();
              }, 2000);
            });

            // Clean up member
            member.dispose();

            // Property: Handshake succeeds only when protocol versions match
            if (handshakeResult.versionMatch) {
              expect(handshakeResult.success).toBe(true);
            } else {
              expect(handshakeResult.success).toBe(false);
            }
          }
        ),
        { numRuns: 10 } // Reduced runs for WebSocket tests
      );
    }, 30000); // Increased timeout for WebSocket tests
  });

  /**
   * Property 38: Structured Message Envelope
   * For any message sent over WebSocket, the message must follow the structured envelope format
   * with message type, payload, timestamp, and message ID.
   * Validates: Requirements 11.2
   */
  describe('Feature: eecp-full-system, Property 38: Structured Message Envelope', () => {
    it('should use structured envelope format for all messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // Dummy arbitrary since we generate IDs inside
          async () => {
            // Generate GuidV4 IDs
            const workspaceId = GuidV4.new();
            const member = await generateTestMember('Test User', 'test@example.com');
            const participantId = GuidV4.fromBuffer(member.id);
            
            // Create a workspace
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: workspaceId,
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

            await workspaceManager.createWorkspace(config, Buffer.from('test-key'));

            // Connect via WebSocket
            const ws = new WebSocket(wsUrl);

            const envelopeValid = await new Promise<boolean>((resolve) => {
              ws.on('message', (data: Buffer) => {
                const envelope: MessageEnvelope = JSON.parse(data.toString());

                if (envelope.type === 'challenge') {
                  // Receive challenge from server
                  const challengeMsg = envelope.payload as { challengeId: string; challenge: string };
                  const challenge = Buffer.from(challengeMsg.challenge, 'base64');

                  // Generate authentication proof using server's challenge
                  const proof: ZeroKnowledgeProof = participantAuth.generateProof(
                    participantId,
                    member,
                    challenge
                  );

                  // Send handshake
                  const handshake: HandshakeMessage = {
                    protocolVersion: '1.0.0',
                    workspaceId,
                    participantId,
                    publicKey: Buffer.from(member.publicKey),
                    proof,
                  };

                  const handshakeEnvelope: MessageEnvelope = {
                    type: 'handshake',
                    payload: handshake,
                    timestamp: Date.now(),
                    messageId: 'test-message-id',
                  };

                  ws.send(JSON.stringify(handshakeEnvelope));
                } else {
                  // Verify envelope structure for any message
                  const hasType = typeof envelope.type === 'string';
                  const hasPayload = envelope.payload !== undefined;
                  const hasTimestamp = typeof envelope.timestamp === 'number';
                  const hasMessageId = typeof envelope.messageId === 'string';

                  resolve(hasType && hasPayload && hasTimestamp && hasMessageId);
                  ws.close();
                }
              });

              // Timeout after 2 seconds
              setTimeout(() => {
                resolve(false);
                ws.close();
              }, 2000);
            });

            // Clean up member
            member.dispose();

            // Property: All messages must have structured envelope format
            expect(envelopeValid).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });

  /**
   * Property 39: Operation Acknowledgment
   * For any operation broadcast by the server, the server must send an acknowledgment message
   * to the sender with the operation ID and server timestamp.
   * Validates: Requirements 11.3
   */
  describe('Feature: eecp-full-system, Property 39: Operation Acknowledgment', () => {
    it('should send acknowledgment for any operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1000 }), // Position
          async (position) => {
            // Generate GuidV4 IDs
            const workspaceId = GuidV4.new();
            const member = await generateTestMember('Test User', 'test@example.com');
            const participantId = GuidV4.fromBuffer(member.id);
            const operationId = GuidV4.new();
            
            // Create a workspace
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: workspaceId,
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

            await workspaceManager.createWorkspace(config, Buffer.from('test-key'));

            // Connect via WebSocket
            const ws = new WebSocket(wsUrl);

            const ackReceived = await new Promise<{
              received: boolean;
              operationIdMatches: boolean;
              hasTimestamp: boolean;
            }>((resolve) => {
              let authenticated = false;

              ws.on('message', (data: Buffer) => {
                const envelope: MessageEnvelope = JSON.parse(data.toString());

                if (envelope.type === 'challenge') {
                  // Receive challenge from server
                  const challengeMsg = envelope.payload as { challengeId: string; challenge: string };
                  const challenge = Buffer.from(challengeMsg.challenge, 'base64');

                  // Generate authentication proof using server's challenge
                  const proof: ZeroKnowledgeProof = participantAuth.generateProof(
                    participantId,
                    member,
                    challenge
                  );

                  // Send handshake
                  const handshake: HandshakeMessage = {
                    protocolVersion: '1.0.0',
                    workspaceId,
                    participantId,
                    publicKey: Buffer.from(member.publicKey),
                    proof,
                  };

                  const handshakeEnvelope: MessageEnvelope = {
                    type: 'handshake',
                    payload: handshake,
                    timestamp: Date.now(),
                    messageId: 'handshake-msg',
                  };

                  ws.send(JSON.stringify(handshakeEnvelope));
                } else if (envelope.type === 'handshake_ack') {
                  authenticated = true;

                  // Send operation after authentication
                  const operation: OperationMessage = {
                    operation: {
                      id: operationId,
                      workspaceId,
                      participantId,
                      timestamp: Date.now(),
                      position,
                      operationType: 'insert',
                      encryptedContent: Buffer.from('encrypted-content'),
                      signature: Buffer.from('signature'),
                    },
                  };

                  const opEnvelope: MessageEnvelope = {
                    type: 'operation',
                    payload: operation,
                    timestamp: Date.now(),
                    messageId: 'operation-msg',
                  };

                  ws.send(JSON.stringify(opEnvelope));
                } else if (envelope.type === 'operation_ack' && authenticated) {
                  const ack = envelope.payload as OperationAckMessage;

                  // Reconstruct GuidV4 from serialized acknowledgment
                  const reconstructGuidV4 = (value: any): GuidV4 => {
                    if (typeof value === 'string') {
                      return new GuidV4(value);
                    } else if (value && value._value && value._value.data) {
                      return GuidV4.fromBuffer(Buffer.from(value._value.data));
                    } else {
                      throw new Error('Invalid GuidV4 format');
                    }
                  };

                  const ackOperationId = reconstructGuidV4(ack.operationId);
                  
                  // Compare GuidV4 IDs as hex strings
                  const operationIdStr = operationId.asFullHexGuid;
                  const ackIdStr = ackOperationId.asFullHexGuid;

                  resolve({
                    received: true,
                    operationIdMatches: ackIdStr === operationIdStr,
                    hasTimestamp: typeof ack.serverTimestamp === 'number',
                  });
                  
                  ws.close();
                }
              });

              // Timeout after 2 seconds
              setTimeout(() => {
                resolve({
                  received: false,
                  operationIdMatches: false,
                  hasTimestamp: false,
                });
                
                ws.close();
              }, 2000);
            });

            // Clean up member
            member.dispose();

            // Property: Acknowledgment must be received with matching operation ID and timestamp
            expect(ackReceived.received).toBe(true);
            expect(ackReceived.operationIdMatches).toBe(true);
            expect(ackReceived.hasTimestamp).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);
  });
});
