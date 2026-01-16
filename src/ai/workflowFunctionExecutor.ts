/**
 * Workflow Function Executor
 * 
 * Executes function calls from Gemini AI for workflow operations.
 * Handles create, validate, fix, modify, search, and timeline calculations.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { ReportGeneratorService } from '../reports/ReportGeneratorService';
import { ReportExportService } from '../reports/ReportExportService';
import { DocumentAnalysisService } from './services/DocumentAnalysisService';

const db = getFirestore();

export interface FunctionCallResult {
  success: boolean;
  data?: any;
  error?: string;
  validationErrors?: any[];
}

export class WorkflowFunctionExecutor {
  static async executeFunction(
    functionName: string,
    args: any,
    organizationId: string,
    userId: string
  ): Promise<FunctionCallResult> {
    try {
      switch (functionName) {
        case 'create_workflow':
          return this.createWorkflow(args);

        case 'validate_workflow':
          return this.validateWorkflow(args);

        case 'fix_workflow_errors':
          return this.fixWorkflowErrors(args);

        case 'modify_workflow':
          return this.modifyWorkflow(args);

        case 'search_templates':
          return this.searchTemplates(args, organizationId);

        case 'calculate_workflow_timeline':
          return this.calculateTimeline(args);

        case 'suggest_workflow_for_phase':
          return this.suggestWorkflowForPhase(args);

        case 'generate_report':
          return this.generateReport(args);

        case 'analyze_project':
          return this.analyzeProject(args);

        case 'export_report':
          return this.exportReport(args);

        default:
          return {
            success: false,
            error: `Unknown function: ${functionName}`
          };
      }
    } catch (error: any) {
      console.error(`[WorkflowFunctionExecutor] Error executing ${functionName}:`, error);
      return {
        success: false,
        error: error.message || 'Function execution failed'
      };
    }
  }

  private static async createWorkflow(args: any): Promise<FunctionCallResult> {
    // Validate required fields
    if (!args.name || !args.nodes || !args.edges) {
      return {
        success: false,
        error: 'Missing required fields: name, nodes, edges'
      };
    }

    // Validate structure (with optional phase and status context)
    const validation = this.validateWorkflowStructure(
      args.nodes,
      args.edges,
      args.targetPhase,
      args.sessionStatus
    );
    if (!validation.valid) {
      return {
        success: false,
        error: 'Workflow structure validation failed',
        validationErrors: validation.errors
      };
    }

    return {
      success: true,
      data: {
        workflow: {
          name: args.name,
          description: args.description || '',
          nodes: args.nodes,
          edges: args.edges
        },
        validation: validation
      }
    };
  }

  private static validateWorkflow(args: any): FunctionCallResult {
    const validation = this.validateWorkflowStructure(
      args.nodes,
      args.edges,
      args.targetPhase,
      args.sessionStatus
    );
    return {
      success: true,
      data: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      },
      validationErrors: validation.errors
    };
  }

  private static fixWorkflowErrors(args: any): FunctionCallResult {
    // Auto-fix logic
    let fixedNodes = [...args.nodes];
    let fixedEdges = [...args.edges];

    for (const error of args.errors) {
      switch (error.code) {
        case 'MISSING_START_NODE':
          // Add start node
          fixedNodes.unshift({
            id: 'start-1',
            type: 'start',
            position: { x: 100, y: 200 },
            data: { label: 'Start' }
          });
          // Connect to first non-start node
          if (fixedNodes.length > 1) {
            const firstTaskNode = fixedNodes.find(n => n.type !== 'start' && n.type !== 'end');
            if (firstTaskNode) {
              fixedEdges.unshift({
                id: `edge-start-${firstTaskNode.id}`,
                source: 'start-1',
                target: firstTaskNode.id,
                type: 'default'
              });
            }
          }
          break;

        case 'MISSING_END_NODE':
          // Add end node
          fixedNodes.push({
            id: 'end-1',
            type: 'end',
            position: { x: 1000, y: 200 },
            data: { label: 'End' }
          });
          // Connect last non-end node to end
          const lastTaskNode = fixedNodes
            .filter(n => n.type !== 'start' && n.type !== 'end')
            .slice(-1)[0];
          if (lastTaskNode) {
            fixedEdges.push({
              id: `edge-${lastTaskNode.id}-end`,
              source: lastTaskNode.id,
              target: 'end-1',
              type: 'default'
            });
          }
          break;

        case 'ORPHANED_NODE':
          // Connect orphaned node to nearest node
          const orphanedNode = fixedNodes.find(n => n.id === error.nodeId);
          if (orphanedNode) {
            // Find nearest node
            const otherNodes = fixedNodes.filter(n => n.id !== error.nodeId && n.type !== 'end');
            if (otherNodes.length > 0) {
              const nearest = otherNodes[0];
              fixedEdges.push({
                id: `edge-${nearest.id}-${error.nodeId}`,
                source: nearest.id,
                target: error.nodeId,
                type: 'default'
              });
            }
          }
          break;

        case 'CYCLE_DETECTED':
          // Break cycle by removing problematic edge
          fixedEdges = fixedEdges.filter(e => e.id !== error.edgeId);
          break;
      }
    }

    return {
      success: true,
      data: {
        nodes: fixedNodes,
        edges: fixedEdges,
        fixesApplied: args.errors.length
      }
    };
  }

  private static modifyWorkflow(args: any): FunctionCallResult {
    let modifiedNodes = [...args.currentNodes];
    let modifiedEdges = [...args.currentEdges];

    switch (args.action) {
      case 'add_after':
        if (!args.targetNodeId || !args.newNodes) {
          return { success: false, error: 'targetNodeId and newNodes required for add_after' };
        }

        const targetIndex = modifiedNodes.findIndex(n => n.id === args.targetNodeId);
        if (targetIndex === -1) {
          return { success: false, error: `Target node ${args.targetNodeId} not found` };
        }

        // Insert new nodes after target
        const insertIndex = targetIndex + 1;
        args.newNodes.forEach((node: any, idx: number) => {
          modifiedNodes.splice(insertIndex + idx, 0, node);

          // Create edges: target -> new node
          modifiedEdges.push({
            id: `edge-${args.targetNodeId}-${node.id}`,
            source: args.targetNodeId,
            target: node.id,
            type: 'default'
          });

          // Update edges that pointed to target to point to new node
          modifiedEdges = modifiedEdges.map(edge => {
            if (edge.target === args.targetNodeId && edge.source !== args.targetNodeId) {
              return { ...edge, target: node.id };
            }
            return edge;
          });
        });
        break;

      case 'add_before':
        if (!args.targetNodeId || !args.newNodes) {
          return { success: false, error: 'targetNodeId and newNodes required for add_before' };
        }

        const beforeIndex = modifiedNodes.findIndex(n => n.id === args.targetNodeId);
        if (beforeIndex === -1) {
          return { success: false, error: `Target node ${args.targetNodeId} not found` };
        }

        // Insert new nodes before target
        args.newNodes.forEach((node: any, idx: number) => {
          modifiedNodes.splice(beforeIndex + idx, 0, node);

          // Update edges: new node -> target
          modifiedEdges = modifiedEdges.map(edge => {
            if (edge.target === args.targetNodeId) {
              return { ...edge, source: node.id, id: `edge-${node.id}-${args.targetNodeId}` };
            }
            return edge;
          });
        });
        break;

      case 'remove':
        if (!args.targetNodeId) {
          return { success: false, error: 'targetNodeId required for remove' };
        }

        modifiedNodes = modifiedNodes.filter(n => n.id !== args.targetNodeId);
        modifiedEdges = modifiedEdges.filter(e =>
          e.source !== args.targetNodeId && e.target !== args.targetNodeId
        );
        break;

      case 'update':
        if (!args.targetNodeId || !args.updatedNode) {
          return { success: false, error: 'targetNodeId and updatedNode required for update' };
        }

        const updateIndex = modifiedNodes.findIndex(n => n.id === args.targetNodeId);
        if (updateIndex === -1) {
          return { success: false, error: `Target node ${args.targetNodeId} not found` };
        }

        modifiedNodes[updateIndex] = { ...modifiedNodes[updateIndex], ...args.updatedNode };
        break;

      case 'replace':
        if (!args.targetNodeId || !args.updatedNode) {
          return { success: false, error: 'targetNodeId and updatedNode required for replace' };
        }

        const replaceIndex = modifiedNodes.findIndex(n => n.id === args.targetNodeId);
        if (replaceIndex === -1) {
          return { success: false, error: `Target node ${args.targetNodeId} not found` };
        }

        modifiedNodes[replaceIndex] = args.updatedNode;
        break;

      case 'insert_parallel':
        if (!args.targetNodeId || !args.newNodes) {
          return { success: false, error: 'targetNodeId and newNodes required for insert_parallel' };
        }

        // Find nodes that come after target
        const parallelTargetIndex = modifiedNodes.findIndex(n => n.id === args.targetNodeId);
        if (parallelTargetIndex === -1) {
          return { success: false, error: `Target node ${args.targetNodeId} not found` };
        }

        // Insert parallel nodes (same level as target)
        args.newNodes.forEach((node: any) => {
          modifiedNodes.push(node);

          // Connect from same source as target
          const targetEdges = modifiedEdges.filter(e => e.target === args.targetNodeId);
          targetEdges.forEach(edge => {
            modifiedEdges.push({
              id: `edge-${edge.source}-${node.id}`,
              source: edge.source,
              target: node.id,
              type: 'default'
            });
          });
        });
        break;

      default:
        return { success: false, error: `Unknown action: ${args.action}` };
    }

    return {
      success: true,
      data: {
        nodes: modifiedNodes,
        edges: modifiedEdges,
        action: args.action
      }
    };
  }

  private static async searchTemplates(args: any, organizationId: string): Promise<FunctionCallResult> {
    try {
      // Query Firestore for templates
      let query = db.collection('workflow-templates')
        .where('organizationId', '==', organizationId);

      if (args.category) {
        query = query.where('category', '==', args.category) as any;
      }

      const snapshot = await query.limit(20).get();
      const templates = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Simple text matching on query
      const queryLower = args.query.toLowerCase();
      const filtered = templates.filter((t: any) =>
        t.name?.toLowerCase().includes(queryLower) ||
        t.description?.toLowerCase().includes(queryLower) ||
        t.category?.toLowerCase().includes(queryLower)
      );

      return {
        success: true,
        data: {
          templates: filtered,
          totalFound: filtered.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Search failed: ${error.message}`
      };
    }
  }

  private static calculateTimeline(args: any): FunctionCallResult {
    try {
      const nodes = args.nodes || [];
      const edges = args.edges || [];

      // Calculate critical path and estimate timeline
      const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));
      const estimatedHours = nodes.reduce((sum: number, n: any) => {
        return sum + (n.data?.estimatedHours || 8); // Default 8 hours
      }, 0);

      // Build dependency graph
      const dependencies = new Map<string, string[]>();
      edges.forEach((e: any) => {
        if (!dependencies.has(e.target)) {
          dependencies.set(e.target, []);
        }
        dependencies.get(e.target)!.push(e.source);
      });

      // Calculate longest path (simplified)
      const calculatePathLength = (nodeId: string, visited: Set<string> = new Set()): number => {
        if (visited.has(nodeId)) return 0; // Cycle protection
        visited.add(nodeId);

        const node = nodeMap.get(nodeId) as any;
        const hours = node?.data?.estimatedHours || 8;

        const deps = dependencies.get(nodeId) || [];
        if (deps.length === 0) return hours;

        const maxDepTime = Math.max(...deps.map((dep: string) => calculatePathLength(dep, new Set(visited))));
        return hours + maxDepTime;
      };

      const startNodes = nodes.filter((n: any) => n.type === 'start' || !dependencies.has(n.id));
      const longestPath = Math.max(...startNodes.map((n: any) => calculatePathLength(n.id)));

      return {
        success: true,
        data: {
          estimatedTotalHours: estimatedHours,
          criticalPathHours: longestPath,
          nodeCount: nodes.length,
          edgeCount: edges.length,
          averageHoursPerNode: estimatedHours / nodes.length || 0
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Timeline calculation failed: ${error.message}`
      };
    }
  }

  private static suggestWorkflowForPhase(args: any): FunctionCallResult {
    try {
      const phase = args.phase;
      const sessionStatus = args.sessionStatus;
      const existingWorkflows = args.existingWorkflows || [];
      const teamMembers = args.teamMembers || [];
      const deliverables = args.deliverables || [];

      // Check if workflow already exists for this phase
      const existingForPhase = existingWorkflows.find((w: any) => w.phase === phase);
      if (existingForPhase) {
        return {
          success: true,
          data: {
            suggestion: `A workflow already exists for phase ${phase}: "${existingForPhase.name}" (Status: ${existingForPhase.status}). Consider modifying the existing workflow instead of creating a new one.`,
            existingWorkflow: existingForPhase,
            shouldModify: true,
            shouldCreate: false
          }
        };
      }

      // Generate phase-specific suggestions
      const suggestions: any = {
        phase,
        recommendedNodeTypes: [],
        recommendedTaskTypes: [],
        recommendedAgents: [],
        recommendedRoles: [],
        workflowStructure: []
      };

      switch (phase) {
        case 'PRE_PRODUCTION':
          suggestions.recommendedNodeTypes = ['task', 'approval'];
          suggestions.recommendedTaskTypes = ['GENERAL_TASK', 'COMMUNICATION'];
          suggestions.recommendedAgents = ['COORDINATOR'];
          suggestions.recommendedRoles = teamMembers.filter((m: any) =>
            ['PRODUCER', 'POST_COORDINATOR', 'DIRECTOR'].includes(m.roleName?.toUpperCase())
          ).map((m: any) => m.roleName);
          suggestions.workflowStructure = [
            'Start',
            'Team Assignment',
            'Planning Meeting',
            'Setup Tasks',
            'Ready Check',
            'End'
          ];
          break;

        case 'PRODUCTION':
          suggestions.recommendedNodeTypes = ['task', 'agent'];
          suggestions.recommendedTaskTypes = ['GENERAL_TASK', 'COMMUNICATION'];
          suggestions.recommendedAgents = ['INGEST_BOT', 'COORDINATOR'];
          suggestions.recommendedRoles = teamMembers.filter((m: any) =>
            ['DIRECTOR', 'PRODUCER', 'CAMERA_OPERATOR'].includes(m.roleName?.toUpperCase())
          ).map((m: any) => m.roleName);
          suggestions.workflowStructure = [
            'Start',
            'Production Setup',
            'Media Capture',
            'Dailies Review',
            'Wrap',
            'Prepare for Post',
            'End'
          ];
          break;

        case 'POST_PRODUCTION':
          suggestions.recommendedNodeTypes = ['task', 'agent', 'approval', 'decision'];
          suggestions.recommendedTaskTypes = ['INGEST', 'EDITORIAL', 'COLOR', 'AUDIO', 'GRAPHICS', 'QC', 'REVIEW'];
          suggestions.recommendedAgents = ['INGEST_BOT', 'QC_BOT', 'COORDINATOR'];
          suggestions.recommendedRoles = teamMembers.filter((m: any) =>
            ['EDITOR', 'COLORIST', 'SOUND_DESIGNER', 'QC_SPECIALIST', 'PRODUCER'].includes(m.roleName?.toUpperCase())
          ).map((m: any) => m.roleName);
          suggestions.workflowStructure = [
            'Start',
            'Media Ingest',
            'Initial Edit',
            'Color Grading',
            'Audio Mix',
            'Graphics',
            'QC Check',
            'Review',
            'Approval',
            'End'
          ];
          suggestions.shouldIncludeReviewLoop = true;
          break;

        case 'DELIVERY':
          suggestions.recommendedNodeTypes = ['task', 'agent', 'approval'];
          suggestions.recommendedTaskTypes = ['QC', 'REVIEW', 'COMMUNICATION'];
          suggestions.recommendedAgents = ['DELIVERY_BOT', 'QC_BOT'];
          suggestions.recommendedRoles = teamMembers.filter((m: any) =>
            ['POST_COORDINATOR', 'PRODUCER', 'QC_SPECIALIST'].includes(m.roleName?.toUpperCase())
          ).map((m: any) => m.roleName);
          suggestions.workflowStructure = [
            'Start',
            'Final QC',
            'Mastering',
            'Export',
            'Network Delivery',
            'Archive',
            'End'
          ];
          break;
      }

      // Validate session status alignment
      const statusPhaseMap: Record<string, string> = {
        'PLANNING': 'PRE_PRODUCTION',
        'PLANNED': 'PRE_PRODUCTION',
        'PRE_PRODUCTION': 'PRE_PRODUCTION',
        'PRODUCTION_IN_PROGRESS': 'PRODUCTION',
        'IN_PRODUCTION': 'PRODUCTION',
        'PREPARE_FOR_POST': 'PRODUCTION',
        'READY_FOR_POST': 'POST_PRODUCTION',
        'POST_PRODUCTION': 'POST_PRODUCTION',
        'POST_IN_PROGRESS': 'POST_PRODUCTION',
        'CHANGES_NEEDED': 'POST_PRODUCTION',
        'WAITING_FOR_APPROVAL': 'POST_PRODUCTION',
        'DELIVERY': 'DELIVERY',
        'PHASE_4_POST_PRODUCTION': 'DELIVERY',
        'COMPLETED': 'DELIVERY',
        'ARCHIVED': 'ARCHIVED',
        'CANCELED': 'ARCHIVED',
        'ON_HOLD': 'PRE_PRODUCTION'
      };

      let statusWarning = null;
      if (sessionStatus) {
        const expectedPhase = statusPhaseMap[sessionStatus];
        if (expectedPhase && expectedPhase !== phase) {
          statusWarning = `Session status "${sessionStatus}" typically corresponds to phase "${expectedPhase}", but workflow is targeting phase "${phase}". This may cause issues.`;
        }
      }

      return {
        success: true,
        data: {
          suggestion: `Recommended workflow structure for ${phase} phase`,
          ...suggestions,
          statusWarning,
          shouldCreate: true,
          shouldModify: false
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Suggestion failed: ${error.message}`
      };
    }
  }

  private static validateWorkflowStructure(nodes: any[], edges: any[], targetPhase?: string, sessionStatus?: string): {
    valid: boolean;
    errors: any[];
    warnings: any[];
  } {
    const errors: any[] = [];
    const warnings: any[] = [];

    if (!nodes || nodes.length === 0) {
      errors.push({ code: 'NO_NODES', message: 'Workflow must have at least one node' });
      return { valid: false, errors, warnings };
    }

    // Check for start node
    const startNodes = nodes.filter((n: any) => n.type === 'start');
    if (startNodes.length === 0) {
      errors.push({ code: 'MISSING_START_NODE', message: 'Workflow must have a start node' });
    } else if (startNodes.length > 1) {
      errors.push({ code: 'MULTIPLE_START_NODES', message: 'Workflow must have exactly one start node' });
    }

    // Check for end node
    const endNodes = nodes.filter((n: any) => n.type === 'end');
    if (endNodes.length === 0) {
      errors.push({ code: 'MISSING_END_NODE', message: 'Workflow must have an end node' });
    } else if (endNodes.length > 1) {
      errors.push({ code: 'MULTIPLE_END_NODES', message: 'Workflow must have exactly one end node' });
    }

    // Check for orphaned nodes
    const nodeIds = new Set(nodes.map((n: any) => n.id));
    const connectedNodes = new Set<string>();
    edges.forEach((e: any) => {
      connectedNodes.add(e.source);
      connectedNodes.add(e.target);
    });

    nodeIds.forEach(id => {
      if (!connectedNodes.has(id)) {
        const node = nodes.find((n: any) => n.id === id);
        // Start and end nodes can be unconnected if they're the only nodes
        if (node?.type !== 'start' && node?.type !== 'end') {
          errors.push({
            code: 'ORPHANED_NODE',
            message: `Node ${id} is not connected to the workflow`,
            nodeId: id
          });
        }
      }
    });

    // Check for invalid edge references
    edges.forEach((e: any) => {
      if (!nodeIds.has(e.source)) {
        errors.push({
          code: 'INVALID_EDGE_SOURCE',
          message: `Edge ${e.id} references non-existent source node ${e.source}`,
          edgeId: e.id
        });
      }
      if (!nodeIds.has(e.target)) {
        errors.push({
          code: 'INVALID_EDGE_TARGET',
          message: `Edge ${e.id} references non-existent target node ${e.target}`,
          edgeId: e.id
        });
      }
    });

    // Validate Agent nodes
    const agentNodes = nodes.filter((n: any) => n.type === 'agent');
    agentNodes.forEach((node: any) => {
      const validAgentRoles = ['COORDINATOR', 'QC_BOT', 'INGEST_BOT', 'DELIVERY_BOT', 'ASSISTANT'];
      const agentRole = node.data?.role;

      if (!agentRole) {
        warnings.push({
          code: 'AGENT_MISSING_ROLE',
          message: `Agent node ${node.id} is missing a role. Defaulting to ASSISTANT.`,
          nodeId: node.id
        });
      } else if (!validAgentRoles.includes(agentRole)) {
        errors.push({
          code: 'INVALID_AGENT_ROLE',
          message: `Agent node ${node.id} has invalid role "${agentRole}". Must be one of: ${validAgentRoles.join(', ')}`,
          nodeId: node.id
        });
      }

      // Validate networkMode if provided
      if (node.data?.networkMode && !['cloud', 'local', 'auto'].includes(node.data.networkMode)) {
        warnings.push({
          code: 'INVALID_NETWORK_MODE',
          message: `Agent node ${node.id} has invalid networkMode. Defaulting to "auto".`,
          nodeId: node.id
        });
      }

      // Validate executionMode if provided
      if (node.data?.executionMode && !['rule_based', 'llm_based'].includes(node.data.executionMode)) {
        warnings.push({
          code: 'INVALID_EXECUTION_MODE',
          message: `Agent node ${node.id} has invalid executionMode. Defaulting to "rule_based".`,
          nodeId: node.id
        });
      }
    });

    // Validate phase alignment if targetPhase is provided
    if (targetPhase) {
      const validTaskTypesByPhase: Record<string, string[]> = {
        'PRE_PRODUCTION': ['GENERAL_TASK', 'COMMUNICATION'],
        'PRODUCTION': ['GENERAL_TASK', 'COMMUNICATION'],
        'POST_PRODUCTION': ['INGEST', 'EDITORIAL', 'COLOR', 'AUDIO', 'GRAPHICS', 'QC', 'REVIEW', 'COMMUNICATION', 'GENERAL_TASK'],
        'DELIVERY': ['QC', 'REVIEW', 'COMMUNICATION', 'GENERAL_TASK']
      };

      const validTaskTypes = validTaskTypesByPhase[targetPhase] || [];
      const taskNodes = nodes.filter((n: any) => n.type === 'task' && n.data?.taskType);

      taskNodes.forEach((node: any) => {
        const taskType = node.data.taskType;
        if (validTaskTypes.length > 0 && !validTaskTypes.includes(taskType)) {
          warnings.push({
            code: 'PHASE_TASK_TYPE_MISMATCH',
            message: `Task node ${node.id} has taskType "${taskType}" which may not be appropriate for phase "${targetPhase}". Consider using: ${validTaskTypes.join(', ')}`,
            nodeId: node.id,
            taskType,
            targetPhase
          });
        }
      });
    }

    // Validate session status alignment if provided
    if (sessionStatus) {
      const statusPhaseMap: Record<string, string> = {
        'PLANNING': 'PRE_PRODUCTION',
        'PLANNED': 'PRE_PRODUCTION',
        'PRE_PRODUCTION': 'PRE_PRODUCTION',
        'PRODUCTION_IN_PROGRESS': 'PRODUCTION',
        'IN_PRODUCTION': 'PRODUCTION',
        'PREPARE_FOR_POST': 'PRODUCTION',
        'READY_FOR_POST': 'POST_PRODUCTION',
        'POST_PRODUCTION': 'POST_PRODUCTION',
        'POST_IN_PROGRESS': 'POST_PRODUCTION',
        'CHANGES_NEEDED': 'POST_PRODUCTION',
        'WAITING_FOR_APPROVAL': 'POST_PRODUCTION',
        'DELIVERY': 'DELIVERY',
        'PHASE_4_POST_PRODUCTION': 'DELIVERY',
        'COMPLETED': 'DELIVERY',
        'ARCHIVED': 'ARCHIVED',
        'CANCELED': 'ARCHIVED',
        'ON_HOLD': 'PRE_PRODUCTION' // Can resume from any phase
      };

      const expectedPhase = statusPhaseMap[sessionStatus];
      if (expectedPhase && targetPhase && expectedPhase !== targetPhase) {
        warnings.push({
          code: 'STATUS_PHASE_MISMATCH',
          message: `Session status "${sessionStatus}" typically corresponds to phase "${expectedPhase}", but workflow is targeting phase "${targetPhase}". This may cause issues.`,
          sessionStatus,
          expectedPhase,
          targetPhase
        });
      }
    }

    // Check for cycles (simplified - full DFS would be better)
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recStack.add(nodeId);

      const outgoingEdges = edges.filter((e: any) => e.source === nodeId);
      for (const edge of outgoingEdges) {
        if (hasCycle(edge.target)) {
          errors.push({
            code: 'CYCLE_DETECTED',
            message: `Cycle detected involving node ${nodeId}`,
            edgeId: edge.id
          });
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    nodes.forEach((n: any) => {
      if (!visited.has(n.id)) {
        hasCycle(n.id);
      }
    });

    // Warnings
    if (nodes.length > 20) {
      warnings.push({
        code: 'LARGE_WORKFLOW',
        message: 'Workflow has many nodes, consider breaking into smaller workflows'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private static async generateReport(args: any): Promise<FunctionCallResult> {
    try {
      const { organizationId, projectId, reportType, options } = args;
      if (!projectId) {
        return { success: false, error: 'projectId is required' };
      }

      const reportGenerator = new ReportGeneratorService();
      const result = await reportGenerator.generateReport(
        projectId,
        reportType || 'executive',
        options || {}
      );

      return {
        success: true,
        data: result
      };
    } catch (error: any) {
      return { success: false, error: `Report generation failed: ${error.message}` };
    }
  }

  private static async analyzeProject(args: any): Promise<FunctionCallResult> {
    try {
      const { projectId, analysisType, focusAreas } = args;
      if (!projectId) {
        return { success: false, error: 'projectId is required' };
      }

      // TODO: Mock data collection needs to be consistent
      const projectData = {
        projectName: "Project Alpha",
        organizationId: "org-123",
        projectId: projectId,
        dateRange: { start: "2024-01-01", end: "2024-12-31" },
        budget: { allocated: 50000, spent: 35000 },
        sessions: [], workflows: [], team: [], deliverables: []
      };

      const analysisService = new DocumentAnalysisService();
      const insights = await analysisService.analyzeProject(projectData, {
        reportType: (analysisType as any) || 'executive',
        focusAreas
      });

      return {
        success: true,
        data: insights
      };
    } catch (error: any) {
      return { success: false, error: `Analysis failed: ${error.message}` };
    }
  }

  private static async exportReport(args: any): Promise<FunctionCallResult> {
    try {
      const { organizationId, reportUrl, destination, recipient } = args;
      if (!organizationId || !reportUrl || !destination) {
        return { success: false, error: 'organizationId, reportUrl, and destination are required' };
      }

      const exportService = new ReportExportService();
      const result = await exportService.exportReport(organizationId, reportUrl, {
        type: destination,
        recipient: recipient || ''
      });

      return {
        success: result.success,
        data: result,
        error: result.success ? undefined : result.message
      };
    } catch (error: any) {
      return { success: false, error: `Export failed: ${error.message}` };
    }
  }
}

