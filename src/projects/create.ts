import { onRequest, onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { Project } from '../shared/types';

// Shared business logic function
async function createProjectLogic(data: any, context?: any): Promise<any> {
  try {
    // Check if user is authenticated (for callable functions)
    const authUid = context?.auth?.uid;
    if (authUid) {
      // This is a callable function call
      const {
        name,
        description,
        organizationId,
        applicationMode = 'standalone',
        storageBackend = 'firestore',
        allowCollaboration = false,
        maxCollaborators = 5,
        realTimeEnabled = false
      } = data;

      if (!name || !organizationId) {
        return createErrorResponse('Missing required fields: name and organizationId are required');
      }

      const projectData: Project = {
        name,
        description: description || '',
        organizationId,
        createdBy: authUid,
        applicationMode,
        storageBackend,
        allowCollaboration,
        maxCollaborators,
        realTimeEnabled,
        status: 'active',
        isActive: true,
        isArchived: false,
        createdAt: admin.firestore.Timestamp.now(),
        lastAccessedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
      };

      const projectRef = await admin.firestore().collection('projects').add(projectData);

      console.log(`✅ [CREATE PROJECT] Created project: ${projectRef.id}`);

      return createSuccessResponse({
        projectId: projectRef.id,
        ...projectData
      }, 'Project created successfully');
    } else {
      // This is an HTTP function call (via interceptor)
      const {
        name,
        description,
        organizationId,
        createdBy,
        applicationMode = 'standalone',
        storageBackend = 'firestore',
        allowCollaboration = false,
        maxCollaborators = 5,
        realTimeEnabled = false
      } = data;

      if (!name || !organizationId || !createdBy) {
        return createErrorResponse('Missing required fields', 'name, organizationId, and createdBy are required');
      }

      const projectData: Project = {
        name,
        description: description || '',
        organizationId,
        createdBy,
        applicationMode,
        storageBackend,
        allowCollaboration,
        maxCollaborators,
        realTimeEnabled,
        status: 'active',
        isActive: true,
        isArchived: false,
        createdAt: admin.firestore.Timestamp.now(),
        lastAccessedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
      };

      const projectRef = await admin.firestore().collection('projects').add(projectData);

      console.log(`✅ [CREATE PROJECT] Created project: ${projectRef.id}`);

      return createSuccessResponse({
        projectId: projectRef.id,
        ...projectData
      }, 'Project created successfully');
    }
  } catch (error: any) {
    console.error('❌ [CREATE PROJECT] Error:', error);
    return handleError(error, 'createProject');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const createProject = onRequest({ memory: '512MiB' }, async (req: any, res: any) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version');
    res.set('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const result = await createProjectLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [CREATE PROJECT HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to create project', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const createProjectCallable = onCall(defaultCallableOptions, async (request) => {
  return await createProjectLogic(request.data, { auth: request.auth });
});