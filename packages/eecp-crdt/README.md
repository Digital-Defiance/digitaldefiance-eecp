# @digitaldefiance/eecp-crdt

Encrypted conflict-free replicated data types for collaborative editing. Built on Yjs for deterministic conflict resolution with encrypted content payloads, operation encryption/decryption, and temporal garbage collection.

## Features

- **Yjs-based text CRDT** with encrypted operations
- **Insert, delete, and format operations** with encryption
- **Deterministic conflict resolution** for concurrent edits
- **Operation encryption** with temporal keys
- **Temporal garbage collection** for expired operations

## Installation

```bash
npm install @digitaldefiance/eecp-crdt
# or
yarn add @digitaldefiance/eecp-crdt
```

## Key Classes

### EncryptedTextCRDT

The main CRDT implementation that wraps Yjs with encryption capabilities.

```typescript
import { EncryptedTextCRDT } from '@digitaldefiance/eecp-crdt';

const crdt = new EncryptedTextCRDT();

// Insert text at position
crdt.insert(0, 'Hello, world!');

// Delete text
crdt.delete(7, 6); // Removes "world!"

// Get current text
const text = crdt.getText();
```

### OperationEncryptor

Handles encryption and decryption of CRDT operations using temporal keys.

```typescript
import { OperationEncryptor } from '@digitaldefiance/eecp-crdt';

const encryptor = new OperationEncryptor(temporalKeyManager);

// Encrypt an operation
const encryptedOp = await encryptor.encryptOperation(operation, timeWindow);

// Decrypt an operation
const decryptedOp = await encryptor.decryptOperation(encryptedOp);
```

### CRDTSyncEngine

Manages synchronization of CRDT state between participants.

```typescript
import { CRDTSyncEngine } from '@digitaldefiance/eecp-crdt';

const syncEngine = new CRDTSyncEngine(crdt);

// Apply remote operation
syncEngine.applyRemoteOperation(encryptedOperation);

// Get local operations to send
const localOps = syncEngine.getLocalOperations();
```

### TemporalGarbageCollector

Automatically removes expired operations based on temporal key lifecycle.

```typescript
import { TemporalGarbageCollector } from '@digitaldefiance/eecp-crdt';

const gc = new TemporalGarbageCollector(crdt, keyManager);

// Start automatic cleanup
gc.start();

// Manually trigger cleanup
await gc.collectExpiredOperations();

// Stop cleanup
gc.stop();
```

## Usage Example

```typescript
import {
  EncryptedTextCRDT,
  OperationEncryptor,
  CRDTSyncEngine,
} from '@digitaldefiance/eecp-crdt';
import { TemporalKeyManager } from '@digitaldefiance/eecp-crypto';

// Initialize components
const keyManager = new TemporalKeyManager(/* ... */);
const crdt = new EncryptedTextCRDT();
const encryptor = new OperationEncryptor(keyManager);
const syncEngine = new CRDTSyncEngine(crdt);

// Local edit
crdt.insert(0, 'Hello');

// Get and encrypt local operations
const localOps = syncEngine.getLocalOperations();
const encryptedOps = await Promise.all(
  localOps.map(op => encryptor.encryptOperation(op, currentTimeWindow))
);

// Send encryptedOps to other participants...

// Receive and apply remote operations
const remoteEncryptedOp = /* ... received from network ... */;
const decryptedOp = await encryptor.decryptOperation(remoteEncryptedOp);
syncEngine.applyRemoteOperation(decryptedOp);

// Get current text
console.log(crdt.getText());
```

## Testing

The package includes 50+ tests covering:

- CRDT operations (insert, delete, format)
- Concurrent editing scenarios
- Conflict resolution
- Operation encryption/decryption
- Garbage collection

Run tests:

```bash
npm test
# or
yarn test
```

## Technology Stack

- **TypeScript** - Type-safe implementation
- **Yjs** - CRDT foundation for conflict resolution
- **CRDT** - Conflict-free replicated data types
- **Encryption** - Temporal key-based operation encryption

## Related Packages

- [@digitaldefiance/eecp-protocol](../eecp-protocol) - Protocol definitions
- [@digitaldefiance/eecp-crypto](../eecp-crypto) - Cryptographic primitives
- [@digitaldefiance/eecp-client](../eecp-client) - Browser client
- [@digitaldefiance/eecp-server](../eecp-server) - Server implementation

## License

MIT
