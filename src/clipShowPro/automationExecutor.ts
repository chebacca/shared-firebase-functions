/**
 * Automation Executor
 * 
 * Cloud Functions for executing automation rules
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { executeAutomationLogic } from './automationService';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

// CORS helper function
function setCorsHeaders(res: any, origin?: string): void {
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://backbone-callsheet-standalone.web.app',
    'https://dashboard-1c3a5.web.app',
    'https://clipshowpro.web.app', // Added Clip Show Pro origin
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173',
    'null'
  ];
  
  // Priority 1: Always allow localhost origins (for development/testing) - check this FIRST
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  // Priority 2: Always allow the origin that made the request in development mode
  else if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
    res.set('Access-Control-Allow-Origin', origin || '*');
  }
  // Priority 3: Check if origin is in allowed list
  else if (origin && (allowedOrigins.includes(origin) || origin === 'null')) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  // Priority 4: Fallback to default production origin
  else {
    // In production, be more restrictive but still allow the request to proceed
    res.set('Access-Control-Allow-Origin', 'https://clipshowpro.web.app');
  }
  
  // Set other CORS headers
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version, Origin');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Max-Age', '3600'); // Cache preflight request for 1 hour
}

interface ExecuteAutomationRequest {
  functionId: string;
  functionName: string;
  context: any;
  organizationId: string;
  performedBy: string;
  performedByName?: string;
}

/**
 * Execute automation for a function
 */
export const executeAutomation = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: true,
  },
  async (request) => {
  try {
    const { functionId, functionName, context, organizationId, performedBy, performedByName } = request.data as ExecuteAutomationRequest;

    // Validate request
    if (!functionId || !organizationId) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    return await executeAutomationLogic(
      functionId,
      functionName,
      context,
      organizationId,
      performedBy,
      performedByName
    );

  } catch (error) {
    console.error('❌ [AutomationExecutor] Error executing automation:', error);
    
    throw new HttpsError('internal', error instanceof Error ? error.message : 'Failed to execute automation');
  }
});

/**
 * Execute automation HTTP function (with proper CORS)
 */
export const executeAutomationHttp = onRequest(
  {
    region: 'us-central1',
  },
  async (req, res) => {
    // Set CORS headers first thing
    setCorsHeaders(res, req.headers.origin);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    try {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const { functionId, functionName, context, organizationId, performedBy, performedByName } = req.body as ExecuteAutomationRequest;

      // Validate request
      if (!functionId || !organizationId) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters'
        });
        return;
      }

      const result = await executeAutomationLogic(
        functionId,
        functionName,
        context,
        organizationId,
        performedBy,
        performedByName
      );

      res.status(200).json(result);

    } catch (error) {
      console.error('❌ [AutomationExecutor HTTP] Error executing automation:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute automation'
      });
    }
  }
);
