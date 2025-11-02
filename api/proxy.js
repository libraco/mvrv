const https = require('https');

// --- Configuration ---
const API_KEY = process.env.COIN_GECKO_API_KEY;
const API_HOST = 'api.coingecko.com';
const API_BASE_PATH = '/api/v3';
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// --- In-memory Cache (simple object) ---
const cache = new Map();

// --- Serverless Function Handler ---
module.exports = (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    // --- Cache Check ---
    const cacheKey = endpoint;
    if (cache.has(cacheKey)) {
        const { timestamp, data } = cache.get(cacheKey);
        if (Date.now() - timestamp < CACHE_DURATION_MS) {
            console.log(`[Cache HIT] for ${endpoint}`);
            return res.status(200).json(data);
        }
    }

    console.log(`[Cache MISS] for ${endpoint}. Fetching from API...`);

    // --- API Request Options ---
    const options = {
        hostname: API_HOST,
        path: `${API_BASE_PATH}${endpoint}`,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'x-cg-demo-api-key': API_KEY,
        },
    };

    // --- Make HTTPS Request ---
    const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => {
            data += chunk;
        });
        apiRes.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
                    // Cache the successful response
                    cache.set(cacheKey, { timestamp: Date.now(), data: jsonData });
                    res.status(200).json(jsonData);
                } else {
                    res.status(apiRes.statusCode).json(jsonData);
                }
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse API response' });
            }
        });
    });

    apiReq.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        res.status(500).json({ error: 'Failed to fetch from API' });
    });

    apiReq.end();
};
