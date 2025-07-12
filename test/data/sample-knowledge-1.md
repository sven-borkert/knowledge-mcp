# Knowledge MCP Server - Technical Specification

## Overview

The Knowledge MCP Server is a Model Context Protocol (MCP) server written in TypeScript that provides centralized project knowledge management. It replaces per-project CLAUDE.md files with a Git-backed centralized storage system, allowing AI assistants to maintain and access project-specific knowledge across multiple repositories.

## Architecture

### Storage Location

All project knowledge is stored at: `~/.knowledge-mcp/projects/{project-id}/`

- The root directory `~/.knowledge-mcp/` is automatically created on first run
- The entire directory is initialized as a Git repository for version tracking
- All changes are automatically committed with descriptive messages
- Activity logging tracks all method calls in `activity.log` (excluded from Git)

### Project Identification

Projects are identified by their project_id, which should be a unique identifier like:

1. **Repository Name**: For Git repositories (e.g., 'knowledge-mcp')
2. **Project Name**: For non-Git projects (e.g., 'My Project')

Project IDs are mapped to slugified directory names stored in an index.json file:

- Special characters and spaces are preserved in the project ID
- Directory names are slugified for filesystem safety
- Example: "My Project" → stored in directory "my-project"
- Mapping maintained in ~/.knowledge-mcp/index.json

### Document Types

#### 1. Main Project Document (`main.md`)

- Free-form markdown document
- Replaces traditional CLAUDE.md files
- No structural validation
- Can contain any project-specific instructions

#### 2. Knowledge Documents

Structured markdown files with required components:

```markdown
---
title: Document Title
keywords: [keyword1, keyword2, keyword3]
updated: 2024-01-01T12:00:00Z
---

Brief 2-3 line introduction to this knowledge document
explaining its purpose and main content.

## Chapter Title

Brief 2-3 line summary of this chapter's content
to help with search and navigation.

Detailed chapter content goes here...

## Another Chapter

Chapter summary...

Chapter content...
```

## MCP Interface

The TypeScript implementation uses the official `@modelcontextprotocol/sdk` and provides the following interface:

### Tools (Actions)

#### 1. `get_project_main`

Retrieves the main project instructions document.

**Input:**

```json
{
  "project_id": "string"
}
```

**Output:**

```json
{
  "content": "string",
  "exists": "boolean"
}
```

#### 2. `update_project_main`

Replaces the entire main.md file content.

**Input:**

```json
{
  "project_id": "string",
  "content": "string"
}
```

**Output:**

```json
{
  "success": "boolean",
  "message": "string"
}
```

#### 3. `search_knowledge`

Searches knowledge documents with case-insensitive keyword matching.

**Input:**

```json
{
  "project_id": "string",
  "query": "string"
}
```

**Output:**

```json
{
  "success": true,
  "total_documents": 1,
  "total_matches": 2,
  "results": [
    {
      "file": "api-guide.md",
      "match_count": 2,
      "metadata": {
        "title": "API Documentation Guide",
        "keywords": ["api", "documentation", "rest"],
        "created": "2024-01-01T12:00:00Z",
        "updated": "2024-01-01T12:00:00Z"
      },
      "matching_chapters": [
        {
          "chapter": "Getting Started",
          "keywords_found": ["api"],
          "match_context": {
            "api": ["...To begin using our API..."]
          },
          "chapter_summary": "Brief chapter summary"
        }
      ]
    }
  ]
}
```

#### 4. `create_knowledge_file`

Creates a new knowledge document.

**Input:**

```json
{
  "project_id": "string",
  "filename": "string",
  "title": "string",
  "introduction": "string",
  "keywords": ["string"],
  "chapters": [
    {
      "title": "string",
      "content": "string"
    }
  ]
}
```

**Output:**

```json
{
  "success": "boolean",
  "filepath": "string",
  "message": "string"
}
```

#### 5. `update_chapter`

Updates a specific chapter within a knowledge document.

**Input:**

```json
{
  "project_id": "string",
  "filename": "string",
  "chapter_title": "string",
  "new_content": "string",
  "new_summary": "string"
}
```

**Output:**

```json
{
  "success": "boolean",
  "message": "string"
}
```

#### 6. `get_knowledge_file`

Retrieves the complete content of a knowledge document including metadata, introduction, and all chapters. This tool enables full document download and backup functionality.

**Input:**

```json
{
  "project_id": "string",
  "filename": "string"
}
```

**Output:**

```json
{
  "success": "boolean",
  "document": {
    "filename": "string",
    "metadata": {
      "title": "string",
      "keywords": ["string"],
      "created": "ISO-8601 string",
      "updated": "ISO-8601 string"
    },
    "introduction": "string",
    "chapters": [
      {
        "title": "string",
        "content": "string",
        "summary": "string (optional)"
      }
    ],
    "full_content": "string"
  }
}
```

The `full_content` field contains the raw markdown for exact reconstruction of the original document.

#### 7. `delete_knowledge_file`

Removes a knowledge document.

**Input:**

```json
{
  "project_id": "string",
  "filename": "string"
}
```

**Output:**

```json
{
  "success": "boolean",
  "message": "string"
}
```

### Resources (Read-Only)

#### 1. `knowledge://projects/{project_id}/main`

Returns the main.md content for a project.

#### 2. `knowledge://projects/{project_id}/files`

Lists all knowledge files in a project.

**Output:**

```json
{
  "files": [
    {
      "filename": "api-guide.md",
      "title": "API Documentation Guide",
      "keywords": ["api", "documentation", "rest"],
      "created": "2024-01-01T12:00:00Z",
      "updated": "2024-01-01T12:00:00Z"
    }
  ],
  "count": 1
}
```

#### 3. `knowledge://projects/{project_id}/chapters/{filename}`

Lists all chapters in a specific knowledge file.

**Output:**

```json
{
  "filename": "api-guide.md",
  "title": "API Documentation Guide",
  "chapters": [
    {
      "title": "Getting Started",
      "level": 2,
      "summary": "Brief summary extracted from chapter content"
    }
  ],
  "count": 1
}
```

### Error Handling

The TypeScript implementation returns errors as part of the tool response content:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common error scenarios:

- Project not found
- Knowledge file not found
- Chapter not found (case-sensitive match required)
- Invalid file/chapter name (failed validation)
- Git operation failed
- File I/O error
- Invalid frontmatter/metadata
- Missing required fields (e.g., empty keywords array)

## Activity Logging

### Overview

The Knowledge MCP Server automatically logs all method calls to track usage and provide audit capabilities. The logging system captures method calls with key parameters but excludes sensitive content.

### Log File Location

Activity logs are stored at: `~/.knowledge-mcp/activity.log`

- **File Format**: JSON Lines (one JSON object per line)
- **Git Exclusion**: Automatically added to `.gitignore`
- **Persistence**: Logs persist across server restarts
- **Performance**: Minimal overhead with asynchronous writes

### Log Entry Format

```json
{
  "timestamp": "2025-07-12T07:16:13.149Z",
  "method": "create_knowledge_file",
  "success": true,
  "project_id": "my-project",
  "filename": "api-guide.md",
  "chapter_title": "Authentication"
}
```

### Logged Fields

| Field           | Type    | Description                             |
| --------------- | ------- | --------------------------------------- |
| `timestamp`     | string  | ISO 8601 timestamp of the method call   |
| `method`        | string  | Name of the MCP tool called             |
| `success`       | boolean | Whether the operation succeeded         |
| `project_id`    | string  | Project identifier (when applicable)    |
| `filename`      | string  | Knowledge file name (when applicable)   |
| `chapter_title` | string  | Chapter name for chapter operations     |
| `error`         | string  | Error message (only when success=false) |

### Privacy Protection

**What is logged:**

- Method names and timestamps
- Project identifiers and filenames
- Success/failure status
- Error messages for debugging

**What is NOT logged:**

- Document content or chapter content
- File contents or search results
- Sensitive data or user content
- Authentication tokens or credentials

### Log Analysis

Example queries using standard tools:

```bash
# Count operations by method
cat activity.log | jq -r '.method' | sort | uniq -c

# Show failed operations
cat activity.log | jq 'select(.success == false)'

# Operations for specific project
cat activity.log | jq 'select(.project_id == "my-project")'

# Recent activity (last 10 entries)
tail -10 activity.log | jq .
```

## Security Features

### Path Validation

- All paths are validated to prevent directory traversal
- Project IDs and filenames are checked against allowed patterns
- Absolute paths are resolved and verified to be within storage directory

### Filename Sanitization

- Filenames are slugified to ensure filesystem compatibility
- Special characters are replaced with hyphens
- Unicode characters are transliterated to ASCII

### YAML Safety

- Uses `js-yaml` library with safe loading defaults
- Validates YAML frontmatter before parsing
- Only allows basic YAML types (strings, numbers, lists, objects)

### Git Isolation

- Git commits use isolated credentials per command:
  - Name: "Knowledge MCP Server"
  - Email: "knowledge-mcp@localhost"
- Configuration is passed via command flags, not global settings

## Implementation Details

### Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",
  "front-matter": "^4.0.2",
  "js-yaml": "^4.1.0",
  "slugify": "^1.6.6",
  "zod": "^3.22.4"
}
```

### File Operations

1. **Read Operations**:
   - Check file existence using Node.js fs module
   - Validate paths to prevent directory traversal
   - Parse frontmatter using `front-matter` library
   - Return structured data as JSON

2. **Write Operations**:
   - Validate all inputs using Zod schemas
   - Create parent directories if needed (recursive mkdirSync)
   - Write atomically using temp file approach
   - Auto-commit to Git using child_process.execSync

3. **Search Operations**:
   - Case-insensitive matching across document content
   - Search in document body, chapter titles, and chapter content
   - Aggregate results by document with matching chapters
   - Return document-centric results with match contexts

### Git Integration

Every write operation triggers a Git commit:

- Format: `"Update knowledge for {project-id}: {operation}"`
- Examples:
  - `"Update knowledge for my-app: Created authentication.md"`
  - `"Update knowledge for frontend: Updated chapter 'React Hooks' in patterns.md"`
  - `"Update knowledge for backend: Deleted deprecated-api.md"`

### Server Configuration

The TypeScript server is initialized with clear instructions about its purpose:

```typescript
const server = new McpServer({
  name: 'Knowledge MCP Server',
  version: '0.1.0',
  description: `IMPORTANT: This Knowledge MCP server ONLY replaces the project's CLAUDE.md. 
It does NOT replace CLAUDE.local.md or ~/.claude/CLAUDE.md - those must 
still be used as usual.

Key concepts:
- project_id: Determined from your current working location:
  * If in a git repo: Use the repository name (e.g., 'knowledge-mcp')
  * If not in git: Use the current location name (e.g., 'My Project')
- Project instructions: Retrieved via 'get_project_main' (replaces project's CLAUDE.md only)
- Knowledge documents: Structured content with metadata and chapters
- Secure: All inputs are validated and sanitized

Start by using 'get_project_main' with the project_id to retrieve project-specific instructions.`,
});
```

## Testing Strategy

The TypeScript implementation includes comprehensive automated tests:

### Interface Tests (`test/interface-test.ts`)

- **15 core tests** covering all MCP operations
- Tests run against the compiled server using MCP client SDK
- 100% test pass rate validates API compatibility

Test categories:

1. **Project Management** (4 tests)
   - Create, retrieve, update projects
   - Handle non-existent projects

2. **Knowledge Documents** (2 tests)
   - Create structured documents
   - Handle special characters in filenames

3. **Search Operations** (2 tests)
   - Single/multiple keyword search
   - Case-insensitive matching

4. **Chapter Updates** (2 tests)
   - Update existing chapters
   - Handle non-existent chapters

5. **File Deletion** (2 tests)
   - Delete existing files
   - Handle non-existent files

6. **Resource Endpoints** (3 tests)
   - List files, chapters, read main

### Running Tests

```bash
pnpm run test:interface  # Run automated interface tests
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js  # Interactive testing
```

## Deployment

### Local Development

```bash
# Development mode with auto-reload
pnpm run dev

# Build and run
pnpm run build
pnpm start
```

### Production Deployment

```bash
# Build TypeScript
pnpm run build

# Run directly
node dist/knowledge-mcp/index.js

# Or configure in Claude Desktop (see README)
```

### Environment Variables

- `KNOWLEDGE_MCP_HOME`: Override default storage location (default: `~/.knowledge-mcp`)
- `KNOWLEDGE_MCP_LOG_LEVEL`: Set logging level (default: `INFO`)

## Future Considerations

### Potential Enhancements

1. Multi-client concurrent access support
2. Knowledge sharing between teams
3. Search result ranking algorithms
4. Knowledge graph visualization
5. Import tools for existing CLAUDE.md files

### Maintenance

1. Regular Git repository maintenance (gc, prune)
2. Storage usage monitoring
3. Backup strategies for knowledge repository
4. TypeScript/dependency updates
5. Schema migration tools if needed

### Package Management

The project uses pnpm for dependency management:

```bash
pnpm install     # Install dependencies
pnpm update      # Update dependencies
pnpm run build   # Compile TypeScript
```
