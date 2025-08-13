# 🧠 Knowledge MCP - Installation Instructions

## 📦 Quick Installation

Check if Knowledge MCP is already installed:

```bash
claude mcp list | grep knowledge-mcp
```

If not found, install it:

```bash
# For all projects (recommended)
claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest

# For current project only
claude mcp add --scope project knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
```

## ⚙️ Installation Options

### Claude Code (CLI)

```bash
# Global installation (all projects)
claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest

# Project-specific installation
claude mcp add --scope project knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest

# Development mode (using local build)
claude mcp add knowledge-mcp node "$(pwd)/dist/knowledge-mcp/index.js"
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "npx",
      "args": ["-y", "@spothlynx/knowledge-mcp@latest"]
    }
  }
}
```

### Other MCP Clients

```json
{
  "mcpServers": {
    "knowledge-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@spothlynx/knowledge-mcp@latest"],
      "env": {}
    }
  }
}
```

## 🔄 Updating to Latest Version

```bash
# Remove old version
claude mcp remove knowledge-mcp

# Install latest version
claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
```

## ❓ Why These Flags?

- **`-y`**: Automatically accepts npx installation prompt (no user interaction needed)
- **`@latest`**: Forces npx to fetch the newest version (npx caches packages indefinitely without this)

## 🐛 Troubleshooting

If you encounter installation issues:

1. **Clear NPX cache**:
   ```bash
   rm -rf ~/.npm/_npx
   ```

2. **Check all scopes and reinstall**:
   ```bash
   claude mcp list
   claude mcp remove knowledge-mcp -s global
   claude mcp remove knowledge-mcp -s project
   claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
   ```

3. **Verify installation**:
   ```bash
   claude mcp list | grep knowledge-mcp
   ```

## 📚 Documentation

For usage instructions and full documentation, see:
- [README.md](README.md) - Complete documentation
- [GitHub Repository](https://github.com/sven-borkert/knowledge-mcp)

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/sven-borkert/knowledge-mcp/issues)
- **NPM Package**: [@spothlynx/knowledge-mcp](https://www.npmjs.com/package/@spothlynx/knowledge-mcp)