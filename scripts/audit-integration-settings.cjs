/**
 * Integration Settings Audit Script
 * 
 * Reviews all integration settings records across all organizations
 * Checks that credentials are saved properly and connections should work
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
let initialized = false;

// Method 1: Try environment variable
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || serviceAccount.projectId || 'backbone-logic'
    });
    initialized = true;
    console.log('✅ Using service account from GOOGLE_APPLICATION_CREDENTIALS');
  } catch (error) {
    console.warn('⚠️  Failed to load service account from env:', error.message);
  }
}

// Method 2: Try local service account files
if (!initialized) {
  const possiblePaths = [
    path.join(__dirname, '../../backbone-logic-firebase-adminsdk-fbsvc-3db30f4742.json'),
    path.join(__dirname, '../firebase-clipshow.json'),
    path.join(__dirname, '../serviceAccountKey.json'),
    path.join(__dirname, '../../serviceAccountKey.json')
  ];
  
  for (const serviceAccountPath of possiblePaths) {
    if (fs.existsSync(serviceAccountPath)) {
      try {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || serviceAccount.projectId || 'backbone-logic'
        });
        initialized = true;
        console.log(`✅ Using service account from: ${serviceAccountPath}`);
        break;
      } catch (error) {
        console.warn(`⚠️  Failed to load ${serviceAccountPath}:`, error.message);
      }
    }
  }
}

// Method 3: Try default credentials (Firebase CLI)
if (!initialized) {
  try {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'backbone-logic'
    });
    initialized = true;
    console.log('✅ Using default Firebase credentials (Firebase CLI)');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.error('\nPlease use one of these methods:');
    console.error('  1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable');
    console.error('  2. Place serviceAccountKey.json or firebase-clipshow.json in shared-firebase-functions directory');
    console.error('  3. Run: firebase login:ci (for Firebase CLI authentication)');
    process.exit(1);
  }
}

const db = admin.firestore();

// Integration types to check
const INTEGRATION_TYPES = {
  'google-drive-integration': {
    name: 'Google Drive',
    requiresCredentials: false, // Uses OAuth tokens in cloudIntegrations
    requiresCloudIntegration: true,
    cloudIntegrationPath: 'google'
  },
  'google-docs-integration': {
    name: 'Google Docs',
    requiresCredentials: false,
    requiresCloudIntegration: true,
    cloudIntegrationPath: 'google'
  },
  'box-integration': {
    name: 'Box',
    requiresCredentials: false,
    requiresCloudIntegration: true,
    cloudIntegrationPath: 'box'
  },
  'dropbox-integration': {
    name: 'Dropbox',
    requiresCredentials: false,
    requiresCloudIntegration: true,
    cloudIntegrationPath: 'dropbox'
  },
  'slack-integration': {
    name: 'Slack',
    requiresCredentials: true,
    credentialFields: ['appId', 'signingSecret'],
    requiresCloudIntegration: false
  },
  'email-integration': {
    name: 'Email',
    requiresCredentials: true,
    credentialFields: ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword'],
    requiresCloudIntegration: false
  },
  'airtable-integration': {
    name: 'Airtable',
    requiresCredentials: true,
    credentialFields: ['apiKey', 'baseId'],
    requiresCloudIntegration: false
  }
};

async function auditIntegrationSettings() {
  console.log('\n🔍 Starting Integration Settings Audit...\n');
  
  try {
    // Get all organizations
    const orgsSnapshot = await db.collection('organizations').get();
    console.log(`📊 Found ${orgsSnapshot.size} organizations\n`);
    
    const results = {
      totalOrgs: orgsSnapshot.size,
      orgsWithIntegrations: 0,
      integrations: {},
      issues: [],
      recommendations: []
    };
    
    // Initialize integration counters
    Object.keys(INTEGRATION_TYPES).forEach(type => {
      results.integrations[type] = {
        found: 0,
        enabled: 0,
        withCredentials: 0,
        withCloudIntegration: 0,
        working: 0,
        issues: []
      };
    });
    
    // Process each organization
    for (const orgDoc of orgsSnapshot.docs) {
      const orgId = orgDoc.id;
      const orgData = orgDoc.data();
      const orgName = orgData.name || orgData.displayName || orgId;
      
      console.log(`\n📁 Organization: ${orgName} (${orgId})`);
      console.log('─'.repeat(60));
      
      let orgHasIntegrations = false;
      
      // Check integrationConfigs collection
      const integrationConfigsRef = db.collection('organizations').doc(orgId).collection('integrationConfigs');
      const integrationConfigsSnapshot = await integrationConfigsRef.get();
      
      if (integrationConfigsSnapshot.empty) {
        console.log('  ⚠️  No integration configs found');
        continue;
      }
      
      orgHasIntegrations = true;
      results.orgsWithIntegrations++;
      
      // Process each integration config
      for (const configDoc of integrationConfigsSnapshot.docs) {
        const configId = configDoc.id;
        const configData = configDoc.data();
        const integrationType = INTEGRATION_TYPES[configId];
        
        if (!integrationType) {
          console.log(`  ⚠️  Unknown integration type: ${configId}`);
          continue;
        }
        
        results.integrations[configId].found++;
        
        console.log(`\n  🔌 ${integrationType.name} (${configId})`);
        
        // Check enabled status
        const isEnabled = configData.enabled === true;
        if (isEnabled) {
          results.integrations[configId].enabled++;
          console.log('    ✅ Enabled');
        } else {
          console.log('    ⏸️  Disabled');
        }
        
        // Check credentials
        const credentials = configData.credentials || {};
        const hasCredentials = Object.keys(credentials).length > 0;
        
        if (integrationType.requiresCredentials) {
          if (hasCredentials) {
            results.integrations[configId].withCredentials++;
            console.log('    ✅ Has credentials');
            
            // Check required credential fields
            const missingFields = integrationType.credentialFields.filter(
              field => !credentials[field] || credentials[field].trim() === ''
            );
            
            if (missingFields.length > 0) {
              const issue = {
                orgId,
                orgName,
                integration: integrationType.name,
                configId,
                type: 'missing_credentials',
                message: `Missing required credential fields: ${missingFields.join(', ')}`
              };
              results.integrations[configId].issues.push(issue);
              results.issues.push(issue);
              console.log(`    ❌ Missing credential fields: ${missingFields.join(', ')}`);
            } else {
              console.log('    ✅ All required credential fields present');
            }
          } else {
            const issue = {
              orgId,
              orgName,
              integration: integrationType.name,
              configId,
              type: 'no_credentials',
              message: 'No credentials found'
            };
            results.integrations[configId].issues.push(issue);
            results.issues.push(issue);
            console.log('    ❌ No credentials found');
          }
        }
        
        // Check cloud integration (for OAuth-based integrations)
        if (integrationType.requiresCloudIntegration) {
          const cloudIntegrationPath = integrationType.cloudIntegrationPath;
          
          // Check standard location
          let cloudIntegrationRef = db.collection('organizations').doc(orgId)
            .collection('cloudIntegrations').doc(cloudIntegrationPath);
          let cloudIntegrationDoc = await cloudIntegrationRef.get();
          
          // Fallback locations for Box
          if (!cloudIntegrationDoc.exists && cloudIntegrationPath === 'box') {
            cloudIntegrationRef = db.collection('organizations').doc(orgId)
              .collection('cloudIntegrations').doc('box_org');
            cloudIntegrationDoc = await cloudIntegrationRef.get();
          }
          
          if (cloudIntegrationDoc.exists) {
            results.integrations[configId].withCloudIntegration++;
            const cloudData = cloudIntegrationDoc.data();
            
            console.log('    ✅ Cloud integration document found');
            
            // Check if active
            const isActive = cloudData.isActive !== false;
            if (!isActive) {
              const issue = {
                orgId,
                orgName,
                integration: integrationType.name,
                configId,
                type: 'inactive_cloud_integration',
                message: 'Cloud integration marked as inactive'
              };
              results.integrations[configId].issues.push(issue);
              results.issues.push(issue);
              console.log('    ⚠️  Cloud integration is marked as inactive');
            }
            
            // Check if expired
            let expiresAt = null;
            if (cloudData.expiresAt) {
              if (typeof cloudData.expiresAt.toDate === 'function') {
                expiresAt = cloudData.expiresAt.toDate();
              } else if (typeof cloudData.expiresAt === 'number') {
                expiresAt = new Date(cloudData.expiresAt);
              }
            } else if (cloudData.expiresAtMillis) {
              expiresAt = new Date(Number(cloudData.expiresAtMillis));
            }
            
            if (expiresAt && expiresAt < new Date()) {
              const issue = {
                orgId,
                orgName,
                integration: integrationType.name,
                configId,
                type: 'expired_token',
                message: `Token expired on ${expiresAt.toISOString()}`
              };
              results.integrations[configId].issues.push(issue);
              results.issues.push(issue);
              console.log(`    ❌ Token expired: ${expiresAt.toISOString()}`);
            } else if (expiresAt) {
              console.log(`    ✅ Token valid until: ${expiresAt.toISOString()}`);
            }
            
            // Check account info
            if (cloudData.accountEmail) {
              console.log(`    📧 Account: ${cloudData.accountEmail}`);
            }
            if (cloudData.accountName) {
              console.log(`    👤 Name: ${cloudData.accountName}`);
            }
            
            // Check if has encrypted tokens
            if (cloudData.encryptedTokens) {
              console.log('    ✅ Has encrypted tokens');
              
              // Determine if connection should work
              if (isEnabled && isActive && (!expiresAt || expiresAt > new Date())) {
                results.integrations[configId].working++;
                console.log('    ✅ Connection should work');
              } else {
                console.log('    ⚠️  Connection may not work (check issues above)');
              }
            } else {
              const issue = {
                orgId,
                orgName,
                integration: integrationType.name,
                configId,
                type: 'no_tokens',
                message: 'No encrypted tokens found in cloud integration'
              };
              results.integrations[configId].issues.push(issue);
              results.issues.push(issue);
              console.log('    ❌ No encrypted tokens found');
            }
          } else {
            const issue = {
              orgId,
              orgName,
              integration: integrationType.name,
              configId,
              type: 'no_cloud_integration',
              message: `Cloud integration document not found at organizations/${orgId}/cloudIntegrations/${cloudIntegrationPath}`
            };
            results.integrations[configId].issues.push(issue);
            results.issues.push(issue);
            console.log(`    ❌ Cloud integration document not found (expected: ${cloudIntegrationPath})`);
          }
        }
        
        // Check test status
        if (configData.testStatus) {
          console.log(`    📊 Test Status: ${configData.testStatus}`);
          if (configData.testMessage) {
            console.log(`    💬 Message: ${configData.testMessage}`);
          }
        }
      }
    }
    
    // Print summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 AUDIT SUMMARY');
    console.log('='.repeat(60));
    console.log(`\nTotal Organizations: ${results.totalOrgs}`);
    console.log(`Organizations with Integrations: ${results.orgsWithIntegrations}`);
    
    console.log('\n📈 Integration Statistics:');
    Object.entries(results.integrations).forEach(([configId, stats]) => {
      const integrationType = INTEGRATION_TYPES[configId];
      if (stats.found > 0) {
        console.log(`\n  ${integrationType.name}:`);
        console.log(`    Found: ${stats.found}`);
        console.log(`    Enabled: ${stats.enabled}`);
        if (integrationType.requiresCredentials) {
          console.log(`    With Credentials: ${stats.withCredentials}`);
        }
        if (integrationType.requiresCloudIntegration) {
          console.log(`    With Cloud Integration: ${stats.withCloudIntegration}`);
        }
        console.log(`    Working: ${stats.working}`);
        if (stats.issues.length > 0) {
          console.log(`    Issues: ${stats.issues.length}`);
        }
      }
    });
    
    // Print issues
    if (results.issues.length > 0) {
      console.log('\n\n⚠️  ISSUES FOUND:');
      console.log('─'.repeat(60));
      
      results.issues.forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.integration} - ${issue.orgName} (${issue.orgId})`);
        console.log(`   Type: ${issue.type}`);
        console.log(`   Issue: ${issue.message}`);
        
        // Add recommendations
        if (issue.type === 'no_cloud_integration') {
          results.recommendations.push({
            orgId: issue.orgId,
            orgName: issue.orgName,
            integration: issue.integration,
            action: 'Reconnect OAuth - The integration record exists but OAuth tokens are missing. User needs to reconnect via Integration Settings.'
          });
        } else if (issue.type === 'expired_token') {
          results.recommendations.push({
            orgId: issue.orgId,
            orgName: issue.orgName,
            integration: issue.integration,
            action: 'Refresh OAuth - Token has expired. User should reconnect or the system should auto-refresh.'
          });
        } else if (issue.type === 'no_credentials') {
          results.recommendations.push({
            orgId: issue.orgId,
            orgName: issue.orgName,
            integration: issue.integration,
            action: 'Add Credentials - Integration requires credentials. User needs to configure in Integration Settings.'
          });
        } else if (issue.type === 'missing_credentials') {
          results.recommendations.push({
            orgId: issue.orgId,
            orgName: issue.orgName,
            integration: issue.integration,
            action: 'Complete Credentials - Some required credential fields are missing. User needs to complete configuration.'
          });
        }
      });
    } else {
      console.log('\n\n✅ No issues found! All integrations appear to be properly configured.');
    }
    
    // Print recommendations
    if (results.recommendations.length > 0) {
      console.log('\n\n💡 RECOMMENDATIONS:');
      console.log('─'.repeat(60));
      
      const recommendationsByOrg = {};
      results.recommendations.forEach(rec => {
        if (!recommendationsByOrg[rec.orgId]) {
          recommendationsByOrg[rec.orgId] = {
            orgName: rec.orgName,
            actions: []
          };
        }
        recommendationsByOrg[rec.orgId].actions.push({
          integration: rec.integration,
          action: rec.action
        });
      });
      
      Object.entries(recommendationsByOrg).forEach(([orgId, data]) => {
        console.log(`\n📁 ${data.orgName} (${orgId}):`);
        data.actions.forEach((action, index) => {
          console.log(`   ${index + 1}. ${action.integration}: ${action.action}`);
        });
      });
    }
    
    console.log('\n\n✅ Audit complete!\n');
    
  } catch (error) {
    console.error('\n❌ Audit failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the audit
auditIntegrationSettings()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

