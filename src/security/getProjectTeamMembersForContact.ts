/**
 * Get Project Team Members For Contact
 * Get team members with contact info for a project
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

interface GetProjectTeamMembersForContactRequest {
    projectId: string;
    organizationId: string;
    limit?: number;
}

// Firebase Callable function
export const getProjectTeamMembersForContact = onCall(
    {
        region: 'us-central1',
        memory: '512MiB',
        timeoutSeconds: 30,
        invoker: 'public',
        cors: true,
    },
    async (request) => {
        try {
            const data = request.data as GetProjectTeamMembersForContactRequest;

            if (!data.projectId) {
                throw new Error('projectId is required');
            }
            if (!data.organizationId) {
                throw new Error('organizationId is required');
            }

            // Query projectTeamMembers collection
            const projectTeamMembersSnapshot = await db
                .collection('projectTeamMembers')
                .where('projectId', '==', data.projectId)
                .where('organizationId', '==', data.organizationId)
                .get();

            const contacts: any[] = [];

            // Enrich with team member details
            for (const assignmentDoc of projectTeamMembersSnapshot.docs) {
                const assignmentData = assignmentDoc.data();
                const teamMemberId = assignmentData.teamMemberId;

                if (!teamMemberId) continue;

                // Get team member details
                let teamMemberData: any = null;
                try {
                    const teamMemberDoc = await db.collection('teamMembers').doc(teamMemberId).get();
                    if (teamMemberDoc.exists) {
                        teamMemberData = { id: teamMemberDoc.id, ...teamMemberDoc.data() };
                    }
                } catch (error) {
                    console.error(`Error fetching team member ${teamMemberId}:`, error);
                    continue;
                }

                if (!teamMemberData) continue;

                // Build contact info
                const name = teamMemberData.name ||
                    teamMemberData.displayName ||
                    `${teamMemberData.firstName || ''} ${teamMemberData.lastName || ''}`.trim() ||
                    teamMemberData.email ||
                    'Unknown';

                const contact = {
                    id: assignmentDoc.id,
                    teamMemberId: teamMemberId,
                    userId: teamMemberData.userId || teamMemberData.id,
                    name: name,
                    email: teamMemberData.email || assignmentData.teamMemberEmail || '',
                    phoneNumber: teamMemberData.phoneNumber || teamMemberData.phone || '',
                    role: assignmentData.role || teamMemberData.role || 'MEMBER',
                    department: teamMemberData.department || assignmentData.department,
                    projectRole: assignmentData.projectRole || assignmentData.teamMemberRole,
                    hierarchy: assignmentData.hierarchy || assignmentData.projectHierarchy || 0,
                    canManageProject: (assignmentData.hierarchy || assignmentData.projectHierarchy || 0) >= 70,
                };

                contacts.push(contact);
            }

            // Sort by hierarchy (highest first) and role priority
            contacts.sort((a, b) => {
                const hierarchyDiff = (b.hierarchy || 0) - (a.hierarchy || 0);
                if (hierarchyDiff !== 0) return hierarchyDiff;

                const rolePriority: { [key: string]: number } = {
                    'PRODUCER': 100,
                    'COORDINATOR': 80,
                    'MANAGER': 60,
                    'SUPERVISOR': 50,
                    'LEAD': 40,
                    'MEMBER': 20,
                };

                const aPriority = rolePriority[a.role?.toUpperCase() || ''] || 0;
                const bPriority = rolePriority[b.role?.toUpperCase() || ''] || 0;
                return bPriority - aPriority;
            });

            // Filter to only contacts with phone or email, and apply limit
            const contactable = contacts.filter(c => c.phoneNumber || c.email);
            const limited = data.limit ? contactable.slice(0, data.limit) : contactable;

            return createSuccessResponse({
                success: true,
                contacts: limited,
                total: contactable.length,
            }, `Found ${limited.length} contactable team members`);
        } catch (error) {
            return handleError(error, 'getProjectTeamMembersForContact');
        }
    }
);

// HTTP function
export const getProjectTeamMembersForContactHttp = onRequest(
    {
        region: 'us-central1',
        memory: '512MiB',
        timeoutSeconds: 30,
        invoker: 'public',
        cors: false,
    },
    async (req, res) => {
        // Handle OPTIONS preflight request
        if (req.method === 'OPTIONS') {
            setCorsHeaders(req, res);
            res.status(204).send('');
            return;
        }

        // Set CORS headers for all responses
        setCorsHeaders(req, res);

        try {
            const data = req.body as GetProjectTeamMembersForContactRequest;

            if (!data.projectId) {
                res.status(400).json(createErrorResponse('projectId is required'));
                return;
            }
            if (!data.organizationId) {
                res.status(400).json(createErrorResponse('organizationId is required'));
                return;
            }

            // Query projectTeamMembers collection
            const projectTeamMembersSnapshot = await db
                .collection('projectTeamMembers')
                .where('projectId', '==', data.projectId)
                .where('organizationId', '==', data.organizationId)
                .get();

            const contacts: any[] = [];

            // Enrich with team member details
            for (const assignmentDoc of projectTeamMembersSnapshot.docs) {
                const assignmentData = assignmentDoc.data();
                const teamMemberId = assignmentData.teamMemberId;

                if (!teamMemberId) continue;

                // Get team member details
                let teamMemberData: any = null;
                try {
                    const teamMemberDoc = await db.collection('teamMembers').doc(teamMemberId).get();
                    if (teamMemberDoc.exists) {
                        teamMemberData = { id: teamMemberDoc.id, ...teamMemberDoc.data() };
                    }
                } catch (error) {
                    console.error(`Error fetching team member ${teamMemberId}:`, error);
                    continue;
                }

                if (!teamMemberData) continue;

                // Build contact info
                const name = teamMemberData.name ||
                    teamMemberData.displayName ||
                    `${teamMemberData.firstName || ''} ${teamMemberData.lastName || ''}`.trim() ||
                    teamMemberData.email ||
                    'Unknown';

                const contact = {
                    id: assignmentDoc.id,
                    teamMemberId: teamMemberId,
                    userId: teamMemberData.userId || teamMemberData.id,
                    name: name,
                    email: teamMemberData.email || assignmentData.teamMemberEmail || '',
                    phoneNumber: teamMemberData.phoneNumber || teamMemberData.phone || '',
                    role: assignmentData.role || teamMemberData.role || 'MEMBER',
                    department: teamMemberData.department || assignmentData.department,
                    projectRole: assignmentData.projectRole || assignmentData.teamMemberRole,
                    hierarchy: assignmentData.hierarchy || assignmentData.projectHierarchy || 0,
                    canManageProject: (assignmentData.hierarchy || assignmentData.projectHierarchy || 0) >= 70,
                };

                contacts.push(contact);
            }

            // Sort by hierarchy (highest first) and role priority
            contacts.sort((a, b) => {
                const hierarchyDiff = (b.hierarchy || 0) - (a.hierarchy || 0);
                if (hierarchyDiff !== 0) return hierarchyDiff;

                const rolePriority: { [key: string]: number } = {
                    'PRODUCER': 100,
                    'COORDINATOR': 80,
                    'MANAGER': 60,
                    'SUPERVISOR': 50,
                    'LEAD': 40,
                    'MEMBER': 20,
                };

                const aPriority = rolePriority[a.role?.toUpperCase() || ''] || 0;
                const bPriority = rolePriority[b.role?.toUpperCase() || ''] || 0;
                return bPriority - aPriority;
            });

            // Filter to only contacts with phone or email, and apply limit
            const contactable = contacts.filter(c => c.phoneNumber || c.email);
            const limited = data.limit ? contactable.slice(0, data.limit) : contactable;

            res.status(200).json(createSuccessResponse({
                success: true,
                contacts: limited,
                total: contactable.length,
            }, `Found ${limited.length} contactable team members`));
        } catch (error) {
            res.status(500).json(handleError(error, 'getProjectTeamMembersForContactHttp'));
        }
    }
);
