/**
 * Workspace Header Component
 * 
 * Displays countdown timer, share button, and export button.
 * 
 * Requirements: 14.3, 14.4, 14.5
 */

import { useState, useEffect } from 'react';
import { IWorkspaceClient } from '@digitaldefiance-eecp/eecp-client';

interface WorkspaceHeaderProps {
  workspace: IWorkspaceClient;
}

export function WorkspaceHeader({ workspace }: WorkspaceHeaderProps) {
  const [timeRemaining, setTimeRemaining] = useState(0);

  useEffect(() => {
    const metadata = workspace.getMetadata();
    
    // Update countdown every second
    const interval = setInterval(() => {
      const remaining = metadata.config.expiresAt - Date.now();
      setTimeRemaining(Math.max(0, remaining));
    }, 1000);

    // Initial update
    const remaining = metadata.config.expiresAt - Date.now();
    setTimeRemaining(Math.max(0, remaining));

    return () => clearInterval(interval);
  }, [workspace]);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleShare = () => {
    const metadata = workspace.getMetadata();
    const shareUrl = `${window.location.origin}/join/${metadata.config.id}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert('Share link copied to clipboard!');
    }).catch(() => {
      alert(`Share this link:\n${shareUrl}`);
    });
  };

  const handleExport = () => {
    const text = workspace.exportDocument();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace-${workspace.getMetadata().config.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isExpiringSoon = timeRemaining < 60000; // Less than 1 minute

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      padding: '1rem 2rem',
      backgroundColor: '#343a40',
      color: 'white',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <h1 style={{ 
        margin: 0, 
        fontSize: '1.5rem',
        flex: 1
      }}>
        EECP Workspace
      </h1>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
        {/* Countdown Timer */}
        <div style={{
          padding: '0.5rem 1rem',
          backgroundColor: isExpiringSoon ? '#dc3545' : '#495057',
          borderRadius: '4px',
          fontWeight: 'bold',
          fontSize: '1.1rem'
        }}>
          {timeRemaining > 0 ? (
            <>⏱️ {formatTime(timeRemaining)}</>
          ) : (
            <>⏰ Expired</>
          )}
        </div>

        {/* Share Button */}
        <button
          onClick={handleShare}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          title="Share workspace"
        >
          <span>🔗</span>
          <span>Share</span>
        </button>

        {/* Export Button */}
        <button
          onClick={handleExport}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          title="Export document"
        >
          <span>💾</span>
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
