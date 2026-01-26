/**
 * Firebase Function: DocuSign Webhook Handler
 * 
 * Handles webhook events from DocuSign (envelope completed, signed, etc.)
 * Updates license status and downloads signed documents
 */

import { onRequest } from 'firebase-functions/v2/https';
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

async function downloadDocumentFromDocuSign(
  config: { integrationKey: string; userId: string; accountId: string; rsaPrivateKey?: string; baseUrl: string },
  envelopeId: string
): Promise<Buffer> {
  if (!config.rsaPrivateKey) {
    throw new Error('RSA Private Key is required for JWT authentication');
  }
  // Initialize DocuSign API client
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(config.baseUrl);

  // Authenticate with JWT
  const jwtLifeSec = 3600; // 1 hour
  const results = await apiClient.requestJWTUserToken(
    config.integrationKey,
    config.userId,
    ['signature', 'impersonation'],
    Buffer.from(config.rsaPrivateKey),
    jwtLifeSec
  );

  if (!results.body.accessToken) {
    throw new Error('Failed to authenticate with DocuSign');
  }

  apiClient.addDefaultHeader('Authorization', `Bearer ${results.body.accessToken}`);

  // Get envelope documents
  const envelopesApi = new docusign.EnvelopesApi(apiClient);
  const documents = await envelopesApi.getDocument(config.accountId, envelopeId, 'combined');

  return Buffer.from(documents);
}

export const docuSignWebhookHandler = onRequest(
  {
    region: 'us-central1',
    cors: true,
    cpu: 0.5,
    memory: '512MiB',
  },
  async (req, res) => {
    try {
      // Handle preflight OPTIONS request
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
      }

      // Verify webhook signature (if configured)
      // In production, verify the X-DocuSign-Signature header

      const webhookData = req.body;
      const envelopeId = webhookData.data?.envelopeId || webhookData.envelopeId;
      const event = webhookData.event || webhookData.type;

      if (!envelopeId) {
        console.warn('Webhook received without envelope ID');
        res.status(400).json({ error: 'Envelope ID required' });
        return;
      }

      // Find license agreement by envelope ID
      const licensesQuery = await db.collection('clipShowLicenses')
        .where('docusignEnvelopeId', '==', envelopeId)
        .limit(1)
        .get();

      if (licensesQuery.empty) {
        console.warn(`No license found for envelope ${envelopeId}`);
        res.status(200).json({ success: true, message: 'Envelope not found in system' });
        return;
      }

      const licenseDoc = licensesQuery.docs[0];
      const licenseData = licenseDoc.data();
      const organizationId = licenseData.organizationId;

      // Get DocuSign configuration
      const config = await getDocuSignConfig(organizationId);
      if (!config) {
        console.error(`DocuSign config not found for organization ${organizationId}`);
        res.status(500).json({ error: 'DocuSign configuration not found' });
        return;
      }

      // Update license status based on event
      let newStatus = licenseData.docusignStatus;
      if (event === 'envelope-sent' || event === 'sent') {
        newStatus = 'sent';
      } else if (event === 'envelope-delivered' || event === 'delivered') {
        newStatus = 'delivered';
      } else if (event === 'envelope-signed' || event === 'signed') {
        newStatus = 'signed';
      } else if (event === 'envelope-completed' || event === 'completed') {
        newStatus = 'completed';

        // Download signed document and upload to Firebase Storage
        try {
          const documentBuffer = await downloadDocumentFromDocuSign(config, envelopeId);

          // Upload to Firebase Storage
          const bucket = storage.bucket();
          const fileName = `signed-documents/${organizationId}/${licenseDoc.id}/${envelopeId}_signed.pdf`;
          const file = bucket.file(fileName);

          await file.save(documentBuffer, {
            metadata: {
              contentType: 'application/pdf',
            },
          });

          // Make file publicly readable (or use signed URL)
          await file.makePublic();
          const downloadURL = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

          // Create or update signed document record
          const signedDocRef = db.collection('clipShowSignedDocuments').doc();
          await signedDocRef.set({
            licenseAgreementId: licenseDoc.id,
            clipPitchId: licenseData.clipPitchId,
            storageUrl: downloadURL,
            fileName: `${envelopeId}_signed.pdf`,
            fileSize: documentBuffer.length,
            uploadedBy: 'system',
            uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
            organizationId,
            projectId: licenseData.projectId
          });

          // Update license with signed document
          await licenseDoc.ref.update({
            signedDocumentId: signedDocRef.id,
            signedDocumentUrl: downloadURL,
            status: 'License Cleared', // Update license status
            docusignStatus: 'completed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          console.log(`✅ Signed document uploaded for license ${licenseDoc.id}`);
        } catch (downloadError) {
          console.error('Error downloading/uploading signed document:', downloadError);
          // Continue even if download fails - status is still updated
        }
      } else if (event === 'envelope-declined' || event === 'declined') {
        newStatus = 'declined';
      } else if (event === 'envelope-voided' || event === 'voided') {
        newStatus = 'voided';
      }

      // Update license with new status
      await licenseDoc.ref.update({
        docusignStatus: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        envelopeId,
        status: newStatus
      });
    } catch (error: any) {
      console.error('Error processing DocuSign webhook:', error);
      res.status(500).json({
        error: `Failed to process webhook: ${error.message || 'Unknown error'}`
      });
    }
  }
);

