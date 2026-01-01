/**
 * Client-side key management using IndexedDB
 * Stores temporal keys and participant keypairs securely in the browser
 */

/// <reference lib="dom" />

import { WorkspaceId, ParticipantId } from '@digitaldefiance-eecp/eecp-protocol';
import { TemporalKey } from '@digitaldefiance-eecp/eecp-crypto';

/**
 * Interface for client-side key management
 */
export interface IClientKeyManager {
  /**
   * Initialize IndexedDB
   */
  initialize(): Promise<void>;
  
  /**
   * Store temporal key
   */
  storeKey(
    workspaceId: WorkspaceId,
    key: TemporalKey
  ): Promise<void>;
  
  /**
   * Get current temporal key
   */
  getCurrentKey(workspaceId: WorkspaceId): Promise<TemporalKey>;
  
  /**
   * Get key by ID
   */
  getKeyById(
    workspaceId: WorkspaceId,
    keyId: string
  ): Promise<TemporalKey>;
  
  /**
   * Delete workspace keys
   */
  deleteWorkspaceKeys(workspaceId: WorkspaceId): Promise<void>;
  
  /**
   * Store participant keypair
   */
  storeParticipantKey(
    participantId: ParticipantId,
    privateKey: Buffer,
    publicKey: Buffer
  ): Promise<void>;
  
  /**
   * Get participant private key
   */
  getParticipantKey(participantId: ParticipantId): Promise<Buffer>;
}

/**
 * Stored temporal key record
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
 * Stored participant key record
 */
interface StoredParticipantKey {
  participantId: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * Client key manager implementation using IndexedDB
 * Provides secure storage for temporal keys and participant keypairs
 */
export class ClientKeyManager implements IClientKeyManager {
  private db?: IDBDatabase;
  private readonly DB_NAME: string;
  private readonly DB_VERSION = 1;
  private readonly KEYS_STORE = 'temporal-keys';
  private readonly PARTICIPANT_STORE = 'participant-keys';
  private initialized = false;
  
  /**
   * Create a new ClientKeyManager
   * @param dbName Optional database name (defaults to 'eecp-keys')
   */
  constructor(dbName: string = 'eecp-keys') {
    this.DB_NAME = dbName;
  }
  
  /**
   * Initialize IndexedDB with required object stores
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
   * Store a temporal key for a workspace
   */
  async storeKey(
    workspaceId: WorkspaceId,
    key: TemporalKey
  ): Promise<void> {
    this.ensureInitialized();
    
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
   * Get the current valid temporal key for a workspace
   */
  async getCurrentKey(workspaceId: WorkspaceId): Promise<TemporalKey> {
    this.ensureInitialized();
    
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
   * Get a specific temporal key by ID
   */
  async getKeyById(
    workspaceId: WorkspaceId,
    keyId: string
  ): Promise<TemporalKey> {
    this.ensureInitialized();
    
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
   * Delete all keys for a workspace
   */
  async deleteWorkspaceKeys(workspaceId: WorkspaceId): Promise<void> {
    this.ensureInitialized();
    
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
   * Store participant keypair
   */
  async storeParticipantKey(
    participantId: ParticipantId,
    privateKey: Buffer,
    publicKey: Buffer
  ): Promise<void> {
    this.ensureInitialized();
    
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
   * Get participant private key
   */
  async getParticipantKey(participantId: ParticipantId): Promise<Buffer> {
    this.ensureInitialized();
    
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
   * Convert stored key to TemporalKey
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
   * Ensure the manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('ClientKeyManager not initialized. Call initialize() first.');
    }
  }
}
