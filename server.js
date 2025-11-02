const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const port = process.env.PORT || 3000;

// --- Configuration ---
const API_KEY = 'CG-SYs6geL25Bic3Haoyp6Me9yf'; // Your private API key
const API_BASE_URL = 'https://api.coingecko.com/api/v3';
const CACHE_DURATION_SECONDS = 10 * 60; // 10 minutes

// --- Setup ---
const apiCache = new NodeCache({ stdTTL: CACHE_DURATION_SECONDS });
app.use(cors());

// --- Proxy Endpoint ---
app.get('/proxy', async (req, res) => {
    const { endpoint } = req.query;

    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint query parameter is required' });
    }

    const cacheKey = `coingecko_${endpoint}`;
    const cachedData = apiCache.get(cacheKey);

    if (cachedData) {
        console.log(`[Cache HIT] for ${endpoint}`);
        return res.json(cachedData);
    }

    console.log(`[Cache MISS] for ${endpoint}. Fetching from API...`);

    try {
        const apiUrl = `${API_BASE_URL}${endpoint}`;
        const response = await axios.get(apiUrl, {
            headers: {
                'x-cg-demo-api-key': API_KEY.split('=')[1] // Send only the key value
            }
        });

        // Save to cache
        apiCache.set(cacheKey, response.data);

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching from CoinGecko API:', error.message);
        const status = error.response ? error.response.status : 500;
        const message = error.response ? error.response.data : 'Internal Server Error';
        res.status(status).json({ error: message });
    }
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`CoinGecko Proxy Server listening on port ${port}`);
});

