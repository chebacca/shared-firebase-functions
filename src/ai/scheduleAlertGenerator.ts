/**
 * Schedule Alert Generator
 * 
 * Firebase Function that runs periodically (Cloud Scheduler)
 * Generates alerts for overdue items, conflicts, bottlenecks, and at-risk items
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { analyzeSchedules } from './predictive/ScheduleAnalyzer';

// Initialize Firebase Admin SDK if not already initialized
import * as admin from 'firebase-admin';
if (!admin.apps.length) {
  try {
    initializeApp();
  } catch (error) {
    // Firebase already initialized, continue
    console.log('[scheduleAlertGenerator] Firebase Admin already initialized');
  }
}

const db = getFirestore();

/**
 * Generate schedule alerts for all organizations
 * Runs every hour
 */
export const generateScheduleAlerts = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'America/Los_Angeles',
    region: 'us-central1'
  },
  async (event) => {
    console.log('[generateScheduleAlerts] Starting alert generation...');

    try {
      // Fetch all organizations
      const orgsSnapshot = await db.collection('organizations').get();
      const results = [];

      for (const orgDoc of orgsSnapshot.docs) {
        const orgId = orgDoc.id;
        try {
          const result = await generateAlertsForOrganization(orgId);
          results.push({ organizationId: orgId, ...result });
        } catch (error) {
          console.error(`[generateScheduleAlerts] Error for org ${orgId}:`, error);
          results.push({ 
            organizationId: orgId, 
            alertsGenerated: 0, 
            alertsStored: 0, 
            errors: [error instanceof Error ? error.message : 'Unknown error'] 
          });
        }
      }
      
      console.log('[generateScheduleAlerts] Alert generation completed', results);
    } catch (error) {
      console.error('[generateScheduleAlerts] Error generating alerts:', error);
      throw error;
    }
  }
);

/**
 * Callable function to manually trigger alert generation for current user's organization
 */
export const triggerAlertGeneration = onCall(
  {
    cors: true,
    region: 'us-central1'
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Get user's organization ID from their user document
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'User document not found');
    }

    const userData = userDoc.data();
    const organizationId = userData?.organizationId;

    if (!organizationId) {
      throw new HttpsError('failed-precondition', 'User does not have an organization');
    }

    try {
      const result = await generateAlertsForOrganization(organizationId);
      return {
        success: true,
        ...result,
        message: `Generated ${result.alertsGenerated} alerts, stored ${result.alertsStored}`
      };
    } catch (error) {
      console.error('[triggerAlertGeneration] Error:', error);
      throw new HttpsError('internal', `Failed to generate alerts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * Generate alerts for a specific organization
 * Can be called directly or from the scheduled function
 */
export async function generateAlertsForOrganization(
  organizationId: string
): Promise<{
  alertsGenerated: number;
  alertsStored: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let alertsStored = 0;

  try {
    // Analyze schedules and generate alerts
    const alerts = await analyzeSchedules(organizationId, {
      includeOverdue: true,
      includeConflicts: true,
      includeAtRisk: true,
      includeBottlenecks: true,
      daysAhead: 7
    });

    console.log(`[generateAlertsForOrganization] Generated ${alerts.length} alerts for organization ${organizationId}`);

    // First, get existing active alerts to check for duplicates and resolve old ones
    const existingAlertsSnapshot = await db.collection('clipShowAlerts')
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'active')
      .get();
    
    const existingAlertsMap = new Map<string, string>(); // entityType-entityId-type -> alertDocId
    existingAlertsSnapshot.forEach(doc => {
      const data = doc.data();
      const key = `${data.entityType}-${data.entityId}-${data.type}`;
      existingAlertsMap.set(key, doc.id);
    });
    
    console.log(`[generateAlertsForOrganization] Found ${existingAlertsMap.size} existing active alerts`);

    // Store alerts in Firestore
    const batch = db.batch();
    const alertsRef = db.collection('clipShowAlerts');
    const alertsToResolve: string[] = []; // Track alerts that should be resolved

    // Track which alerts we're creating/updating
    const newAlertKeys = new Set<string>();

    alerts.forEach(alert => {
      const alertKey = `${alert.entityType}-${alert.entityId}-${alert.type}`;
      newAlertKeys.add(alertKey);
      
      const existingAlertId = existingAlertsMap.get(alertKey);
      
      if (existingAlertId) {
        // Alert already exists - update it instead of creating duplicate
        const docRef = alertsRef.doc(existingAlertId);
        const createdAt = alert.createdAt 
          ? (alert.createdAt instanceof Date ? Timestamp.fromDate(alert.createdAt) : alert.createdAt)
          : Timestamp.now();
        
        batch.update(docRef, {
          ...alert,
          organizationId,
          status: 'active',
          createdAt,
          updatedAt: Timestamp.now(),
          // Ensure affectedUsers is an array
          affectedUsers: Array.isArray(alert.affectedUsers) ? alert.affectedUsers : []
        });
        alertsStored++;
        console.log(`[generateAlertsForOrganization] Updated existing alert: ${existingAlertId} for ${alertKey}`);
      } else {
        // New alert - create it
        const docRef = alertsRef.doc();
        const createdAt = alert.createdAt 
          ? (alert.createdAt instanceof Date ? Timestamp.fromDate(alert.createdAt) : alert.createdAt)
          : Timestamp.now();
        
        batch.set(docRef, {
          ...alert,
          organizationId,
          status: 'active',
          createdAt,
          // Ensure affectedUsers is an array
          affectedUsers: Array.isArray(alert.affectedUsers) ? alert.affectedUsers : []
        });
        alertsStored++;
        console.log(`[generateAlertsForOrganization] Created new alert for ${alertKey}`);
      }
    });

    // Mark old alerts as resolved if they're no longer in the new alerts list
    existingAlertsMap.forEach((alertId, alertKey) => {
      if (!newAlertKeys.has(alertKey)) {
        // This alert is no longer relevant - mark as resolved
        const docRef = alertsRef.doc(alertId);
        batch.update(docRef, {
          status: 'resolved',
          resolvedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        alertsToResolve.push(alertId);
        console.log(`[generateAlertsForOrganization] Resolving old alert: ${alertId} for ${alertKey}`);
      }
    });

    await batch.commit();
    
    if (alertsToResolve.length > 0) {
      console.log(`[generateAlertsForOrganization] Resolved ${alertsToResolve.length} old alerts that are no longer relevant`);
    }

    console.log(`[generateAlertsForOrganization] Stored ${alertsStored} alerts for organization ${organizationId}`);
    
    // Verify alerts were actually stored
    const verifyQuery = await db.collection('clipShowAlerts')
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'active')
      .limit(5)
      .get();
    
    console.log(`[generateAlertsForOrganization] Verification query found ${verifyQuery.size} active alerts (sampled first 5)`);
    if (verifyQuery.size > 0) {
      const sampleDoc = verifyQuery.docs[0].data();
      console.log(`[generateAlertsForOrganization] Sample alert:`, {
        id: verifyQuery.docs[0].id,
        organizationId: sampleDoc.organizationId,
        status: sampleDoc.status,
        type: sampleDoc.type,
        severity: sampleDoc.severity,
        hasCreatedAt: !!sampleDoc.createdAt
      });
    }

    return {
      alertsGenerated: alerts.length,
      alertsStored,
      errors
    };
  } catch (error) {
    const errorMsg = `Error generating alerts for organization ${organizationId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`[generateAlertsForOrganization] ${errorMsg}`, error);
    errors.push(errorMsg);
    
    return {
      alertsGenerated: 0,
      alertsStored: 0,
      errors
    };
  }
}

/**
 * Callable function to manually trigger alert generation for an organization
 */
export const generateAlerts = onCall(
  {
    cors: true,
    region: 'us-central1'
  },
  async (request) => {
    const { organizationId } = request.data;

    if (!organizationId) {
      throw new HttpsError(
        'invalid-argument',
        'organizationId is required'
      );
    }

    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    // Verify user has permission (admin or owner)
    // This would check user's role in the organization

    const result = await generateAlertsForOrganization(organizationId);

    return {
      success: true,
      ...result
    };
  }
);

