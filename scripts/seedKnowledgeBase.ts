
import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin
// Note: This script assumes GOOGLE_APPLICATION_CREDENTIALS is set 
// or it's run in an environment with credentials.
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: 'backbone-logic' // Replace with your actual project ID if needed
    });
}

const db = admin.firestore();

const SAMPLE_DOCS = [
    {
        organizationId: 'global',
        title: 'Backbone Production SOP',
        type: 'sop',
        content: `
# Standard Operating Procedure for Backbone Productions

## 1. Project Initialization
All new projects must be created in the Backbone Dashboard. 
Required fields:
- Client Name
- Budget Code
- Deadline

## 2. Media Management
All raw footage must be ingested via the "Ingest Bot" workflow.
Naming convention: DATE_CAM_REEL_CLIP.mov (e.g., 20231024_A_001_C001.mov).

## 3. Communication
Use the "Master Agent" for quick questions about schedules.
Do not email specific producers for general FAQs.
        `,
        tags: ['sop', 'production', 'ingest', 'naming']
    },
    {
        organizationId: 'global',
        title: 'Netflix Delivery Specifications v2.4',
        type: 'specs',
        content: `
# Netflix Delivery Specs

## Video Format
- Resolution: 3840x2160 (UHD) minimum
- Codec: ProRes 4444 XQ or uncompressed EXR
- Color Space: P3-D65 PQ (HDR)

## Audio
- 5.1 Surround Sound required for all Originals.
- Nearfield Mix: -24 LKFS +/- 2 dB.
- True Peak: -2 dBTP max.

## Subtitles
- Format: IMSC 1.1 (Text Profile)
- Timecode must match final video exactly.
        `,
        tags: ['netflix', 'delivery', 'specs', '4k', 'hdr']
    },
    {
        organizationId: 'global',
        title: 'Chase Sequence - Camera Angles',
        type: 'creative',
        content: `
# Chase Sequence Planning

## Scene 42: The Alleyway
- Cam A: Wide master on 24mm (Steadicam)
- Cam B: Long lens (85mm) picking off details
- Drone: Top-down view for establishing geography

## Stunt Coordination
Requires safety meeting at 08:00 AM.
Pad the walls on the north side.
        `,
        tags: ['chase', 'camera', 'scene42', 'stunt']
    }
];

async function seedKnowledgeBase() {
    console.log('🌱 Seeding Knowledge Base...');

    // Check if collection has data
    const snapshot = await db.collection('knowledge_base').limit(1).get();
    if (!snapshot.empty) {
        console.log('⚠️ Knowledge Base already has data. Skipping seed.');
        // Optional: Force overwrite logic here if needed
        return;
    }

    const batch = db.batch();

    for (const doc of SAMPLE_DOCS) {
        const ref = db.collection('knowledge_base').doc();
        batch.set(ref, {
            ...doc,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`➕ Queued: ${doc.title}`);
    }

    await batch.commit();
    console.log('✅ Knowledge Base seeding complete!');
}

seedKnowledgeBase().catch(console.error);
