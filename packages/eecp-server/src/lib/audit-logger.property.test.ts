/**
 * Property-based tests for AuditLogger
 * Feature: eecp-full-system, Property 48: Encrypted Audit Logs
 * Validates: Requirements 16.5
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { AuditLogger } from './audit-logger';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import type { AuditEventType } from '@digitaldefiance/eecp-protocol';

describe('AuditLogger Property Tests', () => {
  /**
   * Property 48: Encrypted Audit Logs
   * For any audit log entry, the entry must be encrypted with a separate audit key that expires with the workspace.
   * Validates: Requirements 16.5
   */
  it('Property 48: should encrypt all audit log entries with workspace-specific audit key', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random workspace ID
        fc.uuid().map(id => GuidV4.parse(id)),
        // Generate random event type
        fc.constantFrom<AuditEventType>(
          'workspace_created',
          'workspace_extended',
          'workspace_revoked',
          'workspace_expired',
          'participant_joined',
          'participant_left',
          'participant_revoked',
          'operation_submitted',
          'key_rotated',
          'key_deleted'
        ),
        // Generate random metadata
        fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
        // Generate optional participant ID
        fc.option(fc.uuid().map(id => GuidV4.parse(id)), { nil: undefined }),
        async (workspaceId, eventType, metadata, participantId) => {
          const logger = new AuditLogger();

          // Log an event
          await logger.logEvent(workspaceId, eventType, metadata, participantId);

          // Get encrypted logs
          const encryptedLogs = logger.getWorkspaceLogs(workspaceId);

          // Verify log was created
          expect(encryptedLogs.length).toBe(1);
          const encryptedLog = encryptedLogs[0];

          // Verify log is encrypted (has required encryption fields)
          expect(encryptedLog.encryptedContent).toBeDefined();
          expect(encryptedLog.encryptedContent.length).toBeGreaterThan(0);
          expect(encryptedLog.nonce).toBeDefined();
          expect(encryptedLog.nonce.length).toBe(12); // GCM nonce size
          expect(encryptedLog.authTag).toBeDefined();
          expect(encryptedLog.authTag.length).toBe(16); // GCM auth tag size

          // Verify encrypted content is not plaintext
          const plaintextJson = JSON.stringify({
            id: encryptedLog.id,
            workspaceId,
            timestamp: encryptedLog.timestamp,
            eventType,
            participantId,
            metadata,
          });
          expect(encryptedLog.encryptedContent.toString()).not.toContain(eventType);
          expect(encryptedLog.encryptedContent.toString()).not.toContain(JSON.stringify(metadata));

          // Verify we can decrypt with the audit key
          const auditKey = logger.getAuditKey(workspaceId);
          const decrypted = await logger.decryptLogEntry(encryptedLog, auditKey);

          // Verify decrypted content matches original
          expect(decrypted.eventType).toBe(eventType);
          expect(decrypted.metadata).toEqual(metadata);
          if (participantId) {
            expect(decrypted.participantId?.toString()).toBe(participantId.toString());
          }

          // Verify audit key is workspace-specific
          const differentWorkspaceId = GuidV4.parse(fc.sample(fc.uuid(), 1)[0]);
          const differentAuditKey = logger.getAuditKey(differentWorkspaceId);
          expect(auditKey.equals(differentAuditKey)).toBe(false);

          // Verify audit key is deleted when workspace logs are deleted
          logger.deleteWorkspaceLogs(workspaceId);
          const logsAfterDeletion = logger.getWorkspaceLogs(workspaceId);
          expect(logsAfterDeletion.length).toBe(0);

          // Verify new audit key is generated after deletion (not the same key)
          const newAuditKey = logger.getAuditKey(workspaceId);
          expect(auditKey.equals(newAuditKey)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain separate audit keys for different workspaces', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }).chain(uuids => {
          // Ensure all UUIDs are unique
          const uniqueUuids = Array.from(new Set(uuids));
          if (uniqueUuids.length < 2) {
            // If we don't have at least 2 unique UUIDs, generate more
            while (uniqueUuids.length < 2) {
              uniqueUuids.push(fc.sample(fc.uuid(), 1)[0]);
            }
          }
          return fc.constant(uniqueUuids.map(id => GuidV4.parse(id)));
        }),
        async (workspaceIds) => {
          const logger = new AuditLogger();

          // Get audit keys for all workspaces
          const auditKeys = workspaceIds.map(id => ({
            workspaceId: id,
            key: logger.getAuditKey(id),
          }));

          // Verify all keys are different
          for (let i = 0; i < auditKeys.length; i++) {
            for (let j = i + 1; j < auditKeys.length; j++) {
              expect(auditKeys[i].key.equals(auditKeys[j].key)).toBe(false);
            }
          }

          // Log events to each workspace
          for (const { workspaceId, key } of auditKeys) {
            await logger.logEvent(workspaceId, 'workspace_created', { test: true });
          }

          // Verify each workspace has its own logs
          for (const { workspaceId } of auditKeys) {
            const logs = logger.getWorkspaceLogs(workspaceId);
            expect(logs.length).toBe(1);
          }

          // Verify logs can only be decrypted with correct audit key
          for (const { workspaceId, key } of auditKeys) {
            const logs = logger.getWorkspaceLogs(workspaceId);
            const decrypted = await logger.decryptLogEntry(logs[0], key);
            expect(decrypted.workspaceId.toString()).toBe(workspaceId.toString());

            // Try to decrypt with wrong key (should fail)
            const wrongKey = auditKeys.find(k => !k.key.equals(key))!.key;
            await expect(logger.decryptLogEntry(logs[0], wrongKey)).rejects.toThrow();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should securely delete audit keys when workspace logs are deleted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map(id => GuidV4.parse(id)),
        fc.array(
          fc.record({
            eventType: fc.constantFrom<AuditEventType>(
              'workspace_created',
              'participant_joined',
              'operation_submitted'
            ),
            metadata: fc.dictionary(fc.string(), fc.string()),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (workspaceId, events) => {
          const logger = new AuditLogger();

          // Get initial audit key
          const initialKey = logger.getAuditKey(workspaceId);
          const initialKeyBytes = Buffer.from(initialKey);

          // Log multiple events
          for (const event of events) {
            await logger.logEvent(workspaceId, event.eventType, event.metadata);
          }

          // Verify logs exist
          const logsBefore = logger.getWorkspaceLogs(workspaceId);
          expect(logsBefore.length).toBe(events.length);

          // Delete workspace logs
          logger.deleteWorkspaceLogs(workspaceId);

          // Verify logs are deleted
          const logsAfter = logger.getWorkspaceLogs(workspaceId);
          expect(logsAfter.length).toBe(0);

          // Verify audit key is different after deletion
          const newKey = logger.getAuditKey(workspaceId);
          expect(initialKeyBytes.equals(newKey)).toBe(false);

          // Verify old key was zeroed out (all bytes should be 0)
          const allZeros = initialKey.every(byte => byte === 0);
          expect(allZeros).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle concurrent logging to same workspace', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map(id => GuidV4.parse(id)),
        fc.array(
          fc.record({
            eventType: fc.constantFrom<AuditEventType>(
              'participant_joined',
              'participant_left',
              'operation_submitted'
            ),
            metadata: fc.dictionary(fc.string(), fc.integer()),
          }),
          { minLength: 5, maxLength: 20 }
        ),
        async (workspaceId, events) => {
          const logger = new AuditLogger();

          // Log all events concurrently
          await Promise.all(
            events.map(event =>
              logger.logEvent(workspaceId, event.eventType, event.metadata)
            )
          );

          // Verify all logs were created
          const logs = logger.getWorkspaceLogs(workspaceId);
          expect(logs.length).toBe(events.length);

          // Verify all logs can be decrypted
          const auditKey = logger.getAuditKey(workspaceId);
          const decryptedLogs = await Promise.all(
            logs.map(log => logger.decryptLogEntry(log, auditKey))
          );

          // Verify all event types are present
          const eventTypes = decryptedLogs.map(log => log.eventType);
          const expectedEventTypes = events.map(e => e.eventType);
          expect(eventTypes.sort()).toEqual(expectedEventTypes.sort());
        }
      ),
      { numRuns: 50 }
    );
  });
});
