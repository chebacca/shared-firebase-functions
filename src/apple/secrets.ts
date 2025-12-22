/**
 * Apple Connect Secrets Management
 * 
 * Handles encryption key retrieval for Apple Connect token encryption
 */

import { defineSecret } from 'firebase-functions/params';

// Define the encryption key secret (shared with other integrations)
export const encryptionKey = defineSecret('ENCRYPTION_KEY');

/**
 * Get encryption key value
 */
export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_KEY secret must be at least 32 characters');
  }
  return key;
}

