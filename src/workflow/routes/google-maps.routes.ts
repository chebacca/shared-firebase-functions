/**
 * 🗺️ Google Maps API Routes
 * 
 * Firebase Functions routes for Google Maps integration
 */

import { Router } from 'express';
import { getApiServiceConfig } from '../utils/environment';
import { getGoogleMapsApiKey } from '../../google/secrets';
import { db } from '../../shared/utils';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateToken } from '../../shared/middleware';
import { Client } from '@googlemaps/google-maps-services-js';

const router: Router = Router();
const mapsClient = new Client({});

// Helper to get API key from Secrets (preferred) or Environment (fallback)
const getEffectiveApiKey = (): string => {
  try {
    const secretKey = getGoogleMapsApiKey();
    if (secretKey && secretKey.trim().length > 0) {
      return secretKey.trim();
    }
  } catch (error) {
    // Secret not available (e.g. local emulator without secrets)
  }

  // Fallback to environment variables
  const config = getApiServiceConfig();
  return (config.googleMaps.apiKey || '').trim();
};

// Google Maps API configuration endpoint (public - no auth required)
router.get('/config', async (req, res) => {
  try {
    // Try to get API key from Firebase Secrets first (preferred method)
    let apiKey = '';
    try {
      apiKey = getGoogleMapsApiKey();
      // Trim whitespace/newlines that might be in the secret
      if (apiKey) {
        apiKey = apiKey.trim();
      }
    } catch (secretError) {
      // Fallback to environment variables if secret not available
      console.warn('🗺️ [Workflow Google Maps] Secret not available, trying env var:', secretError);
      const config = getApiServiceConfig();
      apiKey = (config.googleMaps.apiKey || '').trim();
    }

    console.log('🗺️ [Workflow Google Maps Config] API key check:', {
      hasKey: !!apiKey,
      keyLength: apiKey?.length || 0,
      keyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'none',
      source: apiKey ? 'secret-or-env' : 'none'
    });

    // Build response with API key if available
    const responseData: any = {
      success: true,
      hasApiKey: !!apiKey,
      isConfigured: !!apiKey && apiKey.length > 0,
      timestamp: new Date().toISOString()
    };

    // Only include apiKey if it exists (for security, don't send empty strings)
    if (apiKey && apiKey.length > 0) {
      responseData.apiKey = apiKey;
    }

    res.json(responseData);
  } catch (error) {
    console.error('Google Maps config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Google Maps configuration',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get entity locations for a map layout
router.get('/locations/:mapLayoutId', authenticateToken, async (req, res) => {
  try {
    const mapLayoutId = Array.isArray(req.params.mapLayoutId) ? req.params.mapLayoutId[0] : req.params.mapLayoutId;
    const { entityType } = req.query;
    const userId = req.user?.uid;

    console.log('🗺️ Getting entity locations for map layout:', mapLayoutId, 'entityType:', entityType, 'user:', userId);

    if (!mapLayoutId) {
      return res.status(400).json({
        success: false,
        error: 'Map layout ID is required'
      });
    }

    // Build query with optional entityType filter
    let query = db.collection('entityLocations')
      .where('mapLayoutId', '==', mapLayoutId);

    if (entityType) {
      query = query.where('entityType', '==', entityType);
    }

    const locationsQuery = await query.get();
    const locations = locationsQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log('🗺️ Found', locations.length, 'entity locations for map layout:', mapLayoutId);

    return res.json(locations);
  } catch (error) {
    console.error('Google Maps locations error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get entity locations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Save entity location
router.post('/locations', authenticateToken, async (req, res) => {
  try {
    const { mapLayoutId, entityType, entityId, latitude, longitude, address, placeId, positionX, positionY, metadata } = req.body;
    const userId = req.user?.uid;

    console.log('🗺️ Saving entity location:', {
      mapLayoutId,
      entityType,
      entityId,
      position: { lat: latitude, lng: longitude },
      userId
    });

    if (!mapLayoutId || !entityType || !entityId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: mapLayoutId, entityType, entityId, latitude, longitude'
      });
    }

    // If address is not provided, try to reverse geocode
    let finalAddress = address;
    if (!finalAddress) {
      try {
        const config = getApiServiceConfig();
        if (config.googleMaps.apiKey) {
          const response = await mapsClient.reverseGeocode({
            params: {
              latlng: { lat: latitude, lng: longitude },
              key: config.googleMaps.apiKey
            }
          });
          if (response.data.results && response.data.results.length > 0) {
            finalAddress = response.data.results[0].formatted_address;
          }
        }
      } catch (geocodeError) {
        console.warn('Reverse geocoding failed, continuing without address:', geocodeError);
      }
    }

    // Create or update entity location
    const locationData: any = {
      mapLayoutId,
      entityType,
      entityId,
      latitude,
      longitude,
      address: finalAddress,
      placeId,
      positionX,
      positionY,
      metadata: metadata || {},
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: userId
    };

    // Check if location already exists
    const existingQuery = await db
      .collection('entityLocations')
      .where('mapLayoutId', '==', mapLayoutId)
      .where('entityType', '==', entityType)
      .where('entityId', '==', entityId)
      .limit(1)
      .get();

    let locationDoc;
    if (!existingQuery.empty) {
      // Update existing location
      locationDoc = existingQuery.docs[0];
      await locationDoc.ref.update(locationData);
      // Fetch the updated document to get actual timestamp values
      locationDoc = await locationDoc.ref.get();
    } else {
      // Create new location
      locationData.createdAt = FieldValue.serverTimestamp();
      locationData.createdBy = userId;
      locationDoc = await db.collection('entityLocations').add(locationData);
      // Fetch the newly created document to get actual timestamp values
      locationDoc = await locationDoc.get();
    }

    // Get the document data (this will have actual timestamps, not FieldValue objects)
    const docData = locationDoc.data();
    const savedLocation = {
      id: locationDoc.id,
      ...docData
    };

    console.log('🗺️ Saved entity location:', savedLocation.id);

    return res.json({
      success: true,
      location: savedLocation
    });
  } catch (error) {
    console.error('Google Maps save location error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save entity location',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete entity location
router.delete('/locations/:mapLayoutId/:entityType/:entityId', authenticateToken, async (req, res) => {
  try {
    const { mapLayoutId, entityType, entityId } = req.params;
    const userId = req.user?.uid;

    console.log('🗺️ Deleting entity location:', { mapLayoutId, entityType, entityId }, 'by user:', userId);

    if (!mapLayoutId || !entityType || !entityId) {
      return res.status(400).json({
        success: false,
        error: 'Map layout ID, entity type, and entity ID are required'
      });
    }

    // Find and delete the location
    const existingQuery = await db
      .collection('entityLocations')
      .where('mapLayoutId', '==', mapLayoutId)
      .where('entityType', '==', entityType)
      .where('entityId', '==', entityId)
      .limit(1)
      .get();

    if (existingQuery.empty) {
      return res.status(404).json({
        success: false,
        error: 'Entity location not found'
      });
    }

    await existingQuery.docs[0].ref.delete();

    console.log('🗺️ Deleted entity location:', { mapLayoutId, entityType, entityId });

    return res.json({
      success: true,
      message: 'Entity location deleted successfully'
    });
  } catch (error) {
    console.error('Google Maps delete location error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete entity location',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Geocoding endpoint (using Google Maps API)
router.post('/geocode', authenticateToken, async (req, res) => {
  try {
    const { address } = req.body;
    const apiKey = getEffectiveApiKey();

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Google Maps API key not configured'
      });
    }

    console.log('🗺️ Geocoding address:', address);

    // Use real Google Maps Geocoding API
    const response = await mapsClient.geocode({
      params: {
        address,
        key: apiKey
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      return res.json({
        success: true,
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        formatted_address: result.formatted_address,
        place_id: result.place_id
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'Address not found'
      });
    }
  } catch (error) {
    console.error('Google Maps geocode error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to geocode address',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Reverse geocoding endpoint (coordinates to address)
router.post('/reverse-geocode', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const apiKey = getEffectiveApiKey();

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Google Maps API key not configured'
      });
    }

    console.log('🗺️ Reverse geocoding coordinates:', { latitude, longitude });

    // Use real Google Maps Reverse Geocoding API
    const response = await mapsClient.reverseGeocode({
      params: {
        latlng: { lat: latitude, lng: longitude },
        key: apiKey
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      return res.json({
        success: true,
        address: response.data.results[0].formatted_address,
        place_id: response.data.results[0].place_id,
        location: response.data.results[0].geometry.location
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }
  } catch (error) {
    console.error('Google Maps reverse geocode error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reverse geocode coordinates',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Place autocomplete endpoint
router.get('/places/autocomplete', authenticateToken, async (req, res) => {
  try {
    const { input } = req.query;
    const apiKey = getEffectiveApiKey();

    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'Input query parameter is required'
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Google Maps API key not configured'
      });
    }

    console.log('🗺️ Place autocomplete request for:', input);

    // Mock autocomplete response for now
    // TODO: Implement actual Google Places API call
    const mockResults = [
      {
        place_id: `mock_place_${Date.now()}_1`,
        description: `${input} - Mock Location 1`,
        structured_formatting: {
          main_text: `${input} - Mock Location 1`,
          secondary_text: 'Mock City, Mock State'
        }
      },
      {
        place_id: `mock_place_${Date.now()}_2`,
        description: `${input} - Mock Location 2`,
        structured_formatting: {
          main_text: `${input} - Mock Location 2`,
          secondary_text: 'Mock City, Mock State'
        }
      }
    ];

    return res.json({
      success: true,
      predictions: mockResults,
      status: 'OK',
      isDemo: true
    });
  } catch (error) {
    console.error('Google Maps autocomplete error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get place predictions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint
router.get('/test', async (req, res) => {
  try {
    const apiKey = getEffectiveApiKey();

    res.json({
      success: true,
      message: 'Google Maps API endpoint is working',
      configured: !!apiKey,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Google Maps test error:', error);
    res.status(500).json({
      success: false,
      error: 'Google Maps test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
