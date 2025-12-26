/**
 * Firebase Cloud Function for Transcribing Audio Blobs
 * 
 * Accepts audio blob data and transcribes it using Gemini API
 * Supports large files via Gemini File Upload API
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
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

interface TranscribeAudioBlobRequest {
  audioData: string; // Base64-encoded audio data
  fileName?: string;
  mimeType?: string;
  organizationId: string;
  userId?: string;
  model?: string;
}

interface TranscribeAudioBlobResponse {
  success: boolean;
  transcript?: {
    audioUrl: string;
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
 * Transcribe audio blob using Gemini API
 * Supports large files via Gemini File Upload API
 */
async function transcribeAudioBlobWithGemini(
  audioData: string,
  fileName: string,
  mimeType: string,
  organizationId: string,
  userId: string | undefined,
  model: string = 'gemini-2.5-flash'
): Promise<{ text: string; timestamps?: Array<{ start: number; end: number; text: string }> }> {
  try {
    console.log(`[Gemini Transcription] Starting audio blob transcription for file: ${fileName}`);

    // Get Gemini API key
    const keyData = await getAIApiKey(organizationId, 'gemini', userId);
    if (!keyData || !keyData.apiKey) {
      throw new Error('Gemini API key not configured for this organization');
    }

    const apiKey = keyData.apiKey;
    const geminiModel = keyData.model || model;

    console.log(`[Gemini Transcription] Using model: ${geminiModel} through unified GeminiService`);

    // Use unified GeminiService
    const geminiSvc = new GeminiService(apiKey);
    const result = await geminiSvc.transcribeMedia(audioData, mimeType, fileName, geminiModel);

    return {
      text: result.text,
      timestamps: result.timestamps
    };
  } catch (error: any) {
    console.error('[Gemini Transcription] Error:', error);
    throw new HttpsError('internal', `Gemini transcription failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Extract audio transcript from blob data
 */
export const transcribeAudioBlob = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: true,
    secrets: [encryptionKeySecret],
    maxInstances: 10,
    timeoutSeconds: 540, // 9 minutes (max for v2 functions) for large files
    memory: '2GiB', // Increase memory for large file processing
  },
  async (request): Promise<TranscribeAudioBlobResponse> => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { audioData, fileName, mimeType, organizationId, userId, model } = request.data as TranscribeAudioBlobRequest;

      if (!audioData || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required fields: audioData, organizationId');
      }

      // Validate audio data size (max 2GB for Gemini Pro)
      const audioSizeMB = Math.round(Buffer.from(audioData, 'base64').length / 1024 / 1024);
      const maxSizeMB = model?.includes('pro') ? 2048 : 20; // 2GB for Pro, 20MB for Flash

      if (audioSizeMB > maxSizeMB) {
        throw new HttpsError(
          'invalid-argument',
          `Audio file is too large (${audioSizeMB}MB). Maximum size is ${maxSizeMB}MB.`
        );
      }

      console.log(`[transcribeAudioBlob] Transcribing audio: ${fileName || 'unnamed'} (${audioSizeMB}MB)`);

      // Transcribe using Gemini
      const transcriptData = await transcribeAudioBlobWithGemini(
        audioData,
        fileName || 'audio',
        mimeType || 'audio/mpeg',
        organizationId,
        userId || request.auth.uid,
        model
      );

      const transcript = {
        audioUrl: fileName || 'local-audio',
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
      console.error('[transcribeAudioBlob] Error:', error);

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

