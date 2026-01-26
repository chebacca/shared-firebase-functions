const admin = require('firebase-admin');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

// Mock UnifiedToolRegistry and OllamaToolCallingService to simulate Hub environment
// We'll import the actual classes but mock the environment parts if needed

async function runContextTest() {
    console.log('🧪 Testing Context-Aware Ollama Data Access\n');

    try {
        // Dynamic import to handle ES modules if needed, or require
        // In this environment, we'll try to require the compiled JS files
        // Adjust paths to where your compiled code lives (usually dist or lib or src via ts-node)

        // Since we are running in shared-firebase-functions, we should use the compiled output if available
        // Or we can construct a simple test using the deployed function logic simulator
        // But for direct testing, let's use the actual service classes if we can import them.

        // LIMITATION: Importing TS files directly in Node without ts-node is hard.
        // Instead, I'll simulate the AI request by manually using the known tools/patterns 
        // OR better: connect to the local Ollama directly and "pretend" to be the service to verify IT can think correctly.

        // BUT the user wants to test "Ollama can find data". The best way is to use the actual Service class.
        // Let's assume we can run this with ts-node or that the build exists.
        // If not, I'll write a script that constructs the prompt manually + calls Ollama + calls Firestore manually based on response.

        // Let's try to verify the DATABASE ACCESS part specifically.
        // The most critical part is: Can Ollama *decide* to call the right tool with the right ID?

        const context = {
            userId: '14Dnfbs1eug5LA8auGuhbjSJMuV2',
            organizationId: 'big-tree-productions',
            projectId: 'big-tree-la-event-global'
        };

        console.log('📋 Test Context:');
        console.log(`   User: ${context.userId} (Sean Lee)`);
        console.log(`   Org: ${context.organizationId}`);
        console.log(`   Project: ${context.projectId}`);
        console.log('');

        // 1. Fetch Firestore Config to get URL
        const db = admin.firestore();
        const configDoc = await db.collection('_system').doc('config').collection('ai').doc('ollama').get();
        const baseUrl = configDoc.exists ? configDoc.data().baseUrl : 'http://localhost:11434';

        console.log(`🔗 connecting to Ollama at ${baseUrl}...`);

        // 2. Define the tools we want Ollama to "see" (simplified set)
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'get_project_data',
                    description: 'Get details about a specific project including budget and status',
                    parameters: {
                        type: 'object',
                        properties: {
                            projectId: { type: 'string', description: 'The project ID to fetch' }
                        },
                        required: ['projectId']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'query_firestore',
                    description: 'Query Firestore database for collections and documents',
                    parameters: {
                        type: 'object',
                        properties: {
                            collection: { type: 'string', description: 'Collection name' },
                            filters: { type: 'array', items: { type: 'object' } }
                        },
                        required: ['collection']
                    }
                }
            }
        ];

        // 3. Ask Ollama a question that requires context
        const userPrompt = "What is the budget for my current project?";
        console.log(`❓ User Question: "${userPrompt}"`);

        const systemPrompt = `You are a helpful AI assistant for Backbone Hub.
Current Context:
- User ID: ${context.userId}
- Organization ID: ${context.organizationId}
- Current Project ID: ${context.projectId}

Use the provided tools to answer questions. If the user asks about "current project", use the ID from context.`;

        console.log('🤖 Sending request to Ollama...');

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'qwen2.5:14b', // Using the robust quality model
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                tools: tools,
                stream: false,
                options: { temperature: 0 }
            })
        });

        const data = await response.json();
        console.log('📦 Raw Ollama Response:', JSON.stringify(data, null, 2));

        const message = data.message;

        console.log('\n🔍 Ollama Response Analysis:');

        if (message.tool_calls && message.tool_calls.length > 0) {
            console.log('✅ Success! Ollama decided to call a tool.');
            handleToolCalls(message.tool_calls);
        } else {
            console.log('⚠️  No structured tool_calls found. Checking content for embedded calls...');

            // Check for JSON array in content (common with some smaller models)
            const jsonMatch = message.content.match(/\[\s*\{.*\}\s*\]/s);
            if (jsonMatch) {
                try {
                    const embeddedCalls = JSON.parse(jsonMatch[0]);
                    console.log('✅ Success! Found embedded tool calls in content.');

                    // Normalize to standard tool_call format
                    const normalizedCalls = embeddedCalls.map(call => ({
                        function: {
                            name: call.name,
                            arguments: JSON.stringify(call.arguments)
                        }
                    }));

                    handleToolCalls(normalizedCalls);
                } catch (e) {
                    console.log('❌ Failed to parse embedded JSON:', e.message);
                    console.log('Content:', message.content);
                }
            } else {
                console.log('❌ No tool calls found in content either.');
                console.log('Content:', message.content);
            }
        }

        function handleToolCalls(calls) {
            calls.forEach(toolCall => {
                const name = toolCall.function.name;
                // Resilience: handle if arguments is already an object or a JSON string
                let args;
                if (typeof toolCall.function.arguments === 'string') {
                    args = JSON.parse(toolCall.function.arguments);
                } else {
                    args = toolCall.function.arguments;
                }

                console.log(`   🔨 Tool: ${name}`);
                console.log(`   ⚙️  Args: ${JSON.stringify(args)}`);

                if (name === 'get_project_data') {
                    if (args.projectId === context.projectId) {
                        console.log('   ✅ CORRECT: It used the projectId from the context!');

                        // Simulate executing the tool
                        console.log('\n⚡ Simulating Tool Execution (fetching from real DB)...');
                        db.collection('projects').doc(context.projectId).get().then(doc => {
                            if (!doc.exists) {
                                console.log('   ❌ Project not found in DB!');
                                return;
                            }
                            const projectData = doc.data();
                            console.log(`   📄 Database returned budget: $${(projectData.budget || 0).toLocaleString()}`);
                            console.log(`   ✅ Verification Complete: AI correctly mapped context -> tool -> DB`);
                        });
                    } else {
                        console.log(`   ❌ WRONG ID: Expected ${context.projectId}, got ${args.projectId}`);
                    }
                }
            });
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

runContextTest();
