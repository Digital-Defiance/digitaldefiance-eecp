import * as fc from 'fast-check';
import { ClientKeyManager } from './client-key-manager.js';
import { GuidV4 } from '@digitaldefiance/ecies-lib';
import { TemporalKey } from '@digitaldefiance-eecp/eecp-crypto';

// Simple in-memory IndexedDB mock for faster tests (same as in spec file)
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

describe('ClientKeyManager Property Tests', () => {
  let keyManager: ClientKeyManager;
  const dbName = 'eecp-keys-property-test';
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

  afterEach(() => {
    if (keyManager) {
      mockIndexedDB.deleteDatabase(dbName);
    }
  });

  /**
   * Feature: eecp-full-system, Property 27: Client Key Deletion on Expiration
   * Validates: Requirements 7.3
   * 
   * For any workspace with stored temporal keys, when deleteWorkspaceKeys is called,
   * all keys for that workspace must be removed from storage and no longer retrievable.
   */
  test('Property 27: Client Key Deletion on Expiration', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of keys (1-10)
        fc.integer({ min: 1, max: 10 }),
        // Generate random timestamps
        fc.integer({ min: Date.now(), max: Date.now() + 3600000 }),
        async (numKeys, baseTime) => {
          // Create a workspace ID
          const workspaceId = GuidV4.new();
          
          // Store multiple temporal keys for the workspace
          const keys: TemporalKey[] = [];
          for (let i = 0; i < numKeys; i++) {
            const validFrom = baseTime + i * 60000;
            const validUntil = validFrom + 60000;
            const gracePeriodEnd = validUntil + 30000;
            
            const key: TemporalKey = {
              id: `key-${i}`,
              key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
              validFrom,
              validUntil,
              gracePeriodEnd
            };
            
            await keyManager.storeKey(workspaceId, key);
            keys.push(key);
          }
          
          // Verify keys are stored
          for (const key of keys) {
            const retrieved = await keyManager.getKeyById(workspaceId, key.id);
            expect(retrieved.id).toBe(key.id);
          }
          
          // Delete all workspace keys
          await keyManager.deleteWorkspaceKeys(workspaceId);
          
          // Verify all keys are deleted
          for (const key of keys) {
            await expect(
              keyManager.getKeyById(workspaceId, key.id)
            ).rejects.toThrow();
          }
          
          // Verify getCurrentKey also fails
          await expect(
            keyManager.getCurrentKey(workspaceId)
          ).rejects.toThrow();
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  }, 10000); // 10 second timeout for property test
});
