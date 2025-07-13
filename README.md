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
claude mcp add knowledge-mcp npx @spothlynx/knowledge-mcp
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
      "args": ["@spothlynx/knowledge-mcp"]
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

## 🛠️ Available Tools

### Core Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| `get_project_main` | Get project instructions | Always call first |
| `update_project_main` | Create/update instructions | Migrate CLAUDE.md |
| `update_project_section` | Update specific section | Efficient updates |
| `remove_project_section` | Remove section | Clean up outdated info |
| `search_knowledge` | Search all documents | Find before asking |
| `create_knowledge_file` | Create knowledge doc | Document learnings |
| `update_chapter` | Update chapter | Refine documentation |
| `remove_chapter` | Remove chapter | Clean up docs |
| `get_knowledge_file` | Get full document | Export/backup |
| `delete_knowledge_file` | Delete document | Remove obsolete docs |

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
   # Remove and re-add without the -y flag
   claude mcp remove knowledge-mcp
   claude mcp add knowledge-mcp npx @spothlynx/knowledge-mcp
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
