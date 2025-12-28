/**
 * Data Indexing Service
 * 
 * Provides batch indexing capabilities with strict tenant isolation.
 * Ensures all indexing operations are scoped to specific organizations.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getVectorSearchService } from './VectorSearchService';
import { getAuthenticatedUserOrg } from './authHelpers';

const db = getFirestore();

export interface IndexingJob {
  jobId: string;
  collection: string;
  organizationId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  totalDocuments: number;
  indexedDocuments: number;
  failedDocuments: number;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  errors: Array<{ docId: string; error: string }>;
  checkpoint?: { lastDocId: string; lastIndexedAt: Timestamp };
  createdBy: string;
  userOrgId: string;
}

export interface IndexingOptions {
  batchSize?: number;
  rateLimit?: number; // embeddings per second
  resumeFromCheckpoint?: boolean;
  dryRun?: boolean;
}

export class DataIndexingService {
  private vectorSearch: ReturnType<typeof getVectorSearchService>;

  constructor(apiKey?: string) {
    this.vectorSearch = getVectorSearchService(apiKey);
  }

  /**
   * Index a collection for a specific organization
   * Tenant isolation: Only indexes documents belonging to the specified organization
   * @param createdBy - User ID who triggered the indexing (optional)
   */
  async indexCollection(
    collection: string,
    organizationId: string,
    options: IndexingOptions = {},
    createdBy?: string
  ): Promise<IndexingJob> {
    const jobId = `index_${collection}_${organizationId}_${Date.now()}`;
    const batchSize = options.batchSize || 50;
    const rateLimit = options.rateLimit || 10; // 10 embeddings per second
    const delayBetweenBatches = (1000 / rateLimit) * batchSize; // ms to wait between batches

    // Create job record
    const job: IndexingJob = {
      jobId,
      collection,
      organizationId,
      status: 'running',
      totalDocuments: 0,
      indexedDocuments: 0,
      failedDocuments: 0,
      startedAt: Timestamp.now(),
      errors: [],
      createdBy: createdBy || 'system',
      userOrgId: organizationId
    };

    try {
      // Get all documents for this organization
      const snapshot = await db
        .collection(collection)
        .where('organizationId', '==', organizationId)
        .get();

      job.totalDocuments = snapshot.size;

      if (snapshot.empty) {
        job.status = 'completed';
        job.completedAt = Timestamp.now();
        await this.saveJob(job);
        return job;
      }

      // Process in batches
      const documents = snapshot.docs;
      let processed = 0;

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);

        for (const doc of batch) {
          try {
            const data = doc.data();

            // Extract searchable text based on collection type
            const searchableText = this.extractSearchableText(collection, data);

            if (!searchableText || searchableText.trim().length === 0) {
              console.log(`Skipping ${doc.id} - no searchable text`);
              continue;
            }

            if (!options.dryRun) {
              // Index the entity
              await this.vectorSearch.indexEntity(
                collection,
                doc.id,
                searchableText,
                {
                  organizationId: organizationId,
                  embeddingVersion: '1.0'
                }
              );
            }

            job.indexedDocuments++;
            processed++;

            // Update checkpoint
            job.checkpoint = {
              lastDocId: doc.id,
              lastIndexedAt: Timestamp.now()
            };

            // Save progress every 10 documents
            if (processed % 10 === 0) {
              await this.saveJob(job);
            }
          } catch (error: any) {
            job.failedDocuments++;
            job.errors.push({
              docId: doc.id,
              error: error.message || String(error)
            });
            console.error(`Error indexing ${doc.id}:`, error);
          }
        }

        // Rate limiting: wait between batches
        if (i + batchSize < documents.length && !options.dryRun) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      job.status = 'completed';
      job.completedAt = Timestamp.now();
      await this.saveJob(job);

      return job;
    } catch (error: any) {
      job.status = 'failed';
      job.completedAt = Timestamp.now();
      job.errors.push({
        docId: 'system',
        error: error.message || String(error)
      });
      await this.saveJob(job);
      throw error;
    }
  }

  /**
   * Get indexing progress for a specific organization
   * Tenant isolation: Only returns progress for the specified organization
   */
  async getIndexingProgress(
    collection: string,
    organizationId: string
  ): Promise<IndexingJob | null> {
    const jobsSnapshot = await db
      .collection('indexingJobs')
      .where('collection', '==', collection)
      .where('organizationId', '==', organizationId)
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get();

    if (jobsSnapshot.empty) {
      return null;
    }

    return jobsSnapshot.docs[0].data() as IndexingJob;
  }

  /**
   * Resume indexing from checkpoint
   * Tenant isolation: Validates organizationId matches before resuming
   */
  async resumeIndexing(
    jobId: string,
    organizationId: string
  ): Promise<IndexingJob> {
    const jobDoc = await db.collection('indexingJobs').doc(jobId).get();

    if (!jobDoc.exists) {
      throw new Error(`Job ${jobId} not found`);
    }

    const job = jobDoc.data() as IndexingJob;

    // Validate organizationId matches
    if (job.organizationId !== organizationId) {
      throw new Error('Job does not belong to your organization');
    }

    if (job.status !== 'paused' && job.status !== 'failed') {
      throw new Error(`Cannot resume job with status: ${job.status}`);
    }

    // Resume indexing
    job.status = 'running';
    const options: IndexingOptions = {
      resumeFromCheckpoint: true
    };

    return this.indexCollection(job.collection, job.organizationId, options);
  }

  /**
   * Extract searchable text from document based on collection type
   * Supports all Backbone ecosystem collections
   */
  private extractSearchableText(collection: string, data: any): string {
    const textParts: string[] = [];

    switch (collection) {
      // Core Collections
      case 'projects':
        textParts.push(
          data.name,
          data.description,
          data.status,
          data.phase,
          data.type,
          data.priority,
          data.metadata?.extendedStatus,
          data.tags?.join(' ')
        );
        break;

      case 'teamMembers':
        textParts.push(
          data.name,
          data.firstName,
          data.lastName,
          data.email,
          data.role,
          data.position,
          data.title,
          Array.isArray(data.skills) ? data.skills.join(' ') : data.skills,
          data.department,
          data.bio
        );
        break;

      case 'contacts':
        textParts.push(
          data.firstName,
          data.lastName,
          data.name,
          data.company,
          data.position,
          data.title,
          data.email,
          data.phone,
          data.address,
          Array.isArray(data.skills) ? data.skills.join(' ') : data.skills,
          data.notes
        );
        break;

      case 'inventoryItems':
        textParts.push(
          data.name,
          data.description,
          data.category,
          data.model,
          data.serialNumber,
          data.specifications,
          data.manufacturer,
          data.location
        );
        break;

      // Session & Workflow Collections
      case 'sessions':
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.status,
          data.phase,
          data.type,
          data.notes
        );
        break;

      case 'workflows':
      case 'workflowTemplates':
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.type,
          data.category,
          data.notes
        );
        break;

      case 'workflowInstances':
        textParts.push(
          data.name,
          data.workflowName,
          data.status,
          data.phase,
          data.notes
        );
        break;

      case 'workflowSteps':
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.type,
          data.status,
          data.notes
        );
        break;

      // Timecard Collections
      case 'timecards':
      case 'user_timecards':
      case 'timecard_entries':
        textParts.push(
          data.projectName,
          data.taskDescription,
          data.notes,
          data.status,
          data.category
        );
        break;

      // Media & Post-Production
      case 'postProductionTasks':
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.taskType,
          data.status,
          data.notes,
          data.assignedTo
        );
        break;

      case 'mediaFiles':
        textParts.push(
          data.name,
          data.filename,
          data.description,
          data.fileType,
          data.category,
          data.tags?.join(' '),
          data.metadata?.description
        );
        break;

      // Network Delivery
      case 'networkDeliveryBibles':
        textParts.push(
          data.name,
          data.title,
          data.network,
          data.description,
          data.requirements,
          data.specifications
        );
        break;

      case 'deliverables':
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.type,
          data.status,
          data.requirements
        );
        break;

      // Call Sheets
      case 'callSheets':
      case 'callsheets':
        textParts.push(
          data.title,
          data.projectName,
          data.date,
          data.location,
          data.notes,
          data.weather,
          data.callTime
        );
        break;

      case 'scenes':
        textParts.push(
          data.sceneNumber,
          data.title,
          data.description,
          data.location,
          data.timeOfDay,
          data.characters?.join(' '),
          data.notes
        );
        break;

      // Budget & Financial
      case 'budgets':
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.projectName,
          data.category,
          data.notes
        );
        break;

      case 'invoices':
        textParts.push(
          data.invoiceNumber,
          data.clientName,
          data.description,
          data.notes,
          data.status
        );
        break;

      // ClipShow Collections
      case 'clipShowProjects':
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.status,
          data.type
        );
        break;

      case 'clipShowPitches':
        textParts.push(
          data.title,
          data.description,
          data.pitchType,
          data.status,
          data.notes
        );
        break;

      case 'clipShowStories':
        textParts.push(
          data.title,
          data.story,
          data.description,
          data.category,
          data.tags?.join(' ')
        );
        break;

      // PBM Collections
      case 'pbmProjects':
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.status,
          data.episode
        );
        break;

      case 'pbmSchedules':
        textParts.push(
          data.name,
          data.description,
          data.status,
          data.location
        );
        break;

      // Notes & Communication
      case 'notes':
        textParts.push(
          data.title,
          data.content,
          data.category,
          data.tags?.join(' ')
        );
        break;

      case 'messages':
      case 'chats':
        textParts.push(
          data.subject,
          data.message,
          data.content,
          data.body
        );
        break;

      // Calendar & Scheduling
      case 'calendarEvents':
      case 'schedulerEvents':
        textParts.push(
          data.title,
          data.name,
          data.description,
          data.location,
          data.notes
        );
        break;

      // Clients
      case 'clients':
        textParts.push(
          data.name,
          data.companyName,
          data.description,
          data.contactName,
          data.email,
          data.phone,
          data.address
        );
        break;

      // Roles
      case 'roles':
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.department,
          data.responsibilities
        );
        break;

      // Locations
      case 'locations':
        textParts.push(
          data.name,
          data.address,
          data.description,
          data.type,
          data.notes
        );
        break;

      // Cue Sheets
      case 'cueSheets':
        textParts.push(
          data.title,
          data.projectName,
          data.description,
          data.musicTitle,
          data.composer
        );
        break;

      // Default: Generic extraction
      default:
        textParts.push(
          data.name,
          data.title,
          data.description,
          data.label,
          data.text,
          data.content,
          data.notes,
          data.comment,
          // Handle nested objects
          data.metadata?.description,
          data.metadata?.notes,
          // Handle arrays
          Array.isArray(data.tags) ? data.tags.join(' ') : null,
          Array.isArray(data.categories) ? data.categories.join(' ') : null
        );
    }

    return textParts.filter(Boolean).join(' ').trim();
  }

  /**
   * Save job progress to Firestore
   */
  private async saveJob(job: IndexingJob): Promise<void> {
    await db.collection('indexingJobs').doc(job.jobId).set(job);
  }
}

// Export singleton instance factory
export function getDataIndexingService(apiKey?: string): DataIndexingService {
  return new DataIndexingService(apiKey);
}

