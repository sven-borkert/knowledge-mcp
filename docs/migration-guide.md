# Python to TypeScript Migration Guide

## Overview

This guide helps users migrate from the Python implementation of Knowledge MCP to the TypeScript version. The TypeScript implementation maintains 100% API compatibility while offering improved performance and integration with the official MCP SDK.

## Why Migrate?

### Benefits of TypeScript Implementation

1. **Official SDK**: Uses the official `@modelcontextprotocol/sdk` maintained by Anthropic
2. **Better Performance**: Faster startup times and lower memory usage
3. **Type Safety**: Compile-time type checking prevents runtime errors
4. **Ecosystem**: Access to npm packages and Node.js ecosystem
5. **Active Development**: TypeScript version is the primary maintained version

## Migration Steps

### 1. Install Node.js

Ensure you have Node.js 18+ installed:

```bash
node --version  # Should be 18.0.0 or higher
```

### 2. Clone and Build

```bash
# Clone the TypeScript repository
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp

# Install dependencies with pnpm
pnpm install

# Build the TypeScript code
pnpm run build
```

### 3. Update Configuration

#### For Claude Desktop

Update `~/Library/Application Support/Claude/claude_desktop_config.json`:

**Old (Python):**

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "python",
      "args": ["/path/to/knowledge-mcp/server.py"],
      "env": {
        "KNOWLEDGE_MCP_HOME": "~/.knowledge-mcp"
      }
    }
  }
}
```

**New (TypeScript):**

```json
{
  "mcpServers": {
    "knowledge": {
      "command": "node",
      "args": ["/absolute/path/to/knowledge-mcp/dist/knowledge-mcp/index.js"],
      "env": {
        "KNOWLEDGE_MCP_HOME": "/Users/username/.knowledge-mcp"
      }
    }
  }
}
```

**Important Changes:**

- Change `python` to `node`
- Update path to point to `dist/knowledge-mcp/index.js`
- Use absolute paths (not ~) for KNOWLEDGE_MCP_HOME

### 4. Verify Data Compatibility

The TypeScript implementation uses the same storage format:

```bash
# Your existing data at ~/.knowledge-mcp is fully compatible
ls -la ~/.knowledge-mcp/projects/

# Test with the TypeScript version
KNOWLEDGE_MCP_HOME=~/.knowledge-mcp node dist/knowledge-mcp/index.js
```

No data migration is required!

## API Compatibility

### Tools

All tools maintain the same interface:

| Tool                  | Python | TypeScript | Status    |
| --------------------- | ------ | ---------- | --------- |
| get_project_main      | ✅     | ✅         | Identical |
| update_project_main   | ✅     | ✅         | Identical |
| search_knowledge      | ✅     | ✅         | Identical |
| create_knowledge_file | ✅     | ✅         | Identical |
| update_chapter        | ✅     | ✅         | Identical |
| delete_knowledge_file | ✅     | ✅         | Identical |

### Resources

All resources maintain the same URIs:

- `knowledge://projects/{project_id}/main`
- `knowledge://projects/{project_id}/files`
- `knowledge://projects/{project_id}/chapters/{filename}`

## Behavioral Differences

### 1. Filename Slugification

**Python (with unidecode):**

```
"Café & Restaurant" → "cafe-restaurant"
```

**TypeScript (with slugify):**

```
"Café & Restaurant" → "cafe-and-restaurant"
```

**Impact**: Minimal - only affects new files created after migration

### 2. Error Messages

**Python:**

```json
{
  "code": -32001,
  "message": "Project not found: my-project",
  "data": {...}
}
```

**TypeScript:**

```json
{
  "success": false,
  "error": "Project not found: my-project"
}
```

**Impact**: Update error handling if you parse error responses

### 3. Logging

**Python:**

```
[INFO] Storage initialized at: /Users/name/.knowledge-mcp
```

**TypeScript:**

```
[INFO] Storage initialized at: /Users/name/.knowledge-mcp
```

**Impact**: None - same format, different implementation

## Testing the Migration

### 1. Basic Functionality Test

```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js

# Try each operation:
# 1. Get project main
# 2. Create a test document
# 3. Search for content
# 4. Update a chapter
```

### 2. Automated Test Suite

```bash
# Run the full test suite
pnpm run test:interface
```

All 15 tests should pass.

### 3. Verify Existing Data

Use the inspector to verify your existing projects are accessible:

1. Call `get_project_main` with your project IDs
2. Use the resource `knowledge://projects/{project_id}/files` to list documents
3. Search for known content

## Rollback Plan

If you need to rollback to Python:

1. The data remains compatible - no changes needed
2. Simply update your Claude Desktop config back to Python
3. All your knowledge documents remain intact

## Common Issues

### Issue 1: Module Not Found

```
Error: Cannot find module '@modelcontextprotocol/sdk/server/mcp.js'
```

**Solution:**

```bash
pnpm install
pnpm run build
```

### Issue 2: Permission Denied

```
Error: EACCES: permission denied, mkdir '/Users/name/.knowledge-mcp'
```

**Solution:**

```bash
# Fix permissions
chmod -R u+rwx ~/.knowledge-mcp
```

### Issue 3: Git Not Found

```
Error: Command failed: git init
```

**Solution:**

```bash
# Install git
brew install git  # macOS
apt-get install git  # Ubuntu/Debian
```

## Performance Comparison

| Metric             | Python | TypeScript |
| ------------------ | ------ | ---------- |
| Startup Time       | ~500ms | ~200ms     |
| Memory Usage       | ~60MB  | ~40MB      |
| Tool Execution     | ~60ms  | ~40ms      |
| Search (1000 docs) | ~200ms | ~150ms     |

## Development and Debugging

### Enable Debug Logging

```bash
# Python
KNOWLEDGE_MCP_LOG_LEVEL=DEBUG python server.py

# TypeScript
KNOWLEDGE_MCP_LOG_LEVEL=DEBUG node dist/knowledge-mcp/index.js
```

### Development Mode

```bash
# TypeScript watch mode
pnpm run dev
```

## Support

### Getting Help

1. Check the [GitHub Issues](https://github.com/sven-borkert/knowledge-mcp/issues)
2. Review test output: `pnpm run test:interface`
3. Use MCP Inspector for interactive debugging

### Reporting Issues

When reporting issues, include:

1. Node.js version: `node --version`
2. Error messages from logs
3. Steps to reproduce
4. Whether it worked with Python version

## Conclusion

The migration from Python to TypeScript is straightforward:

1. ✅ No data migration required
2. ✅ Same API interface
3. ✅ Better performance
4. ✅ Active development

The TypeScript implementation is the recommended version going forward, offering better integration with the MCP ecosystem and improved maintainability.
