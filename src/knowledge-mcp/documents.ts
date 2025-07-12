import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { access, readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

import fm from 'front-matter';
import * as yaml from 'js-yaml';

export interface DocumentMetadata {
  title?: string;
  keywords?: string[];
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

export interface Chapter {
  title: string;
  level: number;
  summary: string;
  content: string;
}

export interface SearchResult {
  file: string;
  match_count: number;
  metadata: DocumentMetadata;
  matching_chapters: MatchingChapter[];
}

export interface MatchingChapter {
  chapter: string;
  keywords_found: string[];
  match_context: Record<string, string[]>;
  chapter_summary: string;
}

/**
 * Parse a markdown document with frontmatter.
 * Returns tuple of [metadata, body content]
 */
export function parseDocument(content: string): [DocumentMetadata, string] {
  try {
    const parsed = fm(content);

    // Ensure metadata is an object
    const metadata = (parsed.attributes as DocumentMetadata) || {};

    // Validate YAML safety by re-parsing with safe_load
    if (content.startsWith('---')) {
      const fmMatch = content.match(/^---\n(.*?)\n---/s);
      if (fmMatch) {
        const yamlContent = fmMatch[1];
        try {
          // Verify it can be safely loaded
          yaml.load(yamlContent);
        } catch (error) {
          throw new Error(
            `Invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    return [metadata, parsed.body];
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('constructor')) {
        throw new Error('Invalid YAML frontmatter: Unsafe YAML tags detected');
      }
      throw new Error(`Invalid YAML frontmatter: ${error.message}`);
    }
    throw new Error('Invalid YAML frontmatter');
  }
}

/**
 * Parse markdown content into chapters based on headers.
 */
export function parseChapters(content: string): Chapter[] {
  if (!content.trim()) {
    return [];
  }

  const chapters: Chapter[] = [];
  const lines = content.split('\n');

  let currentChapter: Chapter | null = null;
  let chapterLines: string[] = [];

  for (const line of lines) {
    // Check for markdown headers (##, ###, ####)
    const headerMatch = line.match(/^(#{2,4})\s+(.+)$/);

    if (headerMatch) {
      // Save previous chapter if exists
      if (currentChapter) {
        // Extract summary from chapter content
        const contentLines = chapterLines.slice(1); // Skip header line
        const summaryLines: string[] = [];

        // Look for summary lines - stop at empty line or after 2-3 lines
        for (let j = 0; j < contentLines.length; j++) {
          const cl = contentLines[j];
          if (!cl.trim() && summaryLines.length > 0) {
            // Empty line after content - stop
            break;
          }
          if (cl.trim()) {
            summaryLines.push(cl.trim());
            // Check if next line is empty (end of summary paragraph)
            if (j + 1 < contentLines.length && !contentLines[j + 1].trim()) {
              break;
            }
            // Or stop after getting a reasonable summary
            if (summaryLines.join(' ').length > 100) {
              break;
            }
          }
        }

        currentChapter.summary = summaryLines.join(' ');
        currentChapter.content = chapterLines.join('\n');
        chapters.push(currentChapter);
      }

      // Start new chapter
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      currentChapter = {
        title,
        level,
        summary: '',
        content: '',
      };
      chapterLines = [line];
    } else {
      // Add line to current chapter
      if (currentChapter) {
        chapterLines.push(line);
      }
    }
  }

  // Save last chapter
  if (currentChapter) {
    // Extract summary
    const contentLines = chapterLines.slice(1);
    const summaryLines: string[] = [];

    for (let j = 0; j < contentLines.length; j++) {
      const cl = contentLines[j];
      if (!cl.trim() && summaryLines.length > 0) {
        break;
      }
      if (cl.trim()) {
        summaryLines.push(cl.trim());
        if (j + 1 < contentLines.length && !contentLines[j + 1].trim()) {
          break;
        }
        if (summaryLines.join(' ').length > 100) {
          break;
        }
      }
    }

    currentChapter.summary = summaryLines.join(' ');
    currentChapter.content = chapterLines.join('\n');
    chapters.push(currentChapter);
  }

  return chapters;
}

/**
 * Write a document with frontmatter.
 */
export function writeDocument(path: string, metadata: DocumentMetadata, content: string): void {
  if (!metadata || Object.keys(metadata).length === 0) {
    throw new Error('Missing required metadata');
  }

  // Create parent directory if needed
  const parentDir = dirname(path);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  // Create document with frontmatter
  const frontmatter = yaml.dump(metadata);
  const fullContent = `---\n${frontmatter}---\n${content}`;

  // Write atomically using temp file
  const tempFile = join(tmpdir(), `knowledge-mcp-${randomBytes(8).toString('hex')}.tmp`);
  writeFileSync(tempFile, fullContent, 'utf8');

  // Rename temp file to final location
  writeFileSync(path, fullContent, 'utf8');
}

/**
 * Search knowledge documents for a query.
 */
export function searchDocuments(projectPath: string, query: string): SearchResult[] {
  if (!query) {
    return [];
  }

  const knowledgeDir = join(projectPath, 'knowledge');
  if (!existsSync(knowledgeDir)) {
    return [];
  }

  // Split query into individual keywords
  const keywords = query
    .split(/\s+/)
    .map((kw) => kw.trim().toLowerCase())
    .filter((kw) => kw);

  if (keywords.length === 0) {
    return [];
  }

  // Structure to aggregate results by document
  const documentResults: Record<
    string,
    {
      metadata: DocumentMetadata;
      matching_chapters: Record<
        string,
        {
          chapter: string;
          keywords_found: Set<string>;
          match_context: Record<string, string[]>;
          chapter_summary: string;
        }
      >;
    }
  > = {};

  // Search through all markdown files
  const mdFiles = readdirSync(knowledgeDir).filter((f) => f.endsWith('.md'));

  for (const mdFile of mdFiles) {
    try {
      const filePath = join(knowledgeDir, mdFile);
      const content = readFileSync(filePath, 'utf8');

      // Parse document
      const [metadata, body] = parseDocument(content);
      const chapters = parseChapters(body);

      // Search each keyword
      for (const keyword of keywords) {
        const bodyLower = body.toLowerCase();

        // If no chapters, search entire body
        if (chapters.length === 0 && bodyLower.includes(keyword)) {
          const contexts: string[] = [];
          let startPos = 0;

          let index = bodyLower.indexOf(keyword, startPos);
          while (index !== -1) {
            // Extract context
            const ctxStart = Math.max(0, index - 50);
            const ctxEnd = Math.min(body.length, index + keyword.length + 50);
            let context = body.slice(ctxStart, ctxEnd).trim();

            if (ctxStart > 0) context = '...' + context;
            if (ctxEnd < body.length) context = context + '...';

            contexts.push(context);
            startPos = index + 1;
            index = bodyLower.indexOf(keyword, startPos);
          }

          if (contexts.length > 0) {
            // Initialize document entry if needed
            if (!(mdFile in documentResults)) {
              documentResults[mdFile] = {
                metadata,
                matching_chapters: {},
              };
            }

            // Add body-level match as a special chapter
            if (!('_document_body' in documentResults[mdFile].matching_chapters)) {
              documentResults[mdFile].matching_chapters['_document_body'] = {
                chapter: '',
                keywords_found: new Set(),
                match_context: {},
                chapter_summary: '',
              };
            }

            const chapterData = documentResults[mdFile].matching_chapters['_document_body'];
            chapterData.keywords_found.add(keyword);
            if (!(keyword in chapterData.match_context)) {
              chapterData.match_context[keyword] = [];
            }
            chapterData.match_context[keyword].push(...contexts);
          }
        }

        // Search in chapters
        for (const chapter of chapters) {
          if (chapter.content.toLowerCase().includes(keyword)) {
            const contexts: string[] = [];
            const chapterLower = chapter.content.toLowerCase();
            let startPos = 0;

            let index = chapterLower.indexOf(keyword, startPos);
            while (index !== -1) {
              // Extract context
              const ctxStart = Math.max(0, index - 50);
              const ctxEnd = Math.min(chapter.content.length, index + keyword.length + 50);
              let context = chapter.content.slice(ctxStart, ctxEnd).trim();

              if (ctxStart > 0) context = '...' + context;
              if (ctxEnd < chapter.content.length) context = context + '...';

              contexts.push(context);
              startPos = index + 1;
              index = chapterLower.indexOf(keyword, startPos);
            }

            if (contexts.length > 0) {
              // Initialize document entry if needed
              if (!(mdFile in documentResults)) {
                documentResults[mdFile] = {
                  metadata,
                  matching_chapters: {},
                };
              }

              // Initialize chapter entry if needed
              if (!(chapter.title in documentResults[mdFile].matching_chapters)) {
                documentResults[mdFile].matching_chapters[chapter.title] = {
                  chapter: chapter.title,
                  keywords_found: new Set(),
                  match_context: {},
                  chapter_summary: chapter.summary,
                };
              }

              const chapterData = documentResults[mdFile].matching_chapters[chapter.title];
              chapterData.keywords_found.add(keyword);
              if (!(keyword in chapterData.match_context)) {
                chapterData.match_context[keyword] = [];
              }
              chapterData.match_context[keyword].push(...contexts);
            }
          }
        }

        // If chapters exist, also search for pre-chapter content
        if (chapters.length > 0 && bodyLower.includes(keyword)) {
          // Get the content before the first chapter
          const firstChapterStart = body.indexOf('\n##');
          if (firstChapterStart > 0) {
            const preChapterContent = body.slice(0, firstChapterStart);
            if (preChapterContent.toLowerCase().includes(keyword)) {
              const contexts: string[] = [];
              const contentLower = preChapterContent.toLowerCase();
              let startPos = 0;

              let index = contentLower.indexOf(keyword, startPos);
              while (index !== -1) {
                // Extract context
                const ctxStart = Math.max(0, index - 50);
                const ctxEnd = Math.min(preChapterContent.length, index + keyword.length + 50);
                let context = preChapterContent.slice(ctxStart, ctxEnd).trim();

                if (ctxStart > 0) context = '...' + context;
                if (ctxEnd < preChapterContent.length) context = context + '...';

                contexts.push(context);
                startPos = index + 1;
                index = contentLower.indexOf(keyword, startPos);
              }

              if (contexts.length > 0) {
                // Initialize document entry if needed
                if (!(mdFile in documentResults)) {
                  documentResults[mdFile] = {
                    metadata,
                    matching_chapters: {},
                  };
                }

                // Add pre-chapter content as a special chapter
                if (!('_pre_chapter' in documentResults[mdFile].matching_chapters)) {
                  documentResults[mdFile].matching_chapters['_pre_chapter'] = {
                    chapter: '',
                    keywords_found: new Set(),
                    match_context: {},
                    chapter_summary: '',
                  };
                }

                const chapterData = documentResults[mdFile].matching_chapters['_pre_chapter'];
                chapterData.keywords_found.add(keyword);
                if (!(keyword in chapterData.match_context)) {
                  chapterData.match_context[keyword] = [];
                }
                chapterData.match_context[keyword].push(...contexts);
              }
            }
          }
        }
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  // Convert to document-centric format
  const results: SearchResult[] = [];

  for (const [filename, docData] of Object.entries(documentResults)) {
    // Convert matching chapters to array
    const matchingChapters: MatchingChapter[] = [];

    for (const [, chapterData] of Object.entries(docData.matching_chapters)) {
      matchingChapters.push({
        chapter: chapterData.chapter,
        keywords_found: Array.from(chapterData.keywords_found).sort(),
        match_context: chapterData.match_context,
        chapter_summary: chapterData.chapter_summary,
      });
    }

    results.push({
      file: filename,
      match_count: matchingChapters.length,
      metadata: docData.metadata,
      matching_chapters: matchingChapters,
    });
  }

  return results;
}

// ============================================
// ASYNC VERSIONS OF FUNCTIONS
// ============================================

/**
 * Async version of writeDocument.
 * Write a document with frontmatter.
 */
export async function writeDocumentAsync(
  path: string,
  metadata: DocumentMetadata,
  content: string
): Promise<void> {
  if (!metadata || Object.keys(metadata).length === 0) {
    throw new Error('Missing required metadata');
  }

  // Create parent directory if needed
  const parentDir = dirname(path);
  try {
    await access(parentDir);
  } catch {
    await mkdir(parentDir, { recursive: true });
  }

  // Create document with frontmatter
  const frontmatter = yaml.dump(metadata);
  const fullContent = `---\n${frontmatter}---\n${content}`;

  // Write atomically using temp file
  const tempFile = join(tmpdir(), `knowledge-mcp-${randomBytes(8).toString('hex')}.tmp`);
  await writeFile(tempFile, fullContent, 'utf8');

  // Move temp file to final location
  await writeFile(path, fullContent, 'utf8');
}

/**
 * Async version of searchDocuments.
 * Search knowledge documents for a query.
 */
export async function searchDocumentsAsync(
  projectPath: string,
  query: string
): Promise<SearchResult[]> {
  if (!query) {
    return [];
  }

  const knowledgeDir = join(projectPath, 'knowledge');
  try {
    await access(knowledgeDir);
  } catch {
    return [];
  }

  // Split query into individual keywords
  const keywords = query
    .split(/\s+/)
    .map((kw) => kw.trim().toLowerCase())
    .filter((kw) => kw);

  if (keywords.length === 0) {
    return [];
  }

  // Structure to aggregate results by document
  const documentResults: Record<
    string,
    {
      metadata: DocumentMetadata;
      matching_chapters: Record<
        string,
        {
          chapter: string;
          keywords_found: Set<string>;
          match_context: Record<string, string[]>;
          chapter_summary: string;
        }
      >;
    }
  > = {};

  // Search through all markdown files
  const files = await readdir(knowledgeDir);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  for (const mdFile of mdFiles) {
    try {
      const filePath = join(knowledgeDir, mdFile);
      const content = await readFile(filePath, 'utf8');

      // Parse document
      const [metadata, body] = parseDocument(content);
      const chapters = parseChapters(body);

      // Search each keyword
      for (const keyword of keywords) {
        const bodyLower = body.toLowerCase();

        // If no chapters, search entire body
        if (chapters.length === 0 && bodyLower.includes(keyword)) {
          const contexts: string[] = [];
          let startPos = 0;

          let index = bodyLower.indexOf(keyword, startPos);
          while (index !== -1) {
            // Extract context
            const ctxStart = Math.max(0, index - 50);
            const ctxEnd = Math.min(body.length, index + keyword.length + 50);
            let context = body.slice(ctxStart, ctxEnd).trim();

            if (ctxStart > 0) context = '...' + context;
            if (ctxEnd < body.length) context = context + '...';

            contexts.push(context);
            startPos = index + 1;
            index = bodyLower.indexOf(keyword, startPos);
          }

          if (contexts.length > 0) {
            // Initialize document entry if needed
            if (!(mdFile in documentResults)) {
              documentResults[mdFile] = {
                metadata,
                matching_chapters: {},
              };
            }

            // Add body-level match as a special chapter
            if (!('_document_body' in documentResults[mdFile].matching_chapters)) {
              documentResults[mdFile].matching_chapters['_document_body'] = {
                chapter: '',
                keywords_found: new Set(),
                match_context: {},
                chapter_summary: '',
              };
            }

            const chapterData = documentResults[mdFile].matching_chapters['_document_body'];
            chapterData.keywords_found.add(keyword);
            if (!(keyword in chapterData.match_context)) {
              chapterData.match_context[keyword] = [];
            }
            chapterData.match_context[keyword].push(...contexts);
          }
        }

        // Search in chapters
        for (const chapter of chapters) {
          if (chapter.content.toLowerCase().includes(keyword)) {
            const contexts: string[] = [];
            const chapterLower = chapter.content.toLowerCase();
            let startPos = 0;

            let index = chapterLower.indexOf(keyword, startPos);
            while (index !== -1) {
              // Extract context
              const ctxStart = Math.max(0, index - 50);
              const ctxEnd = Math.min(chapter.content.length, index + keyword.length + 50);
              let context = chapter.content.slice(ctxStart, ctxEnd).trim();

              if (ctxStart > 0) context = '...' + context;
              if (ctxEnd < chapter.content.length) context = context + '...';

              contexts.push(context);
              startPos = index + 1;
              index = chapterLower.indexOf(keyword, startPos);
            }

            if (contexts.length > 0) {
              // Initialize document entry if needed
              if (!(mdFile in documentResults)) {
                documentResults[mdFile] = {
                  metadata,
                  matching_chapters: {},
                };
              }

              // Initialize chapter entry if needed
              if (!(chapter.title in documentResults[mdFile].matching_chapters)) {
                documentResults[mdFile].matching_chapters[chapter.title] = {
                  chapter: chapter.title,
                  keywords_found: new Set(),
                  match_context: {},
                  chapter_summary: chapter.summary,
                };
              }

              const chapterData = documentResults[mdFile].matching_chapters[chapter.title];
              chapterData.keywords_found.add(keyword);
              if (!(keyword in chapterData.match_context)) {
                chapterData.match_context[keyword] = [];
              }
              chapterData.match_context[keyword].push(...contexts);
            }
          }
        }

        // If chapters exist, also search for pre-chapter content
        if (chapters.length > 0 && bodyLower.includes(keyword)) {
          // Get the content before the first chapter
          const firstChapterStart = body.indexOf('\n##');
          if (firstChapterStart > 0) {
            const preChapterContent = body.slice(0, firstChapterStart);
            if (preChapterContent.toLowerCase().includes(keyword)) {
              const contexts: string[] = [];
              const contentLower = preChapterContent.toLowerCase();
              let startPos = 0;

              let index = contentLower.indexOf(keyword, startPos);
              while (index !== -1) {
                // Extract context
                const ctxStart = Math.max(0, index - 50);
                const ctxEnd = Math.min(preChapterContent.length, index + keyword.length + 50);
                let context = preChapterContent.slice(ctxStart, ctxEnd).trim();

                if (ctxStart > 0) context = '...' + context;
                if (ctxEnd < preChapterContent.length) context = context + '...';

                contexts.push(context);
                startPos = index + 1;
                index = contentLower.indexOf(keyword, startPos);
              }

              if (contexts.length > 0) {
                // Initialize document entry if needed
                if (!(mdFile in documentResults)) {
                  documentResults[mdFile] = {
                    metadata,
                    matching_chapters: {},
                  };
                }

                // Add pre-chapter content as a special chapter
                if (!('_pre_chapter' in documentResults[mdFile].matching_chapters)) {
                  documentResults[mdFile].matching_chapters['_pre_chapter'] = {
                    chapter: '',
                    keywords_found: new Set(),
                    match_context: {},
                    chapter_summary: '',
                  };
                }

                const chapterData = documentResults[mdFile].matching_chapters['_pre_chapter'];
                chapterData.keywords_found.add(keyword);
                if (!(keyword in chapterData.match_context)) {
                  chapterData.match_context[keyword] = [];
                }
                chapterData.match_context[keyword].push(...contexts);
              }
            }
          }
        }
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  // Convert to document-centric format
  const results: SearchResult[] = [];

  for (const [filename, docData] of Object.entries(documentResults)) {
    // Convert matching chapters to array
    const matchingChapters: MatchingChapter[] = [];

    for (const [, chapterData] of Object.entries(docData.matching_chapters)) {
      matchingChapters.push({
        chapter: chapterData.chapter,
        keywords_found: Array.from(chapterData.keywords_found).sort(),
        match_context: chapterData.match_context,
        chapter_summary: chapterData.chapter_summary,
      });
    }

    results.push({
      file: filename,
      match_count: matchingChapters.length,
      metadata: docData.metadata,
      matching_chapters: matchingChapters,
    });
  }

  return results;
}
