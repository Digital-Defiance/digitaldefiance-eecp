/**
 * @module cli-commands
 * 
 * CLI Commands - Command-line interface for EECP workspace management.
 * 
 * Provides commands for:
 * - Creating new workspaces
 * - Joining existing workspaces
 * - Listing workspaces from local storage
 * - Exporting workspace content to files
 * - Interactive terminal-based collaborative editing
 * 
 * The CLI provides a text-based interface for EECP operations, suitable for:
 * - Server-side automation
 * - Testing and development
 * - Headless environments
 * - Terminal-based collaboration
 * 
 * @example
 * ```typescript
 * import { CLICommands } from './cli-commands';
 * import { EECPClient } from '@digitaldefiance/eecp-client';
 * 
 * const client = new EECPClient();
 * await client.connect('ws://localhost:3000');
 * 
 * const cli = new CLICommands(client);
 * 
 * // Create workspace
 * await cli.create({
 *   duration: 30,
 *   maxParticipants: 50,
 *   allowExtension: false
 * });
 * 
 * // Join workspace
 * await cli.join(workspaceId, { key: 'base64-encoded-key' });
 * 
 * // List workspaces
 * await cli.list();
 * 
 * // Export workspace
 * await cli.export(workspaceId, 'output.txt');
 * ```
 */

import * as fs from 'fs/promises';
import * as readline from 'readline';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import {
  WorkspaceId,
  WorkspaceConfig,
} from '@digitaldefiance/eecp-protocol';
import { IEECPClient } from '@digitaldefiance/eecp-client';

/**
 * Options for creating a workspace via CLI.
 * 
 * @interface CreateOptions
 * @property {number} duration - Workspace duration in minutes
 * @property {number} [maxParticipants] - Maximum number of participants (default: 50)
 * @property {boolean} [allowExtension] - Whether workspace can be extended (default: false)
 * 
 * @example
 * ```typescript
 * const options: CreateOptions = {
 *   duration: 30,
 *   maxParticipants: 10,
 *   allowExtension: true
 * };
 * ```
 */
export interface CreateOptions {
  duration: number; // Minutes
  maxParticipants?: number;
  allowExtension?: boolean;
}

/**
 * Options for joining a workspace via CLI.
 * 
 * @interface JoinOptions
 * @property {string} key - Base64 encoded temporal key for authentication
 * 
 * @example
 * ```typescript
 * const options: JoinOptions = {
 *   key: 'base64-encoded-temporal-key'
 * };
 * ```
 */
export interface JoinOptions {
  key: string; // Base64 encoded temporal key
}

/**
 * Interface for CLI command operations.
 * 
 * @interface ICLICommands
 */
export interface ICLICommands {
  /**
   * Create a new workspace.
   * 
   * @param {CreateOptions} options - Workspace creation options
   * @returns {Promise<void>} Resolves when workspace is created
   * @throws {Error} If workspace creation fails
   */
  create(options: CreateOptions): Promise<void>;

  /**
   * Join an existing workspace.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID to join
   * @param {JoinOptions} options - Join options including temporal key
   * @returns {Promise<void>} Resolves when joined and editor starts
   * @throws {Error} If join fails or authentication fails
   */
  join(workspaceId: WorkspaceId, options: JoinOptions): Promise<void>;

  /**
   * List all workspaces from local storage.
   * 
   * @returns {Promise<void>} Resolves when list is displayed
   */
  list(): Promise<void>;

  /**
   * Export workspace content to a file.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID to export
   * @param {string} outputPath - Path to save the exported content
   * @returns {Promise<void>} Resolves when export is complete
   * @throws {Error} If export fails or workspace not found
   */
  export(workspaceId: WorkspaceId, outputPath: string): Promise<void>;
}

/**
 * CLI Commands implementation.
 * 
 * Provides command-line interface for EECP workspace operations.
 * 
 * @class CLICommands
 * @implements {ICLICommands}
 * 
 * @example
 * ```typescript
 * const client = new EECPClient();
 * await client.connect('ws://localhost:3000');
 * 
 * const cli = new CLICommands(client);
 * await cli.create({ duration: 30 });
 * ```
 */
export class CLICommands implements ICLICommands {
  constructor(private client: IEECPClient) {}

  /**
   * Create a new workspace.
   * 
   * Creates workspace with specified duration and options, then displays:
   * - Workspace ID
   * - Expiration time
   * - Duration
   * - Maximum participants
   * - Shareable link
   * 
   * @param {CreateOptions} options - Workspace creation options
   * @returns {Promise<void>} Resolves when workspace is created
   * @throws {Error} If workspace creation fails
   * 
   * @example
   * ```typescript
   * await cli.create({
   *   duration: 30,
   *   maxParticipants: 10,
   *   allowExtension: false
   * });
   * ```
   */
  async create(options: CreateOptions): Promise<void> {
    const now = Date.now();
    const durationMs = options.duration * 60 * 1000;

    const config: WorkspaceConfig = {
      id: GuidV4.new(),
      createdAt: now,
      expiresAt: now + durationMs,
      timeWindow: {
        startTime: now,
        endTime: now + durationMs,
        rotationInterval: 15, // 15 minutes
        gracePeriod: 60 * 1000, // 1 minute
      },
      maxParticipants: options.maxParticipants || 50,
      allowExtension: options.allowExtension || false,
    };

    const workspace = await this.client.createWorkspace(config);
    const metadata = workspace.getMetadata();

    // Generate shareable link with workspace ID and key
    const shareLink = this.generateShareLink(
      metadata.config.id,
      metadata.currentTemporalKeyId
    );

    console.log('\n✓ Workspace created successfully!\n');
    console.log(`  Workspace ID: ${metadata.config.id.asFullHexGuid}`);
    console.log(
      `  Expires: ${new Date(metadata.config.expiresAt).toISOString()}`
    );
    console.log(`  Duration: ${options.duration} minutes`);
    console.log(`  Max Participants: ${metadata.config.maxParticipants}`);
    console.log(`\n  Share this link with collaborators:`);
    console.log(`  ${shareLink}\n`);
  }

  /**
   * Join an existing workspace and start interactive terminal editor.
   * 
   * Joins workspace with temporal key, then starts terminal-based editor with:
   * - Real-time collaborative editing
   * - Participant list
   * - Document export command
   * - Quit command
   * 
   * @param {WorkspaceId} workspaceId - The workspace ID to join
   * @param {JoinOptions} options - Join options including temporal key
   * @returns {Promise<void>} Resolves when joined and editor starts
   * @throws {Error} If join fails or authentication fails
   * 
   * @example
   * ```typescript
   * await cli.join(workspaceId, {
   *   key: 'base64-encoded-temporal-key'
   * });
   * ```
   */
  async join(workspaceId: WorkspaceId, options: JoinOptions): Promise<void> {
    const key = Buffer.from(options.key, 'base64');
    const workspace = await this.client.joinWorkspace(workspaceId, key);

    console.log(`\n✓ Joined workspace: ${workspaceId.asFullHexGuid}\n`);

    // Start terminal editor
    await this.startTerminalEditor(workspace);
  }

  /**
   * List all workspaces from local storage.
   * 
   * Displays workspace information including:
   * - Workspace ID
   * - Expiration time
   * - Participant count
   * - Status (active/expired)
   * 
   * Note: Currently a placeholder - full implementation requires local storage integration.
   * 
   * @returns {Promise<void>} Resolves when list is displayed
   * 
   * @example
   * ```typescript
   * await cli.list();
   * ```
   */
  async list(): Promise<void> {
    console.log('\n📋 Your workspaces:\n');
    console.log('  (Workspace listing from local storage not yet implemented)');
    console.log('  This feature will display:');
    console.log('    - Workspace ID');
    console.log('    - Expiration time');
    console.log('    - Participant count');
    console.log('    - Status (active/expired)\n');
  }

  /**
   * Export workspace content to a file.
   * 
   * Joins workspace (if needed), retrieves document content, and saves to file.
   * 
   * Note: Currently a placeholder - full implementation requires joining workspace
   * and retrieving content.
   * 
   * @param {WorkspaceId} workspaceId - The workspace ID to export
   * @param {string} outputPath - Path to save the exported content
   * @returns {Promise<void>} Resolves when export is complete
   * @throws {Error} If export fails or workspace not found
   * 
   * @example
   * ```typescript
   * await cli.export(workspaceId, 'document.txt');
   * ```
   */
  async export(workspaceId: WorkspaceId, outputPath: string): Promise<void> {
    // For now, we need to join the workspace to export it
    // In a real implementation, we'd retrieve from local storage
    console.log(
      `\n⚠️  Export requires joining the workspace first (not yet implemented)`
    );
    console.log(`  Workspace ID: ${workspaceId.toString()}`);
    console.log(`  Output path: ${outputPath}\n`);

    // Placeholder for actual implementation:
    // const workspace = await this.client.joinWorkspace(workspaceId, key);
    // const content = workspace.exportDocument();
    // await fs.writeFile(outputPath, content, 'utf-8');
    // console.log(`\n✓ Document exported to: ${outputPath}\n`);
  }

  /**
   * Start an interactive terminal-based collaborative editor.
   * 
   * Features:
   * - Real-time document updates
   * - Participant list
   * - Commands:
   *   - Type text to insert at end
   *   - /export <filename> - Export document
   *   - /quit - Leave workspace
   * 
   * @private
   * @param {any} workspace - The workspace client instance
   * @returns {Promise<void>} Resolves when editor exits
   */
  private async startTerminalEditor(workspace: any): Promise<void> {
    const editor = workspace.getEditor();
    const metadata = workspace.getMetadata();

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         EECP Terminal Collaborative Editor                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Display workspace info
    const expiresAt = new Date(metadata.config.expiresAt);
    const timeRemaining = metadata.config.expiresAt - Date.now();
    const minutesRemaining = Math.floor(timeRemaining / 60000);

    console.log(`  Workspace: ${metadata.config.id.asFullHexGuid}`);
    console.log(`  Expires: ${expiresAt.toISOString()}`);
    console.log(`  Time remaining: ${minutesRemaining} minutes`);
    console.log(`  Participants: ${metadata.participants.length}\n`);

    // Display participants
    console.log('  👥 Participants:');
    for (const participant of metadata.participants) {
      console.log(
        `     - ${participant.id.asShortHexGuid.substring(0, 8)}... (${participant.role})`
      );
    }
    console.log('');

    // Subscribe to document changes
    editor.onChange((text: string) => {
      // Clear screen and redisplay
      console.clear();
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║         EECP Terminal Collaborative Editor                ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('  Document content:\n');
      console.log(text || '  (empty document)');
      console.log('\n  Type to edit. Press Ctrl+C to exit.\n');
    });

    // Set up readline for interactive input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });

    console.log('  Commands:');
    console.log('    - Type text to insert at the end');
    console.log('    - /export <filename> - Export document');
    console.log('    - /quit - Leave workspace');
    console.log('');

    rl.prompt();

    rl.on('line', async (line: string) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('/')) {
        // Handle commands
        const parts = trimmed.split(' ');
        const command = parts[0];

        if (command === '/quit') {
          console.log('\n  Leaving workspace...\n');
          await workspace.leave();
          rl.close();
          return;
        } else if (command === '/export') {
          const filename = parts[1] || 'export.txt';
          const content = editor.getText();
          await fs.writeFile(filename, content, 'utf-8');
          console.log(`\n  ✓ Exported to: ${filename}\n`);
        } else {
          console.log(`\n  Unknown command: ${command}\n`);
        }
      } else if (trimmed) {
        // Insert text at the end of the document
        const currentText = editor.getText();
        const position = currentText.length;
        editor.insert(position, trimmed + '\n');
      }

      rl.prompt();
    });

    rl.on('close', async () => {
      console.log('\n  Goodbye!\n');
      await workspace.leave();
      process.exit(0);
    });

    // Display initial document state
    const initialText = editor.getText();
    if (initialText) {
      console.log('  Document content:\n');
      console.log(initialText);
      console.log('');
    }
  }

  /**
   * Generate a shareable link for a workspace.
   * 
   * Encodes workspace ID and key ID in a custom URL scheme.
   * 
   * @private
   * @param {WorkspaceId} workspaceId - The workspace ID
   * @param {string} keyId - The temporal key ID
   * @returns {string} A shareable URL (eecp:// scheme)
   * 
   * @example
   * ```typescript
   * const link = this.generateShareLink(workspaceId, 'key-0');
   * // Returns: eecp://join/<encoded-id>?key=<encoded-key>
   * ```
   */
  private generateShareLink(workspaceId: WorkspaceId, keyId: string): string {
    // In a real implementation, this would encode the workspace ID and key
    // For now, return a placeholder
    const encodedId = Buffer.from(workspaceId.asFullHexGuid).toString('base64');
    const encodedKey = Buffer.from(keyId).toString('base64');
    return `eecp://join/${encodedId}?key=${encodedKey}`;
  }
}
