import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { SERVER_CONFIG, logger, STORAGE_PATH } from './config/index.js';
import { TOOL_DESCRIPTIONS } from './config/toolDescriptions.js';
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
  chapterIndexSchema,
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
    description: TOOL_DESCRIPTIONS.get_project_main,
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
    description: TOOL_DESCRIPTIONS.update_project_main,
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
    description: TOOL_DESCRIPTIONS.update_project_section,
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
    description: TOOL_DESCRIPTIONS.remove_project_section,
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
    description: TOOL_DESCRIPTIONS.add_project_section,
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
    description: TOOL_DESCRIPTIONS.delete_project,
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
    description: TOOL_DESCRIPTIONS.create_knowledge_file,
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
    description: TOOL_DESCRIPTIONS.get_knowledge_file,
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
    description: TOOL_DESCRIPTIONS.delete_knowledge_file,
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
    description: TOOL_DESCRIPTIONS.search_knowledge,
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
    description: TOOL_DESCRIPTIONS.update_chapter,
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
    description: TOOL_DESCRIPTIONS.remove_chapter,
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
    description: TOOL_DESCRIPTIONS.add_chapter,
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

// Chapter iteration tools
server.registerTool(
  'list_chapters',
  {
    title: 'List Chapters',
    description: TOOL_DESCRIPTIONS.list_chapters,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
    },
  },
  async ({ project_id, filename }) => {
    const result = await chapterHandler.listChaptersAsync({ project_id, filename });
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
  'get_chapter',
  {
    title: 'Get Chapter',
    description: TOOL_DESCRIPTIONS.get_chapter,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
      chapter_title: secureChapterTitleSchema
        .optional()
        .describe('Title of the chapter to retrieve (use this OR chapter_index)'),
      chapter_index: chapterIndexSchema
        .optional()
        .describe('Zero-based index of the chapter (use this OR chapter_title)'),
    },
  },
  async (params: {
    project_id: string;
    filename: string;
    chapter_title?: string;
    chapter_index?: number;
  }) => {
    // Ensure only one of chapter_title or chapter_index is passed
    const callParams = params.chapter_title
      ? {
          project_id: params.project_id,
          filename: params.filename,
          chapter_title: params.chapter_title,
        }
      : {
          project_id: params.project_id,
          filename: params.filename,
          chapter_index: params.chapter_index ?? 0,
        };

    const result = await chapterHandler.getChapterAsync(callParams);
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
  'get_next_chapter',
  {
    title: 'Get Next Chapter',
    description: TOOL_DESCRIPTIONS.get_next_chapter,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
      current_chapter_title: secureChapterTitleSchema
        .optional()
        .describe('Title of the current chapter (use this OR current_index)'),
      current_index: chapterIndexSchema
        .optional()
        .describe('Zero-based index of current chapter (use this OR current_chapter_title)'),
    },
  },
  async (params: {
    project_id: string;
    filename: string;
    current_chapter_title?: string;
    current_index?: number;
  }) => {
    // Ensure only one of current_chapter_title or current_index is passed
    const callParams = params.current_chapter_title
      ? {
          project_id: params.project_id,
          filename: params.filename,
          current_chapter_title: params.current_chapter_title,
        }
      : {
          project_id: params.project_id,
          filename: params.filename,
          current_index: params.current_index ?? 0,
        };

    const result = await chapterHandler.getNextChapterAsync(callParams);
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
    description: TOOL_DESCRIPTIONS.get_server_info,
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
    description: TOOL_DESCRIPTIONS.get_storage_status,
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
    description: TOOL_DESCRIPTIONS.sync_storage,
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
    description: TOOL_DESCRIPTIONS.list_todos,
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
    description: TOOL_DESCRIPTIONS.create_todo,
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
    description: TOOL_DESCRIPTIONS.add_todo_task,
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
    description: TOOL_DESCRIPTIONS.remove_todo_task,
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
    description: TOOL_DESCRIPTIONS.complete_todo_task,
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
    description: TOOL_DESCRIPTIONS.get_next_todo_task,
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
    description: TOOL_DESCRIPTIONS.get_todo_tasks,
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
    description: TOOL_DESCRIPTIONS.delete_todo,
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
