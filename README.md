# Knowledge MCP Server (TypeScript)

A Model Context Protocol (MCP) server that provides centralized knowledge management for your projects. Store, search, and maintain project-specific knowledge that persists across sessions.

## Features

- **Project-aware**: Automatically identifies projects by git remote URL or directory name
- **Structured knowledge**: Organize information in YAML-frontmatter markdown documents
- **Full-text search**: Search across all project knowledge documents
- **Chapter-based organization**: Structure documents with chapters for easy navigation
- **Main instructions**: Replace CLAUDE.md with centralized project instructions
- **Secure**: Path validation, input sanitization, and safe file operations
- **Git integration**: Automatic version control for all changes

## Installation

### Requirements

- Node.js 18+
- Git (for project identification and version control)

### From npm (Recommended)

```bash
# Install globally
npm install -g @spothlynx/knowledge-mcp

# Or for Claude Code users
claude mcp add knowledge-mcp npx @spothlynx/knowledge-mcp
```

### From Source

```bash
# Clone the repository
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp

# Install dependencies
pnpm install

# Build the TypeScript code
pnpm run build

# For Claude Code users - add using local build
claude mcp add knowledge-mcp node "$(pwd)/dist/knowledge-mcp/index.js"

# Or run the server directly
pnpm start
```

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "npx",
      "args": ["@spothlynx/knowledge-mcp"],
      "env": {
        "KNOWLEDGE_MCP_HOME": "~/.knowledge-mcp"
      }
    }
  }
}
```

### Claude Code (Recommended)

If you're using Claude Code, the MCP server is automatically configured when you install it with:

```bash
claude mcp add knowledge-mcp npx @spothlynx/knowledge-mcp
```

### Environment Variables

- `KNOWLEDGE_MCP_HOME`: Storage directory (default: `~/.knowledge-mcp`)
- `KNOWLEDGE_MCP_LOG_LEVEL`: Log level (default: `INFO`)

## Claude Code Integration

For optimal Claude Code integration, add this snippet to your personal CLAUDE.md file (`~/.claude/CLAUDE.md` or `~/.config/claude/CLAUDE.md`):

```markdown
# Knowledge MCP Integration

## Using Knowledge MCP Server

This project uses the Knowledge MCP Server for centralized knowledge management.

### Getting Started

1. Always start by checking existing project knowledge:
```

Use get_project_main to retrieve current project instructions

```

2. Search existing knowledge before asking questions:
```

Use search_knowledge to find relevant documentation

```

3. When you learn something new about the project, save it:
```

Use create_knowledge_file or update_chapter to document insights

```

### Best Practices
- **Check first**: Use get_project_main before starting any work
- **Search**: Use search_knowledge to find existing solutions
- **Document**: Save important learnings for future reference
- **Organize**: Use chapters to structure complex topics

The Knowledge MCP replaces traditional CLAUDE.md files with a centralized, searchable knowledge base.
```

## Quick Start

After installation, the Knowledge MCP Server automatically manages your project knowledge:

1. **First Use**: Navigate to any project directory and the server will identify it
2. **Get Instructions**: Use `get_project_main` to retrieve existing project knowledge
3. **Search Knowledge**: Use `search_knowledge` to find relevant information
4. **Add Knowledge**: Use `create_knowledge_file` to document new learnings
5. **Update Content**: Use `update_chapter` to modify existing documentation

All knowledge is automatically:

- ✅ Stored in `~/.knowledge-mcp/projects/{project-name}/`
- ✅ Version controlled with Git
- ✅ Searchable across all documents
- ✅ Organized with structured chapters

## Usage

### Tools

The server provides the following tools:

1. **get_project_main** - Retrieve main project instructions

   ```json
   {
     "project_id": "my-project"
   }
   ```

2. **update_project_main** - Create or update main project instructions

   ```json
   {
     "project_id": "my-project",
     "content": "# Project Instructions\n\nContent here..."
   }
   ```

3. **search_knowledge** - Search across all knowledge documents

   ```json
   {
     "project_id": "my-project",
     "query": "api authentication"
   }
   ```

4. **create_knowledge_file** - Create a new knowledge document

   ```json
   {
     "project_id": "my-project",
     "filename": "api-guide",
     "title": "API Documentation",
     "introduction": "This guide covers...",
     "keywords": ["api", "rest"],
     "chapters": [
       {
         "title": "Getting Started",
         "content": "..."
       }
     ]
   }
   ```

5. **update_chapter** - Update a specific chapter in a document

   ```json
   {
     "project_id": "my-project",
     "filename": "api-guide.md",
     "chapter_title": "Getting Started",
     "new_content": "Updated content..."
   }
   ```

6. **delete_knowledge_file** - Delete a knowledge document
   ```json
   {
     "project_id": "my-project",
     "filename": "old-guide.md"
   }
   ```

### Resources (Read-Only)

- `knowledge://projects/{project_id}/main` - Read main project instructions
- `knowledge://projects/{project_id}/files` - List all knowledge files
- `knowledge://projects/{project_id}/chapters/{filename}` - List chapters in a file

## Development

### Scripts

```bash
# Development mode with auto-reload
pnpm run dev

# Build TypeScript
pnpm run build

# Run tests
pnpm run test:interface

# Type checking
pnpm run type-check

# Linting
pnpm run lint

# Format code
pnpm run format
```

### Testing

The project includes comprehensive interface tests that validate all MCP operations:

```bash
# Run automated interface tests
pnpm run test:interface

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js
```

## Architecture

### Storage Structure

```
~/.knowledge-mcp/
├── index.json              # Project ID to directory mapping
└── projects/
    └── {project-slug}/     # Project directory
        ├── main.md         # Main project instructions
        └── knowledge/      # Knowledge documents
            └── *.md        # Individual knowledge files
```

### Security Features

- **Path Validation**: Prevents directory traversal attacks
- **Filename Sanitization**: Safe slugification of filenames
- **YAML Safety**: Uses js-yaml with safe loading
- **Atomic Writes**: Temporary files with atomic rename
- **Input Validation**: Zod schemas for all tool inputs

## Error Handling & Debugging

### Standardized Error System

All errors return a consistent format with typed error codes:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "context": {
    "traceId": "unique-request-id",
    "project_id": "affected-project"
  }
}
```

### Request Tracing

Every request gets a unique trace ID for debugging:

```bash
# Find all logs for a specific trace ID
grep "traceId.*ab462321ed4c1d33399b20bf504af8f2" ~/.knowledge-mcp/activity.log
```

### Automatic Retry

Transient errors are automatically retried with exponential backoff:

- File system errors (EAGAIN, EBUSY, EMFILE)
- Git operation failures
- Storage initialization issues

### Common Error Codes

- `PROJECT_NOT_FOUND` - Project doesn't exist
- `DOCUMENT_NOT_FOUND` - Knowledge file not found
- `FILE_ALREADY_EXISTS` - File already exists
- `FILE_SYSTEM_ERROR` - File operation failed (auto-retry)
- `GIT_ERROR` - Git operation failed (auto-retry)

See [Error Handling Guide](docs/error-handling-guide.md) for complete documentation.

## Troubleshooting

### MCP Server Fails to Start

If you see errors like `spawn npx -y @spothlynx/knowledge-mcp ENOENT` or `Connection closed`:

1. **Check command format**: The `-y` flag is not supported by Claude Code

   ```bash
   # ❌ Wrong
   claude mcp add knowledge-mcp npx -y @spothlynx/knowledge-mcp

   # ✅ Correct
   claude mcp add knowledge-mcp npx @spothlynx/knowledge-mcp
   ```

2. **Use local build for development** (recommended):

   ```bash
   # From the project directory
   claude mcp add knowledge-mcp node "$(pwd)/dist/knowledge-mcp/index.js"
   ```

3. **If npm package fails with "command not found"**:
   ```bash
   # The npm package might have permission issues, use local build instead:
   claude mcp remove knowledge-mcp
   claude mcp add knowledge-mcp node "/path/to/knowledge-mcp/dist/knowledge-mcp/index.js"
   ```

4. **Check MCP logs**:
   ```bash
   # View logs for debugging
   ls ~/Library/Caches/claude-cli-nodejs/*/mcp-logs-knowledge-mcp/
   ```

### Permission Errors

If you encounter permission errors:

1. **Ensure storage directory exists**:

   ```bash
   mkdir -p ~/.knowledge-mcp
   ```

2. **Check file permissions**:
   ```bash
   ls -la ~/.knowledge-mcp
   ```

### Build Errors

If TypeScript build fails:

1. **Clean and rebuild**:

   ```bash
   pnpm run clean
   pnpm install
   pnpm run build
   ```

2. **Check Node version**:
   ```bash
   node --version  # Should be 18+
   ```

## Updates & Versioning

The Knowledge MCP Server is actively maintained with frequent updates:

### Updating

```bash
# Update to latest version
npm update -g @spothlynx/knowledge-mcp

# For Claude Code users
claude mcp update knowledge-mcp
```

### Version Strategy

- **Patch versions** (0.1.x): Bug fixes, performance improvements
- **Minor versions** (0.x.0): New features, enhancements
- **Major versions** (x.0.0): Breaking changes

Check the [changelog](https://github.com/sven-borkert/knowledge-mcp/releases) for detailed release notes.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests (`pnpm run test:interface`)
5. Submit a pull request

## Publishing (Maintainers)

The package uses automated versioning and publishing scripts:

### Prerequisites

```bash
# Login to npm (one-time setup)
npm login

# Verify you're logged in as the correct user
npm whoami
```

### Publishing Updates

```bash
# For bug fixes and small improvements
npm run publish:patch    # 0.1.0 → 0.1.1

# For new features and enhancements
npm run publish:minor    # 0.1.0 → 0.2.0

# For breaking changes
npm run publish:major    # 0.1.0 → 1.0.0
```

### Manual Process

If you need more control over the process:

```bash
# 1. Update version
npm version patch|minor|major

# 2. Build and test (automatic via prepublishOnly)
pnpm run clean
pnpm run build
pnpm run test:interface

# 3. Publish to npm
npm publish --access public

# 4. Push version tag to GitHub
git push origin main --tags
```

### What Happens During Publish

1. **Version bump**: Updates package.json and creates a git tag
2. **Clean build**: Removes old dist files and rebuilds TypeScript
3. **Quality checks**: Runs type checking, linting, and tests
4. **Publish**: Uploads to npm registry with public access
5. **Git integration**: Commits version change and pushes tags

## License

MIT

## Acknowledgments

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) for TypeScript.
