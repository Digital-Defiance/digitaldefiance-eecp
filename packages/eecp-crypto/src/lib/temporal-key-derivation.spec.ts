import { TemporalKeyDerivation } from './temporal-key-derivation.js';
import { TimeWindow } from '@digitaldefiance/eecp-protocol';

describe('TemporalKeyDerivation Unit Tests', () => {
  const derivation = new TemporalKeyDerivation();
  const workspaceSecret = Buffer.from('test-secret-32-bytes-long-here!');

  describe('deriveKey', () => {
    it('should derive a valid key with correct properties', async () => {
      const timeWindow: TimeWindow = {
        startTime: 1000000,
        endTime: 2000000,
        rotationInterval: 15,
        gracePeriod: 60000
      };
      const keyId = 'key-0';

      const key = await derivation.deriveKey(workspaceSecret, timeWindow, keyId);

      expect(key.id).toBe(keyId);
      expect(key.key).toBeInstanceOf(Buffer);
      expect(key.key.length).toBe(32); // AES-256 requires 32 bytes
      expect(key.validFrom).toBe(timeWindow.startTime);
      expect(key.validUntil).toBe(timeWindow.endTime);
      expect(key.gracePeriodEnd).toBe(timeWindow.endTime + timeWindow.gracePeriod);
    });

    it('should handle empty workspace secret', async () => {
      const emptySecret = Buffer.alloc(0);
      const timeWindow: TimeWindow = {
        startTime: 1000000,
        endTime: 2000000,
        rotationInterval: 15,
        gracePeriod: 60000
      };
      const keyId = 'key-0';

      // Should still derive a key (HKDF can work with empty IKM)
      const key = await derivation.deriveKey(emptySecret, timeWindow, keyId);
      
      expect(key.key).toBeInstanceOf(Buffer);
      expect(key.key.length).toBe(32);
    });

    it('should produce different keys for different time windows', async () => {
      const timeWindow1: TimeWindow = {
        startTime: 1000000,
        endTime: 2000000,
        rotationInterval: 15,
        gracePeriod: 60000
      };
      const timeWindow2: TimeWindow = {
        startTime: 2000000,
        endTime: 3000000,
        rotationInterval: 15,
        gracePeriod: 60000
      };
      const keyId = 'key-0';

      const key1 = await derivation.deriveKey(workspaceSecret, timeWindow1, keyId);
      const key2 = await derivation.deriveKey(workspaceSecret, timeWindow2, keyId);

      expect(key1.key.equals(key2.key)).toBe(false);
    });

    it('should produce different keys for different keyIds', async () => {
      const timeWindow: TimeWindow = {
        startTime: 1000000,
        endTime: 2000000,
        rotationInterval: 15,
        gracePeriod: 60000
      };

      const key1 = await derivation.deriveKey(workspaceSecret, timeWindow, 'key-0');
      const key2 = await derivation.deriveKey(workspaceSecret, timeWindow, 'key-1');

      expect(key1.key.equals(key2.key)).toBe(false);
    });
  });

  describe('getCurrentKeyId', () => {
    it('should return key-0 for timestamp at creation', () => {
      const createdAt = 1000000;
      const timestamp = 1000000;
      const rotationInterval = 15;

      const keyId = derivation.getCurrentKeyId(createdAt, timestamp, rotationInterval);

      expect(keyId).toBe('key-0');
    });

    it('should return key-1 after first rotation interval', () => {
      const createdAt = 1000000;
      const rotationInterval = 15;
      const timestamp = createdAt + (rotationInterval * 60 * 1000);

      const keyId = derivation.getCurrentKeyId(createdAt, timestamp, rotationInterval);

      expect(keyId).toBe('key-1');
    });

    it('should return key-2 after second rotation interval', () => {
      const createdAt = 1000000;
      const rotationInterval = 15;
      const timestamp = createdAt + (2 * rotationInterval * 60 * 1000);

      const keyId = derivation.getCurrentKeyId(createdAt, timestamp, rotationInterval);

      expect(keyId).toBe('key-2');
    });

    it('should handle rotation interval of 5 minutes', () => {
      const createdAt = 1000000;
      const rotationInterval = 5;
      const timestamp = createdAt + (5 * 60 * 1000);

      const keyId = derivation.getCurrentKeyId(createdAt, timestamp, rotationInterval);

      expect(keyId).toBe('key-1');
    });

    it('should handle rotation interval of 30 minutes', () => {
      const createdAt = 1000000;
      const rotationInterval = 30;
      const timestamp = createdAt + (30 * 60 * 1000);

      const keyId = derivation.getCurrentKeyId(createdAt, timestamp, rotationInterval);

      expect(keyId).toBe('key-1');
    });

    it('should handle rotation interval of 60 minutes', () => {
      const createdAt = 1000000;
      const rotationInterval = 60;
      const timestamp = createdAt + (60 * 60 * 1000);

      const keyId = derivation.getCurrentKeyId(createdAt, timestamp, rotationInterval);

      expect(keyId).toBe('key-1');
    });

    it('should handle boundary time windows - just before rotation', () => {
      const createdAt = 1000000;
      const rotationInterval = 15;
      const timestamp = createdAt + (rotationInterval * 60 * 1000) - 1;

      const keyId = derivation.getCurrentKeyId(createdAt, timestamp, rotationInterval);

      expect(keyId).toBe('key-0');
    });

    it('should handle boundary time windows - exactly at rotation', () => {
      const createdAt = 1000000;
      const rotationInterval = 15;
      const timestamp = createdAt + (rotationInterval * 60 * 1000);

      const keyId = derivation.getCurrentKeyId(createdAt, timestamp, rotationInterval);

      expect(keyId).toBe('key-1');
    });
  });

  describe('isKeyValid', () => {
    it('should return true for current key', () => {
      const keyId = 'key-0';
      const currentTime = 500000; // Within first rotation period
      const rotationInterval = 15;
      const gracePeriod = 60000;

      const isValid = derivation.isKeyValid(keyId, currentTime, rotationInterval, gracePeriod);

      expect(isValid).toBe(true);
    });

    it('should return true for key within grace period', () => {
      const keyId = 'key-0';
      const rotationInterval = 15;
      const gracePeriod = 60000;
      // Just after rotation but within grace period
      const currentTime = (rotationInterval * 60 * 1000) + 30000;

      const isValid = derivation.isKeyValid(keyId, currentTime, rotationInterval, gracePeriod);

      expect(isValid).toBe(true);
    });

    it('should return false for key beyond grace period', () => {
      const keyId = 'key-0';
      const rotationInterval = 15;
      const gracePeriod = 60000;
      // After grace period has expired
      const currentTime = (rotationInterval * 60 * 1000) + gracePeriod + 1000;

      const isValid = derivation.isKeyValid(keyId, currentTime, rotationInterval, gracePeriod);

      expect(isValid).toBe(false);
    });

    it('should return false for invalid keyId format', () => {
      const keyId = 'invalid-key';
      const currentTime = 500000;
      const rotationInterval = 15;
      const gracePeriod = 60000;

      const isValid = derivation.isKeyValid(keyId, currentTime, rotationInterval, gracePeriod);

      expect(isValid).toBe(false);
    });

    it('should handle boundary - exactly at grace period end', () => {
      const keyId = 'key-0';
      const rotationInterval = 15;
      const gracePeriod = 60000;
      // Exactly at grace period end
      const currentTime = (rotationInterval * 60 * 1000) + gracePeriod;

      const isValid = derivation.isKeyValid(keyId, currentTime, rotationInterval, gracePeriod);

      expect(isValid).toBe(false);
    });

    it('should handle boundary - one millisecond before grace period end', () => {
      const keyId = 'key-0';
      const rotationInterval = 15;
      const gracePeriod = 60000;
      // One millisecond before grace period end
      const currentTime = (rotationInterval * 60 * 1000) + gracePeriod - 1;

      const isValid = derivation.isKeyValid(keyId, currentTime, rotationInterval, gracePeriod);

      expect(isValid).toBe(true);
    });
  });
});
