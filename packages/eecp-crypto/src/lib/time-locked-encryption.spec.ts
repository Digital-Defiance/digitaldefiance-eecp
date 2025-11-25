import { TimeLockedEncryption, EncryptedPayload } from './time-locked-encryption.js';
import { TemporalKey } from './temporal-key-derivation.js';

describe('TimeLockedEncryption Unit Tests', () => {
  let encryption: TimeLockedEncryption;
  let testKey: TemporalKey;
  
  beforeEach(() => {
    encryption = new TimeLockedEncryption();
    
    // Create a test temporal key (32 bytes = 64 hex characters)
    testKey = {
      id: 'test-key-1',
      key: Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex'), // 32 bytes
      validFrom: Date.now(),
      validUntil: Date.now() + 60000,
      gracePeriodEnd: Date.now() + 120000
    };
  });
  
  describe('Edge Cases', () => {
    /**
     * Test empty content encryption
     * Requirements: 4.2
     */
    it('should encrypt and decrypt empty content', async () => {
      const emptyContent = Buffer.alloc(0);
      
      const encrypted = await encryption.encrypt(emptyContent, testKey);
      
      expect(encrypted.ciphertext.length).toBe(0);
      expect(encrypted.nonce.length).toBe(12);
      expect(encrypted.authTag.length).toBe(16);
      
      const decrypted = await encryption.decrypt(encrypted, testKey);
      expect(decrypted).toEqual(emptyContent);
    });
    
    /**
     * Test large content encryption (>1MB)
     * Requirements: 4.2
     */
    it('should encrypt and decrypt large content (>1MB)', async () => {
      // Create 2MB of content
      const largeContent = Buffer.alloc(2 * 1024 * 1024);
      // Fill with pattern to verify correctness
      for (let i = 0; i < largeContent.length; i++) {
        largeContent[i] = i % 256;
      }
      
      const encrypted = await encryption.encrypt(largeContent, testKey);
      
      expect(encrypted.ciphertext.length).toBe(largeContent.length);
      expect(encrypted.nonce.length).toBe(12);
      expect(encrypted.authTag.length).toBe(16);
      
      const decrypted = await encryption.decrypt(encrypted, testKey);
      expect(decrypted).toEqual(largeContent);
    });
    
    /**
     * Test encryption with invalid key (wrong length)
     * Requirements: 4.2
     */
    it('should reject key with invalid length', async () => {
      const invalidKey: TemporalKey = {
        id: 'invalid-key',
        key: Buffer.from('tooshort', 'utf8'), // Only 8 bytes instead of 32
        validFrom: Date.now(),
        validUntil: Date.now() + 60000,
        gracePeriodEnd: Date.now() + 120000
      };
      
      const content = Buffer.from('test content');
      
      await expect(
        encryption.encrypt(content, invalidKey)
      ).rejects.toThrow();
    });
    
    /**
     * Test decryption with wrong key ID
     * Requirements: 4.2
     */
    it('should reject decryption with mismatched key ID', async () => {
      const content = Buffer.from('test content');
      const encrypted = await encryption.encrypt(content, testKey);
      
      // Create a different key with different ID
      const wrongKey: TemporalKey = {
        ...testKey,
        id: 'different-key-id'
      };
      
      await expect(
        encryption.decrypt(encrypted, wrongKey)
      ).rejects.toThrow('Key ID mismatch');
    });
    
    /**
     * Test decryption with tampered ciphertext
     * Requirements: 4.2
     */
    it('should reject tampered ciphertext', async () => {
      const content = Buffer.from('test content');
      const encrypted = await encryption.encrypt(content, testKey);
      
      // Tamper with the ciphertext
      if (encrypted.ciphertext.length > 0) {
        encrypted.ciphertext[0] ^= 0xFF;
      }
      
      await expect(
        encryption.decrypt(encrypted, testKey)
      ).rejects.toThrow();
    });
    
    /**
     * Test decryption with tampered auth tag
     * Requirements: 4.2
     */
    it('should reject tampered auth tag', async () => {
      const content = Buffer.from('test content');
      const encrypted = await encryption.encrypt(content, testKey);
      
      // Tamper with the auth tag
      encrypted.authTag[0] ^= 0xFF;
      
      await expect(
        encryption.decrypt(encrypted, testKey)
      ).rejects.toThrow();
    });
    
    /**
     * Test decryption with tampered nonce
     * Requirements: 4.2
     */
    it('should reject tampered nonce', async () => {
      const content = Buffer.from('test content');
      const encrypted = await encryption.encrypt(content, testKey);
      
      // Tamper with the nonce
      encrypted.nonce[0] ^= 0xFF;
      
      await expect(
        encryption.decrypt(encrypted, testKey)
      ).rejects.toThrow();
    });
    
    /**
     * Test encryption produces unique nonces
     * Requirements: 4.2
     */
    it('should produce unique nonces for each encryption', async () => {
      const content = Buffer.from('test content');
      
      const encrypted1 = await encryption.encrypt(content, testKey);
      const encrypted2 = await encryption.encrypt(content, testKey);
      
      // Nonces should be different (with overwhelming probability)
      expect(encrypted1.nonce).not.toEqual(encrypted2.nonce);
      
      // Both should decrypt correctly
      const decrypted1 = await encryption.decrypt(encrypted1, testKey);
      const decrypted2 = await encryption.decrypt(encrypted2, testKey);
      
      expect(decrypted1).toEqual(content);
      expect(decrypted2).toEqual(content);
    });
  });
  
  describe('Key Destruction', () => {
    /**
     * Test destroyKey with empty key buffer
     * Requirements: 2.5
     */
    it('should handle empty key buffer gracefully', () => {
      const emptyKey: TemporalKey = {
        id: 'empty-key',
        key: Buffer.alloc(0),
        validFrom: Date.now(),
        validUntil: Date.now() + 60000,
        gracePeriodEnd: Date.now() + 120000
      };
      
      // Should not throw
      expect(() => encryption.destroyKey(emptyKey)).not.toThrow();
    });
    
    /**
     * Test destroyKey is idempotent
     * Requirements: 2.5
     */
    it('should allow multiple calls to destroyKey', () => {
      const key: TemporalKey = {
        id: 'test-key',
        key: Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex'),
        validFrom: Date.now(),
        validUntil: Date.now() + 60000,
        gracePeriodEnd: Date.now() + 120000
      };
      
      // First destruction
      encryption.destroyKey(key);
      expect(key.key.every(b => b === 0)).toBe(true);
      
      // Second destruction should not throw
      expect(() => encryption.destroyKey(key)).not.toThrow();
      expect(key.key.every(b => b === 0)).toBe(true);
    });
    
    /**
     * Test destroyKey overwrites before zeroing
     * Requirements: 2.5
     */
    it('should overwrite key with random data before zeroing', () => {
      const originalKey = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
      const key: TemporalKey = {
        id: 'test-key',
        key: Buffer.from(originalKey),
        validFrom: Date.now(),
        validUntil: Date.now() + 60000,
        gracePeriodEnd: Date.now() + 120000
      };
      
      encryption.destroyKey(key);
      
      // Key should be zeroed
      expect(key.key.every(b => b === 0)).toBe(true);
      
      // Key should not equal original
      expect(key.key).not.toEqual(originalKey);
    });
  });
  
  describe('Additional Authenticated Data', () => {
    /**
     * Test encryption without AAD
     * Requirements: 4.2
     */
    it('should work without additional authenticated data', async () => {
      const content = Buffer.from('test content');
      
      const encrypted = await encryption.encrypt(content, testKey);
      const decrypted = await encryption.decrypt(encrypted, testKey);
      
      expect(decrypted).toEqual(content);
    });
    
    /**
     * Test encryption with AAD
     * Requirements: 4.2
     */
    it('should work with additional authenticated data', async () => {
      const content = Buffer.from('test content');
      const aad = Buffer.from('additional data');
      
      const encrypted = await encryption.encrypt(content, testKey, aad);
      const decrypted = await encryption.decrypt(encrypted, testKey, aad);
      
      expect(decrypted).toEqual(content);
    });
    
    /**
     * Test decryption fails with wrong AAD
     * Requirements: 4.2
     */
    it('should reject decryption with wrong AAD', async () => {
      const content = Buffer.from('test content');
      const aad = Buffer.from('additional data');
      const wrongAad = Buffer.from('wrong data');
      
      const encrypted = await encryption.encrypt(content, testKey, aad);
      
      await expect(
        encryption.decrypt(encrypted, testKey, wrongAad)
      ).rejects.toThrow();
    });
    
    /**
     * Test decryption fails when AAD is missing
     * Requirements: 4.2
     */
    it('should reject decryption when AAD is missing', async () => {
      const content = Buffer.from('test content');
      const aad = Buffer.from('additional data');
      
      const encrypted = await encryption.encrypt(content, testKey, aad);
      
      await expect(
        encryption.decrypt(encrypted, testKey)
      ).rejects.toThrow();
    });
    
    /**
     * Test decryption fails when AAD is provided but not used in encryption
     * Requirements: 4.2
     */
    it('should reject decryption when AAD is provided but was not used in encryption', async () => {
      const content = Buffer.from('test content');
      const aad = Buffer.from('additional data');
      
      const encrypted = await encryption.encrypt(content, testKey);
      
      await expect(
        encryption.decrypt(encrypted, testKey, aad)
      ).rejects.toThrow();
    });
  });
});
