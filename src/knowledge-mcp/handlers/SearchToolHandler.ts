import type { z } from 'zod';

import { searchDocuments, searchDocumentsAsync } from '../documents.js';
import type { SearchResult } from '../documents.js';
import { MCPError, MCPErrorCode } from '../errors/index.js';
import type { secureProjectIdSchema, secureSearchQuerySchema } from '../schemas/validation.js';
import { getProjectDirectory, getProjectDirectoryAsync } from '../utils.js';

import { BaseHandler } from './BaseHandler.js';

export class SearchToolHandler extends BaseHandler {
  /**
   * Search knowledge documents
   */
  searchKnowledge(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    query: z.infer<typeof secureSearchQuerySchema>;
  }): string {
    const context = this.createContext('search_knowledge', params);

    try {
      const { project_id, query } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Project doesn't exist - return empty results without creating ghost entry
      if (!projectInfo) {
        this.logSuccess('search_knowledge', { project_id }, context);
        return this.formatSuccessResponse({
          total_documents: 0,
          total_matches: 0,
          results: [],
        });
      }

      const [, projectPath] = projectInfo;

      // Parse search keywords
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((k) => k.length > 0);

      // Search documents - pass projectPath, not knowledgePath
      const results = searchDocuments(projectPath, keywords.join(' '));

      // Transform results for response - matching test expectations
      const transformedResults = results.map((result: SearchResult) => ({
        document: result.file,
        chapters: result.matching_chapters.map((ch) => ({
          title: ch.chapter || '(Document Introduction)',
          matches: ch.keywords_found.length,
        })),
      }));

      this.logSuccess('search_knowledge', { project_id }, context);
      return this.formatSuccessResponse({
        total_documents: transformedResults.length,
        total_matches: results.reduce((sum, r) => sum + r.match_count, 0),
        results: transformedResults,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.INTERNAL_ERROR,
              `Search failed: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                query: params.query,
                traceId: context.traceId,
              }
            );
      this.logError(
        'search_knowledge',
        {
          project_id: params.project_id,
          query: params.query,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Search knowledge documents (async version)
   */
  async searchKnowledgeAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    query: z.infer<typeof secureSearchQuerySchema>;
  }): Promise<string> {
    const context = this.createContext('search_knowledge', params);

    try {
      const { project_id, query } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      // Project doesn't exist - return empty results without creating ghost entry
      if (!projectInfo) {
        this.logSuccess('search_knowledge', { project_id }, context);
        return this.formatSuccessResponse({
          total_documents: 0,
          total_matches: 0,
          results: [],
        });
      }

      const [, projectPath] = projectInfo;

      // Parse search keywords
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((k) => k.length > 0);

      // Search documents - pass projectPath, not knowledgePath
      const results = await searchDocumentsAsync(projectPath, keywords.join(' '));

      // Transform results for response - matching test expectations
      const transformedResults = results.map((result: SearchResult) => ({
        document: result.file,
        chapters: result.matching_chapters.map((ch) => ({
          title: ch.chapter || '(Document Introduction)',
          matches: ch.keywords_found.length,
        })),
      }));

      this.logSuccess('search_knowledge', { project_id }, context);
      return this.formatSuccessResponse({
        total_documents: transformedResults.length,
        total_matches: results.reduce((sum, r) => sum + r.match_count, 0),
        results: transformedResults,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.INTERNAL_ERROR,
              `Search failed: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                query: params.query,
                traceId: context.traceId,
              }
            );
      this.logError(
        'search_knowledge',
        {
          project_id: params.project_id,
          query: params.query,
        },
        mcpError,
        context
      );
      return this.formatErrorResponse(mcpError, context);
    }
  }
}
