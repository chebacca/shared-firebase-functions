import { FunctionDeclaration } from '@google/generative-ai';
import { dataToolDeclarations } from './dataTools';
import { workflowFunctionDeclarations } from './workflowTools';

export interface ToolDefinition {
    declaration: FunctionDeclaration;
    // executor: (args: any) => Promise<any>; // Future: Associate executor with tool
}

export class ToolRegistry {
    private tools: Map<string, ToolDefinition> = new Map();

    constructor() {
        this.initializeDefaultTools();
    }

    private initializeDefaultTools() {
        // Register Data Tools
        dataToolDeclarations.forEach(tool => {
            this.registerTool(tool);
        });

        // Register Workflow Tools
        workflowFunctionDeclarations.forEach(tool => {
            this.registerTool(tool as unknown as FunctionDeclaration);
            // Casting because workflowTools definitions might be slightly generic
        });
    }

    public registerTool(declaration: FunctionDeclaration) {
        this.tools.set(declaration.name, { declaration });
    }

    public getAllTools(): FunctionDeclaration[] {
        return Array.from(this.tools.values()).map(t => t.declaration);
    }

    public getToolByName(name: string): FunctionDeclaration | undefined {
        return this.tools.get(name)?.declaration;
    }
}

export const globalToolRegistry = new ToolRegistry();
