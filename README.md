# Knowledge MCP Server

🚀 **Keep AI instruction files out of your project repositories by storing them in a centralized, searchable knowledge base that AI assistants can automatically access.**

The Knowledge MCP Server provides persistent project-specific knowledge management through the Model Context Protocol. It automatically identifies projects, stores instructions and documentation separately from your codebase, and makes them instantly searchable.

## ✨ Key Benefits

- **Automatic Project Detection**: Identifies projects by git remote or directory name
- **Keeps Repositories Clean**: Stores AI instructions outside of project repositories
- **Searchable Knowledge**: Find information across all project documents
- **Persistent Memory**: Knowledge survives between sessions
- **No Repository Pollution**: AI-specific files stay out of your codebase
- **Version Controlled**: All changes tracked with Git
- **Automatic Backup**: Changes pushed to origin/main when available
- **Secure**: Path validation and input sanitization
- **TODO Management**: Track development tasks per project with sequential numbering

## 🚀 Quick Start

### 1. Install the MCP Server

The server can be installed in various ways depending on your MCP client:

#### Using NPM (Global Install)

```bash
npm install -g @spothlynx/knowledge-mcp
```

#### From Source

```bash
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp
pnpm install
pnpm run build
```

### 2. Configure Your MCP Client

Configure your MCP client to automatically use the Knowledge MCP. For example, if your AI assistant supports global instruction files, you might add:

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

## TODO Management (Use only when explicitly requested):

- list_todos - See all TODO lists when user asks to check TODOs
- create_todo - Create TODO list when user asks to save a plan
- get_next_todo_task - Use when working through a TODO list
- complete_todo_task - Mark tasks done as you complete them

NEVER read local project instruction files directly - always use the Knowledge MCP.
```

This configuration ensures your AI assistant will automatically check for project knowledge at the start of every conversation.

### Using TODO Management

The Knowledge MCP includes a built-in TODO management system for tracking development tasks. Use it only when explicitly requested:

```markdown
## TODO Usage Guidelines for AI Assistants:

DO NOT automatically check or create TODOs. Only use TODO features when the user explicitly:
- Asks to "save this plan as a TODO"
- Says "work on TODO #X" or "continue with the TODO list"
- Requests to "check my TODOs" or "list TODOs"

When asked to work on a TODO:
1. Get all tasks with get_todo_tasks(project_id, todo_number)
2. Work through ALL incomplete tasks sequentially
3. Use get_next_todo_task to identify what to do next
4. Mark each task complete with complete_todo_task as you finish
5. Continue until all tasks are done or you encounter a blocker

Example scenarios:
- User: "Save this plan as a TODO" → Create TODO with the plan's steps
- User: "Work on TODO #1" → Get tasks and complete them all
- User: "What TODOs do I have?" → List TODOs for the project
- User: "Help me implement authentication" → DO NOT create a TODO unless asked
```

This ensures TODOs are used intentionally for explicit task tracking, not automatic workflow management.

## 📦 Client-Specific Configuration Examples

### Claude Code

```bash
# For global scope (all projects) - ensures latest version is always used
claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest

# For current project only
claude mcp add --scope project knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest

# For development (using local build)
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

### Generic MCP Configuration

For other MCP-compatible clients, configure the server with:

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

## 🔧 Configuration

### Environment Variables

- `KNOWLEDGE_MCP_HOME`: Storage directory (default: `~/.knowledge-mcp`)
- `KNOWLEDGE_MCP_LOG_LEVEL`: Log level options: `ERROR`, `WARN`, `INFO`, `DEBUG` (default: `INFO`)

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

# 2. Your AI assistant automatically calls get_project_main("my-app")
# 3. Knowledge is retrieved from central storage, not from your repository
# 4. All future sessions use the centralized knowledge
```

### Storage Structure

```
~/.knowledge-mcp/
├── .git/                      # Git repository (auto-initialized)
├── index.json                 # Project name mapping
└── projects/
    └── my-app/
        ├── main.md            # Project instructions (stored centrally, not in repository)
        ├── knowledge/
        │   ├── api-guide.md   # Structured knowledge documents
        │   └── architecture.md
        └── TODO/              # TODO lists for the project
            ├── 1/             # First TODO list
            │   ├── index.json # TODO metadata
            │   └── TASK-*.json # Individual task files
            └── 2/             # Second TODO list
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

### TODO Management Tools

| Tool                  | Purpose                    | Usage                     |
| --------------------- | -------------------------- | ------------------------- |
| `list_todos`          | List all TODO lists        | See project tasks         |
| `create_todo`         | Create new TODO            | Start tracking tasks      |
| `add_todo_task`       | Add task to TODO           | Expand existing TODO      |
| `remove_todo_task`    | Remove a task              | Clean up mistakes         |
| `complete_todo_task`  | Mark task as done          | Track progress            |
| `get_next_todo_task`  | Get next incomplete task   | Focus on what's next      |
| `get_todo_tasks`      | Get all tasks in TODO      | Review full TODO list     |
| `delete_todo`         | Delete entire TODO         | Clean up completed TODOs  |

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

### Example: TODO Management Workflow

```bash
# 1. Create a TODO with initial tasks
create_todo({
  "project_id": "my-app",
  "description": "Implement user authentication",
  "tasks": ["Create user model", "Add password hashing", "Setup JWT tokens"]
})

# 2. Get the next task to work on
get_next_todo_task({"project_id": "my-app", "todo_number": 1})
# Returns: {"number": 1, "description": "Create user model"}

# 3. Complete the task
complete_todo_task({"project_id": "my-app", "todo_number": 1, "task_number": 1})

# 4. Add a new task if needed
add_todo_task({
  "project_id": "my-app", 
  "todo_number": 1,
  "description": "Add email validation"
})
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

Most MCP clients support multiple configuration levels. For example, in Claude Code:

1. **User-level (Global)**: Applies to all projects
2. **Project-level**: Applies to current project only
3. **Configuration files**: Manual configuration files (e.g., `.mcp.json`)

**Important**: Higher-level configurations typically override lower-level ones. Check your MCP client's documentation for specific precedence rules.

### Verifying Your Current Version

To check which version of Knowledge MCP is currently active, use your MCP client's listing command. For example:

```bash
# Claude Code example:
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
# Example for Claude Code:
# Remove any existing configuration
claude mcp remove knowledge-mcp -s local  # Remove global config
claude mcp remove knowledge-mcp -s project # Remove project config

# Add with @latest tag to force newest version
claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
```

#### For Development

When developing or testing local changes:

```bash
# Point to your local build (example for Claude Code)
claude mcp add knowledge-mcp node /path/to/knowledge-mcp/dist/knowledge-mcp/index.js

# After making changes, rebuild
cd /path/to/knowledge-mcp
pnpm run build

# Restart your MCP client to load the updated build
```

### Troubleshooting Version Issues

If you're not getting the expected version:

1. **Check all configuration scopes**:

   ```bash
   # Example for Claude Code:
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
   # Check server info using your MCP client
   # For example, in Claude Code: /mcp
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
   # Remove and re-add to ensure latest version (example for Claude Code)
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
   # View MCP logs (location varies by client)
   # For Claude Code:
   # ls ~/Library/Caches/claude-cli-nodejs/*/mcp-logs-knowledge-mcp/

   # View activity logs with trace IDs
   tail -f ~/.knowledge-mcp/activity.log
   ```

### Error Codes

- `PROJECT_NOT_FOUND` - Project doesn't exist yet
- `DOCUMENT_NOT_FOUND` - Knowledge file not found
- `FILE_ALREADY_EXISTS` - File already exists
- `INVALID_INPUT` - Invalid parameters
- `TODO_NOT_FOUND` - TODO list doesn't exist
- `TODO_TASK_NOT_FOUND` - Task not found in TODO list
- `INVALID_TODO_NUMBER` - Invalid TODO number format

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
# Update using npm
npm update -g @spothlynx/knowledge-mcp

# Or for Claude Code users:
claude mcp update knowledge-mcp
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
