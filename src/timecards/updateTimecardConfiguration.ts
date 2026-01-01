/**
 * Update Timecard Configuration Function
 * 
 * Updates an existing timecard configuration
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createSuccessResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const updateTimecardConfiguration = onCall(
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
        configurationId,
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

      if (!configurationId) {
        throw new Error('Configuration ID is required');
      }

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`⏰ [UPDATE TIMECARD CONFIGURATION] Updating configuration: ${configurationId}`);

      // Verify configuration exists and belongs to organization
      const configRef = db.collection('timecardConfigurations').doc(configurationId);
      const configDoc = await configRef.get();

      if (!configDoc.exists) {
        throw new Error('Configuration not found');
      }

      const configData = configDoc.data();
      if (configData?.organizationId !== organizationId) {
        throw new Error('Configuration does not belong to this organization');
      }

      const updateData: any = {
        updatedAt: FieldValue.serverTimestamp()
      };

      // Optional fields
      if (userId !== undefined) updateData.userId = userId;
      if (templateId !== undefined) updateData.templateId = templateId;
      if (standardHoursPerDay !== undefined) updateData.standardHoursPerDay = standardHoursPerDay;
      if (overtimeThreshold !== undefined) updateData.overtimeThreshold = overtimeThreshold;
      if (doubleTimeThreshold !== undefined) updateData.doubleTimeThreshold = doubleTimeThreshold;
      if (hourlyRate !== undefined) updateData.hourlyRate = hourlyRate;
      if (overtimeMultiplier !== undefined) updateData.overtimeMultiplier = overtimeMultiplier;
      if (doubleTimeMultiplier !== undefined) updateData.doubleTimeMultiplier = doubleTimeMultiplier;
      if (mealBreakRequired !== undefined) updateData.mealBreakRequired = mealBreakRequired;
      if (mealBreakThreshold !== undefined) updateData.mealBreakThreshold = mealBreakThreshold;
      if (mealPenaltyHours !== undefined) updateData.mealPenaltyHours = mealPenaltyHours;
      if (minimumTurnaround !== undefined) updateData.minimumTurnaround = minimumTurnaround;
      if (enableEscalation !== undefined) updateData.enableEscalation = enableEscalation;
      if (escalationThreshold !== undefined) updateData.escalationThreshold = escalationThreshold;
      if (escalationOvertimeThreshold !== undefined) updateData.escalationOvertimeThreshold = escalationOvertimeThreshold;
      if (escalationComplianceIssues !== undefined) updateData.escalationComplianceIssues = escalationComplianceIssues;
      if (escalationTurnaroundViolations !== undefined) updateData.escalationTurnaroundViolations = escalationTurnaroundViolations;
      if (escalationReason !== undefined) updateData.escalationReason = escalationReason;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (configurationType !== undefined) updateData.configurationType = configurationType;

      await configRef.update(updateData);
      const updatedDoc = await configRef.get();

      console.log(`⏰ [UPDATE TIMECARD CONFIGURATION] Configuration updated: ${configurationId}`);

      return createSuccessResponse({
        id: configurationId,
        ...updatedDoc.data()
      }, 'Timecard configuration updated successfully');

    } catch (error: any) {
      console.error('❌ [UPDATE TIMECARD CONFIGURATION] Error:', error);
      return handleError(error, 'updateTimecardConfiguration');
    }
  }
);

