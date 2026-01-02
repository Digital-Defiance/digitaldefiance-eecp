# @digitaldefiance/eecp-crypto

Temporal key management and encryption primitives for EECP (Ephemeral Encrypted Collaboration Protocol).

## Overview

This package implements the cryptographic foundation of EECP, providing HKDF key derivation, AES-256-GCM encryption, ECIES multi-recipient encryption, zero-knowledge authentication, and cryptographic commitments for provable key deletion. Extensively tested with 100+ property-based tests.

## Features

- **Temporal Key Derivation**: HKDF-SHA256 for time-bound key generation
- **Time-Locked Encryption**: AES-256-GCM with temporal key binding
- **Multi-Recipient Encryption**: ECIES using @digitaldefiance/ecies-lib
- **Zero-Knowledge Authentication**: ECDSA-based participant authentication
- **Cryptographic Commitments**: Provable key deletion guarantees

## Installation

```bash
npm install @digitaldefiance/eecp-crypto
# or
yarn add @digitaldefiance/eecp-crypto
```

## Usage

### Temporal Key Derivation

```typescript
import { TemporalKeyDerivation } from '@digitaldefiance/eecp-crypto';

const keyDerivation = new TemporalKeyDerivation();

// Derive a temporal key
const temporalKey = await keyDerivation.deriveKey(
  workspaceSecret,
  timeWindow,
  keyId
);

// Get current key ID based on time
const currentKeyId = keyDerivation.getCurrentKeyId(
  timeWindow.startTime,
  Date.now(),
  timeWindow.rotationInterval
);
```

### Time-Locked Encryption

```typescript
import { TimeLockedEncryption } from '@digitaldefiance/eecp-crypto';

const encryption = new TimeLockedEncryption();

// Encrypt data
const encrypted = await encryption.encrypt(
  Buffer.from('sensitive data'),
  temporalKey
);

// Decrypt data
const decrypted = await encryption.decrypt(
  encrypted,
  temporalKey
);
```

### Multi-Recipient Encryption

```typescript
import { MultiRecipientEncryption } from '@digitaldefiance/eecp-crypto';
import { Member, MemberType, EmailString, eciesService } from '@digitaldefiance/ecies-lib';

const multiRecipient = new MultiRecipientEncryption();

// Create participants
const participants = [
  Member.newMember(eciesService, MemberType.User, 'Alice', new EmailString('alice@example.com')),
  Member.newMember(eciesService, MemberType.User, 'Bob', new EmailString('bob@example.com')),
];

// Encrypt for multiple recipients
const encrypted = await multiRecipient.encrypt(
  Buffer.from('shared secret'),
  participants.map(p => p.member.publicKey)
);

// Each recipient can decrypt with their private key
const decrypted = await multiRecipient.decrypt(
  encrypted,
  participants[0].member.privateKey
);
```

### Zero-Knowledge Authentication

```typescript
import { ParticipantAuth } from '@digitaldefiance/eecp-crypto';

const auth = new ParticipantAuth();

// Generate authentication proof
const proof = await auth.generateProof(
  participantPrivateKey,
  challenge
);

// Verify proof (server-side)
const isValid = await auth.verifyProof(
  participantPublicKey,
  challenge,
  proof
);
```

### Cryptographic Commitments

```typescript
import { CommitmentScheme } from '@digitaldefiance/eecp-crypto';

const commitment = new CommitmentScheme();

// Create commitment to a key
const { commitment: commitmentValue, opening } = await commitment.commit(
  temporalKey.key
);

// Later, prove the key was deleted by revealing the opening
const isValid = await commitment.verify(
  commitmentValue,
  temporalKey.key,
  opening
);
```

## Key Classes

### TemporalKeyDerivation

Derives time-bound encryption keys using HKDF-SHA256:
- `deriveKey(secret, timeWindow, keyId)`: Derive a temporal key
- `getCurrentKeyId(startTime, currentTime, interval)`: Get current key ID
- `getKeyIdForTimestamp(startTime, timestamp, interval)`: Get key ID for specific time

### TimeLockedEncryption

Encrypts data with temporal keys using AES-256-GCM:
- `encrypt(plaintext, temporalKey)`: Encrypt data
- `decrypt(encrypted, temporalKey)`: Decrypt data
- Uses authenticated encryption with 96-bit nonces and 128-bit auth tags

### MultiRecipientEncryption

Encrypts data for multiple recipients using ECIES:
- `encrypt(data, recipientPublicKeys)`: Encrypt for multiple recipients
- `decrypt(encrypted, recipientPrivateKey)`: Decrypt with private key
- Each recipient gets their own encrypted copy of the symmetric key

### ParticipantAuth

Zero-knowledge authentication using ECDSA:
- `generateProof(privateKey, challenge)`: Create authentication proof
- `verifyProof(publicKey, challenge, proof)`: Verify authentication proof
- Server never learns the participant's private key

### CommitmentScheme

Cryptographic commitments for provable key deletion:
- `commit(value)`: Create a commitment
- `verify(commitment, value, opening)`: Verify a commitment
- Enables proving that keys were destroyed as scheduled

## Security Properties

- **Forward Secrecy**: Past keys cannot decrypt future content
- **Temporal Isolation**: Each time window has independent keys
- **Zero-Knowledge**: Server never sees plaintext or keys
- **Provable Deletion**: Cryptographic proof of key destruction
- **Multi-Recipient**: Efficient encryption for multiple participants

## Testing

This package includes 100+ property-based tests using fast-check to verify cryptographic properties across a wide range of inputs.

```bash
npm test
```

## License

MIT

## Repository

https://github.com/Digital-Defiance/digitaldefiance-eecp
