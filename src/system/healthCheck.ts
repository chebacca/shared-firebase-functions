/**
 * Health Check Function
 * 
 * Provides system health status and diagnostics
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, handleError } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

export const healthCheck: any = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 30,
    cors: true
  },
  async (req: any, res: any) => {
    try {
      const startTime = Date.now();
      
      console.log('🏥 [HEALTH CHECK] Starting system health check...');

      // Check Firestore connectivity
      let firestoreStatus = 'healthy';
      let firestoreLatency = 0;
      try {
        const firestoreStart = Date.now();
        await db.collection('_health').limit(1).get();
        firestoreLatency = Date.now() - firestoreStart;
      } catch (error) {
        firestoreStatus = 'unhealthy';
        console.error('❌ [HEALTH CHECK] Firestore check failed:', error);
      }

      // Check Auth connectivity
      let authStatus = 'healthy';
      let authLatency = 0;
      try {
        const authStart = Date.now();
        await auth.listUsers(1);
        authLatency = Date.now() - authStart;
      } catch (error) {
        authStatus = 'unhealthy';
        console.error('❌ [HEALTH CHECK] Auth check failed:', error);
      }

      const totalLatency = Date.now() - startTime;
      const overallStatus = (firestoreStatus === 'healthy' && authStatus === 'healthy') ? 'healthy' : 'unhealthy';

      const healthData = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        services: {
          firestore: {
            status: firestoreStatus,
            latency: firestoreLatency
          },
          auth: {
            status: authStatus,
            latency: authLatency
          }
        },
        performance: {
          totalLatency,
          memory: process.memoryUsage(),
          platform: process.platform,
          nodeVersion: process.version
        }
      };

      console.log(`🏥 [HEALTH CHECK] System status: ${overallStatus} (${totalLatency}ms)`);

      const statusCode = overallStatus === 'healthy' ? 200 : 503;
      res.status(statusCode).json(createSuccessResponse(healthData, 'Health check completed'));

    } catch (error: any) {
      console.error('❌ [HEALTH CHECK] Error:', error);
      res.status(500).json(handleError(error, 'healthCheck'));
    }
  }
);
