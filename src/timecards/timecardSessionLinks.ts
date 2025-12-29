/**
 * Timecard Session Link Functions
 * 
 * Manages links between sessions and timecards
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function - Create session link
export const createTimecardSessionLink = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { sessionId, timecardId, organizationId } = request.data;
      const userId = request.auth.uid;

      if (!sessionId) {
        throw new HttpsError('invalid-argument', 'Session ID is required');
      }

      if (!timecardId) {
        throw new HttpsError('invalid-argument', 'Timecard ID is required');
      }

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // 🔒 SECURITY CHECK: Verify user belongs to the organization
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(userId, organizationId));
      if (!hasAccess) {
        const token = request.auth.token;
        const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;
        if (!isAdmin) {
          console.warn(`🚨 [CREATE TIMECARD SESSION LINK] Security violation: User ${userId} attempted to create link for org ${organizationId} without access`);
          throw new HttpsError('permission-denied', 'You do not have access to this organization');
        }
      }

      console.log(`⏰ [CREATE TIMECARD SESSION LINK] Creating link: ${sessionId} -> ${timecardId} for org: ${organizationId}`);

      // Verify timecard exists and belongs to organization
      const timecardDoc = await db.collection('timecards').doc(timecardId).get();
      if (!timecardDoc.exists) {
        throw new HttpsError('not-found', 'Timecard not found');
      }

      const timecardData = timecardDoc.data();
      if (!timecardData || timecardData.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'Timecard does not belong to this organization');
      }

      // Check if link already exists (try both collection names for compatibility)
      let existingLinkQuery = await db.collection('timecardSessionLinks')
        .where('sessionId', '==', sessionId)
        .where('timecardId', '==', timecardId)
        .limit(1)
        .get();
      
      // Fallback to alternative collection name
      if (existingLinkQuery.empty) {
        existingLinkQuery = await db.collection('session_timecard_links')
          .where('sessionId', '==', sessionId)
          .where('timecardId', '==', timecardId)
          .limit(1)
          .get();
      }

      if (!existingLinkQuery.empty) {
        const existingLink = existingLinkQuery.docs[0];
        return createSuccessResponse({
          link: {
            id: existingLink.id,
            ...existingLink.data()
          },
          alreadyExists: true
        }, 'Session link already exists');
      }

      // Create the link
      const linkData = {
        sessionId,
        timecardId,
        userId: timecardData.userId || userId,
        organizationId,
        role: 'crew_member',
        hoursWorked: timecardData.totalHours || 0,
        createdAt: new Date(),
        createdBy: userId,
        isActive: true
      };

      // Use primary collection name
      const linkRef = await db.collection('timecardSessionLinks').add(linkData);

      console.log(`⏰ [CREATE TIMECARD SESSION LINK] Link created: ${linkRef.id}`);

      return createSuccessResponse({
        link: {
          id: linkRef.id,
          ...linkData
        }
      }, 'Session link created successfully');

    } catch (error: any) {
      console.error('❌ [CREATE TIMECARD SESSION LINK] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Failed to create session link',
        error.stack || error.toString()
      );
    }
  }
);

// Firebase Callable function - Remove session link
export const removeTimecardSessionLink = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { sessionId, timecardId, organizationId } = request.data;
      const userId = request.auth.uid;

      if (!sessionId) {
        throw new HttpsError('invalid-argument', 'Session ID is required');
      }

      if (!timecardId) {
        throw new HttpsError('invalid-argument', 'Timecard ID is required');
      }

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // 🔒 SECURITY CHECK: Verify user belongs to the organization
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(userId, organizationId));
      if (!hasAccess) {
        const token = request.auth.token;
        const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;
        if (!isAdmin) {
          console.warn(`🚨 [REMOVE TIMECARD SESSION LINK] Security violation: User ${userId} attempted to remove link for org ${organizationId} without access`);
          throw new HttpsError('permission-denied', 'You do not have access to this organization');
        }
      }

      console.log(`⏰ [REMOVE TIMECARD SESSION LINK] Removing link: ${sessionId} -> ${timecardId} for org: ${organizationId}`);

      // Find the link (try both collection names for compatibility)
      let linkQuery = await db.collection('timecardSessionLinks')
        .where('sessionId', '==', sessionId)
        .where('timecardId', '==', timecardId)
        .where('organizationId', '==', organizationId)
        .limit(1)
        .get();
      
      // Fallback to alternative collection name
      if (linkQuery.empty) {
        linkQuery = await db.collection('session_timecard_links')
          .where('sessionId', '==', sessionId)
          .where('timecardId', '==', timecardId)
          .limit(1)
          .get();
      }

      if (linkQuery.empty) {
        throw new HttpsError('not-found', 'Session link not found');
      }

      const linkDoc = linkQuery.docs[0];

      // Soft delete: Set isActive to false (use same collection as found)
      const collectionName = linkQuery.docs[0].ref.parent.id;
      await db.collection(collectionName).doc(linkDoc.id).update({
        isActive: false,
        deletedAt: new Date(),
        deletedBy: userId
      });

      console.log(`⏰ [REMOVE TIMECARD SESSION LINK] Link removed: ${linkDoc.id}`);

      return createSuccessResponse({
        linkId: linkDoc.id,
        removed: true
      }, 'Session link removed successfully');

    } catch (error: any) {
      console.error('❌ [REMOVE TIMECARD SESSION LINK] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Failed to remove session link',
        error.stack || error.toString()
      );
    }
  }
);

// HTTP function - Create session link
export const createTimecardSessionLinkHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { sessionId, timecardId, organizationId, userId } = req.body;

      if (!sessionId || !timecardId || !organizationId || !userId) {
        res.status(400).json(createErrorResponse('Session ID, timecard ID, organization ID, and user ID are required'));
        return;
      }

      console.log(`⏰ [CREATE TIMECARD SESSION LINK HTTP] Creating link: ${sessionId} -> ${timecardId}`);

      // Verify timecard exists
      const timecardDoc = await db.collection('timecards').doc(timecardId).get();
      if (!timecardDoc.exists) {
        res.status(404).json(createErrorResponse('Timecard not found'));
        return;
      }

      const timecardData = timecardDoc.data();
      if (!timecardData || timecardData.organizationId !== organizationId) {
        res.status(403).json(createErrorResponse('Timecard does not belong to this organization'));
        return;
      }

      // Check if link already exists (try both collection names for compatibility)
      let existingLinkQuery = await db.collection('timecardSessionLinks')
        .where('sessionId', '==', sessionId)
        .where('timecardId', '==', timecardId)
        .limit(1)
        .get();
      
      // Fallback to alternative collection name
      if (existingLinkQuery.empty) {
        existingLinkQuery = await db.collection('session_timecard_links')
          .where('sessionId', '==', sessionId)
          .where('timecardId', '==', timecardId)
          .limit(1)
          .get();
      }

      if (!existingLinkQuery.empty) {
        const existingLink = existingLinkQuery.docs[0];
        res.status(200).json(createSuccessResponse({
          link: {
            id: existingLink.id,
            ...existingLink.data()
          },
          alreadyExists: true
        }, 'Session link already exists'));
        return;
      }

      // Create the link
      const linkData = {
        sessionId,
        timecardId,
        userId: timecardData.userId || userId,
        organizationId,
        role: 'crew_member',
        hoursWorked: timecardData.totalHours || 0,
        createdAt: new Date(),
        createdBy: userId,
        isActive: true
      };

      // Use primary collection name
      const linkRef = await db.collection('timecardSessionLinks').add(linkData);

      res.status(201).json(createSuccessResponse({
        link: {
          id: linkRef.id,
          ...linkData
        }
      }, 'Session link created successfully'));

    } catch (error: any) {
      console.error('❌ [CREATE TIMECARD SESSION LINK HTTP] Error:', error);
      res.status(500).json(handleError(error, 'createTimecardSessionLinkHttp'));
    }
  }
);

// HTTP function - Remove session link
export const removeTimecardSessionLinkHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { sessionId, timecardId, organizationId, userId } = req.body;

      if (!sessionId || !timecardId || !organizationId) {
        res.status(400).json(createErrorResponse('Session ID, timecard ID, and organization ID are required'));
        return;
      }

      console.log(`⏰ [REMOVE TIMECARD SESSION LINK HTTP] Removing link: ${sessionId} -> ${timecardId}`);

      // Find the link (try both collection names for compatibility)
      let linkQuery = await db.collection('timecardSessionLinks')
        .where('sessionId', '==', sessionId)
        .where('timecardId', '==', timecardId)
        .where('organizationId', '==', organizationId)
        .limit(1)
        .get();
      
      // Fallback to alternative collection name
      if (linkQuery.empty) {
        linkQuery = await db.collection('session_timecard_links')
          .where('sessionId', '==', sessionId)
          .where('timecardId', '==', timecardId)
          .limit(1)
          .get();
      }

      if (linkQuery.empty) {
        res.status(404).json(createErrorResponse('Session link not found'));
        return;
      }

      const linkDoc = linkQuery.docs[0];

      // Soft delete
      await db.collection('timecardSessionLinks').doc(linkDoc.id).update({
        isActive: false,
        deletedAt: new Date(),
        deletedBy: userId || 'system'
      });

      res.status(200).json(createSuccessResponse({
        linkId: linkDoc.id,
        removed: true
      }, 'Session link removed successfully'));

    } catch (error: any) {
      console.error('❌ [REMOVE TIMECARD SESSION LINK HTTP] Error:', error);
      res.status(500).json(handleError(error, 'removeTimecardSessionLinkHttp'));
    }
  }
);
