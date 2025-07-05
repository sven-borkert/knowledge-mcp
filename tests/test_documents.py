#!/usr/bin/env python3
"""
Test suite for documents.py - document operations
"""

import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest

from knowledge_mcp.documents import (
    parse_chapters,
    parse_document,
    search_documents,
    write_document,
)


class TestFrontmatterParsing:
    """Test frontmatter parsing functions."""

    def test_parse_valid_document(self):
        """Test parsing a valid document with frontmatter."""

        content = """---
title: Test Document
keywords: [test, documentation]
updated: 2024-01-01T12:00:00Z
---

This is the document content.

## Chapter 1

Chapter content here."""

        metadata, body = parse_document(content)

        assert metadata["title"] == "Test Document"
        assert metadata["keywords"] == ["test", "documentation"]
        # Frontmatter parses ISO dates to datetime objects
        assert metadata["updated"] == datetime(
            2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc
        )
        assert body.strip().startswith("This is the document content.")
        assert "## Chapter 1" in body

    def test_parse_document_no_frontmatter(self):
        """Test parsing document without frontmatter."""

        content = """# Just Markdown

No frontmatter here."""

        metadata, body = parse_document(content)

        assert metadata == {}
        assert body.strip() == content.strip()

    def test_parse_document_empty_frontmatter(self):
        """Test parsing document with empty frontmatter."""

        content = """---
---

Content here."""

        metadata, body = parse_document(content)

        assert metadata == {}
        assert body.strip() == "Content here."

    def test_parse_document_malformed_yaml(self):
        """Test parsing document with malformed YAML."""

        content = """---
title: Missing Quote
keywords: [test, "unclosed
---

Content."""

        with pytest.raises(ValueError, match="Invalid YAML"):
            parse_document(content)

    def test_parse_document_code_injection(self):
        """Test that YAML code injection is prevented."""

        content = """---
!!python/object/apply:os.system ['echo hacked']
---

Content."""

        with pytest.raises(ValueError, match="Invalid YAML"):
            parse_document(content)


class TestChapterParsing:
    """Test chapter parsing functions."""

    def test_parse_chapters_basic(self):
        """Test basic chapter parsing."""

        content = """# Document Title

Introduction paragraph.

## Chapter 1
Summary of chapter 1
with multiple lines.

Chapter 1 content here.

## Chapter 2
Summary of chapter 2.

Chapter 2 content."""

        chapters = parse_chapters(content)

        assert len(chapters) == 2
        assert chapters[0]["title"] == "Chapter 1"
        assert chapters[0]["summary"] == "Summary of chapter 1 with multiple lines."
        assert "Chapter 1 content here." in chapters[0]["content"]

        assert chapters[1]["title"] == "Chapter 2"
        assert chapters[1]["summary"] == "Summary of chapter 2."

    def test_parse_chapters_nested_headers(self):
        """Test parsing with nested headers."""

        content = """## Main Chapter
Main summary.

Main content.

### Subsection
Subsection content.

## Another Chapter
Another summary.

More content."""

        chapters = parse_chapters(content)

        # Should capture all headers
        assert len(chapters) >= 2
        assert any(ch["title"] == "Main Chapter" for ch in chapters)
        assert any(ch["title"] == "Another Chapter" for ch in chapters)

    def test_parse_chapters_no_summary(self):
        """Test parsing chapters without summaries."""

        content = """## Chapter Without Summary

Content starts immediately."""

        chapters = parse_chapters(content)

        assert len(chapters) == 1
        assert chapters[0]["title"] == "Chapter Without Summary"
        assert chapters[0]["summary"] == "Content starts immediately."

    def test_parse_chapters_empty_content(self):
        """Test parsing empty content."""

        chapters = parse_chapters("")
        assert chapters == []

    def test_parse_chapters_no_headers(self):
        """Test parsing content without headers."""

        content = """Just text without any headers.
More text here."""

        chapters = parse_chapters(content)
        assert chapters == []


class TestDocumentWriting:
    """Test document writing functions."""

    def test_write_document_basic(self):
        """Test basic document writing."""

        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "test.md"

            metadata = {
                "title": "Test Document",
                "keywords": ["test"],
                "updated": "2024-01-01",
            }
            content = "Test content"

            write_document(file_path, metadata, content)

            assert file_path.exists()

            # Read and verify
            with open(file_path, "r") as f:
                written = f.read()

            assert "title: Test Document" in written
            assert "Test content" in written

    def test_write_document_atomic(self):
        """Test atomic writing (temp file + rename)."""

        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "test.md"

            # Write initial content
            file_path.write_text("Initial content")

            metadata = {"title": "Updated"}
            content = "New content"

            # This should atomically replace
            write_document(file_path, metadata, content)

            # Verify update
            with open(file_path, "r") as f:
                written = f.read()

            assert "Initial content" not in written
            assert "New content" in written

    def test_write_document_missing_directory(self):
        """Test writing to non-existent directory."""

        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "subdir" / "test.md"

            metadata = {"title": "Test"}
            content = "Content"

            # Should create directory
            write_document(file_path, metadata, content)

            assert file_path.exists()
            assert file_path.parent.is_dir()

    def test_write_document_validation(self):
        """Test metadata validation."""

        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "test.md"

            # Missing required fields
            metadata = {}
            content = "Content"

            with pytest.raises(ValueError, match="Missing required"):
                write_document(file_path, metadata, content)


class TestDocumentSearch:
    """Test document search functionality."""

    def test_search_basic(self):
        """Test basic search functionality."""

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir)
            knowledge_dir = project_path / "knowledge"
            knowledge_dir.mkdir()

            # Create test documents
            doc1 = knowledge_dir / "doc1.md"
            doc1.write_text(
                """---
title: Document 1
keywords: [api, testing]
---

This document contains information about the API.

## API Methods
Details about various API methods."""
            )

            doc2 = knowledge_dir / "doc2.md"
            doc2.write_text(
                """---
title: Document 2
keywords: [testing, guide]
---

This is a testing guide.

## Testing Procedures
How to test the API properly."""
            )

            # Search for "API"
            results = search_documents(project_path, "API")

            assert len(results) == 2  # Should find both docs

            # Find doc1 in results
            doc1_result = next((r for r in results if r["file"] == "doc1.md"), None)
            assert doc1_result is not None
            assert doc1_result["match_count"] == 2  # Body + API Methods chapter
            assert len(doc1_result["matching_chapters"]) == 2

            # Check for API Methods chapter
            api_methods_chapter = next(
                (
                    ch
                    for ch in doc1_result["matching_chapters"]
                    if ch["chapter"] == "API Methods"
                ),
                None,
            )
            assert api_methods_chapter is not None
            assert "api" in api_methods_chapter["keywords_found"]
            assert "api" in api_methods_chapter["match_context"]
            assert isinstance(api_methods_chapter["match_context"]["api"], list)

            # Check doc2
            doc2_result = next((r for r in results if r["file"] == "doc2.md"), None)
            assert doc2_result is not None
            assert doc2_result["match_count"] == 1  # Testing Procedures chapter

            # Check metadata is included
            assert "metadata" in doc1_result
            assert doc1_result["metadata"]["title"] == "Document 1"

    def test_search_case_insensitive(self):
        """Test case-insensitive search."""

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir)
            knowledge_dir = project_path / "knowledge"
            knowledge_dir.mkdir()

            doc = knowledge_dir / "test.md"
            doc.write_text(
                """---
title: Test
---

Contains API, api, and Api."""
            )

            # Search with different cases
            for query in ["API", "api", "Api"]:
                results = search_documents(project_path, query)
                assert len(results) > 0

    def test_search_deduplication(self):
        """Test result deduplication."""

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir)
            knowledge_dir = project_path / "knowledge"
            knowledge_dir.mkdir()

            doc = knowledge_dir / "test.md"
            doc.write_text(
                """---
title: Test
keywords: [test, test, test]
---

Test test test.

## Test Chapter
Test content test."""
            )

            results = search_documents(project_path, "test")

            # Should return one document
            assert len(results) == 1

            result = results[0]
            assert result["file"] == "test.md"
            assert result["match_count"] == 2  # Body + Test Chapter

            # Check that chapters are deduplicated
            chapter_titles = [ch["chapter"] for ch in result["matching_chapters"]]
            assert len(chapter_titles) == len(
                set(chapter_titles)
            ), "Duplicate chapters found"

            # Each chapter should have test keyword and contexts
            for chapter in result["matching_chapters"]:
                assert "test" in chapter["keywords_found"]
                assert "test" in chapter["match_context"]
                assert len(chapter["match_context"]["test"]) > 0

    def test_search_empty_query(self):
        """Test search with empty query."""

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir)

            results = search_documents(project_path, "")
            assert results == []

    def test_search_no_matches(self):
        """Test search with no matches."""

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir)
            knowledge_dir = project_path / "knowledge"
            knowledge_dir.mkdir()

            doc = knowledge_dir / "test.md"
            doc.write_text(
                """---
title: Test
---

Nothing here."""
            )

            results = search_documents(project_path, "nonexistent")
            assert results == []

    def test_search_chapter_level(self):
        """Test chapter-level search results."""

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir)
            knowledge_dir = project_path / "knowledge"
            knowledge_dir.mkdir()

            doc = knowledge_dir / "test.md"
            doc.write_text(
                """---
title: Test
---

General content.

## API Documentation
This chapter is about API.

## Other Chapter
This chapter is about something else."""
            )

            results = search_documents(project_path, "API")

            # Should find one document
            assert len(results) == 1

            result = results[0]
            assert result["file"] == "test.md"
            assert result["match_count"] == 1  # Only API Documentation chapter

            # Should find chapter-specific result
            api_chapter = next(
                (
                    ch
                    for ch in result["matching_chapters"]
                    if ch["chapter"] == "API Documentation"
                ),
                None,
            )
            assert api_chapter is not None
            assert "api" in api_chapter["keywords_found"]

    def test_search_multiple_keywords(self):
        """Test search with multiple keywords."""

        with tempfile.TemporaryDirectory() as temp_dir:
            project_path = Path(temp_dir)
            knowledge_dir = project_path / "knowledge"
            knowledge_dir.mkdir()

            doc = knowledge_dir / "test.md"
            doc.write_text(
                """---
title: Security Storage Test
keywords: [security, storage, test]
---

General content about various topics.

## Security Features
This chapter covers security aspects including authentication.

## Storage Architecture  
This chapter discusses storage systems and databases.

## Combined Topics
Both security and storage are important."""
            )

            # Search for multiple keywords
            results = search_documents(project_path, "security storage")

            # Should find one document with multiple matching chapters
            assert len(results) == 1

            result = results[0]
            assert result["file"] == "test.md"
            assert result["match_count"] == 3  # Three chapters match

            # Check each chapter
            security_found = False
            storage_found = False
            combined_found = False

            for chapter in result["matching_chapters"]:
                assert "keywords_found" in chapter
                assert "match_context" in chapter
                assert isinstance(chapter["match_context"], dict)

                if chapter["chapter"] == "Security Features":
                    security_found = True
                    assert "security" in chapter["keywords_found"]
                    assert "security" in chapter["match_context"]

                if chapter["chapter"] == "Storage Architecture":
                    storage_found = True
                    assert "storage" in chapter["keywords_found"]
                    assert "storage" in chapter["match_context"]

                if chapter["chapter"] == "Combined Topics":
                    combined_found = True
                    # This chapter should have both keywords
                    assert "security" in chapter["keywords_found"]
                    assert "storage" in chapter["keywords_found"]
                    assert "security" in chapter["match_context"]
                    assert "storage" in chapter["match_context"]

            assert security_found, "Security Features chapter not found"
            assert storage_found, "Storage Architecture chapter not found"
            assert combined_found, "Combined Topics chapter not found"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
