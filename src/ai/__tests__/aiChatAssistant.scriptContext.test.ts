/**
 * AI Chat Assistant Script Context Tests
 * 
 * Tests for script writing context handling in Firebase function
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { aiChatAssistant } from '../aiChatAssistant';
import { HttpsError } from 'firebase-functions/v2/https';

// Mock Firebase Admin
vi.mock('firebase-admin', () => ({
  initializeApp: vi.fn(),
  apps: [],
  firestore: () => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(),
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            get: vi.fn()
          }))
        }))
      }))
    }))
  }),
  auth: () => ({
    verifyIdToken: vi.fn()
  })
}));

// Mock AI helpers
vi.mock('../utils/aiHelpers', () => ({
  getAIApiKey: vi.fn().mockResolvedValue({
    apiKey: 'test-api-key',
    model: 'gpt-4'
  }),
  callAIProvider: vi.fn().mockResolvedValue('AI Response with script content')
}));

// Mock context service
vi.mock('../aiContextService', () => ({
  gatherEntityContext: vi.fn().mockResolvedValue({}),
  gatherGeneralContext: vi.fn().mockResolvedValue({}),
  formatContextForPrompt: vi.fn().mockReturnValue('Formatted context')
}));

describe('aiChatAssistant - Script Context', () => {
  const mockRequest = {
    auth: {
      uid: 'user-123'
    },
    data: {
      message: 'Generate a script based on the video transcripts',
      organizationId: 'org-123',
      context: {
        page: 'scriptEditor',
        entityType: 'story',
        entityId: 'story-123',
        scriptContext: {
          show: {
            name: 'Storage Wars',
            description: 'A reality TV show',
            totalScripts: 5,
            exampleScripts: [
              { title: 'Example 1', content: 'INT. LOCATION - DAY', length: 100, clipType: 'Documentary' }
            ]
          },
          story: {
            clipTitle: 'Test Story',
            show: 'Storage Wars',
            clearanceNotes: 'All clear',
            researchNotes: 'Research done',
            producerNotes: 'Producer notes'
          },
          pitch: {
            comments: []
          },
          videoTranscripts: [
            {
              videoUrl: 'https://youtube.com/watch?v=123',
              platform: 'youtube',
              fullText: 'Full transcript text here...',
              segments: []
            }
          ],
          indexedVideoFiles: [],
          scriptWritingGuidance: {
            suggestedLength: 500,
            showStyle: 'Documentary style',
            commonThemes: ['Crime', 'Investigation']
          }
        }
      },
      preferredProvider: 'gemini' as const
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect script context and use specialized prompt', async () => {
    const { callAIProvider } = await import('../utils/aiHelpers');
    const mockCallAI = callAIProvider as Mock;

    // Mock the function call
    const result = await aiChatAssistant(mockRequest as any);

    // Verify that AI was called with script-specific prompt
    expect(mockCallAI).toHaveBeenCalled();
    const callArgs = mockCallAI.mock.calls[0];
    const messages = callArgs[2]; // Third argument is messages array

    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Clipsy');
    expect(messages[0].content).toContain('Storage Wars');
    expect(messages[0].content).toContain('script writing');
    expect(messages[0].content).toContain('video transcripts');
    expect(messages[0].content).toContain('script formatting');
  });

  it('should include show information in prompt', async () => {
    const { callAIProvider } = await import('../utils/aiHelpers');
    const mockCallAI = callAIProvider as Mock;

    await aiChatAssistant(mockRequest as any);

    const callArgs = mockCallAI.mock.calls[0];
    const systemPrompt = callArgs[2][0].content;

    expect(systemPrompt).toContain('Storage Wars');
    expect(systemPrompt).toContain('A reality TV show');
    expect(systemPrompt).toContain('Total Scripts Available: 5');
  });

  it('should include story details in prompt', async () => {
    const { callAIProvider } = await import('../utils/aiHelpers');
    const mockCallAI = callAIProvider as Mock;

    await aiChatAssistant(mockRequest as any);

    const callArgs = mockCallAI.mock.calls[0];
    const systemPrompt = callArgs[2][0].content;

    expect(systemPrompt).toContain('Test Story');
    expect(systemPrompt).toContain('Documentary');
    expect(systemPrompt).toContain('Research done');
    expect(systemPrompt).toContain('All clear');
  });

  it('should include video transcripts in prompt', async () => {
    const { callAIProvider } = await import('../utils/aiHelpers');
    const mockCallAI = callAIProvider as Mock;

    await aiChatAssistant(mockRequest as any);

    const callArgs = mockCallAI.mock.calls[0];
    const systemPrompt = callArgs[2][0].content;

    expect(systemPrompt).toContain('VIDEO TRANSCRIPTS');
    expect(systemPrompt).toContain('youtube.com/watch?v=123');
    expect(systemPrompt).toContain('Full transcript text here');
  });

  it('should include example scripts in prompt', async () => {
    const { callAIProvider } = await import('../utils/aiHelpers');
    const mockCallAI = callAIProvider as Mock;

    await aiChatAssistant(mockRequest as any);

    const callArgs = mockCallAI.mock.calls[0];
    const systemPrompt = callArgs[2][0].content;

    expect(systemPrompt).toContain('EXAMPLE SCRIPTS FROM THIS SHOW');
    expect(systemPrompt).toContain('Example 1');
    expect(systemPrompt).toContain('INT. LOCATION - DAY');
  });

  it('should include script writing guidance in prompt', async () => {
    const { callAIProvider } = await import('../utils/aiHelpers');
    const mockCallAI = callAIProvider as Mock;

    await aiChatAssistant(mockRequest as any);

    const callArgs = mockCallAI.mock.calls[0];
    const systemPrompt = callArgs[2][0].content;

    expect(systemPrompt).toContain('WRITING GUIDANCE');
    expect(systemPrompt).toContain('Average Script Length: 500');
    expect(systemPrompt).toContain('Documentary style');
    expect(systemPrompt).toContain('Crime');
    expect(systemPrompt).toContain('Investigation');
  });

  it('should use standard prompt when script context is not provided', async () => {
    const { callAIProvider } = await import('../utils/aiHelpers');
    const mockCallAI = callAIProvider as Mock;

    const requestWithoutScriptContext = {
      ...mockRequest,
      data: {
        ...mockRequest.data,
        context: {
          page: 'dashboard',
          entityType: undefined,
          entityId: undefined
        }
      }
    };

    await aiChatAssistant(requestWithoutScriptContext as any);

    const callArgs = mockCallAI.mock.calls[0];
    const systemPrompt = callArgs[2][0].content;

    expect(systemPrompt).toContain('AI assistant for Clip Show Pro');
    expect(systemPrompt).not.toContain('Clipsy');
    expect(systemPrompt).not.toContain('script writing');
  });

  it('should handle missing script context fields gracefully', async () => {
    const { callAIProvider } = await import('../utils/aiHelpers');
    const mockCallAI = callAIProvider as Mock;

    const requestWithPartialContext = {
      ...mockRequest,
      data: {
        ...mockRequest.data,
        context: {
          ...mockRequest.data.context,
          scriptContext: {
            show: {
              name: 'Storage Wars'
              // Missing other fields
            },
            story: {
              clipTitle: 'Test Story'
              // Missing other fields
            }
          }
        }
      }
    };

    await aiChatAssistant(requestWithPartialContext as any);

    const callArgs = mockCallAI.mock.calls[0];
    const systemPrompt = callArgs[2][0].content;

    // Should still build prompt with available data
    expect(systemPrompt).toContain('Storage Wars');
    expect(systemPrompt).toContain('Test Story');
  });

  it('should truncate long transcript text in prompt', async () => {
    const { callAIProvider } = await import('../utils/aiHelpers');
    const mockCallAI = callAIProvider as Mock;

    const requestWithLongTranscript = {
      ...mockRequest,
      data: {
        ...mockRequest.data,
        context: {
          ...mockRequest.data.context,
          scriptContext: {
            ...mockRequest.data.context.scriptContext,
            videoTranscripts: [
              {
                videoUrl: 'https://youtube.com/watch?v=123',
                platform: 'youtube',
                fullText: 'A'.repeat(2000), // Very long transcript
                segments: []
              }
            ]
          }
        }
      }
    };

    await aiChatAssistant(requestWithLongTranscript as any);

    const callArgs = mockCallAI.mock.calls[0];
    const systemPrompt = callArgs[2][0].content;

    // Should truncate to 500 characters with ellipsis
    const transcriptSection = systemPrompt.match(/Transcript: (.*?) \[/)?.[1];
    expect(transcriptSection?.length).toBeLessThanOrEqual(503); // 500 + '...'
  });
});

