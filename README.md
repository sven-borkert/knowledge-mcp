# Knowledge MCP Server

🚀 **Replace scattered CLAUDE.md files with a centralized, searchable knowledge base that Claude Code automatically uses across all your projects.**

The Knowledge MCP Server provides persistent project-specific knowledge management through the Model Context Protocol. It automatically identifies projects, stores instructions and documentation, and makes them instantly searchable.

## ✨ Key Benefits

- **Automatic Project Detection**: Identifies projects by git remote or directory name
- **Replaces CLAUDE.md**: Centralized storage instead of per-project files
- **Searchable Knowledge**: Find information across all project documents
- **Persistent Memory**: Knowledge survives between sessions
- **Version Controlled**: All changes tracked with Git
- **Automatic Backup**: Changes pushed to origin/main when available
- **Secure**: Path validation and input sanitization

## 🚀 Quick Start (Claude Code Users)

### 1. Install the MCP Server

```bash
# For global scope (all projects) - ensures latest version is always used
claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest

# For current project only
claude mcp add --scope project knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
```

### 2. Configure Claude Code for Automatic Usage

Add this to your `~/.claude/CLAUDE.md` file to make Claude Code automatically use the Knowledge MCP:

```markdown
# 🧠 Knowledge MCP Auto-Usage

IMPORTANT: This system uses the Knowledge MCP Server for project knowledge.

## MANDATORY WORKFLOW (Execute at conversation start):

1. ALWAYS call get_project_main(project_id) first to check for existing project knowledge
2. If project exists: Use the returned instructions
3. If project doesn't exist: Look for local CLAUDE.md and migrate it with update_project_main
4. For all subsequent work, use the MCP as the single source of truth

## Key Commands:

- get_project_main - Get project instructions (ALWAYS START HERE)
- search_knowledge - Find information before asking questions
- create_knowledge_file - Document new learnings
- update_chapter - Update existing documentation

NEVER read local CLAUDE.md files directly - always use the Knowledge MCP.
```

That's it! Claude Code will now automatically check for project knowledge at the start of every conversation.

## 📦 Alternative Installation Methods

### From npm (global install)

```bash
npm install -g @spothlynx/knowledge-mcp
```

### From Source

```bash
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp
pnpm install
pnpm run build

# Add to Claude Code
claude mcp add knowledge-mcp node "$(pwd)/dist/knowledge-mcp/index.js"
```

## 🔧 Configuration

### Environment Variables

- `KNOWLEDGE_MCP_HOME`: Storage directory (default: `~/.knowledge-mcp`)
- `KNOWLEDGE_MCP_LOG_LEVEL`: Log level options: `ERROR`, `WARN`, `INFO`, `DEBUG` (default: `INFO`)

### Claude Desktop Configuration

For Claude Desktop users, add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

## 📖 How It Works

### Automatic Project Identification

The Knowledge MCP automatically identifies your project based on:

- **Git repositories**: Uses the repository name from git remote URL
- **Non-git directories**: Uses the current directory name

Example: `/path/to/my-awesome-project/.git` → project_id = "my-awesome-project"

### Workflow Example

```bash
# 1. Navigate to your project
cd ~/projects/my-app

# 2. Claude Code automatically calls get_project_main("my-app")
# 3. If no knowledge exists, it migrates your local CLAUDE.md
# 4. All future sessions use the centralized knowledge
```

### Storage Structure

```
~/.knowledge-mcp/
├── .git/                      # Git repository (auto-initialized)
├── index.json                 # Project name mapping
└── projects/
    └── my-app/
        ├── main.md            # Project instructions (replaces CLAUDE.md)
        └── knowledge/
            ├── api-guide.md   # Structured knowledge documents
            └── architecture.md
```

### Automatic Backup

The Knowledge MCP automatically backs up your knowledge:

1. All changes are committed to a local Git repository
2. If you configure a remote repository, changes are pushed automatically
3. To enable cloud backup:
   ```bash
   cd ~/.knowledge-mcp
   git remote add origin YOUR_GITHUB_REPO_URL
   ```

## 🔗 Git Remote Setup (Recommended)

Setting up a git remote enables automatic cloud backup and synchronization across devices:

### Step 1: Create a Remote Repository

Create a new repository on GitHub, GitLab, or your preferred git hosting service.

### Step 2: Configure the Remote

```bash
cd ~/.knowledge-mcp
git remote add origin https://github.com/yourusername/knowledge-mcp-backup.git
git push -u origin main
```

### Step 3: Set Up Authentication

Ensure your git credentials are configured for automatic push/pull:

```bash
# For GitHub with token
git config credential.helper store
# Then push once to store credentials

# Or use SSH keys (recommended)
git remote set-url origin git@github.com:yourusername/knowledge-mcp-backup.git
```

### Startup Synchronization

⚠️ **Important**: On every startup, the Knowledge MCP will:

1. **Pull** the latest changes from `origin/main`
2. **Overwrite** any local changes with remote content
3. Continue with normal operations

This ensures your knowledge stays synchronized across devices but **local changes will be lost** if not pushed to the remote repository.

## 🛠️ Available Tools

### Core Tools

| Tool                     | Purpose                    | Usage                  |
| ------------------------ | -------------------------- | ---------------------- |
| `get_project_main`       | Get project instructions   | Always call first      |
| `update_project_main`    | Create/update instructions | Migrate CLAUDE.md      |
| `update_project_section` | Update specific section    | Efficient updates      |
| `remove_project_section` | Remove section             | Clean up outdated info |
| `delete_project`         | Delete entire project      | Permanent removal      |
| `search_knowledge`       | Search all documents       | Find before asking     |
| `create_knowledge_file`  | Create knowledge doc       | Document learnings     |
| `update_chapter`         | Update chapter             | Refine documentation   |
| `remove_chapter`         | Remove chapter             | Clean up docs          |
| `get_knowledge_file`     | Get full document          | Export/backup          |
| `delete_knowledge_file`  | Delete document            | Remove obsolete docs   |
| `get_server_info`        | Get server information     | Check version/status   |
| `get_storage_status`     | Get git storage status     | Monitor repository     |
| `sync_storage`           | Force git sync             | Manual backup/push     |

### Resources (Read-Only)

- `knowledge://projects/{project_id}/main` - Read project instructions
- `knowledge://projects/{project_id}/files` - List knowledge files
- `knowledge://projects/{project_id}/chapters/{filename}` - List chapters

### Example: Creating a Knowledge Document

```json
{
  "project_id": "my-app",
  "filename": "api-guide",
  "title": "API Documentation",
  "introduction": "REST API endpoints and authentication",
  "keywords": ["api", "rest", "auth"],
  "chapters": [
    {
      "title": "Authentication",
      "content": "Use Bearer tokens..."
    }
  ]
}
```

## 📦 Version Management

### Why We Use `-y` and `@latest`

The installation commands include specific flags to ensure you always get the newest version:

- **`-y` flag**: Automatically accepts the npx installation prompt without user interaction
- **`@latest` tag**: Forces npx to fetch the newest version instead of using cached versions

**Important**: NPX caches packages indefinitely and won't check for updates automatically. Without `@latest`, you might be running an outdated version even if updates are available.

### Updating to Latest Version

If you installed without `@latest`, simply remove and re-add:

```bash
claude mcp remove knowledge-mcp
claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
```

## 🎯 MCP Configuration Precedence

### Understanding Configuration Levels

Claude Code loads MCP configurations in this precedence order (highest to lowest):

1. **User-level (Global)**: Added with `claude mcp add` - applies to all projects
2. **Project-level**: Added with `claude mcp add --scope project` - applies to current project
3. **`.mcp.json` file**: Manual configuration file - only loaded when explicitly specified

**Important**: User-level configurations always override project configurations and `.mcp.json` files.

### Verifying Your Current Version

To check which version of Knowledge MCP is currently active:

```bash
# Check active MCP servers
claude mcp list | grep knowledge-mcp

# For development: Should show local path
# Example: knowledge-mcp: node /path/to/knowledge-mcp/dist/knowledge-mcp/index.js

# For production: Should show npx with @latest
# Example: knowledge-mcp: npx -y @spothlynx/knowledge-mcp@latest
```

### Ensuring You're Using the Latest Version

#### For Production Users

Always use the `@latest` tag to bypass npx cache:

```bash
# Remove any existing configuration
claude mcp remove knowledge-mcp -s local  # Remove global config
claude mcp remove knowledge-mcp -s project # Remove project config

# Add with @latest tag to force newest version
claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
```

#### For Development

When developing or testing local changes:

```bash
# Point to your local build
claude mcp add knowledge-mcp node /path/to/knowledge-mcp/dist/knowledge-mcp/index.js

# After making changes, rebuild
cd /path/to/knowledge-mcp
pnpm run build

# Restart Claude Code to load the updated build
```

### Troubleshooting Version Issues

If you're not getting the expected version:

1. **Check all configuration scopes**:

   ```bash
   claude mcp list  # Shows all configurations
   ```

2. **Clear npx cache** if using published version:

   ```bash
   # Remove cached versions
   rm -rf ~/.npm/_npx

   # Reinstall with @latest
   claude mcp remove knowledge-mcp
   claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
   ```

3. **Verify the loaded version**:
   ```bash
   # Check server info (run in Claude Code)
   /mcp
   # Look for "Knowledge MCP Server" version number
   ```

## 🛡️ Security & Reliability

- **Path Validation**: Prevents directory traversal attacks
- **Input Sanitization**: Safe handling of filenames and content
- **Atomic Operations**: No partial writes or data corruption
- **Git Versioning**: Every change tracked automatically
- **Request Tracing**: Unique IDs for debugging

## 🐛 Troubleshooting

### Common Issues

1. **"spawn npx ENOENT" or "Connection closed"**

   ```bash
   # Remove and re-add to ensure latest version
   claude mcp remove knowledge-mcp
   claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
   ```

2. **Permission errors**

   ```bash
   # Ensure storage directory exists
   mkdir -p ~/.knowledge-mcp
   ```

3. **Check logs for debugging**

   ```bash
   # View MCP logs
   ls ~/Library/Caches/claude-cli-nodejs/*/mcp-logs-knowledge-mcp/

   # View activity logs with trace IDs
   tail -f ~/.knowledge-mcp/activity.log
   ```

### Error Codes

- `PROJECT_NOT_FOUND` - Project doesn't exist yet
- `DOCUMENT_NOT_FOUND` - Knowledge file not found
- `FILE_ALREADY_EXISTS` - File already exists
- `INVALID_INPUT` - Invalid parameters

See [Error Handling Guide](docs/error-handling-guide.md) for details.

## 💻 Development

### Requirements

- Node.js 18+
- Git
- pnpm (recommended) or npm

### Development Commands

```bash
# Clone and setup
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp
pnpm install

# Development
pnpm run dev          # Watch mode
pnpm run build        # Build TypeScript
pnpm run test:interface # Run tests
pnpm run lint         # Check code quality
pnpm run format       # Format code

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js
```

## 📦 Updates

```bash
# Update to latest version
claude mcp update knowledge-mcp

# Or with npm
npm update -g @spothlynx/knowledge-mcp
```

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Run tests before submitting
4. Submit a pull request

See [Publishing Guidelines](docs/publishing-guidelines.md) for maintainer instructions.

## 📄 License

MIT - See [LICENSE](LICENSE) file

## 🙏 Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- Inspired by the need for persistent project knowledge in AI development

---

<p align="center">
  <a href="https://github.com/sven-borkert/knowledge-mcp/issues">Report Issues</a> •
  <a href="https://github.com/sven-borkert/knowledge-mcp/releases">Changelog</a> •
  <a href="docs/technical-specification.md">Technical Docs</a>
</p>
