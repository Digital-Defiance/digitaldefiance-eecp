/**
 * Core type definitions for the Ephemeral Encrypted Collaboration Protocol (EECP)
 * 
 * This module defines all the fundamental types used throughout the EECP system,
 * including workspace configuration, participant information, CRDT operations,
 * and audit logging structures.
 * 
 * @module types
 */

import { GuidV4 } from '@digitaldefiance/ecies-lib';

/**
 * Unique identifier for a workspace
 * 
 * Uses GuidV4 for type-safe, validated UUID v4 identifiers.
 * GuidV4 provides multiple representations: string, buffer, Uint8Array, bigint.
 * 
 * @example
 * ```typescript
 * const workspaceId = GuidV4.new();
 * console.log(workspaceId.asFullHexGuid); // "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export type WorkspaceId = GuidV4;

/**
 * Unique identifier for a participant in a workspace
 * 
 * Uses GuidV4 for type-safe, validated UUID v4 identifiers.
 * Each participant has a unique ID that persists across connections.
 */
export type ParticipantId = GuidV4;

/**
 * Unique identifier for a CRDT operation
 * 
 * Uses GuidV4 for type-safe, validated UUID v4 identifiers.
 * Each operation has a unique ID for deduplication and ordering.
 */
export type OperationId = GuidV4;

/**
 * Time window configuration for temporal key rotation
 * 
 * Defines the validity period for temporal keys and the grace period
 * for handling clock skew between participants.
 * 
 * @property {number} startTime - Unix timestamp in milliseconds when the window starts
 * @property {number} endTime - Unix timestamp in milliseconds when the window ends
 * @property {number} rotationInterval - Key rotation interval in minutes (5, 15, 30, or 60)
 * @property {number} gracePeriod - Additional time in milliseconds to retain old keys for clock skew
 * 
 * @example
 * ```typescript
 * const timeWindow: TimeWindow = {
 *   startTime: Date.now(),
 *   endTime: Date.now() + 60 * 60 * 1000, // 1 hour
 *   rotationInterval: 15, // Rotate keys every 15 minutes
 *   gracePeriod: 5 * 60 * 1000 // 5 minute grace period
 * };
 * ```
 */
export interface TimeWindow {
  startTime: number;
  endTime: number;
  rotationInterval: number;
  gracePeriod: number;
}

/**
 * Configuration for a workspace
 * 
 * Contains all the settings and metadata needed to manage a workspace's lifecycle,
 * including expiration time, participant limits, and key rotation schedule.
 * 
 * @property {WorkspaceId} id - Unique identifier for the workspace
 * @property {number} createdAt - Unix timestamp in milliseconds when workspace was created
 * @property {number} expiresAt - Unix timestamp in milliseconds when workspace expires
 * @property {TimeWindow} timeWindow - Time window configuration for key rotation
 * @property {number} maxParticipants - Maximum number of participants allowed (default: 50)
 * @property {boolean} allowExtension - Whether the workspace expiration can be extended
 * 
 * @example
 * ```typescript
 * const config: WorkspaceConfig = {
 *   id: GuidV4.new(),
 *   createdAt: Date.now(),
 *   expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
 *   timeWindow: { ... },
 *   maxParticipants: 50,
 *   allowExtension: true
 * };
 * ```
 */
export interface WorkspaceConfig {
  id: WorkspaceId;
  createdAt: number;
  expiresAt: number;
  timeWindow: TimeWindow;
  maxParticipants: number;
  allowExtension: boolean;
}

/**
 * Information about a participant in a workspace
 * 
 * Contains the participant's identity, public key for encryption,
 * join time, and role within the workspace.
 * 
 * @property {ParticipantId} id - Unique identifier for the participant
 * @property {Buffer | Uint8Array} publicKey - Participant's public key for ECIES encryption
 * @property {number} joinedAt - Unix timestamp in milliseconds when participant joined
 * @property {'creator' | 'editor' | 'viewer'} role - Participant's role in the workspace
 * 
 * @example
 * ```typescript
 * const participant: ParticipantInfo = {
 *   id: GuidV4.new(),
 *   publicKey: Buffer.from('...'),
 *   joinedAt: Date.now(),
 *   role: 'editor'
 * };
 * ```
 */
export interface ParticipantInfo {
  id: ParticipantId;
  publicKey: Buffer | Uint8Array;
  joinedAt: number;
  role: 'creator' | 'editor' | 'viewer';
}

/**
 * Schedule for temporal key rotation
 * 
 * Tracks the current key, next rotation time, and optionally the previous key
 * during the grace period.
 * 
 * @property {string} currentKeyId - ID of the currently active temporal key
 * @property {number} nextRotationAt - Unix timestamp in milliseconds when next rotation occurs
 * @property {string} [previousKeyId] - ID of the previous key (during grace period)
 * @property {number} [previousKeyExpiresAt] - When the previous key's grace period ends
 * 
 * @example
 * ```typescript
 * const schedule: KeyRotationSchedule = {
 *   currentKeyId: 'key-1',
 *   nextRotationAt: Date.now() + 15 * 60 * 1000, // 15 minutes
 *   previousKeyId: 'key-0',
 *   previousKeyExpiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
 * };
 * ```
 */
export interface KeyRotationSchedule {
  currentKeyId: string;
  nextRotationAt: number;
  previousKeyId?: string;
  previousKeyExpiresAt?: number;
}

/**
 * Workspace metadata (stored encrypted on server)
 * 
 * Contains all the information needed to manage a workspace, including
 * configuration, participant list, and key rotation schedule.
 * This metadata is encrypted using ECIES multi-recipient encryption
 * so only authorized participants can decrypt it.
 * 
 * @property {WorkspaceConfig} config - Workspace configuration
 * @property {ParticipantInfo[]} participants - List of all participants
 * @property {string} currentTemporalKeyId - ID of the current temporal key
 * @property {KeyRotationSchedule} keyRotationSchedule - Key rotation schedule
 * 
 * @example
 * ```typescript
 * const metadata: WorkspaceMetadata = {
 *   config: workspaceConfig,
 *   participants: [participant1, participant2],
 *   currentTemporalKeyId: 'key-1',
 *   keyRotationSchedule: schedule
 * };
 * ```
 */
export interface WorkspaceMetadata {
  config: WorkspaceConfig;
  participants: ParticipantInfo[];
  currentTemporalKeyId: string;
  keyRotationSchedule: KeyRotationSchedule;
}

/**
 * CRDT operation for collaborative editing
 * 
 * Represents a single edit operation (insert or delete) in the collaborative
 * document. Operations are applied to a Yjs CRDT to ensure eventual consistency.
 * 
 * @property {OperationId} id - Unique identifier for the operation
 * @property {ParticipantId} participantId - ID of the participant who created the operation
 * @property {number} timestamp - Unix timestamp in milliseconds when operation was created
 * @property {'insert' | 'delete'} type - Type of operation
 * @property {number} position - Position in the document where operation applies
 * @property {string} [content] - Text content for insert operations
 * @property {number} [length] - Number of characters for delete operations
 * 
 * @example
 * ```typescript
 * const insertOp: CRDTOperation = {
 *   id: GuidV4.new(),
 *   participantId: participantId,
 *   timestamp: Date.now(),
 *   type: 'insert',
 *   position: 10,
 *   content: 'Hello, world!'
 * };
 * ```
 */
export interface CRDTOperation {
  id: OperationId;
  participantId: ParticipantId;
  timestamp: number;
  type: 'insert' | 'delete';
  position: number;
  content?: string;
  length?: number;
}

/**
 * Encrypted CRDT operation for transmission over the network
 * 
 * Contains the encrypted content payload and metadata needed for routing
 * and validation. The server can see the metadata but not the content.
 * 
 * @property {OperationId} id - Unique identifier for the operation
 * @property {WorkspaceId} workspaceId - ID of the workspace this operation belongs to
 * @property {ParticipantId} participantId - ID of the participant who created the operation
 * @property {number} timestamp - Unix timestamp in milliseconds when operation was created
 * @property {number} position - Position in the document (visible to server for ordering)
 * @property {'insert' | 'delete' | 'format'} operationType - Type of operation (visible to server)
 * @property {Buffer} encryptedContent - Encrypted operation content (opaque to server)
 * @property {Buffer} signature - ECDSA signature for authentication
 * 
 * @example
 * ```typescript
 * const encryptedOp: EncryptedOperation = {
 *   id: GuidV4.new(),
 *   workspaceId: workspaceId,
 *   participantId: participantId,
 *   timestamp: Date.now(),
 *   position: 10,
 *   operationType: 'insert',
 *   encryptedContent: Buffer.from('...'),
 *   signature: Buffer.from('...')
 * };
 * ```
 */
export interface EncryptedOperation {
  id: OperationId;
  workspaceId: WorkspaceId;
  participantId: ParticipantId;
  timestamp: number;
  position: number;
  operationType: 'insert' | 'delete' | 'format';
  encryptedContent: Buffer;
  signature: Buffer;
}

/**
 * Types of events that can be logged in the audit trail
 * 
 * Each event type represents a significant action in the workspace lifecycle
 * or participant activity.
 */
export type AuditEventType =
  | 'workspace_created'
  | 'workspace_extended'
  | 'workspace_revoked'
  | 'workspace_expired'
  | 'participant_joined'
  | 'participant_left'
  | 'participant_revoked'
  | 'operation_submitted'
  | 'key_rotated'
  | 'key_deleted';

/**
 * Audit log entry for tracking workspace events
 * 
 * Records significant events in the workspace lifecycle for compliance
 * and debugging purposes. Entries are encrypted before storage.
 * 
 * @property {string} id - Unique identifier for the log entry (UUID)
 * @property {WorkspaceId} workspaceId - ID of the workspace this event relates to
 * @property {number} timestamp - Unix timestamp in milliseconds when event occurred
 * @property {AuditEventType} eventType - Type of event being logged
 * @property {ParticipantId} [participantId] - ID of participant involved (if applicable)
 * @property {Record<string, unknown>} metadata - Event-specific metadata
 * 
 * @example
 * ```typescript
 * const logEntry: AuditLogEntry = {
 *   id: GuidV4.new().asFullHexGuid,
 *   workspaceId: workspaceId,
 *   timestamp: Date.now(),
 *   eventType: 'participant_joined',
 *   participantId: participantId,
 *   metadata: { role: 'editor' }
 * };
 * ```
 */
export interface AuditLogEntry {
  id: string;
  workspaceId: WorkspaceId;
  timestamp: number;
  eventType: AuditEventType;
  participantId?: ParticipantId;
  metadata: Record<string, unknown>;
}

/**
 * Encrypted audit log entry for secure storage
 * 
 * Contains the encrypted audit log entry along with the nonce and auth tag
 * needed for AES-256-GCM decryption.
 * 
 * @property {string} id - Unique identifier for the log entry (UUID)
 * @property {WorkspaceId} workspaceId - ID of the workspace this event relates to
 * @property {number} timestamp - Unix timestamp in milliseconds when event occurred
 * @property {Buffer} encryptedContent - Encrypted AuditLogEntry
 * @property {Buffer} nonce - 12-byte nonce for AES-256-GCM
 * @property {Buffer} authTag - 16-byte authentication tag for AES-256-GCM
 * 
 * @example
 * ```typescript
 * const encrypted: EncryptedAuditLogEntry = {
 *   id: logEntry.id,
 *   workspaceId: logEntry.workspaceId,
 *   timestamp: logEntry.timestamp,
 *   encryptedContent: Buffer.from('...'),
 *   nonce: Buffer.from('...'),
 *   authTag: Buffer.from('...')
 * };
 * ```
 */
export interface EncryptedAuditLogEntry {
  id: string;
  workspaceId: WorkspaceId;
  timestamp: number;
  encryptedContent: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}
