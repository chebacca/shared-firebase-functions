# AI Token Usage Billing System

## Overview

This system enables pay-per-use billing for AI services across all Backbone apps. Users can either:
1. **Use their own API keys** - No billing, tokens tracked for analytics only
2. **Use Backbone backend API keys** - Metered billing via Stripe based on token consumption

## Architecture

### Components

1. **Token Usage Service** (`src/ai/services/tokenUsageService.ts`)
   - Records all AI token consumption to Firestore
   - Calculates costs based on provider/model pricing
   - Reports usage to Stripe for metered billing
   - Provides usage summaries and billing reports

2. **AI Helper Integration** (`src/ai/utils/aiHelpers.ts`)
   - Modified `callAIProvider()` to track token usage
   - Extracts token counts from API responses
   - Determines if API key is user-owned or Backbone backend

3. **Stripe Metered Billing** (`_backbone-licensing-website-v1.0/server/scripts/setup-stripe-metered-billing.cjs`)
   - Creates metered billing products for each AI provider
   - Sets up per-1K-token pricing
   - Configures subscription items for usage reporting

## Token Tracking

### How It Works

1. **AI API Call Made**
   - User makes an AI request (chat, transcription, document processing, etc.)
   - System determines API key source (user or Backbone backend)

2. **Token Usage Recorded**
   - API response includes token counts (input + output)
   - `TokenUsageService.recordTokenUsage()` stores usage in Firestore
   - Cost calculated based on provider/model pricing

3. **Stripe Billing** (if using Backbone backend)
   - Usage reported to Stripe via `subscriptionItems.createUsageRecord()`
   - Stripe automatically bills based on reported usage
   - Billing happens monthly with usage aggregation

### Firestore Schema

```typescript
// Collection: aiTokenUsage
{
  organizationId: string;
  userId: string;
  provider: 'openai' | 'claude' | 'gemini' | 'grok';
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiKeySource: 'user' | 'backbone';
  cost: number; // USD
  timestamp: Timestamp;
  feature?: string; // e.g., 'chat', 'transcription'
  projectId?: string;
  sessionId?: string;
}
```

## Pricing

### Current Pricing (per 1M tokens)

**OpenAI:**
- GPT-4o: $2.50 input / $10.00 output
- GPT-4o-mini: $0.15 input / $0.60 output
- GPT-3.5-turbo: $0.50 input / $1.50 output

**Claude:**
- Claude 3.5 Sonnet: $3.00 input / $15.00 output
- Claude 3 Opus: $15.00 input / $75.00 output
- Claude 3 Haiku: $0.25 input / $1.25 output

**Gemini:**
- Gemini 2.5 Flash: Free (during free tier)
- Gemini 1.5 Pro: $1.25 input / $5.00 output

**Grok:**
- Grok Beta: Free (during beta)

### Stripe Metered Billing Setup

Run the setup script to create metered billing products:

```bash
cd _backbone-licensing-website-v1.0/server
node scripts/setup-stripe-metered-billing.cjs --test --dry-run  # Test mode, dry run
node scripts/setup-stripe-metered-billing.cjs --test            # Test mode, create products
node scripts/setup-stripe-metered-billing.cjs --live             # Live mode, create products
```

This creates:
- 4 products (one per provider)
- 4 metered prices (per 1K tokens)
- Metadata for provider identification

## Usage

### Recording Token Usage

```typescript
import { TokenUsageService } from './services/tokenUsageService';

await TokenUsageService.recordTokenUsage({
  organizationId: 'org-123',
  userId: 'user-456',
  provider: 'openai',
  model: 'gpt-4o',
  inputTokens: 150,
  outputTokens: 50,
  apiKeySource: 'backbone', // or 'user'
  feature: 'chat-assistant',
  projectId: 'project-789',
  sessionId: 'session-abc'
});
```

### Getting Usage Summary

```typescript
const summaries = await TokenUsageService.getUsageSummary(
  'org-123',
  'user-456',
  'monthly', // or 'daily'
  'openai' // optional provider filter
);

// Returns array of summaries:
// [
//   {
//     organizationId: 'org-123',
//     userId: 'user-456',
//     provider: 'openai',
//     period: 'monthly',
//     totalTokens: 50000,
//     totalCost: 2.50,
//     recordCount: 150,
//     startDate: Timestamp,
//     endDate: Timestamp
//   }
// ]
```

### Getting Billing Period Cost

```typescript
const cost = await TokenUsageService.getBillingPeriodCost(
  'org-123',
  'user-456',
  new Date('2024-12-01'),
  new Date('2024-12-31')
);

// Returns total cost in USD for Backbone backend usage only
```

## Integration Points

### AI Chat Assistant

The `aiChatAssistant` function automatically tracks token usage when:
- User makes a chat request
- API key is determined (user or Backbone backend)
- Token counts are extracted from API response

### Other AI Features

To track usage in other AI features:

```typescript
import { callAIProvider } from './utils/aiHelpers';

const response = await callAIProvider(
  'openai',
  apiKey,
  'gpt-4o',
  messages,
  {
    organizationId: 'org-123',
    userId: 'user-456',
    apiKeySource: 'backbone', // or 'user'
    feature: 'transcription', // or 'document-processing', etc.
    projectId: 'project-789',
    sessionId: 'session-abc'
  }
);
```

## Stripe Integration

### Adding Metered Subscription Items

When a user enables Backbone backend AI, add a metered subscription item:

```typescript
const subscriptionItem = await stripe.subscriptionItems.create({
  subscription: subscriptionId,
  price: stripePriceId, // From setup-stripe-metered-billing.cjs
  metadata: {
    provider: 'openai',
    type: 'metered_billing'
  }
});
```

### Reporting Usage

Usage is automatically reported to Stripe when:
- `apiKeySource === 'backbone'`
- User has an active Stripe subscription
- Subscription has a metered item for the provider

The `TokenUsageService` handles this automatically.

## User Preferences

### Using Own API Keys

Users can configure their own API keys in:
- Settings > Integration Settings > API Keys

When using own keys:
- `apiKeySource = 'user'`
- No Stripe billing
- Usage still tracked for analytics

### Using Backbone Backend

When using Backbone backend API keys:
- `apiKeySource = 'backbone'`
- Stripe metered billing enabled
- Usage reported to Stripe automatically

## Monitoring & Analytics

### Firestore Queries

```typescript
// Get all usage for an organization
const usage = await db.collection('aiTokenUsage')
  .where('organizationId', '==', 'org-123')
  .where('timestamp', '>=', startDate)
  .get();

// Get usage by provider
const openaiUsage = await db.collection('aiTokenUsage')
  .where('organizationId', '==', 'org-123')
  .where('provider', '==', 'openai')
  .where('apiKeySource', '==', 'backbone')
  .get();

// Get usage by feature
const chatUsage = await db.collection('aiTokenUsage')
  .where('organizationId', '==', 'org-123')
  .where('feature', '==', 'chat-assistant')
  .get();
```

## Future Enhancements

1. **Usage Dashboard**
   - Real-time token usage visualization
   - Cost breakdown by provider/feature
   - Billing period summaries

2. **Usage Limits**
   - Set monthly token limits per organization
   - Alert when approaching limits
   - Auto-disable when limit reached

3. **Cost Optimization**
   - Suggest cheaper models for simple tasks
   - Automatic model selection based on complexity
   - Usage pattern analysis

4. **Multi-Currency Support**
   - Support for non-USD pricing
   - Currency conversion for international users

## Troubleshooting

### Usage Not Being Tracked

1. Check that `organizationId` and `userId` are provided
2. Verify API response includes token counts
3. Check Firestore `aiTokenUsage` collection for records
4. Review console logs for errors

### Stripe Billing Not Working

1. Verify user has active Stripe subscription
2. Check subscription has metered item for provider
3. Verify `apiKeySource === 'backbone'`
4. Check Stripe dashboard for usage records
5. Review `TokenUsageService` logs

### Incorrect Costs

1. Verify pricing in `calculateTokenCost()` is up-to-date
2. Check provider/model pricing documentation
3. Review token counts from API responses
4. Compare with Stripe billing records

## Security

- API keys are encrypted before storage
- Token usage records are organization-scoped
- Only authenticated users can access usage data
- Stripe API keys stored securely in environment variables

## Support

For issues or questions:
1. Check Firestore `aiTokenUsage` collection
2. Review Stripe dashboard for billing records
3. Check console logs for errors
4. Contact Backbone support team







