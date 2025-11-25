/**
 * Shared ECIES Configuration Module
 * 
 * Provides a centralized ECIES (Elliptic Curve Integrated Encryption Scheme)
 * configuration for the entire EECP system. Uses GuidV4Provider from
 * @digitaldefiance/ecies-lib to ensure consistent UUID v4 identifier generation
 * across all components.
 * 
 * This module exports:
 * - eciesConfig: Runtime configuration with GuidV4Provider
 * - eciesService: Shared ECIESService instance
 * - generateId(): Helper function for generating GuidV4-compatible IDs
 * 
 * All EECP components should use these exports to ensure consistent
 * cryptographic configuration and ID management.
 * 
 * @module ecies-config
 */

import { 
  createRuntimeConfiguration,
  GuidV4Provider, 
  ECIESService,
  type IConstants
} from '@digitaldefiance/ecies-lib';

/**
 * Global ECIES configuration with GuidV4Provider
 * 
 * Creates a runtime configuration for ecies-lib with a GuidV4Provider
 * for ID generation. This ensures all Member IDs are 16-byte GuidV4-compatible
 * Uint8Arrays that can be converted to/from standard UUID string format.
 * 
 * The configuration includes:
 * - GuidV4Provider for consistent UUID v4 generation
 * - Default cryptographic parameters from ecies-lib
 * - Secp256k1 elliptic curve for ECDSA and ECIES
 * 
 * @constant
 * @type {IConstants}
 * 
 * @example
 * ```typescript
 * import { eciesConfig } from './ecies-config.js';
 * 
 * // Use in custom ECIESService
 * const customService = new ECIESService(eciesConfig);
 * 
 * // Generate IDs
 * const id = eciesConfig.idProvider.generate();
 * ```
 */
export const eciesConfig: IConstants = createRuntimeConfiguration({
  idProvider: new GuidV4Provider()
});

/**
 * Shared ECIESService instance with GuidV4Provider
 * 
 * A pre-configured ECIESService instance that should be used throughout
 * the EECP system for all cryptographic operations. Using a shared instance
 * ensures consistent configuration across all components.
 * 
 * The service provides:
 * - Member creation and management
 * - ECIES encryption/decryption
 * - ECDSA signing/verification
 * - Key derivation and management
 * 
 * @constant
 * @type {ECIESService}
 * 
 * @example
 * ```typescript
 * import { eciesService } from './ecies-config.js';
 * 
 * // Create a new member
 * const { member } = Member.newMember(
 *   eciesService,
 *   MemberType.User,
 *   'Alice',
 *   new EmailString('alice@example.com')
 * );
 * 
 * // Use for multi-recipient encryption
 * const encryption = new MultiRecipientEncryption(eciesService);
 * ```
 */
export const eciesService = new ECIESService(eciesConfig);

/**
 * Generate a new GuidV4-compatible ID
 * 
 * Generates a 16-byte Uint8Array that represents a UUID v4 identifier.
 * The generated ID can be converted to/from standard UUID string format
 * using GuidV4 class methods.
 * 
 * This is a convenience function that wraps the idProvider.generate() method
 * from the shared eciesConfig.
 * 
 * @returns {Uint8Array} 16-byte GuidV4-compatible identifier
 * 
 * @example
 * ```typescript
 * import { generateId } from './ecies-config.js';
 * import { GuidV4 } from '@digitaldefiance/ecies-lib';
 * 
 * // Generate a new ID
 * const id = generateId();
 * console.log(id.length); // 16 bytes
 * 
 * // Convert to UUID string
 * const guid = GuidV4.fromBytes(id);
 * console.log(guid.asFullHexGuid); // "550e8400-e29b-41d4-a716-446655440000"
 * 
 * // Convert back to bytes
 * const bytes = guid.bytes;
 * ```
 */
export function generateId(): Uint8Array {
  return eciesConfig.idProvider.generate();
}
