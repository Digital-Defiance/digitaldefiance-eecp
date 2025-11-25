/**
 * Participant Panel
 * 
 * Shows multiple simulated users with controls.
 */

import './ParticipantPanel.css';

interface Participant {
  id: string;
  name: string;
  color: string;
  connected: boolean;
}

interface ParticipantPanelProps {
  participants: Participant[];
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onSendMessage: (id: string) => void;
}

export default function ParticipantPanel({
  participants,
  onConnect,
  onDisconnect,
  onSendMessage,
}: ParticipantPanelProps) {
  return (
    <div className="participant-panel">
      <h3>👥 Simulated Participants</h3>
      <p className="panel-description">
        Control multiple participants to simulate collaborative editing
      </p>

      <div className="participants-grid">
        {participants.map((participant) => (
          <div key={participant.id} className="participant-box">
            <div className="participant-visual">
              <div
                className="participant-circle"
                style={{ backgroundColor: participant.color }}
              >
                {participant.name[0]}
              </div>
              <div className={`status-indicator ${participant.connected ? 'online' : 'offline'}`} />
            </div>

            <div className="participant-details">
              <div className="participant-name">{participant.name}</div>
              <div className={`participant-status ${participant.connected ? 'online' : 'offline'}`}>
                {participant.connected ? 'Online' : 'Offline'}
              </div>
            </div>

            <div className="participant-controls">
              {!participant.connected ? (
                <button
                  className="control-btn connect"
                  onClick={() => onConnect(participant.id)}
                  title="Connect participant"
                >
                  🔌 Connect
                </button>
              ) : (
                <>
                  <button
                    className="control-btn send"
                    onClick={() => onSendMessage(participant.id)}
                    title="Send message"
                  >
                    ✉️ Send
                  </button>
                  <button
                    className="control-btn disconnect"
                    onClick={() => onDisconnect(participant.id)}
                    title="Disconnect participant"
                  >
                    ❌ Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
