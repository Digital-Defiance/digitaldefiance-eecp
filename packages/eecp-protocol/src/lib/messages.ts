/**
 * WebSocket protocol message definitions for EECP
 * 
 * This module defines all message types used in the WebSocket communication
 * protocol between clients and the server, including handshake, operation,
 * sync, and error messages.
 * 
 * @module messages
 */

import {
  WorkspaceId,
  ParticipantId,
  OperationId,
  EncryptedOperation,
} from './types.js';
import type { IMultiEncryptedMessage } from '@digitaldefiance/ecies-lib';

/**
 * Types of messages that can be sent over the WebSocket connection
 * 
 * @typedef {string} MessageType
 * @property {'challenge'} challenge - Server sends challenge for authentication
 * @property {'handshake'} handshake - Client sends authentication proof
 * @property {'handshake_ack'} handshake_ack - Server acknowledges successful authentication
 * @property {'operation'} operation - Client sends encrypted CRDT operation
 * @property {'operation_ack'} operation_ack - Server acknowledges operation receipt
 * @property {'sync_request'} sync_request - Client requests historical operations
 * @property {'sync_response'} sync_response - Server sends historical operations
 * @property {'error'} error - Server sends error message
 * @property {'ping'} ping - Keepalive ping message
 * @property {'pong'} pong - Keepalive pong response
 */
export type MessageType =
  | 'challenge'
  | 'handshake'
  | 'handshake_ack'
  | 'operation'
  | 'operation_ack'
  | 'sync_request'
  | 'sync_response'
  | 'error'
  | 'ping'
  | 'pong';

/**
 * Error codes for error messages
 * 
 * @typedef {string} ErrorCode
 * @property {'AUTH_FAILED'} AUTH_FAILED - Authentication failed
 * @property {'WORKSPACE_NOT_FOUND'} WORKSPACE_NOT_FOUND - Workspace does not exist
 * @property {'WORKSPACE_EXPIRED'} WORKSPACE_EXPIRED - Workspace has expired
 * @property {'INVALID_OPERATION'} INVALID_OPERATION - Operation is invalid or malformed
 * @property {'RATE_LIMIT_EXCEEDED'} RATE_LIMIT_EXCEEDED - Client exceeded rate limit
 * @property {'PARTICIPANT_REVOKED'} PARTICIPANT_REVOKED - Participant access was revoked
 */
export type ErrorCode =
  | 'AUTH_FAILED'
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_EXPIRED'
  | 'INVALID_OPERATION'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PARTICIPANT_REVOKED';

/**
 * Message envelope for all WebSocket messages
 * 
 * Wraps all messages with metadata for routing and tracking.
 * 
 * @property {MessageType} type - Type of message
 * @property {unknown} payload - Message-specific payload
 * @property {number} timestamp - Unix timestamp in milliseconds when message was created
 * @property {string} messageId - Unique identifier for the message (UUID)
 * 
 * @example
 * ```typescript
 * const envelope: MessageEnvelope = {
 *   type: 'operation',
 *   payload: operationMessage,
 *   timestamp: Date.now(),
 *   messageId: GuidV4.new().asFullHexGuid
 * };
 * ```
 */
export interface MessageEnvelope {
  type: MessageType;
  payload: unknown;
  timestamp: number;
  messageId: string;
}

/**
 * Zero-knowledge proof for participant authentication
 * 
 * Contains an ECDSA signature of the server's challenge, proving the participant
 * possesses the private key without revealing it.
 * 
 * @property {Buffer | Uint8Array} signature - ECDSA signature of the challenge
 * @property {number} timestamp - Unix timestamp in milliseconds when proof was created
 * 
 * @example
 * ```typescript
 * const proof: ZeroKnowledgeProof = {
 *   signature: sign(challenge, privateKey),
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface ZeroKnowledgeProof {
  signature: Buffer | Uint8Array;
  timestamp: number;
}

/**
 * Challenge message sent by server on connection
 * 
 * The server sends this message immediately after a WebSocket connection
 * is established. The client must sign the challenge to authenticate.
 * 
 * @property {string} challengeId - Unique identifier for this challenge
 * @property {string} challenge - Base64-encoded random challenge bytes
 * 
 * @example
 * ```typescript
 * const challenge: ChallengeMessage = {
 *   challengeId: GuidV4.new().asFullHexGuid,
 *   challenge: Buffer.from(randomBytes(32)).toString('base64')
 * };
 * ```
 */
export interface ChallengeMessage {
  challengeId: string;
  challenge: string;
}

/**
 * Handshake message sent by client for authentication
 * 
 * Contains the client's identity, public key, and zero-knowledge proof
 * of possession of the corresponding private key.
 * 
 * @property {string} protocolVersion - EECP protocol version (e.g., "1.0.0")
 * @property {WorkspaceId} workspaceId - ID of the workspace to join
 * @property {ParticipantId} participantId - ID of the participant
 * @property {Buffer | Uint8Array} publicKey - Participant's public key for ECIES encryption
 * @property {ZeroKnowledgeProof} proof - Zero-knowledge proof of private key possession
 * 
 * @example
 * ```typescript
 * const handshake: HandshakeMessage = {
 *   protocolVersion: '1.0.0',
 *   workspaceId: workspaceId,
 *   participantId: participantId,
 *   publicKey: publicKey,
 *   proof: zkProof
 * };
 * ```
 */
export interface HandshakeMessage {
  protocolVersion: string;
  workspaceId: WorkspaceId;
  participantId: ParticipantId;
  publicKey: Buffer | Uint8Array;
  proof: ZeroKnowledgeProof;
}

/**
 * Handshake acknowledgment message sent by server
 * 
 * Confirms successful authentication and provides the client with
 * encrypted workspace metadata and the current temporal key ID.
 * 
 * @property {boolean} success - Whether authentication succeeded
 * @property {string} currentKeyId - ID of the current temporal key
 * @property {IMultiEncryptedMessage} encryptedMetadata - Encrypted workspace metadata
 * @property {number} serverTime - Server's current Unix timestamp in milliseconds
 * 
 * @example
 * ```typescript
 * const ack: HandshakeAckMessage = {
 *   success: true,
 *   currentKeyId: 'key-1',
 *   encryptedMetadata: encryptedMetadata,
 *   serverTime: Date.now()
 * };
 * ```
 */
export interface HandshakeAckMessage {
  success: boolean;
  currentKeyId: string;
  encryptedMetadata: IMultiEncryptedMessage;
  serverTime: number;
}

/**
 * Operation message containing an encrypted CRDT operation
 * 
 * Sent by clients to broadcast their edits to other participants.
 * The server routes these messages without decrypting the content.
 * 
 * @property {EncryptedOperation} operation - The encrypted CRDT operation
 * 
 * @example
 * ```typescript
 * const opMessage: OperationMessage = {
 *   operation: encryptedOperation
 * };
 * ```
 */
export interface OperationMessage {
  operation: EncryptedOperation;
}

/**
 * Operation acknowledgment message sent by server
 * 
 * Confirms receipt of an operation and provides the server's timestamp
 * for ordering and synchronization.
 * 
 * @property {OperationId} operationId - ID of the acknowledged operation
 * @property {number} serverTimestamp - Server's Unix timestamp in milliseconds when operation was received
 * 
 * @example
 * ```typescript
 * const ack: OperationAckMessage = {
 *   operationId: operation.id,
 *   serverTimestamp: Date.now()
 * };
 * ```
 */
export interface OperationAckMessage {
  operationId: OperationId;
  serverTimestamp: number;
}

/**
 * Sync request message sent by client
 * 
 * Requests all operations that occurred after a specific timestamp.
 * Used for catching up after reconnection or joining mid-session.
 * 
 * @property {number} fromTimestamp - Unix timestamp in milliseconds to sync from
 * 
 * @example
 * ```typescript
 * const syncRequest: SyncRequestMessage = {
 *   fromTimestamp: lastSeenTimestamp
 * };
 * ```
 */
export interface SyncRequestMessage {
  fromTimestamp: number;
}

/**
 * Sync response message sent by server
 * 
 * Contains all operations since the requested timestamp and the current
 * encrypted CRDT state for full synchronization.
 * 
 * @property {EncryptedOperation[]} operations - Array of encrypted operations
 * @property {Buffer} currentState - Encrypted Yjs CRDT state
 * 
 * @example
 * ```typescript
 * const syncResponse: SyncResponseMessage = {
 *   operations: [op1, op2, op3],
 *   currentState: encryptedState
 * };
 * ```
 */
export interface SyncResponseMessage {
  operations: EncryptedOperation[];
  currentState: Buffer;
}

/**
 * Error message sent by server
 * 
 * Indicates an error occurred during processing. The client should
 * handle the error appropriately based on the error code.
 * 
 * @property {ErrorCode} code - Error code indicating the type of error
 * @property {string} message - Human-readable error message
 * @property {unknown} [details] - Optional additional error details
 * 
 * @example
 * ```typescript
 * const error: ErrorMessage = {
 *   code: 'RATE_LIMIT_EXCEEDED',
 *   message: 'Too many operations per second',
 *   details: { limit: 100, current: 150 }
 * };
 * ```
 */
export interface ErrorMessage {
  code: ErrorCode;
  message: string;
  details?: unknown;
}
