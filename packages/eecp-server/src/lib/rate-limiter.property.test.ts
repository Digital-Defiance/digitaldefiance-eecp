/**
 * Property-based tests for Rate Limiter
 * Tests rate limiting backpressure, workspace creation limits, and participant limits
 */

import * as fc from 'fast-check';
import { RateLimiter } from './rate-limiter';
import { GuidV4 } from '@digitaldefiance/ecies-lib';

describe('Rate Limiter Property Tests', () => {
  /**
   * Property 47: Rate Limiting Backpressure
   * For any client that exceeds the rate limit, the server must return a backpressure signal
   * and delay processing of subsequent operations.
   * Validates: Requirements 15.5, 17.1, 17.2
   */
  describe('Feature: eecp-full-system, Property 47: Rate Limiting Backpressure', () => {
    it('should return backpressure signal when operation rate limit is exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 200 }), // Number of operations to attempt
          fc.integer({ min: 10, max: 100 }), // Operations per second limit
          async (operationCount, opsPerSecond) => {
            // Create rate limiter with custom config
            const rateLimiter = new RateLimiter({
              operationsPerSecond: opsPerSecond,
              workspaceCreationsPerHour: 10,
              maxParticipantsPerWorkspace: 50,
            });

            const workspaceId = GuidV4.new();
            const participantId = GuidV4.new();

            let allowedCount = 0;
            let deniedCount = 0;
            let hasRetryAfter = false;

            // Attempt operations rapidly
            for (let i = 0; i < operationCount; i++) {
              const result = rateLimiter.checkOperationRate(workspaceId, participantId);

              if (result.allowed) {
                allowedCount++;
                rateLimiter.recordOperation(workspaceId, participantId);
              } else {
                deniedCount++;
                // Verify backpressure signal includes retryAfter
                if (result.retryAfter !== undefined && result.retryAfter > 0) {
                  hasRetryAfter = true;
                }
              }
            }

            // Stop rate limiter
            rateLimiter.stop();

            // If we exceeded the limit, we should have denials
            if (operationCount > opsPerSecond) {
              // Should have some denied operations
              expect(deniedCount).toBeGreaterThan(0);
              // Should have backpressure signal with retryAfter
              expect(hasRetryAfter).toBe(true);
              // Allowed count should not exceed the limit
              expect(allowedCount).toBeLessThanOrEqual(opsPerSecond);
            } else {
              // All operations should be allowed if under limit
              expect(allowedCount).toBe(operationCount);
              expect(deniedCount).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow operations after rate limit window expires', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 50 }), // Operations per second limit
          async (opsPerSecond) => {
            const rateLimiter = new RateLimiter({
              operationsPerSecond: opsPerSecond,
              workspaceCreationsPerHour: 10,
              maxParticipantsPerWorkspace: 50,
            });

            const workspaceId = GuidV4.new();
            const participantId = GuidV4.new();

            // Fill up the rate limit
            for (let i = 0; i < opsPerSecond; i++) {
              const result = rateLimiter.checkOperationRate(workspaceId, participantId);
              if (result.allowed) {
                rateLimiter.recordOperation(workspaceId, participantId);
              }
            }

            // Next operation should be denied
            const deniedResult = rateLimiter.checkOperationRate(workspaceId, participantId);
            expect(deniedResult.allowed).toBe(false);
            expect(deniedResult.retryAfter).toBeDefined();

            // Wait for the rate limit window to expire (1 second + buffer)
            await new Promise((resolve) => setTimeout(resolve, 1100));

            // Now operations should be allowed again
            const allowedResult = rateLimiter.checkOperationRate(workspaceId, participantId);
            expect(allowedResult.allowed).toBe(true);

            rateLimiter.stop();
          }
        ),
        { numRuns: 20 } // Fewer runs due to timing
      );
    }, 30000); // 30 second timeout for timing-based test
  });

  /**
   * Property 49: Workspace Creation Rate Limiting
   * For any IP address, the system must limit workspace creation to 10 workspaces per hour.
   * Validates: Requirements 17.3
   */
  describe('Feature: eecp-full-system, Property 49: Workspace Creation Rate Limiting', () => {
    it('should limit workspace creation to configured rate per IP', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 30 }), // Number of creation attempts
          fc.integer({ min: 5, max: 15 }), // Creations per hour limit
          fc.ipV4(), // IP address
          async (creationCount, creationsPerHour, ipAddress) => {
            const rateLimiter = new RateLimiter({
              operationsPerSecond: 100,
              workspaceCreationsPerHour: creationsPerHour,
              maxParticipantsPerWorkspace: 50,
            });

            let allowedCount = 0;
            let deniedCount = 0;
            let hasRetryAfter = false;

            // Attempt workspace creations
            for (let i = 0; i < creationCount; i++) {
              const result = rateLimiter.checkWorkspaceCreationRate(ipAddress);

              if (result.allowed) {
                allowedCount++;
                rateLimiter.recordWorkspaceCreation(ipAddress);
              } else {
                deniedCount++;
                // Verify backpressure signal includes retryAfter
                if (result.retryAfter !== undefined && result.retryAfter > 0) {
                  hasRetryAfter = true;
                }
              }
            }

            rateLimiter.stop();

            // If we exceeded the limit, we should have denials
            if (creationCount > creationsPerHour) {
              expect(deniedCount).toBeGreaterThan(0);
              expect(hasRetryAfter).toBe(true);
              expect(allowedCount).toBeLessThanOrEqual(creationsPerHour);
            } else {
              // All creations should be allowed if under limit
              expect(allowedCount).toBe(creationCount);
              expect(deniedCount).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce rate limit per IP address independently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.ipV4(), { minLength: 2, maxLength: 5 }), // Multiple IP addresses
          fc.integer({ min: 5, max: 10 }), // Creations per hour limit
          async (ipAddresses, creationsPerHour) => {
            const rateLimiter = new RateLimiter({
              operationsPerSecond: 100,
              workspaceCreationsPerHour: creationsPerHour,
              maxParticipantsPerWorkspace: 50,
            });

            // Each IP should be able to create up to the limit independently
            for (const ip of ipAddresses) {
              let allowedCount = 0;

              for (let i = 0; i < creationsPerHour; i++) {
                const result = rateLimiter.checkWorkspaceCreationRate(ip);
                if (result.allowed) {
                  allowedCount++;
                  rateLimiter.recordWorkspaceCreation(ip);
                }
              }

              // Each IP should be able to create up to the limit
              expect(allowedCount).toBe(creationsPerHour);

              // Next creation should be denied for this IP
              const deniedResult = rateLimiter.checkWorkspaceCreationRate(ip);
              expect(deniedResult.allowed).toBe(false);
            }

            rateLimiter.stop();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 50: Participant Limit Enforcement
   * For any workspace, the server must reject new participant joins when the participant count
   * reaches the maximum (50 participants).
   * Validates: Requirements 17.4
   */
  describe('Feature: eecp-full-system, Property 50: Participant Limit Enforcement', () => {
    it('should reject participants when workspace reaches maximum capacity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }), // Number of join attempts
          fc.integer({ min: 10, max: 60 }), // Max participants limit
          async (joinAttempts, maxParticipants) => {
            const rateLimiter = new RateLimiter({
              operationsPerSecond: 100,
              workspaceCreationsPerHour: 10,
              maxParticipantsPerWorkspace: maxParticipants,
            });

            const workspaceId = GuidV4.new();
            let allowedJoins = 0;
            let deniedJoins = 0;

            // Simulate participant joins
            for (let i = 0; i < joinAttempts; i++) {
              const currentCount = allowedJoins;
              const result = rateLimiter.checkParticipantLimit(workspaceId, currentCount);

              if (result.allowed) {
                allowedJoins++;
              } else {
                deniedJoins++;
                // Verify reason is provided
                expect(result.reason).toBeDefined();
                expect(result.reason).toContain('Participant limit exceeded');
              }
            }

            rateLimiter.stop();

            // Should not exceed maximum participants
            expect(allowedJoins).toBeLessThanOrEqual(maxParticipants);

            // If we attempted more joins than the limit, some should be denied
            if (joinAttempts > maxParticipants) {
              expect(deniedJoins).toBeGreaterThan(0);
              expect(deniedJoins).toBe(joinAttempts - maxParticipants);
            } else {
              // All joins should be allowed if under limit
              expect(allowedJoins).toBe(joinAttempts);
              expect(deniedJoins).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce participant limit per workspace independently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constant(GuidV4.new()), { minLength: 2, maxLength: 5 }), // Multiple workspaces
          fc.integer({ min: 10, max: 30 }), // Max participants limit
          async (workspaceIds, maxParticipants) => {
            const rateLimiter = new RateLimiter({
              operationsPerSecond: 100,
              workspaceCreationsPerHour: 10,
              maxParticipantsPerWorkspace: maxParticipants,
            });

            // Each workspace should be able to reach the limit independently
            for (const workspaceId of workspaceIds) {
              let allowedJoins = 0;

              for (let i = 0; i < maxParticipants; i++) {
                const result = rateLimiter.checkParticipantLimit(workspaceId, allowedJoins);
                if (result.allowed) {
                  allowedJoins++;
                }
              }

              // Each workspace should reach the limit
              expect(allowedJoins).toBe(maxParticipants);

              // Next join should be denied for this workspace
              const deniedResult = rateLimiter.checkParticipantLimit(workspaceId, allowedJoins);
              expect(deniedResult.allowed).toBe(false);
            }

            rateLimiter.stop();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
