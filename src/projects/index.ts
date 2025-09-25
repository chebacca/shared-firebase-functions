// HTTP functions for UniversalFirebaseInterceptor
export * from './create';
export * from './list';
export * from './update';
export * from './delete';
export * from './datasets';

// Callable functions for direct Firebase usage
export { createProjectCallable } from './create';
export { listProjectsCallable } from './list';
export { updateProjectCallable } from './update';
export { deleteProjectCallable } from './delete';
export { 
  assignDatasetToProjectCallable, 
  removeDatasetFromProjectCallable, 
  getProjectDatasetsCallable 
} from './datasets';