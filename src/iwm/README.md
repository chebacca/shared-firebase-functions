# IWM Firebase Functions

This directory contains Firebase Functions for the Inventory Workflow Manager (IWM) application.

## Functions

### `iwmApi`
Main HTTP function that provides a REST API for IWM operations. Exposed as a Firebase HTTP function with Express routing.

**Endpoint**: `https://us-central1-backbone-logic.cloudfunctions.net/iwmApi`

**Routes**:
- `/health` - Health check endpoint
- `/docs` - API documentation
- `/timecards` - Timecard management routes
- `/approval` - Timecard approval routes
- `/admin` - Admin analytics routes
- `/google-maps` - Google Maps integration routes

## Routes

### Timecard Routes (`/timecards`)
- `GET /` - Get all timecards (with optional filters)
- `GET /:timecardId` - Get a specific timecard
- `POST /` - Create a new timecard
- `PUT /:timecardId` - Update a timecard
- `DELETE /:timecardId` - Delete a timecard

### Approval Routes (`/approval`)
- `POST /approve` - Approve a timecard
- `POST /reject` - Reject a timecard
- `GET /history/:timecardId` - Get approval history for a timecard

### Admin Routes (`/admin`)
- `GET /analytics` - Get timecard analytics (requires admin role)

### Google Maps Routes (`/google-maps`)
- `GET /config` - Get Google Maps API configuration status
- `GET /locations/:mapLayoutId` - Get entity locations for a map layout
- `POST /locations` - Save or update entity location
- `DELETE /locations/:mapLayoutId/:entityType/:entityId` - Delete entity location
- `POST /geocode` - Geocode an address to get coordinates
- `POST /reverse-geocode` - Reverse geocode coordinates to get address
- `POST /layouts` - Create a Google Maps layout (metadata only)

## Authentication

All routes (except `/google-maps/config` and `/health`) require Firebase Auth token in the `Authorization` header:
```
Authorization: Bearer <firebase-id-token>
```

## Google Maps API Integration

The Google Maps routes use the `@googlemaps/google-maps-services-js` client library to make actual API calls to Google Maps Platform:

- **Geocoding**: Converts addresses to coordinates
- **Reverse Geocoding**: Converts coordinates to addresses
- **Location Storage**: Stores entity locations in Firestore `entityLocations` collection

### Required Secret
- `GOOGLE_MAPS_API_KEY` - Google Maps API key (must be set as a Firebase secret)

## Deployment

Deploy IWM functions using:
```bash
./deploy-iwm.sh
```

Or deploy individually:
```bash
firebase deploy --only functions:iwmApi,functions:iwmUpdateClaims
```

## Migration from Express Server

The Express server in `_backbone_iwm/server/` has been converted to Firebase Functions:
- Express routes → Firebase Functions HTTP routes
- Express middleware → Shared Firebase middleware
- Direct Firestore access → Uses shared Firebase utils

The Express server can be deprecated in favor of these Firebase Functions.
