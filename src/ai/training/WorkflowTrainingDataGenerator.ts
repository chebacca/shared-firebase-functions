/**
 * Workflow Training Data Generator
 * 
 * Extracts workflow knowledge from app data:
 * - Status definitions and meanings
 * - Valid status transitions
 * - Prerequisites for each phase
 * - Common workflow questions and answers
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface TrainingExample {
  prompt: string;
  completion: string;
  category: 'workflow' | 'role' | 'alert' | 'pattern';
  metadata?: any;
}

/**
 * Generate workflow training data
 */
export async function generateWorkflowTrainingData(
  organizationId?: string
): Promise<TrainingExample[]> {
  const examples: TrainingExample[] = [];

  // Status definitions
  const pitchStatusDefinitions = [
    {
      status: 'Pitched',
      meaning: 'Initial pitch submission by researcher/clearance coordinator',
      nextStatuses: ['Pursue Clearance', 'Do Not Pursue Clearance', 'Killed']
    },
    {
      status: 'Pursue Clearance',
      meaning: 'Producer approves pursuit of clearance',
      nextStatuses: ['Ready to License', 'Do Not Pursue Clearance', 'Killed']
    },
    {
      status: 'Ready to License',
      meaning: 'Clearance coordinator has prepared pitch for licensing specialist',
      nextStatuses: ['Pending Signature', 'License Cleared', 'Killed']
    },
    {
      status: 'License Cleared',
      meaning: 'License agreement signed and finalized',
      nextStatuses: ['Ready for Script']
    },
    {
      status: 'Ready for Script',
      meaning: 'Automatically set when license is signed - ready to create story',
      nextStatuses: []
    }
  ];

  pitchStatusDefinitions.forEach(def => {
    examples.push({
      prompt: `What does the status "${def.status}" mean in Clip Show Pro?`,
      completion: `${def.status}: ${def.meaning}. Valid next statuses: ${def.nextStatuses.join(', ') || 'None (final status)'}.`,
      category: 'workflow',
      metadata: { entityType: 'pitch', status: def.status }
    });

    examples.push({
      prompt: `What are the valid next statuses from "${def.status}"?`,
      completion: `From "${def.status}", you can move to: ${def.nextStatuses.join(', ') || 'None - this is a final status'}.`,
      category: 'workflow',
      metadata: { entityType: 'pitch', status: def.status }
    });
  });

  const storyStatusDefinitions = [
    {
      status: 'Draft',
      meaning: 'Story created from pitch, initial state before scripting begins',
      nextStatuses: ['Script Writing', 'Ready for Script', 'In Progress']
    },
    {
      status: 'Script Writing',
      meaning: 'Writer is creating the script',
      nextStatuses: ['Script Review', 'Script Complete', 'Scripting Notes']
    },
    {
      status: 'Script Complete',
      meaning: 'Script approved and finalized - automatically proceeds to Edit Phase (A Roll)',
      nextStatuses: ['A Roll']
    },
    {
      status: 'A Roll',
      meaning: 'Initial edit assembly - first cut of the story',
      nextStatuses: ['A Roll Notes', 'v1 Edit']
    },
    {
      status: 'v1 Edit',
      meaning: 'Version 1 edit - first revision after A Roll',
      nextStatuses: ['v1 Notes', 'v2 Edit']
    },
    {
      status: 'Ready for Build',
      meaning: 'Edit is ready for final assembly and finishing',
      nextStatuses: ['RC', 'Assembled']
    },
    {
      status: 'Assembled',
      meaning: 'Final assembly completed - story is complete',
      nextStatuses: []
    }
  ];

  storyStatusDefinitions.forEach(def => {
    examples.push({
      prompt: `What does the story status "${def.status}" mean?`,
      completion: `${def.status}: ${def.meaning}. Valid next statuses: ${def.nextStatuses.join(', ') || 'None (final status)'}.`,
      category: 'workflow',
      metadata: { entityType: 'story', status: def.status }
    });
  });

  // Workflow questions
  examples.push({
    prompt: 'How do I create a story from a pitch?',
    completion: 'When a pitch reaches "Ready for Script" status, navigate to Stories & Scripts Page → Stories Tab and click "Create Story" to link a new story to the pitch. The story will be created with initial status "Draft" or "Ready for Script".',
    category: 'workflow'
  });

  examples.push({
    prompt: 'When can a story enter edit phase?',
    completion: 'A story can enter edit phase (A Roll) when: 1) The story status is "Script Complete", 2) The story has transcodingStatus "Ingested" or "Edit Ready" (managed on Edit Page → Transcode/Ingest tab). Once transcoding is ready, change status to "A Roll" to begin the edit workflow.',
    category: 'workflow'
  });

  examples.push({
    prompt: 'What is the complete workflow from pitch to assembled story?',
    completion: 'Complete workflow: 1) Pitch Submitted (Pitched) → 2) Producer Approves (Pursue Clearance) → 3) Clearance Coordinator Works (Ready to License) → 4) Licensing Specialist Acquires License (License Cleared) → 5) Automatically (Ready for Script) → 6) Story Created (Draft/Ready for Script) → 7) Writer Creates Script (Script Complete) → 8) Transcoding (Ingested/Edit Ready) → 9) Editor Creates A Roll → 10) Version Edits (v1-v5) → 11) Ready for Build → 12) RC → 13) Assembled.',
    category: 'workflow'
  });

  // Prerequisites
  examples.push({
    prompt: 'What are the prerequisites for entering edit phase?',
    completion: 'Before entering edit phase (A Roll), ensure: 1) Story status is "Script Complete", 2) Story has transcodingStatus "Ingested" or "Edit Ready" (check Edit Page → Transcode/Ingest tab).',
    category: 'workflow'
  });

  examples.push({
    prompt: 'What are the prerequisites for creating a story from a pitch?',
    completion: 'Before creating a story from a pitch: 1) Pitch status must be "Ready for Script" (automatically set when license is signed), 2) License must be cleared and signed.',
    category: 'workflow'
  });

  return examples;
}










