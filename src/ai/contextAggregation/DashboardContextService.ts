/**
 * Dashboard Context Service
 * 
 * Aggregates project context from Dashboard app
 * Follows the same query patterns as the Dashboard frontend
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface DashboardContext {
  activeProjects: number;
  totalProjects: number;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    client?: string;
    updatedAt?: string;
    createdAt?: string;
  }>;
}

/**
 * Gather Dashboard context for an organization
 * Queries projects collection using the same pattern as Dashboard app
 */
export async function gatherDashboardContext(
  organizationId: string
): Promise<DashboardContext> {
  // Query projects using the same pattern as Dashboard functions
  // Pattern: db.collection('projects').where('organizationId', '==', organizationId)
  const projectsSnapshot = await db
    .collection('projects')
    .where('organizationId', '==', organizationId)
    .get();

  const projects = projectsSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || 'Untitled Project',
      status: data.status || 'unknown',
      client: data.clientName || data.client,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString(),
      createdAt: data.createdAt?.toDate?.()?.toISOString()
    };
  });

  // Filter active projects (matching Dashboard logic)
  const activeProjects = projects.filter(p => 
    p.status === 'active' || 
    p.status === 'in_progress' ||
    p.status === 'Active'
  );

  return {
    activeProjects: activeProjects.length,
    totalProjects: projects.length,
    projects
  };
}
