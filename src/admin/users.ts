/**
 * Admin Users Function
 * 
 * Handles admin user management operations
 */

import { onRequest, HttpsFunction } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

export const adminUsers: HttpsFunction = onRequest(
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
        console.log(`❌ [ADMIN USERS] Access denied for user: ${decodedToken.email}`);
        console.log(`   - Firestore role: ${firestoreRole}`);
        console.log(`   - Auth role: ${authRole}`);
        console.log(`   - Hierarchy: ${hierarchy}`);
        res.status(403).json(createErrorResponse('Admin access required'));
        return;
      }

      console.log(`👤 [ADMIN USERS] Request from admin: ${decodedToken.email}`);

      if (req.method === 'GET') {
        // Get users with pagination
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = (page - 1) * limit;

        const usersSnapshot = await db.collection('users')
          .orderBy('createdAt', 'desc')
          .offset(offset)
          .limit(limit)
          .get();

        const users = usersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
          updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt,
          lastLoginAt: doc.data().lastLoginAt?.toDate?.() || doc.data().lastLoginAt
        }));

        const totalSnapshot = await db.collection('users').get();
        const total = totalSnapshot.size;

        res.status(200).json(createSuccessResponse({
          users,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }, 'Users retrieved successfully'));

      } else if (req.method === 'POST') {
        // Create new user
        const { email, displayName, role, organizationId } = req.body;

        if (!email || !displayName || !role) {
          res.status(400).json(createErrorResponse('Email, displayName, and role are required'));
          return;
        }

        // Create user in Firebase Auth
        const userRecord = await auth.createUser({
          email,
          displayName,
          emailVerified: true
        });

        // Create user document in Firestore
        const userData = {
          email,
          displayName,
          role,
          organizationId: organizationId || null,
          hierarchy: role === 'SUPERADMIN' ? 100 : role === 'DEV_ADMIN' ? 90 : 50,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          preferences: {}
        };

        await db.collection('users').doc(userRecord.uid).set(userData);

        // Set custom claims
        await auth.setCustomUserClaims(userRecord.uid, {
          role,
          hierarchy: userData.hierarchy,
          organizationId: organizationId || null,
          isAdmin: ['SUPERADMIN', 'DEV_ADMIN'].includes(role),
          permissions: role === 'SUPERADMIN' ? ['*'] : ['admin:organization', 'read:users'],
          lastUpdated: Date.now()
        });

        res.status(201).json(createSuccessResponse({
          uid: userRecord.uid,
          ...userData
        }, 'User created successfully'));

      } else if (req.method === 'PUT') {
        // Update user
        const { userId, ...updateData } = req.body;

        if (!userId) {
          res.status(400).json(createErrorResponse('User ID is required'));
          return;
        }

        // Update user document
        await db.collection('users').doc(userId).update({
          ...updateData,
          updatedAt: new Date()
        });

        // Update custom claims if role changed
        if (updateData.role) {
          await auth.setCustomUserClaims(userId, {
            role: updateData.role,
            hierarchy: updateData.role === 'SUPERADMIN' ? 100 : updateData.role === 'DEV_ADMIN' ? 90 : 50,
            isAdmin: ['SUPERADMIN', 'DEV_ADMIN'].includes(updateData.role),
            permissions: updateData.role === 'SUPERADMIN' ? ['*'] : ['admin:organization', 'read:users'],
            lastUpdated: Date.now()
          });
        }

        res.status(200).json(createSuccessResponse({}, 'User updated successfully'));

      } else if (req.method === 'DELETE') {
        // Delete user
        const { userId } = req.body;

        if (!userId) {
          res.status(400).json(createErrorResponse('User ID is required'));
          return;
        }

        // Delete from Firebase Auth
        await auth.deleteUser(userId);

        // Delete from Firestore
        await db.collection('users').doc(userId).delete();

        res.status(200).json(createSuccessResponse({}, 'User deleted successfully'));

      } else {
        res.status(405).json(createErrorResponse('Method not allowed'));
      }

    } catch (error) {
      console.error('❌ [ADMIN USERS] Error:', error);
      res.status(500).json(createErrorResponse('Internal server error', error instanceof Error ? error.message : 'Unknown error'));
    }
  }
);
