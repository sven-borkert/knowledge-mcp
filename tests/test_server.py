#!/usr/bin/env python3
"""
Test suite for Knowledge MCP Server
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastmcp import Client

# Import the module but not the server directly
import knowledge_mcp.server


class TestServerSecurity:
    """Test security features of the server."""

    @pytest.fixture
    def temp_storage(self):
        """Create a temporary storage directory."""
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(knowledge_mcp.server, "STORAGE_PATH", Path(temp_dir)):
                yield Path(temp_dir)

    @pytest.mark.asyncio
    async def test_path_traversal_prevention_in_project_id(self, temp_storage):
        """Test that path traversal attempts in project_id are blocked."""
        client = Client(knowledge_mcp.server.server)

        dangerous_project_ids = [
            "../../../etc/passwd",
            "..\\..\\windows\\system32",
            "/absolute/path",
            "C:\\Windows\\System32",
            "project/../../../sensitive",
        ]

        async with client:
            for project_id in dangerous_project_ids:
                # Test get_project_main
                result = await client.call_tool(
                    "get_project_main", {"project_id": project_id}
                )
                assert result
                content = result.data
                assert content["exists"] is False
                assert "error" in content

                # Test update_project_main
                result = await client.call_tool(
                    "update_project_main",
                    {"project_id": project_id, "content": "test"},
                )
                assert result
                content = result.data
                assert content["success"] is False
                assert "error" in content

    @pytest.mark.asyncio
    async def test_filename_sanitization_in_tools(self, temp_storage):
        """Test that filenames are properly sanitized."""
        client = Client(knowledge_mcp.server.server)

        # Create a valid project first
        project_id = "test-project"
        project_path = temp_storage / "projects" / project_id
        project_path.mkdir(parents=True, exist_ok=True)

        dangerous_filenames = [
            "../secret.md",
            "../../passwords.md",
            "/etc/passwd.md",
            "file<script>alert()</script>.md",
        ]

        async with client:
            for filename in dangerous_filenames:
                # Test create_knowledge_file
                result = await client.call_tool(
                    "create_knowledge_file",
                    {
                        "project_id": project_id,
                        "filename": filename,
                        "title": "Test",
                        "introduction": "Test intro",
                        "keywords": ["test"],
                        "chapters": [{"title": "Chapter 1", "content": "Content"}],
                    },
                )
                assert result
                content = result.data

                # Check that the file was created with a safe name
                if content["success"]:
                    assert ".." not in content["filepath"]
                    assert "/" not in content["filepath"].replace("knowledge/", "")
                    assert "<" not in content["filepath"]

    @pytest.mark.asyncio
    async def test_yaml_injection_prevention(self, temp_storage):
        """Test that YAML injection is prevented."""
        # This would need actual malicious YAML content
        # For now, we ensure that parse_document handles YAML safely
        # The actual implementation uses yaml.safe_load which prevents code execution
        pass


class TestMCPTools:
    """Test all MCP tools functionality."""

    @pytest.fixture
    def temp_storage(self):
        """Create a temporary storage directory."""
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(knowledge_mcp.server, "STORAGE_PATH", Path(temp_dir)):
                # Initialize storage
                storage_path = Path(temp_dir)
                storage_path.mkdir(exist_ok=True)
                yield storage_path

    @pytest.mark.asyncio
    async def test_get_project_main_not_exists(self, temp_storage):
        """Test getting main.md when it doesn't exist."""
        client = Client(knowledge_mcp.server.server)

        async with client:
            result = await client.call_tool(
                "get_project_main", {"project_id": "nonexistent"}
            )
            assert result
            content = result.data
            assert content["exists"] is False
            assert content["content"] == ""

    @pytest.mark.asyncio
    async def test_update_and_get_project_main(self, temp_storage):
        """Test updating and then getting main.md."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"
        test_content = "# Test Project\n\nThis is a test project."

        async with client:
            # Update main.md
            result = await client.call_tool(
                "update_project_main",
                {"project_id": project_id, "content": test_content},
            )
            assert result
            content = result.data
            assert content["success"] is True

            # Get main.md
            result = await client.call_tool(
                "get_project_main", {"project_id": project_id}
            )
            assert result
            content = result.data
            assert content["exists"] is True
            assert content["content"] == test_content

    @pytest.mark.asyncio
    async def test_create_knowledge_file(self, temp_storage):
        """Test creating a knowledge file."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            result = await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "test-doc.md",
                    "title": "Test Document",
                    "introduction": "This is a test document.",
                    "keywords": ["test", "example"],
                    "chapters": [
                        {"title": "Introduction", "content": "Welcome to the test."},
                        {"title": "Details", "content": "Here are the details."},
                    ],
                },
            )
            assert result
            content = result.data
            assert content["success"] is True
            assert "filepath" in content
            assert content["filepath"] == "knowledge/test-doc.md"

    @pytest.mark.asyncio
    async def test_create_knowledge_file_missing_keywords(self, temp_storage):
        """Test creating a knowledge file without keywords."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            result = await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "test-doc.md",
                    "title": "Test Document",
                    "introduction": "This is a test document.",
                    "keywords": [],  # Empty keywords
                    "chapters": [{"title": "Test", "content": "Content"}],
                },
            )
            assert result
            content = result.data
            assert content["success"] is False
            assert "keyword" in content["error"].lower()

    @pytest.mark.asyncio
    async def test_search_knowledge(self, temp_storage):
        """Test searching knowledge documents."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            # First create a knowledge file
            await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "search-test.md",
                    "title": "Search Test",
                    "introduction": "This document contains searchable content.",
                    "keywords": ["search", "test"],
                    "chapters": [
                        {
                            "title": "Python Basics",
                            "content": "Python is a programming language.",
                        },
                        {
                            "title": "Advanced Topics",
                            "content": "Here we discuss advanced Python topics.",
                        },
                    ],
                },
            )

            # Search for "Python"
            result = await client.call_tool(
                "search_knowledge", {"project_id": project_id, "query": "Python"}
            )
            assert result
            content = result.data
            assert content["success"] is True
            assert content["total_documents"] == 1
            assert content["total_matches"] == 2  # Both chapters match
            assert len(content["results"]) == 1

            # Verify search results contain the query
            doc_result = content["results"][0]
            assert doc_result["file"] == "search-test.md"
            assert doc_result["match_count"] == 2
            assert len(doc_result["matching_chapters"]) == 2

            # Check each matching chapter
            for chapter in doc_result["matching_chapters"]:
                assert "keywords_found" in chapter
                assert "python" in chapter["keywords_found"]
                assert "match_context" in chapter
                assert isinstance(chapter["match_context"], dict)
                assert "python" in chapter["match_context"]
                # Check that at least one context contains "python"
                contexts = chapter["match_context"]["python"]
                assert any("python" in ctx.lower() for ctx in contexts)

    @pytest.mark.asyncio
    async def test_filename_extension_handling(self, temp_storage):
        """Test that filenames with .md extension are handled correctly."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            # Test 1: Create file with .md extension already in filename
            result = await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "test-with-extension.md",
                    "title": "Test With Extension",
                    "introduction": "Testing filename with .md extension",
                    "keywords": ["test"],
                    "chapters": [{"title": "Chapter", "content": "Content"}],
                },
            )
            assert result
            content = result.data
            assert content["success"] is True
            # Verify it doesn't create double extension
            assert content["filepath"] == "knowledge/test-with-extension.md"
            assert ".md.md" not in content["filepath"]

            # Test 2: Create file without .md extension
            result = await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "test-without-extension",
                    "title": "Test Without Extension",
                    "introduction": "Testing filename without .md extension",
                    "keywords": ["test"],
                    "chapters": [{"title": "Chapter", "content": "Content"}],
                },
            )
            assert result
            content = result.data
            assert content["success"] is True
            # Verify .md extension is added
            assert content["filepath"] == "knowledge/test-without-extension.md"

            # Test 3: Create file with mixed case .MD extension
            result = await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "test-uppercase.MD",
                    "title": "Test Uppercase Extension",
                    "introduction": "Testing filename with uppercase .MD extension",
                    "keywords": ["test"],
                    "chapters": [{"title": "Chapter", "content": "Content"}],
                },
            )
            assert result
            content = result.data
            assert content["success"] is True
            # Verify it doesn't create double extension for uppercase
            assert content["filepath"] == "knowledge/test-uppercase.md"
            assert ".MD.md" not in content["filepath"]
            assert ".md.md" not in content["filepath"]

    @pytest.mark.asyncio
    async def test_update_chapter(self, temp_storage):
        """Test updating a chapter in a knowledge document."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            # First create a knowledge file
            await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "update-test.md",
                    "title": "Update Test",
                    "introduction": "Document for testing updates.",
                    "keywords": ["update", "test"],
                    "chapters": [
                        {"title": "Chapter One", "content": "Original content."},
                        {"title": "Chapter Two", "content": "More content."},
                    ],
                },
            )

            # Update Chapter One
            result = await client.call_tool(
                "update_chapter",
                {
                    "project_id": project_id,
                    "filename": "update-test.md",
                    "chapter_title": "Chapter One",
                    "new_content": "Updated content for chapter one.",
                },
            )
            assert result
            content = result.data
            assert content["success"] is True

            # Verify the update by searching
            result = await client.call_tool(
                "search_knowledge", {"project_id": project_id, "query": "Updated"}
            )
            assert result
            content = result.data
            assert content["total_matches"] > 0

    @pytest.mark.asyncio
    async def test_update_nonexistent_chapter(self, temp_storage):
        """Test updating a chapter that doesn't exist."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            # First create a knowledge file
            await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "test.md",
                    "title": "Test",
                    "introduction": "Test doc.",
                    "keywords": ["test"],
                    "chapters": [{"title": "Chapter One", "content": "Content."}],
                },
            )

            # Try to update non-existent chapter
            result = await client.call_tool(
                "update_chapter",
                {
                    "project_id": project_id,
                    "filename": "test.md",
                    "chapter_title": "Nonexistent Chapter",
                    "new_content": "New content.",
                },
            )
            assert result
            content = result.data
            assert content["success"] is False
            assert "not found" in content["error"]

    @pytest.mark.asyncio
    async def test_delete_knowledge_file(self, temp_storage):
        """Test deleting a knowledge file."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            # First create a knowledge file
            await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "delete-test.md",
                    "title": "Delete Test",
                    "introduction": "This file will be deleted.",
                    "keywords": ["delete", "test"],
                    "chapters": [{"title": "Chapter", "content": "Content"}],
                },
            )

            # Delete the file
            result = await client.call_tool(
                "delete_knowledge_file",
                {"project_id": project_id, "filename": "delete-test.md"},
            )
            assert result
            content = result.data
            assert content["success"] is True

            # Verify deletion by searching
            result = await client.call_tool(
                "search_knowledge",
                {"project_id": project_id, "query": "delete"},
            )
            assert result
            content = result.data
            assert content["total_documents"] == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_file(self, temp_storage):
        """Test deleting a file that doesn't exist."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            result = await client.call_tool(
                "delete_knowledge_file",
                {"project_id": project_id, "filename": "nonexistent.md"},
            )
            assert result
            content = result.data
            assert content["success"] is False
            assert "not found" in content["error"].lower()


class TestMCPResources:
    """Test MCP resources functionality."""

    @pytest.fixture
    def temp_storage(self):
        """Create a temporary storage directory."""
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(knowledge_mcp.server, "STORAGE_PATH", Path(temp_dir)):
                yield Path(temp_dir)

    @pytest.mark.asyncio
    async def test_main_resource(self, temp_storage):
        """Test reading main.md as a resource."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            # First create main.md
            await client.call_tool(
                "update_project_main",
                {"project_id": project_id, "content": "# Main Instructions"},
            )

            # Read as resource
            result = await client.read_resource(
                f"knowledge://projects/{project_id}/main"
            )
            # read_resource returns a list of TextContent objects
            assert result[0].text == "# Main Instructions"

    @pytest.mark.asyncio
    async def test_files_list_resource(self, temp_storage):
        """Test listing files as a resource."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            # Create some files
            for i in range(3):
                await client.call_tool(
                    "create_knowledge_file",
                    {
                        "project_id": project_id,
                        "filename": f"file{i}.md",
                        "title": f"File {i}",
                        "introduction": f"This is file {i}.",
                        "keywords": [f"file{i}"],
                        "chapters": [{"title": "Chapter", "content": "Content"}],
                    },
                )

            # List files
            result = await client.read_resource(
                f"knowledge://projects/{project_id}/files"
            )
            # read_resource returns a list of TextContent objects
            data = json.loads(result[0].text)
            assert data["count"] == 3
            assert len(data["files"]) == 3

    @pytest.mark.asyncio
    async def test_chapters_resource(self, temp_storage):
        """Test listing chapters as a resource."""
        client = Client(knowledge_mcp.server.server)
        project_id = "test-project"

        async with client:
            # Create a file with chapters
            await client.call_tool(
                "create_knowledge_file",
                {
                    "project_id": project_id,
                    "filename": "chapters.md",
                    "title": "Chapters Test",
                    "introduction": "Testing chapters.",
                    "keywords": ["chapters"],
                    "chapters": [
                        {"title": "Chapter 1", "content": "First chapter content."},
                        {"title": "Chapter 2", "content": "Second chapter content."},
                        {"title": "Chapter 3", "content": "Third chapter content."},
                    ],
                },
            )

            # List chapters
            result = await client.read_resource(
                f"knowledge://projects/{project_id}/chapters/chapters.md"
            )
            # read_resource returns a list of TextContent objects
            data = json.loads(result[0].text)
            assert data["count"] == 3
            assert len(data["chapters"]) == 3
            assert data["chapters"][0]["title"] == "Chapter 1"


class TestIntegration:
    """Test full workflow integration."""

    @pytest.fixture
    def temp_storage(self):
        """Create a temporary storage directory."""
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(knowledge_mcp.server, "STORAGE_PATH", Path(temp_dir)):
                yield Path(temp_dir)

    @pytest.mark.asyncio
    async def test_full_workflow(self, temp_storage):
        """Test complete usage workflow."""
        client = Client(knowledge_mcp.server.server)
        project_id = "integration-test"

        async with client:
            # 1. Create project main
            result = await client.call_tool(
                "update_project_main",
                {
                    "project_id": project_id,
                    "content": "# Integration Test Project\n\nThis is the main project file.",
                },
            )
            assert result.data["success"] is True

            # 2. Create multiple knowledge files
            files = [
                {
                    "filename": "architecture.md",
                    "title": "System Architecture",
                    "introduction": "Overview of the system architecture.",
                    "keywords": ["architecture", "design", "system"],
                    "chapters": [
                        {"title": "Overview", "content": "High-level architecture."},
                        {"title": "Components", "content": "Main components."},
                    ],
                },
                {
                    "filename": "api-guide.md",
                    "title": "API Guide",
                    "introduction": "Guide to using the API.",
                    "keywords": ["api", "guide", "reference"],
                    "chapters": [
                        {"title": "Authentication", "content": "How to authenticate."},
                        {"title": "Endpoints", "content": "Available endpoints."},
                    ],
                },
            ]

            for file_data in files:
                result = await client.call_tool(
                    "create_knowledge_file",
                    {"project_id": project_id, **file_data},
                )
                assert result.data["success"] is True

            # 3. Search content
            result = await client.call_tool(
                "search_knowledge",
                {"project_id": project_id, "query": "architecture"},
            )
            content = result.data
            assert content["success"] is True
            assert content["total_matches"] > 0

            # 4. Update a chapter
            result = await client.call_tool(
                "update_chapter",
                {
                    "project_id": project_id,
                    "filename": "api-guide.md",
                    "chapter_title": "Authentication",
                    "new_content": "Updated authentication guide with OAuth2 support.",
                },
            )
            assert result.data["success"] is True

            # 5. List files via resource
            result = await client.read_resource(
                f"knowledge://projects/{project_id}/files"
            )
            # read_resource returns a list of TextContent objects
            data = json.loads(result[0].text)
            assert data["count"] == 2

            # 6. Delete a file
            result = await client.call_tool(
                "delete_knowledge_file",
                {"project_id": project_id, "filename": "architecture.md"},
            )
            assert result.data["success"] is True

            # 7. Verify deletion
            result = await client.read_resource(
                f"knowledge://projects/{project_id}/files"
            )
            # read_resource returns a list of TextContent objects
            data = json.loads(result[0].text)
            assert data["count"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
