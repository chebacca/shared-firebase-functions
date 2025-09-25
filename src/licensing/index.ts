// HTTP functions for UniversalFirebaseInterceptor
export * from './create';
export * from './list';
export * from './update';
export * from './delete';

// Callable functions for direct Firebase usage
export { createLicenseCallable } from './create';
export { listLicensesCallable } from './list';
export { updateLicenseCallable } from './update';
export { deleteLicenseCallable } from './delete';