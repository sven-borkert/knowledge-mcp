import { existsSync, readFileSync, readdirSync } from 'fs';
import { access, readFile, readdir } from 'fs/promises';
import { join } from 'path';

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

import { parseDocument, parseChapters } from '../documents.js';
import { MCPError, MCPErrorCode } from '../errors/index.js';
import { getProjectDirectory, getProjectDirectoryAsync } from '../utils.js';

import { BaseHandler } from './BaseHandler.js';

export class ResourceHandler extends BaseHandler {
  /**
   * Get project main resource
   */
  getProjectMainResource(uri: URL, params: Record<string, unknown>): ReadResourceResult {
    const context = this.createContext('get_project_main_resource', { uri: uri.href, ...params });

    try {
      const project_id = Array.isArray(params.project_id)
        ? String(params.project_id[0])
        : String(params.project_id);
      const projectInfo = getProjectDirectory(this.storagePath, String(project_id));

      // Project doesn't exist - return not found without creating ghost entry
      if (!projectInfo) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Project ${project_id} not found`,
            },
          ],
        };
      }

      const [originalId, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      if (!existsSync(mainFile)) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Project ${originalId} not found`,
            },
          ],
        };
      }

      const content = readFileSync(mainFile, 'utf8');
      this.logSuccess('get_project_main_resource', { project_id }, context);
      return {
        contents: [
          {
            uri: uri.href,
            text: content,
          },
        ],
      };
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to read project main resource: ${error instanceof Error ? error.message : String(error)}`,
              { project_id: params.project_id, uri: uri.href, traceId: context.traceId }
            );
      this.logError(
        'get_project_main_resource',
        { project_id: String(params.project_id) },
        mcpError,
        context
      );
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${mcpError.message}`,
          },
        ],
      };
    }
  }

  /**
   * List knowledge files resource
   */
  listKnowledgeFilesResource(uri: URL, params: Record<string, unknown>): ReadResourceResult {
    const context = this.createContext('list_knowledge_files_resource', {
      uri: uri.href,
      ...params,
    });

    try {
      const project_id = Array.isArray(params.project_id)
        ? String(params.project_id[0])
        : String(params.project_id);
      const projectInfo = getProjectDirectory(this.storagePath, String(project_id));

      // Project doesn't exist - return empty list without creating ghost entry
      if (!projectInfo) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ files: [] }, null, 2),
            },
          ],
        };
      }

      const [, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');

      if (!existsSync(knowledgePath)) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ files: [] }, null, 2),
            },
          ],
        };
      }

      const files = readdirSync(knowledgePath)
        .filter((f) => f.endsWith('.md'))
        .map((mdFile) => {
          try {
            const content = readFileSync(join(knowledgePath, mdFile), 'utf8');
            const [metadata, _] = parseDocument(content);

            return {
              filename: mdFile,
              title: metadata.title ?? 'Untitled',
              keywords: metadata.keywords ?? [],
              created: metadata.created ?? '',
              updated: metadata.updated ?? '',
            } as const;
          } catch {
            // Skip files that can't be parsed
            return null;
          }
        })
        .filter((f) => f !== null);

      this.logSuccess('list_knowledge_files_resource', { project_id }, context);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ files }, null, 2),
          },
        ],
      };
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to list knowledge files: ${error instanceof Error ? error.message : String(error)}`,
              { project_id: params.project_id, uri: uri.href, traceId: context.traceId }
            );
      this.logError(
        'list_knowledge_files_resource',
        { project_id: String(params.project_id) },
        mcpError,
        context
      );
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${mcpError.message}`,
          },
        ],
      };
    }
  }

  /**
   * List chapters in a file resource
   */
  listChaptersResource(uri: URL, params: Record<string, unknown>): ReadResourceResult {
    const context = this.createContext('list_chapters_resource', { uri: uri.href, ...params });

    try {
      const project_id = Array.isArray(params.project_id)
        ? String(params.project_id[0])
        : String(params.project_id);
      const filename = Array.isArray(params.filename)
        ? String(params.filename[0])
        : String(params.filename);
      const projectInfo = getProjectDirectory(this.storagePath, String(project_id));

      // Project doesn't exist - return not found without creating ghost entry
      if (!projectInfo) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Project ${project_id} not found`,
            },
          ],
        };
      }

      const [, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, String(filename));

      if (!existsSync(filePath)) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `File ${filename} not found`,
            },
          ],
        };
      }

      const content = readFileSync(filePath, 'utf8');
      const [metadata, body] = parseDocument(content);
      const chapters = parseChapters(body);

      const chapterList = chapters.map((ch) => ({
        title: ch.title,
        summary: ch.summary,
      }));

      this.logSuccess('list_chapters_resource', { project_id, filename }, context);
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
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to list chapters: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: String(params.project_id),
                filename: String(params.filename),
                uri: uri.href,
                traceId: context.traceId,
              }
            );
      this.logError(
        'list_chapters_resource',
        { project_id: String(params.project_id), filename: String(params.filename) },
        mcpError,
        context
      );
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${mcpError.message}`,
          },
        ],
      };
    }
  }

  /**
   * Get project main resource (async version)
   */
  async getProjectMainResourceAsync(
    uri: URL,
    params: Record<string, unknown>
  ): Promise<ReadResourceResult> {
    const context = this.createContext('get_project_main_resource', { uri: uri.href, ...params });

    try {
      const project_id = Array.isArray(params.project_id)
        ? String(params.project_id[0])
        : String(params.project_id);
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, String(project_id));

      // Project doesn't exist - return not found without creating ghost entry
      if (!projectInfo) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Project ${project_id} not found`,
            },
          ],
        };
      }

      const [originalId, projectPath] = projectInfo;
      const mainFile = join(projectPath, 'main.md');

      try {
        const content = await readFile(mainFile, 'utf8');
        this.logSuccess('get_project_main_resource', { project_id }, context);
        return {
          contents: [
            {
              uri: uri.href,
              text: content,
            },
          ],
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return {
            contents: [
              {
                uri: uri.href,
                text: `Project ${originalId} not found`,
              },
            ],
          };
        }
        throw error;
      }
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to read project main resource: ${error instanceof Error ? error.message : String(error)}`,
              { project_id: params.project_id, uri: uri.href, traceId: context.traceId }
            );
      this.logError(
        'get_project_main_resource',
        { project_id: String(params.project_id) },
        mcpError,
        context
      );
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${mcpError.message}`,
          },
        ],
      };
    }
  }

  /**
   * List knowledge files resource (async version)
   */
  async listKnowledgeFilesResourceAsync(
    uri: URL,
    params: Record<string, unknown>
  ): Promise<ReadResourceResult> {
    const context = this.createContext('list_knowledge_files_resource', {
      uri: uri.href,
      ...params,
    });

    try {
      const project_id = Array.isArray(params.project_id)
        ? String(params.project_id[0])
        : String(params.project_id);
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, String(project_id));

      // Project doesn't exist - return empty list without creating ghost entry
      if (!projectInfo) {
        return {
          contents: [
            {
              uri: uri.href,
              text: '[]',
              mimeType: 'application/json',
            },
          ],
        };
      }

      const [, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');

      // Check if knowledge directory exists
      try {
        await access(knowledgePath);
      } catch {
        return {
          contents: [
            {
              uri: uri.href,
              text: '[]',
              mimeType: 'application/json',
            },
          ],
        };
      }

      // Read all .md files from knowledge directory
      const files = await readdir(knowledgePath);
      const mdFiles = files.filter((file) => file.endsWith('.md'));

      // Read metadata from each file
      const fileInfos = await Promise.all(
        mdFiles.map(async (file) => {
          try {
            const filePath = join(knowledgePath, file);
            const content = await readFile(filePath, 'utf8');
            const [metadata] = parseDocument(content);

            return {
              filename: file,
              title: metadata.title ?? file.replace('.md', ''),
              keywords: metadata.keywords ?? [],
              created: metadata.created ?? '',
              updated: metadata.updated ?? '',
            };
          } catch (error) {
            console.error(`Error reading ${file}:`, error);
            return null;
          }
        })
      );

      // Filter out nulls and convert to JSON
      const validFiles = fileInfos.filter((info) => info !== null);
      this.logSuccess(
        'list_knowledge_files_resource',
        { project_id, count: validFiles.length },
        context
      );
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(validFiles, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to list knowledge files: ${error instanceof Error ? error.message : String(error)}`,
              { project_id: params.project_id, uri: uri.href, traceId: context.traceId }
            );
      this.logError(
        'list_knowledge_files_resource',
        { project_id: String(params.project_id) },
        mcpError,
        context
      );
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${mcpError.message}`,
          },
        ],
      };
    }
  }

  /**
   * List chapters resource (async version)
   */
  async listChaptersResourceAsync(
    uri: URL,
    params: Record<string, unknown>
  ): Promise<ReadResourceResult> {
    const context = this.createContext('list_chapters_resource', { uri: uri.href, ...params });

    try {
      const project_id = Array.isArray(params.project_id)
        ? String(params.project_id[0])
        : String(params.project_id);
      const filename = Array.isArray(params.filename)
        ? String(params.filename[0])
        : String(params.filename);
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, String(project_id));

      // Project doesn't exist - return empty list without creating ghost entry
      if (!projectInfo) {
        return {
          contents: [
            {
              uri: uri.href,
              text: '[]',
              mimeType: 'application/json',
            },
          ],
        };
      }

      const [, projectPath] = projectInfo;
      const knowledgePath = join(projectPath, 'knowledge');
      const filePath = join(knowledgePath, filename);

      // Check if file exists
      try {
        await access(filePath);
      } catch {
        return {
          contents: [
            {
              uri: uri.href,
              text: '[]',
              mimeType: 'application/json',
            },
          ],
        };
      }

      // Read and parse the document
      const content = await readFile(filePath, 'utf8');
      const [metadata, body] = parseDocument(content);
      const chapters = parseChapters(body);

      // Format chapters for response
      const chapterList = chapters.map((ch) => ({
        title: ch.title,
        level: ch.level,
        summary: ch.summary,
      }));

      this.logSuccess(
        'list_chapters_resource',
        { project_id, filename, count: chapterList.length },
        context
      );
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                document: {
                  filename,
                  title: metadata.title ?? filename.replace('.md', ''),
                  keywords: metadata.keywords ?? [],
                },
                chapters: chapterList,
              },
              null,
              2
            ),
            mimeType: 'application/json',
          },
        ],
      };
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to list chapters: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: String(params.project_id),
                filename: String(params.filename),
                uri: uri.href,
                traceId: context.traceId,
              }
            );
      this.logError(
        'list_chapters_resource',
        { project_id: String(params.project_id), filename: String(params.filename) },
        mcpError,
        context
      );
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${mcpError.message}`,
          },
        ],
      };
    }
  }
}
