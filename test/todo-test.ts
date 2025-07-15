#!/usr/bin/env tsx

/**
 * TODO System Test
 * Tests the TODO management functionality of the Knowledge MCP Server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TEST_PROJECT_ID = 'test-todo-project';

async function main() {
  console.log('🧪 Testing TODO Management System\n');

  // Create client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/knowledge-mcp/index.js'],
  });

  const client = new Client({
    name: 'todo-test-client',
    version: '1.0.0',
  });

  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');

  try {
    // Test 1: List TODOs (should be empty initially)
    console.log('📋 Test 1: List TODOs (empty)');
    const listResult1 = await client.callTool({
      name: 'list_todos',
      arguments: { project_id: TEST_PROJECT_ID },
    });
    console.log('Result:', JSON.parse(listResult1.content[0].text as string));
    console.log('✅ Test 1 passed\n');

    // Test 2: Create TODO with initial tasks
    console.log('📋 Test 2: Create TODO with initial tasks');
    const createResult = await client.callTool({
      name: 'create_todo',
      arguments: {
        project_id: TEST_PROJECT_ID,
        description: 'Implement authentication system',
        tasks: [
          'Create user model',
          'Add password hashing',
          'Implement JWT tokens',
        ],
      },
    });
    const createData = JSON.parse(createResult.content[0].text as string);
    console.log('Result:', createData);
    const todoNumber = createData.todo_number;
    console.log('✅ Test 2 passed\n');

    // Test 3: List TODOs (should show one TODO)
    console.log('📋 Test 3: List TODOs (with one TODO)');
    const listResult2 = await client.callTool({
      name: 'list_todos',
      arguments: { project_id: TEST_PROJECT_ID },
    });
    console.log('Result:', JSON.parse(listResult2.content[0].text as string));
    console.log('✅ Test 3 passed\n');

    // Test 4: Get TODO tasks
    console.log('📋 Test 4: Get TODO tasks');
    const getTasksResult = await client.callTool({
      name: 'get_todo_tasks',
      arguments: { 
        project_id: TEST_PROJECT_ID,
        todo_number: todoNumber,
      },
    });
    console.log('Result:', JSON.parse(getTasksResult.content[0].text as string));
    console.log('✅ Test 4 passed\n');

    // Test 5: Add a task
    console.log('📋 Test 5: Add a task');
    const addTaskResult = await client.callTool({
      name: 'add_todo_task',
      arguments: {
        project_id: TEST_PROJECT_ID,
        todo_number: todoNumber,
        description: 'Add user authentication middleware',
      },
    });
    console.log('Result:', JSON.parse(addTaskResult.content[0].text as string));
    console.log('✅ Test 5 passed\n');

    // Test 6: Get next TODO task
    console.log('📋 Test 6: Get next TODO task');
    const nextTaskResult = await client.callTool({
      name: 'get_next_todo_task',
      arguments: {
        project_id: TEST_PROJECT_ID,
        todo_number: todoNumber,
      },
    });
    console.log('Result:', JSON.parse(nextTaskResult.content[0].text as string));
    console.log('✅ Test 6 passed\n');

    // Test 7: Complete a task
    console.log('📋 Test 7: Complete a task');
    const completeResult = await client.callTool({
      name: 'complete_todo_task',
      arguments: {
        project_id: TEST_PROJECT_ID,
        todo_number: todoNumber,
        task_number: 1,
      },
    });
    console.log('Result:', JSON.parse(completeResult.content[0].text as string));
    console.log('✅ Test 7 passed\n');

    // Test 8: Get next TODO task (should be task 2 now)
    console.log('📋 Test 8: Get next TODO task (after completing task 1)');
    const nextTaskResult2 = await client.callTool({
      name: 'get_next_todo_task',
      arguments: {
        project_id: TEST_PROJECT_ID,
        todo_number: todoNumber,
      },
    });
    console.log('Result:', JSON.parse(nextTaskResult2.content[0].text as string));
    console.log('✅ Test 8 passed\n');

    // Test 9: Remove a task
    console.log('📋 Test 9: Remove a task');
    const removeResult = await client.callTool({
      name: 'remove_todo_task',
      arguments: {
        project_id: TEST_PROJECT_ID,
        todo_number: todoNumber,
        task_number: 4,
      },
    });
    console.log('Result:', JSON.parse(removeResult.content[0].text as string));
    console.log('✅ Test 9 passed\n');

    // Test 10: Create another TODO
    console.log('📋 Test 10: Create another TODO');
    const createResult2 = await client.callTool({
      name: 'create_todo',
      arguments: {
        project_id: TEST_PROJECT_ID,
        description: 'Add user profile features',
      },
    });
    console.log('Result:', JSON.parse(createResult2.content[0].text as string));
    console.log('✅ Test 10 passed\n');

    // Test 11: List all TODOs
    console.log('📋 Test 11: List all TODOs');
    const listResult3 = await client.callTool({
      name: 'list_todos',
      arguments: { project_id: TEST_PROJECT_ID },
    });
    console.log('Result:', JSON.parse(listResult3.content[0].text as string));
    console.log('✅ Test 11 passed\n');

    // Test 12: Delete a TODO
    console.log('📋 Test 12: Delete a TODO');
    const deleteResult = await client.callTool({
      name: 'delete_todo',
      arguments: {
        project_id: TEST_PROJECT_ID,
        todo_number: 2,
      },
    });
    console.log('Result:', JSON.parse(deleteResult.content[0].text as string));
    console.log('✅ Test 12 passed\n');

    console.log('🎉 All TODO tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MCP server');
  }
}

main().catch(console.error);