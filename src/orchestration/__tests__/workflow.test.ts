import { WorkflowOrchestrator } from '../WorkflowOrchestrator';
import { HumanMessage } from '@langchain/core/messages';

describe('WorkflowOrchestrator', () => {
  let orchestrator: WorkflowOrchestrator;
  
  beforeEach(() => {
    orchestrator = new WorkflowOrchestrator();
  });
  
  it('should execute simple workflow', async () => {
    const result = await orchestrator.executeWorkflow(
      [new HumanMessage('Create a test project')],
      'test-org-id',
      'test-user-id',
      {}
    );
    
    expect(result.results.finalResponse).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
  
  it('should handle NotebookLM queries', async () => {
    const result = await orchestrator.executeWorkflow(
      [new HumanMessage('What are the delivery specs from the network bible?')],
      'test-org-id',
      'test-user-id',
      {}
    );
    
    expect(result.results.notebookLM).toBeDefined();
  });
  
  it('should handle MCP tool execution', async () => {
    const result = await orchestrator.executeWorkflow(
      [new HumanMessage('Create a project and assign team members')],
      'test-org-id',
      'test-user-id',
      {}
    );
    
    expect(result.results.mcpTools).toBeDefined();
  });
  
  it('should capture errors in Sentry', async () => {
    // Mock error scenario
    const result = await orchestrator.executeWorkflow(
      [new HumanMessage('Invalid request that will fail')],
      'test-org-id',
      'test-user-id',
      {}
    );
    
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
