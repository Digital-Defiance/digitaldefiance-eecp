/**
 * Rate Limiter
 * 
 * Implements rate limiting for operations, workspace creation, and participant limits.
 * Provides backpressure signals when limits are exceeded.
 */

import { WorkspaceId, ParticipantId } from '@digitaldefiance-eecp/eecp-protocol';
import { GuidV4 } from '@digitaldefiance/ecies-lib';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  operationsPerSecond: number; // Operations per second per participant
  workspaceCreationsPerHour: number; // Workspace creations per hour per IP
  maxParticipantsPerWorkspace: number; // Maximum participants per workspace
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // Milliseconds to wait before retry
  reason?: string;
}

/**
 * Operation rate tracking
 */
interface OperationRateTracker {
  count: number;
  windowStart: number;
}

/**
 * Workspace creation rate tracking
 */
interface WorkspaceCreationTracker {
  count: number;
  windowStart: number;
}

/**
 * Rate limiter interface
 */
export interface IRateLimiter {
  /**
   * Check if operation is allowed for participant
   */
  checkOperationRate(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): RateLimitResult;

  /**
   * Check if workspace creation is allowed for IP
   */
  checkWorkspaceCreationRate(ipAddress: string): RateLimitResult;

  /**
   * Check if participant can join workspace
   */
  checkParticipantLimit(
    workspaceId: WorkspaceId,
    currentParticipantCount: number
  ): RateLimitResult;

  /**
   * Record an operation for rate tracking
   */
  recordOperation(workspaceId: WorkspaceId, participantId: ParticipantId): void;

  /**
   * Record a workspace creation for rate tracking
   */
  recordWorkspaceCreation(ipAddress: string): void;

  /**
   * Clean up expired rate limit entries
   */
  cleanup(): void;
}

/**
 * Rate limiter implementation
 */
export class RateLimiter implements IRateLimiter {
  private operationTrackers: Map<string, OperationRateTracker> = new Map();
  private workspaceCreationTrackers: Map<string, WorkspaceCreationTracker> = new Map();
  private config: RateLimitConfig;
  private readonly OPERATION_WINDOW_MS = 1000; // 1 second window
  private readonly WORKSPACE_CREATION_WINDOW_MS = 3600000; // 1 hour window
  private readonly CLEANUP_INTERVAL_MS = 60000; // Clean up every minute
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      operationsPerSecond: config?.operationsPerSecond || 100,
      workspaceCreationsPerHour: config?.workspaceCreationsPerHour || 10,
      maxParticipantsPerWorkspace: config?.maxParticipantsPerWorkspace || 50,
    };

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Check if operation is allowed for participant
   */
  checkOperationRate(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): RateLimitResult {
    const key = this.getOperationKey(workspaceId, participantId);
    const now = Date.now();
    const tracker = this.operationTrackers.get(key);

    if (!tracker) {
      // First operation in window
      return { allowed: true };
    }

    // Check if we're in a new window
    if (now - tracker.windowStart >= this.OPERATION_WINDOW_MS) {
      // New window, reset counter
      return { allowed: true };
    }

    // Check if limit exceeded
    if (tracker.count >= this.config.operationsPerSecond) {
      const retryAfter = this.OPERATION_WINDOW_MS - (now - tracker.windowStart);
      return {
        allowed: false,
        retryAfter,
        reason: `Rate limit exceeded: ${this.config.operationsPerSecond} operations per second`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if workspace creation is allowed for IP
   */
  checkWorkspaceCreationRate(ipAddress: string): RateLimitResult {
    const now = Date.now();
    const tracker = this.workspaceCreationTrackers.get(ipAddress);

    if (!tracker) {
      // First creation in window
      return { allowed: true };
    }

    // Check if we're in a new window
    if (now - tracker.windowStart >= this.WORKSPACE_CREATION_WINDOW_MS) {
      // New window, reset counter
      return { allowed: true };
    }

    // Check if limit exceeded
    if (tracker.count >= this.config.workspaceCreationsPerHour) {
      const retryAfter = this.WORKSPACE_CREATION_WINDOW_MS - (now - tracker.windowStart);
      return {
        allowed: false,
        retryAfter,
        reason: `Rate limit exceeded: ${this.config.workspaceCreationsPerHour} workspace creations per hour`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if participant can join workspace
   */
  checkParticipantLimit(
    workspaceId: WorkspaceId,
    currentParticipantCount: number
  ): RateLimitResult {
    if (currentParticipantCount >= this.config.maxParticipantsPerWorkspace) {
      return {
        allowed: false,
        reason: `Participant limit exceeded: maximum ${this.config.maxParticipantsPerWorkspace} participants per workspace`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record an operation for rate tracking
   */
  recordOperation(workspaceId: WorkspaceId, participantId: ParticipantId): void {
    const key = this.getOperationKey(workspaceId, participantId);
    const now = Date.now();
    const tracker = this.operationTrackers.get(key);

    if (!tracker || now - tracker.windowStart >= this.OPERATION_WINDOW_MS) {
      // Start new window
      this.operationTrackers.set(key, {
        count: 1,
        windowStart: now,
      });
    } else {
      // Increment counter in current window
      tracker.count++;
    }
  }

  /**
   * Record a workspace creation for rate tracking
   */
  recordWorkspaceCreation(ipAddress: string): void {
    const now = Date.now();
    const tracker = this.workspaceCreationTrackers.get(ipAddress);

    if (!tracker || now - tracker.windowStart >= this.WORKSPACE_CREATION_WINDOW_MS) {
      // Start new window
      this.workspaceCreationTrackers.set(ipAddress, {
        count: 1,
        windowStart: now,
      });
    } else {
      // Increment counter in current window
      tracker.count++;
    }
  }

  /**
   * Clean up expired rate limit entries
   */
  cleanup(): void {
    const now = Date.now();

    // Clean up operation trackers
    for (const [key, tracker] of this.operationTrackers.entries()) {
      if (now - tracker.windowStart >= this.OPERATION_WINDOW_MS * 2) {
        this.operationTrackers.delete(key);
      }
    }

    // Clean up workspace creation trackers
    for (const [key, tracker] of this.workspaceCreationTrackers.entries()) {
      if (now - tracker.windowStart >= this.WORKSPACE_CREATION_WINDOW_MS * 2) {
        this.workspaceCreationTrackers.delete(key);
      }
    }
  }

  /**
   * Stop cleanup timer
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Get operation tracking key
   */
  private getOperationKey(workspaceId: WorkspaceId, participantId: ParticipantId): string {
    // Convert GuidV4 to string for map key
    const wsId = workspaceId instanceof GuidV4 ? workspaceId.asHex : workspaceId.toString();
    const pId = participantId instanceof GuidV4 ? participantId.asHex : participantId.toString();
    return `${wsId}:${pId}`;
  }

  /**
   * Get configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }
}
