/**
 * Networks Firebase Function
 * 
 * Handles network operations (network definitions/groupings)
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
 * Get all networks for the user's organization
 */
export const getNetworks = onRequest(async (req, res) => {
  try {
    console.log('🌐 [NETWORKS API] Fetching all networks...');
    
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
    
    // Get networks for the organization
    let networksQuery: any = db.collection('networks');
    if (organizationId) {
      networksQuery = networksQuery.where('organizationId', '==', organizationId);
    }
    
    const networksSnapshot = await networksQuery.get();
    const networks = networksSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ [NETWORKS API] Found ${networks.length} networks`);
    res.status(200).json({
      success: true,
      data: networks,
      total: networks.length
    });
  } catch (error: any) {
    console.error('❌ [NETWORKS API] Error fetching networks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch networks',
      errorDetails: error.message || String(error)
    });
  }
});

/**
 * Get a single network by ID
 */
export const getNetwork = onRequest(async (req, res) => {
  try {
    const networkId = req.params.id;
    console.log(`🌐 [NETWORKS API] Fetching network: ${networkId}`);
    
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
    
    // Get the specific network
    const networkDoc = await db.collection('networks').doc(networkId).get();
    
    if (!networkDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Network not found'
      });
      return;
    }
    
    const networkData = networkDoc.data();
    
    // Verify organization access
    if (organizationId && networkData?.organizationId !== organizationId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this network'
      });
      return;
    }
    
    console.log(`✅ [NETWORKS API] Found network: ${networkId}`);
    res.status(200).json({
      success: true,
      data: {
        id: networkDoc.id,
        ...networkData
      }
    });
  } catch (error: any) {
    console.error(`❌ [NETWORKS API] Error fetching network ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch network',
      errorDetails: error.message || String(error)
    });
  }
});

/**
 * Create a new network
 */
export const createNetwork = onRequest(async (req, res) => {
  try {
    console.log('🌐 [NETWORKS API] Creating new network...');
    
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
    
    // Validate required fields
    const { name, description, category, isActive = true } = req.body;
    
    if (!name) {
      res.status(400).json({
        success: false,
        error: 'Network name is required'
      });
      return;
    }
    
    // Create network document
    const networkData = {
      name,
      description: description || '',
      category: category || 'general',
      isActive: Boolean(isActive),
      organizationId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: userId
    };
    
    const networkRef = await db.collection('networks').add(networkData);
    
    console.log(`✅ [NETWORKS API] Created network: ${networkRef.id}`);
    res.status(201).json({
      success: true,
      data: {
        id: networkRef.id,
        ...networkData
      }
    });
  } catch (error: any) {
    console.error('❌ [NETWORKS API] Error creating network:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create network',
      errorDetails: error.message || String(error)
    });
  }
});

/**
 * Update an existing network
 */
export const updateNetwork = onRequest(async (req, res) => {
  try {
    const networkId = req.params.id;
    console.log(`🌐 [NETWORKS API] Updating network: ${networkId}`);
    
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
    
    // Check if network exists and user has access
    const networkDoc = await db.collection('networks').doc(networkId).get();
    
    if (!networkDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Network not found'
      });
      return;
    }
    
    const existingData = networkDoc.data();
    
    // Verify organization access
    if (organizationId && existingData?.organizationId !== organizationId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this network'
      });
      return;
    }
    
    // Prepare update data
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString(),
      updatedBy: userId
    };
    
    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.createdBy;
    delete updateData.organizationId;
    
    // Update the network
    await db.collection('networks').doc(networkId).update(updateData);
    
    // Get updated data
    const updatedDoc = await db.collection('networks').doc(networkId).get();
    const updatedData = updatedDoc.data();
    
    console.log(`✅ [NETWORKS API] Updated network: ${networkId}`);
    res.status(200).json({
      success: true,
      data: {
        id: networkId,
        ...updatedData
      }
    });
  } catch (error: any) {
    console.error(`❌ [NETWORKS API] Error updating network ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update network',
      errorDetails: error.message || String(error)
    });
  }
});

/**
 * Delete a network
 */
export const deleteNetwork = onRequest(async (req, res) => {
  try {
    const networkId = req.params.id;
    console.log(`🌐 [NETWORKS API] Deleting network: ${networkId}`);
    
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
    
    // Check if network exists and user has access
    const networkDoc = await db.collection('networks').doc(networkId).get();
    
    if (!networkDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Network not found'
      });
      return;
    }
    
    const networkData = networkDoc.data();
    
    // Verify organization access
    if (organizationId && networkData?.organizationId !== organizationId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this network'
      });
      return;
    }
    
    // Delete the network
    await db.collection('networks').doc(networkId).delete();
    
    console.log(`✅ [NETWORKS API] Deleted network: ${networkId}`);
    res.status(200).json({
      success: true,
      message: 'Network deleted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [NETWORKS API] Error deleting network ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete network',
      errorDetails: error.message || String(error)
    });
  }
});

