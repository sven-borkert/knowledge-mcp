# 🚀 Knowledge MCP Server - Project Guidelines

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
claude mcp add --scope project sequential-thinking npx -y @modelcontextprotocol/server-sequential-thinking
```

### 2️⃣ Activate Python Virtual Environment
```bash
source venv/bin/activate  # ⚠️ ALWAYS activate before ANY Python work!
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
│   └── knowledge_mcp/         # Main package
│       ├── __init__.py
│       ├── server.py          # MCP server implementation
│       ├── utils.py           # Security & utility functions
│       ├── project_id.py      # Git project identification
│       └── documents.py       # Document operations
├── tests/                     # Test suite
│   ├── __init__.py
│   ├── test_utils.py
│   ├── test_project_id.py
│   ├── test_documents.py
│   └── test_server.py
├── docs/                      # Documentation
│   └── technical-specification.md
├── TODO/                      # Task tracking
│   └── XXX-Description.md
├── venv/                      # Virtual environment (git-ignored)
├── requirements.txt           # Python dependencies
├── check_code_quality.py      # Code quality automation
├── CLAUDE.md                  # This file
├── README.md
└── .gitignore
```

### Import Rules
- **ALL imports MUST be at the top of the file** - NO exceptions!
- **Within `src/knowledge_mcp/`**: Use relative imports (`from .utils import ...`)
- **In tests**: Use absolute imports (`from knowledge_mcp.utils import ...`)
- **Always** add type hints to function signatures
- **Never** place imports inside functions or methods

---

## 🧪 CODE QUALITY & TESTING

### Automated Code Quality Checks
```bash
# ALWAYS use --fix to automatically fix issues!
python check_code_quality.py --fix

# Run checks without auto-fix (to see what would change)
python check_code_quality.py

# Skip slow pylint checks during development
python check_code_quality.py --fix --no-pylint

# Check specific files (rarely needed - scans whole project by default)
python check_code_quality.py --fix src/knowledge_mcp/server.py tests/test_server.py
```

### Quality Tools Used
- **Black**: Code formatting (auto-fixes with --fix)
- **isort**: Import sorting and organization (auto-fixes with --fix)
  - Automatically moves imports to top of file
  - Removes unused imports
  - Groups and sorts imports properly
- **Ruff**: Fast linting (auto-fixes many issues with --fix)
- **MyPy**: Type checking (no auto-fix)
- **Pylint**: Comprehensive code analysis (no auto-fix)

### Important Code Quality Rules
- ✅ **Imports MUST be at the top** - isort will fix this automatically
- ✅ **No unused imports** - Ruff will remove them
- ✅ **Consistent formatting** - Black ensures this
- ✅ **Type hints required** - MyPy validates this
- ✅ **The script automatically scans ALL Python files** - no manual file listing needed

### Testing Requirements
```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ -v --cov=knowledge_mcp --cov-report=html

# Run specific test file
pytest tests/test_documents.py -v

# IMPORTANT: All tests MUST pass before committing!
```

### Before Every Commit
1. ✅ **MANDATORY**: Run `python check_code_quality.py --fix` to auto-fix all issues
2. ✅ Ensure all tests pass with `pytest tests/ -v`
3. ✅ Update TODO status flags if tasks completed
4. ✅ NO AI/Claude references in code or commits
5. ✅ Verify all imports are at top of files (isort does this automatically)

---

## 🤖 AUTOMATIC MCP USAGE

### 📚 ALWAYS Use Context7 When:
- Working with ANY external library (FastMCP, pytest, yaml, etc.)
- User mentions: library, module, framework, package, API, function, method
- Keywords: "how to use", "what is", "syntax for", "parameters of"
- Before writing ANY import statement
- Debugging library-related errors

**HOW TO USE:**
```python
# Step 1: Resolve library ID
mcp__context7__resolve-library-id "fastmcp"

# Step 2: Get documentation
mcp__context7__get-library-docs  # with ID from step 1
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
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Development Workflow
```bash
# ALWAYS run quality checks with auto-fix first!
python check_code_quality.py --fix

# Run all tests (with proper PYTHONPATH)
PYTHONPATH=src pytest tests/ -v

# Start MCP development server
mcp dev src/knowledge_mcp/server.py

# Test with MCP Inspector
npx @modelcontextprotocol/inspector python src/knowledge_mcp/server.py
```

### Deployment
```bash
# Build Docker image
docker build -t knowledge-mcp .

# Run with docker-compose
docker-compose up -d
```

---

## 🏗️ ARCHITECTURE OVERVIEW

### Core Components

#### 1. **server.py** - MCP Server Implementation
- Uses FastMCP framework
- Implements JSON-RPC 2.0 protocol
- Provides Tools (actions) and Resources (read operations)
- Git-aware project identification

#### 2. **Storage Structure**
```
~/.knowledge-mcp/
└── projects/
    └── {git-remote-url}/      # Project identified by git remote
        ├── main.md            # Main project instructions
        └── knowledge/         # Knowledge documents
            └── *.md           # Individual knowledge files
```

#### 3. **Security Features**
- ✅ Path validation (prevents directory traversal)
- ✅ Filename sanitization (safe slugification)
- ✅ Safe YAML loading (no code execution)
- ✅ Input validation on all user data
- ✅ Atomic file writes (temp file + rename)

### API Design

#### Tools (Actions)
- `get_project_main` - Retrieve main.md content
- `update_project_main` - Update main.md content
- `search_knowledge` - Search across knowledge files
- `create_knowledge_file` - Create new knowledge document
- `update_chapter` - Update specific chapter in document
- `delete_knowledge_file` - Remove knowledge document

#### Resources (Read-Only)
- `knowledge://projects/{project_id}/main` - Read main.md
- `knowledge://projects/{project_id}/files` - List knowledge files
- `knowledge://projects/{project_id}/chapters/{filename}` - List chapters

---

## 🔒 SECURITY REQUIREMENTS

### Path Validation
```python
# ALWAYS validate paths before file operations
validated_path = validate_path(base_dir, user_input)
```

### Filename Sanitization
```python
# ALWAYS sanitize filenames
safe_filename = slugify_filename(user_input)
```

### YAML Safety
```python
# ALWAYS use safe_load for YAML
data = yaml.safe_load(content)  # ✅
# NEVER use yaml.load()         # ❌
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

1. **ALWAYS** activate virtual environment before Python work
2. **ALWAYS** run `python check_code_quality.py --fix` before committing
3. **ALWAYS** ensure 100% test pass rate
4. **ALWAYS** keep imports at the top of Python files
5. **ALWAYS** use Sequential Thinking for implementation
6. **ALWAYS** use Context7 for library documentation
7. **NEVER** commit with failing tests
8. **NEVER** include AI references in code/commits
9. **NEVER** skip security validations
10. **NEVER** place imports inside functions or methods

---

## 📞 HELP & SUPPORT

- **Project Issues**: Report at https://github.com/anthropics/claude-code/issues
- **Documentation**: Check `docs/technical-specification.md`
- **Test Coverage**: Run `pytest --cov=knowledge_mcp --cov-report=html`

Remember: This project implements security-critical functionality. Always prioritize security over convenience!