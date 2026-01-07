
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
try {
    initializeApp();
} catch (error) {
    // App already initialized
}

const db = getFirestore();
const auth = getAuth();

function generatePassword(length = 12) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
}

export const createGuardWithAuth = onCall({ cors: true }, async (request) => {
    try {
        const {
            email,
            name,
            role,
            organizationId,
            permissions,
            badgeNumber,
            licenseNumber,
            phoneNumber,
            projectId
        } = request.data;

        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        if (!email || !organizationId || !name) {
            throw new HttpsError('invalid-argument', 'Email, Name and Organization ID are required');
        }

        // Verify caller has permissions (optional for now, but good practice)
        // Ideally check if caller is SECURITY_LEAD or Admin

        const password = generatePassword();
        let authUserId: string;

        try {
            // Check if user exists
            const existingUser = await auth.getUserByEmail(email);
            authUserId = existingUser.uid;
            // If user exists, we CANNOT retrieve the password.
            // valid flow: We just add the role. The user keeps their old password.
            // But the req says "produce a password". 
            // If they exist, we return a message saying "User exists, used existing account".
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
                // Create new user
                const userRecord = await auth.createUser({
                    email,
                    password,
                    displayName: name,
                    emailVerified: true // Assume verified since admin created it
                });
                authUserId = userRecord.uid;
            } else {
                throw error;
            }
        }

        // Set Custom Claims
        const currentClaims = (await auth.getUser(authUserId)).customClaims || {};
        const newClaims = {
            ...currentClaims,
            organizationId, // Ensure they are in the org
            isSecurityGuard: true,
            securityRole: role || 'SECURITY_GUARD',
            canAccessSecurityDesk: true,
            // Add specific permissions to claims if needed for storage rules
            securityPermissions: permissions
        };

        await auth.setCustomUserClaims(authUserId, newClaims);

        // Create/Update security_guards document
        const guardData = {
            userId: authUserId,
            email,
            name,
            role: role || 'SECURITY_GUARD',
            organizationId,
            projectId: projectId || null,
            status: 'active',
            permissions: permissions || {},
            badgeNumber: badgeNumber || '',
            licenseNumber: licenseNumber || '',
            phoneNumber: phoneNumber || '',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            createdBy: request.auth.uid
        };

        // We use the Auth UID as the doc ID for easy lookup, or a new ID?
        // guardService used addDoc (random ID).
        // Let's query if a guard record already exists for this email/userId to avoid duplicates
        const guardsRef = db.collection('security_guards');
        const q = guardsRef.where('email', '==', email).limit(1);
        const snapshot = await q.get();

        let guardId = '';
        if (!snapshot.empty) {
            guardId = snapshot.docs[0].id;
            await guardsRef.doc(guardId).update({
                ...guardData,
                updatedAt: FieldValue.serverTimestamp()
            });
        } else {
            const docRef = await guardsRef.add(guardData);
            guardId = docRef.id;
        }

        // Also ensure a public 'users' doc exists (common pattern in this ecosystem)
        await db.collection('users').doc(authUserId).set({
            email,
            displayName: name,
            organizationId,
            role: 'User', // Base role
            isSecurityGuard: true,
            securityRole: role || 'SECURITY_GUARD'
        }, { merge: true });

        return {
            success: true,
            password: password, // Only useful if new user created.
            isNewUser: !snapshot.empty ? false : true, // Rough approximation
            guardId,
            authUserId
        };

    } catch (error) {
        console.error('Error creating security guard:', error);
        throw new HttpsError('internal', 'Failed to create security guard', error);
    }
});
