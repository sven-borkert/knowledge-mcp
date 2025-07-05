#!/usr/bin/env python3
"""
Test suite for project_id.py - project identification
"""

import os
import subprocess
import tempfile
from pathlib import Path

import pytest

from knowledge_mcp.project_id import get_git_remote_url, get_project_id


class TestProjectIdentification:
    """Test project identification functions."""

    def test_get_git_remote_url_https(self):
        """Test extracting HTTPS git remote URL."""

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)

            # Initialize git repo
            subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)

            # Add remote
            subprocess.run(
                ["git", "remote", "add", "origin", "https://github.com/user/repo.git"],
                cwd=repo_path,
                capture_output=True,
            )

            # Change to repo directory
            original_cwd = os.getcwd()
            try:
                os.chdir(repo_path)
                url = get_git_remote_url()
                assert url == "https://github.com/user/repo.git"
            finally:
                os.chdir(original_cwd)

    def test_get_git_remote_url_ssh(self):
        """Test extracting SSH git remote URL."""

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)

            # Initialize git repo
            subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)

            # Add SSH remote
            subprocess.run(
                ["git", "remote", "add", "origin", "git@github.com:user/repo.git"],
                cwd=repo_path,
                capture_output=True,
            )

            original_cwd = os.getcwd()
            try:
                os.chdir(repo_path)
                url = get_git_remote_url()
                assert url == "git@github.com:user/repo.git"
            finally:
                os.chdir(original_cwd)

    def test_get_git_remote_url_no_remote(self):
        """Test when no git remote exists."""

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)

            # Initialize git repo without remote
            subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)

            original_cwd = os.getcwd()
            try:
                os.chdir(repo_path)
                url = get_git_remote_url()
                assert url is None
            finally:
                os.chdir(original_cwd)

    def test_get_git_remote_url_no_git(self):
        """Test when not in a git repository."""

        with tempfile.TemporaryDirectory() as temp_dir:
            original_cwd = os.getcwd()
            try:
                os.chdir(temp_dir)
                url = get_git_remote_url()
                assert url is None
            finally:
                os.chdir(original_cwd)

    def test_get_project_id_from_https_remote(self):
        """Test getting project ID from HTTPS remote."""

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)

            # Initialize git repo
            subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)

            # Add remote
            subprocess.run(
                [
                    "git",
                    "remote",
                    "add",
                    "origin",
                    "https://github.com/user/my-project.git",
                ],
                cwd=repo_path,
                capture_output=True,
            )

            original_cwd = os.getcwd()
            try:
                os.chdir(repo_path)
                project_id = get_project_id()
                # Should use the full remote URL as project ID
                assert project_id == "https://github.com/user/my-project.git"
            finally:
                os.chdir(original_cwd)

    def test_get_project_id_from_ssh_remote(self):
        """Test getting project ID from SSH remote."""

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)

            # Initialize git repo
            subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)

            # Add SSH remote
            subprocess.run(
                [
                    "git",
                    "remote",
                    "add",
                    "origin",
                    "git@gitlab.com:team/project-name.git",
                ],
                cwd=repo_path,
                capture_output=True,
            )

            original_cwd = os.getcwd()
            try:
                os.chdir(repo_path)
                project_id = get_project_id()
                # Should use the full remote URL as project ID
                assert project_id == "git@gitlab.com:team/project-name.git"
            finally:
                os.chdir(original_cwd)

    def test_get_project_id_from_directory_name(self):
        """Test getting project ID from directory name when no git remote."""

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a specific subdirectory
            project_dir = Path(temp_dir) / "my-awesome-project"
            project_dir.mkdir()

            original_cwd = os.getcwd()
            try:
                os.chdir(project_dir)
                project_id = get_project_id()
                # Should slugify the directory name
                assert project_id == "my-awesome-project"
            finally:
                os.chdir(original_cwd)

    def test_get_project_id_special_characters(self):
        """Test project ID with special characters in directory name."""

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create directory with special characters
            project_dir = Path(temp_dir) / "My Project (v2.0)"
            project_dir.mkdir()

            original_cwd = os.getcwd()
            try:
                os.chdir(project_dir)
                project_id = get_project_id()
                # Should slugify special characters
                assert project_id == "my-project-v2.0)"
            finally:
                os.chdir(original_cwd)

    def test_get_project_id_unicode_directory(self):
        """Test project ID with unicode in directory name."""

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create directory with unicode
            project_dir = Path(temp_dir) / "café-project"
            project_dir.mkdir()

            original_cwd = os.getcwd()
            try:
                os.chdir(project_dir)
                project_id = get_project_id()
                # Should transliterate unicode
                assert project_id == "cafe-project"
            finally:
                os.chdir(original_cwd)

    def test_get_project_id_git_file_url(self):
        """Test getting project ID from file:// git URL."""

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)

            # Initialize git repo
            subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)

            # Add file URL remote
            subprocess.run(
                ["git", "remote", "add", "origin", "file:///path/to/repo.git"],
                cwd=repo_path,
                capture_output=True,
            )

            original_cwd = os.getcwd()
            try:
                os.chdir(repo_path)
                project_id = get_project_id()
                # Should use the full file URL
                assert project_id == "file:///path/to/repo.git"
            finally:
                os.chdir(original_cwd)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
