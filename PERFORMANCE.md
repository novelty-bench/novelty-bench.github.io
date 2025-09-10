# Performance Optimizations

## Leaderboard Loading Performance

### Problem
The original implementation made **48 individual HTTP requests** to load summary.json files, causing 5-10 second loading times.

### Solution
Implemented a **pre-computed aggregated data approach**:

1. **Single Data File**: `leaderboard_data.json` (8KB) contains all model scores
2. **Build-Time Generation**: `generate_leaderboard_data.py` scans eval directories 
3. **Smart Caching**: 5-minute browser cache + in-memory cache
4. **Optimized Loading**: Single HTTP request instead of 48

### Performance Results
- **Before**: 48 HTTP requests, 5-10 seconds loading time
- **After**: 1 HTTP request, ~100ms loading time
- **Improvement**: ~50x faster initial load, instant subsequent loads

### How to Update

#### Automatic (Recommended)
The leaderboard data updates automatically via:

1. **Pre-commit Hook**: Regenerates data when eval files change
   ```bash
   pip install pre-commit
   pre-commit install
   ```

2. **GitHub Action**: Updates on push to main branch
   - Triggers when `eval/**/*.json` files change
   - Automatically commits updated `leaderboard_data.json`

#### Manual
When new evaluation data is added:
```bash
./build.sh
# or
python3 generate_leaderboard_data.py
```

This regenerates `leaderboard_data.json` with the latest scores using the weighted formula:
```
(curated_score * 100 + wildchat_score * 1000) / 1100
```

### File Structure
```
eval/MM-DD-YYYY/          # Evaluation directories
├── curated/
│   └── family/model/summary.json
└── wildchat/
    └── family/model/summary.json

leaderboard_data.json     # Aggregated scores (generated)
js/leaderboard.js         # Fast loading implementation
generate_leaderboard_data.py  # Build script
```

### Caching Strategy
- **Browser Cache**: 5 minutes for HTTP responses
- **Memory Cache**: 5 minutes for parsed data
- **Force Cache**: Aggressive browser caching headers
- **Build Time**: Data pre-computed at build time

This ensures blazing fast performance while maintaining accuracy and freshness.