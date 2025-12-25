import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { authenticateToken } from '../../../src/shared/middleware';
import productionRouter from './routes/production';

// Create Express app for production API
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

// Register production routes
app.use('/', productionRouter);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ [PRODUCTION API ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Export the production API function
export const apiProduction = onRequest({
  memory: '1GiB',
  timeoutSeconds: 300,
  cpu: 1,
  minInstances: 0,
  invoker: 'public',
  cors: false
}, app);

