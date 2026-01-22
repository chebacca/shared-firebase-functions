/**
 * Firebase Storage Trigger for QC File Analysis
 * Automatically triggers QC analysis when files are uploaded to watched paths
 */

import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const db = getFirestore();

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
 */
export const onQCFileUpload = onObjectFinalized(
  {
    region: 'us-central1',
    // Only trigger on specific bucket/path if needed
    // bucket: 'your-qc-bucket',
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
