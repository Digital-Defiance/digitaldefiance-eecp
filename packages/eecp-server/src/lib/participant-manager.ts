/**
 * Participant Manager for EECP Server
 * 
 * Manages participant authentication, sessions, and connections.
 * Implements zero-knowledge authentication without learning participant identities.
 */

import {
  WorkspaceId,
  ParticipantId,
} from '@digitaldefiance-eecp/eecp-protocol';
import {
  HandshakeMessage,
} from '@digitaldefiance-eecp/eecp-protocol';
import { IParticipantAuth, eciesService } from '@digitaldefiance-eecp/eecp-crypto';
import { Member, MemberType, EmailString, GuidV4 } from '@digitaldefiance/ecies-lib';

/**
 * Participant session information
 */
export interface ParticipantSession {
  participantId: ParticipantId;
  workspaceId: WorkspaceId;
  publicKey: Buffer | Uint8Array;
  connectedAt: number;
  lastActivity: number;
  websocket: any; // WebSocket type - using any to avoid ws dependency in types
}

/**
 * Interface for participant management operations
 */
export interface IParticipantManager {
  /**
   * Authenticate and register participant
   * Uses zero-knowledge proof to verify participant without learning identity
   */
  authenticateParticipant(
    workspaceId: WorkspaceId,
    handshake: HandshakeMessage,
    challenge: Buffer
  ): Promise<ParticipantSession>;

  /**
   * Get participant session
   */
  getSession(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): ParticipantSession | null;

  /**
   * Remove participant and close connection
   */
  removeParticipant(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): void;

  /**
   * Get all participants in workspace
   */
  getWorkspaceParticipants(workspaceId: WorkspaceId): ParticipantSession[];
}

/**
 * Implementation of participant manager
 */
export class ParticipantManager implements IParticipantManager {
  private sessions: Map<string, ParticipantSession> = new Map();

  constructor(private auth: IParticipantAuth) {
    if (!auth) {
      throw new Error('ParticipantAuth is required');
    }
  }

  /**
   * Authenticate and register a participant using zero-knowledge proof
   * 
   * @param workspaceId - The workspace the participant is joining
   * @param handshake - The handshake message containing proof and participant info
   * @param challenge - The challenge that was sent to the participant
   * @returns Participant session if authentication succeeds
   * @throws Error if authentication fails
   */
  async authenticateParticipant(
    workspaceId: WorkspaceId,
    handshake: HandshakeMessage,
    challenge: Buffer
  ): Promise<ParticipantSession> {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    if (!handshake) {
      throw new Error('Handshake message is required');
    }

    if (!challenge) {
      throw new Error('Challenge is required');
    }

    // Create a Member from the public key for verification
    // We only need the public key for verification (zero-knowledge property)
    const publicKeyUint8 = handshake.publicKey instanceof Uint8Array 
      ? handshake.publicKey 
      : new Uint8Array(handshake.publicKey);
    
    // Convert ParticipantId (GuidV4) to Uint8Array for Member
    // GuidV4 can be converted to Uint8Array using asUint8Array property
    let participantIdUint8: Uint8Array;
    if (typeof handshake.participantId === 'string') {
      participantIdUint8 = GuidV4.parse(handshake.participantId).asUint8Array;
    } else {
      participantIdUint8 = handshake.participantId.asUint8Array;
    }
    
    const member = new Member(
      eciesService,
      MemberType.User,
      'Participant',
      new EmailString('participant@eecp.local'),
      publicKeyUint8,
      undefined, // No private key needed for verification
      undefined,
      participantIdUint8
    );

    try {
      // Verify the zero-knowledge proof
      const valid = this.auth.verifyProof(
        handshake.proof,
        member,
        challenge,
        handshake.participantId
      );

      if (!valid) {
        throw new Error('Authentication failed: Invalid proof');
      }

      // Check if participant is already connected
      const existingSession = this.getSession(workspaceId, handshake.participantId);
      if (existingSession) {
        // Close existing connection and replace with new one
        this.removeParticipant(workspaceId, handshake.participantId);
      }

      // Create new session
      const session: ParticipantSession = {
        participantId: handshake.participantId,
        workspaceId,
        publicKey: handshake.publicKey,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        websocket: null, // Will be set by caller
      };

      const key = this.getSessionKey(workspaceId, handshake.participantId);
      this.sessions.set(key, session);

      return session;
    } finally {
      // Clean up the temporary member
      member.dispose();
    }
  }

  /**
   * Get participant session by workspace and participant ID
   * 
   * @param workspaceId - The workspace ID
   * @param participantId - The participant ID
   * @returns Participant session or null if not found
   */
  getSession(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): ParticipantSession | null {
    if (!workspaceId || !participantId) {
      return null;
    }

    const key = this.getSessionKey(workspaceId, participantId);
    return this.sessions.get(key) || null;
  }

  /**
   * Remove participant from workspace and close their connection
   * 
   * @param workspaceId - The workspace ID
   * @param participantId - The participant ID
   */
  removeParticipant(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): void {
    if (!workspaceId || !participantId) {
      return;
    }

    const key = this.getSessionKey(workspaceId, participantId);
    const session = this.sessions.get(key);

    if (session) {
      // Close WebSocket connection if it exists
      if (session.websocket && typeof session.websocket.close === 'function') {
        try {
          session.websocket.close();
        } catch (error) {
          // Ignore errors when closing websocket
        }
      }

      // Remove session
      this.sessions.delete(key);
    }
  }

  /**
   * Get all participants in a workspace
   * 
   * @param workspaceId - The workspace ID
   * @returns Array of participant sessions in the workspace
   */
  getWorkspaceParticipants(workspaceId: WorkspaceId): ParticipantSession[] {
    if (!workspaceId) {
      return [];
    }

    return Array.from(this.sessions.values()).filter(
      (session) => session.workspaceId === workspaceId
    );
  }

  /**
   * Generate session key for storage
   * 
   * @param workspaceId - The workspace ID
   * @param participantId - The participant ID
   * @returns Session key string
   */
  private getSessionKey(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): string {
    const workspaceIdStr = typeof workspaceId === 'string' ? workspaceId : workspaceId.toString();
    const participantIdStr = typeof participantId === 'string' ? participantId : participantId.toString();
    return `${workspaceIdStr}:${participantIdStr}`;
  }
}
