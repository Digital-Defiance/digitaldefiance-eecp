---
title: "EECP Architecture & Cryptographic Foundations"
parent: "Architecture & Design"
nav_order: 1
permalink: /docs/architecture/eecp/
---
# Ephemeral Encrypted Collaboration Protocol (EECP) — Architecture & Cryptographic Foundations

## Overview

EECP is a zero-knowledge, self-destructing collaborative workspace system. It enables real-time document collaboration with cryptographic guarantees that content becomes permanently unreadable after expiration. The server never sees plaintext — it routes opaque encrypted operations between participants who hold the only keys, and those keys are deterministically destroyed on schedule.

### Core Invariants

1. **Zero-Knowledge Server** — The server routes encrypted operations without ever accessing plaintext content.
2. **Temporal Encryption** — Time-bound keys are derived deterministically and destroyed automatically.
3. **Encrypted CRDT** — Conflict-free replicated data types operate over encrypted payloads, providing eventual consistency without trust.
4. **Provable Deletion** — Cryptographic commitments prove that keys were destroyed, making content recovery mathematically impossible.
5. **Multi-Recipient Key Distribution** — ECIES-based encryption distributes temporal keys to all participants without a trusted intermediary.

### Threat Model

EECP protects against:

- **Honest-but-curious server operators** — Server never holds decryption keys or plaintext.
- **Network eavesdroppers** — All operations are encrypted with AES-256-GCM before transmission.
- **Post-expiration access** — Temporal keys are destroyed; commitment scheme proves destruction.
- **Impersonation** — Zero-knowledge challenge-response authentication via ECDSA signatures.

### Known Limitations

- **Clock skew** — Mitigated by grace periods on key validity windows.
- **Memory attacks** — Keys in JS memory could theoretically be extracted by privileged processes.
- **Side channels** — Timing patterns of operations may leak metadata (not content).
- **No formal audit** — The system has not undergone external security review.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Participants                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Browser     │  │   Browser     │  │     CLI      │          │
│  │   Client      │  │   Client      │  │   Client     │          │
│  └──────┬────────┘  └──────┬────────┘  └──────┬────────┘          │
│         │                  │                   │                  │
│    Encrypted Ops      Encrypted Ops       Encrypted Ops          │
│         └──────────────────┼───────────────────┘                  │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │ WebSocket (wss://)
                    ┌────────▼─────────┐
                    │   EECP Server     │
                    │  (Zero-Knowledge) │
                    │                   │
                    │  ┌─────────────┐  │
                    │  │  Operation   │  │
                    │  │  Router      │  │
                    │  └─────────────┘  │
                    │  ┌─────────────┐  │
                    │  │  Workspace   │  │
                    │  │  Manager     │  │
                    │  └─────────────┘  │
                    │  ┌─────────────┐  │
                    │  │  Temporal    │  │
                    │  │  Cleanup     │  │
                    │  └─────────────┘  │
                    └──────────────────┘
```

### Package Structure

The system is an Nx monorepo with the following packages:

| Package | Purpose |
|---------|---------|
| `eecp-protocol` | Core types, interfaces, and WebSocket message definitions |
| `eecp-crypto` | Temporal key derivation, AES-256-GCM encryption, commitment scheme, ECIES multi-recipient encryption, zero-knowledge authentication |
| `eecp-crdt` | Yjs-based encrypted CRDT, operation encryption/signing, sync engine, temporal garbage collection |
| `eecp-server` | Express + WebSocket server — workspace lifecycle, operation routing, cleanup |
| `eecp-client` | Browser client library with WebSocket reconnection, React hooks |
| `eecp-cli` | Command-line interface for workspace creation, joining, and testing |
| `eecp-browser` | Browser-compatible server and client for self-contained demos |

### Data Flow

```
Participant A                    Server                     Participant B
     │                             │                             │
     │  1. Create Workspace        │                             │
     │  ─────────────────────────► │                             │
     │  (duration, rotation, max)  │                             │
     │                             │                             │
     │  2. Workspace Created       │                             │
     │  ◄───────────────────────── │                             │
     │  (workspaceId, secret)      │                             │
     │                             │                             │
     │                             │  3. Join Workspace          │
     │                             │  ◄───────────────────────── │
     │                             │  (workspaceId, secret)      │
     │                             │                             │
     │  4. ZK Handshake            │  4. ZK Handshake            │
     │  ◄─────────────────────────►│◄─────────────────────────► │
     │  (challenge-response)       │  (challenge-response)       │
     │                             │                             │
     │  5. Local Edit              │                             │
     │  ┌─────────────────┐        │                             │
     │  │ CRDT.insert()   │        │                             │
     │  │ Encrypt(op, Kₜ) │        │                             │
     │  │ Sign(enc, sk)   │        │                             │
     │  └────────┬────────┘        │                             │
     │           │                 │                             │
     │  6. Send Encrypted Op       │                             │
     │  ─────────────────────────► │                             │
     │                             │  7. Broadcast Encrypted Op  │
     │                             │  ─────────────────────────► │
     │                             │                             │
     │                             │        ┌─────────────────┐  │
     │                             │        │ Verify(sig, pk) │  │
     │                             │        │ Decrypt(op, Kₜ) │  │
     │                             │        │ CRDT.apply(op)  │  │
     │                             │        └─────────────────┘  │
     │                             │                             │
     │  8. Key Rotation (automatic, every N minutes)             │
     │  ─────────────────────────────────────────────────────── │
     │  Old Kₜ destroyed, new Kₜ₊₁ derived from same secret    │
     │                             │                             │
     │  9. Workspace Expires       │                             │
     │  ─────────────────────────────────────────────────────── │
     │  All keys destroyed, commitments published, GC runs       │
```

---

## Pillar 1: Temporal Encryption

Temporal encryption is the foundation of EECP's ephemeral guarantee. Keys are deterministically derived, automatically rotated, and provably destroyed.

### 1.1 Key Derivation — HKDF-SHA256

Temporal keys are derived using HMAC-based Key Derivation Function (HKDF) as specified in RFC 5869, instantiated with SHA-256.

**Mathematical Definition:**

Given:
- `IKM` (Input Key Material) = workspace secret (32 bytes, shared among participants)
- `salt` = `keyId || startTime` (unique per rotation period)
- `info` = `"EECP-Temporal-Key-v1" || 0x01` (context string)

The derivation follows two steps:

```
Step 1 — HKDF-Extract:
  PRK = HMAC-SHA256(salt, IKM)

Step 2 — HKDF-Expand:
  OKM = HMAC-SHA256(PRK, info)[0..31]    (truncated to 32 bytes)
```

Where `OKM` is the 32-byte AES-256 key material.

**Properties:**
- **Deterministic** — Same inputs always produce the same key. All participants independently derive identical keys from the shared workspace secret.
- **Cryptographically independent** — Knowledge of key `Kₙ` provides no information about `Kₙ₊₁` or `Kₙ₋₁`.
- **Domain-separated** — The `info` string and `salt` construction ensure keys for different time windows and workspaces are independent.

### 1.2 Key Rotation Schedule

Keys rotate on a configurable interval (5, 15, 30, or 60 minutes). The rotation number for a given timestamp is:

```
rotationNumber = floor((timestamp - createdAt) / (rotationInterval × 60 × 1000))
keyId = "key-" + rotationNumber
```

Each key has three temporal phases:

```
|←── validFrom ──────── validUntil ──────── gracePeriodEnd ──►|
|        Active Period        |     Grace Period     |  Expired  |
|   Encrypt + Decrypt OK      |   Decrypt Only OK    |  Destroyed |
```

The grace period (configurable, default 5 minutes) accommodates clock skew between participants. During the grace period, the old key can still decrypt but new encryptions use the next key.

### 1.3 Authenticated Encryption — AES-256-GCM

Content encryption uses AES-256 in Galois/Counter Mode (GCM), providing both confidentiality and integrity (AEAD — Authenticated Encryption with Associated Data).

**Encryption:**

```
nonce ← random(12 bytes)                    // Fresh nonce per encryption
AAD   ← keyId || additionalData             // Binds ciphertext to key identity
(C, T) = AES-256-GCM.Encrypt(Kₜ, nonce, plaintext, AAD)
```

Where:
- `Kₜ` = 32-byte temporal key for the current rotation period
- `C` = ciphertext
- `T` = 16-byte authentication tag
- `nonce` = 12-byte random initialization vector (optimal for GCM)

**Decryption:**

```
plaintext = AES-256-GCM.Decrypt(Kₜ, nonce, C, T, AAD)
```

Decryption fails (throws) if the authentication tag doesn't verify, detecting any tampering with the ciphertext, AAD, or nonce.

**Wire Format:**

Encrypted content is serialized as a single buffer:
```
[nonce (12 bytes)][authTag (16 bytes)][ciphertext (variable)]
```

### 1.4 Secure Key Destruction

When a key's grace period expires, it is destroyed in memory:

```
1. Overwrite key buffer with cryptographically random bytes
2. Zero-fill the key buffer
3. (Best-effort in JavaScript — no guaranteed memory clearing)
```

After destruction, content encrypted with that key becomes permanently unreadable. The commitment scheme (Pillar 5) provides proof that destruction occurred.

---

## Pillar 2: Encrypted CRDT

EECP uses Conflict-free Replicated Data Types (CRDTs) for real-time collaborative editing. The CRDT layer is built on Yjs, a high-performance CRDT library, with all operations encrypted before leaving the client.

### 2.1 Yjs Foundation

The CRDT uses a `Y.Doc` with a `Y.Text` shared type named `'content'`. Yjs provides:

- **Strong eventual consistency** — All participants converge to the same document state regardless of operation order or network delays.
- **Commutativity** — `apply(op₁); apply(op₂)` = `apply(op₂); apply(op₁)`
- **Associativity** — `apply(apply(op₁, op₂), op₃)` = `apply(op₁, apply(op₂, op₃))`
- **Idempotence** — `apply(op); apply(op)` = `apply(op)`

### 2.2 Operation Model

Two operation types are supported:

**Insert:**
```typescript
{
  id: OperationId,          // GuidV4 — globally unique
  participantId: ParticipantId,
  timestamp: number,        // Unix ms
  type: 'insert',
  position: number,         // Zero-based character index
  content: string           // Text to insert
}
```

**Delete:**
```typescript
{
  id: OperationId,
  participantId: ParticipantId,
  timestamp: number,
  type: 'delete',
  position: number,
  length: number            // Characters to remove
}
```

Operations are applied locally first (optimistic update), then encrypted and broadcast. Delete operations are clamped to available content length to prevent errors.

### 2.3 Operation Encryption & Signing

Before transmission, each CRDT operation goes through the `OperationEncryptor`:

```
1. Serialize:  content_json = JSON.stringify({ content, length })
2. Encrypt:    (nonce, authTag, ciphertext) = AES-256-GCM(Kₜ, content_json)
3. Package:    encryptedContent = nonce || authTag || ciphertext
4. Sign:       message = opId || timestamp || position || opType || encryptedContent
               signature = ECDSA-SHA256(participantPrivateKey, message)
```

The signature covers all operation metadata AND the encrypted content, preventing:
- **ID substitution** — Cannot swap operation IDs
- **Timestamp manipulation** — Cannot alter ordering
- **Position tampering** — Cannot redirect edits
- **Content tampering** — Cannot modify encrypted payload
- **Type changes** — Cannot convert inserts to deletes

**Signature Verification** supports both PEM-formatted keys (Node.js `crypto`) and raw key bytes (`eciesService.verifyMessage`) for browser compatibility.

### 2.4 Sync Engine

The `CRDTSyncEngine` maintains an in-memory operation history indexed by `OperationId` for:

- **Duplicate detection** — Operations with the same ID are skipped (idempotent merge).
- **Deterministic ordering** — Operations sorted by `(timestamp, operationId)` for consistent replay.
- **Catch-up synchronization** — `getOperationsSince(timestamp)` returns all operations after a given point for reconnecting participants.

**Conflict Resolution:**

Yjs handles conflict resolution automatically through its CRDT algorithm. The sync engine provides deterministic ordering as a secondary guarantee:

```
if (op₁.timestamp ≠ op₂.timestamp):
    order by timestamp (ascending)
else:
    order by operationId (lexicographic)
```

### 2.5 State Synchronization

For participants joining mid-session:

```
1. Encode full Yjs document state:  state = Y.encodeStateAsUpdate(doc)
2. Encrypt state with current temporal key
3. Send to joining participant
4. Participant decrypts and applies:  Y.applyUpdate(doc, state)
```

Yjs's state encoding captures the complete document history in a compact binary format, enabling efficient full-sync without replaying individual operations.

### 2.6 Temporal Garbage Collection

The `TemporalGarbageCollector` removes expired operations from memory:

```
isExpired(op) = op.timestamp < expirationTime
validOps = operations.filter(op => !isExpired(op))
```

This runs when:
- A workspace approaches expiration
- Memory pressure requires cleanup
- Temporal keys are destroyed (operations become undecryptable anyway)

---

## Pillar 3: Zero-Knowledge Server

The server is architecturally prevented from accessing plaintext content. It handles workspace lifecycle, participant management, and encrypted operation routing.

### 3.1 Zero-Knowledge Authentication — Challenge-Response

Participants authenticate using a challenge-response protocol based on ECDSA signatures:

```
Server → Participant:  challenge = random(32 bytes)

Participant → Server:  proof = {
    signature: ECDSA-SHA256(privateKey, challenge || timestamp || participantId),
    timestamp: now()
}

Server verifies:
    1. |now() - proof.timestamp| < 60 seconds    (replay protection)
    2. ECDSA.Verify(publicKey, challenge || timestamp || participantId, signature) = true
```

**Zero-Knowledge Property:** The server learns that the participant holds the private key corresponding to the public key, but learns nothing about the private key itself. The challenge is random and single-use, preventing replay attacks.

### 3.2 WebSocket Protocol

The protocol defines typed messages for the WebSocket connection:

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `challenge` | Server → Client | Authentication challenge (32 random bytes) |
| `handshake` | Client → Server | Protocol version, workspace ID, participant ID, public key, ZK proof |
| `handshake_ack` | Server → Client | Confirmation with existing participants list |
| `operation` | Client → Server → Clients | Encrypted CRDT operation broadcast |
| `sync_request` | Client → Server | Request state from another participant |
| `sync_response` | Client → Client (via Server) | Encrypted Yjs state for full sync |
| `participant_joined` | Server → Clients | New participant notification |
| `participant_left` | Server → Clients | Participant departure notification |
| `error` | Server → Client | Error with code and message |

### 3.3 Operation Routing

The server's operation router:

1. Receives encrypted operation from sender
2. Validates message structure (but cannot read content)
3. Broadcasts to all other participants in the workspace
4. Never decrypts, never stores plaintext, never inspects content

### 3.4 Workspace Lifecycle

```
Create → Active → Expiring → Expired → Cleaned Up
  │         │         │          │           │
  │    participants    │     grace period     │
  │    join/leave      │     for stragglers   │
  │    ops routed      │                      │
  │                    │                      │
  └── duration: 5-120 min ──────────────────────┘
```

The `TemporalCleanupService` runs on a configurable interval (default 60s) and:
- Checks all workspaces for expiration
- Destroys temporal keys for expired workspaces
- Publishes deletion commitments
- Removes workspace state from memory
- Disconnects remaining participants

### 3.5 Server Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `operationRateLimit` | 100 ops/sec | Per-participant rate limit |
| `workspaceCreationLimit` | 10/hour | Per-IP workspace creation limit |
| `maxParticipantsPerWorkspace` | 50 | Maximum concurrent participants |
| `defaultRotationInterval` | 15 min | Key rotation frequency |
| `gracePeriod` | 60,000 ms | Key grace period for clock skew |
| `cleanupInterval` | 60,000 ms | Workspace expiration check frequency |

---

## Pillar 4: Multi-Recipient Key Distribution (ECIES)

Temporal keys must be distributed to all workspace participants securely. EECP uses Elliptic Curve Integrated Encryption Scheme (ECIES) via `@digitaldefiance/ecies-lib`.

### 4.1 ECIES Overview

ECIES combines:
- **ECDH** (Elliptic Curve Diffie-Hellman) for key agreement
- **KDF** for deriving symmetric keys from the shared secret
- **AES** for symmetric encryption of the payload
- **HMAC** for authentication

For a single recipient:
```
1. Generate ephemeral keypair (esk, epk)
2. Compute shared secret:  S = ECDH(esk, recipientPublicKey)
3. Derive symmetric key:   K = KDF(S)
4. Encrypt:                C = AES(K, temporalKey)
5. Send:                   (epk, C) to recipient
```

The recipient recovers:
```
1. Compute shared secret:  S = ECDH(recipientPrivateKey, epk)
2. Derive symmetric key:   K = KDF(S)
3. Decrypt:                temporalKey = AES⁻¹(K, C)
```

### 4.2 Multi-Recipient Extension

The `EciesMultiRecipient` class from `ecies-lib` encrypts a single plaintext for multiple recipients efficiently:

```
For recipients R₁, R₂, ..., Rₙ:
    For each Rᵢ:
        (epkᵢ, Cᵢ) = ECIES.Encrypt(Rᵢ.publicKey, temporalKey)
    
    Return { recipients: [(R₁.id, epk₁, C₁), ..., (Rₙ.id, epkₙ, Cₙ)] }
```

Each recipient can independently decrypt using only their private key, without knowing other recipients' keys.

### 4.3 Participant Identity

Participants are represented by the `Participant` class wrapping `ecies-lib`'s `Member`:

- **Key generation** — Fresh ECDSA keypair via `Member.newMember()`
- **Key loading** — Reconstruct from existing public/private key material via `Participant.fromKeys()`
- **Signing** — `ECDSA.Sign(privateKey, data)` for operation authentication
- **Verification** — `ECDSA.Verify(publicKey, data, signature)` for signature checking
- **Encryption** — `ECIES.Encrypt(recipientPublicKey, data)` for point-to-point encryption
- **Decryption** — `ECIES.Decrypt(privateKey, encryptedData)` for receiving encrypted data
- **Disposal** — `member.dispose()` securely clears private key material from memory

---

## Pillar 5: Provable Deletion (Commitment Scheme)

The commitment scheme provides cryptographic proof that temporal keys were destroyed, making the ephemeral guarantee verifiable rather than trust-based.

### 5.1 Commitment Construction

Before destroying a temporal key, a commitment is created:

```
data = key || keyId || validFrom || validUntil
commitment_hash = SHA-256(data)
```

The commitment is:
```typescript
{
  keyId: string,           // e.g., "key-3"
  hash: Buffer,            // 32-byte SHA-256 digest
  timestamp: number,       // When commitment was created
  validFrom: number,       // When key became valid
  validUntil: number       // When key expired
}
```

### 5.2 Security Properties

- **Binding** — Once committed, the value cannot be changed. `SHA-256` is collision-resistant; finding a different key that produces the same hash is computationally infeasible (birthday bound ≈ 2¹²⁸).
- **Hiding** — The commitment reveals nothing about the key. SHA-256 is a one-way function; recovering the key from the hash requires brute-forcing 2²⁵⁶ possibilities.
- **Verifiability** — Given the original key material, anyone can verify: `SHA-256(key || metadata) == commitment_hash`. But since the key is destroyed, this verification is only possible before deletion (used for testing/auditing the scheme itself).

### 5.3 Commitment Lifecycle

```
1. Key rotation triggers:  Kₜ is about to expire
2. Create commitment:      C = SHA-256(Kₜ || metadata)
3. Publish to log:         append(commitmentLog, C)
4. Destroy key:            overwrite(Kₜ, random); zero(Kₜ)
5. Commitment persists:    C proves Kₜ existed and was destroyed
```

### 5.4 Append-Only Log

Commitments are published to an append-only log. The current implementation uses an in-memory array. Production deployments could use:

- **Blockchain** — Distributed, tamper-evident, publicly verifiable
- **Merkle tree log** — Efficient inclusion proofs (similar to Certificate Transparency)
- **Cryptographically signed log files** — Simpler, centralized but auditable

The log allows third-party auditors to verify that:
1. A key with ID `key-N` existed for the claimed time window
2. A commitment was published before the key was destroyed
3. The commitment timestamp is consistent with the key's expiration

---

## Protocol Types & Interfaces

### Core Types (eecp-protocol)

```typescript
type WorkspaceId = GuidV4;          // Branded GUID for workspace identity
type ParticipantId = GuidV4;        // Branded GUID for participant identity
type OperationId = GuidV4;          // Branded GUID for operation identity

interface TimeWindow {
  startTime: number;                // Unix ms — window start
  endTime: number;                  // Unix ms — window end
  gracePeriod: number;              // ms — additional time for clock skew
  rotationInterval: number;         // minutes — key rotation frequency
}

interface WorkspaceConfig {
  durationMinutes: number;          // 5–120 minutes
  rotationInterval: number;         // Key rotation in minutes
  maxParticipants: number;          // Max concurrent participants
}

interface CRDTOperation {
  id: OperationId;
  participantId: ParticipantId;
  timestamp: number;
  type: 'insert' | 'delete';
  position: number;
  content?: string;                 // For insert operations
  length?: number;                  // For delete operations
}

interface EncryptedOperation {
  id: OperationId;
  workspaceId: WorkspaceId;
  participantId: ParticipantId;
  timestamp: number;
  position: number;
  operationType: string;
  encryptedContent: Buffer;         // nonce || authTag || ciphertext
  signature: Buffer;                // ECDSA signature over metadata + content
}

interface AuditLogEntry {
  timestamp: number;
  eventType: string;
  workspaceId: WorkspaceId;
  participantId?: ParticipantId;
  metadata: Record<string, unknown>;
}
```

---

## Cryptographic Summary

| Primitive | Algorithm | Key Size | Purpose |
|-----------|-----------|----------|---------|
| Key Derivation | HKDF-SHA256 (RFC 5869) | 256-bit output | Deterministic temporal key generation |
| Content Encryption | AES-256-GCM | 256-bit key, 96-bit nonce | Authenticated encryption of operations |
| Key Distribution | ECIES (secp256k1) | 256-bit EC keys | Multi-recipient temporal key distribution |
| Authentication | ECDSA-SHA256 | 256-bit EC keys | Zero-knowledge challenge-response, operation signing |
| Commitment | SHA-256 | 256-bit digest | Provable key deletion |
| CRDT | Yjs (YATA algorithm) | N/A | Conflict-free replicated text editing |

---

## End-to-End Security Walkthrough

A complete workspace session from creation to expiration:

```
1. WORKSPACE CREATION
   Creator generates workspace secret S (32 random bytes)
   Creator derives first temporal key: K₀ = HKDF(S, "key-0", t₀)
   Server creates workspace record (no access to S or K₀)

2. PARTICIPANT JOINING
   Joiner receives (workspaceId, S) out-of-band (share link)
   Joiner independently derives K₀ = HKDF(S, "key-0", t₀)
   Joiner authenticates via ZK challenge-response (ECDSA)
   Server verifies proof without learning private key

3. COLLABORATIVE EDITING
   Participant types → CRDT.insert(pos, text) applied locally
   Operation serialized → encrypted with K₀ via AES-256-GCM
   Encrypted op signed with participant's ECDSA private key
   Server broadcasts encrypted op to all other participants
   Recipients verify signature → decrypt with K₀ → apply to local CRDT
   All participants converge to same document state (CRDT guarantee)

4. KEY ROTATION (every N minutes)
   rotationNumber increments → new keyId = "key-1"
   All participants independently derive K₁ = HKDF(S, "key-1", t₁)
   K₀ enters grace period (decrypt-only)
   After grace period: commitment C₀ = SHA-256(K₀ || metadata)
   C₀ published to commitment log
   K₀ destroyed: overwrite with random bytes, then zero-fill
   Content encrypted with K₀ is now permanently unreadable

5. WORKSPACE EXPIRATION
   All remaining temporal keys destroyed with commitments
   Workspace state removed from server memory
   Participants disconnected
   Commitment log retained as proof of proper deletion
   
   Post-expiration state:
   - Server: no keys, no plaintext, no encrypted content
   - Participants: local CRDT state (if not cleared by client)
   - Commitment log: proof that keys existed and were destroyed
   - Recovery: mathematically impossible without keys
```

---

## References

- **RFC 5869** — HMAC-based Extract-and-Expand Key Derivation Function (HKDF)
- **NIST SP 800-38D** — Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM)
- **SEC 1 v2** — Elliptic Curve Cryptography (ECIES specification)
- **Yjs** — Lagergren, K. "Yjs: A Framework for Near Real-Time P2P Shared Editing on Arbitrary Data Types"
- **CRDT** — Shapiro et al. "Conflict-free Replicated Data Types" (2011)
- **@digitaldefiance/ecies-lib** — ECIES implementation used for multi-recipient encryption and participant identity
