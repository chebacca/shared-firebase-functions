/**
 * Calculate Directions Callable Function
 * 
 * Firebase callable function wrapper for Google Directions API
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { Client } from '@googlemaps/google-maps-services-js';
import { getGoogleMapsApiKey } from '../../google/secrets';

const googleMapsApiKeySecret = defineSecret('GOOGLE_MAPS_API_KEY');
const mapsClient = new Client({});

interface DirectionsRequest {
  origin: { lat: number; lng: number } | string;
  destination: { lat: number; lng: number } | string;
  travelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT' | 'BICYCLING';
  waypoints?: Array<{ lat: number; lng: number } | string>;
}

export const calculateDirections = onCall(
  {
    secrets: [googleMapsApiKeySecret],
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    try {
      const { origin, destination, travelMode = 'DRIVING', waypoints } = request.data as DirectionsRequest;

      if (!origin || !destination) {
        throw new HttpsError('invalid-argument', 'Origin and destination are required');
      }

      const apiKey = getGoogleMapsApiKey();
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'Google Maps API key not configured');
      }

      // Prepare waypoints if provided
      const waypointsParam = waypoints && Array.isArray(waypoints) && waypoints.length > 0
        ? waypoints.map((wp) =>
          typeof wp === 'string' ? wp : `${wp.lat},${wp.lng}`
        ).join('|')
        : undefined;

      // @ts-ignore - Google Maps API type mismatch
      const response = await mapsClient.directions({
        params: {
          origin: typeof origin === 'string' ? origin : `${origin.lat},${origin.lng}`,
          destination: typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`,
          // @ts-ignore - TravelMode type mismatch
          mode: travelMode.toLowerCase() as 'driving' | 'walking' | 'transit' | 'bicycling',
          // @ts-ignore - Waypoints type mismatch
          waypoints: waypointsParam,
          key: apiKey
        }
      });

      if (response.data.status !== 'OK') {
        throw new HttpsError('not-found', `Directions API error: ${response.data.status}`);
      }

      if (!response.data.routes || response.data.routes.length === 0) {
        throw new HttpsError('not-found', 'No route found');
      }

      const route = response.data.routes[0];
      const leg = route.legs[0]; // Use first leg for distance/duration

      // Extract polyline if available
      const polyline = route.overview_polyline?.points;

      return {
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
      };
    } catch (error: any) {
      console.error('Error calculating directions:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `Failed to calculate directions: ${error.message}`);
    }
  }
);
