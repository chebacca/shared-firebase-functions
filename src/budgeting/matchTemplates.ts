import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Interfaces (simplified for the function)
interface MatchRequest {
    groups: { id: string; name: string }[];
    indexedFiles: { id: string; name: string; metadata?: any }[];
    options?: {
        matchThreshold?: number;
        enableFuzzyMatching?: boolean;
    };
}

interface MatchResult {
    matches: {
        groupId: string;
        indexedFileId: string;
        confidence: number;
        matchType: string;
    }[];
}

/**
 * Normalizes file name for consistent matching
 */
function normalizeFileName(name: string): string {
    if (!name) return '';
    return name
        .toLowerCase()
        .trim()
        .replace(/\.[^/.]+$/, '') // Remove file extension
        .replace(/[^a-z0-9]/g, '') // Remove special chars
        .replace(/\s+/g, ''); // Remove all whitespace
}

/**
 * Advanced string similarity calculation
 * (Proprietary Logic Shielded on Server)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;

    // Levenshtein distance implementation
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len2; i++) matrix[i] = [i];
    for (let j = 0; j <= len1; j++) matrix[0][j] = j;

    for (let i = 1; i <= len2; i++) {
        for (let j = 1; j <= len1; j++) {
            if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : (maxLen - matrix[len2][len1]) / maxLen;
}

/**
 * Cloud Function to match templates
 * Protects the proprietary matching algorithm by running it server-side
 */
export const matchTemplates = onCall(async (request) => {
    // Authentication Gate check (Logic Shield requires Auth)
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { groups, indexedFiles, options } = request.data as MatchRequest;
    const matchThreshold = options?.matchThreshold || 0.7;

    const matches: MatchResult['matches'] = [];

    // Proprietary Matching Logic
    for (const group of groups) {
        let bestMatch: { fileId: string; confidence: number; type: string } | null = null;
        let highestConfidence = 0;

        const normalizedGroupName = normalizeFileName(group.name);

        for (const file of indexedFiles) {
            const normalizedFileName = normalizeFileName(file.name);
            let confidence = 0;
            let matchType = 'none';

            if (normalizedGroupName === normalizedFileName) {
                confidence = 1.0;
                matchType = 'exact';
            } else {
                confidence = calculateStringSimilarity(normalizedGroupName, normalizedFileName);
                if (confidence > 0.8) matchType = 'partial';
                else if (confidence > 0.6) matchType = 'fuzzy';
            }

            // Metadata matching (simplified for this shield)
            if (file.metadata && group.name.toLowerCase().includes('1080p') && file.metadata.height === 1080) {
                confidence = Math.min(confidence + 0.1, 1.0);
            }

            if (confidence > highestConfidence) {
                highestConfidence = confidence;
                bestMatch = { fileId: file.id, confidence, type: matchType };
            }
        }

        if (bestMatch && highestConfidence >= matchThreshold) {
            matches.push({
                groupId: group.id,
                indexedFileId: bestMatch.fileId,
                confidence: bestMatch.confidence,
                matchType: bestMatch.type
            });
        }
    }

    return { matches };
});
