#!/usr/bin/env python3
"""
Project identification functions for Knowledge MCP Server

Provides functions to identify projects using git remote URLs or directory names.
"""

import subprocess
from pathlib import Path
from typing import Optional

from .utils import slugify


def get_git_remote_url() -> Optional[str]:
    """
    Extract git remote origin URL from current directory.

    Returns:
        The git remote origin URL if found, None otherwise
    """
    try:
        # Run git config to get remote origin URL
        result = subprocess.run(
            ["git", "config", "--get", "remote.origin.url"],
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()

        return None
    except (subprocess.SubprocessError, FileNotFoundError):
        # Git not installed or other error
        return None


def get_project_id() -> str:
    """
    Get project ID from git remote or directory name.

    The project ID is determined by:
    1. First trying to get the git remote origin URL (used as-is)
    2. If no git remote, using the current directory name (slugified)

    Returns:
        A project identifier string
    """
    # Try to get git remote URL first
    git_url = get_git_remote_url()

    if git_url:
        # Use the git URL as-is (as specified in the technical spec)
        return git_url

    # Fall back to current directory name
    current_dir = Path.cwd()
    dir_name = current_dir.name

    # Slugify the directory name for safety
    return slugify(dir_name)


if __name__ == "__main__":
    # Run tests if executed directly
    import pytest

    pytest.main(["../../tests/test_project_id.py", "-v"])
