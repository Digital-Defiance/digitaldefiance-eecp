/**
 * Workspace Manager
 * Manages workspace lifecycle including creation, retrieval, extension, and revocation
 */

import { WorkspaceConfig, WorkspaceId } from '@digitaldefiance-eecp/eecp-protocol';

export interface Workspace {
  id: WorkspaceId;
  config: WorkspaceConfig;
  encryptedMetadata: Buffer;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'revoked';
  participantCount: number;
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
}

export class WorkspaceManager implements IWorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private expirationTimers: Map<string, NodeJS.Timeout> = new Map();

  async createWorkspace(
    config: WorkspaceConfig,
    creatorPublicKey: Buffer
  ): Promise<Workspace> {
    // Validate expiration duration (5, 15, 30, or 60 minutes)
    const durationMinutes = Math.round((config.expiresAt - config.createdAt) / (60 * 1000));
    const validDurations = [5, 15, 30, 60];
    if (!validDurations.includes(durationMinutes)) {
      throw new Error(
        `Invalid expiration duration: ${durationMinutes} minutes. Must be one of: ${validDurations.join(', ')}`
      );
    }

    const workspace: Workspace = {
      id: config.id,
      config,
      encryptedMetadata: Buffer.alloc(0), // Will be set by caller
      createdAt: config.createdAt,
      expiresAt: config.expiresAt,
      status: 'active',
      participantCount: 0,
    };

    // Use string key for Map storage
    this.workspaces.set(workspace.id.asFullHexGuid, workspace);

    // Schedule expiration
    this.scheduleExpiration(workspace);

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

    // Note: In a full implementation, this would:
    // - Notify cleanup service to delete keys immediately
    // - Close all participant connections
    // - Delete workspace from memory after grace period
  }

  isWorkspaceExpired(workspace: Workspace): boolean {
    return workspace.expiresAt <= Date.now() || workspace.status !== 'active';
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
    
    // Note: In a full implementation, this would:
    // - Notify cleanup service to delete keys
    // - Close all participant connections
    // - Delete workspace from memory after grace period
    // For now, we keep the workspace in memory for testing
  }
}
