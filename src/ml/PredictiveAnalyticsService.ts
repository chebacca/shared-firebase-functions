/**
 * Predictive Analytics Service
 * 
 * Provides predictive capabilities for budgets, resources, and project timelines.
 * Uses historical data and ML models to forecast future outcomes.
 */

import { getFirestore } from 'firebase-admin/firestore';

export interface BudgetPrediction {
  predictedCompletionCost: number;
  currentSpent: number;
  remainingBudget: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
  confidence: number;
  projectedCompletionDate?: Date;
  variance?: number;
}

export interface SpendingForecast {
  dailySpending: Array<{
    date: Date;
    amount: number;
  }>;
  totalForecast: number;
  variance: number;
  confidence: number;
}

export interface AvailabilityPrediction {
  availableDates: Date[];
  conflictDates: Date[];
  utilizationRate: number;
  recommendations: string[];
  confidence: number;
}

export interface ResourceRequirement {
  resourceId: string;
  resourceType: 'person' | 'equipment' | 'location';
  requiredDates: Date[];
  skills?: string[];
  specifications?: Record<string, any>;
}

export interface OptimalSchedule {
  assignments: Array<{
    resourceId: string;
    dates: Date[];
    score: number;
  }>;
  conflicts: Array<{
    resourceId: string;
    date: Date;
    reason: string;
  }>;
  totalScore: number;
}

export class PredictiveAnalyticsService {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    this.db = getFirestore();
  }

  /**
   * Predict budget health for a project
   * @param projectId - Project ID
   * @param organizationId - Organization ID for validation (optional, but recommended for security)
   */
  async predictBudgetHealth(projectId: string, organizationId?: string): Promise<BudgetPrediction> {
    try {
      // Get project data
      const projectDoc = await this.db.collection('projects').doc(projectId).get();
      if (!projectDoc.exists) {
        throw new Error(`Project ${projectId} not found`);
      }

      const project = projectDoc.data();

      // Validate project belongs to organization if provided
      if (organizationId && project?.organizationId !== organizationId) {
        throw new Error('Project does not belong to your organization');
      }

      // Get budget data
      const budgetsSnapshot = await this.db
        .collection('budgets')
        .where('projectId', '==', projectId)
        .get();

      if (budgetsSnapshot.empty) {
        return {
          predictedCompletionCost: 0,
          currentSpent: 0,
          remainingBudget: 0,
          riskLevel: 'low',
          recommendations: ['No budget data available for prediction'],
          confidence: 0
        };
      }

      // Get actual spending
      const invoicesSnapshot = await this.db
        .collection('invoices')
        .where('projectId', '==', projectId)
        .get();

      const paymentsSnapshot = await this.db
        .collection('payments')
        .where('projectId', '==', projectId)
        .get();

      // Calculate current spending
      let currentSpent = 0;
      invoicesSnapshot.forEach(doc => {
        const invoice = doc.data();
        currentSpent += invoice.amount || 0;
      });

      paymentsSnapshot.forEach(doc => {
        const payment = doc.data();
        currentSpent += payment.amount || 0;
      });

      // Get budget total
      let budgetTotal = 0;
      budgetsSnapshot.forEach(doc => {
        const budget = doc.data();
        budgetTotal += budget.total || budget.amount || 0;
      });

      // Simple prediction based on spending rate
      // In production, use ML models for more accurate predictions
      const remainingBudget = budgetTotal - currentSpent;
      const spendingRate = currentSpent / (budgetTotal || 1);
      
      // Predict completion cost (simple linear projection)
      const predictedCompletionCost = currentSpent + (remainingBudget * 0.8); // Assume 80% of remaining will be spent
      
      // Calculate risk level
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (spendingRate > 0.9) {
        riskLevel = 'high';
      } else if (spendingRate > 0.7) {
        riskLevel = 'medium';
      }

      // Generate recommendations
      const recommendations: string[] = [];
      if (spendingRate > 0.8) {
        recommendations.push('Budget is over 80% spent. Review remaining expenses carefully.');
      }
      if (predictedCompletionCost > budgetTotal) {
        recommendations.push('Predicted completion cost exceeds budget. Consider cost reduction measures.');
      }
      if (recommendations.length === 0) {
        recommendations.push('Budget is on track. Continue monitoring spending.');
      }

      return {
        predictedCompletionCost,
        currentSpent,
        remainingBudget,
        riskLevel,
        recommendations,
        confidence: 0.7, // Basic confidence for simple model
        variance: predictedCompletionCost - budgetTotal
      };
    } catch (error) {
      console.error('Error predicting budget health:', error);
      throw error;
    }
  }

  /**
   * Forecast spending for a project
   * @param projectId - Project ID
   * @param days - Number of days to forecast
   * @param organizationId - Organization ID for validation (optional, but recommended for security)
   */
  async forecastSpending(
    projectId: string,
    days: number = 30,
    organizationId?: string
  ): Promise<SpendingForecast> {
    try {
      // Validate project belongs to organization if provided
      if (organizationId) {
        const projectDoc = await this.db.collection('projects').doc(projectId).get();
        if (!projectDoc.exists) {
          throw new Error(`Project ${projectId} not found`);
        }
        const project = projectDoc.data();
        if (project?.organizationId !== organizationId) {
          throw new Error('Project does not belong to your organization');
        }
      }

      // Get historical spending data
      const paymentsSnapshot = await this.db
        .collection('payments')
        .where('projectId', '==', projectId)
        .orderBy('date', 'desc')
        .limit(30) // Last 30 payments
        .get();

      if (paymentsSnapshot.empty) {
        return {
          dailySpending: [],
          totalForecast: 0,
          variance: 0,
          confidence: 0
        };
      }

      // Calculate average daily spending
      const payments: number[] = [];
      paymentsSnapshot.forEach(doc => {
        const payment = doc.data();
        payments.push(payment.amount || 0);
      });

      const avgDailySpending = payments.reduce((a, b) => a + b, 0) / payments.length;

      // Generate forecast
      const dailySpending: Array<{ date: Date; amount: number }> = [];
      const today = new Date();
      
      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        
        // Add some variance to daily spending
        const variance = (Math.random() - 0.5) * 0.2; // ±10% variance
        const amount = avgDailySpending * (1 + variance);
        
        dailySpending.push({ date, amount });
      }

      const totalForecast = dailySpending.reduce((sum, day) => sum + day.amount, 0);
      const variance = Math.sqrt(
        payments.reduce((sum, p) => sum + Math.pow(p - avgDailySpending, 2), 0) / payments.length
      );

      return {
        dailySpending,
        totalForecast,
        variance,
        confidence: 0.6 // Moderate confidence for simple model
      };
    } catch (error) {
      console.error('Error forecasting spending:', error);
      throw error;
    }
  }

  /**
   * Predict resource availability
   * @param resourceId - Resource ID (could be teamMember or inventoryItem)
   * @param dateRange - Date range to check availability
   * @param organizationId - Organization ID for validation (optional, but recommended for security)
   */
  async predictAvailability(
    resourceId: string,
    dateRange: { start: Date; end: Date },
    organizationId?: string
  ): Promise<AvailabilityPrediction> {
    try {
      // Validate resource belongs to organization if provided
      if (organizationId) {
        // Try teamMembers first
        let resourceDoc = await this.db.collection('teamMembers').doc(resourceId).get();
        if (!resourceDoc.exists) {
          // Try inventoryItems
          resourceDoc = await this.db.collection('inventoryItems').doc(resourceId).get();
        }
        
        if (!resourceDoc.exists) {
          throw new Error(`Resource ${resourceId} not found`);
        }
        
        const resourceData = resourceDoc.data();
        if (resourceData?.organizationId !== organizationId) {
          throw new Error('Resource does not belong to your organization');
        }
      }

      // Get existing assignments
      const assignmentsSnapshot = await this.db
        .collection('timecardAssignments')
        .where('resourceId', '==', resourceId)
        .where('startDate', '<=', dateRange.end)
        .where('endDate', '>=', dateRange.start)
        .get();

      // Get calendar events
      const eventsSnapshot = await this.db
        .collection('calendarEvents')
        .where('resourceId', '==', resourceId)
        .where('startDate', '<=', dateRange.end)
        .where('endDate', '>=', dateRange.start)
        .get();

      // Build conflict dates
      const conflictDates: Date[] = [];
      const availableDates: Date[] = [];

      assignmentsSnapshot.forEach(doc => {
        const assignment = doc.data();
        const start = assignment.startDate?.toDate() || new Date();
        const end = assignment.endDate?.toDate() || new Date();
        
        // Add all dates in range to conflicts
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          conflictDates.push(new Date(d));
        }
      });

      eventsSnapshot.forEach(doc => {
        const event = doc.data();
        const start = event.startDate?.toDate() || new Date();
        const end = event.endDate?.toDate() || new Date();
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          conflictDates.push(new Date(d));
        }
      });

      // Build available dates
      for (let d = new Date(dateRange.start); d <= dateRange.end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const isConflict = conflictDates.some(
          cd => cd.toISOString().split('T')[0] === dateStr
        );
        
        if (!isConflict) {
          availableDates.push(new Date(d));
        }
      }

      // Calculate utilization rate
      const totalDays = Math.ceil(
        (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
      );
      const utilizationRate = conflictDates.length / totalDays;

      // Generate recommendations
      const recommendations: string[] = [];
      if (utilizationRate > 0.8) {
        recommendations.push('Resource is highly utilized. Consider backup options.');
      }
      if (availableDates.length < 5) {
        recommendations.push('Limited availability. Book early if needed.');
      }
      if (recommendations.length === 0) {
        recommendations.push('Resource has good availability in this period.');
      }

      return {
        availableDates,
        conflictDates: [...new Set(conflictDates.map(d => d.toISOString().split('T')[0]))]
          .map(d => new Date(d)),
        utilizationRate,
        recommendations,
        confidence: 0.9 // High confidence for availability data
      };
    } catch (error) {
      console.error('Error predicting availability:', error);
      throw error;
    }
  }

  /**
   * Find optimal schedule for resources
   */
  async findOptimalSchedule(
    requirements: ResourceRequirement[],
    dateRange: { start: Date; end: Date }
  ): Promise<OptimalSchedule> {
    // This is a simplified implementation
    // In production, use optimization algorithms or ML models
    
    const assignments: Array<{
      resourceId: string;
      dates: Date[];
      score: number;
    }> = [];

    const conflicts: Array<{
      resourceId: string;
      date: Date;
      reason: string;
    }> = [];

    for (const requirement of requirements) {
      const availability = await this.predictAvailability(
        requirement.resourceId,
        dateRange
      );

      // Check if required dates are available
      const requiredDates = requirement.requiredDates.filter(rd => {
        return availability.availableDates.some(ad => 
          ad.toISOString().split('T')[0] === rd.toISOString().split('T')[0]
        );
      });

      const unavailableDates = requirement.requiredDates.filter(rd => {
        return !availability.availableDates.some(ad => 
          ad.toISOString().split('T')[0] === rd.toISOString().split('T')[0]
        );
      });

      // Add conflicts
      unavailableDates.forEach(date => {
        conflicts.push({
          resourceId: requirement.resourceId,
          date,
          reason: 'Resource not available on this date'
        });
      });

      // Calculate score (higher is better)
      const score = requiredDates.length / requirement.requiredDates.length;

      assignments.push({
        resourceId: requirement.resourceId,
        dates: requiredDates,
        score
      });
    }

    const totalScore = assignments.reduce((sum, a) => sum + a.score, 0) / assignments.length;

    return {
      assignments,
      conflicts,
      totalScore
    };
  }
}

// Export singleton instance
export function getPredictiveAnalyticsService(): PredictiveAnalyticsService {
  return new PredictiveAnalyticsService();
}

