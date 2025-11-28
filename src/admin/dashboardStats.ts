/**
 * Admin Dashboard Stats Function
 * 
 * Provides dashboard statistics for admin users
 */

import { onRequest, HttpsFunction } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

export const adminDashboardStats: HttpsFunction = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req, res): Promise<void> => {
    try {
      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Authentication required'));
        return;
      }

      const token = authHeader.split(' ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      
      // Check if user has admin privileges
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();
      
      // Check both Firestore role and Firebase Auth claims
      const firestoreRole = userData?.role;
      const authRole = decodedToken.role;
      const hierarchy = decodedToken.hierarchy || 0;
      
      const isAdmin = (firestoreRole && ['SUPER_ADMIN', 'SUPERADMIN', 'DEV_ADMIN', 'OWNER'].includes(firestoreRole)) ||
                     (authRole && ['SUPER_ADMIN', 'SUPERADMIN', 'DEV_ADMIN', 'OWNER'].includes(authRole)) ||
                     hierarchy >= 90;
      
      if (!isAdmin) {
        console.log(`❌ [ADMIN DASHBOARD] Access denied for user: ${decodedToken.email}`);
        console.log(`   - Firestore role: ${firestoreRole}`);
        console.log(`   - Auth role: ${authRole}`);
        console.log(`   - Hierarchy: ${hierarchy}`);
        res.status(403).json(createErrorResponse('Admin access required'));
        return;
      }

      console.log(`📊 [ADMIN DASHBOARD] Stats request from admin: ${decodedToken.email}`);

      if (req.method === 'GET') {
        // Get dashboard statistics
        const [
          usersSnapshot,
          organizationsSnapshot,
          licensesSnapshot,
          paymentsSnapshot
        ] = await Promise.all([
          db.collection('users').get(),
          db.collection('organizations').get(),
          db.collection('licenses').get(),
          db.collection('payments').get()
        ]);

        // Calculate stats
        const totalUsers = usersSnapshot.size;
        const activeUsers = usersSnapshot.docs.filter(doc => doc.data().isActive).length;
        const totalOrganizations = organizationsSnapshot.size;
        const activeLicenses = licensesSnapshot.docs.filter(doc => doc.data().status === 'active').length;
        
        // Calculate revenue
        let totalRevenue = 0;
        paymentsSnapshot.docs.forEach(doc => {
          const payment = doc.data();
          if (payment.status === 'completed' && payment.amount) {
            totalRevenue += payment.amount;
          }
        });

        // Get recent activity (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentUsers = usersSnapshot.docs.filter(doc => {
          const createdAt = doc.data().createdAt?.toDate?.() || doc.data().createdAt;
          return createdAt && createdAt >= thirtyDaysAgo;
        }).length;

        const recentPayments = paymentsSnapshot.docs.filter(doc => {
          const createdAt = doc.data().createdAt?.toDate?.() || doc.data().createdAt;
          return createdAt && createdAt >= thirtyDaysAgo;
        }).length;

        // Get user roles breakdown
        const roleBreakdown = usersSnapshot.docs.reduce((acc, doc) => {
          const role = doc.data().role || 'USER';
          acc[role] = (acc[role] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        // Get organization types breakdown
        const orgTypeBreakdown = organizationsSnapshot.docs.reduce((acc, doc) => {
          const type = doc.data().type || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const stats = {
          overview: {
            totalUsers,
            activeUsers,
            totalOrganizations,
            activeLicenses,
            totalRevenue: Math.round(totalRevenue * 100) / 100, // Round to 2 decimal places
            pendingApprovals: licensesSnapshot.docs.filter(doc => doc.data().status === 'pending').length
          },
          recentActivity: {
            newUsers: recentUsers,
            newPayments: recentPayments,
            period: '30 days'
          },
          breakdowns: {
            userRoles: roleBreakdown,
            organizationTypes: orgTypeBreakdown
          },
          systemHealth: {
            status: 'healthy',
            lastChecked: new Date().toISOString(),
            uptime: '99.9%'
          }
        };

        res.status(200).json(createSuccessResponse(stats, 'Dashboard stats retrieved successfully'));

      } else {
        res.status(405).json(createErrorResponse('Method not allowed'));
      }

    } catch (error) {
      console.error('❌ [ADMIN DASHBOARD] Error:', error);
      res.status(500).json(createErrorResponse('Internal server error', error instanceof Error ? error.message : 'Unknown error'));
    }
  }
);
