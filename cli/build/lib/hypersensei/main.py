import argparse
import getpass
import sys

import requests

from . import colors as c
from .api import friendly_error
from .config import load_config, save_config, get_api_url, DEFAULT_API_URL
from . import api as hapi
from .files import gather_project_text


# ---------------------------------------------------------------------------
# banner
# ---------------------------------------------------------------------------
def _print_banner():
    if not sys.stdout.isatty():
        return
    ORANGE = "\033[38;2;255;136;36m"
    RST    = "\033[0m"
    print(ORANGE + """\
          ●●●●●●●●●●●●●●●●●●●●●●●●●●
      ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
●●●●●●●●●●●          ●●●●●●●    ●●●●●●●●●●●●●●●●
●●●●●●●●●●●           ●●●●●          ●●●●●●●●●●●
●●●●●●●●●●●            ●●●           ●●●●●●●●●●●
●●●●●●●●●●●      ●     ●●     ●●     ●●●●●●●●●●●
●●●●●●●●●●●      ●●     ●    ●●●     ●●●●●●●●●●●
●●●●●●●●●●●      ●●●        ●●●●     ●●●●●●●●●●●
●●●●●●●●●●●      ●●●●      ●●●●●     ●●●●●●●●●●●
●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●  ●●●●●●●●●●●
●●●●●●●●●●●●●●●●   ●●●●● ●●●●●   ●●●●●●●●●●●●●●●
 ●●●●●●●●●●●●●●  ●●●●      ●●●●●  ●  ●●●●●●●●●●●
  ●●●●●●●●●●●●●  ●●   ●●●●●   ●●  ● ●●●●●●●●●●●
                 ●●   ●●●●●   ●●   ●●●●●●●●
                 ●●  ●● ●●●  ● ●
                 ●    ●●●     ●
               ●      ●●●      ●
                      ●●●
                       ●""" + RST)
    print()


# ---------------------------------------------------------------------------
# login
# ---------------------------------------------------------------------------
def cmd_login(args):
    api_url = (args.api_url or DEFAULT_API_URL).rstrip("/")
    print(f"Connecting to {c.cyan(api_url)}")
    username_or_email = input("Username or email: ").strip()
    # getpass captures the full password without any truncation
    password = getpass.getpass("Password: ")

    try:
        r = requests.post(
            f"{api_url}/users/login",
            json={"username_or_email": username_or_email, "password": password},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
    except requests.HTTPError as e:
        print(c.red(f"Error: {friendly_error(e.response)}"))
        sys.exit(1)
    except requests.ConnectionError:
        print(c.red(f"Cannot reach {api_url} — check the URL and your connection."))
        sys.exit(1)

    cfg = load_config()
    cfg["api_url"] = api_url
    cfg["token"] = data["access_token"]
    save_config(cfg)
    print(c.green(f"Logged in as {data['user']['username']}."))


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------
def cmd_status(args):
    progress = hapi.get("/progress/me")
    days_data = hapi.get("/programs/me/days")
    days = days_data.get("days", [])

    completed = progress.get("completed_days", 0)
    total = progress.get("total_days", 0)
    pct = progress.get("percentage", 0)

    bar_filled = int(pct / 5)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)

    print()
    print(c.bold(f"Progress: {completed}/{total} days ({pct}%)"))
    print(f"  {c.yellow(bar)}")
    print()

    for d in days:
        num = str(d["day_number"]).rjust(2)
        title = d["title"]
        if d["is_completed"]:
            marker = c.green("[done]  ")
            row = f"  Day {num}  {marker}  {c.dim(title)}"
        elif d["is_unlocked"]:
            marker = c.yellow("[active]")
            row = f"  Day {num}  {marker}  {c.bold(title)}"
        else:
            marker = f"[locked]"
            row = f"  Day {num}  {marker}  {title}"
        print(row)
    print()


# ---------------------------------------------------------------------------
# task
# ---------------------------------------------------------------------------
def cmd_task(args):
    days_data = hapi.get("/programs/me/days")
    days = days_data.get("days", [])
    current = next((d for d in days if d["is_unlocked"] and not d["is_completed"]), None)

    if not current:
        print(c.yellow("No active day. Check your progress with `hypersensei status`."))
        sys.exit(0)

    print()
    print(c.bold(c.yellow(f"=== Day {current['day_number']}: {current['title']} ===")))
    print()

    def _field(label, value):
        if value:
            print(c.cyan(f"{label}:"))
            for line in value.strip().splitlines():
                print(f"  {line}")
            print()

    _field("Objective", current.get("objective"))
    _field("Task", current.get("task_description"))
    _field("Expected output", current.get("expected_output"))
    _field("Evaluation criteria", current.get("evaluation_criteria"))

    topics = [t for t in (current.get("research_topics") or "").split("\n") if t.strip()]
    if topics:
        print(c.cyan("Research topics:"))
        for t in topics:
            print(f"  - {t}")
        print()


# ---------------------------------------------------------------------------
# help
# ---------------------------------------------------------------------------
def cmd_help(args):
    question = args.question
    if not question:
        question = input(c.cyan("What do you need help with? ")).strip()
        if not question:
            print(c.red("No question provided."))
            sys.exit(1)

    print(c.dim("Asking HyperSensei…"))
    data = hapi.post("/cli/ask", {"question": question})

    prog = data.get("progress", {})
    completed = prog.get("completed_days", "?")
    total = prog.get("total_days", "?")
    print(f"\n{c.dim(f'Progress: {completed}/{total} days')}\n")
    print(data.get("answer", "No answer returned."))
    print()


# ---------------------------------------------------------------------------
# check (dry run)
# ---------------------------------------------------------------------------
def cmd_check(args):
    print(c.dim("Gathering project files…"))
    text, file_count, truncated = gather_project_text(".")
    note = f"  {file_count} files collected"
    if truncated:
        note += c.yellow(" (truncated to 12 000 chars)")
    print(note)

    print(c.dim("Running evaluation (dry run — nothing will be stored)…"))
    data = hapi.post("/cli/check", {"project_text": text, "dry_run": True})
    _print_evaluation(data.get("evaluation", {}), data.get("day_number", "?"), dry_run=True)


# ---------------------------------------------------------------------------
# push (real submission)
# ---------------------------------------------------------------------------
def cmd_push(args):
    print(c.dim("Gathering project files…"))
    text, file_count, truncated = gather_project_text(".")
    note = f"  {file_count} files collected"
    if truncated:
        note += c.yellow(" (truncated to 12 000 chars)")
    print(note)

    answer = input(c.yellow("\nSubmit your work for evaluation? This counts. [y/N] ")).strip().lower()
    if answer != "y":
        print("Aborted.")
        sys.exit(0)

    print(c.dim("Submitting…"))
    data = hapi.post("/cli/check", {"project_text": text, "dry_run": False})
    ev = data.get("evaluation", {})
    _print_evaluation(ev, data.get("day_number", "?"), dry_run=False)
    if ev.get("passed"):
        print(c.green("Next day unlocked — run `hypersensei status` to see your progress."))
        print()


# ---------------------------------------------------------------------------
# shared evaluation printer
# ---------------------------------------------------------------------------
def _print_evaluation(ev: dict, day_number, dry_run: bool):
    score = ev.get("score", "?")
    passed = ev.get("passed", False)
    status_label = "PASS" if passed else "FAIL"
    score_str = c.green(f"{score}/10") if passed else c.red(f"{score}/10")
    status_str = c.green(f"[{status_label}]") if passed else c.red(f"[{status_label}]")

    divider = "─" * 52
    print(f"\n{divider}")
    if dry_run:
        print(c.dim("  DRY RUN — nothing was submitted or stored."))
    print(f"  Evaluated against {c.bold(f'Day {day_number}')}")
    print(divider)
    print(f"  Score: {score_str}   {status_str}")

    summary = ev.get("summary", "")
    if summary:
        print(f"\n  {summary}")

    def _section(label, items, color_fn, bullet):
        if items:
            print(f"\n{color_fn(label + ':')} ")
            for item in items:
                print(f"  {bullet} {item}")

    _section("Strengths",      ev.get("strengths", []),      c.green,  "✓")
    _section("Issues",         ev.get("issues", []),          c.yellow, "✗")
    _section("Required fixes", ev.get("required_fixes", []), c.red,    "!")
    _section("Next steps",     ev.get("next_steps", []),     c.cyan,   "→")
    print()


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        prog="hypersensei",
        description="HyperSensei — your AI coding bootcamp CLI",
    )
    sub = parser.add_subparsers(dest="command", metavar="<command>")
    sub.required = True

    p_login = sub.add_parser("login", help="Log in to the AI Buddy API")
    p_login.add_argument("--api-url", default=None, help="Override API base URL")
    p_login.set_defaults(func=cmd_login)

    p_status = sub.add_parser("status", help="Show progress and day list")
    p_status.set_defaults(func=cmd_status)

    p_task = sub.add_parser("task", help="Print your current day's task spec")
    p_task.set_defaults(func=cmd_task)

    p_help = sub.add_parser("help", help="Ask HyperSensei a question")
    p_help.add_argument("question", nargs="?", default=None, help="Your question (quote it)")
    p_help.set_defaults(func=cmd_help)

    p_check = sub.add_parser("check", help="Dry-run evaluation of your project (nothing stored)")
    p_check.set_defaults(func=cmd_check)

    p_push = sub.add_parser("push", help="Submit your project for real evaluation")
    p_push.set_defaults(func=cmd_push)

    args = parser.parse_args()
    _print_banner()
    args.func(args)


if __name__ == "__main__":
    main()
