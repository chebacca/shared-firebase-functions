/**
 * Google Maps Platform Service
 * 
 * Provides location intelligence and data using the Google Maps Node.js SDK.
 */

import { Client, PlaceInputType } from '@googlemaps/google-maps-services-js';
import { getGoogleMapsApiKey } from './secrets';

export interface PlaceDetails {
    name: string;
    formatted_address?: string;
    location?: { lat: number; lng: number };
    rating?: number;
    website?: string;
    place_id: string;
    types?: string[];
    photos?: string[];
    summary?: string;
}

export class GoogleMapsService {
    private client: Client;
    private apiKey: string | null = null;

    constructor() {
        this.client = new Client({});
    }

    /**
     * Get the API key lazily to ensure secrets are loaded
     */
    private getApiKey(): string {
        if (!this.apiKey) {
            this.apiKey = getGoogleMapsApiKey();
            if (!this.apiKey) {
                throw new Error('Google Maps API Key is missing. Please configure GOOGLE_MAPS_API_KEY secret.');
            }
        }
        return this.apiKey;
    }

    /**
     * Search for places using the Google Places API
     * @param query The search query (e.g. "Universal Studios Hollywood")
     */
    async searchPlaces(query: string): Promise<PlaceDetails[]> {
        const key = this.getApiKey();

        try {
            console.log(`🗺️ [GoogleMapsService] Searching for: "${query}"`);

            const response = await this.client.findPlaceFromText({
                params: {
                    input: query,
                    inputtype: PlaceInputType.textQuery,
                    fields: ['name', 'formatted_address', 'geometry', 'rating', 'place_id', 'types', 'icon'],
                    key: key
                }
            });

            if (response.data.candidates && response.data.candidates.length > 0) {
                // Determine if we should fetch more details for the top candidate
                // For now, return the basic candidate info
                return response.data.candidates.map(candidate => ({
                    name: candidate.name || 'Unknown Place',
                    formatted_address: candidate.formatted_address,
                    location: candidate.geometry?.location,
                    rating: candidate.rating,
                    place_id: candidate.place_id || '',
                    types: candidate.types
                }));
            }

            return [];
        } catch (error: any) {
            console.error('❌ [GoogleMapsService] Search failed:', error.message);
            throw new Error(`Maps search failed: ${error.message}`);
        }
    }

    /**
     * Get detailed information about a specific place
     * @param placeId The Google Place ID
     */
    async getPlaceDetails(placeId: string): Promise<PlaceDetails> {
        const key = this.getApiKey();

        try {
            const response = await this.client.placeDetails({
                params: {
                    place_id: placeId,
                    fields: ['name', 'formatted_address', 'geometry', 'rating', 'website', 'formatted_phone_number', 'opening_hours', 'types', 'editorial_summary'],
                    key: key
                }
            });

            const result = response.data.result;
            return {
                name: result.name || 'Unknown',
                formatted_address: result.formatted_address,
                location: result.geometry?.location,
                rating: result.rating,
                website: result.website,
                place_id: placeId,
                types: result.types,
                summary: result.editorial_summary?.overview
            };
        } catch (error: any) {
            console.error('❌ [GoogleMapsService] Details fetch failed:', error.message);
            throw new Error(`Maps details failed: ${error.message}`);
        }
    }
}

// Singleton instance
export const googleMapsService = new GoogleMapsService();
