/**
 * Property-Based Tests for Participant Manager
 * 
 * Tests Properties 12, 13, 14 for participant authentication and management
 */

import * as fc from 'fast-check';
import { Member, GuidV4, MemberType, EmailString } from '@digitaldefiance/ecies-lib';
import { ParticipantManager } from './participant-manager.js';
import { ParticipantAuth, eciesService } from '@digitaldefiance-eecp/eecp-crypto';
import { HandshakeMessage } from '@digitaldefiance-eecp/eecp-protocol';

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

describe('ParticipantManager Property Tests', () => {
  let manager: ParticipantManager;
  let auth: ParticipantAuth;

  beforeEach(() => {
    auth = new ParticipantAuth();
    manager = new ParticipantManager(auth);
  });

  /**
   * Property 12: Authentication Success Connection
   * 
   * For any successful authentication, a WebSocket connection must be
   * established for the participant.
   * 
   * This property tests that:
   * 1. Valid authentication creates a participant session
   * 2. The session can be retrieved by workspace and participant ID
   * 3. The session contains correct participant information
   * 
   * Validates: Requirements 3.4
   */
  test('Feature: eecp-full-system, Property 12: Authentication Success Connection', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random protocol versions
        fc.constantFrom('1.0.0', '1.0.1', '1.1.0'),
        async (protocolVersion) => {
          // Generate Member with GuidV4 ID
          const member = await createTestMember();
          const workspaceId = GuidV4.new();
          const participantId = GuidV4.fromBuffer(member.id);

          // Generate challenge
          const challenge = auth.generateChallenge();

          // Generate valid proof
          const proof = auth.generateProof(
            participantId,
            member,
            challenge
          );

          // Create handshake message
          const handshake: HandshakeMessage = {
            protocolVersion,
            workspaceId,
            participantId,
            publicKey: member.publicKey,
            proof,
          };

          // Authenticate participant
          const session = await manager.authenticateParticipant(
            workspaceId,
            handshake,
            challenge
          );

          // Property: Session must be created
          expect(session).toBeDefined();
          expect(session.participantId).toBe(participantId);
          expect(session.workspaceId).toBe(workspaceId);
          expect(Buffer.from(session.publicKey).equals(Buffer.from(member.publicKey))).toBe(true);

          // Property: Session must be retrievable
          const retrievedSession = manager.getSession(workspaceId, participantId);
          expect(retrievedSession).toBeDefined();
          expect(retrievedSession?.participantId).toBe(participantId);
          expect(retrievedSession?.workspaceId).toBe(workspaceId);

          // Property: Session must have timestamps
          expect(session.connectedAt).toBeGreaterThan(0);
          expect(session.connectedAt).toBeLessThanOrEqual(Date.now());
          expect(session.lastActivity).toBeGreaterThan(0);
          expect(session.lastActivity).toBeLessThanOrEqual(Date.now());

          // Property: Session must appear in workspace participants list
          const participants = manager.getWorkspaceParticipants(workspaceId);
          expect(participants).toHaveLength(1);
          expect(participants[0].participantId).toBe(participantId);

          // Cleanup
          member.dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13: Authentication Failure Rejection
   * 
   * For any failed authentication attempt, the server must reject the
   * connection and prevent workspace access.
   * 
   * This property tests that:
   * 1. Invalid proofs are rejected
   * 2. No session is created for failed authentication
   * 3. Failed authentication throws an error
   * 
   * Validates: Requirements 3.5
   */
  test('Feature: eecp-full-system, Property 13: Authentication Failure Rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('1.0.0', '1.0.1', '1.1.0'),
        async (protocolVersion) => {
          // Generate two different Members
          const member1 = await createTestMember();
          const member2 = await createTestMember();
          
          const workspaceId = GuidV4.new();
          const participantId = GuidV4.fromBuffer(member1.id);

          // Generate challenge
          const challenge = auth.generateChallenge();

          // Generate proof with member1's private key
          const proof = auth.generateProof(
            participantId,
            member1,
            challenge
          );

          // Create handshake with WRONG public key (member2)
          const handshake: HandshakeMessage = {
            protocolVersion,
            workspaceId,
            participantId,
            publicKey: member2.publicKey, // Wrong key!
            proof,
          };

          // Property: Authentication must fail
          await expect(
            manager.authenticateParticipant(workspaceId, handshake, challenge)
          ).rejects.toThrow('Authentication failed');

          // Property: No session should be created
          const session = manager.getSession(workspaceId, participantId);
          expect(session).toBeNull();

          // Property: Workspace should have no participants
          const participants = manager.getWorkspaceParticipants(workspaceId);
          expect(participants).toHaveLength(0);

          // Cleanup
          member1.dispose();
          member2.dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14: Participant Revocation
   * 
   * For any revoked participant, the server must close their connection
   * and prevent all future reconnection attempts.
   * 
   * This property tests that:
   * 1. Removing a participant deletes their session
   * 2. The session cannot be retrieved after removal
   * 3. The participant no longer appears in workspace participants list
   * 
   * Validates: Requirements 3.6
   */
  test('Feature: eecp-full-system, Property 14: Participant Revocation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('1.0.0', '1.0.1', '1.1.0'),
        async (protocolVersion) => {
          // Generate Member for participant
          const member = await createTestMember();
          const workspaceId = GuidV4.new();
          const participantId = GuidV4.fromBuffer(member.id);

          // Generate challenge and proof
          const challenge = auth.generateChallenge();
          const proof = auth.generateProof(
            participantId,
            member,
            challenge
          );

          // Create handshake message
          const handshake: HandshakeMessage = {
            protocolVersion,
            workspaceId,
            participantId,
            publicKey: member.publicKey,
            proof,
          };

          // Authenticate participant
          const session = await manager.authenticateParticipant(
            workspaceId,
            handshake,
            challenge
          );

          // Add mock websocket
          session.websocket = {
            close: jest.fn(),
          };

          // Verify session exists
          expect(manager.getSession(workspaceId, participantId)).toBeDefined();
          expect(manager.getWorkspaceParticipants(workspaceId)).toHaveLength(1);

          // Property: Remove participant
          manager.removeParticipant(workspaceId, participantId);

          // Property: Session must be deleted
          const removedSession = manager.getSession(workspaceId, participantId);
          expect(removedSession).toBeNull();

          // Property: Participant must not appear in workspace list
          const participants = manager.getWorkspaceParticipants(workspaceId);
          expect(participants).toHaveLength(0);

          // Property: WebSocket must be closed
          expect(session.websocket.close).toHaveBeenCalled();

          // Cleanup
          member.dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple Participants in Same Workspace
   * 
   * For any workspace with multiple participants, all participants must
   * be independently manageable and retrievable.
   */
  test('Property: Multiple participants can coexist in same workspace', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        async (participantCount) => {
          const workspaceId = GuidV4.new();
          const members: Member[] = [];
          const participantIds: GuidV4[] = [];

          // Create unique Members
          for (let i = 0; i < participantCount; i++) {
            const member = await createTestMember();
            members.push(member);
            participantIds.push(GuidV4.fromBuffer(member.id));
          }

          const sessions = [];

          // Authenticate all participants
          for (let i = 0; i < participantCount; i++) {
            const member = members[i];
            const participantId = participantIds[i];

            const challenge = auth.generateChallenge();
            const proof = auth.generateProof(
              participantId,
              member,
              challenge
            );

            const handshake: HandshakeMessage = {
              protocolVersion: '1.0.0',
              workspaceId,
              participantId,
              publicKey: member.publicKey,
              proof,
            };

            const session = await manager.authenticateParticipant(
              workspaceId,
              handshake,
              challenge
            );

            sessions.push(session);
          }

          // Property: All sessions must be retrievable
          for (const participantId of participantIds) {
            const session = manager.getSession(workspaceId, participantId);
            expect(session).toBeDefined();
            expect(session?.participantId).toBe(participantId);
          }

          // Property: Workspace must have all participants
          const participants = manager.getWorkspaceParticipants(workspaceId);
          expect(participants).toHaveLength(participantCount);

          // Property: All participant IDs must be present
          const retrievedIds = participants.map((p) => p.participantId.toString()).sort();
          const expectedIds = participantIds.map(id => id.toString()).sort();
          expect(retrievedIds).toEqual(expectedIds);

          // Cleanup
          members.forEach(m => m.dispose());
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Participant Isolation Between Workspaces
   * 
   * For any participant in multiple workspaces, sessions must be
   * isolated and independently manageable per workspace.
   */
  test('Property: Participants are isolated between workspaces', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (workspaceCount) => {
          // Generate unique workspace IDs
          const workspaceIds: GuidV4[] = [];
          for (let i = 0; i < workspaceCount; i++) {
            workspaceIds.push(GuidV4.new());
          }

          // Generate one Member for the participant
          const member = await createTestMember();
          const participantId = GuidV4.fromBuffer(member.id);

          // Authenticate participant in all workspaces
          for (const workspaceId of workspaceIds) {
            const challenge = auth.generateChallenge();
            const proof = auth.generateProof(
              participantId,
              member,
              challenge
            );

            const handshake: HandshakeMessage = {
              protocolVersion: '1.0.0',
              workspaceId,
              participantId,
              publicKey: member.publicKey,
              proof,
            };

            await manager.authenticateParticipant(
              workspaceId,
              handshake,
              challenge
            );
          }

          // Property: Participant must have session in each workspace
          for (const workspaceId of workspaceIds) {
            const session = manager.getSession(workspaceId, participantId);
            expect(session).toBeDefined();
            expect(session?.workspaceId).toBe(workspaceId);
          }

          // Property: Each workspace must have exactly one participant
          for (const workspaceId of workspaceIds) {
            const participants = manager.getWorkspaceParticipants(workspaceId);
            expect(participants).toHaveLength(1);
            expect(participants[0].participantId).toBe(participantId);
          }

          // Property: Removing from one workspace doesn't affect others
          const firstWorkspace = workspaceIds[0];
          manager.removeParticipant(firstWorkspace, participantId);

          // First workspace should have no participants
          expect(manager.getSession(firstWorkspace, participantId)).toBeNull();
          expect(manager.getWorkspaceParticipants(firstWorkspace)).toHaveLength(0);

          // Other workspaces should still have the participant
          for (let i = 1; i < workspaceIds.length; i++) {
            const workspaceId = workspaceIds[i];
            expect(manager.getSession(workspaceId, participantId)).toBeDefined();
            expect(manager.getWorkspaceParticipants(workspaceId)).toHaveLength(1);
          }

          // Cleanup
          member.dispose();
        }
      ),
      { numRuns: 50 }
    );
  });
});
