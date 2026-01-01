/**
 * WorkspaceClient - Represents a connected workspace session
 * Provides access to collaborative editing, metadata, and participant management
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
 * Interface for workspace client
 */
export interface IWorkspaceClient {
  /**
   * Get collaborative editor
   */
  getEditor(): ICollaborativeEditor;
  
  /**
   * Get workspace metadata
   */
  getMetadata(): WorkspaceMetadata;
  
  /**
   * Get participants
   */
  getParticipants(): ParticipantInfo[];
  
  /**
   * Leave workspace
   */
  leave(): Promise<void>;
  
  /**
   * Export document
   */
  exportDocument(): string;
  
  /**
   * Generate shareable link
   */
  generateShareableLink(baseUrl: string): string;
}

/**
 * WorkspaceClient implementation
 * Manages a single workspace session with collaborative editing capabilities
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
   * Get the collaborative editor for this workspace
   * @returns The collaborative editor instance
   */
  getEditor(): ICollaborativeEditor {
    return this.editor;
  }
  
  /**
   * Get workspace metadata including configuration and participants
   * @returns The workspace metadata
   */
  getMetadata(): WorkspaceMetadata {
    return this.metadata;
  }
  
  /**
   * Get list of participants in the workspace
   * @returns Array of participant information
   */
  getParticipants(): ParticipantInfo[] {
    return this.metadata.participants;
  }
  
  /**
   * Leave the workspace and clean up resources
   * Closes WebSocket connection and deletes local keys
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
   * Export the current document content as plaintext
   * @returns The document content as a string
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
