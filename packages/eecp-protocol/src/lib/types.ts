/**
 * Core type definitions for the Ephemeral Encrypted Collaboration Protocol (EECP)
 */

import { GuidV4 } from '@digitaldefiance/ecies-lib';

// Workspace identification
// Using GuidV4 for type-safe, validated UUID v4 identifiers
// GuidV4 provides multiple representations: string, buffer, Uint8Array, bigint
export type WorkspaceId = GuidV4;
export type ParticipantId = GuidV4;
export type OperationId = GuidV4;

// Time management
export interface TimeWindow {
  startTime: number; // Unix timestamp (ms)
  endTime: number; // Unix timestamp (ms)
  rotationInterval: number; // Minutes (5, 15, 30, 60)
  gracePeriod: number; // Milliseconds
}

// Workspace configuration
export interface WorkspaceConfig {
  id: WorkspaceId;
  createdAt: number;
  expiresAt: number;
  timeWindow: TimeWindow;
  maxParticipants: number;
  allowExtension: boolean;
}

// Participant information
export interface ParticipantInfo {
  id: ParticipantId;
  publicKey: Buffer | Uint8Array;
  joinedAt: number;
  role: 'creator' | 'editor' | 'viewer';
}

// Key rotation schedule
export interface KeyRotationSchedule {
  currentKeyId: string;
  nextRotationAt: number;
  previousKeyId?: string;
  previousKeyExpiresAt?: number;
}

// Workspace metadata (encrypted)
export interface WorkspaceMetadata {
  config: WorkspaceConfig;
  participants: ParticipantInfo[];
  currentTemporalKeyId: string;
  keyRotationSchedule: KeyRotationSchedule;
}

// CRDT operation
export interface CRDTOperation {
  id: OperationId;
  participantId: ParticipantId;
  timestamp: number;
  type: 'insert' | 'delete';
  position: number;
  content?: string; // For insert operations
  length?: number; // For delete operations
}

// Encrypted operation
export interface EncryptedOperation {
  id: OperationId;
  workspaceId: WorkspaceId;
  participantId: ParticipantId;
  timestamp: number;
  
  // CRDT metadata (visible to server)
  position: number;
  operationType: 'insert' | 'delete' | 'format';
  
  // Encrypted payload (opaque to server)
  encryptedContent: Buffer;
  
  // Authentication
  signature: Buffer;
}

// Audit log types
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

export interface AuditLogEntry {
  id: string; // UUID for the log entry
  workspaceId: WorkspaceId;
  timestamp: number;
  eventType: AuditEventType;
  participantId?: ParticipantId; // Optional, not all events have a participant
  metadata: Record<string, unknown>; // Event-specific metadata
}

export interface EncryptedAuditLogEntry {
  id: string;
  workspaceId: WorkspaceId;
  timestamp: number;
  encryptedContent: Buffer; // Encrypted AuditLogEntry
  nonce: Buffer;
  authTag: Buffer;
}
