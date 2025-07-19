import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  rmSync,
} from 'fs';
import { join } from 'path';

import slugify from 'slugify';
import type { z } from 'zod';

import { MCPError, MCPErrorCode } from '../errors/index.js';
import type {
  secureProjectIdSchema,
  secureTodoNumberSchema,
  secureTodoDescriptionSchema,
  secureTaskDescriptionSchema,
} from '../schemas/validation.js';
import { getProjectDirectory, createProjectEntry, autoCommit } from '../utils.js';

import { BaseHandler } from './BaseHandler.js';

interface TodoMetadata {
  created: string;
  description: string;
}

interface TaskData {
  description: string;
  completed: boolean;
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
            const taskFiles = readdirSync(todoDir).filter(
              (file) => file.startsWith('TASK-') && file.endsWith('.json')
            );

            let completedCount = 0;
            for (const taskFile of taskFiles) {
              const taskData = JSON.parse(
                readFileSync(join(todoDir, taskFile), 'utf8')
              ) as TaskData;
              if (taskData.completed) {
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
   * Create a new TODO list
   */
  createTodo(params: {
    project_id: z.infer<typeof secureProjectIdSchema>;
    description: z.infer<typeof secureTodoDescriptionSchema>;
    tasks?: z.infer<typeof secureTaskDescriptionSchema>[];
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
          const taskFilename = this.generateTaskFilename(taskNumber, tasks[i]);
          const taskData: TaskData = {
            description: tasks[i],
            completed: false,
          };
          writeFileSync(join(todoDir, taskFilename), JSON.stringify(taskData, null, 2));
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
    description: z.infer<typeof secureTaskDescriptionSchema>;
  }): string {
    const context = this.createContext('add_todo_task', params);

    try {
      const { project_id, todo_number, description } = params;
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
      const taskFilename = this.generateTaskFilename(taskNumber, description);

      // Create task file
      const taskData: TaskData = {
        description,
        completed: false,
      };
      writeFileSync(join(todoDir, taskFilename), JSON.stringify(taskData, null, 2));

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

      // Update task
      const taskPath = join(todoDir, taskFile);
      const taskData = JSON.parse(readFileSync(taskPath, 'utf8')) as TaskData;
      taskData.completed = true;
      writeFileSync(taskPath, JSON.stringify(taskData, null, 2));

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
      const taskFiles = readdirSync(todoDir)
        .filter((file) => file.startsWith('TASK-') && file.endsWith('.json'))
        .sort();

      // Find first incomplete task
      for (const taskFile of taskFiles) {
        const taskData = JSON.parse(readFileSync(join(todoDir, taskFile), 'utf8')) as TaskData;
        if (!taskData.completed) {
          const taskNumber = this.extractTaskNumber(taskFile);
          this.logSuccess('get_next_todo_task', params, context);
          return this.formatSuccessResponse({
            task: {
              number: taskNumber,
              description: taskData.description,
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
      const taskFiles = readdirSync(todoDir)
        .filter((file) => file.startsWith('TASK-') && file.endsWith('.json'))
        .sort();

      const tasks: TaskInfo[] = [];
      for (const taskFile of taskFiles) {
        const taskData = JSON.parse(readFileSync(join(todoDir, taskFile), 'utf8')) as TaskData;
        const taskNumber = this.extractTaskNumber(taskFile);
        tasks.push({
          number: taskNumber,
          description: taskData.description,
          completed: taskData.completed,
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
    const taskFiles = readdirSync(todoDir).filter(
      (file) => file.startsWith('TASK-') && file.endsWith('.json')
    );

    const taskNumbers = taskFiles
      .map((file) => this.extractTaskNumber(file))
      .filter((num) => num > 0)
      .sort((a, b) => b - a);

    return taskNumbers.length > 0 ? taskNumbers[0] + 1 : 1;
  }

  private generateTaskFilename(taskNumber: number, description: string): string {
    const paddedNumber = String(taskNumber).padStart(3, '0');
    const slug = slugify(description, { lower: true, strict: true }).substring(0, 50);
    return `TASK-${paddedNumber}-${slug}.json`;
  }

  private findTaskFile(todoDir: string, taskNumber: number): string | null {
    const paddedNumber = String(taskNumber).padStart(3, '0');
    const prefix = `TASK-${paddedNumber}-`;

    const files = readdirSync(todoDir);
    return files.find((file) => file.startsWith(prefix) && file.endsWith('.json')) ?? null;
  }

  private extractTaskNumber(filename: string): number {
    const match = filename.match(/^TASK-(\d{3})-.*\.json$/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
