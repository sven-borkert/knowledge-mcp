import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

import type { z } from 'zod';

import { parseDocument, writeDocument } from '../documents.js';
import type { DocumentMetadata, Chapter } from '../documents.js';
import { MCPError, MCPErrorCode } from '../errors/index.js';
import type {
  secureProjectIdSchema,
  secureFilenameSchema,
  secureKeywordSchema,
  secureChapterTitleSchema,
  secureChapterContentSchema,
} from '../schemas/validation.js';
import { getProjectDirectory, createProjectEntry, autoCommit, validatePath, slugify } from '../utils.js';

import { BaseHandler } from './BaseHandler.js';

export class KnowledgeToolHandler extends BaseHandler {
  /**
   * Create a new knowledge file
   */
  createKnowledgeFile(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    filename: z.infer<typeof secureFilenameSchema>;
    title: string;
    introduction: string;
    keywords: z.infer<typeof secureKeywordSchema>[];
    chapters: Array<{
      title: z.infer<typeof secureChapterTitleSchema>;
      content: z.infer<typeof secureChapterContentSchema>;
    }>;
  }): string {
    const context = this.createContext('create_knowledge_file', params);

    try {
      const { project_id, filename, title, introduction, keywords, chapters } = params;
      // Use createProjectEntry for write operations that create new projects
      const [originalId, projectPath] = createProjectEntry(this.storagePath, project_id);
      const knowledgePath = join(projectPath, 'knowledge');

      // Create knowledge directory if it doesn't exist
      mkdirSync(knowledgePath, { recursive: true });

      // Ensure filename has .md extension
      const safeFilename = slugify(filename);
      const mdFilename = safeFilename.endsWith('.md') ? safeFilename : `${safeFilename}.md`;
      const filePath = join(knowledgePath, mdFilename);

      // Check if file already exists
      if (existsSync(filePath)) {
        throw new MCPError(
          MCPErrorCode.FILE_ALREADY_EXISTS,
          `Knowledge file ${mdFilename} already exists`,
          { project_id, filename: mdFilename, traceId: context.traceId }
        );
      }

      // Prepare metadata
      const metadata: DocumentMetadata = {
        title,
        keywords,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // Prepare chapters
      const formattedChapters: Chapter[] = chapters.map((ch) => ({
        title: ch.title,
        level: 2,
        content: `## ${ch.title}\n\n${ch.content}`,
        summary: ch.content.split('\n')[0].slice(0, 100) + '...',
      }));

      // Build document content
      const documentContent = [introduction, '', ...formattedChapters.map((ch) => ch.content)].join(
        '\n\n'
      );

      // Write the document
      const validatedPath = validatePath(knowledgePath, mdFilename);
      writeDocument(validatedPath, metadata, documentContent);

      // Auto-commit
      autoCommit(this.storagePath, `Create knowledge file ${mdFilename} in ${originalId}`);

      this.logSuccess('create_knowledge_file', { project_id, filename: mdFilename }, context);
      return this.formatSuccessResponse({
        filepath: `knowledge/${mdFilename}`,
        message: `Knowledge file ${mdFilename} created in project ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to create knowledge file: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                traceId: context.traceId,
              }
            );
      this.logError(
        'create_knowledge_file',
        {
          project_id: params.project_id,
          filename: params.filename,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Get complete knowledge file with all content
   */
  getKnowledgeFile(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    filename: z.infer<typeof secureFilenameSchema>;
  }): string {
    const context = this.createContext('get_knowledge_file', params);

    try {
      const { project_id, filename } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);
      
      // Project doesn't exist - return error without creating ghost entry
      if (!projectInfo) {
        throw new MCPError(
          MCPErrorCode.PROJECT_NOT_FOUND,
          `Project ${project_id} not found`,
          { project_id, filename, traceId: context.traceId }
        );
      }
      
      const [originalId, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      if (!existsSync(filePath)) {
        throw new MCPError(
          MCPErrorCode.DOCUMENT_NOT_FOUND,
          `Knowledge file ${filename} not found in project ${originalId}`,
          { project_id, filename, traceId: context.traceId }
        );
      }

      // Read the entire file
      const content = readFileSync(filePath, 'utf8');
      const [metadata, body] = parseDocument(content);

      // Parse chapters from body
      const chapters = body
        .split(/^## /m)
        .slice(1)
        .map((chapterText) => {
          const lines = chapterText.split('\n');
          const title = lines[0].trim();
          const content = lines.slice(1).join('\n').trim();

          return {
            title,
            content,
            summary: content.split('\n')[0].slice(0, 100) + '...',
          };
        });

      this.logSuccess('get_knowledge_file', { project_id, filename }, context);
      return this.formatSuccessResponse({
        document: {
          filename,
          metadata,
          full_content: body,
          chapters,
        },
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.DOCUMENT_NOT_FOUND,
              `Failed to get knowledge file: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                traceId: context.traceId,
              }
            );
      this.logError(
        'get_knowledge_file',
        {
          project_id: params.project_id,
          filename: params.filename,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Delete a knowledge file
   */
  deleteKnowledgeFile(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    filename: z.infer<typeof secureFilenameSchema>;
  }): string {
    const context = this.createContext('delete_knowledge_file', params);

    try {
      const { project_id, filename } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);
      
      // Project doesn't exist - return error without creating ghost entry
      if (!projectInfo) {
        throw new MCPError(
          MCPErrorCode.PROJECT_NOT_FOUND,
          `Project ${project_id} not found`,
          { project_id, filename, traceId: context.traceId }
        );
      }
      
      const [originalId, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      if (!existsSync(filePath)) {
        throw new MCPError(
          MCPErrorCode.DOCUMENT_NOT_FOUND,
          `Knowledge file ${filename} not found in project ${originalId}`,
          { project_id, filename, traceId: context.traceId }
        );
      }

      // Delete the file
      unlinkSync(filePath);

      // Auto-commit
      autoCommit(this.storagePath, `Delete knowledge file ${filename} from ${originalId}`);

      this.logSuccess('delete_knowledge_file', { project_id, filename }, context);
      return this.formatSuccessResponse({
        message: `Knowledge file ${filename} deleted from project ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to delete knowledge file: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                traceId: context.traceId,
              }
            );
      this.logError(
        'delete_knowledge_file',
        {
          project_id: params.project_id,
          filename: params.filename,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }
}
