# Knowledge MCP TypeScript Implementation

## Overview

This document provides a comprehensive guide to the TypeScript implementation of the Knowledge MCP Server. The server has been completely rewritten from Python to TypeScript while maintaining 100% API compatibility.

## Architecture

### Core Components

```
src/knowledge-mcp/
├── index.ts        # Entry point - starts the server
├── server.ts       # Main server implementation with tool/resource registration
├── documents.ts    # Document parsing, searching, and manipulation
├── utils.ts        # Utility functions for path validation, git, etc.
├── projectId.ts    # Project identification logic (if present)
├── errors/
│   ├── index.ts    # Error exports
│   └── MCPError.ts # Standardized error class with error codes
├── utils/
│   ├── tracing.ts  # Request tracing and unique ID generation
│   └── retry.ts    # Retry logic with exponential backoff
├── handlers/       # Modular handlers for each operation type
│   ├── BaseHandler.ts        # Base class with error handling
│   ├── ProjectToolHandler.ts # Project main.md operations
│   ├── KnowledgeToolHandler.ts # Knowledge file operations
│   ├── SearchToolHandler.ts  # Search functionality
│   ├── ChapterToolHandler.ts # Chapter operations
│   └── ResourceHandler.ts    # Read-only resource operations
└── config/
    └── index.ts    # Configuration and logging setup
```

### Key Technologies

- **MCP SDK**: `@modelcontextprotocol/sdk` - Official TypeScript SDK for MCP
- **Runtime Validation**: `zod` - Schema validation for tool inputs
- **YAML Processing**: `js-yaml` and `front-matter` - Safe YAML parsing
- **Slugification**: `slugify` - Convert strings to filesystem-safe names
- **Node.js APIs**: Built-in fs, path, child_process modules

## Implementation Details

### Server Initialization

The server is initialized with comprehensive metadata explaining its purpose:

```typescript
const server = new McpServer({
  name: 'Knowledge MCP Server',
  version: '0.1.0',
  description: `IMPORTANT: This Knowledge MCP server ONLY replaces...`,
});
```

### Tool Registration

Tools are registered using the MCP SDK's type-safe API:

```typescript
server.registerTool(
  'get_project_main',
  {
    title: 'Get Project Main Instructions',
    description: '...',
    inputSchema: {
      project_id: z.string().describe('...'),
    },
  },
  async ({ project_id }) => {
    // Implementation
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  }
);
```

### Storage Management

#### Project Index

Projects are mapped to filesystem directories via `index.json`:

```json
{
  "projects": {
    "My Project": "my-project",
    "Another Project": "another-project"
  }
}
```

#### Directory Structure

```
~/.knowledge-mcp/
├── index.json                    # Project ID → directory mapping
├── README.md                     # Auto-generated on first run
└── projects/
    └── my-project/              # Slugified directory name
        ├── main.md              # Main project instructions
        └── knowledge/           # Knowledge documents
            ├── api-guide.md
            └── user-manual.md
```

### Document Format

Knowledge documents use YAML frontmatter with markdown content:

```markdown
---
title: API Documentation Guide
keywords: [api, rest, documentation]
created: 2024-01-01T12:00:00Z
updated: 2024-01-02T15:30:00Z
---

Brief introduction to the document...

## Chapter Title

Chapter content goes here...
```

### Search Implementation

The search functionality (`searchDocuments`) provides document-centric results:

1. Parses query into keywords
2. Searches across document body and all chapters
3. Aggregates matches by document
4. Returns context snippets for each match

```typescript
interface SearchResult {
  file: string;
  match_count: number;
  metadata: DocumentMetadata;
  matching_chapters: MatchingChapter[];
}
```

### Security Features

#### Path Validation

```typescript
export function validatePath(basePath: string, requestedPath: string): string {
  // Prevents:
  // - Absolute paths
  // - Directory traversal (..)
  // - Windows drive letters
  // - Backslashes
  // - Symlinks pointing outside base
}
```

#### Filename Sanitization

```typescript
export function slugify(text: string): string {
  // Converts to lowercase
  // Replaces special chars with hyphens
  // Removes path separators
  // Handles edge cases (empty, dots only, etc.)
}
```

#### Git Integration

Git operations use isolated credentials per command:

```typescript
export function gitCommand(repoPath: string, ...args: string[]) {
  const cmd = [
    'git',
    '-c',
    'user.name=Knowledge MCP Server',
    '-c',
    'user.email=knowledge-mcp@localhost',
    ...args,
  ].join(' ');
  // Execute with execSync
}
```

### Error Handling

The TypeScript implementation uses a comprehensive error handling system with standardized error codes, request tracing, and automatic retry mechanisms.

#### MCPError Class

All errors use the standardized `MCPError` class:

```typescript
import { MCPError, MCPErrorCode } from '../errors/index.js';

// Creating typed errors
throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${projectId} not found`, {
  projectId,
  traceId: context.traceId,
});
```

#### Error Response Format

All errors return a consistent structure:

```typescript
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "context": {
    "traceId": "unique-request-id",
    "project_id": "affected-project",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

#### Request Tracing

Every request gets a unique trace ID:

```typescript
// In BaseHandler
protected createContext(method: string, params: Record<string, unknown>): RequestContext {
  const context = createRequestContext(method, params);
  this.logger.debug(`Starting request: ${method}`, formatRequestContext(context));
  return context;
}
```

#### Automatic Retry Logic

Transient errors are automatically retried:

```typescript
import { withRetry } from '../utils/retry.js';

// Wrap operations that might fail transiently
const result = await withRetry(() => performFileOperation(), {
  maxAttempts: 3,
  initialDelay: 100,
  retryableErrors: [MCPErrorCode.FILE_SYSTEM_ERROR],
});
```

## Testing

### Automated Interface Tests

The `test/interface-test.ts` file contains comprehensive tests:

```typescript
// Create MCP client
const client = new Client({ name: 'test-client', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: [serverPath],
});

// Execute tool
const result = await client.callTool({
  name: 'get_project_main',
  arguments: { project_id: 'test-project' },
});
```

### Test Coverage

- **15 core tests** covering all operations
- **100% pass rate** validates compatibility
- Tests run against compiled JavaScript output

### Running Tests

```bash
# Build the TypeScript code
pnpm run build

# Run automated tests
pnpm run test:interface

# Interactive testing
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js
```

## Development Workflow

### Setup

```bash
# Clone repository
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp

# Install dependencies
pnpm install

# Build TypeScript
pnpm run build
```

### Development Mode

```bash
# Watch mode with auto-reload
pnpm run dev

# In another terminal, test with inspector
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js
```

### Code Quality

```bash
# Type checking
pnpm run type-check

# Linting
pnpm run lint
pnpm run lint:fix

# Formatting
pnpm run format
pnpm run format:check

# All checks
pnpm run analyze
pnpm run analyze:fix
```

## Deployment

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "node",
      "args": ["/absolute/path/to/knowledge-mcp/dist/knowledge-mcp/index.js"],
      "env": {
        "KNOWLEDGE_MCP_HOME": "/Users/username/.knowledge-mcp",
        "KNOWLEDGE_MCP_LOG_LEVEL": "INFO"
      }
    }
  }
}
```

### Production Considerations

1. **Build Output**: Always use compiled JavaScript from `dist/`
2. **Node Version**: Requires Node.js 18+ for native fetch support
3. **Git Requirement**: Git must be installed for version control
4. **Permissions**: Write access required to `KNOWLEDGE_MCP_HOME`

## Migration from Python

### API Compatibility

The TypeScript implementation maintains full compatibility:

- Same tool names and parameters
- Identical response structures
- Same resource URI patterns
- Compatible storage format

### Behavioral Differences

1. **Slugification**: TypeScript slugify converts "&" to "and"
2. **Error Format**: Slightly different error message formatting
3. **Logging**: Uses console.error instead of Python logging

### Data Migration

No migration needed - TypeScript implementation reads/writes the same format:

```bash
# Python and TypeScript versions can share the same storage
KNOWLEDGE_MCP_HOME=~/.knowledge-mcp node dist/knowledge-mcp/index.js
```

## Performance

### Characteristics

- **Startup Time**: ~200ms (faster than Python)
- **Memory Usage**: ~40MB baseline
- **Tool Execution**: <50ms for most operations
- **Large Documents**: Handles efficiently with streaming

### Optimization Tips

1. Use production Node.js build
2. Enable V8 optimizations if needed
3. Monitor memory for large knowledge bases
4. Consider file-based caching for search

## Troubleshooting

### Common Issues

1. **Module Not Found**

   ```bash
   # Ensure dependencies installed
   pnpm install

   # Rebuild TypeScript
   pnpm run build
   ```

2. **Git Errors**

   ```bash
   # Ensure git is installed
   git --version

   # Check storage directory permissions
   ls -la ~/.knowledge-mcp
   ```

3. **Path Errors**
   - Always use absolute paths in configuration
   - Check KNOWLEDGE_MCP_HOME is writable

### Debug Mode

Enable verbose logging:

```bash
KNOWLEDGE_MCP_LOG_LEVEL=DEBUG node dist/knowledge-mcp/index.js
```

## Future Enhancements

### Planned Features

1. **Caching Layer**: Improve search performance
2. **Concurrent Access**: Handle multiple clients
3. **Import Tools**: Migrate existing CLAUDE.md files
4. **Web UI**: Management interface

### Contributing

1. Fork the repository
2. Create feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit pull request

## Conclusion

The TypeScript implementation provides a robust, type-safe, and performant Knowledge MCP Server that maintains full compatibility with the Python version while leveraging the Node.js ecosystem and official MCP SDK.
