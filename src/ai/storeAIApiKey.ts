/**
 * Store AI API Key Firebase Function
 * 
 * Securely encrypts and stores AI API keys in Firestore
 * Uses AES-256-GCM encryption for maximum security
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { encryptTokens } from '../integrations/encryption';
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Define the encryption key secret for Firebase Functions v2
const encryptionKeySecret = defineSecret('INTEGRATIONS_ENCRYPTION_KEY');

interface StoreApiKeyRequest {
  organizationId: string;
  service: 'openai' | 'claude' | 'youtube' | 'gemini' | 'grok';
  apiKey: string;
  model?: string;
  enabled?: boolean;
  overrideOrgKey?: boolean; // For user-level keys
}

interface StoreApiKeyResponse {
  success: boolean;
  message: string;
}

/**
 * Store AI API Key - Main function
 * 
 * SECURITY: This function encrypts the API key using AES-256-GCM before storing
 * The encryption key is stored securely in Firebase Config and never exposed to the client
 */
export const storeAIApiKey = onCall(
  { 
    cors: true,
    // Include the encryption key secret
    secrets: [encryptionKeySecret]
  },
  async (request): Promise<StoreApiKeyResponse> => {
    try {
      // Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      const { organizationId, service, apiKey, model, enabled = true, overrideOrgKey = false } = request.data as StoreApiKeyRequest;

      // Validation
      if (!organizationId || !service || !apiKey) {
        throw new HttpsError('invalid-argument', 'OrganizationId, service, and apiKey are required');
      }

      // Validate API key format (basic check)
      if (apiKey.trim().length < 10) {
        throw new HttpsError('invalid-argument', 'API key appears to be invalid');
      }

      // Validate API key contains only valid characters for HTTP headers and API usage
      // API keys should only contain: letters, numbers, hyphens, underscores, dots, equals, slashes, and plus signs
      const invalidChars = apiKey
        .split('')
        .filter(char => {
          const code = char.charCodeAt(0);
          // Check if character is valid for API keys (alphanumeric + safe symbols)
          const isValid = (code >= 48 && code <= 57) || // 0-9
                         (code >= 65 && code <= 90) || // A-Z
                         (code >= 97 && code <= 122) || // a-z
                         code === 45 || // -
                         code === 95 || // _
                         code === 46 || // .
                         code === 61 || // =
                         code === 47 || // /
                         code === 43 || // +
                         code === 9 || code === 10 || code === 13 || code === 32; // whitespace (will be trimmed)
          return !isValid;
        });
      
      if (invalidChars.length > 0) {
        const invalidCharsList = invalidChars
          .slice(0, 10) // Limit to first 10 for error message
          .map(char => {
            const code = char.charCodeAt(0);
            return `'${char}' (${code})`;
          });
        console.error('❌ [storeAIApiKey] API key contains invalid characters:', invalidCharsList);
        throw new HttpsError(
          'invalid-argument', 
          `API key contains invalid characters that cannot be used in HTTP headers. ` +
          `API keys must contain only letters, numbers, hyphens (-), underscores (_), dots (.), ` +
          `equals (=), slashes (/), and plus signs (+). Found invalid characters: ${invalidCharsList.join(', ')}`
        );
      }

      // Get default model if not provided
      const defaultModel = model || getDefaultModel(service);

      // SECURITY: Encrypt the API key using AES-256-GCM
      // The encryption key is stored in Firebase Config and never exposed to clients
      let encryptedApiKey: string;
      try {
        encryptedApiKey = encryptTokens(apiKey);
      } catch (encryptError: any) {
        console.error('❌ [storeAIApiKey] Encryption failed:', encryptError);
        throw new HttpsError(
          'internal',
          encryptError.message?.includes('Encryption key not configured') 
            ? 'Encryption key not configured. Please set integrations.encryption_key in Firebase Config.'
            : 'Failed to encrypt API key. Please check server configuration.'
        );
      }

      // Prepare the document data
      const keyData: any = {
        service,
        apiKey: encryptedApiKey, // Stored encrypted
        model: defaultModel,
        enabled,
        organizationId,
        userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        lastUsedAt: null,
        overrideOrgKey
      };

      if (overrideOrgKey) {
        // Store as user-level override
        const userKeyRef = admin.firestore()
          .collection('users')
          .doc(userId)
          .collection('aiApiKeys')
          .doc(service);

        await userKeyRef.set(keyData);

        return {
          success: true,
          message: `User-level ${service} API key stored securely`
        };
      } else {
        // Verify user has admin permissions - ONLY admins can store API keys
        const orgDoc = await admin.firestore()
          .collection('organizations')
          .doc(organizationId)
          .get();

        if (!orgDoc.exists) {
          throw new HttpsError('not-found', 'Organization not found');
        }

        const orgData = orgDoc.data();
        
        // Check multiple ways the user might be an admin:
        // 1. Check if user is the organization owner
        const isOwner = orgData?.ownerUid === userId;
        
        // 2. Check if user is the admin user
        const isAdminUser = orgData?.adminUserId === userId;
        
        // 3. Check members map (for organizations that use it)
        const userRole = orgData?.members?.[userId]?.role;
        const normalizedRole = userRole?.toLowerCase?.() || '';
        const isMemberAdmin = normalizedRole === 'admin' || 
                            normalizedRole === 'owner' ||
                            normalizedRole === 'administrator' ||
                            userRole === 'ADMIN' ||
                            userRole === 'OWNER' ||
                            userRole === 'ENTERPRISE_ADMIN';
        
        // Log for debugging
        console.log(`🔍 [storeAIApiKey] Checking permissions for user ${userId} in org ${organizationId}`);
        console.log(`   Is owner: ${isOwner} (ownerUid: ${orgData?.ownerUid})`);
        console.log(`   Is admin user: ${isAdminUser} (adminUserId: ${orgData?.adminUserId})`);
        console.log(`   Member role: ${userRole} (normalized: ${normalizedRole})`);
        console.log(`   Is member admin: ${isMemberAdmin}`);
        console.log(`   Org members structure:`, Object.keys(orgData?.members || {}));

        // STRICT: Only admins can store API keys
        // User must be owner, admin user, or have admin role in members
        const isAdmin = isOwner || isAdminUser || isMemberAdmin;

        if (!isAdmin) {
          console.error(`❌ [storeAIApiKey] Permission denied - user ${userId} is not owner/admin`);
          console.error(`   ownerUid: ${orgData?.ownerUid}, adminUserId: ${orgData?.adminUserId}, memberRole: ${userRole}`);
          throw new HttpsError(
            'permission-denied', 
            'Only organization administrators can store API keys. Please contact your organization admin to set up API keys.'
          );
        }
        
        console.log(`✅ [storeAIApiKey] User ${userId} has admin permissions (owner: ${isOwner}, adminUser: ${isAdminUser}, memberAdmin: ${isMemberAdmin})`);

        // Store as organization-level key
        const orgKeyRef = admin.firestore()
          .collection('organizations')
          .doc(organizationId)
          .collection('aiApiKeys')
          .doc(service);

        await orgKeyRef.set(keyData);

        return {
          success: true,
          message: `Organization-level ${service} API key stored securely`
        };
      }
    } catch (error: any) {
      console.error('❌ [storeAIApiKey] Error storing API key:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Failed to store API key securely'
      );
    }
  }
);

/**
 * Get default model for service
 */
function getDefaultModel(service: 'openai' | 'claude' | 'youtube' | 'gemini' | 'grok'): string {
  switch (service) {
    case 'openai':
      return 'gpt-4';
    case 'claude':
      return 'claude-3-sonnet-20240229';
    case 'youtube':
      return 'v3';
    case 'gemini':
      // Single stable model - no fallbacks, no complexity
      // Use gemini-2.5-flash - latest stable flash model for v1 API
      return 'gemini-2.5-flash';
    case 'grok':
      return 'grok-beta';
    default:
      return 'gpt-4';
  }
}

