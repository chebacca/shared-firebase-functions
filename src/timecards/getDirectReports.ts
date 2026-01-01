/**
 * Get Direct Reports Function
 * 
 * Retrieves direct reports for a manager in an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getDirectReports = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { organizationId: providedOrgId, managerId: providedManagerId } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      // Use provided managerId or authenticated user's ID
      const managerId = providedManagerId || userId;

      // Get organizationId from user's custom claims if not provided
      let organizationId = providedOrgId;
      if (!organizationId && userId) {
        try {
          const userRecord = await getAuth().getUser(userId);
          organizationId = userRecord.customClaims?.organizationId as string;
        } catch (error) {
          console.warn('[GET DIRECT REPORTS] Could not get organizationId from claims:', error);
        }
      }

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`⏰ [GET DIRECT REPORTS] Getting direct reports for manager: ${managerId} in org: ${organizationId}`);

      // 🔥 PRIMARY: Query userDirectReports collection (matching frontend implementation)
      let directReportsQuery = await db.collection('userDirectReports')
        .where('organizationId', '==', organizationId)
        .where('managerId', '==', managerId)
        .where('isActive', '==', true)
        .get();

      let directReports = [];
      
      // Process userDirectReports results
      for (const doc of directReportsQuery.docs) {
        const directReportData = doc.data();
        const employeeId = directReportData.employeeId;
        
        if (!employeeId) continue;
        
        // Get user details from users collection
        const userDoc = await db.collection('users').doc(employeeId).get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData) {
            directReports.push({
              id: doc.id,
              employeeId: employeeId,
              managerId: managerId,
              email: userData.email,
              displayName: userData.displayName || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
              firstName: userData.firstName,
              lastName: userData.lastName,
              role: userData.role,
              isActive: directReportData.isActive !== false,
              canApproveTimecards: directReportData.canApproveTimecards !== false,
              canApproveOvertime: directReportData.canApproveOvertime !== false,
              department: directReportData.department || userData.department,
              createdAt: directReportData.createdAt,
              effectiveDate: directReportData.effectiveDate || directReportData.createdAt
            });
          }
        }
      }

      // 🔥 FALLBACK: If no results in userDirectReports, try directReports collection
      if (directReports.length === 0) {
        console.log('⚠️ [GET DIRECT REPORTS] No results in userDirectReports, trying directReports fallback...');
        directReportsQuery = await db.collection('directReports')
          .where('organizationId', '==', organizationId)
          .where('managerId', '==', managerId)
          .where('isActive', '==', true)
          .get();

        for (const doc of directReportsQuery.docs) {
          const directReportData = doc.data();
          const employeeId = directReportData.employeeId;
          
          if (!employeeId) continue;
          
          // Get user details from users collection
          const userDoc = await db.collection('users').doc(employeeId).get();
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData) {
              directReports.push({
                id: doc.id,
                employeeId: employeeId,
                managerId: managerId,
                email: userData.email,
                displayName: userData.displayName || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
                firstName: userData.firstName,
                lastName: userData.lastName,
                role: userData.role,
                isActive: directReportData.isActive !== false,
                canApproveTimecards: directReportData.canApproveTimecards !== false,
                canApproveOvertime: directReportData.canApproveOvertime !== false,
                department: directReportData.department || userData.department,
                createdAt: directReportData.createdAt,
                effectiveDate: directReportData.effectiveDate || directReportData.createdAt
              });
            }
          }
        }
      }

      console.log(`⏰ [GET DIRECT REPORTS] Found ${directReports.length} direct reports`);

      return createSuccessResponse({
        directReports,
        count: directReports.length,
        organizationId,
        managerId
      }, 'Direct reports retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET DIRECT REPORTS] Error:', error);
      return handleError(error, 'getDirectReports');
    }
  }
);

// HTTP function
export const getDirectReportsHttp = onRequest(
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

      const { organizationId, managerId } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      if (!managerId) {
        res.status(400).json(createErrorResponse('Manager ID is required'));
        return;
      }

      console.log(`⏰ [GET DIRECT REPORTS HTTP] Getting direct reports for manager: ${managerId} in org: ${organizationId}`);

      // 🔥 PRIMARY: Query userDirectReports collection (matching frontend implementation)
      let directReportsQuery = await db.collection('userDirectReports')
        .where('organizationId', '==', organizationId)
        .where('managerId', '==', managerId)
        .where('isActive', '==', true)
        .get();

      let directReports = [];
      
      // Process userDirectReports results
      for (const doc of directReportsQuery.docs) {
        const directReportData = doc.data();
        const employeeId = directReportData.employeeId;
        
        if (!employeeId) continue;
        
        // Get user details from users collection
        const userDoc = await db.collection('users').doc(employeeId).get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData) {
            directReports.push({
              id: doc.id,
              employeeId: employeeId,
              managerId: managerId,
              email: userData.email,
              displayName: userData.displayName || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
              firstName: userData.firstName,
              lastName: userData.lastName,
              role: userData.role,
              isActive: directReportData.isActive !== false,
              canApproveTimecards: directReportData.canApproveTimecards !== false,
              canApproveOvertime: directReportData.canApproveOvertime !== false,
              department: directReportData.department || userData.department,
              createdAt: directReportData.createdAt,
              effectiveDate: directReportData.effectiveDate || directReportData.createdAt
            });
          }
        }
      }

      // 🔥 FALLBACK: If no results in userDirectReports, try directReports collection
      if (directReports.length === 0) {
        console.log('⚠️ [GET DIRECT REPORTS HTTP] No results in userDirectReports, trying directReports fallback...');
        directReportsQuery = await db.collection('directReports')
          .where('organizationId', '==', organizationId)
          .where('managerId', '==', managerId)
          .where('isActive', '==', true)
          .get();

        for (const doc of directReportsQuery.docs) {
          const directReportData = doc.data();
          const employeeId = directReportData.employeeId;
          
          if (!employeeId) continue;
          
          // Get user details from users collection
          const userDoc = await db.collection('users').doc(employeeId).get();
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData) {
              directReports.push({
                id: doc.id,
                employeeId: employeeId,
                managerId: managerId,
                email: userData.email,
                displayName: userData.displayName || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
                firstName: userData.firstName,
                lastName: userData.lastName,
                role: userData.role,
                isActive: directReportData.isActive !== false,
                canApproveTimecards: directReportData.canApproveTimecards !== false,
                canApproveOvertime: directReportData.canApproveOvertime !== false,
                department: directReportData.department || userData.department,
                createdAt: directReportData.createdAt,
                effectiveDate: directReportData.effectiveDate || directReportData.createdAt
              });
            }
          }
        }
      }

      console.log(`⏰ [GET DIRECT REPORTS HTTP] Found ${directReports.length} direct reports`);

      res.status(200).json(createSuccessResponse({
        directReports,
        count: directReports.length,
        organizationId,
        managerId
      }, 'Direct reports retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET DIRECT REPORTS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getDirectReportsHttp'));
    }
  }
);
