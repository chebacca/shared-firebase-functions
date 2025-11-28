/**
 * Firebase Cloud Function for Transcribing Video Blobs
 * 
 * Accepts video blob data and transcribes it using Gemini API
 * Supports large files via Gemini File Upload API
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAIApiKey } from '../ai/utils/aiHelpers';
import FormData from 'form-data';
import axios from 'axios';

// Define encryption key secret for Gemini API key decryption
const encryptionKeySecret = defineSecret('INTEGRATIONS_ENCRYPTION_KEY');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const auth = getAuth();

interface TranscribeVideoBlobRequest {
  videoData: string; // Base64-encoded video data
  fileName?: string;
  mimeType?: string;
  organizationId: string;
  userId?: string;
  model?: string;
}

interface TranscribeVideoBlobResponse {
  success: boolean;
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
    extractedBy?: string;
  };
  error?: string;
  errorDetails?: string;
}

/**
 * Transcribe video blob using Gemini API
 * Supports large files via Gemini File Upload API
 */
async function transcribeVideoBlobWithGemini(
  videoData: string,
  fileName: string,
  mimeType: string,
  organizationId: string,
  userId: string | undefined,
  model: string = 'gemini-1.5-flash'
): Promise<{ text: string; timestamps?: Array<{ start: number; end: number; text: string }> }> {
  try {
    console.log(`[Gemini Transcription] Starting blob transcription for file: ${fileName}`);
    
    // Get Gemini API key
    const keyData = await getAIApiKey(organizationId, 'gemini', userId);
    if (!keyData || !keyData.apiKey) {
      throw new Error('Gemini API key not configured for this organization');
    }

    const apiKey = keyData.apiKey;
    const geminiModel = keyData.model || model;
    
    console.log(`[Gemini Transcription] Using model: ${geminiModel}`);

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModelInstance = genAI.getGenerativeModel({ model: geminiModel });

    // Convert base64 to Buffer
    const videoBuffer = Buffer.from(videoData, 'base64');
    const fileSizeMB = Math.round(videoBuffer.length / 1024 / 1024);
    console.log(`[Gemini Transcription] Video size: ${fileSizeMB}MB`);

    // Use file upload API for files larger than 1MB or Pro models
    const maxSizeInline = 1 * 1024 * 1024; // 1MB
    const useFileUpload = videoBuffer.length > maxSizeInline || geminiModel.includes('pro');

    let fileUri: string | null = null;

    if (useFileUpload) {
      console.log(`[Gemini Transcription] Using file upload API for ${fileSizeMB}MB file`);
      
      // Upload file to Gemini using File API via HTTP
      const formData = new FormData();
      
      formData.append('metadata', JSON.stringify({
        file: { displayName: fileName || 'video' },
        purpose: 'FILE_DATA'
      }));
      formData.append('file', videoBuffer, {
        filename: fileName || 'video.mp4',
        contentType: mimeType || 'video/mp4',
      });

      const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
      const uploadResponse = await axios.post(uploadUrl, formData, {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const uploadedFile = uploadResponse.data.file;
      if (!uploadedFile || !uploadedFile.name) {
        throw new Error('Failed to get file name from Gemini upload');
      }

      fileUri = `files/${uploadedFile.name}`;
      console.log(`[Gemini Transcription] File uploaded: ${fileUri}`);

      // Wait for file to be processed
      let fileReady = false;
      let attempts = 0;
      const maxAttempts = 120; // 120 seconds (2 minutes) max wait for large files
      
      while (!fileReady && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        
        const statusUrl = `https://generativelanguage.googleapis.com/v1beta/${fileUri}?key=${apiKey}`;
        const statusResponse = await axios.get(statusUrl);
        
        if (statusResponse.data.state === 'ACTIVE') {
          fileReady = true;
          break;
        } else if (statusResponse.data.state === 'FAILED') {
          throw new Error('File processing failed in Gemini');
        }
        
        attempts++;
      }

      if (!fileReady) {
        throw new Error('File processing timeout - file did not become ready in time');
      }

      console.log('[Gemini Transcription] File is ready for transcription');

      // Generate content using file URI
      const result = await geminiModelInstance.generateContent([
        {
          fileData: {
            mimeType: mimeType || 'video/mp4',
            fileUri: fileUri,
          },
        },
        {
          text: 'Please transcribe this video and provide a detailed transcript with timestamps if possible. Format the response as a transcript with time markers.',
        },
      ]);

      // Clean up uploaded file
      try {
        const deleteUrl = `https://generativelanguage.googleapis.com/v1beta/${fileUri}?key=${apiKey}`;
        await axios.delete(deleteUrl);
        console.log('[Gemini Transcription] Cleaned up uploaded file');
      } catch (cleanupError) {
        console.warn('[Gemini Transcription] Failed to cleanup file:', cleanupError);
      }

      const response = await result.response;
      const transcriptText = response.text();

      return {
        text: transcriptText,
        // Note: Gemini doesn't provide timestamps directly, would need additional processing
      };
    } else {
      // Use inline data for small files
      console.log('[Gemini Transcription] Using inline data API');
      
      const result = await geminiModelInstance.generateContent([
        {
          inlineData: {
            data: videoData,
            mimeType: mimeType || 'video/mp4',
          },
        },
        {
          text: 'Please transcribe this video and provide a detailed transcript with timestamps if possible. Format the response as a transcript with time markers.',
        },
      ]);

      const response = await result.response;
      const transcriptText = response.text();

      return {
        text: transcriptText,
      };
    }
  } catch (error: any) {
    console.error('[Gemini Transcription] Error:', error);
    throw new HttpsError('internal', `Gemini transcription failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Extract video transcript from blob data
 */
export const transcribeVideoBlob = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: true,
    secrets: [encryptionKeySecret],
    maxInstances: 10,
    timeoutSeconds: 540, // 9 minutes (max for v2 functions) for large files
    memory: '2GiB', // Increase memory for large file processing
  },
  async (request): Promise<TranscribeVideoBlobResponse> => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { videoData, fileName, mimeType, organizationId, userId, model } = request.data as TranscribeVideoBlobRequest;

      if (!videoData || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required fields: videoData, organizationId');
      }

      // Validate video data size (max 2GB for Gemini Pro)
      const videoSizeMB = Math.round(Buffer.from(videoData, 'base64').length / 1024 / 1024);
      const maxSizeMB = model?.includes('pro') ? 2048 : 20; // 2GB for Pro, 20MB for Flash
      
      if (videoSizeMB > maxSizeMB) {
        throw new HttpsError(
          'invalid-argument',
          `Video file is too large (${videoSizeMB}MB). Maximum size is ${maxSizeMB}MB.`
        );
      }

      console.log(`[transcribeVideoBlob] Transcribing video: ${fileName || 'unnamed'} (${videoSizeMB}MB)`);

      // Transcribe using Gemini
      const transcriptData = await transcribeVideoBlobWithGemini(
        videoData,
        fileName || 'video',
        mimeType || 'video/mp4',
        organizationId,
        userId || request.auth.uid,
        model
      );

      const transcript = {
        videoUrl: fileName || 'local-video',
        platform: 'Custom' as const,
        language: 'en',
        text: transcriptData.text,
        timestamps: transcriptData.timestamps,
        extractedAt: new Date(),
        extractedBy: userId || request.auth.uid,
      };

      return {
        success: true,
        transcript,
      };
    } catch (error: any) {
      console.error('[transcribeVideoBlob] Error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        errorDetails: error.stack,
      };
    }
  }
);

