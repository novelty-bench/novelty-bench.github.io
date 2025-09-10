#!/bin/bash
# Build script for NoveltyBench website
# Regenerates the aggregated leaderboard data for optimal performance

echo "🔥 Building NoveltyBench website..."

# Generate the aggregated leaderboard data
echo "📊 Generating leaderboard data..."
python3 generate_leaderboard_data.py

if [ $? -eq 0 ]; then
    echo "✅ Leaderboard data generated successfully"
    echo "🚀 Website is ready for deployment"
    
    # Show file sizes for optimization awareness
    echo ""
    echo "📈 File sizes:"
    echo "  leaderboard_data.json: $(du -h leaderboard_data.json | cut -f1)"
    echo "  js/leaderboard.js: $(du -h js/leaderboard.js | cut -f1)"
    
    # Count number of models
    MODEL_COUNT=$(python3 -c "import json; data=json.load(open('leaderboard_data.json')); print(len(data['models']))")
    echo "  📊 Models in leaderboard: $MODEL_COUNT"
    
else
    echo "❌ Failed to generate leaderboard data"
    exit 1
fi