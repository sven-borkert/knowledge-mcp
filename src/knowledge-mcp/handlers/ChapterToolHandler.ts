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

  /**
   * List all chapters in a knowledge document (lightweight - titles and summaries only)
   */
  async listChaptersAsync(params: { project_id: string; filename: string }): Promise<string> {
    const context = this.createContext('list_chapters', params);

    try {
      const { project_id, filename } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = await validatePathAsync(knowledgePath, filename);

      // Check if file exists
      try {
        await access(filePath);
      } catch {
        throw new MCPError(
          MCPErrorCode.DOCUMENT_NOT_FOUND,
          `Knowledge file ${filename} not found`,
          { project_id, filename, traceId: context.traceId }
        );
      }

      // Read and parse the document
      const content = await readFile(filePath, 'utf8');
      const [, body] = parseDocument(content);
      const chapters = parseChapters(body);

      // Return lightweight chapter list
      const chapterList = chapters.map((chapter, index) => ({
        title: chapter.title,
        summary: chapter.summary,
        index,
      }));

      return this.formatSuccessResponse({
        project_id,
        filename,
        total_chapters: chapters.length,
        chapters: chapterList,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to list chapters: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                traceId: context.traceId,
              }
            );
      this.logError('list_chapters', params, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Get a single chapter by title or index
   */
  async getChapterAsync(
    params: {
      project_id: string;
      filename: string;
    } & (
      | { chapter_title: string; chapter_index?: never }
      | { chapter_index: number; chapter_title?: never }
    )
  ): Promise<string> {
    const context = this.createContext('get_chapter', params);

    try {
      const { project_id, filename, chapter_title, chapter_index } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = await validatePathAsync(knowledgePath, filename);

      // Check if file exists
      try {
        await access(filePath);
      } catch {
        throw new MCPError(
          MCPErrorCode.DOCUMENT_NOT_FOUND,
          `Knowledge file ${filename} not found`,
          { project_id, filename, traceId: context.traceId }
        );
      }

      // Read and parse the document
      const content = await readFile(filePath, 'utf8');
      const [, body] = parseDocument(content);
      const chapters = parseChapters(body);

      // Find the requested chapter
      let targetChapter: Chapter | undefined;
      let targetIndex: number;

      if (chapter_title !== undefined) {
        // Find by title
        targetIndex = chapters.findIndex((ch) => ch.title === chapter_title);
        if (targetIndex === -1) {
          throw new MCPError(
            MCPErrorCode.CHAPTER_NOT_FOUND,
            `Chapter "${chapter_title}" not found in ${filename}`,
            { project_id, filename, chapter_title, traceId: context.traceId }
          );
        }
        targetChapter = chapters[targetIndex];
      } else if (chapter_index !== undefined) {
        // Find by index
        if (chapter_index < 0 || chapter_index >= chapters.length) {
          throw new MCPError(
            MCPErrorCode.INVALID_INPUT,
            `Chapter index ${chapter_index} out of range (0-${chapters.length - 1})`,
            {
              project_id,
              filename,
              chapter_index,
              total_chapters: chapters.length,
              traceId: context.traceId,
            }
          );
        }
        targetIndex = chapter_index;
        targetChapter = chapters[targetIndex];
      } else {
        throw new MCPError(
          MCPErrorCode.INVALID_INPUT,
          'Must specify either chapter_title or chapter_index',
          { project_id, filename, traceId: context.traceId }
        );
      }

      return this.formatSuccessResponse({
        project_id,
        filename,
        title: targetChapter.title,
        content: targetChapter.content,
        summary: targetChapter.summary,
        index: targetIndex,
        total_chapters: chapters.length,
        has_next: targetIndex < chapters.length - 1,
        has_previous: targetIndex > 0,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to get chapter: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                traceId: context.traceId,
              }
            );
      this.logError('get_chapter', params, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Get the next chapter after the current one
   */
  async getNextChapterAsync(
    params: {
      project_id: string;
      filename: string;
    } & (
      | { current_chapter_title: string; current_index?: never }
      | { current_index: number; current_chapter_title?: never }
    )
  ): Promise<string> {
    const context = this.createContext('get_next_chapter', params);

    try {
      const { project_id, filename, current_chapter_title, current_index } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = await validatePathAsync(knowledgePath, filename);

      // Check if file exists
      try {
        await access(filePath);
      } catch {
        throw new MCPError(
          MCPErrorCode.DOCUMENT_NOT_FOUND,
          `Knowledge file ${filename} not found`,
          { project_id, filename, traceId: context.traceId }
        );
      }

      // Read and parse the document
      const content = await readFile(filePath, 'utf8');
      const [, body] = parseDocument(content);
      const chapters = parseChapters(body);

      // Find current chapter index
      let currentIdx: number;

      if (current_chapter_title !== undefined) {
        // Find by title
        currentIdx = chapters.findIndex((ch) => ch.title === current_chapter_title);
        if (currentIdx === -1) {
          throw new MCPError(
            MCPErrorCode.CHAPTER_NOT_FOUND,
            `Current chapter "${current_chapter_title}" not found in ${filename}`,
            { project_id, filename, current_chapter_title, traceId: context.traceId }
          );
        }
      } else if (current_index !== undefined) {
        // Use provided index
        if (current_index < 0 || current_index >= chapters.length) {
          throw new MCPError(
            MCPErrorCode.INVALID_INPUT,
            `Current chapter index ${current_index} out of range (0-${chapters.length - 1})`,
            {
              project_id,
              filename,
              current_index,
              total_chapters: chapters.length,
              traceId: context.traceId,
            }
          );
        }
        currentIdx = current_index;
      } else {
        throw new MCPError(
          MCPErrorCode.INVALID_INPUT,
          'Must specify either current_chapter_title or current_index',
          { project_id, filename, traceId: context.traceId }
        );
      }

      // Check if there's a next chapter
      const nextIdx = currentIdx + 1;
      if (nextIdx >= chapters.length) {
        return this.formatSuccessResponse({
          project_id,
          filename,
          has_next: false,
          message: 'No more chapters after the current one',
          current_index: currentIdx,
          total_chapters: chapters.length,
        });
      }

      const nextChapter = chapters[nextIdx];
      return this.formatSuccessResponse({
        project_id,
        filename,
        title: nextChapter.title,
        content: nextChapter.content,
        summary: nextChapter.summary,
        index: nextIdx,
        total_chapters: chapters.length,
        has_next: nextIdx < chapters.length - 1,
        has_previous: true,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to get next chapter: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                filename: params.filename,
                traceId: context.traceId,
              }
            );
      this.logError('get_next_chapter', params, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }
}
