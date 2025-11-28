/**
 * Create Operation Handler
 * 
 * Centralized handler for executing create operations via Firebase Admin SDK
 * Used by AI assistant to create entities from natural language prompts
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

const db = getFirestore();

export interface CreateOperationRequest {
  entityType: 'pitch' | 'story' | 'contact' | 'show' | 'license' | 'project' | 'conversation' | 'calendarEvent';
  data: any;
  organizationId: string;
  userId: string;
  context?: {
    projectId?: string;
    show?: string;
    season?: string;
    pitchId?: string;
  };
}

export interface CreateOperationResponse {
  success: boolean;
  entityId?: string;
  entity?: any;
  missingFields?: string[];
  error?: string;
}

/**
 * Execute create operation based on entity type
 */
export async function executeCreateOperation(
  request: CreateOperationRequest
): Promise<CreateOperationResponse> {
  try {
    const { entityType, data, organizationId, userId, context } = request;

    // Validate required fields
    const validationResult = validateRequiredFields(entityType, data);
    if (!validationResult.valid) {
      return {
        success: false,
        missingFields: validationResult.missingFields,
        error: `Missing required fields: ${validationResult.missingFields.join(', ')}`
      };
    }

    // Apply context-aware defaults
    const enrichedData = applyContextDefaults(entityType, data, context, organizationId, userId);

    // Execute create operation based on entity type
    let entityId: string;
    let createdEntity: any;

    switch (entityType) {
      case 'pitch':
        ({ entityId, entity: createdEntity } = await createPitch(enrichedData, organizationId, userId));
        break;
      case 'story':
        ({ entityId, entity: createdEntity } = await createStory(enrichedData, organizationId, userId, context));
        break;
      case 'contact':
        ({ entityId, entity: createdEntity } = await createContact(enrichedData, organizationId, userId));
        break;
      case 'show':
        ({ entityId, entity: createdEntity } = await createShow(enrichedData, organizationId, userId));
        break;
      case 'license':
        ({ entityId, entity: createdEntity } = await createLicense(enrichedData, organizationId, userId));
        break;
      case 'project':
        ({ entityId, entity: createdEntity } = await createProject(enrichedData, organizationId, userId));
        break;
      case 'conversation':
        ({ entityId, entity: createdEntity } = await createConversation(enrichedData, organizationId, userId));
        break;
      case 'calendarEvent':
        ({ entityId, entity: createdEntity } = await createCalendarEvent(enrichedData, organizationId, userId));
        break;
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }

    return {
      success: true,
      entityId,
      entity: createdEntity
    };
  } catch (error) {
    console.error(`Error creating ${request.entityType}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Validate required fields for each entity type
 */
function validateRequiredFields(entityType: string, data: any): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  switch (entityType) {
    case 'pitch':
      if (!data.clipTitle) missingFields.push('clipTitle');
      if (!data.show) missingFields.push('show');
      if (!data.season) missingFields.push('season');
      if (!data.clipType) missingFields.push('clipType');
      if (!data.sourceLink && (!data.sourceLinks || data.sourceLinks.length === 0)) {
        missingFields.push('sourceLink or sourceLinks');
      }
      break;
    case 'story':
      if (!data.clipTitle) missingFields.push('clipTitle');
      if (!data.show) missingFields.push('show');
      if (!data.season) missingFields.push('season');
      break;
    case 'contact':
      if (!data.name) missingFields.push('name');
      if (!data.email) missingFields.push('email');
      break;
    case 'show':
      if (!data.name) missingFields.push('name');
      break;
    case 'license':
      if (!data.clipPitchId) missingFields.push('clipPitchId');
      if (!data.licensor) missingFields.push('licensor');
      if (!data.licensorContact) missingFields.push('licensorContact');
      if (!data.licensorEmail) missingFields.push('licensorEmail');
      if (!data.territory) missingFields.push('territory');
      if (!data.term) missingFields.push('term');
      if (!data.terms) missingFields.push('terms');
      if (!data.usageRights || data.usageRights.length === 0) missingFields.push('usageRights');
      break;
    case 'project':
      if (!data.name) missingFields.push('name');
      break;
    case 'conversation':
      if (!data.participants || data.participants.length === 0) missingFields.push('participants');
      break;
    case 'calendarEvent':
      if (!data.title) missingFields.push('title');
      if (!data.startDate) missingFields.push('startDate');
      break;
  }

  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Apply context-aware defaults
 */
function applyContextDefaults(
  entityType: string,
  data: any,
  context: any,
  organizationId: string,
  userId: string
): any {
  const enriched = { ...data };

  // Common defaults
  enriched.organizationId = organizationId;

  // Entity-specific defaults
  switch (entityType) {
    case 'pitch':
      enriched.status = enriched.status || 'Pitched';
      enriched.priority = enriched.priority || 'Medium';
      enriched.categories = enriched.categories || [];
      enriched.tags = enriched.tags || [];
      enriched.comments = enriched.comments || [];
      enriched.projectId = enriched.projectId || context?.projectId;
      break;
    case 'story':
      enriched.status = enriched.status || 'Ready for Script';
      enriched.categories = enriched.categories || [];
      enriched.projectId = enriched.projectId || context?.projectId;
      enriched.show = enriched.show || context?.show;
      enriched.season = enriched.season || context?.season;
      enriched.clipPitchId = enriched.clipPitchId || context?.pitchId;
      break;
    case 'contact':
      enriched.assignedPitches = enriched.assignedPitches || [];
      enriched.assignedStories = enriched.assignedStories || [];
      enriched.assignedShows = enriched.assignedShows || [];
      break;
    case 'show':
      enriched.status = enriched.status || 'active';
      break;
    case 'license':
      enriched.status = enriched.status || 'Draft';
      enriched.currency = enriched.currency || 'USD';
      enriched.restrictions = enriched.restrictions || [];
      enriched.clipPitchId = enriched.clipPitchId || context?.pitchId;
      break;
    case 'project':
      enriched.status = enriched.status || 'active';
      enriched.isActive = enriched.isActive !== undefined ? enriched.isActive : true;
      enriched.isArchived = enriched.isArchived !== undefined ? enriched.isArchived : false;
      break;
    case 'calendarEvent':
      enriched.eventType = enriched.eventType || 'meeting';
      enriched.assignedContacts = enriched.assignedContacts || [];
      enriched.projectId = enriched.projectId || context?.projectId;
      break;
  }

  return enriched;
}

/**
 * Create a pitch
 */
async function createPitch(data: any, organizationId: string, userId: string): Promise<{ entityId: string; entity: any }> {
  const pitchData = {
    ...data,
    organizationId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  // Remove id if present (will be generated by Firestore)
  delete pitchData.id;

  const docRef = await db.collection('clipShowPitches').add(pitchData);
  
  return {
    entityId: docRef.id,
    entity: { id: docRef.id, ...pitchData }
  };
}

/**
 * Create a story
 */
async function createStory(data: any, organizationId: string, userId: string, context?: any): Promise<{ entityId: string; entity: any }> {
  const storyData = {
    ...data,
    organizationId,
    revisions: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  // Remove id if present
  delete storyData.id;

  const docRef = await db.collection('clipShowStories').add(storyData);

  // If story is linked to a pitch, update the pitch with the storyId
  if (storyData.clipPitchId) {
    try {
      await db.collection('clipShowPitches').doc(storyData.clipPitchId).update({
        storyId: docRef.id,
        updatedAt: FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.warn('Failed to update pitch with storyId:', error);
      // Don't fail story creation if pitch update fails
    }
  }

  return {
    entityId: docRef.id,
    entity: { id: docRef.id, ...storyData, revisions: [] }
  };
}

/**
 * Create a contact
 */
async function createContact(data: any, organizationId: string, userId: string): Promise<{ entityId: string; entity: any }> {
  const contactData = {
    ...data,
    organizationId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: userId
  };

  delete contactData.id;

  const docRef = await db.collection('clipShowContacts').add(contactData);

  return {
    entityId: docRef.id,
    entity: { id: docRef.id, ...contactData }
  };
}

/**
 * Create a show
 */
async function createShow(data: any, organizationId: string, userId: string): Promise<{ entityId: string; entity: any }> {
  const showData = {
    ...data,
    organizationId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: userId
  };

  delete showData.id;

  const docRef = await db.collection('clipShowShows').add(showData);

  return {
    entityId: docRef.id,
    entity: { id: docRef.id, ...showData }
  };
}

/**
 * Create a license
 */
async function createLicense(data: any, organizationId: string, userId: string): Promise<{ entityId: string; entity: any }> {
  const licenseData = {
    ...data,
    organizationId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  delete licenseData.id;

  const docRef = await db.collection('clipShowLicenses').add(licenseData);

  // Update pitch with license ID if provided
  if (licenseData.clipPitchId) {
    try {
      await db.collection('clipShowPitches').doc(licenseData.clipPitchId).update({
        licenseAgreementId: docRef.id,
        updatedAt: FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.warn('Failed to update pitch with licenseId:', error);
    }
  }

  return {
    entityId: docRef.id,
    entity: { id: docRef.id, ...licenseData }
  };
}

/**
 * Create a project
 */
async function createProject(data: any, organizationId: string, userId: string): Promise<{ entityId: string; entity: any }> {
  const projectData = {
    ...data,
    organizationId,
    createdBy: userId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastAccessedAt: FieldValue.serverTimestamp()
  };

  delete projectData.id;

  const docRef = await db.collection('clipShowProjects').add(projectData);

  return {
    entityId: docRef.id,
    entity: { id: docRef.id, ...projectData }
  };
}

/**
 * Create a conversation
 */
async function createConversation(data: any, organizationId: string, userId: string): Promise<{ entityId: string; entity: any }> {
  const conversationData = {
    ...data,
    organizationId,
    participants: data.participants || [userId],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: userId
  };

  delete conversationData.id;

  const docRef = await db.collection('clipShowConversations').add(conversationData);

  return {
    entityId: docRef.id,
    entity: { id: docRef.id, ...conversationData }
  };
}

/**
 * Create a calendar event
 */
async function createCalendarEvent(data: any, organizationId: string, userId: string): Promise<{ entityId: string; entity: any }> {
  // Convert date strings to Timestamps if needed
  const startDate = data.startDate instanceof Date 
    ? admin.firestore.Timestamp.fromDate(data.startDate)
    : data.startDate instanceof admin.firestore.Timestamp
    ? data.startDate
    : admin.firestore.Timestamp.fromDate(new Date(data.startDate));

  const endDate = data.endDate 
    ? (data.endDate instanceof Date
      ? admin.firestore.Timestamp.fromDate(data.endDate)
      : data.endDate instanceof admin.firestore.Timestamp
      ? data.endDate
      : admin.firestore.Timestamp.fromDate(new Date(data.endDate)))
    : null;

  const eventData = {
    ...data,
    organizationId,
    startDate,
    endDate: endDate || startDate,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: userId
  };

  delete eventData.id;

  const docRef = await db.collection('clipShowCalendarEvents').add(eventData);

  return {
    entityId: docRef.id,
    entity: { id: docRef.id, ...eventData }
  };
}

