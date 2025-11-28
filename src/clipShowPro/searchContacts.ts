/**
 * 🔍 Comprehensive Contact Search Function
 * 
 * Uses Firebase Admin SDK to search ALL contacts comprehensively
 * Bypasses security rules to ensure all contacts are searchable
 * Searches across all contact fields for maximum discoverability
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Helper function to check if a contact matches the search query
 * Searches across ALL contact fields comprehensively
 */
function contactMatchesSearch(contactData: any, searchLower: string): boolean {
  if (!contactData || !searchLower) return false;

  // Build comprehensive searchable text from ALL contact fields
  const searchableFields = [
    contactData.name || '',
    contactData.email || '',
    contactData.phone || '',
    contactData.company || '',
    contactData.title || '',
    contactData.department || '',
    contactData.role || '',
    contactData.status || '',
    contactData.availability || '',
    contactData.notes || '',
    contactData.lastProject || '',
    // Handle specialties array
    Array.isArray(contactData.specialties) 
      ? contactData.specialties.join(' ') 
      : (contactData.specialties || ''),
    // Handle assigned fields arrays
    Array.isArray(contactData.assignedPitches) 
      ? contactData.assignedPitches.join(' ') 
      : '',
    Array.isArray(contactData.assignedStories) 
      ? contactData.assignedStories.join(' ') 
      : '',
    Array.isArray(contactData.assignedShows) 
      ? contactData.assignedShows.join(' ') 
      : '',
    // Include contact ID for direct ID searches
    contactData.id || '',
  ];

  // Combine all fields into a single searchable string
  const combinedText = searchableFields
    .map(field => String(field).toLowerCase().trim())
    .filter(field => field.length > 0)
    .join(' ');

  // Multi-word search: all words must be found (even if not together)
  const queryWords = searchLower.split(/\s+/).filter(word => word.length > 0);
  
  if (queryWords.length === 0) return false;
  
  // Single word: use simple includes for partial matching
  if (queryWords.length === 1) {
    return combinedText.includes(queryWords[0]);
  }
  
  // Multi-word: all words must be found somewhere in the combined text
  return queryWords.every(word => combinedText.includes(word));
}

/**
 * Comprehensive Contact Search Function
 * 
 * Uses Admin SDK to search ALL contacts without security rule restrictions
 * Searches across all contact fields for maximum discoverability
 */
export const searchContacts = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    try {
      const { organizationId, query, limit = 50 } = request.data as {
        organizationId: string;
        query: string;
        limit?: number;
      };

      // Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Validate required parameters
      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      if (!query || query.trim().length < 2) {
        throw new HttpsError('invalid-argument', 'Search query must be at least 2 characters');
      }

      const searchLower = query.toLowerCase().trim();
      console.log(`🔍 [searchContacts] Searching contacts for org: ${organizationId}, query: "${searchLower}"`);

      // Use Admin SDK to get ALL contacts for the organization
      // This bypasses security rules and ensures we get all contacts
      const contactsSnapshot = await db.collection('clipShowContacts')
        .where('organizationId', '==', organizationId)
        .get();

      console.log(`📊 [searchContacts] Found ${contactsSnapshot.size} total contacts in organization`);

      // Filter contacts client-side using comprehensive search
      const matchingContacts: any[] = [];
      
      for (const doc of contactsSnapshot.docs) {
        const contactData = doc.data();
        const contactId = doc.id;
        
        // Add ID to contact data for search matching
        const contactWithId = { ...contactData, id: contactId };
        
        // Check if contact matches search query
        if (contactMatchesSearch(contactWithId, searchLower)) {
          matchingContacts.push({
            id: contactId,
            ...contactData,
          });
        }
      }

      // Sort by relevance (name matches first, then email, then others)
      matchingContacts.sort((a, b) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        const aEmail = (a.email || '').toLowerCase();
        const bEmail = (b.email || '').toLowerCase();
        
        // Exact name match gets highest priority
        if (aName === searchLower) return -1;
        if (bName === searchLower) return 1;
        
        // Name starts with query gets second priority
        if (aName.startsWith(searchLower)) return -1;
        if (bName.startsWith(searchLower)) return 1;
        
        // Email exact match gets third priority
        if (aEmail === searchLower) return -1;
        if (bEmail === searchLower) return 1;
        
        // Email starts with query gets fourth priority
        if (aEmail.startsWith(searchLower)) return -1;
        if (bEmail.startsWith(searchLower)) return 1;
        
        // Otherwise maintain original order
        return 0;
      });

      // Apply limit
      const limitedResults = matchingContacts.slice(0, limit);

      console.log(`✅ [searchContacts] Found ${limitedResults.length} matching contacts (showing up to ${limit})`);

      return {
        success: true,
        contacts: limitedResults,
        totalCount: matchingContacts.length,
        query: searchLower,
        organizationId,
      };

    } catch (error: any) {
      console.error('❌ [searchContacts] Error searching contacts:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to search contacts: ${error.message || 'Unknown error'}`
      );
    }
  }
);

