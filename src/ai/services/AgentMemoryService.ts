/**
 * Agent Memory Service
 * 
 * Manages agent memory across three tiers:
 * 1. Short-term (session): In-memory conversation history
 * 2. Long-term (Firestore): Persistent conversation storage in agent_conversations
 * 3. Structured memory: Entity relationships and preferences
 */

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
        agent?: string;
        toolsUsed?: string[];
        context?: Record<string, any>;
    };
}

export interface Conversation {
    id: string;
    userId: string;
    organizationId: string;
    projectId?: string;
    messages: ConversationMessage[];
    createdAt: Date;
    updatedAt: Date;
    metadata?: {
        title?: string;
        tags?: string[];
        summary?: string;
    };
}

export interface EntityMemory {
    entityType: string; // 'user', 'project', 'workflow', etc.
    entityId: string;
    relationships: Array<{
        type: string; // 'manages', 'assigned_to', 'belongs_to'
        targetType: string;
        targetId: string;
    }>;
    preferences: Record<string, any>;
    lastAccessed: Date;
}

export class AgentMemoryService {
    private sessionMemory: Map<string, ConversationMessage[]> = new Map();
    private db: admin.firestore.Firestore;

    constructor() {
        this.db = admin.firestore();
    }

    /**
     * Add message to session memory (short-term)
     */
    addSessionMessage(
        sessionId: string,
        message: ConversationMessage
    ): void {
        if (!this.sessionMemory.has(sessionId)) {
            this.sessionMemory.set(sessionId, []);
        }
        this.sessionMemory.get(sessionId)!.push(message);
    }

    /**
     * Get session messages
     */
    getSessionMessages(sessionId: string): ConversationMessage[] {
        return this.sessionMemory.get(sessionId) || [];
    }

    /**
     * Clear session memory
     */
    clearSession(sessionId: string): void {
        this.sessionMemory.delete(sessionId);
    }

    /**
     * Save conversation to Firestore (long-term)
     */
    async saveConversation(
        conversation: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<string> {
        const conversationRef = this.db.collection('agent_conversations').doc();

        const conversationData: Conversation = {
            id: conversationRef.id,
            ...conversation,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await conversationRef.set({
            ...conversationData,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        console.log(`[AgentMemoryService] 💾 Saved conversation ${conversationData.id} to Firestore`);

        return conversationData.id;
    }

    /**
     * Load conversation from Firestore
     */
    async loadConversation(conversationId: string): Promise<Conversation | null> {
        const doc = await this.db
            .collection('agent_conversations')
            .doc(conversationId)
            .get();

        if (!doc.exists) {
            return null;
        }

        const data = doc.data()!;
        return {
            id: doc.id,
            ...data,
            createdAt: (data.createdAt as admin.firestore.Timestamp)?.toDate() || new Date(),
            updatedAt: (data.updatedAt as admin.firestore.Timestamp)?.toDate() || new Date()
        } as Conversation;
    }

    /**
     * Get recent conversations for a user
     */
    async getRecentConversations(
        userId: string,
        organizationId: string,
        limit: number = 10
    ): Promise<Conversation[]> {
        const snapshot = await this.db
            .collection('agent_conversations')
            .where('userId', '==', userId)
            .where('organizationId', '==', organizationId)
            .orderBy('updatedAt', 'desc')
            .limit(limit)
            .get();

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: (doc.data().createdAt as admin.firestore.Timestamp)?.toDate() || new Date(),
            updatedAt: (doc.data().updatedAt as admin.firestore.Timestamp)?.toDate() || new Date()
        } as Conversation));
    }

    /**
     * Update conversation (append messages)
     */
    async updateConversation(
        conversationId: string,
        newMessages: ConversationMessage[]
    ): Promise<void> {
        const conversationRef = this.db.collection('agent_conversations').doc(conversationId);
        const conversation = await this.loadConversation(conversationId);

        if (!conversation) {
            throw new Error(`Conversation ${conversationId} not found`);
        }

        await conversationRef.update({
            messages: FieldValue.arrayUnion(...newMessages),
            updatedAt: FieldValue.serverTimestamp()
        });

        console.log(`[AgentMemoryService] 📝 Updated conversation ${conversationId} with ${newMessages.length} messages`);
    }

    /**
     * Save entity memory (structured memory)
     */
    async saveEntityMemory(memory: EntityMemory): Promise<void> {
        const memoryRef = this.db
            .collection('agent_entity_memory')
            .doc(`${memory.entityType}_${memory.entityId}`);

        await memoryRef.set({
            ...memory,
            lastAccessed: FieldValue.serverTimestamp()
        });

        console.log(`[AgentMemoryService] 🧠 Saved entity memory: ${memory.entityType}/${memory.entityId}`);
    }

    /**
     * Load entity memory
     */
    async loadEntityMemory(
        entityType: string,
        entityId: string
    ): Promise<EntityMemory | null> {
        const doc = await this.db
            .collection('agent_entity_memory')
            .doc(`${entityType}_${entityId}`)
            .get();

        if (!doc.exists) {
            return null;
        }

        const data = doc.data()!;
        return {
            ...data,
            lastAccessed: (data.lastAccessed as admin.firestore.Timestamp)?.toDate() || new Date()
        } as EntityMemory;
    }

    /**
     * Search entity memory by relationship
     */
    async searchEntityMemory(
        entityType: string,
        relationshipType: string,
        targetType?: string
    ): Promise<EntityMemory[]> {
        let query = this.db
            .collection('agent_entity_memory')
            .where('entityType', '==', entityType);

        // Note: Firestore doesn't support querying nested arrays directly
        // This is a simplified implementation
        // For production, consider denormalizing relationships

        const snapshot = await query.get();
        const results: EntityMemory[] = [];

        for (const doc of snapshot.docs) {
            const memory = {
                id: doc.id,
                ...doc.data(),
                lastAccessed: (doc.data().lastAccessed as admin.firestore.Timestamp)?.toDate() || new Date()
            } as EntityMemory & { id: string };

            // Filter by relationship type
            if (memory.relationships) {
                const hasRelationship = memory.relationships.some(
                    rel => rel.type === relationshipType &&
                        (!targetType || rel.targetType === targetType)
                );

                if (hasRelationship) {
                    results.push(memory);
                }
            }
        }

        return results;
    }

    /**
     * Get conversation context for agent (combines session + long-term)
     */
    async getConversationContext(
        sessionId: string,
        conversationId?: string
    ): Promise<ConversationMessage[]> {
        const messages: ConversationMessage[] = [];

        // Add session messages
        messages.push(...this.getSessionMessages(sessionId));

        // Add long-term conversation messages if provided
        if (conversationId) {
            const conversation = await this.loadConversation(conversationId);
            if (conversation) {
                // Merge with session messages (avoid duplicates)
                const sessionMessageSet = new Set(messages.map(m => m.content + m.timestamp.getTime()));
                conversation.messages.forEach(msg => {
                    const key = msg.content + msg.timestamp.getTime();
                    if (!sessionMessageSet.has(key)) {
                        messages.push(msg);
                    }
                });
            }
        }

        // Sort by timestamp
        messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        return messages;
    }
}

// Global singleton instance
export const agentMemoryService = new AgentMemoryService();
