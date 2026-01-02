# Ephemeral Encrypted Collaboration Protocol (EECP)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Nx](https://img.shields.io/badge/Nx-22.1-blue.svg)](https://nx.dev)

A zero-knowledge, self-destructing collaborative workspace system that enables real-time document collaboration with cryptographic guarantees of content unreadability after expiration.

## 🔐 Overview

EECP is a distributed system that provides **ephemeral collaborative editing** with strong cryptographic guarantees. The system ensures that:

- **Zero-Knowledge Server**: The server routes encrypted operations without ever seeing plaintext content
- **Temporal Encryption**: Time-bound keys are automatically destroyed on a predetermined schedule
- **Encrypted CRDT**: Conflict-free replicated data types with encrypted content payloads
- **Provable Deletion**: Cryptographic commitments prove that keys were destroyed

### Key Features

✨ **Ephemeral Workspaces** - Create time-limited collaborative spaces (5-120 minutes)  
🔒 **End-to-End Encryption** - All content encrypted with temporal keys  
🚫 **Zero-Knowledge Server** - Server never sees plaintext content  
⏰ **Automatic Key Rotation** - Keys rotate and expire automatically  
🤝 **Real-Time Collaboration** - CRDT-based conflict-free editing  
🔑 **Multi-Recipient Encryption** - Secure key distribution using ECIES  
📝 **Rich Text Editing** - Browser-based editor with formatting  
💻 **CLI Support** - Command-line interface for automation  
🔍 **Audit Trail** - Encrypted audit logs for compliance  
📊 **Monitoring** - Prometheus metrics and health checks

## 🏗️ Architecture

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

### Package Structure

This is an Nx monorepo containing the following packages:

- **`eecp-protocol`** - Core types and protocol definitions
- **`eecp-crypto`** - Temporal key management and encryption primitives
- **`eecp-crdt`** - Encrypted CRDT implementation using Yjs
- **`eecp-server`** - Express + WebSocket server for operation routing
- **`eecp-client`** - Browser client library with React hooks
- **`eecp-cli`** - Command-line interface for testing and automation
- **`eecp-demo`** - Reference web application

## 🚀 Quick Start

### Prerequisites

- Node.js 20.x or higher
- Yarn 4.x (included via Corepack)

### Installation

```bash
# Clone the repository
git clone https://github.com/digital-defiance/digitaldefiance-eecp.git
cd digitaldefiance-eecp

# Install dependencies
yarn install

# Build all packages
npx nx run-many -t build
```

### Running the Server

```bash
# Start the EECP server
npx nx serve eecp-server

# Server will start on http://localhost:3000
```

### Running the Demo Application

```bash
# Start the demo web application
npx nx serve eecp-demo

# Demo will be available at http://localhost:4200
```

### Using the CLI

```bash
# Build the CLI
npx nx build eecp-cli

# Create a new workspace
node packages/eecp-cli/dist/main.js create --duration 30

# Join an existing workspace
node packages/eecp-cli/dist/main.js join <workspace-id> <workspace-key>
```

## 📖 Usage

### Creating a Workspace

```typescript
import { EECPClient } from '@digitaldefiance/eecp-client';

const client = new EECPClient('ws://localhost:3000');
await client.connect();

const workspace = await client.createWorkspace({
  durationMinutes: 30,
  rotationInterval: 15,
  maxParticipants: 50
});

console.log('Workspace ID:', workspace.id);
console.log('Share link:', workspace.shareLink);
```

### Joining a Workspace

```typescript
const workspace = await client.joinWorkspace(
  workspaceId,
  workspaceKey
);

const editor = workspace.getEditor();

// Insert text
editor.insert(0, 'Hello, world!');

// Listen for changes
editor.onChange((text) => {
  console.log('Document updated:', text);
});
```

### React Integration

```typescript
import { useWorkspace, useCollaboration } from '@digitaldefiance/eecp-client';

function CollaborativeEditor() {
  const { workspace, loading, error } = useWorkspace(
    'ws://localhost:3000',
    workspaceId,
    workspaceKey
  );

  const { text, insert, delete: deleteText, participants } = useCollaboration(workspace);

  if (loading) return <div>Connecting...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <textarea value={text} onChange={(e) => {
        // Handle text changes
      }} />
      <div>Participants: {participants.length}</div>
    </div>
  );
}
```

## 🔒 Security Model

### Threat Model

EECP is designed to protect against:

- **Honest-but-curious server**: Server operators cannot read workspace content
- **Network eavesdropping**: All communication is encrypted
- **Post-expiration access**: Content becomes cryptographically unreadable after expiration
- **Unauthorized participants**: Zero-knowledge authentication prevents impersonation

### Cryptographic Primitives

- **Temporal Key Derivation**: HKDF-SHA256 for deterministic key generation
- **Content Encryption**: AES-256-GCM for authenticated encryption
- **Multi-Recipient Encryption**: ECIES for secure key distribution
- **Authentication**: ECDSA signatures for zero-knowledge proofs
- **Commitments**: SHA-256 for provable key deletion

### Key Rotation

Keys rotate automatically based on the configured interval (5, 15, 30, or 60 minutes). Old keys are retained for one grace period to handle clock skew, then securely destroyed.

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npx nx run-many -t test

# Run tests for a specific package
npx nx test eecp-crypto

# Run property-based tests
npx nx test eecp-crypto --testPathPattern=property

# Run integration tests
npx nx test eecp-server-e2e
```

### Test Coverage

The project includes:

- **Unit Tests**: Testing individual components and functions
- **Property-Based Tests**: Using fast-check for universal properties
- **Integration Tests**: End-to-end workflow testing
- **Load Tests**: Performance testing with 50+ concurrent participants

### Property-Based Testing

EECP uses property-based testing to verify correctness properties:

```typescript
// Example: Round-trip encryption property
fc.assert(
  fc.property(fc.uint8Array(), async (data) => {
    const encrypted = await encryption.encrypt(data, temporalKey);
    const decrypted = await encryption.decrypt(encrypted, temporalKey);
    expect(decrypted).toEqual(data);
  }),
  { numRuns: 100 }
);
```

## 📊 Monitoring

### Prometheus Metrics

The server exposes Prometheus metrics at `/metrics`:

- `eecp_workspaces_total` - Total number of active workspaces
- `eecp_participants_total` - Total number of connected participants
- `eecp_operations_total` - Total number of operations processed
- `eecp_operation_latency_seconds` - Operation processing latency
- `eecp_workspace_expirations_total` - Total number of expired workspaces

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "workspaces": 5,
  "participants": 12
}
```

## 🔧 Configuration

### Server Configuration

```typescript
const server = new EECPServer({
  port: 3000,
  host: '0.0.0.0',
  
  // Rate limiting
  operationRateLimit: 100, // ops/sec per participant
  workspaceCreationLimit: 10, // per hour per IP
  maxParticipantsPerWorkspace: 50,
  
  // Temporal settings
  defaultRotationInterval: 15, // minutes
  gracePeriod: 60000, // 1 minute in ms
  cleanupInterval: 60000, // 1 minute in ms
  
  // Monitoring
  enableMetrics: true,
  enableAuditLog: true
});
```

### Client Configuration

```typescript
const client = new EECPClient('ws://localhost:3000', {
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  reconnectBackoff: 2.0,
  
  // Key management
  keyStorageType: 'indexeddb', // or 'memory'
  keyRetentionPeriod: 3600000, // 1 hour in ms
});
```

## 🛠️ Development

### Project Structure

```
digitaldefiance-eecp/
├── packages/
│   ├── eecp-protocol/      # Core types and interfaces
│   ├── eecp-crypto/        # Cryptographic primitives
│   ├── eecp-crdt/          # CRDT implementation
│   ├── eecp-server/        # WebSocket server
│   ├── eecp-client/        # Browser client
│   ├── eecp-cli/           # Command-line interface
|   ├── eecp-browser/       # Browser demo server/client components
│   └── eecp-demo/          # Demo application
├── .kiro/
│   └── specs/
│       └── eecp-full-system/  # Requirements and design docs
├── nx.json                 # Nx configuration
├── package.json            # Root package.json
└── tsconfig.base.json      # TypeScript configuration
```

### Building

```bash
# Build all packages
npx nx run-many -t build

# Build a specific package
npx nx build eecp-server

# Build with dependencies
npx nx build eecp-demo --with-deps
```

### Linting

```bash
# Lint all packages
npx nx run-many -t lint

# Lint a specific package
npx nx lint eecp-client

# Auto-fix linting issues
npx nx lint eecp-client --fix
```

### Code Generation

```bash
# Generate a new library
npx nx g @nx/js:lib packages/my-lib --publishable --importPath=@digitaldefiance/my-lib

# Generate a new component
npx nx g @nx/react:component MyComponent --project=eecp-demo
```

## 📚 API Documentation

### Server API

#### REST Endpoints

**POST /workspaces** - Create a new workspace
```json
{
  "durationMinutes": 30,
  "rotationInterval": 15,
  "maxParticipants": 50
}
```

**GET /workspaces/:id** - Get workspace information

**POST /workspaces/:id/extend** - Extend workspace expiration
```json
{
  "additionalMinutes": 15
}
```

**DELETE /workspaces/:id** - Revoke workspace early

**GET /health** - Health check endpoint

**GET /metrics** - Prometheus metrics

#### WebSocket Protocol

**Handshake**
```json
{
  "type": "handshake",
  "payload": {
    "protocolVersion": "1.0",
    "workspaceId": "uuid",
    "participantId": "uuid",
    "publicKey": "base64",
    "proof": { "signature": "base64", "timestamp": 1234567890 }
  }
}
```

**Operation**
```json
{
  "type": "operation",
  "payload": {
    "operation": {
      "id": "uuid",
      "workspaceId": "uuid",
      "participantId": "uuid",
      "timestamp": 1234567890,
      "position": 0,
      "operationType": "insert",
      "encryptedContent": "base64",
      "signature": "base64"
    }
  }
}
```

### Client API

See individual package READMEs for detailed API documentation:

- [eecp-client](packages/eecp-client/README.md)
- [eecp-crypto](packages/eecp-crypto/README.md)
- [eecp-crdt](packages/eecp-crdt/README.md)
- [eecp-protocol](packages/eecp-protocol/README.md)

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Workflow

1. Make your changes
2. Run tests: `npx nx run-many -t test`
3. Run linting: `npx nx run-many -t lint`
4. Build: `npx nx run-many -t build`
5. Submit PR

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Nx](https://nx.dev) - Smart Monorepos · Fast CI
- Uses [Yjs](https://yjs.dev) for CRDT implementation
- Encryption powered by [@digitaldefiance/ecies-lib](https://github.com/digital-defiance/digitaldefiance-eecp)
- WebSocket server built with [Express](https://expressjs.com) and [ws](https://github.com/websockets/ws)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/digital-defiance/digitaldefiance-eecp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/digital-defiance/digitaldefiance-eecp/discussions)
- **Email**: support@digitaldefiance.org

## 🗺️ Roadmap

- [ ] Browser-compatible server for StackBlitz demos
- [ ] Mobile client support (React Native)
- [ ] File attachment support
- [ ] Voice/video chat integration
- [ ] Blockchain-based commitment verification
- [ ] Kubernetes deployment templates
- [ ] Docker compose setup
- [ ] Performance optimizations for 100+ participants

## 📖 Documentation

For detailed documentation, see:

- [Requirements Document](.kiro/specs/eecp-full-system/requirements.md)
- [Design Document](.kiro/specs/eecp-full-system/design.md)
- [Implementation Tasks](.kiro/specs/eecp-full-system/tasks.md)

## 🔬 Research

EECP is based on research in:

- Conflict-free Replicated Data Types (CRDTs)
- Zero-knowledge authentication protocols
- Temporal encryption and key management
- Secure multi-party computation

## ⚠️ Security Considerations

### Known Limitations

- **Clock Skew**: System relies on synchronized clocks; grace period mitigates this
- **Memory Attacks**: Keys in memory could be extracted by privileged processes
- **Side Channels**: Timing attacks may leak information about operation patterns
- **Denial of Service**: Rate limiting provides basic protection but not DDoS-proof

### Security Audits

This project has not yet undergone a formal security audit. Use in production at your own risk.

### Reporting Security Issues

Please report security vulnerabilities to security@digitaldefiance.org. Do not open public issues for security concerns.

## 🌟 Star History

If you find this project useful, please consider giving it a star on GitHub!

---

**Made with ❤️ by [Digital Defiance](https://digitaldefiance.org)**
