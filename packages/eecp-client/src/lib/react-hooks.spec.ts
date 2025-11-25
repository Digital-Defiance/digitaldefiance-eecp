/**
 * Unit tests for React hooks
 * 
 * Tests:
 * - useWorkspace loading states
 * - useCollaboration change notifications
 * - Hook cleanup
 * 
 * Requirements: 14.1, 14.2
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useWorkspace, useCollaboration } from './react-hooks.js';
import { EECPClient } from './eecp-client.js';
import type {
  WorkspaceId,
  ParticipantId,
  WorkspaceMetadata,
  ParticipantInfo,
} from '@digitaldefiance-eecp/eecp-protocol';

// Mock the EECPClient
jest.mock('./eecp-client.js');

describe('React Hooks', () => {
  describe('useWorkspace', () => {
    const serverUrl = 'ws://localhost:3000';
     
    const workspaceId = { toString: () => 'test-workspace-id' } as any as WorkspaceId;
    const temporalKey = Buffer.from('test-key');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should start with loading state', () => {
      // Mock connect to never resolve
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const mockConnect = jest.fn(() => new Promise(() => {}));
      (EECPClient as jest.Mock).mockImplementation(() => ({
        connect: mockConnect,
        disconnect: jest.fn(),
        joinWorkspace: jest.fn(),
      }));

      const { result } = renderHook(() =>
        useWorkspace(serverUrl, workspaceId, temporalKey)
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.workspace).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should successfully connect and join workspace', async () => {
      const mockWorkspace = {
        getEditor: jest.fn(),
        getMetadata: jest.fn(),
        getParticipants: jest.fn(() => []),
        leave: jest.fn(),
        exportDocument: jest.fn(),
      };

      const mockConnect = jest.fn().mockResolvedValue(undefined);
      const mockJoinWorkspace = jest.fn().mockResolvedValue(mockWorkspace);
      const mockDisconnect = jest.fn();

      (EECPClient as jest.Mock).mockImplementation(() => ({
        connect: mockConnect,
        disconnect: mockDisconnect,
        joinWorkspace: mockJoinWorkspace,
      }));

      const { result } = renderHook(() =>
        useWorkspace(serverUrl, workspaceId, temporalKey)
      );

      // Wait for connection to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.workspace).toBe(mockWorkspace);
      expect(result.current.error).toBeNull();
      expect(mockConnect).toHaveBeenCalledWith(serverUrl);
      expect(mockJoinWorkspace).toHaveBeenCalledWith(workspaceId, temporalKey);
    });

    it('should handle connection errors', async () => {
      const testError = new Error('Connection failed');
      const mockConnect = jest.fn().mockRejectedValue(testError);

      (EECPClient as jest.Mock).mockImplementation(() => ({
        connect: mockConnect,
        disconnect: jest.fn(),
        joinWorkspace: jest.fn(),
      }));

      const { result } = renderHook(() =>
        useWorkspace(serverUrl, workspaceId, temporalKey)
      );

      // Wait for error to be set
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.workspace).toBeNull();
      expect(result.current.error).toBe(testError);
    });

    it('should handle join workspace errors', async () => {
      const testError = new Error('Join failed');
      const mockConnect = jest.fn().mockResolvedValue(undefined);
      const mockJoinWorkspace = jest.fn().mockRejectedValue(testError);

      (EECPClient as jest.Mock).mockImplementation(() => ({
        connect: mockConnect,
        disconnect: jest.fn(),
        joinWorkspace: mockJoinWorkspace,
      }));

      const { result } = renderHook(() =>
        useWorkspace(serverUrl, workspaceId, temporalKey)
      );

      // Wait for error to be set
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.workspace).toBeNull();
      expect(result.current.error).toBe(testError);
    });

    it('should skip connection when workspaceId is null', () => {
      const mockConnect = jest.fn();
      (EECPClient as jest.Mock).mockImplementation(() => ({
        connect: mockConnect,
        disconnect: jest.fn(),
        joinWorkspace: jest.fn(),
      }));

      const { result } = renderHook(() =>
        useWorkspace(serverUrl, null, temporalKey)
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.workspace).toBeNull();
      expect(result.current.error).toBeNull();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should skip connection when temporalKey is null', () => {
      const mockConnect = jest.fn();
      (EECPClient as jest.Mock).mockImplementation(() => ({
        connect: mockConnect,
        disconnect: jest.fn(),
        joinWorkspace: jest.fn(),
      }));

      const { result } = renderHook(() =>
        useWorkspace(serverUrl, workspaceId, null)
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.workspace).toBeNull();
      expect(result.current.error).toBeNull();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should cleanup on unmount', async () => {
      const mockLeave = jest.fn().mockResolvedValue(undefined);
      const mockDisconnect = jest.fn();
      const mockWorkspace = {
        getEditor: jest.fn(),
        getMetadata: jest.fn(),
        getParticipants: jest.fn(() => []),
        leave: mockLeave,
        exportDocument: jest.fn(),
      };

      const mockConnect = jest.fn().mockResolvedValue(undefined);
      const mockJoinWorkspace = jest.fn().mockResolvedValue(mockWorkspace);

      (EECPClient as jest.Mock).mockImplementation(() => ({
        connect: mockConnect,
        disconnect: mockDisconnect,
        joinWorkspace: mockJoinWorkspace,
      }));

      const { result, unmount } = renderHook(() =>
        useWorkspace(serverUrl, workspaceId, temporalKey)
      );

      // Wait for connection to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.workspace).toBe(mockWorkspace);

      // Unmount the hook
      unmount();

      // Cleanup happens synchronously in the effect cleanup
      // Give it a moment to process
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should not update state after unmount', async () => {
      const mockConnect = jest.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      const mockJoinWorkspace = jest.fn().mockResolvedValue({
        getEditor: jest.fn(),
        getMetadata: jest.fn(),
        getParticipants: jest.fn(() => []),
        leave: jest.fn(),
        exportDocument: jest.fn(),
      });

      (EECPClient as jest.Mock).mockImplementation(() => ({
        connect: mockConnect,
        disconnect: jest.fn(),
        joinWorkspace: mockJoinWorkspace,
      }));

      const { result, unmount } = renderHook(() =>
        useWorkspace(serverUrl, workspaceId, temporalKey)
      );

      // Unmount immediately
      unmount();

      // Wait a bit to ensure async operations complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      // State should remain in initial state (not updated after unmount)
      expect(result.current.loading).toBe(true);
      expect(result.current.workspace).toBeNull();
    });
  });

  describe('useCollaboration', () => {
    let mockEditor: any;
    let mockWorkspace: any;
    let changeCallback: ((text: string) => void) | null = null;

    beforeEach(() => {
      jest.clearAllMocks();
      changeCallback = null;

      mockEditor = {
        insert: jest.fn(),
        delete: jest.fn(),
        getText: jest.fn(() => 'initial text'),
        onChange: jest.fn((callback: (text: string) => void) => {
          changeCallback = callback;
          return () => {
            changeCallback = null;
          };
        }),
      };

      const participants: ParticipantInfo[] = [
        {
          id: { toString: () => 'participant-1' } as any as ParticipantId,
          publicKey: Buffer.from('key1'),
          joinedAt: Date.now(),
          role: 'creator',
        },
        {
          id: { toString: () => 'participant-2' } as any as ParticipantId,
          publicKey: Buffer.from('key2'),
          joinedAt: Date.now(),
          role: 'editor',
        },
      ];

      mockWorkspace = {
        getEditor: jest.fn(() => mockEditor),
        getMetadata: jest.fn(),
        getParticipants: jest.fn(() => participants),
        leave: jest.fn(),
        exportDocument: jest.fn(),
      };
    });

    it('should initialize with current text and participants', () => {
      const { result } = renderHook(() => useCollaboration(mockWorkspace));

      expect(result.current.text).toBe('initial text');
      expect(result.current.participants).toHaveLength(2);
      expect(mockEditor.onChange).toHaveBeenCalled();
      expect(mockEditor.getText).toHaveBeenCalled();
    });

    it('should update text when editor changes', async () => {
      const { result } = renderHook(() => useCollaboration(mockWorkspace));

      // Simulate text change wrapped in act
      await act(async () => {
        if (changeCallback) {
          changeCallback('updated text');
        }
      });

      expect(result.current.text).toBe('updated text');
    });

    it('should call editor insert when insert is called', () => {
      const { result } = renderHook(() => useCollaboration(mockWorkspace));

      result.current.insert(5, 'hello');

      expect(mockEditor.insert).toHaveBeenCalledWith(5, 'hello');
    });

    it('should call editor delete when deleteText is called', () => {
      const { result } = renderHook(() => useCollaboration(mockWorkspace));

      result.current.deleteText(5, 10);

      expect(mockEditor.delete).toHaveBeenCalledWith(5, 10);
    });

    it('should handle null workspace', () => {
      const { result } = renderHook(() => useCollaboration(null));

      expect(result.current.text).toBe('');
      expect(result.current.participants).toEqual([]);

      // Should not throw when calling functions with null workspace
      expect(() => result.current.insert(0, 'test')).not.toThrow();
      expect(() => result.current.deleteText(0, 5)).not.toThrow();
    });

    it('should unsubscribe from changes on unmount', () => {
      const unsubscribe = jest.fn();
      mockEditor.onChange.mockReturnValue(unsubscribe);

      const { unmount } = renderHook(() => useCollaboration(mockWorkspace));

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should resubscribe when workspace changes', () => {
      const { rerender } = renderHook(
        ({ workspace }) => useCollaboration(workspace),
        {
          initialProps: { workspace: mockWorkspace },
        }
      );

      expect(mockEditor.onChange).toHaveBeenCalledTimes(1);

      // Create new workspace
      const newMockEditor = {
        insert: jest.fn(),
        delete: jest.fn(),
        getText: jest.fn(() => 'new text'),
        onChange: jest.fn(() => jest.fn()),
      };

      const newMockWorkspace = {
        getEditor: jest.fn(() => newMockEditor),
        getMetadata: jest.fn(),
        getParticipants: jest.fn(() => []),
        leave: jest.fn(),
        exportDocument: jest.fn(),
      };

      // Rerender with new workspace
      rerender({ workspace: newMockWorkspace });

      expect(newMockEditor.onChange).toHaveBeenCalled();
    });

    it('should maintain stable insert and deleteText functions', () => {
      const { result, rerender } = renderHook(() =>
        useCollaboration(mockWorkspace)
      );

      const firstInsert = result.current.insert;
      const firstDelete = result.current.deleteText;

      // Trigger a re-render by simulating text change
      if (changeCallback) {
        changeCallback('changed text');
      }

      rerender();

      // Functions should be the same reference (memoized)
      expect(result.current.insert).toBe(firstInsert);
      expect(result.current.deleteText).toBe(firstDelete);
    });
  });
});
