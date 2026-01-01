/**
 * Shared ECIES configuration for EECP
 * 
 * Configures ECIESService with GuidV4Provider for consistent ID management
 * across the entire EECP system. With ecies-lib 4.7.14+, Member IDs are
 * 16-byte GuidV4-compatible UUIDs.
 */

import { 
  createRuntimeConfiguration,
  GuidV4Provider, 
  ECIESService,
  type IConstants
} from '@digitaldefiance/ecies-lib';

/**
 * Global ECIES configuration with GuidV4Provider
 * Member IDs will be 16-byte GuidV4-compatible Uint8Arrays
 */
export const eciesConfig: IConstants = createRuntimeConfiguration({
  idProvider: new GuidV4Provider()
});

/**
 * Shared ECIESService instance with GuidV4Provider
 * Use this throughout EECP for consistent configuration
 */
export const eciesService = new ECIESService(eciesConfig);

/**
 * Generate a new GuidV4-compatible ID
 * Returns a 16-byte Uint8Array that can be converted to/from UUID string format
 */
export function generateId(): Uint8Array {
  return eciesConfig.idProvider.generate();
}
