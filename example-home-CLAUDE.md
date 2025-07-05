# Global Claude Configuration

This file contains shared MCP server configurations and setup instructions for all projects.

## Knowledge MCP Server Setup

The Knowledge MCP Server provides centralized knowledge management across all your projects.

### One-time Installation

1. **Create a dedicated virtual environment:**
   ```bash
   # Create venv in your home directory
   python3 -m venv ~/.knowledge-mcp-venv
   ```

2. **Install the Knowledge MCP server:**
   ```bash
   # Activate the venv
   source ~/.knowledge-mcp-venv/bin/activate  # macOS/Linux
   # OR
   ~/.knowledge-mcp-venv/Scripts/activate     # Windows

   # Install the package
   pip install git+https://github.com/sven-borkert/knowledge-mcp.git

   # Deactivate (installation complete)
   deactivate
   ```

3. **Verify installation:**
   ```bash
   # Test that it runs
   ~/.knowledge-mcp-venv/bin/python -m knowledge_mcp.server --help
   ```

### MCP Configuration

Add this to your MCP client configuration:

**For Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
```json
{
  "mcpServers": {
    "knowledge": {
      "command": "/Users/YOUR_USERNAME/.knowledge-mcp-venv/bin/python",
      "args": ["-m", "knowledge_mcp.server"]
    }
  }
}
```

**For VS Code Claude Extension** (in settings.json):
```json
{
  "claude.mcpServers": {
    "knowledge": {
      "command": "/Users/YOUR_USERNAME/.knowledge-mcp-venv/bin/python",
      "args": ["-m", "knowledge_mcp.server"]
    }
  }
}
```

**Important:** Replace `/Users/YOUR_USERNAME` with your actual home directory path.

### Updating the Server

To update to the latest version:
```bash
source ~/.knowledge-mcp-venv/bin/activate
pip install --upgrade git+https://github.com/sven-borkert/knowledge-mcp.git
deactivate
```

### Troubleshooting

1. **Command not found**: Ensure the venv was created successfully
2. **Module not found**: Activate venv and reinstall
3. **Permission denied**: Check file permissions on ~/.knowledge-mcp-venv

### What This Provides

Once configured, the Knowledge MCP Server will be available in all your projects, allowing you to:
- Store project-specific knowledge that persists across Claude sessions
- Search across all knowledge documents
- Maintain project-specific instructions (replacing per-project CLAUDE.md files)

The server stores data in `~/.knowledge-mcp/projects/` organized by git repository.