/**
 * Unit tests for CLI Commands
 * Tests command output format, error handling, and basic functionality
 */

import { CLICommands } from './cli-commands.js';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import {
  WorkspaceConfig,
  WorkspaceMetadata,
} from '@digitaldefiance/eecp-protocol';
import { IEECPClient } from '@digitaldefiance/eecp-client';

// Mock console methods
const originalLog = console.log;
const originalError = console.error;
const originalClear = console.clear;

describe('CLICommands', () => {
  let mockClient: jest.Mocked<IEECPClient>;
  let cliCommands: CLICommands;
  let consoleOutput: string[];

  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    console.log = jest.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });
    console.error = jest.fn();
    console.clear = jest.fn();

    // Create mock client
    mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      createWorkspace: jest.fn(),
      joinWorkspace: jest.fn(),
    } as any;

    cliCommands = new CLICommands(mockClient);
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.clear = originalClear;
  });

  describe('create', () => {
    it('should create workspace with correct output format', async () => {
      // Arrange
      const workspaceId = GuidV4.new();
      const now = Date.now();
      const duration = 30;

      const mockMetadata: WorkspaceMetadata = {
        config: {
          id: workspaceId,
          createdAt: now,
          expiresAt: now + duration * 60 * 1000,
          timeWindow: {
            startTime: now,
            endTime: now + duration * 60 * 1000,
            rotationInterval: 15,
            gracePeriod: 60 * 1000,
          },
          maxParticipants: 50,
          allowExtension: false,
        },
        participants: [],
        currentTemporalKeyId: 'key-0',
        keyRotationSchedule: {
          currentKeyId: 'key-0',
          nextRotationAt: now + 15 * 60 * 1000,
        },
      };

      const mockWorkspace = {
        getMetadata: jest.fn().mockReturnValue(mockMetadata),
        getEditor: jest.fn(),
        getParticipants: jest.fn().mockReturnValue([]),
        leave: jest.fn(),
        exportDocument: jest.fn(),
      };

      mockClient.createWorkspace.mockResolvedValue(mockWorkspace as any);

      // Act
      await cliCommands.create({
        duration,
        maxParticipants: 50,
        allowExtension: false,
      });

      // Assert
      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.any(Number),
          maxParticipants: 50,
          allowExtension: false,
        })
      );

      // Check output format
      const output = consoleOutput.join('\n');
      expect(output).toContain('Workspace created successfully');
      expect(output).toContain('Workspace ID:');
      expect(output).toContain('Expires:');
      expect(output).toContain('Duration: 30 minutes');
      expect(output).toContain('Max Participants: 50');
      expect(output).toContain('Share this link');
    });

    it('should use default values when options not provided', async () => {
      // Arrange
      const mockMetadata: WorkspaceMetadata = {
        config: {
          id: GuidV4.new(),
          createdAt: Date.now(),
          expiresAt: Date.now() + 30 * 60 * 1000,
          timeWindow: {
            startTime: Date.now(),
            endTime: Date.now() + 30 * 60 * 1000,
            rotationInterval: 15,
            gracePeriod: 60 * 1000,
          },
          maxParticipants: 50,
          allowExtension: false,
        },
        participants: [],
        currentTemporalKeyId: 'key-0',
        keyRotationSchedule: {
          currentKeyId: 'key-0',
          nextRotationAt: Date.now() + 15 * 60 * 1000,
        },
      };

      const mockWorkspace = {
        getMetadata: jest.fn().mockReturnValue(mockMetadata),
        getEditor: jest.fn(),
        getParticipants: jest.fn().mockReturnValue([]),
        leave: jest.fn(),
        exportDocument: jest.fn(),
      };

      mockClient.createWorkspace.mockResolvedValue(mockWorkspace as any);

      // Act
      await cliCommands.create({ duration: 15 });

      // Assert
      expect(mockClient.createWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          maxParticipants: 50, // Default value
          allowExtension: false, // Default value
        })
      );
    });
  });

  describe('join', () => {
    it('should reject join with invalid key', async () => {
      // Arrange
      const workspaceId = GuidV4.new();
      const invalidKey = 'not-a-valid-base64-key!@#$';

      mockClient.joinWorkspace.mockRejectedValue(
        new Error('Invalid key format')
      );

      // Act & Assert
      await expect(
        cliCommands.join(workspaceId, { key: invalidKey })
      ).rejects.toThrow();
    });

    // Note: Full join test with terminal editor is skipped as it requires
    // interactive terminal mocking which is complex and not suitable for unit tests
    // The join functionality is tested through integration tests
  });

  describe('list', () => {
    it('should display list command output', async () => {
      // Act
      await cliCommands.list();

      // Assert
      const output = consoleOutput.join('\n');
      expect(output).toContain('Your workspaces');
      expect(output).toContain('Workspace ID');
      expect(output).toContain('Expiration time');
      expect(output).toContain('Participant count');
    });
  });

  describe('export', () => {
    it('should display export message with file path', async () => {
      // Arrange
      const workspaceId = GuidV4.new();
      const outputPath = '/tmp/test-export.txt';

      // Act
      await cliCommands.export(workspaceId, outputPath);

      // Assert
      const output = consoleOutput.join('\n');
      expect(output).toContain('Export');
      expect(output).toContain(workspaceId.toString());
      expect(output).toContain(outputPath);
    });

    it('should handle different output paths', async () => {
      // Arrange
      const workspaceId = GuidV4.new();
      const paths = [
        './export.txt',
        '/tmp/workspace-export.md',
        'output/document.txt',
      ];

      // Act & Assert
      for (const path of paths) {
        consoleOutput = [];
        await cliCommands.export(workspaceId, path);
        const output = consoleOutput.join('\n');
        expect(output).toContain(path);
      }
    });
  });
});
