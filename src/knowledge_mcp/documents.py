#!/usr/bin/env python3
"""
Document operations for Knowledge MCP Server

Provides functions for parsing, writing, and searching markdown documents with frontmatter.
"""

import os
import re
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Tuple

import frontmatter  # type: ignore
import yaml


def parse_document(content: str) -> Tuple[Dict[str, Any], str]:
    """
    Parse a markdown document with frontmatter.

    Args:
        content: The document content to parse

    Returns:
        Tuple of (metadata dict, body content)

    Raises:
        ValueError: If YAML frontmatter is invalid
    """
    try:
        # Use frontmatter to parse
        post = frontmatter.loads(content)

        # Ensure metadata is a dict (could be None)
        metadata = post.metadata if post.metadata is not None else {}

        # Validate YAML safety by re-parsing with safe_load
        if content.startswith("---"):
            # Extract frontmatter section
            fm_match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
            if fm_match:
                yaml_content = fm_match.group(1)
                try:
                    # Verify it can be safely loaded
                    yaml.safe_load(yaml_content)
                except yaml.YAMLError as e:
                    raise ValueError(f"Invalid YAML frontmatter: {str(e)}")

        return metadata, post.content

    except yaml.YAMLError as e:
        if "scanner" in str(type(e)):
            raise ValueError(f"Invalid YAML frontmatter: {str(e)}")
        raise ValueError(f"Invalid YAML frontmatter: {str(e)}")
    except Exception as e:
        if "could not determine a constructor" in str(e):
            raise ValueError("Invalid YAML frontmatter: Unsafe YAML tags detected")
        raise ValueError(f"Invalid YAML frontmatter: {str(e)}")


def parse_chapters(content: str) -> List[Dict[str, Any]]:
    """
    Parse markdown content into chapters based on headers.

    Args:
        content: The markdown content to parse

    Returns:
        List of chapter dictionaries with title, summary, and content
    """
    if not content.strip():
        return []

    chapters = []
    lines = content.split("\n")

    current_chapter = None
    chapter_lines = []

    for line in lines:
        # Check for markdown headers (##, ###, ####)
        header_match = re.match(r"^(#{2,4})\s+(.+)$", line)

        if header_match:
            # Save previous chapter if exists
            if current_chapter:
                # Extract summary from chapter content
                content_lines = chapter_lines[1:]  # Skip header line
                summary = ""
                summary_lines: List[str] = []

                # Look for summary lines - stop at empty line or after 2-3 lines
                for j, cl in enumerate(content_lines):
                    if not cl.strip() and summary_lines:
                        # Empty line after content - stop
                        break
                    if cl.strip():
                        summary_lines.append(cl.strip())
                        # Check if next line is empty (end of summary paragraph)
                        if (
                            j + 1 < len(content_lines)
                            and not content_lines[j + 1].strip()
                        ):
                            break
                        # Or stop after getting a reasonable summary
                        if len(" ".join(summary_lines)) > 100:
                            break

                summary = " ".join(summary_lines)

                current_chapter["summary"] = summary
                current_chapter["content"] = "\n".join(chapter_lines)
                chapters.append(current_chapter)

            # Start new chapter
            level = len(header_match.group(1))
            title = header_match.group(2).strip()
            current_chapter = {
                "title": title,
                "level": level,
                "summary": "",
                "content": "",
            }
            chapter_lines = [line]
        else:
            # Add line to current chapter
            if current_chapter:
                chapter_lines.append(line)

    # Save last chapter
    if current_chapter:
        # Extract summary
        content_lines = chapter_lines[1:]  # Skip header line
        summary = ""
        summary_lines = []

        # Look for summary lines
        for j, cl in enumerate(content_lines):
            if not cl.strip() and summary_lines:
                # Empty line after content - stop
                break
            if cl.strip():
                summary_lines.append(cl.strip())
                # Check if next line is empty (end of summary paragraph)
                if j + 1 < len(content_lines) and not content_lines[j + 1].strip():
                    break
                # Or stop after getting a reasonable summary
                if len(" ".join(summary_lines)) > 100:
                    break

        summary = " ".join(summary_lines)

        current_chapter["summary"] = summary
        current_chapter["content"] = "\n".join(chapter_lines)
        chapters.append(current_chapter)

    return chapters


def write_document(path: Path, metadata: Dict[str, Any], content: str) -> None:
    """
    Write a document with frontmatter.

    Args:
        path: Path to write the document to
        metadata: Metadata dictionary for frontmatter
        content: Document content

    Raises:
        ValueError: If required metadata fields are missing
    """
    # For knowledge documents, validate required fields
    # If it's meant to be a knowledge document, it needs title
    if not metadata:
        raise ValueError("Missing required metadata")

    # Create parent directory if needed
    path.parent.mkdir(parents=True, exist_ok=True)

    # Create document with frontmatter
    post = frontmatter.Post(content, **metadata)

    # Write atomically using temp file
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as tmp:
        tmp.write(frontmatter.dumps(post))
        tmp_path = tmp.name

    # Rename temp file to final location
    os.replace(tmp_path, path)


def search_documents(project_path: Path, query: str) -> List[Dict[str, Any]]:
    """
    Search knowledge documents for a query.

    Args:
        project_path: Path to the project directory
        query: Search query string (space-separated keywords)

    Returns:
        List of search results with file, chapter, and context information
    """
    if not query:
        return []

    knowledge_dir = project_path / "knowledge"
    if not knowledge_dir.exists():
        return []

    # Split query into individual keywords
    keywords = [kw.strip().lower() for kw in query.split() if kw.strip()]
    if not keywords:
        return []

    # Structure to aggregate results by document
    # {filename: {metadata, chapters: {chapter_title: {data}}}}
    document_results: Dict[str, Dict[str, Any]] = {}

    # Search through all markdown files
    for md_file in knowledge_dir.glob("*.md"):
        try:
            with open(md_file, "r", encoding="utf-8") as f:
                content = f.read()

            # Parse document
            metadata, body = parse_document(content)
            chapters = parse_chapters(body)

            # Search each keyword
            for keyword in keywords:
                body_lower = body.lower()

                # If no chapters, search entire body
                if not chapters and keyword in body_lower:
                    contexts = []
                    start_pos = 0
                    while True:
                        index = body_lower.find(keyword, start_pos)
                        if index == -1:
                            break

                        # Extract context
                        ctx_start = max(0, index - 50)
                        ctx_end = min(len(body), index + len(keyword) + 50)
                        context = body[ctx_start:ctx_end].strip()
                        if ctx_start > 0:
                            context = "..." + context
                        if ctx_end < len(body):
                            context = context + "..."
                        contexts.append(context)

                        start_pos = index + 1

                    if contexts:
                        # Initialize document entry if needed
                        if md_file.name not in document_results:
                            document_results[md_file.name] = {
                                "metadata": metadata,
                                "matching_chapters": {},
                            }

                        # Add body-level match as a special chapter
                        if (
                            "_document_body"
                            not in document_results[md_file.name]["matching_chapters"]
                        ):
                            document_results[md_file.name]["matching_chapters"][
                                "_document_body"
                            ] = {
                                "chapter": "",
                                "keywords_found": set(),
                                "match_context": {},
                                "chapter_summary": "",
                            }

                        chapter_data = document_results[md_file.name][
                            "matching_chapters"
                        ]["_document_body"]
                        chapter_data["keywords_found"].add(keyword)
                        if keyword not in chapter_data["match_context"]:
                            chapter_data["match_context"][keyword] = []
                        chapter_data["match_context"][keyword].extend(contexts)

                # Search in chapters
                for chapter in chapters:
                    if keyword in chapter["content"].lower():
                        # Find all contexts for this keyword in this chapter
                        chapter_lower = chapter["content"].lower()
                        contexts = []

                        # Find all occurrences
                        start_pos = 0
                        while True:
                            index = chapter_lower.find(keyword, start_pos)
                            if index == -1:
                                break

                            # Extract context
                            ctx_start = max(0, index - 50)
                            ctx_end = min(
                                len(chapter["content"]), index + len(keyword) + 50
                            )
                            context = chapter["content"][ctx_start:ctx_end].strip()
                            if ctx_start > 0:
                                context = "..." + context
                            if ctx_end < len(chapter["content"]):
                                context = context + "..."
                            contexts.append(context)

                            start_pos = index + 1

                        if contexts:
                            # Initialize document entry if needed
                            if md_file.name not in document_results:
                                document_results[md_file.name] = {
                                    "metadata": metadata,
                                    "matching_chapters": {},
                                }

                            # Initialize chapter entry if needed
                            chapter_key = chapter["title"]
                            if (
                                chapter_key
                                not in document_results[md_file.name][
                                    "matching_chapters"
                                ]
                            ):
                                document_results[md_file.name]["matching_chapters"][
                                    chapter_key
                                ] = {
                                    "chapter": chapter["title"],
                                    "keywords_found": set(),
                                    "match_context": {},
                                    "chapter_summary": chapter["summary"],
                                }

                            chapter_data = document_results[md_file.name][
                                "matching_chapters"
                            ][chapter_key]
                            chapter_data["keywords_found"].add(keyword)
                            if keyword not in chapter_data["match_context"]:
                                chapter_data["match_context"][keyword] = []
                            chapter_data["match_context"][keyword].extend(contexts)

                # If chapters exist, also search for pre-chapter content
                if chapters and keyword in body_lower:
                    # Get the content before the first chapter
                    first_chapter_start = body.find("\n##")
                    if first_chapter_start > 0:
                        pre_chapter_content = body[:first_chapter_start]
                        if keyword in pre_chapter_content.lower():
                            contexts = []
                            content_lower = pre_chapter_content.lower()
                            start_pos = 0

                            while True:
                                index = content_lower.find(keyword, start_pos)
                                if index == -1:
                                    break

                                # Extract context
                                ctx_start = max(0, index - 50)
                                ctx_end = min(
                                    len(pre_chapter_content), index + len(keyword) + 50
                                )
                                context = pre_chapter_content[ctx_start:ctx_end].strip()
                                if ctx_start > 0:
                                    context = "..." + context
                                if ctx_end < len(pre_chapter_content):
                                    context = context + "..."
                                contexts.append(context)

                                start_pos = index + 1

                            if contexts:
                                # Initialize document entry if needed
                                if md_file.name not in document_results:
                                    document_results[md_file.name] = {
                                        "metadata": metadata,
                                        "matching_chapters": {},
                                    }

                                # Add pre-chapter content as a special chapter
                                if (
                                    "_pre_chapter"
                                    not in document_results[md_file.name][
                                        "matching_chapters"
                                    ]
                                ):
                                    document_results[md_file.name]["matching_chapters"][
                                        "_pre_chapter"
                                    ] = {
                                        "chapter": "",  # Empty title for pre-chapter content
                                        "keywords_found": set(),
                                        "match_context": {},
                                        "chapter_summary": "",
                                    }

                                chapter_data = document_results[md_file.name][
                                    "matching_chapters"
                                ]["_pre_chapter"]
                                chapter_data["keywords_found"].add(keyword)
                                if keyword not in chapter_data["match_context"]:
                                    chapter_data["match_context"][keyword] = []
                                chapter_data["match_context"][keyword].extend(contexts)

        except Exception:
            # Skip files that can't be read
            continue

    # Convert to document-centric format
    results = []
    for filename, doc_data in document_results.items():
        # Convert matching chapters to list
        matching_chapters = []
        for chapter_key, chapter_data in doc_data["matching_chapters"].items():
            # Handle special keys for non-chapter content
            if chapter_key in ["_document_body", "_pre_chapter"]:
                # Add as a chapter with empty title
                matching_chapters.append(
                    {
                        "chapter": chapter_data["chapter"],
                        "keywords_found": sorted(list(chapter_data["keywords_found"])),
                        "match_context": chapter_data["match_context"],
                        "chapter_summary": chapter_data["chapter_summary"],
                    }
                )
            else:
                matching_chapters.append(
                    {
                        "chapter": chapter_data["chapter"],
                        "keywords_found": sorted(list(chapter_data["keywords_found"])),
                        "match_context": chapter_data["match_context"],
                        "chapter_summary": chapter_data["chapter_summary"],
                    }
                )

        result = {
            "file": filename,
            "match_count": len(matching_chapters),
            "metadata": doc_data["metadata"],
            "matching_chapters": matching_chapters,
        }

        results.append(result)

    return results


if __name__ == "__main__":
    # Run tests if executed directly
    import pytest

    pytest.main(["../../tests/test_documents.py", "-v"])
