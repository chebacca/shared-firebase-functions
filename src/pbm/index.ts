import * as functions from 'firebase-functions';
import { pbmApi as pbmApiHandler } from './unified';

// ============================================================================
// UNIFIED PBM API FUNCTION
// Handles all PBM operations through a single endpoint
// ============================================================================

export const pbmApi = functions.https.onRequest(pbmApiHandler);
