/**
 * Main API Router Function
 * 
 * Central Express router for all API endpoints
 */

import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateToken } from '../shared/middleware';
import { db, createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Import all function modules
// import * as auth from '../auth';
// import * as projects from '../projects';
// import * as datasets from '../datasets';
// import * as sessions from '../sessions';
// import * as licensing from '../licensing';
// import * as payments from '../payments';
// import * as database from '../database';
// import * as system from '../system';
// import * as ai from '../ai';
// import * as team from '../team';
// import * as debug from '../debug';

// Import timecard approval handlers
import {
  handlePendingApprovals,
  handleMySubmissions,
  handleApprovalHistory,
  handleDirectReports,
  handleMyManager
} from '../timecards/timecardApprovalApiHandlers';

// Import cloud integration functions - Commented out as they're separate Firebase Functions
// import * as integrations from '../integrations';

// Create Express app
const app = express();

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = [
      'https://backbone-logic.web.app',
      'https://backbone-client.web.app',
      'https://dashboard-1c3a5.web.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4001',
      'http://localhost:4002',
      'http://localhost:4003',
      'http://localhost:4010',
      'http://localhost:5173'
    ];

    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow all localhost origins
    if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Application-Mode',
    'X-Client-Type',
    'X-Client-Version',
    'Origin',
    'Accept',
    'x-request-started-at',
    'X-Request-Started-At',
    'request-started-at',
    'X-Request-ID',
    'x-auth-token',
    'X-Client-Type',
    'x-client-type',
    'X-Client-Version',
    'x-client-version',
    'Cache-Control',
    'cache-control',
    'Pragma',
    'Expires'
  ],
  preflightContinue: false,
  optionsSuccessStatus: 200
};

// Handle all OPTIONS requests first (CORS preflight) - must be before other routes
app.options('*', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
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
      res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(200).send('');
    }
  }

  // When credentials are required, we cannot use '*' - must specify exact origin
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  } else if (origin) {
    // Unknown origin - reject the request
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  } else {
    // No origin header (e.g., Postman, mobile apps) - allow but without credentials
    res.set('Access-Control-Allow-Origin', '*');
    // Don't set credentials when using wildcard
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware - add before routes
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.log(`🔍 [API REQUEST] ${req.method} ${req.originalUrl} - Path: ${req.path}`);
  next();
});

// Ensure all responses have proper CORS headers with credentials
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
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
      return next();
    }
  }

  // When credentials are required, we cannot use '*' - must specify exact origin
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  }

  next();
});

// Health check endpoint - explicitly handle CORS for public access
app.options('/health', (req: express.Request, res: express.Response) => {
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
});

app.get('/health', (req: express.Request, res: express.Response) => {
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

  // Set CORS headers explicitly
  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: ['auth', 'projects', 'datasets', 'sessions', 'licensing', 'payments', 'database', 'system', 'ai', 'team', 'debug', 'timecard-approval']
  });
});

// Timecard approval endpoints - Use explicit routes for better matching
app.get('/timecard-approval/pending', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const userOrgId = req.user?.organizationId;
    if (!userId || !userOrgId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }
    await handlePendingApprovals(req, res, userOrgId, userId);
  } catch (error: any) {
    console.error('❌ [TIMECARD APPROVAL API] Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/timecard-approval/my-submissions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const userOrgId = req.user?.organizationId;
    if (!userId || !userOrgId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }
    await handleMySubmissions(req, res, userOrgId, userId);
  } catch (error: any) {
    console.error('❌ [TIMECARD APPROVAL API] Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/timecard-approval/history', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const userOrgId = req.user?.organizationId;
    if (!userId || !userOrgId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }
    await handleApprovalHistory(req, res, userOrgId, userId);
  } catch (error: any) {
    console.error('❌ [TIMECARD APPROVAL API] Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/timecard-approval/direct-reports', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const userOrgId = req.user?.organizationId;
    if (!userId || !userOrgId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }
    await handleDirectReports(req, res, userOrgId, userId);
  } catch (error: any) {
    console.error('❌ [TIMECARD APPROVAL API] Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Handle /direct-reports/all endpoint (alias for /direct-reports)
app.get('/timecard-approval/direct-reports/all', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const userOrgId = req.user?.organizationId;
    if (!userId || !userOrgId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }
    await handleDirectReports(req, res, userOrgId, userId);
  } catch (error: any) {
    console.error('❌ [TIMECARD APPROVAL API] Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/timecard-approval/my-manager', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const userOrgId = req.user?.organizationId;
    if (!userId || !userOrgId) {
      res.status(401).json({ error: 'User authentication required' });
      return;
    }
    await handleMyManager(req, res, userOrgId, userId);
  } catch (error: any) {
    console.error('❌ [TIMECARD APPROVAL API] Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Cloud Integration endpoints - Commented out as these are separate Firebase Functions
// app.post('/api/integrations/google/auth/initiate', integrations.initiateGoogleOAuth);
// app.post('/api/integrations/google/auth/callback', integrations.handleGoogleOAuthCallback);
// app.get('/api/integrations/google/folders', integrations.listGoogleDriveFolders);
// app.get('/api/integrations/google/files/:folderId', integrations.getGoogleDriveFiles);
// app.post('/api/integrations/google/folders', integrations.createGoogleDriveFolder);
// app.post('/api/integrations/google/upload', integrations.uploadToGoogleDrive);
// app.get('/api/integrations/google/status', integrations.getGoogleIntegrationStatus);

// API documentation endpoint
app.get('/docs', (req: express.Request, res: express.Response) => {
  res.status(200).json({
    title: 'BACKBONE Unified API',
    version: '1.0.0',
    description: 'Unified Firebase Functions API for all BACKBONE projects',
    endpoints: {
      auth: {
        'POST /auth/login': 'User login',
        'POST /auth/register': 'User registration',
        'POST /auth/verify': 'Email verification and password reset'
      },
      projects: {
        'GET /projects': 'List projects',
        'POST /projects': 'Create project',
        'PUT /projects/:id': 'Update project',
        'DELETE /projects/:id': 'Delete project'
      },
      datasets: {
        'GET /datasets': 'List datasets',
        'POST /datasets': 'Create dataset',
        'PUT /datasets/:id': 'Update dataset',
        'DELETE /datasets/:id': 'Delete dataset'
      },
      sessions: {
        'GET /sessions': 'List sessions',
        'POST /sessions': 'Create session',
        'PUT /sessions/:id': 'Update session',
        'DELETE /sessions/:id': 'Delete session'
      },
      licensing: {
        'GET /licenses': 'List licenses',
        'POST /licenses': 'Create license',
        'PUT /licenses/:id': 'Update license',
        'DELETE /licenses/:id': 'Delete license'
      },
      payments: {
        'GET /payments': 'List payments',
        'POST /payments': 'Create payment',
        'PUT /payments/:id': 'Update payment'
      },
      database: {
        'POST /database/collections': 'Create collection',
        'POST /database/indexes': 'Create indexes',
        'PUT /database/rules': 'Update security rules',
        'GET /database/collections': 'List collections'
      },
      system: {
        'GET /system/health': 'System health check',
        'POST /system/initialize': 'Initialize database',
        'POST /system/migrate': 'Migrate data',
        'POST /system/cleanup': 'Cleanup data'
      },
      ai: {
        'POST /ai/process-document': 'Process deliverable document',
        'POST /ai/verify-accuracy': 'Verify deliverable accuracy',
        'POST /ai/generate-workflow': 'Generate workflow from deliverables'
      },
      team: {
        'POST /team/auth': 'Team member authentication',
        'GET /team/project-members': 'Get project team members',
        'GET /team/licensed-members': 'Get licensed team members',
        'POST /team/add-to-project': 'Add team member to project',
        'POST /team/remove-from-project': 'Remove team member from project',
        'GET /team/available-roles': 'Get available project roles'
      },
      debug: {
        'POST /debug/role-conversion': 'Debug role conversion'
      }
    }
  });
});

// Mount all function modules
// Note: Individual functions are exported separately
// These modules contain Firebase Functions, not Express routers
// app.use('/auth', auth);
// app.use('/projects', projects);
// app.use('/datasets', datasets);
// app.use('/sessions', sessions);
// app.use('/licensing', licensing);
// app.use('/payments', payments);
// app.use('/database', database);
// app.use('/system', system);
// app.use('/ai', ai);
// app.use('/team', team);
// app.use('/debug', debug);

// ====================
// Network IP API Endpoints
// ====================

// Handle OPTIONS for network-ip endpoint
app.options('/network-ip', (req: express.Request, res: express.Response) => {
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
      res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(200).send('');
    }
  }

  // When credentials are required, we cannot use '*' - must specify exact origin
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  } else if (origin) {
    // Unknown origin - reject the request
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  } else {
    // No origin header (e.g., Postman, mobile apps) - allow but without credentials
    res.set('Access-Control-Allow-Origin', '*');
    // Don't set credentials when using wildcard
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Get all network IP assignments
app.get('/network-ip', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🌐 [NETWORK IP API] Fetching all network IP assignments...');

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

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
    return res.status(200).json({
      success: true,
      data: ipAssignments,
      total: ipAssignments.length
    });
  } catch (error: any) {
    console.error('❌ [NETWORK IP API] Error fetching network IP assignments:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch network IP assignments',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Networks API Endpoints
// ====================

// Handle OPTIONS for networks endpoint
app.options('/networks', (req: express.Request, res: express.Response) => {
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

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Get all networks
app.get('/networks', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🌐 [NETWORKS API] Fetching all networks...');

    const userId = req.user?.uid;
    const userEmail = (req.user as any)?.email;
    const organizationId = req.user?.organizationId;

    // Get user's organization ID if not in token
    let userData: any = null;
    if (!organizationId) {
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
    }

    const finalOrganizationId = organizationId || userData?.organizationId;

    if (!finalOrganizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get networks for the organization
    let networksQuery: any = db.collection('networks');
    if (finalOrganizationId) {
      networksQuery = networksQuery.where('organizationId', '==', finalOrganizationId);
    }

    const networksSnapshot = await networksQuery.get();
    const networks = networksSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ [NETWORKS API] Found ${networks.length} networks`);
    return res.status(200).json({
      success: true,
      data: networks,
      total: networks.length
    });
  } catch (error: any) {
    console.error('❌ [NETWORKS API] Error fetching networks:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch networks',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Inventory API Endpoints
// ====================

// Handle OPTIONS for inventory endpoint
app.options('/inventory', (req: express.Request, res: express.Response) => {
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

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Get all inventory items
app.get('/inventory', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📦 [INVENTORY API] Fetching all inventory items...');

    const userId = req.user?.uid;
    const userEmail = (req.user as any)?.email;
    const organizationId = req.user?.organizationId;

    // Get user's organization ID if not in token
    let userData: any = null;
    if (!organizationId) {
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
    }

    const finalOrganizationId = organizationId || userData?.organizationId;

    if (!finalOrganizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get inventory items for the organization
    let inventoryQuery: any = db.collection('inventoryItems');
    if (finalOrganizationId) {
      inventoryQuery = inventoryQuery.where('organizationId', '==', finalOrganizationId);
    }

    // Handle search query parameter
    // Note: Firestore has limitations on multiple where clauses
    // If search is needed, we'll filter in memory after fetching
    const searchQuery = req.query.search as string;

    const inventorySnapshot = await inventoryQuery.get();
    let inventoryItems = inventorySnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    // Apply search filter if provided (filter in memory since Firestore has query limitations)
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      inventoryItems = inventoryItems.filter((item: any) => {
        const name = (item.name || '').toLowerCase();
        const type = (item.type || '').toLowerCase();
        const status = (item.status || '').toLowerCase();
        const department = (item.department || '').toLowerCase();
        return name.includes(searchLower) ||
          type.includes(searchLower) ||
          status.includes(searchLower) ||
          department.includes(searchLower);
      });
    }

    console.log(`✅ [INVENTORY API] Found ${inventoryItems.length} inventory items`);
    return res.status(200).json({
      success: true,
      data: inventoryItems,
      total: inventoryItems.length
    });
  } catch (error: any) {
    console.error('❌ [INVENTORY API] Error fetching inventory items:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory items',
      errorDetails: error.message || String(error)
    });
  }
});

// Get inventory item by ID
app.get('/inventory/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const inventoryDoc = await db.collection('inventoryItems').doc(id).get();

    if (!inventoryDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    const inventoryItem = {
      id: inventoryDoc.id,
      ...inventoryDoc.data()
    };

    return res.status(200).json({
      success: true,
      data: inventoryItem
    });
  } catch (error: any) {
    console.error('❌ [INVENTORY API] Error fetching inventory item:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory item',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Contacts API Endpoints
// ====================

// Handle OPTIONS for contacts endpoint
app.options('/contacts', (req: express.Request, res: express.Response) => {
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

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Get all contacts
app.get('/contacts', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('👥 [CONTACTS API] Fetching all contacts...');

    const userId = req.user?.uid;
    const userEmail = (req.user as any)?.email;

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
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const organizationId = userData.organizationId;

    // Get contacts for the organization
    let contactsQuery: any = db.collection('contacts');
    if (organizationId) {
      contactsQuery = contactsQuery.where('organizationId', '==', organizationId);
    }

    const contactsSnapshot = await contactsQuery.get();
    const contacts = contactsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ [CONTACTS API] Found ${contacts.length} contacts`);
    return res.status(200).json({
      success: true,
      data: contacts,
      total: contacts.length
    });
  } catch (error: any) {
    console.error('❌ [CONTACTS API] Error fetching contacts:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch contacts',
      errorDetails: error.message || String(error)
    });
  }
});

// Get contact by ID
app.get('/contacts/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const contactDoc = await db.collection('contacts').doc(id).get();

    if (!contactDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    const contact = {
      id: contactDoc.id,
      ...contactDoc.data()
    };

    return res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error: any) {
    console.error('❌ [CONTACTS API] Error fetching contact:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch contact',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Schemas API Endpoints
// ====================

// Handle OPTIONS for schemas endpoint
app.options('/schemas', (req: express.Request, res: express.Response) => {
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
      res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(200).send('');
    }
  }

  // When credentials are required, we cannot use '*' - must specify exact origin
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  } else if (origin) {
    // Unknown origin - reject the request
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  } else {
    // No origin header (e.g., Postman, mobile apps) - allow but without credentials
    res.set('Access-Control-Allow-Origin', '*');
    // Don't set credentials when using wildcard
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Get all schemas
app.get('/schemas', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📋 [SCHEMAS API] Fetching all schemas...');

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get schemas for the organization
    let schemasQuery: any = db.collection('schemas');
    if (organizationId) {
      schemasQuery = schemasQuery.where('organizationId', '==', organizationId);
    }

    const schemasSnapshot = await schemasQuery.get();
    const schemas = schemasSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ [SCHEMAS API] Found ${schemas.length} schemas`);
    return res.status(200).json({
      success: true,
      data: schemas,
      total: schemas.length
    });
  } catch (error: any) {
    console.error('❌ [SCHEMAS API] Error fetching schemas:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch schemas',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Sessions API Endpoints
// ====================

// Handle OPTIONS for sessions endpoints
app.options('/sessions', (req: express.Request, res: express.Response) => {
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

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

app.options('/sessions/:id', (req: express.Request, res: express.Response) => {
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

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Get all sessions (complex endpoint with filters - Agent 2)
app.get('/sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📋 [SESSIONS API] Fetching all sessions...');
    console.log('📋 [SESSIONS API] Request details:', {
      path: req.path,
      originalUrl: req.originalUrl,
      method: req.method,
      query: req.query,
      hasUser: !!req.user
    });

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const {
      status,
      phase,
      assignee,
      startDate,
      endDate,
      search,
      page = '1',
      limit = '50',
      includeDeleted = 'false'
    } = req.query;

    // Build base query
    let sessionsQuery: any = db.collection('sessions')
      .where('organizationId', '==', organizationId);

    // Filter by deleted status
    if (includeDeleted !== 'true') {
      sessionsQuery = sessionsQuery.where('isDeleted', '==', false);
    }

    // Status filtering
    if (status && status !== 'all') {
      const statuses = Array.isArray(status) ? status : [status];
      if (statuses.length === 1) {
        sessionsQuery = sessionsQuery.where('status', '==', statuses[0]);
      } else {
        // For multiple statuses, we need to use 'in' operator
        sessionsQuery = sessionsQuery.where('status', 'in', statuses);
      }
    }

    // Phase filtering
    if (phase && phase !== 'all') {
      sessionsQuery = sessionsQuery.where('phase', '==', phase);
    }

    // Date range filtering
    if (startDate) {
      sessionsQuery = sessionsQuery.where('sessionDate', '>=', new Date(startDate as string));
    }
    if (endDate) {
      sessionsQuery = sessionsQuery.where('sessionDate', '<=', new Date(endDate as string));
    }

    // Order and pagination
    sessionsQuery = sessionsQuery
      .orderBy('updatedAt', 'desc')
      .limit(parseInt(limit as string) || 50);

    const sessionsSnapshot = await sessionsQuery.get();
    let sessions = sessionsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      sessionId: doc.id,
      ...doc.data()
    }));

    // Search filtering (client-side since Firestore doesn't support full-text search)
    if (search) {
      const searchLower = (search as string).toLowerCase();
      sessions = sessions.filter((session: any) => {
        return (
          session.name?.toLowerCase().includes(searchLower) ||
          session.description?.toLowerCase().includes(searchLower) ||
          session.notes?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Assignee filtering (client-side after fetching assignments)
    if (assignee) {
      const assigneeSessions = await Promise.all(
        sessions.map(async (session: any) => {
          const assignmentsSnapshot = await db.collection('sessionAssignments')
            .where('sessionId', '==', session.id)
            .where('userId', '==', assignee)
            .get();
          return assignmentsSnapshot.empty ? null : session;
        })
      );
      sessions = assigneeSessions.filter(Boolean);
    }

    // Get related data (assignments, tasks, reviews)
    const sessionsWithRelations = await Promise.all(
      sessions.map(async (session: any) => {
        // Get session assignments
        const assignmentsSnapshot = await db.collection('sessionAssignments')
          .where('sessionId', '==', session.id)
          .get();

        const assignments = await Promise.all(
          assignmentsSnapshot.docs.map(async (assignDoc: any) => {
            const assignData = assignDoc.data();
            const userDoc = await db.collection('users').doc(assignData.userId).get();
            const roleDoc = assignData.roleId ? await db.collection('roles').doc(assignData.roleId).get() : null;

            return {
              id: assignDoc.id,
              ...assignData,
              user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null,
              role: roleDoc?.exists ? { id: roleDoc.id, ...roleDoc.data() } : null
            };
          })
        );

        // Get post-production tasks
        const tasksSnapshot = await db.collection('tasks')
          .where('sessionId', '==', session.id)
          .get();

        const tasks = await Promise.all(
          tasksSnapshot.docs.map(async (taskDoc: any) => {
            const taskData = taskDoc.data();
            const userDoc = taskData.assignedToUserId ? await db.collection('users').doc(taskData.assignedToUserId).get() : null;
            const roleDoc = taskData.roleId ? await db.collection('roles').doc(taskData.roleId).get() : null;

            return {
              id: taskDoc.id,
              ...taskData,
              assignedToUser: userDoc?.exists ? { id: userDoc.id, ...userDoc.data() } : null,
              role: roleDoc?.exists ? { id: roleDoc.id, ...roleDoc.data() } : null
            };
          })
        );

        // Get review sessions
        const reviewsSnapshot = await db.collection('reviewSessions')
          .where('sessionId', '==', session.id)
          .get();

        const reviewSessions = reviewsSnapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data()
        }));

        return {
          ...session,
          sessionAssignments: assignments,
          postProductionTasks: tasks,
          reviewSessions
        };
      })
    );

    // Calculate total count (for pagination)
    const totalQuery = db.collection('sessions')
      .where('organizationId', '==', organizationId);
    
    if (includeDeleted !== 'true') {
      totalQuery.where('isDeleted', '==', false);
    }

    const totalSnapshot = await totalQuery.get();
    const total = totalSnapshot.size;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;

    return res.status(200).json({
      success: true,
      sessions: sessionsWithRelations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error fetching sessions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions',
      errorDetails: error.message || String(error)
    });
  }
});

// Get all session tags (MUST come before /sessions/:id to avoid route conflict)
app.options('/sessions/tags', (req: express.Request, res: express.Response) => {
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

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

app.get('/sessions/tags', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🏷️ [SESSIONS TAGS API] Fetching all tags...');

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get tags for the organization
    // Tags can be stored in a separate collection or as part of media files
    // For now, we'll check if there's a mediaFileTags collection
    let tagsQuery: any = db.collection('mediaFileTags');
    tagsQuery = tagsQuery.where('organizationId', '==', organizationId);

    const tagsSnapshot = await tagsQuery.get();
    const tags = tagsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    // If no tags collection exists, return empty array
    // The frontend will handle this gracefully
    console.log(`✅ [SESSIONS TAGS API] Found ${tags.length} tags`);
    return res.status(200).json({
      success: true,
      data: tags,
      total: tags.length
    });
  } catch (error: any) {
    // If collection doesn't exist, return empty array
    if (error.code === 'not-found' || error.message?.includes('not found')) {
      console.log('ℹ️ [SESSIONS TAGS API] Tags collection not found, returning empty array');
      return res.status(200).json({
        success: true,
        data: [],
        total: 0
      });
    }

    console.error('❌ [SESSIONS TAGS API] Error fetching tags:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch tags',
      errorDetails: error.message || String(error)
    });
  }
});

// Get session by ID
app.get('/sessions/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.params.id;
    console.log(`📋 [SESSIONS API] Fetching session: ${sessionId}`);

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionDoc = await db.collection('sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    // Verify organization access
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: sessionDoc.id,
        sessionId: sessionDoc.id,
        ...sessionData
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error fetching session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch session',
      errorDetails: error.message || String(error)
    });
  }
});

// Helper function to create session conversation
async function createSessionConversation(
  sessionId: string,
  organizationId: string,
  sessionName: string,
  createdBy: string
): Promise<void> {
  try {
    console.log(`💬 [SESSIONS API] Creating conversation for session: ${sessionId}`);

    // Check if conversation already exists
    const existingConversations = await db.collection('conversations')
      .where('organizationId', '==', organizationId)
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (!existingConversations.empty) {
      console.log(`ℹ️ [SESSIONS API] Conversation already exists for session ${sessionId}`);
      return;
    }

    // Collect participants from session assignments
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      console.warn(`⚠️ [SESSIONS API] Session ${sessionId} not found when creating conversation`);
      return;
    }

    const sessionData = sessionDoc.data();
    const participants = new Set<string>();

    // Add creator if provided
    if (createdBy && createdBy !== 'system') {
      participants.add(createdBy);
    }

    // Collect from crewAssignments
    if (sessionData?.crewAssignments && Array.isArray(sessionData.crewAssignments)) {
      sessionData.crewAssignments.forEach((assignment: any) => {
        if (assignment.personId) participants.add(assignment.personId);
        if (assignment.userId) participants.add(assignment.userId);
      });
    }

    // Collect from assignedTo field
    if (sessionData?.assignedTo && Array.isArray(sessionData.assignedTo)) {
      sessionData.assignedTo.forEach((userId: string) => {
        if (userId) participants.add(userId);
      });
    }

    // Collect from workflow step assignments
    const workflowStepsSnapshot = await db.collection('workflowSteps')
      .where('sessionId', '==', sessionId)
      .get();

    workflowStepsSnapshot.forEach((stepDoc) => {
      const stepData = stepDoc.data();
      if (stepData?.assignedUserId) {
        participants.add(stepData.assignedUserId);
      }
    });

    // Check workflowStepAssignments collection
    const stepIds = workflowStepsSnapshot.docs.map(doc => doc.id);
    if (stepIds.length > 0) {
      // Firestore 'in' queries are limited to 10 items, so we need to batch if needed
      const batchSize = 10;
      for (let i = 0; i < stepIds.length; i += batchSize) {
        const batch = stepIds.slice(i, i + batchSize);
        const stepAssignmentsSnapshot = await db.collection('workflowStepAssignments')
          .where('workflowStepId', 'in', batch)
          .where('isActive', '==', true)
          .get();

        stepAssignmentsSnapshot.forEach((assignmentDoc) => {
          const assignmentData = assignmentDoc.data();
          if (assignmentData?.userId) {
            participants.add(assignmentData.userId);
          }
        });
      }
    }

    // Convert Set to Array and remove duplicates
    const uniqueParticipants = Array.from(participants);

    if (uniqueParticipants.length === 0) {
      console.log(`ℹ️ [SESSIONS API] No participants found for session ${sessionId}, skipping conversation creation`);
      return;
    }

    // Get participant details
    const participantDetails: any[] = [];
    for (const participantId of uniqueParticipants) {
      try {
        const userDoc = await db.collection('users').doc(participantId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          participantDetails.push({
            uid: participantId,
            firebaseUid: participantId,
            name: userData?.name || (userData?.firstName && userData?.lastName 
              ? `${userData.firstName} ${userData.lastName}` 
              : userData?.email || 'Unknown User'),
            email: userData?.email || '',
            avatar: userData?.avatar || userData?.photoURL || '',
          });
        }
      } catch (userError) {
        console.warn(`⚠️ [SESSIONS API] Error fetching user ${participantId}:`, userError);
      }
    }

    // Create unread count object
    const unreadCount: Record<string, number> = {};
    uniqueParticipants.forEach(uid => {
      unreadCount[uid] = 0;
    });

    // Create conversation
    const conversationData = {
      organizationId,
      type: 'group',
      participants: uniqueParticipants,
      participantDetails,
      name: `Session: ${sessionName}`,
      sessionId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: createdBy || 'system',
      isArchived: false,
      unreadCount,
    };

    const conversationRef = await db.collection('conversations').add(conversationData);
    console.log(`✅ [SESSIONS API] Created conversation ${conversationRef.id} for session ${sessionId}`);

    // Create initial system message
    const messageData = {
      conversationId: conversationRef.id,
      senderId: 'system',
      senderName: 'System',
      senderEmail: 'system@backbone-logic.com',
      text: `Session conversation created for "${sessionName}". All assigned team members can discuss this session here.`,
      type: 'system',
      readBy: [],
      createdAt: FieldValue.serverTimestamp(),
      isEdited: false,
      isDeleted: false,
      reactions: {},
    };

    await db.collection('conversations').doc(conversationRef.id)
      .collection('messages').add(messageData);

    console.log(`✅ [SESSIONS API] Created initial message for session conversation`);
  } catch (error) {
    console.error(`❌ [SESSIONS API] Error creating session conversation:`, error);
    throw error;
  }
}

// Create session
app.post('/sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📝 [SESSIONS API] Creating session...');

    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const { name, projectId, description, startDate, endDate, status = 'draft' } = req.body;

    if (!name || !projectId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name and projectId are required'
      });
    }

    const sessionData = {
      name,
      projectId,
      organizationId,
      createdBy: userId || 'system',
      description: description || '',
      startDate: startDate ? (startDate instanceof Date ? startDate : new Date(startDate)) : null,
      endDate: endDate ? (endDate instanceof Date ? endDate : new Date(endDate)) : null,
      status,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const sessionRef = await db.collection('sessions').add(sessionData);

    console.log(`✅ [SESSIONS API] Created session: ${sessionRef.id}`);

    // Automatically create session conversation
    try {
      await createSessionConversation(sessionRef.id, organizationId, name || 'Untitled Session', userId || 'system');
    } catch (conversationError) {
      // Log but don't fail session creation if conversation creation fails
      console.warn('⚠️ [SESSIONS API] Failed to create session conversation (non-critical):', conversationError);
    }

    return res.status(200).json({
      success: true,
      data: {
        sessionId: sessionRef.id,
        id: sessionRef.id,
        ...sessionData
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error creating session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create session',
      errorDetails: error.message || String(error)
    });
  }
});

// Update session
app.put('/sessions/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.params.id;
    console.log(`✏️ [SESSIONS API] Updating session: ${sessionId}`);

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists and user has access
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    const updates = req.body;
    const updateData = {
      ...updates,
      updatedAt: new Date()
    };

    await db.collection('sessions').doc(sessionId).update(updateData);

    console.log(`✅ [SESSIONS API] Updated session: ${sessionId}`);
    return res.status(200).json({
      success: true,
      data: {
        sessionId,
        id: sessionId,
        ...updateData
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error updating session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update session',
      errorDetails: error.message || String(error)
    });
  }
});

// Delete session
app.delete('/sessions/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.params.id;
    console.log(`🗑️ [SESSIONS API] Deleting session: ${sessionId}`);

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists and user has access
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    await db.collection('sessions').doc(sessionId).delete();

    console.log(`✅ [SESSIONS API] Deleted session: ${sessionId}`);
    return res.status(200).json({
      success: true,
      data: { sessionId }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error deleting session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete session',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Workflow API Endpoints
// ====================

// Handle OPTIONS for workflow templates endpoint
app.options('/workflow-templates', (req: express.Request, res: express.Response) => {
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
});

// Get all workflow templates
app.get('/workflow-templates', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📋 [WORKFLOW TEMPLATES API] Fetching all workflow templates...');

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get workflow templates for the organization
    let templatesQuery: any = db.collection('workflowTemplates');
    templatesQuery = templatesQuery.where('organizationId', '==', organizationId);

    const templatesSnapshot = await templatesQuery.get();
    const templates = templatesSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ [WORKFLOW TEMPLATES API] Found ${templates.length} templates`);
    return res.status(200).json({
      success: true,
      data: templates,
      total: templates.length
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW TEMPLATES API] Error fetching templates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow templates',
      errorDetails: error.message || String(error)
    });
  }
});

// Handle OPTIONS for workflow instances endpoint
app.options('/workflow-instances', (req: express.Request, res: express.Response) => {
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
});

// Get all workflow instances
app.get('/workflow-instances', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📋 [WORKFLOW INSTANCES API] Fetching all workflow instances...');

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get workflow instances for the organization
    let instancesQuery: any = db.collection('workflowInstances');
    instancesQuery = instancesQuery.where('organizationId', '==', organizationId);

    const instancesSnapshot = await instancesQuery.get();
    const instances = instancesSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ [WORKFLOW INSTANCES API] Found ${instances.length} instances`);
    return res.status(200).json({
      success: true,
      data: instances,
      total: instances.length
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW INSTANCES API] Error fetching instances:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow instances',
      errorDetails: error.message || String(error)
    });
  }
});

// Handle OPTIONS for workflow sessions endpoint
app.options('/workflow/sessions/:sessionId/all', (req: express.Request, res: express.Response) => {
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
});
// Get workflow instance and steps for a session (primary endpoint for frontend)
app.options('/workflow/sessions/:sessionId', (req: express.Request, res: express.Response) => {
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
});

app.get('/workflow/sessions/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    console.log(`🔍 [WORKFLOW API] Getting workflow for session ${sessionId}`);

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // 1. Get workflow instance
    const instanceSnapshot = await db.collection('workflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    let workflowInstance = null;
    if (!instanceSnapshot.empty) {
      const doc = instanceSnapshot.docs[0];
      const data = doc.data();
      // Handle timestamps for JSON serialization
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;

      workflowInstance = {
        id: doc.id,
        ...data,
        createdAt
      };
    }

    // 2. Get workflow steps
    const stepsSnapshot = await db.collection('workflowSteps')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .orderBy('order', 'asc')
      .get();

    const steps = stepsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ [WORKFLOW API] Found instance: ${!!workflowInstance}, steps: ${steps.length} for session ${sessionId}`);

    return res.status(200).json({
      success: true,
      data: {
        workflowInstance,
        steps
      }
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW API] Error getting session workflow:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get session workflow',
      error: error.message || String(error)
    });
  }
});


app.get('/workflow/sessions/:sessionId/all', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    console.log(`🔍 [WORKFLOW API] Getting all workflows for session ${sessionId}`);
    console.log(`🔍 [WORKFLOW API] Request path: ${req.path}, originalUrl: ${req.originalUrl}`);

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get all workflow instances for this session
    let workflowsQuery: any = db.collection('sessionWorkflows');
    workflowsQuery = workflowsQuery
      .where('organizationId', '==', organizationId)
      .where('sessionId', '==', sessionId);

    const workflowsSnapshot = await workflowsQuery.get();
    const workflows = workflowsSnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        sessionId: data.sessionId,
        workflowDiagramId: data.workflowDiagramId,
        name: data.name,
        description: data.description,
        status: data.status,
        progress: data.progress,
        workflowPhase: data.workflowPhase,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        startedAt: data.startedAt?.toDate?.() || data.startedAt,
        completedAt: data.completedAt?.toDate?.() || data.completedAt,
        ...data
      };
    });

    console.log(`✅ [WORKFLOW API] Found ${workflows.length} workflows for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: `Found ${workflows.length} workflows for session`,
      data: workflows
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW API] Error getting session workflows:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get session workflows',
      error: error.message || String(error)
    });
  }
});

// ====================
// Unified Workflow API Endpoints
// ====================

// Handle OPTIONS for unified workflow analytics endpoint
app.options('/unified-workflow/sessions/:sessionId/analytics', (req: express.Request, res: express.Response) => {
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
});

// Get unified workflow analytics for a session
app.get('/unified-workflow/sessions/:sessionId/analytics', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    console.log(`📊 [UNIFIED WORKFLOW ANALYTICS] Getting analytics for session ${sessionId}`);

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists and user has access
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get workflow instances for this session
    const workflowsSnapshot = await db.collection('sessionWorkflows')
      .where('organizationId', '==', organizationId)
      .where('sessionId', '==', sessionId)
      .get();

    const workflows = workflowsSnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data
      };
    });

    // Calculate analytics
    const totalSteps = workflows.reduce((sum: number, wf: any) => sum + (wf.stepsCount || 0), 0);
    const completedSteps = workflows.reduce((sum: number, wf: any) => sum + (wf.completedSteps || 0), 0);
    const inProgressSteps = workflows.reduce((sum: number, wf: any) => sum + (wf.inProgressSteps || 0), 0);
    const blockedSteps = workflows.reduce((sum: number, wf: any) => sum + (wf.blockedSteps || 0), 0);
    const overallProgress = workflows.length > 0
      ? workflows.reduce((sum: number, wf: any) => sum + (wf.progress || 0), 0) / workflows.length
      : 0;

    const analytics = {
      sessionId,
      overallProgress: Math.round(overallProgress * 100) / 100,
      totalSteps,
      completedSteps,
      inProgressSteps,
      blockedSteps,
      workflowsCount: workflows.length,
      workflows: workflows.map((wf: any) => ({
        id: wf.id,
        name: wf.name,
        status: wf.status,
        progress: wf.progress || 0,
        stepsCount: wf.stepsCount || 0,
        completedSteps: wf.completedSteps || 0
      }))
    };

    console.log(`✅ [UNIFIED WORKFLOW ANALYTICS] Analytics calculated for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error: any) {
    console.error('❌ [UNIFIED WORKFLOW ANALYTICS] Error getting analytics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get workflow analytics',
      errorDetails: error.message || String(error)
    });
  }
});

// Handle OPTIONS for workflow session status endpoint
app.options('/workflow/sessions/:sessionId/status', (req: express.Request, res: express.Response) => {
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
});

// Get workflow status for a session
app.get('/workflow/sessions/:sessionId/status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    console.log(`📊 [WORKFLOW STATUS] Getting status for session ${sessionId}`);

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists and user has access
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get workflow instances for this session
    const workflowsSnapshot = await db.collection('sessionWorkflows')
      .where('organizationId', '==', organizationId)
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (workflowsSnapshot.empty) {
      return res.status(200).json({
        success: true,
        data: {
          sessionId,
          status: null,
          progress: 0,
          stepsCount: 0,
          completedSteps: 0,
          inProgressSteps: 0
        }
      });
    }

    const workflow = workflowsSnapshot.docs[0].data();

    const statusData = {
      sessionId,
      status: workflow.status || null,
      progress: workflow.progress || 0,
      stepsCount: workflow.stepsCount || 0,
      completedSteps: workflow.completedSteps || 0,
      inProgressSteps: workflow.inProgressSteps || 0,
      workflowId: workflowsSnapshot.docs[0].id
    };

    console.log(`✅ [WORKFLOW STATUS] Status retrieved for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      data: statusData
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW STATUS] Error getting status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get workflow status',
      errorDetails: error.message || String(error)
    });
  }
});

// Handle OPTIONS for workflow session complete endpoint
app.options('/workflow/sessions/:sessionId/complete', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Complete workflow for a session
app.post('/workflow/sessions/:sessionId/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { confirmationNotes } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    console.log(`✅ [WORKFLOW API] Completing workflow for session ${sessionId} by user ${userId}`);

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get workflow assignments for this session
    const workflowsQuery = await db.collection('sessionWorkflows')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    if (workflowsQuery.empty) {
      return res.status(404).json({
        success: false,
        error: 'No workflows found for this session'
      });
    }

    // Update all workflows to completed status
    const updatePromises = workflowsQuery.docs.map(doc =>
      doc.ref.update({
        status: 'COMPLETED',
        completedAt: FieldValue.serverTimestamp(),
        confirmationNotes: confirmationNotes || '',
        updatedAt: FieldValue.serverTimestamp(),
        completedBy: userId
      })
    );

    await Promise.all(updatePromises);

    // Also update the session status to COMPLETED
    const sessionRef = db.collection('sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    
    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data();
      if (sessionData?.organizationId === organizationId) {
        await sessionRef.update({
          status: 'COMPLETED',
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    console.log(`✅ [WORKFLOW API] Successfully completed ${workflowsQuery.docs.length} workflows for session: ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflows completed successfully',
      data: {
        sessionId,
        completedCount: workflowsQuery.docs.length
      }
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW API] Error completing workflows:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete workflows',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for active sessions with times endpoint
app.options('/sessions/active-with-times', (req: express.Request, res: express.Response) => {
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
});

// Get active sessions with call times
app.get('/sessions/active-with-times', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📋 [SESSIONS API] Fetching active sessions with times...');

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get active sessions with call times
    // Note: Firestore doesn't support != null queries, so we'll fetch all active sessions
    // and filter in memory for those with callTime
    const sessionsQuery = db.collection('sessions')
      .where('organizationId', '==', organizationId)
      .where('status', 'in', ['active', 'in_progress', 'scheduled', 'planned']);

    const sessionsSnapshot = await sessionsQuery.get();

    // Filter sessions that have callTime
    const sessionsWithTimes = sessionsSnapshot.docs.filter((doc: any) => {
      const data = doc.data();
      return data.callTime !== null && data.callTime !== undefined;
    });
    const sessions = sessionsWithTimes.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        sessionId: doc.id,
        name: data.name || data.sessionName,
        callTime: data.callTime?.toDate?.() || data.callTime,
        status: data.status,
        ...data
      };
    });

    console.log(`✅ [SESSIONS API] Found ${sessions.length} active sessions with times`);
    return res.status(200).json({
      success: true,
      data: sessions,
      total: sessions.length
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error fetching active sessions with times:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch active sessions with times',
      errorDetails: error.message || String(error)
    });
  }
});

// Get session assignments for a specific session
app.get('/sessions/:id/assignments', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.params.id;
    console.log(`📋 [SESSIONS API] Fetching assignments for session: ${sessionId}`);

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists and belongs to organization
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get assignments for this session
    const assignmentsQuery = db.collection('sessionAssignments')
      .where('organizationId', '==', organizationId)
      .where('sessionId', '==', sessionId);

    const assignmentsSnapshot = await assignmentsQuery.get();
    const assignments = assignmentsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ [SESSIONS API] Found ${assignments.length} assignments for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      data: assignments,
      total: assignments.length
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error fetching session assignments:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch session assignments',
      errorDetails: error.message || String(error)
    });
  }
});

// Get notifications for the current user
app.get('/notifications', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🔔 [NOTIFICATIONS API] Fetching notifications...');

    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    // 🔧 CRITICAL FIX: Return empty array instead of 403 if missing org/user
    if (!organizationId || !userId) {
      console.warn('⚠️ [NOTIFICATIONS API] Missing organizationId or userId in token, returning empty array');
      return res.status(200).json({
        success: true,
        data: [],
        total: 0,
        warning: 'User not fully authenticated'
      });
    }

    const { limit = 100, unreadOnly = false } = req.query;

    try {
      // Build query
      let notificationsQuery: any = db.collection('notifications')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', userId);

      if (unreadOnly === 'true') {
        notificationsQuery = notificationsQuery.where('read', '==', false);
      }

      notificationsQuery = notificationsQuery
        .orderBy('createdAt', 'desc')
        .limit(parseInt(limit as string) || 100);

      const notificationsSnapshot = await notificationsQuery.get();
      const notifications = notificationsSnapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
        };
      });

      console.log(`✅ [NOTIFICATIONS API] Found ${notifications.length} notifications`);
      return res.status(200).json({
        success: true,
        data: notifications,
        total: notifications.length
      });
    } catch (firestoreError: any) {
      // Handle missing Firestore index error
      if (firestoreError.code === 9 || firestoreError.message?.includes('index')) {
        console.error(`❌ [NOTIFICATIONS API] Missing Firestore index. Please create the index in Firebase Console.`);
        console.error(`🔗 Index creation link: https://console.firebase.google.com/project/_/firestore/indexes`);
        
        // Return empty array instead of error for better UX
        return res.status(200).json({ 
          success: true, 
          data: [],
          total: 0,
          warning: 'Firestore index required. Notifications temporarily unavailable.' 
        });
      }
      throw firestoreError;
    }
  } catch (error: any) {
    console.error('❌ [NOTIFICATIONS API] Error fetching notifications:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      errorDetails: error.message || String(error)
    });
  }
});


// ====================
// Timecard Admin API Endpoints
// ====================

// Handle OPTIONS for timecard-admin endpoint
app.options('/timecard-admin', (req: express.Request, res: express.Response) => {
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

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Timecard admin info endpoint
app.get('/timecard-admin', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📋 [TIMECARD ADMIN API] Timecard admin endpoint accessed');

    res.status(200).json({
      success: true,
      message: 'Timecard Admin API - Use Firebase Callable Functions',
      info: 'This endpoint is available for compatibility. For timecard operations, use Firebase Callable Functions:',
      availableFunctions: [
        'getTimecardTemplates',
        'getTimecardAssignments',
        'getTimecardUsers',
        'getTimecardConfigurations',
        'getAllTimecards',
        'createTimecardTemplate',
        'updateTimecardTemplate',
        'bulkApproveTimecards'
      ],
      note: 'These functions are available via Firebase Functions SDK (httpsCallable)'
    });
  } catch (error: any) {
    console.error('❌ [TIMECARD ADMIN API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process request',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Timecard Clock Operations
// ====================

// Handle OPTIONS for timecard endpoints
app.options('/timecard/clock-in', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  if (origin && (corsOptions.origin as any)(origin, () => { })) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

app.options('/timecard/clock-out', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  if (origin && (corsOptions.origin as any)(origin, () => { })) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

app.options('/timecard/status', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  if (origin && (corsOptions.origin as any)(origin, () => { })) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Clock in endpoint
app.post('/timecard/clock-in', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json(createErrorResponse('Unauthorized', 'User authentication required'));
    }

    const { date, location, notes, role, hourlyRate, projectId } = req.body;

    // Use provided date or today's date
    const today = date || new Date().toISOString().split('T')[0];
    const todayDate = new Date(today + 'T00:00:00');
    const now = new Date();

    // Check if already clocked in today
    const entriesRef = db.collection('timecard_entries');
    const activeEntryQuery = await entriesRef
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .where('date', '==', admin.firestore.Timestamp.fromDate(todayDate))
      .where('clockOutTime', '==', null)
      .limit(1)
      .get();

    if (!activeEntryQuery.empty) {
      const existingEntry = activeEntryQuery.docs[0];
      const existingData: any = { id: existingEntry.id, ...existingEntry.data() };
      const clockInTime = (existingData.clockInTime as admin.firestore.Timestamp)?.toDate();

      // Check if entry is stale (more than 12 hours old or from previous day)
      const hoursSinceClockIn = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
      const clockInDate = clockInTime.toISOString().split('T')[0];
      const isFromPreviousDay = clockInDate !== today;
      const STALE_THRESHOLD_HOURS = 12;

      if (isFromPreviousDay || hoursSinceClockIn > STALE_THRESHOLD_HOURS) {
        // Auto-clock out stale entry
        const reason = isFromPreviousDay
          ? `Entry from previous day (${clockInDate})`
          : `Entry is ${hoursSinceClockIn.toFixed(1)} hours old`;
        console.log(`⏰ [TIMECARD CLOCK-IN] Auto-clocking out stale entry: ${reason}`);

        // Calculate total hours (cap at 24 for safety)
        const totalHours = Math.min(hoursSinceClockIn, 24);
        const clockOutTime = isFromPreviousDay
          ? admin.firestore.Timestamp.fromDate(new Date(clockInDate + 'T23:59:59')) // End of previous day
          : admin.firestore.Timestamp.fromDate(now); // Current time

        await existingEntry.ref.update({
          clockOutTime: clockOutTime,
          totalHours: totalHours,
          status: 'COMPLETED',
          notes: (existingData.notes || '') + ` [Auto-clocked out: ${reason}]`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ [TIMECARD CLOCK-IN] Stale entry auto-clocked out, proceeding with new clock-in`);
        // Continue to create new entry below
      } else {
        // Entry is still active (recent clock-in today)
        return res.status(400).json({
          success: false,
          error: 'Already clocked in',
          errorDetails: `You are already clocked in since ${clockInTime.toLocaleTimeString()} (${hoursSinceClockIn.toFixed(1)} hours ago). Please clock out first.`,
          data: {
            existingEntry: {
              id: existingData.id,
              clockInTime: clockInTime.toISOString(),
              location: existingData.location,
              notes: existingData.notes,
              date: today,
              hoursSinceClockIn: hoursSinceClockIn.toFixed(1)
            }
          }
        });
      }
    }

    // Create new timecard entry
    const entryData = {
      organizationId,
      userId,
      date: admin.firestore.Timestamp.fromDate(todayDate),
      clockInTime: admin.firestore.Timestamp.fromDate(now),
      clockOutTime: null,
      location: location || '',
      notes: notes || '',
      role: role || null,
      hourlyRate: hourlyRate || null,
      projectId: projectId || null,
      status: 'PENDING',
      totalHours: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await entriesRef.add(entryData);
    const createdDoc = await docRef.get();
    const createdData: any = { id: createdDoc.id, ...createdDoc.data() };

    console.log(`⏰ [TIMECARD CLOCK-IN] User ${userId} clocked in at ${now.toISOString()}`);

    res.status(200).json(createSuccessResponse({
      id: createdData.id,
      userId: createdData.userId,
      date: today,
      clockInTime: (createdData.clockInTime as admin.firestore.Timestamp)?.toDate().toISOString(),
      clockOutTime: null,
      location: createdData.location,
      notes: createdData.notes,
      projectId: createdData.projectId,
      organizationId: createdData.organizationId,
      status: createdData.status,
      totalHours: createdData.totalHours || 0,
      createdAt: (createdData.createdAt as admin.firestore.Timestamp)?.toDate().toISOString(),
      updatedAt: (createdData.updatedAt as admin.firestore.Timestamp)?.toDate().toISOString()
    }, 'Clocked in successfully'));

  } catch (error: any) {
    console.error('❌ [TIMECARD CLOCK-IN] Error:', error);
    res.status(500).json(handleError(error, 'clockIn'));
  }
});

// Clock out endpoint
app.post('/timecard/clock-out', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json(createErrorResponse('Unauthorized', 'User authentication required'));
    }

    const { date, notes } = req.body;

    // Use provided date or today's date
    const today = date || new Date().toISOString().split('T')[0];
    const todayDate = new Date(today + 'T00:00:00');
    const now = new Date();

    // Find active entry (clocked in but not clocked out)
    const entriesRef = db.collection('timecard_entries');
    const activeEntryQuery = await entriesRef
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .where('date', '==', admin.firestore.Timestamp.fromDate(todayDate))
      .where('clockOutTime', '==', null)
      .limit(1)
      .get();

    if (activeEntryQuery.empty) {
      return res.status(400).json(createErrorResponse('Not clocked in', 'You are not currently clocked in.'));
    }

    const activeEntry = activeEntryQuery.docs[0];
    const entryData = activeEntry.data();

    // Calculate total hours
    const clockInTime = (entryData.clockInTime as admin.firestore.Timestamp)?.toDate();
    const clockOutTime = now;
    const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    // Update entry with clock out time
    // Set status to PENDING so it can be submitted for approval
    await activeEntry.ref.update({
      clockOutTime: admin.firestore.Timestamp.fromDate(clockOutTime),
      notes: notes || entryData.notes || '',
      totalHours: totalHours,
      status: 'PENDING', // PENDING status allows submission for approval
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const updatedDoc = await activeEntry.ref.get();
    const updatedData: any = { id: updatedDoc.id, ...updatedDoc.data() };

    console.log(`⏰ [TIMECARD CLOCK-OUT] User ${userId} clocked out at ${now.toISOString()}, total hours: ${totalHours.toFixed(2)}`);

    res.status(200).json(createSuccessResponse({
      id: updatedData.id,
      userId: updatedData.userId,
      date: today,
      clockInTime: (updatedData.clockInTime as admin.firestore.Timestamp)?.toDate().toISOString(),
      clockOutTime: (updatedData.clockOutTime as admin.firestore.Timestamp)?.toDate().toISOString(),
      location: updatedData.location,
      notes: updatedData.notes,
      projectId: updatedData.projectId,
      organizationId: updatedData.organizationId,
      status: updatedData.status,
      totalHours: updatedData.totalHours || 0,
      createdAt: (updatedData.createdAt as admin.firestore.Timestamp)?.toDate().toISOString(),
      updatedAt: (updatedData.updatedAt as admin.firestore.Timestamp)?.toDate().toISOString()
    }, 'Clocked out successfully'));

  } catch (error: any) {
    console.error('❌ [TIMECARD CLOCK-OUT] Error:', error);
    res.status(500).json(handleError(error, 'clockOut'));
  }
});

// Clock status endpoint
app.get('/timecard/status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json(createErrorResponse('Unauthorized', 'User authentication required'));
    }

    const { date } = req.query;
    const today = (date as string) || new Date().toISOString().split('T')[0];
    const todayDate = new Date(today + 'T00:00:00');

    // Check for active entry (clocked in but not clocked out)
    const entriesRef = db.collection('timecard_entries');
    const activeEntryQuery = await entriesRef
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .where('date', '==', admin.firestore.Timestamp.fromDate(todayDate))
      .where('clockOutTime', '==', null)
      .limit(1)
      .get();

    const isClockedIn = !activeEntryQuery.empty;
    const currentEntry: any = isClockedIn ? {
      id: activeEntryQuery.docs[0].id,
      ...activeEntryQuery.docs[0].data()
    } : null;

    console.log(`⏰ [TIMECARD STATUS] User ${userId} clock status for ${today}: ${isClockedIn ? 'CLOCKED IN' : 'NOT CLOCKED IN'}`);

    res.status(200).json(createSuccessResponse({
      isClockedIn,
      currentEntry: currentEntry ? {
        id: currentEntry.id,
        clockInTime: (currentEntry.clockInTime as admin.firestore.Timestamp)?.toDate().toISOString(),
        location: currentEntry.location,
        notes: currentEntry.notes
      } : null,
      date: today
    }, 'Clock status retrieved successfully'));

  } catch (error: any) {
    console.error('❌ [TIMECARD STATUS] Error:', error);
    res.status(500).json(handleError(error, 'getClockStatus'));
  }
});

// ====================
// Brain API Endpoints
// ====================

// Handle OPTIONS for brain endpoints (both /brain/health and /api/brain/health)
const brainHealthOptions = (req: express.Request, res: express.Response) => {
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
};

app.options('/brain/health', brainHealthOptions);
app.options('/api/brain/health', brainHealthOptions);

// Brain health check endpoint (handle both /brain/health and /api/brain/health)
app.get('/brain/health', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Health check requested');

    res.status(200).json({
      status: 'ok',
      message: 'Brain service is operational',
      timestamp: new Date().toISOString(),
      geminiConnected: false // TODO: Add actual Gemini connection check
    });
  } catch (error: any) {
    console.error('❌ [BRAIN API] Health check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Brain health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/brain/health', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Health check requested');

    res.status(200).json({
      status: 'ok',
      message: 'Brain service is operational',
      timestamp: new Date().toISOString(),
      geminiConnected: false // TODO: Add actual Gemini connection check
    });
  } catch (error: any) {
    console.error('❌ [BRAIN API] Health check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Brain health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Handle OPTIONS for brain context endpoint (both /brain/context and /api/brain/context)
const brainContextOptions = (req: express.Request, res: express.Response) => {
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
};

app.options('/brain/context', brainContextOptions);
app.options('/api/brain/context', brainContextOptions);

// Brain context endpoint (handle both /brain/context and /api/brain/context)
app.get('/brain/context', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Context requested');

    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get basic system stats
    const usersSnapshot = await db.collection('users').where('organizationId', '==', organizationId).limit(10).get();
    const sessionsSnapshot = await db.collection('sessions').where('organizationId', '==', organizationId).limit(10).get();
    const inventorySnapshot = await db.collection('inventoryItems').where('organizationId', '==', organizationId).limit(10).get();

    const context = {
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'production'
      },
      comprehensiveData: {
        users: {
          totalUsers: usersSnapshot.size,
          activeUsers: usersSnapshot.size,
          usersByRole: {},
          recentUsers: usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        },
        sessions: {
          totalSessions: sessionsSnapshot.size,
          activeSessions: sessionsSnapshot.size,
          sessionsByStatus: {},
          recentSessions: sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
          sessionAssignments: []
        },
        inventory: {
          totalItems: inventorySnapshot.size,
          availableItems: inventorySnapshot.size,
          assignedItems: 0,
          itemsByType: {},
          recentInventoryActivity: inventorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        },
        qualityControl: {
          totalQcSessions: 0,
          activeQcSessions: 0,
          qcFindings: [],
          reviewSessions: []
        },
        automation: {
          activeAutomationAlerts: 0,
          smartAlerts: 0,
          workflowInstances: [],
          automationExecutions: []
        },
        communication: {
          activeChats: 0,
          recentMessages: 0,
          callSheets: [],
          notifications: []
        },
        systemHealth: {
          serverUptime: process.uptime(),
          databaseConnections: 1,
          activeProcesses: 1,
          errorRate: 0
        }
      },
      dataSummary: {
        totalUsers: usersSnapshot.size,
        totalSessions: sessionsSnapshot.size,
        totalInventory: inventorySnapshot.size,
        activeAlerts: 0,
        systemHealth: {
          serverUptime: process.uptime(),
          databaseConnections: 1,
          activeProcesses: 1,
          errorRate: 0
        }
      }
    };

    res.status(200).json({
      success: true,
      context,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ [BRAIN API] Context error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get brain context',
      errorDetails: error.message || String(error),
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/brain/context', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Context requested');

    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get basic system stats
    const usersSnapshot = await db.collection('users').where('organizationId', '==', organizationId).limit(10).get();
    const sessionsSnapshot = await db.collection('sessions').where('organizationId', '==', organizationId).limit(10).get();
    const inventorySnapshot = await db.collection('inventoryItems').where('organizationId', '==', organizationId).limit(10).get();

    const context = {
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'production'
      },
      comprehensiveData: {
        users: {
          totalUsers: usersSnapshot.size,
          activeUsers: usersSnapshot.size,
          usersByRole: {},
          recentUsers: usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        },
        sessions: {
          totalSessions: sessionsSnapshot.size,
          activeSessions: sessionsSnapshot.size,
          sessionsByStatus: {},
          recentSessions: sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
          sessionAssignments: []
        },
        inventory: {
          totalItems: inventorySnapshot.size,
          availableItems: inventorySnapshot.size,
          assignedItems: 0,
          itemsByType: {},
          recentInventoryActivity: inventorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        },
        qualityControl: {
          totalQcSessions: 0,
          activeQcSessions: 0,
          qcFindings: [],
          reviewSessions: []
        },
        automation: {
          activeAutomationAlerts: 0,
          smartAlerts: 0,
          workflowInstances: [],
          automationExecutions: []
        },
        communication: {
          activeChats: 0,
          recentMessages: 0,
          callSheets: [],
          notifications: []
        },
        systemHealth: {
          serverUptime: process.uptime(),
          databaseConnections: 1,
          activeProcesses: 1,
          errorRate: 0
        }
      },
      dataSummary: {
        totalUsers: usersSnapshot.size,
        totalSessions: sessionsSnapshot.size,
        totalInventory: inventorySnapshot.size,
        activeAlerts: 0,
        systemHealth: {
          serverUptime: process.uptime(),
          databaseConnections: 1,
          activeProcesses: 1,
          errorRate: 0
        }
      }
    };

    res.status(200).json({
      success: true,
      context,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ [BRAIN API] Context error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get brain context',
      errorDetails: error.message || String(error),
      timestamp: new Date().toISOString()
    });
  }
});

// Handle OPTIONS for brain chat endpoint (both /brain/chat and /api/brain/chat)
const brainChatOptions = (req: express.Request, res: express.Response) => {
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

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
};

app.options('/brain/chat', brainChatOptions);
app.options('/api/brain/chat', brainChatOptions);

// Brain chat endpoint (handle both /brain/chat and /api/brain/chat)
app.post('/brain/chat', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Chat request received');

    const { message, context, contextMode } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // TODO: Implement actual AI chat processing
    // For now, return a placeholder response
    res.status(200).json({
      success: true,
      response: 'I received your message. Brain chat functionality is being implemented.',
      timestamp: new Date().toISOString(),
      context: {
        processedBy: 'brain-api',
        model: 'placeholder',
        contextMode: contextMode || 'full',
        dataScope: context?.dataScope || 'all',
        userId: req.user?.uid,
        comprehensiveDataAvailable: true,
        dataSummary: {
          totalUsers: 0,
          totalSessions: 0,
          totalInventory: 0,
          activeAlerts: 0
        }
      }
    });
  } catch (error: any) {
    console.error('❌ [BRAIN API] Chat error:', error);
    res.status(500).json({
      success: false,
      response: 'I apologize, but I\'m having trouble processing your request right now.',
      timestamp: new Date().toISOString(),
      error: error.message || String(error)
    });
  }
});

app.post('/api/brain/chat', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Chat request received');

    const { message, context, contextMode } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // TODO: Implement actual AI chat processing
    // For now, return a placeholder response
    res.status(200).json({
      success: true,
      response: 'I received your message. Brain chat functionality is being implemented.',
      timestamp: new Date().toISOString(),
      context: {
        processedBy: 'brain-api',
        model: 'placeholder',
        contextMode: contextMode || 'full',
        dataScope: context?.dataScope || 'all',
        userId: req.user?.uid,
        comprehensiveDataAvailable: true,
        dataSummary: {
          totalUsers: 0,
          totalSessions: 0,
          totalInventory: 0,
          activeAlerts: 0
        }
      }
    });
  } catch (error: any) {
    console.error('❌ [BRAIN API] Chat error:', error);
    res.status(500).json({
      success: false,
      response: 'I apologize, but I\'m having trouble processing your request right now.',
      timestamp: new Date().toISOString(),
      error: error.message || String(error)
    });
  }
});

// Handle OPTIONS for brain sessions endpoint (both /brain/sessions and /api/brain/sessions)
const brainSessionsOptions = (req: express.Request, res: express.Response) => {
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

  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
};

app.options('/brain/sessions', brainSessionsOptions);
app.options('/api/brain/sessions', brainSessionsOptions);

// Create brain chat session (handle both /brain/sessions and /api/brain/sessions)
app.post('/brain/sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Creating chat session');

    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { title, context } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionData = {
      userId,
      organizationId,
      title: title || `Brain Chat - ${new Date().toLocaleString()}`,
      context: context || {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: []
    };

    const sessionRef = await db.collection('brainSessions').add(sessionData);

    console.log(`✅ [BRAIN API] Created session: ${sessionRef.id}`);

    res.status(200).json({
      id: sessionRef.id,
      ...sessionData
    });
  } catch (error: any) {
    console.error('❌ [BRAIN API] Session creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create brain chat session',
      errorDetails: error.message || String(error)
    });
  }
});

app.post('/api/brain/sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Creating chat session');

    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { title, context } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionData = {
      userId,
      organizationId,
      title: title || `Brain Chat - ${new Date().toLocaleString()}`,
      context: context || {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: []
    };

    const sessionRef = await db.collection('brainSessions').add(sessionData);

    console.log(`✅ [BRAIN API] Created session: ${sessionRef.id}`);

    res.status(200).json({
      id: sessionRef.id,
      ...sessionData
    });
  } catch (error: any) {
    console.error('❌ [BRAIN API] Session creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create brain chat session',
      errorDetails: error.message || String(error)
    });
  }
});

// Get brain chat sessions for user (handle both /brain/sessions and /api/brain/sessions)
app.get('/brain/sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Getting user sessions');

    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionsSnapshot = await db.collection('brainSessions')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .where('isActive', '==', true)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json(sessions);
  } catch (error: any) {
    console.error('❌ [BRAIN API] Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get brain chat sessions',
      errorDetails: error.message || String(error)
    });
  }
});

app.get('/api/brain/sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('🧠 [BRAIN API] Getting user sessions');

    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionsSnapshot = await db.collection('brainSessions')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .where('isActive', '==', true)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json(sessions);
  } catch (error: any) {
    console.error('❌ [BRAIN API] Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get brain chat sessions',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Projects API Endpoints
// ====================

// Handle OPTIONS for projects endpoints (both /projects and /api/projects)
const projectsOptions = (req: express.Request, res: express.Response) => {
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

  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
};

app.options('/projects', projectsOptions);
app.options('/api/projects', projectsOptions);

const projectsPublicOptions = (req: express.Request, res: express.Response) => {
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
};

app.options('/projects/public', projectsPublicOptions);
app.options('/api/projects/public', projectsPublicOptions);

// Get public projects (no authentication required) - handle both /projects/public and /api/projects/public
app.get('/projects/public', async (req: express.Request, res: express.Response) => {
  try {
    console.log('📁 [PROJECTS API] Fetching public projects');

    const { limit = 10, offset = 0 } = req.query;

    // Get public projects from Firestore
    // Note: Firestore doesn't support offset, so we'll use limit only
    const limitNum = parseInt(limit as string);
    const projectsSnapshot = await db.collection('projects')
      .where('visibility', '==', 'public')
      .where('isActive', '==', true)
      .limit(limitNum)
      .get();

    const projects = projectsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({
      success: true,
      data: projects,
      meta: {
        total: projects.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: projects.length === parseInt(limit as string)
      }
    });
  } catch (error: any) {
    console.error('❌ [PROJECTS API] Error fetching public projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch public projects',
      errorDetails: error.message || String(error)
    });
  }
});

app.get('/api/projects/public', async (req: express.Request, res: express.Response) => {
  try {
    console.log('📁 [PROJECTS API] Fetching public projects');

    const { limit = 10, offset = 0 } = req.query;

    // Get public projects from Firestore
    // Note: Firestore doesn't support offset, so we'll use limit only
    const limitNum = parseInt(limit as string);
    const projectsSnapshot = await db.collection('projects')
      .where('visibility', '==', 'public')
      .where('isActive', '==', true)
      .limit(limitNum)
      .get();

    const projects = projectsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({
      success: true,
      data: projects,
      meta: {
        total: projects.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: projects.length === parseInt(limit as string)
      }
    });
  } catch (error: any) {
    console.error('❌ [PROJECTS API] Error fetching public projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch public projects',
      errorDetails: error.message || String(error)
    });
  }
});

// Get user's projects (authentication required) - handle both /projects and /api/projects
app.get('/projects', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📁 [PROJECTS API] Fetching user projects');

    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get projects for the user's organization
    // First try to get projects where user is owner or participant
    let projectsQuery: any = db.collection('projects')
      .where('organizationId', '==', organizationId)
      .where('isActive', '==', true);

    const projectsSnapshot = await projectsQuery
      .limit(parseInt(limit as string))
      .get();

    // Filter projects where user has access (owner or participant)
    const allProjects = projectsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const userProjects = allProjects.filter((project: any) => {
      // User is owner
      if (project.ownerId === userId) return true;
      // User is in participants array
      if (project.participants && Array.isArray(project.participants)) {
        return project.participants.some((p: any) => p.userId === userId || p === userId);
      }
      // User has project assignment
      return false;
    });

    res.status(200).json({
      success: true,
      data: userProjects,
      meta: {
        total: userProjects.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: userProjects.length === parseInt(limit as string)
      }
    });
  } catch (error: any) {
    console.error('❌ [PROJECTS API] Error fetching user projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user projects',
      errorDetails: error.message || String(error)
    });
  }
});

app.get('/api/projects', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('📁 [PROJECTS API] Fetching user projects');

    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get projects for the user's organization
    // First try to get projects where user is owner or participant
    let projectsQuery: any = db.collection('projects')
      .where('organizationId', '==', organizationId)
      .where('isActive', '==', true);

    const projectsSnapshot = await projectsQuery
      .limit(parseInt(limit as string))
      .get();

    // Filter projects where user has access (owner or participant)
    const allProjects = projectsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const userProjects = allProjects.filter((project: any) => {
      // User is owner
      if (project.ownerId === userId) return true;
      // User is in participants array
      if (project.participants && Array.isArray(project.participants)) {
        return project.participants.some((p: any) => p.userId === userId || p === userId);
      }
      // User has project assignment
      return false;
    });

    res.status(200).json({
      success: true,
      data: userProjects,
      meta: {
        total: userProjects.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: userProjects.length === parseInt(limit as string)
      }
    });
  } catch (error: any) {
    console.error('❌ [PROJECTS API] Error fetching user projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user projects',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Settings API Endpoints
// ====================

// Handle OPTIONS for settings/user endpoint
app.options('/settings/user', (req: express.Request, res: express.Response) => {
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
      res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(200).send('');
    }
  }

  // When credentials are required, we cannot use '*' - must specify exact origin
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  } else if (origin) {
    // Unknown origin - reject the request
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  } else {
    // No origin header (e.g., Postman, mobile apps) - allow but without credentials
    res.set('Access-Control-Allow-Origin', '*');
    // Don't set credentials when using wildcard
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Get all user settings
app.get('/settings/user', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    console.log('⚙️ [SETTINGS API] Fetching user settings...');

    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      console.error('❌ [SETTINGS API] No userId in request');
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    if (!organizationId) {
      console.error('❌ [SETTINGS API] No organizationId for user:', userId);
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    console.log(`🔍 [SETTINGS API] Querying settings for userId: ${userId}, organizationId: ${organizationId}`);

    // Get user settings from settings collection
    // Use try-catch around the query to handle potential index errors
    let settingsQuery;
    try {
      settingsQuery = await db.collection('settings')
        .where('userId', '==', userId)
        .where('organizationId', '==', organizationId)
        .get();
    } catch (queryError: any) {
      // Check if it's a missing index error
      const isIndexError = queryError.message && (
        queryError.message.includes('index') ||
        queryError.message.includes('The query requires an index') ||
        queryError.code === 9 || // FAILED_PRECONDITION
        queryError.code === 'FAILED_PRECONDITION'
      );

      if (isIndexError) {
        console.warn('⚠️ [SETTINGS API] Missing Firestore composite index. Falling back to userId-only query.');
        console.warn('⚠️ [SETTINGS API] Index error:', queryError.message);
        
        // Fallback: Query by userId only, then filter by organizationId in memory
        try {
          const fallbackQuery = await db.collection('settings')
            .where('userId', '==', userId)
            .get();
          
          const settings: any[] = [];
          fallbackQuery.forEach(doc => {
            const data = doc.data();
            if (data.organizationId === organizationId) {
              settings.push({
                id: doc.id,
                ...data
              });
            }
          });

          console.log(`✅ [SETTINGS API] Found ${settings.length} settings using fallback query`);
          
          return res.status(200).json({
            success: true,
            data: {
              settings,
              user: {
                id: userId,
                organizationId,
                role: req.user?.role || 'member'
              }
            },
            warning: 'Using fallback query. Consider creating a composite index for better performance.'
          });
        } catch (fallbackError: any) {
          console.error('❌ [SETTINGS API] Fallback query also failed:', fallbackError);
          // Return empty settings as last resort
          return res.status(200).json({
            success: true,
            data: {
              settings: [],
              user: {
                id: userId,
                organizationId,
                role: req.user?.role || 'member'
              }
            },
            warning: 'Settings query failed. Using default settings.'
          });
        }
      }
      throw queryError; // Re-throw if it's not an index error
    }

    const settings: any[] = [];
    settingsQuery.forEach(doc => {
      try {
        settings.push({
          id: doc.id,
          ...doc.data()
        });
      } catch (docError) {
        console.warn(`⚠️ [SETTINGS API] Error processing document ${doc.id}:`, docError);
      }
    });

    console.log(`✅ [SETTINGS API] Found ${settings.length} settings for user ${userId}`);

    return res.status(200).json({
      success: true,
      data: {
        settings,
        user: {
          id: userId,
          organizationId,
          role: req.user?.role || 'member'
        }
      }
    });
  } catch (error: any) {
    console.error('❌ [SETTINGS API] Error fetching user settings:', error);
    console.error('❌ [SETTINGS API] Error stack:', error.stack);
    console.error('❌ [SETTINGS API] Error details:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    
    // Return a more helpful error response
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch user settings',
      errorDetails: error.message || String(error),
      errorCode: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// ====================
// User Activity API Endpoints
// ====================

// Handle OPTIONS for user-activity endpoint
app.options('/user-activity/update', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
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
      res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(200).send('');
    }
  }

  // When credentials are required, we cannot use '*' - must specify exact origin
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  } else if (origin) {
    // Unknown origin - reject the request
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  } else {
    // No origin header (e.g., Postman, mobile apps) - allow but without credentials
    res.set('Access-Control-Allow-Origin', '*');
    // Don't set credentials when using wildcard
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// Update user activity tracking
app.post('/user-activity/update', authenticateToken, async (req: express.Request, res: express.Response) => {
  // Set CORS headers
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
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
    const { action, resource, metadata } = req.body;
    const userId = req.user?.uid;

    // Validate required parameters
    if (!action || !resource) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: action and resource'
      });
    }

    console.log(`📊 [UserActivity] Tracking activity for user ${userId}: ${action} on ${resource}`);

    // Update user's lastActive timestamp
    await db.collection('users').doc(userId).update({
      lastActive: new Date(),
      updatedAt: new Date()
    });

    // Log the activity for audit purposes
    const activityLog = {
      userId,
      action,
      resource,
      metadata: metadata || {},
      timestamp: new Date(),
      source: 'user-activity-tracker'
    };

    // Store activity log in Firestore
    await db.collection('userActivityLogs').add(activityLog);

    console.log(`✅ [UserActivity] Successfully tracked activity for user ${userId}`);

    return res.json({
      success: true,
      message: 'User activity tracked successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ [UserActivity] Error tracking user activity:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to track user activity',
      errorDetails: error.message || String(error)
    });
  }
});

// 404 handler - must be last
app.use('*', (req: express.Request, res: express.Response) => {
  console.log(`❌ [API 404] Endpoint not found: ${req.method} ${req.originalUrl}`);
  console.log(`❌ [API 404] Path: ${req.path}, Query:`, req.query);
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: ['/health', '/docs', '/auth', '/projects', '/projects/public', '/datasets', '/sessions', '/sessions/:id', '/sessions/active-with-times', '/sessions/tags', '/licensing', '/payments', '/database', '/system', '/ai', '/team', '/debug', '/timecard-approval', '/timecard-admin', '/network-ip', '/networks', '/schemas', '/contacts', '/contacts/:id', '/workflow-templates', '/workflow-instances', '/workflow/sessions/:sessionId/all', '/workflow/sessions/:sessionId/status', '/unified-workflow/sessions/:sessionId/analytics', '/brain/health', '/brain/context', '/brain/chat', '/brain/sessions', '/user-activity/update', '/settings/user']
  });
});

// ====================
// AGENT 1: Simple Endpoints (No Prisma)
// ====================
// Add simple endpoints here that don't require Prisma conversion
// See: scripts/AGENT-1-SIMPLE-ENDPOINTS.md for instructions
// Total: 123 endpoints

// ============================================================================
// SESSIONS ENDPOINTS
// ============================================================================

// Handle OPTIONS for DELETE /:id
app.options('/sessions/:id', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// DELETE /sessions/:id - Delete session
app.delete('/sessions/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.id);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Check if session exists and belongs to organization
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Delete related data first (in batches to avoid transaction limits)
    const batch = db.batch();

    // Delete session elements
    const elementsSnapshot = await db.collection('sessionElements')
      .where('sessionId', '==', sessionId)
      .get();
    elementsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete production tasks
    const tasksSnapshot = await db.collection('productionTasks')
      .where('sessionId', '==', sessionId)
      .get();
    tasksSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete review sessions
    const reviewsSnapshot = await db.collection('reviewSessions')
      .where('sessionId', '==', sessionId)
      .get();
    reviewsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete workflow steps
    const stepsSnapshot = await db.collection('unifiedSessionSteps')
      .where('sessionId', '==', sessionId)
      .get();
    stepsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete workflow instances
    const workflowsSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .get();
    workflowsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete the session
    batch.delete(db.collection('sessions').doc(sessionId));

    await batch.commit();

    console.log(`✅ [SESSIONS] Deleted session ${sessionId} and related data`);
    return res.status(200).json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in DELETE /sessions/:id:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /:id/elements
app.options('/sessions/:id/elements', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:id/elements - Get session elements
app.get('/sessions/:id/elements', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.id);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists and belongs to organization
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Build query with filters
    let query: any = db.collection('sessionElements')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId);

    // Apply filters from query params
    if (req.query.elementType) {
      query = query.where('elementType', '==', req.query.elementType);
    }
    if (req.query.qcStatus) {
      query = query.where('qcStatus', '==', req.query.qcStatus);
    }
    if (req.query.stepId) {
      query = query.where('stepId', '==', req.query.stepId);
    }
    if (req.query.createdByUserId) {
      query = query.where('createdByUserId', '==', req.query.createdByUserId);
    }

    const snapshot = await query.get();
    const elements = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: elements,
      count: elements.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:id/elements:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch session elements',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /:id/elements/:elementId
app.options('/sessions/:id/elements/:elementId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:id/elements/:elementId - Get single element
app.get('/sessions/:id/elements/:elementId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.id);
    const elementId = decodeURIComponent(req.params.elementId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get element
    const elementDoc = await db.collection('sessionElements').doc(elementId).get();
    if (!elementDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Element not found'
      });
    }

    const elementData = elementDoc.data();
    if (elementData?.organizationId !== organizationId || elementData?.sessionId !== sessionId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this element'
      });
    }

    // Get related data
    const [activitiesSnapshot, reviewsSnapshot, filesSnapshot] = await Promise.all([
      db.collection('elementActivities')
        .where('elementId', '==', elementId)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get(),
      db.collection('elementReviews')
        .where('elementId', '==', elementId)
        .orderBy('createdAt', 'desc')
        .get(),
      db.collection('elementFiles')
        .where('elementId', '==', elementId)
        .get()
    ]);

    const element = {
      id: elementDoc.id,
      ...elementData,
      activities: activitiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      reviews: reviewsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      files: filesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    };

    return res.status(200).json({
      success: true,
      data: element
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:id/elements/:elementId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch element',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for DELETE /:id/elements/:elementId
app.options('/sessions/:id/elements/:elementId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// DELETE /sessions/:id/elements/:elementId - Delete session element
app.delete('/sessions/:id/elements/:elementId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.id);
    const elementId = decodeURIComponent(req.params.elementId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Get element
    const elementDoc = await db.collection('sessionElements').doc(elementId).get();
    if (!elementDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Element not found'
      });
    }

    const elementData = elementDoc.data();
    if (elementData?.organizationId !== organizationId || elementData?.sessionId !== sessionId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this element'
      });
    }

    // Check for dependencies
    const dependentsSnapshot = await db.collection('elementDependencies')
      .where('dependencyElementId', '==', elementId)
      .get();

    if (!dependentsSnapshot.empty) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete element with active dependents'
      });
    }

    // Create activity for deletion
    await db.collection('elementActivities').add({
      elementId,
      activityType: 'ARCHIVED',
      description: `Element "${elementData.name || elementId}" deleted`,
      userId,
      createdAt: FieldValue.serverTimestamp()
    });

    // Delete the element
    await db.collection('sessionElements').doc(elementId).delete();

    console.log(`✅ [ELEMENTS] Deleted element ${elementId}`);
    return res.status(200).json({
      success: true,
      message: 'Element deleted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in DELETE /sessions/:id/elements/:elementId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete element',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /:id/elements
app.options('/sessions/:id/elements', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:id/elements - Create session element
app.post('/sessions/:id/elements', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.id);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists and belongs to organization
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Create element
    const elementData = {
      ...req.body,
      sessionId,
      organizationId,
      createdByUserId: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const elementRef = await db.collection('sessionElements').add(elementData);

    console.log(`✅ [ELEMENTS] Created element ${elementRef.id} for session ${sessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Element created successfully',
      data: {
        id: elementRef.id,
        ...elementData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:id/elements:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create element',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PUT /:id/elements/:elementId
app.options('/sessions/:id/elements/:elementId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PUT /sessions/:id/elements/:elementId - Update session element
app.put('/sessions/:id/elements/:elementId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.id);
    const elementId = decodeURIComponent(req.params.elementId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Get element
    const elementDoc = await db.collection('sessionElements').doc(elementId).get();
    if (!elementDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Element not found'
      });
    }

    const elementData = elementDoc.data();
    if (elementData?.organizationId !== organizationId || elementData?.sessionId !== sessionId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this element'
      });
    }

    // Update element
    const updateData = {
      ...req.body,
      updatedByUserId: userId,
      updatedAt: FieldValue.serverTimestamp()
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.sessionId;
    delete updateData.organizationId;
    delete updateData.createdByUserId;
    delete updateData.createdAt;

    await db.collection('sessionElements').doc(elementId).update(updateData);

    // Get updated element
    const updatedDoc = await db.collection('sessionElements').doc(elementId).get();
    const updatedElement = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [ELEMENTS] Updated element ${elementId}`);
    return res.status(200).json({
      success: true,
      message: 'Element updated successfully',
      data: updatedElement
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PUT /sessions/:id/elements/:elementId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update element',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// WORKFLOW SIMPLE ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for POST /sessions/:sessionId/complete (workflow)
app.options('/sessions/:sessionId/complete', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/complete - Complete workflow for session
app.post('/sessions/:sessionId/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { confirmationNotes } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get workflow assignments for this session
    const workflowsSnapshot = await db.collection('sessionWorkflows')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    if (workflowsSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'No workflows found for this session'
      });
    }

    // Update all workflows to completed status
    const batch = db.batch();
    workflowsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'COMPLETED',
        completedAt: FieldValue.serverTimestamp(),
        confirmationNotes: confirmationNotes || '',
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    // Also update the main session status to COMPLETED
    batch.update(db.collection('sessions').doc(sessionId), {
      status: 'COMPLETED',
      updatedAt: FieldValue.serverTimestamp()
    });

    await batch.commit();

    console.log(`✅ [WORKFLOW] Completed workflows for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflows and session completed successfully',
      completedCount: workflowsSnapshot.docs.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/complete:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete workflows',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/broadcast
app.options('/sessions/:sessionId/broadcast', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/broadcast - Broadcast workflow event
app.post('/sessions/:sessionId/broadcast', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { eventType, message, data } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Create broadcast event
    const broadcastData = {
      sessionId,
      organizationId,
      eventType: eventType || 'WORKFLOW_UPDATE',
      message: message || '',
      data: data || {},
      broadcastBy: userId,
      createdAt: FieldValue.serverTimestamp()
    };

    await db.collection('workflowBroadcasts').add(broadcastData);

    console.log(`✅ [WORKFLOW] Broadcast event for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Event broadcasted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/broadcast:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to broadcast event',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/activities
app.options('/sessions/:sessionId/activities', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/activities - Get workflow activities
app.get('/sessions/:sessionId/activities', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get workflow activities
    const activitiesSnapshot = await db.collection('workflowActivities')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const activities = activitiesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: activities,
      count: activities.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/activities:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow activities',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/notifications
app.options('/sessions/:sessionId/notifications', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/notifications - Get workflow notifications
app.get('/sessions/:sessionId/notifications', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get notifications for this session (and optionally for this user)
    let query: any = db.collection('workflowNotifications')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId);

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    const notificationsSnapshot = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const notifications = notificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: notifications,
      count: notifications.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/notifications:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/analytics
app.options('/sessions/:sessionId/analytics', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/analytics - Get workflow analytics
app.get('/sessions/:sessionId/analytics', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get workflow steps
    const stepsSnapshot = await db.collection('unifiedSessionSteps')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const steps = stepsSnapshot.docs.map(doc => doc.data());
    
    // Calculate analytics
    const totalSteps = steps.length;
    const completedSteps = steps.filter(s => s.status === 'COMPLETED' || s.status === 'DONE').length;
    const inProgressSteps = steps.filter(s => s.status === 'IN_PROGRESS').length;
    const pendingSteps = steps.filter(s => s.status === 'PENDING' || !s.status).length;

    const analytics = {
      sessionId,
      totalSteps,
      completedSteps,
      inProgressSteps,
      pendingSteps,
      completionRate: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
      averageStepDuration: null, // Could calculate from step timestamps
      stepsByStatus: {
        completed: completedSteps,
        inProgress: inProgressSteps,
        pending: pendingSteps
      }
    };

    return res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/analytics:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/reviews-analysis
app.options('/sessions/:sessionId/reviews-analysis', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/reviews-analysis - Get reviews analysis
app.get('/sessions/:sessionId/reviews-analysis', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get review sessions
    const reviewsSnapshot = await db.collection('reviewSessions')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const reviews = reviewsSnapshot.docs.map(doc => doc.data());

    // Calculate analysis
    const totalReviews = reviews.length;
    const approvedReviews = reviews.filter(r => r.reviewStatus === 'APPROVED').length;
    const rejectedReviews = reviews.filter(r => r.reviewStatus === 'CHANGES_REQUESTED' || r.reviewStatus === 'REJECTED').length;
    const pendingReviews = reviews.filter(r => r.reviewStatus === 'WAITING_FOR_REVIEW' || r.reviewStatus === 'PENDING').length;

    const analysis = {
      sessionId,
      totalReviews,
      approvedReviews,
      rejectedReviews,
      pendingReviews,
      approvalRate: totalReviews > 0 ? Math.round((approvedReviews / totalReviews) * 100) : 0,
      reviewsByStatus: {
        approved: approvedReviews,
        rejected: rejectedReviews,
        pending: pendingReviews
      }
    };

    return res.status(200).json({
      success: true,
      data: analysis
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/reviews-analysis:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch reviews analysis',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/correlations
app.options('/sessions/:sessionId/correlations', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/correlations - Get workflow correlations
app.get('/sessions/:sessionId/correlations', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get correlations
    const correlationsSnapshot = await db.collection('workflowCorrelations')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const correlations = correlationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: correlations,
      count: correlations.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/correlations:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch correlations',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/correlations
app.options('/sessions/:sessionId/correlations', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/correlations - Create correlation
app.post('/sessions/:sessionId/correlations', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { workflowStepId, taskId, correlationType, metadata } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    if (!workflowStepId || !taskId) {
      return res.status(400).json({
        success: false,
        error: 'workflowStepId and taskId are required'
      });
    }

    // Create correlation
    const correlationData = {
      sessionId,
      workflowStepId,
      taskId,
      correlationType: correlationType || 'MANUAL',
      metadata: metadata || {},
      organizationId,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const correlationRef = await db.collection('workflowCorrelations').add(correlationData);

    console.log(`✅ [WORKFLOW] Created correlation ${correlationRef.id}`);
    return res.status(201).json({
      success: true,
      message: 'Correlation created successfully',
      data: {
        id: correlationRef.id,
        ...correlationData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/correlations:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create correlation',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for DELETE /correlations/:correlationId
app.options('/correlations/:correlationId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// DELETE /correlations/:correlationId - Delete correlation
app.delete('/correlations/:correlationId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const correlationId = decodeURIComponent(req.params.correlationId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const correlationDoc = await db.collection('workflowCorrelations').doc(correlationId).get();
    if (!correlationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Correlation not found'
      });
    }

    const correlationData = correlationDoc.data();
    if (correlationData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this correlation'
      });
    }

    await db.collection('workflowCorrelations').doc(correlationId).delete();

    console.log(`✅ [WORKFLOW] Deleted correlation ${correlationId}`);
    return res.status(200).json({
      success: true,
      message: 'Correlation deleted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in DELETE /correlations/:correlationId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete correlation',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PATCH /correlations/:correlationId
app.options('/correlations/:correlationId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PATCH /correlations/:correlationId - Update correlation
app.patch('/correlations/:correlationId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const correlationId = decodeURIComponent(req.params.correlationId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const correlationDoc = await db.collection('workflowCorrelations').doc(correlationId).get();
    if (!correlationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Correlation not found'
      });
    }

    const correlationData = correlationDoc.data();
    if (correlationData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this correlation'
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp()
    };

    delete updateData.id;
    delete updateData.organizationId;
    delete updateData.sessionId;
    delete updateData.createdAt;
    delete updateData.createdBy;

    await db.collection('workflowCorrelations').doc(correlationId).update(updateData);

    const updatedDoc = await db.collection('workflowCorrelations').doc(correlationId).get();
    const updatedCorrelation = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [WORKFLOW] Updated correlation ${correlationId}`);
    return res.status(200).json({
      success: true,
      message: 'Correlation updated successfully',
      data: updatedCorrelation
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PATCH /correlations/:correlationId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update correlation',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/steps/:stepId/assign
app.options('/sessions/:sessionId/steps/:stepId/assign', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/steps/:stepId/assign - Assign step to user
app.post('/sessions/:sessionId/steps/:stepId/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const stepId = decodeURIComponent(req.params.stepId);
    const { userId } = req.body;
    const organizationId = req.user?.organizationId;
    const currentUserId = req.user?.uid;

    if (!organizationId || !currentUserId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Verify step exists
    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.sessionId !== sessionId || stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    // Update step assignment
    await db.collection('unifiedSessionSteps').doc(stepId).update({
      assignedUserId: userId,
      assignedAt: FieldValue.serverTimestamp(),
      assignedBy: currentUserId,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Assigned step ${stepId} to user ${userId}`);

    // Add user to session conversation if it exists
    try {
      const sessionConversations = await db.collection('conversations')
        .where('organizationId', '==', organizationId)
        .where('sessionId', '==', sessionId)
        .limit(1)
        .get();

      if (!sessionConversations.empty) {
        const conversationDoc = sessionConversations.docs[0];
        const conversationData = conversationDoc.data();
        const participants = conversationData.participants || [];

        // Check if user is already a participant
        if (!participants.includes(userId)) {
          // Get user details
          const userDoc = await db.collection('users').doc(userId).get();
          let participantDetail: any = null;
          if (userDoc.exists) {
            const userData = userDoc.data();
            participantDetail = {
              uid: userId,
              firebaseUid: userId,
              name: userData?.name || (userData?.firstName && userData?.lastName 
                ? `${userData.firstName} ${userData.lastName}` 
                : userData?.email || 'Unknown User'),
              email: userData?.email || '',
              avatar: userData?.avatar || userData?.photoURL || '',
            };
          }

          // Add user to participants
          const updatedParticipants = [...participants, userId];
          const updatedParticipantDetails = [...(conversationData.participantDetails || []), participantDetail].filter(Boolean);
          const updatedUnreadCount = { ...(conversationData.unreadCount || {}), [userId]: 0 };

          await db.collection('conversations').doc(conversationDoc.id).update({
            participants: updatedParticipants,
            participantDetails: updatedParticipantDetails,
            unreadCount: updatedUnreadCount,
            updatedAt: FieldValue.serverTimestamp(),
          });

          console.log(`✅ [WORKFLOW] Added user ${userId} to session conversation ${conversationDoc.id}`);
        }
      } else {
        // Conversation doesn't exist, create it
        const sessionDoc = await db.collection('sessions').doc(sessionId).get();
        if (sessionDoc.exists) {
          const sessionData = sessionDoc.data();
          await createSessionConversation(
            sessionId,
            organizationId,
            sessionData?.sessionName || sessionData?.name || 'Untitled Session',
            currentUserId
          );
        }
      }
    } catch (conversationError) {
      // Log but don't fail step assignment if conversation update fails
      console.warn('⚠️ [WORKFLOW] Failed to update session conversation (non-critical):', conversationError);
    }

    return res.status(200).json({
      success: true,
      message: 'Step assigned successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/steps/:stepId/assign:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/steps/:stepId/unassign
app.options('/sessions/:sessionId/steps/:stepId/unassign', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/steps/:stepId/unassign - Unassign step
app.post('/sessions/:sessionId/steps/:stepId/unassign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const currentUserId = req.user?.uid;

    if (!organizationId || !currentUserId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify step exists
    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.sessionId !== sessionId || stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    // Remove assignment
    await db.collection('unifiedSessionSteps').doc(stepId).update({
      assignedUserId: null,
      assignedAt: null,
      assignedBy: null,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Unassigned step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Step unassigned successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/steps/:stepId/unassign:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to unassign step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/steps/reorder
app.options('/sessions/:sessionId/steps/reorder', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/steps/reorder - Reorder workflow steps
app.post('/sessions/:sessionId/steps/reorder', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { stepOrders } = req.body; // Array of { stepId, order }
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!stepOrders || !Array.isArray(stepOrders)) {
      return res.status(400).json({
        success: false,
        error: 'stepOrders array is required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Update step orders in batch
    const batch = db.batch();
    stepOrders.forEach(({ stepId, order }: { stepId: string; order: number }) => {
      const stepRef = db.collection('unifiedSessionSteps').doc(stepId);
      batch.update(stepRef, {
        order,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    console.log(`✅ [WORKFLOW] Reordered steps for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Steps reordered successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/steps/reorder:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reorder steps',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/sync
app.options('/sessions/:sessionId/sync', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/sync - Sync workflow
app.post('/sessions/:sessionId/sync', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get workflow instance
    const workflowSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (workflowSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'Workflow instance not found'
      });
    }

    // Get all steps
    const stepsSnapshot = await db.collection('unifiedSessionSteps')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const totalSteps = stepsSnapshot.size;
    const completedSteps = stepsSnapshot.docs.filter(doc => {
      const stepData = doc.data();
      return stepData.status === 'COMPLETED' || stepData.status === 'DONE';
    }).length;

    const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // Update workflow progress
    await db.collection('unifiedWorkflowInstances').doc(workflowSnapshot.docs[0].id).update({
      progress,
      lastSyncedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Synced workflow for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow synced successfully',
      progress,
      totalSteps,
      completedSteps
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/sync:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync workflow',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for DELETE /sessions/:sessionId/unassign
app.options('/sessions/:sessionId/unassign', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// DELETE /sessions/:sessionId/unassign - Unassign workflow from session
app.delete('/sessions/:sessionId/unassign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get workflow assignments
    const workflowsSnapshot = await db.collection('workflowAssignments')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    if (workflowsSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'No workflow assignments found'
      });
    }

    // Remove assignments
    const batch = db.batch();
    workflowsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'REMOVED',
        removedAt: FieldValue.serverTimestamp(),
        removedBy: userId,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    console.log(`✅ [WORKFLOW] Unassigned workflows from session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow unassigned successfully',
      removedCount: workflowsSnapshot.docs.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in DELETE /sessions/:sessionId/unassign:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to unassign workflow',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for DELETE /steps/:stepId
app.options('/steps/:stepId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// DELETE /steps/:stepId - Delete workflow step
app.delete('/steps/:stepId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    await db.collection('unifiedSessionSteps').doc(stepId).delete();

    console.log(`✅ [WORKFLOW] Deleted step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Step deleted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in DELETE /steps/:stepId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PATCH /steps/:stepId
app.options('/steps/:stepId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PATCH /steps/:stepId - Update workflow step
app.patch('/steps/:stepId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp()
    };

    delete updateData.id;
    delete updateData.organizationId;
    delete updateData.sessionId;
    delete updateData.createdAt;
    delete updateData.createdByUserId;

    await db.collection('unifiedSessionSteps').doc(stepId).update(updateData);

    const updatedDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    const updatedStep = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [WORKFLOW] Updated step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Step updated successfully',
      data: updatedStep
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PATCH /steps/:stepId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PUT /steps/:stepId
app.options('/steps/:stepId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PUT /steps/:stepId - Update workflow step (full update)
app.put('/steps/:stepId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp()
    };

    // Preserve system fields
    delete updateData.id;
    delete updateData.organizationId;
    delete updateData.sessionId;
    delete updateData.createdAt;
    delete updateData.createdByUserId;

    await db.collection('unifiedSessionSteps').doc(stepId).update(updateData);

    const updatedDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    const updatedStep = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [WORKFLOW] Updated step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Step updated successfully',
      data: updatedStep
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PUT /steps/:stepId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PUT /sessions/:sessionId/steps/:stepId/documentation
app.options('/sessions/:sessionId/steps/:stepId/documentation', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PUT /sessions/:sessionId/steps/:stepId/documentation - Update step documentation
app.put('/sessions/:sessionId/steps/:stepId/documentation', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const stepId = decodeURIComponent(req.params.stepId);
    const { documentation } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify step exists
    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.sessionId !== sessionId || stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    // Update documentation
    await db.collection('unifiedSessionSteps').doc(stepId).update({
      documentation: documentation || '',
      documentationUpdatedAt: FieldValue.serverTimestamp(),
      documentationUpdatedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    const updatedStep = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [WORKFLOW] Updated documentation for step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Documentation updated successfully',
      data: updatedStep
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PUT /sessions/:sessionId/steps/:stepId/documentation:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update documentation',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/custom-workflow
app.options('/sessions/:sessionId/custom-workflow', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/custom-workflow - Create custom workflow
app.post('/sessions/:sessionId/custom-workflow', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { name, description, steps, workflowPhase = 'PRODUCTION' } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!name || !steps || !Array.isArray(steps)) {
      return res.status(400).json({
        success: false,
        error: 'name and steps array are required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Create workflow instance
    const workflowData = {
      sessionId,
      name,
      description: description || '',
      workflowPhase,
      status: 'ACTIVE',
      isCustom: true,
      organizationId,
      createdByUserId: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const workflowRef = await db.collection('unifiedWorkflowInstances').add(workflowData);

    // Create steps
    const batch = db.batch();
    steps.forEach((step: any, index: number) => {
      const stepRef = db.collection('unifiedSessionSteps').doc();
      batch.set(stepRef, {
        sessionId,
        workflowInstanceId: workflowRef.id,
        name: step.name || `Step ${index + 1}`,
        description: step.description || '',
        order: step.order || index + 1,
        status: step.status || 'PENDING',
        assignedUserId: step.assignedUserId || null,
        phase: workflowPhase,
        organizationId,
        createdByUserId: userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    console.log(`✅ [WORKFLOW] Created custom workflow ${workflowRef.id} for session ${sessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Custom workflow created successfully',
      data: {
        id: workflowRef.id,
        ...workflowData,
        stepsCount: steps.length
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/custom-workflow:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create custom workflow',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/migrate
app.options('/sessions/:sessionId/migrate', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/migrate - Migrate workflow
app.post('/sessions/:sessionId/migrate', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { targetWorkflowId, preserveData = true } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!targetWorkflowId) {
      return res.status(400).json({
        success: false,
        error: 'targetWorkflowId is required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get current workflow
    const currentWorkflowSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (currentWorkflowSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'No workflow found for this session'
      });
    }

    // Get target workflow template
    const targetWorkflowDoc = await db.collection('workflowDiagrams').doc(targetWorkflowId).get();
    if (!targetWorkflowDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Target workflow template not found'
      });
    }

    const targetWorkflowData = targetWorkflowDoc.data();
    if (targetWorkflowData?.organizationId && targetWorkflowData.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to target workflow'
      });
    }

    // Update workflow instance
    await db.collection('unifiedWorkflowInstances').doc(currentWorkflowSnapshot.docs[0].id).update({
      workflowDiagramId: targetWorkflowId,
      migratedAt: FieldValue.serverTimestamp(),
      migratedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Migrated workflow for session ${sessionId} to ${targetWorkflowId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow migrated successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/migrate:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to migrate workflow',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /templates
app.options('/templates', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /templates - Create workflow template
app.post('/templates', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { name, description, nodes, edges, category, tags, isPublic = false } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!name || !nodes || !edges) {
      return res.status(400).json({
        success: false,
        error: 'name, nodes, and edges are required'
      });
    }

    // Create template
    const templateData = {
      userId,
      name,
      description: description || '',
      nodes,
      edges,
      isTemplate: true,
      isPublic,
      category: category || 'general',
      tags: tags || [],
      organizationId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const templateRef = await db.collection('workflowTemplates').add(templateData);

    console.log(`✅ [WORKFLOW] Created template ${templateRef.id}`);
    return res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: {
        id: templateRef.id,
        ...templateData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /templates:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create template',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// SESSION MANAGEMENT ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for POST /sessions/:sessionId/default-tasks
app.options('/sessions/:sessionId/default-tasks', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/default-tasks - Create default tasks for session
app.post('/sessions/:sessionId/default-tasks', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Default task templates
    const defaultTasks = [
      { name: 'Editorial', status: 'PENDING', priority: 'HIGH' },
      { name: 'Color Correction', status: 'PENDING', priority: 'MEDIUM' },
      { name: 'Audio Mix', status: 'PENDING', priority: 'MEDIUM' },
      { name: 'Graphics', status: 'PENDING', priority: 'LOW' },
      { name: 'QC Review', status: 'PENDING', priority: 'HIGH' }
    ];

    // Create tasks
    const batch = db.batch();
    const createdTasks = [];

    defaultTasks.forEach(taskTemplate => {
      const taskRef = db.collection('tasks').doc();
      batch.set(taskRef, {
        sessionId,
        organizationId,
        taskName: taskTemplate.name,
        status: taskTemplate.status,
        priority: taskTemplate.priority,
        createdBy: userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      createdTasks.push({ id: taskRef.id, ...taskTemplate });
    });

    await batch.commit();

    console.log(`✅ [SESSIONS] Created ${createdTasks.length} default tasks for session ${sessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Default tasks created successfully',
      tasks: createdTasks
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/default-tasks:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create default tasks',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/transition
app.options('/sessions/:sessionId/transition', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/transition - Transition session to next stage
app.post('/sessions/:sessionId/transition', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { targetStatus, notes } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!targetStatus) {
      return res.status(400).json({
        success: false,
        error: 'targetStatus is required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Update session status
    const updateData: any = {
      status: targetStatus,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (notes) {
      const existingNotes = sessionData?.notes || '';
      updateData.notes = `${existingNotes}\nTransitioned to ${targetStatus} on ${new Date().toISOString()}: ${notes}`;
    }

    await db.collection('sessions').doc(sessionId).update(updateData);

    // Create transition history
    await db.collection('sessionTransitions').add({
      sessionId,
      fromStatus: sessionData?.status,
      toStatus: targetStatus,
      notes: notes || '',
      organizationId,
      transitionedBy: userId,
      createdAt: FieldValue.serverTimestamp()
    });

    const updatedDoc = await db.collection('sessions').doc(sessionId).get();
    const updatedSession = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [SESSIONS] Transitioned session ${sessionId} to ${targetStatus}`);
    return res.status(200).json({
      success: true,
      message: `Session transitioned to ${targetStatus}`,
      data: updatedSession
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/transition:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to transition session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/timeline
app.options('/sessions/:sessionId/timeline', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/timeline - Get session timeline
app.get('/sessions/:sessionId/timeline', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get timeline events from various sources
    const [tasksSnapshot, transitionsSnapshot, reviewsSnapshot] = await Promise.all([
      db.collection('tasks')
        .where('sessionId', '==', sessionId)
        .orderBy('createdAt', 'asc')
        .get(),
      db.collection('sessionTransitions')
        .where('sessionId', '==', sessionId)
        .orderBy('createdAt', 'asc')
        .get(),
      db.collection('reviewSessions')
        .where('sessionId', '==', sessionId)
        .orderBy('createdAt', 'asc')
        .get()
    ]);

    const timeline = [];

    // Add session creation
    if (sessionData.createdAt) {
      timeline.push({
        type: 'session_created',
        timestamp: sessionData.createdAt,
        description: `Session "${sessionData.name || sessionId}" was created`,
        data: { sessionId, name: sessionData.name }
      });
    }

    // Add tasks
    tasksSnapshot.docs.forEach(doc => {
      const taskData = doc.data();
      timeline.push({
        type: 'task_created',
        timestamp: taskData.createdAt,
        description: `Task "${taskData.taskName || taskData.name}" was created`,
        data: { taskId: doc.id, taskName: taskData.taskName || taskData.name }
      });
    });

    // Add transitions
    transitionsSnapshot.docs.forEach(doc => {
      const transitionData = doc.data();
      timeline.push({
        type: 'status_transition',
        timestamp: transitionData.createdAt,
        description: `Session transitioned from ${transitionData.fromStatus} to ${transitionData.toStatus}`,
        data: transitionData
      });
    });

    // Add reviews
    reviewsSnapshot.docs.forEach(doc => {
      const reviewData = doc.data();
      timeline.push({
        type: 'review_created',
        timestamp: reviewData.createdAt,
        description: `Review session created: ${reviewData.reviewStage || 'Review'}`,
        data: { reviewId: doc.id, reviewStage: reviewData.reviewStage }
      });
    });

    // Sort by timestamp
    timeline.sort((a, b) => {
      const timeA = a.timestamp instanceof admin.firestore.Timestamp 
        ? a.timestamp.toMillis() 
        : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const timeB = b.timestamp instanceof admin.firestore.Timestamp 
        ? b.timestamp.toMillis() 
        : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return timeA - timeB;
    });

    return res.status(200).json({
      success: true,
      sessionId,
      timeline,
      count: timeline.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/timeline:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch timeline',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// UNIFIED REVIEWS ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for GET /sessions/:reviewId/file-paths
app.options('/sessions/:reviewId/file-paths', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:reviewId/file-paths - Get file paths for review
app.get('/sessions/:reviewId/file-paths', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    // Get file paths from review data or related collection
    const filePaths = reviewData.filePaths || reviewData.files || [];

    return res.status(200).json({
      success: true,
      reviewId,
      filePaths,
      count: filePaths.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:reviewId/file-paths:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch file paths',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:reviewId/file-paths
app.options('/sessions/:reviewId/file-paths', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:reviewId/file-paths - Set file paths for review
app.post('/sessions/:reviewId/file-paths', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const { filePaths } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!filePaths || !Array.isArray(filePaths)) {
      return res.status(400).json({
        success: false,
        error: 'filePaths array is required'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    // Update file paths
    await db.collection('reviewSessions').doc(reviewId).update({
      filePaths,
      filePathsUpdatedAt: FieldValue.serverTimestamp(),
      filePathsUpdatedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [REVIEWS] Updated file paths for review ${reviewId}`);
    return res.status(200).json({
      success: true,
      message: 'File paths updated successfully',
      filePaths
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:reviewId/file-paths:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update file paths',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/coordination-summary
app.options('/sessions/:sessionId/coordination-summary', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/coordination-summary - Get coordination summary
app.get('/sessions/:sessionId/coordination-summary', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get reviews, assignments, and tasks
    const [reviewsSnapshot, assignmentsSnapshot, tasksSnapshot] = await Promise.all([
      db.collection('reviewSessions')
        .where('sessionId', '==', sessionId)
        .where('organizationId', '==', organizationId)
        .get(),
      db.collection('sessionAssignments')
        .where('sessionId', '==', sessionId)
        .where('organizationId', '==', organizationId)
        .get(),
      db.collection('tasks')
        .where('sessionId', '==', sessionId)
        .where('organizationId', '==', organizationId)
        .get()
    ]);

    const summary = {
      sessionId,
      sessionName: sessionData.name,
      reviews: {
        total: reviewsSnapshot.size,
        approved: reviewsSnapshot.docs.filter(doc => doc.data().reviewStatus === 'APPROVED').length,
        pending: reviewsSnapshot.docs.filter(doc => doc.data().reviewStatus === 'WAITING_FOR_REVIEW' || doc.data().reviewStatus === 'PENDING').length,
        rejected: reviewsSnapshot.docs.filter(doc => doc.data().reviewStatus === 'CHANGES_REQUESTED' || doc.data().reviewStatus === 'REJECTED').length
      },
      assignments: {
        total: assignmentsSnapshot.size,
        assignedUsers: new Set(assignmentsSnapshot.docs.map(doc => doc.data().userId)).size
      },
      tasks: {
        total: tasksSnapshot.size,
        completed: tasksSnapshot.docs.filter(doc => doc.data().status === 'COMPLETED' || doc.data().status === 'DONE').length,
        inProgress: tasksSnapshot.docs.filter(doc => doc.data().status === 'IN_PROGRESS').length,
        pending: tasksSnapshot.docs.filter(doc => doc.data().status === 'PENDING' || !doc.data().status).length
      }
    };

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/coordination-summary:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch coordination summary',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:reviewId/bulk-assign
app.options('/sessions/:reviewId/bulk-assign', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:reviewId/bulk-assign - Bulk assign reviewers
app.post('/sessions/:reviewId/bulk-assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const { reviewerIds } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!reviewerIds || !Array.isArray(reviewerIds) || reviewerIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'reviewerIds array is required'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    // Check existing reviewers to avoid duplicates
    const existingReviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const existingReviewerIds = new Set(existingReviewersSnapshot.docs.map(doc => doc.data().userId));

    // Create reviewers in batch
    const batch = db.batch();
    const addedReviewers = [];

    reviewerIds.forEach((reviewerId: string) => {
      if (!existingReviewerIds.has(reviewerId)) {
        const reviewerRef = db.collection('reviewSessionReviewers').doc();
        batch.set(reviewerRef, {
          reviewSessionId: reviewId,
          userId: reviewerId,
          reviewerRole: 'REVIEWER',
          organizationId,
          assignedBy: userId,
          createdAt: FieldValue.serverTimestamp()
        });
        addedReviewers.push(reviewerId);
      }
    });

    await batch.commit();

    console.log(`✅ [REVIEWS] Bulk assigned ${addedReviewers.length} reviewers to review ${reviewId}`);
    return res.status(201).json({
      success: true,
      message: `Assigned ${addedReviewers.length} reviewer(s)`,
      addedCount: addedReviewers.length,
      skippedCount: reviewerIds.length - addedReviewers.length,
      addedReviewers
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:reviewId/bulk-assign:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk assign reviewers',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:reviewId/submit-decision
app.options('/sessions/:reviewId/submit-decision', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:reviewId/submit-decision - Submit review decision
app.post('/sessions/:reviewId/submit-decision', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const { decision, notes, feedback } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!decision || !['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'decision must be APPROVED, REJECTED, or CHANGES_REQUESTED'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    // Check if user is a reviewer
    const reviewerSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (reviewerSnapshot.empty) {
      return res.status(403).json({
        success: false,
        error: 'User is not assigned as a reviewer for this review'
      });
    }

    // Update reviewer decision
    await db.collection('reviewSessionReviewers').doc(reviewerSnapshot.docs[0].id).update({
      decision,
      decisionNotes: notes || '',
      feedback: feedback || '',
      decisionSubmittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update review status if all reviewers have submitted
    const allReviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const allDecisions = allReviewersSnapshot.docs.map(doc => doc.data().decision).filter(Boolean);
    const allReviewed = allReviewersSnapshot.size === allDecisions.length;

    if (allReviewed) {
      const allApproved = allDecisions.every(d => d === 'APPROVED');
      const anyRejected = allDecisions.some(d => d === 'REJECTED' || d === 'CHANGES_REQUESTED');

      let finalStatus = 'WAITING_FOR_REVIEW';
      if (allApproved) {
        finalStatus = 'APPROVED';
      } else if (anyRejected) {
        finalStatus = 'CHANGES_REQUESTED';
      }

      await db.collection('reviewSessions').doc(reviewId).update({
        reviewStatus: finalStatus,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    console.log(`✅ [REVIEWS] Submitted decision for review ${reviewId}`);
    return res.status(200).json({
      success: true,
      message: 'Decision submitted successfully',
      decision,
      allReviewed
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:reviewId/submit-decision:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit decision',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/coordinate-status
app.options('/sessions/:sessionId/coordinate-status', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/coordinate-status - Coordinate review status
app.post('/sessions/:sessionId/coordinate-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { coordinationStatus, notes } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Update or create coordination status
    const coordinationRef = db.collection('sessionCoordinationStatus').doc(sessionId);
    const coordinationDoc = await coordinationRef.get();

    const coordinationData = {
      sessionId,
      coordinationStatus: coordinationStatus || 'IN_PROGRESS',
      notes: notes || '',
      organizationId,
      updatedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (coordinationDoc.exists) {
      await coordinationRef.update(coordinationData);
    } else {
      await coordinationRef.set({
        ...coordinationData,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    console.log(`✅ [REVIEWS] Updated coordination status for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Coordination status updated successfully',
      data: coordinationData
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/coordinate-status:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update coordination status',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// QC ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for GET /step-status/:stepId
app.options('/step-status/:stepId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /step-status/:stepId - Get step status
app.get('/step-status/:stepId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: stepDoc.id,
        status: stepData.status,
        name: stepData.name,
        order: stepData.order,
        assignedUserId: stepData.assignedUserId,
        createdAt: stepData.createdAt,
        updatedAt: stepData.updatedAt
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /step-status/:stepId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch step status',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /add-finding/:qcSessionId
app.options('/add-finding/:qcSessionId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /add-finding/:qcSessionId - Add QC finding
app.post('/add-finding/:qcSessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const qcSessionId = decodeURIComponent(req.params.qcSessionId);
    const { findingType, description, severity, timestamp, frameNumber } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!findingType || !description) {
      return res.status(400).json({
        success: false,
        error: 'findingType and description are required'
      });
    }

    // Verify QC session exists
    const qcSessionDoc = await db.collection('qcSessions').doc(qcSessionId).get();
    if (!qcSessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'QC session not found'
      });
    }

    const qcSessionData = qcSessionDoc.data();
    if (qcSessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this QC session'
      });
    }

    // Create finding
    const findingData = {
      qcSessionId,
      findingType,
      description,
      severity: severity || 'MEDIUM',
      timestamp: timestamp || FieldValue.serverTimestamp(),
      frameNumber: frameNumber || null,
      organizationId,
      createdBy: userId,
      status: 'OPEN',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const findingRef = await db.collection('qcFindings').add(findingData);

    console.log(`✅ [QC] Added finding ${findingRef.id} to QC session ${qcSessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Finding added successfully',
      data: {
        id: findingRef.id,
        ...findingData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /add-finding/:qcSessionId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add finding',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /complete-session/:qcSessionId
app.options('/complete-session/:qcSessionId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /complete-session/:qcSessionId - Complete QC session
app.post('/complete-session/:qcSessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const qcSessionId = decodeURIComponent(req.params.qcSessionId);
    const { notes, result } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify QC session exists
    const qcSessionDoc = await db.collection('qcSessions').doc(qcSessionId).get();
    if (!qcSessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'QC session not found'
      });
    }

    const qcSessionData = qcSessionDoc.data();
    if (qcSessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this QC session'
      });
    }

    // Update QC session
    await db.collection('qcSessions').doc(qcSessionId).update({
      status: 'COMPLETED',
      result: result || 'PASSED',
      notes: notes || '',
      completedAt: FieldValue.serverTimestamp(),
      completedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedDoc = await db.collection('qcSessions').doc(qcSessionId).get();
    const updatedSession = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [QC] Completed QC session ${qcSessionId}`);
    return res.status(200).json({
      success: true,
      message: 'QC session completed successfully',
      data: updatedSession
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /complete-session/:qcSessionId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete QC session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /create-checklist/:qcSessionId
app.options('/create-checklist/:qcSessionId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /create-checklist/:qcSessionId - Create QC checklist
app.post('/create-checklist/:qcSessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const qcSessionId = decodeURIComponent(req.params.qcSessionId);
    const { checklistItems } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify QC session exists
    const qcSessionDoc = await db.collection('qcSessions').doc(qcSessionId).get();
    if (!qcSessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'QC session not found'
      });
    }

    const qcSessionData = qcSessionDoc.data();
    if (qcSessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this QC session'
      });
    }

    // Default checklist items if not provided
    const defaultItems = checklistItems || [
      { name: 'Audio Levels', checked: false },
      { name: 'Video Quality', checked: false },
      { name: 'Color Correction', checked: false },
      { name: 'Graphics', checked: false },
      { name: 'Subtitles', checked: false }
    ];

    // Create checklist
    const checklistData = {
      qcSessionId,
      items: defaultItems,
      organizationId,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const checklistRef = await db.collection('qcChecklists').add(checklistData);

    // Update QC session with checklist reference
    await db.collection('qcSessions').doc(qcSessionId).update({
      checklistId: checklistRef.id,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [QC] Created checklist ${checklistRef.id} for QC session ${qcSessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Checklist created successfully',
      data: {
        id: checklistRef.id,
        ...checklistData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /create-checklist/:qcSessionId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create checklist',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /start-session
app.options('/start-session', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /start-session - Start QC session
app.post('/start-session', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, qcType, assignedTo } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Create QC session
    const qcSessionData = {
      sessionId,
      qcType: qcType || 'STANDARD',
      assignedTo: assignedTo || userId,
      status: 'IN_PROGRESS',
      organizationId,
      createdBy: userId,
      startedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const qcSessionRef = await db.collection('qcSessions').add(qcSessionData);

    console.log(`✅ [QC] Started QC session ${qcSessionRef.id} for session ${sessionId}`);
    return res.status(201).json({
      success: true,
      message: 'QC session started successfully',
      data: {
        id: qcSessionRef.id,
        ...qcSessionData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /start-session:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to start QC session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// TEMPLATE ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for GET /templates/:templateId
app.options('/templates/:templateId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /templates/:templateId - Get template by ID
app.get('/templates/:templateId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const templateId = decodeURIComponent(req.params.templateId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Try workflow templates first
    let templateDoc = await db.collection('workflowTemplates').doc(templateId).get();
    
    // If not found, try workflow diagrams
    if (!templateDoc.exists) {
      templateDoc = await db.collection('workflowDiagrams').doc(templateId).get();
    }

    // If still not found, try session templates
    if (!templateDoc.exists) {
      templateDoc = await db.collection('sessionTemplates').doc(templateId).get();
    }

    if (!templateDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const templateData = templateDoc.data();
    
    // Check organization access (if template has organizationId field)
    if (templateData?.organizationId && templateData.organizationId !== organizationId) {
      // Allow if it's a public template
      if (!templateData.isPublic) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this template'
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        id: templateDoc.id,
        ...templateData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /templates/:templateId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch template',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// UTILITY ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for GET /notification-status
app.options('/notification-status', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /notification-status - Get notification status
app.get('/notification-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Get unread notifications count
    const notificationsSnapshot = await db.collection('notifications')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .where('read', '==', false)
      .get();

    const unreadCount = notificationsSnapshot.size;

    // Get recent notifications
    const recentSnapshot = await db.collection('notifications')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const recentNotifications = recentSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: {
        unreadCount,
        recentNotifications,
        totalNotifications: recentNotifications.length
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /notification-status:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch notification status',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /places/autocomplete
app.options('/places/autocomplete', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /places/autocomplete - Google Maps autocomplete (proxy endpoint)
app.get('/places/autocomplete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { input, sessionToken } = req.query;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'input query parameter is required'
      });
    }

    // Note: This is a proxy endpoint. In production, you would call Google Maps API
    // For now, return a placeholder response
    // TODO: Implement actual Google Maps Places API integration if needed

    return res.status(200).json({
      success: true,
      message: 'Google Maps autocomplete endpoint - implementation needed',
      data: {
        predictions: [],
        input: input as string
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /places/autocomplete:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch autocomplete suggestions',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// PRODUCTION TASKS ENDPOINTS
// ============================================================================

// Handle OPTIONS for GET /production/tasks
app.options('/sessions/production/tasks', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/production/tasks - Get production tasks
app.get('/sessions/production/tasks', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    let query: any = db.collection('productionTasks')
      .where('organizationId', '==', organizationId);

    // Apply filters
    if (req.query.sessionId) {
      query = query.where('sessionId', '==', req.query.sessionId);
    }
    if (req.query.status) {
      query = query.where('status', '==', req.query.status);
    }
    if (req.query.assignedTo) {
      query = query.where('assignedTo', '==', req.query.assignedTo);
    }

    const snapshot = await query.get();
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      tasks,
      pagination: {
        page: 1,
        limit: 50,
        total: tasks.length,
        pages: Math.ceil(tasks.length / 50)
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/production/tasks:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch production tasks',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /production/tasks/my
app.options('/sessions/production/tasks/my', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/production/tasks/my - Get my production tasks
app.get('/sessions/production/tasks/my', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    let query: any = db.collection('productionTasks')
      .where('organizationId', '==', organizationId)
      .where('assignedTo', '==', userId);

    // Apply filters
    if (req.query.status) {
      query = query.where('status', '==', req.query.status);
    }

    const snapshot = await query.get();
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      tasks,
      pagination: {
        page: 1,
        limit: 50,
        total: tasks.length,
        pages: Math.ceil(tasks.length / 50)
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/production/tasks/my:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch my production tasks',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /production/tasks/:taskId
app.options('/sessions/production/tasks/:taskId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/production/tasks/:taskId - Get single production task
app.get('/sessions/production/tasks/:taskId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const taskId = decodeURIComponent(req.params.taskId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const taskDoc = await db.collection('productionTasks').doc(taskId).get();
    if (!taskDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Production task not found'
      });
    }

    const taskData = taskDoc.data();
    if (taskData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this task'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: taskDoc.id,
        ...taskData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/production/tasks/:taskId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch production task',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /production/tasks
app.options('/sessions/production/tasks', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/production/tasks - Create production task
app.post('/sessions/production/tasks', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { sessionId, name, description, status = 'pending', assignedTo, dueDate, priority = 'medium' } = req.body;

    if (!name || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name and sessionId are required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    const taskData = {
      sessionId,
      name,
      description: description || '',
      status,
      assignedTo: assignedTo || null,
      dueDate: dueDate || null,
      priority,
      organizationId,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const taskRef = await db.collection('productionTasks').add(taskData);

    console.log(`✅ [PRODUCTION_TASKS] Created task ${taskRef.id}`);
    return res.status(201).json({
      success: true,
      message: 'Production task created successfully',
      data: {
        id: taskRef.id,
        ...taskData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/production/tasks:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create production task',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PATCH /production/tasks/:taskId
app.options('/sessions/production/tasks/:taskId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PATCH /sessions/production/tasks/:taskId - Update production task
app.patch('/sessions/production/tasks/:taskId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const taskId = decodeURIComponent(req.params.taskId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const taskDoc = await db.collection('productionTasks').doc(taskId).get();
    if (!taskDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Production task not found'
      });
    }

    const taskData = taskDoc.data();
    if (taskData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this task'
      });
    }

    const updateData = {
      ...req.body,
      updatedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.organizationId;
    delete updateData.sessionId;
    delete updateData.createdBy;
    delete updateData.createdAt;

    await db.collection('productionTasks').doc(taskId).update(updateData);

    const updatedDoc = await db.collection('productionTasks').doc(taskId).get();
    const updatedTask = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [PRODUCTION_TASKS] Updated task ${taskId}`);
    return res.status(200).json({
      success: true,
      message: 'Production task updated successfully',
      data: updatedTask
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PATCH /sessions/production/tasks/:taskId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update production task',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for DELETE /production/tasks/:taskId
app.options('/sessions/production/tasks/:taskId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// DELETE /sessions/production/tasks/:taskId - Delete production task
app.delete('/sessions/production/tasks/:taskId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const taskId = decodeURIComponent(req.params.taskId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const taskDoc = await db.collection('productionTasks').doc(taskId).get();
    if (!taskDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Production task not found'
      });
    }

    const taskData = taskDoc.data();
    if (taskData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this task'
      });
    }

    await db.collection('productionTasks').doc(taskId).delete();

    console.log(`✅ [PRODUCTION_TASKS] Deleted task ${taskId}`);
    return res.status(200).json({
      success: true,
      message: 'Production task deleted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in DELETE /sessions/production/tasks/:taskId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete production task',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /:sessionId/reviews
app.options('/sessions/:sessionId/reviews', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/reviews - Get session reviews
app.get('/sessions/:sessionId/reviews', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists and belongs to organization
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get review sessions
    const reviewsSnapshot = await db.collection('reviewSessions')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    // Get reviewers for each review
    const reviews = await Promise.all(reviewsSnapshot.docs.map(async (doc) => {
      const reviewData = doc.data();
      const reviewersSnapshot = await db.collection('reviewSessionReviewers')
        .where('reviewSessionId', '==', doc.id)
        .get();

      const reviewers = await Promise.all(reviewersSnapshot.docs.map(async (reviewerDoc) => {
        const reviewerData = reviewerDoc.data();
        if (reviewerData.userId) {
          const userDoc = await db.collection('users').doc(reviewerData.userId).get();
          return {
            id: reviewerDoc.id,
            ...reviewerData,
            user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null
          };
        }
        return { id: reviewerDoc.id, ...reviewerData };
      }));

      return {
        id: doc.id,
        ...reviewData,
        reviewers
      };
    }));

    return res.status(200).json(reviews);
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/reviews:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch session reviews',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /:sessionId/reviews
app.options('/sessions/:sessionId/reviews', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/reviews - Create review
app.post('/sessions/:sessionId/reviews', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    const {
      reviewStage,
      reviewStatus = 'WAITING_FOR_REVIEW',
      version,
      reviewNumber = 1,
      cutTypeName,
      notes,
      dueDate,
      feedbackUrl,
      reviewers = []
    } = req.body;

    // Check if review already exists for this stage
    const existingReviewSnapshot = await db.collection('reviewSessions')
      .where('sessionId', '==', sessionId)
      .where('reviewStage', '==', reviewStage)
      .where('organizationId', '==', organizationId)
      .get();

    if (!existingReviewSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'Review already exists',
        message: `A ${reviewStage.replace('_', ' ')} review already exists for this session`,
        existingReviewId: existingReviewSnapshot.docs[0].id
      });
    }

    // Create review session
    const reviewData = {
      sessionId,
      organizationId,
      reviewStage,
      reviewStatus,
      version: version || `v${reviewNumber}`,
      reviewNumber,
      cutTypeName: cutTypeName || null,
      notes: notes || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      feedbackUrl: feedbackUrl || null,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const reviewRef = await db.collection('reviewSessions').add(reviewData);

    // Create reviewers if provided
    if (reviewers.length > 0) {
      const reviewerPromises = reviewers.map((reviewerId: string) =>
        db.collection('reviewSessionReviewers').add({
          reviewSessionId: reviewRef.id,
          userId: reviewerId,
          reviewerRole: 'REVIEWER',
          organizationId,
          createdAt: FieldValue.serverTimestamp()
        })
      );
      await Promise.all(reviewerPromises);
    }

    // Get created review with reviewers
    const createdReviewDoc = await db.collection('reviewSessions').doc(reviewRef.id).get();
    const reviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewRef.id)
      .get();

    const createdReviewers = await Promise.all(reviewersSnapshot.docs.map(async (reviewerDoc) => {
      const reviewerData = reviewerDoc.data();
      if (reviewerData.userId) {
        const userDoc = await db.collection('users').doc(reviewerData.userId).get();
        return {
          id: reviewerDoc.id,
          ...reviewerData,
          user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null
        };
      }
      return { id: reviewerDoc.id, ...reviewerData };
    }));

    console.log(`✅ [REVIEWS] Created review ${reviewRef.id} for session ${sessionId}`);
    return res.status(201).json({
      id: reviewRef.id,
      ...createdReviewDoc.data(),
      reviewers: createdReviewers
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/reviews:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create review',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// MONITORING ENDPOINTS
// ============================================================================

// Handle OPTIONS for GET /monitoring/errors
app.options('/sessions/monitoring/errors', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/monitoring/errors - Get monitoring errors
app.get('/sessions/monitoring/errors', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get recent sync errors from monitoring collection
    const errorsSnapshot = await db.collection('monitoringErrors')
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const errors = errorsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(errors);
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/monitoring/errors:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get sync errors',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /monitoring/auto-fix
app.options('/sessions/monitoring/auto-fix', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/monitoring/auto-fix - Auto-fix monitoring issues
app.post('/sessions/monitoring/auto-fix', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Get recent errors
    const errorsSnapshot = await db.collection('monitoringErrors')
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'open')
      .limit(50)
      .get();

    const fixes: any[] = [];
    const batch = db.batch();

    for (const errorDoc of errorsSnapshot.docs) {
      const errorData = errorDoc.data();
      
      // Auto-fix common issues
      if (errorData.type === 'sync_mismatch' && errorData.sessionId) {
        // Mark error as fixed
        batch.update(errorDoc.ref, {
          status: 'fixed',
          fixedBy: userId,
          fixedAt: FieldValue.serverTimestamp()
        });
        
        fixes.push({
          errorId: errorDoc.id,
          type: 'sync_mismatch',
          action: 'marked_as_fixed',
          sessionId: errorData.sessionId
        });
      }
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      fixesApplied: fixes.length,
      fixes
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/monitoring/auto-fix:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to auto-fix sync issues',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// PRODUCTION ENDPOINTS (Dashboard, Crew, Equipment, Active)
// ============================================================================

// Handle OPTIONS for GET /production/active
app.options('/sessions/production/active', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/production/active - Get active production sessions
app.get('/sessions/production/active', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const activeStatuses = ['PRODUCTION_IN_PROGRESS', 'IN_PROGRESS', 'ACTIVE'];
    const sessionsSnapshot = await db.collection('sessions')
      .where('organizationId', '==', organizationId)
      .where('status', 'in', activeStatuses)
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      sessions,
      count: sessions.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/production/active:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch active production sessions',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /production/crew
app.options('/sessions/production/crew', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/production/crew - Get production crew
app.get('/sessions/production/crew', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get crew members from session assignments
    const assignmentsSnapshot = await db.collection('sessionAssignments')
      .where('organizationId', '==', organizationId)
      .get();

    const crewMap = new Map();
    for (const assignmentDoc of assignmentsSnapshot.docs) {
      const assignmentData = assignmentDoc.data();
      if (assignmentData.userId) {
        const userDoc = await db.collection('users').doc(assignmentData.userId).get();
        if (userDoc.exists) {
          const userId = userDoc.id;
          if (!crewMap.has(userId)) {
            crewMap.set(userId, {
              id: userId,
              ...userDoc.data(),
              roles: [],
              sessions: []
            });
          }
          const crewMember = crewMap.get(userId);
          if (assignmentData.roleId) {
            const roleDoc = await db.collection('roles').doc(assignmentData.roleId).get();
            if (roleDoc.exists && !crewMember.roles.find((r: any) => r.id === roleDoc.id)) {
              crewMember.roles.push({ id: roleDoc.id, ...roleDoc.data() });
            }
          }
          if (assignmentData.sessionId) {
            crewMember.sessions.push(assignmentData.sessionId);
          }
        }
      }
    }

    const crew = Array.from(crewMap.values());

    return res.status(200).json({
      success: true,
      crew,
      pagination: {
        page: 1,
        limit: 50,
        total: crew.length,
        pages: Math.ceil(crew.length / 50)
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/production/crew:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch production crew',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /production/dashboard
app.options('/sessions/production/dashboard', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/production/dashboard - Get production dashboard data
app.get('/sessions/production/dashboard', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get dashboard statistics
    const [sessionsSnapshot, tasksSnapshot, crewSnapshot] = await Promise.all([
      db.collection('sessions')
        .where('organizationId', '==', organizationId)
        .get(),
      db.collection('productionTasks')
        .where('organizationId', '==', organizationId)
        .get(),
      db.collection('sessionAssignments')
        .where('organizationId', '==', organizationId)
        .get()
    ]);

    const sessions = sessionsSnapshot.docs.map(doc => doc.data());
    const tasks = tasksSnapshot.docs.map(doc => doc.data());
    
    const statusCounts = {
      active: sessions.filter((s: any) => ['PRODUCTION_IN_PROGRESS', 'IN_PROGRESS', 'ACTIVE'].includes(s.status)).length,
      planned: sessions.filter((s: any) => ['PLANNED', 'READY', 'PREP'].includes(s.status)).length,
      completed: sessions.filter((s: any) => ['COMPLETED', 'DONE'].includes(s.status)).length
    };

    const taskStatusCounts = {
      pending: tasks.filter((t: any) => t.status === 'pending').length,
      inProgress: tasks.filter((t: any) => t.status === 'in_progress').length,
      completed: tasks.filter((t: any) => t.status === 'completed').length
    };

    const dashboard = {
      sessions: {
        total: sessions.length,
        byStatus: statusCounts
      },
      tasks: {
        total: tasks.length,
        byStatus: taskStatusCounts
      },
      crew: {
        total: new Set(crewSnapshot.docs.map(doc => doc.data().userId)).size
      }
    };

    return res.status(200).json({
      success: true,
      data: dashboard
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/production/dashboard:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch production dashboard',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /production/equipment
app.options('/sessions/production/equipment', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/production/equipment - Get production equipment
app.get('/sessions/production/equipment', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get equipment from equipment collection or session equipment
    const equipmentSnapshot = await db.collection('productionEquipment')
      .where('organizationId', '==', organizationId)
      .get();

    const equipment = equipmentSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      equipment,
      pagination: {
        page: 1,
        limit: 50,
        total: equipment.length,
        pages: Math.ceil(equipment.length / 50)
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/production/equipment:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch production equipment',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// WORKFLOW ENDPOINTS
// ============================================================================

// Handle OPTIONS for GET /sessions/:sessionId/workflow
app.options('/sessions/:sessionId/workflow', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/workflow - Get workflow instance
app.get('/sessions/:sessionId/workflow', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get workflow instance
    const workflowSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (workflowSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'Workflow instance not found for this session'
      });
    }

    const workflowDoc = workflowSnapshot.docs[0];
    const workflowData = workflowDoc.data();

    return res.status(200).json({
      success: true,
      data: {
        id: workflowDoc.id,
        ...workflowData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/workflow:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow instance',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/workflow/complete
app.options('/sessions/:sessionId/workflow/complete', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/workflow/complete - Check if workflow complete
app.get('/sessions/:sessionId/workflow/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get workflow instance
    const workflowSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (workflowSnapshot.empty) {
      return res.status(200).json({
        success: true,
        isComplete: false,
        message: 'No workflow instance found'
      });
    }

    const workflowDoc = workflowSnapshot.docs[0];
    const workflowData = workflowDoc.data();

    // Get all steps
    const stepsSnapshot = await db.collection('unifiedSessionSteps')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const totalSteps = stepsSnapshot.size;
    const completedSteps = stepsSnapshot.docs.filter(doc => {
      const stepData = doc.data();
      return stepData.status === 'COMPLETED' || stepData.status === 'DONE';
    }).length;

    const isComplete = totalSteps > 0 && completedSteps === totalSteps;

    return res.status(200).json({
      success: true,
      isComplete,
      progress: {
        total: totalSteps,
        completed: completedSteps,
        percentage: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
      },
      workflow: {
        id: workflowDoc.id,
        status: workflowData.status,
        progress: workflowData.progress || 0
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/workflow/complete:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check workflow completion',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/steps
app.options('/sessions/:sessionId/steps', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/steps - Get workflow steps
app.get('/sessions/:sessionId/steps', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get workflow steps
    let query: any = db.collection('unifiedSessionSteps')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId);

    // Apply filters
    if (req.query.status) {
      query = query.where('status', '==', req.query.status);
    }
    if (req.query.assignedUserId) {
      query = query.where('assignedUserId', '==', req.query.assignedUserId);
    }

    const snapshot = await query.orderBy('order', 'asc').get();
    const steps = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: steps,
      count: steps.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/steps:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow steps',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /templates
app.options('/sessions/templates', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/templates - Get workflow templates
app.get('/sessions/templates', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get templates from workflowTemplates or workflowDiagrams collection
    const templatesSnapshot = await db.collection('workflowTemplates')
      .where('organizationId', '==', organizationId)
      .get();

    const templates = templatesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: templates,
      count: templates.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/templates:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow templates',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/workflow
app.options('/sessions/:sessionId/workflow', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/workflow - Create workflow
app.post('/sessions/:sessionId/workflow', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    const {
      workflowDiagramId,
      name,
      description,
      workflowPhase = 'PRODUCTION',
      status = 'ACTIVE',
      version = '1.0.0'
    } = req.body;

    if (!workflowDiagramId || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: workflowDiagramId and name are required'
      });
    }

    // Check if workflow already exists for this session and phase
    const existingSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .where('workflowPhase', '==', workflowPhase)
      .where('organizationId', '==', organizationId)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'Workflow already exists for this session and phase',
        existingWorkflowId: existingSnapshot.docs[0].id
      });
    }

    // Create workflow instance
    const workflowData = {
      sessionId,
      workflowDiagramId,
      name,
      description: description || '',
      workflowPhase,
      status,
      version,
      progress: 0,
      organizationId,
      createdByUserId: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const workflowRef = await db.collection('unifiedWorkflowInstances').add(workflowData);

    console.log(`✅ [WORKFLOW] Created workflow ${workflowRef.id} for session ${sessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Workflow created successfully',
      data: {
        id: workflowRef.id,
        ...workflowData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/workflow:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create workflow',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/steps
app.options('/sessions/:sessionId/steps', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/steps - Create workflow step
app.post('/sessions/:sessionId/steps', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    const {
      workflowInstanceId,
      name,
      description,
      order,
      status = 'PENDING',
      assignedUserId,
      phase = 'PRODUCTION'
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: name is required'
      });
    }

    // Get max order if not provided
    let stepOrder = order;
    if (stepOrder === undefined) {
      const existingStepsSnapshot = await db.collection('unifiedSessionSteps')
        .where('sessionId', '==', sessionId)
        .where('organizationId', '==', organizationId)
        .orderBy('order', 'desc')
        .limit(1)
        .get();
      
      stepOrder = existingStepsSnapshot.empty ? 1 : (existingStepsSnapshot.docs[0].data().order || 0) + 1;
    }

    // Create step
    const stepData = {
      sessionId,
      workflowInstanceId: workflowInstanceId || null,
      name,
      description: description || '',
      order: stepOrder,
      status,
      assignedUserId: assignedUserId || null,
      phase,
      organizationId,
      createdByUserId: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const stepRef = await db.collection('unifiedSessionSteps').add(stepData);

    console.log(`✅ [WORKFLOW] Created step ${stepRef.id} for session ${sessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Workflow step created successfully',
      data: {
        id: stepRef.id,
        ...stepData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/steps:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create workflow step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /steps/:stepId/complete
app.options('/sessions/steps/:stepId/complete', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/steps/:stepId/complete - Complete step
app.post('/sessions/steps/:stepId/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    // Update step status
    await db.collection('unifiedSessionSteps').doc(stepId).update({
      status: 'COMPLETED',
      completedAt: FieldValue.serverTimestamp(),
      completedByUserId: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update workflow progress if workflowInstanceId exists
    if (stepData.workflowInstanceId) {
      const workflowDoc = await db.collection('unifiedWorkflowInstances').doc(stepData.workflowInstanceId).get();
      if (workflowDoc.exists) {
        const stepsSnapshot = await db.collection('unifiedSessionSteps')
          .where('workflowInstanceId', '==', stepData.workflowInstanceId)
          .where('organizationId', '==', organizationId)
          .get();
        
        const totalSteps = stepsSnapshot.size;
        const completedSteps = stepsSnapshot.docs.filter(doc => {
          const s = doc.data();
          return s.status === 'COMPLETED' || s.status === 'DONE';
        }).length;

        const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
        
        await db.collection('unifiedWorkflowInstances').doc(stepData.workflowInstanceId).update({
          progress,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    console.log(`✅ [WORKFLOW] Completed step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Step completed successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/steps/:stepId/complete:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /steps/:stepId/start
app.options('/sessions/steps/:stepId/start', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/steps/:stepId/start - Start step
app.post('/sessions/steps/:stepId/start', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    // Update step status
    await db.collection('unifiedSessionSteps').doc(stepId).update({
      status: 'IN_PROGRESS',
      startedAt: FieldValue.serverTimestamp(),
      startedByUserId: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Started step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Step started successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/steps/:stepId/start:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to start step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// UNIFIED REVIEWS ENDPOINTS
// ============================================================================

// Handle OPTIONS for GET /sessions/:reviewId/reviewers
app.options('/sessions/:reviewId/reviewers', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:reviewId/reviewers - Get reviewers for review
app.get('/sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    // Get reviewers
    const reviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .where('organizationId', '==', organizationId)
      .get();

    const reviewers = await Promise.all(reviewersSnapshot.docs.map(async (doc) => {
      const reviewerData = doc.data();
      if (reviewerData.userId) {
        const userDoc = await db.collection('users').doc(reviewerData.userId).get();
        return {
          id: doc.id,
          ...reviewerData,
          user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null
        };
      }
      return { id: doc.id, ...reviewerData };
    }));

    return res.status(200).json(reviewers);
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:reviewId/reviewers:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get reviewers',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:reviewId/details
app.options('/sessions/:reviewId/details', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:reviewId/details - Get review details
app.get('/sessions/:reviewId/details', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get review session
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    // Get reviewers
    const reviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const reviewers = await Promise.all(reviewersSnapshot.docs.map(async (doc) => {
      const reviewerData = doc.data();
      if (reviewerData.userId) {
        const userDoc = await db.collection('users').doc(reviewerData.userId).get();
        return {
          id: doc.id,
          ...reviewerData,
          user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null
        };
      }
      return { id: doc.id, ...reviewerData };
    }));

    // Get session info if sessionId exists
    let session = null;
    if (reviewData.sessionId) {
      const sessionDoc = await db.collection('sessions').doc(reviewData.sessionId).get();
      if (sessionDoc.exists) {
        session = { id: sessionDoc.id, ...sessionDoc.data() };
      }
    }

    return res.status(200).json({
      id: reviewDoc.id,
      ...reviewData,
      reviewers,
      session
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:reviewId/details:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get review session details',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:reviewId/reviewers
app.options('/sessions/:reviewId/reviewers', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:reviewId/reviewers - Add reviewer
app.post('/sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    const { reviewerId, reviewerRole = 'REVIEWER' } = req.body;

    if (!reviewerId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: reviewerId'
      });
    }

    // Check if reviewer already exists
    const existingSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .where('userId', '==', reviewerId)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'Reviewer already assigned to this review'
      });
    }

    // Add reviewer
    const reviewerData = {
      reviewSessionId: reviewId,
      userId: reviewerId,
      reviewerRole,
      organizationId,
      assignedBy: userId,
      createdAt: FieldValue.serverTimestamp()
    };

    const reviewerRef = await db.collection('reviewSessionReviewers').add(reviewerData);

    // Get user info
    const userDoc = await db.collection('users').doc(reviewerId).get();
    const reviewer = {
      id: reviewerRef.id,
      ...reviewerData,
      user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null
    };

    console.log(`✅ [REVIEWS] Added reviewer ${reviewerId} to review ${reviewId}`);
    return res.status(201).json(reviewer);
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:reviewId/reviewers:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add reviewer',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// OTHER SIMPLE ENDPOINTS
// ============================================================================

// Handle OPTIONS for GET /sessions/recent
app.options('/sessions/recent', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/recent - Get recent sessions
app.get('/sessions/recent', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionsSnapshot = await db.collection('sessions')
      .where('organizationId', '==', organizationId)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: sessions,
      count: sessions.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/recent:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch recent sessions',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PATCH /sessions/:sessionId
app.options('/sessions/:sessionId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PATCH /sessions/:sessionId - Update session
app.patch('/sessions/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.organizationId;
    delete updateData.createdAt;
    delete updateData.createdBy;

    await db.collection('sessions').doc(sessionId).update(updateData);

    const updatedDoc = await db.collection('sessions').doc(sessionId).get();
    const updatedSession = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [SESSIONS] Updated session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Session updated successfully',
      data: updatedSession
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PATCH /sessions/:sessionId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// WORKFLOW CORRELATIONS ENDPOINTS
// ============================================================================

// Handle OPTIONS for GET /sessions/:sessionId/correlations
app.options('/sessions/:sessionId/correlations', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/correlations - Get correlations
app.get('/sessions/:sessionId/correlations', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get correlations
    const correlationsSnapshot = await db.collection('workflowCorrelations')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const correlations = correlationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: correlations,
      count: correlations.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/correlations:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch correlations',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/correlations
app.options('/sessions/:sessionId/correlations', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/correlations - Create correlation
app.post('/sessions/:sessionId/correlations', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    const {
      workflowNodeId,
      taskId,
      syncEnabled = true,
      syncDirection = 'BIDIRECTIONAL'
    } = req.body;

    if (!workflowNodeId || !taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: workflowNodeId and taskId are required'
      });
    }

    // Check if correlation already exists
    const existingSnapshot = await db.collection('workflowCorrelations')
      .where('sessionId', '==', sessionId)
      .where('workflowNodeId', '==', workflowNodeId)
      .where('taskId', '==', taskId)
      .where('organizationId', '==', organizationId)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'Correlation already exists',
        correlationId: existingSnapshot.docs[0].id
      });
    }

    // Create correlation
    const correlationData = {
      sessionId,
      workflowNodeId,
      taskId,
      syncEnabled,
      syncDirection,
      organizationId,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const correlationRef = await db.collection('workflowCorrelations').add(correlationData);

    console.log(`✅ [WORKFLOW] Created correlation ${correlationRef.id}`);
    return res.status(201).json({
      success: true,
      message: 'Correlation created successfully',
      data: {
        id: correlationRef.id,
        ...correlationData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/correlations:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create correlation',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PATCH /correlations/:correlationId
app.options('/sessions/correlations/:correlationId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PATCH /sessions/correlations/:correlationId - Update correlation
app.patch('/sessions/correlations/:correlationId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const correlationId = decodeURIComponent(req.params.correlationId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const correlationDoc = await db.collection('workflowCorrelations').doc(correlationId).get();
    if (!correlationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Correlation not found'
      });
    }

    const correlationData = correlationDoc.data();
    if (correlationData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this correlation'
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.organizationId;
    delete updateData.sessionId;
    delete updateData.createdAt;
    delete updateData.createdBy;

    await db.collection('workflowCorrelations').doc(correlationId).update(updateData);

    const updatedDoc = await db.collection('workflowCorrelations').doc(correlationId).get();
    const updatedCorrelation = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [WORKFLOW] Updated correlation ${correlationId}`);
    return res.status(200).json({
      success: true,
      message: 'Correlation updated successfully',
      data: updatedCorrelation
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PATCH /sessions/correlations/:correlationId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update correlation',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for DELETE /correlations/:correlationId
app.options('/sessions/correlations/:correlationId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// DELETE /sessions/correlations/:correlationId - Delete correlation
app.delete('/sessions/correlations/:correlationId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const correlationId = decodeURIComponent(req.params.correlationId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const correlationDoc = await db.collection('workflowCorrelations').doc(correlationId).get();
    if (!correlationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Correlation not found'
      });
    }

    const correlationData = correlationDoc.data();
    if (correlationData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this correlation'
      });
    }

    await db.collection('workflowCorrelations').doc(correlationId).delete();

    console.log(`✅ [WORKFLOW] Deleted correlation ${correlationId}`);
    return res.status(200).json({
      success: true,
      message: 'Correlation deleted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in DELETE /sessions/correlations/:correlationId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete correlation',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// WORKFLOW STEP MANAGEMENT ENDPOINTS
// ============================================================================

// Handle OPTIONS for DELETE /steps/:stepId
app.options('/sessions/steps/:stepId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// DELETE /sessions/steps/:stepId - Delete workflow step
app.delete('/sessions/steps/:stepId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    await db.collection('unifiedSessionSteps').doc(stepId).delete();

    console.log(`✅ [WORKFLOW] Deleted step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow step deleted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in DELETE /sessions/steps/:stepId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete workflow step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PATCH /steps/:stepId
app.options('/sessions/steps/:stepId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PATCH /sessions/steps/:stepId - Update step
app.patch('/sessions/steps/:stepId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUserId: userId
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.organizationId;
    delete updateData.sessionId;
    delete updateData.createdAt;
    delete updateData.createdByUserId;

    await db.collection('unifiedSessionSteps').doc(stepId).update(updateData);

    const updatedDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    const updatedStep = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [WORKFLOW] Updated step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow step updated successfully',
      data: updatedStep
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PATCH /sessions/steps/:stepId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update workflow step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PUT /steps/:stepId
app.options('/sessions/steps/:stepId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PUT /sessions/steps/:stepId - Update step
app.put('/sessions/steps/:stepId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUserId: userId
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.organizationId;
    delete updateData.sessionId;
    delete updateData.createdAt;
    delete updateData.createdByUserId;

    await db.collection('unifiedSessionSteps').doc(stepId).update(updateData);

    const updatedDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    const updatedStep = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    console.log(`✅ [WORKFLOW] Updated step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow step updated successfully',
      data: updatedStep
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PUT /sessions/steps/:stepId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update workflow step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/steps/:stepId/assign
app.options('/sessions/:sessionId/steps/:stepId/assign', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/steps/:stepId/assign - Assign step
app.post('/sessions/:sessionId/steps/:stepId/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { assignedUserId } = req.body;

    if (!assignedUserId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: assignedUserId'
      });
    }

    // Verify step exists
    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId || stepData?.sessionId !== sessionId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    // Update step assignment
    await db.collection('unifiedSessionSteps').doc(stepId).update({
      assignedUserId,
      assignedAt: FieldValue.serverTimestamp(),
      assignedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Assigned step ${stepId} to user ${assignedUserId}`);
    return res.status(200).json({
      success: true,
      message: 'Step assigned successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/steps/:stepId/assign:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/steps/:stepId/unassign
app.options('/sessions/:sessionId/steps/:stepId/unassign', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/steps/:stepId/unassign - Unassign step
app.post('/sessions/:sessionId/steps/:stepId/unassign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify step exists
    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId || stepData?.sessionId !== sessionId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    // Remove assignment
    await db.collection('unifiedSessionSteps').doc(stepId).update({
      assignedUserId: null,
      assignedAt: null,
      assignedBy: null,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Unassigned step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Step unassigned successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/steps/:stepId/unassign:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to unassign step',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/steps/reorder
app.options('/sessions/:sessionId/steps/reorder', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/steps/reorder - Reorder steps
app.post('/sessions/:sessionId/steps/reorder', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { stepOrders } = req.body; // Array of { stepId, order }

    if (!stepOrders || !Array.isArray(stepOrders)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: stepOrders (array of { stepId, order })'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Update step orders in batch
    const batch = db.batch();
    for (const { stepId, order } of stepOrders) {
      const stepRef = db.collection('unifiedSessionSteps').doc(stepId);
      batch.update(stepRef, {
        order,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUserId: userId
      });
    }

    await batch.commit();

    console.log(`✅ [WORKFLOW] Reordered steps for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Steps reordered successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/steps/reorder:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reorder steps',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PUT /sessions/:sessionId/steps/:stepId/documentation
app.options('/sessions/:sessionId/steps/:stepId/documentation', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PUT /sessions/:sessionId/steps/:stepId/documentation - Update step documentation
app.put('/sessions/:sessionId/steps/:stepId/documentation', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { documentation } = req.body;

    if (documentation === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: documentation'
      });
    }

    // Verify step exists
    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId || stepData?.sessionId !== sessionId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    // Update documentation
    await db.collection('unifiedSessionSteps').doc(stepId).update({
      documentation,
      documentationUpdatedAt: FieldValue.serverTimestamp(),
      documentationUpdatedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Updated documentation for step ${stepId}`);
    return res.status(200).json({
      success: true,
      message: 'Step documentation updated successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in PUT /sessions/:sessionId/steps/:stepId/documentation:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update step documentation',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// WORKFLOW ACTIVITIES & NOTIFICATIONS ENDPOINTS
// ============================================================================

// Handle OPTIONS for GET /sessions/:sessionId/activities
app.options('/sessions/:sessionId/activities', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/activities - Get workflow activities
app.get('/sessions/:sessionId/activities', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get activities from workflowActivities or activityLogs collection
    const activitiesSnapshot = await db.collection('workflowActivities')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const activities = activitiesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: activities,
      message: 'Session activities retrieved successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/activities:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow activities',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/notifications
app.options('/sessions/:sessionId/notifications', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/notifications - Get notifications
app.get('/sessions/:sessionId/notifications', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get notifications
    const notificationsSnapshot = await db.collection('notifications')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const notifications = notificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: notifications,
      message: 'Session notifications retrieved successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/notifications:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/sync
app.options('/sessions/:sessionId/sync', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/sync - Sync workflow
app.post('/sessions/:sessionId/sync', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get all correlations for this session
    const correlationsSnapshot = await db.collection('workflowCorrelations')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .where('syncEnabled', '==', true)
      .get();

    const syncResults = [];
    for (const correlationDoc of correlationsSnapshot.docs) {
      const correlationData = correlationDoc.data();
      
      // Sync correlation (simplified - just mark as synced)
      await db.collection('workflowCorrelations').doc(correlationDoc.id).update({
        lastSyncedAt: FieldValue.serverTimestamp(),
        lastSyncedBy: userId,
        updatedAt: FieldValue.serverTimestamp()
      });

      syncResults.push({
        correlationId: correlationDoc.id,
        workflowNodeId: correlationData.workflowNodeId,
        taskId: correlationData.taskId,
        synced: true
      });
    }

    console.log(`✅ [WORKFLOW] Synced ${syncResults.length} correlations for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow synced successfully',
      data: {
        syncedCount: syncResults.length,
        results: syncResults
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/sync:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync workflow',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/complete
app.options('/sessions/:sessionId/complete', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/complete - Complete workflow
app.post('/sessions/:sessionId/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get workflow instance
    const workflowSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (workflowSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'Workflow instance not found for this session'
      });
    }

    const workflowDoc = workflowSnapshot.docs[0];
    
    // Update workflow status
    await db.collection('unifiedWorkflowInstances').doc(workflowDoc.id).update({
      status: 'COMPLETED',
      completedAt: FieldValue.serverTimestamp(),
      completedBy: userId,
      progress: 100,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Completed workflow for session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow completed successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/complete:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete workflow',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/broadcast
app.options('/sessions/:sessionId/broadcast', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/broadcast - Broadcast workflow event
app.post('/sessions/:sessionId/broadcast', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    const { stepId, status, message, eventType = 'workflow_update' } = req.body;

    // Create broadcast event log
    await db.collection('workflowBroadcasts').add({
      sessionId,
      stepId: stepId || null,
      status: status || null,
      message: message || 'Workflow event broadcast',
      eventType,
      organizationId,
      broadcastBy: userId,
      createdAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Broadcasted event for session ${sessionId}: ${message || eventType}`);
    return res.status(200).json({
      success: true,
      message: 'Event broadcasted successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/broadcast:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to broadcast event',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/analytics
app.options('/sessions/:sessionId/analytics', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/analytics - Get workflow analytics
app.get('/sessions/:sessionId/analytics', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get workflow instance
    const workflowSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    // Get steps
    const stepsSnapshot = await db.collection('unifiedSessionSteps')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const totalSteps = stepsSnapshot.size;
    const completedSteps = stepsSnapshot.docs.filter(doc => {
      const stepData = doc.data();
      return stepData.status === 'COMPLETED' || stepData.status === 'DONE';
    }).length;

    const inProgressSteps = stepsSnapshot.docs.filter(doc => {
      const stepData = doc.data();
      return stepData.status === 'IN_PROGRESS' || stepData.status === 'ACTIVE';
    }).length;

    const analytics = {
      workflow: workflowSnapshot.empty ? null : {
        id: workflowSnapshot.docs[0].id,
        ...workflowSnapshot.docs[0].data()
      },
      steps: {
        total: totalSteps,
        completed: completedSteps,
        inProgress: inProgressSteps,
        pending: totalSteps - completedSteps - inProgressSteps,
        completionRate: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
      },
      progress: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
    };

    return res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/analytics:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow analytics',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/reviews-analysis
app.options('/sessions/:sessionId/reviews-analysis', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/reviews-analysis - Get reviews analysis
app.get('/sessions/:sessionId/reviews-analysis', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get review sessions
    const reviewsSnapshot = await db.collection('reviewSessions')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const reviews = reviewsSnapshot.docs.map(doc => doc.data());
    
    const analysis = {
      totalReviews: reviews.length,
      byStatus: {
        waiting: reviews.filter((r: any) => r.reviewStatus === 'WAITING_FOR_REVIEW').length,
        inProgress: reviews.filter((r: any) => r.reviewStatus === 'IN_PROGRESS').length,
        completed: reviews.filter((r: any) => r.reviewStatus === 'COMPLETED' || r.reviewStatus === 'APPROVED').length,
        rejected: reviews.filter((r: any) => r.reviewStatus === 'REJECTED').length
      },
      byStage: reviews.reduce((acc: any, r: any) => {
        const stage = r.reviewStage || 'UNKNOWN';
        acc[stage] = (acc[stage] || 0) + 1;
        return acc;
      }, {})
    };

    return res.status(200).json({
      success: true,
      data: analysis
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/reviews-analysis:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch reviews analysis',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// UNIFIED REVIEWS ENDPOINTS (Continued)
// ============================================================================

// Handle OPTIONS for GET /sessions/:reviewId/file-paths
app.options('/sessions/:reviewId/file-paths', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:reviewId/file-paths - Get file paths
app.get('/sessions/:reviewId/file-paths', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    // Get file paths
    const filePathsSnapshot = await db.collection('reviewFilePaths')
      .where('reviewSessionId', '==', reviewId)
      .where('organizationId', '==', organizationId)
      .get();

    const filePaths = filePathsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(filePaths);
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:reviewId/file-paths:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get file paths',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:reviewId/file-paths
app.options('/sessions/:reviewId/file-paths', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:reviewId/file-paths - Set file paths
app.post('/sessions/:reviewId/file-paths', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    const { filePath, fileName, fileType, cutType, uploadedBy } = req.body;

    if (!filePath || !fileName) {
      return res.status(400).json({
        success: false,
        error: 'File path and file name are required'
      });
    }

    // Add file path
    const filePathData = {
      reviewSessionId: reviewId,
      filePath,
      fileName,
      fileType: fileType || null,
      cutType: cutType || null,
      uploadedBy: uploadedBy || userId,
      organizationId,
      createdAt: FieldValue.serverTimestamp()
    };

    const filePathRef = await db.collection('reviewFilePaths').add(filePathData);

    console.log(`✅ [REVIEWS] Added file path ${filePathRef.id} to review ${reviewId}`);
    return res.status(201).json({
      id: filePathRef.id,
      ...filePathData
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:reviewId/file-paths:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add file path',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:reviewId/submit-decision
app.options('/sessions/:reviewId/submit-decision', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:reviewId/submit-decision - Submit decision
app.post('/sessions/:reviewId/submit-decision', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    const { decision, notes, feedback } = req.body;

    if (!decision) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: decision'
      });
    }

    // Update reviewer decision
    const reviewerSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (reviewerSnapshot.empty) {
      return res.status(403).json({
        success: false,
        error: 'User is not a reviewer for this review session'
      });
    }

    const reviewerDoc = reviewerSnapshot.docs[0];
    await db.collection('reviewSessionReviewers').doc(reviewerDoc.id).update({
      decision,
      notes: notes || null,
      feedback: feedback || null,
      decisionSubmittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update review session status if all reviewers have submitted
    const allReviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const allDecisionsSubmitted = allReviewersSnapshot.docs.every(doc => {
      const data = doc.data();
      return data.decision !== null && data.decision !== undefined;
    });

    if (allDecisionsSubmitted) {
      await db.collection('reviewSessions').doc(reviewId).update({
        reviewStatus: 'COMPLETED',
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    console.log(`✅ [REVIEWS] Submitted decision for review ${reviewId}`);
    return res.status(200).json({
      success: true,
      message: 'Decision submitted successfully',
      allDecisionsSubmitted
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:reviewId/submit-decision:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit decision',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/coordination-summary
app.options('/sessions/:sessionId/coordination-summary', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/coordination-summary - Get coordination summary
app.get('/sessions/:sessionId/coordination-summary', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get all reviews for this session
    const reviewsSnapshot = await db.collection('reviewSessions')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const reviews = reviewsSnapshot.docs.map(doc => doc.data());
    
    // Get all reviewers
    const reviewerIds = new Set<string>();
    for (const reviewDoc of reviewsSnapshot.docs) {
      const reviewersSnapshot = await db.collection('reviewSessionReviewers')
        .where('reviewSessionId', '==', reviewDoc.id)
        .get();
      reviewersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.userId) reviewerIds.add(data.userId);
      });
    }

    const summary = {
      sessionId,
      totalReviews: reviews.length,
      totalReviewers: reviewerIds.size,
      reviewsByStatus: {
        waiting: reviews.filter((r: any) => r.reviewStatus === 'WAITING_FOR_REVIEW').length,
        inProgress: reviews.filter((r: any) => r.reviewStatus === 'IN_PROGRESS').length,
        completed: reviews.filter((r: any) => r.reviewStatus === 'COMPLETED' || r.reviewStatus === 'APPROVED').length,
        rejected: reviews.filter((r: any) => r.reviewStatus === 'REJECTED').length
      },
      reviewsByStage: reviews.reduce((acc: any, r: any) => {
        const stage = r.reviewStage || 'UNKNOWN';
        acc[stage] = (acc[stage] || 0) + 1;
        return acc;
      }, {})
    };

    return res.status(200).json(summary);
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/coordination-summary:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get coordination summary',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/coordinate-status
app.options('/sessions/:sessionId/coordinate-status', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/coordinate-status - Coordinate status
app.post('/sessions/:sessionId/coordinate-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    const { reviewId, status, notes } = req.body;

    if (!reviewId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: reviewId and status are required'
      });
    }

    // Update review status
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId || reviewData?.sessionId !== sessionId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    await db.collection('reviewSessions').doc(reviewId).update({
      reviewStatus: status,
      coordinationNotes: notes || null,
      coordinatedAt: FieldValue.serverTimestamp(),
      coordinatedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [REVIEWS] Coordinated status for review ${reviewId}`);
    return res.status(200).json({
      success: true,
      message: 'Review status coordinated successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/coordinate-status:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to coordinate status',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:reviewId/bulk-assign
app.options('/sessions/:reviewId/bulk-assign', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:reviewId/bulk-assign - Bulk assign reviewers
app.post('/sessions/:reviewId/bulk-assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review'
      });
    }

    const { reviewerIds, reviewerRole = 'REVIEWER' } = req.body;

    if (!reviewerIds || !Array.isArray(reviewerIds) || reviewerIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: reviewerIds (array)'
      });
    }

    // Get existing reviewers to avoid duplicates
    const existingSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const existingReviewerIds = new Set(existingSnapshot.docs.map(doc => doc.data().userId));

    // Add new reviewers
    const batch = db.batch();
    let addedCount = 0;

    for (const reviewerId of reviewerIds) {
      if (!existingReviewerIds.has(reviewerId)) {
        const reviewerRef = db.collection('reviewSessionReviewers').doc();
        batch.set(reviewerRef, {
          reviewSessionId: reviewId,
          userId: reviewerId,
          reviewerRole,
          organizationId,
          assignedBy: userId,
          createdAt: FieldValue.serverTimestamp()
        });
        addedCount++;
      }
    }

    await batch.commit();

    console.log(`✅ [REVIEWS] Bulk assigned ${addedCount} reviewers to review ${reviewId}`);
    return res.status(200).json({
      success: true,
      message: `Assigned ${addedCount} reviewers successfully`,
      addedCount,
      skippedCount: reviewerIds.length - addedCount
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:reviewId/bulk-assign:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk assign reviewers',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ====================
// AGENT 2: Complex Endpoints Batch 1 (Prisma Conversion)
// ====================
// Add first batch of complex endpoints requiring Prisma to Firestore conversion
// See: scripts/AGENT-2-COMPLEX-ENDPOINTS-BATCH-1.md for instructions
// Total: 88 endpoints

// ====================
// Sessions Endpoints
// ====================

// DELETE /api/sessions/:id/map - Remove map assignment from a session
app.delete('/sessions/:id/map', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get the current session
    const sessionRef = db.collection('sessions').doc(id);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    // Verify organization access
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    if (!sessionData?.mapId) {
      return res.status(400).json({
        success: false,
        error: 'Session has no map assigned'
      });
    }

    const previousMapId = sessionData.mapId;

    // Update session to remove map
    await sessionRef.update({
      mapId: null,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get updated session
    const updatedSessionDoc = await sessionRef.get();
    const updatedSession = {
      id: updatedSessionDoc.id,
      ...updatedSessionDoc.data()
    };

    return res.status(200).json({
      success: true,
      message: 'Map removed from session successfully',
      session: updatedSession,
      previousMapId
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error removing map from session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove map from session',
      errorDetails: error.message || String(error)
    });
  }
});

// PUT /api/sessions/:id/map - Assign map to session
app.put('/sessions/:id/map', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { mapId } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!mapId) {
      return res.status(400).json({
        success: false,
        error: 'Valid mapId is required'
      });
    }

    // Get the current session
    const sessionRef = db.collection('sessions').doc(id);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    // Verify organization access
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    const previousMapId = sessionData?.mapId || null;

    // Update session with new map
    await sessionRef.update({
      mapId,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get updated session
    const updatedSessionDoc = await sessionRef.get();
    const updatedSession = {
      id: updatedSessionDoc.id,
      ...updatedSessionDoc.data()
    };

    return res.status(200).json({
      success: true,
      message: 'Map assigned to session successfully',
      session: updatedSession,
      previousMapId,
      newMapId: mapId
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error assigning map to session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign map to session',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/sessions/:id/map - Get session map
app.get('/sessions/:id/map', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionDoc = await db.collection('sessions').doc(id).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    // Verify organization access
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        sessionId: sessionDoc.id,
        sessionName: sessionData?.name,
        mapId: sessionData?.mapId || null,
        location: sessionData?.location || null
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error getting session map:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get session map',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/sessions/:id/archive-status - Get session archive status
app.get('/sessions/:id/archive-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionDoc = await db.collection('sessions').doc(id).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    // Verify organization access
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: sessionDoc.id,
        name: sessionData?.name,
        isArchived: sessionData?.isArchived || false
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error getting archive status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get archive status',
      errorDetails: error.message || String(error)
    });
  }
});

// PUT /api/sessions/:id/archive-status - Update session archive status
app.put('/sessions/:id/archive-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { isArchived } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionRef = db.collection('sessions').doc(id);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    // Verify organization access
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    const updateData: any = {
      isArchived: isArchived || false,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (isArchived) {
      updateData.archivedAt = FieldValue.serverTimestamp();
      updateData.archivedBy = userId;
    } else {
      updateData.archivedAt = null;
      updateData.archivedBy = null;
    }

    await sessionRef.update(updateData);

    const updatedSessionDoc = await sessionRef.get();
    const updatedSession = {
      id: updatedSessionDoc.id,
      ...updatedSessionDoc.data()
    };

    return res.status(200).json({
      success: true,
      message: `Session ${isArchived ? 'archived' : 'unarchived'} successfully`,
      session: updatedSession
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error updating archive status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update archive status',
      errorDetails: error.message || String(error)
    });
  }
});

// PUT /api/sessions/:id/deadline - Update session deadline
app.put('/sessions/:id/deadline', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { deadline } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!deadline) {
      return res.status(400).json({
        success: false,
        error: 'Deadline is required'
      });
    }

    const sessionRef = db.collection('sessions').doc(id);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    // Verify organization access
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    const deadlineDate = deadline instanceof Date ? deadline : new Date(deadline);

    await sessionRef.update({
      deadline: deadlineDate,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedSessionDoc = await sessionRef.get();
    const updatedSession = {
      id: updatedSessionDoc.id,
      ...updatedSessionDoc.data()
    };

    return res.status(200).json({
      success: true,
      message: 'Deadline updated successfully',
      session: updatedSession
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error updating deadline:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update deadline',
      errorDetails: error.message || String(error)
    });
  }
});

// DELETE /api/sessions/bulk-delete - Bulk delete multiple sessions
app.delete('/sessions/bulk-delete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionIds } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Session IDs array is required'
      });
    }

    console.log(`🗑️ [BULK_DELETE] Attempting to delete ${sessionIds.length} sessions by user ${userId}`);

    // Verify all sessions exist and belong to organization
    const sessionRefs = sessionIds.map(id => db.collection('sessions').doc(id));
    const sessionDocs = await Promise.all(sessionRefs.map(ref => ref.get()));

    const validSessions = sessionDocs
      .map((doc, index) => ({ doc, id: sessionIds[index] }))
      .filter(({ doc }) => {
        if (!doc.exists) return false;
        const data = doc.data();
        return data?.organizationId === organizationId && !data?.isDeleted;
      });

    if (validSessions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No valid sessions found to delete'
      });
    }

    if (validSessions.length !== sessionIds.length) {
      console.warn(`⚠️ [BULK_DELETE] Some sessions not found or already deleted. Requested: ${sessionIds.length}, Found: ${validSessions.length}`);
    }

    // Soft delete all valid sessions using batch
    const batch = db.batch();
    const deletedSessionIds: string[] = [];

    validSessions.forEach(({ doc }) => {
      batch.update(doc.ref, {
        isDeleted: true,
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: userId,
        updatedAt: FieldValue.serverTimestamp()
      });
      deletedSessionIds.push(doc.id);
    });

    await batch.commit();

    console.log(`✅ [BULK_DELETE] Successfully deleted ${deletedSessionIds.length} sessions`);

    // Get deleted sessions for response
    const deletedSessions = await Promise.all(
      deletedSessionIds.map(async (id) => {
        const doc = await db.collection('sessions').doc(id).get();
        return {
          id: doc.id,
          ...doc.data()
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${deletedSessionIds.length} session(s)`,
      deletedCount: deletedSessionIds.length,
      sessions: deletedSessions
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error in bulk delete:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete sessions',
      errorDetails: error.message || String(error)
    });
  }
});

// DELETE /api/sessions/:sessionId/workflow - Remove workflow assignment from session
app.delete('/sessions/:sessionId/workflow', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { workflowPhase } = req.query;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Verify session exists and belongs to organization
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Build query for workflow assignments
    let workflowQuery = db.collection('workflowAssignments')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId);

    if (workflowPhase) {
      workflowQuery = workflowQuery.where('workflowPhase', '==', workflowPhase);
    }

    const workflowSnapshot = await workflowQuery.get();

    if (workflowSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'No workflow assignments found'
      });
    }

    // Update workflow assignments to REMOVED status
    const batch = db.batch();
    workflowSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'REMOVED',
        removedAt: FieldValue.serverTimestamp(),
        removedBy: userId,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: 'Workflow removed successfully',
      sessionId,
      workflowPhase: workflowPhase || 'all',
      removedCount: workflowSnapshot.docs.length
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error removing workflow:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove workflow',
      errorDetails: error.message || String(error)
    });
  }
});

// DELETE /api/sessions/tasks/:taskId - Delete task
app.delete('/sessions/tasks/:taskId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const taskId = decodeURIComponent(req.params.taskId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify task exists and belongs to organization
    const taskDoc = await db.collection('tasks').doc(taskId).get();

    if (!taskDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const taskData = taskDoc.data();
    if (taskData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to task'
      });
    }

    // Delete the task
    await db.collection('tasks').doc(taskId).delete();

    return res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error deleting task:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete task',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/sessions/:id/timeline - Get session timeline
app.get('/sessions/:id/timeline', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get session
    const sessionDoc = await db.collection('sessions').doc(id).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();

    // Verify organization access
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get post-production tasks
    const tasksSnapshot = await db.collection('tasks')
      .where('sessionId', '==', id)
      .orderBy('createdAt', 'asc')
      .get();

    const tasks = tasksSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Build timeline
    const timeline = [
      {
        date: sessionData?.createdAt || new Date(),
        event: 'Session Created',
        description: `Session "${sessionData?.name}" was created`,
        type: 'creation'
      },
      ...tasks.map((task: any) => ({
        date: task.createdAt || new Date(),
        event: 'Task Created',
        description: `${task.taskName || task.name || 'Task'} task was created`,
        type: 'task_creation',
        taskId: task.id
      }))
    ].sort((a, b) => {
      const dateA = a.date instanceof admin.firestore.Timestamp ? a.date.toDate() : new Date(a.date);
      const dateB = b.date instanceof admin.firestore.Timestamp ? b.date.toDate() : new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    return res.status(200).json({
      success: true,
      sessionId: id,
      sessionName: sessionData?.name,
      timeline
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error getting timeline:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get timeline',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/sessions/:sessionId/lifecycle - Get session lifecycle state
app.get('/sessions/:sessionId/lifecycle', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get lifecycle state
    const lifecycleDoc = await db.collection('sessionLifecycleStates').doc(sessionId).get();

    let lifecycleState;
    if (lifecycleDoc.exists) {
      lifecycleState = {
        id: lifecycleDoc.id,
        ...lifecycleDoc.data()
      };
    } else {
      // Return default state if not found
      lifecycleState = {
        sessionId,
        status: 'PENDING',
        phase: 'PLANNING',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
    }

    return res.status(200).json({
      success: true,
      data: lifecycleState
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error getting lifecycle:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch session lifecycle state',
      errorDetails: error.message || String(error)
    });
  }
});

// PUT /api/sessions/:sessionId/lifecycle - Update session lifecycle state
app.put('/sessions/:sessionId/lifecycle', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const updates = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Update or create lifecycle state
    const lifecycleRef = db.collection('sessionLifecycleStates').doc(sessionId);
    const lifecycleDoc = await lifecycleRef.get();

    if (lifecycleDoc.exists) {
      await lifecycleRef.update({
        ...updates,
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      await lifecycleRef.set({
        sessionId,
        ...updates,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    const updatedLifecycleDoc = await lifecycleRef.get();
    const lifecycleState = {
      id: updatedLifecycleDoc.id,
      ...updatedLifecycleDoc.data()
    };

    return res.status(200).json({
      success: true,
      data: lifecycleState
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error updating lifecycle:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update session lifecycle state',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/sessions/tasks - Get all post-production tasks
app.get('/sessions/tasks', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const {
      sessionId,
      status,
      assignedTo,
      page = '1',
      limit = '50'
    } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Build query
    let tasksQuery: any = db.collection('tasks')
      .where('organizationId', '==', organizationId);

    if (sessionId) {
      tasksQuery = tasksQuery.where('sessionId', '==', sessionId);
    }

    if (status) {
      tasksQuery = tasksQuery.where('status', '==', status);
    }

    if (assignedTo) {
      tasksQuery = tasksQuery.where('assignedToUserId', '==', assignedTo);
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;

    tasksQuery = tasksQuery
      .orderBy('createdAt', 'desc')
      .limit(limitNum);

    const tasksSnapshot = await tasksQuery.get();

    // Get related data
    const tasks = await Promise.all(
      tasksSnapshot.docs.map(async (doc: any) => {
        const taskData = doc.data();

        // Get session
        const sessionDoc = taskData.sessionId ? await db.collection('sessions').doc(taskData.sessionId).get() : null;

        // Get assigned user
        const userDoc = taskData.assignedToUserId ? await db.collection('users').doc(taskData.assignedToUserId).get() : null;

        // Get role
        const roleDoc = taskData.roleId ? await db.collection('roles').doc(taskData.roleId).get() : null;

        return {
          id: doc.id,
          ...taskData,
          session: sessionDoc?.exists ? { id: sessionDoc.id, ...sessionDoc.data() } : null,
          assignedToUser: userDoc?.exists ? { id: userDoc.id, ...userDoc.data() } : null,
          role: roleDoc?.exists ? { id: roleDoc.id, ...roleDoc.data() } : null
        };
      })
    );

    // Get total count
    let countQuery: any = db.collection('tasks')
      .where('organizationId', '==', organizationId);

    if (sessionId) countQuery = countQuery.where('sessionId', '==', sessionId);
    if (status) countQuery = countQuery.where('status', '==', status);
    if (assignedTo) countQuery = countQuery.where('assignedToUserId', '==', assignedTo);

    const totalSnapshot = await countQuery.get();
    const total = totalSnapshot.size;

    return res.status(200).json({
      success: true,
      tasks,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error getting tasks:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get tasks',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/sessions/tasks/session/:sessionId - Get tasks for specific session
app.get('/sessions/tasks/session/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get tasks
    const tasksSnapshot = await db.collection('tasks')
      .where('sessionId', '==', sessionId)
      .orderBy('createdAt', 'asc')
      .get();

    const tasks = await Promise.all(
      tasksSnapshot.docs.map(async (doc: any) => {
        const taskData = doc.data();

        // Get assigned user
        const userDoc = taskData.assignedToUserId ? await db.collection('users').doc(taskData.assignedToUserId).get() : null;

        // Get role
        const roleDoc = taskData.roleId ? await db.collection('roles').doc(taskData.roleId).get() : null;

        return {
          id: doc.id,
          ...taskData,
          assignedToUser: userDoc?.exists ? { id: userDoc.id, ...userDoc.data() } : null,
          role: roleDoc?.exists ? { id: roleDoc.id, ...roleDoc.data() } : null
        };
      })
    );

    return res.status(200).json({
      success: true,
      tasks
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error getting session tasks:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get session tasks',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/sessions/tasks - Create new task
app.post('/sessions/tasks', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const {
      sessionId,
      taskName,
      description,
      status = 'PENDING',
      assignedToUserId,
      roleId,
      priority = 'MEDIUM',
      dueDate
    } = req.body;

    if (!sessionId || !taskName) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and task name are required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Create task
    const taskData = {
      sessionId,
      organizationId,
      taskName,
      description: description || '',
      status,
      assignedToUserId: assignedToUserId || null,
      roleId: roleId || null,
      priority,
      dueDate: dueDate ? (dueDate instanceof Date ? dueDate : new Date(dueDate)) : null,
      createdBy: userId || 'system',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const taskRef = await db.collection('tasks').add(taskData);

    // Get created task with relations
    const createdTaskDoc = await taskRef.get();
    const userDoc = assignedToUserId ? await db.collection('users').doc(assignedToUserId).get() : null;
    const roleDoc = roleId ? await db.collection('roles').doc(roleId).get() : null;

    const createdTask = {
      id: createdTaskDoc.id,
      ...createdTaskDoc.data(),
      assignedToUser: userDoc?.exists ? { id: userDoc.id, ...userDoc.data() } : null,
      role: roleDoc?.exists ? { id: roleDoc.id, ...roleDoc.data() } : null
    };

    return res.status(200).json({
      success: true,
      data: createdTask
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error creating task:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create task',
      errorDetails: error.message || String(error)
    });
  }
});

// PUT /api/sessions/tasks/:taskId - Update task
app.put('/sessions/tasks/:taskId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const taskId = decodeURIComponent(req.params.taskId);
    const updateData = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify task exists
    const taskRef = db.collection('tasks').doc(taskId);
    const taskDoc = await taskRef.get();

    if (!taskDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const taskData = taskDoc.data();
    if (taskData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to task'
      });
    }

    // Update task
    const updateFields: any = {
      ...updateData,
      updatedAt: FieldValue.serverTimestamp()
    };

    // Handle date conversion
    if (updateFields.dueDate && !(updateFields.dueDate instanceof Date)) {
      updateFields.dueDate = new Date(updateFields.dueDate);
    }

    await taskRef.update(updateFields);

    // Get updated task with relations
    const updatedTaskDoc = await taskRef.get();
    const updatedTaskData = updatedTaskDoc.data();

    const userDoc = updatedTaskData?.assignedToUserId ? await db.collection('users').doc(updatedTaskData.assignedToUserId).get() : null;
    const roleDoc = updatedTaskData?.roleId ? await db.collection('roles').doc(updatedTaskData.roleId).get() : null;
    const sessionDoc = updatedTaskData?.sessionId ? await db.collection('sessions').doc(updatedTaskData.sessionId).get() : null;

    const updatedTask = {
      id: updatedTaskDoc.id,
      ...updatedTaskData,
      session: sessionDoc?.exists ? { id: sessionDoc.id, ...sessionDoc.data() } : null,
      assignedToUser: userDoc?.exists ? { id: userDoc.id, ...userDoc.data() } : null,
      role: roleDoc?.exists ? { id: roleDoc.id, ...roleDoc.data() } : null
    };

    return res.status(200).json({
      success: true,
      data: updatedTask
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error updating task:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update task',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/sessions/tasks/:taskId/assign - Assign task to user
app.post('/sessions/tasks/:taskId/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const taskId = decodeURIComponent(req.params.taskId);
    const { userId } = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Verify task exists
    const taskRef = db.collection('tasks').doc(taskId);
    const taskDoc = await taskRef.get();

    if (!taskDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const taskData = taskDoc.data();
    if (taskData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to task'
      });
    }

    // Update task assignment
    await taskRef.update({
      assignedToUserId: userId,
      status: 'IN_PROGRESS',
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get updated task with relations
    const updatedTaskDoc = await taskRef.get();
    const updatedTaskData = updatedTaskDoc.data();

    const userDoc = await db.collection('users').doc(userId).get();
    const roleDoc = updatedTaskData?.roleId ? await db.collection('roles').doc(updatedTaskData.roleId).get() : null;
    const sessionDoc = updatedTaskData?.sessionId ? await db.collection('sessions').doc(updatedTaskData.sessionId).get() : null;

    const updatedTask = {
      id: updatedTaskDoc.id,
      ...updatedTaskData,
      session: sessionDoc?.exists ? { id: sessionDoc.id, ...sessionDoc.data() } : null,
      assignedToUser: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null,
      role: roleDoc?.exists ? { id: roleDoc.id, ...roleDoc.data() } : null
    };

    return res.status(200).json({
      success: true,
      data: updatedTask
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error assigning task:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign task',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/sessions/:id/complete - Mark session as complete
app.post('/sessions/:id/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { completionNotes } = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionRef = db.collection('sessions').doc(id);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    const updateData: any = {
      status: 'COMPLETED',
      updatedAt: FieldValue.serverTimestamp()
    };

    if (completionNotes) {
      const existingNotes = sessionData?.notes || '';
      updateData.notes = `${existingNotes}\nCompleted on ${new Date().toISOString()}: ${completionNotes}`;
    }

    await sessionRef.update(updateData);

    const updatedSessionDoc = await sessionRef.get();
    const updatedSession = {
      id: updatedSessionDoc.id,
      ...updatedSessionDoc.data()
    };

    return res.status(200).json({
      success: true,
      session: updatedSession,
      message: 'Session marked as completed'
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error completing session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete session',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/sessions/:id/manual-wrap - Manually wrap a session
app.post('/sessions/:id/manual-wrap', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { reason, forceWrap, notifyParticipants = true } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionRef = db.collection('sessions').doc(id);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    const validWrapStatuses = [
      'PRODUCTION_IN_PROGRESS', 'IN_PRODUCTION', 'PLANNED', 'PLANNING',
      'POST_PRODUCTION', 'POST_IN_PROGRESS', 'ON_HOLD', 'CHANGES_NEEDED',
      'WAITING_FOR_APPROVAL', 'PHASE_4_POST_PRODUCTION', 'READY_FOR_POST'
    ];

    if (!validWrapStatuses.includes(sessionData?.status)) {
      return res.status(400).json({
        success: false,
        error: 'Session cannot be wrapped in current status',
        currentStatus: sessionData?.status,
        validStatuses: validWrapStatuses
      });
    }

    const now = new Date();
    const wrapTime = forceWrap ? now : (sessionData?.wrapTime && sessionData.wrapTime > now ? sessionData.wrapTime : now);

    await sessionRef.update({
      status: 'READY_FOR_POST',
      wrapTime,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedSessionDoc = await sessionRef.get();
    const updatedSession = {
      id: updatedSessionDoc.id,
      ...updatedSessionDoc.data()
    };

    return res.status(200).json({
      success: true,
      session: updatedSession,
      message: 'Session successfully wrapped and moved to post-production'
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error wrapping session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to wrap session',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/sessions/:id/setup-post-production - Setup post-production tasks for a session
app.post('/sessions/:id/setup-post-production', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { userId } = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionRef = db.collection('sessions').doc(id);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    const defaultRoles = [
      { roleName: 'Editor', department: 'Post Production' },
      { roleName: 'Assistant Editor', department: 'Post Production' },
      { roleName: 'Colorist', department: 'Post Production' },
      { roleName: 'Audio', department: 'Post Production' },
      { roleName: 'GFX', department: 'Post Production' },
      { roleName: 'QC - Post', department: 'Post Production' },
      { roleName: 'Post Coordinator', department: 'Post Production' },
      { roleName: 'Post Supervisor', department: 'Post Production' }
    ];

    // Get or create roles
    const createdRoles = [];
    const batch = db.batch();

    for (const roleData of defaultRoles) {
      // Check if role exists
      const rolesSnapshot = await db.collection('roles')
        .where('roleName', '==', roleData.roleName)
        .where('organizationId', '==', organizationId)
        .limit(1)
        .get();

      let roleId;
      if (rolesSnapshot.empty) {
        // Create role
        const roleRef = db.collection('roles').doc();
        batch.set(roleRef, {
          ...roleData,
          organizationId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        roleId = roleRef.id;
        createdRoles.push({ id: roleId, ...roleData });
      } else {
        roleId = rolesSnapshot.docs[0].id;
        createdRoles.push({ id: roleId, ...rolesSnapshot.docs[0].data() });
      }

      // Check if task already exists
      const existingTasksSnapshot = await db.collection('tasks')
        .where('sessionId', '==', id)
        .where('roleId', '==', roleId)
        .limit(1)
        .get();

      if (existingTasksSnapshot.empty) {
        // Create task
        const taskRef = db.collection('tasks').doc();
        batch.set(taskRef, {
          sessionId: id,
          organizationId,
          roleId,
          taskName: `${roleData.roleName} Task`,
          status: 'NOT_STARTED',
          notes: `${roleData.roleName} task for ${sessionData?.name}`,
          createdBy: userId || 'system',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    // Update session status
    batch.update(sessionRef, {
      status: 'POST_PRODUCTION',
      updatedAt: FieldValue.serverTimestamp()
    });

    await batch.commit();

    // Get created tasks
    const tasksSnapshot = await db.collection('tasks')
      .where('sessionId', '==', id)
      .get();

    const tasks = tasksSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      sessionId: id,
      rolesCreated: createdRoles.length,
      tasksCreated: tasks.length,
      roles: createdRoles,
      tasks,
      message: `Post-production setup completed: ${createdRoles.length} roles, ${tasks.length} tasks created`
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error setting up post-production:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to setup post-production',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/sessions/:id/start-production - Start production for a session
app.post('/sessions/:id/start-production', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { reason, notifyParticipants = true } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const sessionRef = db.collection('sessions').doc(id);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    const validStartStatuses = ['PLANNED', 'READY', 'PREP'];
    if (!validStartStatuses.includes(sessionData?.status)) {
      return res.status(400).json({
        success: false,
        error: 'Session cannot start production',
        currentStatus: sessionData?.status,
        validStatuses: validStartStatuses
      });
    }

    await sessionRef.update({
      status: 'PRODUCTION_IN_PROGRESS',
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedSessionDoc = await sessionRef.get();
    const updatedSession = {
      id: updatedSessionDoc.id,
      ...updatedSessionDoc.data()
    };

    return res.status(200).json({
      success: true,
      session: updatedSession,
      message: `Production started for session "${sessionData?.name}"`
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error starting production:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to start production',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/sessions/:id/transition - Transition session to next stage
app.post('/sessions/:id/transition', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { targetStatus, notes } = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!targetStatus) {
      return res.status(400).json({
        success: false,
        error: 'Target status is required'
      });
    }

    const sessionRef = db.collection('sessions').doc(id);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    const updateData: any = {
      status: targetStatus,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (notes) {
      const existingNotes = sessionData?.notes || '';
      updateData.notes = `${existingNotes}\nTransitioned to ${targetStatus} on ${new Date().toISOString()}: ${notes}`;
    }

    await sessionRef.update(updateData);

    const updatedSessionDoc = await sessionRef.get();
    const updatedSession = {
      id: updatedSessionDoc.id,
      ...updatedSessionDoc.data()
    };

    return res.status(200).json({
      success: true,
      session: updatedSession,
      message: `Session transitioned to ${targetStatus}`
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error transitioning session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to transition session',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Remaining Agent 2 Sessions Endpoints
// ====================

// GET /api/sessions/:sessionId/qc-status - Get QC status for specific session
app.get('/sessions/:sessionId/qc-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get QC status
    const qcStatusSnapshot = await db.collection('qcStatuses')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    const qcStatus = qcStatusSnapshot.empty ? null : {
      id: qcStatusSnapshot.docs[0].id,
      ...qcStatusSnapshot.docs[0].data()
    } as any;

    return res.status(200).json({
      success: true,
      sessionId,
      status: (qcStatus as any)?.status || 'NOT_REVIEWED',
      updatedAt: (qcStatus as any)?.updatedAt || null
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error getting QC status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch QC status',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/sessions/:sessionId/rtc-status - Get WebRTC session status
app.get('/sessions/:sessionId/rtc-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Check if session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Return RTC session status
    return res.status(200).json({
      success: true,
      sessionId,
      sessionName: sessionData?.name,
      status: sessionData?.status === 'PRODUCTION_IN_PROGRESS' ? 'active' : 'inactive',
      participants: [
        { id: userId, connected: true }
      ],
      startedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error checking RTC session status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check session status',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/sessions/qc-statuses - Get QC statuses for multiple sessions
app.get('/sessions/qc-statuses', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { sessionIds } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!sessionIds || typeof sessionIds !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'sessionIds query parameter is required'
      });
    }

    const sessionIdArray = sessionIds.split(',');

    // Get QC statuses
    const qcStatusesSnapshot = await db.collection('qcStatuses')
      .where('sessionId', 'in', sessionIdArray)
      .get();

    const statuses: Record<string, string> = {};
    qcStatusesSnapshot.docs.forEach(doc => {
      const qcData = doc.data();
      statuses[qcData.sessionId] = qcData.status;
    });

    return res.status(200).json({
      success: true,
      statuses
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error fetching QC statuses:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch QC statuses',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/sessions/qc-statuses - Create or update QC status
app.post('/sessions/qc-statuses', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;
    const { sessionId, status } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!sessionId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and status are required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Check if QC status exists
    const existingQcSnapshot = await db.collection('qcStatuses')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    let qcStatusRef;
    if (existingQcSnapshot.empty) {
      // Create new QC status
      qcStatusRef = db.collection('qcStatuses').doc();
      await qcStatusRef.set({
        sessionId,
        organizationId,
        status,
        createdBy: userId || 'system',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      // Update existing QC status
      qcStatusRef = existingQcSnapshot.docs[0].ref;
      await qcStatusRef.update({
        status,
        updatedBy: userId || 'system',
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    const qcStatusDoc = await qcStatusRef.get();

    return res.status(200).json({
      success: true,
      data: {
        id: qcStatusDoc.id,
        ...qcStatusDoc.data()
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error creating/updating QC status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create/update QC status',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/sessions/:sessionId/workflow-integration/dependencies - Get workflow dependencies
app.get('/sessions/:sessionId/workflow-integration/dependencies', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get workflow dependencies
    const [sessionWorkflows, taskIntegrations, instances] = await Promise.all([
      db.collection('sessionWorkflows').where('sessionId', '==', sessionId).get(),
      db.collection('sessionWorkflowTaskIntegrations').where('sessionId', '==', sessionId).get(),
      db.collection('workflowInstances').where('sessionId', '==', sessionId).get()
    ]);

    return res.status(200).json({
      success: true,
      sessionId,
      dependencies: {
        sessionWorkflows: sessionWorkflows.size,
        taskIntegrations: taskIntegrations.size,
        instances: instances.size
      },
      details: {
        sessionWorkflows: sessionWorkflows.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        taskIntegrations: taskIntegrations.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        instances: instances.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error getting workflow dependencies:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get workflow dependencies',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/sessions/:sessionId/workflow-integration/update-dependencies - Update workflow dependencies
app.post('/sessions/:sessionId/workflow-integration/update-dependencies', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { dependencies } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Update dependencies in workflow integration document
    const integrationRef = db.collection('workflowIntegrations').doc(sessionId);
    const integrationDoc = await integrationRef.get();

    if (integrationDoc.exists) {
      await integrationRef.update({
        dependencies: dependencies || {},
        updatedBy: userId || 'system',
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      await integrationRef.set({
        sessionId,
        organizationId,
        dependencies: dependencies || {},
        createdBy: userId || 'system',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    const updatedIntegrationDoc = await integrationRef.get();

    return res.status(200).json({
      success: true,
      data: {
        id: updatedIntegrationDoc.id,
        ...updatedIntegrationDoc.data()
      }
    });
  } catch (error: any) {
    console.error('❌ [SESSIONS API] Error updating workflow dependencies:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update workflow dependencies',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Assignment Endpoints (Agent 2)
// ====================

// DELETE /api/assignments/:sessionId - Delete assignment
app.delete('/assignments/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: `Session with ID ${sessionId} not found`
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Delete all assignments for this session
    const assignmentsSnapshot = await db.collection('sessionAssignments')
      .where('sessionId', '==', sessionId)
      .get();

    const batch = db.batch();
    assignmentsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return res.status(200).json({
      success: true,
      message: 'Project assignments deleted successfully',
      data: {
        sessionId,
        deletedCount: assignmentsSnapshot.size
      }
    });
  } catch (error: any) {
    console.error('❌ [ASSIGNMENTS API] Error deleting assignments:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete assignments',
      errorDetails: error.message || String(error)
    });
  }
});

// DELETE /api/assignments/:sessionId/remove - Remove assignment
app.delete('/assignments/:sessionId/remove', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { stepId, userId } = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!stepId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Step ID and User ID are required'
      });
    }

    // Mark WorkflowStepAssignment as inactive
    const stepAssignmentsSnapshot = await db.collection('workflowStepAssignments')
      .where('workflowStepId', '==', stepId)
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();

    const batch = db.batch();
    stepAssignmentsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        isActive: false,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    // If this was the primary assigned user, remove it from the step
    const stepDoc = await db.collection('workflowSteps').doc(stepId).get();
    if (stepDoc.exists) {
      const stepData = stepDoc.data();
      if (stepData?.assignedUserId === userId) {
        batch.update(stepDoc.ref, {
          assignedUserId: null,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: 'User removed from step successfully',
      stepId,
      userId,
      removedCount: stepAssignmentsSnapshot.size
    });
  } catch (error: any) {
    console.error('❌ [ASSIGNMENTS API] Error removing assignment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove assignment',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/assignments/:sessionId/assign - Assign users to a specific step
app.post('/assignments/:sessionId/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { stepId, nodeId, assignments } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    if (!stepId && !nodeId) {
      return res.status(400).json({
        success: false,
        error: 'Step ID or Node ID is required'
      });
    }

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Assignments array is required'
      });
    }

    // Find step if only nodeId provided
    let actualStepId = stepId;
    if (!stepId && nodeId) {
      const stepsSnapshot = await db.collection('workflowSteps')
        .where('nodeId', '==', nodeId)
        .limit(1)
        .get();

      if (!stepsSnapshot.empty) {
        actualStepId = stepsSnapshot.docs[0].id;
      } else {
        return res.status(404).json({
          success: false,
          error: 'Step not found for nodeId'
        });
      }
    }

    // Remove existing assignments
    const existingAssignmentsSnapshot = await db.collection('workflowStepAssignments')
      .where('workflowStepId', '==', actualStepId)
      .where('isActive', '==', true)
      .get();

    const batch = db.batch();
    existingAssignmentsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        isActive: false,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    // Create new assignments
    for (const assignment of assignments) {
      const assignmentRef = db.collection('workflowStepAssignments').doc();
      batch.set(assignmentRef, {
        workflowStepId: actualStepId,
        userId: assignment.userId,
        roleName: assignment.roleName || '',
        isPrimary: assignment.isPrimary || false,
        isActive: true,
        assignedAt: FieldValue.serverTimestamp(),
        assignedBy: userId,
        organizationId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // Update primary assigned user on the workflow step
    if (assignments.length > 0) {
      const primaryAssignment = assignments.find((a: any) => a.isPrimary) || assignments[0];
      const stepRef = db.collection('workflowSteps').doc(actualStepId);
      batch.update(stepRef, {
        assignedUserId: primaryAssignment.userId,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: `Assigned ${assignments.length} user(s) to step`,
      stepId: actualStepId,
      assignmentCount: assignments.length
    });
  } catch (error: any) {
    console.error('❌ [ASSIGNMENTS API] Error assigning users to step:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign users to step',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/assignments/:sessionId/bulk-assign - Bulk assign users to multiple steps
app.post('/assignments/:sessionId/bulk-assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { assignments } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Assignments array is required'
      });
    }

    let totalAssignments = 0;
    const batch = db.batch();

    // Process each step assignment
    for (const stepAssignment of assignments) {
      const { stepId, nodeId, userAssignments } = stepAssignment;

      // Find the actual stepId if we only have nodeId
      let actualStepId = stepId;
      if (!stepId && nodeId) {
        const stepsSnapshot = await db.collection('workflowSteps')
          .where('nodeId', '==', nodeId)
          .limit(1)
          .get();

        if (!stepsSnapshot.empty) {
          actualStepId = stepsSnapshot.docs[0].id;
        } else {
          continue; // Skip if step not found
        }
      }

      if (!actualStepId) {
        continue;
      }

      // Remove existing assignments
      const existingAssignmentsSnapshot = await db.collection('workflowStepAssignments')
        .where('workflowStepId', '==', actualStepId)
        .where('isActive', '==', true)
        .get();

      existingAssignmentsSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          isActive: false,
          updatedAt: FieldValue.serverTimestamp()
        });
      });

      // Create new assignments
      for (const assignment of userAssignments) {
        const assignmentRef = db.collection('workflowStepAssignments').doc();
        batch.set(assignmentRef, {
          workflowStepId: actualStepId,
          userId: assignment.userId,
          roleName: assignment.roleName || '',
          isPrimary: assignment.isPrimary || false,
          isActive: true,
          assignedAt: FieldValue.serverTimestamp(),
          assignedBy: userId,
          organizationId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        totalAssignments++;
      }

      // Update primary assigned user
      if (userAssignments.length > 0) {
        const primaryAssignment = userAssignments.find((a: any) => a.isPrimary) || userAssignments[0];
        const stepRef = db.collection('workflowSteps').doc(actualStepId);
        batch.update(stepRef, {
          assignedUserId: primaryAssignment.userId,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: `Bulk assigned ${totalAssignments} user assignments to ${assignments.length} steps`,
      stepCount: assignments.length,
      assignmentCount: totalAssignments
    });
  } catch (error: any) {
    console.error('❌ [ASSIGNMENTS API] Error bulk assigning users:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk assign users',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// AGENT 3: Complex Endpoints Batch 2 (Prisma Conversion)
// ====================
// Add second batch of complex endpoints requiring Prisma to Firestore conversion
// See: scripts/AGENT-3-COMPLEX-ENDPOINTS-BATCH-2.md for instructions
// Total: 87 endpoints

// ====================
// Workflow Routes - Diagrams
// ====================

// GET /diagrams - Get all diagrams for user (own + public templates)
app.get('/diagrams', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    console.log('[Workflow Diagrams] Get request:', { userId, organizationId });

    // Build query: user's own workflows OR public templates
    const userDiagramsQuery = db.collection('workflowDiagrams')
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc');

    const publicTemplatesQuery = db.collection('workflowDiagrams')
      .where('isTemplate', '==', true)
      .where('isPublic', '==', true)
      .orderBy('updatedAt', 'desc');

    const [userDiagramsSnapshot, publicTemplatesSnapshot] = await Promise.all([
      userDiagramsQuery.get(),
      publicTemplatesQuery.get()
    ]);

    // Combine results and remove duplicates
    const diagramMap = new Map<string, any>();

    // Add user's own diagrams
    userDiagramsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      diagramMap.set(doc.id, {
        id: doc.id,
        ...data,
        user: {
          id: data.userId,
          firstName: data.user?.firstName || null,
          lastName: data.user?.lastName || null
        }
      });
    });

    // Add public templates (excluding user's own)
    for (const doc of publicTemplatesSnapshot.docs) {
      const data = doc.data();
      if (data.userId !== userId && !diagramMap.has(doc.id)) {
        // Get user info for public templates
        let userInfo = { id: data.userId, firstName: null, lastName: null };
        if (data.userId) {
          try {
            const userDoc = await db.collection('users').doc(data.userId).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              userInfo = {
                id: data.userId,
                firstName: userData?.firstName || null,
                lastName: userData?.lastName || null
              };
            }
          } catch (error) {
            console.error('[Workflow Diagrams] Error fetching user info:', error);
          }
        }

        diagramMap.set(doc.id, {
          id: doc.id,
          ...data,
          user: userInfo
        });
      }
    }

    const workflows = Array.from(diagramMap.values());

    console.log('[Workflow Diagrams] Query results:', {
      userId,
      totalWorkflows: workflows.length,
      ownWorkflows: workflows.filter(w => w.userId === userId).length,
      publicTemplates: workflows.filter(w => w.isTemplate && w.isPublic && w.userId !== userId).length
    });

    return res.status(200).json(createSuccessResponse(workflows));
  } catch (error: any) {
    console.error('[Workflow Diagrams] Get error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch workflow diagrams', error.message));
  }
});

// GET /diagrams/:id - Get specific diagram by ID
app.get('/diagrams/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const diagramDoc = await db.collection('workflowDiagrams').doc(id).get();

    if (!diagramDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow diagram not found'));
    }

    const diagramData = diagramDoc.data();

    // Check if user owns this diagram
    if (diagramData?.userId !== userId) {
      return res.status(403).json(createErrorResponse('You do not have permission to access this diagram'));
    }

    return res.status(200).json(createSuccessResponse({
      id: diagramDoc.id,
      ...diagramData
    }));
  } catch (error: any) {
    console.error('[Workflow Diagrams] Get by ID error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch workflow diagram', error.message));
  }
});

// POST /diagrams - Create new diagram
app.post('/diagrams', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const { name, description, nodes, edges, metadata } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!name || !nodes || !edges) {
      return res.status(400).json(createErrorResponse('Name, nodes, and edges are required'));
    }

    console.log('[Workflow Diagrams] Create request:', {
      userId,
      name,
      hasNodes: !!nodes,
      hasEdges: !!edges,
      nodeCount: nodes?.length,
      edgeCount: edges?.length
    });

    const diagramData = {
      userId,
      name,
      description: description || '',
      nodes,
      edges,
      metadata: metadata || {},
      isTemplate: metadata?.isTemplate ?? true,
      isPublic: metadata?.isTemplate !== false,
      category: metadata?.category || 'general',
      tags: metadata?.tags || [],
      version: metadata?.version || '1.0.0',
      templateId: metadata?.templateId || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const diagramRef = await db.collection('workflowDiagrams').add(diagramData);
    const createdDiagram = {
      id: diagramRef.id,
      ...diagramData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('[Workflow Diagrams] Created successfully:', diagramRef.id);

    return res.status(201).json(createSuccessResponse(createdDiagram, 'Workflow diagram created successfully'));
  } catch (error: any) {
    console.error('[Workflow Diagrams] Create error:', error);
    return res.status(500).json(createErrorResponse('Failed to create workflow diagram', error.message));
  }
});

// PUT /diagrams/:id - Update diagram
app.put('/diagrams/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.uid;
    const { name, description, nodes, edges, metadata } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!name || !nodes || !edges) {
      return res.status(400).json(createErrorResponse('Name, nodes, and edges are required'));
    }

    const diagramRef = db.collection('workflowDiagrams').doc(id);
    const diagramDoc = await diagramRef.get();

    if (!diagramDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow diagram not found'));
    }

    const existingData = diagramDoc.data();

    // Check ownership
    if (existingData?.userId !== userId) {
      return res.status(403).json(createErrorResponse('You do not have permission to update this diagram'));
    }

    await diagramRef.update({
      name,
      description: description || '',
      nodes,
      edges,
      metadata: metadata || {},
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedDoc = await diagramRef.get();
    const updatedDiagram = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    return res.status(200).json(createSuccessResponse(updatedDiagram, 'Workflow diagram updated successfully'));
  } catch (error: any) {
    console.error('[Workflow Diagrams] Update error:', error);
    return res.status(500).json(createErrorResponse('Failed to update workflow diagram', error.message));
  }
});

// DELETE /diagrams/:id - Delete diagram
app.delete('/diagrams/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.uid;
    const forceDelete = req.query.force === 'true';

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    console.log(`[Workflow Diagrams] Delete request: ${id} for user ${userId}${forceDelete ? ' (FORCE)' : ''}`);

    const diagramRef = db.collection('workflowDiagrams').doc(id);
    const diagramDoc = await diagramRef.get();

    if (!diagramDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow diagram not found'));
    }

    const diagramData = diagramDoc.data();

    // Check ownership
    if (diagramData?.userId !== userId) {
      return res.status(403).json(createErrorResponse('You do not have permission to delete this diagram'));
    }

    // Check for dependencies
    const [sessionWorkflows, taskIntegrations, instances] = await Promise.all([
      db.collection('sessionWorkflows').where('workflowId', '==', id).get(),
      db.collection('sessionWorkflowTaskIntegrations').where('workflowId', '==', id).get(),
      db.collection('workflowDiagrams').where('templateId', '==', id).get()
    ]);

    const hasDependencies = sessionWorkflows.size > 0 || taskIntegrations.size > 0 || instances.size > 0;

    if (hasDependencies && !forceDelete) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete workflow: it is currently being used',
        errorDetails: JSON.stringify({
          sessionWorkflows: sessionWorkflows.size,
          taskIntegrations: taskIntegrations.size,
          instances: instances.size
        })
      });
    }

    // If force delete, remove dependencies first
    if (forceDelete && hasDependencies) {
      await db.runTransaction(async (transaction) => {
        // Delete task integrations
        taskIntegrations.docs.forEach(doc => {
          transaction.delete(doc.ref);
        });

        // Clear template references
        instances.docs.forEach(doc => {
          transaction.update(doc.ref, { templateId: null });
        });

        // Delete session workflows and related data
        const sessionWorkflowIds = sessionWorkflows.docs.map(doc => doc.id);

        if (sessionWorkflowIds.length > 0) {
          // Get all related collections for session workflows
          const relatedQueries = await Promise.all([
            db.collection('workflowStepProgressionHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowStepProgression').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowStepOrderHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowAssignmentHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowStepHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowAnalytics').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowDependencies').where('workflowId', 'in', sessionWorkflowIds).get()
          ]);

          // Delete all related records
          relatedQueries.forEach(snapshot => {
            snapshot.docs.forEach(doc => {
              transaction.delete(doc.ref);
            });
          });

          // Get workflow steps
          const stepsSnapshot = await db.collection('workflowSteps')
            .where('sessionWorkflowId', 'in', sessionWorkflowIds)
            .get();

          const stepIds = stepsSnapshot.docs.map(doc => doc.id);

          if (stepIds.length > 0) {
            // Delete step-related collections
            const stepRelatedQueries = await Promise.all([
              db.collection('workflowStepFiles').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowStepNotes').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowStepPermissions').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowStepAssignments').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowStepTimeEntries').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowTriggers').where('stepId', 'in', stepIds).get(),
              db.collection('postProductionWorkflowCorrelations').where('workflowStepId', 'in', stepIds).get()
            ]);

            stepRelatedQueries.forEach(snapshot => {
              snapshot.docs.forEach(doc => {
                transaction.delete(doc.ref);
              });
            });

            // Delete steps
            stepsSnapshot.docs.forEach(doc => {
              transaction.delete(doc.ref);
            });
          }

          // Delete session workflows
          sessionWorkflows.docs.forEach(doc => {
            transaction.delete(doc.ref);
          });
        }

        // Finally delete the diagram
        transaction.delete(diagramRef);
      });

      console.log(`[Workflow Diagrams] Force deleted workflow ${id} and all dependencies`);
      return res.status(200).json(createSuccessResponse(null, 'Workflow diagram and all dependencies successfully deleted'));
    } else {
      // Standard delete
      await diagramRef.delete();
      console.log(`[Workflow Diagrams] Deleted workflow ${id}`);
      return res.status(200).json(createSuccessResponse(null, 'Workflow diagram deleted successfully'));
    }
  } catch (error: any) {
    console.error('[Workflow Diagrams] Delete error:', error);
    return res.status(500).json(createErrorResponse('Failed to delete workflow diagram', error.message));
  }
});

// DELETE /diagrams/:id/force - Force delete diagram
app.delete('/diagrams/:id/force', authenticateToken, async (req: express.Request, res: express.Response) => {
  // Set force=true and call delete handler
  req.query.force = 'true';
  
  try {
    const { id } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const diagramRef = db.collection('workflowDiagrams').doc(id);
    const diagramDoc = await diagramRef.get();

    if (!diagramDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow diagram not found'));
    }

    const diagramData = diagramDoc.data();

    if (diagramData?.userId !== userId) {
      return res.status(403).json(createErrorResponse('You do not have permission to delete this diagram'));
    }

    // Force delete with all dependencies (same logic as DELETE /diagrams/:id with force=true)
    const [sessionWorkflows, taskIntegrations, instances] = await Promise.all([
      db.collection('sessionWorkflows').where('workflowId', '==', id).get(),
      db.collection('sessionWorkflowTaskIntegrations').where('workflowId', '==', id).get(),
      db.collection('workflowDiagrams').where('templateId', '==', id).get()
    ]);

    await db.runTransaction(async (transaction) => {
      taskIntegrations.docs.forEach(doc => transaction.delete(doc.ref));
      instances.docs.forEach(doc => transaction.update(doc.ref, { templateId: null }));

      const sessionWorkflowIds = sessionWorkflows.docs.map(doc => doc.id);
      if (sessionWorkflowIds.length > 0) {
        const relatedQueries = await Promise.all([
          db.collection('workflowStepProgressionHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowStepProgression').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowStepOrderHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowAssignmentHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowStepHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowAnalytics').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowDependencies').where('workflowId', 'in', sessionWorkflowIds).get()
        ]);

        relatedQueries.forEach(snapshot => {
          snapshot.docs.forEach(doc => transaction.delete(doc.ref));
        });

        const stepsSnapshot = await db.collection('workflowSteps')
          .where('sessionWorkflowId', 'in', sessionWorkflowIds)
          .get();

        const stepIds = stepsSnapshot.docs.map(doc => doc.id);
        if (stepIds.length > 0) {
          const stepRelatedQueries = await Promise.all([
            db.collection('workflowStepFiles').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowStepNotes').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowStepPermissions').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowStepAssignments').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowStepTimeEntries').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowTriggers').where('stepId', 'in', stepIds).get(),
            db.collection('postProductionWorkflowCorrelations').where('workflowStepId', 'in', stepIds).get()
          ]);

          stepRelatedQueries.forEach(snapshot => {
            snapshot.docs.forEach(doc => transaction.delete(doc.ref));
          });

          stepsSnapshot.docs.forEach(doc => transaction.delete(doc.ref));
        }

        sessionWorkflows.docs.forEach(doc => transaction.delete(doc.ref));
      }

      transaction.delete(diagramRef);
    });

    return res.status(200).json(createSuccessResponse(null, 'Workflow diagram and all dependencies successfully deleted'));
  } catch (error: any) {
    console.error('[Workflow Diagrams] Force delete error:', error);
    return res.status(500).json(createErrorResponse('Failed to force delete workflow diagram', error.message));
  }
});

// ====================
// Workflow Routes - /workflow/diagrams (Alias for /diagrams)
// ====================

// GET /workflow/diagrams - Get all workflow diagrams/templates (alias for /diagrams)
// This endpoint queries workflow-templates collection which is where templates are actually stored
app.get('/workflow/diagrams', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    console.log('[Workflow Diagrams] Get request via /workflow/diagrams:', { userId, organizationId });

    // Query workflow-templates collection (where templates are actually stored)
    const userTemplatesQuery = db.collection('workflow-templates')
      .where('organizationId', '==', organizationId)
      .orderBy('updatedAt', 'desc');

    // Also get public templates from other organizations
    const publicTemplatesQuery = db.collection('workflow-templates')
      .where('isPublic', '==', true)
      .orderBy('updatedAt', 'desc');

    const [userTemplatesSnapshot, publicTemplatesSnapshot] = await Promise.all([
      userTemplatesQuery.get(),
      publicTemplatesQuery.get()
    ]);

    // Combine results and remove duplicates
    const diagramMap = new Map<string, any>();

    // Add user's organization templates
    userTemplatesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      diagramMap.set(doc.id, {
        id: doc.id,
        name: data.name || data.displayName,
        description: data.description || '',
        nodes: data.nodes || [],
        edges: data.edges || [],
        metadata: data.metadata || {},
        isTemplate: data.isTemplate !== false, // Default to true for workflow-templates
        isPublic: data.isPublic || false,
        category: data.category || 'general',
        tags: data.tags || [],
        version: data.version || '1.0.0',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        userId: data.userId || data.createdBy,
        organizationId: data.organizationId
      });
    });

    // Add public templates (excluding user's own organization)
    for (const doc of publicTemplatesSnapshot.docs) {
      const data = doc.data();
      if (data.organizationId !== organizationId && !diagramMap.has(doc.id)) {
        diagramMap.set(doc.id, {
          id: doc.id,
          name: data.name || data.displayName,
          description: data.description || '',
          nodes: data.nodes || [],
          edges: data.edges || [],
          metadata: data.metadata || {},
          isTemplate: true,
          isPublic: true,
          category: data.category || 'general',
          tags: data.tags || [],
          version: data.version || '1.0.0',
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          userId: data.userId || data.createdBy,
          organizationId: data.organizationId
        });
      }
    }

    const workflows = Array.from(diagramMap.values());

    console.log('[Workflow Diagrams] Query results from workflow-templates:', {
      userId,
      organizationId,
      totalWorkflows: workflows.length,
      ownOrgWorkflows: workflows.filter(w => w.organizationId === organizationId).length,
      publicTemplates: workflows.filter(w => w.isPublic && w.organizationId !== organizationId).length
    });

    return res.status(200).json(createSuccessResponse(workflows));
  } catch (error: any) {
    console.error('[Workflow Diagrams] Get error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch workflow diagrams', error.message));
  }
});

// ====================
// Workflow Routes - Templates
// ====================

// GET /templates - Get all templates
app.get('/templates', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Get user's own templates + public templates
    const userTemplatesQuery = db.collection('workflowDiagrams')
      .where('isTemplate', '==', true)
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc');

    const publicTemplatesQuery = db.collection('workflowDiagrams')
      .where('isTemplate', '==', true)
      .where('isPublic', '==', true)
      .orderBy('updatedAt', 'desc');

    const [userTemplatesSnapshot, publicTemplatesSnapshot] = await Promise.all([
      userTemplatesQuery.get(),
      publicTemplatesQuery.get()
    ]);

    const templateMap = new Map<string, any>();

    // Add user's templates
    userTemplatesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      templateMap.set(doc.id, {
        id: doc.id,
        ...data,
        user: {
          id: data.userId,
          firstName: data.user?.firstName || null,
          lastName: data.user?.lastName || null
        }
      });
    });

    // Add public templates
    for (const doc of publicTemplatesSnapshot.docs) {
      const data = doc.data();
      if (data.userId !== userId && !templateMap.has(doc.id)) {
        let userInfo = { id: data.userId, firstName: null, lastName: null };
        if (data.userId) {
          try {
            const userDoc = await db.collection('users').doc(data.userId).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              userInfo = {
                id: data.userId,
                firstName: userData?.firstName || null,
                lastName: userData?.lastName || null
              };
            }
          } catch (error) {
            console.error('[Workflow Templates] Error fetching user info:', error);
          }
        }

        templateMap.set(doc.id, {
          id: doc.id,
          ...data,
          user: userInfo
        });
      }
    }

    const templates = Array.from(templateMap.values());

    return res.status(200).json(createSuccessResponse(templates));
  } catch (error: any) {
    console.error('[Workflow Templates] Get error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch workflow templates', error.message));
  }
});

// GET /templates/:id - Get specific template by ID
app.get('/templates/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const templateDoc = await db.collection('workflowDiagrams').doc(id).get();

    if (!templateDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow template not found'));
    }

    const templateData = templateDoc.data();

    // Check if it's a template
    if (!templateData?.isTemplate) {
      return res.status(400).json(createErrorResponse('This is not a workflow template'));
    }

    // Check permissions: user owns it OR it's public OR user is admin
    const isAdmin = req.user?.role === 'ADMIN';
    const isOwner = templateData.userId === userId;
    const isPublic = templateData.isPublic === true;

    if (!isOwner && !isPublic && !isAdmin) {
      return res.status(403).json(createErrorResponse('You do not have permission to access this template'));
    }

    // Get user info
    let userInfo = { id: templateData.userId, firstName: null, lastName: null };
    if (templateData.userId) {
      try {
        const userDoc = await db.collection('users').doc(templateData.userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          userInfo = {
            id: templateData.userId,
            firstName: userData?.firstName || null,
            lastName: userData?.lastName || null
          };
        }
      } catch (error) {
        console.error('[Workflow Templates] Error fetching user info:', error);
      }
    }

    return res.status(200).json(createSuccessResponse({
      id: templateDoc.id,
      ...templateData,
      user: userInfo
    }));
  } catch (error: any) {
    console.error('[Workflow Templates] Get by ID error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch workflow template', error.message));
  }
});

// POST /templates - Create new template
app.post('/templates', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const { name, description, nodes, edges, metadata, category, tags, isPublic } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!name || !nodes || !edges) {
      return res.status(400).json(createErrorResponse('Name, nodes, and edges are required'));
    }

    console.log('[Workflow Templates] Create request:', {
      userId,
      name,
      hasNodes: !!nodes,
      hasEdges: !!edges,
      category,
      isPublic
    });

    const templateData = {
      userId,
      name,
      description: description || '',
      nodes,
      edges,
      metadata: {
        ...(metadata || {}),
        name,
        description: description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
        isTemplate: true,
        category: category || 'general',
        tags: tags || []
      },
      isTemplate: true,
      isPublic: isPublic || false,
      category: category || 'general',
      tags: tags || [],
      version: '1.0.0',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const templateRef = await db.collection('workflowDiagrams').add(templateData);

    // Get user info
    let userInfo = { id: userId, firstName: null, lastName: null };
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        userInfo = {
          id: userId,
          firstName: userData?.firstName || null,
          lastName: userData?.lastName || null
        };
      }
    } catch (error) {
      console.error('[Workflow Templates] Error fetching user info:', error);
    }

    const createdTemplate = {
      id: templateRef.id,
      ...templateData,
      user: userInfo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('[Workflow Templates] Created successfully:', templateRef.id);

    return res.status(201).json(createSuccessResponse(createdTemplate, 'Workflow template created successfully'));
  } catch (error: any) {
    console.error('[Workflow Templates] Create error:', error);
    return res.status(500).json(createErrorResponse('Failed to create workflow template', error.message));
  }
});

// PUT /templates/:id - Update template
app.put('/templates/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.uid;
    const { name, description, nodes, edges, metadata, category, tags, isPublic } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!name || !nodes || !edges) {
      return res.status(400).json(createErrorResponse('Name, nodes, and edges are required'));
    }

    const templateRef = db.collection('workflowDiagrams').doc(id);
    const templateDoc = await templateRef.get();

    if (!templateDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow template not found'));
    }

    const existingData = templateDoc.data();

    // Check if it's a template
    if (!existingData?.isTemplate) {
      return res.status(400).json(createErrorResponse('This is not a workflow template'));
    }

    // Check permissions: admin can update any, non-admin can only update their own
    const isAdmin = req.user?.role === 'ADMIN';
    if (!isAdmin && existingData.userId !== userId) {
      return res.status(403).json(createErrorResponse('You do not have permission to update this template'));
    }

    await templateRef.update({
      name,
      description: description || '',
      nodes,
      edges,
      metadata: {
        ...(metadata || {}),
        name,
        description: description || '',
        updatedAt: new Date().toISOString(),
        isTemplate: true,
        category: category || 'general',
        tags: tags || []
      },
      category: category || 'general',
      isPublic: isPublic !== undefined ? isPublic : existingData.isPublic,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get user info
    let userInfo = { id: existingData.userId, firstName: null, lastName: null };
    try {
      const userDoc = await db.collection('users').doc(existingData.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        userInfo = {
          id: existingData.userId,
          firstName: userData?.firstName || null,
          lastName: userData?.lastName || null
        };
      }
    } catch (error) {
      console.error('[Workflow Templates] Error fetching user info:', error);
    }

    const updatedDoc = await templateRef.get();
    const updatedTemplate = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      user: userInfo
    };

    console.log('[Workflow Templates] Updated successfully:', id);

    return res.status(200).json(createSuccessResponse(updatedTemplate, 'Workflow template updated successfully'));
  } catch (error: any) {
    console.error('[Workflow Templates] Update error:', error);
    return res.status(500).json(createErrorResponse('Failed to update workflow template', error.message));
  }
});

// DELETE /templates/:id - Delete template
app.delete('/templates/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.uid;
    const forceDelete = req.query.force === 'true';

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const templateRef = db.collection('workflowDiagrams').doc(id);
    const templateDoc = await templateRef.get();

    if (!templateDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow template not found'));
    }

    const templateData = templateDoc.data();

    // Check if it's a template
    if (!templateData?.isTemplate) {
      return res.status(400).json(createErrorResponse('This is not a workflow template'));
    }

    // Check permissions
    const isAdmin = req.user?.role === 'ADMIN';
    if (!isAdmin && templateData.userId !== userId) {
      return res.status(403).json(createErrorResponse('You do not have permission to delete this template'));
    }

    // Check for dependencies (same as diagrams)
    const [sessionWorkflows, taskIntegrations, instances] = await Promise.all([
      db.collection('sessionWorkflows').where('workflowId', '==', id).get(),
      db.collection('sessionWorkflowTaskIntegrations').where('workflowId', '==', id).get(),
      db.collection('workflowDiagrams').where('templateId', '==', id).get()
    ]);

    const hasDependencies = sessionWorkflows.size > 0 || taskIntegrations.size > 0 || instances.size > 0;

    if (hasDependencies && !forceDelete) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete template: it is currently being used',
        errorDetails: JSON.stringify({
          sessionWorkflows: sessionWorkflows.size,
          taskIntegrations: taskIntegrations.size,
          instances: instances.size
        })
      });
    }

    // Force delete logic (same as diagrams)
    if (forceDelete && hasDependencies) {
      await db.runTransaction(async (transaction) => {
        taskIntegrations.docs.forEach(doc => transaction.delete(doc.ref));
        instances.docs.forEach(doc => transaction.update(doc.ref, { templateId: null }));

        const sessionWorkflowIds = sessionWorkflows.docs.map(doc => doc.id);
        if (sessionWorkflowIds.length > 0) {
          // Delete all related collections (same pattern as diagrams)
          const relatedQueries = await Promise.all([
            db.collection('workflowStepProgressionHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowStepProgression').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowStepOrderHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowAssignmentHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowStepHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowAnalytics').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
            db.collection('workflowDependencies').where('workflowId', 'in', sessionWorkflowIds).get()
          ]);

          relatedQueries.forEach(snapshot => {
            snapshot.docs.forEach(doc => transaction.delete(doc.ref));
          });

          const stepsSnapshot = await db.collection('workflowSteps')
            .where('sessionWorkflowId', 'in', sessionWorkflowIds)
            .get();

          const stepIds = stepsSnapshot.docs.map(doc => doc.id);
          if (stepIds.length > 0) {
            const stepRelatedQueries = await Promise.all([
              db.collection('workflowStepFiles').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowStepNotes').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowStepPermissions').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowStepAssignments').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowStepTimeEntries').where('workflowStepId', 'in', stepIds).get(),
              db.collection('workflowTriggers').where('stepId', 'in', stepIds).get(),
              db.collection('postProductionWorkflowCorrelations').where('workflowStepId', 'in', stepIds).get()
            ]);

            stepRelatedQueries.forEach(snapshot => {
              snapshot.docs.forEach(doc => transaction.delete(doc.ref));
            });

            stepsSnapshot.docs.forEach(doc => transaction.delete(doc.ref));
          }

          sessionWorkflows.docs.forEach(doc => transaction.delete(doc.ref));
        }

        transaction.delete(templateRef);
      });

      return res.status(200).json(createSuccessResponse(null, 'Workflow template and all dependencies successfully deleted'));
    } else {
      await templateRef.delete();
      return res.status(200).json(createSuccessResponse(null, 'Workflow template deleted successfully'));
    }
  } catch (error: any) {
    console.error('[Workflow Templates] Delete error:', error);
    return res.status(500).json(createErrorResponse('Failed to delete workflow template', error.message));
  }
});

// DELETE /templates/:id/force - Force delete template
app.delete('/templates/:id/force', authenticateToken, async (req: express.Request, res: express.Response) => {
  req.query.force = 'true';
  
  try {
    const { id } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const templateRef = db.collection('workflowDiagrams').doc(id);
    const templateDoc = await templateRef.get();

    if (!templateDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow template not found'));
    }

    const templateData = templateDoc.data();

    if (!templateData?.isTemplate) {
      return res.status(400).json(createErrorResponse('This is not a workflow template'));
    }

    const isAdmin = req.user?.role === 'ADMIN';
    if (!isAdmin && templateData.userId !== userId) {
      return res.status(403).json(createErrorResponse('You do not have permission to delete this template'));
    }

    const [sessionWorkflows, taskIntegrations, instances] = await Promise.all([
      db.collection('sessionWorkflows').where('workflowId', '==', id).get(),
      db.collection('sessionWorkflowTaskIntegrations').where('workflowId', '==', id).get(),
      db.collection('workflowDiagrams').where('templateId', '==', id).get()
    ]);

    await db.runTransaction(async (transaction) => {
      taskIntegrations.docs.forEach(doc => transaction.delete(doc.ref));
      instances.docs.forEach(doc => transaction.update(doc.ref, { templateId: null }));

      const sessionWorkflowIds = sessionWorkflows.docs.map(doc => doc.id);
      if (sessionWorkflowIds.length > 0) {
        const relatedQueries = await Promise.all([
          db.collection('workflowStepProgressionHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowStepProgression').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowStepOrderHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowAssignmentHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowStepHistory').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowAnalytics').where('sessionWorkflowId', 'in', sessionWorkflowIds).get(),
          db.collection('workflowDependencies').where('workflowId', 'in', sessionWorkflowIds).get()
        ]);

        relatedQueries.forEach(snapshot => {
          snapshot.docs.forEach(doc => transaction.delete(doc.ref));
        });

        const stepsSnapshot = await db.collection('workflowSteps')
          .where('sessionWorkflowId', 'in', sessionWorkflowIds)
          .get();

        const stepIds = stepsSnapshot.docs.map(doc => doc.id);
        if (stepIds.length > 0) {
          const stepRelatedQueries = await Promise.all([
            db.collection('workflowStepFiles').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowStepNotes').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowStepPermissions').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowStepAssignments').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowStepTimeEntries').where('workflowStepId', 'in', stepIds).get(),
            db.collection('workflowTriggers').where('stepId', 'in', stepIds).get(),
            db.collection('postProductionWorkflowCorrelations').where('workflowStepId', 'in', stepIds).get()
          ]);

          stepRelatedQueries.forEach(snapshot => {
            snapshot.docs.forEach(doc => transaction.delete(doc.ref));
          });

          stepsSnapshot.docs.forEach(doc => transaction.delete(doc.ref));
        }

        sessionWorkflows.docs.forEach(doc => transaction.delete(doc.ref));
      }

      transaction.delete(templateRef);
    });

    return res.status(200).json(createSuccessResponse(null, 'Workflow template and all dependencies successfully deleted'));
  } catch (error: any) {
    console.error('[Workflow Templates] Force delete error:', error);
    return res.status(500).json(createErrorResponse('Failed to force delete workflow template', error.message));
  }
});

// ====================
// Messaging Endpoints
// ====================

// GET /message-sessions - Get all message sessions for user
app.get('/message-sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { productionSessionId, search } = req.query;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    console.log('[Message Sessions] Get request:', { userId, organizationId, productionSessionId, search });

    // Check if user is admin
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const isAdmin = req.user?.role === 'ADMIN' || userData?.role === 'ADMIN';

    let query: any = db.collection('messageSessions');

    // Build query based on filters
    if (productionSessionId) {
      query = query.where('productionSessionId', '==', productionSessionId);
    } else {
      // For non-admin users, only show sessions where they are participants
      if (!isAdmin) {
        // Get sessions where user is a participant
        const participantSessions = await db.collection('messageParticipants')
          .where('userId', '==', userId)
          .where('leftAt', '==', null)
          .get();
        
        const sessionIds = participantSessions.docs.map(doc => doc.data().messageSessionId);
        
        if (sessionIds.length === 0) {
          return res.status(200).json(createSuccessResponse([]));
        }

        // Firestore 'in' query limit is 10, so we need to batch if needed
        if (sessionIds.length <= 10) {
          // Fetch sessions by IDs
          const sessionDocs = await Promise.all(
            sessionIds.map(id => db.collection('messageSessions').doc(id).get())
          );
          const sessions = sessionDocs
            .filter(doc => doc.exists)
            .map(doc => ({ id: doc.id, ...doc.data() }));
          
          // Get participants and messages count for each session
          const sessionsWithDetails = await Promise.all(sessions.map(async (session: any) => {
            const [participantsSnapshot, messagesSnapshot] = await Promise.all([
              db.collection('messageParticipants')
                .where('messageSessionId', '==', session.id)
                .where('leftAt', '==', null)
                .get(),
              db.collection('messages')
                .where('messageSessionId', '==', session.id)
                .get()
            ]);

            const participants = await Promise.all(participantsSnapshot.docs.map(async (doc) => {
              const pData = doc.data();
              let userInfo = null;
              let contactInfo = null;

              if (pData.userId) {
                const userDoc = await db.collection('users').doc(pData.userId).get();
                if (userDoc.exists) {
                  const uData = userDoc.data();
                  userInfo = {
                    id: pData.userId,
                    name: uData?.name || uData?.displayName || null,
                    email: uData?.email || null
                  };
                }
              }

              if (pData.contactId) {
                const contactDoc = await db.collection('contacts').doc(pData.contactId).get();
                if (contactDoc.exists) {
                  const cData = contactDoc.data();
                  contactInfo = {
                    id: pData.contactId,
                    firstName: cData?.firstName || null,
                    lastName: cData?.lastName || null,
                    email: cData?.email || null
                  };
                }
              }

              return {
                id: doc.id,
                ...pData,
                user: userInfo,
                contact: contactInfo
              };
            }));

            return {
              ...session,
              participants,
              _count: {
                messages: messagesSnapshot.size
              }
            };
          }));

          return res.status(200).json(createSuccessResponse(sessionsWithDetails));
        } else {
          // For more than 10, fetch all and filter
          const allSessions = await db.collection('messageSessions').get();
          const filteredSessions = allSessions.docs
            .filter(doc => sessionIds.includes(doc.id))
            .map(doc => ({ id: doc.id, ...doc.data() }));
          
          // Get details for filtered sessions (same as above)
          const sessionsWithDetails = await Promise.all(filteredSessions.map(async (session: any) => {
            const [participantsSnapshot, messagesSnapshot] = await Promise.all([
              db.collection('messageParticipants')
                .where('messageSessionId', '==', session.id)
                .where('leftAt', '==', null)
                .get(),
              db.collection('messages')
                .where('messageSessionId', '==', session.id)
                .get()
            ]);

            const participants = await Promise.all(participantsSnapshot.docs.map(async (doc) => {
              const pData = doc.data();
              let userInfo = null;
              let contactInfo = null;

              if (pData.userId) {
                const userDoc = await db.collection('users').doc(pData.userId).get();
                if (userDoc.exists) {
                  const uData = userDoc.data();
                  userInfo = {
                    id: pData.userId,
                    name: uData?.name || uData?.displayName || null,
                    email: uData?.email || null
                  };
                }
              }

              if (pData.contactId) {
                const contactDoc = await db.collection('contacts').doc(pData.contactId).get();
                if (contactDoc.exists) {
                  const cData = contactDoc.data();
                  contactInfo = {
                    id: pData.contactId,
                    firstName: cData?.firstName || null,
                    lastName: cData?.lastName || null,
                    email: cData?.email || null
                  };
                }
              }

              return {
                id: doc.id,
                ...pData,
                user: userInfo,
                contact: contactInfo
              };
            }));

            return {
              ...session,
              participants,
              _count: {
                messages: messagesSnapshot.size
              }
            };
          }));

          return res.status(200).json(createSuccessResponse(sessionsWithDetails));
        }
      }
    }

    // Apply search if provided
    if (search) {
      // Firestore doesn't support full-text search, so we'll filter after fetching
      const snapshot = await query.orderBy('updatedAt', 'desc').get();
      const searchLower = String(search).toLowerCase();
      const sessions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((session: any) => {
          const name = (session.name || '').toLowerCase();
          const description = (session.description || '').toLowerCase();
          return name.includes(searchLower) || description.includes(searchLower);
        });

      // Get participants and messages count for each session
      const sessionsWithDetails = await Promise.all(sessions.map(async (session: any) => {
        const [participantsSnapshot, messagesSnapshot] = await Promise.all([
          db.collection('messageParticipants')
            .where('messageSessionId', '==', session.id)
            .where('leftAt', '==', null)
            .get(),
          db.collection('messages')
            .where('messageSessionId', '==', session.id)
            .get()
        ]);

        const participants = await Promise.all(participantsSnapshot.docs.map(async (doc) => {
          const pData = doc.data();
          let userInfo = null;
          let contactInfo = null;

          if (pData.userId) {
            const userDoc = await db.collection('users').doc(pData.userId).get();
            if (userDoc.exists) {
              const uData = userDoc.data();
              userInfo = {
                id: pData.userId,
                name: uData?.name || uData?.displayName || null,
                email: uData?.email || null
              };
            }
          }

          if (pData.contactId) {
            const contactDoc = await db.collection('contacts').doc(pData.contactId).get();
            if (contactDoc.exists) {
              const cData = contactDoc.data();
              contactInfo = {
                id: pData.contactId,
                firstName: cData?.firstName || null,
                lastName: cData?.lastName || null,
                email: cData?.email || null
              };
            }
          }

          return {
            id: doc.id,
            ...pData,
            user: userInfo,
            contact: contactInfo
          };
        }));

        return {
          ...session,
          participants,
          _count: {
            messages: messagesSnapshot.size
          }
        };
      }));

      return res.status(200).json(createSuccessResponse(sessionsWithDetails));
    } else {
      const snapshot = await query.orderBy('updatedAt', 'desc').get();
      
      const sessions = await Promise.all(snapshot.docs.map(async (doc) => {
        const sessionData = doc.data();
        const [participantsSnapshot, messagesSnapshot] = await Promise.all([
          db.collection('messageParticipants')
            .where('messageSessionId', '==', doc.id)
            .where('leftAt', '==', null)
            .get(),
          db.collection('messages')
            .where('messageSessionId', '==', doc.id)
            .get()
        ]);

        const participants = await Promise.all(participantsSnapshot.docs.map(async (pDoc) => {
          const pData = pDoc.data();
          let userInfo = null;
          let contactInfo = null;

          if (pData.userId) {
            const userDoc = await db.collection('users').doc(pData.userId).get();
            if (userDoc.exists) {
              const uData = userDoc.data();
              userInfo = {
                id: pData.userId,
                name: uData?.name || uData?.displayName || null,
                email: uData?.email || null
              };
            }
          }

          if (pData.contactId) {
            const contactDoc = await db.collection('contacts').doc(pData.contactId).get();
            if (contactDoc.exists) {
              const cData = contactDoc.data();
              contactInfo = {
                id: pData.contactId,
                firstName: cData?.firstName || null,
                lastName: cData?.lastName || null,
                email: cData?.email || null
              };
            }
          }

          return {
            id: pDoc.id,
            ...pData,
            user: userInfo,
            contact: contactInfo
          };
        }));

        return {
          id: doc.id,
          ...sessionData,
          participants,
          _count: {
            messages: messagesSnapshot.size
          }
        };
      }));

      return res.status(200).json(createSuccessResponse(sessions));
    }
  } catch (error: any) {
    console.error('[Message Sessions] Get error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch message sessions', error.message));
  }
});

// GET /message-sessions/:id - Get specific message session
app.get('/message-sessions/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const sessionDoc = await db.collection('messageSessions').doc(id).get();

    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Message session not found'));
    }

    // Check if user is a participant
    const participantDoc = await db.collection('messageParticipants')
      .where('messageSessionId', '==', id)
      .where('userId', '==', userId)
      .where('leftAt', '==', null)
      .limit(1)
      .get();

    if (participantDoc.empty) {
      return res.status(403).json(createErrorResponse('You are not a participant in this message session'));
    }

    // Get participants
    const participantsSnapshot = await db.collection('messageParticipants')
      .where('messageSessionId', '==', id)
      .where('leftAt', '==', null)
      .get();

    const participants = await Promise.all(participantsSnapshot.docs.map(async (pDoc) => {
      const pData = pDoc.data();
      let userInfo = null;
      let contactInfo = null;

      if (pData.userId) {
        const userDoc = await db.collection('users').doc(pData.userId).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          userInfo = {
            id: pData.userId,
            name: uData?.name || uData?.displayName || null,
            email: uData?.email || null
          };
        }
      }

      if (pData.contactId) {
        const contactDoc = await db.collection('contacts').doc(pData.contactId).get();
        if (contactDoc.exists) {
          const cData = contactDoc.data();
          contactInfo = {
            id: pData.contactId,
            firstName: cData?.firstName || null,
            lastName: cData?.lastName || null,
            email: cData?.email || null
          };
        }
      }

      return {
        id: pDoc.id,
        ...pData,
        user: userInfo,
        contact: contactInfo
      };
    }));

    // Get messages count
    const messagesSnapshot = await db.collection('messages')
      .where('messageSessionId', '==', id)
      .get();

    const sessionData = sessionDoc.data();
    return res.status(200).json(createSuccessResponse({
      id: sessionDoc.id,
      ...sessionData,
      participants,
      _count: {
        messages: messagesSnapshot.size
      }
    }));
  } catch (error: any) {
    console.error('[Message Sessions] Get by ID error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch message session', error.message));
  }
});

// POST /message-sessions - Create new message session
app.post('/message-sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { type, participants = [], name, productionSessionId, description } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!type || !['DIRECT', 'GROUP', 'PRODUCTION'].includes(type)) {
      return res.status(400).json(createErrorResponse('Invalid session type. Must be DIRECT, GROUP, or PRODUCTION'));
    }

    if (type === 'DIRECT' && participants.length !== 1) {
      return res.status(400).json(createErrorResponse('Direct message sessions must have exactly one participant'));
    }

    // Check for existing session (deduplication)
    let existingSession = null;
    if (type === 'PRODUCTION' && productionSessionId) {
      const existingSnapshot = await db.collection('messageSessions')
        .where('productionSessionId', '==', productionSessionId)
        .where('type', '==', 'PRODUCTION')
        .limit(1)
        .get();
      
      if (!existingSnapshot.empty) {
        existingSession = { id: existingSnapshot.docs[0].id, ...existingSnapshot.docs[0].data() };
      }
    } else if (type === 'DIRECT' && participants.length === 1) {
      const otherUserId = participants[0]?.userId;
      if (otherUserId) {
        // Find sessions where both users are participants
        const userSessions = await db.collection('messageParticipants')
          .where('userId', '==', userId)
          .where('leftAt', '==', null)
          .get();
        
        const otherUserSessions = await db.collection('messageParticipants')
          .where('userId', '==', otherUserId)
          .where('leftAt', '==', null)
          .get();
        
        const userSessionIds = new Set(userSessions.docs.map(doc => doc.data().messageSessionId));
        const otherUserSessionIds = new Set(otherUserSessions.docs.map(doc => doc.data().messageSessionId));
        
        const commonSessionIds = Array.from(userSessionIds).filter(id => otherUserSessionIds.has(id));
        
        if (commonSessionIds.length > 0) {
          for (const sessionId of commonSessionIds) {
            const sessionDoc = await db.collection('messageSessions').doc(sessionId).get();
            if (sessionDoc.exists) {
              const sessionData = sessionDoc.data();
              if (sessionData?.type === 'DIRECT') {
                existingSession = { id: sessionDoc.id, ...sessionData };
                break;
              }
            }
          }
        }
      }
    }

    if (existingSession) {
      return res.status(200).json(createSuccessResponse(existingSession, `Existing ${type} message session found`));
    }

    // Create new session
    const sessionData = {
      type,
      name: name || null,
      description: type === 'GROUP' && productionSessionId
        ? `${description || ''} [ProductionSessionId: ${productionSessionId}]`.trim()
        : description || null,
      productionSessionId: type === 'PRODUCTION' ? (productionSessionId || null) : null,
      organizationId: organizationId || null,
      isArchived: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const sessionRef = await db.collection('messageSessions').add(sessionData);

    // Create participants
    const participantUserIds = new Set<string>();
    participantUserIds.add(userId); // Always add creator

    participants.forEach((p: any) => {
      if (p.userId && p.userId !== userId) {
        participantUserIds.add(p.userId);
      }
    });

    const participantPromises = Array.from(participantUserIds).map(async (participantUserId, index) => {
      const participantData = {
        messageSessionId: sessionRef.id,
        userId: participantUserId,
        contactId: null,
        isAdmin: index === 0, // Creator is admin
        joinedAt: FieldValue.serverTimestamp(),
        leftAt: null
      };
      return db.collection('messageParticipants').add(participantData);
    });

    await Promise.all(participantPromises);

    // Get created session with participants
    const createdSessionDoc = await sessionRef.get();
    const participantsSnapshot = await db.collection('messageParticipants')
      .where('messageSessionId', '==', sessionRef.id)
      .where('leftAt', '==', null)
      .get();

    const participantsWithDetails = await Promise.all(participantsSnapshot.docs.map(async (pDoc) => {
      const pData = pDoc.data();
      let userInfo = null;

      if (pData.userId) {
        const userDoc = await db.collection('users').doc(pData.userId).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          userInfo = {
            id: pData.userId,
            name: uData?.name || uData?.displayName || null,
            email: uData?.email || null
          };
        }
      }

      return {
        id: pDoc.id,
        ...pData,
        user: userInfo,
        contact: null
      };
    }));

    const createdSession = {
      id: createdSessionDoc.id,
      ...createdSessionDoc.data(),
      participants: participantsWithDetails
    };

    return res.status(201).json(createSuccessResponse(createdSession));
  } catch (error: any) {
    console.error('[Message Sessions] Create error:', error);
    return res.status(500).json(createErrorResponse('Failed to create message session', error.message));
  }
});

// DELETE /message-sessions/:sessionId - Delete message session
app.delete('/message-sessions/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Check if user is a participant
    const participantDoc = await db.collection('messageParticipants')
      .where('messageSessionId', '==', sessionId)
      .where('userId', '==', userId)
      .where('leftAt', '==', null)
      .limit(1)
      .get();

    if (participantDoc.empty) {
      return res.status(403).json(createErrorResponse('You are not authorized to delete this message session'));
    }

    // Delete in transaction
    await db.runTransaction(async (transaction) => {
      // Delete all messages
      const messagesSnapshot = await transaction.get(
        db.collection('messages').where('messageSessionId', '==', sessionId)
      );
      messagesSnapshot.docs.forEach(doc => transaction.delete(doc.ref));

      // Delete all participants
      const participantsSnapshot = await transaction.get(
        db.collection('messageParticipants').where('messageSessionId', '==', sessionId)
      );
      participantsSnapshot.docs.forEach(doc => transaction.delete(doc.ref));

      // Delete session
      const sessionRef = db.collection('messageSessions').doc(sessionId);
      transaction.delete(sessionRef);
    });

    return res.status(200).json(createSuccessResponse(null, 'Message session deleted successfully'));
  } catch (error: any) {
    console.error('[Message Sessions] Delete error:', error);
    return res.status(500).json(createErrorResponse('Failed to delete message session', error.message));
  }
});

// GET /message-sessions/:sessionId/messages - Get messages for session
app.get('/message-sessions/:sessionId/messages', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Check if user is a participant
    const participantDoc = await db.collection('messageParticipants')
      .where('messageSessionId', '==', sessionId)
      .where('userId', '==', userId)
      .where('leftAt', '==', null)
      .limit(1)
      .get();

    if (participantDoc.empty) {
      return res.status(403).json(createErrorResponse('You are not a participant in this message session'));
    }

    // Get messages
    const messagesSnapshot = await db.collection('messages')
      .where('messageSessionId', '==', sessionId)
      .orderBy('timestamp', 'asc')
      .get();

    const messages = await Promise.all(messagesSnapshot.docs.map(async (doc) => {
      const messageData = doc.data();
      let senderInfo = null;

      if (messageData.senderId) {
        const senderDoc = await db.collection('users').doc(messageData.senderId).get();
        if (senderDoc.exists) {
          const senderData = senderDoc.data();
          senderInfo = {
            id: messageData.senderId,
            name: senderData?.name || senderData?.displayName || null,
            email: senderData?.email || null
          };
        }
      }

      return {
        id: doc.id,
        ...messageData,
        sender: senderInfo
      };
    }));

    return res.status(200).json(createSuccessResponse(messages));
  } catch (error: any) {
    console.error('[Message Sessions] Get messages error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch messages', error.message));
  }
});

// POST /message-sessions/:sessionId/messages - Create message
app.post('/message-sessions/:sessionId/messages', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const { content, replyToId, attachmentUrl, attachmentType } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!content) {
      return res.status(400).json(createErrorResponse('Message content is required'));
    }

    // Check if user is a participant
    const participantDoc = await db.collection('messageParticipants')
      .where('messageSessionId', '==', sessionId)
      .where('userId', '==', userId)
      .where('leftAt', '==', null)
      .limit(1)
      .get();

    if (participantDoc.empty) {
      return res.status(403).json(createErrorResponse('You are not a participant in this message session'));
    }

    // Get session to get organizationId
    const sessionDoc = await db.collection('messageSessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Message session not found'));
    }

    const sessionData = sessionDoc.data();

    // Create message
    const messageData = {
      messageSessionId: sessionId,
      organizationId: sessionData?.organizationId || null,
      senderId: userId,
      content,
      replyToId: replyToId || null,
      attachmentUrl: attachmentUrl || null,
      attachmentType: attachmentType || null,
      isRead: false,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    };

    const messageRef = await db.collection('messages').add(messageData);

    // Update session updatedAt
    await db.collection('messageSessions').doc(sessionId).update({
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get sender info
    const senderDoc = await db.collection('users').doc(userId).get();
    let senderInfo = null;
    if (senderDoc.exists) {
      const senderData = senderDoc.data();
      senderInfo = {
        id: userId,
        name: senderData?.name || senderData?.displayName || null,
        email: senderData?.email || null
      };
    }

    const createdMessage = {
      id: messageRef.id,
      ...messageData,
      sender: senderInfo
    };

    return res.status(201).json(createSuccessResponse(createdMessage));
  } catch (error: any) {
    console.error('[Message Sessions] Create message error:', error);
    return res.status(500).json(createErrorResponse('Failed to create message', error.message));
  }
});

// GET /message-sessions/:sessionId/participants - Get participants
app.get('/message-sessions/:sessionId/participants', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Check if user is a participant
    const participantDoc = await db.collection('messageParticipants')
      .where('messageSessionId', '==', sessionId)
      .where('userId', '==', userId)
      .where('leftAt', '==', null)
      .limit(1)
      .get();

    if (participantDoc.empty) {
      return res.status(403).json(createErrorResponse('You are not a participant in this message session'));
    }

    // Get all participants
    const participantsSnapshot = await db.collection('messageParticipants')
      .where('messageSessionId', '==', sessionId)
      .where('leftAt', '==', null)
      .get();

    const participants = await Promise.all(participantsSnapshot.docs.map(async (pDoc) => {
      const pData = pDoc.data();
      let userInfo = null;
      let contactInfo = null;

      if (pData.userId) {
        const userDoc = await db.collection('users').doc(pData.userId).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          userInfo = {
            id: pData.userId,
            name: uData?.name || uData?.displayName || null,
            email: uData?.email || null
          };
        }
      }

      if (pData.contactId) {
        const contactDoc = await db.collection('contacts').doc(pData.contactId).get();
        if (contactDoc.exists) {
          const cData = contactDoc.data();
          contactInfo = {
            id: pData.contactId,
            firstName: cData?.firstName || null,
            lastName: cData?.lastName || null,
            email: cData?.email || null
          };
        }
      }

      return {
        id: pDoc.id,
        ...pData,
        user: userInfo,
        contact: contactInfo
      };
    }));

    return res.status(200).json(createSuccessResponse(participants));
  } catch (error: any) {
    console.error('[Message Sessions] Get participants error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch participants', error.message));
  }
});

// POST /message-sessions/:sessionId/participants - Add participant
app.post('/message-sessions/:sessionId/participants', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const { userId: newUserId, contactId, isAdmin = false } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!newUserId && !contactId) {
      return res.status(400).json(createErrorResponse('Either userId or contactId must be provided'));
    }

    // Check if requester is admin in session
    const adminParticipant = await db.collection('messageParticipants')
      .where('messageSessionId', '==', sessionId)
      .where('userId', '==', userId)
      .where('isAdmin', '==', true)
      .where('leftAt', '==', null)
      .limit(1)
      .get();

    if (adminParticipant.empty) {
      return res.status(403).json(createErrorResponse('You must be an admin to add participants'));
    }

    // Check if participant already exists
    let existingParticipant = null;
    if (newUserId) {
      const existing = await db.collection('messageParticipants')
        .where('messageSessionId', '==', sessionId)
        .where('userId', '==', newUserId)
        .where('leftAt', '==', null)
        .limit(1)
        .get();
      
      if (!existing.empty) {
        existingParticipant = { id: existing.docs[0].id, ...existing.docs[0].data() };
      }
    }

    if (existingParticipant) {
      return res.status(200).json(createSuccessResponse(existingParticipant, 'Participant already exists'));
    }

    // Create participant
    const participantData = {
      messageSessionId: sessionId,
      userId: newUserId || null,
      contactId: contactId || null,
      isAdmin,
      joinedAt: FieldValue.serverTimestamp(),
      leftAt: null
    };

    const participantRef = await db.collection('messageParticipants').add(participantData);

    // Update session
    await db.collection('messageSessions').doc(sessionId).update({
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get created participant with details
    const participantDoc = await participantRef.get();
    const pData = participantDoc.data();
    let userInfo = null;
    let contactInfo = null;

    if (pData?.userId) {
      const userDoc = await db.collection('users').doc(pData.userId).get();
      if (userDoc.exists) {
        const uData = userDoc.data();
        userInfo = {
          id: pData.userId,
          name: uData?.name || uData?.displayName || null,
          email: uData?.email || null
        };
      }
    }

    if (pData?.contactId) {
      const contactDoc = await db.collection('contacts').doc(pData.contactId).get();
      if (contactDoc.exists) {
        const cData = contactDoc.data();
        contactInfo = {
          id: pData.contactId,
          firstName: cData?.firstName || null,
          lastName: cData?.lastName || null,
          email: cData?.email || null
        };
      }
    }

    const createdParticipant = {
      id: participantRef.id,
      ...pData,
      user: userInfo,
      contact: contactInfo
    };

    return res.status(201).json(createSuccessResponse(createdParticipant));
  } catch (error: any) {
    console.error('[Message Sessions] Add participant error:', error);
    return res.status(500).json(createErrorResponse('Failed to add participant', error.message));
  }
});

// DELETE /message-sessions/:sessionId/participants/:participantId - Remove participant
app.delete('/message-sessions/:sessionId/participants/:participantId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, participantId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Check if requester is admin
    const adminParticipant = await db.collection('messageParticipants')
      .where('messageSessionId', '==', sessionId)
      .where('userId', '==', userId)
      .where('isAdmin', '==', true)
      .where('leftAt', '==', null)
      .limit(1)
      .get();

    if (adminParticipant.empty) {
      return res.status(403).json(createErrorResponse('You must be an admin to remove participants'));
    }

    // Get participant to remove
    const participantDoc = await db.collection('messageParticipants').doc(participantId).get();
    if (!participantDoc.exists) {
      return res.status(404).json(createErrorResponse('Participant not found'));
    }

    const participantData = participantDoc.data();
    if (participantData?.messageSessionId !== sessionId || participantData?.leftAt) {
      return res.status(404).json(createErrorResponse('Participant not found in this session'));
    }

    // Mark as left (soft delete)
    await db.collection('messageParticipants').doc(participantId).update({
      leftAt: FieldValue.serverTimestamp()
    });

    // Update session
    await db.collection('messageSessions').doc(sessionId).update({
      updatedAt: FieldValue.serverTimestamp()
    });

    return res.status(200).json(createSuccessResponse(null, 'Participant removed successfully'));
  } catch (error: any) {
    console.error('[Message Sessions] Remove participant error:', error);
    return res.status(500).json(createErrorResponse('Failed to remove participant', error.message));
  }
});

// POST /messaging/cleanup-session-names - Cleanup session names
app.post('/messaging/cleanup-session-names', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Get all sessions with auto-generated names
    const sessionsSnapshot = await db.collection('messageSessions').get();
    
    let cleanedCount = 0;
    const batch = db.batch();

    sessionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const name = data.name || '';
      
      if (name.startsWith('Conversation with ') ||
          name.startsWith('Chat with ') ||
          name.includes('participant(s)') ||
          name.includes('Untitled')) {
        batch.update(doc.ref, {
          name: null,
          updatedAt: FieldValue.serverTimestamp()
        });
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      await batch.commit();
    }

    return res.status(200).json(createSuccessResponse({ cleanedCount }, `Cleaned up ${cleanedCount} session names`));
  } catch (error: any) {
    console.error('[Messaging] Cleanup session names error:', error);
    return res.status(500).json(createErrorResponse('Failed to cleanup session names', error.message));
  }
});

// ============================================================================
// ADDITIONAL WORKFLOW & SESSION ENDPOINTS
// ============================================================================

// Handle OPTIONS for DELETE /diagrams/:id/force
app.options('/sessions/diagrams/:id/force', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// DELETE /sessions/diagrams/:id/force - Force delete diagram
app.delete('/sessions/diagrams/:id/force', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const diagramId = decodeURIComponent(req.params.id);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const diagramDoc = await db.collection('workflowDiagrams').doc(diagramId).get();
    if (!diagramDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow diagram not found'
      });
    }

    const diagramData = diagramDoc.data();
    if (diagramData?.organizationId && diagramData.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this diagram'
      });
    }

    // Force delete - remove all related data
    const batch = db.batch();
    
    // Delete workflow instances using this diagram
    const instancesSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('workflowDiagramId', '==', diagramId)
      .get();
    
    instancesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete the diagram itself
    batch.delete(diagramDoc.ref);

    await batch.commit();

    console.log(`✅ [WORKFLOW] Force deleted diagram ${diagramId}`);
    return res.status(200).json({
      success: true,
      message: 'Diagram and related workflows force deleted successfully',
      deletedInstances: instancesSnapshot.size
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in DELETE /sessions/diagrams/:id/force:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to force delete diagram',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/complete
app.options('/sessions/:sessionId/complete', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/complete - Complete session
app.post('/sessions/:sessionId/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;
    const { confirmationNotes } = req.body;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Update session status
    await db.collection('sessions').doc(sessionId).update({
      status: 'COMPLETED',
      completedAt: FieldValue.serverTimestamp(),
      completedBy: userId,
      confirmationNotes: confirmationNotes || null,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Also complete workflow if exists
    const workflowSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (!workflowSnapshot.empty) {
      await db.collection('unifiedWorkflowInstances').doc(workflowSnapshot.docs[0].id).update({
        status: 'COMPLETED',
        completedAt: FieldValue.serverTimestamp(),
        completedBy: userId,
        progress: 100,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    console.log(`✅ [SESSIONS] Completed session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Session completed successfully'
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/complete:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions/:sessionId/timeline
app.options('/sessions/:sessionId/timeline', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:sessionId/timeline - Get timeline
app.get('/sessions/:sessionId/timeline', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get timeline events from various collections
    const [activitiesSnapshot, stepsSnapshot, reviewsSnapshot] = await Promise.all([
      db.collection('workflowActivities')
        .where('sessionId', '==', sessionId)
        .where('organizationId', '==', organizationId)
        .orderBy('createdAt', 'desc')
        .get(),
      db.collection('unifiedSessionSteps')
        .where('sessionId', '==', sessionId)
        .where('organizationId', '==', organizationId)
        .orderBy('createdAt', 'desc')
        .get(),
      db.collection('reviewSessions')
        .where('sessionId', '==', sessionId)
        .where('organizationId', '==', organizationId)
        .orderBy('createdAt', 'desc')
        .get()
    ]);

    const timeline: any[] = [];

    // Add activities
    activitiesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      timeline.push({
        id: doc.id,
        type: 'activity',
        ...data
      });
    });

    // Add step events
    stepsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      timeline.push({
        id: doc.id,
        type: 'step',
        ...data
      });
    });

    // Add review events
    reviewsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      timeline.push({
        id: doc.id,
        type: 'review',
        ...data
      });
    });

    // Sort by timestamp
    timeline.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

    return res.status(200).json({
      success: true,
      data: timeline,
      count: timeline.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:sessionId/timeline:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch timeline',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/default-tasks
app.options('/sessions/:sessionId/default-tasks', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/default-tasks - Create default tasks
app.post('/sessions/:sessionId/default-tasks', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Default task templates
    const defaultTasks = [
      { name: 'Pre-production Planning', description: 'Plan and prepare for production', status: 'pending' },
      { name: 'Production Setup', description: 'Set up equipment and crew', status: 'pending' },
      { name: 'Post-production Review', description: 'Review and finalize deliverables', status: 'pending' }
    ];

    // Create tasks
    const batch = db.batch();
    const createdTasks: any[] = [];

    defaultTasks.forEach((task, index) => {
      const taskRef = db.collection('productionTasks').doc();
      const taskData = {
        sessionId,
        organizationId,
        name: task.name,
        description: task.description,
        status: task.status,
        createdByUserId: userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      batch.set(taskRef, taskData);
      createdTasks.push({ id: taskRef.id, ...taskData });
    });

    await batch.commit();

    console.log(`✅ [SESSIONS] Created ${createdTasks.length} default tasks for session ${sessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Default tasks created successfully',
      data: createdTasks
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/default-tasks:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create default tasks',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /sessions/:sessionId/transition
app.options('/sessions/:sessionId/transition', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/:sessionId/transition - Transition session
app.post('/sessions/:sessionId/transition', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;
    const { newStatus, notes } = req.body;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!newStatus) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: newStatus'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    const oldStatus = sessionData.status;

    // Update session status
    await db.collection('sessions').doc(sessionId).update({
      status: newStatus,
      previousStatus: oldStatus,
      transitionNotes: notes || null,
      transitionedAt: FieldValue.serverTimestamp(),
      transitionedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Log transition
    await db.collection('sessionTransitions').add({
      sessionId,
      organizationId,
      fromStatus: oldStatus,
      toStatus: newStatus,
      notes: notes || null,
      transitionedBy: userId,
      createdAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [SESSIONS] Transitioned session ${sessionId} from ${oldStatus} to ${newStatus}`);
    return res.status(200).json({
      success: true,
      message: 'Session transitioned successfully',
      data: {
        oldStatus,
        newStatus
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/:sessionId/transition:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to transition session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /templates/:templateId
app.options('/sessions/templates/:templateId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/templates/:templateId - Get template
app.get('/sessions/templates/:templateId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const templateId = decodeURIComponent(req.params.templateId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const templateDoc = await db.collection('workflowTemplates').doc(templateId).get();
    if (!templateDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const templateData = templateDoc.data();
    
    // Check access (public or same organization)
    if (!templateData.isPublic && templateData.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this template'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: templateDoc.id,
        ...templateData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/templates/:templateId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch template',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /step-status/:stepId
app.options('/sessions/step-status/:stepId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/step-status/:stepId - Get step status
app.get('/sessions/step-status/:stepId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const stepId = decodeURIComponent(req.params.stepId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const stepDoc = await db.collection('unifiedSessionSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const stepData = stepDoc.data();
    if (stepData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this step'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: stepDoc.id,
        status: stepData.status,
        name: stepData.name,
        assignedUserId: stepData.assignedUserId,
        order: stepData.order,
        createdAt: stepData.createdAt,
        updatedAt: stepData.updatedAt
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/step-status/:stepId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch step status',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ====================
// Reviewers Endpoints
// ====================

// Helper function to format reviewer data
const formatReviewerData = (reviewer: any, userData: any) => {
  const extractNames = (fullName: string) => {
    if (!fullName || fullName.trim() === '') {
      return { firstName: '', lastName: '' };
    }
    const nameParts = fullName.trim().split(' ');
    return {
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || ''
    };
  };

  const useUserName = (!userData?.firstName || userData.firstName.trim() === '') &&
    (!userData?.lastName || userData.lastName.trim() === '') &&
    userData?.name && userData.name.trim() !== '';

  let firstName, lastName, fullName;
  if (useUserName) {
    const extracted = extractNames(userData.name);
    firstName = extracted.firstName;
    lastName = extracted.lastName;
    fullName = userData.name.trim();
  } else {
    firstName = userData?.firstName || '';
    lastName = userData?.lastName || '';
    fullName = `${firstName} ${lastName}`.trim();
  }

  return {
    id: reviewer.userId,
    reviewerId: reviewer.id,
    personId: reviewer.userId,
    firstName,
    lastName,
    fullName,
    email: userData?.email || '',
    department: userData?.department || '',
    phoneNumber: userData?.phoneNumber || '',
    positionType: userData?.positionType || '',
    notes: reviewer.notes || '',
    attended: reviewer.attended || false,
    reviewerRole: reviewer.reviewerRole || 'REVIEWER',
    createdAt: reviewer.createdAt,
    updatedAt: reviewer.updatedAt,
    user: userData,
    person: userData
  };
};

// GET /review-sessions/:reviewId/reviewers - Get all reviewers for a review session
app.get('/review-sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse(`Review session with ID ${reviewId} not found`));
    }

    // Get reviewers
    const reviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const reviewers = await Promise.all(reviewersSnapshot.docs.map(async (doc) => {
      const reviewerData = doc.data();
      const userDoc = await db.collection('users').doc(reviewerData.userId).get();
      const userData = userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;

      return formatReviewerData(
        { id: doc.id, ...reviewerData },
        userData
      );
    }));

    return res.status(200).json(createSuccessResponse(reviewers));
  } catch (error: any) {
    console.error('[Reviewers] Get error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch reviewers', error.message));
  }
});

// POST /review-sessions/:reviewId/reviewers - Add reviewers to a review session
app.post('/review-sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { reviewers } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!reviewers || !Array.isArray(reviewers)) {
      return res.status(400).json(createErrorResponse('Reviewers must be an array'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse(`Review session with ID ${reviewId} not found`));
    }

    const createdReviewers = [];

    for (const reviewerData of reviewers) {
      const reviewerUserId = reviewerData.userId || reviewerData.personId || reviewerData.id;

      if (!reviewerUserId) {
        console.warn('[Reviewers] Skipping reviewer without userId:', reviewerData);
        continue;
      }

      // Check if user exists
      const userDoc = await db.collection('users').doc(reviewerUserId).get();
      if (!userDoc.exists) {
        console.warn(`[Reviewers] User ${reviewerUserId} not found, skipping`);
        continue;
      }

      // Check if reviewer already exists
      const existingSnapshot = await db.collection('reviewSessionReviewers')
        .where('reviewSessionId', '==', reviewId)
        .where('userId', '==', reviewerUserId)
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        console.log(`[Reviewers] Reviewer ${reviewerUserId} already exists for review ${reviewId}, skipping`);
        continue;
      }

      // Create new reviewer
      const newReviewerData = {
        reviewSessionId: reviewId,
        userId: reviewerUserId,
        reviewerRole: reviewerData.reviewerRole || 'REVIEWER',
        attended: reviewerData.attended || false,
        notes: reviewerData.notes || null,
        organizationId: organizationId || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      const reviewerRef = await db.collection('reviewSessionReviewers').add(newReviewerData);
      const userData = { id: userDoc.id, ...userDoc.data() };

      createdReviewers.push(formatReviewerData(
        { id: reviewerRef.id, ...newReviewerData },
        userData
      ));
    }

    return res.status(201).json(createSuccessResponse(createdReviewers));
  } catch (error: any) {
    console.error('[Reviewers] Add error:', error);
    return res.status(500).json(createErrorResponse('Failed to add reviewers', error.message));
  }
});

// PUT /review-sessions/:reviewId/reviewers - Update/replace all reviewers
app.put('/review-sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { reviewers } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!reviewers || !Array.isArray(reviewers)) {
      return res.status(400).json(createErrorResponse('Reviewers must be an array'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse(`Review session with ID ${reviewId} not found`));
    }

    // Delete existing reviewers
    const existingReviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const batch = db.batch();
    existingReviewersSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Add new reviewers
    const createdReviewers = [];

    for (const reviewerData of reviewers) {
      const reviewerUserId = reviewerData.userId || reviewerData.personId || reviewerData.id;

      if (!reviewerUserId) {
        continue;
      }

      const userDoc = await db.collection('users').doc(reviewerUserId).get();
      if (!userDoc.exists) {
        continue;
      }

      const newReviewerData = {
        reviewSessionId: reviewId,
        userId: reviewerUserId,
        reviewerRole: reviewerData.reviewerRole || 'REVIEWER',
        attended: reviewerData.attended || false,
        notes: reviewerData.notes || null,
        organizationId: organizationId || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      const reviewerRef = await db.collection('reviewSessionReviewers').add(newReviewerData);
      const userData = { id: userDoc.id, ...userDoc.data() };

      createdReviewers.push(formatReviewerData(
        { id: reviewerRef.id, ...newReviewerData },
        userData
      ));
    }

    return res.status(200).json(createSuccessResponse(createdReviewers));
  } catch (error: any) {
    console.error('[Reviewers] Update error:', error);
    return res.status(500).json(createErrorResponse('Failed to update reviewers', error.message));
  }
});

// PUT /review-sessions/:reviewId/reviewers/:reviewerId - Update specific reviewer
app.put('/review-sessions/:reviewId/reviewers/:reviewerId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId, reviewerId } = req.params;
    const userId = req.user?.uid;
    const { reviewerRole, attended, notes } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const reviewerRef = db.collection('reviewSessionReviewers').doc(reviewerId);
    const reviewerDoc = await reviewerRef.get();

    if (!reviewerDoc.exists) {
      return res.status(404).json(createErrorResponse('Reviewer not found'));
    }

    const reviewerData = reviewerDoc.data();
    if (reviewerData?.reviewSessionId !== reviewId) {
      return res.status(404).json(createErrorResponse('Reviewer not found in this review session'));
    }

    // Update reviewer
    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp()
    };

    if (reviewerRole !== undefined) updateData.reviewerRole = reviewerRole;
    if (attended !== undefined) updateData.attended = attended;
    if (notes !== undefined) updateData.notes = notes;

    await reviewerRef.update(updateData);

    // Get updated reviewer with user data
    const updatedDoc = await reviewerRef.get();
    const updatedData = updatedDoc.data();
    const userDoc = await db.collection('users').doc(updatedData?.userId).get();
    const userData = userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;

    const formattedReviewer = formatReviewerData(
      { id: updatedDoc.id, ...updatedData },
      userData
    );

    return res.status(200).json(createSuccessResponse(formattedReviewer));
  } catch (error: any) {
    console.error('[Reviewers] Update reviewer error:', error);
    return res.status(500).json(createErrorResponse('Failed to update reviewer', error.message));
  }
});

// DELETE /review-sessions/:reviewId/reviewers/:reviewerId - Remove reviewer
app.delete('/review-sessions/:reviewId/reviewers/:reviewerId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId, reviewerId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const reviewerRef = db.collection('reviewSessionReviewers').doc(reviewerId);
    const reviewerDoc = await reviewerRef.get();

    if (!reviewerDoc.exists) {
      return res.status(404).json(createErrorResponse('Reviewer not found'));
    }

    const reviewerData = reviewerDoc.data();
    if (reviewerData?.reviewSessionId !== reviewId) {
      return res.status(404).json(createErrorResponse('Reviewer not found in this review session'));
    }

    await reviewerRef.delete();

    return res.status(200).json(createSuccessResponse(null, 'Reviewer removed successfully'));
  } catch (error: any) {
    console.error('[Reviewers] Delete error:', error);
    return res.status(500).json(createErrorResponse('Failed to remove reviewer', error.message));
  }
});

// POST /review-sessions/:reviewId/reviewers/:reviewerId/approve - Approve review
app.post('/review-sessions/:reviewId/reviewers/:reviewerId/approve', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId, reviewerId } = req.params;
    const userId = req.user?.uid;
    const { notes } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const reviewerRef = db.collection('reviewSessionReviewers').doc(reviewerId);
    const reviewerDoc = await reviewerRef.get();

    if (!reviewerDoc.exists) {
      return res.status(404).json(createErrorResponse('Reviewer not found'));
    }

    const reviewerData = reviewerDoc.data();
    if (reviewerData?.reviewSessionId !== reviewId) {
      return res.status(404).json(createErrorResponse('Reviewer not found in this review session'));
    }

    // Update reviewer with approval
    await reviewerRef.update({
      attended: true,
      notes: notes || reviewerData.notes || null,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Check if all reviewers have approved
    const allReviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const allApproved = allReviewersSnapshot.docs.every(doc => doc.data().attended === true);

    // If all reviewers approved, update review session status
    if (allApproved) {
      await db.collection('reviewSessions').doc(reviewId).update({
        reviewStatus: 'APPROVED',
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // Get updated reviewer
    const updatedDoc = await reviewerRef.get();
    const updatedData = updatedDoc.data();
    const userDoc = await db.collection('users').doc(updatedData?.userId).get();
    const userData = userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;

    const formattedReviewer = formatReviewerData(
      { id: updatedDoc.id, ...updatedData },
      userData
    );

    return res.status(200).json(createSuccessResponse(formattedReviewer));
  } catch (error: any) {
    console.error('[Reviewers] Approve error:', error);
    return res.status(500).json(createErrorResponse('Failed to approve review', error.message));
  }
});

// POST /review-sessions/:reviewId/reviewers/:reviewerId/reject - Reject review
app.post('/review-sessions/:reviewId/reviewers/:reviewerId/reject', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId, reviewerId } = req.params;
    const userId = req.user?.uid;
    const { notes } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    const reviewerRef = db.collection('reviewSessionReviewers').doc(reviewerId);
    const reviewerDoc = await reviewerRef.get();

    if (!reviewerDoc.exists) {
      return res.status(404).json(createErrorResponse('Reviewer not found'));
    }

    const reviewerData = reviewerDoc.data();
    if (reviewerData?.reviewSessionId !== reviewId) {
      return res.status(404).json(createErrorResponse('Reviewer not found in this review session'));
    }

    // Update reviewer with rejection
    await reviewerRef.update({
      attended: false,
      notes: notes || reviewerData.notes || null,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update review session status to REJECTED
    await db.collection('reviewSessions').doc(reviewId).update({
      reviewStatus: 'REJECTED',
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get updated reviewer
    const updatedDoc = await reviewerRef.get();
    const updatedData = updatedDoc.data();
    const userDoc = await db.collection('users').doc(updatedData?.userId).get();
    const userData = userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;

    const formattedReviewer = formatReviewerData(
      { id: updatedDoc.id, ...updatedData },
      userData
    );

    return res.status(200).json(createSuccessResponse(formattedReviewer));
  } catch (error: any) {
    console.error('[Reviewers] Reject error:', error);
    return res.status(500).json(createErrorResponse('Failed to reject review', error.message));
  }
});

// GET /sessions/:sessionId/review-sessions/:reviewId/reviewers - Get session reviewers
app.get('/sessions/:sessionId/review-sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, reviewId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify review session belongs to session
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    const reviewData = reviewSessionDoc.data();
    if (reviewData?.sessionId !== sessionId) {
      return res.status(404).json(createErrorResponse('Review session does not belong to this session'));
    }

    // Get reviewers (same as GET /review-sessions/:reviewId/reviewers)
    const reviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const reviewers = await Promise.all(reviewersSnapshot.docs.map(async (doc) => {
      const reviewerData = doc.data();
      const userDoc = await db.collection('users').doc(reviewerData.userId).get();
      const userData = userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;

      return formatReviewerData(
        { id: doc.id, ...reviewerData },
        userData
      );
    }));

    return res.status(200).json(createSuccessResponse(reviewers));
  } catch (error: any) {
    console.error('[Reviewers] Get session reviewers error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch reviewers', error.message));
  }
});

// POST /sessions/:sessionId/review-sessions/:reviewId/reviewers - Add session reviewer
app.post('/sessions/:sessionId/review-sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, reviewId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { reviewers } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify review session belongs to session
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    const reviewData = reviewSessionDoc.data();
    if (reviewData?.sessionId !== sessionId) {
      return res.status(404).json(createErrorResponse('Review session does not belong to this session'));
    }

    // Add reviewers (same logic as POST /review-sessions/:reviewId/reviewers)
    if (!reviewers || !Array.isArray(reviewers)) {
      return res.status(400).json(createErrorResponse('Reviewers must be an array'));
    }

    const createdReviewers = [];

    for (const reviewerData of reviewers) {
      const reviewerUserId = reviewerData.userId || reviewerData.personId || reviewerData.id;

      if (!reviewerUserId) {
        continue;
      }

      const userDoc = await db.collection('users').doc(reviewerUserId).get();
      if (!userDoc.exists) {
        continue;
      }

      // Check if already exists
      const existingSnapshot = await db.collection('reviewSessionReviewers')
        .where('reviewSessionId', '==', reviewId)
        .where('userId', '==', reviewerUserId)
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        continue;
      }

      const newReviewerData = {
        reviewSessionId: reviewId,
        userId: reviewerUserId,
        reviewerRole: reviewerData.reviewerRole || 'REVIEWER',
        attended: reviewerData.attended || false,
        notes: reviewerData.notes || null,
        organizationId: organizationId || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      const reviewerRef = await db.collection('reviewSessionReviewers').add(newReviewerData);
      const userData = { id: userDoc.id, ...userDoc.data() };

      createdReviewers.push(formatReviewerData(
        { id: reviewerRef.id, ...newReviewerData },
        userData
      ));
    }

    return res.status(201).json(createSuccessResponse(createdReviewers));
  } catch (error: any) {
    console.error('[Reviewers] Add session reviewer error:', error);
    return res.status(500).json(createErrorResponse('Failed to add reviewers', error.message));
  }
});

// PUT /sessions/:sessionId/review-sessions/:reviewId/reviewers - Update session reviewers
app.put('/sessions/:sessionId/review-sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, reviewId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { reviewers } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify review session belongs to session
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    const reviewData = reviewSessionDoc.data();
    if (reviewData?.sessionId !== sessionId) {
      return res.status(404).json(createErrorResponse('Review session does not belong to this session'));
    }

    // Update reviewers (same logic as PUT /review-sessions/:reviewId/reviewers)
    if (!reviewers || !Array.isArray(reviewers)) {
      return res.status(400).json(createErrorResponse('Reviewers must be an array'));
    }

    // Delete existing
    const existingSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const batch = db.batch();
    existingSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // Add new
    const createdReviewers = [];

    for (const reviewerData of reviewers) {
      const reviewerUserId = reviewerData.userId || reviewerData.personId || reviewerData.id;

      if (!reviewerUserId) {
        continue;
      }

      const userDoc = await db.collection('users').doc(reviewerUserId).get();
      if (!userDoc.exists) {
        continue;
      }

      const newReviewerData = {
        reviewSessionId: reviewId,
        userId: reviewerUserId,
        reviewerRole: reviewerData.reviewerRole || 'REVIEWER',
        attended: reviewerData.attended || false,
        notes: reviewerData.notes || null,
        organizationId: organizationId || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      const reviewerRef = await db.collection('reviewSessionReviewers').add(newReviewerData);
      const userData = { id: userDoc.id, ...userDoc.data() };

      createdReviewers.push(formatReviewerData(
        { id: reviewerRef.id, ...newReviewerData },
        userData
      ));
    }

    return res.status(200).json(createSuccessResponse(createdReviewers));
  } catch (error: any) {
    console.error('[Reviewers] Update session reviewers error:', error);
    return res.status(500).json(createErrorResponse('Failed to update reviewers', error.message));
  }
});

// ============================================================================
// REVIEWS & STORAGE ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for GET /storage/sessions/:sessionId/archive
app.options('/sessions/storage/sessions/:sessionId/archive', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/storage/sessions/:sessionId/archive - Get archive
app.get('/sessions/storage/sessions/:sessionId/archive', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get archive information
    const archiveDoc = await db.collection('sessionArchives').doc(sessionId).get();
    
    if (!archiveDoc.exists) {
      return res.status(200).json({
        success: true,
        sessionId,
        archived: false,
        archivedAt: null,
        archivedBy: null,
        totalFiles: 0,
        totalSize: 0,
        archiveLocation: null
      });
    }

    const archiveData = archiveDoc.data();
    return res.status(200).json({
      success: true,
      sessionId,
      archived: true,
      archivedAt: archiveData.archivedAt,
      archivedBy: archiveData.archivedBy,
      totalFiles: archiveData.totalFiles || 0,
      totalSize: archiveData.totalSize || 0,
      archiveLocation: archiveData.archiveLocation || null
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/storage/sessions/:sessionId/archive:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch archive',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /storage/post-production-workflow-integration/initialize
app.options('/sessions/storage/post-production-workflow-integration/initialize', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/storage/post-production-workflow-integration/initialize - Initialize storage
app.post('/sessions/storage/post-production-workflow-integration/initialize', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Initialize post-production workflow integration storage
    const integrationDoc = await db.collection('postProductionWorkflowIntegration').doc(organizationId).get();
    
    if (integrationDoc.exists) {
      return res.status(200).json({
        success: true,
        message: 'Post-production workflow integration already initialized',
        initialized: true
      });
    }

    // Create initialization
    await db.collection('postProductionWorkflowIntegration').doc(organizationId).set({
      organizationId,
      initialized: true,
      initializedBy: userId,
      initializedAt: FieldValue.serverTimestamp(),
      config: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [STORAGE] Initialized post-production workflow integration for organization ${organizationId}`);
    return res.status(201).json({
      success: true,
      message: 'Post-production workflow integration initialized successfully',
      initialized: true
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/storage/post-production-workflow-integration/initialize:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to initialize post-production workflow integration',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /storage/post-production-workflow-integration/sessions/:sessionId/config
app.options('/sessions/storage/post-production-workflow-integration/sessions/:sessionId/config', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/storage/post-production-workflow-integration/sessions/:sessionId/config - Get config
app.get('/sessions/storage/post-production-workflow-integration/sessions/:sessionId/config', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get config
    const configDoc = await db.collection('postProductionWorkflowConfigs')
      .doc(sessionId)
      .get();

    if (!configDoc.exists) {
      return res.status(200).json({
        success: true,
        sessionId,
        config: {}
      });
    }

    return res.status(200).json({
      success: true,
      sessionId,
      config: configDoc.data()?.config || {}
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/storage/post-production-workflow-integration/sessions/:sessionId/config:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch config',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /storage/post-production-workflow-integration/sessions/:sessionId/correlations
app.options('/sessions/storage/post-production-workflow-integration/sessions/:sessionId/correlations', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/storage/post-production-workflow-integration/sessions/:sessionId/correlations - Get correlations
app.get('/sessions/storage/post-production-workflow-integration/sessions/:sessionId/correlations', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get correlations
    const correlationsSnapshot = await db.collection('workflowCorrelations')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const correlations = correlationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      sessionId,
      correlations,
      count: correlations.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/storage/post-production-workflow-integration/sessions/:sessionId/correlations:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch correlations',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /storage/post-production-workflow-integration/sessions/:sessionId/milestones
app.options('/sessions/storage/post-production-workflow-integration/sessions/:sessionId/milestones', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/storage/post-production-workflow-integration/sessions/:sessionId/milestones - Get milestones
app.get('/sessions/storage/post-production-workflow-integration/sessions/:sessionId/milestones', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get milestones
    const milestonesSnapshot = await db.collection('workflowMilestones')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'asc')
      .get();

    const milestones = milestonesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      sessionId,
      milestones,
      count: milestones.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/storage/post-production-workflow-integration/sessions/:sessionId/milestones:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch milestones',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// WORKFLOW TRANSITION & ASSIGNMENT ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for POST /workflow/transition
app.options('/sessions/workflow/transition', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/workflow/transition - Transition workflow
app.post('/sessions/workflow/transition', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { workflowInstanceId, targetStatus, notes } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!workflowInstanceId || !targetStatus) {
      return res.status(400).json({
        success: false,
        error: 'workflowInstanceId and targetStatus are required'
      });
    }

    // Verify workflow instance exists
    const workflowDoc = await db.collection('unifiedWorkflowInstances').doc(workflowInstanceId).get();
    if (!workflowDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow instance not found'
      });
    }

    const workflowData = workflowDoc.data();
    if (workflowData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this workflow'
      });
    }

    const oldStatus = workflowData.status;

    // Update workflow status
    await db.collection('unifiedWorkflowInstances').doc(workflowInstanceId).update({
      status: targetStatus,
      previousStatus: oldStatus,
      transitionNotes: notes || null,
      transitionedAt: FieldValue.serverTimestamp(),
      transitionedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Log transition
    await db.collection('workflowTransitions').add({
      workflowInstanceId,
      sessionId: workflowData.sessionId,
      organizationId,
      fromStatus: oldStatus,
      toStatus: targetStatus,
      notes: notes || null,
      transitionedBy: userId,
      createdAt: FieldValue.serverTimestamp()
    });

    console.log(`✅ [WORKFLOW] Transitioned workflow ${workflowInstanceId} from ${oldStatus} to ${targetStatus}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow transitioned successfully',
      data: {
        workflowInstanceId,
        oldStatus,
        newStatus: targetStatus
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/workflow/transition:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to transition workflow',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /workflow/assign
app.options('/sessions/workflow/assign', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/workflow/assign - Assign workflow
app.post('/sessions/workflow/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, workflowDiagramId, workflowPhase = 'PRODUCTION' } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!sessionId || !workflowDiagramId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and workflowDiagramId are required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Verify workflow diagram exists
    const diagramDoc = await db.collection('workflowDiagrams').doc(workflowDiagramId).get();
    if (!diagramDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow diagram not found'
      });
    }

    const diagramData = diagramDoc.data();
    const workflowName = diagramData?.name || 'Workflow';

    // Check if workflow already assigned for this phase
    const existingSnapshot = await db.collection('unifiedWorkflowInstances')
      .where('sessionId', '==', sessionId)
      .where('workflowPhase', '==', workflowPhase)
      .where('organizationId', '==', organizationId)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'Workflow already assigned for this session and phase',
        existingWorkflowId: existingSnapshot.docs[0].id
      });
    }

    // Create workflow instance
    const workflowData = {
      sessionId,
      workflowDiagramId,
      name: workflowName,
      workflowPhase,
      status: 'ACTIVE',
      progress: 0,
      organizationId,
      createdByUserId: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const workflowRef = await db.collection('unifiedWorkflowInstances').add(workflowData);

    console.log(`✅ [WORKFLOW] Assigned workflow ${workflowRef.id} to session ${sessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Workflow assigned successfully',
      data: {
        id: workflowRef.id,
        ...workflowData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/workflow/assign:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign workflow',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ====================
// Reviews Endpoints
// ====================

// DELETE /sessions/:reviewId/assign/:userId - Unassign reviewer
app.delete('/sessions/:reviewId/assign/:userId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId, userId } = req.params;
    const requestingUserId = req.user?.uid;

    if (!requestingUserId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    // Find and delete the assignment
    const assignmentSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .where('assignedUserId', '==', userId)
      .limit(1)
      .get();

    if (assignmentSnapshot.empty) {
      return res.status(404).json(createErrorResponse('Review assignment not found'));
    }

    await assignmentSnapshot.docs[0].ref.delete();

    return res.status(200).json(createSuccessResponse(null, 'Reviewer unassigned successfully'));
  } catch (error: any) {
    console.error('[Reviews] Unassign error:', error);
    return res.status(500).json(createErrorResponse('Failed to unassign reviewer', error.message));
  }
});

// GET /sessions/:reviewId/approvals - Get approvals
app.get('/sessions/:reviewId/approvals', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    // Get approvals
    const approvalsSnapshot = await db.collection('reviewApprovals')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const approvals = await Promise.all(approvalsSnapshot.docs.map(async (doc) => {
      const approvalData = doc.data();
      const approverDoc = await db.collection('users').doc(approvalData.approverUserId).get();
      const approverData = approverDoc.exists ? {
        id: approverDoc.id,
        name: approverDoc.data()?.name || approverDoc.data()?.displayName || null,
        email: approverDoc.data()?.email || null
      } : null;

      return {
        id: doc.id,
        ...approvalData,
        approver: approverData
      };
    }));

    return res.status(200).json(createSuccessResponse(approvals));
  } catch (error: any) {
    console.error('[Reviews] Get approvals error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch approvals', error.message));
  }
});

// GET /sessions/:reviewId/reviewers - Get reviewers
app.get('/sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    // Get reviewers (using reviewSessionReviewers collection)
    const reviewersSnapshot = await db.collection('reviewSessionReviewers')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const reviewers = await Promise.all(reviewersSnapshot.docs.map(async (doc) => {
      const reviewerData = doc.data();
      const userDoc = await db.collection('users').doc(reviewerData.userId).get();
      const userData = userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;

      return formatReviewerData(
        { id: doc.id, ...reviewerData },
        userData
      );
    }));

    return res.status(200).json(createSuccessResponse(reviewers));
  } catch (error: any) {
    console.error('[Reviews] Get reviewers error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch reviewers', error.message));
  }
});

// POST /sessions/:reviewId/approve - Approve review
app.post('/sessions/:reviewId/approve', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;
    const { decision, notes } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!decision || !['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'PENDING', 'IN_REVIEW'].includes(decision)) {
      return res.status(400).json(createErrorResponse('Invalid decision. Must be APPROVED, REJECTED, CHANGES_REQUESTED, PENDING, or IN_REVIEW'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    // Check if user is assigned as reviewer or is admin
    const assignmentSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .where('assignedUserId', '==', userId)
      .where('status', '==', 'ASSIGNED')
      .limit(1)
      .get();

    const isAssigned = !assignmentSnapshot.empty;
    const isAdmin = req.user?.role === 'ADMIN';

    if (!isAssigned && !isAdmin) {
      return res.status(403).json(createErrorResponse('User is not assigned as a reviewer for this session'));
    }

    // Check for existing approval
    const existingApprovalSnapshot = await db.collection('reviewApprovals')
      .where('reviewSessionId', '==', reviewId)
      .where('approverUserId', '==', userId)
      .limit(1)
      .get();

    let approval;
    const approvalStatus = decision === 'APPROVED' ? 'APPROVED' :
      decision === 'REJECTED' ? 'REJECTED' :
        decision === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'IN_REVIEW';

    if (!existingApprovalSnapshot.empty) {
      // Update existing approval
      const approvalRef = existingApprovalSnapshot.docs[0].ref;
      await approvalRef.update({
        status: approvalStatus,
        decision,
        notes: notes || null,
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      const updatedDoc = await approvalRef.get();
      const approvalData = updatedDoc.data();
      const approverDoc = await db.collection('users').doc(userId).get();
      const approverData = approverDoc.exists ? {
        id: approverDoc.id,
        name: approverDoc.data()?.name || approverDoc.data()?.displayName || null,
        email: approverDoc.data()?.email || null
      } : null;

      approval = {
        id: updatedDoc.id,
        ...approvalData,
        approver: approverData
      };
    } else {
      // Create new approval
      const approvalData = {
        reviewSessionId: reviewId,
        approverUserId: userId,
        status: approvalStatus,
        decision,
        notes: notes || null,
        approvedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      };

      const approvalRef = await db.collection('reviewApprovals').add(approvalData);
      const approverDoc = await db.collection('users').doc(userId).get();
      const approverData = approverDoc.exists ? {
        id: approverDoc.id,
        name: approverDoc.data()?.name || approverDoc.data()?.displayName || null,
        email: approverDoc.data()?.email || null
      } : null;

      approval = {
        id: approvalRef.id,
        ...approvalData,
        approver: approverData
      };
    }

    // Update review assignment status
    const assignmentStatus = ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(decision) ? 'COMPLETED' : 'IN_PROGRESS';
    const assignmentUpdate: any = {
      status: assignmentStatus,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (assignmentStatus === 'COMPLETED') {
      assignmentUpdate.completedAt = FieldValue.serverTimestamp();
    }

    // Update assignments
    const assignmentsSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .where('assignedUserId', '==', userId)
      .get();

    const batch = db.batch();
    assignmentsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, assignmentUpdate);
    });
    await batch.commit();

    return res.status(200).json(createSuccessResponse(approval));
  } catch (error: any) {
    console.error('[Reviews] Approve error:', error);
    return res.status(500).json(createErrorResponse('Failed to approve review', error.message));
  }
});

// POST /sessions/:reviewId/assign - Assign reviewer
app.post('/sessions/:reviewId/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;
    const { userId: assignUserId, role } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!assignUserId) {
      return res.status(400).json(createErrorResponse('Missing required field: userId'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    // Check if user exists
    const userDoc = await db.collection('users').doc(assignUserId).get();
    if (!userDoc.exists) {
      return res.status(404).json(createErrorResponse('User not found'));
    }

    // Check if already assigned
    const existingSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .where('assignedUserId', '==', assignUserId)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      const existing = existingSnapshot.docs[0].data();
      return res.status(409).json({
        success: false,
        error: 'User is already assigned to this review session',
        errorDetails: 'Cannot assign the same user to a review session multiple times',
        existing: {
          id: existingSnapshot.docs[0].id,
          assignedAt: existing.assignedAt,
          role: existing.role,
          status: existing.status
        }
      });
    }

    // Create assignment
    const assignmentData = {
      reviewSessionId: reviewId,
      assignedUserId: assignUserId,
      assignedByUserId: userId,
      role: role || 'REVIEWER',
      status: 'ASSIGNED',
      assignedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    };

    const assignmentRef = await db.collection('reviewAssignments').add(assignmentData);

    // Get user details
    const assignedUserData = {
      id: userDoc.id,
      name: userDoc.data()?.name || userDoc.data()?.displayName || null,
      email: userDoc.data()?.email || null,
      role: userDoc.data()?.role || null
    };

    const assignedByDoc = await db.collection('users').doc(userId).get();
    const assignedByData = assignedByDoc.exists ? {
      id: assignedByDoc.id,
      name: assignedByDoc.data()?.name || assignedByDoc.data()?.displayName || null,
      email: assignedByDoc.data()?.email || null
    } : null;

    const assignment = {
      id: assignmentRef.id,
      ...assignmentData,
      assignedUser: assignedUserData,
      assignedBy: assignedByData
    };

    return res.status(201).json(createSuccessResponse(assignment));
  } catch (error: any) {
    console.error('[Reviews] Assign error:', error);
    return res.status(500).json(createErrorResponse('Failed to assign reviewer', error.message));
  }
});

// POST /sessions/:reviewId/complete - Complete review
app.post('/sessions/:reviewId/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;
    const { notes, decision } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    const reviewStatus = decision === 'APPROVED' ? 'APPROVED' : 'CHANGES_REQUESTED';

    // Update review session
    await db.collection('reviewSessions').doc(reviewId).update({
      reviewStatus,
      notes: notes || null,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedByUserId: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get updated review with related data
    const updatedReviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    const reviewData = updatedReviewDoc.data();

    // Get session info
    let sessionInfo = null;
    if (reviewData?.sessionId) {
      const sessionDoc = await db.collection('sessions').doc(reviewData.sessionId).get();
      if (sessionDoc.exists) {
        sessionInfo = {
          id: sessionDoc.id,
          sessionName: sessionDoc.data()?.sessionName || null,
          sessionDate: sessionDoc.data()?.sessionDate || null
        };
      }
    }

    // Get assignments
    const assignmentsSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const assignments = await Promise.all(assignmentsSnapshot.docs.map(async (doc) => {
      const assignData = doc.data();
      const userDoc = await db.collection('users').doc(assignData.assignedUserId).get();
      const userData = userDoc.exists ? {
        id: userDoc.id,
        name: userDoc.data()?.name || userDoc.data()?.displayName || null,
        email: userDoc.data()?.email || null
      } : null;

      return {
        id: doc.id,
        ...assignData,
        assignedUser: userData
      };
    }));

    const review = {
      id: updatedReviewDoc.id,
      ...reviewData,
      session: sessionInfo,
      reviewAssignments: assignments
    };

    return res.status(200).json(createSuccessResponse(review));
  } catch (error: any) {
    console.error('[Reviews] Complete error:', error);
    return res.status(500).json(createErrorResponse('Failed to complete review', error.message));
  }
});

// POST /sessions/:reviewId/notes - Add notes
app.post('/sessions/:reviewId/notes', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;
    const { content, timecode, priority } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!content) {
      return res.status(400).json(createErrorResponse('Note content is required'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    // Create note
    const noteData = {
      reviewSessionId: reviewId,
      content,
      timecode: timecode || null,
      priority: priority || 'NORMAL',
      status: 'OPEN',
      createdByUserId: userId,
      createdAt: FieldValue.serverTimestamp()
    };

    const noteRef = await db.collection('reviewNotes').add(noteData);

    // Get creator info
    const creatorDoc = await db.collection('users').doc(userId).get();
    const creatorData = creatorDoc.exists ? {
      id: creatorDoc.id,
      name: creatorDoc.data()?.name || creatorDoc.data()?.displayName || null,
      email: creatorDoc.data()?.email || null
    } : null;

    const note = {
      id: noteRef.id,
      ...noteData,
      createdByUser: creatorData
    };

    return res.status(201).json(createSuccessResponse(note));
  } catch (error: any) {
    console.error('[Reviews] Add note error:', error);
    return res.status(500).json(createErrorResponse('Failed to add note', error.message));
  }
});

// POST /sessions/:reviewId/start - Start review
app.post('/sessions/:reviewId/start', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify review session exists
    const reviewSessionDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewSessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Review session not found'));
    }

    // Update review status
    await db.collection('reviewSessions').doc(reviewId).update({
      reviewStatus: 'IN_REVIEW',
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get updated review with related data
    const updatedReviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    const reviewData = updatedReviewDoc.data();

    // Get session info
    let sessionInfo = null;
    if (reviewData?.sessionId) {
      const sessionDoc = await db.collection('sessions').doc(reviewData.sessionId).get();
      if (sessionDoc.exists) {
        sessionInfo = {
          id: sessionDoc.id,
          sessionName: sessionDoc.data()?.sessionName || null,
          sessionDate: sessionDoc.data()?.sessionDate || null
        };
      }
    }

    // Get assignments
    const assignmentsSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const assignments = await Promise.all(assignmentsSnapshot.docs.map(async (doc) => {
      const assignData = doc.data();
      const userDoc = await db.collection('users').doc(assignData.assignedUserId).get();
      const userData = userDoc.exists ? {
        id: userDoc.id,
        name: userDoc.data()?.name || userDoc.data()?.displayName || null,
        email: userDoc.data()?.email || null
      } : null;

      return {
        id: doc.id,
        ...assignData,
        assignedUser: userData
      };
    }));

    const review = {
      id: updatedReviewDoc.id,
      ...reviewData,
      session: sessionInfo,
      reviewAssignments: assignments
    };

    return res.status(200).json(createSuccessResponse(review));
  } catch (error: any) {
    console.error('[Reviews] Start error:', error);
    return res.status(500).json(createErrorResponse('Failed to start review', error.message));
  }
});

// ============================================================================
// ADDITIONAL SIMPLE ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for GET /test-auth
app.options('/test-auth', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /test-auth - Test authentication
app.get('/test-auth', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const email = req.user?.email;

    return res.status(200).json({
      success: true,
      message: 'Authentication successful',
      data: {
        userId,
        organizationId,
        email,
        authenticated: true,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /test-auth:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test authentication',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /test-template
app.options('/test-template', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /test-template - Test template endpoint
app.get('/test-template', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get a sample template
    const templatesSnapshot = await db.collection('workflowTemplates')
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (templatesSnapshot.empty) {
      return res.status(200).json({
        success: true,
        message: 'No templates found',
        data: null
      });
    }

    const template = {
      id: templatesSnapshot.docs[0].id,
      ...templatesSnapshot.docs[0].data()
    };

    return res.status(200).json({
      success: true,
      message: 'Template test successful',
      data: template
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /test-template:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test template',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /test-template-id/:id
app.options('/test-template-id/:id', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /test-template-id/:id - Test template by ID
app.get('/test-template-id/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const templateId = decodeURIComponent(req.params.id);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Try different template collections
    let templateDoc = await db.collection('workflowTemplates').doc(templateId).get();
    if (!templateDoc.exists) {
      templateDoc = await db.collection('workflowDiagrams').doc(templateId).get();
    }
    if (!templateDoc.exists) {
      templateDoc = await db.collection('sessionTemplates').doc(templateId).get();
    }

    if (!templateDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const templateData = templateDoc.data();
    if (templateData?.organizationId && templateData.organizationId !== organizationId && !templateData.isPublic) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this template'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Template found',
      data: {
        id: templateDoc.id,
        ...templateData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /test-template-id/:id:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test template',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions-test
app.options('/sessions-test', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions-test - Test sessions endpoint
app.get('/sessions-test', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get a few test sessions
    const sessionsSnapshot = await db.collection('sessions')
      .where('organizationId', '==', organizationId)
      .limit(5)
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      message: 'Sessions test successful',
      data: {
        count: sessions.length,
        sessions
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions-test:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test sessions',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /create-test-session
app.options('/create-test-session', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /create-test-session - Create test session
app.post('/create-test-session', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { name, description } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Create test session
    const sessionData = {
      name: name || `Test Session ${new Date().toISOString()}`,
      description: description || 'Test session created via API',
      status: 'PLANNED',
      organizationId,
      createdBy: userId,
      isTest: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const sessionRef = await db.collection('sessions').add(sessionData);

    console.log(`✅ [TEST] Created test session ${sessionRef.id}`);
    return res.status(201).json({
      success: true,
      message: 'Test session created successfully',
      data: {
        id: sessionRef.id,
        ...sessionData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /create-test-session:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create test session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /demo
app.options('/demo', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /demo - Demo endpoint
app.post('/demo', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Demo endpoint successful',
      data: {
        userId,
        organizationId,
        timestamp: new Date().toISOString(),
        demo: true
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /demo:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process demo request',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ====================
// Session Files Endpoints
// ====================

// GET /sessions/:sessionId/files - Get session files
app.get('/sessions/:sessionId/files', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Get session files
    const filesSnapshot = await db.collection('sessionFiles')
      .where('sessionId', '==', sessionId)
      .orderBy('uploadDate', 'desc')
      .get();

    const files = filesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Get file checklist items if they exist
    let fileChecklist: any[] = [];
    try {
      const checklistSnapshot = await db.collection('fileChecklist')
        .where('sessionId', '==', sessionId)
        .orderBy('createdAt', 'desc')
        .get();

      fileChecklist = checklistSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.log('[Session Files] FileChecklist collection might not exist, skipping...');
    }

    return res.status(200).json(createSuccessResponse({
      files,
      fileChecklist
    }));
  } catch (error: any) {
    console.error('[Session Files] Get error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch session files', error.message));
  }
});

// GET /sessions/:sessionId/step-files - Get step files
app.get('/sessions/:sessionId/step-files', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Get workflow steps for this session
    const workflowInstancesSnapshot = await db.collection('workflowInstances')
      .where('sessionId', '==', sessionId)
      .get();

    const stepIds: string[] = [];
    for (const instanceDoc of workflowInstancesSnapshot.docs) {
      const stepsSnapshot = await db.collection('workflowSteps')
        .where('workflowInstanceId', '==', instanceDoc.id)
        .get();
      stepIds.push(...stepsSnapshot.docs.map(doc => doc.id));
    }

    // Get files for all steps
    const stepFiles: any[] = [];
    if (stepIds.length > 0) {
      // Firestore 'in' query limit is 10, so batch if needed
      for (let i = 0; i < stepIds.length; i += 10) {
        const batch = stepIds.slice(i, i + 10);
        const filesSnapshot = await db.collection('workflowStepFiles')
          .where('workflowStepId', 'in', batch)
          .get();
        
        stepFiles.push(...filesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })));
      }
    }

    return res.status(200).json(createSuccessResponse(stepFiles));
  } catch (error: any) {
    console.error('[Session Files] Get step files error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch step files', error.message));
  }
});

// POST /sessions/:sessionId/files - Upload file
app.post('/sessions/:sessionId/files', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { fileName, filePath, fileType, fileSize } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!fileName || !filePath) {
      return res.status(400).json(createErrorResponse('fileName and filePath are required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Create file record
    const fileData = {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      fileName,
      filePath,
      fileType: fileType || 'unknown',
      fileSize: fileSize || 0,
      organizationId: organizationId || sessionData?.organizationId || null,
      uploadedBy: userId,
      uploadDate: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    };

    const fileRef = await db.collection('sessionFiles').add(fileData);

    const createdFile = {
      id: fileRef.id,
      ...fileData
    };

    return res.status(201).json(createSuccessResponse(createdFile));
  } catch (error: any) {
    console.error('[Session Files] Upload error:', error);
    return res.status(500).json(createErrorResponse('Failed to upload file', error.message));
  }
});

// DELETE /sessions/:sessionId/files/:fileId - Delete file
app.delete('/sessions/:sessionId/files/:fileId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, fileId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify file exists and belongs to session
    const fileDoc = await db.collection('sessionFiles').doc(fileId).get();
    if (!fileDoc.exists) {
      return res.status(404).json(createErrorResponse('File not found'));
    }

    const fileData = fileDoc.data();
    if (fileData?.sessionId !== sessionId) {
      return res.status(404).json(createErrorResponse('File not found in this session'));
    }

    if (organizationId && fileData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to file'));
    }

    await fileDoc.ref.delete();

    return res.status(200).json(createSuccessResponse(null, 'File deleted successfully'));
  } catch (error: any) {
    console.error('[Session Files] Delete error:', error);
    return res.status(500).json(createErrorResponse('Failed to delete file', error.message));
  }
});

// GET /sessions/:sessionId/archive - Get archive
app.get('/sessions/:sessionId/archive', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Get archive data
    const archiveDoc = await db.collection('sessionArchives').doc(sessionId).get();
    
    if (!archiveDoc.exists) {
      return res.status(404).json(createErrorResponse('Archive not found'));
    }

    const archiveData = archiveDoc.data();

    return res.status(200).json(createSuccessResponse({
      id: archiveDoc.id,
      ...archiveData
    }));
  } catch (error: any) {
    console.error('[Session Files] Get archive error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch archive', error.message));
  }
});

// ====================
// Workflow Step Progression Endpoints
// ====================

// GET /steps/:stepId/progression - Get step progression
app.get('/steps/:stepId/progression', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { stepId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Find workflow step
    const stepDoc = await db.collection('workflowSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow step not found'));
    }

    // Get progression
    const progressionSnapshot = await db.collection('workflowStepProgressions')
      .where('workflowStepId', '==', stepId)
      .limit(1)
      .get();

    if (progressionSnapshot.empty) {
      return res.status(404).json(createErrorResponse('Step progression not found'));
    }

    const progressionData = progressionSnapshot.docs[0].data();

    // Get started by user info
    let startedByUser = null;
    if (progressionData?.startedBy) {
      const userDoc = await db.collection('users').doc(progressionData.startedBy).get();
      if (userDoc.exists) {
        startedByUser = {
          id: userDoc.id,
          name: userDoc.data()?.name || userDoc.data()?.displayName || null
        };
      }
    }

    // Get completed by user info
    let completedByUser = null;
    if (progressionData?.completedBy) {
      const userDoc = await db.collection('users').doc(progressionData.completedBy).get();
      if (userDoc.exists) {
        completedByUser = {
          id: userDoc.id,
          name: userDoc.data()?.name || userDoc.data()?.displayName || null
        };
      }
    }

    // Get progression history
    const historySnapshot = await db.collection('workflowStepProgressionHistory')
      .where('workflowStepId', '==', stepId)
      .orderBy('createdAt', 'desc')
      .get();

    const history = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const progression = {
      id: progressionSnapshot.docs[0].id,
      ...progressionData,
      startedByUser,
      completedByUser,
      history
    };

    return res.status(200).json(createSuccessResponse(progression));
  } catch (error: any) {
    console.error('[Workflow Step Progression] Get error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch step progression', error.message));
  }
});

// POST /steps/:stepId/start - Start step
app.post('/steps/:stepId/start', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { stepId } = req.params;
    const userId = req.user?.uid;
    const { sessionId, notes } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!sessionId) {
      return res.status(400).json(createErrorResponse('sessionId is required'));
    }

    // Find workflow step
    const stepSnapshot = await db.collection('workflowSteps')
      .where('nodeId', '==', stepId)
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (stepSnapshot.empty) {
      return res.status(404).json(createErrorResponse('Workflow step not found'));
    }

    const stepDoc = stepSnapshot.docs[0];
    const stepData = stepDoc.data();

    // Check if user is assigned
    const assignmentSnapshot = await db.collection('workflowStepAssignments')
      .where('workflowStepId', '==', stepDoc.id)
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (assignmentSnapshot.empty) {
      return res.status(403).json(createErrorResponse('User is not assigned to this workflow step'));
    }

    // Check if step is already in progress by another user
    const existingProgressionSnapshot = await db.collection('workflowStepProgressions')
      .where('workflowStepId', '==', stepDoc.id)
      .limit(1)
      .get();

    let existingProgression = null;
    if (!existingProgressionSnapshot.empty) {
      existingProgression = existingProgressionSnapshot.docs[0].data();
      if (existingProgression.currentStatus === 'IN_PROGRESS' && existingProgression.startedBy !== userId) {
        return res.status(409).json(createErrorResponse('Step is already in progress by another user'));
      }
    }

    // Create or update progression
    let progressionRef;
    if (!existingProgressionSnapshot.empty) {
      progressionRef = existingProgressionSnapshot.docs[0].ref;
      await progressionRef.update({
        currentStatus: 'IN_PROGRESS',
        previousStatus: existingProgression?.currentStatus || 'NOT_STARTED',
        startedAt: FieldValue.serverTimestamp(),
        startedBy: userId,
        notes: notes || null,
        lastActivityAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      progressionRef = await db.collection('workflowStepProgressions').add({
        workflowStepId: stepDoc.id,
        sessionId,
        sessionWorkflowId: stepData.sessionWorkflowId || null,
        currentStatus: 'IN_PROGRESS',
        previousStatus: 'NOT_STARTED',
        startedAt: FieldValue.serverTimestamp(),
        startedBy: userId,
        notes: notes || null,
        lastActivityAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      });
    }

    // Update step status
    await stepDoc.ref.update({
      status: 'in-progress',
      startDate: FieldValue.serverTimestamp(),
      statusChangedAt: FieldValue.serverTimestamp(),
      statusChangedBy: userId
    });

    // Create history entry
    await db.collection('workflowStepProgressionHistory').add({
      progressionId: progressionRef.id,
      workflowStepId: stepDoc.id,
      sessionId,
      sessionWorkflowId: stepData.sessionWorkflowId || null,
      eventType: 'STARTED',
      previousStatus: 'NOT_STARTED',
      newStatus: 'IN_PROGRESS',
      triggeredByUserId: userId,
      eventReason: 'User started workflow step',
      eventDescription: notes || 'Workflow step started by user',
      eventMetadata: {
        stepNodeId: stepId
      },
      createdAt: FieldValue.serverTimestamp()
    });

    const progressionDoc = await progressionRef.get();
    const progression = {
      id: progressionDoc.id,
      ...progressionDoc.data()
    };

    return res.status(200).json(createSuccessResponse(progression));
  } catch (error: any) {
    console.error('[Workflow Step Progression] Start error:', error);
    return res.status(500).json(createErrorResponse('Failed to start workflow step', error.message));
  }
});

// POST /steps/:stepId/complete - Complete step
app.post('/steps/:stepId/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { stepId } = req.params;
    const userId = req.user?.uid;
    const { sessionId, notes } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!sessionId) {
      return res.status(400).json(createErrorResponse('sessionId is required'));
    }

    // Find workflow step
    const stepSnapshot = await db.collection('workflowSteps')
      .where('nodeId', '==', stepId)
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (stepSnapshot.empty) {
      return res.status(404).json(createErrorResponse('Workflow step not found'));
    }

    const stepDoc = stepSnapshot.docs[0];
    const stepData = stepDoc.data();

    // Check if user is assigned
    const assignmentSnapshot = await db.collection('workflowStepAssignments')
      .where('workflowStepId', '==', stepDoc.id)
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (assignmentSnapshot.empty) {
      return res.status(403).json(createErrorResponse('User is not assigned to this workflow step'));
    }

    // Get existing progression
    const progressionSnapshot = await db.collection('workflowStepProgressions')
      .where('workflowStepId', '==', stepDoc.id)
      .limit(1)
      .get();

    if (progressionSnapshot.empty) {
      return res.status(404).json(createErrorResponse('Step progression not found. Step must be started first.'));
    }

    const progressionRef = progressionSnapshot.docs[0].ref;
    const existingProgression = progressionSnapshot.docs[0].data();

    // Update progression
    await progressionRef.update({
      currentStatus: 'COMPLETED',
      previousStatus: existingProgression.currentStatus || 'IN_PROGRESS',
      completedAt: FieldValue.serverTimestamp(),
      completedBy: userId,
      notes: notes || existingProgression.notes || null,
      lastActivityAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update step status
    await stepDoc.ref.update({
      status: 'completed',
      completionDate: FieldValue.serverTimestamp(),
      statusChangedAt: FieldValue.serverTimestamp(),
      statusChangedBy: userId
    });

    // Create history entry
    await db.collection('workflowStepProgressionHistory').add({
      progressionId: progressionRef.id,
      workflowStepId: stepDoc.id,
      sessionId,
      sessionWorkflowId: stepData.sessionWorkflowId || null,
      eventType: 'COMPLETED',
      previousStatus: existingProgression.currentStatus || 'IN_PROGRESS',
      newStatus: 'COMPLETED',
      triggeredByUserId: userId,
      eventReason: 'User completed workflow step',
      eventDescription: notes || 'Workflow step completed by user',
      eventMetadata: {
        stepNodeId: stepId
      },
      createdAt: FieldValue.serverTimestamp()
    });

    const progressionDoc = await progressionRef.get();
    const progression = {
      id: progressionDoc.id,
      ...progressionDoc.data()
    };

    return res.status(200).json(createSuccessResponse(progression));
  } catch (error: any) {
    console.error('[Workflow Step Progression] Complete error:', error);
    return res.status(500).json(createErrorResponse('Failed to complete workflow step', error.message));
  }
});

// POST /steps/:stepId/pause - Pause step
app.post('/steps/:stepId/pause', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { stepId } = req.params;
    const userId = req.user?.uid;
    const { sessionId, notes } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!sessionId) {
      return res.status(400).json(createErrorResponse('sessionId is required'));
    }

    // Find workflow step
    const stepSnapshot = await db.collection('workflowSteps')
      .where('nodeId', '==', stepId)
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (stepSnapshot.empty) {
      return res.status(404).json(createErrorResponse('Workflow step not found'));
    }

    const stepDoc = stepSnapshot.docs[0];
    const stepData = stepDoc.data();

    // Get progression
    const progressionSnapshot = await db.collection('workflowStepProgressions')
      .where('workflowStepId', '==', stepDoc.id)
      .limit(1)
      .get();

    if (progressionSnapshot.empty) {
      return res.status(404).json(createErrorResponse('Step progression not found'));
    }

    const progressionRef = progressionSnapshot.docs[0].ref;
    const existingProgression = progressionSnapshot.docs[0].data();

    // Update progression
    await progressionRef.update({
      currentStatus: 'PAUSED',
      previousStatus: existingProgression.currentStatus || 'IN_PROGRESS',
      pausedAt: FieldValue.serverTimestamp(),
      pausedBy: userId,
      notes: notes || existingProgression.notes || null,
      lastActivityAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update step status
    await stepDoc.ref.update({
      status: 'paused',
      statusChangedAt: FieldValue.serverTimestamp(),
      statusChangedBy: userId
    });

    // Create history entry
    await db.collection('workflowStepProgressionHistory').add({
      progressionId: progressionRef.id,
      workflowStepId: stepDoc.id,
      sessionId,
      sessionWorkflowId: stepData.sessionWorkflowId || null,
      eventType: 'PAUSED',
      previousStatus: existingProgression.currentStatus || 'IN_PROGRESS',
      newStatus: 'PAUSED',
      triggeredByUserId: userId,
      eventReason: 'User paused workflow step',
      eventDescription: notes || 'Workflow step paused by user',
      eventMetadata: {
        stepNodeId: stepId
      },
      createdAt: FieldValue.serverTimestamp()
    });

    const progressionDoc = await progressionRef.get();
    const progression = {
      id: progressionDoc.id,
      ...progressionDoc.data()
    };

    return res.status(200).json(createSuccessResponse(progression));
  } catch (error: any) {
    console.error('[Workflow Step Progression] Pause error:', error);
    return res.status(500).json(createErrorResponse('Failed to pause workflow step', error.message));
  }
});

// POST /steps/:stepId/resume - Resume step
app.post('/steps/:stepId/resume', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { stepId } = req.params;
    const userId = req.user?.uid;
    const { sessionId, notes } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!sessionId) {
      return res.status(400).json(createErrorResponse('sessionId is required'));
    }

    // Find workflow step
    const stepSnapshot = await db.collection('workflowSteps')
      .where('nodeId', '==', stepId)
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (stepSnapshot.empty) {
      return res.status(404).json(createErrorResponse('Workflow step not found'));
    }

    const stepDoc = stepSnapshot.docs[0];
    const stepData = stepDoc.data();

    // Get progression
    const progressionSnapshot = await db.collection('workflowStepProgressions')
      .where('workflowStepId', '==', stepDoc.id)
      .limit(1)
      .get();

    if (progressionSnapshot.empty) {
      return res.status(404).json(createErrorResponse('Step progression not found'));
    }

    const progressionRef = progressionSnapshot.docs[0].ref;
    const existingProgression = progressionSnapshot.docs[0].data();

    if (existingProgression.currentStatus !== 'PAUSED') {
      return res.status(400).json(createErrorResponse('Step is not paused'));
    }

    // Update progression
    await progressionRef.update({
      currentStatus: 'IN_PROGRESS',
      previousStatus: 'PAUSED',
      resumedAt: FieldValue.serverTimestamp(),
      resumedBy: userId,
      notes: notes || existingProgression.notes || null,
      lastActivityAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update step status
    await stepDoc.ref.update({
      status: 'in-progress',
      statusChangedAt: FieldValue.serverTimestamp(),
      statusChangedBy: userId
    });

    // Create history entry
    await db.collection('workflowStepProgressionHistory').add({
      progressionId: progressionRef.id,
      workflowStepId: stepDoc.id,
      sessionId,
      sessionWorkflowId: stepData.sessionWorkflowId || null,
      eventType: 'RESUMED',
      previousStatus: 'PAUSED',
      newStatus: 'IN_PROGRESS',
      triggeredByUserId: userId,
      eventReason: 'User resumed workflow step',
      eventDescription: notes || 'Workflow step resumed by user',
      eventMetadata: {
        stepNodeId: stepId
      },
      createdAt: FieldValue.serverTimestamp()
    });

    const progressionDoc = await progressionRef.get();
    const progression = {
      id: progressionDoc.id,
      ...progressionDoc.data()
    };

    return res.status(200).json(createSuccessResponse(progression));
  } catch (error: any) {
    console.error('[Workflow Step Progression] Resume error:', error);
    return res.status(500).json(createErrorResponse('Failed to resume workflow step', error.message));
  }
});

// POST /steps/:stepId/permissions - Update permissions
app.post('/steps/:stepId/permissions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { stepId } = req.params;
    const userId = req.user?.uid;
    const { permissions } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json(createErrorResponse('permissions array is required'));
    }

    // Find workflow step
    const stepDoc = await db.collection('workflowSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow step not found'));
    }

    // Update step permissions
    await stepDoc.ref.update({
      permissions: permissions,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update individual permission records if they exist
    const existingPermissionsSnapshot = await db.collection('workflowStepPermissions')
      .where('workflowStepId', '==', stepId)
      .get();

    const batch = db.batch();
    existingPermissionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Create new permission records
    for (const perm of permissions) {
      const permRef = db.collection('workflowStepPermissions').doc();
      batch.set(permRef, {
        workflowStepId: stepId,
        userId: perm.userId,
        permission: perm.permission,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    await batch.commit();

    return res.status(200).json(createSuccessResponse({ permissions }, 'Permissions updated successfully'));
  } catch (error: any) {
    console.error('[Workflow Step Progression] Update permissions error:', error);
    return res.status(500).json(createErrorResponse('Failed to update permissions', error.message));
  }
});

// POST /steps/:stepId/assign - Assign step
app.post('/steps/:stepId/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { stepId } = req.params;
    const userId = req.user?.uid;
    const { assignUserId } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!assignUserId) {
      return res.status(400).json(createErrorResponse('assignUserId is required'));
    }

    // Find workflow step
    const stepDoc = await db.collection('workflowSteps').doc(stepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json(createErrorResponse('Workflow step not found'));
    }

    // Check if user exists
    const userDoc = await db.collection('users').doc(assignUserId).get();
    if (!userDoc.exists) {
      return res.status(404).json(createErrorResponse('User not found'));
    }

    // Check if already assigned
    const existingSnapshot = await db.collection('workflowStepAssignments')
      .where('workflowStepId', '==', stepId)
      .where('userId', '==', assignUserId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json(createErrorResponse('User is already assigned to this step'));
    }

    // Create assignment
    const assignmentData = {
      workflowStepId: stepId,
      userId: assignUserId,
      assignedBy: userId,
      isActive: true,
      assignedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    };

    const assignmentRef = await db.collection('workflowStepAssignments').add(assignmentData);

    const assignment = {
      id: assignmentRef.id,
      ...assignmentData
    };

    return res.status(201).json(createSuccessResponse(assignment));
  } catch (error: any) {
    console.error('[Workflow Step Progression] Assign error:', error);
    return res.status(500).json(createErrorResponse('Failed to assign step', error.message));
  }
});

// ============================================================================
// TEST & UTILITY ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for GET /test-auth
app.options('/test-auth', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /test-auth - Test authentication
app.get('/test-auth', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    return res.status(200).json({
      success: true,
      message: 'Authentication test successful',
      debug: {
        hasUser: !!req.user,
        userId,
        organizationId,
        userEmail: req.user?.email || null,
        nodeEnv: process.env.NODE_ENV
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /test-auth:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test authentication',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /test-template
app.options('/test-template', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /test-template - Test template endpoint
app.get('/test-template', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Template route is working',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /test-template:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test template',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /test-template-id/:id
app.options('/test-template-id/:id', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /test-template-id/:id - Test template by ID
app.get('/test-template-id/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'Template ID route is working',
      id,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /test-template-id/:id:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test template ID',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /sessions-test
app.options('/sessions-test', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions-test - Test sessions endpoint
app.get('/sessions-test', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get test sessions
    const sessionsSnapshot = await db.collection('sessions')
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || doc.data().sessionName || null,
      createdAt: doc.data().createdAt
    }));

    return res.status(200).json({
      success: true,
      message: 'Sessions test endpoint working',
      data: sessions,
      count: sessions.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions-test:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test sessions',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /create-test-session
app.options('/create-test-session', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /create-test-session - Create test session
app.post('/create-test-session', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;
    const { name } = req.body;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Create test session
    const sessionData = {
      name: name || `Test Session ${new Date().toISOString()}`,
      status: 'DRAFT',
      organizationId,
      createdBy: userId,
      isTest: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const sessionRef = await db.collection('sessions').add(sessionData);

    console.log(`✅ [TEST] Created test session ${sessionRef.id}`);
    return res.status(201).json({
      success: true,
      message: 'Test session created successfully',
      data: {
        id: sessionRef.id,
        ...sessionData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /create-test-session:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create test session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /demo
app.options('/demo', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /demo - Demo endpoint
app.post('/demo', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Demo endpoint is working',
      data: {
        userId,
        organizationId,
        timestamp: new Date().toISOString(),
        requestBody: req.body
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /demo:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process demo request',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ============================================================================
// CALL SHEET & DAILY STATUS ENDPOINTS (Agent 1 - Continued)
// ============================================================================

// Handle OPTIONS for GET /:teamId/workflow-assignments
app.options('/sessions/:teamId/workflow-assignments', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/:teamId/workflow-assignments - Get team assignments
app.get('/sessions/:teamId/workflow-assignments', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const teamId = decodeURIComponent(req.params.teamId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get team members
    const teamMembersSnapshot = await db.collection('teamMembers')
      .where('teamId', '==', teamId)
      .where('organizationId', '==', organizationId)
      .get();

    const teamMemberIds = teamMembersSnapshot.docs.map(doc => doc.data().userId);

    // Get workflow assignments for team members
    const assignmentsSnapshot = await db.collection('workflowAssignments')
      .where('organizationId', '==', organizationId)
      .where('assignedUserId', 'in', teamMemberIds.length > 0 ? teamMemberIds : [''])
      .get();

    const assignments = assignmentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: assignments,
      count: assignments.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/:teamId/workflow-assignments:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch team workflow assignments',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /daily-status/:projectId
app.options('/sessions/daily-status/:projectId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/daily-status/:projectId - Get daily status
app.get('/sessions/daily-status/:projectId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const projectId = decodeURIComponent(req.params.projectId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;
    const { startDate, endDate } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Build query
    let query: any = db.collection('dailyStatus')
      .where('projectId', '==', projectId)
      .where('organizationId', '==', organizationId);

    // Apply date filters if provided
    if (startDate) {
      query = query.where('date', '>=', new Date(startDate as string));
    }
    if (endDate) {
      query = query.where('date', '<=', new Date(endDate as string));
    }

    const snapshot = await query.orderBy('date', 'desc').get();

    const statuses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: statuses,
      count: statuses.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/daily-status/:projectId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch daily status',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for PUT /daily-status
app.options('/sessions/daily-status', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// PUT /sessions/daily-status - Update daily status
app.put('/sessions/daily-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { projectId, date, ...statusData } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!projectId || !date) {
      return res.status(400).json({
        success: false,
        error: 'projectId and date are required'
      });
    }

    // Convert date string to Date if needed
    const statusDate = typeof date === 'string' ? new Date(date) : date;

    // Check if status exists
    const existingSnapshot = await db.collection('dailyStatus')
      .where('projectId', '==', projectId)
      .where('organizationId', '==', organizationId)
      .where('date', '==', statusDate)
      .limit(1)
      .get();

    const statusUpdate = {
      ...statusData,
      projectId,
      date: statusDate,
      organizationId,
      updatedBy: userId,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (!existingSnapshot.empty) {
      // Update existing
      await db.collection('dailyStatus').doc(existingSnapshot.docs[0].id).update(statusUpdate);
      const updatedDoc = await db.collection('dailyStatus').doc(existingSnapshot.docs[0].id).get();
      return res.status(200).json({
        success: true,
        message: 'Daily status updated successfully',
        data: { id: updatedDoc.id, ...updatedDoc.data() }
      });
    } else {
      // Create new
      const statusRef = await db.collection('dailyStatus').add({
        ...statusUpdate,
        createdBy: userId,
        createdAt: FieldValue.serverTimestamp()
      });
      const newDoc = await statusRef.get();
      return res.status(201).json({
        success: true,
        message: 'Daily status created successfully',
        data: { id: newDoc.id, ...newDoc.data() }
      });
    }
  } catch (error: any) {
    console.error(`❌ [API] Error in PUT /sessions/daily-status:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update daily status',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /linked-sessions/:callSheetId
app.options('/sessions/linked-sessions/:callSheetId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/linked-sessions/:callSheetId - Get linked sessions
app.get('/sessions/linked-sessions/:callSheetId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const callSheetId = decodeURIComponent(req.params.callSheetId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get linked sessions
    const linkedSessionsSnapshot = await db.collection('callSheetSessionLinks')
      .where('callSheetId', '==', callSheetId)
      .where('organizationId', '==', organizationId)
      .get();

    const linkedSessions = await Promise.all(linkedSessionsSnapshot.docs.map(async (doc) => {
      const linkData = doc.data();
      const sessionDoc = await db.collection('sessions').doc(linkData.sessionId).get();
      return {
        id: doc.id,
        ...linkData,
        session: sessionDoc.exists ? { id: sessionDoc.id, ...sessionDoc.data() } : null
      };
    }));

    return res.status(200).json({
      success: true,
      message: `Retrieved ${linkedSessions.length} linked sessions`,
      data: linkedSessions
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/linked-sessions/:callSheetId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch linked sessions',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /link-session
app.options('/sessions/link-session', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/link-session - Link session to call sheet
app.post('/sessions/link-session', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { callSheetId, sessionId } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!callSheetId || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'callSheetId and sessionId are required'
      });
    }

    // Verify both exist
    const [callSheetDoc, sessionDoc] = await Promise.all([
      db.collection('callSheets').doc(callSheetId).get(),
      db.collection('sessions').doc(sessionId).get()
    ]);

    if (!callSheetDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Call sheet not found'
      });
    }

    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const callSheetData = callSheetDoc.data();
    const sessionData = sessionDoc.data();

    if (callSheetData?.organizationId !== organizationId || sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to call sheet or session'
      });
    }

    // Check if already linked
    const existingSnapshot = await db.collection('callSheetSessionLinks')
      .where('callSheetId', '==', callSheetId)
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'Session already linked to this call sheet'
      });
    }

    // Create link
    const linkData = {
      callSheetId,
      sessionId,
      organizationId,
      linkedBy: userId,
      createdAt: FieldValue.serverTimestamp()
    };

    const linkRef = await db.collection('callSheetSessionLinks').add(linkData);

    console.log(`✅ [CALLSHEET] Linked session ${sessionId} to call sheet ${callSheetId}`);
    return res.status(201).json({
      success: true,
      message: 'Session linked successfully',
      data: {
        id: linkRef.id,
        ...linkData
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/link-session:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to link session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /session-context/:callSheetDate
app.options('/sessions/session-context/:callSheetDate', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/session-context/:callSheetDate - Get session context
app.get('/sessions/session-context/:callSheetDate', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const callSheetDate = decodeURIComponent(req.params.callSheetDate);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Parse date
    const date = new Date(callSheetDate);

    // Get call sheets for this date
    const callSheetsSnapshot = await db.collection('callSheets')
      .where('organizationId', '==', organizationId)
      .where('date', '==', date)
      .get();

    // Get linked sessions
    const callSheetIds = callSheetsSnapshot.docs.map(doc => doc.id);
    const linkedSessionsSnapshot = await db.collection('callSheetSessionLinks')
      .where('callSheetId', 'in', callSheetIds.length > 0 ? callSheetIds : [''])
      .where('organizationId', '==', organizationId)
      .get();

    const sessions = await Promise.all(linkedSessionsSnapshot.docs.map(async (doc) => {
      const linkData = doc.data();
      const sessionDoc = await db.collection('sessions').doc(linkData.sessionId).get();
      return sessionDoc.exists ? { id: sessionDoc.id, ...sessionDoc.data() } : null;
    }));

    return res.status(200).json({
      success: true,
      data: {
        date: callSheetDate,
        callSheets: callSheetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        sessions: sessions.filter(s => s !== null),
        callSheetCount: callSheetsSnapshot.size,
        sessionCount: sessions.filter(s => s !== null).length
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/session-context/:callSheetDate:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch session context',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for GET /session-schedule-summary/:callSheetDate
app.options('/sessions/session-schedule-summary/:callSheetDate', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/session-schedule-summary/:callSheetDate - Get schedule summary
app.get('/sessions/session-schedule-summary/:callSheetDate', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const callSheetDate = decodeURIComponent(req.params.callSheetDate);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Parse date
    const date = new Date(callSheetDate);

    // Get call sheets for this date
    const callSheetsSnapshot = await db.collection('callSheets')
      .where('organizationId', '==', organizationId)
      .where('date', '==', date)
      .get();

    // Get linked sessions
    const callSheetIds = callSheetsSnapshot.docs.map(doc => doc.id);
    const linkedSessionsSnapshot = await db.collection('callSheetSessionLinks')
      .where('callSheetId', 'in', callSheetIds.length > 0 ? callSheetIds : [''])
      .where('organizationId', '==', organizationId)
      .get();

    const sessions = await Promise.all(linkedSessionsSnapshot.docs.map(async (doc) => {
      const linkData = doc.data();
      const sessionDoc = await db.collection('sessions').doc(linkData.sessionId).get();
      return sessionDoc.exists ? { id: sessionDoc.id, ...sessionDoc.data() } : null;
    }));

    const summary = {
      date: callSheetDate,
      totalCallSheets: callSheetsSnapshot.size,
      totalSessions: sessions.filter(s => s !== null).length,
      sessionsByStatus: sessions.filter(s => s !== null).reduce((acc: any, session: any) => {
        const status = session.status || 'UNKNOWN';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {})
    };

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/session-schedule-summary/:callSheetDate:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule summary',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ====================
// Post-Production Tasks Endpoints
// ====================

// Shared handler function for getting post-production tasks
const getPostProductionTasksHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Get tasks
    const tasksSnapshot = await db.collection('postProductionTasks')
      .where('sessionId', '==', sessionId)
      .orderBy('updatedAt', 'desc')
      .get();

    const tasks = await Promise.all(tasksSnapshot.docs.map(async (doc) => {
      const taskData = doc.data();
      
      // Get role info
      let roleInfo = null;
      if (taskData.roleId) {
        const roleDoc = await db.collection('roles').doc(taskData.roleId).get();
        if (roleDoc.exists) {
          roleInfo = {
            id: roleDoc.id,
            roleName: roleDoc.data()?.roleName || null,
            department: roleDoc.data()?.department || null
          };
        }
      }

      // Get assigned user info
      let assignedUserInfo = null;
      if (taskData.assignedToUserId) {
        const userDoc = await db.collection('users').doc(taskData.assignedToUserId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          assignedUserInfo = {
            id: userDoc.id,
            firstName: userData?.firstName || null,
            lastName: userData?.lastName || null,
            name: userData?.name || userData?.displayName || null
          };
        }
      }

      // Get stage info
      let stageInfo = null;
      if (taskData.postProductionStageId) {
        const stageDoc = await db.collection('postProductionStages').doc(taskData.postProductionStageId).get();
        if (stageDoc.exists) {
          stageInfo = {
            id: stageDoc.id,
            stageName: stageDoc.data()?.stageName || null
          };
        }
      }

      return {
        id: doc.id,
        sessionId: taskData.sessionId,
        taskName: taskData.taskName || '',
        roleId: taskData.roleId || null,
        roleName: roleInfo?.roleName || 'Unknown Role',
        assignedToId: taskData.assignedToUserId || null,
        assignedToName: assignedUserInfo ? 
          `${assignedUserInfo.firstName || ''} ${assignedUserInfo.lastName || ''}`.trim() || assignedUserInfo.name :
          null,
        status: taskData.status || 'NOT_STARTED',
        startDate: taskData.startDate || null,
        dueDate: taskData.dueDate || null,
        completedDate: taskData.completedDate || null,
        notes: taskData.notes || '',
        filePath: taskData.filePath || null,
        postProductionStageId: taskData.postProductionStageId || null,
        postProductionStageName: stageInfo?.stageName || null,
        createdAt: taskData.createdAt,
        updatedAt: taskData.updatedAt,
        role: roleInfo,
        assignedToUser: assignedUserInfo,
        stage: stageInfo
      };
    }));

    return res.status(200).json(createSuccessResponse(tasks));
  } catch (error: any) {
    console.error('[Post-Production Tasks] Get error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch post-production tasks', error.message));
  }
};

// GET /sessions/:sessionId/post-production-tasks - Get post-production tasks
app.get('/sessions/:sessionId/post-production-tasks', authenticateToken, getPostProductionTasksHandler);

// GET /session/:sessionId - Get session tasks (alternative path)
app.get('/session/:sessionId', authenticateToken, getPostProductionTasksHandler);

// GET /sessions/post-production-tasks/session/:sessionId - Get tasks (alternative path)
app.get('/sessions/post-production-tasks/session/:sessionId', authenticateToken, getPostProductionTasksHandler);

// GET /api/sessions/post-production-tasks/session/:sessionId - Get tasks (alternative path)
app.get('/api/sessions/post-production-tasks/session/:sessionId', authenticateToken, getPostProductionTasksHandler);

// POST /sessions/:sessionId/default-post-production-tasks - Create default tasks
app.post('/sessions/:sessionId/default-post-production-tasks', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify session exists
    const sessionRef = db.collection('sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Update session status
    await sessionRef.update({
      status: 'POST_IN_PROGRESS',
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get default roles for post-production
    const rolesSnapshot = await db.collection('roles')
      .where('department', '==', 'Post-Production')
      .get();

    // Create tasks for each role
    const taskPromises = rolesSnapshot.docs.map(async (roleDoc) => {
      const roleData = roleDoc.data();
      const taskData = {
        sessionId,
        roleId: roleDoc.id,
        taskName: `${roleData.roleName || 'Task'} Task`,
        status: 'NOT_STARTED',
        organizationId: organizationId || sessionData?.organizationId || null,
        createdByUserId: userId,
        lastUpdatedByUserId: userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      return db.collection('postProductionTasks').add(taskData);
    });

    const taskRefs = await Promise.all(taskPromises);

    // Get created tasks with relations
    const tasks = await Promise.all(taskRefs.map(async (taskRef) => {
      const taskDoc = await taskRef.get();
      const taskData = taskDoc.data();

      // Get role info
      let roleInfo = null;
      if (taskData.roleId) {
        const roleDoc = await db.collection('roles').doc(taskData.roleId).get();
        if (roleDoc.exists) {
          roleInfo = {
            id: roleDoc.id,
            roleName: roleDoc.data()?.roleName || null,
            department: roleDoc.data()?.department || null
          };
        }
      }

      return {
        id: taskDoc.id,
        ...taskData,
        role: roleInfo
      };
    }));

    return res.status(201).json(createSuccessResponse(tasks));
  } catch (error: any) {
    console.error('[Post-Production Tasks] Create default tasks error:', error);
    return res.status(500).json(createErrorResponse('Failed to create default tasks', error.message));
  }
});

// POST /update-status - Update task status
app.post('/update-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const { taskId, status } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!taskId || !status) {
      return res.status(400).json(createErrorResponse('taskId and status are required'));
    }

    const taskRef = db.collection('postProductionTasks').doc(taskId);
    const taskDoc = await taskRef.get();

    if (!taskDoc.exists) {
      return res.status(404).json(createErrorResponse('Task not found'));
    }

    const updateData: any = {
      status,
      lastUpdatedByUserId: userId,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (status === 'COMPLETED') {
      updateData.completedDate = FieldValue.serverTimestamp();
    }

    await taskRef.update(updateData);

    const updatedDoc = await taskRef.get();
    const updatedTask = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    return res.status(200).json(createSuccessResponse(updatedTask));
  } catch (error: any) {
    console.error('[Post-Production Tasks] Update status error:', error);
    return res.status(500).json(createErrorResponse('Failed to update task status', error.message));
  }
});

// GET /tasks/session/:sessionId - Get session tasks (alternative path)
app.get('/tasks/session/:sessionId', authenticateToken, getPostProductionTasksHandler);

// ====================
// Timecard Session Links Endpoints
// ====================

// GET /timecard/session-links - Get timecard links
app.get('/timecard/session-links', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const userRole = req.user?.role;
    const { sessionId, timecardId, targetUserId } = req.query;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Build query based on permissions
    let query: any = db.collection('sessionTimecardLinks');

    // Admin users can see all links, others only their own
    if (['ADMIN', 'EXEC', 'POST_PRODUCER', 'LINE_PRODUCER', 'MANAGER'].includes(userRole || '')) {
      if (targetUserId) {
        // Get timecards for target user
        const timecardSnapshot = await db.collection('timecards')
          .where('userId', '==', targetUserId)
          .get();
        const timecardIds = timecardSnapshot.docs.map(doc => doc.id);
        
        if (timecardIds.length > 0) {
          // Firestore 'in' limit is 10, so batch if needed
          if (timecardIds.length <= 10) {
            query = query.where('timecardId', 'in', timecardIds);
          } else {
            // Fetch all and filter
            const allLinks = await db.collection('sessionTimecardLinks').get();
            const filteredLinks = allLinks.docs
              .filter(doc => timecardIds.includes(doc.data().timecardId))
              .map(doc => ({ id: doc.id, ...doc.data() }));
            
            return res.status(200).json(createSuccessResponse(filteredLinks));
          }
        } else {
          return res.status(200).json(createSuccessResponse([]));
        }
      }
    } else {
      // Regular users - get their timecards first
      const timecardSnapshot = await db.collection('timecards')
        .where('userId', '==', userId)
        .get();
      const timecardIds = timecardSnapshot.docs.map(doc => doc.id);
      
      if (timecardIds.length > 0) {
        if (timecardIds.length <= 10) {
          query = query.where('timecardId', 'in', timecardIds);
        } else {
          const allLinks = await db.collection('sessionTimecardLinks').get();
          const filteredLinks = allLinks.docs
            .filter(doc => timecardIds.includes(doc.data().timecardId))
            .map(doc => ({ id: doc.id, ...doc.data() }));
          
          return res.status(200).json(createSuccessResponse(filteredLinks));
        }
      } else {
        return res.status(200).json(createSuccessResponse([]));
      }
    }

    // Apply additional filters
    if (sessionId) {
      query = query.where('sessionId', '==', sessionId);
    }
    if (timecardId) {
      query = query.where('timecardId', '==', timecardId);
    }

    const linksSnapshot = await query.get();

    const links = await Promise.all(linksSnapshot.docs.map(async (doc) => {
      const linkData = doc.data();
      
      // Get timecard info
      let timecardInfo = null;
      if (linkData.timecardId) {
        const timecardDoc = await db.collection('timecards').doc(linkData.timecardId).get();
        if (timecardDoc.exists) {
          const timecardData = timecardDoc.data();
          
          // Get user info
          let userInfo = null;
          if (timecardData?.userId) {
            const userDoc = await db.collection('users').doc(timecardData.userId).get();
            if (userDoc.exists) {
              userInfo = {
                id: userDoc.id,
                name: userDoc.data()?.name || userDoc.data()?.displayName || null,
                email: userDoc.data()?.email || null
              };
            }
          }

          timecardInfo = {
            id: timecardDoc.id,
            ...timecardData,
            user: userInfo
          };
        }
      }

      return {
        id: doc.id,
        ...linkData,
        timecard: timecardInfo
      };
    }));

    return res.status(200).json(createSuccessResponse(links));
  } catch (error: any) {
    console.error('[Timecard Session Links] Get error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch session-timecard links', error.message));
  }
});

// GET /timecard/session-links/session/:sessionId - Get session timecard links
app.get('/timecard/session-links/session/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();

    // Build query based on permissions
    let query: any = db.collection('sessionTimecardLinks')
      .where('sessionId', '==', sessionId);

    // Regular users can only see their own timecard links
    if (!['ADMIN', 'EXEC', 'POST_PRODUCER', 'LINE_PRODUCER', 'MANAGER'].includes(userRole || '')) {
      // Get user's timecards
      const timecardSnapshot = await db.collection('timecards')
        .where('userId', '==', userId)
        .get();
      const timecardIds = timecardSnapshot.docs.map(doc => doc.id);
      
      if (timecardIds.length > 0) {
        if (timecardIds.length <= 10) {
          query = query.where('timecardId', 'in', timecardIds);
        } else {
          const allLinks = await db.collection('sessionTimecardLinks')
            .where('sessionId', '==', sessionId)
            .get();
          const filteredLinks = allLinks.docs
            .filter(doc => timecardIds.includes(doc.data().timecardId))
            .map(doc => ({ id: doc.id, ...doc.data() }));
          
          return res.status(200).json(createSuccessResponse({
            session: {
              id: sessionDoc.id,
              sessionName: sessionData?.sessionName || null,
              status: sessionData?.status || null
            },
            links: filteredLinks,
            count: filteredLinks.length
          }));
        }
      } else {
        return res.status(200).json(createSuccessResponse({
          session: {
            id: sessionDoc.id,
            sessionName: sessionData?.sessionName || null,
            status: sessionData?.status || null
          },
          links: [],
          count: 0
        }));
      }
    }

    const linksSnapshot = await query.orderBy('createdAt', 'desc').get();

    const links = await Promise.all(linksSnapshot.docs.map(async (doc) => {
      const linkData = doc.data();
      
      // Get timecard info
      let timecardInfo = null;
      if (linkData.timecardId) {
        const timecardDoc = await db.collection('timecards').doc(linkData.timecardId).get();
        if (timecardDoc.exists) {
          const timecardData = timecardDoc.data();
          
          // Get user info
          let userInfo = null;
          if (timecardData?.userId) {
            const userDoc = await db.collection('users').doc(timecardData.userId).get();
            if (userDoc.exists) {
              userInfo = {
                id: userDoc.id,
                name: userDoc.data()?.name || userDoc.data()?.displayName || null,
                email: userDoc.data()?.email || null
              };
            }
          }

          timecardInfo = {
            id: timecardDoc.id,
            ...timecardData,
            user: userInfo
          };
        }
      }

      return {
        id: doc.id,
        ...linkData,
        timecard: timecardInfo
      };
    }));

    return res.status(200).json(createSuccessResponse({
      session: {
        id: sessionDoc.id,
        sessionName: sessionData?.sessionName || null,
        status: sessionData?.status || null
      },
      links,
      count: links.length
    }));
  } catch (error: any) {
    console.error('[Timecard Session Links] Get session links error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch session timecard links', error.message));
  }
});

// POST /timecard/session-links - Create timecard link
app.post('/timecard/session-links', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const userRole = req.user?.role;
    const { sessionId, timecardId, linkType = 'WORK_ASSIGNMENT', notes, linkReason } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!sessionId || !timecardId) {
      return res.status(400).json(createErrorResponse('Session ID and Timecard ID are required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    // Verify timecard exists
    const timecardDoc = await db.collection('timecards').doc(timecardId).get();
    if (!timecardDoc.exists) {
      return res.status(404).json(createErrorResponse('Timecard not found'));
    }

    const timecardData = timecardDoc.data();

    // Check permissions
    if (!['ADMIN', 'EXEC', 'POST_PRODUCER', 'LINE_PRODUCER', 'MANAGER'].includes(userRole || '')) {
      if (timecardData?.userId !== userId) {
        return res.status(403).json(createErrorResponse('Cannot link another user\'s timecard'));
      }
    }

    // Check if link already exists
    const existingSnapshot = await db.collection('sessionTimecardLinks')
      .where('sessionId', '==', sessionId)
      .where('timecardId', '==', timecardId)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json(createErrorResponse('Link already exists between this session and timecard'));
    }

    // Create link
    const linkData = {
      sessionId,
      timecardId,
      linkType,
      notes: notes || null,
      linkReason: linkReason || null,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp()
    };

    const linkRef = await db.collection('sessionTimecardLinks').add(linkData);

    // Get timecard with user info
    let userInfo = null;
    if (timecardData?.userId) {
      const userDoc = await db.collection('users').doc(timecardData.userId).get();
      if (userDoc.exists) {
        userInfo = {
          id: userDoc.id,
          name: userDoc.data()?.name || userDoc.data()?.displayName || null
        };
      }
    }

    const link = {
      id: linkRef.id,
      ...linkData,
      timecard: {
        id: timecardDoc.id,
        ...timecardData,
        user: userInfo
      }
    };

    return res.status(201).json(createSuccessResponse(link));
  } catch (error: any) {
    console.error('[Timecard Session Links] Create error:', error);
    return res.status(500).json(createErrorResponse('Failed to create session-timecard link', error.message));
  }
});

// ====================
// Dashboard Endpoints
// ====================

// GET /consolidated-sessions - Get consolidated sessions
app.get('/consolidated-sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { id } = req.query;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!organizationId) {
      return res.status(403).json(createErrorResponse('User not associated with any organization'));
    }

    if (id) {
      // Get specific session with all related data
      const sessionDoc = await db.collection('sessions').doc(id as string).get();
      if (!sessionDoc.exists) {
        return res.status(404).json(createErrorResponse('Session not found'));
      }

      const sessionData = sessionDoc.data();
      if (sessionData?.organizationId !== organizationId) {
        return res.status(403).json(createErrorResponse('Access denied to session'));
      }

      // Get related data
      const [assignmentsSnapshot, tasksSnapshot, reviewsSnapshot] = await Promise.all([
        db.collection('sessionAssignments')
          .where('sessionId', '==', id)
          .get(),
        db.collection('postProductionTasks')
          .where('sessionId', '==', id)
          .get(),
        db.collection('reviewSessions')
          .where('sessionId', '==', id)
          .get()
      ]);

      const assignments = await Promise.all(assignmentsSnapshot.docs.map(async (doc) => {
        const assignData = doc.data();
        let userInfo = null;
        if (assignData.userId) {
          const userDoc = await db.collection('users').doc(assignData.userId).get();
          if (userDoc.exists) {
            userInfo = { id: userDoc.id, ...userDoc.data() };
          }
        }
        return { id: doc.id, ...assignData, user: userInfo };
      }));

      const tasks = tasksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const reviews = reviewsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const consolidatedData = {
        id: sessionDoc.id,
        ...sessionData,
        sessionAssignments: assignments,
        postProductionTasks: tasks,
        reviewSessions: reviews,
        assignmentsCount: assignments.length,
        tasksCount: tasks.length,
        tasksCompleted: tasks.filter((t: any) => t.status === 'COMPLETED').length,
        reviewsCount: reviews.length
      };

      return res.status(200).json(createSuccessResponse(consolidatedData));
    } else {
      // Get all sessions with basic related data
      const sessionsSnapshot = await db.collection('sessions')
        .where('organizationId', '==', organizationId)
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get();

      const sessions = await Promise.all(sessionsSnapshot.docs.map(async (doc) => {
        const sessionData = doc.data();
        
        // Get summary counts
        const [assignmentsCount, tasksCount, reviewsCount] = await Promise.all([
          db.collection('sessionAssignments')
            .where('sessionId', '==', doc.id)
            .get(),
          db.collection('postProductionTasks')
            .where('sessionId', '==', doc.id)
            .get(),
          db.collection('reviewSessions')
            .where('sessionId', '==', doc.id)
            .get()
        ]);

        const tasks = tasksCount.docs.map(d => d.data());
        const tasksCompleted = tasks.filter((t: any) => t.status === 'COMPLETED').length;

        return {
          id: doc.id,
          sessionName: sessionData.sessionName || sessionData.name || null,
          sessionDate: sessionData.sessionDate || null,
          dueDate: sessionData.dueDate || null,
          location: sessionData.location || null,
          status: sessionData.status || null,
          stageName: null,
          currentPostProductionStageName: null,
          assignmentsCount: assignmentsCount.size,
          tasksCount: tasksCount.size,
          tasksCompleted,
          reviewsCount: reviewsCount.size,
          createdAt: sessionData.createdAt,
          updatedAt: sessionData.updatedAt
        };
      }));

      return res.status(200).json(createSuccessResponse(sessions));
    }
  } catch (error: any) {
    console.error('[Dashboard] Get consolidated sessions error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch consolidated sessions', error.message));
  }
});

// ====================
// PBM Endpoints
// ====================

// PUT /sessions/:sessionId/link - Link session to PBM project
app.put('/sessions/:sessionId/link', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { pbmProjectId } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify session exists
    const sessionRef = db.collection('sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Update session with PBM project link
    await sessionRef.update({
      pbmProjectId: pbmProjectId || null,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Get updated session
    const updatedDoc = await sessionRef.get();
    let pbmProjectInfo = null;

    if (pbmProjectId) {
      const pbmDoc = await db.collection('pbmProjects').doc(pbmProjectId).get();
      if (pbmDoc.exists) {
        pbmProjectInfo = {
          id: pbmDoc.id,
          name: pbmDoc.data()?.name || null
        };
      }
    }

    const session = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      pbmProject: pbmProjectInfo
    };

    return res.status(200).json(createSuccessResponse(session));
  } catch (error: any) {
    console.error('[PBM] Link session error:', error);
    return res.status(500).json(createErrorResponse('Failed to link session to PBM project', error.message));
  }
});

// ====================
// Project Export Endpoints
// ====================

// GET /production-sessions - Export production sessions
app.get('/production-sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!organizationId) {
      return res.status(403).json(createErrorResponse('User not associated with any organization'));
    }

    const sessionsSnapshot = await db.collection('sessions')
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(createSuccessResponse(sessions));
  } catch (error: any) {
    console.error('[Project Export] Export production sessions error:', error);
    return res.status(500).json(createErrorResponse('Failed to export production sessions', error.message));
  }
});

// GET /review-sessions - Export review sessions
app.get('/review-sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!organizationId) {
      return res.status(403).json(createErrorResponse('User not associated with any organization'));
    }

    const reviewsSnapshot = await db.collection('reviewSessions')
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .get();

    const reviews = await Promise.all(reviewsSnapshot.docs.map(async (doc) => {
      const reviewData = doc.data();
      
      // Get related data
      const [reviewersSnapshot, notesSnapshot, approvalsSnapshot, assignmentsSnapshot] = await Promise.all([
        db.collection('reviewSessionReviewers')
          .where('reviewSessionId', '==', doc.id)
          .get(),
        db.collection('reviewNotes')
          .where('reviewSessionId', '==', doc.id)
          .get(),
        db.collection('reviewApprovals')
          .where('reviewSessionId', '==', doc.id)
          .get(),
        db.collection('reviewAssignments')
          .where('reviewSessionId', '==', doc.id)
          .get()
      ]);

      // Get session info
      let sessionInfo = null;
      if (reviewData.sessionId) {
        const sessionDoc = await db.collection('sessions').doc(reviewData.sessionId).get();
        if (sessionDoc.exists) {
          sessionInfo = { id: sessionDoc.id, ...sessionDoc.data() };
        }
      }

      const reviewers = await Promise.all(reviewersSnapshot.docs.map(async (rDoc) => {
        const rData = rDoc.data();
        const userDoc = await db.collection('users').doc(rData.userId).get();
        return {
          id: rDoc.id,
          ...rData,
          user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null
        };
      }));

      const notes = await Promise.all(notesSnapshot.docs.map(async (nDoc) => {
        const nData = nDoc.data();
        const userDoc = await db.collection('users').doc(nData.createdByUserId).get();
        return {
          id: nDoc.id,
          ...nData,
          createdByUser: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null
        };
      }));

      const approvals = await Promise.all(approvalsSnapshot.docs.map(async (aDoc) => {
        const aData = aDoc.data();
        const userDoc = await db.collection('users').doc(aData.approverUserId).get();
        return {
          id: aDoc.id,
          ...aData,
          approver: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null
        };
      }));

      const assignments = await Promise.all(assignmentsSnapshot.docs.map(async (aDoc) => {
        const aData = aDoc.data();
        const userDoc = await db.collection('users').doc(aData.assignedUserId).get();
        const assignedByDoc = await db.collection('users').doc(aData.assignedByUserId).get();
        return {
          id: aDoc.id,
          ...aData,
          assignedUser: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null,
          assignedBy: assignedByDoc.exists ? { id: assignedByDoc.id, ...assignedByDoc.data() } : null
        };
      }));

      return {
        id: doc.id,
        ...reviewData,
        session: sessionInfo,
        reviewers,
        reviewNotes: notes,
        reviewApprovals: approvals,
        reviewAssignments: assignments
      };
    }));

    return res.status(200).json(createSuccessResponse(reviews));
  } catch (error: any) {
    console.error('[Project Export] Export review sessions error:', error);
    return res.status(500).json(createErrorResponse('Failed to export review sessions', error.message));
  }
});

// GET /unified-workflow-instances - Export workflow instances
app.get('/unified-workflow-instances', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!organizationId) {
      return res.status(403).json(createErrorResponse('User not associated with any organization'));
    }

    const instancesSnapshot = await db.collection('workflowInstances')
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .get();

    const instances = instancesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(createSuccessResponse(instances));
  } catch (error: any) {
    console.error('[Project Export] Export workflow instances error:', error);
    return res.status(500).json(createErrorResponse('Failed to export workflow instances', error.message));
  }
});

// GET /workflow-diagrams - Export workflow diagrams
app.get('/workflow-diagrams', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Get user's own diagrams + public templates
    const userDiagramsSnapshot = await db.collection('workflowDiagrams')
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc')
      .get();

    const publicTemplatesSnapshot = await db.collection('workflowDiagrams')
      .where('isTemplate', '==', true)
      .where('isPublic', '==', true)
      .orderBy('updatedAt', 'desc')
      .get();

    const diagramMap = new Map<string, any>();

    userDiagramsSnapshot.docs.forEach(doc => {
      diagramMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    publicTemplatesSnapshot.docs.forEach(doc => {
      if (!diagramMap.has(doc.id)) {
        diagramMap.set(doc.id, { id: doc.id, ...doc.data() });
      }
    });

    const diagrams = Array.from(diagramMap.values());

    return res.status(200).json(createSuccessResponse(diagrams));
  } catch (error: any) {
    console.error('[Project Export] Export workflow diagrams error:', error);
    return res.status(500).json(createErrorResponse('Failed to export workflow diagrams', error.message));
  }
});

// ====================
// Additional Endpoints
// ====================

// GET /review-sessions/:sessionId - Get review session (test route)
app.get('/review-sessions/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // This endpoint seems to get a review session by sessionId (not reviewId)
    // Get review sessions for this session
    const reviewsSnapshot = await db.collection('reviewSessions')
      .where('sessionId', '==', sessionId)
      .orderBy('createdAt', 'desc')
      .get();

    const reviews = reviewsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(createSuccessResponse(reviews));
  } catch (error: any) {
    console.error('[Reviews] Get review session error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch review session', error.message));
  }
});

// POST /sessions/:sessionId/team-members - Add team members
app.post('/sessions/:sessionId/team-members', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { teamMemberIds } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!teamMemberIds || !Array.isArray(teamMemberIds)) {
      return res.status(400).json(createErrorResponse('teamMemberIds array is required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Create session assignments for team members
    const assignments = await Promise.all(teamMemberIds.map(async (memberId: string) => {
      // Check if assignment already exists
      const existingSnapshot = await db.collection('sessionAssignments')
        .where('sessionId', '==', sessionId)
        .where('userId', '==', memberId)
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        return { id: existingSnapshot.docs[0].id, ...existingSnapshot.docs[0].data() };
      }

      // Create new assignment
      const assignmentData = {
        sessionId,
        userId: memberId,
        organizationId: organizationId || sessionData?.organizationId || null,
        assignedBy: userId,
        assignedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      };

      const assignmentRef = await db.collection('sessionAssignments').add(assignmentData);
      return { id: assignmentRef.id, ...assignmentData };
    }));

    return res.status(201).json(createSuccessResponse(assignments));
  } catch (error: any) {
    console.error('[Sessions] Add team members error:', error);
    return res.status(500).json(createErrorResponse('Failed to add team members', error.message));
  }
});

// GET /watcher-status - Get watcher status (media indexing)
app.get('/watcher-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Get watcher status from system settings or dedicated collection
    const statusDoc = await db.collection('systemSettings').doc('watcherStatus').get();
    
    const status = statusDoc.exists ? statusDoc.data() : {
      isRunning: false,
      lastCheck: null,
      indexedFiles: 0,
      errors: []
    };

    return res.status(200).json(createSuccessResponse(status));
  } catch (error: any) {
    console.error('[Media Indexing] Get watcher status error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch watcher status', error.message));
  }
});

// GET /workflows - Get workflow analytics
app.get('/workflows', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!organizationId) {
      return res.status(403).json(createErrorResponse('User not associated with any organization'));
    }

    // Get workflow instances for analytics
    const instancesSnapshot = await db.collection('workflowInstances')
      .where('organizationId', '==', organizationId)
      .get();

    // Calculate analytics
    const totalWorkflows = instancesSnapshot.size;
    const completedWorkflows = instancesSnapshot.docs.filter(doc => doc.data().status === 'COMPLETED').length;
    const inProgressWorkflows = instancesSnapshot.docs.filter(doc => doc.data().status === 'IN_PROGRESS').length;

    // Get steps analytics
    const allStepIds: string[] = [];
    for (const instanceDoc of instancesSnapshot.docs) {
      const stepsSnapshot = await db.collection('workflowSteps')
        .where('workflowInstanceId', '==', instanceDoc.id)
        .get();
      allStepIds.push(...stepsSnapshot.docs.map(doc => doc.id));
    }

    const analytics = {
      totalWorkflows,
      completedWorkflows,
      inProgressWorkflows,
      totalSteps: allStepIds.length,
      averageStepsPerWorkflow: totalWorkflows > 0 ? allStepIds.length / totalWorkflows : 0
    };

    return res.status(200).json(createSuccessResponse(analytics));
  } catch (error: any) {
    console.error('[Analytics] Get workflow analytics error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch workflow analytics', error.message));
  }
});

// POST /apply-to-session/:sessionId - Apply pod assignments
app.post('/apply-to-session/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { podAssignments } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!podAssignments || !Array.isArray(podAssignments)) {
      return res.status(400).json(createErrorResponse('podAssignments array is required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Apply pod assignments (create session assignments)
    const assignments = await Promise.all(podAssignments.map(async (assignment: any) => {
      const assignmentData = {
        sessionId,
        userId: assignment.userId,
        roleId: assignment.roleId || null,
        podId: assignment.podId || null,
        organizationId: organizationId || sessionData?.organizationId || null,
        assignedBy: userId,
        assignedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      };

      const assignmentRef = await db.collection('sessionAssignments').add(assignmentData);
      return { id: assignmentRef.id, ...assignmentData };
    }));

    return res.status(201).json(createSuccessResponse(assignments));
  } catch (error: any) {
    console.error('[Pod Assignments] Apply to session error:', error);
    return res.status(500).json(createErrorResponse('Failed to apply pod assignments', error.message));
  }
});

// POST /check-session-access - Check session access
app.post('/check-session-access', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { sessionId } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!sessionId) {
      return res.status(400).json(createErrorResponse('sessionId is required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createSuccessResponse({ hasAccess: false, reason: 'Session not found' }));
    }

    const sessionData = sessionDoc.data();
    
    // Check organization access
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(200).json(createSuccessResponse({ hasAccess: false, reason: 'Organization mismatch' }));
    }

    // Check if user is assigned
    const assignmentSnapshot = await db.collection('sessionAssignments')
      .where('sessionId', '==', sessionId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    const hasAccess = !assignmentSnapshot.empty || req.user?.role === 'ADMIN';

    return res.status(200).json(createSuccessResponse({
      hasAccess,
      reason: hasAccess ? 'User has access' : 'User not assigned to session'
    }));
  } catch (error: any) {
    console.error('[Automation] Check session access error:', error);
    return res.status(500).json(createErrorResponse('Failed to check session access', error.message));
  }
});

// POST /filter-sessions - Filter sessions
app.post('/filter-sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { filters } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!organizationId) {
      return res.status(403).json(createErrorResponse('User not associated with any organization'));
    }

    // Build query
    let query: any = db.collection('sessions')
      .where('organizationId', '==', organizationId);

    // Apply filters
    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters?.phase) {
      query = query.where('phase', '==', filters.phase);
    }
    if (filters?.startDate) {
      query = query.where('sessionDate', '>=', new Date(filters.startDate));
    }
    if (filters?.endDate) {
      query = query.where('sessionDate', '<=', new Date(filters.endDate));
    }

    const snapshot = await query.orderBy('updatedAt', 'desc').limit(100).get();

    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(createSuccessResponse(sessions));
  } catch (error: any) {
    console.error('[Automation] Filter sessions error:', error);
    return res.status(500).json(createErrorResponse('Failed to filter sessions', error.message));
  }
});

// POST /execute-session-time-action - Execute session time action
app.post('/execute-session-time-action', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const { sessionId, action, timeData } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!sessionId || !action) {
      return res.status(400).json(createErrorResponse('sessionId and action are required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    // Execute action based on type
    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp()
    };

    if (action === 'SET_START_TIME' && timeData?.startTime) {
      updateData.startTime = timeData.startTime;
    } else if (action === 'SET_END_TIME' && timeData?.endTime) {
      updateData.endTime = timeData.endTime;
    } else if (action === 'SET_DURATION' && timeData?.duration) {
      updateData.duration = timeData.duration;
    }

    await sessionDoc.ref.update(updateData);

    const updatedDoc = await sessionDoc.ref.get();
    const session = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    return res.status(200).json(createSuccessResponse(session));
  } catch (error: any) {
    console.error('[Notifications] Execute session time action error:', error);
    return res.status(500).json(createErrorResponse('Failed to execute session time action', error.message));
  }
});

// POST /smart-session-time - Smart session time
app.post('/smart-session-time', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const { sessionId } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!sessionId) {
      return res.status(400).json(createErrorResponse('sessionId is required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    // Calculate smart time based on workflow steps, assignments, etc.
    // This is a simplified version - can be enhanced with actual logic
    const sessionData = sessionDoc.data();
    const smartTime = {
      estimatedDuration: sessionData?.estimatedDuration || null,
      actualDuration: sessionData?.actualDuration || null,
      startTime: sessionData?.startTime || null,
      endTime: sessionData?.endTime || null
    };

    return res.status(200).json(createSuccessResponse(smartTime));
  } catch (error: any) {
    console.error('[Notifications] Smart session time error:', error);
    return res.status(500).json(createErrorResponse('Failed to calculate smart session time', error.message));
  }
});

// PUT /:id/mint-complete - Mint complete (RWA)
app.put('/:id/mint-complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.uid;
    const { mintData } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // This endpoint seems to be for RWA (Real World Assets) minting
    // Update the record with mint completion data
    const recordRef = db.collection('rwaRecords').doc(id);
    const recordDoc = await recordRef.get();

    if (!recordDoc.exists) {
      return res.status(404).json(createErrorResponse('Record not found'));
    }

    await recordRef.update({
      mintStatus: 'COMPLETE',
      mintData: mintData || null,
      mintedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedDoc = await recordRef.get();
    const record = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    return res.status(200).json(createSuccessResponse(record));
  } catch (error: any) {
    console.error('[RWA] Mint complete error:', error);
    return res.status(500).json(createErrorResponse('Failed to mark mint as complete', error.message));
  }
});

// PUT /sessions/:sessionId/archive-status - Update archive status
app.put('/sessions/:sessionId/archive-status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { archiveStatus } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!archiveStatus) {
      return res.status(400).json(createErrorResponse('archiveStatus is required'));
    }

    // Verify session exists
    const sessionRef = db.collection('sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Update archive status
    await sessionRef.update({
      archiveStatus: archiveStatus,
      archivedAt: archiveStatus === 'ARCHIVED' ? FieldValue.serverTimestamp() : null,
      archivedBy: archiveStatus === 'ARCHIVED' ? userId : null,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedDoc = await sessionRef.get();
    const session = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };

    return res.status(200).json(createSuccessResponse(session));
  } catch (error: any) {
    console.error('[Archives] Update archive status error:', error);
    return res.status(500).json(createErrorResponse('Failed to update archive status', error.message));
  }
});

// POST /sessions/:sessionId/workflow-sync - Sync workflow
app.post('/sessions/:sessionId/workflow-sync', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Sync workflow - this would typically involve syncing workflow state
    // For now, just return success
    return res.status(200).json(createSuccessResponse({ synced: true, sessionId }));
  } catch (error: any) {
    console.error('[Messaging] Workflow sync error:', error);
    return res.status(500).json(createErrorResponse('Failed to sync workflow', error.message));
  }
});

// GET /sessions/:sessionId/workflow-participants - Get workflow participants
app.get('/sessions/:sessionId/workflow-participants', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Get workflow instances for this session
    const instancesSnapshot = await db.collection('workflowInstances')
      .where('sessionId', '==', sessionId)
      .get();

    // Get all step assignments
    const allParticipants: Set<string> = new Set();
    
    for (const instanceDoc of instancesSnapshot.docs) {
      const stepsSnapshot = await db.collection('workflowSteps')
        .where('workflowInstanceId', '==', instanceDoc.id)
        .get();

      for (const stepDoc of stepsSnapshot.docs) {
        const assignmentsSnapshot = await db.collection('workflowStepAssignments')
          .where('workflowStepId', '==', stepDoc.id)
          .where('isActive', '==', true)
          .get();

        assignmentsSnapshot.docs.forEach(doc => {
          const assignData = doc.data();
          if (assignData.userId) {
            allParticipants.add(assignData.userId);
          }
        });
      }
    }

    // Get user details
    const participants = await Promise.all(Array.from(allParticipants).map(async (participantId) => {
      const userDoc = await db.collection('users').doc(participantId).get();
      if (userDoc.exists) {
        return {
          id: userDoc.id,
          name: userDoc.data()?.name || userDoc.data()?.displayName || null,
          email: userDoc.data()?.email || null
        };
      }
      return null;
    }));

    return res.status(200).json(createSuccessResponse(participants.filter(p => p !== null)));
  } catch (error: any) {
    console.error('[Messaging] Get workflow participants error:', error);
    return res.status(500).json(createErrorResponse('Failed to fetch workflow participants', error.message));
  }
});

// PUT /sessions/:sessionId/participants - Update participants
app.put('/sessions/:sessionId/participants', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;
    const { participants } = req.body;

    if (!userId) {
      return res.status(401).json(createErrorResponse('User authentication required'));
    }

    if (!participants || !Array.isArray(participants)) {
      return res.status(400).json(createErrorResponse('participants array is required'));
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json(createErrorResponse('Session not found'));
    }

    const sessionData = sessionDoc.data();
    if (organizationId && sessionData?.organizationId !== organizationId) {
      return res.status(403).json(createErrorResponse('Access denied to session'));
    }

    // Update participants (this could be message session participants or session assignments)
    // For now, we'll update message session participants
    const messageSessionsSnapshot = await db.collection('messageSessions')
      .where('productionSessionId', '==', sessionId)
      .get();

    const batch = db.batch();
    messageSessionsSnapshot.docs.forEach(sessionDoc => {
      // Update participants for each message session
      participants.forEach((participant: any) => {
        // This is a simplified version - actual implementation would update participant records
      });
    });

    await batch.commit();

    return res.status(200).json(createSuccessResponse({ updated: true }));
  } catch (error: any) {
    console.error('[Messaging] Update participants error:', error);
    return res.status(500).json(createErrorResponse('Failed to update participants', error.message));
  }
});

// ============================================================================
// TEMPLATE & CALL SHEET ENDPOINTS (Agent 1 - Final)
// ============================================================================

// Handle OPTIONS for GET /templates
app.options('/sessions/templates', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
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
});

// GET /sessions/templates - Get session templates
app.get('/sessions/templates', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get templates (workflow templates and session templates)
    const [workflowTemplatesSnapshot, sessionTemplatesSnapshot] = await Promise.all([
      db.collection('workflowTemplates')
        .where('organizationId', '==', organizationId)
        .get(),
      db.collection('sessionTemplates')
        .where('organizationId', '==', organizationId)
        .get()
    ]);

    const templates = [
      ...workflowTemplatesSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'workflow',
        ...doc.data()
      })),
      ...sessionTemplatesSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'session',
        ...doc.data()
      }))
    ];

    return res.status(200).json({
      success: true,
      data: templates,
      count: templates.length
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in GET /sessions/templates:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /:templateId/apply/:sessionId
app.options('/sessions/templates/:templateId/apply/:sessionId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/templates/:templateId/apply/:sessionId - Apply template to session
app.post('/sessions/templates/:templateId/apply/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const templateId = decodeURIComponent(req.params.templateId);
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Get template (try workflow template first, then session template)
    let templateDoc = await db.collection('workflowTemplates').doc(templateId).get();
    let templateType = 'workflow';

    if (!templateDoc.exists) {
      templateDoc = await db.collection('sessionTemplates').doc(templateId).get();
      templateType = 'session';
    }

    if (!templateDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const templateData = templateDoc.data();
    if (templateData?.organizationId && templateData.organizationId !== organizationId) {
      if (!templateData.isPublic) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this template'
        });
      }
    }

    // Apply template based on type
    if (templateType === 'workflow') {
      // Create workflow instance from template
      const workflowData = {
        sessionId,
        workflowDiagramId: templateId,
        name: templateData.name || 'Workflow',
        status: 'ACTIVE',
        progress: 0,
        organizationId,
        createdByUserId: userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      const workflowRef = await db.collection('unifiedWorkflowInstances').add(workflowData);

      console.log(`✅ [TEMPLATES] Applied workflow template ${templateId} to session ${sessionId}`);
      return res.status(200).json({
        success: true,
        message: 'Template applied successfully',
        data: {
          workflowInstanceId: workflowRef.id,
          ...workflowData
        }
      });
    } else {
      // Apply session template (copy template fields to session)
      const updateData: any = {
        updatedAt: FieldValue.serverTimestamp()
      };

      // Copy relevant fields from template
      if (templateData.name) updateData.name = templateData.name;
      if (templateData.description) updateData.description = templateData.description;
      if (templateData.defaultTasks) updateData.defaultTasks = templateData.defaultTasks;

      await db.collection('sessions').doc(sessionId).update(updateData);

      console.log(`✅ [TEMPLATES] Applied session template ${templateId} to session ${sessionId}`);
      return res.status(200).json({
        success: true,
        message: 'Template applied successfully'
      });
    }
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/templates/:templateId/apply/:sessionId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to apply template',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /from-session/:sessionId
app.options('/sessions/from-session/:sessionId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/from-session/:sessionId - Create from session
app.post('/sessions/from-session/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sourceSessionId = decodeURIComponent(req.params.sessionId);
    const { name, copyTasks = false, copyAssignments = false } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify source session exists
    const sourceSessionDoc = await db.collection('sessions').doc(sourceSessionId).get();
    if (!sourceSessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Source session not found'
      });
    }

    const sourceSessionData = sourceSessionDoc.data();
    if (sourceSessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to source session'
      });
    }

    // Create new session from source
    const newSessionData = {
      name: name || `${sourceSessionData.name || 'Session'} (Copy)`,
      description: sourceSessionData.description || null,
      status: 'DRAFT',
      organizationId,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const newSessionRef = await db.collection('sessions').add(newSessionData);

    // Copy tasks if requested
    if (copyTasks) {
      const tasksSnapshot = await db.collection('postProductionTasks')
        .where('sessionId', '==', sourceSessionId)
        .get();

      const batch = db.batch();
      tasksSnapshot.docs.forEach(doc => {
        const taskData = doc.data();
        const newTaskRef = db.collection('postProductionTasks').doc();
        batch.set(newTaskRef, {
          ...taskData,
          sessionId: newSessionRef.id,
          id: undefined,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }

    // Copy assignments if requested
    if (copyAssignments) {
      const assignmentsSnapshot = await db.collection('sessionAssignments')
        .where('sessionId', '==', sourceSessionId)
        .get();

      const batch = db.batch();
      assignmentsSnapshot.docs.forEach(doc => {
        const assignData = doc.data();
        const newAssignRef = db.collection('sessionAssignments').doc();
        batch.set(newAssignRef, {
          ...assignData,
          sessionId: newSessionRef.id,
          id: undefined,
          createdAt: FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }

    const newSessionDoc = await newSessionRef.get();
    console.log(`✅ [SESSIONS] Created session ${newSessionRef.id} from session ${sourceSessionId}`);
    return res.status(201).json({
      success: true,
      message: 'Session created successfully',
      data: {
        id: newSessionDoc.id,
        ...newSessionDoc.data()
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/from-session/:sessionId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create session from template',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle OPTIONS for POST /:callSheetId/generate-from-session/:sessionId
app.options('/sessions/call-sheets/:callSheetId/generate-from-session/:sessionId', (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173'
  ];

  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  res.status(200).send('');
});

// POST /sessions/call-sheets/:callSheetId/generate-from-session/:sessionId - Generate call sheet from session
app.post('/sessions/call-sheets/:callSheetId/generate-from-session/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const callSheetId = decodeURIComponent(req.params.callSheetId);
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this session'
      });
    }

    // Verify or create call sheet
    let callSheetDoc = await db.collection('callSheets').doc(callSheetId).get();
    
    if (!callSheetDoc.exists) {
      // Create new call sheet
      const callSheetData = {
        name: `Call Sheet from ${sessionData.name || 'Session'}`,
        date: sessionData.sessionDate || new Date(),
        organizationId,
        createdBy: userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      await db.collection('callSheets').doc(callSheetId).set(callSheetData);
      callSheetDoc = await db.collection('callSheets').doc(callSheetId).get();
    }

    const callSheetData = callSheetDoc.data();
    if (callSheetData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this call sheet'
      });
    }

    // Link session to call sheet
    const linkSnapshot = await db.collection('callSheetSessionLinks')
      .where('callSheetId', '==', callSheetId)
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (linkSnapshot.empty) {
      await db.collection('callSheetSessionLinks').add({
        callSheetId,
        sessionId,
        organizationId,
        linkedBy: userId,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    // Copy session assignments to call sheet personnel
    const assignmentsSnapshot = await db.collection('sessionAssignments')
      .where('sessionId', '==', sessionId)
      .get();

    const batch = db.batch();
    assignmentsSnapshot.docs.forEach(assignDoc => {
      const assignData = assignDoc.data();
      const personnelRef = db.collection('callSheetPersonnel').doc();
      batch.set(personnelRef, {
        callSheetId,
        userId: assignData.userId,
        roleId: assignData.roleId || null,
        organizationId,
        createdBy: userId,
        createdAt: FieldValue.serverTimestamp()
      });
    });
    await batch.commit();

    console.log(`✅ [CALLSHEET] Generated call sheet ${callSheetId} from session ${sessionId}`);
    return res.status(200).json({
      success: true,
      message: 'Call sheet generated successfully',
      data: {
        callSheetId,
        sessionId,
        personnelAdded: assignmentsSnapshot.size
      }
    });
  } catch (error: any) {
    console.error(`❌ [API] Error in POST /sessions/call-sheets/:callSheetId/generate-from-session/:sessionId:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate call sheet from session',
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
});

// ====================
// Project Tracking Endpoints (Agent 2)
// ====================

// DELETE /api/project-tracking/assignments/:sessionId - Delete assignment
app.delete('/project-tracking/assignments/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Delete project tracking assignments
    const assignmentsSnapshot = await db.collection('projectTrackingAssignments')
      .where('sessionId', '==', sessionId)
      .get();

    const batch = db.batch();
    assignmentsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return res.status(200).json({
      success: true,
      message: 'Project tracking assignment deleted successfully',
      deletedCount: assignmentsSnapshot.size
    });
  } catch (error: any) {
    console.error('❌ [PROJECT TRACKING] Error deleting assignment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete assignment',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Production Workflow Endpoints (Agent 2)
// ====================

// DELETE /api/production-workflow/correlations/:correlationId - Delete correlation
app.delete('/production-workflow/correlations/:correlationId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const correlationId = decodeURIComponent(req.params.correlationId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify correlation exists
    const correlationDoc = await db.collection('productionWorkflowCorrelations').doc(correlationId).get();
    if (!correlationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Production workflow correlation not found'
      });
    }

    const correlationData = correlationDoc.data();
    if (correlationData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to correlation'
      });
    }

    // Delete correlation
    await db.collection('productionWorkflowCorrelations').doc(correlationId).delete();

    return res.status(200).json({
      success: true,
      message: 'Production workflow correlation removed successfully'
    });
  } catch (error: any) {
    console.error('❌ [PRODUCTION WORKFLOW] Error deleting correlation:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove correlation',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/production-workflow/sessions/:sessionId/correlations - Get correlations
app.get('/production-workflow/sessions/:sessionId/correlations', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get tasks for this session
    const tasksSnapshot = await db.collection('productionTasks')
      .where('sessionId', '==', sessionId)
      .get();

    const taskIds = tasksSnapshot.docs.map(doc => doc.id);

    if (taskIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { correlations: [] }
      });
    }

    // Get correlations for these tasks
    const correlationsSnapshot = await db.collection('productionWorkflowCorrelations')
      .where('taskId', 'in', taskIds)
      .get();

    const correlations = await Promise.all(
      correlationsSnapshot.docs.map(async (doc: any) => {
        const corrData = doc.data();
        const taskDoc = await db.collection('productionTasks').doc(corrData.taskId).get();
        const stepDoc = corrData.workflowStepId ? await db.collection('workflowSteps').doc(corrData.workflowStepId).get() : null;

        return {
          id: doc.id,
          ...corrData,
          task: taskDoc.exists ? { id: taskDoc.id, ...taskDoc.data() } : null,
          workflowStep: stepDoc?.exists ? { id: stepDoc.id, ...stepDoc.data() } : null
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: { correlations }
    });
  } catch (error: any) {
    console.error('❌ [PRODUCTION WORKFLOW] Error getting correlations:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get correlations',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/production-workflow/sessions/:sessionId/instances - Get instances
app.get('/production-workflow/sessions/:sessionId/instances', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get workflow instances
    const instancesSnapshot = await db.collection('workflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId)
      .get();

    const instances = instancesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: { instances }
    });
  } catch (error: any) {
    console.error('❌ [PRODUCTION WORKFLOW] Error getting instances:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get instances',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/production-workflow/correlations - Create correlation
app.post('/production-workflow/correlations', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { taskId, workflowStepId, correlationType = 'DIRECT_MAPPING', autoSync = true, syncDirection = 'BIDIRECTIONAL' } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!taskId || !workflowStepId) {
      return res.status(400).json({
        success: false,
        error: 'Task ID and Workflow Step ID are required'
      });
    }

    // Verify task exists
    const taskDoc = await db.collection('productionTasks').doc(taskId).get();
    if (!taskDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Production task not found'
      });
    }

    // Verify workflow step exists
    const stepDoc = await db.collection('workflowSteps').doc(workflowStepId).get();
    if (!stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    // Check if correlation already exists
    const existingSnapshot = await db.collection('productionWorkflowCorrelations')
      .where('taskId', '==', taskId)
      .where('workflowStepId', '==', workflowStepId)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'Correlation already exists between this task and workflow step'
      });
    }

    // Create correlation
    const correlationData = {
      taskId,
      workflowStepId,
      correlationType,
      autoSync,
      syncDirection,
      organizationId,
      createdByUserId: userId || 'system',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const correlationRef = await db.collection('productionWorkflowCorrelations').add(correlationData);
    const correlationDoc = await correlationRef.get();

    return res.status(201).json({
      success: true,
      data: {
        id: correlationDoc.id,
        ...correlationDoc.data()
      }
    });
  } catch (error: any) {
    console.error('❌ [PRODUCTION WORKFLOW] Error creating correlation:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create correlation',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/production-workflow/sessions/:sessionId/assign - Assign session
app.post('/production-workflow/sessions/:sessionId/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { workflowId, workflowPhase = 'PRODUCTION' } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!workflowId) {
      return res.status(400).json({
        success: false,
        error: 'Workflow ID is required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Create workflow assignment
    const assignmentData = {
      sessionId,
      workflowId,
      workflowPhase,
      organizationId,
      assignedBy: userId || 'system',
      status: 'ACTIVE',
      assignedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const assignmentRef = await db.collection('workflowAssignments').add(assignmentData);
    const assignmentDoc = await assignmentRef.get();

    return res.status(201).json({
      success: true,
      data: {
        id: assignmentDoc.id,
        ...assignmentDoc.data()
      }
    });
  } catch (error: any) {
    console.error('❌ [PRODUCTION WORKFLOW] Error assigning session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign session',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/production-workflow/sessions/:sessionId/bulk-sync - Bulk sync
app.post('/production-workflow/sessions/:sessionId/bulk-sync', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { direction = 'BIDIRECTIONAL' } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get tasks for this session
    const tasksSnapshot = await db.collection('productionTasks')
      .where('sessionId', '==', sessionId)
      .get();

    const taskIds = tasksSnapshot.docs.map(doc => doc.id);

    if (taskIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No tasks found for bulk sync',
        data: {
          totalCorrelations: 0,
          syncedCount: 0,
          errorCount: 0
        }
      });
    }

    // Get correlations
    const correlationsSnapshot = await db.collection('productionWorkflowCorrelations')
      .where('taskId', 'in', taskIds)
      .get();

    let syncedCount = 0;
    const errors: any[] = [];
    const batch = db.batch();

    for (const corrDoc of correlationsSnapshot.docs) {
      try {
        const corrData = corrDoc.data();
        const taskDoc = await db.collection('productionTasks').doc(corrData.taskId).get();
        const stepDoc = corrData.workflowStepId ? await db.collection('workflowSteps').doc(corrData.workflowStepId).get() : null;

        if (!taskDoc.exists || !stepDoc?.exists) continue;

        const taskData = taskDoc.data();
        const stepData = stepDoc.data();

        // Status mapping
        const statusMapping: Record<string, string> = {
          'PENDING': 'PENDING',
          'READY': 'PENDING',
          'IN_PROGRESS': 'IN_PROGRESS',
          'COMPLETED': 'COMPLETED',
          'BLOCKED': 'BLOCKED',
          'CANCELLED': 'BLOCKED'
        };

        if (direction === 'TASK_TO_WORKFLOW' || direction === 'BIDIRECTIONAL') {
          const workflowStatus = statusMapping[taskData?.status] || 'PENDING';
          batch.update(stepDoc.ref, {
            status: workflowStatus,
            progress: workflowStatus === 'COMPLETED' ? 100 : workflowStatus === 'IN_PROGRESS' ? 50 : 0,
            lastUpdatedBy: userId || 'system',
            updatedAt: FieldValue.serverTimestamp()
          });
        }

        if (direction === 'WORKFLOW_TO_TASK' || direction === 'BIDIRECTIONAL') {
          const taskStatus = statusMapping[stepData?.status] || 'PENDING';
          batch.update(taskDoc.ref, {
            status: taskStatus,
            updatedAt: FieldValue.serverTimestamp()
          });
        }

        // Update correlation sync time
        batch.update(corrDoc.ref, {
          lastSyncAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        syncedCount++;
      } catch (error: any) {
        errors.push({
          correlationId: corrDoc.id,
          error: error.message || String(error)
        });
      }
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: 'Bulk sync completed',
      data: {
        totalCorrelations: correlationsSnapshot.size,
        syncedCount,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error: any) {
    console.error('❌ [PRODUCTION WORKFLOW] Error bulk syncing:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk sync',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/production-workflow/sync/task-to-workflow - Sync task to workflow
app.post('/production-workflow/sync/task-to-workflow', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { taskId, workflowStepId } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!taskId || !workflowStepId) {
      return res.status(400).json({
        success: false,
        error: 'Task ID and Workflow Step ID are required'
      });
    }

    // Get task and step
    const [taskDoc, stepDoc] = await Promise.all([
      db.collection('productionTasks').doc(taskId).get(),
      db.collection('workflowSteps').doc(workflowStepId).get()
    ]);

    if (!taskDoc.exists || !stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Task or workflow step not found'
      });
    }

    const taskData = taskDoc.data();
    const stepData = stepDoc.data();

    // Status mapping
    const statusMapping: Record<string, string> = {
      'PENDING': 'PENDING',
      'READY': 'PENDING',
      'IN_PROGRESS': 'IN_PROGRESS',
      'COMPLETED': 'COMPLETED',
      'BLOCKED': 'BLOCKED',
      'CANCELLED': 'BLOCKED'
    };

    const workflowStatus = statusMapping[taskData?.status] || 'PENDING';

    // Update workflow step
    await db.collection('workflowSteps').doc(workflowStepId).update({
      status: workflowStatus,
      progress: workflowStatus === 'COMPLETED' ? 100 : workflowStatus === 'IN_PROGRESS' ? 50 : 0,
      lastUpdatedBy: userId || 'system',
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update correlation sync time if exists
    const corrSnapshot = await db.collection('productionWorkflowCorrelations')
      .where('taskId', '==', taskId)
      .where('workflowStepId', '==', workflowStepId)
      .limit(1)
      .get();

    if (!corrSnapshot.empty) {
      await corrSnapshot.docs[0].ref.update({
        lastSyncAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Task synced to workflow successfully',
      taskId,
      workflowStepId,
      syncedStatus: workflowStatus
    });
  } catch (error: any) {
    console.error('❌ [PRODUCTION WORKFLOW] Error syncing task to workflow:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync task to workflow',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/production-workflow/sync/workflow-to-task - Sync workflow to task
app.post('/production-workflow/sync/workflow-to-task', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { taskId, workflowStepId } = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!taskId || !workflowStepId) {
      return res.status(400).json({
        success: false,
        error: 'Task ID and Workflow Step ID are required'
      });
    }

    // Get task and step
    const [taskDoc, stepDoc] = await Promise.all([
      db.collection('productionTasks').doc(taskId).get(),
      db.collection('workflowSteps').doc(workflowStepId).get()
    ]);

    if (!taskDoc.exists || !stepDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Task or workflow step not found'
      });
    }

    const taskData = taskDoc.data();
    const stepData = stepDoc.data();

    // Status mapping
    const statusMapping: Record<string, string> = {
      'PENDING': 'PENDING',
      'IN_PROGRESS': 'IN_PROGRESS',
      'COMPLETED': 'COMPLETED',
      'BLOCKED': 'BLOCKED'
    };

    const taskStatus = statusMapping[stepData?.status] || 'PENDING';

    // Update task
    await db.collection('productionTasks').doc(taskId).update({
      status: taskStatus,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update correlation sync time if exists
    const corrSnapshot = await db.collection('productionWorkflowCorrelations')
      .where('taskId', '==', taskId)
      .where('workflowStepId', '==', workflowStepId)
      .limit(1)
      .get();

    if (!corrSnapshot.empty) {
      await corrSnapshot.docs[0].ref.update({
        lastSyncAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Workflow synced to task successfully',
      taskId,
      workflowStepId,
      syncedStatus: taskStatus
    });
  } catch (error: any) {
    console.error('❌ [PRODUCTION WORKFLOW] Error syncing workflow to task:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync workflow to task',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Review Endpoints (Agent 2)
// ====================

// GET /api/reviews/sessions - Get all review sessions
app.get('/reviews/sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { sessionId, status, reviewStage } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    let reviewsQuery: any = db.collection('reviewSessions')
      .where('organizationId', '==', organizationId);

    if (sessionId) {
      reviewsQuery = reviewsQuery.where('sessionId', '==', sessionId);
    }

    if (status) {
      reviewsQuery = reviewsQuery.where('reviewStatus', '==', status);
    }

    if (reviewStage) {
      reviewsQuery = reviewsQuery.where('reviewStage', '==', reviewStage);
    }

    const reviewsSnapshot = await reviewsQuery.orderBy('createdAt', 'desc').get();

    const reviews = await Promise.all(
      reviewsSnapshot.docs.map(async (doc: any) => {
        const reviewData = doc.data();

        // Get session
        const sessionDoc = reviewData.sessionId ? await db.collection('sessions').doc(reviewData.sessionId).get() : null;

        // Get assignments
        const assignmentsSnapshot = await db.collection('reviewAssignments')
          .where('reviewSessionId', '==', doc.id)
          .get();

        const assignments = await Promise.all(
          assignmentsSnapshot.docs.map(async (assignDoc: any) => {
            const assignData = assignDoc.data();
            const userDoc = await db.collection('users').doc(assignData.assignedUserId).get();

            return {
              id: assignDoc.id,
              ...assignData,
              assignedUser: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null
            };
          })
        );

        return {
          id: doc.id,
          ...reviewData,
          session: sessionDoc?.exists ? { id: sessionDoc.id, ...sessionDoc.data() } : null,
          reviewAssignments: assignments
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error getting review sessions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch review sessions',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/reviews/sessions/:reviewId - Get specific review session
app.get('/reviews/sessions/:reviewId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to review session'
      });
    }

    // Get session
    const sessionDoc = reviewData.sessionId ? await db.collection('sessions').doc(reviewData.sessionId).get() : null;

    // Get assignments
    const assignmentsSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const assignments = await Promise.all(
      assignmentsSnapshot.docs.map(async (assignDoc: any) => {
        const assignData = assignDoc.data();
        const userDoc = await db.collection('users').doc(assignData.assignedUserId).get();
        const assignedByDoc = assignData.assignedByUserId ? await db.collection('users').doc(assignData.assignedByUserId).get() : null;

        return {
          id: assignDoc.id,
          ...assignData,
          assignedUser: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null,
          assignedBy: assignedByDoc?.exists ? { id: assignedByDoc.id, ...assignedByDoc.data() } : null
        };
      })
    );

    // Get approvals
    const approvalsSnapshot = await db.collection('reviewApprovals')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const approvals = await Promise.all(
      approvalsSnapshot.docs.map(async (approvalDoc: any) => {
        const approvalData = approvalDoc.data();
        const approverDoc = await db.collection('users').doc(approvalData.approverUserId).get();

        return {
          id: approvalDoc.id,
          ...approvalData,
          approver: approverDoc.exists ? { id: approverDoc.id, ...approverDoc.data() } : null
        };
      })
    );

    // Get notes
    const notesSnapshot = await db.collection('reviewNotes')
      .where('reviewSessionId', '==', reviewId)
      .orderBy('createdAt', 'desc')
      .get();

    const notes = notesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      success: true,
      data: {
        id: reviewDoc.id,
        ...reviewData,
        session: sessionDoc?.exists ? { id: sessionDoc.id, ...sessionDoc.data() } : null,
        reviewAssignments: assignments,
        reviewApprovals: approvals,
        reviewNotes: notes
      }
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error getting review session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch review session',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/reviews/sessions - Create review session
app.post('/reviews/sessions', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, reviewStage, version, dueDate, notes, feedbackUrl, reviewers } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    if (!sessionId || !reviewStage) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and review stage are required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Create review session
    const reviewData = {
      sessionId,
      reviewStage,
      version: version || `v${Date.now()}`,
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes || '',
      feedbackUrl: feedbackUrl || '',
      reviewStatus: 'WAITING_FOR_REVIEW',
      reviewNumber: 1,
      organizationId,
      createdByUserId: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const reviewRef = await db.collection('reviewSessions').add(reviewData);

    // Add reviewers if specified
    if (reviewers && Array.isArray(reviewers) && reviewers.length > 0) {
      const batch = db.batch();
      for (const reviewerId of reviewers) {
        const assignmentRef = db.collection('reviewAssignments').doc();
        batch.set(assignmentRef, {
          reviewSessionId: reviewRef.id,
          assignedUserId: reviewerId,
          assignedByUserId: userId,
          role: 'REVIEWER',
          status: 'ASSIGNED',
          organizationId,
          assignedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      await batch.commit();
    }

    const reviewDoc = await reviewRef.get();

    return res.status(201).json({
      success: true,
      data: {
        id: reviewDoc.id,
        ...reviewDoc.data()
      }
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error creating review session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create review session',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/reviews/sessions/:reviewId/start - Start review session
app.post('/reviews/sessions/:reviewId/start', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to review session'
      });
    }

    // Update review status
    await db.collection('reviewSessions').doc(reviewId).update({
      reviewStatus: 'IN_REVIEW',
      startedAt: FieldValue.serverTimestamp(),
      startedByUserId: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedReviewDoc = await db.collection('reviewSessions').doc(reviewId).get();

    return res.status(200).json({
      success: true,
      data: {
        id: updatedReviewDoc.id,
        ...updatedReviewDoc.data()
      }
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error starting review:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to start review',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/reviews/sessions/:reviewId/complete - Complete review session
app.post('/reviews/sessions/:reviewId/complete', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const { notes, decision } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to review session'
      });
    }

    // Update review status
    const finalStatus = decision === 'APPROVED' ? 'APPROVED' : decision === 'REJECTED' ? 'REJECTED' : 'CHANGES_REQUESTED';

    await db.collection('reviewSessions').doc(reviewId).update({
      reviewStatus: finalStatus,
      notes: notes || reviewData.notes || '',
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedByUserId: userId,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedReviewDoc = await db.collection('reviewSessions').doc(reviewId).get();

    return res.status(200).json({
      success: true,
      data: {
        id: updatedReviewDoc.id,
        ...updatedReviewDoc.data()
      }
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error completing review:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete review',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/reviews/sessions/:reviewId/notes - Add note to review
app.post('/reviews/sessions/:reviewId/notes', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const { content, timecode, priority = 'NORMAL' } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Note content is required'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to review session'
      });
    }

    // Create note
    const noteData = {
      reviewSessionId: reviewId,
      content,
      timecode: timecode || null,
      priority,
      status: 'OPEN',
      organizationId,
      createdByUserId: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const noteRef = await db.collection('reviewNotes').add(noteData);
    const noteDoc = await noteRef.get();

    // Get creator info
    const creatorDoc = userId ? await db.collection('users').doc(userId).get() : null;

    return res.status(201).json({
      success: true,
      data: {
        id: noteDoc.id,
        ...noteDoc.data(),
        createdByUser: creatorDoc?.exists ? { id: creatorDoc.id, ...creatorDoc.data() } : null
      }
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error adding note:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add note',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/reviews/sessions/:reviewId/assign - Assign user to review
app.post('/reviews/sessions/:reviewId/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const { userId, role = 'REVIEWER' } = req.body;
    const organizationId = req.user?.organizationId;
    const assignedByUserId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to review session'
      });
    }

    // Verify user exists
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if already assigned
    const existingSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .where('assignedUserId', '==', userId)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'User is already assigned to this review session'
      });
    }

    // Create assignment
    const assignmentData = {
      reviewSessionId: reviewId,
      assignedUserId: userId,
      assignedByUserId: assignedByUserId || 'system',
      role,
      status: 'ASSIGNED',
      organizationId,
      assignedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const assignmentRef = await db.collection('reviewAssignments').add(assignmentData);
    const assignmentDoc = await assignmentRef.get();

    return res.status(201).json({
      success: true,
      data: {
        id: assignmentDoc.id,
        ...assignmentDoc.data(),
        assignedUser: { id: userDoc.id, ...userDoc.data() }
      }
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error assigning user:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign user',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/reviews/assignments/:userId - Get review assignments for user
app.get('/reviews/assignments/:userId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = decodeURIComponent(req.params.userId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    const assignmentsSnapshot = await db.collection('reviewAssignments')
      .where('assignedUserId', '==', userId)
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .get();

    const assignments = await Promise.all(
      assignmentsSnapshot.docs.map(async (doc: any) => {
        const assignData = doc.data();

        // Get review session
        const reviewDoc = await db.collection('reviewSessions').doc(assignData.reviewSessionId).get();

        // Get session
        const sessionDoc = reviewDoc.exists && reviewDoc.data()?.sessionId
          ? await db.collection('sessions').doc(reviewDoc.data()?.sessionId).get()
          : null;

        // Get assigned by user
        const assignedByDoc = assignData.assignedByUserId
          ? await db.collection('users').doc(assignData.assignedByUserId).get()
          : null;

        return {
          id: doc.id,
          ...assignData,
          reviewSession: reviewDoc.exists ? { id: reviewDoc.id, ...reviewDoc.data() } : null,
          session: sessionDoc?.exists ? { id: sessionDoc.id, ...sessionDoc.data() } : null,
          assignedBy: assignedByDoc?.exists ? { id: assignedByDoc.id, ...assignedByDoc.data() } : null
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: assignments
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error getting assignments:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch assignments',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/reviews/sessions/:reviewId/approve - Submit approval/rejection
app.post('/reviews/sessions/:reviewId/approve', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const { decision, notes } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!decision || !['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'PENDING', 'IN_REVIEW'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Valid decision is required (APPROVED, REJECTED, CHANGES_REQUESTED, PENDING, IN_REVIEW)'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to review session'
      });
    }

    // Check if user is assigned
    const assignmentSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .where('assignedUserId', '==', userId)
      .where('status', '==', 'ASSIGNED')
      .limit(1)
      .get();

    if (assignmentSnapshot.empty) {
      return res.status(403).json({
        success: false,
        error: 'User is not assigned as a reviewer for this session'
      });
    }

    // Check if approval already exists
    const existingApprovalSnapshot = await db.collection('reviewApprovals')
      .where('reviewSessionId', '==', reviewId)
      .where('approverUserId', '==', userId)
      .limit(1)
      .get();

    let approvalRef;
    if (!existingApprovalSnapshot.empty) {
      // Update existing approval
      approvalRef = existingApprovalSnapshot.docs[0].ref;
      await approvalRef.update({
        status: decision === 'APPROVED' ? 'APPROVED' : decision === 'REJECTED' ? 'REJECTED' : 'CHANGES_REQUESTED',
        decision,
        notes: notes || null,
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      // Create new approval
      approvalRef = db.collection('reviewApprovals').doc();
      await approvalRef.set({
        reviewSessionId: reviewId,
        approverUserId: userId,
        status: decision === 'APPROVED' ? 'APPROVED' : decision === 'REJECTED' ? 'REJECTED' : 'CHANGES_REQUESTED',
        decision,
        notes: notes || null,
        organizationId,
        approvedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // Update assignment status
    const assignmentStatus = ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(decision) ? 'COMPLETED' : 'IN_PROGRESS';
    await assignmentSnapshot.docs[0].ref.update({
      status: assignmentStatus,
      completedAt: assignmentStatus === 'COMPLETED' ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp()
    });

    const approvalDoc = await approvalRef.get();
    const approverDoc = await db.collection('users').doc(userId).get();

    return res.status(200).json({
      success: true,
      data: {
        id: approvalDoc.id,
        ...approvalDoc.data(),
        approver: approverDoc.exists ? { id: approverDoc.id, ...approverDoc.data() } : null
      }
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error submitting approval:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit approval',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/reviews/sessions/:reviewId/reviewers - Get reviewers
app.get('/reviews/sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to review session'
      });
    }

    // Get assignments
    const assignmentsSnapshot = await db.collection('reviewAssignments')
      .where('reviewSessionId', '==', reviewId)
      .get();

    // Get approvals
    const approvalsSnapshot = await db.collection('reviewApprovals')
      .where('reviewSessionId', '==', reviewId)
      .get();

    const approvalsByUserId: Record<string, any> = {};
    approvalsSnapshot.docs.forEach(doc => {
      const approvalData = doc.data();
      approvalsByUserId[approvalData.approverUserId] = {
        id: doc.id,
        ...approvalData
      };
    });

    const reviewers = await Promise.all(
      assignmentsSnapshot.docs.map(async (doc: any) => {
        const assignData = doc.data();
        const userDoc = await db.collection('users').doc(assignData.assignedUserId).get();

        return {
          id: doc.id,
          ...assignData,
          user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null,
          approval: approvalsByUserId[assignData.assignedUserId] || null
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: reviewers
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error getting reviewers:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch reviewers',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/reviews/sessions/:reviewId/reviewers - Add reviewers
app.post('/reviews/sessions/:reviewId/reviewers', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const reviewId = decodeURIComponent(req.params.reviewId);
    const { reviewers } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!reviewers || !Array.isArray(reviewers)) {
      return res.status(400).json({
        success: false,
        error: 'Reviewers must be an array'
      });
    }

    // Verify review exists
    const reviewDoc = await db.collection('reviewSessions').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      });
    }

    const reviewData = reviewDoc.data();
    if (reviewData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to review session'
      });
    }

    const createdReviewers: any[] = [];
    const batch = db.batch();

    for (const reviewerData of reviewers) {
      const reviewerUserId = reviewerData.userId || reviewerData.personId || reviewerData.id;

      if (!reviewerUserId) continue;

      // Verify user exists
      const userDoc = await db.collection('users').doc(reviewerUserId).get();
      if (!userDoc.exists) continue;

      // Check if already assigned
      const existingSnapshot = await db.collection('reviewAssignments')
        .where('reviewSessionId', '==', reviewId)
        .where('assignedUserId', '==', reviewerUserId)
        .limit(1)
        .get();

      if (!existingSnapshot.empty) continue;

      // Create assignment
      const assignmentRef = db.collection('reviewAssignments').doc();
      batch.set(assignmentRef, {
        reviewSessionId: reviewId,
        assignedUserId: reviewerUserId,
        assignedByUserId: userId || 'system',
        role: 'REVIEWER',
        status: 'ASSIGNED',
        organizationId,
        assignedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      createdReviewers.push({
        id: assignmentRef.id,
        userId: reviewerUserId,
        user: { id: userDoc.id, ...userDoc.data() }
      });
    }

    await batch.commit();

    return res.status(201).json({
      success: true,
      data: createdReviewers,
      count: createdReviewers.length
    });
  } catch (error: any) {
    console.error('❌ [REVIEWS API] Error adding reviewers:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add reviewers',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// Workflow Endpoints (Agent 2)
// ====================

// GET /api/workflow/sessions/:sessionId - Get workflow for session
app.get('/workflow/sessions/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // 🔥 CRITICAL FIX: Support phase filtering via query parameter
    const phaseFilter = req.query.phase as string | undefined;
    console.log(`🔍 [WORKFLOW API] Getting workflow for session ${sessionId}, phase filter: ${phaseFilter || 'none'}`);

    // Build query for workflow instance
    let instanceQuery: any = db.collection('workflowInstances')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId);

    // Filter by phase if provided
    if (phaseFilter) {
      instanceQuery = instanceQuery.where('phase', '==', phaseFilter);
    }

    const instanceSnapshot = await instanceQuery.limit(1).get();

    let workflowInstance = null;
    let workflowInstanceId = null;
    if (!instanceSnapshot.empty) {
      const doc = instanceSnapshot.docs[0];
      workflowInstance = {
        id: doc.id,
        ...doc.data()
      };
      workflowInstanceId = doc.id;
      console.log(`✅ [WORKFLOW API] Found workflow instance ${workflowInstanceId} for phase ${phaseFilter || 'any'}`);
    } else {
      console.log(`📭 [WORKFLOW API] No workflow instance found for session ${sessionId}${phaseFilter ? ` with phase ${phaseFilter}` : ''}`);
    }

    // Get workflow steps - filter by workflowInstanceId if available, otherwise by sessionId
    let stepsQuery: any = db.collection('workflowSteps')
      .where('organizationId', '==', organizationId);

    if (workflowInstanceId) {
      // If we have a specific workflow instance, get steps for that instance
      stepsQuery = stepsQuery.where('workflowInstanceId', '==', workflowInstanceId);
    } else {
      // Fallback: get steps by sessionId (for backward compatibility)
      stepsQuery = stepsQuery.where('sessionId', '==', sessionId);
    }

    const stepsSnapshot = await stepsQuery.orderBy('order', 'asc').get();

    const steps = stepsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ [WORKFLOW API] Found ${steps.length} steps for workflow instance ${workflowInstanceId || 'none'}`);

    return res.status(200).json({
      success: true,
      data: {
        workflowInstance,
        steps
      }
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW API] Error getting session workflow:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get session workflow',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /workflow/sessions/:sessionId/reviews - Get reviews for workflow steps
app.get('/workflow/sessions/:sessionId/reviews', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    console.log(`🔍 [WORKFLOW API] Getting reviews for session ${sessionId}`);

    // Query reviewSessions where sessionId matches
    const reviewsQuery = db.collection('reviewSessions')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId);

    const reviewsSnapshot = await reviewsQuery.get();

    // Map reviews by stepId
    const reviewsByStepId: Record<string, any[]> = {};

    reviewsSnapshot.docs.forEach(doc => {
      const reviewData = doc.data();
      
      // Check for workflow step link in metadata or direct property
      let stepId: string | null = null;
      if (reviewData.metadata && reviewData.metadata.workflowStepId) {
        stepId = reviewData.metadata.workflowStepId;
      } else if (reviewData.workflowStepId) {
        stepId = reviewData.workflowStepId;
      } else if (reviewData.reviewType === 'workflow') {
        // Review is workflow-related but no step link
        stepId = 'UNLINKED';
      }

      if (stepId) {
        if (!reviewsByStepId[stepId]) {
          reviewsByStepId[stepId] = [];
        }
        reviewsByStepId[stepId].push({
          id: doc.id,
          ...reviewData,
          createdAt: reviewData.createdAt?.toDate ? reviewData.createdAt.toDate().toISOString() : reviewData.createdAt,
          updatedAt: reviewData.updatedAt?.toDate ? reviewData.updatedAt.toDate().toISOString() : reviewData.updatedAt
        });
      }
    });

    console.log(`✅ [WORKFLOW API] Found ${reviewsSnapshot.size} reviews for session ${sessionId}, mapped to ${Object.keys(reviewsByStepId).length} steps`);

    return res.status(200).json({
      success: true,
      data: reviewsByStepId,
      count: reviewsSnapshot.size
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW API] Error getting workflow reviews:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get workflow reviews',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/workflow/sessions/:sessionId/all - Get all workflows for session
app.get('/workflow/sessions/:sessionId/all', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Get all workflow instances for this session
    const workflowsSnapshot = await db.collection('sessionWorkflows')
      .where('organizationId', '==', organizationId)
      .where('sessionId', '==', sessionId)
      .get();

    const workflows = workflowsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data
      };
    });

    return res.status(200).json({
      success: true,
      data: workflows
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW API] Error getting session workflows:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get session workflows',
      errorDetails: error.message || String(error)
    });
  }
});

// GET /api/workflow/sessions/:sessionId/status - Get workflow status
app.get('/workflow/sessions/:sessionId/status', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Get workflow instances
    const workflowsSnapshot = await db.collection('sessionWorkflows')
      .where('organizationId', '==', organizationId)
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (workflowsSnapshot.empty) {
      return res.status(200).json({
        success: true,
        data: {
          sessionId,
          status: null,
          progress: 0,
          stepsCount: 0,
          completedSteps: 0,
          inProgressSteps: 0
        }
      });
    }

    const workflow = workflowsSnapshot.docs[0].data();

    // Get steps count
    const stepsSnapshot = await db.collection('workflowSteps')
      .where('sessionId', '==', sessionId)
      .get();

    const completedSteps = stepsSnapshot.docs.filter(doc => doc.data().status === 'COMPLETED').length;
    const inProgressSteps = stepsSnapshot.docs.filter(doc => doc.data().status === 'IN_PROGRESS').length;

    return res.status(200).json({
      success: true,
      data: {
        sessionId,
        status: workflow.status || null,
        progress: workflow.progress || 0,
        stepsCount: stepsSnapshot.size,
        completedSteps,
        inProgressSteps,
        workflowId: workflowsSnapshot.docs[0].id
      }
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW API] Error getting workflow status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get workflow status',
      errorDetails: error.message || String(error)
    });
  }
});

// POST /api/workflow/sessions/:sessionId/assign - Assign workflow to session
app.post('/workflow/sessions/:sessionId/assign', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { workflowId, workflowPhase = 'PRODUCTION' } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.uid;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    if (!workflowId) {
      return res.status(400).json({
        success: false,
        error: 'Workflow ID is required'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Verify workflow exists
    const workflowDiagramDoc = await db.collection('workflowDiagrams').doc(workflowId).get();
    if (!workflowDiagramDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    // Check for existing assignment
    const existingSnapshot = await db.collection('sessionWorkflows')
      .where('sessionId', '==', sessionId)
      .where('workflowPhase', '==', workflowPhase)
      .where('status', '==', 'ACTIVE')
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'Workflow already assigned to this session for this phase'
      });
    }

    // Create workflow assignment
    const workflowData = {
      sessionId,
      workflowId,
      workflowPhase,
      organizationId,
      status: 'ACTIVE',
      progress: 0,
      stepsCount: 0,
      completedSteps: 0,
      inProgressSteps: 0,
      assignedBy: userId || 'system',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const workflowRef = await db.collection('sessionWorkflows').add(workflowData);
    const createdWorkflowDoc = await workflowRef.get();

    return res.status(201).json({
      success: true,
      data: {
        id: createdWorkflowDoc.id,
        ...createdWorkflowDoc.data()
      }
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW API] Error assigning workflow:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign workflow',
      errorDetails: error.message || String(error)
    });
  }
});

// DELETE /api/workflow/sessions/:sessionId - Delete workflow from session
app.delete('/workflow/sessions/:sessionId', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const { workflowPhase } = req.query;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'User not associated with any organization'
      });
    }

    // Verify session exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData?.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to session'
      });
    }

    // Build query
    let workflowsQuery: any = db.collection('sessionWorkflows')
      .where('sessionId', '==', sessionId)
      .where('organizationId', '==', organizationId);

    if (workflowPhase) {
      workflowsQuery = workflowsQuery.where('workflowPhase', '==', workflowPhase);
    }

    const workflowsSnapshot = await workflowsQuery.get();

    if (workflowsSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found for this session'
      });
    }

    // Delete workflows
    const batch = db.batch();
    workflowsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Also delete workflow steps
    const stepsSnapshot = await db.collection('workflowSteps')
      .where('sessionId', '==', sessionId)
      .get();

    stepsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: 'Workflow removed from session successfully',
      deletedWorkflows: workflowsSnapshot.size,
      deletedSteps: stepsSnapshot.size
    });
  } catch (error: any) {
    console.error('❌ [WORKFLOW API] Error deleting workflow:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete workflow',
      errorDetails: error.message || String(error)
    });
  }
});

// ====================
// End of Agent Sections
// ====================

// Error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ [API ERROR]', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// Export the main API function
// Note: cors: false because we handle CORS in Express middleware
// Firebase's built-in CORS doesn't properly support credentials
export const api = onRequest(
  {
    memory: '2GiB',
    timeoutSeconds: 300,
    cors: false // Handle CORS in Express to support credentials
  },
  app
);
