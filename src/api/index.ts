import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import { authenticateToken } from '../shared/middleware';
import { db, createSuccessResponse, createErrorResponse, getUserOrganizationId } from '../shared/utils';

// Import refactored routes
import healthRouter from './routes/health';
import timecardApprovalRouter from './routes/timecardApproval';
import timecardRouter from './routes/timecard';
import infrastructureRouter from './routes/infrastructure';
import contactsRouter from './routes/contacts';
import sessionsRouter from './routes/sessions';
import productionRouter from './routes/production';
import workflowRouter from './routes/workflow';
import networkDeliveryRouter, { uploadNetworkDeliveryBible, getNetworkDeliveryDeliverables } from './routes/networkDelivery';
import serverRouter from './routes/servers';
import authRouter from './routes/auth';
import { googleMapsRoutes, ollamaRoutes } from '../workflow';

// Create Express app
const app = express();

const corsOptions = {
  origin: true, // Reflect request origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Application-Mode', 'X-Client-Type', 'X-Client-Version'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Register refactored routes
app.use('/health', healthRouter);
app.use('/timecard-approval', timecardApprovalRouter);
app.use('/timecard', timecardRouter);
app.use('/infrastructure', infrastructureRouter);
app.use('/contacts', contactsRouter);
app.use('/sessions', sessionsRouter);
app.use('/production', productionRouter);
app.use('/workflow', workflowRouter);
app.use('/network-delivery', networkDeliveryRouter);
app.use('/server', serverRouter);
app.use('/auth', authRouter);
app.use('/google-maps', googleMapsRoutes);
app.use('/ollama', ollamaRoutes);

// Documentation endpoint
app.get('/docs', (req, res) => {
  res.status(200).json({
    title: 'BACKBONE Unified API',
    version: '2.0.0',
    description: 'Refactored Modular API for all BACKBONE projects',
    routers: ['/health', '/auth', '/timecard-approval', '/timecard', '/infrastructure', '/contacts', '/sessions', '/production', '/workflow', '/network-delivery', '/google-maps', '/ollama']
  });
});

// Final Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ [API ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

/**
 * 🚀 Main Unified API Function (Firebase Functions v1)
 * 
 * Using v1 to maintain the stable URL format for existing clients:
 * https://us-central1-backbone-logic.cloudfunctions.net/api
 */
export const api = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '2GB',
    secrets: [
      'INTEGRATIONS_ENCRYPTION_KEY',
      'GOOGLE_MAPS_API_KEY',
      'GEMINI_API_KEY'
    ]
  })
  .https.onRequest(app);

// Export onCall functions (kept as shortcuts)
export { uploadNetworkDeliveryBible, getNetworkDeliveryDeliverables };
