#!/usr/bin/env python3
"""
Utility functions for Knowledge MCP Server

Provides security functions, git helpers, and storage management.
"""

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Dict, Optional, Tuple

from unidecode import unidecode


def validate_path(base_path: str, requested_path: str) -> str:
    """
    Validate that a requested path is within the base directory.
    Prevents directory traversal attacks.

    Args:
        base_path: The base directory that paths must be within
        requested_path: The requested path to validate

    Returns:
        The validated absolute path

    Raises:
        ValueError: If the path is invalid or attempts traversal
    """
    # Handle None or empty paths
    if not requested_path:
        raise ValueError("Invalid path: Path cannot be empty")

    # Check for absolute paths
    if os.path.isabs(requested_path):
        raise ValueError("Invalid path: Absolute paths not allowed")

    # Check for Windows drive letters
    if len(requested_path) >= 2 and requested_path[1] == ":":
        raise ValueError("Invalid path: Drive letters not allowed")

    # Check for backslashes (potential Windows paths)
    if "\\" in requested_path:
        raise ValueError("Invalid path: Backslashes not allowed")

    # Convert to Path objects
    base = Path(base_path).resolve()

    # Resolve the requested path relative to base
    try:
        # Join paths and resolve to absolute
        requested = (base / requested_path).resolve()
    except (OSError, RuntimeError) as e:
        # Handle path resolution errors
        raise ValueError(f"Invalid path: {str(e)}")

    # Check if the resolved path is within base directory
    try:
        requested.relative_to(base)
    except ValueError:
        raise ValueError("Invalid path: Access denied")

    # Check for symlinks that point outside base directory
    if requested.exists() and requested.is_symlink():
        link_target = Path(os.readlink(requested)).resolve()
        try:
            link_target.relative_to(base)
        except ValueError:
            raise ValueError("Invalid path: Symlink points outside allowed directory")

    return str(requested)


def slugify(text: str) -> str:
    """
    Convert text to a safe slug.

    Args:
        text: The text to slugify

    Returns:
        A safe slug suitable for filenames or directories
    """
    if not text or not text.strip():
        return "untitled"

    # Remove path separators first to handle path traversal attempts
    # Replace with underscore to avoid creating fake extensions
    text = text.replace("/", "_").replace("\\", "_")

    # Remove directory traversal patterns for security
    text = text.replace("..", "")

    # Handle single dots used as directory separators (like ./file)
    # Replace _. and ._ patterns that come from path separators
    text = text.replace("_._", "_")
    text = text.replace("._", "_")
    text = text.replace("_.", "_")

    # Collapse multiple underscores that may result
    while "__" in text:
        text = text.replace("__", "_")

    # Remove leading/trailing underscores
    text = text.strip("_")

    # Check if text became empty or just underscores/dots after replacements
    if not text or text.strip("_.") == "":
        return "untitled"

    # For slugs, we don't need to handle extensions
    name = text

    # Convert unicode to ASCII
    name = unidecode(name)

    # Replace dots and special characters with hyphens
    name = re.sub(r"[^\w\s-]", "-", name)

    # Replace spaces and multiple hyphens with single hyphen
    name = re.sub(r"[-\s]+", "-", name)

    # Remove leading/trailing hyphens and dots
    name = name.strip("-.")

    # Convert to lowercase
    name = name.lower()

    # Ensure name is not empty
    if not name:
        name = "untitled"

    return name


def git_command(repo_path: Path, *args: str) -> Tuple[str, str]:
    """
    Execute a git command with isolated credentials.

    Args:
        repo_path: Path to the git repository
        *args: Git command arguments

    Returns:
        Tuple of (stdout, stderr)

    Raises:
        subprocess.CalledProcessError: If git command fails
    """
    # Build command with isolated credentials
    cmd = [
        "git",
        "-c",
        "user.name=Knowledge MCP Server",
        "-c",
        "user.email=knowledge-mcp@localhost",
    ] + list(args)

    # Execute command
    result = subprocess.run(
        cmd, cwd=repo_path, capture_output=True, text=True, check=True
    )

    return result.stdout, result.stderr


def initialize_storage(storage_path: Path) -> None:
    """
    Initialize storage directory and git repository.

    Args:
        storage_path: Path to the storage directory

    Raises:
        PermissionError: If unable to create directory
        subprocess.CalledProcessError: If git init fails
    """
    # Create directory if it doesn't exist
    storage_path.mkdir(parents=True, exist_ok=True)

    # Check if git repo already exists
    git_dir = storage_path / ".git"
    if git_dir.exists():
        return

    # Initialize git repository
    subprocess.run(["git", "init"], cwd=storage_path, capture_output=True, check=True)

    # Create initial commit if repository is empty
    try:
        # Check if there are any commits
        subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=storage_path,
            capture_output=True,
            check=True,
        )
    except subprocess.CalledProcessError:
        # No commits yet, create initial commit
        readme_path = storage_path / "README.md"
        readme_path.write_text(
            "# Knowledge MCP Storage\n\nThis directory contains project knowledge managed by Knowledge MCP Server.\n"
        )

        # Add and commit
        git_command(storage_path, "add", "README.md")
        git_command(storage_path, "commit", "-m", "Initial commit")


def auto_commit(repo_path: Path, message: str) -> None:
    """
    Automatically commit all changes in the repository.

    Args:
        repo_path: Path to the git repository
        message: Commit message

    Raises:
        subprocess.CalledProcessError: If git operations fail
    """
    try:
        # Stage all changes
        git_command(repo_path, "add", "-A")

        # Check if there are changes to commit
        stdout, _ = git_command(repo_path, "status", "--porcelain")

        if stdout.strip():
            # Commit changes
            git_command(repo_path, "commit", "-m", message)
    except subprocess.CalledProcessError as e:
        # Log error but don't fail the operation
        # This allows the main operation to succeed even if git fails
        import logging

        logging.error(f"Git auto-commit failed: {e}")


def read_project_index(storage_path: Path) -> Dict[str, str]:
    """
    Read the project index mapping original names to slugified directories.

    Args:
        storage_path: The base storage path

    Returns:
        Dictionary mapping original project IDs to slugified directory names
    """
    index_file = storage_path / "index.json"

    if not index_file.exists():
        return {}

    try:
        with open(index_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            projects = data.get("projects", {})
            return projects if isinstance(projects, dict) else {}
    except (json.JSONDecodeError, IOError):
        # If index is corrupted, return empty dict
        return {}


def write_project_index(storage_path: Path, index: Dict[str, str]) -> None:
    """
    Write the project index mapping.

    Args:
        storage_path: The base storage path
        index: Dictionary mapping original project IDs to slugified directory names
    """
    index_file = storage_path / "index.json"

    try:
        # Write to temporary file first
        temp_file = index_file.with_suffix(".json.tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump({"projects": index}, f, indent=2, sort_keys=True)

        # Atomic rename
        temp_file.replace(index_file)

        # Commit the index change
        auto_commit(storage_path, "Update project index")
    except Exception:
        # Clean up temp file if it exists
        temp_file = index_file.with_suffix(".json.tmp")
        if temp_file.exists():
            temp_file.unlink()
        raise


def get_project_directory(storage_path: Path, project_id: str) -> Tuple[str, Path]:
    """
    Get the directory path for a project, handling the index mapping.

    Args:
        storage_path: The base storage path
        project_id: The original project ID (may contain spaces, etc.)

    Returns:
        Tuple of (original_project_id, project_directory_path)
    """
    index = read_project_index(storage_path)

    # Check if project_id is already in index
    if project_id in index:
        dir_name = index[project_id]
        return project_id, storage_path / "projects" / dir_name

    # For new projects, create mapping
    slugified = slugify(project_id)

    # Ensure unique directory name
    base_slug = slugified
    counter = 1
    while slugified in index.values():
        slugified = f"{base_slug}-{counter}"
        counter += 1

    # Update index
    index[project_id] = slugified
    write_project_index(storage_path, index)

    return project_id, storage_path / "projects" / slugified


def find_project_by_directory(storage_path: Path, dir_name: str) -> Optional[str]:
    """
    Find the original project ID from a directory name.

    Args:
        storage_path: The base storage path
        dir_name: The slugified directory name

    Returns:
        Original project ID or None if not found
    """
    index = read_project_index(storage_path)

    for original_id, slugified in index.items():
        if slugified == dir_name:
            return original_id

    return None


if __name__ == "__main__":
    # Run tests if executed directly
    import pytest

    pytest.main(["../../tests/test_utils.py", "-v"])
