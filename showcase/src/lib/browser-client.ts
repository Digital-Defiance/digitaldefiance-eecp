/**
 * Browser-Compatible EECP Client
 * 
 * Adapter that uses BrowserTransport instead of WebSocket.
 * Integrates real CRDT, encryption, and key management.
 */

import {
  WorkspaceId,
  ParticipantId,
  WorkspaceConfig,
  MessageEnvelope,
  HandshakeMessage,
  HandshakeAckMessage,
  OperationMessage,
  ChallengeMessage,
  CRDTOperation,
} from '@digitaldefiance-eecp/eecp-protocol';
import { GuidV4, Member, MemberType, EmailString } from '@digitaldefiance/ecies-lib';
import { BrowserTransport } from './browser-server.js';
import {
  EncryptedTextCRDT,
  OperationEncryptor,
} from '@digitaldefiance-eecp/eecp-crdt';
import {
  TimeLockedEncryption,
  TemporalKeyDerivation,
  TemporalKey,
  eciesService,
} from '@digitaldefiance-eecp/eecp-crypto';
import { ClientKeyManager } from '@digitaldefiance-eecp/eecp-client';

/**
 * Recursively reconstruct GuidV4 and Buffer objects from parsed JSON
 * GuidV4 objects are serialized as objects with _value property
 * Buffer objects are serialized as { type: 'Buffer', data: [...] }
 */
function reconstructGuidV4(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Check if this looks like a serialized Buffer
  if (typeof obj === 'object' && obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return Buffer.from(obj.data);
  }
  
  // Check if this looks like a serialized GuidV4
  if (typeof obj === 'object' && obj._value !== undefined) {
    try {
      // GuidV4 stores its value as a Buffer-like object
      if (obj._value.type === 'Buffer' && Array.isArray(obj._value.data)) {
        return GuidV4.fromBuffer(Buffer.from(obj._value.data));
      }
    } catch (e) {
      // If reconstruction fails, return original
    }
  }
  
  // Recursively process arrays
  if (Array.isArray(obj)) {
    return obj.map(reconstructGuidV4);
  }
  
  // Recursively process objects
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = reconstructGuidV4(obj[key]);
    }
    return result;
  }
  
  return obj;
}

/**
 * Browser client for EECP workspace
 */
export class BrowserEECPClient {
  private transport: BrowserTransport | null = null;
  private workspaceId: WorkspaceId | null = null;
  private participantId: ParticipantId | null = null;
  private crdt: EncryptedTextCRDT;
  private encryptor: OperationEncryptor;
  private encryption: TimeLockedEncryption;
  private keyDerivation: TemporalKeyDerivation;
  private keyManager: ClientKeyManager;
  private currentKey: TemporalKey | null = null;
  private changeListeners: Set<(text: string) => void> = new Set();
  private connected = false;
  private participantMember: Member | null = null;

  constructor() {
    this.crdt = new EncryptedTextCRDT();
    this.encryption = new TimeLockedEncryption();
    this.encryptor = new OperationEncryptor(this.encryption);
    this.keyDerivation = new TemporalKeyDerivation();
    this.keyManager = new ClientKeyManager('eecp-demo-keys');
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    await this.keyManager.initialize();
  }

  /**
   * Connect to workspace with transport
   */
  async connect(
    transport: BrowserTransport,
    workspaceId: WorkspaceId,
    workspaceSecret: Buffer,
    workspaceConfig?: WorkspaceConfig
  ): Promise<void> {
    this.transport = transport;
    this.workspaceId = workspaceId;
    this.participantId = GuidV4.new();

    // Use provided config or create default
    const config: WorkspaceConfig = workspaceConfig || {
      id: workspaceId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
      timeWindow: {
        startTime: Date.now(),
        endTime: Date.now() + 30 * 60 * 1000,
        rotationInterval: 15,
        gracePeriod: 60 * 1000,
      },
      maxParticipants: 50,
      allowExtension: false,
    };

    // Get the current key ID based on the time window
    const keyId = this.keyDerivation.getCurrentKeyId(
      config.timeWindow.startTime,
      Date.now(),
      config.timeWindow.rotationInterval
    );

    this.currentKey = await this.keyDerivation.deriveKey(
      workspaceSecret,
      config.timeWindow,
      keyId
    );

    // Store key
    await this.keyManager.storeKey(workspaceId, this.currentKey);

    // Generate keypair for participant using Member
    const memberWithMnemonic = Member.newMember(
      eciesService,
      MemberType.User,
      'Browser Participant',
      new EmailString('participant@browser.local')
    );
    this.participantMember = memberWithMnemonic.member as Member;
    const publicKey = this.participantMember.publicKey;

    await this.keyManager.storeParticipantKey(
      this.participantId,
      Buffer.from(this.participantMember.privateKey!.value),
      Buffer.from(publicKey)
    );

    // Set up message handler
    this.setupMessageHandler();

    // Connect transport first to trigger server challenge
    transport.connect();

    // Wait for challenge and perform handshake
    await this.performHandshake(Buffer.from(publicKey));
  }

  /**
   * Perform handshake with server
   */
  private async performHandshake(publicKey: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Handshake timeout'));
      }, 5000);

      // Wait for challenge
      const challengeHandler = (data: string) => {
        try {
          const parsed = JSON.parse(data);
          const envelope: MessageEnvelope = reconstructGuidV4(parsed);
          if (envelope.type === 'challenge') {
            const challenge = envelope.payload as ChallengeMessage;
            
            // Send handshake
            const handshake: HandshakeMessage = {
              protocolVersion: '1.0.0',
              workspaceId: this.workspaceId!,
              participantId: this.participantId!,
              publicKey,
              proof: {
                signature: Buffer.from(challenge.challenge, 'base64'),
                timestamp: Date.now(),
              },
            };

            this.sendMessage('handshake', handshake);

            // Wait for ack
            const ackHandler = (data: string) => {
              try {
                const ackParsed = JSON.parse(data);
                const ackEnvelope: MessageEnvelope = reconstructGuidV4(ackParsed);
                if (ackEnvelope.type === 'handshake_ack') {
                  const ack = ackEnvelope.payload as HandshakeAckMessage;
                  if (ack.success) {
                    clearTimeout(timeout);
                    this.transport!.removeListener('message', challengeHandler);
                    this.transport!.removeListener('message', ackHandler);
                    this.connected = true;
                    resolve();
                  } else {
                    reject(new Error('Handshake failed'));
                  }
                }
              } catch (error) {
                // Ignore parse errors
              }
            };

            this.transport!.on('message', ackHandler);
          }
        } catch (error) {
          // Ignore parse errors
        }
      };

      this.transport!.on('message', challengeHandler);
    });
  }

  /**
   * Set up message handler for incoming operations
   */
  private setupMessageHandler(): void {
    if (!this.transport) return;

    this.transport.on('message', async (data: string) => {
      try {
        const parsed = JSON.parse(data);
        // Reconstruct GuidV4 objects that were lost during JSON serialization
        const envelope: MessageEnvelope = reconstructGuidV4(parsed);

        if (envelope.type === 'operation') {
          await this.handleOperation(envelope.payload as OperationMessage);
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });
  }

  /**
   * Handle incoming operation
   */
  private async handleOperation(message: OperationMessage): Promise<void> {
    try {
      const encrypted = message.operation;

      // Skip own operations - compare as hex strings
      if (encrypted.participantId.asFullHexGuid === this.participantId?.asFullHexGuid) {
        return;
      }

      // Decrypt operation
      if (!this.currentKey) {
        console.error('No temporal key available');
        return;
      }

      const operation = await this.encryptor.decryptOperation(
        encrypted,
        this.currentKey
      );

      // Apply to CRDT
      this.crdt.applyOperation(operation);

      // Notify listeners
      this.notifyChange();
    } catch (error) {
      console.error('Error handling operation:', error);
    }
  }

  /**
   * Insert text at position
   */
  async insert(position: number, text: string): Promise<void> {
    if (!this.connected || !this.participantId || !this.currentKey) {
      throw new Error('Not connected');
    }

    // Create CRDT operation
    const operation = this.crdt.insert(position, text, this.participantId);

    // Send encrypted operation
    await this.sendOperation(operation);

    // Notify listeners
    this.notifyChange();
  }

  /**
   * Delete text at position
   */
  async delete(position: number, length: number): Promise<void> {
    if (!this.connected || !this.participantId || !this.currentKey) {
      throw new Error('Not connected');
    }

    // Create CRDT operation
    const operation = this.crdt.delete(position, length, this.participantId);

    // Send encrypted operation
    await this.sendOperation(operation);

    // Notify listeners
    this.notifyChange();
  }

  /**
   * Send encrypted operation
   */
  private async sendOperation(operation: CRDTOperation): Promise<void> {
    if (!this.currentKey || !this.workspaceId || !this.participantId || !this.participantMember) {
      throw new Error('Not initialized');
    }

    // Use Member's private key value directly
    const privateKey = Buffer.from(this.participantMember.privateKey!.value);

    // Encrypt operation
    const encrypted = await this.encryptor.encryptOperation(
      operation,
      this.currentKey,
      privateKey,
      this.workspaceId
    );

    // Send via transport
    this.sendMessage('operation', { operation: encrypted });
  }

  /**
   * Get current text
   */
  getText(): string {
    return this.crdt.getText();
  }

  /**
   * Subscribe to changes
   */
  onChange(callback: (text: string) => void): () => void {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }

  /**
   * Notify change listeners
   */
  private notifyChange(): void {
    const text = this.getText();
    for (const listener of this.changeListeners) {
      listener(text);
    }
  }

  /**
   * Send message via transport
   */
  private sendMessage(type: string, payload: unknown): void {
    if (!this.transport) {
      throw new Error('Not connected');
    }

    const envelope: MessageEnvelope = {
      type: type as any,
      payload,
      timestamp: Date.now(),
      messageId: crypto.randomUUID(),
    };

    this.transport.send(JSON.stringify(envelope));
  }

  /**
   * Disconnect from workspace
   */
  disconnect(): void {
    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
    this.connected = false;
    this.changeListeners.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get participant ID
   */
  getParticipantId(): ParticipantId | null {
    return this.participantId;
  }

  /**
   * Get workspace ID
   */
  getWorkspaceId(): WorkspaceId | null {
    return this.workspaceId;
  }
}
