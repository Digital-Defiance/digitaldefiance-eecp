/**
 * @module rate-limiter
 * 
 * Rate Limiter - Implements rate limiting for operations, workspace creation, and participant limits.
 * 
 * This module provides backpressure signals when limits are exceeded to prevent:
 * - Operation flooding from malicious or buggy clients
 * - Workspace creation abuse
 * - Workspace overcrowding
 * 
 * Rate limiting strategies:
 * - Operations: Per-participant sliding window (operations per second)
 * - Workspace creation: Per-IP sliding window (creations per hour)
 * - Participants: Per-workspace maximum count
 * 
 * Features:
 * - Sliding window rate limiting
 * - Automatic cleanup of expired tracking data
 * - Configurable limits
 * - Retry-after hints for clients
 * 
 * @example
 * ```typescript
 * import { RateLimiter } from './rate-limiter';
 * 
 * const limiter = new RateLimiter({
 *   operationsPerSecond: 100,
 *   workspaceCreationsPerHour: 10,
 *   maxParticipantsPerWorkspace: 50
 * });
 * 
 * // Check operation rate
 * const result = limiter.checkOperationRate(workspaceId, participantId);
 * if (!result.allowed) {
 *   console.log(`Rate limited: ${result.reason}`);
 *   console.log(`Retry after ${result.retryAfter}ms`);
 * }
 * 
 * // Record operation
 * limiter.recordOperation(workspaceId, participantId);
 * 
 * // Stop limiter
 * limiter.stop();
 * ```
 */

import { WorkspaceId, ParticipantId } from '@digitaldefiance/eecp-protocol';

/**
 * Rate limit configuration options.
 * 
 * @interface RateLimitConfig
 * @property {number} operationsPerSecond - Maximum operations per second per participant
 * @property {number} workspaceCreationsPerHour - Maximum workspace creations per hour per IP
 * @property {number} maxParticipantsPerWorkspace - Maximum participants allowed per workspace
 * 
 * @example
 * ```typescript
 * const config: RateLimitConfig = {
 *   operationsPerSecond: 100,
 *   workspaceCreationsPerHour: 10,
 *   maxParticipantsPerWorkspace: 50
 * };
 * ```
 */
export interface RateLimitConfig {
  operationsPerSecond: number; // Operations per second per participant
  workspaceCreationsPerHour: number; // Workspace creations per hour per IP
  maxParticipantsPerWorkspace: number; // Maximum participants per workspace
}

/**
 * Rate limit result returned by check methods.
 * 
 * @interface RateLimitResult
 * @property {boolean} allowed - Whether the action is allowed
 * @property {number} [retryAfter] - Milliseconds to wait before retry (if not allowed)
 * @property {string} [reason] - Human-readable reason for denial (if not allowed)
 * 
 * @example
 * ```typescript
 * const result: RateLimitResult = {
 *   allowed: false,
 *   retryAfter: 500,
 *   reason: 'Rate limit exceeded: 100 operations per second'
 * };
 * ```
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // Milliseconds to wait before retry
  reason?: string;
}

/**
 * Operation rate tracking data.
 * 
 * Tracks operation count within a sliding time window.
 * 
 * @interface OperationRateTracker
 * @property {number} count - Number of operations in current window
 * @property {number} windowStart - Timestamp when current window started
 */
interface OperationRateTracker {
  count: number;
  windowStart: number;
}

/**
 * Workspace creation rate tracking data.
 * 
 * Tracks workspace creation count within a sliding time window.
 * 
 * @interface WorkspaceCreationTracker
 * @property {number} count - Number of workspace creations in current window
 * @property {number} windowStart - Timestamp when current window started
 */
interface WorkspaceCreationTracker {
  count: number;
  windowStart: number;
}

/**
 * Rate limiter interface defining rate limiting operations.
 * 
 * @interface IRateLimiter
 */
export interface IRateLimiter {
  /**
   * Check if operation is allowed for participant.
   * 
   * Uses sliding window to track operations per second.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {ParticipantId} participantId - Participant ID
   * @returns {RateLimitResult} Result indicating if operation is allowed
   */
  checkOperationRate(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): RateLimitResult;

  /**
   * Check if workspace creation is allowed for IP address.
   * 
   * Uses sliding window to track creations per hour.
   * 
   * @param {string} ipAddress - Client IP address
   * @returns {RateLimitResult} Result indicating if creation is allowed
   */
  checkWorkspaceCreationRate(ipAddress: string): RateLimitResult;

  /**
   * Check if participant can join workspace.
   * 
   * Validates against maximum participant limit.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {number} currentParticipantCount - Current number of participants
   * @returns {RateLimitResult} Result indicating if join is allowed
   */
  checkParticipantLimit(
    workspaceId: WorkspaceId,
    currentParticipantCount: number
  ): RateLimitResult;

  /**
   * Record an operation for rate tracking.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {ParticipantId} participantId - Participant ID
   */
  recordOperation(workspaceId: WorkspaceId, participantId: ParticipantId): void;

  /**
   * Record a workspace creation for rate tracking.
   * 
   * @param {string} ipAddress - Client IP address
   */
  recordWorkspaceCreation(ipAddress: string): void;

  /**
   * Clean up expired rate limit entries.
   * 
   * Removes tracking data for expired time windows.
   */
  cleanup(): void;

  /**
   * Stop the rate limiter and clean up resources.
   * 
   * Stops cleanup timer and releases resources.
   */
  stop(): void;
}

/**
 * Rate limiter implementation using sliding window algorithm.
 * 
 * Tracks rate limits for:
 * - Operations per participant
 * - Workspace creations per IP
 * - Participants per workspace
 * 
 * @class RateLimiter
 * @implements {IRateLimiter}
 * 
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   operationsPerSecond: 100,
 *   workspaceCreationsPerHour: 10,
 *   maxParticipantsPerWorkspace: 50
 * });
 * 
 * // Check and record operation
 * const result = limiter.checkOperationRate(workspaceId, participantId);
 * if (result.allowed) {
 *   limiter.recordOperation(workspaceId, participantId);
 * }
 * ```
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
   * Check if operation is allowed for participant.
   * 
   * Uses sliding window to track operations per second.
   * Returns retry-after hint if limit exceeded.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {ParticipantId} participantId - Participant ID
   * @returns {RateLimitResult} Result indicating if operation is allowed
   * 
   * @example
   * ```typescript
   * const result = limiter.checkOperationRate(workspaceId, participantId);
   * if (!result.allowed) {
   *   console.log(`Wait ${result.retryAfter}ms before retry`);
   * }
   * ```
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
   * Check if workspace creation is allowed for IP address.
   * 
   * Uses sliding window to track creations per hour.
   * Returns retry-after hint if limit exceeded.
   * 
   * @param {string} ipAddress - Client IP address
   * @returns {RateLimitResult} Result indicating if creation is allowed
   * 
   * @example
   * ```typescript
   * const result = limiter.checkWorkspaceCreationRate(clientIp);
   * if (!result.allowed) {
   *   console.log(`Workspace creation rate limit exceeded`);
   * }
   * ```
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
   * Check if participant can join workspace.
   * 
   * Validates against maximum participant limit.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {number} currentParticipantCount - Current number of participants
   * @returns {RateLimitResult} Result indicating if join is allowed
   * 
   * @example
   * ```typescript
   * const count = participantManager.getWorkspaceParticipants(workspaceId).length;
   * const result = limiter.checkParticipantLimit(workspaceId, count);
   * if (!result.allowed) {
   *   console.log('Workspace is full');
   * }
   * ```
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
   * Record an operation for rate tracking.
   * 
   * Updates operation count in current sliding window.
   * Creates new window if current window expired.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {ParticipantId} participantId - Participant ID
   * 
   * @example
   * ```typescript
   * // Record operation after checking rate limit
   * if (limiter.checkOperationRate(workspaceId, participantId).allowed) {
   *   limiter.recordOperation(workspaceId, participantId);
   * }
   * ```
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
   * Record a workspace creation for rate tracking.
   * 
   * Updates creation count in current sliding window.
   * Creates new window if current window expired.
   * 
   * @param {string} ipAddress - Client IP address
   * 
   * @example
   * ```typescript
   * // Record creation after checking rate limit
   * if (limiter.checkWorkspaceCreationRate(clientIp).allowed) {
   *   limiter.recordWorkspaceCreation(clientIp);
   * }
   * ```
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
   * Clean up expired rate limit entries.
   * 
   * Removes tracking data for windows that are more than 2x expired.
   * Called automatically by cleanup timer every minute.
   * 
   * @example
   * ```typescript
   * // Cleanup is automatic, but can be called manually
   * limiter.cleanup();
   * ```
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
   * Stop the rate limiter and clean up resources.
   * 
   * Stops the cleanup timer and releases resources.
   * Should be called when shutting down the server.
   * 
   * @example
   * ```typescript
   * // Stop limiter during server shutdown
   * limiter.stop();
   * ```
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Get operation tracking key.
   * 
   * Combines workspace ID and participant ID into unique key.
   * 
   * @private
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {ParticipantId} participantId - Participant ID
   * @returns {string} Tracking key
   */
  private getOperationKey(workspaceId: WorkspaceId, participantId: ParticipantId): string {
    // Convert GuidV4 to string for map key
    const wsId = workspaceId.toString();
    const pId = participantId.toString();
    return `${wsId}:${pId}`;
  }

  /**
   * Get rate limiter configuration.
   * 
   * @returns {RateLimitConfig} Copy of configuration
   * 
   * @example
   * ```typescript
   * const config = limiter.getConfig();
   * console.log(`Max operations: ${config.operationsPerSecond}/sec`);
   * ```
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }
}
