/**
 * 🗺️ Google Maps API Routes
 * 
 * Firebase Functions routes for Google Maps integration
 */

import { Router } from 'express';
import { getApiServiceConfig } from '../utils/environment';
import { db } from '../../shared/utils';
import { FieldValue } from 'firebase-admin/firestore';

const router: Router = Router();

// Google Maps API configuration endpoint
router.get('/config', async (req, res) => {
  try {
    const config = getApiServiceConfig();
    
    res.json({
      success: true,
      hasApiKey: !!config.googleMaps.apiKey,
      isConfigured: !!config.googleMaps.apiKey,
      timestamp: new Date().toISOString()
    });
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
router.get('/locations/:mapLayoutId', async (req, res) => {
  try {
    const { mapLayoutId } = req.params;
    const userId = req.user?.uid;
    
    console.log('🗺️ Getting entity locations for map layout:', mapLayoutId, 'user:', userId);
    
    if (!mapLayoutId) {
      return res.status(400).json({
        success: false,
        error: 'Map layout ID is required'
      });
    }

    // Get entity locations from Firestore
    const locationsQuery = await db
      .collection('entityLocations')
      .where('mapLayoutId', '==', mapLayoutId)
      .get();
    
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
router.post('/locations', async (req, res) => {
  try {
    const { mapLayoutId, entityType, entityId, latitude, longitude, metadata } = req.body;
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

    // Create or update entity location
    const locationData: any = {
      mapLayoutId,
      entityType,
      entityId,
      latitude,
      longitude,
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
    } else {
      // Create new location
      locationData.createdAt = FieldValue.serverTimestamp();
      locationData.createdBy = userId;
      locationDoc = await db.collection('entityLocations').add(locationData);
    }
    
    const savedLocation = {
      id: locationDoc.id,
      ...locationData
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
router.delete('/locations/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const userId = req.user?.uid;
    
    console.log('🗺️ Deleting entity location:', locationId, 'by user:', userId);
    
    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'Location ID is required'
      });
    }

    // Delete the location
    await db.collection('entityLocations').doc(locationId).delete();
    
    console.log('🗺️ Deleted entity location:', locationId);
    
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
router.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    const config = getApiServiceConfig();
    
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    if (!config.googleMaps.apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Google Maps API key not configured'
      });
    }

    console.log('🗺️ Geocoding address:', address);
    
    // Mock geocoding response for now
    // TODO: Implement actual Google Maps Geocoding API call
    const mockResult = {
      success: true,
      results: [{
        formatted_address: address,
        geometry: {
          location: {
            lat: 34.0522 + (Math.random() - 0.5) * 0.1, // Los Angeles area with some variation
            lng: -118.2437 + (Math.random() - 0.5) * 0.1
          }
        },
        place_id: `mock_place_id_${Date.now()}`,
        types: ['establishment']
      }],
      status: 'OK',
      isDemo: true
    };
    
    return res.json(mockResult);
  } catch (error) {
    console.error('Google Maps geocode error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to geocode address',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Place autocomplete endpoint
router.get('/places/autocomplete', async (req, res) => {
  try {
    const { input } = req.query;
    const config = getApiServiceConfig();
    
    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'Input query parameter is required'
      });
    }

    if (!config.googleMaps.apiKey) {
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
    const config = getApiServiceConfig();
    
    res.json({
      success: true,
      message: 'Google Maps API endpoint is working',
      configured: !!config.googleMaps.apiKey,
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
