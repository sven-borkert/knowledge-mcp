#!/usr/bin/env tsx

import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import { generateTestKnowledgeData } from '../utils/test-data-loader.js';
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
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-knowledge-files'));
const SERVER_PATH = resolve('./dist/knowledge-mcp/index.js');

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
    runner.setSuite('Knowledge File Operations', 'Knowledge Management');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    // Test create_knowledge_file
    await runner.runTest('create_knowledge_file: Basic creation', async () => {
      const projectId = generateTestProjectId('knowledge');
      const knowledgeData = generateTestKnowledgeData();

      const result = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: knowledgeData.filename,
        title: knowledgeData.title,
        introduction: knowledgeData.introduction,
        keywords: knowledgeData.keywords,
        chapters: knowledgeData.chapters,
      });

      assertSuccess(result);
      // The response should have a filepath
      const filepath = result.filepath ?? result.document_id;
      assertEqual(typeof filepath, 'string');
    });

    await runner.runTest('create_knowledge_file: Duplicate filename', async () => {
      const projectId = generateTestProjectId('duplicate');
      const knowledgeData = generateTestKnowledgeData();

      // Create first file
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc',
        title: knowledgeData.title,
        introduction: knowledgeData.introduction,
        keywords: knowledgeData.keywords,
        chapters: knowledgeData.chapters,
      });

      // Try to create duplicate
      const result = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'test-doc', // Same filename
        title: 'Different Title',
        introduction: 'Different intro',
        keywords: ['different'],
        chapters: [{ title: 'Chapter', content: 'Content' }],
      });

      assertFailure(result);
      assertContains(result.error as string, 'already exists');
    });

    await runner.runTest('create_knowledge_file: Special characters in filename', async () => {
      const projectId = generateTestProjectId('special-chars');
      const knowledgeData = generateTestKnowledgeData({
        filename: 'Special File Name with Spaces & Symbols!@#$',
      });

      const result = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: knowledgeData.filename,
        title: knowledgeData.title,
        introduction: knowledgeData.introduction,
        keywords: knowledgeData.keywords,
        chapters: knowledgeData.chapters,
      });

      assertSuccess(result);
      // Filename should be slugified
      const filepath = result.filepath ?? result.document_id;
      if (filepath) {
        assertContains(filepath as string, 'special-file-name-with-spaces-and-symbols');
      }
    });

    await runner.runTest('create_knowledge_file: Large document with many chapters', async () => {
      const projectId = generateTestProjectId('large-doc');
      const chapters: Array<{ title: string; content: string }> = [];

      // Create 50 chapters
      for (let i = 1; i <= 50; i++) {
        chapters.push({
          title: `Chapter ${i}`,
          content: `This is the content for chapter ${i}.\n\nIt has multiple paragraphs.\n\nAnd some detailed information.`,
        });
      }

      const result = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'large-document',
        title: 'Large Knowledge Document',
        introduction: 'This document contains many chapters for testing.',
        keywords: ['large', 'test', 'many-chapters'],
        chapters: chapters,
      });

      assertSuccess(result);
    });

    await runner.runTest('create_knowledge_file: Empty keywords array should fail', async () => {
      const projectId = generateTestProjectId('empty-keywords');

      try {
        await client.callToolAndParse('create_knowledge_file', {
          project_id: projectId,
          filename: 'test-doc',
          title: 'Test Document',
          introduction: 'Test intro',
          keywords: [], // Empty array
          chapters: [{ title: 'Chapter', content: 'Content' }],
        });

        throw new Error('Expected validation error for empty keywords');
      } catch (error: any) {
        // Expected to fail with validation error
        assertContains((error as Error).message, 'at least 1 element');
      }
    });

    await runner.runTest('create_knowledge_file: Unicode content', async () => {
      const projectId = generateTestProjectId('unicode');

      const result = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'unicode-test',
        title: 'Unicode Test Document',
        introduction: 'Testing unicode: 你好世界 🌍 émojis üñíçødé',
        keywords: ['unicode', 'international'],
        chapters: [
          {
            title: 'Unicode Chapter',
            content: '日本語 • Español • Français • Русский • العربية',
          },
          {
            title: 'Emoji Chapter',
            content: '🚀 🎯 💡 🔧 📚 ✨',
          },
        ],
      });

      assertSuccess(result);
    });

    // Test get_knowledge_file
    await runner.runTest('get_knowledge_file: Retrieve existing document', async () => {
      const projectId = generateTestProjectId('get-file');
      const knowledgeData = generateTestKnowledgeData();

      // Create document - filename should not include .md extension
      const createResult = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'test-knowledge', // Remove .md extension
        title: knowledgeData.title,
        introduction: knowledgeData.introduction,
        keywords: knowledgeData.keywords,
        chapters: knowledgeData.chapters,
      });

      assertSuccess(createResult);

      // Retrieve it - use filename with .md extension
      const result = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'test-knowledge.md', // Add .md extension for retrieval
      });

      assertSuccess(result);
      const doc = result.document as any;
      assertEqual(doc.metadata.title, knowledgeData.title);
      // The introduction is not a separate field in the response
      // It should be in the full_content
      assertContains(doc.full_content as string, knowledgeData.introduction);
      assertArrayLength(doc.chapters as unknown[], knowledgeData.chapters.length);
    });

    await runner.runTest('get_knowledge_file: Non-existent document', async () => {
      const projectId = generateTestProjectId('get-nonexistent');

      const result = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'does-not-exist.md',
      });

      assertFailure(result);
    });

    await runner.runTest('get_knowledge_file: Verify full_content field', async () => {
      const projectId = generateTestProjectId('full-content');
      const knowledgeData = generateTestKnowledgeData({
        title: 'Full Content Test',
        keywords: ['test', 'full-content'],
        introduction: 'Testing full content reconstruction',
        chapters: [
          { title: 'First Chapter', content: 'First chapter content' },
          { title: 'Second Chapter', content: 'Second chapter content' },
        ],
      });

      // Create document
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'full-content-test',
        title: knowledgeData.title,
        introduction: knowledgeData.introduction,
        keywords: knowledgeData.keywords,
        chapters: knowledgeData.chapters,
      });

      // Retrieve and check full_content
      const result = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'full-content-test.md',
      });

      assertSuccess(result);
      const doc = result.document as any;

      // Verify full_content contains introduction and chapters
      assertContains(doc.full_content as string, 'Testing full content reconstruction');
      assertContains(doc.full_content as string, '## First Chapter');
      assertContains(doc.full_content as string, 'First chapter content');
      assertContains(doc.full_content as string, '## Second Chapter');
      assertContains(doc.full_content as string, 'Second chapter content');
    });

    // Test delete_knowledge_file
    await runner.runTest('delete_knowledge_file: Delete existing file', async () => {
      const projectId = generateTestProjectId('delete');

      // Create a file
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'to-delete',
        title: 'Document to Delete',
        introduction: 'This will be deleted',
        keywords: ['delete', 'test'],
        chapters: [{ title: 'Chapter', content: 'Content' }],
      });

      // Delete it
      const deleteResult = await client.callToolAndParse('delete_knowledge_file', {
        project_id: projectId,
        filename: 'to-delete.md',
      });

      assertSuccess(deleteResult);

      // Verify it's gone
      const getResult = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'to-delete.md',
      });

      assertFailure(getResult);
    });

    await runner.runTest('delete_knowledge_file: Non-existent file', async () => {
      const projectId = generateTestProjectId('delete-nonexistent');

      const result = await client.callToolAndParse('delete_knowledge_file', {
        project_id: projectId,
        filename: 'never-existed.md',
      });

      assertFailure(result);
    });

    // Test complex scenarios
    await runner.runTest('Multiple knowledge files in same project', async () => {
      const projectId = generateTestProjectId('multi-files');

      // Create multiple files
      const files = [
        { filename: 'api-guide', title: 'API Guide' },
        { filename: 'architecture', title: 'Architecture Overview' },
        { filename: 'deployment', title: 'Deployment Guide' },
        { filename: 'troubleshooting', title: 'Troubleshooting' },
      ];

      for (const file of files) {
        await client.callToolAndParse('create_knowledge_file', {
          project_id: projectId,
          filename: file.filename,
          title: file.title,
          introduction: `Introduction to ${file.title}`,
          keywords: [file.filename, 'documentation'],
          chapters: [
            { title: 'Overview', content: `Overview of ${file.title}` },
            { title: 'Details', content: `Detailed information about ${file.title}` },
          ],
        });
      }

      // Verify all can be retrieved
      for (const file of files) {
        const result = await client.callToolAndParse('get_knowledge_file', {
          project_id: projectId,
          filename: `${file.filename}.md`,
        });

        assertSuccess(result);
        const doc = result.document as any;
        assertEqual(doc.metadata.title, file.title);
      }
    });

    await runner.runTest('Knowledge file with code blocks and markdown', async () => {
      const projectId = generateTestProjectId('markdown');

      const chapters = [
        {
          title: 'Code Examples',
          content: `Here's a TypeScript example:

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
}

async function getUser(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
}
\`\`\`

And a bash example:

\`\`\`bash
#!/bin/bash
echo "Hello, World!"
for i in {1..5}; do
  echo "Number: $i"
done
\`\`\``,
        },
        {
          title: 'Markdown Features',
          content: `## Subheading

**Bold text** and *italic text* and ***bold italic***.

> This is a blockquote
> with multiple lines

- Bullet point 1
- Bullet point 2
  - Nested point
  - Another nested point

1. Numbered item
2. Another item
   1. Nested number
   2. Another nested

[Link to somewhere](https://example.com)

| Column 1 | Column 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |`,
        },
      ];

      const result = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'markdown-test',
        title: 'Markdown Test Document',
        introduction: 'Testing markdown and code block preservation',
        keywords: ['markdown', 'code', 'formatting'],
        chapters: chapters,
      });

      assertSuccess(result);

      // Retrieve and verify content preserved
      const getResult = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'markdown-test.md',
      });

      assertSuccess(getResult);
      const doc = getResult.document as any;

      // Check that code blocks are preserved in the full_content
      assertContains(doc.full_content as string, '```typescript');
      assertContains(doc.full_content as string, '```bash');
      assertContains(doc.full_content as string, '**Bold text**');
      assertContains(doc.full_content as string, '| Column 1 | Column 2 |');
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
      const resultPath = path.resolve(resultsDir, '03-knowledge-files.json');
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
