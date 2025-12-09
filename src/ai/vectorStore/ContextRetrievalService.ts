/**
 * Context Retrieval Service
 * 
 * Retrieve relevant context for AI queries using vector search
 * Finds similar past scenarios and role-specific knowledge
 */

import { searchContent, indexContent, indexContentBatch } from './VectorStoreService';
import { generateAllTrainingData } from '../training';

export interface RetrievedContext {
  relevantDocs: Array<{
    content: string;
    category: string;
    similarity: number;
    metadata?: any;
  }>;
  similarScenarios: Array<{
    content: string;
    category: string;
    similarity: number;
  }>;
  roleKnowledge: Array<{
    content: string;
    category: string;
    similarity: number;
  }>;
}

/**
 * Retrieve relevant context for a query
 */
export async function retrieveContext(
  organizationId: string,
  query: string,
  options?: {
    includeSimilarScenarios?: boolean;
    includeRoleKnowledge?: boolean;
    limit?: number;
  }
): Promise<RetrievedContext> {
  const {
    includeSimilarScenarios = true,
    includeRoleKnowledge = true,
    limit = 5
  } = options || {};

  // Search for relevant documentation
  const relevantDocs = await searchContent(organizationId, query, {
    category: 'workflow',
    limit,
    minSimilarity: 0.7
  });

  // Search for similar scenarios
  let similarScenarios: RetrievedContext['similarScenarios'] = [];
  if (includeSimilarScenarios) {
    similarScenarios = await searchContent(organizationId, query, {
      category: 'alert',
      limit,
      minSimilarity: 0.7
    });
  }

  // Search for role-specific knowledge
  let roleKnowledge: RetrievedContext['roleKnowledge'] = [];
  if (includeRoleKnowledge) {
    roleKnowledge = await searchContent(organizationId, query, {
      category: 'role',
      limit,
      minSimilarity: 0.7
    });
  }

  return {
    relevantDocs,
    similarScenarios,
    roleKnowledge
  };
}

/**
 * Initialize vector store with training data
 * Call this once to index all training data
 */
export async function initializeVectorStore(organizationId: string): Promise<{
  workflowIndexed: number;
  roleIndexed: number;
  alertIndexed: number;
}> {
  // Generate all training data
  const trainingData = await generateAllTrainingData(organizationId);

  // Index workflow data
  const workflowItems = trainingData.workflow.map(example => ({
    content: `${example.prompt}\n\n${example.completion}`,
    category: 'workflow',
    metadata: example.metadata
  }));

  const workflowIds = await indexContentBatch(organizationId, workflowItems);

  // Index role data
  const roleItems = trainingData.role.map(example => ({
    content: `${example.prompt}\n\n${example.completion}`,
    category: 'role',
    metadata: example.metadata
  }));

  const roleIds = await indexContentBatch(organizationId, roleItems);

  // Index alert data
  const alertItems = trainingData.alert.map(example => ({
    content: `${example.prompt}\n\n${example.completion}`,
    category: 'alert',
    metadata: example.metadata
  }));

  const alertIds = await indexContentBatch(organizationId, alertItems);

  return {
    workflowIndexed: workflowIds.length,
    roleIndexed: roleIds.length,
    alertIndexed: alertIds.length
  };
}










