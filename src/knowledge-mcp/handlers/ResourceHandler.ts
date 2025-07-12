import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

import { parseDocument, parseChapters } from '../documents.js';
import { getProjectDirectory } from '../utils.js';

import { BaseHandler } from './BaseHandler.js';

export class ResourceHandler extends BaseHandler {
  /**
   * Get project main resource
   */
  getProjectMainResource(uri: URL, params: Record<string, unknown>): ReadResourceResult {
    try {
      const project_id = Array.isArray(params.project_id)
        ? String(params.project_id[0])
        : String(params.project_id);
      const [originalId, projectPath] = getProjectDirectory(this.storagePath, String(project_id));
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
      return {
        contents: [
          {
            uri: uri.href,
            text: content,
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  /**
   * List knowledge files resource
   */
  listKnowledgeFilesResource(uri: URL, params: Record<string, unknown>): ReadResourceResult {
    try {
      const project_id = Array.isArray(params.project_id)
        ? String(params.project_id[0])
        : String(params.project_id);
      const [, projectPath] = getProjectDirectory(this.storagePath, String(project_id));
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

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ files }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  /**
   * List chapters in a file resource
   */
  listChaptersResource(uri: URL, params: Record<string, unknown>): ReadResourceResult {
    try {
      const project_id = Array.isArray(params.project_id)
        ? String(params.project_id[0])
        : String(params.project_id);
      const filename = Array.isArray(params.filename)
        ? String(params.filename[0])
        : String(params.filename);
      const [, projectPath] = getProjectDirectory(this.storagePath, String(project_id));
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
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
}
