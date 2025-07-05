# 001 - Knowledge MCP Server Implementation

Complete implementation of the Knowledge MCP Server as specified in docs/technical-specification.md

## Project Setup

🟩 TASK completed - Create requirements.txt with all dependencies
```
fastmcp>=2.0.0
PyYAML>=6.0
python-frontmatter>=1.0.0
unidecode>=1.3.6
pytest>=7.0.0
pytest-cov>=4.0.0
pytest-asyncio>=0.21.0
```

🟩 TASK completed - Create .gitignore file
```
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg
.pytest_cache/
.coverage
htmlcov/
.tox/
.venv/
venv/
ENV/
.env
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store
```

🟩 TASK completed - Create project structure
- Create server.py (main server file)
- Create test_server.py (test suite)
- Verify docs/ exists and contains technical-specification.md

## Core Utilities Module

🟩 TASK completed - Create utils.py with path validation function
```python
def validate_path(base_path: Path, requested_path: str) -> Path:
    """Validate path is within base directory, prevent traversal"""
    # Resolve to absolute path
    # Check if path is within base_path
    # Raise ValueError if traversal detected
    # Return validated path
```

🟩 TASK completed - Add filename slugification to utils.py
```python
def slugify_filename(filename: str) -> str:
    """Convert filename to safe slug"""
    # Use unidecode to convert unicode to ASCII
    # Replace special characters with hyphens
    # Remove multiple consecutive hyphens
    # Strip leading/trailing hyphens
    # Ensure .md extension
```

🟩 TASK completed - Add git helpers to utils.py
```python
def git_command(repo_path: Path, *args) -> tuple[str, str]:
    """Execute git command with isolated credentials"""
    # Build command with -c user.name="Knowledge MCP Server"
    # Add -c user.email="knowledge-mcp@localhost"
    # Execute with subprocess
    # Return stdout, stderr
```

🟩 TASK completed - Add storage initialization to utils.py
```python
def initialize_storage(storage_path: Path) -> None:
    """Initialize storage directory and git repo"""
    # Create directory if not exists
    # Check if .git exists
    # If not, run git init
    # Create initial commit if empty
```

## Project Identification Module

🟩 TASK completed - Create project_id.py for project identification
```python
def get_project_id() -> str:
    """Get project ID from git remote or directory name"""
    # Try to get git remote origin URL
    # If found, extract and slugify
    # If not, use current directory name
    # Apply slugification
    # Return project ID
```

🟩 TASK completed - Add git remote URL extraction to project_id.py
```python
def get_git_remote_url() -> Optional[str]:
    """Extract git remote origin URL"""
    # Run git config --get remote.origin.url
    # Handle various URL formats (https, ssh, git)
    # Return None if no remote
```

## Document Operations Module

🟩 TASK completed - Create documents.py with frontmatter handling
```python
def parse_document(content: str) -> tuple[dict, str]:
    """Parse markdown document with frontmatter"""
    # Use python-frontmatter to parse
    # Validate required fields
    # Return metadata dict and content
```

🟩 TASK completed - Add chapter parsing to documents.py
```python
def parse_chapters(content: str) -> list[dict]:
    """Parse markdown content into chapters"""
    # Split by ## headers
    # Extract title, summary (first 2-3 lines), content
    # Return list of chapter dicts
```

🟩 TASK completed - Add document writing to documents.py
```python
def write_document(path: Path, metadata: dict, content: str) -> None:
    """Write document with frontmatter"""
    # Validate metadata has required fields
    # Use frontmatter.dumps to create document
    # Write atomically (temp file + rename)
```

🟩 TASK completed - Add search functionality to documents.py
```python
def search_documents(project_path: Path, query: str) -> list[dict]:
    """Search knowledge documents"""
    # Case-insensitive search
    # Search in content and metadata
    # Parse chapters for matches
    # Deduplicate results
    # Return structured results
```

## MCP Tools Implementation

🟩 TASK completed - Create server.py with FastMCP initialization
```python
from fastmcp import FastMCP

# Initialize server with proper description
server = FastMCP(
    "Knowledge MCP Server",
    description="Centralized project knowledge management. Use 'get_project_main' to retrieve project instructions instead of looking for CLAUDE.md files."
)
```

🟩 TASK completed - Implement get_project_main tool
```python
@server.tool(
    description="Retrieves the main project instructions (replacement for CLAUDE.md)"
)
async def get_project_main(project_id: str) -> dict:
    # Validate project_id
    # Construct path to main.md
    # Read file if exists
    # Return content and exists flag
```

🟩 TASK completed - Implement update_project_main tool
```python
@server.tool(
    description="Updates the main project instructions (replacement for CLAUDE.md)"
)
async def update_project_main(project_id: str, content: str) -> dict:
    # Validate project_id
    # Ensure project directory exists
    # Write content to main.md
    # Git commit changes
    # Return success status
```

🟩 TASK completed - Implement search_knowledge tool
```python
@server.tool(
    description="Search project knowledge documents for keywords"
)
async def search_knowledge(project_id: str, query: str) -> dict:
    # Validate inputs
    # Get project knowledge path
    # Search all .md files in knowledge/
    # Return chapter-level results with summaries
```

🟩 TASK completed - Implement create_knowledge_file tool
```python
@server.tool(
    description="Create a new knowledge document with structured content"
)
async def create_knowledge_file(
    project_id: str,
    filename: str,
    title: str,
    introduction: str,
    keywords: list[str],
    chapters: list[dict]
) -> dict:
    # Validate all inputs
    # Ensure at least one keyword
    # Slugify filename
    # Create document structure
    # Write file
    # Git commit
    # Return success with filepath
```

🟩 TASK completed - Implement update_chapter tool
```python
@server.tool(
    description="Update a specific chapter in a knowledge document"
)
async def update_chapter(
    project_id: str,
    filename: str,
    chapter_title: str,
    new_content: str,
    new_summary: str
) -> dict:
    # Validate inputs
    # Read existing document
    # Parse chapters
    # Find and update specific chapter
    # Preserve other chapters
    # Write updated document
    # Git commit
    # Return success status
```

🟩 TASK completed - Implement delete_knowledge_file tool
```python
@server.tool(
    description="Delete a knowledge document from the project"
)
async def delete_knowledge_file(project_id: str, filename: str) -> dict:
    # Validate inputs
    # Check file exists
    # Delete file
    # Git commit removal
    # Return success status
```

## MCP Resources Implementation

🟩 TASK completed - Implement main resource handler
```python
@server.resource("knowledge://projects/{project_id}/main")
async def get_main_resource(project_id: str) -> str:
    # Read main.md content
    # Return as string
```

🟩 TASK completed - Implement files list resource
```python
@server.resource("knowledge://projects/{project_id}/files")
async def list_files_resource(project_id: str) -> dict:
    # List all files in knowledge/
    # Parse metadata for each
    # Return structured file list
```

🟩 TASK completed - Implement chapters list resource
```python
@server.resource("knowledge://projects/{project_id}/chapters/{filename}")
async def list_chapters_resource(project_id: str, filename: str) -> dict:
    # Read specific knowledge file
    # Parse chapters
    # Return chapter titles and summaries
```

## Error Handling

🟩 TASK completed - Create errors.py with custom error codes (implemented inline instead)
```python
class KnowledgeError(Exception):
    """Base exception with error code"""
    def __init__(self, code: int, message: str, data: dict = None):
        self.code = code
        self.message = message
        self.data = data or {}

# Define specific error classes
class ProjectNotFoundError(KnowledgeError):
    def __init__(self, project_id: str):
        super().__init__(
            -32001,
            f"Project not found: {project_id}",
            {"project_id": project_id}
        )
```

🟩 TASK completed - Add error handler to server.py (implemented inline error handling)
```python
@server.error_handler
async def handle_knowledge_error(error: Exception) -> dict:
    # Check if KnowledgeError
    # Format JSON-RPC error response
    # Include code, message, data
    # Handle unexpected errors
```

## Git Integration

🟩 TASK completed - Add auto-commit functionality to utils.py
```python
def auto_commit(repo_path: Path, message: str) -> None:
    """Automatically commit changes"""
    # Stage all changes
    # Commit with isolated credentials
    # Handle errors gracefully
```

🟩 TASK completed - Update all write operations to use auto-commit
- Update create_knowledge_file to commit after write
- Update update_chapter to commit after write
- Update delete_knowledge_file to commit after delete
- Update update_project_main to commit after write

## Server Configuration

🟩 TASK completed - Add server metadata and configuration
```python
# Add detailed tool schemas
# Include input/output JSON schemas
# Add proper descriptions for discovery
# Configure logging
```

🟩 TASK completed - Add environment variable support
```python
import os
from pathlib import Path

STORAGE_PATH = Path(os.getenv("KNOWLEDGE_MCP_HOME", "~/.knowledge-mcp")).expanduser()
LOG_LEVEL = os.getenv("KNOWLEDGE_MCP_LOG_LEVEL", "INFO")
```

## Testing

🟩 TASK completed - Create test_server.py with security tests
```python
def test_path_traversal_prevention():
    """Test path validation prevents traversal"""
    # Test ../.. patterns
    # Test absolute paths outside storage
    # Test symlink attempts

def test_filename_sanitization():
    """Test filename slugification"""
    # Test special characters
    # Test unicode
    # Test edge cases

def test_yaml_safety():
    """Test YAML doesn't execute code"""
    # Test code injection attempts
    # Verify safe_load usage
```

🟩 TASK completed - Add functional tests for all tools
```python
async def test_get_project_main():
    """Test retrieving main.md"""
    # Test existing file
    # Test missing file
    # Test invalid project ID

async def test_create_knowledge_file():
    """Test creating knowledge documents"""
    # Test valid creation
    # Test missing keywords
    # Test invalid filenames
    # Verify file structure

async def test_search_knowledge():
    """Test search functionality"""
    # Test case-insensitive search
    # Test chapter-level results
    # Test deduplication
```

🟩 TASK completed - Add integration tests
```python
async def test_full_workflow():
    """Test complete usage workflow"""
    # Initialize storage
    # Create project main
    # Create knowledge files
    # Search content
    # Update chapters
    # Verify git commits
```

🟩 TASK completed - Run tests and ensure 100% pass rate
```bash
pytest test_server.py -v
# Fix any failing tests
# Ensure all tests pass before proceeding
```

## Documentation

🟧 TASK planned - Create README.md
```markdown
# Knowledge MCP Server

Centralized project knowledge management via Model Context Protocol.

## Installation
# Setup instructions

## Usage
# How to configure with MCP clients

## Development
# How to run tests and contribute
```

🟧 TASK planned - Create Dockerfile
```dockerfile
FROM python:3.11-slim
# Install git
# Copy requirements and install
# Copy server code
# Set environment variables
# Expose MCP port
# Run server
```

🟧 TASK planned - Create docker-compose.yml
```yaml
version: '3.8'
services:
  knowledge-mcp:
    build: .
    volumes:
      - ~/.knowledge-mcp:/data
    environment:
      - KNOWLEDGE_MCP_HOME=/data
```

## Final Verification

🟩 TASK completed - Run comprehensive tests
```bash
# Run tests with coverage
pytest test_server.py -v --cov=server --cov-report=html

# Check coverage is adequate
# Test with MCP inspector
npx @modelcontextprotocol/inspector python server.py
```

🟧 TASK planned - Test Docker deployment
```bash
# Build Docker image
docker build -t knowledge-mcp .

# Run with docker-compose
docker-compose up

# Verify server is accessible
# Test all operations work
```

🟩 TASK completed - Final code review
- Ensure no AI/Claude references in code
- Verify all security measures implemented
- Check error handling is comprehensive
- Confirm git integration works properly
- Validate all paths are safe
- Review test coverage