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
  assertNotContains,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-sections'));
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
    runner.setSuite('Project Section Operations (Comprehensive)', 'Core Functionality');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    // Test complex section operations
    await runner.runTest('add_project_section: Add multiple sections in sequence', async () => {
      const projectId = generateTestProjectId('multi-add');
      const content = `# Project

## Introduction
Intro content`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      // Add sections in different positions
      await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Architecture',
        content: 'Architecture details',
        position: 'end',
      });

      await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Setup',
        content: 'Setup instructions',
        position: 'after',
        reference_header: '## Introduction',
      });

      await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Overview',
        content: 'Project overview',
        position: 'before',
        reference_header: '## Introduction',
      });

      // Verify final order
      const result = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      const content_str = result.content as string;

      const positions = [
        content_str.indexOf('## Overview'),
        content_str.indexOf('## Introduction'),
        content_str.indexOf('## Setup'),
        content_str.indexOf('## Architecture'),
      ];

      // Check they're in ascending order
      for (let i = 1; i < positions.length; i++) {
        if (positions[i] <= positions[i - 1]) {
          throw new Error(`Sections not in expected order: ${positions.join(', ')}`);
        }
      }
    });

    await runner.runTest('add_project_section: Handle empty project', async () => {
      const projectId = generateTestProjectId('empty-add');

      // Create empty project
      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: '',
      });

      // Add first section
      const result = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## First Section',
        content: 'First content',
        position: 'end',
      });
      assertSuccess(result);

      // Verify
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      // Implementation adds extra newlines for formatting
      assertEqual(getResult.content, '\n\n## First Section\n\nFirst content');
    });

    await runner.runTest(
      'add_project_section: Multi-line content with special characters',
      async () => {
        const projectId = generateTestProjectId('multiline');
        const content = '# Test\n\n## Existing\nContent';

        await client.callToolAndParse('update_project_main', {
          project_id: projectId,
          content: content,
        });

        const multilineContent = `Line 1 with special chars: <>&"'
Line 2 with unicode: üñíçødé
Line 3 with code: \`const x = 10;\`
Line 4 with markdown: **bold** and *italic*`;

        const result = await client.callToolAndParse('add_project_section', {
          project_id: projectId,
          section_header: '## Complex Section',
          content: multilineContent,
          position: 'end',
        });
        assertSuccess(result);

        // Verify content preserved exactly
        const getResult = await client.callToolAndParse('get_project_main', {
          project_id: projectId,
        });
        assertContains(getResult.content as string, multilineContent);
      }
    );

    await runner.runTest('update_project_section: Preserve section formatting', async () => {
      const projectId = generateTestProjectId('format-preserve');
      const content = `# Project

## Section With Extra Spaces  
Content with trailing spaces  
And blank lines below


## Another Section
More content`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      // Update section preserving the header format
      const result = await client.callToolAndParse('update_project_section', {
        project_id: projectId,
        section_header: '## Section With Extra Spaces',
        new_content: 'New content\nWith multiple lines',
      });
      assertSuccess(result);

      // Verify header preserved
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      assertContains(getResult.content as string, '## Section With Extra Spaces  ');
    });

    await runner.runTest('Section operations: Combined add, update, remove', async () => {
      const projectId = generateTestProjectId('combined');
      const content = `# Combined Test

## Section 1
Content 1

## Section 2
Content 2

## Section 3
Content 3`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      // 1. Add new section
      await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Section 1.5',
        content: 'Content 1.5',
        position: 'after',
        reference_header: '## Section 1',
      });

      // 2. Update existing section
      await client.callToolAndParse('update_project_section', {
        project_id: projectId,
        section_header: '## Section 2',
        new_content: 'Updated content 2',
      });

      // 3. Remove a section
      await client.callToolAndParse('remove_project_section', {
        project_id: projectId,
        section_header: '## Section 3',
      });

      // 4. Add another section at the end
      await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Section 4',
        content: 'Content 4',
        position: 'end',
      });

      // Verify final state
      const result = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      const finalContent = result.content as string;

      assertContains(finalContent, '## Section 1');
      assertContains(finalContent, '## Section 1.5');
      assertContains(finalContent, '## Section 2');
      assertContains(finalContent, 'Updated content 2');
      assertNotContains(finalContent, '## Section 3');
      assertContains(finalContent, '## Section 4');
    });

    await runner.runTest('add_project_section: Edge case - add before first section', async () => {
      const projectId = generateTestProjectId('add-first');
      const content = `# Title

Some intro text

## First Section
First content

## Second Section
Second content`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      const result = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## New First',
        content: 'New first content',
        position: 'before',
        reference_header: '## First Section',
      });
      assertSuccess(result);

      // Verify position
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      // const _finalContent = result.content as string; // Unused variable

      // Should maintain intro text before sections
      assertContains(getResult.content as string, 'Some intro text\n\n## New First');
    });

    await runner.runTest('add_project_section: Handle nested headers (###, ####)', async () => {
      const projectId = generateTestProjectId('nested');
      const content = `# Project

## Main Section
Main content

### Subsection
Sub content

## Another Main
More content`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      // Add section between main sections (should handle subsections correctly)
      const result = await client.callToolAndParse('add_project_section', {
        project_id: projectId,
        section_header: '## Middle Section',
        content: 'Middle content',
        position: 'after',
        reference_header: '## Main Section',
      });
      assertSuccess(result);

      // Verify subsection wasn't affected
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      const finalContent = getResult.content as string;

      const mainIndex = finalContent.indexOf('## Main Section');
      const subIndex = finalContent.indexOf('### Subsection');
      const middleIndex = finalContent.indexOf('## Middle Section');
      const anotherIndex = finalContent.indexOf('## Another Main');

      // Verify order: Main -> Subsection -> Middle -> Another
      if (!(mainIndex < subIndex && subIndex < middleIndex && middleIndex < anotherIndex)) {
        throw new Error('Sections not in expected order with subsections');
      }
    });

    await runner.runTest('Section boundary detection', async () => {
      const projectId = generateTestProjectId('boundary');
      const content = `# Project

## Section A
Content A
More content A
Even more content A

## Section B
Content B

### Subsection B1
Sub content B1

### Subsection B2
Sub content B2

## Section C
Content C`;

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      // Update Section B (should include all subsections)
      const result = await client.callToolAndParse('update_project_section', {
        project_id: projectId,
        section_header: '## Section B',
        new_content: 'New content B only\nNo subsections',
      });
      assertSuccess(result);

      // Verify subsections were removed
      const getResult = await client.callToolAndParse('get_project_main', {
        project_id: projectId,
      });
      const finalContent = getResult.content as string;

      assertNotContains(finalContent, '### Subsection B1');
      assertNotContains(finalContent, '### Subsection B2');
      assertContains(finalContent, 'New content B only');
      assertContains(finalContent, '## Section C'); // Should still exist
    });

    await runner.runTest('add_project_section: Invalid position parameter', async () => {
      const projectId = generateTestProjectId('invalid-pos');
      const content = '# Test\n\n## Section\nContent';

      await client.callToolAndParse('update_project_main', {
        project_id: projectId,
        content: content,
      });

      try {
        await client.callToolAndParse('add_project_section', {
          project_id: projectId,
          section_header: '## New',
          content: 'Content',
          position: 'invalid-position' as any,
        });

        throw new Error('Expected validation error for invalid position');
      } catch (error: any) {
        // This is expected - MCP validates enum values
        assertContains((error as Error).message, 'invalid_enum_value');
      }
    });

    await runner.runTest(
      'add_project_section: Missing reference_header for before/after',
      async () => {
        const projectId = generateTestProjectId('missing-target');
        const content = '# Test\n\n## Section\nContent';

        await client.callToolAndParse('update_project_main', {
          project_id: projectId,
          content: content,
        });

        const result = await client.callToolAndParse('add_project_section', {
          project_id: projectId,
          section_header: '## New',
          content: 'Content',
          position: 'before',
          // reference_header missing
        });

        assertFailure(result);
      }
    );
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
      const resultPath = path.resolve(resultsDir, '02-project-sections.json');
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
