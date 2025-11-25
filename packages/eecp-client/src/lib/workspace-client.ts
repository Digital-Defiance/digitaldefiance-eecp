/**
 * @module workspace-client
 * 
 * WorkspaceClient - Represents a connected workspace session.
 * 
 * Provides access to:
 * - Collaborative editing via CRDT
 * - Workspace metadata and configuration
 * - Participant management
 * - Document export
 * - Shareable link generation
 * 
 * The workspace client is the main interface for interacting with a joined workspace.
 * It manages the collaborative editor, tracks participants, and provides utilities
 * for sharing and exporting documents.
 * 
 * @example
 * ```typescript
 * import { WorkspaceClient } from './workspace-client';
 * 
 * // Get editor
 * const editor = workspace.getEditor();
 * editor.insert(0, 'Hello');
 * 
 * // Get participants
 * const participants = workspace.getParticipants();
 * console.log(`${participants.length} participants`);
 * 
 * // Export document
 * const text = workspace.exportDocument();
 * 
 * // Generate shareable link
 * const link = workspace.generateShareableLink('https://app.example.com');
 * 
 * // Leave workspace
 * await workspace.leave();
 * ```
 */

import { WebSocket } from 'ws';
import {
  WorkspaceId,
  ParticipantId,
  WorkspaceMetadata,
  ParticipantInfo,
} from '@digitaldefiance-eecp/eecp-protocol';
import { IClientKeyManager } from './client-key-manager.js';
import { CollaborativeEditor, ICollaborativeEditor } from './collaborative-editor.js';

/**
 * Interface for workspace client operations.
 * 
 * @interface IWorkspaceClient
 */
export interface IWorkspaceClient {
  /**
   * Get the collaborative editor for this workspace.
   * 
   * @returns {ICollaborativeEditor} Collaborative editor instance
   */
  getEditor(): ICollaborativeEditor;
  
  /**
   * Get workspace metadata including configuration and participants.
   * 
   * @returns {WorkspaceMetadata} Workspace metadata
   */
  getMetadata(): WorkspaceMetadata;
  
  /**
   * Get list of participants in the workspace.
   * 
   * @returns {ParticipantInfo[]} Array of participant information
   */
  getParticipants(): ParticipantInfo[];
  
  /**
   * Leave the workspace and clean up resources.
   * 
   * Closes WebSocket connection and deletes local keys.
   * 
   * @returns {Promise<void>} Resolves when cleanup is complete
   */
  leave(): Promise<void>;
  
  /**
   * Export the current document content as plaintext.
   * 
   * @returns {string} Document content
   */
  exportDocument(): string;
  
  /**
   * Generate a shareable link with embedded workspace credentials.
   * 
   * Encodes workspace ID and workspace secret in URL for easy sharing.
   * 
   * @param {string} baseUrl - Base URL of the application (e.g., 'https://app.example.com')
   * @returns {string} Shareable URL with embedded credentials
   * @throws {Error} If workspace secret is not available
   */
  generateShareableLink(baseUrl: string): string;
}

/**
 * WorkspaceClient implementation.
 * 
 * Manages a single workspace session with collaborative editing capabilities.
 * 
 * @class WorkspaceClient
 * @implements {IWorkspaceClient}
 * 
 * @example
 * ```typescript
 * const workspace = new WorkspaceClient(
 *   workspaceId,
 *   participantId,
 *   metadata,
 *   ws,
 *   keyManager,
 *   workspaceSecret
 * );
 * 
 * const editor = workspace.getEditor();
 * editor.insert(0, 'Hello, world!');
 * ```
 */
export class WorkspaceClient implements IWorkspaceClient {
  private editor: ICollaborativeEditor;
  
  constructor(
    private workspaceId: WorkspaceId,
    _participantId: ParticipantId, // Prefixed with _ to indicate intentionally unused
    private metadata: WorkspaceMetadata,
    private ws: WebSocket,
    private keyManager: IClientKeyManager,
    private workspaceSecret?: Buffer
  ) {
    // Initialize collaborative editor
    this.editor = new CollaborativeEditor(
      workspaceId,
      _participantId,
      ws,
      keyManager
    );
  }
  
  /**
   * Get the collaborative editor for this workspace.
   * 
   * @returns {ICollaborativeEditor} The collaborative editor instance
   * 
   * @example
   * ```typescript
   * const editor = workspace.getEditor();
   * editor.insert(0, 'Hello');
   * ```
   */
  getEditor(): ICollaborativeEditor {
    return this.editor;
  }
  
  /**
   * Get workspace metadata including configuration and participants.
   * 
   * @returns {WorkspaceMetadata} The workspace metadata
   * 
   * @example
   * ```typescript
   * const metadata = workspace.getMetadata();
   * console.log(`Expires at: ${metadata.config.expiresAt}`);
   * ```
   */
  getMetadata(): WorkspaceMetadata {
    return this.metadata;
  }
  
  /**
   * Get list of participants in the workspace.
   * 
   * @returns {ParticipantInfo[]} Array of participant information
   * 
   * @example
   * ```typescript
   * const participants = workspace.getParticipants();
   * console.log(`${participants.length} participants in workspace`);
   * ```
   */
  getParticipants(): ParticipantInfo[] {
    return this.metadata.participants;
  }
  
  /**
   * Leave the workspace and clean up resources.
   * 
   * Performs cleanup:
   * 1. Closes WebSocket connection
   * 2. Deletes workspace keys from local storage
   * 
   * @returns {Promise<void>} Resolves when cleanup is complete
   * 
   * @example
   * ```typescript
   * await workspace.leave();
   * console.log('Left workspace');
   * ```
   */
  async leave(): Promise<void> {
    // Close WebSocket connection
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    
    // Delete workspace keys from local storage
    await this.keyManager.deleteWorkspaceKeys(this.workspaceId);
  }
  
  /**
   * Export the current document content as plaintext.
   * 
   * @returns {string} The document content as a string
   * 
   * @example
   * ```typescript
   * const text = workspace.exportDocument();
   * console.log(text);
   * ```
   */
  exportDocument(): string {
    return this.editor.getText();
  }
  
  /**
   * Generate a shareable link with embedded workspace credentials
   * Encodes workspace ID and workspace secret in URL for easy sharing
   * 
   * @param baseUrl - The base URL of the application (e.g., 'https://app.example.com')
   * @returns A shareable URL with embedded credentials
   * 
   * @example
   * const link = workspaceClient.generateShareableLink('https://app.example.com');
   * // Returns: https://app.example.com/join?w=<workspace-id>&k=<base64-encoded-secret>
   */
  generateShareableLink(baseUrl: string): string {
    if (!this.workspaceSecret) {
      throw new Error('Workspace secret not available. Cannot generate shareable link.');
    }
    
    // Encode workspace ID and secret in URL
    const workspaceIdStr = this.workspaceId.toString();
    const secretBase64 = this.workspaceSecret.toString('base64url'); // Use base64url for URL-safe encoding
    
    // Construct shareable URL with query parameters
    const url = new URL('/join', baseUrl);
    url.searchParams.set('w', workspaceIdStr);
    url.searchParams.set('k', secretBase64);
    
    return url.toString();
  }
}
