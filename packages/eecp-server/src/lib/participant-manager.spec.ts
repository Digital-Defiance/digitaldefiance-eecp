/**
 * Unit Tests for Participant Manager
 * 
 * Tests specific examples and edge cases for participant management
 */

import { Member, GuidV4, MemberType, EmailString } from '@digitaldefiance/ecies-lib';
import { ParticipantManager } from './participant-manager';
import { ParticipantAuth, eciesService } from '@digitaldefiance-eecp/eecp-crypto';
import { HandshakeMessage } from '@digitaldefiance-eecp/eecp-protocol';

describe('ParticipantManager', () => {
  let manager: ParticipantManager;
  let auth: ParticipantAuth;

  beforeEach(() => {
    auth = new ParticipantAuth();
    manager = new ParticipantManager(auth);
  });

  describe('constructor', () => {
    it('should throw error if auth is not provided', () => {
      expect(() => new ParticipantManager(null as any)).toThrow(
        'ParticipantAuth is required'
      );
    });
  });

  describe('authenticateParticipant', () => {
    it('should throw error if workspace ID is missing', async () => {
      const handshake = {} as HandshakeMessage;
      const challenge = Buffer.alloc(32);

      await expect(
        manager.authenticateParticipant('' as any, handshake, challenge)
      ).rejects.toThrow('Workspace ID is required');
    });

    it('should throw error if handshake is missing', async () => {
      const workspaceId = GuidV4.new();
      const challenge = Buffer.alloc(32);

      await expect(
        manager.authenticateParticipant(workspaceId, null as any, challenge)
      ).rejects.toThrow('Handshake message is required');
    });

    it('should throw error if challenge is missing', async () => {
      const workspaceId = GuidV4.new();
      const handshake = {} as HandshakeMessage;

      await expect(
        manager.authenticateParticipant(workspaceId, handshake, null as any)
      ).rejects.toThrow('Challenge is required');
    });

    it('should replace existing session when participant reconnects', async () => {
      const workspaceId = GuidV4.new();
      const memberWithMnemonic = await Member.newMember(
        eciesService,
        MemberType.User,
        'Test User',
        new EmailString('test@example.com')
      );
      const member = memberWithMnemonic.member as Member;
      const participantId = GuidV4.fromBuffer(member.id);

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

      // First authentication
      const session1 = await manager.authenticateParticipant(
        workspaceId,
        handshake,
        challenge
      );

      expect(session1.participantId).toBe(participantId);

      // Second authentication (reconnect)
      const challenge2 = auth.generateChallenge();
      const proof2 = auth.generateProof(
        participantId,
        member,
        challenge2
      );

      const handshake2: HandshakeMessage = {
        ...handshake,
        proof: proof2,
      };

      const session2 = await manager.authenticateParticipant(
        workspaceId,
        handshake2,
        challenge2
      );

      expect(session2.participantId).toBe(participantId);

      // Should only have one session
      const participants = manager.getWorkspaceParticipants(workspaceId);
      expect(participants).toHaveLength(1);

      // Cleanup
      member.dispose();
    });
  });

  describe('getSession', () => {
    it('should return null if workspace ID is missing', () => {
      const participantId = GuidV4.new();
      const session = manager.getSession('' as any, participantId);
      expect(session).toBeNull();
    });

    it('should return null if participant ID is missing', () => {
      const workspaceId = GuidV4.new();
      const session = manager.getSession(workspaceId, '' as any);
      expect(session).toBeNull();
    });

    it('should return null if session does not exist', () => {
      const workspaceId = GuidV4.new();
      const participantId = GuidV4.new();
      const session = manager.getSession(workspaceId, participantId);
      expect(session).toBeNull();
    });
  });

  describe('removeParticipant', () => {
    it('should handle missing workspace ID gracefully', () => {
      const participantId = GuidV4.new();
      expect(() => {
        manager.removeParticipant('' as any, participantId);
      }).not.toThrow();
    });

    it('should handle missing participant ID gracefully', () => {
      const workspaceId = GuidV4.new();
      expect(() => {
        manager.removeParticipant(workspaceId, '' as any);
      }).not.toThrow();
    });

    it('should handle non-existent session gracefully', () => {
      const workspaceId = GuidV4.new();
      const participantId = GuidV4.new();
      expect(() => {
        manager.removeParticipant(workspaceId, participantId);
      }).not.toThrow();
    });

    it('should handle websocket close errors gracefully', async () => {
      const workspaceId = GuidV4.new();
      const memberWithMnemonic = await Member.newMember(
        eciesService,
        MemberType.User,
        'Test User',
        new EmailString('test@example.com')
      );
      const member = memberWithMnemonic.member as Member;
      const participantId = GuidV4.fromBuffer(member.id);

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

      // Add websocket that throws error on close
      session.websocket = {
        close: jest.fn(() => {
          throw new Error('WebSocket error');
        }),
      };

      // Should not throw
      expect(() => {
        manager.removeParticipant(workspaceId, participantId);
      }).not.toThrow();

      // Session should still be removed
      expect(manager.getSession(workspaceId, participantId)).toBeNull();

      // Cleanup
      member.dispose();
    });
  });

  describe('getWorkspaceParticipants', () => {
    it('should return empty array if workspace ID is missing', () => {
      const participants = manager.getWorkspaceParticipants('' as any);
      expect(participants).toEqual([]);
    });

    it('should return empty array if workspace has no participants', () => {
      const workspaceId = GuidV4.new();
      const participants = manager.getWorkspaceParticipants(workspaceId);
      expect(participants).toEqual([]);
    });
  });
});
