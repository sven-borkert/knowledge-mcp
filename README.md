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

### From Source

```bash
# Clone the repository
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp

# Install dependencies
pnpm install

# Build the TypeScript code
pnpm run build

# Run the server
pnpm start
```

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "node",
      "args": ["/path/to/knowledge-mcp/dist/knowledge-mcp/index.js"],
      "env": {
        "KNOWLEDGE_MCP_HOME": "~/.knowledge-mcp"
      }
    }
  }
}
```

### Environment Variables

- `KNOWLEDGE_MCP_HOME`: Storage directory (default: `~/.knowledge-mcp`)
- `KNOWLEDGE_MCP_LOG_LEVEL`: Log level (default: `INFO`)

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

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests (`pnpm run test:interface`)
5. Submit a pull request

## License

MIT

## Acknowledgments

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) for TypeScript.
