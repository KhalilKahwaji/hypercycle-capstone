"""
GitHub repository reader — requires a user OAuth token.
File ignore rules mirror cli/hypersensei/files.py for consistency.
"""

import base64
import fnmatch
import json
import urllib.error
import urllib.request
from typing import List, Tuple

MAX_CHARS = 12_000

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

_NOT_CONNECTED = "Connect your GitHub account on the Profile page first."


class GitHubRepoError(Exception):
    """User-visible error. Callers should convert this to an HTTP 400 with str(e)."""


def _make_headers(user_token: str) -> dict:
    return {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "HyperCycle/1.0",
        "Authorization": f"Bearer {user_token}",
    }


def _gh_get(url: str, user_token: str):
    req = urllib.request.Request(url, headers=_make_headers(user_token))
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise GitHubRepoError(
                "Repository not found. Make sure the URL is correct and the repo "
                "is accessible by your connected GitHub account."
            )
        if e.code == 401:
            raise GitHubRepoError(
                "GitHub authentication failed. Reconnect your GitHub account on the Profile page."
            )
        if e.code in (403, 429):
            raise GitHubRepoError(
                "GitHub API rate limit reached. Try again later."
            )
        raise GitHubRepoError(f"GitHub API error (HTTP {e.code}). Please try again.")
    except urllib.error.URLError as e:
        raise GitHubRepoError(f"Network error connecting to GitHub: {e.reason}")
    except GitHubRepoError:
        raise
    except Exception:
        raise GitHubRepoError("Unexpected error fetching from GitHub. Please try again.")


def _parse_gitignore(content: str) -> List[str]:
    return [
        line.strip()
        for line in content.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def _gitignore_match(path: str, name: str, patterns: List[str]) -> bool:
    posix = path.replace("\\", "/")
    for pat in patterns:
        if fnmatch.fnmatch(name, pat):
            return True
        if fnmatch.fnmatch(posix, pat):
            return True
        if pat.endswith("/"):
            d = pat.rstrip("/")
            if any(part == d for part in posix.split("/")):
                return True
    return False


def _should_skip(path: str, patterns: List[str]) -> bool:
    name = path.split("/")[-1]
    ext = __import__("os").path.splitext(name)[1].lower()
    if name == ".env" or name.startswith(".env."):
        return True
    if name in SKIP_FILENAMES:
        return True
    if ext in SKIP_EXTENSIONS:
        return True
    return _gitignore_match(path, name, patterns)


def validate_repo(owner: str, repo: str, user_token: str = "") -> None:
    """
    Verify the repo is accessible using the user's OAuth token.
    Raises GitHubRepoError if not connected or repo inaccessible.
    """
    if not user_token:
        raise GitHubRepoError(_NOT_CONNECTED)
    meta = _gh_get(f"https://api.github.com/repos/{owner}/{repo}", user_token)
    if not isinstance(meta, dict):
        raise GitHubRepoError("Unexpected response from GitHub. Please try again.")


def fetch_repo_text(
    owner: str,
    repo: str,
    subfolder: str = "",
    user_token: str = "",
) -> Tuple[str, int, bool]:
    """
    Fetch text content from a GitHub repository using the user's OAuth token.
    Supports both public and private repos the user has access to.

    Returns (text, file_count, truncated).
    Raises GitHubRepoError on all user-visible errors.
    """
    if not user_token:
        raise GitHubRepoError(_NOT_CONNECTED)

    meta = _gh_get(f"https://api.github.com/repos/{owner}/{repo}", user_token)
    if not isinstance(meta, dict):
        raise GitHubRepoError("Unexpected response from GitHub. Please try again.")

    default_branch = meta.get("default_branch", "main")

    tree_data = _gh_get(
        f"https://api.github.com/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1",
        user_token,
    )
    if not isinstance(tree_data, dict) or "tree" not in tree_data:
        raise GitHubRepoError(
            "Could not read the repository file tree. The repository may be empty."
        )

    tree = tree_data["tree"]
    if not tree:
        raise GitHubRepoError("Repository is empty.")

    # Load .gitignore patterns if present
    gitignore_patterns: List[str] = []
    for item in tree:
        if item.get("path") == ".gitignore" and item.get("type") == "blob":
            try:
                gi = _gh_get(
                    f"https://api.github.com/repos/{owner}/{repo}/contents/.gitignore"
                    f"?ref={default_branch}",
                    user_token,
                )
                if isinstance(gi, dict) and gi.get("encoding") == "base64":
                    raw = base64.b64decode(gi["content"].replace("\n", "")).decode(
                        "utf-8", errors="ignore"
                    )
                    gitignore_patterns = _parse_gitignore(raw)
            except Exception:
                pass
            break

    prefix = subfolder.strip("/") + "/" if subfolder.strip("/") else ""

    candidates = []
    for item in tree:
        if item.get("type") != "blob":
            continue
        path = item.get("path", "")
        if prefix and not path.startswith(prefix):
            continue
        parts = path.split("/")
        if any(p in SKIP_DIRS for p in parts[:-1]):
            continue
        if _should_skip(path, gitignore_patterns):
            continue
        candidates.append((path, item.get("url", "")))

    if not candidates:
        where = f" under '{subfolder}'" if subfolder else ""
        raise GitHubRepoError(
            f"No readable text files found in the repository{where}. "
            "Make sure you've pushed your code."
        )

    chunks: List[str] = []
    file_count = 0
    total_chars = 0

    for path, blob_url in candidates:
        if total_chars >= MAX_CHARS:
            return "\n".join(chunks), file_count, True

        if not blob_url:
            continue
        try:
            blob = _gh_get(blob_url, user_token)
        except Exception:
            continue

        if not isinstance(blob, dict):
            continue

        encoding = blob.get("encoding", "")
        raw_content = blob.get("content", "")

        if encoding == "base64":
            try:
                text = base64.b64decode(raw_content.replace("\n", "")).decode(
                    "utf-8", errors="ignore"
                )
            except Exception:
                continue
        else:
            text = raw_content

        if not text.strip():
            continue

        chunk = f"=== {path} ===\n{text}\n"
        remaining = MAX_CHARS - total_chars
        if len(chunk) > remaining:
            chunks.append(chunk[:remaining])
            file_count += 1
            return "\n".join(chunks), file_count, True

        chunks.append(chunk)
        file_count += 1
        total_chars += len(chunk)

    if not chunks:
        raise GitHubRepoError(
            "No readable text files found in the repository. "
            "Make sure you've pushed your code."
        )

    return "\n".join(chunks), file_count, False
