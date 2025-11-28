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
  model: string = 'gemini-1.5-flash'
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
    
    console.log(`[Gemini Transcription] Using model: ${geminiModel}`);

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModelInstance = genAI.getGenerativeModel({ model: geminiModel });

    // Convert base64 to Buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    const fileSizeMB = Math.round(audioBuffer.length / 1024 / 1024);
    console.log(`[Gemini Transcription] Audio size: ${fileSizeMB}MB`);

    // Use file upload API for files larger than 1MB or Pro models
    const maxSizeInline = 1 * 1024 * 1024; // 1MB
    const useFileUpload = audioBuffer.length > maxSizeInline || geminiModel.includes('pro');

    let fileUri: string | null = null;

    if (useFileUpload) {
      console.log(`[Gemini Transcription] Using file upload API for ${fileSizeMB}MB file`);
      
      // Upload file to Gemini using File API via HTTP
      const formData = new FormData();
      
      formData.append('metadata', JSON.stringify({
        file: { displayName: fileName || 'audio' },
        purpose: 'FILE_DATA'
      }));
      formData.append('file', audioBuffer, {
        filename: fileName || 'audio.mp3',
        contentType: mimeType || 'audio/mpeg',
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
            mimeType: mimeType || 'audio/mpeg',
            fileUri: fileUri,
          },
        },
        {
          text: 'Please transcribe this audio and provide a detailed transcript with timestamps if possible. Format the response as a transcript with time markers.',
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
            data: audioData,
            mimeType: mimeType || 'audio/mpeg',
          },
        },
        {
          text: 'Please transcribe this audio and provide a detailed transcript with timestamps if possible. Format the response as a transcript with time markers.',
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

