/**
 * Firebase Function: Get DocuSign Envelope Status
 * 
 * Gets the current status of a DocuSign envelope
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as docusign from 'docusign-esign';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

// Encryption key (should match the one used in storeDocuSignConfig)
const ENCRYPTION_KEY = process.env.DOCUSIGN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

function decrypt(encryptedData: { encrypted: string; iv: string; authTag: string }): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(encryptedData.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

async function getDocuSignConfig(organizationId: string): Promise<{
  integrationKey: string;
  userId: string;
  accountId: string;
  rsaPrivateKey?: string;
  baseUrl: string;
} | null> {
  try {
    const configRef = db.collection('organizations').doc(organizationId).collection('docuSignConfig').doc('default');
    const configDoc = await configRef.get();

    if (!configDoc.exists) {
      return null;
    }

    const configData = configDoc.data();
    if (!configData || !configData.enabled) {
      return null;
    }

    // Decrypt sensitive fields
    const encryptedIntegrationKey = JSON.parse(configData.integrationKey);
    const integrationKey = decrypt(encryptedIntegrationKey);
    
    const rsaPrivateKey = configData.rsaPrivateKey 
      ? decrypt(JSON.parse(configData.rsaPrivateKey))
      : undefined;

    if (!configData.accountId) {
      return null;
    }

    return {
      integrationKey,
      userId: configData.userId,
      accountId: configData.accountId,
      rsaPrivateKey,
      baseUrl: configData.baseUrl || 'https://demo.docusign.net'
    };
  } catch (error) {
    console.error('Error getting DocuSign config:', error);
    return null;
  }
}

export const getDocuSignEnvelopeStatus = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    try {
      const { organizationId, envelopeId } = request.data;

      if (!organizationId || !envelopeId) {
        return {
          success: false,
          error: 'Organization ID and Envelope ID are required'
        };
      }

      // Verify user is authenticated
      const authToken = request.auth?.token;
      if (!authToken) {
        return {
          success: false,
          error: 'Authentication required'
        };
      }

      // Get DocuSign configuration
      const config = await getDocuSignConfig(organizationId);
      if (!config) {
        return {
          success: false,
          error: 'DocuSign configuration not found or disabled'
        };
      }

      // Initialize DocuSign API client
      const apiClient = new docusign.ApiClient();
      apiClient.setBasePath(config.baseUrl);

      // Authenticate with JWT
      if (!config.rsaPrivateKey) {
        return {
          success: false,
          error: 'RSA Private Key is required for JWT authentication'
        };
      }

      const jwtLifeSec = 3600; // 1 hour
      const results = await apiClient.requestJWTUserToken(
        config.integrationKey,
        config.userId,
        ['signature', 'impersonation'],
        Buffer.from(config.rsaPrivateKey),
        jwtLifeSec
      );

      if (!results.body.accessToken) {
        return {
          success: false,
          error: 'Failed to authenticate with DocuSign'
        };
      }

      apiClient.addDefaultHeader('Authorization', `Bearer ${results.body.accessToken}`);

      // Get envelope status
      const envelopesApi = new docusign.EnvelopesApi(apiClient);
      const envelope = await envelopesApi.getEnvelope(config.accountId, envelopeId);

      return {
        success: true,
        status: envelope.status // sent, delivered, signed, completed, declined, voided
      };
    } catch (error: any) {
      console.error('Error getting DocuSign envelope status:', error);
      return {
        success: false,
        error: `Failed to get envelope status: ${error.message || 'Unknown error'}`
      };
    }
  }
);

