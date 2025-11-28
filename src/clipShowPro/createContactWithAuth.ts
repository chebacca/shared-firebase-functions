/**
 * Create Contact with Firebase Authentication
 * 
 * Creates a new contact in Firestore and optionally creates a Firebase Auth account
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase-admin/app';
import { updateClipShowProClaimsInternal } from './clipShowProUpdateClaims';

// Initialize Firebase Admin
try {
  initializeApp();
} catch (error) {
  // App already initialized
}

const db = getFirestore();
const auth = getAuth();

export const createContactWithAuth = onCall(async (request) => {
  try {
    const { 
      contactData, 
      createAuthAccount = false, 
      sendPasswordResetEmail = false,
      organizationId 
    } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!contactData || !organizationId) {
      throw new HttpsError('invalid-argument', 'Contact data and organization ID are required');
    }

    // Validate email format
    if (contactData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactData.email)) {
      throw new HttpsError('invalid-argument', 'Invalid email format');
    }

    // Get the authenticated user's organization to verify access
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    if (!userData?.organizationId || userData.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Access denied to organization');
    }

    let authUserId: string | null = null;
    
    // Create Firebase Auth user if requested
    if (createAuthAccount && contactData.email) {
      try {
        // Check if user already exists
        let userRecord;
        try {
          userRecord = await auth.getUserByEmail(contactData.email);
          authUserId = userRecord.uid;
          console.log(`✅ User already exists in Firebase Auth: ${authUserId}`);
        } catch (error: any) {
          if (error.code === 'auth/user-not-found') {
            // User doesn't exist, create it
            userRecord = await auth.createUser({
              email: contactData.email,
              emailVerified: false,
              displayName: contactData.name,
              disabled: false
            });
            authUserId = userRecord.uid;
            console.log(`✅ Created new Firebase Auth user: ${authUserId}`);
            
            // Send password reset email if requested
            if (sendPasswordResetEmail && contactData.email) {
              const link = await auth.generatePasswordResetLink(contactData.email);
              console.log(`✅ Generated password reset link for: ${contactData.email}`);
              // TODO: Send email with password reset link
              // await sendPasswordResetEmail(contactData.email, link);
            }
          } else {
            throw error;
          }
        }
      } catch (error: any) {
        console.error('Error creating Firebase Auth user:', error);
        // Continue with contact creation even if auth creation fails
        if (!authUserId) {
          console.warn('⚠️ Proceeding with contact creation without Firebase Auth account');
        }
      }
    }

    // Create contact in Firestore
    const contactRef = await db.collection('clipShowContacts').add({
      ...contactData,
      organizationId,
      firebaseUid: authUserId || null, // Use firebaseUid (not authUserId) for consistency
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
      // Initialize empty arrays for assignments
      assignedPitches: [],
      assignedStories: [],
      assignedShows: []
    });

    // If we created an auth user, set comprehensive custom claims for Clip Show Pro access
    if (authUserId) {
      try {
        // Use centralized claims function with role-based defaults
        const claimsResult = await updateClipShowProClaimsInternal({
          uid: authUserId,
          role: contactData.role, // Will be mapped to Clip Show Pro role
          organizationId,
          preserveExistingClaims: true,
          additionalClaims: {
            isContact: true,
            contactId: contactRef.id,
          },
        });
        
        console.log(`✅ Set comprehensive custom claims for contact: ${contactRef.id}`);
        console.log(`   Role: ${claimsResult.role}, Hierarchy: ${claimsResult.hierarchy}`);
        console.log(`   Clip Show Pro Access: ENABLED`);
        
        // Create user document in users collection for authentication/authorization lookup
        try {
          const userDocRef = db.collection('users').doc(authUserId);
          const userDocExists = await userDocRef.get();
          
          if (!userDocExists.exists) {
            await userDocRef.set({
              id: authUserId,
              uid: authUserId,
              email: contactData.email,
              displayName: contactData.name,
              role: claimsResult.role,
              organizationId,
              isClipShowProUser: true,
              isContact: true,
              contactId: contactRef.id,
              status: 'active',
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            }, { merge: false });
            console.log(`✅ Created user document in users collection`);
          } else {
            // Update existing user document to ensure it has Clip Show Pro flags
            await userDocRef.update({
              organizationId,
              isClipShowProUser: true,
              isContact: true,
              contactId: contactRef.id,
              updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`✅ Updated user document in users collection`);
          }
        } catch (userDocError) {
          console.warn('⚠️ Could not create/update user document:', userDocError);
          // Don't fail contact creation if user document creation fails
        }

        // Create teamMembers collection document for Dashboard app compatibility
        try {
          const teamMemberRef = db.collection('teamMembers').doc(authUserId);
          const teamMemberExists = await teamMemberRef.get();
          
          // Parse name into firstName and lastName
          const nameParts = (contactData.name || '').trim().split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';
          
          if (!teamMemberExists.exists) {
            await teamMemberRef.set({
              id: authUserId,
              userId: authUserId,
              email: contactData.email,
              firstName: firstName,
              lastName: lastName,
              name: contactData.name,
              role: contactData.role || 'MEMBER',
              organizationId: organizationId,
              status: 'active',
              firebaseUid: authUserId,
              clipShowProRole: contactData.role || 'MEMBER',
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            }, { merge: false });
            console.log(`✅ Created teamMembers document for Dashboard app compatibility`);
          } else {
            // Update existing team member to ensure it has correct organization and role
            await teamMemberRef.update({
              organizationId: organizationId,
              role: contactData.role || teamMemberExists.data()?.role || 'MEMBER',
              clipShowProRole: contactData.role || teamMemberExists.data()?.clipShowProRole || 'MEMBER',
              updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`✅ Updated teamMembers document`);
          }
        } catch (teamMemberError) {
          console.warn('⚠️ Could not create/update teamMembers document:', teamMemberError);
          // Don't fail contact creation if teamMembers creation fails
        }
      } catch (error) {
        console.error('❌ Error setting custom claims:', error);
        // Don't fail contact creation if claims fail, but log the error
        throw new HttpsError(
          'internal',
          'Contact created but failed to set custom claims',
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    console.log(`✅ Contact created successfully: ${contactRef.id}`);

    return {
      success: true,
      contactId: contactRef.id,
      authUserId,
      message: 'Contact created successfully with Firebase Auth account'
    };

  } catch (error) {
    console.error('Error creating contact with auth:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      'Failed to create contact',
      error instanceof Error ? error.message : String(error)
    );
  }
});

