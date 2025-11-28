/**
 * Airtable Sync Queue Service
 * 
 * Reliable sync queue implementation using Firestore
 * Handles queuing, processing, and retry logic for Airtable sync operations
 */

import { logger } from 'firebase-functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
const Airtable = require('airtable');
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = getFirestore();

export interface SyncQueueItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  collection: string;
  documentId: string;
  data: any;
  airtableBaseId: string;
  airtableTableId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retries: number;
  maxRetries: number;
  error?: string;
  createdAt: Timestamp;
  processedAt?: Timestamp;
  organizationId: string;
  priority: 'low' | 'normal' | 'high';
  metadata?: {
    userId?: string;
    source?: string;
    batchId?: string;
  };
}

export interface SyncBatch {
  id: string;
  organizationId: string;
  airtableBaseId: string;
  airtableTableId: string;
  items: string[]; // Queue item IDs
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Timestamp;
  processedAt?: Timestamp;
  totalItems: number;
  processedItems: number;
  failedItems: number;
}

/**
 * Process Airtable sync queue
 */
export const processAirtableSyncQueue = onDocumentCreated(
  'airtableSyncQueue/{queueId}',
  async (event) => {
    const queueId = event.params.queueId;
    const queueData = event.data.data() as SyncQueueItem;
    
    logger.info('Processing sync queue item', { 
      queueId, 
      type: queueData.type,
      collection: queueData.collection,
      documentId: queueData.documentId
    });

    try {
      // Mark as processing
      await event.data.ref.update({
        status: 'processing',
        processedAt: FieldValue.serverTimestamp()
      });

      // Get integration configuration
      const configSnapshot = await db
        .collection('integrationConfigurations')
        .where('type', '==', 'airtable')
        .where('organizationId', '==', queueData.organizationId)
        .where('baseId', '==', queueData.airtableBaseId)
        .limit(1)
        .get();

      if (configSnapshot.empty) {
        throw new Error(`No Airtable configuration found for base ${queueData.airtableBaseId}`);
      }

      const config = configSnapshot.docs[0].data();
      
      // Get field mapping
      const mappingSnapshot = await db
        .collection('airtableFieldMappings')
        .where('baseId', '==', queueData.airtableBaseId)
        .where('tableId', '==', queueData.airtableTableId)
        .limit(1)
        .get();

      if (mappingSnapshot.empty) {
        throw new Error(`No field mapping found for table ${queueData.airtableTableId}`);
      }

      const mapping = mappingSnapshot.docs[0].data();
      
      // Initialize Airtable client
      const decryptedTokens = decryptCredentials(config.credentials);
      const airtable = Airtable({ apiKey: decryptedTokens.accessToken });
      const base = airtable(queueData.airtableBaseId);
      const table = base(queueData.airtableTableId);

      // Process based on operation type
      switch (queueData.type) {
        case 'create':
          await processCreateOperation(table, queueData, mapping);
          break;
        case 'update':
          await processUpdateOperation(table, queueData, mapping);
          break;
        case 'delete':
          await processDeleteOperation(table, queueData);
          break;
        default:
          throw new Error(`Unknown operation type: ${queueData.type}`);
      }

      // Mark as completed
      await event.data.ref.update({
        status: 'completed',
        processedAt: FieldValue.serverTimestamp()
      });

      logger.info('Sync queue item processed successfully', { queueId });
    } catch (error) {
      logger.error('Sync queue processing failed', { queueId, error });
      
      const retries = queueData.retries + 1;
      if (retries < queueData.maxRetries) {
        // Retry with exponential backoff
        const delay = Math.pow(2, retries) * 1000; // 2s, 4s, 8s, 16s
        setTimeout(async () => {
          await event.data.ref.update({
            status: 'pending',
            retries,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }, delay);
      } else {
        // Mark as failed
        await event.data.ref.update({
          status: 'failed',
          processedAt: FieldValue.serverTimestamp(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
);

/**
 * Process create operation
 */
async function processCreateOperation(
  table: any,
  queueItem: SyncQueueItem,
  mapping: any
): Promise<void> {
  const airtableRecord = transformFirebaseToAirtable(queueItem.data, mapping);
  
  const createdRecord = await table.create(airtableRecord);
  
  // Update Firebase document with Airtable ID
  await db.collection(queueItem.collection).doc(queueItem.documentId).update({
    _airtableId: createdRecord.id,
    _airtableBaseId: queueItem.airtableBaseId,
    _airtableTableId: queueItem.airtableTableId,
    _lastSyncedAt: FieldValue.serverTimestamp()
  });
  
  logger.info('Created record in Airtable', {
    documentId: queueItem.documentId,
    airtableId: createdRecord.id
  });
}

/**
 * Process update operation
 */
async function processUpdateOperation(
  table: any,
  queueItem: SyncQueueItem,
  mapping: any
): Promise<void> {
  if (!queueItem.data._airtableId) {
    throw new Error('Airtable ID not found for update operation');
  }
  
  const airtableRecord = transformFirebaseToAirtable(queueItem.data, mapping);
  
  await table.update(queueItem.data._airtableId, airtableRecord);
  
  // Update last synced timestamp
  await db.collection(queueItem.collection).doc(queueItem.documentId).update({
    _lastSyncedAt: FieldValue.serverTimestamp()
  });
  
  logger.info('Updated record in Airtable', {
    documentId: queueItem.documentId,
    airtableId: queueItem.data._airtableId
  });
}

/**
 * Process delete operation
 */
async function processDeleteOperation(
  table: any,
  queueItem: SyncQueueItem
): Promise<void> {
  if (!queueItem.data._airtableId) {
    throw new Error('Airtable ID not found for delete operation');
  }
  
  await table.destroy(queueItem.data._airtableId);
  
  logger.info('Deleted record from Airtable', {
    documentId: queueItem.documentId,
    airtableId: queueItem.data._airtableId
  });
}

/**
 * Transform Firebase document to Airtable record
 */
function transformFirebaseToAirtable(firebaseDoc: any, mapping: any): any {
  const airtableRecord: any = {};
  
  for (const fieldMapping of mapping.fieldMappings) {
    const firebaseValue = firebaseDoc[fieldMapping.firebaseField];
    const airtableField = fieldMapping.airtableField;
    
    if (firebaseValue !== undefined && firebaseValue !== null) {
      switch (fieldMapping.airtableType) {
        case 'singleLineText':
        case 'multilineText':
        case 'email':
        case 'phoneNumber':
        case 'url':
          airtableRecord[airtableField] = String(firebaseValue);
          break;
          
        case 'number':
        case 'currency':
        case 'percent':
        case 'rating':
          airtableRecord[airtableField] = Number(firebaseValue);
          break;
          
        case 'checkbox':
          airtableRecord[airtableField] = Boolean(firebaseValue);
          break;
          
        case 'date':
        case 'dateTime':
          if (firebaseValue instanceof Timestamp) {
            airtableRecord[airtableField] = firebaseValue.toDate().toISOString();
          } else if (firebaseValue instanceof Date) {
            airtableRecord[airtableField] = firebaseValue.toISOString();
          } else if (typeof firebaseValue === 'string') {
            airtableRecord[airtableField] = firebaseValue;
          }
          break;
          
        case 'singleSelect':
          airtableRecord[airtableField] = firebaseValue;
          break;
          
        case 'multipleSelects':
          airtableRecord[airtableField] = Array.isArray(firebaseValue) ? firebaseValue : [];
          break;
          
        case 'multipleRecordLinks':
          airtableRecord[airtableField] = Array.isArray(firebaseValue) ? firebaseValue : [];
          break;
          
        case 'multipleAttachments':
          airtableRecord[airtableField] = Array.isArray(firebaseValue) ? firebaseValue : [];
          break;
          
        default:
          airtableRecord[airtableField] = firebaseValue;
      }
    }
  }
  
  return airtableRecord;
}

/**
 * Queue sync operation
 */
export async function queueSyncOperation(
  organizationId: string,
  airtableBaseId: string,
  airtableTableId: string,
  operation: {
    type: 'create' | 'update' | 'delete';
    collection: string;
    documentId: string;
    data: any;
    priority?: 'low' | 'normal' | 'high';
    metadata?: any;
  }
): Promise<string> {
  const queueId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const queueItem: SyncQueueItem = {
    id: queueId,
    type: operation.type,
    collection: operation.collection,
    documentId: operation.documentId,
    data: operation.data,
    airtableBaseId,
    airtableTableId,
    status: 'pending',
    retries: 0,
    maxRetries: 3,
    createdAt: FieldValue.serverTimestamp() as Timestamp,
    organizationId,
    priority: operation.priority || 'normal',
    metadata: operation.metadata
  };
  
  await db.collection('airtableSyncQueue').doc(queueId).set(queueItem);
  
  logger.info('Queued sync operation', {
    queueId,
    type: operation.type,
    collection: operation.collection,
    documentId: operation.documentId
  });
  
  return queueId;
}

/**
 * Process sync batch
 */
export const processSyncBatch = onDocumentCreated(
  'airtableSyncBatches/{batchId}',
  async (event) => {
    const batchId = event.params.batchId;
    const batchData = event.data.data() as SyncBatch;
    
    logger.info('Processing sync batch', { batchId, totalItems: batchData.totalItems });

    try {
      // Mark batch as processing
      await event.data.ref.update({
        status: 'processing',
        processedAt: FieldValue.serverTimestamp()
      });

      let processedItems = 0;
      let failedItems = 0;

      // Process each item in the batch
      for (const itemId of batchData.items) {
        try {
          const itemDoc = await db.collection('airtableSyncQueue').doc(itemId).get();
          if (!itemDoc.exists) {
            logger.warn('Queue item not found', { itemId });
            failedItems++;
            continue;
          }

          const itemData = itemDoc.data() as SyncQueueItem;
          
          // Process the item (this will trigger the queue processor)
          await itemDoc.ref.update({
            status: 'pending',
            batchId: batchId
          });

          // Wait for processing to complete
          await waitForItemProcessing(itemId);
          
          processedItems++;
        } catch (error) {
          logger.error('Failed to process batch item', { itemId, error });
          failedItems++;
        }
      }

      // Update batch status
      await event.data.ref.update({
        status: failedItems > 0 ? 'failed' : 'completed',
        processedItems,
        failedItems,
        processedAt: FieldValue.serverTimestamp()
      });

      logger.info('Sync batch processed', {
        batchId,
        processedItems,
        failedItems
      });
    } catch (error) {
      logger.error('Sync batch processing failed', { batchId, error });
      
      await event.data.ref.update({
        status: 'failed',
        processedAt: FieldValue.serverTimestamp(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Wait for item processing to complete
 */
async function waitForItemProcessing(itemId: string, maxWaitTime: number = 30000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const itemDoc = await db.collection('airtableSyncQueue').doc(itemId).get();
    if (!itemDoc.exists) {
      return; // Item processed and removed
    }
    
    const itemData = itemDoc.data() as SyncQueueItem;
    if (itemData.status === 'completed' || itemData.status === 'failed') {
      return; // Item processing completed
    }
    
    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Item processing timeout: ${itemId}`);
}

/**
 * Create sync batch
 */
export async function createSyncBatch(
  organizationId: string,
  airtableBaseId: string,
  airtableTableId: string,
  items: Array<{
    type: 'create' | 'update' | 'delete';
    collection: string;
    documentId: string;
    data: any;
    priority?: 'low' | 'normal' | 'high';
    metadata?: any;
  }>
): Promise<string> {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const queueItemIds: string[] = [];
  
  // Create queue items
  for (const item of items) {
    const queueId = await queueSyncOperation(
      organizationId,
      airtableBaseId,
      airtableTableId,
      item
    );
    queueItemIds.push(queueId);
  }
  
  // Create batch
  const batch: SyncBatch = {
    id: batchId,
    organizationId,
    airtableBaseId,
    airtableTableId,
    items: queueItemIds,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp() as Timestamp,
    totalItems: items.length,
    processedItems: 0,
    failedItems: 0
  };
  
  await db.collection('airtableSyncBatches').doc(batchId).set(batch);
  
  logger.info('Created sync batch', {
    batchId,
    totalItems: items.length
  });
  
  return batchId;
}

/**
 * Get sync queue status
 */
export async function getSyncQueueStatus(organizationId: string): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}> {
  const queueSnapshot = await db
    .collection('airtableSyncQueue')
    .where('organizationId', '==', organizationId)
    .get();
  
  const status = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: queueSnapshot.size
  };
  
  queueSnapshot.docs.forEach(doc => {
    const data = doc.data() as SyncQueueItem;
    status[data.status]++;
  });
  
  return status;
}

/**
 * Clean up old queue items
 */
export const cleanupSyncQueue = onSchedule('every 24 hours', async () => {
  try {
    logger.info('Starting sync queue cleanup');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep items for 7 days

    const oldItemsSnapshot = await db
      .collection('airtableSyncQueue')
      .where('createdAt', '<', Timestamp.fromDate(cutoffDate))
      .where('status', 'in', ['completed', 'failed'])
      .get();

    const batch = db.batch();
    oldItemsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    logger.info('Sync queue cleanup completed', {
      deletedItems: oldItemsSnapshot.size
    });
  } catch (error) {
    logger.error('Sync queue cleanup failed', error);
  }
});

/**
 * Decrypt credentials (reuse from main airtable.ts)
 */
function decryptCredentials(encryptedCredentials: any): any {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  const iv = Buffer.from(encryptedCredentials.iv, 'hex');
  const authTag = Buffer.from(encryptedCredentials.authTag, 'hex');
  
  const decipher = require('crypto').createDecipher(algorithm, key);
  decipher.setAAD(Buffer.from('airtable-credentials'));
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedCredentials.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}
