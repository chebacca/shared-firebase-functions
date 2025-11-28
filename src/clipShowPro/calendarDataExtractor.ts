/**
 * Calendar Data Extractor
 * 
 * Extracts dates and related data from pitches, clearances, stories, scripts, and edit data
 * Used to determine calendar event dates and metadata
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

export interface ExtractedDates {
  primaryDate: Date | null;
  clearanceSignedDate: Date | null;
  clearanceExpirationDate: Date | null;
  storyUpdatedDate: Date | null;
  transcodingDate: Date | null;
  nleTransferDate: Date | null;
}

export interface RelatedData {
  hasClearance: boolean;
  clearanceStatus?: string;
  hasStory: boolean;
  storyStatus?: string;
  hasTranscoding: boolean;
  transcodingStatus?: string;
}

/**
 * Extract dates from related clearances for a pitch
 */
export async function extractClearanceDates(pitchId: string): Promise<{ signedDate: Date | null; expirationDate: Date | null; status: string | null }> {
  try {
    const clearanceQuery = await db.collection('licenseAgreements')
      .where('clipPitchId', '==', pitchId)
      .limit(1)
      .get();

    if (clearanceQuery.empty) {
      return { signedDate: null, expirationDate: null, status: null };
    }

    const clearance = clearanceQuery.docs[0].data();
    const signedDate = clearance.signedDate?.toDate() || null;
    const expirationDate = clearance.expirationDate?.toDate() || null;
    const status = clearance.status || null;

    return { signedDate, expirationDate, status };
  } catch (error) {
    console.error(`Error extracting clearance dates for pitch ${pitchId}:`, error);
    return { signedDate: null, expirationDate: null, status: null };
  }
}

/**
 * Extract dates from related stories for a pitch
 */
export async function extractStoryDates(pitchId: string): Promise<{ createdAt: Date | null; updatedAt: Date | null; status: string | null }> {
  try {
    const storyQuery = await db.collection('clipShowStories')
      .where('clipPitchId', '==', pitchId)
      .limit(1)
      .get();

    if (storyQuery.empty) {
      return { createdAt: null, updatedAt: null, status: null };
    }

    const story = storyQuery.docs[0].data();
    const createdAt = story.createdAt?.toDate() || null;
    const updatedAt = story.updatedAt?.toDate() || null;
    const status = story.status || null;

    return { createdAt, updatedAt, status };
  } catch (error) {
    console.error(`Error extracting story dates for pitch ${pitchId}:`, error);
    return { createdAt: null, updatedAt: null, status: null };
  }
}

/**
 * Extract transcoding and edit data from pitch
 */
export function extractEditData(pitch: any): { transcodingStatus: string | null; nleTransferDate: Date | null } {
  const transcodingStatus = pitch.transcodingStatus || null;
  const nleTransferDate = pitch.nleTransferDate?.toDate() || null;

  return { transcodingStatus, nleTransferDate };
}

/**
 * Extract all relevant dates for a pitch
 */
export async function extractAllDates(pitch: any): Promise<ExtractedDates> {
  const pitchId = pitch.id;
  
  // Extract clearance dates
  const { signedDate, expirationDate } = await extractClearanceDates(pitchId);
  
  // Extract story dates
  const { updatedAt: storyUpdatedAt } = await extractStoryDates(pitchId);
  
  // Extract edit/transcoding data
  const { nleTransferDate } = extractEditData(pitch);
  
  // Determine primary date based on pitch status and related data
  let primaryDate: Date | null = null;
  
  if (pitch.status === 'License Cleared' && signedDate) {
    // Use clearance signed date if pitch is cleared
    primaryDate = signedDate;
  } else if (storyUpdatedAt && ['Ready for Script', 'Script Complete', 'V1 Cut', 'Ready for Build'].includes(pitch.status)) {
    // Use story update date if in story-related phase
    primaryDate = storyUpdatedAt;
  } else if (nleTransferDate && ['Ready for Ingest', 'Transcoded', 'Ingested', 'Edit Ready'].includes(pitch.transcodingStatus)) {
    // Use transfer date if in transcoding phase
    primaryDate = nleTransferDate;
  } else if (pitch.updatedAt) {
    // Fall back to pitch update date
    primaryDate = pitch.updatedAt.toDate();
  } else if (pitch.createdAt) {
    // Final fallback to creation date
    primaryDate = pitch.createdAt.toDate();
  }

  return {
    primaryDate,
    clearanceSignedDate: signedDate,
    clearanceExpirationDate: expirationDate,
    storyUpdatedDate: storyUpdatedAt,
    transcodingDate: null, // Could extract from transcoding status change history if needed
    nleTransferDate
  };
}

/**
 * Get related data summary for a pitch
 */
export async function getRelatedData(pitchId: string): Promise<RelatedData> {
  try {
    // Check for clearance
    const clearanceQuery = await db.collection('licenseAgreements')
      .where('clipPitchId', '==', pitchId)
      .limit(1)
      .get();
    
    const hasClearance = !clearanceQuery.empty;
    const clearanceStatus = hasClearance ? clearanceQuery.docs[0].data().status : undefined;

    // Check for story
    const storyQuery = await db.collection('clipShowStories')
      .where('clipPitchId', '==', pitchId)
      .limit(1)
      .get();
    
    const hasStory = !storyQuery.empty;
    const storyStatus = hasStory ? storyQuery.docs[0].data().status : undefined;

    // Check for transcoding (from pitch itself)
    const pitchDoc = await db.collection('clipShowPitches').doc(pitchId).get();
    const pitch = pitchDoc.data();
    const hasTranscoding = !!pitch?.transcodingStatus;
    const transcodingStatus = pitch?.transcodingStatus || undefined;

    return {
      hasClearance,
      clearanceStatus,
      hasStory,
      storyStatus,
      hasTranscoding,
      transcodingStatus
    };
  } catch (error) {
    console.error(`Error getting related data for pitch ${pitchId}:`, error);
    return {
      hasClearance: false,
      hasStory: false,
      hasTranscoding: false
    };
  }
}

/**
 * Convert Firestore Timestamp to Date safely
 */
export function toDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate) return timestamp.toDate();
  if (timestamp._seconds) {
    return new Date(timestamp._seconds * 1000);
  }
  return null;
}

