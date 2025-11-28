/**
 * Token Usage Tracking Service
 * 
 * Tracks AI token consumption for billing purposes
 * Supports both user-owned API keys and Backbone backend API keys
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';

const db = getFirestore();

export interface TokenUsageRecord {
  organizationId: string;
  userId: string;
  provider: 'openai' | 'claude' | 'gemini' | 'grok';
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiKeySource: 'user' | 'backbone'; // Whether user's own key or Backbone's backend
  cost: number; // Cost in USD
  timestamp: Timestamp;
  requestId?: string; // For tracking specific requests
  feature?: string; // e.g., 'chat', 'transcription', 'document-processing'
  projectId?: string;
  sessionId?: string;
}

export interface TokenUsageSummary {
  organizationId: string;
  userId: string;
  provider: string;
  period: 'daily' | 'monthly';
  totalTokens: number;
  totalCost: number;
  recordCount: number;
  startDate: Timestamp;
  endDate: Timestamp;
}

export class TokenUsageService {
  private static stripe: Stripe | null = null;

  /**
   * Initialize Stripe client
   */
  private static getStripe(): Stripe {
    if (!this.stripe) {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        throw new Error('STRIPE_SECRET_KEY not configured');
      }
      this.stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    }
    return this.stripe;
  }

  /**
   * Record token usage for an AI API call
   */
  static async recordTokenUsage(
    record: Omit<TokenUsageRecord, 'timestamp' | 'totalTokens' | 'cost'>
  ): Promise<void> {
    try {
      const totalTokens = record.inputTokens + record.outputTokens;
      
      // Calculate cost based on provider and model
      const cost = this.calculateTokenCost(
        record.provider,
        record.model,
        record.inputTokens,
        record.outputTokens
      );

      const usageRecord: TokenUsageRecord = {
        ...record,
        totalTokens,
        cost,
        timestamp: Timestamp.now()
      };

      // Store in Firestore
      await db.collection('aiTokenUsage').add(usageRecord);

      // If using Backbone backend API, report to Stripe for metered billing
      if (record.apiKeySource === 'backbone') {
        await this.reportUsageToStripe(
          record.organizationId,
          record.userId,
          record.provider,
          totalTokens,
          cost
        );
      }

      console.log(`✅ [TokenUsageService] Recorded ${totalTokens} tokens (${cost.toFixed(4)} USD) for ${record.provider}`);
    } catch (error) {
      console.error('❌ [TokenUsageService] Failed to record token usage:', error);
      // Don't throw - we don't want to break AI functionality if billing fails
    }
  }

  /**
   * Calculate token cost based on provider and model pricing
   * Prices are per 1M tokens (as of 2024)
   */
  private static calculateTokenCost(
    provider: 'openai' | 'claude' | 'gemini' | 'grok',
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    // Pricing per 1M tokens (input/output)
    const pricing: Record<string, { input: number; output: number }> = {
      // OpenAI
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4-turbo': { input: 10.00, output: 30.00 },
      'gpt-4': { input: 30.00, output: 60.00 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      
      // Claude
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
      'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
      
      // Gemini
      'gemini-2.5-flash': { input: 0.00, output: 0.00 }, // Free tier
      'gemini-1.5-flash': { input: 0.00, output: 0.00 }, // Free tier
      'gemini-1.5-pro': { input: 1.25, output: 5.00 },
      'gemini-pro': { input: 0.50, output: 1.50 },
      
      // Grok
      'grok-beta': { input: 0.00, output: 0.00 }, // Free during beta
    };

    // Find matching pricing (exact match or fallback to provider default)
    let modelPricing = pricing[model.toLowerCase()];
    
    if (!modelPricing) {
      // Fallback to provider defaults
      if (provider === 'openai') {
        modelPricing = pricing['gpt-4o-mini']; // Default to cheapest
      } else if (provider === 'claude') {
        modelPricing = pricing['claude-3-haiku-20240307']; // Default to cheapest
      } else if (provider === 'gemini') {
        modelPricing = pricing['gemini-2.5-flash']; // Free tier
      } else {
        modelPricing = { input: 1.00, output: 2.00 }; // Generic fallback
      }
    }

    const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
    const outputCost = (outputTokens / 1_000_000) * modelPricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Report usage to Stripe for metered billing
   */
  private static async reportUsageToStripe(
    organizationId: string,
    userId: string,
    provider: 'openai' | 'claude' | 'gemini' | 'grok',
    totalTokens: number,
    cost: number
  ): Promise<void> {
    try {
      const stripe = this.getStripe();

      // Get user's subscription to find the subscription item ID
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        console.warn(`[TokenUsageService] User ${userId} not found`);
        return;
      }

      const userData = userDoc.data();
      const stripeCustomerId = userData?.stripeCustomerId;

      if (!stripeCustomerId) {
        // User doesn't have a Stripe customer ID - they might be using their own API keys
        return;
      }

      // Get active subscription
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'active',
        limit: 1
      });

      if (subscriptions.data.length === 0) {
        // No active subscription - user might be on free tier or using own keys
        return;
      }

      const subscription = subscriptions.data[0];
      
      // Find the metered subscription item for this provider
      // We'll need to create these subscription items when setting up metered billing
      const subscriptionItem = subscription.items.data.find(
        item => item.price.metadata?.provider === provider
      );

      if (!subscriptionItem) {
        // No metered billing item for this provider - user might be on a plan that includes AI
        // or using their own API keys
        return;
      }

      // Report usage to Stripe (usage is in units - we'll use tokens/1000 as units)
      // Stripe metered billing works with whole units, so we round to nearest 1000 tokens
      const units = Math.ceil(totalTokens / 1000);

      await stripe.subscriptionItems.createUsageRecord(
        subscriptionItem.id,
        {
          quantity: units,
          timestamp: Math.floor(Date.now() / 1000), // Unix timestamp
          action: 'increment' // Add to existing usage
        }
      );

      console.log(`✅ [TokenUsageService] Reported ${units} units (${totalTokens} tokens) to Stripe`);
    } catch (error: any) {
      console.error('❌ [TokenUsageService] Failed to report usage to Stripe:', error);
      // Don't throw - billing failures shouldn't break functionality
    }
  }

  /**
   * Get token usage summary for a user/organization
   */
  static async getUsageSummary(
    organizationId: string,
    userId: string,
    period: 'daily' | 'monthly' = 'monthly',
    provider?: 'openai' | 'claude' | 'gemini' | 'grok'
  ): Promise<TokenUsageSummary[]> {
    try {
      const now = new Date();
      const startDate = period === 'daily' 
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
        : new Date(now.getFullYear(), now.getMonth(), 1);

      let query = db.collection('aiTokenUsage')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', userId)
        .where('timestamp', '>=', Timestamp.fromDate(startDate))
        .where('timestamp', '<=', Timestamp.now());

      if (provider) {
        query = query.where('provider', '==', provider) as any;
      }

      const snapshot = await query.get();
      
      // Group by provider
      const summaryMap = new Map<string, TokenUsageSummary>();

      snapshot.docs.forEach(doc => {
        const data = doc.data() as TokenUsageRecord;
        const key = data.provider;

        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            organizationId,
            userId,
            provider: data.provider,
            period,
            totalTokens: 0,
            totalCost: 0,
            recordCount: 0,
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.now()
          });
        }

        const summary = summaryMap.get(key)!;
        summary.totalTokens += data.totalTokens;
        summary.totalCost += data.cost;
        summary.recordCount += 1;
      });

      return Array.from(summaryMap.values());
    } catch (error) {
      console.error('❌ [TokenUsageService] Failed to get usage summary:', error);
      throw error;
    }
  }

  /**
   * Get total cost for a billing period
   */
  static async getBillingPeriodCost(
    organizationId: string,
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    try {
      const snapshot = await db.collection('aiTokenUsage')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', userId)
        .where('timestamp', '>=', Timestamp.fromDate(startDate))
        .where('timestamp', '<=', Timestamp.fromDate(endDate))
        .where('apiKeySource', '==', 'backbone') // Only count Backbone backend usage
        .get();

      let totalCost = 0;
      snapshot.docs.forEach(doc => {
        const data = doc.data() as TokenUsageRecord;
        totalCost += data.cost;
      });

      return totalCost;
    } catch (error) {
      console.error('❌ [TokenUsageService] Failed to get billing period cost:', error);
      throw error;
    }
  }
}

