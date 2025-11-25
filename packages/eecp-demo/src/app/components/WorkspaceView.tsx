/**
 * Workspace View Component
 * 
 * Main workspace interface that uses useWorkspace and useCollaboration hooks.
 * Displays loading and error states, renders workspace header, editor, and sidebar.
 * 
 * Requirements: 14.1, 14.2, 14.3
 */

import { useParams, useLocation } from 'react-router-dom';
import { useWorkspace, useCollaboration } from '@digitaldefiance-eecp/eecp-client';
import { WorkspaceHeader } from './WorkspaceHeader';
import { RichTextEditor } from './RichTextEditor';
import { ParticipantSidebar } from './ParticipantSidebar';

export function WorkspaceView() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const state = location.state as { key?: string } | null;

  // Get temporal key from location state or null
  const temporalKey = state?.key ? Buffer.from(state.key, 'base64') : null;

  // Use workspace hook
  const { workspace, loading, error } = useWorkspace(
    'ws://localhost:3000',
    id || null,
    temporalKey
  );

  // Use collaboration hook
  const { text, participants, insert, deleteText } = useCollaboration(workspace);

  // Loading state
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            fontSize: '2rem', 
            marginBottom: '1rem' 
          }}>
            ⏳
          </div>
          <div>Loading workspace...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh' 
      }}>
        <div style={{ 
          padding: '2rem', 
          backgroundColor: '#f8d7da', 
          color: '#721c24',
          borderRadius: '4px',
          maxWidth: '500px'
        }}>
          <h2 style={{ marginTop: 0 }}>Error</h2>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  // No workspace state
  if (!workspace) {
    return null;
  }

  // Main workspace view
  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh',
      flexDirection: 'column'
    }}>
      <WorkspaceHeader workspace={workspace} />
      
      <div style={{ 
        display: 'flex', 
        flex: 1,
        overflow: 'hidden'
      }}>
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <RichTextEditor
            text={text}
            onInsert={insert}
            onDelete={deleteText}
          />
        </div>
        
        <ParticipantSidebar participants={participants} />
      </div>
    </div>
  );
}
