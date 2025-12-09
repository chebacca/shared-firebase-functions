
import { getFirestore } from 'firebase-admin/firestore';
import * as nodemailer from 'nodemailer';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

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
  recipients: {
    adminEmails: string[];
    notificationEmails: string[];
  };
}

/**
 * Create Nodemailer transporter from SMTP config
 */
function createEmailTransporter(smtpConfig: any) {
  if (smtpConfig.provider === 'sendgrid') {
    return nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: smtpConfig.password
      }
    });
  } else if (smtpConfig.provider === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpConfig.username,
        pass: smtpConfig.password
      }
    });
  } else {
    // Custom SMTP
    return nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.username,
        pass: smtpConfig.password
      }
    });
  }
}

/**
 * Send a critical system alert to admin emails
 */
export async function sendSystemAlert(
  organizationId: string,
  subject: string,
  message: string,
  context?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🚨 [SystemAlert] Sending alert for organization ${organizationId}: ${subject}`);

    // Get email settings
    const emailSettingsDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('emailSettings')
      .doc('config')
      .get();

    if (!emailSettingsDoc.exists) {
      console.warn(`⚠️ [SystemAlert] Email settings not found for organization ${organizationId}`);
      return { success: false, error: 'Email settings not found' };
    }

    const emailSettings = emailSettingsDoc.data() as EmailSettings;

    // Check if SMTP is enabled
    if (!emailSettings.smtpConfig?.enabled) {
      console.warn(`⚠️ [SystemAlert] SMTP not enabled for organization ${organizationId}`);
      return { success: false, error: 'SMTP not enabled' };
    }

    // Get admin emails
    const adminEmails = emailSettings.recipients?.adminEmails || [];
    if (adminEmails.length === 0) {
      console.warn(`⚠️ [SystemAlert] No admin emails configured for organization ${organizationId}`);
      return { success: false, error: 'No admin emails configured' };
    }

    // Create transporter
    const transporter = createEmailTransporter(emailSettings.smtpConfig);

    // Format email body
    let htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #d32f2f; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
          <h1 style="margin: 0;">System Alert</h1>
        </div>
        <div style="border: 1px solid #ddd; padding: 20px; border-radius: 0 0 5px 5px;">
          <h2 style="color: #d32f2f; margin-top: 0;">${subject}</h2>
          <p style="font-size: 16px; line-height: 1.5;">${message}</p>
          
          ${context ? `
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px;">
              <h3 style="margin-top: 0; font-size: 14px;">Technical Details:</h3>
              <pre style="white-space: pre-wrap; font-size: 12px; overflow-x: auto;">${JSON.stringify(context, null, 2)}</pre>
            </div>
          ` : ''}
          
          <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
            <p>This is an automated system alert from Clip Show Pro. Please investigate immediately.</p>
            <p>Organization ID: ${organizationId}</p>
            <p>Timestamp: ${new Date().toISOString()}</p>
          </div>
        </div>
      </div>
    `;

    // Send email
    const mailOptions = {
      from: emailSettings.smtpConfig.username || 'system@clipshowpro.com',
      to: adminEmails.join(', '),
      subject: `[SYSTEM ALERT] ${subject}`,
      html: htmlBody,
      text: `${subject}\n\n${message}\n\nTechnical Details:\n${context ? JSON.stringify(context, null, 2) : 'None'}`
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ [SystemAlert] Alert sent successfully to ${adminEmails.length} recipients`);

    // Log to Firestore
    await db.collection('organizations').doc(organizationId).collection('systemAlertLogs').add({
      subject,
      message,
      context,
      recipients: adminEmails,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'sent'
    });

    return { success: true };
  } catch (error) {
    console.error(`❌ [SystemAlert] Failed to send alert:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

