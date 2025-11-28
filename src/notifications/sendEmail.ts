/**
 * Firebase Functions for Email Notifications
 * 
 * Handles sending email notifications via Nodemailer with SendGrid/Gmail SMTP
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as nodemailer from 'nodemailer';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

interface SendEmailRequest {
  organizationId: string;
  to: string | string[];
  subject: string;
  body: string;
  type: 'sync_complete' | 'sync_error' | 'conflict_detected' | 'daily_summary' | 'weekly_report' | 'test' | 'automation';
  context?: any;
}

interface TestEmailRequest {
  organizationId: string;
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
  recipients?: {
    adminEmails: string[];
    notificationEmails: string[];
  };
}

/**
 * Send notification email
 */
export const sendNotificationEmail = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
  try {
    const { organizationId, to, subject, body, type } = request.data as SendEmailRequest;

    // Validate request
    if (!organizationId || !to || !subject || !body || !type) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    // Get email settings for the organization
    const emailSettingsDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('emailSettings')
      .doc('config')
      .get();

    if (!emailSettingsDoc.exists) {
      throw new HttpsError('not-found', 'Email settings not found for organization');
    }

    const emailSettings = emailSettingsDoc.data() as EmailSettings;

    // Check if SMTP is enabled
    if (!emailSettings.smtpConfig?.enabled) {
      throw new HttpsError('failed-precondition', 'SMTP is not enabled for this organization');
    }

    // Create email transporter
    const transporter = createEmailTransporter(emailSettings.smtpConfig);

    // Prepare email content
    const recipients = Array.isArray(to) ? to : [to];
    const htmlBody = generateEmailHTML(subject, body, type);

    // Send email
    const mailOptions = {
      from: emailSettings.smtpConfig.username || process.env.SMTP_FROM_EMAIL,
      to: recipients.join(', '),
      subject: `[Clip Show Pro] ${subject}`,
      html: htmlBody,
      text: body
    };

    const result = await transporter.sendMail(mailOptions);

    // Log email to Firestore
    await logEmailNotification(organizationId, {
      to: recipients,
      subject,
      type,
      messageId: result.messageId,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: true
    });

    console.log(`✅ [EmailFunction] Email sent successfully: ${result.messageId}`);

    return {
      success: true,
      messageId: result.messageId
    };

  } catch (error) {
    console.error('❌ [EmailFunction] Failed to send email:', error);

    // Log failed email attempt
    if (request.data?.organizationId) {
      await logEmailNotification(request.data.organizationId, {
        to: request.data.to,
        subject: request.data.subject,
        type: request.data.type,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Failed to send email notification');
  }
  }
);

/**
 * Test email connection
 */
export const testEmailConnection = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
  try {
    const { organizationId } = request.data as TestEmailRequest;

    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'Organization ID is required');
    }

    // Get email settings for the organization
    const emailSettingsDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('emailSettings')
      .doc('config')
      .get();

    if (!emailSettingsDoc.exists) {
      throw new HttpsError('not-found', 'Email settings not found for organization');
    }

    const emailSettings = emailSettingsDoc.data() as EmailSettings;

    // Check if SMTP is enabled
    if (!emailSettings.smtpConfig?.enabled) {
      throw new HttpsError('failed-precondition', 'SMTP is not enabled for this organization');
    }

    // Create email transporter
    const transporter = createEmailTransporter(emailSettings.smtpConfig);

    // Test connection
    await transporter.verify();

    // Send test email to admin
    const adminEmails = emailSettings.recipients?.adminEmails || [];
    if (adminEmails.length === 0) {
      throw new HttpsError('failed-precondition', 'No admin emails configured');
    }

    const testSubject = 'Clip Show Pro - Email Test';
    const testBody = 'This is a test email to verify your email configuration is working correctly.';
    const htmlBody = generateEmailHTML(testSubject, testBody, 'test');

    const mailOptions = {
      from: emailSettings.smtpConfig.username || process.env.SMTP_FROM_EMAIL,
      to: adminEmails.join(', '),
      subject: `[Clip Show Pro] ${testSubject}`,
      html: htmlBody,
      text: testBody
    };

    const result = await transporter.sendMail(mailOptions);

    // Log test email
    await logEmailNotification(organizationId, {
      to: adminEmails,
      subject: testSubject,
      type: 'test',
      messageId: result.messageId,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: true
    });

    console.log(`✅ [EmailFunction] Test email sent successfully: ${result.messageId}`);

    return {
      success: true,
      messageId: result.messageId,
      message: 'Test email sent successfully'
    };

  } catch (error) {
    console.error('❌ [EmailFunction] Failed to test email connection:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Failed to test email connection');
  }
  }
);

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
 * Generate HTML email template
 */
function generateEmailHTML(subject: string, body: string, type: string): string {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'sync_complete': return '✅';
      case 'sync_error': return '❌';
      case 'conflict_detected': return '⚠️';
      case 'daily_summary': return '📊';
      case 'weekly_report': return '📈';
      case 'test': return '🧪';
      case 'automation': return '🔄';
      default: return '📧';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'sync_complete': return '#4caf50';
      case 'sync_error': return '#f44336';
      case 'conflict_detected': return '#ff9800';
      case 'daily_summary': return '#2196f3';
      case 'weekly_report': return '#9c27b0';
      case 'test': return '#607d8b';
      case 'automation': return '#00bcd4';
      default: return '#2196f3';
    }
  };

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
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          background: #f8f9fa;
          padding: 30px;
          border-radius: 0 0 8px 8px;
        }
        .notification-type {
          display: inline-flex;
          align-items: center;
          background: ${getTypeColor(type)};
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 20px;
        }
        .notification-type span {
          margin-right: 8px;
          font-size: 16px;
        }
        .message {
          background: white;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid ${getTypeColor(type)};
          margin-bottom: 20px;
        }
        .footer {
          text-align: center;
          color: #666;
          font-size: 12px;
          margin-top: 30px;
        }
        .footer a {
          color: #667eea;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎬 Clip Show Pro</h1>
      </div>
      <div class="content">
        <div class="notification-type">
          <span>${getTypeIcon(type)}</span>
          ${type.replace('_', ' ').toUpperCase()}
        </div>
        <div class="message">
          ${body.replace(/\n/g, '<br>')}
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

/**
 * Log email notification to Firestore
 */
async function logEmailNotification(organizationId: string, logData: any): Promise<void> {
  try {
    await db
      .collection('organizations')
      .doc(organizationId)
      .collection('emailNotificationLogs')
      .add(logData);
  } catch (error) {
    console.error('❌ [EmailFunction] Failed to log email notification:', error);
    // Don't throw error here as it's just logging
  }
}

/**
 * HTTP version of testEmailConnection with explicit CORS
 */
export const testEmailConnectionHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', req.headers.origin || 'https://clipshowpro.web.app');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Max-Age', '3600');
      res.status(204).send('');
      return;
    }

    // Set CORS headers for actual request
    res.set('Access-Control-Allow-Origin', req.headers.origin || 'https://clipshowpro.web.app');
    res.set('Access-Control-Allow-Credentials', 'true');

    try {
      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('❌ [testEmailConnectionHttp] Missing authorization header');
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
        console.log('✅ [testEmailConnectionHttp] Token verified for user:', decodedToken.email);
      } catch (authError) {
        console.error('❌ [testEmailConnectionHttp] Token verification failed:', authError);
        res.status(401).json({ success: false, error: 'Invalid token' });
        return;
      }
      
      const { organizationId } = req.body;

      if (!organizationId) {
        res.status(400).json({ success: false, error: 'Organization ID is required' });
        return;
      }

      console.log('📧 [testEmailConnectionHttp] Testing email for org:', organizationId);

      // Get email settings
      const emailSettingsDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('emailSettings')
        .doc('config')
        .get();

      if (!emailSettingsDoc.exists) {
        console.error('❌ [testEmailConnectionHttp] Email settings not found for org:', organizationId);
        res.status(404).json({ success: false, error: 'Email settings not found' });
        return;
      }

      const emailSettings = emailSettingsDoc.data() as EmailSettings;

      if (!emailSettings.smtpConfig?.enabled) {
        res.status(400).json({ success: false, error: 'SMTP is not enabled' });
        return;
      }

      // Create transporter and test
      const transporter = createEmailTransporter(emailSettings.smtpConfig);
      await transporter.verify();
      console.log('✅ [testEmailConnectionHttp] SMTP connection verified');

      // Send test email
      const adminEmails = emailSettings.recipients?.adminEmails || [];
      if (adminEmails.length === 0) {
        res.status(400).json({ success: false, error: 'No admin emails configured' });
        return;
      }

      const testSubject = 'Clip Show Pro - Email Test';
      const testBody = 'This is a test email to verify your email configuration is working correctly.';
      const htmlBody = generateEmailHTML(testSubject, testBody, 'test');

      const mailOptions = {
        from: emailSettings.smtpConfig.username || process.env.SMTP_FROM_EMAIL,
        to: adminEmails.join(', '),
        subject: `[Clip Show Pro] ${testSubject}`,
        html: htmlBody,
        text: testBody
      };

      const result = await transporter.sendMail(mailOptions);
      console.log('✅ [testEmailConnectionHttp] Test email sent:', result.messageId);

      // Log test email
      await logEmailNotification(organizationId, {
        to: adminEmails,
        subject: testSubject,
        type: 'test',
        messageId: result.messageId,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        success: true
      });

      res.status(200).json({
        success: true,
        messageId: result.messageId,
        message: 'Test email sent successfully'
      });

    } catch (error) {
      console.error('❌ [testEmailConnectionHttp] Error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }
);
