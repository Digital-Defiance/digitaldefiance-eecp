/**
 * Property-based tests for OperationRouter
 * Feature: eecp-full-system
 */

import * as fc from 'fast-check';
import { Member, GuidV4, MemberType, EmailString, ECIESService } from '@digitaldefiance/ecies-lib';
import { OperationRouter } from './operation-router.js';
import { ParticipantManager } from './participant-manager.js';
import { WorkspaceManager } from './workspace-manager.js';
import { ParticipantAuth, eciesService } from '@digitaldefiance-eecp/eecp-crypto';
import {
  WorkspaceConfig,
  EncryptedOperation,
  ParticipantId,
} from '@digitaldefiance-eecp/eecp-protocol';

/**
 * Helper function to create a test member with required parameters
 */
async function createTestMember(): Promise<Member> {
  const result = await Member.newMember(
    eciesService,
    MemberType.User,
    'Test User',
    new EmailString('test@example.com')
  );
  return result.member as Member;
}

/**
 * Helper function to generate a valid public key for testing
 */
function generateValidPublicKey(eciesService: ECIESService): Buffer {
  const member = Member.newMember(
    eciesService,
    MemberType.User,
    'Creator',
    new EmailString('creator@example.com')
  );
  const publicKey = Buffer.from(member.member.publicKey);
  member.member.dispose();
  return publicKey;
}

describe('OperationRouter Property Tests', () => {
  let router: OperationRouter;
  let participantManager: ParticipantManager;
  let workspaceManager: WorkspaceManager;
  let testEciesService: ECIESService;

  beforeEach(() => {
    const auth = new ParticipantAuth();
    participantManager = new ParticipantManager(auth);
    testEciesService = new ECIESService();
    workspaceManager = new WorkspaceManager(testEciesService);
    router = new OperationRouter(participantManager, workspaceManager);
  });

  afterEach(() => {
    workspaceManager.cleanup();
  });

  /**
   * Feature: eecp-full-system, Property 17: Server Zero-Knowledge Validation
   * Validates: Requirements 4.4, 6.1, 6.2
   * 
   * For any operation received by the server, the server must validate the signature
   * and workspace membership without decrypting the content payload.
   */
  test('Property 17: Server Zero-Knowledge Validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 120 }), // Workspace duration (5-120 minutes)
        fc.integer({ min: 1, max: 10 }), // Number of operations
        fc.array(fc.uint8Array({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 10 }), // Encrypted content
        async (durationMinutes, numOperations, encryptedContents) => {
          const auth = new ParticipantAuth();
          const participantManager = new ParticipantManager(auth);
          const testEciesService = new ECIESService();
          const workspaceManager = new WorkspaceManager(testEciesService);
          const router = new OperationRouter(participantManager, workspaceManager);

          const members: Member[] = [];

          try {
            // Create workspace
            const now = Date.now();
            const workspaceId = GuidV4.new();
            const config: WorkspaceConfig = {
              id: workspaceId,
              createdAt: now,
              expiresAt: now + durationMinutes * 60 * 1000,
              timeWindow: {
                startTime: now,
                endTime: now + durationMinutes * 60 * 1000,
                rotationInterval: durationMinutes,
                gracePeriod: 60000,
              },
              maxParticipants: 50,
              allowExtension: false,
            };

            await workspaceManager.createWorkspace(config, generateValidPublicKey(testEciesService));

            // Create mock participants with websockets
            const participants: Array<{ id: ParticipantId; websocket: any }> = [];
            for (let i = 0; i < 3; i++) {
              const member = await createTestMember();
              members.push(member);
              const participantId = GuidV4.fromBuffer(member.id);
              
              const mockWebSocket = {
                send: jest.fn(),
                close: jest.fn(),
              };

              // Create mock session
              const challenge = auth.generateChallenge();
              const proof = auth.generateProof(participantId, member, challenge);

              const session = await participantManager.authenticateParticipant(
                workspaceId,
                {
                  protocolVersion: '1.0',
                  workspaceId,
                  participantId,
                  publicKey: member.publicKey,
                  proof,
                },
                challenge
              );

              session.websocket = mockWebSocket;
              participants.push({ id: participantId, websocket: mockWebSocket });
            }

            // Route operations
            for (let i = 0; i < Math.min(numOperations, encryptedContents.length); i++) {
              const operation: EncryptedOperation = {
                id: GuidV4.new(),
                workspaceId,
                participantId: participants[0].id,
                timestamp: now + i * 1000,
                position: i,
                operationType: 'insert',
                encryptedContent: Buffer.from(encryptedContents[i]),
                signature: Buffer.from('mock-signature'),
              };

              // Route operation - server should not decrypt content
              await router.routeOperation(workspaceId, operation, participants[0].id);

              // Verify operation was broadcast to other participants
              // Server should route without decrypting
              expect(participants[1].websocket.send).toHaveBeenCalled();
              expect(participants[2].websocket.send).toHaveBeenCalled();

              // Verify sender did not receive their own operation
              expect(participants[0].websocket.send).not.toHaveBeenCalled();

              // Verify the encrypted content was not modified
              const sentMessage1 = JSON.parse(
                participants[1].websocket.send.mock.calls[i][0]
              );
              expect(sentMessage1.payload.operation.encryptedContent).toBeDefined();
              // Content should be opaque to server (still encrypted)
              expect(Buffer.from(sentMessage1.payload.operation.encryptedContent.data)).toEqual(
                Buffer.from(encryptedContents[i])
              );
            }
          } finally {
            members.forEach(m => m.dispose());
            workspaceManager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // 30 second timeout

  /**
   * Feature: eecp-full-system, Property 18: Operation Broadcast
   * Validates: Requirements 4.5, 6.3
   * 
   * For any valid operation received by the server, the operation must be broadcast
   * to all connected participants in the workspace except the sender.
   */
  test('Property 18: Operation Broadcast', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 120 }), // Workspace duration (5-120 minutes)
        fc.integer({ min: 2, max: 10 }), // Number of participants
        fc.integer({ min: 1, max: 5 }), // Number of operations
        async (durationMinutes, numParticipants, numOperations) => {
          const auth = new ParticipantAuth();
          const participantManager = new ParticipantManager(auth);
          const testEciesService = new ECIESService();
          const workspaceManager = new WorkspaceManager(testEciesService);
          const router = new OperationRouter(participantManager, workspaceManager);

          const members: Member[] = [];

          try {
            // Create workspace
            const now = Date.now();
            const workspaceId = GuidV4.new();
            const config: WorkspaceConfig = {
              id: workspaceId,
              createdAt: now,
              expiresAt: now + durationMinutes * 60 * 1000,
              timeWindow: {
                startTime: now,
                endTime: now + durationMinutes * 60 * 1000,
                rotationInterval: durationMinutes,
                gracePeriod: 60000,
              },
              maxParticipants: 50,
              allowExtension: false,
            };

            await workspaceManager.createWorkspace(config, generateValidPublicKey(testEciesService));

            // Create participants
            const participants: Array<{ id: ParticipantId; websocket: any }> = [];
            for (let i = 0; i < numParticipants; i++) {
              const member = await createTestMember();
              members.push(member);
              const participantId = GuidV4.fromBuffer(member.id);
              
              const mockWebSocket = {
                send: jest.fn(),
                close: jest.fn(),
              };

              const challenge = auth.generateChallenge();
              const proof = auth.generateProof(participantId, member, challenge);

              const session = await participantManager.authenticateParticipant(
                workspaceId,
                {
                  protocolVersion: '1.0',
                  workspaceId,
                  participantId,
                  publicKey: member.publicKey,
                  proof,
                },
                challenge
              );

              session.websocket = mockWebSocket;
              participants.push({ id: participantId, websocket: mockWebSocket });
            }

            // Send operations from first participant
            const sender = participants[0];
            const receivers = participants.slice(1);

            for (let i = 0; i < numOperations; i++) {
              const operation: EncryptedOperation = {
                id: GuidV4.new(),
                workspaceId,
                participantId: sender.id,
                timestamp: now + i * 1000,
                position: i,
                operationType: 'insert',
                encryptedContent: Buffer.from(`content-${i}`),
                signature: Buffer.from('signature'),
              };

              await router.routeOperation(workspaceId, operation, sender.id);
            }

            // Verify sender did not receive their own operations
            expect(sender.websocket.send).not.toHaveBeenCalled();

            // Verify all receivers got all operations
            for (const receiver of receivers) {
              expect(receiver.websocket.send).toHaveBeenCalledTimes(numOperations);
            }
          } finally {
            members.forEach(m => m.dispose());
            workspaceManager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // 30 second timeout

  /**
   * Feature: eecp-full-system, Property 24: Operation Buffering for Offline Participants
   * Validates: Requirements 6.4
   * 
   * For any participant that is offline when an operation is broadcast, the server
   * must buffer the operation for up to the grace period duration.
   */
  test('Property 24: Operation Buffering for Offline Participants', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 120 }), // Workspace duration (5-120 minutes)
        fc.integer({ min: 1, max: 10 }), // Number of operations to buffer
        async (durationMinutes, numOperations) => {
          const auth = new ParticipantAuth();
          const participantManager = new ParticipantManager(auth);
          const testEciesService = new ECIESService();
          const workspaceManager = new WorkspaceManager(testEciesService);
          const router = new OperationRouter(participantManager, workspaceManager);

          const members: Member[] = [];

          try {
            // Create workspace
            const now = Date.now();
            const workspaceId = GuidV4.new();
            const config: WorkspaceConfig = {
              id: workspaceId,
              createdAt: now,
              expiresAt: now + durationMinutes * 60 * 1000,
              timeWindow: {
                startTime: now,
                endTime: now + durationMinutes * 60 * 1000,
                rotationInterval: durationMinutes,
                gracePeriod: 60000,
              },
              maxParticipants: 50,
              allowExtension: false,
            };

            await workspaceManager.createWorkspace(config, generateValidPublicKey(testEciesService));

            // Create online participant (sender)
            const senderMember = await createTestMember();
            members.push(senderMember);
            const senderId = GuidV4.fromBuffer(senderMember.id);
            const senderWebSocket = {
              send: jest.fn(),
              close: jest.fn(),
            };

            const challenge1 = auth.generateChallenge();
            const senderProof = auth.generateProof(senderId, senderMember, challenge1);

            const senderSession = await participantManager.authenticateParticipant(
              workspaceId,
              {
                protocolVersion: '1.0',
                workspaceId,
                participantId: senderId,
                publicKey: senderMember.publicKey,
                proof: senderProof,
              },
              challenge1
            );
            senderSession.websocket = senderWebSocket;

            // Create offline participant (no websocket)
            const offlineMember = await createTestMember();
            members.push(offlineMember);
            const offlineId = GuidV4.fromBuffer(offlineMember.id);
            const challenge2 = auth.generateChallenge();
            const offlineProof = auth.generateProof(offlineId, offlineMember, challenge2);

            const offlineSession = await participantManager.authenticateParticipant(
              workspaceId,
              {
                protocolVersion: '1.0',
                workspaceId,
                participantId: offlineId,
                publicKey: offlineMember.publicKey,
                proof: offlineProof,
              },
              challenge2
            );
            offlineSession.websocket = null; // Simulate offline

            // Send operations
            const operations: EncryptedOperation[] = [];
            for (let i = 0; i < numOperations; i++) {
              const operation: EncryptedOperation = {
                id: GuidV4.new(),
                workspaceId,
                participantId: senderId,
                timestamp: now + i * 1000,
                position: i,
                operationType: 'insert',
                encryptedContent: Buffer.from(`content-${i}`),
                signature: Buffer.from('signature'),
              };

              operations.push(operation);
              await router.routeOperation(workspaceId, operation, senderId);
            }

            // Verify operations were buffered for offline participant
            const buffered = router.getBufferedOperations(workspaceId, offlineId);
            expect(buffered).toHaveLength(numOperations);

            // Verify all operations were buffered in order
            for (let i = 0; i < numOperations; i++) {
              expect(buffered[i].id).toBe(operations[i].id);
              expect(buffered[i].timestamp).toBe(operations[i].timestamp);
            }

            // Verify buffer is cleared after retrieval
            const buffered2 = router.getBufferedOperations(workspaceId, offlineId);
            expect(buffered2).toHaveLength(0);
          } finally {
            members.forEach(m => m.dispose());
            workspaceManager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // 30 second timeout

  /**
   * Feature: eecp-full-system, Property 25: Buffer Expiration
   * Validates: Requirements 6.5
   * 
   * For any buffered operation older than the grace period, the server must discard
   * the operation.
   */
  test('Property 25: Buffer Expiration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 120 }), // Workspace duration (5-120 minutes)
        fc.integer({ min: 2, max: 10 }), // Number of operations
        fc.integer({ min: 30000, max: 120000 }), // Grace period (30s to 2min)
        async (durationMinutes, numOperations, gracePeriod) => {
          const auth = new ParticipantAuth();
          const participantManager = new ParticipantManager(auth);
          const testEciesService = new ECIESService();
          const workspaceManager = new WorkspaceManager(testEciesService);
          const router = new OperationRouter(participantManager, workspaceManager);

          const members: Member[] = [];

          try {
            // Create workspace
            const now = Date.now();
            const workspaceId = GuidV4.new();
            const config: WorkspaceConfig = {
              id: workspaceId,
              createdAt: now,
              expiresAt: now + durationMinutes * 60 * 1000,
              timeWindow: {
                startTime: now,
                endTime: now + durationMinutes * 60 * 1000,
                rotationInterval: durationMinutes,
                gracePeriod,
              },
              maxParticipants: 50,
              allowExtension: false,
            };

            await workspaceManager.createWorkspace(config, generateValidPublicKey(testEciesService));

            // Create offline participant
            const offlineMember = await createTestMember();
            members.push(offlineMember);
            const offlineId = GuidV4.fromBuffer(offlineMember.id);
            const challenge = auth.generateChallenge();
            const proof = auth.generateProof(offlineId, offlineMember, challenge);

            await participantManager.authenticateParticipant(
              workspaceId,
              {
                protocolVersion: '1.0',
                workspaceId,
                participantId: offlineId,
                publicKey: offlineMember.publicKey,
                proof,
              },
              challenge
            );

            // Buffer operations with different timestamps
            const oldOperations: EncryptedOperation[] = [];
            const recentOperations: EncryptedOperation[] = [];

            // Create old operations (beyond grace period)
            for (let i = 0; i < Math.floor(numOperations / 2); i++) {
              const operation: EncryptedOperation = {
                id: GuidV4.new(),
                workspaceId,
                participantId: GuidV4.new(),
                timestamp: now - gracePeriod - 10000 - i * 1000, // Older than grace period
                position: i,
                operationType: 'insert',
                encryptedContent: Buffer.from(`old-content-${i}`),
                signature: Buffer.from('signature'),
              };

              oldOperations.push(operation);
              router.bufferOperation(workspaceId, offlineId, operation);
            }

            // Create recent operations (within grace period)
            for (let i = 0; i < Math.ceil(numOperations / 2); i++) {
              const operation: EncryptedOperation = {
                id: GuidV4.new(),
                workspaceId,
                participantId: GuidV4.new(),
                timestamp: now - gracePeriod / 2 - i * 1000, // Within grace period
                position: i + Math.floor(numOperations / 2),
                operationType: 'insert',
                encryptedContent: Buffer.from(`recent-content-${i}`),
                signature: Buffer.from('signature'),
              };

              recentOperations.push(operation);
              router.bufferOperation(workspaceId, offlineId, operation);
            }

            // Clear expired buffers
            router.clearExpiredBuffers(now - gracePeriod);

            // Verify only recent operations remain
            const buffered = router.getBufferedOperations(workspaceId, offlineId);
            expect(buffered.length).toBe(recentOperations.length);

            // Verify all buffered operations are recent ones
            const bufferedIds = new Set(buffered.map(op => op.id.toString()));
            for (const recentOp of recentOperations) {
              expect(bufferedIds.has(recentOp.id.toString())).toBe(true);
            }

            // Verify old operations were discarded
            for (const oldOp of oldOperations) {
              expect(bufferedIds.has(oldOp.id.toString())).toBe(false);
            }
          } finally {
            members.forEach(m => m.dispose());
            workspaceManager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
