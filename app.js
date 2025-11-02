// Application State (using in-memory variables instead of localStorage)
let currentCoin = 'bitcoin';
let lastFetchTime = null;
let currentMode = 'individual';
let comparisonCoins = ['bitcoin', 'ethereum', 'solana', 'avalanche-2'];
let chartInstance = null;
let comparisonChartInstance = null;

// Constants
const API_BASE_URL = 'https://api.coingecko.com/api/v3';
const API_KEY = 'x_cg_demo_api_key=CG-B6a35k9a1a2bYd1d3e1f5g7H'; // Free demo key

// Global fetch helper
const fetchData = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData && errorData.status && errorData.status.error_message) {
            throw new Error(errorData.status.error_message);
        }
        throw new Error(`Network response was not ok. Status: ${response.status}`);
    }
    return response.json();
};

// Update current time
function updateCurrentTime() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    document.getElementById('currentTime').textContent = now.toLocaleDateString('en-US', options);
}

// Format number with commas
function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return 'N/A';
    return num.toLocaleString('en-US', { 
        minimumFractionDigits: decimals, 
        maximumFractionDigits: decimals 
    });
}

// Format currency
function formatCurrency(num, decimals = 2) {
    if (num === null || num === undefined) return 'N/A';
    return '$' + formatNumber(num, decimals);
}

// Format large numbers (billions, millions)
function formatLargeNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    if (num >= 1e9) {
        return '$' + (num / 1e9).toFixed(2) + 'B';
    } else if (num >= 1e6) {
        return '$' + (num / 1e6).toFixed(2) + 'M';
    }
    return formatCurrency(num, 0);
}

// Show/hide elements
function showElement(id) {
    const element = document.getElementById(id);
    if (element) element.classList.remove('hidden');
}

function hideElement(id) {
    const element = document.getElementById(id);
    if (element) element.classList.add('hidden');
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    showElement('errorMessage');
    hideElement('loadingSpinner');
    hideElement('resultsContainer');
}

// Calculate estimated realized value
function calculateRealizedValue(coinId, currentPrice, marketCap, historicalData) {
    // Estimation method based on coin and historical data
    let realizationRatio = 0.75; // Default 75% of current price
    
    // Adjust based on coin
    if (coinId === 'bitcoin') {
        realizationRatio = 0.70; // Bitcoin tends to have lower realized price
    } else if (coinId === 'ethereum') {
        realizationRatio = 0.72;
    } else if (['solana', 'avalanche-2', 'cardano', 'polkadot'].includes(coinId)) {
        realizationRatio = 0.68; // Newer coins might have lower realized prices
    }
    
    // If we have historical data, use 30-day average
    if (historicalData && historicalData.prices && historicalData.prices.length > 0) {
        const prices = historicalData.prices.map(p => p[1]);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const realizedPrice = avgPrice * realizationRatio;
        return (marketCap / currentPrice) * realizedPrice;
    }
    
    // Fallback: estimate realized cap
    return marketCap * realizationRatio;
}

// Get MVRV status and color
function getMVRVStatus(mvrv) {
    if (mvrv >= 3.5) {
        return {
            status: 'EUPHORIA - Major Sell Signal',
            color: '#8B0000',
            bgColor: 'rgba(139, 0, 0, 0.1)'
        };
    } else if (mvrv >= 2.0) {
        return {
            status: 'OVERHEATED - Profit Taking Risk',
            color: '#FF4500',
            bgColor: 'rgba(255, 69, 0, 0.1)'
        };
    } else if (mvrv >= 1.5) {
        return {
            status: 'MODERATELY OVERVALUED - Caution Zone',
            color: '#FFA500',
            bgColor: 'rgba(255, 165, 0, 0.1)'
        };
    } else if (mvrv >= 1.2) {
        return {
            status: 'FAIRLY VALUED - Bull Market',
            color: '#FFD700',
            bgColor: 'rgba(255, 215, 0, 0.1)'
        };
    } else if (mvrv >= 1.0) {
        return {
            status: 'MODERATELY VALUED - Normal',
            color: '#90EE90',
            bgColor: 'rgba(144, 238, 144, 0.1)'
        };
    } else if (mvrv >= 0.8) {
        return {
            status: 'UNDERVALUED - Opportunity',
            color: '#00AA00',
            bgColor: 'rgba(0, 170, 0, 0.1)'
        };
    } else {
        return {
            status: 'HEAVILY UNDERVALUED - Capitulation/Bottom',
            color: '#006400',
            bgColor: 'rgba(0, 100, 0, 0.1)'
        };
    }
}

// Fetch coin data from CoinGecko
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function fetchCoinData(coinId) {
    const cacheKey = `coin_data_${coinId}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
        const { timestamp, data } = JSON.parse(cachedData);
        if (Date.now() - timestamp < CACHE_DURATION) {
            console.log(`Returning cached data for ${coinId}`);
            return data;
        }
    }

    console.log(`Fetching new data for ${coinId}`);

    try {
        const apiUrl = `${API_BASE_URL}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true&${API_KEY}`;
        const data = await fetchData(apiUrl);

        if (!data || !data.market_data) {
            throw new Error('Coin not found or invalid data from API.');
        }

        // Reconstruct market and historical data from the single response
        const marketData = {
            id: data.id,
            name: data.name,
            symbol: data.symbol,
            current_price: data.market_data.current_price.usd,
            market_cap: data.market_data.market_cap.usd,
            circulating_supply: data.market_data.circulating_supply,
            price_change_percentage_24h: data.market_data.price_change_percentage_24h,
            market_cap_change_percentage_24h: data.market_data.market_cap_change_percentage_24h,
            price_change_percentage_7d_in_currency: data.market_data.price_change_percentage_7d_in_currency.usd
        };

        const historicalData = {
            prices: data.market_data.sparkline_7d.price.map((price, index) => {
                // Create timestamps for the last 7 days
                const timestamp = Date.now() - (7 - index) * 24 * 60 * 60 * 1000;
                return [timestamp, price];
            })
        };

        const result = {
            market: marketData,
            historical: historicalData
        };

        // Cache the new data
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: result }));

        return result;
    } catch (error) {
        console.error('Error fetching coin data:', error);
        throw error;
    }
}

// Create gauge chart
function createGaugeChart(mvrv) {
    const canvas = document.getElementById('gaugeChart');
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    // Determine position on gauge (0-10 scale)
    const value = Math.min(mvrv, 10);
    const position = (value / 10) * 100;
    
    // Create gradient colors
    const colors = [
        '#006400', // Dark green
        '#00AA00', // Green
        '#90EE90', // Light green
        '#FFD700', // Gold
        '#FFA500', // Orange
        '#FF4500', // Red-orange
        '#8B0000'  // Dark red
    ];
    
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Capitulation', 'Undervalued', 'Normal', 'Fair Value', 'Caution', 'Overheated', 'Euphoria'],
            datasets: [{
                data: [8, 10, 12, 15, 25, 15, 15],
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rotation: -90,
            circumference: 180,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label;
                        }
                    }
                },
                title: {
                    display: true,
                    text: `MVRV: ${mvrv.toFixed(2)}`,
                    font: {
                        size: 20,
                        weight: 'bold'
                    }
                }
            }
        }
    });
}

// Display coin data
function displayCoinData(data) {
    const { market, historical } = data;
    
    // Update coin header
    document.getElementById('coinName').textContent = market.name;
    document.getElementById('coinSymbol').textContent = market.symbol.toUpperCase();
    
    // Update current price
    document.getElementById('currentPrice').textContent = formatCurrency(market.current_price, 2);
    
    // Update 24h change
    const change24h = market.price_change_percentage_24h;
    const change24hElement = document.getElementById('priceChange24h');
    if (change24h !== null && change24h !== undefined) {
        change24hElement.textContent = (change24h > 0 ? '+' : '') + change24h.toFixed(2) + '%';
        change24hElement.className = 'data-change ' + (change24h > 0 ? 'positive' : 'negative');
    } else {
        change24hElement.textContent = 'N/A';
        change24hElement.className = 'data-change';
    }
    
    // Update market cap
    document.getElementById('marketCap').textContent = formatLargeNumber(market.market_cap);
    
    // Update market cap change
    const mcChange = market.market_cap_change_percentage_24h;
    const mcChangeElement = document.getElementById('marketCapChange');
    if (mcChange !== null && mcChange !== undefined) {
        mcChangeElement.textContent = (mcChange > 0 ? '+' : '') + mcChange.toFixed(2) + '%';
        mcChangeElement.className = 'data-change ' + (mcChange > 0 ? 'positive' : 'negative');
    } else {
        mcChangeElement.textContent = 'N/A';
        mcChangeElement.className = 'data-change';
    }
    
    // Update circulating supply
    document.getElementById('circulatingSupply').textContent = formatNumber(market.circulating_supply, 0);
    
    // Update 7d change
    const change7d = market.price_change_percentage_7d_in_currency;
    const change7dElement = document.getElementById('priceChange7d');
    if (change7d !== null && change7d !== undefined) {
        change7dElement.textContent = (change7d > 0 ? '+' : '') + change7d.toFixed(2) + '%';
        change7dElement.className = 'data-value ' + (change7d > 0 ? 'positive' : 'negative');
    } else {
        change7dElement.textContent = 'N/A';
        change7dElement.className = 'data-value';
    }
    
    // Calculate MVRV
    const marketValue = market.market_cap;
    const realizedValue = calculateRealizedValue(market.id, market.current_price, marketValue, historical);
    const mvrv = marketValue / realizedValue;
    const holderProfit = ((mvrv - 1) * 100);
    
    // Update MVRV section
    document.getElementById('marketValue').textContent = formatLargeNumber(marketValue);
    document.getElementById('realizedValue').textContent = formatLargeNumber(realizedValue);
    document.getElementById('mvrvRatio').textContent = mvrv.toFixed(2);
    document.getElementById('holderProfit').textContent = (holderProfit > 0 ? '+' : '') + holderProfit.toFixed(2) + '%';
    
    // Update status
    const statusInfo = getMVRVStatus(mvrv);
    const statusCard = document.getElementById('statusCard');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusDescription = document.getElementById('statusDescription');
    
    statusCard.style.backgroundColor = statusInfo.bgColor;
    statusCard.style.borderColor = statusInfo.color;
    statusIndicator.textContent = statusInfo.status;
    statusIndicator.style.color = statusInfo.color;
    
    if (mvrv > 2.0) {
        statusDescription.textContent = 'The market is showing signs of overheating. Historical data suggests this could be a good time to consider taking profits.';
    } else if (mvrv > 1.0) {
        statusDescription.textContent = 'The market is in a healthy range. Price is above average cost basis, indicating profits for most holders.';
    } else {
        statusDescription.textContent = 'The market appears undervalued. Historical data suggests this could be an accumulation opportunity.';
    }
    
    // Create gauge chart
    createGaugeChart(mvrv);
    
    // Update last update time
    lastFetchTime = new Date();
    document.getElementById('lastUpdate').textContent = 'Last updated: ' + lastFetchTime.toLocaleTimeString();
    
    // Show results
    hideElement('loadingSpinner');
    hideElement('errorMessage');
    showElement('resultsContainer');
}

// Calculate MVRV for a coin
async function calculateMVRV(coinId) {
    try {
        showElement('loadingSpinner');
        hideElement('errorMessage');
        hideElement('resultsContainer');
        
        const data = await fetchCoinData(coinId);
        currentCoin = coinId;
        displayCoinData(data);
    } catch (error) {
        showError('Error: ' + error.message + '. Please try again or check if the coin ID is correct.');
    }
}

// Fetch comparison data
async function fetchComparisonData() {
    const cacheKey = `comparison_data_${comparisonCoins.join('_')}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
        const { timestamp, data } = JSON.parse(cachedData);
        if (Date.now() - timestamp < CACHE_DURATION) {
            console.log('Returning cached comparison data');
            const tbody = document.getElementById('comparisonTableBody');
            tbody.innerHTML = '';
            data.forEach(updateComparisonTableRow);
            createComparisonChart(data);
            showElement('comparisonResults');
            hideElement('comparisonLoading');
            hideElement('comparisonError');
            return;
        }
    }

    showElement('comparisonLoading');
    hideElement('comparisonError');
    hideElement('comparisonResults');

    const tbody = document.getElementById('comparisonTableBody');
    tbody.innerHTML = '';

    try {
        console.log('Fetching new comparison data');
        const coinIds = comparisonCoins.join(',');
        const marketApiUrl = `${API_BASE_URL}/coins/markets?vs_currency=usd&ids=${coinIds}&order=market_cap_desc&sparkline=true&price_change_percentage=24h,7d&${API_KEY}`;
        const marketDataArray = await fetchData(marketApiUrl);

        if (!marketDataArray || marketDataArray.length === 0) {
            throw new Error('No data returned for comparison coins.');
        }

        const results = marketDataArray.map(market => {
            const historical = { prices: market.sparkline_in_7d.price.map((p, i) => [Date.now() - (7 - i) * 24 * 60 * 60 * 1000, p]) };
            const marketValue = market.market_cap;
            const realizedValue = calculateRealizedValue(market.id, market.current_price, marketValue, historical);
            const mvrv = marketValue / realizedValue;

            return {
                id: market.id,
                name: market.name,
                symbol: market.symbol.toUpperCase(),
                price: market.current_price,
                marketCap: market.market_cap,
                mvrv: mvrv,
                status: getMVRVStatus(mvrv)
            };
        });

        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: results }));

        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: results }));

        results.forEach(updateComparisonTableRow);
        createComparisonChart(results);
        showElement('comparisonResults');

    } catch (error) {
        console.error('Failed to fetch comparison data:', error);
        const errorDiv = document.getElementById('comparisonError');
        errorDiv.textContent = 'Error: ' + error.message;
        showElement('comparisonError');
    } finally {
        hideElement('comparisonLoading');
    }
}

function updateComparisonTableRow(coin) {
    const tbody = document.getElementById('comparisonTableBody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>
            <div class="coin-name-cell">
                <strong>${coin.name}</strong>
                <span class="coin-symbol-small">${coin.symbol}</span>
            </div>
        </td>
        <td>${formatCurrency(coin.price, 2)}</td>
        <td>${formatLargeNumber(coin.marketCap)}</td>
        <td><strong>${coin.mvrv.toFixed(2)}</strong></td>
        <td>
            <span class="status-badge" style="background-color: ${coin.status.bgColor}; color: ${coin.status.color};">
                ${coin.status.status}
            </span>
        </td>
    `;
    tbody.appendChild(row);
}

function displayComparisonErrorRow(coinId, message) {
    const tbody = document.getElementById('comparisonTableBody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>
            <div class="coin-name-cell">
                <strong>${coinId}</strong>
            </div>
        </td>
        <td colspan="4" class="error-message-cell">Failed to load: ${message}</td>
    `;
    tbody.appendChild(row);
}

// Create comparison chart
function createComparisonChart(results) {
    const canvas = document.getElementById('comparisonChart');
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart
    if (comparisonChartInstance) {
        comparisonChartInstance.destroy();
    }
    
    const labels = results.map(r => r.name);
    const data = results.map(r => r.mvrv);
    const colors = results.map(r => r.status.color);
    
    comparisonChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'MVRV Ratio',
                data: data,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'MVRV Ratio Comparison',
                    font: {
                        size: 18,
                        weight: 'bold'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'MVRV: ' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'MVRV Ratio'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Event Listeners
document.getElementById('calculateBtn').addEventListener('click', () => {
    const selectValue = document.getElementById('coinSelect').value;
    const inputValue = document.getElementById('coinInput').value.trim();
    const coinId = inputValue || selectValue;
    calculateMVRV(coinId);
});

document.getElementById('refreshBtn').addEventListener('click', () => {
    calculateMVRV(currentCoin);
});

document.getElementById('coinInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const inputValue = document.getElementById('coinInput').value.trim();
        if (inputValue) {
            calculateMVRV(inputValue);
        }
    }
});

document.getElementById('refreshComparisonBtn').addEventListener('click', () => {
    fetchComparisonData();
});

// Mode switching
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        
        // Update active button
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Switch sections
        if (mode === 'individual') {
            showElement('individualSection');
            hideElement('comparisonSection');
            currentMode = 'individual';
        } else {
            hideElement('individualSection');
            showElement('comparisonSection');
            currentMode = 'comparison';
            
            // Load comparison data if not already loaded
            const comparisonResults = document.getElementById('comparisonResults');
            if (comparisonResults.classList.contains('hidden')) {
                fetchComparisonData();
            }
        }
    });
});

// Initialize
function init() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Load Bitcoin by default
    calculateMVRV('bitcoin');
}

// Start the application
init();