/**
 * Property-based tests for WorkspaceManager
 * Feature: eecp-full-system
 */

import * as fc from 'fast-check';
import { WorkspaceManager } from './workspace-manager.js';
import { WorkspaceConfig } from '@digitaldefiance/eecp-protocol';
import { ECIESService, Member } from '@digitaldefiance/ecies-lib';
import { GuidV4 } from '@digitaldefiance/ecies-lib';

describe('WorkspaceManager Property Tests', () => {
  let manager: WorkspaceManager;
  let eciesService: ECIESService;

  beforeEach(() => {
    eciesService = new ECIESService();
    manager = new WorkspaceManager(eciesService);
  });

  afterEach(() => {
    manager.cleanup();
  });

  // Helper function to create a proper creator with keys
  async function createCreator(eciesService: ECIESService, name: string): Promise<Member> {
    const memberWithMnemonic = await Member.newMember(
      eciesService,
      0, // MemberType.User
      name,
      `${name.toLowerCase()}@eecp.local` as any
    );
    return memberWithMnemonic.member as Member;
  }

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
        fc.integer({ min: 5, max: 120 }), // Valid duration in minutes (5-120)
        async (numWorkspaces, durationMinutes) => {
          const eciesService = new ECIESService();
          const manager = new WorkspaceManager(eciesService);
          const createdIds = new Set<string>();
          const creators: Member[] = [];

          try {
            // Create multiple workspaces
            for (let i = 0; i < numWorkspaces; i++) {
              const now = Date.now();
              
              // Generate a proper creator with keys
              const creator = await createCreator(eciesService, `Creator-${i}`);
              creators.push(creator);
              
              const config: WorkspaceConfig = {
                id: GuidV4.new(), // Each workspace gets a unique ID
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
                Buffer.from(creator.publicKey)
              );

              // Verify the workspace ID is unique
              expect(createdIds.has(workspace.id.asFullHexGuid)).toBe(false);
              createdIds.add(workspace.id.asFullHexGuid);

              // Verify we can retrieve the workspace by its ID
              const retrieved = await manager.getWorkspace(workspace.id);
              expect(retrieved).not.toBeNull();
              expect(retrieved?.id.asFullHexGuid).toBe(workspace.id.asFullHexGuid);
            }

            // Verify all workspaces have unique IDs
            expect(createdIds.size).toBe(numWorkspaces);
          } finally {
            // Clean up
            creators.forEach(c => c.dispose());
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000); // 120 second timeout for creating up to 100 workspaces

  /**
   * Feature: eecp-full-system, Property 2: Valid Expiration Duration
   * Validates: Requirements 1.2
   * 
   * For any workspace creation request, the system must accept expiration durations
   * between 5 and 120 minutes and reject values outside this range.
   */
  test('Property 2: Valid Expiration Duration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 120 }), // Valid durations (5-120 minutes)
        async (durationMinutes) => {
          const eciesService = new ECIESService();
          const manager = new WorkspaceManager(eciesService);
          const creator = await createCreator(eciesService, 'Creator');

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: GuidV4.new(),
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
              Buffer.from(creator.publicKey)
            );

            expect(workspace.status).toBe('active');
            expect(workspace.expiresAt).toBe(config.expiresAt);
          } finally {
            creator.dispose();
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );

    // Test that invalid durations are rejected
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: 1, max: 4 }), // Too short (1-4 minutes)
          fc.integer({ min: 121, max: 200 }) // Too long (121-200 minutes)
        ),
        async (durationMinutes) => {
          const eciesService = new ECIESService();
          const manager = new WorkspaceManager(eciesService);
          const creator = await createCreator(eciesService, 'Creator');

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: GuidV4.new(),
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
              manager.createWorkspace(config, Buffer.from(creator.publicKey))
            ).rejects.toThrow('Invalid expiration duration');
          } finally {
            creator.dispose();
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // 30 second timeout

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
        fc.integer({ min: 5, max: 120 }), // Initial duration (5-120 minutes)
        fc.integer({ min: 5, max: 60 }), // Extension duration
        async (initialDuration, extensionMinutes) => {
          const eciesService = new ECIESService();
          const manager = new WorkspaceManager(eciesService);
          const creator = await createCreator(eciesService, 'Creator');

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: GuidV4.new(),
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
              Buffer.from(creator.publicKey)
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
            creator.dispose();
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // 30 second timeout

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
        fc.integer({ min: 5, max: 120 }), // Duration (5-120 minutes)
        async (durationMinutes) => {
          const eciesService = new ECIESService();
          const manager = new WorkspaceManager(eciesService);
          const creator = await createCreator(eciesService, 'Creator');

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: GuidV4.new(),
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
              Buffer.from(creator.publicKey)
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
            creator.dispose();
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // 30 second timeout

  /**
   * Feature: eecp-full-system, Property 33: Encrypted Metadata Storage
   * Validates: Requirements 9.1, 9.2
   * 
   * For any workspace metadata stored on the server, the metadata must be encrypted
   * using ECIES multi-recipient encryption and never stored in plaintext.
   */
  test('Property 33: Encrypted Metadata Storage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 120 }), // Duration (5-120 minutes)
        fc.integer({ min: 1, max: 10 }), // Number of participants
        async (durationMinutes, participantCount) => {
          const eciesService = new ECIESService();
          const manager = new WorkspaceManager(eciesService);
          const creator = await createCreator(eciesService, 'Creator');
          const additionalParticipants: Member[] = [];

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: GuidV4.new(),
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

            // Create workspace with creator
            const workspace = await manager.createWorkspace(
              config,
              Buffer.from(creator.publicKey)
            );

            // Verify encrypted metadata exists
            expect(workspace.encryptedMetadata).toBeDefined();
            expect(workspace.encryptedMetadata.recipientCount).toBeGreaterThan(0);
            expect(workspace.encryptedMetadata.recipientIds).toBeDefined();
            expect(workspace.encryptedMetadata.recipientKeys).toBeDefined();
            expect(workspace.encryptedMetadata.encryptedMessage).toBeDefined();

            // Verify metadata is encrypted (not plaintext)
            // The encrypted data should not contain readable JSON
            const encryptedDataStr = Buffer.from(workspace.encryptedMetadata.encryptedMessage).toString();
            expect(encryptedDataStr).not.toContain('config');
            expect(encryptedDataStr).not.toContain('participants');
            expect(encryptedDataStr).not.toContain('currentTemporalKeyId');

            // Add more participants
            for (let i = 1; i < participantCount; i++) {
              const participant = await createCreator(eciesService, `Participant-${i}`);
              additionalParticipants.push(participant);
              await manager.addParticipant(workspace.id, participant);
            }

            // Verify metadata is re-encrypted for all participants
            const updatedWorkspace = await manager.getWorkspace(workspace.id);
            expect(updatedWorkspace).not.toBeNull();
            expect(updatedWorkspace!.encryptedMetadata.recipientCount).toBe(participantCount);
            expect(updatedWorkspace!.encryptedMetadata.recipientIds.length).toBe(participantCount);
            expect(updatedWorkspace!.encryptedMetadata.recipientKeys.length).toBe(participantCount);

            // Verify server never stores plaintext metadata
            // The workspace object should only contain encrypted metadata
            expect(updatedWorkspace!.encryptedMetadata).toBeDefined();
            expect(typeof updatedWorkspace!.encryptedMetadata).toBe('object');
            
            // Verify getEncryptedMetadata returns encrypted data
            const encryptedMetadata = await manager.getEncryptedMetadata(workspace.id);
            expect(encryptedMetadata).not.toBeNull();
            expect(encryptedMetadata).toEqual(updatedWorkspace!.encryptedMetadata);
          } finally {
            creator.dispose();
            additionalParticipants.forEach(p => p.dispose());
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // Increase timeout for crypto operations

  /**
   * Feature: eecp-full-system, Property 34: Metadata Re-encryption on Update
   * Validates: Requirements 9.3
   * 
   * For any workspace metadata update, the system must re-encrypt the metadata
   * for all current participants.
   */
  test('Property 34: Metadata Re-encryption on Update', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 120 }), // Duration (5-120 minutes)
        fc.integer({ min: 2, max: 10 }), // Number of participants (at least 2)
        async (durationMinutes, participantCount) => {
          const eciesService = new ECIESService();
          const manager = new WorkspaceManager(eciesService);
          const creator = await createCreator(eciesService, 'Creator');
          const participants: Member[] = [creator];

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: GuidV4.new(),
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

            // Create workspace with creator
            const workspace = await manager.createWorkspace(
              config,
              Buffer.from(creator.publicKey)
            );

            const originalEncryptedMetadata = workspace.encryptedMetadata;
            expect(originalEncryptedMetadata.recipientCount).toBe(1);

            // Add participants one by one and verify re-encryption
            for (let i = 1; i < participantCount; i++) {
              const participant = await createCreator(eciesService, `Participant-${i}`);
              participants.push(participant);
              
              // Add participant (triggers re-encryption)
              await manager.addParticipant(workspace.id, participant);
              
              // Verify metadata was re-encrypted
              const updatedWorkspace = await manager.getWorkspace(workspace.id);
              expect(updatedWorkspace).not.toBeNull();
              
              // Verify recipient count increased
              expect(updatedWorkspace!.encryptedMetadata.recipientCount).toBe(i + 1);
              
              // Verify encrypted message changed (re-encrypted)
              expect(updatedWorkspace!.encryptedMetadata.encryptedMessage).not.toEqual(
                originalEncryptedMetadata.encryptedMessage
              );
              
              // Verify all current participants are included
              expect(updatedWorkspace!.encryptedMetadata.recipientIds.length).toBe(i + 1);
              expect(updatedWorkspace!.encryptedMetadata.recipientKeys.length).toBe(i + 1);
            }

            // Remove a participant and verify re-encryption
            const participantToRemove = participants[participants.length - 1];
            await manager.removeParticipant(workspace.id, participantToRemove.id);
            
            const finalWorkspace = await manager.getWorkspace(workspace.id);
            expect(finalWorkspace).not.toBeNull();
            
            // Verify recipient count decreased
            expect(finalWorkspace!.encryptedMetadata.recipientCount).toBe(participantCount - 1);
            
            // Verify metadata was re-encrypted for remaining participants only
            expect(finalWorkspace!.encryptedMetadata.recipientIds.length).toBe(participantCount - 1);
            expect(finalWorkspace!.encryptedMetadata.recipientKeys.length).toBe(participantCount - 1);
          } finally {
            participants.forEach(p => p.dispose());
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // Increase timeout for crypto operations

  /**
   * Feature: eecp-full-system, Property 35: Encrypted Metadata Retrieval
   * Validates: Requirements 9.4
   * 
   * For any metadata request from a participant, the server must return the
   * encrypted metadata for client-side decryption.
   */
  test('Property 35: Encrypted Metadata Retrieval', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 120 }), // Duration (5-120 minutes)
        fc.integer({ min: 1, max: 5 }), // Number of participants
        async (durationMinutes, participantCount) => {
          const eciesService = new ECIESService();
          const manager = new WorkspaceManager(eciesService);
          const creator = await createCreator(eciesService, 'Creator');
          const participants: Member[] = [creator];

          try {
            const now = Date.now();
            const config: WorkspaceConfig = {
              id: GuidV4.new(),
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

            // Create workspace with creator
            const workspace = await manager.createWorkspace(
              config,
              Buffer.from(creator.publicKey)
            );

            // Add additional participants
            for (let i = 1; i < participantCount; i++) {
              const participant = await createCreator(eciesService, `Participant-${i}`);
              participants.push(participant);
              await manager.addParticipant(workspace.id, participant);
            }

            // Retrieve encrypted metadata
            const encryptedMetadata = await manager.getEncryptedMetadata(workspace.id);
            
            // Verify encrypted metadata is returned
            expect(encryptedMetadata).not.toBeNull();
            expect(encryptedMetadata).toBeDefined();
            
            // Verify it's encrypted (has all required fields)
            expect(encryptedMetadata!.recipientCount).toBe(participantCount);
            expect(encryptedMetadata!.recipientIds).toBeDefined();
            expect(encryptedMetadata!.recipientKeys).toBeDefined();
            expect(encryptedMetadata!.encryptedMessage).toBeDefined();
            expect(encryptedMetadata!.dataLength).toBeGreaterThan(0);
            expect(encryptedMetadata!.headerSize).toBeGreaterThan(0);
            
            // Verify the encrypted metadata matches what's stored in the workspace
            const workspaceFromManager = await manager.getWorkspace(workspace.id);
            expect(encryptedMetadata).toEqual(workspaceFromManager!.encryptedMetadata);
            
            // Verify metadata is still encrypted (not plaintext)
            const encryptedDataStr = Buffer.from(encryptedMetadata!.encryptedMessage).toString();
            expect(encryptedDataStr).not.toContain('config');
            expect(encryptedDataStr).not.toContain('participants');
            expect(encryptedDataStr).not.toContain('currentTemporalKeyId');
            
            // Verify the correct number of recipient IDs and keys
            expect(encryptedMetadata!.recipientIds.length).toBe(participantCount);
            expect(encryptedMetadata!.recipientKeys.length).toBe(participantCount);
            
            // Verify each recipient ID and key is a Uint8Array with data
            for (let i = 0; i < participantCount; i++) {
              expect(encryptedMetadata!.recipientIds[i]).toBeInstanceOf(Uint8Array);
              expect(encryptedMetadata!.recipientIds[i].length).toBeGreaterThan(0);
              expect(encryptedMetadata!.recipientKeys[i]).toBeInstanceOf(Uint8Array);
              expect(encryptedMetadata!.recipientKeys[i].length).toBeGreaterThan(0);
            }
          } finally {
            participants.forEach(p => p.dispose());
            manager.cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // Increase timeout for crypto operations
});
