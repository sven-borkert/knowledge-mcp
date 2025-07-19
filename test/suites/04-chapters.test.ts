#!/usr/bin/env tsx

import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import {
  TestRunner,
  assertSuccess,
  assertFailure,
  assertEqual,
  assertContains,
  assertArrayLength,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-chapters'));
const SERVER_PATH = resolve('./dist/knowledge-mcp/index.js');

// Helper function to create a test document
async function createTestDocument(
  client: MCPTestClient,
  projectId: string,
  filename: string = 'test-doc'
): Promise<Record<string, unknown>> {
  return client.callToolAndParse('create_knowledge_file', {
    project_id: projectId,
    filename: filename,
    title: 'Test Document',
    introduction: 'Test introduction',
    keywords: ['test', 'chapters'],
    chapters: [
      { title: 'Chapter 1', content: 'Content 1' },
      { title: 'Chapter 2', content: 'Content 2' },
      { title: 'Chapter 3', content: 'Content 3' },
    ],
  });
}

async function main(): Promise<void> {
  const runner = new TestRunner();
  const client = new MCPTestClient({
    serverPath: SERVER_PATH,
    storagePath: TEST_STORAGE_PATH,
  });

  // Setup
  setupTestEnvironment(TEST_STORAGE_PATH);
  await client.connect();
  client.setTestRunner(runner);
  try {
    runner.setSuite('Chapter Operations (Comprehensive)', 'Knowledge Management');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    // Test update_chapter
    await runner.runTest('update_chapter: Update existing chapter', async () => {
      const projectId = generateTestProjectId('update-chapter');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('update_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter 2',
        new_content: 'Updated content for chapter 2\nWith multiple lines',
      });

      assertSuccess(result);

      // Verify update
      const doc = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc.md',
      });

      const chapters = (doc.document as any).chapters;
      assertEqual(chapters[1].title, 'Chapter 2');
      assertEqual(chapters[1].content, 'Updated content for chapter 2\nWith multiple lines');
    });

    await runner.runTest('update_chapter: Update with summary', async () => {
      const projectId = generateTestProjectId('update-summary');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('update_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter 1',
        new_content: 'New content that contains the word findable for searching',
        new_summary: 'This chapter now has a custom summary',
      });

      assertSuccess(result);

      // Search for content (not summary, as search doesn't look in summaries)
      const searchResult = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'findable',
      });

      assertSuccess(searchResult);

      // The search result structure from SearchToolHandler transforms results
      const results = searchResult.results as any[];

      if (!results || results.length === 0) {
        throw new Error('Search did not find any documents');
      }

      // Check the transformed structure - chapters array contains title and matches
      if (!results[0].chapters || results[0].chapters.length === 0) {
        throw new Error('No matching chapters found in document');
      }

      // Can't verify summary from transformed search results - they only have title and matches
      // Let's just verify the search found the content
      assertEqual(results[0].document, 'test-doc.md');
      assertEqual(results[0].chapters[0].title, 'Chapter 1');
      assertEqual(results[0].chapters[0].matches, 1);
    });

    await runner.runTest('update_chapter: Non-existent chapter', async () => {
      const projectId = generateTestProjectId('update-nonexistent');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('update_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Non-existent Chapter',
        new_content: 'This should fail',
      });

      assertFailure(result);
    });

    // Test remove_chapter
    await runner.runTest('remove_chapter: Remove existing chapter', async () => {
      const projectId = generateTestProjectId('remove-chapter');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('remove_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter 2',
      });

      assertSuccess(result);

      // Verify removal
      const doc = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc.md',
      });

      const chapters = (doc.document as any).chapters;
      assertArrayLength(chapters as unknown[], 2);
      assertEqual(chapters[0].title, 'Chapter 1');
      assertEqual(chapters[1].title, 'Chapter 3');
    });

    await runner.runTest('remove_chapter: Remove last remaining chapter', async () => {
      const projectId = generateTestProjectId('remove-last');

      // Create doc with single chapter
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'single-chapter',
        title: 'Single Chapter Doc',
        introduction: 'Test doc',
        keywords: ['test'],
        chapters: [{ title: 'Only Chapter', content: 'Only content' }],
      });

      const result = await client.callToolAndParse('remove_chapter', {
        project_id: projectId,
        filename: 'single-chapter.md',
        chapter_title: 'Only Chapter',
      });

      assertSuccess(result);

      // Document should still exist but with no chapters
      const doc = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'single-chapter.md',
      });

      assertSuccess(doc);
      assertArrayLength((doc.document as any).chapters as unknown[], 0);
    });

    // Test add_chapter (new feature)
    await runner.runTest('add_chapter: Add at end', async () => {
      const projectId = generateTestProjectId('add-end');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter 4',
        content: 'Content of new chapter 4',
        position: 'end',
      });

      assertSuccess(result);

      // Verify addition
      const doc = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc.md',
      });

      const chapters = (doc.document as any).chapters;
      assertArrayLength(chapters as unknown[], 4);
      assertEqual(chapters[3].title, 'Chapter 4');
      assertEqual(chapters[3].content, 'Content of new chapter 4');
    });

    await runner.runTest('add_chapter: Add before specific chapter', async () => {
      const projectId = generateTestProjectId('add-before');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter 1.5',
        content: 'Content between 1 and 2',
        position: 'before',
        reference_chapter: 'Chapter 2',
      });

      assertSuccess(result);

      // Verify position
      const doc = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc.md',
      });

      const chapters = (doc.document as any).chapters;
      assertArrayLength(chapters as unknown[], 4);
      assertEqual(chapters[0].title, 'Chapter 1');
      assertEqual(chapters[1].title, 'Chapter 1.5');
      assertEqual(chapters[2].title, 'Chapter 2');
      assertEqual(chapters[3].title, 'Chapter 3');
    });

    await runner.runTest('add_chapter: Add after specific chapter', async () => {
      const projectId = generateTestProjectId('add-after');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter 2.5',
        content: 'Content between 2 and 3',
        position: 'after',
        reference_chapter: 'Chapter 2',
      });

      assertSuccess(result);

      // Verify position
      const doc = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc.md',
      });

      const chapters = (doc.document as any).chapters;
      assertArrayLength(chapters as unknown[], 4);
      assertEqual(chapters[0].title, 'Chapter 1');
      assertEqual(chapters[1].title, 'Chapter 2');
      assertEqual(chapters[2].title, 'Chapter 2.5');
      assertEqual(chapters[3].title, 'Chapter 3');
    });

    await runner.runTest('add_chapter: Add to empty document', async () => {
      const projectId = generateTestProjectId('add-empty');

      // Create doc with no chapters
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'empty-doc',
        title: 'Empty Doc',
        introduction: 'No chapters initially',
        keywords: ['empty'],
        chapters: [],
      });

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'empty-doc.md',
        chapter_title: 'First Chapter',
        content: 'First chapter content',
        position: 'end',
      });

      assertSuccess(result);

      // Verify
      const doc = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'empty-doc.md',
      });

      const chapters = (doc.document as any).chapters;
      assertArrayLength(chapters as unknown[], 1);
      assertEqual(chapters[0].title, 'First Chapter');
    });

    await runner.runTest('add_chapter: Duplicate chapter title', async () => {
      const projectId = generateTestProjectId('add-duplicate');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter 2', // Already exists
        content: 'Duplicate content',
        position: 'end',
      });

      assertFailure(result);
      assertContains(result.error as string, 'already exists');
    });

    await runner.runTest('add_chapter: Invalid target chapter', async () => {
      const projectId = generateTestProjectId('add-invalid-target');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'New Chapter',
        content: 'Content',
        position: 'after',
        reference_chapter: 'Non-existent Chapter',
      });

      assertFailure(result);
    });

    await runner.runTest('add_chapter: Auto-generated summary', async () => {
      const projectId = generateTestProjectId('add-auto-summary');
      await createTestDocument(client, projectId);

      // add_chapter doesn't support summary parameter - it auto-generates from first line
      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter with Auto Summary',
        content:
          'This is the first line that will become the auto-generated summary.\n\nMore content here that is searchable.',
        position: 'end',
      });

      assertSuccess(result);

      // Search for content to verify it was added
      const searchResult = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'searchable',
      });

      assertSuccess(searchResult);
      const results = searchResult.results as any[];

      if (!results || results.length === 0) {
        throw new Error('Search did not find any documents');
      }

      // Check the transformed structure - chapters array contains title and matches
      if (!results[0].chapters || results[0].chapters.length === 0) {
        throw new Error('No matching chapters found in document');
      }

      // Verify the search found the content in the new chapter
      assertEqual(results[0].document, 'test-doc.md');
      assertEqual(results[0].chapters[0].title, 'Chapter with Auto Summary');
      assertEqual(results[0].chapters[0].matches, 1);
    });

    await runner.runTest('Chapter operations: Complex sequence', async () => {
      const projectId = generateTestProjectId('complex');
      await createTestDocument(client, projectId);

      // 1. Add chapter at beginning
      await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Introduction',
        content: 'Introduction content',
        position: 'before',
        reference_chapter: 'Chapter 1',
      });

      // 2. Update Chapter 2
      await client.callToolAndParse('update_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter 2',
        new_content: 'Completely new content for chapter 2',
      });

      // 3. Remove Chapter 3
      await client.callToolAndParse('remove_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Chapter 3',
      });

      // 4. Add new chapter at end
      await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Conclusion',
        content: 'Concluding remarks',
        position: 'end',
      });

      // Verify final state
      const doc = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc.md',
      });

      const chapters = (doc.document as any).chapters;
      assertArrayLength(chapters as unknown[], 4);
      assertEqual(chapters[0].title, 'Introduction');
      assertEqual(chapters[1].title, 'Chapter 1');
      assertEqual(chapters[2].title, 'Chapter 2');
      assertEqual(chapters[2].content, 'Completely new content for chapter 2');
      assertEqual(chapters[3].title, 'Conclusion');
    });

    await runner.runTest('add_chapter: Special characters and markdown', async () => {
      const projectId = generateTestProjectId('special-content');
      await createTestDocument(client, projectId);

      const specialContent = `# Heading in chapter

**Bold text** and *italic text*

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`

Special chars: <>&"' üñíçødé 你好

- List item 1
- List item 2
  - Nested item

> Blockquote
> Multiple lines`;

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'Special Content Chapter',
        content: specialContent,
        position: 'end',
      });

      assertSuccess(result);

      // Verify content preserved exactly
      const doc = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc.md',
      });

      const chapters = (doc.document as any).chapters;
      const addedChapter = (chapters as any[]).find(
        (ch: any) => ch.title === 'Special Content Chapter'
      );
      assertEqual(addedChapter.content, specialContent);
    });

    await runner.runTest('add_chapter: Invalid position parameter', async () => {
      const projectId = generateTestProjectId('invalid-position');
      await createTestDocument(client, projectId);

      try {
        await client.callToolAndParse('add_chapter', {
          project_id: projectId,
          filename: 'test-doc.md',
          chapter_title: 'New Chapter',
          content: 'Content',
          position: 'invalid-position' as any,
        });

        throw new Error('Expected validation error for invalid position');
      } catch (error: any) {
        // This is expected - MCP validates enum values
        assertContains((error as Error).message, 'invalid_enum_value');
      }
    });

    await runner.runTest('add_chapter: Missing reference_chapter for before/after', async () => {
      const projectId = generateTestProjectId('missing-target');
      await createTestDocument(client, projectId);

      const result = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'test-doc.md',
        chapter_title: 'New Chapter',
        content: 'Content',
        position: 'before',
        // reference_chapter missing
      });

      assertFailure(result);
    });
  } finally {
    await client.disconnect();
    cleanupTestEnvironment(TEST_STORAGE_PATH);

    // Export detailed results for HTML reporting
    const detailedSuiteResult = runner.getDetailedSuiteResult();
    if (process.env.EXPORT_DETAILED_RESULTS) {
      const { writeFileSync, mkdirSync } = await import('fs');
      const path = await import('path');
      const resultsDir = path.resolve('./test-results/detailed-suites');
      mkdirSync(resultsDir, { recursive: true });
      const resultPath = path.resolve(resultsDir, '04-chapters.test.json');
      writeFileSync(resultPath, JSON.stringify(detailedSuiteResult, null, 2));
    }

    runner.printSummary();
    runner.exitWithResults();
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}
