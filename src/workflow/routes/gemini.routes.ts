/**
 * 🤖 Gemini AI API Routes
 * 
 * Firebase Functions routes for Gemini AI integration
 */

import { Router } from 'express';
import { getApiServiceConfig } from '../utils/environment';

const router: Router = Router();

// Real Gemini API call implementation
async function callGeminiAPI(prompt: string, apiKey: string) {
  console.log('🤖 Calling Gemini API with prompt:', prompt.substring(0, 100) + '...');
  
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    
    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return {
      success: true,
      analysis: text,
      metadata: {
        model: 'gemini-1.5-flash',
        promptLength: prompt.length,
        generatedAt: new Date().toISOString(),
        isDemo: false
      }
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error(`Gemini API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Gemini analyze endpoint
router.post('/analyze', async (req, res) => {
  try {
    const { prompt, dataSources, metadata } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    const config = getApiServiceConfig();
    
    if (!config.gemini.apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured',
        details: 'Please configure GEMINI_API_KEY in Firebase Functions config'
      });
    }

    console.log('🤖 Gemini analyze request:', {
      promptLength: prompt.length,
      hasDataSources: !!dataSources,
      hasMetadata: !!metadata,
      userId: req.user?.uid
    });

    const result = await callGeminiAPI(prompt, config.gemini.apiKey);
    
    return res.json({
      success: true,
      analysis: result.analysis,
      metadata: {
        ...result.metadata,
        requestMetadata: metadata
      }
    });
  } catch (error) {
    console.error('Gemini analyze error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze with Gemini',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Gemini generate endpoint
router.post('/generate', async (req, res) => {
  try {
    const { prompt, options = {} } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    const config = getApiServiceConfig();
    
    if (!config.gemini.apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured'
      });
    }

    console.log('🤖 Gemini generate request:', {
      promptLength: prompt.length,
      options,
      userId: req.user?.uid
    });

    const result = await callGeminiAPI(prompt, config.gemini.apiKey);
    
    return res.json({
      success: true,
      content: result.analysis,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Gemini generate error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate with Gemini',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint
router.post('/test', async (req, res) => {
  try {
    const config = getApiServiceConfig();
    
    res.json({
      success: true,
      message: 'Gemini API endpoint is working',
      configured: !!config.gemini.apiKey,
      model: config.gemini.model,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Gemini test error:', error);
    res.status(500).json({
      success: false,
      error: 'Gemini test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
