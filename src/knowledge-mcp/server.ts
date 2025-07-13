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
} from './schemas/validation.js';
import { initializeStorageAsync } from './utils.js';

// Initialize handlers
const projectHandler = new ProjectToolHandler();
const knowledgeHandler = new KnowledgeToolHandler();
const searchHandler = new SearchToolHandler();
const chapterHandler = new ChapterToolHandler();
const resourceHandler = new ResourceHandler();
const serverHandler = new ServerToolHandler();

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
  ({ project_id, content }) => ({
    content: [
      {
        type: 'text',
        text: projectHandler.updateProjectMain({ project_id, content }),
      },
    ],
  })
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
  ({ project_id, section_header, new_content }) => ({
    content: [
      {
        type: 'text',
        text: projectHandler.updateProjectSection({ project_id, section_header, new_content }),
      },
    ],
  })
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
  ({ project_id, section_header }) => ({
    content: [
      {
        type: 'text',
        text: projectHandler.removeProjectSection({ project_id, section_header }),
      },
    ],
  })
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
  ({ project_id }) => ({
    content: [
      {
        type: 'text',
        text: projectHandler.deleteProject(project_id),
      },
    ],
  })
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
  ({ project_id, filename, title, introduction, keywords, chapters }) => ({
    content: [
      {
        type: 'text',
        text: knowledgeHandler.createKnowledgeFile({
          project_id,
          filename,
          title,
          introduction,
          keywords,
          chapters,
        }),
      },
    ],
  })
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
  ({ project_id, filename }) => ({
    content: [
      {
        type: 'text',
        text: knowledgeHandler.getKnowledgeFile({ project_id, filename }),
      },
    ],
  })
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
  ({ project_id, filename }) => ({
    content: [
      {
        type: 'text',
        text: knowledgeHandler.deleteKnowledgeFile({ project_id, filename }),
      },
    ],
  })
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
  ({ project_id, query }) => ({
    content: [
      {
        type: 'text',
        text: searchHandler.searchKnowledge({ project_id, query }),
      },
    ],
  })
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
  ({ project_id, filename, chapter_title, new_content, new_summary }) => ({
    content: [
      {
        type: 'text',
        text: chapterHandler.updateChapter({
          project_id,
          filename,
          chapter_title,
          new_content,
          new_summary,
        }),
      },
    ],
  })
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
  ({ project_id, filename, chapter_title }) => ({
    content: [
      {
        type: 'text',
        text: chapterHandler.removeChapter({ project_id, filename, chapter_title }),
      },
    ],
  })
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
  () => ({
    content: [
      {
        type: 'text',
        text: serverHandler.getServerInfo(),
      },
    ],
  })
);

server.registerTool(
  'get_storage_status',
  {
    title: 'Get Storage Status',
    description: `Shows git status of the knowledge datastore.
Returns: {success: bool, storage_path: str, has_changes: bool, current_branch: str, last_commit: str, remote_status: str, uncommitted_files: int, status_details: str}`,
    inputSchema: {},
  },
  () => ({
    content: [
      {
        type: 'text',
        text: serverHandler.getStorageStatus(),
      },
    ],
  })
);

server.registerTool(
  'sync_storage',
  {
    title: 'Sync Storage',
    description: `Force git add, commit, and push all changes in the knowledge datastore.
Returns: {success: bool, message: str, files_committed: int, pushed: bool, push_error?: str, commit_message: str}`,
    inputSchema: {},
  },
  () => ({
    content: [
      {
        type: 'text',
        text: serverHandler.syncStorage(),
      },
    ],
  })
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
  (uri, params) => resourceHandler.getProjectMainResource(uri, params)
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
  (uri, params) => resourceHandler.listKnowledgeFilesResource(uri, params)
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
  (uri, params) => resourceHandler.listChaptersResource(uri, params)
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
