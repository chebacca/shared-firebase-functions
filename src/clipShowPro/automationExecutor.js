/**
 * Automation Executor
 *
 * Cloud Functions for executing automation rules
 */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
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
// CORS helper function
function setCorsHeaders(res, origin) {
    const allowedOrigins = [
        'https://backbone-logic.web.app',
        'https://backbone-client.web.app',
        'https://backbone-callsheet-standalone.web.app',
        'https://dashboard-1c3a5.web.app',
        'https://clipshowpro.web.app', // Added Clip Show Pro origin
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4003',
        'http://localhost:4010',
        'http://localhost:5173',
        'null'
    ];
    // Always allow the origin that made the request in development mode
    if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
        res.set('Access-Control-Allow-Origin', origin || '*');
    }
    else if (origin && (allowedOrigins.includes(origin) || origin === 'null')) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    else {
        // In production, be more restrictive but still allow the request to proceed
        res.set('Access-Control-Allow-Origin', 'https://clipshowpro.web.app');
    }
    // Set other CORS headers
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version, Origin');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Max-Age', '3600'); // Cache preflight request for 1 hour
}
/**
 * Execute automation for a function
 */
export const executeAutomation = onCall({
    region: 'us-central1',
    invoker: 'public',
    cors: true,
}, async (request) => {
    try {
        const { functionId, functionName, context, organizationId, performedBy, performedByName } = request.data;
        // Validate request
        if (!functionId || !organizationId) {
            throw new HttpsError('invalid-argument', 'Missing required parameters');
        }
        // Get active automation rules for this function
        const rulesQuery = await db
            .collection('automationRules')
            .where('organizationId', '==', organizationId)
            .where('functionId', '==', functionId)
            .where('enabled', '==', true)
            .get();
        if (rulesQuery.empty) {
            console.log(`⚠️ [AutomationExecutor] No active automation rules for function: ${functionName}`);
            return {
                success: true,
                message: 'No active automation rules',
                rulesExecuted: 0
            };
        }
        const rules = rulesQuery.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log(`🔄 [AutomationExecutor] Executing ${rules.length} automation rules for function: ${functionName}`);
        // Execute each rule
        const results = [];
        let hasFailures = false;
        for (const rule of rules) {
            try {
                console.log(`📋 [AutomationExecutor] Processing rule: ${rule.name}`);
                for (const trigger of rule.triggers) {
                    if (!trigger.enabled)
                        continue;
                    const result = await processTrigger(trigger, context, rule.name, organizationId);
                    results.push({
                        ...result,
                        ruleId: rule.id,
                        ruleName: rule.name
                    });
                    if (result.status === 'failure') {
                        hasFailures = true;
                    }
                }
            }
            catch (error) {
                console.error(`❌ [AutomationExecutor] Error executing rule ${rule.name}:`, error);
                hasFailures = true;
                results.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    status: 'failure',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
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
            context,
            results,
            performedBy,
            performedByName,
            executedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ [AutomationExecutor] Automation execution completed for: ${functionName}`);
        return {
            success: true,
            rulesExecuted: rules.length,
            results
        };
    }
    catch (error) {
        console.error('❌ [AutomationExecutor] Error executing automation:', error);
        throw new HttpsError('internal', error instanceof Error ? error.message : 'Failed to execute automation');
    }
});
/**
 * Execute automation HTTP function (with proper CORS)
 */
export const executeAutomationHttp = onRequest({
    region: 'us-central1',
}, async (req, res) => {
    // Set CORS headers first thing
    setCorsHeaders(res, req.headers.origin);
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    try {
        // Only allow POST requests
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const { functionId, functionName, context, organizationId, performedBy, performedByName } = req.body;
        // Validate request
        if (!functionId || !organizationId) {
            res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
            return;
        }
        // Get active automation rules for this function
        const rulesQuery = await db
            .collection('automationRules')
            .where('organizationId', '==', organizationId)
            .where('functionId', '==', functionId)
            .where('enabled', '==', true)
            .get();
        if (rulesQuery.empty) {
            console.log(`⚠️ [AutomationExecutor HTTP] No active automation rules for function: ${functionName}`);
            res.status(200).json({
                success: true,
                message: 'No active automation rules',
                rulesExecuted: 0
            });
            return;
        }
        const rules = rulesQuery.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log(`🔄 [AutomationExecutor HTTP] Executing ${rules.length} automation rules for function: ${functionName}`);
        // Execute each rule
        const results = [];
        let hasFailures = false;
        for (const rule of rules) {
            try {
                console.log(`📋 [AutomationExecutor HTTP] Processing rule: ${rule.name}`);
                for (const trigger of rule.triggers) {
                    if (!trigger.enabled)
                        continue;
                    const result = await processTrigger(trigger, context, rule.name, organizationId);
                    results.push({
                        ...result,
                        ruleId: rule.id,
                        ruleName: rule.name
                    });
                    if (result.status === 'failure') {
                        hasFailures = true;
                    }
                }
            }
            catch (error) {
                console.error(`❌ [AutomationExecutor HTTP] Error executing rule ${rule.name}:`, error);
                hasFailures = true;
                results.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    status: 'failure',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
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
            context,
            results,
            performedBy,
            performedByName,
            executedAt: new Date().toISOString()
        });
        console.log(`✅ [AutomationExecutor HTTP] Automation execution completed for: ${functionName}`);
        res.status(200).json({
            success: true,
            rulesExecuted: rules.length,
            results
        });
    }
    catch (error) {
        console.error('❌ [AutomationExecutor HTTP] Error executing automation:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to execute automation'
        });
    }
});
/**
 * Process a single automation trigger
 */
async function processTrigger(trigger, context, ruleName, organizationId) {
    console.log(`🔄 [AutomationExecutor] Processing trigger: ${trigger.type} for rule: ${ruleName}`);
    switch (trigger.type) {
        case 'email':
            return await processEmailTrigger(trigger, context, ruleName, organizationId);
        case 'message':
            return await processMessageTrigger(trigger, context, ruleName, organizationId);
        case 'notification':
            return await processNotificationTrigger(trigger, context, ruleName, organizationId);
        default:
            return { status: 'failure', error: 'Unknown trigger type' };
    }
}
/**
 * Process email trigger
 */
async function processEmailTrigger(trigger, context, ruleName, organizationId) {
    console.log(`📧 [AutomationExecutor] Sending emails for trigger in rule: ${ruleName}`);
    try {
        // Get recipient emails
        const emails = trigger.recipients
            .filter(r => r.email)
            .map(r => r.email);
        if (emails.length === 0) {
            console.warn(`⚠️ [AutomationExecutor] No valid email addresses for recipients`);
            return {
                triggerType: 'email',
                status: 'failure',
                error: 'No valid email addresses'
            };
        }
        // Enrich context with flattened template variables
        const enrichedContext = enrichContextWithVariables(context);
        // Format subject and body with enriched context
        const subject = formatTemplate(trigger.subject || 'Automation Notification', enrichedContext);
        const customBody = formatTemplate(trigger.body || '', enrichedContext);
        // Generate automatic details section
        const recordDetailsHTML = formatRecordDetails(enrichedContext);
        // Combine custom body with record details
        const body = recordDetailsHTML
            ? `<div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin-bottom: 20px; border-radius: 4px;"><strong>Action Summary:</strong> ${customBody || 'An automated action has been executed'}</div>${recordDetailsHTML}`
            : customBody;
        // Create email transporter helper
        function createEmailTransporter(smtpConfig) {
            const config = {
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
        function generateEmailHTML(subject, body, type) {
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
            console.warn(`⚠️ [AutomationExecutor] Email settings not configured or disabled`);
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
                console.log(`✅ [AutomationExecutor] Email sent to ${email}: ${result.messageId}`);
                results.push({ email, success: true, messageId: result.messageId });
            }
            catch (error) {
                console.error(`❌ [AutomationExecutor] Failed to send email to ${email}:`, error);
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
    }
    catch (error) {
        console.error(`❌ [AutomationExecutor] Error processing email trigger:`, error);
        return {
            triggerType: 'email',
            status: 'failure',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
/**
 * Process message trigger
 */
async function processMessageTrigger(trigger, context, ruleName, organizationId) {
    console.log(`💬 [AutomationExecutor] Creating messages for trigger in rule: ${ruleName}`);
    try {
        // Get recipient IDs
        const recipientIds = trigger.recipients
            .filter(r => r.id)
            .map(r => r.id);
        if (recipientIds.length === 0) {
            console.warn(`⚠️ [AutomationExecutor] No valid recipient IDs for messages`);
            return {
                triggerType: 'message',
                status: 'failure',
                error: 'No valid recipient IDs'
            };
        }
        // Format subject and body with context
        const subject = formatTemplate(trigger.subject || 'Automation Message', context);
        const body = formatTemplate(trigger.body || '', context);
        // TODO: Create conversation and send message
        console.log(`💬 [AutomationExecutor] Would create message for recipients: ${recipientIds.join(', ')}`);
        console.log(`💬 [AutomationExecutor] Subject: ${subject}`);
        console.log(`💬 [AutomationExecutor] Body: ${body}`);
        return {
            triggerType: 'message',
            status: 'success',
            recipients: trigger.recipients.map(r => ({
                id: r.id,
                name: r.name
            }))
        };
    }
    catch (error) {
        console.error(`❌ [AutomationExecutor] Error processing message trigger:`, error);
        return {
            triggerType: 'message',
            status: 'failure',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
/**
 * Process notification trigger
 */
async function processNotificationTrigger(trigger, context, ruleName, organizationId) {
    console.log(`🔔 [AutomationExecutor] Creating notifications for trigger in rule: ${ruleName}`);
    try {
        // Get recipient IDs
        const recipientIds = trigger.recipients
            .filter(r => r.id)
            .map(r => r.id);
        if (recipientIds.length === 0) {
            console.warn(`⚠️ [AutomationExecutor] No valid recipient IDs for notifications`);
            return {
                triggerType: 'notification',
                status: 'failure',
                error: 'No valid recipient IDs'
            };
        }
        // Create notifications
        const batch = db.batch();
        recipientIds.forEach(userId => {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId,
                organizationId,
                type: 'automation',
                title: 'Automation Notification',
                message: formatTemplate('An automated action has been executed', context),
                data: context,
                read: false,
                createdAt: new Date().toISOString()
            });
        });
        await batch.commit();
        console.log(`🔔 [AutomationExecutor] Created ${recipientIds.length} notifications`);
        return {
            triggerType: 'notification',
            status: 'success',
            recipients: trigger.recipients.map(r => ({
                id: r.id,
                name: r.name
            }))
        };
    }
    catch (error) {
        console.error(`❌ [AutomationExecutor] Error processing notification trigger:`, error);
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
function formatTemplate(template, context) {
    let result = template;
    // Replace simple variables like {{variableName}}
    Object.keys(context).forEach(key => {
        const value = context[key];
        if (value !== undefined && value !== null) {
            result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value));
        }
    });
    return result;
}
