/**
 * Entity Resolver
 * 
 * Resolves entity references from natural language to actual entity IDs
 * Handles searches by name, ID, show name, season, etc.
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface EntityReference {
  entityType: 'pitch' | 'story' | 'contact' | 'show' | 'license' | 'project' | 'conversation' | 'calendarEvent';
  entityId?: string;
  entityName?: string;
  showName?: string;
  season?: string;
  confidence: number;
}

/**
 * Resolve entity from natural language reference
 */
export async function resolveEntity(
  organizationId: string,
  entityType: 'pitch' | 'story' | 'contact' | 'show' | 'license' | 'project' | 'conversation' | 'calendarEvent',
  reference: string,
  context?: {
    currentShow?: string;
    currentSeason?: string;
    currentProjectId?: string;
  }
): Promise<EntityReference | null> {
  const referenceLower = reference.toLowerCase().trim();

  // If reference looks like an ID (alphanumeric, long enough)
  if (reference.match(/^[a-zA-Z0-9]{20,}$/)) {
    // Try direct ID lookup
    const directResult = await resolveById(organizationId, entityType, reference);
    if (directResult) return directResult;
  }

  // Search by name/title
  const searchResult = await searchByName(
    organizationId,
    entityType,
    reference,
    context
  );

  return searchResult;
}

/**
 * Resolve entity by direct ID lookup
 */
async function resolveById(
  organizationId: string,
  entityType: string,
  entityId: string
): Promise<EntityReference | null> {
  try {
    const collectionMap: { [key: string]: string } = {
      pitch: 'clipShowPitches',
      story: 'clipShowStories',
      contact: 'clipShowContacts',
      show: 'clipShowShows',
      license: 'clipShowLicenses',
      project: 'clipShowProjects',
      conversation: 'clipShowConversations',
      calendarEvent: 'clipShowCalendarEvents'
    };

    const collectionName = collectionMap[entityType];
    if (!collectionName) return null;

    const doc = await db.collection(collectionName).doc(entityId).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (data?.organizationId !== organizationId) return null;

    return {
      entityType: entityType as any,
      entityId: doc.id,
      entityName: getEntityName(entityType, data),
      confidence: 1.0
    };
  } catch (error) {
    console.error(`Error resolving ${entityType} by ID:`, error);
    return null;
  }
}

/**
 * Search entity by name/title
 */
async function searchByName(
  organizationId: string,
  entityType: string,
  searchQuery: string,
  context?: any
): Promise<EntityReference | null> {
  try {
    const collectionMap: { [key: string]: string } = {
      pitch: 'clipShowPitches',
      story: 'clipShowStories',
      contact: 'clipShowContacts',
      show: 'clipShowShows',
      license: 'clipShowLicenses',
      project: 'clipShowProjects',
      conversation: 'clipShowConversations',
      calendarEvent: 'clipShowCalendarEvents'
    };

    const collectionName = collectionMap[entityType];
    if (!collectionName) return null;

    // Build query with organization filter
    let query = db.collection(collectionName)
      .where('organizationId', '==', organizationId);

    // Add context filters if available (Note: Firestore has limits on compound queries)
    // For now, we'll filter client-side after fetching
    // TODO: Consider using composite indexes for better performance

    // Get all matching documents (we'll filter client-side for name matching)
    const snapshot = await query.limit(100).get();

    const searchLower = searchQuery.toLowerCase();
    const queryWords = searchLower.split(/\s+/).filter(w => w.length > 0);

    let bestMatch: { doc: any; score: number } | null = null;

    snapshot.forEach((doc) => {
      const data = doc.data();
      
      // Skip if context filters don't match
      if (context?.currentShow && data.show !== context.currentShow) return;
      if (context?.currentProjectId && data.projectId !== context.currentProjectId) return;

      const entityName = getEntityName(entityType, data).toLowerCase();
      const showName = (data.show || '').toLowerCase();
      const season = (data.season || '').toLowerCase();
      
      // Calculate match score
      let score = 0;
      
      // Exact match gets highest score
      if (entityName === searchLower) {
        score = 100;
      } else if (entityName.includes(searchLower)) {
        score = 80;
      } else {
        // Check if all query words are found
        const allWordsFound = queryWords.every(word => 
          entityName.includes(word) || showName.includes(word) || season.includes(word)
        );
        if (allWordsFound) {
          // Count how many words match
          const matchingWords = queryWords.filter(word => 
            entityName.includes(word) || showName.includes(word) || season.includes(word)
          ).length;
          score = (matchingWords / queryWords.length) * 60;
        }
      }

      // Boost score if show name matches context
      if (context?.currentShow && showName === context.currentShow.toLowerCase()) {
        score += 10;
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { doc: { id: doc.id, data }, score };
      }
    });

    if (bestMatch && bestMatch.score > 20) {
      return {
        entityType: entityType as any,
        entityId: bestMatch.doc.id,
        entityName: getEntityName(entityType, bestMatch.doc.data),
        showName: bestMatch.doc.data.show,
        season: bestMatch.doc.data.season,
        confidence: Math.min(bestMatch.score / 100, 1.0)
      };
    }

    return null;
  } catch (error) {
    console.error(`Error searching ${entityType} by name:`, error);
    return null;
  }
}

/**
 * Get entity name/title based on type
 */
function getEntityName(entityType: string, data: any): string {
  switch (entityType) {
    case 'pitch':
    case 'story':
      return data.clipTitle || data.title || 'Untitled';
    case 'contact':
      return data.name || 'Unnamed Contact';
    case 'show':
      return data.name || 'Unnamed Show';
    case 'license':
      return data.licensor || 'Unnamed License';
    case 'project':
      return data.name || 'Unnamed Project';
    case 'conversation':
      return data.name || 'Unnamed Conversation';
    case 'calendarEvent':
      return data.title || 'Unnamed Event';
    default:
      return 'Unknown';
  }
}

/**
 * Extract entity reference from natural language
 * Handles patterns like "Storage Wars pitch", "this pitch", "the script for X"
 */
export function extractEntityReference(message: string, context?: any): {
  entityType?: string;
  reference?: string;
  action?: string;
} {
  // Skip entity extraction for suggestions mode messages
  // Check multiple indicators that this is a suggestions mode message
  const messageTrimmed = message.trim();
  const messageLower = message.toLowerCase();
  
  if (messageTrimmed.startsWith('[SUGGESTIONS MODE]') ||
      messageLower.includes('===selected_text===') ||
      messageLower.includes('generate one script suggestion') ||
      messageLower.includes('targettext field must be')) {
    return { action: 'view' }; // Return empty result to skip entity parsing
  }
  
  // Action keywords
  const viewActions = ['show', 'view', 'display', 'open', 'see', 'look at'];
  const action = viewActions.find(a => messageLower.includes(a)) || 'view';

  // Entity type keywords
  const entityPatterns: { [key: string]: RegExp[] } = {
    pitch: [
      /(?:the\s+)?(?:pitch|clip)(?:\s+for)?\s+(?:["']([^"']+)["']|([a-zA-Z0-9\s]+))/i,
      /(?:this|that|the)\s+(?:pitch|clip)/i
    ],
    story: [
      /(?:the\s+)?(?:story|script)(?:\s+for)?\s+(?:["']([^"']+)["']|([a-zA-Z0-9\s]+))/i,
      /(?:this|that|the)\s+(?:story|script)/i,
      /script\s+for\s+(?:["']([^"']+)["']|([a-zA-Z0-9\s]+))/i
    ],
    contact: [
      /(?:the\s+)?contact\s+(?:["']([^"']+)["']|([a-zA-Z0-9\s]+))/i,
      /(?:this|that|the)\s+contact/i
    ],
    show: [
      /(?:the\s+)?show\s+(?:["']([^"']+)["']|([a-zA-Z0-9\s]+))/i,
      /(?:this|that|the)\s+show/i
    ],
    project: [
      /(?:the\s+)?project\s+(?:["']([^"']+)["']|([a-zA-Z0-9\s]+))/i,
      /(?:this|that|the)\s+project/i
    ]
  };

  // Try to extract entity type and reference
  for (const [entityType, patterns] of Object.entries(entityPatterns)) {
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        const reference = match[1] || match[2] || match[3] || match[4] || 
                         (context?.entityId ? undefined : 'this');
        return {
          entityType,
          reference: reference?.trim(),
          action
        };
      }
    }
  }

  // Fallback: check context
  if (context?.entityType && context?.entityId) {
    return {
      entityType: context.entityType,
      reference: context.entityId,
      action
    };
  }

  return { action };
}

