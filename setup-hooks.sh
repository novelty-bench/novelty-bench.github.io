#!/bin/bash
# Setup script for NoveltyBench development environment

echo "🔧 Setting up NoveltyBench development environment..."

# Check if pre-commit is installed
if ! command -v pre-commit &> /dev/null; then
    echo "📦 Installing pre-commit..."
    pip install pre-commit
else
    echo "✅ pre-commit already installed"
fi

# Install pre-commit hooks
echo "🪝 Installing pre-commit hooks..."
pre-commit install

if [ $? -eq 0 ]; then
    echo "✅ Pre-commit hooks installed successfully"
    echo ""
    echo "🎉 Setup complete!"
    echo ""
    echo "📋 What happens now:"
    echo "  • When you commit changes to eval/**/*.json files"
    echo "  • Pre-commit hook will automatically regenerate leaderboard_data.json"
    echo "  • GitHub Action will also update the leaderboard on push to main"
    echo ""
    echo "💡 To manually regenerate leaderboard data:"
    echo "  ./build.sh"
    echo ""
    echo "🔍 To test hooks without committing:"
    echo "  pre-commit run --all-files"
else
    echo "❌ Failed to install pre-commit hooks"
    exit 1
fi