/**
 * React Hooks for EECP Client
 * 
 * Provides React hooks for workspace management and collaborative editing:
 * - useWorkspace: Connect to and manage workspace lifecycle
 * - useCollaboration: Access collaborative editing features
 * 
 * Requirements:
 * - 14.1: Web-based interface for document collaboration
 * - 14.2: Real-time collaboration with participant tracking
 */

import { useState, useEffect, useCallback } from 'react';
import {
  WorkspaceId,
  ParticipantInfo,
} from '@digitaldefiance-eecp/eecp-protocol';
import { EECPClient, IEECPClient } from './eecp-client.js';
import { IWorkspaceClient } from './workspace-client.js';

/**
 * Hook for workspace management
 * 
 * Connects to server on mount, joins workspace with ID and key,
 * returns workspace, loading, and error states, and cleans up on unmount.
 * 
 * Requirements:
 * - 14.1: Web-based interface for document collaboration
 * - 14.2: Real-time collaboration features
 * 
 * @param serverUrl - WebSocket server URL
 * @param workspaceId - Workspace ID to join (null to skip joining)
 * @param temporalKey - Temporal key for workspace authentication
 * @returns Object containing workspace, loading state, and error
 * 
 * @example
 * ```tsx
 * function WorkspaceView() {
 *   const { workspace, loading, error } = useWorkspace(
 *     'ws://localhost:3000',
 *     workspaceId,
 *     temporalKey
 *   );
 *   
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (!workspace) return null;
 *   
 *   return <Editor workspace={workspace} />;
 * }
 * ```
 */
export function useWorkspace(
  serverUrl: string,
  workspaceId: WorkspaceId | null,
  temporalKey: Buffer | null
): {
  workspace: IWorkspaceClient | null;
  loading: boolean;
  error: Error | null;
} {
  const [workspace, setWorkspace] = useState<IWorkspaceClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Skip if no workspace ID or temporal key provided
    if (!workspaceId || !temporalKey) {
      return;
    }

    let mounted = true;
    let currentClient: IEECPClient | null = null;

    async function connectAndJoin() {
      setLoading(true);
      setError(null);

      try {
        // Create client
        currentClient = new EECPClient();

        // Connect to server
        await currentClient.connect(serverUrl);

        // Join workspace
        if (workspaceId && temporalKey) {
          const ws = await currentClient.joinWorkspace(workspaceId, temporalKey);

          // Only update state if component is still mounted
          if (mounted) {
            setWorkspace(ws);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          setWorkspace(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    connectAndJoin();

    // Cleanup function
    return () => {
      mounted = false;

      // Leave workspace and disconnect
      if (workspace) {
        workspace.leave().catch((err) => {
          console.error('Error leaving workspace:', err);
        });
      }

      if (currentClient) {
        currentClient.disconnect();
      }
    };
  }, [serverUrl, workspaceId, temporalKey]);

  return { workspace, loading, error };
}

/**
 * Hook for collaborative editing
 * 
 * Gets editor from workspace, subscribes to text changes,
 * provides insert and delete functions, and tracks participants.
 * 
 * Requirements:
 * - 14.2: Real-time collaboration with participant tracking
 * 
 * @param workspace - Workspace client instance
 * @returns Object containing text, participants, and editing functions
 * 
 * @example
 * ```tsx
 * function Editor({ workspace }: { workspace: IWorkspaceClient }) {
 *   const { text, participants, insert, deleteText } = useCollaboration(workspace);
 *   
 *   return (
 *     <div>
 *       <textarea
 *         value={text}
 *         onChange={(e) => {
 *           // Handle text changes
 *           const newText = e.target.value;
 *           if (newText.length > text.length) {
 *             insert(text.length, newText.slice(text.length));
 *           } else {
 *             deleteText(newText.length, text.length - newText.length);
 *           }
 *         }}
 *       />
 *       <div>Participants: {participants.length}</div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useCollaboration(workspace: IWorkspaceClient | null): {
  text: string;
  participants: ParticipantInfo[];
  insert: (position: number, text: string) => void;
  deleteText: (position: number, length: number) => void;
} {
  const [text, setText] = useState('');
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    // Get editor from workspace
    const editor = workspace.getEditor();

    // Subscribe to text changes
    const unsubscribe = editor.onChange((newText) => {
      setText(newText);
    });

    // Initialize text with current state
    setText(editor.getText());

    // Update participants
    setParticipants(workspace.getParticipants());

    // Cleanup: unsubscribe from changes
    return unsubscribe;
  }, [workspace]);

  // Memoized insert function
  const insert = useCallback(
    (position: number, text: string) => {
      if (workspace) {
        workspace.getEditor().insert(position, text);
      }
    },
    [workspace]
  );

  // Memoized delete function
  const deleteText = useCallback(
    (position: number, length: number) => {
      if (workspace) {
        workspace.getEditor().delete(position, length);
      }
    },
    [workspace]
  );

  return { text, participants, insert, deleteText };
}
