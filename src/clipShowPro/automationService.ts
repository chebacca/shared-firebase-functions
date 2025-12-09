/**
 * Automation Service
 * 
 * Core logic for executing automation rules.
 * Shared by Cloud Functions (automationExecutor) and Triggers (automationTriggers).
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { enrichContextWithVariables, formatRecordDetails } from './recordDetailFormatter';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const auth = getAuth();

export interface AutomationRule {
  id: string;
  functionId: string;
  organizationId: string;
  enabled: boolean;
  name: string;
  triggers: AutomationTrigger[];
}

export interface AutomationTrigger {
  type: 'email' | 'notification';
  enabled: boolean;
  recipients: AutomationRecipient[];
  subject?: string;
  body?: string;
}

export interface AutomationRecipient {
  type: 'contact' | 'role' | 'user';
  id: string;
  name: string;
  email?: string;
}

export interface AutomationResult {
  success: boolean;
  message?: string;
  rulesExecuted: number;
  results?: any[];
  error?: string;
}

/**
 * Execute automation logic for a given function
 */
export async function executeAutomationLogic(
  functionId: string,
  functionName: string,
  context: any,
  organizationId: string,
  performedBy: string,
  performedByName?: string
): Promise<AutomationResult> {
  try {
    // Enrich context with function and user information
    const enrichedContext = {
      ...context,
      functionId,
      functionName,
      performedBy,
      performedByName
    };

    // Get active automation rules for this function
    const rulesQuery = await db
      .collection('automationRules')
      .where('organizationId', '==', organizationId)
      .where('functionId', '==', functionId)
      .where('enabled', '==', true)
      .get();

    if (rulesQuery.empty) {
      console.log(`⚠️ [AutomationService] No active automation rules for function: ${functionName}`);
      return {
        success: true,
        message: 'No active automation rules',
        rulesExecuted: 0
      };
    }

    const rules: AutomationRule[] = rulesQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AutomationRule));

    console.log(`🔄 [AutomationService] Executing ${rules.length} automation rules for function: ${functionName}`);

    // Execute each rule
    const results: any[] = [];
    let hasFailures = false;

    for (const rule of rules) {
      try {
        console.log(`📋 [AutomationService] Processing rule: ${rule.name}`);
        
        for (const trigger of rule.triggers) {
          if (!trigger.enabled) continue;

          const result = await processTrigger(trigger, enrichedContext, rule.name, organizationId);
          results.push({
            ...result,
            ruleId: rule.id,
            ruleName: rule.name
          });

          if (result.status === 'failure') {
            hasFailures = true;
          }
        }
      } catch (error) {
        console.error(`❌ [AutomationService] Error executing rule ${rule.name}:`, error);
        hasFailures = true;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'failure',
          error: errorMessage
        });

        // Send system alert for rule execution failure
        await sendSystemAlert(
          organizationId,
          'Automation Rule Failure',
          `Automation rule "${rule.name}" failed to execute.`,
          {
            ruleId: rule.id,
            ruleName: rule.name,
            functionName,
            error: errorMessage,
            performedBy
          }
        );
      }
    }

    // Log the execution
    await db.collection('automationLogs').add({
      functionId,
      functionName,
      ruleId: rules[0]?.id || '',
      ruleName: rules[0]?.name || '',
      organizationId,
      status: hasFailures ? 'partial' : 'success',
      context: enrichedContext,
      results,
      performedBy,
      performedByName,
      executedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ [AutomationService] Automation execution completed for: ${functionName}`);

    return {
      success: true,
      rulesExecuted: rules.length,
      results
    };

  } catch (error) {
    console.error('❌ [AutomationService] Error executing automation:', error);
    
    // Send system alert for critical automation failure
    if (organizationId) {
      await sendSystemAlert(
        organizationId,
        'Automation Execution Crash',
        'The automation executor crashed with an unhandled error.',
        {
          functionId,
          functionName,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );
    }

    throw error;
  }
}

/**
 * Process a single automation trigger
 */
async function processTrigger(
  trigger: AutomationTrigger,
  context: any,
  ruleName: string,
  organizationId: string
): Promise<any> {
  console.log(`🔄 [AutomationService] Processing trigger: ${trigger.type} for rule: ${ruleName}`);

  switch (trigger.type) {
    case 'email':
      return await processEmailTrigger(trigger, context, ruleName, organizationId);
    case 'notification':
      return await processNotificationTrigger(trigger, context, ruleName, organizationId);
    default:
      return { status: 'failure', error: 'Unknown trigger type' };
  }
}

/**
 * Process email trigger
 */
async function processEmailTrigger(
  trigger: AutomationTrigger,
  context: any,
  ruleName: string,
  organizationId: string
): Promise<any> {
  console.log(`📧 [AutomationService] Sending emails for trigger in rule: ${ruleName}`);
  
  try {
    // Get recipient emails from rule-configured recipients
    let emails = trigger.recipients
      .filter(r => r.email)
      .map(r => r.email as string);

    // If context has assignedContacts, resolve them and merge with rule recipients
    if (context.assignedContacts && Array.isArray(context.assignedContacts) && context.assignedContacts.length > 0) {
      console.log(`📧 [AutomationService] Found ${context.assignedContacts.length} assigned contacts in context`);
      const resolvedContacts = await resolveContactsToRecipients(context.assignedContacts, organizationId);
      console.log(`📧 [AutomationService] Resolved contacts:`, resolvedContacts.map(c => ({ id: c.id, name: c.name, email: c.email, userId: c.userId })));
      
      // Add email addresses from assigned contacts
      const assignedEmails = resolvedContacts
        .filter(c => c.email)
        .map(c => c.email as string);
      
      console.log(`📧 [AutomationService] Extracted ${assignedEmails.length} email addresses from contacts`);
      
      // Merge with rule recipients (avoid duplicates)
      emails = [...new Set([...emails, ...assignedEmails])];
      console.log(`📧 [AutomationService] Total emails after merging: ${emails.length} (rule: ${trigger.recipients.length}, contacts: ${assignedEmails.length})`);
    }

    if (emails.length === 0) {
      console.warn(`⚠️ [AutomationService] No valid email addresses for recipients`);
      return {
        triggerType: 'email',
        status: 'failure',
        error: 'No valid email addresses'
      };
    }

    // Enrich context with flattened template variables
    const enrichedContext = await enrichContextWithVariables(context);
    
    // Format subject and body with enriched context
    const subject = formatTemplate(trigger.subject || 'Automation Notification', enrichedContext);
    const customBody = formatTemplate(trigger.body || '', enrichedContext);
    
    // Generate navigation link
    const navigationLink = generateNavigationLink(enrichedContext);
    
    // Generate automatic details section (includes action summary at top)
    const recordDetailsHTML = formatRecordDetails(enrichedContext);
    
    // Combine custom body with record details
    // The recordDetailsHTML already includes action summary at the top, so we can include custom body if provided
    let body = '';
    if (customBody && customBody.trim()) {
      body = `<div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin-bottom: 20px; border-radius: 4px;"><strong>Custom Message:</strong> ${customBody}</div>`;
    }
    
    if (recordDetailsHTML) {
      body += recordDetailsHTML;
    } else {
      // Fallback if no record details available - use action summary HTML directly
      // formatRecordDetails will generate action summary even without full record details
      const fallbackHTML = formatRecordDetails(enrichedContext);
      if (fallbackHTML) {
        body += fallbackHTML;
      } else {
        // Last resort - format as simple HTML
        const actionSummary = formatActionSummaryText(enrichedContext);
        body += `<div style="padding: 20px; background: #f5f5f5; border-radius: 8px; white-space: pre-line;">${actionSummary.replace(/\n/g, '<br>')}</div>`;
      }
    }
    
    // Add navigation link button if available
    if (navigationLink) {
      body += `
        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center; border: 2px solid #667eea;">
          <p style="margin: 0 0 15px 0; color: #333; font-size: 14px;">View this record in Clip Show Pro:</p>
          <a href="${navigationLink}" 
             style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
            Open Record →
          </a>
          <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">If you're not logged in, you'll be prompted to sign in first.</p>
        </div>
      `;
    }

    // Create email transporter helper
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

    // Generate HTML email template
    function generateEmailHTML(subject: string, body: string, type: string): string {
      // Check if body contains HTML (record details)
      const isHTML = body.includes('<div') || body.includes('<table');
      
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
            .content {
              padding: 30px 20px;
            }
            .footer {
              background-color: #f5f5f5;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #666;
              border-top: 1px solid #ddd;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${subject}</h1>
            </div>
            <div class="content">
              ${isHTML ? body : `<p>${body.replace(/\n/g, '<br>')}</p>`}
            </div>
            <div class="footer">
              <p>This is an automated notification from Clip Show Pro</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Get email settings from organization
    const emailSettingsDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('emailSettings')
      .doc('config')
      .get();

    if (!emailSettingsDoc.exists || !emailSettingsDoc.data()?.smtpConfig?.enabled) {
      console.warn(`⚠️ [AutomationService] Email settings not configured or disabled`);
      return {
        triggerType: 'email',
        status: 'failure',
        error: 'Email settings not configured or disabled'
      };
    }

    const emailSettings = emailSettingsDoc.data();
    const transporter = createEmailTransporter(emailSettings.smtpConfig);

    // Send email to all recipients
    const results = [];
    for (const email of emails) {
      try {
        const mailOptions = {
          from: emailSettings.smtpConfig.username || process.env.SMTP_FROM_EMAIL,
          to: email,
          subject: `[Clip Show Pro] ${subject}`,
          html: generateEmailHTML(subject, body, 'automation'),
          text: body
        };

        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ [AutomationService] Email sent to ${email}: ${result.messageId}`);
        results.push({ email, success: true, messageId: result.messageId });
      } catch (error) {
        console.error(`❌ [AutomationService] Failed to send email to ${email}:`, error);
        results.push({ email, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    // Log email to Firestore
    await db.collection('organizations').doc(organizationId).collection('emailNotificationLogs').add({
      to: emails,
      subject,
      type: 'automation',
      sentAt: new Date().toISOString(),
      success: results.every(r => r.success),
      results
    });

    return {
      triggerType: 'email',
      status: results.every(r => r.success) ? 'success' : 'partial',
      recipients: trigger.recipients.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email
      })),
      emailResults: results
    };
  } catch (error) {
    console.error(`❌ [AutomationService] Error processing email trigger:`, error);
    return {
      triggerType: 'email',
      status: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process notification trigger
 */
async function processNotificationTrigger(
  trigger: AutomationTrigger,
  context: any,
  ruleName: string,
  organizationId: string
): Promise<any> {
  console.log(`🔔 [AutomationService] Creating notifications for trigger in rule: ${ruleName}`);
  
  try {
    // Get recipient IDs from rule-configured recipients
    let recipientIds = trigger.recipients
      .filter(r => r.id)
      .map(r => r.id);

    // If context has assignedContacts, resolve them and merge with rule recipients
    // Also check previousAssignedContacts for update scenarios where contacts might have been removed
    let contactsToNotify: string[] = [];
    
    if (context.assignedContacts && Array.isArray(context.assignedContacts) && context.assignedContacts.length > 0) {
      contactsToNotify = [...context.assignedContacts];
    }
    
    // For updates, also notify previous contacts if current contacts are empty or different
    if (context.previousAssignedContacts && Array.isArray(context.previousAssignedContacts) && context.previousAssignedContacts.length > 0) {
      // Merge with current contacts, avoiding duplicates
      const mergedContacts = [...new Set([...contactsToNotify, ...context.previousAssignedContacts])];
      if (mergedContacts.length > contactsToNotify.length) {
        console.log(`🔔 [AutomationService] Including ${mergedContacts.length - contactsToNotify.length} previous contacts for update notification`);
        contactsToNotify = mergedContacts;
      }
    }
    
    if (contactsToNotify.length > 0) {
      console.log(`🔔 [AutomationService] Found ${contactsToNotify.length} contacts to notify`);
      
      const resolvedContacts = await resolveContactsToRecipients(contactsToNotify, organizationId);
      
      // Add user IDs from assigned contacts
      // First, use userIds directly if available
      const directUserIds = resolvedContacts
        .filter(c => c.userId)
        .map(c => c.userId as string);
      
      // For contacts without userIds but with emails, try to find users by email
      const contactsWithoutUserId = resolvedContacts.filter(c => !c.userId && c.email);
      const userIdsFromEmail: string[] = [];
      
      for (const contact of contactsWithoutUserId) {
        if (contact.email) {
          try {
            const userRecord = await auth.getUserByEmail(contact.email);
            if (userRecord) {
              userIdsFromEmail.push(userRecord.uid);
            }
          } catch (error) {
            // User not found by email, that's okay
          }
        }
      }
      
      // Also check if contact IDs themselves are Firebase user IDs
      const contactIdsAsUserIds: string[] = [];
      for (const contactId of contactsToNotify) {
        if (directUserIds.includes(contactId) || userIdsFromEmail.includes(contactId)) {
          continue;
        }
        try {
          const userRecord = await auth.getUser(contactId);
          if (userRecord) {
            contactIdsAsUserIds.push(contactId);
          }
        } catch (error) {
          // Not a valid user ID, that's okay
        }
      }
      
      // Fallback: use contact IDs if no userIds found
      const contactIdsForNotifications = resolvedContacts
        .filter(c => !c.userId && !userIdsFromEmail.includes(c.id || '') && !contactIdsAsUserIds.includes(c.id || ''))
        .map(c => c.id);
      
      // Merge all recipient IDs (avoid duplicates)
      recipientIds = [...new Set([...recipientIds, ...directUserIds, ...userIdsFromEmail, ...contactIdsAsUserIds])];
    }

    if (recipientIds.length === 0) {
      console.warn(`⚠️ [AutomationService] No valid recipient IDs for notifications`);
      return {
        triggerType: 'notification',
        status: 'failure',
        error: 'No valid recipient IDs'
      };
    }

    // Create notifications
    const batch = db.batch();
    
    // Format message from context
    const enrichedContext = await enrichContextWithVariables(context);
    
    // Create detailed notification message with action summary
    const actionSummary = formatActionSummaryText(enrichedContext);
    const customMessage = trigger.body ? formatTemplate(trigger.body, enrichedContext) : '';
    
    // Combine custom message with action summary
    let notificationMessage = '';
    if (customMessage && customMessage.trim()) {
      notificationMessage = `${customMessage}\n\n---\n\n${actionSummary}`;
    } else {
      notificationMessage = actionSummary;
    }
    
    // Create descriptive title
    let notificationTitle = ruleName || enrichedContext.functionName || 'Automation Notification';
    if (enrichedContext.oldStatus && enrichedContext.newStatus) {
      notificationTitle = `Status Changed: ${enrichedContext.oldStatus} → ${enrichedContext.newStatus}`;
    } else if (enrichedContext.pitchTitle) {
      notificationTitle = `${enrichedContext.functionName || 'Automation'} - ${enrichedContext.pitchTitle}`;
    } else if (enrichedContext.storyTitle) {
      notificationTitle = `${enrichedContext.functionName || 'Automation'} - ${enrichedContext.storyTitle}`;
    }
    
    // Generate navigation link
    const navigationLink = generateNavigationLink(enrichedContext);
    
    recipientIds.forEach(userId => {
      const notificationRef = db.collection('notifications').doc();
      batch.set(notificationRef, {
        userId,
        organizationId,
        type: 'automation',
        title: notificationTitle,
        message: notificationMessage,
        data: {
          ...enrichedContext,
          navigationLink // Add navigation link to data for easy access
        },
        read: false,
        createdAt: admin.firestore.Timestamp.now()
      });
    });

    await batch.commit();

    console.log(`🔔 [AutomationService] Created ${recipientIds.length} notifications`);

    return {
      triggerType: 'notification',
      status: 'success',
      recipients: trigger.recipients.map(r => ({
        id: r.id,
        name: r.name
      }))
    };
  } catch (error) {
    console.error(`❌ [AutomationService] Error processing notification trigger:`, error);
    return {
      triggerType: 'notification',
      status: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Format template string with context variables
 */
function formatTemplate(template: string, context: any): string {
  let result = template;
  
  // Replace simple variables like {{variableName}}
  Object.keys(context).forEach(key => {
    const value = context[key];
    if (value !== undefined && value !== null) {
      result = result.replace(
        new RegExp(`{{\\s*${key}\\s*}}`, 'g'),
        String(value)
      );
    }
  });

  return result;
}

/**
 * Generate navigation link URL for a record based on context
 */
function generateNavigationLink(context: any, baseUrl: string = 'https://clipshowpro.web.app'): string | null {
  // Determine record type and ID
  let recordType: string | null = null;
  let recordId: string | null = null;
  
  // Check for calendar event first
  if (context.eventId) {
    return `${baseUrl}/calendar?eventId=${context.eventId}`;
  }
  
  if (context.pitchId || (context.pitch && context.pitch.id)) {
    recordType = 'pitch';
    recordId = context.pitchId || (context.pitch?.id);
  } else if (context.storyId || (context.story && context.story.id)) {
    recordType = 'story';
    recordId = context.storyId || (context.story?.id);
  } else if (context.showId || (context.show && context.show.id)) {
    recordType = 'show';
    recordId = context.showId || (context.show?.id);
  } else if (context.seasonId || (context.season && context.season.id)) {
    recordType = 'season';
    recordId = context.seasonId || (context.season?.id);
  }
  
  if (!recordType || !recordId) {
    return null;
  }
  
  // Generate URL based on record type
  switch (recordType) {
    case 'pitch':
      return `${baseUrl}/pitching-clearance?pitchId=${recordId}`;
    case 'story':
      return `${baseUrl}/stories?storyId=${recordId}`;
    case 'show':
      return `${baseUrl}/shows-management?showId=${recordId}`;
    case 'season':
      return `${baseUrl}/shows-management?seasonId=${recordId}`;
    default:
      return null;
  }
}

/**
 * Format action summary as plain text for notifications/messages
 */
function formatActionSummaryText(context: any): string {
  const functionName = context.functionName || context.functionId || 'Automation';
  const performedBy = context.performedByName || context.performedBy || 'System';
  
  let summary = `Action: ${functionName}`;
  
  if (context.oldStatus && context.newStatus) {
    summary = `Status Changed: ${context.oldStatus} → ${context.newStatus}`;
  } else if (context.producerId || context.assignedProducerId) {
    summary = `Producer Assigned`;
  } else if (functionName.toLowerCase().includes('create')) {
    summary = `Record Created`;
  } else if (functionName.toLowerCase().includes('update')) {
    summary = `Record Updated`;
  }
  
  const recordInfo: string[] = [];
  if (context.pitchTitle) recordInfo.push(`Pitch: ${context.pitchTitle}`);
  if (context.storyTitle) recordInfo.push(`Story: ${context.storyTitle}`);
  if (context.showName) recordInfo.push(`Show: ${context.showName}`);
  if (context.seasonName) recordInfo.push(`Season: ${context.seasonName}`);
  
  let result = `${summary}\n\n`;
  result += `Function: ${functionName}\n`;
  result += `Performed By: ${performedBy}\n`;
  result += `Performed At: ${context.performedAt || new Date().toLocaleString()}\n`;
  
  if (recordInfo.length > 0) {
    result += `\nRecord: ${recordInfo.join(', ')}\n`;
  }
  
  if (context.oldStatus && context.newStatus) {
    result += `\nPrevious Status: ${context.oldStatus}\n`;
    result += `New Status: ${context.newStatus}\n`;
    if (context.reason) {
      result += `Reason: ${context.reason}\n`;
    }
  }
  
  return result;
}

/**
 * Send system alert
 */
async function sendSystemAlert(
  organizationId: string,
  title: string,
  message: string,
  data: any
) {
  try {
    await db.collection('systemAlerts').add({
      organizationId,
      title,
      message,
      data,
      severity: 'error',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to send system alert:', error);
  }
}

/**
 * Resolve contact IDs to recipient objects with email and user ID
 */
async function resolveContactsToRecipients(
  contactIds: string[],
  organizationId: string
): Promise<Array<{ id: string; name: string; email?: string; userId?: string }>> {
  if (!contactIds || contactIds.length === 0) {
    return [];
  }

  try {
    console.log(`🔍 [AutomationService] Resolving ${contactIds.length} contacts to recipients`);
    
    const recipients: Array<{ id: string; name: string; email?: string; userId?: string }> = [];
    
    // Process in batches of 10 (Firestore 'in' query limit)
    for (let i = 0; i < contactIds.length; i += 10) {
      const batch = contactIds.slice(i, i + 10);
      const contactsSnapshot = await db
        .collection('clipShowContacts')
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .where('organizationId', '==', organizationId)
        .get();
      
      contactsSnapshot.forEach(doc => {
        const contactData = doc.data();
        recipients.push({
          id: doc.id,
          name: contactData.name || contactData.email || 'Unknown Contact',
          email: contactData.email,
          userId: contactData.userId // Some contacts may have associated userId
        });
      });
    }

    console.log(`✅ [AutomationService] Resolved ${recipients.length} contacts to recipients`);
    return recipients;
  } catch (error) {
    console.error(`❌ [AutomationService] Error resolving contacts:`, error);
    return [];
  }
}

