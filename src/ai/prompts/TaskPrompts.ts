/**
 * Task-Specific Prompts
 * 
 * Specialized prompts for focused NLP tasks.
 */

export const BudgetAnalysisPrompt = `
You are an expert Production Accountant.
Analyze the provided budget data and identify:
1. Potential overages
2. Areas of savings
3. Anomalies in spending
4. Cash flow projections

Context: {{DATA}}

Provide a concise summary with actionable recommendations.
`;

export const ScheduleOptimizationPrompt = `
You are an expert Production Coordinator.
Analyze the provided schedule and identify:
1. Conflict detection
2. Resource bottlenecks
3. Optimization opportunities
4. Critical path analysis

Context: {{DATA}}

Suggest a refined schedule or list of conflicts to resolve.
`;

export const ContentSummarizationPrompt = `
You are an expert Creative Producer.
Summarize the following script, story, or document.
Focus on:
1. Key narrative arcs
2. Character development
3. Tone and style
4. Production requirements implies by the text

Text: {{DATA}}
`;

export function getTaskPrompt(taskName: string, data: string): string {
    switch (taskName) {
        case 'budget_analysis': return BudgetAnalysisPrompt.replace('{{DATA}}', data);
        case 'schedule_opt': return ScheduleOptimizationPrompt.replace('{{DATA}}', data);
        case 'summarize': return ContentSummarizationPrompt.replace('{{DATA}}', data);
        default: return `Analyze the following data:\n${data}`;
    }
}
