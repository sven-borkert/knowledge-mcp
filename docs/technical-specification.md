# Knowledge MCP Server - Technical Specification

## Overview

The Knowledge MCP Server is a Model Context Protocol (MCP) server written in TypeScript that provides centralized project knowledge management. It replaces per-project CLAUDE.md files with a Git-backed centralized storage system, allowing AI assistants to maintain and access project-specific knowledge across multiple repositories.

Key features include:

- Main project instructions management (replaces CLAUDE.md)
- Structured knowledge documents with metadata and search capabilities
- TODO list management for tracking project tasks
- Git-backed version control with automatic commits
- Comprehensive error handling and request tracing

## Architecture

### Storage Location

All project knowledge is stored at: `~/.knowledge-mcp/projects/{project-id}/`

- The root directory `~/.knowledge-mcp/` is automatically created on first run
- The entire directory is initialized as a Git repository for version tracking
- All changes are automatically committed with descriptive messages
- Activity logging tracks all method calls in `activity.log` (excluded from Git)

Each project directory contains:

- `main.md` - Main project instructions (replaces CLAUDE.md)
- `knowledge/` - Structured knowledge documents
- `TODO/` - TODO lists with numbered subdirectories (e.g., `TODO/1/`, `TODO/2/`)
  - Each TODO directory contains:
    - `index.json` - TODO metadata (description, created date)
    - `TASK-XXX-*.json` - Individual task files with completion status

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

#### 3. `update_project_section`

Updates a specific section within the project main.md file.

**Input:**

```json
{
  "project_id": "string",
  "section_header": "string",
  "new_content": "string"
}
```

**Output:**

```json
{
  "success": "boolean",
  "message": "string"
}
```

#### 4. `remove_project_section`

Removes a specific section from the project main.md file.

**Input:**

```json
{
  "project_id": "string",
  "section_header": "string"
}
```

**Output:**

```json
{
  "success": "boolean",
  "message": "string"
}
```

#### 5. `add_project_section`

Adds a new section to the project main.md file. The section can be positioned at the end, or before/after a reference section.

**Input:**

```json
{
  "project_id": "string",
  "section_header": "string",
  "content": "string",
  "position": "string (optional)",
  "reference_header": "string (optional)"
}
```

- `position`: Can be "before", "after", or "end" (default)
- `reference_header`: Required when position is "before" or "after"

**Output:**

```json
{
  "success": "boolean",
  "message": "string"
}
```

#### 6. `search_knowledge`

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

#### 7. `create_knowledge_file`

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

#### 8. `update_chapter`

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

#### 9. `remove_chapter`

Removes a specific chapter from a knowledge document by title.

**Input:**

```json
{
  "project_id": "string",
  "filename": "string",
  "chapter_title": "string"
}
```

**Output:**

```json
{
  "success": "boolean",
  "message": "string"
}
```

#### 10. `add_chapter`

Adds a new chapter to a knowledge document. The chapter can be positioned at the end, or before/after a reference chapter.

**Input:**

```json
{
  "project_id": "string",
  "filename": "string",
  "chapter_title": "string",
  "content": "string",
  "position": "string (optional)",
  "reference_chapter": "string (optional)"
}
```

- `position`: Can be "before", "after", or "end" (default)
- `reference_chapter`: Required when position is "before" or "after"

**Output:**

```json
{
  "success": "boolean",
  "message": "string"
}
```

#### 11. `get_knowledge_file`

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

#### 12. `delete_knowledge_file`

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

#### 13. `delete_project`

Permanently deletes a project and all its content including the project directory and removes it from the index mapping.

⚠️ **Warning**: This action cannot be undone. Use with caution.

**Input:**

```json
{
  "project_id": "string"
}
```

**Output:**

```json
{
  "success": true,
  "project_id": "original-project-id",
  "message": "Project 'original-project-id' successfully deleted"
}
```

**Error Cases:**

- `PROJECT_NOT_FOUND`: Project doesn't exist in index
- `PROJECT_DELETE_FAILED`: Filesystem operation failed
- `GIT_ERROR`: Git commit failed

#### 14. `get_server_info`

Shows server information including version from package.json.

**Input:**

```json
{}
```

**Output:**

```json
{
  "success": true,
  "name": "Knowledge MCP Server",
  "version": "0.2.2",
  "storage_path": "/Users/username/.knowledge-mcp",
  "description": "Centralized project knowledge management via Model Context Protocol"
}
```

#### 15. `get_storage_status`

Shows git status of the knowledge datastore.

**Input:**

```json
{}
```

**Output:**

```json
{
  "success": true,
  "storage_path": "/Users/username/.knowledge-mcp",
  "has_changes": false,
  "current_branch": "main",
  "last_commit": "Update knowledge for my-app: Created api-guide.md",
  "remote_status": "origin/main (up to date)",
  "uncommitted_files": 0,
  "status_details": ""
}
```

#### 16. `sync_storage`

Force git add, commit, and push all changes in the knowledge datastore.

**Input:**

```json
{}
```

**Output:**

```json
{
  "success": true,
  "message": "Storage synchronized successfully",
  "files_committed": 3,
  "pushed": true,
  "commit_message": "Sync storage: 3 files updated"
}
```

**Error Cases:**

- `GIT_ERROR`: Git operations failed
- `FILE_SYSTEM_ERROR`: File access issues

### TODO Management Tools

The Knowledge MCP Server includes a comprehensive TODO management system for tracking tasks within projects. TODOs are stored as numbered directories within each project's TODO folder.

#### 17. `list_todos`

Lists all TODO lists in a project with their completion status.

**Input:**

```json
{
  "project_id": "string"
}
```

**Output:**

```json
{
  "success": true,
  "todos": [
    {
      "number": 1,
      "description": "Implement authentication system",
      "created": "2024-01-01T12:00:00Z",
      "completed": false,
      "task_count": 5,
      "completed_count": 2
    }
  ]
}
```

#### 18. `create_todo`

Creates a new TODO list with optional initial tasks.

**Input:**

```json
{
  "project_id": "string",
  "description": "string",
  "tasks": ["string"] // optional
}
```

**Output:**

```json
{
  "success": true,
  "todo_number": 1,
  "message": "Created TODO #1"
}
```

#### 19. `add_todo_task`

Adds a new task to an existing TODO list.

**Input:**

```json
{
  "project_id": "string",
  "todo_number": 1,
  "description": "string"
}
```

**Output:**

```json
{
  "success": true,
  "task_number": 3,
  "message": "Added task #3 to TODO #1"
}
```

#### 20. `remove_todo_task`

Removes a task from a TODO list.

**Input:**

```json
{
  "project_id": "string",
  "todo_number": 1,
  "task_number": 2
}
```

**Output:**

```json
{
  "success": true,
  "message": "Removed task #2 from TODO #1"
}
```

#### 21. `complete_todo_task`

Marks a task as completed in a TODO list.

**Input:**

```json
{
  "project_id": "string",
  "todo_number": 1,
  "task_number": 2
}
```

**Output:**

```json
{
  "success": true,
  "message": "Marked task #2 as completed in TODO #1"
}
```

#### 22. `get_next_todo_task`

Gets the next incomplete task in a TODO list.

**Input:**

```json
{
  "project_id": "string",
  "todo_number": 1
}
```

**Output:**

```json
{
  "success": true,
  "task": {
    "number": 3,
    "description": "Implement login endpoint"
  }
}
```

Or when all tasks are completed:

```json
{
  "success": true,
  "message": "All tasks completed"
}
```

#### 23. `get_todo_tasks`

Gets all tasks in a TODO list with their completion status.

**Input:**

```json
{
  "project_id": "string",
  "todo_number": 1
}
```

**Output:**

```json
{
  "success": true,
  "todo": {
    "number": 1,
    "description": "API Development",
    "created": "2024-01-01T12:00:00Z"
  },
  "tasks": [
    {
      "number": 1,
      "description": "Design API schema",
      "completed": true
    },
    {
      "number": 2,
      "description": "Implement endpoints",
      "completed": false
    }
  ]
}
```

#### 24. `delete_todo`

Deletes an entire TODO list and all its tasks.

**Input:**

```json
{
  "project_id": "string",
  "todo_number": 1
}
```

**Output:**

```json
{
  "success": true,
  "message": "Deleted TODO #1"
}
```

**Error Cases for TODO Operations:**

- `TODO_NOT_FOUND`: TODO list doesn't exist
- `TODO_TASK_NOT_FOUND`: Task doesn't exist in TODO list

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

The TypeScript implementation uses a standardized error handling system with typed error codes and request tracing.

#### Error Response Format

All errors return a consistent response structure:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "context": {
    "traceId": "unique-request-id",
    "project_id": "affected-project",
    "filename": "affected-file",
    "timestamp": "2024-01-01T12:00:00Z",
    "...additional context..."
  }
}
```

#### Error Codes

The system uses typed error codes for consistent error handling:

**General Errors:**

- `UNKNOWN_ERROR` - Unexpected errors
- `INTERNAL_ERROR` - Internal server errors

**Validation Errors:**

- `INVALID_INPUT` - Invalid input parameters
- `INVALID_PROJECT_ID` - Invalid project identifier
- `INVALID_FILENAME` - Invalid filename format
- `INVALID_PATH` - Path validation failed
- `INVALID_CONTENT` - Content validation failed

**Resource Errors:**

- `NOT_FOUND` - Generic resource not found
- `PROJECT_NOT_FOUND` - Project doesn't exist
- `DOCUMENT_NOT_FOUND` - Knowledge document not found
- `CHAPTER_NOT_FOUND` - Chapter not found (case-sensitive)
- `SECTION_NOT_FOUND` - Section not found in main.md

**File System Errors:**

- `FILE_SYSTEM_ERROR` - File system operation failed
- `ACCESS_DENIED` - Permission denied
- `FILE_ALREADY_EXISTS` - File already exists
- `PROJECT_DELETE_FAILED` - Project deletion failed

**Git Errors:**

- `GIT_ERROR` - Git operation failed
- `GIT_COMMAND_FAILED` - Git command execution failed

**Search Errors:**

- `SEARCH_ERROR` - Search operation failed
- `INVALID_SEARCH_QUERY` - Invalid search query format

**TODO Management Errors:**

- `TODO_NOT_FOUND` - TODO list doesn't exist
- `TODO_TASK_NOT_FOUND` - Task doesn't exist in TODO list

#### Request Tracing

Every request is assigned a unique trace ID for debugging:

- Trace IDs are generated using cryptographically secure random bytes
- All log entries include the trace ID
- Error responses include the trace ID in context
- Request duration is tracked and logged

#### Error Logging

All errors are logged with full context:

- Error code and message
- Request trace ID
- Request duration
- Method parameters (excluding sensitive data)
- Stack traces for debugging
- Original error details for wrapped errors

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
  "chapter_title": "Authentication",
  "traceId": "ab462321ed4c1d33399b20bf504af8f2",
  "duration": 45,
  "errorCode": "FILE_ALREADY_EXISTS",
  "errorContext": { "...": "..." }
}
```

### Logged Fields

| Field           | Type    | Description                                        |
| --------------- | ------- | -------------------------------------------------- |
| `timestamp`     | string  | ISO 8601 timestamp of the method call              |
| `method`        | string  | Name of the MCP tool called                        |
| `success`       | boolean | Whether the operation succeeded                    |
| `project_id`    | string  | Project identifier (when applicable)               |
| `filename`      | string  | Knowledge file name (when applicable)              |
| `chapter_title` | string  | Chapter name for chapter operations                |
| `error`         | string  | Error message (only when success=false)            |
| `traceId`       | string  | Unique request identifier for tracing              |
| `duration`      | number  | Request duration in milliseconds                   |
| `errorCode`     | string  | Standardized error code (only when success=false)  |
| `errorContext`  | object  | Additional error context (only when success=false) |

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

The Knowledge MCP Server implements comprehensive Git integration for version control and synchronization:

#### Startup Behavior

On server startup, the following Git operations are performed:

- **Git Repository Initialization**: Creates `.git` repository if it doesn't exist
- **Remote Sync**: If a git remote "origin" is configured:
  - Performs `git fetch origin main`
  - Executes `git reset --hard origin/main` to sync with remote
  - **⚠️ Warning**: Local changes are overwritten to prevent merge conflicts
  - Failures are logged but don't prevent server startup
- **Gitignore Management**: Updates `.gitignore` to exclude system files and logs
- **Cleanup**: Removes newly ignored files from git tracking

#### Write Operations

Every write operation triggers a Git commit and optional push:

- **Commit Format**: `"Update knowledge for {project-id}: {operation}"`
- **Examples**:
  - `"Update knowledge for my-app: Created authentication.md"`
  - `"Update knowledge for frontend: Updated chapter 'React Hooks' in patterns.md"`
  - `"Update knowledge for backend: Deleted deprecated-api.md"`

- **Automatic Push**: If a git remote named "origin" is configured:
  - Changes are automatically pushed to `origin/main` after each commit
  - Push failures are logged but don't interrupt the operation
  - Requires user to have appropriate git credentials configured
  - Network failures don't affect local functionality

#### Error Handling

- **Network Issues**: All git operations gracefully handle network failures
- **Authentication**: Failed authentication logs warnings but doesn't break functionality
- **Offline Mode**: Server works fully when remote is unavailable
- **Logging**: All git operations are logged with appropriate severity levels

### Server Configuration

The TypeScript server is initialized with clear instructions about its purpose:

```typescript
const server = new McpServer({
  name: 'Knowledge MCP Server',
  version: '0.2.2',
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

### Test Suite Organization

The test suite has been refactored into feature-based modules for better organization:

- **127 comprehensive tests** across 10 test suites
- Tests run against the compiled server using MCP client SDK
- 100% test pass rate validates API compatibility

Test suites:

1. **01-project-main.test.ts** - Project main document operations
2. **02-project-sections.test.ts** - Section management (add, update, remove)
3. **03-knowledge-files.test.ts** - Knowledge document CRUD operations
4. **04-chapters.test.ts** - Chapter management within documents
5. **05-search.test.ts** - Search functionality across documents
6. **06-resources.test.ts** - Read-only resource endpoints
7. **07-server-management.test.ts** - Server info and storage sync
8. **08-todo.test.ts** - TODO list and task management
9. **09-error-handling.test.ts** - Error scenarios and validation
10. **10-edge-cases.test.ts** - Unicode, large files, special characters

### Running Tests

```bash
# Run all tests
pnpm run test

# Run individual test suites
pnpm run test:suite:01  # Project main tests
pnpm run test:suite:02  # Project sections tests
pnpm run test:suite:03  # Knowledge files tests
pnpm run test:suite:04  # Chapters tests
pnpm run test:suite:05  # Search tests
pnpm run test:suite:06  # Resources tests
pnpm run test:suite:07  # Server management tests
pnpm run test:suite:08  # TODO tests
pnpm run test:suite:09  # Error handling tests
pnpm run test:suite:10  # Edge cases tests

# Interactive testing with MCP Inspector
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js
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
