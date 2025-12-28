import * as functions from 'firebase-functions';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Shared business logic function
async function publishCallSheetLogic(data: any, context?: any): Promise<any> {
  try {
    const { callSheetId, organizationId, userId } = data;

    if (!callSheetId) {
      return createErrorResponse('Call sheet ID is required');
    }

    if (!organizationId) {
      return createErrorResponse('Organization ID is required');
    }

    console.log(`📋 [PUBLISH CALL SHEET] Publishing call sheet: ${callSheetId}`);

    // Try to get call sheet from dailyCallSheets first (dashboard app uses this collection)
    let callSheetDoc = await admin.firestore().collection('dailyCallSheets').doc(callSheetId).get();
    let docData = callSheetDoc.exists ? callSheetDoc.data() : null;
    let isFromDailyCallSheets = callSheetDoc.exists;
    
    // If not found, try callSheets collection (standalone app uses this)
    if (!callSheetDoc.exists) {
      callSheetDoc = await admin.firestore().collection('callSheets').doc(callSheetId).get();
      if (!callSheetDoc.exists) {
        // If still not found, try dailyCallSheetRecords collection (call sheet might be in a daily record)
        const dailyRecordsQuery = await admin.firestore()
          .collection('dailyCallSheetRecords')
          .where('organizationId', '==', organizationId)
          .limit(100)
          .get();
        
        let foundInDailyRecord = false;
        for (const dailyDoc of dailyRecordsQuery.docs) {
          const dailyData = dailyDoc.data();
          if (dailyData?.callSheetData?.id === callSheetId) {
            docData = dailyData.callSheetData;
            isFromDailyCallSheets = false;
            foundInDailyRecord = true;
            console.log(`📋 [PUBLISH CALL SHEET] Found call sheet in dailyCallSheetRecords: ${dailyDoc.id}`);
            break;
          }
        }
        
        if (!foundInDailyRecord) {
          return createErrorResponse('Call sheet not found');
        }
      } else {
        docData = callSheetDoc.data();
        isFromDailyCallSheets = false;
      }
    }
    
    // Extract actual call sheet data - handle nested structure from dailyCallSheets
    let actualCallSheetData: any = null;
    if (docData) {
      // If from dailyCallSheets, extract nested callSheetData
      if (isFromDailyCallSheets && docData?.callSheetData) {
        actualCallSheetData = docData.callSheetData;
        console.log(`📋 [PUBLISH CALL SHEET] Extracted nested callSheetData from dailyCallSheets`);
      } else {
        // If from callSheets, use document directly
        actualCallSheetData = docData;
        console.log(`📋 [PUBLISH CALL SHEET] Using flat call sheet data from callSheets`);
      }
    }
    
    if (!actualCallSheetData) {
      return createErrorResponse('Call sheet data not found');
    }
    
    // Verify organization access - allow if call sheet org matches OR user's org matches
    let userOrgId: string | null = null;
    if (context?.auth?.uid) {
      try {
        const userRecord = await admin.auth().getUser(context.auth.uid);
        userOrgId = userRecord.customClaims?.organizationId as string | undefined || null;
      } catch (error) {
        console.warn(`📋 [PUBLISH CALL SHEET] Could not get user org ID:`, error);
      }
    }
    
    // Get organization ID from actual call sheet data or parent document
    const callSheetOrgId = actualCallSheetData?.organizationId || docData?.organizationId;
    const requestedOrgId = organizationId;
    
    // Allow if:
    // 1. Call sheet org matches requested org, OR
    // 2. Call sheet org matches user's org, OR
    // 3. User has access to both organizations (enterprise user case)
    const hasAccess = callSheetOrgId === requestedOrgId || 
                     callSheetOrgId === userOrgId ||
                     (userOrgId === 'enterprise-media-org' && (callSheetOrgId === 'enterprise-media-org' || callSheetOrgId === 'enterprise-org-001'));
    
    if (!hasAccess) {
      console.log(`📋 [PUBLISH CALL SHEET] Organization mismatch:`, {
        callSheetOrgId,
        requestedOrgId,
        userOrgId
      });
      return createErrorResponse('Call sheet not in organization');
    }

    // 🔧 CRITICAL FIX: Get real team members from the project
    const projectId = actualCallSheetData?.projectId || docData?.projectId;
    let assignedTeamMembers: any[] = [];
    let teamMemberIds: string[] = [];
    const addedEmails = new Set<string>(); // Track emails to avoid duplicates
    
    // 🔧 NEW: Ensure publisher is added to team members
    const publisherId = userId || (context?.auth?.uid || 'system');
    let publisherEmail: string | null = null;
    let publisherName: string | null = null;
    
    try {
      // Get publisher's user information
      if (publisherId && publisherId !== 'system') {
        try {
          const publisherUserRecord = await admin.auth().getUser(publisherId);
          publisherEmail = publisherUserRecord.email || null;
          publisherName = publisherUserRecord.displayName || publisherUserRecord.email?.split('@')[0] || null;
        } catch (error) {
          console.warn(`📋 [PUBLISH CALL SHEET] Could not get publisher user record:`, error);
        }
        
        // Also try to get from Firestore users collection
        if (!publisherEmail) {
          try {
            const publisherUserDoc = await admin.firestore().collection('users').doc(publisherId).get();
            if (publisherUserDoc.exists) {
              const publisherUserData = publisherUserDoc.data();
              publisherEmail = publisherUserData?.email || null;
              publisherName = publisherUserData?.displayName || publisherUserData?.name || publisherEmail?.split('@')[0] || null;
            }
          } catch (error) {
            console.warn(`📋 [PUBLISH CALL SHEET] Could not get publisher from users collection:`, error);
          }
        }
      }
    } catch (error) {
      console.warn(`📋 [PUBLISH CALL SHEET] Error getting publisher info:`, error);
    }
    
    if (projectId) {
      try {
        // Get project to find team members
        const projectDoc = await admin.firestore().collection('projects').doc(projectId).get();
        if (projectDoc.exists) {
          const projectData = projectDoc.data();
          
          // Get team assignments from project
          const teamAssignments = projectData?.teamAssignments || projectData?.teamMembers || [];
          
          // Fetch team member details
          for (const assignment of teamAssignments) {
            // 🔧 CRITICAL FIX: Handle different assignment structures
            // teamAssignments can have: userId, teamMemberId, id, or be a string ID
            const teamMemberId = assignment.userId || assignment.teamMemberId || assignment.id || 
                                (typeof assignment === 'string' ? assignment : null);
            
            if (teamMemberId) {
              try {
                const teamMemberDoc = await admin.firestore().collection('teamMembers').doc(teamMemberId).get();
                if (teamMemberDoc.exists) {
                  const teamMemberData = teamMemberDoc.data();
                  if (teamMemberData?.isActive !== false && teamMemberData?.organizationId === organizationId) {
                    const email = teamMemberData.email || assignment.email;
                    if (email && !addedEmails.has(email)) {
                      assignedTeamMembers.push({
                        id: teamMemberDoc.id,
                        email: email,
                        name: teamMemberData.name || teamMemberData.displayName || assignment.name,
                        role: teamMemberData.role || assignment.role,
                        organizationId: teamMemberData.organizationId
                      });
                      teamMemberIds.push(teamMemberDoc.id);
                      addedEmails.add(email);
                    }
                  }
                } else if (assignment.email) {
                  // If team member doc doesn't exist but we have email from assignment, use assignment data
                  if (!addedEmails.has(assignment.email)) {
                    assignedTeamMembers.push({
                      id: teamMemberId,
                      email: assignment.email,
                      name: assignment.name,
                      role: assignment.role,
                      organizationId: organizationId
                    });
                    teamMemberIds.push(teamMemberId);
                    addedEmails.add(assignment.email);
                  }
                }
              } catch (error) {
                console.warn(`📋 [PUBLISH CALL SHEET] Could not fetch team member ${teamMemberId}:`, error);
              }
            }
          }
          
          console.log(`📋 [PUBLISH CALL SHEET] Found ${assignedTeamMembers.length} team members for project`);
        }
      } catch (error) {
        console.warn(`📋 [PUBLISH CALL SHEET] Could not fetch project team members:`, error);
      }
    }
    
    // 🔧 NEW: Add publisher as team member if they have an email and aren't already in the list
    if (publisherEmail && !addedEmails.has(publisherEmail)) {
      try {
        // Check if publisher already exists as a team member
        const existingTeamMemberQuery = await admin.firestore()
          .collection('teamMembers')
          .where('email', '==', publisherEmail)
          .where('organizationId', '==', organizationId)
          .limit(1)
          .get();
        
        let publisherTeamMemberId: string;
        let publisherTeamMemberData: any;
        
        if (!existingTeamMemberQuery.empty) {
          // Publisher already exists as team member
          const existingDoc = existingTeamMemberQuery.docs[0];
          publisherTeamMemberId = existingDoc.id;
          publisherTeamMemberData = existingDoc.data();
          
          // Ensure they're active
          if (publisherTeamMemberData.isActive === false) {
            await admin.firestore().collection('teamMembers').doc(publisherTeamMemberId).update({
              isActive: true,
              updatedAt: admin.firestore.Timestamp.now()
            });
            publisherTeamMemberData.isActive = true;
          }
        } else {
          // Create new team member for publisher
          publisherTeamMemberId = publisherId; // Use publisher's user ID as team member ID
          
          // Get publisher's role from user document or default to 'MEMBER'
          let publisherRole = 'MEMBER';
          let publisherHierarchy = 50;
          
          try {
            const publisherUserDoc = await admin.firestore().collection('users').doc(publisherId).get();
            if (publisherUserDoc.exists) {
              const publisherUserData = publisherUserDoc.data();
              publisherRole = publisherUserData?.role || 'MEMBER';
              publisherHierarchy = publisherUserData?.hierarchy || 50;
            }
          } catch (error) {
            console.warn(`📋 [PUBLISH CALL SHEET] Could not get publisher role:`, error);
          }
          
          // Create team member document
          publisherTeamMemberData = {
            email: publisherEmail,
            name: publisherName || publisherEmail.split('@')[0],
            displayName: publisherName || publisherEmail.split('@')[0],
            role: publisherRole,
            hierarchy: publisherHierarchy,
            organizationId: organizationId,
            isActive: true,
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now()
          };
          
          // Try to get password from user record if available (for authentication)
          try {
            const publisherUserRecord = await admin.auth().getUser(publisherId);
            // Note: We can't get the password hash, but we can store a reference
            // The authenticateTeamMember function will need to check both teamMembers and users collections
          } catch (error) {
            console.warn(`📋 [PUBLISH CALL SHEET] Could not get publisher auth record:`, error);
          }
          
          await admin.firestore().collection('teamMembers').doc(publisherTeamMemberId).set(publisherTeamMemberData);
          console.log(`📋 [PUBLISH CALL SHEET] Created team member for publisher: ${publisherEmail}`);
        }
        
        // Add publisher to assigned team members
        assignedTeamMembers.push({
          id: publisherTeamMemberId,
          email: publisherEmail,
          name: publisherTeamMemberData.name || publisherTeamMemberData.displayName || publisherName,
          role: publisherTeamMemberData.role || 'MEMBER',
          organizationId: organizationId
        });
        teamMemberIds.push(publisherTeamMemberId);
        addedEmails.add(publisherEmail);
        
        console.log(`📋 [PUBLISH CALL SHEET] Added publisher ${publisherEmail} to team members`);
      } catch (error) {
        console.error(`📋 [PUBLISH CALL SHEET] Error adding publisher as team member:`, error);
        // Don't fail the publish if we can't add the publisher - just log the error
      }
    }
    
    // Generate access code (use as both accessCode and publicId for compatibility)
    const accessCode = generatePublicId();
    
    // Create published call sheet with ALL fields explicitly included
    const now = admin.firestore.Timestamp.now();
    const publishedCallSheet = {
      // Core identification
      id: actualCallSheetData?.id || callSheetId,
      callSheetId: callSheetId,
      projectId: actualCallSheetData?.projectId || docData?.projectId,
      userId: actualCallSheetData?.userId || docData?.userId,
      organizationId: organizationId,
      
      // Basic information
      title: actualCallSheetData?.title || actualCallSheetData?.projectName || '',
      projectName: actualCallSheetData?.projectName || '',
      date: actualCallSheetData?.date || '',
      location: actualCallSheetData?.location || '',
      status: actualCallSheetData?.status || 'published',
      departments: Array.isArray(actualCallSheetData?.departments) ? actualCallSheetData.departments : [],
      description: actualCallSheetData?.description || '',
      
      // Production information
      production: actualCallSheetData?.production || '',
      director: actualCallSheetData?.director || '',
      producer: actualCallSheetData?.producer || '',
      
      // Weather information
      weather: actualCallSheetData?.weather || '',
      sunrise: actualCallSheetData?.sunrise || '',
      sunset: actualCallSheetData?.sunset || '',
      weatherHigh: actualCallSheetData?.weatherHigh || '',
      weatherLow: actualCallSheetData?.weatherLow || '',
      
      // Time information
      callTime: actualCallSheetData?.callTime || '',
      wrapTime: actualCallSheetData?.wrapTime || '',
      generalCrewCall: actualCallSheetData?.generalCrewCall || '',
      
      // Job information
      jobId: actualCallSheetData?.jobId || '',
      shootDay: actualCallSheetData?.shootDay || '',
      
      // Hospital information
      hospitalName: actualCallSheetData?.hospitalName || '',
      hospitalAddress: actualCallSheetData?.hospitalAddress || '',
      hospitalPhone: actualCallSheetData?.hospitalPhone || '',
      
      // Notes
      notes: actualCallSheetData?.notes || '',
      
      // Metadata
      isTemplate: actualCallSheetData?.isTemplate || false,
      createdAt: actualCallSheetData?.createdAt || docData?.createdAt || now,
      updatedAt: actualCallSheetData?.updatedAt || docData?.updatedAt || now,
      
      // Nested arrays - ensure they're arrays and preserve all nested structures
      personnel: Array.isArray(actualCallSheetData?.personnel) ? actualCallSheetData.personnel : [],
      locations: Array.isArray(actualCallSheetData?.locations) ? actualCallSheetData.locations : [],
      schedule: Array.isArray(actualCallSheetData?.schedule) ? actualCallSheetData.schedule : [],
      vendors: Array.isArray(actualCallSheetData?.vendors) ? actualCallSheetData.vendors : [],
      walkieChannels: Array.isArray(actualCallSheetData?.walkieChannels) ? actualCallSheetData.walkieChannels : [],
      
      // Publishing metadata
      publishedAt: now,
      publishedBy: userId || (context?.auth?.uid || 'system'),
      isPublished: true,
      isActive: true,
      publicId: accessCode,
      accessCode: accessCode,
      assignedTeamMembers: assignedTeamMembers,
      teamMemberIds: teamMemberIds,
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 days
      
      // Real-time update fields
      isLive: true,
      version: 1,
      updateCount: 0,
      hasUnreadUpdates: false,
      lastUpdatedAt: now,
      updateHistory: []
    };
    
    console.log(`📋 [PUBLISH CALL SHEET] Published call sheet includes:`, {
      hasPersonnel: publishedCallSheet.personnel.length > 0,
      hasLocations: publishedCallSheet.locations.length > 0,
      hasSchedule: publishedCallSheet.schedule.length > 0,
      hasVendors: publishedCallSheet.vendors.length > 0,
      hasWalkieChannels: publishedCallSheet.walkieChannels.length > 0,
      personnelCount: publishedCallSheet.personnel.length,
      locationsCount: publishedCallSheet.locations.length,
      scheduleCount: publishedCallSheet.schedule.length,
      vendorsCount: publishedCallSheet.vendors.length,
      walkieChannelsCount: publishedCallSheet.walkieChannels.length
    });

    // 🔧 CRITICAL FIX: Unpublish any existing published call sheets for this project
    // This ensures only one call sheet per project is active at a time
    if (projectId) {
      try {
        const existingPublishedQuery = await admin.firestore()
          .collection('publishedCallSheets')
          .where('projectId', '==', projectId)
          .where('organizationId', '==', organizationId)
          .where('status', '==', 'published')
          .where('isActive', '==', true)
          .get();
        
        if (!existingPublishedQuery.empty) {
          console.log(`📋 [PUBLISH CALL SHEET] Found ${existingPublishedQuery.size} existing published call sheets for project ${projectId}, unpublishing them...`);
          
          const batch = admin.firestore().batch();
          existingPublishedQuery.docs.forEach(doc => {
            // Skip the current call sheet if it's being republished
            if (doc.id !== callSheetId) {
              console.log(`📋 [PUBLISH CALL SHEET] Unpublishing old call sheet: ${doc.id}`);
              batch.update(doc.ref, {
                isActive: false,
                isPublished: false,
                status: 'unpublished',
                unpublishedAt: now,
                unpublishedBy: userId || (context?.auth?.uid || 'system'),
                unpublishedReason: 'Replaced by newer call sheet'
              });
            }
          });
          
          await batch.commit();
          console.log(`📋 [PUBLISH CALL SHEET] Unpublished ${existingPublishedQuery.size} old call sheets for project ${projectId}`);
        }
      } catch (error) {
        console.warn(`📋 [PUBLISH CALL SHEET] Error unpublishing old call sheets:`, error);
        // Don't fail the publish if we can't unpublish old ones - just log the error
      }
    }
    
    // Check if there's an existing published call sheet (for republishing case)
    const existingPublishedDoc = await admin.firestore().collection('publishedCallSheets').doc(callSheetId).get();
    const isRepublishing = existingPublishedDoc.exists;
    
    if (isRepublishing) {
      console.log(`📋 [PUBLISH CALL SHEET] Republishing call sheet: ${callSheetId} (was previously disabled)`);
    }
    
    // Save published call sheet (this will overwrite existing document, re-enabling it)
    await admin.firestore().collection('publishedCallSheets').doc(callSheetId).set(publishedCallSheet);

    console.log(`📋 [PUBLISH CALL SHEET] Call sheet published successfully: ${callSheetId}`);

    // Construct uniqueLink from baseUrl (required from client)
    if (!data.baseUrl) {
      return createErrorResponse('baseUrl is required for publishing call sheets');
    }
    const baseUrl = data.baseUrl;
    const uniqueLink = `${baseUrl}/c/${publishedCallSheet.accessCode}`;

    return createSuccessResponse({
      callSheetId,
      publicId: publishedCallSheet.publicId,
      accessCode: publishedCallSheet.accessCode, // 🔧 CRITICAL FIX: Return accessCode for client
      uniqueLink: uniqueLink, // 🔧 CRITICAL FIX: Return uniqueLink for client
      publishedAt: publishedCallSheet.publishedAt,
      expiresAt: publishedCallSheet.expiresAt,
      assignedTeamMembers: assignedTeamMembers.length, // 🔧 CRITICAL FIX: Return count of assigned team members
      teamMemberIds: teamMemberIds.length
    }, 'Call sheet published successfully');

  } catch (error: any) {
    console.error('❌ [PUBLISH CALL SHEET] Error:', error);
    return handleError(error, 'publishCallSheet');
  }
}

// HTTP function for UniversalFirebaseInterceptor (v2 API)
export const publishCallSheet = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (req: any, res: any) => {
    try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version');
    res.set('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const result = await publishCallSheetLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [PUBLISH CALL SHEET HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to publish call sheet', error instanceof Error ? error.message : String(error)));
  }
  }
);

// Callable function for direct Firebase usage (v2 API with CORS support)
export const publishCallSheetCallable = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: true,         // Enable CORS support
  },
  async (request) => {
    // Verify authentication (even though invoker is public, we still require auth for the actual request)
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Authentication required to publish call sheets'
      );
    }

    // Convert v2 request to v1-compatible context format
    const context = {
      auth: {
        uid: request.auth.uid,
        token: request.auth.token
      }
    };
    return await publishCallSheetLogic(request.data, context);
  }
);

function generatePublicId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}