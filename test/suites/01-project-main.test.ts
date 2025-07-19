#!/usr/bin/env tsx

import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import { getSampleProjectMain } from '../utils/test-data-loader.js';
import {
  TestRunner,
  assertSuccess,
  assertFailure,
  assertEqual,
  assertContains,
  assertNotContains,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  generateTestContent,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-project-main'));
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
    runner.setSuite('Project Main Operations', 'Core Functionality');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    // Test get_project_main
    await runner.runTest('get_project_main: Non-existing project', async () => {
      const result = await client.callToolAndParse('get_project_main', {
        project_id: 'non-existing-project',
      });

      assertEqual(result.exists, false);
      assertEqual(result.content, '');
    });

    await runner.runTest('get_project_main: Create and retrieve project', async () => {
      const projectId = generateTestProjectId('main');
      const content = getSampleProjectMain();

      // Create project
      const createResult = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });
      assertSuccess(createResult);

      // Retrieve project
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertEqual(getResult.exists, true);
      assertEqual(getResult.content, content);
    });

    await runner.runTest('get_project_main: Project with special characters', async () => {
      const projectId = 'test-project-üñíçødé-' + Date.now();
      const content = '# Special Project\n\nWith üñíçødé characters!';

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const result = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertEqual(result.exists, true);
      assertEqual(result.content, content);
    });

    // Test update_project_main
    await runner.runTest('update_project_main: Create new project', async () => {
      const projectId = generateTestProjectId('update');
      const content = generateTestContent(3);

      const result = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      assertSuccess(result);
    });

    await runner.runTest('update_project_main: Replace existing project', async () => {
      const projectId = generateTestProjectId('replace');
      const originalContent = '# Original\n\nOriginal content';
      const newContent = '# Replaced\n\nCompletely new content';

      // Create original
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: originalContent,
      });

      // Replace
      const replaceResult = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: newContent,
      });
      assertSuccess(replaceResult);

      // Verify replacement
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertEqual(getResult.content, newContent);
    });

    await runner.runTest('update_project_main: Large content', async () => {
      const projectId = generateTestProjectId('large');
      const sections: string[] = [];
      for (let i = 1; i <= 100; i++) {
        sections.push(`## Section ${i}\n\nContent for section ${i}.\n`);
      }
      const largeContent = '# Large Project\n\n' + sections.join('\n');

      const result = await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: largeContent,
      });

      assertSuccess(result);
    });

    // Test update_project_section
    await runner.runTest('update_project_section: Update existing section', async () => {
      const projectId = generateTestProjectId('section-update');
      const content = `# Test Project

## Section A
Original content A

## Section B
Original content B

## Section C
Original content C`;

      // Create project
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      // Update section
      const updateResult = await client.callToolAndParse('update_project_section', {
        project_id: projectId,
        section_header: '## Section B',
        new_content: 'Updated content for section B\nWith multiple lines',
      });
      assertSuccess(updateResult);

      // Verify update
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertContains(getResult.content as string, 'Updated content for section B');
      assertContains(getResult.content as string, 'Original content A');
      assertContains(getResult.content as string, 'Original content C');
    });

    await runner.runTest('update_project_section: Non-existent section', async () => {
      const projectId = generateTestProjectId('section-fail');
      const content = '# Test\n\n## Existing Section\n\nContent';

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const result = await client.callToolAndParse('update_project_section', {
        project_id: projectId,
        section_header: '## Non-existent Section',
        new_content: 'This should fail',
      });

      assertFailure(result);
    });

    // Test remove_project_section
    await runner.runTest('remove_project_section: Remove existing section', async () => {
      const projectId = generateTestProjectId('section-remove');
      const content = `# Test Project

## Keep This
Content to keep

## Remove This
Content to remove

## Also Keep This
More content to keep`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const removeResult = await client.callToolAndParse('remove_project_section', {
        project_id: projectId,
        section_header: '## Remove This',
      });
      assertSuccess(removeResult);

      // Verify removal
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertNotContains(getResult.content as string, '## Remove This');
      assertNotContains(getResult.content as string, 'Content to remove');
      assertContains(getResult.content as string, '## Keep This');
      assertContains(getResult.content as string, '## Also Keep This');
    });

    await runner.runTest('remove_project_section: Non-existent section', async () => {
      const projectId = generateTestProjectId('section-remove-fail');
      const content = '# Test\n\n## Only Section\n\nContent';

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const result = await client.callToolAndParse('remove_project_section', {
        project_id: projectId,
        section_header: '## Does Not Exist',
      });

      assertFailure(result);
    });

    // Test add_project_section (new feature)
    await runner.runTest('add_project_section: Add at end', async () => {
      const projectId = generateTestProjectId('section-add-end');
      const content = `# Test Project

## First Section
First content

## Second Section
Second content`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const addResult = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## New Section',
        content: 'New section content',
        position: 'end',
      });
      assertSuccess(addResult);

      // Verify addition
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      const resultContent = getResult.content as string;
      assertContains(resultContent, '## New Section');
      assertContains(resultContent, 'New section content');

      // Verify it's at the end
      const newSectionIndex = resultContent.indexOf('## New Section');
      const secondSectionIndex = resultContent.indexOf('## Second Section');
      if (newSectionIndex <= secondSectionIndex) {
        throw new Error('New section was not added at the end');
      }
    });

    await runner.runTest('add_project_section: Add before specific section', async () => {
      const projectId = generateTestProjectId('section-add-before');
      const content = `# Test Project

## Section A
Content A

## Section C
Content C`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const addResult = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Section B',
        content: 'Content B',
        position: 'before',
        reference_header: '## Section C',
      });
      assertSuccess(addResult);

      // Verify addition and position
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      const resultContent = getResult.content as string;

      const sectionAIndex = resultContent.indexOf('## Section A');
      const sectionBIndex = resultContent.indexOf('## Section B');
      const sectionCIndex = resultContent.indexOf('## Section C');

      if (!(sectionAIndex < sectionBIndex && sectionBIndex < sectionCIndex)) {
        throw new Error('Section B was not inserted in the correct position');
      }
    });

    await runner.runTest('add_project_section: Add after specific section', async () => {
      const projectId = generateTestProjectId('section-add-after');
      const content = `# Test Project

## Section A
Content A

## Section C
Content C`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const addResult = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Section B',
        content: 'Content B',
        position: 'after',
        reference_header: '## Section A',
      });
      assertSuccess(addResult);

      // Verify addition and position
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      const resultContent = getResult.content as string;

      const sectionAIndex = resultContent.indexOf('## Section A');
      const sectionBIndex = resultContent.indexOf('## Section B');
      const sectionCIndex = resultContent.indexOf('## Section C');

      if (!(sectionAIndex < sectionBIndex && sectionBIndex < sectionCIndex)) {
        throw new Error('Section B was not inserted in the correct position');
      }
    });

    await runner.runTest('add_project_section: Duplicate section header', async () => {
      const projectId = generateTestProjectId('section-add-duplicate');
      const content = `# Test Project

## Existing Section
Content`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const result = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Existing Section',
        content: 'Duplicate content',
        position: 'end',
      });

      assertFailure(result);
    });

    await runner.runTest('add_project_section: Invalid target section', async () => {
      const projectId = generateTestProjectId('section-add-invalid');
      const content = `# Test Project

## Only Section
Content`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const result = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## New Section',
        content: 'Content',
        position: 'before',
        reference_header: '## Non-existent',
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
      const resultPath = path.resolve(resultsDir, '01-project-main.json');
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
