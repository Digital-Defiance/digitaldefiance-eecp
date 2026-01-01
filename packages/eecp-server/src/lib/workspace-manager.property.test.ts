/**
 * Property-based tests for WorkspaceManager
 * Feature: eecp-full-system
 */

import * as fc from 'fast-check';
import { WorkspaceManager } from './workspace-manager.js';
import { WorkspaceConfig } from '@digitaldefiance-eecp/eecp-protocol';
import { randomUUID } from 'crypto';

describe('WorkspaceManager Property Tests', () => {
  let manager: WorkspaceManager;

  beforeEach(() => {
    manager = new WorkspaceManager();
  });

  afterEach(() => {
    manager.cleanup();
  });

  /**
   * Feature: eecp-full-system, Property 1: Unique Workspace Generation
   * Validates: Requirements 1.1
   * 
   * For any workspace creation request, the generated workspace ID must be unique
   * and not collide with any existing workspace ID.
   */
  test('Property 1: Unique Workspace Generation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }), // Number of workspaces to create
        fc.constantFrom(5, 15, 30, 60), // Valid duration in minutes
        async (numWorkspaces, durationMinutes) => {
          const manager = new WorkspaceManager();
          const createdIds = new Set<string>();

          try {
            // Create multiple workspaces
            for (let i = 0; i < numWorkspaces; i++) {
              const now = Date.now();
              const config: WorkspaceConfig = {
                id: randomUUID(), // Each workspace gets a unique ID
                createdAt: now,
                expiresAt: now + durationMinutes * 60 * 1000,
                timeWindow: {
                  startTime: now,
                  endTime: now + durationMinutes * 60 * 1000,
                  rotationInterval: durationMinutes,
                  gracePeriod: 60000,
                },
                maxParticipants: 50,
                allowExtension: false,
              };

              const workspace = await manager.createWorkspace(
                config,
                Buffer.from('creator-public-key')
              );

              // Verify the workspace ID is unique
              expect(createdIds.has(workspace.id)).toBe(false);
              createdIds.add(workspace.id);

              // Verify we can retrieve the workspace by its ID
              const retrieved = await manager.getWorkspace(workspace.id);
              expect(retrieved).not.toBeNull();
              expect(retrieved?.id).toBe(workspace.id);
            }

            // Verify all workspaces have unique IDs
            expect(createdIds.size).toBe(numWorkspaces);
          } finally {
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: eecp-full-system, Property 2: Valid Expiration Duration
   * Validates: Requirements 1.2
   * 
   * For any workspace creation request, the system must accept expiration durations
   * of 5, 15, 30, or 60 minutes and reject all other values.
   */
  test('Property 2: Valid Expiration Duration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(5, 15, 30, 60), // Valid durations
        async (durationMinutes) => {
          const manager = new WorkspaceManager();

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: randomUUID(),
              createdAt: now,
              expiresAt: now + durationMinutes * 60 * 1000,
              timeWindow: {
                startTime: now,
                endTime: now + durationMinutes * 60 * 1000,
                rotationInterval: durationMinutes,
                gracePeriod: 60000,
              },
              maxParticipants: 50,
              allowExtension: false,
            };

            // Valid durations should be accepted
            const workspace = await manager.createWorkspace(
              config,
              Buffer.from('creator-public-key')
            );

            expect(workspace.status).toBe('active');
            expect(workspace.expiresAt).toBe(config.expiresAt);
          } finally {
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );

    // Test that invalid durations are rejected
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 120 }).filter(d => ![5, 15, 30, 60].includes(d)), // Invalid durations
        async (durationMinutes) => {
          const manager = new WorkspaceManager();

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: randomUUID(),
              createdAt: now,
              expiresAt: now + durationMinutes * 60 * 1000,
              timeWindow: {
                startTime: now,
                endTime: now + durationMinutes * 60 * 1000,
                rotationInterval: 15,
                gracePeriod: 60000,
              },
              maxParticipants: 50,
              allowExtension: false,
            };

            // Invalid durations should be rejected
            await expect(
              manager.createWorkspace(config, Buffer.from('creator-public-key'))
            ).rejects.toThrow('Invalid expiration duration');
          } finally {
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: eecp-full-system, Property 4: Workspace Extension
   * Validates: Requirements 1.5
   * 
   * For any workspace with extension enabled, extending the workspace before expiration
   * must update the expiration time and generate new temporal keys for the extended period.
   */
  test('Property 4: Workspace Extension', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(5, 15, 30, 60), // Initial duration
        fc.integer({ min: 5, max: 60 }), // Extension duration
        async (initialDuration, extensionMinutes) => {
          const manager = new WorkspaceManager();

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: randomUUID(),
              createdAt: now,
              expiresAt: now + initialDuration * 60 * 1000,
              timeWindow: {
                startTime: now,
                endTime: now + initialDuration * 60 * 1000,
                rotationInterval: initialDuration,
                gracePeriod: 60000,
              },
              maxParticipants: 50,
              allowExtension: true, // Extension enabled
            };

            const workspace = await manager.createWorkspace(
              config,
              Buffer.from('creator-public-key')
            );

            const originalExpiration = workspace.expiresAt;

            // Extend the workspace
            await manager.extendWorkspace(workspace.id, extensionMinutes);

            // Verify expiration time was updated
            const extended = await manager.getWorkspace(workspace.id);
            expect(extended).not.toBeNull();
            expect(extended?.expiresAt).toBe(
              originalExpiration + extensionMinutes * 60 * 1000
            );
            expect(extended?.config.expiresAt).toBe(extended?.expiresAt);
            expect(extended?.config.timeWindow.endTime).toBe(extended?.expiresAt);
            expect(extended?.status).toBe('active');
          } finally {
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: eecp-full-system, Property 5: Workspace Revocation
   * Validates: Requirements 1.6
   * 
   * For any workspace, revoking it must immediately destroy all temporal keys,
   * close all participant connections, and prevent new operations.
   */
  test('Property 5: Workspace Revocation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(5, 15, 30, 60), // Duration
        async (durationMinutes) => {
          const manager = new WorkspaceManager();

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: randomUUID(),
              createdAt: now,
              expiresAt: now + durationMinutes * 60 * 1000,
              timeWindow: {
                startTime: now,
                endTime: now + durationMinutes * 60 * 1000,
                rotationInterval: durationMinutes,
                gracePeriod: 60000,
              },
              maxParticipants: 50,
              allowExtension: true, // Allow extension to test that revocation prevents it
            };

            const workspace = await manager.createWorkspace(
              config,
              Buffer.from('creator-public-key')
            );

            // Verify workspace is initially active
            expect(workspace.status).toBe('active');
            expect(manager.isWorkspaceExpired(workspace)).toBe(false);

            // Revoke the workspace
            await manager.revokeWorkspace(workspace.id);

            // Verify workspace is revoked
            const revoked = await manager.getWorkspace(workspace.id);
            expect(revoked).not.toBeNull();
            expect(revoked?.status).toBe('revoked');
            expect(revoked?.expiresAt).toBeLessThanOrEqual(Date.now());
            expect(manager.isWorkspaceExpired(revoked!)).toBe(true);

            // Verify workspace cannot be extended after revocation
            await expect(
              manager.extendWorkspace(workspace.id, 15)
            ).rejects.toThrow('Cannot extend expired workspace');
          } finally {
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
