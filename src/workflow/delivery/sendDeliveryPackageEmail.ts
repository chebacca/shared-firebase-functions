/**
 * Send Delivery Package Email
 *
 * Firebase Function to send delivery package emails using organization's SMTP settings
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../../lib/functionOptions';
import * as admin from 'firebase-admin';
// @ts-ignore - nodemailer types issue
const nodemailer = require('nodemailer');
import { getEnvironmentConfig } from '../utils/environment';

interface EmailSettings {
  // Old schema
  senderName?: string;
  senderEmail?: string;
  replyToEmail?: string;
  isEnabled?: boolean;
  smtpEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;

  // New schema
  smtpConfig?: {
    enabled: boolean;
    provider: 'sendgrid' | 'gmail' | 'custom';
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
    senderName?: string;
    senderEmail?: string;
    replyToEmail?: string;
  };
}

interface DeliveryPackageEmailData {
  organizationId: string;
  packageId: string;
  recipientEmails: string[];
  ccRecipients?: string[];
  subject: string;
  message: string;
  packageUrl?: string;
  sessionName: string;
  packageName: string;
}

/**
 * Get organization email settings from Firestore
 */
async function getOrganizationEmailSettings(organizationId: string): Promise<EmailSettings | null> {
  try {
    const settingsRef = admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('emailSettings')
      .doc('config');

    const settingsDoc = await settingsRef.get();

    if (!settingsDoc.exists) {
      return null;
    }

    return settingsDoc.data() as EmailSettings;
  } catch (error) {
    console.error('[sendDeliveryPackageEmail] Error fetching email settings:', error);
    return null;
  }
}

/**
 * Create SMTP transporter from email settings or environment
 */
function createTransporter(settings: EmailSettings | null): any {
  // Try new schema first
  if (settings?.smtpConfig?.enabled && settings.smtpConfig.username && settings.smtpConfig.password) {
    const config = settings.smtpConfig;
    let host = config.host;
    let port = config.port || 587;
    let secure = config.secure || false;

    if (config.provider === 'sendgrid') {
      host = 'smtp.sendgrid.net';
      port = 587;
    } else if (config.provider === 'gmail') {
      host = 'smtp.gmail.com';
      port = 587;
    }

    if (host) {
      return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user: config.username,
          pass: config.password
        }
      });
    }
  }

  // Fallback to old schema
  if (settings?.smtpEnabled && settings.smtpHost && settings.smtpUser && settings.smtpPassword) {
    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpSecure || false,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassword
      }
    });
  }

  // Final fallback to environment variables (Gmail)
  const envConfig = getEnvironmentConfig();
  if (envConfig.emailUser && envConfig.emailPass) {
    return nodemailer.createTransport({
      host: envConfig.emailHost || 'smtp.gmail.com',
      port: envConfig.emailPort || 587,
      secure: false,
      auth: {
        user: envConfig.emailUser,
        pass: envConfig.emailPass
      }
    });
  }

  return null;
}

/**
 * Generate email HTML content
 */
function generateEmailHTML(data: DeliveryPackageEmailData, packageUrl?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0;">Delivery Package Ready</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">Hello,</p>
    
    <p style="font-size: 16px;">
      Your delivery package for <strong>${data.sessionName}</strong> is ready.
    </p>
    
    <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea;">
      <h2 style="margin-top: 0; color: #667eea;">${data.packageName}</h2>
      <p style="margin-bottom: 0;"><strong>Session:</strong> ${data.sessionName}</p>
    </div>
    
    ${data.message ? `<div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
      <p style="white-space: pre-wrap;">${data.message}</p>
    </div>` : ''}
    
    ${packageUrl ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${packageUrl}" 
         style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        Download Package
      </a>
    </div>
    ` : ''}
    
    <p style="font-size: 14px; color: #666; margin-top: 30px;">
      If you have any questions, please contact the production team.
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; padding: 20px; color: #999; font-size: 12px;">
    <p>This is an automated message from Backbone Production Workflow System</p>
  </div>
</body>
</html>
  `;
}

/**
 * Send delivery package email
 */
export const sendDeliveryPackageEmail = onCall(defaultCallableOptions,
  async (request) => {
    try {
      const data = request.data as DeliveryPackageEmailData;

      // Verify authentication
      if (!request.auth) {
        throw new HttpsError(
          'unauthenticated',
          'User must be authenticated to send delivery emails'
        );
      }

      // Validate required fields
      if (!data.organizationId || !data.recipientEmails || !data.subject) {
        throw new HttpsError(
          'invalid-argument',
          'Missing required fields: organizationId, recipientEmails, subject'
        );
      }

      // Get organization email settings
      const emailSettings = await getOrganizationEmailSettings(data.organizationId);

      const isEnabled = emailSettings?.smtpConfig?.enabled || emailSettings?.isEnabled || false;

      if (!emailSettings || !isEnabled) {
        throw new HttpsError(
          'failed-precondition',
          'Email is not enabled for this organization'
        );
      }

      // Create transporter
      const transporter = createTransporter(emailSettings);

      if (!transporter) {
        throw new HttpsError(
          'failed-precondition',
          'Email service not configured. Please configure SMTP settings in Integrations.'
        );
      }

      // Generate email content
      const html = generateEmailHTML(data, data.packageUrl);
      const text = `
Delivery Package Ready

Your delivery package for ${data.sessionName} is ready.

Package: ${data.packageName}
Session: ${data.sessionName}

${data.message || ''}

${data.packageUrl ? `Download: ${data.packageUrl}` : ''}

This is an automated message from Backbone Production Workflow System.
      `.trim();

      // Send email to all recipients
      const emailPromises = data.recipientEmails.map(async (to) => {
        const senderName = emailSettings?.smtpConfig?.senderName || emailSettings?.senderName || 'Backbone Delivery';
        const senderEmail = emailSettings?.smtpConfig?.senderEmail || emailSettings?.senderEmail || emailSettings?.smtpConfig?.username || emailSettings?.smtpUser;
        const replyTo = emailSettings?.smtpConfig?.replyToEmail || emailSettings?.replyToEmail || senderEmail;

        const mailOptions = {
          from: `"${senderName}" <${senderEmail}>`,
          to,
          cc: data.ccRecipients || undefined,
          replyTo,
          subject: data.subject,
          html,
          text
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[sendDeliveryPackageEmail] Email sent to ${to}:`, info.messageId);
        return { to, messageId: info.messageId, success: true };
      });

      const results = await Promise.allSettled(emailPromises);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Update package status in Firestore
      if (successful > 0) {
        await admin.firestore()
          .collection('deliveryPackages')
          .doc(data.packageId)
          .update({
            status: 'sent',
            deliveredAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now()
          });
      }

      return {
        success: true,
        sent: successful,
        failed,
        results: results.map((r, i) => ({
          email: data.recipientEmails[i],
          status: r.status === 'fulfilled' ? 'sent' : 'failed',
          error: r.status === 'rejected' ? (r.reason as Error).message : undefined
        }))
      };
    } catch (error: any) {
      console.error('[sendDeliveryPackageEmail] Error:', error);
      throw new HttpsError(
        error.code || 'internal',
        error.message || 'Failed to send delivery package email'
      );
    }
  }
);

