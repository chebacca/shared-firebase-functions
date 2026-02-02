/**
 * Firebase Storage Trigger for QC File Analysis
 * Automatically triggers QC analysis when files are uploaded to watched paths
 */

import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const db = getFirestore();

// Get default storage bucket name from Firebase project
// In Cloud Run/Firebase Functions environment, GCLOUD_PROJECT is always set
function getDefaultBucketName(): string {
  // Try environment variable first (can be set explicitly)
  if (process.env.STORAGE_BUCKET) {
    return process.env.STORAGE_BUCKET;
  }
  
  // Get project ID from environment (always available in Cloud Run)
  const projectId = process.env.GCLOUD_PROJECT || 
                    process.env.GCP_PROJECT ||
                    'backbone-logic'; // Fallback to known project ID
  
  // Firebase default bucket format: {project-id}.appspot.com
  return `${projectId}.appspot.com`;
}

/**
 * Find active QC bots that are watching a given path
 */
async function findBotsWatchingPath(filePath: string, organizationId: string): Promise<Array<{ id: string; config: any }>> {
  const botsRef = db.collection(`organizations/${organizationId}/qcBots`);
  const snapshot = await botsRef.where('status', '==', 'active').get();
  
  const matchingBots: Array<{ id: string; config: any }> = [];
  
  for (const doc of snapshot.docs) {
    const bot = doc.data();
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Check each watch path
    for (const watchPath of bot.config?.watchPaths || []) {
      if (!watchPath.isActive) continue;
      
      const normalizedWatchPath = watchPath.path.replace(/\\/g, '/');
      
      // Check if path matches
      let matches = false;
      if (watchPath.recursive) {
        matches = normalizedPath.startsWith(normalizedWatchPath);
      } else {
        const watchDir = normalizedWatchPath.endsWith('/') 
          ? normalizedWatchPath 
          : normalizedWatchPath + '/';
        const fileDir = normalizedPath.substring(0, normalizedPath.lastIndexOf('/') + 1);
        matches = fileDir === watchDir;
      }
      
      if (matches) {
        // Check file extension
        const fileExt = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
        if (watchPath.fileTypes.includes(fileExt)) {
          matchingBots.push({ id: doc.id, config: bot.config });
          break; // Only add bot once even if multiple paths match
        }
      }
    }
  }
  
  return matchingBots;
}

/**
 * Trigger QC analysis via HTTP callable function
 */
async function triggerQCAnalysis(
  botId: string,
  filePath: string,
  fileUrl: string,
  organizationId: string,
  metadata: { size?: number; contentType?: string }
): Promise<void> {
  try {
    // Import and call the QC analysis function directly
    // Note: Since triggerQCAnalysis is an onCall function, we need to call it via HTTP
    // Using Firebase Functions HTTP endpoint
    const functions = require('firebase-admin').functions();
    const triggerQCAnalysisFunction = functions.httpsCallable('triggerQCAnalysis');
    
    await triggerQCAnalysisFunction({
      botId,
      filePath,
      fileUrl,
      organizationId,
      fileSize: metadata.size,
      mimeType: metadata.contentType,
    });
    
    logger.info(`[onQCFileUpload] Triggered QC analysis for bot ${botId}, file: ${filePath}`);
  } catch (error) {
    logger.error(`[onQCFileUpload] Failed to trigger QC analysis:`, error);
    // Don't throw - allow file upload to complete even if QC analysis fails
    logger.warn(`[onQCFileUpload] Continuing despite QC analysis error`);
  }
}

/**
 * Storage trigger for QC file uploads
 * This function is called when a file is finalized in Firebase Storage
 * 
 * DISABLED: This function is currently disabled due to bucket region detection issues.
 * To re-enable:
 * 1. Ensure Firebase Storage bucket exists and is accessible
 * 2. Verify bucket region matches function region
 * 3. Uncomment the function initialization below
 * 
 * For Firebase Functions v2, the bucket must be specified explicitly.
 * Uses the default Firebase Storage bucket for the project.
 */
let onQCFileUpload: ReturnType<typeof onObjectFinalized> | undefined;

// TEMPORARILY DISABLED - Uncomment when bucket region can be determined during deployment
// The error "Can't find the storage bucket region" occurs because Firebase needs to
// determine the bucket's region during function definition, but the bucket may not
// be accessible or the region cannot be determined at that time.
//
// To re-enable:
// 1. Ensure Firebase Storage bucket exists: backbone-logic.appspot.com
// 2. Verify bucket region (should be multi-region "us" or specific region)
// 3. Uncomment the code below and adjust region if needed

/*
try {
  const bucketName = getDefaultBucketName();
  
  // Firebase Storage default buckets are typically multi-region "us"
  // The function region should match the bucket region
  onQCFileUpload = onObjectFinalized(
    {
      region: 'us', // Multi-region matches Firebase Storage default buckets
      bucket: bucketName,
    },
    async (event) => {
      const filePath = event.data.name;
      const bucket = event.data.bucket;
      const fileSize = event.data.size;
      const contentType = event.data.contentType;
      
      logger.info(`[onQCFileUpload] File uploaded: ${filePath} (${fileSize} bytes, ${contentType})`);
      
      // Extract organization ID from path if structured as: organizations/{orgId}/qc-files/...
      // Or get from metadata
      let organizationId = '';
      const pathParts = filePath.split('/');
      if (pathParts[0] === 'organizations' && pathParts.length > 1) {
        organizationId = pathParts[1];
      } else {
        // Try to get from file metadata
        const metadata = event.data.metadata || {};
        organizationId = metadata.organizationId || '';
      }
      
      if (!organizationId) {
        logger.warn(`[onQCFileUpload] No organization ID found for file: ${filePath}`);
        return;
      }
      
      // Get download URL
      const fileUrl = `gs://${bucket}/${filePath}`;
      
      // Find matching QC bots
      const matchingBots = await findBotsWatchingPath(filePath, organizationId);
      
      if (matchingBots.length === 0) {
        logger.info(`[onQCFileUpload] No active QC bots watching path: ${filePath}`);
        return;
      }
      
      logger.info(`[onQCFileUpload] Found ${matchingBots.length} matching QC bot(s) for file: ${filePath}`);
      
      // Trigger analysis for each matching bot
      const analysisPromises = matchingBots.map(bot =>
        triggerQCAnalysis(
          bot.id,
          filePath,
          fileUrl,
          organizationId,
          { size: fileSize, contentType }
        ).catch(error => {
          logger.error(`[onQCFileUpload] Failed to trigger analysis for bot ${bot.id}:`, error);
          return null; // Continue with other bots even if one fails
        })
      );
      
      await Promise.all(analysisPromises);
      
      logger.info(`[onQCFileUpload] ✅ Completed processing file: ${filePath}`);
    }
  );
} catch (error) {
  logger.warn('[onQCFileUpload] Could not initialize storage trigger:', error);
  onQCFileUpload = undefined;
}
*/

// Export undefined - function is disabled
export { onQCFileUpload };
