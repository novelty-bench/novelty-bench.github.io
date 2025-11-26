// Fast Dynamic Leaderboard System for NoveltyBench
// Uses pre-computed aggregated data for blazing fast loading

class LeaderboardManager {
    constructor() {
        this.modelData = [];
        this.cache = new Map();
    }

    async init() {
        console.time('Leaderboard Load Time');
        await this.loadLeaderboardData();
        this.renderLeaderboard();
        console.timeEnd('Leaderboard Load Time');
    }

    async loadLeaderboardData() {
        try {
            // Check browser cache first
            const cacheKey = 'leaderboard_data';
            const cachedData = this.getCachedData(cacheKey);
            
            if (cachedData) {
                console.log('⚡ Using cached leaderboard data');
                this.modelData = cachedData;
                return;
            }

            // Single HTTP request to load all data with caching headers
            console.log('🔄 Fetching leaderboard data...');
            const response = await fetch('leaderboard_data.json', {
                cache: 'force-cache', // Use browser cache aggressively
                headers: {
                    'Cache-Control': 'max-age=300' // 5 minutes browser cache
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.modelData = data.models || [];
            
            // Cache the data with timestamp
            this.setCachedData(cacheKey, this.modelData, data.generated_at);
            
            console.log(`✅ Loaded ${this.modelData.length} models from aggregated data`);
        } catch (error) {
            console.error('❌ Error loading leaderboard data:', error);
            this.modelData = [];
        }
    }

    getCachedData(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        // Check if cache is still valid (5 minutes)
        const now = Date.now();
        const cacheAge = now - cached.timestamp;
        const maxAge = 5 * 60 * 1000; // 5 minutes
        
        if (cacheAge > maxAge) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    setCachedData(key, data, generatedAt) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now(),
            generatedAt: generatedAt
        });
    }

    renderLeaderboard() {
        const tbody = document.querySelector('.table tbody');
        if (!tbody) {
            console.error('Could not find leaderboard tbody');
            return;
        }

        // Data is already sorted by utility score in the aggregated file
        // Clear existing content
        tbody.innerHTML = '';

        // Render each model
        this.modelData.forEach(model => {
            const row = document.createElement('tr');

            const openIcon = model.open ?
                '<i class="fas fa-check" style="color: green;"></i>' :
                '<i class="fas fa-times" style="color: red;"></i>';

            // Build variant cell with optional metadata links and citation
            let variantCell = model.variant;
            if (model.metadata) {
                let citation = '';
                if (model.metadata.authors) {
                    const year = model.date ? model.date.split('-')[0] : '';
                    const hasPaper = model.metadata.paper;
                    citation = hasPaper
                        ? `<a href="${model.metadata.paper}" target="_blank" class="model-citation">(${model.metadata.authors}, ${year})</a>`
                        : `<span class="model-citation">(${model.metadata.authors}, ${year})</span>`;
                }
                let modelLink = '';
                if (model.metadata.model) {
                    modelLink = `<a href="${model.metadata.model}" target="_blank" title="Model weights" class="model-link"><i class="fas fa-cube"></i></a>`;
                }
                variantCell = `${model.variant} ${citation} ${modelLink}`;
            }

            row.innerHTML = `
                <td style="text-align: center;">${model.family}</td>
                <td>${variantCell}</td>
                <td style="text-align: center;"><span class="open-status ${model.open}">${openIcon}</span></td>
                <td>${model.distinct}</td>
                <td>${model.utility}</td>
                <td><span class="label-date">${model.date}</span></td>
            `;

            tbody.appendChild(row);
        });

        console.log(`Rendered ${this.modelData.length} models in leaderboard`);
    }
}

// Initialize the leaderboard when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    const leaderboard = new LeaderboardManager();
    await leaderboard.init();
});