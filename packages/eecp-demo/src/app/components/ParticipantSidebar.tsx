/**
 * Participant Sidebar Component
 * 
 * Displays participant list with online status indicators and roles.
 * 
 * Requirements: 14.2
 */

import { ParticipantInfo } from '@digitaldefiance/eecp-protocol';

interface ParticipantSidebarProps {
  participants: ParticipantInfo[];
}

export function ParticipantSidebar({ participants }: ParticipantSidebarProps) {
  const getRoleColor = (role: string): string => {
    switch (role) {
      case 'creator':
        return '#ffc107';
      case 'editor':
        return '#28a745';
      case 'viewer':
        return '#6c757d';
      default:
        return '#6c757d';
    }
  };

  const getRoleIcon = (role: string): string => {
    switch (role) {
      case 'creator':
        return '👑';
      case 'editor':
        return '✏️';
      case 'viewer':
        return '👁️';
      default:
        return '👤';
    }
  };

  return (
    <aside style={{
      width: '250px',
      borderLeft: '1px solid #dee2e6',
      backgroundColor: '#f8f9fa',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #dee2e6',
        backgroundColor: 'white'
      }}>
        <h2 style={{ 
          margin: 0, 
          fontSize: '1.2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span>👥</span>
          <span>Participants</span>
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.9rem',
            color: '#6c757d'
          }}>
            {participants.length}
          </span>
        </h2>
      </div>

      {/* Participant List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.5rem'
      }}>
        {participants.length === 0 ? (
          <div style={{
            padding: '2rem 1rem',
            textAlign: 'center',
            color: '#6c757d'
          }}>
            No participants yet
          </div>
        ) : (
          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0
          }}>
            {participants.map((participant) => (
              <li
                key={participant.id}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  border: '1px solid #dee2e6',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#007bff',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  flexShrink: 0
                }}>
                  {getRoleIcon(participant.role)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {participant.id.substring(0, 8)}...
                  </div>
                  <div style={{
                    fontSize: '0.8rem',
                    color: getRoleColor(participant.role),
                    textTransform: 'capitalize'
                  }}>
                    {participant.role}
                  </div>
                </div>

                {/* Online Status */}
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#28a745',
                  flexShrink: 0
                }}
                title="Online"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '0.75rem',
        borderTop: '1px solid #dee2e6',
        backgroundColor: 'white',
        fontSize: '0.8rem',
        color: '#6c757d',
        textAlign: 'center'
      }}>
        All participants are online
      </div>
    </aside>
  );
}
