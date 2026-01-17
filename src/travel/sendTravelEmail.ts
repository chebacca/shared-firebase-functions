/**
 * Travel Email Function
 * 
 * Firebase Function for sending travel-related emails (approval requests, confirmations, etc.)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as nodemailer from 'nodemailer';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

interface TravelEmailRequest {
  organizationId: string;
  to: string | string[];
  subject: string;
  body: string;
  type: 'approval_request' | 'approval_confirmed' | 'booking_confirmation' | 'rejection';
  travelRequest?: any;
  actionUrl?: string;
  rejectionReason?: string;
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
 * Send travel-related email
 */
export const sendTravelEmail = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { organizationId, to, subject, body, type, travelRequest, actionUrl, rejectionReason } = request.data as TravelEmailRequest;

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

      if (!emailSettings.smtpConfig?.enabled) {
        throw new HttpsError('failed-precondition', 'SMTP is not enabled for this organization');
      }

      // Create email transporter
      const transporter = createEmailTransporter(emailSettings.smtpConfig);

      // Generate HTML email template
      const htmlBody = generateTravelEmailHTML(subject, body, type, travelRequest, actionUrl, rejectionReason);

      // Send email
      const recipients = Array.isArray(to) ? to : [to];
      const mailOptions = {
        from: emailSettings.smtpConfig.username || process.env.SMTP_FROM_EMAIL || 'noreply@backbone.com',
        to: recipients.join(', '),
        subject: `[Backbone Travel] ${subject}`,
        html: htmlBody,
        text: body
      };

      const result = await transporter.sendMail(mailOptions);

      // Log email to Firestore
      await db.collection('organizations').doc(organizationId).collection('emailNotificationLogs').add({
        to: recipients,
        subject,
        type: 'travel',
        travelRequestId: travelRequest?.id,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        success: true,
        messageId: result.messageId
      });

      console.log(`✅ [sendTravelEmail] Email sent successfully: ${result.messageId}`);

      return createSuccessResponse(
        { messageId: result.messageId },
        'Travel email sent successfully'
      );
    } catch (error: any) {
      console.error('[sendTravelEmail] Error:', error);
      
      // Log failed email attempt
      if (request.data?.organizationId) {
        try {
          await db.collection('organizations').doc(request.data.organizationId).collection('emailNotificationLogs').add({
            to: request.data.to,
            subject: request.data.subject,
            type: 'travel',
            travelRequestId: request.data.travelRequest?.id,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        } catch (logError) {
          console.error('[sendTravelEmail] Failed to log error:', logError);
        }
      }

      if (error instanceof HttpsError) {
        throw error;
      }

      return createErrorResponse(
        error.message || 'Failed to send travel email',
        error.stack
      );
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
 * Generate HTML email template for travel emails
 */
function generateTravelEmailHTML(
  subject: string,
  body: string,
  type: string,
  travelRequest?: any,
  actionUrl?: string,
  rejectionReason?: string
): string {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'approval_request': return '✈️';
      case 'approval_confirmed': return '✅';
      case 'booking_confirmation': return '🎫';
      case 'rejection': return '❌';
      default: return '📧';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'approval_request': return '#ff9800';
      case 'approval_confirmed': return '#4caf50';
      case 'booking_confirmation': return '#2196f3';
      case 'rejection': return '#f44336';
      default: return '#2196f3';
    }
  };

  // Build travel details section if travelRequest is provided
  let travelDetailsHtml = '';
  if (travelRequest) {
    const startDate = travelRequest.startDate ? new Date(travelRequest.startDate).toLocaleDateString() : 'TBD';
    const endDate = travelRequest.endDate ? new Date(travelRequest.endDate).toLocaleDateString() : 'TBD';
    const cost = travelRequest.estimatedTotalCost ? `$${travelRequest.estimatedTotalCost.toLocaleString()}` : 'TBD';
    
    travelDetailsHtml = `
      <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${getTypeColor(type)};">
        <h3 style="color: #333; margin-top: 0;">Travel Request Details</h3>
        <p><strong>Title:</strong> ${travelRequest.title || 'N/A'}</p>
        <p><strong>Destination:</strong> ${travelRequest.destination || 'TBD'}</p>
        <p><strong>Purpose:</strong> ${travelRequest.purpose || 'N/A'}</p>
        <p><strong>Dates:</strong> ${startDate} - ${endDate}</p>
        <p><strong>Estimated Cost:</strong> ${cost}</p>
        ${travelRequest.participants?.length > 0 ? `
          <p><strong>Participants:</strong> ${travelRequest.participants.map((p: any) => p.userName).join(', ')}</p>
        ` : ''}
      </div>
    `;
  }

  // Build action buttons if actionUrl is provided
  let actionButtonsHtml = '';
  if (actionUrl && type !== 'rejection') {
    actionButtonsHtml = `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${actionUrl}" 
           style="background: ${getTypeColor(type)}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
          ${type === 'approval_request' ? 'Review & Approve' : 'View Details'}
        </a>
      </div>
    `;
  }

  // Build rejection reason if provided
  let rejectionHtml = '';
  if (type === 'rejection' && rejectionReason) {
    rejectionHtml = `
      <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f44336;">
        <p style="margin: 0; color: #c62828;"><strong>Reason:</strong> ${rejectionReason}</p>
      </div>
    `;
  }

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
        <h1>✈️ Backbone Travel</h1>
      </div>
      <div class="content">
        <div class="notification-type">
          <span>${getTypeIcon(type)}</span>
          ${type.replace('_', ' ').toUpperCase()}
        </div>
        <div class="message">
          ${body.replace(/\n/g, '<br>')}
        </div>
        ${travelDetailsHtml}
        ${rejectionHtml}
        ${actionButtonsHtml}
        <div class="footer">
          <p>This email was sent from Backbone Travel Management System</p>
          <p>
            <a href="https://backbone-client.web.app">Visit Dashboard</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}
