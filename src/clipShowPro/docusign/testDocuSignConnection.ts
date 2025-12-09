/**
 * Firebase Function: Test DocuSign Connection
 * 
 * Tests the DocuSign API connection and retrieves account information
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
  accountId?: string;
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
    if (!configData) {
      return null;
    }

    // Decrypt sensitive fields
    const encryptedIntegrationKey = JSON.parse(configData.integrationKey);
    const integrationKey = decrypt(encryptedIntegrationKey);
    
    const rsaPrivateKey = configData.rsaPrivateKey 
      ? decrypt(JSON.parse(configData.rsaPrivateKey))
      : undefined;

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

export const testDocuSignConnection = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    try {
      const { organizationId } = request.data;

      if (!organizationId) {
        return {
          success: false,
          message: 'Organization ID is required'
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

      // Get configuration
      const config = await getDocuSignConfig(organizationId);
      if (!config) {
        return {
          success: false,
          message: 'DocuSign configuration not found. Please configure DocuSign first.'
        };
      }

      // Initialize DocuSign API client
      const apiClient = new docusign.ApiClient();
      apiClient.setBasePath(config.baseUrl);

      // Use JWT authentication if RSA key is available
      if (config.rsaPrivateKey) {
        try {
          // Create JWT token
          const jwtLifeSec = 3600; // 1 hour
          const results = await apiClient.requestJWTUserToken(
            config.integrationKey,
            config.userId,
            ['signature', 'impersonation'],
            Buffer.from(config.rsaPrivateKey),
            jwtLifeSec
          );

          if (results.body.accessToken) {
            apiClient.addDefaultHeader('Authorization', `Bearer ${results.body.accessToken}`);
            
            // Get account information
            const userInfo = await apiClient.getUserInfo(results.body.accessToken);
            const accountId = userInfo.accounts?.[0]?.accountId;

            return {
              success: true,
              message: 'DocuSign connection successful',
              accountId: accountId || config.accountId
            };
          }
        } catch (jwtError: any) {
          console.error('JWT authentication failed:', jwtError);
          return {
            success: false,
            message: `JWT authentication failed: ${jwtError.message || 'Unknown error'}`
          };
        }
      } else {
        // OAuth flow would be required (not implemented in this test)
        return {
          success: false,
          message: 'RSA Private Key is required for JWT authentication. Please configure it in DocuSign settings.'
        };
      }
    } catch (error: any) {
      console.error('Error testing DocuSign connection:', error);
      return {
        success: false,
        message: `Connection test failed: ${error.message || 'Unknown error'}`
      };
    }
  }
);

