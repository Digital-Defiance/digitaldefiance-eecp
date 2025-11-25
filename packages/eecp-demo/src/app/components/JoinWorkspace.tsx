/**
 * Join Workspace Component
 * 
 * Form for joining an existing workspace with ID and key.
 * Navigates to workspace view on successful join.
 * 
 * Requirements: 14.1
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function JoinWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleJoin = async () => {
    if (!key.trim()) {
      setError('Please enter a workspace key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Validate key format (base64)
      Buffer.from(key, 'base64');

      // Navigate to workspace with key in state
      navigate(`/workspace/${id}`, { state: { key } });
    } catch (err) {
      setError('Invalid workspace key format');
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
      <h1 style={{ marginBottom: '2rem' }}>Join Workspace</h1>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.5rem',
        width: '100%',
        maxWidth: '400px'
      }}>
        <div>
          <label htmlFor="workspaceId" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Workspace ID
          </label>
          <input
            id="workspaceId"
            type="text"
            value={id || ''}
            readOnly
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: '#f5f5f5'
            }}
          />
        </div>

        <div>
          <label htmlFor="key" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Workspace Key
          </label>
          <input
            id="key"
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter base64 encoded key"
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          />
        </div>

        {error && (
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f8d7da', 
            color: '#721c24',
            borderRadius: '4px'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleJoin}
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
          {loading ? 'Joining...' : 'Join Workspace'}
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
