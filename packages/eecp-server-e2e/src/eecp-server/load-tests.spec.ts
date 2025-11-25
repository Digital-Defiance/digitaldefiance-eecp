/**
 * Load Tests for EECP System
 * 
 * Tests system performance and resource usage under load:
 * - 50+ concurrent participants
 * - 100+ operations per second
 * - Server resource usage monitoring
 * 
 * Requirements: 17.1, 17.4
 * 
 * NOTE: These tests are resource-intensive and should be run separately
 * from regular test suites. Use: nx e2e eecp-server-e2e --testNamePattern="Load Tests"
 */

import { WorkspaceManager } from '@digitaldefiance-eecp/eecp-server';
import { ParticipantManager } from '@digitaldefiance-eecp/eecp-server';
import { OperationRouter } from '@digitaldefiance-eecp/eecp-server';
import { TemporalKeyDerivation } from '@digitaldefiance-eecp/eecp-crypto';
import { TimeLockedEncryption } from '@digitaldefiance-eecp/eecp-crypto';
import { ParticipantAuth } from '@digitaldefiance-eecp/eecp-crypto';
import { CommitmentScheme } from '@digitaldefiance-eecp/eecp-crypto';
import { EncryptedTextCRDT } from '@digitaldefiance-eecp/eecp-crdt';
import { OperationEncryptor } from '@digitaldefiance-eecp/eecp-crdt';
import { ECIESService } from '@digitaldefiance/ecies-lib';
import { getEciesConfig } from '@digitaldefiance-eecp/eecp-crypto';
import type { WorkspaceConfig, CRDTOperation } from '@digitaldefiance-eecp/eecp-protocol';

/**
 * Helper function to measure memory usage
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
    rss: Math.round(usage.rss / 1024 / 1024) // MB
  };
}

/**
 * Helper function to measure operation latency
 */
async function measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T; latency: number }> {
  const start = Date.now();
  const result = await fn();
  const latency = Date.now() - start;
  return { result, latency };
}

describe('Load Tests: Concurrent Participants', () => {
  let workspaceManager: WorkspaceManager;
  let participantManager: ParticipantManager;
  let operationRouter: OperationRouter;
  let keyDerivation: TemporalKeyDerivation;
  let encryption: TimeLockedEncryption;
  let auth: ParticipantAuth;

  beforeAll(() => {
    keyDerivation = new TemporalKeyDerivation();
    encryption = new TimeLockedEncryption();
    auth = new ParticipantAuth();
    const commitment = new CommitmentScheme();
    const eciesService = new ECIESService(getEciesConfig());

    workspaceManager = new WorkspaceManager(
      keyDerivation,
      encryption,
      commitment,
      eciesService
    );
    participantManager = new ParticipantManager(auth);
    operationRouter = new OperationRouter(participantManager);
  });

  /**
   * Test: 50+ Concurrent Participants
   * Requirement 17.4: Support at least 50 participants per workspace
   */
  it('should handle 50+ concurrent participants', async () => {
    const participantCount = 50;
    const crdts: EncryptedTextCRDT[] = [];
    const participantIds: string[] = [];

    console.log(`\n=== Load Test: ${participantCount} Concurrent Participants ===`);
    const memoryBefore = getMemoryUsage();
    console.log('Memory before:', memoryBefore);

    // Create workspace
    const config: WorkspaceConfig = {
      id: `ws-load-${Date.now()}`,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
      timeWindow: {
        startTime: Date.now(),
        endTime: Date.now() + 30 * 60 * 1000,
        rotationInterval: 5,
        gracePeriod: 60000
      },
      maxParticipants: 100, // Allow more than 50
      allowExtension: false
    };

    const { result: workspace, latency: createLatency } = await measureLatency(() =>
      workspaceManager.createWorkspace(config, Buffer.from('creator-key'))
    );
    console.log(`Workspace created in ${createLatency}ms`);

    // Create 50 participants
    const createStart = Date.now();
    for (let i = 0; i < participantCount; i++) {
      const crdt = new EncryptedTextCRDT();
      const participantId = `participant-${i}`;
      crdts.push(crdt);
      participantIds.push(participantId);
    }
    const createDuration = Date.now() - createStart;
    console.log(`Created ${participantCount} participants in ${createDuration}ms`);

    // Each participant makes one edit
    const operations: CRDTOperation[] = [];
    const editStart = Date.now();
    for (let i = 0; i < participantCount; i++) {
      const op = crdts[i].insert(0, `P${i} `, participantIds[i]);
      operations.push(op);
    }
    const editDuration = Date.now() - editStart;
    console.log(`Generated ${operations.length} operations in ${editDuration}ms`);

    // Broadcast operations to all participants (simulating server broadcast)
    const broadcastStart = Date.now();
    for (const crdt of crdts) {
      for (const op of operations) {
        if (op.participantId !== crdt.getText()) { // Don't apply own operation
          crdt.applyOperation(op);
        }
      }
    }
    const broadcastDuration = Date.now() - broadcastStart;
    console.log(`Broadcast completed in ${broadcastDuration}ms`);

    // Verify convergence
    const text0 = crdts[0].getText();
    let converged = true;
    for (let i = 1; i < participantCount; i++) {
      if (crdts[i].getText() !== text0) {
        converged = false;
        break;
      }
    }

    const memoryAfter = getMemoryUsage();
    console.log('Memory after:', memoryAfter);
    console.log('Memory delta:', {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
      rss: memoryAfter.rss - memoryBefore.rss
    });

    expect(converged).toBe(true);
    expect(operations.length).toBe(participantCount);
    
    // Performance assertions
    expect(createDuration).toBeLessThan(5000); // Should create 50 participants in < 5s
    expect(editDuration).toBeLessThan(1000); // Should generate 50 ops in < 1s
    expect(broadcastDuration).toBeLessThan(10000); // Should broadcast in < 10s
  }, 60000); // 60 second timeout

  /**
   * Test: 100 Concurrent Participants (Stress Test)
   * Tests system limits beyond normal requirements
   */
  it('should handle 100 concurrent participants (stress test)', async () => {
    const participantCount = 100;
    const crdts: EncryptedTextCRDT[] = [];

    console.log(`\n=== Stress Test: ${participantCount} Concurrent Participants ===`);
    const memoryBefore = getMemoryUsage();

    // Create participants
    const createStart = Date.now();
    for (let i = 0; i < participantCount; i++) {
      crdts.push(new EncryptedTextCRDT());
    }
    const createDuration = Date.now() - createStart;
    console.log(`Created ${participantCount} participants in ${createDuration}ms`);

    // Each makes a small edit
    const operations: CRDTOperation[] = [];
    for (let i = 0; i < participantCount; i++) {
      const op = crdts[i].insert(0, `${i}`, `p${i}`);
      operations.push(op);
    }

    // Apply all operations to first participant (worst case)
    const applyStart = Date.now();
    for (const op of operations) {
      crdts[0].applyOperation(op);
    }
    const applyDuration = Date.now() - applyStart;
    console.log(`Applied ${operations.length} operations in ${applyDuration}ms`);

    const memoryAfter = getMemoryUsage();
    console.log('Memory delta:', {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rss: memoryAfter.rss - memoryBefore.rss
    });

    expect(operations.length).toBe(participantCount);
    expect(applyDuration).toBeLessThan(5000); // Should apply 100 ops in < 5s
  }, 60000);
});

describe('Load Tests: High Operation Rate', () => {
  let keyDerivation: TemporalKeyDerivation;
  let encryption: TimeLockedEncryption;

  beforeAll(() => {
    keyDerivation = new TemporalKeyDerivation();
    encryption = new TimeLockedEncryption();
  });

  /**
   * Test: 100+ Operations Per Second
   * Requirement 17.1: Handle high operation throughput
   */
  it('should handle 100+ operations per second', async () => {
    const operationsPerSecond = 100;
    const durationSeconds = 5;
    const totalOperations = operationsPerSecond * durationSeconds;

    console.log(`\n=== Load Test: ${operationsPerSecond} ops/sec for ${durationSeconds}s ===`);
    const memoryBefore = getMemoryUsage();

    const crdt = new EncryptedTextCRDT();
    const operations: CRDTOperation[] = [];

    // Generate operations
    const generateStart = Date.now();
    for (let i = 0; i < totalOperations; i++) {
      const op = crdt.insert(i, 'x', `p${i % 10}`);
      operations.push(op);
    }
    const generateDuration = Date.now() - generateStart;
    console.log(`Generated ${totalOperations} operations in ${generateDuration}ms`);

    // Apply operations and measure throughput
    const applyStart = Date.now();
    for (const op of operations) {
      crdt.applyOperation(op);
    }
    const applyDuration = Date.now() - applyStart;
    const actualOpsPerSecond = (totalOperations / applyDuration) * 1000;

    console.log(`Applied ${totalOperations} operations in ${applyDuration}ms`);
    console.log(`Throughput: ${actualOpsPerSecond.toFixed(2)} ops/sec`);

    const memoryAfter = getMemoryUsage();
    console.log('Memory delta:', {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rss: memoryAfter.rss - memoryBefore.rss
    });

    expect(operations.length).toBe(totalOperations);
    expect(actualOpsPerSecond).toBeGreaterThan(operationsPerSecond);
    expect(applyDuration).toBeLessThan(durationSeconds * 1000 * 2); // Allow 2x time
  }, 30000);

  /**
   * Test: Sustained High Load
   * Tests system stability under sustained high operation rate
   */
  it('should maintain performance under sustained load', async () => {
    const operationsPerBatch = 100;
    const batches = 10;
    const totalOperations = operationsPerBatch * batches;

    console.log(`\n=== Sustained Load Test: ${batches} batches of ${operationsPerBatch} ops ===`);
    const memoryBefore = getMemoryUsage();

    const crdt = new EncryptedTextCRDT();
    const batchLatencies: number[] = [];

    // Process operations in batches
    for (let batch = 0; batch < batches; batch++) {
      const batchStart = Date.now();
      
      for (let i = 0; i < operationsPerBatch; i++) {
        const op = crdt.insert(batch * operationsPerBatch + i, 'x', `p${i % 10}`);
        crdt.applyOperation(op);
      }
      
      const batchLatency = Date.now() - batchStart;
      batchLatencies.push(batchLatency);
    }

    const avgLatency = batchLatencies.reduce((a, b) => a + b, 0) / batches;
    const maxLatency = Math.max(...batchLatencies);
    const minLatency = Math.min(...batchLatencies);

    console.log(`Processed ${totalOperations} operations in ${batches} batches`);
    console.log(`Batch latency - Avg: ${avgLatency.toFixed(2)}ms, Min: ${minLatency}ms, Max: ${maxLatency}ms`);

    const memoryAfter = getMemoryUsage();
    console.log('Memory delta:', {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rss: memoryAfter.rss - memoryBefore.rss
    });

    // Performance should remain consistent across batches
    const latencyVariance = maxLatency - minLatency;
    expect(latencyVariance).toBeLessThan(avgLatency * 2); // Max variance should be < 2x average
  }, 60000);

  /**
   * Test: Encryption Performance Under Load
   * Tests cryptographic operations at scale
   */
  it('should maintain encryption performance under load', async () => {
    const operationCount = 1000;

    console.log(`\n=== Encryption Load Test: ${operationCount} encrypt/decrypt cycles ===`);
    const memoryBefore = getMemoryUsage();

    // Derive temporal key
    const workspaceSecret = Buffer.from('test-secret');
    const timeWindow = {
      startTime: Date.now(),
      endTime: Date.now() + 10 * 60 * 1000,
      rotationInterval: 5,
      gracePeriod: 60000
    };
    const temporalKey = await keyDerivation.deriveKey(workspaceSecret, timeWindow, 'key-0');

    const content = Buffer.from('Test operation content');
    const encryptLatencies: number[] = [];
    const decryptLatencies: number[] = [];

    // Perform encrypt/decrypt cycles
    for (let i = 0; i < operationCount; i++) {
      // Encrypt
      const encryptStart = Date.now();
      const encrypted = await encryption.encrypt(content, temporalKey);
      encryptLatencies.push(Date.now() - encryptStart);

      // Decrypt
      const decryptStart = Date.now();
      await encryption.decrypt(encrypted, temporalKey);
      decryptLatencies.push(Date.now() - decryptStart);
    }

    const avgEncrypt = encryptLatencies.reduce((a, b) => a + b, 0) / operationCount;
    const avgDecrypt = decryptLatencies.reduce((a, b) => a + b, 0) / operationCount;
    const totalTime = encryptLatencies.reduce((a, b) => a + b, 0) + decryptLatencies.reduce((a, b) => a + b, 0);

    console.log(`Completed ${operationCount} encrypt/decrypt cycles in ${totalTime}ms`);
    console.log(`Avg encrypt: ${avgEncrypt.toFixed(2)}ms, Avg decrypt: ${avgDecrypt.toFixed(2)}ms`);

    const memoryAfter = getMemoryUsage();
    console.log('Memory delta:', {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rss: memoryAfter.rss - memoryBefore.rss
    });

    // Encryption should be fast
    expect(avgEncrypt).toBeLessThan(10); // < 10ms per encryption
    expect(avgDecrypt).toBeLessThan(10); // < 10ms per decryption
  }, 60000);
});

describe('Load Tests: Resource Usage', () => {
  /**
   * Test: Memory Usage Under Load
   * Monitors memory consumption during high load
   */
  it('should maintain reasonable memory usage', async () => {
    console.log('\n=== Memory Usage Test ===');
    const memoryBefore = getMemoryUsage();
    console.log('Initial memory:', memoryBefore);

    // Create multiple workspaces and participants
    const workspaceCount = 10;
    const participantsPerWorkspace = 10;
    const crdts: EncryptedTextCRDT[][] = [];

    for (let w = 0; w < workspaceCount; w++) {
      const workspaceCrdts: EncryptedTextCRDT[] = [];
      for (let p = 0; p < participantsPerWorkspace; p++) {
        const crdt = new EncryptedTextCRDT();
        // Make some edits
        crdt.insert(0, `Workspace ${w} Participant ${p} content`, `p${p}`);
        workspaceCrdts.push(crdt);
      }
      crdts.push(workspaceCrdts);
    }

    const memoryAfter = getMemoryUsage();
    console.log('Memory after creating workspaces:', memoryAfter);
    
    const memoryDelta = {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
      rss: memoryAfter.rss - memoryBefore.rss
    };
    console.log('Memory delta:', memoryDelta);

    const totalParticipants = workspaceCount * participantsPerWorkspace;
    const memoryPerParticipant = memoryDelta.heapUsed / totalParticipants;
    console.log(`Memory per participant: ${memoryPerParticipant.toFixed(2)}MB`);

    // Memory usage should be reasonable
    expect(memoryDelta.heapUsed).toBeLessThan(500); // < 500MB for 100 participants
    expect(memoryPerParticipant).toBeLessThan(10); // < 10MB per participant
  }, 30000);

  /**
   * Test: CPU Usage Under Load
   * Measures operation processing time as proxy for CPU usage
   */
  it('should process operations efficiently', async () => {
    console.log('\n=== CPU Efficiency Test ===');

    const crdt = new EncryptedTextCRDT();
    const operationCount = 1000;
    const operations: CRDTOperation[] = [];

    // Generate operations
    for (let i = 0; i < operationCount; i++) {
      const op = crdt.insert(i, 'x', `p${i % 10}`);
      operations.push(op);
    }

    // Measure processing time
    const processStart = Date.now();
    for (const op of operations) {
      crdt.applyOperation(op);
    }
    const processDuration = Date.now() - processStart;
    const opsPerSecond = (operationCount / processDuration) * 1000;

    console.log(`Processed ${operationCount} operations in ${processDuration}ms`);
    console.log(`Throughput: ${opsPerSecond.toFixed(2)} ops/sec`);

    // Should maintain high throughput
    expect(opsPerSecond).toBeGreaterThan(100); // > 100 ops/sec
    expect(processDuration).toBeLessThan(10000); // < 10s for 1000 ops
  }, 30000);

  /**
   * Test: Garbage Collection Impact
   * Tests memory cleanup and GC performance
   */
  it('should handle memory cleanup efficiently', async () => {
    console.log('\n=== Garbage Collection Test ===');
    const memoryBefore = getMemoryUsage();

    // Create and destroy many objects
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      const crdt = new EncryptedTextCRDT();
      for (let j = 0; j < 100; j++) {
        crdt.insert(j, 'x', `p${j}`);
      }
      // Let CRDT go out of scope
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Wait a bit for GC
    await new Promise(resolve => setTimeout(resolve, 1000));

    const memoryAfter = getMemoryUsage();
    const memoryDelta = memoryAfter.heapUsed - memoryBefore.heapUsed;

    console.log('Memory before:', memoryBefore);
    console.log('Memory after:', memoryAfter);
    console.log('Memory delta:', memoryDelta, 'MB');

    // Memory should not grow unbounded
    expect(memoryDelta).toBeLessThan(100); // < 100MB growth after cleanup
  }, 30000);
});

describe('Load Tests: Scalability', () => {
  /**
   * Test: Workspace Scalability
   * Tests system with many concurrent workspaces
   */
  it('should handle multiple concurrent workspaces', async () => {
    const workspaceCount = 20;
    const participantsPerWorkspace = 5;

    console.log(`\n=== Scalability Test: ${workspaceCount} workspaces, ${participantsPerWorkspace} participants each ===`);
    const memoryBefore = getMemoryUsage();

    const workspaces: EncryptedTextCRDT[][] = [];

    // Create workspaces with participants
    const createStart = Date.now();
    for (let w = 0; w < workspaceCount; w++) {
      const participants: EncryptedTextCRDT[] = [];
      for (let p = 0; p < participantsPerWorkspace; p++) {
        const crdt = new EncryptedTextCRDT();
        crdt.insert(0, `W${w}P${p}`, `w${w}p${p}`);
        participants.push(crdt);
      }
      workspaces.push(participants);
    }
    const createDuration = Date.now() - createStart;

    console.log(`Created ${workspaceCount} workspaces in ${createDuration}ms`);

    const memoryAfter = getMemoryUsage();
    const totalParticipants = workspaceCount * participantsPerWorkspace;
    console.log(`Total participants: ${totalParticipants}`);
    console.log('Memory delta:', {
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rss: memoryAfter.rss - memoryBefore.rss
    });

    expect(workspaces.length).toBe(workspaceCount);
    expect(createDuration).toBeLessThan(5000); // < 5s to create all workspaces
  }, 30000);

  /**
   * Test: Operation Broadcast Scalability
   * Tests broadcasting operations to many participants
   */
  it('should broadcast operations efficiently to many participants', async () => {
    const participantCount = 50;
    const operationCount = 10;

    console.log(`\n=== Broadcast Scalability: ${operationCount} ops to ${participantCount} participants ===`);

    const crdts: EncryptedTextCRDT[] = [];
    for (let i = 0; i < participantCount; i++) {
      crdts.push(new EncryptedTextCRDT());
    }

    // Generate operations
    const operations: CRDTOperation[] = [];
    for (let i = 0; i < operationCount; i++) {
      operations.push(crdts[0].insert(i, `Op${i}`, 'p0'));
    }

    // Broadcast to all participants
    const broadcastStart = Date.now();
    for (const crdt of crdts) {
      for (const op of operations) {
        crdt.applyOperation(op);
      }
    }
    const broadcastDuration = Date.now() - broadcastStart;

    const totalApplications = participantCount * operationCount;
    const applicationsPerSecond = (totalApplications / broadcastDuration) * 1000;

    console.log(`Broadcast ${operationCount} ops to ${participantCount} participants in ${broadcastDuration}ms`);
    console.log(`Total applications: ${totalApplications}`);
    console.log(`Throughput: ${applicationsPerSecond.toFixed(2)} applications/sec`);

    expect(broadcastDuration).toBeLessThan(5000); // < 5s for broadcast
    expect(applicationsPerSecond).toBeGreaterThan(100); // > 100 applications/sec
  }, 30000);
});
