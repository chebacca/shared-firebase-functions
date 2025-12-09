/**
 * Main API Router Function
 * 
 * Central Express router for all API endpoints
 */

import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import * as admin from 'firebase-admin';
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

// Get all sessions
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
    
    const { projectId, status, limit = 100 } = req.query;
    
    // Build query
    let sessionsQuery: any = db.collection('sessions').where('organizationId', '==', organizationId);
    
    if (projectId) {
      sessionsQuery = sessionsQuery.where('projectId', '==', projectId);
    }
    
    if (status) {
      sessionsQuery = sessionsQuery.where('status', '==', status);
    }
    
    sessionsQuery = sessionsQuery.limit(parseInt(limit as string) || 100);
    
    const sessionsSnapshot = await sessionsQuery.get();
    const sessions = sessionsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      sessionId: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ [SESSIONS API] Found ${sessions.length} sessions`);
    return res.status(200).json({
      success: true,
      data: sessions,
      total: sessions.length
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

// Get all workflows for a session
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
  if (origin && (corsOptions.origin as any)(origin, () => {})) {
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
  if (origin && (corsOptions.origin as any)(origin, () => {})) {
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
  if (origin && (corsOptions.origin as any)(origin, () => {})) {
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
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch user settings',
      errorDetails: error.message || String(error)
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
