# Knowledge MCP Quick Reference

## Installation & Setup

```bash
# Clone and install
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp
pnpm install
pnpm run build

# Configure Claude Desktop
# Edit: ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "knowledge": {
      "command": "node",
      "args": ["/absolute/path/to/knowledge-mcp/dist/knowledge-mcp/index.js"]
    }
  }
}
```

## Tools Reference

### get_project_main

Retrieve project instructions (replaces CLAUDE.md)

```json
Input:  { "project_id": "my-project" }
Output: { "exists": true, "content": "..." }
```

### update_project_main

Create/update project instructions

```json
Input:  { "project_id": "my-project", "content": "# Project\n..." }
Output: { "success": true, "message": "..." }
```

### search_knowledge

Search across all knowledge documents

```json
Input:  { "project_id": "my-project", "query": "api auth" }
Output: { "success": true, "results": [...], "total_matches": 5 }
```

### create_knowledge_file

Create structured knowledge document

```json
Input:  {
  "project_id": "my-project",
  "filename": "api-guide",
  "title": "API Guide",
  "introduction": "...",
  "keywords": ["api", "rest"],
  "chapters": [{"title": "Auth", "content": "..."}]
}
Output: { "success": true, "filepath": "knowledge/api-guide.md" }
```

### update_chapter

Update specific chapter (case-sensitive title match)

```json
Input:  {
  "project_id": "my-project",
  "filename": "api-guide.md",
  "chapter_title": "Auth",
  "new_content": "Updated content..."
}
Output: { "success": true, "message": "..." }
```

### delete_knowledge_file

Delete knowledge document

```json
Input:  { "project_id": "my-project", "filename": "old-guide.md" }
Output: { "success": true, "message": "..." }
```

## Resources (Read-Only)

```
knowledge://projects/{project_id}/main          # Get main.md
knowledge://projects/{project_id}/files         # List all files
knowledge://projects/{project_id}/chapters/{f}  # List chapters
```

## Document Format

```markdown
---
title: Document Title
keywords: [keyword1, keyword2]
created: 2024-01-01T12:00:00Z
updated: 2024-01-01T12:00:00Z
---

Introduction paragraph...

## Chapter Title

Chapter content...
```

## Development Commands

```bash
pnpm run dev          # Watch mode
pnpm run build        # Build TypeScript
pnpm run test:interface  # Run tests
pnpm run lint:fix     # Fix linting
pnpm run format       # Format code
pnpm run analyze:fix  # All fixes
```

## Storage Structure

```
~/.knowledge-mcp/
├── index.json         # Project ID mapping
└── projects/
    └── my-project/    # Slugified name
        ├── main.md    # Project instructions
        └── knowledge/
            └── *.md   # Knowledge docs
```

## Common Issues

### Build Issues

```bash
pnpm install
pnpm run build
```

### Path Errors

- Use absolute paths in config
- No ~ in paths

### Git Errors

```bash
git --version  # Ensure installed
```

## Environment Variables

```bash
KNOWLEDGE_MCP_HOME=/custom/path     # Storage location
KNOWLEDGE_MCP_LOG_LEVEL=DEBUG       # Enable debug logs
```

## Testing

```bash
# Automated tests
pnpm run test:interface

# Interactive testing
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js

# Quick CLI test
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/knowledge-mcp/index.js
```

## Security Features

- ✅ Path validation (no directory traversal)
- ✅ Filename sanitization (safe slugs)
- ✅ YAML safe loading
- ✅ Git isolation (local credentials)
- ✅ Input validation (Zod schemas)

## Performance Tips

- Startup: ~200ms
- Operations: <50ms
- Memory: ~40MB base
- Use `KNOWLEDGE_MCP_LOG_LEVEL=ERROR` in production

## Links

- [GitHub Repository](https://github.com/sven-borkert/knowledge-mcp)
- [MCP Documentation](https://modelcontextprotocol.io)
- [TypeScript SDK](https://github.com/modelcontextprotocol/sdk)
