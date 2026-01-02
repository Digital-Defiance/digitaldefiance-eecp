/**
 * Create Workspace Component
 * 
 * Form for creating a new workspace with configurable duration.
 * Navigates to workspace view on successful creation.
 * 
 * Requirements: 14.1
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EECPClient } from '@digitaldefiance/eecp-client';
import { WorkspaceConfig } from '@digitaldefiance/eecp-protocol';

// Generate UUID using browser's crypto API (RFC 4122 version 4)
function generateUUID(): string {
  // Use native crypto.randomUUID() if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for older browsers or test environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function CreateWorkspace() {
  const [duration, setDuration] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      // Create client
      const client = new EECPClient();

      // Connect to server
      await client.connect('ws://localhost:3000');

      // Create workspace config
      const now = Date.now();
      const config: WorkspaceConfig = {
        id: generateUUID(),
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
      };

      // Create workspace
      const workspace = await client.createWorkspace(config);

      // Navigate to workspace
      navigate(`/workspace/${workspace.getMetadata().config.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      padding: '2rem'
    }}>
      <h1 style={{ marginBottom: '2rem' }}>Create Workspace</h1>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.5rem',
        width: '100%',
        maxWidth: '400px'
      }}>
        <div>
          <label htmlFor="duration" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Duration (minutes)
          </label>
          <select
            id="duration"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          >
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </div>

        {error && (
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f8d7da', 
            color: '#721c24',
            borderRadius: '4px'
          }}>
            Error: {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={loading}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.1rem',
            backgroundColor: loading ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Creating...' : 'Create Workspace'}
        </button>

        <button
          onClick={() => navigate('/')}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '1rem',
            backgroundColor: 'transparent',
            color: '#007bff',
            border: '1px solid #007bff',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
