import sys
import requests
from . import colors as c
from .config import get_token, get_api_url


def _require_token() -> str:
    token = get_token()
    if not token:
        print(c.yellow("Run `hypersensei login` first."))
        sys.exit(1)
    return token


def _headers() -> dict:
    return {"Authorization": f"Bearer {_require_token()}"}


def _base() -> str:
    return get_api_url().rstrip("/")


def friendly_error(response: requests.Response) -> str:
    """Extract a clean, human-readable error string from an HTTP response."""
    code = response.status_code
    try:
        body = response.json()
        detail = body.get("detail", "")
        if isinstance(detail, str) and detail:
            return detail
        if isinstance(detail, list):
            # FastAPI/Pydantic validation error list: [{type, loc, msg, ...}, ...]
            msgs = []
            for item in detail:
                if isinstance(item, dict):
                    m = item.get("msg", "").strip()
                    if m:
                        # Capitalise first letter for a natural sentence feel
                        msgs.append(m[0].upper() + m[1:])
            if msgs:
                return "  ".join(msgs)
    except Exception:
        pass
    return f"Something went wrong (HTTP {code})."


def _handle_http_error(e: requests.HTTPError):
    msg = friendly_error(e.response)
    print(c.red(f"Error: {msg}"))
    sys.exit(1)


def _handle_connection_error():
    print(c.red(f"Cannot reach {get_api_url()} — check your connection."))
    sys.exit(1)


def get(path: str) -> dict:
    try:
        r = requests.get(_base() + path, headers=_headers(), timeout=30)
        r.raise_for_status()
        return r.json()
    except requests.HTTPError as e:
        _handle_http_error(e)
    except requests.ConnectionError:
        _handle_connection_error()


def post(path: str, body: dict) -> dict:
    try:
        r = requests.post(_base() + path, json=body, headers=_headers(), timeout=90)
        r.raise_for_status()
        return r.json()
    except requests.HTTPError as e:
        _handle_http_error(e)
    except requests.ConnectionError:
        _handle_connection_error()
