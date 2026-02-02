/**
 * Page Information Functions
 *
 * Firebase Functions for managing page help information
 * Allows dynamic updates to page documentation without redeployment
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Page Information Interface
 */
export interface PageInfo {
  pageId: string;
  title: string;
  description: string;
  howToUse: string[];
  keyFeatures: string[];
  relatedPages: Array<{
    pageId: string;
    pageName: string;
    relationship: string;
    description: string;
  }>;
  workflows: Array<{
    name: string;
    steps: string[];
    involvedPages: string[];
  }>;
  tips: string[];
  updatedAt: admin.firestore.Timestamp;
}

/**
 * Get Page Information
 * GET /api/pageInfo/:pageId
 */
export const getPageInfo = onRequest({ memory: '512MiB' }, async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const pageId = req.path.split('/').pop();
    
    if (!pageId) {
      res.status(400).json({
        success: false,
        error: 'Page ID is required'
      });
      return;
    }

    const pageInfoDoc = await db.collection('pageInfo').doc(pageId).get();

    if (!pageInfoDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Page information not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: pageInfoDoc.data()
    });
  } catch (error) {
    console.error('Error fetching page info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch page information',
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * List All Page Information
 * GET /api/pageInfo
 */
export const listAllPageInfo = onRequest({ memory: '512MiB' }, async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const pageInfoSnapshot = await db.collection('pageInfo').get();
    
    const pageInfoList: PageInfo[] = [];
    pageInfoSnapshot.forEach(doc => {
      pageInfoList.push(doc.data() as PageInfo);
    });

    res.status(200).json({
      success: true,
      data: pageInfoList
    });
  } catch (error) {
    console.error('Error listing page info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list page information',
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update Page Information (Admin Only)
 * PUT /api/pageInfo/:pageId
 */
export const updatePageInfo = onRequest({ memory: '512MiB' }, async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized - No token provided'
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Check if user is admin
    if (!decodedToken.admin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden - Admin access required'
      });
      return;
    }

    const pageId = req.path.split('/').pop();
    const updateData = req.body;

    if (!pageId) {
      res.status(400).json({
        success: false,
        error: 'Page ID is required'
      });
      return;
    }

    // Add timestamp
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db.collection('pageInfo').doc(pageId).set(updateData, { merge: true });

    res.status(200).json({
      success: true,
      message: 'Page information updated successfully'
    });
  } catch (error) {
    console.error('Error updating page info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update page information',
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Create Page Information (Admin Only)
 * POST /api/pageInfo
 */
export const createPageInfo = onRequest({ memory: '512MiB' }, async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized - No token provided'
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Check if user is admin
    if (!decodedToken.admin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden - Admin access required'
      });
      return;
    }

    const pageData: PageInfo = req.body;

    if (!pageData.pageId) {
      res.status(400).json({
        success: false,
        error: 'Page ID is required'
      });
      return;
    }

    // Add timestamp
    pageData.updatedAt = admin.firestore.Timestamp.now();

    await db.collection('pageInfo').doc(pageData.pageId).set(pageData);

    res.status(201).json({
      success: true,
      message: 'Page information created successfully',
      data: pageData
    });
  } catch (error) {
    console.error('Error creating page info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create page information',
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

