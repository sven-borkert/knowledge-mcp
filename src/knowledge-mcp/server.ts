import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { SERVER_CONFIG, logger, STORAGE_PATH } from './config/index.js';
import { ChapterToolHandler } from './handlers/ChapterToolHandler.js';
import { KnowledgeToolHandler } from './handlers/KnowledgeToolHandler.js';
import { ProjectToolHandler } from './handlers/ProjectToolHandler.js';
import { ResourceHandler } from './handlers/ResourceHandler.js';
import { SearchToolHandler } from './handlers/SearchToolHandler.js';
import { ServerToolHandler } from './handlers/ServerToolHandler.js';
import { TodoToolHandler } from './handlers/TodoToolHandler.js';
import {
  secureProjectIdSchema,
  secureContentSchema,
  secureSectionHeaderSchema,
  secureFilenameSchema,
  secureKeywordSchema,
  secureSearchQuerySchema,
  secureChapterTitleSchema,
  secureChapterContentSchema,
  secureTitleSchema,
  secureIntroductionSchema,
  secureChapterSummarySchema,
  secureTodoNumberSchema,
  secureTodoDescriptionSchema,
  secureTaskTitleSchema,
  secureTaskContentSchema,
  sectionPositionSchema,
  referenceHeaderSchema,
} from './schemas/validation.js';
import { initializeStorageAsync } from './utils.js';

// Initialize handlers
const projectHandler = new ProjectToolHandler();
const knowledgeHandler = new KnowledgeToolHandler();
const searchHandler = new SearchToolHandler();
const chapterHandler = new ChapterToolHandler();
const resourceHandler = new ResourceHandler();
const serverHandler = new ServerToolHandler();
const todoHandler = new TodoToolHandler();

// Initialize server
const server = new McpServer(SERVER_CONFIG);

// Register tools using the correct API

// Project tools
server.registerTool(
  'get_project_main',
  {
    title: 'Get Project Main Instructions',
    description: `Retrieve main.md content for a project. 
This tool REPLACES the need to read local CLAUDE.md files. 
Always use this tool FIRST when starting work on any project.
Returns: {exists: bool, content: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
    },
  },
  async ({ project_id }) => ({
    content: [
      {
        type: 'text',
        text: await projectHandler.getProjectMainAsync(project_id),
      },
    ],
  })
);

server.registerTool(
  'update_project_main',
  {
    title: 'Update Project Main',
    description: `Create or completely replace main.md content for a project. 
This tool is used to migrate CLAUDE.md content to MCP when a project doesn't exist yet.
For partial updates, use update_project_section instead.
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      content: secureContentSchema.describe('The new markdown content for main.md'),
    },
  },
  async ({ project_id, content }) => {
    const result = await projectHandler.updateProjectMainAsync({ project_id, content });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'update_project_section',
  {
    title: 'Update Project Section',
    description: `Update a specific section within the project main.md file.
This is more efficient than replacing the entire file when making targeted changes.
The section_header must match exactly (including "## " prefix).
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      section_header: secureSectionHeaderSchema.describe(
        'The exact section header to update (e.g., "## Installation")'
      ),
      new_content: secureContentSchema.describe(
        'The new content for this section (without the header)'
      ),
    },
  },
  async ({ project_id, section_header, new_content }) => {
    const result = await projectHandler.updateProjectSectionAsync({
      project_id,
      section_header,
      new_content,
    });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'remove_project_section',
  {
    title: 'Remove Project Section',
    description: `Remove a specific section from the project main.md file.
The section_header must match exactly (including "## " prefix).
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      section_header: secureSectionHeaderSchema.describe(
        'The exact section header to remove (e.g., "## Deprecated")'
      ),
    },
  },
  async ({ project_id, section_header }) => {
    const result = await projectHandler.removeProjectSectionAsync({ project_id, section_header });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'add_project_section',
  {
    title: 'Add Project Section',
    description: `Add a new section to the project main.md file.
The section can be positioned at the end, or before/after a reference section.
The section_header must include the "## " prefix.
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      section_header: secureSectionHeaderSchema.describe(
        'The new section header (e.g., "## Configuration")'
      ),
      content: secureContentSchema.describe('The content for the new section'),
      position: sectionPositionSchema
        .optional()
        .describe('Where to insert the section (default: "end")'),
      reference_header: referenceHeaderSchema,
    },
  },
  async ({ project_id, section_header, content, position, reference_header }) => {
    const result = await projectHandler.addProjectSectionAsync({
      project_id,
      section_header,
      content,
      position,
      reference_header,
    });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'delete_project',
  {
    title: 'Delete Project',
    description: `Permanently delete a project and all its content.
This removes the entire project directory and removes it from the index.
This action cannot be undone - use with caution.
Returns: {success: bool, project_id: str, message: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier to delete'),
    },
  },
  async ({ project_id }) => {
    const result = await projectHandler.deleteProjectAsync(project_id);
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

// Knowledge file tools
server.registerTool(
  'create_knowledge_file',
  {
    title: 'Create Knowledge File',
    description: `Create a structured knowledge document with metadata. 
Document name is slugified for safety (spaces→hyphens). 
Requires at least one keyword. Chapters must have 'title' and 'content' keys. 
Returns: {success: bool, document_id?: str, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe(
        'Desired filename (will be slugified, .md extension optional)'
      ),
      title: secureTitleSchema.describe('Human-readable document title for the metadata'),
      introduction: secureIntroductionSchema.describe(
        'Opening text that appears before any chapters'
      ),
      keywords: z.array(secureKeywordSchema).min(1).describe('List of searchable keywords'),
      chapters: z
        .array(
          z.object({
            title: secureChapterTitleSchema.describe('Chapter title'),
            content: secureChapterContentSchema.describe('Chapter content'),
          })
        )
        .max(50, 'Too many chapters (max 50)')
        .describe('List of chapter objects with title and content'),
    },
  },
  async ({ project_id, filename, title, introduction, keywords, chapters }) => {
    const result = await knowledgeHandler.createKnowledgeFileAsync({
      project_id,
      filename,
      title,
      introduction,
      keywords,
      chapters,
    });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'get_knowledge_file',
  {
    title: 'Get Knowledge File',
    description: `Retrieve the complete content of a knowledge document including metadata and all chapters. 
This tool enables full document download/backup functionality. 
Returns: {success: bool, document?: object, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
    },
  },
  async ({ project_id, filename }) => {
    const result = await knowledgeHandler.getKnowledgeFileAsync({ project_id, filename });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'delete_knowledge_file',
  {
    title: 'Delete Knowledge File',
    description: `Delete a knowledge document permanently. This action cannot be undone. 
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Full filename including .md extension'),
    },
  },
  async ({ project_id, filename }) => {
    const result = await knowledgeHandler.deleteKnowledgeFileAsync({ project_id, filename });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

// Search tool
server.registerTool(
  'search_knowledge',
  {
    title: 'Search Knowledge',
    description: `Search project knowledge documents for keywords (case-insensitive). 
Returns document-centric results with matching chapters grouped by document. 
Searches in: document body, chapter titles, chapter content, and pre-chapter content. 
Returns: {success: bool, total_documents: int, total_matches: int, results: [...], error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      query: secureSearchQuerySchema.describe('Space-separated keywords to search for'),
    },
  },
  async ({ project_id, query }) => {
    const result = await searchHandler.searchKnowledgeAsync({ project_id, query });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

// Chapter tools
server.registerTool(
  'update_chapter',
  {
    title: 'Update Chapter',
    description: `Update a specific chapter within a knowledge document by title (exact match required). 
Preserves document structure, metadata, and other chapters. 
Chapter title must match exactly including case. 
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
      chapter_title: secureChapterTitleSchema.describe(
        'Exact title of the chapter to update (case-sensitive)'
      ),
      new_content: secureChapterContentSchema.describe(
        'New content for the chapter (without ## heading)'
      ),
      new_summary: secureChapterSummarySchema
        .optional()
        .describe('Optional chapter summary for search results'),
    },
  },
  async ({ project_id, filename, chapter_title, new_content, new_summary }) => {
    const result = await chapterHandler.updateChapterAsync({
      project_id,
      filename,
      chapter_title,
      new_content,
      new_summary,
    });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'remove_chapter',
  {
    title: 'Remove Chapter',
    description: `Remove a specific chapter from a knowledge document by title. 
Chapter title must match exactly including case. 
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
      chapter_title: secureChapterTitleSchema.describe('Exact title of the chapter to remove'),
    },
  },
  async ({ project_id, filename, chapter_title }) => {
    const result = await chapterHandler.removeChapterAsync({ project_id, filename, chapter_title });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'add_chapter',
  {
    title: 'Add Chapter',
    description: `Add a new chapter to a knowledge document.
The chapter can be positioned at the end, or before/after a reference chapter.
Chapter title must not already exist in the document.
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
      chapter_title: secureChapterTitleSchema.describe('Title for the new chapter'),
      content: secureChapterContentSchema.describe('Content for the new chapter'),
      position: sectionPositionSchema
        .optional()
        .describe('Where to insert the chapter (default: "end")'),
      reference_chapter: secureChapterTitleSchema
        .optional()
        .describe('The chapter title to use as reference point for before/after positioning'),
    },
  },
  async ({ project_id, filename, chapter_title, content, position, reference_chapter }) => {
    const result = await chapterHandler.addChapterAsync({
      project_id,
      filename,
      chapter_title,
      content,
      position,
      reference_chapter,
    });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

// Server tools
server.registerTool(
  'get_server_info',
  {
    title: 'Get Server Information',
    description: `Shows server information including version from package.json.
Returns: {success: bool, name: str, version: str, storage_path: str, description: str}`,
    inputSchema: {},
  },
  async () => {
    const result = await serverHandler.getServerInfoAsync();
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'get_storage_status',
  {
    title: 'Get Storage Status',
    description: `Shows git status of the knowledge datastore.
Returns: {success: bool, storage_path: str, has_changes: bool, current_branch: str, last_commit: str, remote_status: str, uncommitted_files: int, status_details: str}`,
    inputSchema: {},
  },
  async () => {
    const result = await serverHandler.getStorageStatusAsync();
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'sync_storage',
  {
    title: 'Sync Storage',
    description: `Force git add, commit, and push all changes in the knowledge datastore.
Returns: {success: bool, message: str, files_committed: int, pushed: bool, push_error?: str, commit_message: str}`,
    inputSchema: {},
  },
  async () => {
    const result = await serverHandler.syncStorageAsync();
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

// TODO Management tools
server.registerTool(
  'list_todos',
  {
    title: 'List TODOs',
    description: `List all TODO lists in a project with their completion status.
Returns: {success: bool, todos: [...], error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
    },
  },
  async ({ project_id }) => {
    const result = await todoHandler.listTodosAsync({ project_id });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'create_todo',
  {
    title: 'Create TODO',
    description: `Create a new TODO list with optional initial tasks.
Tasks must be objects with title and content properties for full markdown support.
Returns: {success: bool, todo_number: int, message: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      description: secureTodoDescriptionSchema.describe('Description of the TODO list'),
      tasks: z
        .array(
          z.object({
            title: secureTaskTitleSchema.describe('Brief task title (max 200 chars)'),
            content: secureTaskContentSchema.describe('Full markdown content with details'),
          })
        )
        .optional()
        .describe('Optional initial tasks as {title, content} objects'),
    },
  },
  async ({ project_id, description, tasks }) => {
    const result = await todoHandler.createTodoAsync({ project_id, description, tasks });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'add_todo_task',
  {
    title: 'Add TODO Task',
    description: `Add a new task to an existing TODO list with full markdown support.
Task content can include code blocks, lists, links, and any markdown formatting.
Returns: {success: bool, task_number: int, message: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      todo_number: secureTodoNumberSchema.describe('The TODO list number'),
      title: secureTaskTitleSchema.describe('Brief task title (max 200 chars, used in filename)'),
      content: secureTaskContentSchema.describe(
        'Full markdown content with implementation details, code examples, etc.'
      ),
    },
  },
  async (params) => {
    const result = await todoHandler.addTodoTaskAsync(params);
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'remove_todo_task',
  {
    title: 'Remove TODO Task',
    description: `Remove a task from a TODO list.
Returns: {success: bool, message: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      todo_number: secureTodoNumberSchema.describe('The TODO list number'),
      task_number: secureTodoNumberSchema.describe('The task number to remove'),
    },
  },
  async ({ project_id, todo_number, task_number }) => {
    const result = await todoHandler.removeTodoTaskAsync({ project_id, todo_number, task_number });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'complete_todo_task',
  {
    title: 'Complete TODO Task',
    description: `Mark a task as completed in a TODO list.
Returns: {success: bool, message: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      todo_number: secureTodoNumberSchema.describe('The TODO list number'),
      task_number: secureTodoNumberSchema.describe('The task number to complete'),
    },
  },
  async ({ project_id, todo_number, task_number }) => {
    const result = await todoHandler.completeTodoTaskAsync({
      project_id,
      todo_number,
      task_number,
    });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'get_next_todo_task',
  {
    title: 'Get Next TODO Task',
    description: `Get the next incomplete task in a TODO list.
Returns: {success: bool, task?: {number: int, description: str}, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      todo_number: secureTodoNumberSchema.describe('The TODO list number'),
    },
  },
  async ({ project_id, todo_number }) => {
    const result = await todoHandler.getNextTodoTaskAsync({ project_id, todo_number });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'get_todo_tasks',
  {
    title: 'Get TODO Tasks',
    description: `Get all tasks in a TODO list with their completion status.
Returns: {success: bool, todo: {...}, tasks: [...], error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      todo_number: secureTodoNumberSchema.describe('The TODO list number'),
    },
  },
  async ({ project_id, todo_number }) => {
    const result = await todoHandler.getTodoTasksAsync({ project_id, todo_number });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

server.registerTool(
  'delete_todo',
  {
    title: 'Delete TODO',
    description: `Delete an entire TODO list and all its tasks.
Returns: {success: bool, message: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      todo_number: secureTodoNumberSchema.describe('The TODO list number to delete'),
    },
  },
  async ({ project_id, todo_number }) => {
    const result = await todoHandler.deleteTodoAsync({ project_id, todo_number });
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }
);

// Register resources
server.registerResource(
  'main',
  new ResourceTemplate('knowledge://projects/{project_id}/main', {
    list: undefined,
  }),
  {
    title: 'Project Main Instructions',
    description: 'Read-only access to project main.md file',
  },
  async (uri, params) => await resourceHandler.getProjectMainResourceAsync(uri, params)
);

server.registerResource(
  'files',
  new ResourceTemplate('knowledge://projects/{project_id}/files', {
    list: undefined,
  }),
  {
    title: 'Knowledge Files',
    description: 'List all knowledge files in a project',
  },
  async (uri, params) => await resourceHandler.listKnowledgeFilesResourceAsync(uri, params)
);

server.registerResource(
  'chapters',
  new ResourceTemplate('knowledge://projects/{project_id}/chapters/{filename}', {
    list: undefined,
  }),
  {
    title: 'Document Chapters',
    description: 'List all chapters in a specific knowledge file',
  },
  async (uri, params) => await resourceHandler.listChaptersResourceAsync(uri, params)
);

// Main function to run the server
export async function main(): Promise<void> {
  // Initialize storage on startup using async version
  await initializeStorageAsync(STORAGE_PATH);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`Knowledge MCP Server v${SERVER_CONFIG.version} running on stdio`);
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Server error:', error);
    process.exit(1);
  });
}
