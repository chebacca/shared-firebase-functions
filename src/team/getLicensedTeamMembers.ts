/**
 * Get Licensed Team Members Function
 * 
 * Retrieves team members with active licenses
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const getLicensedTeamMembers = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req: any, res: any): Promise<void> => {
    try {
      const { organizationId, licenseType, includeInactive = false } = req.body;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`👥 [LICENSED TEAM] Getting licensed team members for org: ${organizationId}`);

      // Get team members
      let teamMembersQuery = db.collection('teamMembers')
        .where('organizationId', '==', organizationId);

      if (!includeInactive) {
        teamMembersQuery = teamMembersQuery.where('isActive', '==', true);
      }

      const teamMembersSnapshot = await teamMembersQuery.get();
      
      const licensedTeamMembers = [];
      
      for (const doc of teamMembersSnapshot.docs) {
        const teamMemberData = doc.data();
        
        // Get user details
        const userDoc = await db.collection('users').doc(teamMemberData.userId).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        
        // Get user's licenses
        const licensesQuery = await db.collection('licenses')
          .where('userId', '==', teamMemberData.userId)
          .where('organizationId', '==', organizationId)
          .where('status', '==', 'active')
          .get();
        
        const activeLicenses: any[] = [];
        licensesQuery.forEach(licenseDoc => {
          const licenseData = licenseDoc.data();
          activeLicenses.push({
            id: licenseDoc.id,
            type: licenseData.type,
            status: licenseData.status,
            expiresAt: licenseData.expiresAt,
            features: licenseData.features || []
          });
        });
        
        // Filter by license type if specified
        if (licenseType && activeLicenses.length > 0) {
          const hasLicenseType = activeLicenses.some(license => 
            license.type === licenseType || license.type === licenseType.toUpperCase()
          );
          
          if (!hasLicenseType) {
            continue;
          }
        }
        
        // Only include team members with active licenses
        if (activeLicenses.length > 0) {
          licensedTeamMembers.push({
            teamMemberId: doc.id,
            userId: teamMemberData.userId,
            email: userData?.email || 'Unknown',
            displayName: userData?.displayName || 'Unknown',
            organizationRole: teamMemberData.role,
            hierarchy: teamMemberData.hierarchy,
            isActive: teamMemberData.isActive,
            licenses: activeLicenses,
            primaryLicense: activeLicenses[0], // First license as primary
            hasLicense: true,
            licenseCount: activeLicenses.length,
            createdAt: teamMemberData.createdAt,
            updatedAt: teamMemberData.updatedAt
          });
        }
      }

      // Sort by hierarchy (highest first)
      licensedTeamMembers.sort((a, b) => (b.hierarchy || 0) - (a.hierarchy || 0));

      console.log(`👥 [LICENSED TEAM] Found ${licensedTeamMembers.length} licensed team members for org: ${organizationId}`);

      res.status(200).json(createSuccessResponse({
        organizationId,
        licenseType,
        teamMembers: licensedTeamMembers,
        count: licensedTeamMembers.length,
        includeInactive
      }, 'Licensed team members retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [LICENSED TEAM] Error:', error);
      res.status(500).json(handleError(error, 'getLicensedTeamMembers'));
    }
  }
);
