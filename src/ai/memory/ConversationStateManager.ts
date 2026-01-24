/**
 * Conversation State Manager
 * 
 * Manages conversation state across sessions with:
 * - Session state (current conversation)
 * - Checkpoint management (for workflow resumption)
 * - State persistence and retrieval
 * 
 * Built on top of AgentMemoryService for actual storage.
 */

import { agentMemoryService, ConversationMessage, Conversation } from '../services/AgentMemoryService';
import * as admin from 'firebase-admin';

export interface ConversationCheckpoint {
    id: string;
    conversationId: string;
    state: Record<string, any>;
    step: number;
    workflowId?: string;
    createdAt: Date;
}

export interface ConversationState {
    sessionId: string;
    conversationId?: string;
    messages: ConversationMessage[];
    context: Record<string, any>;
    checkpoints: ConversationCheckpoint[];
    currentStep?: number;
}

export class ConversationStateManager {
    private db: admin.firestore.Firestore;
    private sessionStates: Map<string, ConversationState> = new Map();

    constructor() {
        this.db = admin.firestore();
    }

    /**
     * Initialize or get conversation state for a session
     */
    async getOrCreateState(
        sessionId: string,
        userId: string,
        organizationId: string,
        conversationId?: string
    ): Promise<ConversationState> {
        // Check cache first
        if (this.sessionStates.has(sessionId)) {
            return this.sessionStates.get(sessionId)!;
        }

        // Load from Firestore if conversationId provided
        let messages: ConversationMessage[] = [];
        if (conversationId) {
            const conversation = await agentMemoryService.loadConversation(conversationId);
            if (conversation) {
                messages = conversation.messages;
            }
        }

        // Get session messages
        const sessionMessages = agentMemoryService.getSessionMessages(sessionId);
        messages.push(...sessionMessages);

        // Load checkpoints
        const checkpoints = conversationId
            ? await this.loadCheckpoints(conversationId)
            : [];

        const state: ConversationState = {
            sessionId,
            conversationId,
            messages,
            context: {},
            checkpoints,
            currentStep: checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].step : 0
        };

        this.sessionStates.set(sessionId, state);
        return state;
    }

    /**
     * Update conversation state
     */
    async updateState(
        sessionId: string,
        updates: Partial<ConversationState>
    ): Promise<void> {
        const state = this.sessionStates.get(sessionId);
        if (!state) {
            throw new Error(`State not found for session: ${sessionId}`);
        }

        // Merge updates
        Object.assign(state, updates);

        // Persist to Firestore if conversationId exists
        if (state.conversationId) {
            await this.persistState(state);
        }
    }

    /**
     * Add message to conversation state
     */
    async addMessage(
        sessionId: string,
        message: ConversationMessage
    ): Promise<void> {
        const state = this.sessionStates.get(sessionId);
        if (!state) {
            // Create new state
            this.sessionStates.set(sessionId, {
                sessionId,
                messages: [message],
                context: {},
                checkpoints: []
            });
            return;
        }

        state.messages.push(message);
        agentMemoryService.addSessionMessage(sessionId, message);

        // Persist if conversationId exists
        if (state.conversationId) {
            await agentMemoryService.updateConversation(
                state.conversationId,
                [message]
            );
        }
    }

    /**
     * Create checkpoint for workflow resumption
     */
    async createCheckpoint(
        conversationId: string,
        state: Record<string, any>,
        step: number,
        workflowId?: string
    ): Promise<string> {
        const checkpointRef = this.db.collection('agent_checkpoints').doc();

        const checkpoint: ConversationCheckpoint = {
            id: checkpointRef.id,
            conversationId,
            state,
            step,
            workflowId,
            createdAt: new Date()
        };

        await checkpointRef.set({
            ...checkpoint,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update conversation state if in cache
        for (const [sessionId, convState] of this.sessionStates.entries()) {
            if (convState.conversationId === conversationId) {
                convState.checkpoints.push(checkpoint);
                convState.currentStep = step;
            }
        }

        return checkpoint.id;
    }

    /**
     * Load checkpoints for a conversation
     */
    async loadCheckpoints(conversationId: string): Promise<ConversationCheckpoint[]> {
        const snapshot = await this.db
            .collection('agent_checkpoints')
            .where('conversationId', '==', conversationId)
            .orderBy('step', 'asc')
            .get();

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: (doc.data().createdAt as admin.firestore.Timestamp)?.toDate() || new Date()
        } as ConversationCheckpoint));
    }

    /**
     * Get checkpoint by ID
     */
    async getCheckpoint(checkpointId: string): Promise<ConversationCheckpoint | null> {
        const doc = await this.db
            .collection('agent_checkpoints')
            .doc(checkpointId)
            .get();

        if (!doc.exists) {
            return null;
        }

        const data = doc.data()!;
        return {
            id: doc.id,
            ...data,
            createdAt: (data.createdAt as admin.firestore.Timestamp)?.toDate() || new Date()
        } as ConversationCheckpoint;
    }

    /**
     * Resume conversation from checkpoint
     */
    async resumeFromCheckpoint(
        checkpointId: string,
        newSessionId: string
    ): Promise<ConversationState> {
        const checkpoint = await this.getCheckpoint(checkpointId);
        if (!checkpoint) {
            throw new Error(`Checkpoint ${checkpointId} not found`);
        }

        // Load conversation
        const conversation = await agentMemoryService.loadConversation(checkpoint.conversationId);
        if (!conversation) {
            throw new Error(`Conversation ${checkpoint.conversationId} not found`);
        }

        // Create new state from checkpoint
        const state: ConversationState = {
            sessionId: newSessionId,
            conversationId: checkpoint.conversationId,
            messages: conversation.messages,
            context: checkpoint.state,
            checkpoints: await this.loadCheckpoints(checkpoint.conversationId),
            currentStep: checkpoint.step
        };

        this.sessionStates.set(newSessionId, state);
        return state;
    }

    /**
     * Persist state to Firestore
     */
    private async persistState(state: ConversationState): Promise<void> {
        if (!state.conversationId) return;

        // State is already persisted via AgentMemoryService
        // This is for additional state metadata if needed
        const stateRef = this.db
            .collection('agent_conversations')
            .doc(state.conversationId)
            .collection('state')
            .doc('current');

        await stateRef.set({
            context: state.context,
            currentStep: state.currentStep,
            checkpointCount: state.checkpoints.length,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    /**
     * Clear session state (cleanup)
     */
    clearSession(sessionId: string): void {
        this.sessionStates.delete(sessionId);
        agentMemoryService.clearSession(sessionId);
    }

    /**
     * Get current state for session
     */
    getState(sessionId: string): ConversationState | undefined {
        return this.sessionStates.get(sessionId);
    }
}

// Global singleton instance
export const conversationStateManager = new ConversationStateManager();
