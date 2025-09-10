// Dynamic Leaderboard System for NoveltyBench

class LeaderboardManager {
    constructor() {
        this.modelData = [];
        this.evalDates = [];
    }

    async init() {
        await this.loadEvalDates();
        await this.loadAllModelData();
        this.renderLeaderboard();
    }

    async loadEvalDates() {
        try {
            const response = await fetch('eval/index.json');
            this.evalDates = await response.json();
            
            // Sort eval dates in descending order (newest first) for priority
            this.evalDates.sort((a, b) => {
                const dateA = new Date(a.replace(/(\d+)-(\d+)-(\d+)/, '$3-$1-$2'));
                const dateB = new Date(b.replace(/(\d+)-(\d+)-(\d+)/, '$3-$1-$2'));
                return dateB - dateA; // Newer dates first
            });
            
            console.log('Loaded eval dates:', this.evalDates);
        } catch (error) {
            console.error('Error loading eval dates:', error);
            this.evalDates = [];
        }
    }

    async getDirectoryContents(path) {
        try {
            const response = await fetch(`${path}/index.json`);
            if (!response.ok) return [];
            return await response.json();
        } catch (error) {
            console.error(`Error fetching directory contents for ${path}:`, error);
            return [];
        }
    }

    async loadAllModelData() {
        const allModels = [];

        for (const evalDate of this.evalDates) {
            console.log(`Processing eval date: ${evalDate}`);
            
            // Get datasets for this eval date
            const datasets = await this.getDirectoryContents(`eval/${evalDate}`);
            
            for (const dataset of datasets) {
                // Get families for this dataset
                const families = await this.getDirectoryContents(`eval/${evalDate}/${dataset}`);
                
                for (const family of families) {
                    // Get models for this family
                    const models = await this.getDirectoryContents(`eval/${evalDate}/${dataset}/${family}`);
                    
                    for (const model of models) {
                        try {
                            // Check if we already have this model (prefer latest eval date)
                            const existingModel = allModels.find(m => 
                                m.family === family && m.variant === model
                            );
                            
                            if (existingModel) {
                                // Skip if we already have this model from a more recent eval
                                continue;
                            }

                            const modelData = await this.loadModelSummary(evalDate, dataset, family, model);
                            if (modelData) {
                                allModels.push({
                                    family: this.formatFamily(family),
                                    variant: model,
                                    open: this.isOpenSource(family, model),
                                    evalDate: evalDate,
                                    dataset: dataset,
                                    ...modelData
                                });
                            }
                        } catch (error) {
                            console.error(`Error loading model ${family}/${model}:`, error);
                        }
                    }
                }
            }
        }

        // Calculate weighted scores for models that have both curated and wildchat data
        this.modelData = await this.calculateWeightedScores(allModels);
        console.log('Final model data:', this.modelData);
    }

    async loadModelSummary(evalDate, dataset, family, model) {
        try {
            const response = await fetch(`eval/${evalDate}/${dataset}/${family}/${model}/summary.json`);
            if (!response.ok) return null;
            
            const summary = await response.json();
            return {
                [`${dataset}_distinct`]: summary.mean_distinct,
                [`${dataset}_utility`]: summary.mean_utility
            };
        } catch (error) {
            console.error(`Error loading summary for ${evalDate}/${dataset}/${family}/${model}:`, error);
            return null;
        }
    }

    async calculateWeightedScores(allModels) {
        // Group models by family/variant to combine curated and wildchat scores
        const modelGroups = new Map();
        
        for (const model of allModels) {
            const key = `${model.family}::${model.variant}`;
            if (!modelGroups.has(key)) {
                modelGroups.set(key, {
                    family: model.family,
                    variant: model.variant,
                    open: model.open,
                    evalDate: model.evalDate,
                    datasets: {}
                });
            }
            
            const group = modelGroups.get(key);
            group.datasets[model.dataset] = {
                distinct: model[`${model.dataset}_distinct`],
                utility: model[`${model.dataset}_utility`]
            };
        }

        // Calculate weighted averages
        const finalModels = [];
        for (const [key, group] of modelGroups) {
            const curated = group.datasets.curated;
            const wildchat = group.datasets.wildchat;
            
            // Only include models that have both curated and wildchat data
            if (curated && wildchat) {
                // Apply the weighted formula: (curated * 100 + wildchat * 1000) / 1100
                const weightedDistinct = (curated.distinct * 100 + wildchat.distinct * 1000) / 1100;
                const weightedUtility = (curated.utility * 100 + wildchat.utility * 1000) / 1100;
                
                finalModels.push({
                    family: group.family,
                    variant: group.variant,
                    open: group.open,
                    distinct: Math.round(weightedDistinct * 100) / 100, // Round to 2 decimal places
                    utility: Math.round(weightedUtility * 100) / 100,
                    evalDate: group.evalDate
                });
            }
        }

        return finalModels;
    }

    formatFamily(family) {
        // Convert family names to display format
        const familyMap = {
            'anthropic': 'Anthropic',
            'cohere': 'Cohere', 
            'gemini': 'Gemini',
            'google': 'Google',
            'meta-llama': 'Meta',
            'openai': 'OpenAI'
        };
        
        return familyMap[family] || family;
    }

    isOpenSource(family, model) {
        // Define which models are open source
        const openSourceFamilies = ['google', 'meta-llama'];
        const closedSourceFamilies = ['anthropic', 'openai', 'gemini', 'cohere'];
        
        if (openSourceFamilies.includes(family)) return true;
        if (closedSourceFamilies.includes(family)) return false;
        
        // Default to closed source for unknown families
        return false;
    }

    renderLeaderboard() {
        const tbody = document.querySelector('.table tbody');
        if (!tbody) {
            console.error('Could not find leaderboard tbody');
            return;
        }

        // Sort by utility score (descending)
        this.modelData.sort((a, b) => b.utility - a.utility);

        // Clear existing content
        tbody.innerHTML = '';

        // Render each model
        this.modelData.forEach(model => {
            const row = document.createElement('tr');
            
            const openIcon = model.open ? 
                '<i class="fas fa-check" style="color: green;"></i>' : 
                '<i class="fas fa-times" style="color: red;"></i>';
            
            row.innerHTML = `
                <td style="text-align: center;">${model.family}</td>
                <td>${model.variant}</td>
                <td style="text-align: center;"><span class="open-status ${model.open}">${openIcon}</span></td>
                <td>${model.distinct}</td>
                <td>${model.utility}</td>
                <td><span class="label-date">${this.formatEvalDate(model.evalDate)}</span></td>
            `;
            
            tbody.appendChild(row);
        });

        console.log(`Rendered ${this.modelData.length} models in leaderboard`);
    }

    formatEvalDate(evalDate) {
        // Convert MM-DD-YYYY to YYYY-MM-DD for display
        const [month, day, year] = evalDate.split('-');
        return `${year}-${month}-${day}`;
    }
}

// Initialize the leaderboard when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    const leaderboard = new LeaderboardManager();
    await leaderboard.init();
});