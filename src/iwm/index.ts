/**
 * IWM (Inventory Workflow Manager) Firebase Functions
 * 
 * Exports all IWM-specific Firebase Functions including:
 * - Timecard management
 * - Approval workflows
 * - Admin analytics
 * - Google Maps integration
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import express from 'express';
import cors from 'cors';
import { authenticateToken } from '../shared/middleware';
import { createErrorResponse } from '../shared/utils';

// Define secrets
const googleMapsApiKeySecret = defineSecret('GOOGLE_MAPS_API_KEY');

// Import routes
import timecardRouter from './routes/timecard.routes';
import approvalRouter from './routes/approval.routes';
import adminRouter from './routes/admin.routes';
import googleMapsRouter from './routes/google-maps.routes';

// Create Express app
const app = express();

const corsOptions = {
  origin: true, // Reflect request origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'iwm-api'
  });
});

// Register routes
app.use('/timecards', timecardRouter);
app.use('/approval', approvalRouter);
app.use('/admin', adminRouter);
app.use('/google-maps', googleMapsRouter);

// Documentation endpoint
app.get('/docs', (req, res) => {
  res.status(200).json({
    title: 'IWM API',
    version: '1.0.0',
    description: 'Inventory Workflow Manager API',
    endpoints: [
      '/health',
      '/timecards',
      '/approval',
      '/admin',
      '/google-maps'
    ]
  });
});

// Final Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ [IWM API ERROR]', err);
  res.status(err.status || 500).json(createErrorResponse(
    err.message || 'Internal server error',
    err.stack
  ));
});

// Export the IWM API function
export const iwmApi = onRequest({
  memory: '512MiB',
  timeoutSeconds: 60,
  cpu: 1,
  minInstances: 0,
  invoker: 'public',
  cors: false, // Handled by middleware
  secrets: [googleMapsApiKeySecret]
}, app);

// Export individual route handlers for direct access if needed
export { default as timecardRoutes } from './routes/timecard.routes';
export { default as approvalRoutes } from './routes/approval.routes';
export { default as adminRoutes } from './routes/admin.routes';
export { default as googleMapsRoutes } from './routes/google-maps.routes';
