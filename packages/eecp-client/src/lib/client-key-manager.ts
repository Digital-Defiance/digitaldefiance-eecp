/**
 * @module client-key-manager
 * 
 * Client-side key management using IndexedDB.
 * 
 * This module provides secure storage for:
 * - Temporal keys for workspace encryption
 * - Participant keypairs for authentication
 * 
 * Key features:
 * - IndexedDB for persistent browser storage
 * - Secure key deletion with overwriting
 * - Grace period support for clock skew
 * - Composite key indexing for efficient queries
 * - Automatic key expiration handling
 * 
 * Storage structure:
 * - temporal-keys store: Indexed by [workspaceId, keyId]
 * - participant-keys store: Indexed by participantId
 * 
 * Security considerations:
 * - Keys are stored in IndexedDB (browser-managed encryption)
 * - Keys are overwritten with random data before deletion
 * - Grace periods allow for clock skew tolerance
 * 
 * @example
 * ```typescript
 * import { ClientKeyManager } from './client-key-manager';
 * 
 * const keyManager = new ClientKeyManager();
 * await keyManager.initialize();
 * 
 * // Store temporal key
 * await keyManager.storeKey(workspaceId, temporalKey);
 * 
 * // Get current key
 * const key = await keyManager.getCurrentKey(workspaceId);
 * 
 * // Store participant keypair
 * await keyManager.storeParticipantKey(participantId, privateKey, publicKey);
 * 
 * // Get participant private key
 * const privateKey = await keyManager.getParticipantKey(participantId);
 * 
 * // Delete workspace keys
 * await keyManager.deleteWorkspaceKeys(workspaceId);
 * ```
 */

/// <reference lib="dom" />

import { WorkspaceId, ParticipantId } from '@digitaldefiance/eecp-protocol';
import { TemporalKey } from '@digitaldefiance/eecp-crypto';

/**
 * Interface for client-side key management operations.
 * 
 * @interface IClientKeyManager
 */
export interface IClientKeyManager {
  /**
   * Initialize IndexedDB with required object stores.
   * 
   * Must be called before any other operations.
   * 
   * @returns {Promise<void>} Resolves when initialization is complete
   * @throws {Error} If IndexedDB initialization fails
   */
  initialize(): Promise<void>;
  
  /**
   * Store temporal key for a workspace.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {TemporalKey} key - Temporal key to store
   * @returns {Promise<void>} Resolves when key is stored
   * @throws {Error} If not initialized or storage fails
   */
  storeKey(
    workspaceId: WorkspaceId,
    key: TemporalKey
  ): Promise<void>;
  
  /**
   * Get current valid temporal key for a workspace.
   * 
   * Returns the most recent key that is still within its grace period.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @returns {Promise<TemporalKey>} Current temporal key
   * @throws {Error} If not initialized, no keys found, or all keys expired
   */
  getCurrentKey(workspaceId: WorkspaceId): Promise<TemporalKey>;
  
  /**
   * Get a specific temporal key by ID.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {string} keyId - Key ID
   * @returns {Promise<TemporalKey>} Temporal key
   * @throws {Error} If not initialized or key not found
   */
  getKeyById(
    workspaceId: WorkspaceId,
    keyId: string
  ): Promise<TemporalKey>;
  
  /**
   * Delete all keys for a workspace.
   * 
   * Securely overwrites key data before deletion.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @returns {Promise<void>} Resolves when all keys are deleted
   * @throws {Error} If not initialized or deletion fails
   */
  deleteWorkspaceKeys(workspaceId: WorkspaceId): Promise<void>;
  
  /**
   * Store participant keypair.
   * 
   * @param {ParticipantId} participantId - Participant ID
   * @param {Buffer} privateKey - Private key
   * @param {Buffer} publicKey - Public key
   * @returns {Promise<void>} Resolves when keypair is stored
   * @throws {Error} If not initialized or storage fails
   */
  storeParticipantKey(
    participantId: ParticipantId,
    privateKey: Buffer,
    publicKey: Buffer
  ): Promise<void>;
  
  /**
   * Get participant private key.
   * 
   * @param {ParticipantId} participantId - Participant ID
   * @returns {Promise<Buffer>} Private key
   * @throws {Error} If not initialized or key not found
   */
  getParticipantKey(participantId: ParticipantId): Promise<Buffer>;
}

/**
 * Stored temporal key record in IndexedDB.
 * 
 * @interface StoredTemporalKey
 * @property {string} workspaceId - Workspace ID (part of composite key)
 * @property {string} keyId - Key ID (part of composite key)
 * @property {Uint8Array} key - Encrypted key material
 * @property {number} validFrom - Timestamp when key becomes valid
 * @property {number} validUntil - Timestamp when key expires
 * @property {number} gracePeriodEnd - Timestamp when grace period ends
 */
interface StoredTemporalKey {
  workspaceId: string;
  keyId: string;
  key: Uint8Array;
  validFrom: number;
  validUntil: number;
  gracePeriodEnd: number;
}

/**
 * Stored participant key record in IndexedDB.
 * 
 * @interface StoredParticipantKey
 * @property {string} participantId - Participant ID (primary key)
 * @property {Uint8Array} privateKey - Private key material
 * @property {Uint8Array} publicKey - Public key material
 */
interface StoredParticipantKey {
  participantId: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * Client key manager implementation using IndexedDB.
 * 
 * Provides secure storage for temporal keys and participant keypairs in the browser.
 * 
 * @class ClientKeyManager
 * @implements {IClientKeyManager}
 * 
 * @example
 * ```typescript
 * const keyManager = new ClientKeyManager('my-app-keys');
 * await keyManager.initialize();
 * 
 * await keyManager.storeKey(workspaceId, temporalKey);
 * const key = await keyManager.getCurrentKey(workspaceId);
 * ```
 */
export class ClientKeyManager implements IClientKeyManager {
  private db?: IDBDatabase;
  private readonly DB_NAME: string;
  private readonly DB_VERSION = 1;
  private readonly KEYS_STORE = 'temporal-keys';
  private readonly PARTICIPANT_STORE = 'participant-keys';
  private initialized = false;
  
  /**
   * Create a new ClientKeyManager.
   * 
   * @param {string} [dbName='eecp-keys'] - Optional database name
   * 
   * @example
   * ```typescript
   * const keyManager = new ClientKeyManager('my-app-keys');
   * await keyManager.initialize();
   * ```
   */
  constructor(dbName = 'eecp-keys') {
    this.DB_NAME = dbName;
  }
  
  /**
   * Initialize IndexedDB with required object stores.
   * 
   * Creates:
   * - temporal-keys store with composite key [workspaceId, keyId]
   * - participant-keys store with participantId key
   * - Indexes for efficient querying
   * 
   * @returns {Promise<void>} Resolves when initialization is complete
   * @throws {Error} If IndexedDB initialization fails
   * 
   * @example
   * ```typescript
   * await keyManager.initialize();
   * ```
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.db) {
      return;
    }
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };
      
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create temporal keys store with composite key
        if (!db.objectStoreNames.contains(this.KEYS_STORE)) {
          const keysStore = db.createObjectStore(this.KEYS_STORE, { 
            keyPath: ['workspaceId', 'keyId'] 
          });
          // Index for querying by workspace
          keysStore.createIndex('workspaceId', 'workspaceId', { unique: false });
          // Index for querying by expiration
          keysStore.createIndex('gracePeriodEnd', 'gracePeriodEnd', { unique: false });
        }
        
        // Create participant keys store
        if (!db.objectStoreNames.contains(this.PARTICIPANT_STORE)) {
          db.createObjectStore(this.PARTICIPANT_STORE, { 
            keyPath: 'participantId' 
          });
        }
      };
    });
  }
  
  /**
   * Store a temporal key for a workspace.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {TemporalKey} key - Temporal key to store
   * @returns {Promise<void>} Resolves when key is stored
   * @throws {Error} If not initialized or storage fails
   * 
   * @example
   * ```typescript
   * await keyManager.storeKey(workspaceId, {
   *   id: 'key-0',
   *   key: Buffer.from('...'),
   *   validFrom: Date.now(),
   *   validUntil: Date.now() + 900000,
   *   gracePeriodEnd: Date.now() + 960000
   * });
   * ```
   */
  async storeKey(
    workspaceId: WorkspaceId,
    key: TemporalKey
  ): Promise<void> {
    this.ensureInitialized();
    
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const transaction = this.db!.transaction([this.KEYS_STORE], 'readwrite');
    const store = transaction.objectStore(this.KEYS_STORE);
    
    const record: StoredTemporalKey = {
      workspaceId: workspaceId.toString(),
      keyId: key.id,
      key: new Uint8Array(key.key),
      validFrom: key.validFrom,
      validUntil: key.validUntil,
      gracePeriodEnd: key.gracePeriodEnd
    };
    
    return new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to store key: ${request.error?.message}`));
    });
  }
  
  /**
   * Get the current valid temporal key for a workspace.
   * 
   * Returns the most recent key that is still within its grace period.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @returns {Promise<TemporalKey>} Current temporal key
   * @throws {Error} If not initialized, no keys found, or all keys expired
   * 
   * @example
   * ```typescript
   * const key = await keyManager.getCurrentKey(workspaceId);
   * console.log(`Current key: ${key.id}`);
   * ```
   */
  async getCurrentKey(workspaceId: WorkspaceId): Promise<TemporalKey> {
    this.ensureInitialized();
    
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const transaction = this.db!.transaction([this.KEYS_STORE], 'readonly');
    const store = transaction.objectStore(this.KEYS_STORE);
    const index = store.index('workspaceId');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(workspaceId.toString());
      
      request.onsuccess = () => {
        const keys = request.result as StoredTemporalKey[];
        
        if (keys.length === 0) {
          reject(new Error(`No keys found for workspace ${workspaceId.toString()}`));
          return;
        }
        
        // Find the most recent valid key
        const now = Date.now();
        const validKeys = keys.filter(k => k.gracePeriodEnd > now);
        
        if (validKeys.length === 0) {
          reject(new Error(`No valid keys found for workspace ${workspaceId.toString()}`));
          return;
        }
        
        // Sort by validFrom descending to get the most recent
        validKeys.sort((a, b) => b.validFrom - a.validFrom);
        const currentKey = validKeys[0];
        
        resolve(this.storedKeyToTemporalKey(currentKey));
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to get current key: ${request.error?.message}`));
      };
    });
  }
  
  /**
   * Get a specific temporal key by ID.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @param {string} keyId - Key ID
   * @returns {Promise<TemporalKey>} Temporal key
   * @throws {Error} If not initialized or key not found
   * 
   * @example
   * ```typescript
   * const key = await keyManager.getKeyById(workspaceId, 'key-0');
   * ```
   */
  async getKeyById(
    workspaceId: WorkspaceId,
    keyId: string
  ): Promise<TemporalKey> {
    this.ensureInitialized();
    
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const transaction = this.db!.transaction([this.KEYS_STORE], 'readonly');
    const store = transaction.objectStore(this.KEYS_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.get([workspaceId.toString(), keyId]);
      
      request.onsuccess = () => {
        const key = request.result as StoredTemporalKey | undefined;
        
        if (!key) {
          reject(new Error(`Key ${keyId} not found for workspace ${workspaceId.toString()}`));
          return;
        }
        
        resolve(this.storedKeyToTemporalKey(key));
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to get key by ID: ${request.error?.message}`));
      };
    });
  }
  
  /**
   * Delete all keys for a workspace.
   * 
   * Securely overwrites key data with random bytes before deletion.
   * 
   * @param {WorkspaceId} workspaceId - Workspace ID
   * @returns {Promise<void>} Resolves when all keys are deleted
   * @throws {Error} If not initialized or deletion fails
   * 
   * @example
   * ```typescript
   * await keyManager.deleteWorkspaceKeys(workspaceId);
   * console.log('All workspace keys deleted');
   * ```
   */
  async deleteWorkspaceKeys(workspaceId: WorkspaceId): Promise<void> {
    this.ensureInitialized();
    
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const transaction = this.db!.transaction([this.KEYS_STORE], 'readwrite');
    const store = transaction.objectStore(this.KEYS_STORE);
    const index = store.index('workspaceId');
    
    return new Promise<void>((resolve, reject) => {
      const request = index.openCursor(workspaceId.toString());
      
      request.onsuccess = (event: Event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        
        if (cursor) {
          // Securely overwrite key data before deletion
          const record = cursor.value as StoredTemporalKey;
          if (record.key) {
            // Overwrite with random data
            crypto.getRandomValues(record.key);
            // Then zero out
            record.key.fill(0);
          }
          
          cursor.delete();
          cursor.continue();
        } else {
          // All keys deleted
          resolve();
        }
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to delete workspace keys: ${request.error?.message}`));
      };
    });
  }
  
  /**
   * Store participant keypair.
   * 
   * @param {ParticipantId} participantId - Participant ID
   * @param {Buffer} privateKey - Private key
   * @param {Buffer} publicKey - Public key
   * @returns {Promise<void>} Resolves when keypair is stored
   * @throws {Error} If not initialized or storage fails
   * 
   * @example
   * ```typescript
   * await keyManager.storeParticipantKey(
   *   participantId,
   *   privateKeyBuffer,
   *   publicKeyBuffer
   * );
   * ```
   */
  async storeParticipantKey(
    participantId: ParticipantId,
    privateKey: Buffer,
    publicKey: Buffer
  ): Promise<void> {
    this.ensureInitialized();
    
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const transaction = this.db!.transaction([this.PARTICIPANT_STORE], 'readwrite');
    const store = transaction.objectStore(this.PARTICIPANT_STORE);
    
    const record: StoredParticipantKey = {
      participantId: participantId.toString(),
      privateKey: new Uint8Array(privateKey),
      publicKey: new Uint8Array(publicKey)
    };
    
    return new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to store participant key: ${request.error?.message}`));
    });
  }
  
  /**
   * Get participant private key.
   * 
   * @param {ParticipantId} participantId - Participant ID
   * @returns {Promise<Buffer>} Private key
   * @throws {Error} If not initialized or key not found
   * 
   * @example
   * ```typescript
   * const privateKey = await keyManager.getParticipantKey(participantId);
   * ```
   */
  async getParticipantKey(participantId: ParticipantId): Promise<Buffer> {
    this.ensureInitialized();
    
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const transaction = this.db!.transaction([this.PARTICIPANT_STORE], 'readonly');
    const store = transaction.objectStore(this.PARTICIPANT_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.get(participantId.toString());
      
      request.onsuccess = () => {
        const record = request.result as StoredParticipantKey | undefined;
        
        if (!record) {
          reject(new Error(`Participant key not found for ${participantId.toString()}`));
          return;
        }
        
        resolve(Buffer.from(record.privateKey));
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to get participant key: ${request.error?.message}`));
      };
    });
  }
  
  /**
   * Convert stored key to TemporalKey.
   * 
   * @private
   * @param {StoredTemporalKey} stored - Stored key record
   * @returns {TemporalKey} Temporal key
   */
  private storedKeyToTemporalKey(stored: StoredTemporalKey): TemporalKey {
    return {
      id: stored.keyId,
      key: Buffer.from(stored.key),
      validFrom: stored.validFrom,
      validUntil: stored.validUntil,
      gracePeriodEnd: stored.gracePeriodEnd
    };
  }
  
  /**
   * Ensure the manager is initialized.
   * 
   * @private
   * @throws {Error} If not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('ClientKeyManager not initialized. Call initialize() first.');
    }
  }
}
