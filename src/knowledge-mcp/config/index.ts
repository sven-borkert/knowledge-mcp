import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Configuration from environment
export const STORAGE_PATH = resolve(
  process.env.KNOWLEDGE_MCP_HOME ?? join(homedir(), '.knowledge-mcp')
);
export const LOG_LEVEL = process.env.KNOWLEDGE_MCP_LOG_LEVEL ?? 'INFO';

// Simple logger
export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    if (LOG_LEVEL === 'DEBUG') {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: unknown[]): void => {
    if (['INFO', 'DEBUG'].includes(LOG_LEVEL)) {
      console.error(`[INFO] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: unknown[]): void => {
    if (['WARN', 'INFO', 'DEBUG'].includes(LOG_LEVEL)) {
      console.error(`[WARN] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: unknown[]): void => {
    console.error(`[ERROR] ${message}`, ...args);
  },
};

// Get package version dynamically
let packageVersion = '0.0.0-unknown';
try {
  // Get the directory of this file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = resolve(__filename, '..');

  // Look for package.json in various locations
  const possiblePaths = [
    resolve(__dirname, '../../../package.json'), // Development: src/knowledge-mcp/config -> root
    resolve(__dirname, '../../package.json'), // Installed: dist/knowledge-mcp -> root
    resolve(__dirname, '../package.json'), // Alternative structure
  ];

  for (const pkgPath of possiblePaths) {
    try {
      const packageData = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
      if (packageData.version) {
        packageVersion = packageData.version;
        break;
      }
    } catch {
      // Try next path
    }
  }
} catch (error) {
  console.error('Failed to read package version:', error);
}

// Server metadata
export const SERVER_CONFIG = {
  name: 'Knowledge MCP Server',
  version: packageVersion,
  description: `🚀 KNOWLEDGE MCP: Project-Specific Instructions & Knowledge Management

⚠️  CRITICAL: This MCP REPLACES project CLAUDE.md files. You MUST use it at the start of EVERY project conversation.

🔄 MANDATORY WORKFLOW (EXECUTE IMMEDIATELY):
1. Determine project_id from current working directory
2. Call get_project_main(project_id) 
3. IF project exists (exists: true): Use returned content as project instructions
4. IF project doesn't exist (exists: false): EXECUTE PROJECT CREATION WORKFLOW
5. Continue with user's request using MCP instructions

📋 PROJECT CREATION WORKFLOW (When project doesn't exist):
1. Check for local CLAUDE.md file in current directory
2. IF CLAUDE.md exists:
   - Read CLAUDE.md content 
   - Call update_project_main(project_id, claude_md_content)
   - Call get_project_main(project_id) to retrieve uploaded instructions
3. IF no CLAUDE.md exists:
   - Create minimal project with update_project_main(project_id, basic_instructions)
   - Call get_project_main(project_id) to retrieve created instructions
4. Use MCP instructions as authoritative source (ignore local CLAUDE.md going forward)

📍 PROJECT_ID DETERMINATION:
- Git repo: Use repository name from .git/config remote URL (e.g., 'knowledge-mcp')
- Non-git: Use current directory basename (e.g., 'My Project', spaces preserved)
- Examples: /path/to/knowledge-mcp/.git → project_id = "knowledge-mcp"
- Case sensitive, special characters preserved

🛠️ AVAILABLE TOOLS:

📁 PROJECT MANAGEMENT:
- get_project_main: Get project instructions (ALWAYS START HERE)
- update_project_main: Create/update project instructions (for CLAUDE.md migration)
- update_project_section: Update specific sections in main.md (efficient partial updates)
- add_project_section: Add new sections to main.md with positioning
- remove_project_section: Remove sections from main.md completely
- delete_project: Permanently delete project and all content

📚 KNOWLEDGE MANAGEMENT:
- search_knowledge: Find information across knowledge docs  
- create_knowledge_file: Create structured knowledge documents
- get_knowledge_file: Download complete knowledge documents
- update_chapter: Update specific sections in knowledge docs
- add_chapter: Add new chapters to knowledge docs with positioning
- remove_chapter: Remove chapters from knowledge docs completely
- delete_knowledge_file: Remove knowledge documents

✅ TODO MANAGEMENT:
- list_todos: List all TODO lists in a project with completion status
- create_todo: Create new TODO list with optional initial tasks
- add_todo_task: Add task to existing TODO list
- remove_todo_task: Remove task from TODO list
- complete_todo_task: Mark task as completed
- get_next_todo_task: Get next incomplete task in sequence
- get_todo_tasks: Get all tasks with completion status
- delete_todo: Delete entire TODO list

📋 TODO USAGE PATTERNS:
- Use create_todo("Implementation plan", ["Task 1", "Task 2"]) to start
- Use get_next_todo_task to work sequentially through tasks
- Mark tasks complete with complete_todo_task immediately after finishing
- Use list_todos to see all active TODO lists and their progress
- TODO lists are project-scoped and persist across conversations

❌ WHAT NOT TO UPLOAD TO KNOWLEDGE MCP:
- README files (repository browsing, not AI context)
- Index/TOC files (MCP provides built-in listing & search)
- Navigation files (knowledge files are auto-searchable)
- Documentation overviews (focus on specific actionable knowledge)
The MCP server provides automatic file listing, search functionality, and chapter-level navigation, making index files redundant and creating unnecessary noise.

🎯 EFFICIENCY PATTERNS:
- ALWAYS call get_project_main first - this replaces reading local CLAUDE.md
- Migrate local CLAUDE.md to MCP immediately when project doesn't exist
- Use update_project_section for targeted changes (avoid full content replacement)
- Use search_knowledge before get_knowledge_file for targeted information
- Batch related knowledge operations in single conversation turn
- MCP becomes single source of truth - ignore local CLAUDE.md after migration

⚡ CRITICAL SUCCESS FACTORS:
- Never fall back to local CLAUDE.md if MCP is available
- Always attempt project creation when project doesn't exist
- Preserve existing project instructions by migrating them to MCP
- Use project instructions from MCP for all subsequent work

❌ ERROR HANDLING:
- If get_project_main fails: Still attempt update_project_main with local CLAUDE.md
- If project creation fails: Inform user and provide fallback guidance
- If tools are unavailable: Clearly explain MCP dependency to user

⚠️  SCOPE: Replaces project-specific CLAUDE.md files only. Global ~/.claude/CLAUDE.md and CLAUDE.local.md still apply.`,
};
