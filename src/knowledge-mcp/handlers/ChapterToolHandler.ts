import { existsSync, readFileSync } from 'fs';
import { access, readFile } from 'fs/promises';
import { join } from 'path';

import type { z } from 'zod';

import { parseDocument, parseChapters, writeDocument, writeDocumentAsync } from '../documents.js';
import type { Chapter } from '../documents.js';
import { MCPError, MCPErrorCode } from '../errors/index.js';
import type {
  secureProjectIdSchema,
  secureFilenameSchema,
  secureChapterTitleSchema,
  secureChapterContentSchema,
  sectionPositionSchema,
} from '../schemas/validation.js';
import {
  getProjectDirectory,
  autoCommit,
  validatePath,
  getProjectDirectoryAsync,
  autoCommitAsync,
  validatePathAsync,
} from '../utils.js';

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
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Project doesn't exist - should not create ghost entries
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          filename,
          chapter_title,
          traceId: context.traceId,
        });
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
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Project doesn't exist - should not create ghost entries
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          filename,
          chapter_title,
          traceId: context.traceId,
        });
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

  /**
   * Add a new chapter to a knowledge file
   */
  addChapter(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    filename: z.infer<typeof secureFilenameSchema>;
    chapter_title: z.infer<typeof secureChapterTitleSchema>;
    content: z.infer<typeof secureChapterContentSchema>;
    position?: z.infer<typeof sectionPositionSchema>;
    reference_chapter?: z.infer<typeof secureChapterTitleSchema>;
  }): string {
    const context = this.createContext('add_chapter', params);

    try {
      const {
        project_id,
        filename,
        chapter_title,
        content,
        position = 'end',
        reference_chapter,
      } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Project doesn't exist - should not create ghost entries
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          filename,
          chapter_title,
          traceId: context.traceId,
        });
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

      // Read and parse the document
      const fileContent = readFileSync(filePath, 'utf8');
      const [metadata, body] = parseDocument(fileContent);
      const chapters = parseChapters(body);

      // Check if chapter already exists
      for (const chapter of chapters) {
        if (chapter.title === chapter_title) {
          throw new MCPError(
            MCPErrorCode.FILE_ALREADY_EXISTS,
            `Chapter "${chapter_title}" already exists in ${filename}`,
            { project_id, filename, chapter_title, traceId: context.traceId }
          );
        }
      }

      // Extract introduction (content before first chapter)
      const firstChapterIndex = body.indexOf('\n##');
      const introduction = firstChapterIndex > 0 ? body.slice(0, firstChapterIndex).trim() : '';

      // Create new chapter
      const newChapter: Chapter = {
        title: chapter_title,
        level: 2,
        content: `## ${chapter_title}\n\n${content}`,
        summary: content.split('\n')[0].slice(0, 100) + '...',
      };

      let updatedChapters: Chapter[];

      if (position === 'end') {
        // Add at the end
        updatedChapters = [...chapters, newChapter];
      } else if ((position === 'before' || position === 'after') && reference_chapter) {
        // Find reference chapter
        const refIndex = chapters.findIndex((ch) => ch.title === reference_chapter);

        if (refIndex === -1) {
          throw new MCPError(
            MCPErrorCode.CHAPTER_NOT_FOUND,
            `Reference chapter "${reference_chapter}" not found in ${filename}`,
            { project_id, filename, reference_chapter, traceId: context.traceId }
          );
        }

        if (position === 'before') {
          // Insert before reference chapter
          updatedChapters = [
            ...chapters.slice(0, refIndex),
            newChapter,
            ...chapters.slice(refIndex),
          ];
        } else {
          // Insert after reference chapter
          updatedChapters = [
            ...chapters.slice(0, refIndex + 1),
            newChapter,
            ...chapters.slice(refIndex + 1),
          ];
        }
      } else {
        throw new MCPError(
          MCPErrorCode.INVALID_INPUT,
          'Position "before" or "after" requires reference_chapter',
          { project_id, position, traceId: context.traceId }
        );
      }

      // Update metadata
      metadata.updated = new Date().toISOString();

      // Build document content
      const documentContent = [introduction, '', ...updatedChapters.map((ch) => ch.content)].join(
        '\n\n'
      );

      // Write updated document
      const validatedPath = validatePath(knowledgePath, filename);
      writeDocument(validatedPath, metadata, documentContent);

      // Auto-commit
      autoCommit(this.storagePath, `Add chapter "${chapter_title}" to ${filename}`);

      this.logSuccess('add_chapter', { project_id, filename, chapter_title }, context);
      return this.formatSuccessResponse({
        message: `Chapter "${chapter_title}" added to ${filename}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to add chapter: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                chapter_title: params.chapter_title,
                traceId: context.traceId,
              }
            );
      this.logError(
        'add_chapter',
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
   * Update a chapter in a knowledge file (async version)
   */
  async updateChapterAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    filename: z.infer<typeof secureFilenameSchema>;
    chapter_title: z.infer<typeof secureChapterTitleSchema>;
    new_content: z.infer<typeof secureChapterContentSchema>;
    new_summary?: string;
  }): Promise<string> {
    const context = this.createContext('update_chapter', params);

    try {
      const { project_id, filename, chapter_title, new_content, new_summary } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      // Project doesn't exist - should not create ghost entries
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          filename,
          chapter_title,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      try {
        await access(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new MCPError(
            MCPErrorCode.DOCUMENT_NOT_FOUND,
            `Knowledge file ${filename} not found in project ${originalId}`,
            { project_id, filename, traceId: context.traceId }
          );
        }
        throw error;
      }

      // Read and parse the document
      const content = await readFile(filePath, 'utf8');
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
      const validatedPath = await validatePathAsync(knowledgePath, filename);
      await writeDocumentAsync(validatedPath, metadata, documentContent);

      // Auto-commit
      await autoCommitAsync(this.storagePath, `Update chapter "${chapter_title}" in ${filename}`);

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
   * Remove a chapter from a knowledge file (async version)
   */
  async removeChapterAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    filename: z.infer<typeof secureFilenameSchema>;
    chapter_title: z.infer<typeof secureChapterTitleSchema>;
  }): Promise<string> {
    const context = this.createContext('remove_chapter', params);

    try {
      const { project_id, filename, chapter_title } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      // Project doesn't exist - should not create ghost entries
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          filename,
          chapter_title,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      try {
        await access(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new MCPError(
            MCPErrorCode.DOCUMENT_NOT_FOUND,
            `Knowledge file ${filename} not found in project ${originalId}`,
            { project_id, filename, traceId: context.traceId }
          );
        }
        throw error;
      }

      // Read and parse the document
      const content = await readFile(filePath, 'utf8');
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
      const validatedPath = await validatePathAsync(knowledgePath, filename);
      await writeDocumentAsync(validatedPath, metadata, documentContent);

      // Auto-commit
      await autoCommitAsync(this.storagePath, `Remove chapter "${chapter_title}" from ${filename}`);

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

  /**
   * Add a new chapter to a knowledge file (async version)
   */
  async addChapterAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    filename: z.infer<typeof secureFilenameSchema>;
    chapter_title: z.infer<typeof secureChapterTitleSchema>;
    content: z.infer<typeof secureChapterContentSchema>;
    position?: z.infer<typeof sectionPositionSchema>;
    reference_chapter?: z.infer<typeof secureChapterTitleSchema>;
  }): Promise<string> {
    const context = this.createContext('add_chapter', params);

    try {
      const {
        project_id,
        filename,
        chapter_title,
        content,
        position = 'end',
        reference_chapter,
      } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      // Project doesn't exist - should not create ghost entries
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          filename,
          chapter_title,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      try {
        await access(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new MCPError(
            MCPErrorCode.DOCUMENT_NOT_FOUND,
            `Knowledge file ${filename} not found in project ${originalId}`,
            { project_id, filename, traceId: context.traceId }
          );
        }
        throw error;
      }

      // Read and parse the document
      const fileContent = await readFile(filePath, 'utf8');
      const [metadata, body] = parseDocument(fileContent);
      const chapters = parseChapters(body);

      // Check if chapter already exists
      for (const chapter of chapters) {
        if (chapter.title === chapter_title) {
          throw new MCPError(
            MCPErrorCode.FILE_ALREADY_EXISTS,
            `Chapter "${chapter_title}" already exists in ${filename}`,
            { project_id, filename, chapter_title, traceId: context.traceId }
          );
        }
      }

      // Extract introduction (content before first chapter)
      const firstChapterIndex = body.indexOf('\n##');
      const introduction = firstChapterIndex > 0 ? body.slice(0, firstChapterIndex).trim() : '';

      // Create new chapter
      const newChapter: Chapter = {
        title: chapter_title,
        level: 2,
        content: `## ${chapter_title}\n\n${content}`,
        summary: content.split('\n')[0].slice(0, 100) + '...',
      };

      let updatedChapters: Chapter[];

      if (position === 'end') {
        // Add at the end
        updatedChapters = [...chapters, newChapter];
      } else if ((position === 'before' || position === 'after') && reference_chapter) {
        // Find reference chapter
        const refIndex = chapters.findIndex((ch) => ch.title === reference_chapter);

        if (refIndex === -1) {
          throw new MCPError(
            MCPErrorCode.CHAPTER_NOT_FOUND,
            `Reference chapter "${reference_chapter}" not found in ${filename}`,
            { project_id, filename, reference_chapter, traceId: context.traceId }
          );
        }

        if (position === 'before') {
          // Insert before reference chapter
          updatedChapters = [
            ...chapters.slice(0, refIndex),
            newChapter,
            ...chapters.slice(refIndex),
          ];
        } else {
          // Insert after reference chapter
          updatedChapters = [
            ...chapters.slice(0, refIndex + 1),
            newChapter,
            ...chapters.slice(refIndex + 1),
          ];
        }
      } else {
        throw new MCPError(
          MCPErrorCode.INVALID_INPUT,
          'Position "before" or "after" requires reference_chapter',
          { project_id, position, traceId: context.traceId }
        );
      }

      // Update metadata
      metadata.updated = new Date().toISOString();

      // Build document content
      const documentContent = [introduction, '', ...updatedChapters.map((ch) => ch.content)].join(
        '\n\n'
      );

      // Write updated document
      const validatedPath = await validatePathAsync(knowledgePath, filename);
      await writeDocumentAsync(validatedPath, metadata, documentContent);

      // Auto-commit
      await autoCommitAsync(this.storagePath, `Add chapter "${chapter_title}" to ${filename}`);

      this.logSuccess('add_chapter', { project_id, filename, chapter_title }, context);
      return this.formatSuccessResponse({
        message: `Chapter "${chapter_title}" added to ${filename}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to add chapter: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                chapter_title: params.chapter_title,
                traceId: context.traceId,
              }
            );
      this.logError(
        'add_chapter',
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
