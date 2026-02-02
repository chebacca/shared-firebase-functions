import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

/**
 * Sync Daily Call Sheet Updates to Published Call Sheets
 *
 * This trigger automatically syncs changes from dailyCallSheetRecords to publishedCallSheets
 * when a daily record is updated. This ensures that the mobile companion and security desk
 * apps see real-time updates when call sheets are modified in the standalone app.
 *
 * Triggered on: dailyCallSheetRecords/{recordId} onUpdate
 */
export const syncDailyRecordToPublished = onDocumentUpdated('dailyCallSheetRecords/{recordId}', async (event) => {
        const change = event.data;
        if (!change?.after) return null;
        const startTime = Date.now();
        const recordId = event.params.recordId;

        console.log('🔄 [syncDailyRecordToPublished] Triggered for record:', recordId);

        try {
            const after = change.after.data();

            // Only sync if the record is published
            if (after.status !== 'published') {
                console.log('📋 [syncDailyRecordToPublished] Record not published (status:', after.status, '), skipping sync');
                return null;
            }

            // Find the corresponding published call sheet
            const callSheetId = after.callSheetData?.id;
            if (!callSheetId) {
                console.log('⚠️ [syncDailyRecordToPublished] No callSheetId found in callSheetData, skipping sync');
                return null;
            }

            const organizationId = after.organizationId;
            if (!organizationId) {
                console.log('⚠️ [syncDailyRecordToPublished] No organizationId found, skipping sync');
                return null;
            }

            console.log('🔍 [syncDailyRecordToPublished] Looking for published call sheet:', {
                callSheetId,
                organizationId,
                projectName: after.projectName
            });

            // Query for the published call sheet
            const publishedQuery = await admin.firestore()
                .collection('publishedCallSheets')
                .where('callSheetId', '==', callSheetId)
                .where('organizationId', '==', organizationId)
                .limit(1)
                .get();

            if (publishedQuery.empty) {
                console.log('⚠️ [syncDailyRecordToPublished] No published call sheet found for callSheetId:', callSheetId);
                return null;
            }

            const publishedDoc = publishedQuery.docs[0];
            const publishedData = publishedDoc.data();

            console.log('✅ [syncDailyRecordToPublished] Found published call sheet:', publishedDoc.id);

            // Prepare update data - FLAT STRUCTURE (matching publishCallSheet format)
            const updateData: any = {
                // Basic information at ROOT level
                title: after.callSheetData?.title || after.projectName || publishedData.title,
                projectName: after.projectName || publishedData.projectName,
                date: after.recordDate || after.date || publishedData.date,
                location: after.callSheetData?.location || publishedData.location,

                // Time information at ROOT level
                callTime: after.callSheetData?.callTime || publishedData.callTime,
                wrapTime: after.callSheetData?.wrapTime || publishedData.wrapTime,
                generalCrewCall: after.callSheetData?.generalCrewCall || after.callSheetData?.callTime || publishedData.generalCrewCall,

                // Production information at ROOT level
                director: after.callSheetData?.director || publishedData.director,
                producer: after.callSheetData?.producer || publishedData.producer,
                production: after.callSheetData?.production || publishedData.production,

                // Weather information at ROOT level
                weather: after.callSheetData?.weather || publishedData.weather,
                weatherHigh: after.callSheetData?.weatherHigh || publishedData.weatherHigh,
                weatherLow: after.callSheetData?.weatherLow || publishedData.weatherLow,
                sunrise: after.callSheetData?.sunrise || publishedData.sunrise,
                sunset: after.callSheetData?.sunset || publishedData.sunset,

                // Hospital information at ROOT level
                hospitalName: after.callSheetData?.hospitalName || publishedData.hospitalName,
                hospitalAddress: after.callSheetData?.hospitalAddress || publishedData.hospitalAddress,
                hospitalPhone: after.callSheetData?.hospitalPhone || publishedData.hospitalPhone,

                // Job information at ROOT level
                jobId: after.callSheetData?.jobId || publishedData.jobId,
                shootDay: after.callSheetData?.shootDay || publishedData.shootDay,

                // Notes at ROOT level
                notes: after.callSheetData?.notes || publishedData.notes,
                description: after.callSheetData?.description || publishedData.description,

                // Arrays at ROOT level
                personnel: Array.isArray(after.callSheetData?.personnel) ? after.callSheetData.personnel : (publishedData.personnel || []),
                locations: Array.isArray(after.callSheetData?.locations) ? after.callSheetData.locations : (publishedData.locations || []),
                schedule: Array.isArray(after.callSheetData?.schedule) ? after.callSheetData.schedule : (publishedData.schedule || []),
                vendors: Array.isArray(after.callSheetData?.vendors) ? after.callSheetData.vendors : (publishedData.vendors || []),
                walkieChannels: Array.isArray(after.callSheetData?.walkieChannels) ? after.callSheetData.walkieChannels : (publishedData.walkieChannels || []),
                departments: Array.isArray(after.callSheetData?.departments) ? after.callSheetData.departments : (publishedData.departments || []),

                // Update metadata for tracking
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                version: (publishedData.version || 0) + 1,
                updateCount: (publishedData.updateCount || 0) + 1,

                // Mark as live and having updates
                isLive: true,
                hasUnreadUpdates: true,
            };

            // Add to update history
            const updateHistoryEntry = {
                version: (publishedData.version || 0) + 1,
                updatedAt: new Date().toISOString(),
                updatedBy: {
                    id: after.userId || 'system',
                    name: 'System Sync',
                    email: ''
                },
                changes: {
                    summary: 'Call sheet updated from standalone app',
                    fields: Object.keys(after.callSheetData || {}),
                }
            };

            updateData.updateHistory = admin.firestore.FieldValue.arrayUnion(updateHistoryEntry);

            // Perform the update
            await publishedDoc.ref.update(updateData);

            const duration = Date.now() - startTime;
            console.log(`✅ [syncDailyRecordToPublished] Successfully synced to published call sheet in ${duration}ms:`, {
                publishedDocId: publishedDoc.id,
                callSheetId,
                version: updateData.version,
                projectName: after.projectName
            });

            return null;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`❌ [syncDailyRecordToPublished] Error after ${duration}ms:`, error);
            console.error('❌ [syncDailyRecordToPublished] Error message:', error.message);
            console.error('❌ [syncDailyRecordToPublished] Error stack:', error.stack);

            // Don't throw - we don't want to fail the original update
            return null;
        }
    });
