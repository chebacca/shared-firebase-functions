/**
 * 🗺️ Google Maps API Routes for IWM
 * 
 * Firebase Functions routes for Google Maps integration with proper API calls
 */

import { Router } from 'express';
import { db, createSuccessResponse, createErrorResponse } from '../../shared/utils';
import { authenticateToken } from '../../shared/middleware';
import { FieldValue } from 'firebase-admin/firestore';
import { googleMapsService } from '../../google/maps';
import { getGoogleMapsApiKey } from '../../google/secrets';
import { Client } from '@googlemaps/google-maps-services-js';

const router: Router = Router();
const mapsClient = new Client({});

// Google Maps API configuration endpoint
router.get('/config', async (req, res) => {
  try {
    const apiKey = getGoogleMapsApiKey();
    console.log('🗺️ [Google Maps Config] API key check:', {
      hasKey: !!apiKey,
      keyLength: apiKey?.length || 0,
      keyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'none'
    });
    
    // Always include apiKey field (even if empty) so frontend can use it
    const responseData: any = {
      hasApiKey: !!apiKey,
      isConfigured: !!apiKey && apiKey.length > 0,
      timestamp: new Date().toISOString()
    };
    
    // Only include apiKey if it exists (for security, don't send empty strings)
    if (apiKey && apiKey.length > 0) {
      responseData.apiKey = apiKey;
    }
    
    res.json(createSuccessResponse(responseData));
  } catch (error: any) {
    console.error('Google Maps config error:', error);
    res.status(500).json(createErrorResponse('Failed to get Google Maps configuration', error.message));
  }
});

// Get entity locations for a map layout
router.get('/locations/:mapLayoutId', authenticateToken, async (req, res) => {
  try {
    const mapLayoutId = Array.isArray(req.params.mapLayoutId) ? req.params.mapLayoutId[0] : req.params.mapLayoutId;
    const { entityType } = req.query;
    
    if (!mapLayoutId) {
      return res.status(400).json(createErrorResponse('Map layout ID is required'));
    }

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
    
    res.json(locations);
  } catch (error: any) {
    console.error('Google Maps locations error:', error);
    res.status(500).json(createErrorResponse('Failed to get entity locations', error.message));
  }
});

// Save entity location
router.post('/locations', authenticateToken, async (req, res) => {
  try {
    const { mapLayoutId, entityType, entityId, latitude, longitude, address, placeId, positionX, positionY, metadata } = req.body;
    const userId = req.user?.uid;
    
    if (!mapLayoutId || !entityType || !entityId || latitude === undefined || longitude === undefined) {
      return res.status(400).json(createErrorResponse('Missing required fields: mapLayoutId, entityType, entityId, latitude, longitude'));
    }

    // If address is not provided, try to reverse geocode
    let finalAddress = address;
    if (!finalAddress) {
      try {
        const apiKey = getGoogleMapsApiKey();
        if (apiKey) {
          const response = await mapsClient.reverseGeocode({
            params: {
              latlng: { lat: latitude, lng: longitude },
              key: apiKey
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
    
    res.json(createSuccessResponse({
      location: savedLocation
    }));
  } catch (error: any) {
    console.error('Google Maps save location error:', error);
    res.status(500).json(createErrorResponse('Failed to save entity location', error.message));
  }
});

// Delete entity location
router.delete('/locations/:mapLayoutId/:entityType/:entityId', authenticateToken, async (req, res) => {
  try {
    const mapLayoutId = Array.isArray(req.params.mapLayoutId) ? req.params.mapLayoutId[0] : req.params.mapLayoutId;
    const entityType = Array.isArray(req.params.entityType) ? req.params.entityType[0] : req.params.entityType;
    const entityId = Array.isArray(req.params.entityId) ? req.params.entityId[0] : req.params.entityId;
    
    if (!mapLayoutId || !entityType || !entityId) {
      return res.status(400).json(createErrorResponse('Map layout ID, entity type, and entity ID are required'));
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
      return res.status(404).json(createErrorResponse('Entity location not found'));
    }

    await existingQuery.docs[0].ref.delete();
    
    res.json(createSuccessResponse({
      message: 'Entity location deleted successfully'
    }));
  } catch (error: any) {
    console.error('Google Maps delete location error:', error);
    res.status(500).json(createErrorResponse('Failed to delete entity location', error.message));
  }
});

// Geocode an address to get coordinates
router.post('/geocode', authenticateToken, async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json(createErrorResponse('Address is required'));
    }

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      return res.status(500).json(createErrorResponse('Google Maps API key not configured'));
    }

    const response = await mapsClient.geocode({
      params: {
        address,
        key: apiKey
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      res.json(createSuccessResponse({
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        formatted_address: result.formatted_address,
        place_id: result.place_id
      }));
    } else {
      res.status(404).json(createErrorResponse('Address not found'));
    }
  } catch (error: any) {
    console.error('Google Maps geocode error:', error);
    res.status(500).json(createErrorResponse('Failed to geocode address', error.message));
  }
});

// Reverse geocode coordinates to get address
router.post('/reverse-geocode', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json(createErrorResponse('Latitude and longitude are required'));
    }

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      return res.status(500).json(createErrorResponse('Google Maps API key not configured'));
    }

    const response = await mapsClient.reverseGeocode({
      params: {
        latlng: { lat: latitude, lng: longitude },
        key: apiKey
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      res.json(createSuccessResponse({
        address: response.data.results[0].formatted_address,
        place_id: response.data.results[0].place_id,
        location: response.data.results[0].geometry.location
      }));
    } else {
      res.status(404).json(createErrorResponse('Location not found'));
    }
  } catch (error: any) {
    console.error('Google Maps reverse geocode error:', error);
    res.status(500).json(createErrorResponse('Failed to reverse geocode coordinates', error.message));
  }
});

// Create a Google Maps layout
router.post('/layouts', authenticateToken, async (req, res) => {
  try {
    const { name, description, center, zoom, mapType } = req.body;
    
    if (!name || !center || !zoom) {
      return res.status(400).json(createErrorResponse('Name, center, and zoom are required'));
    }

    // This endpoint is for creating layout metadata
    // The actual map layout should be created in Firestore by the frontend
    res.json(createSuccessResponse({
      message: 'Layout creation should be handled by the frontend map service',
      name,
      description,
      center,
      zoom,
      mapType
    }));
  } catch (error: any) {
    console.error('Google Maps create layout error:', error);
    res.status(500).json(createErrorResponse('Failed to create layout', error.message));
  }
});

// Calculate directions and distance between two points
router.post('/directions', authenticateToken, async (req, res) => {
  try {
    const { origin, destination, travelMode = 'DRIVING', waypoints } = req.body;
    
    if (!origin || !destination) {
      return res.status(400).json(createErrorResponse('Origin and destination are required'));
    }

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      return res.status(500).json(createErrorResponse('Google Maps API key not configured'));
    }

    // Prepare waypoints if provided
    const waypointsParam = waypoints && Array.isArray(waypoints) && waypoints.length > 0
      ? waypoints.map((wp: any) => 
          typeof wp === 'string' ? wp : `${wp.lat},${wp.lng}`
        ).join('|')
      : undefined;

    const response = await mapsClient.directions({
      params: {
        origin: typeof origin === 'string' ? origin : `${origin.lat},${origin.lng}`,
        destination: typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`,
        mode: travelMode as 'driving' | 'walking' | 'transit' | 'bicycling',
        waypoints: waypointsParam,
        key: apiKey
      }
    });

    if (response.data.status !== 'OK') {
      return res.status(400).json(createErrorResponse(`Directions API error: ${response.data.status}`));
    }

    if (!response.data.routes || response.data.routes.length === 0) {
      return res.status(404).json(createErrorResponse('No route found'));
    }

    const route = response.data.routes[0];
    const leg = route.legs[0]; // Use first leg for distance/duration

    // Extract polyline if available
    const polyline = route.overview_polyline?.points;

    res.json(createSuccessResponse({
      distance: {
        text: leg.distance.text,
        value: leg.distance.value // in meters
      },
      duration: {
        text: leg.duration.text,
        value: leg.duration.value // in seconds
      },
      polyline,
      status: response.data.status
    }));
  } catch (error: any) {
    console.error('Google Maps directions error:', error);
    res.status(500).json(createErrorResponse('Failed to calculate directions', error.message));
  }
});

export default router;
