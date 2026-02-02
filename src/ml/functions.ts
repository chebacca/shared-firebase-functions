/**
 * Firebase Functions for ML Services
 * 
 * Exposes ML capabilities as callable Firebase Functions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getVectorSearchService } from './VectorSearchService';
import { getDocumentAIService } from './DocumentAIService';
import { getPredictiveAnalyticsService } from './PredictiveAnalyticsService';
import { getAuthenticatedUserOrg } from './authHelpers';
import { getDataIndexingService } from './DataIndexingService';

// Define secrets
const geminiApiKey = defineSecret('GEMINI_API_KEY');

/**
 * Semantic search across collections
 * Tenant isolation: Uses authenticated user's organizationId, ignores request parameter
 */
export const semanticSearch = onCall(
  {
    secrets: [geminiApiKey],
    region: 'us-central1',
    invoker: 'public',
    cors: true,
    cpu: 0.5,  // Reduced from 1.0 to work around CPU quota
    memory: '512MiB'
  },
  async (request) => {
    try {
      // 1. Get authenticated user's organizationId (from auth, not request)
      const { organizationId: userOrgId } = await getAuthenticatedUserOrg(request);

      // 2. IGNORE organizationId from request.data - use user's org
      const { query, collection, limit = 10 } = request.data;

      if (!query) {
        throw new HttpsError('invalid-argument', 'query is required');
      }

      // 3. Use user's organizationId for all queries
      const vectorSearch = getVectorSearchService(geminiApiKey.value());
      const results = await vectorSearch.semanticSearch(
        query,
        collection || 'all',
        userOrgId, // Use authenticated user's org, not request param
        limit
      );

      return {
        success: true,
        data: results,
        count: results.length
      };
    } catch (error: any) {
      console.error('Error in semanticSearch:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error.message || 'Failed to perform semantic search'
      );
    }
  }
);

/**
 * Search across multiple collections
 * Tenant isolation: Uses authenticated user's organizationId, ignores request parameter
 */
// CORS allowed origins for ML functions
const ML_CORS_ORIGINS = [
  'http://localhost:4001',
  'http://localhost:4002',
  'http://localhost:4003',
  'http://localhost:4004',
  'http://localhost:4005', // CNS
  'http://localhost:4006',
  'http://localhost:4007',
  'http://localhost:4009',
  'http://localhost:4010',
  'http://localhost:4011',
  'http://localhost:5173', // Bridge
  'https://backbone-client.web.app',
  'https://backbone-logic.web.app',
  'https://backbone-callsheet-standalone.web.app',
  'https://clipshowpro.web.app',
  'https://dashboard-1c3a5.web.app',
];

export const searchAll = onCall(
  {
    region: 'us-central1',
    invoker: 'public', // Required for CORS preflight requests
    cors: true, // Set to true to bypass whitelist issues in production
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
    secrets: [geminiApiKey],
  },
  async (request) => {
    try {
      // 1. Get authenticated user's organizationId (from auth, not request)
      const { organizationId: userOrgId } = await getAuthenticatedUserOrg(request);

      // 2. IGNORE organizationId from request.data - use user's org
      const { query, collections, limit = 10 } = request.data;

      if (!query) {
        throw new HttpsError('invalid-argument', 'query is required');
      }

      // 3. Use user's organizationId for all queries
      const vectorSearch = getVectorSearchService(geminiApiKey.value());
      const results = await vectorSearch.searchAll(
        query,
        userOrgId, // Use authenticated user's org, not request param
        collections || [
          // Core Collections
          'projects', 'teamMembers', 'contacts', 'inventoryItems',
          // Session & Workflow
          'sessions', 'workflows', 'workflowInstances', 'workflowSteps',
          // Timecards
          'timecards', 'timecard_entries',
          // Media & Post-Production
          'postProductionTasks', 'mediaFiles',
          // Network Delivery
          'networkDeliveryBibles', 'deliverables',
          // Call Sheets
          'callSheets', 'scenes',
          // Budget & Financial
          'budgets', 'invoices',
          // ClipShow
          'clipShowProjects', 'clipShowPitches', 'clipShowStories',
          // Notes & Communication
          'notes', 'messages',
          // Calendar
          'calendarEvents',
          // Clients & Roles
          'clients', 'roles', 'locations'
        ],
        limit
      );

      return {
        success: true,
        data: results,
        count: results.length
      };
    } catch (error: any) {
      console.error('Error in searchAll:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error.message || 'Failed to perform search'
      );
    }
  }
);

/**
 * Find similar entities
 * Tenant isolation: Uses authenticated user's organizationId, ignores request parameter
 */
export const findSimilar = onCall(
  {
    secrets: [geminiApiKey],
    region: 'us-central1',
    cpu: 0.5,  // Reduced from 1.0 to work around CPU quota
    memory: '512MiB'
  },
  async (request) => {
    try {
      // 1. Get authenticated user's organizationId (from auth, not request)
      const { organizationId: userOrgId } = await getAuthenticatedUserOrg(request);

      // 2. IGNORE organizationId from request.data - use user's org
      const { collection, docId, limit = 5 } = request.data;

      if (!collection || !docId) {
        throw new HttpsError(
          'invalid-argument',
          'collection and docId are required'
        );
      }

      // 3. Use user's organizationId for all queries
      const vectorSearch = getVectorSearchService(geminiApiKey.value());
      const results = await vectorSearch.findSimilar(
        collection,
        docId,
        userOrgId, // Use authenticated user's org, not request param
        limit
      );

      return {
        success: true,
        data: results,
        count: results.length
      };
    } catch (error: any) {
      console.error('Error in findSimilar:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error.message || 'Failed to find similar entities'
      );
    }
  }
);

/**
 * Index an entity for vector search
 * Tenant isolation: Validates entity belongs to user's organization before indexing
 */
export const indexEntity = onCall(
  {
    secrets: [geminiApiKey],
    region: 'us-central1'
  },
  async (request) => {
    try {
      // 1. Get authenticated user's organizationId (from auth, not request)
      const { organizationId: userOrgId } = await getAuthenticatedUserOrg(request);

      // 2. Get request parameters
      const { collection, docId, text, metadata } = request.data;

      if (!collection || !docId || !text) {
        throw new HttpsError(
          'invalid-argument',
          'collection, docId, and text are required'
        );
      }

      // 3. Validate document belongs to user's organization
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      const docRef = db.collection(collection).doc(docId);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new HttpsError('not-found', `Document ${docId} not found in ${collection}`);
      }

      const docData = doc.data();
      if (docData?.organizationId !== userOrgId) {
        throw new HttpsError(
          'permission-denied',
          'Document does not belong to your organization'
        );
      }

      // 4. Index entity with user's organizationId in metadata
      const vectorSearch = getVectorSearchService(geminiApiKey.value());
      await vectorSearch.indexEntity(collection, docId, text, {
        ...metadata,
        organizationId: userOrgId // Ensure organizationId is set
      });

      return {
        success: true,
        message: 'Entity indexed successfully'
      };
    } catch (error: any) {
      console.error('Error in indexEntity:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error.message || 'Failed to index entity'
      );
    }
  }
);

/**
 * Parse network delivery bible
 */
export const parseNetworkBible = onCall(
  {
    region: 'us-central1',
    cpu: 0.5,
    memory: '512MiB',
  },
  async (request) => {
    try {
      const { pdfUrl } = request.data;

      if (!pdfUrl) {
        throw new HttpsError('invalid-argument', 'pdfUrl is required');
      }

      const documentAI = getDocumentAIService();
      const data = await documentAI.parseNetworkBible(pdfUrl);

      return {
        success: true,
        data
      };
    } catch (error: any) {
      console.error('Error in parseNetworkBible:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to parse network bible'
      );
    }
  }
);

/**
 * Extract budget data from PDF
 */
export const extractBudgetData = onCall(
  {
    region: 'us-central1',
    cpu: 0.5,
    memory: '512MiB',
  },
  async (request) => {
    try {
      const { pdfUrl } = request.data;

      if (!pdfUrl) {
        throw new HttpsError('invalid-argument', 'pdfUrl is required');
      }

      const documentAI = getDocumentAIService();
      const data = await documentAI.extractBudgetData(pdfUrl);

      return {
        success: true,
        data
      };
    } catch (error: any) {
      console.error('Error in extractBudgetData:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to extract budget data'
      );
    }
  }
);

/**
 * Parse script PDF
 */
export const parseScript = onCall(
  {
    region: 'us-central1',
    cpu: 0.5,
    memory: '512MiB',
  },
  async (request) => {
    try {
      const { pdfUrl } = request.data;

      if (!pdfUrl) {
        throw new HttpsError('invalid-argument', 'pdfUrl is required');
      }

      const documentAI = getDocumentAIService();
      const data = await documentAI.parseScript(pdfUrl);

      return {
        success: true,
        data
      };
    } catch (error: any) {
      console.error('Error in parseScript:', error);
      throw new HttpsError(
        'internal',
        error.message || 'Failed to parse script'
      );
    }
  }
);

/**
 * Predict budget health
 * Tenant isolation: Validates project belongs to user's organization
 */
export const predictBudgetHealth = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    try {
      // 1. Get authenticated user's organizationId (from auth, not request)
      const { organizationId: userOrgId } = await getAuthenticatedUserOrg(request);

      // 2. Get projectId from request
      const { projectId } = request.data;

      if (!projectId) {
        throw new HttpsError('invalid-argument', 'projectId is required');
      }

      // 3. Validate project belongs to user's organization
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      const projectDoc = await db.collection('projects').doc(projectId).get();

      if (!projectDoc.exists) {
        throw new HttpsError('not-found', 'Project not found');
      }

      const projectData = projectDoc.data();
      if (projectData?.organizationId !== userOrgId) {
        throw new HttpsError(
          'permission-denied',
          'Project does not belong to your organization'
        );
      }

      // 4. Get prediction
      const analytics = getPredictiveAnalyticsService();
      const prediction = await analytics.predictBudgetHealth(projectId, userOrgId);

      return {
        success: true,
        data: prediction
      };
    } catch (error: any) {
      console.error('Error in predictBudgetHealth:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error.message || 'Failed to predict budget health'
      );
    }
  }
);

/**
 * Forecast spending
 * Tenant isolation: Validates project belongs to user's organization
 */
export const forecastSpending = onCall(
  {
    region: 'us-central1',
    cpu: 0.5,
    memory: '512MiB',
  },
  async (request) => {
    try {
      // 1. Get authenticated user's organizationId (from auth, not request)
      const { organizationId: userOrgId } = await getAuthenticatedUserOrg(request);

      // 2. Get projectId from request
      const { projectId, days = 30 } = request.data;

      if (!projectId) {
        throw new HttpsError('invalid-argument', 'projectId is required');
      }

      // 3. Validate project belongs to user's organization
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      const projectDoc = await db.collection('projects').doc(projectId).get();

      if (!projectDoc.exists) {
        throw new HttpsError('not-found', 'Project not found');
      }

      const projectData = projectDoc.data();
      if (projectData?.organizationId !== userOrgId) {
        throw new HttpsError(
          'permission-denied',
          'Project does not belong to your organization'
        );
      }

      // 4. Get forecast
      const analytics = getPredictiveAnalyticsService();
      const forecast = await analytics.forecastSpending(projectId, days, userOrgId);

      return {
        success: true,
        data: forecast
      };
    } catch (error: any) {
      console.error('Error in forecastSpending:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error.message || 'Failed to forecast spending'
      );
    }
  }
);

/**
 * Predict resource availability
 * Tenant isolation: Validates resource belongs to user's organization
 */
export const predictAvailability = onCall(
  {
    region: 'us-central1',
    cpu: 0.5,
    memory: '512MiB',
  },
  async (request) => {
    try {
      // 1. Get authenticated user's organizationId (from auth, not request)
      const { organizationId: userOrgId } = await getAuthenticatedUserOrg(request);

      // 2. Get resourceId from request
      const { resourceId, startDate, endDate } = request.data;

      if (!resourceId || !startDate || !endDate) {
        throw new HttpsError(
          'invalid-argument',
          'resourceId, startDate, and endDate are required'
        );
      }

      // 3. Validate resource belongs to user's organization
      // Resource could be in teamMembers, inventoryItems, or other collections
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      // Try teamMembers first
      let resourceDoc = await db.collection('teamMembers').doc(resourceId).get();
      let resourceCollection = 'teamMembers';

      // If not found, try inventoryItems
      if (!resourceDoc.exists) {
        resourceDoc = await db.collection('inventoryItems').doc(resourceId).get();
        resourceCollection = 'inventoryItems';
      }

      if (!resourceDoc.exists) {
        throw new HttpsError('not-found', 'Resource not found');
      }

      const resourceData = resourceDoc.data();
      if (resourceData?.organizationId !== userOrgId) {
        throw new HttpsError(
          'permission-denied',
          'Resource does not belong to your organization'
        );
      }

      // 4. Get prediction
      const analytics = getPredictiveAnalyticsService();
      const prediction = await analytics.predictAvailability(resourceId, {
        start: new Date(startDate),
        end: new Date(endDate)
      }, userOrgId);

      return {
        success: true,
        data: prediction
      };
    } catch (error: any) {
      console.error('Error in predictAvailability:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error.message || 'Failed to predict availability'
      );
    }
  }
);

/**
 * Batch index a collection for user's organization
 * Tenant isolation: Only indexes documents belonging to user's organization
 */
export const batchIndexCollection = onCall(
  {
    secrets: [geminiApiKey],
    region: 'us-central1',
    timeoutSeconds: 540, // 9 minutes max
    cpu: 0.5,  // Reduced from 1.0 to work around CPU quota
    memory: '512MiB'
  },
  async (request) => {
    try {
      // 1. Get authenticated user's organizationId (from auth, not request)
      const { organizationId: userOrgId, userId } = await getAuthenticatedUserOrg(request);

      // 2. IGNORE organizationId from request - use user's org
      const { collection, options = {} } = request.data;

      if (!collection) {
        throw new HttpsError('invalid-argument', 'collection is required');
      }

      // 3. Index only user's organization data
      const indexingService = getDataIndexingService(geminiApiKey.value());
      const job = await indexingService.indexCollection(
        collection,
        userOrgId, // Use authenticated user's org
        {
          ...options
        },
        userId // Pass userId as createdBy
      );

      return {
        success: true,
        data: job
      };
    } catch (error: any) {
      console.error('Error in batchIndexCollection:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error.message || 'Failed to index collection'
      );
    }
  }
);

/**
 * Get indexing status for user's organization
 * Tenant isolation: Only returns status for user's organization
 */
export const getIndexingStatus = onCall(
  {
    region: 'us-central1',
    cpu: 0.5,
    memory: '512MiB',
  },
  async (request) => {
    try {
      // 1. Get authenticated user's organizationId (from auth, not request)
      const { organizationId: userOrgId } = await getAuthenticatedUserOrg(request);

      // 2. IGNORE organizationId from request - use user's org
      const { collection } = request.data;

      if (!collection) {
        throw new HttpsError('invalid-argument', 'collection is required');
      }

      // 3. Get status for user's organization only
      const indexingService = getDataIndexingService();
      const job = await indexingService.getIndexingProgress(collection, userOrgId);

      return {
        success: true,
        data: job
      };
    } catch (error: any) {
      console.error('Error in getIndexingStatus:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'internal',
        error.message || 'Failed to get indexing status'
      );
    }
  }
);

