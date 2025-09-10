#!/usr/bin/env python3
"""
Generate aggregated leaderboard data for fast loading.
This script scans all evaluation directories and creates a single JSON file
with all model scores, eliminating the need for multiple HTTP requests.
"""

import json
import os
from pathlib import Path
from datetime import datetime

def parse_eval_date(eval_date_str):
    """Convert MM-DD-YYYY to datetime for sorting."""
    month, day, year = eval_date_str.split('-')
    return datetime(int(year), int(month), int(day))

def is_open_source(family, model):
    """Determine if a model is open source."""
    open_source_families = ['google', 'meta-llama']
    closed_source_families = ['anthropic', 'openai', 'gemini', 'cohere']
    
    if family in open_source_families:
        return True
    if family in closed_source_families:
        return False
    
    # Default to closed source for unknown families
    return False

def format_family_name(family):
    """Convert family names to display format."""
    family_map = {
        'anthropic': 'Anthropic',
        'cohere': 'Cohere', 
        'gemini': 'Gemini',
        'google': 'Google',
        'meta-llama': 'Meta',
        'openai': 'OpenAI'
    }
    return family_map.get(family, family)

def load_summary(file_path):
    """Load and parse a summary.json file."""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return None

def generate_leaderboard_data():
    """Generate the aggregated leaderboard data."""
    eval_dir = Path('eval')
    if not eval_dir.exists():
        print("Error: eval directory not found")
        return

    # Get all eval dates and sort them (newest first)
    eval_dates = []
    for item in eval_dir.iterdir():
        if item.is_dir() and item.name != '.DS_Store':
            eval_dates.append(item.name)
    
    eval_dates.sort(key=parse_eval_date, reverse=True)
    print(f"Found eval dates: {eval_dates}")

    # Collect all model data
    all_models = []
    
    for eval_date in eval_dates:
        print(f"Processing eval date: {eval_date}")
        eval_path = eval_dir / eval_date
        
        # Process both curated and wildchat datasets
        for dataset in ['curated', 'wildchat']:
            dataset_path = eval_path / dataset
            if not dataset_path.exists():
                continue
                
            # Process each family
            for family_path in dataset_path.iterdir():
                if not family_path.is_dir() or family_path.name in ['.DS_Store', 'index.json']:
                    continue
                    
                family = family_path.name
                
                # Process each model
                for model_path in family_path.iterdir():
                    if not model_path.is_dir() or model_path.name in ['.DS_Store', 'index.json']:
                        continue
                        
                    model = model_path.name
                    summary_file = model_path / 'summary.json'
                    
                    if summary_file.exists():
                        summary = load_summary(summary_file)
                        if summary:
                            all_models.append({
                                'eval_date': eval_date,
                                'dataset': dataset,
                                'family': family,
                                'variant': model,
                                'mean_distinct': summary.get('mean_distinct'),
                                'mean_utility': summary.get('mean_utility')
                            })

    print(f"Loaded {len(all_models)} model entries")

    # Group models by family/variant to combine curated and wildchat scores
    model_groups = {}
    
    for model in all_models:
        key = f"{model['family']}::{model['variant']}"
        if key not in model_groups:
            model_groups[key] = {
                'family': model['family'],
                'variant': model['variant'],
                'eval_date': model['eval_date'],
                'datasets': {}
            }
        
        # Store the first (latest) eval date where this model appears
        if model['eval_date'] not in model_groups[key]['datasets']:
            model_groups[key]['datasets'][model['dataset']] = {
                'distinct': model['mean_distinct'],
                'utility': model['mean_utility']
            }

    # Calculate weighted averages and create final leaderboard
    leaderboard_data = []
    
    for key, group in model_groups.items():
        curated = group['datasets'].get('curated')
        wildchat = group['datasets'].get('wildchat')
        
        # Only include models that have both curated and wildchat data
        if curated and wildchat:
            # Apply the weighted formula: (curated * 100 + wildchat * 1000) / 1100
            weighted_distinct = (curated['distinct'] * 100 + wildchat['distinct'] * 1000) / 1100
            weighted_utility = (curated['utility'] * 100 + wildchat['utility'] * 1000) / 1100
            
            # Format eval date for display (MM-DD-YYYY -> YYYY-MM-DD)
            month, day, year = group['eval_date'].split('-')
            formatted_date = f"{year}-{month}-{day}"
            
            leaderboard_data.append({
                'family': format_family_name(group['family']),
                'variant': group['variant'],
                'open': is_open_source(group['family'], group['variant']),
                'distinct': round(weighted_distinct, 2),
                'utility': round(weighted_utility, 2),
                'date': formatted_date
            })

    # Sort by utility score (descending)
    leaderboard_data.sort(key=lambda x: x['utility'], reverse=True)
    
    print(f"Generated leaderboard with {len(leaderboard_data)} models")

    # Write the aggregated data
    output_file = 'leaderboard_data.json'
    with open(output_file, 'w') as f:
        json.dump({
            'generated_at': datetime.now().isoformat(),
            'models': leaderboard_data
        }, f, indent=2)
    
    print(f"Leaderboard data written to {output_file}")
    return leaderboard_data

if __name__ == '__main__':
    generate_leaderboard_data()