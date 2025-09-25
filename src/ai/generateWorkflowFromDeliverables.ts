/**
 * Generate Workflow From Deliverables Function
 * 
 * AI-powered workflow generation based on deliverable specifications
 */

import { onCall } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const generateWorkflowFromDeliverables = onCall(
  {
    memory: '2GiB',
    timeoutSeconds: 300,
    cors: true
  },
  async (request) => {
    try {
      const { data } = request;
      const { deliverables, projectType, organizationId, userId } = data;

      if (!deliverables || !Array.isArray(deliverables)) {
        throw new Error('Deliverables array is required');
      }

      if (!projectType) {
        throw new Error('Project type is required');
      }

      console.log(`🔄 [AI WORKFLOW] Generating workflow for ${deliverables.length} deliverables, org: ${organizationId}`);

      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      // Create workflow generation prompt
      const prompt = createWorkflowPrompt(deliverables, projectType);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const aiResponse = response.text();

      // Parse workflow results
      const workflowData = parseWorkflowResponse(aiResponse, deliverables, projectType);

      console.log(`🔄 [AI WORKFLOW] Workflow generation completed for org: ${organizationId}`);

      return createSuccessResponse({
        organizationId,
        userId,
        projectType,
        deliverablesCount: deliverables.length,
        workflowData,
        aiResponse,
        timestamp: new Date()
      }, 'Workflow generated successfully');

    } catch (error: any) {
      console.error('❌ [AI WORKFLOW] Error:', error);
      return handleError(error, 'generateWorkflowFromDeliverables');
    }
  }
);

function createWorkflowPrompt(deliverables: any[], projectType: string): string {
  return `You are an AI assistant specialized in creating production workflows for film and video projects.
  
  Based on the following deliverables and project type, generate a comprehensive workflow:
  
  PROJECT TYPE: ${projectType}
  
  DELIVERABLES:
  ${JSON.stringify(deliverables, null, 2)}
  
  Please create a detailed workflow that includes:
  
  1. **Pre-Production Phase**
     - Planning and preparation tasks
     - Resource requirements
     - Timeline estimates
  
  2. **Production Phase**
     - Shooting/recording tasks
     - Equipment needs
     - Personnel requirements
  
  3. **Post-Production Phase**
     - Editing and processing tasks
     - Quality control steps
     - Delivery preparation
  
  4. **Quality Assurance**
     - Review checkpoints
     - Approval processes
     - Testing procedures
  
  5. **Delivery Phase**
     - Final delivery tasks
     - Documentation requirements
     - Archive procedures
  
  For each phase, include:
  - Task descriptions
  - Estimated duration
  - Dependencies
  - Required resources
  - Success criteria
  - Potential risks and mitigation strategies
  
  Return the workflow in the following JSON format:
  {
    "workflowName": "Generated workflow name",
    "projectType": "${projectType}",
    "estimatedDuration": "Total estimated duration",
    "phases": [
      {
        "name": "Phase name",
        "description": "Phase description",
        "duration": "Estimated duration",
        "tasks": [
          {
            "name": "Task name",
            "description": "Task description",
            "duration": "Task duration",
            "dependencies": ["List of dependent tasks"],
            "resources": ["List of required resources"],
            "successCriteria": "Success criteria",
            "risks": ["List of potential risks"],
            "mitigation": "Risk mitigation strategies"
          }
        ]
      }
    ],
    "criticalPath": ["List of critical path tasks"],
    "resourceRequirements": {
      "personnel": ["List of required personnel"],
      "equipment": ["List of required equipment"],
      "software": ["List of required software"],
      "facilities": ["List of required facilities"]
    },
    "qualityGates": [
      {
        "name": "Quality gate name",
        "description": "Quality gate description",
        "criteria": "Criteria for passing",
        "phase": "Phase where it occurs"
      }
    ],
    "deliverables": [
      {
        "name": "Deliverable name",
        "description": "Deliverable description",
        "dueDate": "Due date in workflow",
        "dependencies": ["Dependent tasks"],
        "qualityRequirements": "Quality requirements"
      }
    ]
  }`;
}

function parseWorkflowResponse(aiResponse: string, deliverables: any[], projectType: string): any {
  try {
    // Try to extract JSON from the AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure required fields exist and add metadata
      return {
        workflowName: parsed.workflowName || `Generated Workflow for ${projectType}`,
        projectType: parsed.projectType || projectType,
        estimatedDuration: parsed.estimatedDuration || 'Unknown',
        phases: parsed.phases || [],
        criticalPath: parsed.criticalPath || [],
        resourceRequirements: parsed.resourceRequirements || {
          personnel: [],
          equipment: [],
          software: [],
          facilities: []
        },
        qualityGates: parsed.qualityGates || [],
        deliverables: parsed.deliverables || deliverables.map(d => ({
          name: d.name || 'Unnamed Deliverable',
          description: d.description || 'No description',
          dueDate: 'TBD',
          dependencies: [],
          qualityRequirements: 'Standard quality requirements'
        })),
        metadata: {
          generatedAt: new Date(),
          inputDeliverablesCount: deliverables.length,
          aiModel: 'gemini-pro',
          version: '1.0'
        },
        rawResponse: aiResponse
      };
    }
    
    // If no JSON found, return basic structure
    return {
      workflowName: `Generated Workflow for ${projectType}`,
      projectType: projectType,
      estimatedDuration: 'Unknown',
      phases: [],
      criticalPath: [],
      resourceRequirements: {
        personnel: [],
        equipment: [],
        software: [],
        facilities: []
      },
      qualityGates: [],
      deliverables: deliverables.map(d => ({
        name: d.name || 'Unnamed Deliverable',
        description: d.description || 'No description',
        dueDate: 'TBD',
        dependencies: [],
        qualityRequirements: 'Standard quality requirements'
      })),
      metadata: {
        generatedAt: new Date(),
        inputDeliverablesCount: deliverables.length,
        aiModel: 'gemini-pro',
        version: '1.0',
        error: 'Failed to parse AI response'
      },
      rawResponse: aiResponse
    };
  } catch (error) {
    console.error('❌ [AI WORKFLOW] Error parsing workflow response:', error);
    return {
      workflowName: `Generated Workflow for ${projectType}`,
      projectType: projectType,
      estimatedDuration: 'Unknown',
      phases: [],
      criticalPath: [],
      resourceRequirements: {
        personnel: [],
        equipment: [],
        software: [],
        facilities: []
      },
      qualityGates: [],
      deliverables: deliverables.map(d => ({
        name: d.name || 'Unnamed Deliverable',
        description: d.description || 'No description',
        dueDate: 'TBD',
        dependencies: [],
        qualityRequirements: 'Standard quality requirements'
      })),
      metadata: {
        generatedAt: new Date(),
        inputDeliverablesCount: deliverables.length,
        aiModel: 'gemini-pro',
        version: '1.0',
        error: error.message
      },
      rawResponse: aiResponse
    };
  }
}
