import { FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { allTools } from 'shared-backbone-intelligence';
import { mapSharedToolToGeminiDeclaration } from './utils/schemaMapping';

/**
 * Shared Tool Declarations (Dynamically mapped from shared-backbone-intelligence)
 */
export const sharedToolDeclarations: FunctionDeclaration[] = allTools.map(mapSharedToolToGeminiDeclaration);

/**
 * Data Tools for Gemini
 * 
 * Defines the tools that allow the AI to query Firestore data directly.
 */
export const dataToolDeclarations: FunctionDeclaration[] = [
    // ... existing declarations ...
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
    },
    {
        name: 'query_firestore',
        description: 'Query any Firestore collection with powerful filters and sorting. Use this when a specialized tool is not available. Always returns data suitable for a table view.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                collectionPath: {
                    type: SchemaType.STRING,
                    description: 'The name of the collection to query (e.g., "projects", "tasks", "media_items", "timecards")'
                },
                filters: {
                    type: SchemaType.ARRAY,
                    description: 'List of filters to apply',
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            field: { type: SchemaType.STRING, description: 'Field to filter on' },
                            operator: {
                                type: SchemaType.STRING,
                                format: 'enum',
                                enum: ['==', '!=', '>', '>=', '<', '<=', 'array-contains', 'in', 'not-in', 'array-contains-any'],
                                description: 'Comparison operator'
                            },
                            value: { type: SchemaType.STRING, description: 'Value to compare (passed as string, type-converted by tool)' }
                        },
                        required: ['field', 'operator', 'value']
                    }
                },
                orderBy: {
                    type: SchemaType.OBJECT,
                    properties: {
                        field: { type: SchemaType.STRING, description: 'Field to sort by' },
                        direction: { type: SchemaType.STRING, format: 'enum', enum: ['asc', 'desc'], description: 'Sort direction' }
                    }
                },
                limit: {
                    type: SchemaType.NUMBER,
                    description: 'Max number of results (default 20, max 100)'
                }
            },
            required: ['collectionPath']
        }
    },
    {
        name: 'list_collections',
        description: 'List all available high-level collections in the database. Use this to discover where data is stored.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: 'search_google_places',
        description: 'Search for real-world places, addresses, and establishments using Google Maps. Returns names, locations, ratings, and IDs. Use for finding locations, researching vendors, or scouting places.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: {
                    type: SchemaType.STRING,
                    description: 'The search query (e.g., "Universal Studios Hollywood", "camera rental in Los Angeles")'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'list_inventory',
        description: 'List inventory items in the organization. Use this to see what equipment (cameras, lights, etc.) is available or checked out.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: {
                    type: SchemaType.STRING,
                    format: 'enum',
                    enum: ['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE', 'LOST'],
                    description: 'Filter by item status'
                },
                search: {
                    type: SchemaType.STRING,
                    description: 'Search term for item name or serial number'
                },
                limit: {
                    type: SchemaType.NUMBER,
                    description: 'Max number of items to return (default: 20)'
                }
            },
            required: []
        }
    },
    {
        name: 'list_timecards',
        description: 'List timecards for the organization. Use this to check payroll status, clock-in/out times, or find missing timecards.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: {
                    type: SchemaType.STRING,
                    description: 'Filter by specific user ID'
                },
                status: {
                    type: SchemaType.STRING,
                    format: 'enum',
                    enum: ['draft', 'pending', 'approved', 'rejected', 'completed'],
                    description: 'Filter by timecard status'
                },
                limit: {
                    type: SchemaType.NUMBER,
                    description: 'Max number of timecards to return (default: 20)'
                }
            },
            required: []
        }
    },
    // Execution / Action Tools
    {
        name: 'create_project',
        description: 'Create a new project in the system.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: { type: SchemaType.STRING, description: 'Project Name' },
                phase: {
                    type: SchemaType.STRING,
                    format: 'enum',
                    enum: ['PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'DEVELOPMENT'],
                    description: 'Initial project phase'
                },
                description: { type: SchemaType.STRING, description: 'Brief description of the project' }
            },
            required: ['name']
        }
    },
    {
        name: 'manage_task',
        description: 'Create or update a task.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                action: { type: SchemaType.STRING, format: 'enum', enum: ['create', 'update', 'complete'], description: 'Action to perform' },
                taskId: { type: SchemaType.STRING, description: 'Task ID (required for update/complete)' },
                projectId: { type: SchemaType.STRING, description: 'Project ID (required for create)' },
                title: { type: SchemaType.STRING, description: 'Task title' },
                assigneeId: { type: SchemaType.STRING, description: 'User ID to assign to' },
                dueDate: { type: SchemaType.STRING, description: 'Due date (YYYY-MM-DD)' }
            },
            required: ['action']
        }
    },
    {
        name: 'assign_team_member',
        description: 'Assign a team member to a project or role.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                projectId: { type: SchemaType.STRING, description: 'Project ID' },
                userId: { type: SchemaType.STRING, description: 'User ID to assign' },
                role: { type: SchemaType.STRING, description: 'Role (e.g. Viewer, Editor, Admin)' }
            },
            required: ['projectId', 'userId']
        }
    },
    {
        name: 'execute_app_action',
        description: 'Perform specific application actions like duplicating call sheets, publishing items, or other app-specific workflows.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                appName: {
                    type: SchemaType.STRING,
                    description: 'The application to target. Allowed values: call_sheet, project_manager, inventory',
                    format: 'enum',
                    enum: ['call_sheet', 'project_manager', 'inventory']
                },
                actionName: {
                    type: SchemaType.STRING,
                    description: 'The action to perform (e.g., "duplicate", "publish", "unpublish", "checkout", "checkin")'
                },
                parameters: {
                    type: SchemaType.OBJECT,
                    description: 'Key-value pairs for action parameters',
                    // Note: We can't define deep properties here easily for generic tools, 
                    // so we keep it as a generic object container. 
                    // Gemini handles this well.
                    properties: {
                        callSheetId: { type: SchemaType.STRING, description: 'ID of the call sheet (if applicable)' },
                        assetId: { type: SchemaType.STRING, description: 'ID of the asset to checkout/checkin' },
                        baseUrl: { type: SchemaType.STRING, description: 'Base URL for links (if applicable)' }
                    },
                    required: [] // No specific required params as they depend on action
                }
            },
            required: ['appName', 'actionName', 'parameters']
        }
    }
];
