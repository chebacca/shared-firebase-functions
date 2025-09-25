// HTTP functions for UniversalFirebaseInterceptor
export * from './create';
export * from './list';
export * from './update';
export * from './delete';

// Callable functions for direct Firebase usage
export { createDatasetCallable } from './create';
export { listDatasetsCallable } from './list';
export { updateDatasetCallable } from './update';
export { deleteDatasetCallable } from './delete';