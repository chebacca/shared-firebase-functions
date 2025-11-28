/**
 * Settings Firebase Function
 * 
 * Handles user settings operations
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
 * Get all user settings for the authenticated user
 */
export const getUserSettings = onRequest(
  {
    cors: false, // Handle CORS manually to support credentials
    region: 'us-central1'
  },
  async (req, res): Promise<void> => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const origin = req.headers.origin;
      const allowedOrigins = [
        'https://backbone-logic.web.app',
        'https://backbone-client.web.app',
        'https://dashboard-1c3a5.web.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4002',
        'http://localhost:4003',
        'http://localhost:4010',
        'http://localhost:5173'
      ];
      
      // In development, allow all localhost origins
      if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
        if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
          res.set('Access-Control-Allow-Origin', origin);
          res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
          res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Application-Mode, X-Client-Type, X-Client-Version, Origin, Accept');
          res.set('Access-Control-Allow-Credentials', 'true');
          res.set('Access-Control-Max-Age', '3600');
          res.status(200).send('');
          return;
        }
      }
      
      // When credentials are required, we cannot use '*' - must specify exact origin
      if (origin && allowedOrigins.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Credentials', 'true');
      } else if (origin) {
        // Unknown origin - reject the request
        res.status(403).json({ error: 'CORS: Origin not allowed' });
        return;
      } else {
        // No origin header (e.g., Postman, mobile apps) - allow but without credentials
        res.set('Access-Control-Allow-Origin', '*');
        // Don't set credentials when using wildcard
      }
      
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Application-Mode, X-Client-Type, X-Client-Version, Origin, Accept');
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
      'http://localhost:4002',
      'http://localhost:4003',
      'http://localhost:4010',
      'http://localhost:5173'
    ];
    
    // In development, allow all localhost origins
    if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Credentials', 'true');
      }
    } else if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
    }
    
    try {
      console.log('⚙️ [SETTINGS API] Fetching user settings...');
      
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

      const organizationId = userData.organizationId || 'standalone';
      
      // Get user settings from settings collection
      const settingsQuery = await db.collection('settings')
        .where('userId', '==', userId)
        .where('organizationId', '==', organizationId)
        .get();

      const settings: any[] = [];
      settingsQuery.forEach(doc => {
        settings.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`✅ [SETTINGS API] Found ${settings.length} settings for user ${userEmail}`);

      res.status(200).json({
        success: true,
        data: {
          settings,
          user: {
            id: userId,
            email: userEmail,
            organizationId,
            role: userData.role || 'member'
          }
        }
      });
      return;

    } catch (error) {
      console.error('❌ [SETTINGS API] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        errorDetails: error instanceof Error ? error.message : 'Unknown error'
      });
      return;
    }
  }
);

/**
 * Update user settings
 */
export const updateUserSettings = onRequest(
  {
    cors: false, // Handle CORS manually to support credentials
    region: 'us-central1'
  },
  async (req, res): Promise<void> => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const origin = req.headers.origin;
      const allowedOrigins = [
        'https://backbone-logic.web.app',
        'https://backbone-client.web.app',
        'https://dashboard-1c3a5.web.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4002',
        'http://localhost:4003',
        'http://localhost:4010',
        'http://localhost:5173'
      ];
      
      // In development, allow all localhost origins
      if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
        if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
          res.set('Access-Control-Allow-Origin', origin);
          res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
          res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Application-Mode, X-Client-Type, X-Client-Version, Origin, Accept');
          res.set('Access-Control-Allow-Credentials', 'true');
          res.set('Access-Control-Max-Age', '3600');
          res.status(200).send('');
          return;
        }
      }
      
      // When credentials are required, we cannot use '*' - must specify exact origin
      if (origin && allowedOrigins.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Credentials', 'true');
      } else if (origin) {
        // Unknown origin - reject the request
        res.status(403).json({ error: 'CORS: Origin not allowed' });
        return;
      } else {
        // No origin header (e.g., Postman, mobile apps) - allow but without credentials
        res.set('Access-Control-Allow-Origin', '*');
        // Don't set credentials when using wildcard
      }
      
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Application-Mode, X-Client-Type, X-Client-Version, Origin, Accept');
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
      'http://localhost:4002',
      'http://localhost:4003',
      'http://localhost:4010',
      'http://localhost:5173'
    ];
    
    // In development, allow all localhost origins
    if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Credentials', 'true');
      }
    } else if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
    }
    
    try {
      console.log('⚙️ [SETTINGS API] Updating user settings...');
      
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
      const { settings } = req.body;

      if (!settings) {
        res.status(400).json({
          success: false,
          error: 'Settings data is required'
        });
        return;
      }

      // Update settings in Firestore
      const settingsRef = db.collection('settings').doc(userId);
      await settingsRef.set({
        ...settings,
        userId,
        updatedAt: new Date(),
        updatedBy: userId
      }, { merge: true });

      console.log(`✅ [SETTINGS API] Updated settings for user ${userId}`);

      res.status(200).json({
        success: true,
        data: {
          message: 'Settings updated successfully'
        }
      });
      return;

    } catch (error) {
      console.error('❌ [SETTINGS API] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        errorDetails: error instanceof Error ? error.message : 'Unknown error'
      });
      return;
    }
  }
);
