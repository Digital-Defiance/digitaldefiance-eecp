# @digitaldefiance/eecp-client

Browser client library with React hooks for collaborative editing. Provides WebSocket connection management, key storage in IndexedDB, collaborative editor with change subscriptions, and automatic reconnection with exponential backoff.

## Features

- **EECPClient** with WebSocket connection management
- **ClientKeyManager** with IndexedDB storage
- **CollaborativeEditor** with real-time change subscriptions
- **React hooks**: useWorkspace, useCollaboration
- **Automatic reconnection** with exponential backoff

## Installation

```bash
npm install @digitaldefiance/eecp-client
# or
yarn add @digitaldefiance/eecp-client
```

## Key Classes

### EECPClient

Main client class for connecting to EECP workspaces.

```typescript
import { EECPClient } from '@digitaldefiance/eecp-client';

const client = new EECPClient({
  serverUrl: 'wss://your-server.com',
  workspaceId: 'workspace-id',
  participantKey: 'participant-key',
});

// Connect to workspace
await client.connect();

// Insert text
await client.insert(0, 'Hello, world!');

// Delete text
await client.delete(7, 6);

// Get current text
const text = client.getText();

// Disconnect
await client.disconnect();
```

### ClientKeyManager

Manages cryptographic keys with IndexedDB persistence.

```typescript
import { ClientKeyManager } from '@digitaldefiance/eecp-client';

const keyManager = new ClientKeyManager();

// Initialize with workspace credentials
await keyManager.initialize(workspaceId, masterKey);

// Keys are automatically stored in IndexedDB
// and retrieved on subsequent sessions

// Get current temporal key
const currentKey = await keyManager.getCurrentKey();

// Clear all keys
await keyManager.clearKeys();
```

### CollaborativeEditor

High-level editor interface with change notifications.

```typescript
import { CollaborativeEditor } from '@digitaldefiance/eecp-client';

const editor = new CollaborativeEditor(client);

// Subscribe to changes
const unsubscribe = editor.onChange((text) => {
  console.log('Document updated:', text);
});

// Insert text
await editor.insert(0, 'Hello');

// Delete text
await editor.delete(0, 5);

// Unsubscribe
unsubscribe();
```

## React Hooks

### useWorkspace

Hook for managing workspace connection.

```typescript
import { useWorkspace } from '@digitaldefiance/eecp-client';

function MyComponent() {
  const {
    client,
    connected,
    error,
    connect,
    disconnect,
  } = useWorkspace({
    serverUrl: 'wss://your-server.com',
    workspaceId: 'workspace-id',
    participantKey: 'participant-key',
  });

  return (
    <div>
      {connected ? (
        <button onClick={disconnect}>Disconnect</button>
      ) : (
        <button onClick={connect}>Connect</button>
      )}
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

### useCollaboration

Hook for collaborative editing with real-time updates.

```typescript
import { useCollaboration } from '@digitaldefiance/eecp-client';

function CollaborativeTextEditor() {
  const {
    text,
    insert,
    deleteText,
    connected,
  } = useCollaboration({
    serverUrl: 'wss://your-server.com',
    workspaceId: 'workspace-id',
    participantKey: 'participant-key',
  });

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    // Calculate diff and apply operations
    // (simplified example)
    if (newText.length > text.length) {
      insert(text.length, newText.slice(text.length));
    } else if (newText.length < text.length) {
      deleteText(newText.length, text.length - newText.length);
    }
  };

  return (
    <textarea
      value={text}
      onChange={handleChange}
      disabled={!connected}
    />
  );
}
```

## Complete Example

```typescript
import React, { useEffect } from 'react';
import { useCollaboration } from '@digitaldefiance/eecp-client';

function App() {
  const {
    text,
    insert,
    deleteText,
    connected,
    error,
    participants,
  } = useCollaboration({
    serverUrl: 'wss://localhost:3000',
    workspaceId: 'my-workspace',
    participantKey: 'my-key',
    autoConnect: true,
  });

  return (
    <div>
      <h1>Collaborative Editor</h1>
      
      <div>
        Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>
      
      {error && <div>Error: {error.message}</div>}
      
      <div>
        Participants: {participants.length}
      </div>
      
      <textarea
        value={text}
        onChange={(e) => {
          // Handle text changes
          const newText = e.target.value;
          // Apply diff as operations
        }}
        disabled={!connected}
        style={{ width: '100%', height: '400px' }}
      />
    </div>
  );
}
```

## IndexedDB Storage

The client automatically stores keys in IndexedDB for persistence across sessions:

- **Database**: `eecp-client`
- **Store**: `keys`
- **Keys stored**: Master key, temporal keys, workspace metadata

Keys are automatically loaded on reconnection, enabling seamless session recovery.

## Automatic Reconnection

The client includes exponential backoff for automatic reconnection:

- Initial retry: 1 second
- Maximum retry: 30 seconds
- Exponential backoff with jitter
- Automatic state recovery after reconnection

## Testing

The package includes 150+ tests covering:

- WebSocket connection management
- Key storage and retrieval
- Collaborative editing operations
- React hooks behavior
- Reconnection logic
- Error handling

Run tests:

```bash
npm test
# or
yarn test
```

## Technology Stack

- **TypeScript** - Type-safe implementation
- **React 19** - Modern React with hooks
- **WebSocket** - Real-time communication
- **IndexedDB** - Client-side key storage

## Related Packages

- [@digitaldefiance/eecp-protocol](../eecp-protocol) - Protocol definitions
- [@digitaldefiance/eecp-crypto](../eecp-crypto) - Cryptographic primitives
- [@digitaldefiance/eecp-crdt](../eecp-crdt) - CRDT implementation
- [@digitaldefiance/eecp-server](../eecp-server) - Server implementation

## License

MIT
