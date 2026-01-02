# @digitaldefiance/eecp-browser

Browser-compatible EECP (Ephemeral Encrypted Collaboration Protocol) client and server implementations.

## Overview

This package provides browser-compatible versions of the EECP client and server that run entirely in the browser without Node.js dependencies. Perfect for demos, testing, and client-side applications.

## Features

- **BrowserEECPClient**: Full-featured EECP client that runs in the browser
- **BrowserEECPServer**: In-memory EECP server for browser-based demos
- **BrowserTransport**: EventEmitter-based transport layer (replaces WebSocket)
- **MessageBus**: Message routing and visualization support

## Installation

```bash
npm install @digitaldefiance/eecp-browser
# or
yarn add @digitaldefiance/eecp-browser
```

## Usage

### Basic Client-Server Setup

```typescript
import { BrowserEECPServer, BrowserEECPClient } from '@digitaldefiance/eecp-browser';
import { GuidV4 } from '@digitaldefiance/ecies-lib';

// Create server
const server = new BrowserEECPServer();
server.start();

// Create workspace
const workspaceConfig = {
  id: GuidV4.new(),
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

const publicKey = new Uint8Array(32);
const workspace = await server.createWorkspace(workspaceConfig, publicKey);

// Create client
const client = new BrowserEECPClient();
await client.initialize();

// Connect client to server
const transport = server.createTransport();
transport.connect();

const workspaceSecret = Buffer.alloc(32);
crypto.getRandomValues(workspaceSecret);

await client.connect(transport, workspace.id, workspaceSecret, workspaceConfig);

// Use the client
await client.insert(0, 'Hello, World!');
console.log(client.getText()); // "Hello, World!"
```

### Multi-Client Collaboration

```typescript
// Create second client
const client2 = new BrowserEECPClient();
await client2.initialize();

const transport2 = server.createTransport();
transport2.connect();

await client2.connect(transport2, workspace.id, workspaceSecret, workspaceConfig);

// Listen for changes
client2.onChange((text) => {
  console.log('Client 2 received:', text);
});

// Client 1 makes a change
await client.insert(0, 'Synced text');

// Client 2 will receive the update
```

## Key Differences from Node.js Server

- **Storage**: In-memory Maps instead of database
- **Crypto**: Web Crypto API instead of Node.js crypto
- **Transport**: EventEmitter instead of WebSocket
- **Timers**: window.setTimeout/setInterval instead of Node.js timers

## API

### BrowserEECPClient

- `initialize()`: Initialize the client
- `connect(transport, workspaceId, workspaceSecret, workspaceConfig?)`: Connect to workspace
- `insert(position, text)`: Insert text at position
- `delete(position, length)`: Delete text
- `getText()`: Get current text
- `onChange(callback)`: Subscribe to text changes
- `disconnect()`: Disconnect from workspace

### BrowserEECPServer

- `start()`: Start the server
- `stop()`: Stop the server
- `createWorkspace(config, publicKey)`: Create a new workspace
- `getWorkspace(workspaceId)`: Get workspace by ID
- `createTransport()`: Create a new transport connection
- `getHealth()`: Get server health status

## License

MIT
