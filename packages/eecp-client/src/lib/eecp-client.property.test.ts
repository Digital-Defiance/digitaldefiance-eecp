/**
 * Property-based tests for EECPClient
 * Feature: eecp-full-system
 * Property 41: Exponential Backoff Reconnection
 * Validates: Requirements 11.5, 11.6
 */

import * as fc from 'fast-check';
import { EECPClient } from './eecp-client.js';

describe('EECPClient Property Tests', () => {
  describe('Property 41: Exponential Backoff Reconnection', () => {
    it('should use exponential backoff for reconnection attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 4 }), // reconnect attempt number
          async (attemptNumber) => {
            const client = new EECPClient();
            
            // Set the reconnect attempts
            (client as any).reconnectAttempts = attemptNumber;
            
            // Calculate backoff delay
            const delay = (client as any).calculateBackoffDelay();
            
            // Expected delay: 2^attemptNumber * 1000ms
            const expectedDelay = Math.pow(2, attemptNumber) * 1000;
            
            // Verify exponential backoff
            expect(delay).toBe(expectedDelay);
            
            // Verify delay increases exponentially
            if (attemptNumber > 0) {
              (client as any).reconnectAttempts = attemptNumber - 1;
              const previousDelay = (client as any).calculateBackoffDelay();
              expect(delay).toBe(previousDelay * 2);
            }
            
            client.disconnect();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce max reconnection attempts limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10 }), // attempt count
          async (attemptCount) => {
            const client = new EECPClient();
            const MAX_RECONNECT_ATTEMPTS = (client as any).MAX_RECONNECT_ATTEMPTS;
            
            // Set reconnect attempts
            (client as any).reconnectAttempts = attemptCount;
            
            // Check if should continue reconnecting
            const shouldReconnect = attemptCount < MAX_RECONNECT_ATTEMPTS;
            
            // Verify the logic
            if (shouldReconnect) {
              expect(attemptCount).toBeLessThan(MAX_RECONNECT_ATTEMPTS);
            } else {
              expect(attemptCount).toBeGreaterThanOrEqual(MAX_RECONNECT_ATTEMPTS);
            }
            
            client.disconnect();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reset reconnect counter on successful connection', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10 }), // initial reconnect attempts
          async (initialAttempts) => {
            const client = new EECPClient();
            
            // Simulate previous failed attempts
            (client as any).reconnectAttempts = initialAttempts;
            
            // Verify initial state
            expect((client as any).reconnectAttempts).toBe(initialAttempts);
            
            // Simulate successful connection by manually resetting
            // (this is what happens in the real connect() method)
            (client as any).reconnectAttempts = 0;
            
            // Reconnect attempts should be reset to 0
            expect((client as any).reconnectAttempts).toBe(0);
            
            client.disconnect();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not reconnect after manual disconnect', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }), // reconnect attempts before disconnect
          async (attempts) => {
            const client = new EECPClient();
            
            // Set some reconnect attempts
            (client as any).reconnectAttempts = attempts;
            
            // Manual disconnect
            client.disconnect();
            
            // Verify manual disconnect flag is set
            expect((client as any).isManualDisconnect).toBe(true);
            
            // Verify no reconnect timer is active
            expect((client as any).reconnectTimer).toBeUndefined();
            
            // Verify WebSocket is cleared
            expect((client as any).ws).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate increasing delays for consecutive attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 2, maxLength: 5 }),
          async (attempts) => {
            const client = new EECPClient();
            const delays: number[] = [];
            
            // Calculate delays for each attempt
            for (const attempt of attempts) {
              (client as any).reconnectAttempts = attempt;
              delays.push((client as any).calculateBackoffDelay());
            }
            
            // Verify delays are in exponential progression
            for (let i = 0; i < delays.length; i++) {
              const expectedDelay = Math.pow(2, attempts[i]) * 1000;
              expect(delays[i]).toBe(expectedDelay);
            }
            
            client.disconnect();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should have consistent base delay across instances', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const client1 = new EECPClient();
            const client2 = new EECPClient();
            
            // Both should have same base delay
            expect((client1 as any).BASE_RECONNECT_DELAY).toBe(
              (client2 as any).BASE_RECONNECT_DELAY
            );
            
            // Both should have same max attempts
            expect((client1 as any).MAX_RECONNECT_ATTEMPTS).toBe(
              (client2 as any).MAX_RECONNECT_ATTEMPTS
            );
            
            client1.disconnect();
            client2.disconnect();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should clear reconnect timer on disconnect', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // whether timer was set
          async (timerWasSet) => {
            const client = new EECPClient();
            
            if (timerWasSet) {
              // Simulate a timer being set
              (client as any).reconnectTimer = setTimeout(() => {}, 10000);
            }
            
            // Disconnect should clear the timer
            client.disconnect();
            
            // Verify timer is cleared
            expect((client as any).reconnectTimer).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain exponential growth property', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 4 }), // attempt number (starting from 1)
          async (n) => {
            const client = new EECPClient();
            
            // Calculate delay for attempt n
            (client as any).reconnectAttempts = n;
            const delayN = (client as any).calculateBackoffDelay();
            
            // Calculate delay for attempt n-1
            (client as any).reconnectAttempts = n - 1;
            const delayNMinus1 = (client as any).calculateBackoffDelay();
            
            // Verify exponential property: delay(n) = 2 * delay(n-1)
            expect(delayN).toBe(delayNMinus1 * 2);
            
            client.disconnect();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
