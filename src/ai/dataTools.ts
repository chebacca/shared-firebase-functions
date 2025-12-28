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
    },
    // ML-Powered Tools
    {
        name: 'predict_budget_health',
        description: 'Predict budget health and completion cost for a project. Use this to check if a project is at risk of going over budget.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                projectId: {
                    type: SchemaType.STRING,
                    description: 'The ID of the project to analyze'
                }
            },
            required: ['projectId']
        }
    },
    {
        name: 'forecast_spending',
        description: 'Forecast future spending for a project over a specified number of days. Use this to predict cash flow needs.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                projectId: {
                    type: SchemaType.STRING,
                    description: 'The ID of the project to forecast'
                },
                days: {
                    type: SchemaType.NUMBER,
                    description: 'Number of days to forecast (default: 30)'
                }
            },
            required: ['projectId']
        }
    },
    {
        name: 'predict_resource_availability',
        description: 'Predict availability of a resource (person or equipment) for a date range. Use this to check if someone is available.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                resourceId: {
                    type: SchemaType.STRING,
                    description: 'The ID of the resource (user ID or equipment ID)'
                },
                startDate: {
                    type: SchemaType.STRING,
                    description: 'Start date in ISO format (YYYY-MM-DD)'
                },
                endDate: {
                    type: SchemaType.STRING,
                    description: 'End date in ISO format (YYYY-MM-DD)'
                }
            },
            required: ['resourceId', 'startDate', 'endDate']
        }
    },
    {
        name: 'semantic_search',
        description: 'Perform intelligent semantic search across all data. Use this when the user asks to find something but you need to understand the intent, not just match keywords.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: {
                    type: SchemaType.STRING,
                    description: 'The search query - can be natural language like "action-packed projects that need attention"'
                },
                collections: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: 'Collections to search (e.g., ["projects", "teamMembers", "contacts"])'
                },
                limit: {
                    type: SchemaType.NUMBER,
                    description: 'Maximum number of results (default: 10)'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'find_similar_entities',
        description: 'Find entities similar to a given entity. Use this to find related projects, similar contacts, or comparable inventory items.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                collection: {
                    type: SchemaType.STRING,
                    description: 'The collection name (e.g., "projects", "contacts")'
                },
                entityId: {
                    type: SchemaType.STRING,
                    description: 'The ID of the entity to find similar ones for'
                },
                limit: {
                    type: SchemaType.NUMBER,
                    description: 'Maximum number of similar entities to return (default: 5)'
                }
            },
            required: ['collection', 'entityId']
        }
    }
];
