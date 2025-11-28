/**
 * Network IP Firebase Function
 * 
 * Handles network IP assignment operations
 */

import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK
if (!initializeApp.length) {
  initializeApp();
}

const db = getFirestore();
const auth = getAuth();

/**
 * Get all network IP assignments for the user's organization
 */
export const getNetworkIPAssignments = onRequest(
  {
    cors: true,
    region: 'us-central1'
  },
  async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const origin = req.headers.origin;
      const allowedOrigins = [
        'https://backbone-logic.web.app',
        'https://backbone-client.web.app',
        'https://dashboard-1c3a5.web.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4003',
        'http://localhost:4010',
        'http://localhost:5173'
      ];
      
      if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
        res.set('Access-Control-Allow-Origin', origin);
      } else {
        res.set('Access-Control-Allow-Origin', '*');
      }
      
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.set('Access-Control-Max-Age', '3600');
      res.status(200).send('');
      return;
    }
    
    // Set CORS headers for actual request
    const origin = req.headers.origin;
    const allowedOrigins = [
      'https://backbone-logic.web.app',
      'https://backbone-client.web.app',
      'https://dashboard-1c3a5.web.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4003',
      'http://localhost:4010',
      'http://localhost:5173'
    ];
    
    if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
      res.set('Access-Control-Allow-Origin', origin);
    } else {
      res.set('Access-Control-Allow-Origin', '*');
    }
    res.set('Access-Control-Allow-Credentials', 'true');
    
  try {
    console.log('🌐 [NETWORK IP API] Fetching all network IP assignments...');
    
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
      return;
    }

    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;
    
    // Get user's organization ID
    let userData: any = null;
    const userDocByUid = await db.collection('users').doc(userId).get();
    if (userDocByUid.exists) {
      userData = userDocByUid.data();
    } else if (userEmail) {
      const userDocByEmail = await db.collection('users').doc(userEmail).get();
      if (userDocByEmail.exists) {
        userData = userDocByEmail.data();
      } else {
        const tmQuery = await db.collection('teamMembers').where('email', '==', userEmail).limit(1).get();
        if (!tmQuery.empty) {
          userData = tmQuery.docs[0].data();
        }
      }
    }
    
    if (!userData) {
      res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
      return;
    }
    
    const organizationId = userData.organizationId;
    
    // Get network IP assignments for the organization
    let ipQuery: any = db.collection('networkIPAssignments');
    if (organizationId) {
      ipQuery = ipQuery.where('organizationId', '==', organizationId);
    }
    
    const ipSnapshot = await ipQuery.get();
    const ipAssignments = ipSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ [NETWORK IP API] Found ${ipAssignments.length} IP assignments`);
    res.status(200).json({
      success: true,
      data: ipAssignments,
      total: ipAssignments.length
    });
  } catch (error: any) {
    console.error('❌ [NETWORK IP API] Error fetching network IP assignments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch network IP assignments',
      errorDetails: error.message || String(error)
    });
  }
  }
);