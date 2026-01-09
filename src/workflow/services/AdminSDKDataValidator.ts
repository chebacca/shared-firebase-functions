/**
 * 🔐 ADMIN SDK DATA VALIDATOR
 * 
 * Minimal Admin SDK enhancement for server-side validation gaps.
 * Works WITH existing client-side system, doesn't replace it.
 * 
 * KEY FEATURES:
 * - Server-side dataset assignment validation
 * - Custom claims enhancement
 * - Audit trail for data access
 * - Cross-collection consistency checks
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Lazy initialization to avoid issues during deployment
let db: any = null;
let auth: any = null;

const getDb = () => {
  if (!db) db = getFirestore();
  return db;
};

const getAuthInstance = () => {
  if (!auth) auth = getAuth();
  return auth;
};

export interface DataAccessValidationResult {
  isValid: boolean;
  reason: string;
  datasetId?: string;
  scopedCollectionName?: string;
  auditId?: string;
}

export interface ProjectDatasetAssignment {
  id: string;
  projectId: string;
  datasetId: string;
  assignedCollections: string[];
  organizationId: string;
  tenantId: string;
  isActive: boolean;
  routingEnabled: boolean;
}

/**
 * Admin SDK Data Validator - Server-side validation for data access gaps
 */
export class AdminSDKDataValidator {
  private static instance: AdminSDKDataValidator;
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  public static getInstance(): AdminSDKDataValidator {
    if (!AdminSDKDataValidator.instance) {
      AdminSDKDataValidator.instance = new AdminSDKDataValidator();
    }
    return AdminSDKDataValidator.instance;
  }

  /**
   * GAP FIX #1: Server-side dataset assignment validation
   * Validates that a user can access a collection through dataset assignments
   */
  async validateDatasetAccess(
    uid: string,
    projectId: string,
    collectionName: string,
    organizationId: string
  ): Promise<DataAccessValidationResult> {
    try {
      console.log(`🔐 [AdminSDK] Validating dataset access: ${uid} -> ${projectId}/${collectionName}`);

      // 1. Get user's custom claims for organization validation
      const userRecord = await getAuthInstance().getUser(uid);
      const customClaims = userRecord.customClaims || {};
      
      if (customClaims.organizationId !== organizationId) {
        return {
          isValid: false,
          reason: 'User does not belong to the specified organization',
          auditId: await this.createAuditLog(uid, 'DATASET_ACCESS_DENIED', {
            reason: 'Organization mismatch',
            projectId,
            collectionName,
            organizationId
          })
        };
      }

      // 2. Get project dataset assignments (server-side validation)
      const assignments = await this.getProjectDatasetAssignments(projectId, organizationId);
      
      if (assignments.length === 0) {
        return {
          isValid: false,
          reason: 'No dataset assignments found for project',
          auditId: await this.createAuditLog(uid, 'DATASET_ACCESS_DENIED', {
            reason: 'No dataset assignments',
            projectId,
            collectionName,
            organizationId
          })
        };
      }

      // 3. Check if collection is assigned to any dataset
      const relevantAssignment = assignments.find(assignment => 
        assignment.assignedCollections?.includes(collectionName)
      );

      if (!relevantAssignment) {
        return {
          isValid: false,
          reason: `Collection ${collectionName} not assigned to any dataset`,
          auditId: await this.createAuditLog(uid, 'DATASET_ACCESS_DENIED', {
            reason: 'Collection not assigned',
            projectId,
            collectionName,
            organizationId,
            availableCollections: assignments.flatMap(a => a.assignedCollections)
          })
        };
      }

      // 4. Generate scoped collection name if routing enabled
      const scopedCollectionName = relevantAssignment.routingEnabled
        ? `${collectionName}_${organizationId}_${relevantAssignment.datasetId}`
        : collectionName;

      // 5. Log successful access
      const auditId = await this.createAuditLog(uid, 'DATASET_ACCESS_GRANTED', {
        projectId,
        collectionName,
        datasetId: relevantAssignment.datasetId,
        scopedCollectionName,
        organizationId
      });

      return {
        isValid: true,
        reason: `Access granted via dataset ${relevantAssignment.datasetId}`,
        datasetId: relevantAssignment.datasetId,
        scopedCollectionName,
        auditId
      };

    } catch (error) {
      console.error('🚨 [AdminSDK] Dataset validation error:', error);
      
      await this.createAuditLog(uid, 'DATASET_ACCESS_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId,
        collectionName,
        organizationId
      });

      // Fail secure - deny access on error
      return {
        isValid: false,
        reason: 'Server-side validation error'
      };
    }
  }

  /**
   * GAP FIX #2: Enhanced custom claims with dataset permissions
   * Updates user's custom claims to include dataset access information
   */
  async enhanceCustomClaims(uid: string, additionalClaims: Record<string, any> = {}): Promise<void> {
    try {
      console.log(`🔐 [AdminSDK] Enhancing custom claims for user: ${uid}`);

      // Get current user data
      const userRecord = await getAuthInstance().getUser(uid);
      const currentClaims = userRecord.customClaims || {};

      // Get user's organization and project assignments
      const userDoc = await getDb().collection('users').doc(uid).get();
      const userData = userDoc.data();

      if (!userData) {
        throw new Error('User data not found');
      }

      // Get user's accessible datasets
      const accessibleDatasets = await this.getUserAccessibleDatasets(uid, userData.organizationId);

      // Enhanced custom claims
      const enhancedClaims = {
        ...currentClaims,
        ...additionalClaims,
        // Basic identity
        email: userData.email,
        role: userData.role || 'USER',
        organizationId: userData.organizationId,
        
        // Dataset permissions (NEW)
        accessibleDatasets: accessibleDatasets.map(d => d.id),
        datasetPermissions: accessibleDatasets.reduce((acc, dataset) => {
          acc[dataset.id] = {
            collections: dataset.assignedCollections,
            routingEnabled: dataset.routingEnabled
          };
          return acc;
        }, {} as Record<string, any>),
        
        // Hierarchy information (if available)
        hierarchy: userData.hierarchy || 10,
        effectiveHierarchy: Math.max(userData.hierarchy || 10, currentClaims.effectiveHierarchy || 10),
        
        // Timestamps
        claimsUpdatedAt: FieldValue.serverTimestamp(),
        lastValidatedAt: FieldValue.serverTimestamp()
      };

      // Update custom claims
      await getAuthInstance().setCustomUserClaims(uid, enhancedClaims);
      
      console.log(`✅ [AdminSDK] Enhanced custom claims updated for ${uid}`);

    } catch (error) {
      console.error('🚨 [AdminSDK] Custom claims enhancement error:', error);
      throw error;
    }
  }

  /**
   * GAP FIX #3: Cross-collection consistency validation
   * Validates that dataset assignments are consistent across collections
   */
  async validateDatasetConsistency(datasetId: string, organizationId: string): Promise<{
    isConsistent: boolean;
    issues: string[];
  }> {
    try {
      console.log(`🔐 [AdminSDK] Validating dataset consistency: ${datasetId}`);

      const issues: string[] = [];

      // 1. Check dataset exists
      const datasetDoc = await getDb().collection('datasets').doc(datasetId).get();
      if (!datasetDoc.exists) {
        issues.push('Dataset does not exist');
        return { isConsistent: false, issues };
      }

      const datasetData = datasetDoc.data()!;
      
      // 2. Validate organization consistency
      if (datasetData.organizationId !== organizationId) {
        issues.push('Dataset organization mismatch');
      }

      // 3. Check project assignments
      const assignmentsQuery = await getDb().collection('project_datasets')
        .where('datasetId', '==', datasetId)
        .where('organizationId', '==', organizationId)
        .get();

      if (assignmentsQuery.empty) {
        issues.push('Dataset has no project assignments');
      }

      // 4. Validate assigned collections exist in dataset
      for (const assignmentDoc of assignmentsQuery.docs) {
        const assignment = assignmentDoc.data();
        const assignedCollections = assignment.assignedCollections || [];
        const datasetCollections = datasetData.collections || [];

        const invalidCollections = assignedCollections.filter(
          (col: string) => !datasetCollections.includes(col)
        );

        if (invalidCollections.length > 0) {
          issues.push(`Assignment ${assignmentDoc.id} references invalid collections: ${invalidCollections.join(', ')}`);
        }
      }

      return {
        isConsistent: issues.length === 0,
        issues
      };

    } catch (error) {
      console.error('🚨 [AdminSDK] Consistency validation error:', error);
      return {
        isConsistent: false,
        issues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * GAP FIX #4: Audit trail for data access
   * Creates audit logs for all data access attempts
   */
  private async createAuditLog(
    uid: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<string> {
    try {
      const auditDoc = await getDb().collection('audit_logs').add({
        userId: uid,
        action,
        metadata,
        timestamp: FieldValue.serverTimestamp(),
        source: 'AdminSDKDataValidator',
        ipAddress: null, // Would be populated from request context
        userAgent: null  // Would be populated from request context
      });

      return auditDoc.id;
    } catch (error) {
      console.error('🚨 [AdminSDK] Audit log creation failed:', error);
      return 'audit-failed';
    }
  }

  /**
   * Helper: Get project dataset assignments with caching
   */
  private async getProjectDatasetAssignments(
    projectId: string,
    organizationId: string
  ): Promise<ProjectDatasetAssignment[]> {
    const cacheKey = `assignments:${projectId}:${organizationId}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // Query project_datasets collection
      const assignmentsQuery = await getDb().collection('project_datasets')
        .where('projectId', '==', projectId)
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .get();

      const assignments: ProjectDatasetAssignment[] = [];

      for (const doc of assignmentsQuery.docs) {
        const data = doc.data();
        assignments.push({
          id: doc.id,
          projectId: data.projectId,
          datasetId: data.datasetId,
          assignedCollections: data.assignedCollections || [],
          organizationId: data.organizationId,
          tenantId: data.tenantId,
          isActive: data.isActive,
          routingEnabled: data.collectionAssignment?.routingEnabled || false
        });
      }

      // Cache results
      this.cache.set(cacheKey, {
        data: assignments,
        timestamp: Date.now()
      });

      return assignments;

    } catch (error) {
      console.error('🚨 [AdminSDK] Error fetching dataset assignments:', error);
      return [];
    }
  }

  /**
   * Helper: Get user's accessible datasets
   */
  private async getUserAccessibleDatasets(uid: string, organizationId: string): Promise<any[]> {
    try {
      // Get user's project assignments
      const userProjectsQuery = await getDb().collection('project_participants')
        .where('userId', '==', uid)
        .where('organizationId', '==', organizationId)
        .get();

      const projectIds = userProjectsQuery.docs.map((doc: any) => doc.data().projectId);

      if (projectIds.length === 0) {
        return [];
      }

      // Get datasets for user's projects
      const datasets: any[] = [];
      
      for (const projectId of projectIds) {
        const assignments = await this.getProjectDatasetAssignments(projectId, organizationId);
        datasets.push(...assignments);
      }

      // Remove duplicates
      const uniqueDatasets = datasets.filter((dataset, index, self) =>
        index === self.findIndex(d => d.datasetId === dataset.datasetId)
      );

      return uniqueDatasets;

    } catch (error) {
      console.error('🚨 [AdminSDK] Error fetching user datasets:', error);
      return [];
    }
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  public clearCache(): void {
    this.cache.clear();
    console.log('🔐 [AdminSDK] Cache cleared');
  }
}

// Export singleton instance
export const adminSDKDataValidator = AdminSDKDataValidator.getInstance();
