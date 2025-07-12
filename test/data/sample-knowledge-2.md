# Knowledge MCP Interface Test Plan

## Test Overview

This language-agnostic test plan validates all MCP tools and resources through their interface, ensuring functionality without code inspection. These tests can be run against any implementation (Python, TypeScript, etc.) to verify API compatibility.

## 1. Project Management Tests

### Test 1.1: Create New Project

- **Tool**: `update_project_main`
- **Test**: Create a new project "test-project-1"
- **Input**:
  - project_id: "test-project-1"
  - content: "# Test Project 1\n\nThis is a test project for MCP validation."
- **Expected**: Success response, project created

### Test 1.2: Retrieve Project Instructions

- **Tool**: `get_project_main`
- **Test**: Retrieve the project created in 1.1
- **Input**: project_id: "test-project-1"
- **Expected**: exists=true, content matches what was created

### Test 1.3: Update Existing Project

- **Tool**: `update_project_main`
- **Test**: Update the existing project
- **Input**:
  - project_id: "test-project-1"
  - content: "# Test Project 1 - Updated\n\nThis project has been updated."
- **Expected**: Success response

### Test 1.4: Non-existent Project

- **Tool**: `get_project_main`
- **Test**: Try to retrieve non-existent project
- **Input**: project_id: "non-existent-project"
- **Expected**: exists=false, empty content

## 2. Knowledge Document Tests

### Test 2.1: Create Knowledge Document

- **Tool**: `create_knowledge_file`
- **Test**: Create a new knowledge document
- **Input**:
  - project_id: "test-project-1"
  - filename: "api-guide"
  - title: "API Documentation Guide"
  - introduction: "This guide covers our API endpoints."
  - keywords: ["api", "documentation", "rest"]
  - chapters: [
    {"title": "Getting Started", "content": "To begin using our API..."},
    {"title": "Authentication", "content": "API keys are required..."}
    ]
- **Expected**: Success, filepath returned

### Test 2.2: Create Document with Special Characters

- **Tool**: `create_knowledge_file`
- **Test**: Filename with spaces and special chars
- **Input**:
  - project_id: "test-project-1"
  - filename: "User's Guide & FAQ"
  - title: "User Guide and FAQ"
  - introduction: "Common questions answered."
  - keywords: ["faq", "help"]
  - chapters: [{"title": "FAQ", "content": "Q: How do I..."}]
- **Expected**: Success, filename slugified to "users-guide-faq.md"

### Test 2.3: Missing Required Fields

- **Tool**: `create_knowledge_file`
- **Test**: Try without keywords
- **Input**:
  - project_id: "test-project-1"
  - filename: "test-doc"
  - title: "Test"
  - introduction: "Test"
  - keywords: []
  - chapters: [{"title": "Test", "content": "Test"}]
- **Expected**: Error about missing keywords

## 3. Search Tests

### Test 3.1: Single Keyword Search

- **Tool**: `search_knowledge`
- **Test**: Search for "api"
- **Input**:
  - project_id: "test-project-1"
  - query: "api"
- **Expected**: Results containing api-guide.md

### Test 3.2: Multiple Keywords

- **Tool**: `search_knowledge`
- **Test**: Search for multiple terms
- **Input**:
  - project_id: "test-project-1"
  - query: "authentication keys"
- **Expected**: Results with matching chapters

### Test 3.3: Case Insensitive Search

- **Tool**: `search_knowledge`
- **Test**: Search with different case
- **Input**:
  - project_id: "test-project-1"
  - query: "API"
- **Expected**: Same results as lowercase search

### Test 3.4: No Results

- **Tool**: `search_knowledge`
- **Test**: Search for non-existent term
- **Input**:
  - project_id: "test-project-1"
  - query: "nonexistentterm"
- **Expected**: Empty results array

## 4. Chapter Update Tests

### Test 4.1: Update Existing Chapter

- **Tool**: `update_chapter`
- **Test**: Update "Authentication" chapter
- **Input**:
  - project_id: "test-project-1"
  - filename: "api-guide.md"
  - chapter_title: "Authentication"
  - new_content: "Updated: Use OAuth 2.0 for authentication..."
- **Expected**: Success message

### Test 4.2: Non-existent Chapter

- **Tool**: `update_chapter`
- **Test**: Try to update non-existent chapter
- **Input**:
  - project_id: "test-project-1"
  - filename: "api-guide.md"
  - chapter_title: "Non-existent Chapter"
  - new_content: "This should fail"
- **Expected**: Error about chapter not found

### Test 4.3: Case Sensitive Title Match

- **Tool**: `update_chapter`
- **Test**: Wrong case in title
- **Input**:
  - project_id: "test-project-1"
  - filename: "api-guide.md"
  - chapter_title: "authentication" (lowercase)
  - new_content: "This should fail"
- **Expected**: Error about chapter not found

## 5. File Deletion Tests

### Test 5.1: Delete Existing File

- **Tool**: `delete_knowledge_file`
- **Test**: Delete the FAQ document
- **Input**:
  - project_id: "test-project-1"
  - filename: "users-guide-faq.md"
- **Expected**: Success message

### Test 5.2: Delete Non-existent File

- **Tool**: `delete_knowledge_file`
- **Test**: Try to delete already deleted file
- **Input**:
  - project_id: "test-project-1"
  - filename: "users-guide-faq.md"
- **Expected**: Error about file not found

## 6. Resource Endpoint Tests

### Test 6.1: List Files Resource

- **Resource**: `knowledge://projects/{project_id}/files`
- **Test**: List all files in project
- **Input**: project_id: "test-project-1"
- **Expected**: List containing api-guide.md with metadata

### Test 6.2: List Chapters Resource

- **Resource**: `knowledge://projects/{project_id}/chapters/{filename}`
- **Test**: List chapters in api-guide.md
- **Input**:
  - project_id: "test-project-1"
  - filename: "api-guide.md"
- **Expected**: List with "Getting Started" and "Authentication" chapters

### Test 6.3: Main Resource

- **Resource**: `knowledge://projects/{project_id}/main`
- **Test**: Read main.md via resource
- **Input**: project_id: "test-project-1"
- **Expected**: Content of main.md

## 7. Edge Case Tests

### Test 7.1: Unicode Project Name

- **Tool**: `update_project_main`
- **Test**: Project with unicode name
- **Input**:
  - project_id: "测试项目"
  - content: "# Chinese Project\n\nUnicode test"
- **Expected**: Success

### Test 7.2: Very Long Content

- **Tool**: `create_knowledge_file`
- **Test**: Document with long content
- **Input**: Create document with 1000+ line content
- **Expected**: Success

### Test 7.3: Empty Search

- **Tool**: `search_knowledge`
- **Test**: Empty search query
- **Input**:
  - project_id: "test-project-1"
  - query: ""
- **Expected**: Empty results or error

## Test Execution Order

1. **Setup Phase**: Create test projects (1.1)
2. **Document Creation**: Create various documents (2.1-2.3)
3. **Read Operations**: Test retrieval and listing (1.2, 6.1-6.3)
4. **Search Operations**: Test search functionality (3.1-3.4)
5. **Update Operations**: Test modifications (1.3, 4.1-4.3)
6. **Cleanup Phase**: Delete test documents (5.1-5.2)
7. **Edge Cases**: Test special scenarios (7.1-7.3)

## Success Criteria

- All basic CRUD operations work correctly
- Search returns accurate results
- Error messages are clear and helpful
- Unicode and special characters handled properly
- Resources provide read-only access as expected
- No data corruption or unexpected behavior

## Implementation Notes

### TypeScript Test Runner

The TypeScript implementation includes an automated test runner at `test/interface-test.ts` that executes all these tests:

```bash
pnpm run build
pnpm run test:interface
```

### Python Test Execution

For Python implementations, these tests can be executed using the MCP Inspector or a similar test client.

### Key Observations

1. **Filename Slugification**: Different implementations may handle special characters differently (e.g., "&" → "and" vs removal)
2. **Error Response Format**: Implementations may format errors differently while maintaining the same error conditions
3. **Resource Output**: All implementations should return the same data structure for resources

## Conclusion

This test plan validates all MCP interface methods without requiring code access, ensuring the server functions correctly from a user perspective across any implementation language.
