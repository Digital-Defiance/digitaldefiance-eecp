# @digitaldefiance/eecp-server

Express + WebSocket server for zero-knowledge operation routing. Manages workspace lifecycle, participant authentication, encrypted operation broadcasting, rate limiting, and temporal cleanup with Prometheus metrics.

## Features

- **REST API** for workspace creation, extension, and revocation
- **WebSocket server** for real-time operation streaming
- **Zero-knowledge participant authentication**
- **Operation routing and buffering** for offline participants
- **Rate limiting, audit logging, and Prometheus metrics**

## Installation

```bash
npm install @digitaldefiance/eecp-server
# or
yarn add @digitaldefiance/eecp-server
```

## Quick Start

```typescript
import { EECPServer } from '@digitaldefiance/eecp-server';

const server = new EECPServer({
  port: 3000,
  host: '0.0.0.0',
  corsOrigins: ['http://localhost:5173'],
  maxWorkspaceDuration: 24 * 60 * 60 * 1000, // 24 hours
  enableMetrics: true,
});

await server.start();
console.log('EECP Server running on port 3000');
```

## REST API Endpoints

### Create Workspace

```http
POST /api/workspaces
Content-Type: application/json

{
  "duration": 3600000,
  "maxParticipants": 10
}

Response:
{
  "workspaceId": "550e8400-e29b-41d4-a716-446655440000",
  "masterKey": "base64-encoded-key",
  "expiresAt": "2026-01-01T12:00:00.000Z"
}
```

### Extend Workspace

```http
POST /api/workspaces/:workspaceId/extend
Content-Type: application/json

{
  "additionalDuration": 3600000,
  "masterKey": "base64-encoded-key"
}

Response:
{
  "newExpiresAt": "2026-01-01T13:00:00.000Z"
}
```

### Revoke Workspace

```http
DELETE /api/workspaces/:workspaceId
Content-Type: application/json

{
  "masterKey": "base64-encoded-key"
}

Response:
{
  "success": true
}
```

### Get Workspace Info

```http
GET /api/workspaces/:workspaceId

Response:
{
  "workspaceId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2026-01-01T12:00:00.000Z",
  "participantCount": 3,
  "maxParticipants": 10,
  "createdAt": "2026-01-01T11:00:00.000Z"
}
```

### Health Check

```http
GET /health

Response:
{
  "status": "healthy",
  "uptime": 3600,
  "workspaces": 5,
  "connections": 12
}
```

## WebSocket Protocol

### Connection

```typescript
const ws = new WebSocket('ws://localhost:3000');

// Send authentication
ws.send(JSON.stringify({
  type: 'auth',
  workspaceId: 'workspace-id',
  participantId: 'participant-id',
  signature: 'ecdsa-signature',
  publicKey: 'participant-public-key',
}));
```

### Message Types

#### Operation Message

```typescript
{
  type: 'operation',
  workspaceId: 'workspace-id',
  operation: {
    id: 'operation-id',
    participantId: 'participant-id',
    timestamp: 1234567890,
    encryptedContent: Uint8Array,
    timeWindow: {
      start: 1234567890,
      end: 1234571490,
    },
  },
}
```

#### Sync Request

```typescript
{
  type: 'sync',
  workspaceId: 'workspace-id',
  since: 1234567890, // timestamp
}
```

#### Participant Joined

```typescript
{
  type: 'participant-joined',
  workspaceId: 'workspace-id',
  participantId: 'participant-id',
}
```

#### Participant Left

```typescript
{
  type: 'participant-left',
  workspaceId: 'workspace-id',
  participantId: 'participant-id',
}
```

## Configuration Options

```typescript
interface EECPServerConfig {
  // Server settings
  port?: number; // Default: 3000
  host?: string; // Default: '0.0.0.0'
  
  // CORS settings
  corsOrigins?: string[]; // Default: ['*']
  
  // Workspace settings
  maxWorkspaceDuration?: number; // Default: 24 hours
  defaultWorkspaceDuration?: number; // Default: 1 hour
  maxParticipants?: number; // Default: 100
  
  // Rate limiting
  rateLimit?: {
    windowMs: number; // Default: 60000 (1 minute)
    maxRequests: number; // Default: 100
  };
  
  // Metrics
  enableMetrics?: boolean; // Default: true
  metricsPort?: number; // Default: 9090
  
  // Logging
  logLevel?: 'debug' | 'info' | 'warn' | 'error'; // Default: 'info'
  enableAuditLog?: boolean; // Default: true
}
```

## Prometheus Metrics

The server exposes Prometheus metrics on `/metrics` (default port 9090):

- `eecp_workspaces_total` - Total number of workspaces
- `eecp_workspaces_active` - Currently active workspaces
- `eecp_participants_total` - Total number of participants
- `eecp_participants_connected` - Currently connected participants
- `eecp_operations_total` - Total operations processed
- `eecp_operations_rate` - Operations per second
- `eecp_websocket_connections` - Active WebSocket connections
- `eecp_http_requests_total` - Total HTTP requests
- `eecp_http_request_duration_seconds` - HTTP request duration

## Zero-Knowledge Architecture

The server implements zero-knowledge operation routing:

1. **No plaintext access**: Server never sees unencrypted content
2. **Participant authentication**: ECDSA signatures verify identity without revealing keys
3. **Operation routing**: Server routes encrypted operations without decryption
4. **Temporal cleanup**: Expired workspaces are automatically deleted
5. **Audit logging**: All operations logged without exposing content

## Rate Limiting

Built-in rate limiting protects against abuse:

- Per-IP rate limiting for REST API
- Per-participant rate limiting for WebSocket operations
- Configurable windows and thresholds
- Automatic cleanup of rate limit data

## Testing

The package includes 200+ tests covering:

- REST API endpoints
- WebSocket protocol
- Workspace lifecycle
- Participant authentication
- Operation routing
- Rate limiting
- Metrics collection
- Error handling

Run tests:

```bash
npm test
# or
yarn test
```

## Deployment Example

```typescript
import { EECPServer } from '@digitaldefiance/eecp-server';

const server = new EECPServer({
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
  maxWorkspaceDuration: 24 * 60 * 60 * 1000,
  enableMetrics: true,
  metricsPort: 9090,
  logLevel: 'info',
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
  },
});

await server.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await server.stop();
  process.exit(0);
});
```

## Technology Stack

- **Express 5** - HTTP server framework
- **WebSocket** - Real-time communication
- **Node.js** - Runtime environment
- **Prometheus** - Metrics and monitoring

## Related Packages

- [@digitaldefiance/eecp-protocol](../eecp-protocol) - Protocol definitions
- [@digitaldefiance/eecp-crypto](../eecp-crypto) - Cryptographic primitives
- [@digitaldefiance/eecp-crdt](../eecp-crdt) - CRDT implementation
- [@digitaldefiance/eecp-client](../eecp-client) - Browser client

## License

MIT
