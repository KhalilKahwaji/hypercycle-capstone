import json
import os
from pathlib import Path

CONFIG_DIR = Path.home() / ".hypersensei"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_API_URL = os.getenv(
    "HYPERSENSEI_API_URL",
    "https://hypercycle-capstone-production.up.railway.app",
)


def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except Exception:
            pass
    return {}


def save_config(data: dict):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(data, indent=2))


def get_token():
    return load_config().get("token")


def get_api_url() -> str:
    return load_config().get("api_url", DEFAULT_API_URL)
