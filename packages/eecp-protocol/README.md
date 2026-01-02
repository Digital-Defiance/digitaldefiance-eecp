# @digitaldefiance/eecp-protocol

Core types and protocol definitions for EECP (Ephemeral Encrypted Collaboration Protocol).

## Overview

This package defines the foundational types, interfaces, and protocol specifications used across the entire EECP system. It provides workspace configuration, encrypted operations, WebSocket message envelopes, and all shared interfaces for zero-knowledge ephemeral collaboration.

## Features

- **Type Definitions**: WorkspaceId, ParticipantId, OperationId type definitions
- **Temporal Scheduling**: TimeWindow and temporal key scheduling interfaces
- **Operation Structures**: EncryptedOperation and CRDT operation structures
- **Protocol Types**: WebSocket message envelopes and protocol types
- **Workspace Metadata**: Shared interfaces for workspace metadata and configuration

## Installation

```bash
npm install @digitaldefiance/eecp-protocol
# or
yarn add @digitaldefiance/eecp-protocol
```

## Usage

```typescript
import {
  WorkspaceId,
  ParticipantId,
  WorkspaceConfig,
  MessageEnvelope,
  CRDTOperation,
  EncryptedOperation,
} from '@digitaldefiance/eecp-protocol';

// Define a workspace configuration
const config: WorkspaceConfig = {
  id: workspaceId,
  createdAt: Date.now(),
  expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
  timeWindow: {
    startTime: Date.now(),
    endTime: Date.now() + 30 * 60 * 1000,
    rotationInterval: 15, // 15 minutes
    gracePeriod: 60 * 1000, // 1 minute
  },
  maxParticipants: 50,
  allowExtension: false,
};

// Create a message envelope
const envelope: MessageEnvelope = {
  type: 'operation',
  payload: operationMessage,
  timestamp: Date.now(),
  messageId: crypto.randomUUID(),
};
```

## Key Types

### WorkspaceConfig

Defines the configuration for an ephemeral workspace:
- `id`: Unique workspace identifier
- `createdAt`: Workspace creation timestamp
- `expiresAt`: Workspace expiration timestamp
- `timeWindow`: Temporal key rotation schedule
- `maxParticipants`: Maximum number of concurrent participants
- `allowExtension`: Whether workspace duration can be extended

### TimeWindow

Defines the temporal key rotation schedule:
- `startTime`: When the workspace becomes active
- `endTime`: When the workspace expires
- `rotationInterval`: How often keys rotate (in minutes)
- `gracePeriod`: Grace period for key transitions (in milliseconds)

### CRDTOperation

Represents a CRDT operation:
- `id`: Unique operation identifier
- `participantId`: Who created the operation
- `timestamp`: When the operation was created
- `type`: Operation type ('insert' or 'delete')
- `position`: Position in the document
- `content`: Text content (for insert operations)
- `length`: Length (for delete operations)

### EncryptedOperation

Represents an encrypted CRDT operation:
- `id`: Unique operation identifier
- `workspaceId`: Which workspace this belongs to
- `participantId`: Who created the operation
- `timestamp`: When the operation was created
- `position`: Position in the document
- `operationType`: Type of operation
- `encryptedContent`: Encrypted operation payload
- `signature`: ECDSA signature for authenticity

### MessageEnvelope

WebSocket message wrapper:
- `type`: Message type (handshake, operation, sync_request, etc.)
- `payload`: Message-specific payload
- `timestamp`: When the message was created
- `messageId`: Unique message identifier

## Message Types

- `handshake`: Initial connection authentication
- `handshake_ack`: Server acknowledgment of handshake
- `challenge`: Server challenge for authentication
- `operation`: CRDT operation broadcast
- `operation_ack`: Server acknowledgment of operation
- `sync_request`: Request for operation history
- `sync_response`: Response with operation history
- `error`: Error message
- `ping`/`pong`: Connection keep-alive

## License

MIT

## Repository

https://github.com/Digital-Defiance/digitaldefiance-eecp
