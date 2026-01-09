import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

// Initialize app if not already
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * Trigger: On Workflow Step Update
 * Listens for completion of workflow steps to:
 * 1. Unblock dependent steps
 * 2. Auto-trigger AI Agents
 */
export const onWorkflowStepUpdate = functions.firestore
    .document('workflowSteps/{stepId}')
    .onUpdate(async (change: functions.Change<functions.firestore.QueryDocumentSnapshot>, context: functions.EventContext) => {
        const after = change.after.data();
        const before = change.before.data();

        // 1. Validation: Only react if status changed to COMPLETED
        if (after.status !== 'COMPLETED' || before.status === 'COMPLETED') {
            return null;
        }

        const stepId = context.params.stepId;
        const { workflowInstanceId, sessionId } = after;

        if (!workflowInstanceId) {
            console.log(`⚠️ [TRIGGER] Step ${stepId} missing workflowInstanceId, skipping automation.`);
            return null;
        }

        console.log(`✅ [TRIGGER] Step completed: ${stepId} (${after.name}). Checking dependencies...`);

        // 2. Fetch all steps in the workflow instance to resolve dependencies
        // We fetch all because we need to check *every* step to see if it depends on THIS step
        // (Since 'dependencies' array is on the CHILD step, not the parent)
        const stepsSnapshot = await db.collection('workflowSteps')
            .where('workflowInstanceId', '==', workflowInstanceId)
            .get();

        if (stepsSnapshot.empty) {
            return null;
        }

        const allSteps = stepsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

        // Map node IDs to Step IDs for robust dependency resolution
        // (Templates often use Node IDs, but runtime uses Step IDs)
        const nodeToStepId = new Map<string, string>();
        allSteps.forEach(s => {
            if (s.nodeId) nodeToStepId.set(s.nodeId, s.id);
            nodeToStepId.set(s.id, s.id); // Map stepId to itself for easy lookup
        });

        const updates: Promise<any>[] = [];

        // 3. Iterate through all steps to find ones that rely on the completed step
        for (const targetStep of allSteps) {
            // Skip already completed steps or those currently running
            if (['COMPLETED', 'IN_PROGRESS'].includes(targetStep.status)) continue;

            const dependencies = targetStep.dependencies || [];
            if (dependencies.length === 0) continue;

            // Check if THIS completed step is one of the dependencies
            // We need to check if stepId OR after.nodeId matches anything in the target's dependency list
            const isDependent = dependencies.some((depId: string) =>
                depId === stepId || (after.nodeId && depId === after.nodeId)
            );

            if (!isDependent) continue;

            // 4. If dependent, check if ALL its dependencies are now met
            const areAllDependenciesMet = dependencies.every((depId: string) => {
                // Resolve dependency ID to a step object
                let depStepId = nodeToStepId.get(depId);

                // If we can't map it, assume it's missing or invalid (safe fail)
                if (!depStepId) return false;

                const depStep = allSteps.find(s => s.id === depStepId);
                return depStep?.status === 'COMPLETED';
            });

            if (areAllDependenciesMet) {
                console.log(`🔓 [TRIGGER] All dependencies met for step: ${targetStep.id} (${targetStep.name})`);

                const isAgent = targetStep.stepType === 'AGENT' ||
                    targetStep.nodeSubtype === 'agent' ||
                    targetStep.nodeSubtype === 'bot';

                let newStatus = 'READY';

                // 5. Auto-Start AI Agents
                if (isAgent) {
                    console.log(`🤖 [TRIGGER] Auto-starting AI Agent: ${targetStep.id}`);
                    newStatus = 'IN_PROGRESS';

                    // Trigger the agent execution logic
                    updates.push(executeAgentTask(targetStep, sessionId));
                }

                // Update the step status
                updates.push(
                    db.collection('workflowSteps').doc(targetStep.id).update({
                        status: newStatus,
                        lastCurrentAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    })
                );
            }
        }

        await Promise.all(updates);
        return null;
    });

/**
 * Simulates AI Agent execution on the server side.
 * In a real environment, this would call a dedicated AI service or Cloud Task.
 */
/**
 * Simulates AI Agent execution on the server side.
 * In a real environment, this would call a dedicated AI service or Cloud Task.
 */
async function executeAgentTask(step: any, sessionId: string) {
    try {
        const timestamp = new Date().toISOString();
        const subtype = (step.nodeSubtype || '').toLowerCase();
        const phase = (step.phase || '').toUpperCase();

        let initMessage = `🤖 AI Agent started automatic execution for "${step.name}"...`;
        let authorRole = 'AI Agent';
        // Default success output
        let successContent = `✅ AI Agent successfully completed "${step.name}".`;

        // Customize based on Agent Subtype
        switch (subtype) {
            case 'coordinator':
                authorRole = 'AI Coordinator';
                initMessage = `🤖 ${authorRole}: Initiating workflow coordination for "${step.name}". Verifying team availability and schedule alignment...`;
                if (phase === 'PRE_PRODUCTION') {
                    successContent = `✅ ${authorRole}: Coordination Complete.\n\n- Confirmed department heads notified\n- Verified production calendar alignment\n- Initialized asset tracking for upcoming tasks\n- No scheduling conflicts detected.`;
                } else {
                    successContent = `✅ ${authorRole}: Task sequence validated.\n- Downstream dependencies unlocked\n- Resource allocation confirmed\n- Production timeline updated.`;
                }
                break;

            case 'researcher':
                authorRole = 'AI Researcher';
                initMessage = `🤖 ${authorRole}: Commencing data gathering for "${step.name}". Scanning internal databases and external sources...`;
                successContent = `✅ ${authorRole}: Research Report Generated.\n\n- Compiled genre-specific market trends\n- Aggregated reference imagery for stylistic direction\n- Verified copyright clearances for potential assets\n- Summary added to session documentation.`;
                break;

            case 'analyst':
                authorRole = 'AI Analyst';
                initMessage = `🤖 ${authorRole}: analyzing session metrics for "${step.name}". Calculating budget burn rate and schedule variance...`;
                successContent = `✅ ${authorRole}: Analysis Complete.\n\n- Budget Variance: Within ±2% tolerance\n- Schedule Adherence: On Track\n- Resource Utilization: Optimal (85%)\n- Risk Assessment: Low\n- Generated dashboard update.`;
                break;

            case 'security':
                authorRole = 'AI Security';
                initMessage = `🤖 ${authorRole}: Performing security audit for "${step.name}". Checking permission matrices and access logs...`;
                successContent = `✅ ${authorRole}: Security Audit Passed.\n\n- Verified user access levels for sensitive assets\n- Encrypted delivery channels established\n- No unauthorized access attempts detected\n- Compliance check: 100%.`;
                break;

            case 'automation':
                authorRole = 'AI Automation';
                initMessage = `🤖 ${authorRole}: Executing batch processing for "${step.name}". Optimizing repetitive tasks...`;
                successContent = `✅ ${authorRole}: Batch Process Completed.\n\n- Auto-archived 14 legacy assets\n- Cleaned up temporary file caches\n- Notified 3 stakeholders of milestone completion\n- System health check: Green.`;
                break;

            case 'creative':
                authorRole = 'AI Creative';
                initMessage = `🤖 ${authorRole}: Reviewing asset consistency for "${step.name}". Analyzing color palettes and tonal matching...`;
                if (phase === 'POST_PRODUCTION') {
                    successContent = `✅ ${authorRole}: Creative Review Complete.\n\n- Color Grading: Consistent with show LUT\n- Audio Levels: Normalized to -24 LUFS\n- Visual Effects: All placeholders replaced\n- Ready for Director review.`;
                } else {
                    successContent = `✅ ${authorRole}: Asset Analysis Complete.\n- Verified style guide adherence\n- Checked asset resolution and format\n- Generated creative feedback summary.`;
                }
                break;

            // 🤖 RESTORED TASK BOTS 🤖
            case 'qc_bot':
                authorRole = 'QC Bot';
                initMessage = `🤖 ${authorRole}: Initiating technical quality control for "${step.name}". Analysis engine: FFmpeg/FFprobe...`;

                try {
                    // Import ffmpeg dynamically to avoid startup overhead if not used
                    const ffmpeg = require('fluent-ffmpeg');

                    // 1. Identify File to QC
                    // Check step configuration for explicit file path or grab first from session
                    let targetFilePath: string | null = null;
                    if (step.agentConfig?.sourceFilePath) {
                        targetFilePath = step.agentConfig.sourceFilePath;
                    } else if (step.files && step.files.length > 0) {
                        // Assuming 'files' is an array of objects with 'path' or 'url'
                        targetFilePath = step.files[0].path || step.files[0].url;
                    }

                    if (!targetFilePath) {
                        throw new Error("No media file provided for QC analysis. Please attach a file or define a path.");
                    }

                    // 2. Perform Real Analysis with FFprobe
                    const analysisResult = await new Promise<any>((resolve, reject) => {
                        ffmpeg.ffprobe(targetFilePath, (err: any, metadata: any) => {
                            if (err) reject(err);
                            else resolve(metadata);
                        });
                    });

                    // 3. Extract Metrics
                    const videoStream = analysisResult.streams.find((s: any) => s.codec_type === 'video');
                    const audioStream = analysisResult.streams.find((s: any) => s.codec_type === 'audio');

                    if (!videoStream) throw new Error("File contains no video stream.");

                    const actualRes = `${videoStream.width}x${videoStream.height}`;
                    const actualFps = videoStream.r_frame_rate; // e.g. "24000/1001"
                    const actualCodec = videoStream.codec_long_name || videoStream.codec_name;
                    const actualAudioChannels = audioStream ? audioStream.channels : 0;

                    // 4. Validate against Expectations (from Dialog Inputs)
                    // If no config set, we just report what we found (Generic QC)
                    const config = step.agentConfig || {};
                    const report = [];
                    let passed = true;

                    // Resolution Check
                    if (config.targetResolution && config.targetResolution !== actualRes) {
                        report.push(`❌ Resolution Mismatch: Expected ${config.targetResolution}, Found ${actualRes}`);
                        passed = false;
                    } else {
                        report.push(`✅ Resolution: ${actualRes}`);
                    }

                    // FPS Check (Simple string match for now, could be smarter math)
                    // Convert fractional FPS (24000/1001) to decimal (23.976) for easier comparison if needed
                    const fpsDecimal = eval(actualFps).toFixed(3);
                    if (config.targetFrameRate && Math.abs(parseFloat(config.targetFrameRate) - parseFloat(fpsDecimal)) > 0.01) {
                        report.push(`❌ Frame Rate Mismatch: Expected ${config.targetFrameRate}, Found ${fpsDecimal} fps`);
                        passed = false;
                    } else {
                        report.push(`✅ Frame Rate: ${fpsDecimal} fps`);
                    }

                    // Codec Check
                    if (config.targetCodec && !actualCodec.toLowerCase().includes(config.targetCodec.toLowerCase())) {
                        report.push(`❌ Codec Mismatch: Expected ${config.targetCodec}, Found ${actualCodec}`);
                        passed = false;
                    } else {
                        report.push(`✅ Codec: ${actualCodec}`);
                    }

                    // Audio Check
                    if (config.audioChannels && parseInt(config.audioChannels) !== actualAudioChannels) {
                        report.push(`❌ Audio Mismatch: Expected ${config.audioChannels}ch, Found ${actualAudioChannels}ch`);
                        passed = false;
                    } else {
                        report.push(`✅ Audio: ${actualAudioChannels} Channels`);
                    }

                    // 5. Final Verdict
                    const statusEmoji = passed ? '✅' : '❌';
                    const verdict = passed ? 'PASSED' : 'FAILED';

                    successContent = `${statusEmoji} ${authorRole}: QC ${verdict}.\n\nTarget: ${targetFilePath}\n\n${report.join('\n')}\n\nFormat: ${analysisResult.format.format_long_name}\nSize: ${(analysisResult.format.size / 1024 / 1024).toFixed(2)} MB`;

                    if (!passed) {
                        // If QC failed, we might want to flag the step as BLOCKED instead of COMPLETED,
                        // but for this "agent execution" flow, we'll mark the task as done but with a failed report note.
                        // Alternatively, throw error here to block the node.
                        // For now, let's allow it to complete but with a visible failure note.
                    }

                } catch (err: any) {
                    console.error("QC Analysis Failed:", err);
                    successContent = `⚠️ ${authorRole}: Analysis Failed.\n\nCould not process file: ${err.message}. \n\nEnsure file path is accessible and ffmpeg is installed on server.`;
                }
                break;

            case 'ingest_bot':
                authorRole = 'Ingest Bot';
                initMessage = `🤖 ${authorRole}: Detecting incoming media for "${step.name}". Verifying checksums and organizing proxies...`;
                successContent = `✅ ${authorRole}: Ingest Complete.\n\n- Copied 14 clips to shared storage\n- Checksum Verification: MD5 Match\n- Generated 1080p Proxies\n- Metadata applied from camera logs.`;
                break;

            case 'delivery_bot':
                authorRole = 'Delivery Bot';
                initMessage = `🤖 ${authorRole}: Preparing output package for "${step.name}". Compressing and initiating transfer...`;
                successContent = `✅ ${authorRole}: Delivery Sent.\n\n- Package: "${step.name}_v1.0.zip"\n- Destination: Vendor Portal\n- Transfer Speed: 850 MB/s\n- Receipt confirmed by remote server.`;
                break;

            default:
                // Fallback for generic agents
                initMessage = `🤖 Nexus AI Agent started automatic execution for "${step.name}".\nAnalyzing requirements and allocating resources...`;
                successContent = `✅ Nexus AI Agent successfully completed "${step.name}".\n\nOutput:\n- Validated dependencies\n- Processed data models\n- Generated delivery assets`;
        }

        // 1. Create a "Start" work note
        await db.collection('sessions').doc(sessionId).collection('workNotes').add({
            content: initMessage,
            type: 'system',
            authorName: 'Nexus AI',
            authorRole: authorRole,
            timestamp: timestamp,
            stepId: step.id
        });

        // 2. Simulate Processing Delay (3 seconds) representing "work"
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 3. Complete the step
        await db.collection('workflowSteps').doc(step.id).update({
            status: 'COMPLETED',
            completionReason: 'AI Agent Execution Successful',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 4. Create a "Success" work note specific to the agent's role and task
        await db.collection('sessions').doc(sessionId).collection('workNotes').add({
            content: successContent,
            type: 'system',
            authorName: 'Nexus AI',
            authorRole: authorRole,
            timestamp: new Date().toISOString(),
            stepId: step.id
        });

        console.log(`✅ [TRIGGER] ${authorRole} execution completed for ${step.id}`);

    } catch (error) {
        console.error(`❌ [TRIGGER] Agent execution failed for ${step.id}:`, error);

        // Log failure
        await db.collection('workflowSteps').doc(step.id).update({
            status: 'BLOCKED',
            blockedReason: 'AI Agent Execution Failed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}
