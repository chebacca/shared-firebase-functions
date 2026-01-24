import axios from 'axios';

async function testReportGeneration() {
    const url = 'https://us-central1-backbone-logic.cloudfunctions.net/executeAIAction';

    const payload = {
        data: {
            actionType: 'generate_report',
            actionData: {
                projectId: 'big-tree-la-event-global',
                reportType: 'executive',
                organizationId: 'big-tree-productions',
                options: {
                    includeCharts: true,
                    useOllama: true
                }
            },
            organizationId: 'big-tree-productions'
        }
    };

    console.log('🚀 Sending direct request to executeAIAction...');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                // Mocking Firebase Auth for Emulator
                'Authorization': 'Bearer owner'
            }
        });

        console.log('✅ Response received:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        console.error('❌ Request failed:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

testReportGeneration();
