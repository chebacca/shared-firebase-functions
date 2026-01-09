/**
 * Workflow Template Validation Service
 * 
 * Validates workflow templates for:
 * - Structure (nodes, edges, phases)
 * - Dependencies (circular, invalid references)
 * - Phase sequence (logical flow)
 * - Auto-repairs common issues
 */

export type SessionPhase = 'PRE_PRODUCTION' | 'PRODUCTION' | 'POST_PRODUCTION' | 'DELIVERY';

export interface WorkflowNode {
  id: string;
  type?: string;
  data?: {
    label?: string;
    phase?: SessionPhase;
    [key: string]: any;
  };
  phase?: SessionPhase;
  position?: { x: number; y: number };
  [key: string]: any;
}

export interface WorkflowEdge {
  id?: string;
  source: string;
  target: string;
  [key: string]: any;
}

export interface WorkflowTemplate {
  id?: string;
  name?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  steps?: any[];
  phase?: SessionPhase;
  workflowPhase?: SessionPhase;
  [key: string]: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  repaired?: WorkflowTemplate;
}

export interface ValidationError {
  type: 'structure' | 'dependency' | 'phase' | 'circular';
  message: string;
  nodeId?: string;
  edgeId?: string;
  details?: any;
}

export interface ValidationWarning {
  type: 'missing_field' | 'suggested_fix';
  message: string;
  nodeId?: string;
  edgeId?: string;
  suggestion?: string;
}

const PHASES: SessionPhase[] = ['PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'DELIVERY'];
const PHASE_ORDER: Record<SessionPhase, number> = {
  'PRE_PRODUCTION': 1,
  'PRODUCTION': 2,
  'POST_PRODUCTION': 3,
  'DELIVERY': 4
};

export class WorkflowTemplateValidator {
  /**
   * Validate template structure
   */
  static validateTemplateStructure(template: WorkflowTemplate): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check if template has nodes or steps
    const nodes = template.nodes || [];
    const edges = template.edges || [];
    const steps = template.steps || [];

    if (nodes.length === 0 && steps.length === 0) {
      errors.push({
        type: 'structure',
        message: 'Template has no nodes or steps'
      });
      return { isValid: false, errors, warnings };
    }

    // Validate nodes
    const nodeIdSet = new Set<string>();
    const duplicateNodeIds: string[] = [];

    for (const node of nodes) {
      if (!node.id) {
        errors.push({
          type: 'structure',
          message: 'Node missing id',
          nodeId: node.id
        });
        continue;
      }

      if (nodeIdSet.has(node.id)) {
        duplicateNodeIds.push(node.id);
        errors.push({
          type: 'structure',
          message: `Duplicate node id: ${node.id}`,
          nodeId: node.id
        });
      }
      nodeIdSet.add(node.id);

      // Check for phase assignment
      const phase = node.data?.phase || node.phase || template.phase || template.workflowPhase;
      if (!phase || !PHASES.includes(phase)) {
        warnings.push({
          type: 'missing_field',
          message: `Node ${node.id} missing phase assignment`,
          nodeId: node.id,
          suggestion: 'Assign a phase (PRE_PRODUCTION, PRODUCTION, POST_PRODUCTION, or DELIVERY)'
        });
      }
    }

    // Validate edges
    for (const edge of edges) {
      if (!edge.source || !edge.target) {
        errors.push({
          type: 'structure',
          message: 'Edge missing source or target',
          edgeId: edge.id
        });
        continue;
      }

      if (!nodeIdSet.has(edge.source)) {
        errors.push({
          type: 'structure',
          message: `Edge source nodeId "${edge.source}" not found in nodes`,
          edgeId: edge.id,
          nodeId: edge.source
        });
      }

      if (!nodeIdSet.has(edge.target)) {
        errors.push({
          type: 'structure',
          message: `Edge target nodeId "${edge.target}" not found in nodes`,
          edgeId: edge.id,
          nodeId: edge.target
        });
      }

      // Self-referencing edge
      if (edge.source === edge.target) {
        warnings.push({
          type: 'suggested_fix',
          message: `Edge ${edge.id || 'unnamed'} has same source and target`,
          edgeId: edge.id,
          suggestion: 'Remove self-referencing edge'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate dependencies (no circular refs, valid references)
   */
  static validateDependencies(template: WorkflowTemplate): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const nodes = template.nodes || [];
    const edges = template.edges || [];

    if (nodes.length === 0) {
      return { isValid: true, errors, warnings };
    }

    const nodeIdSet = new Set(nodes.map(n => n.id).filter(Boolean));
    const dependencyMap = new Map<string, string[]>(); // target -> [sources]
    const reverseDependencyMap = new Map<string, string[]>(); // source -> [targets]

    // Build dependency maps from edges
    for (const edge of edges) {
      if (!edge.source || !edge.target) continue;
      if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) continue;

      // Add to dependency map
      if (!dependencyMap.has(edge.target)) {
        dependencyMap.set(edge.target, []);
      }
      dependencyMap.get(edge.target)!.push(edge.source);

      // Add to reverse map
      if (!reverseDependencyMap.has(edge.source)) {
        reverseDependencyMap.set(edge.source, []);
      }
      reverseDependencyMap.get(edge.source)!.push(edge.target);
    }

    // Check for direct circular dependencies
    for (const [target, sources] of dependencyMap.entries()) {
      for (const source of sources) {
        const sourceDeps = dependencyMap.get(source) || [];
        if (sourceDeps.includes(target)) {
          errors.push({
            type: 'circular',
            message: `Circular dependency detected: ${source} <-> ${target}`,
            nodeId: source,
            details: { source, target }
          });
        }
      }
    }

    // Check for longer cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true; // Cycle detected
      }
      if (visited.has(nodeId)) {
        return false; // Already processed
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependencies = dependencyMap.get(nodeId) || [];
      for (const dep of dependencies) {
        if (hasCycle(dep)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (node.id && !visited.has(node.id)) {
        if (hasCycle(node.id)) {
          errors.push({
            type: 'circular',
            message: `Circular dependency chain detected involving node ${node.id}`,
            nodeId: node.id
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate phase sequence (logical flow)
   */
  static validatePhaseSequence(template: WorkflowTemplate): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const nodes = template.nodes || [];
    const edges = template.edges || [];

    if (nodes.length === 0) {
      return { isValid: true, errors, warnings };
    }

    // Group nodes by phase
    const nodesByPhase: Record<SessionPhase, WorkflowNode[]> = {
      'PRE_PRODUCTION': [],
      'PRODUCTION': [],
      'POST_PRODUCTION': [],
      'DELIVERY': []
    };

    const defaultPhase = template.phase || template.workflowPhase || 'PRODUCTION';

    for (const node of nodes) {
      const phase = (node.data?.phase || node.phase || defaultPhase) as SessionPhase;
      if (PHASES.includes(phase)) {
        nodesByPhase[phase].push(node);
      } else {
        warnings.push({
          type: 'missing_field',
          message: `Node ${node.id} has invalid phase: ${phase}`,
          nodeId: node.id,
          suggestion: `Use one of: ${PHASES.join(', ')}`
        });
      }
    }

    // Check if edges respect phase order
    for (const edge of edges) {
      if (!edge.source || !edge.target) continue;

      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) continue;

      const sourcePhase = (sourceNode.data?.phase || sourceNode.phase || defaultPhase) as SessionPhase;
      const targetPhase = (targetNode.data?.phase || targetNode.phase || defaultPhase) as SessionPhase;

      if (PHASES.includes(sourcePhase) && PHASES.includes(targetPhase)) {
        const sourceOrder = PHASE_ORDER[sourcePhase];
        const targetOrder = PHASE_ORDER[targetPhase];

        if (sourceOrder > targetOrder) {
          errors.push({
            type: 'phase',
            message: `Edge from ${sourcePhase} to ${targetPhase} violates phase sequence`,
            edgeId: edge.id,
            nodeId: edge.source,
            details: {
              sourcePhase,
              targetPhase,
              sourceNode: edge.source,
              targetNode: edge.target
            }
          });
        }
      }
    }

    // Check if phases are in correct order in the template
    const phasesPresent = PHASES.filter(phase => nodesByPhase[phase].length > 0);
    if (phasesPresent.length > 1) {
      for (let i = 1; i < phasesPresent.length; i++) {
        const prevPhase = phasesPresent[i - 1];
        const currPhase = phasesPresent[i];
        if (PHASE_ORDER[prevPhase] >= PHASE_ORDER[currPhase]) {
          errors.push({
            type: 'phase',
            message: `Phase sequence invalid: ${prevPhase} should come before ${currPhase}`,
            details: { prevPhase, currPhase }
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Comprehensive validation (all checks)
   */
  static validate(template: WorkflowTemplate): ValidationResult {
    const structureResult = this.validateTemplateStructure(template);
    const dependencyResult = this.validateDependencies(template);
    const phaseResult = this.validatePhaseSequence(template);

    const allErrors = [
      ...structureResult.errors,
      ...dependencyResult.errors,
      ...phaseResult.errors
    ];

    const allWarnings = [
      ...structureResult.warnings,
      ...dependencyResult.warnings,
      ...phaseResult.warnings
    ];

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }

  /**
   * Repair common template issues
   */
  static repairTemplate(template: WorkflowTemplate): WorkflowTemplate {
    const repaired = JSON.parse(JSON.stringify(template)); // Deep clone
    const nodes = repaired.nodes || [];
    const edges = repaired.edges || [];
    const defaultPhase = repaired.phase || repaired.workflowPhase || 'PRODUCTION';

    // Repair missing node IDs
    let nodeIdCounter = 1;
    for (const node of nodes) {
      if (!node.id) {
        node.id = `node-${nodeIdCounter++}`;
      }
    }

    // Repair missing phases
    for (const node of nodes) {
      if (!node.data) {
        node.data = {};
      }
      if (!node.data.phase && !node.phase) {
        node.data.phase = defaultPhase;
      }
    }

    // Remove invalid edges
    const nodeIdSet = new Set(nodes.map((n: WorkflowNode) => n.id).filter(Boolean));
    repaired.edges = edges.filter((edge: WorkflowEdge) => {
      if (!edge.source || !edge.target) return false;
      if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) return false;
      if (edge.source === edge.target) return false; // Remove self-referencing
      return true;
    });

    // Add missing edge IDs
    let edgeIdCounter = 1;
    for (const edge of repaired.edges) {
      if (!edge.id) {
        edge.id = `edge-${edgeIdCounter++}`;
      }
    }

    return repaired;
  }

  /**
   * Validate and repair template
   */
  static validateAndRepair(template: WorkflowTemplate): ValidationResult & { repaired: WorkflowTemplate } {
    const validation = this.validate(template);
    const repaired = this.repairTemplate(template);
    const repairedValidation = this.validate(repaired);

    return {
      ...validation,
      repaired,
      isValid: repairedValidation.isValid,
      errors: [...validation.errors, ...repairedValidation.errors],
      warnings: [...validation.warnings, ...repairedValidation.warnings]
    };
  }
}

