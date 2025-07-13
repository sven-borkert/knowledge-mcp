# Error Handling Guide - Knowledge MCP Server

## Quick Reference

### Error Response Format

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "context": {
    "traceId": "ab462321ed4c1d33399b20bf504af8f2",
    "project_id": "my-project",
    "filename": "api-guide.md",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

## Common Error Codes

### General Errors

| Code             | Description             | Example                              |
| ---------------- | ----------------------- | ------------------------------------ |
| `UNKNOWN_ERROR`  | Unexpected system error | Uncaught exception or system failure |
| `INTERNAL_ERROR` | Internal server error   | Server logic or dependency failure   |

### Validation Errors

| Code                 | Description                | Example                                 |
| -------------------- | -------------------------- | --------------------------------------- |
| `INVALID_INPUT`      | Input validation failed    | Missing required fields                 |
| `INVALID_PROJECT_ID` | Invalid project identifier | Empty or malformed project ID           |
| `INVALID_FILENAME`   | Invalid filename format    | Filename with illegal characters        |
| `INVALID_PATH`       | Path validation failed     | Directory traversal attempt             |
| `INVALID_CONTENT`    | Content validation failed  | Malformed markdown or invalid structure |

### Resource Errors

| Code                 | Description                        | Example                                      |
| -------------------- | ---------------------------------- | -------------------------------------------- |
| `NOT_FOUND`          | Generic resource not found         | Requested resource doesn't exist             |
| `PROJECT_NOT_FOUND`  | Project doesn't exist              | `get_project_main` for non-existent project  |
| `DOCUMENT_NOT_FOUND` | Knowledge file not found           | `get_knowledge_file` for missing file        |
| `CHAPTER_NOT_FOUND`  | Chapter not found (case-sensitive) | `update_chapter` with wrong title            |
| `SECTION_NOT_FOUND`  | Section not found in main.md       | `update_project_section` with missing header |

### File System Errors

| Code                    | Description             | Example                                    |
| ----------------------- | ----------------------- | ------------------------------------------ |
| `FILE_SYSTEM_ERROR`     | File operation failed   | Temporary file lock, disk full             |
| `ACCESS_DENIED`         | Permission denied       | No write permissions                       |
| `FILE_ALREADY_EXISTS`   | File already exists     | `create_knowledge_file` with existing name |
| `PROJECT_DELETE_FAILED` | Project deletion failed | Unable to remove project directory         |

### Git Errors

| Code                 | Description                  | Example                                 |
| -------------------- | ---------------------------- | --------------------------------------- |
| `GIT_ERROR`          | Git operation failed         | Git repository corruption               |
| `GIT_COMMAND_FAILED` | Git command execution failed | Git command returned non-zero exit code |

### Search Errors

| Code                   | Description                 | Example                               |
| ---------------------- | --------------------------- | ------------------------------------- |
| `SEARCH_ERROR`         | Search operation failed     | Search index corruption or failure    |
| `INVALID_SEARCH_QUERY` | Invalid search query format | Empty query or malformed search terms |

## Git Pull Errors

Git pull operations during startup may fail but don't interrupt server functionality. These are logged as warnings:

### Network-Related Issues

- **DNS Resolution Failures**: Cannot resolve git remote hostname
- **Connection Timeouts**: Network timeout during fetch operation
- **Certificate Issues**: SSL/TLS certificate validation failures
- **Firewall Blocks**: Corporate firewall blocking git protocol

### Authentication Issues

- **Invalid Credentials**: Username/password authentication failed
- **SSH Key Issues**: SSH key not found or invalid permissions
- **Token Expiration**: GitHub/GitLab personal access token expired
- **Permission Denied**: No read access to remote repository

### Repository Issues

- **Remote Not Found**: Git remote "origin" not configured
- **Branch Not Found**: Remote "main" branch doesn't exist
- **Force Push Conflicts**: Remote history has been rewritten
- **Empty Repository**: Remote repository has no commits

### Handling Pull Failures

When git pull fails during startup:

1. **Warning is logged** - Operation failure is recorded in server logs
2. **Server continues** - MCP server starts normally despite pull failure
3. **Local operation** - Server works with existing local knowledge
4. **Auto-retry** - Next server restart will attempt pull again

Example log entries:

```
No git remote configured, skipping pull
Pulling latest changes from origin/main...
Git pull failed: fatal: unable to access 'https://github.com/user/repo.git/': Could not resolve host: github.com
```

## Debugging with Trace IDs

### Finding Related Logs

```bash
# Find all logs for a specific trace ID
grep "traceId.*ab462321ed4c1d33399b20bf504af8f2" ~/.knowledge-mcp/activity.log

# Find all failed requests
grep '"success":false' ~/.knowledge-mcp/activity.log

# Find specific error codes
grep '"errorCode":"FILE_ALREADY_EXISTS"' ~/.knowledge-mcp/activity.log
```

### Log Entry Example

```json
{
  "timestamp": "2025-07-12T09:52:27.987Z",
  "method": "create_knowledge_file",
  "success": false,
  "project_id": "test-project-1",
  "filename": "api-guide",
  "error": "Knowledge file api-guide.md already exists",
  "traceId": "e7c5a6e5cbf001b5e8e0e524c5fcfc4d",
  "duration": 23,
  "errorCode": "FILE_ALREADY_EXISTS",
  "errorContext": {
    "project_id": "test-project-1",
    "filename": "api-guide.md",
    "traceId": "e7c5a6e5cbf001b5e8e0e524c5fcfc4d"
  }
}
```

## Error Handling in Code

### Creating Errors

```typescript
// Import error utilities
import { MCPError, MCPErrorCode } from '../errors/index.js';

// Throw typed errors with context
throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${projectId} not found`, {
  projectId,
  traceId: context.traceId,
  method: 'get_project_main',
});
```

### Handling Errors in Handlers

```typescript
// BaseHandler provides error handling utilities
class MyHandler extends BaseHandler {
  myMethod(params: MyParams): string {
    // Create request context for tracing
    const context = this.createContext('my_method', params);

    try {
      // Your implementation here

      // Log success
      this.logSuccess('my_method', params, context);
      return this.formatSuccessResponse({ data: 'result' });
    } catch (error) {
      // Convert to MCPError if needed
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(MCPErrorCode.INTERNAL_ERROR, `Failed: ${error.message}`, {
              ...params,
              traceId: context.traceId,
            });

      // Log error with full context
      this.logError('my_method', params, mcpError, context);

      // Return standardized error response
      return this.formatErrorResponse(mcpError, context);
    }
  }
}
```

## Best Practices

### DO ✅

1. **Use specific error codes** - Choose the most specific MCPErrorCode
2. **Include context** - Add relevant data to help debugging
3. **Include trace ID** - Always pass context.traceId in errors
4. **Log all errors** - Use BaseHandler's logError method
5. **Validate early** - Check inputs before operations

### DON'T ❌

1. **Don't use generic errors** - Avoid `throw new Error()`
2. **Don't expose sensitive data** - Keep file contents out of errors
3. **Don't swallow errors** - Always handle errors appropriately
4. **Don't ignore error context** - Always propagate trace IDs
5. **Don't catch without logging** - Always log errors for debugging

## Testing Error Handling

### Simulating Errors

```typescript
// Test file already exists
await createKnowledgeFile({ filename: 'existing.md', ... });
await createKnowledgeFile({ filename: 'existing.md', ... }); // ERROR

// Test invalid input
await updateChapter({
  chapter_title: 'Non-Existent Chapter',  // ERROR
  ...
});

// Test path traversal protection
await getProjectMain({
  project_id: '../../../etc/passwd'  // ERROR: Invalid path
});
```

### Checking Error Responses

```typescript
const response = JSON.parse(result);
if (!response.success) {
  console.log('Error Code:', response.code);
  console.log('Trace ID:', response.context.traceId);
  console.log('Context:', response.context);
}
```
