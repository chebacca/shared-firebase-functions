/**
 * Get My Timecard Submissions Function
 * 
 * Retrieves timecard submissions for the current user
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getMySubmissions = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new Error('User must be authenticated');
      }

      const userId = request.auth.uid;
      const { startDate, endDate } = request.data || {};

      console.log(`⏰ [GET MY SUBMISSIONS] Getting submissions for user: ${userId}`);

      // Get user's organizationId from users collection
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = userDoc.data();
      const organizationId = userData?.organizationId;

      if (!organizationId) {
        throw new Error('User organization not found');
      }

      // Query timecard_entries for this user
      // Note: Can't use orderBy with 'in' query, so we'll query and sort in memory
      let query = db.collection('timecard_entries')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', userId)
        .where('status', 'in', ['SUBMITTED', 'PENDING', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'submitted', 'pending', 'approved', 'rejected']);

      // Apply date filters if provided
      if (startDate) {
        query = query.where('date', '>=', new Date(startDate));
      }
      if (endDate) {
        query = query.where('date', '<=', new Date(endDate));
      }

      const snapshot = await query.get();

      // Transform entries to TimecardApprovalFlow format
      const submissions = snapshot.docs.map(doc => {
        const data = doc.data();
        const entryDate = data.date?.toDate ? data.date.toDate() : (data.date instanceof Date ? data.date : new Date(data.date));
        return {
          id: doc.id,
          timecardId: doc.id,
          timecard: {
            id: doc.id,
            date: data.date,
            totalHours: data.totalHours || 0,
            status: data.status,
            userId: data.userId,
            organizationId: data.organizationId,
            ...data
          },
          status: data.status || 'PENDING',
          submittedAt: data.submittedAt || data.createdAt,
          submittedBy: data.userId,
          currentApproverId: data.approverId || null,
          approvalHistory: [],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          _sortDate: entryDate.getTime() // For sorting
        };
      });

      // Sort by date descending (most recent first)
      submissions.sort((a, b) => (b._sortDate || 0) - (a._sortDate || 0));
      
      // Remove temporary sort field
      submissions.forEach(s => delete (s as any)._sortDate);

      console.log(`⏰ [GET MY SUBMISSIONS] Found ${submissions.length} submissions for user ${userId}`);

      return createSuccessResponse({
        data: submissions,
        count: submissions.length
      }, 'My submissions retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET MY SUBMISSIONS] Error:', error);
      return handleError(error, 'getMySubmissions');
    }
  }
);

// HTTP function
export const getMySubmissionsHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      // Set CORS headers
      setCorsHeaders(req, res);
      
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { organizationId, userId, projectId, status, startDate, endDate } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      if (!userId) {
        res.status(400).json(createErrorResponse('User ID is required'));
        return;
      }

      console.log(`⏰ [GET MY SUBMISSIONS HTTP] Getting submissions for user: ${userId} in org: ${organizationId}`);

      let query = db.collection('timecards')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', userId);

      // Apply additional filters
      if (projectId) {
        query = query.where('projectId', '==', projectId);
      }

      if (status) {
        query = query.where('status', '==', status);
      }

      if (startDate) {
        query = query.where('date', '>=', startDate);
      }

      if (endDate) {
        query = query.where('date', '<=', endDate);
      }

      query = query.orderBy('date', 'desc');

      const timecardsSnapshot = await query.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET MY SUBMISSIONS HTTP] Found ${timecards.length} submissions`);

      res.status(200).json(createSuccessResponse({
        timecards,
        count: timecards.length,
        organizationId,
        userId,
        filters: { projectId, status, startDate, endDate }
      }, 'My submissions retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET MY SUBMISSIONS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getMySubmissionsHttp'));
    }
  }
);
