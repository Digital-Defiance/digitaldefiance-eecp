/**
 * Home Page Component
 * 
 * Landing page with options to create or join a workspace.
 * 
 * Requirements: 14.1
 */

import { useNavigate } from 'react-router-dom';

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      padding: '2rem'
    }}>
      <h1 style={{ marginBottom: '2rem' }}>
        Ephemeral Encrypted Collaboration Protocol
      </h1>
      <p style={{ marginBottom: '3rem', textAlign: 'center', maxWidth: '600px' }}>
        Create secure, time-limited collaborative workspaces with end-to-end encryption.
        All content is automatically destroyed after expiration.
      </p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={() => navigate('/create')}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Create Workspace
        </button>
        <button
          onClick={() => {
            const workspaceId = prompt('Enter workspace ID:');
            if (workspaceId) {
              navigate(`/join/${workspaceId}`);
            }
          }}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.1rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Join Workspace
        </button>
      </div>
    </div>
  );
}
