/**
 * Extract text from an image using Google Cloud Vision API (server-side OCR).
 * Used by mobile companion PWA and IWM Asset Operations wizard.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as vision from '@google-cloud/vision';

const visionClient = new vision.ImageAnnotatorClient();

export const extractTextFromImage = onCall(
  {
    cors: true,
    cpu: 0.5,
    memory: '512MiB',
    region: 'us-central1',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { imageBase64, imageUrl } = request.data || {};

    if (!imageBase64 && !imageUrl) {
      throw new HttpsError(
        'invalid-argument',
        'Either imageBase64 or imageUrl is required'
      );
    }

    try {
      let imagePayload: { content?: string; source?: { imageUri?: string } };

      if (imageBase64) {
        const content = typeof imageBase64 === 'string' ? imageBase64 : imageBase64;
        if (!content || content.length === 0) {
          throw new HttpsError('invalid-argument', 'imageBase64 must be a non-empty string');
        }
        imagePayload = { content };
      } else if (imageUrl) {
        const uri = typeof imageUrl === 'string' ? imageUrl : imageUrl;
        if (!uri || !uri.startsWith('gs://')) {
          throw new HttpsError(
            'invalid-argument',
            'imageUrl must be a Firebase Storage gs:// URL'
          );
        }
        imagePayload = { source: { imageUri: uri } };
      } else {
        throw new HttpsError('invalid-argument', 'Either imageBase64 or imageUrl is required');
      }

      const [response] = await visionClient.textDetection({
        image: imagePayload,
      });

      const fullTextAnnotation = response?.fullTextAnnotation;
      const text = fullTextAnnotation?.text?.trim() ?? '';

      return {
        success: true,
        text,
      };
    } catch (err: unknown) {
      if (err instanceof HttpsError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Text extraction failed';
      console.error('[extractTextFromImage]', err);
      throw new HttpsError('internal', message);
    }
  }
);
