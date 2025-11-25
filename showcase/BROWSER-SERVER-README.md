# EECP Browser Server Implementation

This document describes the browser-compatible server implementation for the EECP showcase.

## Overview

The browser server is a fully in-memory implementation of the EECP server that runs entirely in the browser without any Node.js dependencies. It enables interactive demonstrations of the EECP protocol with real-time visualization of message flow, CRDT operations, and encryption processes.

## Components

### 1. BrowserEECPServer (`showcase/src/lib/browser-server.ts`)

A browser-compatible EECP server that:
- Stores workspaces in memory using JavaScript Maps
- Uses Web Crypto API instead of Node.js crypto
- Implements event-based transport instead of WebSocket
- Exposes the same API as the Node.js EECPServer

**Key Features:**
- In-memory workspace storage
- Participant session management
- Operation routing and broadcasting
- Workspace lifecycle management (create, extend, revoke, expire)
- Automatic cleanup service
- Health monitoring

### 2. BrowserTransport (`showcase/src/lib/browser-server.ts`)

An EventEmitter-based transport layer that replaces WebSocket:
- Emits 'open', 'close', 'message', and 'error' events
- Maintains message envelope format for consistency
- Provides direct method calls between client and server
- Tracks connection state

### 3. MessageBus (`showcase/src/lib/message-bus.ts`)

A message bus for visualizing communication:
- Records all messages between client and server
- Tracks message direction (client→server, server→client)
- Provides message history and statistics
- Enables real-time message flow visualization

## Visualization Components

### 1. MessageFlow (`showcase/src/components/MessageFlow.tsx`)

Animated visualization showing:
- Message flow between client and server
- Message types and directions
- Real-time animation of messages in transit

### 2. CRDTVisualizer (`showcase/src/components/CRDTVisualizer.tsx`)

Shows CRDT state and operations:
- Current document state
- Operation log with timestamps
- Statistics (operations, words, characters)

### 3. ParticipantPanel (`showcase/src/components/ParticipantPanel.tsx`)

Controls for simulated participants:
- Connect/disconnect participants
- Send operations from participants
- Visual status indicators

### 4. EncryptionIndicator (`showcase/src/components/EncryptionIndicator.tsx`)

Visualizes encryption activity:
- Encryption/decryption counters
- Recent encryption events with progress bars
- Encryption method badges (AES-256-GCM, Temporal Keys)

## Demo Component

### EECPDemo (`showcase/src/components/EECPDemo.tsx`)

Main interactive demo showing:
- Server status and statistics
- Workspace creation and management
- Multiple simulated participants (Alice, Bob, Charlie)
- Real-time message flow
- CRDT operations
- Encryption activity

**User Interactions:**
1. Create a workspace
2. Connect participants
3. Send operations from participants
4. Watch messages flow between client and server
5. See CRDT state update in real-time
6. Monitor encryption/decryption activity

## Testing

Tests are located in `showcase/src/lib/browser-server.test.ts` and cover:

1. **Workspace Management:**
   - Creating workspaces
   - Retrieving workspaces by ID
   - Extending workspace expiration
   - Revoking workspaces
   - Checking expiration status

2. **Event-Based Message Routing:**
   - Creating transports
   - Connecting/disconnecting transports
   - Sending and receiving messages
   - Message handling

3. **Browser Crypto Compatibility:**
   - Generating challenges with Web Crypto API
   - Ensuring unique challenge generation

4. **Server Health:**
   - Health status reporting
   - Workspace and participant counting

## Usage

The demo is integrated into the showcase app at `showcase/src/App.tsx`:

```tsx
import EECPDemo from "./components/EECPDemo";

function App() {
  return (
    <div className="app">
      <Hero scrollY={scrollY} />
      <EECPDemo />
      <Components />
      <About />
    </div>
  );
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Environment                   │
│                                                          │
│  ┌──────────────┐         ┌──────────────┐             │
│  │   Client 1   │         │   Client 2   │             │
│  │  (Alice)     │         │   (Bob)      │             │
│  └──────┬───────┘         └──────┬───────┘             │
│         │                        │                      │
│         │  BrowserTransport      │                      │
│         └────────┬───────────────┘                      │
│                  │                                      │
│         ┌────────▼────────┐                            │
│         │ BrowserEECPServer│                            │
│         │  (In-Memory)    │                            │
│         └─────────────────┘                            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Visualization Components                │  │
│  │  • MessageFlow                                    │  │
│  │  • CRDTVisualizer                                │  │
│  │  • ParticipantPanel                              │  │
│  │  • EncryptionIndicator                           │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Key Differences from Node.js Server

1. **Storage:** In-memory Maps instead of database
2. **Crypto:** Web Crypto API instead of Node.js crypto
3. **Transport:** EventEmitter instead of WebSocket
4. **Timers:** window.setTimeout/setInterval instead of Node.js timers
5. **IDs:** crypto.randomUUID() instead of uuid package

## Future Enhancements

Potential improvements:
- Add IndexedDB persistence for workspaces
- Implement Web Workers for background processing
- Add WebRTC for peer-to-peer communication
- Support for multiple concurrent workspaces
- Advanced CRDT conflict visualization
- Encryption key rotation visualization
- Network latency simulation

## Requirements Validated

This implementation validates the following requirements:
- **1.1, 1.2, 1.3, 1.4, 1.5, 1.6:** Workspace lifecycle management
- **11.1, 11.2, 11.3:** WebSocket protocol (adapted for browser)
- **14.1, 14.2, 14.3:** Browser client interface with visualization

## Running the Demo

```bash
cd showcase
yarn install
yarn dev
```

Then open http://localhost:5173 in your browser.

## Notes

- The browser server is designed for demonstration purposes
- It does not implement full cryptographic security (simplified for demo)
- All data is stored in memory and lost on page refresh
- Suitable for StackBlitz and other browser-based environments
