/**
 * Calendar Functions for Clip Show Pro
 * 
 * Firebase Functions for calendar event management
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();
const auth = getAuth();

/**
 * Create a new calendar event
 */
export const createCalendarEvent = onCall({ memory: '512MiB' }, async (request) => {
  try {
    const { title, description, startDate, endDate, location, eventType, assignedContactIds, projectId } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!title || !startDate || !eventType || !projectId) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    // Get user's organization ID
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    const organizationId = userData?.organizationId || 'default';

    // Create calendar event
    const eventData = {
      title,
      description: description || '',
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      location: location || '',
      eventType,
      projectId,
      organizationId,
      createdBy: request.auth.uid,
      assignedContacts: assignedContactIds || [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const eventRef = await db.collection('calendarEvents').add(eventData);
    
    return {
      success: true,
      eventId: eventRef.id,
      data: { ...eventData, id: eventRef.id }
    };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw new HttpsError('internal', 'Failed to create calendar event');
  }
});

/**
 * Update an existing calendar event
 */
export const updateCalendarEvent = onCall({ memory: '512MiB' }, async (request) => {
  try {
    const { eventId, title, description, startDate, endDate, location, eventType, assignedContactIds } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!eventId) {
      throw new HttpsError('invalid-argument', 'Event ID is required');
    }

    // Check if event exists and user has permission
    const eventDoc = await db.collection('calendarEvents').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Calendar event not found');
    }

    const eventData = eventDoc.data();
    
    // Check if user created the event or is admin
    if (eventData?.createdBy !== request.auth.uid) {
      // TODO: Add admin check
      throw new HttpsError('permission-denied', 'You can only edit events you created');
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date()
    };

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (location !== undefined) updateData.location = location;
    if (eventType !== undefined) updateData.eventType = eventType;
    if (assignedContactIds !== undefined) updateData.assignedContacts = assignedContactIds;

    // Update the event
    await db.collection('calendarEvents').doc(eventId).update(updateData);
    
    return {
      success: true,
      eventId,
      data: { ...eventData, ...updateData, id: eventId }
    };
  } catch (error) {
    console.error('Error updating calendar event:', error);
    throw new HttpsError('internal', 'Failed to update calendar event');
  }
});

/**
 * Delete a calendar event
 */
export const deleteCalendarEvent = onCall({ memory: '512MiB' }, async (request) => {
  try {
    const { eventId } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!eventId) {
      throw new HttpsError('invalid-argument', 'Event ID is required');
    }

    // Check if event exists and user has permission
    const eventDoc = await db.collection('calendarEvents').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Calendar event not found');
    }

    const eventData = eventDoc.data();
    
    // Check if user created the event or is admin
    if (eventData?.createdBy !== request.auth.uid) {
      // TODO: Add admin check
      throw new HttpsError('permission-denied', 'You can only delete events you created');
    }

    // Delete the event
    await db.collection('calendarEvents').doc(eventId).delete();
    
    return {
      success: true,
      eventId
    };
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    throw new HttpsError('internal', 'Failed to delete calendar event');
  }
});

/**
 * Get calendar events for a project
 */
export const getCalendarEvents = onCall({ memory: '512MiB' }, async (request) => {
  try {
    const { projectId, startDate, endDate, eventType } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!projectId) {
      throw new HttpsError('invalid-argument', 'Project ID is required');
    }

    // Get user's organization ID
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    const organizationId = userData?.organizationId || 'default';

    // Build query
    let query = db.collection('calendarEvents')
      .where('projectId', '==', projectId)
      .where('organizationId', '==', organizationId);

    if (startDate) {
      query = query.where('startDate', '>=', new Date(startDate));
    }

    if (endDate) {
      query = query.where('startDate', '<=', new Date(endDate));
    }

    if (eventType) {
      query = query.where('eventType', '==', eventType);
    }

    // Execute query
    const snapshot = await query.orderBy('startDate', 'asc').get();
    const events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return {
      success: true,
      events
    };
  } catch (error) {
    console.error('Error getting calendar events:', error);
    throw new HttpsError('internal', 'Failed to get calendar events');
  }
});

/**
 * Assign contacts to a calendar event
 */
export const assignContactsToEvent = onCall({ memory: '512MiB' }, async (request) => {
  try {
    const { eventId, contactIds } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!eventId || !Array.isArray(contactIds)) {
      throw new HttpsError('invalid-argument', 'Event ID and contact IDs are required');
    }

    // Check if event exists and user has permission
    const eventDoc = await db.collection('calendarEvents').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Calendar event not found');
    }

    const eventData = eventDoc.data();
    
    // Check if user created the event or is admin
    if (eventData?.createdBy !== request.auth.uid) {
      // TODO: Add admin check
      throw new HttpsError('permission-denied', 'You can only assign contacts to events you created');
    }

    // Update the event with new contact assignments
    await db.collection('calendarEvents').doc(eventId).update({
      assignedContacts: contactIds,
      updatedAt: new Date()
    });
    
    return {
      success: true,
      eventId,
      assignedContacts: contactIds
    };
  } catch (error) {
    console.error('Error assigning contacts to event:', error);
    throw new HttpsError('internal', 'Failed to assign contacts to event');
  }
});
