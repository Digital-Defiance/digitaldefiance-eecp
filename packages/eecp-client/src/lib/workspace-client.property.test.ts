/**
 * Property-based tests for WorkspaceClient
 * Feature: eecp-full-system
 */

import * as fc from 'fast-check';
import { WorkspaceClient } from './workspace-client.js';
import { CollaborativeEditor } from './collaborative-editor.js';
import { ClientKeyManager } from './client-key-manager.js';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import {
  WorkspaceMetadata,
  WorkspaceConfig,
  ParticipantId,
  WorkspaceId,
} from '@digitaldefiance-eecp/eecp-protocol';
import { WebSocket } from 'ws';

/**
 * Create a mock WebSocket for testing
 */
function createMockWebSocket(): WebSocket {
  const ws = {
    readyState: 1, // OPEN
    close: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
  } as unknown as WebSocket;
  return ws;
}

/**
 * Create a mock workspace metadata
 */
function createMockMetadata(workspaceId: WorkspaceId, participantId: ParticipantId): WorkspaceMetadata {
  const now = Date.now();
  return {
    config: {
      id: workspaceId,
      createdAt: now,
      expiresAt: now + 30 * 60 * 1000,
      timeWindow: {
        startTime: now,
        endTime: now + 30 * 60 * 1000,
        rotationInterval: 15,
        gracePeriod: 60 * 1000,
      },
      maxParticipants: 50,
      allowExtension: false,
    },
    participants: [{
      id: participantId,
      publicKey: Buffer.alloc(32),
      joinedAt: now,
      role: 'creator',
    }],
    currentTemporalKeyId: 'key-0',
    keyRotationSchedule: {
      currentKeyId: 'key-0',
      nextRotationAt: now + 15 * 60 * 1000,
    },
  };
}

describe('WorkspaceClient Property Tests', () => {
  /**
   * Property 42: Shareable Link Generation
   * For any workspace with a secret, generating a shareable link must encode the workspace ID
   * and secret in a URL that can be decoded to retrieve the original credentials.
   * Validates: Requirements 14.4
   */
  describe('Property 42: Shareable Link Generation', () => {
    it('should generate shareable links that encode workspace ID and secret', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random workspace secret (32 bytes)
          fc.uint8Array({ minLength: 32, maxLength: 32 }),
          // Generate random base URL
          fc.webUrl({ validSchemes: ['http', 'https'] }),
          async (secretArray, baseUrl) => {
            // Create workspace client with secret
            const workspaceId = GuidV4.new();
            const participantId = GuidV4.new();
            const workspaceSecret = Buffer.from(secretArray);
            const metadata = createMockMetadata(workspaceId, participantId);
            const ws = createMockWebSocket();
            const keyManager = new ClientKeyManager('test-db-' + Math.random());
            
            const client = new WorkspaceClient(
              workspaceId,
              participantId,
              metadata,
              ws,
              keyManager,
              workspaceSecret
            );
            
            // Generate shareable link
            const shareableLink = client.generateShareableLink(baseUrl);
            
            // Property 1: Link must be a valid URL
            expect(() => new URL(shareableLink)).not.toThrow();
            
            // Parse the generated link
            const parsedUrl = new URL(shareableLink);
            
            // Property 2: Link must use the provided base URL
            expect(parsedUrl.origin).toBe(new URL(baseUrl).origin);
            
            // Property 3: Link must have /join path
            expect(parsedUrl.pathname).toBe('/join');
            
            // Property 4: Link must contain workspace ID parameter
            const encodedWorkspaceId = parsedUrl.searchParams.get('w');
            expect(encodedWorkspaceId).toBeTruthy();
            expect(encodedWorkspaceId).toBe(workspaceId.toString());
            
            // Property 5: Link must contain encoded secret parameter
            const encodedSecret = parsedUrl.searchParams.get('k');
            expect(encodedSecret).toBeTruthy();
            
            // Property 6: Encoded secret must be URL-safe base64
            expect(encodedSecret).toMatch(/^[A-Za-z0-9_-]+$/);
            
            // Property 7: Decoding the secret must yield the original secret
            const decodedSecret = Buffer.from(encodedSecret!, 'base64url');
            expect(decodedSecret.equals(workspaceSecret)).toBe(true);
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    }, 30000); // 30 second timeout for property test
  });
  
  it('should throw error when workspace secret is not available', () => {
    // Edge case: no workspace secret
    const workspaceId = GuidV4.new();
    const participantId = GuidV4.new();
    const metadata = createMockMetadata(workspaceId, participantId);
    const ws = createMockWebSocket();
    const keyManager = new ClientKeyManager('test-db-' + Math.random());
    
    const client = new WorkspaceClient(
      workspaceId,
      participantId,
      metadata,
      ws,
      keyManager,
      undefined // No workspace secret
    );
    
    expect(() => client.generateShareableLink('https://example.com')).toThrow(
      'Workspace secret not available'
    );
  });
  
  it('should generate consistent links for the same workspace', () => {
    // Edge case: deterministic link generation
    const workspaceId = GuidV4.new();
    const participantId = GuidV4.new();
    const workspaceSecret = Buffer.from('test-secret-32-bytes-long-here!');
    const metadata = createMockMetadata(workspaceId, participantId);
    const ws = createMockWebSocket();
    const keyManager = new ClientKeyManager('test-db-' + Math.random());
    
    const client = new WorkspaceClient(
      workspaceId,
      participantId,
      metadata,
      ws,
      keyManager,
      workspaceSecret
    );
    
    const link1 = client.generateShareableLink('https://example.com');
    const link2 = client.generateShareableLink('https://example.com');
    
    expect(link1).toBe(link2);
  });
  
  it('should handle different base URLs correctly', () => {
    // Edge case: different base URLs
    const workspaceId = GuidV4.new();
    const participantId = GuidV4.new();
    const workspaceSecret = Buffer.from('test-secret-32-bytes-long-here!');
    const metadata = createMockMetadata(workspaceId, participantId);
    const ws = createMockWebSocket();
    const keyManager = new ClientKeyManager('test-db-' + Math.random());
    
    const client = new WorkspaceClient(
      workspaceId,
      participantId,
      metadata,
      ws,
      keyManager,
      workspaceSecret
    );
    
    const link1 = client.generateShareableLink('https://app1.example.com');
    const link2 = client.generateShareableLink('https://app2.example.com');
    
    const url1 = new URL(link1);
    const url2 = new URL(link2);
    
    // Different origins
    expect(url1.origin).not.toBe(url2.origin);
    
    // Same workspace ID and secret
    expect(url1.searchParams.get('w')).toBe(url2.searchParams.get('w'));
    expect(url1.searchParams.get('k')).toBe(url2.searchParams.get('k'));
  });
  
  /**
   * Property 43: Document Export
   * For any workspace, exporting the document must produce plaintext that matches the current CRDT document state.
   * Validates: Requirements 14.5
   */
  describe('Property 43: Document Export', () => {
    it('should export document content that matches CRDT state', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary text operations
          fc.array(
            fc.record({
              type: fc.constantFrom('insert' as const, 'delete' as const),
              position: fc.nat(100),
              text: fc.string({ minLength: 0, maxLength: 20 }),
              length: fc.nat(10),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          async (operations) => {
            // Create workspace client
            const workspaceId = GuidV4.new();
            const participantId = GuidV4.new();
            const metadata = createMockMetadata(workspaceId, participantId);
            const ws = createMockWebSocket();
            const keyManager = new ClientKeyManager('test-db-' + Math.random());
            
            const client = new WorkspaceClient(
              workspaceId,
              participantId,
              metadata,
              ws,
              keyManager,
              undefined // No workspace secret for this test
            );
            
            // Get editor
            const editor = client.getEditor();
            
            // Apply operations to build document state
            for (const op of operations) {
              try {
                if (op.type === 'insert') {
                  const safePosition = Math.min(op.position, editor.getText().length);
                  editor.insert(safePosition, op.text);
                } else {
                  const currentLength = editor.getText().length;
                  const safePosition = Math.min(op.position, currentLength);
                  const safeLength = Math.min(op.length, currentLength - safePosition);
                  if (safeLength > 0) {
                    editor.delete(safePosition, safeLength);
                  }
                }
              } catch (error) {
                // Skip invalid operations
              }
            }
            
            // Get expected text from editor
            const expectedText = editor.getText();
            
            // Export document
            const exportedText = client.exportDocument();
            
            // Property: Exported text must match CRDT state
            expect(exportedText).toBe(expectedText);
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    }, 30000); // 30 second timeout for property test
  });
  
  it('should export empty document correctly', () => {
    // Edge case: empty document
    const workspaceId = GuidV4.new();
    const participantId = GuidV4.new();
    const metadata = createMockMetadata(workspaceId, participantId);
    const ws = createMockWebSocket();
    const keyManager = new ClientKeyManager('test-db-' + Math.random());
    
    const client = new WorkspaceClient(
      workspaceId,
      participantId,
      metadata,
      ws,
      keyManager,
      undefined // No workspace secret for this test
    );
    
    const exportedText = client.exportDocument();
    expect(exportedText).toBe('');
  });
  
  it('should export document with only inserts', () => {
    // Edge case: only insert operations
    const workspaceId = GuidV4.new();
    const participantId = GuidV4.new();
    const metadata = createMockMetadata(workspaceId, participantId);
    const ws = createMockWebSocket();
    const keyManager = new ClientKeyManager('test-db-' + Math.random());
    
    const client = new WorkspaceClient(
      workspaceId,
      participantId,
      metadata,
      ws,
      keyManager,
      undefined // No workspace secret for this test
    );
    
    const editor = client.getEditor();
    editor.insert(0, 'Hello ');
    editor.insert(6, 'World');
    
    const exportedText = client.exportDocument();
    expect(exportedText).toBe('Hello World');
  });
  
  it('should export document after inserts and deletes', () => {
    // Edge case: mixed operations
    const workspaceId = GuidV4.new();
    const participantId = GuidV4.new();
    const metadata = createMockMetadata(workspaceId, participantId);
    const ws = createMockWebSocket();
    const keyManager = new ClientKeyManager('test-db-' + Math.random());
    
    const client = new WorkspaceClient(
      workspaceId,
      participantId,
      metadata,
      ws,
      keyManager,
      undefined // No workspace secret for this test
    );
    
    const editor = client.getEditor();
    editor.insert(0, 'Hello World');
    editor.delete(5, 6); // Delete ' World'
    editor.insert(5, ' EECP');
    
    const exportedText = client.exportDocument();
    expect(exportedText).toBe('Hello EECP');
  });
});
