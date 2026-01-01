/**
 * Workspace Manager
 * Manages workspace lifecycle including creation, retrieval, extension, and revocation
 */

import { WorkspaceConfig, WorkspaceId, WorkspaceMetadata, ParticipantInfo } from '@digitaldefiance-eecp/eecp-protocol';
import { MultiRecipientEncryption, Participant } from '@digitaldefiance-eecp/eecp-crypto';
import { ECIESService, Member } from '@digitaldefiance/ecies-lib';
import type { IMultiEncryptedMessage } from '@digitaldefiance/ecies-lib';
import { IAuditLogger } from './audit-logger';
import { GuidV4 } from '@digitaldefiance/ecies-lib';

export interface Workspace {
  id: WorkspaceId;
  config: WorkspaceConfig;
  encryptedMetadata: IMultiEncryptedMessage; // Changed from Buffer to IMultiEncryptedMessage
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'revoked';
  participantCount: number;
  participants: Member[]; // Track participants for re-encryption
}

export interface IWorkspaceManager {
  /**
   * Create a new workspace
   */
  createWorkspace(
    config: WorkspaceConfig,
    creatorPublicKey: Buffer
  ): Promise<Workspace>;

  /**
   * Get workspace by ID
   */
  getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null>;

  /**
   * Extend workspace expiration
   */
  extendWorkspace(
    workspaceId: WorkspaceId,
    additionalMinutes: number
  ): Promise<void>;

  /**
   * Revoke workspace early
   */
  revokeWorkspace(workspaceId: WorkspaceId): Promise<void>;

  /**
   * Check if workspace is expired
   */
  isWorkspaceExpired(workspace: Workspace): boolean;

  /**
   * Update workspace metadata (triggers re-encryption)
   */
  updateMetadata(
    workspaceId: WorkspaceId,
    metadata: WorkspaceMetadata
  ): Promise<void>;

  /**
   * Add participant to workspace (triggers re-encryption)
   */
  addParticipant(
    workspaceId: WorkspaceId,
    participant: Member
  ): Promise<void>;

  /**
   * Remove participant from workspace (triggers re-encryption)
   */
  removeParticipant(
    workspaceId: WorkspaceId,
    participantId: Uint8Array
  ): Promise<void>;

  /**
   * Get encrypted metadata for a workspace
   */
  getEncryptedMetadata(workspaceId: WorkspaceId): Promise<IMultiEncryptedMessage | null>;

  /**
   * Get total workspace count
   */
  getWorkspaceCount(): number;
}

export class WorkspaceManager implements IWorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private expirationTimers: Map<string, NodeJS.Timeout> = new Map();
  private multiRecipientEncryption: MultiRecipientEncryption;
  private eciesService: ECIESService;
  private auditLogger?: IAuditLogger;

  constructor(eciesService: ECIESService, auditLogger?: IAuditLogger) {
    this.eciesService = eciesService;
    this.multiRecipientEncryption = new MultiRecipientEncryption(eciesService);
    this.auditLogger = auditLogger;
  }

  async createWorkspace(
    config: WorkspaceConfig,
    creatorPublicKey: Buffer
  ): Promise<Workspace> {
    // Validate expiration duration (5-120 minutes)
    const durationMinutes = Math.round((config.expiresAt - config.createdAt) / (60 * 1000));
    const MIN_DURATION = 5;
    const MAX_DURATION = 120;
    if (durationMinutes < MIN_DURATION || durationMinutes > MAX_DURATION) {
      throw new Error(
        `Invalid expiration duration: ${durationMinutes} minutes. Must be between ${MIN_DURATION} and ${MAX_DURATION} minutes.`
      );
    }

    // Create creator as a Member
    const creator = Participant.fromKeys(
      this.eciesService,
      new Uint8Array(16), // Temporary ID, will be replaced
      new Uint8Array(creatorPublicKey)
    );

    // Create initial metadata
    const metadata: WorkspaceMetadata = {
      config,
      participants: [{
        id: config.id, // Use workspace ID as creator ID for now
        publicKey: creatorPublicKey,
        joinedAt: config.createdAt,
        role: 'creator'
      }],
      currentTemporalKeyId: 'key-0',
      keyRotationSchedule: {
        currentKeyId: 'key-0',
        nextRotationAt: config.createdAt + config.timeWindow.rotationInterval * 60 * 1000
      }
    };

    // Encrypt metadata for creator
    const encryptedMetadata = await this.encryptMetadata(metadata, [creator.getMember()]);

    const workspace: Workspace = {
      id: config.id,
      config,
      encryptedMetadata,
      createdAt: config.createdAt,
      expiresAt: config.expiresAt,
      status: 'active',
      participantCount: 1,
      participants: [creator.getMember()],
    };

    // Use string key for Map storage
    this.workspaces.set(workspace.id.asFullHexGuid, workspace);

    // Schedule expiration
    this.scheduleExpiration(workspace);

    // Log workspace creation
    if (this.auditLogger) {
      await this.auditLogger.logEvent(
        config.id,
        'workspace_created',
        {
          expiresAt: config.expiresAt,
          rotationInterval: config.timeWindow.rotationInterval,
          maxParticipants: config.maxParticipants,
        }
      );
    }

    return workspace;
  }

  async getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
    return this.workspaces.get(workspaceId.asFullHexGuid) || null;
  }

  async extendWorkspace(
    workspaceId: WorkspaceId,
    additionalMinutes: number
  ): Promise<void> {
    const workspaceKey = workspaceId.asFullHexGuid;
    const workspace = this.workspaces.get(workspaceKey);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (!workspace.config.allowExtension) {
      throw new Error('Workspace extension not allowed');
    }

    if (this.isWorkspaceExpired(workspace)) {
      throw new Error('Cannot extend expired workspace');
    }

    // Update expiration time
    workspace.expiresAt += additionalMinutes * 60 * 1000;
    workspace.config.expiresAt = workspace.expiresAt;
    workspace.config.timeWindow.endTime = workspace.expiresAt;

    // Cancel existing timer and reschedule
    const existingTimer = this.expirationTimers.get(workspaceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    this.scheduleExpiration(workspace);

    // Log workspace extension
    if (this.auditLogger) {
      await this.auditLogger.logEvent(
        workspaceId,
        'workspace_extended',
        {
          additionalMinutes,
          newExpiresAt: workspace.expiresAt,
        }
      );
    }
  }

  async revokeWorkspace(workspaceId: WorkspaceId): Promise<void> {
    const workspaceKey = workspaceId.asFullHexGuid;
    const workspace = this.workspaces.get(workspaceKey);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    workspace.status = 'revoked';
    workspace.expiresAt = Date.now();

    // Cancel scheduled expiration
    const existingTimer = this.expirationTimers.get(workspaceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.expirationTimers.delete(workspaceKey);
    }

    // Log workspace revocation
    if (this.auditLogger) {
      await this.auditLogger.logEvent(
        workspaceId,
        'workspace_revoked',
        {
          revokedAt: Date.now(),
        }
      );
    }

    // Note: In a full implementation, this would:
    // - Notify cleanup service to delete keys immediately
    // - Close all participant connections
    // - Delete workspace from memory after grace period
  }

  isWorkspaceExpired(workspace: Workspace): boolean {
    return workspace.expiresAt <= Date.now() || workspace.status !== 'active';
  }

  async updateMetadata(
    workspaceId: WorkspaceId,
    metadata: WorkspaceMetadata
  ): Promise<void> {
    const workspaceKey = workspaceId.asFullHexGuid;
    const workspace = this.workspaces.get(workspaceKey);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Re-encrypt metadata for all current participants
    workspace.encryptedMetadata = await this.encryptMetadata(
      metadata,
      workspace.participants
    );
  }

  async addParticipant(
    workspaceId: WorkspaceId,
    participant: Member
  ): Promise<void> {
    const workspaceKey = workspaceId.asFullHexGuid;
    const workspace = this.workspaces.get(workspaceKey);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Add participant to list
    workspace.participants.push(participant);
    workspace.participantCount = workspace.participants.length;

    // Decrypt current metadata (we need to have at least one participant with private key)
    // For now, we'll create new metadata with the updated participant list
    const metadata: WorkspaceMetadata = {
      config: workspace.config,
      participants: workspace.participants.map((p, idx) => ({
        id: workspace.config.id, // Placeholder
        publicKey: p.publicKey,
        joinedAt: workspace.createdAt + idx * 1000,
        role: idx === 0 ? 'creator' : 'editor'
      })),
      currentTemporalKeyId: 'key-0',
      keyRotationSchedule: {
        currentKeyId: 'key-0',
        nextRotationAt: workspace.createdAt + workspace.config.timeWindow.rotationInterval * 60 * 1000
      }
    };

    // Re-encrypt for all participants including the new one
    workspace.encryptedMetadata = await this.encryptMetadata(
      metadata,
      workspace.participants
    );
  }

  async removeParticipant(
    workspaceId: WorkspaceId,
    participantId: Uint8Array
  ): Promise<void> {
    const workspaceKey = workspaceId.asFullHexGuid;
    const workspace = this.workspaces.get(workspaceKey);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Remove participant from list
    workspace.participants = workspace.participants.filter(
      p => !this.areIdsEqual(p.id, participantId)
    );
    workspace.participantCount = workspace.participants.length;

    // Create updated metadata
    const metadata: WorkspaceMetadata = {
      config: workspace.config,
      participants: workspace.participants.map((p, idx) => ({
        id: workspace.config.id, // Placeholder
        publicKey: p.publicKey,
        joinedAt: workspace.createdAt + idx * 1000,
        role: idx === 0 ? 'creator' : 'editor'
      })),
      currentTemporalKeyId: 'key-0',
      keyRotationSchedule: {
        currentKeyId: 'key-0',
        nextRotationAt: workspace.createdAt + workspace.config.timeWindow.rotationInterval * 60 * 1000
      }
    };

    // Re-encrypt for remaining participants only
    workspace.encryptedMetadata = await this.encryptMetadata(
      metadata,
      workspace.participants
    );
  }

  async getEncryptedMetadata(workspaceId: WorkspaceId): Promise<IMultiEncryptedMessage | null> {
    const workspace = await this.getWorkspace(workspaceId);
    return workspace ? workspace.encryptedMetadata : null;
  }

  /**
   * Get total workspace count
   */
  getWorkspaceCount(): number {
    return this.workspaces.size;
  }

  /**
   * Encrypt metadata for multiple recipients
   * @private
   */
  private async encryptMetadata(
    metadata: WorkspaceMetadata,
    recipients: Member[]
  ): Promise<IMultiEncryptedMessage> {
    // Serialize metadata to JSON
    const metadataJson = JSON.stringify(metadata);
    const metadataBytes = new TextEncoder().encode(metadataJson);

    // Encrypt for all recipients using ECIES multi-recipient encryption
    return await this.multiRecipientEncryption.encryptForRecipients(
      metadataBytes,
      recipients
    );
  }

  /**
   * Helper to compare participant IDs
   * @private
   */
  private areIdsEqual(id1: Uint8Array, id2: Uint8Array): boolean {
    if (id1.length !== id2.length) return false;
    for (let i = 0; i < id1.length; i++) {
      if (id1[i] !== id2[i]) return false;
    }
    return true;
  }

  /**
   * Clean up all timers (for testing)
   */
  cleanup(): void {
    for (const timer of this.expirationTimers.values()) {
      clearTimeout(timer);
    }
    this.expirationTimers.clear();
  }

  /**
   * Schedule workspace expiration
   * @private
   */
  private scheduleExpiration(workspace: Workspace): void {
    const delay = workspace.expiresAt - Date.now();
    
    // Only schedule if expiration is in the future
    if (delay > 0) {
      const timer = setTimeout(() => {
        this.expireWorkspace(workspace);
      }, delay);
      
      this.expirationTimers.set(workspace.id.asFullHexGuid, timer);
    }
  }

  /**
   * Expire a workspace
   * @private
   */
  private async expireWorkspace(workspace: Workspace): Promise<void> {
    workspace.status = 'expired';
    this.expirationTimers.delete(workspace.id.asFullHexGuid);
    
    // Log workspace expiration
    if (this.auditLogger) {
      await this.auditLogger.logEvent(
        workspace.id,
        'workspace_expired',
        {
          expiredAt: Date.now(),
        }
      );
      
      // Delete audit logs for this workspace
      this.auditLogger.deleteWorkspaceLogs(workspace.id);
    }
    
    // Note: In a full implementation, this would:
    // - Notify cleanup service to delete keys
    // - Close all participant connections
    // - Delete workspace from memory after grace period
    // For now, we keep the workspace in memory for testing
  }
}
