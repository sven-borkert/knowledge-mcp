# 🧠 Knowledge MCP System - Complete Usage Guide

The Knowledge MCP Server provides centralized, Git-backed storage for all project knowledge. Always use it instead of local CLAUDE.md files.

## 🚀 MANDATORY STARTUP WORKFLOW

At the start of EVERY conversation:

1. **Detect project_id** from current working directory:
   - Git repo: Extract name from `git remote get-url origin` (remove .git extension)
   - Non-git: Use directory name from `pwd`
   - Always use repo name even when in subdirectories
   - Examples: `/path/to/my-app/.git` → `"my-app"`, `/home/user/cool-tool` → `"cool-tool"`

2. **Load project knowledge**:
   - Call `get_project_main` with detected project_id
   - If found: Use returned content as primary guide for all project work
   - If not found: Read local CLAUDE.md and migrate with `update_project_main`
   - After migration: Never read local CLAUDE.md again - MCP is source of truth

## 📚 KNOWLEDGE MANAGEMENT PATTERNS

### Search Before Creating
Always call `search_knowledge` before creating new documents to avoid duplicates.

### Knowledge Document Management
- `create_knowledge_file` - Create new structured documents with chapters
- `delete_knowledge_file` - Remove documents when no longer needed
- `get_knowledge_file` - Load entire document (use sparingly for large docs)

### Efficient Document Access
For large documents, use chapter operations instead of loading entire files:
1. `list_chapters` - Get titles/summaries without content
2. `get_chapter` - Read specific chapter by title or index
3. `get_next_chapter` - Read next chapter in sequence
4. `update_chapter` - Modify without loading full document
5. `add_chapter` - Add new chapters to existing documents
6. `remove_chapter` - Remove chapters when needed

### Smart Updates
- Use `update_project_section` for partial project main updates
- Use `add_project_section` to append new sections with positioning
- Use `remove_project_section` to delete sections when needed
- Batch parallel reads when accessing multiple chapters

## 📋 TODO MANAGEMENT

**CRITICAL**: Only create/manage TODOs when user explicitly requests!

### When to Use TODOs

✅ **CREATE TODO** when user says:
- "Save this plan as a TODO"
- "Create a TODO for these tasks"
- "Make a TODO list for this"

✅ **WORK ON TODO** when user says:
- "Work on TODO #1"
- "Continue with the TODO"
- "Complete TODO tasks"

❌ **NEVER CREATE TODO** when user says:
- "Help me implement X"
- "Build this feature"
- "Fix this bug"

### TODO Workflow

When working on a TODO:
1. `list_todos` - See all TODOs with completion status
2. `get_todo_tasks` - Get all tasks for a specific TODO
3. Complete each task implementation
4. `complete_todo_task` - Mark each task complete as you finish
5. Continue until all done or blocked

### Additional TODO Operations
- `create_todo` - Create TODO with optional initial task list
- `add_todo_task` - Add tasks to existing TODO
- `remove_todo_task` - Remove specific tasks
- `get_next_todo_task` - Get next incomplete task in sequence
- `delete_todo` - Delete entire TODO list

## 🚀 PERFORMANCE BEST PRACTICES

### Token-Efficient Reading
```
1. search_knowledge("topic")              # Find relevant docs
2. list_chapters("doc.md")                # See what's available  
3. get_chapter(chapter_title="OAuth")     # Read only what's needed
```
**AVOID**: `get_knowledge_file()` for large documents (loads everything)

### Update Patterns
- Section updates for project main (not full replacement)
- Chapter updates for knowledge docs (not full rewrite)
- Batch operations - call multiple tools in parallel

### Smart Chapter Iteration
```
# List chapters first to see what's available
chapters = list_chapters(project_id, filename)

# Read only chapters that match your criteria
for ch in chapters:
  if "API" in ch.summary or "auth" in ch.title.lower():
    chapter_content = get_chapter(project_id, filename, chapter_title=ch.title)
```

## ⚠️ KEY CONSTRAINTS

- File extension: Knowledge files require `.md` extension
- Maximum 50 chapters per document
- Centralized storage: Never create local knowledge files - always use MCP

## 🎯 CRITICAL SUCCESS FACTORS

- **ALWAYS** call `get_project_main` first - replaces reading local CLAUDE.md
- **Migrate** local CLAUDE.md immediately when project doesn't exist
- **Search** before creating to avoid duplicates
- **Use** chapter operations for large documents
- **Only** use TODOs when explicitly requested by user