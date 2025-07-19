import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  rmSync,
} from 'fs';
import { access, mkdir, readFile, writeFile, readdir, unlink, rm } from 'fs/promises';
import { join } from 'path';

import fm from 'front-matter';
import * as yaml from 'js-yaml';
import slugify from 'slugify';
import type { z } from 'zod';

import { MCPError, MCPErrorCode } from '../errors/index.js';
import type {
  secureProjectIdSchema,
  secureTodoNumberSchema,
  secureTodoDescriptionSchema,
  secureTaskTitleSchema,
  secureTaskContentSchema,
  taskInputSchema,
} from '../schemas/validation.js';
import {
  getProjectDirectory,
  createProjectEntry,
  autoCommit,
  getProjectDirectoryAsync,
  createProjectEntryAsync,
  autoCommitAsync,
} from '../utils.js';

import { BaseHandler } from './BaseHandler.js';

interface TodoMetadata {
  created: string;
  description: string;
}

// Metadata stored in markdown frontmatter
interface TaskMetadata {
  completed: boolean;
  created: string;
  updated: string;
}

// Full task information including parsed markdown
interface TaskData {
  title: string;
  content: string;
  metadata: TaskMetadata;
}

interface TodoInfo {
  number: number;
  description: string;
  created: string;
  completed: boolean;
  task_count: number;
  completed_count: number;
}

interface TaskInfo {
  number: number;
  description: string;
  completed: boolean;
}

export class TodoToolHandler extends BaseHandler {
  /**
   * List all TODOs in a project
   */
  listTodos(params: { project_id: z.infer<typeof secureProjectIdSchema> }): string {
    const context = this.createContext('list_todos', params);

    try {
      const { project_id } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Project doesn't exist - return empty list without creating ghost entry
      if (!projectInfo) {
        this.logSuccess('list_todos', { project_id }, context);
        return this.formatSuccessResponse({ todos: [] });
      }

      const [, projectPath] = projectInfo;
      const todoPath = join(projectPath, 'TODO');

      // If TODO directory doesn't exist, return empty list (don't create it for read-only operation)
      if (!existsSync(todoPath)) {
        this.logSuccess('list_todos', { project_id }, context);
        return this.formatSuccessResponse({ todos: [] });
      }

      // Scan for TODO directories
      const entries = readdirSync(todoPath, { withFileTypes: true });
      const todos: TodoInfo[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
          const todoNumber = parseInt(entry.name);
          const todoDir = join(todoPath, entry.name);
          const indexPath = join(todoDir, 'index.json');

          if (existsSync(indexPath)) {
            const metadata = JSON.parse(readFileSync(indexPath, 'utf8')) as TodoMetadata;

            // Count tasks and completed tasks
            const taskFiles = this.getTaskFiles(todoDir);

            let completedCount = 0;
            for (const taskFile of taskFiles) {
              const task = this.readTask(todoDir, taskFile);
              if (task.metadata.completed) {
                completedCount++;
              }
            }

            todos.push({
              number: todoNumber,
              description: metadata.description,
              created: metadata.created,
              completed: taskFiles.length > 0 && completedCount === taskFiles.length,
              task_count: taskFiles.length,
              completed_count: completedCount,
            });
          }
        }
      }

      // Sort by number
      todos.sort((a, b) => a.number - b.number);

      this.logSuccess('list_todos', { project_id }, context);
      return this.formatSuccessResponse({ todos });
    } catch (error) {
      this.logError('list_todos', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Create a new TODO list with markdown tasks
   */
  createTodo(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    description: z.infer<typeof secureTodoDescriptionSchema>;
    tasks?: z.infer<typeof taskInputSchema>[]; // Markdown format only
  }): string {
    const context = this.createContext('create_todo', {
      project_id: params.project_id,
      description: params.description,
      task_count: params.tasks?.length ?? 0,
    });

    try {
      const { project_id, description, tasks } = params;
      // Use createProjectEntry for write operations that create new projects
      const [, projectPath] = createProjectEntry(this.storagePath, project_id);
      const todoPath = join(projectPath, 'TODO');

      // Create TODO directory if it doesn't exist
      if (!existsSync(todoPath)) {
        mkdirSync(todoPath, { recursive: true });
      }

      // Find next TODO number
      const todoNumber = this.getNextTodoNumber(todoPath);
      const todoDir = join(todoPath, String(todoNumber));

      // Create TODO directory
      mkdirSync(todoDir);

      // Create metadata file
      const metadata: TodoMetadata = {
        created: new Date().toISOString(),
        description,
      };
      writeFileSync(join(todoDir, 'index.json'), JSON.stringify(metadata, null, 2));

      // Create initial tasks if provided
      if (tasks && tasks.length > 0) {
        for (let i = 0; i < tasks.length; i++) {
          const taskNumber = i + 1;
          const task = tasks[i];
          // Markdown format with title and content
          this.createTaskFile(todoDir, taskNumber, task.title, task.content);
        }
      }

      // Commit changes
      autoCommit(
        this.storagePath,
        `Update knowledge for ${project_id}: Created TODO #${todoNumber}`
      );

      this.logSuccess('create_todo', { project_id, todo_number: todoNumber }, context);
      return this.formatSuccessResponse({
        todo_number: todoNumber,
        message: `Created TODO #${todoNumber}`,
      });
    } catch (error) {
      this.logError('create_todo', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Add a task to a TODO list
   */
  addTodoTask(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
    title: z.infer<typeof secureTaskTitleSchema>;
    content?: z.infer<typeof secureTaskContentSchema>;
  }): string {
    const context = this.createContext('add_todo_task', params);

    try {
      const { project_id, todo_number, title, content } = params;

      if (!title) {
        throw new MCPError(MCPErrorCode.INVALID_INPUT, 'Task title is required', {
          traceId: context.traceId,
        });
      }
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Check if project exists
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', String(todo_number));

      // Check if TODO exists
      if (!existsSync(todoDir)) {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Find next task number
      const taskNumber = this.getNextTaskNumber(todoDir);

      // Create markdown task file
      this.createTaskFile(todoDir, taskNumber, title, content);

      // Commit changes
      autoCommit(
        this.storagePath,
        `Update knowledge for ${project_id}: Added task to TODO #${todo_number}`
      );

      this.logSuccess(
        'add_todo_task',
        { project_id, todo_number, task_number: taskNumber },
        context
      );
      return this.formatSuccessResponse({
        task_number: taskNumber,
        message: `Added task #${taskNumber} to TODO #${todo_number}`,
      });
    } catch (error) {
      this.logError('add_todo_task', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Remove a task from a TODO list
   */
  removeTodoTask(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
    task_number: z.infer<typeof secureTodoNumberSchema>;
  }): string {
    const context = this.createContext('remove_todo_task', params);

    try {
      const { project_id, todo_number, task_number } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Check if project exists
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', String(todo_number));

      // Check if TODO exists
      if (!existsSync(todoDir)) {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Find task file
      const taskFile = this.findTaskFile(todoDir, task_number);
      if (!taskFile) {
        throw new MCPError(
          MCPErrorCode.TODO_TASK_NOT_FOUND,
          `Task #${task_number} not found in TODO #${todo_number}`,
          { project_id, todo_number, task_number, traceId: context.traceId }
        );
      }

      // Delete task file
      unlinkSync(join(todoDir, taskFile));

      // Commit changes
      autoCommit(
        this.storagePath,
        `Update knowledge for ${project_id}: Removed task #${task_number} from TODO #${todo_number}`
      );

      this.logSuccess('remove_todo_task', params, context);
      return this.formatSuccessResponse({
        message: `Removed task #${task_number} from TODO #${todo_number}`,
      });
    } catch (error) {
      this.logError('remove_todo_task', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Mark a task as completed
   */
  completeTodoTask(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
    task_number: z.infer<typeof secureTodoNumberSchema>;
  }): string {
    const context = this.createContext('complete_todo_task', params);

    try {
      const { project_id, todo_number, task_number } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Check if project exists
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', String(todo_number));

      // Check if TODO exists
      if (!existsSync(todoDir)) {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Find task file
      const taskFile = this.findTaskFile(todoDir, task_number);
      if (!taskFile) {
        throw new MCPError(
          MCPErrorCode.TODO_TASK_NOT_FOUND,
          `Task #${task_number} not found in TODO #${todo_number}`,
          { project_id, todo_number, task_number, traceId: context.traceId }
        );
      }

      // Update task completion status
      this.updateTaskCompletion(todoDir, taskFile, true);

      // Commit changes
      autoCommit(
        this.storagePath,
        `Update knowledge for ${project_id}: Completed task #${task_number} in TODO #${todo_number}`
      );

      this.logSuccess('complete_todo_task', params, context);
      return this.formatSuccessResponse({
        message: `Marked task #${task_number} as completed in TODO #${todo_number}`,
      });
    } catch (error) {
      this.logError('complete_todo_task', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Get the next open task in a TODO list
   */
  getNextTodoTask(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
  }): string {
    const context = this.createContext('get_next_todo_task', params);

    try {
      const { project_id, todo_number } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Check if project exists
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', String(todo_number));

      // Check if TODO exists
      if (!existsSync(todoDir)) {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Get all task files sorted
      const taskFiles = this.getTaskFiles(todoDir);

      // Find first incomplete task
      for (const taskFile of taskFiles) {
        const task = this.readTask(todoDir, taskFile);
        if (!task.metadata.completed) {
          const taskNumber = this.extractTaskNumber(taskFile);
          this.logSuccess('get_next_todo_task', params, context);
          return this.formatSuccessResponse({
            task: {
              number: taskNumber,
              description: task.title,
            },
          });
        }
      }

      // No incomplete tasks found
      this.logSuccess('get_next_todo_task', params, context);
      return this.formatSuccessResponse({
        message: 'All tasks completed',
      });
    } catch (error) {
      this.logError('get_next_todo_task', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Get all tasks in a TODO list
   */
  getTodoTasks(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
  }): string {
    const context = this.createContext('get_todo_tasks', params);

    try {
      const { project_id, todo_number } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Check if project exists
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', String(todo_number));

      // Check if TODO exists
      if (!existsSync(todoDir)) {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Get TODO metadata
      const indexPath = join(todoDir, 'index.json');
      const metadata: TodoMetadata = existsSync(indexPath)
        ? (JSON.parse(readFileSync(indexPath, 'utf8')) as TodoMetadata)
        : { description: '', created: '' };

      // Get all task files sorted
      const taskFiles = this.getTaskFiles(todoDir);

      const tasks: TaskInfo[] = [];
      for (const taskFile of taskFiles) {
        const task = this.readTask(todoDir, taskFile);
        const taskNumber = this.extractTaskNumber(taskFile);
        tasks.push({
          number: taskNumber,
          description: task.title,
          completed: task.metadata.completed,
        });
      }

      this.logSuccess('get_todo_tasks', params, context);
      return this.formatSuccessResponse({
        todo: {
          number: todo_number,
          description: metadata.description,
          created: metadata.created,
        },
        tasks,
      });
    } catch (error) {
      this.logError('get_todo_tasks', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Delete a TODO list
   */
  deleteTodo(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
  }): string {
    const context = this.createContext('delete_todo', params);

    try {
      const { project_id, todo_number } = params;
      const projectInfo = getProjectDirectory(this.storagePath, project_id);

      // Check if project exists
      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', String(todo_number));

      // Check if TODO exists
      if (!existsSync(todoDir)) {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Delete TODO directory
      rmSync(todoDir, { recursive: true, force: true });

      // Commit changes
      autoCommit(
        this.storagePath,
        `Update knowledge for ${project_id}: Deleted TODO #${todo_number}`
      );

      this.logSuccess('delete_todo', params, context);
      return this.formatSuccessResponse({
        message: `Deleted TODO #${todo_number}`,
      });
    } catch (error) {
      this.logError('delete_todo', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  // Helper methods
  private getNextTodoNumber(todoPath: string): number {
    if (!existsSync(todoPath)) {
      return 1;
    }

    const entries = readdirSync(todoPath, { withFileTypes: true });
    const todoNumbers = entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => parseInt(entry.name))
      .sort((a, b) => b - a);

    return todoNumbers.length > 0 ? todoNumbers[0] + 1 : 1;
  }

  private getNextTaskNumber(todoDir: string): number {
    const taskFiles = this.getTaskFiles(todoDir);

    const taskNumbers = taskFiles
      .map((file) => this.extractTaskNumber(file))
      .filter((num) => num > 0)
      .sort((a, b) => b - a);

    return taskNumbers.length > 0 ? taskNumbers[0] + 1 : 1;
  }

  private findTaskFile(todoDir: string, taskNumber: number): string | null {
    const paddedNumber = String(taskNumber).padStart(3, '0');
    const prefix = `TASK-${paddedNumber}-`;

    const files = readdirSync(todoDir);
    return files.find((file) => file.startsWith(prefix) && file.endsWith('.md')) ?? null;
  }

  private extractTaskNumber(filename: string): number {
    const match = filename.match(/^TASK-(\d{3})-.*\.md$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // Helper method to create a markdown task file
  private createTaskFile(
    todoDir: string,
    taskNumber: number,
    title: string,
    content?: string
  ): string {
    const paddedNumber = String(taskNumber).padStart(3, '0');
    const slug = slugify(title, { lower: true, strict: true });
    const filename = `TASK-${paddedNumber}-${slug}.md`;

    const metadata: TaskMetadata = {
      completed: false,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const frontmatter = yaml.dump(metadata);
    const fullContent = `---\n${frontmatter}---\n\n# ${title}\n\n${content ?? ''}`;

    writeFileSync(join(todoDir, filename), fullContent);
    return filename;
  }

  // Helper method to read markdown tasks
  private readTask(todoDir: string, filename: string): TaskData {
    const filepath = join(todoDir, filename);
    const fileContent = readFileSync(filepath, 'utf8');

    // Markdown format only
    const parsed = fm(fileContent);
    const metadata = parsed.attributes as TaskMetadata;

    // Extract title from first # header
    const lines = parsed.body.split('\n');
    const titleLine = lines.find((line) => line.startsWith('# '));
    const title = titleLine ? titleLine.substring(2).trim() : 'Untitled Task';

    return {
      title,
      content: parsed.body,
      metadata,
    };
  }

  // Helper method to update task completion status
  private updateTaskCompletion(todoDir: string, filename: string, completed: boolean): void {
    const filepath = join(todoDir, filename);

    // Markdown format only
    const fileContent = readFileSync(filepath, 'utf8');
    const parsed = fm(fileContent);
    const metadata = parsed.attributes as TaskMetadata;

    metadata.completed = completed;
    metadata.updated = new Date().toISOString();

    const frontmatter = yaml.dump(metadata);
    const updatedContent = `---\n${frontmatter}---\n${parsed.body}`;
    writeFileSync(filepath, updatedContent);
  }

  // Find task files (markdown only)
  private getTaskFiles(todoDir: string): string[] {
    return readdirSync(todoDir)
      .filter((file) => file.startsWith('TASK-') && file.endsWith('.md'))
      .sort();
  }

  // Async versions of public methods

  /**
   * List all TODOs in a project (async version)
   */
  async listTodosAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
  }): Promise<string> {
    const context = this.createContext('list_todos', params);

    try {
      const { project_id } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      // Project doesn't exist - return empty list without creating ghost entry
      if (!projectInfo) {
        this.logSuccess('list_todos', { project_id }, context);
        return this.formatSuccessResponse({ todos: [] });
      }

      const [, projectPath] = projectInfo;
      const todoPath = join(projectPath, 'TODO');

      // If TODO directory doesn't exist, return empty list (don't create it for read-only operation)
      try {
        await access(todoPath);
      } catch {
        this.logSuccess('list_todos', { project_id }, context);
        return this.formatSuccessResponse({ todos: [] });
      }

      // Scan for TODO directories
      const entries = await readdir(todoPath, { withFileTypes: true });
      const todos: TodoInfo[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
          const todoNumber = parseInt(entry.name);
          const todoDir = join(todoPath, entry.name);
          const indexPath = join(todoDir, 'index.json');

          try {
            const indexContent = await readFile(indexPath, 'utf8');
            const metadata = JSON.parse(indexContent) as TodoMetadata;

            // Count tasks
            const taskFiles = await this.getTaskFilesAsync(todoDir);
            let completedCount = 0;

            for (const taskFile of taskFiles) {
              const taskPath = join(todoDir, taskFile);
              const taskContent = await readFile(taskPath, 'utf8');
              const parsed = fm<TaskMetadata>(taskContent);
              if (parsed.attributes.completed) {
                completedCount++;
              }
            }

            todos.push({
              number: todoNumber,
              description: metadata.description,
              created: metadata.created,
              completed: taskFiles.length > 0 && completedCount === taskFiles.length,
              task_count: taskFiles.length,
              completed_count: completedCount,
            });
          } catch (error) {
            // Skip invalid TODO directories
            console.error(`Skipping invalid TODO directory ${todoNumber}:`, error);
          }
        }
      }

      // Sort by number ascending
      todos.sort((a, b) => a.number - b.number);

      this.logSuccess('list_todos', { project_id, count: todos.length }, context);
      return this.formatSuccessResponse({ todos });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to list TODOs: ${error instanceof Error ? error.message : String(error)}`,
              { project_id: params.project_id, traceId: context.traceId }
            );
      this.logError('list_todos', params, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Create a new TODO list (async version)
   */
  async createTodoAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    description: z.infer<typeof secureTodoDescriptionSchema>;
    tasks?: z.infer<typeof taskInputSchema>[];
  }): Promise<string> {
    const context = this.createContext('create_todo', params);

    try {
      const { project_id, description, tasks = [] } = params;
      const [originalId, projectPath] = await createProjectEntryAsync(this.storagePath, project_id);
      const todoPath = join(projectPath, 'TODO');

      // Create TODO directory if it doesn't exist
      await mkdir(todoPath, { recursive: true });

      // Get next TODO number
      const todoNumber = await this.getNextTodoNumberAsync(todoPath);
      const todoDir = join(todoPath, todoNumber.toString());

      // Create TODO directory
      await mkdir(todoDir);

      // Create index.json
      const metadata: TodoMetadata = {
        created: new Date().toISOString(),
        description,
      };
      await writeFile(join(todoDir, 'index.json'), JSON.stringify(metadata, null, 2));

      // Create initial tasks if provided
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const taskNumber = i + 1;
        const taskFilename = `TASK-${taskNumber.toString().padStart(3, '0')}-${slugify(task.title ?? 'task', { lower: true, strict: true })}.md`;

        const taskMetadata: TaskMetadata = {
          completed: false,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        const frontmatter = yaml.dump(taskMetadata);
        const taskContent = `---\n${frontmatter}---\n\n# ${task.title}\n\n${task.content ?? ''}`;
        await writeFile(join(todoDir, taskFilename), taskContent);
      }

      // Auto-commit
      await autoCommitAsync(this.storagePath, `Create TODO #${todoNumber} in ${originalId}`);

      this.logSuccess('create_todo', { project_id, todo_number: todoNumber }, context);
      return this.formatSuccessResponse({
        todo_number: todoNumber,
        message:
          tasks.length > 0
            ? `Created TODO #${todoNumber} with ${tasks.length} initial task${tasks.length !== 1 ? 's' : ''}`
            : `Created TODO #${todoNumber}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to create TODO: ${error instanceof Error ? error.message : String(error)}`,
              { project_id: params.project_id, traceId: context.traceId }
            );
      this.logError('create_todo', params, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Add a task to an existing TODO list (async version)
   */
  async addTodoTaskAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
    title: z.infer<typeof secureTaskTitleSchema>;
    content?: z.infer<typeof secureTaskContentSchema>;
  }): Promise<string> {
    const context = this.createContext('add_todo_task', params);

    try {
      const { project_id, todo_number, title, content = '' } = params;
      const [, projectPath] = await createProjectEntryAsync(this.storagePath, project_id);
      const todoDir = join(projectPath, 'TODO', todo_number.toString());

      // Check if TODO exists
      try {
        await access(todoDir);
      } catch {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Get next task number
      const taskNumber = await this.getNextTaskNumberAsync(todoDir);
      const taskFilename = `TASK-${taskNumber.toString().padStart(3, '0')}-${slugify(title, { lower: true, strict: true })}.md`;

      // Create task metadata
      const metadata: TaskMetadata = {
        completed: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // Write task file
      const frontmatter = yaml.dump(metadata);
      const taskContent = `---\n${frontmatter}---\n\n# ${title}\n\n${content || ''}`;
      await writeFile(join(todoDir, taskFilename), taskContent);

      // Auto-commit
      await autoCommitAsync(this.storagePath, `Add task "${title}" to TODO #${todo_number}`);

      this.logSuccess(
        'add_todo_task',
        { project_id, todo_number, task_number: taskNumber },
        context
      );
      return this.formatSuccessResponse({
        task_number: taskNumber,
        message: `Added task #${taskNumber} to TODO #${todo_number}`,
      });
    } catch (error) {
      const mcpError =
        error instanceof MCPError
          ? error
          : new MCPError(
              MCPErrorCode.FILE_SYSTEM_ERROR,
              `Failed to add task: ${error instanceof Error ? error.message : String(error)}`,
              {
                project_id: params.project_id,
                todo_number: params.todo_number,
                traceId: context.traceId,
              }
            );
      this.logError('add_todo_task', params, mcpError, context);
      return this.formatErrorResponse(mcpError, context);
    }
  }

  /**
   * Remove a task from a TODO list (async version)
   */
  async removeTodoTaskAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
    task_number: z.infer<typeof secureTodoNumberSchema>;
  }): Promise<string> {
    const context = this.createContext('remove_todo_task', params);

    try {
      const { project_id, todo_number, task_number } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', todo_number.toString());

      // Check if TODO exists
      try {
        await access(todoDir);
      } catch {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Find task file
      const taskFile = await this.findTaskFileAsync(todoDir, task_number);
      if (!taskFile) {
        throw new MCPError(
          MCPErrorCode.TASK_NOT_FOUND,
          `Task #${task_number} not found in TODO #${todo_number}`,
          { project_id, todo_number, task_number, traceId: context.traceId }
        );
      }

      // Delete the task file
      await unlink(join(todoDir, taskFile));

      // Auto-commit
      await autoCommitAsync(
        this.storagePath,
        `Remove task #${task_number} from TODO #${todo_number}`
      );

      this.logSuccess('remove_todo_task', params, context);
      return this.formatSuccessResponse({
        message: `Removed task #${task_number} from TODO #${todo_number}`,
      });
    } catch (error) {
      this.logError('remove_todo_task', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Mark a task as completed (async version)
   */
  async completeTodoTaskAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
    task_number: z.infer<typeof secureTodoNumberSchema>;
  }): Promise<string> {
    const context = this.createContext('complete_todo_task', params);

    try {
      const { project_id, todo_number, task_number } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', todo_number.toString());

      // Check if TODO exists
      try {
        await access(todoDir);
      } catch {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Find task file
      const taskFile = await this.findTaskFileAsync(todoDir, task_number);
      if (!taskFile) {
        throw new MCPError(
          MCPErrorCode.TASK_NOT_FOUND,
          `Task #${task_number} not found in TODO #${todo_number}`,
          { project_id, todo_number, task_number, traceId: context.traceId }
        );
      }

      // Update task metadata
      await this.updateTaskMetadataAsync(join(todoDir, taskFile), { completed: true });

      // Auto-commit
      await autoCommitAsync(
        this.storagePath,
        `Complete task #${task_number} in TODO #${todo_number}`
      );

      this.logSuccess('complete_todo_task', params, context);
      return this.formatSuccessResponse({
        message: `Marked task #${task_number} as completed in TODO #${todo_number}`,
      });
    } catch (error) {
      this.logError('complete_todo_task', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Get the next incomplete task from a TODO list (async version)
   */
  async getNextTodoTaskAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
  }): Promise<string> {
    const context = this.createContext('get_next_todo_task', params);

    try {
      const { project_id, todo_number } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', todo_number.toString());

      // Check if TODO exists
      try {
        await access(todoDir);
      } catch {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Find all task files
      const taskFiles = await this.getTaskFilesAsync(todoDir);

      // Look for first incomplete task
      for (const taskFile of taskFiles) {
        const taskPath = join(todoDir, taskFile);
        const content = await readFile(taskPath, 'utf8');
        const parsed = fm<TaskMetadata>(content);

        if (!parsed.attributes.completed) {
          const taskNumber = this.extractTaskNumber(taskFile);
          const taskData = await this.parseTaskDataAsync(taskPath);

          this.logSuccess(
            'get_next_todo_task',
            { project_id, todo_number, task_number: taskNumber },
            context
          );
          return this.formatSuccessResponse({
            task: {
              number: taskNumber,
              description: taskData.title,
            },
          });
        }
      }

      // No incomplete tasks
      this.logSuccess('get_next_todo_task', { project_id, todo_number, found: false }, context);
      return this.formatSuccessResponse({
        message: 'All tasks completed',
      });
    } catch (error) {
      this.logError('get_next_todo_task', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Get all tasks from a TODO list with their status (async version)
   */
  async getTodoTasksAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
  }): Promise<string> {
    const context = this.createContext('get_todo_tasks', params);

    try {
      const { project_id, todo_number } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', todo_number.toString());

      // Check if TODO exists
      try {
        await access(todoDir);
      } catch {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Read TODO metadata
      const indexPath = join(todoDir, 'index.json');
      const indexContent = await readFile(indexPath, 'utf8');
      const todoMetadata = JSON.parse(indexContent) as TodoMetadata;

      // Get all tasks
      const taskFiles = await this.getTaskFilesAsync(todoDir);
      const tasks: TaskInfo[] = [];

      for (const taskFile of taskFiles) {
        const taskPath = join(todoDir, taskFile);
        const taskData = await this.parseTaskDataAsync(taskPath);
        const taskNumber = this.extractTaskNumber(taskFile);

        tasks.push({
          number: taskNumber,
          description: taskData.title,
          completed: taskData.metadata.completed,
        });
      }

      // Sort by task number
      tasks.sort((a, b) => a.number - b.number);

      const completedCount = tasks.filter((t) => t.completed).length;

      this.logSuccess(
        'get_todo_tasks',
        { project_id, todo_number, task_count: tasks.length },
        context
      );
      return this.formatSuccessResponse({
        todo: {
          number: todo_number,
          description: todoMetadata.description,
          created: todoMetadata.created,
          completed: tasks.length > 0 && completedCount === tasks.length,
          task_count: tasks.length,
          completed_count: completedCount,
        },
        tasks,
      });
    } catch (error) {
      this.logError('get_todo_tasks', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Delete an entire TODO list (async version)
   */
  async deleteTodoAsync(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    todo_number: z.infer<typeof secureTodoNumberSchema>;
  }): Promise<string> {
    const context = this.createContext('delete_todo', params);

    try {
      const { project_id, todo_number } = params;
      const projectInfo = await getProjectDirectoryAsync(this.storagePath, project_id);

      if (!projectInfo) {
        throw new MCPError(MCPErrorCode.PROJECT_NOT_FOUND, `Project ${project_id} not found`, {
          project_id,
          traceId: context.traceId,
        });
      }

      const [originalId, projectPath] = projectInfo;
      const todoDir = join(projectPath, 'TODO', todo_number.toString());

      // Check if TODO exists
      try {
        await access(todoDir);
      } catch {
        throw new MCPError(MCPErrorCode.TODO_NOT_FOUND, `TODO #${todo_number} not found`, {
          project_id,
          todo_number,
          traceId: context.traceId,
        });
      }

      // Delete the entire TODO directory
      await rm(todoDir, { recursive: true, force: true });

      // Auto-commit
      await autoCommitAsync(this.storagePath, `Delete TODO #${todo_number} from ${originalId}`);

      this.logSuccess('delete_todo', params, context);
      return this.formatSuccessResponse({
        message: `Deleted TODO #${todo_number}`,
      });
    } catch (error) {
      this.logError('delete_todo', params, error as MCPError, context);
      return this.formatErrorResponse(error, context);
    }
  }

  // Async helper methods

  private async getNextTodoNumberAsync(todoPath: string): Promise<number> {
    try {
      await access(todoPath);
    } catch {
      return 1;
    }

    const entries = await readdir(todoPath, { withFileTypes: true });
    const todoNumbers = entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => parseInt(entry.name))
      .sort((a, b) => b - a);

    return todoNumbers.length > 0 ? todoNumbers[0] + 1 : 1;
  }

  private async getNextTaskNumberAsync(todoDir: string): Promise<number> {
    const taskFiles = await this.getTaskFilesAsync(todoDir);

    const taskNumbers = taskFiles
      .map((file) => this.extractTaskNumber(file))
      .filter((n) => n > 0)
      .sort((a, b) => b - a);

    return taskNumbers.length > 0 ? taskNumbers[0] + 1 : 1;
  }

  private async findTaskFileAsync(todoDir: string, taskNumber: number): Promise<string | null> {
    const taskFiles = await this.getTaskFilesAsync(todoDir);

    for (const file of taskFiles) {
      const fileTaskNumber = this.extractTaskNumber(file);
      if (fileTaskNumber === taskNumber) {
        return file;
      }
    }

    return null;
  }

  private async parseTaskDataAsync(taskPath: string): Promise<TaskData> {
    const content = await readFile(taskPath, 'utf8');
    const parsed = fm<TaskMetadata>(content);

    // Extract title from first # header (same as sync version)
    const lines = parsed.body.split('\n');
    const titleLine = lines.find((line) => line.startsWith('# '));
    const title = titleLine ? titleLine.substring(2).trim() : 'Untitled Task';

    return {
      title,
      content: parsed.body,
      metadata: parsed.attributes,
    };
  }

  private async updateTaskMetadataAsync(
    filepath: string,
    updates: Partial<TaskMetadata>
  ): Promise<void> {
    const content = await readFile(filepath, 'utf8');
    const parsed = fm<TaskMetadata>(content);

    // Update metadata
    const updatedMetadata: TaskMetadata = {
      ...parsed.attributes,
      ...updates,
      updated: new Date().toISOString(),
    };

    // Write back with updated metadata
    const frontmatter = yaml.dump(updatedMetadata);
    const updatedContent = `---\n${frontmatter}---\n${parsed.body}`;
    await writeFile(filepath, updatedContent);
  }

  private async getTaskFilesAsync(todoDir: string): Promise<string[]> {
    const files = await readdir(todoDir);
    return files.filter((file) => file.startsWith('TASK-') && file.endsWith('.md')).sort();
  }
}
