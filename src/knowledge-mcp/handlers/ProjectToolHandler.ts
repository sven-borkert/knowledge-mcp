import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

import type { z } from 'zod';

import { MCPError, MCPErrorCode } from '../errors/index.js';
import type {
  secureProjectIdSchema,
  secureContentSchema,
  secureSectionHeaderSchema,
  sectionPositionSchema,
  referenceHeaderSchema,
} from '../schemas/validation.js';
import {
  getProjectDirectory,
  getProjectDirectoryAsync,
  createProjectEntry,
  createProjectEntryAsync,
  autoCommit,
  autoCommitAsync,
  validatePath,
  validatePathAsync,
  deleteProjectDirectory,
  deleteProjectDirectoryAsync,
  acquireFileLock,
} from '../utils.js';

import { BaseHandler } from './BaseHandler.js';

export class ProjectToolHandler extends BaseHandler {
  /**
   * Get project main instructions
   */
  getProjectMain(params: z.infer<typeof secureProjectIdSchema>): string {
    const context = this.createContext('get_project_main', { project_id: params });

    try {
      const project_id = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Project doesn't exist - return exists: false
      if (!projectInfo) {
        this.logSuccess('get_project_main', { project_id }, context);
        return this.formatSuccessResponse({
          exists: false,
          content: '',
        });
      }

      const [, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      if (!existsSync(mainFile)) {
        this.logSuccess('get_project_main', { project_id }, context);
        return this.formatSuccessResponse({
          exists: false,
          content: '',
        });
      }

      const content = readFileSync(mainFile, 'utf8');
      this.logSuccess('get_project_main', { project_id }, context);
      return this.formatSuccessResponse({
        exists: true,
        content,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.PROJECT_NOT_FOUND,
              `Failed to get project main: ${error instanceof Error ? error.message : String(error)}`,
              { project_id: params, method: 'get_project_main', traceId: context.traceId }
            );
      this.logError('get_project_main', { project_id: params }, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Update project main instructions
   */
  updateProjectMain(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    content: z.infer<typeof secureContentSchema>;
  }): string {
    const context = this.createContext('update_project_main', params);

    try {
      const { project_id, content } = params;
      // Use createProjectEntry for write operations that create new projects
      const [originalId, projectPath] = createProjectEntry(this.storagePath, project_id);

      // Create project directory if it doesn't exist
      mkdirSync(projectPath, { recursive: true });

      // Write main.md file
      const validatedPath = validatePath(projectPath, 'main.md');
      writeFileSync(validatedPath, content);

      // Auto-commit changes
      autoCommit(this.storagePath, `Update project main for ${originalId}`);

      this.logSuccess('update_project_main', { project_id }, context);
      return this.formatSuccessResponse({
        message: `Project main updated for ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to update project main: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                method: 'update_project_main',
                traceId: context.traceId,
              }
            );
      this.logError('update_project_main', { project_id: params.project_id }, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Update a specific section in project main
   */
  updateProjectSection(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    section_header: z.infer<typeof secureSectionHeaderSchema>;
    new_content: z.infer<typeof secureContentSchema>;
  }): string {
    const context = this.createContext('update_project_section', params);

    try {
      const { project_id, section_header, new_content } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Project doesn't exist - should not create ghost entries
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} does not exist`, {
          project_id,
          section_header,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      if (!existsSync(mainFile)) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${originalId} does not exist`, {
          project_id,
          section_header,
          traceId: context.traceId,
        });
      }

      const content = readFileSync(mainFile, 'utf8');
      const lines = content.split('\n');

      // Find the section
      let sectionStart = -1;
      let sectionEnd = lines.length;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === section_header.trim()) {
          sectionStart = i;
          // Find the end of this section (next ## header or end of file)
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].startsWith('## ')) {
              sectionEnd = j;
              break;
            }
          }
          break;
        }
      }

      if (sectionStart === -1) {
        throw new MCPError(
          MCPErrorCode.SECTION_NOT_FOUND,
          `Section "${section_header}" not found in project main`,
          { project_id, section_header, traceId: context.traceId }
        );
      }

      // Replace the section content
      const newLines = [
        ...lines.slice(0, sectionStart + 1),
        '',
        new_content,
        '',
        ...lines.slice(sectionEnd),
      ];

      const updatedContent = newLines.join('\n');
      writeFileSync(mainFile, updatedContent);

      autoCommit(this.storagePath, `Update section "${section_header}" in ${originalId}`);

      this.logSuccess('update_project_section', { project_id, section_header }, context);
      return this.formatSuccessResponse({
        message: `Section "${section_header}" updated in project ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.INTERNAL_ERROR,
              `Failed to update project section: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                section_header: params.section_header,
                traceId: context.traceId,
              }
            );
      this.logError(
        'update_project_section',
        {
          project_id: params.project_id,
          section_header: params.section_header,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Remove a section from project main
   */
  removeProjectSection(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    section_header: z.infer<typeof secureSectionHeaderSchema>;
  }): string {
    const context = this.createContext('remove_project_section', params);

    try {
      const { project_id, section_header } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Project doesn't exist - should not create ghost entries
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} does not exist`, {
          project_id,
          section_header,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      if (!existsSync(mainFile)) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${originalId} does not exist`, {
          project_id,
          section_header,
          traceId: context.traceId,
        });
      }

      const content = readFileSync(mainFile, 'utf8');
      const lines = content.split('\n');

      // Find the section
      let sectionStart = -1;
      let sectionEnd = lines.length;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === section_header.trim()) {
          sectionStart = i;
          // Find the end of this section (next ## header or end of file)
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].startsWith('## ')) {
              sectionEnd = j;
              break;
            }
          }
          break;
        }
      }

      if (sectionStart === -1) {
        throw new MCPError(
          MCPErrorCode.SECTION_NOT_FOUND,
          `Section "${section_header}" not found in project main`,
          { project_id, section_header, traceId: context.traceId }
        );
      }

      // Remove the section
      const newLines = [...lines.slice(0, sectionStart), ...lines.slice(sectionEnd)];

      const updatedContent = newLines.join('\n').replace(/\n\n\n+/g, '\n\n');
      writeFileSync(mainFile, updatedContent);

      autoCommit(this.storagePath, `Remove section "${section_header}" from ${originalId}`);

      this.logSuccess('remove_project_section', { project_id, section_header }, context);
      return this.formatSuccessResponse({
        message: `Section "${section_header}" removed from project ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.INTERNAL_ERROR,
              `Failed to remove project section: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                section_header: params.section_header,
                traceId: context.traceId,
              }
            );
      this.logError(
        'remove_project_section',
        {
          project_id: params.project_id,
          section_header: params.section_header,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Add a new section to project main
   */
  addProjectSection(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    section_header: z.infer<typeof secureSectionHeaderSchema>;
    content: z.infer<typeof secureContentSchema>;
    position?: z.infer<typeof sectionPositionSchema>;
    reference_header?: z.infer<typeof referenceHeaderSchema>;
  }): string {
    const context = this.createContext('add_project_section', params);

    try {
      const { project_id, section_header, content, position = 'end', reference_header } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Project doesn't exist - should not create ghost entries
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} does not exist`, {
          project_id,
          section_header,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      if (!existsSync(mainFile)) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${originalId} does not exist`, {
          project_id,
          section_header,
          traceId: context.traceId,
        });
      }

      const fileContent = readFileSync(mainFile, 'utf8');
      const lines = fileContent.split('\n');

      // Check if section already exists
      for (const line of lines) {
        if (line.trim() === section_header.trim()) {
          throw new MCPError(
            MCPErrorCode.FILE_ALREADY_EXISTS,
            `Section "${section_header}" already exists in project main`,
            { project_id, section_header, traceId: context.traceId }
          );
        }
      }

      let newLines: string[];

      if (position === 'end') {
        // Add at the end
        newLines = [...lines, '', section_header, '', content];
      } else if ((position === 'before' || position === 'after') && reference_header) {
        // Find reference section
        let refIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() === reference_header.trim()) {
            refIndex = i;
            break;
          }
        }

        if (refIndex === -1) {
          throw new MCPError(
            MCPErrorCode.SECTION_NOT_FOUND,
            `Reference section "${reference_header}" not found in project main`,
            { project_id, reference_header, traceId: context.traceId }
          );
        }

        if (position === 'before') {
          // Insert before reference section
          newLines = [
            ...lines.slice(0, refIndex),
            section_header,
            '',
            content,
            '',
            ...lines.slice(refIndex),
          ];
        } else {
          // Insert after reference section
          // Find the end of the reference section
          let sectionEnd = lines.length;
          for (let j = refIndex + 1; j < lines.length; j++) {
            if (lines[j].startsWith('## ')) {
              sectionEnd = j;
              break;
            }
          }

          newLines = [
            ...lines.slice(0, sectionEnd),
            '',
            section_header,
            '',
            content,
            ...lines.slice(sectionEnd),
          ];
        }
      } else {
        throw new MCPError(
          MCPErrorCode.INVALID_INPUT,
          'Position "before" or "after" requires reference_header',
          { project_id, position, traceId: context.traceId }
        );
      }

      // Clean up extra blank lines
      const cleanedContent = newLines.join('\n').replace(/\n{3,}/g, '\n\n');
      writeFileSync(mainFile, cleanedContent);

      autoCommit(this.storagePath, `Add section "${section_header}" to ${originalId}`);

      this.logSuccess('add_project_section', { project_id, section_header }, context);
      return this.formatSuccessResponse({
        message: `Section "${section_header}" added to project ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.INTERNAL_ERROR,
              `Failed to add project section: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                section_header: params.section_header,
                traceId: context.traceId,
              }
            );
      this.logError(
        'add_project_section',
        {
          project_id: params.project_id,
          section_header: params.section_header,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  // ============================================
  // ASYNC VERSIONS OF METHODS
  // ============================================

  /**
   * Async version of getProjectMain
   */
  async getProjectMainAsync(params: z.infer<typeof secureProjectIdSchema>): Promise<string> {
    const context = this.createContext('get_project_main', { project_id: params });

    try {
      const project_id = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      // Project doesn't exist - return exists: false
      if (!projectInfo) {
        await this.logSuccessAsync('get_project_main', { project_id }, context);
        return this.formatSuccessResponse({
          exists: false,
          content: '',
        });
      }

      const [, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      try {
        await access(mainFile);
        const content = await readFile(mainFile, 'utf8');
        await this.logSuccessAsync('get_project_main', { project_id }, context);
        return this.formatSuccessResponse({
          exists: true,
          content,
        });
      } catch {
        await this.logSuccessAsync('get_project_main', { project_id }, context);
        return this.formatSuccessResponse({
          exists: false,
          content: '',
        });
      }
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.PROJECT_NOT_FOUND,
              `Failed to get project main: ${error instanceof Error ? error.message : String(error)}`,
              { project_id: params, method: 'get_project_main', traceId: context.traceId }
            );
      await this.logErrorAsync('get_project_main', { project_id: params }, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Async version of updateProjectMain
   */
  async updateProjectMainAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    content: z.infer<typeof secureContentSchema>;
  }): Promise<string> {
    const context = this.createContext('update_project_main', params);

    try {
      const { project_id, content } = params;
      // Use createProjectEntryAsync for write operations that create new projects
      const [originalId, projectPath] = await createProjectEntryAsync(this.storagePath, project_id);

      // Create project directory if it doesn't exist
      await mkdir(projectPath, { recursive: true });

      // Write main.md file
      const validatedPath = await validatePathAsync(projectPath, 'main.md');
      await writeFile(validatedPath, content);

      // Auto-commit changes
      await autoCommitAsync(this.storagePath, `Update project main for ${originalId}`);

      await this.logSuccessAsync('update_project_main', { project_id }, context);
      return this.formatSuccessResponse({
        message: `Project main updated for ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to update project main: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                method: 'update_project_main',
                traceId: context.traceId,
              }
            );
      await this.logErrorAsync(
        'update_project_main',
        { project_id: params.project_id },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Async version of updateProjectSection
   */
  async updateProjectSectionAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    section_header: z.infer<typeof secureSectionHeaderSchema>;
    new_content: z.infer<typeof secureContentSchema>;
  }): Promise<string> {
    const context = this.createContext('update_project_section', params);

    try {
      const { project_id, section_header, new_content } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      // Check if project exists
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      try {
        await access(mainFile);
      } catch {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${originalId} does not exist`, {
          project_id,
          section_header,
          traceId: context.traceId,
        });
      }

      const content = await readFile(mainFile, 'utf8');
      const lines = content.split('\n');

      // Find the section
      let sectionStart = -1;
      let sectionEnd = lines.length;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === section_header.trim()) {
          sectionStart = i;
          // Find the end of this section (next ## header or end of file)
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].startsWith('## ')) {
              sectionEnd = j;
              break;
            }
          }
          break;
        }
      }

      if (sectionStart === -1) {
        throw new MCPError(
          MCPErrorCode.SECTION_NOT_FOUND,
          `Section "${section_header}" not found in project main`,
          { project_id, section_header, traceId: context.traceId }
        );
      }

      // Replace the section content
      const newLines = [
        ...lines.slice(0, sectionStart + 1),
        '',
        new_content,
        '',
        ...lines.slice(sectionEnd),
      ];

      const updatedContent = newLines.join('\n');
      await writeFile(mainFile, updatedContent);

      await autoCommitAsync(
        this.storagePath,
        `Update section "${section_header}" in ${originalId}`
      );

      await this.logSuccessAsync('update_project_section', { project_id, section_header }, context);
      return this.formatSuccessResponse({
        message: `Section "${section_header}" updated in project ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.INTERNAL_ERROR,
              `Failed to update project section: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                section_header: params.section_header,
                traceId: context.traceId,
              }
            );
      await this.logErrorAsync(
        'update_project_section',
        {
          project_id: params.project_id,
          section_header: params.section_header,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Async version of removeProjectSection
   */
  async removeProjectSectionAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    section_header: z.infer<typeof secureSectionHeaderSchema>;
  }): Promise<string> {
    const context = this.createContext('remove_project_section', params);

    try {
      const { project_id, section_header } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      // Check if project exists
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      try {
        await access(mainFile);
      } catch {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${originalId} does not exist`, {
          project_id,
          section_header,
          traceId: context.traceId,
        });
      }

      const content = await readFile(mainFile, 'utf8');
      const lines = content.split('\n');

      // Find the section
      let sectionStart = -1;
      let sectionEnd = lines.length;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === section_header.trim()) {
          sectionStart = i;
          // Find the end of this section (next ## header or end of file)
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].startsWith('## ')) {
              sectionEnd = j;
              break;
            }
          }
          break;
        }
      }

      if (sectionStart === -1) {
        throw new MCPError(
          MCPErrorCode.SECTION_NOT_FOUND,
          `Section "${section_header}" not found in project main`,
          { project_id, section_header, traceId: context.traceId }
        );
      }

      // Remove the section
      const newLines = [...lines.slice(0, sectionStart), ...lines.slice(sectionEnd)];

      const updatedContent = newLines.join('\n').replace(/\n\n\n+/g, '\n\n');
      await writeFile(mainFile, updatedContent);

      await autoCommitAsync(
        this.storagePath,
        `Remove section "${section_header}" from ${originalId}`
      );

      await this.logSuccessAsync('remove_project_section', { project_id, section_header }, context);
      return this.formatSuccessResponse({
        message: `Section "${section_header}" removed from project ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.INTERNAL_ERROR,
              `Failed to remove project section: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                section_header: params.section_header,
                traceId: context.traceId,
              }
            );
      await this.logErrorAsync(
        'remove_project_section',
        {
          project_id: params.project_id,
          section_header: params.section_header,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Async version of addProjectSection
   */
  async addProjectSectionAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    section_header: z.infer<typeof secureSectionHeaderSchema>;
    content: z.infer<typeof secureContentSchema>;
    position?: z.infer<typeof sectionPositionSchema>;
    reference_header?: z.infer<typeof referenceHeaderSchema>;
  }): Promise<string> {
    const context = this.createContext('add_project_section', params);

    try {
      const { project_id, section_header, content, position = 'end', reference_header } = params;

      // Validate parameters
      if ((position === 'before' || position === 'after') && !reference_header) {
        throw new MCPError(
          MCPErrorCode.INVALID_INPUT,
          'reference_header is required when position is "before" or "after"',
          { project_id, section_header, position, traceId: context.traceId }
        );
      }

      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      // Check if project exists
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      try {
        await access(mainFile);
      } catch {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${originalId} does not exist`, {
          project_id,
          section_header,
          traceId: context.traceId,
        });
      }

      // Use file locking to prevent race conditions in concurrent section additions
      await acquireFileLock(mainFile, async () => {
        const currentContent = await readFile(mainFile, 'utf8');
        const lines = currentContent.split('\n');

        // Check if section already exists
        const existingSection = lines.find((line) => line.trim() === section_header.trim());
        if (existingSection) {
          throw new MCPError(
            MCPErrorCode.SECTION_ALREADY_EXISTS,
            `Section "${section_header}" already exists in project main`,
            { project_id, section_header, traceId: context.traceId }
          );
        }

        // Find insertion point
        let insertIndex = lines.length;

        if (position === 'before' || position === 'after') {
          const referenceIndex = lines.findIndex(
            (line) => line.trim() === reference_header?.trim()
          );
          if (referenceIndex === -1) {
            throw new MCPError(
              MCPErrorCode.SECTION_NOT_FOUND,
              `Reference section "${reference_header}" not found in project main`,
              { project_id, reference_header, traceId: context.traceId }
            );
          }

          if (position === 'before') {
            insertIndex = referenceIndex;
          } else {
            // position === 'after'
            // Find the end of the reference section
            insertIndex = referenceIndex + 1;
            while (insertIndex < lines.length && !lines[insertIndex].startsWith('## ')) {
              insertIndex++;
            }
          }
        }

        // Prepare new section content based on position and content
        let newLines: string[];

        if (position === 'end' && ((lines.length === 1 && lines[0] === '') || lines.length === 0)) {
          // Special case for empty project
          newLines = ['', '', section_header, '', content];
        } else if (position === 'end') {
          // Add at the end with proper spacing
          newLines = [...lines, '', section_header, '', content];
        } else {
          // Insert at specific position
          const newSection = [section_header, '', content, ''];
          newLines = [...lines.slice(0, insertIndex), ...newSection, ...lines.slice(insertIndex)];
        }

        const updatedContent = newLines.join('\n').replace(/\n\n\n+/g, '\n\n');
        await writeFile(mainFile, updatedContent);

        // Also commit inside the lock to ensure atomicity
        await autoCommitAsync(this.storagePath, `Add section "${section_header}" to ${originalId}`);
      });

      await this.logSuccessAsync(
        'add_project_section',
        {
          project_id,
          section_header,
          position,
          reference_header,
        },
        context
      );
      return this.formatSuccessResponse({
        message: `Section "${section_header}" added to project ${originalId}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.INTERNAL_ERROR,
              `Failed to add project section: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                section_header: params.section_header,
                position: params.position,
                reference_header: params.reference_header,
                traceId: context.traceId,
              }
            );
      await this.logErrorAsync(
        'add_project_section',
        {
          project_id: params.project_id,
          section_header: params.section_header,
          position: params.position,
          reference_header: params.reference_header,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Delete project and all its content
   */
  deleteProject(params: z.infer<typeof secureProjectIdSchema>): string {
    const context = this.createContext('delete_project', { project_id: params });

    try {
      const project_id = params;

      // Use the utility function to delete the project
      deleteProjectDirectory(this.storagePath, project_id);

      // Auto-commit the deletion
      autoCommit(this.storagePath, `Delete project: ${project_id}`);

      const result = {
        project_id,
        message: `Project '${project_id}' successfully deleted`,
      };

      this.logSuccess('delete_project', { project_id }, context);
      return this.formatSuccessResponse(result);
    } catch (error) {
      const mcpError =
        error instanceof Error && error.message.includes('not found')
          ? new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project '${params}' not found`, {
              project_id: params,
              traceId: context.traceId,
            })
          : new MCPError(
              MCPErrorCode.PROJECT_DELETE_FAILED,
              `Failed to delete project '${params}': ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params,
                traceId: context.traceId,
                originalError: error,
              }
            );

      this.logError('delete_project', { project_id: params }, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Async version of deleteProject
   */
  async deleteProjectAsync(params: z.infer<typeof secureProjectIdSchema>): Promise<string> {
    const context = this.createContext('delete_project', { project_id: params });

    try {
      const project_id = params;

      // Use the async utility function to delete the project
      await deleteProjectDirectoryAsync(this.storagePath, project_id);

      // Auto-commit the deletion
      await autoCommitAsync(this.storagePath, `Delete project: ${project_id}`);

      const result = {
        project_id,
        message: `Project '${project_id}' successfully deleted`,
      };

      await this.logSuccessAsync('delete_project', { project_id }, context);
      return this.formatSuccessResponse(result);
    } catch (error) {
      const mcpError =
        error instanceof Error && error.message.includes('not found')
          ? new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project '${params}' not found`, {
              project_id: params,
              traceId: context.traceId,
            })
          : new MCPError(
              MCPErrorCode.PROJECT_DELETE_FAILED,
              `Failed to delete project '${params}': ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params,
                traceId: context.traceId,
                originalError: error,
              }
            );

      await this.logErrorAsync('delete_project', { project_id: params }, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }
}
