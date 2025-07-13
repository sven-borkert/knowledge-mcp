# 🚀 Knowledge MCP Server (TypeScript) - Project Guidelines

> **CRITICAL**: This is your primary guide for working on the Knowledge MCP Server project. Follow these guidelines strictly.

---

## ⚡ IMMEDIATE SETUP (DO THIS FIRST!)

### 1️⃣ Verify Required MCP Servers

```bash
claude mcp list | grep context7              # ✅ MUST show context7
claude mcp list | grep sequential-thinking   # ✅ MUST show sequential-thinking
```

**🚨 IF MISSING, INSTALL NOW:**

```bash
# Install Context7 for library documentation
claude mcp add --transport sse context7 https://mcp.context7.com/sse

# Install Sequential Thinking for problem solving
claude mcp add --scope project sequential-thinking npx @modelcontextprotocol/server-sequential-thinking
```

### 2️⃣ Install Dependencies and Build

```bash
pnpm install            # Install Node.js dependencies
pnpm run build          # Build TypeScript to JavaScript
```

### 3️⃣ Verify Your Location

```bash
pwd  # ALWAYS check location before using relative paths!
```

---

## 📁 PROJECT STRUCTURE

### Directory Layout (Best Practices)

```
knowledge-mcp/
├── src/
│   └── knowledge-mcp/         # TypeScript source
│       ├── index.ts           # Entry point with shebang
│       ├── server.ts          # MCP server implementation
│       ├── utils.ts           # Security & utility functions
│       ├── utils/
│       │   └── tracing.ts     # Request tracing utilities
│       ├── errors/
│       │   ├── index.ts       # Error exports
│       │   └── MCPError.ts    # Standardized error class
│       ├── handlers/
│       │   ├── BaseHandler.ts # Base handler with error handling
│       │   ├── ProjectToolHandler.ts
│       │   ├── KnowledgeToolHandler.ts
│       │   ├── SearchToolHandler.ts
│       │   ├── ChapterToolHandler.ts
│       │   └── ResourceHandler.ts
│       ├── projectId.ts       # Git project identification
│       └── documents.ts       # Document operations
├── dist/                      # Compiled JavaScript (git-ignored)
│   └── knowledge-mcp/         # Built files
├── test/                      # Test suite
│   └── interface-test.ts      # MCP interface tests
├── docs/                      # Documentation
│   ├── README.md              # Documentation index
│   ├── technical-specification.md
│   ├── mcp-interface-test-plan.md
│   └── error-handling-guide.md
├── TODO/                      # Task tracking
│   └── XXX-Description.md
├── node_modules/              # NPM packages (git-ignored)
├── package.json               # Node.js configuration
├── tsconfig.json              # TypeScript configuration
├── CLAUDE.md                  # This file
├── README.md                  # Project documentation
└── .gitignore                 # Git ignore patterns
```

### Import Rules

- **ALL imports MUST be at the top of the file** - NO exceptions!
- **Use ES modules**: `import { name } from './module.js'` (note the .js extension)
- **Always** add type annotations to function signatures
- **Never** place imports inside functions or methods
- **Use** type imports when only importing types: `import type { TypeName } from './module.js'`

---

## 🔥 ERROR HANDLING & DEBUGGING

### Standardized Error System

The project uses a comprehensive error handling system with:

- **Typed Error Codes**: All errors use standardized `MCPErrorCode` enum values
- **Request Tracing**: Every request gets a unique trace ID for debugging
- **Consistent Responses**: All errors return the same response structure

### Error Response Format

```json
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

### Common Error Codes

- `PROJECT_NOT_FOUND` - Project doesn't exist
- `DOCUMENT_NOT_FOUND` - Knowledge file not found
- `FILE_ALREADY_EXISTS` - File already exists
- `FILE_SYSTEM_ERROR` - File operation failed
- `GIT_ERROR` - Git operation failed
- `INVALID_INPUT` - Input validation failed

### Error Handling Best Practices

```typescript
// ✅ GOOD: Use MCPError with proper code and context
throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${projectId} not found`, {
  projectId,
  traceId: context.traceId,
});

// ❌ BAD: Generic error without context
throw new Error('Project not found');
```

### Debugging with Trace IDs

- All log entries include trace IDs
- Error responses include trace IDs in context
- Use trace ID to correlate logs: `grep "traceId" ~/.knowledge-mcp/activity.log`
- Request duration tracked for performance debugging

---

## 🧪 CODE QUALITY & TESTING

### TypeScript Build

```bash
# Build the project
pnpm run build

# Type check without building
pnpm run type-check

# Development mode with auto-rebuild
pnpm run dev
```

### Automated Code Quality Checks

```bash
# Run all static analysis (type checking + linting + formatting)
pnpm run analyze

# Run all static analysis with auto-fix
pnpm run analyze:fix

# Individual tools:
pnpm run type-check     # TypeScript type checking
pnpm run lint          # ESLint analysis
pnpm run lint:fix      # ESLint with auto-fix
pnpm run format        # Prettier formatting
pnpm run format:check  # Check formatting without changes

# Quick fix everything:
pnpm run fix:all
```

### Quality Tools Used

- **TypeScript**: Type checking and compilation
- **ESLint**: Comprehensive linting with TypeScript support
  - Detects type safety issues (no-explicit-any, unsafe operations)
  - Enforces best practices (consistent imports, no unused variables)
  - Auto-fixes many issues with --fix
- **Prettier**: Code formatting (auto-fixes all formatting)
- **eslint-plugin-unused-imports**: Removes unused imports automatically
- **@typescript-eslint**: TypeScript-specific linting rules

### Testing Requirements

```bash
# Run interface tests
pnpm run test:interface

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js

# IMPORTANT: All tests MUST pass before committing!
```

### Before Every Commit

1. ✅ **MANDATORY**: Run `pnpm run fix:all` to auto-fix all code issues
2. ✅ Ensure TypeScript compiles with `pnpm run build`
3. ✅ Ensure all tests pass with `pnpm run test:interface`
4. ✅ Update TODO status flags if tasks completed
5. ✅ NO AI/Claude references in code or commits
6. ✅ Verify all linting passes (auto-fix handles most issues)

---

## 🤖 AUTOMATIC MCP USAGE

### 📚 ALWAYS Use Context7 When:

- Working with ANY external library (@modelcontextprotocol/sdk, zod, etc.)
- User mentions: library, module, framework, package, API, function, method
- Keywords: "how to use", "what is", "syntax for", "parameters of"
- Before writing ANY import statement
- Debugging library-related errors

**HOW TO USE:**

```typescript
// Step 1: Resolve library ID
mcp__context7__resolve-library-id "@modelcontextprotocol/sdk"

// Step 2: Get documentation
mcp__context7__get-library-docs  // with ID from step 1
```

### 🧠 ALWAYS Use Sequential Thinking When:

- Implementing ANY TODO file
- Writing/modifying ANY code
- Planning multi-step tasks
- Analyzing problems
- Making architectural decisions

**HOW TO USE:** Just start using it - it's automatic!

---

## 📋 TODO MANAGEMENT

### File Structure

- Location: `TODO/` directory
- Naming: `XXX-Description.md` (e.g., `001-KnowledgeMCPImplementation.md`)

### Status Flags

```markdown
🟧 TASK planned - Not started
🟩 TASK completed - Successfully completed
🟥 TASK failed - Failed or blocked
```

### Workflow Rules

1. **Read** entire TODO file when starting task XXX
2. **Execute** tasks sequentially from top to bottom
3. **Update** status flag immediately after completing each task
4. **Continue** until ALL tasks complete - NEVER stop halfway
5. **Verify**: `grep "🟧 TASK planned" TODO/XXX-*.md` should return nothing

---

## 🛠️ DEVELOPMENT COMMANDS

### Initial Setup

```bash
# Clone repository
git clone https://github.com/sven-borkert/knowledge-mcp.git
cd knowledge-mcp

# Install dependencies
pnpm install

# Build the project
pnpm run build
```

### Development Workflow

```bash
# Development mode with auto-reload
pnpm run dev

# Build TypeScript
pnpm run build

# Type checking
pnpm run type-check

# Run linter
pnpm run lint

# Format code
pnpm run format

# Run tests
pnpm run test:interface

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/knowledge-mcp/index.js
```

### Running the Server

```bash
# Start the server
pnpm start

# Or run directly
node dist/knowledge-mcp/index.js
```

---

## 🏗️ ARCHITECTURE OVERVIEW

### Core Components

#### 1. **server.ts** - MCP Server Implementation

- Uses @modelcontextprotocol/sdk/server/mcp.js
- Implements McpServer class with tools and resources
- Provides JSON-RPC 2.0 protocol support
- Git-aware project identification

#### 2. **Storage Structure**

```
~/.knowledge-mcp/
├── index.json                 # Project name to directory mapping
└── projects/
    └── {project-slug}/        # Project identified by git remote or name
        ├── main.md            # Main project instructions
        └── knowledge/         # Knowledge documents
            └── *.md           # Individual knowledge files
```

#### 3. **Security Features**

- ✅ Path validation (prevents directory traversal)
- ✅ Filename sanitization (safe slugification)
- ✅ Safe YAML loading (no code execution)
- ✅ Input validation with Zod schemas
- ✅ Atomic file writes (temp file + rename)

#### 4. **Activity Logging & Tracing**

- ✅ All method calls logged to `activity.log`
- ✅ Unique trace IDs for every request
- ✅ Request duration tracking
- ✅ Tracks project IDs, filenames, and success/failure
- ✅ Content excluded for privacy protection
- ✅ Log file automatically added to `.gitignore`

#### 5. **Git Integration**

- ✅ Automatic commits for all write operations
- ✅ Descriptive commit messages
- ✅ Automatic push to origin/main when configured
- ✅ Graceful handling of push failures
- ✅ Works offline (push failures don't break operations)

### API Design

#### Tools (Actions)

- `get_project_main` - Retrieve main.md content
- `update_project_main` - Update main.md content
- `update_project_section` - Update specific section in main.md
- `remove_project_section` - Remove specific section from main.md
- `search_knowledge` - Search across knowledge files
- `create_knowledge_file` - Create new knowledge document
- `update_chapter` - Update specific chapter in document
- `remove_chapter` - Remove specific chapter from document
- `get_knowledge_file` - Retrieve complete document with all content
- `delete_knowledge_file` - Remove knowledge document

#### Resources (Read-Only)

- `knowledge://projects/{project_id}/main` - Read main.md
- `knowledge://projects/{project_id}/files` - List knowledge files
- `knowledge://projects/{project_id}/chapters/{filename}` - List chapters

---

## 🔒 SECURITY REQUIREMENTS

### Path Validation

```typescript
// ALWAYS validate paths before file operations
const validatedPath = validatePath(basePath, userInput);
```

### Filename Sanitization

```typescript
// ALWAYS sanitize filenames
const safeFilename = slugify(userInput);
```

### YAML Safety

```typescript
// ALWAYS use safe load for YAML
const data = yaml.load(content); // ✅ js-yaml uses safe loading by default
// Front-matter package also uses safe loading
```

---

## 📝 COMMIT GUIDELINES

### Commit Message Format

```
<type>: <description>

- Detail 1
- Detail 2
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Test additions/updates
- `docs`: Documentation updates
- `chore`: Maintenance tasks

### Rules

- ❌ NO AI/Claude references
- ❌ NO generated code comments
- ✅ Clear, concise descriptions
- ✅ Reference TODO items when applicable

---

## 🚨 CRITICAL REMINDERS

1. **ALWAYS** run `pnpm install` before starting work
2. **ALWAYS** run `pnpm run build` before testing
3. **ALWAYS** ensure 100% test pass rate
4. **ALWAYS** keep imports at the top of TypeScript files
5. **ALWAYS** use Sequential Thinking for implementation
6. **ALWAYS** use Context7 for library documentation
7. **NEVER** commit with failing tests
8. **NEVER** include AI references in code/commits
9. **NEVER** skip security validations
10. **NEVER** place imports inside functions or methods

---

## 📞 HELP & SUPPORT

- **Project Issues**: Report at https://github.com/sven-borkert/knowledge-mcp/issues
- **Documentation**: Check `docs/technical-specification.md`
- **Test Results**: Run `pnpm run test:interface`
- **TypeScript Docs**: https://www.typescriptlang.org/docs/

Remember: This project implements security-critical functionality. Always prioritize security over convenience!
