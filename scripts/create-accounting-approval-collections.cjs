/**
 * Script to create Firestore collections for accounting approval system
 * 
 * Run with: node scripts/create-accounting-approval-collections.cjs
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
try {
  const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  // Try environment variable or default credentials
  try {
    admin.initializeApp();
  } catch (err) {
    console.error('Failed to initialize Firebase Admin:', err);
    process.exit(1);
  }
}

const db = admin.firestore();

async function createCollections() {
  console.log('🔧 Creating Firestore collections for accounting approval system...\n');

  try {
    // Collection: accountingApprovalAlerts
    console.log('📦 Creating collection: accountingApprovalAlerts');
    const alertRef = db.collection('accountingApprovalAlerts').doc('_schema');
    await alertRef.set({
      _schema: true,
      description: 'Stores accounting approval alerts when managers exceed approval thresholds',
      fields: {
        id: 'string (auto-generated)',
        organizationId: 'string (required)',
        alertType: 'string (TIMECARD_THRESHOLD | OVERTIME_THRESHOLD | COMPLIANCE_ISSUE | COMBINED_THRESHOLD)',
        severity: 'string (low | medium | high | urgent)',
        managerId: 'string (required)',
        managerName: 'string (required)',
        managerEmail: 'string (required)',
        maxApprovalHours: 'number (optional)',
        currentApprovedHours: 'number (required)',
        thresholdExceededBy: 'number (required)',
        timePeriod: {
          start: 'timestamp (required)',
          end: 'timestamp (required)'
        },
        timecardApprovalFlows: 'array<string> (optional)',
        overtimeRequests: 'array<string> (optional)',
        message: 'string (required)',
        requiresImmediateAction: 'boolean (required)',
        complianceNotes: 'string (optional)',
        status: 'string (PENDING | ACKNOWLEDGED | RESOLVED | ESCALATED)',
        acknowledgedBy: 'string (optional)',
        acknowledgedAt: 'timestamp (optional)',
        resolvedBy: 'string (optional)',
        resolvedAt: 'timestamp (optional)',
        resolutionNotes: 'string (optional)',
        createdAt: 'timestamp (required)',
        updatedAt: 'timestamp (required)'
      },
      indexes: [
        {
          fields: ['organizationId', 'status', 'createdAt'],
          collectionGroup: false
        },
        {
          fields: ['organizationId', 'managerId', 'status'],
          collectionGroup: false
        },
        {
          fields: ['organizationId', 'severity', 'status'],
          collectionGroup: false
        }
      ]
    });
    console.log('✅ Created accountingApprovalAlerts collection schema\n');

    // Collection: accountingApprovalNotifications
    console.log('📦 Creating collection: accountingApprovalNotifications');
    const notificationRef = db.collection('accountingApprovalNotifications').doc('_schema');
    await notificationRef.set({
      _schema: true,
      description: 'Stores accounting approval notifications sent to accounting personnel',
      fields: {
        id: 'string (auto-generated)',
        organizationId: 'string (required)',
        alertId: 'string (required)',
        alertType: 'string',
        severity: 'string',
        recipientIds: 'array<string> (required)',
        recipientEmails: 'array<string> (optional)',
        managerName: 'string (required)',
        managerEmail: 'string (required)',
        message: 'string (required)',
        requiresImmediateAction: 'boolean (required)',
        timecardApprovalFlows: 'array<string> (optional)',
        overtimeRequests: 'array<string> (optional)',
        sent: 'boolean (required)',
        sentAt: 'timestamp (optional)',
        readBy: 'array<string> (optional)',
        retryCount: 'number (optional)',
        lastRetryAt: 'timestamp (optional)',
        createdAt: 'timestamp (required)'
      },
      indexes: [
        {
          fields: ['organizationId', 'alertId'],
          collectionGroup: false
        },
        {
          fields: ['organizationId', 'recipientIds', 'sent'],
          collectionGroup: false
        }
      ]
    });
    console.log('✅ Created accountingApprovalNotifications collection schema\n');

    console.log('✅ All collections created successfully!\n');
    console.log('📝 Next steps:');
    console.log('   1. Create Firestore indexes (see indexes section above)');
    console.log('   2. Update Firestore security rules to allow access');
    console.log('   3. Deploy Firebase Functions');
    console.log('   4. Test the system\n');

  } catch (error) {
    console.error('❌ Error creating collections:', error);
    process.exit(1);
  }
}

// Run the script
createCollections()
  .then(() => {
    console.log('✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
