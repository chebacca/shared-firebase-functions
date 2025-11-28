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
 * Get encryption key from Firebase Config
 * In production, this should be stored securely in Firebase Config
 */
function getEncryptionKey(): string {
  const config = functions.config();
  const key = config?.integrations?.encryption_key;
  
  if (!key) {
    throw new Error('Encryption key not configured in Firebase Config');
  }
  
  return key;
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
    
    const cipher = crypto.createCipher(ALGORITHM, key);
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
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    const key = deriveKey(masterKey, salt);
    
    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAAD(salt);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Token decryption failed:', error);
    throw new Error('Failed to decrypt tokens');
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
