/**
 * Security Alerts Function
 * 
 * Handles security alerts and notifications
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';
import type { Request, Response } from 'express';

const db = getFirestore();
const auth = getAuth();

export const securityAlerts = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req: any, res: any): Promise<void> => {
    try {
      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Authentication required'));
        return;
      }

      const token = authHeader.split(' ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      
      // Check if user has appropriate privileges
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();
      
      if (!userData || !userData.role || !['SUPERADMIN', 'DEV_ADMIN', 'ORG_ADMIN'].includes(userData.role)) {
        res.status(403).json(createErrorResponse('Security access required'));
        return;
      }

      console.log(`🔒 [SECURITY ALERTS] Request from user: ${decodedToken.email}`);

      if (req.method === 'GET') {
        const { source, organizationId } = req.query;

        // Build query based on user role and filters
        let alertsQuery = db.collection('securityAlerts');

        // Apply source filter if provided (support both dashboard_app and licensing_website)
        if (source) {
          // Map frontend source names to backend source names
          const sourceMapping: Record<string, string> = {
            'dashboard_app': 'dashboard',
            'licensing_website': 'licensing'
          };
          const mappedSource = sourceMapping[source as string] || source;
          alertsQuery = alertsQuery.where('source', '==', mappedSource) as any;
        }

        // Apply organization filter for ORG_ADMIN
        if (userData.role === 'ORG_ADMIN' && userData.organizationId) {
          alertsQuery = alertsQuery.where('organizationId', '==', userData.organizationId) as any;
        } else if (organizationId && ['SUPERADMIN', 'DEV_ADMIN'].includes(userData.role)) {
          alertsQuery = alertsQuery.where('organizationId', '==', organizationId) as any;
        }

        // Order by severity and creation date
        alertsQuery = alertsQuery.orderBy('severity', 'desc').orderBy('createdAt', 'desc') as any;

        const alertsSnapshot = await alertsQuery.limit(100).get();

        const alerts = alertsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
          resolvedAt: doc.data().resolvedAt?.toDate?.() || doc.data().resolvedAt
        }));

        // Filter out resolved alerts unless specifically requested
        const includeResolved = req.query.includeResolved === 'true';
        const filteredAlerts = includeResolved ? alerts : alerts.filter(alert => !(alert as any).resolved);

        res.status(200).json(createSuccessResponse(filteredAlerts, 'Security alerts retrieved successfully'));

      } else if (req.method === 'POST') {
        // Create new security alert
        const { type, severity, message, source, organizationId, metadata } = req.body;

        if (!type || !severity || !message || !source) {
          res.status(400).json(createErrorResponse('Type, severity, message, and source are required'));
          return;
        }

        const alertData = {
          type,
          severity,
          message,
          source,
          organizationId: organizationId || userData.organizationId || null,
          metadata: metadata || {},
          resolved: false,
          createdAt: new Date(),
          createdBy: decodedToken.uid,
          resolvedAt: null,
          resolvedBy: null
        };

        const alertRef = await db.collection('securityAlerts').add(alertData);

        res.status(201).json(createSuccessResponse({
          id: alertRef.id,
          ...alertData
        }, 'Security alert created successfully'));

      } else if (req.method === 'PUT') {
        // Update security alert (e.g., mark as resolved)
        const { alertId, resolved, resolutionNotes } = req.body;

        if (!alertId) {
          res.status(400).json(createErrorResponse('Alert ID is required'));
          return;
        }

        const updateData: any = {
          updatedAt: new Date(),
          updatedBy: decodedToken.uid
        };

        if (resolved !== undefined) {
          updateData.resolved = resolved;
          if (resolved) {
            updateData.resolvedAt = new Date();
            updateData.resolvedBy = decodedToken.uid;
            if (resolutionNotes) {
              updateData.resolutionNotes = resolutionNotes;
            }
          } else {
            updateData.resolvedAt = null;
            updateData.resolvedBy = null;
            updateData.resolutionNotes = null;
          }
        }

        await db.collection('securityAlerts').doc(alertId).update(updateData);

        res.status(200).json(createSuccessResponse({}, 'Security alert updated successfully'));

      } else if (req.method === 'DELETE') {
        // Delete security alert
        const { alertId } = req.body;

        if (!alertId) {
          res.status(400).json(createErrorResponse('Alert ID is required'));
          return;
        }

        await db.collection('securityAlerts').doc(alertId).delete();

        res.status(200).json(createSuccessResponse({}, 'Security alert deleted successfully'));

      } else {
        res.status(405).json(createErrorResponse('Method not allowed'));
      }

    } catch (error) {
      console.error('❌ [SECURITY ALERTS] Error:', error);
      res.status(500).json(createErrorResponse('Internal server error', error instanceof Error ? error.message : 'Unknown error'));
    }
  }
);
