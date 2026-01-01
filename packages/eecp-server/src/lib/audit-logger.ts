/**
 * Encrypted audit logging for EECP server
 * Logs workspace events with encryption using a separate audit key
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import type {
  WorkspaceId,
  ParticipantId,
  AuditLogEntry,
  EncryptedAuditLogEntry,
  AuditEventType,
} from '@digitaldefiance/eecp-protocol';

export interface IAuditLogger {
  /**
   * Log an audit event
   */
  logEvent(
    workspaceId: WorkspaceId,
    eventType: AuditEventType,
    metadata: Record<string, unknown>,
    participantId?: ParticipantId
  ): Promise<void>;

  /**
   * Get audit logs for a workspace (encrypted)
   */
  getWorkspaceLogs(workspaceId: WorkspaceId): EncryptedAuditLogEntry[];

  /**
   * Decrypt an audit log entry (for authorized access)
   */
  decryptLogEntry(
    encrypted: EncryptedAuditLogEntry,
    auditKey: Buffer
  ): Promise<AuditLogEntry>;

  /**
   * Delete all audit logs for a workspace (on expiration)
   */
  deleteWorkspaceLogs(workspaceId: WorkspaceId): void;

  /**
   * Get or create audit key for a workspace
   */
  getAuditKey(workspaceId: WorkspaceId): Buffer;
}

export class AuditLogger implements IAuditLogger {
  // Store encrypted audit logs in memory (keyed by workspace ID)
  private logs: Map<string, EncryptedAuditLogEntry[]> = new Map();
  
  // Store audit keys (separate from temporal keys, expire with workspace)
  private auditKeys: Map<string, Buffer> = new Map();

  /**
   * Log an audit event
   */
  async logEvent(
    workspaceId: WorkspaceId,
    eventType: AuditEventType,
    metadata: Record<string, unknown>,
    participantId?: ParticipantId
  ): Promise<void> {
    // Create audit log entry
    const entry: AuditLogEntry = {
      id: GuidV4.new().asFullHexGuid, // Generate new GUID and use string representation
      workspaceId,
      timestamp: Date.now(),
      eventType,
      participantId,
      metadata,
    };

    // Get or create audit key for this workspace
    const auditKey = this.getAuditKey(workspaceId);

    // Encrypt the log entry
    const encrypted = await this.encryptLogEntry(entry, auditKey);

    // Store encrypted log
    const workspaceIdStr = workspaceId.toString();
    if (!this.logs.has(workspaceIdStr)) {
      this.logs.set(workspaceIdStr, []);
    }
    this.logs.get(workspaceIdStr)!.push(encrypted);
  }

  /**
   * Get audit logs for a workspace (encrypted)
   */
  getWorkspaceLogs(workspaceId: WorkspaceId): EncryptedAuditLogEntry[] {
    const workspaceIdStr = workspaceId.toString();
    return this.logs.get(workspaceIdStr) || [];
  }

  /**
   * Encrypt an audit log entry
   */
  private async encryptLogEntry(
    entry: AuditLogEntry,
    auditKey: Buffer
  ): Promise<EncryptedAuditLogEntry> {
    // Serialize entry to JSON, converting GuidV4 objects to strings
    const serializable = {
      ...entry,
      workspaceId: entry.workspaceId.toString(),
      participantId: entry.participantId?.toString(),
    };
    const plaintext = Buffer.from(JSON.stringify(serializable), 'utf8');

    // Generate random nonce (12 bytes for GCM)
    const nonce = randomBytes(12);

    // Encrypt using AES-256-GCM
    const cipher = createCipheriv('aes-256-gcm', auditKey, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      id: entry.id,
      workspaceId: entry.workspaceId,
      timestamp: entry.timestamp,
      encryptedContent: ciphertext,
      nonce,
      authTag,
    };
  }

  /**
   * Decrypt an audit log entry (for authorized access)
   */
  async decryptLogEntry(
    encrypted: EncryptedAuditLogEntry,
    auditKey: Buffer
  ): Promise<AuditLogEntry> {
    // Decrypt using AES-256-GCM
    const decipher = createDecipheriv(
      'aes-256-gcm',
      auditKey,
      encrypted.nonce
    );
    decipher.setAuthTag(encrypted.authTag);

    const plaintext = Buffer.concat([
      decipher.update(encrypted.encryptedContent),
      decipher.final(),
    ]);

    // Parse JSON
    const parsed = JSON.parse(plaintext.toString('utf8'));
    
    // Convert string IDs back to GuidV4 objects
    return {
      ...parsed,
      workspaceId: GuidV4.parse(parsed.workspaceId),
      participantId: parsed.participantId ? GuidV4.parse(parsed.participantId) : undefined,
    };
  }

  /**
   * Delete all audit logs for a workspace (on expiration)
   */
  deleteWorkspaceLogs(workspaceId: WorkspaceId): void {
    const workspaceIdStr = workspaceId.toString();
    
    // Delete logs
    this.logs.delete(workspaceIdStr);
    
    // Delete and zero out audit key
    const auditKey = this.auditKeys.get(workspaceIdStr);
    if (auditKey) {
      // Overwrite key with random data then zeros
      randomBytes(32).copy(auditKey);
      auditKey.fill(0);
      this.auditKeys.delete(workspaceIdStr);
    }
  }

  /**
   * Get or create audit key for a workspace
   */
  getAuditKey(workspaceId: WorkspaceId): Buffer {
    const workspaceIdStr = workspaceId.toString();
    
    if (!this.auditKeys.has(workspaceIdStr)) {
      // Generate new 256-bit audit key
      const auditKey = randomBytes(32);
      this.auditKeys.set(workspaceIdStr, auditKey);
    }
    
    return this.auditKeys.get(workspaceIdStr)!;
  }
}
