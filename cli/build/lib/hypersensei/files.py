import fnmatch
import os
from pathlib import Path
from typing import Tuple

MAX_CHARS = 12000

SKIP_DIRS = {
    ".git", "node_modules", "venv", ".venv", "__pycache__",
    "dist", "build", ".next", ".idea", ".vscode", ".pytest_cache", "env",
}

SKIP_FILENAMES = {
    "package-lock.json", "yarn.lock", "poetry.lock", "Pipfile.lock",
}

SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
    ".pdf", ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".class", ".pyc", ".pyo",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".bin", ".dat", ".db", ".sqlite", ".sqlite3",
}


def _load_gitignore_patterns(root: Path) -> list:
    gi = root / ".gitignore"
    if not gi.exists():
        return []
    patterns = []
    for line in gi.read_text(errors="replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            patterns.append(line)
    return patterns


def _matches_gitignore(rel: str, name: str, patterns: list) -> bool:
    rel_posix = rel.replace("\\", "/")
    for pat in patterns:
        if fnmatch.fnmatch(name, pat):
            return True
        if fnmatch.fnmatch(rel_posix, pat):
            return True
        # directory patterns (ending in /) match any path component
        if pat.endswith("/"):
            dirname = pat.rstrip("/")
            if any(part == dirname for part in rel_posix.split("/")):
                return True
    return False


def gather_project_text(root: str = ".") -> Tuple[str, int, bool]:
    root_path = Path(root).resolve()
    patterns = _load_gitignore_patterns(root_path)
    chunks = []
    file_count = 0

    for dirpath, dirnames, filenames in os.walk(root_path):
        current_rel = str(Path(dirpath).relative_to(root_path))

        # Prune unwanted directories in-place so os.walk skips them
        dirnames[:] = [
            d for d in sorted(dirnames)
            if d not in SKIP_DIRS
            and not _matches_gitignore(
                str(Path(current_rel, d)) if current_rel != "." else d,
                d,
                patterns,
            )
        ]

        for filename in sorted(filenames):
            filepath = Path(dirpath) / filename
            rel = str(filepath.relative_to(root_path))

            # Skip .env files
            if filename == ".env" or filename.startswith(".env."):
                continue
            if filename in SKIP_FILENAMES:
                continue
            if filepath.suffix.lower() in SKIP_EXTENSIONS:
                continue
            if _matches_gitignore(rel, filename, patterns):
                continue

            try:
                content = filepath.read_text(encoding="utf-8", errors="strict")
            except (UnicodeDecodeError, PermissionError, OSError):
                continue  # binary or unreadable — skip silently

            chunks.append(f"=== {rel} ===\n{content}\n")
            file_count += 1

    combined = "\n".join(chunks)
    if len(combined) > MAX_CHARS:
        return combined[:MAX_CHARS], file_count, True
    return combined, file_count, False
