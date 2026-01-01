# Design Document: Ephemeral Encrypted Collaboration Protocol (EECP)

## Overview

The Ephemeral Encrypted Collaboration Protocol (EECP) is a distributed system that enables real-time collaborative document editing with cryptographic guarantees of content unreadability after expiration. The system architecture is built on three core principles:

1. **Zero-Knowledge Server**: The server routes encrypted operations without ever seeing plaintext content
2. **Temporal Encryption**: Time-bound keys that are automatically destroyed on a predetermined schedule
3. **Encrypted CRDT**: Conflict-free replicated data types with encrypted content payloads

The system consists of multiple TypeScript packages in an Nx monorepo:
- `eecp-protocol`: Core types and protocol definitions
- `eecp-crypto`: Temporal key management and encryption primitives
- `eecp-crdt`: Encrypted CRDT implementation
- `eecp-server`: Express + WebSocket server for operation routing
- `eecp-client`: Browser client library with React hooks
- `eecp-cli`: Command-line interface for testing and automation
- `eecp-demo`: Reference web application

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Participants                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Browser    │  │   Browser    │  │     CLI      │      │
│  │   Client     │  │   Client     │  │   Client     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         │ Encrypted Ops    │ Encrypted Ops    │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  WebSocket      │
                    │  Server         │
                    │  (Zero-Know)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Operation      │
                    │  Router         │
                    └─────────────────┘
```

### Component Architecture

```
Client Layer:
┌─────────────────────────────────────────────────────┐
│  UI (React/Terminal)                                │
├─────────────────────────────────────────────────────┤
│  Collaborative Editor (Yjs CRDT)                    │
├─────────────────────────────────────────────────────┤
│  Operation Encryptor/Decryptor                      │
├─────────────────────────────────────────────────────┤
│  Temporal Key Manager (IndexedDB)                   │
├─────────────────────────────────────────────────────┤
│  WebSocket Client (Auto-reconnect)                  │
└─────────────────────────────────────────────────────┘

Server Layer:
┌─────────────────────────────────────────────────────┐
│  REST API (Workspace Management)                    │
├─────────────────────────────────────────────────────┤
│  WebSocket Server (Operation Streaming)             │
├─────────────────────────────────────────────────────┤
│  Workspace Manager (Lifecycle)                      │
├─────────────────────────────────────────────────────┤
│  Participant Manager (Auth & Connections)           │
├─────────────────────────────────────────────────────┤
│  Operation Router (Broadcast)                       │
├─────────────────────────────────────────────────────┤
│  Temporal Cleanup Service (Expiry)                  │
└─────────────────────────────────────────────────────┘
```


## Components and Interfaces

### 1. Protocol Package (`eecp-protocol`)

Defines core types and interfaces used across all packages.

#### Core Types

```typescript
// Workspace identification
type WorkspaceId = string; // UUID v4
type ParticipantId = string; // UUID v4
type OperationId = string; // UUID v4

// Time management
interface TimeWindow {
  startTime: number; // Unix timestamp (ms)
  endTime: number; // Unix timestamp (ms)
  rotationInterval: number; // Minutes (5, 15, 30, 60)
  gracePeriod: number; // Milliseconds
}

// Workspace configuration
interface WorkspaceConfig {
  id: WorkspaceId;
  createdAt: number;
  expiresAt: number;
  timeWindow: TimeWindow;
  maxParticipants: number;
  allowExtension: boolean;
}

// Encrypted operation
interface EncryptedOperation {
  id: OperationId;
  workspaceId: WorkspaceId;
  participantId: ParticipantId;
  timestamp: number;
  
  // CRDT metadata (visible to server)
  position: number;
  operationType: 'insert' | 'delete' | 'format';
  
  // Encrypted payload (opaque to server)
  encryptedContent: Buffer;
  
  // Authentication
  signature: Buffer;
}

// Workspace metadata (encrypted)
interface WorkspaceMetadata {
  config: WorkspaceConfig;
  participants: ParticipantInfo[];
  currentTemporalKeyId: string;
  keyRotationSchedule: KeyRotationSchedule;
}

interface ParticipantInfo {
  id: ParticipantId;
  publicKey: Buffer;
  joinedAt: number;
  role: 'creator' | 'editor' | 'viewer';
}

interface KeyRotationSchedule {
  currentKeyId: string;
  nextRotationAt: number;
  previousKeyId?: string;
  previousKeyExpiresAt?: number;
}
```

#### WebSocket Protocol Messages

```typescript
// Message envelope
interface MessageEnvelope {
  type: MessageType;
  payload: unknown;
  timestamp: number;
  messageId: string;
}

type MessageType =
  | 'handshake'
  | 'handshake_ack'
  | 'operation'
  | 'operation_ack'
  | 'sync_request'
  | 'sync_response'
  | 'error'
  | 'ping'
  | 'pong';

// Handshake messages
interface HandshakeMessage {
  protocolVersion: string;
  workspaceId: WorkspaceId;
  participantId: ParticipantId;
  publicKey: Buffer;
  proof: ZeroKnowledgeProof;
}

interface HandshakeAckMessage {
  success: boolean;
  currentKeyId: string;
  encryptedMetadata: Buffer;
  serverTime: number;
}

// Operation messages
interface OperationMessage {
  operation: EncryptedOperation;
}

interface OperationAckMessage {
  operationId: OperationId;
  serverTimestamp: number;
}

// Sync messages
interface SyncRequestMessage {
  fromTimestamp: number;
}

interface SyncResponseMessage {
  operations: EncryptedOperation[];
  currentState: Buffer; // Encrypted CRDT state
}

// Error messages
interface ErrorMessage {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

type ErrorCode =
  | 'AUTH_FAILED'
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_EXPIRED'
  | 'INVALID_OPERATION'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PARTICIPANT_REVOKED';
```


### 2. Crypto Package (`eecp-crypto`)

Handles all cryptographic operations including temporal key management, encryption, and commitments.

#### Temporal Key Derivation

```typescript
interface ITemporalKeyDerivation {
  /**
   * Derive a temporal key for a specific time window
   * Uses HKDF with workspace secret and time window as inputs
   */
  deriveKey(
    workspaceSecret: Buffer,
    timeWindow: TimeWindow,
    keyId: string
  ): Promise<TemporalKey>;
  
  /**
   * Get the current key ID for a given timestamp
   */
  getCurrentKeyId(
    createdAt: number,
    timestamp: number,
    rotationInterval: number
  ): string;
  
  /**
   * Check if a key is still valid (within grace period)
   */
  isKeyValid(
    keyId: string,
    currentTime: number,
    rotationInterval: number,
    gracePeriod: number
  ): boolean;
}

interface TemporalKey {
  id: string;
  key: Buffer; // 32 bytes for AES-256
  validFrom: number;
  validUntil: number;
  gracePeriodEnd: number;
}

class TemporalKeyDerivation implements ITemporalKeyDerivation {
  private readonly HKDF_INFO = 'EECP-Temporal-Key-v1';
  
  async deriveKey(
    workspaceSecret: Buffer,
    timeWindow: TimeWindow,
    keyId: string
  ): Promise<TemporalKey> {
    // Use HKDF to derive key from workspace secret + time window
    // Salt: keyId + timeWindow.startTime
    // Info: HKDF_INFO constant
    // Output: 32 bytes for AES-256-GCM
  }
  
  getCurrentKeyId(
    createdAt: number,
    timestamp: number,
    rotationInterval: number
  ): string {
    // Calculate which rotation period we're in
    // Return keyId = `key-${rotationNumber}`
  }
  
  isKeyValid(
    keyId: string,
    currentTime: number,
    rotationInterval: number,
    gracePeriod: number
  ): boolean {
    // Check if key is current or within grace period
  }
}
```

#### Time-Locked Encryption

```typescript
interface ITimeLockedEncryption {
  /**
   * Encrypt content with temporal key
   * Uses AES-256-GCM for authenticated encryption
   */
  encrypt(
    content: Buffer,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<EncryptedPayload>;
  
  /**
   * Decrypt content with temporal key
   */
  decrypt(
    encrypted: EncryptedPayload,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<Buffer>;
  
  /**
   * Securely destroy a key from memory
   */
  destroyKey(key: TemporalKey): void;
}

interface EncryptedPayload {
  ciphertext: Buffer;
  nonce: Buffer; // 12 bytes for GCM
  authTag: Buffer; // 16 bytes for GCM
  keyId: string;
}

class TimeLockedEncryption implements ITimeLockedEncryption {
  async encrypt(
    content: Buffer,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<EncryptedPayload> {
    // Use AES-256-GCM with temporal key
    // Generate random nonce
    // Include keyId in additional authenticated data
  }
  
  async decrypt(
    encrypted: EncryptedPayload,
    temporalKey: TemporalKey,
    additionalData?: Buffer
  ): Promise<Buffer> {
    // Verify keyId matches
    // Decrypt using AES-256-GCM
    // Verify auth tag
  }
  
  destroyKey(key: TemporalKey): void {
    // Overwrite key buffer with random data
    // Zero out the buffer
    // Delete from any caches
  }
}
```


#### Commitment Scheme

```typescript
interface ICommitmentScheme {
  /**
   * Create a commitment to a key before deletion
   */
  createCommitment(key: TemporalKey): Commitment;
  
  /**
   * Verify a commitment matches the claimed key properties
   */
  verifyCommitment(
    commitment: Commitment,
    keyId: string,
    validFrom: number,
    validUntil: number
  ): boolean;
  
  /**
   * Publish commitment to verifiable log
   */
  publishCommitment(commitment: Commitment): Promise<void>;
}

interface Commitment {
  keyId: string;
  hash: Buffer; // SHA-256 of key + metadata
  timestamp: number;
  validFrom: number;
  validUntil: number;
}

class CommitmentScheme implements ICommitmentScheme {
  createCommitment(key: TemporalKey): Commitment {
    // Hash: SHA-256(key || keyId || validFrom || validUntil)
    // Include timestamp of commitment creation
  }
  
  verifyCommitment(
    commitment: Commitment,
    keyId: string,
    validFrom: number,
    validUntil: number
  ): boolean {
    // Verify keyId, validFrom, validUntil match
    // Cannot verify key itself (it's deleted)
    // Proves key existed with these properties
  }
  
  async publishCommitment(commitment: Commitment): Promise<void> {
    // Store in append-only log
    // Could use blockchain, but simpler: signed log file
  }
}
```

#### Participant Authentication

```typescript
interface IParticipantAuth {
  /**
   * Generate zero-knowledge proof for authentication
   */
  generateProof(
    participantId: ParticipantId,
    privateKey: Buffer,
    challenge: Buffer
  ): ZeroKnowledgeProof;
  
  /**
   * Verify zero-knowledge proof without learning identity
   */
  verifyProof(
    proof: ZeroKnowledgeProof,
    publicKey: Buffer,
    challenge: Buffer
  ): boolean;
  
  /**
   * Generate challenge for authentication
   */
  generateChallenge(): Buffer;
}

interface ZeroKnowledgeProof {
  signature: Buffer; // ECDSA signature of challenge
  timestamp: number;
}

class ParticipantAuth implements IParticipantAuth {
  generateProof(
    participantId: ParticipantId,
    privateKey: Buffer,
    challenge: Buffer
  ): ZeroKnowledgeProof {
    // Sign challenge with participant's private key
    // Include timestamp to prevent replay attacks
  }
  
  verifyProof(
    proof: ZeroKnowledgeProof,
    publicKey: Buffer,
    challenge: Buffer
  ): boolean {
    // Verify signature using public key
    // Check timestamp is recent (within 60 seconds)
    // Server learns nothing about participant identity
  }
  
  generateChallenge(): Buffer {
    // Generate 32 random bytes
  }
}
```

#### Multi-Recipient Encryption

We use `@digitaldefiance/ecies-lib` for multi-recipient encryption, which provides battle-tested implementations of ECIES encryption with support for multiple recipients.

**Benefits of using ecies-lib:**
- Production-ready multi-recipient ECIES encryption
- Secure key management with `SecureBuffer` and `SecureString` classes
- Built-in `Member` class for participant representation with signing/verification
- Proper key disposal and memory management
- Stream encryption support for large data
- Comprehensive error handling and validation
- Well-tested cryptographic primitives

```typescript
import { EciesMultiRecipient, Member, ECIESService, MemberType, EmailString, SecureBuffer } from '@digitaldefiance/ecies-lib';
import type { IMultiEncryptedMessage, IMultiRecipient } from '@digitaldefiance/ecies-lib';

/**
 * Wrapper for multi-recipient encryption using ecies-lib
 * Encrypts temporal keys for multiple participants
 */
interface IMultiRecipientEncryption {
  /**
   * Encrypt temporal key for multiple recipients using ECIES
   * Uses EciesMultiRecipient from @digitaldefiance/ecies-lib
   */
  encryptForRecipients(
    temporalKey: Uint8Array,
    recipients: Member[]
  ): Promise<IMultiEncryptedMessage>;
  
  /**
   * Decrypt temporal key for a specific recipient
   * Uses EciesMultiRecipient from @digitaldefiance/ecies-lib
   */
  decryptForRecipient(
    encryptedMessage: IMultiEncryptedMessage,
    recipient: Member
  ): Promise<Uint8Array>;
}

class MultiRecipientEncryption implements IMultiRecipientEncryption {
  private eciesMultiRecipient: EciesMultiRecipient;
  
  constructor(eciesService: ECIESService) {
    this.eciesMultiRecipient = new EciesMultiRecipient(eciesService.config);
  }
  
  async encryptForRecipients(
    temporalKey: Uint8Array,
    recipients: Member[]
  ): Promise<IMultiEncryptedMessage> {
    // Convert Members to IMultiRecipient format
    const multiRecipients = recipients.map(member => ({
      id: member.id,
      publicKey: member.publicKey
    }));
    
    // Use ecies-lib's multi-recipient encryption
    return await this.eciesMultiRecipient.encryptMultiple(
      multiRecipients,
      temporalKey
    );
  }
  
  async decryptForRecipient(
    encryptedMessage: IMultiEncryptedMessage,
    recipient: Member
  ): Promise<Uint8Array> {
    if (!recipient.hasPrivateKey) {
      throw new Error('Recipient must have private key loaded');
    }
    
    // Use ecies-lib's multi-recipient decryption
    return await this.eciesMultiRecipient.decryptMultipleForRecipient(
      encryptedMessage,
      recipient.id,
      recipient.privateKey!.data
    );
  }
}

/**
 * Participant representation using Member class from ecies-lib
 * Provides key management, signing, and encryption capabilities
 */
class Participant {
  private member: Member;
  
  constructor(
    private eciesService: ECIESService,
    participantId: ParticipantId,
    name: string,
    email: string
  ) {
    // Create a new Member with generated keys
    const memberWithMnemonic = Member.newMember(
      eciesService,
      MemberType.User,
      name,
      new EmailString(email)
    );
    
    this.member = memberWithMnemonic.member;
  }
  
  /**
   * Load existing member from keys
   */
  static fromKeys(
    eciesService: ECIESService,
    participantId: Uint8Array,
    publicKey: Uint8Array,
    privateKey?: SecureBuffer
  ): Participant {
    const member = new Member(
      eciesService,
      MemberType.User,
      'Participant',
      new EmailString('participant@eecp.local'),
      publicKey,
      privateKey,
      undefined,
      participantId
    );
    
    const participant = Object.create(Participant.prototype);
    participant.member = member;
    participant.eciesService = eciesService;
    return participant;
  }
  
  get id(): Uint8Array {
    return this.member.id;
  }
  
  get publicKey(): Uint8Array {
    return this.member.publicKey;
  }
  
  get hasPrivateKey(): boolean {
    return this.member.hasPrivateKey;
  }
  
  /**
   * Sign data using member's private key
   */
  sign(data: Uint8Array): Uint8Array {
    return this.member.sign(data);
  }
  
  /**
   * Verify signature
   */
  verify(signature: Uint8Array, data: Uint8Array): boolean {
    return this.member.verify(signature, data);
  }
  
  /**
   * Encrypt data for a specific recipient
   */
  async encryptFor(data: Uint8Array, recipientPublicKey: Uint8Array): Promise<Uint8Array> {
    return await this.member.encryptData(data, recipientPublicKey);
  }
  
  /**
   * Decrypt data encrypted for this participant
   */
  async decrypt(encryptedData: Uint8Array): Promise<Uint8Array> {
    return await this.member.decryptData(encryptedData);
  }
  
  /**
   * Securely dispose of keys
   */
  dispose(): void {
    this.member.dispose();
  }
}
```


### 3. CRDT Package (`eecp-crdt`)

Implements encrypted conflict-free replicated data types for collaborative editing.

#### Encrypted Text CRDT

```typescript
interface IEncryptedTextCRDT {
  /**
   * Insert text at position
   */
  insert(
    position: number,
    text: string,
    participantId: ParticipantId
  ): CRDTOperation;
  
  /**
   * Delete text at position
   */
  delete(
    position: number,
    length: number,
    participantId: ParticipantId
  ): CRDTOperation;
  
  /**
   * Apply operation from another participant
   */
  applyOperation(operation: CRDTOperation): void;
  
  /**
   * Get current document text
   */
  getText(): string;
  
  /**
   * Get document state for sync
   */
  getState(): Uint8Array;
  
  /**
   * Apply state from sync
   */
  applyState(state: Uint8Array): void;
}

interface CRDTOperation {
  id: OperationId;
  participantId: ParticipantId;
  timestamp: number;
  type: 'insert' | 'delete';
  position: number;
  content?: string; // For insert operations
  length?: number; // For delete operations
}

class EncryptedTextCRDT implements IEncryptedTextCRDT {
  private doc: Y.Doc; // Yjs document
  private text: Y.Text; // Yjs text type
  
  constructor() {
    this.doc = new Y.Doc();
    this.text = this.doc.getText('content');
  }
  
  insert(
    position: number,
    text: string,
    participantId: ParticipantId
  ): CRDTOperation {
    // Insert into Yjs document
    this.text.insert(position, text);
    
    // Return operation for encryption and broadcast
    return {
      id: generateOperationId(),
      participantId,
      timestamp: Date.now(),
      type: 'insert',
      position,
      content: text
    };
  }
  
  delete(
    position: number,
    length: number,
    participantId: ParticipantId
  ): CRDTOperation {
    // Delete from Yjs document
    this.text.delete(position, length);
    
    // Return operation for encryption and broadcast
    return {
      id: generateOperationId(),
      participantId,
      timestamp: Date.now(),
      type: 'delete',
      position,
      length
    };
  }
  
  applyOperation(operation: CRDTOperation): void {
    // Apply operation to Yjs document
    if (operation.type === 'insert') {
      this.text.insert(operation.position, operation.content!);
    } else {
      this.text.delete(operation.position, operation.length!);
    }
  }
  
  getText(): string {
    return this.text.toString();
  }
  
  getState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }
  
  applyState(state: Uint8Array): void {
    Y.applyUpdate(this.doc, state);
  }
}
```

#### Operation Encryptor

```typescript
interface IOperationEncryptor {
  /**
   * Encrypt a CRDT operation
   */
  encryptOperation(
    operation: CRDTOperation,
    temporalKey: TemporalKey,
    participantPrivateKey: Buffer
  ): Promise<EncryptedOperation>;
  
  /**
   * Decrypt a CRDT operation
   */
  decryptOperation(
    encrypted: EncryptedOperation,
    temporalKey: TemporalKey
  ): Promise<CRDTOperation>;
}

class OperationEncryptor implements IOperationEncryptor {
  constructor(
    private encryption: ITimeLockedEncryption,
    private auth: IParticipantAuth
  ) {}
  
  async encryptOperation(
    operation: CRDTOperation,
    temporalKey: TemporalKey,
    participantPrivateKey: Buffer
  ): Promise<EncryptedOperation> {
    // Serialize operation content
    const content = JSON.stringify({
      content: operation.content,
      length: operation.length
    });
    
    // Encrypt content with temporal key
    const encrypted = await this.encryption.encrypt(
      Buffer.from(content),
      temporalKey
    );
    
    // Sign the operation
    const signature = await this.signOperation(
      operation,
      encrypted,
      participantPrivateKey
    );
    
    return {
      id: operation.id,
      workspaceId: '', // Set by caller
      participantId: operation.participantId,
      timestamp: operation.timestamp,
      position: operation.position,
      operationType: operation.type,
      encryptedContent: encrypted.ciphertext,
      signature
    };
  }
  
  async decryptOperation(
    encrypted: EncryptedOperation,
    temporalKey: TemporalKey
  ): Promise<CRDTOperation> {
    // Decrypt content
    const decrypted = await this.encryption.decrypt(
      {
        ciphertext: encrypted.encryptedContent,
        nonce: Buffer.alloc(12), // Extract from encrypted
        authTag: Buffer.alloc(16), // Extract from encrypted
        keyId: temporalKey.id
      },
      temporalKey
    );
    
    // Parse operation content
    const content = JSON.parse(decrypted.toString());
    
    return {
      id: encrypted.id,
      participantId: encrypted.participantId,
      timestamp: encrypted.timestamp,
      type: encrypted.operationType,
      position: encrypted.position,
      content: content.content,
      length: content.length
    };
  }
  
  private async signOperation(
    operation: CRDTOperation,
    encrypted: EncryptedPayload,
    privateKey: Buffer
  ): Promise<Buffer> {
    // Sign: operationId + timestamp + position + ciphertext
    // Prevents tampering with operation metadata
  }
}
```


#### CRDT Sync Engine

```typescript
interface ICRDTSyncEngine {
  /**
   * Merge operations from multiple participants
   */
  mergeOperations(operations: CRDTOperation[]): void;
  
  /**
   * Resolve conflicts deterministically
   */
  resolveConflicts(
    op1: CRDTOperation,
    op2: CRDTOperation
  ): CRDTOperation[];
  
  /**
   * Get operations since timestamp
   */
  getOperationsSince(timestamp: number): CRDTOperation[];
}

class CRDTSyncEngine implements ICRDTSyncEngine {
  private operations: Map<OperationId, CRDTOperation> = new Map();
  
  mergeOperations(operations: CRDTOperation[]): void {
    // Sort operations by timestamp
    const sorted = operations.sort((a, b) => a.timestamp - b.timestamp);
    
    // Apply operations in order
    for (const op of sorted) {
      if (!this.operations.has(op.id)) {
        this.operations.set(op.id, op);
        // Apply to CRDT
      }
    }
  }
  
  resolveConflicts(
    op1: CRDTOperation,
    op2: CRDTOperation
  ): CRDTOperation[] {
    // Yjs handles conflict resolution automatically
    // Operations are commutative and associative
    // Return both operations in timestamp order
    return [op1, op2].sort((a, b) => a.timestamp - b.timestamp);
  }
  
  getOperationsSince(timestamp: number): CRDTOperation[] {
    return Array.from(this.operations.values())
      .filter(op => op.timestamp > timestamp)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}
```

#### Temporal Garbage Collector

```typescript
interface ITemporalGarbageCollector {
  /**
   * Remove expired operations
   */
  collectExpiredOperations(
    operations: CRDTOperation[],
    expirationTime: number
  ): CRDTOperation[];
  
  /**
   * Check if operation is expired
   */
  isOperationExpired(
    operation: CRDTOperation,
    expirationTime: number
  ): boolean;
}

class TemporalGarbageCollector implements ITemporalGarbageCollector {
  collectExpiredOperations(
    operations: CRDTOperation[],
    expirationTime: number
  ): CRDTOperation[] {
    return operations.filter(op => !this.isOperationExpired(op, expirationTime));
  }
  
  isOperationExpired(
    operation: CRDTOperation,
    expirationTime: number
  ): boolean {
    return operation.timestamp < expirationTime;
  }
}
```


### 4. Server Package (`eecp-server`)

Express-based server with WebSocket support for routing encrypted operations.

#### Workspace Manager

```typescript
interface IWorkspaceManager {
  /**
   * Create a new workspace
   */
  createWorkspace(
    config: WorkspaceConfig,
    creatorPublicKey: Buffer
  ): Promise<Workspace>;
  
  /**
   * Get workspace by ID
   */
  getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null>;
  
  /**
   * Extend workspace expiration
   */
  extendWorkspace(
    workspaceId: WorkspaceId,
    additionalMinutes: number
  ): Promise<void>;
  
  /**
   * Revoke workspace early
   */
  revokeWorkspace(workspaceId: WorkspaceId): Promise<void>;
  
  /**
   * Check if workspace is expired
   */
  isWorkspaceExpired(workspace: Workspace): boolean;
}

interface Workspace {
  id: WorkspaceId;
  config: WorkspaceConfig;
  encryptedMetadata: Buffer;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'revoked';
}

class WorkspaceManager implements IWorkspaceManager {
  private workspaces: Map<WorkspaceId, Workspace> = new Map();
  
  async createWorkspace(
    config: WorkspaceConfig,
    creatorPublicKey: Buffer
  ): Promise<Workspace> {
    const workspace: Workspace = {
      id: config.id,
      config,
      encryptedMetadata: Buffer.alloc(0), // Set by caller
      createdAt: config.createdAt,
      expiresAt: config.expiresAt,
      status: 'active'
    };
    
    this.workspaces.set(workspace.id, workspace);
    
    // Schedule expiration
    this.scheduleExpiration(workspace);
    
    return workspace;
  }
  
  async getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
    return this.workspaces.get(workspaceId) || null;
  }
  
  async extendWorkspace(
    workspaceId: WorkspaceId,
    additionalMinutes: number
  ): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('Workspace not found');
    
    workspace.expiresAt += additionalMinutes * 60 * 1000;
    workspace.config.expiresAt = workspace.expiresAt;
    
    // Reschedule expiration
    this.scheduleExpiration(workspace);
  }
  
  async revokeWorkspace(workspaceId: WorkspaceId): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('Workspace not found');
    
    workspace.status = 'revoked';
    workspace.expiresAt = Date.now();
    
    // Trigger immediate cleanup
    await this.expireWorkspace(workspace);
  }
  
  isWorkspaceExpired(workspace: Workspace): boolean {
    return workspace.expiresAt <= Date.now() || workspace.status !== 'active';
  }
  
  private scheduleExpiration(workspace: Workspace): void {
    const delay = workspace.expiresAt - Date.now();
    setTimeout(() => this.expireWorkspace(workspace), delay);
  }
  
  private async expireWorkspace(workspace: Workspace): Promise<void> {
    workspace.status = 'expired';
    
    // Notify cleanup service
    // Close all participant connections
    // Delete from memory after grace period
  }
}
```

#### Participant Manager

```typescript
interface IParticipantManager {
  /**
   * Authenticate and register participant
   */
  authenticateParticipant(
    workspaceId: WorkspaceId,
    handshake: HandshakeMessage
  ): Promise<ParticipantSession>;
  
  /**
   * Get participant session
   */
  getSession(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): ParticipantSession | null;
  
  /**
   * Remove participant
   */
  removeParticipant(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): void;
  
  /**
   * Get all participants in workspace
   */
  getWorkspaceParticipants(
    workspaceId: WorkspaceId
  ): ParticipantSession[];
}

interface ParticipantSession {
  participantId: ParticipantId;
  workspaceId: WorkspaceId;
  publicKey: Buffer;
  connectedAt: number;
  lastActivity: number;
  websocket: WebSocket;
}

class ParticipantManager implements IParticipantManager {
  private sessions: Map<string, ParticipantSession> = new Map();
  
  constructor(private auth: IParticipantAuth) {}
  
  async authenticateParticipant(
    workspaceId: WorkspaceId,
    handshake: HandshakeMessage
  ): Promise<ParticipantSession> {
    // Generate challenge
    const challenge = this.auth.generateChallenge();
    
    // Verify proof
    const valid = this.auth.verifyProof(
      handshake.proof,
      handshake.publicKey,
      challenge
    );
    
    if (!valid) {
      throw new Error('Authentication failed');
    }
    
    // Create session
    const session: ParticipantSession = {
      participantId: handshake.participantId,
      workspaceId,
      publicKey: handshake.publicKey,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      websocket: null as any // Set by caller
    };
    
    const key = `${workspaceId}:${handshake.participantId}`;
    this.sessions.set(key, session);
    
    return session;
  }
  
  getSession(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): ParticipantSession | null {
    const key = `${workspaceId}:${participantId}`;
    return this.sessions.get(key) || null;
  }
  
  removeParticipant(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): void {
    const key = `${workspaceId}:${participantId}`;
    const session = this.sessions.get(key);
    
    if (session) {
      session.websocket.close();
      this.sessions.delete(key);
    }
  }
  
  getWorkspaceParticipants(
    workspaceId: WorkspaceId
  ): ParticipantSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.workspaceId === workspaceId);
  }
}
```


#### Operation Router

```typescript
interface IOperationRouter {
  /**
   * Route operation to all workspace participants
   */
  routeOperation(
    workspaceId: WorkspaceId,
    operation: EncryptedOperation,
    senderParticipantId: ParticipantId
  ): Promise<void>;
  
  /**
   * Buffer operation for offline participants
   */
  bufferOperation(
    workspaceId: WorkspaceId,
    participantId: ParticipantId,
    operation: EncryptedOperation
  ): void;
  
  /**
   * Get buffered operations for participant
   */
  getBufferedOperations(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): EncryptedOperation[];
  
  /**
   * Clear expired buffered operations
   */
  clearExpiredBuffers(expirationTime: number): void;
}

class OperationRouter implements IOperationRouter {
  private buffers: Map<string, EncryptedOperation[]> = new Map();
  
  constructor(
    private participantManager: IParticipantManager,
    private workspaceManager: IWorkspaceManager
  ) {}
  
  async routeOperation(
    workspaceId: WorkspaceId,
    operation: EncryptedOperation,
    senderParticipantId: ParticipantId
  ): Promise<void> {
    // Validate workspace is active
    const workspace = await this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace || this.workspaceManager.isWorkspaceExpired(workspace)) {
      throw new Error('Workspace expired or not found');
    }
    
    // Get all participants
    const participants = this.participantManager.getWorkspaceParticipants(workspaceId);
    
    // Broadcast to all except sender
    const message: OperationMessage = { operation };
    const envelope: MessageEnvelope = {
      type: 'operation',
      payload: message,
      timestamp: Date.now(),
      messageId: generateMessageId()
    };
    
    for (const participant of participants) {
      if (participant.participantId === senderParticipantId) continue;
      
      try {
        participant.websocket.send(JSON.stringify(envelope));
      } catch (error) {
        // Participant offline, buffer operation
        this.bufferOperation(workspaceId, participant.participantId, operation);
      }
    }
  }
  
  bufferOperation(
    workspaceId: WorkspaceId,
    participantId: ParticipantId,
    operation: EncryptedOperation
  ): void {
    const key = `${workspaceId}:${participantId}`;
    const buffer = this.buffers.get(key) || [];
    buffer.push(operation);
    this.buffers.set(key, buffer);
  }
  
  getBufferedOperations(
    workspaceId: WorkspaceId,
    participantId: ParticipantId
  ): EncryptedOperation[] {
    const key = `${workspaceId}:${participantId}`;
    const buffer = this.buffers.get(key) || [];
    this.buffers.delete(key);
    return buffer;
  }
  
  clearExpiredBuffers(expirationTime: number): void {
    for (const [key, operations] of this.buffers.entries()) {
      const filtered = operations.filter(op => op.timestamp > expirationTime);
      if (filtered.length === 0) {
        this.buffers.delete(key);
      } else {
        this.buffers.set(key, filtered);
      }
    }
  }
}
```

#### Temporal Cleanup Service

```typescript
interface ITemporalCleanupService {
  /**
   * Start cleanup service
   */
  start(): void;
  
  /**
   * Stop cleanup service
   */
  stop(): void;
  
  /**
   * Run cleanup cycle
   */
  runCleanup(): Promise<void>;
}

class TemporalCleanupService implements ITemporalCleanupService {
  private intervalId?: NodeJS.Timeout;
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 60 seconds
  
  constructor(
    private workspaceManager: IWorkspaceManager,
    private operationRouter: IOperationRouter,
    private commitmentScheme: ICommitmentScheme
  ) {}
  
  start(): void {
    this.intervalId = setInterval(
      () => this.runCleanup(),
      this.CLEANUP_INTERVAL
    );
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
  
  async runCleanup(): Promise<void> {
    const now = Date.now();
    
    // Find expired workspaces
    // Delete keys and publish commitments
    // Clear buffered operations
    // Remove workspace from memory
    
    this.operationRouter.clearExpiredBuffers(now);
  }
}
```

#### Express Server

```typescript
class EECPServer {
  private app: Express;
  private wss: WebSocketServer;
  
  constructor(
    private workspaceManager: IWorkspaceManager,
    private participantManager: IParticipantManager,
    private operationRouter: IOperationRouter,
    private cleanupService: ITemporalCleanupService
  ) {
    this.app = express();
    this.setupRoutes();
    this.setupWebSocket();
  }
  
  private setupRoutes(): void {
    // POST /workspaces - Create workspace
    this.app.post('/workspaces', async (req, res) => {
      // Create workspace
      // Return workspace ID and encrypted metadata
    });
    
    // GET /workspaces/:id - Get workspace info
    this.app.get('/workspaces/:id', async (req, res) => {
      // Return encrypted workspace metadata
    });
    
    // POST /workspaces/:id/extend - Extend workspace
    this.app.post('/workspaces/:id/extend', async (req, res) => {
      // Extend workspace expiration
    });
    
    // DELETE /workspaces/:id - Revoke workspace
    this.app.delete('/workspaces/:id', async (req, res) => {
      // Revoke workspace early
    });
    
    // GET /health - Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
  }
  
  private setupWebSocket(): void {
    this.wss = new WebSocketServer({ noServer: true });
    
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
  }
  
  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    // Wait for handshake
    // Authenticate participant
    // Register session
    // Send handshake ack
    // Handle messages
  }
  
  start(port: number): void {
    this.cleanupService.start();
    this.app.listen(port);
  }
}
```


### 5. Client Package (`eecp-client`)

Browser and Node.js client library for connecting to EECP workspaces.

#### EECP Client

```typescript
interface IEECPClient {
  /**
   * Connect to server
   */
  connect(serverUrl: string): Promise<void>;
  
  /**
   * Disconnect from server
   */
  disconnect(): void;
  
  /**
   * Create workspace
   */
  createWorkspace(config: WorkspaceConfig): Promise<WorkspaceClient>;
  
  /**
   * Join workspace
   */
  joinWorkspace(
    workspaceId: WorkspaceId,
    temporalKey: Buffer
  ): Promise<WorkspaceClient>;
}

class EECPClient implements IEECPClient {
  private ws?: WebSocket;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  
  async connect(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(serverUrl);
      
      this.ws.on('open', () => {
        this.reconnectAttempts = 0;
        resolve();
      });
      
      this.ws.on('error', (error) => {
        reject(error);
      });
      
      this.ws.on('close', () => {
        this.handleDisconnect();
      });
    });
  }
  
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }
  
  async createWorkspace(config: WorkspaceConfig): Promise<WorkspaceClient> {
    // Generate workspace keypair
    // Create workspace via REST API
    // Return WorkspaceClient instance
  }
  
  async joinWorkspace(
    workspaceId: WorkspaceId,
    temporalKey: Buffer
  ): Promise<WorkspaceClient> {
    // Fetch workspace metadata
    // Authenticate via WebSocket
    // Return WorkspaceClient instance
  }
  
  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      setTimeout(() => this.reconnect(), delay);
      this.reconnectAttempts++;
    }
  }
  
  private async reconnect(): Promise<void> {
    // Attempt to reconnect
    // Restore sessions
  }
}
```

#### Workspace Client

```typescript
interface IWorkspaceClient {
  /**
   * Get collaborative editor
   */
  getEditor(): CollaborativeEditor;
  
  /**
   * Get workspace metadata
   */
  getMetadata(): WorkspaceMetadata;
  
  /**
   * Get participants
   */
  getParticipants(): ParticipantInfo[];
  
  /**
   * Leave workspace
   */
  leave(): Promise<void>;
  
  /**
   * Export document
   */
  exportDocument(): string;
}

class WorkspaceClient implements IWorkspaceClient {
  private editor: CollaborativeEditor;
  private metadata: WorkspaceMetadata;
  
  constructor(
    private workspaceId: WorkspaceId,
    private participantId: ParticipantId,
    private ws: WebSocket,
    private keyManager: ClientKeyManager
  ) {
    this.editor = new CollaborativeEditor(
      workspaceId,
      participantId,
      ws,
      keyManager
    );
  }
  
  getEditor(): CollaborativeEditor {
    return this.editor;
  }
  
  getMetadata(): WorkspaceMetadata {
    return this.metadata;
  }
  
  getParticipants(): ParticipantInfo[] {
    return this.metadata.participants;
  }
  
  async leave(): Promise<void> {
    this.ws.close();
    await this.keyManager.deleteWorkspaceKeys(this.workspaceId);
  }
  
  exportDocument(): string {
    return this.editor.getText();
  }
}
```

#### Collaborative Editor

```typescript
interface ICollaborativeEditor {
  /**
   * Insert text at position
   */
  insert(position: number, text: string): void;
  
  /**
   * Delete text at position
   */
  delete(position: number, length: number): void;
  
  /**
   * Get current text
   */
  getText(): string;
  
  /**
   * Subscribe to changes
   */
  onChange(callback: (text: string) => void): () => void;
}

class CollaborativeEditor implements ICollaborativeEditor {
  private crdt: IEncryptedTextCRDT;
  private encryptor: IOperationEncryptor;
  private changeListeners: Set<(text: string) => void> = new Set();
  
  constructor(
    private workspaceId: WorkspaceId,
    private participantId: ParticipantId,
    private ws: WebSocket,
    private keyManager: ClientKeyManager
  ) {
    this.crdt = new EncryptedTextCRDT();
    this.encryptor = new OperationEncryptor(
      new TimeLockedEncryption(),
      new ParticipantAuth()
    );
    
    this.setupMessageHandler();
  }
  
  insert(position: number, text: string): void {
    // Create CRDT operation
    const operation = this.crdt.insert(position, text, this.participantId);
    
    // Encrypt and send
    this.sendOperation(operation);
    
    // Notify listeners
    this.notifyChange();
  }
  
  delete(position: number, length: number): void {
    // Create CRDT operation
    const operation = this.crdt.delete(position, length, this.participantId);
    
    // Encrypt and send
    this.sendOperation(operation);
    
    // Notify listeners
    this.notifyChange();
  }
  
  getText(): string {
    return this.crdt.getText();
  }
  
  onChange(callback: (text: string) => void): () => void {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }
  
  private async sendOperation(operation: CRDTOperation): Promise<void> {
    // Get current temporal key
    const temporalKey = await this.keyManager.getCurrentKey(this.workspaceId);
    
    // Get participant private key
    const privateKey = await this.keyManager.getParticipantKey(this.participantId);
    
    // Encrypt operation
    const encrypted = await this.encryptor.encryptOperation(
      operation,
      temporalKey,
      privateKey
    );
    
    // Send via WebSocket
    const message: OperationMessage = { operation: encrypted };
    const envelope: MessageEnvelope = {
      type: 'operation',
      payload: message,
      timestamp: Date.now(),
      messageId: generateMessageId()
    };
    
    this.ws.send(JSON.stringify(envelope));
  }
  
  private setupMessageHandler(): void {
    this.ws.on('message', async (data) => {
      const envelope: MessageEnvelope = JSON.parse(data.toString());
      
      if (envelope.type === 'operation') {
        await this.handleOperation(envelope.payload as OperationMessage);
      }
    });
  }
  
  private async handleOperation(message: OperationMessage): Promise<void> {
    // Get temporal key
    const temporalKey = await this.keyManager.getKeyById(
      this.workspaceId,
      message.operation.encryptedContent.toString() // Extract keyId
    );
    
    // Decrypt operation
    const operation = await this.encryptor.decryptOperation(
      message.operation,
      temporalKey
    );
    
    // Apply to CRDT
    this.crdt.applyOperation(operation);
    
    // Notify listeners
    this.notifyChange();
  }
  
  private notifyChange(): void {
    const text = this.getText();
    for (const listener of this.changeListeners) {
      listener(text);
    }
  }
}
```


#### Client Key Manager

```typescript
interface IClientKeyManager {
  /**
   * Store temporal key
   */
  storeKey(
    workspaceId: WorkspaceId,
    key: TemporalKey
  ): Promise<void>;
  
  /**
   * Get current temporal key
   */
  getCurrentKey(workspaceId: WorkspaceId): Promise<TemporalKey>;
  
  /**
   * Get key by ID
   */
  getKeyById(
    workspaceId: WorkspaceId,
    keyId: string
  ): Promise<TemporalKey>;
  
  /**
   * Delete workspace keys
   */
  deleteWorkspaceKeys(workspaceId: WorkspaceId): Promise<void>;
  
  /**
   * Store participant keypair
   */
  storeParticipantKey(
    participantId: ParticipantId,
    privateKey: Buffer,
    publicKey: Buffer
  ): Promise<void>;
  
  /**
   * Get participant private key
   */
  getParticipantKey(participantId: ParticipantId): Promise<Buffer>;
}

class ClientKeyManager implements IClientKeyManager {
  private db?: IDBDatabase;
  private readonly DB_NAME = 'eecp-keys';
  private readonly KEYS_STORE = 'temporal-keys';
  private readonly PARTICIPANT_STORE = 'participant-keys';
  
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.KEYS_STORE)) {
          db.createObjectStore(this.KEYS_STORE, { keyPath: ['workspaceId', 'keyId'] });
        }
        
        if (!db.objectStoreNames.contains(this.PARTICIPANT_STORE)) {
          db.createObjectStore(this.PARTICIPANT_STORE, { keyPath: 'participantId' });
        }
      };
    });
  }
  
  async storeKey(
    workspaceId: WorkspaceId,
    key: TemporalKey
  ): Promise<void> {
    const transaction = this.db!.transaction([this.KEYS_STORE], 'readwrite');
    const store = transaction.objectStore(this.KEYS_STORE);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ workspaceId, ...key });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getCurrentKey(workspaceId: WorkspaceId): Promise<TemporalKey> {
    // Get all keys for workspace
    // Return most recent valid key
  }
  
  async getKeyById(
    workspaceId: WorkspaceId,
    keyId: string
  ): Promise<TemporalKey> {
    const transaction = this.db!.transaction([this.KEYS_STORE], 'readonly');
    const store = transaction.objectStore(this.KEYS_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.get([workspaceId, keyId]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async deleteWorkspaceKeys(workspaceId: WorkspaceId): Promise<void> {
    // Delete all keys for workspace
  }
  
  async storeParticipantKey(
    participantId: ParticipantId,
    privateKey: Buffer,
    publicKey: Buffer
  ): Promise<void> {
    const transaction = this.db!.transaction([this.PARTICIPANT_STORE], 'readwrite');
    const store = transaction.objectStore(this.PARTICIPANT_STORE);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ participantId, privateKey, publicKey });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async getParticipantKey(participantId: ParticipantId): Promise<Buffer> {
    const transaction = this.db!.transaction([this.PARTICIPANT_STORE], 'readonly');
    const store = transaction.objectStore(this.PARTICIPANT_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.get(participantId);
      request.onsuccess = () => resolve(request.result.privateKey);
      request.onerror = () => reject(request.error);
    });
  }
}
```

#### React Hooks

```typescript
/**
 * Hook for workspace management
 */
function useWorkspace(workspaceId: WorkspaceId | null) {
  const [workspace, setWorkspace] = useState<WorkspaceClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    if (!workspaceId) return;
    
    const client = new EECPClient();
    
    async function join() {
      setLoading(true);
      try {
        await client.connect('ws://localhost:3000');
        const ws = await client.joinWorkspace(workspaceId!, Buffer.alloc(32));
        setWorkspace(ws);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    
    join();
    
    return () => {
      workspace?.leave();
    };
  }, [workspaceId]);
  
  return { workspace, loading, error };
}

/**
 * Hook for collaborative editing
 */
function useCollaboration(workspace: WorkspaceClient | null) {
  const [text, setText] = useState('');
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  
  useEffect(() => {
    if (!workspace) return;
    
    const editor = workspace.getEditor();
    
    // Subscribe to changes
    const unsubscribe = editor.onChange((newText) => {
      setText(newText);
    });
    
    // Update participants
    setParticipants(workspace.getParticipants());
    
    return unsubscribe;
  }, [workspace]);
  
  const insert = useCallback((position: number, text: string) => {
    workspace?.getEditor().insert(position, text);
  }, [workspace]);
  
  const deleteText = useCallback((position: number, length: number) => {
    workspace?.getEditor().delete(position, length);
  }, [workspace]);
  
  return { text, participants, insert, deleteText };
}
```


### 6. CLI Package (`eecp-cli`)

Command-line interface for workspace management and testing.

#### CLI Commands

```typescript
interface ICLICommands {
  /**
   * Create workspace
   */
  create(options: CreateOptions): Promise<void>;
  
  /**
   * Join workspace
   */
  join(workspaceId: WorkspaceId, options: JoinOptions): Promise<void>;
  
  /**
   * List workspaces
   */
  list(): Promise<void>;
  
  /**
   * Export workspace
   */
  export(workspaceId: WorkspaceId, outputPath: string): Promise<void>;
}

interface CreateOptions {
  duration: number; // Minutes
  maxParticipants?: number;
  allowExtension?: boolean;
}

interface JoinOptions {
  key: string; // Base64 encoded temporal key
}

class CLICommands implements ICLICommands {
  constructor(private client: IEECPClient) {}
  
  async create(options: CreateOptions): Promise<void> {
    const config: WorkspaceConfig = {
      id: generateWorkspaceId(),
      createdAt: Date.now(),
      expiresAt: Date.now() + options.duration * 60 * 1000,
      timeWindow: {
        startTime: Date.now(),
        endTime: Date.now() + options.duration * 60 * 1000,
        rotationInterval: 15,
        gracePeriod: 60 * 1000
      },
      maxParticipants: options.maxParticipants || 50,
      allowExtension: options.allowExtension || false
    };
    
    const workspace = await this.client.createWorkspace(config);
    
    console.log('Workspace created:');
    console.log(`  ID: ${workspace.getMetadata().config.id}`);
    console.log(`  Expires: ${new Date(config.expiresAt).toISOString()}`);
    console.log(`  Share link: [generate share link]`);
  }
  
  async join(workspaceId: WorkspaceId, options: JoinOptions): Promise<void> {
    const key = Buffer.from(options.key, 'base64');
    const workspace = await this.client.joinWorkspace(workspaceId, key);
    
    // Start terminal editor
    await this.startTerminalEditor(workspace);
  }
  
  async list(): Promise<void> {
    // List workspaces from local storage
    console.log('Your workspaces:');
    // Display workspace list
  }
  
  async export(workspaceId: WorkspaceId, outputPath: string): Promise<void> {
    // Export workspace content to file
  }
  
  private async startTerminalEditor(workspace: WorkspaceClient): Promise<void> {
    // Terminal-based collaborative editor
    // Show participants
    // Show countdown timer
    // Handle keyboard input
    // Display real-time updates
  }
}
```

#### CLI Entry Point

```typescript
#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('eecp')
  .description('Ephemeral Encrypted Collaboration Protocol CLI')
  .version('1.0.0');

program
  .command('create')
  .description('Create a new workspace')
  .option('-d, --duration <minutes>', 'Workspace duration in minutes', '30')
  .option('-m, --max-participants <number>', 'Maximum participants', '50')
  .option('-e, --allow-extension', 'Allow workspace extension', false)
  .action(async (options) => {
    const client = new EECPClient();
    await client.connect('ws://localhost:3000');
    
    const commands = new CLICommands(client);
    await commands.create({
      duration: parseInt(options.duration),
      maxParticipants: parseInt(options.maxParticipants),
      allowExtension: options.allowExtension
    });
  });

program
  .command('join <workspace-id>')
  .description('Join an existing workspace')
  .requiredOption('-k, --key <key>', 'Base64 encoded temporal key')
  .action(async (workspaceId, options) => {
    const client = new EECPClient();
    await client.connect('ws://localhost:3000');
    
    const commands = new CLICommands(client);
    await commands.join(workspaceId, { key: options.key });
  });

program
  .command('list')
  .description('List your workspaces')
  .action(async () => {
    const client = new EECPClient();
    const commands = new CLICommands(client);
    await commands.list();
  });

program
  .command('export <workspace-id> <output>')
  .description('Export workspace content')
  .action(async (workspaceId, output) => {
    const client = new EECPClient();
    await client.connect('ws://localhost:3000');
    
    const commands = new CLICommands(client);
    await commands.export(workspaceId, output);
  });

program.parse();
```


### 7. Demo Package (`eecp-demo`)

Reference web application demonstrating EECP capabilities.

#### Demo Application Structure

```typescript
// App.tsx - Main application component
function App() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'create' | 'join' | 'workspace'>('home');
  
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage onNavigate={setView} />} />
        <Route path="/create" element={<CreateWorkspace />} />
        <Route path="/join/:id" element={<JoinWorkspace />} />
        <Route path="/workspace/:id" element={<WorkspaceView />} />
      </Routes>
    </Router>
  );
}

// CreateWorkspace.tsx - Workspace creation
function CreateWorkspace() {
  const [duration, setDuration] = useState(30);
  const navigate = useNavigate();
  
  const handleCreate = async () => {
    const client = new EECPClient();
    await client.connect('ws://localhost:3000');
    
    const config: WorkspaceConfig = {
      id: generateWorkspaceId(),
      createdAt: Date.now(),
      expiresAt: Date.now() + duration * 60 * 1000,
      timeWindow: {
        startTime: Date.now(),
        endTime: Date.now() + duration * 60 * 1000,
        rotationInterval: 15,
        gracePeriod: 60 * 1000
      },
      maxParticipants: 50,
      allowExtension: false
    };
    
    const workspace = await client.createWorkspace(config);
    navigate(`/workspace/${workspace.getMetadata().config.id}`);
  };
  
  return (
    <Box>
      <Typography variant="h4">Create Workspace</Typography>
      <TextField
        label="Duration (minutes)"
        type="number"
        value={duration}
        onChange={(e) => setDuration(parseInt(e.target.value))}
      />
      <Button onClick={handleCreate}>Create</Button>
    </Box>
  );
}

// WorkspaceView.tsx - Main workspace interface
function WorkspaceView() {
  const { id } = useParams<{ id: string }>();
  const { workspace, loading, error } = useWorkspace(id || null);
  const { text, participants, insert, deleteText } = useCollaboration(workspace);
  
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (!workspace) return null;
  
  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <WorkspaceHeader workspace={workspace} />
        <RichTextEditor
          text={text}
          onInsert={insert}
          onDelete={deleteText}
        />
      </Box>
      <ParticipantSidebar participants={participants} />
    </Box>
  );
}

// WorkspaceHeader.tsx - Header with countdown and controls
function WorkspaceHeader({ workspace }: { workspace: WorkspaceClient }) {
  const [timeRemaining, setTimeRemaining] = useState(0);
  
  useEffect(() => {
    const metadata = workspace.getMetadata();
    const interval = setInterval(() => {
      const remaining = metadata.config.expiresAt - Date.now();
      setTimeRemaining(Math.max(0, remaining));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [workspace]);
  
  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          EECP Workspace
        </Typography>
        <Chip
          label={`Expires in ${formatTime(timeRemaining)}`}
          color={timeRemaining < 60000 ? 'error' : 'default'}
        />
        <IconButton onClick={() => {/* Share */}}>
          <ShareIcon />
        </IconButton>
        <IconButton onClick={() => {/* Export */}}>
          <DownloadIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}

// RichTextEditor.tsx - Quill-based editor
function RichTextEditor({
  text,
  onInsert,
  onDelete
}: {
  text: string;
  onInsert: (position: number, text: string) => void;
  onDelete: (position: number, length: number) => void;
}) {
  const quillRef = useRef<ReactQuill>(null);
  
  const handleChange = (content: string, delta: any, source: string) => {
    if (source === 'user') {
      // Convert Quill delta to CRDT operations
      delta.ops.forEach((op: any) => {
        if (op.insert) {
          onInsert(/* position */, op.insert);
        } else if (op.delete) {
          onDelete(/* position */, op.delete);
        }
      });
    }
  };
  
  return (
    <ReactQuill
      ref={quillRef}
      value={text}
      onChange={handleChange}
      modules={{
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link'],
          ['clean']
        ]
      }}
    />
  );
}

// ParticipantSidebar.tsx - Participant list
function ParticipantSidebar({ participants }: { participants: ParticipantInfo[] }) {
  return (
    <Box sx={{ width: 250, borderLeft: 1, borderColor: 'divider', p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Participants ({participants.length})
      </Typography>
      <List>
        {participants.map((p) => (
          <ListItem key={p.id}>
            <ListItemAvatar>
              <Avatar>
                <PersonIcon />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={p.id.substring(0, 8)}
              secondary={p.role}
            />
            <Chip
              label="Online"
              size="small"
              color="success"
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
```


## Data Models

### Workspace Data Model

```typescript
interface Workspace {
  // Identity
  id: WorkspaceId;
  
  // Configuration
  config: WorkspaceConfig;
  
  // Encrypted data (opaque to server)
  encryptedMetadata: Buffer;
  
  // Lifecycle
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'revoked';
  
  // Participants (server only tracks count)
  participantCount: number;
}

interface WorkspaceConfig {
  id: WorkspaceId;
  createdAt: number;
  expiresAt: number;
  timeWindow: TimeWindow;
  maxParticipants: number;
  allowExtension: boolean;
}

interface TimeWindow {
  startTime: number;
  endTime: number;
  rotationInterval: number; // Minutes
  gracePeriod: number; // Milliseconds
}
```

### Participant Data Model

```typescript
interface ParticipantInfo {
  // Identity
  id: ParticipantId;
  
  // Cryptography
  publicKey: Buffer;
  
  // Metadata
  joinedAt: number;
  role: 'creator' | 'editor' | 'viewer';
}

interface ParticipantSession {
  // Identity
  participantId: ParticipantId;
  workspaceId: WorkspaceId;
  
  // Cryptography
  publicKey: Buffer;
  
  // Connection
  connectedAt: number;
  lastActivity: number;
  websocket: WebSocket;
}
```

### Operation Data Model

```typescript
interface CRDTOperation {
  // Identity
  id: OperationId;
  participantId: ParticipantId;
  
  // Timing
  timestamp: number;
  
  // Operation details
  type: 'insert' | 'delete';
  position: number;
  content?: string; // For insert
  length?: number; // For delete
}

interface EncryptedOperation {
  // Identity
  id: OperationId;
  workspaceId: WorkspaceId;
  participantId: ParticipantId;
  
  // Timing
  timestamp: number;
  
  // CRDT metadata (visible to server)
  position: number;
  operationType: 'insert' | 'delete' | 'format';
  
  // Encrypted payload (opaque to server)
  encryptedContent: Buffer;
  
  // Authentication
  signature: Buffer;
}
```

### Key Data Model

```typescript
interface TemporalKey {
  // Identity
  id: string;
  
  // Key material
  key: Buffer; // 32 bytes for AES-256
  
  // Validity period
  validFrom: number;
  validUntil: number;
  gracePeriodEnd: number;
}

interface KeyRotationSchedule {
  currentKeyId: string;
  nextRotationAt: number;
  previousKeyId?: string;
  previousKeyExpiresAt?: number;
}

interface Commitment {
  keyId: string;
  hash: Buffer; // SHA-256 of key + metadata
  timestamp: number;
  validFrom: number;
  validUntil: number;
}
```

### Message Data Model

```typescript
interface MessageEnvelope {
  type: MessageType;
  payload: unknown;
  timestamp: number;
  messageId: string;
}

type MessageType =
  | 'handshake'
  | 'handshake_ack'
  | 'operation'
  | 'operation_ack'
  | 'sync_request'
  | 'sync_response'
  | 'error'
  | 'ping'
  | 'pong';

interface HandshakeMessage {
  protocolVersion: string;
  workspaceId: WorkspaceId;
  participantId: ParticipantId;
  publicKey: Buffer;
  proof: ZeroKnowledgeProof;
}

interface HandshakeAckMessage {
  success: boolean;
  currentKeyId: string;
  encryptedMetadata: Buffer;
  serverTime: number;
}

interface OperationMessage {
  operation: EncryptedOperation;
}

interface OperationAckMessage {
  operationId: OperationId;
  serverTimestamp: number;
}

interface SyncRequestMessage {
  fromTimestamp: number;
}

interface SyncResponseMessage {
  operations: EncryptedOperation[];
  currentState: Buffer; // Encrypted CRDT state
}

interface ErrorMessage {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

type ErrorCode =
  | 'AUTH_FAILED'
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_EXPIRED'
  | 'INVALID_OPERATION'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PARTICIPANT_REVOKED';
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

The following properties define the correctness criteria for the EECP system. Each property is universally quantified and references the specific requirements it validates.

### Workspace Lifecycle Properties

**Property 1: Unique Workspace Generation**
*For any* workspace creation request, the generated workspace ID must be unique and not collide with any existing workspace ID.
**Validates: Requirements 1.1**

**Property 2: Valid Expiration Duration**
*For any* workspace creation request, the system must accept expiration durations of 5, 15, 30, or 60 minutes and reject all other values.
**Validates: Requirements 1.2**

**Property 3: Workspace Keypair Generation**
*For any* workspace creation, a valid ECDSA keypair must be generated for participant authentication.
**Validates: Requirements 1.3**

**Property 4: Workspace Extension**
*For any* workspace with extension enabled, extending the workspace before expiration must update the expiration time and generate new temporal keys for the extended period.
**Validates: Requirements 1.5**

**Property 5: Workspace Revocation**
*For any* workspace, revoking it must immediately destroy all temporal keys, close all participant connections, and prevent new operations.
**Validates: Requirements 1.6**

### Temporal Key Management Properties

**Property 6: Deterministic Key Derivation**
*For any* workspace secret and time window, deriving a temporal key using HKDF must produce the same key when given the same inputs (deterministic derivation).
**Validates: Requirements 2.1, 2.2**

**Property 7: Key Rotation Schedule**
*For any* active workspace, temporal keys must rotate at intervals matching the configured rotation schedule (5, 15, 30, or 60 minutes).
**Validates: Requirements 2.3**

**Property 8: Grace Period Key Retention**
*For any* key rotation, the previous temporal key must remain valid and accessible for exactly one grace period duration after rotation.
**Validates: Requirements 2.4**

**Property 9: Key Deletion Guarantee**
*For any* temporal key that has expired beyond its grace period, the key must be securely deleted from memory and no longer accessible for decryption.
**Validates: Requirements 2.5, 2.7, 18.1, 18.2**

**Property 10: Key Deletion Commitments**
*For any* deleted temporal key, a cryptographic commitment (SHA-256 hash) must be created and published to a verifiable log before deletion.
**Validates: Requirements 2.6, 10.1, 10.2, 10.4, 10.5**

### Authentication Properties

**Property 11: Zero-Knowledge Authentication**
*For any* participant authentication attempt, the server must verify the participant's proof without learning the participant's identity or private key.
**Validates: Requirements 3.1, 3.2, 3.3**

**Property 12: Authentication Success Connection**
*For any* successful authentication, a WebSocket connection must be established for the participant.
**Validates: Requirements 3.4**

**Property 13: Authentication Failure Rejection**
*For any* failed authentication attempt, the server must reject the connection and prevent workspace access.
**Validates: Requirements 3.5**

**Property 14: Participant Revocation**
*For any* revoked participant, the server must close their connection and prevent all future reconnection attempts.
**Validates: Requirements 3.6**

### Encrypted CRDT Properties

**Property 15: Operation Encryption**
*For any* CRDT operation created by a participant, the content payload must be encrypted with the current temporal key before transmission.
**Validates: Requirements 4.2**

**Property 16: Operation Signing**
*For any* CRDT operation, the operation must be signed with the participant's private key, and the signature must be verifiable using the participant's public key.
**Validates: Requirements 4.3**

**Property 17: Server Zero-Knowledge Validation**
*For any* operation received by the server, the server must validate the signature and workspace membership without decrypting the content payload.
**Validates: Requirements 4.4, 6.1, 6.2**

**Property 18: Operation Broadcast**
*For any* valid operation received by the server, the operation must be broadcast to all connected participants in the workspace except the sender.
**Validates: Requirements 4.5, 6.3**

**Property 19: Operation Decryption and Application**
*For any* operation received by a participant, the participant must decrypt the content using the temporal key and apply the CRDT operation to their local document.
**Validates: Requirements 4.6**

**Property 20: CRDT Convergence**
*For any* set of concurrent operations from multiple participants, all participants must converge to the same document state regardless of operation arrival order.
**Validates: Requirements 4.7, 4.8**

### Multi-Recipient Encryption Properties

**Property 21: Temporal Key Encryption for Participants**
*For any* participant joining a workspace, the current temporal key must be encrypted using ECIES with that participant's public key.
**Validates: Requirements 5.2**

**Property 22: Metadata Re-encryption on Participant Addition**
*For any* new participant added to a workspace, the workspace metadata must be re-encrypted for all current participants including the new one.
**Validates: Requirements 5.3**

**Property 23: Key Rotation on Participant Revocation**
*For any* participant revoked from a workspace, the system must rotate temporal keys and re-encrypt workspace metadata for only the remaining participants.
**Validates: Requirements 5.4**

### Server Operation Routing Properties

**Property 24: Operation Buffering for Offline Participants**
*For any* participant that is offline when an operation is broadcast, the server must buffer the operation for up to the grace period duration.
**Validates: Requirements 6.4**

**Property 25: Buffer Expiration**
*For any* buffered operation older than the grace period, the server must discard the operation.
**Validates: Requirements 6.5**

### Client Key Management Properties

**Property 26: Client Key Rotation Fetch**
*For any* key rotation event, connected clients must fetch the new temporal key from the workspace metadata.
**Validates: Requirements 7.2**

**Property 27: Client Key Deletion on Expiration**
*For any* workspace expiration, clients must delete all associated temporal keys from local storage.
**Validates: Requirements 7.3**

**Property 28: Offline Key Retention**
*For any* client that goes offline, the client must retain temporal keys for the grace period to decrypt buffered operations upon reconnection.
**Validates: Requirements 7.4**

**Property 29: Reconnection Key Verification**
*For any* client reconnection, the client must verify it has the current temporal keys and request updates if the keys are outdated.
**Validates: Requirements 7.5**

### Real-Time Synchronization Properties

**Property 30: Immediate Operation Application**
*For any* operation received by a client, the client must apply the operation to the local CRDT document without delay.
**Validates: Requirements 8.2**

**Property 31: Offline Operation Buffering and Ordering**
*For any* client that experiences network latency or disconnection, the client must buffer operations and apply them in timestamp order when connectivity resumes.
**Validates: Requirements 8.3, 15.3**

**Property 32: Mid-Session State Synchronization**
*For any* participant joining a workspace mid-session, the system must synchronize the current document state encrypted with the current temporal key.
**Validates: Requirements 8.4, 8.5**

### Workspace Metadata Properties

**Property 33: Encrypted Metadata Storage**
*For any* workspace metadata stored on the server, the metadata must be encrypted using ECIES multi-recipient encryption and never stored in plaintext.
**Validates: Requirements 9.1, 9.2**

**Property 34: Metadata Re-encryption on Update**
*For any* workspace metadata update, the system must re-encrypt the metadata for all current participants.
**Validates: Requirements 9.3**

**Property 35: Encrypted Metadata Retrieval**
*For any* metadata request from a participant, the server must return the encrypted metadata for client-side decryption.
**Validates: Requirements 9.4**

### Commitment and Verification Properties

**Property 36: Commitment Verification**
*For any* published commitment, a verifier must be able to confirm the commitment exists in the log and that the corresponding key is no longer accessible.
**Validates: Requirements 10.3**

### WebSocket Protocol Properties

**Property 37: Protocol Version Handshake**
*For any* client connection, the system must perform a handshake with protocol version negotiation before allowing workspace operations.
**Validates: Requirements 11.1**

**Property 38: Structured Message Envelope**
*For any* message sent over WebSocket, the message must follow the structured envelope format with message type, payload, timestamp, and message ID.
**Validates: Requirements 11.2**

**Property 39: Operation Acknowledgment**
*For any* operation broadcast by the server, the server must send an acknowledgment message to the sender with the operation ID and server timestamp.
**Validates: Requirements 11.3**

**Property 40: Error Message Format**
*For any* error that occurs during operation processing, the server must send an error message with an error code and description.
**Validates: Requirements 11.4**

**Property 41: Exponential Backoff Reconnection**
*For any* connection loss, the client must attempt reconnection using exponential backoff with a maximum number of attempts.
**Validates: Requirements 11.5, 11.6**

### Browser Client Properties

**Property 42: Shareable Link Generation**
*For any* workspace, generating a shareable link must embed the workspace ID and current temporal key in a format that allows recipients to join.
**Validates: Requirements 14.4**

**Property 43: Document Export**
*For any* workspace, exporting the document must produce plaintext that matches the current CRDT document state.
**Validates: Requirements 14.5**

### Error Handling Properties

**Property 44: Missing Key Recovery**
*For any* client that encounters a missing temporal key, the client must request the current key from the workspace metadata.
**Validates: Requirements 15.1**

**Property 45: Decryption Failure Handling**
*For any* operation that fails to decrypt, the client must log the error and skip the operation without crashing.
**Validates: Requirements 15.2**

**Property 46: Clock Skew Grace Period**
*For any* operation with a temporal key that is within the grace period, the system must accept and process the operation even if the key has rotated.
**Validates: Requirements 15.4**

**Property 47: Rate Limiting Backpressure**
*For any* client that exceeds the rate limit, the server must return a backpressure signal and delay processing of subsequent operations.
**Validates: Requirements 15.5, 17.1, 17.2**

### Audit Trail Properties

**Property 48: Encrypted Audit Logs**
*For any* audit log entry, the entry must be encrypted with a separate audit key that expires with the workspace.
**Validates: Requirements 16.5**

### Rate Limiting Properties

**Property 49: Workspace Creation Rate Limiting**
*For any* IP address, the system must limit workspace creation to 10 workspaces per hour.
**Validates: Requirements 17.3**

**Property 50: Participant Limit Enforcement**
*For any* workspace, the server must reject new participant joins when the participant count reaches the maximum (50 participants).
**Validates: Requirements 17.4**

### Data Retention Properties

**Property 51: Complete Workspace Cleanup**
*For any* expired workspace, the system must delete all keys, operations, metadata, and references from server memory and indexes.
**Validates: Requirements 18.1, 18.3, 6.6, 9.5**

**Property 52: Cleanup Service Scheduling**
*For any* running server, the temporal cleanup service must scan for expired workspaces every 60 seconds.
**Validates: Requirements 18.5**


## Error Handling

The EECP system must handle errors gracefully to maintain security guarantees and user experience. Error handling is organized by component and failure mode.

### Client-Side Error Handling

**Connection Errors:**
- WebSocket connection failures trigger exponential backoff reconnection (Property 41)
- Maximum 5 reconnection attempts before requiring user intervention
- Display connection status to user with retry countdown

**Decryption Errors:**
- Missing temporal keys trigger automatic key fetch from metadata (Property 44)
- Decryption failures log error and skip operation (Property 45)
- Corrupted operations are discarded with error notification

**Operation Errors:**
- Invalid CRDT operations are rejected locally before encryption
- Signature failures prevent operation submission
- Rate limit errors display backpressure notification to user

**Storage Errors:**
- IndexedDB failures fall back to in-memory key storage
- Storage quota exceeded triggers cleanup of expired keys
- Storage errors prevent workspace creation with clear error message

### Server-Side Error Handling

**Authentication Errors:**
- Invalid zero-knowledge proofs reject connection (Property 13)
- Expired challenges require new handshake
- Revoked participants receive specific error code (PARTICIPANT_REVOKED)

**Workspace Errors:**
- Workspace not found returns WORKSPACE_NOT_FOUND error
- Expired workspaces return WORKSPACE_EXPIRED error
- Full workspaces (max participants) return specific error

**Operation Errors:**
- Invalid signatures reject operation with INVALID_OPERATION error
- Operations for expired workspaces are rejected
- Malformed operations return validation error

**Resource Errors:**
- Rate limit exceeded returns RATE_LIMIT_EXCEEDED with retry-after
- Server overload triggers backpressure signals
- Memory pressure triggers aggressive cleanup

### Cryptographic Error Handling

**Key Derivation Errors:**
- HKDF failures prevent workspace creation
- Invalid key material triggers error and cleanup
- Key rotation failures maintain previous key until resolved

**Encryption Errors:**
- ECIES encryption failures prevent operation submission
- AES-GCM encryption failures log error and retry once
- Encryption failures during metadata update rollback changes

**Commitment Errors:**
- Commitment creation failures log error but allow key deletion
- Commitment verification failures log warning (non-blocking)
- Missing commitments trigger investigation but don't block operations

### Network Error Handling

**Disconnection Handling:**
- Client buffers operations during disconnection (Property 31)
- Server buffers operations for offline participants (Property 24)
- Reconnection syncs buffered operations in order

**Timeout Handling:**
- Operation acknowledgment timeout triggers retry (max 3 attempts)
- Handshake timeout closes connection
- Sync request timeout falls back to full state sync

**Message Errors:**
- Malformed messages log error and close connection
- Unknown message types log warning and ignore
- Message parsing errors trigger connection reset

### Recovery Strategies

**Graceful Degradation:**
- If encryption fails, prevent operation rather than send plaintext
- If key rotation fails, extend previous key validity
- If sync fails, request full state from another participant

**Automatic Recovery:**
- Reconnection automatically resumes from last acknowledged operation
- Missing keys automatically fetched from metadata
- Clock skew handled by grace period (Property 46)

**User Intervention:**
- Persistent connection failures require manual reconnection
- Corrupted workspace state requires re-joining
- Expired workspaces cannot be recovered (by design)


## Testing Strategy

The EECP system requires comprehensive testing to ensure correctness, security, and performance. Testing is organized into unit tests, property-based tests, integration tests, and security audits.

### Property-Based Testing

Property-based testing is the primary method for validating the correctness properties defined in this document. We will use **fast-check** for TypeScript property-based testing.

**Configuration:**
- Minimum 100 iterations per property test (due to randomization)
- Each property test references its design document property number
- Tag format: `Feature: eecp-full-system, Property {number}: {property_text}`

**Test Organization:**
- Property tests co-located with implementation in `*.property.test.ts` files
- Each correctness property has exactly one property-based test
- Generators create random valid inputs for comprehensive coverage

**Key Property Test Examples:**

```typescript
// Property 6: Deterministic Key Derivation
test('Feature: eecp-full-system, Property 6: Deterministic Key Derivation', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 32, maxLength: 32 }), // workspace secret
      fc.integer({ min: 0, max: Date.now() }), // timestamp
      async (secret, timestamp) => {
        const timeWindow = createTimeWindow(timestamp, 30);
        const keyId = 'test-key-1';
        
        const key1 = await keyDerivation.deriveKey(Buffer.from(secret), timeWindow, keyId);
        const key2 = await keyDerivation.deriveKey(Buffer.from(secret), timeWindow, keyId);
        
        // Same inputs must produce same key
        expect(key1.key).toEqual(key2.key);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 20: CRDT Convergence
test('Feature: eecp-full-system, Property 20: CRDT Convergence', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        type: fc.constantFrom('insert', 'delete'),
        position: fc.integer({ min: 0, max: 100 }),
        content: fc.string({ maxLength: 10 })
      }), { minLength: 1, maxLength: 20 }),
      async (operations) => {
        // Create two CRDT instances
        const crdt1 = new EncryptedTextCRDT();
        const crdt2 = new EncryptedTextCRDT();
        
        // Apply operations in different orders
        const shuffled = [...operations].sort(() => Math.random() - 0.5);
        
        for (const op of operations) {
          crdt1.applyOperation(convertToOperation(op));
        }
        
        for (const op of shuffled) {
          crdt2.applyOperation(convertToOperation(op));
        }
        
        // Both must converge to same state
        expect(crdt1.getText()).toEqual(crdt2.getText());
      }
    ),
    { numRuns: 100 }
  );
});

// Property 9: Key Deletion Guarantee
test('Feature: eecp-full-system, Property 9: Key Deletion Guarantee', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      async (keyMaterial) => {
        const key: TemporalKey = {
          id: 'test-key',
          key: Buffer.from(keyMaterial),
          validFrom: Date.now(),
          validUntil: Date.now() + 60000,
          gracePeriodEnd: Date.now() + 120000
        };
        
        // Store key
        await keyManager.storeKey('workspace-1', key);
        
        // Delete key
        encryption.destroyKey(key);
        
        // Key must not be accessible
        await expect(
          keyManager.getKeyById('workspace-1', 'test-key')
        ).rejects.toThrow();
        
        // Key buffer must be zeroed
        expect(key.key.every(b => b === 0)).toBe(true);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Testing

Unit tests validate specific examples, edge cases, and error conditions. Unit tests complement property tests by testing concrete scenarios.

**Unit Test Coverage:**
- Crypto package: 90%+ coverage (critical security code)
- CRDT package: 85%+ coverage (correctness critical)
- Server package: 80%+ coverage
- Client package: 80%+ coverage
- Protocol package: 100%+ coverage (type definitions)

**Unit Test Focus Areas:**
- Edge cases: empty inputs, boundary values, maximum sizes
- Error conditions: invalid inputs, network failures, timeouts
- Integration points: component interfaces, message formats
- Specific examples: known test vectors, regression tests

**Example Unit Tests:**

```typescript
describe('TemporalKeyDerivation', () => {
  it('should reject invalid rotation intervals', async () => {
    const invalidIntervals = [0, 1, 7, 100, -5];
    
    for (const interval of invalidIntervals) {
      await expect(
        keyDerivation.deriveKey(
          Buffer.alloc(32),
          { ...timeWindow, rotationInterval: interval },
          'key-1'
        )
      ).rejects.toThrow();
    }
  });
  
  it('should handle empty workspace secret', async () => {
    await expect(
      keyDerivation.deriveKey(
        Buffer.alloc(0),
        timeWindow,
        'key-1'
      )
    ).rejects.toThrow('Invalid workspace secret');
  });
});

describe('OperationRouter', () => {
  it('should not broadcast to sender', async () => {
    const sender = 'participant-1';
    const receiver = 'participant-2';
    
    // Setup participants
    await participantManager.authenticateParticipant(workspaceId, {
      participantId: sender,
      // ... handshake details
    });
    
    await participantManager.authenticateParticipant(workspaceId, {
      participantId: receiver,
      // ... handshake details
    });
    
    // Send operation
    const operation = createTestOperation(sender);
    await operationRouter.routeOperation(workspaceId, operation, sender);
    
    // Sender should not receive their own operation
    const senderSession = participantManager.getSession(workspaceId, sender);
    expect(senderSession.websocket.send).not.toHaveBeenCalled();
    
    // Receiver should receive operation
    const receiverSession = participantManager.getSession(workspaceId, receiver);
    expect(receiverSession.websocket.send).toHaveBeenCalledWith(
      expect.stringContaining(operation.id)
    );
  });
});
```

### Integration Testing

Integration tests validate end-to-end workflows across multiple components.

**Integration Test Scenarios:**
- Complete workspace lifecycle: create → join → edit → expire
- Multi-participant collaboration: concurrent edits, conflict resolution
- Network resilience: disconnection, reconnection, buffering
- Key rotation: automatic rotation, grace period, re-encryption
- Error recovery: missing keys, decryption failures, timeouts

**Example Integration Test:**

```typescript
describe('End-to-End Workspace Collaboration', () => {
  it('should support multi-participant real-time editing', async () => {
    // Create workspace
    const creator = new EECPClient();
    await creator.connect('ws://localhost:3000');
    const workspace = await creator.createWorkspace(testConfig);
    
    // Join as second participant
    const participant = new EECPClient();
    await participant.connect('ws://localhost:3000');
    const joined = await participant.joinWorkspace(
      workspace.getMetadata().config.id,
      testTemporalKey
    );
    
    // Creator inserts text
    const creatorEditor = workspace.getEditor();
    creatorEditor.insert(0, 'Hello ');
    
    // Wait for propagation
    await sleep(100);
    
    // Participant should see the text
    const participantEditor = joined.getEditor();
    expect(participantEditor.getText()).toBe('Hello ');
    
    // Participant inserts text
    participantEditor.insert(6, 'World');
    
    // Wait for propagation
    await sleep(100);
    
    // Both should converge
    expect(creatorEditor.getText()).toBe('Hello World');
    expect(participantEditor.getText()).toBe('Hello World');
  });
});
```

### Performance Testing

Performance tests validate latency, throughput, and scalability requirements.

**Performance Benchmarks:**
- Operation latency: <100ms from edit to all participants
- Key derivation: <10ms per key
- Encryption/decryption: <5ms per operation
- Concurrent participants: 50+ per workspace
- Concurrent workspaces: 1000+ per server
- Operation throughput: 100+ ops/sec per participant

**Load Testing:**
- Simulate 100+ concurrent participants across multiple workspaces
- Measure operation latency under load
- Test server resource usage (CPU, memory, network)
- Validate cleanup service performance

### Security Testing

Security testing validates cryptographic guarantees and attack resistance.

**Security Test Areas:**
- Zero-knowledge guarantee: server never sees plaintext
- Key deletion verification: keys are actually destroyed
- Temporal key isolation: expired keys cannot decrypt new content
- Signature verification: forged operations are rejected
- Replay attack prevention: old operations are rejected
- Man-in-the-middle resistance: TLS + encryption

**Security Audit Checklist:**
- Cryptographic primitives: HKDF, AES-GCM, ECDSA, ECIES
- Key management: generation, storage, rotation, deletion
- Timing attacks: constant-time operations where needed
- Side channels: memory leaks, cache timing
- Input validation: all external inputs sanitized
- Error messages: no information leakage

### Browser Compatibility Testing

Browser tests validate client functionality across platforms.

**Target Browsers:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile: iOS Safari, Chrome Android

**Browser Test Focus:**
- IndexedDB key storage
- WebSocket connection
- Crypto API availability
- React rendering
- Quill editor integration

### CLI Testing

CLI tests validate command-line interface functionality.

**CLI Test Scenarios:**
- Workspace creation and output format
- Workspace joining and terminal editor
- Workspace listing and information display
- Export functionality
- Error handling and user feedback

### Continuous Integration

CI pipeline runs all tests on every commit.

**CI Pipeline:**
1. Lint and type check (TypeScript strict mode)
2. Unit tests (all packages)
3. Property tests (100 iterations)
4. Integration tests
5. Build all packages
6. Security audit (npm audit)
7. Coverage report (enforce minimums)

**Coverage Requirements:**
- Crypto: 90%+
- CRDT: 85%+
- Server: 80%+
- Client: 80%+
- Overall: 80%+

### Test Data Generation

Test data generators create realistic random inputs for property tests.

**Generators:**
- Workspace configurations: valid durations, participant limits
- Temporal keys: valid key material, time windows
- CRDT operations: insert/delete with valid positions
- Participants: keypairs, IDs, roles
- Messages: valid envelopes, payloads
- Network conditions: latency, packet loss, disconnection

**Generator Properties:**
- Generate only valid inputs (no invalid data in property tests)
- Cover edge cases: empty, maximum, boundary values
- Realistic distributions: common cases more frequent
- Shrinking: minimize failing examples for debugging

