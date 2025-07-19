#!/usr/bin/env tsx

import { homedir } from 'os';
import { resolve, join } from 'path';

import { MCPTestClient } from '../utils/test-client.js';
import {
  TestRunner,
  assertSuccess,
  assertFailure,
  assertEqual,
  assertArrayLength,
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestProjectId,
  setCurrentRunner,
} from '../utils/test-helpers.js';

// Test configuration
const TEST_STORAGE_PATH = resolve(join(homedir(), '.knowledge-mcp-test-todo'));
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
    runner.setSuite('TODO Management System', 'Task Management');
    runner.enableDetailedTracking();
    setCurrentRunner(runner);

    await runner.runTest('list_todos: Empty project', async () => {
      const projectId = generateTestProjectId('todo-empty');

      const result = await client.callToolAndParse('list_todos', {
        project_id: projectId,
      });

      assertSuccess(result);
      assertArrayLength(result.todos as any[], 0);
    });

    await runner.runTest('create_todo: Basic TODO creation', async () => {
      const projectId = generateTestProjectId('todo-create');

      const result = await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Implement authentication system',
      });

      assertSuccess(result);
      assertEqual(result.todo_number, 1);
      assertEqual(result.message, 'Created TODO #1');
    });

    await runner.runTest('create_todo: With initial tasks', async () => {
      const projectId = generateTestProjectId('todo-tasks');

      const result = await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Build user interface',
        tasks: [
          { title: 'Design mockups', content: 'Create wireframes and visual designs for the UI' },
          { title: 'Create components', content: 'Build React components based on the designs' },
          { title: 'Add styling', content: 'Implement CSS styles and responsive design' },
          { title: 'Write tests', content: 'Add unit and integration tests for components' },
        ],
      });

      assertSuccess(result);
      assertEqual(result.todo_number, 1);

      // Verify tasks were created
      const tasksResult = await client.callToolAndParse('get_todo_tasks', {
        project_id: projectId,
        todo_number: 1,
      });

      assertSuccess(tasksResult);
      assertArrayLength(tasksResult.tasks as any[], 4);
    });

    await runner.runTest('list_todos: Multiple TODOs', async () => {
      const projectId = generateTestProjectId('todo-list');

      // Create multiple TODOs
      for (let i = 1; i <= 3; i++) {
        await client.callToolAndParse('create_todo', {
          project_id: projectId,
          description: `TODO ${i}`,
          tasks: [
            { title: `Task ${i}-1`, content: `Description for task ${i}-1` },
            { title: `Task ${i}-2`, content: `Description for task ${i}-2` },
          ],
        });
      }

      const result = await client.callToolAndParse('list_todos', {
        project_id: projectId,
      });

      assertSuccess(result);
      const todos = result.todos as any[];
      assertArrayLength(todos, 3);

      // Check ordering (should be in creation order)
      assertEqual(todos[0].number, 1);
      assertEqual(todos[1].number, 2);
      assertEqual(todos[2].number, 3);

      // Check completion status
      todos.forEach((todo: any) => {
        assertEqual(todo.completed_count, 0);
        assertEqual(todo.task_count, 2);
      });
    });

    await runner.runTest('get_todo_tasks: Retrieve tasks', async () => {
      const projectId = generateTestProjectId('todo-get');

      await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'API Development',
        tasks: [
          { title: 'Design API schema', content: 'Define REST API endpoints and data structures' },
          {
            title: 'Implement endpoints',
            content: 'Build API endpoints with proper error handling',
          },
          { title: 'Add authentication', content: 'Implement JWT-based authentication system' },
          { title: 'Write documentation', content: 'Create API documentation with examples' },
        ],
      });

      const result = await client.callToolAndParse('get_todo_tasks', {
        project_id: projectId,
        todo_number: 1,
      });

      assertSuccess(result);
      const todo = result.todo as any;
      assertEqual(todo.number, 1);
      assertEqual(todo.description, 'API Development');

      const tasks = result.tasks as any[];
      assertArrayLength(tasks, 4);

      // Check task structure
      tasks.forEach((task: any, index: number) => {
        assertEqual(task.number, index + 1);
        assertEqual(task.completed, false);
      });
    });

    await runner.runTest('add_todo_task: Add task to existing TODO', async () => {
      const projectId = generateTestProjectId('todo-add-task');

      // Create TODO with some tasks
      await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Feature Development',
        tasks: [
          { title: 'Task 1', content: 'First task description' },
          { title: 'Task 2', content: 'Second task description' },
        ],
      });

      // Add a new task
      const result = await client.callToolAndParse('add_todo_task', {
        project_id: projectId,
        todo_number: 1,
        title: 'Task 3 - newly added',
        content: 'This is the third task added dynamically',
      });

      assertSuccess(result);
      assertEqual(result.task_number, 3);

      // Verify task was added
      const tasksResult = await client.callToolAndParse('get_todo_tasks', {
        project_id: projectId,
        todo_number: 1,
      });

      assertArrayLength(tasksResult.tasks as any[], 3);
      const tasks = tasksResult.tasks as any[];
      assertEqual(tasks[2].description, 'Task 3 - newly added');
    });

    await runner.runTest('complete_todo_task: Mark task as completed', async () => {
      const projectId = generateTestProjectId('todo-complete');

      await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Testing Tasks',
        tasks: [
          { title: 'Write unit tests', content: 'Create unit tests for individual functions' },
          {
            title: 'Write integration tests',
            content: 'Test component interactions and API calls',
          },
          { title: 'Run test suite', content: 'Execute all tests and ensure 100% pass rate' },
        ],
      });

      // Complete the second task
      const result = await client.callToolAndParse('complete_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 2,
      });

      assertSuccess(result);

      // Verify completion
      const tasksResult = await client.callToolAndParse('get_todo_tasks', {
        project_id: projectId,
        todo_number: 1,
      });

      const tasks = tasksResult.tasks as any[];
      assertEqual(tasks[0].completed, false);
      assertEqual(tasks[1].completed, true);
      assertEqual(tasks[2].completed, false);

      // Check TODO completion count
      const listResult = await client.callToolAndParse('list_todos', {
        project_id: projectId,
      });

      const todo = (listResult.todos as any[])[0];
      assertEqual(todo.completed_count, 1);
      assertEqual(todo.task_count, 3);
    });

    await runner.runTest('get_next_todo_task: Get next incomplete task', async () => {
      const projectId = generateTestProjectId('todo-next');

      await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Sequential Tasks',
        tasks: [
          { title: 'First task', content: 'Complete the initial setup' },
          { title: 'Second task', content: 'Implement core functionality' },
          { title: 'Third task', content: 'Add finishing touches' },
        ],
      });

      // Initially should get first task
      let result = await client.callToolAndParse('get_next_todo_task', {
        project_id: projectId,
        todo_number: 1,
      });

      assertSuccess(result);
      const task = result.task as any;
      assertEqual(task?.number, 1);
      assertEqual(task?.description, 'First task');

      // Complete first task
      await client.callToolAndParse('complete_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 1,
      });

      // Now should get second task
      result = await client.callToolAndParse('get_next_todo_task', {
        project_id: projectId,
        todo_number: 1,
      });

      const nextTask = result.task as any;
      assertEqual(nextTask?.number, 2);
      assertEqual(nextTask?.description, 'Second task');
    });

    await runner.runTest('get_next_todo_task: All tasks completed', async () => {
      const projectId = generateTestProjectId('todo-all-complete');

      await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Completed TODO',
        tasks: [
          { title: 'Task 1', content: 'First task description' },
          { title: 'Task 2', content: 'Second task description' },
        ],
      });

      // Complete all tasks
      await client.callToolAndParse('complete_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 1,
      });

      await client.callToolAndParse('complete_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 2,
      });

      // Should return no task
      const result = await client.callToolAndParse('get_next_todo_task', {
        project_id: projectId,
        todo_number: 1,
      });

      assertSuccess(result);
      assertEqual(result.task, undefined);
      assertEqual(result.message, 'All tasks completed');
    });

    await runner.runTest('remove_todo_task: Remove existing task', async () => {
      const projectId = generateTestProjectId('todo-remove');

      await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Task Removal Test',
        tasks: [
          { title: 'Keep this', content: 'This task should remain' },
          { title: 'Remove this', content: 'This task will be removed' },
          { title: 'Keep this too', content: 'This task should also remain' },
        ],
      });

      // Remove the middle task
      const result = await client.callToolAndParse('remove_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 2,
      });

      assertSuccess(result);

      // Verify removal
      const tasksResult = await client.callToolAndParse('get_todo_tasks', {
        project_id: projectId,
        todo_number: 1,
      });

      const tasks = tasksResult.tasks as any[];
      assertArrayLength(tasks, 2);
      assertEqual(tasks[0].description, 'Keep this');
      assertEqual(tasks[1].description, 'Keep this too');
    });

    await runner.runTest('delete_todo: Delete entire TODO', async () => {
      const projectId = generateTestProjectId('todo-delete');

      // Create multiple TODOs
      for (let i = 1; i <= 3; i++) {
        await client.callToolAndParse('create_todo', {
          project_id: projectId,
          description: `TODO ${i}`,
        });
      }

      // Delete the middle one
      const result = await client.callToolAndParse('delete_todo', {
        project_id: projectId,
        todo_number: 2,
      });

      assertSuccess(result);

      // Verify deletion
      const listResult = await client.callToolAndParse('list_todos', {
        project_id: projectId,
      });

      const todos = listResult.todos as any[];
      assertArrayLength(todos, 2);

      // Remaining TODOs should keep their numbers
      assertEqual(todos[0].number, 1);
      assertEqual(todos[1].number, 3);
    });

    await runner.runTest('TODO operations: Non-existent TODO', async () => {
      const projectId = generateTestProjectId('todo-nonexistent');

      // Try operations on non-existent TODO
      const getResult = await client.callToolAndParse('get_todo_tasks', {
        project_id: projectId,
        todo_number: 999,
      });
      assertFailure(getResult);

      const addResult = await client.callToolAndParse('add_todo_task', {
        project_id: projectId,
        todo_number: 999,
        title: 'Task',
        content: 'This should fail as TODO does not exist',
      });
      assertFailure(addResult);

      const deleteResult = await client.callToolAndParse('delete_todo', {
        project_id: projectId,
        todo_number: 999,
      });
      assertFailure(deleteResult);
    });

    await runner.runTest('TODO operations: Non-existent task', async () => {
      const projectId = generateTestProjectId('todo-bad-task');

      await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Test TODO',
        tasks: [
          { title: 'Task 1', content: 'First task description' },
          { title: 'Task 2', content: 'Second task description' },
        ],
      });

      // Try operations on non-existent task
      const completeResult = await client.callToolAndParse('complete_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 999,
      });
      assertFailure(completeResult);

      const removeResult = await client.callToolAndParse('remove_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 999,
      });
      assertFailure(removeResult);
    });

    await runner.runTest('TODO persistence: Complex workflow', async () => {
      const projectId = generateTestProjectId('todo-workflow');

      // Create TODO for a feature implementation
      await client.callToolAndParse('create_todo', {
        project_id: projectId,
        description: 'Implement user authentication',
        tasks: [
          { title: 'Design database schema', content: 'Create ERD and define table structures' },
          { title: 'Create user model', content: 'Implement User model with validation' },
          {
            title: 'Implement registration endpoint',
            content: 'Build POST /api/register endpoint',
          },
          { title: 'Implement login endpoint', content: 'Build POST /api/login endpoint with JWT' },
          {
            title: 'Add password hashing',
            content: 'Implement bcrypt for secure password storage',
          },
          {
            title: 'Create JWT token generation',
            content: 'Implement JWT token creation and validation',
          },
          { title: 'Write tests', content: 'Add comprehensive test coverage for auth endpoints' },
        ],
      });

      // Simulate working through tasks
      await client.callToolAndParse('complete_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 1,
      });

      await client.callToolAndParse('complete_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 2,
      });

      // Add a new task in the middle
      await client.callToolAndParse('add_todo_task', {
        project_id: projectId,
        todo_number: 1,
        title: 'Add email validation',
        content: 'Implement email format validation for user registration',
      });

      // Complete more tasks
      await client.callToolAndParse('complete_todo_task', {
        project_id: projectId,
        todo_number: 1,
        task_number: 3,
      });

      // Check final state
      const result = await client.callToolAndParse('get_todo_tasks', {
        project_id: projectId,
        todo_number: 1,
      });

      // const _todo = result.todo as any; // Unused but available in result
      const tasks = result.tasks as any[];

      assertArrayLength(tasks, 8); // 7 original + 1 added

      // Count completed
      const completed = tasks.filter((t: any) => t.completed).length;
      assertEqual(completed, 3);

      // Verify TODO summary
      const listResult = await client.callToolAndParse('list_todos', {
        project_id: projectId,
      });

      const todoSummary = (listResult.todos as any[])[0];
      assertEqual(todoSummary.completed_count, 3);
      assertEqual(todoSummary.task_count, 8);
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
      const resultPath = path.resolve(resultsDir, '08-todo.json');
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
