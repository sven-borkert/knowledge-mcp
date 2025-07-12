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

| Code                  | Description                        | Retryable | Example                                      |
| --------------------- | ---------------------------------- | --------- | -------------------------------------------- |
| `PROJECT_NOT_FOUND`   | Project doesn't exist              | No        | `get_project_main` for non-existent project  |
| `DOCUMENT_NOT_FOUND`  | Knowledge file not found           | No        | `get_knowledge_file` for missing file        |
| `CHAPTER_NOT_FOUND`   | Chapter not found (case-sensitive) | No        | `update_chapter` with wrong title            |
| `SECTION_NOT_FOUND`   | Section not found in main.md       | No        | `update_project_section` with missing header |
| `FILE_ALREADY_EXISTS` | File already exists                | No        | `create_knowledge_file` with existing name   |
| `FILE_SYSTEM_ERROR`   | File operation failed              | Yes (3x)  | Temporary file lock, disk full               |
| `GIT_ERROR`           | Git operation failed               | Yes (3x)  | Git command failure                          |
| `STORAGE_ERROR`       | Storage operation failed           | Yes (3x)  | Storage initialization issues                |
| `INVALID_INPUT`       | Input validation failed            | No        | Missing required fields                      |
| `INVALID_PATH`        | Path validation failed             | No        | Directory traversal attempt                  |
| `ACCESS_DENIED`       | Permission denied                  | No        | No write permissions                         |

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

## Automatic Retry Mechanism

### Configuration

```typescript
const retryOptions = {
  maxAttempts: 3, // Number of retry attempts
  initialDelay: 100, // First retry after 100ms
  maxDelay: 5000, // Max delay between retries
  backoffMultiplier: 2, // Double delay each retry
  retryableErrors: [
    // Which errors to retry
    MCPErrorCode.FILE_SYSTEM_ERROR,
    MCPErrorCode.GIT_ERROR,
    MCPErrorCode.STORAGE_ERROR,
  ],
};
```

### Using Retry Wrapper

```typescript
import { withRetry } from '../utils/retry.js';

// Wrap async operations
const result = await withRetry(async () => {
  return await performRiskyOperation();
}, retryOptions);

// For sync operations
const syncResult = withRetrySync(() => performSyncOperation(), retryOptions);
```

### File System Specific Retries

The following Node.js error codes are automatically retried:

- `EAGAIN` - Resource temporarily unavailable
- `EBUSY` - Resource busy
- `EMFILE` - Too many open files
- `ENFILE` - Too many open files in system

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
3. **Don't retry non-transient errors** - Only retry file/git/storage errors
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
