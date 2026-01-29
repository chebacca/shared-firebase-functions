/**
 * Extract text from an image using Google Cloud Vision API (server-side OCR).
 * Used by mobile companion PWA and IWM Asset Operations wizard.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as vision from '@google-cloud/vision';

const visionClient = new vision.ImageAnnotatorClient({
  projectId: process.env.GCLOUD_PROJECT || 'backbone-logic',
});

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
        const content = typeof imageBase64 === 'string' ? imageBase64 : String(imageBase64);
        if (!content || content.length === 0) {
          throw new HttpsError('invalid-argument', 'imageBase64 must be a non-empty string');
        }
        // Validate base64 format (optional data URL prefix or raw base64)
        const base64Data = content.includes(',') ? content.split(',')[1] ?? content : content;
        if (!/^[A-Za-z0-9+/]*=*$/.test(base64Data.replace(/\s/g, ''))) {
          throw new HttpsError('invalid-argument', 'imageBase64 must be valid base64-encoded data');
        }
        imagePayload = { content: base64Data };
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

      // Use documentTextDetection for dense text (e.g. Mac System Info) — better accuracy and reading order
      const [response] = await visionClient.documentTextDetection({
        image: imagePayload,
      });

      const fullTextAnnotation = response?.fullTextAnnotation;
      let text = fullTextAnnotation?.text?.trim() ?? '';

      // Build text from structured response to preserve column layout (label: value on same line)
      if (fullTextAnnotation?.pages?.length) {
        interface TextItem {
          text: string;
          y: number;
          x: number;
        }
        
        const textItems: TextItem[] = [];
        
        // Extract all words with their bounding box positions
        for (const page of fullTextAnnotation.pages) {
          for (const block of page.blocks || []) {
            for (const paragraph of block.paragraphs || []) {
              const wordText = (paragraph.words || [])
                .map((w: any) => (w.symbols || []).map((s: any) => s.text).join(''))
                .join(' ')
                .trim();
              
              if (wordText && paragraph.boundingBox?.vertices?.[0]) {
                const y = paragraph.boundingBox.vertices[0].y || 0;
                const x = paragraph.boundingBox.vertices[0].x || 0;
                textItems.push({ text: wordText, y, x });
              }
            }
          }
        }

        // Sort by Y (top to bottom), then X (left to right)
        textItems.sort((a, b) => {
          const yDiff = a.y - b.y;
          if (Math.abs(yDiff) < 15) return a.x - b.x; // Same line (within 15px)
          return yDiff;
        });

        // Group items on the same horizontal line
        const lines: string[] = [];
        let currentLine: TextItem[] = [];
        let lastY = -1;

        for (const item of textItems) {
          if (lastY === -1 || Math.abs(item.y - lastY) < 15) {
            currentLine.push(item);
            lastY = item.y;
          } else {
            if (currentLine.length > 0) {
              lines.push(currentLine.map(i => i.text).join(' '));
            }
            currentLine = [item];
            lastY = item.y;
          }
        }
        if (currentLine.length > 0) {
          lines.push(currentLine.map(i => i.text).join(' '));
        }

        text = lines.join('\n');
      }

      return {
        success: true,
        text,
      };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : 'Text extraction failed';
      console.error('[extractTextFromImage] Vision API error:', err);

      if (message.includes('API has not been used') || message.includes('disabled')) {
        throw new HttpsError(
          'failed-precondition',
          'Vision API is not enabled. Please enable it in Google Cloud Console.'
        );
      }
      if (message.includes('permission') || message.includes('PERMISSION_DENIED')) {
        throw new HttpsError(
          'permission-denied',
          'Vision API permission denied. Check service account permissions.'
        );
      }
      throw new HttpsError('internal', `Text extraction failed: ${message}`);
    }
  }
);
