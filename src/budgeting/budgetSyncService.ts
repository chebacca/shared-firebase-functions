/**
 * Budget Sync Service
 * 
 * Shared service for syncing timecards to budgets
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface TimecardData {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  organizationId: string;
  projectId?: string;
  weekStartDate?: string;
  status: string;
  stats?: {
    totalRegularHours: number;
    totalOvertimeHours: number;
    totalDoubleTimeHours: number;
    totalHours: number;
    totalPay?: number;
  };
  totalHours?: number;
  totalPay?: number;
  hourlyRate?: number;
  overtimeRate?: number;
  doubleTimeRate?: number;
  department?: string;
  role?: string;
  entries?: any[];
  approvedAt?: any;
  approvedBy?: string;
}

export interface BudgetLineItemData {
  budgetId: string;
  category: 'below_the_line' | 'above_the_line' | 'post_production' | 'contingency' | 'fringes' | 'tax_incentives';
  subcategory: string;
  description: string;
  budgetedAmount: number;
  actualAmount: number;
  committedAmount: number;
  unit: 'hours' | 'days' | 'flat' | 'per_unit';
  quantity?: number;
  rate?: number;
  department?: string;
  phase: 'pre_production' | 'production' | 'post_production';
  notes?: string;
}

/**
 * Determine budget phase based on timecard date
 */
function determinePhase(timecardDate: string | Date): 'pre_production' | 'production' | 'post_production' {
  // Default to production for now
  // In a real system, this would check project dates
  return 'production';
}

/**
 * Determine subcategory based on user role
 */
function determineSubcategory(role?: string): string {
  const roleUpper = (role || '').toUpperCase();
  
  if (roleUpper.includes('TALENT') || roleUpper.includes('ACTOR')) {
    return 'talent';
  } else if (roleUpper.includes('DIRECTOR') || roleUpper.includes('PRODUCER') || roleUpper.includes('EXEC')) {
    return 'above_the_line';
  } else if (roleUpper.includes('CREW') || roleUpper.includes('TECHNICIAN')) {
    return 'crew';
  } else {
    return 'labor';
  }
}

/**
 * Sync approved timecard to budget
 */
export async function syncApprovedTimecardToBudget(timecardId: string): Promise<void> {
  try {
    console.log(`🔄 [BUDGET SYNC] Syncing timecard ${timecardId} to budget...`);

    // Get timecard
    const timecardDoc = await db.collection('timecards').doc(timecardId).get();
    if (!timecardDoc.exists) {
      throw new Error(`Timecard ${timecardId} not found`);
    }

    const timecard = { id: timecardDoc.id, ...timecardDoc.data() } as TimecardData;

    if (timecard.status !== 'approved') {
      console.log(`⚠️ [BUDGET SYNC] Timecard ${timecardId} is not approved (status: ${timecard.status}), skipping sync`);
      return;
    }

    // Check if already synced
    if (timecardDoc.data()?.budgetSyncedAt) {
      console.log(`ℹ️ [BUDGET SYNC] Timecard ${timecardId} already synced, skipping`);
      return;
    }

    // Find associated budget
    const budgetId = await findBudgetForTimecard(timecard);
    if (!budgetId) {
      console.log(`⚠️ [BUDGET SYNC] No budget found for timecard ${timecardId}, skipping sync`);
      return;
    }

    // Create or update budget line item
    await createOrUpdateBudgetLineItem(budgetId, timecard);

    // Update budget totals
    await updateBudgetFromTimecard(budgetId, timecard);

    // Mark timecard as synced
    await db.collection('timecards').doc(timecardId).update({
      budgetSyncedAt: new Date(),
      budgetSyncedTo: budgetId
    });

    console.log(`✅ [BUDGET SYNC] Successfully synced timecard ${timecardId} to budget ${budgetId}`);
  } catch (error: any) {
    console.error(`❌ [BUDGET SYNC] Error syncing timecard ${timecardId}:`, error);
    throw error;
  }
}

/**
 * Find budget for timecard (via projectId or organizationId)
 */
async function findBudgetForTimecard(timecard: TimecardData): Promise<string | null> {
  try {
    // First try to find budget by projectId
    if (timecard.projectId) {
      const budgetsByProject = await db.collection('production_budgets')
        .where('projectId', '==', timecard.projectId)
        .where('organizationId', '==', timecard.organizationId)
        .where('status', 'in', ['draft', 'approved', 'active'])
        .limit(1)
        .get();

      if (!budgetsByProject.empty) {
        return budgetsByProject.docs[0].id;
      }
    }

    // Fallback: find any active budget for organization
    const budgetsByOrg = await db.collection('production_budgets')
      .where('organizationId', '==', timecard.organizationId)
      .where('status', 'in', ['draft', 'approved', 'active'])
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    if (!budgetsByOrg.empty) {
      return budgetsByOrg.docs[0].id;
    }

    return null;
  } catch (error: any) {
    console.error('[BUDGET SYNC] Error finding budget:', error);
    return null;
  }
}

/**
 * Create or update budget line item from timecard
 */
async function createOrUpdateBudgetLineItem(budgetId: string, timecard: TimecardData): Promise<void> {
  try {
    const totalPay = timecard.totalPay || timecard.stats?.totalPay || 0;
    const totalHours = timecard.totalHours || timecard.stats?.totalHours || 0;
    const hourlyRate = timecard.hourlyRate || 0;

    // Check if line item already exists for this timecard
    const existingLineItems = await db.collection('budget_line_items')
      .where('budgetId', '==', budgetId)
      .where('notes', '==', `Auto-generated from approved timecard ${timecard.id}`)
      .limit(1)
      .get();

    const lineItemData: BudgetLineItemData = {
      budgetId,
      category: 'below_the_line',
      subcategory: determineSubcategory(timecard.role),
      description: `Timecard - ${timecard.userName || timecard.userEmail || 'User'} - Week of ${timecard.weekStartDate || 'N/A'}`,
      budgetedAmount: 0, // Will be set from budget
      actualAmount: totalPay,
      committedAmount: 0,
      unit: 'hours',
      quantity: totalHours,
      rate: hourlyRate,
      department: timecard.department,
      phase: determinePhase(timecard.weekStartDate || new Date()),
      notes: `Auto-generated from approved timecard ${timecard.id}`
    };

    if (!existingLineItems.empty) {
      // Update existing line item
      const existingItem = existingLineItems.docs[0];
      await existingItem.ref.update({
        ...lineItemData,
        actualAmount: totalPay,
        updatedAt: new Date()
      });
      console.log(`📝 [BUDGET SYNC] Updated existing line item ${existingItem.id}`);
    } else {
      // Create new line item
      const newItemRef = await db.collection('budget_line_items').add({
        ...lineItemData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`➕ [BUDGET SYNC] Created new line item ${newItemRef.id}`);
    }
  } catch (error: any) {
    console.error('[BUDGET SYNC] Error creating/updating line item:', error);
    throw error;
  }
}

/**
 * Update budget totals from timecard
 */
export async function updateBudgetFromTimecard(budgetId: string, timecard: TimecardData): Promise<void> {
  try {
    const budgetRef = db.collection('production_budgets').doc(budgetId);
    const budgetDoc = await budgetRef.get();

    if (!budgetDoc.exists) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const budget = budgetDoc.data();
    const totalPay = timecard.totalPay || timecard.stats?.totalPay || 0;
    const phase = determinePhase(timecard.weekStartDate || new Date());

    // Get all approved timecards for this budget to calculate totals
    const allTimecards = await db.collection('timecards')
      .where('organizationId', '==', timecard.organizationId)
      .where('status', '==', 'approved')
      .get();

    let totalActualSpend = 0;
    let totalCommittedSpend = 0;

    // Calculate from all approved timecards
    for (const tcDoc of allTimecards.docs) {
      const tc = tcDoc.data();
      const pay = tc.totalPay || tc.stats?.totalPay || 0;
      
      // Check if this timecard is linked to this budget
      if (tc.projectId && budget?.projectId === tc.projectId) {
        totalActualSpend += pay;
      } else if (!tc.projectId && budget?.organizationId === tc.organizationId) {
        // If no project link, add to org budget
        totalActualSpend += pay;
      }

      // Add committed from submitted timecards
      if (tc.status === 'submitted') {
        const committedPay = tc.totalPay || tc.stats?.totalPay || 0;
        if (tc.projectId && budget?.projectId === tc.projectId) {
          totalCommittedSpend += committedPay;
        } else if (!tc.projectId && budget?.organizationId === tc.organizationId) {
          totalCommittedSpend += committedPay;
        }
      }
    }

    // Update budget
    const currentActualSpend = budget?.actualSpend || 0;
    const currentCommittedSpend = budget?.committedSpend || 0;
    const totalBudget = budget?.totalBudget || 0;

    // Update phase totals
    const phaseData = budget?.phases?.[phase] || {
      budgetedAmount: 0,
      actualAmount: 0,
      committedAmount: 0,
      remainingBudget: 0,
      variance: 0,
      lineItemCount: 0
    };

    // Get line items for this phase
    const phaseLineItems = await db.collection('budget_line_items')
      .where('budgetId', '==', budgetId)
      .where('phase', '==', phase)
      .get();

    const phaseActual = phaseLineItems.docs.reduce((sum, doc) => {
      return sum + (doc.data().actualAmount || 0);
    }, 0);

    const phaseCommitted = phaseLineItems.docs.reduce((sum, doc) => {
      return sum + (doc.data().committedAmount || 0);
    }, 0);

    await budgetRef.update({
      actualSpend: totalActualSpend,
      committedSpend: totalCommittedSpend,
      remainingBudget: totalBudget - totalActualSpend,
      variance: totalActualSpend - totalBudget,
      variancePercentage: totalBudget > 0 ? ((totalActualSpend - totalBudget) / totalBudget) * 100 : 0,
      [`phases.${phase}.actualAmount`]: phaseActual,
      [`phases.${phase}.committedAmount`]: phaseCommitted,
      [`phases.${phase}.remainingBudget`]: (phaseData.budgetedAmount || 0) - phaseActual,
      [`phases.${phase}.variance`]: phaseActual - (phaseData.budgetedAmount || 0),
      [`phases.${phase}.lineItemCount`]: phaseLineItems.size,
      updatedAt: new Date()
    });

    console.log(`💰 [BUDGET SYNC] Updated budget ${budgetId} totals: actual=${totalActualSpend}, committed=${totalCommittedSpend}`);
  } catch (error: any) {
    console.error('[BUDGET SYNC] Error updating budget:', error);
    throw error;
  }
}

/**
 * Update committed amount when timecard is submitted
 */
export async function updateCommittedAmount(timecardId: string): Promise<void> {
  try {
    const timecardDoc = await db.collection('timecards').doc(timecardId).get();
    if (!timecardDoc.exists) {
      return;
    }

    const timecard = { id: timecardDoc.id, ...timecardDoc.data() } as TimecardData;
    if (timecard.status !== 'submitted') {
      return;
    }

    const budgetId = await findBudgetForTimecard(timecard);
    if (!budgetId) {
      return;
    }

    await updateBudgetFromTimecard(budgetId, timecard);
    console.log(`💵 [BUDGET SYNC] Updated committed amount for timecard ${timecardId}`);
  } catch (error: any) {
    console.error('[BUDGET SYNC] Error updating committed amount:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Revert committed amount when timecard is rejected
 */
export async function revertCommittedAmount(timecardId: string): Promise<void> {
  try {
    const timecardDoc = await db.collection('timecards').doc(timecardId).get();
    if (!timecardDoc.exists) {
      return;
    }

    const timecard = { id: timecardDoc.id, ...timecardDoc.data() } as TimecardData;
    const budgetId = await findBudgetForTimecard(timecard);
    if (!budgetId) {
      return;
    }

    // Recalculate committed spend without this timecard
    await updateBudgetFromTimecard(budgetId, timecard);
    console.log(`↩️ [BUDGET SYNC] Reverted committed amount for timecard ${timecardId}`);
  } catch (error: any) {
    console.error('[BUDGET SYNC] Error reverting committed amount:', error);
    // Don't throw - this is a non-critical operation
  }
}

