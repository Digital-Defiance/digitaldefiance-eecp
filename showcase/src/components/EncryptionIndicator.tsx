/**
 * Encryption Indicator
 * 
 * Shows real encryption/decryption activity.
 */

import './EncryptionIndicator.css';

interface EncryptionEvent {
  type: 'encrypt' | 'decrypt';
  participant: string;
  timestamp: number;
  size: number;
}

interface EncryptionIndicatorProps {
  operations: Array<{
    participant: string;
    text: string;
    timestamp: number;
    encrypted?: boolean;
  }>;
  encryptionEvents: EncryptionEvent[];
}

export default function EncryptionIndicator({ encryptionEvents }: EncryptionIndicatorProps) {
  const encryptCount = encryptionEvents.filter(e => e.type === 'encrypt').length;
  const decryptCount = encryptionEvents.filter(e => e.type === 'decrypt').length;
  const recentEvents = encryptionEvents.slice(-5).reverse();

  return (
    <div className="encryption-indicator">
      <div className="encryption-status">
        <div className="status-item">
          <div className="status-icon">🔒</div>
          <div className="status-info">
            <div className="status-label">Encrypted</div>
            <div className="status-value">{encryptCount}</div>
          </div>
        </div>
        <div className="status-item">
          <div className="status-icon">🔓</div>
          <div className="status-info">
            <div className="status-label">Decrypted</div>
            <div className="status-value">{decryptCount}</div>
          </div>
        </div>
      </div>

      {recentEvents.length > 0 && (
        <div className="recent-events">
          <h5>Recent Activity</h5>
          <div className="event-list">
            {recentEvents.map((event, idx) => (
              <div key={idx} className={`event-item ${event.type}`}>
                <span className="event-icon">{event.type === 'encrypt' ? '🔒' : '🔓'}</span>
                <div className="event-details">
                  <div className="event-type">
                    {event.type === 'encrypt' ? 'Encrypted' : 'Decrypted'}
                  </div>
                  <div className="event-participant">{event.participant} • {event.size} bytes</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="encryption-info">
        <div className="info-item">
          <span className="info-icon">🛡️</span>
          <div className="info-content">
            <div className="info-title">ECIES Encryption</div>
            <div className="info-description">Elliptic Curve Integrated Encryption</div>
          </div>
        </div>
      </div>
    </div>
  );
}
