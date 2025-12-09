/**
 * Firebase Function: Store DocuSign Configuration
 * 
 * Securely stores DocuSign API credentials with encryption
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

// Encryption key (should be stored in environment variables in production)
const ENCRYPTION_KEY = process.env.DOCUSIGN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

export const storeDocuSignConfig = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    try {
      const { organizationId, integrationKey, userId, accountId, rsaPrivateKey, baseUrl, enabled } = request.data;

      if (!organizationId || !integrationKey || !userId) {
        return {
          success: false,
          message: 'Organization ID, Integration Key, and User ID are required'
        };
      }

      // Verify user is authenticated
      const authToken = request.auth?.token;
      if (!authToken) {
        return {
          success: false,
          message: 'Authentication required'
        };
      }

      // Encrypt sensitive fields
      const encryptedIntegrationKey = encrypt(integrationKey);
      const encryptedRsaKey = rsaPrivateKey ? encrypt(rsaPrivateKey) : undefined;

      // Store configuration
      const configRef = db.collection('organizations').doc(organizationId).collection('docuSignConfig').doc('default');
      
      const configData: any = {
        integrationKey: JSON.stringify(encryptedIntegrationKey),
        userId, // User ID doesn't need encryption (it's a GUID)
        enabled: enabled !== undefined ? enabled : true,
        baseUrl: baseUrl || 'https://demo.docusign.net',
        updatedAt: FieldValue.serverTimestamp()
      };

      if (accountId) {
        configData.accountId = accountId;
      }

      if (encryptedRsaKey) {
        configData.rsaPrivateKey = JSON.stringify(encryptedRsaKey);
      }

      // Check if config exists
      const existingConfig = await configRef.get();
      if (existingConfig.exists) {
        configData.createdAt = existingConfig.data()?.createdAt || FieldValue.serverTimestamp();
      } else {
        configData.createdAt = FieldValue.serverTimestamp();
      }

      await configRef.set(configData, { merge: true });

      return {
        success: true,
        message: 'DocuSign configuration stored successfully'
      };
    } catch (error: any) {
      console.error('Error storing DocuSign configuration:', error);
      return {
        success: false,
        message: `Failed to store configuration: ${error.message || 'Unknown error'}`
      };
    }
  }
);

