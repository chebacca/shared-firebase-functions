/**
 * Main API Router Function
 * 
 * Central Express router for all API endpoints
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as express from 'express';
import * as cors from 'cors';

// Import all function modules
import * as auth from '../auth';
import * as projects from '../projects';
import * as datasets from '../datasets';
import * as sessions from '../sessions';
import * as licensing from '../licensing';
import * as payments from '../payments';
import * as database from '../database';
import * as system from '../system';
import * as ai from '../ai';
import * as team from '../team';
import * as debug from '../debug';

// Create Express app
const app = express();

// CORS configuration
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: ['auth', 'projects', 'datasets', 'sessions', 'licensing', 'payments', 'database', 'system', 'ai', 'team', 'debug']
  });
});

// API documentation endpoint
app.get('/docs', (req, res) => {
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
app.use('/auth', auth);
app.use('/projects', projects);
app.use('/datasets', datasets);
app.use('/sessions', sessions);
app.use('/licensing', licensing);
app.use('/payments', payments);
app.use('/database', database);
app.use('/system', system);
app.use('/ai', ai);
app.use('/team', team);
app.use('/debug', debug);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: ['/health', '/docs', '/auth', '/projects', '/datasets', '/sessions', '/licensing', '/payments', '/database', '/system', '/ai', '/team', '/debug']
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
export const api = onRequest(
  {
    memory: '2GiB',
    timeoutSeconds: 300,
    cors: true
  },
  app
);
