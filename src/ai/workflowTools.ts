/**
 * Workflow Function Declarations for Gemini Function Calling
 * 
 * Defines all available functions that the Workflow Architect AI can call
 * to create, validate, modify, and manage workflows.
 */

export const workflowFunctionDeclarations = [
  {
    name: 'create_workflow',
    description: 'Create a new workflow with nodes and edges based on user requirements. Use this for initial workflow creation.',
    parameters: {
      type: 'object',
      properties: {
        name: { 
          type: 'string', 
          description: 'Descriptive name for the workflow (e.g., "Post-Production Review Workflow")' 
        },
        description: { 
          type: 'string', 
          description: 'Detailed description of what this workflow accomplishes' 
        },
        targetPhase: {
          type: 'string',
          enum: ['PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'DELIVERY'],
          description: 'Target phase for this workflow. Influences node types, task types, and role assignments. Use POST_PRODUCTION for editing workflows, PRODUCTION for on-set workflows, DELIVERY for finalization workflows.'
        },
        sessionStatus: {
          type: 'string',
          description: 'Current session status (e.g., "READY_FOR_POST", "POST_PRODUCTION"). Used to validate workflow appropriateness and ensure phase alignment.'
        },
        nodes: { 
          type: 'array',
          description: 'Array of workflow nodes. Each node must have: id, type, position {x, y}, data {label, taskType, assignedRole, etc.}. Node types and task types should align with targetPhase.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { 
                type: 'string', 
                enum: ['task', 'approval', 'start', 'end', 'decision', 'agent'],
                description: 'Node type: "task" for standard workflow tasks, "agent" for AI Agent nodes that can automate tasks, "approval" for review gates, "start"/"end" for workflow boundaries, "decision" for conditional branching'
              },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              },
              data: { type: 'object' }
            }
          }
        },
        edges: {
          type: 'array',
          description: 'Array of connections between nodes. Each edge must have: id, source (node id), target (node id)',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              source: { type: 'string' },
              target: { type: 'string' },
              type: { type: 'string', default: 'default' }
            }
          }
        }
      },
      required: ['name', 'nodes', 'edges']
    }
  },
  {
    name: 'validate_workflow',
    description: 'Validate a workflow structure for errors including phase alignment, status compatibility, and edge cases. Always call this after creating or modifying a workflow.',
    parameters: {
      type: 'object',
      properties: {
        nodes: { 
          type: 'array',
          description: 'Array of workflow nodes to validate',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              },
              data: { type: 'object' }
            }
          }
        },
        edges: {
          type: 'array',
          description: 'Array of workflow edges to validate',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              source: { type: 'string' },
              target: { type: 'string' },
              type: { type: 'string' }
            }
          }
        },
        targetPhase: {
          type: 'string',
          enum: ['PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'DELIVERY'],
          description: 'Target phase for validation. Used to check phase alignment of task types and node types.'
        },
        sessionStatus: {
          type: 'string',
          description: 'Session status for validation. Used to check status-phase compatibility.'
        },
        checkPhaseAlignment: {
          type: 'boolean',
          description: 'Whether to validate phase alignment of nodes and task types. Defaults to true if targetPhase is provided.'
        }
      },
      required: ['nodes', 'edges']
    }
  },
  {
    name: 'fix_workflow_errors',
    description: 'Automatically fix validation errors in a workflow. Use this when validate_workflow returns errors.',
    parameters: {
      type: 'object',
      properties: {
        nodes: { 
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              },
              data: { type: 'object' }
            }
          }
        },
        edges: { 
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              source: { type: 'string' },
              target: { type: 'string' },
              type: { type: 'string' }
            }
          }
        },
        errors: {
          type: 'array',
          description: 'Array of validation errors from validate_workflow',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              nodeId: { type: 'string' },
              edgeId: { type: 'string' }
            }
          }
        }
      },
      required: ['nodes', 'edges', 'errors']
    }
  },
  {
    name: 'modify_workflow',
    description: 'Modify an existing workflow by adding, removing, or updating nodes. Use this for iterative changes.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add_after', 'add_before', 'remove', 'update', 'insert_parallel', 'replace'],
          description: 'Type of modification to perform'
        },
        targetNodeId: {
          type: 'string',
          description: 'ID of the node to modify or reference point for insertion'
        },
        newNodes: {
          type: 'array',
          description: 'New nodes to add (for add_after, add_before, insert_parallel)',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              },
              data: { type: 'object' }
            }
          }
        },
        updatedNode: {
          type: 'object',
          description: 'Updated node data (for update, replace)'
        },
        currentNodes: {
          type: 'array',
          description: 'Current workflow nodes',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              },
              data: { type: 'object' }
            }
          }
        },
        currentEdges: {
          type: 'array',
          description: 'Current workflow edges',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              source: { type: 'string' },
              target: { type: 'string' },
              type: { type: 'string' }
            }
          }
        }
      },
      required: ['action', 'currentNodes', 'currentEdges']
    }
  },
  {
    name: 'search_templates',
    description: 'Search for similar workflow templates that can be used as a starting point or reference.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "post-production", "review workflow")'
        },
        category: {
          type: 'string',
          description: 'Optional category filter'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'calculate_workflow_timeline',
    description: 'Calculate estimated timeline and dependencies for a workflow.',
    parameters: {
      type: 'object',
      properties: {
        nodes: { 
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' }
                }
              },
              data: { type: 'object' }
            }
          }
        },
        edges: { 
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              source: { type: 'string' },
              target: { type: 'string' },
              type: { type: 'string' }
            }
          }
        }
      },
      required: ['nodes', 'edges']
    }
  },
  {
    name: 'suggest_workflow_for_phase',
    description: 'Suggest an appropriate workflow structure for a specific session phase and status. Use this to get recommendations before creating a workflow.',
    parameters: {
      type: 'object',
      properties: {
        phase: {
          type: 'string',
          enum: ['PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'DELIVERY'],
          description: 'Target phase for the workflow'
        },
        sessionStatus: {
          type: 'string',
          description: 'Current session status (e.g., "READY_FOR_POST", "POST_PRODUCTION")'
        },
        existingWorkflows: {
          type: 'array',
          description: 'Array of existing workflow instances for this session',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              phase: { type: 'string' },
              status: { type: 'string' }
            }
          }
        },
        teamMembers: {
          type: 'array',
          description: 'Available team members and their roles',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              roleId: { type: 'string' },
              roleName: { type: 'string' }
            }
          }
        },
        deliverables: {
          type: 'array',
          description: 'Session deliverables that the workflow should support',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              type: { type: 'string' }
            }
          }
        }
      },
      required: ['phase']
    }
  }
];

