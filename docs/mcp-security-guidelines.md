# MCP Security Guidelines

## Abstraction Boundary Security

The Knowledge MCP Server maintains strict abstraction boundaries to prevent information leakage about internal implementation details.

### Security Principles

1. **Internal Storage Abstraction**: The MCP interface should never expose internal folder names, paths, or storage structure details
2. **User-Facing IDs Only**: All API responses should only contain user-provided project IDs, never internal slugified folder names
3. **Path Security**: Error messages and responses must never leak filesystem paths or internal directory structures

### Implementation Requirements

#### ✅ Correct Patterns

```typescript
// ✅ Good: Use originalId (user-facing) in responses
const [originalId, projectPath] = getProjectDirectory(storagePath, project_id);
return this.formatSuccessResponse({
  message: `Project ${originalId} updated successfully`,
});

// ✅ Good: Error messages use user-facing IDs
throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} does not exist`);
```

#### ❌ Incorrect Patterns

```typescript
// ❌ Bad: Exposing internal folder names
return this.formatSuccessResponse({
  message: `Project stored in ${projectPath}`, // Leaks internal path
});

// ❌ Bad: Using slugified names in responses
const slugified = slugify(project_id);
return { message: `Created ${slugified}` }; // Should use original ID

// ❌ Bad: File paths in error messages
throw new Error(`File not found at ${filePath}`); // Leaks internal structure
```

### Utils Layer Responsibilities

The `utils.js` functions maintain the abstraction boundary:

- `getProjectDirectory()` returns `[originalId, internalPath]` tuples
- `createProjectEntry()` handles ID-to-folder mapping internally
- `deleteProjectDirectory()` removes mappings without exposing internals

### Handler Layer Responsibilities

MCP handlers must:

1. **Use destructuring correctly**: `const [originalId, projectPath] = getProjectDirectory(...)`
2. **Expose only originalId**: Never include `projectPath` in responses
3. **Validate inputs**: Use schema validation to prevent path injection
4. **Sanitize errors**: Ensure error messages don't leak internal details

### Testing Requirements

All handlers must pass abstraction boundary tests that verify:

- No internal folder names in API responses
- No filesystem paths in error messages
- No storage structure details exposed
- User-facing project IDs preserved throughout operations

### Security Validation

The test suite includes `11-abstraction-boundary.test.ts` which validates:

- Project operations hide internal folder mapping
- Error messages don't leak filesystem paths
- Search results don't expose storage structure
- Auto-commit messages use user-facing IDs
- All responses maintain abstraction boundary

### Implementation Checklist

When adding new MCP tools:

- [ ] Use `getProjectDirectory()` or `createProjectEntry()` for path resolution
- [ ] Destructure as `[originalId, projectPath]` and only expose `originalId`
- [ ] Validate all error messages don't contain internal paths
- [ ] Add abstraction boundary tests for new functionality
- [ ] Ensure responses use user-provided identifiers only

### Security Benefits

This abstraction boundary provides:

1. **Information Security**: Prevents leakage of internal implementation details
2. **Implementation Flexibility**: Internal storage can change without breaking API contracts
3. **Attack Surface Reduction**: Limits exposure of filesystem structure
4. **Consistent Interface**: All tools present the same abstraction level to users

### Monitoring

The logging system uses trace IDs and only logs user-facing project IDs, maintaining the abstraction boundary even in debug information.
