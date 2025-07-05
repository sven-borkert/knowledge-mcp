# Knowledge MCP Server

A Model Context Protocol (MCP) server that provides centralized knowledge management for your projects. Store, search, and maintain project-specific knowledge that persists across sessions.

## Features

- **Project-aware**: Automatically identifies projects by git remote URL
- **Structured knowledge**: Organize information in YAML-frontmatter markdown documents
- **Full-text search**: Search across all project knowledge documents
- **Chapter-based organization**: Structure documents with chapters for easy navigation
- **Main instructions**: Replace CLAUDE.md with centralized project instructions
- **Secure**: Path validation, input sanitization, and safe file operations

## Installation

### Via npx (recommended)

```bash
npx @spothlynx/knowledge-mcp
```

### Via npm (global installation)

```bash
npm install -g @spothlynx/knowledge-mcp
knowledge-mcp
```

### Requirements

- Node.js 14+
- Python 3.11+
- Git (for project identification)

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "npx",
      "args": ["-y", "@spothlynx/knowledge-mcp"]
    }
  }
}
```

### VSCode Claude Extension

Add to your VSCode settings:

```json
{
  "claude.mcpServers": {
    "knowledge": {
      "command": "npx",
      "args": ["-y", "@spothlynx/knowledge-mcp"]
    }
  }
}
```

### Other MCP Clients

```bash
# Direct execution
npx @spothlynx/knowledge-mcp

# Or if installed globally
knowledge-mcp
```

## Usage

The Knowledge MCP Server provides the following tools:

### Managing Project Instructions

- **Get project instructions**: Retrieve the main project instructions (replaces CLAUDE.md)
- **Update project instructions**: Create or update main project instructions

### Knowledge Documents

- **Create knowledge file**: Create structured documents with metadata and chapters
- **Search knowledge**: Full-text search across all project documents
- **Update chapter**: Modify specific chapters within documents
- **Delete knowledge file**: Remove knowledge documents

### Resources (Read-only)

- `knowledge://projects/{project_id}/main` - Read main project instructions
- `knowledge://projects/{project_id}/files` - List all knowledge files
- `knowledge://projects/{project_id}/chapters/{filename}` - List chapters in a document

## Storage Location

Knowledge is stored in your home directory:

```
~/.knowledge-mcp/
└── projects/
    └── {git-remote-url}/      # Project identified by git remote
        ├── main.md            # Main project instructions
        └── knowledge/         # Knowledge documents
            └── *.md           # Individual knowledge files
```

## Document Format

Knowledge documents use YAML frontmatter with markdown content:

```yaml
---
title: API Documentation
keywords: [api, rest, endpoints]
---

# Introduction
Overview of the API...

## Chapter: Authentication
How to authenticate with the API...

## Chapter: Endpoints
Available API endpoints...
```

## Development

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install in development mode with all dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Run code quality checks
python check_code_quality.py --fix
```

### Testing with MCP Inspector

```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector python -m knowledge_mcp.server

# Or if installed
npx @modelcontextprotocol/inspector knowledge-mcp
```

### Building and Distribution

```bash
# Build distribution packages
python -m build

# Upload to PyPI (when ready)
twine upload dist/*
```

## Security

- Path traversal protection
- Input sanitization for filenames
- Safe YAML parsing (no code execution)
- Atomic file writes
- Secure project identification

## Troubleshooting

### Python not found

```bash
# Ensure Python 3.11+ is installed
python3 --version

# On Windows
python --version
```

### Permission errors

```bash
# Check directory permissions
ls -la ~/.knowledge-mcp/

# Create directory if needed
mkdir -p ~/.knowledge-mcp/projects
```

### MCP connection issues

```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector knowledge-mcp

# Check server logs
knowledge-mcp 2>&1 | tee server.log
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests and code quality checks
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: [https://github.com/sven-borkert/knowledge-mcp/issues](https://github.com/sven-borkert/knowledge-mcp/issues)
- MCP Documentation: [https://modelcontextprotocol.io](https://modelcontextprotocol.io)