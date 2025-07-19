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

// Task title for brief identification (used in filenames)
export const secureTaskTitleSchema = z
  .string()
  .min(1, 'Task title cannot be empty')
  .max(200, 'Task title too long (max 200 characters)')
  .refine((val) => !val.includes('\0'), 'Task title cannot contain null bytes')
  .refine((val) => val.trim() === val, 'Task title cannot have leading/trailing spaces');

// Full markdown content for task details
export const secureTaskContentSchema = z
  .string()
  .max(100 * 1024, 'Task content too large (max 100KB)')
  .refine((val) => !val.includes('\0'), 'Task content cannot contain null bytes')
  .optional();

// Task input schema for new markdown-based tasks
export const taskInputSchema = z.object({
  title: secureTaskTitleSchema,
  content: secureTaskContentSchema,
});

// Position schemas for add operations
export const sectionPositionSchema = z
  .enum(['before', 'after', 'end'])
  .describe('Where to insert the new section: before/after a reference section, or at end');

export const referenceHeaderSchema = z
  .string()
  .min(1, 'Reference header cannot be empty')
  .max(200, 'Reference header too long')
  .regex(/^##\s+/, 'Reference header must start with "## "')
  .optional()
  .describe('The section header to use as reference point for before/after positioning');

// Chapter index schema for accessing chapters by position
export const chapterIndexSchema = z
  .number()
  .int('Chapter index must be an integer')
  .min(0, 'Chapter index cannot be negative')
  .describe('Zero-based index of the chapter in the document');

// Chapter identifier schema - can be either title (string) or index (number)
export const chapterIdentifierSchema = z
  .union([
    z.object({
      chapter_title: secureChapterTitleSchema,
    }),
    z.object({
      chapter_index: chapterIndexSchema,
    }),
  ])
  .describe('Identify chapter by either title or index');
