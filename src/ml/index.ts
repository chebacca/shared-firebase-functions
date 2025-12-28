/**
 * ML Services Index
 * 
 * Exports all ML services for use in Firebase Functions
 */

export { VectorSearchService, getVectorSearchService } from './VectorSearchService';
export { DocumentAIService, getDocumentAIService } from './DocumentAIService';
export { PredictiveAnalyticsService, getPredictiveAnalyticsService } from './PredictiveAnalyticsService';
export { DataIndexingService, getDataIndexingService } from './DataIndexingService';
export { getAuthenticatedUserOrg, validateOrgAccess } from './authHelpers';
export type { SearchResult, EmbeddingResult } from './VectorSearchService';
export type { NetworkBibleData, BudgetData, ScriptData } from './DocumentAIService';
export type { BudgetPrediction, SpendingForecast, AvailabilityPrediction, OptimalSchedule } from './PredictiveAnalyticsService';
export type { IndexingJob, IndexingOptions } from './DataIndexingService';

