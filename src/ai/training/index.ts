/**
 * Training Data Generators
 * 
 * Generate training data for AI model fine-tuning
 */

export * from './WorkflowTrainingDataGenerator';
export * from './RoleTrainingDataGenerator';
export * from './AlertTrainingDataGenerator';

/**
 * Generate all training data
 */
export async function generateAllTrainingData(organizationId?: string) {
  const { generateWorkflowTrainingData } = await import('./WorkflowTrainingDataGenerator');
  const { generateRoleTrainingData } = await import('./RoleTrainingDataGenerator');
  const { generateAlertTrainingData } = await import('./AlertTrainingDataGenerator');

  const workflowData = await generateWorkflowTrainingData(organizationId);
  const roleData = generateRoleTrainingData();
  const alertData = generateAlertTrainingData();

  return {
    workflow: workflowData,
    role: roleData,
    alert: alertData,
    all: [...workflowData, ...roleData, ...alertData]
  };
}










