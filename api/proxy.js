// --- Debugging Serverless Function ---
module.exports = (req, res) => {
    // Set CORS headers to allow requests from any origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle pre-flight CORS requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Send a simple, successful JSON response for debugging purposes
    res.status(200).json({
        message: "Proxy is alive!",
        query: req.query
    });
};
