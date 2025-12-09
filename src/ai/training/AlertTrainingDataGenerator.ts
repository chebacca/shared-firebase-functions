/**
 * Alert Training Data Generator
 * 
 * Generates alert scenario training data:
 * - Examples of overdue items
 * - Scheduling conflict scenarios
 * - Bottleneck detection examples
 * - Suggested actions for each scenario
 */

import { TrainingExample } from './WorkflowTrainingDataGenerator';

/**
 * Generate alert training data
 */
export function generateAlertTrainingData(): TrainingExample[] {
  const examples: TrainingExample[] = [];

  // Overdue item scenarios
  examples.push({
    prompt: 'A pitch has been in "Pursue Clearance" status for 15 days. What should I do?',
    completion: 'This pitch is overdue. The average time in "Pursue Clearance" is typically 3-5 days. Suggested actions: 1) Check if the clearance coordinator needs assistance, 2) Review if additional information is needed, 3) Consider reassigning if the current coordinator is overloaded, 4) Contact the assigned clearance coordinator to check status.',
    category: 'alert',
    metadata: { alertType: 'overdue', entityType: 'pitch', status: 'Pursue Clearance' }
  });

  examples.push({
    prompt: 'A story has been in "Script Writing" status for 20 days. Is this normal?',
    completion: 'This story is overdue. The average time in "Script Writing" is typically 7-10 days. Suggested actions: 1) Check with the assigned writer about progress, 2) Review if the writer needs additional resources or information, 3) Consider extending the deadline if needed, 4) Check if the writer is overloaded with other assignments.',
    category: 'alert',
    metadata: { alertType: 'overdue', entityType: 'story', status: 'Script Writing' }
  });

  examples.push({
    prompt: 'A story has been in "A Roll Notes" status for 10 days. What should I do?',
    completion: 'This story is overdue in the edit phase. The average time to address A Roll notes is typically 2-3 days. Suggested actions: 1) Check with the editor about note resolution progress, 2) Review if the notes are clear and actionable, 3) Consider scheduling a review meeting, 4) Check if the editor needs additional resources.',
    category: 'alert',
    metadata: { alertType: 'overdue', entityType: 'story', status: 'A Roll Notes' }
  });

  // Scheduling conflict scenarios
  examples.push({
    prompt: 'A writer has 3 stories all due for script completion on the same day. What should I do?',
    completion: 'This is a scheduling conflict. The writer has multiple high-priority items due on the same day. Suggested actions: 1) Prioritize the stories based on show/season importance, 2) Extend deadlines for lower-priority stories, 3) Consider reassigning one or more stories to another writer, 4) Check if any stories can be delayed without impacting the production schedule.',
    category: 'alert',
    metadata: { alertType: 'conflict', entityType: 'story', conflictType: 'same_user_same_day' }
  });

  examples.push({
    prompt: 'An editor has 2 stories both requiring A Roll completion on Friday. Is this a problem?',
    completion: 'This is a scheduling conflict. The editor has multiple stories requiring A Roll completion on the same day. Suggested actions: 1) Check if one story can be delayed to the following week, 2) Consider if the editor can complete both with extended hours, 3) Reassign one story to another editor if available, 4) Review the production schedule to see if deadlines can be adjusted.',
    category: 'alert',
    metadata: { alertType: 'conflict', entityType: 'story', conflictType: 'same_user_same_day' }
  });

  // Bottleneck scenarios
  examples.push({
    prompt: 'There are 8 pitches stuck in "Pursue Clearance" status. What does this indicate?',
    completion: 'This indicates a bottleneck in the clearance phase. Multiple pitches are waiting longer than usual. Suggested actions: 1) Review clearance coordinator workload and capacity, 2) Check if there are process issues causing delays, 3) Consider adding additional clearance coordinators, 4) Review if pitches need additional information before clearance can proceed, 5) Identify and address the root cause of the bottleneck.',
    category: 'alert',
    metadata: { alertType: 'bottleneck', entityType: 'pitch', status: 'Pursue Clearance' }
  });

  examples.push({
    prompt: 'There are 5 stories stuck in "Script Review" status. What should I do?',
    completion: 'This indicates a bottleneck in script review. Multiple stories are waiting for producer review. Suggested actions: 1) Check producer availability and schedule dedicated review time, 2) Review if scripts are ready for review (complete and formatted correctly), 3) Consider delegating some reviews to associate producers if appropriate, 4) Set up a review schedule to process scripts systematically, 5) Identify if there are common issues causing scripts to be sent back for revision.',
    category: 'alert',
    metadata: { alertType: 'bottleneck', entityType: 'story', status: 'Script Review' }
  });

  // At-risk items
  examples.push({
    prompt: 'A story is due for script completion in 2 days but is still in "Script Writing" status. What should I do?',
    completion: 'This story is at risk of missing its deadline. With only 2 days remaining, immediate action is needed. Suggested actions: 1) Contact the writer immediately to check progress, 2) Determine if the deadline can be extended if needed, 3) Check if additional resources or support can help the writer complete on time, 4) Review if the story scope can be adjusted to meet the deadline, 5) Prepare a backup plan if the deadline cannot be met.',
    category: 'alert',
    metadata: { alertType: 'at_risk', entityType: 'story', daysUntilDeadline: 2 }
  });

  examples.push({
    prompt: 'A pitch needs to be ready for licensing in 3 days but is still in "Pursue Clearance". Is this a concern?',
    completion: 'This pitch is at risk. With only 3 days until the licensing deadline, the clearance process needs to be expedited. Suggested actions: 1) Prioritize this pitch for the clearance coordinator, 2) Check if all required information is available for clearance, 3) Review if the deadline is realistic or if it needs to be adjusted, 4) Consider if additional resources can help expedite clearance, 5) Communicate with stakeholders about the timeline.',
    category: 'alert',
    metadata: { alertType: 'at_risk', entityType: 'pitch', daysUntilDeadline: 3 }
  });

  // User workload scenarios
  examples.push({
    prompt: 'A writer has 8 stories assigned and 3 are overdue. What should I do?',
    completion: 'This writer is overloaded and has multiple overdue items. Suggested actions: 1) Review the writer\'s total workload and capacity, 2) Reassign some stories to other writers to balance the workload, 3) Extend deadlines for non-critical stories, 4) Check if the writer needs additional support or resources, 5) Review assignment patterns to prevent future overload.',
    category: 'alert',
    metadata: { alertType: 'workload', entityType: 'story', role: 'WRITER' }
  });

  examples.push({
    prompt: 'An editor has 6 stories in edit phase and 2 are overdue. How should I handle this?',
    completion: 'This editor has a high workload with some overdue items. Suggested actions: 1) Review the editor\'s capacity and current assignments, 2) Prioritize overdue items and allocate focused time, 3) Consider reassigning some stories to other editors if available, 4) Review if deadlines are realistic given the workload, 5) Check if the editor needs additional support or resources.',
    category: 'alert',
    metadata: { alertType: 'workload', entityType: 'story', role: 'EDITOR' }
  });

  return examples;
}










