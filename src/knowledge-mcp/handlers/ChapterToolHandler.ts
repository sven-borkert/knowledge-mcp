import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import type { z } from 'zod';

import { parseDocument, parseChapters, writeDocument } from '../documents.js';
import type { Chapter } from '../documents.js';
import { MCPError, MCPErrorCode } from '../errors/index.js';
import type {
  secureProjectIdSchema,
  secureFilenameSchema,
  secureChapterTitleSchema,
  secureChapterContentSchema,
} from '../schemas/validation.js';
import { getProjectDirectory, autoCommit, validatePath } from '../utils.js';

import { BaseHandler } from './BaseHandler.js';

export class ChapterToolHandler extends BaseHandler {
  /**
   * Update a chapter in a knowledge file
   */
  updateChapter(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    filename: z.infer<typeof secureFilenameSchema>;
    chapter_title: z.infer<typeof secureChapterTitleSchema>;
    new_content: z.infer<typeof secureChapterContentSchema>;
    new_summary?: string;
  }): string {
    const context = this.createContext('update_chapter', params);

    try {
      const { project_id, filename, chapter_title, new_content, new_summary } = params;
      const [originalId, projectPath] = getProjectDirectory(this.storagePath, project_id);
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

      // Read and parse the document
      const content = readFileSync(filePath, 'utf8');
      const [metadata, body] = parseDocument(content);
      const chapters = parseChapters(body);

      // Find and update the chapter
      let chapterFound = false;
      const updatedChapters: Chapter[] = [];

      for (const chapter of chapters) {
        if (chapter.title === chapter_title) {
          chapterFound = true;
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
        throw new MCPError(
          MCPErrorCode.CHAPTER_NOT_FOUND,
          `Chapter "${chapter_title}" not found in ${filename}`,
          { project_id, filename, chapter_title, traceId: context.traceId }
        );
      }

      // Update metadata
      metadata.updated = new Date().toISOString();

      // Extract introduction (content before first chapter)
      const firstChapterIndex = body.indexOf('\n##');
      const introduction = firstChapterIndex > 0 ? body.slice(0, firstChapterIndex).trim() : '';

      // Build document content
      const documentContent = [introduction, '', ...updatedChapters.map((ch) => ch.content)].join(
        '\n\n'
      );

      // Write updated document
      const validatedPath = validatePath(knowledgePath, filename);
      writeDocument(validatedPath, metadata, documentContent);

      // Auto-commit
      autoCommit(this.storagePath, `Update chapter "${chapter_title}" in ${filename}`);

      this.logSuccess('update_chapter', { project_id, filename, chapter_title }, context);
      return this.formatSuccessResponse({
        message: `Chapter "${chapter_title}" updated in ${filename}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to update chapter: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                chapter_title: params.chapter_title,
                traceId: context.traceId,
              }
            );
      this.logError(
        'update_chapter',
        {
          project_id: params.project_id,
          filename: params.filename,
          chapter_title: params.chapter_title,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Remove a chapter from a knowledge file
   */
  removeChapter(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    filename: z.infer<typeof secureFilenameSchema>;
    chapter_title: z.infer<typeof secureChapterTitleSchema>;
  }): string {
    const context = this.createContext('remove_chapter', params);

    try {
      const { project_id, filename, chapter_title } = params;
      const [originalId, projectPath] = getProjectDirectory(this.storagePath, project_id);
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

      // Read and parse the document
      const content = readFileSync(filePath, 'utf8');
      const [metadata, body] = parseDocument(content);
      const chapters = parseChapters(body);

      // Find and remove the chapter
      const originalCount = chapters.length;
      const updatedChapters = chapters.filter((ch) => ch.title !== chapter_title);

      if (updatedChapters.length === originalCount) {
        throw new MCPError(
          MCPErrorCode.CHAPTER_NOT_FOUND,
          `Chapter "${chapter_title}" not found in ${filename}`,
          { project_id, filename, chapter_title, traceId: context.traceId }
        );
      }

      // Update metadata
      metadata.updated = new Date().toISOString();

      // Extract introduction
      const firstChapterIndex = body.indexOf('\n##');
      const introduction = firstChapterIndex > 0 ? body.slice(0, firstChapterIndex).trim() : '';

      // Build document content
      const documentContent = [introduction, '', ...updatedChapters.map((ch) => ch.content)].join(
        '\n\n'
      );

      // Write updated document
      const validatedPath = validatePath(knowledgePath, filename);
      writeDocument(validatedPath, metadata, documentContent);

      // Auto-commit
      autoCommit(this.storagePath, `Remove chapter "${chapter_title}" from ${filename}`);

      this.logSuccess('remove_chapter', { project_id, filename, chapter_title }, context);
      return this.formatSuccessResponse({
        message: `Chapter "${chapter_title}" removed from ${filename}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to remove chapter: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                chapter_title: params.chapter_title,
                traceId: context.traceId,
              }
            );
      this.logError(
        'remove_chapter',
        {
          project_id: params.project_id,
          filename: params.filename,
          chapter_title: params.chapter_title,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }
}
