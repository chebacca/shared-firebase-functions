/**
 * Scheduled OAuth State Cleanup
 * 
 * Deletes expired OAuth state documents
 * Runs every 24 hours
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../../../shared/utils';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Cleanup expired OAuth states
 * Runs every 24 hours
 */
export const cleanupExpiredOAuthStates = onSchedule(
  {
    schedule: 'every 24 hours',
    region: 'us-central1',
    timeZone: 'America/Los_Angeles',
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
  },
  async (event) => {
    console.log('🧹 Starting OAuth state cleanup...');
    
    const now = Date.now();
    let deleted = 0;
    let errors = 0;
    
    try {
      // Get all OAuth states
      const statesSnapshot = await db.collection('oauthStates').get();
      
      for (const stateDoc of statesSnapshot.docs) {
        const stateData = stateDoc.data();
        const expiresAt = stateData.expiresAt?.toMillis();
        
        // Delete if expired (older than 1 hour)
        if (expiresAt && expiresAt < now) {
          try {
            await stateDoc.ref.delete();
            deleted++;
          } catch (error) {
            errors++;
            console.error(`❌ Failed to delete state ${stateDoc.id}:`, error);
          }
        }
      }
      
      console.log(`✅ OAuth state cleanup complete: ${deleted} deleted, ${errors} errors`);
    } catch (error) {
      console.error('❌ Error during OAuth state cleanup:', error);
    }
  }
);

