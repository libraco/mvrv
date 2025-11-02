const axios = require('axios');
const NodeCache = require('node-cache');

// --- Configuration ---
// IMPORTANT: The API key is now read from an environment variable for security.
const API_KEY = process.env.COIN_GECKO_API_KEY;
const API_BASE_URL = 'https://api.coingecko.com/api/v3';
const CACHE_DURATION_SECONDS = 10 * 60; // 10 minutes

// --- Cache Setup ---
// Initialize cache outside the handler to persist across invocations.
const apiCache = new NodeCache({ stdTTL: CACHE_DURATION_SECONDS });

// --- Serverless Function Handler ---
module.exports = async (req, res) => {
    // Allow requests from any origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle pre-flight requests for CORS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { endpoint } = req.query;

    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint query parameter is required' });
    }

    if (!API_KEY) {
        return res.status(500).json({ error: 'API key is not configured on the server.' });
    }

    const cacheKey = `coingecko_${endpoint}`;
    const cachedData = apiCache.get(cacheKey);

    if (cachedData) {
        console.log(`[Cache HIT] for ${endpoint}`);
        return res.status(200).json(cachedData);
    }

    console.log(`[Cache MISS] for ${endpoint}. Fetching from API...`);

    try {
        const apiUrl = `${API_BASE_URL}${endpoint}`;
        const response = await axios.get(apiUrl, {
            headers: {
                'x-cg-demo-api-key': API_KEY
            }
        });

        apiCache.set(cacheKey, response.data);
        return res.status(200).json(response.data);

    } catch (error) {
        console.error('Error fetching from CoinGecko API:', error.message);
        const status = error.response ? error.response.status : 500;
        const message = error.response ? error.response.data : 'Internal Server Error';
        return res.status(status).json({ error: message });
    }
};
