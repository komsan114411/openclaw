/**
 * PIN and Login Constants
 * Centralized constants for PIN expiry timing (synchronized with backend)
 */

// PIN expiry (matches backend: PIN_EXPIRY_MINUTES = 5)
export const PIN_EXPIRY_SECONDS = 300; // 5 minutes (matches backend)
export const PIN_EXPIRY_MS = PIN_EXPIRY_SECONDS * 1000;

// PIN freshness thresholds
export const PIN_FRESH_SECONDS = 60;   // 1 minute - PIN is "fresh"
export const PIN_WARNING_SECONDS = 60; // 1 minute before expiry - show warning

// Countdown intervals
export const PIN_COUNTDOWN_INTERVAL_MS = 1000; // Update countdown every second

// PIN status types (matches backend PinStatus enum)
export type PinStatusType = 'FRESH' | 'NEW' | 'OLD' | 'NO_PIN';

/**
 * Calculate PIN status based on age
 */
export function getPinStatusFromAge(ageSeconds: number): PinStatusType {
  if (ageSeconds < PIN_FRESH_SECONDS) {
    return 'FRESH';
  } else if (ageSeconds < PIN_EXPIRY_SECONDS) {
    return 'NEW';
  } else {
    return 'OLD';
  }
}

/**
 * Check if PIN is still usable (not expired)
 */
export function isPinUsable(ageSeconds: number): boolean {
  return ageSeconds < PIN_EXPIRY_SECONDS;
}

/**
 * Get time remaining for PIN in seconds
 */
export function getPinTimeRemaining(ageSeconds: number): number {
  return Math.max(0, PIN_EXPIRY_SECONDS - ageSeconds);
}

/**
 * Format time remaining as "M:SS"
 */
export function formatTimeRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
