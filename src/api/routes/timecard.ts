import express from 'express';
import { authenticateToken } from '../../shared/middleware';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';
import {
  updateLocationStatus,
  logLocationActivity,
  getLocationStatus,
  getLocationStatusDisplay,
  WrappedStatus
} from '../../location/locationStatusService';

const router = express.Router();
const db = getFirestore();

/**
 * Clock in endpoint
 * POST /timecard/clock-in
 */
router.post('/clock-in', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const userOrgId = req.user?.organizationId;

    if (!userId || !userOrgId) {
      res.status(401).json(createErrorResponse('User authentication required'));
      return;
    }

    const { date, location, department, role, hourlyRate, notes, projectId } = req.body;

    console.log(`⏰ [CLOCK IN] User ${userId} clocking in for organization ${userOrgId}`);

    // Get today's date if not provided
    const today = date || new Date().toISOString().split('T')[0];
    const now = admin.firestore.Timestamp.now();

    // Create date timestamp for query (start of day in UTC)
    const [year, month, day] = today.split('-').map(Number);
    const dateTimestamp = admin.firestore.Timestamp.fromDate(new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)));

    // Check if user is already clocked in for today
    const timecardQuery = await db.collection('timecard_entries')
      .where('userId', '==', userId)
      .where('organizationId', '==', userOrgId)
      .where('date', '==', dateTimestamp)
      .where('clockOutTime', '==', null)
      .limit(1)
      .get();

    if (!timecardQuery.empty) {
      res.status(400).json(createErrorResponse('Already clocked in', 'You are already clocked in for today'));
      return;
    }

    // Create timecard entry
    const timecardData: any = {
      userId,
      organizationId: userOrgId,
      date: dateTimestamp,
      clockInTime: now,
      clockOutTime: null,
      location: location || '',
      department: department || '',
      role: role || '',
      hourlyRate: hourlyRate || 0,
      notes: notes || '',
      projectId: projectId || null,
      status: 'ACTIVE',
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      mealBreakTaken: false,
      mealPenalty: false,
      createdAt: now,
      updatedAt: now
    };

    const timecardRef = await db.collection('timecard_entries').add(timecardData);
    const timecardDoc = await timecardRef.get();

    // Update location status
    const updatedState = await updateLocationStatus(
      userId,
      userOrgId,
      'timecard_clockin'
    );

    // Log location activity
    await logLocationActivity(
      userId,
      userOrgId,
      'timecard_clockin',
      updatedState.currentLocationStatus
    );

    const timecard = { id: timecardDoc.id, ...timecardDoc.data() } as any;

    console.log(`✅ [CLOCK IN] User ${userId} clocked in successfully`);

    res.status(200).json(createSuccessResponse({
      id: timecard.id,
      userId: timecard.userId,
      date: today,
      clockInTime: timecard.clockInTime?.toDate?.()?.toISOString() || now.toDate().toISOString(),
      clockOutTime: null,
      location: timecard.location,
      notes: timecard.notes,
      projectId: timecard.projectId,
      organizationId: timecard.organizationId,
      status: timecard.status,
      totalHours: timecard.totalHours || 0,
      locationStatus: updatedState.currentLocationStatus
    }, 'Successfully clocked in'));
  } catch (error: any) {
    console.error('❌ [CLOCK IN] Error:', error);
    res.status(500).json(handleError(error, 'clockIn'));
  }
});

/**
 * Clock out endpoint
 * POST /timecard/clock-out
 */
router.post('/clock-out', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.uid;
    const userOrgId = req.user?.organizationId;

    if (!userId || !userOrgId) {
      res.status(401).json(createErrorResponse('User authentication required'));
      return;
    }

    const { wrappedStatus, notes } = req.body;

    // wrappedStatus is required for clock out
    if (!wrappedStatus || (wrappedStatus !== 'wrapped' && wrappedStatus !== 'another_location')) {
      res.status(400).json(createErrorResponse('wrappedStatus is required', 'wrappedStatus must be "wrapped" or "another_location"'));
      return;
    }

    console.log(`⏰ [CLOCK OUT] User ${userId} clocking out, wrappedStatus: ${wrappedStatus}`);

    const now = admin.firestore.Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    // Look back 7 days to find any active session (handles overnight/long shifts and missing fields)
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 7);
    lookbackDate.setHours(0, 0, 0, 0);
    const lookbackTimestamp = admin.firestore.Timestamp.fromDate(lookbackDate);

    // Use existing index (Organization + User + Date) to find recent entries
    const timecardQuery = await db.collection('timecard_entries')
      .where('userId', '==', userId)
      .where('organizationId', '==', userOrgId)
      .where('date', '>=', lookbackTimestamp)
      .orderBy('date', 'desc')
      .get();

    // Find the first active entry (no clockOutTime AND no timeOut)
    const timecardDoc = timecardQuery.docs.find(doc => {
      const data = doc.data();
      return !data.clockOutTime && !data.timeOut;
    });

    if (!timecardDoc) {
      res.status(400).json(createErrorResponse('Not clocked in', 'You are not currently clocked in'));
      return;
    }

    const timecardRef = timecardDoc.ref;
    const timecardData = timecardDoc.data();

    // Calculate total hours
    const clockInTime = timecardData.clockInTime?.toDate?.() || new Date(timecardData.clockInTime);
    const clockOutTime = now.toDate();
    const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    // Update timecard entry
    await timecardRef.update({
      clockOutTime: now,
      totalHours: totalHours,
      regularHours: totalHours, // Simplified - could calculate overtime based on rules
      status: 'PENDING',
      notes: notes || timecardData.notes || '',
      updatedAt: now
    });

    const updatedDoc = await timecardRef.get();
    const updatedTimecard = { id: updatedDoc.id, ...updatedDoc.data() } as any;

    // Update location status
    const updatedState = await updateLocationStatus(
      userId,
      userOrgId,
      'timecard_clockout',
      wrappedStatus as WrappedStatus
    );

    // Log location activity
    await logLocationActivity(
      userId,
      userOrgId,
      'timecard_clockout',
      updatedState.currentLocationStatus,
      wrappedStatus as WrappedStatus
    );

    console.log(`✅ [CLOCK OUT] User ${userId} clocked out successfully`);

    res.status(200).json(createSuccessResponse({
      id: updatedTimecard.id,
      userId: updatedTimecard.userId,
      date: today,
      clockInTime: updatedTimecard.clockInTime?.toDate?.()?.toISOString(),
      clockOutTime: updatedTimecard.clockOutTime?.toDate?.()?.toISOString(),
      location: updatedTimecard.location,
      notes: updatedTimecard.notes,
      projectId: updatedTimecard.projectId,
      organizationId: updatedTimecard.organizationId,
      status: updatedTimecard.status,
      totalHours: updatedTimecard.totalHours || 0,
      locationStatus: updatedState.currentLocationStatus,
      wrappedStatus
    }, 'Successfully clocked out'));
  } catch (error: any) {
    console.error('❌ [CLOCK OUT] Error:', error);
    res.status(500).json(handleError(error, 'clockOut'));
  }
});

export default router;

