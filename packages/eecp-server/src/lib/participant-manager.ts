/**
 * @module participant-manager
 * 
 * Participant Manager for EECP Server - Manages participant authentication, sessions, and connections.
 * 
 * This module implements zero-knowledge authentication without learning participant identities.
 * The server verifies that participants possess the private key corresponding to their public key
 * without ever seeing or storing the private key.
 * 
 * Key features:
 * - Challenge-response authentication using digital signatures
 * - Session management for connected participants
 * - Zero-knowledge proof verification
 * - Participant lifecycle tracking (connect, disconnect)
 * - Audit logging of participant events
 * 
 * Authentication flow:
 * 1. Server generates random challenge
 * 2. Participant signs challenge with private key
 * 3. Server verifies signature using participant's public key
 * 4. Server creates session without learning private key
 * 
 * @example
 * ```typescript
 * import { ParticipantManager } from './participant-manager';
 * import { ParticipantAuth } from '@digitaldefiance-eecp/eecp-crypto';
 * import { AuditLogger } from './audit-logger';
 * 
 * const auth = new ParticipantAuth();
 * const auditLogger = new AuditLogger();
 * const manager = new ParticipantManager(auth, auditLogger);
 * 
 * // Authenticate participant
 * const session = await manager.authenticateParticipant(
 *   workspaceId,
 *   handshakeMessage,
 *   challenge
 * );
 * 
 * // Get participant session
 * const participant = manager.getSession(workspaceId, participantId);
 * 
 * // Remove participant
 * manager.removeParticipant(workspaceId, participantId);
 * ```
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
import { IAuditLogger } from './audit-logger';

/**
 * Participant session information.
 * 
 * Represents an authenticated participant's connection to a workspace.
 * 
 * @interface ParticipantSession
 * @property {ParticipantId} participantId - Unique participant identifier
 * @property {WorkspaceId} workspaceId - Workspace the participant is connected to
 * @property {Buffer | Uint8Array} publicKey - Participant's public key for verification
 * @property {number} connectedAt - Timestamp when participant connected (milliseconds)
 * @property {number} lastActivity - Timestamp of last activity (milliseconds)
 * @property {any} websocket - WebSocket connection (using any to avoid ws dependency)
 * 
 * @example
 * ```typescript
 * const session: ParticipantSession = {
 *   participantId: new GuidV4(),
 *   workspaceId: new GuidV4(),
 *   publicKey: Buffer.from('...'),
 *   connectedAt: Date.now(),
 *   lastActivity: Date.now(),
 *   websocket: ws
 * };
 * ```
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
 * Interface for participant management operations.
 * 
 * Defines the contract for managing participant authentication, sessions, and lifecycle.
 * 
 * @interface IParticipantManager
 */
export interface IParticipantManager {
  /**
   * Authenticate and register participant using zero-knowledge proof.
   * 
   * Verifies that the participant possesses the private key corresponding to their
   * public key without learning the private key itself.
   * 
   * @param {WorkspaceId} workspaceId - Workspace the participant is joining
   * @param {HandshakeMessage} handshake - Handshake message with proof and participant info
   * @param {Buffer} challenge - Challenge that was sent to the participant
   * @returns {Promise<ParticipantSession>} Participant session if authentication succeeds
   * @throws {Error} If authentication fails or parameters are invalid
   */
  authenticateParticipant(
    workspaceId: WorkspaceId,
    handshake: HandshakeMessage,
    challenge: Buffer
  ): Promise<ParticipantSession>;

  /**
   * Get participant session by workspace and participant ID.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {ParticipantId} participantId - Participant ID
   * @returns {ParticipantSession | null} Participant session or null if not found
   */
  getSession(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): ParticipantSession | null;

  /**
   * Remove participant from workspace and close their connection.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {ParticipantId} participantId - Participant ID
   */
  removeParticipant(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): void;

  /**
   * Get all participants in a workspace.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @returns {ParticipantSession[]} Array of participant sessions
   */
  getWorkspaceParticipants(workspaceId: WorkspaceId): ParticipantSession[];

  /**
   * Get total participant count across all workspaces.
   * 
   * @returns {number} Total number of connected participants
   */
  getTotalParticipantCount(): number;
}

/**
 * Implementation of participant manager.
 * 
 * Manages participant authentication using zero-knowledge proofs and maintains
 * active participant sessions across workspaces.
 * 
 * @class ParticipantManager
 * @implements {IParticipantManager}
 * 
 * @example
 * ```typescript
 * const auth = new ParticipantAuth();
 * const auditLogger = new AuditLogger();
 * const manager = new ParticipantManager(auth, auditLogger);
 * 
 * // Authenticate participant
 * const session = await manager.authenticateParticipant(
 *   workspaceId,
 *   handshake,
 *   challenge
 * );
 * ```
 */
export class ParticipantManager implements IParticipantManager {
  private sessions: Map<string, ParticipantSession> = new Map();
  private auditLogger?: IAuditLogger;

  constructor(private auth: IParticipantAuth, auditLogger?: IAuditLogger) {
    if (!auth) {
      throw new Error('ParticipantAuth is required');
    }
    this.auditLogger = auditLogger;
  }

  /**
   * Authenticate and register a participant using zero-knowledge proof.
   * 
   * This method implements zero-knowledge authentication:
   * 1. Creates temporary Member from public key
   * 2. Verifies signature on challenge using public key
   * 3. Creates session without learning private key
   * 4. Logs authentication event
   * 
   * The server never sees or stores the participant's private key.
   * 
   * @param {WorkspaceId} workspaceId - The workspace the participant is joining
   * @param {HandshakeMessage} handshake - The handshake message containing proof and participant info
   * @param {Buffer} challenge - The challenge that was sent to the participant
   * @returns {Promise<ParticipantSession>} Participant session if authentication succeeds
   * @throws {Error} If workspace ID, handshake, or challenge is missing
   * @throws {Error} If authentication fails (invalid proof)
   * 
   * @example
   * ```typescript
   * const challenge = auth.generateChallenge();
   * // ... send challenge to client ...
   * // ... receive handshake from client ...
   * 
   * const session = await manager.authenticateParticipant(
   *   workspaceId,
   *   handshake,
   *   challenge
   * );
   * 
   * console.log(`Participant ${session.participantId} authenticated`);
   * ```
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

      // Log participant join
      if (this.auditLogger) {
        await this.auditLogger.logEvent(
          workspaceId,
          'participant_joined',
          {
            connectedAt: session.connectedAt,
          },
          handshake.participantId
        );
      }

      return session;
    } finally {
      // Clean up the temporary member
      member.dispose();
    }
  }

  /**
   * Get participant session by workspace and participant ID.
   * 
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @param {ParticipantId} participantId - The participant ID
   * @returns {ParticipantSession | null} Participant session or null if not found
   * 
   * @example
   * ```typescript
   * const session = manager.getSession(workspaceId, participantId);
   * if (session) {
   *   console.log(`Last activity: ${session.lastActivity}`);
   * }
   * ```
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
   * Remove participant from workspace and close their connection.
   * 
   * Performs cleanup:
   * 1. Closes WebSocket connection
   * 2. Removes session from storage
   * 3. Logs participant leave event
   * 
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @param {ParticipantId} participantId - The participant ID
   * 
   * @example
   * ```typescript
   * // Remove participant when they disconnect
   * manager.removeParticipant(workspaceId, participantId);
   * ```
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

      // Log participant leave
      if (this.auditLogger) {
        this.auditLogger.logEvent(
          workspaceId,
          'participant_left',
          {
            leftAt: Date.now(),
          },
          participantId
        ).catch(() => {
          // Ignore audit logging errors during cleanup
        });
      }
    }
  }

  /**
   * Get all participants in a workspace.
   * 
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @returns {ParticipantSession[]} Array of participant sessions in the workspace
   * 
   * @example
   * ```typescript
   * const participants = manager.getWorkspaceParticipants(workspaceId);
   * console.log(`${participants.length} participants in workspace`);
   * ```
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
   * Get total participant count across all workspaces.
   * 
   * @returns {number} Total number of connected participants
   * 
   * @example
   * ```typescript
   * const count = manager.getTotalParticipantCount();
   * console.log(`${count} total participants connected`);
   * ```
   */
  getTotalParticipantCount(): number {
    return this.sessions.size;
  }

  /**
   * Generate session key for storage.
   * 
   * Combines workspace ID and participant ID into a unique key.
   * 
   * @private
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @param {ParticipantId} participantId - The participant ID
   * @returns {string} Session key string
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
