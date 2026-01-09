/**
 * Shared Slack encryption key secret
 * This secret is defined here and imported by all Slack functions that need encryption
 */

import { encryptionKey as unifiedKey } from '../integrations/unified-oauth/encryption';

// Re-export the unified encryption key secret to ensure the same instance is used everywhere
export const encryptionKey = unifiedKey;

/**
 * Get the encryption key value
 * This must be called from within a Firebase Function execution context
 * (not at module load time)
 */
export function getEncryptionKey(): string {
  try {
    const key = encryptionKey.value();
    // Use the same validation logic as encryption.ts roughly
    if (!key || typeof key !== 'string' || key.length < 32) {
      throw new Error('Encryption key not configured. Please set ENCRYPTION_KEY secret.');
    }
    return key;
  } catch (error) {
    throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is set and declared in function secrets.');
  }
}

