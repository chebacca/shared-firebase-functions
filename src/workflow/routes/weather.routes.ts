/**
 * 🌤️ Weather API Routes
 * 
 * Firebase Functions routes for weather data integration
 * Uses Open-Meteo API (free) with Google Maps for geocoding
 */

import { Router } from 'express';
import { getApiServiceConfig } from '../utils/environment';

const router = Router();

// Mock weather data function
async function getWeatherData(location: string) {
  console.log('🌤️ Getting weather data for location:', location);
  
  // Mock weather response
  // TODO: Implement actual Open-Meteo API integration
  const mockWeather = {
    location: location,
    current: {
      temperature: Math.round(15 + Math.random() * 20), // 15-35°C
      humidity: Math.round(40 + Math.random() * 40), // 40-80%
      windSpeed: Math.round(Math.random() * 20), // 0-20 km/h
      condition: ['sunny', 'cloudy', 'partly-cloudy', 'rainy'][Math.floor(Math.random() * 4)],
      description: 'Mock weather data'
    },
    forecast: Array.from({ length: 5 }, (_, i) => ({
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      high: Math.round(15 + Math.random() * 20),
      low: Math.round(5 + Math.random() * 15),
      condition: ['sunny', 'cloudy', 'partly-cloudy', 'rainy'][Math.floor(Math.random() * 4)]
    })),
    metadata: {
      source: 'Open-Meteo (Mock)',
      generatedAt: new Date().toISOString(),
      isDemo: true
    }
  };
  
  return mockWeather;
}

// Get weather for location
router.get('/', async (req, res) => {
  try {
    const { location } = req.query;
    const config = getApiServiceConfig();
    
    const weatherLocation = (location as string) || config.weather.defaultLocation;
    
    console.log('🌤️ Weather request for location:', weatherLocation);
    
    const weatherData = await getWeatherData(weatherLocation);
    
    res.json({
      success: true,
      weather: weatherData
    });
  } catch (error) {
    console.error('Weather API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get weather data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get weather forecast
router.get('/forecast', async (req, res) => {
  try {
    const { location, days = 5 } = req.query;
    const config = getApiServiceConfig();
    
    const weatherLocation = (location as string) || config.weather.defaultLocation;
    const forecastDays = Math.min(parseInt(days as string) || 5, 14); // Max 14 days
    
    console.log('🌤️ Weather forecast request:', { location: weatherLocation, days: forecastDays });
    
    const weatherData = await getWeatherData(weatherLocation);
    
    // Extend forecast to requested days
    const extendedForecast = Array.from({ length: forecastDays }, (_, i) => ({
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      high: Math.round(15 + Math.random() * 20),
      low: Math.round(5 + Math.random() * 15),
      condition: ['sunny', 'cloudy', 'partly-cloudy', 'rainy'][Math.floor(Math.random() * 4)],
      precipitation: Math.round(Math.random() * 100), // 0-100%
      windSpeed: Math.round(Math.random() * 20)
    }));
    
    res.json({
      success: true,
      location: weatherLocation,
      forecast: extendedForecast,
      metadata: weatherData.metadata
    });
  } catch (error) {
    console.error('Weather forecast error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get weather forecast',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint
router.get('/test', async (req, res) => {
  try {
    const config = getApiServiceConfig();
    
    res.json({
      success: true,
      message: 'Weather API endpoint is working',
      defaultLocation: config.weather.defaultLocation,
      cacheDuration: config.weather.cacheDuration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Weather test error:', error);
    res.status(500).json({
      success: false,
      error: 'Weather test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
