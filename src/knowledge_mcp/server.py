#!/usr/bin/env python3
"""
Knowledge MCP Server

Centralized project knowledge management via Model Context Protocol.
"""

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from .documents import parse_chapters, parse_document, search_documents, write_document
from .utils import (
    auto_commit,
    get_project_directory,
    initialize_storage,
    slugify,
)

# Configuration from environment
STORAGE_PATH = Path(os.getenv("KNOWLEDGE_MCP_HOME", "~/.knowledge-mcp")).expanduser()
LOG_LEVEL = os.getenv("KNOWLEDGE_MCP_LOG_LEVEL", "INFO")

# Configure logging
logging.basicConfig(level=getattr(logging, LOG_LEVEL))
logger = logging.getLogger(__name__)

# Initialize server with proper description
server: FastMCP = FastMCP(
    name="Knowledge MCP Server",
    instructions=(
        "IMPORTANT: This Knowledge MCP server ONLY replaces the project's CLAUDE.md. "
        "It does NOT replace CLAUDE.local.md or ~/.claude/CLAUDE.md - those must "
        "still be used as usual.\n\n"
        "Key concepts:\n"
        "- project_id: Determined from your current working location:\n"
        "  * If in a git repo: Use the repository name (e.g., 'knowledge-mcp')\n"
        "  * If not in git: Use the current location name (e.g., 'My Project')\n"
        "- Project instructions: Retrieved via 'get_project_main' "
        "(replaces project's CLAUDE.md only)\n"
        "- Knowledge documents: Structured content with metadata and chapters\n"
        "- Secure: All inputs are validated and sanitized\n\n"
        "Start by using 'get_project_main' with the project_id to retrieve "
        "project-specific instructions."
    ),
)

# Initialize storage on startup
try:
    initialize_storage(STORAGE_PATH)
    logger.info("Storage initialized at: %s", STORAGE_PATH)
except Exception as e:
    logger.error("Failed to initialize storage: %s", e)
    raise


@server.tool(
    description=(
        "Retrieves the main project instructions which replace CLAUDE.md. "
        "project_id should be a unique identifier like repo name or project slug. "
        "Returns: {exists: bool, content: str, error?: str}. "
        "If project doesn't exist, returns exists=false with empty content."
    )
)
async def get_project_main(project_id: str) -> Dict[str, Any]:
    """
    Get the main project instructions file.

    This is the primary entry point for understanding a project's guidelines,
    setup instructions, and development practices. It serves as a replacement
    for traditional CLAUDE.md files but is stored centrally.

    Args:
        project_id: The project identifier (alphanumeric + hyphens, no paths)
                   Examples: 'my-app', 'knowledge-mcp', 'backend-api'

    Returns:
        Dictionary with:
        - exists (bool): Whether the main.md file exists
        - content (str): The markdown content of main.md
        - error (str, optional): Error message if something went wrong
    """
    try:
        # Get project directory using index mapping
        _, project_path = get_project_directory(STORAGE_PATH, project_id)
        main_file = project_path / "main.md"

        # Check if file exists
        if not main_file.exists():
            return {
                "exists": False,
                "content": "",
            }

        # Read file content
        content = main_file.read_text(encoding="utf-8")
        return {
            "exists": True,
            "content": content,
        }

    except Exception as e:
        logger.error("Error reading project main: %s", e)
        return {
            "exists": False,
            "content": "",
            "error": str(e),
        }


@server.tool(
    description=(
        "Updates or creates the main project instructions. "
        "Creates the project if it doesn't exist. "
        "project_id can contain spaces and special characters (e.g., 'My Project'). "
        "Returns: {success: bool, message?: str, error?: str}"
    )
)
async def update_project_main(project_id: str, content: str) -> Dict[str, Any]:
    """
    Update or create the main project instructions file.

    This tool creates the project directory structure if it doesn't exist and
    writes/updates the main.md file. All changes are automatically committed
    to git for version tracking.

    Args:
        project_id: The project identifier (can contain spaces)
                   Examples: 'my-app', 'My App', 'Backend API'
        content: The new markdown content for main.md
                Can include any project instructions, setup guides, etc.

    Returns:
        Dictionary with:
        - success (bool): Whether the operation succeeded
        - message (str): Success message if operation completed
        - error (str, optional): Error details if operation failed
    """
    try:
        # Get project directory using index mapping
        original_id, project_path = get_project_directory(STORAGE_PATH, project_id)

        # Create project directory if it doesn't exist
        project_path.mkdir(parents=True, exist_ok=True)

        # Write content to main.md
        main_file = project_path / "main.md"
        main_file.write_text(content, encoding="utf-8")

        # Git commit changes
        auto_commit(
            STORAGE_PATH,
            f"Update main.md for project: {original_id}",
        )

        return {
            "success": True,
            "message": "Project main instructions updated successfully",
        }

    except Exception as e:
        logger.error("Error updating project main: %s", e)
        return {
            "success": False,
            "error": str(e),
        }


@server.tool(
    description=(
        "Search project knowledge documents for keywords (case-insensitive). "
        "Returns document-centric results with matching chapters grouped by document. "
        "Searches in: document body, chapter titles, chapter content, "
        "and pre-chapter content. "
        "Returns: {success: bool, total_documents: int, total_matches: int, "
        "results: [...], error?: str}"
    )
)
async def search_knowledge(project_id: str, query: str) -> Dict[str, Any]:
    """
    Search through project knowledge documents.

    Performs case-insensitive keyword search across all markdown files in the
    project's knowledge directory. Results are grouped by document to avoid
    duplication and provide better context.

    Args:
        project_id: The project identifier
        query: Space-separated keywords to search for
               Examples: 'security', 'api authentication', 'database setup'

    Returns:
        Dictionary with:
        - success (bool): Whether search completed successfully
        - total_documents (int): Number of documents containing matches
        - total_matches (int): Total number of chapter/section matches
        - results (list): Document-centric results, each containing:
          - file (str): Filename of the document
          - match_count (int): Number of matching sections in this document
          - metadata (dict): Document metadata (title, keywords, dates)
          - matching_chapters (list): Chapters/sections with matches
        - error (str, optional): Error message if search failed
    """
    try:
        # Get project directory using index mapping
        _, project_path = get_project_directory(STORAGE_PATH, project_id)

        # Check if project exists
        if not project_path.exists():
            return {
                "success": True,
                "results": [],
                "message": "Project not found",
            }

        # Search all .md files in knowledge/
        results = search_documents(project_path, query)

        # Calculate summary statistics
        total_documents = len(results)
        total_matches = sum(doc["match_count"] for doc in results)

        return {
            "success": True,
            "total_documents": total_documents,
            "total_matches": total_matches,
            "results": results,
        }

    except Exception as e:
        logger.error("Error searching knowledge: %s", e)
        return {
            "success": False,
            "results": [],
            "error": str(e),
        }


@server.tool(
    description=(
        "Create a structured knowledge document with metadata. "
        "Document name is slugified for safety (spaces→hyphens). "
        "Requires at least one keyword. Chapters must have 'title' and 'content' keys. "
        "Returns: {success: bool, document_id?: str, "
        "message?: str, error?: str}"
    )
)
async def create_knowledge_file(
    project_id: str,
    filename: str,
    title: str,
    introduction: str,
    keywords: List[str],
    chapters: List[Dict[str, str]],
) -> Dict[str, Any]:
    """
    Create a new structured knowledge document.

    Creates a markdown file with YAML frontmatter containing metadata,
    followed by the introduction and chapter sections. The file is stored
    in the project's knowledge directory.

    Args:
        project_id: The project identifier
        filename: Desired filename (will be slugified, .md extension optional)
                 Examples: 'API Guide' → 'api-guide.md', 'setup.md' → 'setup.md'
        title: Human-readable document title for the metadata
        introduction: Opening text that appears before any chapters
        keywords: List of searchable keywords (minimum 1 required)
                 Examples: ['api', 'authentication', 'rest']
        chapters: List of chapter dictionaries, each must contain:
                 - title (str): Chapter heading (will be prefixed with ##)
                 - content (str): Chapter body text
                 Example: [{'title': 'Getting Started', 'content': 'First steps...'}]

    Returns:
        Dictionary with:
        - success (bool): Whether document was created successfully
        - filepath (str): Relative path to created file (e.g., 'knowledge/api-guide.md')
        - message (str): Success message
        - error (str, optional): Error details if creation failed
    """
    try:
        # Get project directory using index mapping
        original_id, project_path = get_project_directory(STORAGE_PATH, project_id)

        # Ensure at least one keyword
        if not keywords or len(keywords) == 0:
            return {
                "success": False,
                "error": "At least one keyword is required",
            }

        # Validate chapters structure
        for i, chapter in enumerate(chapters):
            if not isinstance(chapter, dict):
                return {
                    "success": False,
                    "error": f"Chapter {i} is not a dictionary",
                }
            if "title" not in chapter or "content" not in chapter:
                return {
                    "success": False,
                    "error": f"Chapter {i} missing required fields "
                    f"'title' or 'content'",
                }

        # Slugify filename and add .md extension if not present
        if filename.lower().endswith(".md"):
            # Remove .md extension before slugifying, then add it back
            base_filename = filename[:-3]
            safe_filename = slugify(base_filename) + ".md"
        else:
            safe_filename = slugify(filename) + ".md"

        # Create knowledge directory
        knowledge_path = project_path / "knowledge"
        knowledge_path.mkdir(parents=True, exist_ok=True)

        # Construct file path
        file_path = knowledge_path / safe_filename

        # Check if file already exists
        if file_path.exists():
            return {
                "success": False,
                "error": f"File already exists: {safe_filename}",
            }

        # Create document metadata
        metadata = {
            "title": title,
            "keywords": keywords,
            "created": datetime.now().isoformat(),
            "updated": datetime.now().isoformat(),
        }

        # Build document content
        content_parts = [introduction, ""]  # Empty line after introduction

        # Add chapters
        for chapter in chapters:
            content_parts.append(f"## {chapter['title']}")
            content_parts.append("")
            content_parts.append(chapter["content"])
            content_parts.append("")

        content = "\n".join(content_parts).strip()

        # Write document
        write_document(file_path, metadata, content)

        # Git commit
        auto_commit(
            STORAGE_PATH,
            f"Create knowledge file: {safe_filename} for project {original_id}",
        )

        return {
            "success": True,
            "filepath": f"knowledge/{safe_filename}",
            "message": "Knowledge document created successfully",
        }

    except Exception as e:
        logger.error("Error creating knowledge file: %s", e)
        return {
            "success": False,
            "error": str(e),
        }


@server.tool(
    description=(
        "Update a specific chapter within a knowledge document by title "
        "(exact match required). "
        "Preserves document structure, metadata, and other chapters. "
        "Chapter title must match exactly including case. "
        "Returns: {success: bool, message?: str, error?: str}"
    )
)
async def update_chapter(
    project_id: str,
    filename: str,
    chapter_title: str,
    new_content: str,
    new_summary: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update a specific chapter in a knowledge document.

    Finds and updates a chapter by its exact title match. Preserves all other
    content including metadata, introduction, and other chapters. The chapter
    structure (## heading) is maintained automatically.

    Args:
        project_id: The project identifier
        filename: Knowledge file name (must include .md extension)
                 Example: 'api-guide.md'
        chapter_title: Exact title of the chapter to update (case-sensitive)
                      Example: 'Authentication Methods'
        new_content: New content for the chapter (without ## heading)
                    The ## heading will be added automatically
        new_summary: Optional chapter summary for search results
                    If not provided, existing summary is preserved

    Returns:
        Dictionary with:
        - success (bool): Whether update succeeded
        - message (str): Success message with chapter title
        - error (str, optional): Error details if update failed
    """
    try:
        # Get project directory using index mapping
        _, project_path = get_project_directory(STORAGE_PATH, project_id)

        # Construct file path
        knowledge_path = project_path / "knowledge"
        file_path = knowledge_path / filename

        # Check if file exists
        if not file_path.exists():
            return {
                "success": False,
                "error": f"File not found: {filename}",
            }

        # Read existing document
        content = file_path.read_text(encoding="utf-8")
        metadata, body = parse_document(content)

        # Parse chapters
        chapters = parse_chapters(body)

        # Find the chapter to update
        chapter_found = False
        updated_chapters = []

        for chapter in chapters:
            if chapter["title"] == chapter_title:
                chapter_found = True
                # Update chapter content
                updated_chapter = {
                    "title": chapter["title"],
                    "level": chapter["level"],
                    "content": f"## {chapter['title']}\n\n{new_content}",
                    "summary": new_summary or chapter["summary"],
                }
                updated_chapters.append(updated_chapter)
            else:
                updated_chapters.append(chapter)

        if not chapter_found:
            return {
                "success": False,
                "error": f"Chapter not found: {chapter_title}",
            }

        # Reconstruct document body
        body_parts = []

        # Add any content before first chapter
        if chapters and body.startswith(chapters[0]["content"]):
            # No intro content
            pass
        else:
            # Extract intro content
            first_chapter_pos = (
                body.find(chapters[0]["content"]) if chapters else len(body)
            )
            intro = body[:first_chapter_pos].strip()
            if intro:
                body_parts.append(intro)
                body_parts.append("")

        # Add updated chapters
        for chapter in updated_chapters:
            body_parts.append(chapter["content"].strip())
            body_parts.append("")

        new_body = "\n".join(body_parts).strip()

        # Update metadata timestamp
        metadata["updated"] = datetime.now().isoformat()

        # Write updated document
        write_document(file_path, metadata, new_body)

        # Git commit
        auto_commit(
            STORAGE_PATH,
            f"Update chapter '{chapter_title}' in {filename}",
        )

        return {
            "success": True,
            "message": f"Chapter '{chapter_title}' updated successfully",
        }

    except Exception as e:
        logger.error("Error updating chapter: %s", e)
        return {
            "success": False,
            "error": str(e),
        }


@server.tool(
    description=(
        "Delete a knowledge document permanently. This action cannot be undone. "
        "Returns: {success: bool, message?: str, "
        "error?: str}"
    )
)
async def delete_knowledge_file(project_id: str, filename: str) -> Dict[str, Any]:
    """
    Delete a knowledge document permanently.

    Removes the specified markdown file from the project's knowledge directory.
    The deletion is tracked in git history but the file cannot be recovered
    through the MCP interface.

    Args:
        project_id: The project identifier
        filename: Full filename including .md extension
                 Example: 'api-guide.md', 'setup-instructions.md'

    Returns:
        Dictionary with:
        - success (bool): Whether deletion succeeded
        - message (str): Success message with filename
        - error (str, optional): Error details if deletion failed
                               Common errors: 'File not found'
    """
    try:
        # Get project directory using index mapping
        original_id, project_path = get_project_directory(STORAGE_PATH, project_id)

        # Construct file path
        knowledge_path = project_path / "knowledge"
        file_path = knowledge_path / filename

        # Check if file exists
        if not file_path.exists():
            return {
                "success": False,
                "error": f"File not found: {filename}",
            }

        # Delete file
        file_path.unlink()

        # Git commit removal
        auto_commit(
            STORAGE_PATH,
            f"Delete knowledge file: {filename} from project {original_id}",
        )

        return {
            "success": True,
            "message": f"Knowledge document '{filename}' deleted successfully",
        }

    except Exception as e:
        logger.error("Error deleting knowledge file: %s", e)
        return {
            "success": False,
            "error": str(e),
        }


# MCP Resources for read-only access


@server.resource("knowledge://projects/{project_id}/main")
async def get_main_resource(project_id: str) -> str:
    """
    Get the main.md content as a read-only resource.

    Resources provide direct access to content without modification capabilities.
    Use this for reading project instructions when you don't need the full
    response structure of the get_project_main tool.

    Args:
        project_id: The project identifier

    Returns:
        The raw markdown content of main.md, or a default message if not found
    """
    try:
        # Get project directory using index mapping
        _, project_path = get_project_directory(STORAGE_PATH, project_id)
        main_file = project_path / "main.md"

        # Return content if exists
        if main_file.exists():
            return main_file.read_text(encoding="utf-8")
        else:
            return f"# {project_id}\n\nNo main instructions found for this project."

    except Exception as e:
        logger.error("Error reading main resource: %s", e)
        return f"Error: {str(e)}"


@server.resource("knowledge://projects/{project_id}/files")
async def list_files_resource(project_id: str) -> Dict[str, Any]:
    """
    List all knowledge files in a project with their metadata.

    Provides a read-only view of all markdown files in the project's knowledge
    directory, including their metadata extracted from YAML frontmatter.

    Args:
        project_id: The project identifier

    Returns:
        Dictionary with:
        - files (list): Array of file information objects containing:
          - filename (str): The markdown filename
          - title (str): Document title from metadata
          - keywords (list): Searchable keywords
          - created (str): ISO timestamp of creation
          - updated (str): ISO timestamp of last update
        - count (int): Total number of files
        - error (str, optional): Error message if listing failed
    """
    try:
        # Get project directory using index mapping
        _, project_path = get_project_directory(STORAGE_PATH, project_id)
        knowledge_path = project_path / "knowledge"

        if not knowledge_path.exists():
            return {
                "files": [],
                "count": 0,
            }

        files = []
        for md_file in knowledge_path.glob("*.md"):
            try:
                # Read and parse file
                content = md_file.read_text(encoding="utf-8")
                metadata, _ = parse_document(content)

                files.append(
                    {
                        "filename": md_file.name,
                        "title": metadata.get("title", "Untitled"),
                        "keywords": metadata.get("keywords", []),
                        "created": metadata.get("created", ""),
                        "updated": metadata.get("updated", ""),
                    }
                )
            except Exception:
                # Skip files that can't be parsed
                continue

        return {
            "files": files,
            "count": len(files),
        }

    except Exception as e:
        logger.error("Error listing files resource: %s", e)
        return {
            "files": [],
            "count": 0,
            "error": str(e),
        }


@server.resource("knowledge://projects/{project_id}/chapters/{filename}")
async def list_chapters_resource(project_id: str, filename: str) -> Dict[str, Any]:
    """
    List all chapters in a specific knowledge file.

    Provides a read-only view of the document structure, showing all chapters
    with their titles, nesting levels, and summaries. Useful for navigation
    and understanding document organization.

    Args:
        project_id: The project identifier (will be slugified)
        filename: The knowledge file name (must include .md extension)

    Returns:
        Dictionary with:
        - filename (str): The markdown filename
        - title (str): Document title from metadata
        - chapters (list): Array of chapter information:
          - title (str): Chapter heading text
          - level (int): Heading level (2 for ##, 3 for ###, etc.)
          - summary (str): Chapter summary if available
        - count (int): Total number of chapters
        - error (str, optional): Error message if file not found
    """
    try:
        # Get project directory using index mapping
        _, project_path = get_project_directory(STORAGE_PATH, project_id)
        knowledge_path = project_path / "knowledge"
        file_path = knowledge_path / filename

        if not file_path.exists():
            return {
                "chapters": [],
                "error": "File not found",
            }

        # Read and parse document
        content = file_path.read_text(encoding="utf-8")
        metadata, body = parse_document(content)

        # Parse chapters
        chapters = parse_chapters(body)

        # Format chapter list
        chapter_list = []
        for chapter in chapters:
            chapter_list.append(
                {
                    "title": chapter["title"],
                    "level": chapter["level"],
                    "summary": chapter["summary"],
                }
            )

        return {
            "filename": filename,
            "title": metadata.get("title", "Untitled"),
            "chapters": chapter_list,
            "count": len(chapter_list),
        }

    except Exception as e:
        logger.error("Error listing chapters resource: %s", e)
        return {
            "chapters": [],
            "error": str(e),
        }


def main() -> None:
    """Entry point for the knowledge-mcp server."""
    server.run()


# Entry point
if __name__ == "__main__":
    main()
