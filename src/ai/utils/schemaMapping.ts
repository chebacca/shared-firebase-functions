import { SchemaType, FunctionDeclaration } from '@google/generative-ai';
import { SharedTool } from 'shared-backbone-intelligence';

/**
 * Maps a SharedTool from shared-backbone-intelligence to a Gemini FunctionDeclaration
 */
export function mapSharedToolToGeminiDeclaration(tool: SharedTool): FunctionDeclaration {
    return {
        name: tool.name,
        description: tool.description,
        parameters: mapZodToGeminiSchema(tool.parameters)
    };
}

/**
 * Basic Zod-to-Gemini Schema Mapper
 * Note: This is a simplified version. For complex nesting, a more robust library might be needed.
 * But for our current tools, this handles the primary types.
 */
function mapZodToGeminiSchema(zodSchema: any): any {
    // This is a naive implementation that inspects the Zod object
    // In a real environment, we might use zod-to-json-schema and then map JSON schema to Gemini

    // For now, we'll use a safer approach: Use the description from Zod if available
    // and default to a generic object if it's too complex to map naively.

    // Actually, a better way is to iterate over the shape if it's a ZodObject
    if (zodSchema._def && zodSchema._def.typeName === 'ZodObject') {
        const shape = zodSchema.shape;
        const properties: any = {};
        const required: string[] = [];

        for (const key in shape) {
            const field = shape[key];
            const isOptional = field.isOptional();
            if (!isOptional) {
                required.push(key);
            }

            // Map basic types
            properties[key] = mapZodFieldToGeminiType(field);
        }

        return {
            type: SchemaType.OBJECT,
            properties,
            required: required.length > 0 ? required : undefined
        };
    }

    return { type: SchemaType.OBJECT, properties: {} };
}

function mapZodFieldToGeminiType(field: any): any {
    const typeName = field._def.typeName;
    const description = field._def.description || '';

    switch (typeName) {
        case 'ZodString':
            return { type: SchemaType.STRING, description };
        case 'ZodNumber':
            return { type: SchemaType.NUMBER, description };
        case 'ZodBoolean':
            return { type: SchemaType.BOOLEAN, description };
        case 'ZodEnum':
            return {
                type: SchemaType.STRING,
                enum: field._def.values,
                description
            };
        case 'ZodOptional':
        case 'ZodDefault':
            return mapZodFieldToGeminiType(field._def.innerType || field._def.defaultValue());
        case 'ZodArray':
            return {
                type: SchemaType.ARRAY,
                items: mapZodFieldToGeminiType(field._def.type),
                description
            };
        case 'ZodObject':
            return mapZodToGeminiSchema(field);
        default:
            return { type: SchemaType.STRING, description: `${description} (unsupported type: ${typeName})` };
    }
}
