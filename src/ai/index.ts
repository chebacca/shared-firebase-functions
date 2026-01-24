/**
 * AI Functions Index
 * 
 * Exports all AI-related Firebase Functions
 */

export { aiChatAssistant } from './aiChatAssistant';
export { aiAutomationSuggestions } from './aiAutomationSuggestions';
export { aiWorkflowAnalysis } from './aiWorkflowAnalysis';
export { aiPredictiveAutomation } from './aiPredictiveAutomation';
// export { testAIApiKey } from './testApiKey';
export { storeAIApiKey } from './storeAIApiKey';
export { generateScheduleAlerts, generateAlerts, triggerAlertGeneration } from './scheduleAlertGenerator';
export { executeAIAction } from './executeAIAction';

// Export context aggregation services
export * from './contextAggregation';

// Export predictive services
export * from './predictive';

// Export training data generators
export * from './training';

// Export vector store services
export * from './vectorStore';

// Export new agent system (v2)
export * from './services';
export * from './agents';
