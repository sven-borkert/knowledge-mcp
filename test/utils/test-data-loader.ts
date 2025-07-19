import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

// Test data directory path
const TEST_DATA_PATH = resolve('./test/data');

export interface TestDataFile {
  filename: string;
  content: string;
  path: string;
}

export interface KnowledgeDocumentData {
  filename: string;
  title: string;
  introduction: string;
  keywords: string[];
  chapters: Array<{
    title: string;
    content: string;
  }>;
}

/**
 * Load a test data file by filename
 */
export function loadTestDataFile(filename: string): string {
  const filePath = join(TEST_DATA_PATH, filename);

  if (!existsSync(filePath)) {
    throw new Error(`Test data file not found: ${filename}`);
  }

  return readFileSync(filePath, 'utf8');
}

/**
 * Load all test data files from the test/data directory
 */
export function loadAllTestDataFiles(): TestDataFile[] {
  if (!existsSync(TEST_DATA_PATH)) {
    throw new Error(`Test data directory not found: ${TEST_DATA_PATH}`);
  }

  const files = readdirSync(TEST_DATA_PATH);
  return files
    .filter((filename) => filename.endsWith('.md'))
    .map((filename) => ({
      filename,
      content: readFileSync(join(TEST_DATA_PATH, filename), 'utf8'),
      path: join(TEST_DATA_PATH, filename),
    }));
}

/**
 * Get sample project main content
 */
export function getSampleProjectMain(): string {
  return loadTestDataFile('sample-project-main.md');
}

/**
 * Get sample knowledge document content
 */
export function getSampleKnowledgeDocument(): string {
  return loadTestDataFile('sample-knowledge-1.md');
}

/**
 * Parse a knowledge document and extract structured data
 */
export function parseKnowledgeDocument(content: string): KnowledgeDocumentData {
  // Extract front matter
  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontMatterMatch) {
    throw new Error('No front matter found in knowledge document');
  }

  // Parse metadata
  const metadata: Record<string, unknown> = {};
  const metadataLines = frontMatterMatch[1].split('\n');
  metadataLines.forEach((line) => {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'keywords') {
        metadata[key] = value
          .replace(/[[\]]/g, '')
          .split(',')
          .map((k) => k.trim());
      } else {
        metadata[key] = value;
      }
    }
  });

  // Extract content after front matter
  const mainContent = content.substring(frontMatterMatch[0].length);

  // Extract introduction (everything before first ## heading)
  const firstChapterIndex = mainContent.indexOf('\n## ');
  const introduction =
    firstChapterIndex > -1
      ? mainContent.substring(0, firstChapterIndex).trim()
      : mainContent.trim();

  // Extract chapters
  const chapters: Array<{ title: string; content: string }> = [];
  const chapterMatches = mainContent.matchAll(/\n## ([^\n]+)\n([\s\S]*?)(?=\n## |\n*$)/g);

  for (const match of chapterMatches) {
    chapters.push({
      title: match[1].trim(),
      content: match[2].trim(),
    });
  }

  return {
    filename: 'unknown.md',
    title: (metadata.title as string) || 'Untitled',
    introduction,
    keywords: (metadata.keywords as string[]) || [],
    chapters,
  };
}

/**
 * Generate test knowledge document data
 */
export function generateTestKnowledgeData(
  options: Partial<KnowledgeDocumentData> = {}
): KnowledgeDocumentData {
  return {
    filename: options.filename ?? 'test-knowledge.md',
    title: options.title ?? 'Test Knowledge Document',
    introduction:
      options.introduction ?? 'This is a test knowledge document for automated testing.',
    keywords: options.keywords ?? ['test', 'knowledge', 'automated'],
    chapters: options.chapters ?? [
      {
        title: 'Introduction',
        content: 'This chapter provides an introduction to the test content.',
      },
      {
        title: 'Main Content',
        content: 'This chapter contains the main test content with detailed information.',
      },
      {
        title: 'Conclusion',
        content: 'This chapter wraps up the test content.',
      },
    ],
  };
}

/**
 * Generate a test project main.md content
 */
export function generateTestProjectMain(
  sections: string[] = ['Setup', 'Development', 'Testing']
): string {
  const content = ['# Test Project Guidelines\n'];
  content.push('> This is a test project main file for automated testing.\n');

  sections.forEach((section) => {
    content.push(`## ${section}\n`);
    content.push(`Instructions for ${section.toLowerCase()}.\n`);
    content.push(`- Step 1: Do something\n`);
    content.push(`- Step 2: Do something else\n`);
    content.push(`- Step 3: Verify results\n\n`);
  });

  return content.join('');
}
