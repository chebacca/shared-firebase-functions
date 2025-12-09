/**
 * Firebase Cloud Function for Sending License Emails with PDF Attachments
 * 
 * Handles sending emails with PDF attachments (templates or signed documents)
 * Downloads PDFs from Firebase Storage and attaches them to emails
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import * as nodemailer from 'nodemailer';
import * as admin from 'firebase-admin';
import { setCorsHeaders } from '../shared/utils';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const auth = getAuth();

interface SendLicenseEmailRequest {
  organizationId: string;
  licenseAgreementId: string;
  clipPitchId: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  message?: string;
  attachmentType: 'template' | 'signed_document' | 'none';
  attachmentId?: string; // Template ID or document ID
  signingMethod?: 'manual' | 'docusign'; // Signing method
  docusignEnvelopeId?: string; // DocuSign envelope ID (if sent via DocuSign)
}

interface EmailSettings {
  smtpConfig?: {
    enabled: boolean;
    provider: 'sendgrid' | 'gmail' | 'custom';
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
  };
}

/**
 * Helper function to remove undefined values from an object
 */
function removeUndefinedFields(obj: any): any {
  const cleaned: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
}

/**
 * Send license email with optional PDF attachment
 */
export const sendLicenseEmail = onRequest(
  {
    region: 'us-central1',
    cors: true, // Enable CORS at function level as backup
  },
  async (req: any, res: any) => {
    // Handle preflight OPTIONS request FIRST with explicit CORS headers
    if (req.method === 'OPTIONS') {
      const origin = req.headers.origin;
      // Allow localhost for development
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        res.set('Access-Control-Allow-Origin', origin);
      } else {
        res.set('Access-Control-Allow-Origin', origin || '*');
      }
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version, Origin');
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Max-Age', '3600');
      res.status(204).send('');
      return;
    }

    // Set CORS headers for actual request
    setCorsHeaders(req, res);

    // Declare sentBy outside try block so it's accessible in catch
    let sentBy: string = 'system';
    
    try {

      // Verify user is authenticated
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          errorDetails: 'Valid authentication token required'
        });
        return;
      }

      let decodedToken;
      try {
        const token = authHeader.split('Bearer ')[1];
        decodedToken = await auth.verifyIdToken(token);
        sentBy = decodedToken.uid;
      } catch (error) {
        res.status(401).json({
          success: false,
          error: 'Invalid token',
          errorDetails: 'Authentication token is invalid'
        });
        return;
      }

      // Parse request body
      const {
        organizationId,
        licenseAgreementId,
        clipPitchId,
        recipientEmail,
        recipientName,
        subject,
        message,
        attachmentType,
        attachmentId,
        signingMethod,
        docusignEnvelopeId
      } = req.body as SendLicenseEmailRequest;

      // Validate request
      if (!organizationId || !licenseAgreementId || !clipPitchId || !recipientEmail || !subject) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters',
          errorDetails: 'organizationId, licenseAgreementId, clipPitchId, recipientEmail, and subject are required'
        });
        return;
      }

      // Get email settings for the organization
      const emailSettingsDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('emailSettings')
        .doc('config')
        .get();

      if (!emailSettingsDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'Email settings not found',
          errorDetails: 'Email settings not found for organization'
        });
        return;
      }

      const emailSettings = emailSettingsDoc.data() as EmailSettings;

      // Check if SMTP is enabled
      if (!emailSettings.smtpConfig?.enabled) {
        res.status(412).json({
          success: false,
          error: 'SMTP not enabled',
          errorDetails: 'SMTP is not enabled for this organization'
        });
        return;
      }

      // Create email transporter
      const transporter = createEmailTransporter(emailSettings.smtpConfig);

      // Prepare attachment if needed
      let attachment: { filename: string; path: string } | null = null;

      console.log(`📎 [sendLicenseEmail] Attachment request: type=${attachmentType}, id=${attachmentId}`);

      if (attachmentType !== 'none' && attachmentId) {
        try {
          console.log(`📥 [sendLicenseEmail] Attempting to download attachment: ${attachmentType} (${attachmentId})`);
          attachment = await downloadPDFAttachment(organizationId, attachmentType, attachmentId);
          console.log(`✅ [sendLicenseEmail] Attachment downloaded successfully: ${attachment.filename}`);
        } catch (attachmentError) {
          console.error('❌ [sendLicenseEmail] Error downloading attachment:', attachmentError);
          console.error('❌ [sendLicenseEmail] Attachment error details:', {
            attachmentType,
            attachmentId,
            organizationId,
            error: attachmentError instanceof Error ? attachmentError.message : String(attachmentError),
            stack: attachmentError instanceof Error ? attachmentError.stack : undefined
          });
          // Continue without attachment if download fails, but log it clearly
          console.warn('⚠️ [sendLicenseEmail] Continuing without attachment - email will be sent without PDF');
        }
      } else {
        console.log(`ℹ️ [sendLicenseEmail] No attachment requested (type: ${attachmentType}, id: ${attachmentId})`);
      }

      // Prepare email content
      const htmlBody = generateLicenseEmailHTML(subject, message || '', recipientName);

      // Prepare mail options
      const mailOptions: any = {
        from: emailSettings.smtpConfig.username || process.env.SMTP_FROM_EMAIL,
        to: recipientEmail,
        subject: `[Clip Show Pro] ${subject}`,
        html: htmlBody,
        text: message || subject
      };

      // Add attachment if available
      if (attachment) {
        mailOptions.attachments = [{
          filename: attachment.filename,
          path: attachment.path
        }];
        console.log(`📎 [sendLicenseEmail] Attachment added to email: ${attachment.filename} from ${attachment.path}`);
      } else {
        console.log(`⚠️ [sendLicenseEmail] No attachment included in email`);
      }

      // Send email
      const result = await transporter.sendMail(mailOptions);

      // Fetch license to get projectId for data tenancy
      let projectId: string | undefined = undefined;
      try {
        const licenseRef = db.collection('clipShowLicenses').doc(licenseAgreementId);
        const licenseDoc = await licenseRef.get();
        
        if (licenseDoc.exists) {
          const licenseData = licenseDoc.data();
          projectId = licenseData?.projectId || undefined;
          console.log(`📋 [sendLicenseEmail] License ${licenseAgreementId} has projectId: ${projectId || 'none (org-level)'}`);
        }
      } catch (licenseError) {
        console.warn('⚠️ [sendLicenseEmail] Could not fetch license for projectId (non-critical):', licenseError);
        // Continue without projectId - this is non-critical for email sending
      }

      // Update license with DocuSign info if applicable
      if (signingMethod === 'docusign' && docusignEnvelopeId) {
        try {
          const licenseRef = db.collection('clipShowLicenses').doc(licenseAgreementId);
          await licenseRef.update({
            signingMethod: 'docusign',
            docusignEnvelopeId,
            docusignStatus: 'sent',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (docusignError) {
          console.warn('⚠️ [sendLicenseEmail] Could not update license with DocuSign info:', docusignError);
        }
      }

      // Log email to history (remove undefined values)
      const emailHistoryData = removeUndefinedFields({
        organizationId,
        licenseAgreementId,
        clipPitchId,
        recipientEmail,
        recipientName: recipientName || undefined,
        subject,
        message: message || undefined,
        attachmentType,
        attachmentId: attachmentId || undefined,
        sentBy,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        success: true,
        messageId: result.messageId,
        projectId: projectId || undefined, // Include projectId for data tenancy
        signingMethod: signingMethod || 'manual',
        docusignEnvelopeId: docusignEnvelopeId || undefined
      });

      const emailHistoryRef = await db
        .collection('clipShowLicenseEmailHistory')
        .add(emailHistoryData);

      // Update license agreement with email history ID
      try {
        const licenseRef = db.collection('clipShowLicenses').doc(licenseAgreementId);
        const licenseDoc = await licenseRef.get();
        
        if (licenseDoc.exists) {
          const existingHistory = licenseDoc.data()?.emailHistory || [];
          await licenseRef.update({
            emailHistory: [...existingHistory, emailHistoryRef.id],
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (updateError) {
        console.warn('⚠️ [sendLicenseEmail] Could not update license email history:', updateError);
        // Continue even if update fails
      }

      // Clean up temporary file
      if (attachment) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require('fs');
          if (fs.existsSync(attachment.path)) {
            fs.unlinkSync(attachment.path);
          }
        } catch (cleanupError) {
          console.warn('⚠️ [sendLicenseEmail] Could not clean up temp file:', cleanupError);
        }
      }

      console.log(`✅ [sendLicenseEmail] Email sent successfully: ${result.messageId}`);

      // Ensure CORS headers are set before sending response
      setCorsHeaders(req, res);
      
      res.status(200).json({
        success: true,
        emailHistoryId: emailHistoryRef.id,
        messageId: result.messageId
      });

    } catch (error) {
      console.error('❌ [sendLicenseEmail] Failed to send email:', error);

      // Ensure CORS headers are set even on error
      setCorsHeaders(req, res);

      // Log failed email attempt
      try {
        const {
          organizationId,
          licenseAgreementId,
          clipPitchId,
          recipientEmail,
          recipientName,
          subject,
          message,
          attachmentType,
          attachmentId
        } = req.body as SendLicenseEmailRequest;

        if (organizationId && licenseAgreementId) {
          // Fetch license to get projectId for data tenancy (even for failed emails)
          let projectId: string | undefined = undefined;
          try {
            const licenseRef = db.collection('clipShowLicenses').doc(licenseAgreementId);
            const licenseDoc = await licenseRef.get();
            if (licenseDoc.exists) {
              projectId = licenseDoc.data()?.projectId || undefined;
            }
          } catch (licenseError) {
            // Non-critical - continue without projectId
            console.warn('⚠️ [sendLicenseEmail] Could not fetch license for projectId in error log:', licenseError);
          }

          const errorLogData = removeUndefinedFields({
            organizationId,
            licenseAgreementId,
            clipPitchId: clipPitchId || '',
            recipientEmail: recipientEmail || '',
            recipientName: recipientName || undefined,
            subject: subject || 'Failed Email',
            message: message || undefined,
            attachmentType: attachmentType || 'none',
            attachmentId: attachmentId || undefined,
            sentBy: sentBy || 'system',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            projectId: projectId || undefined // Include projectId for data tenancy
          });

          await db.collection('clipShowLicenseEmailHistory').add(errorLogData);
        }
      } catch (logError) {
        console.error('❌ [sendLicenseEmail] Failed to log error:', logError);
      }

      res.status(500).json({
        success: false,
        error: 'Failed to send license email',
        errorDetails: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Download PDF attachment from Firebase Storage
 */
async function downloadPDFAttachment(
  organizationId: string,
  attachmentType: 'template' | 'signed_document',
  attachmentId: string
): Promise<{ filename: string; path: string }> {
  const storage = getStorage();
  // Get default bucket - Firebase Storage uses project default bucket
  const bucket = storage.bucket();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');

  console.log(`📥 [downloadPDFAttachment] Starting download: type=${attachmentType}, id=${attachmentId}, org=${organizationId}`);

  try {
    let storagePath: string;
    let documentData: any;

    if (attachmentType === 'template') {
      console.log(`📄 [downloadPDFAttachment] Fetching template document: ${attachmentId}`);
      // Get template document
      const templateDoc = await db.collection('clipShowLicenseTemplates').doc(attachmentId).get();
      if (!templateDoc.exists) {
        throw new Error(`Template not found: ${attachmentId}`);
      }

      documentData = templateDoc.data();
      console.log(`📄 [downloadPDFAttachment] Template data:`, {
        hasStorageUrl: !!documentData?.storageUrl,
        storageUrl: documentData?.storageUrl,
        fileName: documentData?.fileName,
        organizationId: documentData?.organizationId
      });

      if (!documentData?.storageUrl) {
        throw new Error(`Template storage URL not found for template: ${attachmentId}`);
      }

      // Extract path from storage URL
      storagePath = extractStoragePath(documentData.storageUrl);
      console.log(`📄 [downloadPDFAttachment] Extracted storage path: ${storagePath}`);
    } else {
      console.log(`📑 [downloadPDFAttachment] Fetching signed document: ${attachmentId}`);
      // Get signed document
      const documentDoc = await db.collection('clipShowSignedDocuments').doc(attachmentId).get();
      if (!documentDoc.exists) {
        throw new Error(`Signed document not found: ${attachmentId}`);
      }

      documentData = documentDoc.data();
      console.log(`📑 [downloadPDFAttachment] Document data:`, {
        hasStorageUrl: !!documentData?.storageUrl,
        storageUrl: documentData?.storageUrl,
        fileName: documentData?.fileName,
        organizationId: documentData?.organizationId
      });

      if (!documentData?.storageUrl) {
        throw new Error(`Document storage URL not found for document: ${attachmentId}`);
      }

      // Extract path from storage URL
      storagePath = extractStoragePath(documentData.storageUrl);
      console.log(`📑 [downloadPDFAttachment] Extracted storage path: ${storagePath}`);
    }

    // Verify organization match
    if (documentData.organizationId !== organizationId) {
      throw new Error(`Attachment organization mismatch: expected ${organizationId}, got ${documentData.organizationId}`);
    }

    // Download file from Storage
    const fileName = documentData.fileName || 'attachment.pdf';
    const tempFilePath = path.join(os.tmpdir(), `${Date.now()}_${fileName}`);

    console.log(`⬇️ [downloadPDFAttachment] Downloading from bucket: ${bucket.name}, path: ${storagePath}`);
    console.log(`💾 [downloadPDFAttachment] Saving to temp file: ${tempFilePath}`);

    const file = bucket.file(storagePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File does not exist in storage: ${storagePath}`);
    }

    await file.download({ destination: tempFilePath });

    // Verify file was downloaded
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(`Downloaded file not found at path: ${tempFilePath}`);
    }

    const stats = fs.statSync(tempFilePath);
    console.log(`✅ [downloadPDFAttachment] Downloaded attachment: ${fileName} (${stats.size} bytes)`);

    return {
      filename: fileName,
      path: tempFilePath
    };
  } catch (error) {
    console.error('❌ [downloadPDFAttachment] Error downloading attachment:', error);
    console.error('❌ [downloadPDFAttachment] Error details:', {
      attachmentType,
      attachmentId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * Extract storage path from Firebase Storage URL
 * Handles multiple URL formats:
 * 1. Firebase Storage API: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
 * 2. Google Cloud Storage: https://storage.googleapis.com/{bucket}/{path}
 */
function extractStoragePath(storageUrl: string): string {
  try {
    console.log(`🔍 [extractStoragePath] Processing URL: ${storageUrl}`);
    
    // Format 1: Firebase Storage API format
    // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
    if (storageUrl.includes('/o/')) {
      const urlParts = storageUrl.split('/o/');
      if (urlParts.length > 1) {
        const pathPart = urlParts[1].split('?')[0];
        const decodedPath = decodeURIComponent(pathPart);
        console.log(`✅ [extractStoragePath] Extracted path (API format): ${decodedPath}`);
        return decodedPath;
      }
    }
    
    // Format 2: Google Cloud Storage format
    // https://storage.googleapis.com/{bucket}/{path}
    if (storageUrl.includes('storage.googleapis.com/')) {
      const url = new URL(storageUrl);
      // Remove the bucket name from the path
      // URL: https://storage.googleapis.com/bucket-name/path/to/file.pdf
      // We need: path/to/file.pdf
      const pathParts = url.pathname.split('/');
      if (pathParts.length > 1) {
        // Skip the first empty part and the bucket name (usually at index 1)
        // For: /bucket-name/path/to/file.pdf
        // We want: path/to/file.pdf
        const bucketName = pathParts[1];
        const pathWithoutBucket = pathParts.slice(2).join('/');
        const decodedPath = decodeURIComponent(pathWithoutBucket);
        console.log(`✅ [extractStoragePath] Extracted path (GCS format): ${decodedPath} (bucket: ${bucketName})`);
        return decodedPath;
      }
    }
    
    // Format 3: Direct path (if URL is already just a path)
    if (!storageUrl.startsWith('http')) {
      console.log(`✅ [extractStoragePath] Using direct path: ${storageUrl}`);
      return storageUrl;
    }
    
    throw new Error(`Invalid storage URL format: ${storageUrl}`);
  } catch (error) {
    console.error('❌ [extractStoragePath] Error extracting storage path:', error);
    console.error('❌ [extractStoragePath] URL was:', storageUrl);
    throw new Error(`Failed to extract storage path from URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create email transporter based on SMTP configuration
 */
function createEmailTransporter(smtpConfig: any): nodemailer.Transporter {
  const config: any = {
    host: smtpConfig.host,
    port: smtpConfig.port || 587,
    secure: smtpConfig.secure || false,
    auth: {
      user: smtpConfig.username,
      pass: smtpConfig.password
    }
  };

  // Configure based on provider
  switch (smtpConfig.provider) {
    case 'sendgrid':
      config.host = 'smtp.sendgrid.net';
      config.port = 587;
      config.secure = false;
      config.auth = {
        user: 'apikey',
        pass: smtpConfig.password || process.env.SENDGRID_API_KEY
      };
      break;

    case 'gmail':
      config.host = 'smtp.gmail.com';
      config.port = 587;
      config.secure = false;
      config.auth = {
        user: smtpConfig.username,
        pass: smtpConfig.password || process.env.GMAIL_APP_PASSWORD
      };
      break;

    case 'custom':
      // Use provided configuration
      break;

    default:
      throw new Error(`Unsupported SMTP provider: ${smtpConfig.provider}`);
  }

  return nodemailer.createTransport(config);
}

/**
 * Generate HTML email template for license emails
 */
function generateLicenseEmailHTML(subject: string, message: string, recipientName?: string): string {
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          margin-bottom: 20px;
          font-size: 16px;
        }
        .message {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid #667eea;
          margin: 20px 0;
        }
        .footer {
          background-color: #f5f5f5;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #666;
          border-top: 1px solid #ddd;
        }
        .footer a {
          color: #667eea;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎬 Clip Show Pro</h1>
        </div>
        <div class="content">
          <div class="greeting">
            ${greeting}
          </div>
          ${message ? `
            <div class="message">
              ${message.replace(/\n/g, '<br>')}
            </div>
          ` : ''}
          <p>Please find the attached document for your review.</p>
        </div>
        <div class="footer">
          <p>This email was sent from Clip Show Pro</p>
          <p>
            <a href="https://backbone-client.web.app">Visit Dashboard</a> | 
            <a href="https://backbone-logic.web.app">Licensing Website</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

