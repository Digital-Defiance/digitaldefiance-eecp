/**
 * EECP Demo Component
 * 
 * Interactive demonstration of the EECP protocol with browser-based server.
 * Shows server + client side-by-side with real-time message flow visualization.
 */

import { useState, useEffect, useRef } from 'react';
import { BrowserEECPServer, BrowserTransport } from '@digitaldefiance/eecp-browser';
import { MessageBus, createMessageBus } from '@digitaldefiance/eecp-browser';
import { WorkspaceConfig } from '@digitaldefiance/eecp-protocol';
import { ECIESService } from '@digitaldefiance/ecies-lib';
import MessageFlow from './MessageFlow';
import CRDTVisualizer from './CRDTVisualizer';
import ParticipantPanel from './ParticipantPanel';
import EncryptionIndicator from './EncryptionIndicator';
import './EECPDemo.css';

interface Participant {
  id: string;
  name: string;
  color: string;
  transport: BrowserTransport | null;
  connected: boolean;
  publicKey?: Uint8Array;
  privateKey?: Uint8Array;
}

interface EncryptionEvent {
  type: 'encrypt' | 'decrypt';
  participant: string;
  timestamp: number;
  size: number;
}

export default function EECPDemo() {
  const [server] = useState(() => new BrowserEECPServer());
  const [workspace, setWorkspace] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([
    { id: '1', name: 'Alice', color: '#3b82f6', transport: null, connected: false },
    { id: '2', name: 'Bob', color: '#10b981', transport: null, connected: false },
    { id: '3', name: 'Charlie', color: '#f59e0b', transport: null, connected: false },
  ]);
  const [messages, setMessages] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [encryptionEvents, setEncryptionEvents] = useState<EncryptionEvent[]>([]);
  const [serverStatus, setServerStatus] = useState<'stopped' | 'running'>('stopped');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const messageBusRef = useRef<MessageBus | null>(null);
  const eciesRef = useRef<ECIESService>(new ECIESService());

  useEffect(() => {
    // Start server on mount
    server.start();
    setServerStatus('running');

    return () => {
      server.stop();
    };
  }, [server]);

  useEffect(() => {
    // Update countdown timer
    if (!workspace) {
      setTimeRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const remaining = workspace.expiresAt - Date.now();
      const newRemaining = remaining > 0 ? remaining : 0;
      setTimeRemaining(newRemaining);
      
      // When workspace expires, mark operations as destroyed
      if (newRemaining === 0 && remaining > -1000) {
        // Show that keys are destroyed and data is now unreadable
        setOperations(prev => prev.map(op => ({
          ...op,
          text: '█████████', // Show as redacted/encrypted
          encrypted: false,
          destroyed: true,
        })));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [workspace]);

  /**
   * Create a new workspace
   */
  const handleCreateWorkspace = async () => {
    try {
      console.log('Creating workspace with manual UUID');
      
      // Generate UUID manually to avoid GuidV4 crypto polyfill issues
      const uuidString = crypto.randomUUID();
      
      // Create a minimal GuidV4-like object
      // This is a workaround for the crypto polyfill issue in the browser
      const workspaceId = {
        asFullHexGuid: uuidString,
        asShortHexGuid: uuidString.replace(/-/g, ''),
        toString: () => uuidString,
      } as any;
      
      console.log('Created workspace ID:', workspaceId);
      
      const config: WorkspaceConfig = {
        id: workspaceId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes for demo
        timeWindow: {
          startTime: Date.now(),
          endTime: Date.now() + 2 * 60 * 1000,
          rotationInterval: 15, // 15 seconds between key rotations
          gracePeriod: 5 * 1000, // 5 second grace period
        },
        maxParticipants: 50,
        allowExtension: false,
      };

      const creatorPublicKey = new Uint8Array(32);
      crypto.getRandomValues(creatorPublicKey);

      const ws = await server.createWorkspace(config, creatorPublicKey);
      setWorkspace(ws);
      setMessages([]);
      setOperations([]);
    } catch (error) {
      console.error('Error creating workspace:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      console.error('Error cause:', (error as any)?.cause);
      alert(`Failed to create workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /**
   * Connect a participant
   */
  const handleConnectParticipant = async (participantIdParam: string) => {
    if (!workspace) {
      alert('Please create a workspace first');
      return;
    }

    try {
      const participant = participants.find((p) => p.id === participantIdParam);
      if (!participant) return;

      // Generate key pair for this participant
      const mnemonic = eciesRef.current.generateNewMnemonic();
      const keyPair = eciesRef.current.mnemonicToSimpleKeyPair(mnemonic);

      // Create transport
      const transport = server.createTransport();
      
      // Create message bus for this participant
      const bus = createMessageBus(transport);
      messageBusRef.current = bus;

      // Listen to messages
      bus.on('message-recorded', (data: any) => {
        console.log('Message recorded:', data);
        setMessages((prev) => [...prev, data]);
      });

      // Connect transport
      transport.connect();

      // Send handshake
      const participantUuid = crypto.randomUUID();
      const participantId = {
        asFullHexGuid: participantUuid,
        asShortHexGuid: participantUuid.replace(/-/g, ''),
        toString: () => participantUuid,
      } as any;
      
      const handshake = {
        protocolVersion: '1.0.0',
        workspaceId: workspace.id,
        participantId,
        publicKey: keyPair.publicKey,
        proof: {
          signature: new Uint8Array(64),
          timestamp: Date.now(),
        },
      };

      transport.send(JSON.stringify({
        type: 'handshake',
        payload: handshake,
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      }));

      // Update participant state
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantIdParam
            ? { ...p, transport, connected: true, publicKey: keyPair.publicKey, privateKey: keyPair.privateKey }
            : p
        )
      );
    } catch (error) {
      console.error('Error connecting participant:', error);
    }
  };

  /**
   * Disconnect a participant
   */
  const handleDisconnectParticipant = (participantId: string) => {
    const participant = participants.find((p) => p.id === participantId);
    if (!participant || !participant.transport) return;

    participant.transport.close();

    setParticipants((prev) =>
      prev.map((p) =>
        p.id === participantId
          ? { ...p, transport: null, connected: false }
          : p
      )
    );
  };

  /**
   * Send an operation from a participant
   */
  const handleSendOperation = async (participantId: string, text: string) => {
    const participant = participants.find((p) => p.id === participantId);
    if (!participant || !participant.transport || !workspace || !participant.publicKey) return;

    // Check if workspace has expired
    if (timeRemaining !== null && timeRemaining <= 0) {
      alert('⚠️ Workspace has expired!\n\n• Encryption keys have been destroyed\n• Old messages are now unreadable\n• Cannot send new messages\n\nCreate a new workspace to continue.');
      return;
    }

    try {
      // Encrypt the text content
      const plaintext = new TextEncoder().encode(text);
      const encrypted = await eciesRef.current.encryptSimpleOrSingle(false, participant.publicKey, plaintext);
      
      // Record encryption event
      setEncryptionEvents((prev) => [...prev, {
        type: 'encrypt',
        participant: participant.name,
        timestamp: Date.now(),
        size: encrypted.length,
      }]);

      const opUuid = crypto.randomUUID();
      const partUuid = crypto.randomUUID();
      
      const operation = {
        id: {
          asFullHexGuid: opUuid,
          asShortHexGuid: opUuid.replace(/-/g, ''),
          toString: () => opUuid,
        } as any,
        workspaceId: workspace.id,
        participantId: {
          asFullHexGuid: partUuid,
          asShortHexGuid: partUuid.replace(/-/g, ''),
          toString: () => partUuid,
        } as any,
        timestamp: Date.now(),
        position: 0,
        operationType: 'insert',
        encryptedContent: encrypted,
        signature: new Uint8Array(64),
      };

      participant.transport.send(JSON.stringify({
        type: 'operation',
        payload: { operation },
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
      }));

      // Decrypt for display (simulating what the receiver would do)
      if (participant.privateKey) {
        const decrypted = await eciesRef.current.decryptSimpleOrSingleWithHeader(false, participant.privateKey, encrypted);
        const decryptedText = new TextDecoder().decode(decrypted);
        
        // Record decryption event
        setEncryptionEvents((prev) => [...prev, {
          type: 'decrypt',
          participant: participant.name,
          timestamp: Date.now(),
          size: decrypted.length,
        }]);

        setOperations((prev) => [...prev, { 
          participant: participant.name, 
          text: decryptedText, 
          timestamp: Date.now(),
          encrypted: true,
        }]);
      }
    } catch (error) {
      console.error('Error sending operation:', error);
    }
  };

  /**
   * Get server health
   */
  const serverHealth = server.getHealth();

  return (
    <div className="eecp-demo">
      <div className="demo-header">
        <h2>EECP Protocol Demo</h2>
        <p>Interactive demonstration of the Ephemeral Encrypted Collaboration Protocol</p>
      </div>

      <div className="demo-grid">
        {/* Server Panel */}
        <div className="panel server-panel">
          <div className="panel-header">
            <h3>🖥️ Server</h3>
            <span className={`status-badge ${serverStatus}`}>{serverStatus}</span>
          </div>
          <div className="panel-content">
            <div className="server-stats">
              <div className="stat">
                <span className="stat-label">Workspaces:</span>
                <span className="stat-value">{serverHealth.workspaces}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Participants:</span>
                <span className="stat-value">{serverHealth.participants}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Protocol Messages:</span>
                <span className="stat-value">{messages.length}</span>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleCreateWorkspace}
              disabled={!!workspace}
            >
              {workspace ? '✓ Workspace Created' : 'Create Workspace'}
            </button>

            {workspace && (
              <div className="workspace-info">
                <p><strong>Workspace ID:</strong> {workspace.id.asFullHexGuid.substring(0, 8)}...</p>
                <p><strong>Expires in:</strong> {timeRemaining !== null ? (
                  <span className={timeRemaining < 30000 ? 'expiring-soon' : ''}>
                    {Math.floor(timeRemaining / 60000)}:{String(Math.floor((timeRemaining % 60000) / 1000)).padStart(2, '0')}
                  </span>
                ) : '...'}</p>
                <p><strong>Key Rotation:</strong> Every 15 seconds</p>
                {timeRemaining !== null && timeRemaining === 0 && (
                  <p className="expired-warning">⚠️ Workspace has expired! Keys are no longer valid.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Participants Panel */}
        <div className="panel">
          <div className="panel-header">
            <h3>👥 Participants</h3>
          </div>
          <div className="panel-content">
            <ParticipantPanel
              participants={participants}
              onConnect={handleConnectParticipant}
              onDisconnect={handleDisconnectParticipant}
              onSendMessage={(id) => {
                const participant = participants.find((p) => p.id === id);
                if (participant) {
                  const text = prompt(`Enter text for ${participant.name}:`);
                  if (text) handleSendOperation(id, text);
                }
              }}
            />
          </div>
        </div>

        {/* Message Flow Panel */}
        <div className="panel">
          <div className="panel-header">
            <h3>📨 Message Flow</h3>
          </div>
          <div className="panel-content">
            <MessageFlow messages={messages} />
          </div>
        </div>

        {/* CRDT Visualizer Panel */}
        <div className="panel">
          <div className="panel-header">
            <h3>📝 CRDT State</h3>
          </div>
          <div className="panel-content">
            <CRDTVisualizer operations={operations} />
          </div>
        </div>

        {/* Encryption Indicator Panel */}
        <div className="panel">
          <div className="panel-header">
            <h3>🔐 Encryption</h3>
          </div>
          <div className="panel-content">
            <EncryptionIndicator 
              operations={operations} 
              encryptionEvents={encryptionEvents}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
