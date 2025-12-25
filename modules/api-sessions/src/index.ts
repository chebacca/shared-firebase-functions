import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { authenticateToken } from '../../../src/shared/middleware';
import sessionsRouter from './routes/sessions';

// Create Express app for sessions API
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

// Register sessions routes
app.use('/', sessionsRouter);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ [SESSIONS API ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Export the sessions API function
export const apiSessions = onRequest({
  memory: '1GiB',
  timeoutSeconds: 300,
  cpu: 1,
  minInstances: 0,
  invoker: 'public',
  cors: false
}, app);

