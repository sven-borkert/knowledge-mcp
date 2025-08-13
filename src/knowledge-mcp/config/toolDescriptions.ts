export const TOOL_DESCRIPTIONS = {
  // Project Management Tools
  get_project_main: `Retrieve main.md content for a project's central instructions and configuration.

When to use this tool:
- Starting work on any project (ALWAYS use FIRST)
- Refreshing your understanding of project guidelines
- Checking for updates to project instructions
- Migrating from local CLAUDE.md files to centralized storage

Key features:
- Replaces need for local CLAUDE.md files completely
- Auto-detects project from git repository or directory name
- Returns structured content with sections for easy parsing
- Provides project-specific instructions and context

You should:
1. ALWAYS call this first when starting work on a project
2. Use the returned content as your primary behavioral guide
3. Check if project exists before assuming it doesn't
4. Migrate local CLAUDE.md files immediately if project not found
5. Parse sections to understand project structure and requirements
6. Treat this as your source of truth over any local files
7. Remember project_id for subsequent operations

DO NOT use when:
- You already have the project content loaded in current session
- Working with temporary or test projects

Returns: {exists: bool, content: str, error?: str}`,

  update_project_main: `Create or completely replace main.md content for a project.

When to use this tool:
- Migrating CLAUDE.md content to centralized MCP storage
- Creating a new project's instruction set
- Completely rewriting project guidelines
- Setting up initial project configuration

Key features:
- Creates project if it doesn't exist (auto-initialization)
- Completely replaces existing content (destructive update)
- Automatically commits changes to git
- Validates markdown structure

You should:
1. Check if project exists first with get_project_main
2. Preserve important sections when doing full updates
3. Use update_project_section for partial changes instead
4. Include all necessary sections in the new content
5. Validate markdown formatting before submission
6. Consider the impact of complete replacement
7. Document why full replacement is necessary

DO NOT use when:
- Making small updates (use update_project_section instead)
- You haven't read the existing content first
- Uncertain about losing existing content

Returns: {success: bool, message?: str, error?: str}`,

  update_project_section: `Update a specific section within the project main.md file efficiently.

When to use this tool:
- Modifying a single section without affecting others
- Adding new configuration or guidelines to existing section
- Fixing errors in specific sections
- Updating outdated information in targeted areas
- Making incremental improvements

Key features:
- Preserves all other sections intact (non-destructive)
- More efficient than full file replacement
- Maintains document structure
- Atomic section-level updates

You should:
1. Identify the exact section header including "## " prefix
2. Read the current section content first if needed
3. Preserve section formatting conventions
4. Use this instead of update_project_main for small changes
5. Verify section exists before attempting update
6. Keep section content focused and relevant
7. Consider impact on related sections

DO NOT use when:
- Section doesn't exist (use add_project_section)
- Need to update multiple sections (batch operations)
- Restructuring entire document

Section header must match exactly (e.g., "## Installation")
Returns: {success: bool, message?: str, error?: str}`,

  add_project_section: `Add a new section to the project main.md file with precise positioning control.

When to use this tool:
- Introducing new topics or guidelines to project
- Expanding project documentation systematically
- Adding configuration sections
- Creating new instruction categories
- Organizing content into new logical groups

Key features:
- Flexible positioning (before/after/end)
- Maintains document structure and flow
- Non-destructive addition
- Reference-based positioning for precision

You should:
1. Choose meaningful section headers with "## " prefix
2. Decide optimal position for the new section
3. Use reference_header for precise placement
4. Keep sections focused on single topics
5. Follow existing section naming conventions
6. Consider document flow and readability
7. Add sections progressively, not all at once

DO NOT use when:
- Section already exists (use update_project_section)
- Content belongs in existing section
- Unsure about section organization

Position options: "before", "after", "end" (default)
Returns: {success: bool, message?: str, error?: str}`,

  remove_project_section: `Remove a specific section from the project main.md file.

When to use this tool:
- Removing deprecated or obsolete sections
- Cleaning up redundant information
- Restructuring document by removing sections
- Eliminating outdated guidelines

Key features:
- Precise section removal
- Preserves all other content
- Clean removal without traces

You should:
1. Verify section exists before removal
2. Consider if content should be moved elsewhere
3. Check for references to this section
4. Document why section is being removed
5. Use exact section header with "## " prefix

DO NOT use when:
- Section contains important information
- Should be updated instead of removed
- Unsure about the impact

Returns: {success: bool, message?: str, error?: str}`,

  delete_project: `Permanently delete a project and all its content - USE WITH EXTREME CAUTION.

When to use this tool:
- Project is completely obsolete
- Cleaning up test or temporary projects
- Project has been migrated elsewhere
- Explicit user request to delete

Key features:
- Removes entire project directory
- Deletes from index
- IRREVERSIBLE operation
- Includes all knowledge files and TODOs

You should:
1. ALWAYS confirm with user before deletion
2. Verify project_id is correct
3. Consider backing up important content first
4. Understand this is permanent
5. Check if project has valuable knowledge files
6. Document reason for deletion

DO NOT use when:
- Any doubt about deletion
- Project might be needed later
- Haven't backed up important content
- User hasn't explicitly confirmed

⚠️ This action CANNOT be undone!
Returns: {success: bool, project_id: str, message: str, error?: str}`,

  // Knowledge Document Tools
  create_knowledge_file: `Create a structured knowledge document with rich metadata and chapters.

When to use this tool:
- Documenting specific technical topics or APIs
- Creating reference guides for project components
- Building troubleshooting or how-to guides
- Organizing domain-specific knowledge
- Archiving important technical decisions

Key features:
- Structured with chapters for easy navigation
- Searchable via keywords
- Automatic filename sanitization (spaces→hyphens)
- Metadata for context and discovery
- Supports up to 50 chapters per document

You should:
1. Search first to avoid creating duplicates
2. Choose descriptive, specific filenames
3. Include 3-5 relevant keywords minimum
4. Structure content into logical chapters
5. Write clear chapter titles (max 200 chars)
6. Include practical examples in content
7. Add .md extension to filename
8. Keep chapters focused and concise
9. Consider future searchability

DO NOT use when:
- Content belongs in main.md
- Document already exists (search first!)
- Information is temporary or transient
- Creating index/navigation files

Chapters require 'title' and 'content' keys
Returns: {success: bool, document_id?: str, message?: str, error?: str}`,

  get_knowledge_file: `Retrieve complete content of a knowledge document including all metadata and chapters.

When to use this tool:
- Needing full document for comprehensive review
- Backing up or exporting documents
- Migrating content between projects
- Loading small documents completely

Key features:
- Returns complete document with all chapters
- Includes metadata (title, keywords, introduction)
- Preserves document structure
- Full content access

You should:
1. Consider using chapter operations for large documents
2. Check document exists first
3. Include .md extension in filename
4. Be aware this loads entire document into memory
5. Use chapter iteration for partial access
6. Cache result if accessing multiple times

DO NOT use when:
- Only need specific chapters (use get_chapter)
- Document is very large (use chapter operations)
- Just need to search content (use search_knowledge)

Returns: {success: bool, document?: object, error?: str}`,

  delete_knowledge_file: `Permanently delete a knowledge document - this action cannot be undone.

When to use this tool:
- Document is obsolete or incorrect
- Consolidating duplicate documents
- Removing outdated information
- Explicit request to delete

Key features:
- Complete removal of document
- Removes from search index
- Permanent deletion

You should:
1. Verify document exists first
2. Check if content should be preserved elsewhere
3. Confirm filename is correct (with .md extension)
4. Understand deletion is permanent
5. Consider if update would be better

DO NOT use when:
- Document might be useful later
- Should be updated instead
- Unsure about the impact

Returns: {success: bool, message?: str, error?: str}`,

  // Chapter Management Tools
  update_chapter: `Update a specific chapter within a knowledge document efficiently.

When to use this tool:
- Correcting information in a specific chapter
- Expanding chapter with new content
- Updating code examples or commands
- Refreshing outdated chapter content
- Adding clarifications or improvements

Key features:
- Preserves all other chapters intact
- Maintains document structure
- Updates chapter summary for search
- Efficient partial document update

You should:
1. Use exact chapter title (case-sensitive match)
2. Read current chapter first if needed
3. Preserve chapter's role in document flow
4. Update summary if content focus changes
5. Keep consistent formatting with other chapters
6. Consider impact on related chapters
7. Include .md extension in filename

DO NOT use when:
- Chapter doesn't exist (use add_chapter)
- Need to update multiple chapters
- Restructuring entire document

Returns: {success: bool, message?: str, error?: str}`,

  add_chapter: `Add a new chapter to an existing knowledge document with positioning control.

When to use this tool:
- Expanding document with new topics
- Adding examples or case studies
- Including additional reference material
- Inserting clarifying chapters
- Growing documentation organically

Key features:
- Flexible positioning (before/after/end)
- Maintains document flow
- Maximum 50 chapters per document
- Reference-based positioning

You should:
1. Choose clear, descriptive chapter titles
2. Position chapter logically in document flow
3. Keep chapters focused on single topics
4. Use reference_chapter for precise placement
5. Consider reader's journey through document
6. Check current chapter count (max 50)
7. Include practical, actionable content

DO NOT use when:
- Chapter already exists
- Document has 50 chapters already
- Content belongs in existing chapter

Position options: "before", "after", "end" (default)
Returns: {success: bool, message?: str, error?: str}`,

  remove_chapter: `Remove a specific chapter from a knowledge document.

When to use this tool:
- Removing outdated or incorrect chapters
- Consolidating overlapping content
- Streamlining document structure
- Eliminating redundant information

Key features:
- Precise chapter removal
- Preserves all other chapters
- Maintains document integrity

You should:
1. Verify chapter exists with exact title
2. Consider if content should be preserved
3. Check for references from other chapters
4. Use case-sensitive chapter title
5. Understand removal is permanent

DO NOT use when:
- Chapter should be updated instead
- Content is still relevant
- Unsure about the impact

Returns: {success: bool, message?: str, error?: str}`,

  // Chapter Iteration Tools
  list_chapters: `List all chapters in a knowledge document with titles and summaries only.

When to use this tool:
- Getting document overview without loading all content
- Planning which chapters to read or update
- Understanding document structure
- Checking chapter organization
- Finding specific chapters efficiently

Key features:
- Lightweight operation (no content loading)
- Returns titles and summaries only
- Shows chapter count and order
- Enables informed navigation

You should:
1. Use this before get_knowledge_file for large documents
2. Identify relevant chapters before reading
3. Check document structure before modifications
4. Use for navigation planning
5. Include .md extension in filename

DO NOT use when:
- Need actual chapter content
- Document is very small
- Already know exact chapter needed

Returns: {success: bool, project_id: str, filename: str, total_chapters: int, chapters: array}`,

  get_chapter: `Retrieve a single chapter's content by title or index.

When to use this tool:
- Reading specific chapter content
- Reviewing targeted information
- Updating specific chapter (read first)
- Accessing chapter without loading entire document
- Efficient partial document access

Key features:
- Access by title OR index (0-based)
- Returns navigation info (has_next, has_previous)
- Memory-efficient for large documents
- Includes chapter summary

You should:
1. Use chapter_title for known chapters
2. Use chapter_index for sequential reading
3. Specify either title OR index, not both
4. Use exact title match (case-sensitive)
5. Consider using get_next_chapter for sequences
6. Cache results if accessing multiple times

DO NOT use when:
- Need multiple chapters (batch operations)
- Don't know chapter title or index
- Need full document context

Returns: {success: bool, title: str, content: str, summary: str, index: int, total_chapters: int, has_next: bool, has_previous: bool}`,

  get_next_chapter: `Get the next chapter after the current one in sequence.

When to use this tool:
- Reading document sequentially
- Continuing from current position
- Implementing pagination through document
- Following document flow naturally

Key features:
- Automatic progression to next chapter
- Returns null if at end
- Maintains reading context
- Efficient sequential access

You should:
1. Use current_chapter_title OR current_index
2. Check has_next before calling
3. Use for sequential document traversal
4. Handle end-of-document gracefully
5. Consider document flow and continuity

DO NOT use when:
- Need specific non-sequential chapter
- At the last chapter already
- Random access is needed

Returns: {success: bool, title?: str, content?: str, summary?: str, index?: int, total_chapters: int, has_next: bool}`,

  // Search Tool
  search_knowledge: `Search project knowledge documents for keywords with intelligent result grouping.

When to use this tool:
- Finding information across multiple documents
- Locating specific technical details
- Discovering related content
- Checking if topic is already documented
- Researching before creating new content

Key features:
- Case-insensitive full-text search
- Searches document body, titles, and content
- Groups results by document
- Returns matching chapters with context
- Space-separated keyword support

You should:
1. Use specific keywords for better results
2. Try multiple search terms if needed
3. Search before creating new documents
4. Use 2-3 word phrases for precision
5. Review all results before concluding
6. Consider variations of technical terms
7. Check both titles and content matches

DO NOT use when:
- Know exact document and chapter
- Need complete document listing
- Searching for project main content

Returns: {success: bool, total_documents: int, total_matches: int, results: [...], error?: str}`,

  // TODO Management Tools
  list_todos: `List all TODO lists in a project with their completion status.

When to use this tool:
- Getting overview of all project tasks
- Checking TODO completion progress
- Finding specific TODO lists
- Planning task execution
- Reviewing project task status

Key features:
- Shows all TODO lists with descriptions
- Includes completion statistics
- Returns TODO numbers for reference
- Lightweight overview operation

You should:
1. Use before creating new TODOs
2. Check for existing related TODOs
3. Note TODO numbers for operations
4. Review completion percentages
5. Use to avoid duplicate TODOs

DO NOT use when:
- Need specific task details (use get_todo_tasks)
- Already know TODO number
- No TODOs exist in project

Returns: {success: bool, todos: [...], error?: str}`,

  create_todo: `Create a new TODO list with optional initial tasks and rich markdown support.

When to use this tool:
- User explicitly requests "create a TODO"
- Planning multi-step implementation tasks
- Organizing feature development work
- Tracking bug fixes or improvements
- Creating task lists for later execution

Key features:
- Rich markdown support in task content
- Optional initial task list
- Auto-incrementing TODO numbers
- Task content supports code blocks
- Hierarchical task organization

You should:
1. ONLY create when user explicitly requests
2. Include clear, actionable task descriptions
3. Break complex work into subtasks
4. Use markdown for code examples in tasks
5. Number tasks logically
6. Keep descriptions concise but complete
7. Group related tasks together

DO NOT use when:
- User hasn't explicitly asked for TODO
- Tasks are trivial or single-step
- Work will be done immediately
- TODO already exists for this work

Tasks need {title: str, content?: str} format
Returns: {success: bool, todo_number: int, message: str, error?: str}`,

  add_todo_task: `Add a new task to an existing TODO list with full markdown support.

When to use this tool:
- Expanding existing TODO with new tasks
- Adding discovered subtasks during work
- Including additional requirements
- Appending follow-up tasks
- Adding clarifications or details

Key features:
- Full markdown support in content
- Can include code blocks and examples
- Auto-incrementing task numbers
- Preserves existing task order
- Rich formatting capabilities

You should:
1. Verify TODO exists first
2. Use clear, actionable task titles (max 200 chars)
3. Include implementation details in content
4. Add code examples where helpful
5. Position task logically in sequence
6. Keep task scope focused
7. Use markdown formatting effectively

DO NOT use when:
- TODO doesn't exist
- Task duplicates existing one
- Task is too vague or broad

Returns: {success: bool, task_number: int, message: str, error?: str}`,

  complete_todo_task: `Mark a task as completed in a TODO list.

When to use this tool:
- Task implementation is fully complete
- Task requirements are met
- Moving to next task in sequence
- Updating progress status
- Recording completion for tracking

Key features:
- Marks task with completion timestamp
- Updates TODO completion percentage
- Preserves task content and history
- Cannot be undone

You should:
1. ONLY mark complete when truly finished
2. Verify task is actually done
3. Test/validate before marking complete
4. Complete tasks as you finish them
5. Don't batch completions
6. Move to next task after completing

DO NOT use when:
- Task is partially complete
- Work is blocked or paused
- Need to revisit later
- Implementation failed

Returns: {success: bool, message: str, error?: str}`,

  get_next_todo_task: `Get the next incomplete task in a TODO list for sequential execution.

When to use this tool:
- Working through TODO sequentially
- Finding next task to implement
- Checking for remaining work
- Continuing interrupted work
- Following task order

Key features:
- Returns first incomplete task
- Provides task number and description
- Indicates when all complete
- Maintains task sequence

You should:
1. Use after completing current task
2. Follow sequential task order
3. Handle "all complete" case
4. Read full task details if needed
5. Mark complete before getting next

DO NOT use when:
- Need specific task (not next)
- Want full TODO overview
- All tasks already complete

Returns: {success: bool, task?: {number: int, description: str}, message?: str, error?: str}`,

  get_todo_tasks: `Get all tasks in a TODO list with their completion status and full content.

When to use this tool:
- Reviewing full TODO list details
- Planning task execution order
- Checking task completion status
- Understanding task requirements
- Getting comprehensive task view

Key features:
- Returns all tasks with content
- Shows completion status per task
- Includes rich markdown content
- Provides task numbers and order
- Full TODO context

You should:
1. Use TODO number from list_todos
2. Review all tasks before starting
3. Note incomplete task numbers
4. Plan execution strategy
5. Check task dependencies
6. Identify complex tasks needing breakdown

DO NOT use when:
- Only need next task
- TODO doesn't exist
- Just need TODO overview

Returns: {success: bool, todo: {...}, tasks: [...], error?: str}`,

  remove_todo_task: `Remove a task from a TODO list.

When to use this tool:
- Task is no longer relevant
- Removing duplicate tasks
- Task was added by mistake
- Consolidating similar tasks
- Cleaning up TODO list

Key features:
- Permanent task removal
- Preserves other tasks
- Updates task numbering

You should:
1. Verify task exists first
2. Consider if task is truly unnecessary
3. Check task number is correct
4. Understand removal is permanent
5. Document why removing if significant

DO NOT use when:
- Task should be completed instead
- Task might be needed later
- Unsure about removal impact

Returns: {success: bool, message: str, error?: str}`,

  delete_todo: `Delete an entire TODO list and all its tasks permanently.

When to use this tool:
- TODO is completely finished
- TODO is obsolete or cancelled
- Cleaning up old TODOs
- Consolidating duplicate TODOs
- User explicitly requests deletion

Key features:
- Removes entire TODO list
- Deletes all associated tasks
- Permanent removal
- Frees up TODO number

You should:
1. Verify all tasks are complete or obsolete
2. Confirm TODO number is correct
3. Understand deletion is permanent
4. Consider if TODO has value for history
5. Check no active work depends on it

DO NOT use when:
- TODO has incomplete relevant tasks
- Might need TODO for reference
- Unsure about deletion impact

Returns: {success: bool, message: str, error?: str}`,

  // Server Management Tools
  get_server_info: `Shows server information including version from package.json.

When to use this tool:
- Checking server version and capabilities
- Debugging connection issues
- Verifying server configuration
- Getting storage path information
- Troubleshooting problems

Key features:
- Returns version information
- Shows storage path configuration
- Provides server description
- Lightweight status check

You should:
1. Use for initial connection verification
2. Check when debugging issues
3. Include in bug reports
4. Verify server is responding

DO NOT use when:
- Need git status (use get_storage_status)
- Need to sync storage
- Information already known

Returns: {success: bool, name: str, version: str, storage_path: str, description: str}`,

  get_storage_status: `Shows git status of the knowledge datastore.

When to use this tool:
- Checking for uncommitted changes
- Verifying sync status with remote
- Debugging storage issues
- Understanding current branch
- Reviewing repository state

Key features:
- Shows uncommitted file count
- Displays current branch
- Shows last commit info
- Indicates remote sync status
- Provides detailed git status

You should:
1. Use before sync operations
2. Check when changes aren't persisting
3. Verify remote configuration
4. Monitor uncommitted changes
5. Debug sync failures

DO NOT use when:
- Just need server info
- Don't need git details
- Already know status

Returns: {success: bool, storage_path: str, has_changes: bool, current_branch: str, last_commit: str, remote_status: str, uncommitted_files: int, status_details: str}`,

  sync_storage: `Force git add, commit, and push all changes in the knowledge datastore.

When to use this tool:
- Manually triggering backup to remote
- Ensuring changes are persisted
- Before major operations
- Resolving sync issues
- Explicit backup request

Key features:
- Commits ALL uncommitted changes
- Pushes to configured remote
- Auto-generates commit message
- Handles push failures gracefully
- Forces synchronization

You should:
1. Check storage_status first
2. Use when auto-sync fails
3. Verify remote is configured
4. Handle push failures appropriately
5. Use sparingly (auto-sync usually works)

DO NOT use when:
- No changes to commit
- Remote not configured
- Auto-sync is working fine

Returns: {success: bool, message: str, files_committed: int, pushed: bool, push_error?: str, commit_message: str}`,
};

export function getToolDescription(toolName: string): string {
  return TOOL_DESCRIPTIONS[toolName as keyof typeof TOOL_DESCRIPTIONS] || '';
}
