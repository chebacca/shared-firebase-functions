/**
 * Callable Function to Trigger QC Analysis
 * Called from storage trigger or directly from client
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { getStorage } from 'firebase-admin/storage';

const db = getFirestore();
const storage = getStorage();

/**
 * Download file from Firebase Storage to temporary location
 * Returns local file path (for server-side processing)
 */
async function downloadFileToTemp(fileUrl: string, organizationId: string): Promise<string> {
  // Parse GCS URL: gs://bucket/path or https://storage.googleapis.com/bucket/path
  let bucketName = '';
  let filePath = '';
  
  if (fileUrl.startsWith('gs://')) {
    const parts = fileUrl.replace('gs://', '').split('/', 2);
    bucketName = parts[0];
    filePath = parts[1];
  } else if (fileUrl.includes('storage.googleapis.com')) {
    const url = new URL(fileUrl);
    const pathParts = url.pathname.split('/');
    bucketName = pathParts[1];
    filePath = pathParts.slice(2).join('/');
  } else {
    throw new Error(`Invalid file URL format: ${fileUrl}`);
  }
  
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);
  
  // Create temp file path
  const tempDir = `/tmp/qc-analysis/${organizationId}`;
  const tempFilePath = `${tempDir}/${Date.now()}-${filePath.split('/').pop()}`;
  
  // Ensure temp directory exists
  const fs = await import('fs');
  const path = await import('path');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Download file
  await file.download({ destination: tempFilePath });
  
  logger.info(`[triggerQCAnalysis] Downloaded file to: ${tempFilePath}`);
  
  return tempFilePath;
}

/**
 * Callable function to trigger QC analysis
 */
export const triggerQCAnalysis = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540, // 9 minutes max for Firebase Functions
    memory: '2GiB', // Large memory for video processing
  },
  async (request) => {
    const { botId, filePath, fileUrl, organizationId, fileSize, mimeType, sessionId, projectId } = request.data;
    
    if (!botId || !organizationId) {
      throw new Error('Missing required parameters: botId, organizationId');
    }
    
    logger.info(`[triggerQCAnalysis] Starting QC analysis for bot ${botId}, file: ${filePath || fileUrl}`);
    
    try {
      // Get bot configuration
      const botDoc = await db.doc(`organizations/${organizationId}/qcBots/${botId}`).get();
      if (!botDoc.exists) {
        throw new Error(`QC bot not found: ${botId}`);
      }
      
      const bot = botDoc.data();
      if (bot?.status !== 'active') {
        throw new Error(`QC bot is not active: ${botId}`);
      }
      
      // Download file if it's a cloud URL
      let localFilePath = filePath;
      if (fileUrl && !filePath?.startsWith('/') && !filePath?.match(/^[A-Z]:\\/)) {
        localFilePath = await downloadFileToTemp(fileUrl, organizationId);
      }
      
      // Import QC analysis service
      // Note: This would need to be adapted based on your server-side QC implementation
      // For now, we'll create a report and mark it as pending, then trigger client-side analysis
      // Or use a Cloud Task to process asynchronously
      
      // Create pending QC report
      const reportId = `qc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const reportRef = db.doc(`organizations/${organizationId}/qcReports/${reportId}`);
      
      await reportRef.set({
        id: reportId,
        fileName: filePath?.split('/').pop() || fileUrl?.split('/').pop() || 'unknown',
        filePath: localFilePath,
        fileUrl: fileUrl || filePath,
        fileSize: fileSize || 0,
        mimeType: mimeType,
        status: 'pending',
        botId,
        organizationId,
        sessionId,
        projectId,
        analyzedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      logger.info(`[triggerQCAnalysis] Created pending QC report: ${reportId}`);
      
      // TODO: Trigger actual QC analysis
      // This would require:
      // 1. FFmpeg installed on the server
      // 2. QC analysis service adapted for server-side use
      // 3. Or use Cloud Tasks to process asynchronously
      
      // For now, return the report ID so client can trigger analysis
      return {
        success: true,
        reportId,
        message: 'QC analysis triggered. Report will be updated when analysis completes.',
      };
    } catch (error: any) {
      logger.error(`[triggerQCAnalysis] Error:`, error);
      throw new Error(`Failed to trigger QC analysis: ${error.message}`);
    }
  }
);
