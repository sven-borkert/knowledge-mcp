import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Enhanced security validation schemas
const secureProjectIdSchema = z
  .string()
  .min(1, 'Project ID cannot be empty')
  .max(100, 'Project ID too long')
  .refine(
    (val) => !val.includes('..') && !val.startsWith('.') && !val.endsWith('.'),
    'Project ID cannot contain path traversal patterns'
  )
  .refine(
    (val) => !/[/\\:*?"<>|\0]/.test(val),
    'Project ID cannot contain filesystem reserved characters or null bytes'
  )
  .refine((val) => val.trim() === val, 'Project ID cannot have leading/trailing spaces');

const secureFilenameSchema = z
  .string()
  .min(1, 'Filename cannot be empty')
  .max(255, 'Filename too long')
  .refine(
    (val) => !val.includes('/') && !val.includes('\\') && !val.includes('\0'),
    'Filename contains invalid path characters'
  )
  .refine(
    (val) => !val.includes('..') && val.trim() === val,
    'Filename cannot contain path traversal or leading/trailing spaces'
  );

const secureContentSchema = z
  .string()
  .max(10 * 1024 * 1024, 'Content too large (max 10MB)')
  .refine((val) => !val.includes('\0'), 'Content cannot contain null bytes');

const secureSectionHeaderSchema = z
  .string()
  .min(1, 'Section header cannot be empty')
  .max(200, 'Section header too long')
  .regex(/^##\s+/, 'Section header must start with "## "')
  .refine(
    (val) => !val.includes('\0') && val.trim() === val,
    'Section header contains invalid characters'
  );

const secureKeywordSchema = z
  .string()
  .min(1, 'Keyword cannot be empty')
  .max(50, 'Keyword too long')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Keyword contains invalid characters');

const secureSearchQuerySchema = z
  .string()
  .min(1, 'Search query cannot be empty')
  .max(200, 'Search query too long')
  .refine((val) => val.split(/\s+/).length <= 20, 'Search query contains too many terms');

import type { DocumentMetadata, Chapter } from './documents.js';
import { parseChapters, parseDocument, searchDocuments, writeDocument } from './documents.js';
import {
  autoCommit,
  getProjectDirectory,
  initializeStorage,
  logMethodCall,
  slugify,
} from './utils.js';

// Configuration from environment
const STORAGE_PATH = resolve(process.env.KNOWLEDGE_MCP_HOME ?? join(homedir(), '.knowledge-mcp'));
const LOG_LEVEL = process.env.KNOWLEDGE_MCP_LOG_LEVEL ?? 'INFO';

// Simple logger
const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (['INFO', 'DEBUG'].includes(LOG_LEVEL)) {
      console.error(`[INFO] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
};

// Initialize server
const server = new McpServer({
  name: 'Knowledge MCP Server',
  version: '0.1.0',
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
- get_project_main: Get project instructions (ALWAYS START HERE)
- update_project_main: Create/update project instructions (for CLAUDE.md migration)
- update_project_section: Update specific sections in main.md (efficient partial updates)
- remove_project_section: Remove sections from main.md completely
- search_knowledge: Find information across knowledge docs  
- create_knowledge_file: Create structured knowledge documents
- get_knowledge_file: Download complete knowledge documents
- update_chapter: Update specific sections in knowledge docs
- remove_chapter: Remove chapters from knowledge docs completely
- delete_knowledge_file: Remove knowledge documents

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
});

// Initialize storage on startup
try {
  initializeStorage(STORAGE_PATH);
  logger.info('Storage initialized at:', STORAGE_PATH);
} catch (error) {
  logger.error('Failed to initialize storage:', error);
  throw error;
}

// Tool: get_project_main
server.registerTool(
  'get_project_main',
  {
    title: 'Get Project Main Instructions',
    description: `Retrieves the main project instructions which replace CLAUDE.md. 
project_id should be a unique identifier like repo name or project slug. 
Returns: {exists: bool, content: str, error?: str}. 
If project doesn't exist, returns exists=false with empty content.`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe(
        'The project identifier (alphanumeric + hyphens, no paths)'
      ),
    },
  },
  ({ project_id }) => {
    try {
      const [_, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);
      const mainFile = join(projectPath, 'main.md');

      if (!existsSync(mainFile)) {
        logMethodCall(STORAGE_PATH, 'get_project_main', {
          project_id,
          success: true,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                exists: false,
                content: '',
              }),
            },
          ],
        };
      }

      const content = readFileSync(mainFile, 'utf8');
      logMethodCall(STORAGE_PATH, 'get_project_main', {
        project_id,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              exists: true,
              content,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error reading project main:', error);
      logMethodCall(STORAGE_PATH, 'get_project_main', {
        project_id,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              exists: false,
              content: '',
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// Tool: update_project_main
server.registerTool(
  'update_project_main',
  {
    title: 'Update Project Main Instructions',
    description: `Updates or creates the main project instructions. 
Creates the project if it doesn't exist. 
project_id can contain spaces and special characters (e.g., 'My Project'). 
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier (can contain spaces)'),
      content: secureContentSchema.describe('The new markdown content for main.md'),
    },
  },
  async ({ project_id, content }) => {
    try {
      const [originalId, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);

      // Create project directory if it doesn't exist
      if (!existsSync(projectPath)) {
        const fs = await import('fs');
        fs.mkdirSync(projectPath, { recursive: true });
      }

      // Write content to main.md
      const mainFile = join(projectPath, 'main.md');
      const fs = await import('fs');
      fs.writeFileSync(mainFile, content, 'utf8');

      // Git commit changes
      autoCommit(STORAGE_PATH, `Update main.md for project: ${originalId}`);

      logMethodCall(STORAGE_PATH, 'update_project_main', {
        project_id,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Project main instructions updated successfully',
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error updating project main:', error);
      logMethodCall(STORAGE_PATH, 'update_project_main', {
        project_id,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// Tool: update_project_section
server.registerTool(
  'update_project_section',
  {
    title: 'Update Project Main Section',
    description: `Update a specific section within the main project instructions by header title (exact match required). 
Preserves document structure and other sections. 
Section header must match exactly including case and formatting (e.g., "## 🧪 CODE QUALITY & TESTING"). 
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      section_header: secureSectionHeaderSchema.describe(
        'Exact section header to update (case-sensitive, include ## and emojis)'
      ),
      new_content: secureContentSchema.describe(
        'New content for the section (without the header line)'
      ),
    },
  },
  async ({ project_id, section_header, new_content }) => {
    try {
      const [originalId, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);
      const mainFile = join(projectPath, 'main.md');

      // Check if main.md exists
      if (!existsSync(mainFile)) {
        logMethodCall(STORAGE_PATH, 'update_project_section', {
          project_id,
          section_header,
          success: false,
          error: `Project main.md not found: ${project_id}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Project main.md not found: ${project_id}`,
              }),
            },
          ],
        };
      }

      // Read existing main.md content
      const content = readFileSync(mainFile, 'utf8');

      // Parse sections using chapter parsing logic
      const sections = parseChapters(content);

      // Find the section to update
      let sectionFound = false;
      const updatedSections: Chapter[] = [];

      for (const section of sections) {
        if (section.title === section_header.replace(/^## /, '')) {
          sectionFound = true;
          // Update section content
          updatedSections.push({
            title: section.title,
            level: section.level,
            content: `${section_header}\n\n${new_content}`,
            summary: section.summary,
          });
        } else {
          updatedSections.push(section);
        }
      }

      if (!sectionFound) {
        logMethodCall(STORAGE_PATH, 'update_project_section', {
          project_id,
          section_header,
          success: false,
          error: `Section not found: ${section_header}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Section not found: ${section_header}`,
              }),
            },
          ],
        };
      }

      // Reconstruct document
      const contentParts: string[] = [];

      // Add any content before first section
      if (sections.length > 0) {
        const firstSectionPos = content.indexOf(sections[0].content);
        if (firstSectionPos > 0) {
          const intro = content.slice(0, firstSectionPos).trim();
          if (intro) {
            contentParts.push(intro);
            contentParts.push('');
          }
        }
      }

      // Add updated sections
      for (const section of updatedSections) {
        contentParts.push(section.content.trim());
        contentParts.push('');
      }

      const newContent = contentParts.join('\n').trim();

      // Write updated main.md
      const fs = await import('fs');
      fs.writeFileSync(mainFile, newContent, 'utf8');

      // Git commit changes
      autoCommit(
        STORAGE_PATH,
        `Update section '${section_header}' in main.md for project: ${originalId}`
      );

      logMethodCall(STORAGE_PATH, 'update_project_section', {
        project_id,
        section_header,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Section '${section_header}' updated successfully`,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error updating project section:', error);
      logMethodCall(STORAGE_PATH, 'update_project_section', {
        project_id,
        section_header,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// Tool: remove_project_section
server.registerTool(
  'remove_project_section',
  {
    title: 'Remove Project Main Section',
    description: `Remove a specific section from the main project instructions by header title (exact match required). 
Preserves document structure and other sections. 
Section header must match exactly including case and formatting (e.g., "## 🧪 CODE QUALITY & TESTING"). 
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      section_header: secureSectionHeaderSchema.describe(
        'Exact section header to remove (case-sensitive, include ## and emojis)'
      ),
    },
  },
  async ({ project_id, section_header }) => {
    try {
      const [originalId, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);
      const mainFile = join(projectPath, 'main.md');

      // Check if main.md exists
      if (!existsSync(mainFile)) {
        logMethodCall(STORAGE_PATH, 'remove_project_section', {
          project_id,
          section_header,
          success: false,
          error: `Project main.md not found: ${project_id}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Project main.md not found: ${project_id}`,
              }),
            },
          ],
        };
      }

      // Read existing main.md content
      const content = readFileSync(mainFile, 'utf8');

      // Parse sections using chapter parsing logic
      const sections = parseChapters(content);

      // Find and remove the section
      let sectionFound = false;
      const remainingSections: Chapter[] = [];

      for (const section of sections) {
        if (section.title === section_header.replace(/^## /, '')) {
          sectionFound = true;
          // Skip this section (effectively removing it)
        } else {
          remainingSections.push(section);
        }
      }

      if (!sectionFound) {
        logMethodCall(STORAGE_PATH, 'remove_project_section', {
          project_id,
          section_header,
          success: false,
          error: `Section not found: ${section_header}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Section not found: ${section_header}`,
              }),
            },
          ],
        };
      }

      // Reconstruct document
      const contentParts: string[] = [];

      // Add any content before first section
      if (sections.length > 0) {
        const firstSectionPos = content.indexOf(sections[0].content);
        if (firstSectionPos > 0) {
          const intro = content.slice(0, firstSectionPos).trim();
          if (intro) {
            contentParts.push(intro);
            contentParts.push('');
          }
        }
      }

      // Add remaining sections
      for (const section of remainingSections) {
        contentParts.push(section.content.trim());
        contentParts.push('');
      }

      const newContent = contentParts.join('\n').trim();

      // Write updated main.md
      const fs = await import('fs');
      fs.writeFileSync(mainFile, newContent, 'utf8');

      // Git commit changes
      autoCommit(
        STORAGE_PATH,
        `Remove section '${section_header}' from main.md for project: ${originalId}`
      );

      logMethodCall(STORAGE_PATH, 'remove_project_section', {
        project_id,
        section_header,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Section '${section_header}' removed successfully`,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error removing project section:', error);
      logMethodCall(STORAGE_PATH, 'remove_project_section', {
        project_id,
        section_header,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// Tool: search_knowledge
server.registerTool(
  'search_knowledge',
  {
    title: 'Search Knowledge Documents',
    description: `Search project knowledge documents for keywords (case-insensitive). 
Returns document-centric results with matching chapters grouped by document. 
Searches in: document body, chapter titles, chapter content, and pre-chapter content. 
Returns: {success: bool, total_documents: int, total_matches: int, results: [...], error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      query: secureSearchQuerySchema.describe('Space-separated keywords to search for'),
    },
  },
  ({ project_id, query }) => {
    try {
      const [_, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);

      if (!existsSync(projectPath)) {
        logMethodCall(STORAGE_PATH, 'search_knowledge', {
          project_id,
          success: true,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                results: [],
                message: 'Project not found',
              }),
            },
          ],
        };
      }

      const results = searchDocuments(projectPath, query);
      const totalDocuments = results.length;
      const totalMatches = results.reduce((sum, doc) => sum + doc.match_count, 0);

      logMethodCall(STORAGE_PATH, 'search_knowledge', {
        project_id,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              total_documents: totalDocuments,
              total_matches: totalMatches,
              results,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error searching knowledge:', error);
      logMethodCall(STORAGE_PATH, 'search_knowledge', {
        project_id,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              results: [],
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// Tool: create_knowledge_file
server.registerTool(
  'create_knowledge_file',
  {
    title: 'Create Knowledge Document',
    description: `Create a structured knowledge document with metadata. 
Document name is slugified for safety (spaces→hyphens). 
Requires at least one keyword. Chapters must have 'title' and 'content' keys. 
Returns: {success: bool, document_id?: str, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe(
        'Desired filename (will be slugified, .md extension optional)'
      ),
      title: z.string().min(1).max(200).describe('Human-readable document title for the metadata'),
      introduction: secureContentSchema.describe('Opening text that appears before any chapters'),
      keywords: z.array(secureKeywordSchema).min(1).max(20).describe('List of searchable keywords'),
      chapters: z
        .array(
          z.object({
            title: z.string().min(1).max(200),
            content: secureContentSchema,
          })
        )
        .min(1)
        .max(50)
        .describe('List of chapter objects with title and content'),
    },
  },
  async ({ project_id, filename, title, introduction, keywords, chapters }) => {
    try {
      const [originalId, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);

      // Slugify filename and add .md extension if not present
      let safeFilename: string;
      if (filename.toLowerCase().endsWith('.md')) {
        const baseFilename = filename.slice(0, -3);
        safeFilename = slugify(baseFilename) + '.md';
      } else {
        safeFilename = slugify(filename) + '.md';
      }

      // Create knowledge directory
      const knowledgePath = join(projectPath, 'knowledge');
      if (!existsSync(knowledgePath)) {
        const fs = await import('fs');
        fs.mkdirSync(knowledgePath, { recursive: true });
      }

      // Construct file path
      const filePath = join(knowledgePath, safeFilename);

      // Check if file already exists
      if (existsSync(filePath)) {
        logMethodCall(STORAGE_PATH, 'create_knowledge_file', {
          project_id,
          filename: safeFilename,
          success: false,
          error: `File already exists: ${safeFilename}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `File already exists: ${safeFilename}`,
              }),
            },
          ],
        };
      }

      // Create document metadata
      const metadata: DocumentMetadata = {
        title,
        keywords,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // Build document content
      const contentParts = [introduction, ''];

      // Add chapters
      for (const chapter of chapters) {
        contentParts.push(`## ${chapter.title}`);
        contentParts.push('');
        contentParts.push(chapter.content);
        contentParts.push('');
      }

      const content = contentParts.join('\n').trim();

      // Write document
      writeDocument(filePath, metadata, content);

      // Git commit
      autoCommit(STORAGE_PATH, `Create knowledge file: ${safeFilename} for project ${originalId}`);

      logMethodCall(STORAGE_PATH, 'create_knowledge_file', {
        project_id,
        filename: safeFilename,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              filepath: `knowledge/${safeFilename}`,
              message: 'Knowledge document created successfully',
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error creating knowledge file:', error);
      logMethodCall(STORAGE_PATH, 'create_knowledge_file', {
        project_id,
        filename,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// Tool: update_chapter
server.registerTool(
  'update_chapter',
  {
    title: 'Update Chapter in Knowledge Document',
    description: `Update a specific chapter within a knowledge document by title (exact match required). 
Preserves document structure, metadata, and other chapters. 
Chapter title must match exactly including case. 
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
      chapter_title: z
        .string()
        .min(1)
        .max(200)
        .describe('Exact title of the chapter to update (case-sensitive)'),
      new_content: secureContentSchema.describe('New content for the chapter (without ## heading)'),
      new_summary: z
        .string()
        .max(500)
        .optional()
        .describe('Optional chapter summary for search results'),
    },
  },
  ({ project_id, filename, chapter_title, new_content, new_summary }) => {
    try {
      const [_, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);

      // Construct file path
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      if (!existsSync(filePath)) {
        logMethodCall(STORAGE_PATH, 'update_chapter', {
          project_id,
          filename,
          chapter_title,
          success: false,
          error: `File not found: ${filename}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `File not found: ${filename}`,
              }),
            },
          ],
        };
      }

      // Read existing document
      const content = readFileSync(filePath, 'utf8');
      const [metadata, body] = parseDocument(content);

      // Parse chapters
      const chapters = parseChapters(body);

      // Find the chapter to update
      let chapterFound = false;
      const updatedChapters: Chapter[] = [];

      for (const chapter of chapters) {
        if (chapter.title === chapter_title) {
          chapterFound = true;
          // Update chapter content
          updatedChapters.push({
            title: chapter.title,
            level: chapter.level,
            content: `## ${chapter.title}\n\n${new_content}`,
            summary: new_summary ?? chapter.summary,
          });
        } else {
          updatedChapters.push(chapter);
        }
      }

      if (!chapterFound) {
        logMethodCall(STORAGE_PATH, 'update_chapter', {
          project_id,
          filename,
          chapter_title,
          success: false,
          error: `Chapter not found: ${chapter_title}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Chapter not found: ${chapter_title}`,
              }),
            },
          ],
        };
      }

      // Reconstruct document body
      const bodyParts: string[] = [];

      // Add any content before first chapter
      if (chapters.length > 0 && body.startsWith(chapters[0].content)) {
        // No intro content
      } else {
        // Extract intro content
        const firstChapterPos =
          chapters.length > 0 ? body.indexOf(chapters[0].content) : body.length;
        const intro = body.slice(0, firstChapterPos).trim();
        if (intro) {
          bodyParts.push(intro);
          bodyParts.push('');
        }
      }

      // Add updated chapters
      for (const chapter of updatedChapters) {
        bodyParts.push(chapter.content.trim());
        bodyParts.push('');
      }

      const newBody = bodyParts.join('\n').trim();

      // Update metadata timestamp
      metadata.updated = new Date().toISOString();

      // Write updated document
      writeDocument(filePath, metadata, newBody);

      // Git commit
      autoCommit(STORAGE_PATH, `Update chapter '${chapter_title}' in ${filename}`);

      logMethodCall(STORAGE_PATH, 'update_chapter', {
        project_id,
        filename,
        chapter_title,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Chapter '${chapter_title}' updated successfully`,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error updating chapter:', error);
      logMethodCall(STORAGE_PATH, 'update_chapter', {
        project_id,
        filename,
        chapter_title,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// Tool: remove_chapter
server.registerTool(
  'remove_chapter',
  {
    title: 'Remove Chapter from Knowledge Document',
    description: `Remove a specific chapter from a knowledge document by title (exact match required). 
Preserves document structure, metadata, and other chapters. 
Chapter title must match exactly including case. 
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
      chapter_title: z
        .string()
        .min(1)
        .max(200)
        .describe('Exact title of the chapter to remove (case-sensitive)'),
    },
  },
  ({ project_id, filename, chapter_title }) => {
    try {
      const [originalId, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);

      // Construct file path
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      if (!existsSync(filePath)) {
        logMethodCall(STORAGE_PATH, 'remove_chapter', {
          project_id,
          filename,
          chapter_title,
          success: false,
          error: `File not found: ${filename}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `File not found: ${filename}`,
              }),
            },
          ],
        };
      }

      // Read existing document
      const content = readFileSync(filePath, 'utf8');
      const [metadata, body] = parseDocument(content);

      // Parse chapters
      const chapters = parseChapters(body);

      // Find and remove the chapter
      let chapterFound = false;
      const remainingChapters: Chapter[] = [];

      for (const chapter of chapters) {
        if (chapter.title === chapter_title) {
          chapterFound = true;
          // Skip this chapter (effectively removing it)
        } else {
          remainingChapters.push(chapter);
        }
      }

      if (!chapterFound) {
        logMethodCall(STORAGE_PATH, 'remove_chapter', {
          project_id,
          filename,
          chapter_title,
          success: false,
          error: `Chapter not found: ${chapter_title}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Chapter not found: ${chapter_title}`,
              }),
            },
          ],
        };
      }

      // Reconstruct document body
      const bodyParts: string[] = [];

      // Add any content before first chapter
      if (chapters.length > 0 && body.startsWith(chapters[0].content)) {
        // No intro content
      } else {
        // Extract intro content
        const firstChapterPos =
          chapters.length > 0 ? body.indexOf(chapters[0].content) : body.length;
        const intro = body.slice(0, firstChapterPos).trim();
        if (intro) {
          bodyParts.push(intro);
          bodyParts.push('');
        }
      }

      // Add remaining chapters
      for (const chapter of remainingChapters) {
        bodyParts.push(chapter.content.trim());
        bodyParts.push('');
      }

      const newBody = bodyParts.join('\n').trim();

      // Update metadata timestamp
      metadata.updated = new Date().toISOString();

      // Write updated document
      writeDocument(filePath, metadata, newBody);

      // Git commit
      autoCommit(
        STORAGE_PATH,
        `Remove chapter '${chapter_title}' from ${filename} for project ${originalId}`
      );

      logMethodCall(STORAGE_PATH, 'remove_chapter', {
        project_id,
        filename,
        chapter_title,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Chapter '${chapter_title}' removed successfully`,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error removing chapter:', error);
      logMethodCall(STORAGE_PATH, 'remove_chapter', {
        project_id,
        filename,
        chapter_title,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// Tool: delete_knowledge_file
server.registerTool(
  'delete_knowledge_file',
  {
    title: 'Delete Knowledge Document',
    description: `Delete a knowledge document permanently. This action cannot be undone. 
Returns: {success: bool, message?: str, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Full filename including .md extension'),
    },
  },
  async ({ project_id, filename }) => {
    try {
      const [originalId, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);

      // Construct file path
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      if (!existsSync(filePath)) {
        logMethodCall(STORAGE_PATH, 'delete_knowledge_file', {
          project_id,
          filename,
          success: false,
          error: `File not found: ${filename}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `File not found: ${filename}`,
              }),
            },
          ],
        };
      }

      // Delete file
      const fs = await import('fs');
      fs.unlinkSync(filePath);

      // Git commit removal
      autoCommit(STORAGE_PATH, `Delete knowledge file: ${filename} from project ${originalId}`);

      logMethodCall(STORAGE_PATH, 'delete_knowledge_file', {
        project_id,
        filename,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Knowledge document '${filename}' deleted successfully`,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error deleting knowledge file:', error);
      logMethodCall(STORAGE_PATH, 'delete_knowledge_file', {
        project_id,
        filename,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// Tool: get_knowledge_file
server.registerTool(
  'get_knowledge_file',
  {
    title: 'Get Full Knowledge Document',
    description: `Retrieve the complete content of a knowledge document including metadata and all chapters. 
This tool enables full document download/backup functionality. 
Returns: {success: bool, document?: object, error?: str}`,
    inputSchema: {
      project_id: secureProjectIdSchema.describe('The project identifier'),
      filename: secureFilenameSchema.describe('Knowledge file name (must include .md extension)'),
    },
  },
  ({ project_id, filename }) => {
    try {
      const [_, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);

      // Construct file path
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      if (!existsSync(filePath)) {
        logMethodCall(STORAGE_PATH, 'get_knowledge_file', {
          project_id,
          filename,
          success: false,
          error: `File not found: ${filename}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `File not found: ${filename}`,
              }),
            },
          ],
        };
      }

      // Read and parse document
      const content = readFileSync(filePath, 'utf8');
      const [metadata, body] = parseDocument(content);

      // Parse chapters
      const chapters = parseChapters(body);

      // Extract introduction (content before first chapter)
      let introduction = '';
      if (chapters.length > 0) {
        const firstChapterPos = body.indexOf(chapters[0].content);
        if (firstChapterPos > 0) {
          introduction = body.slice(0, firstChapterPos).trim();
        }
      } else {
        // No chapters, entire body is introduction
        introduction = body.trim();
      }

      // Format chapters for response
      const formattedChapters = chapters.map((chapter) => ({
        title: chapter.title,
        content: chapter.content.replace(/^## .*\n\n?/, '').trim(), // Remove heading line
        summary: chapter.summary,
      }));

      // Return complete document structure
      logMethodCall(STORAGE_PATH, 'get_knowledge_file', {
        project_id,
        filename,
        success: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              document: {
                filename,
                metadata: {
                  title: metadata.title,
                  keywords: metadata.keywords,
                  created: metadata.created,
                  updated: metadata.updated,
                },
                introduction,
                chapters: formattedChapters,
                full_content: content, // Include raw markdown for exact reconstruction
              },
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Error getting knowledge file:', error);
      logMethodCall(STORAGE_PATH, 'get_knowledge_file', {
        project_id,
        filename,
        success: false,
        error: String(error),
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: String(error),
            }),
          },
        ],
      };
    }
  }
);

// MCP Resources for read-only access

// Resource: Main project instructions
server.registerResource(
  'main',
  new ResourceTemplate('knowledge://projects/{project_id}/main', { list: undefined }),
  {
    title: 'Project Main Instructions',
    description: 'Read-only access to project main.md file',
  },
  (uri, params) => {
    try {
      const project_id = Array.isArray(params.project_id)
        ? params.project_id[0]
        : params.project_id;
      const [_, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);
      const mainFile = join(projectPath, 'main.md');

      if (existsSync(mainFile)) {
        const content = readFileSync(mainFile, 'utf8');
        return {
          contents: [
            {
              uri: uri.href,
              text: content,
            },
          ],
        };
      } else {
        return {
          contents: [
            {
              uri: uri.href,
              text: `# ${project_id}\n\nNo main instructions found for this project.`,
            },
          ],
        };
      }
    } catch (error) {
      logger.error('Error reading main resource:', error);
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${String(error)}`,
          },
        ],
      };
    }
  }
);

// Resource: List knowledge files
server.registerResource(
  'files',
  new ResourceTemplate('knowledge://projects/{project_id}/files', { list: undefined }),
  {
    title: 'Knowledge Files List',
    description: 'List all knowledge files in a project',
  },
  async (uri, params) => {
    try {
      const project_id = Array.isArray(params.project_id)
        ? params.project_id[0]
        : params.project_id;
      const [_, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);
      const knowledgePath = join(projectPath, 'knowledge');

      if (!existsSync(knowledgePath)) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(
                {
                  files: [],
                  count: 0,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const fs = await import('fs');
      const files: Array<{
        filename: string;
        title: string;
        keywords: string[];
        created: string;
        updated: string;
      }> = [];

      const mdFiles = fs.readdirSync(knowledgePath).filter((f) => f.endsWith('.md'));

      for (const mdFile of mdFiles) {
        try {
          const filePath = join(knowledgePath, mdFile);
          const content = readFileSync(filePath, 'utf8');
          const [metadata, _] = parseDocument(content);

          files.push({
            filename: mdFile,
            title: metadata.title ?? 'Untitled',
            keywords: metadata.keywords ?? [],
            created: metadata.created ?? '',
            updated: metadata.updated ?? '',
          });
        } catch {
          // Skip files that can't be parsed
          continue;
        }
      }

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                files,
                count: files.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error('Error listing files resource:', error);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                files: [],
                count: 0,
                error: String(error),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// Resource: List chapters in a file
server.registerResource(
  'chapters',
  new ResourceTemplate('knowledge://projects/{project_id}/chapters/{filename}', {
    list: undefined,
  }),
  {
    title: 'Document Chapters',
    description: 'List all chapters in a specific knowledge file',
  },
  (uri, params) => {
    try {
      const project_id = Array.isArray(params.project_id)
        ? params.project_id[0]
        : params.project_id;
      const filename = Array.isArray(params.filename) ? params.filename[0] : params.filename;
      const [_, projectPath] = getProjectDirectory(STORAGE_PATH, project_id);
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      if (!existsSync(filePath)) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(
                {
                  chapters: [],
                  error: 'File not found',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Read and parse document
      const content = readFileSync(filePath, 'utf8');
      const [metadata, body] = parseDocument(content);

      // Parse chapters
      const chapters = parseChapters(body);

      // Format chapter list
      const chapterList = chapters.map((chapter) => ({
        title: chapter.title,
        level: chapter.level,
        summary: chapter.summary,
      }));

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                filename,
                title: metadata.title ?? 'Untitled',
                chapters: chapterList,
                count: chapterList.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error('Error listing chapters resource:', error);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                chapters: [],
                error: String(error),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// Main function to run the server
export async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Knowledge MCP Server running on stdio');
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Fatal error running server:', error);
    process.exit(1);
  });
}
