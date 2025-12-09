/**
 * Firebase Function: Create DocuSign Envelope
 * 
 * Creates a DocuSign envelope from a license template and sends it for signing
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as docusign from 'docusign-esign';
import * as https from 'https';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const storage = getStorage();

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
      throw new Error('Account ID not found. Please test the connection first to auto-detect it.');
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

async function downloadFileFromUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

export const createDocuSignEnvelope = onCall(
  {
    region: 'us-central1',
    cors: true,
    timeoutSeconds: 300, // 5 minutes for file operations
  },
  async (request) => {
    try {
      const { 
        organizationId, 
        licenseAgreementId, 
        templateId, 
        templateUrl, 
        signerEmail, 
        signerName,
        emailSubject,
        emailBlurb
      } = request.data;

      if (!organizationId || !licenseAgreementId || !signerEmail || !signerName) {
        return {
          success: false,
          error: 'Organization ID, License Agreement ID, Signer Email, and Signer Name are required'
        };
      }

      if (!templateId && !templateUrl) {
        return {
          success: false,
          error: 'Either template ID or template URL is required'
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
          error: 'DocuSign configuration not found or disabled. Please configure DocuSign first.'
        };
      }

      // Get template URL if templateId is provided
      let pdfUrl = templateUrl;
      if (templateId && !templateUrl) {
        const templateRef = db.collection('clipShowLicenseTemplates').doc(templateId);
        const templateDoc = await templateRef.get();
        
        if (!templateDoc.exists) {
          return {
            success: false,
            error: 'License template not found'
          };
        }

        const templateData = templateDoc.data();
        pdfUrl = templateData?.storageUrl;
        
        if (!pdfUrl) {
          return {
            success: false,
            error: 'Template URL not found'
          };
        }
      }

      // Download PDF from Firebase Storage
      const pdfBuffer = await downloadFileFromUrl(pdfUrl);

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

      // Create envelope
      const envelopesApi = new docusign.EnvelopesApi(apiClient);

      // Create document
      const document = new docusign.Document();
      document.documentBase64 = pdfBuffer.toString('base64');
      document.name = `License Agreement - ${signerName}.pdf`;
      document.fileExtension = 'pdf';
      document.documentId = '1';

      // Create signer
      const signer = new docusign.Signer();
      signer.email = signerEmail;
      signer.name = signerName;
      signer.recipientId = '1';
      signer.routingOrder = '1';

      // Create sign here tab
      const signHere = new docusign.SignHere();
      signHere.documentId = '1';
      signHere.pageNumber = '1';
      signHere.recipientId = '1';
      signHere.tabLabel = 'SignHereTab';
      signHere.xPosition = '100';
      signHere.yPosition = '100';

      signer.tabs = new docusign.Tabs();
      signer.tabs.signHereTabs = [signHere];

      // Create recipients
      const recipients = new docusign.Recipients();
      recipients.signers = [signer];

      // Create envelope definition
      const envelopeDefinition = new docusign.EnvelopeDefinition();
      envelopeDefinition.emailSubject = emailSubject || 'Please sign this license agreement';
      envelopeDefinition.emailBlurb = emailBlurb || 'Please review and sign the attached license agreement.';
      envelopeDefinition.documents = [document];
      envelopeDefinition.recipients = recipients;
      envelopeDefinition.status = 'sent';

      // Create envelope
      const envelope = await envelopesApi.createEnvelope(config.accountId, {
        envelopeDefinition: envelopeDefinition
      });

      // Update license agreement with DocuSign information
      const licenseRef = db.collection('clipShowLicenses').doc(licenseAgreementId);
      await licenseRef.update({
        signingMethod: 'docusign',
        docusignEnvelopeId: envelope.envelopeId,
        docusignStatus: 'sent',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        envelopeId: envelope.envelopeId
      };
    } catch (error: any) {
      console.error('Error creating DocuSign envelope:', error);
      return {
        success: false,
        error: `Failed to create envelope: ${error.message || 'Unknown error'}`
      };
    }
  }
);

