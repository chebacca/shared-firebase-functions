/**
 * Firebase Cloud Function for Extracting Video Transcripts
 * 
 * Extracts transcripts from video platforms (YouTube, Vimeo, etc.)
 * Uses platform APIs to fetch captions/transcripts
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import * as https from 'https';
import { GeminiService } from '../ai/GeminiService';
import { getAIApiKey } from '../ai/utils/aiHelpers';

// Note: YouTube transcript extraction now works without API key or OAuth
// Using YouTube's public transcript endpoint that doesn't require authentication
// Vimeo is optional - only define if you want Vimeo transcript support
// const vimeoAccessToken = defineSecret('VIMEO_ACCESS_TOKEN');

// Define encryption key secret for Gemini API key decryption (optional - only needed for Gemini fallback)
// Use INTEGRATIONS_ENCRYPTION_KEY to match other AI functions
const encryptionKeySecret = defineSecret('INTEGRATIONS_ENCRYPTION_KEY');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const auth = getAuth();

interface ExtractTranscriptRequest {
  videoUrl: string;
  videoId?: string;
  platform: 'YouTube' | 'Vimeo' | 'Custom';
  organizationId: string;
  forceRefresh?: boolean; // Force re-extraction even if cached
  useGemini?: boolean; // Force use Gemini transcription (skip YouTube)
}

interface TranscriptResponse {
  success: boolean;
  transcript?: {
    videoUrl: string;
    platform: 'YouTube' | 'Vimeo' | 'Custom';
    language: string;
    text: string;
    timestamps?: Array<{
      start: number;
      end: number;
      text: string;
    }>;
    extractedAt: Date;
    extractedBy?: string;
    videoId?: string;
  };
  error?: string;
  errorDetails?: string;
  cached?: boolean; // Whether transcript was retrieved from cache
  usedGemini?: boolean; // Whether Gemini was used for transcription (for cost tracking)
}

/**
 * Parse YouTube caption XML/JSON format
 */
function parseYouTubeTranscript(data: string, format: 'xml' | 'json' = 'xml'): { text: string; timestamps?: Array<{ start: number; end: number; text: string }> } {
  try {
    if (format === 'json') {
      // YouTube provides captions in JSON format
      const json = JSON.parse(data);
      const events = json.events || [];
      let fullText = '';
      const timestamps: Array<{ start: number; end: number; text: string }> = [];

      for (const event of events) {
        if (event.segs && event.segs.length > 0) {
          const segmentText = event.segs.map((seg: any) => seg.utf8 || '').join('');
          if (segmentText.trim()) {
            fullText += segmentText + ' ';

            if (event.tStartMs !== undefined && event.dDurationMs !== undefined) {
              timestamps.push({
                start: event.tStartMs / 1000,
                end: (event.tStartMs + event.dDurationMs) / 1000,
                text: segmentText.trim()
              });
            }
          }
        }
      }

      return {
        text: fullText.trim(),
        timestamps: timestamps.length > 0 ? timestamps : undefined
      };
    } else {
      // XML format parsing - handle multiple YouTube XML formats
      let fullText = '';
      const timestamps: Array<{ start: number; end: number; text: string }> = [];

      // Try format 1: <text start="X.X" dur="X.X">text</text>
      const textMatches1 = data.match(/<text[^>]*start="([^"]+)"[^>]*dur="([^"]+)"[^>]*>([^<]+)<\/text>/g) || [];
      if (textMatches1.length > 0) {
        textMatches1.forEach((match) => {
          const matchResult = match.match(/<text[^>]*start="([^"]+)"[^>]*dur="([^"]+)"[^>]*>([^<]+)<\/text>/);
          if (matchResult) {
            const start = parseFloat(matchResult[1]);
            const duration = parseFloat(matchResult[2]);
            const textContent = matchResult[3].trim();
            if (textContent) {
              fullText += textContent + ' ';
              timestamps.push({
                start,
                end: start + duration,
                text: textContent
              });
            }
          }
        });
      }

      // Try format 2: <text start="X.X">text</text> with dur attribute separately
      if (timestamps.length === 0) {
        const textMatches2 = data.match(/<text[^>]*>([^<]+)<\/text>/g) || [];
        const timeMatches = data.match(/start="([^"]+)"[^>]*dur="([^"]+)"/g) || [];

        textMatches2.forEach((match, index) => {
          const textContent = match.replace(/<[^>]+>/g, '').trim();
          if (textContent) {
            fullText += textContent + ' ';

            if (timeMatches[index]) {
              const timeMatch = timeMatches[index].match(/start="([^"]+)"[^>]*dur="([^"]+)"/);
              if (timeMatch) {
                const start = parseFloat(timeMatch[1]);
                const duration = parseFloat(timeMatch[2]);
                timestamps.push({
                  start,
                  end: start + duration,
                  text: textContent
                });
              }
            }
          }
        });
      }

      // If still no timestamps, extract text only
      if (timestamps.length === 0 && fullText.trim().length === 0) {
        // Last resort: extract all text from XML
        fullText = data
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      return {
        text: fullText.trim(),
        timestamps: timestamps.length > 0 ? timestamps : undefined
      };
    }
  } catch (error) {
    console.error('Error parsing YouTube transcript:', error);
    // Fallback: return raw text
    return {
      text: data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    };
  }
}

/**
 * Fetch YouTube transcript using public API endpoint (works without OAuth)
 * Uses YouTube's public transcript endpoint that doesn't require authentication
 * Updated to remove OAuth requirement - works directly with public endpoint
 */
async function fetchYouTubeTranscript(videoId: string, language: string = 'en'): Promise<{ text: string; timestamps?: Array<{ start: number; end: number; text: string }> }> {
  try {
    // Use YouTube's public transcript endpoint - works without OAuth or API key
    // This endpoint provides transcripts for public videos with captions
    // Direct access without authentication required
    // Try different formats: xml3 (recommended), srv3, ttml, srv1
    const transcriptUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${language}&fmt=xml3`;
    console.log('Fetching transcript from:', transcriptUrl);

    const transcriptData = await new Promise<string>((resolve, reject) => {
      const request = https.get(transcriptUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/xml, text/xml, */*'
        }
      }, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            // Follow redirect
            https.get(redirectUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/xml, text/xml, */*'
              }
            }, (redirectRes) => {
              let data = '';
              redirectRes.on('data', (chunk) => { data += chunk; });
              redirectRes.on('end', () => {
                if (redirectRes.statusCode === 200) {
                  // Check if response is empty
                  if (!data || data.trim().length === 0) {
                    reject(new Error('Video does not have captions available. The video may not have captions enabled.'));
                    return;
                  }
                  resolve(data);
                } else {
                  if (redirectRes.statusCode === 404 || redirectRes.statusCode === 403) {
                    reject(new Error(`Video does not have captions available (status: ${redirectRes.statusCode}). The video may not have captions enabled or they may be private.`));
                  } else {
                    reject(new Error(`Failed to fetch transcript: ${redirectRes.statusCode}`));
                  }
                }
              });
            }).on('error', reject);
            return;
          }
        }

        if (res.statusCode !== 200) {
          // Check for specific error cases
          if (res.statusCode === 404 || res.statusCode === 403) {
            reject(new Error(`Video does not have captions available (status: ${res.statusCode}). The video may not have captions enabled or they may be private.`));
          } else {
            reject(new Error(`Transcript not available: ${res.statusCode}`));
          }
          return;
        }

        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          // Check if response is empty
          if (!data || data.trim().length === 0) {
            reject(new Error('Video does not have captions available. The video may not have captions enabled.'));
            return;
          }
          resolve(data);
        });
      });

      request.on('error', reject);
      request.end();
    });

    // Check if we received any data
    if (!transcriptData || transcriptData.trim().length === 0) {
      throw new Error('Video does not have captions available. The video may not have captions enabled.');
    }

    // Parse XML transcript data - YouTube can return different formats
    if (transcriptData) {
      // Log first 500 chars for debugging
      console.log('Received transcript data (first 500 chars):', transcriptData.substring(0, 500));

      // Try XML format first - YouTube typically returns XML
      if (transcriptData.includes('<transcript>') || transcriptData.includes('<?xml') || transcriptData.includes('<text') || transcriptData.includes('</text>')) {
        try {
          const parsed = parseYouTubeTranscript(transcriptData, 'xml');
          if (parsed.text && parsed.text.trim().length > 0) {
            return parsed;
          }
        } catch (xmlError) {
          console.error('XML parsing failed:', xmlError);
        }
      }

      // Try JSON format (less common for YouTube)
      if (transcriptData.trim().startsWith('{') || transcriptData.trim().startsWith('[')) {
        try {
          return parseYouTubeTranscript(transcriptData, 'json');
        } catch (jsonError) {
          console.error('JSON parse failed:', jsonError);
        }
      }

      // Try parsing as plain text/HTML - extract text from any HTML-like structure
      const textOnly = transcriptData
        .replace(/<[^>]+>/g, ' ') // Remove HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      if (textOnly.length > 10) {
        // If we got meaningful text, return it
        console.log('Extracted plain text transcript (length):', textOnly.length);
        return {
          text: textOnly,
          timestamps: undefined
        };
      }
    }

    // If all parsing fails, log the actual response for debugging
    console.error('Failed to parse transcript data. Length:', transcriptData?.length || 0);
    console.error('First 1000 chars:', transcriptData?.substring(0, 1000));

    // Check if this is an empty response indicating no captions
    if (!transcriptData || transcriptData.trim().length === 0) {
      throw new Error('Video does not have captions available. The video may not have captions enabled.');
    }

    throw new Error(`Could not parse transcript data. Received ${transcriptData?.length || 0} characters. Video may not have captions available.`);
  } catch (error: any) {
    // If primary language fails, try English (most common)
    if (language !== 'en' && !error.message?.includes('does not have captions')) {
      try {
        return await fetchYouTubeTranscript(videoId, 'en');
      } catch (enError: any) {
        // If English also fails, check if it's a "no captions" error - don't retry if so
        if (enError.message?.includes('does not have captions')) {
          throw enError;
        }

        // If English also fails, try to get any available language
        const transcriptUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=xml3`;

        try {
          const transcriptData = await new Promise<string>((resolve, reject) => {
            https.get(transcriptUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/xml, text/xml, */*'
              }
            }, (res) => {
              if (res.statusCode !== 200) {
                reject(new Error(`No captions available for this video (status: ${res.statusCode}). The video may not have captions enabled.`));
                return;
              }
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                if (!data || data.trim().length === 0) {
                  reject(new Error('Video does not have captions available. The video may not have captions enabled.'));
                  return;
                }
                resolve(data);
              });
            }).on('error', reject);
          });

          if (transcriptData && (transcriptData.includes('<transcript>') || transcriptData.includes('<?xml') || transcriptData.includes('<text'))) {
            return parseYouTubeTranscript(transcriptData, 'xml');
          }
        } catch (finalError: any) {
          // Return user-friendly error instead of internal error
          throw new HttpsError('failed-precondition', `No captions available for this video: ${finalError.message || 'The video may not have captions enabled.'}`);
        }
      }
    }

    // Check if this is a "no captions" error - return user-friendly error instead of 500
    if (error.message?.includes('does not have captions') || error.message?.includes('may not have captions')) {
      throw new HttpsError('failed-precondition', error.message);
    }

    // For other errors, still use internal but with better message
    throw new HttpsError('internal', `Failed to fetch YouTube transcript: ${error.message}`);
  }
}

/**
 * Transcribe video using Gemini API
 * Supports YouTube URLs and direct video URLs
 */
async function transcribeWithGemini(
  videoUrl: string,
  videoId: string,
  platform: 'YouTube' | 'Vimeo' | 'Custom',
  organizationId: string,
  userId?: string
): Promise<{ text: string; timestamps?: Array<{ start: number; end: number; text: string }> }> {
  try {
    console.log(`[Gemini Transcription] Starting transcription for ${platform} video: ${videoId}`);

    // Get Gemini API key
    const keyData = await getAIApiKey(organizationId, 'gemini', userId);
    if (!keyData || !keyData.apiKey) {
      throw new Error('Gemini API key not configured for this organization');
    }

    const apiKey = keyData.apiKey;
    const model = keyData.model || 'gemini-2.5-flash';

    console.log(`[Gemini Transcription] Using model: ${model}`);

    // Initialize Gemini Service
    const geminiSvc = new GeminiService(apiKey);

    // Note: Gemini API requires file uploads, not URLs
    // For YouTube videos and direct video URLs, we would need to download the video/audio first
    // This is a placeholder for future enhancement
    // TODO: Enhance to download and process video/audio files for Gemini

    if (platform === 'YouTube') {
      // YouTube videos require downloading first - not yet implemented
      throw new Error('Gemini transcription for YouTube videos requires video download. This feature will be enhanced in a future update. Please use YouTube\'s built-in transcript feature if available.');
    }

    // For direct video URLs, we would need to download the video first
    throw new Error('Gemini transcription for video URLs requires downloading the video file first. This feature will be enhanced in a future update.');

    // Future implementation would:
    // 1. Download video/audio from URL (using yt-dlp for YouTube, direct download for others)
    // 2. Convert to appropriate format if needed (mp4, mp3, etc.)
    // 3. Upload to Gemini or convert to base64
    // 4. Call Gemini with the file data
    // 5. Parse response with timestamps
  } catch (error: any) {
    console.error('[Gemini Transcription] Error:', error);
    throw new HttpsError('internal', `Gemini transcription failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Fetch Vimeo transcript using Vimeo API
 */
async function fetchVimeoTranscript(videoId: string): Promise<{ text: string; timestamps?: Array<{ start: number; end: number; text: string }> }> {
  // Vimeo support is not enabled (secret not defined)
  // To enable Vimeo transcripts:
  // 1. Uncomment the vimeoAccessToken defineSecret line above
  // 2. Add it to the secrets array in the function config
  // 3. Set the secret: firebase functions:secrets:set VIMEO_ACCESS_TOKEN
  throw new HttpsError('failed-precondition', 'Vimeo transcript support is not enabled. This feature is optional. YouTube transcripts are available.');

  // The code below is unreachable but kept for future Vimeo support
  /*
  try {
    // List text tracks for the video
    const listUrl = `https://api.vimeo.com/videos/${videoId}/texttracks`;
    
    const listResponse = await new Promise<any>((resolve, reject) => {
      const req = https.request(listUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.vimeo.*+json;version=3.4'
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (listResponse.error) {
      throw new Error(listResponse.error.message || 'Failed to list text tracks');
    }

    const tracks = listResponse.data || [];
    if (tracks.length === 0) {
      throw new Error('No text tracks available for this video');
    }

    // Use first available track (prefer English if available)
    const track = tracks.find((t: any) => t.language === 'en') || tracks[0];
    const trackUrl = track.link;

    if (!trackUrl) {
      throw new Error('No track URL available');
    }

    // Download the text track
    const trackData = await new Promise<string>((resolve, reject) => {
      https.get(trackUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download text track: ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });

    // Parse WebVTT format (common for Vimeo)
    const lines = trackData.split('\n');
    let fullText = '';
    const timestamps: Array<{ start: number; end: number; text: string }> = [];
    let currentText = '';
    let currentStart = 0;
    let currentEnd = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Timestamp line (e.g., "00:00:15.000 --> 00:00:18.000")
      if (line.includes('-->')) {
        const match = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        if (match) {
          currentStart = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
          currentEnd = parseInt(match[5]) * 3600 + parseInt(match[6]) * 60 + parseInt(match[7]) + parseInt(match[8]) / 1000;
        }
      } else if (line && !line.startsWith('WEBVTT') && !line.startsWith('NOTE') && !line.match(/^\d+$/)) {
        // Text line
        currentText += line + ' ';
      } else if (!line && currentText.trim()) {
        // Empty line - end of subtitle block
        const text = currentText.trim();
        fullText += text + ' ';
        timestamps.push({
          start: currentStart,
          end: currentEnd,
          text
        });
        currentText = '';
      }
    }

    // Add remaining text
    if (currentText.trim()) {
      fullText += currentText.trim() + ' ';
      timestamps.push({
        start: currentStart,
        end: currentEnd,
        text: currentText.trim()
      });
    }

    return {
      text: fullText.trim(),
      timestamps: timestamps.length > 0 ? timestamps : undefined
    };
  } catch (error: any) {
    console.error('Error fetching Vimeo transcript:', error);
    throw new HttpsError('internal', `Failed to fetch Vimeo transcript: ${error.message}`);
  }
  */
}

/**
 * Extract video transcript from platform APIs
 */
export const extractTranscript = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: true,
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
    secrets: [encryptionKeySecret], // Required for Gemini API key decryption (optional fallback)
  },
  async (request): Promise<TranscriptResponse> => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { videoUrl, videoId, platform, organizationId, forceRefresh, useGemini } = request.data as ExtractTranscriptRequest;

      if (!videoUrl || !platform || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required fields: videoUrl, platform, organizationId');
      }

      // Normalize video URL
      const normalizedUrl = videoUrl.trim();

      // Extract video ID if not provided
      let extractedVideoId = videoId;
      if (!extractedVideoId) {
        if (platform === 'YouTube') {
          const urlObj = new URL(normalizedUrl);
          const hostname = urlObj.hostname.toLowerCase();
          if (hostname.includes('youtube.com')) {
            extractedVideoId = urlObj.searchParams.get('v') || undefined;
          } else if (hostname.includes('youtu.be')) {
            extractedVideoId = urlObj.pathname.replace('/', '') || undefined;
          }
        } else if (platform === 'Vimeo') {
          const urlObj = new URL(normalizedUrl);
          const pathname = urlObj.pathname;
          const match = pathname.match(/\/(\d+)/);
          if (match && match[1]) {
            extractedVideoId = match[1];
          }
        }
      }

      if (!extractedVideoId) {
        throw new HttpsError('invalid-argument', 'Could not extract video ID from URL');
      }

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        // Look for cached transcript in pitch/story documents
        // For now, we'll fetch and return - caching will be handled client-side
        // TODO: Implement server-side cache check if needed
      }

      // Fetch transcript based on platform
      let transcriptData: { text: string; timestamps?: Array<{ start: number; end: number; text: string }> };
      let language = 'en';
      let extractedBy = request.auth.uid;
      let usedGemini = false;

      // If useGemini is explicitly requested, skip platform-specific extraction
      if (useGemini) {
        console.log('[extractTranscript] Using Gemini transcription as requested');
        transcriptData = await transcribeWithGemini(normalizedUrl, extractedVideoId, platform, organizationId, request.auth.uid);
        language = 'en';
        usedGemini = true;
        extractedBy = `gemini:${request.auth.uid}`;
      } else if (platform === 'YouTube') {
        try {
          transcriptData = await fetchYouTubeTranscript(extractedVideoId);
          language = 'en'; // Default to English for YouTube
        } catch (youtubeError: any) {
          // Check if this is a "no captions" error
          const isNoCaptionsError = youtubeError.message?.includes('captions') ||
            youtubeError.message?.includes('caption') ||
            youtubeError.message?.includes('does not have captions') ||
            youtubeError.message?.includes('may not have captions');

          // YouTube transcript failed, try Gemini fallback if available
          console.log('[extractTranscript] YouTube transcript failed, attempting Gemini fallback:', youtubeError.message);

          try {
            const geminiKeyData = await getAIApiKey(organizationId, 'gemini', request.auth.uid);
            if (geminiKeyData && geminiKeyData.apiKey) {
              console.log('[extractTranscript] Gemini API key available, using as fallback');
              transcriptData = await transcribeWithGemini(normalizedUrl, extractedVideoId, platform, organizationId, request.auth.uid);
              language = 'en';
              usedGemini = true;
              extractedBy = `gemini:${request.auth.uid}`;
            } else {
              // No Gemini key - if it's a "no captions" error, throw appropriate HttpsError
              if (isNoCaptionsError) {
                throw new HttpsError('failed-precondition', youtubeError.message || 'Video does not have captions available. The video may not have captions enabled.');
              }
              // Otherwise, re-throw the original error
              throw youtubeError;
            }
          } catch (geminiError: any) {
            // Gemini also failed - if it's a "no captions" error, throw appropriate HttpsError
            console.error('[extractTranscript] Gemini fallback also failed:', geminiError.message);

            // Check if Gemini failed because it can't handle YouTube videos (requires video download)
            const isGeminiYouTubeLimitation = geminiError.message?.includes('requires video download') ||
              geminiError.message?.includes('video download');

            // Always throw the "no captions" error if that's what the YouTube error was about
            // This ensures we return the proper error code even if Gemini can't help (e.g., YouTube videos need download)
            if (isNoCaptionsError) {
              // If Gemini can't help because it needs video download, provide a clearer message
              const errorMessage = isGeminiYouTubeLimitation
                ? 'Video does not have captions available. Gemini transcription for YouTube videos requires video download, which is not yet implemented. Please use YouTube\'s built-in transcript feature if available, or enter the transcript manually.'
                : youtubeError.message || 'Video does not have captions available. The video may not have captions enabled.';

              throw new HttpsError('failed-precondition', errorMessage);
            }

            // If the original error wasn't about captions, check if geminiError is an HttpsError and re-throw it
            if (geminiError instanceof HttpsError) {
              throw geminiError;
            }

            // Otherwise, re-throw the original YouTube error
            throw youtubeError;
          }
        }
      } else if (platform === 'Vimeo') {
        try {
          transcriptData = await fetchVimeoTranscript(extractedVideoId);
          language = 'en'; // Default to English for Vimeo
        } catch (vimeoError: any) {
          // Vimeo transcript failed, try Gemini fallback if available
          console.log('[extractTranscript] Vimeo transcript failed, attempting Gemini fallback:', vimeoError.message);

          try {
            const geminiKeyData = await getAIApiKey(organizationId, 'gemini', request.auth.uid);
            if (geminiKeyData && geminiKeyData.apiKey) {
              console.log('[extractTranscript] Gemini API key available, using as fallback');
              transcriptData = await transcribeWithGemini(normalizedUrl, extractedVideoId, platform, organizationId, request.auth.uid);
              language = 'en';
              usedGemini = true;
              extractedBy = `gemini:${request.auth.uid}`;
            } else {
              // No Gemini key, re-throw Vimeo error
              throw vimeoError;
            }
          } catch (geminiError: any) {
            // Gemini also failed, re-throw original Vimeo error
            console.error('[extractTranscript] Gemini fallback also failed:', geminiError.message);
            throw vimeoError;
          }
        }
      } else {
        // Custom/unknown platform - try Gemini directly
        console.log('[extractTranscript] Custom platform, attempting Gemini transcription');
        try {
          const geminiKeyData = await getAIApiKey(organizationId, 'gemini', request.auth.uid);
          if (geminiKeyData && geminiKeyData.apiKey) {
            transcriptData = await transcribeWithGemini(normalizedUrl, extractedVideoId, platform, organizationId, request.auth.uid);
            language = 'en';
            usedGemini = true;
            extractedBy = `gemini:${request.auth.uid}`;
          } else {
            throw new HttpsError('failed-precondition', `Platform ${platform} is not supported and Gemini API key is not configured`);
          }
        } catch (geminiError: any) {
          throw new HttpsError('failed-precondition', `Platform ${platform} is not supported for transcript extraction: ${geminiError.message}`);
        }
      }

      // Format response
      const transcript = {
        videoUrl: normalizedUrl,
        platform,
        language,
        text: transcriptData.text,
        timestamps: transcriptData.timestamps,
        extractedAt: new Date(),
        extractedBy: extractedBy,
        videoId: extractedVideoId
      };

      return {
        success: true,
        transcript,
        cached: false,
        usedGemini: usedGemini // Indicate if Gemini was used (for cost tracking)
      };
    } catch (error: any) {
      console.error('Error extracting transcript:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Failed to extract transcript',
        error.toString()
      );
    }
  }
);


