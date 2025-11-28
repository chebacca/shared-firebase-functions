/**
 * Simple Settings Firebase Function
 * 
 * Handles user settings operations with minimal dependencies
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

/**
 * Get all user settings for the authenticated user
 */
exports.getUserSettings = onRequest(async (req, res) => {
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
    let userData = null;
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

    const settings = [];
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

  } catch (error) {
    console.error('❌ [SETTINGS API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update user settings
 */
exports.updateUserSettings = onRequest(async (req, res) => {
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

  } catch (error) {
    console.error('❌ [SETTINGS API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
