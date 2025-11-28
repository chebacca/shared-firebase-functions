/**
 * Firebase Functions Index
 * Exports all functions from the compiled lib/index.js
 * This ensures all functions are available for deployment
 */

const { initializeApp } = require('firebase-admin/app');

// Initialize Firebase Admin
initializeApp();

// Re-export everything from the compiled lib/index.js
// This allows Firebase to discover all exported functions
const libExports = require('./lib/index');

// Explicitly export all functions for Firebase to discover
for (const key in libExports) {
  if (libExports.hasOwnProperty(key)) {
    exports[key] = libExports[key];
  }
}
