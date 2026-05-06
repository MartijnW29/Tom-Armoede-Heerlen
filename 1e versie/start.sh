#!/bin/bash
# Quick Start Script for Opportunity Atlas Heerlen

echo "🚀 Opportunity Atlas — Heerlen"
echo "================================="
echo ""
echo "Starting local server..."
echo ""

# Try http-server first
if command -v npx &> /dev/null; then
    echo "Using npx http-server (Node.js)..."
    npx http-server . --port 8080 --corsUncached --cors -o
elif command -v python3 &> /dev/null; then
    echo "Using Python 3 http.server..."
    python3 -m http.server 8080
elif command -v python &> /dev/null; then
    echo "Using Python http.server..."
    python -m http.server 8000
else
    echo "Error: Neither Node.js nor Python found!"
    echo "Please install Node.js or Python to start the server."
    exit 1
fi
