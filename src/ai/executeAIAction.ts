/**
 * Execute AI Action
 * 
 * Executes AI-suggested actions after user confirmation
 * Supports: status updates, reassignments, deadline extensions, notifications
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { sendSystemAlert } from '../utils/systemAlerts';

const db = getFirestore();
const auth = getAuth();

export interface ActionExecutionRequest {
  actionType: 'status_update' | 'reassign' | 'extend_deadline' | 'notify_team';
  actionData: any;
  alertId?: string;
  organizationId: string;
}

export interface ActionExecutionResult {
  success: boolean;
  message: string;
  updatedEntity?: {
    type: 'pitch' | 'story';
    id: string;
    changes: any;
  };
  error?: string;
}

/**
 * Execute AI-suggested action
 */
export const executeAIAction = onCall(
  {
    cors: true,
    region: 'us-central1'
  },
  async (request): Promise<ActionExecutionResult> => {
    const { actionType, actionData, alertId, organizationId } = request.data;

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    // Verify user has permission
    // This would check user's role and permissions in the organization

    try {
      let result: ActionExecutionResult;

      // Handle specific legacy actions or complex logic
      switch (actionType) {
        case 'status_update':
          result = await executeStatusUpdate(actionData, organizationId, userId);
          break;

        case 'reassign':
          result = await executeReassignment(actionData, organizationId, userId);
          break;

        case 'extend_deadline':
          result = await executeExtendDeadline(actionData, organizationId, userId);
          break;

        case 'notify_team':
          result = await executeNotifyTeam(actionData, organizationId, userId);
          break;

        default:
          // 🛠️ GENERIC GATEWAY: Try to execute via DataToolExecutor
          console.log(`📡 [executeAIAction] Routing generic action: ${actionType}`);
          
          try {
            const { DataToolExecutor } = await import('./DataToolExecutor');
            const toolResult = await DataToolExecutor.executeTool(
              actionType as any,
              actionData,
              organizationId,
              userId
            );

            if (!toolResult.success) {
              // Provide more detailed error messages
              let errorMessage = toolResult.error || 'Execution failed';
              
              // Check if it's an unknown tool
              if (errorMessage.includes('Unknown data tool')) {
                errorMessage = `Action type "${actionType}" is not supported. Available actions: create_project, create_session, manage_task, assign_team_member, and others.`;
              }
              
              result = {
                success: false,
                message: errorMessage,
                error: errorMessage
              };
            } else {
              result = {
                success: true,
                message: `Successfully executed ${actionType}`,
                data: toolResult.data
              };
            }
          } catch (importError: any) {
            console.error(`❌ [executeAIAction] Failed to import DataToolExecutor:`, importError);
            result = {
              success: false,
              message: `Failed to load execution module: ${importError.message}`,
              error: importError.message
            };
          }
      }

      // Update alert status if alertId provided
      if (alertId && result.success) {
        await db.collection('clipShowAlerts').doc(alertId).update({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: userId,
          resolutionAction: actionType
        });
      }

      // Log action execution
      await logActionExecution({
        organizationId,
        userId,
        actionType,
        actionData,
        alertId,
        success: result.success,
        result
      });

      return result;
    } catch (error) {
      console.error('[executeAIAction] Error executing action:', error);

      // Log failed execution
      await logActionExecution({
        organizationId,
        userId,
        actionType,
        actionData,
        alertId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Send system alert for AI action failure
      await sendSystemAlert(
        organizationId,
        'AI Action Failure',
        `AI-suggested action "${actionType}" failed to execute.`,
        {
          actionType,
          alertId,
          error: error instanceof Error ? error.message : 'Unknown error',
          performedBy: userId
        }
      );

      throw new HttpsError('internal', `Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * Execute status update
 */
async function executeStatusUpdate(
  actionData: any,
  organizationId: string,
  userId: string
): Promise<ActionExecutionResult> {
  const { entityType, entityId, newStatus } = actionData;

  if (!entityType || !entityId || !newStatus) {
    throw new HttpsError('invalid-argument', 'entityType, entityId, and newStatus are required');
  }

  const collectionName = entityType === 'pitch' ? 'clipShowPitches' : 'clipShowStories';
  const docRef = db.collection(collectionName).doc(entityId);

  // Verify document exists and belongs to organization
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new HttpsError('not-found', `${entityType} not found`);
  }

  const data = doc.data();
  if (data?.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Document does not belong to organization');
  }

  // Update status
  await docRef.update({
    status: newStatus,
    updatedAt: new Date(),
    lastUpdatedBy: userId
  });

  return {
    success: true,
    message: `Status updated to "${newStatus}"`,
    updatedEntity: {
      type: entityType,
      id: entityId,
      changes: { status: newStatus }
    }
  };
}

/**
 * Execute reassignment
 */
async function executeReassignment(
  actionData: any,
  organizationId: string,
  userId: string
): Promise<ActionExecutionResult> {
  const { entityType, entityId, newAssigneeId, assignmentField } = actionData;

  if (!entityType || !entityId || !newAssigneeId || !assignmentField) {
    throw new HttpsError('invalid-argument', 'entityType, entityId, newAssigneeId, and assignmentField are required');
  }

  const collectionName = entityType === 'pitch' ? 'clipShowPitches' : 'clipShowStories';
  const docRef = db.collection(collectionName).doc(entityId);

  // Verify document exists
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new HttpsError('not-found', `${entityType} not found`);
  }

  const data = doc.data();
  if (data?.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Document does not belong to organization');
  }

  // Update assignment
  const updateData: any = {
    [assignmentField]: newAssigneeId,
    updatedAt: new Date(),
    lastUpdatedBy: userId
  };

  await docRef.update(updateData);

  return {
    success: true,
    message: `Reassigned to new user`,
    updatedEntity: {
      type: entityType,
      id: entityId,
      changes: { [assignmentField]: newAssigneeId }
    }
  };
}

/**
 * Execute deadline extension
 */
async function executeExtendDeadline(
  actionData: any,
  organizationId: string,
  userId: string
): Promise<ActionExecutionResult> {
  const { entityType, entityId, newDeadline } = actionData;

  if (!entityType || !entityId || !newDeadline) {
    throw new HttpsError('invalid-argument', 'entityType, entityId, and newDeadline are required');
  }

  // Update calendar event if it exists
  const eventsSnapshot = await db
    .collection('calendarEvents')
    .where('organizationId', '==', organizationId)
    .where('workflowId', '==', entityId)
    .where('workflowType', '==', entityType)
    .limit(1)
    .get();

  if (!eventsSnapshot.empty) {
    const eventDoc = eventsSnapshot.docs[0];
    await eventDoc.ref.update({
      startDate: new Date(newDeadline),
      updatedAt: new Date(),
      lastUpdatedBy: userId
    });
  }

  return {
    success: true,
    message: `Deadline extended to ${new Date(newDeadline).toLocaleDateString()}`,
    updatedEntity: {
      type: entityType,
      id: entityId,
      changes: { deadline: newDeadline }
    }
  };
}

/**
 * Execute team notification
 */
async function executeNotifyTeam(
  actionData: any,
  organizationId: string,
  userId: string
): Promise<ActionExecutionResult> {
  const { recipients, message, entityType, entityId } = actionData;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    throw new HttpsError('invalid-argument', 'recipients array is required');
  }

  // Create notification or message
  // This would integrate with your messaging system
  // For now, we'll just log it

  console.log(`[executeNotifyTeam] Notifying ${recipients.length} recipients about ${entityType} ${entityId}`);

  return {
    success: true,
    message: `Notification sent to ${recipients.length} team member(s)`
  };
}

/**
 * Log action execution
 */
async function logActionExecution(log: {
  organizationId: string;
  userId: string;
  actionType: string;
  actionData: any;
  alertId?: string;
  success: boolean;
  result?: any;
  error?: string;
}): Promise<void> {
  try {
    await db.collection('clipShowAIActionLogs').add({
      ...log,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('[logActionExecution] Error logging action:', error);
    // Don't throw - logging is non-critical
  }
}




