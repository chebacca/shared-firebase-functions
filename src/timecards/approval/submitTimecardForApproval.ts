/**
 * Submit Timecard for Approval Function
 * 
 * Submits a timecard entry for approval workflow
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, handleError } from '../../shared/utils';

const db = getFirestore();

async function calculateTimecardTotals(
  entryData: any,
  template: any | null
): Promise<{
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  mealPenalty: boolean;
  totalPay: number;
}> {
  // Use default rules if no template
  const config = template || {
    standardHoursPerDay: 8.0,
    overtimeThreshold: 8.0,
    doubleTimeThreshold: 12.0,
    hourlyRate: 0.0,
    overtimeMultiplier: 1.5,
    doubleTimeMultiplier: 2.0,
    mealBreakRequired: true,
    mealBreakThreshold: 6.0,
    mealPenaltyHours: 1.0,
  };

  const clockInTime = entryData.clockInTime?.toDate?.() || 
                     (entryData.timeIn?.toDate?.() || new Date(entryData.timeIn || entryData.clockInTime));
  const clockOutTime = entryData.clockOutTime?.toDate?.() || 
                      (entryData.timeOut?.toDate?.() || new Date(entryData.timeOut || entryData.clockOutTime));
  const mealBreakStart = entryData.mealBreakStart?.toDate?.() || 
                        (entryData.mealBreakStart ? new Date(entryData.mealBreakStart) : null);
  const mealBreakEnd = entryData.mealBreakEnd?.toDate?.() || 
                      (entryData.mealBreakEnd ? new Date(entryData.mealBreakEnd) : null);
  const hourlyRate = entryData.hourlyRate || config.hourlyRate || 0;

  if (!clockInTime || !clockOutTime) {
    return {
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      mealPenalty: false,
      totalPay: 0,
    };
  }

  // Calculate total work hours (subtract meal break if taken)
  let totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
  
  if (mealBreakStart && mealBreakEnd) {
    const mealBreakHours = (mealBreakEnd.getTime() - mealBreakStart.getTime()) / (1000 * 60 * 60);
    totalHours -= mealBreakHours;
  }

  // Calculate meal penalty
  const mealPenalty = config.mealBreakRequired &&
    totalHours >= config.mealBreakThreshold &&
    (!mealBreakStart || !mealBreakEnd);

  // Calculate overtime breakdown using template rules
  let regularHours = Math.min(totalHours, config.overtimeThreshold);
  let overtimeHours = 0;
  let doubleTimeHours = 0;

  if (totalHours > config.overtimeThreshold) {
    const overtimeAmount = totalHours - config.overtimeThreshold;

    if (totalHours > config.doubleTimeThreshold) {
      const doubleTimeAmount = totalHours - config.doubleTimeThreshold;
      doubleTimeHours = doubleTimeAmount;
      overtimeHours = overtimeAmount - doubleTimeAmount;
    } else {
      overtimeHours = overtimeAmount;
    }
  }

  // Calculate total pay
  let totalPay = regularHours * hourlyRate;
  totalPay += overtimeHours * hourlyRate * config.overtimeMultiplier;
  totalPay += doubleTimeHours * hourlyRate * config.doubleTimeMultiplier;

  // Add meal penalty
  if (mealPenalty) {
    totalPay += config.mealPenaltyHours * hourlyRate;
  }

  return {
    totalHours,
    regularHours,
    overtimeHours,
    doubleTimeHours,
    mealPenalty,
    totalPay,
  };
}

export const submitTimecardForApproval = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { timecardId } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      if (!timecardId) {
        throw new HttpsError('invalid-argument', 'Timecard ID is required');
      }

      console.log(`⏰ [SUBMIT TIMECARD] Submitting timecard ${timecardId} for user: ${userId}`);

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const organizationId = userRecord.customClaims?.organizationId as string;

      if (!organizationId) {
        throw new HttpsError('permission-denied', 'User must belong to an organization');
      }

      // Get the timecard entry
      const entryRef = db.collection('timecard_entries').doc(timecardId);
      const entryDoc = await entryRef.get();

      if (!entryDoc.exists) {
        throw new HttpsError('not-found', 'Timecard not found');
      }

      const entryData = entryDoc.data();
      
      if (!entryData) {
        throw new HttpsError('not-found', 'Timecard data not found');
      }

      // Verify ownership
      if (entryData.userId !== userId || entryData.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'You do not have permission to submit this timecard');
      }

      // Check if already submitted
      if (entryData.status === 'SUBMITTED' || entryData.status === 'APPROVED' || entryData.status === 'REJECTED') {
        throw new HttpsError('failed-precondition', `Timecard is already ${entryData.status}`);
      }

      // Get user's timecard template/assignment
      let template = null;
      try {
        const assignmentsQuery = await db.collection('timecardAssignments')
          .where('userId', '==', userId)
          .where('organizationId', '==', organizationId)
          .where('isActive', '==', true)
          .limit(1)
          .get();

        if (!assignmentsQuery.empty) {
          const assignment = assignmentsQuery.docs[0].data();
          if (assignment.templateId) {
            const templateDoc = await db.collection('timecardTemplates').doc(assignment.templateId).get();
            if (templateDoc.exists) {
              template = templateDoc.data();
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ [SUBMIT TIMECARD] Could not fetch template, using defaults:', error);
      }

      // Calculate totals using template rules
      const calculations = await calculateTimecardTotals(entryData, template);

      // Update entry with calculated values and SUBMITTED status
      const submittedAt = admin.firestore.Timestamp.now();
      await entryRef.update({
        status: 'SUBMITTED',
        submittedAt: submittedAt,
        totalHours: calculations.totalHours,
        regularHours: calculations.regularHours,
        overtimeHours: calculations.overtimeHours,
        doubleTimeHours: calculations.doubleTimeHours,
        mealPenalty: calculations.mealPenalty,
        totalPay: calculations.totalPay,
        hourlyRate: entryData.hourlyRate || template?.hourlyRate || 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // ⚡ OPTIMIZATION: Don't do an extra get() call - construct response from data we already have
      // This saves a database round-trip and significantly improves performance
      const responseData = {
        id: timecardId,
        status: 'SUBMITTED',
        submittedAt: submittedAt.toDate().toISOString(),
        totalHours: calculations.totalHours,
        regularHours: calculations.regularHours,
        overtimeHours: calculations.overtimeHours,
        doubleTimeHours: calculations.doubleTimeHours,
        mealPenalty: calculations.mealPenalty,
        totalPay: calculations.totalPay
      };

      console.log(`✅ [SUBMIT TIMECARD] Timecard ${timecardId} submitted successfully with calculations:`, {
        totalHours: calculations.totalHours,
        regularHours: calculations.regularHours,
        overtimeHours: calculations.overtimeHours,
        doubleTimeHours: calculations.doubleTimeHours,
        mealPenalty: calculations.mealPenalty,
        totalPay: calculations.totalPay
      });

      return createSuccessResponse(responseData, 'Timecard submitted for approval successfully');

    } catch (error: any) {
      console.error('❌ [SUBMIT TIMECARD] Error:', error);
      
      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }
      
      return handleError(error, 'submitTimecardForApproval');
    }
  }
);

