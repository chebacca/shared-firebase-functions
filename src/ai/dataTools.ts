import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

/**
 * Data Tools for Gemini
 * 
 * Defines the tools that allow the AI to query Firestore data directly.
 */
export const dataToolDeclarations: FunctionDeclaration[] = [
    {
        name: 'list_projects',
        description: 'List active projects for the organization, optionally filtering by status. Use this to find projects.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: {
                    type: SchemaType.STRING,
                    format: 'enum',
                    description: 'Filter by project status (e.g., IN_PRODUCTION, POST_PRODUCTION, COMPLETED)',
                    enum: ['PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'COMPLETED', 'ARCHIVED']
                },
                limit: {
                    type: SchemaType.NUMBER,
                    description: 'Max number of projects to return (default 10)'
                }
            },
            required: []
        }
    },
    {
        name: 'get_project_details',
        description: 'Get detailed information about a specific project including team members and recent activity.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                projectId: {
                    type: SchemaType.STRING,
                    description: 'The ID of the project to retrieve'
                }
            },
            required: ['projectId']
        }
    },
    {
        name: 'search_users',
        description: 'Search for users in the organization by name or role.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: {
                    type: SchemaType.STRING,
                    description: 'Partial name to search for'
                },
                role: {
                    type: SchemaType.STRING,
                    description: 'Filter by role (e.g., EDITOR, PRODUCER)'
                }
            },
            required: []
        }
    },
    {
        name: 'check_schedule',
        description: 'Check schedule or calendar events for a specific project or user.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                projectId: { type: SchemaType.STRING, description: 'Project ID to check schedule for' },
                userId: { type: SchemaType.STRING, description: 'User ID to check availability for' },
                dateRange: { type: SchemaType.STRING, description: 'Date range (e.g., "next week", "2024-01-01 to 2024-01-31")' }
            }
        }
    },
    {
        name: 'search_knowledge_base',
        description: 'Search the knowledge base (SOPs, Guides, Technical Specs) for information.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING, description: 'The search query string' },
                category: { type: SchemaType.STRING, description: 'Optional category filter (e.g. "delivery_specs", "software_guides")' }
            },
            required: ['query']
        }
    }
];
