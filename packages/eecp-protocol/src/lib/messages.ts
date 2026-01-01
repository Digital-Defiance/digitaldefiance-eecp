/**
 * WebSocket protocol message definitions for EECP
 */

import {
  WorkspaceId,
  ParticipantId,
  OperationId,
  EncryptedOperation,
} from './types.js';

// Message types
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

// Error codes
export type ErrorCode =
  | 'AUTH_FAILED'
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_EXPIRED'
  | 'INVALID_OPERATION'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PARTICIPANT_REVOKED';

// Message envelope
export interface MessageEnvelope {
  type: MessageType;
  payload: unknown;
  timestamp: number;
  messageId: string;
}

// Zero-knowledge proof for authentication
export interface ZeroKnowledgeProof {
  signature: Buffer | Uint8Array; // ECDSA signature of challenge
  timestamp: number;
}

// Challenge message (sent by server on connection)
export interface ChallengeMessage {
  challengeId: string;
  challenge: string; // Base64-encoded challenge
}

// Handshake messages
export interface HandshakeMessage {
  protocolVersion: string;
  workspaceId: WorkspaceId;
  participantId: ParticipantId;
  publicKey: Buffer | Uint8Array;
  proof: ZeroKnowledgeProof;
}

export interface HandshakeAckMessage {
  success: boolean;
  currentKeyId: string;
  encryptedMetadata: Buffer;
  serverTime: number;
}

// Operation messages
export interface OperationMessage {
  operation: EncryptedOperation;
}

export interface OperationAckMessage {
  operationId: OperationId;
  serverTimestamp: number;
}

// Sync messages
export interface SyncRequestMessage {
  fromTimestamp: number;
}

export interface SyncResponseMessage {
  operations: EncryptedOperation[];
  currentState: Buffer; // Encrypted CRDT state
}

// Error messages
export interface ErrorMessage {
  code: ErrorCode;
  message: string;
  details?: unknown;
}
