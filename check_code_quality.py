#!/usr/bin/env python3
"""
Run code quality checks on Python files.

This is the single wrapper for all code analysis tools:
- Black: Code formatting
- isort: Import sorting
- Ruff: Fast Python linter
- MyPy: Type checking
- Pylint: Comprehensive code analysis
"""

import subprocess
import sys
from pathlib import Path
from typing import List, Optional


def run_command(cmd: list[str]) -> tuple[bool, str]:
    """Run a command and return success status and output."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0, result.stdout + result.stderr
    except Exception as e:
        return False, str(e)


def check_file(file_path: Path, auto_fix: bool = False) -> dict[str, tuple[bool, str]]:
    """Run all checks on a single file.

    Args:
        file_path: Path to the file to check
        auto_fix: If True, apply fixes automatically where possible
    """
    results = {}

    if auto_fix:
        # Auto-fix with Black
        success, output = run_command(["black", str(file_path)])
        results["black"] = (success, output)

        # Auto-fix with isort (organize imports)
        success, output = run_command(["isort", "--profile", "black", str(file_path)])
        results["isort"] = (success, output)

        # Auto-fix with Ruff
        success, output = run_command(["ruff", "check", "--fix", str(file_path)])
        results["ruff"] = (success, output)
    else:
        # Black formatting check
        success, output = run_command(["black", "--check", str(file_path)])
        results["black"] = (success, output)

        # isort import sorting check
        success, output = run_command(["isort", "--check-only", str(file_path)])
        results["isort"] = (success, output)

        # Ruff linting
        success, output = run_command(["ruff", "check", str(file_path)])
        results["ruff"] = (success, output)

    # MyPy type checking (no auto-fix available)
    success, output = run_command(["mypy", str(file_path)])
    results["mypy"] = (success, output)

    # Pylint code analysis (no auto-fix available)
    success, output = run_command(["pylint", str(file_path)])
    results["pylint"] = (success, output)

    return results


def auto_fix_file(file_path: Path) -> dict[str, tuple[bool, str]]:
    """Auto-fix formatting issues in a file."""
    results = {}

    # Black formatting
    success, output = run_command(["black", str(file_path)])
    results["black"] = (success, output)

    # isort import sorting
    success, output = run_command(["isort", str(file_path)])
    results["isort"] = (success, output)

    return results


def get_python_files(specific_files: Optional[List[str]] = None) -> List[Path]:
    """Get list of Python files to check."""
    if specific_files:
        return [Path(f) for f in specific_files if Path(f).exists()]

    # Automatically discover all Python files in the project
    python_files = []

    # Get the project root (where this script is located)
    project_root = Path(__file__).parent

    # Directories to scan
    scan_dirs = ["src", "tests", "."]

    # Directories to exclude
    exclude_dirs = {
        ".venv",
        "__pycache__",
        ".git",
        "build",
        "dist",
        ".pytest_cache",
        "htmlcov",
        ".mypy_cache",
        ".ruff_cache",
    }

    for scan_dir in scan_dirs:
        scan_path = project_root / scan_dir
        if not scan_path.exists():
            continue

        if scan_dir == ".":
            # For root directory, only include .py files directly in root
            for file in scan_path.glob("*.py"):
                if file.is_file() and file.name != "__pycache__":
                    python_files.append(file)
        else:
            # For other directories, scan recursively
            for file in scan_path.rglob("*.py"):
                # Check if any parent directory should be excluded
                if not any(excluded in file.parts for excluded in exclude_dirs):
                    python_files.append(file)

    # Remove duplicates and sort
    python_files = sorted(set(python_files))

    return python_files


def main():
    """Check Python files in the project."""
    import argparse

    parser = argparse.ArgumentParser(description="Run code quality checks")
    parser.add_argument(
        "files", nargs="*", help="Specific files to check (default: all project files)"
    )
    parser.add_argument("--fix", action="store_true", help="Auto-fix formatting issues")
    parser.add_argument(
        "--no-pylint", action="store_true", help="Skip pylint (it's slow)"
    )

    args = parser.parse_args()

    python_files = get_python_files(args.files)

    if not python_files:
        print("No Python files found to check")
        return 1

    all_passed = True

    # Run checks with or without auto-fix
    mode = "🔧 Auto-fixing and checking" if args.fix else "🔍 Checking"
    print(f"{mode} Python files...")

    for file_path in python_files:
        print(f"\n{'Fixing' if args.fix else 'Checking'} {file_path}...")
        results = check_file(file_path, auto_fix=args.fix)

        # Skip pylint if requested
        if args.no_pylint and "pylint" in results:
            del results["pylint"]

        for tool, (success, output) in results.items():
            if not success:
                all_passed = False
                print(f"  ❌ {tool}: FAILED")
                # Only show first few lines of output to avoid clutter
                lines = output.strip().split("\n")
                for line in lines[:5]:
                    print(f"     {line}")
                if len(lines) > 5:
                    print(f"     ... and {len(lines)-5} more lines")
            else:
                print(f"  ✅ {tool}: PASSED")

    print("\n" + "=" * 50)
    if all_passed:
        print("✅ All checks passed!")
    else:
        print("❌ Some checks failed. Run with --fix to auto-fix formatting issues.")

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
