/**
 * Create Timecard Configuration Function
 * 
 * Creates a new timecard configuration for an organization
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createSuccessResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const createTimecardConfiguration = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { auth } = request;
      
      if (!auth) {
        throw new Error('Authentication required');
      }

      const {
        organizationId,
        userId,
        templateId,
        standardHoursPerDay,
        overtimeThreshold,
        doubleTimeThreshold,
        hourlyRate,
        overtimeMultiplier,
        doubleTimeMultiplier,
        mealBreakRequired,
        mealBreakThreshold,
        mealPenaltyHours,
        minimumTurnaround,
        enableEscalation,
        escalationThreshold,
        escalationOvertimeThreshold,
        escalationComplianceIssues,
        escalationTurnaroundViolations,
        escalationReason,
        isActive,
        configurationType
      } = request.data;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      if (!configurationType) {
        throw new Error('Configuration type is required');
      }

      console.log(`⏰ [CREATE TIMECARD CONFIGURATION] Creating configuration for org: ${organizationId}`);

      const configurationData: any = {
        organizationId,
        isActive: isActive !== undefined ? isActive : true,
        configurationType,
        createdBy: auth.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      // Optional fields
      if (userId) configurationData.userId = userId;
      if (templateId) configurationData.templateId = templateId;
      if (standardHoursPerDay !== undefined) configurationData.standardHoursPerDay = standardHoursPerDay;
      if (overtimeThreshold !== undefined) configurationData.overtimeThreshold = overtimeThreshold;
      if (doubleTimeThreshold !== undefined) configurationData.doubleTimeThreshold = doubleTimeThreshold;
      if (hourlyRate !== undefined) configurationData.hourlyRate = hourlyRate;
      if (overtimeMultiplier !== undefined) configurationData.overtimeMultiplier = overtimeMultiplier;
      if (doubleTimeMultiplier !== undefined) configurationData.doubleTimeMultiplier = doubleTimeMultiplier;
      if (mealBreakRequired !== undefined) configurationData.mealBreakRequired = mealBreakRequired;
      if (mealBreakThreshold !== undefined) configurationData.mealBreakThreshold = mealBreakThreshold;
      if (mealPenaltyHours !== undefined) configurationData.mealPenaltyHours = mealPenaltyHours;
      if (minimumTurnaround !== undefined) configurationData.minimumTurnaround = minimumTurnaround;
      if (enableEscalation !== undefined) configurationData.enableEscalation = enableEscalation;
      if (escalationThreshold !== undefined) configurationData.escalationThreshold = escalationThreshold;
      if (escalationOvertimeThreshold !== undefined) configurationData.escalationOvertimeThreshold = escalationOvertimeThreshold;
      if (escalationComplianceIssues !== undefined) configurationData.escalationComplianceIssues = escalationComplianceIssues;
      if (escalationTurnaroundViolations !== undefined) configurationData.escalationTurnaroundViolations = escalationTurnaroundViolations;
      if (escalationReason) configurationData.escalationReason = escalationReason;

      const configRef = await db.collection('timecardConfigurations').add(configurationData);
      const configDoc = await configRef.get();

      console.log(`⏰ [CREATE TIMECARD CONFIGURATION] Configuration created with ID: ${configRef.id}`);

      return createSuccessResponse({
        id: configRef.id,
        ...configDoc.data()
      }, 'Timecard configuration created successfully');

    } catch (error: any) {
      console.error('❌ [CREATE TIMECARD CONFIGURATION] Error:', error);
      return handleError(error, 'createTimecardConfiguration');
    }
  }
);

