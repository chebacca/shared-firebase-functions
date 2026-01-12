/**
 * Shared Google encryption key secret
 * This secret is defined here and imported by all Google functions that need encryption
 */

import { defineSecret } from 'firebase-functions/params';

// Define the encryption key secret once, use it everywhere
export const encryptionKey = defineSecret('ENCRYPTION_KEY');

/**
 * Get the encryption key value
 * This must be called from within a Firebase Function execution context
 * (not at module load time)
 */
export function getEncryptionKey(): string {
  try {
    const key = encryptionKey.value();
    if (!key || key === '00000000000000000000000000000000') {
      throw new Error('Encryption key not configured. Please set ENCRYPTION_KEY secret.');
    }
    return key;
  } catch (error) {
    throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is set and declared in function secrets.');
  }
}

// Define the Google Maps API key secret
export const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');

/**
 * Get the Google Maps API key
 */
export function getGoogleMapsApiKey(): string {
  try {
    const key = googleMapsApiKey.value();
    if (!key) {
      // Allow fallback for local development if needed, or throw
      console.warn('GOOGLE_MAPS_API_KEY secret not found. Maps features may fail.');
      return '';
    }
    return key;
  } catch (error) {
    console.warn('Error accessing GOOGLE_MAPS_API_KEY secret:', error);
    return '';
  }
}

