import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { authenticateToken } from './shared/middleware';
import workflowRouter from './routes/workflow';

// Create Express app for workflow API
const app = express();

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Application-Mode', 'X-Client-Type', 'X-Client-Version'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Register workflow routes
app.use('/', workflowRouter);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ [WORKFLOW API ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Export the workflow API function
export const apiWorkflow = onRequest({
  memory: '1GiB',
  timeoutSeconds: 300,
  cpu: 1,
  minInstances: 0,
  invoker: 'public',
  cors: false
}, app);

