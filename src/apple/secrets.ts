/**
 * Apple Connect Secrets Management
 * 
 * Handles encryption key retrieval for Apple Connect token encryption.
 * Uses INTEGRATIONS_ENCRYPTION_KEY (same as other integrations) so deploy
 * does not require a separate ENCRYPTION_KEY in Secret Manager.
 */

import { defineSecret } from 'firebase-functions/params';

// Use same secret as other integrations so one Secret Manager entry works for all
export const encryptionKey = defineSecret('INTEGRATIONS_ENCRYPTION_KEY');

/**
 * Get encryption key value (reads INTEGRATIONS_ENCRYPTION_KEY or ENCRYPTION_KEY)
 */
export function getEncryptionKey(): string {
  const key = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('INTEGRATIONS_ENCRYPTION_KEY (or ENCRYPTION_KEY) secret must be at least 32 characters');
  }
  return key;
}

