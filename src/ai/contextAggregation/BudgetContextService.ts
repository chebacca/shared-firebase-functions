/**
 * Budget Context Service
 * 
 * Aggregates budget context from Budgeting system
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface BudgetContext {
    totalBudgets: number;
    activeBudgets: number;
    totalBudgeted: number;
    totalSpent: number;
    budgets: Array<{
        id: string;
        name: string;
        status: string;
        totalAmount: number;
        spentAmount: number;
        updatedAt?: string;
    }>;
}

/**
 * Gather Budget context for an organization
 */
export async function gatherBudgetContext(
    organizationId: string
): Promise<BudgetContext> {
    const budgetsSnapshot = await db
        .collection('budgets')
        .where('organizationId', '==', organizationId)
        .get();

    let totalBudgeted = 0;
    let totalSpent = 0;

    const budgets = budgetsSnapshot.docs.map(doc => {
        const data = doc.data();
        const total = Number(data.totalAmount || data.budgetTotal || 0);
        const spent = Number(data.spentAmount || data.actualSpent || 0);

        totalBudgeted += total;
        totalSpent += spent;

        return {
            id: doc.id,
            name: data.name || data.budgetName || 'Unnamed Budget',
            status: data.status || 'draft',
            totalAmount: total,
            spentAmount: spent,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString()
        };
    });

    const activeBudgets = budgets.filter(b =>
        b.status === 'active' || b.status === 'approved'
    );

    return {
        totalBudgets: budgets.length,
        activeBudgets: activeBudgets.length,
        totalBudgeted,
        totalSpent,
        budgets
    };
}
