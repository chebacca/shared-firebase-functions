/**
 * Team Context Service
 * 
 * Aggregates team member data for the AI Agent.
 * Queries the teamMembers collection to provide organization roster information.
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface TeamContext {
    totalMembers: number;
    activeMembers: number;
    pendingMembers: number;
    ownerCount: number;
    adminCount: number;
    memberCount: number;
    viewerCount: number;
    recentlyActive: number; // Members active in last 30 days
}

/**
 * Gather Team Context for an Organization
 * 
 * Queries the teamMembers collection to get roster statistics.
 */
export async function gatherTeamContext(
    organizationId: string
): Promise<TeamContext> {
    try {
        // Query teamMembers collection
        const teamMembersRef = db.collection('teamMembers');
        const snapshot = await teamMembersRef
            .where('organizationId', '==', organizationId)
            .get();

        const members = snapshot.docs.map(doc => doc.data());

        // Calculate statistics
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const context: TeamContext = {
            totalMembers: members.length,
            activeMembers: members.filter(m => m.status === 'ACTIVE').length,
            pendingMembers: members.filter(m => m.status === 'PENDING').length,
            ownerCount: members.filter(m => m.role === 'OWNER').length,
            adminCount: members.filter(m => m.role === 'ADMIN').length,
            memberCount: members.filter(m => m.role === 'MEMBER').length,
            viewerCount: members.filter(m => m.role === 'VIEWER').length,
            recentlyActive: members.filter(m => {
                if (!m.lastActive) return false;
                const lastActive = m.lastActive.toDate ? m.lastActive.toDate() : new Date(m.lastActive);
                return lastActive >= thirtyDaysAgo;
            }).length
        };

        console.log(`📊 [Team Context] Organization ${organizationId}: ${context.totalMembers} total members, ${context.activeMembers} active`);

        return context;

    } catch (error) {
        console.error('❌ [Team Context] Error gathering team context:', error);

        // Return empty context on error
        return {
            totalMembers: 0,
            activeMembers: 0,
            pendingMembers: 0,
            ownerCount: 0,
            adminCount: 0,
            memberCount: 0,
            viewerCount: 0,
            recentlyActive: 0
        };
    }
}
