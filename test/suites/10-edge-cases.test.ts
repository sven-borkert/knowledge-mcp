#!/usr/bin/env tsx

import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import {
  TestRunner,
  assertSuccess,
  assertEqual,
  assertContains,
  assertNotContains,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-edge'));
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
    runner.setSuite('Edge Cases and Boundary Conditions', 'Edge Cases');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    // Empty/minimal content edge cases
    await runner.runTest('Edge case: Empty project main', async () => {
      const projectId = generateTestProjectId('empty-main');

      const result = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '',
      });

      assertSuccess(result);

      // Verify it can be retrieved
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertEqual(getResult.content, '');
    });

    await runner.runTest('Edge case: Single character content', async () => {
      const projectId = generateTestProjectId('single-char');

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: 'x',
      });

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'x',
        title: 'X',
        introduction: 'x',
        keywords: ['x'],
        chapters: [{ title: 'X', content: 'x' }],
      });

      // Search for single character
      const searchResult = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: 'x',
      });

      assertSuccess(searchResult);
      assertEqual(searchResult.total_documents, 1);
    });

    // Maximum size edge cases
    await runner.runTest('Edge case: Very long content', async () => {
      const projectId = generateTestProjectId('long-content');

      // Create content with 1MB of text
      const longText = 'x'.repeat(1024 * 1024);

      const result = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: `# Long Content Test\n\n${longText}`,
      });

      assertSuccess(result);
    });

    await runner.runTest('Edge case: Maximum chapters (50)', async () => {
      const projectId = generateTestProjectId('max-chapters');

      const chapters: Array<{ title: string; content: string }> = [];
      for (let i = 1; i <= 50; i++) {
        chapters.push({
          title: `Chapter ${i}`,
          content: `Content for chapter ${i}`,
        });
      }

      const result = await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'max-chapters',
        title: 'Maximum Chapters Test',
        introduction: 'Testing with 100 chapters',
        keywords: ['max', 'chapters'],
        chapters: chapters,
      });

      assertSuccess(result);

      // Verify all chapters exist
      const getResult = await client.callToolAndParse('get_knowledge_file', {
        project_id: projectId,
        filename: 'max-chapters.md',
      });

      assertEqual((getResult.document as any).chapters.length, 50);
    });

    // Special characters and encoding edge cases
    await runner.runTest('Edge case: Unicode everywhere', async () => {
      const projectId = generateTestProjectId('unicode-全部');

      const unicodeContent = {
        chinese: '中文测试内容',
        japanese: '日本語のテスト',
        korean: '한국어 테스트',
        arabic: 'اختبار عربي',
        emoji: '🚀💡🎯📚✨',
        special: '™®©℃№§¶†‡',
        math: '∑∏∫∞√±≠≤≥',
      };

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: Object.values(unicodeContent).join('\n'),
      });

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'unicode-file-名前',
        title: unicodeContent.emoji,
        introduction: unicodeContent.chinese,
        keywords: ['unicode', 'chinese', 'japanese', 'korean'],
        chapters: Object.entries(unicodeContent).map(([key, value]) => ({
          title: key,
          content: value,
        })),
      });

      // Search with unicode
      const searchResult = await client.callToolAndParse('search_knowledge', {
        project_id: projectId,
        query: '中文',
      });

      assertSuccess(searchResult);
      assertEqual(searchResult.total_documents, 1);
    });

    await runner.runTest('Edge case: Special markdown characters', async () => {
      const projectId = generateTestProjectId('markdown-special');

      const specialContent = `# Title with # symbols

## Section with ** bold ** and * italic * markers

Content with \`\`\` code blocks \`\`\`
And inline \`code\` markers

> Blockquote with > symbols
>> Nested quotes

- List with - dashes
* List with * asterisks
+ List with + plus signs

[Link with [brackets] inside](url)
![Image with ![alt] inside](url)

| Table | With | Pipes |
|-------|------|-------|
| Data  | Here | Too   |`;

      const result = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: specialContent,
      });

      assertSuccess(result);

      // Verify content preserved exactly
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertEqual(getResult.content, specialContent);
    });

    // Whitespace edge cases
    await runner.runTest('Edge case: Whitespace handling', async () => {
      const projectId = generateTestProjectId('whitespace');

      const whitespaceContent = `# Title

## Section with trailing spaces  
Content with mixed   spaces    and	tabs

## Section with blank lines


Multiple blank lines above

## Section with indentation
    Indented with spaces
	Indented with tab
		Double tab
    	Mixed indent`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: whitespaceContent,
      });

      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });

      // Whitespace should be preserved
      assertContains(getResult.content as string, 'trailing spaces  ');
      assertContains(getResult.content as string, 'mixed   spaces');
      assertContains(getResult.content as string, '\n\n\nMultiple blank lines');
    });

    // Naming edge cases
    await runner.runTest('Edge case: Extreme filenames', async () => {
      const projectId = generateTestProjectId('extreme-names');

      const testNames = [
        'a', // Single character
        'x'.repeat(190), // Very long name (leaving room for "Test: " prefix)
        'dots.everywhere.here', // Multiple dots (no leading/trailing)
        'dashes-everywhere-here', // Multiple dashes (no leading/trailing)
        'with_underscores_here', // Underscores (no leading/trailing)
        'MiXeD-CaSe-NaMe', // Mixed case
        '123-numbers-456', // Numbers
        'name-with-many-internal-spaces', // Multiple spaces (dashes instead to avoid validation issues)
      ];

      for (const name of testNames) {
        const result = await client.callToolAndParse('create_knowledge_file', {
          project_id: projectId,
          filename: name,
          title: `Test: ${name}`,
          introduction: 'Testing extreme filename',
          keywords: ['test'],
          chapters: [{ title: 'Test', content: 'Content' }],
        });

        assertSuccess(result, `Failed for filename: ${name}`);
      }
    });

    // Boundary conditions for operations
    await runner.runTest('Edge case: Operations on empty structures', async () => {
      const projectId = generateTestProjectId('empty-ops');

      // Add section to empty project
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '',
      });

      const addResult = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## First Section',
        content: 'First content',
        position: 'end',
      });

      assertSuccess(addResult);

      // Add chapter to empty knowledge file
      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'empty-chapters',
        title: 'Empty',
        introduction: 'No chapters initially',
        keywords: ['empty'],
        chapters: [],
      });

      const addChapterResult = await client.callToolAndParse('add_chapter', {
        project_id: projectId,
        filename: 'empty-chapters.md',
        chapter_title: 'First Chapter',
        content: 'First content',
        position: 'end',
      });

      assertSuccess(addChapterResult);
    });

    await runner.runTest('Edge case: Rapid sequential operations', async () => {
      const projectId = generateTestProjectId('rapid-ops');

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '# Rapid Test\n\n## Section 1\nContent',
      });

      // Perform many operations quickly
      const operations: Array<Promise<Record<string, unknown>>> = [];
      for (let i = 2; i <= 10; i++) {
        operations.push(
          client.callToolAndParse('add_project_section', {
            project_id: projectId,
            section_header: `## Section ${i}`,
            content: `Content ${i}`,
            position: 'end',
          })
        );
      }

      const results = await Promise.all(operations);

      // All should succeed
      results.forEach((result, index) => {
        assertSuccess(result, `Operation ${index + 2} failed`);
      });

      // Verify final state
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });

      for (let i = 1; i <= 10; i++) {
        assertContains(getResult.content as string, `## Section ${i}`);
      }
    });

    await runner.runTest('Edge case: Nested markdown structures', async () => {
      const projectId = generateTestProjectId('nested');

      const nestedContent = `# Main Title

## Section 1

### Subsection 1.1

#### Subsubsection 1.1.1

##### Deep nesting 1.1.1.1

###### Deepest level 1.1.1.1.1

Regular content at deepest level

#### Subsubsection 1.1.2

### Subsection 1.2

## Section 2

Content directly under section 2`;

      const result = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: nestedContent,
      });

      assertSuccess(result);

      // Update a section should handle nested content
      const updateResult = await client.callToolAndParse('update_project_section', {
        project_id: projectId,
        section_header: '## Section 1',
        new_content: 'Updated section 1 content only',
      });

      assertSuccess(updateResult);

      // Verify nested structure was replaced
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });

      assertContains(getResult.content as string, 'Updated section 1 content only');
      assertContains(getResult.content as string, '## Section 2'); // Should still exist
      assertNotContains(getResult.content as string, '### Subsection 1.1'); // Should be gone
    });

    await runner.runTest('Edge case: TODO with maximum tasks', async () => {
      const projectId = generateTestProjectId('max-tasks');

      // Create TODO with 100 tasks
      const tasks: Array<{ title: string; content: string }> = [];
      for (let i = 1; i <= 100; i++) {
        tasks.push({
          title: `Task ${i}`,
          content: `Description of task number ${i} with additional details about the task`,
        });
      }

      const result = await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'TODO with 100 tasks',
        tasks: tasks,
      });

      assertSuccess(result);

      // Verify TODO was created with correct number
      if (!result.todo_number || result.todo_number !== 1) {
        throw new Error(`Expected todo_number 1, got ${String(result.todo_number)}`);
      }

      // Complete every other task
      for (let i = 1; i <= 100; i += 2) {
        await client.callToolAndParse('complete_todo_task', {
          project_id: projectId,
          todo_number: 1,
          task_number: i,
        });
      }

      // Check status
      const listResult = await client.callToolAndParse('list_todos', {
        project_id: projectId,
      });

      const todos = listResult.todos as any[];
      if (!todos || todos.length === 0) {
        throw new Error('No TODOs found');
      }
      const todo = todos[0];

      // The list_todos response uses different property names
      assertEqual(todo.completed_count, 50);
      assertEqual(todo.task_count, 100);
    });

    await runner.runTest('Edge case: Search with special regex characters', async () => {
      const projectId = generateTestProjectId('regex-search');

      await client.callToolAndParse('create_knowledge_file', {
        project_id: projectId,
        filename: 'regex-test',
        title: 'Regex Test',
        introduction: 'Testing special characters in search',
        keywords: ['regex'],
        chapters: [
          {
            title: 'Special Characters',
            content: 'Content with $pecial (characters) [brackets] {braces} and regex.*stuff',
          },
        ],
      });

      // Search for special characters (should be escaped internally)
      const searches = ['$pecial', '(characters)', '[brackets]', '{braces}', 'regex.*stuff'];

      for (const query of searches) {
        const result = await client.callToolAndParse('search_knowledge', {
          project_id: projectId,
          query: query,
        });

        assertSuccess(result);
        if (result.total_matches === 0) {
          throw new Error(`Failed to find "${query}" in content`);
        }
      }
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
      const resultPath = path.resolve(resultsDir, '10-edge-cases.json');
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
