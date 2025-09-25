// Export all HTTP functions for UniversalFirebaseInterceptor
export * from './auth';
export * from './projects';
export * from './datasets';
export * from './sessions';
export * from './licensing';
export * from './payments';
export * from './callSheets';

// Export all callable functions for direct Firebase usage
export { 
  createProjectCallable, 
  listProjectsCallable, 
  updateProjectCallable, 
  deleteProjectCallable,
  assignDatasetToProjectCallable,
  removeDatasetFromProjectCallable,
  getProjectDatasetsCallable
} from './projects';

export { 
  createDatasetCallable, 
  listDatasetsCallable, 
  updateDatasetCallable, 
  deleteDatasetCallable 
} from './datasets';

export { 
  createSessionCallable, 
  listSessionsCallable, 
  updateSessionCallable, 
  deleteSessionCallable 
} from './sessions';

export { 
  createLicenseCallable, 
  listLicensesCallable, 
  updateLicenseCallable, 
  deleteLicenseCallable 
} from './licensing';

export { 
  createPaymentCallable, 
  listPaymentsCallable, 
  updatePaymentCallable, 
  deletePaymentCallable 
} from './payments';

export { 
  publishCallSheetCallable,
  disablePublishedCallSheetCallable
} from './callSheets';