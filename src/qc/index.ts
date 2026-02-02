/**
 * QC Functions Index
 * Exports all QC-related Firebase Functions
 */

// Storage trigger temporarily disabled due to bucket region detection issues
// Uncomment when bucket configuration is resolved
// export { onQCFileUpload } from './onFileUpload';
export { triggerQCAnalysis } from './triggerQCAnalysis';
