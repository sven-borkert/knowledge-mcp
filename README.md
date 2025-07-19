# Knowledge MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-133/133_passing-green.svg)](#testing)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

A production-ready Model Context Protocol (MCP) server that provides centralized knowledge management for AI assistants. Features project-specific documentation, searchable knowledge bases, integrated TODO management, and Git-backed version control for persistent AI memory across sessions.

## 🚀 Features

- **📝 Project Knowledge Management**: Centralized storage for project instructions and documentation
- **🔍 Advanced Search**: Full-text search across all knowledge documents with contextual results
- **📋 TODO System**: Built-in task management with markdown support and progress tracking
- **🔐 Security-First**: Comprehensive input validation, path sanitization, and abstraction boundaries
- **⚡ High Performance**: Optimized for concurrent operations with sophisticated file locking
- **📊 Request Tracing**: Unique trace IDs for debugging and monitoring
- **🔄 Git Integration**: Automatic version control with descriptive commit messages
- **🧪 Battle-Tested**: 133 comprehensive tests covering all functionality and edge cases

## 📦 Installation

### NPM (Recommended)

```bash
npm install -g @spothlynx/knowledge-mcp
```

### From Source

```bash
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp
pnpm install
pnpm run build
npm link
```

## 🛠️ Usage

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "knowledge-mcp",
      "args": []
    }
  }
}
```

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "knowledge-mcp"
    }
  }
}
```

### Direct Execution

```bash
# Start the MCP server
knowledge-mcp

# Development mode with auto-reload
pnpm run dev
```

## 🤖 AI Assistant Configuration

### Automatic MCP Usage

Configure your AI assistant to automatically use the Knowledge MCP by adding this to your global instruction file (e.g., `~/.claude/CLAUDE.md`):

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

### TODO Management Guidelines

For AI assistants, use TODO features **only when explicitly requested**:

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

## 📦 Client-Specific Configuration

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

For other MCP-compatible clients:

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

## 🔄 Version Management

### Why Use `@latest` and `-y` Flags

- **`-y` flag**: Automatically accepts npx installation prompt without user interaction
- **`@latest` tag**: Forces npx to fetch the newest version instead of using cached versions

**Important**: NPX caches packages indefinitely. Without `@latest`, you might run outdated versions.

### Updating to Latest Version

```bash
# Remove and re-add to ensure latest version
claude mcp remove knowledge-mcp
claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
```

### Configuration Precedence

Most MCP clients support multiple configuration levels:

1. **User-level (Global)**: Applies to all projects
2. **Project-level**: Applies to current project only
3. **Configuration files**: Manual configuration files

Higher-level configurations typically override lower-level ones.

## 🛡️ Environment Configuration

### Environment Variables

- `KNOWLEDGE_MCP_HOME`: Storage directory (default: `~/.knowledge-mcp`)
- `KNOWLEDGE_MCP_LOG_LEVEL`: Log level: `ERROR`, `WARN`, `INFO`, `DEBUG` (default: `INFO`)

### Automatic Project Identification

The Knowledge MCP automatically identifies projects based on:

- **Git repositories**: Uses repository name from git remote URL
- **Non-git directories**: Uses current directory name

Example: `/path/to/my-awesome-project/.git` → project_id = "my-awesome-project"

### Storage Structure

```
~/.knowledge-mcp/
├── .git/                      # Git repository (auto-initialized)
├── index.json                 # Project name mapping
├── activity.log              # Request activity log (gitignored)
└── projects/
    └── my-app/
        ├── main.md            # Project instructions (centralized, not in repo)
        ├── knowledge/
        │   ├── api-guide.md   # Structured knowledge documents
        │   └── architecture.md
        └── TODO/              # TODO lists for the project
            ├── 1/             # First TODO list
            │   ├── index.md   # TODO metadata
            │   └── tasks/     # Individual task files
            └── 2/             # Second TODO list
```

### Git Remote Setup (Recommended)

Enable automatic cloud backup:

```bash
# 1. Create repository on GitHub/GitLab
# 2. Configure remote
cd ~/.knowledge-mcp
git remote add origin https://github.com/yourusername/knowledge-mcp-backup.git
git push -u origin main

# 3. Set up authentication (SSH recommended)
git remote set-url origin git@github.com:yourusername/knowledge-mcp-backup.git
```

**⚠️ Important**: On startup, Knowledge MCP pulls from `origin/main` and overwrites local changes.

## 📚 API Reference

### Core Tools

#### Project Management
- `get_project_main(project_id)` - Retrieve main project instructions
- `update_project_main(project_id, content)` - Update project instructions
- `update_project_section(project_id, section_header, new_content)` - Update specific section
- `add_project_section(project_id, section_header, content, position?, reference_header?)` - Add new section
- `remove_project_section(project_id, section_header)` - Remove section
- `delete_project(project_id)` - Delete entire project

#### Knowledge Documents
- `create_knowledge_file(project_id, filename, title, introduction, keywords, chapters)` - Create structured document
- `get_knowledge_file(project_id, filename)` - Retrieve complete document
- `delete_knowledge_file(project_id, filename)` - Delete document
- `update_chapter(project_id, filename, chapter_title, new_content, new_summary?)` - Update chapter
- `add_chapter(project_id, filename, chapter_title, content, position?, reference_chapter?)` - Add chapter
- `remove_chapter(project_id, filename, chapter_title)` - Remove chapter

#### Search & Discovery
- `search_knowledge(project_id, query)` - Full-text search across all documents

#### TODO Management
- `list_todos(project_id)` - List all TODO lists
- `create_todo(project_id, description, tasks?)` - Create new TODO list
- `get_todo_tasks(project_id, todo_number)` - Get tasks in TODO list
- `add_todo_task(project_id, todo_number, title, content?)` - Add task
- `complete_todo_task(project_id, todo_number, task_number)` - Mark task complete
- `get_next_todo_task(project_id, todo_number)` - Get next incomplete task
- `remove_todo_task(project_id, todo_number, task_number)` - Remove task
- `delete_todo(project_id, todo_number)` - Delete entire TODO list

#### Server Operations
- `get_server_info()` - Get server version and configuration
- `get_storage_status()` - Get Git repository status
- `sync_storage()` - Force Git commit and sync

### Resources

The server provides read-only resources for browsing:

- `knowledge://projects/{project_id}/main` - Project main instructions
- `knowledge://projects/{project_id}/files` - List of knowledge files
- `knowledge://projects/{project_id}/chapters/{filename}` - Chapter listings

## 🏗️ Architecture

### Storage Structure

```
~/.knowledge-mcp/
├── index.json                 # Project name to directory mapping
├── activity.log              # Request activity log (gitignored)
└── projects/
    └── {project-slug}/        # Slugified project directory
        ├── main.md            # Main project instructions
        ├── knowledge/         # Knowledge documents
        │   └── *.md           # Individual knowledge files
        └── TODO/              # TODO lists
            └── {number}/      # Numbered TODO directories
                ├── index.md   # TODO metadata
                └── tasks/     # Individual task files
                    └── *.md
```

### Security Features

- **Path Validation**: Prevents directory traversal attacks
- **Input Sanitization**: Comprehensive validation with Zod schemas
- **Abstraction Boundaries**: Internal paths never exposed to clients
- **Atomic Operations**: File operations use temp-file + rename pattern
- **Request Tracing**: Unique trace IDs for all operations

### Concurrency & Performance

- **File Locking**: Queue-based locking prevents race conditions
- **Atomic Updates**: All file operations are atomic
- **Efficient Search**: Optimized full-text search with result limiting
- **Memory Management**: Controlled memory usage for large documents

## 🧪 Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
pnpm run test:all

# Run specific test suite
npx tsx test/suites/01-project-main.test.ts

# Generate HTML test report
pnpm run test:all && open test-results/html/merged-results.html
```

### Test Coverage

- **133 tests** across 11 comprehensive test suites
- **100% success rate** in CI/CD pipeline
- **Edge cases** including concurrency, unicode, and error conditions
- **Security tests** for abstraction boundaries and input validation
- **Performance tests** for high-load scenarios

## 🔧 Development

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm
- TypeScript 5.7+

### Development Workflow

```bash
# Install dependencies
pnpm install

# Start development server with auto-reload
pnpm run dev

# Build for production
pnpm run build

# Run type checking
pnpm run type-check

# Run linter
pnpm run lint

# Format code
pnpm run format

# Run all quality checks
pnpm run analyze
```

### Code Quality

The project enforces high code quality standards:

- **TypeScript**: Strict mode with comprehensive type checking
- **ESLint**: Comprehensive linting with TypeScript support
- **Prettier**: Consistent code formatting
- **Static Analysis**: Zero warnings policy
- **Test Coverage**: All functionality thoroughly tested

## 📖 Documentation

- **[Technical Specification](docs/technical-specification.md)** - Complete API reference and architecture
- **[Error Handling Guide](docs/error-handling-guide.md)** - Error codes and debugging
- **[MCP Security Guidelines](docs/mcp-security-guidelines.md)** - Security best practices
- **[Publishing Guidelines](docs/publishing-guidelines.md)** - Release and deployment process

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
   # Ensure storage directory exists and is writable
   mkdir -p ~/.knowledge-mcp
   chmod 755 ~/.knowledge-mcp
   ```

3. **NPX cache issues**

   ```bash
   # Clear NPX cache if using published version
   rm -rf ~/.npm/_npx
   
   # Reinstall with @latest
   claude mcp remove knowledge-mcp
   claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
   ```

4. **Version conflicts**

   ```bash
   # Check all configuration scopes
   claude mcp list
   
   # Remove from all scopes and re-add
   claude mcp remove knowledge-mcp -s global
   claude mcp remove knowledge-mcp -s project
   claude mcp add knowledge-mcp npx -- -y @spothlynx/knowledge-mcp@latest
   ```

### Debugging with Logs

```bash
# View MCP logs (location varies by client)
# For Claude Code:
ls ~/Library/Caches/claude-cli-nodejs/*/mcp-logs-knowledge-mcp/

# View activity logs with trace IDs
tail -f ~/.knowledge-mcp/activity.log

# Check Git repository status
cd ~/.knowledge-mcp && git status
```

### Error Codes

The Knowledge MCP uses standardized error codes for debugging:

- `PROJECT_NOT_FOUND` - Project doesn't exist yet (call `update_project_main` to create)
- `DOCUMENT_NOT_FOUND` - Knowledge file not found
- `FILE_ALREADY_EXISTS` - File already exists (use update instead of create)
- `SECTION_NOT_FOUND` - Section header not found in document
- `SECTION_ALREADY_EXISTS` - Section header already exists
- `INVALID_INPUT` - Invalid parameters (check Zod validation errors)
- `TODO_NOT_FOUND` - TODO list doesn't exist
- `TODO_TASK_NOT_FOUND` - Task not found in TODO list
- `FILE_SYSTEM_ERROR` - File operation failed
- `GIT_ERROR` - Git operation failed

Each error includes a unique `traceId` for debugging. Search logs using: `grep "traceId" ~/.knowledge-mcp/activity.log`

### Verifying Installation

```bash
# Check if Knowledge MCP is properly configured
claude mcp list | grep knowledge-mcp

# Test basic functionality (if using Claude Code)
# Should return server information
/mcp knowledge get_server_info

# Verify storage directory
ls -la ~/.knowledge-mcp/
```

### Performance Issues

If experiencing slow performance:

1. **Large knowledge base**: Consider splitting large documents
2. **Git repository size**: Archive old projects or use shallow clones
3. **Concurrent operations**: File locking ensures safety but may slow bulk operations
4. **Search performance**: Use specific keywords instead of broad queries

See [Error Handling Guide](docs/error-handling-guide.md) for detailed debugging information.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `pnpm run test:all`
5. Run quality checks: `pnpm run analyze`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Development Standards

- All new features must include comprehensive tests
- Code must pass all static analysis checks
- Documentation must be updated for API changes
- Security considerations must be addressed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Model Context Protocol** - For the excellent MCP specification
- **TypeScript Community** - For outstanding tooling and ecosystem
- **Contributors** - For making this project better

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/sven-borkert/knowledge-mcp/issues)
- **Documentation**: [Technical Specification](docs/technical-specification.md)
- **MCP Protocol**: [Official Documentation](https://modelcontextprotocol.io/)

---

**Built with ❤️ using TypeScript and the Model Context Protocol**