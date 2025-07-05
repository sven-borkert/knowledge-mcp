#!/bin/bash

# Test script for Knowledge MCP Server

echo "Testing Knowledge MCP Server..."
echo "=============================="

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Run ./setup.sh first."
    exit 1
fi

# Test direct Python execution
echo ""
echo "1. Testing direct Python execution..."
cd ./src && timeout 2 ../venv/bin/python -m knowledge_mcp.server
if [ $? -eq 124 ]; then
    echo "✅ Server started successfully (timed out as expected)"
else
    echo "❌ Server failed to start"
    exit 1
fi

# Test with MCP Inspector
echo ""
echo "2. Testing with MCP Inspector..."
echo "Run this command to test interactively:"
echo "npx @modelcontextprotocol/inspector sh -c 'cd ./src && ../venv/bin/python -m knowledge_mcp.server'"

echo ""
echo "✨ Tests complete!"