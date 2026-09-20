import { LocalPlatform } from './LocalPlatform';
import type { Platform } from './Platform';

export type * from './Platform';
export { LocalPlatform } from './LocalPlatform';

/**
 * Picks the platform adapter. `CrazyGamesPlatform` arrives in M6; until then
 * everything runs on `LocalPlatform`, which also serves tests and local dev.
 */
export function createPlatform(): Platform {
  return new LocalPlatform();
}
