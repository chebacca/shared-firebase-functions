/**
 * Async Video Transcription System
 * 
 * Handles long video transcriptions (>9 minutes) using async task queue
 * Stores video in Firebase Storage and processes in background
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as admin from 'firebase-admin';
import { getAIApiKey } from '../ai/utils/aiHelpers';
import { GeminiService } from '../ai/GeminiService';

// Define encryption key secret for Gemini API key decryption
const encryptionKeySecret = defineSecret('INTEGRATIONS_ENCRYPTION_KEY');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const auth = getAuth();
const db = getFirestore();
const storage = getStorage();

interface TranscriptionTask {
  id: string;
  organizationId: string;
  userId: string;
  videoData?: string; // Base64 video data (for small files - deprecated, use storagePath)
  storagePath?: string; // Firebase Storage path (preferred for all files)
  fileName: string;
  mimeType: string;
  model?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100
  transcript?: {
    videoUrl: string;
    platform: 'Custom';
    language: string;
    text: string;
    timestamps?: Array<{
      start: number;
      end: number;
      text: string;
    }>;
    extractedAt: Date;
    extractedBy: string;
  };
  error?: string;
  createdAt: any; // Firestore Timestamp
  startedAt?: any;
  completedAt?: any;
}

interface CreateTranscriptionTaskRequest {
  videoData?: string; // Base64-encoded video data (deprecated - use storagePath instead)
  storagePath?: string; // Firebase Storage path (required for all files)
  taskId?: string; // Optional task ID (if provided, will be used instead of generating new one)
  fileName?: string;
  mimeType?: string;
  organizationId: string;
  userId?: string;
  model?: string;
}

interface CreateTranscriptionTaskResponse {
  success: boolean;
  taskId?: string;
  error?: string;
}

// Removed unused transcribeVideoChunkWithGemini function - chunking is no longer used

/**
 * Transcribe video using Gemini API (same as sync version)
 */
async function transcribeVideoBlobWithGemini(
  videoBuffer: Buffer,
  fileName: string,
  mimeType: string,
  organizationId: string,
  userId: string | undefined,
  model: string = 'gemini-2.5-flash'
): Promise<{ text: string; timestamps?: Array<{ start: number; end: number; text: string }> }> {
  const keyData = await getAIApiKey(organizationId, 'gemini', userId);
  if (!keyData || !keyData.apiKey) {
    throw new Error('Gemini API key not configured for this organization');
  }

  const geminiSvc = new GeminiService(keyData.apiKey);
  const result = await geminiSvc.transcribeMedia(
    videoBuffer.toString('base64'),
    mimeType,
    fileName,
    keyData.model || model
  );
  return result;
}

/**
 * Create async transcription task
 */
export const createTranscriptionTask = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: true,
    secrets: [encryptionKeySecret],
    maxInstances: 10,
    timeoutSeconds: 60, // 1 minute (reduced since client uploads directly to Storage)
    memory: '512MiB', // Reduced memory since we're not processing large buffers
  },
  async (request): Promise<CreateTranscriptionTaskResponse> => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { videoData, storagePath: providedStoragePath, taskId: providedTaskId, fileName, mimeType, organizationId, userId, model } = request.data as CreateTranscriptionTaskRequest;

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required field: organizationId');
      }

      if (!videoData && !providedStoragePath) {
        throw new HttpsError('invalid-argument', 'Missing required field: either videoData or storagePath must be provided');
      }

      // Use provided task ID or generate new one
      const taskId = providedTaskId || `transcription_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      let storagePath: string | undefined;
      let videoSizeMB = 0;

      if (providedStoragePath) {
        // Use provided Storage path (client uploaded directly)
        storagePath = providedStoragePath;

        // Get file size from Storage metadata
        try {
          const bucket = storage.bucket();
          const file = bucket.file(storagePath);
          const [metadata] = await file.getMetadata();
          const size = typeof metadata.size === 'number' ? metadata.size : parseInt(String(metadata.size || '0'), 10);
          videoSizeMB = Math.round(size / 1024 / 1024);
          console.log(`[createTranscriptionTask] Using provided Storage path: ${storagePath} (${videoSizeMB}MB)`);
        } catch (error) {
          console.warn(`[createTranscriptionTask] Could not get file metadata, continuing anyway:`, error);
        }
      } else if (videoData) {
        // Fallback: Upload base64 data to Storage (for backward compatibility)
        const videoBuffer = Buffer.from(videoData, 'base64');
        videoSizeMB = Math.round(videoBuffer.length / 1024 / 1024);
        const maxSizeMB = model?.includes('pro') ? 2048 : 20; // 2GB for Pro, 20MB for Flash

        if (videoSizeMB > maxSizeMB) {
          throw new HttpsError(
            'invalid-argument',
            `Video file is too large (${videoSizeMB}MB). Maximum size is ${maxSizeMB}MB.`
          );
        }

        // Store file in Storage
        const bucket = storage.bucket();
        storagePath = `transcription-tasks/${organizationId}/${taskId}/${fileName || 'video.mp4'}`;
        const file = bucket.file(storagePath);

        await file.save(videoBuffer, {
          metadata: {
            contentType: mimeType || 'video/mp4',
            metadata: {
              organizationId,
              userId: userId || request.auth.uid,
              taskId,
            },
          },
        });

        console.log(`[createTranscriptionTask] Stored video in Storage: ${storagePath} (${videoSizeMB}MB)`);
      }

      // Create task document
      const task: any = {
        id: taskId,
        organizationId,
        userId: userId || request.auth.uid,
        storagePath, // Always use Storage path
        fileName: fileName || 'video',
        mimeType: mimeType || 'video/mp4',
        model: model || 'gemini-2.5-flash',
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      };

      await db.collection('transcriptionTasks').doc(taskId).set(task);

      console.log(`[createTranscriptionTask] Created transcription task: ${taskId} (${videoSizeMB}MB)`);

      return {
        success: true,
        taskId,
      };
    } catch (error: any) {
      console.error('[createTranscriptionTask] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }
);

/**
 * Process transcription task (triggered by Firestore document creation)
 */
export const processTranscriptionTask = onDocumentCreated(
  {
    document: 'transcriptionTasks/{taskId}',
    region: 'us-central1',
    secrets: [encryptionKeySecret],
    timeoutSeconds: 540, // 9 minutes max
    memory: '2GiB',
  },
  async (event) => {
    if (!event.data) {
      console.error('❌ [TranscribeVideoBlobAsync] Event data is missing');
      return;
    }
    const taskId = event.params.taskId;
    const taskDoc = event.data;
    const taskData = taskDoc.data() as TranscriptionTask;

    // Only process pending tasks
    if (taskData.status !== 'pending') {
      console.log(`[processTranscriptionTask] Skipping task ${taskId} - status is ${taskData.status}`);
      return;
    }

    console.log(`[processTranscriptionTask] Processing task: ${taskId}`, {
      organizationId: taskData.organizationId,
      userId: taskData.userId,
      fileName: taskData.fileName,
      hasStoragePath: !!taskData.storagePath,
      hasVideoData: !!taskData.videoData,
    });

    try {
      // Update status to processing
      await taskDoc.ref.update({
        status: 'processing',
        startedAt: FieldValue.serverTimestamp(),
        progress: 10,
      });

      // Get video data
      let videoBuffer: Buffer;

      try {
        if (taskData.storagePath) {
          // Download from Storage
          const bucket = storage.bucket();
          const file = bucket.file(taskData.storagePath);
          const [buffer] = await file.download();
          videoBuffer = buffer;
          console.log(`[processTranscriptionTask] Downloaded video from Storage: ${taskData.storagePath} (${buffer.length} bytes)`);
        } else if (taskData.videoData) {
          // Use inline data
          videoBuffer = Buffer.from(taskData.videoData, 'base64');
          console.log(`[processTranscriptionTask] Using inline video data (${videoBuffer.length} bytes)`);
        } else {
          throw new Error('No video data available - neither storagePath nor videoData provided');
        }
      } catch (videoError: any) {
        console.error(`[processTranscriptionTask] Failed to get video data:`, videoError);
        throw new Error(`Failed to retrieve video data: ${videoError.message || 'Unknown error'}`);
      }

      // Validate video buffer
      if (!videoBuffer || videoBuffer.length === 0) {
        throw new Error('Video buffer is empty or invalid');
      }

      const fileSizeMB = Math.round(videoBuffer.length / 1024 / 1024);
      console.log(`[processTranscriptionTask] Video size: ${fileSizeMB}MB (${videoBuffer.length} bytes)`);

      // Get Gemini API key
      console.log(`[processTranscriptionTask] Retrieving Gemini API key for org: ${taskData.organizationId}, user: ${taskData.userId}`);
      let keyData;
      try {
        keyData = await getAIApiKey(taskData.organizationId, 'gemini', taskData.userId);
        console.log(`[processTranscriptionTask] getAIApiKey returned:`, {
          hasKeyData: !!keyData,
          hasApiKey: !!keyData?.apiKey,
          apiKeyLength: keyData?.apiKey?.length || 0,
          model: keyData?.model || 'none',
        });

        if (!keyData) {
          throw new Error('getAIApiKey returned null - API key not found in Firestore');
        }

        if (!keyData.apiKey) {
          throw new Error('API key data exists but apiKey field is missing or empty');
        }

        if (typeof keyData.apiKey !== 'string' || keyData.apiKey.trim().length === 0) {
          throw new Error(`Invalid API key format: expected non-empty string, got ${typeof keyData.apiKey}`);
        }

        console.log(`[processTranscriptionTask] ✅ API key retrieved successfully (length: ${keyData.apiKey.length}, model: ${keyData.model || 'default'})`);
      } catch (keyError: any) {
        console.error(`[processTranscriptionTask] ❌ Failed to get API key:`, {
          error: keyError.message,
          stack: keyError.stack,
          name: keyError.name,
          organizationId: taskData.organizationId,
          userId: taskData.userId,
        });
        throw new Error(`Failed to retrieve Gemini API key: ${keyError.message || 'Unknown error'}`);
      }

      const apiKey = keyData.apiKey;
      let geminiModel = keyData.model || taskData.model || 'gemini-2.5-flash';

      // Validate and normalize model name (fix invalid model names like gemini-2.5-flash)
      const validModels = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-2.0-flash-thinking-exp-001'];
      if (!validModels.includes(geminiModel)) {
        console.warn(`[processTranscriptionTask] ⚠️ Invalid model name "${geminiModel}", defaulting to gemini-2.5-flash`);
        geminiModel = 'gemini-2.5-flash';
      }

      // Validate API key format (Gemini keys typically start with AIza)
      if (!apiKey.startsWith('AIza') && apiKey.length < 20) {
        console.warn(`[processTranscriptionTask] ⚠️ API key format looks unusual (length: ${apiKey.length}, starts with: ${apiKey.substring(0, 4)})`);
      }

      console.log(`[processTranscriptionTask] Using Gemini model: ${geminiModel}`);

      // Check file size limits (Gemini Flash supports up to 20MB, Pro supports up to 2GB)
      const maxSizeMB = geminiModel.includes('pro') ? 2048 : 20;
      if (fileSizeMB > maxSizeMB) {
        throw new Error(`Video file is too large (${fileSizeMB}MB). Maximum size for ${geminiModel} is ${maxSizeMB}MB.`);
      }

      let transcriptText: string = '';
      let timestamps: any[] = [];

      // Use GeminiService
      const geminiSvc = new GeminiService(apiKey);
      const result = await geminiSvc.transcribeMedia(
        videoBuffer.toString('base64'),
        taskData.mimeType,
        taskData.fileName,
        geminiModel
      );

      transcriptText = result.text;
      timestamps = result.timestamps || [];

      // Update progress
      console.log(`[processTranscriptionTask] 📊 Updating progress to 90%`);
      await taskDoc.ref.update({ progress: 90 });

      // Create transcript object
      console.log(`[processTranscriptionTask] 📝 Creating transcript object...`);
      const transcript = {
        videoUrl: taskData.fileName,
        platform: 'Custom' as const,
        language: 'en',
        text: transcriptText,
        timestamps: timestamps,
        extractedAt: new Date(),
        extractedBy: taskData.userId,
      };

      // Update task with transcript
      await taskDoc.ref.update({
        status: 'completed',
        transcript,
        progress: 100,
        completedAt: FieldValue.serverTimestamp(),
      });

      // Clean up Storage file if it exists
      if (taskData.storagePath) {
        try {
          const bucket = storage.bucket();
          await bucket.file(taskData.storagePath).delete();
          console.log(`[processTranscriptionTask] Cleaned up Storage file: ${taskData.storagePath}`);
        } catch (cleanupError) {
          console.warn(`[processTranscriptionTask] Failed to cleanup Storage file:`, cleanupError);
        }
      }

      console.log(`[processTranscriptionTask] Task completed: ${taskId}`);
    } catch (error: any) {
      console.error(`[processTranscriptionTask] Task failed: ${taskId}`, {
        error: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
      });

      // Extract detailed error message
      let errorMessage = error.message || 'Unknown error occurred';

      // If it's an axios error, try to extract more details
      if (error.response) {
        const apiError = error.response.data?.error;
        if (apiError?.message) {
          errorMessage = `Gemini API error: ${apiError.message}`;
        } else if (error.response.status) {
          errorMessage = `HTTP ${error.response.status}: ${errorMessage}`;
        }
      }

      // Update task with failure status and detailed error
      try {
        await taskDoc.ref.update({
          status: 'failed',
          error: errorMessage,
          completedAt: FieldValue.serverTimestamp(),
        });
      } catch (updateError) {
        console.error(`[processTranscriptionTask] Failed to update task status:`, updateError);
      }
    }
  }
);

/**
 * Get transcription task status
 */
export const getTranscriptionTaskStatus = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 30,
  },
  async (request): Promise<{ success: boolean; task?: TranscriptionTask; error?: string }> => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { taskId } = request.data as { taskId: string };

      if (!taskId) {
        throw new HttpsError('invalid-argument', 'Missing taskId');
      }

      const taskDoc = await db.collection('transcriptionTasks').doc(taskId).get();

      if (!taskDoc.exists) {
        throw new HttpsError('not-found', 'Transcription task not found');
      }

      const taskData = taskDoc.data() as TranscriptionTask;

      // Verify user has access
      if (taskData.userId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'You do not have access to this task');
      }

      return {
        success: true,
        task: taskData,
      };
    } catch (error: any) {
      console.error('[getTranscriptionTaskStatus] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }
);

