/**
 * Role Training Data Generator
 * 
 * Generates role-specific knowledge:
 * - What each role does
 * - Typical workflow steps per role
 * - Permission boundaries per role
 */

import { TrainingExample } from './WorkflowTrainingDataGenerator';

/**
 * Generate role training data
 */
export function generateRoleTrainingData(): TrainingExample[] {
  const examples: TrainingExample[] = [];

  const roleDefinitions = [
    {
      role: 'WRITER',
      responsibilities: ['Write scripts', 'Revise scripts', 'Complete script drafts'],
      workflowSteps: ['Script Writing', 'Script Review', 'Script Revisions', 'Script Complete'],
      description: 'Writers are responsible for creating and refining scripts for stories. They work on stories in the Script Development phase.'
    },
    {
      role: 'EDITOR',
      responsibilities: ['Create A Roll', 'Create version edits (v1-v5)', 'Address edit notes', 'Complete assembly'],
      workflowSteps: ['A Roll', 'v1 Edit', 'v2 Edit', 'v3 Edit', 'v4 Edit', 'v5 Edit', 'Ready for Build', 'RC', 'Assembled'],
      description: 'Editors handle the edit workflow, creating initial cuts (A Roll) and version edits (v1-v5), addressing notes, and completing final assembly.'
    },
    {
      role: 'PRODUCER',
      responsibilities: ['Approve pitches', 'Oversee production', 'Review scripts', 'Approve final cuts'],
      workflowSteps: ['Pursue Clearance', 'Ready to License', 'License Cleared', 'Ready for Script', 'Script Review', 'Script Complete', 'Ready for Build'],
      description: 'Producers approve pitches, oversee production, review scripts, and approve final cuts. They have decision-making authority throughout the workflow.'
    },
    {
      role: 'ASSOCIATE_PRODUCER',
      responsibilities: ['Coordinate workflow', 'Manage assignments', 'Track progress'],
      workflowSteps: ['Pursue Clearance', 'Ready to License', 'Script Writing', 'Script Review'],
      description: 'Associate Producers coordinate workflow, manage team assignments, and track progress across pitches and stories.'
    },
    {
      role: 'CLEARANCE_COORDINATOR',
      responsibilities: ['Research clips', 'Pursue clearance', 'Prepare for licensing'],
      workflowSteps: ['Pitched', 'Pursue Clearance', 'Ready to License'],
      description: 'Clearance Coordinators research clips, pursue clearance, and prepare pitches for licensing specialists.'
    },
    {
      role: 'LICENSING_SPECIALIST',
      responsibilities: ['Acquire licenses', 'Finalize license agreements', 'Clear licenses'],
      workflowSteps: ['Ready to License', 'Pending Signature', 'License Cleared'],
      description: 'Licensing Specialists acquire licenses, finalize license agreements, and clear licenses for pitches.'
    },
    {
      role: 'RESEARCHER',
      responsibilities: ['Research clips', 'Create pitches', 'Gather source material'],
      workflowSteps: ['Pitched'],
      description: 'Researchers research clips, create initial pitches, and gather source material for potential stories.'
    }
  ];

  roleDefinitions.forEach(roleDef => {
    // What does this role do?
    examples.push({
      prompt: `What does a ${roleDef.role} do in Clip Show Pro?`,
      completion: `${roleDef.description}. Responsibilities: ${roleDef.responsibilities.join(', ')}.`,
      category: 'role',
      metadata: { role: roleDef.role }
    });

    // What workflow steps does this role handle?
    examples.push({
      prompt: `What workflow steps does a ${roleDef.role} handle?`,
      completion: `A ${roleDef.role} handles these workflow steps: ${roleDef.workflowSteps.join(', ')}.`,
      category: 'role',
      metadata: { role: roleDef.role }
    });

    // Role-specific questions
    examples.push({
      prompt: `Who is responsible for ${roleDef.responsibilities[0]}?`,
      completion: `${roleDef.role}s are responsible for ${roleDef.responsibilities[0]}.`,
      category: 'role',
      metadata: { role: roleDef.role }
    });
  });

  // Cross-role questions
  examples.push({
    prompt: 'Who writes scripts?',
    completion: 'WRITERs (or cspWriter role) write scripts. They work on stories in the Script Development phase, creating and refining scripts until they reach "Script Complete" status.',
    category: 'role'
  });

  examples.push({
    prompt: 'Who creates edits?',
    completion: 'EDITORs create edits. They start with A Roll (initial edit assembly), then create version edits (v1-v5), address notes, and complete final assembly.',
    category: 'role'
  });

  examples.push({
    prompt: 'Who approves pitches?',
    completion: 'PRODUCERs approve pitches. When a pitch is submitted, producers review it and can move it to "Pursue Clearance" status if approved, or "Do Not Pursue Clearance" or "Killed" if rejected.',
    category: 'role'
  });

  return examples;
}










