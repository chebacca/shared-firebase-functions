/**
 * Tool Schema Converter
 * 
 * Converts tool schemas between different formats:
 * - Zod (used by shared-backbone-intelligence and MCP tools)
 * - Gemini FunctionDeclaration (used by Google Gemini)
 * - Ollama JSON Schema (used by Ollama tool calling)
 * 
 * This enables tools to work with any LLM that supports function calling.
 */

import { SchemaType, FunctionDeclaration } from '@google/generative-ai';
import { z } from 'zod';

export class ToolSchemaConverter {
    /**
     * Convert Zod schema to Gemini FunctionDeclaration
     */
    static zodToGemini(
        zodSchema: z.ZodType<any>,
        name: string,
        description: string
    ): FunctionDeclaration {
        return {
            name,
            description,
            parameters: this.zodToGeminiSchema(zodSchema)
        };
    }

    /**
     * Convert Zod schema to Gemini Schema format
     */
    private static zodToGeminiSchema(zodSchema: z.ZodType<any>): any {
        if (zodSchema instanceof z.ZodObject) {
            const shape = zodSchema.shape;
            const properties: any = {};
            const required: string[] = [];

            for (const [key, field] of Object.entries(shape)) {
                const fieldSchema = field as z.ZodType<any>;
                const isOptional = fieldSchema instanceof z.ZodOptional || 
                                 fieldSchema instanceof z.ZodDefault ||
                                 fieldSchema instanceof z.ZodNullable;
                
                if (!isOptional) {
                    required.push(key);
                }

                properties[key] = this.zodTypeToGeminiType(fieldSchema);
            }

            return {
                type: SchemaType.OBJECT,
                properties,
                required: required.length > 0 ? required : undefined
            };
        }

        return { type: SchemaType.OBJECT, properties: {} };
    }

    /**
     * Convert Zod type to Gemini type
     */
    private static zodTypeToGeminiType(zodType: z.ZodType<any>): any {
        // Handle optional/nullable/default
        if (zodType instanceof z.ZodOptional) {
            return this.zodTypeToGeminiType(zodType._def.innerType);
        }
        if (zodType instanceof z.ZodNullable) {
            return this.zodTypeToGeminiType(zodType._def.innerType);
        }
        if (zodType instanceof z.ZodDefault) {
            return this.zodTypeToGeminiType(zodType._def.innerType);
        }

        // Handle string
        if (zodType instanceof z.ZodString) {
            return {
                type: SchemaType.STRING,
                description: zodType.description
            };
        }

        // Handle number
        if (zodType instanceof z.ZodNumber) {
            return {
                type: SchemaType.NUMBER,
                description: zodType.description
            };
        }

        // Handle boolean
        if (zodType instanceof z.ZodBoolean) {
            return {
                type: SchemaType.BOOLEAN,
                description: zodType.description
            };
        }

        // Handle enum
        if (zodType instanceof z.ZodEnum) {
            return {
                type: SchemaType.STRING,
                enum: zodType._def.values,
                description: zodType.description
            };
        }

        // Handle array
        if (zodType instanceof z.ZodArray) {
            return {
                type: SchemaType.ARRAY,
                items: this.zodTypeToGeminiType(zodType._def.type),
                description: zodType.description
            };
        }

        // Handle object (nested)
        if (zodType instanceof z.ZodObject) {
            return this.zodToGeminiSchema(zodType);
        }

        // Default fallback
        return {
            type: SchemaType.STRING,
            description: zodType.description || ''
        };
    }

    /**
     * Convert Zod schema to Ollama JSON Schema format
     */
    static zodToOllama(
        zodSchema: z.ZodType<any>,
        name: string,
        description: string
    ): any {
        return {
            type: 'function',
            function: {
                name,
                description,
                parameters: this.zodToJsonSchema(zodSchema)
            }
        };
    }

    /**
     * Convert Zod schema to JSON Schema (for Ollama)
     */
    private static zodToJsonSchema(zodSchema: z.ZodType<any>): any {
        if (zodSchema instanceof z.ZodObject) {
            const shape = zodSchema.shape;
            const properties: Record<string, any> = {};
            const required: string[] = [];

            for (const [key, field] of Object.entries(shape)) {
                const fieldSchema = field as z.ZodType<any>;
                const isOptional = fieldSchema instanceof z.ZodOptional ||
                                 fieldSchema instanceof z.ZodDefault ||
                                 fieldSchema instanceof z.ZodNullable;

                if (!isOptional) {
                    required.push(key);
                }

                properties[key] = this.zodTypeToJsonSchema(fieldSchema);
            }

            return {
                type: 'object',
                properties,
                required: required.length > 0 ? required : undefined
            };
        }

        return {
            type: 'object',
            properties: {},
            required: []
        };
    }

    /**
     * Convert Zod type to JSON Schema type
     */
    private static zodTypeToJsonSchema(zodType: z.ZodType<any>): any {
        // Handle optional/nullable/default
        if (zodType instanceof z.ZodOptional) {
            return this.zodTypeToJsonSchema(zodType._def.innerType);
        }
        if (zodType instanceof z.ZodNullable) {
            return this.zodTypeToJsonSchema(zodType._def.innerType);
        }
        if (zodType instanceof z.ZodDefault) {
            return this.zodTypeToJsonSchema(zodType._def.innerType);
        }

        // Handle string
        if (zodType instanceof z.ZodString) {
            return {
                type: 'string',
                description: zodType.description
            };
        }

        // Handle number
        if (zodType instanceof z.ZodNumber) {
            return {
                type: 'number',
                description: zodType.description
            };
        }

        // Handle boolean
        if (zodType instanceof z.ZodBoolean) {
            return {
                type: 'boolean',
                description: zodType.description
            };
        }

        // Handle enum
        if (zodType instanceof z.ZodEnum) {
            return {
                type: 'string',
                enum: zodType._def.values,
                description: zodType.description
            };
        }

        // Handle array
        if (zodType instanceof z.ZodArray) {
            return {
                type: 'array',
                items: this.zodTypeToJsonSchema(zodType._def.type),
                description: zodType.description
            };
        }

        // Handle object (nested)
        if (zodType instanceof z.ZodObject) {
            return this.zodToJsonSchema(zodType);
        }

        // Default fallback
        return {
            type: 'string',
            description: zodType.description || ''
        };
    }

    /**
     * Convert Gemini FunctionDeclaration to Ollama format
     */
    static geminiToOllama(geminiDecl: FunctionDeclaration): any {
        return {
            type: 'function',
            function: {
                name: geminiDecl.name,
                description: geminiDecl.description || '',
                parameters: this.geminiSchemaToJsonSchema(geminiDecl.parameters)
            }
        };
    }

    /**
     * Convert Gemini schema to JSON Schema
     */
    private static geminiSchemaToJsonSchema(geminiSchema: any): any {
        if (geminiSchema.type === SchemaType.OBJECT) {
            const properties: Record<string, any> = {};
            const required: string[] = geminiSchema.required || [];

            if (geminiSchema.properties) {
                for (const [key, prop] of Object.entries(geminiSchema.properties)) {
                    properties[key] = this.geminiTypeToJsonSchema(prop as any);
                }
            }

            return {
                type: 'object',
                properties,
                required: required.length > 0 ? required : undefined
            };
        }

        return {
            type: 'object',
            properties: {},
            required: []
        };
    }

    /**
     * Convert Gemini type to JSON Schema type
     */
    private static geminiTypeToJsonSchema(geminiType: any): any {
        const typeMap: Record<string, string> = {
            [SchemaType.STRING]: 'string',
            [SchemaType.NUMBER]: 'number',
            [SchemaType.BOOLEAN]: 'boolean',
            [SchemaType.ARRAY]: 'array'
        };

        if (geminiType.type === SchemaType.ARRAY) {
            return {
                type: 'array',
                items: this.geminiTypeToJsonSchema(geminiType.items),
                description: geminiType.description
            };
        }

        return {
            type: typeMap[geminiType.type] || 'string',
            enum: geminiType.enum,
            description: geminiType.description
        };
    }

    /**
     * Convert JSON Schema (from MCP) to Ollama format
     */
    static jsonSchemaToOllama(
        jsonSchema: any,
        name: string,
        description: string
    ): any {
        return {
            type: 'function',
            function: {
                name,
                description,
                parameters: jsonSchema || {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        };
    }
}
