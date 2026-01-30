
const axios = require('axios');

async function checkUrl() {
    const url = 'https://us-central1-backbone-logic.cloudfunctions.net/updateOAuthAccountInfo';
    console.log(`📡 Pinging ${url}...`);
    try {
        const response = await axios.post(url, { data: {} }, { timeout: 10000 });
        console.log('✅ Response:', response.data);
    } catch (error) {
        if (error.response) {
            console.log(`📡 Function responded with status ${error.response.status}`);
            console.log('📄 Body:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('❌ Error:', error.message);
        }
    }
}

checkUrl();
