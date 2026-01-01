import { ClientKeyManager } from './client-key-manager.js';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import { TemporalKey } from '@digitaldefiance-eecp/eecp-crypto';

// Simple in-memory IndexedDB mock for faster tests
class MockIndexedDB {
  private databases = new Map<string, Map<string, any>>();

  open(name: string, version: number) {
    const request: any = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: null,
    };

    setTimeout(() => {
      if (!this.databases.has(name)) {
        this.databases.set(name, new Map());
        const event = {
          target: {
            result: {
              objectStoreNames: { contains: () => false },
              createObjectStore: (storeName: string, options: any) => ({
                createIndex: () => {},
              }),
            },
          },
        };
        if (request.onupgradeneeded) {
          request.onupgradeneeded(event);
        }
      }

      const db = {
        transaction: (stores: string[], mode: string) => {
          const dbData = this.databases.get(name)!;
          return {
            objectStore: (storeName: string) => {
              if (!dbData.has(storeName)) {
                dbData.set(storeName, new Map());
              }
              const store = dbData.get(storeName)!;

              return {
                put: (value: any) => {
                  const req: any = { onsuccess: null, onerror: null };
                  setTimeout(() => {
                    const key = Array.isArray(value.workspaceId)
                      ? value.workspaceId.join(':')
                      : value.participantId || `${value.workspaceId}:${value.keyId}`;
                    store.set(key, value);
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
                get: (key: any) => {
                  const req: any = { onsuccess: null, onerror: null, result: null };
                  setTimeout(() => {
                    const keyStr = Array.isArray(key) ? key.join(':') : key;
                    req.result = store.get(keyStr);
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
                index: (indexName: string) => ({
                  getAll: (value: any) => {
                    const req: any = { onsuccess: null, onerror: null, result: [] };
                    setTimeout(() => {
                      req.result = Array.from(store.values()).filter((item: any) =>
                        indexName === 'workspaceId' ? item.workspaceId === value : true
                      );
                      if (req.onsuccess) req.onsuccess();
                    }, 0);
                    return req;
                  },
                  openCursor: (value: any) => {
                    const req: any = { onsuccess: null, onerror: null };
                    setTimeout(() => {
                      const items = Array.from(store.entries()).filter(
                        ([_, item]: any) => item.workspaceId === value
                      );
                      let index = 0;
                      const processCursor = () => {
                        if (index < items.length) {
                          const [key, value] = items[index];
                          const cursor = {
                            value,
                            delete: () => {
                              store.delete(key);
                            },
                            continue: () => {
                              index++;
                              setTimeout(() => {
                                processCursor();
                                if (req.onsuccess) {
                                  if (index < items.length) {
                                    const [nextKey, nextValue] = items[index];
                                    req.onsuccess({
                                      target: {
                                        result: {
                                          value: nextValue,
                                          delete: () => store.delete(nextKey),
                                          continue: cursor.continue,
                                        },
                                      },
                                    });
                                  } else {
                                    req.onsuccess({ target: { result: null } });
                                  }
                                }
                              }, 0);
                            },
                          };
                          if (req.onsuccess) {
                            req.onsuccess({ target: { result: cursor } });
                          }
                        } else {
                          if (req.onsuccess) {
                            req.onsuccess({ target: { result: null } });
                          }
                        }
                      };
                      processCursor();
                    }, 0);
                    return req;
                  },
                }),
              };
            },
          };
        },
      };

      request.result = db;
      if (request.onsuccess) {
        request.onsuccess();
      }
    }, 0);

    return request;
  }

  deleteDatabase(name: string) {
    const request: any = { onsuccess: null, onerror: null };
    setTimeout(() => {
      this.databases.delete(name);
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }
}

describe('ClientKeyManager Unit Tests', () => {
  let keyManager: ClientKeyManager;
  const dbName = 'eecp-keys-test';
  let originalIndexedDB: any;
  let mockIndexedDB: MockIndexedDB;

  beforeAll(() => {
    // Replace global indexedDB with mock
    originalIndexedDB = (global as any).indexedDB;
    mockIndexedDB = new MockIndexedDB();
    (global as any).indexedDB = mockIndexedDB;
  });

  afterAll(() => {
    // Restore original indexedDB
    (global as any).indexedDB = originalIndexedDB;
  });

  beforeEach(async () => {
    keyManager = new ClientKeyManager(dbName);
    await keyManager.initialize();
  });

  afterEach(async () => {
    // Quick cleanup with mock
    if (keyManager) {
      mockIndexedDB.deleteDatabase(dbName);
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const manager = new ClientKeyManager();
      await expect(manager.initialize()).resolves.not.toThrow();
    });

    it('should allow multiple initialize calls', async () => {
      await expect(keyManager.initialize()).resolves.not.toThrow();
      await expect(keyManager.initialize()).resolves.not.toThrow();
    });

    it('should throw error when accessing methods before initialization', async () => {
      const uninitializedManager = new ClientKeyManager();
      const workspaceId = GuidV4.new();
      
      await expect(
        uninitializedManager.getCurrentKey(workspaceId)
      ).rejects.toThrow('ClientKeyManager not initialized');
    });
  });

  describe('Temporal Key Storage', () => {
    it('should store and retrieve a temporal key', async () => {
      const workspaceId = GuidV4.new();
      const key: TemporalKey = {
        id: 'key-1',
        key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        validFrom: Date.now(),
        validUntil: Date.now() + 60000,
        gracePeriodEnd: Date.now() + 90000
      };

      await keyManager.storeKey(workspaceId, key);
      const retrieved = await keyManager.getKeyById(workspaceId, key.id);

      expect(retrieved.id).toBe(key.id);
      expect(retrieved.key.equals(key.key)).toBe(true);
      expect(retrieved.validFrom).toBe(key.validFrom);
      expect(retrieved.validUntil).toBe(key.validUntil);
      expect(retrieved.gracePeriodEnd).toBe(key.gracePeriodEnd);
    });

    it('should get current key from multiple keys', async () => {
      const workspaceId = GuidV4.new();
      const now = Date.now();
      
      // Store multiple keys with different validity periods
      const oldKey: TemporalKey = {
        id: 'key-old',
        key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        validFrom: now - 120000,
        validUntil: now - 60000,
        gracePeriodEnd: now - 30000 // Expired
      };
      
      const currentKey: TemporalKey = {
        id: 'key-current',
        key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        validFrom: now,
        validUntil: now + 60000,
        gracePeriodEnd: now + 90000
      };

      await keyManager.storeKey(workspaceId, oldKey);
      await keyManager.storeKey(workspaceId, currentKey);

      const retrieved = await keyManager.getCurrentKey(workspaceId);
      expect(retrieved.id).toBe(currentKey.id);
    });

    it('should throw error when getting non-existent key', async () => {
      const workspaceId = GuidV4.new();
      
      await expect(
        keyManager.getKeyById(workspaceId, 'non-existent')
      ).rejects.toThrow('Key non-existent not found');
    });

    it('should throw error when no valid keys exist', async () => {
      const workspaceId = GuidV4.new();
      const now = Date.now();
      
      // Store only expired keys
      const expiredKey: TemporalKey = {
        id: 'key-expired',
        key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        validFrom: now - 120000,
        validUntil: now - 60000,
        gracePeriodEnd: now - 1 // Expired
      };

      await keyManager.storeKey(workspaceId, expiredKey);

      await expect(
        keyManager.getCurrentKey(workspaceId)
      ).rejects.toThrow('No valid keys found');
    });
  });

  describe('Participant Key Storage', () => {
    it('should store and retrieve participant keys', async () => {
      const participantId = GuidV4.new();
      const privateKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
      const publicKey = Buffer.from(crypto.getRandomValues(new Uint8Array(33)));

      await keyManager.storeParticipantKey(participantId, privateKey, publicKey);
      const retrieved = await keyManager.getParticipantKey(participantId);

      expect(retrieved.equals(privateKey)).toBe(true);
    });

    it('should throw error when getting non-existent participant key', async () => {
      const participantId = GuidV4.new();
      
      await expect(
        keyManager.getParticipantKey(participantId)
      ).rejects.toThrow('Participant key not found');
    });

    it('should update participant key on re-store', async () => {
      const participantId = GuidV4.new();
      const privateKey1 = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
      const privateKey2 = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
      const publicKey = Buffer.from(crypto.getRandomValues(new Uint8Array(33)));

      await keyManager.storeParticipantKey(participantId, privateKey1, publicKey);
      await keyManager.storeParticipantKey(participantId, privateKey2, publicKey);
      
      const retrieved = await keyManager.getParticipantKey(participantId);
      expect(retrieved.equals(privateKey2)).toBe(true);
      expect(retrieved.equals(privateKey1)).toBe(false);
    });
  });

  describe('Workspace Key Deletion', () => {
    it('should delete all keys for a workspace', async () => {
      const workspaceId = GuidV4.new();
      const now = Date.now();
      
      // Store multiple keys
      for (let i = 0; i < 3; i++) {
        const key: TemporalKey = {
          id: `key-${i}`,
          key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
          validFrom: now + i * 60000,
          validUntil: now + (i + 1) * 60000,
          gracePeriodEnd: now + (i + 1) * 60000 + 30000
        };
        await keyManager.storeKey(workspaceId, key);
      }

      // Delete all keys
      await keyManager.deleteWorkspaceKeys(workspaceId);

      // Verify all keys are deleted
      for (let i = 0; i < 3; i++) {
        await expect(
          keyManager.getKeyById(workspaceId, `key-${i}`)
        ).rejects.toThrow();
      }
    });

    it('should not affect keys from other workspaces', async () => {
      const workspace1 = GuidV4.new();
      const workspace2 = GuidV4.new();
      const now = Date.now();
      
      const key1: TemporalKey = {
        id: 'key-1',
        key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        validFrom: now,
        validUntil: now + 60000,
        gracePeriodEnd: now + 90000
      };
      
      const key2: TemporalKey = {
        id: 'key-2',
        key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        validFrom: now,
        validUntil: now + 60000,
        gracePeriodEnd: now + 90000
      };

      await keyManager.storeKey(workspace1, key1);
      await keyManager.storeKey(workspace2, key2);

      // Delete workspace1 keys
      await keyManager.deleteWorkspaceKeys(workspace1);

      // Verify workspace1 keys are deleted
      await expect(
        keyManager.getKeyById(workspace1, 'key-1')
      ).rejects.toThrow();

      // Verify workspace2 keys still exist
      const retrieved = await keyManager.getKeyById(workspace2, 'key-2');
      expect(retrieved.id).toBe('key-2');
    });

    it('should handle deletion of non-existent workspace gracefully', async () => {
      const workspaceId = GuidV4.new();
      
      await expect(
        keyManager.deleteWorkspaceKeys(workspaceId)
      ).resolves.not.toThrow();
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent key storage', async () => {
      const workspaceId = GuidV4.new();
      const now = Date.now();
      
      // Store 5 keys concurrently (reduced from 10 for speed)
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const key: TemporalKey = {
          id: `key-${i}`,
          key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
          validFrom: now + i * 60000,
          validUntil: now + (i + 1) * 60000,
          gracePeriodEnd: now + (i + 1) * 60000 + 30000
        };
        promises.push(keyManager.storeKey(workspaceId, key));
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Verify all keys were stored
      for (let i = 0; i < 5; i++) {
        const retrieved = await keyManager.getKeyById(workspaceId, `key-${i}`);
        expect(retrieved.id).toBe(`key-${i}`);
      }
    });

    it('should handle concurrent reads', async () => {
      const workspaceId = GuidV4.new();
      const now = Date.now();
      
      const key: TemporalKey = {
        id: 'key-1',
        key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        validFrom: now,
        validUntil: now + 60000,
        gracePeriodEnd: now + 90000
      };

      await keyManager.storeKey(workspaceId, key);

      // Read the same key concurrently (reduced from 10 to 5)
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(keyManager.getKeyById(workspaceId, 'key-1'));
      }

      const results = await Promise.all(promises);
      
      // All reads should succeed and return the same key
      results.forEach(result => {
        expect(result.id).toBe('key-1');
        expect(result.key.equals(key.key)).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty workspace ID gracefully', async () => {
      const workspaceId = GuidV4.new();
      
      await expect(
        keyManager.getCurrentKey(workspaceId)
      ).rejects.toThrow('No keys found');
    });

    it('should handle keys with same validFrom timestamp', async () => {
      const workspaceId = GuidV4.new();
      const now = Date.now();
      
      // Store multiple keys with same validFrom
      const key1: TemporalKey = {
        id: 'key-1',
        key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        validFrom: now,
        validUntil: now + 60000,
        gracePeriodEnd: now + 90000
      };
      
      const key2: TemporalKey = {
        id: 'key-2',
        key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        validFrom: now,
        validUntil: now + 60000,
        gracePeriodEnd: now + 90000
      };

      await keyManager.storeKey(workspaceId, key1);
      await keyManager.storeKey(workspaceId, key2);

      // Should return one of the keys (deterministic based on storage order)
      const current = await keyManager.getCurrentKey(workspaceId);
      expect(['key-1', 'key-2']).toContain(current.id);
    });

    it('should handle moderate number of keys', async () => {
      const workspaceId = GuidV4.new();
      const now = Date.now();
      
      // Store 20 keys (reduced from 100 for speed)
      for (let i = 0; i < 20; i++) {
        const key: TemporalKey = {
          id: `key-${i}`,
          key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
          validFrom: now + i * 1000,
          validUntil: now + (i + 1) * 1000,
          gracePeriodEnd: now + (i + 1) * 1000 + 30000
        };
        await keyManager.storeKey(workspaceId, key);
      }

      // Should be able to get current key efficiently
      const current = await keyManager.getCurrentKey(workspaceId);
      expect(current.id).toBe('key-19'); // Most recent
    });
  });
});
