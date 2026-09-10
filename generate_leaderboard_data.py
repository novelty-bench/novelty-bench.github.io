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
    month, day, year = eval_date_str.split("-")
    return datetime(int(year), int(month), int(day))


def is_open_source(family, model):
    """Determine if a model is open source."""
    open_source_families = ["google", "meta-llama"]
    closed_source_families = ["anthropic", "openai", "gemini", "cohere"]

    if family in open_source_families:
        return True
    if family in closed_source_families:
        return False

    # Default to closed source for unknown families
    return False


# Methods that modify the model itself through additional training. A fine-tuned
# checkpoint carries no scaffold metadata, so it has to be named explicitly.
TRAINING_TIME_VARIANTS = {
    "CrPO-llama-3.1-8b-instruct",
}

CATEGORIES = {
    "raw": {
        "label": "Raw models",
        "blurb": "One model, sampled ten times.",
    },
    "inference-time": {
        "label": "Inference-time algorithms",
        "blurb": "A scaffold around a base model, making many calls per prompt.",
    },
    "training-time": {
        "label": "Training-time methods",
        "blurb": "A base model fine-tuned to generate more diversely.",
    },
}


def categorize(variant, metadata):
    """Assign an entry to a comparison category.

    Data-driven so new submissions classify themselves: an inference-time system
    only needs `category`, `system` or `base_model` in its metadata.json.
    """
    if metadata:
        if metadata.get("category") in CATEGORIES:
            return metadata["category"]
        # A scaffold identifies itself by declaring what it runs on top of.
        if metadata.get("system") or metadata.get("base_model"):
            return "inference-time"
    if variant in TRAINING_TIME_VARIANTS:
        return "training-time"
    return "raw"


def format_family_name(family):
    """Convert family names to display format."""
    family_map = {
        "anthropic": "Anthropic",
        "cohere": "Cohere",
        "gemini": "Gemini",
        "google": "Google",
        "meta-llama": "Meta",
        "openai": "OpenAI",
        "novamine": "Novamine AI",
    }
    return family_map.get(family, family)


def load_summary(file_path):
    """Load and parse a summary.json file."""
    try:
        with open(file_path, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return None


def load_metadata(model_path):
    """Load metadata.json if it exists."""
    metadata_file = model_path / "metadata.json"
    if metadata_file.exists():
        try:
            with open(metadata_file, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {metadata_file}: {e}")
    return None


def generate_leaderboard_data():
    """Generate the aggregated leaderboard data."""
    eval_dir = Path("eval")
    if not eval_dir.exists():
        print("Error: eval directory not found")
        return

    # Get all eval dates and sort them (newest first)
    eval_dates = []
    for item in eval_dir.iterdir():
        if item.is_dir() and item.name != ".DS_Store":
            eval_dates.append(item.name)

    eval_dates.sort(key=parse_eval_date, reverse=True)
    print(f"Found eval dates: {eval_dates}")

    # Collect all model data
    all_models = []

    for eval_date in eval_dates:
        print(f"Processing eval date: {eval_date}")
        eval_path = eval_dir / eval_date

        # Process both curated and wildchat datasets
        for dataset in ["curated", "wildchat"]:
            dataset_path = eval_path / dataset
            if not dataset_path.exists():
                continue

            # Process each family
            for family_path in dataset_path.iterdir():
                if not family_path.is_dir() or family_path.name in [
                    ".DS_Store",
                    "index.json",
                ]:
                    continue

                family = family_path.name

                # Process each model
                for model_path in family_path.iterdir():
                    if not model_path.is_dir() or model_path.name in [
                        ".DS_Store",
                        "index.json",
                    ]:
                        continue

                    model = model_path.name
                    summary_file = model_path / "summary.json"

                    if summary_file.exists():
                        summary = load_summary(summary_file)
                        metadata = load_metadata(model_path)
                        if summary:
                            entry = {
                                "eval_date": eval_date,
                                "dataset": dataset,
                                "family": family,
                                "variant": model,
                                "mean_distinct": summary.get("mean_distinct"),
                                "mean_utility": summary.get("mean_utility"),
                            }
                            if metadata:
                                entry["metadata"] = metadata
                            all_models.append(entry)

    print(f"Loaded {len(all_models)} model entries")

    # Group models by family/variant to combine curated and wildchat scores
    model_groups = {}

    for model in all_models:
        key = f"{model['family']}::{model['variant']}"
        if key not in model_groups:
            model_groups[key] = {
                "family": model["family"],
                "variant": model["variant"],
                "eval_date": model["eval_date"],
                "datasets": {},
                "metadata": model.get("metadata"),
            }

        # Store the first (latest) eval date where this model appears
        if model["dataset"] not in model_groups[key]["datasets"]:
            model_groups[key]["datasets"][model["dataset"]] = {
                "distinct": model["mean_distinct"],
                "utility": model["mean_utility"],
            }

        # Capture metadata if not already set
        if not model_groups[key]["metadata"] and model.get("metadata"):
            model_groups[key]["metadata"] = model["metadata"]

    # Calculate weighted averages and create final leaderboard
    leaderboard_data = []

    for key, group in model_groups.items():
        curated = group["datasets"].get("curated")
        wildchat = group["datasets"].get("wildchat")

        # Only include models that have both curated and wildchat data
        if curated and wildchat:
            # Apply the weighted formula: (curated * 100 + wildchat * 1000) / 1100
            weighted_distinct = (
                curated["distinct"] * 100 + wildchat["distinct"] * 1000
            ) / 1100
            weighted_utility = (
                curated["utility"] * 100 + wildchat["utility"] * 1000
            ) / 1100

            # Format eval date for display (MM-DD-YYYY -> YYYY-MM-DD)
            month, day, year = group["eval_date"].split("-")
            formatted_date = f"{year}-{month}-{day}"

            entry = {
                "family": format_family_name(group["family"]),
                "variant": group["variant"],
                "open": is_open_source(group["family"], group["variant"]),
                "category": categorize(group["variant"], group.get("metadata")),
                "distinct": round(weighted_distinct, 2),
                "utility": round(weighted_utility, 2),
                "date": formatted_date,
            }
            if group.get("metadata"):
                entry["metadata"] = group["metadata"]
            leaderboard_data.append(entry)

    # Sort by utility score (descending)
    leaderboard_data.sort(key=lambda x: x["utility"], reverse=True)

    counts = {}
    for entry in leaderboard_data:
        counts[entry["category"]] = counts.get(entry["category"], 0) + 1
    print(f"Generated leaderboard with {len(leaderboard_data)} models")
    for name, meta in CATEGORIES.items():
        print(f"  {meta['label']}: {counts.get(name, 0)}")

    # Write the aggregated data. Category order is fixed here so the page does
    # not have to know about it.
    output_file = "leaderboard_data.json"
    with open(output_file, "w") as f:
        json.dump(
            {
                "generated_at": datetime.now().isoformat(),
                "categories": [
                    {"id": name, **meta, "count": counts.get(name, 0)}
                    for name, meta in CATEGORIES.items()
                ],
                "models": leaderboard_data,
            },
            f,
            indent=2,
        )

    print(f"Leaderboard data written to {output_file}")
    return leaderboard_data


if __name__ == "__main__":
    generate_leaderboard_data()
