/**
 * Token Encryption Service
 * 
 * Handles secure encryption/decryption of OAuth tokens for cloud integrations
 * Uses AES-256 encryption with Firebase Config for key management
 */

import * as crypto from 'crypto';
import * as functions from 'firebase-functions';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For GCM, this is always 16
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Get encryption key from Firebase Config or Environment Variable
 * Supports both Firebase Functions v1 (config) and v2 (env vars/secrets)
 * In production, this should be stored securely in Firebase Config or as an environment variable
 */
function getEncryptionKey(): string {
  // Try environment variable first (Firebase Functions v2 - secrets are automatically available as env vars)
  const envKey = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (envKey && envKey.trim().length > 0) {
    console.log('✅ [encryption] Using encryption key from environment variable');
    return envKey;
  }
  
  // Fall back to Firebase Config (Firebase Functions v1)
  try {
    const config = functions.config();
    const key = config?.integrations?.encryption_key;
    
    if (key && key.trim().length > 0) {
      console.log('✅ [encryption] Using encryption key from Firebase Config');
      return key;
    }
  } catch (error) {
    // Config might not be available in v2 functions
    console.warn('⚠️ [encryption] functions.config() not available, trying environment variables');
  }
  
  console.error('❌ [encryption] Encryption key not found in environment variables or config');
  console.error('   Available env vars:', Object.keys(process.env).filter(k => k.includes('ENCRYPTION') || k.includes('INTEGRATION')));
  throw new Error('Encryption key not configured. Please set INTEGRATIONS_ENCRYPTION_KEY or ENCRYPTION_KEY environment variable, or configure integrations.encryption_key in Firebase Config.');
}

/**
 * Derive a key from the master key using PBKDF2
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt OAuth tokens before storing in Firestore
 */
export function encryptTokens(tokens: any): string {
  try {
    const masterKey = getEncryptionKey();
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(masterKey, salt);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(salt);
    
    let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine salt + iv + tag + encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Token encryption failed:', error);
    throw new Error('Failed to encrypt tokens');
  }
}

/**
 * Decrypt OAuth tokens from Firestore
 */
export function decryptTokens(encryptedData: string): any {
  try {
    const masterKey = getEncryptionKey();
    
    // Validate base64 format
    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error('Invalid encrypted data: must be a non-empty base64 string');
    }

    // Validate base64 characters (basic check)
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(encryptedData)) {
      throw new Error('Invalid base64 format in encrypted data');
    }

    const combined = Buffer.from(encryptedData, 'base64');
    
    // Validate buffer size (must be at least salt + iv + tag)
    const minSize = SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
    if (combined.length < minSize) {
      throw new Error(`Encrypted data too short: expected at least ${minSize} bytes, got ${combined.length}`);
    }
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    const key = deriveKey(masterKey, salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(salt);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    // Validate decrypted data is valid JSON
    try {
      return JSON.parse(decrypted);
    } catch (parseError) {
      // If JSON parse fails, the decrypted data might be a plain string (not JSON stringified)
      // This can happen if the original data was a string and JSON.stringify added quotes
      // Try to handle it gracefully
      if (decrypted.startsWith('"') && decrypted.endsWith('"')) {
        // Remove JSON string quotes
        return decrypted.slice(1, -1);
      }
      // If it's not JSON and not quoted, return as-is (might be a plain string)
      return decrypted;
    }
  } catch (error) {
    console.error('Token decryption failed:', error);
    throw new Error(`Failed to decrypt tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a secure random string for state parameter in OAuth flows
 */
export function generateSecureState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify state parameter to prevent CSRF attacks
 */
export function verifyState(receivedState: string, expectedState: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(receivedState, 'hex'),
    Buffer.from(expectedState, 'hex')
  );
}

/**
 * Hash sensitive data for logging (without exposing actual values)
 */
export function hashForLogging(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
}
