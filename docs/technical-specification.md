# Knowledge MCP Server - Technical Specification

## Overview

The Knowledge MCP Server is a Model Context Protocol (MCP) server that provides centralized project knowledge management. It replaces per-project CLAUDE.md files with a Git-backed centralized storage system, allowing AI assistants to maintain and access project-specific knowledge across multiple repositories.

## Architecture

### Storage Location

All project knowledge is stored at: `~/.knowledge-mcp/projects/{project-id}/`

- The root directory `~/.knowledge-mcp/` is automatically created on first run
- The entire directory is initialized as a Git repository for version tracking
- All changes are automatically committed with descriptive messages

### Project Identification

Projects are identified using:
1. **Git Remote URL**: For Git repositories with remotes, the origin URL is used
2. **Directory Name**: For local-only projects, the top-level directory name is used

Project IDs are slugified for filesystem safety:
- Special characters are replaced with hyphens
- Example: "my-app (v2)" becomes "my-app-v2"

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
  "results": [
    {
      "file": "string",
      "title": "string",
      "chapter": "string",
      "chapter_summary": "string",
      "matches": ["string"]
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
      "summary": "string",
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

#### 6. `delete_knowledge_file`
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
      "filename": "string",
      "title": "string",
      "keywords": ["string"],
      "updated": "string"
    }
  ]
}
```

#### 3. `knowledge://projects/{project_id}/chapters/{filename}`
Lists all chapters in a specific knowledge file.

**Output:**
```json
{
  "chapters": [
    {
      "title": "string",
      "summary": "string"
    }
  ]
}
```

### Error Codes

The server uses standard JSON-RPC 2.0 error responses with custom codes:

- `-32001`: Project not found
- `-32002`: Knowledge file not found
- `-32003`: Chapter not found
- `-32004`: Invalid file/chapter name (failed validation)
- `-32005`: Git operation failed
- `-32006`: File I/O error
- `-32007`: Invalid frontmatter/metadata
- `-32008`: Missing required fields

**Error Response Format:**
```json
{
  "code": -32001,
  "message": "Project not found: my-project",
  "data": {
    "project_id": "my-project",
    "searched_path": "/home/user/.knowledge-mcp/projects/my-project"
  }
}
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
- Uses `yaml.safe_load()` to prevent code execution
- Only allows basic YAML types (strings, numbers, lists, dicts)

### Git Isolation
- Git commits use isolated credentials per command:
  - Name: "Knowledge MCP Server"
  - Email: "knowledge-mcp@localhost"
- Configuration is passed via command flags, not global settings

## Implementation Details

### Dependencies

```
fastmcp>=2.0.0
PyYAML>=6.0
python-frontmatter>=1.0.0
unidecode>=1.3.6
```

### File Operations

1. **Read Operations**: 
   - Check file existence
   - Validate paths
   - Parse frontmatter
   - Return structured data

2. **Write Operations**:
   - Validate all inputs
   - Create parent directories if needed
   - Write atomically (temp file + rename)
   - Auto-commit to Git

3. **Search Operations**:
   - Case-insensitive matching
   - Search in file content and metadata
   - Deduplicate results
   - Return chapter-level matches

### Git Integration

Every write operation triggers a Git commit:
- Format: `"Update knowledge for {project-id}: {operation}"`
- Examples:
  - `"Update knowledge for my-app: Created authentication.md"`
  - `"Update knowledge for frontend: Updated chapter 'React Hooks' in patterns.md"`
  - `"Update knowledge for backend: Deleted deprecated-api.md"`

### Server Configuration

The server description instructs MCP clients to use this instead of CLAUDE.md:

```
"description": "Centralized project knowledge management. Use 'get_project_main' to retrieve project instructions instead of looking for CLAUDE.md files. Manages project-specific documentation and knowledge across all your repositories."
```

Each tool description reinforces this behavior:
- `get_project_main`: "Retrieves the main project instructions (replacement for CLAUDE.md)"
- `update_project_main`: "Updates the main project instructions (replacement for CLAUDE.md)"

## Testing Strategy

### Security Tests
- Path traversal attempts
- Filename sanitization edge cases
- YAML injection prevention
- Invalid input handling

### Functional Tests
- CRUD operations for all document types
- Search functionality with various queries
- Chapter management operations
- Git commit verification

### Integration Tests
- Full workflow scenarios
- Concurrent access handling
- Large file handling
- Error recovery

## Deployment

### Local Development
```bash
mcp dev server.py
```

### Production Deployment
```bash
# Docker
docker build -t knowledge-mcp .
docker run -v ~/.knowledge-mcp:/data knowledge-mcp

# Direct Python
python server.py
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
4. Migration tools for schema updates