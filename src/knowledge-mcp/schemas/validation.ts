import { z } from 'zod';

// Enhanced security validation schemas
export const secureProjectIdSchema = z
  .string()
  .min(1, 'Project ID cannot be empty')
  .max(100, 'Project ID too long')
  .refine(
    (val) => !val.includes('..') && !val.startsWith('.') && !val.endsWith('.'),
    'Project ID cannot contain path traversal patterns'
  )
  .refine(
    (val) => !/[/\\:*?"<>|\0]/.test(val),
    'Project ID cannot contain filesystem reserved characters or null bytes'
  )
  .refine((val) => val.trim() === val, 'Project ID cannot have leading/trailing spaces');

export const secureFilenameSchema = z
  .string()
  .min(1, 'Filename cannot be empty')
  .max(255, 'Filename too long')
  .refine(
    (val) => !val.includes('/') && !val.includes('\\') && !val.includes('\0'),
    'Filename contains invalid path characters'
  )
  .refine(
    (val) => !val.includes('..') && val.trim() === val,
    'Filename cannot contain path traversal or leading/trailing spaces'
  );

export const secureContentSchema = z
  .string()
  .max(10 * 1024 * 1024, 'Content too large (max 10MB)')
  .refine((val) => !val.includes('\0'), 'Content cannot contain null bytes');

export const secureSectionHeaderSchema = z
  .string()
  .min(1, 'Section header cannot be empty')
  .max(200, 'Section header too long')
  .regex(/^##\s+/, 'Section header must start with "## "')
  .refine(
    (val) => !val.includes('\0') && val.trim() === val,
    'Section header contains invalid characters'
  );

export const secureKeywordSchema = z
  .string()
  .min(1, 'Keyword cannot be empty')
  .max(50, 'Keyword too long')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Keyword contains invalid characters');

export const secureSearchQuerySchema = z
  .string()
  .min(1, 'Search query cannot be empty')
  .max(200, 'Search query too long')
  .refine((val) => val.split(/\s+/).length <= 20, 'Search query contains too many terms');

export const secureChapterTitleSchema = z
  .string()
  .min(1, 'Chapter title cannot be empty')
  .max(200, 'Chapter title too long')
  .refine(
    (val) => !val.includes('\0') && val.trim() === val,
    'Chapter title contains invalid characters'
  );

export const secureChapterContentSchema = z
  .string()
  .min(1, 'Chapter content cannot be empty')
  .max(1 * 1024 * 1024, 'Chapter content too large (max 1MB)')
  .refine((val) => !val.includes('\0'), 'Chapter content cannot contain null bytes');

export const secureTitleSchema = z
  .string()
  .min(1, 'Title cannot be empty')
  .max(200, 'Title too long (max 200 characters)')
  .refine((val) => !val.includes('\0'), 'Title cannot contain null bytes')
  .refine((val) => val.trim() === val, 'Title cannot have leading/trailing spaces');

export const secureIntroductionSchema = z
  .string()
  .min(1, 'Introduction cannot be empty')
  .max(2000, 'Introduction too long (max 2000 characters)')
  .refine((val) => !val.includes('\0'), 'Introduction cannot contain null bytes');

export const secureChapterSummarySchema = z
  .string()
  .max(500, 'Chapter summary too long (max 500 characters)')
  .refine((val) => !val.includes('\0'), 'Chapter summary cannot contain null bytes');

// TODO Management schemas
export const secureTodoNumberSchema = z
  .number()
  .int('TODO number must be an integer')
  .positive('TODO number must be positive')
  .max(99999, 'TODO number too large');

export const secureTodoDescriptionSchema = z
  .string()
  .min(1, 'TODO description cannot be empty')
  .max(500, 'TODO description too long (max 500 characters)')
  .refine((val) => !val.includes('\0'), 'TODO description cannot contain null bytes')
  .refine((val) => val.trim() === val, 'TODO description cannot have leading/trailing spaces');

export const secureTaskDescriptionSchema = z
  .string()
  .min(1, 'Task description cannot be empty')
  .max(500, 'Task description too long (max 500 characters)')
  .refine((val) => !val.includes('\0'), 'Task description cannot contain null bytes')
  .refine((val) => val.trim() === val, 'Task description cannot have leading/trailing spaces');
