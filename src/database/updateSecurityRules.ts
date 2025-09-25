/**
 * Update Security Rules Function
 * 
 * Updates Firestore security rules for collections
 */

import { onRequest } from 'firebase-functions/v2/https';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

export const updateSecurityRules = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req, res): Promise<void> => {
    try {
      const { collectionName, rules } = req.body;

      if (!collectionName) {
        res.status(400).json(createErrorResponse('Collection name is required'));
        return;
      }

      if (!rules) {
        res.status(400).json(createErrorResponse('Security rules are required'));
        return;
      }

      console.log(`📊 [UPDATE SECURITY RULES] Updating rules for ${collectionName}`);

      // Note: Security rules are typically managed via firestore.rules
      // This function serves as a placeholder and validation endpoint
      // The actual rule deployment happens during firebase deploy

      // Validate rules format
      if (typeof rules !== 'string') {
        res.status(400).json(createErrorResponse('Security rules must be a string'));
        return;
      }

      // Basic validation - check for common rule patterns
      const hasRulesBlock = rules.includes('rules = {');
      const hasVersion = rules.includes('rules_version = \'2\'');

      if (!hasRulesBlock) {
        res.status(400).json(createErrorResponse('Invalid rules format: missing rules block'));
        return;
      }

      console.log(`📊 [UPDATE SECURITY RULES] Rules validation passed for ${collectionName}`);

      res.status(200).json(createSuccessResponse({
        collectionName,
        rulesLength: rules.length,
        hasVersion,
        message: 'Security rules validation passed. Deploy to apply changes.'
      }, 'Security rules validation successful'));

    } catch (error: any) {
      console.error('❌ [UPDATE SECURITY RULES] Error:', error);
      res.status(500).json(handleError(error, 'updateSecurityRules'));
    }
  }
);
