/**
 * CRDT Visualizer
 * 
 * Shows document state and operations in real-time.
 */

import { useState, useEffect } from 'react';
import './CRDTVisualizer.css';

interface Operation {
  participant: string;
  text: string;
  timestamp: number;
  type?: 'insert' | 'delete';
  destroyed?: boolean;
}

interface CRDTVisualizerProps {
  operations: Operation[];
}

export default function CRDTVisualizer({ operations }: CRDTVisualizerProps) {
  const [documentState, setDocumentState] = useState<string>('');
  const [operationLog, setOperationLog] = useState<Operation[]>([]);
  const [isDestroyed, setIsDestroyed] = useState(false);

  useEffect(() => {
    // Check if keys have been destroyed
    const destroyed = operations.some(op => op.destroyed);
    setIsDestroyed(destroyed);
    
    // Update document state based on operations
    if (operations.length > 0) {
      if (destroyed) {
        // Show encrypted/unreadable state
        setDocumentState('🔒 [ENCRYPTED DATA - KEYS DESTROYED]');
      } else {
        // Build document from all operations (no spaces between)
        const text = operations.map(op => op.text).join('');
        setDocumentState(text);
      }
      setOperationLog(operations.slice(-10));
    }
  }, [operations]);

  return (
    <div className="crdt-visualizer">
      <div className="visualizer-section">
        <h4>📄 Document State</h4>
        <div className="document-state">
          {documentState || <span className="empty-text">Empty document</span>}
        </div>
      </div>

      <div className="visualizer-section">
        <h4>🔄 Operation Log</h4>
        <div className="operation-log">
          {operationLog.length === 0 ? (
            <div className="empty-text">No operations yet</div>
          ) : (
            operationLog.map((op, idx) => (
              <div key={idx} className="log-entry">
                <div className="log-timestamp">
                  {new Date(op.timestamp).toLocaleTimeString()}
                </div>
                <div className="log-participant">{op.participant}</div>
                <div className="log-operation">
                  <span className={`op-type ${op.type || 'insert'}`}>{op.type || 'insert'}</span>
                  <span className="op-text">{op.text}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="visualizer-section">
        <h4>📊 Statistics</h4>
        {isDestroyed ? (
          <div className="stats-destroyed">
            <div className="destroyed-message">
              🔒 Data Destroyed - Statistics Unavailable
            </div>
          </div>
        ) : (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{operations.length}</div>
              <div className="stat-label">Total Operations</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{documentState.trim().split(/\s+/).filter(Boolean).length}</div>
              <div className="stat-label">Words</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{documentState.trim().length}</div>
              <div className="stat-label">Characters</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
